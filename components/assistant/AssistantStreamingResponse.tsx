'use client';

import React, { useDeferredValue } from 'react';
import ReactMarkdown, { type ExtraProps } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Globe, RotateCcw } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { TILE_SUB_EYEBROW_CLASS } from '@/components/ui/tile';
import { MARKDOWN_PROSE_COMPONENTS } from '@/components/ui/markdown-prose';
import { AssistantMessage, AssistantProposalState } from '@/types/assistant';
import { ExpenseProposalCard } from '@/components/assistant/ExpenseProposalCard';
import { GoalProposalCard } from '@/components/assistant/GoalProposalCard';
import { AssistantQuestionBlock } from '@/components/assistant/AssistantQuestionBlock';
import { AssistantWaiting } from '@/components/assistant/AssistantWaiting';
import { MessageIdProvider, useMessageBlocks } from '@/components/assistant/MessageIdContext';
import { MessageQuestionsProvider } from '@/components/assistant/MessageQuestionsContext';
import { AI_CONTROL_ACCENT_CLASS, AI_CONTROL_ACCENT_LABEL_CLASS, AI_GENERATED_EYEBROW_CLASS } from '@/lib/constants/aiAccent';
import { CHANGE_READING_ARIA, CHANGE_READING_LABEL, describeReadingLine, type AssistantWaitingStatus } from '@/lib/utils/assistantChatNarrative';
import { streamingAnswerText, visibleAnswerText } from '@/lib/utils/assistantAnswerTail';
import { isAnswerableQuestionMessage, readAssistantQuestionBlocks } from '@/lib/utils/assistantQuestionBlocks';
import { EXPENSE_PROPOSAL_LANGUAGE, EXPENSE_PROPOSALS_MAX_PER_MESSAGE, parseExpenseProposal } from '@/lib/utils/expenseProposal';
import { formatDate } from '@/lib/utils/formatters';
import { GOAL_PROPOSAL_LANGUAGE, parseGoalProposal } from '@/lib/utils/goalProposal';
import { ASSISTANT_QUESTION_LANGUAGE } from '@/lib/utils/questionSet';
import { cn } from '@/lib/utils';
import { COSTUME_FRAME_RADIUS_CLASS } from '@/lib/constants/themeCostume';

interface AssistantStreamingResponseProps {
  messages: AssistantMessage[];
  isInterrupted: boolean;
  onRetry: () => void;
  /**
   * ID of the message currently being streamed. While a message is active it renders as Markdown
   * already (2026-11-25), without its cards: the text up to the first fenced block
   * (`streamingAnswerText`). Once streaming finishes the cards render too.
   */
  streamingMessageId?: string;
  /** The server's stream status, for the wait before the first word (the web search names itself). */
  streamStatus?: AssistantWaitingStatus;
  /** The open thread, for a message streamed into a thread that did not exist when it was born. */
  threadId: string | undefined;
  /** Records a card's outcome on its message (`useAssistantStreaming().recordProposal`). */
  recordProposal: (messageId: string, threadId: string, key: string, state: Omit<AssistantProposalState, 'at'>) => void;
  /** The one answer whose reading may be changed — the last, at rest, outside the demo; undefined: none. */
  changeableMessageId: string | undefined;
  /** «cambia» pressed: the answer whose reading changes, and the button, where the focus returns. */
  onChangeReading: (message: AssistantMessage, opener: HTMLElement) => void;
}

/**
 * Flattens the children of a `<code>` node back into its raw source text.
 *
 * ReactMarkdown hands the block's content down as strings (and, with syntax
 * highlighting plugins, as nested elements), so the JSON has to be reassembled
 * before it can be parsed.
 */
