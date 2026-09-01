'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { describeWriteError } from '@/lib/utils/dialogNarrative';
import { AssistantComeFunziona } from '@/components/assistant/AssistantComeFunziona';
import { AssistantComposer } from '@/components/assistant/AssistantComposer';
import { AssistantConversazioneTile } from '@/components/assistant/AssistantConversazioneTile';
import { AssistantHeader } from '@/components/assistant/AssistantHeader';
import { AssistantLockedState } from '@/components/assistant/AssistantLockedState';
import { AssistantPeriodSelector } from '@/components/assistant/AssistantPeriodSelector';
import type { PromptRow } from '@/components/assistant/AssistantPromptRows';
import { AssistantSheets } from '@/components/assistant/AssistantSheets';
import { AssistantSuggestionsBanner } from '@/components/assistant/AssistantSuggestionsBanner';
import { CashflowContestoTile } from '@/components/assistant/tiles/CashflowContestoTile';
import { MemoriaTile } from '@/components/assistant/tiles/MemoriaTile';
import { PatrimonioContestoTile } from '@/components/assistant/tiles/PatrimonioContestoTile';
import { PageContainer } from '@/components/layout/PageContainer';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { PageVerdict } from '@/components/ui/page-verdict';
import { TileGridSkeleton } from '@/components/ui/tile-grid-skeleton';
import { useActiveAccount } from '@/contexts/ActiveAccountContext';
import { useDemoMode } from '@/lib/hooks/useDemoMode';
import { useDashboardOverview } from '@/lib/hooks/useDashboardOverview';
import { useAssistantMemory, useUpdateAssistantMemory } from '@/lib/hooks/useAssistantMemory';
import { useAssistantPeriodContext } from '@/lib/hooks/useAssistantPeriodContext';
import { useAssistantStreaming } from '@/lib/hooks/useAssistantStreaming';
import { useAssistantThread, useAssistantThreads, useDeleteAssistantThread } from '@/lib/hooks/useAssistantThreads';
import { assistantPromptChips } from '@/lib/constants/assistantPrompts';
import {
  buildAssistantPeriodVerdict,
  buildNoContextVerdict,
  describeAssistantHeader,
  describeConversation,
  formatPeriodInSentence,
  toNoContextVerdictInput,
} from '@/lib/utils/assistantNarrative';
import { buildFollowUpSuggestions } from '@/lib/utils/assistantFollowUps';
import { getAssistantPeriodLabel } from '@/lib/utils/assistantPeriodLabel';
import {
  buildComposerPlaceholder,
  buildEmptyStateQuestion,
  buildMonthOptions,
  buildYearOptions,
  findThreadForPeriod,
  getActivePeriodLabel,
  getPreviousCompletedMonth,
  resolveAssistantPreviewMode,
} from '@/lib/utils/assistantPeriodOptions';
import { getItalyMonthYear } from '@/lib/utils/dateHelpers';
import { MONTH_NAMES } from '@/lib/constants/months';
import type { TileSkeletonCell } from '@/lib/utils/tileGridSkeleton';
import {
  AssistantChatContextType,
  AssistantMode,
  AssistantMonthSelectorValue,
  AssistantPromptChip,
  AssistantThread,
} from '@/types/assistant';

interface AssistantPageClientProps {
  assistantConfigured: boolean;
}

/**
 * ASSISTENTE AI — a verdict over tiles (2026-08-27)
 *
 * The page opens with the CONTEXT the assistant answers on, as a verdict: for a period the
 * rule-generated sentence of `assistantNarrative.ts` («Luglio è andato bene.»), for a free
 * question with no period the Panoramica's own verdict on the live payload, reused verbatim.
 * The page's one axis — the period — sits beside the verdict from `desktop:` and under it
 * below; it governs the verdict, the companion tiles and the composer alike.
 *
 * Under the verdict the hero is `[2fr_1fr]`: the conversation on the left (a tile whose body is
 * the starter questions as rows, then the thread; the composer sticky under it) and, on the
 * right, a sticky `self-start` column of tiles at the Panoramica's cadence — the period's net
 * worth, its cashflow, what the memory holds. This is the one asymmetric hero left in the app:
 * the conversation IS the content. Below the grid, «Come funziona» behind a disclosure.
 *
 *   Desktop:  [Conversazione · composer]  |  [Patrimonio · Cashflow · Cosa sa di te] (sticky)
 *   Mobile:   verdict → axis → conversation → composer → the three tiles → Come funziona
 *
 * Streaming state and the SSE lifecycle live in useAssistantStreaming; every visual block is
 * an extracted module-level component, and no component computes a figure.
 */

