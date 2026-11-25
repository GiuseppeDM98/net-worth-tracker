/**
 * TransactionDialog on a foreign instrument (2026-11-23): the fee typed in the instrument's
 * currency, the broker's euro total beside it, the preview run through the server's own rule on the
 * ECB rate the hook reads (mocked here: the network is never asserted), a total that does not agree
 * with that rate refused before «Salva». A EUR instrument shows none of it. The PAC's callback gets
 * the server's euro price, and a settlement account in a foreign currency is never offered.
 * Invented, round figures.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Asset } from '@/types/assets';
import type { AssetTransaction } from '@/types/assetTransactions';

const { createMock, updateMock, toastMock, fx, accounts } = vi.hoisted(() => ({
  createMock: vi.fn(),
  updateMock: vi.fn(),
  toastMock: { success: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn() },
  fx: { data: { rate: 0.9123, isLatest: false } as { rate: number; isLatest: boolean } | undefined, isLoading: false },
  accounts: { list: [] as unknown[] },
}));

vi.mock('@/lib/firebase/config', () => ({ auth: { currentUser: null }, db: {} }));
vi.mock('sonner', () => ({ toast: toastMock }));
vi.mock('@/contexts/ActiveAccountContext', () => ({ useActiveAccount: () => ({ ownerId: 'owner-1' }) }));
vi.mock('@/lib/hooks/useDemoMode', () => ({ useDemoMode: () => false }));
vi.mock('@/lib/hooks/useAssets', () => ({ useAssets: () => ({ data: accounts.list }) }));
vi.mock('@/lib/hooks/useSettings', () => ({
  useSettings: () => ({ data: { transferFeeCategoryId: 'cat-fee' }, isLoading: false }),
}));
vi.mock('@/lib/hooks/useExpenses', () => ({
  useExpenseCategories: () => ({
    data: [{ id: 'cat-fee', name: 'Commissioni', type: 'variable', subCategories: [] }],
    isLoading: false,
  }),
}));
vi.mock('@/lib/hooks/useFxRate', () => ({
  useFxRate: (currency: string | undefined) => (currency ? fx : { data: undefined, isLoading: false }),
}));
vi.mock('@/lib/hooks/useAssetTransactions', () => ({
  useAssetTransactions: () => ({ data: [] }),
  useCreateAssetTransaction: () => ({ mutateAsync: createMock, isPending: false }),
  useUpdateAssetTransaction: () => ({ mutateAsync: updateMock, isPending: false }),
}));

import { TransactionDialog } from '@/components/assets/TransactionDialog';

function stubMatchMedia(matches: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches, media: query, onchange: null,
    addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {},
    dispatchEvent: () => false,
  }));
}

const at = (iso: string) => new Date(`${iso}T12:00:00Z`);
const STOCK = {
  id: 'a-1', userId: 'owner-1', ticker: 'ORNI', name: 'Ornitorinco Inc', type: 'stock', assetClass: 'equity',
  currency: 'USD', quantity: 0, currentPrice: 50, taxRate: 26,
  lastPriceUpdate: at('2026-11-10'), createdAt: at('2026-11-10'), updatedAt: at('2026-11-10'),
} as unknown as Asset;
const EUR_STOCK = { ...STOCK, id: 'a-2', currency: 'EUR' } as unknown as Asset;
const cash = (id: string, name: string, currency: string) =>
  ({ id, userId: 'owner-1', name, type: 'cash', assetClass: 'cash', currency, quantity: 1, currentPrice: 1000 }) as unknown as Asset;
const EURO_ACCOUNT = cash('cash-eur', 'Conto Euro', 'EUR');
const DOLLAR_ACCOUNT = cash('cash-usd', 'Conto Dollari', 'USD');

async function fillBuy(asset: Asset, onCreated?: (...args: unknown[]) => void) {
  render(<TransactionDialog open onClose={() => {}} asset={asset} prefill={{ type: 'buy', quantity: 10 }} onCreated={onCreated} />);
  fireEvent.change(await screen.findByLabelText('Data'), { target: { value: '2026-11-16' } });
  fireEvent.change(screen.getByLabelText(/Prezzo/), { target: { value: '50' } });
  fireEvent.change(screen.getByLabelText(/Commissioni/), { target: { value: '5' } });
}

const normalize = (text: string | null) => (text ?? '').replace(/\s/g, ' ');

describe('TransactionDialog — a trade in a foreign currency', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stubMatchMedia(true);
    fx.data = { rate: 0.9123, isLatest: false };
    fx.isLoading = false;
    accounts.list = [];
  });

  it('asks the fee in dollars and the euro total, and previews the ECB rate of the day', async () => {
    await fillBuy(STOCK);
    expect(screen.getByLabelText('Commissioni (USD)')).toBeTruthy();
    expect(screen.getByLabelText(/Totale addebitato in euro/)).toBeTruthy();
    expect(screen.getByLabelText(/Prezzo per unità \(USD\)/)).toBeTruthy();
    // 10 × 50 × 0,9123 = 456,15 + fee 5 × 0,9123 = 4,56 → 460,71 €.
    const line = await screen.findByText(/Cambio BCE del 16\/11\/2026/);
    expect(normalize(line.textContent)).toBe('Cambio BCE del 16/11/2026: EUR/USD 1,0961 · totale stimato 460,71 €');
  });

  it('reads the rate from a typed total', async () => {
    await fillBuy(STOCK);
    fireEvent.change(screen.getByLabelText(/Totale addebitato in euro/), { target: { value: '460' } });
    // 460 / 505 = 0,91089 → EUR/USD 1,0978.
    expect(await screen.findByText('Cambio dal tuo totale: EUR/USD 1,0978')).toBeTruthy();
  });

  it('refuses a total 30% off the day and disables the save', async () => {
    await fillBuy(STOCK);
    fireEvent.change(screen.getByLabelText(/Totale addebitato in euro/), { target: { value: '650' } });
    expect(await screen.findByText(/Il totale in euro non torna con il cambio del giorno \(EUR\/USD 1,0961\)/)).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Registra operazione' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('shows none of it on a EUR instrument', async () => {
    await fillBuy(EUR_STOCK);
    expect(screen.getByLabelText('Commissioni (€)')).toBeTruthy();
    expect(screen.queryByLabelText(/Totale addebitato in euro/)).toBeNull();
    expect(screen.queryByText(/Cambio/)).toBeNull();
  });

  it('hands the PAC the euro price the server stored', async () => {
    createMock.mockResolvedValueOnce({ transactionId: 't-1', derived: { quantity: 10 }, feeRow: 'written', priceEur: 45.545, feesEur: 4.55 });
    const onCreated = vi.fn();
    await fillBuy(STOCK, onCreated);
    fireEvent.change(screen.getByLabelText(/Totale addebitato in euro/), { target: { value: '460' } });
    fireEvent.click(screen.getByRole('button', { name: 'Registra operazione' }));
    await waitFor(() => expect(onCreated).toHaveBeenCalledOnce());
    expect(onCreated.mock.calls[0][2]).toBe(45.545);
    expect(createMock.mock.calls[0][0]).toEqual(expect.objectContaining({ feesNative: 5, settledTotalEur: 460 }));
    expect(createMock.mock.calls[0][0].fees).toBeUndefined();
  });
});

describe('TransactionDialog — the settlement account is in euro', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stubMatchMedia(true);
    accounts.list = [EURO_ACCOUNT, DOLLAR_ACCOUNT];
  });

  const optionTexts = () => Array.from(document.querySelectorAll('option')).map((option) => option.textContent);

  it('never offers a dollar account to a new trade', async () => {
    render(<TransactionDialog open onClose={() => {}} asset={STOCK} prefill={{ type: 'buy', quantity: 10 }} />);
    await screen.findByLabelText('Data');
    expect(optionTexts()).toContain('Conto Euro');
    expect(optionTexts().some((text) => text?.includes('Conto Dollari'))).toBe(false);
  });

  it('keeps the dollar account of an old trade selected, marked as no longer selectable', async () => {
    const trade = {
      id: 't-old', userId: 'owner-1', assetId: 'a-1', type: 'buy', date: at('2026-03-02'), quantity: 10, pricePerUnit: 40,
      priceEur: 36, linkedCashAssetId: 'cash-usd', createdAt: at('2026-03-02'), updatedAt: at('2026-03-02'),
    } as unknown as AssetTransaction;
    render(<TransactionDialog open onClose={() => {}} asset={STOCK} transaction={trade} />);
    const trigger = await screen.findByRole('combobox', { name: 'Conto di regolamento' });
    expect(trigger.textContent).toBe('Conto Dollari (in USD, non più selezionabile)');
  });
});
