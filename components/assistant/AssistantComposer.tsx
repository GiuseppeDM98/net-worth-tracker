'use client';

import { useEffect, useId, useRef, type RefObject } from 'react';
import { NO_AUTOFILL_ATTRIBUTES } from '@/components/ui/autofill';
import { Square, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AI_CONTROL_ACCENT_CLASS } from '@/lib/constants/aiAccent';
import { CHAT_COMPOSER_PLACEHOLDER } from '@/lib/utils/assistantChatNarrative';
import { ASSISTANT_PROMPT_MAX_LENGTH, describePromptLength } from '@/lib/utils/assistantPeriodOptions';
import { cn } from '@/lib/utils';
import { COSTUME_FRAME_RADIUS_CLASS } from '@/lib/constants/themeCostume';

interface AssistantComposerProps {
  draft: string;
  onChange: (value: string) => void;
  /** Called when the user triggers a send (Enter key or button click). */
  onSubmit: () => void;
  /** Called when the user clicks the stop button during streaming. */
  onStop: () => void;
  isStreaming: boolean;
  canSubmit: boolean;
  /** The page's ref to the textarea, when it moves the focus here (a suggestion, `?mode=registra`). */
  inputRef?: RefObject<HTMLTextAreaElement | null>;
  /** The page's ref to «Interrompi risposta», where «Rileggi» sends the focus (the textarea is disabled while streaming). */
  stopRef?: RefObject<HTMLButtonElement | null>;
}

/**
 * Sticky composer for the assistant chat: textarea + send/stop, nothing else.
 *
 * There is no period or mode to pick (2026-11-12): every message goes as `mode: 'auto'` and the
 * router reads what it is and on which period; «cambia» under the answer changes the reading.
 *
 * The message is capped at `ASSISTANT_PROMPT_MAX_LENGTH` characters, the cap the stream route
 * enforces, and a counter appears when the cap is in sight — tied to the textarea by
 * `aria-describedby`, not a live region: it is read with the field, never over the typing.
 */
export function AssistantComposer({
  draft,
  onChange,
  onSubmit,
  onStop,
  isStreaming,
  canSubmit,
  inputRef,
  stopRef,
}: AssistantComposerProps) {
  const ownRef = useRef<HTMLTextAreaElement>(null);
  const textareaRef = inputRef ?? ownRef;
  const counterId = useId();
  const lengthLabel = describePromptLength(draft.length);

  // Adjust textarea height to content — resets to auto first to shrink on deletion.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [draft, textareaRef]);

  return (
    // safe-area-inset-bottom: on iOS the home indicator sits below the viewport; pb accounts for it.
    <div className="border-t border-border bg-background px-4 pt-3 pb-3 [padding-bottom:calc(env(safe-area-inset-bottom,0px)+12px)] shadow-[0_-4px_16px_-2px_rgba(0,0,0,0.06)] dark:shadow-[0_-4px_16px_-2px_rgba(0,0,0,0.3)]">
      {/* Textarea + send/stop button row */}
      <div className="flex items-end gap-2">
        <textarea
          ref={textareaRef}
          {...NO_AUTOFILL_ATTRIBUTES}
          value={draft}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            // Enter sends; Shift+Enter inserts newline.
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              if (canSubmit) onSubmit();
            }
          }}
          placeholder={CHAT_COMPOSER_PLACEHOLDER}
          aria-label="Scrivi un messaggio all'assistente"
          disabled={isStreaming}
          maxLength={ASSISTANT_PROMPT_MAX_LENGTH}
          aria-describedby={lengthLabel ? counterId : undefined}
          rows={1}
          className={cn(
            'flex-1 resize-none border border-border bg-muted/30 px-4 py-3 text-sm text-foreground', COSTUME_FRAME_RADIUS_CLASS,
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
            ref={stopRef}
            onClick={() => onStop()}
            size="icon"
            className={cn('h-[44px] w-[44px] shrink-0', COSTUME_FRAME_RADIUS_CLASS)}
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
            // It calls the model: the accent on hover and keyboard focus, never at rest. A filled
            // button has no border of its own, hence the transparent one the accent colours.
            className={cn('h-[44px] w-[44px] shrink-0 border border-transparent', COSTUME_FRAME_RADIUS_CLASS, AI_CONTROL_ACCENT_CLASS)}
            aria-label="Invia messaggio"
          >
            <Send className="h-4 w-4" />
          </Button>
        )}
      </div>

      {lengthLabel && (
        <p id={counterId} className="mt-2 font-mono text-[11px] tabular-nums text-muted-foreground">
          {lengthLabel}
        </p>
      )}

      {/* Keyboard hint — desktop only; wastes height on mobile where it's irrelevant. */}
      <p className="hidden desktop:block mt-1.5 text-xs text-muted-foreground">
        {'Enter per inviare · Shift+Enter per andare a capo'}
      </p>
    </div>
  );
}
