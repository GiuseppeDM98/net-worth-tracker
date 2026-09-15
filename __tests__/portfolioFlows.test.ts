/**
 * Tests for lib/utils/portfolioFlows.ts — the capital that crosses the boundary of the Rendimenti
 * base, measured per instrument: the ledger where the instrument is covered, the quantity changes
 * of `byAsset` otherwise. Pure: no Firebase, no clock. Every case is a euro figure a wrong branch
 * would move, and the two that matter most are the ones the original PR #319 got wrong or never
 * tested — a migration baseline read as a purchase, and a cash account inside the base.
 */

import { describe, it, expect } from 'vitest';
import { buildPortfolioBoundaryFlows, computeMonthlyPortfolioFlow, indexLedger } from '@/lib/utils/portfolioFlows';
import type { MonthlySnapshot } from '@/types/assets';
import type { AssetTransaction } from '@/types/assetTransactions';

function trade(assetId: string, type: AssetTransaction['type'], date: Date, quantity: number, priceEur: number, extra: Partial<AssetTransaction> = {}): AssetTransaction {
  return { id: `${assetId}-${date.toISOString()}-${quantity}`, userId: 'user-1', assetId, type, date, quantity, pricePerUnit: priceEur, priceEur, createdAt: date, updatedAt: date, ...extra };
}

type Position = { assetId: string; quantity: number; price: number };

function makeSnapshot(year: number, month: number, positions: Position[] | null): MonthlySnapshot {
  return {
    userId: 'user-1',
    year,
    month,
    totalNetWorth: (positions ?? []).reduce((sum, p) => sum + p.quantity * p.price, 0),
    liquidNetWorth: 0,
    illiquidNetWorth: 0,
    byAssetClass: {},
    byAsset: positions ? positions.map((p) => ({ assetId: p.assetId, ticker: p.assetId.toUpperCase(), name: p.assetId, quantity: p.quantity, price: p.price, totalValue: p.quantity * p.price })) : undefined,
    assetAllocation: {},
    createdAt: new Date(year, month - 1, 28),
  } as MonthlySnapshot;
}

const amountOf = (previous: MonthlySnapshot, current: MonthlySnapshot, excluded: string[] = [], ledger?: ReturnType<typeof indexLedger>, opaque: string[] = []) =>
  computeMonthlyPortfolioFlow(previous, current, new Set(excluded), ledger, new Set(opaque)).amount;

describe('computeMonthlyPortfolioFlow — the quantities', () => {
  const before = makeSnapshot(2026, 1, [{ assetId: 'etf', quantity: 100, price: 10 }]);

  it('reads a price move as no flow, a purchase at the month price, a sale as a negative flow', () => {
    expect(amountOf(before, makeSnapshot(2026, 2, [{ assetId: 'etf', quantity: 100, price: 12 }]))).toBe(0);
    expect(amountOf(before, makeSnapshot(2026, 2, [{ assetId: 'etf', quantity: 150, price: 12 }]))).toBe(600);
    expect(amountOf(before, makeSnapshot(2026, 2, [{ assetId: 'etf', quantity: 40, price: 10 }]))).toBe(-600);
  });

  it('values a position closed in the month at its last known price, and nets buys against sells', () => {
    expect(amountOf(before, makeSnapshot(2026, 2, []))).toBe(-1000);
    const two = makeSnapshot(2026, 1, [{ assetId: 'a', quantity: 100, price: 10 }, { assetId: 'b', quantity: 50, price: 20 }]);
    expect(amountOf(two, makeSnapshot(2026, 2, [{ assetId: 'a', quantity: 130, price: 10 }, { assetId: 'b', quantity: 40, price: 20 }]))).toBe(100);
  });

  it('counts a boundary crossing once, from the side inside the base', () => {
    // The cash account is OUT (the liquidity toggle): its balance drop is not a flow, the ETF's units are.
    const from = makeSnapshot(2026, 1, [{ assetId: 'etf', quantity: 100, price: 10 }, { assetId: 'conto', quantity: 5000, price: 1 }]);
    const to = makeSnapshot(2026, 2, [{ assetId: 'etf', quantity: 200, price: 10 }, { assetId: 'conto', quantity: 4000, price: 1 }]);
    expect(amountOf(from, to, ['conto'])).toBe(1000);
    // The cash account IN the base: its balance is money, the purchase nets to zero — nothing came from outside.
    expect(amountOf(from, to)).toBe(0);
    // A deposit on the account inside the base IS outside money.
    expect(amountOf(from, makeSnapshot(2026, 2, [{ assetId: 'etf', quantity: 100, price: 10 }, { assetId: 'conto', quantity: 5300, price: 1 }]))).toBe(300);
  });

  it('skips a flow-opaque instrument: a value that grows with the market is not a contribution', () => {
    const from = makeSnapshot(2026, 1, [{ assetId: 'etf', quantity: 100, price: 10 }, { assetId: 'fondo', quantity: 5000, price: 1 }]);
    const to = makeSnapshot(2026, 2, [{ assetId: 'etf', quantity: 120, price: 10 }, { assetId: 'fondo', quantity: 5400, price: 1 }]);
    expect(amountOf(from, to, [], undefined, ['fondo'])).toBe(200);
    // Without the mark the fund's 400 would vanish from the return.
    expect(amountOf(from, to)).toBe(600);
  });
});

