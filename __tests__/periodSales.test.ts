/**
 * Tests for lib/utils/periodSales.ts — the period's sales read from the trade ledger, and the ONE
 * decision on why a period fell that the three verdicts share.
 *
 * The main fixture is an invented ETF «Ornitorinco» taxed at 26%: an opening position of 100 units
 * at 100 € and two September sells with 5 € of fees each. Its realized gain is fee-free, its
 * estimated tax stands on the fiscal gain with both fees deducted (owner, 2026-11-12).
 */

import { describe, expect, it } from 'vitest';

import { isMaterialSalesTax, resolveDeclineCause, resolveTaxedGrowth, summarizePeriodSales } from '@/lib/utils/periodSales';
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

const ORNI = asset('orni', 'Ornitorinco', 26);
const ORNI_LEDGER = [
  tx('orni', 'buy', new Date(2026, 6, 22, 12), 100, 100, undefined, true),
  tx('orni', 'sell', new Date(2026, 8, 1, 12), 10, 150, 5),
  tx('orni', 'sell', new Date(2026, 8, 7, 12), 10, 160, 5),
];

describe('summarizePeriodSales', () => {
  it('should sum the period sells of one instrument: a fee-free gain, a tax on the fiscal gain', () => {
    const summary = summarizePeriodSales([ORNI], ORNI_LEDGER, SEPTEMBER)!;

    expect(summary.instruments).toHaveLength(1);
    expect(summary.proceeds).toBeCloseTo(3090, 9); // 1495 + 1595, net of fees
    expect(summary.realizedGain).toBeCloseTo(1100, 9); // 10 × 50 + 10 × 60: fee-free
    expect(summary.estimatedTax).toBeCloseTo(283.4, 9); // 26% × (1100 − 10 of sale fees)
    expect(summary.instruments[0]).toMatchObject({ id: 'orni', name: 'Ornitorinco' });
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
    const withheld = [100, 150];
    let index = 0;
    const ledger = ORNI_LEDGER.map((t) => (t.type === 'sell' ? { ...t, withheldTaxEur: withheld[index++] } : t));
    const summary = summarizePeriodSales([ORNI], ledger, SEPTEMBER)!;

    expect(summary.estimatedTax).toBeCloseTo(250, 6);
    expect(summary.taxIsWithheld).toBe(true);
    expect(summary.instruments[0].taxIsWithheld).toBe(true);
    // Realized P&L stays gross of the tax.
    expect(summary.realizedGain).toBeCloseTo(1100, 9);
  });

  it('should tax a sale on the fiscal gain, both fees deducted, while the realized gain stays fee-free', () => {
    const ledger = [
      tx('a', 'buy', new Date(2026, 6, 22, 12), 100, 100, 10), // 10 € of purchase fees: 0,10 € a unit
      tx('a', 'sell', new Date(2026, 8, 3, 12), 10, 150, 20),
    ];
    const summary = summarizePeriodSales([asset('a', 'A', 26)], ledger, SEPTEMBER)!;

    expect(summary.realizedGain).toBeCloseTo(500, 9); // 10 × (150 − 100)
    expect(summary.estimatedTax).toBeCloseTo(124.54, 9); // 26% × (1500 − 20 − 10 × 100,10) = 26% × 479
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
    expect(summarizePeriodSales([ORNI], [], SEPTEMBER)).toBeNull();
    expect(summarizePeriodSales([ORNI], ORNI_LEDGER, { start: new Date(2026, 9, 1), end: new Date(2026, 9, 31) })).toBeNull();
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
      ...ORNI_LEDGER,
      tx('b', 'buy', new Date(2026, 6, 22, 12), 10, 50, undefined, true),
      tx('b', 'sell', new Date(2026, 8, 3, 12), 10, 60),
    ];
    const summary = summarizePeriodSales([ORNI, asset('b', 'B', undefined)], ledger, SEPTEMBER)!;

    expect(summary.instruments.map((row) => row.id)).toEqual(['orni', 'b']);
    expect(summary.instruments[1].estimatedTax).toBeNull();
    expect(summary.instruments[0].estimatedTax).toBeCloseTo(283.4, 9);
    expect(summary.estimatedTax).toBeNull();
    expect(summary.realizedGain).toBeCloseTo(1100 + 100, 9);
  });

  it('should count a broken ledger and keep the others', () => {
    const ledger = [
      ...ORNI_LEDGER,
      // Over-sell: nothing bought before it — the replay refuses the ledger.
      tx('broken', 'sell', new Date(2026, 8, 3, 12), 10, 60),
    ];
    const summary = summarizePeriodSales([ORNI, asset('broken', 'Broken', 26)], ledger, SEPTEMBER)!;

    expect(summary.instruments.map((row) => row.id)).toEqual(['orni']);
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
    expect(resolveDeclineCause({ marketEffect: -1000, ownFlows: -4000, salesTax: 4000 })).toBe('taxes-over-market');
  });

  it('should name both when the market lost more than the tax', () => {
    expect(resolveDeclineCause({ marketEffect: -5000, ownFlows: -4000, salesTax: 4000 })).toBe('market-and-taxes');
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
    // +150 € of market, a 3.850 € drop, 4.000 € of tax.
    expect(resolveDeclineCause({ marketEffect: 150, ownFlows: -4000, salesTax: 4000 })).toBe('taxes-despite-market');
    // Exactly half still counts; a hair under does not.
    expect(resolveDeclineCause({ marketEffect: 0, ownFlows: -8000, salesTax: 4000 })).toBe('taxes-despite-market');
    expect(resolveDeclineCause({ marketEffect: 0, ownFlows: -8000, salesTax: 3999 })).toBe('despite-market');
  });

  it('should keep «despite-market» when the drop cannot be measured (the email passes no own flows)', () => {
    expect(resolveDeclineCause({ marketEffect: 900, ownFlows: null, salesTax: 4000 })).toBe('despite-market');
  });

  it('should know nothing without a market effect', () => {
    expect(resolveDeclineCause({ marketEffect: null, ownFlows: null, salesTax: 4000 })).toBe('unknown');
  });
});

