/**
 * AssetMovementsDialog while a restored copy of the ledger is being reread (2026-11-24): every edit and
 * delete carries the `updatedAt` of the row it was drawn from, and the server refuses a stale one (409).
 * A reload paints the trades restored from the persisted cache — possibly from before the last edit —
 * and rereads them behind; a delete pressed on that copy was refused, the trade stayed (the
 * intermittent red of e2e/assets.trade-fee.spec.ts, traced to a 409 on 2026-11-24). So the row's
 * actions wait for the reread; a refetch of a list read in THIS load (an invalidation after a save)
 * holds nothing. Red when the gate is removed (the first case) or reads `isFetching` alone (the third).
 */
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Asset } from '@/types/assets';
import type { AssetTransaction } from '@/types/assetTransactions';

const { ledger } = vi.hoisted(() => ({
  ledger: { isFetching: false, dataUpdatedAt: 0 },
}));

vi.mock('@/lib/firebase/config', () => ({ auth: { currentUser: null }, db: {} }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), info: vi.fn(), error: vi.fn() } }));
vi.mock('@/contexts/ActiveAccountContext', () => ({ useActiveAccount: () => ({ ownerId: 'owner-1' }) }));
vi.mock('@/lib/hooks/useDemoMode', () => ({ useDemoMode: () => false }));
vi.mock('@/components/assets/TransactionDialog', () => ({ TransactionDialog: () => null }));
vi.mock('@/lib/hooks/useAssetTransactions', () => ({
  useAssetTransactions: () => ({
    data: [SELL, BUY],
    isLoading: false,
    isFetching: ledger.isFetching,
    dataUpdatedAt: ledger.dataUpdatedAt,
  }),
  useDeleteAssetTransaction: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

import { AssetMovementsDialog } from '@/components/assets/AssetMovementsDialog';

const at = (iso: string) => new Date(`${iso}T12:00:00Z`);
const BUY = {
  id: 't-buy', userId: 'owner-1', assetId: 'a-1', type: 'buy', date: at('2026-03-02'), quantity: 10, price: 100,
  fees: 0, currency: 'EUR', createdAt: at('2026-03-02'), updatedAt: at('2026-03-02'),
} as unknown as AssetTransaction;
const SELL = {
  ...BUY, id: 't-sell', type: 'sell', date: at('2026-03-09'), quantity: 5, price: 120,
  createdAt: at('2026-03-09'), updatedAt: at('2026-03-09'),
} as unknown as AssetTransaction;
const ASSET = {
  id: 'a-1', userId: 'owner-1', ticker: 'ALFA', name: 'Alfa', type: 'stock', assetClass: 'equity', currency: 'EUR',
  quantity: 5, currentPrice: 120, averageCost: 100, createdAt: at('2026-03-02'), updatedAt: at('2026-03-09'),
} as unknown as Asset;

function stubMatchMedia() {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: true, media: query, onchange: null,
    addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {},
    dispatchEvent: () => false,
  }));
}

function actions() {
  return [
    ...screen.getAllByRole('button', { name: 'Elimina operazione' }),
    ...screen.getAllByRole('button', { name: 'Modifica operazione' }),
  ];
}

describe('AssetMovementsDialog — a restored ledger being reread', () => {
  beforeEach(() => {
    stubMatchMedia();
  });

  it('holds edit and delete while the trades on screen were read before this load and are being reread', () => {
    Object.assign(ledger, { isFetching: true, dataUpdatedAt: performance.timeOrigin - 60_000 });
    render(<AssetMovementsDialog open onClose={() => {}} asset={ASSET} />);
    expect(actions().length).toBeGreaterThan(0);
    for (const button of actions()) expect((button as HTMLButtonElement).disabled).toBe(true);
  });

  it('gives them back once the reread has landed', () => {
    Object.assign(ledger, { isFetching: false, dataUpdatedAt: Date.now() });
    render(<AssetMovementsDialog open onClose={() => {}} asset={ASSET} />);
    for (const button of actions()) expect((button as HTMLButtonElement).disabled).toBe(false);
  });

  it('holds nothing while a list read in this load is refetched after a save', () => {
    Object.assign(ledger, { isFetching: true, dataUpdatedAt: Date.now() });
    render(<AssetMovementsDialog open onClose={() => {}} asset={ASSET} />);
    for (const button of actions()) expect((button as HTMLButtonElement).disabled).toBe(false);
  });
});
