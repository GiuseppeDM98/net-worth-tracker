'use client';

import { useEffect, useMemo, useState } from 'react';
import { Bot, CalendarDays, Globe, Loader2, Lock, MessageSquare, RefreshCw, Sparkles, WandSparkles } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { EmptyState } from '@/components/ui/EmptyState';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useAuth } from '@/contexts/AuthContext';
import { useAssistantMemory, useUpdateAssistantMemory } from '@/lib/hooks/useAssistantMemory';
import { useAssistantThread, useAssistantThreads } from '@/lib/hooks/useAssistantThreads';
import { authenticatedFetch } from '@/lib/utils/authFetch';
import { cn } from '@/lib/utils';
import { formatDate } from '@/lib/utils/formatters';
import {
  AssistantMessage,
  AssistantMode,
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
  'Gennaio',
  'Febbraio',
  'Marzo',
  'Aprile',
  'Maggio',
  'Giugno',
  'Luglio',
  'Agosto',
  'Settembre',
  'Ottobre',
  'Novembre',
  'Dicembre',
];

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
    id: 'month-macro',
    label: 'Collega il contesto macro',
    prompt: 'Metti in relazione il mese selezionato con il contesto macro e i mercati globali.',
    mode: 'month_analysis',
    requiresMonthContext: true,
    webContextHint: 'macro',
  },
  {
    id: 'portfolio-chat',
    label: 'Fai una domanda libera',
    prompt: 'Aiutami a capire quali temi stanno emergendo dal mio portafoglio.',
    mode: 'chat',
    requiresMonthContext: false,
    webContextHint: 'optional',
  },
];

