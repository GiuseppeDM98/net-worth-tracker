/**
 * Tests for lib/utils/periodSales.ts — the period's sales read from the trade ledger, and the ONE
 * decision on why a period fell that the three verdicts share.
 *
 * The main fixture is the owner's real September 2026: four sells of Vanguard FTSE All-World
 * (233 units at ~167,5 € against a 100,1119 € PMC) on which the broker withheld 4.092,50 € — the
 * snapshot note says so — while the estimate from the 26% rate lands at 4.088,86 €.
 */

import { describe, expect, it } from 'vitest';

import { resolveDeclineCause, summarizePeriodSales } from '@/lib/utils/periodSales';
import type { Asset } from '@/types/assets';
import type { AssetTransaction, AssetTransactionType } from '@/types/assetTransactions';

const SEPTEMBER = { start: new Date(2026, 8, 1, 0, 0, 0), end: new Date(2026, 8, 30, 23, 59, 59, 999) };

let seq = 0;
function tx(
  assetId: string,
  type: AssetTransactionType,
  date: Date,
  quantity: number,
  priceEur: number,
  fees?: number,
  isBaseline?: boolean,
): AssetTransaction {
  seq += 1;
  return {
    id: `t${seq}`,
    userId: 'u1',
    assetId,
    type,
    date,
    quantity,
    pricePerUnit: priceEur,
    priceEur,
    fees,
    isBaseline,
    createdAt: date,
    updatedAt: date,
  };
}

function asset(id: string, name: string, taxRate: number | undefined): Asset {
  return {
    id,
    userId: 'u1',
    ticker: '',
    name,
    type: 'etf',
    assetClass: 'equity',
    currency: 'EUR',
    quantity: 1,
    currentPrice: 1,
    taxRate,
    createdAt: new Date(2026, 0, 1),
    updatedAt: new Date(2026, 0, 1),
    lastPriceUpdate: new Date(2026, 0, 1),
  } as Asset;
}

const VWCE = asset('vwce', 'Vanguard FTSE All-World', 26);
const VWCE_LEDGER = [
  tx('vwce', 'buy', new Date(2026, 6, 22, 12), 740, 100.1119, undefined, true),
  tx('vwce', 'sell', new Date(2026, 8, 1, 12), 90, 167.64, 2.5),
  tx('vwce', 'sell', new Date(2026, 8, 1, 12), 2, 167.4, 1.5),
  tx('vwce', 'sell', new Date(2026, 8, 1, 12), 88, 167.35, 5),
  tx('vwce', 'sell', new Date(2026, 8, 7, 12), 53, 168.25, 5),
];

