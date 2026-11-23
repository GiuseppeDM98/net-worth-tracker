/**
 * The Accumulo tab's empty tile and the suggested instalment (owner, 2026-11-12): the median of the
 * monthly savings, named with the months it spans — and nothing at all without one (The
 * Absence-Has-Three-Names Rule: never «0 €», never a spinner that does not end).
 *
 * The expenses and the settings are mocked at their hooks, the cashflow block at its builder (its
 * arithmetic is `cashflowBlock.test.ts`'s); `useMonthlySavingsMedian` and the tile are real.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const { expensesState, blockState, demoState } = vi.hoisted(() => ({
  demoState: { value: false },
  expensesState: { value: { data: [] as unknown[] | undefined, isError: false } },
  blockState: { value: null as null | { median: number; months: number } },
}));

vi.mock('@/lib/firebase/config', () => ({ auth: { currentUser: null }, db: {} }));
vi.mock('@/lib/hooks/useExpenses', () => ({ useExpensesInRange: () => expensesState.value }));
vi.mock('@/lib/hooks/useSettings', () => ({ useSettings: () => ({ data: null, isError: false }) }));
vi.mock('@/lib/hooks/useDemoMode', () => ({ useDemoMode: () => demoState.value }));
vi.mock('@/lib/services/assetService', () => ({ calculateAssetValue: (a: { quantity: number; currentPrice: number }) => a.quantity * a.currentPrice }));
vi.mock('@/lib/services/assetAllocationService', () => ({
  compareAllocations: () => ({ byAssetClass: {}, bySubCategory: {}, bySpecificAsset: {}, totalValue: 0, marketValue: 0 }),
}));
vi.mock('@/lib/utils/accumuloSummary', () => ({ buildAccumuloPreview: () => null }));
vi.mock('@/lib/utils/cashflowBlock', () => ({
  buildCashflowBlock: () => ({
    volatility: blockState.value ? { savings: { median: blockState.value.median } } : null,
    windows: { medianMonths: blockState.value?.months ?? 2 },
  }),
}));

import { AccumuloVuotoTile } from '@/components/allocation/tiles/AccumuloVuotoTile';

const props = {
  ownerId: 'owner-1',
  allAssets: [],
  targets: null,
  band: { mode: 'relative', value: 20 } as never,
  hasTargets: false,
  today: new Date('2026-11-12T12:00:00'),
  model: null,
};
const TARGETS = { equity: { targetPercentage: 100 } };

const flat = (text: string | null) => (text ?? '').replace(/[  ]/g, ' ');

beforeEach(() => {
  expensesState.value = { data: [], isError: false };
  blockState.value = null;
  demoState.value = false;
});

describe('AccumuloVuotoTile — «Crea piano» (2026-11-20)', () => {
  it('with targets: a link to the guided path', () => {
    render(<AccumuloVuotoTile {...props} targets={TARGETS} hasTargets />);
    expect(screen.getByRole('link', { name: 'Crea piano' }).getAttribute('href')).toBe('/dashboard/allocation/piano');
  });

  it('in demo, or without targets: a disabled button, no link', () => {
    demoState.value = true;
    const { unmount } = render(<AccumuloVuotoTile {...props} targets={TARGETS} hasTargets />);
    expect(screen.queryByRole('link', { name: 'Crea piano' })).toBeNull();
    expect((screen.getByRole('button', { name: 'Crea piano' }) as HTMLButtonElement).disabled).toBe(true);
    unmount();
    demoState.value = false;
    render(<AccumuloVuotoTile {...props} targets={TARGETS} hasTargets={false} />);
    expect(screen.queryByRole('link', { name: 'Crea piano' })).toBeNull();
    expect((screen.getByRole('button', { name: 'Crea piano' }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('AccumuloVuotoTile — the suggested instalment', () => {
  it('a median of 1200 over 12 months names 1200 €', () => {
    blockState.value = { median: 1200, months: 12 };
    const { container } = render(<AccumuloVuotoTile {...props} />);
    expect(flat(container.textContent)).toContain('Il tuo risparmio mensile mediano degli ultimi 12 mesi è di 1200 €.');
  });

  // Seen red printing «0 €» for a null median.
  it('no median: no sentence', () => {
    const { container } = render(<AccumuloVuotoTile {...props} />);
    expect(container.textContent).not.toContain('risparmio mensile mediano');
    expect(flat(container.textContent)).not.toContain(' 0 €');
  });

  it('a failed expenses read: no sentence and no spinner', () => {
    expensesState.value = { data: undefined, isError: true };
    const { container } = render(<AccumuloVuotoTile {...props} />);
    expect(container.textContent).not.toContain('risparmio mensile mediano');
    expect(screen.queryByRole('status')).toBeNull();
  });
});
