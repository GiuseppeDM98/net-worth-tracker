import { NextRequest, NextResponse } from 'next/server';
import {
  assertSameUser,
  getApiAuthErrorResponse,
  requireFirebaseAuth,
} from '@/lib/server/apiAuth';
import { streamAssistantResponse } from '@/lib/server/assistant/anthropicStream';
import {
  appendAssistantMessage,
  buildThreadTitleFromPrompt,
  createAssistantThread,
  getAssistantMemoryDocument,
  getAssistantThread,
  isAssistantStoreError,
  updateAssistantMemoryDocument,
  updateAssistantThreadMetadata,
} from '@/lib/server/assistant/store';
import {
  dedupeMemoryItems,
  extractMemoryCandidates,
} from '@/lib/server/assistant/memoryExtraction';
import {
  getDefaultAssistantPreferences,
  resolveAssistantWebSearchPolicy,
} from '@/lib/server/assistant/webSearchPolicy';
import { buildAssistantMonthContext } from '@/lib/services/assistantMonthContextService';
import { AssistantStreamEvent, AssistantStreamRequest } from '@/types/assistant';

/**
 * Extracts memory candidates from a completed exchange and persists new items.
 * Runs fire-and-forget after the stream closes — errors are logged but never
 * propagated so they cannot affect the user-facing chat experience.
 *
 * Anthropic client is instantiated lazily inside this function so module-level
 * initialization does not fail in test environments where ANTHROPIC_API_KEY is absent.
 */