describe('summarizePeriodSales — purchases', () => {
  it('should add up every buy of the period on any instrument, fees included, baselines excluded', () => {
    const ledger = [
      ...ORNI_LEDGER, // its buy is the migration baseline: not a purchase
      tx('btp', 'buy', new Date(2026, 8, 2, 12), 10, 1000, undefined, true), // a baseline written in September: still not a purchase
      tx('feni', 'buy', new Date(2026, 8, 1, 12), 10, 100),
      tx('gru', 'buy', new Date(2026, 8, 1, 12), 20, 50, 5),
      tx('airone', 'buy', new Date(2026, 8, 1, 12), 10, 200),
      tx('airone', 'buy', new Date(2026, 8, 7, 12), 5, 200),
      tx('airone', 'buy', new Date(2026, 7, 28, 12), 5, 200), // August — out of range
      tx('gru', 'adjustment', new Date(2026, 8, 1, 12), 40, 50), // moves no money
    ];
    const summary = summarizePeriodSales([ORNI], ledger, SEPTEMBER)!;

    // 1000 + (1000 + 5) + 2000 + 1000
    expect(summary.purchases?.amount).toBeCloseTo(5005, 9);
    expect(summary.purchases?.instrumentCount).toBe(3);
  });

  it('should say null, not zero, when nothing was bought beside the sale', () => {
    expect(summarizePeriodSales([ORNI], ORNI_LEDGER, SEPTEMBER)!.purchases).toBeNull();
  });
});

describe('resolveTaxedGrowth', () => {
  it('should call a month flat when the tax took the growth and less than half a percent is left', () => {
    // +120 € (+0,04%) with 4.000 € of estimated tax.
    expect(resolveTaxedGrowth({ delta: 120, deltaPct: 0.04, salesTax: 4000 })).toBe('flat');
  });

  it('should call it eroded when the tax took at least half but the growth is still visible', () => {
    expect(resolveTaxedGrowth({ delta: 3000, deltaPct: 1.02, salesTax: 4000 })).toBe('eroded');
    // Exactly half of the gross growth (tax = Δ) still counts; a hair under does not.
    expect(resolveTaxedGrowth({ delta: 4000, deltaPct: 1.3, salesTax: 4000 })).toBe('eroded');
    expect(resolveTaxedGrowth({ delta: 4000, deltaPct: 1.3, salesTax: 3999 })).toBeNull();
  });

  it('should say nothing on a falling month, without a taxed sale, or with an unknown tax', () => {
    expect(resolveTaxedGrowth({ delta: -10, deltaPct: -0.01, salesTax: 4000 })).toBeNull();
    expect(resolveTaxedGrowth({ delta: 120, deltaPct: 0.04, salesTax: 0 })).toBeNull();
    expect(resolveTaxedGrowth({ delta: 120, deltaPct: 0.04, salesTax: null })).toBeNull();
  });

  it('should treat a month at exactly zero as flat when a tax explains it', () => {
    expect(resolveTaxedGrowth({ delta: 0, deltaPct: 0, salesTax: 500 })).toBe('flat');
  });
});

// A tax worth less than max(100 €, 5% of the change) is noise, not a cause: the headline never names
// it (owner, 2026-11-16: 2 € withheld on a sale headed «il mercato ha pesato, e con lui le tasse»).
describe('isMaterialSalesTax and the headline causes', () => {
  it('should call a tax material from max(100 €, 5% of the change), never at zero or null', () => {
    expect(isMaterialSalesTax(2, -877)).toBe(false);
    expect(isMaterialSalesTax(99, -877)).toBe(false);
    expect(isMaterialSalesTax(100, -877)).toBe(true);
    expect(isMaterialSalesTax(900, -20000)).toBe(false);
    expect(isMaterialSalesTax(1000, -20000)).toBe(true);
    expect(isMaterialSalesTax(0, 0)).toBe(false);
    expect(isMaterialSalesTax(null, -877)).toBe(false);
  });

  it('should blame the market alone when the tax is immaterial', () => {
    // −877 € = −1941 € of market + 1064 € of own flows, 2 € withheld.
    expect(resolveDeclineCause({ marketEffect: -1941, ownFlows: 1064, salesTax: 2 })).toBe('market');
    // The email has no own-flows half: it passes the change itself.
    expect(resolveDeclineCause({ marketEffect: -20000, ownFlows: null, salesTax: 500, delta: -21000 })).toBe('market');
    expect(resolveDeclineCause({ marketEffect: -20000, ownFlows: null, salesTax: 1200, delta: -21000 })).toBe('market-and-taxes');
  });

  it('should keep the flows and the market gain readings when the tax is immaterial', () => {
    expect(resolveDeclineCause({ marketEffect: -100, ownFlows: -3000, salesTax: 50 })).toBe('flows-over-market');
    expect(resolveDeclineCause({ marketEffect: 10, ownFlows: -40, salesTax: 30 })).toBe('despite-market');
  });

  it('should not call a growth taken by an immaterial tax', () => {
    expect(resolveTaxedGrowth({ delta: 1, deltaPct: 0, salesTax: 2 })).toBeNull();
    expect(resolveTaxedGrowth({ delta: 1, deltaPct: 0, salesTax: 150 })).toBe('flat');
  });
});
