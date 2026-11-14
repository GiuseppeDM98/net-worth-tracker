/**
 * «Risparmio nel tempo»'s bars (components/cashflow/tiles/RisparmioTile.tsx): a month below the
 * savings floor (owner, 2026-11-12) is a bar from 0 down to the floor, the floor on the plot's
 * bottom edge, and never draws outside the 120-unit viewBox; its `<title>`, the SVG's
 * `aria-label` and the hover tip read the same words (`describeSavingsBar`).
 */

import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/firebase/config', () => ({ db: {} }));
vi.mock('@/lib/utils/authFetch', () => ({ authenticatedFetch: vi.fn() }));
vi.mock('@/lib/services/dashboardOverviewInvalidation', () => ({ invalidateDashboardOverviewSummary: vi.fn() }));
vi.mock('firebase/firestore', () => ({ doc: vi.fn(), getDoc: vi.fn(), setDoc: vi.fn(), deleteField: vi.fn() }));

import { fireEvent, render, screen } from '@testing-library/react';
import { RisparmioTile } from '@/components/cashflow/tiles/RisparmioTile';
import { summarizeSavingsHistory, type MonthFlow } from '@/lib/utils/tracciamentoSummary';
import { readSavings } from '@/lib/utils/savingsRate';

const NOW = new Date(2027, 0, 20, 12);
const LABELS = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'];

function month(n: number, income: number, expenses: number): MonthFlow {
  const reading = readSavings(income, expenses);
  return {
    key: `2026-${String(n).padStart(2, '0')}`,
    year: 2026,
    month: n,
    label: LABELS[n - 1],
    income,
    expenses,
    net: income - expenses,
    savingsRate: reading.kind === 'rate' ? reading.rate : null,
    reading,
    scheduled: false,
  };
}

// January 2026 had 3 € of income and 500 € of spending; the eleven other months saved 20%.
const MONTHS = [month(1, 3, 500), ...Array.from({ length: 11 }, (_, i) => month(i + 2, 1000, 800))];

function renderTile() {
  window.matchMedia = ((query: string) => ({
    matches: query === '(pointer: fine)',
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
  return render(
    <RisparmioTile history={summarizeSavingsHistory(MONTHS, NOW)} aside={[{ text: 'Ultimi 12 mesi' }]} reading={null} footer={null} highlightKey={null} />,
  );
}

describe('RisparmioTile — the floor bar', () => {
  it('draws every bar inside the plot, the floor month down to the bottom edge (T1)', () => {
    const { container } = renderTile();
    const bars = [...container.querySelectorAll('svg g rect')];
    expect(bars).toHaveLength(12);
    for (const bar of bars) {
      const y = Number(bar.getAttribute('y'));
      const height = Number(bar.getAttribute('height'));
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y + height).toBeLessThanOrEqual(120 + 1e-9);
    }
    const floor = bars[0];
    expect(Number(floor.getAttribute('y')) + Number(floor.getAttribute('height'))).toBeCloseTo(120, 9);
    expect(floor.getAttribute('fill')).toBe('var(--destructive)');
    expect(container.querySelector('svg g title')?.textContent?.replace(/[\u00A0\u202F]/g, ' ')).toBe('Gen: spese oltre le entrate, −497 €');
    expect(container.querySelector('svg')?.getAttribute('aria-label')?.replace(/[\u00A0\u202F]/g, ' ')).toContain('Gen: spese oltre le entrate, −497 €; Feb: 20%');
  });

  it('reads the floor month in the hover tip with the same words', () => {
    const { container } = renderTile();
    const plot = container.querySelector('svg')!.parentElement!;
    fireEvent.pointerMove(plot, { clientX: 0 });
    expect(screen.getByRole('status').textContent?.replace(/[\u00A0\u202F]/g, ' ')).toContain('Gen: spese oltre le entrate, −497 €');
  });
});
