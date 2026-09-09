/**
 * Pure record-building and ranking layer for the Hall of Fame.
 *
 * Decoupled from Firestore so the same logic powers both the in-app Hall of Fame
 * (lib/services/hallOfFameService.server.ts) and the periodic email mentions
 * (lib/server/monthlyEmailService.ts) — one definition, zero app↔email drift.
 *
 * The caller passes already-normalised snapshots (createdAt/date as Date) and
 * expenses; these functions never touch I/O.
 *
 * Sign convention (types/expenses.ts): income positive, expenses negative — the
 * income/expense aggregates here mirror calculateTotalIncome/calculateTotalExpenses.
 */

import { MonthlySnapshot } from '@/types/assets';
import { HallOfFameData, HallOfFameStats, MonthlyRecord, YearlyRecord } from '@/types/hall-of-fame';
import { Expense } from '@/types/expenses';
import { calculateTotalIncome, calculateTotalExpenses } from '@/lib/services/expenseService';
import { getItalyMonthYear, getItalyYear, toDate } from '@/lib/utils/dateHelpers';

/** Format month and year as "MM/YYYY" for display. */
function formatMonthYear(month: number, year: number): string {
  return `${month.toString().padStart(2, '0')}/${year}`;
}

/**
 * Build per-month records from all snapshots.
 *
 * netWorthDiff is the delta between each snapshot and its chronological predecessor,
 * so the first snapshot produces no record (no baseline to compare against).
 */
export function calculateMonthlyRecords(
  snapshots: MonthlySnapshot[],
  expenses: Expense[],
): MonthlyRecord[] {
  // Oldest first so each record compares against the previous month.
  const sortedSnapshots = [...snapshots].sort((a, b) => {
    if (a.year !== b.year) return a.year - b.year;
    return a.month - b.month;
  });

  const monthlyRecords: MonthlyRecord[] = [];

  for (let i = 1; i < sortedSnapshots.length; i++) {
    const current = sortedSnapshots[i];
    const previous = sortedSnapshots[i - 1];

    const netWorthDiff = current.totalNetWorth - previous.totalNetWorth;
    const previousNetWorth = previous.totalNetWorth;

    const monthExpenses = expenses.filter((expense) => {
      const { month, year } = getItalyMonthYear(toDate(expense.date));
      return year === current.year && month === current.month;
    });

    const totalIncome = calculateTotalIncome(monthExpenses);
    const totalExpenses = Math.abs(calculateTotalExpenses(monthExpenses));

    monthlyRecords.push({
      year: current.year,
      month: current.month,
      monthYear: formatMonthYear(current.month, current.year),
      netWorthDiff,
      previousNetWorth,
      totalIncome,
      totalExpenses,
    });
  }

  return monthlyRecords;
}

/**
 * Build per-year records from all snapshots.
 *
 * netWorthDiff uses December of the previous year as baseline (so January is in
 * the delta), falling back to the first snapshot of the year when no prior December
 * exists. Expenses are aggregated over the whole calendar year.
 */
export function calculateYearlyRecords(
  snapshots: MonthlySnapshot[],
  expenses: Expense[],
): YearlyRecord[] {
  const snapshotsByYear = snapshots.reduce((acc, snapshot) => {
    if (!acc[snapshot.year]) acc[snapshot.year] = [];
    acc[snapshot.year].push(snapshot);
    return acc;
  }, {} as Record<number, MonthlySnapshot[]>);

  const expensesByYear = expenses.reduce((acc, expense) => {
    const year = getItalyYear(toDate(expense.date));
    if (!acc[year]) acc[year] = [];
    acc[year].push(expense);
    return acc;
  }, {} as Record<number, Expense[]>);

  const yearlyRecords: YearlyRecord[] = [];
  const years = new Set<number>([
    ...Object.keys(snapshotsByYear).map(Number),
    ...Object.keys(expensesByYear).map(Number),
  ]);

  for (const year of Array.from(years).sort((a, b) => a - b)) {
    const yearSnapshots = snapshotsByYear[year] ?? [];
    const sorted = [...yearSnapshots].sort((a, b) => a.month - b.month);
    const lastSnapshot = sorted[sorted.length - 1];

    // December of the previous year as baseline so January is included in the delta.
    const prevSorted = [...(snapshotsByYear[year - 1] ?? [])].sort((a, b) => a.month - b.month);
    const baselineSnapshot = prevSorted.at(-1) ?? sorted[0];

    const hasNetWorthData = !!(lastSnapshot && baselineSnapshot);
    const netWorthDiff = hasNetWorthData ? lastSnapshot.totalNetWorth - baselineSnapshot.totalNetWorth : 0;
    const startOfYearNetWorth = baselineSnapshot?.totalNetWorth ?? 0;
    const yearExpenses = expensesByYear[year] ?? [];
    const totalIncome = calculateTotalIncome(yearExpenses);
    const totalExpenses = Math.abs(calculateTotalExpenses(yearExpenses));

    yearlyRecords.push({
      year,
      netWorthDiff,
      startOfYearNetWorth,
      totalIncome,
      totalExpenses,
    });
  }

  return yearlyRecords;
}

