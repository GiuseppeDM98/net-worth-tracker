/**
 * Assistant Context Builder (server-side, Admin SDK)
 *
 * Builds AssistantMonthContextBundle for a given user and period. All builders
 * use Firebase Admin SDK because they run inside API routes — the client
 * Firestore SDK requires an authenticated browser session unavailable server-side.
 *
 * Period types (encoded in selector.month):
 *   month > 0  → standard monthly analysis
 *   month === 0 → full-year analysis (selector.year is the year)
 *   month === -1 → YTD (Jan 1 → latest month of current year)
 *   month === -2 → total history (cashflowHistoryStartYear → now)
 *
 * Design decisions:
 * - Never uses Date.getMonth() / getFullYear() for domain grouping — snapshots
 *   are identified by their stored `year`/`month` integer fields.
 * - Month-end date includes the full last day (23:59:59) so Firestore range
 *   queries capture every transaction recorded that day.
 * - Dummy snapshots are excluded by default because they are synthetic test
 *   fixtures that would distort real portfolio numbers. They can be included by
 *   passing includeDummySnapshots = true, intended for test accounts only.
 * - Dividends are separated from other income using dividendIncomeCategoryId
 *   from the user's settings, matching the pattern in performanceService.ts.
 * - allocationChanges is capped at the top 5 by absolute change to keep the
 *   context bundle lean for the prompt builder.
 * - Sub-category allocation is built by cross-referencing snapshot byAsset values
 *   with live asset records. Uses current asset metadata for all periods — close
 *   enough for portfolio analysis since subCategory rarely changes.
 */

import { Timestamp } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase/admin';
import { getItalyMonthYear, toDate } from '@/lib/utils/dateHelpers';
import { AssistantMonthContextBundle, AssistantMonthSelectorValue } from '@/types/assistant';
import { Asset, AssetAllocationSettings, MonthlySnapshot } from '@/types/assets';
import { Expense } from '@/types/expenses';

const MAX_ALLOCATION_CHANGES = 5;

/**
 * Returns the first and last moment of the given year/month as Date objects.
 * Day 0 of the next month = last day of the current month, pushed to 23:59:59.
 */
function getMonthDateRange(year: number, month: number): { startDate: Date; endDate: Date } {
  const startDate = new Date(year, month - 1, 1, 0, 0, 0);
  const endDate = new Date(year, month, 0, 23, 59, 59);
  return { startDate, endDate };
}

/**
 * Returns the first and last moment of the given year as Date objects.
 */
function getYearDateRange(year: number): { startDate: Date; endDate: Date } {
  const startDate = new Date(year, 0, 1, 0, 0, 0); // Jan 1
  const endDate = new Date(year, 11, 31, 23, 59, 59); // Dec 31
  return { startDate, endDate };
}

/**
 * Finds a snapshot for the exact year/month.
 * Dummy snapshots are excluded unless includeDummy is true (test accounts only).
 */
function findSnapshot(
  snapshots: MonthlySnapshot[],
  year: number,
  month: number,
  includeDummy = false
): MonthlySnapshot | null {
  return (
    snapshots.find((s) => s.year === year && s.month === month && (!s.isDummy || includeDummy)) ?? null
  );
}

/**
 * Returns the previous month selector (handles January -> December wrap).
 */
function getPreviousMonth(year: number, month: number): { year: number; month: number } {
  if (month === 1) {
    return { year: year - 1, month: 12 };
  }
  return { year, month: month - 1 };
}

/**
 * Returns the latest snapshot within the given year, or null.
 * Snapshots are assumed to be ordered by year/month ascending.
 * Dummy snapshots are excluded unless includeDummy is true (test accounts only).
 */
function findLatestSnapshotInYear(
  snapshots: MonthlySnapshot[],
  year: number,
  includeDummy = false
): MonthlySnapshot | null {
  const inYear = snapshots.filter((s) => s.year === year && (!s.isDummy || includeDummy));
  if (inYear.length === 0) return null;
  return inYear[inYear.length - 1];
}

/**
 * Returns the latest snapshot at or before the given year, or null.
 * Dummy snapshots are excluded unless includeDummy is true (test accounts only).
 */
