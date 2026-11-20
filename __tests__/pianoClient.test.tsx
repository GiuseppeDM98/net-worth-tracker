/**
 * The plan path's host (components/allocation/piano/PianoClient.tsx): the states before the wizard, the
 * first that applies — plans restored but not fetched after mount (the skeleton), the demo, no targets, an
 * ACTIVE plan (its sentence and «Apri Accumulo»), an active plan with every instalment closed (the sentence
 * of «nothing to revise»). The hooks are mocked; the wizard is a marker.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

const { state } = vi.hoisted(() => ({
  state: {
    demo: false,
    settings: { targets: { equity: { targetPercentage: 100 } } } as Record<string, unknown> | null,
    plans: [] as unknown[],
    plansFresh: true,
  },
}));

const query = (data: unknown) => ({ data, isLoading: false, isError: false, refetch: vi.fn() });

vi.mock('@/lib/firebase/config', () => ({ auth: { currentUser: null }, db: {} }));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: vi.fn() }) }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { uid: 'owner-1' } }) }));
vi.mock('@/contexts/ActiveAccountContext', () => ({ useActiveAccount: () => ({ ownerId: 'owner-1' }) }));
vi.mock('@/lib/hooks/useDemoMode', () => ({ useDemoMode: () => state.demo }));
vi.mock('@/lib/hooks/useAssets', () => ({ useAssets: () => query([]) }));
vi.mock('@/lib/hooks/useSettings', () => ({ useSettings: () => query(state.settings) }));
vi.mock('@/lib/hooks/useGoalData', () => ({ useGoalData: () => query(null) }));
vi.mock('@/lib/hooks/useAccumulationPlans', () => ({
  useAccumulationPlans: () => ({ ...query(state.plans), isFetchedAfterMount: state.plansFresh }),
  selectOpenPlan: (plans: Array<{ status: string }> | undefined) => plans?.find((plan) => plan.status === 'draft' || plan.status === 'active'),
}));
vi.mock('@/lib/hooks/useModelPortfolio', () => ({ useModelPortfolio: () => query(null) }));
vi.mock('@/lib/hooks/useAllocationAdvice', () => ({ useAllocationAdvice: () => query(undefined) }));
vi.mock('@/lib/hooks/useAssetTransactions', () => ({ useAssetLedgerMeta: () => query(undefined), useAssetTransactions: () => query(undefined) }));
vi.mock('@/lib/services/assetService', () => ({ calculateAssetValue: (a: { quantity: number; currentPrice: number }) => a.quantity * a.currentPrice }));
vi.mock('@/lib/services/assetAllocationService', () => ({ compareAllocations: vi.fn(), getDefaultTargets: () => ({ equity: { targetPercentage: 100 } }), buildTargetsFromGoalAllocation: vi.fn() }));
vi.mock('@/components/allocation/piano/PianoWizard', () => ({
  PianoWizard: ({ onCreated }: { onCreated: () => void }) => <button type="button" onClick={onCreated}>WIZARD</button>,
}));

import { PianoClient } from '@/components/allocation/piano/PianoClient';
import { ACCUMULO_PLAN_NOTHING_TO_REVISE } from '@/lib/utils/accumuloCopy';

function activePlan(lineStatus: 'pending' | 'executed') {
  return {
    id: 'plan-1', status: 'active', startMonth: '2026-12', months: 1,
    installments: [{ index: 1, month: '2026-12', lines: [{ status: lineStatus }] }],
  };
}

beforeEach(() => {
  state.demo = false;
  state.settings = { targets: { equity: { targetPercentage: 100 } } };
  state.plans = [];
  state.plansFresh = true;
});

describe('PianoClient (mutation: render the wizard with an active plan)', () => {
  it('without plans and with targets: the wizard', () => {
    render(<PianoClient />);
    expect(screen.getByText('WIZARD')).toBeTruthy();
  });

  it('plans restored but not fetched after mount: the skeleton, no wizard', () => {
    state.plansFresh = false;
    render(<PianoClient />);
    expect(screen.queryByText('WIZARD')).toBeNull();
  });

  it('demo: the path is not available', () => {
    state.demo = true;
    render(<PianoClient />);
    expect(screen.getByText("Il piano di accumulo non si crea nell'account demo.")).toBeTruthy();
    expect(screen.queryByText('WIZARD')).toBeNull();
  });

  it('no targets of its own and none from goals: the link to Impostazioni', () => {
    state.settings = null;
    render(<PianoClient />);
    expect(screen.getByText('Prima imposta i target in Impostazioni › Allocazione: il piano va verso di essi.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Apri Impostazioni' }).getAttribute('href')).toBe('/dashboard/settings?tab=allocazione');
    expect(screen.queryByText('WIZARD')).toBeNull();
  });

  it('an active plan: its sentence and «Apri Accumulo», no wizard', () => {
    state.plans = [activePlan('pending')];
    render(<PianoClient />);
    expect(screen.getByText('Hai già un piano di accumulo attivo.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Apri Accumulo' }).getAttribute('href')).toBe('/dashboard/allocation?tab=accumulo');
    expect(screen.queryByText('WIZARD')).toBeNull();
  });

  it('an active plan with every instalment closed: the sentence of nothing to revise', () => {
    state.plans = [activePlan('executed')];
    render(<PianoClient />);
    expect(screen.getByText(ACCUMULO_PLAN_NOTHING_TO_REVISE)).toBeTruthy();
    expect(screen.queryByText('WIZARD')).toBeNull();
  });

  it('an active plan clears the browser draft', () => {
    window.localStorage.setItem('plan-path-draft:v1:owner-1', '{"version":1}');
    state.plans = [activePlan('pending')];
    render(<PianoClient />);
    expect(window.localStorage.getItem('plan-path-draft:v1:owner-1')).toBeNull();
  });
});

describe('PianoClient after «Conferma» (mutation: let the refetched active plan replace the wizard)', () => {
  it('the plan the wizard just created does not turn the page into «Hai già un piano»', () => {
    const view = render(<PianoClient />);
    fireEvent.click(screen.getByText('WIZARD'));
    state.plans = [activePlan('pending')];
    view.rerender(<PianoClient />);
    expect(screen.getByText('WIZARD')).toBeTruthy();
    expect(screen.queryByText('Hai già un piano di accumulo attivo.')).toBeNull();
  });
});
