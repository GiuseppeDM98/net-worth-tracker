/**
 * Weight optimizer — proposes market weights for the PAC's Target step from the owner's ideal
 * allocation objectives (Allocazione › Accumulo › "Criteri del modello").
 *
 * Convex QP solved by ONE exact active-set method (`./activeSetQP`;
 * `projectOntoBudgetBox` of `./boxProjection` only seeds its start): every soft
 * objective (class / leverage / factor / group cap) is a linear row `r_k(w)` in
 * percentage points, penalised quadratically and weighted by its priority; a small regularisation
 * term (`EPSILON`) against the candidates' current market weight makes the optimum unique. Hard
 * constraints — the budget (Σw = 1) and each candidate's `[lowerPct, upperPct]` box — apply only
 * inside the projection, never as a penalty term.
 *
 * `ObjectiveReport.label` is built by `describeObjectiveLabel` (`weightOptimizerNarrative.ts`)
 * — the one place that turns a row's (kind, class, sub-category, group) into the
 * Italian text the panel and the report both read.
 *
 * Third mode, `'targeted'` («Con vendite mirate»): the same `J(w)` under a tax cap in euro plus
 * per-instrument «Non vendere» locks, each sale priced by the app's one rule (`candidateSaleTaxPerEuro`,
 * `./saleTax`). Where the cap does not bind it runs the Ideale pipeline inside the locks and
 * the cash floor; at cap 0 no taxed candidate goes below its held weight (Raggiungibile's floor, the untaxed rows
 * and the liquidity still free) — same `solveQP`, same bits — and only where it binds the tax-multiplier search
 * (`searchTaxMultiplier`) on the same solver.
 */
import type {
  Asset,
  AssetClass,
  AssetAllocationTarget,
  IdealAllocationSettings,
  ObjectivePriority,
} from '@/types/assets';
import { isCashAccount, isLoanAsset } from '@/types/assets';
import { LIQUIDITY_CANDIDATE_KEY } from '@/lib/constants/idealAllocation';
import { NO_SUBCATEGORY_LABEL, resolveAllocationRole, resolveAllocationRoleWithin, type AllocatableHolding } from './allocationUtils';
import { exposurePerEuro } from './accumulationPlanUtils';
import { dot, projectOntoBudgetBox } from './boxProjection';
import { solvePiecewiseQP, type PiecewiseQP } from './activeSetQP';
import { candidateSaleTaxPerEuro, type SaleTaxPerEuro } from './saleTax';
import { describeObjectiveLabel } from './weightOptimizerNarrative';

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

import type { ConflictReport, ObjectiveReport, OptimizerMode } from '@/types/optimizer';

export type { ConflictReport, ObjectiveReport, OptimizerMode } from '@/types/optimizer';
export { DEFAULT_IDEAL_ALLOCATION, LIQUIDITY_CANDIDATE_KEY } from '@/lib/constants/idealAllocation';

export interface OptimizerCandidate {
  key: string; // positionId when coming from the PAC, else assetId
  assetIds: string[]; // members (proxy group) — the first is NOT special
  buyAssetId: string;
  label: string;
  currentValueEur: number; // Σ member values
  exposurePerEuro: Partial<Record<AssetClass, number>>; // of the BUY asset
  factorPerEuro: Partial<Record<AssetClass, Record<string, number>>>; // class → subCategory → notional per €
  fixedValueEur: number; // Σ value of non-buy members (proxy) — held, never bought, never sold
  lowerPct: number; // 0..100, resolved bounds
  upperPct: number;
  /** Tax per € sold, read only by `'targeted'` (`candidateSaleTaxPerEuro`, the app's one rule); `null` =
   *  unknown cost basis or rate → never sold. Optional so the candidates of the other two modes need not
   *  carry it — absent reads as `null`. */
  taxPerEuroSold?: number | null;
}

export interface OptimizerInput {
  candidates: OptimizerCandidate[];
  baseEur: number; // B
  targets: AssetAllocationTarget; // the page's EFFECTIVE targets
  settings: IdealAllocationSettings;
  mode: OptimizerMode;
  /** L* — `deriveTargetLeverageRatio(targets)`, passed in by the caller. */
  targetLeverageRatio: number;
  /** Only with mode `'targeted'`, ignored otherwise; absent = cap 0, no lock. */
  sale?: OptimizerSaleInput;
}

export interface OptimizerSaleInput {
  taxCapEur: number;
  lockedKeys: string[];
  /** The allocation's cash quota in euro (`resolvePlanReserve(...).quotaEur`): the cash rows — the accounts and
   *  the money-market funds — never go under it together, nor under today's level when already below
   *  (owner, 2026-11-18). Absent = no floor. */
  cashFloorEur?: number;
}

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export type OptimizerWarning =
  | { code: 'factor_unmapped'; assetClass: AssetClass; subCategory: string }
  | { code: 'proxy_mismatch'; key: string }
  | { code: 'bound_conflict'; key: string }
  | { code: 'not_converged' };

export interface OptimizerResult {
  status: 'ok' | 'infeasible_bounds' | 'no_candidates';
  weights: Array<{ key: string; label: string; currentPct: number; proposedPct: number }>;
  objectives: ObjectiveReport[];
  conflicts: ConflictReport[]; // at most 3, largest improvement first
  warnings: OptimizerWarning[];
  iterations: number;
  converged: boolean;
  /** Only in `'targeted'`. */
  sale?: OptimizerSaleReport;
}

export interface OptimizerSaleReport {
  taxCapEur: number;
  /** The tax the Impostazioni limits force whatever the cap (a max below the held weight, a min
   *  above it with nothing to invest): when it exceeds `taxCapEur` it IS the cap (2026-11-12), and
   *  the total line says so. 0 in the common case. */
  minTaxEur: number;
  soldEur: number; // Σ max(0, cur − w) · B on the rounded weights, the instruments only
  taxEur: number; // Σ c_i · sold_i on the rounded weights, ≤ max(taxCapEur, minTaxEur)
  /** The euros the liquidity goes down by on the rounded weights, `max(0, cur − w) · B` of its candidate;
   *  0 when it is not a candidate (the editor's panel). Spent, never sold: out of `soldEur` and `taxEur`. */
  liquiditySpentEur: number;
  idealTaxEur: number; // what Ideale with the same locks would cost (before rounding)
  capBinding: boolean;
  perCandidate: Array<{ key: string; soldEur: number; taxEur: number }>;
}

/** Injectable only from tests, to force `not_converged` by capping the active set's steps. */
export interface SolverOptions {
  maxIterations?: number;
}

// ---------------------------------------------------------------------------
// Candidate construction
// ---------------------------------------------------------------------------

/** Notional € per € per (class, subCategory) — same rule as `exposurePerEuro`, one level deeper. */
function factorPerEuroOf(asset: Asset): Partial<Record<AssetClass, Record<string, number>>> {
  const leverage = asset.leverageRatio ?? 1;
  const result: Partial<Record<AssetClass, Record<string, number>>> = {};

  if (!asset.composition || asset.composition.length === 0) {
    const sub = asset.subCategory?.trim() || NO_SUBCATEGORY_LABEL;
    result[asset.assetClass] = { [sub]: leverage };
    return result;
  }

  for (const component of asset.composition) {
    const sub = component.subCategory?.trim() || NO_SUBCATEGORY_LABEL;
    const contribution = (component.percentage / 100) * leverage;
    const bucket = result[component.assetClass] ?? {};
    bucket[sub] = (bucket[sub] ?? 0) + contribution;
    result[component.assetClass] = bucket;
  }

  return result;
}

/** A candidate's tax per € sold as the optimizer reads it: exempt → 0, unknown → `null` (never sold). */
const toRate = (tax: SaleTaxPerEuro): number | null => (tax.kind === 'exempt' ? 0 : tax.kind === 'taxed' ? tax.perEuro : null);

function resolveCandidateBounds(
  key: string,
  buyAssetId: string,
  currentValueEur: number,
  fixedValueEur: number,
  settings: IdealAllocationSettings,
  mode: OptimizerMode,
  baseEur: number,
  warnings: OptimizerWarning[]
): { lowerPct: number; upperPct: number } {
  let lower = 0;
  let upper = 100;

  const limit = settings.instrumentLimits.find((l) => l.assetId === buyAssetId);
  if (limit) {
    if (limit.minPct !== undefined) lower = Math.max(lower, limit.minPct);
    if (limit.maxPct !== undefined) upper = Math.min(upper, limit.maxPct);
  }

  if (mode === 'reachable') {
    lower = Math.max(lower, baseEur > 0 ? (currentValueEur / baseEur) * 100 : 0);
  } else {
    lower = Math.max(lower, baseEur > 0 ? (fixedValueEur / baseEur) * 100 : 0);
  }

  // On hundredths, as every bound reaching `roundWeights`: a floor of today's share is an arbitrary real.
  lower = Math.floor(lower * 100 + 1e-9) / 100;

  if (lower > upper) {
    upper = lower;
    warnings.push({ code: 'bound_conflict', key });
  }

  return { lowerPct: lower, upperPct: upper };
}

