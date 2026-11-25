/**
 * `AssetDialog`'s create of a ledger type on an account with the ledger (a meta document).
 *
 * With `createEmpty` (Allocazione › Accumulo → «+ Nuovo asset», owner 2026-11-12): the instrument is
 * created at quantity 0, with no opening trade, marked `createdEmpty` — the flag «mai comprato» reads
 * (lib/utils/zeroQuantityChip.ts) — and handed back through `onCreated`.
 *
 * Without it (2026-11-23, one form for every purchase): the form asks no quantity and no price; the
 * instrument is created the same way, empty, and handed to `onRegisterTrade` — the Patrimonio page
 * opens «Registra operazione» on it for the first purchase. No trade is written here.
 *
 * The reads, the writes and the quote are mocked. Invented names and tickers.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { writes } = vi.hoisted(() => ({
  writes: {
    createAsset: vi.fn(async () => 'new-asset'),
    createTrade: vi.fn(async () => ({})),
  },
}));

vi.mock('@/lib/firebase/config', () => ({ auth: { currentUser: null }, db: {} }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { uid: 'owner-1' } }) }));
vi.mock('@/contexts/ActiveAccountContext', () => ({ useActiveAccount: () => ({ ownerId: 'owner-1' }) }));
vi.mock('@/lib/hooks/useAssets', () => ({ useAssets: () => ({ data: [] }) }));
vi.mock('@/lib/hooks/useSettings', () => ({ useSettings: () => ({ data: null }) }));
vi.mock('@/lib/hooks/useAssetTransactions', () => ({
  useAssetLedgerMeta: () => ({ data: { migratedAt: new Date('2026-01-01T12:00:00') } }),
  fetchFreshLedgerMeta: async () => ({ migratedAt: new Date('2026-01-01T12:00:00') }),
  useAssetTransactions: () => ({ data: [] }),
  useCreateAssetTransaction: () => ({ mutateAsync: writes.createTrade, isPending: false }),
}));
vi.mock('@/lib/services/assetService', () => ({
  createAsset: writes.createAsset,
  getAssetById: async (id: string) => ({ id, name: 'Azione Alfa', type: 'stock', currency: 'EUR', quantity: 0 }),
  updateAsset: vi.fn(),
  updateAssetMetadata: vi.fn(),
}));
vi.mock('@/lib/services/assetTransactionService', () => ({ deleteAllAssetTransactionsForAsset: vi.fn() }));
vi.mock('@/lib/services/assetAllocationService', () => ({ addSubCategory: vi.fn() }));
vi.mock('@/lib/services/couponScheduling', () => ({ scheduleNextCoupon: vi.fn(), scheduleFinalPremium: vi.fn() }));
vi.mock('@/lib/utils/authFetch', () => ({
  authenticatedFetch: async () => ({ ok: true, json: async () => ({ price: 100, currency: 'EUR', priceEur: 100 }) }),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import { AssetDialog } from '@/components/assets/AssetDialog';

function renderDialog(props: { createEmpty?: boolean; initialType?: 'etf' | 'stock'; onRegisterTrade?: (asset: unknown) => void; onCreated?: (id: string) => void }) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <AssetDialog open onClose={() => {}} initialType={props.initialType ?? 'etf'} {...props} />
    </QueryClientProvider>,
  );
}

async function fillAndSave(ticker = 'ETFA.MI', name = 'ETF Alfa') {
  const input = await waitFor(() => {
    const element = document.getElementById('ticker') as HTMLInputElement | null;
    expect(element).not.toBeNull();
    return element!;
  });
  fireEvent.change(input, { target: { value: ticker } });
  fireEvent.change(document.getElementById('name') as HTMLInputElement, { target: { value: name } });
  fireEvent.click(screen.getByRole('button', { name: /^Crea/ }));
}

beforeEach(() => {
  writes.createAsset.mockClear();
  writes.createTrade.mockClear();
});

describe('AssetDialog — createEmpty', () => {
  // Seen red with `!emptyCreateFlow` dropped from ledgerCreateFlow (the opening-trade path runs).
  it('saves the instrument at quantity 0, marked createdEmpty, with no opening trade', async () => {
    const onRegisterTrade = vi.fn();
    const onCreated = vi.fn();
    renderDialog({ createEmpty: true, onRegisterTrade, onCreated });
    await fillAndSave();
    await waitFor(() => expect(writes.createAsset).toHaveBeenCalledTimes(1));
    const [, data] = writes.createAsset.mock.calls[0] as unknown as [string, Record<string, unknown>];
    expect(data.quantity).toBe(0);
    expect(data.createdEmpty).toBe(true);
    expect(data.averageCost).toBeUndefined();
    expect(writes.createTrade).not.toHaveBeenCalled();
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith('new-asset'));
    expect(onRegisterTrade).not.toHaveBeenCalled();
  });
});

describe('AssetDialog — one form for every purchase', () => {
  it('asks no quantity and no purchase price for a new stock', async () => {
    renderDialog({ initialType: 'stock', onRegisterTrade: vi.fn() });
    await waitFor(() => expect(document.getElementById('ticker')).not.toBeNull());
    expect(screen.queryByText(/Posizione iniziale/)).toBeNull();
    expect(document.getElementById('quantity')).toBeNull();
    expect(document.getElementById('averageCost')).toBeNull();
    expect(screen.getByRole('button', { name: 'Crea e registra l’acquisto' })).toBeTruthy();
  });

  it('creates it empty and hands it to the trade form, writing no trade', async () => {
    const onRegisterTrade = vi.fn();
    renderDialog({ initialType: 'stock', onRegisterTrade });
    await fillAndSave('ALFA.MI', 'Azione Alfa');
    await waitFor(() => expect(writes.createAsset).toHaveBeenCalledTimes(1));
    const [, data] = writes.createAsset.mock.calls[0] as unknown as [string, Record<string, unknown>];
    expect(data.quantity).toBe(0);
    expect(data.createdEmpty).toBe(true);
    expect(data.averageCost).toBeUndefined();
    await waitFor(() => expect(onRegisterTrade).toHaveBeenCalledTimes(1));
    expect(onRegisterTrade.mock.calls[0][0]).toEqual(expect.objectContaining({ id: 'new-asset', quantity: 0 }));
    expect(writes.createTrade).not.toHaveBeenCalled();
  });
});
