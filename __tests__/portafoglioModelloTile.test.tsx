/**
 * `PortafoglioModelloTile` — «Portafoglio modello» (Allocazione › Accumulo). Pinned (2026-11-12): a model saved
 * on another basis (the targets, the criteria or the roles moved since) reads «superato» in the aside and opens
 * its reading with the stale sentence; a fresh one shows neither; adding an instrument to evaluate keeps the
 * stored fingerprint, so a stale model stays stale. The dialogs are stubbed. Invented names and figures.
 *
 * REGRESSION GUARD, seen red (2026-11-17): `isModelStale` always false; `keepFingerprint` dropped.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { Asset, AssetAllocationTarget } from '@/types/assets';
import type { ModelPortfolio } from '@/types/modelPortfolio';

const { saveSpy } = vi.hoisted(() => ({ saveSpy: vi.fn(async () => undefined) }));

vi.mock('@/lib/firebase/config', () => ({ auth: { currentUser: null }, db: {} }));
vi.mock('@/lib/hooks/useDemoMode', () => ({ useDemoMode: () => false }));
vi.mock('@/lib/hooks/useModelPortfolio', () => ({ useSaveModelPortfolio: () => ({ mutateAsync: saveSpy, isPending: false }) }));
vi.mock('@/lib/services/assetService', () => ({
  calculateAssetValue: (a: Asset) => a.quantity * a.currentPrice,
  getAssetById: async (id: string) => ({ ...makeAsset(id), quantity: 0 }),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock('@/components/assets/AssetDialog', () => ({
  AssetDialog: ({ onCreated }: { onCreated: (id: string) => void }) => (
    <button type="button" onClick={() => onCreated('etf-c')}>
      crea strumento
    </button>
  ),
}));
vi.mock('@/components/allocation/IdealCompositionDialog', () => ({ IdealCompositionDialog: () => null }));
vi.mock('@/components/allocation/AccumulationPlanDialog', () => ({ AccumulationPlanDialog: () => null }));
vi.mock('@/components/allocation/ModelEditDialog', () => ({ ModelEditDialog: () => null }));

import { PortafoglioModelloTile } from '@/components/allocation/tiles/PortafoglioModelloTile';
import { buildModelBasis, modelFingerprint } from '@/lib/utils/modelPortfolio';
import { MODEL_STALE_ASIDE, MODEL_STALE_READING } from '@/lib/utils/weightOptimizerNarrative';

function makeAsset(id: string, overrides: Partial<Asset> = {}): Asset {
  return {
    id,
    userId: 'owner-1',
    ticker: id.toUpperCase(),
    name: id.toUpperCase(),
    type: 'etf',
    assetClass: 'equity',
    currency: 'EUR',
    quantity: 10,
    currentPrice: 100,
    lastPriceUpdate: new Date(0),
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...overrides,
  };
}

const assets = [makeAsset('etf-a'), makeAsset('etf-b')];
const targets: AssetAllocationTarget = { equity: { targetPercentage: 100 } };
const basis = buildModelBasis({ targets }, undefined);
const model = (fingerprint: string | undefined): ModelPortfolio => ({
  userId: 'owner-1',
  weights: [
    { assetId: 'etf-a', targetPercentage: 60 },
    { assetId: 'etf-b', targetPercentage: 40 },
  ],
  origin: 'manual',
  ...(fingerprint ? { fingerprint } : {}),
  updatedAt: new Date('2026-11-10T12:00:00'),
});

function renderTile(saved: ModelPortfolio) {
  return render(
    <PortafoglioModelloTile
      ownerId="owner-1"
      investmentAccountId={null}
      allAssets={assets}
      targets={targets}
      targetLeverageRatio={1}
      idealAllocation={null}
      band={{ mode: 'relative', value: 20 } as never}
      model={saved}
      readFailed={false}
      reviewByIso={null}
      modelBasis={basis}
      onAssetsChanged={() => {}}
    />
  );
}

beforeEach(() => {
  saveSpy.mockClear();
});

describe('PortafoglioModelloTile — «superato»', () => {
  it('a model saved on another basis: the aside says «superato», the reading opens with why', () => {
    const { container } = renderTile(model('00000000'));
    expect(container.textContent).toContain(MODEL_STALE_ASIDE);
    expect(container.textContent).toContain(`${MODEL_STALE_READING} 2 strumenti.`);
  });

  it('a model saved on this basis: neither', () => {
    const { container } = renderTile(model(modelFingerprint(basis, assets)));
    expect(container.textContent).not.toContain(MODEL_STALE_ASIDE);
    expect(container.textContent).not.toContain(MODEL_STALE_READING);
  });

  it('an instrument added to evaluate keeps the stored fingerprint', async () => {
    renderTile(model('00000000'));
    fireEvent.click(screen.getByRole('button', { name: 'Aggiungi strumento da valutare' }));
    fireEvent.click(screen.getByRole('button', { name: 'crea strumento' }));
    await vi.waitFor(() => expect(saveSpy).toHaveBeenCalledTimes(1));
    const call = (saveSpy.mock.calls[0] as unknown[])[0] as { input: { keepFingerprint?: string }; basis: unknown };
    expect(call.input.keepFingerprint).toBe('00000000');
    expect(call.basis).toBe(basis);
  });
});
