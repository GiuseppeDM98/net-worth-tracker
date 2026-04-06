/**
 * Assistant Month Context Builder (server-side, Admin SDK)
 *
 * Builds the AssistantMonthContextBundle for a given user + month selector.
 * Uses Firebase Admin SDK because this runs inside an API route — the client
 * Firestore SDK requires an authenticated browser session, which is not
 * available server-side.
 *
 * Design decisions:
 * - Never uses Date.getMonth() / getFullYear() for domain grouping — snapshots
 *   are identified by their stored `year`/`month` integer fields.
 * - Month-end date includes the full last day (23:59:59) so Firestore range
 *   queries capture every transaction recorded that day.
 * - Dummy snapshots are excluded because they are synthetic test fixtures that
 *   would distort real portfolio numbers.
 * - Dividends are separated from other income using dividendIncomeCategoryId
 *   from the user's settings, matching the pattern in performanceService.ts.
 * - allocationChanges is capped at the top 5 by absolute change to keep the
 *   context bundle lean for the prompt builder.
 */

import { Timestamp } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase/admin';
import { getItalyMonthYear, toDate } from '@/lib/utils/dateHelpers';
import { AssistantMonthContextBundle, AssistantMonthSelectorValue } from '@/types/assistant';
import { MonthlySnapshot } from '@/types/assets';
import { Expense } from '@/types/expenses';
import { AssetAllocationSettings } from '@/types/assets';

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
 * Finds a real (non-dummy) snapshot for the exact year/month.
 */
function findSnapshot(
  snapshots: MonthlySnapshot[],
  year: number,
  month: number
): MonthlySnapshot | null {
  return (
    snapshots.find((s) => s.year === year && s.month === month && !s.isDummy) ?? null
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
  } as AssetAllocationSettings;
}

// ─── Main builder ────────────────────────────────────────────────────────────

/**
 * Builds the full AssistantMonthContextBundle for the given user and month.
 *
 * Fetches all user snapshots, the month's cashflow, and settings in parallel
 * to minimise latency. Allocation changes are sorted by absolute value and
 * capped at MAX_ALLOCATION_CHANGES.
 *
 * @param userId - Firebase UID of the authenticated user
 * @param selector - The year/month to analyse
 * @returns A fully populated bundle; null-safe for missing snapshots or cashflow
 */
export async function buildAssistantMonthContext(
  userId: string,
  selector: AssistantMonthSelectorValue
): Promise<AssistantMonthContextBundle> {
  const { year, month } = selector;
  const { startDate, endDate } = getMonthDateRange(year, month);
  const { year: prevYear, month: prevMonth } = getPreviousMonth(year, month);

  // Fetch all snapshots, transactions for the month, and settings in parallel
  const [allSnapshots, monthExpenses, settings] = await Promise.all([
    fetchSnapshots(userId),
    fetchExpenses(userId, startDate, endDate),
    fetchSettings(userId),
  ]);

  const currentSnapshot = findSnapshot(allSnapshots, year, month);
  const previousSnapshot = findSnapshot(allSnapshots, prevYear, prevMonth);

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
  const nwDelta =
    nwStart !== null && nwEnd !== null ? nwEnd - nwStart : null;
  const nwDeltaPct =
    nwDelta !== null && nwStart !== null && nwStart !== 0
      ? (nwDelta / nwStart) * 100
      : null;

  // --- Cashflow breakdown ---
  // Income is stored positive; expenses are stored negative (sign convention from expenseService)
  const dividendCategoryId = settings?.dividendIncomeCategoryId;

  let totalIncome = 0;
  let totalExpenses = 0;
  let totalDividends = 0;

  for (const expense of monthExpenses) {
    if (expense.amount > 0) {
      // Positive amount = income; split dividends from regular income
      if (dividendCategoryId && expense.categoryId === dividendCategoryId) {
        totalDividends += expense.amount;
      } else {
        totalIncome += expense.amount;
      }
    } else {
      // Negative amount = expense/debt
      totalExpenses += expense.amount;
    }
  }

  const netCashFlow = totalIncome + totalDividends + totalExpenses;

  // --- Top expense categories ---
  // Group only negative-amount transactions by categoryName and sum their totals.
  // This gives Claude concrete spending drivers (e.g. "Alimentari -€420, 8 transazioni")
  // without listing every individual transaction, which would bloat the prompt.
  const expenseCategoryMap = new Map<string, { total: number; transactionCount: number }>();
  for (const expense of monthExpenses) {
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

  // Top 5 individual expenses sorted by absolute amount descending.
  // `notes` carries the expense description when present, giving Claude
  // enough context to name the transaction (e.g. "Canone mutuo").
  const topIndividualExpenses = monthExpenses
    .filter((e) => e.amount < 0)
    .sort((a, b) => a.amount - b.amount) // most negative first
    .slice(0, 5)
    .map((e) => ({
      categoryName: e.categoryName || e.categoryId,
      amount: e.amount,
      notes: (e as any).notes || undefined,
    }));

  // --- Allocation changes ---
  // Compare byAssetClass between current and previous snapshots.
  // We show absolute EUR changes, not percentage-of-portfolio changes.
  const allocationChanges: AssistantMonthContextBundle['allocationChanges'] = [];

  if (currentSnapshot) {
    const currentByClass = currentSnapshot.byAssetClass ?? {};
    const previousByClass = previousSnapshot?.byAssetClass ?? {};

    // Union of asset classes from both snapshots
    const assetClasses = new Set([
      ...Object.keys(currentByClass),
      ...Object.keys(previousByClass),
    ]);

    for (const assetClass of assetClasses) {
      const currentValue = currentByClass[assetClass] ?? 0;
      const previousValue = previousByClass[assetClass] ?? null;
      const absoluteChange = currentValue - (previousValue ?? 0);

      // Percentage-point change in portfolio allocation
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

    // Sort by absolute change descending, keep top 5
    allocationChanges.sort((a, b) => Math.abs(b.absoluteChange) - Math.abs(a.absoluteChange));
    allocationChanges.splice(MAX_ALLOCATION_CHANGES);
  }

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
    dataQuality: {
      hasSnapshot,
      hasPreviousBaseline,
      hasCashflowData,
      isPartialMonth,
      notes,
    },
  };
}
