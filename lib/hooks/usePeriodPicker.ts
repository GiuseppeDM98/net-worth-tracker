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
  isCurrentYtd,
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
  recentMonths: { year: number; month: number }[];
  // State predicate helpers (for active highlighting in preset list)
  isCurrentMonthActive: boolean;
  isPrevMonthActive: boolean;
  isCurrentYearActive: boolean;
  /** This year, January → today's month — distinct from the whole year above. */
  isCurrentYtdActive: boolean;
  // Handlers
  handlePreset: (period: Period) => void;
  handleRangeSelect: (range: DateRange | undefined) => void;
  handleApply: () => void;
  handleFromTextChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleToTextChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

// ─── Pure helpers used by the hook ───────────────────────────────────────────

/** A text input's raw value and the calendar range it belongs to. */
interface TextDraft {
  range: DateRange | undefined;
  text: string;
}

function formatDay(day: Date | undefined): string {
  return day ? format(day, 'dd/MM/yyyy') : '';
}

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
  const [open, setOpenState] = React.useState(false);

  const [calendarRange, setCalendarRange] = React.useState<DateRange | undefined>(() => {
    const r = periodToRange(value);
    return { from: r.from, to: r.to };
  });

  const [calendarMonth, setCalendarMonth] = React.useState<Date>(() => periodToRange(value).from);

  // What the user typed, stored WITH the range it was typed against: while the range is the
  // same the raw text stays (a half-typed date must not be reformatted under the cursor); as
  // soon as the range moves — a parsed date, a calendar click — the text is derived from it.
  // Derived, so no effect re-syncs it (react-hooks/set-state-in-effect).
  const [fromDraft, setFromDraft] = React.useState<TextDraft | null>(null);
  const [toDraft, setToDraft] = React.useState<TextDraft | null>(null);
  const fromText =
    fromDraft !== null && fromDraft.range === calendarRange
      ? fromDraft.text
      : formatDay(calendarRange?.from);
  const toText =
    toDraft !== null && toDraft.range === calendarRange ? toDraft.text : formatDay(calendarRange?.to);

  // The calendar syncs to the current period at the moment the picker opens — and only then,
  // so the parent's intermediate changes while it is closed are not tracked. Opening is an
  // event (`setOpen(true)` is the one way in), so the sync lives in the setter, not in an effect.
  const setOpen = (next: boolean) => {
    if (next) {
      const r = periodToRange(value);
      setCalendarRange({ from: r.from, to: r.to });
      setCalendarMonth(r.from);
    }
    setOpenState(next);
  };

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
    setFromDraft({ range: calendarRange, text: val });
    const parsed = parseDateInput(val);
    if (parsed) {
      setCalendarRange(prev => ({ from: parsed, to: prev?.to }));
      setCalendarMonth(startOfMonth(parsed));
    }
  };

  const handleToTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setToDraft({ range: calendarRange, text: val });
    const parsed = parseDateInput(val);
    // Do NOT fall back to `parsed` for `from` — if the user is typing the end
    // date before the start date, silently setting from=to produces a
    // confusing single-day range. Leave `from` undefined until the user sets it.
    if (parsed) setCalendarRange(prev => ({ from: prev?.from, to: parsed }));
  };

  const last3Years = React.useMemo(
    () => [...availableYears].sort((a, b) => b - a).slice(0, 3),
    [availableYears],
  );

  // The "Mesi" preset list skips the current and previous month — those already have
  // dedicated "Questo mese" / "Mese precedente" shortcuts — and lists the 6 months
  // before them, so older months (incl. January) stay reachable.
  // Computed once at hook initialisation — `new Date()` is stable enough for the
  // lifetime of the picker session (opened/closed within the same page view).
  const RECENT_MONTHS_OFFSET = 2;
  const RECENT_MONTHS_COUNT = 6;
  const [recentMonths] = React.useState(() =>
    Array.from({ length: RECENT_MONTHS_COUNT }, (_, i) => {
      const d = subMonths(new Date(), i + RECENT_MONTHS_OFFSET);
      return { year: d.getFullYear(), month: d.getMonth() + 1 };
    })
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
    recentMonths,
    isCurrentMonthActive: isCurrentMonth(value),
    isPrevMonthActive: isPrevMonth(value),
    isCurrentYearActive: isCurrentYear(value),
    isCurrentYtdActive: isCurrentYtd(value),
    handlePreset,
    handleRangeSelect,
    handleApply,
    handleFromTextChange,
    handleToTextChange,
  };
}