function findLatestSnapshotAtOrBeforeYear(
  snapshots: MonthlySnapshot[],
  maxYear: number,
  includeDummy = false
): MonthlySnapshot | null {
  const eligible = snapshots.filter((s) => s.year <= maxYear && (!s.isDummy || includeDummy));
  if (eligible.length === 0) return null;
  return eligible[eligible.length - 1];
}

// ─── Admin SDK fetchers ──────────────────────────────────────────────────────

async function fetchSnapshots(userId: string): Promise<MonthlySnapshot[]> {
  const snap = await adminDb
    .collection('monthly-snapshots')
    .where('userId', '==', userId)
    .orderBy('year', 'asc')
    .orderBy('month', 'asc')
    .get();

  return snap.docs.map((doc) => {
    const data = doc.data();
    return {
      ...data,
      createdAt: toDate(data.createdAt),
    } as MonthlySnapshot;
  });
}

async function fetchExpenses(
  userId: string,
  startDate: Date,
  endDate: Date
): Promise<Expense[]> {
  const snap = await adminDb
    .collection('expenses')
    .where('userId', '==', userId)
    .where('date', '>=', Timestamp.fromDate(startDate))
    .where('date', '<=', Timestamp.fromDate(endDate))
    .get();

  return snap.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      ...data,
      date: toDate(data.date),
      createdAt: toDate(data.createdAt),
      updatedAt: toDate(data.updatedAt),
    } as Expense;
  });
}

async function fetchSettings(userId: string): Promise<AssetAllocationSettings | null> {
  const doc = await adminDb.collection('assetAllocationTargets').doc(userId).get();
  if (!doc.exists) {
    return null;
  }
  const data = doc.data();
  if (!data) {
    return null;
  }
  // Only the fields needed for context building — not the full settings shape
  return {
    dividendIncomeCategoryId: data.dividendIncomeCategoryId,
    cashflowHistoryStartYear: data.cashflowHistoryStartYear,
  } as AssetAllocationSettings;
}

/**
 * Fetches user's live assets to get subCategory metadata.
 * Used to build bySubCategoryAllocation from snapshot byAsset values.
 */
async function fetchAssets(userId: string): Promise<Asset[]> {
  const snap = await adminDb
    .collection('assets')
    .where('userId', '==', userId)
    .get();

  return snap.docs.map((doc) => {
    const data = doc.data();
    return { id: doc.id, ...data } as Asset;
  });
}

// ─── Shared helpers ──────────────────────────────────────────────────────────

/**
 * Builds bySubCategoryAllocation from a snapshot's byAsset array and live asset metadata.
 *
 * Cross-references assetId from the snapshot with current asset records to get subCategory.
 * Only assets with a non-empty subCategory are included — assets without one are skipped.
 * Result: { assetClass: { subCategory: eurValue } }
 */
function buildSubCategoryAllocation(
  snapshot: MonthlySnapshot | null,
  assets: Asset[]
): AssistantMonthContextBundle['bySubCategoryAllocation'] {
  if (!snapshot?.byAsset || snapshot.byAsset.length === 0) return {};

  // Build a map from assetId → asset for O(1) lookup
  const assetMap = new Map<string, Asset>();
  for (const asset of assets) {
    if (asset.id) {
      assetMap.set(asset.id, asset);
    }
  }

  const result: AssistantMonthContextBundle['bySubCategoryAllocation'] = {};

  for (const entry of snapshot.byAsset) {
    const asset = assetMap.get(entry.assetId);
    if (!asset?.subCategory) continue; // Skip assets without sub-categorisation
    if (!entry.totalValue) continue;

    const assetClass = asset.assetClass ?? 'altro';
    const subCat = asset.subCategory;

    if (!result[assetClass]) {
      result[assetClass] = {};
    }
    result[assetClass][subCat] = (result[assetClass][subCat] ?? 0) + entry.totalValue;
  }

  return result;
}

/**
 * Aggregates cashflow from an array of expenses, splitting dividends from regular income.
 */
