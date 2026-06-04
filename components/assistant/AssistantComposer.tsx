'use client';

import { useEffect, useRef } from 'react';
import { Square, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface AssistantComposerProps {
  draft: string;
  onChange: (value: string) => void;
  /** Called when the user triggers a send (Enter key or button click). */
  onSubmit: () => void;
  /** Called when the user clicks the stop button during streaming. */
  onStop: () => void;
  isStreaming: boolean;
  canSubmit: boolean;
  /** Placeholder reflecting the active period — computed by the parent, which owns the selector. */
  placeholder?: string;
  /** Error message shown inline above the keyboard hint (e.g. no data for selected period). */
  errorHint?: string;
}

/**
 * Sticky composer for the assistant chat: textarea + send/stop, nothing else.
 *
 * Period selection and chat context used to live here; they now sit in the
 * AssistantPeriodSelector at the top of the column, next to the data they drive.
 * Keeping the composer to a single job (compose + send) frees the thumb zone on
 * mobile and removes the top/bottom split of the "what + when" decision.
 */
export function AssistantComposer({
  draft,
  onChange,
  onSubmit,
  onStop,
  isStreaming,
  canSubmit,
  placeholder,
  errorHint,
}: AssistantComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Adjust textarea height to content — resets to auto first to shrink on deletion.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [draft]);

  return (
    // safe-area-inset-bottom: on iOS the home indicator sits below the viewport; pb accounts for it.
    <div className="border-t border-border bg-background px-4 pt-3 pb-3 [padding-bottom:calc(env(safe-area-inset-bottom,0px)+12px)] shadow-[0_-4px_16px_-2px_rgba(0,0,0,0.06)] dark:shadow-[0_-4px_16px_-2px_rgba(0,0,0,0.3)]">
      {/* Textarea + send/stop button row */}
      <div className="flex items-end gap-2">
        <textarea
          ref={textareaRef}
          value={draft}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            // Enter sends; Shift+Enter inserts newline.
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              if (canSubmit) onSubmit();
            }
          }}
          placeholder={placeholder ?? 'Scrivi una domanda sul tuo portafoglio…'}
          aria-label="Scrivi un messaggio all'assistente"
          disabled={isStreaming}
          rows={1}
          className={cn(
            'flex-1 resize-none rounded-xl border border-border bg-muted/30 px-4 py-3 text-sm text-foreground',
            'placeholder:text-muted-foreground',
            'focus:outline-none focus:ring-1 focus:ring-ring',
            'disabled:opacity-50',
            'min-h-[44px] max-h-[200px] overflow-y-auto',
            // Hide native scrollbar on WebKit/Chromium — scroll remains functional.
            '[&::-webkit-scrollbar]:hidden [scrollbar-width:none]'
          )}
        />

        {/* During streaming: stop button (always enabled so the user can abort).
            At rest: send button (gated on canSubmit). */}
        {isStreaming ? (
          <Button
            onClick={() => onStop()}
            size="icon"
            className="h-[44px] w-[44px] shrink-0 rounded-xl"
            aria-label="Interrompi risposta"
            variant="destructive"
          >
            <Square className="h-4 w-4" />
          </Button>
        ) : (
          <Button
            onClick={() => onSubmit()}
            disabled={!canSubmit}
            size="icon"
            className="h-[44px] w-[44px] shrink-0 rounded-xl"
            aria-label="Invia messaggio"
          >
            <Send className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Error hint — shown on both mobile and desktop. */}
      {errorHint && <p className="mt-2 text-xs text-destructive">{errorHint}</p>}

      {/* Keyboard hint — desktop only; wastes height on mobile where it's irrelevant. */}
      {!errorHint && (
        <p className="hidden desktop:block mt-1.5 text-xs text-muted-foreground">
          {'Enter per inviare · Shift+Enter per andare a capo'}
        </p>
      )}
    </div>
  );
}