async function extractAndSaveMemory(
  userId: string,
  threadId: string,
  messageId: string,
  userMessage: string,
  assistantMessage: string
): Promise<void> {
  try {
    const memoryDoc = await getAssistantMemoryDocument(userId);

    // Respect the user's memoryEnabled toggle — never extract when disabled
    if (!memoryDoc.preferences.memoryEnabled) return;

    // Lazy import: instantiating Anthropic at module level would fail in test
    // environments where ANTHROPIC_API_KEY is absent. The API key guard earlier
    // in the POST handler ensures this path is only reached in production.
    const Anthropic = (await import('@anthropic-ai/sdk')).default;
    const anthropicClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

    const candidates = await extractMemoryCandidates(userMessage, assistantMessage, anthropicClient);
    if (candidates.length === 0) return;

    const newCandidates = dedupeMemoryItems(candidates, memoryDoc.items);
    if (newCandidates.length === 0) return;

    // Save each new item sequentially to keep Firestore writes simple
    for (const candidate of newCandidates) {
      const itemId = `mem_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      await updateAssistantMemoryDocument(userId, {
        item: {
          id: itemId,
          category: candidate.category,
          text: candidate.text,
          sourceThreadId: threadId,
          sourceMessageId: messageId,
          status: 'active',
        },
      });
    }
  } catch (error) {
    // Memory extraction is non-fatal — log server-side only
    console.error('[memory extraction] Failed for user', userId, error);
  }
}

function encodeAssistantEvent(event: AssistantStreamEvent): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`);
}

export async function POST(request: NextRequest) {
  try {
    const decodedToken = await requireFirebaseAuth(request);

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(
        {
          error: "Servizio AI non configurato. Aggiungi ANTHROPIC_API_KEY per abilitare l'assistente.",
        },
        { status: 500 }
      );
    }

    const body = (await request.json()) as AssistantStreamRequest;
    assertSameUser(decodedToken, body.userId);

    if (!body.prompt?.trim() || !body.mode) {
      return NextResponse.json(
        { error: 'Sono richiesti userId, mode e prompt' },
        { status: 400 }
      );
    }

    const preferences = {
      ...getDefaultAssistantPreferences(),
      ...body.preferences,
    };
    const enableWebSearch = resolveAssistantWebSearchPolicy(
      body.mode,
      body.prompt,
      preferences
    );

    // Build the numeric context bundle for both modes when a month is selected.
    // Chat mode now receives the same data as month_analysis — the prompt builder
    // controls how it's used (free-form vs. structured analysis).
    // We never trust client-supplied numbers — month is only used as a Firestore key.
    const contextBundle = body.month
      ? await buildAssistantMonthContext(body.userId, body.month)
      : null;

    // Load active memory items to inject into the prompt.
    // Errors are non-fatal: if memory fetch fails we proceed without items
    // rather than blocking the chat. The user experience degrades gracefully.
    const memoryDoc = await getAssistantMemoryDocument(body.userId).catch(() => null);
    const activeMemoryItems = (memoryDoc?.items ?? []).filter((i) => i.status === 'active');

    let existingThread = body.threadId
      ? await getAssistantThread(body.threadId, body.userId)
      : null;

    const thread =
      existingThread ??
      (await createAssistantThread({
        userId: body.userId,
        mode: body.mode,
        pinnedMonth: body.month ?? null,
        title: buildThreadTitleFromPrompt(body.prompt, body.mode),
      }));

    if (!existingThread) {
      existingThread = thread;
    }

    const userMessage = await appendAssistantMessage(thread.id, {
      userId: body.userId,
      role: 'user',
      content: body.prompt.trim(),
      mode: body.mode,
      monthContext: body.month ?? null,
      webSearchUsed: false,
    });

    const stream = new ReadableStream({
      async start(controller) {
        let assistantText = '';

        try {
          controller.enqueue(
            encodeAssistantEvent({
              type: 'meta',
              threadId: thread.id,
              title: existingThread?.title ?? thread.title,
            })
          );

          // Include the bundle in the SSE meta so the client can render the
          // numeric panel without a separate API round-trip
          if (contextBundle) {
            controller.enqueue(
              encodeAssistantEvent({
                type: 'context',
                bundle: contextBundle,
              })
            );
          }

          const result = await streamAssistantResponse({
            mode: body.mode,
            prompt: body.prompt.trim(),
            contextBundle,
            month: body.month ?? null,
            preferences,
            memoryItems: activeMemoryItems,
            enableWebSearch,
            onStatus: (status) => {
              controller.enqueue(encodeAssistantEvent({ type: 'status', status }));
            },
            onText: (text) => {
              assistantText += text;
              controller.enqueue(encodeAssistantEvent({ type: 'text', text }));
            },
          });

          const assistantMessage = await appendAssistantMessage(thread.id, {
            userId: body.userId,
            role: 'assistant',
            content: result.text,
            mode: body.mode,
            monthContext: body.month ?? null,
            webSearchUsed: result.webSearchUsed,
          });

          // Fire-and-forget memory extraction — must not block the stream close
          // or surface errors to the client. Gating on memoryEnabled is inside.
          extractAndSaveMemory(
            body.userId,
            thread.id,
            assistantMessage.id,
            body.prompt.trim(),
            result.text
          ).catch((err) => console.error('[stream] extractAndSaveMemory uncaught:', err));

          await updateAssistantThreadMetadata(thread.id, {
            title: existingThread?.lastMessagePreview
              ? existingThread.title
              : buildThreadTitleFromPrompt(body.prompt, body.mode),
            lastMessagePreview: assistantText || userMessage.content,
            mode: body.mode,
            pinnedMonth: body.month ?? existingThread?.pinnedMonth ?? null,
          });

          controller.enqueue(
            encodeAssistantEvent({
              type: 'done',
              threadId: thread.id,
              messageId: assistantMessage.id,
              webSearchUsed: result.webSearchUsed,
            })
          );
          controller.close();
        } catch (error: any) {
          console.error('[API /ai/assistant/stream] Stream error:', error);
          controller.enqueue(
            encodeAssistantEvent({
              type: 'error',
              error:
                error?.message ?? "Errore durante la generazione della risposta dell'assistente",
              retryable: Boolean(error?.retryable),
            })
          );
          controller.close();
        }
      },
    });

    return new NextResponse(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (error) {
    const authErrorResponse = getApiAuthErrorResponse(error);
    if (authErrorResponse) {
      return authErrorResponse;
    }

    if (isAssistantStoreError(error)) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    console.error('[API /ai/assistant/stream] POST error:', error);
    return NextResponse.json(
      { error: "Impossibile avviare lo stream dell'assistente" },
      { status: 500 }
    );
  }
}