function aggregateCashflow(
  expenses: Expense[],
  dividendCategoryId: string | undefined
): { totalIncome: number; totalExpenses: number; totalDividends: number; netCashFlow: number } {
  let totalIncome = 0;
  let totalExpenses = 0;
  let totalDividends = 0;

  for (const expense of expenses) {
    if (expense.amount > 0) {
      if (dividendCategoryId && expense.categoryId === dividendCategoryId) {
        totalDividends += expense.amount;
      } else {
        totalIncome += expense.amount;
      }
    } else {
      totalExpenses += expense.amount;
    }
  }

  return {
    totalIncome,
    totalExpenses,
    totalDividends,
    netCashFlow: totalIncome + totalDividends + totalExpenses,
  };
}

/**
 * Builds top expense categories (top 5) and top individual expenses (top 5) from expenses.
 */
function buildExpenseBreakdown(expenses: Expense[]): {
  topExpensesByCategory: AssistantMonthContextBundle['topExpensesByCategory'];
  topIndividualExpenses: AssistantMonthContextBundle['topIndividualExpenses'];
} {
  const expenseCategoryMap = new Map<string, { total: number; transactionCount: number }>();
  for (const expense of expenses) {
    if (expense.amount < 0) {
      const name = expense.categoryName || expense.categoryId;
      const entry = expenseCategoryMap.get(name) ?? { total: 0, transactionCount: 0 };
      entry.total += expense.amount;
      entry.transactionCount += 1;
      expenseCategoryMap.set(name, entry);
    }
  }

  const topExpensesByCategory = Array.from(expenseCategoryMap.entries())
    .map(([categoryName, { total, transactionCount }]) => ({ categoryName, total, transactionCount }))
    .sort((a, b) => a.total - b.total) // most negative first
    .slice(0, 5);

  const topIndividualExpenses = expenses
    .filter((e) => e.amount < 0)
    .sort((a, b) => a.amount - b.amount)
    .slice(0, 5)
    .map((e) => ({
      categoryName: e.categoryName || e.categoryId,
      amount: e.amount,
      notes: (e as any).notes || undefined,
    }));

  return { topExpensesByCategory, topIndividualExpenses };
}

/**
 * Computes allocationChanges (top 5 by absolute change) between two snapshots.
 */
function buildAllocationChanges(
  currentSnapshot: MonthlySnapshot | null,
  previousSnapshot: MonthlySnapshot | null
): AssistantMonthContextBundle['allocationChanges'] {
  const allocationChanges: AssistantMonthContextBundle['allocationChanges'] = [];
  if (!currentSnapshot) return allocationChanges;

  const currentByClass = currentSnapshot.byAssetClass ?? {};
  const previousByClass = previousSnapshot?.byAssetClass ?? {};
  const hasPreviousBaseline = previousSnapshot !== null;

  const assetClasses = new Set([
    ...Object.keys(currentByClass),
    ...Object.keys(previousByClass),
  ]);

  for (const assetClass of assetClasses) {
    const currentValue = currentByClass[assetClass] ?? 0;
    const previousValue = previousByClass[assetClass] ?? null;
    const absoluteChange = currentValue - (previousValue ?? 0);

    let percentagePointsChange: number | null = null;
    if (hasPreviousBaseline && previousSnapshot) {
      const currentPct = currentSnapshot.totalNetWorth > 0
        ? (currentValue / currentSnapshot.totalNetWorth) * 100
        : 0;
      const prevPct = previousSnapshot.totalNetWorth > 0
        ? ((previousByClass[assetClass] ?? 0) / previousSnapshot.totalNetWorth) * 100
        : 0;
      percentagePointsChange = currentPct - prevPct;
    }

    allocationChanges.push({
      assetClass,
      previousValue: previousValue !== null ? (previousByClass[assetClass] ?? 0) : null,
      currentValue,
      absoluteChange,
      percentagePointsChange,
    });
  }

  allocationChanges.sort((a, b) => Math.abs(b.absoluteChange) - Math.abs(a.absoluteChange));
  allocationChanges.splice(MAX_ALLOCATION_CHANGES);

  return allocationChanges;
}

// ─── Main builder: monthly ────────────────────────────────────────────────────

