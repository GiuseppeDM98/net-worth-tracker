/**
 * `CashflowKpiTrio` (Tracciamento's hero and Analisi's «Periodo»): the caption under «Risparmio»
 * prints the savings rate only when it is a rate (`meaningfulSavingsRate`, owner 2026-11-12) —
 * «—» with no income or a deficit beyond the floor — and a negative rate with the typographic
 * minus (The Comma Rule). The coverage ratio beside it does not change.
 */

import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/firebase/config', () => ({ db: {} }));
vi.mock('@/lib/utils/authFetch', () => ({ authenticatedFetch: vi.fn() }));
vi.mock('@/lib/services/dashboardOverviewInvalidation', () => ({ invalidateDashboardOverviewSummary: vi.fn() }));
vi.mock('firebase/firestore', () => ({ doc: vi.fn(), getDoc: vi.fn(), setDoc: vi.fn(), deleteField: vi.fn() }));

import { render } from '@testing-library/react';
import { CashflowKpiTrio } from '@/components/cashflow/tiles/CashflowKpiTrio';
import { summarizePeriodCashflow } from '@/lib/utils/tracciamentoSummary';
import type { Expense } from '@/types/expenses';

const rows = (income: number, spending: number) =>
  [
    ...(income ? [{ type: 'income', amount: income }] : []),
    ...(spending ? [{ type: 'variable', amount: -spending }] : []),
  ] as Expense[];

/** The 11px line under «Risparmio»: the rate, then the coverage. */
function captionOf(income: number, spending: number): string {
  const { container } = render(
    <CashflowKpiTrio totals={summarizePeriodCashflow(rows(income, spending))} incomeDelta={null} expensesDelta={null} previousLabel={null} />,
  );
  const lines = [...container.querySelectorAll('p.text-\\[11px\\]')];
  return (lines[lines.length - 1]?.textContent ?? '').replace(/\s+/g, ' ').trim();
}

describe('CashflowKpiTrio — the savings caption', () => {
  it('prints «—» and no coverage without income (①)', () => {
    expect(captionOf(0, 500)).toBe('—');
  });

  it('prints «—» below the floor, the coverage unchanged (②)', () => {
    expect(captionOf(3, 500)).toBe('— · 0,01×');
  });

  it('prints a true −30% with the typographic minus (③)', () => {
    expect(captionOf(2000, 2600)).toBe('−30,0% · 0,77×');
  });
});
