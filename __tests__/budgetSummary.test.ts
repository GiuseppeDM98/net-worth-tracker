/**
 * Tests for lib/utils/budgetSummary.ts — every number the Budget tab prints: the ceiling's
 * standing against the calendar, the income targets, the annual budgets on their own axis,
 * the per-category rows, the trailing months and the alert split. Pure; dates are stamped at
 * noon like the rest of the suite, with one midnight fixture for the scheduled split.
 */

import { describe, expect, it } from 'vitest';
import type { Expense, ExpenseCategory } from '@/types/expenses';
import type { BudgetAlert, BudgetItem } from '@/types/budget';
import {
  buildCategoryRows,
  buildSpendingHistory,
  trailingMonthKeys,
  summarizeAlerts,
  summarizeAnnualBudgets,
  summarizeCeiling,
  summarizeIncomeTargets,
} from '@/lib/utils/budgetSummary';

// August 22nd 2026 at noon: day 22 of 31, 9 days left, 71% of the month gone.
const NOW = new Date(2026, 7, 22, 12);

function expense(overrides: Partial<Expense> & { amount: number; date: Date }): Expense {
  return {
    id: `e-${Math.random()}`,
    userId: 'u',
    type: overrides.amount > 0 ? 'income' : 'variable',
    categoryId: 'c-food',
    categoryName: 'Alimentari',
    currency: 'EUR',
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  } as Expense;
}

function item(overrides: Partial<BudgetItem> & { id: string }): BudgetItem {
  return { kind: 'expense', scope: 'category', period: 'monthly', amount: 0, order: 0, categoryId: 'c-food', categoryName: 'Alimentari', ...overrides };
}

const categories: ExpenseCategory[] = [
  { id: 'c-food', name: 'Alimentari', type: 'variable', subCategories: [], userId: 'u', createdAt: NOW, updatedAt: NOW },
  { id: 'c-home', name: 'Casa', type: 'fixed', subCategories: [], userId: 'u', createdAt: NOW, updatedAt: NOW },
  { id: 'c-pay', name: 'Stipendio', type: 'income', subCategories: [], userId: 'u', createdAt: NOW, updatedAt: NOW },
];