/**
 * Builds the full AssistantMonthContextBundle for the given user and month.
 *
 * Fetches all user snapshots, the month's cashflow, settings, and asset metadata in parallel
 * to minimise latency. Allocation changes are sorted by absolute value and
 * capped at MAX_ALLOCATION_CHANGES.
 *
 * @param userId - Firebase UID of the authenticated user
 * @param selector - The year/month to analyse
 * @returns A fully populated bundle; null-safe for missing snapshots or cashflow
 */
export async function buildAssistantMonthContext(
  userId: string,
  selector: AssistantMonthSelectorValue,
  includeDummySnapshots = false
): Promise<AssistantMonthContextBundle> {
  const { year, month } = selector;
  const { startDate, endDate } = getMonthDateRange(year, month);
  const { year: prevYear, month: prevMonth } = getPreviousMonth(year, month);

  // Fetch snapshots, transactions, settings, and asset metadata in parallel
  const [allSnapshots, monthExpenses, settings, assets] = await Promise.all([
    fetchSnapshots(userId),
    fetchExpenses(userId, startDate, endDate),
    fetchSettings(userId),
    fetchAssets(userId),
  ]);

  const currentSnapshot = findSnapshot(allSnapshots, year, month, includeDummySnapshots);
  const previousSnapshot = findSnapshot(allSnapshots, prevYear, prevMonth, includeDummySnapshots);

  // Derive data quality flags before building any numbers
  const now = new Date();
  const { month: italyCurrentMonth, year: italyCurrentYear } = getItalyMonthYear(now);
  const isCurrentMonth = year === italyCurrentYear && month === italyCurrentMonth;

  const hasSnapshot = currentSnapshot !== null;
  const hasPreviousBaseline = previousSnapshot !== null;
  const hasCashflowData = monthExpenses.length > 0;
  // A month is partial when it's the current calendar month and no snapshot exists yet
  const isPartialMonth = isCurrentMonth && !hasSnapshot;

  // Build data quality notes for the prompt — these inform Claude about limitations
  const notes: string[] = [];
  if (!hasSnapshot && hasCashflowData) {
    notes.push('Snapshot patrimoniale non presente: patrimonio finale non consolidato.');
  }
  if (!hasSnapshot && !hasCashflowData) {
    notes.push('Nessun dato disponibile per questo mese.');
  }
  if (hasSnapshot && !hasPreviousBaseline) {
    notes.push('Nessun mese precedente disponibile: delta percentuale non calcolabile.');
  }
  if (isPartialMonth) {
    notes.push('Mese in corso: i dati cashflow potrebbero essere parziali.');
  }

  // --- Net worth ---
  const nwStart = previousSnapshot?.totalNetWorth ?? null;
  const nwEnd = currentSnapshot?.totalNetWorth ?? null;
  const nwDelta = nwStart !== null && nwEnd !== null ? nwEnd - nwStart : null;
  const nwDeltaPct =
    nwDelta !== null && nwStart !== null && nwStart !== 0
      ? (nwDelta / nwStart) * 100
      : null;

  // --- Cashflow breakdown ---
  const dividendCategoryId = settings?.dividendIncomeCategoryId;
  const { totalIncome, totalExpenses, totalDividends, netCashFlow } = aggregateCashflow(
    monthExpenses,
    dividendCategoryId
  );

  const { topExpensesByCategory, topIndividualExpenses } = buildExpenseBreakdown(monthExpenses);
  const allocationChanges = buildAllocationChanges(currentSnapshot, previousSnapshot);
  const bySubCategoryAllocation = buildSubCategoryAllocation(currentSnapshot, assets);

  return {
    selector,
    currentSnapshot,
    previousSnapshot,
    cashflow: {
      totalIncome,
      totalExpenses,
      totalDividends,
      netCashFlow,
      transactionCount: monthExpenses.length,
    },
    netWorth: {
      start: nwStart,
      end: nwEnd,
      delta: nwDelta,
      deltaPct: nwDeltaPct,
    },
    allocationChanges,
    topExpensesByCategory,
    topIndividualExpenses,
    bySubCategoryAllocation,
    dataQuality: {
      hasSnapshot,
      hasPreviousBaseline,
      hasCashflowData,
      isPartialMonth,
      notes,
    },
  };
}

// ─── Year builder ─────────────────────────────────────────────────────────────

