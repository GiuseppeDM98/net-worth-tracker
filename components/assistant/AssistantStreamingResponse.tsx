'use client';

import React from 'react';
import ReactMarkdown, { type ExtraProps } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Globe, RotateCcw } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { TILE_SUB_EYEBROW_CLASS } from '@/components/ui/tile';
import { AssistantMessage, AssistantMode, AssistantProposalState } from '@/types/assistant';
import { ExpenseProposalCard } from '@/components/assistant/ExpenseProposalCard';
import { GoalProposalCard } from '@/components/assistant/GoalProposalCard';
import { AssistantQuestionBlock } from '@/components/assistant/AssistantQuestionBlock';
import { MessageIdProvider, useMessageBlocks } from '@/components/assistant/MessageIdContext';
import { MessageQuestionsProvider } from '@/components/assistant/MessageQuestionsContext';
import { AI_CONTROL_ACCENT_CLASS, AI_CONTROL_ACCENT_LABEL_CLASS, AI_GENERATED_EYEBROW_CLASS } from '@/lib/constants/aiAccent';
import { isAnswerableQuestionMessage, readAssistantQuestionBlocks } from '@/lib/utils/assistantQuestionBlocks';
import { EXPENSE_PROPOSAL_LANGUAGE, EXPENSE_PROPOSALS_MAX_PER_MESSAGE, parseExpenseProposal } from '@/lib/utils/expenseProposal';
import { formatDate } from '@/lib/utils/formatters';
import { GOAL_PROPOSAL_LANGUAGE, parseGoalProposal } from '@/lib/utils/goalProposal';
import { ASSISTANT_QUESTION_LANGUAGE } from '@/lib/utils/questionSet';
import { cn } from '@/lib/utils';

interface AssistantStreamingResponseProps {
  messages: AssistantMessage[];
  isInterrupted: boolean;
  onRetry: () => void;
  /**
   * ID of the message currently being streamed.
   * While a message is active, it renders as plain text (whitespace-pre-wrap)
   * to avoid ReactMarkdown re-parsing partial/incomplete markdown on every chunk.
   * Once streaming finishes (this prop is undefined or points to a different message),
   * the message renders as full markdown.
   */
  streamingMessageId?: string;
  /** The mode the conversation is shown in: an ```expense-proposal block is a card in Registra alone. */
  mode: AssistantMode;
  /** The open thread, for a message streamed into a thread that did not exist when it was born. */
  threadId: string | undefined;
  /** Records a card's outcome on its message (`useAssistantStreaming().recordProposal`). */
  recordProposal: (messageId: string, threadId: string, key: string, state: Omit<AssistantProposalState, 'at'>) => void;
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
 * A ```goal-proposal block renders as a goal card and, in Registra, an ```expense-proposal block
 * as an expense card (the first five of a message) and an ```assistant-question block as a
 * question card (the first two; `AssistantQuestionBlock` decides, and falls back to the code). Intercepted at `pre` rather than at `code`
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
    <pre className="my-3 overflow-x-auto rounded-xl bg-muted/40 p-3 font-mono text-[12px]">
      {children}
    </pre>
  );

  // The question block reads its own entry (MessageQuestionsContext): no entry outside Registra.
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
 * Custom renderers for ReactMarkdown.
 * Defined at module level (not inline) so the object reference is stable across renders —
 * prevents ReactMarkdown from unmounting/remounting when unrelated state changes. What a
 * renderer needs from its message it reads through context (MessageIdContext).
 */
const MARKDOWN_COMPONENTS: React.ComponentProps<typeof ReactMarkdown>['components'] = {
  pre: MarkdownPre,
  table: ({ children }) => (
    <div className="my-3 w-full overflow-x-auto">
      <table className="w-full border-collapse text-[13px]">{children}</table>
    </div>
  ),
  thead: ({ children }) => (
    <thead className="border-b border-border">{children}</thead>
  ),
  th: ({ children }) => (
    <th scope="col" className={cn(TILE_SUB_EYEBROW_CLASS, 'px-3 py-2 text-left')}>
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="px-3 py-2 text-[13px] text-foreground [&:has(>strong)]:font-mono">{children}</td>
  ),
  tr: ({ children }) => (
    <tr className="border-b border-border last:border-0">{children}</tr>
  ),
};

const NO_QUESTION_BLOCKS: ReturnType<typeof readAssistantQuestionBlocks> = [];

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
 * Assistant messages render as plain text during streaming, switch to ReactMarkdown on completion.
 */
export function AssistantStreamingResponse({
  messages,
  isInterrupted,
  onRetry,
  streamingMessageId,
  mode,
  threadId,
  recordProposal,
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
                isUser ? 'ml-auto max-w-[85%] rounded-xl bg-muted/40 px-4 py-3' : 'w-full'
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
                  // Plain text during streaming — avoids ReactMarkdown re-parse on every chunk
                  <p className="whitespace-pre-wrap text-sm leading-[1.6] text-foreground">
                    {message.content || <span className="italic text-muted-foreground">…</span>}
                  </p>
                ) : (
                  // Full markdown once the stream is complete
                  <div className="prose prose-sm dark:prose-invert max-w-none text-foreground prose-headings:text-foreground prose-strong:text-foreground prose-li:text-foreground">
                    {message.content ? (
                      <MessageIdProvider
                        message={message}
                        mode={mode}
                        recordProposal={(key, state) =>
                          recordProposal(message.id, message.threadId === 'pending' ? (threadId ?? 'pending') : message.threadId, key, state)
                        }
                      >
                        <MessageQuestionsProvider
                          // The PAGE's mode, as the expense card's gate: a question is a card in Registra alone.
                          blocks={mode === 'register' ? readAssistantQuestionBlocks(message.content) : NO_QUESTION_BLOCKS}
                          answerable={isAnswerableQuestionMessage(message, lastAssistantMessageId, streamingMessageId)}
                        >
                          <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            components={MARKDOWN_COMPONENTS}
                          >
                            {message.content}
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

              {message.webSearchUsed && (
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
        <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-muted/40 px-4 py-3">
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