export function buildOptimizerCandidates(input: {
  positions: Array<{ key: string; label: string; memberAssetIds: string[]; buyAssetId: string }>;
  assetsById: Map<string, Asset>;
  settings: IdealAllocationSettings;
  mode: OptimizerMode;
  baseEur: number;
  valueOf: (a: Asset) => number;
  /** «Con vendite mirate» only: the holdings that price a sale (`buildHoldings`); absent → no candidate is priced. */
  holdings?: readonly AllocatableHolding[];
}): { candidates: OptimizerCandidate[]; warnings: OptimizerWarning[] } {
  const { positions, assetsById, settings, mode, baseEur, valueOf } = input;
  const candidates: OptimizerCandidate[] = [];
  const warnings: OptimizerWarning[] = [];

  for (const position of positions) {
    const buyAsset = assetsById.get(position.buyAssetId);
    if (!buyAsset) continue;

    const memberAssets = position.memberAssetIds
      .map((id) => assetsById.get(id))
      .filter((a): a is Asset => a !== undefined);
    const currentValueEur = memberAssets.reduce((sum, a) => sum + valueOf(a), 0);
    const fixedValueEur = memberAssets
      .filter((a) => a.id !== position.buyAssetId)
      .reduce((sum, a) => sum + valueOf(a), 0);

    const exposure = exposurePerEuro(buyAsset);
    const factor = factorPerEuroOf(buyAsset);

    let proxyMismatch = false;
    for (const member of memberAssets) {
      if (member.id === position.buyAssetId) continue;
      const memberExposure = exposurePerEuro(member);
      const classes = new Set<AssetClass>([
        ...(Object.keys(exposure) as AssetClass[]),
        ...(Object.keys(memberExposure) as AssetClass[]),
      ]);
      for (const assetClass of classes) {
        if (Math.abs((exposure[assetClass] ?? 0) - (memberExposure[assetClass] ?? 0)) > 0.05) {
          proxyMismatch = true;
          break;
        }
      }
      if (proxyMismatch) break;
    }
    if (proxyMismatch) warnings.push({ code: 'proxy_mismatch', key: position.key });

    const { lowerPct, upperPct } = resolveCandidateBounds(
      position.key,
      position.buyAssetId,
      currentValueEur,
      fixedValueEur,
      settings,
      mode,
      baseEur,
      warnings
    );

    candidates.push({
      key: position.key,
      assetIds: position.memberAssetIds,
      buyAssetId: position.buyAssetId,
      label: position.label,
      currentValueEur,
      exposurePerEuro: exposure,
      factorPerEuro: factor,
      fixedValueEur,
      lowerPct,
      upperPct,
      taxPerEuroSold: input.holdings
        ? toRate(candidateSaleTaxPerEuro(position.buyAssetId, input.holdings))
        : undefined,
    });
  }

  return { candidates, warnings };
}

// ---------------------------------------------------------------------------
// Second-level gaps: instruments the optimizer's factor objectives cannot place,
// shown as a preventive warning (Impostazioni's IdealAllocationTile, OptimizerPanel before
// "Calcola") — never blocks the calculation, it just says which euros the sub-category rows will
// silently attribute to "Senza sottocategoria" or drop as `factor_unmapped`.
// ---------------------------------------------------------------------------

export interface SecondLevelGap {
  assetId: string;
  assetName: string;
  assetClass: AssetClass;
  /** Set only for a gap found on one component of a composite asset. */
  componentIndex?: number;
  /** 'missing' = no sub-category at all; 'unknown' = a sub-category the class's `subCategoryConfig` does not list. */
  reason: 'missing' | 'unknown';
}

/** Same normalisation as `factorPerEuroOf`/`calculateCurrentAllocationSnapshot`: trim, empty → `NO_SUBCATEGORY_LABEL`. */
function normalizeSubCategory(sub: string | undefined): string {
  return sub?.trim() || NO_SUBCATEGORY_LABEL;
}

/**
 * True when at least one of the given classes carries an enabled third-level
 * (`specificAssets`) target. Those targets are never a soft objective here: they are what the
 * optimizer computes, so the caller shows a declarative note instead of feeding them into `J(w)`.
 */
export function hasSpecificAssetTargets(targets: AssetAllocationTarget, assetClasses: AssetClass[]): boolean {
  return assetClasses.some((assetClass) => {
    const subTargets = targets[assetClass]?.subTargets;
    if (!subTargets) return false;
    return Object.values(subTargets).some(
      (value) => typeof value !== 'number' && (value.specificAssetsEnabled ?? (value.specificAssets?.length ?? 0) > 0)
    );
  });
}

export function findSecondLevelGaps(
  assets: Asset[],
  targets: AssetAllocationTarget,
  assetClasses: AssetClass[],
  valueOf: (a: Asset) => number
): SecondLevelGap[] {
  const scopedClasses = new Set(assetClasses);
  const gaps: SecondLevelGap[] = [];

  for (const asset of assets) {
    const role = resolveAllocationRole(asset);
    if (role !== 'tradable' && role !== 'frozen') continue;
    if (valueOf(asset) <= 0) continue;

    const checkSub = (assetClass: AssetClass, sub: string | undefined, componentIndex?: number) => {
      if (!scopedClasses.has(assetClass)) return;
      const categories = targets[assetClass]?.subCategoryConfig?.categories ?? [];
      const normalized = normalizeSubCategory(sub);
      if (normalized === NO_SUBCATEGORY_LABEL) {
        gaps.push({ assetId: asset.id, assetName: asset.name, assetClass, componentIndex, reason: 'missing' });
      } else if (!categories.includes(normalized)) {
        gaps.push({ assetId: asset.id, assetName: asset.name, assetClass, componentIndex, reason: 'unknown' });
      }
    };

    if (asset.composition && asset.composition.length > 0) {
      asset.composition.forEach((component, index) => checkSub(component.assetClass, component.subCategory, index));
    } else {
      checkSub(asset.assetClass, asset.subCategory);
    }
  }

  return gaps;
}

// ---------------------------------------------------------------------------
// Objective rows
// ---------------------------------------------------------------------------

const LAMBDA: Record<ObjectivePriority, number> = { essential: 1000, high: 100, medium: 10, low: 1 };
const EPSILON = 0.01;

interface ObjectiveRow {
  id: string;
  kind: ObjectiveReport['kind'];
  label: string;
  priority: ObjectivePriority;
  coeffs: number[]; // a_k, one per candidate
  constant: number; // b_k
  hinge: boolean;
  unit: 'pp' | 'x';
  targetValue: number;
}

function classTargetFraction(targetData: AssetAllocationTarget[string], baseEur: number): number {
  if (targetData.useFixedAmount) {
    return baseEur > 0 ? (targetData.fixedAmount ?? 0) / baseEur : 0;
  }
  return (targetData.targetPercentage || 0) / 100;
}

function classLeverageOf(candidate: OptimizerCandidate): number {
  return Object.values(candidate.exposurePerEuro).reduce((sum: number, v) => sum + (v ?? 0), 0);
}

function buildClassRows(candidates: OptimizerCandidate[], targets: AssetAllocationTarget, priority: ObjectivePriority, baseEur: number): ObjectiveRow[] {
  const rows: ObjectiveRow[] = [];
  for (const [assetClassKey, targetData] of Object.entries(targets)) {
    const assetClass = assetClassKey as AssetClass;
    const tc = classTargetFraction(targetData, baseEur);
    const exposureSum = candidates.reduce((sum, c) => sum + (c.exposurePerEuro[assetClass] ?? 0), 0);
    if (tc <= 0 && exposureSum <= 0) continue; // ignored: no target, no exposure

    rows.push({
      id: `class:${assetClass}`,
      kind: 'class',
      label: describeObjectiveLabel('class', assetClass),
      priority,
      coeffs: candidates.map((c) => 100 * (c.exposurePerEuro[assetClass] ?? 0)),
      constant: 100 * tc,
      hinge: false,
      unit: 'pp',
      targetValue: 100 * tc,
    });
  }
  return rows;
}

function buildLeverageRow(candidates: OptimizerCandidate[], priority: ObjectivePriority | 'off', targetLeverageRatio: number): ObjectiveRow | null {
  if (priority === 'off') return null;
  return {
    id: 'leverage',
    kind: 'leverage',
    label: describeObjectiveLabel('leverage'),
    priority,
    coeffs: candidates.map((c) => 100 * classLeverageOf(c)),
    constant: 100 * targetLeverageRatio,
    hinge: false,
    unit: 'x',
    targetValue: targetLeverageRatio,
  };
}

