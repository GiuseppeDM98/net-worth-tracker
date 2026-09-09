import { describe, it, expect } from 'vitest';
import type { Expense } from '@/types/expenses';
import type { CostCenter } from '@/types/costCenters';
import {
  MIN_YEAR_FORECAST_DAYS,
  buildCenterMonthStack,
  resolveYearCalendar,
  summarizeCenter,
  summarizeCostCenters,
} from '@/lib/utils/costCenterSummary';
import { projectWindowEndWithScheduled } from '@/lib/utils/spendingProjection';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

// 22 August 2026, 10:00 in Italy: day 22 of 31, day 234 of 365.
const NOW = new Date('2026-08-22T10:00:00+02:00');

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

// Built the way the dialog builds one: local midnight, no time component.
const day = (iso: string) => new Date(`${iso}T00:00:00`);

function center(partial: Partial<CostCenter> = {}): CostCenter {
  return {
    id: 'auto',
    userId: 'u1',
    name: 'Automobile',
    createdAt: day('2023-03-12'),
    updatedAt: day('2023-03-12'),
    ...partial,
  };
}

const AUTO_ROWS: Expense[] = [
  expense({ date: day('2023-03-14'), amount: -100 }),
  expense({ date: day('2025-12-10'), amount: -380 }),
  expense({ date: day('2026-02-03'), amount: -620, categoryName: 'Assicurazione', categoryId: 'c2', isRecurring: true }),
  expense({ date: day('2026-08-05'), amount: -140 }),
  expense({ date: day('2026-08-18'), amount: -70 }),
  // Dated after today: an instalment already in the calendar.
  expense({ date: day('2026-08-28'), amount: -50, isInstallment: true }),
];

// ─── The year window ──────────────────────────────────────────────────────────

describe('resolveYearCalendar', () => {
  it('reads day 234 of 365 on 22 August 2026 with 131 days left', () => {
    expect(resolveYearCalendar(NOW)).toEqual({ dayOfYear: 234, daysInYear: 365, daysLeft: 131, canForecast: true });
  });

  it('refuses a pace before MIN_YEAR_FORECAST_DAYS', () => {
    const early = resolveYearCalendar(new Date('2026-01-10T10:00:00+01:00'));
    expect(early.dayOfYear).toBe(10);
    expect(early.canForecast).toBe(false);
    expect(MIN_YEAR_FORECAST_DAYS).toBe(28);
  });

  it('counts 366 days in a leap year', () => {
    expect(resolveYearCalendar(new Date('2028-03-01T10:00:00+01:00')).daysInYear).toBe(366);
  });
});

describe('projectWindowEndWithScheduled', () => {
  it('extrapolates the booked pace over the window and adds the scheduled rows as they are', () => {
    expect(projectWindowEndWithScheduled(220, 50, 22, 31)).toBeCloseTo(360, 5);
    expect(projectWindowEndWithScheduled(1000, 0, 100, 365)).toBeCloseTo(3650, 5);
  });

  it('is null on a window that has not started', () => {
    expect(projectWindowEndWithScheduled(10, 0, 0, 31)).toBeNull();
  });
});

// ─── One center ───────────────────────────────────────────────────────────────

