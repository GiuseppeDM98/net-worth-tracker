'use client';

import { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { describeWriteError } from '@/lib/utils/dialogNarrative';
import { AssistantComeFunziona } from '@/components/assistant/AssistantComeFunziona';
import { LinkBanner } from '@/components/ui/link-banner';
import { AssistantComposer } from '@/components/assistant/AssistantComposer';
import { AssistantConversazioneTile } from '@/components/assistant/AssistantConversazioneTile';
import { AssistantHeader } from '@/components/assistant/AssistantHeader';
import { AssistantLockedState } from '@/components/assistant/AssistantLockedState';
import type { PromptRow } from '@/components/assistant/AssistantPromptRows';
import { AssistantModals } from '@/components/assistant/AssistantModals';
import { AssistantRouteChooser } from '@/components/assistant/AssistantRouteChooser';
import { AssistantSuggestionsBanner } from '@/components/assistant/AssistantSuggestionsBanner';
import { CashflowContestoTile } from '@/components/assistant/tiles/CashflowContestoTile';
import { MemoriaTile } from '@/components/assistant/tiles/MemoriaTile';
import { PatrimonioContestoTile } from '@/components/assistant/tiles/PatrimonioContestoTile';
import { RegistraContestoTile } from '@/components/assistant/tiles/RegistraContestoTile';
import { RegisterRefsProvider, useRegisterReads } from '@/components/assistant/RegisterRefsContext';
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
import {
  buildAssistantPeriodVerdict,
  buildNoContextVerdict,
  buildRegisterVerdict,
  describeAssistantHeader,
  describeConversation,
  formatPeriodInSentence,
  toNoContextVerdictInput,
} from '@/lib/utils/assistantNarrative';
import { answerFollowUps, type AssistantFollowUp } from '@/lib/utils/assistantAnswerTail';
import { nextStreamFollow } from '@/lib/utils/streamFollow';
import { readAssistantQuestionBlocks } from '@/lib/utils/assistantQuestionBlocks';
import { isValidQuestionBlock } from '@/components/assistant/MessageQuestionsContext';
import { getAssistantPeriodLabel } from '@/lib/utils/assistantPeriodLabel';
import { buildEmptyChatSuggestions, describeRoute, EMPTY_CHAT_QUESTION } from '@/lib/utils/assistantChatNarrative';
import { getActivePeriodLabel } from '@/lib/utils/assistantPeriodOptions';
import { conversationScrollSignal } from '@/lib/utils/assistantStreamBuffer';
import { getItalyMonthYear } from '@/lib/utils/dateHelpers';
import { sceneVariants, sceneVariantsReduced } from '@/lib/utils/motionVariants';
import type { TileSkeletonCell } from '@/lib/utils/tileGridSkeleton';
import {
  AssistantMessage,
  AssistantMode,
  AssistantMonthContextBundle,
  AssistantRouteOverride,
  AssistantRouteReading,
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
 *
 * Only a chat (2026-11-12): no period axis, no «Registra» button. Every message goes as
 * `mode: 'auto'`; the router reads what it is and on which period, the stream's `route` event
 * sets the turn's mode, and «Ho letto: … · cambia» under the last answer lets the owner read it
 * again another way («Rileggi», a new turn). The mode the page is shown in — verdict, companion,
 * cards — is the last answer's (`displayMode`).
 *
 * Under the verdict the hero is `[2fr_1fr]`: the conversation on the left (a tile whose body is
 * four suggestions built from what the account holds, then the thread; the composer sticky under it) and, on the
 * right, a sticky `self-start` column of tiles at the Panoramica's cadence — the period's net
 * worth, its cashflow, what the memory holds. This is the one asymmetric hero left in the app:
 * the conversation IS the content. Below the grid, «Come funziona» behind a disclosure.
 *
 *   Desktop:  [Conversazione · composer]  |  [Patrimonio · Cashflow · Cosa sa di te] (sticky)
 *   Mobile:   verdict → conversation → composer → the three tiles → Come funziona
 *
 * A registration is a message read as one: the verdict says what the assistant knows and the
 * companion shows it — the accounts, the categories' count — from the reads the page holds. A
 * change of mode keeps the conversation still and slides the companion's content, as a screen of
 * the Consulente. `?thread=<id>` opens a conversation; `?mode=registra` (Cashflow's link) puts the
 * register suggestions first and is dropped from the URL.
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

/** The modes in a fixed order, Registra last: the companion slides forward to a later one. */
const MODE_ORDER: AssistantMode[] = ['month_analysis', 'year_analysis', 'ytd_analysis', 'history_analysis', 'chat', 'register'];

/** `?thread=<id>` as the URL's record of the open conversation: written, never navigated (no re-render, no history entry). */
function writeThreadParam(threadId: string | undefined) {
  const url = new URL(window.location.href);
  if (threadId) url.searchParams.set('thread', threadId);
  else url.searchParams.delete('thread');
  window.history.replaceState(null, '', url);
}

/** A reading as the route it is re-sent with: the server stamps an override `confidence: 1`. */
function readingToRoute(reading: AssistantRouteReading): AssistantRouteOverride {
  const { intent, period, webSearch } = reading.route;
  return { intent, period, webSearch };
}

const REGISTER_ROUTE: AssistantRouteOverride = { intent: 'register', period: { kind: 'none' }, webSearch: false };

/**
 * The route of a message asked in an explicit mode (no reading): its own mode and period, so the
 * reply to its question card is never read from scratch by the router (2026-11-25). Undefined when
 * the message does not say its period.
 */
function modeToRoute({ mode, monthContext }: Pick<AssistantMessage, 'mode' | 'monthContext'>): AssistantRouteOverride | undefined {
  if (mode === 'register') return REGISTER_ROUTE;
  if (mode === 'chat') return { intent: 'chat', period: { kind: 'none' }, webSearch: false };
  if (mode === 'ytd_analysis') return { intent: mode, period: { kind: 'ytd' }, webSearch: false };
  if (mode === 'history_analysis') return { intent: mode, period: { kind: 'history' }, webSearch: false };
  if (!monthContext) return undefined;
  if (mode === 'year_analysis') return { intent: mode, period: { kind: 'year', year: monthContext.year }, webSearch: false };
  return { intent: mode, period: { kind: 'month', year: monthContext.year, month: monthContext.month }, webSearch: false };
}

export function AssistantPageClient({ assistantConfigured }: AssistantPageClientProps) {
  const { ownerId } = useActiveAccount();
  const isDemo = useDemoMode();
  const conversationEndRef = useRef<HTMLDivElement>(null);
  // The composer's textarea: a suggestion, `?mode=registra` and a prefilled follow-up move the focus here.
  const composerRef = useRef<HTMLTextAreaElement>(null);
  // The composer's «Interrompi risposta»: «Rileggi» sends the focus there (the textarea is disabled while streaming).
  const stopRef = useRef<HTMLButtonElement>(null);
  // The copy of «⋯» last used, and where the open modal returns the focus (null: its own opener).
  const moreTriggerRef = useRef<HTMLButtonElement | null>(null);
  const modalReturnRef = useRef<HTMLElement | null>(null);
  // The «cambia» that opened the chooser: «Annulla» and Esc return there.
  const changeOpenerRef = useRef<HTMLElement | null>(null);
  const searchParams = useSearchParams();
  const prefersReducedMotion = useReducedMotion();

  // Italy current month/year — stable for the session
  const today = useMemo(() => getItalyMonthYear(new Date()), []);

  // The open conversation: the URL's `?thread=` at mount, then the user's pick or a stream's new thread.
  const [selectedThreadId, setSelectedThreadId] = useState<string | undefined>(() => searchParams.get('thread') ?? undefined);
  const [draft, setDraft] = useState('');
  // `?mode=registra` (Cashflow's link), read once: the register suggestions lead, the reads start early.
  const [registerFirst] = useState(() => searchParams.get('mode') === 'registra');
  const [registerPrefetch, setRegisterPrefetch] = useState(registerFirst);

  // The modals are controlled here because more than one surface opens them: the header's «⋯»
  // and the companion memory tile.
  const [isThreadsOpen, setIsThreadsOpen] = useState(false);
  const [isMemoryOpen, setIsMemoryOpen] = useState(false);
  const [isPreferencesOpen, setIsPreferencesOpen] = useState(false);
  // The chooser «cambia» opens, and the reading it starts from (kept while it closes).
  const [isChooserOpen, setIsChooserOpen] = useState(false);
  const [chooserReading, setChooserReading] = useState<AssistantRouteReading | null>(null);

  // Dashboard overview — the numbers of «oggi» for a free question with no period attached.
  // Reuses the React Query cache from Panoramica if the user visited it this session.
  const { data: overviewData, isError: overviewError } = useDashboardOverview(ownerId);

  // One page of 50 at a time.
  const {
    data: threads = [],
    isLoading: loadingThreads,
    error: threadsError,
    hasNextPage: hasMoreThreads,
    isFetchingNextPage: loadingMoreThreads,
    fetchNextPage: fetchMoreThreads,
  } = useAssistantThreads(ownerId);
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
    onThreadIdResolved: (threadId) => {
      setSelectedThreadId(threadId);
      writeThreadParam(threadId);
    },
    draft,
    onDraftConsumed: () => setDraft(''),
    threadMessages: threadDetail?.messages,
    preferences: memory?.preferences,
  });

  const {
    streamingMessages,
    renderedMessages,
    streamingMessageId,
    isStreaming,
    isInterrupted,
    streamStatus,
    contextBundle,
    setContextBundle,
  } = streaming;

  // The mode the page is shown in: the last answer's (its `route` event set it), else the thread's.
  const lastAssistant = renderedMessages.findLast((message) => message.role === 'assistant');
  const lastUserPrompt = renderedMessages.findLast((message) => message.role === 'user')?.content;
  const displayMode: AssistantMode = lastAssistant?.mode ?? threadDetail?.thread.mode ?? 'chat';
  const isRegister = displayMode === 'register';

  // The companion's scene: which way its content slides at a change of mode. Settled during
  // render from the mode it was last drawn for, so every path that changes it — a `route` event,
  // a thread opened from the list — gets its direction without setting one.
  const [scene, setScene] = useState<{ mode: AssistantMode; direction: 1 | -1 }>({ mode: displayMode, direction: 1 });
  if (scene.mode !== displayMode) {
    setScene({ mode: displayMode, direction: MODE_ORDER.indexOf(displayMode) >= MODE_ORDER.indexOf(scene.mode) ? 1 : -1 });
  }

  // What a proposed row is read against, and the companion's summary: the expense form's four
  // reads, enabled once the conversation holds a registration (the one mode that renders an
  // expense card), or early when a register suggestion was picked or `?mode=registra` asked.
  const needsRegisterReads =
    renderedMessages.some((message) => message.role === 'assistant' && message.mode === 'register') || registerPrefetch;
  const registerReads = useRegisterReads(ownerId, needsRegisterReads && !isDemo);

  // The period the context is read for: a loaded thread pins its own period.
  const pinnedMonth = threadDetail?.thread.pinnedMonth ?? null;
  const pinnedYear = threadDetail?.thread.pinnedYear ?? null;
  const previewMode = displayMode;
  const previewMonth = pinnedMonth;
  const previewYear = pinnedYear;
  // A free question with no period: the verdict and the first tile read the Panoramica's payload.
  const isNoContext = previewMode === 'chat';

  // Fetch the context bundle whenever a period is selected and no SSE bundle is active.
  // SSE bundle always takes priority over the fetched one. Free (chat) mode has no
  // numeric period, so it never fetches — «Patrimonio oggi» stands in instead (the prompt still
  // gets the portfolio of today from the route, 2026-10-20; no bundle travels back on the stream).
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
    shouldFetchContext,
    // Already read with the memory above: sent along so the route does not read it again.
    memory?.preferences.includeDummySnapshots
  );

  // Populate the context from the fetched bundle when no SSE bundle is present.
  // SSE bundle (set by the streaming hook) always takes priority — this effect
  // only fires when contextBundle is still null. An Effect Event: the current bundle is read,
  // never a trigger — only a newly fetched bundle runs it.
  const adoptFetchedBundle = useEffectEvent((bundle: AssistantMonthContextBundle) => {
    if (contextBundle === null) {
      setContextBundle(bundle);
    }
  });
  useEffect(() => {
    if (fetchedContextBundle) {
      adoptFetchedBundle(fetchedContextBundle);
    }
  }, [fetchedContextBundle]);

  // Follow-up chips: shown after a completed assistant answer — the next questions the model wrote
  // for it (2026-11-25), Registra's starters on a registration, none beside a question card. Hidden
  // while streaming.
  const followUps = useMemo(() => {
    const last = renderedMessages[renderedMessages.length - 1];
    const isComplete = !isStreaming && streamingMessageId === undefined && !isInterrupted;
    if (!isComplete || !last || last.role !== 'assistant' || last.content.trim().length === 0) {
      return [];
    }
    // A card of the last answer wrote its row: the next one starts from an empty composer.
    const afterWrittenCard = Object.values(last.proposals ?? {}).some((state) => state.status === 'written');
    return answerFollowUps({
      mode: last.mode,
      followUps: last.followUps,
      hasQuestionCard: readAssistantQuestionBlocks(last.content, last.mode).some(isValidQuestionBlock),
      hasWrittenCard: afterWrittenCard,
    });
  }, [renderedMessages, isStreaming, streamingMessageId, isInterrupted]);

  // Scroll to the bottom when messages are available, but not while the thread
  // is still loading — scrolling to an empty area before content arrives feels jarring.
  // During streaming use instant scroll so new tokens stay visible without jank:
  // smooth scroll on every token triggers continuous CSS animation on slow devices.
  // The signal leaves out a card's outcome: «Conferma» and «Ignora» never move the page.
  const scrollSignal = conversationScrollSignal(renderedMessages);

  // The page follows the conversation only while the reader stays at its end (owner, 2026-11-25:
  // every chunk, the stream's start and its end brought the page back down). A scroll up of the
  // page's scroll container stops it, a scroll back down to the end starts it again
  // (`nextStreamFollow`); a message the reader SENDS starts it (the count of user messages — never
  // the whole count, which changes when the stream buffer gives way to the saved thread), and so
  // does opening a thread.
  const followStreamRef = useRef(true);
  const userMessageCount = renderedMessages.filter((message) => message.role === 'user').length;
  const userMessageCountRef = useRef(userMessageCount);
  useEffect(() => {
    // Captured on the document: the conversation (and its scroll container, the layout's `main`)
    // may mount after the page, while a thread loads.
    let previousTop: number | null = null;
    const onScroll = (event: Event) => {
      const end = conversationEndRef.current;
      const container = end?.closest('main');
      if (!end || !container || event.target !== container) return;
      const top = container.scrollTop;
      const endVisible = end.getBoundingClientRect().top <= container.getBoundingClientRect().bottom;
      followStreamRef.current = nextStreamFollow(previousTop ?? top, top, endVisible, followStreamRef.current);
      previousTop = top;
    };
    document.addEventListener('scroll', onScroll, { capture: true, passive: true });
    return () => document.removeEventListener('scroll', onScroll, { capture: true });
  }, []);

  useEffect(() => {
    if (loadingThreadDetail && !isStreaming) followStreamRef.current = true;
  }, [loadingThreadDetail, isStreaming]);

  useEffect(() => {
    if (scrollSignal === '') return;
    if (loadingThreadDetail && !isStreaming) return;
    const el = conversationEndRef.current;
    if (!el) return;
    if (userMessageCount > userMessageCountRef.current) followStreamRef.current = true;
    userMessageCountRef.current = userMessageCount;
    if (!followStreamRef.current) return;
    // `nearest`: only as far as the end needs to come into view (its scroll margin clears the
    // sticky composer) — never the end aligned to the top, which threw the page down.
    el.scrollIntoView({ behavior: isStreaming ? 'instant' : 'smooth', block: 'nearest' });
  }, [scrollSignal, loadingThreadDetail, isStreaming, userMessageCount]);

  const canSubmit = draft.trim().length > 0 && !isStreaming;

  // ── The words (pure layer) ──
  const registerSummary = streaming.registerSummary ?? registerReads.summary;
  const verdict = useMemo(() => {
    // Registra has no period: the verdict is what the assistant knows, never the skeleton.
    if (isRegister) return buildRegisterVerdict(registerSummary);
    if (isNoContext) {
      if (overviewData === undefined && !overviewError) return null;
      return buildNoContextVerdict(overviewData ? toNoContextVerdictInput(overviewData, today.month) : null);
    }
    return contextBundle ? buildAssistantPeriodVerdict(contextBundle, today) : null;
  }, [isRegister, registerSummary, isNoContext, overviewData, overviewError, contextBundle, today]);

  const activeItems = useMemo(() => (memory?.items ?? []).filter((item) => item.status === 'active'), [memory]);
  const activeGoalsCount = activeItems.filter((item) => item.category === 'goal').length;
  const headerDescription = describeAssistantHeader({
    threads: threads.length,
    moreThreads: hasMoreThreads,
    goals: activeGoalsCount,
    facts: activeItems.length - activeGoalsCount,
  });

  const isEmptyState = renderedMessages.length === 0 && !selectedThreadId && !loadingThreadDetail;
  const conversationReading = describeConversation({
    messageCount: renderedMessages.length,
    question: EMPTY_CHAT_QUESTION,
    periodLabel: isNoContext || !contextBundle ? null : formatPeriodInSentence(contextBundle.selector),
    webSearchUsed: renderedMessages.some((message) => message.role === 'assistant' && message.webSearchUsed === true),
    mode: displayMode,
  });

  // How the last answer was read, as the tile's aside: its reading, capitalised; an answer saved
  // before the router (no reading) keeps the label of its mode and the thread's pins; none when empty.
  const lastRouteLabel = lastAssistant?.routeReading ? describeRoute(lastAssistant.routeReading.route) : null;
  const periodLabel = !lastAssistant
    ? null
    : lastRouteLabel
      ? lastRouteLabel.charAt(0).toUpperCase() + lastRouteLabel.slice(1)
      : getActivePeriodLabel(displayMode, pinnedMonth ?? today, pinnedYear ?? today.year);

  // The four suggestions of an empty chat, from what the account holds; four skeletons while it loads.
  const suggestions = buildEmptyChatSuggestions({ overview: overviewError ? null : overviewData, today, registerFirst });
  const promptRows: PromptRow[] | null =
    overviewData === undefined && !overviewError
      ? null
      : suggestions.map((row, index) => ({ id: row.id, label: row.label, primary: index === 0 }));

  // The one answer whose reading may change: the last, complete, with a reading, outside the demo.
  const changeableMessageId = !isStreaming && !isDemo && lastAssistant?.routeReading ? lastAssistant.id : undefined;

  // The route a question card's answer is sent with: the asking message's reading, or, for a
  // message asked in an explicit mode or saved before the router, the route of its own mode.
  const askingRoute: AssistantRouteOverride | undefined = lastAssistant?.routeReading
    ? readingToRoute(lastAssistant.routeReading)
    : lastAssistant ? modeToRoute(lastAssistant) : undefined;

  // ── Handlers ──
  // A suggestion fills the composer — a register row is the start of a sentence to finish — and
  // sends nothing: the focus goes to the composer with the caret at the end.
  const handleSuggestionSelect = (row: PromptRow) => {
    const suggestion = suggestions.find((candidate) => candidate.id === row.id);
    if (!suggestion) return;
    setDraft(suggestion.text);
    if (suggestion.register) setRegisterPrefetch(true);
    requestAnimationFrame(() => {
      const el = composerRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(suggestion.text.length, suggestion.text.length);
    });
  };

  // «cambia»: the chooser opens on the answer's reading; «Annulla» and Esc return to the button.
  const handleChangeReading = (message: AssistantMessage, opener: HTMLElement) => {
    if (!message.routeReading) return;
    changeOpenerRef.current = opener;
    setChooserReading(message.routeReading);
    setIsChooserOpen(true);
  };

  // «Rileggi»: the last prompt again as a new turn with the chosen route (never `routeCarried`);
  // the answer before stays. The focus goes to «Interrompi risposta» once the turn has begun.
  const handleReread = (route: AssistantRouteOverride) => {
    setIsChooserOpen(false);
    if (!lastUserPrompt) return;
    void streaming.submit(lastUserPrompt, { route });
    requestAnimationFrame(() => stopRef.current?.focus());
  };

  // A «⋯» item opens its modal and records where the focus returns: the menu item is gone by then.
  const openFromMenu = (open: (value: boolean) => void) => {
    modalReturnRef.current = moreTriggerRef.current;
    open(true);
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
    // A new conversation starts at the top of the page, wherever the last one was read (owner,
    // phase F of 2026-11-25); the page's scroll container is the layout's `main`.
    const main = conversationEndRef.current?.closest('main');
    main?.scrollTo({ top: 0 });
    setSelectedThreadId(undefined);
    writeThreadParam(undefined);
    streaming.resetStream();
    setContextBundle(null);
    setDraft('');
    // And once more when the empty page is laid out: while the old thread leaves, the browser can
    // re-anchor the scroll a few pixels down (seen at 8–34px in one run out of three, 2026-11-27).
    requestAnimationFrame(() => main?.scrollTo({ top: 0 }));
  };

  // A follow-up of a registration is the start of a sentence («Oggi ho speso »): it fills the
  // composer instead of being sent, since a prompt with no amount would only earn a question back.
  // A chip may say otherwise (`action`): «Registra un'altra» empties the composer and sends nothing.
  // Any other row is sent as it is, read by the router (no route).
  const handleFollowUpSelect = (followUp: AssistantFollowUp) => {
    const action = followUp.action ?? (lastAssistant?.mode === 'register' ? 'prefill' : 'send');
    if (action === 'send') {
      streaming.submit(followUp.prompt);
      return;
    }
    setDraft(action === 'focus-composer' ? '' : followUp.prompt);
    composerRef.current?.focus();
  };

  const handleSelectThread = (thread: AssistantThread) => {
    setSelectedThreadId(thread.id);
    writeThreadParam(thread.id);
    streaming.resetStream();
    setContextBundle(null);
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

  const queryError = threadsError || threadError || memoryError;

  // `?mode=registra` (Cashflow's link), ONCE, when the composer is mounted (the thread list has
  // answered, outside the demo, with the assistant configured): the param leaves the URL and the
  // composer takes the focus. Deferred with setTimeout(0): the focus is a DOM write, kept out of the effect body.
  const registerParamHandledRef = useRef(false);
  useEffect(() => {
    if (!registerFirst || registerParamHandledRef.current || loadingThreads || isDemo || !assistantConfigured) return;
    const timer = setTimeout(() => {
      registerParamHandledRef.current = true;
      const url = new URL(window.location.href);
      url.searchParams.delete('mode');
      window.history.replaceState(null, '', url);
      composerRef.current?.focus();
    }, 0);
    return () => clearTimeout(timer);
  }, [registerFirst, loadingThreads, isDemo, assistantConfigured]);

  // Show skeleton while threads resolve on first load
  if (loadingThreads) {
    return (
      <ProtectedRoute>
        <PageContainer>
          <AssistantHeader
            isDemo={isDemo}
            isStreaming={false}
            threadsCount={0}
            activeMemoryCount={activeItems.length}
            description="Caricamento…"
            onNewThread={handleNewThread}
            onOpenThreads={() => openFromMenu(setIsThreadsOpen)}
            onOpenMemory={() => openFromMenu(setIsMemoryOpen)}
            onOpenPreferences={() => openFromMenu(setIsPreferencesOpen)}
            moreTriggerRef={moreTriggerRef}
          />
          <TileGridSkeleton cells={SKELETON_CELLS} />
        </PageContainer>
      </ProtectedRoute>
    );
  }

  // The companion column: the numbers the assistant reasons on, then what it knows of the user.
  const companionTiles = (
    <>
      {isRegister ? (
        <RegistraContestoTile summary={registerSummary} readFailed={registerReads.readFailed} />
      ) : isNoContext ? (
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
      <MemoriaTile
        memory={memory}
        onOpenMemory={() => {
          // The button stays mounted: the modal's own restore brings the focus back to it.
          modalReturnRef.current = null;
          setIsMemoryOpen(true);
        }}
      />
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
      <PageContainer>
        <AssistantHeader
          isDemo={isDemo}
          isStreaming={isStreaming}
          threadsCount={threads.length}
          hasMoreThreads={hasMoreThreads}
          activeMemoryCount={activeItems.length}
          description={headerDescription}
          onNewThread={handleNewThread}
          onOpenThreads={() => openFromMenu(setIsThreadsOpen)}
          onOpenMemory={() => openFromMenu(setIsMemoryOpen)}
          onOpenPreferences={() => openFromMenu(setIsPreferencesOpen)}
          moreTriggerRef={moreTriggerRef}
        />

        <AssistantModals
          ownerId={ownerId}
          isThreadsOpen={isThreadsOpen}
          onThreadsOpenChange={setIsThreadsOpen}
          isMemoryOpen={isMemoryOpen}
          onMemoryOpenChange={setIsMemoryOpen}
          threads={threads}
          loadingThreads={loadingThreads}
          hasMoreThreads={hasMoreThreads}
          loadingMoreThreads={loadingMoreThreads}
          onLoadMoreThreads={() => void fetchMoreThreads()}
          selectedThreadId={selectedThreadId}
          isStreaming={isStreaming}
          isDeletingId={deleteThreadMutation.variables as string | undefined}
          onSelectThread={handleSelectThread}
          onDeleteThread={handleDeleteThread}
          memory={memory}
          loadingMemory={loadingMemory}
          isPreferencesOpen={isPreferencesOpen}
          onPreferencesOpenChange={setIsPreferencesOpen}
          onPreferencesChange={handlePreferencesChange}
          isPreferencesPending={updateMemoryMutation.isPending}
          isDemo={isDemo}
          returnFocusTo={modalReturnRef}
        />

        <AssistantRouteChooser
          open={isChooserOpen}
          reading={chooserReading}
          today={today}
          onReread={handleReread}
          onClose={() => setIsChooserOpen(false)}
          returnFocusTo={changeOpenerRef}
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
          <RegisterRefsProvider refs={registerReads.refs} readFailed={registerReads.readFailed} readsLoading={registerReads.loading} submitAnswer={(text) => streaming.submit(text, askingRoute ? { route: askingRoute, routeCarried: true } : {})}
          >
            {/* The verdict is the context. */}
            <div className="flex flex-col gap-4 pt-1 desktop:flex-row desktop:items-start desktop:justify-between desktop:gap-6">
              {verdict ? (
                <PageVerdict verdict={verdict} ariaLabel="Verdetto sul contesto" />
              ) : (
                <TileGridSkeleton cells={[]} className="max-w-[920px] flex-1" />
              )}
            </div>

            <div className="grid grid-cols-1 gap-3 desktop:grid-cols-[2fr_1fr] desktop:items-start">
              {/* ── Hero left: the conversation, the content of the page ── */}
              <div className="flex min-w-0 flex-col gap-3">
                {/* Proactive goal-completion tiles — visible in any state. */}
                {ownerId && <AssistantSuggestionsBanner userId={ownerId} memory={memory} disabled={isStreaming} />}

                <AssistantConversazioneTile
                  periodLabel={periodLabel}
                  reading={conversationReading}
                  isEmpty={isEmptyState}
                  promptRows={promptRows}
                  onPromptSelect={handleSuggestionSelect}
                  renderedMessages={renderedMessages}
                  loadingThreadDetail={loadingThreadDetail}
                  hasSelectedThread={!!selectedThreadId}
                  isStreaming={isStreaming}
                  streamStatus={streamStatus}
                  isInterrupted={isInterrupted}
                  streamingMessageId={streamingMessageId}
                  followUps={followUps}
                  onRetry={streaming.retry}
                  onFollowUpSelect={handleFollowUpSelect}
                  conversationEndRef={conversationEndRef}
                  threadId={selectedThreadId}
                  recordProposal={streaming.recordProposal}
                  changeableMessageId={changeableMessageId}
                  onChangeReading={handleChangeReading}
                />

                {/* Sticky composer — stays at the bottom of the viewport as the conversation grows. */}
                <div className="sticky bottom-0 z-10 max-desktop:portrait:bottom-20">
                  <AssistantComposer
                    draft={draft}
                    onChange={setDraft}
                    onSubmit={() => void streaming.submit()}
                    onStop={streaming.stop}
                    isStreaming={isStreaming}
                    canSubmit={canSubmit}
                    inputRef={composerRef}
                    stopRef={stopRef}
                  />
                </div>
              </div>

              {/* ── Hero right: the companion, sticky and self-start so it can travel ── */}
              {/* Clipped: every routed answer can change the scene, and its slide would push a phone's page
                  sideways until it ends; the 4px margin keeps the tiles' shadow (2026-11-16). */}
              <div className="min-w-0 overflow-clip [overflow-clip-margin:4px] desktop:sticky desktop:top-5 desktop:self-start">
                {/* A change of mode slides the companion's content and nothing else: the conversation
                    stays still (DESIGN.md § 5, «The Assistente page»). The first render does not move. */}
                <AnimatePresence mode="wait" initial={false} custom={scene.direction}>
                  <motion.div
                    key={scene.mode}
                    data-scene={scene.mode}
                    custom={scene.direction}
                    variants={prefersReducedMotion ? sceneVariantsReduced : sceneVariants}
                    initial="enter"
                    animate="center"
                    exit="exit"
                    className="flex min-w-0 flex-col gap-3"
                  >
                    {companionTiles}
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>

            {/* The Consulente: the one path that writes the allocation, a page of its own (2026-10-20). */}
            <LinkBanner
              href="/dashboard/allocation/consulente"
              title="Imposta la tua allocazione con il Consulente"
              description="Un percorso guidato: le tue risposte, due agenti, una proposta da applicare con un tasto."
            />
            <AssistantComeFunziona />
          </RegisterRefsProvider>
        )}
      </PageContainer>
    </ProtectedRoute>
  );
}