/** Where a target period lands in the net-worth-growth (or decline) ranking. */
export interface PeriodGrowthRank {
  /** 1-based position within the trend's ranking. */
  rank: number;
  /** Total number of periods sharing the same trend (the ranking size). */
  total: number;
  /** 'growth' when netWorthDiff > 0, 'decline' when < 0. */
  trend: 'growth' | 'decline';
}

/** Identifies a target period: month is omitted for yearly ranking. */
export interface PeriodTarget {
  year: number;
  month?: number;
}

/**
 * Rank a target period by net-worth change against all records of the same kind,
 * mirroring the in-app Hall of Fame definitions exactly:
 *  - growth (netWorthDiff > 0): position among positive periods, sorted desc — like
 *    bestMonthsByNetWorthGrowth / bestYearsByNetWorthGrowth.
 *  - decline (netWorthDiff < 0): position among negative periods, sorted asc (most
 *    negative first) — like worst*ByNetWorthDecline.
 *
 * @param records  Monthly or yearly records (each carrying year, optional month, netWorthDiff).
 * @param target   The period to locate. Pass `month` for monthly, omit it for yearly.
 * @returns The rank, or null when the period has no record (e.g. first month/year with
 *          no baseline) or its netWorthDiff is exactly 0 (excluded from both rankings).
 */
export function rankPeriodByNetWorthGrowth(
  records: Array<{ year: number; month?: number; netWorthDiff: number }>,
  target: PeriodTarget,
): PeriodGrowthRank | null {
  const matches = (r: { year: number; month?: number }) =>
    r.year === target.year && (target.month === undefined || r.month === target.month);

  const targetRecord = records.find(matches);
  if (!targetRecord || targetRecord.netWorthDiff === 0) return null;

  const trend: 'growth' | 'decline' = targetRecord.netWorthDiff > 0 ? 'growth' : 'decline';

  // Build the same filtered+ordered list the in-app rankings use.
  const ranked =
    trend === 'growth'
      ? records.filter((r) => r.netWorthDiff > 0).sort((a, b) => b.netWorthDiff - a.netWorthDiff)
      : records.filter((r) => r.netWorthDiff < 0).sort((a, b) => a.netWorthDiff - b.netWorthDiff);

  const index = ranked.findIndex(matches);
  if (index === -1) return null;

  return { rank: index + 1, total: ranked.length, trend };
}

// ─── Savings records ──────────────────────────────────────────────────────────

/** What a period kept: income minus expenses. Both aggregates are already absolute. */
export function periodSavings(record: { totalIncome: number; totalExpenses: number }): number {
  return record.totalIncome - record.totalExpenses;
}

/**
 * Periods ranked by what they kept, best first.
 *
 * Only periods WITH income enter the ranking. Without that guard the winner would
 * systematically be the month with the least DATA — an untracked month has zero income and
 * zero expenses, so it saves exactly as much as a month that earned nothing, and it would
 * outrank every real month that actually spent something.
 *
 * @param records Monthly or yearly records; never mutated.
 * @param limit   How many positions to keep.
 */
export function rankBySavings<T extends { totalIncome: number; totalExpenses: number }>(
  records: T[],
  limit: number,
): T[] {
  return [...records]
    .filter((record) => record.totalIncome > 0)
    .sort((a, b) => periodSavings(b) - periodSavings(a))
    .slice(0, limit);
}

// ─── Stats ────────────────────────────────────────────────────────────────────

/**
 * The figures that surround the rankings: how much history they were drawn from, and the
 * average monthly flows.
 *
 * They are stored alongside the rankings because they cannot be recovered from them: the
 * document keeps only the top slices, so «the month with the most income is 62% above your
 * average» has no denominator without this. Averages are over EVERY month with a record,
 * including the untracked ones — the count is what the page says it is.
 */
