/**
 * Tests for lib/utils/periodSales.ts — the period's sales read from the trade ledger, and the ONE
 * decision on why a period fell that the three verdicts share.
 *
 * The main fixture is the owner's real September 2026: four sells of Vanguard FTSE All-World
 * (233 units at ~167,5 € against a 100,1119 € PMC) on which the broker withheld 4.092,50 € — the
 * snapshot note says so — and the estimate lands on it to the cent once the 26% is applied to the
 * gain GROSS of the sells' 14 € of fees, as the broker does (on the net gain it said 4.088,86 €).
 */

import { describe, expect, it } from 'vitest';

import { resolveDeclineCause, resolveTaxedGrowth, summarizePeriodSales } from '@/lib/utils/periodSales';
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
    // 26% of the TAXABLE gain (15.726,38 + 14 € of sale fees): the 4.092,50 € on the statement.
    // The realized gain above stays net of fees — only the tax base is gross of them.
    expect(summary.estimatedTax).toBeCloseTo(4092.5, 2);
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

  it('should read the tax the broker withheld in place of the estimate, and say the figure is a fact', () => {
    // The statement's 4.092,50 € typed sell by sell (its split across the four sells is invented).
    const withheld = [1580.2, 35.1, 1540.3, 936.9];
    let index = 0;
    const ledger = VWCE_LEDGER.map((t) => (t.type === 'sell' ? { ...t, withheldTaxEur: withheld[index++] } : t));
    const summary = summarizePeriodSales([VWCE], ledger, SEPTEMBER)!;

    expect(summary.estimatedTax).toBeCloseTo(4092.5, 6);
    expect(summary.taxIsWithheld).toBe(true);
    expect(summary.instruments[0].taxIsWithheld).toBe(true);
    // Realized P&L stays gross of the tax.
    expect(summary.realizedGain).toBeCloseTo(15726.38, 2);
  });

  it('should tax a sale on the price difference alone, while the realized gain stays net of every fee', () => {
    const ledger = [
      tx('a', 'buy', new Date(2026, 6, 22, 12), 100, 100, 10), // 10 € of purchase fees: 0,10 € a unit
      tx('a', 'sell', new Date(2026, 8, 3, 12), 10, 150, 20),
    ];
    const summary = summarizePeriodSales([asset('a', 'A', 26)], ledger, SEPTEMBER)!;

    expect(summary.realizedGain).toBeCloseTo(479, 9); // 1500 − 20 − 10 × 100,10
    expect(summary.estimatedTax).toBeCloseTo(130, 9); // 26% × 10 × (150 − 100)
  });

  it('should estimate only the sells that carry no withheld tax, and call the mix an estimate', () => {
    const ledger = [
      tx('a', 'buy', new Date(2026, 6, 22, 12), 100, 100, undefined, true),
      { ...tx('a', 'sell', new Date(2026, 8, 3, 12), 10, 160), withheldTaxEur: 150 }, // gain 600, statement 150
      tx('a', 'sell', new Date(2026, 8, 9, 12), 10, 200), // gain 1000 → 260 estimated
    ];
    const summary = summarizePeriodSales([asset('a', 'A', 26)], ledger, SEPTEMBER)!;

    expect(summary.estimatedTax).toBeCloseTo(410, 6);
    expect(summary.taxIsWithheld).toBe(false);
  });

  it('should know the tax of an instrument with no rate once every sell carries its own, 0 included', () => {
    const ledger = [
      tx('a', 'buy', new Date(2026, 6, 22, 12), 100, 100, undefined, true),
      { ...tx('a', 'sell', new Date(2026, 8, 3, 12), 10, 160), withheldTaxEur: 0 }, // offset by past losses
    ];
    const summary = summarizePeriodSales([asset('a', 'A', undefined)], ledger, SEPTEMBER)!;

    expect(summary.estimatedTax).toBe(0);
    expect(summary.taxIsWithheld).toBe(true);
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
    expect(summary.instruments[0].estimatedTax).toBeCloseTo(4092.5, 2);
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
    expect(resolveDeclineCause({ marketEffect: 0, ownFlows: -3000, salesTax: null })).toBe('despite-market');
    // A tax below half of the drop is not the story: the own flows are.
    expect(resolveDeclineCause({ marketEffect: 900, ownFlows: -9000, salesTax: 4000 })).toBe('despite-market');
  });

  it('should name the tax when the market gained and the tax is at least half of the drop', () => {
    // The real account, settembre 2026: +153 € of market, a 4.156 € drop, 4.089 € withheld.
    expect(resolveDeclineCause({ marketEffect: 153, ownFlows: -4308.63, salesTax: 4088.86 })).toBe('taxes-despite-market');
    // Exactly half still counts; a hair under does not.
    expect(resolveDeclineCause({ marketEffect: 0, ownFlows: -8000, salesTax: 4000 })).toBe('taxes-despite-market');
    expect(resolveDeclineCause({ marketEffect: 0, ownFlows: -8000, salesTax: 3999 })).toBe('despite-market');
  });

  it('should keep «despite-market» when the drop cannot be measured (the email passes no own flows)', () => {
    expect(resolveDeclineCause({ marketEffect: 900, ownFlows: null, salesTax: 4088.86 })).toBe('despite-market');
  });

  it('should know nothing without a market effect', () => {
    expect(resolveDeclineCause({ marketEffect: null, ownFlows: null, salesTax: 4088.86 })).toBe('unknown');
  });
});

