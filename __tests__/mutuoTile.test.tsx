/**
 * `MutuoTile` (components/assets/tiles/MutuoTile.tsx): with the year's settled instalments the 96px
 * ring of interest and principal (The Ring Rule, 2026-11-12), «pagati» in its hole, and the two KPIs'
 * labels led by their arc's swatch; without them neither ring nor swatch. Figures invented and round.
 * Seen red on 2026-11-15 with the swatches passed whatever the ring.
 */

import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MutuoTile } from '@/components/assets/tiles/MutuoTile';
import { MORTGAGE_RING_COLORS, summarizeMortgage } from '@/lib/utils/mortgageSummary';

// A portalled primitive reads the costume scope from ColorThemeContext, whose module imports AuthContext → Firebase.
vi.mock('@/lib/firebase/config', () => ({ auth: { currentUser: null }, db: {} }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: null }) }));
vi.mock('@/lib/services/userPreferencesService', () => ({ getUserPreferences: vi.fn(async () => ({})), setUserPreferences: vi.fn() }));

const NOW = new Date(2026, 9, 5, 12);
const LOAN = { id: 'prestito', name: 'Mutuo Casa', debt: 50_000, debtInterestRate: 3, financedAssetName: 'Casa' };

const swatchesOf = (container: HTMLElement) =>
  Array.from(container.querySelectorAll<HTMLElement>('p [aria-hidden="true"].h-2.w-2')).map((swatch) => swatch.style.background);

describe('MutuoTile', () => {
  it('M2: the ring «4200 €» «pagati» and the two KPIs’ swatches', () => {
    const summary = summarizeMortgage(LOAN, [{ id: 'a', date: new Date(2026, 8, 28, 12), amount: -4200, debtPrincipalRepaid: 3000, debtInterestPaid: 1200 }], NOW);
    const { container } = render(<MutuoTile summary={summary} showPropertyName={false} />);
    const ring = container.querySelector('[data-ring]');
    expect(ring).not.toBeNull();
    expect(ring?.querySelector('[data-ring-center="hole"]')?.textContent).toMatch(/^4\.?200[\s ]*€$/);
    expect(ring?.textContent).toContain('pagati');
    expect(swatchesOf(container)).toEqual([MORTGAGE_RING_COLORS.interest, MORTGAGE_RING_COLORS.principal]);
  });

  // The tour of 2026-11-15: at 768 the grid beside the ring is ~584px and four six-figure KPIs (~152px each)
  // touched — four across only from 680px of the GRID's width (4 × 152 + 3 × 24). Seen red with 560.
  it('M2: beside the ring the four KPIs go across only from 680px of the grid', () => {
    const summary = summarizeMortgage(LOAN, [{ id: 'a', date: new Date(2026, 8, 28, 12), amount: -4200, debtPrincipalRepaid: 3000, debtInterestPaid: 1200 }], NOW);
    const { container } = render(<MutuoTile summary={summary} showPropertyName={false} />);
    const grid = container.querySelector('.grid');
    expect(grid?.className).toContain('@[680px]:grid-cols-4');
    expect(grid?.className).not.toContain('@[560px]:grid-cols-4');
  });

  it('M2: without a settled instalment in the year, neither ring nor swatch', () => {
    const summary = summarizeMortgage(LOAN, [{ id: 'b', date: new Date(2026, 9, 28, 12), amount: -500, balancePending: true }], NOW);
    const { container } = render(<MutuoTile summary={summary} showPropertyName={false} />);
    expect(container.querySelector('[data-ring]')).toBeNull();
    expect(swatchesOf(container)).toEqual([]);
    // Without the ring the grid is the tile's whole width: today's 560px.
    expect(container.querySelector('.grid')?.className).toContain('@[560px]:grid-cols-4');
  });
});
