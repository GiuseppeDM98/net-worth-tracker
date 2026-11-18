/**
 * `AssetDialog` with `createEmpty` (Allocazione › Accumulo → «+ Nuovo asset», owner 2026-11-12): the
 * instrument is created at quantity 0, with no opening trade, and marked `createdEmpty` — the flag
 * «mai comprato» reads (lib/utils/zeroQuantityChip.ts). Only this path writes the flag. The reads, the
 * writes and the quote are mocked; the account is migrated to the ledger (a meta document), so the
 * opening-trade path WOULD run if the empty create did not exclude it. Invented names and tickers.
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
vi.mock('@/lib/hooks/useExpenses', () => ({ useExpenseCategories: () => ({ data: [] }) }));
vi.mock('@/lib/hooks/useAssetTransactions', () => ({
  useAssetLedgerMeta: () => ({ data: { migratedAt: new Date('2026-01-01T12:00:00') } }),
  fetchFreshLedgerMeta: async () => ({ migratedAt: new Date('2026-01-01T12:00:00') }),
  useCreateAssetTransaction: () => ({ mutateAsync: writes.createTrade, isPending: false }),
}));
vi.mock('@/lib/services/assetService', () => ({
  createAsset: writes.createAsset,
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

function renderDialog(createEmpty: boolean) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <AssetDialog open onClose={() => {}} initialType="etf" createEmpty={createEmpty} />
    </QueryClientProvider>,
  );
}

async function fillAndSave() {
  const ticker = await waitFor(() => {
    const input = document.getElementById('ticker') as HTMLInputElement | null;
    expect(input).not.toBeNull();
    return input!;
  });
  fireEvent.change(ticker, { target: { value: 'ETFA.MI' } });
  fireEvent.change(document.getElementById('name') as HTMLInputElement, { target: { value: 'ETF Alfa' } });
  fireEvent.click(screen.getByRole('button', { name: /^Crea/ }));
}

beforeEach(() => {
  writes.createAsset.mockClear();
  writes.createTrade.mockClear();
});

describe('AssetDialog — createEmpty', () => {
  // Seen red with `!emptyCreateFlow` dropped from ledgerCreateFlow (the opening-trade path runs).
  it('saves the instrument at quantity 0, marked createdEmpty, with no opening trade', async () => {
    renderDialog(true);
    await fillAndSave();
    await waitFor(() => expect(writes.createAsset).toHaveBeenCalledTimes(1));
    const [, data] = writes.createAsset.mock.calls[0] as unknown as [string, Record<string, unknown>];
    expect(data.quantity).toBe(0);
    expect(data.createdEmpty).toBe(true);
    expect(data.averageCost).toBeUndefined();
    expect(writes.createTrade).not.toHaveBeenCalled();
  });

  it('writes no createdEmpty without createEmpty', async () => {
    renderDialog(false);
    await fillAndSave();
    // The ledger create asks for the quantity and the price before it writes anything.
    await new Promise((resolve) => setTimeout(resolve, 50));
    for (const call of writes.createAsset.mock.calls as unknown as [string, Record<string, unknown>][]) {
      expect(call[1]).not.toHaveProperty('createdEmpty');
    }
  });
});

describe('AssetDialog — prefill (the Consulente\'s hand-off, 2026-11-12)', () => {
  const PREFILL = { name: 'ETF ornitorinco', ticker: 'ORNI.MI', isin: 'IE00AAAAAAA1', type: 'etf' as const, assetClass: 'equity' as const, subCategory: 'Mondo' };

  // Seen red with `prefill` dropped from the step the open settles (the create lands on the type picker).
  it('opens on step 2 with name, ticker and ISIN filled, and creates at quantity 0 with the sub-category, no trade', async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <AssetDialog open onClose={() => {}} createEmpty prefill={PREFILL} />
      </QueryClientProvider>,
    );
    const name = await waitFor(() => {
      const input = document.getElementById('name') as HTMLInputElement | null;
      expect(input).not.toBeNull();
      return input!;
    });
    expect(name.value).toBe('ETF ornitorinco');
    expect((document.getElementById('ticker') as HTMLInputElement).value).toBe('ORNI.MI');
    expect((document.getElementById('isin') as HTMLInputElement).value).toBe('IE00AAAAAAA1');
    fireEvent.click(screen.getByRole('button', { name: /^Crea/ }));
    await waitFor(() => expect(writes.createAsset).toHaveBeenCalledTimes(1));
    const [, data] = writes.createAsset.mock.calls[0] as unknown as [string, Record<string, unknown>];
    expect(data).toMatchObject({ name: 'ETF ornitorinco', ticker: 'ORNI.MI', isin: 'IE00AAAAAAA1', type: 'etf', assetClass: 'equity', subCategory: 'Mondo', quantity: 0, createdEmpty: true });
    expect(writes.createTrade).not.toHaveBeenCalled();
  });
});
