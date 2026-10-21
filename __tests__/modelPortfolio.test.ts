import { describe, it, expect } from 'vitest';
import type { Asset } from '@/types/assets';
import {
  toModelWeights,
  describeModelExclusions,
  validateModelWeights,
  proposalToModelWeights,
  addModelCandidate,
  clearHeldCandidates,
  describeModelVsToday,
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

const VWCE = makeAsset('VWCE');
const XDEM = makeAsset('XDEM');
const FONDO = makeAsset('FONDO', { allocationRole: 'frozen' });
const CONTO = makeAsset('CONTO', { type: 'cash', assetClass: 'cash' });
const byId = (...assets: Asset[]) => new Map(assets.map((a) => [a.id, a]));

describe('toModelWeights (RM2)', () => {
  it('PA1/PZ1: drops the frozen asset and the cash account, rescales to 100', () => {
    const r = toModelWeights(
      [
        { assetId: 'VWCE', pct: 50 },
        { assetId: 'XDEM', pct: 25 },
        { assetId: 'FONDO', pct: 15 },
        { assetId: 'CONTO', pct: 10 },
      ],
      byId(VWCE, XDEM, FONDO, CONTO),
    );
    expect(r.weights).toEqual([
      { assetId: 'VWCE', pct: 66.67 },
      { assetId: 'XDEM', pct: 33.33 },
    ]);
    expect(r.excluded).toEqual([
      { assetId: 'FONDO', reason: 'frozen' },
      { assetId: 'CONTO', reason: 'cashAccount' },
    ]);
    expect(describeModelExclusions(r.excluded, (id) => id)).toBe(
      'FONDO resta fuori: bloccato in Impostazioni. CONTO resta fuori: è un conto di liquidità.',
    );
  });

  it('PZ2: three equal thirds put the leftover cent on the first of the largest', () => {
    const third = 100 / 3;
    const c = makeAsset('C');
    const r = toModelWeights(
      [{ assetId: 'VWCE', pct: third }, { assetId: 'XDEM', pct: third }, { assetId: 'C', pct: third }],
      byId(VWCE, XDEM, c),
    );
    expect(r.weights.map((w) => w.pct)).toEqual([33.34, 33.33, 33.33]);
  });

  it('keeps a money-market fund (cash class, not an account)', () => {
    const mm = makeAsset('MM', { assetClass: 'cash' });
    const r = toModelWeights([{ assetId: 'MM', pct: 100 }], byId(mm));
    expect(r.weights).toEqual([{ assetId: 'MM', pct: 100 }]);
  });

  it('returns no weights when nothing tradable is left', () => {
    const r = toModelWeights([{ assetId: 'CONTO', pct: 100 }], byId(CONTO));
    expect(r.weights).toEqual([]);
  });
});

describe('validateModelWeights (RM1, PZ3)', () => {
  const assets = byId(VWCE, XDEM, FONDO, CONTO);
  it('accepts Σ = 100 within 0,01', () => {
    expect(validateModelWeights([{ assetId: 'VWCE', targetPercentage: 60 }, { assetId: 'XDEM', targetPercentage: 40.005 }], assets)).toBeNull();
  });
  it('refuses an empty model, a wrong sum, an unknown asset, a frozen asset and a cash account', () => {
    expect(validateModelWeights([], assets)).toBe(MODEL_ERROR_EMPTY);
    expect(validateModelWeights([{ assetId: 'VWCE', targetPercentage: 60 }, { assetId: 'XDEM', targetPercentage: 39.9 }], assets)).toBe(MODEL_ERROR_SUM);
    expect(validateModelWeights([{ assetId: 'NOPE', targetPercentage: 100 }], assets)).toBe(MODEL_ERROR_UNKNOWN_ASSET);
    expect(validateModelWeights([{ assetId: 'VWCE', targetPercentage: 85 }, { assetId: 'FONDO', targetPercentage: 15 }], assets)).toBe(MODEL_ERROR_NOT_ALLOWED);
    expect(validateModelWeights([{ assetId: 'VWCE', targetPercentage: 90 }, { assetId: 'CONTO', targetPercentage: 10 }], assets)).toBe(MODEL_ERROR_NOT_ALLOWED);
  });
});

describe('proposalToModelWeights / candidates (RM2, RM3)', () => {
  const EIMI = makeAsset('EIMI', { quantity: 0 });
  const assets = byId(VWCE, XDEM, EIMI);
  it('flags a proposed instrument that holds nothing as a candidate', () => {
    const r = proposalToModelWeights(
      [{ assetId: 'VWCE', pct: 60 }, { assetId: 'XDEM', pct: 30 }, { assetId: 'EIMI', pct: 10 }],
      assets,
      (a) => a.quantity,
    );
    expect(r.portfolioWeights).toEqual([
      { assetId: 'VWCE', targetPercentage: 60 },
      { assetId: 'XDEM', targetPercentage: 30 },
      { assetId: 'EIMI', targetPercentage: 10, candidate: true },
    ]);
  });
  it('adds a candidate at weight 0 once, and drops the flag when shares are held', () => {
    const added = addModelCandidate([{ assetId: 'VWCE', targetPercentage: 100 }], 'EIMI');
    expect(added[1]).toEqual({ assetId: 'EIMI', targetPercentage: 0, candidate: true });
    expect(addModelCandidate(added, 'EIMI')).toBe(added);
    const bought = byId(VWCE, makeAsset('EIMI', { quantity: 3 }));
    expect(clearHeldCandidates(added, bought, (a) => a.quantity)[1]).toEqual({ assetId: 'EIMI', targetPercentage: 0 });
    expect(clearHeldCandidates(added, assets, (a) => a.quantity)[1].candidate).toBe(true);
  });
});

describe('describeModelVsToday (RM4, PZ4)', () => {
  const value = (a: Asset) => a.quantity * a.currentPrice;
  it('PZ4: M 24.000, today 50/50, difference +2.400 / −2.400', () => {
    const vwce = makeAsset('VWCE', { quantity: 100, currentPrice: 120 });
    const xdem = makeAsset('XDEM', { quantity: 200, currentPrice: 60 });
    const r = describeModelVsToday(
      [{ assetId: 'XDEM', targetPercentage: 40 }, { assetId: 'VWCE', targetPercentage: 60 }],
      [vwce, xdem],
      value,
    );
    expect(r.baseEur).toBe(24000);
    expect(r.rows.map((row) => row.assetId)).toEqual(['VWCE', 'XDEM']);
    expect(r.rows[0].todayPct).toBeCloseTo(50, 6);
    expect(r.rows[0].diffEur).toBeCloseTo(2400, 6);
    expect(r.rows[1].diffEur).toBeCloseTo(-2400, 6);
    expect(r.outside).toEqual({ assetIds: [], valueEur: 0 });
  });
  it('puts candidates last and sums a held tradable instrument outside the model apart', () => {
    const vwce = makeAsset('VWCE', { quantity: 10, currentPrice: 100 });
    const eimi = makeAsset('EIMI', { quantity: 0, currentPrice: 30 });
    const other = makeAsset('OTHER', { quantity: 5, currentPrice: 100 });
    const r = describeModelVsToday(
      [{ assetId: 'EIMI', targetPercentage: 10, candidate: true }, { assetId: 'VWCE', targetPercentage: 90 }],
      [vwce, eimi, other],
      value,
    );
    expect(r.rows.map((row) => row.assetId)).toEqual(['VWCE', 'EIMI']);
    expect(r.baseEur).toBe(1000);
    expect(r.rows[1].diffEur).toBeCloseTo(100, 6);
    expect(r.outside).toEqual({ assetIds: ['OTHER'], valueEur: 500 });
  });
});
