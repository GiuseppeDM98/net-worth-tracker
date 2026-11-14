/**
 * The Hall of Fame's savings records (RecordRows and the Dettaglio's table): a savings rate keeps
 * its minus and takes no plus — it is a proportion of the income, not a gain (owner, 2026-11-12)
 * — and below the floor, or without income, no percentage is printed (`meaningfulSavingsRate`).
 */

import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/firebase/config', () => ({ db: {} }));
vi.mock('@/lib/utils/authFetch', () => ({ authenticatedFetch: vi.fn() }));
vi.mock('@/lib/services/dashboardOverviewInvalidation', () => ({ invalidateDashboardOverviewSummary: vi.fn() }));
vi.mock('firebase/firestore', () => ({ doc: vi.fn(), getDoc: vi.fn(), setDoc: vi.fn(), deleteField: vi.fn() }));

import { fireEvent, render, screen, within } from '@testing-library/react';
import { RecordRows } from '@/components/hall-of-fame/RecordRows';
import { HallOfFameDettaglio } from '@/components/hall-of-fame/HallOfFameDettaglio';
import { getBoard, summarizeHallOfFame } from '@/lib/utils/hallOfFameSummary';
import type { HallOfFameData, MonthlyRecord } from '@/types/hall-of-fame';

const TODAY = { year: 2026, month: 8 };
const flat = (text: string | null | undefined) => (text ?? '').replace(/[  ]/g, ' ').replace(/\s+/g, ' ').trim();

function savingsMonth(month: number, totalIncome: number, totalExpenses: number): MonthlyRecord {
  return { year: 2026, month, monthYear: `${String(month).padStart(2, '0')}/2026`, netWorthDiff: 0, previousNetWorth: 0, totalIncome, totalExpenses };
}

// Marzo 2026: 2000 € in, 2600 € out (−30%); aprile 2026: 3 € in, 500 € out (below the floor).
const DATA: HallOfFameData = {
  userId: 'u1',
  notes: [],
  bestMonthsByNetWorthGrowth: [],
  bestMonthsByIncome: [],
  worstMonthsByNetWorthDecline: [],
  worstMonthsByExpenses: [],
  bestMonthsBySavings: [savingsMonth(3, 2000, 2600), savingsMonth(4, 3, 500)],
  bestYearsByNetWorthGrowth: [],
  bestYearsByIncome: [],
  worstYearsByNetWorthDecline: [],
  worstYearsByExpenses: [],
  bestYearsBySavings: [],
} as unknown as HallOfFameData;

const SUMMARY = summarizeHallOfFame(DATA, TODAY);

describe('RecordRows — the savings rate keeps its minus (HF1)', () => {
  it('prints «−600 €» with «−30,0%», and no percentage below the floor', () => {
    const rows = getBoard(SUMMARY, 'monthly', 'savings')!.rows;
    render(<RecordRows rows={rows} category="savings" ariaLabel="Mesi migliori per risparmio" />);
    const items = screen.getAllByRole('listitem').map((item) => flat(item.textContent));
    const march = items.find((text) => text.includes('mar 2026'))!;
    const april = items.find((text) => text.includes('apr 2026'))!;
    expect(march).toContain('−600 €');
    expect(march).toContain('−30,0%');
    expect(april).toContain('−497 €');
    expect(april).not.toContain('%');
  });
});

describe('HallOfFameDettaglio — the savings table', () => {
  it('prints «−30,0%» for the same month', () => {
    render(<HallOfFameDettaglio summary={SUMMARY} notes={[]} onNoteClick={() => {}} onAddNote={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /Dettaglio/ }));
    fireEvent.click(screen.getByRole('radio', { name: 'Risparmio' }));
    const march = screen.getAllByRole('row').find((row) => flat(row.textContent).includes('marzo 2026'))!;
    const cells = within(march).getAllByRole('cell').map((cell) => flat(cell.textContent));
    expect(cells).toContain('−30,0%');
    const april = screen.getAllByRole('row').find((row) => flat(row.textContent).includes('aprile 2026'))!;
    expect(within(april).getAllByRole('cell').map((cell) => flat(cell.textContent))).toContain('—');
  });
});
