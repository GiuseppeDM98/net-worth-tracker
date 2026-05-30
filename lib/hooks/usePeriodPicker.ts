'use client';

import * as React from 'react';
import { type DateRange } from 'react-day-picker';
import { format, startOfMonth, endOfMonth, startOfYear, endOfYear, subMonths, isSameDay, isSameMonth } from 'date-fns';
import { type Locale, it } from 'date-fns/locale';
import {
  type Period,
  periodToRange,
  periodLabel,
  isCurrentMonth,
  isPrevMonth,
  isCurrentYear,
  parseDateInput,
} from '@/lib/utils/period';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UsePeriodPickerOptions {
  value: Period;
  onChange: (period: Period) => void;
  availableYears?: number[];
}

export interface UsePeriodPickerReturn {
  open: boolean;
  setOpen: (open: boolean) => void;
  calendarRange: DateRange | undefined;
  calendarMonth: Date;
  setCalendarMonth: (month: Date) => void;
  fromText: string;
  toText: string;
  canApply: boolean;
  label: string;
  isCustom: boolean;
  rangeLabel: string;
  last3Years: number[];
  last5Months: { year: number; month: number }[];
  // State predicate helpers (for active highlighting in preset list)
  isCurrentMonthActive: boolean;
  isPrevMonthActive: boolean;
  isCurrentYearActive: boolean;
  // Handlers
  handlePreset: (period: Period) => void;
  handleRangeSelect: (range: DateRange | undefined) => void;
  handleApply: () => void;
  handleFromTextChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleToTextChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

// ─── Pure helpers used by the hook ───────────────────────────────────────────

function buildRangeLabel(range: { from?: Date; to?: Date } | undefined, locale: Locale): string {
  if (range?.from && range.to) {
    return `${format(range.from, 'd MMM', { locale })} – ${format(range.to, 'd MMM yyyy', { locale })}`;
  }
  if (range?.from) return format(range.from, 'd MMM yyyy', { locale });
  return 'Seleziona un intervallo';
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function usePeriodPicker({
  value,
  onChange,
  availableYears = [],
}: UsePeriodPickerOptions): UsePeriodPickerReturn {
  const [open, setOpen] = React.useState(false);

  const [calendarRange, setCalendarRange] = React.useState<DateRange | undefined>(() => {
    const r = periodToRange(value);
    return { from: r.from, to: r.to };
  });

  const [calendarMonth, setCalendarMonth] = React.useState<Date>(() => periodToRange(value).from);

  const [fromText, setFromText] = React.useState('');
  const [toText, setToText] = React.useState('');

  // Re-sync calendar state whenever the picker opens — intentionally excludes `value`
  // so an in-progress calendar selection is not reset when the parent re-renders.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  React.useEffect(() => {
    if (open) {
      const r = periodToRange(value);
      setCalendarRange({ from: r.from, to: r.to });
      setCalendarMonth(r.from);
    }
  }, [open]);

  // Keep text inputs in sync with calendar range
  React.useEffect(() => {
    setFromText(calendarRange?.from ? format(calendarRange.from, 'dd/MM/yyyy') : '');
    setToText(calendarRange?.to ? format(calendarRange.to, 'dd/MM/yyyy') : '');
  }, [calendarRange]);

  const handlePreset = (period: Period) => {
    onChange(period);
    setOpen(false);
  };

  const handleRangeSelect = (range: DateRange | undefined) => {
    setCalendarRange(range);
  };

  const handleApply = () => {
    if (!calendarRange?.from) return;
    const from = calendarRange.from;
    const to = calendarRange.to ?? from;
    // Detect if the range exactly matches a month or year, and normalise the kind.
    if (isSameDay(from, startOfMonth(from)) && isSameDay(to, endOfMonth(from)) && isSameMonth(from, to)) {
      onChange({ kind: 'month', year: from.getFullYear(), month: from.getMonth() + 1 });
    } else if (isSameDay(from, startOfYear(from)) && isSameDay(to, endOfYear(from)) && from.getFullYear() === to.getFullYear()) {
      onChange({ kind: 'year', year: from.getFullYear() });
    } else {
      onChange({ kind: 'custom', from, to });
    }
    setOpen(false);
  };

  const handleFromTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setFromText(val);
    const parsed = parseDateInput(val);
    if (parsed) {
      setCalendarRange(prev => ({ from: parsed, to: prev?.to }));
      setCalendarMonth(startOfMonth(parsed));
    }
  };

  const handleToTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setToText(val);
    const parsed = parseDateInput(val);
    if (parsed) setCalendarRange(prev => ({ from: prev?.from ?? parsed, to: parsed }));
  };

  const last3Years = React.useMemo(
    () => [...availableYears].sort((a, b) => b - a).slice(0, 3),
    [availableYears],
  );

  const last5Months = React.useMemo(
    () => Array.from({ length: 5 }, (_, i) => {
      const d = subMonths(new Date(), i);
      return { year: d.getFullYear(), month: d.getMonth() + 1 };
    }),
    [],
  );

  const label = periodLabel(value);

  const rangeLabel = buildRangeLabel(calendarRange, it);

  return {
    open,
    setOpen,
    calendarRange,
    calendarMonth,
    setCalendarMonth,
    fromText,
    toText,
    canApply: !!calendarRange?.from,
    label,
    isCustom: value.kind === 'custom',
    rangeLabel,
    last3Years,
    last5Months,
    isCurrentMonthActive: isCurrentMonth(value),
    isPrevMonthActive: isPrevMonth(value),
    isCurrentYearActive: isCurrentYear(value),
    handlePreset,
    handleRangeSelect,
    handleApply,
    handleFromTextChange,
    handleToTextChange,
  };
}

// Re-export so consumers can import everything from the hook file if needed
export type { Period } from '@/lib/utils/period';
export { currentMonthPeriod, MONTH_NAMES_SHORT } from '@/lib/utils/period';
