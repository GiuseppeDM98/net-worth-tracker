/**
 * `CostoTile` (components/cashflow/cost-centers/tiles/CostoTile.tsx): with a `ring` the footer is the
 * 96px ring of fixed and one-off (The Ring Rule, 2026-11-12) and its two legend rows, «ricorrenti e
 * rate» under «Fisso» — the footer sentence gone, the rows say it with figures; without, today's
 * sentence. Figures invented and round. Seen red on 2026-11-15 with both rendered.
 */

import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';

// The tile reaches the client Firebase SDK through `PatrimonioTile`'s chain: mocked, as on every tile
// that imports it (cashflowTile.test.tsx).
vi.mock('@/lib/firebase/config', () => ({ db: {} }));
vi.mock('@/lib/utils/authFetch', () => ({ authenticatedFetch: vi.fn() }));
vi.mock('@/lib/services/dashboardOverviewInvalidation', () => ({ invalidateDashboardOverviewSummary: vi.fn() }));
vi.mock('firebase/firestore', () => ({ doc: vi.fn(), getDoc: vi.fn(), setDoc: vi.fn(), deleteField: vi.fn() }));
import { CostoTile } from '@/components/cashflow/cost-centers/tiles/CostoTile';
import { costCenterRingSegments, summarizeCenter } from '@/lib/utils/costCenterSummary';
import { describeCostoFooter } from '@/lib/utils/costCenterNarrative';
import type { Expense } from '@/types/expenses';

const NOW = new Date(2026, 7, 22, 12);
const CENTER = { id: 'casa', userId: 'u1', name: 'Casa', createdAt: NOW, updatedAt: NOW };
const KPI = { value: '0 €', caption: [], tone: 'neutral' as const };

const row = (id: string, amount: number, isRecurring = false): Expense => ({
  id,
  userId: 'u1',
  type: 'variable',
  categoryId: 'c1',
  categoryName: 'Lavori',
  amount,
  currency: 'EUR',
  date: new Date(2026, 7, 5, 12),
  createdAt: NOW,
  updatedAt: NOW,
  isRecurring,
});

function renderTile(rows: Expense[]) {
  const summary = summarizeCenter(CENTER, rows, NOW);
  return render(
    <CostoTile
      summary={summary}
      stack={{ months: [], centers: [] }}
      stackCaption={[]}
      aside={[]}
      reading={[]}
      footer={describeCostoFooter(summary)}
      kpis={{ month: KPI, year: KPI, average: KPI }}
      ring={costCenterRingSegments(summary)}
      palette={[]}
      now={NOW}
    />,
  );
}

describe('CostoTile', () => {
  it('K2: the ring and «ricorrenti e rate», the footer sentence gone', () => {
    const { container } = renderTile([row('a', -30, true), row('b', -240)]);
    expect(container.querySelector('[data-ring]')).not.toBeNull();
    expect(container.textContent).toContain('ricorrenti e rate');
    expect(container.textContent).not.toContain('una tantum ');
  });

  it('K2: the sentence without a ring', () => {
    const { container } = renderTile([row('b', -240)]);
    expect(container.querySelector('[data-ring]')).toBeNull();
    expect(container.textContent).toContain('Tutto una tantum: nessuna spesa ricorrente o a rate.');
  });
});
