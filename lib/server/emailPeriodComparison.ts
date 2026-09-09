/**
 * Deterministic period-comparison builder for periodic summary emails.
 *
 * Computes, for a given email period, how net worth / income / expenses / savings changed
 * relative to:
 *   1. the previous period (mese/trimestre/semestre/anno precedente), and
 *   2. the same period one year earlier (year-over-year, "YoY").
 *
 * All deltas are computed in plain TypeScript — never by the AI — so the figures shown in
 * the email are authoritative. The AI commentary only *interprets* these numbers.
 *
 * Layer note: this module is server-only (Firebase Admin SDK + Resend-adjacent flow).
 * It reuses the pure period-coordinate helpers and `aggregateExpenses` from
 * monthlyEmailService.ts to stay consistent with how the main email data is built.
 */

import { adminDb } from '@/lib/firebase/admin';
import { Timestamp } from 'firebase-admin/firestore';
import { MONTH_NAMES } from '@/lib/constants/months';
import {
  aggregateExpenses,
  getQuarterStartMonth,
  getSemesterStartMonth,
  getPreviousQuarterEnd,
  getPreviousHalfEnd,
  monthToQuarter,
  monthToSemester,
  type EmailPeriodType,
  type MonthlyEmailData,
} from '@/lib/server/monthlyEmailService';

// ─── Types ────────────────────────────────────────────────────────────────────

/** A single metric's absolute and relative change. `pctChange` is null when the base is 0. */
export interface MetricDelta {
  absChange: number;
  pctChange: number | null;
}

/**
 * One comparison axis (vs previous period OR vs same period last year).
 * Each metric delta is null when the comparison data is unavailable (missing snapshot,
 * no tracked cashflow in the baseline period) — the email renders "N/D" in that case.
 */
export interface ComparisonSet {
  baselineLabel: string;
  netWorth: MetricDelta | null;
  income: MetricDelta | null;
  expenses: MetricDelta | null;
  savings: MetricDelta | null;
}

/** Per-category expense change, used by the AI to hypothesise causes of expense variation. */
interface CategoryDelta {
  name: string;
  current: number;
  vsPrevious: MetricDelta | null;
  vsYoy: MetricDelta | null;
}

