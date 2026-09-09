'use client';

import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Globe, RotateCcw } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { TILE_SUB_EYEBROW_CLASS } from '@/components/ui/tile';
import { AssistantMessage } from '@/types/assistant';
import { GoalProposalCard } from '@/components/assistant/GoalProposalCard';
import { formatDate } from '@/lib/utils/formatters';
import { parseGoalProposal } from '@/lib/utils/goalProposal';
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
}

/** Language tag that turns a fenced block into a goal proposal card. */
const GOAL_PROPOSAL_LANGUAGE = 'language-goal-proposal';

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
 * Custom renderers for ReactMarkdown.
 * Defined at module level (not inline) so the object reference is stable across renders —
 * prevents ReactMarkdown from unmounting/remounting when unrelated state changes.
 */
const MARKDOWN_COMPONENTS: React.ComponentProps<typeof ReactMarkdown>['components'] = {
  // A ```goal-proposal block renders as a card, not as code. Intercepted at `pre`
  // rather than at `code` because the card is block content and would otherwise be
  // nested inside a <pre>, whose content model does not allow it.
  //
  // Anything that fails to parse — malformed JSON, a missing field, an allocation that
  // does not total 100 — falls through to the normal code block: the user still sees
  // exactly what the model wrote instead of an empty message.
  pre: ({ children }) => {
    const firstChild = React.Children.toArray(children)[0];

    if (React.isValidElement(firstChild)) {
      const props = firstChild.props as { className?: string; children?: React.ReactNode };
      if (props.className?.includes(GOAL_PROPOSAL_LANGUAGE)) {
        const proposal = parseGoalProposal(extractCodeText(props.children));
        if (proposal) {
          return <GoalProposalCard proposal={proposal} />;
        }
      }
    }

    return (
      <pre className="my-3 overflow-x-auto rounded-xl bg-muted/40 p-3 font-mono text-[12px]">
        {children}
      </pre>
    );
  },
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
}: AssistantStreamingResponseProps) {
  const prefersReducedMotion = useReducedMotion();

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
              key={message.id}
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
                <span className={TILE_SUB_EYEBROW_CLASS}>{isUser ? 'Tu' : 'Assistente'}</span>
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
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={MARKDOWN_COMPONENTS}
                      >
                        {message.content}
                      </ReactMarkdown>
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
          <Button variant="outline" size="sm" onClick={onRetry} className="h-8 text-xs">
            Rigenera
          </Button>
        </div>
      )}
    </div>
  );
}
