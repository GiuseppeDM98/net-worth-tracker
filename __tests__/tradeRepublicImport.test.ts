/**
 * The pure Trade Republic layer: the three topic payloads in, an import plan out.
 *
 * Every fixture here is a REAL `compactPortfolioByType` / `cash` / `savingsPlans` shape taken from
 * the SDK's arktype schemas, not a shape invented for the test — a parser that only ever sees a
 * friendly fixture is a parser that has never met the broker.
 */

import { describe, expect, it } from 'vitest';
import {
  applyTrTickerOverride,
  buildTrImportPlan,
  mapTrHoldingToAssetFormData,
  mapTrType,
  parseTrCash,
  parseTrHoldings,
  parseTrSavingsPlans,
  resolveTrYahooTicker,
  TrParseError,
  TR_CASH_TICKER,
  type TrHoldingInput,
} from '@/lib/utils/tradeRepublicImport';

const PORTFOLIO = {
  categories: [
    {
      categoryType: 'etf',
      positions: [
        {
          isin: 'IE00B4L5Y983',
          averageBuyIn: '112,44',
          netSize: '12,5',
          virtualSize: '12,5',
          status: 'active',
          instrumentType: 'etf',
          name: 'iShares Core MSCI World',
          derivativeInfo: null,
          bondInfo: null,
          imageId: 'img-1',
        },
      ],
    },
    {
      categoryType: 'stock',
      positions: [
        {
          isin: 'US0378331005',
          averageBuyIn: '180.10',
          netSize: '3',
          virtualSize: '3',
          status: 'active',
          instrumentType: 'stock',
          name: 'Apple',
          derivativeInfo: null,
          bondInfo: null,
          imageId: 'img-2',
        },
      ],
    },
  ],
};

const CASH = [{ accountNumber: 'DE123', currencyId: 'EUR', amount: 1234.56 }];

const SAVINGS_PLANS = {
  savingsPlans: [
    {
      id: '3f1b0a52-8c4d-4a1e-9b77-0f2d5e6a7c81',
      createdAt: 1750000000000,
      instrumentId: 'IE00B4L5Y983.HAM',
      amount: 20000,
      interval: 'monthly',
      startDate: { type: 'x', value: 1, nextExecutionDate: '2026-10-01' },
      firstExecutionDate: null,
      nextExecutionDate: '2026-10-01',
      previousExecutionDate: '2026-09-01',
      virtualPreviousExecutionDate: '2026-09-01',
      finalExecutionDate: null,
      paymentMethodId: null,
      paymentMethodCode: null,
      lastPaymentExecutionDate: null,
      paused: false,
      fundingCashAccNo: 'DE123',
      secAccNo: 'DE999',
    },
  ],
};

describe('parseTrHoldings', () => {
  it('reads the positions and the German decimals out of the categories envelope', () => {
    const { holdings, skipped } = parseTrHoldings(PORTFOLIO);
    expect(skipped).toBe(0);
    expect(holdings).toHaveLength(2);
    // The German comma is the payload's own convention: `parseFloat` alone would read 112,44 as 112.
    expect(holdings[0]).toMatchObject({
      isin: 'IE00B4L5Y983',
      quantity: 12.5,
      averageCost: 112.44,
      rawType: 'etf',
      rawCategory: 'etf',
    });
    expect(holdings[1]).toMatchObject({ isin: 'US0378331005', quantity: 3, rawType: 'stock' });
  });

  it('skips a sold position rather than importing a zero', () => {
    const { holdings, skipped } = parseTrHoldings({
      categories: [
        {
          categoryType: 'stock',
          positions: [
            { ...PORTFOLIO.categories[1].positions[0], netSize: '0' },
            PORTFOLIO.categories[1].positions[0],
          ],
        },
      ],
    });
    expect(holdings.map((h) => h.isin)).toEqual(['US0378331005']);
    expect(skipped).toBe(1);
  });

  it('keeps a position whose status it does not recognise', () => {
    // Deleting a real holding because the broker renamed a status is the worst failure here, and
    // it would be invisible: the net worth would just be lower.
    const { holdings } = parseTrHoldings({
      categories: [
        { categoryType: 'stock', positions: [{ ...PORTFOLIO.categories[1].positions[0], status: 'frozen_2027' }] },
      ],
    });
    expect(holdings).toHaveLength(1);
  });

  it('drops an explicitly inactive position', () => {
    const { holdings, skipped } = parseTrHoldings({
      categories: [
        { categoryType: 'stock', positions: [{ ...PORTFOLIO.categories[1].positions[0], status: 'inactive' }] },
      ],
    });
    expect(holdings).toHaveLength(0);
    expect(skipped).toBe(1);
  });

  it('ignores virtualSize, which counts orders that have not settled', () => {
    const { holdings } = parseTrHoldings({
      categories: [
        {
          categoryType: 'stock',
          positions: [{ ...PORTFOLIO.categories[1].positions[0], netSize: '3', virtualSize: '0' }],
        },
      ],
    });
    // A pending sell must not read as a position the user no longer holds.
    expect(holdings[0].quantity).toBe(3);
  });

  it('keeps the first row of a duplicated ISIN', () => {
    const row = PORTFOLIO.categories[0].positions[0];
    const { holdings, skipped } = parseTrHoldings({
      categories: [
        { categoryType: 'etf', positions: [row, { ...row, netSize: '99' }] },
      ],
    });
    expect(holdings).toHaveLength(1);
    expect(holdings[0].quantity).toBe(12.5);
    expect(skipped).toBe(1);
  });

  it('throws on a payload that is not a portfolio', () => {
    expect(() => parseTrHoldings({ nope: true })).toThrow(TrParseError);
  });
});