function buildMonthOptions(): AssistantMonthSelectorValue[] {
  const today = new Date();
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth() + 1;
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
  const monthOptions = useMemo(() => buildMonthOptions(), []);
  const [selectedThreadId, setSelectedThreadId] = useState<string>();
  const [draft, setDraft] = useState('');
  const [mode, setMode] = useState<AssistantMode>('chat');
  const [selectedMonth, setSelectedMonth] = useState<AssistantMonthSelectorValue>(() => {
    const today = new Date();
    return { year: today.getFullYear(), month: today.getMonth() + 1 };
  });
  const [streamingMessages, setStreamingMessages] = useState<AssistantMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isInterrupted, setIsInterrupted] = useState(false);

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

  useEffect(() => {
    if (!selectedThreadId && threads.length > 0) {
      setSelectedThreadId(threads[0].id);
    }
  }, [selectedThreadId, threads]);

  useEffect(() => {
    setStreamingMessages([]);
    setIsInterrupted(false);
  }, [selectedThreadId]);

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
    setStreamingMessages([...(threadDetail?.messages ?? []), userMessage, {
      id: assistantMessageId,
      threadId: selectedThreadId ?? 'pending',
      userId: user.uid,
      role: 'assistant',
      content: '',
      createdAt: new Date(),
      mode,
      monthContext: mode === 'month_analysis' ? selectedMonth : null,
      webSearchUsed: false,
    }]);

    try {
      const response = await authenticatedFetch('/api/ai/assistant/stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
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
        throw new Error(payload?.error ?? 'Impossibile avviare lo stream dell’assistente');
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

  const activeMonthLabel = `${MONTH_NAMES[selectedMonth.month - 1]} ${selectedMonth.year}`;

  return (
    <ProtectedRoute>
      <div className="space-y-6 max-desktop:portrait:pb-20">
        <header className="space-y-4 border-b border-border pb-4">
          <div className="space-y-1">
            <p className="text-xs uppercase tracking-widest text-muted-foreground">Analisi</p>
            <div className="flex flex-col gap-3 desktop:flex-row desktop:items-end desktop:justify-between">
              <div className="space-y-2">
                <h1 className="text-3xl font-semibold tracking-tight text-foreground">Assistente AI</h1>
                <p className="max-w-2xl text-sm text-muted-foreground">
                  Conversazioni guidate sul portafoglio, con analisi mensile e contesto macro opzionale.
                </p>
              </div>
              <Badge variant="outline" className="w-fit gap-2 text-xs">
                <Sparkles className="h-3.5 w-3.5" />
                Step 1: fondazioni e contratti
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
                description="La pagina resta accessibile, ma per usare l’assistente devi configurare ANTHROPIC_API_KEY nell’ambiente."
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
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Prompt suggeriti</CardTitle>
                  <CardDescription>Scegli un punto di partenza e personalizzalo prima di inviare.</CardDescription>
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
                        In scrittura
                      </Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-3 rounded-xl border border-border bg-muted/20 p-3">
                    {loadingThreadDetail ? (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Caricamento conversazione...
                      </div>
                    ) : renderedMessages.length === 0 ? (
                      <EmptyState
                        icon={<MessageSquare className="h-8 w-8" />}
                        title="Nessun messaggio ancora"
                        description="Invia il primo prompt per creare un thread e iniziare la conversazione."
                        className="py-8"
                      />
                    ) : (
                      renderedMessages.map((message) => (
                        <div
                          key={message.id}
                          className={cn(
                            'rounded-xl border px-3 py-2 text-sm',
                            message.role === 'user'
                              ? 'border-primary/25 bg-primary/5'
                              : 'border-border bg-background'
                          )}
                        >
                          <div className="mb-1 flex items-center justify-between gap-3">
                            <span className="font-medium text-foreground">
                              {message.role === 'user' ? 'Tu' : 'Assistente'}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {formatDate(message.createdAt)}
                            </span>
                          </div>
                          <p className="whitespace-pre-wrap text-foreground">{message.content || '...'}</p>
                          {message.webSearchUsed && (
                            <Badge variant="outline" className="mt-2 gap-1.5 text-[11px]">
                              <Globe className="h-3 w-3" />
                              Web search usata
                            </Badge>
                          )}
                        </div>
                      ))
                    )}
                  </div>

                  {isInterrupted && (
                    <Alert>
                      <RefreshCw className="h-4 w-4" />
                      <AlertTitle>Risposta interrotta</AlertTitle>
                      <AlertDescription>
                        La risposta parziale è rimasta visibile. Puoi correggere il prompt e riprovare.
                      </AlertDescription>
                    </Alert>
                  )}

                  <div className="grid gap-3 sm:grid-cols-[180px_180px_minmax(0,1fr)]">
                    <div className="space-y-2">
                      <label className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                        Modalità
                      </label>
                      <Select value={mode} onValueChange={(value) => setMode(value as AssistantMode)}>
                        <SelectTrigger>
                          <SelectValue placeholder="Seleziona modalità" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="chat">Chat</SelectItem>
                          <SelectItem value="month_analysis">Analisi mensile</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                        Mese attivo
                      </label>
                      <Select
                        value={`${selectedMonth.year}-${selectedMonth.month}`}
                        onValueChange={(value) => {
                          const [year, month] = value.split('-').map(Number);
                          setSelectedMonth({ year, month });
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Seleziona mese" />
                        </SelectTrigger>
                        <SelectContent>
                          {monthOptions.map((option) => (
                            <SelectItem key={`${option.year}-${option.month}`} value={`${option.year}-${option.month}`}>
                              {MONTH_NAMES[option.month - 1]} {option.year}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                        Prompt
                      </label>
                      <Textarea
                        value={draft}
                        onChange={(event) => setDraft(event.target.value)}
                        placeholder="Scrivi una domanda sul tuo portafoglio o sul mese selezionato..."
                        className="min-h-[120px]"
                      />
                    </div>
                  </div>

                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-xs text-muted-foreground">
                      I titoli dei thread vengono assegnati lato server per mantenere coerenza tra stream e storico.
                    </p>
                    <Button onClick={handleStreamSubmit} disabled={!draft.trim() || isStreaming}>
                      {isStreaming ? 'Generazione in corso...' : 'Invia al modello'}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Contesto attivo</CardTitle>
                  <CardDescription>Mese selezionato, policy web search e preferenze persistenti.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
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
                      In analisi mensile si attiva solo con contesto macro abilitato. In chat si attiva solo per richieste macro/geopolitiche o esplicite.
                    </p>
                  </div>

                  <div className="space-y-3 rounded-xl border border-border p-3">
                    <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                      <WandSparkles className="h-4 w-4 text-muted-foreground" />
                      Preferenze
                    </div>

                    <div className="space-y-2">
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
                        <p className="text-xs text-muted-foreground">Abilita ricerca web opzionale nelle analisi mensili.</p>
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
                        <p className="text-xs text-muted-foreground">Permette di conservare preferenze e fatti utili tra i thread.</p>
                      </div>
                      <Switch
                        checked={memory?.preferences.memoryEnabled ?? true}
                        onCheckedChange={(checked) => handlePreferencesChange({ memoryEnabled: checked })}
                        disabled={loadingMemory || updateMemoryMutation.isPending}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Thread recenti</CardTitle>
                  <CardDescription>Elenco ordinato per ultimo aggiornamento.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  {loadingThreads ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Caricamento thread...
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
                        onClick={() => setSelectedThreadId(thread.id)}
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
                          {thread.lastMessagePreview || 'Ancora nessun messaggio salvato'}
                        </p>
                      </button>
                    ))
                  )}
                </CardContent>
              </Card>

              {(threadsError || threadError || memoryError) && (
                <Alert variant="destructive">
                  <AlertTitle>Errore di caricamento</AlertTitle>
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
