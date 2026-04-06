'use client';

import ReactMarkdown from 'react-markdown';
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
}

/**
 * Renders the conversation message list with markdown support for assistant replies.
 * User messages stay plain text; assistant messages render structured markdown so
 * the three-section output from buildMonthAnalysisPrompt (In sintesi / Cosa ha mosso
 * il patrimonio / 1-2 azioni) displays correctly with headings and lists.
 */
export function AssistantStreamingResponse({
  messages,
  isInterrupted,
  onRetry,
}: AssistantStreamingResponseProps) {
  return (
    <div className="space-y-3">
      {messages.map((message) => (
        <div
          key={message.id}
          className={cn(
            'rounded-xl border px-4 py-3 text-sm',
            message.role === 'user'
              ? 'border-primary/25 bg-primary/5'
              : 'border-border bg-background'
          )}
        >
          <div className="mb-2 flex items-center justify-between gap-3">
            <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              {message.role === 'user' ? 'Tu' : 'Assistente'}
            </span>
            <span className="text-xs text-muted-foreground">
              {formatDate(message.createdAt)}
            </span>
          </div>

          {message.role === 'assistant' ? (
            // Render assistant replies as markdown so the structured sections display correctly
            <div className="prose prose-sm dark:prose-invert max-w-none text-foreground prose-headings:text-foreground prose-strong:text-foreground prose-li:text-foreground">
              {message.content ? (
                <ReactMarkdown>{message.content}</ReactMarkdown>
              ) : (
                <span className="italic text-muted-foreground">...</span>
              )}
            </div>
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
      ))}

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
