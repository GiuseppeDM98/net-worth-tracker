/**
 * AssetMovementsDialog on a foreign instrument (2026-11-23): a trade that stored its rate names it
 * under the price, in the table (from sm:) and in the phone's row alike; a trade saved before the
 * rate was kept names none. The phone's row prints a native fee beside its euro conversion.
 * Invented, round figures.
 */
import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Asset } from '@/types/assets';
import type { AssetTransaction } from '@/types/assetTransactions';

vi.mock('@/lib/firebase/config', () => ({ auth: { currentUser: null }, db: {} }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), info: vi.fn(), error: vi.fn() } }));
vi.mock('@/contexts/ActiveAccountContext', () => ({ useActiveAccount: () => ({ ownerId: 'owner-1' }) }));
vi.mock('@/lib/hooks/useDemoMode', () => ({ useDemoMode: () => false }));
vi.mock('@/components/assets/TransactionDialog', () => ({ TransactionDialog: () => null }));
vi.mock('@/lib/hooks/useAssetTransactions', () => ({
  useAssetTransactions: () => ({ data: [OLD_BUY, STATEMENT_BUY], isLoading: false, isFetching: false, dataUpdatedAt: Date.now() }),
  useDeleteAssetTransaction: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

import { AssetMovementsDialog } from '@/components/assets/AssetMovementsDialog';

const at = (iso: string) => new Date(`${iso}T12:00:00Z`);
// 10 × 50 USD with a 5 USD fee, settled at 460 € in total: rate 460/505, fee 4,55 €.
const STATEMENT_BUY = {
  id: 't-fx', userId: 'owner-1', assetId: 'a-1', type: 'buy', date: at('2026-11-10'), quantity: 10, pricePerUnit: 50,
  priceEur: 45.545, fees: 4.55, feesNative: 5, settledTotalEur: 460, fxRate: 460 / 505, fxSource: 'statement',
  createdAt: at('2026-11-10'), updatedAt: at('2026-11-10'),
} as unknown as AssetTransaction;
const OLD_BUY = {
  id: 't-old', userId: 'owner-1', assetId: 'a-1', type: 'buy', date: at('2026-03-02'), quantity: 10, pricePerUnit: 40,
  priceEur: 36, createdAt: at('2026-03-02'), updatedAt: at('2026-03-02'),
} as unknown as AssetTransaction;
const ASSET = {
  id: 'a-1', userId: 'owner-1', ticker: 'ORNI', name: 'Ornitorinco Inc', type: 'stock', assetClass: 'equity', currency: 'USD',
  quantity: 20, currentPrice: 50, averageCost: 45, createdAt: at('2026-03-02'), updatedAt: at('2026-11-10'),
} as unknown as Asset;

const RATE_LINE = "EUR/USD 1,0978 · dal totale dell'estratto";

function stubMatchMedia() {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: true, media: query, onchange: null,
    addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {},
    dispatchEvent: () => false,
  }));
}

describe('AssetMovementsDialog — the rate of a foreign trade', () => {
  beforeEach(() => {
    stubMatchMedia();
  });

  it('names the rate inside the table row of the trade that stored it, and in no other row', () => {
    render(<AssetMovementsDialog open onClose={() => {}} asset={ASSET} />);
    const rows = within(screen.getByRole('table')).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(2);
    const [fxRow, oldRow] = rows; // newest first
    expect(within(fxRow).getByText(RATE_LINE)).toBeTruthy();
    expect(within(oldRow).queryByText(/EUR\/USD/)).toBeNull();
  });

  it('names it in the phone row too, with the native fee beside its euro', () => {
    render(<AssetMovementsDialog open onClose={() => {}} asset={ASSET} />);
    // Two occurrences of the line: the table's cell and the phone's row (the CSS picks one).
    expect(screen.getAllByText(RATE_LINE)).toHaveLength(2);
    expect(screen.getByText('Commissioni 5,00 USD (4,55 €)')).toBeTruthy();
  });
});
