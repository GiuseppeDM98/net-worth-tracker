/**
 * couponScheduling.ts — the client upsert of a bond's next coupon.
 *
 * Pinned here: a zero-coupon bond (issue #340) saves its details but never POSTs a 0 € coupon,
 * while an ordinary bond still does. The pure math is couponUtils' (tested there); this suite only
 * proves the scheduler's gate and the payload it sends.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BondDetails } from '@/types/assets';

const authenticatedFetch = vi.fn();
vi.mock('@/lib/utils/authFetch', () => ({ authenticatedFetch: (...args: unknown[]) => authenticatedFetch(...args) }));

import { scheduleNextCoupon } from '@/lib/services/couponScheduling';

const BASE_PARAMS = { assetId: 'asset-1', quantity: 5000, currency: 'EUR', taxRate: 12.5, userId: 'owner-1' };

describe('scheduleNextCoupon', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 11, 12)); // 11/09/2026 noon
    authenticatedFetch.mockReset();
    authenticatedFetch.mockResolvedValue({ ok: true });
  });
  afterEach(() => vi.useRealTimers());

  it('does not materialise anything for a zero-coupon bond', async () => {
    const zeroCoupon: BondDetails = {
      couponRate: 0,
      couponFrequency: 'annual',
      issueDate: new Date(2026, 2, 1),
      maturityDate: new Date(2028, 2, 1),
    };
    const result = await scheduleNextCoupon({ ...BASE_PARAMS, bondDetails: zeroCoupon });
    expect(result).toEqual({ scheduled: false });
    expect(authenticatedFetch).not.toHaveBeenCalled();
  });

  it('posts the next coupon of an ordinary bond with a 1 € unit when the nominal is empty', async () => {
    const plain: BondDetails = {
      couponRate: 2.6,
      couponFrequency: 'quarterly',
      issueDate: new Date(2026, 2, 10),
      maturityDate: new Date(2032, 2, 10),
    };
    const result = await scheduleNextCoupon({ ...BASE_PARAMS, bondDetails: plain });
    expect(result.scheduled).toBe(true);
    expect(result.date).toEqual(new Date(2026, 11, 10));
    expect(authenticatedFetch).toHaveBeenCalledTimes(1);
    const body = JSON.parse(authenticatedFetch.mock.calls[0][1].body);
    // 2,6 % / 4 = 0,65 % of 1 € per unit → 32,50 € gross on 5.000 € nominal
    expect(body.dividendData.dividendPerShare).toBeCloseTo(0.0065, 10);
    expect(body.dividendData.grossAmount).toBeCloseTo(32.5, 8);
    expect(body.dividendData.isProvisional).toBe(false);
  });

  it('posts a BTP€i coupon as provisional at the latest known coefficient', async () => {
    const euro: BondDetails = {
      couponRate: 0.4,
      couponFrequency: 'semiannual',
      issueDate: new Date(2019, 10, 15),
      maturityDate: new Date(2030, 4, 15),
      inflationIndexation: 'euro',
      indexationCoefficients: [{ date: new Date(2026, 4, 15), coefficient: 1.25 }],
    };
    const result = await scheduleNextCoupon({ ...BASE_PARAMS, bondDetails: euro });
    expect(result.scheduled).toBe(true);
    expect(result.isProvisional).toBe(true);
    const body = JSON.parse(authenticatedFetch.mock.calls[0][1].body);
    expect(body.dividendData.dividendPerShare).toBeCloseTo(0.0025, 10);
    expect(body.dividendData.notes).toContain("all'ultimo coefficiente noto 1,25");
  });
});
