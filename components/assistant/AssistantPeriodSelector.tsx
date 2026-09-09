'use client';

import { AssistantMonthPicker } from '@/components/assistant/AssistantMonthPicker';
import { SegmentedPill } from '@/components/ui/segmented-pill';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AssistantChatContextType, AssistantMode, AssistantMonthSelectorValue } from '@/types/assistant';

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
// mode, i.e. a question with no period attached by default. Mode values stay on
// the backend contract unchanged; only the control is the shared SegmentedPill.
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

/** The sub-picker's trigger: 36px beside the verdict from desktop, a 44px target below it. */
const TRIGGER_CLASS = 'h-11 w-auto min-w-[120px] desktop:h-9';

/**
 * The page's one axis — the period (SegmentedPill) and its sub-picker, co-located so «what to
 * analyse» and «for which period» are one decision in one spot. It sits beside the verdict from
 * `desktop:` and under it below that width (DESIGN.md → Page Verdict): the verdict, the tiles
 * and the composer all read this selection.
 *
 * In Libera mode the sub-picker becomes an optional «Contesto» selector that can attach a
 * period to an otherwise free-form question.
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
      <SelectTrigger className={TRIGGER_CLASS} aria-label="Anno di riferimento">
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
    <div className="w-auto min-w-[160px] [&_button]:h-11 desktop:[&_button]:h-9">
      <AssistantMonthPicker value={selectedMonth} options={monthOptions} onChange={onMonthChange} disabled={disabled} />
    </div>
  );

  return (
    <div className="flex flex-col gap-3 desktop:flex-row desktop:flex-wrap desktop:items-center desktop:justify-end">
      {/* Scroll guard: five pills fit at 390px, but a wider system font must not
          push the page into horizontal scroll — the strip scrolls on its own, bleeding
          to the page padding so the scroll reaches the edge. */}
      <div className="max-w-full overflow-x-auto max-desktop:-mx-4 max-desktop:px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <SegmentedPill
          options={PERIOD_TABS}
          value={mode}
          onChange={onModeChange}
          layoutId="assistant-period-pill"
          ariaLabel="Periodo di analisi"
          disabled={disabled}
          className="max-desktop:[&>button]:min-h-11"
        />
      </div>

      {/* Inline sub-picker — its shape follows the active period. */}
      <div className="flex flex-wrap items-center gap-2">
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
              <SelectTrigger className={TRIGGER_CLASS} aria-label="Contesto per la domanda libera">
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
