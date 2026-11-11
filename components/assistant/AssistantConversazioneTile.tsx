'use client';

import { CornerDownRight, Globe, Loader2 } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useEffect, useState } from 'react';

/**
 * What the chip says while a long answer is still thinking (owner, 2026-10-20: «Sta impiegando più
 * del previsto» read as an apology). One phrase at a time, the next every SLOW_PHRASE_MS, in order.
 */
export const SLOW_PHRASES = [
  'Ci sto ragionando…',
  'Sto facendo i conti…',
  'Sto rileggendo il portafoglio…',
  'Sto mettendo in fila i numeri…',
  'Ancora un momento…',
] as const;
const SLOW_PHRASE_MS = 8_000;

function useSlowPhrase(active: boolean): string | null {
  // Counts the ticks since the phrase became active; the index is derived, so no setState on
  // activation (the first phrase is tick 0) and the counter resets by the key below.
  const [ticks, setTicks] = useState(0);
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setTicks((n) => n + 1), SLOW_PHRASE_MS);
    return () => {
      clearInterval(timer);
      setTicks(0);
    };
  }, [active]);
  return active ? SLOW_PHRASES[ticks % SLOW_PHRASES.length] : null;
}
import { AssistantPromptRows, type PromptRow } from '@/components/assistant/AssistantPromptRows';
import { Skeleton } from '@/components/ui/skeleton';
import { AssistantStreamingResponse } from '@/components/assistant/AssistantStreamingResponse';
import { Tile, TILE_SUB_EYEBROW_CLASS } from '@/components/ui/tile';
import type { AssistantFollowUp } from '@/lib/utils/assistantFollowUps';
import type { Narrative } from '@/lib/utils/narrative';
import type { AssistantMessage, AssistantMode, AssistantProposalState } from '@/types/assistant';

interface AssistantConversazioneTileProps {
  /** The active period as the tile's aside («Analisi · Luglio 2026»). */
  periodLabel: string;
  /** The reading line — the period question while empty, the message count afterwards. */
  reading: Narrative;
  /** No messages and no thread selected: the starter rows take the body. */
  isEmpty: boolean;
  promptRows: PromptRow[];
  onPromptSelect: (row: PromptRow) => void;
  renderedMessages: AssistantMessage[];
  loadingThreadDetail: boolean;
  /** A thread is selected but still empty → «no messages yet». */
  hasSelectedThread: boolean;
  isStreaming: boolean;
  streamStatus: 'searching' | 'writing' | 'saving' | null;
  isSlowResponse: boolean;
  isInterrupted: boolean;
  streamingMessageId: string | undefined;
  followUps: AssistantFollowUp[];
  onRetry: () => void;
  /** The whole chip: the page reads its `action` (send, prefill, focus the composer). */
  onFollowUpSelect: (followUp: AssistantFollowUp) => void;
  /** Anchor for auto-scroll to the latest message — owned by the page (scroll effect). */
  conversationEndRef: React.RefObject<HTMLDivElement | null>;
  /** The mode the conversation is shown in (an expense proposal is a card in Registra alone). */
  mode: AssistantMode;
  /** The open thread and the hook's recorder, handed to the message list for the cards' outcomes. */
  threadId: string | undefined;
  recordProposal: (messageId: string, threadId: string, key: string, state: Omit<AssistantProposalState, 'at'>) => void;
}

/** The streaming state as an 11px chip in the aside; web search gets its own so a slow lookup does not read as a generic delay. */
function StreamStatusChip({
  isStreaming,
  streamStatus,
  isSlowResponse,
}: Pick<AssistantConversazioneTileProps, 'isStreaming' | 'streamStatus' | 'isSlowResponse'>) {
  const prefersReducedMotion = useReducedMotion();
  const searching = streamStatus === 'searching';
  const slowPhrase = useSlowPhrase(isStreaming && isSlowResponse && !searching);
  if (!isStreaming) return null;

  const label = searching ? 'Sto cercando sul web…' : slowPhrase ?? 'In scrittura…';
  const Icon = searching ? Globe : Loader2;

  return (
    <motion.span
      key={label}
      role="status"
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.92 }}
      transition={{ duration: prefersReducedMotion ? 0 : 0.18 }}
      className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-0.5 text-[11px] text-foreground"
    >
      <Icon
        className={searching ? 'h-3 w-3 motion-safe:animate-pulse' : 'h-3 w-3 motion-safe:animate-spin'}
        aria-hidden="true"
      />
      {label}
    </motion.span>
  );
}