function extractCodeText(node: React.ReactNode): string {
  if (typeof node === 'string') return node;
  if (typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(extractCodeText).join('');
  if (React.isValidElement(node)) {
    return extractCodeText((node.props as { children?: React.ReactNode }).children);
  }
  return '';
}

/**
 * A fenced block of an assistant message: a proposal card, or code.
 *
 * A ```goal-proposal block renders as a goal card and, on a message read as a registration (its own
 * `mode`, never the page's — 2026-11-12), an ```expense-proposal block as an expense card (the first
 * five of a message); an ```assistant-question block is a question card in any mode (the first two
 * on a registration, the first elsewhere — 2026-11-25; `AssistantQuestionBlock` decides, and falls
 * back to the code). Intercepted at `pre` rather than at `code`
 * because a card is block content and would otherwise be nested inside a <pre>, whose content
 * model does not allow it.
 *
 * WHICH block this is comes from the message, never from a counter kept while rendering: the
 * hast node carries the source offset of its fence, and the message's own list of blocks
 * (`useMessageBlocks`, lib/utils/expenseProposal.ts → listFencedBlocks) gives the rank of the
 * block at that offset among its language's — the card's key on the message, the same after a
 * reload. A block the list does not hold is code: an expense block inside a quote or a list item
 * (its prompt asks for lines of its own); a goal block there is still listed, after the top-level
 * ones — until 2026-11 any ```goal-proposal was a card, and its protocol never asked otherwise.
 *
 * Anything that fails to parse — malformed JSON, a missing field, an allocation that does not
 * total 100 — falls through to the code block: the user still sees exactly what the model wrote.
 */
function MarkdownPre({ children, node }: React.ComponentProps<'pre'> & ExtraProps) {
  const { blocks, mode } = useMessageBlocks();
  const firstChild = React.Children.toArray(children)[0];
  const offset = node?.position?.start.offset;
  const block = offset === undefined ? undefined : blocks.find((candidate) => candidate.offset === offset);
  const codeBlock = (
    <pre className={cn('my-3 overflow-x-auto bg-muted/40 p-3 font-mono text-[12px]', COSTUME_FRAME_RADIUS_CLASS)}>
      {children}
    </pre>
  );

  // The question block reads its own entry (MessageQuestionsContext), capped by the message's mode.
  if (block?.language === ASSISTANT_QUESTION_LANGUAGE) return <AssistantQuestionBlock index={block.index} codeBlock={codeBlock} />;

  if (block && React.isValidElement(firstChild)) {
    const source = extractCodeText((firstChild.props as { children?: React.ReactNode }).children);
    if (block.language === GOAL_PROPOSAL_LANGUAGE) {
      const proposal = parseGoalProposal(source);
      if (proposal) return <GoalProposalCard proposal={proposal} index={block.index} />;
    }
    if (block.language === EXPENSE_PROPOSAL_LANGUAGE && mode === 'register' && block.index < EXPENSE_PROPOSALS_MAX_PER_MESSAGE) {
      const proposal = parseExpenseProposal(source);
      if (proposal) return <ExpenseProposalCard proposal={proposal} index={block.index} />;
    }
  }

  return codeBlock;
}

/**
 * Custom renderers for ReactMarkdown: the shared ones of generated Markdown
 * (components/ui/markdown-prose.tsx, 2026-11-25) plus the `pre` that turns a block into a card.
 * Defined at module level (not inline) so the object reference is stable across renders —
 * prevents ReactMarkdown from unmounting/remounting when unrelated state changes. What a
 * renderer needs from its message it reads through context (MessageIdContext).
 */
const MARKDOWN_COMPONENTS: React.ComponentProps<typeof ReactMarkdown>['components'] = {
  ...MARKDOWN_PROSE_COMPONENTS,
  pre: MarkdownPre,
};

/**
 * An answer still arriving, as Markdown (2026-11-25: until then plain text that became Markdown at
 * the end, the page jumping). The text is deferred, so a burst of chunks is parsed once; no card
 * renders before the answer is complete.
 */
function StreamingMarkdown({ content }: { content: string }) {
  const deferred = useDeferredValue(content);
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={MARKDOWN_PROSE_COMPONENTS}>
      {streamingAnswerText(deferred)}
    </ReactMarkdown>
  );
}

// Shared spring-style easing for all message entrance animations.
const EASE_OUT_QUINT = [0.22, 1, 0.36, 1] as const;

/**
 * Renders the conversation message list, flat inside the Conversazione tile.
 *
 * The user's message is a muted sub-tile on the right (`bg-muted/40`, the one surface a
 * card may nest); the assistant's answer is full-width prose with no box at all — a card
 * per message inside the tile would be a card inside a card. Each message carries the
 * 9px sub-eyebrow of its role and a mono timestamp.
 *
 * User messages are always plain text.
 * Assistant messages render as Markdown while they stream (no cards) and with their cards once complete.
 */
