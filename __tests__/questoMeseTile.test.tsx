/**
 * «Questo mese» and a sale in its month (2026-11-19): before its month a sale reads «In programma», names
 * its month and offers no action — a dismissed early match on the ledger falls back to it, not to a
 * to-do; in the month the Consulente asked to look at the plan again, a note and «Rivedi il piano». The doors
 * to a revision are links to the path (2026-11-21): the footer's, the review note's, «Rivedi dal modello».
 *
 * The plan's hooks, the dialogs and the services are mocked; the tile and the plan arithmetic are real.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';

vi.mock('@/lib/firebase/config', () => ({ auth: { currentUser: null }, db: {} }));
const demo = vi.hoisted(() => ({ on: false }));
vi.mock('@/lib/hooks/useDemoMode', () => ({ useDemoMode: () => demo.on }));
const spies = vi.hoisted(() => ({ activate: vi.fn(), getAllAssets: vi.fn(), toastError: vi.fn() }));
vi.mock('@/lib/services/assetService', () => ({
  calculateAssetValue: (a: { quantity: number; currentPrice: number }) => a.quantity * a.currentPrice,
  getAllAssets: spies.getAllAssets,
}));
vi.mock('@/lib/services/assetAllocationService', () => ({ compareAllocations: vi.fn() }));
vi.mock('sonner', () => ({ toast: { error: spies.toastError, success: vi.fn() } }));
vi.mock('@/lib/hooks/useAccumulationPlan', () => {
  const mutation = () => ({ mutateAsync: vi.fn(), isPending: false });
  return {
    useActivatePlan: () => ({ mutateAsync: spies.activate, isPending: false }),
    useApplyRecalibration: mutation,
    useDismissRecalibration: mutation,
    useClosePlan: mutation,
    useDeleteDraftPlan: mutation,
    useSetDisposal: mutation,
    useSetInstallmentLine: mutation,
  };
});
vi.mock('@/components/allocation/AccumulationCalendarDialog', () => ({ AccumulationCalendarDialog: () => null }));
vi.mock('@/components/assets/TransactionDialog', () => ({ TransactionDialog: () => null }));

import { AdvisorNotes, QuestoMeseTile } from '@/components/allocation/tiles/QuestoMeseTile';
import {
  ACCUMULO_ACTION_ACTIVATE,
  ACCUMULO_ACTION_IGNORE_MATCH,
  ACCUMULO_ACTION_REGISTER,
  ACCUMULO_ACTION_REVIEW_FROM_MODEL,
  ACCUMULO_ACTION_REVISE,
  ACCUMULO_REVIEW_DUE_NOTE,
  describeDraftIssue,
  monthLabelShort,
} from '@/lib/utils/accumulationNarrative';
import type { LineUiState } from '@/lib/utils/accumulationPlanMatching';
import type { AccumulationPlan } from '@/types/accumulationPlan';
import type { Asset } from '@/types/assets';
import type { ModelPortfolio } from '@/types/modelPortfolio';

const asset = (id: string, name: string, extra: Partial<Asset> = {}): Asset =>
  ({ id, userId: 'owner-1', ticker: id.toUpperCase(), name, type: 'etf', assetClass: 'equity', currency: 'EUR', quantity: 0, currentPrice: 1,
    lastPriceUpdate: new Date(0), createdAt: new Date(0), updatedAt: new Date(0), ...extra }) as Asset;

const ASSETS = [
  asset('etf-uno', 'ETF Uno'),
  asset('fondo-y', 'Fondo Y', { quantity: 10, currentPrice: 600 }),
  asset('conto', 'Conto', { type: 'cash', assetClass: 'cash', quantity: 1, currentPrice: 20000 }),
];

/** 12 instalments from 2027-01 of 100 € of ETF Uno; Fondo Y sold in month 7. */
function activePlan(overrides: Partial<AccumulationPlan> = {}): AccumulationPlan {
  return {
    id: 'plan-1', userId: 'owner-1', name: 'Piano', status: 'active', startMonth: '2027-01', months: 12,
    liquidity: { sourceCashAssetIds: ['conto'], reserveEur: 0, monthlyInflowEur: 0 },
    positions: [{ id: 'p1', label: 'ETF Uno', targetPercentage: 100, memberAssetIds: ['etf-uno'], buyAssetId: 'etf-uno' }],
    disposals: [{ assetId: 'fondo-y', quantity: 10, monthIndex: 7, estimatedProceedsEur: 6000, status: 'planned' }],
    installments: Array.from({ length: 12 }, (_, k) => ({
      index: k + 1,
      month: `2027-${String(k + 1).padStart(2, '0')}` as `${number}-${number}`,
      lines: [{ positionId: 'p1', assetId: 'etf-uno', plannedQuantity: 100, priceEurAtPlan: 1, plannedAmountEur: 100, status: 'planned' as const }],
      carryInEur: {},
    })),
    createdAt: new Date('2026-12-01T12:00:00'),
    updatedAt: new Date('2026-12-01T12:00:00'),
    activatedAt: new Date('2026-12-01T12:00:00'),
    ...overrides,
  } as AccumulationPlan;
}

