/**
 * Year-over-year comparison of cashflow totals and per-category deltas.
 *
 * WHY THIS EXISTS
 * The Analisi KPI pacing row and the Confronto section both answer "how does this
 * year compare to the previous one, so far?". Each surface used to window its own
 * months inline, so the "same months" rule — a YTD comparison must cut BOTH years
 * at the same month, or the baseline silently includes months the current year has
 * not lived yet — was one refactor away from diverging between them. Both surfaces
 * now read the same windowing, the same magnitudes and the same baseline caption
 * from here.
 *
 * Grouping follows the app-wide rule (lib/utils/expenseGrouping.ts): key by id,
 * label by name, qualify with the type only where two categories collide on the
 * rendered surface. Classification is ALWAYS by `type`, never by amount sign, and
 * spending is measured gross by magnitude — the same rules as cashflowComposition.
 *
 * The month resolver is injected rather than imported from dateHelpers so this
 * module stays pure and timezone-agnostic: production callers pass the Italy
 * timezone resolver, tests read the fixture date directly.
 */

import { Expense, ExpenseType, EXPENSE_TYPE_LABELS } from '@/types/expenses';
import { getCategoryKey, getCategoryName, resolveDisplayLabels } from '@/lib/utils/expenseGrouping';
import { MONTH_NAMES } from '@/lib/constants/months';

/**
 * Which months of the two years are compared. Months are 1-12.
 * - sameMonths: YTD pacing — months 1..upToMonth in BOTH years.
 * - singleMonth: one month against the same month of the comparison year.
 *   `inProgress` marks the running calendar month: the figures still compare a
 *   partial month against a complete one — a fact the module cannot detect on
 *   its own — so the baseline caption declares it.
 * - fullYear: all 12 months on both sides.
 */
export type ComparisonMonthScope =
  | { kind: 'sameMonths'; upToMonth: number }
  | { kind: 'singleMonth'; month: number; inProgress?: boolean }
  | { kind: 'fullYear' };

/**
 * Map the Analisi page's period state to the comparison scope — THE single source
 * of the same-months rule, shared by the KPI pacing row and the Confronto section
 * (the two used to derive it separately, one refactor away from diverging).
 *
 * Returns null when no honest comparison exists: history mode (no single year
 * under review) and a selected month that has not started yet (comparing a month
 * of zeros against a full baseline would print "−100%" for a month that simply
 * has not happened).
 */
export function resolveComparisonScope(
  periodMode: 'ytd' | 'current' | 'year' | 'history',
  selectedMonth: number | null,
  todayMonth: number,
): ComparisonMonthScope | null {
  if (periodMode === 'history') return null;
  // Both windows on the running year compare the same way: only the months already lived can
  // be matched against the previous year, whatever the period itself spans.
  const isRunningYear = periodMode === 'current' || periodMode === 'ytd';
  if (selectedMonth !== null) {
    if (isRunningYear && selectedMonth > todayMonth) return null;
    return {
      kind: 'singleMonth',
      month: selectedMonth,
      inProgress: isRunningYear && selectedMonth === todayMonth,
    };
  }
  return isRunningYear ? { kind: 'sameMonths', upToMonth: todayMonth } : { kind: 'fullYear' };
}

export type CategoryComparisonStatus = 'ongoing' | 'new' | 'gone';

/** One spending category compared across the two windows. */
export interface CategoryDeltaRow {
  /** Identity — `${type}:${categoryKey}`, the same scheme as buildExpenseComposition. */
  key: string;
  expenseType: ExpenseType;
  categoryKey: string;
  /** Display label, type-qualified only where two categories collide on the name. */
  label: string;
  /** Magnitude in the current-year window. */
  current: number;
  /** Magnitude in the comparison-year window. */
  previous: number;
  /** current − previous: for spending, positive means spending grew. */
  delta: number;
  /** Delta as a share of the baseline, null when previous === 0. */
  deltaPercent: number | null;
  /** 'new' = previous 0 & current > 0; 'gone' = current 0 & previous > 0. */
  status: CategoryComparisonStatus;
}

/** Spending is measured gross: a refund on a spending type counts toward the magnitude, it does not net off. */
const magnitude = (expense: Expense): number => Math.abs(expense.amount);

const isSpending = (expense: Expense): boolean => expense.type !== 'income' && expense.type !== 'transfer';

function isMonthInScope(month: number, scope: ComparisonMonthScope): boolean {
  switch (scope.kind) {
    case 'sameMonths':
      return month <= scope.upToMonth;
    case 'singleMonth':
      return month === scope.month;
    case 'fullYear':
      return true;
  }
}

/** Delta as a share of the baseline; null when there is no baseline to divide by. */
const percentOf = (delta: number, previous: number): number | null =>
  previous === 0 ? null : (delta / previous) * 100;

interface ComparisonAccumulator {
  expenseType: ExpenseType;
  categoryKey: string;
  name: string;
  current: number;
  previous: number;
}

/**
 * Compare spending categories between two years over one month scope.
 *
 * Covers spending only (fixed/variable/debt); income and transfer rows are
 * excluded. Rows are the UNION of (type, category) keys with data in either
 * window — a category that disappeared this year still gets a row (status 'gone'),
 * because a comparison that omits it would overstate how well the year is going.
 * Keys at zero on both sides are dropped. Sorted by |delta| descending, so the
 * biggest movers in either direction lead.
 *
 * @param expenses       Every row available; the scope does the windowing.
 * @param currentYear    Calendar year under review.
 * @param comparisonYear Calendar year used as baseline.
 * @param scope          Which months count, applied identically to both years.
 * @param monthOf        Resolves a row to its calendar bucket (month 1-12).
 */
