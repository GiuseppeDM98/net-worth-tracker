/**
 * planMonths — the month arithmetic and the long month label of an accumulation plan.
 *
 * A module of its own (2026-11-12) so the Allocazione page's first load, which reads the active plan
 * for the Piano's note, never pulls the plan's engine (`accumulationPlanUtils.ts`) nor its words
 * (`accumulationNarrative.ts`): both re-export what lives here. Imports only `dateHelpers`.
 */
import type { AccumulationPlan, MonthKey } from '@/types/accumulationPlan';
import { getItalyMonthYear } from './dateHelpers';

/** 'YYYY-MM' in Italy time. */
export function toMonthKey(date: Date): MonthKey {
  const { year, month } = getItalyMonthYear(date);
  return `${year}-${String(month).padStart(2, '0')}`;
}

/** Add `n` months to a MonthKey (n may be negative or zero); handles year rollover. */
export function addMonths(month: MonthKey, n: number): MonthKey {
  const [yearStr, monthStr] = month.split('-');
  const zeroBased = Number(monthStr) - 1 + n;
  const year = Number(yearStr) + Math.floor(zeroBased / 12);
  const newMonth = ((zeroBased % 12) + 12) % 12 + 1;
  return `${year}-${String(newMonth).padStart(2, '0')}`;
}

/** 1..N inside the plan, 0 before startMonth, N+1 after the last month. */
export function monthIndexOf(
  plan: Pick<AccumulationPlan, 'startMonth' | 'months'>,
  month: MonthKey
): number {
  const toOrdinal = (key: MonthKey): number => {
    const [y, m] = key.split('-').map(Number);
    return y * 12 + (m - 1);
  };
  const diff = toOrdinal(month) - toOrdinal(plan.startMonth);
  const index = diff + 1;
  if (index < 1) return 0;
  if (index > plan.months) return plan.months + 1;
  return index;
}

const MONTH_NAMES_LONG = [
  'gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno',
  'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre',
];

/** The year and the zero-based month of a MonthKey. */
export function parseMonthKey(month: MonthKey): { year: number; monthIndex: number } {
  const [yearStr, monthStr] = month.split('-');
  return { year: Number(yearStr), monthIndex: Number(monthStr) - 1 };
}

/** «ottobre 2026» (or «ottobre» with `withYear: false`) — the prose/reading register. */
export function monthLabelLong(month: MonthKey, withYear = true): string {
  const { year, monthIndex } = parseMonthKey(month);
  const name = MONTH_NAMES_LONG[monthIndex] ?? month;
  return withYear ? `${name} ${year}` : name;
}