function renderTile({ plan = activePlan(), currentIndex = 2, saleState = 'upcoming' as LineUiState, today = new Date('2027-02-12T12:00:00'), assets = ASSETS, model = null as ModelPortfolio | null } = {}) {
  const matches = saleState === 'toConfirm'
    ? [{ kind: 'disposal' as const, assetId: 'fondo-y', transactionIds: ['tx-1'], quantity: 10, amountEur: 6000 }]
    : [];
  return render(
    <QuestoMeseTile
      ownerId="owner-1"
      plan={plan}
      allAssets={assets}
      targets={{} as never}
      band={{ mode: 'relative', value: 20 } as never}
      currentIndex={currentIndex}
      matchResult={{ matches: matches as never, lineStates: { 'disposal:fondo-y': saleState } }}
      model={model}
      reviewByIso={null}
      today={today}
    />,
  );
}

const saleRow = () => screen.getByText('Fondo Y').closest('li') as HTMLElement;

describe('QuestoMeseTile — a sale before its month', () => {
  // Mutation that turns it red: the actions rendered for `upcoming`.
  it('reads «In programma» with its month and offers no action', () => {
    renderTile();
    const row = within(saleRow());
    expect(row.getByText('In programma')).toBeTruthy();
    expect(saleRow().textContent).toContain(monthLabelShort('2027-07'));
    expect(row.queryAllByRole('button')).toHaveLength(0);
  });

  // Mutation that turns it red: `isUpcoming` dropped from `effectiveLineState`.
  it('a dismissed early match on the ledger falls back to «In programma», never to «Registra»', () => {
    renderTile({ saleState: 'toConfirm' });
    fireEvent.click(within(saleRow()).getByRole('button', { name: ACCUMULO_ACTION_IGNORE_MATCH }));
    const row = within(saleRow());
    expect(row.getByText('In programma')).toBeTruthy();
    expect(row.queryByRole('button', { name: ACCUMULO_ACTION_REGISTER })).toBeNull();
  });
});

describe('QuestoMeseTile — the review month', () => {
  // Mutation that turns it red: `review <= currentIndex` in `isPlanReviewDue`.
  it('the note and «Rivedi il piano» at the review month only', () => {
    const plan = activePlan({ reviewMonthIndex: 2 });
    const { unmount } = renderTile({ plan });
    expect(screen.getByText(ACCUMULO_REVIEW_DUE_NOTE)).toBeTruthy();
    // The note's own link beside the footer's.
    expect(screen.getAllByRole('link', { name: ACCUMULO_ACTION_REVISE })).toHaveLength(2);
    unmount();

    renderTile({ plan, currentIndex: 3, today: new Date('2027-03-12T12:00:00') });
    expect(screen.queryByText(ACCUMULO_REVIEW_DUE_NOTE)).toBeNull();
    expect(screen.getAllByRole('link', { name: ACCUMULO_ACTION_REVISE })).toHaveLength(1);
  });
});

