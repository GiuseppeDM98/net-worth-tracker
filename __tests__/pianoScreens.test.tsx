/**
 * The plan path's screen bodies (components/allocation/piano/PianoScreens.tsx): «strumenti» — the rows with
 * today's weight, the sum off 100 in warning, «Ridistribuisci il resto», a model group as ONE row — and
 * «vendite» — «No» / «Sì», a ticked sale with its quantity, its month and the tax line in its four wordings, a
 * group's member without «tutte». The tax per euro is mocked at `candidateSaleTaxPerEuro` (its rules are
 * saleTax.test.ts's). Figures invented and round.
 */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';

vi.mock('@/lib/firebase/config', () => ({ auth: { currentUser: null }, db: {} }));
vi.mock('@/lib/utils/saleTax', () => ({
  candidateSaleTaxPerEuro: (assetId: string) =>
    assetId === 'etf-a'
      ? { kind: 'taxed', perEuro: 0.1 }
      : assetId === 'etf-b'
        ? { kind: 'exempt' }
        : assetId === 'etf-c'
          ? { kind: 'unknown', reason: 'rate' }
          : { kind: 'unknown', reason: 'cost-basis' },
}));

import type { Asset, AllocationResult } from '@/types/assets';
import type { AccumulationPlan } from '@/types/accumulationPlan';
import { DEFAULT_REBALANCE_BAND } from '@/lib/utils/allocationUtils';
import {
  buildPlanPathRevision,
  describePlanPathBlock,
  initialPlanPathDraft,
  planPathReducer,
  previewPlanPathRevision,
  saleMonthIndexes,
  type PlanPathAnswers,
  type PlanPathContext,
} from '@/lib/utils/planPath';
import { PLAN_PATH_START_REPLACES, buildPlanPathSummary } from '@/lib/utils/planPathNarrative';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import { narrativeToText } from '@/lib/utils/narrative';
import { PartenzaScreen, RiepilogoScreen, StrumentiScreen, VenditeScreen } from '@/components/allocation/piano/PianoScreens';

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
  asset('etf-c', 'ETF airone', { quantity: 10 }),
  asset('etf-d', 'ETF garzetta', { quantity: 10 }),
];
const DEPS = { valueOf: (a: Asset) => a.quantity * a.currentPrice, priceOf: (a: Asset) => a.currentPrice };
const context: PlanPathContext = {
  assets: ASSETS, targets: { equity: { targetPercentage: 100 } }, band: DEFAULT_REBALANCE_BAND, model: null, investmentAccountId: 'conto',
  openDraft: null, tradedAssetIds: null, holdings: [], reviewByIso: null,
  compare: () => ({ byAssetClass: {}, marketValue: 0 }) as unknown as AllocationResult, deps: DEPS, todayMonth: '2026-11',
  revision: null, fromModel: false,
};
function answers(overrides: Partial<PlanPathAnswers> = {}): PlanPathAnswers {
  return {
    start: 'today', monthlyInflowEur: 500, months: 12, sourceIds: ['conto'], reserveEur: null, wantsSales: true, sales: [],
    positions: [
      { id: 'p-a', label: 'ETF ornitorinco', targetPercentage: 50, memberAssetIds: ['etf-a'], buyAssetId: 'etf-a' },
      { id: 'p-b', label: 'ETF fenicottero', targetPercentage: 40, memberAssetIds: ['etf-b'], buyAssetId: 'etf-b' },
    ],
    updateModel: null,
    ...overrides,
  };
}
const flat = (text: string | null) => (text ?? '').replace(/[  ]/g, ' ');