function subCategoryWeight(value: number | { targetPercentage: number }): number {
  return typeof value === 'number' ? value : value.targetPercentage;
}

function buildFactorRows(
  candidates: OptimizerCandidate[],
  targets: AssetAllocationTarget,
  factorObjectives: IdealAllocationSettings['factorObjectives'],
  baseEur: number,
  warnings: OptimizerWarning[]
): ObjectiveRow[] {
  const rows: ObjectiveRow[] = [];

  for (const { assetClass, priority } of factorObjectives) {
    const targetData = targets[assetClass];
    if (!targetData?.subCategoryConfig?.enabled) continue;
    const subTargets = targetData.subTargets;
    if (!subTargets || Object.keys(subTargets).length === 0) continue;
    const tc = classTargetFraction(targetData, baseEur);
    if (tc <= 0) continue;

    const weights: Record<string, number> = {};
    let weightSum = 0;
    for (const [sub, value] of Object.entries(subTargets)) {
      const pct = subCategoryWeight(value);
      weights[sub] = pct;
      weightSum += pct;
    }

    const subs = new Set<string>();
    for (const candidate of candidates) {
      const bucket = candidate.factorPerEuro[assetClass];
      if (bucket) for (const sub of Object.keys(bucket)) subs.add(sub);
    }
    for (const sub of Object.keys(weights)) subs.add(sub);

    for (const sub of subs) {
      const mapped = sub in weights && weightSum > 0;
      const rs = mapped ? weights[sub] / weightSum : 0;
      if (!mapped) warnings.push({ code: 'factor_unmapped', assetClass, subCategory: sub });

      rows.push({
        id: `factor:${assetClass}:${sub}`,
        kind: 'factor',
        label: describeObjectiveLabel('factor', assetClass, sub),
        priority,
        coeffs: candidates.map((c) => {
          const f = c.factorPerEuro[assetClass]?.[sub] ?? 0;
          const e = c.exposurePerEuro[assetClass] ?? 0;
          return (100 * (f - rs * e)) / tc;
        }),
        constant: 0,
        hinge: false,
        unit: 'pp',
        targetValue: rs * 100,
      });
    }
  }

  return rows;
}

function buildGroupRows(candidates: OptimizerCandidate[], groupLimits: IdealAllocationSettings['groupLimits']): ObjectiveRow[] {
  return groupLimits.map((group) => {
    const memberSet = new Set(group.assetIds);
    return {
      id: `group:${group.id}`,
      kind: 'group',
      label: describeObjectiveLabel('group', undefined, undefined, group.label),
      priority: group.priority,
      coeffs: candidates.map((c) => (memberSet.has(c.buyAssetId) ? 100 : 0)),
      constant: group.maxPct,
      hinge: true,
      unit: 'pp',
      targetValue: group.maxPct,
    };
  });
}

function buildObjectiveRows(
  candidates: OptimizerCandidate[],
  targets: AssetAllocationTarget,
  settings: IdealAllocationSettings,
  targetLeverageRatio: number,
  baseEur: number,
  warnings: OptimizerWarning[]
): ObjectiveRow[] {
  const rows: ObjectiveRow[] = [];
  rows.push(...buildClassRows(candidates, targets, settings.classPriority, baseEur));
  const leverageRow = buildLeverageRow(candidates, settings.leveragePriority, targetLeverageRatio);
  if (leverageRow) rows.push(leverageRow);
  rows.push(...buildFactorRows(candidates, targets, settings.factorObjectives, baseEur, warnings));
  rows.push(...buildGroupRows(candidates, settings.groupLimits));
  return rows;
}

function evaluateRow(row: ObjectiveRow, x: number[]): number {
  const raw = dot(row.coeffs, x) - row.constant;
  return row.hinge ? Math.max(0, raw) : raw;
}

/**
 * The row's un-hinged value — for a group cap this is the ACTUAL current metric (e.g. the
 * group's real weight sum minus its cap), never clamped to 0 when the cap isn't binding.
 * `evaluateRow`'s hinge clamp is right for the penalty and for `gapPp` ("how much over the cap"),
 * but using it for `achievedValue` made a group under its cap always report as sitting exactly AT
 * the cap (fixed 2026-09-19: `targetValue + gapPp` was `targetValue + 0` whenever the group was compliant, hiding its real weight).
 */
function evaluateRowRaw(row: ObjectiveRow, x: number[]): number {
  return dot(row.coeffs, x) - row.constant;
}

// ---------------------------------------------------------------------------
// Regularisation reference
// ---------------------------------------------------------------------------

/** `'targeted'` takes the `ideal` branch although it asks for the reachable reference (current
 *  weight on B, normalised): the vector is the same — (v/B)/Σ(v/B) = v/Σv — and this spelling keeps
 *  the cap-not-binding path bit-identical to Ideale. */
function computeWRef(candidates: OptimizerCandidate[], mode: OptimizerMode, baseEur: number): number[] {
  const n = candidates.length;
  const raw = candidates.map((c) => (mode === 'reachable' && baseEur > 0 ? c.currentValueEur / baseEur : c.currentValueEur));
  const sum = raw.reduce((s, v) => s + v, 0);
  if (sum <= 0) return new Array(n).fill(1 / n);
  return raw.map((v) => v / sum);
}

// ---------------------------------------------------------------------------
// Solver
// ---------------------------------------------------------------------------

function buildObjective(rows: ObjectiveRow[], wRef: number[], n: number): (x: number[]) => number {
  return (x: number[]): number => {
    let j = 0;
    for (const row of rows) {
      const r = evaluateRow(row, x);
      j += LAMBDA[row.priority] * r * r;
    }
    for (let i = 0; i < n; i++) {
      const d = 100 * (x[i] - wRef[i]);
      j += EPSILON * d * d;
    }
    return j;
  };
}

interface SolveResult {
  x: number[];
  iterations: number;
  converged: boolean;
}

/**
 * The ONE solver of Ideale, Raggiungibile and Con vendite mirate:
 * the exact active-set method of `./activeSetQP` at tax multiplier 0 — no kink, so a plain QP over
 * the budget and the box. `maxIterations` (tests only) is the active set's step cap.
 */
function solveQP(
  rows: ObjectiveRow[],
  n: number,
  wRef: number[],
  lo: number[],
  hi: number[],
  solverOptions?: SolverOptions
): SolveResult {
  const zeros = new Array<number>(n).fill(0);
  const solved = solveAtMultiplier(rows, wRef, zeros, zeros, lo, hi, 0, wRef, solverOptions?.maxIterations);
  return { x: solved.w, iterations: solved.iterations, converged: solved.converged };
}

// ---------------------------------------------------------------------------
// 2% heuristic
// ---------------------------------------------------------------------------

function applyMinWeightHeuristic(
  rows: ObjectiveRow[],
  n: number,
  wRef: number[],
  lo: number[],
  hiInit: number[],
  solverOptions?: SolverOptions
): { result: SolveResult; hi: number[] } {
  let hi = [...hiInit];
  let result = solveQP(rows, n, wRef, lo, hi, solverOptions);

  for (let pass = 0; pass < 5; pass++) {
    const small: number[] = [];
    for (let i = 0; i < n; i++) {
      if (result.x[i] < 0.02 && lo[i] === 0 && result.x[i] > 0) small.push(i);
    }
    if (small.length === 0) break;

    const candidateHi = [...hi];
    for (const i of small) candidateHi[i] = 0;
    const sumHi = candidateHi.reduce((s, v) => s + v, 0);
    if (sumHi < 1) break; // undo: keep the previous pass's result

    hi = candidateHi;
    result = solveQP(rows, n, wRef, lo, hi, solverOptions);
  }

  return { result, hi };
}

// ---------------------------------------------------------------------------
// Rounding: Σ = 100 exactly, every weight inside its bounds (2026-11-12)
// ---------------------------------------------------------------------------

