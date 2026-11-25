/**
 * AssetDialog's currency (2026-11-23): a select over the listed currencies (lib/constants/currencies.ts),
 * above the price; on a create the ticker's blur asks the quote once, silently, and sets it unless the
 * owner has already picked one — nor does the submit's quote overwrite that pick. A cash account has
 * no select and is saved in euro. An instrument with operations keeps its currency. The reads, the
 * writes and the quote are mocked; invented names and tickers. Seen red (2026-11-25) with the
 * currency set by every lookup, the owner's pick ignored.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Asset } from '@/types/assets';

const { writes, quote, toastMock } = vi.hoisted(() => ({
  writes: {
    createAsset: vi.fn(async () => 'new-asset'),
    updateAsset: vi.fn(async () => undefined),
    updateAssetMetadata: vi.fn(async () => undefined),
  },
  quote: { currency: 'USD' },
  toastMock: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
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
}));
vi.mock('@/lib/services/assetService', () => ({
  createAsset: writes.createAsset,
  getAssetById: async (id: string) => ({ id, name: 'Ornitorinco Inc', type: 'stock', currency: 'USD', quantity: 0 }),
  updateAsset: writes.updateAsset,
  updateAssetMetadata: writes.updateAssetMetadata,
}));
vi.mock('@/lib/services/assetTransactionService', () => ({ deleteAllAssetTransactionsForAsset: vi.fn() }));
vi.mock('@/lib/services/assetAllocationService', () => ({ addSubCategory: vi.fn() }));
vi.mock('@/lib/services/couponScheduling', () => ({ scheduleNextCoupon: vi.fn(), scheduleFinalPremium: vi.fn() }));
vi.mock('@/lib/utils/authFetch', () => ({
  authenticatedFetch: async () => ({ ok: true, json: async () => ({ price: 50, currency: quote.currency, currentPriceEur: 45 }) }),
}));
vi.mock('sonner', () => ({ toast: toastMock }));

import { AssetDialog } from '@/components/assets/AssetDialog';

const at = (iso: string) => new Date(`${iso}T12:00:00Z`);

function renderDialog(props: { initialType?: Asset['type']; asset?: Asset }) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <AssetDialog open onClose={() => {}} onRegisterTrade={() => {}} {...props} />
    </QueryClientProvider>,
  );
}

const currencySelect = () => screen.findByRole('combobox', { name: 'Valuta' });

async function typeTicker(value: string) {
  const ticker = await waitFor(() => {
    const input = document.getElementById('ticker') as HTMLInputElement | null;
    expect(input).not.toBeNull();
    return input!;
  });
  fireEvent.change(ticker, { target: { value } });
  fireEvent.blur(ticker);
}

async function openCurrencies(): Promise<string[]> {
  fireEvent.pointerDown(await currencySelect(), { button: 0, ctrlKey: false, pointerType: 'mouse' });
  return (await screen.findAllByRole('option')).map((option) => option.textContent ?? '');
}

async function pickCurrency(code: string) {
  fireEvent.pointerDown(await currencySelect(), { button: 0, ctrlKey: false, pointerType: 'mouse' });
  const option = await screen.findByRole('option', { name: code });
  option.focus();
  fireEvent.keyDown(option, { key: 'Enter' });
  await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull());
}

beforeEach(() => {
  vi.clearAllMocks();
  quote.currency = 'USD';
  HTMLElement.prototype.hasPointerCapture ??= () => false;
  HTMLElement.prototype.releasePointerCapture ??= () => undefined;
  HTMLElement.prototype.scrollIntoView ??= () => undefined;
});

describe('AssetDialog — the currency', () => {
  it('is a select, above the price', async () => {
    renderDialog({ initialType: 'stock' });
    const select = await currencySelect();
    const price = document.getElementById('manualPrice')!;
    expect(price).not.toBeNull();
    expect(select.compareDocumentPosition(price) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(await openCurrencies()).toEqual(['EUR', 'USD', 'GBP', 'CHF', 'JPY', 'CAD', 'AUD', 'SEK', 'NOK', 'DKK', 'HKD', 'SGD', 'PLN']);
  });

  it('takes the quote currency on the ticker blur, with no toast', async () => {
    renderDialog({ initialType: 'stock' });
    await typeTicker('ORNI');
    expect(await screen.findByText('Valuta rilevata: USD')).toBeTruthy();
    expect((await currencySelect()).textContent).toBe('USD');
    expect(toastMock.success).not.toHaveBeenCalled();
    expect(toastMock.error).not.toHaveBeenCalled();
  });

  it('adds a currency the list does not have when the quote names it', async () => {
    quote.currency = 'NZD';
    renderDialog({ initialType: 'stock' });
    await typeTicker('KIWI');
    await screen.findByText('Valuta rilevata: NZD');
    expect(await openCurrencies()).toContain('NZD');
  });

  it('never overwrites the currency the owner picked, on the blur or at the submit', async () => {
    renderDialog({ initialType: 'stock' });
    await pickCurrency('CHF');
    await typeTicker('ORNI');
    fireEvent.change(document.getElementById('name') as HTMLInputElement, { target: { value: 'Ornitorinco Inc' } });
    // The lookup answers USD; give it its turn before reading the select.
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect((await currencySelect()).textContent).toBe('CHF');
    fireEvent.click(screen.getByRole('button', { name: /^Crea/ }));
    await waitFor(() => expect(writes.createAsset).toHaveBeenCalledTimes(1));
    const [, data] = writes.createAsset.mock.calls[0] as unknown as [string, Record<string, unknown>];
    expect(data.currency).toBe('CHF');
  });

  it('has no select on a cash account, which is saved in euro', async () => {
    const account = {
      id: 'cash-usd', userId: 'owner-1', ticker: '', name: 'Conto Ornitorinco', type: 'cash', assetClass: 'cash', currency: 'USD',
      quantity: 1000, currentPrice: 1, createdAt: at('2026-11-10'), updatedAt: at('2026-11-10'),
    } as unknown as Asset;
    renderDialog({ asset: account });
    await waitFor(() => expect(document.getElementById('name')).not.toBeNull());
    expect(screen.queryByRole('combobox', { name: 'Valuta' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Salva modifiche' }));
    await waitFor(() => expect(writes.updateAsset).toHaveBeenCalledTimes(1));
    const [, data] = writes.updateAsset.mock.calls[0] as unknown as [string, Record<string, unknown>];
    expect(data.currency).toBe('EUR');
  });

  it('is locked on an instrument with operations', async () => {
    const stock = {
      id: 'a-1', userId: 'owner-1', ticker: 'ORNI', name: 'Ornitorinco Inc', type: 'stock', assetClass: 'equity', currency: 'USD',
      quantity: 10, currentPrice: 50, averageCost: 45, createdAt: at('2026-11-10'), updatedAt: at('2026-11-10'),
      lastPriceUpdate: at('2026-11-10'),
    } as unknown as Asset;
    renderDialog({ asset: stock });
    const select = await currencySelect();
    expect((select as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('La valuta non cambia: le operazioni sono registrate in USD.')).toBeTruthy();
  });
});
