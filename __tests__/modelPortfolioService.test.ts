/**
 * The model portfolio's save (lib/services/modelPortfolioService.ts), Firestore mocked: what the document
 * carries beside the weights. The fingerprint is computed on the basis the caller hands in, except when the
 * caller keeps the stored one — an instrument added to evaluate does not refresh a stale model (2026-11-12).
 *
 * REGRESSION GUARD, seen red (2026-11-17): the fingerprint always computed (the kept one ignored).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const setDocMock = vi.fn();
const getDocMock = vi.fn();
vi.mock('@/lib/firebase/config', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db: unknown, collection: string, id: string) => ({ path: `${collection}/${id}` })),
  getDoc: (...args: unknown[]) => getDocMock(...args),
  setDoc: (...args: unknown[]) => setDocMock(...args),
  deleteDoc: vi.fn(),
}));

import { getModelPortfolio, saveModelPortfolio } from '@/lib/services/modelPortfolioService';
import { buildModelBasis, modelFingerprint } from '@/lib/utils/modelPortfolio';
import type { Asset } from '@/types/assets';
import type { ModelPortfolioInput } from '@/types/modelPortfolio';

function makeAsset(id: string): Asset {
  return {
    id,
    userId: 'u1',
    ticker: id.toUpperCase(),
    name: id,
    type: 'etf',
    assetClass: 'equity',
    currency: 'EUR',
    quantity: 1,
    currentPrice: 100,
    lastPriceUpdate: new Date(0),
    createdAt: new Date(0),
    updatedAt: new Date(0),
  };
}

const assets = [makeAsset('etf-a'), makeAsset('etf-b')];
const basis = buildModelBasis({ targets: { equity: { targetPercentage: 100 } } }, undefined);
const input: ModelPortfolioInput = {
  weights: [
    { assetId: 'etf-a', targetPercentage: 60 },
    { assetId: 'etf-b', targetPercentage: 40 },
  ],
  origin: 'manual',
};
const written = () => setDocMock.mock.calls[0][1] as Record<string, unknown>;

beforeEach(() => setDocMock.mockReset());

describe('saveModelPortfolio — the fingerprint', () => {
  it('writes the fingerprint of the basis it is given', async () => {
    await saveModelPortfolio('owner-1', input, assets, basis);
    expect(written().fingerprint).toBe(modelFingerprint(basis, assets));
    expect(written().weights).toEqual(input.weights);
  });

  it('writes the kept fingerprint as is', async () => {
    await saveModelPortfolio('owner-1', { ...input, keepFingerprint: 'abc12345' }, assets, basis);
    expect(written().fingerprint).toBe('abc12345');
  });

  it('a kept fingerprint that is undefined leaves the field out (an old model stays stale)', async () => {
    await saveModelPortfolio('owner-1', { ...input, keepFingerprint: undefined }, assets, basis);
    expect('fingerprint' in written()).toBe(false);
  });
});

describe('getModelPortfolio — the optimizer snapshot', () => {
  const stored = (snapshot: Record<string, unknown>) =>
    getDocMock.mockResolvedValueOnce({
      exists: () => true,
      data: () => ({ userId: 'owner-1', weights: input.weights, origin: 'optimizer', updatedAt: new Date(0), optimizerSnapshot: snapshot }),
    });
  const base = { computedAt: new Date(0), mode: 'targeted', settingsUsed: {}, weights: [], objectives: [] };

  it('reads back the tax cap and the «Non vendere» locks of a targeted run', async () => {
    stored({ ...base, taxCapEur: 500, lockedKeys: ['etf-b'] });
    const model = await getModelPortfolio('owner-1');
    expect(model?.optimizerSnapshot?.taxCapEur).toBe(500);
    expect(model?.optimizerSnapshot?.lockedKeys).toEqual(['etf-b']);
  });

  it('leaves both out of a run of the other modes', async () => {
    stored({ ...base, mode: 'ideal' });
    const snapshot = (await getModelPortfolio('owner-1'))?.optimizerSnapshot;
    expect(snapshot && 'taxCapEur' in snapshot).toBe(false);
    expect(snapshot && 'lockedKeys' in snapshot).toBe(false);
  });
});
