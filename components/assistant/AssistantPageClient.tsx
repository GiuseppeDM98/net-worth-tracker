'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  AlertCircle,
  Bot,
  Brain,
  Check,
  ChevronDown,
  Globe,
  HelpCircle,
  Loader2,
  Lock,
  MessageSquare,
  MessagesSquare,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { it } from 'date-fns/locale';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { AssistantComposer } from '@/components/assistant/AssistantComposer';
import { AssistantPageSkeleton } from '@/components/assistant/AssistantPageSkeleton';
import { AssistantContextCard, AssistantContextCardSkeleton, AssistantContextPill } from '@/components/assistant/AssistantContextCard';
import { AssistantMemoryPanel } from '@/components/assistant/AssistantMemoryPanel';
import { AssistantPromptChips } from '@/components/assistant/AssistantPromptChips';
import { AssistantStreamingResponse } from '@/components/assistant/AssistantStreamingResponse';
import { AssistantPeriodSelector } from '@/components/assistant/AssistantPeriodSelector';
import { AssistantPreferencesPopover } from '@/components/assistant/AssistantPreferencesPopover';
import { AssistantSuggestionsBanner } from '@/components/assistant/AssistantSuggestionsBanner';
import { AssistantMemoryFacts } from '@/components/assistant/AssistantMemoryFacts';
import { AssistantFollowUps } from '@/components/assistant/AssistantFollowUps';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { EmptyState } from '@/components/ui/empty-state';
import { useAuth } from '@/contexts/AuthContext';
import { useDemoMode } from '@/lib/hooks/useDemoMode';
import { useDashboardOverview } from '@/lib/hooks/useDashboardOverview';
import { useCountUp } from '@/lib/utils/useCountUp';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import { useAssistantMemory, useUpdateAssistantMemory } from '@/lib/hooks/useAssistantMemory';
import { useAssistantPeriodContext } from '@/lib/hooks/useAssistantMonthContext';
import { useAssistantThread, useAssistantThreads, useDeleteAssistantThread } from '@/lib/hooks/useAssistantThreads';
import { assistantPromptChips } from '@/lib/constants/assistantPrompts';
import { buildFollowUpSuggestions } from '@/lib/utils/assistantFollowUps';
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
 * Returns the previous completed month relative to Italy "now".
 *
 * Used as the default monthly selection: the current month is still in progress
 * (often without a snapshot yet), so analysing it greets the user with an empty
 * period. The last closed month always has data and is the natural review target.
 */
