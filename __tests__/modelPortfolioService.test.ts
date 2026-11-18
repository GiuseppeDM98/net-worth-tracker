/**
 * The model portfolio's save (lib/services/modelPortfolioService.ts), Firestore mocked: what the document
 * carries beside the weights. The fingerprint is computed on the basis the caller hands in, except when the
 * caller keeps the stored one — an instrument added to evaluate does not refresh a stale model (2026-11-12).
 *
 * REGRESSION GUARD, seen red (2026-11-17): the fingerprint always computed (the kept one ignored).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const setDocMock = vi.fn();
vi.mock('@/lib/firebase/config', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db: unknown, collection: string, id: string) => ({ path: `${collection}/${id}` })),
  getDoc: vi.fn(),
  setDoc: (...args: unknown[]) => setDocMock(...args),
  deleteDoc: vi.fn(),
}));

import { saveModelPortfolio } from '@/lib/services/modelPortfolioService';
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