describe('StrumentiScreen (mutation: dispatch nothing from «Ridistribuisci il resto»)', () => {
  it('a row per position with today’s weight; the sum off 100 in warning; «Ridistribuisci il resto» dispatches', () => {
    const dispatch = vi.fn();
    render(<StrumentiScreen answers={answers()} dispatch={dispatch} context={context} onNewInstrument={() => {}} />);
    const list = screen.getByRole('list', { name: 'Strumenti del piano' });
    const rows = within(list).getAllByRole('listitem');
    expect(rows).toHaveLength(2);
    expect(flat(rows[0].textContent)).toContain('oggi 60,00%');
    expect(flat(rows[1].textContent)).toContain('oggi 40,00%');
    const sum = screen.getByText('Somma: 90,00%');
    expect(sum.className).toContain('text-warning-foreground');
    fireEvent.click(screen.getByRole('button', { name: 'Ridistribuisci il resto' }));
    expect(dispatch).toHaveBeenCalledWith({ type: 'redistribute' });
  });

  it('at 100 the sum is plain and «Ridistribuisci il resto» is disabled', () => {
    const positions = answers().positions.map((p, i) => ({ ...p, targetPercentage: i === 0 ? 60 : 40 }));
    render(<StrumentiScreen answers={answers({ positions })} dispatch={() => {}} context={context} onNewInstrument={() => {}} />);
    expect(screen.getByText('Somma: 100,00%').className).not.toContain('text-warning-foreground');
    expect((screen.getByRole('button', { name: 'Ridistribuisci il resto' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('a model group is ONE row: its label, «compra» the instrument it buys', () => {
    const positions = [{ id: 'g', label: 'Azionario globale', targetPercentage: 100, memberAssetIds: ['etf-a', 'etf-b'], buyAssetId: 'etf-a' }];
    render(<StrumentiScreen answers={answers({ positions })} dispatch={() => {}} context={context} onNewInstrument={() => {}} />);
    const rows = within(screen.getByRole('list', { name: 'Strumenti del piano' })).getAllByRole('listitem');
    expect(rows).toHaveLength(1);
    expect(flat(rows[0].textContent)).toContain('Azionario globale');
    expect(flat(rows[0].textContent)).toContain('compra ETF ornitorinco');
    expect(flat(rows[0].textContent)).toContain('oggi 100,00%');
  });

  it('a quota typed dispatches the quota action', () => {
    const dispatch = vi.fn();
    render(<StrumentiScreen answers={answers()} dispatch={dispatch} context={context} onNewInstrument={() => {}} />);
    fireEvent.change(screen.getByLabelText('ETF ornitorinco'), { target: { value: '60' } });
    expect(dispatch).toHaveBeenCalledWith({ type: 'quota', positionId: 'p-a', targetPercentage: 60 });
  });
});

describe('VenditeScreen (mutation: hide the month)', () => {
  it('«No» / «Sì, scelgo cosa»; «No» hides the instruments', () => {
    const dispatch = vi.fn();
    const { rerender } = render(<VenditeScreen answers={answers({ wantsSales: null })} dispatch={dispatch} context={context} />);
    expect(screen.getByRole('radio', { name: 'No' })).toBeTruthy();
    expect(screen.queryByRole('list', { name: 'Strumenti da vendere' })).toBeNull();
    fireEvent.click(screen.getByRole('radio', { name: 'Sì, scelgo cosa' }));
    expect(dispatch).toHaveBeenCalledWith({ type: 'wantsSales', value: true, context });
    rerender(<VenditeScreen answers={answers({ wantsSales: false })} dispatch={dispatch} context={context} />);
    expect(screen.queryByRole('list', { name: 'Strumenti da vendere' })).toBeNull();
  });

  it('ticking dispatches a whole sale in month 1', () => {
    const dispatch = vi.fn();
    render(<VenditeScreen answers={answers()} dispatch={dispatch} context={context} />);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Vendi ETF ornitorinco' }));
    expect(dispatch).toHaveBeenCalledWith({ type: 'sale', sale: { assetId: 'etf-a', quantity: null, month: 1 }, context });
  });

  it('a ticked sale shows its quantity, its month and the tax line in its four wordings', () => {
    const sales = [
      { assetId: 'etf-a', quantity: 10, month: 3 },
      { assetId: 'etf-b', quantity: null, month: 1 },
      { assetId: 'etf-c', quantity: null, month: 1 },
      { assetId: 'etf-d', quantity: null, month: 1 },
    ];
    render(<VenditeScreen answers={answers({ sales })} dispatch={() => {}} context={context} />);
    const rows = within(screen.getByRole('list', { name: 'Strumenti da vendere' })).getAllByRole('listitem');
    const rowOf = (name: string) => rows.find((row) => row.textContent?.includes(name))!;
    expect((within(rowOf('ETF ornitorinco')).getByLabelText('Quante quote') as HTMLInputElement).value).toBe('10');
    expect(within(rowOf('ETF ornitorinco')).getByLabelText('In quale mese').textContent).toContain('febbraio 2027 (3º)');
    expect(flat(rowOf('ETF ornitorinco').textContent)).toContain('circa 1000 € · tasse stimate 100 €');
    expect(flat(rowOf('ETF fenicottero').textContent)).toContain('circa 4000 € · esente');
    expect(flat(rowOf('ETF airone').textContent)).toContain("circa 1000 € · tasse non stimabili: manca l'aliquota");
    expect(flat(rowOf('ETF garzetta').textContent)).toContain('circa 1000 € · tasse non stimabili: manca il costo fiscale');
    expect(within(rowOf('ETF fenicottero')).getByLabelText('Quante quote').getAttribute('placeholder')).toBe('tutte');
  });

  // Every share reads as the number held (owner, 2026-11-21, on the mirror: the exact count typed emptied the field, which
  // read as refused). While the field has the focus it holds what is typed, empty included, so it can be retyped;
  // empty still means every share. Mutation that turns it red: the field showing `sale.quantity` alone.
  it('a sale of every share shows the shares held; emptied while focused it stays empty and dispatches null', () => {
    const dispatched: unknown[] = [];
    render(<VenditeScreen answers={answers({ sales: [{ assetId: 'etf-b', quantity: null, month: 1 }] })} dispatch={(action) => dispatched.push(action)} context={context} />);
    const row = within(screen.getByRole('list', { name: 'Strumenti da vendere' })).getAllByRole('listitem').find((r) => r.textContent?.includes('ETF fenicottero'))!;
    const field = within(row).getByLabelText('Quante quote') as HTMLInputElement;
    expect(field.value).toBe('40');
    fireEvent.focus(field);
    fireEvent.change(field, { target: { value: '' } });
    expect(field.value).toBe('');
    expect(dispatched.at(-1)).toMatchObject({ type: 'sale', sale: { assetId: 'etf-b', quantity: null } });
    fireEvent.change(field, { target: { value: '7' } });
    expect(field.value).toBe('7');
    expect(dispatched.at(-1)).toMatchObject({ sale: { quantity: 7 } });
  });

  it('a group’s member has no «tutte» placeholder', () => {
    const positions = [{ id: 'g', label: 'Azionario globale', targetPercentage: 100, memberAssetIds: ['etf-a', 'etf-b'], buyAssetId: 'etf-a' }];
    render(<VenditeScreen answers={answers({ positions, sales: [{ assetId: 'etf-b', quantity: null, month: 1 }] })} dispatch={() => {}} context={context} />);
    const row = within(screen.getByRole('list', { name: 'Strumenti da vendere' })).getAllByRole('listitem').find((r) => r.textContent?.includes('ETF fenicottero'))!;
    expect(within(row).getByLabelText('Quante quote').getAttribute('placeholder')).toBeNull();
  });
});

// «Le quote che avevi scritto vengono sostituite.» (2026-11-20, the guided path's retirement): only once a quota was
// typed after the start was chosen — never at the first choice, nor on a seed or a draft just opened. Mutation that
// turns it red: the note shown whenever a start is chosen and there are positions (the condition before the fix).
describe('PartenzaScreen — the note that typed quotas are replaced', () => {
  const note = () => screen.queryByText(PLAN_PATH_START_REPLACES);
  const render1 = (a: PlanPathAnswers) => render(<PartenzaScreen answers={a} dispatch={() => {}} context={context} modelUsable={false} modelStale={false} />);
  it('absent at the first choice, present once a quota is typed', () => {
    const started = planPathReducer(initialPlanPathDraft(context), { type: 'start', start: 'today', context });
    expect(started.answers.positions.length).toBeGreaterThan(0);
    const first = render1(started.answers);
    expect(note()).toBeNull();
    first.unmount();
    const typed = planPathReducer(started, { type: 'quota', positionId: started.answers.positions[0].id, targetPercentage: 10 });
    render1(typed.answers);
    expect(note()).not.toBeNull();
  });
  it('absent on a seed just opened', () => {
    const seed = { positions: [{ id: 's-a', label: 'ETF ornitorinco', targetPercentage: 100, memberAssetIds: ['etf-a'], buyAssetId: 'etf-a' }] };
    render1(answers({ start: 'seed', seed, positions: seed.positions }));
    expect(note()).toBeNull();
  });
});

// ─── A revision of an ACTIVE plan (2026-11-21) ───────────────────────────────────────────────────

/**
 * Twelve months from 2026-08, four closed (instalment 5 = dicembre 2026 is the first open one). Cash at the
 * reserve, so the instalments are the inflow (800) plus the sales from their months; the two positions held at
 * their quotas. The plan's sales: ETF ornitorinco 10 in month 6 and ETF fenicottero 10 in month 7 (open), ETF
 * airone 10 in month 8 (open), and three locked ones on other instruments — executed, skipped, linked. The four
 * instruments outside the positions are held, so each has its row at 0 %.
 */
function revisionPlan(overrides: Partial<AccumulationPlan> = {}): AccumulationPlan {
  const line = (positionId: string, assetId: string, closed: boolean) => ({
    positionId, assetId, plannedQuantity: 2, priceEurAtPlan: 100, plannedAmountEur: 200,
    status: closed ? ('executed' as const) : ('planned' as const), ...(closed ? { transactionIds: ['t'] } : {}),
  });
  const months = ['2026-08', '2026-09', '2026-10', '2026-11', '2026-12', '2027-01', '2027-02', '2027-03', '2027-04', '2027-05', '2027-06', '2027-07'];
  return {
    id: 'plan-1', userId: 'u1', name: 'Piano airone', status: 'active', startMonth: '2026-08', months: 12,
    liquidity: { sourceCashAssetIds: ['conto'], reserveEur: 4000, monthlyInflowEur: 800 },
    positions: [
      { id: 'p-a', label: 'ETF ornitorinco', targetPercentage: 50, memberAssetIds: ['etf-a'], buyAssetId: 'etf-a' },
      { id: 'p-b', label: 'ETF fenicottero', targetPercentage: 50, memberAssetIds: ['etf-b'], buyAssetId: 'etf-b' },
    ],
    disposals: [
      { assetId: 'etf-a', quantity: 10, monthIndex: 6, estimatedProceedsEur: 1000, status: 'planned' },
      { assetId: 'etf-b', quantity: 10, monthIndex: 7, estimatedProceedsEur: 1000, status: 'planned' },
      { assetId: 'etf-c', quantity: 10, monthIndex: 8, estimatedProceedsEur: 1000, status: 'planned' },
      { assetId: 'etf-d', quantity: 5, monthIndex: 2, estimatedProceedsEur: 500, status: 'executed' },
      { assetId: 'etf-e', monthIndex: 3, estimatedProceedsEur: 1000, status: 'skipped' },
      { assetId: 'etf-f', quantity: 2, monthIndex: 4, estimatedProceedsEur: 200, status: 'planned', transactionIds: ['s1'] },
    ],
    installments: months.map((month, i) => ({
      index: i + 1, month, carryInEur: {}, lines: [line('p-a', 'etf-a', i < 4), line('p-b', 'etf-b', i < 4)],
    })),
    createdAt: TODAY, updatedAt: TODAY,
    ...overrides,
  };
}
const REVISION_ASSETS = [
  asset('conto', 'Conto ornitorinco', { type: 'cash', assetClass: 'cash', quantity: 4000, currentPrice: 1 }),
  asset('etf-a', 'ETF ornitorinco', { quantity: 60 }),
  asset('etf-b', 'ETF fenicottero', { quantity: 60 }),
  asset('etf-c', 'ETF airone', { quantity: 10 }),
  asset('etf-d', 'ETF garzetta', { quantity: 10 }),
  asset('etf-e', 'ETF cormorano', { quantity: 10 }),
  asset('etf-f', 'ETF svasso', { quantity: 10 }),
];
function revisionContext(plan: AccumulationPlan): PlanPathContext {
  return { ...context, assets: REVISION_ASSETS, revision: buildPlanPathRevision(plan) };
}

describe('RiepilogoScreen in a revision (mutation: read the first instalment of the whole plan; «tolta» and «nuova» for a changed quantity)', () => {
  it('the next instalment and its month, the sale-step sentence, one line per sale that changes', () => {
    const plan = revisionPlan();
    const ctx = revisionContext(plan);
    const start = initialPlanPathDraft(ctx).answers;
    // ETF fenicottero moved 7 → 9; ETF airone from 10 to 6 shares; ETF ornitorinco from 10 to 5, moved 6 → 7.
    const answers1: PlanPathAnswers = {
      ...start,
      sales: [
        { assetId: 'etf-b', quantity: 10, month: 9 },
        { assetId: 'etf-c', quantity: 6, month: 8 },
        { assetId: 'etf-a', quantity: 5, month: 7 },
      ],
    };
    const preview = previewPlanPathRevision(answers1, ctx, TODAY);
    if (!preview.ok) throw new Error('the fixture revises');
    const nextEur = preview.plan.installments.find((i) => i.index === 5)!.lines.reduce((sum, l) => sum + l.plannedAmountEur, 0);
    expect(nextEur).not.toBe(400);
    const summary = buildPlanPathSummary(answers1, ctx, TODAY);
    render(<RiepilogoScreen summary={summary} modelBox={null} />);
    const text = flat(document.body.textContent);
    // The headline's figure splits its «€» into a span (DESIGN → the figure unit): read it as text.
    expect(flat(narrativeToText(summary.headline))).toBe(flat(`8 rate da dicembre 2026: la prossima di ${cachedFormatCurrencyEUR(nextEur, true)}.`));
    expect(text).toContain('ETF fenicottero: spostata a aprile 2027');
    expect(text).toContain('ETF airone: da 10 a 6 quote, a marzo 2027');
    expect(text).toContain('ETF ornitorinco: da 10 a 5 quote, a febbraio 2027');
    expect(text).not.toContain('ETF airone: tolta');
    expect(text).not.toContain('ETF airone: nuova');
    expect(summary.saleSteps.some((sentence) => sentence.startsWith('Da febbraio la rata sale a'))).toBe(true);
  });

  it('a saved sale unticked reads «tolta», a new one «nuova, n quote a {mese}»', () => {
    const plan = revisionPlan({ disposals: [{ assetId: 'etf-a', quantity: 10, monthIndex: 6, estimatedProceedsEur: 1000, status: 'planned' }] });
    const ctx = revisionContext(plan);
    const summary = buildPlanPathSummary({ ...initialPlanPathDraft(ctx).answers, sales: [{ assetId: 'etf-c', quantity: 5, month: 7 }] }, ctx, TODAY);
    render(<RiepilogoScreen summary={summary} modelBox={null} />);
    const text = flat(document.body.textContent);
    expect(text).toContain('ETF ornitorinco: tolta');
    expect(text).toContain('ETF airone: nuova, 5 quote a febbraio 2027');
  });
});

describe('VenditeScreen in a revision (mutation: list month 1; block every month before the first open; list every held instrument)', () => {
  it('the locked sales as lines without controls; no «Vendi» row for their instruments; the open ones ticked', () => {
    const plan = revisionPlan();
    const ctx = revisionContext(plan);
    render(<VenditeScreen answers={initialPlanPathDraft(ctx).answers} dispatch={() => {}} context={ctx} />);
    const locked = screen.getByRole('list', { name: 'Vendite già decise' });
    const lines = within(locked).getAllByRole('listitem').map((li) => flat(li.textContent));
    expect(lines).toEqual([
      'ETF garzetta · 5 quote · già venduta',
      'ETF cormorano · tutte le quote · saltata',
      'ETF svasso · 2 quote · da confermare nel Registro',
    ]);
    expect(within(locked).queryAllByRole('checkbox')).toHaveLength(0);
    for (const name of ['ETF garzetta', 'ETF cormorano', 'ETF svasso']) expect(screen.queryByRole('checkbox', { name: `Vendi ${name}` })).toBeNull();
    expect((screen.getByRole('checkbox', { name: 'Vendi ETF ornitorinco' }) as HTMLElement).getAttribute('data-state')).toBe('checked');
  });

  it('the month select starts at the first open month, as the plan index; ticking a new sale takes that month', () => {
    const plan = revisionPlan();
    const ctx = revisionContext(plan);
    const dispatch = vi.fn();
    const a = initialPlanPathDraft(ctx).answers;
    render(<VenditeScreen answers={{ ...a, sales: a.sales.filter((s) => s.assetId === 'etf-a') }} dispatch={dispatch} context={ctx} />);
    const row = within(screen.getByRole('list', { name: 'Strumenti da vendere' })).getAllByRole('listitem').find((li) => li.textContent?.includes('ETF ornitorinco'))!;
    expect(flat(within(row).getByLabelText('In quale mese').textContent)).toBe('gennaio 2027 (6º)');
    fireEvent.click(screen.getByRole('checkbox', { name: 'Vendi ETF fenicottero' }));
    expect(dispatch).toHaveBeenCalledWith({ type: 'sale', sale: { assetId: 'etf-b', quantity: null, month: 5 }, context: ctx });
    expect(saleMonthIndexes(ctx, a.months!, 6)).toEqual([5, 6, 7, 8, 9, 10, 11, 12]);
  });

  it('a late open sale (month 3, first open 5) keeps its month first, «· in ritardo»; nothing blocks', () => {
    const plan = revisionPlan({ disposals: [{ assetId: 'etf-a', quantity: 10, monthIndex: 3, estimatedProceedsEur: 1000, status: 'planned' }] });
    const ctx = revisionContext(plan);
    const a = initialPlanPathDraft(ctx).answers;
    render(<VenditeScreen answers={a} dispatch={() => {}} context={ctx} />);
    const row = within(screen.getByRole('list', { name: 'Strumenti da vendere' })).getAllByRole('listitem').find((li) => li.textContent?.includes('ETF ornitorinco'))!;
    expect(flat(within(row).getByLabelText('In quale mese').textContent)).toBe('ottobre 2026 · in ritardo');
    expect(saleMonthIndexes(ctx, a.months!, 3)).toEqual([3, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(describePlanPathBlock('vendite', a, ctx)).toBeNull();
  });
});
