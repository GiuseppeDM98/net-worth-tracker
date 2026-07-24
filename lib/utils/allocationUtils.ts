/**
 * Pure helpers for the Allocation feature.
 *
 * This module is the testable core of the Allocazione page: every function here
 * is a pure transform over the `AllocationResult` shape produced by
 * `compareAllocations` (lib/services/assetAllocationService.ts). It deliberately
 * imports NOTHING from the service/Firebase layer so the unit tests can import it
 * without mocking `@/lib/firebase/config`.
 *
 * Two ideas drive the new design and live here as pure functions:
 *   1. Rebalance BAND — the ±band that decides COMPRA / VENDI / OK. The server
 *      bakes a fixed ±2 p.p. band into `action`; we re-derive `action` client-side
 *      so the band can be tuned (fixed % or the classic "5/25" rule) without a
 *      round-trip. Default band = 2 p.p. → identical to the server output.
 *   2. SYNTHESIS — the page's job is "am I balanced and what do I do?". The verdict
 *      (`summarizeBalance`), the trade list (`buildRebalancePlan`) and the no-sell
 *      contribution split (`allocateContribution`) are all derived from the same
 *      `byAssetClass` map — no new data, just better questions answered.
 */

import type {
  AllocationData,
  AllocationResult,
  AllocationRole,
  Asset,
  AssetAllocationTarget,
} from '@/types/assets';

export type AllocationAction = 'COMPRA' | 'VENDI' | 'OK';

/** Italian labels for the six asset classes. Local to the feature; other label
 *  maps exist elsewhere (email, history) but consolidating them is out of scope. */
export const ASSET_CLASS_LABELS: Record<string, string> = {
  equity: 'Azioni',
  bonds: 'Obbligazioni',
  crypto: 'Criptovalute',
  realestate: 'Immobili',
  cash: 'Liquidità',
  commodity: 'Materie Prime',
  trendFollowing: 'Trend Following',
  carry: 'Carry',
};

// ---------------------------------------------------------------------------
// Rebalance band
// ---------------------------------------------------------------------------

/**
 * The drift tolerance that decides whether a position needs action.
 *  - `fixed`: a single absolute band in percentage points (e.g. ±2 p.p.).
 *  - `rule525`: Swedroe's "5/25 rule" — rebalance when a class drifts by an
 *    absolute 5 p.p. OR a relative 25% of its target, whichever is tighter.
 */
export type RebalanceBand = { type: 'fixed'; pp: number } | { type: 'rule525' };

/** Default band: ±2 p.p. — matches the threshold baked into `compareAllocations`. */
export const DEFAULT_REBALANCE_BAND: RebalanceBand = { type: 'fixed', pp: 2 };

/**
 * Resolve the band, in percentage points, that applies to a single row given its
 * target weight. For the 5/25 rule the relative arm (25% of target) is tighter
 * than the 5 p.p. absolute arm for any target below 20% — exactly where small
 * sleeves should be policed more strictly.
 */
export function bandForTarget(band: RebalanceBand, targetPercentage: number): number {
  if (band.type === 'fixed') return Math.max(0, band.pp);
  return Math.min(5, Math.max(0, targetPercentage) * 0.25);
}

/**
 * Classify a signed drift (current − target, in p.p.) against a band.
 * Positive drift = over-allocated → VENDI; negative = under-allocated → COMPRA.
 * Uses strict comparison so a drift exactly on the band edge reads as OK,
 * matching `compareAllocations` (`> 2` / `< -2`).
 */
export function deriveAction(difference: number, bandPp: number): AllocationAction {
  if (difference > bandPp) return 'VENDI';
  if (difference < -bandPp) return 'COMPRA';
  return 'OK';
}

/**
 * Re-classify every row of an allocation result under a new band. Returns a fresh
 * result; the input is not mutated. Sub-category and specific-asset rows are
 * re-classified too so chips stay consistent at every depth.
 */
export function applyRebalanceBand(
  allocation: AllocationResult,
  band: RebalanceBand
): AllocationResult {
  const reclassify = (data: AllocationData): AllocationData => ({
    ...data,
    action: deriveAction(data.difference, bandForTarget(band, data.targetPercentage)),
  });
  const mapValues = (
    map: Record<string, AllocationData>
  ): Record<string, AllocationData> => {
    const out: Record<string, AllocationData> = {};
    for (const [key, value] of Object.entries(map)) out[key] = reclassify(value);
    return out;
  };

  return {
    totalValue: allocation.totalValue,
    byAssetClass: mapValues(allocation.byAssetClass),
    bySubCategory: mapValues(allocation.bySubCategory),
    bySpecificAsset: mapValues(allocation.bySpecificAsset),
  };
}

// ---------------------------------------------------------------------------
// Action colors — theme-aware (drawn from the active theme's chart palette)
// ---------------------------------------------------------------------------

/**
 * Which theme chart slot each action draws its color from, so the chips and
 * action-colored numbers follow the user's chosen theme. The semantic
 * `--warning`/`--positive`/`--destructive` tokens are defined identically across all six
 * themes, so they would look the same everywhere; the `--chart-*` palette is what carries
 * each theme's personality. The default theme's hues align with the conventional reading —
 * OK = chart-2 (jade), COMPRA = chart-3 (amber), VENDI = chart-5 (coral) — and shift with
 * the theme elsewhere. The chip label + icon carry the meaning, so color is reinforcement.
 *
 * Resolve the actual color with `useActionColors()` (lib/hooks/useActionColors.ts), which
 * reads the CSS var AND clamps its lightness for legibility — some themes set chart colors
 * near-white in light mode (e.g. cyberpunk chart-5 ≈ oklch(0.92)) which would be unreadable
 * as chip text. Clamping lightness (not falling back to a static palette) keeps the theme
 * hue and keeps the three actions visually distinct.
 */
export const ACTION_CHART_NUMBER: Record<AllocationAction, 1 | 2 | 3 | 4 | 5> = {
  COMPRA: 3,
  VENDI: 5,
  OK: 2,
};

