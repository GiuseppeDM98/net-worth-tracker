/**
 * FIRE › Obiettivi — the numbers of the tab, read from the pure goal layer.
 *
 * The tab computes nothing: `goalTrajectory.ts` does the annuity math, `goalMath.ts` the progress
 * and the goal-derived allocation; this module CHOOSES what each tile shows of them — every goal
 * as one line in urgency order, the selected goal's trajectory with its series, the milestones,
 * the allocation the goals derive beside the one the quotas already hold, and the assignments
 * closed by the free shares — so a figure printed on the page can always be pointed at here and
 * pinned by a test. Words live in `goalsNarrative.ts`.
 *
 * Dates are carried as `{ year, month }`: a deadline is a calendar month typed by the user, and a
 * projection is «the month the target is reached» — neither needs a time of day, and reading the
 * ISO string directly keeps a deadline of «2029-06-30» in June whatever timezone renders it.
 *
 * `calculateAssetValue` is imported directly, the route `goalMath.ts` already takes (AGENTS.md →
 * FIRE, What If and Goals): the tests mock it as quantity × price.
 */

import type { Asset, AssetClass } from '@/types/assets';
import type { GoalAssetAssignment, GoalPriority, InvestmentGoal } from '@/types/goals';
import { calculateAssetValue } from '@/lib/services/assetService';
import { calculateGoalProgress, deriveTargetAllocationFromGoals } from '@/lib/utils/goalMath';
import {
  buildGoalProjectionSeries,
  sortGoalRowsByUrgency,
  type GoalProjectionPoint,
  type GoalRow,
  type GoalVerdict,
} from '@/lib/utils/goalTrajectory';
import { ASSET_CLASS_LABELS, assetClassSequenceIndex } from '@/lib/utils/allocationUtils';
import { getAssetDisplayTicker } from '@/lib/utils/assetDisplay';

// ─── Dates ────────────────────────────────────────────────────────────────────

/** A calendar month: the grain of a deadline and of a projected arrival. `month` is 1-12. */
export interface GoalDate {
  year: number;
  month: number;
}

/** The year and the month of an ISO date string, read as typed — never through a timezone. */
export function goalDateFromIso(iso: string): GoalDate | null {
  const match = /^(\d{4})-(\d{2})/.exec(iso);
  if (!match) return null;
  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;
  return { year: Number(match[1]), month };
}

/** The calendar month of a projected date (local time, like the projection that produced it). */
export function goalDateFromDate(date: Date): GoalDate {
  return { year: date.getFullYear(), month: date.getMonth() + 1 };
}

// ─── Every goal as one line (the Obiettivi tile) ─────────────────────────────

export interface GoalLine {
  id: string;
  name: string;
  color: string;
  priority: GoalPriority;
  verdict: GoalVerdict;
  currentValue: number;
  /** The target amount, null for an open goal. */
  targetAmount: number | null;
  /** What is still missing, null for an open goal (0 once reached). */
  remaining: number | null;
  /** Progress towards the target, uncapped, null for an open goal. */
  progressPct: number | null;
  deadline: GoalDate | null;
  /** Months from today to the deadline (0 when it has passed), null without one. */
  monthsToDeadline: number | null;
  plannedMonthly: number;
  /** The monthly pace the deadline requires, null without a deadline or a target. */
  requiredMonthly: number | null;
  /** When the target is reached at the current pace, null when never or not applicable. */
  projectedDate: GoalDate | null;
  monthsToTarget: number | null;
}

export interface GoalCounts {
  total: number;
  /** Everything not yet reached. */
  inProgress: number;
  reached: number;
  onTrack: number;
  offTrack: number;
  noDeadline: number;
  noTarget: number;
  /** Goals with a target AND a deadline, not yet reached — the only ones a verdict can judge. */
  dated: number;
}

