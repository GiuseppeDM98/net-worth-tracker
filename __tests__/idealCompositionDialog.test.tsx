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
import type { PlanSeedDraft } from '@/types/accumulationPlan';

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
import { buildStandaloneCandidates, DEFAULT_IDEAL_ALLOCATION, LIQUIDITY_CANDIDATE_KEY, runOptimizer, type OptimizerResult } from '@/lib/utils/weightOptimizer';
import { formatPercentageIt } from '@/lib/utils/formatters';
import { buildModelBasis } from '@/lib/utils/modelPortfolio';
import {
  describeTargetedSaleTotal,
  IDEAL_COMPOSITION_FIXED_DIFF,
  IDEAL_COMPOSITION_LOCK_NOT_TRADED,
  IDEAL_COMPOSITION_LOCK_UNKNOWN_RATE,
  IDEAL_COMPOSITION_LOSSES_NOTE,
  IDEAL_COMPOSITION_TAX_CAP_LABEL,
  MODEL_TILE_EYEBROW,
  NEGATIVE_LIQUIDITY_NOTE,
  OPTIMIZER_MODE_LABELS,
} from '@/lib/utils/weightOptimizerNarrative';

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

// «Con vendite mirate» (2026-11-18): the rows and the cap before «Calcola», the forced locks said in words, the
// total line as the reading, a new cap or box clears the result, the seed sells only instruments.
describe('IdealCompositionDialog — «Con vendite mirate»', () => {
  // Base 100.000 €: the accounts 20.000 (20%), ETF-A at a 20.000 € gain (26%), ETF-B at par (12,5%), BTC with no rate, a pension fund.
  const conto = makeAsset('conto', { type: 'cash', assetClass: 'cash', currentPrice: 20000 });
  const gainer = makeAsset('etf-a', { quantity: 100, currentPrice: 500, averageCost: 300, taxRate: 26 });
  const atPar = makeAsset('etf-b', { assetClass: 'bonds', quantity: 100, currentPrice: 200, averageCost: 200, taxRate: 12.5 });
  const btc = makeAsset('btc', { type: 'crypto', currentPrice: 5000, averageCost: 1000, name: 'BTC' });
  const fondo = makeAsset('fondo', { type: 'pensionFund', assetClass: 'bonds', currentPrice: 5000, name: 'FONDO' });
  const assets = [conto, gainer, atPar, btc, fondo];

  const chooseTargeted = () => fireEvent.click(screen.getByRole('radio', { name: OPTIMIZER_MODE_LABELS.targeted }));
  const capField = () => screen.getByLabelText(IDEAL_COMPOSITION_TAX_CAP_LABEL) as HTMLInputElement;
  const rowOf = (label: string) => screen.getByRole('rowheader', { name: new RegExp(`^${label}`) }).closest('tr')!;
  const saveButton = () => screen.queryByRole('button', { name: 'Salva come portafoglio modello' });

  it('shows the rows and «Tasse massime (€)» before «Calcola», the liquidity at its share of the base', () => {
    renderDialog(assets);
    chooseTargeted();
    expect(runOptimizer).toHaveBeenCalledTimes(0);
    expect(capField()).toBeTruthy();
    const cells = rowOf('Liquidità').querySelectorAll('td');
    // The box, then the current weight: the builder's 20.000 €, never the 1 € stand-in.
    expect(flat(cells[1].textContent)).toBe(flat(formatPercentageIt(20, 1)));
    expect(flat(rowOf('ETF-A').querySelectorAll('td')[1].textContent)).toBe(flat(formatPercentageIt(50, 1)));
  });

  it('ticks and disables a row with no rate or not traded, says why in words, leaves the liquidity free', () => {
    renderDialog(assets);
    chooseTargeted();
    const box = (label: string) => screen.getByRole('checkbox', { name: label });
    expect(box('BTC').getAttribute('data-state')).toBe('checked');
    expect(box('BTC').hasAttribute('disabled')).toBe(true);
    expect(rowOf('BTC').textContent).toContain(IDEAL_COMPOSITION_LOCK_UNKNOWN_RATE);
    expect(box('FONDO').hasAttribute('disabled')).toBe(true);
    expect(rowOf('FONDO').textContent).toContain(IDEAL_COMPOSITION_LOCK_NOT_TRADED);
    expect(box('Liquidità').hasAttribute('disabled')).toBe(false);
    expect(box('ETF-A').hasAttribute('disabled')).toBe(false);
  });

  it('makes the total line the reading, and the losses note the first line under the table', () => {
    renderDialog(assets);
    chooseTargeted();
    fireEvent.change(capField(), { target: { value: '100000' } });
    fireEvent.click(calcola());
    const result = vi.mocked(runOptimizer).mock.results[0].value as OptimizerResult;
    expect(result.status).toBe('ok');
    expect(flat(screen.getByRole('status').textContent)).toBe(flat(describeTargetedSaleTotal(result.sale!)));
    expect(flat(screen.getByRole('table').nextElementSibling?.textContent)).toBe(IDEAL_COMPOSITION_LOSSES_NOTE);
  });

  it('clears the result on a cap keystroke and on a box tick, with no extra run', () => {
    renderDialog(assets);
    chooseTargeted();
    fireEvent.click(calcola());
    expect(saveButton()).toBeTruthy();
    fireEvent.change(capField(), { target: { value: '200' } });
    expect(saveButton()).toBeNull();
    fireEvent.click(calcola());
    expect(saveButton()).toBeTruthy();
    fireEvent.click(screen.getByRole('checkbox', { name: 'ETF-A' }));
    expect(saveButton()).toBeNull();
    expect(runOptimizer).toHaveBeenCalledTimes(2);
  });

  it('seeds the PAC with the instruments’ sales only, never the liquidity nor a property, and keeps the cap', () => {
    // A property off the hundredth grid: 130.000 € of 230.000 is 56,5217%, fixed at 56,52% — locked, it is held
    // exactly (no 4 € «sale»); the dialog's filter keeps it out of the seed even so.
    const casa = makeAsset('casa', { type: 'realestate', assetClass: 'realestate', currentPrice: 130000, allocationRole: 'frozen', name: 'Casa' });
    // A money-market fund at par: in the base, out of the model (no plan buys it), so the optimizer may trim it.
    const monetario = makeAsset('monetario', { assetClass: 'cash', quantity: 400, currentPrice: 100, averageCost: 50, taxRate: 26, name: 'MONETARIO' });
    const { onCreatePac } = renderDialog([...assets, casa, monetario]);
    chooseTargeted();
    fireEvent.change(capField(), { target: { value: '500' } });
    fireEvent.click(calcola());
    const result = vi.mocked(runOptimizer).mock.results[0].value as OptimizerResult;
    expect(result.sale!.liquiditySpentEur).toBeGreaterThan(0);
    expect(result.sale!.perCandidate.find((p) => p.key === 'casa')!.soldEur).toBe(0);
    expect(result.warnings).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: 'Crea un PAC con questi pesi' }));
    const seed = onCreatePac.mock.calls[0][0] as PlanSeedDraft;
    const sold = (seed.disposals ?? []).map((d) => d.assetId);
    expect(sold).toContain('etf-b');
    // Brought to 0%, ETF-B leaves the plan: sold whole (no `quantity`), never down to its last share (collaudo 2026-11-18).
    expect(result.weights.find((w) => w.key === 'etf-b')!.proposedPct).toBe(0);
    expect(seed.disposals!.find((d) => d.assetId === 'etf-b')).toEqual({ assetId: 'etf-b', estimatedProceedsEur: 20000, status: 'planned' });
    // Sold whole only what the proposal brings to 0% — never one it keeps above zero, even out of the model
    // (the tour, 2026-11-18: a money-market fund only trimmed was sold whole).
    for (const disposal of seed.disposals!) {
      const proposedPct = result.weights.find((w) => w.key === disposal.assetId)!.proposedPct;
      expect({ assetId: disposal.assetId, whole: disposal.quantity === undefined }).toEqual({ assetId: disposal.assetId, whole: proposedPct === 0 });
    }
    // The run keeps the accounts and the money-market fund at the plan's cash quota (owner, 2026-11-18).
    const sale = vi.mocked(runOptimizer).mock.calls[0][0].sale!;
    expect(sale.cashFloorEur).toBeGreaterThan(0);
    const liquidity = result.weights.find((w) => w.key === LIQUIDITY_CANDIDATE_KEY)!;
    const baseEur = 20000 / (liquidity.currentPct / 100);
    const cashPct = liquidity.proposedPct + result.weights.find((w) => w.key === 'monetario')!.proposedPct;
    expect(cashPct).toBeGreaterThanOrEqual((sale.cashFloorEur! / baseEur) * 100 - 0.01);
    // Sold whole, it is no position: a plan never sells a position of its own whole («Attiva piano» stayed off).
    expect(seed.positions.map((p) => p.buyAssetId)).not.toContain('etf-b');
    expect(sold).not.toContain(LIQUIDITY_CANDIDATE_KEY);
    expect(sold).not.toContain('casa');
    // A forced lock is a lock to the optimizer too: the pension fund costs no tax, yet is never sold.
    expect(seed.optimizerSnapshot).toMatchObject({ mode: 'targeted', taxCapEur: 500 });
    expect(seed.optimizerSnapshot?.lockedKeys).toEqual(expect.arrayContaining(['btc', 'fondo']));
  });
});