// ---------------------------------------------------------------------------
// Key parsing (the bySubCategory / bySpecificAsset maps use composite keys)
// ---------------------------------------------------------------------------

/**
 * Group the `bySubCategory` map (keys "assetClass:subCategory") by asset class.
 * Malformed keys (no colon, or 3-part specific-asset keys) are silently ignored.
 */
export function groupSubCategoriesByAssetClass(
  bySubCategory: Record<string, AllocationData>
): Record<string, Record<string, AllocationData>> {
  const grouped: Record<string, Record<string, AllocationData>> = {};
  for (const [key, data] of Object.entries(bySubCategory)) {
    const parts = key.split(':');
    if (parts.length !== 2) continue;
    const [assetClass, subCategory] = parts;
    (grouped[assetClass] ??= {})[subCategory] = data;
  }
  return grouped;
}

/**
 * Filter the `bySpecificAsset` map (keys "assetClass:subCategory:assetName") to the
 * assets belonging to one asset-class + sub-category pair, keyed by asset name.
 */
export function filterSpecificAssets(
  bySpecificAsset: Record<string, AllocationData>,
  assetClass: string,
  subCategory: string
): Record<string, AllocationData> {
  const result: Record<string, AllocationData> = {};
  for (const [key, data] of Object.entries(bySpecificAsset)) {
    const parts = key.split(':');
    if (parts.length !== 3) continue;
    const [ac, sc, assetName] = parts;
    if (ac === assetClass && sc === subCategory) result[assetName] = data;
  }
  return result;
}

/**
 * Whether a sub-category exposes the third (specific-asset) level. `subTargets`
 * supports a legacy `number` format and the newer `SubCategoryTarget` object; only
 * the object form with `specificAssetsEnabled` opens the level.
 */
export function hasSpecificAssetTracking(
  targets: AssetAllocationTarget | null,
  assetClass: string,
  subCategory: string
): boolean {
  if (!targets || !targets[assetClass]) return false;
  const subTargets = targets[assetClass].subTargets;
  if (!subTargets) return false;
  const subTargetData = subTargets[subCategory];
  if (!subTargetData || typeof subTargetData === 'number') return false;
  return subTargetData.specificAssetsEnabled || false;
}

// ---------------------------------------------------------------------------
// Synthesis: verdict, plan, contribution split
// ---------------------------------------------------------------------------

export interface BalanceSummary {
  /** Asset classes whose action is not OK under the active band. */
  offTargetCount: number;
  /** Sum of |drift| (p.p.) across the off-target classes — a single "how far off" number. */
  totalAbsDriftPp: number;
  /** The single largest off-target drift, or null when everything is in band. */
  largestGap: { assetClass: string; label: string; difference: number; action: AllocationAction } | null;
  isBalanced: boolean;
}

/**
 * Chart-palette slot for each asset class, so the composition bar (and any future
 * per-class viz on this page) draw the SAME hue the History page uses for its
 * "Patrimonio per Asset Class" chart. Resolve the actual color via `useChartColors()`
 * at this index. Mirrors `acColors` in app/dashboard/history/page.tsx — keep them aligned.
 */
export const ASSET_CLASS_CHART_INDEX: Record<string, number> = {
  equity: 0,
  bonds: 1,
  crypto: 2,
  realestate: 3,
  cash: 4,
  commodity: 5,
  trendFollowing: 6,
  carry: 7,
};

export interface BalanceScore {
  /** 0–100, where 100 = every class exactly on target. */
  score: number;
  /** Share of the portfolio sitting in the wrong class, in percentage points (0–100). */
  misallocationPct: number;
}

/**
 * A single band-INDEPENDENT "how close to target" score for the hero gauge.
 *
 * Deliberately built from each class's raw `difference` (current − target p.p.), NOT from
 * the banded `action`: the gauge measures absolute distance from target and must stay
 * stable when the user widens or tightens the rebalance band — only the COMPRA/VENDI/OK
 * verdict and plan react to the band. Because Σ(current − target) = 0 across classes,
 * Σ|difference| is exactly twice the portfolio fraction that is misallocated; halving it
 * gives the intuitive "X% of the portfolio is in the wrong class". The score is its
 * complement, clamped to [0, 100].
 */
export function computeBalanceScore(
  byAssetClass: Record<string, AllocationData>
): BalanceScore {
  let sumAbsDrift = 0;
  for (const data of Object.values(byAssetClass)) sumAbsDrift += Math.abs(data.difference);
  const misallocationPct = Math.min(100, sumAbsDrift / 2);
  return { score: Math.round(100 - misallocationPct), misallocationPct };
}

/** One-glance verdict for the hero: how many classes are off target and the worst one. */
export function summarizeBalance(
  byAssetClass: Record<string, AllocationData>,
  labels: Record<string, string> = ASSET_CLASS_LABELS
): BalanceSummary {
  let offTargetCount = 0;
  let totalAbsDriftPp = 0;
  let largestGap: BalanceSummary['largestGap'] = null;

  for (const [assetClass, data] of Object.entries(byAssetClass)) {
    if (data.action === 'OK') continue;
    offTargetCount += 1;
    totalAbsDriftPp += Math.abs(data.difference);
    if (!largestGap || Math.abs(data.difference) > Math.abs(largestGap.difference)) {
      largestGap = {
        assetClass,
        label: labels[assetClass] ?? assetClass,
        difference: data.difference,
        action: data.action,
      };
    }
  }

  return { offTargetCount, totalAbsDriftPp, largestGap, isBalanced: offTargetCount === 0 };
}

export interface RebalanceMove {
  assetClass: string;
  label: string;
  action: 'COMPRA' | 'VENDI';
  /** Euro you can ACTUALLY move. A VENDI is capped at the class's tradable value; may be 0. */
  amount: number;
  /** What the drift calls for, before any tradability cap. Equals `amount` when uncapped. */
  requestedAmount: number;
  /** True when a VENDI was cut short because part of the class is frozen. */
  limitedByFrozen: boolean;
  /** Signed drift in p.p. (positive = over-allocated). */
  differencePp: number;
  currentPercentage: number;
  targetPercentage: number;
}