export interface GoalsOverview {
  /** In urgency order: off track first, reached last (`sortGoalRowsByUrgency`). */
  goals: GoalLine[];
  counts: GoalCounts;
  /** The sum of the quotas assigned to every goal. */
  allocatedTotal: number;
  /** `allocatedTotal` as a share of the portfolio, null when the portfolio is worth nothing. */
  allocatedShare: number | null;
  /** Over the dated goals: the pace their deadlines require, and the pace planned today. */
  requiredMonthlyTotal: number;
  plannedMonthlyTotal: number;
}

function toGoalLine({ goal, progress, trajectory }: GoalRow): GoalLine {
  const targetAmount = goal.targetAmount != null && goal.targetAmount > 0 ? goal.targetAmount : null;
  return {
    id: goal.id,
    name: goal.name,
    color: goal.color,
    priority: goal.priority,
    verdict: trajectory.verdict,
    currentValue: progress.currentValue,
    targetAmount,
    remaining: targetAmount !== null ? Math.max(0, targetAmount - progress.currentValue) : null,
    progressPct: targetAmount !== null ? (progress.currentValue / targetAmount) * 100 : null,
    deadline: goal.targetDate ? goalDateFromIso(goal.targetDate) : null,
    monthsToDeadline: trajectory.monthsToDeadline,
    plannedMonthly: trajectory.currentMonthlyContribution,
    requiredMonthly: trajectory.requiredMonthlyContribution,
    projectedDate: trajectory.projectedDate ? goalDateFromDate(trajectory.projectedDate) : null,
    monthsToTarget: trajectory.monthsToTarget,
  };
}

const isDated = (line: GoalLine): boolean => line.verdict === 'onTrack' || line.verdict === 'offTrack';

/**
 * The page's overview: every goal as a line, the counts by verdict and the totals the Obiettivi
 * tile reads. `portfolioTotal` is the sum of the asset values (`sumAssetValues`), the same basis
 * as every quota, so the assigned share never mixes two valuations.
 */
export function summarizeGoals(rows: GoalRow[], portfolioTotal: number): GoalsOverview {
  const goals = sortGoalRowsByUrgency(rows).map(toGoalLine);
  const count = (verdict: GoalVerdict) => goals.filter((g) => g.verdict === verdict).length;
  const dated = goals.filter(isDated);
  const allocatedTotal = goals.reduce((sum, g) => sum + g.currentValue, 0);

  return {
    goals,
    counts: {
      total: goals.length,
      inProgress: goals.length - count('reached'),
      reached: count('reached'),
      onTrack: count('onTrack'),
      offTrack: count('offTrack'),
      noDeadline: count('noDeadline'),
      noTarget: count('noTarget'),
      dated: dated.length,
    },
    allocatedTotal,
    allocatedShare: portfolioTotal > 0 ? (allocatedTotal / portfolioTotal) * 100 : null,
    requiredMonthlyTotal: dated.reduce((sum, g) => sum + (g.requiredMonthly ?? 0), 0),
    plannedMonthlyTotal: dated.reduce((sum, g) => sum + g.plannedMonthly, 0),
  };
}

// ─── The selected goal (the Traiettoria tile) ────────────────────────────────

export interface TrajectoryAllocationShare {
  assetClass: AssetClass;
  label: string;
  pct: number;
}

export interface TrajectoryView {
  goalId: string;
  name: string;
  color: string;
  notes: string | null;
  verdict: GoalVerdict;
  currentValue: number;
  targetAmount: number | null;
  plannedMonthly: number;
  requiredMonthly: number | null;
  /** How much more per month the deadline asks than what is planned (0 when the plan covers it). */
  extraMonthly: number | null;
  /** The nominal annual return the projection compounds at, in percent. */
  annualReturn: number;
  deadline: GoalDate | null;
  monthsToDeadline: number | null;
  /** The value the current pace lands on at the deadline. */
  projectedAtDeadline: number | null;
  /** Target minus the projected value at the deadline: positive is a shortfall, negative a surplus. */
  gapAtDeadline: number | null;
  projectedDate: GoalDate | null;
  monthsToTarget: number | null;
  /** The recommended allocation the return is derived from, largest share first. */
  allocation: TrajectoryAllocationShare[];
  /** The glide path the chart draws, empty without a target. */
  series: GoalProjectionPoint[];
}

