import 'server-only';
import { z } from 'zod';
import type { Expense } from '@/types/expenses';
import type { BudgetItem } from '@/types/budget';
import { roundToCents } from '@/lib/utils/cents';
import { getItalyDateIso } from '@/lib/utils/dateHelpers';
import {
  budgetItemLabel,
  getActualForItem,
  getMonthActualForItem,
  getMonthlyActualsForItem,
  getMonthlyTotalExpenses,
} from '@/lib/utils/budgetUtils';
import { TYPE_LABELS } from '@/lib/utils/assistantExpenseQueries';
import { AssistantToolError, defineAssistantTool, UNREADABLE, type AssistantToolContext } from './define';

/**
 * The Budget's state for the model, measured by the Budget page's own functions
 * (lib/utils/budgetUtils.ts) — so the gate `countsTowardBudget` is theirs, and a row «Fuori dal
 * budget» stays out. Asked for a MONTH, an annual line is measured as the page measures it: its
 * yearly ceiling against the year's spending up to the end of that month, never the ceiling ÷ 12.
 * Asked for a YEAR, a monthly line carries both the ceiling × 12 and the ceiling up to the current
 * month included (owner, 2026-11-23). The rows in calendar count, as on the page, and their part is
 * declared apart (`scheduled`).
 */

export interface BudgetStateLine {
  label: string;
  /** A ceiling to stay under, or an income target to reach. */
  kind: 'expense' | 'income';
  /** How the line is set in Budget. */
  period: 'monthly' | 'annual' | 'overall';
  /** What `spent` covers: the month asked, the year up to the end of the month asked, the whole year. */
  measuredOver: 'month' | 'yearToMonth' | 'year';
  ceiling: number;
  /** A year asked, a monthly or overall line: the ceiling × the months up to the current one included (12 for a past year, 0 for a future one). */
  ceilingToDate?: number;
  /** Rows in calendar included; for an income line, what was received. */
  spent: number;
  /** The part of `spent` dated after today. */
  scheduled: number;
  /** ceiling − spent. */
  remaining: number;
}

export type BudgetStateResult =
  | { configured: false }
  | { configured: true; year: number; month?: number; today: string; lines: BudgetStateLine[] };

/** The months of `year` up to the current one included: 12 for a past year, 0 for a future one. */
function monthsToDate(year: number, todayIso: string): number {
  const [currentYear, currentMonth] = todayIso.split('-').map(Number);
  if (year < currentYear) return 12;
  if (year > currentYear) return 0;
  return currentMonth;
}

function line(
  base: Pick<BudgetStateLine, 'label' | 'kind' | 'period' | 'measuredOver' | 'ceiling'> & { ceilingToDate?: number },
  measure: (rows: Expense[]) => number,
  all: Expense[],
  ahead: Expense[],
): BudgetStateLine {
  const spent = roundToCents(measure(all));
  const ceiling = roundToCents(base.ceiling);
  return {
    ...base,
    ceiling,
    ...(base.ceilingToDate !== undefined ? { ceilingToDate: roundToCents(base.ceilingToDate) } : {}),
    spent,
    scheduled: roundToCents(measure(ahead)),
    remaining: roundToCents(ceiling - spent),
  };
}

function labelOf(item: BudgetItem): string {
  return item.scope === 'type' && item.expenseType ? TYPE_LABELS[item.expenseType] : budgetItemLabel(item);
}

export function computeBudgetState(input: { year: number; month?: number }, context: AssistantToolContext): BudgetStateResult {
  const config = context.budgetConfig;
  if (config === UNREADABLE) throw new AssistantToolError('Non riesco a leggere il budget adesso.');
  if (!config || (config.items.length === 0 && !config.overallMonthlyAmount)) return { configured: false };

  const { year, month } = input;
  const all = context.expenses as Expense[];
  const ahead = all.filter((row) => getItalyDateIso(row.date) > context.todayIso);
  const toDate = monthsToDate(year, context.todayIso);
  const lines: BudgetStateLine[] = [];

  if (config.overallMonthlyAmount) {
    const amount = config.overallMonthlyAmount;
    const base = { label: 'Totale', kind: 'expense' as const, period: 'overall' as const };
    lines.push(
      month !== undefined
        ? line({ ...base, measuredOver: 'month', ceiling: amount }, (rows) => getMonthlyTotalExpenses(rows, year, month), all, ahead)
        : line(
            { ...base, measuredOver: 'year', ceiling: amount * 12, ceilingToDate: amount * toDate },
            (rows) => Array.from({ length: 12 }, (_, index) => getMonthlyTotalExpenses(rows, year, index + 1)).reduce((sum, value) => sum + value, 0),
            all,
            ahead,
          ),
    );
  }

  for (const item of config.items) {
    const base = { label: labelOf(item), kind: item.kind, period: item.period };
    if (month !== undefined) {
      lines.push(
        item.period === 'monthly'
          ? line({ ...base, measuredOver: 'month', ceiling: item.amount }, (rows) => getMonthActualForItem(item, rows, year, month), all, ahead)
          : line(
              { ...base, measuredOver: 'yearToMonth', ceiling: item.amount },
              (rows) => getMonthlyActualsForItem(item, rows, year).slice(0, month).reduce((sum, value) => sum + value, 0),
              all,
              ahead,
            ),
      );
    } else {
      lines.push(
        item.period === 'monthly'
          ? line({ ...base, measuredOver: 'year', ceiling: item.amount * 12, ceilingToDate: item.amount * toDate }, (rows) => getActualForItem(item, rows, year), all, ahead)
          : line({ ...base, measuredOver: 'year', ceiling: item.amount }, (rows) => getActualForItem(item, rows, year), all, ahead),
      );
    }
  }

  return { configured: true, year, ...(month !== undefined ? { month } : {}), today: context.todayIso, lines };
}

export const budgetState = defineAssistantTool({
  name: 'budget_stato',
  description:
    "Lo stato del budget: per ogni voce il tetto, lo speso e il residuo nell'anno o nel mese chiesto; per un anno anche il tetto maturato fino al mese in corso. Una voce di entrata è un obiettivo da raggiungere, non un tetto. Conta solo le righe che il Budget conta, comprese quelle già in calendario.",
  input: z.strictObject({
    year: z.number().int().min(2000).max(2100).describe("L'anno chiesto, per esempio 2026."),
    month: z.number().int().min(1).max(12).optional().describe("Il mese chiesto, da 1 a 12; senza, l'anno intero."),
  }),
  run: (input, context) => computeBudgetState(input, context),
});
