/**
 * The plan path's «Conferma» (components/allocation/piano/PianoWizard.tsx): the Italian month read again —
 * another month writes nothing and says so; a pending write disables the button, two clicks one call; an
 * activation that fails leaves a draft the second press adopts (`existingDraftId`); a model not written is the
 * done card's second line; in a revision, `revisePlan` on the assets read at the press (R4). `createAndActivatePlan`, `revisePlan`, `saveModelPortfolio` and the summary's figures are mocked (the summary's
 * arithmetic is the engine's); the month is mocked at `toMonthKey`.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';

const { state, service, fresh, model } = vi.hoisted(() => {
  class PlanWriteError extends Error {
    step: string;
    planId?: string;
    constructor(step: string, message: string, options: { planId?: string } = {}) {
      super(message);
      this.step = step;
      this.planId = options.planId;
    }
  }
  return {
    state: { month: '2026-11' },
    service: { createAndActivatePlan: vi.fn(), revisePlan: vi.fn(), PlanWriteError },
    fresh: { getAllAssets: vi.fn() },
    model: { saveModelPortfolio: vi.fn() },
  };
});

vi.mock('@/lib/firebase/config', () => ({ auth: { currentUser: null }, db: {} }));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: vi.fn() }) }));
vi.mock('@/lib/services/accumulationPlanService', () => service);
vi.mock('@/lib/services/modelPortfolioService', () => model);
vi.mock('@/lib/services/assetAllocationService', () => ({ compareAllocations: vi.fn() }));
vi.mock('@/lib/services/assetService', () => ({ calculateAssetValue: (a: { quantity: number; currentPrice: number }) => a.quantity * a.currentPrice, getAllAssets: fresh.getAllAssets }));
vi.mock('@/lib/hooks/useMonthlySavingsMedian', () => ({ useMonthlySavingsMedian: () => null }));
vi.mock('@/lib/utils/planMonths', async (importOriginal) => ({ ...(await importOriginal<object>()), toMonthKey: () => state.month }));
vi.mock('@/lib/utils/planPathNarrative', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  buildPlanPathSummary: () => ({ headline: [{ text: '12 rate' }], first: '', saleSteps: [], changes: [], sales: [], taxTotal: null, warnings: [], firstMonth: '2026-12', firstEur: 1500 }),
}));

import type { Asset, AllocationResult } from '@/types/assets';
import type { AccumulationPlan } from '@/types/accumulationPlan';
import { DEFAULT_REBALANCE_BAND } from '@/lib/utils/allocationUtils';
import { DEFAULT_IDEAL_ALLOCATION } from '@/lib/constants/idealAllocation';
import { buildPlanPathRevision, initialPlanPathDraft, planPathStorageKey, type PlanPathContext, type PlanPathDraft } from '@/lib/utils/planPath';
import { userFacingError } from '@/lib/utils/dialogNarrative';
import { describeModelNotUpdated } from '@/lib/utils/accumuloCopy';
import { PianoWizard } from '@/components/allocation/piano/PianoWizard';

const TODAY = new Date('2026-11-20T12:00:00');
function asset(id: string, name: string, overrides: Partial<Asset> = {}): Asset {
  return {
    id, userId: 'u1', ticker: id.toUpperCase(), name, type: 'etf', assetClass: 'equity', currency: 'EUR',
    quantity: 0, currentPrice: 100, lastPriceUpdate: TODAY, createdAt: TODAY, updatedAt: TODAY, ...overrides,
  };
}
const ASSETS = [
  asset('conto', 'Conto ornitorinco', { type: 'cash', assetClass: 'cash', quantity: 4000, currentPrice: 1 }),
  asset('etf-a', 'ETF ornitorinco', { quantity: 60 }),
  asset('etf-b', 'ETF fenicottero', { quantity: 40 }),
];
const DEPS = { valueOf: (a: Asset) => a.quantity * a.currentPrice, priceOf: (a: Asset) => a.currentPrice };
const context: PlanPathContext = {
  assets: ASSETS, targets: { equity: { targetPercentage: 100 } }, band: DEFAULT_REBALANCE_BAND, model: null, investmentAccountId: 'conto',
  openDraft: null, tradedAssetIds: null, holdings: [], reviewByIso: null,
  compare: () => ({ byAssetClass: { cash: { currentValue: 4000 } }, marketValue: 14000 }) as unknown as AllocationResult, deps: DEPS, todayMonth: '2026-11',
  revision: null, fromModel: false,
};
const SUMMARY_DRAFT: PlanPathDraft = {
  version: 1,
  screen: 'riepilogo',
  answers: {
    start: 'today', monthlyInflowEur: 500, months: 12, sourceIds: ['conto'], reserveEur: 0, wantsSales: false, sales: [],
    positions: [
      { id: 'p-a', label: 'ETF ornitorinco', targetPercentage: 60, memberAssetIds: ['etf-a'], buyAssetId: 'etf-a' },
      { id: 'p-b', label: 'ETF fenicottero', targetPercentage: 40, memberAssetIds: ['etf-b'], buyAssetId: 'etf-b' },
    ],
    updateModel: false,
  },
};
const basis = { targets: null, criteria: DEFAULT_IDEAL_ALLOCATION, goals: null };
const flat = (text: string | null) => (text ?? '').replace(/[  ]/g, ' ');

const created = vi.fn();
function renderWizard(onMonthChanged = vi.fn()) {
  window.localStorage.setItem(planPathStorageKey('owner-1'), JSON.stringify(SUMMARY_DRAFT));
  render(<PianoWizard ownerId="owner-1" context={context} basis={basis} onMonthChanged={onMonthChanged} onAssetsChanged={() => {}} onCreated={created} />);
  return { onMonthChanged, confirm: () => screen.getByRole('button', { name: /Conferma|Creo il piano/ }) as HTMLButtonElement };
}

beforeEach(() => {
  state.month = '2026-11';
  service.createAndActivatePlan.mockReset();
  created.mockReset();
  fresh.getAllAssets.mockReset();
  fresh.getAllAssets.mockResolvedValue(ASSETS);
  window.localStorage.clear();
});

describe('PianoWizard › «Conferma» (mutation: call the service without the month check)', () => {
  it('the month changed since mount: nothing written, the sentence, the host told', async () => {
    state.month = '2026-12';
    const { onMonthChanged, confirm } = renderWizard();
    await act(async () => fireEvent.click(confirm()));
    expect(service.createAndActivatePlan).not.toHaveBeenCalled();
    expect(onMonthChanged).toHaveBeenCalledWith('2026-12');
    expect(flat(document.body.textContent)).toContain('Nel frattempo è cambiato il mese: la prima rata è ora a gennaio 2027.');
  });

  it('a pending write disables the button: two clicks, one call', async () => {
    service.createAndActivatePlan.mockReturnValue(new Promise(() => {}));
    const { confirm } = renderWizard();
    await act(async () => fireEvent.click(confirm()));
    await act(async () => fireEvent.click(confirm()));
    expect(service.createAndActivatePlan).toHaveBeenCalledTimes(1);
    expect(confirm().disabled).toBe(true);
    expect(confirm().textContent).toBe('Creo il piano…');
  });

  it('an activation that fails: the sentence, and the second press overwrites that draft', async () => {
    service.createAndActivatePlan.mockRejectedValueOnce(new service.PlanWriteError('activate', 'Connessione assente.', { planId: 'draft-9' }));
    service.createAndActivatePlan.mockResolvedValueOnce({ planId: 'draft-9', modelError: null });
    const { confirm } = renderWizard();
    await act(async () => fireEvent.click(confirm()));
    expect(flat(document.body.textContent)).toContain('Il piano è salvato ma non attivo: Connessione assente. Premi di nuovo «Conferma».');
    expect(service.createAndActivatePlan.mock.calls[0][0].existingDraftId).toBeUndefined();
    await act(async () => fireEvent.click(confirm()));
    expect(service.createAndActivatePlan.mock.calls[1][0].existingDraftId).toBe('draft-9');
    expect(screen.getByRole('region', { name: 'Piano attivo' })).toBeTruthy();
  });

  it('a model not written: the done card with the model line, the browser draft cleared', async () => {
    service.createAndActivatePlan.mockResolvedValue({ planId: 'plan-1', modelError: 'Permesso negato.' });
    const { confirm } = renderWizard();
    await act(async () => fireEvent.click(confirm()));
    const done = screen.getByRole('region', { name: 'Piano attivo' });
    expect(flat(done.textContent)).toContain('Piano attivo: prima rata a dicembre 2026, 1500 €.');
    expect(done.textContent).toContain(describeModelNotUpdated('Permesso negato.'));
    expect(window.localStorage.getItem(planPathStorageKey('owner-1'))).toBeNull();
    expect(created).toHaveBeenCalledTimes(1);
  });
});

describe('PianoWizard › «Conferma» reads the assets again (mutation: validate on the assets read at mount)', () => {
  it('an account deleted elsewhere: the gate gets the list read at the click, not the one of the page', async () => {
    const afterDelete = ASSETS.filter((a) => a.id !== 'conto');
    fresh.getAllAssets.mockResolvedValue(afterDelete);
    service.createAndActivatePlan.mockRejectedValue(new service.PlanWriteError('plan', 'Il conto non esiste più.'));
    const { confirm } = renderWizard();
    await act(async () => { fireEvent.click(confirm()); });
    expect(fresh.getAllAssets).toHaveBeenCalledWith('owner-1');
    expect(service.createAndActivatePlan.mock.calls[0][0].activate.allAssets).toEqual(afterDelete);
    expect(flat(document.body.textContent)).toContain('Il conto non esiste più.');
  });

  it('the read fails: nothing written, the read error said', async () => {
    fresh.getAllAssets.mockRejectedValue(new Error('offline'));
    const { confirm } = renderWizard();
    await act(async () => { fireEvent.click(confirm()); });
    expect(service.createAndActivatePlan).not.toHaveBeenCalled();
    expect(confirm().disabled).toBe(false);
  });
});

// ─── «Conferma» in a revision (2026-11-21) ───────────────────────────────────────────────────────

/** An active plan of 12 months from 2026-08, four closed: the revision starts at instalment 5. */
function activePlan(): AccumulationPlan {
  const line = (positionId: string, assetId: string, closed: boolean) => ({
    positionId, assetId, plannedQuantity: 2, priceEurAtPlan: 100, plannedAmountEur: 200,
    status: closed ? ('executed' as const) : ('planned' as const), ...(closed ? { transactionIds: ['t'] } : {}),
  });
  const months = ['2026-08', '2026-09', '2026-10', '2026-11', '2026-12', '2027-01', '2027-02', '2027-03', '2027-04', '2027-05', '2027-06', '2027-07'];
  return {
    id: 'plan-1', userId: 'owner-1', name: 'Piano airone', status: 'active', startMonth: '2026-08', months: 12,
    liquidity: { sourceCashAssetIds: ['conto'], reserveEur: 1000, monthlyInflowEur: 500 },
    positions: SUMMARY_DRAFT.answers.positions,
    disposals: [],
    installments: months.map((month, i) => ({ index: i + 1, month, carryInEur: {}, lines: [line('p-a', 'etf-a', i < 4), line('p-b', 'etf-b', i < 4)] })),
    createdAt: TODAY, updatedAt: TODAY,
  };
}
const revisionCtx: PlanPathContext = { ...context, revision: buildPlanPathRevision(activePlan()) };

