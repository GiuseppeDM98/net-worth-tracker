/**
 * `ConsulenteHandoff` (components/allocation/ConsulenteHandoff.tsx, owner 2026-11-12) — «Dal Consulente» on the
 * Accumulo tab: three views of ONE state, so two modals are never stacked. «Crea» swaps the dialog for
 * `AssetDialog` with the row's prefill, «Apri l'editor» for the plan editor with the seed and the kept ids; a row
 * just created waits for the assets' re-read. `AssetDialog` and the editor are stubbed: each prints what it got.
 * Invented names (ETF ornitorinco, ETF fenicottero).
 */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { Asset, AssetPrefill } from '@/types/assets';
import type { PlanSeedDraft } from '@/types/accumulationPlan';
import type { AllocationAdviceProposal } from '@/lib/utils/allocationAdviceProposal';

window.matchMedia = (query: string): MediaQueryList =>
  ({ matches: false, media: query, onchange: null, addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false }) as unknown as MediaQueryList;

vi.mock('@/lib/firebase/config', () => ({ db: {}, auth: { currentUser: null } }));
vi.mock('@/lib/utils/authFetch', () => ({ authenticatedFetch: vi.fn() }));
vi.mock('@/lib/services/dashboardOverviewInvalidation', () => ({ invalidateDashboardOverviewSummary: vi.fn() }));
vi.mock('firebase/firestore', () => ({ doc: vi.fn(), getDoc: vi.fn(), setDoc: vi.fn(), deleteField: vi.fn() }));
vi.mock('@/lib/services/assetService', () => ({
  calculateAssetValue: (a: Asset) => (a.type === 'loan' ? -(a.quantity * a.currentPrice) : a.quantity * a.currentPrice),
}));
vi.mock('@/lib/services/assetAllocationService', () => ({ deriveTargetLeverageRatio: () => 1 }));
vi.mock('@/components/assets/AssetDialog', () => ({
  AssetDialog: ({ prefill, onCreated, onClose }: { prefill: AssetPrefill; onCreated: (id: string) => void; onClose: () => void }) => (
    <div data-testid="asset-dialog">
      {JSON.stringify(prefill)}
      <button type="button" onClick={() => onCreated('nuovo')}>stub creato</button>
      <button type="button" onClick={onClose}>stub chiudi</button>
    </div>
  ),
}));
vi.mock('@/components/allocation/AccumulationPlanDialog', () => ({
  AccumulationPlanDialog: ({ seedDraft, advisorKeepAssetIds }: { seedDraft: PlanSeedDraft; advisorKeepAssetIds: string[] }) => (
    <div data-testid="plan-dialog">{JSON.stringify({ positions: seedDraft.positions.length, keep: advisorKeepAssetIds })}</div>
  ),
}));

import { ConsulenteHandoff } from '@/components/allocation/ConsulenteHandoff';

function makeAsset(id: string, overrides: Partial<Asset> = {}): Asset {
  return {
    id, userId: 'u1', ticker: id.toUpperCase(), name: id, type: 'etf', assetClass: 'equity', currency: 'EUR',
    quantity: 10, currentPrice: 600, lastPriceUpdate: new Date(0), createdAt: new Date(0), updatedAt: new Date(0),
    ...overrides,
  };
}

const PROPOSAL: AllocationAdviceProposal = {
  summary: 'Settanta e trenta.',
  classes: [
    { assetClass: 'equity', targetPercentage: 70, rationale: '', subTargets: [{ name: 'Mondo', targetPercentage: 100, instrument: 'ETF ornitorinco' }] },
    { assetClass: 'bonds', targetPercentage: 30, rationale: '', subTargets: [{ name: 'Euro', targetPercentage: 100, instrument: 'ETF fenicottero (IE00BBBBBBB2)' }] },
  ],
  assetRoles: [],
  goals: [],
  reviewByIso: '2027-11-18',
  reviewReason: '',
  risks: [],
};

const ORNITORINCO = makeAsset('ETF ornitorinco', { subCategory: 'Mondo' });
const KEPT = 'ETF ornitorinco';

function renderHandoff(assets: Asset[]) {
  return render(
    <ConsulenteHandoff
      ownerId="u1"
      basis={{} as never}
      proposal={PROPOSAL}
      candidates={null}
      keepAssets={[KEPT]}
      allAssets={assets}
      targets={null}
      band={{ mode: 'relative', value: 20 } as never}
      targetLeverageRatio={1}
      idealAllocation={null}
      model={null}
      onAssetsChanged={() => {}}
      onClose={() => {}}
    />,
  );
}

const dialog = () => screen.getByRole('dialog');

describe('ConsulenteHandoff — the three views', () => {
  // Mutation: the hand-off rendered under the AssetDialog (both mounted) → red.
  it('«Crea» renders only AssetDialog, with the row\'s prefill; back, the row waits for the re-read', () => {
    renderHandoff([ORNITORINCO]);
    expect(within(dialog()).getByText('senza ticker: inseriscilo per il prezzo')).not.toBeNull();
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Crea' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    const stub = screen.getByTestId('asset-dialog');
    expect(JSON.parse(stub.firstChild!.textContent!)).toMatchObject({ name: 'ETF fenicottero', isin: 'IE00BBBBBBB2', ticker: '', assetClass: 'bonds', subCategory: 'Euro' });
    // Mutation: `createdNames` dropped → «Crea» offered again before the re-read → red.
    fireEvent.click(screen.getByRole('button', { name: 'stub creato' }));
    fireEvent.click(screen.getByRole('button', { name: 'stub chiudi' }));
    expect(within(dialog()).getByText('creato, in aggiornamento')).not.toBeNull();
    expect(within(dialog()).queryByRole('button', { name: 'Crea' })).toBeNull();
  });

  it('«Apri l\'editor» renders only the editor, with the seed and the kept ids', () => {
    renderHandoff([ORNITORINCO]);
    fireEvent.click(within(dialog()).getByRole('button', { name: "Apri l'editor" }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(JSON.parse(screen.getByTestId('plan-dialog').textContent!)).toEqual({ positions: 1, keep: ['ETF ornitorinco'] });
  });

  it('nothing matched: «Apri l\'editor» disabled, the reading says to create one first', () => {
    renderHandoff([]);
    expect((within(dialog()).getByRole('button', { name: "Apri l'editor" }) as HTMLButtonElement).disabled).toBe(true);
    expect(dialog().textContent).toContain("Nessuno strumento del piano è ancora fra i tuoi asset: crea almeno uno di quelli proposti per aprire l'editor.");
  });
});

describe('ConsulenteHandoff — the modal\'s parts', () => {
  // Mutation: the buttons moved into the body → red.
  it('eyebrow, title and reading in the header; «Annulla» and «Apri l\'editor» in the footer, not the body', () => {
    renderHandoff([ORNITORINCO]);
    const title = within(dialog()).getByRole('heading', { name: 'Un piano verso la nuova allocazione' });
    const header = title.parentElement!;
    expect(header.textContent).toContain('Dal Consulente');
    expect(header.textContent).toContain("Quote calcolate dall'app");
    const body = dialog().querySelector('.overflow-y-auto')!;
    expect(within(body as HTMLElement).queryByRole('button', { name: 'Annulla' })).toBeNull();
    expect(within(body as HTMLElement).queryByRole('button', { name: "Apri l'editor" })).toBeNull();
    expect(within(dialog()).getByRole('button', { name: 'Annulla' })).not.toBeNull();
    expect(within(body as HTMLElement).getByText(/Mondo · ETF ornitorinco/)).not.toBeNull();
  });
});
