'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { MONTH_NAMES } from '@/lib/constants/months';
import type { PeriodMode } from '@/lib/utils/analisiSummary';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SegmentedPill } from '@/components/ui/segmented-pill';
import { cn } from '@/lib/utils';

interface AnalisiPeriodControlsProps {
  periodMode: PeriodMode;
  selectedYear: number | null;
  selectedMonth: number | null;
  /** Past years with data, newest first — the «Anno» picker never offers the current year. */
  pastYears: number[];
  onModeChange: (mode: PeriodMode) => void;
  onYearChange: (year: number) => void;
  onMonthChange: (month: number | null) => void;
  className?: string;
}

const MODE_OPTIONS = [
  // «Da inizio anno» stops at today's month; «Anno corrente» is January → December and carries
  // what is only scheduled. Same words as the Cashflow picker, for the same two windows.
  { value: 'ytd' as const, label: 'Da inizio anno' },
  { value: 'current' as const, label: 'Anno corrente' },
  { value: 'year' as const, label: 'Anno' },
  { value: 'history' as const, label: 'Storico' },
];

/**
 * The page's ONE axis — the four-mode pill (Da inizio anno | Anno corrente | Anno | Storico) with the month
 * picker (and the year picker in «Anno») beside it. Deep-linked as `?period&year&month` by the
 * tab; rendered beside the verdict from `desktop:` and under it below. «Ripristina» clears the
 * month only: the mode and the year are the axis, not a filter.
 */
export function AnalisiPeriodControls({
  periodMode,
  selectedYear,
  selectedMonth,
  pastYears,
  onModeChange,
  onYearChange,
  onMonthChange,
  className,
}: AnalisiPeriodControlsProps) {
  const monthSelect = (
    <Select value={selectedMonth?.toString() ?? '__all__'} onValueChange={(value) => onMonthChange(value === '__all__' ? null : parseInt(value, 10))} disabled={periodMode === 'year' && selectedYear === null}>
      <SelectTrigger className="h-9 w-full sm:w-[150px]" aria-label="Mese">
        <SelectValue placeholder="Tutto l'anno" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__all__">Tutto l&apos;anno</SelectItem>
        {MONTH_NAMES.map((month, index) => (
          <SelectItem key={index + 1} value={(index + 1).toString()}>
            {month}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  return (
    <div className={cn('flex flex-wrap items-center justify-center gap-2 desktop:justify-end', className)}>
      <SegmentedPill ariaLabel="Periodo di analisi" layoutId="analisi-period-pill" value={periodMode} onChange={onModeChange} options={MODE_OPTIONS} />
      <AnimatePresence mode="wait">
        {periodMode !== 'history' && (
          <motion.div
            key={`picker-${periodMode}`}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="flex flex-wrap items-center justify-center gap-2"
          >
            {periodMode === 'year' && (
              <Select value={selectedYear?.toString() ?? pastYears[0]?.toString()} onValueChange={(value) => onYearChange(parseInt(value, 10))}>
                <SelectTrigger className="h-9 w-[110px] font-mono tabular-nums" aria-label="Anno">
                  <SelectValue placeholder="Anno" />
                </SelectTrigger>
                <SelectContent>
                  {pastYears.map((year) => (
                    <SelectItem key={year} value={year.toString()} className="font-mono tabular-nums">
                      {year}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {monthSelect}
            {selectedMonth !== null && (
              <Button variant="ghost" size="sm" onClick={() => onMonthChange(null)} className="h-9 whitespace-nowrap text-muted-foreground hover:text-foreground">
                Ripristina
              </Button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