describe('parseTrCash', () => {
  it('reads the EUR balance in major units', () => {
    const { balances, skipped } = parseTrCash(CASH);
    expect(skipped).toBe(0);
    expect(balances).toEqual([{ balance: 1234.56, currency: 'EUR', accountNumber: 'DE123' }]);
  });

  it('skips a foreign-currency balance instead of converting it without a rate', () => {
    const { balances, skipped } = parseTrCash([
      ...CASH,
      { accountNumber: 'US9', currencyId: 'USD', amount: 500 },
    ]);
    expect(balances).toHaveLength(1);
    expect(skipped).toBe(1);
  });

  it('returns a LIST, so a cash deposit is never folded into settleable cash', () => {
    const { balances } = parseTrCash([
      { accountNumber: 'DE1', currencyId: 'EUR', amount: 100 },
      { accountNumber: 'DE2', currencyId: 'EUR', amount: 250 },
    ]);
    expect(balances.map((b) => b.balance)).toEqual([100, 250]);
  });
});

describe('parseTrSavingsPlans', () => {
  it('splits the ISIN off the instrument id and converts the instalment from minor units', () => {
    const plans = parseTrSavingsPlans(SAVINGS_PLANS);
    expect(plans).toHaveLength(1);
    expect(plans[0]).toMatchObject({
      isin: 'IE00B4L5Y983',
      amount: 200,
      rawAmount: 20000,
      interval: 'monthly',
      nextExecutionDate: '2026-10-01',
      paused: false,
    });
  });

  it('keeps a bare calendar day as written instead of shifting it through UTC', () => {
    // `new Date('2026-10-01')` is UTC midnight, which is the PREVIOUS day in Rome: a savings plan
    // that fires on the 1st would print on the 30th of the month before.
    expect(parseTrSavingsPlans(SAVINGS_PLANS)[0].nextExecutionDate).toBe('2026-10-01');
  });

  it('returns an empty list for a payload with no plans', () => {
    expect(parseTrSavingsPlans({ savingsPlans: [] })).toEqual([]);
  });
});

describe('mapTrType', () => {
  it('falls back to the category when the instrument type is unknown', () => {
    expect(mapTrType('SOMETHING_NEW', 'bond')).toEqual({
      type: 'bond',
      assetClass: 'bonds',
      typeUncertain: false,
    });
  });

  it('flags the ETF fallback as uncertain when neither matches', () => {
    expect(mapTrType('???', '???')).toEqual({
      type: 'etf',
      assetClass: 'equity',
      typeUncertain: true,
    });
  });
});

describe('mapTrHoldingToAssetFormData', () => {
  const holding: TrHoldingInput = {
    isin: 'IE00B4L5Y983',
    name: 'iShares Core MSCI World',
    rawType: 'etf',
    rawCategory: 'etf',
    quantity: 12.5,
    averageCost: 112.44,
    status: 'active',
    currency: 'EUR',
    price: 130.2,
  };

  it('lets the ordinary price path own the quote, the opposite of the Scalable bridge', () => {
    const formData = mapTrHoldingToAssetFormData(holding);
    expect(formData.autoUpdatePrice).toBe(true);
    expect(formData.currentPrice).toBe(130.2);
    // The fixture ISIN is table-mapped: the ticker is the Yahoo symbol (so the refresh keeps
    // working), while the isin stays the broker identifier the next sync matches on.
    expect(formData.ticker).toBe('SWDA.MI');
    expect(formData.isin).toBe('IE00B4L5Y983');
  });

  it('falls back to 0 when the quote lookup failed, so the plan can warn about it', () => {
    expect(mapTrHoldingToAssetFormData({ ...holding, price: undefined }).currentPrice).toBe(0);
  });

  it('stores the published mix and makes its largest sleeve the class', () => {
    const formData = mapTrHoldingToAssetFormData(holding, {
      stock: 0.2,
      bond: 0.7,
      cash: 0.1,
      other: 0,
      preferred: 0,
      convertible: 0,
    });
    expect(formData.assetClass).toBe('bonds');
    expect(formData.composition).toEqual([
      { assetClass: 'bonds', percentage: 70 },
      { assetClass: 'equity', percentage: 20 },
      { assetClass: 'cash', percentage: 10 },
    ]);
  });
});