function renderRevision(updateModel: boolean) {
  const start = initialPlanPathDraft(revisionCtx);
  window.localStorage.setItem(planPathStorageKey('owner-1'), JSON.stringify({ ...start, screen: 'riepilogo', answers: { ...start.answers, updateModel } }));
  render(<PianoWizard ownerId="owner-1" context={revisionCtx} basis={basis} onMonthChanged={() => {}} onAssetsChanged={() => {}} onCreated={created} />);
  return () => screen.getByRole('button', { name: /Conferma|Rivedo il piano/ }) as HTMLButtonElement;
}

describe('PianoWizard › «Conferma» in a revision (mutation: await nothing — two calls)', () => {
  beforeEach(() => {
    service.revisePlan.mockReset();
    model.saveModelPortfolio.mockReset();
  });

  it('the assets read again at the press are the list revisePlan receives, with the summary input', async () => {
    const afterDelete = ASSETS.filter((a) => a.id !== 'etf-b');
    fresh.getAllAssets.mockResolvedValue(afterDelete);
    service.revisePlan.mockResolvedValue(undefined);
    const confirm = renderRevision(false);
    await act(async () => { fireEvent.click(confirm()); });
    expect(service.createAndActivatePlan).not.toHaveBeenCalled();
    const [planId, input, opts] = service.revisePlan.mock.calls[0];
    expect(planId).toBe('plan-1');
    expect(input).toMatchObject({ remainingMonths: 8, expectedFirstIndex: 5, monthlyInflowEur: 500, reserveEur: 1000 });
    expect(opts.allAssets).toEqual(afterDelete);
    const done = screen.getByRole('region', { name: 'Piano rivisto' });
    expect(flat(done.textContent)).toContain('Piano rivisto: prossima rata a dicembre 2026, 1500 €.');
    expect(model.saveModelPortfolio).not.toHaveBeenCalled();
  });

  it('a pending write: the button disabled and «Rivedo il piano…», two clicks one call', async () => {
    service.revisePlan.mockReturnValue(new Promise(() => {}));
    const confirm = renderRevision(false);
    // Two clicks before React re-renders: only the write in flight holds the second.
    const button = confirm();
    await act(async () => { fireEvent.click(button); fireEvent.click(button); });
    expect(service.revisePlan).toHaveBeenCalledTimes(1);
    expect(confirm().disabled).toBe(true);
    expect(confirm().textContent).toBe('Rivedo il piano…');
  });

  it('revisePlan rejecting: its sentence in status, no done card, the button back', async () => {
    service.revisePlan.mockRejectedValue(userFacingError('Il piano è cambiato mentre lo rivedevi: ricarica la pagina.'));
    const confirm = renderRevision(true);
    await act(async () => { fireEvent.click(confirm()); });
    expect(flat(document.body.textContent)).toContain('Il piano è cambiato mentre lo rivedevi: ricarica la pagina.');
    expect(screen.queryByRole('region', { name: 'Piano rivisto' })).toBeNull();
    expect(model.saveModelPortfolio).not.toHaveBeenCalled();
    expect(confirm().disabled).toBe(false);
  });

  it('the model write rejecting: the done card with describeModelNotUpdated', async () => {
    service.revisePlan.mockResolvedValue(undefined);
    model.saveModelPortfolio.mockRejectedValue(userFacingError('Permesso negato.'));
    const confirm = renderRevision(true);
    await act(async () => { fireEvent.click(confirm()); });
    expect(model.saveModelPortfolio.mock.calls[0][0]).toBe('owner-1');
    const done = screen.getByRole('region', { name: 'Piano rivisto' });
    expect(done.textContent).toContain(describeModelNotUpdated('Permesso negato.'));
    expect(window.localStorage.getItem(planPathStorageKey('owner-1'))).toBeNull();
  });
});
