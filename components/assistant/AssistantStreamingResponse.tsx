'use client';

import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Globe, RefreshCw } from 'lucide-react';
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
   *
   * Pattern mirrors AIAnalysisDialog.tsx: plain text during stream → markdown on done.
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

/**
 * Renders the conversation message list.
 * User messages are always plain text.
 * Assistant messages show plain text while streaming, then switch to ReactMarkdown on completion.
 */
export function AssistantStreamingResponse({
  messages,
  isInterrupted,
  onRetry,
  streamingMessageId,
}: AssistantStreamingResponseProps) {
  return (
    // aria-live="polite" announces new assistant messages to screen readers.
    // aria-atomic="false" lets individual chunks be read as they arrive instead of
    // re-reading the entire region on every update.
    <div className="space-y-4" aria-live="polite" aria-atomic="false" aria-label="Conversazione con l'assistente">
      {messages.map((message) => {
        // An assistant message is "streaming" while its id matches the active stream slot.
        // User messages are never streamed — always plain text.
        const isActiveStream = message.role === 'assistant' && message.id === streamingMessageId;

        return (
          <div
            key={message.id}
            className={cn(
              'rounded-xl border px-4 py-4 text-sm',
              message.role === 'user'
                ? 'border-primary/25 bg-primary/5'
                : 'border-border bg-background',
            )}
          >
            <div className="mb-2.5 flex items-center justify-between gap-3">
              <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                {message.role === 'user' ? 'Tu' : 'Assistente'}
              </span>
              <span className="text-xs text-muted-foreground">
                {formatDate(message.createdAt)}
              </span>
            </div>

            {message.role === 'assistant' ? (
              isActiveStream ? (
                // Plain text during streaming: avoids ReactMarkdown re-parse on every chunk
                // which causes layout jumps when markdown syntax is incomplete mid-stream.
                <p className="whitespace-pre-wrap text-foreground">
                  {message.content || <span className="italic text-muted-foreground">…</span>}
                </p>
              ) : (
                // Full markdown once the stream is done
                <div className="prose prose-sm dark:prose-invert max-w-none text-foreground prose-headings:text-foreground prose-strong:text-foreground prose-li:text-foreground">
                  {message.content ? (
                    // remarkGfm enables tables, strikethrough, task lists, and autolinks
                    // — without it markdown tables render as raw pipe characters.
                    // Table components are overridden to apply explicit borders and padding
                    // because Tailwind prose does not add cell structure by default.
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
        );
      })}

      {isInterrupted && (
        <Alert>
          <RefreshCw className="h-4 w-4" />
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