/**
 * Builds the context bundle for a full-year analysis.
 *
 * Baseline: December snapshot of (year - 1)
 * End: latest snapshot within the target year (or partial if current year)
 * Cashflow: all transactions Jan 1 – Dec 31 (or Jan 1 – latest snapshot month end if current year)
 *
 * selector.month is set to 0 to signal a year-level period to the prompt builder.
 *
 * @param userId - Firebase UID of the authenticated user
 * @param year - The year to analyse
 */
export async function buildAssistantYearContext(
  userId: string,
  year: number,
  includeDummySnapshots = false
): Promise<AssistantMonthContextBundle> {
  const now = new Date();
  const { year: italyCurrentYear } = getItalyMonthYear(now);
  const isCurrentYear = year === italyCurrentYear;

  const yearStart = new Date(year, 0, 1, 0, 0, 0);
  // For current year: cap at end of today's month; for completed years: full Dec 31
  const yearEnd = new Date(year, 11, 31, 23, 59, 59);

  const [allSnapshots, yearExpenses, settings, assets] = await Promise.all([
    fetchSnapshots(userId),
    fetchExpenses(userId, yearStart, yearEnd),
    fetchSettings(userId),
    fetchAssets(userId),
  ]);

  // Baseline = December of previous year
  const previousSnapshot = findSnapshot(allSnapshots, year - 1, 12, includeDummySnapshots);
  // End = latest snapshot within target year
  const currentSnapshot = findLatestSnapshotInYear(allSnapshots, year, includeDummySnapshots);

  const hasSnapshot = currentSnapshot !== null;
  const hasPreviousBaseline = previousSnapshot !== null;
  const hasCashflowData = yearExpenses.length > 0;

  const notes: string[] = [];
  if (!hasSnapshot && hasCashflowData) {
    notes.push('Nessuno snapshot patrimoniale nell\'anno: patrimonio finale non consolidato.');
  }
  if (!hasSnapshot && !hasCashflowData) {
    notes.push('Nessun dato disponibile per questo anno.');
  }
  if (hasSnapshot && !hasPreviousBaseline) {
    notes.push('Nessun dicembre precedente disponibile: variazione annuale non calcolabile.');
  }
  if (isCurrentYear) {
    // Claude must be explicitly told the year is in progress — it affects how it
    // interprets cashflow totals and the absence of later-month snapshots.
    notes.push('Anno in corso: i dati sono parziali. Non trarre conclusioni annuali definitive.');
  }

  // Net worth: start of year (Dec prev year) → end of latest month in year
  const nwStart = previousSnapshot?.totalNetWorth ?? null;
  const nwEnd = currentSnapshot?.totalNetWorth ?? null;
  const nwDelta = nwStart !== null && nwEnd !== null ? nwEnd - nwStart : null;
  const nwDeltaPct =
    nwDelta !== null && nwStart !== null && nwStart !== 0
      ? (nwDelta / nwStart) * 100
      : null;

  const dividendCategoryId = settings?.dividendIncomeCategoryId;
  const { totalIncome, totalExpenses, totalDividends, netCashFlow } = aggregateCashflow(
    yearExpenses,
    dividendCategoryId
  );

  const { topExpensesByCategory, topIndividualExpenses } = buildExpenseBreakdown(yearExpenses);
  const allocationChanges = buildAllocationChanges(currentSnapshot, previousSnapshot);
  const bySubCategoryAllocation = buildSubCategoryAllocation(currentSnapshot, assets);

  // selector.month = 0 signals "year-level" period to prompt builders and the context card
  return {
    selector: { year, month: 0 },
    currentSnapshot,
    previousSnapshot,
    cashflow: {
      totalIncome,
      totalExpenses,
      totalDividends,
      netCashFlow,
      transactionCount: yearExpenses.length,
    },
    netWorth: { start: nwStart, end: nwEnd, delta: nwDelta, deltaPct: nwDeltaPct },
    allocationChanges,
    topExpensesByCategory,
    topIndividualExpenses,
    bySubCategoryAllocation,
    dataQuality: {
      hasSnapshot,
      hasPreviousBaseline,
      hasCashflowData,
      isPartialMonth: isCurrentYear,
      notes,
    },
  };
}

