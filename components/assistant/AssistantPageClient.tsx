'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Bot,
  CalendarDays,
  Globe,
  Loader2,
  Lock,
  MessageSquare,
  Sparkles,
  WandSparkles,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { AssistantContextCard } from '@/components/assistant/AssistantContextCard';
import { AssistantMonthPicker } from '@/components/assistant/AssistantMonthPicker';
import { AssistantStreamingResponse } from '@/components/assistant/AssistantStreamingResponse';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { EmptyState } from '@/components/ui/EmptyState';
import { useAuth } from '@/contexts/AuthContext';
import { useAssistantMemory, useUpdateAssistantMemory } from '@/lib/hooks/useAssistantMemory';
import { useAssistantThread, useAssistantThreads } from '@/lib/hooks/useAssistantThreads';
import { authenticatedFetch } from '@/lib/utils/authFetch';
import { getItalyMonthYear } from '@/lib/utils/dateHelpers';
import { cn } from '@/lib/utils';
import { formatDate } from '@/lib/utils/formatters';
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

// Prompt chips always reference the selected month — they are starting points,
// not final prompts, so users can customise before sending
const PROMPT_CHIPS: AssistantPromptChip[] = [
  {
    id: 'month-summary',
    label: 'Leggi il mese',
    prompt: 'Analizza il mese selezionato e spiegami i driver principali del patrimonio.',
    mode: 'month_analysis',
    requiresMonthContext: true,
    webContextHint: 'none',
  },
  {
    id: 'month-cashflow',
    label: 'Focus cashflow',
    prompt: 'Commenta le entrate, le uscite e il flusso netto del mese selezionato.',
    mode: 'month_analysis',
    requiresMonthContext: true,
    webContextHint: 'none',
  },
  {
    id: 'month-allocation',
    label: 'Variazioni allocazione',
    prompt: 'Quali classi d\'asset hanno cambiato peso questo mese? Ci sono segnali da considerare?',
    mode: 'month_analysis',
    requiresMonthContext: true,
    webContextHint: 'none',
  },
  {
    id: 'month-macro',
    label: 'Collega il contesto macro',
    prompt: 'Metti in relazione il mese selezionato con il contesto macro e i mercati globali.',
    mode: 'month_analysis',
    requiresMonthContext: true,
    webContextHint: 'macro',
  },
  {
    id: 'portfolio-chat',
    label: 'Domanda libera',
    prompt: 'Aiutami a capire quali temi stanno emergendo dal mio portafoglio.',
    mode: 'chat',
    requiresMonthContext: false,
    webContextHint: 'optional',
  },
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
 * Strips markdown syntax so thread previews read as plain text.
 * Covers headings, bold/italic, inline code, horizontal rules, and list markers.
 */
function stripMarkdown(text: string): string {
  return text
    .replace(/#{1,6}\s+/g, '')       // headings
    .replace(/\*\*(.+?)\*\*/g, '$1') // bold
    .replace(/\*(.+?)\*/g, '$1')     // italic
    .replace(/`(.+?)`/g, '$1')       // inline code
    .replace(/^---+$/gm, '')         // horizontal rules
    .replace(/^[-*+]\s+/gm, '')      // unordered list markers
    .replace(/^\d+\.\s+/gm, '')      // ordered list markers
    .replace(/\n+/g, ' ')            // collapse newlines to spaces
    .trim();
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

export function AssistantPageClient({ assistantConfigured }: AssistantPageClientProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuth();

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

  const renderedMessages = useMemo(() => {
    if (streamingMessages.length > 0) {
      return streamingMessages;
    }
    return threadDetail?.messages ?? [];
  }, [streamingMessages, threadDetail?.messages]);

  // Auto-select the most recent thread on first load.
  // Only runs when selectedThreadId is still undefined to avoid overwriting a
  // thread ID received mid-stream from the SSE meta event.
  useEffect(() => {
    if (!selectedThreadId && threads.length > 0) {
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

  // NOTE: we do NOT clear streamingMessages on selectedThreadId changes here.
  // The meta event sets selectedThreadId mid-stream; a useEffect dependency on it
  // would fire and wipe the streaming buffer before text arrives. Instead, we
  // clear streaming state explicitly when the user clicks a thread (see thread list).

  const handleChipClick = (chip: AssistantPromptChip) => {
    setMode(chip.mode);
    setDraft(chip.prompt);
  };

  const handlePreferencesChange = async (
    patch: Partial<NonNullable<typeof memory>['preferences']>
  ) => {
    if (!user?.uid) {
      return;
    }

    try {
      await updateMemoryMutation.mutateAsync({ preferences: patch });
    } catch (error) {
      toast.error((error as Error).message);
    }
  };

  const handleStreamSubmit = async () => {
    if (!user?.uid || !draft.trim() || isStreaming) {
      return;
    }

    const userMessage: AssistantMessage = {
      id: `local-user-${Date.now()}`,
      threadId: selectedThreadId ?? 'pending',
      userId: user.uid,
      role: 'user',
      content: draft.trim(),
      createdAt: new Date(),
      mode,
      monthContext: mode === 'month_analysis' ? selectedMonth : null,
    };
    const assistantMessageId = `local-assistant-${Date.now()}`;

    setIsStreaming(true);
    setIsInterrupted(false);
    setContextBundle(null);
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
        mode,
        monthContext: mode === 'month_analysis' ? selectedMonth : null,
        webSearchUsed: false,
      },
    ]);

    try {
      const response = await authenticatedFetch('/api/ai/assistant/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.uid,
          mode,
          prompt: draft.trim(),
          threadId: selectedThreadId,
          month: mode === 'month_analysis' ? selectedMonth : undefined,
          preferences: memory?.preferences,
        }),
      });

      if (!response.ok || !response.body) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error ?? 'Impossibile avviare lo stream dell\'assistente');
      }

      setDraft('');
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split('\n\n');
        buffer = events.pop() ?? '';

        for (const rawEvent of events) {
          const event = parseSseEvent(rawEvent);
          if (!event) {
            continue;
          }

          if (event.type === 'meta' && event.threadId) {
            setSelectedThreadId(event.threadId);
          }

          // Populate the context panel from the server-built bundle
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
    } finally {
      setIsStreaming(false);
    }
  };

  // Allow retrying last user prompt without clearing the text area
  const handleRetry = () => {
    if (!isStreaming) {
      handleStreamSubmit();
    }
  };

  const activeMonthLabel = `${MONTH_NAMES[selectedMonth.month - 1]} ${selectedMonth.year}`;

  // CTA is disabled when month_analysis mode has no data available to analyse
  const isAnalysisBlocked =
    mode === 'month_analysis' &&
    contextBundle !== null &&
    !contextBundle.dataQuality.hasSnapshot &&
    !contextBundle.dataQuality.hasCashflowData;

  const canSubmit = draft.trim().length > 0 && !isStreaming && !isAnalysisBlocked;

  return (
    <ProtectedRoute>
      <div className="space-y-6 max-desktop:portrait:pb-20">
        {/* Page header */}
        <header className="space-y-4 border-b border-border pb-4">
          <div className="space-y-1">
            <p className="text-xs uppercase tracking-widest text-muted-foreground">Analisi</p>
            <div className="flex flex-col gap-3 desktop:flex-row desktop:items-end desktop:justify-between">
              <div className="space-y-2">
                <h1 className="text-3xl font-semibold tracking-tight text-foreground">Assistente AI</h1>
                <p className="max-w-2xl text-sm text-muted-foreground">
                  Analisi mensile guidata: seleziona un mese, scegli un punto di partenza e leggi il tuo portafoglio con Claude.
                </p>
              </div>
              <Badge variant="outline" className="w-fit gap-2 text-xs">
                <Sparkles className="h-3.5 w-3.5" />
                Step 2: analisi mensile
              </Badge>
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
          <div className="grid gap-6 desktop:grid-cols-[minmax(0,1.7fr)_minmax(320px,0.9fr)]">
            {/* Left column: conversation + input */}
            <div className="space-y-4">
              {/* Prompt chip shortcuts */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle>Prompt suggeriti</CardTitle>
                  <CardDescription>
                    Scegli un punto di partenza e personalizzalo prima di inviare.
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-wrap gap-2">
                  {PROMPT_CHIPS.map((chip) => (
                    <button
                      key={chip.id}
                      onClick={() => handleChipClick(chip)}
                      className="rounded-full border border-border px-3 py-1.5 text-left text-sm text-foreground transition-colors hover:bg-muted"
                    >
                      {chip.label}
                    </button>
                  ))}
                </CardContent>
              </Card>

              {/* Conversation */}
              <Card className="min-h-[420px]">
                <CardHeader>
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <CardTitle>Conversazione</CardTitle>
                      <CardDescription>
                        {mode === 'month_analysis'
                          ? `Analisi del mese ${activeMonthLabel}`
                          : 'Chat libera sul tuo portafoglio'}
                      </CardDescription>
                    </div>
                    {isStreaming && (
                      <Badge variant="outline" className="gap-2">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        In scrittura…
                      </Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Message list */}
                  <div className="min-h-[180px] space-y-3 rounded-xl border border-border bg-muted/20 p-3">
                    {loadingThreadDetail ? (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Caricamento conversazione…
                      </div>
                    ) : renderedMessages.length === 0 ? (
                      <EmptyState
                        icon={<MessageSquare className="h-8 w-8" />}
                        title="Nessun messaggio ancora"
                        description="Scegli un prompt suggerito o scrivi la tua domanda."
                        className="py-8"
                      />
                    ) : (
                      <AssistantStreamingResponse
                        messages={renderedMessages}
                        isInterrupted={isInterrupted}
                        onRetry={handleRetry}
                      />
                    )}
                  </div>

                  {/* Mode + month + prompt input */}
                  <div className="space-y-3">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                          Modalità
                        </label>
                        <Select value={mode} onValueChange={(value) => setMode(value as AssistantMode)}>
                          <SelectTrigger>
                            <SelectValue placeholder="Seleziona modalità" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="month_analysis">Analisi mensile</SelectItem>
                            <SelectItem value="chat">Chat libera</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {mode === 'month_analysis' && (
                        <div className="space-y-1.5">
                          <label className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                            Mese di analisi
                          </label>
                          <AssistantMonthPicker
                            value={selectedMonth}
                            options={monthOptions}
                            onChange={setSelectedMonth}
                            disabled={isStreaming}
                          />
                        </div>
                      )}
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                        Prompt
                      </label>
                      <Textarea
                        value={draft}
                        onChange={(event) => setDraft(event.target.value)}
                        onKeyDown={(event) => {
                          // Cmd/Ctrl+Enter sends the message
                          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                            event.preventDefault();
                            if (canSubmit) {
                              handleStreamSubmit();
                            }
                          }
                        }}
                        placeholder={
                          mode === 'month_analysis'
                            ? `Scrivi la tua domanda sul mese di ${activeMonthLabel}…`
                            : 'Scrivi una domanda libera sul tuo portafoglio…'
                        }
                        className="min-h-[100px] resize-none"
                        disabled={isStreaming}
                      />
                    </div>
                  </div>

                  {/* Submit row */}
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    {isAnalysisBlocked ? (
                      <p className="text-xs text-destructive">
                        Nessun dato disponibile per {activeMonthLabel}. Seleziona un altro mese.
                      </p>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        {mode === 'month_analysis'
                          ? 'Il contesto numerico viene ricostruito lato server — i numeri nel pannello sono affidabili.'
                          : '⌘↵ per inviare'}
                      </p>
                    )}
                    <Button
                      onClick={handleStreamSubmit}
                      disabled={!canSubmit}
                      className="sm:self-end"
                    >
                      {isStreaming ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Generazione in corso…
                        </>
                      ) : mode === 'month_analysis' ? (
                        'Analizza il mese'
                      ) : (
                        'Invia'
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Right column: context + preferences + threads */}
            <div className="space-y-4">
              {/* Context panel: visible after first analysis of the selected month */}
              {contextBundle ? (
                <AssistantContextCard bundle={contextBundle} />
              ) : (
                <Card>
                  <CardHeader>
                    <CardTitle>Contesto numerico</CardTitle>
                    <CardDescription>
                      Appare qui al termine della prima analisi del mese selezionato.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="rounded-xl border border-border p-3">
                      <div className="mb-1 flex items-center gap-2 text-sm font-medium text-foreground">
                        <CalendarDays className="h-4 w-4 text-muted-foreground" />
                        Mese di riferimento
                      </div>
                      <p className="text-sm text-muted-foreground">{activeMonthLabel}</p>
                    </div>
                    <div className="mt-3 rounded-xl border border-border p-3">
                      <div className="mb-1 flex items-center gap-2 text-sm font-medium text-foreground">
                        <Globe className="h-4 w-4 text-muted-foreground" />
                        Web search
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Attiva in analisi mensile solo con contesto macro abilitato.
                        In chat si attiva per richieste macro/geopolitiche esplicite.
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

              {/* Recent threads */}
              <Card>
                <CardHeader>
                  <CardTitle>Thread recenti</CardTitle>
                  <CardDescription>Elenco ordinato per ultimo aggiornamento.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  {loadingThreads ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Caricamento thread…
                    </div>
                  ) : threads.length === 0 ? (
                    <EmptyState
                      icon={<Bot className="h-8 w-8" />}
                      title="Nessun thread salvato"
                      description="Il primo invio creerà automaticamente una conversazione."
                      className="py-6"
                    />
                  ) : (
                    threads.map((thread) => (
                      <button
                        key={thread.id}
                        onClick={() => {
                          // Clear streaming state and sync mode/month to the selected thread
                          setSelectedThreadId(thread.id);
                          setStreamingMessages([]);
                          setIsInterrupted(false);
                          setContextBundle(null);
                          setMode(thread.mode);
                          if (thread.pinnedMonth) {
                            setSelectedMonth(thread.pinnedMonth);
                          }
                        }}
                        className={cn(
                          'w-full rounded-xl border px-3 py-2 text-left transition-colors',
                          selectedThreadId === thread.id
                            ? 'border-primary/30 bg-primary/5'
                            : 'border-border hover:bg-muted/40'
                        )}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-medium text-foreground">{thread.title}</p>
                          <Badge variant="outline" className="text-[10px] uppercase">
                            {thread.mode === 'month_analysis' ? 'Mese' : 'Chat'}
                          </Badge>
                        </div>
                        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                          {thread.lastMessagePreview ? stripMarkdown(thread.lastMessagePreview) : 'Ancora nessun messaggio salvato'}
                        </p>
                        {thread.pinnedMonth && (
                          <p className="mt-0.5 text-[10px] text-muted-foreground/60">
                            {MONTH_NAMES[thread.pinnedMonth.month - 1]} {thread.pinnedMonth.year}
                          </p>
                        )}
                      </button>
                    ))
                  )}
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
