import { NextRequest, NextResponse } from 'next/server';
import {
  assertCanAccessAccount,
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
  getAssistantThreadDetail,
  isAssistantStoreError,
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
import {
  buildAssistantMonthContext,
  buildAssistantYearContext,
  buildAssistantYtdContext,
  buildAssistantHistoryContext,
} from '@/lib/services/assistantMonthContextService';
import {
  AssistantMemoryItem,
  AssistantMonthContextBundle,
  AssistantStreamEvent,
  AssistantStreamRequest,
} from '@/types/assistant';
import { evaluateActiveGoals } from '@/lib/server/assistant/goalEvaluationService';
import { adminDb } from '@/lib/firebase/admin';
import { checkRateLimit } from '@/lib/server/rateLimit';

const STREAM_RATE_LIMIT_MAX = 30;
const STREAM_RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour

/**
 * Extracts memory candidates from a completed exchange, persists the new items
 * and re-evaluates every active structured goal.
 *
 * Runs fire-and-forget after the stream closes — errors are logged but never
 * propagated so they cannot affect the user-facing chat experience.
 *
 * The goal evaluation is UNCONDITIONAL: it no longer depends on the
 * request having built a context bundle, and it no longer uses that bundle even
 * when there is one. `evaluateActiveGoals` builds the current month itself —
 * asking about March 2023 must not measure the user's goals against March 2023.
 * The items extracted here are handed to it unwritten so the whole turn still
 * costs ONE Firestore transaction.
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
    const newCandidates = dedupeMemoryItems(candidates, memoryDoc.items);

    const now = new Date();
    const pendingItems: AssistantMemoryItem[] = newCandidates.map((candidate) => ({
      id: `mem_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      userId,
      category: candidate.category,
      text: candidate.text,
      // Already structured by the extraction tool — nothing is parsed from the text.
      structuredGoal: candidate.structuredGoal,
      sourceThreadId: threadId,
      sourceMessageId: messageId,
      createdAt: now,
      updatedAt: now,
      status: 'active' as const,
    }));

    await evaluateActiveGoals(userId, { pendingItems, now });
  } catch (error) {
    // Memory extraction is non-fatal — log server-side only
    console.error('[memory extraction] Failed for user', userId, error);
  }
}

/**
 * Fetch the year from which cashflow history tracking starts for a user.
 * Defaults to 5 years ago when not configured.
 */
async function fetchHistoryStartYear(userId: string): Promise<number> {
  const settingsSnap = await adminDb
    .collection('assetAllocationTargets')
    .doc(userId)
    .get();
  return settingsSnap.data()?.cashflowHistoryStartYear ?? new Date().getFullYear() - 5;
}

function encodeAssistantEvent(event: AssistantStreamEvent): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`);
}

export async function POST(request: NextRequest) {
  try {
    const decodedToken = await requireFirebaseAuth(request);

    if (!process.env.ANTHROPIC_API_KEY) {
      // 503, not 500: this is a known, expected unavailability (missing config), the
      // same condition the page itself detects server-side to render the "Servizio AI
      // non configurato" EmptyState — one error surface, not a 500 here and an
      // EmptyState there for the same root cause.
      return NextResponse.json(
        {
          error: "Servizio AI non configurato. Aggiungi ANTHROPIC_API_KEY per abilitare l'assistente.",
        },
        { status: 503 }
      );
    }

    const body = (await request.json()) as AssistantStreamRequest;
    await assertCanAccessAccount(decodedToken, body.userId);

    const rateLimitResult = checkRateLimit(
      `${body.userId}:stream`,
      STREAM_RATE_LIMIT_MAX,
      STREAM_RATE_LIMIT_WINDOW_MS
    );
    if (!rateLimitResult.allowed) {
      return NextResponse.json(
        { error: 'Hai raggiunto il limite di richieste AI. Riprova piu tardi.' },
        {
          status: 429,
          headers: { 'Retry-After': String(rateLimitResult.retryAfterSeconds) },
        }
      );
    }

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

    // Structured server-side log: route, mode, web-search decision.
    // Never logs prompt content or financial data — only metadata safe to write to server logs.
    console.info('[assistant/stream] request', {
      route: '/api/ai/assistant/stream',
      mode: body.mode,
      webSearch: enableWebSearch,
      hasMonth: Boolean(body.month),
      hasYear: Boolean(body.year),
      hasThreadId: Boolean(body.threadId),
    });

    // Build the numeric context bundle based on mode.
    // For structured analysis modes the server always rebuilds from Firestore —
    // client-supplied numbers are never trusted; only the period selector is used.
    // For chat mode, chatContext determines which builder to use (or none).

    const includeDummy = preferences.includeDummySnapshots ?? false;

    let contextBundle: AssistantMonthContextBundle | null = null;
    if (body.mode === 'year_analysis' && body.year) {
      contextBundle = await buildAssistantYearContext(body.userId, body.year, includeDummy);
    } else if (body.mode === 'ytd_analysis') {
      contextBundle = await buildAssistantYtdContext(body.userId, includeDummy);
    } else if (body.mode === 'history_analysis') {
      contextBundle = await buildAssistantHistoryContext(body.userId, await fetchHistoryStartYear(body.userId), includeDummy);
    } else if (body.mode === 'chat') {
      // Chat mode: build context only when chatContext is set and not 'none'
      if (body.chatContext === 'year' && body.year) {
        contextBundle = await buildAssistantYearContext(body.userId, body.year, includeDummy);
      } else if (body.chatContext === 'ytd') {
        contextBundle = await buildAssistantYtdContext(body.userId, includeDummy);
      } else if (body.chatContext === 'history') {
        contextBundle = await buildAssistantHistoryContext(body.userId, await fetchHistoryStartYear(body.userId), includeDummy);
      } else if (body.chatContext === 'month' && body.month) {
        contextBundle = await buildAssistantMonthContext(body.userId, body.month, includeDummy);
      } else if (!body.chatContext && body.month) {
        // Backwards-compat: old clients that send month without chatContext
        contextBundle = await buildAssistantMonthContext(body.userId, body.month, includeDummy);
      }
    } else if (body.month) {
      // month_analysis: always use month context
      contextBundle = await buildAssistantMonthContext(body.userId, body.month, includeDummy);
    }

    // Load active memory items to inject into the prompt.
    // Errors are non-fatal: if memory fetch fails we proceed without items
    // rather than blocking the chat. The user experience degrades gracefully.
    const memoryDoc = await getAssistantMemoryDocument(body.userId).catch(() => null);
    const activeMemoryItems = (memoryDoc?.items ?? []).filter((i) => i.status === 'active');

    let existingThread = body.threadId
      ? await getAssistantThread(body.threadId, body.userId)
      : null;

    // Load conversation history BEFORE appending the new user message so the
    // new message is not included. Loaded only for existing threads — a brand
    // new thread has no prior exchange to inject.
    const conversationHistory = existingThread
      ? (await getAssistantThreadDetail(existingThread.id, body.userId)).messages
      : [];

    const thread =
      existingThread ??
      (await createAssistantThread({
        userId: body.userId,
        mode: body.mode,
        pinnedMonth: body.month ?? null,
        pinnedYear: body.year ?? null,
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
            conversationHistory,
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
            pinnedYear: body.year ?? existingThread?.pinnedYear ?? null,
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
          const retryable = Boolean(error?.retryable);
          // Log with retryable flag so on-call can distinguish overload spikes from bugs
          console.error('[assistant/stream] stream error', {
            retryable,
            status: error?.status,
            message: error?.message,
          });
          controller.enqueue(
            encodeAssistantEvent({
              type: 'error',
              // The SDK's own message is a LOG line (English, provider-named) and is written
              // above; what crosses to the reader is the product's sentence, and a retryable
              // failure says so rather than describing an implementation they never chose.
              error: retryable
                ? "Il servizio AI è momentaneamente sovraccarico. Riprova fra qualche istante."
                : "Errore durante la generazione della risposta dell'assistente.",
              retryable,
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
