import { describe, it, expect } from 'vitest';
import type { Asset, AssetAllocationSettings, AssetAllocationTarget } from '@/types/assets';
import type { InvestmentGoal } from '@/types/goals';
import { DEFAULT_IDEAL_ALLOCATION, LIQUIDITY_CANDIDATE_KEY } from '@/lib/constants/idealAllocation';
import {
  toModelWeights,
  describeModelExclusions,
  validateModelWeights,
  proposalToModelWeights,
  addModelCandidate,
  clearHeldCandidates,
  describeModelVsToday,
  buildModelBasis,
  isModelStale,
  modelFingerprint,
  MODEL_ERROR_EMPTY,
  MODEL_ERROR_NOT_ALLOWED,
  MODEL_ERROR_SUM,
  MODEL_ERROR_UNKNOWN_ASSET,
} from '@/lib/utils/modelPortfolio';

function makeAsset(id: string, overrides: Partial<Asset> = {}): Asset {
  return {
    id,
    userId: 'u1',
    ticker: id,
    name: id,
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

const ETFMONDO = makeAsset('ETFMONDO');
const ETFMOM = makeAsset('ETFMOM');
const FONDO = makeAsset('FONDO', { allocationRole: 'frozen' });
const CONTO = makeAsset('CONTO', { type: 'cash', assetClass: 'cash' });
const byId = (...assets: Asset[]) => new Map(assets.map((a) => [a.id, a]));

describe('toModelWeights', () => {
  it('drops the frozen asset and the cash account, rescales to 100', () => {
    const r = toModelWeights(
      [
        { assetId: 'ETFMONDO', pct: 50 },
        { assetId: 'ETFMOM', pct: 25 },
        { assetId: 'FONDO', pct: 15 },
        { assetId: 'CONTO', pct: 10 },
      ],
      byId(ETFMONDO, ETFMOM, FONDO, CONTO),
    );
    expect(r.weights).toEqual([
      { assetId: 'ETFMONDO', pct: 66.67 },
      { assetId: 'ETFMOM', pct: 33.33 },
    ]);
    expect(r.excluded).toEqual([
      { assetId: 'FONDO', reason: 'frozen' },
      { assetId: 'CONTO', reason: 'cashAccount' },
    ]);
    expect(describeModelExclusions(r.excluded, (id) => id)).toBe(
      'FONDO resta fuori: bloccato in Impostazioni. CONTO resta fuori: è un conto di liquidità.',
    );
  });

  it('three equal thirds put the leftover cent on the first of the largest', () => {
    const third = 100 / 3;
    const c = makeAsset('C');
    const r = toModelWeights(
      [{ assetId: 'ETFMONDO', pct: third }, { assetId: 'ETFMOM', pct: third }, { assetId: 'C', pct: third }],
      byId(ETFMONDO, ETFMOM, c),
    );
    expect(r.weights.map((w) => w.pct)).toEqual([33.34, 33.33, 33.33]);
  });

  // A money-market fund counts in the base as liquidity, but no plan buys it (2026-11-12).
  it('drops a money-market fund (cash class, not an account)', () => {
    const mm = makeAsset('MM', { assetClass: 'cash' });
    const r = toModelWeights([{ assetId: 'MM', pct: 100 }], byId(mm));
    expect(r.weights).toEqual([]);
    expect(r.excluded).toEqual([{ assetId: 'MM', reason: 'notBuyable' }]);
  });

  it('returns no weights when nothing tradable is left', () => {
    const r = toModelWeights([{ assetId: 'CONTO', pct: 100 }], byId(CONTO));
    expect(r.weights).toEqual([]);
  });
});

describe('validateModelWeights', () => {
  const assets = byId(ETFMONDO, ETFMOM, FONDO, CONTO);
  it('accepts Σ = 100 within 0,01', () => {
    expect(validateModelWeights([{ assetId: 'ETFMONDO', targetPercentage: 60 }, { assetId: 'ETFMOM', targetPercentage: 40.005 }], assets)).toBeNull();
  });
  it('refuses an empty model, a wrong sum, an unknown asset, a frozen asset and a cash account', () => {
    expect(validateModelWeights([], assets)).toBe(MODEL_ERROR_EMPTY);
    expect(validateModelWeights([{ assetId: 'ETFMONDO', targetPercentage: 60 }, { assetId: 'ETFMOM', targetPercentage: 39.9 }], assets)).toBe(MODEL_ERROR_SUM);
    expect(validateModelWeights([{ assetId: 'NOPE', targetPercentage: 100 }], assets)).toBe(MODEL_ERROR_UNKNOWN_ASSET);
    expect(validateModelWeights([{ assetId: 'ETFMONDO', targetPercentage: 85 }, { assetId: 'FONDO', targetPercentage: 15 }], assets)).toBe(MODEL_ERROR_NOT_ALLOWED);
    expect(validateModelWeights([{ assetId: 'ETFMONDO', targetPercentage: 90 }, { assetId: 'CONTO', targetPercentage: 10 }], assets)).toBe(MODEL_ERROR_NOT_ALLOWED);
  });
});

describe('proposalToModelWeights / candidates', () => {
  const ETFEM = makeAsset('ETFEM', { quantity: 0 });
  const assets = byId(ETFMONDO, ETFMOM, ETFEM);
  it('flags a proposed instrument that holds nothing as a candidate', () => {
    const r = proposalToModelWeights(
      [{ assetId: 'ETFMONDO', pct: 60 }, { assetId: 'ETFMOM', pct: 30 }, { assetId: 'ETFEM', pct: 10 }],
      assets,
      (a) => a.quantity,
    );
    expect(r.portfolioWeights).toEqual([
      { assetId: 'ETFMONDO', targetPercentage: 60 },
      { assetId: 'ETFMOM', targetPercentage: 30 },
      { assetId: 'ETFEM', targetPercentage: 10, candidate: true },
    ]);
  });
  it('adds a candidate at weight 0 once, and drops the flag when shares are held', () => {
    const added = addModelCandidate([{ assetId: 'ETFMONDO', targetPercentage: 100 }], 'ETFEM');
    expect(added[1]).toEqual({ assetId: 'ETFEM', targetPercentage: 0, candidate: true });
    expect(addModelCandidate(added, 'ETFEM')).toBe(added);
    const bought = byId(ETFMONDO, makeAsset('ETFEM', { quantity: 3 }));
    expect(clearHeldCandidates(added, bought, (a) => a.quantity)[1]).toEqual({ assetId: 'ETFEM', targetPercentage: 0 });
    expect(clearHeldCandidates(added, assets, (a) => a.quantity)[1].candidate).toBe(true);
  });
});

describe('describeModelVsToday', () => {
  const value = (a: Asset) => a.quantity * a.currentPrice;
  it('base 24.000, today 50/50, difference +2.400 / −2.400', () => {
    const etfMondo = makeAsset('ETFMONDO', { quantity: 100, currentPrice: 120 });
    const etfMom = makeAsset('ETFMOM', { quantity: 200, currentPrice: 60 });
    const r = describeModelVsToday(
      [{ assetId: 'ETFMOM', targetPercentage: 40 }, { assetId: 'ETFMONDO', targetPercentage: 60 }],
      [etfMondo, etfMom],
      value,
    );
    expect(r.baseEur).toBe(24000);
    expect(r.rows.map((row) => row.assetId)).toEqual(['ETFMONDO', 'ETFMOM']);
    expect(r.rows[0].todayPct).toBeCloseTo(50, 6);
    expect(r.rows[0].diffEur).toBeCloseTo(2400, 6);
    expect(r.rows[1].diffEur).toBeCloseTo(-2400, 6);
    expect(r.outside).toEqual({ assetIds: [], valueEur: 0 });
  });
  it('puts candidates last and sums a held tradable instrument outside the model apart', () => {
    const etfMondo = makeAsset('ETFMONDO', { quantity: 10, currentPrice: 100 });
    const etfEm = makeAsset('ETFEM', { quantity: 0, currentPrice: 30 });
    const other = makeAsset('OTHER', { quantity: 5, currentPrice: 100 });
    const r = describeModelVsToday(
      [{ assetId: 'ETFEM', targetPercentage: 10, candidate: true }, { assetId: 'ETFMONDO', targetPercentage: 90 }],
      [etfMondo, etfEm, other],
      value,
    );
    expect(r.rows.map((row) => row.assetId)).toEqual(['ETFMONDO', 'ETFEM']);
    expect(r.baseEur).toBe(1000);
    expect(r.rows[1].diffEur).toBeCloseTo(100, 6);
    expect(r.outside).toEqual({ assetIds: ['OTHER'], valueEur: 500 });
  });
});

// ---------------------------------------------------------------------------
// What never enters the saved model (2026-11-12)
// ---------------------------------------------------------------------------

describe('toModelWeights / validateModelWeights — what the model never holds', () => {
  const etfA = makeAsset('etf-a');
  const etfB = makeAsset('etf-b');
  const house = makeAsset('house', { type: 'realestate', assetClass: 'realestate', allocationRole: 'frozen' });
  const moneyMarket = makeAsset('mm', { type: 'etf', assetClass: 'cash' });
  const pension = makeAsset('pf', { type: 'pensionFund', assetClass: 'bonds' });

  // The dialog's map has no stand-in for «Liquidità»: the key is read before the lookup. Seen red with the
  // lookup first (the row kept, «Salva» refused on an unknown asset).
  it('drops «Liquidità», a property, a money-market fund and a pension fund, and rescales the rest to 100', () => {
    const r = toModelWeights(
      [
        { assetId: 'etf-a', pct: 30 },
        { assetId: 'etf-b', pct: 10 },
        { assetId: LIQUIDITY_CANDIDATE_KEY, pct: 20 },
        { assetId: 'house', pct: 20 },
        { assetId: 'mm', pct: 10 },
        { assetId: 'pf', pct: 10 },
      ],
      byId(etfA, etfB, house, moneyMarket, pension)
    );
    expect(r.weights).toEqual([
      { assetId: 'etf-a', pct: 75 },
      { assetId: 'etf-b', pct: 25 },
    ]);
    expect(r.excluded).toEqual([
      { assetId: LIQUIDITY_CANDIDATE_KEY, reason: 'liquidity' },
      { assetId: 'house', reason: 'property' },
      { assetId: 'mm', reason: 'notBuyable' },
      { assetId: 'pf', reason: 'notBuyable' },
    ]);
  });

  it('refuses a «Liquidità» row as not allowed', () => {
    expect(
      validateModelWeights(
        [
          { assetId: 'etf-a', targetPercentage: 80 },
          { assetId: LIQUIDITY_CANDIDATE_KEY, targetPercentage: 20 },
        ],
        byId(etfA)
      )
    ).toBe(MODEL_ERROR_NOT_ALLOWED);
  });

  it('says why each one stays out', () => {
    expect(
      describeModelExclusions(
        [
          { assetId: LIQUIDITY_CANDIDATE_KEY, reason: 'liquidity' },
          { assetId: 'house', reason: 'property' },
          { assetId: 'mm', reason: 'notBuyable' },
        ],
        (id) => (id === LIQUIDITY_CANDIDATE_KEY ? 'Liquidità' : id.toUpperCase())
      )
    ).toBe(
      'Liquidità resta fuori: la liquidità conta nella base, non nel modello. HOUSE resta fuori: un immobile conta nella base, non si compra a rate. MM resta fuori: conta nella base, ma un piano non lo compra.'
    );
  });
});

// ---------------------------------------------------------------------------
// «superato»: what the model rests on (2026-11-12)
// ---------------------------------------------------------------------------

describe('modelFingerprint / isModelStale', () => {
  const targets: AssetAllocationTarget = { equity: { targetPercentage: 80 }, bonds: { targetPercentage: 20 } };
  const settings = (overrides: Partial<AssetAllocationSettings> = {}): AssetAllocationSettings => ({ targets, ...overrides });
  const goal = (overrides: Partial<InvestmentGoal> = {}): InvestmentGoal => ({
    id: 'g1',
    name: 'Casa',
    targetAmount: 100000,
    priority: 'alta',
    color: '#000000',
    recommendedAllocation: { equity: 60, bonds: 40 },
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...overrides,
  });
  const etfA = makeAsset('etf-a');
  const etfB = makeAsset('etf-b');
  const assets = [etfA, etfB];
  const fp = (s: AssetAllocationSettings, a: Asset[] = assets, goals?: InvestmentGoal[]) => modelFingerprint(buildModelBasis(s, goals), a);
  const goalDriven = { goalBasedInvestingEnabled: true, goalDrivenAllocationEnabled: true };

  // Seen red hashing JSON.stringify as is (the key order leaks into the text).
  it('is 8 hex digits and does not depend on the order of the keys', () => {
    const permuted: AssetAllocationTarget = { bonds: { targetPercentage: 20 }, equity: { targetPercentage: 80 } };
    expect(fp(settings())).toMatch(/^[0-9a-f]{8}$/);
    expect(fp(settings({ targets: permuted }))).toBe(fp(settings()));
  });

  // What Impostazioni writes on a save that changes nothing: every class, the empty ones at 0%, a switched-off
  // sub-category block, a switched-off fixed amount (owner, 2026-11-17: «superato» right after restoring 60/30).
  // Seen red hashing the targets as written.
  it('ignores the 0% classes and the switched-off fields Impostazioni writes', () => {
    const off = { enabled: false, categories: [] };
    const asSaved: AssetAllocationTarget = {
      equity: { targetPercentage: 80, subCategoryConfig: off },
      bonds: { targetPercentage: 20, subCategoryConfig: off },
      realestate: { targetPercentage: 0, subCategoryConfig: off },
      cash: { targetPercentage: 0, useFixedAmount: false, fixedAmount: 0, subCategoryConfig: off },
    };
    expect(fp(settings({ targets: asSaved }))).toBe(fp(settings()));
  });

  it('still changes with a switched-on sub-category block or fixed amount', () => {
    const on: AssetAllocationTarget = { ...targets, equity: { targetPercentage: 80, subCategoryConfig: { enabled: true, categories: ['World'] } } };
    const fixed: AssetAllocationTarget = { ...targets, cash: { targetPercentage: 0, useFixedAmount: true, fixedAmount: 5000 } };
    expect(fp(settings({ targets: on }))).not.toBe(fp(settings()));
    expect(fp(settings({ targets: fixed }))).not.toBe(fp(settings()));
  });

  // Seen red with the targets left out of the basis.
  it('changes with a stored target', () => {
    expect(fp(settings({ targets: { equity: { targetPercentage: 70 }, bonds: { targetPercentage: 30 } } }))).not.toBe(fp(settings()));
  });

  it('changes when an instrument becomes frozen', () => {
    expect(fp(settings(), [makeAsset('etf-a', { allocationRole: 'frozen' }), etfB])).not.toBe(fp(settings()));
  });

  it('changes with a goal input when the goals drive the allocation', () => {
    const s = settings(goalDriven);
    expect(fp(s, assets, [goal({ targetAmount: 120000 })])).not.toBe(fp(s, assets, [goal()]));
  });

  it('changes with a criterion, and reads absent criteria as the defaults', () => {
    const limited = (maxPct: number) =>
      settings({ idealAllocation: { ...DEFAULT_IDEAL_ALLOCATION, enabled: true, instrumentLimits: [{ assetId: 'etf-a', maxPct }] } });
    expect(fp(limited(20))).not.toBe(fp(limited(30)));
    expect(fp(settings({ idealAllocation: DEFAULT_IDEAL_ALLOCATION }))).toBe(fp(settings()));
  });

  it('stays for the same targets written twice (an «Applica» with nothing changed)', () => {
    const again = JSON.parse(JSON.stringify(targets)) as AssetAllocationTarget;
    expect(fp(settings({ targets: again }))).toBe(fp(settings()));
  });

  // Seen red with the tradable roles in the hash.
  it('stays after a new tradable asset and, goal-driven, after a price doubles', () => {
    expect(fp(settings(), [...assets, makeAsset('etf-c')])).toBe(fp(settings()));
    const s = settings(goalDriven);
    expect(fp(s, [makeAsset('etf-a', { currentPrice: 200 }), etfB], [goal()])).toBe(fp(s, assets, [goal()]));
  });

  it('reads no goal while the goals do not drive the allocation', () => {
    expect(buildModelBasis(settings(), [goal()]).goals).toBeNull();
    expect(buildModelBasis(settings(goalDriven), [goal()]).goals).toEqual([
      { id: 'g1', targetAmount: 100000, priority: 'alta', recommendedAllocation: { equity: 60, bonds: 40 } },
    ]);
  });

  it('a model with no fingerprint is stale; one saved on this basis is not', () => {
    const basis = buildModelBasis(settings(), undefined);
    expect(isModelStale({}, basis, assets)).toBe(true);
    expect(isModelStale({ fingerprint: modelFingerprint(basis, assets) }, basis, assets)).toBe(false);
  });
});
