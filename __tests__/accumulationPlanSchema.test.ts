/**
 * One test per DraftIssue code.
 */
import { describe, it, expect } from 'vitest';
import type { Asset } from '@/types/assets';
import type { AccumulationPlanDraft } from '@/types/accumulationPlan';
import { accumulationPlanDraftSchema, validateDraftAgainstAssets } from '@/lib/utils/accumulationPlanSchema';
import { seedPositionsFromAssets } from '@/lib/utils/accumulationPlanUtils';

let seq = 0;
function makeAsset(overrides: Partial<Asset> = {}): Asset {
  seq += 1;
  return {
    id: `a${seq}`,
    userId: 'u1',
    ticker: 'X',
    name: 'X',
    type: 'etf',
    assetClass: 'equity',
    currency: 'EUR',
    quantity: 1,
    currentPrice: 100,
    lastPriceUpdate: new Date(0),
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...overrides,
  };
}

function baseDraft(overrides: Partial<AccumulationPlanDraft> = {}): AccumulationPlanDraft {
  return {
    name: 'Piano',
    startMonth: '2026-10',
    months: 12,
    liquidity: { sourceCashAssetIds: [], reserveEur: 0, monthlyInflowEur: 0 },
    positions: [],
    disposals: [],
    ...overrides,
  };
}

function byId(...assets: Asset[]): Map<string, Asset> {
  return new Map(assets.map((a) => [a.id, a]));
}

