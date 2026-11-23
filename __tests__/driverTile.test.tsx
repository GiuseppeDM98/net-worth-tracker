/**
 * DriverTile — «altre» printed in three named parts (2026-11-12): the bars' hover and each month's
 * `<title>`, the screen-reader table and the method note. Invented, round figures.
 */

import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';

vi.mock('@/lib/firebase/config', () => ({ db: {} }));
vi.mock('@/lib/utils/authFetch', () => ({ authenticatedFetch: vi.fn() }));
vi.mock('@/lib/services/dashboardOverviewInvalidation', () => ({ invalidateDashboardOverviewSummary: vi.fn() }));
vi.mock('firebase/firestore', () => ({ doc: vi.fn(), getDoc: vi.fn(), setDoc: vi.fn(), deleteField: vi.fn() }));

// A mouse is present BEFORE the first render: `useChartHover` reads `(pointer: fine)` and a phone mounts no hover.
window.matchMedia = (query: string): MediaQueryList =>
  ({ matches: query.includes('pointer: fine'), media: query, onchange: null, addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false }) as MediaQueryList;

import { DriverTile } from '@/components/history/tiles/DriverTile';
import { DRIVER_METHOD_OTHER, type MonthlyDriverRow } from '@/lib/utils/storicoNarrative';
import type { DriverYear } from '@/lib/utils/storicoSummary';

const nbsp = (text: string | null) => (text ?? '').replace(/[\u00a0\u202f]/g, ' ');

const PARTS = { taxes: 0, debtRepaid: 0, pensionContributions: 0, other: 0, otherPension: 0, otherHoldings: 0, otherAccounts: 0, isMarketMeasured: true };

// June: the three parts of «altre» all non-zero; July: only a quantity added by hand.
const MONTHS: MonthlyDriverRow[] = [
  { year: 2026, month: 6, netWorthGrowth: 4150, netSavings: 1000, market: 2000, ...PARTS, other: 1150, otherPension: 150, otherHoldings: 200, otherAccounts: 800 },
  { year: 2026, month: 7, netWorthGrowth: 1200, netSavings: 1000, market: 0, ...PARTS, other: 200, otherHoldings: 200 },
];
const YEAR: DriverYear = { year: '2026', netWorthGrowth: 5350, netSavings: 2000, market: 2000, ...PARTS, other: 1350, otherPension: 150, otherHoldings: 400, otherAccounts: 800, growthPct: 5, latest: { year: 2026, month: 7 }, baseline: { year: 2025, month: 12 } };

function renderTile() {
  return render(
    <DriverTile reading={null} years={[YEAR]} featured={{ row: YEAR, isRunning: true }} total={YEAR} startYear={2026} measuredSince={{ year: 2026, month: 1 }} months={MONTHS} windowMonths={12} />,
  );
}

describe('DriverTile — the three parts of «altre»', () => {
  // D1
  it('should list the three parts in the hover and in each month\'s title, never «altre»', () => {
    const { container } = renderTile();
    const plot = container.querySelector('svg[role="img"]')!.parentElement!;
    fireEvent.pointerMove(plot, { clientX: 0 });
    const tip = nbsp(screen.getByRole('status').textContent);
    expect(tip).toContain('fondo non tracciato +150 €');
    expect(tip).toContain('fuori registro +200 €');
    expect(tip).toContain('saldi dei conti +800 €');
    expect(tip).not.toMatch(/\baltre\b/);
    const titles = [...container.querySelectorAll('svg title')].map((node) => nbsp(node.textContent));
    expect(titles[0]).toContain('fuori registro +200 €');
    expect(titles[0]).not.toMatch(/\baltre\b/);
    // July holds only the quantity: the two zero parts have no entry.
    expect(titles[1]).toContain('fuori registro +200 €');
    expect(titles[1]).not.toContain('fondo non tracciato');
    expect(titles[1]).not.toContain('saldi dei conti');
  });

  // D2
  it('should give the table three columns where it had «Altre variazioni»', () => {
    renderTile();
    const headers = screen.getAllByRole('columnheader').map((cell) => cell.textContent);
    expect(headers).toEqual([
      'Mese',
      'Risparmio',
      'Mercato',
      'Tasse sulle vendite',
      'Mutuo rimborsato',
      'Versamenti al fondo pensione',
      'Fondo pensione non tracciato',
      'Quantità fuori dal registro',
      'Saldi dei conti',
    ]);
    const june = screen.getAllByRole('row').find((tr) => tr.textContent?.startsWith('giugno 2026'))!;
    expect(nbsp(june.textContent)).toContain('+150 €+200 €+800 €');
  });

  // D3
  it('should explain each part in the method note, and no longer «Altre variazioni»', () => {
    renderTile();
    fireEvent.click(screen.getByRole('button', { name: 'Come si calcola: Driver della crescita' }));
    const note = within(screen.getByRole('dialog'));
    for (const entry of DRIVER_METHOD_OTHER) {
      expect(note.getByText(entry.term)).toBeTruthy();
      expect(nbsp(note.getByText(entry.term).parentElement!.textContent)).toContain(entry.text);
    }
    expect(screen.queryByText('Altre variazioni')).toBeNull();
  });
});
