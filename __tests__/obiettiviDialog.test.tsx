/**
 * `ObiettiviDialog` — «Criteri del modello» (Allocazione › Accumulo). Pinned (2026-11-12): «Prova» runs the
 * optimizer once, in its handler, and the next edit of a criterion clears the report — the PR ran it in a
 * `useMemo` on every edit after the first «Prova»; a property under its mortgage stops «Prova» with the reason
 * as the reading. The form itself (`IdealAllocationTile`) is stubbed: one button edits the draft.
 *
 * REGRESSION GUARD, seen red (2026-11-17): the `useMemo` on `tryRequested`; the negative-fixed check dropped.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Asset, AssetAllocationTarget, IdealAllocationSettings } from '@/types/assets';

vi.mock('@/lib/firebase/config', () => ({ auth: { currentUser: null }, db: {} }));
vi.mock('@/lib/hooks/useDemoMode', () => ({ useDemoMode: () => false }));
vi.mock('@/lib/services/assetAllocationService', () => ({ setSettings: vi.fn() }));
vi.mock('@/lib/services/assetService', () => ({
  calculateAssetValue: (a: Asset) => (a.type === 'loan' ? -(a.quantity * a.currentPrice) : a.quantity * a.currentPrice),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock('@/components/settings/IdealAllocationTile', () => ({
  IdealAllocationTile: ({ value, onChange }: { value: IdealAllocationSettings; onChange: (next: IdealAllocationSettings) => void }) => (
    <button type="button" onClick={() => onChange({ ...value, leveragePriority: value.leveragePriority === 'off' ? 'high' : 'off' })}>
      cambia criterio
    </button>
  ),
}));
vi.mock('@/components/allocation/OptimizerReport', () => ({
  OptimizerObjectivesReport: () => <div data-testid="optimizer-objectives-report" />,
}));
vi.mock('@/lib/utils/weightOptimizer', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/utils/weightOptimizer')>();
  return { ...actual, runOptimizer: vi.fn(actual.runOptimizer) };
});

import { ObiettiviDialog } from '@/components/allocation/ObiettiviDialog';
import { DEFAULT_IDEAL_ALLOCATION, runOptimizer } from '@/lib/utils/weightOptimizer';

function makeAsset(id: string, overrides: Partial<Asset> = {}): Asset {
  return {
    id,
    userId: 'owner-1',
    ticker: id.toUpperCase(),
    name: id.toUpperCase(),
    type: 'etf',
    assetClass: 'equity',
    currency: 'EUR',
    quantity: 1,
    currentPrice: 1000,
    lastPriceUpdate: new Date(0),
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...overrides,
  };
}

const targets: AssetAllocationTarget = { equity: { targetPercentage: 70 }, bonds: { targetPercentage: 30 } };
const saved = { ...DEFAULT_IDEAL_ALLOCATION, enabled: true };
const account = makeAsset('conto', { type: 'cash', assetClass: 'cash', currentPrice: 10000 });
const etfA = makeAsset('etf-a', { currentPrice: 30000 });
const etfB = makeAsset('etf-b', { assetClass: 'bonds', currentPrice: 10000 });

function renderDialog(allAssets: Asset[] = [account, etfA, etfB]) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ObiettiviDialog
        open
        onClose={() => {}}
        ownerId="owner-1"
        allAssets={allAssets}
        targets={targets}
        targetLeverageRatio={1}
        saved={saved}
        onSaved={() => {}}
      />
    </QueryClientProvider>
  );
}

const prova = () => screen.getByRole('button', { name: 'Prova' }) as HTMLButtonElement;
const editCriterion = () => fireEvent.click(screen.getByRole('button', { name: 'cambia criterio' }));
const flat = (text: string | null | undefined) => (text ?? '').replace(/[  ]/g, ' ');

beforeEach(() => {
  vi.mocked(runOptimizer).mockClear();
});

describe('ObiettiviDialog — «Prova» runs once, an edit clears the report', () => {
  it('0 runs while editing, 1 on «Prova», the report cleared by the next edit', () => {
    renderDialog();
    editCriterion();
    editCriterion();
    expect(runOptimizer).toHaveBeenCalledTimes(0);
    fireEvent.click(prova());
    expect(runOptimizer).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('optimizer-objectives-report')).toBeTruthy();
    editCriterion();
    expect(runOptimizer).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('optimizer-objectives-report')).toBeNull();
  });
});

describe('ObiettiviDialog — a base the model cannot run on', () => {
  it('a property under its mortgage: «Prova» off, the reading says why', () => {
    const house = makeAsset('casa', { type: 'realestate', assetClass: 'realestate', currentPrice: 100000, allocationRole: 'frozen', name: 'Casa' });
    const mortgage = makeAsset('mutuo', { type: 'loan', assetClass: 'cash', currentPrice: 120000, financedAssetId: 'casa' });
    renderDialog([account, etfA, house, mortgage]);
    expect(prova().disabled).toBe(true);
    const status = screen.getByRole('status');
    expect(flat(status.textContent)).toBe('Casa vale meno dei suoi debiti: il modello non si calcola su una base con una quota negativa.');
    expect(status.className).toContain('text-destructive');
  });
});