describe('summarizeCenter', () => {
  it('reads an empty center as never used: no total, no projection, dormant', () => {
    const s = summarizeCenter(center(), [], NOW);
    expect(s.total).toBe(0);
    expect(s.count).toBe(0);
    expect(s.firstDate).toBeNull();
    expect(s.lastDate).toBeNull();
    expect(s.idleDays).toBeNull();
    expect(s.lifecycle).toBe('dormant');
    expect(s.yearProjection).toBeNull();
    expect(s.monthProjection).toBeNull();
    expect(s.budget).toBeNull();
    expect(s.averageMonthly).toBe(0);
  });

  it('totals what is booked up to today and keeps the rows dated after today apart', () => {
    const s = summarizeCenter(center(), AUTO_ROWS, NOW);
    expect(s.total).toBe(1310);
    expect(s.count).toBe(5);
    expect(s.scheduled).toEqual({ total: 50, count: 1 });
  });

  it('measures the monthly average over the calendar months since the first expense', () => {
    const s = summarizeCenter(center(), AUTO_ROWS, NOW);
    // March 2023 → August 2026 inclusive = 42 months.
    expect(s.monthsSpan).toBe(42);
    expect(s.averageMonthly).toBeCloseTo(1310 / 42, 6);
    expect(s.monthsWithSpending).toBe(4);
  });

  it('splits this year and last year on the Italian calendar', () => {
    const s = summarizeCenter(center(), AUTO_ROWS, NOW);
    expect(s.ytd).toBe(830);
    expect(s.ytdPct).toBeCloseTo((830 / 1310) * 100, 6);
    expect(s.lastYear).toBe(380);
  });

  it('projects the year end at the app rule: the booked pace over the year plus the scheduled rows', () => {
    const s = summarizeCenter(center(), AUTO_ROWS, NOW);
    expect(s.yearProjection).toBeCloseTo((830 / 234) * 365 + 50, 6);
    expect(s.monthProjection).toBeCloseTo((210 / 22) * 31 + 50, 6);
  });

  it('drops the projections on a dormant center and before the forecast threshold', () => {
    const dormantRows = [expense({ date: day('2026-04-24'), amount: -100 })];
    const dormant = summarizeCenter(center(), dormantRows, NOW);
    expect(dormant.lifecycle).toBe('dormant');
    expect(dormant.idleDays).toBe(120);
    expect(dormant.yearProjection).toBeNull();
    expect(dormant.monthProjection).toBeNull();

    const early = summarizeCenter(center(), [expense({ date: day('2026-01-05'), amount: -100 })], new Date('2026-01-10T10:00:00+01:00'));
    expect(early.yearProjection).toBeNull();
  });

  it('keeps an archived center out of every projection and names its lifecycle', () => {
    const s = summarizeCenter(center({ archivedAt: day('2025-01-10') }), AUTO_ROWS, NOW);
    expect(s.lifecycle).toBe('archived');
    expect(s.yearProjection).toBeNull();
    expect(s.total).toBe(1310);
  });

  it('reads a monthly ceiling on the running month with today on the track', () => {
    const s = summarizeCenter(center({ budgetAmount: 250, budgetPeriod: 'monthly' }), AUTO_ROWS, NOW);
    expect(s.budget).not.toBeNull();
    const b = s.budget!;
    expect(b.period).toBe('monthly');
    expect(b.amount).toBe(250);
    // Scheduled rows count as used («impegnato»), like the Budget page's ceiling.
    expect(b.spent).toBe(260);
    expect(b.exceeded).toBe(true);
    expect(b.overBy).toBe(10);
    expect(b.calendarPct).toBeCloseTo((22 / 31) * 100, 6);
    expect(b.usedPct).toBeCloseTo(104, 6);
    // The crossing is on the instalment's day, after today: a «supererai» for the verdict.
    expect(b.crossedOn).toBe(28);
    expect(b.status).toBe('over');
  });

  it('reads an annual ceiling year-to-date, today on the year, projection at the app rule', () => {
    const s = summarizeCenter(center({ budgetAmount: 2500, budgetPeriod: 'annual' }), AUTO_ROWS, NOW);
    const b = s.budget!;
    expect(b.period).toBe('annual');
    expect(b.spent).toBe(880);
    expect(b.calendarPct).toBeCloseTo((234 / 365) * 100, 6);
    expect(b.projection).toBeCloseTo((830 / 234) * 365 + 50, 6);
    expect(b.exceeded).toBe(false);
    expect(b.remaining).toBe(1620);
    expect(b.crossedOn).toBeNull();
    expect(b.status).toBe('ok');
    expect(b.atRisk).toBe(false);
  });

  it('flags an annual ceiling at risk when the projection exceeds it and it is not over yet', () => {
    const s = summarizeCenter(center({ budgetAmount: 1000, budgetPeriod: 'annual' }), AUTO_ROWS, NOW);
    expect(s.budget!.exceeded).toBe(false);
    expect(s.budget!.atRisk).toBe(true);
  });

  it('splits fixed and one-off spending over the booked rows', () => {
    const s = summarizeCenter(center(), AUTO_ROWS, NOW);
    expect(s.recurring.recurring).toBe(620);
    expect(s.recurring.oneOff).toBe(690);
  });
});

// ─── The list ─────────────────────────────────────────────────────────────────

