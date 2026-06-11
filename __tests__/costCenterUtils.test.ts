import { describe, it, expect } from 'vitest';
import { Expense } from '@/types/expenses';
import {
  filterExpensesByPeriod,
  computeCenterStats,
  rankCentersBySpend,
  projectAnnualCost,
  evaluateCenterBudget,
  buildCategoryComposition,
  splitRecurringVsOneOff,
  buildMonthlySeriesByCategory,
  buildComparisonSeries,
  getLifecycleStatus,
  computePeriodComparison,
  DORMANT_THRESHOLD_DAYS,
} from '@/lib/utils/costCenterUtils';

// --- Fixtures ---------------------------------------------------------------

// Minimal expense factory. Expenses are stored negative (outgoing); the pure layer
// flips them to positive costs. `date` is a local Date; tests pin `now` explicitly.
function expense(partial: Partial<Expense> & { date: Date; amount: number }): Expense {
  return {
    id: Math.random().toString(36).slice(2),
    userId: 'u1',
    type: 'variable',
    categoryId: 'c1',
    categoryName: 'Carburante',
    currency: 'EUR',
    createdAt: partial.date,
    updatedAt: partial.date,
    ...partial,
  };
}

// 2025-06-15 in Italy (summer = UTC+2). Use a fixed reference for determinism.
const NOW = new Date('2025-06-15T10:00:00+02:00');

describe('filterExpensesByPeriod', () => {
  const expenses = [
    expense({ date: new Date('2024-03-10T12:00:00+01:00'), amount: -100 }), // last year
    expense({ date: new Date('2025-01-20T12:00:00+01:00'), amount: -200 }), // this year, >12mo? no, within rolling12
    expense({ date: new Date('2025-06-05T12:00:00+02:00'), amount: -300 }), // this month
    expense({ date: new Date('2024-06-30T12:00:00+02:00'), amount: -50 }),  // 13 months back → out of rolling12
  ];

  it('returns only current-month expenses for month', () => {
    const out = filterExpensesByPeriod(expenses, 'month', NOW);
    expect(out.map((e) => e.amount)).toEqual([-300]);
  });

  it('returns only current-year expenses for year', () => {
    const out = filterExpensesByPeriod(expenses, 'year', NOW);
    expect(out.map((e) => e.amount).sort()).toEqual([-300, -200].sort());
  });

  it('includes the trailing 12 calendar months for rolling12', () => {
    const out = filterExpensesByPeriod(expenses, 'rolling12', NOW);
    // Window is Jul 2024 → Jun 2025 (12 months ending on the current month).
    // 2024-06 and 2024-03 both fall before the lower bound and are excluded.
    expect(out.map((e) => e.amount).sort()).toEqual([-300, -200].sort());
  });

  it('returns everything for all', () => {
    expect(filterExpensesByPeriod(expenses, 'all', NOW)).toHaveLength(4);
  });
});

describe('computeCenterStats', () => {
  it('returns zeros for an empty list', () => {
    const stats = computeCenterStats([], 'all', NOW);
    expect(stats).toEqual({
      totalSpent: 0,
      transactionCount: 0,
      averageMonthly: 0,
      firstActivityDate: null,
      lastActivityDate: null,
    });
  });

  it('sums absolute amounts and divides by elapsed months in the year window', () => {
    const expenses = [
      expense({ date: new Date('2025-02-10T12:00:00+01:00'), amount: -600 }),
      expense({ date: new Date('2025-05-10T12:00:00+02:00'), amount: -600 }),
    ];
    const stats = computeCenterStats(expenses, 'year', NOW);
    expect(stats.totalSpent).toBe(1200);
    expect(stats.transactionCount).toBe(2);
    // June = month 6 elapsed → 1200 / 6 = 200
    expect(stats.averageMonthly).toBe(200);
  });

  it('uses true monthly average (calendar months, not active months) for sporadic spend', () => {
    // Two purchases 6 months apart in the same year: average must reflect 6 elapsed months.
    const expenses = [
      expense({ date: new Date('2025-01-01T12:00:00+01:00'), amount: -300 }),
      expense({ date: new Date('2025-06-01T12:00:00+02:00'), amount: -300 }),
    ];
    const stats = computeCenterStats(expenses, 'year', NOW);
    expect(stats.averageMonthly).toBe(100); // 600 / 6, not 600 / 2
  });
});

