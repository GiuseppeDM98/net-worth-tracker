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
  /** Absolute euro amount to move (buy if COMPRA, sell if VENDI). */
  amount: number;
  /** Signed drift in p.p. (positive = over-allocated). */
  differencePp: number;
  currentPercentage: number;
  targetPercentage: number;
}

/**
 * The consolidated rebalancing plan at asset-class level: every off-target class as
 * a signed move, largest euro amount first. This is the page's single most useful
 * output — the scattered chips turned into "what to actually do".
 */
export function buildRebalancePlan(
  byAssetClass: Record<string, AllocationData>,
  labels: Record<string, string> = ASSET_CLASS_LABELS
): RebalanceMove[] {
  return Object.entries(byAssetClass)
    .filter(([, data]) => data.action !== 'OK')
    .map(([assetClass, data]) => ({
      assetClass,
      label: labels[assetClass] ?? assetClass,
      action: data.action as 'COMPRA' | 'VENDI',
      amount: Math.abs(data.differenceValue),
      differencePp: data.difference,
      currentPercentage: data.currentPercentage,
      targetPercentage: data.targetPercentage,
    }))
    .sort((a, b) => b.amount - a.amount);
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

/** A class-level contribution slice with its sub-category breakdown. */
export interface HierarchicalContributionSlice extends ContributionSlice {
  /** How the class's `add` splits across its sub-categories (empty when none defined). */
  subSlices: ContributionSlice[];
}

/**
 * Two-level contribution plan: first split `amount` across asset classes, then split each
 * class's allotment across its own sub-categories toward their class-relative targets. A
 * class's sub-split is measured against the class's POST-contribution total (not the sum of
 * its sub-categories, which may not cover the whole class). Classes/sub-categories receiving
 * nothing are still returned (the UI filters to `add > 0`).
 */
export function allocateContributionHierarchical(
  byAssetClass: Record<string, AllocationData>,
  bySubCategory: Record<string, AllocationData>,
  amount: number,
  labels: Record<string, string> = ASSET_CLASS_LABELS
): HierarchicalContributionSlice[] {
  const classSlices = allocateContribution(byAssetClass, amount, labels);
  const subsByClass = groupSubCategoriesByAssetClass(bySubCategory);

  return classSlices.map((slice) => {
    const subs = subsByClass[slice.assetClass];
    if (slice.add <= 0 || !subs || Object.keys(subs).length === 0) {
      return { ...slice, subSlices: [] };
    }

    const classNewTotal = slice.currentValue + slice.add;
    const subEntries = Object.entries(subs);
    const adds = splitTowardTarget(
      subEntries.map(([name, d]) => ({ key: name, currentValue: d.currentValue, targetPercentage: d.targetPercentage })),
      slice.add,
      classNewTotal
    );

    const subSlices: ContributionSlice[] = subEntries
      .map(([name, d]) => {
        const add = adds[name] ?? 0;
        const newValue = d.currentValue + add;
        return {
          // `assetClass` doubles as the React key here; for a sub-slice it holds the sub name.
          assetClass: name,
          label: name,
          add,
          currentValue: d.currentValue,
          newValue,
          // Weight is relative to the class's new total (sub-targets are class-relative).
          newPercentage: classNewTotal > 0 ? (newValue / classNewTotal) * 100 : 0,
          targetPercentage: d.targetPercentage,
        };
      })
      .sort((a, b) => b.add - a.add);

    return { ...slice, subSlices };
  });
}
