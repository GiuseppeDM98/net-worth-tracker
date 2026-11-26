/**
 * STRUMENTI's zero-quantity chip (owner, 2026-11-12): ONE rule with the plan's path —
 * «Mai comprato» only for an instrument created empty for a plan (`createdEmpty`) at quantity 0 with
 * no ledger row; with the ledger not read yet (`tradedAssetIds: null`) the chip stays «Azzerato»,
 * never a guess. Both the desktop table row and the phone row (`AssetRow`) are rendered. Invented
 * names and tickers; the writes and the layout query are mocked.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Asset } from '@/types/assets';

const { layout, deleteMutate, toastMock } = vi.hoisted(() => ({
  layout: { compact: false },
  deleteMutate: vi.fn(),
  toastMock: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock('@/lib/firebase/config', () => ({ auth: { currentUser: null }, db: {} }));
vi.mock('@/lib/hooks/useCompactLayout', () => ({ useCompactLayout: () => layout.compact }));
vi.mock('@/lib/hooks/useAssets', () => ({ useDeleteAsset: () => ({ mutateAsync: deleteMutate, isPending: false }) }));
vi.mock('sonner', () => ({ toast: toastMock }));
// The owner filter is a Radix Select jsdom cannot open: a native one with the same props stands in.
vi.mock('@/components/ui/select', () => ({
  Select: ({ value, onValueChange, children }: { value: string; onValueChange: (v: string) => void; children: React.ReactNode }) => (
    <select aria-label="Intestatario" value={value} onChange={(event) => onValueChange(event.target.value)}>
      {children}
    </select>
  ),
  SelectItem: ({ value, children }: { value: string; children: React.ReactNode }) => <option value={value}>{children}</option>,
  SelectTrigger: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  SelectValue: () => null,
  SelectContent: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));

import { StrumentiTile } from '@/components/assets/StrumentiTile';
import { RowActionsHold } from '@/components/ui/row-actions-hold';
import { AssetDeleteRefusedError } from '@/lib/services/assetService';
import { ALL_ARCHIVED_SENTENCE, describeDeleteRefusal, summarizeLedgerFootprints } from '@/lib/utils/instrumentArchive';
import type { AssetTransaction } from '@/types/assetTransactions';

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

// ─── 2026-11-23: the closed group of sold-out instruments, the sentence, the trash that refuses ───
// Each case was seen red with its mutation: `live` → `visibleAssets` in `sortedAssets`; the group fed from `assets`
// instead of `visibleAssets`; the group rendered in the table branch only; the `operations > 0` branch of the trash
// dropped; `deleteAsset`'s catch rewrapping the typed error; the empty table kept when every instrument is archived.

const trade = (assetId: string, type: 'buy' | 'sell', date: string, isBaseline = false): AssetTransaction =>
  ({ id: `${assetId}-${type}-${date}`, assetId, type, date: new Date(`${date}T12:00:00`), isBaseline }) as AssetTransaction;

const ornitorinco = etf({ id: 'orni', name: 'Ornitorinco', ticker: 'ORNI.MI', quantity: 0 });
const fenicottero = etf({ id: 'feni', name: 'Fenicottero', ticker: 'FENI.MI', quantity: 0, createdEmpty: true });
const held = etf({ id: 'etf-a', quantity: 5 });
const footprints = summarizeLedgerFootprints([
  trade('orni', 'buy', '2026-01-10'),
  trade('orni', 'sell', '2026-03-09'),
  trade('etf-a', 'buy', '2026-01-10'),
  trade('etf-a', 'buy', '2026-02-10'),
  trade('etf-a', 'sell', '2026-02-20'),
]);

function renderTile(assets: Asset[], overrides: Partial<React.ComponentProps<typeof StrumentiTile>> = {}, rereading = false) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <RowActionsHold held={rereading}>
      <StrumentiTile
        assets={assets}
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
        tradedAssetIds={new Set(footprints.keys())}
        ledgerFootprints={footprints}
        {...overrides}
      />
      </RowActionsHold>
    </QueryClientProvider>,
  );
}

describe.each([
  ['the desktop table', false],
  ['the phone rows', true],
])('STRUMENTI — the sold-out group, %s', (_label, compact) => {
  beforeEach(() => {
    layout.compact = compact;
    window.localStorage.clear();
    toastMock.info.mockClear();
    toastMock.error.mockClear();
    deleteMutate.mockReset();
  });

  // R1 / R3
  it('moves a sold instrument out of the list into a closed group, opened on its sale and its two actions', async () => {
    const onMovements = vi.fn();
    const onRegisterTrade = vi.fn();
    renderTile([ornitorinco, held], { onMovements, onRegisterTrade });

    expect(screen.queryByText('Ornitorinco')).toBeNull();
    const group = await screen.findByRole('button', { name: '1 strumento azzerato' });
    expect(group.getAttribute('aria-expanded')).toBe('false');

    fireEvent.click(group);
    expect(group.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getAllByText('Ornitorinco')).toHaveLength(1);
    expect(screen.getByText(/venduto il 09\/03\/2026/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Movimenti di Ornitorinco' }));
    fireEvent.click(screen.getByRole('button', { name: 'Compra Ornitorinco' }));
    expect(onMovements).toHaveBeenCalledWith(expect.objectContaining({ id: 'orni' }));
    expect(onRegisterTrade).toHaveBeenCalledWith(expect.objectContaining({ id: 'orni' }));
  });

  it('keeps «Mai comprato» in the list and archives nothing while the ledger is unread', () => {
    renderTile([fenicottero, ornitorinco]);
    expect(screen.getByText('Fenicottero')).toBeTruthy();
    expect(screen.getByText('Mai comprato')).toBeTruthy();
    cleanup();

    renderTile([ornitorinco], { ledgerFootprints: null });
    expect(screen.getByText('Ornitorinco')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /azzerat/ })).toBeNull();
  });

  // R2
  it('obeys the owner filter, remembers its open state and ignores the sorting of the list', async () => {
    const zeta = etf({ id: 'zeta', name: 'Zeta', ticker: 'ZETA.MI', quantity: 0, ownerMemberId: 'm1' });
    const alfa = etf({ id: 'alfa', name: 'Alfa', ticker: 'ALFA.MI', quantity: 0 });
    const both = summarizeLedgerFootprints([trade('zeta', 'sell', '2026-03-09'), trade('alfa', 'sell', '2026-01-09')]);
    const members = [{ id: 'm1', name: 'Marco' }];
    const { unmount } = renderTile([alfa, zeta, held], { ledgerFootprints: both, members });

    fireEvent.click(await screen.findByRole('button', { name: '2 strumenti azzerati' }));
    const namesOf = () => screen.getAllByRole('listitem').map((li) => li.textContent?.slice(0, 4));
    expect(namesOf()).toEqual(['Zeta', 'Alfa']);

    if (!compact) {
      fireEvent.click(within(screen.getByRole('table')).getByRole('button', { name: /^Nome/ }));
      expect(namesOf()).toEqual(['Zeta', 'Alfa']);
    }

    fireEvent.change(screen.getByLabelText('Intestatario'), { target: { value: 'm1' } });
    expect(screen.getByRole('button', { name: '1 strumento azzerato' })).toBeTruthy();
    expect(screen.queryByText('Alfa')).toBeNull();

    unmount();
    renderTile([alfa, zeta, held], { ledgerFootprints: both, members });
    expect(screen.getByRole('button', { name: '2 strumenti azzerati' }).getAttribute('aria-expanded')).toBe('true');
  });

  // The hold of components/ui/row-actions-hold.tsx (2026-11-26). Mutation that turns it red: `held` dropped from
  // the row's «Modifica», from the tile's `DeleteButton` or from `AssetRow`'s two buttons.
  it('holds «Modifica» and «Elimina» of a row while the assets on screen are a restored copy being reread', () => {
    const lone = etf({ id: 'lone', name: 'Solitario', quantity: 5 });
    const { unmount } = renderTile([lone], { ledgerFootprints: summarizeLedgerFootprints([]) }, true);
    const actions = () => [...screen.getAllByRole('button', { name: /^Modifica/ }), ...screen.getAllByRole('button', { name: 'Elimina Solitario' })] as HTMLButtonElement[];
    expect(actions().length).toBeGreaterThanOrEqual(2);
    for (const button of actions()) expect(button.disabled).toBe(true);
    unmount();
    renderTile([lone], { ledgerFootprints: summarizeLedgerFootprints([]) });
    for (const button of actions()) expect(button.disabled).toBe(false);
  });

  // R4
  it('does not arm the trash of an instrument with operations of the owner: it says why', () => {
    renderTile([held]);
    fireEvent.click(screen.getByRole('button', { name: 'Elimina ETF Alfa' }));
    expect(toastMock.info).toHaveBeenCalledWith(describeDeleteRefusal('ETF Alfa', 3));
    expect(screen.queryByLabelText(/Premi di nuovo/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Elimina ETF Alfa' })).toBeTruthy();
  });

  it('arms the trash of an instrument with no row, and of one with the opening position alone', () => {
    const lone = etf({ id: 'lone', name: 'Solitario', quantity: 5 });
    const opening = etf({ id: 'opening', name: 'Apertura', quantity: 5 });
    const ledger = summarizeLedgerFootprints([trade('opening', 'buy', '2025-12-31', true)]);
    renderTile([lone, opening], { ledgerFootprints: ledger });

    fireEvent.click(screen.getByRole('button', { name: 'Elimina Solitario' }));
    expect(screen.getByLabelText('Premi di nuovo per eliminare Solitario')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Elimina Apertura' }));
    expect(screen.getByLabelText('Premi di nuovo per eliminare Apertura')).toBeTruthy();
    expect(toastMock.info).not.toHaveBeenCalled();
  });

  // R5
  it('says the refusal, not a failure, when the server answers 409 after the ledger was thought empty', async () => {
    deleteMutate.mockRejectedValue(new AssetDeleteRefusedError(2));
    renderTile([held], { ledgerFootprints: null });

    fireEvent.click(screen.getByRole('button', { name: 'Elimina ETF Alfa' }));
    fireEvent.click(screen.getByLabelText('Premi di nuovo per eliminare ETF Alfa'));

    await waitFor(() => expect(toastMock.info).toHaveBeenCalledWith(describeDeleteRefusal('ETF Alfa', 2)));
    expect(toastMock.error).not.toHaveBeenCalled();
  });

  // R6
  it('with every instrument sold out, a sentence takes the place of the table and the group follows', async () => {
    const { container } = renderTile([ornitorinco]);
    expect(screen.getByText(ALL_ARCHIVED_SENTENCE)).toBeTruthy();
    expect(container.querySelector('thead')).toBeNull();
    expect(await screen.findByRole('button', { name: '1 strumento azzerato' })).toBeTruthy();
  });
});
