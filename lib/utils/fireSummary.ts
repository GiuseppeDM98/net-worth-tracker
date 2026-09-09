/**
 * FIRE › Calcolatore — the numbers of the page, read from results the tab already computes.
 *
 * The tab runs the projection (`calculateFIREProjection`), the metrics (`calculateFIREMetrics`,
 * with the bridge override when the pension lock is on), the pension lock state
 * (`resolvePensionLockState`) and, on demand, the fan (`runAccumulationSimulation`). This
 * module turns those results into the shapes the tiles and the narrative read — a target with
 * its progress and gap, the base scenario as a timeline, the three scenarios as rows, the
 * passive income today, the lock as the page states it, the fan's one verdict — so that no
 * component ever derives a figure on its own. Nothing here re-runs a projection: a figure that
 * needs the walk comes from the walk's own output (`yearlyData`).
 *
 * Pure and Firestore-free; `lib/utils/fireNarrative.ts` puts these numbers into words.
 */

import type { FIREMetrics } from '@/lib/services/fireService';
import type { AccumulationSimulationResult } from '@/lib/services/monteCarloService';
import type { PensionLockState } from '@/lib/utils/pensionUnlock';
import type { FIREProjectionResult } from '@/types/assets';

// ─── Target ───────────────────────────────────────────────────────────────────

export interface FireTarget {
  /** The number the page runs on: the bridge number when the pension lock is active. */
  fireNumber: number;
  /** Expenses ÷ SWR — equal to `fireNumber` without the bridge. */
  standardFireNumber: number;
  isBridge: boolean;
  /** The FIRE-eligible net worth (residence per setting, locked pension capital subtracted). */
  netWorth: number;
  /** `netWorth / fireNumber × 100`, not clamped: a reached target reads above 100. */
  progressPct: number;
  /** `max(0, fireNumber − netWorth)`. */
  gap: number;
  reached: boolean;
}

/**
 * The target as the page reads it. `null` when there is no FIRE number — no expenses recorded
 * for the reference year — so the verdict can say so instead of printing «0 €».
 */
export function summarizeTarget(metrics: FIREMetrics, isBridge: boolean): FireTarget | null {
  if (metrics.fireNumber <= 0) return null;
  const wrDecimal = metrics.withdrawalRate / 100;
  const standardFireNumber = wrDecimal > 0 ? metrics.annualExpenses / wrDecimal : metrics.fireNumber;
  const netWorth = metrics.currentNetWorth;
  return {
    fireNumber: metrics.fireNumber,
    standardFireNumber,
    isBridge,
    netWorth,
    progressPct: (netWorth / metrics.fireNumber) * 100,
    gap: Math.max(0, metrics.fireNumber - netWorth),
    reached: netWorth >= metrics.fireNumber,
  };
}

// ─── Timeline (base scenario) ─────────────────────────────────────────────────

export interface FireTimeline {
  /** Years to FIRE in the base scenario; null = not within the projection horizon. */
  yearsToFire: number | null;
  calendarYear: number | null;
  /** `userAge + yearsToFire`; null without a user age or a year. */
  ageAtFire: number | null;
  horizonYears: number;
  horizonCalendarYear: number;
  /** The expenses the projection starts from, per month (today's money). */
  monthlyExpensesToday: number;
  /** The base scenario's inflated expenses at the FIRE year, per month — nominal, in that year's euro. */
  monthlyExpensesAtFire: number | null;
  growthRate: number;
  inflationRate: number;
}

