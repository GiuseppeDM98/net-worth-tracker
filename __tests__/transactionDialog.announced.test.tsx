/**
 * TransactionDialog after a saved trade (2026-11-23): the answer's announced-dividend outcome is one
 * `toast.info` sentence, none when nothing was touched; a purchase that opens a bond from 0 asks for
 * its coupon with the quantity the server derived, a sale never does. Invented, round figures.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Asset } from '@/types/assets';

const { createMock, toastMock, scheduleMock } = vi.hoisted(() => ({
  createMock: vi.fn(),
  toastMock: { success: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn() },
  scheduleMock: vi.fn(async () => undefined),
}));

vi.mock('@/lib/firebase/config', () => ({ auth: { currentUser: null }, db: {} }));
vi.mock('sonner', () => ({ toast: toastMock }));
vi.mock('@/contexts/ActiveAccountContext', () => ({ useActiveAccount: () => ({ ownerId: 'owner-1' }) }));
vi.mock('@/lib/hooks/useDemoMode', () => ({ useDemoMode: () => false }));
vi.mock('@/lib/hooks/useAssets', () => ({ useAssets: () => ({ data: [] }) }));
vi.mock('@/lib/hooks/useSettings', () => ({ useSettings: () => ({ data: undefined, isLoading: false }) }));
vi.mock('@/lib/hooks/useExpenses', () => ({ useExpenseCategories: () => ({ data: [], isLoading: false }) }));
vi.mock('@/lib/hooks/useFxRate', () => ({ useFxRate: () => ({ data: undefined, isLoading: false }) }));
vi.mock('@/lib/hooks/useAssetTransactions', () => ({
  useAssetTransactions: () => ({ data: [] }),
  useCreateAssetTransaction: () => ({ mutateAsync: createMock, isPending: false }),
  useUpdateAssetTransaction: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock('@/lib/services/couponScheduling', () => ({ scheduleCouponsForOpenedPosition: scheduleMock }));

import { TransactionDialog } from '@/components/assets/TransactionDialog';

function stubMatchMedia(matches: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches, media: query, onchange: null,
    addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {},
    dispatchEvent: () => false,
  }));
}

const BOND = {
  id: 'bond-1', userId: 'owner-1', ticker: 'BTP-ALFA', name: 'BTP Alfa', type: 'bond', assetClass: 'bonds',
  currency: 'EUR', quantity: 0, currentPrice: 1, averageCost: 1, taxRate: 12.5,
  bondDetails: { couponRate: 3, couponFrequency: 'semiannual', issueDate: new Date('2026-03-10T12:00:00Z'), maturityDate: new Date('2030-03-10T12:00:00Z') },
  lastPriceUpdate: new Date('2026-06-01T12:00:00Z'), createdAt: new Date('2026-06-01T12:00:00Z'), updatedAt: new Date('2026-06-01T12:00:00Z'),
} as unknown as Asset;

function resultWith(announcedDividends: { updated: number; deleted: number }, quantity = 1000) {
  return { transactionId: 't-1', derived: { quantity }, feeRow: 'none', announcedDividends };
}

async function saveTrade(asset: Asset, prefill: { type: 'buy' | 'sell'; quantity: number }) {
  render(<TransactionDialog open onClose={() => {}} asset={asset} prefill={prefill} />);
  fireEvent.change(await screen.findByLabelText(/Prezzo/), { target: { value: '1' } });
  fireEvent.click(screen.getByRole('button', { name: 'Registra operazione' }));
  await waitFor(() => expect(createMock).toHaveBeenCalledOnce());
  await waitFor(() => expect(toastMock.success).toHaveBeenCalled());
}

describe('TransactionDialog — what follows a saved trade', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stubMatchMedia(true);
  });

  // Red when the toast fires unconditionally.
  it('names the announced dividends the trade rewrote, and says nothing when none', async () => {
    createMock.mockResolvedValueOnce(resultWith({ updated: 1, deleted: 0 }));
    await saveTrade(BOND, { type: 'buy', quantity: 1000 });
    expect(toastMock.info).toHaveBeenCalledOnce();
    expect(toastMock.info.mock.calls[0][0]).toContain('1 dividendo annunciato ricalcolato');
  });

  it('shows no announced-dividend toast for zeros', async () => {
    createMock.mockResolvedValueOnce(resultWith({ updated: 0, deleted: 0 }));
    await saveTrade(BOND, { type: 'buy', quantity: 1000 });
    expect(toastMock.info).not.toHaveBeenCalled();
  });

  // Red when the opened-position scheduler is called for every trade type.
  it('asks for the coupon of a bond bought from 0 with the derived quantity', async () => {
    createMock.mockResolvedValueOnce(resultWith({ updated: 0, deleted: 0 }, 1000));
    await saveTrade(BOND, { type: 'buy', quantity: 1000 });
    expect(scheduleMock).toHaveBeenCalledWith(
      expect.objectContaining({ quantityBefore: 0, quantityAfter: 1000, userId: 'owner-1' })
    );
  });

  it('never asks for a coupon after a sale', async () => {
    createMock.mockResolvedValueOnce(resultWith({ updated: 0, deleted: 0 }, 500));
    await saveTrade({ ...BOND, quantity: 1000 } as Asset, { type: 'sell', quantity: 500 });
    expect(scheduleMock).not.toHaveBeenCalled();
  });
});
