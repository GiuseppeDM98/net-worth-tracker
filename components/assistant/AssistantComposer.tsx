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
  mode: AssistantMode;
  onModeChange: (mode: AssistantMode) => void;
  selectedMonth: AssistantMonthSelectorValue;
  monthOptions: AssistantMonthSelectorValue[];
  onMonthChange: (month: AssistantMonthSelectorValue) => void;
  /** For year_analysis: the currently selected year */
  selectedYear: number;
  /** Available years for the year picker */
  yearOptions: number[];
  onYearChange: (year: number) => void;
  /** Context type for chat mode: determines which period bundle is passed to Claude. */
  chatContextType: AssistantChatContextType;
  onChatContextTypeChange: (type: AssistantChatContextType) => void;
  /** Error message shown inline above the submit button (e.g. no data for selected month). */
  errorHint?: string;
}

// Short labels for mobile chip strips — one word each to fit in a horizontal scroll row
const MODE_CHIPS: { value: AssistantMode; label: string }[] = [
  { value: 'month_analysis', label: 'Mese' },
  { value: 'year_analysis', label: 'Anno' },
  { value: 'ytd_analysis', label: 'YTD' },
  { value: 'history_analysis', label: 'Storico' },
  { value: 'chat', label: 'Chat' },
];

const CHAT_CONTEXT_CHIPS: { value: AssistantChatContextType; label: string }[] = [
  { value: 'none', label: 'Nessuno' },
  { value: 'month', label: 'Mese' },
  { value: 'year', label: 'Anno' },
  { value: 'ytd', label: 'YTD' },
  { value: 'history', label: 'Storico' },
];

/**
 * Fixed composer area for the assistant chat.
 * - Autosize textarea: grows up to max-h-[200px] then scrolls inside.
 * - Enter submits; Shift+Enter inserts a newline (standard chat convention).
 * - Mobile: horizontal scrollable chip strips for mode and chat context — avoids dropdown UX on touch.
 * - Desktop: retains the original Select dropdowns for a more information-dense layout.
 *
 * Period picker visibility by mode:
 *   month_analysis / chat → month picker
 *   year_analysis          → year picker
 *   ytd_analysis           → no picker (period is implicit: current year)
 *   history_analysis       → no picker (period is implicit: from settings)
 */
export function AssistantComposer({
  draft,
  onChange,
  onSubmit,
  onStop,
  isStreaming,
  canSubmit,
  mode,
  onModeChange,
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

  return (
    // safe-area-inset-bottom: on iOS the home indicator sits below the viewport; pb accounts for it.
    // The sticky wrapper in PageClient (bottom-20) already positions the composer above BottomNav,
    // so we don't need extra padding for the nav — only the iOS safe area needs a small top-up.
    <div className="border-t border-border bg-background px-4 pt-3 pb-3 [padding-bottom:calc(env(safe-area-inset-bottom,0px)+12px)] shadow-[0_-4px_16px_-2px_rgba(0,0,0,0.06)] dark:shadow-[0_-4px_16px_-2px_rgba(0,0,0,0.3)]">

      {/* ── MOBILE: horizontal scrollable mode chip strip ──────────────────────────
          Replaced the Select dropdown which was awkward on touch. Chips are larger
          tap targets and immediately visible — no tap-to-reveal interaction needed.
          Negative horizontal margin bleeds into the parent px-4 so chips reach the edge. */}
      <div className="desktop:hidden mb-2 -mx-4">
        <div className="flex gap-1.5 overflow-x-auto px-4 pb-0.5" style={{ scrollbarWidth: 'none' }}>
          {MODE_CHIPS.map((chip) => (
            <button
              key={chip.value}
              onClick={() => onModeChange(chip.value)}
              disabled={isStreaming}
              className={cn(
                'shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors',
                mode === chip.value
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border text-muted-foreground hover:text-foreground disabled:opacity-50'
              )}
            >
              {chip.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── MOBILE: period picker row — shown below chips when mode requires a period ── */}
      <div className="desktop:hidden mb-2 flex items-center gap-2 min-h-0">
        {mode === 'month_analysis' && (
          <div className="w-auto min-w-[150px]">
            <AssistantMonthPicker
              value={selectedMonth}
              options={monthOptions}
              onChange={onMonthChange}
              disabled={isStreaming}
            />
          </div>
        )}
        {mode === 'year_analysis' && (
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
        {/* chat mode period: shown in the chat context row below the textarea */}
      </div>

      {/* ── DESKTOP: mode selector + period picker (max 2 controls) ──────────────── */}
      <div className="hidden desktop:flex mb-3 flex-wrap items-center gap-2">
        <Select value={mode} onValueChange={(v) => onModeChange(v as AssistantMode)} disabled={isStreaming}>
          <SelectTrigger className="h-8 w-auto min-w-[160px] text-xs" aria-label="Modalità di analisi">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="month_analysis">
              <div className="flex flex-col gap-0.5">
                <span>Analisi mensile</span>
                <span className="text-xs text-muted-foreground font-normal">Patrimonio, cashflow e allocazione del mese</span>
              </div>
            </SelectItem>
            <SelectItem value="year_analysis">
              <div className="flex flex-col gap-0.5">
                <span>Analisi annuale</span>
                <span className="text-xs text-muted-foreground font-normal">Performance, dividendi e crescita dell'anno</span>
              </div>
            </SelectItem>
            <SelectItem value="ytd_analysis">
              <div className="flex flex-col gap-0.5">
                <span>YTD</span>
                <span className="text-xs text-muted-foreground font-normal">Rendimento e cashflow dall'1 gennaio a oggi</span>
              </div>
            </SelectItem>
            <SelectItem value="history_analysis">
              <div className="flex flex-col gap-0.5">
                <span>Storico totale</span>
                <span className="text-xs text-muted-foreground font-normal">Evoluzione del patrimonio da quando hai iniziato</span>
              </div>
            </SelectItem>
            <SelectItem value="chat">
              <div className="flex flex-col gap-0.5">
                <span>Chat libera</span>
                <span className="text-xs text-muted-foreground font-normal">Domanda libera, con o senza dati del portafoglio</span>
              </div>
            </SelectItem>
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
        {mode === 'year_analysis' && (
          <Select
            value={String(selectedYear)}
            onValueChange={(v) => onYearChange(Number(v))}
            disabled={isStreaming}
          >
            <SelectTrigger className="h-8 w-auto min-w-[100px] text-xs" aria-label="Anno di riferimento">
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
          Kept below the input so it doesn't compete with the mode row above.
          Mobile: horizontal chip strip. Desktop: Select with optional period picker. */}
      {mode === 'chat' && (
        <div className="mt-2">
          {/* Mobile chips */}
          <div className="desktop:hidden -mx-4">
            <div className="flex gap-1.5 overflow-x-auto px-4 pb-0.5" style={{ scrollbarWidth: 'none' }}>
              {CHAT_CONTEXT_CHIPS.map((chip) => (
                <button
                  key={chip.value}
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

          {/* Mobile: period picker for the chat context (month/year need a picker) */}
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

          {/* Desktop: original Select row */}
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