describe('summarizeCeiling', () => {
  const august: Expense[] = [
    expense({ amount: -1150, categoryId: 'c-home', type: 'fixed', date: new Date(2026, 7, 1, 12) }),
    expense({ amount: -1760, date: new Date(2026, 7, 10, 12) }),
    expense({ amount: 4200, categoryId: 'c-pay', date: new Date(2026, 7, 3, 12) }),
  ];

  it('returns null without a ceiling — the tile has nothing to measure against', () => {
    expect(summarizeCeiling(undefined, august, NOW)).toBeNull();
    expect(summarizeCeiling(0, august, NOW)).toBeNull();
  });

  it('reads the month against the calendar: spent share, elapsed share, days left', () => {
    const s = summarizeCeiling(4000, august, NOW)!;
    expect(s.spent).toBe(2910);
    expect(s.usedPct).toBeCloseTo(72.75);
    expect(s.calendarPct).toBeCloseTo((22 / 31) * 100);
    expect(s.calendar.daysLeft).toBe(9);
    expect(s.remaining).toBe(1090);
    expect(s.dailyAllowance).toBeCloseTo(1090 / 9);
    expect(s.exceeded).toBe(false);
  });

  it('projects with the app rule: pace on what is booked to date, scheduled rows added as they are', () => {
    const withInstalment = [...august, expense({ amount: -150, date: new Date(2026, 7, 27) })];
    const s = summarizeCeiling(4000, withInstalment, NOW)!;
    expect(s.spent).toBe(3060); // the instalment is booked in the month
    expect(s.spentToDate).toBe(2910);
    expect(s.scheduled).toBe(150);
    expect(s.projection).toBeCloseTo((2910 / 22) * 31 + 150);
  });

  it('has no projection in the first days of the month', () => {
    const day2 = new Date(2026, 7, 2, 12);
    const s = summarizeCeiling(4000, august.slice(0, 1), day2)!;
    expect(s.calendar.canForecast).toBe(false);
    expect(s.projection).toBeNull();
  });

  it('flags an exceeded ceiling with nothing left and no daily allowance', () => {
    const s = summarizeCeiling(2500, august, NOW)!;
    expect(s.exceeded).toBe(true);
    expect(s.remaining).toBe(0);
    expect(s.dailyAllowance).toBe(0);
  });

  it('names the day the ceiling was crossed, and the overrun, the real pace and the pace the ceiling holds', () => {
    const over = [...august, expense({ amount: -1000, date: new Date(2026, 7, 13, 12) }), expense({ amount: -300, date: new Date(2026, 7, 20, 12) })];
    const s = summarizeCeiling(3000, over, NOW)!;
    expect(s.exceeded).toBe(true);
    expect(s.crossedOn).toBe(13); // 1150 + 1760 (10th) = 2910, + 1000 on the 13th > 3000
    expect(s.overBy).toBe(1210);
    expect(s.dailyPace).toBeCloseTo(4210 / 22);
    expect(s.sustainablePace).toBeCloseTo(3000 / 31);
    expect(s.projectedCrossingDay).toBeNull(); // already over: a fact, not a projection
  });

  it('projects the day the pace will cross a ceiling still holding', () => {
    // 2910 by the 22nd → 132,3/day; 3500 is crossed on the 27th (3571 > 3500).
    const s = summarizeCeiling(3500, august, NOW)!;
    expect(s.exceeded).toBe(false);
    expect(s.crossedOn).toBeNull();
    expect(s.overBy).toBe(0);
    expect(s.projectedCrossingDay).toBe(27);
    expect(summarizeCeiling(4000, august, NOW)!.projectedCrossingDay).toBe(31); // 4100 > 4000 only on the 31st
    expect(summarizeCeiling(4200, august, NOW)!.projectedCrossingDay).toBeNull();
  });

  it('a scheduled row can put the crossing in the future', () => {
    const withInstalment = [...august, expense({ amount: -200, date: new Date(2026, 7, 28, 12) })];
    const s = summarizeCeiling(3000, withInstalment, NOW)!;
    expect(s.spent).toBe(3110);
    expect(s.exceeded).toBe(true);
    expect(s.crossedOn).toBe(28); // the booked rows alone stay under; the instalment on the 28th crosses
  });

  it('has no daily allowance on the last day of the month', () => {
    const s = summarizeCeiling(4000, august, new Date(2026, 7, 31, 12))!;
    expect(s.calendar.daysLeft).toBe(0);
    expect(s.dailyAllowance).toBeNull();
  });
});

describe('summarizeIncomeTargets', () => {
  const pay = item({ id: 'i1', kind: 'income', categoryId: 'c-pay', categoryName: 'Stipendio', amount: 4200 });
  const divs = item({ id: 'i2', kind: 'income', categoryId: 'c-div', categoryName: 'Dividendi', amount: 300 });
  const august: Expense[] = [
    expense({ amount: 4200, categoryId: 'c-pay', date: new Date(2026, 7, 3, 12) }),
    expense({ amount: 380, categoryId: 'c-div', date: new Date(2026, 7, 15, 12) }),
    expense({ amount: 270, categoryId: 'c-refund', date: new Date(2026, 7, 16, 12) }),
  ];

  it('is null without monthly income targets', () => {
    expect(summarizeIncomeTargets([item({ id: 'x' })], august, NOW)).toBeNull();
  });

  it('compares the targets with the income they match — an untargeted refund stays out', () => {
    const s = summarizeIncomeTargets([pay, divs, item({ id: 'x' })], august, NOW)!;
    expect(s.expected).toBe(4500);
    expect(s.registered).toBe(4580);
    expect(s.count).toBe(2);
  });

  it('ignores annual income targets — a different horizon', () => {
    expect(summarizeIncomeTargets([{ ...pay, period: 'annual' }], august, NOW)).toBeNull();
  });
});

