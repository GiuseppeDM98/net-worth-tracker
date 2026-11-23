/**
 * The Panoramica's Cashflow tile (the WHOLE month, calendar included): the caption under
 * «Risparmio» prints the savings rate only when it is a rate (owner, 2026-11-12) — «—» with no
 * income or a deficit beyond the floor, the coverage unchanged — and a negative rate with the
 * typographic minus; the reading says «Speso più di quanto è entrato.» for any deficit.
 */

import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/firebase/config', () => ({ db: {} }));
vi.mock('@/lib/utils/authFetch', () => ({ authenticatedFetch: vi.fn() }));
vi.mock('@/lib/services/dashboardOverviewInvalidation', () => ({ invalidateDashboardOverviewSummary: vi.fn() }));
vi.mock('firebase/firestore', () => ({ doc: vi.fn(), getDoc: vi.fn(), setDoc: vi.fn(), deleteField: vi.fn() }));

import { render } from '@testing-library/react';
import { CashflowTile } from '@/components/dashboard/overview/CashflowTile';
import { monthCoverageRatio, monthSavingsRate } from '@/lib/utils/overviewSummary';
import type { DashboardOverviewExpenseStats } from '@/types/dashboardOverview';

function statsOf(income: number, expenses: number): DashboardOverviewExpenseStats {
  return {
    currentMonth: { income, expenses, net: income - expenses, expensesScheduled: 0, incomeScheduled: 0 },
    previousMonth: { income: 2000, expenses: 1500, net: 500 },
    delta: { income: 0, expenses: 0, net: 0 },
    topExpenseCategories: [],
    topIncomeCategories: [],
  } as DashboardOverviewExpenseStats;
}

function renderTile(income: number, expenses: number) {
  const stats = statsOf(income, expenses);
  const { container } = render(
    <CashflowTile
      expenseStats={stats}
      month={8}
      dayOfMonth={10}
      daysInMonth={31}
      savingsRate={monthSavingsRate(stats)}
      coverageRatio={monthCoverageRatio(stats)}
    />,
  );
  const text = (container.textContent ?? '').replace(/\s+/g, ' ');
  const caption = [...container.querySelectorAll('p.text-\\[11px\\]')].find((p) => /×|—|%/.test(p.textContent ?? '') && !/vs|come/.test(p.textContent ?? ''));
  return { text, caption: (caption?.textContent ?? '').replace(/\s+/g, ' ').trim() };
}

describe('CashflowTile — the savings caption and the reading', () => {
  it('prints «—» with the coverage at zero without income (①)', () => {
    expect(renderTile(0, 500).caption).toBe('— · 0,00×');
  });

  it('prints «—» below the floor and still says the month spent more than it earned (②, K3)', () => {
    const tile = renderTile(3, 500);
    expect(tile.caption).toBe('— · 0,01×');
    expect(tile.text).toContain('Speso più di quanto è entrato.');
  });

  it('prints a true −30% with the typographic minus (③)', () => {
    const tile = renderTile(2000, 2600);
    expect(tile.caption).toBe('−30,0% · 0,77×');
    expect(tile.text).toContain('Speso più di quanto è entrato.');
  });
});