export function AssistantStreamingResponse({
  messages,
  isInterrupted,
  onRetry,
  streamingMessageId,
  streamStatus,
  threadId,
  recordProposal,
  changeableMessageId,
  onChangeReading,
}: AssistantStreamingResponseProps) {
  const prefersReducedMotion = useReducedMotion();
  // The one message whose questions may still be answered is the thread's last assistant message.
  const lastAssistantMessageId = messages.findLast((message) => message.role === 'assistant')?.id;

  // Entrance variants — subtle lift into view, not a flashy reveal.
  const messageVariants = {
    hidden: { opacity: 0, y: prefersReducedMotion ? 0 : 6 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: prefersReducedMotion ? 0.15 : 0.30, ease: EASE_OUT_QUINT },
    },
  };

  return (
    // aria-live="polite" announces new assistant messages to screen readers.
    // aria-atomic="false" lets individual chunks be read as they arrive.
    <div
      className="flex flex-col gap-4"
      aria-live="polite"
      aria-atomic="false"
      aria-label="Conversazione con l'assistente"
    >
      <AnimatePresence initial={false}>
        {messages.map((message) => {
          const isUser = message.role === 'user';
          // An assistant message is "streaming" while its id matches the active stream slot.
          const isActiveStream = !isUser && message.id === streamingMessageId;

          return (
            <motion.div
              // Not the id: a streamed message takes its server id when the stream ends, and a
              // key that changed there would remount the answer (and its cards) and replay the
              // entrance. The role and the instant of birth do not change.
              key={`${message.role}:${message.createdAt.getTime()}`}
              // What the model wrote (DESIGN → The AI-Accent Rule): the role eyebrow is accented.
              data-generated={isUser ? undefined : true}
              variants={messageVariants}
              initial="hidden"
              animate="visible"
              // Exit intentionally absent — messages are permanent once in the list.
              // min-w-0 prevents the flex/grid child from overflowing its grid cell on narrow viewports.
              className={cn(
                'min-w-0',
                isUser ? cn('ml-auto max-w-[85%] bg-muted/40 px-4 py-3', COSTUME_FRAME_RADIUS_CLASS) : 'w-full'
              )}
            >
              {/* Role label + timestamp */}
              <div className="mb-2 flex items-baseline justify-between gap-3">
                <span className={cn(TILE_SUB_EYEBROW_CLASS, !isUser && AI_GENERATED_EYEBROW_CLASS)}>{isUser ? 'Tu' : 'Assistente'}</span>
                <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                  {formatDate(message.createdAt)}
                </span>
              </div>

              {/* Content */}
              {!isUser ? (
                isActiveStream ? (
                  // Markdown while streaming, up to the first fenced block: the tail of the next
                  // questions, a card's JSON and a fence half typed are never shown.
                  <div className="max-w-none text-foreground">
                    {streamingAnswerText(message.content) ? (
                      <StreamingMarkdown content={message.content} />
                    ) : (
                      <AssistantWaiting reading={message.routeReading} status={streamStatus ?? null} />
                    )}
                    {/* An answer already begun can stand still while the server searches the web
                        (owner, 2026-11-16: a minute on the first sentence): the wait comes back under it. */}
                    {streamingAnswerText(message.content) && streamStatus === 'searching' && (
                      <div className="mt-2 flex">
                        <AssistantWaiting reading={message.routeReading} status="searching" />
                      </div>
                    )}
                  </div>
                ) : (
                  // Full markdown once the stream is complete
                  <div className="max-w-none text-foreground">
                    {message.content ? (
                      <MessageIdProvider
                        message={message}
                        mode={message.mode}
                        recordProposal={(key, state) =>
                          recordProposal(message.id, message.threadId === 'pending' ? (threadId ?? 'pending') : message.threadId, key, state)
                        }
                      >
                        <MessageQuestionsProvider
                          // The MESSAGE's mode, as the expense card's gate: two cards on a registration, one elsewhere.
                          blocks={readAssistantQuestionBlocks(message.content, message.mode)}
                          answerable={isAnswerableQuestionMessage(message, lastAssistantMessageId, streamingMessageId)}
                        >
                          <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            components={MARKDOWN_COMPONENTS}
                          >
                            {/* An answer that never got its `done` (interrupted, or ended on an error) keeps
                                its local id and the raw text: its tail is hidden here. */}
                            {message.id.startsWith('local-') ? visibleAnswerText(message.content) : message.content}
                          </ReactMarkdown>
                        </MessageQuestionsProvider>
                      </MessageIdProvider>
                    ) : (
                      <span className="italic text-muted-foreground">…</span>
                    )}
                  </div>
                )
              ) : (
                <p className="whitespace-pre-wrap text-sm leading-[1.55] text-foreground">{message.content}</p>
              )}

              {/* How the message was read (2026-11-12), once the answer is complete: «cambia» under the
                  last answer only. Not model text — no accent. An older message without a reading
                  keeps the badge. */}
              {!isUser && !isActiveStream && message.routeReading && (
                <p className="mt-2 text-[12px] leading-[1.45] text-muted-foreground">
                  {describeReadingLine(message.routeReading, message.webSearchUsed)}
                  {message.id === changeableMessageId && (
                    <>
                      {' · '}
                      <button
                        type="button"
                        aria-label={CHANGE_READING_ARIA}
                        onClick={(event) => onChangeReading(message, event.currentTarget)}
                        className="inline-flex min-h-11 items-center rounded font-medium text-foreground underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring desktop:min-h-0"
                      >
                        {CHANGE_READING_LABEL}
                      </button>
                    </>
                  )}
                </p>
              )}

              {!message.routeReading && message.webSearchUsed && (
                <span className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-0.5 text-[11px] text-muted-foreground">
                  <Globe className="h-3 w-3" aria-hidden="true" />
                  Ricerca web usata
                </span>
              )}
            </motion.div>
          );
        })}
      </AnimatePresence>

      {isInterrupted && (
        <div role="status" className={cn('flex flex-wrap items-center justify-between gap-3 bg-muted/40 px-4 py-3', COSTUME_FRAME_RADIUS_CLASS)}>
          <span className="inline-flex items-center gap-2 text-[13px] text-foreground">
            <RotateCcw className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            Risposta interrotta: la parte arrivata è rimasta visibile.
          </span>
          <Button variant="outline" size="sm" onClick={onRetry} className={cn('h-8 text-xs', AI_CONTROL_ACCENT_CLASS, AI_CONTROL_ACCENT_LABEL_CLASS)}>
            Rigenera
          </Button>
        </div>
      )}
    </div>
  );
}
