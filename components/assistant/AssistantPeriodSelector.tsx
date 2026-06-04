'use client';

import { motion } from 'framer-motion';
import { AssistantMonthPicker } from '@/components/assistant/AssistantMonthPicker';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AssistantChatContextType, AssistantMode, AssistantMonthSelectorValue } from '@/types/assistant';
import { cn } from '@/lib/utils';

interface AssistantPeriodSelectorProps {
  mode: AssistantMode;
  onModeChange: (mode: AssistantMode) => void;
  selectedMonth: AssistantMonthSelectorValue;
  monthOptions: AssistantMonthSelectorValue[];
  onMonthChange: (month: AssistantMonthSelectorValue) => void;
  selectedYear: number;
  yearOptions: number[];
  onYearChange: (year: number) => void;
  /** Optional period context attached to a free (Libera) question. */
  chatContextType: AssistantChatContextType;
  onChatContextTypeChange: (type: AssistantChatContextType) => void;
  /** Disabled while a response is streaming so context cannot change mid-answer. */
  disabled?: boolean;
}

// One axis, one place. The five tabs are periods — "Libera" is the former Chat
// mode, i.e. a question with no period attached by default. The previous design
// split this across a mode strip (top) and a chat-context strip (composer),
// encoding "which period" twice; collapsing both into this single control is the
// core of the rethink. Mode values stay on the backend contract unchanged.
const PERIOD_TABS: { value: AssistantMode; label: string }[] = [
  { value: 'month_analysis', label: 'Mese' },
  { value: 'year_analysis', label: 'Anno' },
  { value: 'ytd_analysis', label: 'YTD' },
  { value: 'history_analysis', label: 'Storico' },
  { value: 'chat', label: 'Libera' },
];

// In Libera mode the user can optionally attach a period as context, so a free
// question can still be grounded in real numbers. It lives here, next to the
// period axis — not as a separate strip in the composer.
const CHAT_CONTEXT_OPTIONS: { value: AssistantChatContextType; label: string }[] = [
  { value: 'none', label: 'Nessuno' },
  { value: 'month', label: 'Mese' },
  { value: 'year', label: 'Anno' },
  { value: 'ytd', label: 'YTD' },
  { value: 'history', label: 'Storico' },
];

/**
 * Single period axis for the assistant: segmented control + the matching period
 * sub-picker, co-located so "what to analyse" and "for which period" are one
 * decision in one spot (the old layout placed them at opposite ends of the column).
 *
 * In Libera mode the sub-picker becomes an optional "Contesto" selector that can
 * attach a period to an otherwise free-form question.
 */
export function AssistantPeriodSelector({
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
  disabled,
}: AssistantPeriodSelectorProps) {
  // Year picker reused by both year_analysis and Libera+year context.
  const yearPicker = (
    <Select value={String(selectedYear)} onValueChange={(v) => onYearChange(Number(v))} disabled={disabled}>
      <SelectTrigger className="h-9 w-auto min-w-[100px]" aria-label="Anno di riferimento">
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
  );

  const monthPicker = (
    <div className="w-auto min-w-[160px]">
      <AssistantMonthPicker value={selectedMonth} options={monthOptions} onChange={onMonthChange} disabled={disabled} />
    </div>
  );

  return (
    <div className="flex flex-col gap-3 desktop:flex-row desktop:items-center desktop:justify-between">
      {/* Segmented period control — animated pill marks the active period. */}
      <div
        role="tablist"
        aria-label="Periodo di analisi"
        className="flex items-center gap-1 overflow-x-auto"
        style={{ scrollbarWidth: 'none' }}
      >
        {PERIOD_TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={mode === tab.value}
            onClick={() => !disabled && onModeChange(tab.value)}
            disabled={disabled}
            className={cn(
              'relative shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition-colors disabled:opacity-50',
              'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
              mode === tab.value ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {mode === tab.value && (
              <motion.span
                layoutId="assistant-mode-pill"
                className="absolute inset-0 rounded-full bg-secondary"
                transition={{ type: 'spring', stiffness: 400, damping: 35 }}
              />
            )}
            <span className="relative">{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Inline sub-picker — its shape follows the active period. */}
      <div className="flex min-h-[2rem] flex-wrap items-center gap-2">
        {mode === 'month_analysis' && monthPicker}
        {mode === 'year_analysis' && yearPicker}
        {mode === 'ytd_analysis' && <span className="text-xs text-muted-foreground">Da inizio anno a oggi</span>}
        {mode === 'history_analysis' && (
          <span className="text-xs text-muted-foreground">Dall&apos;inizio del tracciamento</span>
        )}
        {mode === 'chat' && (
          <>
            <span className="text-xs text-muted-foreground">Contesto:</span>
            <Select
              value={chatContextType}
              onValueChange={(v) => onChatContextTypeChange(v as AssistantChatContextType)}
              disabled={disabled}
            >
              <SelectTrigger className="h-9 w-auto min-w-[120px]" aria-label="Contesto per la domanda libera">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CHAT_CONTEXT_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {chatContextType === 'month' && monthPicker}
            {chatContextType === 'year' && yearPicker}
            {chatContextType === 'ytd' && <span className="text-xs text-muted-foreground">Da inizio anno</span>}
            {chatContextType === 'history' && (
              <span className="text-xs text-muted-foreground">Dall&apos;inizio del tracciamento</span>
            )}
          </>
        )}
      </div>
    </div>
  );
}