/** What the Traiettoria tile shows of one goal, with the series its chart draws. */
export function summarizeTrajectory({ goal, progress, trajectory }: GoalRow, now: Date): TrajectoryView {
  const targetAmount = goal.targetAmount != null && goal.targetAmount > 0 ? goal.targetAmount : null;
  const required = trajectory.requiredMonthlyContribution;
  const projectedAtDeadline = trajectory.projectedValueAtDeadline;

  const allocation = (Object.entries(goal.recommendedAllocation ?? {}) as [AssetClass, number | undefined][])
    .filter((entry): entry is [AssetClass, number] => (entry[1] ?? 0) > 0)
    .map(([assetClass, pct]) => ({ assetClass, label: ASSET_CLASS_LABELS[assetClass] ?? assetClass, pct }))
    .sort((a, b) => b.pct - a.pct);

  const series =
    targetAmount !== null
      ? buildGoalProjectionSeries({
          currentValue: progress.currentValue,
          targetAmount,
          targetDate: goal.targetDate,
          monthlyContribution: goal.monthlyContribution,
          annualReturn: trajectory.annualReturn,
          now,
        })
      : [];

  return {
    goalId: goal.id,
    name: goal.name,
    color: goal.color,
    notes: goal.notes?.trim() ? goal.notes.trim() : null,
    verdict: trajectory.verdict,
    currentValue: progress.currentValue,
    targetAmount,
    plannedMonthly: trajectory.currentMonthlyContribution,
    requiredMonthly: required,
    extraMonthly: required !== null ? Math.max(0, required - trajectory.currentMonthlyContribution) : null,
    annualReturn: trajectory.annualReturn,
    deadline: goal.targetDate ? goalDateFromIso(goal.targetDate) : null,
    monthsToDeadline: trajectory.monthsToDeadline,
    projectedAtDeadline,
    gapAtDeadline: projectedAtDeadline !== null && targetAmount !== null ? targetAmount - projectedAtDeadline : null,
    projectedDate: trajectory.projectedDate ? goalDateFromDate(trajectory.projectedDate) : null,
    monthsToTarget: trajectory.monthsToTarget,
    allocation,
    series,
  };
}

// ─── Milestones ───────────────────────────────────────────────────────────────

export type MilestoneKind = 'reached' | 'dated' | 'never';

export interface MilestoneEntry {
  goalId: string;
  name: string;
  color: string;
  kind: MilestoneKind;
  /** The projected arrival, null when reached or never. */
  date: GoalDate | null;
  deadline: GoalDate | null;
  /** How many months after its deadline the goal lands, null when in time or undated. */
  monthsPastDeadline: number | null;
}

/**
 * The order in which the goals with a target will be reached at today's pace: the reached ones
 * first, then the projected arrivals in order, then the goals the pace never reaches. A goal
 * that lands after its deadline keeps its PROJECTED date and carries the lateness — the deadline
 * is never shown as if it were an arrival (The Narrative Honesty Rule). Open goals have nothing
 * to reach and are not listed.
 */
