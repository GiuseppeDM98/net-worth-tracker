'use client';

import { useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { authenticatedFetch } from '@/lib/utils/authFetch';
import { describeWriteError, userFacingError } from '@/lib/utils/dialogNarrative';
import { queryKeys } from '@/lib/query/queryKeys';
import { adoptStreamMessageId, applyProposalToMessages } from '@/lib/utils/assistantStreamBuffer';
import { routeToSelection } from '@/lib/utils/assistantRoute';
import {
  AssistantMessage,
  AssistantMode,
  AssistantMonthContextBundle,
  AssistantPreferences,
  AssistantProposalState,
  AssistantRegisterSummary,
  AssistantRouteOverride,
  AssistantStreamEvent,
  AssistantThreadDetail,
} from '@/types/assistant';

function parseSseEvent(rawChunk: string): AssistantStreamEvent | null {
  const trimmedChunk = rawChunk.trim();
  if (!trimmedChunk.startsWith('data:')) {
    return null;
  }

  const payload = trimmedChunk.slice('data:'.length).trim();
  if (!payload || payload === '[DONE]') {
    return null;
  }

  return JSON.parse(payload) as AssistantStreamEvent;
}

// The helpers below are module-level so `submit`'s try block holds no conditional expression and
// no `throw`: keeps the hook compilable by the React Compiler.

/**
 * The request of every send (2026-11-12): `mode: 'auto'`, so the server's router reads intent,
 * period and web search — the page has no mode, month, year or chat context to send. A `route`
 * skips the router (the chooser's «Rileggi», or a reading the turn inherits with `routeCarried`).
 */
function buildStreamRequestBody(args: {
  ownerId: string;
  promptToSend: string;
  selectedThreadId: string | undefined;
  preferences: AssistantPreferences | undefined;
  route: AssistantRouteOverride | undefined;
  routeCarried: boolean | undefined;
}): string {
  const { ownerId, promptToSend, selectedThreadId, preferences, route, routeCarried } = args;
  return JSON.stringify({
    userId: ownerId,
    mode: 'auto',
    prompt: promptToSend,
    threadId: selectedThreadId,
    preferences,
    ...(route ? { route } : {}),
    ...(route && routeCarried ? { routeCarried: true } : {}),
  });
}

/**
 * The mode a turn's two placeholders are born with, until its `route` event: the passed route's,
 * else the last answer's — so while the router reads (up to 4 s) the page never slides to a free
 * question and back (2026-11-12). `'chat'` on a conversation with no answer yet.
 */
function bornMode(messages: AssistantMessage[], route: AssistantRouteOverride | undefined): AssistantMode {
  if (route) return routeToSelection(route).mode;
  return messages.findLast((message) => message.role === 'assistant')?.mode ?? 'chat';
}

/** How a send is read: a route the client chose or inherited, else the router's. */
export interface AssistantSubmitOptions {
  route?: AssistantRouteOverride;
  /** Only beside `route`: inherited from the previous turn (a question card's answer, «Rigenera»). */
  routeCarried?: boolean;
}

/** The response's body stream, or the route's own error as a user-facing failure. */
async function openStreamBody(response: Response): Promise<NonNullable<Response['body']>> {
  if (!response.ok || !response.body) {
    const payload = await response.json().catch(() => null);
    throw userFacingError(payload?.error ?? 'Impossibile avviare lo stream dell\'assistente');
  }
  return response.body;
}

/** Reads the SSE body to its end, handing each parsed event to `onEvent` in order; a throw from it stops the read. */
async function forEachSseEvent(
  body: NonNullable<Response['body']>,
  onEvent: (event: AssistantStreamEvent) => void,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split('\n\n');
    buffer = events.pop() ?? '';

    for (const rawEvent of events) {
      const event = parseSseEvent(rawEvent);
      if (!event) continue;
      onEvent(event);
    }
  }
}

