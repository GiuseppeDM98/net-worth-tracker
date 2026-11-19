/**
 * The editor's preview beside the Target step: a plan that ends after the Consulente's «rivedi entro»
 * date says so (2026-11-12). Rendered with no preview (no weights yet), which draws no chart.
 */
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { vi } from 'vitest';

vi.mock('@/lib/firebase/config', () => ({ auth: { currentUser: null }, db: {} }));
vi.mock('@/components/allocation/ClassDriftChart', () => ({ ClassDriftChart: () => null }));
import { PlanDraftSidePanel } from '@/components/allocation/PlanDraftSidePanel';
import { PLAN_PREVIEW_EMPTY, describePlanPastReview, describeSaleStep } from '@/lib/utils/accumulationNarrative';

const band = { mode: 'relative', value: 20 } as never;
const props = { preview: null, months: 12, startMonth: '2027-01', band, weightsSum: 0, targetLeverageRatio: 1 };

describe('PlanDraftSidePanel', () => {
  // Seen red with the condition dropped: the note rendered with a review date after the plan's end.
  it('names the review date when the plan ends after it', () => {
    render(<PlanDraftSidePanel {...props} reviewByIso="2027-06-30" />);
    expect(screen.getByText(describePlanPastReview('2027-06-30'))).toBeTruthy();
  });

  it('says nothing without a review date, or with one after the plan’s end', () => {
    const { unmount } = render(<PlanDraftSidePanel {...props} reviewByIso={null} />);
    expect(screen.queryByText(/revisione dell’allocazione|revisione dell'allocazione/)).toBeNull();
    unmount();
    render(<PlanDraftSidePanel {...props} reviewByIso="2028-01-15" />);
    expect(screen.queryByText(/revisione dell’allocazione|revisione dell'allocazione/)).toBeNull();
    expect(screen.getByText(PLAN_PREVIEW_EMPTY)).toBeTruthy();
  });
});

// A later sale in the preview (2026-11-19): its own line beside the month-1 sales, and one sentence per month
// it raises the instalment. Mutation that turns it red: no sentence rendered.
describe('PlanDraftSidePanel — a later sale', () => {
  const instalments = [800, 800, 1800, 1800].map((eur, k) => ({
    index: k + 1,
    month: `2027-0${k + 1}`,
    lines: [{ positionId: 'p1', assetId: 'etf-uno', plannedQuantity: eur, priceEurAtPlan: 1, plannedAmountEur: eur, status: 'planned' }],
    carryInEur: {},
  }));
  const preview = {
    liquidity: { L: 5200, L0: 0, availableNowEur: 1200, disposalProceedsEur: 4000, dueProceedsEur: 2000, inflowTotalEur: 0, shortfallEur: 0, refillMonths: 0, monthShares: null },
    totals: {},
    schedule: { installments: instalments, residualEur: 0 },
    outcome: { leverageRatio: 1 },
    trajectory: [],
    unpricedPositionIds: [],
  } as never;
  const steps = [{ month: '2027-03' as const, instalmentEur: 1800, names: ['Fondo Y'] }];

  it('splits the sales and names the month a sale raises the instalment', () => {
    const { container } = render(<PlanDraftSidePanel {...props} reviewByIso={null} months={4} weightsSum={100} preview={preview} saleSteps={steps} />);
    expect(container.textContent).toContain(describeSaleStep(steps[0]));
    expect(screen.getByText('vendite al mese 1')).toBeTruthy();
    expect(screen.getByText('vendite nei mesi successivi')).toBeTruthy();
  });

  it('no later sale: no sentence and no second line', () => {
    const even = { ...(preview as object), liquidity: { ...(preview as { liquidity: object }).liquidity, disposalProceedsEur: 2000 } } as never;
    render(<PlanDraftSidePanel {...props} reviewByIso={null} months={4} weightsSum={100} preview={even} />);
    expect(screen.queryByText(/la rata sale a/)).toBeNull();
    expect(screen.queryByText('vendite nei mesi successivi')).toBeNull();
  });
});
