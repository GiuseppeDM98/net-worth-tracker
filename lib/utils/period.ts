/**
 * Period type and pure date helpers shared across the app.
 * Consumed by usePeriodPicker hook and PeriodPicker component.
 */

import { format, startOfMonth, endOfMonth, startOfYear, endOfYear, subMonths, startOfDay, endOfDay } from 'date-fns';
import { it } from 'date-fns/locale';
import { MONTH_NAMES } from '@/lib/constants/months';
import { getItalyMonth, getItalyYear } from '@/lib/utils/dateHelpers';

// ─── Types ────────────────────────────────────────────────────────────────────

export type Period =
  | { kind: 'month'; year: number; month: number }
  | { kind: 'year'; year: number }
  /**
   * January → the end of `throughMonth`, inclusive. A distinct kind and not a custom range,
   * because it HAS an honest predecessor (the same months a year earlier) and a name of its
   * own; a custom range has neither.
   *
   * `throughMonth` is stored, never read off a clock: `periodToRange` stays pure and the
   * period is a fully-described value. The picker fills it from today when it builds one.
   */
  | { kind: 'ytd'; year: number; throughMonth: number }
  | { kind: 'custom'; from: Date; to: Date };

// ─── Constants ────────────────────────────────────────────────────────────────

export const MONTH_NAMES_SHORT = [
  'Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu',
  'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic',
] as const;

// ─── Public helpers ───────────────────────────────────────────────────────────

/** Human-readable label for a Period. */
export function periodLabel(period: Period): string {
  if (period.kind === 'month') return `${MONTH_NAMES[period.month - 1]} ${period.year}`;
  if (period.kind === 'year') return String(period.year);
  // «2026 · gen–ago» — never the bare year, which is the WHOLE year and a different period.
  if (period.kind === 'ytd') {
    return `${period.year} · ${MONTH_NAMES_SHORT[0].toLowerCase()}–${MONTH_NAMES_SHORT[period.throughMonth - 1].toLowerCase()}`;
  }
  const from = format(period.from, 'd MMM yyyy', { locale: it });
  const to = format(period.to, 'd MMM yyyy', { locale: it });
  return `${from} – ${to}`;
}

/** Convert a Period to a { from, to } date range used for Firestore/filtering. */
export function periodToRange(period: Period): { from: Date; to: Date } {
  if (period.kind === 'month') {
    const base = new Date(period.year, period.month - 1, 1);
    return { from: startOfMonth(base), to: endOfMonth(base) };
  }
  if (period.kind === 'year') {
    const base = new Date(period.year, 0, 1);
    return { from: startOfYear(base), to: endOfYear(base) };
  }
  if (period.kind === 'ytd') {
    return { from: startOfYear(new Date(period.year, 0, 1)), to: endOfMonth(new Date(period.year, period.throughMonth - 1, 1)) };
  }
  return { from: startOfDay(period.from), to: endOfDay(period.to) };
}

/** Default period: current calendar month. */
export function currentMonthPeriod(): Period {
  return { kind: 'month', year: getItalyYear(), month: getItalyMonth() };
}

/** January → the end of today's month, in the Italian calendar. */
export function currentYtdPeriod(): Period {
  return { kind: 'ytd', year: getItalyYear(), throughMonth: getItalyMonth() };
}

// ─── Internal helpers (used by usePeriodPicker) ───────────────────────────────

/** Check if a Period matches the current calendar month. */
export function isCurrentMonth(p: Period): boolean {
  if (p.kind !== 'month') return false;
  return p.year === getItalyYear() && p.month === getItalyMonth();
}

/** Check if a Period matches the previous calendar month. */
export function isPrevMonth(p: Period): boolean {
  if (p.kind !== 'month') return false;
  const prev = subMonths(new Date(), 1);
  return p.year === getItalyYear(prev) && p.month === getItalyMonth(prev);
}

/** Check if a Period matches the current calendar year — the WHOLE year, January to December. */
export function isCurrentYear(p: Period): boolean {
  if (p.kind !== 'year') return false;
  return p.year === getItalyYear();
}

/** Check if a Period is this year's year-to-date, up to today's month. */
export function isCurrentYtd(p: Period): boolean {
  if (p.kind !== 'ytd') return false;
  return p.year === getItalyYear() && p.throughMonth === getItalyMonth();
}

const DATE_RE = /^(\d{2})\/(\d{2})\/(\d{4})$/;

/** Parse a DD/MM/YYYY string into a Date, or null if invalid. */
export function parseDateInput(s: string): Date | null {
  const m = DATE_RE.exec(s);
  if (!m) return null;
  const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  if (Number.isNaN(d.getTime()) || d.getMonth() !== Number(m[2]) - 1) return null;
  return d;
}
