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
 * A fifth builder, buildAssistantPeriodRangeContext, covers an arbitrary run of months
 * inside one year (quarters and semesters, which the four selector codes above cannot
 * express). It is the periodic emails' entry point — see its own doc comment for why the
 * window travels as a data-quality note rather than as a new bundle field.
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
import { MONTH_NAMES } from '@/lib/constants/months';
import { getItalyMonthYear, toDate } from '@/lib/utils/dateHelpers';
import { AssistantMonthContextBundle, AssistantMonthSelectorValue } from '@/types/assistant';
import { Asset, AssetAllocationSettings, MonthlySnapshot } from '@/types/assets';
import { CashflowBreakdown, Expense, ExpenseCategory } from '@/types/expenses';
import { GoalBasedInvestingData } from '@/types/goals';
import { buildCashflowBreakdown } from '@/lib/utils/expenseBreakdown';
import { calculateGoalProgress, deriveTargetAllocationFromGoals } from '@/lib/utils/goalMath';
import { computeGoalTrajectory } from '@/lib/utils/goalTrajectory';
import { getGoalDataAdmin } from '@/lib/server/goalData';

const MAX_ALLOCATION_CHANGES = 5;

// How many largest single expenses reach the prompt, by period length. A flat 5 used to
// apply to every period: five transactions out of five years of history is noise, while
// five out of one month is a real signal.
const TOP_INDIVIDUAL_EXPENSES_MONTH = 5;
const TOP_INDIVIDUAL_EXPENSES_YEAR = 10;
const TOP_INDIVIDUAL_EXPENSES_HISTORY = 15;