describe('summarizeCostCenters', () => {
  const rows = [
    { center: center({ id: 'auto', name: 'Automobile', budgetAmount: 250, budgetPeriod: 'monthly' as const }), expenses: AUTO_ROWS },
    { center: center({ id: 'casa', name: 'Casa al mare' }), expenses: [expense({ date: day('2026-06-10'), amount: -2000 }), expense({ date: day('2025-06-10'), amount: -500 })] },
    { center: center({ id: 'bici', name: 'Bici' }), expenses: [expense({ date: day('2026-04-24'), amount: -300 })] },
    { center: center({ id: 'trasloco', name: 'Trasloco', archivedAt: day('2025-01-10') }), expenses: [expense({ date: day('2024-05-01'), amount: -1800 })] },
    { center: center({ id: 'vuoto', name: 'Vuoto' }), expenses: [] },
  ];

  it('ranks the active centers by lifetime cost and measures shares on the active total', () => {
    const s = summarizeCostCenters(rows, NOW);
    expect(s.active.map((r) => r.summary.center.id)).toEqual(['casa', 'auto', 'bici', 'vuoto']);
    expect(s.total).toBe(2500 + 1310 + 300);
    expect(s.active[0].share).toBeCloseTo((2500 / 4110) * 100, 6);
    expect(s.active[0].rank).toBe(100);
    expect(s.active[1].rank).toBeCloseTo((1310 / 2500) * 100, 6);
    expect(s.count).toBe(8);
  });

  it('keeps the archived centers apart, with their own total', () => {
    const s = summarizeCostCenters(rows, NOW);
    expect(s.archived.map((r) => r.summary.center.id)).toEqual(['trasloco']);
    expect(s.archivedTotal).toBe(1800);
  });

  it('reads this year, last year and the trailing twelve months over the active centers', () => {
    const s = summarizeCostCenters(rows, NOW);
    expect(s.ytd).toBe(830 + 2000 + 300);
    expect(s.lastYear).toBe(380 + 500);
    // Sep 2025 → Aug 2026: Dec 380 + this year's 3130.
    expect(s.trailingTotal).toBe(380 + 3130);
    expect(s.trailingAverage).toBeCloseTo((380 + 3130) / 12, 6);
  });

  it('lists the dormant centers longest-idle first, the never-used ones last', () => {
    const s = summarizeCostCenters(rows, NOW);
    expect(s.dormant.map((r) => r.center.id)).toEqual(['bici', 'vuoto']);
    expect(s.dormant[0].idleDays).toBe(120);
  });

  it('separates the centers over their ceiling from those at risk', () => {
    const s = summarizeCostCenters(rows, NOW);
    expect(s.over.map((r) => r.center.id)).toEqual(['auto']);
    expect(s.atRisk).toEqual([]);
    expect(s.withBudget).toBe(1);
  });

  it('names the first expense across the active centers', () => {
    expect(summarizeCostCenters(rows, NOW).firstDate).toEqual(day('2023-03-14'));
    expect(summarizeCostCenters([], NOW).firstDate).toBeNull();
  });
});

// ─── The bars ─────────────────────────────────────────────────────────────────

describe('buildCenterMonthStack', () => {
  it('builds twelve gap-free months ending on the running one, stacked by center', () => {
    const s = summarizeCostCenters(
      [
        { center: center({ id: 'auto', name: 'Automobile', color: 'chart-1' }), expenses: AUTO_ROWS },
        { center: center({ id: 'casa', name: 'Casa al mare' }), expenses: [expense({ date: day('2026-06-10'), amount: -2000 })] },
        { center: center({ id: 'vuoto', name: 'Vuoto' }), expenses: [] },
      ],
      NOW,
    );
    const stack = buildCenterMonthStack(s.active, NOW, 12);
    expect(stack.months).toHaveLength(12);
    expect(stack.months[0].key).toBe('2025-09');
    expect(stack.months[11].key).toBe('2026-08');
    expect(stack.months[11].ongoing).toBe(true);
    expect(stack.months[10].ongoing).toBe(false);
    expect(stack.months[3].byCenter).toEqual({ auto: 380, casa: 0 });
    // The running month counts only what is booked: the instalment on the 28th is not spent.
    expect(stack.months[11].byCenter).toEqual({ auto: 210, casa: 0 });
    expect(stack.months[11].total).toBe(210);
    expect(stack.months[9].total).toBe(2000);
    // A center without spending in the window is not a series.
    expect(stack.centers.map((c) => c.id)).toEqual(['casa', 'auto']);
    expect(stack.centers[1].color).toBe('chart-1');
    expect(stack.months[0].label).toBe('Set');
  });
});