export function buildCategoryComparison(
  expenses: Expense[],
  currentYear: number,
  comparisonYear: number,
  scope: ComparisonMonthScope,
  monthOf: (expense: Expense) => { year: number; month: number },
): CategoryDeltaRow[] {
  const buckets = new Map<string, ComparisonAccumulator>();

  for (const expense of expenses) {
    if (!isSpending(expense)) continue;

    const { year, month } = monthOf(expense);
    if (!isMonthInScope(month, scope)) continue;
    const side = year === currentYear ? 'current' : year === comparisonYear ? 'previous' : null;
    if (side === null) continue;

    const categoryKey = getCategoryKey(expense);
    const key = `${expense.type}:${categoryKey}`;
    const bucket = buckets.get(key) ?? {
      expenseType: expense.type,
      categoryKey,
      name: getCategoryName(expense),
      current: 0,
      previous: 0,
    };
    bucket[side] += magnitude(expense);
    buckets.set(key, bucket);
  }

  // A key can sit at zero on both sides (0-amount rows); it says nothing about
  // either year, so it gets no row. Filtered BEFORE resolving labels, so an
  // all-zero namesake cannot force a qualifier onto a row that is rendered.
  const rendered = Array.from(buckets.entries()).filter(
    ([, bucket]) => bucket.current > 0 || bucket.previous > 0,
  );

  const labels = resolveDisplayLabels(
    rendered.map(([key, bucket]) => ({
      key,
      name: bucket.name,
      qualifier: EXPENSE_TYPE_LABELS[bucket.expenseType],
    })),
  );

  return rendered
    .map(([key, bucket]): CategoryDeltaRow => {
      const delta = bucket.current - bucket.previous;
      return {
        key,
        expenseType: bucket.expenseType,
        categoryKey: bucket.categoryKey,
        label: labels.get(key) ?? bucket.name,
        current: bucket.current,
        previous: bucket.previous,
        delta,
        deltaPercent: percentOf(delta, bucket.previous),
        // The zero-both filter above guarantees the other side is > 0 here.
        status: bucket.previous === 0 ? 'new' : bucket.current === 0 ? 'gone' : 'ongoing',
      };
    })
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
}

/** One side (spending or income) of the totals pacing, all values as magnitudes. */
export interface PacingSide {
  current: number;
  previous: number;
  /** current − previous. */
  delta: number;
  /** Delta as a share of the baseline, null when previous === 0. */
  deltaPercent: number | null;
}

export interface TotalsPacing {
  expenses: PacingSide;
  income: PacingSide;
  /** User-facing caption declaring the baseline — produced HERE so call sites cannot diverge. */
  baselineLabel: string;
}

/**
 * The caption declaring what the figures are compared against. Italian copy,
 * rendered verbatim by every consumer.
 */
function buildBaselineLabel(comparisonYear: number, scope: ComparisonMonthScope): string {
  switch (scope.kind) {
    case 'sameMonths': {
      // A cut at December covers the whole year: saying "same months" would only
      // make the reader wonder what was left out.
      if (scope.upToMonth === 12) return `vs ${comparisonYear}`;
      const lastMonthAbbrev = MONTH_NAMES[scope.upToMonth - 1].slice(0, 3).toLowerCase();
      return `vs ${comparisonYear} (stessi mesi, gen–${lastMonthAbbrev})`;
    }
    case 'singleMonth':
      // The running month compares a partial window against a complete one —
      // declared, so "−54% vs Agosto 2025" cannot read as a final verdict.
      return `vs ${MONTH_NAMES[scope.month - 1]} ${comparisonYear}${scope.inProgress ? ' (mese in corso)' : ''}`;
    case 'fullYear':
      return `vs ${comparisonYear}`;
  }
}

function buildPacingSide(current: number, previous: number): PacingSide {
  const delta = current - previous;
  return { current, previous, delta, deltaPercent: percentOf(delta, previous) };
}

/**
 * Compare total spending and total income between two years over one month scope.
 *
 * Spending side sums spending magnitudes (fixed/variable/debt, classified by type);
 * income side sums income rows. Transfers are excluded everywhere — from the totals
 * AND from the emptiness check below.
 *
 * @returns null when the comparison-year window contains NO rows at all (neither
 *          spending nor income): callers hide the pacing row entirely rather than
 *          pacing against a fake zero baseline.
 */
export function computeTotalsPacing(
  expenses: Expense[],
  currentYear: number,
  comparisonYear: number,
  scope: ComparisonMonthScope,
  monthOf: (expense: Expense) => { year: number; month: number },
): TotalsPacing | null {
  let spendingCurrent = 0;
  let spendingPrevious = 0;
  let incomeCurrent = 0;
  let incomePrevious = 0;
  let comparisonWindowHasRows = false;

  for (const expense of expenses) {
    if (expense.type === 'transfer') continue;

    const { year, month } = monthOf(expense);
    if (!isMonthInScope(month, scope)) continue;
    const isCurrent = year === currentYear;
    if (!isCurrent && year !== comparisonYear) continue;

    // Presence, not amount, decides emptiness: a 0-amount row is still a recorded
    // baseline, while an empty window means the year simply was not tracked.
    if (!isCurrent) comparisonWindowHasRows = true;

    if (expense.type === 'income') {
      if (isCurrent) incomeCurrent += magnitude(expense);
      else incomePrevious += magnitude(expense);
    } else if (isCurrent) {
      spendingCurrent += magnitude(expense);
    } else {
      spendingPrevious += magnitude(expense);
    }
  }

  if (!comparisonWindowHasRows) return null;

  return {
    expenses: buildPacingSide(spendingCurrent, spendingPrevious),
    income: buildPacingSide(incomeCurrent, incomePrevious),
    baselineLabel: buildBaselineLabel(comparisonYear, scope),
  };
}
