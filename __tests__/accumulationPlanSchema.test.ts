/**
 * One test per DraftIssue code (doc/pac-ate.md §6/§11).
 */
import { describe, it, expect } from 'vitest';
import type { Asset } from '@/types/assets';
import type { AccumulationPlanDraft } from '@/types/accumulationPlan';
import { validateDraftAgainstAssets } from '@/lib/utils/accumulationPlanSchema';

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
    const vwce = makeAsset({ id: 'vwce', name: 'VWCE' });
    const draft = baseDraft({
      positions: [{ id: 'p1', label: 'VWCE', targetPercentage: 90, memberAssetIds: ['vwce'], buyAssetId: 'vwce' }],
    });
    const issues = validateDraftAgainstAssets(draft, byId(vwce));
    const issue = issues.find((i) => i.code === 'weights_sum');
    expect(issue).toBeDefined();
    expect(issue!.message).toContain('90');
  });

  it('weight_negative', () => {
    const vwce = makeAsset({ id: 'vwce', name: 'VWCE' });
    const draft = baseDraft({
      positions: [{ id: 'p1', label: 'VWCE', targetPercentage: -10, memberAssetIds: ['vwce'], buyAssetId: 'vwce' }],
    });
    const issues = validateDraftAgainstAssets(draft, byId(vwce));
    expect(issues.some((i) => i.code === 'weight_negative' && i.positionId === 'p1')).toBe(true);
  });

  it('buy_not_member', () => {
    const vwce = makeAsset({ id: 'vwce', name: 'VWCE' });
    const swda = makeAsset({ id: 'swda', name: 'SWDA' });
    const draft = baseDraft({
      positions: [{ id: 'p1', label: 'Gruppo', targetPercentage: 100, memberAssetIds: ['vwce'], buyAssetId: 'swda' }],
    });
    const issues = validateDraftAgainstAssets(draft, byId(vwce, swda));
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

  it('source_not_cash', () => {
    const vwce = makeAsset({ id: 'vwce', name: 'VWCE' });
    const draft = baseDraft({ liquidity: { sourceCashAssetIds: ['vwce'], reserveEur: 0, monthlyInflowEur: 0 } });
    const issues = validateDraftAgainstAssets(draft, byId(vwce));
    expect(issues.some((i) => i.code === 'source_not_cash')).toBe(true);
  });

  it('unassigned_tradable', () => {
    const vwce = makeAsset({ id: 'vwce', name: 'VWCE', quantity: 5 });
    const draft = baseDraft();
    const issues = validateDraftAgainstAssets(draft, byId(vwce));
    expect(issues.some((i) => i.code === 'unassigned_tradable' && i.assetId === 'vwce')).toBe(true);
  });

  it('unassigned_tradable exempts cash accounts (PR #4 review, rilievo 6)', () => {
    // resolveAllocationRole reads 'tradable' for cash by default — without the exemption a
    // current account the reader never meant to classify would block step 2 from ever closing.
    const cash = makeAsset({ id: 'cash1', name: 'Conto corrente', assetClass: 'cash', quantity: 1, currentPrice: 5000 });
    const draft = baseDraft();
    const issues = validateDraftAgainstAssets(draft, byId(cash));
    expect(issues.some((i) => i.code === 'unassigned_tradable')).toBe(false);
  });

  it('unassigned_tradable follows VALUE, not quantity (PR #4 review, rilievo 7)', () => {
    // A held instrument whose price was never fetched (quantity > 0, currentPrice 0): the ATE §6
    // predicate is «valore > 0», the same one the seeder/candidates in AccumulationPlanDialog use
    // — a quantity-only check would demand it be classified while offering it no row to do so in.
    const unpriced = makeAsset({ id: 'unpriced1', name: 'ETF senza prezzo', quantity: 10, currentPrice: 0 });
    const draft = baseDraft();
    const issues = validateDraftAgainstAssets(draft, byId(unpriced));
    expect(issues.some((i) => i.code === 'unassigned_tradable')).toBe(false);
  });

  it('duplicate_asset', () => {
    const vwce = makeAsset({ id: 'vwce', name: 'VWCE' });
    const draft = baseDraft({
      positions: [
        { id: 'p1', label: 'VWCE', targetPercentage: 50, memberAssetIds: ['vwce'], buyAssetId: 'vwce' },
        { id: 'p2', label: 'VWCE2', targetPercentage: 50, memberAssetIds: ['vwce'], buyAssetId: 'vwce' },
      ],
    });
    const issues = validateDraftAgainstAssets(draft, byId(vwce));
    expect(issues.some((i) => i.code === 'duplicate_asset')).toBe(true);
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