describe('summarizeAnnualBudgets', () => {
  const holidays = item({ id: 'a1', period: 'annual', categoryId: 'c-hol', categoryName: 'Vacanze', amount: 2500 });
  const gifts = item({ id: 'a2', period: 'annual', categoryId: 'c-gift', categoryName: 'Regali', amount: 600, order: 1 });
  const year: Expense[] = [
    expense({ amount: -1400, categoryId: 'c-hol', date: new Date(2026, 6, 20, 12) }),
    expense({ amount: -180, categoryId: 'c-gift', date: new Date(2026, 2, 8, 12) }),
    expense({ amount: -900, categoryId: 'c-hol', date: new Date(2025, 7, 1, 12) }), // last year: out
  ];

  it('is empty without annual items', () => {
    const s = summarizeAnnualBudgets([item({ id: 'm' })], year, NOW);
    expect(s.rows).toEqual([]);
  });

  it('measures year-to-date against the year elapsed', () => {
    const s = summarizeAnnualBudgets([holidays, gifts], year, NOW);
    expect(s.year).toBe(2026);
    expect(s.yearElapsedPct).toBeCloseTo((234 / 365) * 100, 5);
    expect(s.monthsLeft).toBe(4);
    expect(s.rows.map((r) => r.label)).toEqual(['Vacanze', 'Regali']);
    expect(s.rows[0]).toMatchObject({ budget: 2500, spent: 1400, remaining: 1100, ahead: false });
    expect(s.rows[0].usedPct).toBeCloseTo(56);
    expect(s.aheadCount).toBe(0);
  });

  it('marks a budget ahead of the calendar, and exceeded when over', () => {
    const s = summarizeAnnualBudgets([{ ...gifts, amount: 200 }], year, NOW);
    expect(s.rows[0].ahead).toBe(true); // 90% used at 64% of the year
    expect(s.rows[0].exceeded).toBe(false);
    const over = summarizeAnnualBudgets([{ ...gifts, amount: 100 }], year, NOW);
    expect(over.rows[0].exceeded).toBe(true);
    expect(over.rows[0].remaining).toBe(0);
  });

  it('leaves income targets out: annual income is not a spending budget', () => {
    const s = summarizeAnnualBudgets([{ ...holidays, kind: 'income' }], year, NOW);
    expect(s.rows).toEqual([]);
  });
});

describe('buildCategoryRows', () => {
  const food = item({ id: 'f', amount: 600 });
  const home = item({ id: 'h', categoryId: 'c-home', categoryName: 'Casa', amount: 1250 });
  const pay = item({ id: 'p', kind: 'income', categoryId: 'c-pay', categoryName: 'Stipendio', amount: 4200 });
  const holidays = item({ id: 'a', period: 'annual', categoryId: 'c-hol', categoryName: 'Vacanze', amount: 2500 });
  const august: Expense[] = [
    expense({ amount: -1150, categoryId: 'c-home', type: 'fixed', date: new Date(2026, 7, 1, 12) }),
    expense({ amount: -450, date: new Date(2026, 7, 10, 12) }),
    expense({ amount: 4200, categoryId: 'c-pay', date: new Date(2026, 7, 3, 12) }),
  ];

  it('splits monthly expense rows from income targets, annual items out, fixed before variable', () => {
    const rows = buildCategoryRows([food, pay, home, holidays], categories, august, NOW);
    expect(rows.expense.map((r) => r.label)).toEqual(['Casa', 'Alimentari']);
    expect(rows.income.map((r) => r.label)).toEqual(['Stipendio']);
  });

  it('projects a variable category by pace and a fixed one by what is booked', () => {
    const rows = buildCategoryRows([food, home], categories, august, NOW);
    const [casa, alimentari] = rows.expense;
    expect(casa.pace).toBe('fixed');
    expect(casa.projection).toBe(1150);
    expect(casa.usedPct).toBeCloseTo(92);
    expect(alimentari.pace).toBe('variable');
    expect(alimentari.projection).toBeCloseTo((450 / 22) * 31);
  });

  it('has no projection for a category with nothing spent, nor before the fourth day', () => {
    const rows = buildCategoryRows([item({ id: 'z', categoryId: 'c-zero', categoryName: 'Istruzione', amount: 100 }), food], categories, august, NOW);
    expect(rows.expense.find((r) => r.label === 'Istruzione')?.projection).toBeNull();
    const early = buildCategoryRows([food], categories, august, new Date(2026, 7, 2, 12));
    expect(early.expense[0].projection).toBeNull();
  });

  it('never projects an income target', () => {
    const rows = buildCategoryRows([pay], categories, august, NOW);
    expect(rows.income[0].projection).toBeNull();
    expect(rows.income[0].usedPct).toBe(100);
  });
});