async function invalidateAssistantThread(
  queryClient: QueryClient,
  ownerId: string,
  resolvedThreadId: string | undefined,
): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.assistant.threads(ownerId) }),
    resolvedThreadId
      ? queryClient.invalidateQueries({ queryKey: queryKeys.assistant.thread(resolvedThreadId) })
      : Promise.resolve(),
  ]);
}

interface UseAssistantStreamingArgs {
  ownerId: string | undefined;
  selectedThreadId: string | undefined;
  /** The SSE meta event resolves/creates the thread mid-stream — the page must adopt it. */
  onThreadIdResolved: (threadId: string) => void;
  /** Current composer draft; consumed (cleared via onDraftConsumed) once the request starts. */
  draft: string;
  onDraftConsumed: () => void;
  /** Persisted messages of the selected thread (React Query), if any. */
  threadMessages: AssistantMessage[] | undefined;
  preferences: AssistantPreferences | undefined;
}

/**
 * The assistant's SSE streaming engine, extracted VERBATIM from
 * AssistantPageClient (a surface reorganisation, not a logic change).
 * Owns the streaming buffer, the stream lifecycle flags, and the
 * context bundle the server pushes before text starts.
 *
 * NOTE: streamingMessages is NEVER cleared in a useEffect([selectedThreadId]) —
 * the meta event sets the thread id mid-stream and such an effect would wipe the
 * buffer before text arrives (doc/guide/assistente.md § Assistant). Callers reset explicitly
 * via resetStream() on thread switches.
 */
