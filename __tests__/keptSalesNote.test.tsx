/**
 * `KeptSalesNote` (components/allocation/KeptSalesNote.tsx, owner 2026-11-12): in the plan editor opened from the
 * Consulente's hand-off, a month-1 sale of an instrument the Consulente proposed to keep is named, once, as a
 * status line. Invented names (ETF ornitorinco, Fondo fenicottero).
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { PlanDisposal } from '@/types/accumulationPlan';

// The hand-off module reaches the optimizer, which reaches Firebase: the four doors it opens, closed.
vi.mock('@/lib/firebase/config', () => ({ db: {}, auth: { currentUser: null } }));
vi.mock('@/lib/utils/authFetch', () => ({ authenticatedFetch: vi.fn() }));
vi.mock('@/lib/services/dashboardOverviewInvalidation', () => ({ invalidateDashboardOverviewSummary: vi.fn() }));
vi.mock('firebase/firestore', () => ({ doc: vi.fn(), getDoc: vi.fn(), setDoc: vi.fn(), deleteField: vi.fn() }));

import { KeptSalesNote } from '@/components/allocation/KeptSalesNote';

const sale = (assetId: string): PlanDisposal => ({ assetId, estimatedProceedsEur: 1000, status: 'planned' });
const NAMES: Record<string, string> = { a: 'ETF ornitorinco', b: 'Fondo fenicottero' };
const nameOf = (id: string) => NAMES[id] ?? id;

describe('KeptSalesNote', () => {
  // Mutation: `keepAssetIds` ignored (every sale named) → red.
  it('names a kept asset sold at month 1, as a status line', () => {
    render(<KeptSalesNote disposals={[sale('a'), sale('c')]} keepAssetIds={['a']} nameOf={nameOf} />);
    expect(screen.getByRole('status').textContent).toBe('ETF ornitorinco è fra gli strumenti che il Consulente propone di tenere: il piano lo vende al primo mese.');
  });

  it('two kept assets: the plural', () => {
    render(<KeptSalesNote disposals={[sale('a'), sale('b')]} keepAssetIds={['a', 'b']} nameOf={nameOf} />);
    expect(screen.getByRole('status').textContent).toBe('ETF ornitorinco e Fondo fenicottero sono fra gli strumenti che il Consulente propone di tenere: il piano li vende al primo mese.');
  });

  it('renders nothing without kept assets', () => {
    const { container } = render(<KeptSalesNote disposals={[sale('a')]} keepAssetIds={[]} nameOf={nameOf} />);
    expect(container.innerHTML).toBe('');
  });
});