// Above this share of spending without a subcategory, the bundle declares the gap.
const UNCLASSIFIED_SUBCATEGORY_NOTE_THRESHOLD = 0.3;

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
  // Only the fields needed for context building — not the full settings shape.
  // targets is included so the prompt can show allocation target vs current gap;
  // the two goal flags decide whether the goals block exists at all and whether
  // those targets are still the ones the app measures against.
  return {
    dividendIncomeCategoryId: data.dividendIncomeCategoryId,
    cashflowHistoryStartYear: data.cashflowHistoryStartYear,
    targets: data.targets ?? null,
    goalBasedInvestingEnabled: data.goalBasedInvestingEnabled,
    goalDrivenAllocationEnabled: data.goalDrivenAllocationEnabled,
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

/**
 * Fetches the user's full expense category taxonomy, independent of the analysis period.
 */
async function fetchExpenseCategories(userId: string): Promise<ExpenseCategory[]> {
  const snap = await adminDb
    .collection('expenseCategories')
    .where('userId', '==', userId)
    .get();

  return snap.docs.map((doc) => {
    const data = doc.data();
    return { id: doc.id, ...data, subCategories: data.subCategories || [] } as ExpenseCategory;
  });
}

// ─── Shared helpers ──────────────────────────────────────────────────────────

/**
 * Flattens the user's category taxonomy into the shape the prompt builder needs.
 */
function buildCategoryTaxonomy(
  categories: ExpenseCategory[]
): AssistantMonthContextBundle['expenseCategories'] {
  return categories.map((category) => ({
    name: category.name,
    type: category.type,
    subCategories: category.subCategories.map((sub) => sub.name),
  }));
}

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
 * Normalises the user's AssetAllocationTarget into the flat bundle shape.
 *
 * subTargets stored in Firestore use two legacy formats:
 *   - number (old): percentage relative to the asset class
 *   - SubCategoryTarget (new): object with targetPercentage relative to the asset class
 * Both are normalised to a plain number here so prompt builders need no special-casing.
 *
 * Returns null when no targets are configured, so the prompt section is silently omitted.
 */
function buildManualTargetAllocation(
  settings: AssetAllocationSettings | null
): AssistantMonthContextBundle['targetAllocation'] {
  if (!settings?.targets) return null;

  const result: NonNullable<AssistantMonthContextBundle['targetAllocation']> = {};

  for (const [assetClass, config] of Object.entries(settings.targets)) {
    if (!config?.targetPercentage) continue;

    const subTargets: Record<string, number> = {};
    if (config.subTargets) {
      for (const [sub, val] of Object.entries(config.subTargets)) {
        subTargets[sub] = typeof val === 'number' ? val : (val as { targetPercentage: number }).targetPercentage;
      }
    }

    result[assetClass] = {
      targetPercentage: config.targetPercentage,
      ...(Object.keys(subTargets).length > 0 ? { subTargets } : {}),
    };
  }

  return Object.keys(result).length > 0 ? result : null;
}

/**
 * Rebuilds the flat target map from goal-derived asset-class percentages, keeping
 * whatever sub-category structure the user configured in Settings.
 *
 * Mirrors what `buildTargetsFromGoalAllocation` does for the Allocazione page — the
 * class percentages come from the goals, the sub-targets underneath them are still
 * the user's. Rebuilt here instead of imported because that function lives in
 * `assetAllocationService.ts`, which pulls the client Firestore SDK, and because the
 * bundle only needs this flat shape, not a full AssetAllocationTarget.
 */
function buildGoalDrivenTargetAllocation(
  derived: Partial<Record<string, number>>,
  manual: AssistantMonthContextBundle['targetAllocation']
): AssistantMonthContextBundle['targetAllocation'] {
  const result: NonNullable<AssistantMonthContextBundle['targetAllocation']> = {};

  for (const [assetClass, targetPercentage] of Object.entries(derived)) {
    if (!targetPercentage) continue;
    const subTargets = manual?.[assetClass]?.subTargets;
    result[assetClass] = {
      targetPercentage,
      ...(subTargets ? { subTargets } : {}),
    };
  }

  return Object.keys(result).length > 0 ? result : null;
}

/**
 * Builds the three goal-related bundle fields in one pass.
 *
 * They are produced together because they answer ONE question — is the portfolio
 * being steered by the goals or by the manual targets? Splitting them would let the
 * `goals` block say "goal-driven allocation on" while `targetAllocation` still
 * reported the manual numbers the app itself has stopped using.
 *
 * `goals` is null when the feature is off or the user has no goal document: a null
 * the prompt turns into an explicit "Goal-Based Investing non attivo" line, never a
 * silent absence (a model cannot tell an unused feature from missing data).
 */
function buildGoalFields(
  settings: AssetAllocationSettings | null,
  goalData: GoalBasedInvestingData | null,
  assets: Asset[],
  now: Date
): Pick<AssistantMonthContextBundle, 'goals' | 'targetAllocation' | 'targetAllocationSource'> {
  const manualTargets = buildManualTargetAllocation(settings);
  const isEnabled = settings?.goalBasedInvestingEnabled === true;
  const isGoalDriven = settings?.goalDrivenAllocationEnabled === true;

  if (!isEnabled || !goalData) {
    return {
      goals: null,
      targetAllocation: manualTargets,
      targetAllocationSource: 'manual',
    };
  }

  const items = goalData.goals.map((goal) => {
    const progress = calculateGoalProgress(goal, goalData.assignments, assets);
    const trajectory = computeGoalTrajectory({
      currentValue: progress.currentValue,
      targetAmount: goal.targetAmount,
      targetDate: goal.targetDate,
      monthlyContribution: goal.monthlyContribution,
      recommendedAllocation: goal.recommendedAllocation,
      now,
    });

    return {
      name: goal.name,
      priority: goal.priority,
      currentValue: progress.currentValue,
      verdict: trajectory.verdict,
      // Only dated goals with a target have a trajectory to project. Carrying the
      // required pace is what lets the assistant answer "di quanto sono in ritardo"
      // with a number instead of computing one itself — which the data rules forbid.
      ...(trajectory.requiredMonthlyContribution != null
        ? {
            requiredMonthlyContribution: trajectory.requiredMonthlyContribution,
            assumedAnnualReturn: trajectory.annualReturn,
          }
        : {}),
      ...(trajectory.projectedValueAtDeadline != null
        ? { projectedValueAtDeadline: trajectory.projectedValueAtDeadline }
        : {}),
      ...(goal.targetAmount != null ? { targetAmount: goal.targetAmount } : {}),
      ...(goal.targetDate != null ? { targetDateIso: goal.targetDate } : {}),
      ...(goal.monthlyContribution != null ? { monthlyContribution: goal.monthlyContribution } : {}),
      ...(goal.recommendedAllocation != null ? { recommendedAllocation: goal.recommendedAllocation } : {}),
    };
  });

  // The Allocazione page overrides the manual targets only when the derivation
  // actually produces something; falling back to the manual ones keeps the two
  // surfaces reporting the same target.
  const derived = isGoalDriven
    ? deriveTargetAllocationFromGoals(goalData.goals, goalData.assignments, assets)
    : null;
  const goalDrivenTargets = derived ? buildGoalDrivenTargetAllocation(derived, manualTargets) : null;

  return {
    goals: {
      enabled: true,
      goalDrivenAllocationEnabled: isGoalDriven,
      items,
    },
    targetAllocation: goalDrivenTargets ?? manualTargets,
    targetAllocationSource: goalDrivenTargets ? 'goal_driven' : 'manual',
  };
}

/**
 * Maps the pure breakdown onto the bundle fields it feeds.
 *
 * Exists so the five period builders don't each spell out the same assignments —
 * and, more to the point, so they cannot drift apart. Every cashflow figure in the
 * bundle now comes from one call to one aggregator.
 */
function toBundleCashflowFields(
  breakdown: CashflowBreakdown
): Pick<
  AssistantMonthContextBundle,
  'cashflow' | 'expensesByCategory' | 'incomeByCategory' | 'expensesByType' | 'topIndividualExpenses'
> {
  return {
    cashflow: { ...breakdown.totals },
    expensesByCategory: breakdown.expensesByCategory,
    incomeByCategory: breakdown.incomeByCategory,
    expensesByType: breakdown.expensesByType,
    topIndividualExpenses: breakdown.topIndividualExpenses,
  };
}

/**
 * Returns a data-quality note when most of the period's spending carries no subcategory.
 *
 * Historical months often predate the user's subcategory habit, so "Senza sottocategoria"
 * can legitimately dominate the breakdown. Saying so turns what reads like a broken
 * report into a stated limitation.
 */
function buildUnclassifiedSubCategoryNote(share: number): string | null {
  if (share <= UNCLASSIFIED_SUBCATEGORY_NOTE_THRESHOLD) return null;
  return `Il ${Math.round(share * 100)}% delle spese del periodo non ha una sottocategoria assegnata: il dettaglio per sottocategoria è parziale per costruzione.`;
}

/**
 * Point-in-time patrimony over a window: the baseline snapshot vs the closing one.
 *
 * Extracted verbatim from the four period builders, which each carried the same eight
 * lines. `null` propagates on purpose — a missing snapshot at either end makes the delta
 * unknowable, and a zero baseline would report the whole patrimony as this period's gain.
 */
function buildNetWorthFields(
  previousSnapshot: MonthlySnapshot | null,
  currentSnapshot: MonthlySnapshot | null
): AssistantMonthContextBundle['netWorth'] {
  const start = previousSnapshot?.totalNetWorth ?? null;
  const end = currentSnapshot?.totalNetWorth ?? null;
  const delta = start !== null && end !== null ? end - start : null;
  const deltaPct = delta !== null && start !== null && start !== 0 ? (delta / start) * 100 : null;
  return { start, end, delta, deltaPct };
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
  const [allSnapshots, monthExpenses, settings, assets, categories, goalData] = await Promise.all([
    fetchSnapshots(userId),
    fetchExpenses(userId, startDate, endDate),
    fetchSettings(userId),
    fetchAssets(userId),
    fetchExpenseCategories(userId),
    getGoalDataAdmin(userId),
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

  // --- Cashflow: totals and breakdowns, single pass ---
  const breakdown = buildCashflowBreakdown(monthExpenses, {
    dividendCategoryId: settings?.dividendIncomeCategoryId,
    topIndividualLimit: TOP_INDIVIDUAL_EXPENSES_MONTH,
  });
  const unclassifiedNote = buildUnclassifiedSubCategoryNote(breakdown.unclassifiedSubCategoryShare);
  if (unclassifiedNote) notes.push(unclassifiedNote);

  const allocationChanges = buildAllocationChanges(currentSnapshot, previousSnapshot);
  const bySubCategoryAllocation = buildSubCategoryAllocation(currentSnapshot, assets);
  const goalFields = buildGoalFields(settings, goalData, assets, now);

  return {
    selector,
    currentSnapshot,
    previousSnapshot,
    ...toBundleCashflowFields(breakdown),
    netWorth: buildNetWorthFields(previousSnapshot, currentSnapshot),
    allocationChanges,
    bySubCategoryAllocation,
    ...goalFields,
    expenseCategories: buildCategoryTaxonomy(categories),
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

  const [allSnapshots, yearExpenses, settings, assets, categories, goalData] = await Promise.all([
    fetchSnapshots(userId),
    fetchExpenses(userId, yearStart, yearEnd),
    fetchSettings(userId),
    fetchAssets(userId),
    fetchExpenseCategories(userId),
    getGoalDataAdmin(userId),
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

  const breakdown = buildCashflowBreakdown(yearExpenses, {
    dividendCategoryId: settings?.dividendIncomeCategoryId,
    topIndividualLimit: TOP_INDIVIDUAL_EXPENSES_YEAR,
  });
  const unclassifiedNote = buildUnclassifiedSubCategoryNote(breakdown.unclassifiedSubCategoryShare);
  if (unclassifiedNote) notes.push(unclassifiedNote);

  const allocationChanges = buildAllocationChanges(currentSnapshot, previousSnapshot);
  const bySubCategoryAllocation = buildSubCategoryAllocation(currentSnapshot, assets);
  const goalFields = buildGoalFields(settings, goalData, assets, now);

  // selector.month = 0 signals "year-level" period to prompt builders and the context card
  return {
    selector: { year, month: 0 },
    currentSnapshot,
    previousSnapshot,
    ...toBundleCashflowFields(breakdown),
    netWorth: buildNetWorthFields(previousSnapshot, currentSnapshot),
    allocationChanges,
    bySubCategoryAllocation,
    ...goalFields,
    expenseCategories: buildCategoryTaxonomy(categories),
    dataQuality: {
      hasSnapshot,
      hasPreviousBaseline,
      hasCashflowData,
      isPartialMonth: isCurrentYear,
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

  const [allSnapshots, ytdExpenses, settings, assets, categories, goalData] = await Promise.all([
    fetchSnapshots(userId),
    fetchExpenses(userId, ytdStart, ytdEnd),
    fetchSettings(userId),
    fetchAssets(userId),
    fetchExpenseCategories(userId),
    getGoalDataAdmin(userId),
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

  const breakdown = buildCashflowBreakdown(ytdExpenses, {
    dividendCategoryId: settings?.dividendIncomeCategoryId,
    topIndividualLimit: TOP_INDIVIDUAL_EXPENSES_YEAR,
  });
  const unclassifiedNote = buildUnclassifiedSubCategoryNote(breakdown.unclassifiedSubCategoryShare);
  if (unclassifiedNote) notes.push(unclassifiedNote);

  const allocationChanges = buildAllocationChanges(currentSnapshot, previousSnapshot);
  const bySubCategoryAllocation = buildSubCategoryAllocation(currentSnapshot, assets);
  const goalFields = buildGoalFields(settings, goalData, assets, now);

  // selector.month = -1 signals "YTD" period
  return {
    selector: { year: currentYear, month: -1 },
    currentSnapshot,
    previousSnapshot,
    ...toBundleCashflowFields(breakdown),
    netWorth: buildNetWorthFields(previousSnapshot, currentSnapshot),
    allocationChanges,
    bySubCategoryAllocation,
    ...goalFields,
    expenseCategories: buildCategoryTaxonomy(categories),
    dataQuality: {
      hasSnapshot,
      hasPreviousBaseline,
      hasCashflowData,
      isPartialMonth: true, // YTD is always partial by definition
      notes,
    },
  };
}

// ─── Arbitrary month-window builder (quarters, semesters, email periods) ──────

/** A run of consecutive months inside one calendar year, plus the name it goes by. */
export interface AssistantPeriodRange {
  year: number;
  /** First month of the window (1-12, inclusive). */
  startMonth: number;
  /** Last month of the window (1-12, inclusive); must not precede startMonth. */
  endMonth: number;
  /** What the window is called: "Q3 2026", "2° Semestre 2026", "Luglio 2026", "Anno 2026". */
  label: string;
}

/**
 * Builds the context bundle for an arbitrary run of months inside one year.
 *
 * Exists because the four selector codes cannot express a quarter or a semester, which is
 * exactly what the periodic emails send. The window rules are the other builders' rules:
 *
 *   Patrimonio: point-in-time, baseline = snapshot of the month BEFORE `startMonth`
 *               (year wrap included), closing = snapshot of `endMonth`. That baseline is
 *               deliberately the same one the email's own `previousNetWorth` uses, so the
 *               bundle and the email cannot disagree about Δ patrimonio.
 *   Flussi:     every expense dated inside the window, through the ONE aggregator
 *               (buildCashflowBreakdown) — never a second cashflow computation.
 *
 * WHY THE LABEL IS A NOTE AND NOT A FIELD
 * `AssistantMonthContextBundle` has no periodLabel, and adding one would be a required
 * field the four existing builders would all have to fill. The window instead travels the
 * way the YTD and history builders already declare theirs: as the first data-quality note,
 * which is text the model reads. Callers that render a header (the prompt builders) pass
 * the same label to `formatBundleForPrompt`, because `selector` — pinned to the window's
 * CLOSING month, the month whose snapshot the figures rest on — would otherwise print
 * "Settembre 2026" over a whole quarter.
 *
 * @param userId  Firebase UID of the account being analysed
 * @param range   The window and its label
 * @throws When the window is not a valid run of months inside one year
 */
export async function buildAssistantPeriodRangeContext(
  userId: string,
  range: AssistantPeriodRange,
  includeDummySnapshots = false
): Promise<AssistantMonthContextBundle> {
  const { year, startMonth, endMonth, label } = range;

  // Fail at the boundary: a reversed window would silently query an empty range and
  // report a period with no data instead of a bug.
  if (
    !Number.isInteger(startMonth) ||
    !Number.isInteger(endMonth) ||
    startMonth < 1 ||
    endMonth > 12 ||
    startMonth > endMonth
  ) {
    throw new Error(
      `buildAssistantPeriodRangeContext: invalid window ${startMonth}-${endMonth} for ${year}`
    );
  }

  const windowStart = new Date(year, startMonth - 1, 1, 0, 0, 0);
  const windowEnd = new Date(year, endMonth, 0, 23, 59, 59);
  const baseline = getPreviousMonth(year, startMonth);

  const [allSnapshots, windowExpenses, settings, assets, categories, goalData] = await Promise.all([
    fetchSnapshots(userId),
    fetchExpenses(userId, windowStart, windowEnd),
    fetchSettings(userId),
    fetchAssets(userId),
    fetchExpenseCategories(userId),
    getGoalDataAdmin(userId),
  ]);

  const currentSnapshot = findSnapshot(allSnapshots, year, endMonth, includeDummySnapshots);
  const previousSnapshot = findSnapshot(
    allSnapshots,
    baseline.year,
    baseline.month,
    includeDummySnapshots
  );

  const now = new Date();
  const { month: italyCurrentMonth, year: italyCurrentYear } = getItalyMonthYear(now);
  // The window is still open while its closing month has not ended.
  const isWindowInProgress =
    year > italyCurrentYear || (year === italyCurrentYear && endMonth >= italyCurrentMonth);

  const hasSnapshot = currentSnapshot !== null;
  const hasPreviousBaseline = previousSnapshot !== null;
  const hasCashflowData = windowExpenses.length > 0;

  const monthCount = endMonth - startMonth + 1;
  const windowMonths = `${MONTH_NAMES[startMonth - 1]}-${MONTH_NAMES[endMonth - 1]} ${year}`;
  const notes: string[] = [
    monthCount === 1
      ? `Finestra di analisi: ${label} (${MONTH_NAMES[startMonth - 1]} ${year}), 1 mese.`
      : `Finestra di analisi: ${label} (${windowMonths}), ${monthCount} mesi.`,
  ];

  if (!hasSnapshot && hasCashflowData) {
    notes.push(
      `Snapshot patrimoniale di fine ${MONTH_NAMES[endMonth - 1]} non presente: patrimonio finale non consolidato.`
    );
  }
  if (!hasSnapshot && !hasCashflowData) {
    notes.push(`Nessun dato disponibile per ${label}.`);
  }
  if (hasSnapshot && !hasPreviousBaseline) {
    notes.push(
      `Nessuno snapshot patrimoniale prima dell'inizio della finestra (${MONTH_NAMES[baseline.month - 1]} ${baseline.year}): variazione del patrimonio non calcolabile.`
    );
  }

  // Which months inside the window have no photograph of their own. The window's own
  // figures survive (they rest on the two ends), but a month-by-month reading of the
  // patrimony does not — and saying which months are missing is what keeps the model from
  // treating the gap as a flat stretch.
  const monthsWithoutSnapshot: string[] = [];
  for (let month = startMonth; month <= endMonth; month += 1) {
    if (!findSnapshot(allSnapshots, year, month, includeDummySnapshots)) {
      monthsWithoutSnapshot.push(MONTH_NAMES[month - 1]);
    }
  }
  if (monthsWithoutSnapshot.length > 0 && monthsWithoutSnapshot.length < monthCount) {
    notes.push(
      `Mesi della finestra senza snapshot patrimoniale: ${monthsWithoutSnapshot.join(', ')}. Il patrimonio è misurato solo su inizio e fine finestra.`
    );
  }
  if (isWindowInProgress) {
    notes.push(`${label} non è ancora concluso: i dati del periodo sono parziali.`);
  }

  const breakdown = buildCashflowBreakdown(windowExpenses, {
    dividendCategoryId: settings?.dividendIncomeCategoryId,
    // One month is one month, whatever the caller calls the window; anything longer gets
    // the wider list, like the year builder.
    topIndividualLimit: monthCount === 1 ? TOP_INDIVIDUAL_EXPENSES_MONTH : TOP_INDIVIDUAL_EXPENSES_YEAR,
  });
  const unclassifiedNote = buildUnclassifiedSubCategoryNote(breakdown.unclassifiedSubCategoryShare);
  if (unclassifiedNote) notes.push(unclassifiedNote);

  return {
    // The closing month, which is where the patrimony figures are photographed. The window
    // itself is named in the notes and in the label the caller passes to the prompt.
    selector: { year, month: endMonth },
    currentSnapshot,
    previousSnapshot,
    ...toBundleCashflowFields(breakdown),
    netWorth: buildNetWorthFields(previousSnapshot, currentSnapshot),
    allocationChanges: buildAllocationChanges(currentSnapshot, previousSnapshot),
    bySubCategoryAllocation: buildSubCategoryAllocation(currentSnapshot, assets),
    ...buildGoalFields(settings, goalData, assets, now),
    expenseCategories: buildCategoryTaxonomy(categories),
    dataQuality: {
      hasSnapshot,
      hasPreviousBaseline,
      hasCashflowData,
      isPartialMonth: isWindowInProgress,
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

  const [allSnapshots, historyExpenses, settings, assets, categories, goalData] = await Promise.all([
    fetchSnapshots(userId),
    fetchExpenses(userId, historyStart, historyEnd),
    fetchSettings(userId),
    fetchAssets(userId),
    fetchExpenseCategories(userId),
    getGoalDataAdmin(userId),
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

  const breakdown = buildCashflowBreakdown(historyExpenses, {
    dividendCategoryId: settings?.dividendIncomeCategoryId,
    topIndividualLimit: TOP_INDIVIDUAL_EXPENSES_HISTORY,
  });
  const unclassifiedNote = buildUnclassifiedSubCategoryNote(breakdown.unclassifiedSubCategoryShare);
  if (unclassifiedNote) notes.push(unclassifiedNote);

  const allocationChanges = buildAllocationChanges(currentSnapshot, previousSnapshot);
  const bySubCategoryAllocation = buildSubCategoryAllocation(currentSnapshot, assets);
  const goalFields = buildGoalFields(settings, goalData, assets, now);

  // selector.month = -2 signals "total history" period
  return {
    selector: { year: startYear, month: -2 },
    currentSnapshot,
    previousSnapshot,
    ...toBundleCashflowFields(breakdown),
    netWorth: buildNetWorthFields(previousSnapshot, currentSnapshot),
    allocationChanges,
    bySubCategoryAllocation,
    ...goalFields,
    expenseCategories: buildCategoryTaxonomy(categories),
    dataQuality: {
      hasSnapshot,
      hasPreviousBaseline,
      hasCashflowData,
      isPartialMonth: true, // History includes current year — always partial
      notes,
    },
  };
}
