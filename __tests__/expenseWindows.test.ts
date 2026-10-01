/**
 * The windows of expenses each page reads (lib/utils/expenseWindows.ts) — two things pinned:
 *
 *   1. THE BOUNDS. A row the form saved on the first day of a window is inside it, in the
 *      process timezone and under `TZ=Europe/Rome` alike: fixtures are built the way
 *      `ExpenseDialog` builds them (`new Date('YYYY-MM-DDT00:00:00')`, local midnight, no `Z`),
 *      plus one at noon, one on 31 December and one at ITALIAN midnight — the calendar every
 *      month bucket reads.
 *   2. THE INVARIANCE. Every reader of a page gives the same answer on the rows of its window as
 *      on the account's whole list. The readers are the pages' own pure functions, run twice;
 *      a window that leaves out a row a reader asks for turns its case red.
 *
 * Seen red, each alone (2026-09-30): a window's start at `Date.UTC` (under Europe/Rome the 1st of
 * the month falls out); its start or its end without the Italian calendar (under America/New_York
 * and Asia/Tokyo the month buckets lose their first or last day); Tracciamento's twelve months cut
 * to eleven, or its end on a custom range's last day instead of its month; Budget without the
 * older-of-two start (March loses three of its six months), or closed on this month (the annual
 * budgets lose the calendar ahead); the FIRE history without its older window, or with the recent
 * one closed on this month; `range` keyed outside the `all` prefix.
 */
