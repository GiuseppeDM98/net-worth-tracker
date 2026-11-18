/**
 * `IdealCompositionDialog` — «Ricalcola il portafoglio modello» (Allocazione › Accumulo). Pinned (2026-11-12):
 * the optimizer runs on «Calcola» only and a new input clears its result; the amount to invest is taken from
 * the accounts, so it cannot exceed them and counts only in «Raggiungibile»; the dialog is a tile (eyebrow and
 * status in the header, the actions in the footer); a property under its mortgage stops the calculation; the
 * save carries the model's basis and nothing saved or seeded holds «Liquidità». Invented names and figures.
 *
 * REGRESSION GUARD, seen red (2026-11-17): the save without `basis`; the optimizer in a `useMemo` (it ran on
 * every keystroke); the amount passed in every mode; the PR's title-only modal; the negative-fixed check dropped.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { Asset, AssetAllocationTarget } from '@/types/assets';

const { saveSpy } = vi.hoisted(() => ({ saveSpy: vi.fn(async () => undefined) }));

vi.mock('@/lib/firebase/config', () => ({ auth: { currentUser: null }, db: {} }));
vi.mock('@/lib/hooks/useDemoMode', () => ({ useDemoMode: () => false }));
vi.mock('@/lib/hooks/useModelPortfolio', () => ({ useSaveModelPortfolio: () => ({ mutateAsync: saveSpy, isPending: false }) }));
vi.mock('@/lib/hooks/useAccumulationPlan', () => ({ useAccumulationPlans: () => ({ data: [] }), selectOpenPlan: () => null }));
vi.mock('@/lib/services/assetService', () => ({
  calculateAssetValue: (a: Asset) => (a.type === 'loan' ? -(a.quantity * a.currentPrice) : a.quantity * a.currentPrice),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock('@/lib/utils/weightOptimizer', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/utils/weightOptimizer')>();
  return { ...actual, runOptimizer: vi.fn(actual.runOptimizer), buildStandaloneCandidates: vi.fn(actual.buildStandaloneCandidates) };
});

import { IdealCompositionDialog } from '@/components/allocation/IdealCompositionDialog';
import { buildStandaloneCandidates, DEFAULT_IDEAL_ALLOCATION, LIQUIDITY_CANDIDATE_KEY, runOptimizer } from '@/lib/utils/weightOptimizer';
import { buildModelBasis } from '@/lib/utils/modelPortfolio';
import { IDEAL_COMPOSITION_FIXED_DIFF, MODEL_TILE_EYEBROW, NEGATIVE_LIQUIDITY_NOTE, OPTIMIZER_MODE_LABELS } from '@/lib/utils/weightOptimizerNarrative';

function makeAsset(id: string, overrides: Partial<Asset> = {}): Asset {
  return {
    id,
    userId: 'owner-1',
    ticker: id.toUpperCase(),
    name: id.toUpperCase(),
    type: 'etf',
    assetClass: 'equity',
    currency: 'EUR',
    quantity: 1,
    currentPrice: 1000,
    lastPriceUpdate: new Date(0),
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...overrides,
  };
}

const account = makeAsset('conto', { type: 'cash', assetClass: 'cash', currentPrice: 10000 });
const etfA = makeAsset('etf-a', { currentPrice: 30000 });
const etfB = makeAsset('etf-b', { assetClass: 'bonds', currentPrice: 10000 });
const targets: AssetAllocationTarget = { equity: { targetPercentage: 70 }, bonds: { targetPercentage: 20 }, cash: { targetPercentage: 10 } };
const criteria = { ...DEFAULT_IDEAL_ALLOCATION, enabled: true, leveragePriority: 'off' as const };
const basis = buildModelBasis({ targets, idealAllocation: criteria }, undefined);

function renderDialog(allAssets: Asset[] = [account, etfA, etfB], onCreatePac = vi.fn()) {
  render(
    <IdealCompositionDialog
      open
      onClose={() => {}}
      ownerId="owner-1"
      allAssets={allAssets}
      targets={targets}
      targetLeverageRatio={1}
      idealAllocation={criteria}
      model={null}
      basis={basis}
      onCreatePac={onCreatePac}
    />
  );
  return { onCreatePac };
}

const amountField = () => screen.getByLabelText(/Importo da investire/) as HTMLInputElement;
const calcola = () => screen.getByRole('button', { name: 'Calcola' });
const flat = (text: string | null | undefined) => (text ?? '').replace(/[  ]/g, ' ');

beforeEach(() => {
  saveSpy.mockClear();
  vi.mocked(runOptimizer).mockClear();
  vi.mocked(buildStandaloneCandidates).mockClear();
});

describe('IdealCompositionDialog — the save and the PAC seed', () => {
  it('«Calcola» → «Salva come portafoglio modello» saves with the basis, and no «Liquidità» row', async () => {
    renderDialog();
    fireEvent.click(calcola());
    fireEvent.click(screen.getByRole('button', { name: 'Salva come portafoglio modello' }));
    await vi.waitFor(() => expect(saveSpy).toHaveBeenCalledTimes(1));
    const call = (saveSpy.mock.calls[0] as unknown[])[0] as { input: { weights: Array<{ assetId: string }> }; basis: unknown };
    expect(call.basis).toBe(basis);
    expect(call.input.weights.map((w) => w.assetId)).not.toContain(LIQUIDITY_CANDIDATE_KEY);
    expect(call.input.weights.length).toBeGreaterThan(0);
  });

  it('«Crea un PAC con questi pesi» hands a seed with no «Liquidità» position', () => {
    const { onCreatePac } = renderDialog();
    fireEvent.click(calcola());
    fireEvent.click(screen.getByRole('button', { name: 'Crea un PAC con questi pesi' }));
    expect(onCreatePac).toHaveBeenCalledTimes(1);
    const seed = onCreatePac.mock.calls[0][0] as { positions: Array<{ buyAssetId: string }> };
    expect(seed.positions.length).toBeGreaterThan(0);
    expect(seed.positions.map((p) => p.buyAssetId)).not.toContain(LIQUIDITY_CANDIDATE_KEY);
  });
});

describe('IdealCompositionDialog — the optimizer runs on «Calcola» only', () => {
  it('0 runs while typing, 1 on «Calcola», the result cleared by the next keystroke', () => {
    renderDialog();
    fireEvent.change(amountField(), { target: { value: '2' } });
    fireEvent.change(amountField(), { target: { value: '20' } });
    fireEvent.change(amountField(), { target: { value: '200' } });
    expect(runOptimizer).toHaveBeenCalledTimes(0);
    fireEvent.click(calcola());
    expect(runOptimizer).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Salva come portafoglio modello' })).toBeTruthy();
    fireEvent.change(amountField(), { target: { value: '2000' } });
    expect(screen.queryByRole('button', { name: 'Salva come portafoglio modello' })).toBeNull();
    expect(runOptimizer).toHaveBeenCalledTimes(1);
  });
});

describe('IdealCompositionDialog — the amount comes from the accounts', () => {
  it('an amount above the accounts is an error named by the field, and «Calcola» is off', () => {
    renderDialog();
    fireEvent.change(amountField(), { target: { value: '12000' } });
    const error = screen.getByText("Sui conti hai 10.000 €: l'importo non può superarla.", { normalizer: flat });
    expect(amountField().getAttribute('aria-invalid')).toBe('true');
    expect(amountField().getAttribute('aria-describedby')?.split(' ')).toContain(error.id);
    expect((calcola() as HTMLButtonElement).disabled).toBe(true);
  });

  it('the amount reaches the candidates in «Raggiungibile» only', () => {
    renderDialog();
    fireEvent.change(amountField(), { target: { value: '4000' } });
    const lastInvest = () => vi.mocked(buildStandaloneCandidates).mock.calls.at(-1)?.[2];
    expect(lastInvest()).toBe(0);
    fireEvent.click(screen.getByRole('radio', { name: OPTIMIZER_MODE_LABELS.reachable }));
    expect(lastInvest()).toBe(4000);
  });
});

describe('IdealCompositionDialog — a tile lifted off the page', () => {
  it('the eyebrow and the status sit in the header, the actions in the footer', () => {
    renderDialog();
    const title = screen.getByRole('heading', { name: 'Ricalcola il portafoglio modello' });
    const header = title.parentElement!;
    expect(header.textContent).toContain(MODEL_TILE_EYEBROW);
    const status = screen.getByRole('status');
    expect(header.contains(status)).toBe(true);
    expect(flat(status.textContent)).toBe('Scegli la modalità e premi «Calcola»: niente si salva finché non lo chiedi.');
    // The body holds the amount field; the actions are outside it.
    const body = amountField().closest('.overflow-y-auto')!;
    expect(body.contains(calcola())).toBe(false);
    expect(body.contains(screen.getByRole('button', { name: 'Annulla' }))).toBe(false);
  });
});

// A fixed share never reads as euro to buy or sell: its difference is only the rounding to hundredths of a point
// (owner, collaudo 2026-11-17: «Abitazione principale … +11,35 €»). Seen red with the euro printed on every row.
describe('IdealCompositionDialog — a fixed share has no difference in euro', () => {
  it('the row of a property reads «—», a tradable row a figure', () => {
    const house = makeAsset('casa', { type: 'realestate', assetClass: 'realestate', currentPrice: 200000, allocationRole: 'frozen', name: 'Casa' });
    renderDialog([account, etfA, etfB, house]);
    fireEvent.click(calcola());
    const lastCell = (label: string) => {
      const cells = screen.getByRole('rowheader', { name: label }).closest('tr')!.querySelectorAll('td');
      return flat(cells[cells.length - 1].textContent);
    };
    expect(lastCell('Casa')).toBe(IDEAL_COMPOSITION_FIXED_DIFF);
    expect(lastCell('ETF-A')).toMatch(/€$/);
  });
});

describe('IdealCompositionDialog — a base the model cannot run on', () => {
  const loan = (id: string, eur: number, financedAssetId?: string) =>
    makeAsset(id, { type: 'loan', assetClass: 'cash', currentPrice: eur, financedAssetId });

  it('a property under its mortgage: «Calcola» off, the reading says why in the negative tone', () => {
    const house = makeAsset('casa', { type: 'realestate', assetClass: 'realestate', currentPrice: 100000, allocationRole: 'frozen', name: 'Casa' });
    renderDialog([account, etfA, house, loan('mutuo', 120000, 'casa')]);
    expect((calcola() as HTMLButtonElement).disabled).toBe(true);
    const status = screen.getByRole('status');
    expect(flat(status.textContent)).toBe('Casa vale meno dei suoi debiti: il modello non si calcola su una base con una quota negativa.');
    expect(status.className).toContain('text-destructive');
  });

  it('accounts under the personal loans: «Calcola» on, the reading ends with the note', () => {
    renderDialog([account, etfA, etfB, loan('prestito', 12000)]);
    expect((calcola() as HTMLButtonElement).disabled).toBe(false);
    expect(flat(screen.getByRole('status').textContent).endsWith(NEGATIVE_LIQUIDITY_NOTE)).toBe(true);
  });
});
