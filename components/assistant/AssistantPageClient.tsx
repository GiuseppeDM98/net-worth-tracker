'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Bot,
  CalendarDays,
  Globe,
  Loader2,
  Lock,
  MessageSquare,
  MessagesSquare,
  Plus,
  Sparkles,
  Trash2,
  WandSparkles,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { it } from 'date-fns/locale';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { AssistantComposer } from '@/components/assistant/AssistantComposer';
import { AssistantContextCard } from '@/components/assistant/AssistantContextCard';
import { AssistantPromptChips } from '@/components/assistant/AssistantPromptChips';
import { AssistantStreamingResponse } from '@/components/assistant/AssistantStreamingResponse';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { EmptyState } from '@/components/ui/EmptyState';
import { useAuth } from '@/contexts/AuthContext';
import { useAssistantMemory, useUpdateAssistantMemory } from '@/lib/hooks/useAssistantMemory';
import { useAssistantThread, useAssistantThreads, useDeleteAssistantThread } from '@/lib/hooks/useAssistantThreads';
import { assistantPromptChips } from '@/lib/constants/assistantPrompts';
import { authenticatedFetch } from '@/lib/utils/authFetch';
import { getItalyMonthYear } from '@/lib/utils/dateHelpers';
import { cn } from '@/lib/utils';
import {
  AssistantMessage,
  AssistantMode,
  AssistantMonthContextBundle,
  AssistantMonthSelectorValue,
  AssistantPromptChip,
  AssistantStreamEvent,
} from '@/types/assistant';
import { queryKeys } from '@/lib/query/queryKeys';
import { useQueryClient } from '@tanstack/react-query';

interface AssistantPageClientProps {
  assistantConfigured: boolean;
}

const MONTH_NAMES = [
  'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
  'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre',
];

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
  threads: import('@/types/assistant').AssistantThread[];
  loadingThreads: boolean;
  selectedThreadId: string | undefined;
  isStreaming: boolean;
  isDeletingId: string | undefined;
  onSelect: (thread: import('@/types/assistant').AssistantThread) => void;
  onDelete: (threadId: string) => void;
  onNewThread: () => void;
}