export interface PeriodComparison {
  vsPrevious: ComparisonSet;
  vsYoy: ComparisonSet;
  // For yearly emails the previous period IS the same period one year earlier, so the two
  // comparison axes coincide. Callers render a single comparison column in that case.
  previousEqualsYoy: boolean;
  // Top expense categories (by current amount) with their previous/YoY deltas.
  categoryDeltas: CategoryDelta[];
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

interface PeriodCoords {
  year: number;
  endMonth: number;
}

interface CashflowMetrics {
  netWorth: number | null;
  totalIncome: number | null;
  totalExpenses: number | null;
  savings: number | null;
  // Expense category KEY (categoryId, name-fallback for legacy rows) → total spent
  // in the period (absolute, positive). Keyed by id so two same-named categories
  // stay two entries and cross-period lookups match the right document.
  expenseByCategory: Record<string, number>;
}

/**
 * How many expense categories (the largest by spend in the period) get a delta.
 *
 * Exported because the cap has to be DECLARED in the prompt text: a silent cap is
 * indistinguishable, to a model, from "that category had no spending", and the
 * data-integrity rules then turn the gap into a hallucinated "N/D". The consumer names
 * this number in the section header and states how many categories it left out.
 */
export const MAX_CATEGORY_DELTAS = 12;

/**
 * Resolves the {year, endMonth} of the period immediately preceding the given period.
 * Mirrors the previous-period logic in buildPeriodEmailData.
 */
function previousPeriodCoords(
  periodType: EmailPeriodType,
  year: number,
  endMonth: number
): PeriodCoords {
  if (periodType === 'quarterly') {
    const prev = getPreviousQuarterEnd(year, endMonth);
    return { year: prev.year, endMonth: prev.month };
  }
  if (periodType === 'semiannual') {
    const prev = getPreviousHalfEnd(year, endMonth);
    return { year: prev.year, endMonth: prev.month };
  }
  if (periodType === 'yearly') {
    return { year: year - 1, endMonth: 12 };
  }
  // monthly — January wraps to December of the previous year
  return endMonth === 1 ? { year: year - 1, endMonth: 12 } : { year, endMonth: endMonth - 1 };
}

/** Resolves the {year, endMonth} of the same period one year earlier. */
function yoyPeriodCoords(
  periodType: EmailPeriodType,
  year: number,
  endMonth: number
): PeriodCoords {
  // Every period type compares against the identical period end shifted back one year.
  // (yearly: endMonth stays 12 — which also equals the previous period.)
  return { year: year - 1, endMonth };
}

/** Returns the expense-window start month for a period ending at `endMonth`. */
function windowStartMonthFor(periodType: EmailPeriodType, endMonth: number): number {
  if (periodType === 'quarterly') return getQuarterStartMonth(endMonth);
  if (periodType === 'semiannual') return getSemesterStartMonth(endMonth);
  if (periodType === 'yearly') return 1;
  return endMonth; // monthly
}

/**
 * Fetches the snapshot + expenses for a target period and reduces them to comparison metrics.
 *
 * Cashflow metrics are null when no expense docs exist in the window — for a past period that
 * predates the user's tracking history, returning 0 would produce a misleading "−100%" delta.
 */
async function fetchPeriodMetrics(
  userId: string,
  periodType: EmailPeriodType,
  coords: PeriodCoords
): Promise<CashflowMetrics> {
  const startMonth = windowStartMonthFor(periodType, coords.endMonth);
  const windowStart = new Date(coords.year, startMonth - 1, 1);
  const windowEnd = new Date(coords.year, coords.endMonth, 0, 23, 59, 59);

  const [snapSnap, expensesSnap] = await Promise.all([
    adminDb
      .collection('monthly-snapshots')
      .where('userId', '==', userId)
      .where('year', '==', coords.year)
      .where('month', '==', coords.endMonth)
      .limit(1)
      .get(),
    adminDb
      .collection('expenses')
      .where('userId', '==', userId)
      .where('date', '>=', Timestamp.fromDate(windowStart))
      .where('date', '<=', Timestamp.fromDate(windowEnd))
      .get(),
  ]);

  const realSnapDocs = snapSnap.docs.filter((d) => !d.data().isDummy);
  const netWorth = realSnapDocs.length > 0 ? (realSnapDocs[0].data().totalNetWorth ?? null) : null;

  // No tracked transactions in this past window → treat cashflow as unavailable, not zero.
  if (expensesSnap.empty) {
    return { netWorth, totalIncome: null, totalExpenses: null, savings: null, expenseByCategory: {} };
  }

  const { totalIncome, totalExpenses, topExpenseCategories } = aggregateExpenses(expensesSnap.docs);
  const expenseByCategory: Record<string, number> = {};
  for (const cat of topExpenseCategories) {
    expenseByCategory[cat.key] = cat.amount;
  }

  return {
    netWorth,
    totalIncome,
    totalExpenses,
    savings: totalIncome - totalExpenses,
    expenseByCategory,
  };
}

/** Computes absolute + relative change of `current` against `baseline`; null when not comparable. */
export function computeDelta(
  current: number | null,
  baseline: number | null
): MetricDelta | null {
  if (current === null || baseline === null) return null;
  const absChange = current - baseline;
  const pctChange = baseline !== 0 ? (absChange / Math.abs(baseline)) * 100 : null;
  return { absChange, pctChange };
}

/** Builds a comparison set (NW/income/expenses/savings) of `current` against a baseline period. */
function buildComparisonSet(
  baselineLabel: string,
  current: CashflowMetrics,
  baseline: CashflowMetrics
): ComparisonSet {
  return {
    baselineLabel,
    netWorth: computeDelta(current.netWorth, baseline.netWorth),
    income: computeDelta(current.totalIncome, baseline.totalIncome),
    expenses: computeDelta(current.totalExpenses, baseline.totalExpenses),
    savings: computeDelta(current.savings, baseline.savings),
  };
}

/** Previous-period baseline label, e.g. "mese precedente", "Q1 2026", "1° Semestre 2026", "2025". */
function previousBaselineLabel(
  periodType: EmailPeriodType,
  prev: PeriodCoords
): string {
  if (periodType === 'monthly') return 'mese precedente';
  if (periodType === 'quarterly') return `Q${monthToQuarter(prev.endMonth)} ${prev.year}`;
  if (periodType === 'semiannual') return `${monthToSemester(prev.endMonth)}° Semestre ${prev.year}`;
  return `${prev.year}`; // yearly
}

/** YoY baseline label, e.g. "Marzo 2025", "Q1 2025", "1° Semestre 2025", "2025". */
function yoyBaselineLabel(
  periodType: EmailPeriodType,
  yoy: PeriodCoords
): string {
  if (periodType === 'monthly') return `${MONTH_NAMES[yoy.endMonth - 1]} ${yoy.year}`;
  if (periodType === 'quarterly') return `Q${monthToQuarter(yoy.endMonth)} ${yoy.year}`;
  if (periodType === 'semiannual') return `${monthToSemester(yoy.endMonth)}° Semestre ${yoy.year}`;
  return `${yoy.year}`; // yearly
}

// ─── Public builder ─────────────────────────────────────────────────────────────

/**
 * Builds the deterministic comparison dataset for an email period.
 *
 * Reuses the current-period figures already present in `emailData` (net worth, income,
 * expenses, expense categories) and only fetches the previous-period and YoY baselines.
 *
 * @param userId - Firebase UID
 * @param emailData - The already-built data for the current period
 * @returns Per-axis metric deltas plus top-category deltas for cause analysis
 */
export async function buildPeriodComparison(
  userId: string,
  emailData: MonthlyEmailData
): Promise<PeriodComparison> {
  const { periodType, year, month } = emailData;
  const previousEqualsYoy = periodType === 'yearly';

  const prevCoords = previousPeriodCoords(periodType, year, month);
  const yoyCoords = yoyPeriodCoords(periodType, year, month);

  // Current-period metrics come straight from the authoritative email data (no extra fetch).
  const currentExpenseByCategory: Record<string, number> = {};
  for (const cat of emailData.topExpenseCategories) {
    currentExpenseByCategory[cat.key] = cat.amount;
  }
  const current: CashflowMetrics = {
    netWorth: emailData.currentNetWorth,
    totalIncome: emailData.totalIncome,
    totalExpenses: emailData.totalExpenses,
    savings: emailData.totalIncome - emailData.totalExpenses,
    expenseByCategory: currentExpenseByCategory,
  };

  // Fetch baselines in parallel. For yearly, prev and YoY are identical → fetch once.
  const [prevMetrics, yoyMetrics] = await Promise.all([
    fetchPeriodMetrics(userId, periodType, prevCoords),
    previousEqualsYoy
      ? Promise.resolve(null)
      : fetchPeriodMetrics(userId, periodType, yoyCoords),
  ]);
  const resolvedYoyMetrics = yoyMetrics ?? prevMetrics;

  const vsPrevious = buildComparisonSet(
    previousBaselineLabel(periodType, prevCoords),
    current,
    prevMetrics
  );
  const vsYoy = buildComparisonSet(
    yoyBaselineLabel(periodType, yoyCoords),
    current,
    resolvedYoyMetrics
  );

  // Top current expense categories with their deltas vs both baselines.
  // Baseline lookups go through the category KEY: with two same-named categories,
  // each row compares against its own document's baseline, not a namesake's.
  const categoryDeltas: CategoryDelta[] = emailData.topExpenseCategories
    .slice(0, MAX_CATEGORY_DELTAS)
    .map((cat) => ({
      name: cat.name,
      current: cat.amount,
      vsPrevious: computeDelta(cat.amount, prevMetrics.expenseByCategory[cat.key] ?? null),
      vsYoy: computeDelta(cat.amount, resolvedYoyMetrics.expenseByCategory[cat.key] ?? null),
    }));

  return { vsPrevious, vsYoy, previousEqualsYoy, categoryDeltas };
}
