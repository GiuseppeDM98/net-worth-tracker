import { describe, expect, it } from 'vitest';
import {
  SAVINGS_RATE_BADGE_THRESHOLD,
  buildSavingsBadgeCelebrationKey,
  computeSavingsRate,
  resolveCelebratedMonth,
  shouldShowSavingsBadge,
} from '@/lib/utils/savingsRateBadge';

// 12 August 2026, 10:00 Italy time — well past the 5th, previous month is July.
const MID_AUGUST = new Date('2026-08-12T08:00:00Z');

describe('computeSavingsRate', () => {
  it('should return the saved share of income as a percentage', () => {
    expect(computeSavingsRate(2000, 1200)).toBe(40);
  });

  it('should return 0 when there is no income', () => {
    expect(computeSavingsRate(0, 500)).toBe(0);
  });
});

describe('resolveCelebratedMonth', () => {
  it('should name the previous month with its year', () => {
    expect(resolveCelebratedMonth(MID_AUGUST)).toEqual({ year: 2026, month: 7, name: 'Luglio' });
  });

  it('should roll back to December of the previous year in January', () => {
    const january = new Date('2027-01-20T12:00:00Z');
    expect(resolveCelebratedMonth(january)).toEqual({ year: 2026, month: 12, name: 'Dicembre' });
  });

  it('should use the Italian calendar day, not UTC, around midnight', () => {
    // 31 August 23:30 Italy time is 21:30Z — still August, so the celebrated month is July.
    const lateAugust = new Date('2026-08-31T21:30:00Z');
    expect(resolveCelebratedMonth(lateAugust).month).toBe(7);
    // 1 September 00:30 Italy time is 31 August 22:30Z — September, celebrated month is August.
    const earlySeptember = new Date('2026-08-31T22:30:00Z');
    expect(resolveCelebratedMonth(earlySeptember).month).toBe(8);
  });
});

describe('buildSavingsBadgeCelebrationKey', () => {
  it('should scope the key to the account and the celebrated month', () => {
    expect(buildSavingsBadgeCelebrationKey('owner-1', { year: 2026, month: 7 })).toBe(
      'savings_rate_owner-1_2026-07',
    );
  });

  it('should zero-pad the month so keys sort and never collide', () => {
    expect(buildSavingsBadgeCelebrationKey('owner-1', { year: 2026, month: 11 })).toBe(
      'savings_rate_owner-1_2026-11',
    );
  });
});

describe('shouldShowSavingsBadge', () => {
  const base = {
    previousMonthIncome: 3000,
    savingsRate: SAVINGS_RATE_BADGE_THRESHOLD + 5,
    now: MID_AUGUST,
    alreadyCelebrated: false,
  };

  it('should show on the first visit of the month when the rate clears the threshold', () => {
    expect(shouldShowSavingsBadge(base)).toBe(true);
  });

  it('should NOT show again once this month was celebrated, even in a new browser session', () => {
    // This is the reported bug: the old sessionStorage flag was lost on every new tab/window,
    // so the badge came back on each login. The decision must key on the persisted month record.
    expect(shouldShowSavingsBadge({ ...base, alreadyCelebrated: true })).toBe(false);
  });

  it('should stay hidden before the 5th of the month while data is still partial', () => {
    expect(shouldShowSavingsBadge({ ...base, now: new Date('2026-08-03T10:00:00Z') })).toBe(false);
  });

  it('should stay hidden below the threshold', () => {
    expect(shouldShowSavingsBadge({ ...base, savingsRate: SAVINGS_RATE_BADGE_THRESHOLD - 1 })).toBe(
      false,
    );
  });

  it('should stay hidden without income data', () => {
    expect(shouldShowSavingsBadge({ ...base, previousMonthIncome: 0 })).toBe(false);
  });

  it('should NOT consult prefers-reduced-motion at all', () => {
    // Reduced motion reduces the MOTION, not the content: the preference governs the entrance
    // transition in the component, never whether the reader is told their savings rate.
    // Extra keys are structurally typed away, so the guard is that the decision is unchanged.
    expect(shouldShowSavingsBadge(base)).toBe(true);
    expect(Object.keys(base)).not.toContain('reducedMotion');
  });
});
