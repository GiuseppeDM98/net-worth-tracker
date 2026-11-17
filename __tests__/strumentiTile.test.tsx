/**
 * STRUMENTI's zero-quantity chip (owner, 2026-11-12): ONE rule with the plan editor's —
 * «Mai comprato» only for an instrument created empty for a plan (`createdEmpty`) at quantity 0 with
 * no ledger row; with the ledger not read yet (`tradedAssetIds: null`) the chip stays «Azzerato»,
 * never a guess. Both the desktop table row and the phone row (`AssetRow`) are rendered. Invented
 * names and tickers; the writes and the layout query are mocked.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Asset } from '@/types/assets';

const { layout } = vi.hoisted(() => ({ layout: { compact: false } }));

vi.mock('@/lib/firebase/config', () => ({ auth: { currentUser: null }, db: {} }));
vi.mock('@/lib/hooks/useCompactLayout', () => ({ useCompactLayout: () => layout.compact }));
vi.mock('@/lib/hooks/useAssets', () => ({ useDeleteAsset: () => ({ mutateAsync: vi.fn(), isPending: false }) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { StrumentiTile } from '@/components/assets/StrumentiTile';

const NOW = new Date('2026-11-12T12:00:00');
const etf = (overrides: Partial<Asset>): Asset => ({
  id: 'etf-a', userId: 'owner-1', ticker: 'ETFA.MI', name: 'ETF Alfa', type: 'etf', assetClass: 'equity',
  currency: 'EUR', quantity: 0, currentPrice: 100, lastPriceUpdate: NOW, createdAt: NOW, updatedAt: NOW,
  ...overrides,
}) as Asset;

function chipOf(asset: Asset, tradedAssetIds: ReadonlySet<string> | null): string | null {
  const { container, unmount } = render(
    <QueryClientProvider client={new QueryClient()}>
      <StrumentiTile
        assets={[asset]}
        totalValue={1000}
        performance={{}}
        unitPriceSeries={{}}
        chartColors={['#000']}
        ledgerReady
        isDemo={false}
        ownerId="owner-1"
        onAdd={() => {}}
        onEdit={() => {}}
        onRegisterTrade={() => {}}
        onMovements={() => {}}
        onCalculateTaxes={() => {}}
        tradedAssetIds={tradedAssetIds}
      />
    </QueryClientProvider>,
  );
  const text = container.textContent ?? '';
  unmount();
  if (text.includes('Mai comprato')) return 'Mai comprato';
  if (text.includes('Azzerato')) return 'Azzerato';
  return null;
}

describe.each([
  ['the desktop table', false],
  ['the phone rows', true],
])('STRUMENTI — the zero-quantity chip, %s', (_label, compact) => {
  beforeEach(() => {
    layout.compact = compact;
  });

  // Seen red with the chip reading the flag alone (no ledger check).
  it('created empty, quantity 0, no ledger row → «Mai comprato»', () => {
    expect(chipOf(etf({ createdEmpty: true }), new Set())).toBe('Mai comprato');
  });
  it('created empty but in the ledger (bought, then sold) → «Azzerato»', () => {
    expect(chipOf(etf({ createdEmpty: true }), new Set(['etf-a']))).toBe('Azzerato');
  });
  it('the ledger not read yet → «Azzerato»', () => {
    expect(chipOf(etf({ createdEmpty: true }), null)).toBe('Azzerato');
  });
  it('a zero without the flag → «Azzerato»', () => {
    expect(chipOf(etf({}), new Set())).toBe('Azzerato');
  });
});