describe('validateDraftAgainstAssets — one case per code', () => {
  it('no_positions', () => {
    const issues = validateDraftAgainstAssets(baseDraft(), byId());
    expect(issues.some((i) => i.code === 'no_positions')).toBe(true);
  });

  it('weights_sum', () => {
    const etfA = makeAsset({ id: 'etf-a', name: 'ETF-A' });
    const draft = baseDraft({
      positions: [{ id: 'p1', label: 'ETF-A', targetPercentage: 90, memberAssetIds: ['etf-a'], buyAssetId: 'etf-a' }],
    });
    const issues = validateDraftAgainstAssets(draft, byId(etfA));
    const issue = issues.find((i) => i.code === 'weights_sum');
    expect(issue).toBeDefined();
    expect(issue!.message).toContain('90');
  });

  it('weight_negative', () => {
    const etfA = makeAsset({ id: 'etf-a', name: 'ETF-A' });
    const draft = baseDraft({
      positions: [{ id: 'p1', label: 'ETF-A', targetPercentage: -10, memberAssetIds: ['etf-a'], buyAssetId: 'etf-a' }],
    });
    const issues = validateDraftAgainstAssets(draft, byId(etfA));
    expect(issues.some((i) => i.code === 'weight_negative' && i.positionId === 'p1')).toBe(true);
  });

  it('buy_not_member', () => {
    const etfA = makeAsset({ id: 'etf-a', name: 'ETF-A' });
    const etfB = makeAsset({ id: 'etf-b', name: 'ETF-B' });
    const draft = baseDraft({
      positions: [{ id: 'p1', label: 'Gruppo', targetPercentage: 100, memberAssetIds: ['etf-a'], buyAssetId: 'etf-b' }],
    });
    const issues = validateDraftAgainstAssets(draft, byId(etfA, etfB));
    expect(issues.some((i) => i.code === 'buy_not_member')).toBe(true);
  });

  it('position_not_tradable', () => {
    const frozen = makeAsset({ id: 'frozen', name: 'Fondo', allocationRole: 'frozen' });
    const draft = baseDraft({
      positions: [{ id: 'p1', label: 'Fondo', targetPercentage: 100, memberAssetIds: ['frozen'], buyAssetId: 'frozen' }],
    });
    const issues = validateDraftAgainstAssets(draft, byId(frozen));
    expect(issues.some((i) => i.code === 'position_not_tradable')).toBe(true);
  });

  // A money-market fund (cash class): a plan may SELL it (owner, 2026-11-18), never buy it.
  it('position_not_tradable: a money-market fund may be sold, never bought', () => {
    const monetario = makeAsset({ id: 'mm', name: 'Monetario', assetClass: 'cash', quantity: 10, currentPrice: 100 });
    const etfA = makeAsset({ id: 'etf-a', name: 'ETF-A' });
    const position = { id: 'p1', label: 'ETF-A', targetPercentage: 100, memberAssetIds: ['etf-a'], buyAssetId: 'etf-a' };
    const selling = baseDraft({ positions: [position], disposals: [{ assetId: 'mm', quantity: 4, estimatedProceedsEur: 400, status: 'planned' }] });
    expect(validateDraftAgainstAssets(selling, byId(monetario, etfA)).filter((i) => i.assetId === 'mm')).toEqual([]);
    const buying = baseDraft({ positions: [{ id: 'p2', label: 'Monetario', targetPercentage: 100, memberAssetIds: ['mm'], buyAssetId: 'mm' }] });
    expect(validateDraftAgainstAssets(buying, byId(monetario)).some((i) => i.code === 'position_not_tradable')).toBe(true);
  });

  it('source_not_cash', () => {
    const etfA = makeAsset({ id: 'etf-a', name: 'ETF-A' });
    const draft = baseDraft({ liquidity: { sourceCashAssetIds: ['etf-a'], reserveEur: 0, monthlyInflowEur: 0 } });
    const issues = validateDraftAgainstAssets(draft, byId(etfA));
    expect(issues.some((i) => i.code === 'source_not_cash')).toBe(true);
  });

  // A plan must not be written on an account deleted a minute before (2026-11-20). Mutation that turns it red:
  // skip a source id absent from the assets, as before.
  it('source_missing: an account no longer among the assets, never a present cash account', () => {
    const conto = makeAsset({ id: 'conto', name: 'Conto', type: 'cash', assetClass: 'cash' });
    const missing = baseDraft({ liquidity: { sourceCashAssetIds: ['gone'], reserveEur: 0, monthlyInflowEur: 0 } });
    const issue = validateDraftAgainstAssets(missing, byId(conto)).find((i) => i.code === 'source_missing');
    expect(issue?.message).toBe('Un conto del piano non c\'è più: scegli di nuovo da quale conto comprare.');
    const present = baseDraft({ liquidity: { sourceCashAssetIds: ['conto'], reserveEur: 0, monthlyInflowEur: 0 } });
    expect(validateDraftAgainstAssets(present, byId(conto)).filter((i) => i.code.startsWith('source_'))).toEqual([]);
  });

  it('unassigned_tradable', () => {
    const etfA = makeAsset({ id: 'etf-a', name: 'ETF-A', quantity: 5 });
    const draft = baseDraft();
    const issues = validateDraftAgainstAssets(draft, byId(etfA));
    expect(issues.some((i) => i.code === 'unassigned_tradable' && i.assetId === 'etf-a')).toBe(true);
  });

  it('unassigned_tradable exempts cash accounts', () => {
    // resolveAllocationRole reads 'tradable' for cash by default — without the exemption a
    // current account the reader never meant to classify would block step 2 from ever closing.
    const cash = makeAsset({ id: 'cash1', name: 'Conto corrente', assetClass: 'cash', quantity: 1, currentPrice: 5000 });
    const draft = baseDraft();
    const issues = validateDraftAgainstAssets(draft, byId(cash));
    expect(issues.some((i) => i.code === 'unassigned_tradable')).toBe(false);
  });

  it('unassigned_tradable follows VALUE, not quantity', () => {
    // A held instrument whose price was never fetched (quantity > 0, currentPrice 0): the
    // predicate is «valore > 0», the same one the path's held rows (`withHeldRows`, lib/utils/planPath.ts) use
    // — a quantity-only check would demand it be classified while offering it no row to do so in.
    const unpriced = makeAsset({ id: 'unpriced1', name: 'ETF senza prezzo', quantity: 10, currentPrice: 0 });
    const draft = baseDraft();
    const issues = validateDraftAgainstAssets(draft, byId(unpriced));
    expect(issues.some((i) => i.code === 'unassigned_tradable')).toBe(false);
  });

  it('duplicate_asset', () => {
    const etfA = makeAsset({ id: 'etf-a', name: 'ETF-A' });
    const draft = baseDraft({
      positions: [
        { id: 'p1', label: 'ETF-A', targetPercentage: 50, memberAssetIds: ['etf-a'], buyAssetId: 'etf-a' },
        { id: 'p2', label: 'ETF-A2', targetPercentage: 50, memberAssetIds: ['etf-a'], buyAssetId: 'etf-a' },
      ],
    });
    const issues = validateDraftAgainstAssets(draft, byId(etfA));
    expect(issues.some((i) => i.code === 'duplicate_asset')).toBe(true);
  });

  // The swap (owner, 2026-11-20): the bought instrument is one the plan buys, never the sold one.
  // Mutation that turns it red: the check left out.
  it('swap_target', () => {
    const etfA = makeAsset({ id: 'etf-a', name: 'ETF-A', quantity: 10, currentPrice: 10 });
    const old = makeAsset({ id: 'old', name: 'ETF vecchio', quantity: 5, currentPrice: 10 });
    const draft = (reinvestAssetId: string) => baseDraft({
      positions: [{ id: 'p1', label: 'ETF-A', targetPercentage: 100, memberAssetIds: ['etf-a'], buyAssetId: 'etf-a' }],
      disposals: [{ assetId: 'old', estimatedProceedsEur: 50, status: 'planned', reinvestAssetId }],
    });
    expect(validateDraftAgainstAssets(draft('etf-a'), byId(etfA, old)).filter((i) => i.code === 'swap_target')).toEqual([]);
    const outside = validateDraftAgainstAssets(draft('altro'), byId(etfA, old)).find((i) => i.code === 'swap_target');
    expect(outside?.message).toBe('La vendita di «ETF vecchio» reinveste in uno strumento che il piano non compra: scegline uno del piano.');
    expect(validateDraftAgainstAssets(draft('old'), byId(etfA, old)).some((i) => i.code === 'swap_target')).toBe(true);
    // The zod shape keeps the field.
    expect(accumulationPlanDraftSchema.parse(draft('etf-a')).disposals[0].reinvestAssetId).toBe('etf-a');
  });

  it('months_range', () => {
    const issues = validateDraftAgainstAssets(baseDraft({ months: 61 }), byId());
    expect(issues.some((i) => i.code === 'months_range')).toBe(true);
  });

  it('negative_amount', () => {
    const issues = validateDraftAgainstAssets(
      baseDraft({ liquidity: { sourceCashAssetIds: [], reserveEur: -1, monthlyInflowEur: 0 } }),
      byId()
    );
    expect(issues.some((i) => i.code === 'negative_amount')).toBe(true);
  });
});