/**
 * The consolidated rebalancing plan at asset-class level: every off-target class as
 * a signed move, largest euro amount first. This is the page's single most useful
 * output — the scattered chips turned into "what to actually do".
 *
 * `tradableByClass` caps the SELL side. A class can sit far above target *because* of a frozen
 * pension fund and still have almost nothing you may sell; printing the raw drift as a euro
 * instruction there would be an order nobody can fill. The drift itself is not hidden —
 * `differencePp` and the current/target percentages still tell the truth, and `limitedByFrozen`
 * lets the panel explain why the euro figure is smaller than the gap. A COMPRA is never capped:
 * you can always buy more. Passing no map at all leaves every class uncapped.
 */
export function buildRebalancePlan(
  byAssetClass: Record<string, AllocationData>,
  tradableByClass: Record<string, number> | null = null,
  labels: Record<string, string> = ASSET_CLASS_LABELS
): RebalanceMove[] {
  return Object.entries(byAssetClass)
    .filter(([, data]) => data.action !== 'OK')
    .map(([assetClass, data]) => {
      const action = data.action as 'COMPRA' | 'VENDI';
      const requestedAmount = Math.abs(data.differenceValue);
      const sellable = tradableByClass ? (tradableByClass[assetClass] ?? 0) : requestedAmount;
      const amount = action === 'VENDI' ? Math.min(requestedAmount, sellable) : requestedAmount;

      return {
        assetClass,
        label: labels[assetClass] ?? assetClass,
        action,
        amount,
        requestedAmount,
        limitedByFrozen: action === 'VENDI' && amount < requestedAmount - 0.5,
        differencePp: data.difference,
        currentPercentage: data.currentPercentage,
        targetPercentage: data.targetPercentage,
      };
    })
    .sort((a, b) => b.requestedAmount - a.requestedAmount);
}

export interface ContributionSlice {
  assetClass: string;
  label: string;
  /** Euro of new cash to direct here. */
  add: number;
  currentValue: number;
  newValue: number;
  /** Resulting weight after the contribution (% of the new total). */
  newPercentage: number;
  targetPercentage: number;
}

/**
 * Core no-sell split: distribute `amount` across items toward their target weights,
 * where `baseTotal` is the total against which a target percentage defines the desired
 * value. Strategy:
 *   1. Each item's deficit = max(0, targetPct% × baseTotal − currentValue).
 *   2. If the cash is ≤ the total deficit, fill deficits proportionally.
 *   3. If it is larger, fill every deficit then spread the remainder by target weight.
 *   4. If nothing is under target, spread the whole amount by target weight.
 * Never returns a negative add (no selling). Returns key → euro to add.
 *
 * `baseTotal` is explicit because it is NOT always `Σcurrent + amount`: for sub-categories
 * it is the parent CLASS's post-contribution total (sub-categories may not cover the whole
 * class), against which their class-relative targets must be measured.
 */
export function splitTowardTarget(
  items: Array<{ key: string; currentValue: number; targetPercentage: number }>,
  amount: number,
  baseTotal: number
): Record<string, number> {
  const adds: Record<string, number> = {};
  if (amount <= 0 || items.length === 0) {
    for (const it of items) adds[it.key] = 0;
    return adds;
  }

  const totalTargetPct = items.reduce((sum, it) => sum + Math.max(0, it.targetPercentage), 0) || 1;
  const deficits = items.map((it) => ({
    key: it.key,
    targetPercentage: it.targetPercentage,
    deficit: Math.max(0, (it.targetPercentage / 100) * baseTotal - it.currentValue),
  }));
  const totalDeficit = deficits.reduce((sum, d) => sum + d.deficit, 0);

  if (totalDeficit <= 0) {
    for (const it of items) adds[it.key] = amount * (Math.max(0, it.targetPercentage) / totalTargetPct);
  } else if (amount <= totalDeficit) {
    for (const d of deficits) adds[d.key] = amount * (d.deficit / totalDeficit);
  } else {
    const remainder = amount - totalDeficit;
    for (const d of deficits) {
      adds[d.key] = d.deficit + remainder * (Math.max(0, d.targetPercentage) / totalTargetPct);
    }
  }
  return adds;
}

/**
 * Split `amount` of new cash across the asset classes to move TOWARD target without
 * selling anything. Answers the real monthly question: "I have €X — where does it go?".
 */
export function allocateContribution(
  byAssetClass: Record<string, AllocationData>,
  amount: number,
  labels: Record<string, string> = ASSET_CLASS_LABELS
): ContributionSlice[] {
  const entries = Object.entries(byAssetClass);
  const currentTotal = entries.reduce((sum, [, d]) => sum + d.currentValue, 0);
  const newTotal = currentTotal + Math.max(0, amount);

  const adds = splitTowardTarget(
    entries.map(([key, d]) => ({ key, currentValue: d.currentValue, targetPercentage: d.targetPercentage })),
    amount,
    newTotal
  );

  return entries
    .map(([assetClass, d]) => {
      const add = adds[assetClass] ?? 0;
      const newValue = d.currentValue + add;
      return {
        assetClass,
        label: labels[assetClass] ?? assetClass,
        add,
        currentValue: d.currentValue,
        newValue,
        newPercentage: newTotal > 0 ? (newValue / newTotal) * 100 : 0,
        targetPercentage: d.targetPercentage,
      };
    })
    .sort((a, b) => b.add - a.add);
}

// ---------------------------------------------------------------------------
// Non-rebalanceable assets
// ---------------------------------------------------------------------------