// R2 (2026-11-21). Mutation that turns it red: the doors kept as buttons that open the editor (`setReviseOpen`).
describe('QuestoMeseTile — the doors to a revision are links to the path', () => {
  beforeEach(() => { demo.on = false; });
  /** The model holds Fondo Y too: the plan's quotas differ from it, so «Rivedi dal modello» shows. */
  const MODEL: ModelPortfolio = {
    userId: 'owner-1', origin: 'manual', updatedAt: new Date(0),
    weights: [{ assetId: 'etf-uno', targetPercentage: 50 }, { assetId: 'fondo-y', targetPercentage: 50 }],
  };

  it('the footer, the review note and «Rivedi dal modello»: links with the two hrefs', () => {
    renderTile({ plan: activePlan({ reviewMonthIndex: 2 }), model: MODEL });
    const revise = screen.getAllByRole('link', { name: ACCUMULO_ACTION_REVISE });
    expect(revise.map((link) => link.getAttribute('href'))).toEqual(['/dashboard/allocation/piano', '/dashboard/allocation/piano']);
    expect(screen.getByRole('link', { name: ACCUMULO_ACTION_REVIEW_FROM_MODEL }).getAttribute('href')).toBe('/dashboard/allocation/piano?da=modello');
    expect(screen.queryByRole('button', { name: ACCUMULO_ACTION_REVISE })).toBeNull();
  });

  it('in demo: a disabled button and no link', () => {
    demo.on = true;
    renderTile({ model: MODEL });
    expect(screen.queryByRole('link', { name: ACCUMULO_ACTION_REVISE })).toBeNull();
    expect((screen.getByRole('button', { name: ACCUMULO_ACTION_REVISE }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByRole('link', { name: ACCUMULO_ACTION_REVIEW_FROM_MODEL })).toBeNull();
  });

  it('every instalment closed: a disabled button and no link', () => {
    const plan = activePlan();
    for (const installment of plan.installments) installment.lines.forEach((line) => { line.status = 'executed'; });
    renderTile({ plan });
    expect(screen.queryByRole('link', { name: ACCUMULO_ACTION_REVISE })).toBeNull();
    expect((screen.getByRole('button', { name: ACCUMULO_ACTION_REVISE }) as HTMLButtonElement).disabled).toBe(true);
  });
});

// A position whose instrument has no price (the Consulente's «Applica» creates one when no listing quotes it, 2026-11-20).
// Mutation that turns it red: the sentence dropped from the active view.
describe('QuestoMeseTile — a position with no price', () => {
  it('names it once, and says nothing while every position has a price', () => {
    const { unmount } = renderTile();
    expect(screen.queryByText(/non ha un prezzo disponibile/)).toBeNull();
    unmount();
    const plan = activePlan({
      positions: [
        { id: 'p1', label: 'ETF Uno', targetPercentage: 60, memberAssetIds: ['etf-uno'], buyAssetId: 'etf-uno' },
        { id: 'p2', label: 'ETF Nuovo', targetPercentage: 40, memberAssetIds: ['etf-nuovo'], buyAssetId: 'etf-nuovo' },
      ],
    });
    renderTile({ plan, assets: [...ASSETS, asset('etf-nuovo', 'ETF Nuovo', { currentPrice: 0 })] });
    expect(screen.getByText('ETF Nuovo non ha un prezzo disponibile: non riceve acquisti finché non lo aggiorni.')).not.toBeNull();
  });
});

// The Consulente's corrections on a plan its «Applica» created (2026-11-20). Mutation that turns it red: every note shown.
describe('AdvisorNotes', () => {
  it('nothing without notes; up to three in sight, the rest behind «Altre n»', () => {
    const { container, unmount } = render(<AdvisorNotes notes={[]} />);
    expect(container.textContent).toBe('');
    unmount();
    const notes = ['Nota uno.', 'Nota due.', 'Nota tre.', 'Nota quattro.', 'Nota cinque.'];
    const view = render(<AdvisorNotes notes={notes} />);
    expect(screen.getByText('Dal Consulente')).not.toBeNull();
    const list = screen.getAllByRole('list')[0];
    expect(within(list).getAllByRole('listitem').map((item) => item.textContent)).toEqual(['Nota uno.', 'Nota due.', 'Nota tre.']);
    const more = view.container.querySelector('details') as HTMLDetailsElement;
    expect(more.querySelector('summary')?.textContent).toBe('Altre 2');
    expect(more.textContent).toContain('Nota cinque.');
  });
});

// The swap (owner, 2026-11-20, on the mirror: the two sales registrable in November, the BTP€i only from December, as a
// line of the rata). Its purchase sits under the sales that pay it, with its own Registra, never among the rata's lines.
// Mutations that turn it red: the swap line kept among the rata's lines; the swap row not drawn under the sales.
describe('QuestoMeseTile — the swap', () => {
  const swapPlan = () => {
    const base = activePlan({ disposals: [{ assetId: 'fondo-y', quantity: 10, monthIndex: 1, estimatedProceedsEur: 6000, status: 'planned', reinvestAssetId: 'btp' }] });
    return {
      ...base,
      positions: [...base.positions, { id: 'p-btp', label: 'BTP€i fenicottero', targetPercentage: 0, memberAssetIds: ['btp'], buyAssetId: 'btp' }],
      installments: base.installments.map((installment) => installment.index === 1
        ? { ...installment, lines: [...installment.lines, { positionId: 'p-btp', assetId: 'btp', plannedQuantity: 5000, priceEurAtPlan: 1.2, plannedAmountEur: 6000, status: 'planned' as const, swap: true as const }] }
        : installment),
    } as AccumulationPlan;
  };
  const assets = [...ASSETS, asset('btp', 'BTP€i fenicottero', { type: 'bond', assetClass: 'bonds', currentPrice: 1.2 })];

  for (const [when, currentIndex, today] of [['before the start', 0, '2026-12-12'], ['in its month', 1, '2027-01-12']] as const) {
    it(`${when}: under the sale, «Con il ricavato», with Registra; not among the rata's lines`, () => {
      renderTile({ plan: swapPlan(), currentIndex, saleState: 'todo', today: new Date(`${today}T12:00:00`), assets });
      const row = screen.getByText((text) => text.startsWith('Con il ricavato: BTP€i fenicottero')).closest('li') as HTMLElement;
      expect(row.previousElementSibling).toBe(saleRow());
      expect(within(row).getByRole('button', { name: ACCUMULO_ACTION_REGISTER })).toBeTruthy();
      expect(screen.queryAllByText((text) => text.includes('BTP€i fenicottero') && !text.startsWith('Con il ricavato')).filter((el) => el.tagName === 'SPAN' && el.closest('li'))).toHaveLength(0);
    });
  }
});

// «Attiva piano» on a draft (2026-11-20, the guided path's retirement): the gate runs on the assets read AGAIN at the click,
// never on the page's list — an account deleted in another tab is `source_missing`, nothing activated (as the path's
// «Conferma» and the Consulente's «Applica»). Mutation that turns it red: `handleActivate` passing the page's `allAssets`.
describe('QuestoMeseTile — «Attiva piano» reads the assets again', () => {
  beforeEach(() => {
    spies.activate.mockReset().mockResolvedValue(undefined);
    spies.getAllAssets.mockReset();
    spies.toastError.mockReset();
  });
  const draftPlan = () => activePlan({
    status: 'draft', installments: [], disposals: [], activatedAt: undefined, startMonth: '2027-03',
    positions: [
      { id: 'p1', label: 'ETF Uno', targetPercentage: 50, memberAssetIds: ['etf-uno'], buyAssetId: 'etf-uno' },
      { id: 'p2', label: 'Fondo Y', targetPercentage: 50, memberAssetIds: ['fondo-y'], buyAssetId: 'fondo-y' },
    ],
  });

  it('an account gone since the page loaded → the gate\'s sentence, nothing activated', async () => {
    spies.getAllAssets.mockResolvedValue(ASSETS.filter((a) => a.id !== 'conto'));
    renderTile({ plan: draftPlan(), currentIndex: 0 });
    fireEvent.click(screen.getByRole('button', { name: ACCUMULO_ACTION_ACTIVATE }));
    await waitFor(() => expect(spies.toastError).toHaveBeenCalledWith(describeDraftIssue({ code: 'source_missing' })));
    expect(spies.getAllAssets).toHaveBeenCalledWith('owner-1');
    expect(spies.activate).not.toHaveBeenCalled();
  });

  it('the account still there → activated on the list just read', async () => {
    const fresh = ASSETS.map((a) => ({ ...a }));
    spies.getAllAssets.mockResolvedValue(fresh);
    renderTile({ plan: draftPlan(), currentIndex: 0 });
    fireEvent.click(screen.getByRole('button', { name: ACCUMULO_ACTION_ACTIVATE }));
    await waitFor(() => expect(spies.activate).toHaveBeenCalledTimes(1));
    expect(spies.activate.mock.calls[0][0].input.allAssets).toBe(fresh);
  });
});
