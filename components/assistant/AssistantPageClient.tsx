'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  Bot,
  Brain,
  CalendarDays,
  Check,
  ChevronDown,
  Globe,
  HelpCircle,
  Loader2,
  Lock,
  MessageSquare,
  MessagesSquare,
  Plus,
  Settings2,
  Sparkles,
  Trash2,
  WandSparkles,
  X,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { it } from 'date-fns/locale';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { AssistantComposer } from '@/components/assistant/AssistantComposer';
import { AssistantPageSkeleton } from '@/components/assistant/AssistantPageSkeleton';
import { AssistantContextCard, AssistantContextPill } from '@/components/assistant/AssistantContextCard';
import { AssistantMemoryPanel } from '@/components/assistant/AssistantMemoryPanel';
import { AssistantPromptChips } from '@/components/assistant/AssistantPromptChips';
import { AssistantStreamingResponse } from '@/components/assistant/AssistantStreamingResponse';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { EmptyState } from '@/components/ui/EmptyState';
import { useAuth } from '@/contexts/AuthContext';
import { useAssistantMemory, useUpdateAssistantMemory } from '@/lib/hooks/useAssistantMemory';
import { useAssistantPeriodContext } from '@/lib/hooks/useAssistantMonthContext';
import { useAssistantThread, useAssistantThreads, useDeleteAssistantThread } from '@/lib/hooks/useAssistantThreads';
import { assistantPromptChips } from '@/lib/constants/assistantPrompts';
import { authenticatedFetch } from '@/lib/utils/authFetch';
import { getItalyMonthYear } from '@/lib/utils/dateHelpers';
import { cn } from '@/lib/utils';
import {
  AssistantChatContextType,
  AssistantMessage,
  AssistantMode,
  AssistantMonthContextBundle,
  AssistantMonthSelectorValue,
  AssistantPromptChip,
  AssistantStreamEvent,
  AssistantThread,
} from '@/types/assistant';
import { queryKeys } from '@/lib/query/queryKeys';
import { useQueryClient } from '@tanstack/react-query';
import { MONTH_NAMES } from '@/lib/constants/months';

interface AssistantPageClientProps {
  assistantConfigured: boolean;
}

/**
 * Builds the list of selectable months (current month + 3 years back).
 * Uses Italy timezone for the current month so the default selection is always correct.
 */
function buildMonthOptions(): AssistantMonthSelectorValue[] {
  const { year: currentYear, month: currentMonth } = getItalyMonthYear(new Date());
  const options: AssistantMonthSelectorValue[] = [];

  for (let year = currentYear; year >= currentYear - 3; year -= 1) {
    for (let month = 12; month >= 1; month -= 1) {
      if (year === currentYear && month > currentMonth) {
        continue;
      }
      options.push({ year, month });
    }
  }

  return options;
}

/**
 * Builds the list of selectable years for year_analysis (current year + 4 years back).
 */
function buildYearOptions(): number[] {
  const { year: currentYear } = getItalyMonthYear(new Date());
  const options: number[] = [];
  for (let y = currentYear; y >= currentYear - 4; y -= 1) {
    options.push(y);
  }
  return options;
}

/**
 * Returns a human-readable badge label for a thread's mode.
 */
function getModeBadgeLabel(mode: AssistantMode): string {
  if (mode === 'month_analysis') return 'Mese';
  if (mode === 'year_analysis') return 'Anno';
  if (mode === 'ytd_analysis') return 'YTD';
  if (mode === 'history_analysis') return 'Storico';
  return 'Chat';
}

/**
 * Returns a human-readable label for the current active period in the conversation header.
 */
function getActivePeriodLabel(
  mode: AssistantMode,
  selectedMonth: AssistantMonthSelectorValue,
  selectedYear: number
): string {
  if (mode === 'month_analysis') return `Analisi · ${MONTH_NAMES[selectedMonth.month - 1]} ${selectedMonth.year}`;
  if (mode === 'year_analysis') return `Analisi annuale · ${selectedYear}`;
  if (mode === 'ytd_analysis') return `YTD · ${selectedMonth.year}`;
  if (mode === 'history_analysis') return 'Storico totale';
  return `Chat · ${MONTH_NAMES[selectedMonth.month - 1]} ${selectedMonth.year}`;
}

/**
 * Strips markdown syntax so thread list previews read as plain text.
 * Covers headings, bold/italic, inline code, horizontal rules, and list markers.
 */