/**
 * The asset's role in the allocation math, with the legacy read-fallback.
 *
 * `excludeFromAllocation` was the first cut's single boolean; it conflated "not an investment"
 * (the home you live in) with "an investment I cannot move" (a locked pension fund, private
 * equity). It maps to `excluded` — the behaviour-preserving choice, since that is exactly what it
 * did — and the user re-picks `frozen` for the ones that belong in their percentages. Never
 * silently upgrade a legacy flag to `frozen`: that would move their numbers without them asking.
 */
export function resolveAllocationRole(asset: Asset): AllocationRole {
  if (asset.allocationRole) return asset.allocationRole;
  return asset.excludeFromAllocation ? 'excluded' : 'tradable';
}

/**
 * Split an asset list by the three roles. Apply UPSTREAM of `compareAllocations`, never to its
 * output.
 *
 * The DENOMINATOR is `tradable + frozen`: frozen wealth is genuinely invested, so leaving it out
 * would understate your true equity/bond exposure and have you tune the risk of only part of your
 * portfolio. Filtering it out downstream instead would also break the Σ(current − target) = 0
 * invariant that `computeBalanceScore` halves.
 *
 * `excluded` leaves entirely: keeping a house in the denominator pegs the realestate class
 * permanently off-target against a trade nobody can execute.
 */
export function partitionByAllocationRole(assets: Asset[]): {
  /** In the denominator AND in the plans. */
  tradable: Asset[];
  /** In the denominator, never in the plans. */
  frozen: Asset[];
  /** Out of the page entirely; reported only. */
  excluded: Asset[];
} {
  const tradable: Asset[] = [];
  const frozen: Asset[] = [];
  const excluded: Asset[] = [];

  for (const asset of assets) {
    const role = resolveAllocationRole(asset);
    if (role === 'excluded') excluded.push(asset);
    else if (role === 'frozen') frozen.push(asset);
    else tradable.push(asset);
  }

  return { tradable, frozen, excluded };
}

/** One instrument (or one sleeve of a composite instrument) as the planners see it. */
export interface AllocatableHolding {
  /** `asset.id`, suffixed with the component index for the sleeves of a composite asset. */
  id: string;
  label: string;
  ticker?: string;
  assetClass: string;
  subCategory?: string;
  /** Current value in EUR. */
  value: number;
  /**
   * Whether a plan may move money in or out of this holding. `false` for a `frozen` asset: its
   * value still counts in every total and percentage, but the plans must reach the same target by
   * moving the OTHER holdings around it. This is the difference between a number being true and an
   * instruction being executable — the page owes the user both.
   */
  tradable: boolean;
}

/**
 * Flatten assets into the per-instrument rows the plans drill down to.
 *
 * `valueOf` is injected rather than imported: the real implementation (`calculateAssetValue`)
 * lives in the Firebase-coupled service layer, and this module must stay importable by the unit
 * tests without mocking `@/lib/firebase/config`.
 *
 * A composite asset (e.g. a 60/40 pension fund) yields ONE holding per component, weighted by its
 * percentage — the same split `calculateCurrentAllocation` performs — so the per-instrument
 * amounts still sum back to the class amount, and each sleeve lands in the class it really belongs
 * to. A frozen composite therefore contributes its equity sleeve to the equity percentages and its
 * bond sleeve to the bond ones, which is the whole point of counting it.
 */
export function buildHoldings(
  assets: Asset[],
  valueOf: (asset: Asset) => number
): AllocatableHolding[] {
  const holdings: AllocatableHolding[] = [];

  for (const asset of assets) {
    const value = valueOf(asset);
    if (value <= 0) continue;
    const tradable = resolveAllocationRole(asset) === 'tradable';

    if (asset.composition && asset.composition.length > 0) {
      asset.composition.forEach((component, index) => {
        holdings.push({
          id: `${asset.id}:${index}`,
          label: `${asset.name} · ${ASSET_CLASS_LABELS[component.assetClass] ?? component.assetClass}`,
          ticker: asset.ticker || undefined,
          assetClass: component.assetClass,
          subCategory: component.subCategory,
          value: (value * component.percentage) / 100,
          tradable,
        });
      });
    } else {
      holdings.push({
        id: asset.id,
        label: asset.name,
        ticker: asset.ticker || undefined,
        assetClass: asset.assetClass,
        subCategory: asset.subCategory,
        value,
        tradable,
      });
    }
  }

  return holdings;
}

/** Total TRADABLE value per asset class — how much of a class a plan may actually move. */
export function sumTradableByClass(holdings: AllocatableHolding[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const holding of holdings) {
    if (!holding.tradable) continue;
    totals[holding.assetClass] = (totals[holding.assetClass] ?? 0) + holding.value;
  }
  return totals;
}

/** Total value per asset class. Used for the excluded slice the Allocazione page reports. */
export function sumHoldingsByClass(holdings: AllocatableHolding[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const holding of holdings) {
    totals[holding.assetClass] = (totals[holding.assetClass] ?? 0) + holding.value;
  }
  return totals;
}

/** Total value per "assetClass:subCategory" key — the same composite key `bySubCategory` uses. */
export function sumHoldingsBySubCategory(
  holdings: AllocatableHolding[]
): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const holding of holdings) {
    const key = `${holding.assetClass}:${holding.subCategory || NO_SUBCATEGORY_LABEL}`;
    totals[key] = (totals[key] ?? 0) + holding.value;
  }
  return totals;
}

export interface OrphanedTarget {
  assetClass: string;
  /** Set when the orphan is a sub-category target rather than a whole class. */
  subCategory?: string;
  /** "Immobili" or "Immobili → Prima casa". */
  label: string;
  targetPercentage: number;
  /** Euro of that class / sub-category sitting in excluded assets. */
  excludedValue: number;
}

/** Below this, a target row holds nothing tradable worth planning around. */
const NEGLIGIBLE_VALUE = 0.5;