/**
 * Shared thread list rendered both in the desktop right panel and the mobile Sheet drawer.
 * Keeps selection, date formatting, and delete behaviour in one place to avoid drift.
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

        return (
          <div
            key={thread.id}
            className={cn(
              'group relative w-full rounded-xl border text-left transition-colors',
              isActive ? 'border-primary/30 bg-primary/5' : 'border-border hover:bg-muted/40'
            )}
          >
            <button
              onClick={() => onSelect(thread)}
              disabled={isStreaming}
              className="w-full px-3 py-2.5 text-left"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-medium leading-snug text-foreground line-clamp-1">
                  {thread.title}
                </p>
                <Badge variant="outline" className="mt-px shrink-0 text-[10px] uppercase">
                  {thread.mode === 'month_analysis' ? 'Mese' : 'Chat'}
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
                <span className="text-[10px] text-muted-foreground/70">
                  {formatThreadDate(thread.updatedAt)}
                </span>
              </div>
            </button>

            {/* Delete button: shown on hover or while this thread is being deleted */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete(thread.id);
              }}
              disabled={isStreaming || isDeleting}
              aria-label="Elimina conversazione"
              className={cn(
                'absolute right-2 top-2.5 rounded-md p-1 text-muted-foreground/50 opacity-0 transition-opacity',
                'hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100',
                isDeleting && 'opacity-100'
              )}
            >
              {isDeleting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Trash2 className="h-3.5 w-3.5" />
              )}
            </button>
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
  const conversationEndRef = useRef<HTMLDivElement>(null);
  // Guards the one-time auto-select of the most recent thread on first load.
  // Without this, setting selectedThreadId to undefined (new thread) would
  // immediately re-trigger the effect and re-select the first thread.
  const hasAutoSelectedRef = useRef(false);

  // Month options are stable for the session — computed once on mount
  const monthOptions = useMemo(() => buildMonthOptions(), []);

  const [selectedThreadId, setSelectedThreadId] = useState<string>();
  const [draft, setDraft] = useState('');
  const [mode, setMode] = useState<AssistantMode>('month_analysis');
  const [selectedMonth, setSelectedMonth] = useState<AssistantMonthSelectorValue>(
    // Default to Italy current month; matches buildMonthOptions logic
    () => getItalyMonthYear(new Date())
  );

  const [streamingMessages, setStreamingMessages] = useState<AssistantMessage[]>([]);
  // Tracks the ID of the assistant message slot that is currently receiving tokens.
  // Used by AssistantStreamingResponse to switch between plain-text and markdown rendering.
  const [streamingMessageId, setStreamingMessageId] = useState<string | undefined>();
  const [isStreaming, setIsStreaming] = useState(false);
  const [isInterrupted, setIsInterrupted] = useState(false);
  // Context bundle is populated from the SSE 'context' event sent before text streaming
  const [contextBundle, setContextBundle] = useState<AssistantMonthContextBundle | null>(null);

  const { data: threads = [], isLoading: loadingThreads, error: threadsError } = useAssistantThreads(user?.uid);
  const { data: threadDetail, isLoading: loadingThreadDetail, error: threadError } = useAssistantThread(
    selectedThreadId,
    user?.uid
  );
  const { data: memory, isLoading: loadingMemory, error: memoryError } = useAssistantMemory(user?.uid);
  const updateMemoryMutation = useUpdateAssistantMemory(user?.uid ?? '');
  const deleteThreadMutation = useDeleteAssistantThread(user?.uid ?? '');

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

  // Auto-select the most recent thread on first load only.
  // The ref guard prevents this from re-firing when the user explicitly
  // clicks "Nuova conversazione" (which sets selectedThreadId to undefined).
  useEffect(() => {
    if (!hasAutoSelectedRef.current && !selectedThreadId && threads.length > 0) {
      hasAutoSelectedRef.current = true;
      setSelectedThreadId(threads[0].id);
    }
  }, [selectedThreadId, threads]);

  // Sync mode and month picker to the loaded thread so the UI stays coherent
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
  }, [threadDetail]); // eslint-disable-line react-hooks/exhaustive-deps

  // Scroll the conversation area to the bottom whenever messages change
  useEffect(() => {
    conversationEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [renderedMessages]);

  // NOTE: we do NOT clear streamingMessages in a useEffect([selectedThreadId]).
  // The meta event sets selectedThreadId mid-stream; a useEffect dependency on it
  // would fire and wipe the streaming buffer before text arrives. See AGENTS.md.

  const activeMonthLabel = `${MONTH_NAMES[selectedMonth.month - 1]} ${selectedMonth.year}`;

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

    const userMessage: AssistantMessage = {
      id: `local-user-${Date.now()}`,
      threadId: selectedThreadId ?? 'pending',
      userId: user.uid,
      role: 'user',
      content: promptToSend,
      createdAt: new Date(),
      mode: modeToSend,
      monthContext: modeToSend === 'month_analysis' ? selectedMonth : null,
    };

    // Allocate the assistant slot ID upfront so AssistantStreamingResponse can
    // identify which message is still streaming and render it as plain text.
    const assistantMessageId = `local-assistant-${Date.now()}`;

    setIsStreaming(true);
    setIsInterrupted(false);
    setContextBundle(null);
    setStreamingMessageId(assistantMessageId);
    setStreamingMessages([
      ...(threadDetail?.messages ?? []),
      userMessage,
      {
        id: assistantMessageId,
        threadId: selectedThreadId ?? 'pending',
        userId: user.uid,
        role: 'assistant',
        content: '',
        createdAt: new Date(),
        mode: modeToSend,
        monthContext: modeToSend === 'month_analysis' ? selectedMonth : null,
        webSearchUsed: false,
      },
    ]);

    try {
      const response = await authenticatedFetch('/api/ai/assistant/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.uid,
          mode: modeToSend,
          prompt: promptToSend,
          threadId: selectedThreadId,
          month: modeToSend === 'month_analysis' ? selectedMonth : undefined,
          preferences: memory?.preferences,
        }),
      });

      if (!response.ok || !response.body) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error ?? 'Impossibile avviare lo stream dell\'assistente');
      }

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
          }

          // Populate the context panel from the server-built bundle.
          // This fires before text streaming starts.
          if (event.type === 'context') {
            setContextBundle(event.bundle);
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
          selectedThreadId
            ? queryClient.invalidateQueries({ queryKey: queryKeys.assistant.thread(selectedThreadId) })
            : Promise.resolve(),
        ]);
      }
    } catch (error) {
      toast.error((error as Error).message);
      setIsInterrupted(true);
      setStreamingMessageId(undefined);
    } finally {
      setIsStreaming(false);
    }
  };

  // All chips prefill the composer — none auto-submit.
  // This lets the user change the selected month (or edit the prompt) before sending,
  // which matters especially for month_analysis chips where the month selector is the key input.
  const handleChipClick = (chip: AssistantPromptChip) => {
    setMode(chip.mode);
    setDraft(chip.prompt);
  };

  const handleRetry = () => {
    if (!isStreaming) {
      handleStreamSubmit();
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
    ? `Nessun dato disponibile per ${activeMonthLabel}. Seleziona un altro mese.`
    : undefined;

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
                  Fai domande sul tuo patrimonio, analizza un mese specifico o esplora spese, rendimenti e contesto macro.
                </p>
              </div>
              <div className="flex items-center gap-3">
                {/* Mobile-only: opens thread list drawer. Hidden on desktop where the right panel is always visible */}
                <div className="desktop:hidden">
                  <Sheet>
                    <SheetTrigger asChild>
                      <Button variant="outline" size="sm" className="gap-2">
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
                          }}
                          onDelete={handleDeleteThread}
                          onNewThread={handleNewThread}
                        />
                      </div>
                    </SheetContent>
                  </Sheet>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleNewThread}
                  disabled={isStreaming}
                  className="gap-2"
                >
                  <Plus className="h-4 w-4" />
                  Nuova conversazione
                </Button>
                <Badge variant="outline" className="w-fit gap-2 text-xs">
                  <Sparkles className="h-3.5 w-3.5" />
                  Step 4: thread persistenti
                </Badge>
              </div>
            </div>
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
                <div className="mb-4 rounded-2xl border border-border bg-muted/20 p-6">
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
              )}

              {/* Conversation area */}
              <div className="min-h-[200px] space-y-0 rounded-2xl border border-border bg-background overflow-hidden">
                {/* Conversation header */}
                <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {mode === 'month_analysis'
                        ? `Analisi · ${activeMonthLabel}`
                        : 'Chat libera sul portafoglio'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {isStreaming && (
                      <Badge variant="outline" className="gap-1.5 text-xs">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        In scrittura…
                      </Badge>
                    )}
                    {/* Quick chip access while in conversation */}
                    {renderedMessages.length > 0 && !isStreaming && (
                      <div className="flex flex-wrap gap-1.5">
                        {assistantPromptChips.slice(0, 2).map((chip) => (
                          <button
                            key={chip.id}
                            onClick={() => handleChipClick(chip)}
                            className="rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                          >
                            {chip.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Messages */}
                <div className="p-4">
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
                  isStreaming={isStreaming}
                  canSubmit={canSubmit}
                  mode={mode}
                  onModeChange={setMode}
                  selectedMonth={selectedMonth}
                  monthOptions={monthOptions}
                  onMonthChange={setSelectedMonth}
                  errorHint={composerErrorHint}
                />
              </div>
            </div>

            {/* ── Right column: context panel + preferences + threads ── */}
            <div className="space-y-4">
              {/* Context panel: visible after first analysis populates a bundle */}
              {contextBundle ? (
                <AssistantContextCard bundle={contextBundle} />
              ) : (
                <Card>
                  <CardHeader>
                    <CardTitle>Contesto numerico</CardTitle>
                    <CardDescription>
                      Appare qui al termine della prima analisi mensile.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="rounded-xl border border-border p-3">
                      <div className="mb-1 flex items-center gap-2 text-sm font-medium text-foreground">
                        <CalendarDays className="h-4 w-4 text-muted-foreground" />
                        Mese di riferimento
                      </div>
                      <p className="text-sm text-muted-foreground">{activeMonthLabel}</p>
                    </div>
                    <div className="rounded-xl border border-border p-3">
                      <div className="mb-1 flex items-center gap-2 text-sm font-medium text-foreground">
                        <Globe className="h-4 w-4 text-muted-foreground" />
                        Web search
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Attiva in analisi mensile solo con contesto macro abilitato.
                        In chat si attiva per richieste macro esplicite.
                      </p>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Preferences */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <WandSparkles className="h-4 w-4 text-muted-foreground" />
                    Preferenze
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-1.5">
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

                  <div className="flex items-center justify-between gap-4 rounded-lg border border-border px-3 py-2">
                    <div>
                      <p className="text-sm font-medium text-foreground">Contesto macro</p>
                      <p className="text-xs text-muted-foreground">
                        Abilita ricerca web nelle analisi mensili.
                      </p>
                    </div>
                    <Switch
                      checked={memory?.preferences.includeMacroContext ?? false}
                      onCheckedChange={(checked) => handlePreferencesChange({ includeMacroContext: checked })}
                      disabled={loadingMemory || updateMemoryMutation.isPending}
                    />
                  </div>

                  <div className="flex items-center justify-between gap-4 rounded-lg border border-border px-3 py-2">
                    <div>
                      <p className="text-sm font-medium text-foreground">Memoria assistente</p>
                      <p className="text-xs text-muted-foreground">
                        Conserva preferenze e fatti tra i thread.
                      </p>
                    </div>
                    <Switch
                      checked={memory?.preferences.memoryEnabled ?? true}
                      onCheckedChange={(checked) => handlePreferencesChange({ memoryEnabled: checked })}
                      disabled={loadingMemory || updateMemoryMutation.isPending}
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Thread list — hidden on mobile where the drawer is used instead */}
              <Card className="hidden desktop:block">
                <CardHeader>
                  <CardTitle>Conversazioni</CardTitle>
                  <CardDescription>Ordinate per ultimo aggiornamento.</CardDescription>
                </CardHeader>
                <CardContent className="max-h-[480px] overflow-y-auto space-y-2 pr-1">
                  <ThreadList
                    threads={threads}
                    loadingThreads={loadingThreads}
                    selectedThreadId={selectedThreadId}
                    isStreaming={isStreaming}
                    isDeletingId={deleteThreadMutation.variables as string | undefined}
                    onSelect={(thread) => {
                      // Explicit thread switch: clear streaming state before loading
                      // the new thread. Do NOT do this reactively in a useEffect —
                      // the meta SSE event updates selectedThreadId mid-stream,
                      // which would wipe the buffer. See AGENTS.md.
                      setSelectedThreadId(thread.id);
                      setStreamingMessages([]);
                      setStreamingMessageId(undefined);
                      setIsInterrupted(false);
                      setContextBundle(null);
                      setMode(thread.mode);
                      if (thread.pinnedMonth) setSelectedMonth(thread.pinnedMonth);
                    }}
                    onDelete={handleDeleteThread}
                    onNewThread={handleNewThread}
                  />
                </CardContent>
              </Card>

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