export function summarizeRecordStats(
  monthlyRecords: MonthlyRecord[],
  yearlyRecords: YearlyRecord[],
): HallOfFameStats {
  const monthCount = monthlyRecords.length;
  const sorted = [...monthlyRecords].sort((a, b) => (a.year !== b.year ? a.year - b.year : a.month - b.month));
  const totalIncome = monthlyRecords.reduce((sum, record) => sum + record.totalIncome, 0);
  const totalExpenses = monthlyRecords.reduce((sum, record) => sum + record.totalExpenses, 0);

  return {
    monthCount,
    yearCount: yearlyRecords.length,
    averageMonthlyIncome: monthCount > 0 ? totalIncome / monthCount : 0,
    averageMonthlyExpenses: monthCount > 0 ? totalExpenses / monthCount : 0,
    firstMonth: sorted[0] ? { year: sorted[0].year, month: sorted[0].month } : null,
    lastMonth: sorted.at(-1) ? { year: sorted.at(-1)!.year, month: sorted.at(-1)!.month } : null,
  };
}

// ─── Rankings ─────────────────────────────────────────────────────────────────

/** Positions kept per monthly ranking — enough to read a history month by month. */
export const MAX_MONTHLY_RECORDS = 20;
/** Positions kept per yearly ranking — fewer, because a year is a rarer event. */
export const MAX_YEARLY_RECORDS = 10;

/** Every ranking of the stored document, plus the figures that surround them. */
export type HallOfFameRankings = Pick<
  HallOfFameData,
  | 'bestMonthsByNetWorthGrowth'
  | 'bestMonthsByIncome'
  | 'worstMonthsByNetWorthDecline'
  | 'worstMonthsByExpenses'
  | 'bestMonthsBySavings'
  | 'bestYearsByNetWorthGrowth'
  | 'bestYearsByIncome'
  | 'worstYearsByNetWorthDecline'
  | 'worstYearsByExpenses'
  | 'bestYearsBySavings'
> & { stats: HallOfFameStats };

/**
 * The ONE definition of what a Hall of Fame ranking is.
 *
 * Both writers call it — the client `updateHallOfFame` (after a snapshot from the Panoramica)
 * and the server one (the daily cron, and the recalculate route) — so a ranking can never mean
 * one thing in the app and another in the email. Growth and decline rankings EXCLUDE the flat
 * periods: a month that ended exactly where it started belongs to neither.
 *
 * @param monthlyRecords Every month with a record, from `calculateMonthlyRecords`.
 * @param yearlyRecords  Every year with a record, from `calculateYearlyRecords`.
 */
export function buildHallOfFameRankings(
  monthlyRecords: MonthlyRecord[],
  yearlyRecords: YearlyRecord[],
): HallOfFameRankings {
  const byDesc = <T>(pick: (record: T) => number) => (a: T, b: T) => pick(b) - pick(a);
  const byAsc = <T>(pick: (record: T) => number) => (a: T, b: T) => pick(a) - pick(b);

  return {
    bestMonthsByNetWorthGrowth: monthlyRecords
      .filter((record) => record.netWorthDiff > 0)
      .sort(byDesc((record) => record.netWorthDiff))
      .slice(0, MAX_MONTHLY_RECORDS),
    bestMonthsByIncome: [...monthlyRecords]
      .sort(byDesc((record) => record.totalIncome))
      .slice(0, MAX_MONTHLY_RECORDS),
    worstMonthsByNetWorthDecline: monthlyRecords
      .filter((record) => record.netWorthDiff < 0)
      .sort(byAsc((record) => record.netWorthDiff))
      .slice(0, MAX_MONTHLY_RECORDS),
    worstMonthsByExpenses: [...monthlyRecords]
      .sort(byDesc((record) => record.totalExpenses))
      .slice(0, MAX_MONTHLY_RECORDS),
    bestMonthsBySavings: rankBySavings(monthlyRecords, MAX_MONTHLY_RECORDS),

    bestYearsByNetWorthGrowth: yearlyRecords
      .filter((record) => record.netWorthDiff > 0)
      .sort(byDesc((record) => record.netWorthDiff))
      .slice(0, MAX_YEARLY_RECORDS),
    bestYearsByIncome: [...yearlyRecords]
      .sort(byDesc((record) => record.totalIncome))
      .slice(0, MAX_YEARLY_RECORDS),
    worstYearsByNetWorthDecline: yearlyRecords
      .filter((record) => record.netWorthDiff < 0)
      .sort(byAsc((record) => record.netWorthDiff))
      .slice(0, MAX_YEARLY_RECORDS),
    worstYearsByExpenses: [...yearlyRecords]
      .sort(byDesc((record) => record.totalExpenses))
      .slice(0, MAX_YEARLY_RECORDS),
    bestYearsBySavings: rankBySavings(yearlyRecords, MAX_YEARLY_RECORDS),

    stats: summarizeRecordStats(monthlyRecords, yearlyRecords),
  };
}