/** Weights (fractions) on a grid of `steps` units: Σ = 100 exactly, each inside its bounds; null if impossible. */
function roundOnGrid(x: number[], lo: number[], hi: number[], steps: number): number[] | null {
  const loU = lo.map((l) => Math.ceil(steps * l - 1e-9));
  const hiU = hi.map((h) => Math.floor(steps * h + 1e-9));
  const sum = (v: number[]) => v.reduce((s, u) => s + u, 0);
  if (loU.some((l, i) => l > hiU[i]) || sum(loU) > steps || sum(hiU) < steps) return null;
  const units = x.map((xi, i) => Math.min(hiU[i], Math.max(loU[i], Math.floor(steps * xi + 1e-9))));
  const frac = x.map((xi, i) => steps * xi - units[i]);
  const byFrac = x.map((_, i) => i).sort((a, b) => frac[b] - frac[a] || x[b] - x[a] || a - b);
  let remaining = steps - sum(units);
  // Round robin until the sum is exact: up by the largest remainder, down by the smallest, never across a bound.
  while (remaining > 0) {
    const i = byFrac.find((k) => units[k] < hiU[k]);
    if (i === undefined) return null;
    units[i] += 1;
    remaining -= 1;
    frac[i] -= 1;
    byFrac.sort((a, b) => frac[b] - frac[a] || x[b] - x[a] || a - b);
  }
  while (remaining < 0) {
    const i = [...byFrac].reverse().find((k) => units[k] > loU[k]);
    if (i === undefined) return null;
    units[i] -= 1;
    remaining += 1;
    frac[i] += 1;
    byFrac.sort((a, b) => frac[b] - frac[a] || x[b] - x[a] || a - b);
  }
  return units.map((u) => (u * 100) / steps);
}

/** The proposed percentages: half points when the bounds allow them, else hundredths (a frozen 7,3%). */
export function roundWeights(x: number[], lo: number[], hi: number[]): number[] {
  return roundOnGrid(x, lo, hi, 200) ?? roundOnGrid(x, lo, hi, 10000) ?? x.map((xi) => xi * 100);
}

// ---------------------------------------------------------------------------
// Conflicts
// ---------------------------------------------------------------------------

function computeConflicts(
  rows: ObjectiveRow[],
  finalGaps: Map<string, number>,
  n: number,
  lo: number[],
  hi: number[],
  wRef: number[],
  solverOptions?: SolverOptions,
  /** Targeted mode, cap binding: re-solve without a row at the SAME tax multiplier. */
  solveWithout?: (remainingRows: ObjectiveRow[]) => number[]
): ConflictReport[] {
  const flagged = rows.filter((row) => Math.abs(finalGaps.get(row.id) ?? 0) > 0.25);
  const scored: Array<ConflictReport & { weightedSum: number }> = [];

  for (const removed of flagged) {
    const remainingRows = rows.filter((row) => row.id !== removed.id);
    let solvedX: number[];
    if (solveWithout) {
      solvedX = solveWithout(remainingRows);
    } else {
      solvedX = solveQP(remainingRows, n, wRef, lo, hi, solverOptions).x;
    }

    const improvements: ConflictReport['improvements'] = [];
    let weightedSum = 0;

    for (const other of flagged) {
      if (other.id === removed.id) continue;
      const fromGapPp = finalGaps.get(other.id) ?? 0;
      const toGapPp = evaluateRow(other, solvedX);
      const improvement = Math.abs(fromGapPp) - Math.abs(toGapPp);
      if (improvement >= 0.25) {
        improvements.push({ objectiveId: other.id, fromGapPp, toGapPp });
        weightedSum += improvement * LAMBDA[other.priority];
      }
    }

    if (improvements.length > 0) {
      scored.push({ removedObjectiveId: removed.id, improvements, weightedSum });
    }
  }

  scored.sort((a, b) => b.weightedSum - a.weightedSum || a.removedObjectiveId.localeCompare(b.removedObjectiveId));
  return scored.slice(0, 3).map(({ removedObjectiveId, improvements }) => ({ removedObjectiveId, improvements }));
}

// ---------------------------------------------------------------------------
// optimizeWeights
// ---------------------------------------------------------------------------

export function optimizeWeights(input: OptimizerInput, solverOptions?: SolverOptions): OptimizerResult {
  const { candidates, baseEur, targets, settings, mode, targetLeverageRatio } = input;
  const n = candidates.length;

  if (n === 0) {
    return { status: 'no_candidates', weights: [], objectives: [], conflicts: [], warnings: [], iterations: 0, converged: false };
  }
  if (mode === 'targeted') return optimizeTargeted(input, solverOptions);

  const sumLowerPct = candidates.reduce((sum, c) => sum + c.lowerPct, 0);
  const sumUpperPct = candidates.reduce((sum, c) => sum + c.upperPct, 0);
  if (sumLowerPct > 100 + 1e-9 || sumUpperPct < 100 - 1e-9) {
    return { status: 'infeasible_bounds', weights: [], objectives: [], conflicts: [], warnings: [], iterations: 0, converged: false };
  }

  const warnings: OptimizerWarning[] = [];
  const lo = candidates.map((c) => c.lowerPct / 100);
  const hiInit = candidates.map((c) => c.upperPct / 100);
  const wRef = computeWRef(candidates, mode, baseEur);

  const rows = buildObjectiveRows(candidates, targets, settings, targetLeverageRatio, baseEur, warnings);

  const { result, hi } = applyMinWeightHeuristic(rows, n, wRef, lo, hiInit, solverOptions);
  if (!result.converged) warnings.push({ code: 'not_converged' });

  const roundedPct = roundWeights(result.x, lo, hi);
  const { objectives, finalGaps } = reportObjectives(rows, roundedPct);
  const conflicts = computeConflicts(rows, finalGaps, n, lo, hi, wRef, solverOptions);

  return {
    status: 'ok',
    weights: weightsOf(candidates, baseEur, roundedPct),
    objectives,
    conflicts,
    warnings,
    iterations: result.iterations,
    converged: result.converged,
  };
}

function weightsOf(candidates: OptimizerCandidate[], baseEur: number, roundedPct: number[]): OptimizerResult['weights'] {
  return candidates.map((c, i) => ({
    key: c.key,
    label: c.label,
    currentPct: baseEur > 0 ? (c.currentValueEur / baseEur) * 100 : 0,
    proposedPct: roundedPct[i],
  }));
}

/** One report per objective row, all on the ROUNDED weights — shared by every mode. */
function reportObjectives(
  rows: ObjectiveRow[],
  roundedPct: number[]
): { objectives: ObjectiveReport[]; finalGaps: Map<string, number> } {
  const xRounded = roundedPct.map((p) => p / 100);

  const finalGaps = new Map<string, number>();
  const objectives: ObjectiveReport[] = rows.map((row) => {
    const gapPp = evaluateRow(row, xRounded);
    finalGaps.set(row.id, gapPp);
    const rawValue = evaluateRowRaw(row, xRounded);
    const achievedValue = row.unit === 'x' ? row.targetValue + rawValue / 100 : row.targetValue + rawValue;
    return {
      id: row.id,
      kind: row.kind,
      label: row.label,
      priority: row.priority,
      targetValue: row.targetValue,
      achievedValue,
      gapPp,
    };
  });

  return { objectives, finalGaps };
}

// ---------------------------------------------------------------------------
// «Con vendite mirate»: J(w) under a tax cap in euro and «Non vendere» locks
// ---------------------------------------------------------------------------

/** Below this many euro of tax the cap counts as met (float noise, never a real sale). */
const TAX_EPSILON_EUR = 1e-6;
/** The μ search stops once the tax sits within half a cent under the cap. */
const TAX_SEARCH_TOLERANCE_EUR = 0.005;
/** A candidate this close to its current weight is HELD: kept exact, off the grid. */
const HELD_TOLERANCE = 1e-6;
const HALF_POINT = 0.5;

/** A locked candidate, or one whose tax per € is unknown, never goes below its current weight.
 *  Applied here rather than in `resolveCandidateBounds`, so hand-built candidates honour it too;
 *  a lock above an Impostazioni max wins, with `bound_conflict` (the same rule as a min above a max). */
function applyTargetedLocks(
  candidates: OptimizerCandidate[],
  sale: OptimizerSaleInput | undefined,
  baseEur: number,
  warnings: OptimizerWarning[]
): { candidates: OptimizerCandidate[]; unsellable: boolean[] } {
  const locked = new Set(sale?.lockedKeys ?? []);
  const unsellable = candidates.map((c) => locked.has(c.key) || c.taxPerEuroSold === undefined || c.taxPerEuroSold === null);
  const bounded = candidates.map((c, i) => {
    if (!unsellable[i]) return c;
    const heldPct = baseEur > 0 ? (c.currentValueEur / baseEur) * 100 : 0;
    // A fixed share (a property, a frozen asset) is its value rounded to the hundredth: held exactly, and its
    // rounding is no clash of the owner's limits (2026-11-18).
    if (c.lowerPct === c.upperPct) return { ...c, lowerPct: heldPct, upperPct: heldPct };
    const lowerPct = Math.max(c.lowerPct, heldPct);
    if (lowerPct > c.upperPct) {
      warnings.push({ code: 'bound_conflict', key: c.key });
      return { ...c, lowerPct, upperPct: lowerPct };
    }
    return { ...c, lowerPct };
  });
  return { candidates: applyCashFloor(bounded, sale?.cashFloorEur, baseEur), unsellable };
}