export function useAssistantStreaming({
  ownerId,
  selectedThreadId,
  onThreadIdResolved,
  draft,
  onDraftConsumed,
  threadMessages,
  preferences,
}: UseAssistantStreamingArgs) {
  const queryClient = useQueryClient();

  const [streamingMessages, setStreamingMessages] = useState<AssistantMessage[]>([]);
  // Tracks the ID of the assistant message slot that is currently receiving tokens.
  // Used by AssistantStreamingResponse to switch between plain-text and markdown rendering.
  const [streamingMessageId, setStreamingMessageId] = useState<string | undefined>();
  const [isStreaming, setIsStreaming] = useState(false);
  const [isInterrupted, setIsInterrupted] = useState(false);
  // Mirrors the server's SSE status event (searching | writing | saving). Drives the
  // distinct "Sto cercando sul web…" badge instead of the generic slow-response nudge.
  const [streamStatus, setStreamStatus] = useState<'searching' | 'writing' | 'saving' | null>(null);
  // Context bundle is populated from the SSE 'context' event sent before text streaming,
  // or (when idle) from the period-preview fetch the page performs.
  const [contextBundle, setContextBundle] = useState<AssistantMonthContextBundle | null>(null);
  // Registra: what the server read for the register block (the SSE 'register' event), shown by the
  // companion tile in place of the browser's own summary. Cleared at each submit and thread switch.
  const [registerSummary, setRegisterSummary] = useState<AssistantRegisterSummary | null>(null);

  // The last successfully submitted prompt and the route «Rigenera» re-sends with it: the route
  // passed, or the reading the turn's `route` event brought (never a fallback, which the router
  // reads again). A ref avoids stale closure issues.
  const lastSentRef = useRef<{ prompt: string; route?: AssistantRouteOverride }>({ prompt: '' });
  // Holds the AbortController for the in-flight SSE request so the stop button
  // can cancel the stream without navigating away.
  const abortControllerRef = useRef<AbortController | null>(null);

  // Derive messages to render: streaming buffer takes priority over persisted thread
  // messages. When selectedThreadId is undefined (new conversation state) this returns []
  // even if React Query still holds stale cached data from the previously selected thread.
  const renderedMessages = useMemo(() => {
    if (streamingMessages.length > 0) {
      return streamingMessages;
    }
    if (!selectedThreadId) {
      return [];
    }
    return threadMessages ?? [];
  }, [streamingMessages, selectedThreadId, threadMessages]);

  /**
   * Core streaming submit. `promptOverride` sends a text that is not the draft (a follow-up, an
   * answer, «Rileggi»); `options.route` skips the router with a reading chosen or inherited.
   */
  const submit = async (promptOverride?: string, options: AssistantSubmitOptions = {}) => {
    const promptToSend = (promptOverride ?? draft).trim();
    const { route, routeCarried } = options;

    if (!ownerId || !promptToSend || isStreaming) {
      return;
    }

    // Tracks the resolved thread ID throughout this stream (may differ from the
    // selectedThreadId closure value when a new thread is created mid-stream via the meta event).
    let resolvedThreadId = selectedThreadId;

    const userMessageId = `local-user-${Date.now()}`;

    // Allocate the assistant slot ID upfront so AssistantStreamingResponse can
    // identify which message is still streaming and render it as plain text.
    const assistantMessageId = `local-assistant-${Date.now()}`;

    // Create a fresh AbortController for this request; store it so stop can cancel it
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    setIsStreaming(true);
    setIsInterrupted(false);
    setStreamStatus(null);
    setContextBundle(null);
    setRegisterSummary(null);
    setStreamingMessageId(assistantMessageId);
    // Use renderedMessages (not the thread detail) as the base so that
    // messages from the previous stream are preserved even if React Query hasn't
    // yet reloaded the thread after the last invalidation. The buffer itself when it holds
    // messages: a submit from an older render — the question cards' «Rispondi» records the
    // answers, then sends (2026-11) — would otherwise drop the outcomes recorded since.
    // With an empty buffer, the cached thread: where `recordProposal` writes for a thread opened
    // from the list.
    setStreamingMessages((current) => {
      const base = current.length > 0
        ? current
        : selectedThreadId
          ? (queryClient.getQueryData<AssistantThreadDetail>(queryKeys.assistant.thread(selectedThreadId))?.messages ?? renderedMessages)
          : renderedMessages;
      const mode = bornMode(base, route);
      const createdAt = new Date();
      return [
        ...base,
        { id: userMessageId, threadId: selectedThreadId ?? 'pending', userId: ownerId, role: 'user', content: promptToSend, createdAt, mode, monthContext: null },
        {
          id: assistantMessageId,
          threadId: selectedThreadId ?? 'pending',
          userId: ownerId,
          role: 'assistant',
          content: '',
          createdAt,
          mode,
          monthContext: null,
          webSearchUsed: false,
        },
      ];
    });

    try {
      const response = await authenticatedFetch('/api/ai/assistant/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: abortController.signal,
        body: buildStreamRequestBody({ ownerId, promptToSend, selectedThreadId, preferences, route, routeCarried }),
      });

      const body = await openStreamBody(response);

      // Save prompt and route for retry before clearing draft — retry needs the original text
      lastSentRef.current = { prompt: promptToSend, route };
      // Clear draft only after the request succeeds to avoid losing text on network errors
      onDraftConsumed();

      // The read loop is module-level (`forEachSseEvent`): a loop inside the try would keep the hook
      // from compiling under the React Compiler. Each event is handled here, in order.
      await forEachSseEvent(body, (event) => {
        if (event.type === 'meta' && event.threadId) {
          onThreadIdResolved(event.threadId);
          resolvedThreadId = event.threadId;
        }

        // How the router read the message (right after `meta`): the turn takes the reading's mode —
        // the cards and the companion follow it — and the answer keeps the reading for its line.
        // «Rigenera» carries it, unless it is a fallback: then the router reads again.
        if (event.type === 'route') {
          const { mode } = routeToSelection(event.reading.route);
          setStreamingMessages((current) =>
            current.map((message) =>
              message.id === assistantMessageId
                ? { ...message, mode, routeReading: event.reading }
                : message.id === userMessageId ? { ...message, mode } : message
            )
          );
          if (event.reading.source !== 'fallback') {
            const { intent, period, webSearch } = event.reading.route;
            lastSentRef.current = { ...lastSentRef.current, route: { intent, period, webSearch } };
          }
        }

        // Populate the context panel from the server-built bundle.
        // This fires before text streaming starts.
        if (event.type === 'context') {
          setContextBundle(event.bundle);
        }

        if (event.type === 'register') {
          setRegisterSummary(event.summary);
        }

        // Surface the server's progress phase (e.g. web search) in the header badge.
        if (event.type === 'status') {
          setStreamStatus(event.status);
        }

        if (event.type === 'text') {
          setStreamingMessages((current) =>
            current.map((message) =>
              message.id === assistantMessageId
                ? { ...message, content: message.content + event.text }
                : message
            )
          );
        }

        if (event.type === 'done') {
          // Mark stream complete: clears streamingMessageId so the message
          // transitions from plain-text to ReactMarkdown rendering.
          setStreamingMessageId(undefined);
          // The message takes the id of the document the server wrote: a card's outcome is saved
          // on that document (lib/utils/assistantStreamBuffer.ts).
          setStreamingMessages((current) =>
            adoptStreamMessageId(
              current.map((message) =>
                message.id === assistantMessageId
                  ? { ...message, webSearchUsed: event.webSearchUsed }
                  : message
              ),
              assistantMessageId,
              event,
            )
          );
        }

        if (event.type === 'error') {
          setIsInterrupted(true);
          throw userFacingError(event.error);
        }
      });

      if (ownerId) {
        await invalidateAssistantThread(queryClient, ownerId, resolvedThreadId);
      }
    } catch (error) {
      // AbortError is a user-initiated stop — keep partial text visible, no toast
      if ((error as Error).name !== 'AbortError') {
        toast.error(describeWriteError(error));
      }
      setIsInterrupted(true);
      setStreamingMessageId(undefined);
    }
    // After the try/catch rather than in a `finally`: keeps the hook compilable by the React Compiler.
    abortControllerRef.current = null;
    setIsStreaming(false);
    setStreamStatus(null);
  };

  // Aborts the in-flight SSE stream. The catch block in submit detects
  // AbortError and skips the toast, leaving partial text visible.
  const stop = () => {
    abortControllerRef.current?.abort();
  };

  // «Rigenera»: the same prompt, the reading it re-sends carried (`routeCarried`, 2026-11-12).
  const retry = () => {
    const { prompt, route } = lastSentRef.current;
    if (!isStreaming && prompt) {
      submit(prompt, route ? { route, routeCarried: true } : {});
    }
  };

  /**
   * Clears the streaming buffer and flags on an EXPLICIT thread switch (new
   * thread, thread selection). Never wired to an effect — see the hook comment.
   */
  const resetStream = () => {
    setStreamingMessages([]);
    setStreamingMessageId(undefined);
    setIsInterrupted(false);
    setRegisterSummary(null);
  };

  /**
   * Records the outcome of a card (a row written, a proposal ignored) where the session reads the
   * message from: the stream buffer, which wins until a thread switch, AND the cached thread
   * detail, which is what a thread opened from the list shows. Done before the PATCH that saves
   * it, so the buttons never come back in this session whatever the request does.
   */
  const recordProposal = (messageId: string, threadId: string, key: string, state: Omit<AssistantProposalState, 'at'>) => {
    const stamped: AssistantProposalState = { ...state, at: new Date() };
    setStreamingMessages((current) => applyProposalToMessages(current, messageId, key, stamped));
    queryClient.setQueryData<AssistantThreadDetail>(queryKeys.assistant.thread(threadId), (detail) =>
      detail ? { ...detail, messages: applyProposalToMessages(detail.messages, messageId, key, stamped) } : detail,
    );
  };

  return {
    streamingMessages,
    renderedMessages,
    streamingMessageId,
    isStreaming,
    isInterrupted,
    streamStatus,
    contextBundle,
    setContextBundle,
    registerSummary,
    recordProposal,
    submit,
    stop,
    retry,
    resetStream,
  };
}