function stripMarkdown(text: string): string {
  return text
    .replace(/#{1,6}\s+/g, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/`(.+?)`/g, '$1')
    .replace(/^---+$/gm, '')
    .replace(/^[-*+]\s+/gm, '')
    .replace(/^\d+\.\s+/gm, '')
    .replace(/\n+/g, ' ')
    .trim();
}

/**
 * Returns a relative label (e.g. "3 ore fa") for dates within the past 7 days,
 * or a DD/MM/YYYY absolute date otherwise. Keeps thread list readable at a glance.
 */
function formatThreadDate(date: Date): string {
  const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;
  if (Date.now() - date.getTime() < ONE_WEEK_MS) {
    return formatDistanceToNow(date, { addSuffix: true, locale: it });
  }
  return date.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

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

interface ThreadListProps {
  threads: AssistantThread[];
  loadingThreads: boolean;
  selectedThreadId: string | undefined;
  isStreaming: boolean;
  isDeletingId: string | undefined;
  onSelect: (thread: AssistantThread) => void;
  onDelete: (threadId: string) => void;
  onNewThread: () => void;
}

/**
 * Shared thread list rendered both in the desktop right panel and the mobile Sheet drawer.
 * Keeps selection, date formatting, and delete behaviour in one place to avoid drift.
 *
 * Delete is a 2-click flow: first click arms inline confirmation ("Elimina?"),
 * second click confirms. Auto-disarms after 3 seconds to prevent accidental deletion.
 * The delete control lives in the normal flex flow (not absolute) so it never
 * overlaps the mode badge in the top-right corner.
 */
function ThreadList({
  threads,
  loadingThreads,
  selectedThreadId,
  isStreaming,
  isDeletingId,
  onSelect,
  onDelete,
  onNewThread,
}: ThreadListProps) {
  const [pendingDeleteId, setPendingDeleteId] = useState<string | undefined>(undefined);
  const pendingDeleteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const armDelete = (threadId: string) => {
    setPendingDeleteId(threadId);
    pendingDeleteTimerRef.current = setTimeout(() => {
      setPendingDeleteId(undefined);
    }, 3000);
  };

  const disarmDelete = () => {
    if (pendingDeleteTimerRef.current) clearTimeout(pendingDeleteTimerRef.current);
    setPendingDeleteId(undefined);
  };

  const confirmDelete = (threadId: string) => {
    if (pendingDeleteTimerRef.current) clearTimeout(pendingDeleteTimerRef.current);
    setPendingDeleteId(undefined);
    onDelete(threadId);
  };

  if (loadingThreads) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Caricamento conversazioni…
      </div>
    );
  }

  if (threads.length === 0) {
    return (
      <EmptyState
        icon={<Bot className="h-8 w-8" />}
        title="Nessuna conversazione"
        description="Il primo messaggio crea automaticamente una nuova conversazione."
        className="py-6"
      />
    );
  }

  return (
    <div className="space-y-1.5">
      {threads.map((thread) => {
        const isActive = selectedThreadId === thread.id;
        const isDeleting = isDeletingId === thread.id;
        const isPendingDelete = pendingDeleteId === thread.id;

        return (
          <div
            key={thread.id}
            className={cn(
              'group flex w-full items-stretch rounded-xl border text-left transition-colors',
              isActive ? 'border-primary/30 bg-primary/5' : 'border-border hover:bg-muted/40'
            )}
          >
            {/* Main select area — takes all available width */}
            <button
              onClick={() => onSelect(thread)}
              disabled={isStreaming}
              className="min-w-0 flex-1 px-3 py-2.5 text-left"
            >
              <div className="flex items-start gap-2">
                <p className="flex-1 text-sm font-medium leading-snug text-foreground line-clamp-1">
                  {thread.title}
                </p>
                <Badge variant="outline" className="mt-px shrink-0 text-[10px] uppercase">
                  {getModeBadgeLabel(thread.mode)}
                </Badge>
              </div>
              <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                {thread.lastMessagePreview
                  ? stripMarkdown(thread.lastMessagePreview)
                  : 'Nessun messaggio ancora'}
              </p>
              <div className="mt-1.5 flex items-center gap-2">
                {thread.pinnedMonth && (
                  <span className="text-[10px] text-muted-foreground">
                    {MONTH_NAMES[thread.pinnedMonth.month - 1]} {thread.pinnedMonth.year}
                  </span>
                )}
                {thread.pinnedYear && (
                  <span className="text-[10px] text-muted-foreground">
                    {thread.pinnedYear}
                  </span>
                )}
                <span className="text-[10px] text-muted-foreground/70">
                  {formatThreadDate(thread.updatedAt)}
                </span>
              </div>
            </button>

            {/* Delete control — in normal flow at the right edge, never overlaps the badge.
                Shows on hover, stays visible while deleting or pending confirmation. */}
            <div className={cn(
              'flex shrink-0 items-start pt-2 pr-2 opacity-0 transition-opacity group-hover:opacity-100',
              (isDeleting || isPendingDelete) && 'opacity-100'
            )}>
              {isDeleting && (
                <div className="p-1">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                </div>
              )}

              {/* Inline confirmation: "Elimina?" + confirm/cancel */}
              {!isDeleting && isPendingDelete && (
                <div className="flex items-center gap-0.5">
                  <span className="text-[11px] text-destructive font-medium">Elimina?</span>
                  <button
                    onClick={(e) => { e.stopPropagation(); confirmDelete(thread.id); }}
                    disabled={isStreaming}
                    aria-label="Conferma eliminazione"
                    className="rounded-md p-1 text-destructive hover:bg-destructive/10"
                  >
                    <Check className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); disarmDelete(); }}
                    aria-label="Annulla eliminazione"
                    className="rounded-md p-1 text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}

              {/* Normal trash button — first click arms the confirmation */}
              {!isDeleting && !isPendingDelete && (
                <button
                  onClick={(e) => { e.stopPropagation(); armDelete(thread.id); }}
                  disabled={isStreaming}
                  aria-label="Elimina conversazione"
                  className="rounded-md p-1 text-muted-foreground/50 hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function AssistantPageClient({ assistantConfigured }: AssistantPageClientProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const prefersReducedMotion = useReducedMotion();
  const conversationEndRef = useRef<HTMLDivElement>(null);
  // Stores the last successfully submitted prompt so retry can re-send it
  // after draft is cleared. Using a ref avoids stale closure issues.
  const lastSentPromptRef = useRef('');
  // Holds the AbortController for the in-flight SSE request so the stop button
  // can cancel the stream without navigating away.
  const abortControllerRef = useRef<AbortController | null>(null);

  // Italy current month/year — stable for the session
  const { year: currentYear, month: currentMonth } = useMemo(() => getItalyMonthYear(new Date()), []);

  // Month and year options are stable for the session — computed once on mount
  const monthOptions = useMemo(() => buildMonthOptions(), []);
  const yearOptions = useMemo(() => buildYearOptions(), []);

  const [selectedThreadId, setSelectedThreadId] = useState<string>();
  const [draft, setDraft] = useState('');
  const [mode, setMode] = useState<AssistantMode>('month_analysis');
  const [selectedMonth, setSelectedMonth] = useState<AssistantMonthSelectorValue>(
    // Default to Italy current month; matches buildMonthOptions logic
    () => getItalyMonthYear(new Date())
  );
  const [selectedYear, setSelectedYear] = useState<number>(() => getItalyMonthYear(new Date()).year);
  const [chatContextType, setChatContextType] = useState<AssistantChatContextType>('none');

  const [streamingMessages, setStreamingMessages] = useState<AssistantMessage[]>([]);
  // Tracks the ID of the assistant message slot that is currently receiving tokens.
  // Used by AssistantStreamingResponse to switch between plain-text and markdown rendering.
  const [streamingMessageId, setStreamingMessageId] = useState<string | undefined>();
  const [isStreaming, setIsStreaming] = useState(false);
  const [isInterrupted, setIsInterrupted] = useState(false);
  // Shows a "taking longer than expected" nudge after SLOW_RESPONSE_MS with no text received.
  // Cleared as soon as the first token arrives or streaming ends.
  const [isSlowResponse, setIsSlowResponse] = useState(false);
  // Context bundle is populated from the SSE 'context' event sent before text streaming
  const [contextBundle, setContextBundle] = useState<AssistantMonthContextBundle | null>(null);
  // Memory panel starts open; user can collapse to reduce sidebar height when list grows long.
  const [isMemoryPanelOpen, setIsMemoryPanelOpen] = useState(true);
  // Controls the mobile threads Sheet — needed to close it programmatically after thread selection.
  const [isThreadSheetOpen, setIsThreadSheetOpen] = useState(false);
  // Controls the mobile memory Sheet — keeps the panel accessible without occupying scroll space
  const [isMemorySheetOpen, setIsMemorySheetOpen] = useState(false);
  // Guide section starts collapsed — it's supplementary, not the primary CTA
  const [isGuideOpen, setIsGuideOpen] = useState(false);

  const { data: threads = [], isLoading: loadingThreads, error: threadsError } = useAssistantThreads(user?.uid);
  const { data: threadDetail, isLoading: loadingThreadDetail, error: threadError } = useAssistantThread(
    selectedThreadId,
    user?.uid
  );
  const { data: memory, isLoading: loadingMemory, error: memoryError } = useAssistantMemory(user?.uid);
  const updateMemoryMutation = useUpdateAssistantMemory(user?.uid ?? '');
  const deleteThreadMutation = useDeleteAssistantThread(user?.uid ?? '');

  // Fetch the context bundle for existing analysis threads on open.
  // Enabled only when: thread is loaded, has a pinned period, no SSE bundle is active.
  // SSE bundle always takes priority over the fetched one.
  const pinnedMonth = threadDetail?.thread.pinnedMonth ?? null;
  const pinnedYear = threadDetail?.thread.pinnedYear ?? null;
  const threadMode = threadDetail?.thread.mode ?? mode;
  const shouldFetchContext =
    !!selectedThreadId &&
    streamingMessages.length === 0 &&
    contextBundle === null &&
    // Only fetch for analysis modes that have a pinned period
    (
      (threadMode === 'month_analysis' && pinnedMonth !== null) ||
      (threadMode === 'year_analysis' && pinnedYear !== null) ||
      threadMode === 'ytd_analysis' ||
      threadMode === 'history_analysis'
    );

  const {
    data: fetchedContextBundle,
    isLoading: loadingContextBundle,
  } = useAssistantPeriodContext(
    shouldFetchContext ? user?.uid : undefined,
    threadMode,
    pinnedMonth,
    pinnedYear,
    currentYear,
    // history start year: the hook fetches it server-side; pass 0 as placeholder key
    0,
    shouldFetchContext
  );

  // Populate the context panel from the fetched bundle when no SSE bundle is present.
  // SSE bundle (set via setContextBundle in the stream handler) always takes priority —
  // this effect only fires when contextBundle is still null.
  useEffect(() => {
    if (fetchedContextBundle && contextBundle === null) {
      setContextBundle(fetchedContextBundle);
    }
  }, [fetchedContextBundle]); // eslint-disable-line react-hooks/exhaustive-deps

  // Derive messages to render: streaming buffer takes priority over persisted thread messages.
  // When selectedThreadId is undefined (new conversation state) we return [] even if
  // React Query still holds stale cached data from the previously selected thread.
  // useMemo avoids the useEffect+setState anti-pattern for computed state.
  const renderedMessages = useMemo(() => {
    if (streamingMessages.length > 0) {
      return streamingMessages;
    }
    if (!selectedThreadId) {
      return [];
    }
    return threadDetail?.messages ?? [];
  }, [streamingMessages, selectedThreadId, threadDetail?.messages]);

  // Sync mode and period picker to the loaded thread so the UI stays coherent
  // with the conversation being shown. Runs when threadDetail resolves, but not
  // during streaming (streamingMessages.length > 0) to avoid disrupting active input.
  useEffect(() => {
    if (!threadDetail || streamingMessages.length > 0) {
      return;
    }
    setMode(threadDetail.thread.mode);
    if (threadDetail.thread.pinnedMonth) {
      setSelectedMonth(threadDetail.thread.pinnedMonth);
    }
    if (threadDetail.thread.pinnedYear) {
      setSelectedYear(threadDetail.thread.pinnedYear);
    }
  }, [threadDetail]); // eslint-disable-line react-hooks/exhaustive-deps

  // Scroll to the bottom when messages are available, but not while the thread
  // is still loading — scrolling to an empty area before content arrives feels jarring.
  // During streaming use instant scroll so new tokens stay visible without jank:
  // smooth scroll on every token triggers continuous CSS animation on slow devices.
  // Smooth scroll is reserved for the initial thread load (non-streaming) only.
  useEffect(() => {
    if (renderedMessages.length === 0) return;
    if (loadingThreadDetail && !isStreaming) return;
    const el = conversationEndRef.current;
    if (!el) return;
    if (isStreaming) {
      el.scrollIntoView({ behavior: 'instant' });
    } else {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  }, [renderedMessages, loadingThreadDetail, isStreaming]);

  // Slow-response timeout: shows a gentle nudge after 15 s with no text received.
  // Timer starts when isStreaming flips true and clears when it flips false.
  // isSlowResponse resets on every new submission (handled in handleStreamSubmit).
  useEffect(() => {
    if (!isStreaming) return;
    const SLOW_RESPONSE_MS = 15_000;
    const timer = setTimeout(() => setIsSlowResponse(true), SLOW_RESPONSE_MS);
    return () => clearTimeout(timer);
  }, [isStreaming]);

  // NOTE: we do NOT clear streamingMessages in a useEffect([selectedThreadId]).
  // The meta event sets selectedThreadId mid-stream; a useEffect dependency on it
  // would fire and wipe the streaming buffer before text arrives. See AGENTS.md.

  // CTA is disabled when month_analysis mode has no data available to analyse.
  // Derived with useMemo — no useEffect+setState needed.
  const isAnalysisBlocked = useMemo(
    () =>
      mode === 'month_analysis' &&
      contextBundle !== null &&
      !contextBundle.dataQuality.hasSnapshot &&
      !contextBundle.dataQuality.hasCashflowData,
    [mode, contextBundle]
  );

  const canSubmit = draft.trim().length > 0 && !isStreaming && !isAnalysisBlocked;

  /**
   * Auto-selects an existing thread matching the new mode + period when the user switches modes.
   * Called from handleModeChange so it only fires on explicit user action, never on page load.
   * Scans the already-loaded threads list — no extra fetch needed.
   */
  const autoSelectThreadForMode = (newMode: AssistantMode) => {
    let match: AssistantThread | undefined;

    if (newMode === 'month_analysis') {
      // Match: same mode + same pinned month as currently selected month
      match = threads.find(
        (t) =>
          t.mode === 'month_analysis' &&
          t.pinnedMonth?.year === selectedMonth.year &&
          t.pinnedMonth?.month === selectedMonth.month
      );
    } else if (newMode === 'year_analysis') {
      // Match: same mode + same pinned year as currently selected year
      match = threads.find(
        (t) => t.mode === 'year_analysis' && t.pinnedYear === selectedYear
      );
    } else if (newMode === 'ytd_analysis') {
      // Match: most recent ytd_analysis thread (only one meaningful per year)
      match = threads.find((t) => t.mode === 'ytd_analysis');
    } else if (newMode === 'history_analysis') {
      // Match: most recent history_analysis thread
      match = threads.find((t) => t.mode === 'history_analysis');
    }
    // chat mode: no auto-select — always starts fresh

    if (match) {
      setSelectedThreadId(match.id);
      setStreamingMessages([]);
      setStreamingMessageId(undefined);
      setIsInterrupted(false);
      setContextBundle(null);
      // Thread sync useEffect will update mode/month/year when threadDetail resolves
    }
  };

  const handleModeChange = (newMode: AssistantMode) => {
    setMode(newMode);
    autoSelectThreadForMode(newMode);
  };

  /**
   * Core streaming submit.
   * Accepts optional overrides for prompt and mode so that chip clicks can supply
   * both values synchronously (React state updates are async; waiting for them
   * would require a follow-up effect or ref which is harder to reason about).
   */
  const handleStreamSubmit = async (promptOverride?: string, modeOverride?: AssistantMode) => {
    const promptToSend = (promptOverride ?? draft).trim();
    const modeToSend = modeOverride ?? mode;

    if (!user?.uid || !promptToSend || isStreaming) {
      return;
    }

    // Tracks the resolved thread ID throughout this stream (may differ from the
    // selectedThreadId closure value when a new thread is created mid-stream via the meta event).
    // Using a local variable ensures the post-stream invalidation always uses the correct ID.
    let resolvedThreadId = selectedThreadId;

    const userMessage: AssistantMessage = {
      id: `local-user-${Date.now()}`,
      threadId: selectedThreadId ?? 'pending',
      userId: user.uid,
      role: 'user',
      content: promptToSend,
      createdAt: new Date(),
      mode: modeToSend,
      monthContext: selectedMonth,
    };

    // Allocate the assistant slot ID upfront so AssistantStreamingResponse can
    // identify which message is still streaming and render it as plain text.
    const assistantMessageId = `local-assistant-${Date.now()}`;

    // Create a fresh AbortController for this request; store it so handleStop can cancel it
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    setIsStreaming(true);
    setIsInterrupted(false);
    setIsSlowResponse(false);
    setContextBundle(null);
    setStreamingMessageId(assistantMessageId);
    // Use renderedMessages (not threadDetail?.messages) as the base so that
    // messages from the previous stream are preserved even if React Query hasn't
    // yet reloaded the thread after the last invalidation.
    setStreamingMessages([
      ...renderedMessages,
      userMessage,
      {
        id: assistantMessageId,
        threadId: selectedThreadId ?? 'pending',
        userId: user.uid,
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
          userId: user.uid,
          mode: modeToSend,
          prompt: promptToSend,
          threadId: selectedThreadId,
          // Include period selectors based on mode
          ...(modeToSend === 'month_analysis' ? { month: selectedMonth } : {}),
          ...(modeToSend === 'year_analysis' ? { year: selectedYear } : {}),
          ...(modeToSend === 'chat' ? {
            chatContext: chatContextType,
            ...(chatContextType === 'month' ? { month: selectedMonth } : {}),
            ...(chatContextType === 'year' ? { year: selectedYear } : {}),
          } : {}),
          preferences: memory?.preferences,
        }),
      });

      if (!response.ok || !response.body) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error ?? 'Impossibile avviare lo stream dell\'assistente');
      }

      // Save prompt for retry before clearing draft — retry needs the original text
      lastSentPromptRef.current = promptToSend;
      // Clear draft only after the request succeeds to avoid losing text on network errors
      setDraft('');

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
            setSelectedThreadId(event.threadId);
            resolvedThreadId = event.threadId;
          }

          // Populate the context panel from the server-built bundle.
          // This fires before text streaming starts.
          if (event.type === 'context') {
            setContextBundle(event.bundle);
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
            throw new Error(event.error);
          }
        }
      }

      if (user.uid) {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: queryKeys.assistant.threads(user.uid) }),
          resolvedThreadId
            ? queryClient.invalidateQueries({ queryKey: queryKeys.assistant.thread(resolvedThreadId) })
            : Promise.resolve(),
        ]);
      }
    } catch (error) {
      // AbortError is a user-initiated stop — keep partial text visible, no toast
      if ((error as Error).name !== 'AbortError') {
        toast.error((error as Error).message);
      }
      setIsInterrupted(true);
      setStreamingMessageId(undefined);
    } finally {
      abortControllerRef.current = null;
      setIsStreaming(false);
      setIsSlowResponse(false);
    }
  };

  // Aborts the in-flight SSE stream. The catch block in handleStreamSubmit
  // detects AbortError and skips the toast, leaving partial text visible.
  const handleStop = () => {
    abortControllerRef.current?.abort();
  };

  // All chips prefill the composer — none auto-submit.
  // This lets the user change the selected period (or edit the prompt) before sending,
  // which matters especially for month_analysis chips where the month selector is the key input.
  const handleChipClick = (chip: AssistantPromptChip) => {
    setMode(chip.mode);
    setDraft(chip.prompt);
  };

  const handleRetry = () => {
    if (!isStreaming && lastSentPromptRef.current) {
      handleStreamSubmit(lastSentPromptRef.current);
    }
  };

  const handlePreferencesChange = async (
    patch: Partial<NonNullable<typeof memory>['preferences']>
  ) => {
    if (!user?.uid) return;
    try {
      await updateMemoryMutation.mutateAsync({ preferences: patch });
    } catch (error) {
      toast.error((error as Error).message);
    }
  };

  // Deselects the current thread so the hero state reappears and the next
  // submit creates a fresh thread server-side (threadId omitted from the request).
  const handleNewThread = () => {
    setSelectedThreadId(undefined);
    setStreamingMessages([]);
    setStreamingMessageId(undefined);
    setIsInterrupted(false);
    setContextBundle(null);
    setDraft('');
  };

  const handleDeleteThread = async (threadId: string) => {
    try {
      await deleteThreadMutation.mutateAsync(threadId);
      // If the deleted thread was selected, return to hero state
      if (selectedThreadId === threadId) {
        handleNewThread();
      }
      toast.success('Conversazione eliminata');
    } catch (error) {
      toast.error((error as Error).message);
    }
  };

  const composerErrorHint = isAnalysisBlocked
    ? `Nessun dato disponibile per ${MONTH_NAMES[selectedMonth.month - 1]} ${selectedMonth.year}. Seleziona un altro periodo.`
    : undefined;

  // Show skeleton while threads resolve on first load
  if (loadingThreads) {
    return (
      <ProtectedRoute>
        <AssistantPageSkeleton />
      </ProtectedRoute>
    );
  }

  const activePeriodLabel = getActivePeriodLabel(mode, selectedMonth, selectedYear);

  return (
    <ProtectedRoute>
      {/* max-desktop:portrait:pb-20 provides clearance for the fixed bottom navigation on mobile portrait */}
      <div className="space-y-6 max-desktop:portrait:pb-20">
        {/* Page header */}
        <header className="space-y-4 border-b border-border pb-4">
          <div className="space-y-1">
            <p className="text-xs uppercase tracking-widest text-muted-foreground">Analisi</p>
            <div className="flex flex-col gap-3 desktop:flex-row desktop:items-end desktop:justify-between">
              <div className="space-y-2">
                <h1 className="text-3xl font-semibold tracking-tight text-foreground">Assistente AI</h1>
                <p className="max-w-2xl text-sm text-muted-foreground">
                  Fai domande sul tuo patrimonio, analizza un mese, un anno, il tuo YTD o l'intera storia del portafoglio.
                </p>

                {/* Guide trigger only — content renders below the full-width flex row
                    so it can span the entire header width on desktop. */}
                <button
                  onClick={() => setIsGuideOpen((v) => !v)}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mt-1"
                  aria-expanded={isGuideOpen}
                >
                  <HelpCircle className="h-3.5 w-3.5 shrink-0" />
                  Come funziona
                  <ChevronDown
                    className={cn(
                      'h-3 w-3 transition-transform duration-200',
                      isGuideOpen && 'rotate-180'
                    )}
                  />
                </button>
              </div>
              {/* Mobile: two full-width rows so buttons aren't crowded in a wrapping flex.
                  Desktop: single inline flex row as before. */}
              <div className="flex flex-col gap-2 desktop:flex-row desktop:flex-wrap desktop:items-center">

                {/* Row 1 (mobile) / inline (desktop): Conversazioni sheet + Brain (memory) sheet */}
                <div className="flex items-center gap-2">
                  <Sheet open={isThreadSheetOpen} onOpenChange={setIsThreadSheetOpen}>
                    <SheetTrigger asChild>
                      <Button variant="outline" size="sm" className="flex-1 gap-2 desktop:flex-none">
                        <MessagesSquare className="h-4 w-4" />
                        Conversazioni
                        {threads.length > 0 && (
                          <span className="flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-medium text-primary-foreground">
                            {threads.length > 99 ? '99' : threads.length}
                          </span>
                        )}
                      </Button>
                    </SheetTrigger>
                    <SheetContent side="right" className="w-[320px] overflow-y-auto p-0">
                      <SheetHeader className="border-b border-border px-4 py-3">
                        <SheetTitle className="text-left text-sm">Conversazioni</SheetTitle>
                      </SheetHeader>
                      <div className="px-4 py-3">
                        <ThreadList
                          threads={threads}
                          loadingThreads={loadingThreads}
                          selectedThreadId={selectedThreadId}
                          isStreaming={isStreaming}
                          isDeletingId={deleteThreadMutation.variables as string | undefined}
                          onSelect={(thread) => {
                            setSelectedThreadId(thread.id);
                            setStreamingMessages([]);
                            setStreamingMessageId(undefined);
                            setIsInterrupted(false);
                            setContextBundle(null);
                            setMode(thread.mode);
                            if (thread.pinnedMonth) setSelectedMonth(thread.pinnedMonth);
                            if (thread.pinnedYear) setSelectedYear(thread.pinnedYear);
                            setIsThreadSheetOpen(false);
                          }}
                          onDelete={handleDeleteThread}
                          onNewThread={handleNewThread}
                        />
                      </div>
                    </SheetContent>
                  </Sheet>

                  {/* Memory sheet — mobile only; on desktop the panel is in the right column */}
                  {user?.uid && (
                    <Sheet open={isMemorySheetOpen} onOpenChange={setIsMemorySheetOpen}>
                      <SheetTrigger asChild>
                        <Button variant="outline" size="icon" className="desktop:hidden shrink-0 h-9 w-9" aria-label="Apri memoria">
                          <Brain className="h-4 w-4" />
                        </Button>
                      </SheetTrigger>
                      <SheetContent side="right" className="w-[340px] overflow-y-auto p-0">
                        <SheetHeader className="border-b border-border px-4 py-3">
                          <SheetTitle className="text-left text-sm">Memoria</SheetTitle>
                        </SheetHeader>
                        <div className="px-4 py-4">
                          <AssistantMemoryPanel
                            userId={user.uid}
                            memory={memory}
                            isLoading={loadingMemory}
                          />
                        </div>
                      </SheetContent>
                    </Sheet>
                  )}
                </div>

                {/* Row 2 (mobile) / inline (desktop): Nuova conversazione + Preferenze */}
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleNewThread}
                    disabled={isStreaming}
                    className="flex-1 gap-2 desktop:flex-none"
                  >
                    <Plus className="h-4 w-4" />
                    Nuova conversazione
                  </Button>

                  {/* Preferences popover */}
                  <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Preferenze assistente">
                      <Settings2 className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="end" className="w-72">
                    <p className="mb-3 text-sm font-semibold text-foreground">Preferenze</p>

                    {/* Response style selector */}
                    <div className="mb-3 space-y-1.5">
                      <label className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                        Stile di risposta
                      </label>
                      <Select
                        value={memory?.preferences.responseStyle ?? 'balanced'}
                        onValueChange={(value) =>
                          handlePreferencesChange({
                            responseStyle: value as 'balanced' | 'concise' | 'deep',
                          })
                        }
                        disabled={loadingMemory || updateMemoryMutation.isPending}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Stile di risposta" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="balanced">Bilanciato</SelectItem>
                          <SelectItem value="concise">Conciso</SelectItem>
                          <SelectItem value="deep">Approfondito</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Toggle switches */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-4 rounded-lg border border-border px-3 py-2">
                        <div>
                          <p className="text-sm font-medium text-foreground">Contesto macro</p>
                          <p className="text-xs text-muted-foreground">
                            Abilita ricerca web nelle analisi.
                          </p>
                        </div>
                        <Switch
                          checked={memory?.preferences.includeMacroContext ?? false}
                          onCheckedChange={(checked) => handlePreferencesChange({ includeMacroContext: checked })}
                          disabled={loadingMemory || updateMemoryMutation.isPending}
                        />
                      </div>

                      {/* Shown only when the user has dummy snapshots — test accounts only.
                          hasDummySnapshots is a computed field returned by the memory GET endpoint. */}
                      {memory?.hasDummySnapshots && (
                        <div className="flex items-center justify-between gap-4 rounded-lg border border-border px-3 py-2">
                          <div>
                            <p className="text-sm font-medium text-foreground">Snapshot di test</p>
                            <p className="text-xs text-muted-foreground">
                              Includi snapshot dummy nelle analisi (solo account di test).
                            </p>
                          </div>
                          <Switch
                            checked={memory?.preferences.includeDummySnapshots ?? false}
                            onCheckedChange={(checked) => handlePreferencesChange({ includeDummySnapshots: checked })}
                            disabled={loadingMemory || updateMemoryMutation.isPending}
                          />
                        </div>
                      )}
                    </div>
                  </PopoverContent>
                </Popover>
                </div>{/* end row 2 */}
              </div>{/* end button group */}
            </div>

            {/* Collapsible guide content — outside the flex row so it spans full width on desktop.
                Explains non-obvious behaviours: mode bundles, web search policy, memory mechanics. */}
            <AnimatePresence initial={false}>
              {isGuideOpen && (
                <motion.div
                  key="guide"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: prefersReducedMotion ? 0 : 0.25, ease: [0.22, 1, 0.36, 1] }}
                  style={{ overflow: 'hidden' }}
                >
                  <div className="mt-3 space-y-4 rounded-xl border border-border bg-muted/30 p-4 text-sm">

                    {/* Modes — vertical list, label fixed-width column */}
                    <div>
                      <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                        Modalità di analisi
                      </p>
                      <div className="space-y-1.5">
                        {[
                          { label: 'Mese', desc: 'Patrimonio netto, cashflow, dividendi e allocazione del mese selezionato.' },
                          { label: 'Anno', desc: 'Performance annuale, risparmio, crescita investimenti e dividendi totali.' },
                          { label: 'YTD', desc: "Stesse metriche dall'1 gennaio a oggi — utile per valutare l'andamento in corso d'anno." },
                          { label: 'Storico', desc: 'Evoluzione completa del patrimonio da quando hai iniziato a tracciare. Ideale per trend a lungo termine.' },
                          { label: 'Chat', desc: 'Domanda aperta. Puoi aggiungere contesto numerico (mese, anno, YTD, storico) con il selettore Contesto.' },
                        ].map(({ label, desc }) => (
                          <div key={label} className="flex gap-3">
                            <span className="w-14 shrink-0 font-medium text-foreground">{label}</span>
                            <span className="text-muted-foreground">{desc}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Web search + Memory — side by side on desktop */}
                    <div className="grid gap-4 desktop:grid-cols-2">
                      <div>
                        <p className="mb-1.5 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                          Ricerca web (contesto macro)
                        </p>
                        <p className="text-muted-foreground">
                          Nelle analisi strutturate (Mese, Anno, YTD, Storico) basta il toggle{' '}
                          <span className="font-medium text-foreground">Contesto macro</span> nelle preferenze.
                          In Chat libera si attiva solo se la domanda contiene keyword macro — inflazione, tassi,
                          dazi, BCE, recessione — o frasi come{' '}
                          <span className="font-medium text-foreground">&ldquo;cerca sul web&rdquo;</span>.
                        </p>
                      </div>

                      <div>
                        <p className="mb-1.5 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                          Memoria
                        </p>
                        <p className="text-muted-foreground">
                          Dopo ogni risposta l&apos;assistente estrae fatti stabili che hai dichiarato — obiettivi,
                          preferenze di rischio, orizzonti temporali — e li salva nel pannello{' '}
                          <span className="font-medium text-foreground">Memoria</span>. Vengono inclusi
                          automaticamente nelle analisi successive. Puoi modificare, archiviare o eliminare ogni
                          ricordo individualmente.
                        </p>
                      </div>
                    </div>

                    {/* Tips — vertical list, no columns */}
                    <div>
                      <p className="mb-1.5 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                        Per risposte migliori
                      </p>
                      <ul className="space-y-1 text-muted-foreground">
                        <li>— Cita gli asset per nome (es. &ldquo;All World ETF&rdquo;) per analisi più precise.</li>
                        <li>— Fai domande specifiche: &ldquo;Perché il patrimonio è sceso a marzo?&rdquo; funziona meglio di &ldquo;Come sto?&rdquo;</li>
                        <li>— Dichiara i tuoi obiettivi nella chat — verranno salvati in memoria e influenzeranno le analisi future.</li>
                      </ul>
                    </div>

                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </header>

        {!assistantConfigured ? (
          <Card>
            <CardContent className="py-10">
              <EmptyState
                icon={<Lock className="h-10 w-10" />}
                title="Servizio AI non configurato"
                description="La pagina resta accessibile, ma per usare l'assistente devi configurare ANTHROPIC_API_KEY nell'ambiente."
                action={
                  <Button variant="outline" onClick={() => router.back()}>
                    Torna indietro
                  </Button>
                }
                className="py-4"
              />
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-6 desktop:grid-cols-[minmax(0,1.7fr)_minmax(300px,0.85fr)]">
            {/* ── Left column: conversation + sticky composer ── */}
            <div className="flex flex-col gap-0">
              {/* Hero state: shown when no messages exist yet */}
              {renderedMessages.length === 0 && !loadingThreadDetail && (
                <>
                  {/* Chips card comes first so the primary CTA is above the fold on mobile.
                      On desktop this order is less critical since threads are in the right column. */}
                  <div className="mb-6 rounded-2xl border border-border bg-muted/20 p-6">
                    <div className="mb-4 flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                        <Sparkles className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <p className="font-semibold text-foreground">Come posso aiutarti?</p>
                        <p className="text-sm text-muted-foreground">
                          Scegli un punto di partenza o scrivi direttamente nel composer.
                        </p>
                      </div>
                    </div>
                    <AssistantPromptChips
                      chips={assistantPromptChips}
                      onSelect={handleChipClick}
                      disabled={isStreaming}
                    />
                  </div>

                  {/* Mobile-only thread list: secondary section below chips so the primary
                      CTA stays above the fold. Hidden on desktop where threads are in the
                      right-column card. */}
                  {threads.length > 0 && (
                    <div className="mb-6 desktop:hidden">
                      <p className="mb-2 text-xs font-medium uppercase tracking-widest text-muted-foreground">
                        Riprendi conversazione
                      </p>
                      <div className="space-y-1.5">
                        {threads.slice(0, 5).map((thread) => (
                          <button
                            key={thread.id}
                            onClick={() => {
                              setSelectedThreadId(thread.id);
                              setStreamingMessages([]);
                              setStreamingMessageId(undefined);
                              setIsInterrupted(false);
                              setContextBundle(null);
                              setMode(thread.mode);
                              if (thread.pinnedMonth) setSelectedMonth(thread.pinnedMonth);
                              if (thread.pinnedYear) setSelectedYear(thread.pinnedYear);
                            }}
                            disabled={isStreaming}
                            className="w-full rounded-xl border border-border px-3 py-2.5 text-left transition-colors hover:bg-muted/40"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-sm font-medium text-foreground line-clamp-1">{thread.title}</p>
                              <Badge variant="outline" className="shrink-0 text-[10px] uppercase">
                                {getModeBadgeLabel(thread.mode)}
                              </Badge>
                            </div>
                            {thread.lastMessagePreview && (
                              <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                                {stripMarkdown(thread.lastMessagePreview)}
                              </p>
                            )}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* Conversation area */}
              <div className="min-h-[200px] space-y-0 rounded-2xl border border-border bg-background overflow-hidden">
                {/* Conversation header */}
                <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
                  <div>
                    {/* Period label crossfades on mode/period switch so the change
                        registers as a deliberate context shift, not a text flicker. */}
                    <AnimatePresence mode="wait" initial={false}>
                      <motion.p
                        key={activePeriodLabel}
                        className="text-sm font-medium text-foreground"
                        initial={{ opacity: 0, y: prefersReducedMotion ? 0 : 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: prefersReducedMotion ? 0 : -4 }}
                        transition={{ duration: prefersReducedMotion ? 0 : 0.20, ease: [0.22, 1, 0.36, 1] }}
                      >
                        {activePeriodLabel}
                      </motion.p>
                    </AnimatePresence>
                    {/* Mobile context strip: key delta at a glance without scrolling to the full card */}
                    {contextBundle && (
                      <div className="desktop:hidden">
                        <AssistantContextPill bundle={contextBundle} />
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {/* Streaming status badges fade in/out — AnimatePresence prevents
                        abrupt appearance when the first token arrives. */}
                    <AnimatePresence>
                      {isStreaming && !isSlowResponse && (
                        <motion.div
                          key="streaming-badge"
                          initial={{ opacity: 0, scale: 0.92 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.92 }}
                          transition={{ duration: prefersReducedMotion ? 0 : 0.18 }}
                        >
                          <Badge variant="outline" className="gap-1.5 text-xs">
                            <Loader2 className="h-3 w-3 animate-spin" />
                            In scrittura…
                          </Badge>
                        </motion.div>
                      )}
                      {isSlowResponse && (
                        <motion.div
                          key="slow-badge"
                          initial={{ opacity: 0, scale: 0.92 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.92 }}
                          transition={{ duration: prefersReducedMotion ? 0 : 0.18 }}
                        >
                          <Badge variant="outline" className="gap-1.5 text-xs text-muted-foreground">
                            <Loader2 className="h-3 w-3 animate-spin" />
                            Sta impiegando più del previsto…
                          </Badge>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>

                {/* Messages */}
                <div className="p-5">
                  {loadingThreadDetail ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Caricamento conversazione…
                    </div>
                  ) : renderedMessages.length === 0 ? (
                    <EmptyState
                      icon={<MessageSquare className="h-8 w-8" />}
                      title="Nessun messaggio ancora"
                      description="Scegli un prompt suggerito o scrivi la tua domanda nel composer in basso."
                      className="py-10"
                    />
                  ) : (
                    <AssistantStreamingResponse
                      messages={renderedMessages}
                      isInterrupted={isInterrupted}
                      onRetry={handleRetry}
                      streamingMessageId={streamingMessageId}
                    />
                  )}
                  {/* Anchor for auto-scroll to latest message */}
                  <div ref={conversationEndRef} />
                </div>
              </div>

              {/* Sticky composer — stays at bottom of viewport as conversation grows */}
              <div className="sticky bottom-0 max-desktop:portrait:bottom-20 z-10 mt-0">
                <AssistantComposer
                  draft={draft}
                  onChange={setDraft}
                  onSubmit={handleStreamSubmit}
                  onStop={handleStop}
                  isStreaming={isStreaming}
                  canSubmit={canSubmit}
                  mode={mode}
                  onModeChange={handleModeChange}
                  selectedMonth={selectedMonth}
                  monthOptions={monthOptions}
                  onMonthChange={setSelectedMonth}
                  selectedYear={selectedYear}
                  yearOptions={yearOptions}
                  onYearChange={setSelectedYear}
                  chatContextType={chatContextType}
                  onChatContextTypeChange={setChatContextType}
                  errorHint={composerErrorHint}
                />
              </div>
            </div>

            {/* ── Right column: sticky so panels stay visible while the conversation scrolls.
                 max-h + overflow-y-auto lets the column scroll internally if content
                 overflows the viewport (e.g. very long memory list). ── */}
            <div className="space-y-6 desktop:sticky desktop:top-6 desktop:max-h-[calc(100vh-6rem)] desktop:overflow-y-auto desktop:pr-1">
              {/* Thread list — on desktop always visible at the top so the user can
                  jump to a previous conversation without scrolling past other panels.
                  On mobile the drawer (header button) serves the same purpose. */}
              <Card className="hidden desktop:block">
                <CardHeader>
                  <CardTitle>Conversazioni</CardTitle>
                  <CardDescription>Ordinate per ultimo aggiornamento.</CardDescription>
                </CardHeader>
                <CardContent className="max-h-[400px] overflow-y-auto space-y-2 pr-1">
                  <ThreadList
                    threads={threads}
                    loadingThreads={loadingThreads}
                    selectedThreadId={selectedThreadId}
                    isStreaming={isStreaming}
                    isDeletingId={deleteThreadMutation.variables as string | undefined}
                    onSelect={(thread) => {
                      setSelectedThreadId(thread.id);
                      setStreamingMessages([]);
                      setStreamingMessageId(undefined);
                      setIsInterrupted(false);
                      setContextBundle(null);
                      setMode(thread.mode);
                      if (thread.pinnedMonth) setSelectedMonth(thread.pinnedMonth);
                      if (thread.pinnedYear) setSelectedYear(thread.pinnedYear);
                    }}
                    onDelete={handleDeleteThread}
                    onNewThread={handleNewThread}
                  />
                </CardContent>
              </Card>

              {/* Context panel — desktop only. On mobile, the context pill sits in the
                  conversation header so the user sees the key number without scrolling. */}
              <div className="hidden desktop:block">
                {contextBundle ? (
                  <AssistantContextCard bundle={contextBundle} />
                ) : loadingContextBundle ? (
                  <AssistantContextCard bundle={{} as AssistantMonthContextBundle} isLoading />
                ) : (
                  <Card>
                    <CardHeader>
                      <CardTitle>Contesto numerico</CardTitle>
                      <CardDescription>
                        Appare qui al termine della prima analisi.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="rounded-xl border border-border p-3.5">
                        <div className="mb-1.5 flex items-center gap-2 text-sm font-medium text-foreground">
                          <CalendarDays className="h-4 w-4 text-muted-foreground" />
                          Periodo di riferimento
                        </div>
                        <p className="text-sm text-muted-foreground">{activePeriodLabel}</p>
                      </div>
                      <div className="rounded-xl border border-border p-3.5">
                        <div className="mb-1.5 flex items-center gap-2 text-sm font-medium text-foreground">
                          <Globe className="h-4 w-4 text-muted-foreground" />
                          Web search
                        </div>
                        <p className="text-sm text-muted-foreground">
                          Attiva nelle analisi solo con contesto macro abilitato.
                          In chat si attiva per richieste macro esplicite.
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>

              {/* Memory panel — desktop only. On mobile, accessible via the Brain sheet
                  button in the page header so it doesn't consume scroll space. */}
              {user?.uid && (
                <div className="hidden desktop:block">
                  <AssistantMemoryPanel
                    userId={user.uid}
                    memory={memory}
                    isLoading={loadingMemory}
                    isOpen={isMemoryPanelOpen}
                    onToggle={() => setIsMemoryPanelOpen((v) => !v)}
                  />
                </div>
              )}

              {(threadsError || threadError || memoryError) && (
                <p className="text-xs text-destructive">
                  {(threadsError || threadError || memoryError)?.message}
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </ProtectedRoute>
  );
}