/** The grid's geometry for the skeleton: the conversation left, two companion tiles right. */
const SKELETON_CELLS: TileSkeletonCell[] = [
  { span: 8, rows: 2, lines: 10 },
  { span: 4, lines: 5 },
  { span: 4, lines: 4 },
];

export function AssistantPageClient({ assistantConfigured }: AssistantPageClientProps) {
  const { ownerId } = useActiveAccount();
  const isDemo = useDemoMode();
  const conversationEndRef = useRef<HTMLDivElement>(null);

  // Italy current month/year — stable for the session
  const today = useMemo(() => getItalyMonthYear(new Date()), []);

  // Month and year options are stable for the session — computed once on mount
  const monthOptions = useMemo(() => buildMonthOptions(), []);
  const yearOptions = useMemo(() => buildYearOptions(), []);

  const [selectedThreadId, setSelectedThreadId] = useState<string>();
  const [draft, setDraft] = useState('');
  const [mode, setMode] = useState<AssistantMode>('month_analysis');
  const [selectedMonth, setSelectedMonth] = useState<AssistantMonthSelectorValue>(
    // Default to the last completed month — it always has data, so the verdict and the
    // composer are usable from the first render (see getPreviousCompletedMonth).
    () => getPreviousCompletedMonth()
  );
  const [selectedYear, setSelectedYear] = useState<number>(() => getItalyMonthYear(new Date()).year);
  // Optional period attached to a free (Libera) question — drives both the verdict
  // and what numeric bundle the server builds for the chat answer.
  const [chatContextType, setChatContextType] = useState<AssistantChatContextType>('none');

  // Sheets are controlled here because more than one surface opens them: the
  // header icons and the companion memory tile.
  const [isThreadSheetOpen, setIsThreadSheetOpen] = useState(false);
  const [isMemorySheetOpen, setIsMemorySheetOpen] = useState(false);

  // Dashboard overview — the numbers of «oggi» for a free question with no period attached.
  // Reuses the React Query cache from Panoramica if the user visited it this session.
  const { data: overviewData, isError: overviewError } = useDashboardOverview(ownerId);

  const { data: threads = [], isLoading: loadingThreads, error: threadsError } = useAssistantThreads(ownerId);
  const { data: threadDetail, isLoading: loadingThreadDetail, error: threadError } = useAssistantThread(
    selectedThreadId,
    ownerId
  );
  const { data: memory, isLoading: loadingMemory, error: memoryError } = useAssistantMemory(ownerId);
  const updateMemoryMutation = useUpdateAssistantMemory(ownerId ?? '');
  const deleteThreadMutation = useDeleteAssistantThread(ownerId ?? '');

  // ── Streaming engine ──
  const streaming = useAssistantStreaming({
    ownerId,
    selectedThreadId,
    onThreadIdResolved: setSelectedThreadId,
    draft,
    onDraftConsumed: () => setDraft(''),
    threadMessages: threadDetail?.messages,
    mode,
    selectedMonth,
    selectedYear,
    chatContextType,
    preferences: memory?.preferences,
  });

  const {
    streamingMessages,
    renderedMessages,
    streamingMessageId,
    isStreaming,
    isInterrupted,
    isSlowResponse,
    streamStatus,
    contextBundle,
    setContextBundle,
  } = streaming;

  // Effective period for the context: a loaded thread pins its own period; otherwise the
  // live selector drives a preview so the verdict fills in *before* the first question.
  const hasActiveThread = !!selectedThreadId;
  const pinnedMonth = threadDetail?.thread.pinnedMonth ?? null;
  const pinnedYear = threadDetail?.thread.pinnedYear ?? null;
  const threadMode = threadDetail?.thread.mode ?? mode;
  const previewMode = hasActiveThread ? threadMode : resolveAssistantPreviewMode(mode, chatContextType);
  const previewMonth = hasActiveThread ? pinnedMonth : selectedMonth;
  const previewYear = hasActiveThread ? pinnedYear : selectedYear;
  // A free question with no period: the verdict and the first tile read the Panoramica's payload.
  const isNoContext = previewMode === 'chat';

  // Fetch the context bundle whenever a period is selected and no SSE bundle is active.
  // SSE bundle always takes priority over the fetched one. Free (chat) mode has no
  // numeric period, so it never fetches — «Patrimonio oggi» stands in instead.
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
    shouldFetchContext ? ownerId : undefined,
    previewMode,
    previewMonth,
    previewYear,
    today.year,
    // history start year: the hook fetches it server-side; pass 0 as placeholder key
    0,
    shouldFetchContext
  );

  // Populate the context from the fetched bundle when no SSE bundle is present.
  // SSE bundle (set by the streaming hook) always takes priority — this effect
  // only fires when contextBundle is still null.
  useEffect(() => {
    if (fetchedContextBundle && contextBundle === null) {
      setContextBundle(fetchedContextBundle);
    }
  }, [fetchedContextBundle]); // eslint-disable-line react-hooks/exhaustive-deps

  // Follow-up chips: shown after a completed assistant answer, derived purely
  // from the answer's mode + the period bundle. Hidden while streaming.
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
    // Deferred with setTimeout(0) so the sync happens outside the effect body
    // (react-hooks/set-state-in-effect) — the selection is user-editable state
    // that must ALSO follow the loaded thread, so it cannot be purely derived.
    const timer = setTimeout(() => {
      setMode(threadDetail.thread.mode);
      if (threadDetail.thread.pinnedMonth) {
        setSelectedMonth(threadDetail.thread.pinnedMonth);
      }
      if (threadDetail.thread.pinnedYear) {
        setSelectedYear(threadDetail.thread.pinnedYear);
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [threadDetail]); // eslint-disable-line react-hooks/exhaustive-deps

  // Scroll to the bottom when messages are available, but not while the thread
  // is still loading — scrolling to an empty area before content arrives feels jarring.
  // During streaming use instant scroll so new tokens stay visible without jank:
  // smooth scroll on every token triggers continuous CSS animation on slow devices.
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

  // CTA is disabled when month_analysis mode has no data available to analyse.
  const isAnalysisBlocked = useMemo(
    () =>
      mode === 'month_analysis' &&
      contextBundle !== null &&
      !contextBundle.dataQuality.hasSnapshot &&
      !contextBundle.dataQuality.hasCashflowData,
    [mode, contextBundle]
  );

  const canSubmit = draft.trim().length > 0 && !isStreaming && !isAnalysisBlocked;

  // ── The words (pure layer) ──
  const verdict = useMemo(() => {
    if (isNoContext) {
      if (overviewData === undefined && !overviewError) return null;
      return buildNoContextVerdict(overviewData ? toNoContextVerdictInput(overviewData, today.month) : null);
    }
    return contextBundle ? buildAssistantPeriodVerdict(contextBundle, today) : null;
  }, [isNoContext, overviewData, overviewError, contextBundle, today]);

  const activeItems = useMemo(() => (memory?.items ?? []).filter((item) => item.status === 'active'), [memory]);
  const activeGoalsCount = activeItems.filter((item) => item.category === 'goal').length;
  const headerDescription = describeAssistantHeader({
    threads: threads.length,
    goals: activeGoalsCount,
    facts: activeItems.length - activeGoalsCount,
  });

  const isEmptyState = renderedMessages.length === 0 && !selectedThreadId && !loadingThreadDetail;
  const emptyStateQuestion = buildEmptyStateQuestion(mode, selectedMonth, selectedYear);
  const conversationReading = useMemo(
    () =>
      describeConversation({
        messageCount: renderedMessages.length,
        question: emptyStateQuestion,
        periodLabel: isNoContext || !contextBundle ? null : formatPeriodInSentence(contextBundle.selector),
        webSearchUsed: renderedMessages.some((message) => message.role === 'assistant' && message.webSearchUsed === true),
      }),
    [renderedMessages, emptyStateQuestion, isNoContext, contextBundle]
  );

  // The starter questions as rows: the one targeting the active period leads.
  const promptRows = useMemo<PromptRow[]>(() => {
    const rows = assistantPromptChips.map<PromptRow>((chip) => ({
      id: chip.id,
      label: chip.label,
      primary: chip.mode === mode,
      webSearch: chip.webContextHint === 'macro',
    }));
    return [...rows.filter((row) => row.primary), ...rows.filter((row) => !row.primary)];
  }, [mode]);

  // ── Handlers ──
  const handleModeChange = (newMode: AssistantMode) => {
    if (isStreaming) return;
    setMode(newMode);
    // Reset the bundle so the verdict re-fetches the new period's preview.
    setContextBundle(null);
    // Auto-select an existing thread matching the new mode + period — explicit
    // user action only, scanning the already-loaded list (no extra fetch).
    const match = findThreadForPeriod(threads, newMode, selectedMonth, selectedYear);
    if (match) {
      setSelectedThreadId(match.id);
      streaming.resetStream();
      // Thread sync useEffect will update mode/month/year when threadDetail resolves
    }
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

  // Attaching/detaching a period to a Libera question re-fetches the preview.
  const handleChatContextChange = (type: AssistantChatContextType) => {
    setChatContextType(type);
    if (renderedMessages.length === 0) setContextBundle(null);
  };

  // Starter rows prefill the composer (so the user can confirm the period before sending).
  const handlePromptSelect = (row: PromptRow) => {
    const chip = assistantPromptChips.find((c: AssistantPromptChip) => c.id === row.id);
    if (!chip) return;
    setMode(chip.mode);
    setContextBundle(null);
    setDraft(chip.prompt);
  };

  const handlePreferencesChange = async (
    patch: Partial<NonNullable<typeof memory>['preferences']>
  ) => {
    if (!ownerId) return;
    try {
      await updateMemoryMutation.mutateAsync({ preferences: patch });
    } catch (error) {
      toast.error(describeWriteError(error));
    }
  };

  // Deselects the current thread so the empty state reappears and the next
  // submit creates a fresh thread server-side (threadId omitted from the request).
  const handleNewThread = () => {
    setSelectedThreadId(undefined);
    streaming.resetStream();
    setContextBundle(null);
    setDraft('');
  };

  const handleSelectThread = (thread: AssistantThread) => {
    setSelectedThreadId(thread.id);
    streaming.resetStream();
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
      toast.error(describeWriteError(error));
    }
  };

  const activePeriodLabel = getActivePeriodLabel(mode, selectedMonth, selectedYear);
  const activeMonthLabel = `${MONTH_NAMES[selectedMonth.month - 1]} ${selectedMonth.year}`;
  const composerPlaceholder = buildComposerPlaceholder(mode, chatContextType, selectedMonth, selectedYear);

  const composerErrorHint = isAnalysisBlocked
    ? `Nessun dato disponibile per ${activeMonthLabel}. Seleziona un altro periodo.`
    : undefined;

  const queryError = threadsError || threadError || memoryError;

  // Show skeleton while threads resolve on first load
  if (loadingThreads) {
    return (
      <ProtectedRoute>
        <PageContainer width="wide">
          <AssistantHeader
            isDemo={isDemo}
            isStreaming={false}
            threadsCount={0}
            activeMemoryCount={activeItems.length}
            description="Caricamento…"
            memory={memory}
            loadingMemory={loadingMemory}
            isPreferencesPending={false}
            onPreferencesChange={handlePreferencesChange}
            onNewThread={handleNewThread}
            onOpenThreads={() => setIsThreadSheetOpen(true)}
            onOpenMemory={() => setIsMemorySheetOpen(true)}
          />
          <TileGridSkeleton cells={SKELETON_CELLS} />
        </PageContainer>
      </ProtectedRoute>
    );
  }

  // The companion column: the numbers the assistant reasons on, then what it knows of the user.
  const companionTiles = (
    <>
      {isNoContext ? (
        <PatrimonioContestoTile mode="today" overview={overviewError ? null : overviewData} />
      ) : contextBundle ? (
        <>
          <PatrimonioContestoTile mode="period" bundle={contextBundle} today={today} />
          {contextBundle.dataQuality.hasCashflowData && (
            <CashflowContestoTile cashflow={contextBundle.cashflow} periodLabel={getAssistantPeriodLabel(contextBundle.selector)} />
          )}
        </>
      ) : loadingContextBundle ? (
        <TileGridSkeleton verdict={false} cells={[{ span: 12, lines: 5 }, { span: 12, lines: 4 }]} />
      ) : null}
      <MemoriaTile memory={memory} onOpenMemory={() => setIsMemorySheetOpen(true)} />
      {queryError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" aria-hidden="true" />
          <AlertDescription>{queryError.message}</AlertDescription>
        </Alert>
      )}
    </>
  );

  return (
    <ProtectedRoute>
      <PageContainer width="wide">
        <AssistantHeader
          isDemo={isDemo}
          isStreaming={isStreaming}
          threadsCount={threads.length}
          activeMemoryCount={activeItems.length}
          description={headerDescription}
          memory={memory}
          loadingMemory={loadingMemory}
          isPreferencesPending={updateMemoryMutation.isPending}
          onPreferencesChange={handlePreferencesChange}
          onNewThread={handleNewThread}
          onOpenThreads={() => setIsThreadSheetOpen(true)}
          onOpenMemory={() => setIsMemorySheetOpen(true)}
        />

        <AssistantSheets
          ownerId={ownerId}
          isThreadSheetOpen={isThreadSheetOpen}
          onThreadSheetOpenChange={setIsThreadSheetOpen}
          isMemorySheetOpen={isMemorySheetOpen}
          onMemorySheetOpenChange={setIsMemorySheetOpen}
          threads={threads}
          loadingThreads={loadingThreads}
          selectedThreadId={selectedThreadId}
          isStreaming={isStreaming}
          isDeletingId={deleteThreadMutation.variables as string | undefined}
          onSelectThread={handleSelectThread}
          onDeleteThread={handleDeleteThread}
          memory={memory}
          loadingMemory={loadingMemory}
        />

        {isDemo ? (
          <AssistantLockedState
            eyebrow="Assistente non disponibile"
            message="L'Assistente AI non è accessibile nell'account demo."
          />
        ) : !assistantConfigured ? (
          <AssistantLockedState
            eyebrow="Assistente non configurato"
            message="La pagina resta accessibile, ma per usare l'assistente serve la chiave ANTHROPIC_API_KEY nell'ambiente."
          />
        ) : (
          <>
            {/* The verdict is the context; the page's one axis sits beside it from desktop. */}
            <div className="flex flex-col gap-4 pt-1 desktop:flex-row desktop:items-start desktop:justify-between desktop:gap-6">
              {verdict ? (
                <PageVerdict verdict={verdict} ariaLabel="Verdetto sul contesto" />
              ) : (
                <TileGridSkeleton cells={[]} className="max-w-[920px] flex-1" />
              )}
              <div className="min-w-0 desktop:shrink-0">
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
            </div>

            <div className="grid grid-cols-1 gap-3 desktop:grid-cols-[2fr_1fr] desktop:items-start">
              {/* ── Hero left: the conversation, the content of the page ── */}
              <div className="flex min-w-0 flex-col gap-3">
                {/* Proactive goal-completion tiles — visible in any state. */}
                {ownerId && <AssistantSuggestionsBanner userId={ownerId} memory={memory} disabled={isStreaming} />}

                <AssistantConversazioneTile
                  periodLabel={activePeriodLabel}
                  reading={conversationReading}
                  isEmpty={isEmptyState}
                  promptRows={promptRows}
                  onPromptSelect={handlePromptSelect}
                  renderedMessages={renderedMessages}
                  loadingThreadDetail={loadingThreadDetail}
                  hasSelectedThread={!!selectedThreadId}
                  isStreaming={isStreaming}
                  streamStatus={streamStatus}
                  isSlowResponse={isSlowResponse}
                  isInterrupted={isInterrupted}
                  streamingMessageId={streamingMessageId}
                  followUps={followUps}
                  onRetry={streaming.retry}
                  onFollowUpSelect={(prompt) => streaming.submit(prompt)}
                  conversationEndRef={conversationEndRef}
                />

                {/* Sticky composer — stays at the bottom of the viewport as the conversation grows. */}
                <div className="sticky bottom-0 z-10 max-desktop:portrait:bottom-20">
                  <AssistantComposer
                    draft={draft}
                    onChange={setDraft}
                    onSubmit={streaming.submit}
                    onStop={streaming.stop}
                    isStreaming={isStreaming}
                    canSubmit={canSubmit}
                    placeholder={composerPlaceholder}
                    errorHint={composerErrorHint}
                  />
                </div>
              </div>

              {/* ── Hero right: the companion, sticky and self-start so it can travel ── */}
              <div className="flex min-w-0 flex-col gap-3 desktop:sticky desktop:top-5 desktop:self-start">
                {companionTiles}
              </div>
            </div>

            <AssistantComeFunziona />
          </>
        )}
      </PageContainer>
    </ProtectedRoute>
  );
}
