/**
 * The plan path's host (components/allocation/piano/PianoClient.tsx): the states before the wizard, the
 * first that applies — plans restored but not fetched after mount (the skeleton), the demo, no targets, an
 * active plan with every instalment closed (the sentence of «nothing to revise»); an ACTIVE plan with an intact
 * instalment opens the wizard in a revision (2026-11-21). The hooks are mocked; the wizard is a marker.
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
  PianoWizard: ({ onCreated, context }: { onCreated: () => void; context: { revision: { plan: { id: string; revisions?: unknown[] } } | null; fromModel: boolean } }) => (
    <button type="button" onClick={onCreated}>
      {context.revision ? `REVISION ${context.revision.plan.id} ${context.revision.plan.revisions?.length ?? 0} ${context.fromModel}` : 'WIZARD'}
    </button>
  ),
}));

import { PianoClient } from '@/components/allocation/piano/PianoClient';
import { ACCUMULO_PLAN_NOTHING_TO_REVISE } from '@/lib/utils/accumuloCopy';

function activePlan(lineStatus: 'pending' | 'executed', revisions: unknown[] = []) {
  return {
    id: 'plan-1', status: 'active', startMonth: '2026-12', months: 1, disposals: [], revisions,
    installments: [{ index: 1, month: '2026-12', lines: [{ status: lineStatus }] }],
  };
}

beforeEach(() => {
  state.demo = false;
  state.settings = { targets: { equity: { targetPercentage: 100 } } };
  state.plans = [];
  state.plansFresh = true;
});

describe('PianoClient (mutation: keep the «Hai già un piano» screen for an active plan with an intact instalment)', () => {
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

  it('an active plan with an intact instalment: the wizard in a revision, the header says so', () => {
    state.plans = [activePlan('pending')];
    render(<PianoClient />);
    expect(screen.getByText('REVISION plan-1 0 false')).toBeTruthy();
    expect(screen.getByText('Rivedi il piano: le rate chiuse restano come sono.')).toBeTruthy();
  });

  it('?da=modello reaches the wizard as fromModel', () => {
    state.plans = [activePlan('pending')];
    render(<PianoClient fromModel />);
    expect(screen.getByText('REVISION plan-1 0 true')).toBeTruthy();
  });

  // Read from the URL on the client, never from the page's `searchParams` (it made the route dynamic: perf:budget
  // read no prerendered page, found at the § 4.6 measure). Mutation that turns it red: the URL not read.
  it('?da=modello in the URL, no prop: fromModel', () => {
    window.history.pushState({}, '', '/dashboard/allocation/piano?da=modello');
    try {
      state.plans = [activePlan('pending')];
      render(<PianoClient />);
      expect(screen.getByText('REVISION plan-1 0 true')).toBeTruthy();
    } finally {
      window.history.pushState({}, '', '/');
    }
  });

  it('an active plan with every instalment closed: the sentence of nothing to revise', () => {
    state.plans = [activePlan('executed')];
    render(<PianoClient />);
    expect(screen.getByText(ACCUMULO_PLAN_NOTHING_TO_REVISE)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Apri Accumulo' }).getAttribute('href')).toBe('/dashboard/allocation?tab=accumulo');
    expect(screen.queryByText('WIZARD')).toBeNull();
  });

  it('a plan with nothing to revise clears the browser draft; one in revision keeps it for the wizard', () => {
    window.localStorage.setItem('plan-path-draft:v1:owner-1', '{"version":1}');
    state.plans = [activePlan('executed')];
    const view = render(<PianoClient />);
    expect(window.localStorage.getItem('plan-path-draft:v1:owner-1')).toBeNull();
    view.unmount();
    window.localStorage.setItem('plan-path-draft:v1:owner-1', '{"version":1}');
    state.plans = [activePlan('pending')];
    render(<PianoClient />);
    expect(window.localStorage.getItem('plan-path-draft:v1:owner-1')).toBe('{"version":1}');
  });
});

describe('PianoClient after «Conferma» (mutation: let the refetched active plan replace the wizard)', () => {
  it('the plan the wizard just created does not turn the page into a revision', () => {
    const view = render(<PianoClient />);
    fireEvent.click(screen.getByText('WIZARD'));
    state.plans = [activePlan('pending')];
    view.rerender(<PianoClient />);
    expect(screen.getByText('WIZARD')).toBeTruthy();
    expect(screen.queryByText(/^REVISION/)).toBeNull();
  });

  it('the plan the wizard just revised: the refetched plan (one more revision) does not restart it', () => {
    state.plans = [activePlan('pending')];
    const view = render(<PianoClient />);
    fireEvent.click(screen.getByText('REVISION plan-1 0 false'));
    state.plans = [activePlan('pending', [{ fromIndex: 1 }])];
    view.rerender(<PianoClient />);
    expect(screen.getByText('REVISION plan-1 0 false')).toBeTruthy();
  });
});
