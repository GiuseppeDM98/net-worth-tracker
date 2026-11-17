/**
 * The editor's preview beside the Target step: a plan that ends after the Consulente's «rivedi entro»
 * date says so (2026-11-12). Rendered with no preview (no weights yet), which draws no chart.
 */
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { vi } from 'vitest';

vi.mock('@/lib/firebase/config', () => ({ auth: { currentUser: null }, db: {} }));
import { PlanDraftSidePanel } from '@/components/allocation/PlanDraftSidePanel';
import { PLAN_PREVIEW_EMPTY, describePlanPastReview } from '@/lib/utils/accumulationNarrative';

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
