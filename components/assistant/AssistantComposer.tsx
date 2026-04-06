'use client';

import { useEffect, useRef } from 'react';
import { Loader2, Send } from 'lucide-react';
import { AssistantMonthPicker } from '@/components/assistant/AssistantMonthPicker';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AssistantMode, AssistantMonthSelectorValue } from '@/types/assistant';
import { cn } from '@/lib/utils';

interface AssistantComposerProps {
  draft: string;
  onChange: (value: string) => void;
  /** Called when the user triggers a send (Enter key or button click). */
  onSubmit: () => void;
  isStreaming: boolean;
  canSubmit: boolean;
  mode: AssistantMode;
  onModeChange: (mode: AssistantMode) => void;
  selectedMonth: AssistantMonthSelectorValue;
  monthOptions: AssistantMonthSelectorValue[];
  onMonthChange: (month: AssistantMonthSelectorValue) => void;
  /** Error message shown inline above the submit button (e.g. no data for selected month). */
  errorHint?: string;
}

const MONTH_NAMES = [
  'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
  'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre',
];

/**
 * Fixed composer area for the assistant chat.
 * - Autosize textarea: grows up to max-h-[200px] then scrolls inside.
 * - Enter submits; Shift+Enter inserts a newline (standard chat convention).
 * - Mode selector + month picker stay compact above the textarea.
 * - Sticky positioning and bottom clearance are handled by the parent layout.
 */
export function AssistantComposer({
  draft,
  onChange,
  onSubmit,
  isStreaming,
  canSubmit,
  mode,
  onModeChange,
  selectedMonth,
  monthOptions,
  onMonthChange,
  errorHint,
}: AssistantComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Adjust textarea height to content — resets to auto first to shrink on deletion
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [draft]);

  const activeMonthLabel = `${MONTH_NAMES[selectedMonth.month - 1]} ${selectedMonth.year}`;

  return (
    <div className="border-t border-border bg-background px-4 pb-3 pt-3 max-desktop:portrait:pb-[88px]">
      {/* Context row: mode + month picker */}
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <Select value={mode} onValueChange={(v) => onModeChange(v as AssistantMode)} disabled={isStreaming}>
          <SelectTrigger className="h-8 w-auto min-w-[140px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="month_analysis">Analisi mensile</SelectItem>
            <SelectItem value="chat">Chat libera</SelectItem>
          </SelectContent>
        </Select>

        {mode === 'month_analysis' && (
          <div className="w-auto min-w-[160px]">
            <AssistantMonthPicker
              value={selectedMonth}
              options={monthOptions}
              onChange={onMonthChange}
              disabled={isStreaming}
            />
          </div>
        )}

        {mode === 'chat' && (
          <span className="text-xs text-muted-foreground">
            Chat libera sul patrimonio
          </span>
        )}
      </div>

      {/* Textarea + send button row */}
      <div className="flex items-end gap-2">
        <textarea
          ref={textareaRef}
          value={draft}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            // Enter sends; Shift+Enter inserts newline
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              if (canSubmit) onSubmit();
            }
          }}
          placeholder={
            mode === 'month_analysis'
              ? `Scrivi la tua domanda sul mese di ${activeMonthLabel}…`
              : 'Scrivi una domanda sul tuo portafoglio…'
          }
          disabled={isStreaming}
          rows={1}
          className={cn(
            'flex-1 resize-none rounded-xl border border-border bg-muted/30 px-4 py-3 text-sm text-foreground',
            'placeholder:text-muted-foreground',
            'focus:outline-none focus:ring-1 focus:ring-ring',
            'disabled:opacity-50',
            // Height is controlled via the useEffect above; overflow enables internal scroll
            'min-h-[52px] max-h-[200px] overflow-y-auto',
          )}
        />

        <Button
          onClick={() => onSubmit()}
          disabled={!canSubmit}
          size="icon"
          className="h-[52px] w-[52px] shrink-0 rounded-xl"
          aria-label="Invia messaggio"
        >
          {isStreaming ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </Button>
      </div>

      {/* Inline error / hint below the input row */}
      {errorHint ? (
        <p className="mt-2 text-xs text-destructive">{errorHint}</p>
      ) : (
        <p className="mt-1.5 text-xs text-muted-foreground">
          {'Enter per inviare · Shift+Enter per andare a capo'}
        </p>
      )}
    </div>
  );
}