/**
 * Targets the exclusion has stranded: a positive target whose entire value sits in excluded
 * assets, so no possible buy or sell can ever reach it.
 *
 * This is the trap the exclusion sets, and it bites at BOTH levels:
 *
 *  - **Sub-category** (the sharp one). A user with `realestate: { Prima casa 70%, REIT 30% }` who
 *    flags the house sees `bySubCategory['realestate:Prima casa'].currentValue` drop to 0 while its
 *    70% target stays. The contribution split then reads it as massively under target and pours
 *    money into a bucket that can only ever contain the excluded house — the exact impossible
 *    instruction the whole feature exists to prevent, one level down. Callers must ALSO pass these
 *    through `stripOrphanedSubTargets` so no plan can propose them.
 *  - **Class**, but ONLY when it has no tradable destination configured. A class target is still
 *    reachable if any of its sub-targets is not itself orphaned (you can buy a REIT even while
 *    holding none), so an `Immobili 5%` target with a live `REIT 30%` sub-target is NOT an orphan
 *    — flagging it would be a false positive that trains the user to ignore the warning.
 */
export function findOrphanedTargets(
  byAssetClass: Record<string, AllocationData>,
  bySubCategory: Record<string, AllocationData>,
  excludedByClass: Record<string, number>,
  excludedBySubCategory: Record<string, number>,
  labels: Record<string, string> = ASSET_CLASS_LABELS
): OrphanedTarget[] {
  const classLabel = (assetClass: string) => labels[assetClass] ?? assetClass;
  const orphans: OrphanedTarget[] = [];
  const orphanedSubKeys = new Set<string>();

  // Sub-category level.
  for (const [key, data] of Object.entries(bySubCategory)) {
    const parts = key.split(':');
    if (parts.length !== 2) continue;
    const [assetClass, subCategory] = parts;
    if (data.targetPercentage <= 0) continue;
    if (data.currentValue > NEGLIGIBLE_VALUE) continue;
    if ((excludedBySubCategory[key] ?? 0) <= 0) continue;

    orphanedSubKeys.add(key);
    orphans.push({
      assetClass,
      subCategory,
      label: `${classLabel(assetClass)} → ${subCategory}`,
      targetPercentage: data.targetPercentage,
      excludedValue: excludedBySubCategory[key],
    });
  }

  // Class level — only when nothing tradable is configured underneath.
  const subsByClass = groupSubCategoriesByAssetClass(bySubCategory);
  for (const [assetClass, excludedValue] of Object.entries(excludedByClass)) {
    if (excludedValue <= 0) continue;
    const data = byAssetClass[assetClass];
    if (!data || data.targetPercentage <= 0) continue;
    if (data.currentValue > NEGLIGIBLE_VALUE) continue;

    const hasReachableSubTarget = Object.entries(subsByClass[assetClass] ?? {}).some(
      ([subCategory, subData]) =>
        subData.targetPercentage > 0 && !orphanedSubKeys.has(`${assetClass}:${subCategory}`)
    );
    if (hasReachableSubTarget) continue;

    orphans.push({
      assetClass,
      label: classLabel(assetClass),
      targetPercentage: data.targetPercentage,
      excludedValue,
    });
  }

  return orphans;
}

/**
 * Remove the orphaned sub-category targets from the map that feeds the planners, so no plan can
 * propose an unreachable bucket. The surviving sub-targets renormalize on their own: every split
 * weights by the sum of the targets actually present, so a class's whole allotment flows to what
 * is still reachable (e.g. `Prima casa 70%` gone → the class's money all goes to `REIT`).
 */
export function stripOrphanedSubTargets(
  bySubCategory: Record<string, AllocationData>,
  orphans: OrphanedTarget[]
): Record<string, AllocationData> {
  const orphanedKeys = new Set(
    orphans
      .filter((orphan) => orphan.subCategory !== undefined)
      .map((orphan) => `${orphan.assetClass}:${orphan.subCategory}`)
  );
  if (orphanedKeys.size === 0) return bySubCategory;

  const kept: Record<string, AllocationData> = {};
  for (const [key, data] of Object.entries(bySubCategory)) {
    if (!orphanedKeys.has(key)) kept[key] = data;
  }
  return kept;
}

// ---------------------------------------------------------------------------
// Withdrawal ("Preleva") — the mirror image of the contribution split
// ---------------------------------------------------------------------------

/** Label for holdings that carry no sub-category, so every euro of a class lands in some bucket. */
export const NO_SUBCATEGORY_LABEL = 'Senza sottocategoria';

/**
 * Give each item a target equal to its CURRENT share of the bucket.
 *
 * Below the asset-class level there is often no target at all (a sub-category the user never
 * targeted, an individual instrument). The right rule there is "no opinion — drain pro-rata and
 * preserve the mix", and this trick produces it from the same algorithm instead of a second one:
 * with target_i = value_i / total, every item's surplus is proportional to its value, so
 * `splitFromSurplus` degenerates to take_i = amount × value_i / total. Exact pro-rata, no branch.
 */
function withNeutralTargets<T extends { key: string; currentValue: number }>(
  items: T[]
): Array<T & { targetPercentage: number }> {
  const total = items.reduce((sum, item) => sum + Math.max(0, item.currentValue), 0);
  return items.map((item) => ({
    ...item,
    targetPercentage: total > 0 ? (Math.max(0, item.currentValue) / total) * 100 : 0,
  }));
}

/** How much of an item a plan may actually take out: its tradable slice, defaulting to all of it. */
function capacityOf(item: { currentValue: number; capacity?: number }): number {
  return Math.max(0, item.capacity ?? item.currentValue);
}

/**
 * Enforce `take ≤ capacity` and hand the overflow to the items that can still absorb it.
 *
 * The cap is CAPACITY, not currentValue: a class holding €50k of which €40k is a frozen pension
 * fund can only give up €10k, however far above target it sits. Only the "spread the remainder by
 * target weight" branch of `splitFromSurplus` can overdraw an item, and redistributing the
 * overflow can overdraw another, so this iterates. Each pass clamps at least one further item,
 * which bounds it at `items.length` passes. Σtake is preserved.
 */