describe('summarizePeriodSales — purchases', () => {
  it('should add up every buy of the period on any instrument, fees included, baselines excluded', () => {
    const ledger = [
      ...VWCE_LEDGER, // its buy is the migration baseline: not a purchase
      tx('btp', 'buy', new Date(2026, 8, 2, 12), 10, 981.6, undefined, true), // a baseline written in September: still not a purchase
      tx('wbit', 'buy', new Date(2026, 8, 1, 12), 123, 16.23),
      tx('ceth', 'buy', new Date(2026, 8, 1, 12), 23, 64.795, 9.5),
      tx('xeon', 'buy', new Date(2026, 8, 1, 12), 93, 150.0519),
      tx('xeon', 'buy', new Date(2026, 8, 7, 12), 22, 150.1239),
      tx('xeon', 'buy', new Date(2026, 7, 28, 12), 5, 150), // August — out of range
      tx('ceth', 'adjustment', new Date(2026, 8, 1, 12), 67, 65.7882), // moves no money
    ];
    const summary = summarizePeriodSales([VWCE], ledger, SEPTEMBER)!;

    // 1996,29 + (1490,285 + 9,5) + 13954,8267 + 3302,7258
    expect(summary.purchases?.amount).toBeCloseTo(20753.6275, 4);
    expect(summary.purchases?.instrumentCount).toBe(3);
  });

  it('should say null, not zero, when nothing was bought beside the sale', () => {
    expect(summarizePeriodSales([VWCE], VWCE_LEDGER, SEPTEMBER)!.purchases).toBeNull();
  });
});

describe('resolveTaxedGrowth', () => {
  it('should call a month flat when the tax took the growth and less than half a percent is left', () => {
    // The real account, settembre 2026: +124,32 € (+0,04%) with 4088,86 € of estimated tax.
    expect(resolveTaxedGrowth({ delta: 124.32, deltaPct: 0.04, salesTax: 4088.86 })).toBe('flat');
  });

  it('should call it eroded when the tax took at least half but the growth is still visible', () => {
    expect(resolveTaxedGrowth({ delta: 3000, deltaPct: 1.02, salesTax: 4088.86 })).toBe('eroded');
    // Exactly half of the gross growth (tax = Δ) still counts; a hair under does not.
    expect(resolveTaxedGrowth({ delta: 4000, deltaPct: 1.3, salesTax: 4000 })).toBe('eroded');
    expect(resolveTaxedGrowth({ delta: 4000, deltaPct: 1.3, salesTax: 3999 })).toBeNull();
  });

  it('should say nothing on a falling month, without a taxed sale, or with an unknown tax', () => {
    expect(resolveTaxedGrowth({ delta: -10, deltaPct: -0.01, salesTax: 4088.86 })).toBeNull();
    expect(resolveTaxedGrowth({ delta: 124.32, deltaPct: 0.04, salesTax: 0 })).toBeNull();
    expect(resolveTaxedGrowth({ delta: 124.32, deltaPct: 0.04, salesTax: null })).toBeNull();
  });

  it('should treat a month at exactly zero as flat when a tax explains it', () => {
    expect(resolveTaxedGrowth({ delta: 0, deltaPct: 0, salesTax: 500 })).toBe('flat');
  });
});
