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
  getAssistantThread,
  isAssistantStoreError,
  updateAssistantThreadMetadata,
} from '@/lib/server/assistant/store';
import {
  getDefaultAssistantPreferences,
  resolveAssistantWebSearchPolicy,
} from '@/lib/server/assistant/webSearchPolicy';
import { AssistantStreamEvent, AssistantStreamRequest } from '@/types/assistant';

function encodeAssistantEvent(event: AssistantStreamEvent): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`);
}

export async function POST(request: NextRequest) {
  try {
    const decodedToken = await requireFirebaseAuth(request);

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(
        {
          error: 'Servizio AI non configurato. Aggiungi ANTHROPIC_API_KEY per abilitare l’assistente.',
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

          const result = await streamAssistantResponse({
            mode: body.mode,
            prompt: body.prompt.trim(),
            month: body.month ?? null,
            preferences,
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
                error?.message ?? 'Errore durante la generazione della risposta dell’assistente',
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
      { error: 'Impossibile avviare lo stream dell’assistente' },
      { status: 500 }
    );
  }
}