function clampToCapacity(
  takes: Record<string, number>,
  items: Array<{ key: string; currentValue: number; capacity?: number }>
): Record<string, number> {
  const result = { ...takes };
  const clamped = new Set<string>();

  for (let pass = 0; pass < items.length; pass++) {
    let overflow = 0;
    for (const item of items) {
      if (clamped.has(item.key)) continue;
      const limit = capacityOf(item);
      const excess = result[item.key] - limit;
      if (excess > 0) {
        overflow += excess;
        result[item.key] = limit;
        clamped.add(item.key);
      }
    }
    if (overflow <= 1e-9) break;

    const headroom = items
      .filter((item) => !clamped.has(item.key))
      .map((item) => ({ key: item.key, room: capacityOf(item) - result[item.key] }));
    const totalRoom = headroom.reduce((sum, h) => sum + h.room, 0);
    if (totalRoom <= 1e-9) break;

    for (const h of headroom) result[h.key] += overflow * (h.room / totalRoom);
  }

  return result;
}

/**
 * Core withdrawal split: take `amount` out of the items, draining what is ABOVE target first, so
 * the withdrawal moves the portfolio TOWARD its target instead of away from it. Exact mirror of
 * `splitTowardTarget`, with `baseTotal` the POST-withdrawal total against which a target
 * percentage defines the desired value. Strategy:
 *   1. Each item's surplus = max(0, currentValue − targetPct% × baseTotal).
 *   2. If the amount is ≤ the total surplus, drain surpluses proportionally.
 *   3. If it is larger, drain every surplus then spread the remainder by target weight.
 *   4. If nothing is above target, spread the whole amount by target weight.
 *
 * `currentValue` and `capacity` are DIFFERENT inputs and both matter. The surplus is measured on
 * `currentValue` — a frozen pension fund really does push its class above target, and pretending
 * otherwise would understate the drift. But the take is capped at `capacity` (the tradable slice,
 * default: all of it), because that is all you can actually sell. Separating the two is what keeps
 * the drift honest AND the instruction executable.
 *
 * Two constraints have no analogue on the contribution side: you cannot take more than an item's
 * capacity (`clampToCapacity`), and you cannot take more than the bucket's total capacity — asking
 * for more drains it completely rather than returning impossible numbers. Hence the invariant
 * callers rely on: **Σtake === min(amount, Σcapacity)**.
 */
export function splitFromSurplus(
  items: Array<{ key: string; currentValue: number; targetPercentage: number; capacity?: number }>,
  amount: number,
  baseTotal: number
): Record<string, number> {
  const takes: Record<string, number> = {};
  for (const item of items) takes[item.key] = 0;
  if (amount <= 0 || items.length === 0) return takes;

  const totalCapacity = items.reduce((sum, item) => sum + capacityOf(item), 0);
  const drawable = Math.min(amount, totalCapacity);
  if (drawable <= 0) return takes;

  const totalTargetPct =
    items.reduce((sum, item) => sum + Math.max(0, item.targetPercentage), 0) || 1;
  const surpluses = items.map((item) => ({
    key: item.key,
    targetPercentage: Math.max(0, item.targetPercentage),
    surplus: Math.max(0, item.currentValue - (item.targetPercentage / 100) * baseTotal),
  }));
  const totalSurplus = surpluses.reduce((sum, s) => sum + s.surplus, 0);

  if (totalSurplus <= 0) {
    for (const item of items) {
      takes[item.key] = drawable * (Math.max(0, item.targetPercentage) / totalTargetPct);
    }
  } else if (drawable <= totalSurplus) {
    for (const s of surpluses) takes[s.key] = drawable * (s.surplus / totalSurplus);
  } else {
    const remainder = drawable - totalSurplus;
    for (const s of surpluses) {
      takes[s.key] = s.surplus + remainder * (s.targetPercentage / totalTargetPct);
    }
  }

  return clampToCapacity(takes, items);
}

/**
 * One level of an action plan: an asset class, a sub-category, or a single instrument.
 * Shared by "Versa" and "Preleva" — the two are the same tree with the sign flipped, so they
 * share one node type and one row renderer.
 */
export interface PlanNode {
  /** Asset-class key / sub-category name / holding id or specific-asset name. Unique among siblings. */
  key: string;
  label: string;
  /** Euro to move here. Always POSITIVE; the direction is the plan's, not the node's. */
  amount: number;
  currentValue: number;
  newValue: number;
  /** Resulting weight, relative to the PARENT's post-action total. */
  newPercentage: number;
  targetPercentage: number;
  /** Empty at the instrument level and whenever nothing moves through this node. */
  children: PlanNode[];
}

/** Label a holding the way the plan shows it: name plus ticker when there is one. */
function holdingLabel(holding: AllocatableHolding): string {
  return holding.ticker ? `${holding.label} (${holding.ticker})` : holding.label;
}

// --- Withdrawal ("Preleva") ------------------------------------------------

/**
 * Instrument level: only TRADABLE holdings are candidates — a frozen sleeve counts toward the
 * bucket's weight but can never be the thing you sell. No per-instrument targets → neutral targets
 * → exact pro-rata across what is actually sellable.
 */
function buildWithdrawalHoldingNodes(
  holdings: AllocatableHolding[],
  take: number,
  bucketNewTotal: number
): PlanNode[] {
  const sellable = holdings.filter((holding) => holding.tradable);
  if (take <= 0 || sellable.length === 0) return [];

  const items = withNeutralTargets(
    sellable.map((holding) => ({ key: holding.id, currentValue: holding.value }))
  );
  const takes = splitFromSurplus(items, take, bucketNewTotal);

  return sellable
    .map((holding) => {
      const holdingTake = takes[holding.id] ?? 0;
      const newValue = holding.value - holdingTake;
      return {
        key: holding.id,
        label: holdingLabel(holding),
        amount: holdingTake,
        currentValue: holding.value,
        newValue,
        newPercentage: bucketNewTotal > 0 ? (newValue / bucketNewTotal) * 100 : 0,
        targetPercentage: items.find((item) => item.key === holding.id)?.targetPercentage ?? 0,
        children: [],
      };
    })
    .sort((a, b) => b.amount - a.amount);
}