describe('buildTrImportPlan', () => {
  const holding: TrHoldingInput = {
    isin: 'IE00B4L5Y983',
    name: 'iShares Core MSCI World',
    rawType: 'etf',
    rawCategory: 'etf',
    quantity: 12.5,
    averageCost: 112.44,
    status: 'active',
    currency: 'EUR',
    price: 130.2,
  };

  it('offers a new position and never proposes a quantity or price write for it', () => {
    const plan = buildTrImportPlan([holding], [], [], []);
    expect(plan.holdings[0].kind).toBe('new');
    expect(plan.stats.newCount).toBe(1);
    // No price branch exists at all, unlike the Scalable plan: the broker publishes no quote, so
    // there is nothing to compare and nothing to patch. Asserted as ABSENCE of the key, because a
    // `priceUpdateCount: 0` would be a count of a thing this bridge never measures.
    expect(Object.keys(plan.stats)).not.toContain('priceUpdateCount');
  });

  it('reports a ledger quantity mismatch as drift and leaves the quantity alone', () => {
    const plan = buildTrImportPlan([holding], [], [], [
      { id: 'asset-1', name: 'iShares Core MSCI World', isin: 'IE00B4L5Y983', type: 'etf', quantity: 10, ticker: 'IE00B4L5Y983' },
    ]);
    expect(plan.holdings[0]).toMatchObject({ kind: 'drift-only', quantityDrift: 2.5 });
    expect(plan.warnings.join(' ')).toContain('non viene toccata');
  });

  it('reads an exact quantity as unchanged', () => {
    const plan = buildTrImportPlan([holding], [], [], [
      { id: 'asset-1', name: 'World', isin: 'IE00B4L5Y983', type: 'etf', quantity: 12.5, ticker: 'IE00B4L5Y983' },
    ]);
    expect(plan.holdings[0].kind).toBe('unchanged');
    expect(plan.warnings).toHaveLength(0);
  });

  it('creates a new fund already split, with the largest published sleeve as its class', () => {
    const plan = buildTrImportPlan([holding], [], [], [], {
      IE00B4L5Y983: { stock: 0.2, bond: 0.7, cash: 0.1, other: 0, preferred: 0, convertible: 0 },
    });
    const [diff] = plan.holdings;
    expect(diff.kind).toBe('new');
    expect(diff.formData.assetClass).toBe('bonds');
    expect(diff.formData.composition?.[0]).toEqual({ assetClass: 'bonds', percentage: 70 });
  });

  it('fills an EXISTING empty composition and carries the metadata a write must not erase', () => {
    const plan = buildTrImportPlan(
      [holding],
      [],
      [],
      [
        {
          id: 'asset-1',
          name: 'World',
          isin: 'IE00B4L5Y983',
          type: 'etf',
          quantity: 12.5,
          ticker: 'SWDA.MI',
          composition: [],
          taxRate: 12.5,
          displayTicker: 'Mondo',
        },
      ],
      { IE00B4L5Y983: { stock: 0.2, bond: 0.7, cash: 0.1, other: 0, preferred: 0, convertible: 0 } }
    );
    const [diff] = plan.holdings;
    expect(diff.kind).toBe('composition-update');
    expect(diff.compositionUpdate).toBe(true);
    expect(diff.existingTaxRate).toBe(12.5);
    expect(diff.existingDisplayTicker).toBe('Mondo');
    expect(plan.stats.compositionUpdateCount).toBe(1);
    expect(plan.stats.unchangedCount).toBe(0);
  });

  it('reports a drift AND fills the empty composition in the same row', () => {
    // `kind` names the loudest fact (the quantity mismatch), but the composition is independent:
    // hiding it because the row already says «Scostamento» would leave the fund split-less until
    // the user reconciled by hand.
    const plan = buildTrImportPlan(
      [holding],
      [],
      [],
      [{ id: 'asset-1', name: 'World', isin: 'IE00B4L5Y983', type: 'etf', quantity: 10, ticker: 'SWDA.MI' }],
      { IE00B4L5Y983: { stock: 0.2, bond: 0.7, cash: 0.1, other: 0, preferred: 0, convertible: 0 } }
    );
    const [diff] = plan.holdings;
    expect(diff.kind).toBe('drift-only');
    expect(diff.compositionUpdate).toBe(true);
    expect(plan.stats.driftCount).toBe(1);
    expect(plan.stats.compositionUpdateCount).toBe(1);
  });

  it('never overwrites a composition the user typed', () => {
    const manual = [
      { assetClass: 'equity' as const, percentage: 60 },
      { assetClass: 'bonds' as const, percentage: 40 },
    ];
    const plan = buildTrImportPlan(
      [holding],
      [],
      [],
      [{ id: 'asset-1', name: 'World', isin: 'IE00B4L5Y983', type: 'etf', quantity: 12.5, ticker: 'SWDA.MI', composition: manual }],
      { IE00B4L5Y983: { stock: 0.2, bond: 0.7, cash: 0.1, other: 0, preferred: 0, convertible: 0 } }
    );
    expect(plan.holdings[0].kind).toBe('unchanged');
    expect(plan.holdings[0].compositionUpdate).toBe(false);
    expect(plan.stats.compositionUpdateCount).toBe(0);
  });

  it('stops calling an uncertain broker type unknown once the market placed the fund', () => {
    const mystery: TrHoldingInput = {
      ...holding,
      rawType: 'MYSTERY',
      rawCategory: '',
      isin: 'DE0001234567',
      name: 'Mystery',
      price: 5,
    };
    const withMix = buildTrImportPlan([mystery], [], [], [], {
      DE0001234567: { stock: 0.2, bond: 0.7, cash: 0.1, other: 0, preferred: 0, convertible: 0 },
    });
    expect(withMix.holdings[0].formData.type).toBe('etf');
    expect(withMix.warnings).toHaveLength(0);
    // The falsification: the same row without a mix must still warn.
    expect(buildTrImportPlan([mystery], [], [], []).warnings.join(' ')).toContain('non riconosciuto');
  });

  it('names a position that enters without a price instead of creating it silently worthless', () => {
    const plan = buildTrImportPlan([{ ...holding, price: undefined }], [], [], []);
    expect(plan.holdings[0].formData.currentPrice).toBe(0);
    expect(plan.warnings.join(' ')).toContain('prezzo non trovato');
  });

  it('tracks the first cash balance and DECLARES the second rather than summing them', () => {
    // The Scalable deposit lesson: two balances at one broker are two accounts, and a sum would
    // quietly merge money the user tracks separately.
    const plan = buildTrImportPlan(
      [],
      [
        { balance: 100, currency: 'EUR', accountNumber: 'DE1' },
        { balance: 59201.61, currency: 'EUR', accountNumber: 'DE2' },
      ],
      [],
      []
    );
    expect(plan.cash).toMatchObject({ balance: 100 });
    expect(plan.warnings.join(' ')).toContain('59201.61');
    expect(plan.warnings.join(' ')).toContain('non viene sommato');
  });

  it('reports no cash as null, which the preview shows as absent rather than as zero', () => {
    expect(buildTrImportPlan([], [], [], []).cash).toBeNull();
  });

  it('matches a savings plan to the tracked asset by ISIN and never writes it', () => {
    const plan = buildTrImportPlan(
      [holding],
      [],
      parseTrSavingsPlans(SAVINGS_PLANS),
      [{ id: 'asset-1', name: 'iShares Core MSCI World', isin: 'IE00B4L5Y983', type: 'etf', quantity: 12.5, ticker: 'IE00B4L5Y983' }]
    );
    expect(plan.savingsPlans[0]).toMatchObject({
      trackedAssetId: 'asset-1',
      trackedAssetName: 'iShares Core MSCI World',
    });
    // The plan is a PREVIEW: nothing in it proposes a write for a standing order.
    expect(JSON.stringify(plan.savingsPlans)).not.toContain('quantity');
  });

  it('leaves a savings plan unmatched rather than guessing an asset', () => {
    const plan = buildTrImportPlan([], [], parseTrSavingsPlans(SAVINGS_PLANS), []);
    expect(plan.savingsPlans[0].trackedAssetId).toBeUndefined();
    expect(plan.savingsPlans[0].plan.isin).toBe('IE00B4L5Y983');
  });
});

