/**
 * Period type and pure date helpers shared across the app.
 * Consumed by usePeriodPicker hook and PeriodPicker component.
 */

import { format, startOfMonth, endOfMonth, startOfYear, endOfYear, subMonths, startOfDay, endOfDay } from 'date-fns';
import { it } from 'date-fns/locale';
import { MONTH_NAMES } from '@/lib/constants/months';

// ─── Types ────────────────────────────────────────────────────────────────────

export type Period =
  | { kind: 'month'; year: number; month: number }
  | { kind: 'year'; year: number }
  | { kind: 'custom'; from: Date; to: Date };

// ─── Constants ────────────────────────────────────────────────────────────────

export const MONTH_NAMES_SHORT = [
  'Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu',
  'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic',
] as const;

// Re-export canonical month names (single source of truth in lib/constants/months.ts).
export { MONTH_NAMES };

// ─── Public helpers ───────────────────────────────────────────────────────────

/** Human-readable label for a Period. */
export function periodLabel(period: Period): string {
  if (period.kind === 'month') return `${MONTH_NAMES[period.month - 1]} ${period.year}`;
  if (period.kind === 'year') return String(period.year);
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
  return { from: startOfDay(period.from), to: endOfDay(period.to) };
}

/** Default period: current calendar month. */
export function currentMonthPeriod(): Period {
  const now = new Date();
  return { kind: 'month', year: now.getFullYear(), month: now.getMonth() + 1 };
}

// ─── Internal helpers (used by usePeriodPicker) ───────────────────────────────

/** Check if a Period matches the current calendar month. */
export function isCurrentMonth(p: Period): boolean {
  if (p.kind !== 'month') return false;
  const now = new Date();
  return p.year === now.getFullYear() && p.month === now.getMonth() + 1;
}

/** Check if a Period matches the previous calendar month. */
export function isPrevMonth(p: Period): boolean {
  if (p.kind !== 'month') return false;
  const prev = subMonths(new Date(), 1);
  return p.year === prev.getFullYear() && p.month === prev.getMonth() + 1;
}

/** Check if a Period matches the current calendar year. */
export function isCurrentYear(p: Period): boolean {
  if (p.kind !== 'year') return false;
  return p.year === new Date().getFullYear();
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