/**
 * Sub-category level for a WITHDRAWAL. The buckets are derived from the HOLDINGS, not from
 * `bySubCategory`.
 *
 * `bySubCategory` only lists sub-categories that HAVE a configured target, so splitting the
 * class's take across it alone would strand every euro sitting in an untargeted sub-category —
 * the per-instrument takes would no longer sum back to the class take. Grouping the class's own
 * holdings guarantees that every euro of the class is in exactly one bucket. A bucket with a
 * configured target is drained toward it; one without gets a neutral target (pro-rata).
 */
function buildWithdrawalSubCategoryNodes(
  assetClass: string,
  classHoldings: AllocatableHolding[],
  bySubCategory: Record<string, AllocationData>,
  take: number,
  classNewTotal: number
): PlanNode[] {
  if (take <= 0 || classHoldings.length === 0) return [];

  const buckets = new Map<string, AllocatableHolding[]>();
  for (const holding of classHoldings) {
    const name = holding.subCategory || NO_SUBCATEGORY_LABEL;
    const existing = buckets.get(name);
    if (existing) existing.push(holding);
    else buckets.set(name, [holding]);
  }

  const bucketHoldings = Array.from(buckets.entries()).map(([name, holdings]) => ({
    key: name,
    holdings,
    currentValue: holdings.reduce((sum, h) => sum + h.value, 0),
    // What this bucket can actually give up: its tradable slice only.
    capacity: holdings.reduce((sum, h) => (h.tradable ? sum + h.value : sum), 0),
  }));
  const bucketTotal = bucketHoldings.reduce((sum, b) => sum + b.currentValue, 0);

  const items = bucketHoldings.map((bucket) => ({
    key: bucket.key,
    currentValue: bucket.currentValue,
    capacity: bucket.capacity,
    targetPercentage:
      bySubCategory[`${assetClass}:${bucket.key}`]?.targetPercentage ??
      (bucketTotal > 0 ? (bucket.currentValue / bucketTotal) * 100 : 0),
  }));

  const takes = splitFromSurplus(items, take, classNewTotal);

  return items
    .map((item, index) => {
      const bucketTake = takes[item.key] ?? 0;
      const newValue = item.currentValue - bucketTake;
      return {
        key: item.key,
        label: item.key,
        amount: bucketTake,
        currentValue: item.currentValue,
        newValue,
        newPercentage: classNewTotal > 0 ? (newValue / classNewTotal) * 100 : 0,
        targetPercentage: item.targetPercentage,
        children: buildWithdrawalHoldingNodes(bucketHoldings[index].holdings, bucketTake, newValue),
      };
    })
    .sort((a, b) => b.amount - a.amount);
}

/**
 * Three-level withdrawal plan — "I need €X: what do I sell?".
 *
 * The decumulation mirror of `buildContributionPlan`: asset class → sub-category → individual
 * instrument, draining whatever sits above target first so the withdrawal rebalances rather than
 * distorts. Sums reconcile at every level: Σ(instrument takes) = bucket take, Σ(bucket takes) =
 * class take, Σ(class takes) = min(amount, total).
 *
 * Capital-gains tax is deliberately NOT modelled: the plan is per class, `taxRate` is per asset,
 * and attributing one to the other needs a rule this version does not have. The panel says so.
 */
export function buildWithdrawalPlan(
  byAssetClass: Record<string, AllocationData>,
  bySubCategory: Record<string, AllocationData>,
  holdings: AllocatableHolding[],
  amount: number,
  labels: Record<string, string> = ASSET_CLASS_LABELS
): PlanNode[] {
  const classEntries = Object.entries(byAssetClass);
  const tradableByClass = sumTradableByClass(holdings);

  // The ceiling is what is SELLABLE, not what is held: a portfolio can be worth €300k and still
  // only be able to hand you €80k if the rest is a locked pension fund.
  const totalCapacity = classEntries.reduce(
    (sum, [assetClass]) => sum + (tradableByClass[assetClass] ?? 0),
    0
  );
  const currentTotal = classEntries.reduce((sum, [, data]) => sum + data.currentValue, 0);
  const drawable = Math.min(Math.max(0, amount), totalCapacity);
  const newTotal = currentTotal - drawable;

  const classTakes = splitFromSurplus(
    classEntries.map(([key, data]) => ({
      key,
      currentValue: data.currentValue,
      capacity: tradableByClass[key] ?? 0,
      targetPercentage: data.targetPercentage,
    })),
    drawable,
    newTotal
  );

  const holdingsByClass: Record<string, AllocatableHolding[]> = {};
  for (const holding of holdings) {
    (holdingsByClass[holding.assetClass] ??= []).push(holding);
  }

  return classEntries
    .map(([assetClass, data]) => {
      const take = classTakes[assetClass] ?? 0;
      const newValue = data.currentValue - take;
      return {
        key: assetClass,
        label: labels[assetClass] ?? assetClass,
        amount: take,
        currentValue: data.currentValue,
        newValue,
        newPercentage: newTotal > 0 ? (newValue / newTotal) * 100 : 0,
        targetPercentage: data.targetPercentage,
        children: buildWithdrawalSubCategoryNodes(
          assetClass,
          holdingsByClass[assetClass] ?? [],
          bySubCategory,
          take,
          newValue
        ),
      };
    })
    .sort((a, b) => b.amount - a.amount);
}

// --- Contribution ("Versa") ------------------------------------------------

/**
 * Instrument level for a CONTRIBUTION.
 *
 * Two sources, and the choice matters. When the sub-category has SPECIFIC-ASSET TARGETS
 * configured (Impostazioni → "Traccia asset specifici"), those are the user's explicit
 * instruction about which instrument the money belongs in — honour them, even for an instrument
 * they hold NONE of yet. That is the whole asymmetry with `buildWithdrawalPlan`: you can be told
 * to buy something you do not own, but never to sell it. Without specific targets, fall back to
 * the instruments actually held, split pro-rata via neutral targets (mix preserved, no opinion).
 */