describe('the cash account identity', () => {
  it('is the ticker the sync writes, not the editable name', () => {
    // A user may rename the account; matching by name would duplicate it on the next sync.
    expect(TR_CASH_TICKER).toBe('TR-EUR');
  });
});

describe('crypto positions (pseudo-ISIN XF000…)', () => {
  // The `isin` below is measured, not invented: it is what Trade Republic sent for the
  // owner's Bitcoin on 2026-09-30 (`XF` = the user-assigned ISO block for exchange-issued
  // identifiers, then the coin code, then digits). The envelope follows the documented
  // position shape.
  const BTC_POSITION = {
    isin: 'XF000BTC0017',
    averageBuyIn: '71208,6497',
    netSize: '0,051768',
    virtualSize: '0,051768',
    status: 'active',
    instrumentType: 'CRYPTO',
    name: 'Bitcoin',
  };
  const BTC_PORTFOLIO = { categories: [{ categoryType: 'crypto', positions: [BTC_POSITION] }] };

  it('keeps the XF000 row instead of skipping it as "no ISIN"', () => {
    const { holdings, skipped } = parseTrHoldings(BTC_PORTFOLIO);
    expect(skipped).toBe(0);
    expect(holdings).toHaveLength(1);
    expect(holdings[0]).toMatchObject({
      isin: 'XF000BTC0017',
      quantity: 0.051768,
      averageCost: 71208.6497,
    });
  });

  it('derives the Yahoo symbol BTC-EUR from the pseudo-ISIN', () => {
    const { holdings } = parseTrHoldings(BTC_PORTFOLIO);
    expect(resolveTrYahooTicker(holdings[0])).toBe('BTC-EUR');
  });

  it('writes the Yahoo symbol as ticker but keeps the broker id as isin', () => {
    const { holdings } = parseTrHoldings(BTC_PORTFOLIO);
    const formData = mapTrHoldingToAssetFormData({ ...holdings[0], price: 73340.13 });
    expect(formData.ticker).toBe('BTC-EUR');
    expect(formData.isin).toBe('XF000BTC0017');
    expect(formData.currentPrice).toBe(73340.13);
  });

  it('prefers the route-resolved yahooTicker over every local guess', () => {
    const { holdings } = parseTrHoldings(BTC_PORTFOLIO);
    const formData = mapTrHoldingToAssetFormData({ ...holdings[0], yahooTicker: 'BTC-EUR' });
    expect(formData.ticker).toBe('BTC-EUR');
    // A route-resolved symbol wins even where the pure layer knows nothing.
    const stock: TrHoldingInput = {
      isin: 'US0231351067',
      name: 'Amazon',
      rawType: 'stock',
      rawCategory: '',
      quantity: 1,
      status: 'active',
      currency: 'EUR',
      yahooTicker: 'AMZN',
    };
    expect(mapTrHoldingToAssetFormData(stock).ticker).toBe('AMZN');
  });

  it('returns null for a stock ISIN: no exchange suffix is ever guessed', () => {
    const holding: TrHoldingInput = {
      isin: 'US0378331005',
      name: 'Apple',
      rawType: 'stock',
      rawCategory: '',
      quantity: 3,
      status: 'active',
      currency: 'EUR',
    };
    expect(resolveTrYahooTicker(holding)).toBeNull();
    expect(mapTrHoldingToAssetFormData(holding).ticker).toBe('US0378331005');
  });

  it('returns null for a malformed XF000 id rather than inventing a coin', () => {
    const holding: TrHoldingInput = {
      isin: 'XF000BTC',
      name: 'Bitcoin',
      rawType: 'CRYPTO',
      rawCategory: '',
      quantity: 0.05,
      status: 'active',
      currency: 'EUR',
    };
    expect(resolveTrYahooTicker(holding)).toBeNull();
  });
});

describe('applyTrTickerOverride', () => {
  const formData = mapTrHoldingToAssetFormData({
    isin: 'IE00B4L5Y983',
    name: 'World',
    rawType: 'etf',
    rawCategory: '',
    quantity: 12.5,
    status: 'active',
    currency: 'EUR',
  });
  // The fixture ISIN is table-mapped, so the planned ticker is already the Yahoo symbol.

  it('applies a trimmed override', () => {
    expect(applyTrTickerOverride(formData, '  VWCE.MI ').ticker).toBe('VWCE.MI');
  });

  it('keeps the planned ticker on a blank, missing or identical override', () => {
    expect(applyTrTickerOverride(formData, undefined)).toBe(formData);
    expect(applyTrTickerOverride(formData, '   ')).toBe(formData);
    expect(applyTrTickerOverride(formData, 'SWDA.MI')).toBe(formData);
  });
});
