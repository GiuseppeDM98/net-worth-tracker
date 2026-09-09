'use client';

import { useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { Expense, ExpenseType } from '@/types/expenses';
import type { Narrative } from '@/lib/utils/narrative';
import { buildCategoryComparison, computeTotalsPacing, resolveComparisonScope, type ComparisonMonthScope } from '@/lib/utils/comparisonDeltas';
import { describeAnalisiSubject, describeComparison, describeComparisonSummary } from '@/lib/utils/analisiNarrative';
import type { AnalisiPeriod, MonthRef } from '@/lib/utils/analisiSummary';
import { getItalyMonth, getItalyYear, toDate } from '@/lib/utils/dateHelpers';
import { cn } from '@/lib/utils';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { TILE_EYEBROW_CLASS } from '@/components/ui/tile';
import { NarrativeText } from '@/components/ui/narrative-text';
import { ConfrontoAnnualeSection } from '@/components/cashflow/ConfrontoAnnualeSection';

interface ConfrontoDisclosureProps {
  allExpenses: Expense[];
  period: AnalisiPeriod;
  today: MonthRef;
  historyStartYear: number;
  /** Years with data at or after the floor, newest first. */
  availableDataYears: number[];
  onCategoryFocus: (target: { expenseType: ExpenseType; categoryKey: string }) => void;
}

/** Resolves an expense's Italy-calendar bucket for the pure comparison layer. */
const monthOf = (expense: Expense): MonthRef => {
  const date = toDate(expense.date);
  return { year: getItalyYear(date), month: getItalyMonth(date) };
};

/**
 * «Confronto annuale», below the grid behind a disclosure: the row names the two years, the
 * window and the signed difference; open, it is one tile in the grid's cadence. The comparison
 * year is the user's pick here (the Periodo tile always paces against the year before), so
 * this component owns that choice and computes the pacing and the delta rows ONCE — the row,
 * the reading and the list cannot disagree.
 */
export function ConfrontoDisclosure({ allExpenses, period, today, historyStartYear, availableDataYears, onCategoryFocus }: ConfrontoDisclosureProps) {
  const [open, setOpen] = useState(false);
  const [comparisonYearChoice, setComparisonYearChoice] = useState<number | null>(null);

  const currentYear = period.mode === 'history' ? null : period.year;

  // availableDataYears is already floored upstream; only "before the year under review" is left.
  const comparisonOptions = useMemo(() => (currentYear === null ? [] : availableDataYears.filter((year) => year < currentYear)), [availableDataYears, currentYear]);

  // The pick survives only while it is a valid option (a period switch can invalidate it);
  // otherwise the natural baseline (the year before), then the newest year available.
  const comparisonYear = useMemo(() => {
    if (comparisonYearChoice !== null && comparisonOptions.includes(comparisonYearChoice)) return comparisonYearChoice;
    if (currentYear !== null && comparisonOptions.includes(currentYear - 1)) return currentYear - 1;
    return comparisonOptions[0] ?? null;
  }, [comparisonYearChoice, comparisonOptions, currentYear]);

  const scope = useMemo((): ComparisonMonthScope | null => resolveComparisonScope(period.mode, period.month, today.month), [period.mode, period.month, today.month]);

  const pacing = useMemo(() => {
    if (currentYear === null || comparisonYear === null || scope === null) return null;
    return computeTotalsPacing(allExpenses, currentYear, comparisonYear, scope, monthOf);
  }, [allExpenses, currentYear, comparisonYear, scope]);

  const deltaRows = useMemo(() => {
    if (currentYear === null || comparisonYear === null || scope === null) return [];
    return buildCategoryComparison(allExpenses, currentYear, comparisonYear, scope, monthOf);
  }, [allExpenses, currentYear, comparisonYear, scope]);

  const subject = describeAnalisiSubject(period, today, historyStartYear);
  const reading: Narrative | null = pacing && scope && comparisonYear !== null ? describeComparison({ subject, scope, comparisonYear, expenses: pacing.expenses, rows: deltaRows }) : null;

  const yearsTracked = availableDataYears.length;
  const summary: Narrative =
    pacing && currentYear !== null
      ? describeComparisonSummary(currentYear, pacing)
      : period.mode === 'history'
        ? [{ text: 'dal ' }, { text: String(historyStartYear), mono: true }, { text: ` · ${yearsTracked} ${yearsTracked === 1 ? 'anno' : 'anni'}` }]
        : scope === null
          ? [{ text: 'il mese selezionato non è ancora iniziato' }]
          : [{ text: 'nessun anno precedente da confrontare' }];

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex w-full items-center justify-between gap-3 border-t border-border/40 py-3 text-left" aria-label="Confronto annuale">
        <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className={TILE_EYEBROW_CLASS}>Confronto annuale</span>
          <NarrativeText segments={summary} className="text-[13px] text-muted-foreground" figureClassName="font-medium" />
        </span>
        <ChevronDown className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} aria-hidden="true" />
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-1">
        <ConfrontoAnnualeSection
          allExpenses={allExpenses}
          periodMode={period.mode}
          currentYear={currentYear}
          comparisonYear={comparisonYear}
          comparisonOptions={comparisonOptions}
          onComparisonYearChange={setComparisonYearChoice}
          scope={scope}
          pacing={pacing}
          deltaRows={deltaRows}
          historyStartYear={historyStartYear}
          reading={reading}
          onCategoryFocus={onCategoryFocus}
        />
      </CollapsibleContent>
    </Collapsible>
  );
}