// ─── Quarter builder ─────────────────────────────────────────────────────────

/**
 * Builds the context bundle for a completed-quarter analysis.
 *
 * Baseline: end-of-previous-quarter snapshot (Q1 → Dec prev year; Q2/Q3/Q4 → prev quarter-end)
 * End: end-of-quarter snapshot (e.g. March for Q1, June for Q2)
 * Cashflow: all transactions from quarter start month to quarter end month
 *
 * selector.month is set to the last month of the quarter (3, 6, 9, or 12) and
 * selector.quarter is set to 1-4 so getPeriodLabel can render "Q1 2026" instead of "Marzo 2026".
 *
 * @param userId - Firebase UID of the authenticated user
 * @param year - The year of the quarter
 * @param quarter - 1-4 identifying the calendar quarter
 * @param includeDummySnapshots - Include test fixture snapshots (test accounts only)
 */
export async function buildAssistantQuarterContext(
  userId: string,
  year: number,
  quarter: number,
  includeDummySnapshots = false
): Promise<AssistantMonthContextBundle> {
  const lastMonthOfQuarter = quarter * 3;    // 3, 6, 9, 12
  const quarterStartMonth = lastMonthOfQuarter - 2; // 1, 4, 7, 10

  // Previous quarter-end: Q1 → Dec of previous year; Q2/Q3/Q4 → 3 months earlier
  const prevQuarterYear = quarter === 1 ? year - 1 : year;
  const prevQuarterMonth = quarter === 1 ? 12 : lastMonthOfQuarter - 3;

  const startDate = new Date(year, quarterStartMonth - 1, 1, 0, 0, 0);
  // Day 0 of next month = last day of quarter-end month
  const endDate = new Date(year, lastMonthOfQuarter, 0, 23, 59, 59);

  const [allSnapshots, quarterExpenses, settings, assets] = await Promise.all([
    fetchSnapshots(userId),
    fetchExpenses(userId, startDate, endDate),
    fetchSettings(userId),
    fetchAssets(userId),
  ]);

  // End snapshot = last day of quarter-end month
  const currentSnapshot = findSnapshot(allSnapshots, year, lastMonthOfQuarter, includeDummySnapshots);
  // Baseline snapshot = last day of previous quarter
  const previousSnapshot = findSnapshot(allSnapshots, prevQuarterYear, prevQuarterMonth, includeDummySnapshots);

  const hasSnapshot = currentSnapshot !== null;
  const hasPreviousBaseline = previousSnapshot !== null;
  const hasCashflowData = quarterExpenses.length > 0;

  const notes: string[] = [];
  if (!hasSnapshot && hasCashflowData) {
    notes.push('Snapshot patrimoniale di fine trimestre non presente: patrimonio finale non consolidato.');
  }
  if (!hasSnapshot && !hasCashflowData) {
    notes.push('Nessun dato disponibile per questo trimestre.');
  }
  if (hasSnapshot && !hasPreviousBaseline) {
    notes.push('Nessun trimestre precedente disponibile: variazione trimestrale non calcolabile.');
  }

  const nwStart = previousSnapshot?.totalNetWorth ?? null;
  const nwEnd = currentSnapshot?.totalNetWorth ?? null;
  const nwDelta = nwStart !== null && nwEnd !== null ? nwEnd - nwStart : null;
  const nwDeltaPct =
    nwDelta !== null && nwStart !== null && nwStart !== 0
      ? (nwDelta / nwStart) * 100
      : null;

  const dividendCategoryId = settings?.dividendIncomeCategoryId;
  const { totalIncome, totalExpenses, totalDividends, netCashFlow } = aggregateCashflow(
    quarterExpenses,
    dividendCategoryId
  );

  const { topExpensesByCategory, topIndividualExpenses } = buildExpenseBreakdown(quarterExpenses);
  const allocationChanges = buildAllocationChanges(currentSnapshot, previousSnapshot);
  const bySubCategoryAllocation = buildSubCategoryAllocation(currentSnapshot, assets);

  // selector.quarter disambiguates from a monthly period with the same end-month value
  return {
    selector: { year, month: lastMonthOfQuarter, quarter },
    currentSnapshot,
    previousSnapshot,
    cashflow: {
      totalIncome,
      totalExpenses,
      totalDividends,
      netCashFlow,
      transactionCount: quarterExpenses.length,
    },
    netWorth: { start: nwStart, end: nwEnd, delta: nwDelta, deltaPct: nwDeltaPct },
    allocationChanges,
    topExpensesByCategory,
    topIndividualExpenses,
    bySubCategoryAllocation,
    dataQuality: {
      hasSnapshot,
      hasPreviousBaseline,
      hasCashflowData,
      isPartialMonth: false, // quarterly emails only fire on completed quarters
      notes,
    },
  };
}