describe('computeMonthlyPortfolioFlow — the ledger first, per instrument', () => {
  const january = makeSnapshot(2026, 1, [{ assetId: 'etf', quantity: 100, price: 10 }]);
  const february = makeSnapshot(2026, 2, [{ assetId: 'etf', quantity: 150, price: 12 }]);

  it('prefers the ledger where the instrument is covered, at the trade price, fees in', () => {
    // The quantities would say 50 × 12 = 600 (end-of-month price); the ledger says 50 × 11 = 550.
    expect(amountOf(january, february, [], indexLedger([trade('etf', 'buy', new Date(2026, 1, 14), 50, 11)]))).toBe(550);
    expect(amountOf(january, february, [], indexLedger([trade('etf', 'buy', new Date(2026, 1, 14), 50, 11, { fees: 9 })]))).toBe(559);
    const march = makeSnapshot(2026, 3, [{ assetId: 'etf', quantity: 100, price: 12 }]);
    expect(amountOf(february, march, [], indexLedger([trade('etf', 'sell', new Date(2026, 2, 10), 50, 11, { fees: 9 })]))).toBe(-541);
  });

  it('reads no trade in a covered month as a zero flow, never as a gap the quantities fill', () => {
    expect(amountOf(january, february, [], indexLedger([trade('etf', 'buy', new Date(2026, 0, 5), 100, 10)]))).toBe(0);
  });

  it('falls back to the quantities for an instrument the ledger never saw, and for the months before its first trade', () => {
    expect(amountOf(january, february, ['altro'], indexLedger([trade('altro', 'buy', new Date(2026, 1, 3), 1, 1)]))).toBe(600);
    expect(amountOf(january, february, [], indexLedger([trade('etf', 'buy', new Date(2026, 5, 1), 10, 12)]))).toBe(600);
  });

  it('mixes the two sources in one month, one per instrument, and says so', () => {
    const from = makeSnapshot(2026, 1, [{ assetId: 'vecchio', quantity: 200, price: 100 }]);
    const to = makeSnapshot(2026, 2, [{ assetId: 'nuovo', quantity: 300, price: 100 }]);
    const ledger = indexLedger([trade('nuovo', 'buy', new Date(2026, 1, 28), 300, 100)]);
    expect(computeMonthlyPortfolioFlow(from, to, new Set(), ledger)).toEqual({ amount: 10_000, source: 'mixed' });
    expect(computeMonthlyPortfolioFlow(january, february, new Set(), ledger).source).toBe('quantities');
    expect(computeMonthlyPortfolioFlow(january, february, new Set(), indexLedger([trade('etf', 'buy', new Date(2026, 1, 1), 1, 1)])).source).toBe('ledger');
  });

  it('covers the instrument from a baseline or an adjustment, but moves no money for either', () => {
    // A migration baseline is the OPENING POSITION dated to migration day: counted as a purchase it
    // would put the whole portfolio's cost into that month (−57% on the real account's July 2026).
    const baseline = indexLedger([trade('etf', 'buy', new Date(2026, 1, 3), 100, 10, { isBaseline: true })]);
    expect(baseline.coveredFrom.get('etf')).toBe('2026-02');
    expect(amountOf(january, february, [], baseline)).toBe(0);
    const adjusted = indexLedger([trade('etf', 'adjustment', new Date(2026, 0, 9), 100, 10)]);
    expect(adjusted.coveredFrom.get('etf')).toBe('2026-01');
    expect(amountOf(january, february, [], adjusted)).toBe(0);
    // A real trade after the baseline is money again.
    const traded = indexLedger([trade('etf', 'buy', new Date(2026, 1, 3), 100, 10, { isBaseline: true }), trade('etf', 'buy', new Date(2026, 1, 20), 50, 11)]);
    expect(amountOf(january, february, [], traded)).toBe(550);
  });
});