export function buildMilestones(rows: GoalRow[]): MilestoneEntry[] {
  const entry = (row: GoalRow, kind: MilestoneKind, date: GoalDate | null, monthsPastDeadline: number | null): MilestoneEntry => ({
    goalId: row.goal.id,
    name: row.goal.name,
    color: row.goal.color,
    kind,
    date,
    deadline: row.goal.targetDate ? goalDateFromIso(row.goal.targetDate) : null,
    monthsPastDeadline,
  });

  const reached = rows.filter((r) => r.trajectory.verdict === 'reached').map((r) => entry(r, 'reached', null, null));
  const pending = rows.filter((r) => r.trajectory.verdict !== 'reached' && r.trajectory.verdict !== 'noTarget');

  const dated = pending
    .filter((r) => r.trajectory.projectedDate !== null && r.trajectory.monthsToTarget !== null)
    .sort((a, b) => a.trajectory.monthsToTarget! - b.trajectory.monthsToTarget!)
    .map((r) => {
      const { monthsToTarget, monthsToDeadline } = r.trajectory;
      const late = monthsToDeadline !== null && monthsToTarget! > monthsToDeadline ? monthsToTarget! - monthsToDeadline : null;
      return entry(r, 'dated', goalDateFromDate(r.trajectory.projectedDate!), late);
    });

  const never = pending.filter((r) => r.trajectory.projectedDate === null).map((r) => entry(r, 'never', null, null));

  return [...reached, ...dated, ...never];
}

// ─── The allocation the goals derive (the Allocazione derivata tile) ─────────

export interface DerivedAllocationRow {
  assetClass: AssetClass;
  label: string;
  /** The share the goals still to fill ask for (gap × priority weighting). */
  derivedPct: number;
  /** The share the assigned quotas actually hold, over everything assigned. */
  assignedPct: number;
}

export interface DerivedAllocationView {
  /** In the app's class sequence: every class either side names. */
  rows: DerivedAllocationRow[];
  assignedTotal: number;
}

/**
 * The target `deriveTargetAllocationFromGoals` produces — the one the Allocazione page uses when
 * goal-driven allocation is on — beside the allocation of what is assigned today, aggregated
 * across the goals by euro. Null when no goal has both a gap and a recommended allocation.
 */
export function summarizeDerivedAllocation(goals: InvestmentGoal[], assignments: GoalAssetAssignment[], assets: Asset[]): DerivedAllocationView | null {
  const derived = deriveTargetAllocationFromGoals(goals, assignments, assets);
  if (!derived) return null;

  const assignedByClass = new Map<AssetClass, number>();
  let assignedTotal = 0;
  for (const goal of goals) {
    const progress = calculateGoalProgress(goal, assignments, assets);
    assignedTotal += progress.currentValue;
    for (const [assetClass, pct] of Object.entries(progress.actualAllocation) as [AssetClass, number | undefined][]) {
      if (!pct) continue;
      assignedByClass.set(assetClass, (assignedByClass.get(assetClass) ?? 0) + (pct / 100) * progress.currentValue);
    }
  }

  const classes = new Set<AssetClass>([
    ...(Object.keys(derived) as AssetClass[]).filter((cls) => (derived[cls] ?? 0) > 0),
    ...assignedByClass.keys(),
  ]);

  const rows = [...classes]
    .sort((a, b) => assetClassSequenceIndex(a) - assetClassSequenceIndex(b))
    .map((assetClass) => ({
      assetClass,
      label: ASSET_CLASS_LABELS[assetClass] ?? assetClass,
      derivedPct: derived[assetClass] ?? 0,
      assignedPct: assignedTotal > 0 ? ((assignedByClass.get(assetClass) ?? 0) / assignedTotal) * 100 : 0,
    }));

  return { rows, assignedTotal };
}

// ─── Assignments (the Assegnazioni tile) ─────────────────────────────────────

export interface AssignmentRow {
  assetId: string;
  name: string;
  /** The display ticker, null when it would only repeat the name. */
  ticker: string | null;
  percentage: number;
  value: number;
}

export interface GoalAssignmentGroup {
  goalId: string;
  name: string;
  color: string;
  total: number;
  /** Largest quota first. */
  rows: AssignmentRow[];
}

export interface FreeShareRow {
  assetId: string;
  name: string;
  ticker: string | null;
  freePct: number;
  freeValue: number;
}

