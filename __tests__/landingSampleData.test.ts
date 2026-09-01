import { describe, it, expect } from 'vitest';
import { projectMonthEndSpending } from '@/lib/utils/spendingProjection';
import {
  SAMPLE_ASSET_CLASSES,
  SAMPLE_COVERAGE_RATIO,
  SAMPLE_DAYS_IN_MONTH,
  SAMPLE_DAY_OF_MONTH,
  SAMPLE_EXPENSE_STATS,
  SAMPLE_GOALS,
  SAMPLE_MARKET_MOVERS,
  SAMPLE_SAVINGS_RATE,
  SAMPLE_SPARKLINE,
  SAMPLE_TOTAL_VALUE,
  SAMPLE_VARIATIONS,
  SAMPLE_YEAR,
} from '@/lib/utils/landingSampleData';

/**
 * The landing shows the app's own tiles on an invented portfolio. The figures may be invented;
 * the arithmetic between them may not — a visitor who adds the classes and misses the total has
 * been shown a broken instrument, which is the one thing the landing is selling.
 */
describe('landing sample profile', () => {
  it('has classes that sum to the gross total', () => {
    const sum = SAMPLE_ASSET_CLASSES.reduce((total, entry) => total + entry.value, 0);
    expect(sum).toBe(SAMPLE_TOTAL_VALUE);
  });

  it('has class shares that sum to 100%', () => {
    const sum = SAMPLE_ASSET_CLASSES.reduce((total, entry) => total + entry.percentage, 0);
    expect(sum).toBeCloseTo(100, 6);
  });

  it('orders the classes largest first, so the composition reads as a ranking', () => {
    const values = SAMPLE_ASSET_CLASSES.map((entry) => entry.value);
    expect([...values].sort((a, b) => b - a)).toEqual(values);
  });

  it('measures the monthly variation on the last two snapshots', () => {
    const [previous, current] = SAMPLE_SPARKLINE.slice(-2);
    expect(SAMPLE_VARIATIONS.monthly.value).toBe(current.totalNetWorth - previous.totalNetWorth);
    expect(SAMPLE_VARIATIONS.monthly.percentage).toBeCloseTo(
      ((current.totalNetWorth - previous.totalNetWorth) / previous.totalNetWorth) * 100,
      9,
    );
  });

  it('measures the yearly variation from the previous December, as the payload does', () => {
    const december = SAMPLE_SPARKLINE.find((p) => p.month === 12 && p.year === SAMPLE_YEAR - 1)!;
    expect(SAMPLE_VARIATIONS.yearly.value).toBe(SAMPLE_TOTAL_VALUE - december.totalNetWorth);
  });

  it('ends the series on the total the hero prints', () => {
    expect(SAMPLE_SPARKLINE[SAMPLE_SPARKLINE.length - 1].totalNetWorth).toBe(SAMPLE_TOTAL_VALUE);
  });

  // The digest is the market's share of the month. Larger than the whole variation it would
  // imply negative contributions — a portfolio that lost money to its owner's deposits.
  it('keeps the market digest inside the monthly variation', () => {
    const market = SAMPLE_MARKET_MOVERS.reduce((total, mover) => total + mover.delta, 0);
    expect(market).toBeGreaterThan(0);
    expect(market).toBeLessThan(SAMPLE_VARIATIONS.monthly.value);
  });

  it('balances both cashflow months', () => {
    const { currentMonth, previousMonth } = SAMPLE_EXPENSE_STATS;
    expect(currentMonth.net).toBe(currentMonth.income - currentMonth.expenses);
    expect(previousMonth.net).toBe(previousMonth.income - previousMonth.expenses);
  });

  it('derives the savings rate and the coverage from those two figures', () => {
    const { income, expenses } = SAMPLE_EXPENSE_STATS.currentMonth;
    expect(SAMPLE_SAVINGS_RATE).toBeCloseTo(((income - expenses) / income) * 100, 9);
    expect(SAMPLE_COVERAGE_RATIO).toBeCloseTo(income / expenses, 9);
  });

  it('states the real change in spending as its delta', () => {
    const { currentMonth, previousMonth } = SAMPLE_EXPENSE_STATS;
    expect(SAMPLE_EXPENSE_STATS.delta.expenses).toBeCloseTo(
      ((currentMonth.expenses - previousMonth.expenses) / previousMonth.expenses) * 100,
      9,
    );
    expect(SAMPLE_EXPENSE_STATS.delta.expenses).toBeLessThan(0);
  });

  // The tile paints "Al ritmo attuale" with the positive token only when the projection lands
  // under last month. The sample must earn that colour at the app's own projection rule.
  it('projects a month-end below the previous month at the sample day', () => {
    const projected = projectMonthEndSpending(
      SAMPLE_EXPENSE_STATS.currentMonth.expenses,
      SAMPLE_DAY_OF_MONTH,
      SAMPLE_DAYS_IN_MONTH,
    );
    expect(projected).not.toBeNull();
    expect(projected!).toBeLessThan(SAMPLE_EXPENSE_STATS.previousMonth.expenses);
  });

  it('derives every goal progress from its own two figures', () => {
    for (const goal of SAMPLE_GOALS) {
      expect(goal.progressPercentage).toBeCloseTo((goal.currentValue / goal.targetAmount) * 100, 9);
      expect(goal.currentValue).toBeLessThan(goal.targetAmount);
    }
  });

  // A user-chosen hex would be the only literal colour on a page whose every other hue is a
  // theme token; the sample goals borrow chart slots instead.
  it('colours the goals with theme slots, never a literal hex', () => {
    for (const goal of SAMPLE_GOALS) {
      expect(goal.goalColor).toMatch(/^var\(--chart-\d\)$/);
    }
  });
});