describe('summarizePeriodSales', () => {
  it('should sum the period sells of one instrument against the PMC at the sale, fees included', () => {
    const summary = summarizePeriodSales([VWCE], VWCE_LEDGER, SEPTEMBER)!;

    expect(summary.instruments).toHaveLength(1);
    expect(summary.proceeds).toBeCloseTo(39052.45, 2);
    expect(summary.realizedGain).toBeCloseTo(15726.38, 2);
    // 26% of the realized gain; the broker withheld 4.092,50 — the estimate is 3,64 € short.
    expect(summary.estimatedTax).toBeCloseTo(4088.86, 2);
    expect(summary.instruments[0]).toMatchObject({ id: 'vwce', name: 'Vanguard FTSE All-World' });
    expect(summary.brokenLedgers).toBe(0);
  });

  it('should ignore a sell outside the range but still let it move the PMC of a sell inside it', () => {
    const ledger = [
      tx('a', 'buy', new Date(2026, 6, 22, 12), 100, 100, undefined, true),
      tx('a', 'sell', new Date(2026, 7, 14, 12), 40, 150), // August — out of range
      tx('a', 'sell', new Date(2026, 8, 3, 12), 10, 160), // September
    ];
    const summary = summarizePeriodSales([asset('a', 'A', 26)], ledger, SEPTEMBER)!;

    expect(summary.instruments).toHaveLength(1);
    expect(summary.proceeds).toBe(1600);
    expect(summary.realizedGain).toBe(600);
    expect(summary.estimatedTax).toBeCloseTo(156, 6);
  });

  it('should return null when nothing was sold in the range', () => {
    const buysOnly = [tx('a', 'buy', new Date(2026, 8, 3, 12), 10, 100)];
    expect(summarizePeriodSales([asset('a', 'A', 26)], buysOnly, SEPTEMBER)).toBeNull();
    expect(summarizePeriodSales([VWCE], [], SEPTEMBER)).toBeNull();
    expect(summarizePeriodSales([VWCE], VWCE_LEDGER, { start: new Date(2026, 9, 1), end: new Date(2026, 9, 31) })).toBeNull();
  });

  it('should charge no tax on a realized loss', () => {
    const ledger = [
      tx('a', 'buy', new Date(2026, 6, 22, 12), 100, 100, undefined, true),
      tx('a', 'sell', new Date(2026, 8, 3, 12), 10, 80),
    ];
    const summary = summarizePeriodSales([asset('a', 'A', 26)], ledger, SEPTEMBER)!;
    expect(summary.realizedGain).toBe(-200);
    expect(summary.estimatedTax).toBe(0);
  });

  it('should leave the tax unknown, never zero, when a sold instrument has no rate', () => {
    const ledger = [
      ...VWCE_LEDGER,
      tx('b', 'buy', new Date(2026, 6, 22, 12), 10, 50, undefined, true),
      tx('b', 'sell', new Date(2026, 8, 3, 12), 10, 60),
    ];
    const summary = summarizePeriodSales([VWCE, asset('b', 'B', undefined)], ledger, SEPTEMBER)!;

    expect(summary.instruments.map((row) => row.id)).toEqual(['vwce', 'b']);
    expect(summary.instruments[1].estimatedTax).toBeNull();
    expect(summary.instruments[0].estimatedTax).toBeCloseTo(4088.86, 2);
    expect(summary.estimatedTax).toBeNull();
    expect(summary.realizedGain).toBeCloseTo(15726.38 + 100, 2);
  });

  it('should count a broken ledger and keep the others', () => {
    const ledger = [
      ...VWCE_LEDGER,
      // Over-sell: nothing bought before it — the replay refuses the ledger.
      tx('broken', 'sell', new Date(2026, 8, 3, 12), 10, 60),
    ];
    const summary = summarizePeriodSales([VWCE, asset('broken', 'Broken', 26)], ledger, SEPTEMBER)!;

    expect(summary.instruments.map((row) => row.id)).toEqual(['vwce']);
    expect(summary.brokenLedgers).toBe(1);
  });

  it('should list the instruments by proceeds, largest first, and label an unknown asset by its id', () => {
    const ledger = [
      tx('small', 'buy', new Date(2026, 6, 22, 12), 10, 10, undefined, true),
      tx('small', 'sell', new Date(2026, 8, 3, 12), 10, 12),
      tx('big', 'buy', new Date(2026, 6, 22, 12), 10, 100, undefined, true),
      tx('big', 'sell', new Date(2026, 8, 3, 12), 10, 120),
    ];
    const summary = summarizePeriodSales([asset('big', 'Big', 26)], ledger, SEPTEMBER)!;
    expect(summary.instruments.map((row) => row.name)).toEqual(['Big', 'small']);
    expect(summary.instruments[1].estimatedTax).toBeNull();
  });
});

describe('resolveDeclineCause', () => {
  it('should name the tax over the market when the estimated tax outweighs the market loss', () => {
    expect(resolveDeclineCause({ marketEffect: -1078.73, ownFlows: -3859.01, salesTax: 4088.86 })).toBe('taxes-over-market');
  });

  it('should name both when the market lost more than the tax', () => {
    expect(resolveDeclineCause({ marketEffect: -5000, ownFlows: -3859, salesTax: 4088.86 })).toBe('market-and-taxes');
  });

  it('should name the flows over the market when no tax explains them and they outweigh the market', () => {
    expect(resolveDeclineCause({ marketEffect: -1078.73, ownFlows: -3859.01, salesTax: null })).toBe('flows-over-market');
    expect(resolveDeclineCause({ marketEffect: -1078.73, ownFlows: -3859.01, salesTax: 0 })).toBe('flows-over-market');
  });

  it('should blame the market alone when it lost more than the flows, or when no flows are measured', () => {
    expect(resolveDeclineCause({ marketEffect: -2600, ownFlows: 500, salesTax: null })).toBe('market');
    expect(resolveDeclineCause({ marketEffect: -2600, ownFlows: -1000, salesTax: null })).toBe('market');
    expect(resolveDeclineCause({ marketEffect: -2600, ownFlows: null, salesTax: null })).toBe('market');
  });

  it('should never blame the market when it gained, whatever the tax', () => {
    expect(resolveDeclineCause({ marketEffect: 900, ownFlows: -3000, salesTax: 4088.86 })).toBe('despite-market');
    expect(resolveDeclineCause({ marketEffect: 0, ownFlows: -3000, salesTax: null })).toBe('despite-market');
  });

  it('should know nothing without a market effect', () => {
    expect(resolveDeclineCause({ marketEffect: null, ownFlows: null, salesTax: 4088.86 })).toBe('unknown');
  });
});
