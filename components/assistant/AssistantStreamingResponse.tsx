'use client';

import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Globe, RotateCcw } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AssistantMessage } from '@/types/assistant';
import { formatDate } from '@/lib/utils/formatters';
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

/**
 * Custom renderers for ReactMarkdown.
 * Defined at module level (not inline) so the object reference is stable across renders —
 * prevents ReactMarkdown from unmounting/remounting when unrelated state changes.
 */
const MARKDOWN_COMPONENTS: React.ComponentProps<typeof ReactMarkdown>['components'] = {
  table: ({ children }) => (
    <div className="my-3 w-full overflow-x-auto">
      <table className="w-full border-collapse text-sm">{children}</table>
    </div>
  ),
  thead: ({ children }) => (
    <thead className="border-b border-border">{children}</thead>
  ),
  th: ({ children }) => (
    <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="px-3 py-2 text-sm text-foreground">{children}</td>
  ),
  tr: ({ children }) => (
    <tr className="border-b border-border/50 last:border-0">{children}</tr>
  ),
};

// Shared spring-style easing for all message entrance animations.
const EASE_OUT_QUINT = [0.22, 1, 0.36, 1] as const;

/**
 * Renders the conversation message list.
 *
 * Visual differentiation (Trade Republic pattern):
 * - User messages: right-aligned, max-w-[85%], muted background — clearly the outgoing side
 * - Assistant messages: full-width, card background with subtle border — the data surface
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
      className="space-y-4"
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
                isUser
                  // User: right-aligned bubble, softer muted background
                  ? 'ml-auto max-w-[85%]'
                  // Assistant: full-width, card surface for readable prose
                  : 'w-full'
              )}
            >
              <div
                className={cn(
                  'rounded-xl border px-4 py-4 text-sm',
                  isUser
                    ? 'border-border bg-muted/40'
                    : 'border-border bg-card'
                )}
              >
                {/* Role label + timestamp */}
                <div className="mb-2.5 flex items-center justify-between gap-3">
                  <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                    {isUser ? 'Tu' : 'Assistente'}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {formatDate(message.createdAt)}
                  </span>
                </div>

                {/* Content */}
                {!isUser ? (
                  isActiveStream ? (
                    // Plain text during streaming — avoids ReactMarkdown re-parse on every chunk
                    <p className="whitespace-pre-wrap text-foreground">
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
                  <p className="whitespace-pre-wrap text-foreground">{message.content}</p>
                )}

                {message.webSearchUsed && (
                  <Badge variant="outline" className="mt-2 gap-1.5 text-[11px]">
                    <Globe className="h-3 w-3" />
                    Web search usata
                  </Badge>
                )}
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>

      {isInterrupted && (
        <Alert>
          <RotateCcw className="h-4 w-4" />
          <AlertTitle>Risposta interrotta</AlertTitle>
          <AlertDescription className="mt-1 flex items-center gap-3">
            <span>La risposta parziale è rimasta visibile.</span>
            <Button variant="outline" size="sm" onClick={onRetry} className="h-7 text-xs">
              Rigenera
            </Button>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