describe('rankCentersBySpend', () => {
  it('orders rows by totalSpent descending without mutating the input', () => {
    const rows = [{ totalSpent: 50 }, { totalSpent: 300 }, { totalSpent: 120 }];
    const ranked = rankCentersBySpend(rows);
    expect(ranked.map((r) => r.totalSpent)).toEqual([300, 120, 50]);
    expect(rows.map((r) => r.totalSpent)).toEqual([50, 300, 120]); // untouched
  });
});

describe('projectAnnualCost', () => {
  it('projects from the YTD pace when there is no prior-year history', () => {
    // Spent 600 over ~166 days → daily pace ~3.61 → ×365 ≈ 1320
    const expenses = [expense({ date: new Date('2025-03-01T12:00:00+01:00'), amount: -600 })];
    const fc = projectAnnualCost(expenses, NOW);
    expect(fc.spentYtd).toBe(600);
    expect(fc.projectedTotal).toBeGreaterThan(600);
    expect(fc.yearProgress).toBeGreaterThan(0);
    expect(fc.yearProgress).toBeLessThan(1);
  });

  it('blends toward the prior-year total early in the year', () => {
    const expenses = [
      // Prior year: 1200 total
      expense({ date: new Date('2024-04-01T12:00:00+02:00'), amount: -1200 }),
      // This year: one small early purchase
      expense({ date: new Date('2025-01-05T12:00:00+01:00'), amount: -100 }),
    ];
    // Early January reference: blended projection should sit between the naive YTD
    // extrapolation and stay anchored near the prior-year pace.
    const earlyNow = new Date('2025-01-10T10:00:00+01:00');
    const fc = projectAnnualCost(expenses, earlyNow);
    expect(fc.spentYtd).toBe(100);
    // Pulled up toward the ~1200 prior-year pace rather than the runaway YTD extrapolation.
    expect(fc.projectedTotal).toBeGreaterThan(900);
    expect(fc.projectedTotal).toBeLessThan(1500);
  });
});

describe('evaluateCenterBudget', () => {
  const expenses = [
    expense({ date: new Date('2025-06-05T12:00:00+02:00'), amount: -800 }),
    expense({ date: new Date('2025-02-05T12:00:00+01:00'), amount: -400 }),
  ];

  it('returns null when no budget is set', () => {
    expect(evaluateCenterBudget({}, expenses, NOW)).toBeNull();
    expect(evaluateCenterBudget({ budgetAmount: 0, budgetPeriod: 'annual' }, expenses, NOW)).toBeNull();
  });

  it('measures a monthly ceiling against the current month', () => {
    const v = evaluateCenterBudget({ budgetAmount: 1000, budgetPeriod: 'monthly' }, expenses, NOW)!;
    expect(v.spent).toBe(800); // only June
    expect(v.ratio).toBeCloseTo(0.8);
    expect(v.status).toBe('ok');
  });

  it('measures an annual ceiling against the year-to-date and flags overruns', () => {
    const v = evaluateCenterBudget({ budgetAmount: 1000, budgetPeriod: 'annual' }, expenses, NOW)!;
    expect(v.spent).toBe(1200); // June + February
    expect(v.status).toBe('over');
    expect(v.remaining).toBe(-200);
  });

  it('flags warning at >=90%', () => {
    const v = evaluateCenterBudget({ budgetAmount: 850, budgetPeriod: 'monthly' }, expenses, NOW)!;
    expect(v.status).toBe('warning');
  });
});

describe('buildCategoryComposition', () => {
  it('collapses categories past the cap into Altro and sorts by amount', () => {
    const expenses = [
      expense({ date: NOW, amount: -100, categoryName: 'Carburante' }),
      expense({ date: NOW, amount: -50, categoryName: 'Assicurazione' }),
      expense({ date: NOW, amount: -30, categoryName: 'Manutenzione' }),
      expense({ date: NOW, amount: -20, categoryName: 'Bollo' }),
      expense({ date: NOW, amount: -10, categoryName: 'Pedaggi' }),
      expense({ date: NOW, amount: -5, categoryName: 'Multe' }), // 6th → Altro
    ];
    const comp = buildCategoryComposition(expenses);
    expect(comp[0].categoryName).toBe('Carburante');
    expect(comp[comp.length - 1].categoryName).toBe('Altro');
    expect(comp[comp.length - 1].total).toBe(5);
    const totalPct = comp.reduce((s, c) => s + c.pct, 0);
    expect(totalPct).toBeCloseTo(1);
  });
});

