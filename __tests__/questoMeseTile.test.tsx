/**
 * «Questo mese» and a sale in its month (2026-11-19): before its month a sale reads «In programma», names
 * its month and offers no action — a dismissed early match on the ledger falls back to it, not to a
 * to-do; in the month the Consulente asked to look at the plan again, a note and «Rivedi il piano».
 *
 * The plan's hooks, the dialogs and the services are mocked; the tile and the plan arithmetic are real.
 */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';

vi.mock('@/lib/firebase/config', () => ({ auth: { currentUser: null }, db: {} }));
vi.mock('@/lib/hooks/useDemoMode', () => ({ useDemoMode: () => false }));
vi.mock('@/lib/services/assetService', () => ({ calculateAssetValue: (a: { quantity: number; currentPrice: number }) => a.quantity * a.currentPrice }));
vi.mock('@/lib/services/assetAllocationService', () => ({ compareAllocations: vi.fn() }));
vi.mock('@/lib/hooks/useAccumulationPlan', () => {
  const mutation = () => ({ mutateAsync: vi.fn(), isPending: false });
  return {
    useActivatePlan: mutation,
    useApplyRecalibration: mutation,
    useDismissRecalibration: mutation,
    useClosePlan: mutation,
    useDeleteDraftPlan: mutation,
    useSetDisposal: mutation,
    useSetInstallmentLine: mutation,
  };
});
vi.mock('@/components/allocation/AccumulationPlanDialog', () => ({ AccumulationPlanDialog: () => null }));
vi.mock('@/components/allocation/AccumulationCalendarDialog', () => ({ AccumulationCalendarDialog: () => null }));
vi.mock('@/components/assets/TransactionDialog', () => ({ TransactionDialog: () => null }));

import { QuestoMeseTile } from '@/components/allocation/tiles/QuestoMeseTile';
import { DEFAULT_IDEAL_ALLOCATION } from '@/lib/constants/idealAllocation';
import {
  ACCUMULO_ACTION_IGNORE_MATCH,
  ACCUMULO_ACTION_REGISTER,
  ACCUMULO_ACTION_REVISE,
  ACCUMULO_REVIEW_DUE_NOTE,
  monthLabelShort,
} from '@/lib/utils/accumulationNarrative';
import type { LineUiState } from '@/lib/utils/accumulationPlanMatching';
import type { AccumulationPlan } from '@/types/accumulationPlan';
import type { Asset } from '@/types/assets';

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

function renderTile({ plan = activePlan(), currentIndex = 2, saleState = 'upcoming' as LineUiState, today = new Date('2027-02-12T12:00:00') } = {}) {
  const matches = saleState === 'toConfirm'
    ? [{ kind: 'disposal' as const, assetId: 'fondo-y', transactionIds: ['tx-1'], quantity: 10, amountEur: 6000 }]
    : [];
  return render(
    <QuestoMeseTile
      ownerId="owner-1"
      plan={plan}
      allAssets={ASSETS}
      targets={{} as never}
      band={{ mode: 'relative', value: 20 } as never}
      targetLeverageRatio={1}
      idealAllocation={DEFAULT_IDEAL_ALLOCATION}
      currentIndex={currentIndex}
      matchResult={{ matches: matches as never, lineStates: { 'disposal:fondo-y': saleState } }}
      onAssetsChanged={() => {}}
      reviewByIso={null}
      modelBasis={{} as never}
      today={today}
      investmentAccountId={null}
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
    // The note's own button beside the footer's.
    expect(screen.getAllByRole('button', { name: ACCUMULO_ACTION_REVISE })).toHaveLength(2);
    unmount();

    renderTile({ plan, currentIndex: 3, today: new Date('2027-03-12T12:00:00') });
    expect(screen.queryByText(ACCUMULO_REVIEW_DUE_NOTE)).toBeNull();
    expect(screen.getAllByRole('button', { name: ACCUMULO_ACTION_REVISE })).toHaveLength(1);
  });
});