/**
 * The conversation as a tile of the page — the content of the Assistente, at the tiles'
 * cadence: eyebrow, the period and the streaming state as the aside, a reading line, then the
 * body. Empty, the body is the starter questions as flat rows (the one matching the active
 * period first); with a thread, the flat message list and the follow-ups as rows under a
 * sub-eyebrow. Pure presentation — every state is computed by the page and the streaming hook.
 */
export function AssistantConversazioneTile({
  periodLabel,
  reading,
  isEmpty,
  promptRows,
  onPromptSelect,
  renderedMessages,
  loadingThreadDetail,
  hasSelectedThread,
  isStreaming,
  streamStatus,
  isSlowResponse,
  isInterrupted,
  streamingMessageId,
  followUps,
  onRetry,
  onFollowUpSelect,
  conversationEndRef,
  mode,
  threadId,
  recordProposal,
}: AssistantConversazioneTileProps) {
  const aside = (
    <span className="inline-flex flex-wrap items-center gap-2">
      <span>{periodLabel}</span>
      <AnimatePresence>
        <StreamStatusChip isStreaming={isStreaming} streamStatus={streamStatus} isSlowResponse={isSlowResponse} />
      </AnimatePresence>
    </span>
  );

  return (
    <Tile eyebrow="Conversazione" aside={aside} reading={reading} className="flex-1" ariaLabel="Conversazione">
      {isEmpty ? (
        // Registra has no starter rows (an analysis chip would leave the mode): no empty list.
        promptRows.length > 0 && (
          <div className="mt-3">
            <AssistantPromptRows rows={promptRows} onSelect={onPromptSelect} disabled={isStreaming} ariaLabel="Domande suggerite" />
          </div>
        )
      ) : loadingThreadDetail ? (
        <div className="mt-4 space-y-2" role="status" aria-label="Caricamento conversazione">
          <Skeleton className="ml-auto h-10 w-2/3 rounded-xl" />
          <Skeleton className="h-3.5 w-full" />
          <Skeleton className="h-3.5 w-5/6" />
        </div>
      ) : renderedMessages.length === 0 && hasSelectedThread ? (
        <p className="mt-3 text-[13px] text-muted-foreground">Nessun messaggio ancora: scrivi la tua domanda qui sotto.</p>
      ) : (
        <div className="mt-4">
          <AssistantStreamingResponse
            messages={renderedMessages}
            isInterrupted={isInterrupted}
            onRetry={onRetry}
            streamingMessageId={streamingMessageId}
            mode={mode}
            threadId={threadId}
            recordProposal={recordProposal}
          />
          {followUps.length > 0 && (
            <div className="mt-4 border-t border-border pt-3">
              <p className={`${TILE_SUB_EYEBROW_CLASS} inline-flex items-center gap-1.5`}>
                <CornerDownRight className="h-3 w-3" aria-hidden="true" />
                Continua con
              </p>
              <div className="mt-1">
                <AssistantPromptRows
                  rows={followUps.map((followUp) => ({ id: followUp.id, label: followUp.label }))}
                  onSelect={(row) => {
                    const followUp = followUps.find((f) => f.id === row.id);
                    if (followUp) onFollowUpSelect(followUp);
                  }}
                  disabled={isStreaming}
                  ariaLabel="Continua con"
                />
              </div>
            </div>
          )}
        </div>
      )}
      {/* Anchor for auto-scroll to latest message */}
      <div ref={conversationEndRef} />
    </Tile>
  );
}