describe('computeMonthlyPortfolioFlow — the entry month (a trade dated before the base saw the instrument)', () => {
  // The user records in September the shares bought in March 2024, with their real date: the
  // snapshots meet the instrument for the first time in September (10 × 100 €).
  const august = makeSnapshot(2026, 8, [{ assetId: 'conto', quantity: 5000, price: 1 }]);
  const september = makeSnapshot(2026, 9, [{ assetId: 'conto', quantity: 5000, price: 1 }, { assetId: 'eni', quantity: 10, price: 100 }]);
  const backdated = indexLedger([trade('eni', 'buy', new Date(2024, 2, 15), 10, 80, { fees: 5 })]);

  it('reads the entry at its end-of-month value, not as a zero the ledger would swallow into the return', () => {
    // Before 2026-09-13 this was 0 (`ledger`): the whole 1.000 € read as September's return.
    expect(computeMonthlyPortfolioFlow(august, september, new Set(['conto']), backdated)).toEqual({ amount: 1000, source: 'quantities' });
    // With the account inside the base the instrument still enters at its value: the money that
    // bought it left the account in 2024, not this month.
    expect(amountOf(august, september, [], backdated)).toBe(1000);
  });

  it('keeps the ledger precision for a purchase dated in the entry month itself', () => {
    const sameMonth = indexLedger([trade('eni', 'buy', new Date(2026, 8, 10), 10, 80, { fees: 5 })]);
    expect(computeMonthlyPortfolioFlow(august, september, new Set(['conto']), sameMonth)).toEqual({ amount: 805, source: 'ledger' });
  });

  it('produces nothing for the backdated month itself: no snapshot pair holds the instrument', () => {
    const flows = buildPortfolioBoundaryFlows([makeSnapshot(2024, 2, [{ assetId: 'conto', quantity: 5000, price: 1 }]), makeSnapshot(2024, 3, [{ assetId: 'conto', quantity: 5000, price: 1 }]), august, september], ['conto'], [trade('eni', 'buy', new Date(2024, 2, 15), 10, 80, { fees: 5 })]);
    expect(flows.find((f) => f.month === '2024-03')).toEqual({ month: '2024-03', amount: 0, source: 'quantities' });
    expect(flows.find((f) => f.month === '2026-09')).toEqual({ month: '2026-09', amount: 1000, source: 'quantities' });
  });

  it('once the instrument is held, the ledger speaks again: a later month without a trade is a zero', () => {
    const october = makeSnapshot(2026, 10, [{ assetId: 'conto', quantity: 5000, price: 1 }, { assetId: 'eni', quantity: 10, price: 120 }]);
    expect(computeMonthlyPortfolioFlow(september, october, new Set(['conto']), backdated)).toEqual({ amount: 0, source: 'ledger' });
  });

  it('reads a baseline or an adjustment on an instrument the previous snapshot lacks as an entry too', () => {
    // An asset created in the migration month: the baseline covers it, but the base meets it now.
    const migrated = indexLedger([trade('eni', 'buy', new Date(2026, 8, 3), 10, 100, { isBaseline: true })]);
    expect(amountOf(august, september, ['conto'], migrated)).toBe(1000);
  });
});

describe('buildPortfolioBoundaryFlows', () => {
  it('emits one entry per MEASURABLE month, zeros included, and none for a pair missing a breakdown', () => {
    const flows = buildPortfolioBoundaryFlows([
      makeSnapshot(2026, 1, [{ assetId: 'etf', quantity: 100, price: 10 }]),
      makeSnapshot(2026, 2, [{ assetId: 'etf', quantity: 150, price: 10 }]),
      makeSnapshot(2026, 3, [{ assetId: 'etf', quantity: 150, price: 11 }]),
      makeSnapshot(2026, 4, null), // a hand-typed snapshot: no breakdown
      makeSnapshot(2026, 5, [{ assetId: 'etf', quantity: 200, price: 11 }]),
      makeSnapshot(2026, 6, [{ assetId: 'etf', quantity: 200, price: 11 }]),
    ], []);

    // (gen,feb) 500 · (feb,mar) measured at 0 · (mar,apr) and (apr,mag) not measurable · (mag,giu) 0.
    expect(flows).toEqual([
      { month: '2026-02', amount: 500, source: 'quantities' },
      { month: '2026-03', amount: 0, source: 'quantities' },
      { month: '2026-06', amount: 0, source: 'quantities' },
    ]);
  });

  it('sorts an unordered input and crosses a year boundary in the right order', () => {
    const december = makeSnapshot(2025, 12, [{ assetId: 'etf', quantity: 100, price: 10 }]);
    const january = makeSnapshot(2026, 1, [{ assetId: 'etf', quantity: 120, price: 10 }]);
    expect(buildPortfolioBoundaryFlows([january, december], [])).toEqual([{ month: '2026-01', amount: 200, source: 'quantities' }]);
  });
});