/** The base scenario's answer to «quando?», with the figures the verdict names around it. */
export function summarizeTimeline(
  projection: FIREProjectionResult,
  currentYear: number,
  userAge: number | undefined,
  horizonYears = 50,
): FireTimeline {
  const years = projection.baseYearsToFIRE;
  // `yearlyData[years − 1]` is the FIRE year's row: the walk pushes one row per year, from 1.
  const fireYearRow = years !== null ? projection.yearlyData[years - 1] : undefined;
  return {
    yearsToFire: years,
    calendarYear: years !== null ? currentYear + years : null,
    ageAtFire: years !== null && userAge !== undefined && Number.isFinite(userAge) ? userAge + years : null,
    horizonYears,
    horizonCalendarYear: currentYear + horizonYears,
    monthlyExpensesToday: projection.initialExpenses / 12,
    monthlyExpensesAtFire: fireYearRow ? fireYearRow.baseExpenses / 12 : null,
    growthRate: projection.scenarios.base.growthRate,
    inflationRate: projection.scenarios.base.inflationRate,
  };
}

// ─── Scenarios ────────────────────────────────────────────────────────────────

export type ScenarioKey = 'bear' | 'base' | 'bull';

export interface ScenarioRow {
  key: ScenarioKey;
  label: 'Orso' | 'Base' | 'Toro';
  yearsToFire: number | null;
  calendarYear: number | null;
  growthRate: number;
  inflationRate: number;
}

const SCENARIO_LABELS: Record<ScenarioKey, ScenarioRow['label']> = { bear: 'Orso', base: 'Base', bull: 'Toro' };

/** The three scenarios as rows, bear · base · bull, each with its year and its parameters. */
export function summarizeScenarios(projection: FIREProjectionResult, currentYear: number): ScenarioRow[] {
  const years: Record<ScenarioKey, number | null> = {
    bear: projection.bearYearsToFIRE,
    base: projection.baseYearsToFIRE,
    bull: projection.bullYearsToFIRE,
  };
  return (['bear', 'base', 'bull'] as const).map((key) => ({
    key,
    label: SCENARIO_LABELS[key],
    yearsToFire: years[key],
    calendarYear: years[key] !== null ? currentYear + (years[key] as number) : null,
    growthRate: projection.scenarios[key].growthRate,
    inflationRate: projection.scenarios[key].inflationRate,
  }));
}

// ─── Passive income today ─────────────────────────────────────────────────────

export interface PassiveIncome {
  annual: number;
  monthly: number;
  daily: number;
  /** The annual allowance as a share of the annual expenses; null without expenses. */
  shareOfExpensesPct: number | null;
  yearsOfExpenses: number;
  liquidYears: number;
  illiquidYears: number;
  /** Expenses ÷ net worth, in %. */
  currentWR: number;
  swr: number;
  /** The current withdrawal exceeds the safe rate — the one figure that earns a sign colour. */
  overSwr: boolean;
}

/** «Quanto potrei prelevare oggi?» — the allowance at the SWR and what it covers. */
export function summarizePassiveIncome(metrics: FIREMetrics): PassiveIncome {
  return {
    annual: metrics.annualAllowance,
    monthly: metrics.monthlyAllowance,
    daily: metrics.dailyAllowance,
    shareOfExpensesPct: metrics.annualExpenses > 0 ? (metrics.annualAllowance / metrics.annualExpenses) * 100 : null,
    yearsOfExpenses: metrics.yearsOfExpenses,
    liquidYears: metrics.liquidYearsOfExpenses,
    illiquidYears: metrics.illiquidYearsOfExpenses,
    currentWR: metrics.currentWR,
    swr: metrics.withdrawalRate,
    overSwr: metrics.annualExpenses > 0 && metrics.currentWR > metrics.withdrawalRate,
  };
}

// ─── Pension lock ─────────────────────────────────────────────────────────────

export type LockSource = 'rita' | 'override' | 'mixed';

export interface FireLock {
  /** The `respectPensionLockInFire` toggle. */
  active: boolean;
  /** Sum of the funds locked today (0 when the toggle is off or nothing is locked). */
  lockedValue: number;
  /** The LATEST unlock year across the locked funds — the year the bridge model aggregates on. */
  unlockCalendarYear: number | null;
  /** The RITA age, only when every locked fund follows the rule. */
  unlockAge: number | null;
  source: LockSource | null;
  lockedFundCount: number;
  /** Funds with neither an override nor a user age: treated as NOT locked, and the page says so. */
  unmodellableCount: number;
}

