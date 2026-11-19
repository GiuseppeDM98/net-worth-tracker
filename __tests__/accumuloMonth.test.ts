/**
 * Tests for lib/utils/accumuloMonth.ts — the slim module the Allocazione page reads on its first load
 * for the Piano's note: the month a plan buys in, the review-date check and what a reader outside the
 * tab may know of the active plan.
 */
import { describe, it, expect } from 'vitest';
import {
  countPlanInstalments,
  describeOpenPlanForAdvice,
  isInstalmentClosed,
  locateOpenMonth,
  isPlanReviewDue,
  planEndsAfterReview,
  summarizePacMonth,
  summarizePacMonthOn,
} from '@/lib/utils/accumuloMonth';
import type { AccumulationPlan, InstallmentLine } from '@/types/accumulationPlan';

function line(positionId: string, amount: number, status: InstallmentLine['status'] = 'planned'): InstallmentLine {
  return { positionId, assetId: positionId, plannedQuantity: 10, priceEurAtPlan: amount / 10, plannedAmountEur: amount, status };
}

/** Four instalments from 2027-01, each buying 500 € of «a» and 250 € of «b». */
function activePlan(overrides: Partial<AccumulationPlan> = {}): AccumulationPlan {
  const months = ['2027-01', '2027-02', '2027-03', '2027-04'];
  return {
    id: 'p',
    userId: 'u',
    name: 'Piano',
    status: 'active',
    startMonth: '2027-01',
    months: 4,
    liquidity: { sourceCashAssetIds: [], reserveEur: 0, monthlyInflowEur: 0 },
    positions: [
      { id: 'a', label: 'ETF A', targetPercentage: 60, memberAssetIds: ['etf-a'], buyAssetId: 'etf-a' },
      { id: 'b', label: 'ETF B', targetPercentage: 40, memberAssetIds: ['etf-b'], buyAssetId: 'etf-b' },
    ],
    disposals: [],
    installments: months.map((month, k) => ({ index: k + 1, month, lines: [line('a', 500), line('b', 250)], carryInEur: {} })),
    createdAt: new Date('2026-12-01T12:00:00'),
    updatedAt: new Date('2026-12-01T12:00:00'),
    ...overrides,
  } as AccumulationPlan;
}

// The page's Piano note loads this module on demand and passes the Italian day (2026-11-17): the
// month index is derived here, so the page's first chunk carries none of the plan's month arithmetic.
describe('summarizePacMonthOn', () => {
  // Seen red with the index taken from the start month (always 1): March read as January.
  it('reads the month of the given Italian day', () => {
    const plan = activePlan();
    expect(summarizePacMonthOn(plan, '2027-03-15')?.monthLabel).toBe('marzo');
    expect(summarizePacMonthOn(plan, '2027-01-01')?.monthLabel).toBe('gennaio');
  });
  it('is null before the plan starts and after it ends', () => {
    const plan = activePlan();
    expect(summarizePacMonthOn(plan, '2026-12-31')).toBeNull();
    expect(summarizePacMonthOn(plan, '2027-05-01')).toBeNull();
  });
  it('is null without a plan', () => {
    expect(summarizePacMonthOn(undefined, '2027-01-15')).toBeNull();
  });
});

describe('summarizePacMonth', () => {
  // Seen red with the `currentIndex < 1` guard dropped: index 0 read instalment 1 as «questo mese».
  it('is null before the first month and after the last one', () => {
    const plan = activePlan();
    expect(summarizePacMonth(plan, 0)).toBeNull();
    expect(summarizePacMonth(plan, 5)).toBeNull();
  });

  it('summarizes the first and the last month', () => {
    const plan = activePlan();
    expect(summarizePacMonth(plan, 1)).toEqual({ monthTotalEur: 750, instrumentCount: 2, monthLabel: 'gennaio', allClosed: false });
    expect(summarizePacMonth(plan, 4)).toEqual({ monthTotalEur: 750, instrumentCount: 2, monthLabel: 'aprile', allClosed: false });
  });

  it('is null for a draft', () => {
    expect(summarizePacMonth(activePlan({ status: 'draft' }), 1)).toBeNull();
  });

  it('rounds the month total to the cent', () => {
    const plan = activePlan();
    plan.installments[0].lines = [line('a', 0.1), line('b', 0.2)];
    expect(summarizePacMonth(plan, 1)?.monthTotalEur).toBe(0.3);
  });
});

describe('planEndsAfterReview', () => {
  // Seen red comparing `startMonth` instead of the last month (2027-01 < 2027-06 read false for 2028-01).
  it('compares the plan’s last month with the review month', () => {
    const plan = { startMonth: '2027-01', months: 12 };
    expect(planEndsAfterReview(plan, '2027-06-30')).toBe(true);
    expect(planEndsAfterReview(plan, '2028-01-15')).toBe(false);
    expect(planEndsAfterReview(plan, null)).toBe(false);
  });

  it('a plan ending in the review month does not end after it', () => {
    expect(planEndsAfterReview({ startMonth: '2027-01', months: 6 }, '2027-06-30')).toBe(false);
  });
});

