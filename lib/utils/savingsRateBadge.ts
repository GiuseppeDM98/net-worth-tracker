/**
 * Savings-rate celebration badge — the pure decision layer.
 *
 * The badge ("Ottimo risparmio a Luglio!") celebrates LAST month's savings rate and must appear
 * once per month, on the first visit of that month. The show decision therefore keys on a
 * persisted record of the celebrated month (localStorage via `celebrationUtils`), never on a
 * per-session flag: a sessionStorage flag dies with every tab/window, which is exactly why the
 * badge used to come back on every login.
 *
 * Everything here takes `now` explicitly so the calendar rules are testable.
 */

import { getItalyDate } from '@/lib/utils/dateHelpers';
import { MONTH_NAMES } from '@/lib/constants/months';

/** Minimum savings rate (percent of income) that earns a celebration. */
export const SAVINGS_RATE_BADGE_THRESHOLD = 30;

/**
 * Before this day of the month the previous month's cashflow may still be incomplete (late
 * entries, pending transfers), so the rate is not trusted yet.
 */
const EARLIEST_DAY_OF_MONTH = 5;


export interface CelebratedMonth {
  year: number;
  /** 1-12 */
  month: number;
  /** Italian month name, capitalised, for the badge copy. */
  name: string;
}

/** Savings rate as a percentage of income; 0 when there is no income to measure against. */
export function computeSavingsRate(income: number, expenses: number): number {
  if (income <= 0) return 0;
  return ((income - expenses) / income) * 100;
}

/** The month being celebrated: the calendar month before `now`, in Italian wall-clock time. */
export function resolveCelebratedMonth(now: Date): CelebratedMonth {
  const italyNow = getItalyDate(now);
  const previous = new Date(italyNow.getFullYear(), italyNow.getMonth() - 1, 1);
  const month = previous.getMonth() + 1;
  return { year: previous.getFullYear(), month, name: MONTH_NAMES[month - 1] };
}

/**
 * The `celebrationUtils` key under which a month's celebration is recorded.
 *
 * Scoped to the account whose data is displayed: on a shared account the viewer can switch
 * owners, and each owner's month is its own celebration.
 */
export function buildSavingsBadgeCelebrationKey(
  ownerId: string,
  celebrated: Pick<CelebratedMonth, 'year' | 'month'>,
): string {
  return `savings_rate_${ownerId}_${celebrated.year}-${String(celebrated.month).padStart(2, '0')}`;
}

export interface SavingsBadgeDecisionInput {
  previousMonthIncome: number;
  savingsRate: number;
  now: Date;
  /** Whether this month's celebration is already recorded for this account. */
  alreadyCelebrated: boolean;
}

/**
 * All conditions must hold; the order mirrors the cheapest-first checks of the component.
 *
 * `prefers-reduced-motion` is deliberately NOT among them (removed 2026-09-01). It used to
 * suppress the badge outright, which meant a reader who asked the OS for stillness was never
 * told their savings rate — reduced motion must reduce the MOTION, not the content. The
 * preference now governs only the entrance transition, in the component.
 */
export function shouldShowSavingsBadge(input: SavingsBadgeDecisionInput): boolean {
  if (getItalyDate(input.now).getDate() < EARLIEST_DAY_OF_MONTH) return false;
  if (input.previousMonthIncome <= 0) return false;
  if (input.savingsRate < SAVINGS_RATE_BADGE_THRESHOLD) return false;
  return !input.alreadyCelebrated;
}