/**
 * The cash quota as lower bounds: every cash row keeps the same share of what it holds — enough for the cash
 * rows together to stay at the quota, or all of it when they are already below. One row per bound keeps the
 * box a box (no joint constraint); a max in Impostazioni below that floor wins.
 */
function applyCashFloor(candidates: OptimizerCandidate[], cashFloorEur: number | undefined, baseEur: number): OptimizerCandidate[] {
  if (!cashFloorEur || cashFloorEur <= 0 || baseEur <= 0) return candidates;
  const heldPct = (c: OptimizerCandidate) => (c.currentValueEur / baseEur) * 100;
  const cashShare = (c: OptimizerCandidate) => Math.max(0, c.exposurePerEuro.cash ?? 0);
  const cashHeldPct = candidates.reduce((sum, c) => sum + cashShare(c) * heldPct(c), 0);
  if (cashHeldPct <= 0) return candidates;
  const keep = Math.min(1, ((cashFloorEur / baseEur) * 100) / cashHeldPct);
  return candidates.map((c) => {
    if (cashShare(c) <= 0 || c.lowerPct === c.upperPct) return c;
    const lowerPct = Math.min(c.upperPct, Math.max(c.lowerPct, heldPct(c) * keep));
    return lowerPct === c.lowerPct ? c : { ...c, lowerPct };
  });
}

/**
 * The least-tax point of the box: the held weights clamped — a max below the held weight is a sale
 * already — then, if they exceed 100%, the excess sold cheapest-first (a continuous knapsack: greedy
 * by rate is optimal). Buying costs nothing.
 */
function minimumTaxPoint(cur: number[], lo: number[], hi: number[], rate: number[]): number[] {
  const w = cur.map((c, i) => Math.min(Math.max(c, lo[i]), hi[i]));
  let excess = w.reduce((sum, v) => sum + v, 0) - 1;
  const order = cur.map((_, i) => i).sort((a, b) => rate[a] - rate[b] || a - b);
  for (const i of order) {
    if (excess <= 0) break;
    const take = Math.min(excess, w[i] - lo[i]);
    if (take <= 0) continue;
    w[i] -= take;
    excess -= take;
  }
  return w;
}

/** The tax of `minimumTaxPoint`: when the Impostazioni limits force more than the cap, it IS the cap (2026-11-12). */
function minimumTaxEur(cur: number[], lo: number[], hi: number[], rate: number[], baseEur: number): number {
  const w = minimumTaxPoint(cur, lo, hi, rate);
  return cur.reduce((sum, c, i) => sum + rate[i] * Math.max(0, c - w[i]), 0) * baseEur;
}

/**
 * The lower bounds that sell no taxed candidate below the least-tax point: with nothing forced, every
 * taxed candidate held at its weight (what «Raggiungibile» does); with a forced sale, the forced part
 * only. The untaxed candidates (a loss, the liquidity) keep their own bounds.
 */
function leastTaxLowerBounds(cur: number[], lo: number[], hi: number[], rate: number[]): number[] {
  const floor = minimumTaxPoint(cur, lo, hi, rate);
  return lo.map((l, i) => (rate[i] > 0 ? Math.max(l, floor[i]) : l));
}

/**
 * `J(w)` as `½xᵀGx − qᵀx` (+ a constant) over x = [w; t], one slack `t_k ≥ 0` per hinge row:
 * `max(0, r)² = min_{t ≥ 0} (r + t)²`, so a group cap stays exact inside a single quadratic, and the
 * ε term keeps G positive definite (`./activeSetQP`'s requirement).
 */
function buildQuadratic(rows: ObjectiveRow[], wRef: number[], n: number): { G: number[][]; q: number[]; hingeRows: ObjectiveRow[] } {
  const hingeRows = rows.filter((row) => row.hinge);
  const m = n + hingeRows.length;
  const G = Array.from({ length: m }, () => new Array<number>(m).fill(0));
  const q = new Array<number>(m).fill(0);
  let slack = n;
  for (const row of rows) {
    const l2 = 2 * LAMBDA[row.priority];
    const a = row.coeffs;
    for (let i = 0; i < n; i++) {
      if (a[i] === 0) continue;
      q[i] += l2 * row.constant * a[i];
      for (let j = 0; j < n; j++) G[i][j] += l2 * a[i] * a[j];
    }
    if (row.hinge) {
      for (let i = 0; i < n; i++) {
        G[i][slack] += l2 * a[i];
        G[slack][i] += l2 * a[i];
      }
      G[slack][slack] += l2;
      q[slack] += l2 * row.constant;
      slack += 1;
    }
  }
  const e = 2 * EPSILON * 100 * 100;
  for (let i = 0; i < n; i++) {
    G[i][i] += e;
    q[i] += e * wRef[i];
  }
  return { G, q, hingeRows };
}

interface TargetedSolve {
  w: number[];
  iterations: number;
  converged: boolean;
}

/** One exact solve of `J(w) + μ·tax(w)` over the box, warm-started from `start` (w only). */
function solveAtMultiplier(
  rows: ObjectiveRow[],
  wRef: number[],
  cur: number[],
  rateEurPerUnit: number[],
  lo: number[],
  hi: number[],
  mu: number,
  start: number[],
  maxIterations?: number
): TargetedSolve {
  const n = cur.length;
  const { G, q, hingeRows } = buildQuadratic(rows, wRef, n);
  const w0 = projectOntoBudgetBox(start, lo, hi, 1);
  const t0 = hingeRows.map((row) => Math.max(0, row.constant - dot(row.coeffs, w0)));
  const problem: PiecewiseQP = {
    G,
    q,
    e: [...new Array<number>(n).fill(1), ...new Array<number>(hingeRows.length).fill(0)],
    total: 1,
    lo: [...lo, ...new Array<number>(hingeRows.length).fill(0)],
    hi: [...hi, ...new Array<number>(hingeRows.length).fill(Infinity)],
    kinks: [
      ...cur.map((c, i) => (mu > 0 && rateEurPerUnit[i] > 0 ? { at: c, slopeBelow: -mu * rateEurPerUnit[i] } : null)),
      ...new Array<null>(hingeRows.length).fill(null),
    ],
  };
  const solved = solvePiecewiseQP(problem, [...w0, ...t0], maxIterations);
  return { w: solved.x.slice(0, n), iterations: solved.iterations, converged: solved.converged };
}

/**
 * The smallest μ whose solution keeps the tax under `capEur`: tax(μ) is continuous,
 * non-increasing and piecewise linear, so after bracketing (×4 from 1 — μ is in J per € of tax,
 * the scale that took a first prototype's 54 solves down to ~12) the Illinois variant of regula falsi
 * lands on the cap in a handful of exact solves. Always returns the feasible side of the bracket.
 */
function searchTaxMultiplier(
  solve: (mu: number, start: number[]) => TargetedSolve,
  taxOf: (w: number[]) => number,
  capEur: number,
  atZero: TargetedSolve
): { mu: number; solve: TargetedSolve; iterations: number; converged: boolean } {
  let iterations = atZero.iterations;
  let converged = atZero.converged;
  const run = (mu: number, start: number[]) => {
    const r = solve(mu, start);
    iterations += r.iterations;
    converged = converged && r.converged;
    return r;
  };

  let muLo = 0;
  let fLo = taxOf(atZero.w) - capEur;
  if (fLo <= TAX_EPSILON_EUR) return { mu: 0, solve: atZero, iterations, converged };

  let muHi = 1;
  let hiSolve = run(muHi, atZero.w);
  let fHi = taxOf(hiSolve.w) - capEur;
  for (let k = 0; k < 60 && fHi > TAX_EPSILON_EUR; k++) {
    muLo = muHi;
    fLo = fHi;
    muHi *= 4;
    hiSolve = run(muHi, hiSolve.w);
    fHi = taxOf(hiSolve.w) - capEur;
  }
  if (fHi > TAX_EPSILON_EUR) return { mu: muHi, solve: hiSolve, iterations, converged: false };

  let fHiTrue = fHi;
  let fLoWeighted = fLo;
  let fHiWeighted = fHi;
  let side = 0;
  for (let k = 0; k < 100; k++) {
    if (fHiTrue >= -TAX_SEARCH_TOLERANCE_EUR || muHi - muLo <= 1e-12 * muHi) break;
    let mu = (muLo * fHiWeighted - muHi * fLoWeighted) / (fHiWeighted - fLoWeighted);
    if (!(mu > muLo && mu < muHi)) mu = (muLo + muHi) / 2;
    const mid = run(mu, hiSolve.w);
    const f = taxOf(mid.w) - capEur;
    if (f > TAX_EPSILON_EUR) {
      muLo = mu;
      fLoWeighted = f;
      if (side === -1) fHiWeighted /= 2;
      side = -1;
    } else {
      muHi = mu;
      hiSolve = mid;
      fHiTrue = f;
      fHiWeighted = f;
      if (side === 1) fLoWeighted /= 2;
      side = 1;
    }
  }
  return { mu: muHi, solve: hiSolve, iterations, converged };
}