describe('splitRecurringVsOneOff', () => {
  it('treats recurring and installment as fixed cost', () => {
    const expenses = [
      expense({ date: NOW, amount: -100, isRecurring: true }),
      expense({ date: NOW, amount: -200, isInstallment: true }),
      expense({ date: NOW, amount: -300 }),
    ];
    const split = splitRecurringVsOneOff(expenses);
    expect(split.recurring).toBe(300);
    expect(split.oneOff).toBe(300);
    expect(split.recurringPct).toBeCloseTo(0.5);
  });
});

describe('buildMonthlySeriesByCategory', () => {
  it('produces a gap-free month axis with stacked category values', () => {
    const expenses = [
      expense({ date: new Date('2025-01-10T12:00:00+01:00'), amount: -100, categoryName: 'Carburante' }),
      // February intentionally skipped → must still appear as an empty bucket
      expense({ date: new Date('2025-03-10T12:00:00+01:00'), amount: -50, categoryName: 'Assicurazione' }),
    ];
    const series = buildMonthlySeriesByCategory(expenses);
    expect(series.buckets).toHaveLength(3); // Jan, Feb, Mar
    expect(series.buckets[1].total).toBe(0); // February gap filled
    expect(series.categories).toContain('Carburante');
    expect(series.buckets[0].byCategory['Carburante']).toBe(100);
  });

  it('keeps only the most recent N months when maxMonths is given', () => {
    const expenses = Array.from({ length: 6 }, (_, i) =>
      expense({ date: new Date(2025, i, 10), amount: -10 }),
    );
    const series = buildMonthlySeriesByCategory(expenses, 3);
    expect(series.buckets).toHaveLength(3);
  });
});

describe('buildComparisonSeries', () => {
  it('keeps the top centers by spend and aligns them on a shared month axis', () => {
    const centers = [
      {
        id: 'a',
        name: 'Auto',
        expenses: [
          expense({ date: new Date('2025-01-10T12:00:00+01:00'), amount: -100 }),
          expense({ date: new Date('2025-02-10T12:00:00+01:00'), amount: -100 }),
        ],
      },
      {
        id: 'b',
        name: 'Casa',
        expenses: [expense({ date: new Date('2025-02-10T12:00:00+01:00'), amount: -500 })],
      },
    ];
    const series = buildComparisonSeries(centers, 'year', NOW);
    expect(series.centers.map((c) => c.id)).toEqual(['b', 'a']); // ranked by total
    expect(series.buckets).toHaveLength(2); // Jan + Feb union
    expect(series.buckets[0].byCenter['b']).toBe(0); // Casa has no January
    expect(series.buckets[1].byCenter['b']).toBe(500);
  });

  it('returns empty series when there is no spend', () => {
    expect(buildComparisonSeries([], 'all', NOW)).toEqual({ buckets: [], centers: [] });
  });
});

describe('computePeriodComparison', () => {
  it('computes a signed delta vs the previous year', () => {
    const expenses = [
      expense({ date: new Date('2024-03-10T12:00:00+01:00'), amount: -400 }), // prev year
      expense({ date: new Date('2025-03-10T12:00:00+01:00'), amount: -600 }), // this year
    ];
    const cmp = computePeriodComparison(expenses, 'year', NOW);
    expect(cmp.current).toBe(600);
    expect(cmp.previous).toBe(400);
    expect(cmp.deltaPct).toBeCloseTo(0.5); // +50%
  });

  it('returns null delta when there is no predecessor data or for the all period', () => {
    const expenses = [expense({ date: new Date('2025-03-10T12:00:00+01:00'), amount: -600 })];
    expect(computePeriodComparison(expenses, 'year', NOW).deltaPct).toBeNull();
    expect(computePeriodComparison(expenses, 'all', NOW).deltaPct).toBeNull();
  });
});

describe('getLifecycleStatus', () => {
  it('reports archived when archivedAt is set', () => {
    expect(getLifecycleStatus({ archivedAt: NOW }, NOW, NOW)).toBe('archived');
  });

  it('reports dormant with no activity or stale activity', () => {
    expect(getLifecycleStatus({}, null, NOW)).toBe('dormant');
    const stale = new Date(NOW.getTime() - (DORMANT_THRESHOLD_DAYS + 5) * 86_400_000);
    expect(getLifecycleStatus({}, stale, NOW)).toBe('dormant');
  });

  it('reports active for recent activity', () => {
    const recent = new Date(NOW.getTime() - 5 * 86_400_000);
    expect(getLifecycleStatus({}, recent, NOW)).toBe('active');
  });
});
