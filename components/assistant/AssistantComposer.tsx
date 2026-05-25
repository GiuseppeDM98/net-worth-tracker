'use client';

import { useEffect, useRef } from 'react';
import { Square, Send } from 'lucide-react';
import { AssistantMonthPicker } from '@/components/assistant/AssistantMonthPicker';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AssistantChatContextType, AssistantMode, AssistantMonthSelectorValue } from '@/types/assistant';
import { cn } from '@/lib/utils';
import { MONTH_NAMES } from '@/lib/constants/months';

interface AssistantComposerProps {
  draft: string;
  onChange: (value: string) => void;
  /** Called when the user triggers a send (Enter key or button click). */
  onSubmit: () => void;
  /** Called when the user clicks the stop button during streaming. */
  onStop: () => void;
  isStreaming: boolean;
  canSubmit: boolean;
  /** Current mode — used to determine which period picker to show. Not shown as a selector here;
   *  mode switching happens via the top-level pill strip in AssistantPageClient. */
  mode: AssistantMode;
  selectedMonth: AssistantMonthSelectorValue;
  monthOptions: AssistantMonthSelectorValue[];
  onMonthChange: (month: AssistantMonthSelectorValue) => void;
  selectedYear: number;
  yearOptions: number[];
  onYearChange: (year: number) => void;
  /** Context type for chat mode: determines which period bundle is passed to Claude. */
  chatContextType: AssistantChatContextType;
  onChatContextTypeChange: (type: AssistantChatContextType) => void;
  /** Error message shown inline above the submit button (e.g. no data for selected month). */
  errorHint?: string;
}

const CHAT_CONTEXT_CHIPS: { value: AssistantChatContextType; label: string }[] = [
  { value: 'none', label: 'Nessuno' },
  { value: 'month', label: 'Mese' },
  { value: 'year', label: 'Anno' },
  { value: 'ytd', label: 'YTD' },
  { value: 'history', label: 'Storico' },
];

/**
 * Sticky composer area for the assistant chat.
 *
 * Mode selection has been moved to the top-level pill strip in AssistantPageClient —
 * this component only handles the text input, period picker (when required by the
 * current mode), and the chat context selector (chat mode only).
 *
 * Period picker visibility by mode:
 *   month_analysis  → month picker
 *   year_analysis   → year picker
 *   ytd_analysis    → no picker (current year, implicit)
 *   history_analysis → no picker (history start year, implicit)
 *   chat            → chat context row below textarea
 */