/**
 * Rounding that never invents a sale nor grows one: a HELD candidate stays at its current
 * weight exactly (off the grid), a candidate in SALE rounds towards its current weight (sells
 * less), a candidate in PURCHASE rounds by largest remainder without going below its current
 * weight. Held weights are off the grid, so one purchase absorbs the fraction left over; the total
 * is 100 to float precision. Every step only ever shrinks a sale, so tax(rounded) ≤ tax(raw), and
 * every step stays inside the candidate's bounds — a min above the held weight included (2026-11-12).
 */
function roundTargeted(x: number[], cur: number[], lo: number[], hi: number[]): number[] {
  const n = x.length;
  const xp = x.map((v) => v * 100);
  const cp = cur.map((v) => v * 100);
  const lp = lo.map((v) => v * 100);
  const hp = hi.map((v) => v * 100);
  const ceilGrid = (v: number) => Math.ceil(v / HALF_POINT - 1e-9) * HALF_POINT;
  const floorGrid = (v: number) => Math.floor(v / HALF_POINT + 1e-9) * HALF_POINT;
  const nextGrid = (v: number) => (Math.floor(v / HALF_POINT + 1e-9) + 1) * HALF_POINT;
  const prevGrid = (v: number) => (Math.ceil(v / HALF_POINT - 1e-9) - 1) * HALF_POINT;

  const kind: Array<'held' | 'sold' | 'bought'> = new Array(n);
  const r = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    if (Math.abs(x[i] - cur[i]) < HELD_TOLERANCE) {
      kind[i] = 'held';
      r[i] = Math.min(Math.max(cp[i], lp[i]), hp[i]);
    } else if (x[i] < cur[i]) {
      kind[i] = 'sold';
      r[i] = Math.min(ceilGrid(xp[i]), cp[i], hp[i]);
    } else {
      kind[i] = 'bought';
      r[i] = Math.min(Math.max(floorGrid(xp[i]), cp[i], lp[i]), hp[i]);
    }
  }

  let gap = 100 - r.reduce((sum, v) => sum + v, 0);
  const bought = r.map((_, i) => i).filter((i) => kind[i] === 'bought');
  const byRemainderDesc = [...bought].sort((a, b) => xp[b] - r[b] - (xp[a] - r[a]) || xp[b] - xp[a] || a - b);

  if (gap > 1e-9) {
    for (let pass = 0; pass < 400 && gap > 1e-9; pass++) {
      let moved = false;
      for (const i of byRemainderDesc) {
        if (gap <= 1e-9) break;
        const take = Math.min(nextGrid(r[i]) - r[i], gap, hp[i] - r[i]);
        if (take > 1e-12) {
          r[i] += take;
          gap -= take;
          moved = true;
        }
      }
      if (!moved) break;
    }
    // No purchase has room left: sell less (a sale back towards its current weight), then buy anywhere.
    for (let i = 0; i < n && gap > 1e-9; i++) {
      if (kind[i] !== 'sold') continue;
      const take = Math.min(gap, cp[i] - r[i], hp[i] - r[i]);
      r[i] += take;
      gap -= take;
    }
    for (let i = 0; i < n && gap > 1e-9; i++) {
      const take = Math.min(gap, hp[i] - r[i]);
      if (take > 0) {
        r[i] += take;
        gap -= take;
      }
    }
  } else if (gap < -1e-9) {
    const byRemainderAsc = [...byRemainderDesc].reverse();
    for (let pass = 0; pass < 400 && gap < -1e-9; pass++) {
      let moved = false;
      for (const i of byRemainderAsc) {
        if (gap >= -1e-9) break;
        const take = Math.min(r[i] - Math.max(cp[i], lp[i], prevGrid(r[i])), -gap);
        if (take > 1e-12) {
          r[i] -= take;
          gap += take;
          moved = true;
        }
      }
      if (!moved) break;
    }
    // Purchases are at their current weight: give back part of a sale's rounding, never below the raw sale.
    for (let i = 0; i < n && gap < -1e-9; i++) {
      if (kind[i] !== 'sold') continue;
      const take = Math.min(-gap, r[i] - xp[i]);
      r[i] -= take;
      gap += take;
    }
  }
  // `Math.ceil(-0.3)` is −0: normalise it, or the dialog would print «−0,0 %».
  return r.map((v) => v + 0);
}

interface TargetedCore {
  candidates: OptimizerCandidate[];
  unsellable: boolean[];
  rows: ObjectiveRow[];
  warnings: OptimizerWarning[];
  wRef: number[];
  cur: number[];
  rate: number[];
  loUsed: number[];
  hi: number[];
  x: number[];
  objectiveValue: number;
  taxOf: (w: number[]) => number;
  taxCapEur: number;
  minTaxEur: number;
  capEur: number;
  idealTaxEur: number;
  capBinding: boolean;
  iterations: number;
  converged: boolean;
  solveWithout?: (remainingRows: ObjectiveRow[]) => number[];
}

/**
 * Everything up to the raw (unrounded) weights; `null` when the bounds cannot reach 100% — the check
 * `optimizeWeights` runs for the other two modes, repeated here because this mode is handed over first.
 */
function solveTargetedCore(input: OptimizerInput, solverOptions?: SolverOptions): TargetedCore | null {
  const { baseEur, targets, settings, targetLeverageRatio } = input;
  const warnings: OptimizerWarning[] = [];
  const { candidates, unsellable } = applyTargetedLocks(input.candidates, input.sale, baseEur, warnings);
  const n = candidates.length;

  const sumLowerPct = candidates.reduce((sum, c) => sum + c.lowerPct, 0);
  const sumUpperPct = candidates.reduce((sum, c) => sum + c.upperPct, 0);
  if (sumLowerPct > 100 + 1e-9 || sumUpperPct < 100 - 1e-9) return null;

  const taxCapEur = Math.max(0, input.sale?.taxCapEur ?? 0);
  const lo = candidates.map((c) => c.lowerPct / 100);
  const hiInit = candidates.map((c) => c.upperPct / 100);
  const cur = candidates.map((c) => (baseEur > 0 ? c.currentValueEur / baseEur : 0));
  // An unsellable candidate never sells (lo ≥ cur), so its rate is irrelevant: 0 keeps the sums clean.
  const rate = candidates.map((c, i) => (unsellable[i] ? 0 : (c.taxPerEuroSold ?? 0)));
  const rateEurPerUnit = rate.map((r) => r * baseEur);
  const taxOf = (w: number[]) => cur.reduce((sum, c, i) => sum + rateEurPerUnit[i] * Math.max(0, c - w[i]), 0);
  const wRef = computeWRef(candidates, 'targeted', baseEur);

  const rows = buildObjectiveRows(candidates, targets, settings, targetLeverageRatio, baseEur, warnings);
  const objective = buildObjective(rows, wRef, n);

  const minTaxEur = minimumTaxEur(cur, lo, hiInit, rate, baseEur);
  const capEur = Math.max(taxCapEur, minTaxEur);

  // Path 1 — μ = 0: Ideale's own pipeline with these bounds. If it fits, it IS Ideale.
  const ideal = applyMinWeightHeuristic(rows, n, wRef, lo, hiInit, solverOptions);
  const idealTaxEur = taxOf(ideal.result.x);

  let x: number[];
  let hi: number[];
  let loUsed = lo;
  let iterations: number;
  let converged: boolean;
  let capBinding: boolean;
  let solveWithout: ((remainingRows: ObjectiveRow[]) => number[]) | undefined;

  if (idealTaxEur <= capEur + TAX_EPSILON_EUR) {
    x = ideal.result.x;
    hi = ideal.hi;
    iterations = ideal.result.iterations;
    converged = ideal.result.converged;
    capBinding = false;
  } else if (capEur <= TAX_EPSILON_EUR) {
    // Path 2 — cap 0 and nothing forced: no taxed candidate below its weight (Raggiungibile's floor; the
    // untaxed rows and the liquidity may still move).
    const loForced = leastTaxLowerBounds(cur, lo, hiInit, rate);
    const untaxed = applyMinWeightHeuristic(rows, n, wRef, loForced, hiInit, solverOptions);
    x = untaxed.result.x;
    hi = untaxed.hi;
    loUsed = loForced;
    iterations = untaxed.result.iterations;
    converged = untaxed.result.converged;
    capBinding = true;
  } else {
    // Path 3 — the cap binds: exact solves of J(w) + μ·tax(w), μ searched so that tax = cap.
    const solveWith = (hiBox: number[]) => (mu: number, start: number[]) =>
      solveAtMultiplier(rows, wRef, cur, rateEurPerUnit, lo, hiBox, mu, start, solverOptions?.maxIterations);
    const runSearch = (hiBox: number[], start: number[]) => {
      const solve = solveWith(hiBox);
      return searchTaxMultiplier(solve, taxOf, capEur, solve(0, start));
    };

    hi = [...hiInit];
    let search = runSearch(hi, wRef);
    let mu = search.mu;
    x = search.solve.w;
    iterations = search.iterations;
    converged = search.converged;

    // The 2% heuristic, at the multiplier found: zeroing a small weight is a sale, so it
    // stands only if the tax stays under the cap. A buy from zero (nothing held) is zeroed as in
    // the other modes: if moving its weight elsewhere tips the tax over, μ is searched again.
    for (let pass = 0; pass < 5; pass++) {
      const small: number[] = [];
      for (let i = 0; i < n; i++) if (x[i] < 0.02 && lo[i] === 0 && x[i] > 0) small.push(i);
      if (small.length === 0) break;

      const zeroed = (set: number[]) => {
        const next = [...hi];
        for (const i of set) next[i] = 0;
        return next;
      };
      const hiAll = zeroed(small);
      if (hiAll.reduce((s, v) => s + v, 0) < 1) break;
      const tryAll = solveWith(hiAll)(mu, x);
      iterations += tryAll.iterations;
      converged = converged && tryAll.converged;
      if (taxOf(tryAll.w) <= capEur + TAX_EPSILON_EUR) {
        hi = hiAll;
        x = tryAll.w;
        continue;
      }
      const fromZero = small.filter((i) => cur[i] === 0);
      if (fromZero.length === 0) break;
      const hiFromZero = zeroed(fromZero);
      if (hiFromZero.reduce((s, v) => s + v, 0) < 1) break;
      search = runSearch(hiFromZero, x);
      hi = hiFromZero;
      mu = search.mu;
      x = search.solve.w;
      iterations += search.iterations;
      converged = converged && search.converged;
    }

    if (!converged || taxOf(x) > capEur + TAX_EPSILON_EUR) {
      // The exact search did not finish: no taxed candidate goes below the least-tax point, so the
      // tax is at most minTaxEur ≤ capEur — said with `not_converged`, never over the cap (2026-11-12).
      converged = false;
      const loForced = leastTaxLowerBounds(cur, lo, hiInit, rate);
      const forced = applyMinWeightHeuristic(rows, n, wRef, loForced, hiInit, solverOptions);
      x = forced.result.x;
      hi = forced.hi;
      loUsed = loForced;
    } else {
      const finalHi = hi;
      const finalMu = mu;
      const finalX = x;
      solveWithout = (remainingRows) =>
        solveAtMultiplier(remainingRows, wRef, cur, rateEurPerUnit, lo, finalHi, finalMu, finalX).w;
    }
    capBinding = true;
  }
  if (!converged) warnings.push({ code: 'not_converged' });

  return {
    candidates,
    unsellable,
    rows,
    warnings,
    wRef,
    cur,
    rate,
    loUsed,
    hi,
    x,
    objectiveValue: objective(x),
    taxOf,
    taxCapEur,
    minTaxEur,
    capEur,
    idealTaxEur,
    capBinding,
    iterations,
    converged,
    solveWithout,
  };
}