function getPreviousCompletedMonth(): AssistantMonthSelectorValue {
  const { year, month } = getItalyMonthYear(new Date());
  if (month === 1) {
    return { year: year - 1, month: 12 };
  }
  return { year, month: month - 1 };
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
 * "chat" reads as "Libera" — the period axis renames the former Chat mode.
 */
function getModeBadgeLabel(mode: AssistantMode): string {
  if (mode === 'month_analysis') return 'Mese';
  if (mode === 'year_analysis') return 'Anno';
  if (mode === 'ytd_analysis') return 'YTD';
  if (mode === 'history_analysis') return 'Storico';
  return 'Libera';
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
  return 'Domanda libera';
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

/**
 * "Patrimonio netto oggi" card shown as the period scheda when no numeric period
 * is attached (Libera mode). Keeps a dominant number on screen so the user always
 * has their financial reality in view before asking a free-form question.
 */
function PatrimonioTodayCard({
  netWorth,
  animatedNetWorth,
  variation,
}: {
  netWorth: number | null;
  animatedNetWorth: number;
  variation: { value: number; percentage: number } | null;
}) {
  return (
    <div className="rounded-xl border border-border bg-card px-4 py-4">
      <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-muted-foreground/70">
        Patrimonio netto oggi
      </p>
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-bold font-mono text-foreground tabular-nums">
          {netWorth !== null ? cachedFormatCurrencyEUR(animatedNetWorth ?? 0, true) : '—'}
        </span>
        {variation && (
          <span
            className={cn(
              'text-sm font-medium tabular-nums',
              variation.value >= 0 ? 'text-positive' : 'text-destructive'
            )}
          >
            {variation.value >= 0 ? '+' : ''}
            {cachedFormatCurrencyEUR(variation.value, true)}{' '}
            <span className="opacity-70">
              ({variation.percentage >= 0 ? '+' : ''}
              {variation.percentage.toFixed(2)}%)
            </span>
          </span>
        )}
      </div>
      <p className="mt-1.5 text-xs text-muted-foreground/60">
        vs. mese scorso · prezzi correnti · al netto delle tasse stimate
      </p>
    </div>
  );
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
        icon={Bot}
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
              className="min-w-0 flex-1 rounded-xl px-3 py-2.5 text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring"
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
                  <span className="text-[10px] text-muted-foreground">{thread.pinnedYear}</span>
                )}
                <span className="text-[10px] text-muted-foreground/70">
                  {formatThreadDate(thread.updatedAt)}
                </span>
              </div>
            </button>

            {/* Delete control — in normal flow at the right edge, never overlaps the badge.
                Shows on hover, stays visible while deleting or pending confirmation. */}
            <div
              className={cn(
                'flex shrink-0 items-start pt-2 pr-2 opacity-0 transition-opacity group-hover:opacity-100',
                (isDeleting || isPendingDelete) && 'opacity-100'
              )}
            >
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
                    onClick={(e) => {
                      e.stopPropagation();
                      confirmDelete(thread.id);
                    }}
                    disabled={isStreaming}
                    aria-label="Conferma eliminazione"
                    className="rounded-md p-1 text-destructive hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    <Check className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      disarmDelete();
                    }}
                    aria-label="Annulla eliminazione"
                    className="rounded-md p-1 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}

              {/* Normal trash button — first click arms the confirmation */}
              {!isDeleting && !isPendingDelete && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    armDelete(thread.id);
                  }}
                  disabled={isStreaming}
                  aria-label="Elimina conversazione"
                  className="rounded-md p-1 text-muted-foreground/50 hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
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
  const isDemo = useDemoMode();
  const prefersReducedMotion = useReducedMotion();
  const conversationEndRef = useRef<HTMLDivElement>(null);
  // Stores the last successfully submitted prompt so retry can re-send it
  // after draft is cleared. Using a ref avoids stale closure issues.
  const lastSentPromptRef = useRef('');
  // Holds the AbortController for the in-flight SSE request so the stop button
  // can cancel the stream without navigating away.
  const abortControllerRef = useRef<AbortController | null>(null);

  // Italy current month/year — stable for the session
  const { year: currentYear } = useMemo(() => getItalyMonthYear(new Date()), []);

  // Month and year options are stable for the session — computed once on mount
  const monthOptions = useMemo(() => buildMonthOptions(), []);
  const yearOptions = useMemo(() => buildYearOptions(), []);

  const [selectedThreadId, setSelectedThreadId] = useState<string>();
  const [draft, setDraft] = useState('');
  const [mode, setMode] = useState<AssistantMode>('month_analysis');
  const [selectedMonth, setSelectedMonth] = useState<AssistantMonthSelectorValue>(
    // Default to the last completed month — it always has data, so the period
    // scheda and composer are usable from the first render (see getPreviousCompletedMonth).
    () => getPreviousCompletedMonth()
  );
  const [selectedYear, setSelectedYear] = useState<number>(() => getItalyMonthYear(new Date()).year);
  // Optional period attached to a free (Libera) question — drives both the scheda
  // preview and what numeric bundle the server builds for the chat answer.
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
  // Mirrors the server's SSE status event (searching | writing | saving). Drives the
  // distinct "Sto cercando sul web…" badge instead of the generic slow-response nudge.
  const [streamStatus, setStreamStatus] = useState<'searching' | 'writing' | 'saving' | null>(null);
  // Context bundle is populated from the SSE 'context' event sent before text streaming
  const [contextBundle, setContextBundle] = useState<AssistantMonthContextBundle | null>(null);
  // Controls the mobile threads Sheet — needed to close it programmatically after thread selection.
  const [isThreadSheetOpen, setIsThreadSheetOpen] = useState(false);
  // Controls the mobile memory Sheet — keeps the panel accessible without occupying scroll space
  const [isMemorySheetOpen, setIsMemorySheetOpen] = useState(false);
  // Guide section — opened on demand only (no auto-open wall of text); action-first onboarding.
  const [isGuideOpen, setIsGuideOpen] = useState(false);

  // Dashboard overview — used to source the current net worth for the "patrimonio oggi" scheda.
  // Reuses the React Query cache from Panoramica if the user visited it this session,
  // so in practice this is a cache hit and adds no network latency.
  const { data: overviewData } = useDashboardOverview(user?.uid);

  const { data: threads = [], isLoading: loadingThreads, error: threadsError } = useAssistantThreads(user?.uid);
  const { data: threadDetail, isLoading: loadingThreadDetail, error: threadError } = useAssistantThread(
    selectedThreadId,
    user?.uid
  );
  const { data: memory, isLoading: loadingMemory, error: memoryError } = useAssistantMemory(user?.uid);
  const updateMemoryMutation = useUpdateAssistantMemory(user?.uid ?? '');
  const deleteThreadMutation = useDeleteAssistantThread(user?.uid ?? '');

  // Effective period for the context scheda: a loaded thread pins its own period;
  // otherwise the live selector drives a preview so the scheda fills in *before* the
  // first question is asked (the old design left it empty until an analysis ran).
  const hasActiveThread = !!selectedThreadId;
  const pinnedMonth = threadDetail?.thread.pinnedMonth ?? null;
  const pinnedYear = threadDetail?.thread.pinnedYear ?? null;
  const threadMode = threadDetail?.thread.mode ?? mode;
  // In Libera mode an attached context maps to the matching analysis builder for
  // the preview fetch, so the scheda shows that period's numbers before asking.
  const liveMode: AssistantMode =
    mode === 'chat'
      ? chatContextType === 'month'
        ? 'month_analysis'
        : chatContextType === 'year'
          ? 'year_analysis'
          : chatContextType === 'ytd'
            ? 'ytd_analysis'
            : chatContextType === 'history'
              ? 'history_analysis'
              : 'chat'
      : mode;
  const previewMode = hasActiveThread ? threadMode : liveMode;
  const previewMonth = hasActiveThread ? pinnedMonth : selectedMonth;
  const previewYear = hasActiveThread ? pinnedYear : selectedYear;

  // Fetch the context bundle whenever a period is selected and no SSE bundle is active.
  // SSE bundle always takes priority over the fetched one. Free (chat) mode has no
  // numeric period, so it never fetches — the "patrimonio oggi" card stands in instead.
  const shouldFetchContext =
    streamingMessages.length === 0 &&
    contextBundle === null &&
    (
      (previewMode === 'month_analysis' && previewMonth !== null) ||
      (previewMode === 'year_analysis' && previewYear !== null) ||
      previewMode === 'ytd_analysis' ||
      previewMode === 'history_analysis'
    );

  const { data: fetchedContextBundle, isLoading: loadingContextBundle } = useAssistantPeriodContext(
    shouldFetchContext ? user?.uid : undefined,
    previewMode,
    previewMonth,
    previewYear,
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

  // Follow-up chips (Blocco B1): shown after a completed assistant answer, derived
  // purely from the answer's mode + the period bundle. Hidden while streaming.
  const followUps = useMemo(() => {
    const last = renderedMessages[renderedMessages.length - 1];
    const isComplete = !isStreaming && streamingMessageId === undefined && !isInterrupted;
    if (!isComplete || !last || last.role !== 'assistant' || last.content.trim().length === 0) {
      return [];
    }
    return buildFollowUpSuggestions(last.mode, contextBundle);
  }, [renderedMessages, isStreaming, streamingMessageId, isInterrupted, contextBundle]);

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

  // "Patrimonio oggi" scheda: current net worth from overview cache (no extra fetch on cache hit).
  // useCountUp must be called before any early return — React hook rules.
  const heroNetWorth = overviewData?.metrics.netTotal ?? null;
  const heroNetWorthAnimated = useCountUp(heroNetWorth ?? 0, {
    once: true,
    fromPrevious: false,
    startDelay: 80,
  });
  const heroVariation = overviewData?.variations.monthly ?? null;

  /**
   * Auto-selects an existing thread matching the new mode + period when the user switches periods.
   * Called from handleModeChange so it only fires on explicit user action, never on page load.
   * Scans the already-loaded threads list — no extra fetch needed.
   */
  const autoSelectThreadForMode = (newMode: AssistantMode) => {
    let match: AssistantThread | undefined;

    if (newMode === 'month_analysis') {
      match = threads.find(
        (t) =>
          t.mode === 'month_analysis' &&
          t.pinnedMonth?.year === selectedMonth.year &&
          t.pinnedMonth?.month === selectedMonth.month
      );
    } else if (newMode === 'year_analysis') {
      match = threads.find((t) => t.mode === 'year_analysis' && t.pinnedYear === selectedYear);
    } else if (newMode === 'ytd_analysis') {
      match = threads.find((t) => t.mode === 'ytd_analysis');
    } else if (newMode === 'history_analysis') {
      match = threads.find((t) => t.mode === 'history_analysis');
    }
    // chat (Libera) mode: no auto-select — always starts fresh

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
    if (isStreaming) return;
    setMode(newMode);
    // Reset the bundle so the period scheda re-fetches the new period's preview.
    setContextBundle(null);
    autoSelectThreadForMode(newMode);
  };

  // Period sub-picker changes refresh the live preview only when no conversation is
  // active; mid-thread the value is still captured for the next submit, as before.
  const handleMonthChange = (month: AssistantMonthSelectorValue) => {
    setSelectedMonth(month);
    if (renderedMessages.length === 0) setContextBundle(null);
  };

  const handleYearChange = (year: number) => {
    setSelectedYear(year);
    if (renderedMessages.length === 0) setContextBundle(null);
  };

  // Attaching/detaching a period to a Libera question re-fetches the scheda preview.
  const handleChatContextChange = (type: AssistantChatContextType) => {
    setChatContextType(type);
    if (renderedMessages.length === 0) setContextBundle(null);
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
    setStreamStatus(null);
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
          // Libera (chat) optionally attaches a period context selected next to the axis.
          ...(modeToSend === 'chat'
            ? {
                chatContext: chatContextType,
                ...(chatContextType === 'month' ? { month: selectedMonth } : {}),
                ...(chatContextType === 'year' ? { year: selectedYear } : {}),
              }
            : {}),
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
      setStreamStatus(null);
    }
  };

  // Aborts the in-flight SSE stream. The catch block in handleStreamSubmit
  // detects AbortError and skips the toast, leaving partial text visible.
  const handleStop = () => {
    abortControllerRef.current?.abort();
  };

  // Starter chips prefill the composer (so the user can confirm the period before sending);
  // follow-up chips submit directly (the period is already fixed by the thread).
  const handleChipClick = (chip: AssistantPromptChip) => {
    setMode(chip.mode);
    setContextBundle(null);
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

  // Deselects the current thread so the empty state reappears and the next
  // submit creates a fresh thread server-side (threadId omitted from the request).
  const handleNewThread = () => {
    setSelectedThreadId(undefined);
    setStreamingMessages([]);
    setStreamingMessageId(undefined);
    setIsInterrupted(false);
    setContextBundle(null);
    setDraft('');
  };

  const handleSelectThread = (thread: AssistantThread) => {
    setSelectedThreadId(thread.id);
    setStreamingMessages([]);
    setStreamingMessageId(undefined);
    setIsInterrupted(false);
    setContextBundle(null);
    setMode(thread.mode);
    if (thread.pinnedMonth) setSelectedMonth(thread.pinnedMonth);
    if (thread.pinnedYear) setSelectedYear(thread.pinnedYear);
  };

  const handleDeleteThread = async (threadId: string) => {
    try {
      await deleteThreadMutation.mutateAsync(threadId);
      // If the deleted thread was selected, return to empty state
      if (selectedThreadId === threadId) {
        handleNewThread();
      }
      toast.success('Conversazione eliminata');
    } catch (error) {
      toast.error((error as Error).message);
    }
  };

  const activePeriodLabel = getActivePeriodLabel(mode, selectedMonth, selectedYear);
  const activeMonthLabel = `${MONTH_NAMES[selectedMonth.month - 1]} ${selectedMonth.year}`;

  // Composer placeholder reflects the active period (the selector lives above it now).
  const composerPlaceholder = (() => {
    if (mode === 'month_analysis') return `Scrivi la tua domanda su ${activeMonthLabel}…`;
    if (mode === 'year_analysis') return `Scrivi la tua domanda sull'anno ${selectedYear}…`;
    if (mode === 'ytd_analysis') return "Scrivi la tua domanda sull'andamento da inizio anno…";
    if (mode === 'history_analysis') return 'Scrivi la tua domanda sullo storico del portafoglio…';
    // Libera: hint the attached context when present.
    if (chatContextType === 'month') return `Scrivi la tua domanda — contesto: ${activeMonthLabel}…`;
    if (chatContextType === 'year') return `Scrivi la tua domanda — contesto: anno ${selectedYear}…`;
    if (chatContextType === 'ytd') return 'Scrivi la tua domanda — contesto: da inizio anno…';
    if (chatContextType === 'history') return 'Scrivi la tua domanda — contesto: storico totale…';
    return 'Scrivi una domanda libera sul tuo portafoglio…';
  })();

  const composerErrorHint = isAnalysisBlocked
    ? `Nessun dato disponibile per ${activeMonthLabel}. Seleziona un altro periodo.`
    : undefined;

  // Empty-state heading phrased per period — explicit copy reads better than
  // string-surgery on the conversation-header label.
  const emptyStateQuestion = (() => {
    if (mode === 'chat') return 'Cosa vuoi chiedere?';
    if (mode === 'month_analysis') return `Cosa vuoi sapere su ${activeMonthLabel}?`;
    if (mode === 'year_analysis') return `Cosa vuoi sapere sul ${selectedYear}?`;
    if (mode === 'ytd_analysis') return "Cosa vuoi sapere sull'andamento da inizio anno?";
    return 'Cosa vuoi sapere sullo storico del portafoglio?';
  })();

  const activeMemoryCount = (memory?.items ?? []).filter((i) => i.status === 'active').length;

  // Renders the period scheda (numeric grounding for the selected period).
  // Reused on desktop (right column) and mobile (left column empty state).
  const renderPeriodScheda = () => {
    if (contextBundle) return <AssistantContextCard bundle={contextBundle} />;
    if (loadingContextBundle) return <AssistantContextCardSkeleton />;
    // Free question with no period attached → show net worth today as grounding.
    if (mode === 'chat' && chatContextType === 'none') {
      return (
        <PatrimonioTodayCard
          netWorth={heroNetWorth}
          animatedNetWorth={heroNetWorthAnimated ?? 0}
          variation={heroVariation}
        />
      );
    }
    return (
      <div className="rounded-xl border border-border px-4 py-3">
        <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-muted-foreground/70">
          {activePeriodLabel}
        </p>
        <p className="text-xs text-muted-foreground">
          Nessun dato disponibile per questo periodo.
        </p>
      </div>
    );
  };

  // Show skeleton while threads resolve on first load
  if (loadingThreads) {
    return (
      <ProtectedRoute>
        <AssistantPageSkeleton />
      </ProtectedRoute>
    );
  }

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
                  Fai domande sul tuo patrimonio, analizza un mese, un anno, il tuo YTD o l&apos;intera storia del portafoglio.
                </p>

                {/* Guide trigger — on-demand help, never auto-opened (action-first onboarding). */}
                <button
                  onClick={() => setIsGuideOpen((v) => !v)}
                  className="flex items-center gap-1.5 rounded text-xs text-muted-foreground hover:text-foreground transition-colors mt-1 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  aria-expanded={isGuideOpen}
                >
                  <HelpCircle className="h-3.5 w-3.5 shrink-0" />
                  Come funziona
                  <ChevronDown
                    className={cn('h-3 w-3 transition-transform duration-200', isGuideOpen && 'rotate-180')}
                  />
                </button>
              </div>

              {/* Action cluster. Mobile: two full-width rows; desktop: inline flex. */}
              <div className="flex flex-col gap-2 desktop:flex-row desktop:flex-wrap desktop:items-center">
                <div className="flex items-center gap-2">
                  {/* Conversazioni — opens the thread list in a right-side sheet on every
                      breakpoint (same affordance as memory), so the right column carries
                      only the period scheda and never a second nested-scroll box. */}
                  <Sheet open={isThreadSheetOpen} onOpenChange={setIsThreadSheetOpen}>
                    <SheetTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={isDemo}
                        title={isDemo ? 'Non disponibile in modalità demo' : undefined}
                        className="flex-1 gap-2 desktop:flex-none"
                      >
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
                            handleSelectThread(thread);
                            setIsThreadSheetOpen(false);
                          }}
                          onDelete={handleDeleteThread}
                          onNewThread={handleNewThread}
                        />
                      </div>
                    </SheetContent>
                  </Sheet>

                  {/* Memoria — same right-side sheet on every breakpoint. */}
                  {user?.uid && (
                    <Sheet open={isMemorySheetOpen} onOpenChange={setIsMemorySheetOpen}>
                      <SheetTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1 gap-2 desktop:flex-none"
                          aria-label="Apri memoria"
                        >
                          <Brain className="h-4 w-4" />
                          Memoria
                          {activeMemoryCount > 0 && (
                            <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-medium text-primary-foreground">
                              {activeMemoryCount > 99 ? '99' : activeMemoryCount}
                            </span>
                          )}
                        </Button>
                      </SheetTrigger>
                      <SheetContent side="right" className="w-[340px] overflow-y-auto p-0">
                        <SheetHeader className="border-b border-border px-4 py-3">
                          <SheetTitle className="text-left text-sm">Memoria</SheetTitle>
                        </SheetHeader>
                        <div className="px-4 py-4">
                          <AssistantMemoryPanel userId={user.uid} memory={memory} isLoading={loadingMemory} />
                        </div>
                      </SheetContent>
                    </Sheet>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleNewThread}
                    disabled={isDemo || isStreaming}
                    title={isDemo ? 'Non disponibile in modalità demo' : undefined}
                    className="flex-1 gap-2 desktop:flex-none"
                  >
                    <Plus className="h-4 w-4" />
                    Nuova conversazione
                  </Button>

                  {/* Unified behaviour preferences (style, web context, memory on/off) */}
                  <AssistantPreferencesPopover
                    memory={memory}
                    onChange={handlePreferencesChange}
                    isLoading={loadingMemory}
                    isPending={updateMemoryMutation.isPending}
                    disabled={isDemo}
                  />
                </div>
              </div>
            </div>

            {/* Collapsible guide — on-demand reference for non-obvious behaviours. */}
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
                    <div>
                      <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                        Periodi di analisi
                      </p>
                      <div className="space-y-1.5">
                        {[
                          { label: 'Mese', desc: 'Patrimonio netto, cashflow, dividendi e allocazione del mese selezionato.' },
                          { label: 'Anno', desc: 'Performance annuale, risparmio, crescita investimenti e dividendi totali.' },
                          { label: 'YTD', desc: "Stesse metriche dall'1 gennaio a oggi — utile per valutare l'andamento in corso d'anno." },
                          { label: 'Storico', desc: 'Evoluzione completa del patrimonio da quando hai iniziato a tracciare.' },
                          { label: 'Libera', desc: 'Domanda aperta senza un periodo numerico collegato.' },
                        ].map(({ label, desc }) => (
                          <div key={label} className="flex gap-3">
                            <span className="w-14 shrink-0 font-medium text-foreground">{label}</span>
                            <span className="text-muted-foreground">{desc}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="grid gap-4 desktop:grid-cols-2">
                      <div>
                        <p className="mb-1.5 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                          Ricerca web (contesto macro)
                        </p>
                        <p className="text-muted-foreground">
                          Nelle analisi di periodo il toggle{' '}
                          <span className="font-medium text-foreground">Contesto macro</span> abilita sempre la
                          ricerca web. In modalità Libera: se il toggle è attivo la ricerca è sempre abilitata; se è
                          disattivo si attiva solo su keyword macro — inflazione, tassi, dazi, BCE, recessione — o
                          frasi come{' '}
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
                          automaticamente nelle analisi successive.
                        </p>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </header>

        {isDemo ? (
          <EmptyState
            icon={Lock}
            title="Non disponibile in modalità demo"
            description="L'Assistente AI non è accessibile nell'account demo."
            action={
              <Button variant="outline" onClick={() => router.back()}>
                Torna indietro
              </Button>
            }
            className="py-20"
          />
        ) : !assistantConfigured ? (
          <EmptyState
            icon={Lock}
            title="Servizio AI non configurato"
            description="La pagina resta accessibile, ma per usare l'assistente devi configurare ANTHROPIC_API_KEY nell'ambiente."
            action={
              <Button variant="outline" onClick={() => router.back()}>
                Torna indietro
              </Button>
            }
            className="py-20"
          />
        ) : (
          <div className="grid grid-cols-1 gap-6 desktop:grid-cols-[minmax(0,1.7fr)_minmax(300px,0.85fr)]">
            {/* ── Left column: period selector + conversation + sticky composer ── */}
            <div className="flex min-w-0 flex-col gap-0">
              {/* ── Single period axis (A1) ── */}
              <div className="mb-5">
                <AssistantPeriodSelector
                  mode={mode}
                  onModeChange={handleModeChange}
                  selectedMonth={selectedMonth}
                  monthOptions={monthOptions}
                  onMonthChange={handleMonthChange}
                  selectedYear={selectedYear}
                  yearOptions={yearOptions}
                  onYearChange={handleYearChange}
                  chatContextType={chatContextType}
                  onChatContextTypeChange={handleChatContextChange}
                  disabled={isStreaming}
                />
              </div>

              {/* Proactive goal-completion banner (A3) — visible in any state. */}
              {user?.uid && (
                <AssistantSuggestionsBanner userId={user.uid} memory={memory} disabled={isStreaming} />
              )}

              {/* ── Empty state: shown when no messages exist yet ── */}
              {renderedMessages.length === 0 && !loadingThreadDetail && (
                <div className="mb-6 space-y-5">
                  {/* Mobile-only period scheda — on desktop it lives in the right column. */}
                  <div className="desktop:hidden">{renderPeriodScheda()}</div>

                  <div className="space-y-3">
                    <p className="text-sm font-medium text-foreground">{emptyStateQuestion}</p>

                    {/* What the assistant already knows about the user (A3). */}
                    {memory && (
                      <AssistantMemoryFacts memory={memory} onOpenMemory={() => setIsMemorySheetOpen(true)} />
                    )}

                    <AssistantPromptChips
                      chips={assistantPromptChips}
                      onSelect={handleChipClick}
                      disabled={isStreaming}
                    />
                  </div>

                  {/* Thread resume list — shown on every breakpoint now that the right
                      column no longer lists threads. The header sheet holds the full list. */}
                  {threads.length > 0 && (
                    <div>
                      <p className="mb-2 text-xs font-medium uppercase tracking-widest text-muted-foreground">
                        Riprendi conversazione
                      </p>
                      <div className="divide-y divide-border overflow-hidden rounded-xl border border-border">
                        {threads.slice(0, 5).map((thread) => (
                          <button
                            key={thread.id}
                            type="button"
                            onClick={() => handleSelectThread(thread)}
                            disabled={isStreaming}
                            className="w-full px-4 py-3 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring"
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
                </div>
              )}

              {/* Conversation area */}
              <div className="min-h-[200px] space-y-0 rounded-2xl border border-border bg-background overflow-hidden">
                {/* Conversation header */}
                <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
                  <div>
                    {/* Period label crossfades on period switch so the change registers
                        as a deliberate context shift, not a text flicker. */}
                    <AnimatePresence mode="wait" initial={false}>
                      <motion.p
                        key={activePeriodLabel}
                        className="text-sm font-medium text-foreground"
                        initial={{ opacity: 0, y: prefersReducedMotion ? 0 : 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: prefersReducedMotion ? 0 : -4 }}
                        transition={{ duration: prefersReducedMotion ? 0 : 0.2, ease: [0.22, 1, 0.36, 1] }}
                      >
                        {activePeriodLabel}
                      </motion.p>
                    </AnimatePresence>
                    {/* Mobile context strip: key delta at a glance during a conversation.
                        In the empty state the full mobile scheda already shows this, so the
                        pill is suppressed there to avoid two net-worth surfaces. */}
                    {contextBundle && renderedMessages.length > 0 && (
                      <div className="desktop:hidden">
                        <AssistantContextPill bundle={contextBundle} />
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {/* Streaming status badges. Web search gets its own badge so a slow
                        macro lookup doesn't read as a generic delay. */}
                    <AnimatePresence>
                      {isStreaming && streamStatus === 'searching' && (
                        <motion.div
                          key="searching-badge"
                          initial={{ opacity: 0, scale: 0.92 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.92 }}
                          transition={{ duration: prefersReducedMotion ? 0 : 0.18 }}
                        >
                          <Badge variant="outline" className="gap-1.5 text-xs text-muted-foreground">
                            <Globe className="h-3 w-3 animate-pulse" />
                            Sto cercando sul web…
                          </Badge>
                        </motion.div>
                      )}
                      {isStreaming && streamStatus !== 'searching' && !isSlowResponse && (
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
                      {isStreaming && streamStatus !== 'searching' && isSlowResponse && (
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
                  ) : renderedMessages.length === 0 && selectedThreadId ? (
                    <EmptyState
                      icon={MessageSquare}
                      title="Nessun messaggio ancora"
                      description="Scrivi la tua domanda nel composer in basso."
                      className="py-10"
                    />
                  ) : renderedMessages.length === 0 ? (
                    // No thread selected: the period scheda + question + chips above are the
                    // CTA, so the conversation box stays empty to avoid two competing prompts.
                    null
                  ) : (
                    <>
                      <AssistantStreamingResponse
                        messages={renderedMessages}
                        isInterrupted={isInterrupted}
                        onRetry={handleRetry}
                        streamingMessageId={streamingMessageId}
                      />
                      {/* Suggested next questions (B1) — submit directly on click. */}
                      <AssistantFollowUps
                        followUps={followUps}
                        onSelect={(prompt) => handleStreamSubmit(prompt)}
                        disabled={isStreaming}
                      />
                    </>
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
                  placeholder={composerPlaceholder}
                  errorHint={composerErrorHint}
                />
              </div>
            </div>

            {/* ── Right column: sticky period scheda (desktop) ──
                Conversazioni and Memoria now live behind header buttons → sheets on
                every breakpoint, so this column carries only the period scheda and can
                never trap scroll inside a second box. Natural height, sticky to the top. */}
            <div className="hidden desktop:flex desktop:flex-col desktop:gap-4 desktop:sticky desktop:top-6">
              {/* Period scheda — the numeric grounding for the selected period. */}
              <div>{renderPeriodScheda()}</div>

              {/* Query-level error callout */}
              {(threadsError || threadError || memoryError) && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    {(threadsError || threadError || memoryError)?.message}
                  </AlertDescription>
                </Alert>
              )}
            </div>
          </div>
        )}
      </div>
    </ProtectedRoute>
  );
}
