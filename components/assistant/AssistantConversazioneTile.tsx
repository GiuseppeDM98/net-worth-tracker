'use client';

import { CornerDownRight, Globe } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { AssistantPromptRows, type PromptRow } from '@/components/assistant/AssistantPromptRows';
import { Skeleton } from '@/components/ui/skeleton';
import { AssistantStreamingResponse } from '@/components/assistant/AssistantStreamingResponse';
import { Tile, TILE_SUB_EYEBROW_CLASS } from '@/components/ui/tile';
import type { AssistantFollowUp } from '@/lib/utils/assistantFollowUps';
import type { Narrative } from '@/lib/utils/narrative';
import type { AssistantMessage, AssistantProposalState } from '@/types/assistant';

interface AssistantConversazioneTileProps {
  /** How the last answer was read, as the tile's aside («Analisi di ottobre 2026»); null on an empty chat. */
  periodLabel: string | null;
  /** The reading line — the chat's question while empty, the message count afterwards. */
  reading: Narrative;
  /** No messages and no thread selected: the suggestions take the body. */
  isEmpty: boolean;
  /** The four suggestions of an empty chat; null while the account's overview loads (four skeleton rows). */
  promptRows: PromptRow[] | null;
  onPromptSelect: (row: PromptRow) => void;
  renderedMessages: AssistantMessage[];
  loadingThreadDetail: boolean;
  /** A thread is selected but still empty → «no messages yet». */
  hasSelectedThread: boolean;
  isStreaming: boolean;
  streamStatus: 'searching' | 'writing' | 'saving' | null;
  isInterrupted: boolean;
  streamingMessageId: string | undefined;
  followUps: AssistantFollowUp[];
  onRetry: () => void;
  /** The whole chip: the page reads its `action` (send, prefill, focus the composer). */
  onFollowUpSelect: (followUp: AssistantFollowUp) => void;
  /** Anchor for auto-scroll to the latest message — owned by the page (scroll effect). */
  conversationEndRef: React.RefObject<HTMLDivElement | null>;
  /** The open thread and the hook's recorder, handed to the message list for the cards' outcomes. */
  threadId: string | undefined;
  recordProposal: (messageId: string, threadId: string, key: string, state: Omit<AssistantProposalState, 'at'>) => void;
  /** The answer whose reading «cambia» changes, and what pressing it does (the page opens the chooser). */
  changeableMessageId: string | undefined;
  onChangeReading: (message: AssistantMessage, opener: HTMLElement) => void;
}

/**
 * The web search as an 11px chip in the aside, so a slow lookup does not read as a generic delay.
 * Only the web: the wait itself speaks in the answer's place (`AssistantWaiting`, 2026-11-16).
 */
export function StreamStatusChip({
  isStreaming,
  streamStatus,
}: Pick<AssistantConversazioneTileProps, 'isStreaming' | 'streamStatus'>) {
  const prefersReducedMotion = useReducedMotion();
  if (!isStreaming || streamStatus !== 'searching') return null;

  const label = 'Sto cercando sul web…';

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
      <Globe
        className="h-3 w-3 motion-safe:animate-pulse"
        aria-hidden="true"
      />
      {label}
    </motion.span>
  );
}

/**
 * The conversation as a tile of the page — the content of the Assistente, at the tiles'
 * cadence: eyebrow, how the last answer was read and the streaming state as the aside, a reading
 * line, then the body. Empty, the body is four suggestions built from what the account holds
 * (the first is primary); with a thread, the flat message list and the follow-ups as rows under a
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
  isInterrupted,
  streamingMessageId,
  followUps,
  onRetry,
  onFollowUpSelect,
  conversationEndRef,
  threadId,
  recordProposal,
  changeableMessageId,
  onChangeReading,
}: AssistantConversazioneTileProps) {
  const aside = (
    <span className="inline-flex flex-wrap items-center gap-2">
      {periodLabel && <span>{periodLabel}</span>}
      <AnimatePresence>
        <StreamStatusChip isStreaming={isStreaming} streamStatus={streamStatus} />
      </AnimatePresence>
    </span>
  );

  return (
    <Tile eyebrow="Conversazione" aside={aside} reading={reading} className="flex-1" ariaLabel="Conversazione">
      {isEmpty ? (
        <div className="mt-3">
          {promptRows ? (
            <AssistantPromptRows rows={promptRows} onSelect={onPromptSelect} disabled={isStreaming} ariaLabel="Domande suggerite" />
          ) : (
            // The overview is loading: four rows of the same height, so the suggestions never jump in.
            <div className="space-y-1" aria-hidden="true">
              {[0, 1, 2, 3].map((index) => <Skeleton key={index} className="h-11 rounded-xl" />)}
            </div>
          )}
        </div>
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
            streamStatus={streamStatus}
            threadId={threadId}
            recordProposal={recordProposal}
            changeableMessageId={changeableMessageId}
            onChangeReading={onChangeReading}
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
