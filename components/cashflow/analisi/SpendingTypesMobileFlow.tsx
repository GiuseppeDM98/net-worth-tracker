'use client';

/**
 * Flusso's type view in a cell narrower than 608px (since 2026-10-16) — the only view when the
 * 50/30/20 roles are off: one bar of the SPENDING split by type, then each type's categories as
 * ranked rows, then what was put aside. Drawn by FlowShareMobile.
 *
 * One base on the screen: the reading above prints the types as shares of the spending («necessarie
 * 53%, non necessarie 37%, debiti 10%»), so the bar is the spending and its legend prints those very
 * figures (`buildTypeFlowBreakdown` takes them from the reading's own FlowSummary). Savings are a
 * share of the income in that sentence, so they stay out of the bar: a closing «Risparmio» block
 * whose note is analisiNarrative's, as are the caption and the empty line. A deficit is the red
 * «entrate» line inside the bar, where the income ends (clamped by the pure layer).
 *
 * Colours: the slots of the ONE type colour map (`EXPENSE_TYPE_COLOR_VAR`) and income's series slot
 * for what is kept (`CASHFLOW_SERIES_COLOR.income`) — never the desktop Sankey's hex.
 */

import { EXPENSE_TYPE_LABELS, type ExpenseType } from '@/types/expenses';
import type { TypeFlowBreakdown } from '@/lib/utils/analisiSummary';
import type { ScheduledSlice } from '@/lib/utils/tracciamentoSummary';
import { CASHFLOW_SERIES_COLOR, EXPENSE_TYPE_COLOR_VAR } from '@/lib/constants/expenseTypeColors';
import { describeFlowSurplus, describeShareCompact, describeTypeFlowBar } from '@/lib/utils/analisiNarrative';
import { FlowShareMobile, type FlowShareGroup } from '@/components/cashflow/analisi/FlowShareMobile';

interface Props {
  breakdown: TypeFlowBreakdown;
  /** The period's not-yet-happened slice (AnalisiTab's `scheduled`, the verdict's own), for the surplus note. */
  scheduled: ScheduledSlice;
  /** How far that calendar reaches (`describeAnalisiScheduledHorizon`). */
  horizon: string | null;
  onEntityClick: (target: { expenseType: ExpenseType; categoryKey: string }) => void;
  /** The strip's «Risparmio» cell prints the surplus: the closing block hides (The Lifted-Figure Rule). */
  savingsLifted?: boolean;
  /** The figures the first screen prints (`collectPrintedFigures`): the caption drops an amount among them (2026-10-14). */
  printedFigures?: ReadonlySet<string>;
}

export function SpendingTypesMobileFlow({ breakdown, scheduled, horizon, onEntityClick, savingsLifted = false, printedFigures }: Props) {
  const groups: FlowShareGroup[] = breakdown.blocks.map((block) => ({
    key: block.type,
    // The types' full names, as the drill breadcrumb on this same tile prints them.
    label: EXPENSE_TYPE_LABELS[block.type],
    color: EXPENSE_TYPE_COLOR_VAR[block.type],
    total: block.amount,
    categories: block.categories.map((category) => ({ ...category, expenseType: block.type })),
  }));
  if (breakdown.surplus > 0) {
    groups.push({
      key: 'savings',
      label: 'Risparmio',
      color: CASHFLOW_SERIES_COLOR.income,
      total: breakdown.surplus,
      categories: [],
      note: describeFlowSurplus({ surplus: breakdown.surplus, afterRows: false, scheduled, horizon }),
      ...(savingsLifted ? { lifted: 'group' as const } : {}),
    });
  }

  return (
    <FlowShareMobile
      absence={breakdown.absence}
      bar={{
        segments: breakdown.blocks.map((block) => ({
          key: block.type,
          label: block.label,
          percentage: block.printedPercentage,
          printed: describeShareCompact(block.printedPercentage),
          color: EXPENSE_TYPE_COLOR_VAR[block.type],
        })),
        ariaLabel: 'Quote delle spese per tipo',
        incomeEdge: breakdown.incomeEdge,
        caption: describeTypeFlowBar(breakdown, printedFigures),
      }}
      groups={groups}
      onEntityClick={onEntityClick}
    />
  );
}