describe('describeOpenPlanForAdvice', () => {
  const nameOf = (id: string) => id.toUpperCase();

  it('is null unless the plan is active', () => {
    expect(describeOpenPlanForAdvice(undefined, '2027-02', nameOf)).toBeNull();
    expect(describeOpenPlanForAdvice(activePlan({ status: 'draft' }), '2027-02', nameOf)).toBeNull();
  });

  it('names the month, the instalment and the buys', () => {
    const plan = activePlan();
    plan.installments[1].lines = [{ ...line('a', 500, 'executed'), executedAmountEur: 490 }, line('b', 250, 'skipped')];
    expect(describeOpenPlanForAdvice(plan, '2027-02', nameOf)).toEqual({
      monthIndex: 2,
      months: 4,
      instalmentEur: 490,
      startMonth: '2027-01',
      endMonth: '2027-04',
      buys: [
        { assetId: 'etf-a', name: 'ETF-A', targetPercentage: 60 },
        { assetId: 'etf-b', name: 'ETF-B', targetPercentage: 40 },
      ],
      sells: [],
    });
  });

  it('before the start reads the first instalment at month 0', () => {
    const advice = describeOpenPlanForAdvice(activePlan(), '2026-12', nameOf);
    expect(advice?.monthIndex).toBe(0);
    expect(advice?.instalmentEur).toBe(750);
  });
});

// A month that buys nothing (the reserve refilling) gives the Piano no note (2026-11-17).
// Seen red reading «la rata di gennaio … è chiusa».
describe('summarizePacMonth — a month with no line', () => {
  it('is null', () => {
    const plan = { ...activePlan(), installments: activePlan().installments.map((i) => (i.index === 1 ? { ...i, lines: [] } : i)) };
    expect(summarizePacMonth(plan, 1)).toBeNull();
  });
});

// The months that only refill the reserve are not instalments: «0 di 2 rate chiuse», never «2 di 4».
// Seen red counting an empty month as closed (collaudo, 2026-11-17).
describe('countPlanInstalments', () => {
  it('counts only the months that buy', () => {
    const plan = activePlan({
      installments: [
        { index: 1, month: '2027-01', lines: [], carryInEur: {} },
        { index: 2, month: '2027-02', lines: [], carryInEur: {} },
        { index: 3, month: '2027-03', lines: [line('a', 500, 'executed')], carryInEur: {} },
        { index: 4, month: '2027-04', lines: [line('a', 500)], carryInEur: {} },
      ],
    });
    expect(countPlanInstalments(plan)).toEqual({ closed: 1, total: 2 });
  });
});

// The month the Consulente asked to look at the plan again (2026-11-19). Mutation that turns it red: the revisions
// clause dropped.
describe('isPlanReviewDue', () => {
  const withReview = (overrides: Partial<AccumulationPlan> = {}) => activePlan({ reviewMonthIndex: 3, ...overrides });

  it('true only at the review month of an active plan', () => {
    expect(isPlanReviewDue(withReview(), 3, '2027-03')).toBe(true);
    expect(isPlanReviewDue(withReview(), 2, '2027-02')).toBe(false);
    expect(isPlanReviewDue(withReview(), 4, '2027-04')).toBe(false);
    expect(isPlanReviewDue(withReview({ status: 'draft' }), 3, '2027-03')).toBe(false);
    expect(isPlanReviewDue(activePlan(), 3, '2027-03')).toBe(false);
  });

  it('false once a revision was saved in that month', () => {
    const revised = withReview({ revisions: [{ at: new Date('2027-03-10T12:00:00'), fromIndex: 3 }] as never });
    expect(isPlanReviewDue(revised, 3, '2027-03')).toBe(false);
    const revisedBefore = withReview({ revisions: [{ at: new Date('2027-02-10T12:00:00'), fromIndex: 2 }] as never });
    expect(isPlanReviewDue(revisedBefore, 3, '2027-03')).toBe(true);
  });

  it('false when the review month is past the plan', () => {
    expect(isPlanReviewDue(withReview({ reviewMonthIndex: 5 }), 5, '2027-05')).toBe(false);
  });
});


// The open month among the instalments (owner, 2026-11-19): «rata k di n» over the months that buy; a month with
// no line only refills the reserve and is never closed. Mutation that turns it red: the ordinal read from the index.
describe('locateOpenMonth and isInstalmentClosed', () => {
  const plan = activePlan({
    months: 4,
    installments: [
      { index: 1, month: '2027-01', lines: [], carryInEur: {} },
      { index: 2, month: '2027-02', lines: [], carryInEur: {} },
      { index: 3, month: '2027-03', lines: [line('a', 500, 'executed')], carryInEur: {} },
      { index: 4, month: '2027-04', lines: [line('a', 500)], carryInEur: {} },
    ],
  });
  it('a refill month points at the first instalment', () => {
    expect(locateOpenMonth(plan, 0)).toEqual({ kind: 'refill', firstBuyingMonth: '2027-03' });
    expect(locateOpenMonth(plan, 2)).toEqual({ kind: 'refill', firstBuyingMonth: '2027-03' });
  });
  it('a buying month is its place among the months that buy', () => {
    expect(locateOpenMonth(plan, 4)).toEqual({ kind: 'instalment', ordinal: 2, total: 2 });
    expect(locateOpenMonth(plan, 9)).toEqual({ kind: 'instalment', ordinal: 2, total: 2 });
  });
  it('an empty month is never closed', () => {
    expect(plan.installments.map(isInstalmentClosed)).toEqual([false, false, true, false]);
  });
});