function buildContributionHoldingNodes(
  bucketHoldings: AllocatableHolding[],
  specificAssets: Record<string, AllocationData>,
  add: number,
  bucketNewTotal: number
): PlanNode[] {
  if (add <= 0) return [];

  const buyable = bucketHoldings.filter((holding) => holding.tradable);
  const specificEntries = Object.entries(specificAssets);

  if (specificEntries.length > 0) {
    const adds = splitTowardTarget(
      specificEntries.map(([name, data]) => ({
        key: name,
        currentValue: data.currentValue,
        targetPercentage: data.targetPercentage,
      })),
      add,
      bucketNewTotal
    );

    return specificEntries
      .map(([name, data]) => {
        const assetAdd = adds[name] ?? 0;
        const newValue = data.currentValue + assetAdd;
        return {
          key: name,
          label: name,
          amount: assetAdd,
          currentValue: data.currentValue,
          newValue,
          newPercentage: bucketNewTotal > 0 ? (newValue / bucketNewTotal) * 100 : 0,
          targetPercentage: data.targetPercentage,
          children: [],
        };
      })
      .sort((a, b) => b.amount - a.amount);
  }

  if (buyable.length === 0) return [];

  const items = withNeutralTargets(
    buyable.map((holding) => ({ key: holding.id, currentValue: holding.value }))
  );
  const adds = splitTowardTarget(items, add, bucketNewTotal);

  return buyable
    .map((holding) => {
      const holdingAdd = adds[holding.id] ?? 0;
      const newValue = holding.value + holdingAdd;
      return {
        key: holding.id,
        label: holdingLabel(holding),
        amount: holdingAdd,
        currentValue: holding.value,
        newValue,
        newPercentage: bucketNewTotal > 0 ? (newValue / bucketNewTotal) * 100 : 0,
        targetPercentage: items.find((item) => item.key === holding.id)?.targetPercentage ?? 0,
        children: [],
      };
    })
    .sort((a, b) => b.amount - a.amount);
}

/**
 * Three-level contribution plan — "I have €X: where does it go?".
 *
 * Asset class → sub-category → individual instrument, filling whatever sits below target first,
 * WITHOUT selling anything. Unlike the withdrawal, the sub-category buckets come from
 * `bySubCategory` (the configured TARGETS), not from the holdings: new money is exactly how you
 * fund a sub-category you have not bought into yet, so an empty targeted bucket must stay
 * visible. The caller is responsible for having stripped the ORPHANED sub-targets first
 * (`stripOrphanedSubTargets`) — otherwise this happily pours money into a bucket whose only
 * contents are excluded assets.
 *
 * A sub-category's split is measured against the class's POST-contribution total (sub-targets are
 * class-relative and may not cover the whole class). Nodes receiving nothing are still returned;
 * the UI filters them out.
 */
export function buildContributionPlan(
  byAssetClass: Record<string, AllocationData>,
  bySubCategory: Record<string, AllocationData>,
  bySpecificAsset: Record<string, AllocationData>,
  holdings: AllocatableHolding[],
  amount: number,
  labels: Record<string, string> = ASSET_CLASS_LABELS
): PlanNode[] {
  const classSlices = allocateContribution(byAssetClass, amount, labels);
  const subsByClass = groupSubCategoriesByAssetClass(bySubCategory);

  return classSlices.map((slice) => {
    const subs = subsByClass[slice.assetClass];
    const classNewTotal = slice.currentValue + slice.add;

    const classNode: PlanNode = {
      key: slice.assetClass,
      label: slice.label,
      amount: slice.add,
      currentValue: slice.currentValue,
      newValue: classNewTotal,
      newPercentage: slice.newPercentage,
      targetPercentage: slice.targetPercentage,
      children: [],
    };

    if (slice.add <= 0 || !subs || Object.keys(subs).length === 0) return classNode;

    // Drop the sub-categories that are not valid DESTINATIONS: those whose value is entirely
    // frozen (e.g. "equity:Fondo Pensione" — real money, real weight, but you cannot decide to put
    // this month's €1.000 into it). Their target weight leaves the split, so the class's allotment
    // renormalizes onto the sleeves you CAN buy — which is precisely how the plan compensates for
    // a frozen asset. An unfunded target (nothing behind it at all) stays: buying into it is
    // exactly what a contribution is for.
    const subEntries = Object.entries(subs).filter(([subCategory]) => {
      const bucket = holdings.filter(
        (holding) => holding.assetClass === slice.assetClass && holding.subCategory === subCategory
      );
      if (bucket.length === 0) return true;
      return bucket.some((holding) => holding.tradable && holding.value > 0);
    });
    if (subEntries.length === 0) return classNode;

    const adds = splitTowardTarget(
      subEntries.map(([name, data]) => ({
        key: name,
        currentValue: data.currentValue,
        targetPercentage: data.targetPercentage,
      })),
      slice.add,
      classNewTotal
    );

    classNode.children = subEntries
      .map(([subCategory, data]) => {
        const subAdd = adds[subCategory] ?? 0;
        const subNewTotal = data.currentValue + subAdd;
        return {
          key: subCategory,
          label: subCategory,
          amount: subAdd,
          currentValue: data.currentValue,
          newValue: subNewTotal,
          // Sub-targets are class-relative, so the weight is against the class's new total.
          newPercentage: classNewTotal > 0 ? (subNewTotal / classNewTotal) * 100 : 0,
          targetPercentage: data.targetPercentage,
          children: buildContributionHoldingNodes(
            holdings.filter(
              (holding) =>
                holding.assetClass === slice.assetClass && holding.subCategory === subCategory
            ),
            filterSpecificAssets(bySpecificAsset, slice.assetClass, subCategory),
            subAdd,
            subNewTotal
          ),
        };
      })
      .sort((a, b) => b.amount - a.amount);

    return classNode;
  });
}