// ─── YTD builder ──────────────────────────────────────────────────────────────

/**
 * Builds the context bundle for a Year-to-Date analysis (Jan 1 → latest month of current year).
 *
 * Always refers to the current Italy-timezone year. Always marked as partial
 * because the year is necessarily in progress.
 *
 * selector.month = -1 signals "YTD" period.
 *
 * @param userId - Firebase UID of the authenticated user
 */
export async function buildAssistantYtdContext(
  userId: string,
  includeDummySnapshots = false
): Promise<AssistantMonthContextBundle> {
  const now = new Date();
  const { year: currentYear, month: currentMonth } = getItalyMonthYear(now);

  const ytdStart = new Date(currentYear, 0, 1, 0, 0, 0);
  // Include up to end of today's month so all tracked transactions are captured
  const ytdEnd = new Date(currentYear, currentMonth, 0, 23, 59, 59);

  const [allSnapshots, ytdExpenses, settings, assets] = await Promise.all([
    fetchSnapshots(userId),
    fetchExpenses(userId, ytdStart, ytdEnd),
    fetchSettings(userId),
    fetchAssets(userId),
  ]);

  // Baseline = December of previous year (same as year builder)
  const previousSnapshot = findSnapshot(allSnapshots, currentYear - 1, 12, includeDummySnapshots);
  // End = latest snapshot of current year found so far
  const currentSnapshot = findLatestSnapshotInYear(allSnapshots, currentYear, includeDummySnapshots);

  const hasSnapshot = currentSnapshot !== null;
  const hasPreviousBaseline = previousSnapshot !== null;
  const hasCashflowData = ytdExpenses.length > 0;

  const notes: string[] = [
    'Analisi YTD (da inizio anno a oggi): anno in corso, dati parziali.',
  ];
  if (!hasSnapshot) {
    notes.push('Nessuno snapshot patrimoniale disponibile per l\'anno corrente.');
  }
  if (!hasPreviousBaseline) {
    notes.push('Nessun dicembre precedente: variazione YTD non calcolabile.');
  }

  const nwStart = previousSnapshot?.totalNetWorth ?? null;
  const nwEnd = currentSnapshot?.totalNetWorth ?? null;
  const nwDelta = nwStart !== null && nwEnd !== null ? nwEnd - nwStart : null;
  const nwDeltaPct =
    nwDelta !== null && nwStart !== null && nwStart !== 0
      ? (nwDelta / nwStart) * 100
      : null;

  const dividendCategoryId = settings?.dividendIncomeCategoryId;
  const { totalIncome, totalExpenses, totalDividends, netCashFlow } = aggregateCashflow(
    ytdExpenses,
    dividendCategoryId
  );

  const { topExpensesByCategory, topIndividualExpenses } = buildExpenseBreakdown(ytdExpenses);
  const allocationChanges = buildAllocationChanges(currentSnapshot, previousSnapshot);
  const bySubCategoryAllocation = buildSubCategoryAllocation(currentSnapshot, assets);

  // selector.month = -1 signals "YTD" period
  return {
    selector: { year: currentYear, month: -1 },
    currentSnapshot,
    previousSnapshot,
    cashflow: {
      totalIncome,
      totalExpenses,
      totalDividends,
      netCashFlow,
      transactionCount: ytdExpenses.length,
    },
    netWorth: { start: nwStart, end: nwEnd, delta: nwDelta, deltaPct: nwDeltaPct },
    allocationChanges,
    topExpensesByCategory,
    topIndividualExpenses,
    bySubCategoryAllocation,
    dataQuality: {
      hasSnapshot,
      hasPreviousBaseline,
      hasCashflowData,
      isPartialMonth: true, // YTD is always partial by definition
      notes,
    },
  };
}

