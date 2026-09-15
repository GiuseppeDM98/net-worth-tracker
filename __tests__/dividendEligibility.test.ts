import { describe, it, expect } from 'vitest';
import { isDividendEligible, resolveDividendFloor } from '@/lib/utils/dividendEligibility';

const CREATED = new Date(2026, 8, 10, 12); // 10 Sep 2026 — the asset was added to the app
const HOLDING = new Date(2024, 2, 5, 12); // 5 Mar 2024 — the ledger's first real BUY

describe('resolveDividendFloor', () => {
  it('uses the holding start when the ledger knows it', () => {
    expect(resolveDividendFloor({ holdingStartDate: HOLDING, createdAt: CREATED })).toEqual({ date: HOLDING, source: 'holdingStart' });
  });

  it('falls back to the creation date for a baseline-only asset', () => {
    expect(resolveDividendFloor({ createdAt: CREATED })).toEqual({ date: CREATED, source: 'created' });
  });
});

describe('isDividendEligible', () => {
  it('admits a historical ex-date once the purchase is recorded with its real date', () => {
    const exDate = new Date(2025, 4, 19, 12);
    // Falsified on 2026-09-13: with the creation date alone this dividend was dropped.
    expect(isDividendEligible(exDate, { createdAt: CREATED })).toBe(false);
    expect(isDividendEligible(exDate, { holdingStartDate: HOLDING, createdAt: CREATED })).toBe(true);
  });

  it('keeps the floor inclusive on its own day', () => {
    expect(isDividendEligible(new Date(2024, 2, 5, 0, 30), { holdingStartDate: HOLDING, createdAt: CREATED })).toBe(true);
    expect(isDividendEligible(new Date(2024, 2, 4, 23, 30), { holdingStartDate: HOLDING, createdAt: CREATED })).toBe(false);
  });
});
