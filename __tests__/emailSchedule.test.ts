/**
 * The periodic emails' schedule: what is due on an Italian day, and whether a period may be taken.
 *
 * A month's email leaves on the 1st of the next month (catch-up on the 2nd and 3rd), the yearly on
 * 1 January beside December's monthly; a «sent» period is never taken again, a «sending» one only
 * once its claim is stale.
 */
import { describe, expect, it } from 'vitest';
import {
  EMAIL_CLAIM_STALE_MS,
  canClaimDelivery,
  emailDeliveryId,
  emailsDueOn,
  lastClosedMonth,
  lastClosedYear,
} from '@/lib/utils/emailSchedule';

describe('emailsDueOn', () => {
  it('sends October on 1 November', () => {
    expect(emailsDueOn('2026-11-01')).toEqual([{ kind: 'monthly', year: 2026, month: 10, periodKey: '2026-10' }]);
  });

  it('still sends October on 3 November (the catch-up window)', () => {
    expect(emailsDueOn('2026-11-03')).toEqual([{ kind: 'monthly', year: 2026, month: 10, periodKey: '2026-10' }]);
  });

  it('sends nothing on 4 November', () => {
    expect(emailsDueOn('2026-11-04')).toEqual([]);
  });

  it('sends December 2026 and then the year 2026 on 1 January 2027', () => {
    expect(emailsDueOn('2027-01-01')).toEqual([
      { kind: 'monthly', year: 2026, month: 12, periodKey: '2026-12' },
      { kind: 'yearly', year: 2026, month: 12, periodKey: '2026' },
    ]);
  });

  it('sends nothing on the last day of a month (31 October)', () => {
    expect(emailsDueOn('2026-10-31')).toEqual([]);
  });
});

describe('lastClosedMonth / lastClosedYear', () => {
  it('names the month and the year that ended before the day', () => {
    expect(lastClosedMonth('2026-11-15')).toEqual({ year: 2026, month: 10 });
    expect(lastClosedMonth('2027-01-15')).toEqual({ year: 2026, month: 12 });
    expect(lastClosedYear('2026-11-15')).toBe(2025);
  });
});

describe('canClaimDelivery', () => {
  const now = Date.UTC(2026, 10, 1, 19, 0, 0);

  it('lets a run take a period with no record', () => {
    expect(canClaimDelivery(null, now)).toBe(true);
  });

  it('never lets a run take a period already sent, even with a claim two hours old', () => {
    expect(canClaimDelivery({ status: 'sent', claimedAtMs: now - 2 * 60 * 60 * 1000 }, now)).toBe(false);
  });

  it('refuses a claim taken 10 minutes ago', () => {
    expect(canClaimDelivery({ status: 'sending', claimedAtMs: now - 10 * 60 * 1000 }, now)).toBe(false);
  });

  it('takes again a claim left 31 minutes ago (a run that died)', () => {
    expect(canClaimDelivery({ status: 'sending', claimedAtMs: now - 31 * 60 * 1000 }, now)).toBe(true);
    expect(EMAIL_CLAIM_STALE_MS).toBe(30 * 60 * 1000);
  });
});

describe('emailDeliveryId', () => {
  it('joins the account, the kind and the period', () => {
    expect(emailDeliveryId('user-a', 'monthly', '2026-10')).toBe('user-a_monthly_2026-10');
  });
});