describe('only what a plan may buy is demanded (2026-11-12)', () => {
  // Seen red with the loop back on `resolveAllocationRole`: the house was «da classificare».
  it('a property with value and no role raises no unassigned_tradable', () => {
    const house = makeAsset({ id: 'house', name: 'Casa', type: 'realestate', assetClass: 'realestate', quantity: 1, currentPrice: 200000 });
    const etf = makeAsset({ id: 'etf-a', name: 'ETF A' });
    const draft = baseDraft({ positions: [{ id: 'p', label: 'ETF A', targetPercentage: 100, memberAssetIds: ['etf-a'], buyAssetId: 'etf-a' }] });
    expect(validateDraftAgainstAssets(draft, byId(house, etf)).filter((i) => i.code === 'unassigned_tradable')).toEqual([]);
  });

  it('a mortgage in a position is not buyable', () => {
    const house = makeAsset({ id: 'house', type: 'realestate', assetClass: 'realestate' });
    const mortgage = makeAsset({ id: 'mortgage', name: 'Mutuo', type: 'loan', assetClass: 'realestate', currentPrice: -100, financedAssetId: 'house' });
    const draft = baseDraft({ positions: [{ id: 'p', label: 'Mutuo', targetPercentage: 100, memberAssetIds: ['mortgage'], buyAssetId: 'mortgage' }] });
    expect(validateDraftAgainstAssets(draft, byId(house, mortgage)).some((i) => i.code === 'position_not_tradable')).toBe(true);
  });

  it('seedPositionsFromAssets seeds the ETF, never the property', () => {
    const house = makeAsset({ id: 'house', type: 'realestate', assetClass: 'realestate', quantity: 1, currentPrice: 200000 });
    const etf = makeAsset({ id: 'etf-a', name: 'ETF A' });
    const seeded = seedPositionsFromAssets([house, etf], (a) => a.quantity * a.currentPrice, () => 'id');
    expect(seeded.map((p) => p.buyAssetId)).toEqual(['etf-a']);
  });
});

// A sale in its month (2026-11-19): never past the last instalment, in the frame of the months scheduled.
// Mutations that turn it red: the check dropped; the check against `draft.months` alone.
describe('a sale month inside the plan', () => {
  const etfA = () => makeAsset({ id: 'etf-a', name: 'ETF-A', quantity: 10 });
  const sellingAt = (monthIndex: number, months = 12) =>
    baseDraft({ months, disposals: [{ assetId: 'etf-a', quantity: 1, monthIndex, estimatedProceedsEur: 100, status: 'planned' }] });

  it('a sale past the last instalment is refused with its sentence', () => {
    const issue = validateDraftAgainstAssets(sellingAt(13), byId(etfA())).find((i) => i.code === 'sale_month_out');
    expect(issue?.message).toBe('La vendita di «ETF-A» è fissata oltre l’ultima rata: scegli un mese del piano.');
    expect(validateDraftAgainstAssets(sellingAt(12), byId(etfA())).some((i) => i.code === 'sale_month_out')).toBe(false);
  });

  it('a month 0 fails the schema', () => {
    expect(accumulationPlanDraftSchema.safeParse(sellingAt(0)).success).toBe(false);
    expect(accumulationPlanDraftSchema.safeParse(sellingAt(1)).success).toBe(true);
  });

  it('a revision reads the month in the plan frame', () => {
    // From the 4th instalment, 9 months left: plan months 4..12.
    expect(validateDraftAgainstAssets(sellingAt(10, 9), byId(etfA()), 4).some((i) => i.code === 'sale_month_out')).toBe(false);
    expect(validateDraftAgainstAssets(sellingAt(13, 9), byId(etfA()), 4).some((i) => i.code === 'sale_month_out')).toBe(true);
  });
});

// The app's corrections travel on the draft (2026-11-20): at most 40 sentences of 400 characters, so a capped list always parses.
// Mutation that turns it red: drop the max(40) bound.
describe('the advisor notes', () => {
  it('accepts forty, refuses forty-one and a sentence past 400 characters', () => {
    const notes = (n: number) => Array.from({ length: n }, (_, i) => 'Nota ' + i + '.');
    expect(accumulationPlanDraftSchema.safeParse(baseDraft({ advisorNotes: notes(40) })).success).toBe(true);
    expect(accumulationPlanDraftSchema.safeParse(baseDraft({ advisorNotes: notes(41) })).success).toBe(false);
    expect(accumulationPlanDraftSchema.safeParse(baseDraft({ advisorNotes: ['x'.repeat(401)] })).success).toBe(false);
  });
});
