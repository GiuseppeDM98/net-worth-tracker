'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { authenticatedFetch } from '@/lib/utils/authFetch';
import { describeWriteError, userFacingError } from '@/lib/utils/dialogNarrative';
import { queryKeys } from '@/lib/query/queryKeys';
import {
  AssistantChatContextType,
  AssistantMessage,
  AssistantMode,
  AssistantMonthContextBundle,
  AssistantMonthSelectorValue,
  AssistantPreferences,
  AssistantStreamEvent,
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
  mode: AssistantMode;
  selectedMonth: AssistantMonthSelectorValue;
  selectedYear: number;
  chatContextType: AssistantChatContextType;
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
 * buffer before text arrives (AGENTS.md → Assistant). Callers reset explicitly
 * via resetStream() on thread switches.
 */
export function useAssistantStreaming({
  ownerId,
  selectedThreadId,
  onThreadIdResolved,
  draft,
  onDraftConsumed,
  threadMessages,
  mode,
  selectedMonth,
  selectedYear,
  chatContextType,
  preferences,
}: UseAssistantStreamingArgs) {
  const queryClient = useQueryClient();

  const [streamingMessages, setStreamingMessages] = useState<AssistantMessage[]>([]);
  // Tracks the ID of the assistant message slot that is currently receiving tokens.
  // Used by AssistantStreamingResponse to switch between plain-text and markdown rendering.
  const [streamingMessageId, setStreamingMessageId] = useState<string | undefined>();
  const [isStreaming, setIsStreaming] = useState(false);
  const [isInterrupted, setIsInterrupted] = useState(false);
  // Shows a "taking longer than expected" nudge after SLOW_RESPONSE_MS with no text received.
  // Cleared as soon as the first token arrives or streaming ends.
  const [isSlowResponse, setIsSlowResponse] = useState(false);
  // Mirrors the server's SSE status event (searching | writing | saving). Drives the
  // distinct "Sto cercando sul web…" badge instead of the generic slow-response nudge.
  const [streamStatus, setStreamStatus] = useState<'searching' | 'writing' | 'saving' | null>(null);
  // Context bundle is populated from the SSE 'context' event sent before text streaming,
  // or (when idle) from the period-preview fetch the page performs.
  const [contextBundle, setContextBundle] = useState<AssistantMonthContextBundle | null>(null);

  // Stores the last successfully submitted prompt so retry can re-send it
  // after draft is cleared. Using a ref avoids stale closure issues.
  const lastSentPromptRef = useRef('');
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

  // Slow-response timeout: shows a gentle nudge after 15 s with no text received.
  // Timer starts when isStreaming flips true and clears when it flips false.
  // isSlowResponse resets on every new submission (handled in submit).
  useEffect(() => {
    if (!isStreaming) return;
    const SLOW_RESPONSE_MS = 15_000;
    const timer = setTimeout(() => setIsSlowResponse(true), SLOW_RESPONSE_MS);
    return () => clearTimeout(timer);
  }, [isStreaming]);

  /**
   * Core streaming submit.
   * Accepts optional overrides for prompt and mode so that chip clicks can supply
   * both values synchronously (React state updates are async; waiting for them
   * would require a follow-up effect or ref which is harder to reason about).
   */
  const submit = async (promptOverride?: string, modeOverride?: AssistantMode) => {
    const promptToSend = (promptOverride ?? draft).trim();
    const modeToSend = modeOverride ?? mode;

    if (!ownerId || !promptToSend || isStreaming) {
      return;
    }

    // Tracks the resolved thread ID throughout this stream (may differ from the
    // selectedThreadId closure value when a new thread is created mid-stream via the meta event).
    let resolvedThreadId = selectedThreadId;

    const userMessage: AssistantMessage = {
      id: `local-user-${Date.now()}`,
      threadId: selectedThreadId ?? 'pending',
      userId: ownerId,
      role: 'user',
      content: promptToSend,
      createdAt: new Date(),
      mode: modeToSend,
      monthContext: selectedMonth,
    };

    // Allocate the assistant slot ID upfront so AssistantStreamingResponse can
    // identify which message is still streaming and render it as plain text.
    const assistantMessageId = `local-assistant-${Date.now()}`;

    // Create a fresh AbortController for this request; store it so stop can cancel it
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    setIsStreaming(true);
    setIsInterrupted(false);
    setIsSlowResponse(false);
    setStreamStatus(null);
    setContextBundle(null);
    setStreamingMessageId(assistantMessageId);
    // Use renderedMessages (not the thread detail) as the base so that
    // messages from the previous stream are preserved even if React Query hasn't
    // yet reloaded the thread after the last invalidation.
    setStreamingMessages([
      ...renderedMessages,
      userMessage,
      {
        id: assistantMessageId,
        threadId: selectedThreadId ?? 'pending',
        userId: ownerId,
        role: 'assistant',
        content: '',
        createdAt: new Date(),
        mode: modeToSend,
        monthContext: selectedMonth,
        webSearchUsed: false,
      },
    ]);

    try {
      const response = await authenticatedFetch('/api/ai/assistant/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: abortController.signal,
        body: JSON.stringify({
          userId: ownerId,
          mode: modeToSend,
          prompt: promptToSend,
          threadId: selectedThreadId,
          // Include period selectors based on mode
          ...(modeToSend === 'month_analysis' ? { month: selectedMonth } : {}),
          ...(modeToSend === 'year_analysis' ? { year: selectedYear } : {}),
          // Libera (chat) optionally attaches a period context selected next to the axis.
          ...(modeToSend === 'chat'
            ? {
                chatContext: chatContextType,
                ...(chatContextType === 'month' ? { month: selectedMonth } : {}),
                ...(chatContextType === 'year' ? { year: selectedYear } : {}),
              }
            : {}),
          preferences,
        }),
      });

      if (!response.ok || !response.body) {
        const payload = await response.json().catch(() => null);
        throw userFacingError(payload?.error ?? 'Impossibile avviare lo stream dell\'assistente');
      }

      // Save prompt for retry before clearing draft — retry needs the original text
      lastSentPromptRef.current = promptToSend;
      // Clear draft only after the request succeeds to avoid losing text on network errors
      onDraftConsumed();

      const reader = response.body.getReader();
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

          if (event.type === 'meta' && event.threadId) {
            onThreadIdResolved(event.threadId);
            resolvedThreadId = event.threadId;
          }

          // Populate the context panel from the server-built bundle.
          // This fires before text streaming starts.
          if (event.type === 'context') {
            setContextBundle(event.bundle);
          }

          // Surface the server's progress phase (e.g. web search) in the header badge.
          if (event.type === 'status') {
            setStreamStatus(event.status);
          }

          if (event.type === 'text') {
            // First token received — dismiss the slow-response nudge
            setIsSlowResponse(false);
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
            setStreamingMessages((current) =>
              current.map((message) =>
                message.id === assistantMessageId
                  ? { ...message, webSearchUsed: event.webSearchUsed }
                  : message
              )
            );
          }

          if (event.type === 'error') {
            setIsInterrupted(true);
            throw userFacingError(event.error);
          }
        }
      }

      if (ownerId) {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: queryKeys.assistant.threads(ownerId) }),
          resolvedThreadId
            ? queryClient.invalidateQueries({ queryKey: queryKeys.assistant.thread(resolvedThreadId) })
            : Promise.resolve(),
        ]);
      }
    } catch (error) {
      // AbortError is a user-initiated stop — keep partial text visible, no toast
      if ((error as Error).name !== 'AbortError') {
        toast.error(describeWriteError(error));
      }
      setIsInterrupted(true);
      setStreamingMessageId(undefined);
    } finally {
      abortControllerRef.current = null;
      setIsStreaming(false);
      setIsSlowResponse(false);
      setStreamStatus(null);
    }
  };

  // Aborts the in-flight SSE stream. The catch block in submit detects
  // AbortError and skips the toast, leaving partial text visible.
  const stop = () => {
    abortControllerRef.current?.abort();
  };

  const retry = () => {
    if (!isStreaming && lastSentPromptRef.current) {
      submit(lastSentPromptRef.current);
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
  };

  return {
    streamingMessages,
    renderedMessages,
    streamingMessageId,
    isStreaming,
    isInterrupted,
    isSlowResponse,
    streamStatus,
    contextBundle,
    setContextBundle,
    submit,
    stop,
    retry,
    resetStream,
  };
}