import { describe, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { fromZonedTime } from 'date-fns-tz';

vi.mock('@/lib/firebase/config', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({}));

import type { Expense, ExpenseCategory } from '@/types/expenses';
import type { BudgetItem } from '@/types/budget';
import type { MonthlySnapshot } from '@/types/assets';
import {
  BUDGET_HISTORY_MONTHS,
  budgetSuggestionWindow,
  budgetWindow,
  fireWindows,
  listExpenseYears,
  trackingWindow,
  type ExpenseWindow,
} from '@/lib/utils/expenseWindows';
import { queryKeys } from '@/lib/query/queryKeys';
import { endOfMonthBound, toDate } from '@/lib/utils/dateHelpers';
import type { Period } from '@/lib/utils/period';
import {
  buildTrailingMonthFlows,
  currentComparisonWindow,
  filterExpensesByPeriod,
  previousComparisonWindow,
  previousPeriod,
  resolveAnchorMonth,
  resolveFlowWindow,
  summarizePeriodCashflow,
  summarizeSavingsHistory,
} from '@/lib/utils/tracciamentoSummary';
import { evaluateBudgetAlerts, getDefaultAmount, rankCategoriesAtRisk } from '@/lib/utils/budgetUtils';
import {
  buildCategoryRows,
  buildSpendingHistory,
  summarizeAnnualBudgets,
  summarizeCeiling,
  summarizeIncomeTargets,
  trailingMonthKeys,
} from '@/lib/utils/budgetSummary';
import { buildFIREData, computeAnnualCashflowData, computeLastYearExpenses } from '@/lib/services/fireService';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

/** A date as the expense form saves it: LOCAL midnight of the day typed, no `Z`. */
const formDate = (isoDay: string): Date => new Date(`${isoDay}T00:00:00`);

/** Midnight of a day in the Italian calendar, whatever timezone the suite runs in. */
const italianMidnight = (isoDay: string): Date => fromZonedTime(`${isoDay}T00:00:00.000`, 'Europe/Rome');

function row(date: Date, type: Expense['type'], categoryId: string, magnitude: number): Expense {
  return {
    id: `${categoryId}-${date.getTime()}`,
    userId: 'owner',
    type,
    categoryId,
    categoryName: categoryId,
    amount: type === 'income' ? magnitude : -magnitude,
    currency: 'EUR',
    date,
    createdAt: date,
    updatedAt: date,
  } as Expense;
}

/**
 * Seven years of rows, 2022 → 2028, so that every window leaves rows out on a side it closes:
 * per month the 1st as the form saves it, the 15th at noon, the 27th (income) and the last
 * minute of the last day; per year the 31st of December. Every amount is a different whole
 * number, so a row gained or lost moves the sum it belongs to.
 */
function buildLedger(): Expense[] {
  const rows: Expense[] = [];
  let serial = 0;
  for (let year = 2022; year <= 2028; year++) {
    for (let month = 1; month <= 12; month++) {
      const mm = String(month).padStart(2, '0');
      rows.push(row(formDate(`${year}-${mm}-01`), 'fixed', 'c-home', 700 + serial++));
      rows.push(row(new Date(year, month - 1, 15, 12), 'variable', 'c-food', 100 + serial++));
      rows.push(row(formDate(`${year}-${mm}-27`), 'income', 'c-pay', 2000 + serial++));
      rows.push(row(new Date(year, month, 0, 23, 59), 'variable', 'c-fun', 30 + serial++));
    }
    rows.push(row(formDate(`${year}-12-31`), 'fixed', 'c-fees', 50 + serial++));
  }
  return rows;
}

const LEDGER = buildLedger();

/** What the Firestore range query returns for a window: `date >= from` and `date <= to`. */
function inWindow(rows: Expense[], window: ExpenseWindow): Expense[] {
  return rows.filter((expense) => {
    const date = toDate(expense.date);
    return date >= window.from && date <= window.to;
  });
}

const holds = (window: ExpenseWindow, date: Date): boolean => date >= window.from && date <= window.to;

/** Three «today»s: the last day of a month, a March (Budget's bars reach last year), a January. */
const SEPTEMBER = new Date(2026, 8, 30, 12);
const MARCH = new Date(2026, 2, 15, 12);
const JANUARY = new Date(2027, 0, 10, 12);

// ─── Tracciamento ─────────────────────────────────────────────────────────────

describe('trackingWindow', () => {
  const september2026 = trackingWindow({ kind: 'month', year: 2026, month: 9 });

  it('should hold a row the form saved on the first day, twelve months before the period', () => {
    expect(holds(september2026, formDate('2025-09-01'))).toBe(true);
    expect(holds(september2026, new Date(2025, 7, 31, 12))).toBe(false);
  });

  it('should hold the last minute of the period and leave out the next day as the form saves it', () => {
    expect(holds(september2026, new Date(2026, 8, 30, 23, 59))).toBe(true);
    expect(holds(september2026, endOfMonthBound(2026, 9))).toBe(true);
    expect(holds(september2026, formDate('2026-10-01'))).toBe(false);
  });

  it('should hold the first and the last day in the ITALIAN calendar too, which the month buckets read', () => {
    expect(holds(september2026, italianMidnight('2025-09-01'))).toBe(true);
    expect(holds(september2026, fromZonedTime('2026-09-30T23:59:59.999', 'Europe/Rome'))).toBe(true);
  });

  it('should hold a year whole, 31 December included, and the year before it', () => {
    const year2026 = trackingWindow({ kind: 'year', year: 2026 });

    expect(holds(year2026, formDate('2025-01-01'))).toBe(true);
    expect(holds(year2026, formDate('2026-12-31'))).toBe(true);
    expect(holds(year2026, new Date(2026, 11, 31, 23, 59))).toBe(true);
    expect(holds(year2026, formDate('2027-01-01'))).toBe(false);
  });

  it('should open a custom range on the first day of the month, twelve months before its first day', () => {
    const range = trackingWindow({ kind: 'custom', from: new Date(2025, 10, 15), to: new Date(2026, 1, 20) });

    expect(holds(range, formDate('2024-11-01'))).toBe(true);
    expect(holds(range, new Date(2024, 9, 31, 12))).toBe(false);
  });

  it('should close a custom range on the end of its last MONTH: the two charts draw that month whole', () => {
    const range = trackingWindow({ kind: 'custom', from: new Date(2025, 10, 15), to: new Date(2026, 1, 20) });

    expect(holds(range, formDate('2026-02-21'))).toBe(true);
    expect(holds(range, new Date(2026, 1, 28, 23, 59))).toBe(true);
    expect(holds(range, formDate('2026-03-01'))).toBe(false);
  });

  /** Everything Tracciamento computes from its list, the readers behind the period included. */
  function readTracciamento(rows: Expense[], period: Period, now: Date) {
    const totalsOf = (slice: Period | null) => (slice ? summarizePeriodCashflow(filterExpensesByPeriod(rows, slice)) : null);
    const flow = resolveFlowWindow(period, now, 6);
    const anchor = resolveAnchorMonth(period, now);
    return {
      period: totalsOf(period),
      previous: totalsOf(previousPeriod(period, now)),
      comparedNow: totalsOf(currentComparisonWindow(period, now)),
      comparedBefore: totalsOf(previousComparisonWindow(period, now)),
      flows: buildTrailingMonthFlows(rows, flow.endYear, flow.endMonth, flow.count, now),
      savingsHistory: summarizeSavingsHistory(buildTrailingMonthFlows(rows, anchor.year, anchor.month, 12), now),
    };
  }

  const periods: Array<[string, Period]> = [
    ['the month in progress', { kind: 'month', year: 2026, month: 9 }],
    ['a January, whose history is last year', { kind: 'month', year: 2026, month: 1 }],
    ['a past month', { kind: 'month', year: 2025, month: 3 }],
    ['a month still to come', { kind: 'month', year: 2026, month: 12 }],
    ['the running year', { kind: 'year', year: 2026 }],
    ['a closed year, compared with the year before whole', { kind: 'year', year: 2025 }],
    ['a year still to come', { kind: 'year', year: 2028 }],
    ['the year to date', { kind: 'ytd', year: 2026, throughMonth: 9 }],
    ['a custom range across two years', { kind: 'custom', from: new Date(2025, 10, 15), to: new Date(2026, 1, 20) }],
  ];

  it.each(periods)('should give every reader of the tab what the whole list gives: %s', (_label, period) => {
    for (const now of [SEPTEMBER, MARCH, JANUARY]) {
      const windowRows = inWindow(LEDGER, trackingWindow(period));

      expect(windowRows.length).toBeLessThan(LEDGER.length);
      expect(readTracciamento(windowRows, period, now)).toEqual(readTracciamento(LEDGER, period, now));
    }
  });
});

// ─── Budget ───────────────────────────────────────────────────────────────────

describe('budgetWindow', () => {
  it('should start where the six bars start when that is before January: in March, October of last year', () => {
    const march = budgetWindow(MARCH);
    const [year, month] = trailingMonthKeys(MARCH, BUDGET_HISTORY_MONTHS)[0].split('-').map(Number);

    expect([year, month]).toEqual([2025, 10]);
    expect(holds(march, formDate('2025-10-01'))).toBe(true);
    expect(holds(march, new Date(2025, 8, 30, 12))).toBe(false);
  });

  it('should start in January when the six bars fit inside the year: in September', () => {
    const september = budgetWindow(SEPTEMBER);

    expect(holds(september, formDate('2026-01-01'))).toBe(true);
    expect(holds(september, formDate('2025-12-31'))).toBe(false);
  });

  it('should close on December, not on this month: an annual budget counts what is already in the calendar', () => {
    const march = budgetWindow(MARCH);

    expect(holds(march, formDate('2026-12-31'))).toBe(true);
    expect(holds(march, formDate('2027-01-01'))).toBe(false);
  });

  const categories: ExpenseCategory[] = (['c-home', 'c-food', 'c-fun', 'c-fees', 'c-pay'] as const).map((id) => ({
    id,
    name: id,
    type: id === 'c-pay' ? 'income' : id === 'c-home' || id === 'c-fees' ? 'fixed' : 'variable',
    subCategories: [],
    userId: 'owner',
    createdAt: SEPTEMBER,
    updatedAt: SEPTEMBER,
  })) as ExpenseCategory[];

  const item = (id: string, overrides: Partial<BudgetItem>): BudgetItem => ({ id, kind: 'expense', scope: 'category', period: 'monthly', amount: 100, order: 0, categoryId: 'c-food', categoryName: 'c-food', ...overrides });
  const items: BudgetItem[] = [
    item('food-monthly', {}),
    item('home-monthly', { categoryId: 'c-home', categoryName: 'c-home', amount: 5000 }),
    item('fees-annual', { categoryId: 'c-fees', categoryName: 'c-fees', period: 'annual', amount: 40 }),
    item('fun-annual', { categoryId: 'c-fun', categoryName: 'c-fun', period: 'annual', amount: 9000 }),
    item('pay-target', { kind: 'income', categoryId: 'c-pay', categoryName: 'c-pay', amount: 2500 }),
  ];
  const expenseItems = items.filter((entry) => entry.kind === 'expense');

  /** Every figure of the Budget tab that is computed from the expenses. */
  function readBudget(rows: Expense[], now: Date) {
    return {
      ceiling: summarizeCeiling(1500, rows, now),
      risk: rankCategoriesAtRisk(expenseItems, rows, now, categories),
      alerts: evaluateBudgetAlerts(expenseItems, 1500, rows, [50, 80, 100], now, categories),
      annual: summarizeAnnualBudgets(items, rows, now),
      income: summarizeIncomeTargets(items, rows, now),
      rows: buildCategoryRows(items, categories, rows, now),
      history: buildSpendingHistory(rows, now, 1500, BUDGET_HISTORY_MONTHS),
    };
  }

  it.each([
    ['in March, when the bars reach into last year', MARCH],
    ['on the last day of September', SEPTEMBER],
    ['in January', JANUARY],
  ])('should give every reader of the tab what the whole list gives: %s', (_label, now) => {
    const windowRows = inWindow(LEDGER, budgetWindow(now));

    expect(windowRows.length).toBeLessThan(LEDGER.length);
    expect(readBudget(windowRows, now)).toEqual(readBudget(LEDGER, now));
  });

  it('should suggest a new budget from WHOLE years: the floor year to last year, read by the dialog alone', () => {
    vi.useFakeTimers();
    vi.setSystemTime(MARCH);
    try {
      const window = budgetSuggestionWindow(MARCH, 2024)!;
      const target = { kind: 'expense', scope: 'category', categoryId: 'c-food' } as const;

      expect(holds(window, formDate('2024-01-01'))).toBe(true);
      expect(holds(window, new Date(2025, 11, 31, 23, 59))).toBe(true);
      expect(holds(window, formDate('2026-01-01'))).toBe(false);
      expect(getDefaultAmount(target, inWindow(LEDGER, window), 2024)).toBe(getDefaultAmount(target, LEDGER, 2024));
      // The tab's own window holds only the last three months of 2025 in March: a year's total read
      // off it would be a quarter of the year, which is why the dialog does not read it.
      expect(getDefaultAmount(target, inWindow(LEDGER, budgetWindow(MARCH)), 2024)).not.toBe(getDefaultAmount(target, LEDGER, 2024));
    } finally {
      vi.useRealTimers();
    }
  });

  it('should have nothing to suggest from when the floor leaves no year before this one', () => {
    expect(budgetSuggestionWindow(MARCH, 2026)).toBeNull();
  });
});

// ─── FIRE ─────────────────────────────────────────────────────────────────────

describe('fireWindows', () => {
  const snapshot = (year: number, month: number): MonthlySnapshot =>
    ({ id: `owner-${year}-${month}`, userId: 'owner', year, month, totalNetWorth: 100_000, liquidNetWorth: 80_000, illiquidNetWorth: 20_000, createdAt: new Date(year, month - 1, 28) }) as unknown as MonthlySnapshot;

  /** One snapshot a month from (startYear, startMonth) to September 2026, oldest first. */
  function snapshotsFrom(startYear: number, startMonth: number): MonthlySnapshot[] {
    const list: MonthlySnapshot[] = [];
    for (let year = startYear, month = startMonth; year < 2026 || month <= 9; month === 12 ? (year++, (month = 1)) : month++) list.push(snapshot(year, month));
    return list;
  }

  it('should read last year and this one, whole, for every tab', () => {
    const { recent } = fireWindows(SEPTEMBER, null);

    expect(holds(recent, formDate('2025-01-01'))).toBe(true);
    expect(holds(recent, formDate('2024-12-31'))).toBe(false);
    expect(holds(recent, new Date(2026, 11, 31, 23, 59))).toBe(true);
    expect(holds(recent, formDate('2027-01-01'))).toBe(false);
  });

  it('should read nothing older without a snapshot, or when the history starts inside the recent window', () => {
    expect(fireWindows(SEPTEMBER, null).older).toBeNull();
    expect(fireWindows(SEPTEMBER, { year: 2026, month: 3 }).older).toBeNull();
  });

  it('should read the older rows from eleven months before the first snapshot, up to where the recent window starts', () => {
    const { recent, older } = fireWindows(SEPTEMBER, { year: 2024, month: 3 });

    expect(older).not.toBeNull();
    expect(holds(older!, formDate('2023-04-01'))).toBe(true);
    expect(holds(older!, new Date(2023, 2, 31, 12))).toBe(false);
    // Contiguous and disjoint: the two lists joined hold every row once.
    expect(older!.to.getTime()).toBe(recent.from.getTime() - 1);
  });

  it.each([
    ['the last day of September', SEPTEMBER],
    ['a January, when last year has just closed', JANUARY],
  ])('should give the number and the projection what the whole list gives, from the recent window alone: %s', (_label, now) => {
    const recentRows = inWindow(LEDGER, fireWindows(now, null).recent);

    expect(recentRows.length).toBeLessThan(LEDGER.length);
    expect(computeAnnualCashflowData(recentRows, now)).toEqual(computeAnnualCashflowData(LEDGER, now));
    expect(computeLastYearExpenses(recentRows, now)).toBe(computeLastYearExpenses(LEDGER, now));
  });

  it('should fall back to the running year, annualised, exactly as on the whole list when last year is empty', () => {
    const onlyThisYear = LEDGER.filter((expense) => toDate(expense.date).getFullYear() === 2026);
    const recentRows = inWindow(onlyThisYear, fireWindows(SEPTEMBER, null).recent);

    expect(computeAnnualCashflowData(recentRows, SEPTEMBER).isAnnualized).toBe(true);
    expect(computeAnnualCashflowData(recentRows, SEPTEMBER)).toEqual(computeAnnualCashflowData(onlyThisYear, SEPTEMBER));
  });

  it.each([
    ['a history older than the recent window: the two lists joined', snapshotsFrom(2024, 3), SEPTEMBER],
    ['a history inside the recent window: the recent list alone', snapshotsFrom(2026, 3), SEPTEMBER],
    ['a last snapshot months ahead of this device\'s clock', snapshotsFrom(2024, 3), MARCH],
  ])('should give the history what the whole list gives: %s', (_label, snapshots, now) => {
    const { recent, older } = fireWindows(now, snapshots[0]);
    const joined = [...(older ? inWindow(LEDGER, older) : []), ...inWindow(LEDGER, recent)];

    expect(joined.length).toBeLessThan(LEDGER.length);
    expect(buildFIREData(snapshots, joined, 100_000, 4, false, now)).toEqual(buildFIREData(snapshots, LEDGER, 100_000, 4, false, now));
  });
});

// ─── The rest of the collection, and the keys ─────────────────────────────────

describe('listExpenseYears', () => {
  it('should offer every year from the newest row to the oldest, newest first', () => {
    expect(listExpenseYears({ oldest: formDate('2023-12-31'), newest: formDate('2026-01-01') })).toEqual([2026, 2025, 2024, 2023]);
  });

  it('should offer nothing for an account with no row, or before the bounds are read', () => {
    expect(listExpenseYears(null)).toEqual([]);
    expect(listExpenseYears(undefined)).toEqual([]);
  });
});

describe('the keys of a window', () => {
  it('should be reached by the invalidation every expense write makes: `expenses.all` is their prefix', () => {
    const queryClient = new QueryClient();
    const window = trackingWindow({ kind: 'month', year: 2026, month: 9 });
    const rangeKey = queryKeys.expenses.range('owner', window.from.toISOString(), window.to.toISOString());
    const boundsKey = queryKeys.expenses.bounds('owner');
    const otherOwnerKey = queryKeys.expenses.range('guest', window.from.toISOString(), window.to.toISOString());
    queryClient.setQueryData(rangeKey, []);
    queryClient.setQueryData(boundsKey, null);
    queryClient.setQueryData(otherOwnerKey, []);

    void queryClient.invalidateQueries({ queryKey: queryKeys.expenses.all('owner') });

    expect(queryClient.getQueryState(rangeKey)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(boundsKey)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(otherOwnerKey)?.isInvalidated).toBe(false);
  });

  it('should be one entry per window: two periods never share a list', () => {
    const september = trackingWindow({ kind: 'month', year: 2026, month: 9 });
    const august = trackingWindow({ kind: 'month', year: 2026, month: 8 });

    expect(queryKeys.expenses.range('owner', september.from.toISOString(), september.to.toISOString())).not.toEqual(
      queryKeys.expenses.range('owner', august.from.toISOString(), august.to.toISOString()),
    );
  });
});