export function AssistantComposer({
  draft,
  onChange,
  onSubmit,
  onStop,
  isStreaming,
  canSubmit,
  mode,
  selectedMonth,
  monthOptions,
  onMonthChange,
  selectedYear,
  yearOptions,
  onYearChange,
  chatContextType,
  onChatContextTypeChange,
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

  const textareaPlaceholder = (() => {
    if (mode === 'month_analysis') return `Scrivi la tua domanda sul mese di ${activeMonthLabel}…`;
    if (mode === 'year_analysis') return `Scrivi la tua domanda sull'anno ${selectedYear}…`;
    if (mode === 'ytd_analysis') return 'Scrivi la tua domanda sull\'andamento da inizio anno…';
    if (mode === 'history_analysis') return 'Scrivi la tua domanda sullo storico del portafoglio…';
    if (mode === 'chat') {
      if (chatContextType === 'month') return `Scrivi la tua domanda — contesto: ${activeMonthLabel}…`;
      if (chatContextType === 'year') return `Scrivi la tua domanda — contesto: anno ${selectedYear}…`;
      if (chatContextType === 'ytd') return 'Scrivi la tua domanda — contesto: YTD…';
      if (chatContextType === 'history') return 'Scrivi la tua domanda — contesto: storico totale…';
    }
    return 'Scrivi una domanda sul tuo portafoglio…';
  })();

  // Whether the current mode needs an explicit period picker in the composer
  const showMonthPicker = mode === 'month_analysis';
  const showYearPicker = mode === 'year_analysis';
  const showImplicitPeriodHint = mode === 'ytd_analysis' || mode === 'history_analysis';

  return (
    // safe-area-inset-bottom: on iOS the home indicator sits below the viewport; pb accounts for it.
    <div className="border-t border-border bg-background px-4 pt-3 pb-3 [padding-bottom:calc(env(safe-area-inset-bottom,0px)+12px)] shadow-[0_-4px_16px_-2px_rgba(0,0,0,0.06)] dark:shadow-[0_-4px_16px_-2px_rgba(0,0,0,0.3)]">

      {/* Period picker row — shown when the current mode requires explicit period selection.
          Hidden for ytd/history (implicit period) and chat (handled by chat context row below). */}
      {(showMonthPicker || showYearPicker || showImplicitPeriodHint) && (
        <div className="mb-2 flex items-center gap-2 min-h-0">
          {showMonthPicker && (
            <div className="w-auto min-w-[150px]">
              <AssistantMonthPicker
                value={selectedMonth}
                options={monthOptions}
                onChange={onMonthChange}
                disabled={isStreaming}
              />
            </div>
          )}
          {showYearPicker && (
            <Select
              value={String(selectedYear)}
              onValueChange={(v) => onYearChange(Number(v))}
              disabled={isStreaming}
            >
              <SelectTrigger className="h-8 w-auto min-w-[90px] text-xs" aria-label="Anno di riferimento">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {yearOptions.map((year) => (
                  <SelectItem key={year} value={String(year)}>
                    {year}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {mode === 'ytd_analysis' && (
            <span className="text-xs text-muted-foreground">Da inizio anno a oggi</span>
          )}
          {mode === 'history_analysis' && (
            <span className="text-xs text-muted-foreground">Dall'anno di inizio cashflow</span>
          )}
        </div>
      )}

      {/* Textarea + send/stop button row */}
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
          placeholder={textareaPlaceholder}
          aria-label="Scrivi un messaggio all'assistente"
          disabled={isStreaming}
          rows={1}
          className={cn(
            'flex-1 resize-none rounded-xl border border-border bg-muted/30 px-4 py-3 text-sm text-foreground',
            'placeholder:text-muted-foreground',
            'focus:outline-none focus:ring-1 focus:ring-ring',
            'disabled:opacity-50',
            'min-h-[44px] max-h-[200px] overflow-y-auto',
            // Hide native scrollbar on WebKit/Chromium — scroll remains functional
            '[&::-webkit-scrollbar]:hidden [scrollbar-width:none]',
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

      {/* ── Chat mode context selector ─────────────────────────────────────────────
          In chat mode the user can optionally attach a period context (month/year/ytd/history).
          Mobile: horizontal chip strip. Desktop: Select with optional period picker. */}
      {mode === 'chat' && (
        <div className="mt-2">
          {/* Mobile chips — no negative-margin trick; chips scroll inside their container */}
          <div className="desktop:hidden">
            <div className="flex gap-1.5 overflow-x-auto pb-0.5" style={{ scrollbarWidth: 'none' }}>
              {CHAT_CONTEXT_CHIPS.map((chip) => (
                <button
                  key={chip.value}
                  type="button"
                  onClick={() => onChatContextTypeChange(chip.value)}
                  disabled={isStreaming}
                  className={cn(
                    'shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                    chatContextType === chip.value
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border text-muted-foreground hover:text-foreground disabled:opacity-50'
                  )}
                >
                  {chip.label}
                </button>
              ))}
            </div>
          </div>

          {/* Mobile period picker for the chat context */}
          {(chatContextType === 'month' || chatContextType === 'year') && (
            <div className="desktop:hidden mt-2 flex items-center gap-2">
              {chatContextType === 'month' && (
                <div className="w-auto min-w-[150px]">
                  <AssistantMonthPicker
                    value={selectedMonth}
                    options={monthOptions}
                    onChange={onMonthChange}
                    disabled={isStreaming}
                  />
                </div>
              )}
              {chatContextType === 'year' && (
                <Select
                  value={String(selectedYear)}
                  onValueChange={(v) => onYearChange(Number(v))}
                  disabled={isStreaming}
                >
                  <SelectTrigger className="h-8 w-auto min-w-[80px] text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {yearOptions.map((year) => (
                      <SelectItem key={year} value={String(year)}>
                        {year}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}

          {/* Desktop context selector row */}
          <div className="hidden desktop:flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">Contesto:</span>
            <Select
              value={chatContextType}
              onValueChange={(v) => onChatContextTypeChange(v as AssistantChatContextType)}
              disabled={isStreaming}
            >
              <SelectTrigger className="h-7 w-auto min-w-[120px] text-xs" aria-label="Tipo di contesto per la chat">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Nessuno</SelectItem>
                <SelectItem value="month">Mese</SelectItem>
                <SelectItem value="year">Anno</SelectItem>
                <SelectItem value="ytd">YTD</SelectItem>
                <SelectItem value="history">Storico totale</SelectItem>
              </SelectContent>
            </Select>

            {chatContextType === 'month' && (
              <div className="w-auto min-w-[150px]">
                <AssistantMonthPicker
                  value={selectedMonth}
                  options={monthOptions}
                  onChange={onMonthChange}
                  disabled={isStreaming}
                />
              </div>
            )}
            {chatContextType === 'year' && (
              <Select
                value={String(selectedYear)}
                onValueChange={(v) => onYearChange(Number(v))}
                disabled={isStreaming}
              >
                <SelectTrigger className="h-7 w-auto min-w-[80px] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {yearOptions.map((year) => (
                    <SelectItem key={year} value={String(year)}>
                      {year}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {chatContextType === 'ytd' && (
              <span className="text-xs text-muted-foreground">Da inizio anno</span>
            )}
            {chatContextType === 'history' && (
              <span className="text-xs text-muted-foreground">Dall'anno di inizio cashflow</span>
            )}
          </div>
        </div>
      )}

      {/* Error hint — shown on both mobile and desktop */}
      {errorHint && (
        <p className="mt-2 text-xs text-destructive">{errorHint}</p>
      )}

      {/* Keyboard hint — desktop only; wastes height on mobile where it's irrelevant */}
      {!errorHint && (
        <p className="hidden desktop:block mt-1.5 text-xs text-muted-foreground">
          {'Enter per inviare · Shift+Enter per andare a capo'}
        </p>
      )}
    </div>
  );
}