/**
 * Test-only window on the raw solution: tax and `J` are monotone in the cap BEFORE rounding — after
 * it they are not (half a point of the base is a sale whose tax jumps by a step), so the
 * monotonicity test reads these.
 */
export function targetedRawSolution(input: OptimizerInput): { weights: number[]; taxEur: number; objectiveValue: number; capBinding: boolean } | null {
  const core = solveTargetedCore({ ...input, mode: 'targeted' });
  if (!core) return null;
  return { weights: core.x, taxEur: core.taxOf(core.x), objectiveValue: core.objectiveValue, capBinding: core.capBinding };
}

function optimizeTargeted(input: OptimizerInput, solverOptions?: SolverOptions): OptimizerResult {
  const core = solveTargetedCore(input, solverOptions);
  if (!core) {
    return { status: 'infeasible_bounds', weights: [], objectives: [], conflicts: [], warnings: [], iterations: 0, converged: false };
  }
  const { candidates, unsellable, rows, warnings, wRef, cur, rate, loUsed, hi, x, taxOf, capEur } = core;
  const { baseEur } = input;
  const n = candidates.length;

  // Ideale's own rounding when it neither sells a locked instrument, nor breaks the cap, nor a lower
  // bound — so a cap that does not bind shows Ideale's weights to the half point; otherwise the
  // rounding that only ever shrinks a sale.
  const plainRounded = roundWeights(x, loUsed, hi);
  const plainOk =
    taxOf(plainRounded.map((p) => p / 100)) <= capEur + TAX_EPSILON_EUR &&
    plainRounded.every((p, i) => !unsellable[i] || p >= cur[i] * 100 - 1e-9) &&
    plainRounded.every((p, i) => p >= loUsed[i] * 100 - 1e-9) &&
    Math.abs(plainRounded.reduce((s, v) => s + v, 0) - 100) < 1e-9;
  const roundedPct = plainOk ? plainRounded : roundTargeted(x, cur, loUsed, hi);

  const { objectives, finalGaps } = reportObjectives(rows, roundedPct);
  const conflicts = computeConflicts(rows, finalGaps, n, loUsed, hi, wRef, solverOptions, core.solveWithout);

  // Spending the liquidity is not a sale (2026-11-12): its row sells and pays nothing, and the euros
  // it goes down by are reported apart, so `soldEur` and `taxEur` sum the instruments only.
  const outEurOf = (i: number) => (Math.max(0, cur[i] * 100 - roundedPct[i]) / 100) * baseEur;
  const perCandidate = candidates.map((c, i) => {
    if (c.key === LIQUIDITY_CANDIDATE_KEY) return { key: c.key, soldEur: 0, taxEur: 0 };
    const soldEur = outEurOf(i);
    return { key: c.key, soldEur, taxEur: rate[i] * soldEur };
  });
  const liquidityIndex = candidates.findIndex((c) => c.key === LIQUIDITY_CANDIDATE_KEY);
  const liquiditySpentEur = liquidityIndex === -1 ? 0 : outEurOf(liquidityIndex);

  return {
    status: 'ok',
    weights: weightsOf(candidates, baseEur, roundedPct),
    objectives,
    conflicts,
    warnings,
    iterations: core.iterations,
    converged: core.converged,
    sale: {
      taxCapEur: core.taxCapEur,
      minTaxEur: core.minTaxEur,
      soldEur: perCandidate.reduce((sum, p) => sum + p.soldEur, 0),
      taxEur: perCandidate.reduce((sum, p) => sum + p.taxEur, 0),
      liquiditySpentEur,
      idealTaxEur: core.idealTaxEur,
      capBinding: core.capBinding,
      perCandidate,
    },
  };
}

// ---------------------------------------------------------------------------
// Shared candidate + solve pipeline (extracted from OptimizerPanel's own `result` useMemo,
// so the PAC's Ottimizzato view and Allocazione's standalone `IdealCompositionDialog` never
// duplicate the "build candidates, then optimize" wiring).
// ---------------------------------------------------------------------------

export function runOptimizer(input: {
  positions: Array<{ key: string; label: string; memberAssetIds: string[]; buyAssetId: string }>;
  assetsById: Map<string, Asset>;
  settings: IdealAllocationSettings;
  mode: OptimizerMode;
  baseEur: number;
  valueOf: (a: Asset) => number;
  targets: AssetAllocationTarget;
  targetLeverageRatio: number;
  /** A frozen candidate is fixed to its current share (lowerPct = upperPct); applied to the
   *  freshly-built candidates, before `optimizeWeights` runs. `OptimizerPanel` never passes it: a
   *  PAC position already resolves this through `resolveCandidateBounds`'s own `fixedValueEur` term. */
  fixBounds?: (candidate: OptimizerCandidate) => Partial<Pick<OptimizerCandidate, 'lowerPct' | 'upperPct'>>;
  /** Only with mode `'targeted'`. */
  sale?: OptimizerSaleInput;
  /** Only with mode `'targeted'`: the holdings that price each candidate's sale. */
  holdings?: readonly AllocatableHolding[];
}): OptimizerResult {
  const { candidates } = buildOptimizerCandidates({
    positions: input.positions,
    assetsById: input.assetsById,
    settings: input.settings,
    mode: input.mode,
    baseEur: input.baseEur,
    valueOf: input.valueOf,
    holdings: input.holdings,
  });
  const finalCandidates = input.fixBounds ? candidates.map((c) => ({ ...c, ...input.fixBounds!(c) })) : candidates;

  return optimizeWeights({
    candidates: finalCandidates,
    baseEur: input.baseEur,
    targets: input.targets,
    settings: input.settings,
    mode: input.mode,
    targetLeverageRatio: input.targetLeverageRatio,
    ...(input.sale ? { sale: input.sale } : {}),
  });
}

