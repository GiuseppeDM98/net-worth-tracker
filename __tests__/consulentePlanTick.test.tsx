/**
 * The plan of accumulation's tick on «Applica» (components/allocation/consulente/ConsulentePlanTick.tsx,
 * 2026-11-20): the label by what the click does to an open plan, the summary, the instruments to
 * create with listing · price · date, the app's corrections, the account's select and every state in
 * which the plan cannot be created now. The three hooks are mocked; the builder and
 * `compareAllocations` are the real ones (the client SDK mocked). Invented figures, round.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Asset, AssetAllocationTarget, AssetPrefill } from '@/types/assets';
import type { AccumulationPlan } from '@/types/accumulationPlan';
import type { AllocationAdviceDocument } from '@/types/allocationAdvice';

vi.mock('@/lib/firebase/config', () => ({ auth: { currentUser: null }, db: {} }));
vi.mock('@/lib/utils/authFetch', () => ({ authenticatedFetch: vi.fn() }));
vi.mock('@/lib/services/dashboardOverviewInvalidation', () => ({ invalidateDashboardOverviewSummary: vi.fn() }));
vi.mock('firebase/firestore', () => ({ doc: vi.fn(), getDoc: vi.fn(), setDoc: vi.fn(), deleteField: vi.fn() }));
vi.mock('@/lib/services/assetService', () => ({
  calculateAssetValue: (a: { quantity: number; currentPrice: number }) => a.quantity * a.currentPrice,
  calculateTotalValue: (list: Array<{ quantity: number; currentPrice: number }>) => list.reduce((sum, a) => sum + a.quantity * a.currentPrice, 0),
}));

type QueryState = { data?: unknown; isPending: boolean; isError: boolean; isSuccess: boolean; isFetchedAfterMount?: boolean };
let settingsState: QueryState;
let plansState: QueryState;
let quotesState: QueryState;
vi.mock('@/lib/hooks/useSettings', () => ({ useSettings: () => settingsState }));
vi.mock('@/lib/hooks/useAccumulationPlans', async () => ({
  useAccumulationPlans: () => plansState,
  selectOpenPlan: (await import('@/lib/utils/openAccumulationPlan')).selectOpenPlan,
}));
vi.mock('@/lib/hooks/useAdviceQuotes', () => ({ useAdviceQuotes: () => quotesState }));

import { ConsulentePlanTick, type AdvicePlanReady } from '@/components/allocation/consulente/ConsulentePlanTick';
import { reconcileOperatingPlan, type OperatingPlan, type OperatingPlanInstrument, type RawOperatingPlan } from '@/lib/utils/operatingPlan';
import { ACCUMULO_PLAN_NOTHING_TO_REVISE } from '@/lib/utils/accumuloCopy';
import { initialAnswers } from '@/lib/utils/allocationAdviceDraft';

const NOW = new Date();
const FINISHED = new Date('2026-11-19T10:00:00.000Z');

function asset(id: string, name: string, overrides: Partial<Asset> = {}): Asset {
  return {
    id, userId: 'u1', ticker: id.toUpperCase(), name, type: 'etf', assetClass: 'equity', currency: 'EUR',
    quantity: 0, currentPrice: 100, lastPriceUpdate: NOW, createdAt: NOW, updatedAt: NOW, ...overrides,
  };
}
const conto = () => asset('conto', 'Conto arancio', { type: 'cash', assetClass: 'cash', quantity: 10000, currentPrice: 1 });
const ASSETS = () => [conto(), asset('etf-a', 'ETF A', { quantity: 60 }), asset('etf-b', 'ETF B', { quantity: 20 })];

const PREFILL: AssetPrefill = { name: 'ETF Nuovo', ticker: '', isin: 'IE000NEW0001', type: 'etf', assetClass: 'equity', subCategory: '' };
const INSTRUMENTS: OperatingPlanInstrument[] = [
  { ref: 'S1', kind: 'held', name: 'ETF A', assetClass: 'equity', assetId: 'etf-a' },
  { ref: 'S2', kind: 'held', name: 'ETF B', assetClass: 'equity', assetId: 'etf-b' },
  { ref: 'N1', kind: 'new', name: 'ETF Nuovo', assetClass: 'equity', prefill: PREFILL, symbols: ['NEW1.MI'] },
];
const RAW: RawOperatingPlan = {
  summary: 'Il piano.', monthlyInflowEur: 500, months: 12, reviewMonth: 6, reviewReason: '', departures: [],
  rows: [
    { ref: 'S1', action: 'buy', targetPercentage: 60, reason: '' },
    { ref: 'S2', action: 'hold', targetPercentage: 0, reason: '' },
    { ref: 'N1', action: 'buy', targetPercentage: 40, reason: '' },
  ],
};

function storedPlan(instruments: OperatingPlanInstrument[] = INSTRUMENTS): OperatingPlan {
  const held = Object.fromEntries(ASSETS().filter((a) => a.id !== 'conto').map((a, i) => [`S${i + 1}`, { quantity: a.quantity, priceEur: a.currentPrice, valueEur: a.quantity * a.currentPrice, keep: false, tax: { kind: 'exempt' as const } }]));
  const plan = reconcileOperatingPlan(RAW, { instruments, held });
  return { ...plan, corrections: ['ETF A: quota portata dal 70% al 60%.'] };
}

function makeDocument(plan: OperatingPlan = storedPlan()): AllocationAdviceDocument {
  return {
    userId: 'u1', status: 'ready', answers: initialAnswers(null, null, []), stage: 'review',
    createdAt: NOW, updatedAt: NOW, startedAt: NOW, strategy: null, instruments: null,
    report: { markdown: 'x', proposal: null, model: 'opus', finishedAt: FINISHED } as never,
    error: null, applied: null, interview: null,
    operatingPlan: { status: 'ready', plan, error: null, model: 'opus', startedAt: FINISHED, finishedAt: FINISHED, reportFinishedAt: FINISHED },
  } as AllocationAdviceDocument;
}

const TARGETS: AssetAllocationTarget = { equity: { targetPercentage: 90 }, cash: { targetPercentage: 10 } };
const ok = (data: unknown): QueryState => ({ data, isPending: false, isError: false, isSuccess: true, isFetchedAfterMount: true });
const FRESH_QUOTE = { symbol: 'NEW1.MI', price: 50, currency: 'EUR', quotedAt: new Date(Date.now() - 3600_000).toISOString() };

function renderTick(overrides: Partial<React.ComponentProps<typeof ConsulentePlanTick>> = {}) {
  const onBuild = vi.fn<(ready: AdvicePlanReady | null) => void>();
  const view = render(
    <ConsulentePlanTick
      ownerId="u1" document={makeDocument()} assets={ASSETS()} targets={TARGETS} goalsAfter={null}
      mode="tick" checked onCheckedChange={() => {}} targetsTicked onBuild={onBuild} {...overrides}
    />
  );
  return { ...view, onBuild, lastBuild: () => onBuild.mock.calls.at(-1)?.[0] ?? null };
}
const checkbox = () => screen.getByRole('checkbox') as HTMLButtonElement;

beforeEach(() => {
  settingsState = ok({ targets: TARGETS, investmentCashAssetId: 'conto' });
  plansState = ok([]);
  quotesState = ok({ 'NEW1.MI': FRESH_QUOTE });
});

// Mutation that turns it red: hide the notes.
describe('the tick with a plan to create', () => {
  it('the label by action, the summary, the instrument with ticker · price · date, «Corretto dall\'app»', async () => {
    const { lastBuild, onBuild } = renderTick();
    await waitFor(() => expect(onBuild).toHaveBeenCalled());
    const label = screen.getByText(/^Il piano di accumulo: 12 mesi da /);
    expect(label.textContent).toMatch(/prima rata .*, 1 strumento da creare\.$/);
    expect(screen.getByText(/^ETF Nuovo · NEW1\.MI · 50,00\s*€ · \d\d\/\d\d\/\d{4}$/)).not.toBeNull();
    expect(screen.getByText("Corretto dall'app")).not.toBeNull();
    expect(screen.getByText('ETF A: quota portata dal 70% al 60%.')).not.toBeNull();
    expect(checkbox().disabled).toBe(false);
    expect(lastBuild()).toMatchObject({ sourceAssetId: 'conto', saveSourceAsSetting: false, openPlan: null });
    expect(lastBuild()?.build.action).toBe('create');
  });

  it('a draft open → «al posto della bozza»; an active plan → «Rivede il piano di accumulo attivo»', () => {
    plansState = ok([{ id: 'd1', status: 'draft', name: 'Bozza' } as unknown as AccumulationPlan]);
    const { unmount } = renderTick();
    expect(screen.getByText(/^Il piano di accumulo, al posto della bozza che hai in Accumulo: /)).not.toBeNull();
    unmount();
    plansState = ok([{
      id: 'a1', status: 'active', name: 'Piano', startMonth: '2026-10', months: 12,
      liquidity: { sourceCashAssetIds: ['conto'], reserveEur: 0, monthlyInflowEur: 500 }, positions: [], disposals: [],
      installments: Array.from({ length: 12 }, (_, i) => ({ index: i + 1, month: `2027-${String(i + 1).padStart(2, '0')}`, lines: [{ positionId: 'x', plannedAmountEur: 100, status: 'planned' }] })),
    } as unknown as AccumulationPlan]);
    renderTick();
    expect(screen.getByText(/^Rivede il piano di accumulo attivo: /)).not.toBeNull();
  });

  it('a role turned frozen in the assets given leaves no position for it', async () => {
    const assets = ASSETS().map((a) => (a.id === 'etf-a' ? { ...a, allocationRole: 'frozen' as const } : a));
    const { lastBuild, onBuild } = renderTick({ assets });
    await waitFor(() => expect(onBuild).toHaveBeenCalled());
    const build = lastBuild()?.build;
    expect(build?.draft.positions.some((p) => p.buyAssetId === 'etf-a')).toBe(false);
  });
});

// Mutation that turns it red: enable the checkbox without a chosen account.
describe('the account', () => {
  it('no investment account → the select; disabled until a choice, then the build carries it and saves it', async () => {
    settingsState = ok({ targets: TARGETS });
    const { lastBuild, onBuild } = renderTick();
    expect(screen.getByText('Da quale conto?')).not.toBeNull();
    expect(screen.getByText('Lo ricordo come Conto per gli investimenti.')).not.toBeNull();
    expect(checkbox().disabled).toBe(true);
    fireEvent.click(screen.getByRole('combobox', { name: 'Da quale conto?' }));
    fireEvent.click(screen.getByRole('option', { name: 'Conto arancio' }));
    await waitFor(() => expect(lastBuild()).not.toBeNull());
    expect(lastBuild()).toMatchObject({ sourceAssetId: 'conto', saveSourceAsSetting: true });
    expect(checkbox().disabled).toBe(false);
    expect(onBuild.mock.calls[0][0]).toBeNull();
  });
});

// Mutation that turns it red: enable on a failed read.
describe('the states', () => {
  const expectState = async (sentence: string | RegExp, overrides: Partial<React.ComponentProps<typeof ConsulentePlanTick>> = {}) => {
    const { onBuild, unmount } = renderTick(overrides);
    expect(screen.getByText(typeof sentence === 'string' ? new RegExp(`: ${sentence.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`) : sentence)).not.toBeNull();
    expect(checkbox().disabled).toBe(true);
    expect(checkbox().getAttribute('data-state')).toBe('unchecked');
    await waitFor(() => expect(onBuild).toHaveBeenCalled());
    expect(onBuild.mock.calls.every(([ready]) => ready === null)).toBe(true);
    unmount();
  };

  it('loading, a failed read, no account, the targets unticked, the plans only from the restored cache', async () => {
    plansState = { isPending: true, isError: false, isSuccess: false };
    await expectState('Preparo il piano…');
    plansState = { data: [], isPending: false, isError: false, isSuccess: true, isFetchedAfterMount: false };
    await expectState('Preparo il piano…');
    plansState = { isPending: false, isError: true, isSuccess: false };
    await expectState('Non ho letto i piani di accumulo: ricarica la pagina per creare il piano da qui.');
    plansState = ok([]);
    await expectState('Per creare il piano serve un conto da cui comprare: aggiungine uno in Patrimonio.', { assets: ASSETS().filter((a) => a.id !== 'conto') });
    await expectState('Il piano va verso i nuovi target: applicali insieme.', { targetsTicked: false });
  });

  it('blocked: the build\'s sentence (nothing to invest); nothing left to revise → its sentence and «Apri Accumulo»', async () => {
    quotesState = ok({ 'NEW1.MI': { symbol: 'NEW1.MI', price: null } });
    const noInflow = { ...makeDocument() };
    noInflow.operatingPlan = { ...noInflow.operatingPlan!, plan: { ...noInflow.operatingPlan!.plan!, monthlyInflowEur: 0 } };
    await expectState(/: Non c'è niente da investire|niente da investire/i, { document: noInflow, assets: ASSETS().map((a) => (a.id === 'conto' ? { ...a, quantity: 0 } : a)) });

    const closed = {
      id: 'p1', status: 'active', name: 'Piano', startMonth: '2026-01', months: 2,
      liquidity: { sourceCashAssetIds: ['conto'], reserveEur: 0, monthlyInflowEur: 500 },
      positions: [], disposals: [],
      installments: [1, 2].map((index) => ({ index, month: `2026-0${index}`, lines: [{ positionId: 'x', plannedAmountEur: 100, status: 'executed' }] })),
    } as unknown as AccumulationPlan;
    plansState = ok([closed]);
    await expectState(ACCUMULO_PLAN_NOTHING_TO_REVISE);
    renderTick();
    expect(screen.getByRole('link', { name: 'Apri Accumulo' }).getAttribute('href')).toBe('/dashboard/allocation?tab=accumulo');
  });

  it('in button mode: the same line, no checkbox', () => {
    renderTick({ mode: 'button' });
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.getByText(/^Il piano di accumulo: 12 mesi da /)).not.toBeNull();
  });
});

// A new BTP€i (owner, 2026-11-20): Borsa Italiana's quote at the click, the coefficient asked on the page.
// Mutations that turn it red: the bond's ISIN not quoted; the coefficient field not carried into the build.
describe('a new BTP€i on the tick', () => {
  const BTPEI = 'BTP€i 15/05/2033 0,10%';
  const bondInstruments: OperatingPlanInstrument[] = [
    ...INSTRUMENTS.slice(0, 2),
    { ref: 'N1', kind: 'new', name: BTPEI, assetClass: 'equity', prefill: { name: BTPEI, ticker: '', isin: 'IT0000000EI1', type: 'bond', assetClass: 'equity', subCategory: '' }, symbols: [] },
  ];

  it('quotes it by ISIN, asks the coefficient, and prices it once written', async () => {
    quotesState = ok({ IT0000000EI1: { symbol: 'IT0000000EI1', price: 98 } });
    const { lastBuild, onBuild } = renderTick({ document: makeDocument(storedPlan(bondInstruments)) });
    await waitFor(() => expect(onBuild).toHaveBeenCalled());
    expect(screen.getByText((text) => text.startsWith(BTPEI + ' · BTP€i · Borsa Italiana 98,00, senza il coefficiente'))).not.toBeNull();
    expect(lastBuild()?.build.toCreate[0].formData.currentPrice).toBe(0);
    fireEvent.change(screen.getByLabelText(`Coefficiente di indicizzazione di ${BTPEI}`), { target: { value: '1,25' } });
    await waitFor(() => expect(lastBuild()?.build.toCreate[0].formData.currentPrice).toBe(1.225));
    expect(screen.getByText(/× coefficiente 1,25: 1,225 € per euro di nominale/)).not.toBeNull();
  });
});