export const INACTIVE_LOCK: FireLock = {
  active: false,
  lockedValue: 0,
  unlockCalendarYear: null,
  unlockAge: null,
  source: null,
  lockedFundCount: 0,
  unmodellableCount: 0,
};

function hasUnlockOverride(fund: PensionLockState['funds'][number]['fund']): boolean {
  const override = fund.pensionFundDetails?.unlockDate;
  return !!override && !Number.isNaN(new Date(override).getTime());
}

/**
 * The lock as the page states it. `state` is null when the toggle is off. The unlock year is
 * the latest inflow year (the bridge aggregates multi-fund unlocks on the latest one, AGENTS →
 * FIRE); the source tells whether that date comes from the RITA rule, a per-fund override, or
 * both, so the caption can say which.
 */
export function summarizeLock(
  state: PensionLockState | null,
  opts: { currentYear: number; ritaUnlockAge: number; now?: Date },
): FireLock {
  if (!state) return INACTIVE_LOCK;
  const locked = state.funds.filter((info) => info.isLocked);
  const overrideCount = locked.filter((info) => hasUnlockOverride(info.fund)).length;
  const source: LockSource | null =
    locked.length === 0 ? null : overrideCount === 0 ? 'rita' : overrideCount === locked.length ? 'override' : 'mixed';
  const latestYears = state.inflows.length > 0 ? Math.max(...state.inflows.map((inflow) => inflow.yearsFromNow)) : null;
  return {
    active: true,
    lockedValue: state.totalLockedToday,
    unlockCalendarYear: latestYears !== null ? opts.currentYear + latestYears : null,
    unlockAge: source === 'rita' ? opts.ritaUnlockAge : null,
    source,
    lockedFundCount: locked.length,
    unmodellableCount: state.funds.filter((info) => info.unlockDate === null).length,
  };
}

// ─── The fan's verdict ────────────────────────────────────────────────────────

export interface FanVerdict {
  calendarYear: number;
  /** Cumulative share of paths that reached FIRE by `calendarYear`, rounded. */
  probabilityPct: number;
  /** True when the year is the simulation's horizon rather than the deterministic FIRE year. */
  onHorizon: boolean;
}

/**
 * The one number the deterministic projection cannot give: the probability of FIRE by the
 * base scenario's year. Anchored on that year when it exists and lies inside the simulated
 * horizon; otherwise on the horizon, and `onHorizon` lets the copy say so.
 */
export function resolveFanVerdict(
  result: AccumulationSimulationResult,
  deterministicBaseYears: number | null,
  startCalendarYear: number,
): FanVerdict {
  const lastIndex = result.percentiles.length - 1;
  const onHorizon = deterministicBaseYears === null || deterministicBaseYears > lastIndex;
  const index = onHorizon ? lastIndex : (deterministicBaseYears as number);
  return {
    calendarYear: startCalendarYear + index,
    probabilityPct: Math.round(result.percentiles[index]?.fireProbability ?? 0),
    onHorizon,
  };
}

/** «62% azioni, 28% obbligazioni, 10% immobili» — the fan's market exposure, zero classes dropped. */
export function formatAllocationLabel(allocation: {
  equityPercentage: number;
  bondsPercentage: number;
  realEstatePercentage: number;
  commoditiesPercentage: number;
}): string {
  return [
    [allocation.equityPercentage, 'azioni'],
    [allocation.bondsPercentage, 'obbligazioni'],
    [allocation.realEstatePercentage, 'immobili'],
    [allocation.commoditiesPercentage, 'materie prime'],
  ]
    .filter(([share]) => (share as number) > 0)
    .map(([share, label]) => `${share}% ${label}`)
    .join(', ');
}