// ─── Total history builder ────────────────────────────────────────────────────

/**
 * Builds the context bundle for a total-history analysis, starting from the user's
 * configured cashflowHistoryStartYear setting (defaults to current year - 5 if not set).
 *
 * Baseline: first available snapshot at or after startYear
 * End: latest available snapshot
 * Cashflow: all transactions from Jan 1 of startYear to now
 *
 * selector.month = -2 signals "total history" period.
 *
 * @param userId - Firebase UID of the authenticated user
 * @param startYear - Year from which to begin the analysis (from settings)
 */
export async function buildAssistantHistoryContext(
  userId: string,
  startYear: number,
  includeDummySnapshots = false
): Promise<AssistantMonthContextBundle> {
  const now = new Date();
  const { year: currentYear, month: currentMonth } = getItalyMonthYear(now);

  const historyStart = new Date(startYear, 0, 1, 0, 0, 0);
  const historyEnd = new Date(currentYear, currentMonth, 0, 23, 59, 59);

  const [allSnapshots, historyExpenses, settings, assets] = await Promise.all([
    fetchSnapshots(userId),
    fetchExpenses(userId, historyStart, historyEnd),
    fetchSettings(userId),
    fetchAssets(userId),
  ]);

  // Filter to snapshots within the history window
  const windowSnapshots = allSnapshots.filter(
    (s) => s.year >= startYear && (!s.isDummy || includeDummySnapshots)
  );

  // Baseline = first snapshot in or after startYear
  const previousSnapshot = windowSnapshots.length > 0 ? windowSnapshots[0] : null;
  // End = latest snapshot overall
  const currentSnapshot = findLatestSnapshotAtOrBeforeYear(allSnapshots, currentYear, includeDummySnapshots);

  const hasSnapshot = currentSnapshot !== null;
  const hasPreviousBaseline = previousSnapshot !== null;
  const hasCashflowData = historyExpenses.length > 0;

  const yearsSpan = currentYear - startYear + 1;
  const notes: string[] = [
    `Analisi storica totale da ${startYear} ad oggi (${yearsSpan} anni). Anno corrente incluso (dati parziali).`,
  ];
  if (!hasSnapshot) {
    notes.push('Nessuno snapshot patrimoniale trovato nel periodo.');
  }

  const nwStart = previousSnapshot?.totalNetWorth ?? null;
  const nwEnd = currentSnapshot?.totalNetWorth ?? null;
  const nwDelta = nwStart !== null && nwEnd !== null ? nwEnd - nwStart : null;
  const nwDeltaPct =
    nwDelta !== null && nwStart !== null && nwStart !== 0
      ? (nwDelta / nwStart) * 100
      : null;

  const dividendCategoryId = settings?.dividendIncomeCategoryId;
  const { totalIncome, totalExpenses, totalDividends, netCashFlow } = aggregateCashflow(
    historyExpenses,
    dividendCategoryId
  );

  const { topExpensesByCategory, topIndividualExpenses } = buildExpenseBreakdown(historyExpenses);
  const allocationChanges = buildAllocationChanges(currentSnapshot, previousSnapshot);
  const bySubCategoryAllocation = buildSubCategoryAllocation(currentSnapshot, assets);

  // selector.month = -2 signals "total history" period
  return {
    selector: { year: startYear, month: -2 },
    currentSnapshot,
    previousSnapshot,
    cashflow: {
      totalIncome,
      totalExpenses,
      totalDividends,
      netCashFlow,
      transactionCount: historyExpenses.length,
    },
    netWorth: { start: nwStart, end: nwEnd, delta: nwDelta, deltaPct: nwDeltaPct },
    allocationChanges,
    topExpensesByCategory,
    topIndividualExpenses,
    bySubCategoryAllocation,
    dataQuality: {
      hasSnapshot,
      hasPreviousBaseline,
      hasCashflowData,
      isPartialMonth: true, // History includes current year — always partial
      notes,
    },
  };
}
