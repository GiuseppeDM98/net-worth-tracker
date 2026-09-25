'use client';

import { CalendarDays, X } from 'lucide-react';
import type { TimePeriod } from '@/types/performance';
import { SegmentedPill } from '@/components/ui/segmented-pill';
import { cn } from '@/lib/utils';

export type PickerPeriod = Extract<TimePeriod, 'YTD' | '1Y' | '3Y' | '5Y' | 'ALL'>;

const OPTIONS: ReadonlyArray<{ value: PickerPeriod; label: string }> = [
  { value: 'YTD', label: 'YTD' },
  { value: '1Y', label: '1 anno' },
  { value: '3Y', label: '3 anni' },
  { value: '5Y', label: '5 anni' },
  { value: 'ALL', label: 'Storico' },
];

interface PerformancePeriodPickerProps {
  value: TimePeriod;
  onChange: (period: PickerPeriod) => void;
  className?: string;
}

/**
 * Below `desktop:` five options share 358px: 44px tall for a thumb, one line each (`1 anno`
 * wrapped to two and the pill grew to 60px, measured at 390 on 2026-09-20), the side padding a
 * step tighter so the five fit; whatever a wider system font adds scrolls inside the pill.
 */
const OPTION_CLASS = 'min-h-11 whitespace-nowrap max-desktop:px-2 desktop:min-h-0';

/**
 * The page's ONE axis, beside the verdict from `desktop:` and under it below. A custom range is
 * never a slot of the pill — it would look disabled until active (AGENTS.md → Hierarchy) — so
 * while one is active no option is checked and `CustomPeriodChip` names it under the verdict.
 *
 * A radiogroup, not a tablist (2026-09-20): the pill picks a VALUE the whole page reads and no
 * tabpanel exists for a tab to control (AGENTS.md → Accessibility).
 */
export function PerformancePeriodPicker({ value, onChange, className }: PerformancePeriodPickerProps) {
  const isCustom = value === 'CUSTOM';
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {/* A custom range has no radio in the group, so screen readers get that one state from a
          live region. A preset needs no sentence: the checked radio already says it, and a second
          voice would speak over it on every arrow key. */}
      <div role="status" aria-live="polite" className="sr-only">
        {isCustom ? 'Periodo personalizzato attivo' : ''}
      </div>
      <SegmentedPill
        options={OPTIONS}
        value={(isCustom ? '' : value) as PickerPeriod}
        onChange={onChange}
        layoutId="performance-period"
        ariaLabel="Periodo di misura"
        semantics="radio"
        optionClassName={OPTION_CLASS}
        className="w-full justify-between desktop:w-auto [&>button]:flex-1 desktop:[&>button]:flex-none"
      />
    </div>
  );
}

interface CustomPeriodChipProps {
  startDate: Date;
  endDate: Date;
  onClear: () => void;
}

/** The active custom range, as a chip with its own «remove» — visible only while it is active. */
export function CustomPeriodChip({ startDate, endDate, onClear }: CustomPeriodChipProps) {
  return (
    // No padding on the button's side: the «×» target IS the chip's height — 44px on touch, 32px
    // from `desktop:` (it was a 24px circle until 2026-09-20) — and the 12px glyph stays as it was.
    <div className="flex w-fit items-center gap-2 rounded-full border border-border bg-muted/40 pl-3 text-xs font-medium text-foreground">
      <CalendarDays className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
      <span className="font-mono tabular-nums">
        {startDate.toLocaleDateString('it-IT')} – {endDate.toLocaleDateString('it-IT')}
      </span>
      <button
        type="button"
        aria-label="Rimuovi periodo personalizzato"
        onClick={onClear}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted-foreground motion-safe:transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring desktop:h-8 desktop:w-8"
      >
        <X className="h-3 w-3" aria-hidden="true" />
      </button>
    </div>
  );
}