describe('trailingMonthKeys', () => {
  it('spans the year boundary on calendar fields', () => {
    expect(trailingMonthKeys(new Date(2026, 1, 10, 12), 4)).toEqual(['2025-11', '2025-12', '2026-01', '2026-02']);
  });
});

describe('buildSpendingHistory', () => {
  const expenses: Expense[] = [
    expense({ amount: -3270, date: new Date(2026, 2, 5, 12) }),
    expense({ amount: -2740, date: new Date(2026, 3, 5, 12) }),
    expense({ amount: -4210, date: new Date(2026, 4, 5, 12) }),
    expense({ amount: -3430, date: new Date(2026, 5, 5, 12) }),
    expense({ amount: -3110, date: new Date(2026, 6, 5, 12) }),
    expense({ amount: -2910, date: new Date(2026, 7, 5, 12) }),
    expense({ amount: 4200, categoryId: 'c-pay', date: new Date(2026, 6, 3, 12) }), // income: out
  ];

  it('returns the trailing months gap-free, the running month last and marked', () => {
    const h = buildSpendingHistory(expenses, NOW, 4000, 6);
    expect(h.months.map((m) => m.label)).toEqual(['Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago']);
    expect(h.months.map((m) => m.total)).toEqual([3270, 2740, 4210, 3430, 3110, 2910]);
    expect(h.months[5].ongoing).toBe(true);
    expect(h.months[4].ongoing).toBe(false);
  });

  it('counts the closed months over the ceiling and averages only them', () => {
    const h = buildSpendingHistory(expenses, NOW, 4000, 6);
    expect(h.closedCount).toBe(5);
    expect(h.overCount).toBe(1); // May
    expect(h.average).toBeCloseTo((3270 + 2740 + 4210 + 3430 + 3110) / 5);
  });

  it('draws an empty month as zero and has no over-count without a ceiling', () => {
    const h = buildSpendingHistory(expenses.slice(4), NOW, null, 6);
    expect(h.months[0].total).toBe(0);
    expect(h.overCount).toBeNull();
    expect(h.recordedCount).toBe(0);
  });

  it('reads each recorded month against its OWN ceiling, the rest against today’s', () => {
    const record = (month: string, ceiling: number) => ({ userId: 'u', month, overallMonthlyAmount: ceiling, items: [], alertsEnabled: true, alertThresholds: [], capturedAt: NOW });
    // May (4210) was over today's 4000 but under its own 4500; July (3110) was over its own 3000.
    const h = buildSpendingHistory(expenses, NOW, 4000, 6, [record('2026-05', 4500), record('2026-07', 3000), record('2026-08', 1)]);
    expect(h.months.map((m) => m.ceiling)).toEqual([4000, 4000, 4500, 4000, 3000, 4000]);
    expect(h.months.map((m) => m.ceilingSource)).toEqual(['current', 'current', 'recorded', 'current', 'recorded', 'current']);
    expect(h.overCount).toBe(1); // July only
    expect(h.recordedCount).toBe(2);
    expect(h.recordedFrom).toBe('Mag');
  });
});

describe('summarizeAlerts', () => {
  const alert = (overrides: Partial<BudgetAlert>): BudgetAlert => ({
    key: 'k',
    label: 'X',
    level: 'warning',
    threshold: 90,
    thresholdCrossed: true,
    spent: 90,
    budgetAmount: 100,
    usedRatio: 0.9,
    forecastedOverrun: false,
    crossedOn: null,
    ...overrides,
  });

  it('lists only the alerts whose threshold was actually crossed and counts the forecast-only ones', () => {
    const s = summarizeAlerts([
      alert({ key: 'a', level: 'exceeded', threshold: 100, usedRatio: 1.16 }),
      alert({ key: 'b' }),
      alert({ key: 'c', thresholdCrossed: false, threshold: 100, usedRatio: 0.6, forecastedOverrun: true }),
    ]);
    expect(s.rows.map((r) => r.key)).toEqual(['a', 'b']);
    expect(s.forecastOnlyCount).toBe(1);
  });
});