/**
 * What a GIVEN set of weights reaches against the objectives (the Obiettivi tile with an active
 * plan shows the plan's end state, not a calculation). Same candidates and rows as `runOptimizer`,
 * no solver: `weightsPctByKey` is the market weight of each position at the end of the plan, as a
 * percentage of the base, and is rescaled to Σ = 100.
 */
export function evaluateObjectivesAt(input: {
  positions: Array<{ key: string; label: string; memberAssetIds: string[]; buyAssetId: string }>;
  assetsById: Map<string, Asset>;
  settings: IdealAllocationSettings;
  baseEur: number;
  valueOf: (a: Asset) => number;
  targets: AssetAllocationTarget;
  targetLeverageRatio: number;
  weightsPctByKey: Record<string, number>;
}): ObjectiveReport[] {
  const { candidates } = buildOptimizerCandidates({
    positions: input.positions,
    assetsById: input.assetsById,
    settings: input.settings,
    mode: 'reachable',
    baseEur: input.baseEur,
    valueOf: input.valueOf,
  });
  if (candidates.length === 0) return [];
  const raw = candidates.map((c) => Math.max(0, input.weightsPctByKey[c.key] ?? 0));
  const total = raw.reduce((sum, v) => sum + v, 0);
  if (total <= 0) return [];
  const pct = raw.map((v) => (v / total) * 100);
  const warnings: OptimizerWarning[] = [];
  const rows = buildObjectiveRows(candidates, input.targets, input.settings, input.targetLeverageRatio, input.baseEur, warnings);
  return reportObjectives(rows, pct).objectives;
}

// ---------------------------------------------------------------------------
// Allocazione's standalone tool (`IdealCompositionDialog`, the criteria's «Prova»): the whole page's base as
// candidates (2026-11-12). The instruments one each (a group of equivalent instruments ONE, as the PAC treats
// it), every property fixed at its value net of its loans, and «Liquidità» — the accounts net of the personal
// loans — as ONE candidate that is never saved: the model says how much stays on the accounts.
// ---------------------------------------------------------------------------

export interface StandaloneCandidates {
  positions: Array<{ key: string; label: string; memberAssetIds: string[]; buyAssetId: string }>;
  fixBounds: (candidate: OptimizerCandidate) => Partial<Pick<OptimizerCandidate, 'lowerPct' | 'upperPct'>>;
  /** The assets plus the liquidity's stand-in, for `runOptimizer`'s `assetsById`. */
  assetsById: Map<string, Asset>;
  /** Net value: a property net of its loans, the stand-in = the liquidity net of the other loans. */
  valueOf: (asset: Asset) => number;
  /** The page's base: Σ of the candidates' current values. The amount to invest is inside it. */
  baseEur: number;
  /** Fixed candidates below zero: the optimizer cannot run on this base. */
  negativeFixedKeys: string[];
  /** The fixed candidates — the properties and the frozen instruments — whose weight only rounds (2026-11-17). */
  fixedKeys: string[];
  /** The accounts net of the personal loans; below zero it is declared, the run proceeds. */
  liquidityEur: number;
  /** The instrument positions — neither «Liquidità» nor a property: with none, nothing can be bought. */
  instrumentCount: number;
}

/** A bound on hundredths, as `roundWeights` reads every bound. */
const onHundredths = (pct: number): number => Math.round(pct * 100) / 100;

export function buildStandaloneCandidates(
  assets: Asset[],
  valueOf: (a: Asset) => number,
  /** Taken from the accounts; 0 in «Ideale» and in the criteria's «Prova». */
  investEur: number,
  /** The model portfolio's instruments to evaluate at 0 shares: in even with no value. */
  evaluateAssetIds: ReadonlySet<string> = new Set(),
  /** The model's groups of equivalent instruments: ONE candidate each, as the PAC treats them. */
  groups: ReadonlyArray<{ buyAssetId: string; memberAssetIds: string[] }> = []
): StandaloneCandidates {
  const inBase = assets.filter((a) => resolveAllocationRoleWithin(a, assets) !== 'excluded');
  const properties = inBase.filter((a) => a.type === 'realestate');
  const propertyIds = new Set(properties.map((a) => a.id));
  const loanEur = (a: Asset) => (isLoanAsset(a) ? valueOf(a) : 0);
  const netOf = (p: Asset) => valueOf(p) + inBase.filter((l) => l.financedAssetId === p.id).reduce((s, l) => s + loanEur(l), 0);
  // An account, a personal loan and a loan on anything but a property in the base are the liquidity.
  const liquidityEur = inBase
    .filter((a) => isCashAccount(a) || (isLoanAsset(a) && !propertyIds.has(a.financedAssetId ?? '')))
    .reduce((s, a) => s + valueOf(a), 0);
  // Never stored: it lives only in this calculation.
  const standIn = {
    id: LIQUIDITY_CANDIDATE_KEY,
    name: 'Liquidità',
    type: 'cash',
    assetClass: 'cash',
    quantity: 1,
    currentPrice: 1,
    currency: 'EUR',
  } as Asset;
  const instruments = inBase.filter(
    (a) =>
      !isCashAccount(a) &&
      !isLoanAsset(a) &&
      a.type !== 'realestate' &&
      (valueOf(a) > 0 || (evaluateAssetIds.has(a.id) && resolveAllocationRole(a) === 'tradable'))
  );
  const value = (a: Asset) => (a.id === LIQUIDITY_CANDIDATE_KEY ? liquidityEur : propertyIds.has(a.id) ? netOf(a) : valueOf(a));
  const baseEur =
    liquidityEur + properties.reduce((s, p) => s + netOf(p), 0) + instruments.reduce((s, a) => s + valueOf(a), 0);
  // The liquidity may go down by what is invested, never below zero; rounded DOWN to the hundredth.
  const liquidityFloorPct =
    investEur > 0 && baseEur > 0 ? Math.floor((Math.max(0, liquidityEur - investEur) / baseEur) * 10000) / 100 : undefined;

  const instrumentIds = new Set(instruments.map((a) => a.id));
  const groupByBuyer = new Map<string, string[]>();
  const grouped = new Set<string>();
  for (const group of groups) {
    if (!instrumentIds.has(group.buyAssetId) || grouped.has(group.buyAssetId)) continue;
    const members = group.memberAssetIds.filter((id) => instrumentIds.has(id) && (id === group.buyAssetId || !grouped.has(id)));
    if (members.length < 2) continue;
    groupByBuyer.set(group.buyAssetId, [group.buyAssetId, ...members.filter((id) => id !== group.buyAssetId)]);
    for (const id of members) grouped.add(id);
  }
  const instrumentPositions = instruments
    .filter((a) => !grouped.has(a.id) || groupByBuyer.has(a.id))
    .map((a) => ({ key: a.id, label: a.name, memberAssetIds: groupByBuyer.get(a.id) ?? [a.id], buyAssetId: a.id }));

  const fixedPct = new Map<string, number>([
    ...properties.map((p) => [p.id, onHundredths((netOf(p) / baseEur) * 100)] as const),
    ...instruments
      .filter((a) => resolveAllocationRole(a) === 'frozen')
      .map((a) => [a.id, onHundredths((valueOf(a) / baseEur) * 100)] as const),
  ]);

  return {
    positions: [
      ...instrumentPositions,
      ...properties.map((p) => ({ key: p.id, label: p.name, memberAssetIds: [p.id], buyAssetId: p.id })),
      { key: LIQUIDITY_CANDIDATE_KEY, label: 'Liquidità', memberAssetIds: [LIQUIDITY_CANDIDATE_KEY], buyAssetId: LIQUIDITY_CANDIDATE_KEY },
    ],
    fixBounds: (c) => {
      if (c.buyAssetId === LIQUIDITY_CANDIDATE_KEY) {
        return liquidityFloorPct !== undefined ? { lowerPct: liquidityFloorPct } : {};
      }
      const pct = baseEur > 0 ? fixedPct.get(c.buyAssetId) : undefined;
      return pct !== undefined ? { lowerPct: pct, upperPct: pct } : {};
    },
    assetsById: new Map([...assets.map((a) => [a.id, a] as const), [LIQUIDITY_CANDIDATE_KEY, standIn] as const]),
    valueOf: value,
    baseEur,
    negativeFixedKeys: properties.filter((p) => netOf(p) < 0).map((p) => p.id),
    fixedKeys: [...fixedPct.keys()],
    liquidityEur,
    instrumentCount: instrumentPositions.length,
  };
}