export interface AssignmentsView {
  /** One group per goal, in the order the goals were given. */
  groups: GoalAssignmentGroup[];
  /** Quotas whose asset still exists. */
  quotaCount: number;
  /** Distinct instruments with at least one quota. */
  instrumentCount: number;
  assignedTotal: number;
  /** Instruments with a free share worth listing, largest first. */
  free: FreeShareRow[];
  /** The free value over EVERY instrument, tiny remainders included — what the list adds up to. */
  freeTotal: number;
  /** `freeTotal` as a share of the portfolio, null when the portfolio is worth nothing. */
  freeShare: number | null;
  freeInstrumentCount: number;
  totalInstrumentCount: number;
  /** Instruments whose quotas add up past 100%. */
  overAssigned: { assetId: string; name: string; percentage: number }[];
}

/** A share below this is a rounding remainder, not a free quota worth a row. */
const FREE_SHARE_FLOOR = 0.5;

function displayTicker(asset: Asset): string | null {
  const ticker = getAssetDisplayTicker(asset);
  return ticker && ticker !== asset.name ? ticker : null;
}

/** The portfolio total on the same basis as every quota: the sum of the asset values. */
export function sumAssetValues(assets: Asset[]): number {
  return assets.reduce((sum, asset) => sum + calculateAssetValue(asset), 0);
}

/**
 * The quotas grouped by goal, closed by what every instrument still has free, so the tile adds
 * up to the portfolio. Orphaned quotas (an asset since deleted) are skipped, as `goalMath` does.
 */
export function summarizeAssignments(goals: InvestmentGoal[], assignments: GoalAssetAssignment[], assets: Asset[]): AssignmentsView {
  const assetMap = new Map(assets.map((asset) => [asset.id, asset]));
  const valueOf = new Map(assets.map((asset) => [asset.id, calculateAssetValue(asset)]));

  const groups: GoalAssignmentGroup[] = goals.map((goal) => {
    const rows = assignments
      .filter((a) => a.goalId === goal.id && assetMap.has(a.assetId))
      .map((a) => {
        const asset = assetMap.get(a.assetId)!;
        return { assetId: a.assetId, name: asset.name, ticker: displayTicker(asset), percentage: a.percentage, value: ((valueOf.get(a.assetId) ?? 0) * a.percentage) / 100 };
      })
      .sort((a, b) => b.value - a.value);
    return { goalId: goal.id, name: goal.name, color: goal.color, total: rows.reduce((sum, r) => sum + r.value, 0), rows };
  });

  const liveQuotas = assignments.filter((a) => assetMap.has(a.assetId));
  const assignedPctByAsset = new Map<string, number>();
  for (const quota of liveQuotas) {
    assignedPctByAsset.set(quota.assetId, (assignedPctByAsset.get(quota.assetId) ?? 0) + quota.percentage);
  }

  const free: FreeShareRow[] = [];
  const overAssigned: AssignmentsView['overAssigned'] = [];
  let freeTotal = 0;
  for (const asset of assets) {
    const assignedPct = assignedPctByAsset.get(asset.id) ?? 0;
    if (assignedPct > 100) overAssigned.push({ assetId: asset.id, name: asset.name, percentage: assignedPct });
    const freePct = Math.max(0, 100 - assignedPct);
    const freeValue = ((valueOf.get(asset.id) ?? 0) * freePct) / 100;
    freeTotal += freeValue;
    if (freePct > FREE_SHARE_FLOOR && freeValue > FREE_SHARE_FLOOR) {
      free.push({ assetId: asset.id, name: asset.name, ticker: displayTicker(asset), freePct, freeValue });
    }
  }
  free.sort((a, b) => b.freeValue - a.freeValue);

  const portfolioTotal = sumAssetValues(assets);

  return {
    groups,
    quotaCount: liveQuotas.length,
    instrumentCount: new Set(liveQuotas.map((a) => a.assetId)).size,
    assignedTotal: groups.reduce((sum, g) => sum + g.total, 0),
    free,
    freeTotal,
    freeShare: portfolioTotal > 0 ? (freeTotal / portfolioTotal) * 100 : null,
    freeInstrumentCount: free.length,
    totalInstrumentCount: assets.length,
    overAssigned,
  };
}
