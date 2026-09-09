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
 * The page's ONE axis, beside the verdict from `desktop:` and under it below. A custom range is
 * never a slot of the pill — it would look disabled until active (AGENTS.md → Hierarchy) — so
 * while one is active no tab is selected and `CustomPeriodChip` names it under the verdict.
 */
export function PerformancePeriodPicker({ value, onChange, className }: PerformancePeriodPickerProps) {
  const isCustom = value === 'CUSTOM';
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {/* A custom range has no tab in the tablist, so screen readers get the state from a live region. */}
      <div role="status" aria-live="polite" className="sr-only">
        {isCustom ? 'Periodo personalizzato attivo' : `Periodo ${OPTIONS.find((o) => o.value === value)?.label ?? value} selezionato`}
      </div>
      <SegmentedPill
        options={OPTIONS}
        value={(isCustom ? '' : value) as PickerPeriod}
        onChange={onChange}
        layoutId="performance-period"
        ariaLabel="Periodo di misura"
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
    <div className="flex items-center gap-2 rounded-full border border-border bg-muted/40 py-1.5 pl-3 pr-1.5 text-xs font-medium text-foreground w-fit">
      <CalendarDays className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
      <span className="font-mono tabular-nums">
        {startDate.toLocaleDateString('it-IT')} – {endDate.toLocaleDateString('it-IT')}
      </span>
      <button
        type="button"
        aria-label="Rimuovi periodo personalizzato"
        onClick={onClear}
        className="flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <X className="h-3 w-3" aria-hidden="true" />
      </button>
    </div>
  );
}
