/**
 * What a set of proposed weights can keep when it becomes a PAC or the model portfolio: only instruments a
 * plan buys, never «Liquidità», a property, a `frozen` or `excluded` asset, a liquidity account or what the
 * ledger does not trade. The kept weights are rescaled to Σ = 100 at a 0,01 step. Also the model's
 * fingerprint, which says when the targets, the criteria or the roles moved under it.
 */
import type { Asset, AssetAllocationSettings, AssetAllocationTarget, IdealAllocationSettings } from '@/types/assets';
import type { InvestmentGoal } from '@/types/goals';
import type { ModelPortfolio, ModelPortfolioWeight } from '@/types/modelPortfolio';
import { isLedgerAssetType } from '@/types/assetTransactions';
import { DEFAULT_IDEAL_ALLOCATION, LIQUIDITY_CANDIDATE_KEY } from '@/lib/constants/idealAllocation';
import { resolveAllocationRole, resolveAllocationRoleWithin } from '@/lib/utils/allocationUtils';

export type ModelExclusionReason = 'frozen' | 'cashAccount' | 'excluded' | 'liquidity' | 'property' | 'notBuyable';

export interface ModelWeight {
  /** The instrument that buys; for a group, the buyer. */
  assetId: string;
  pct: number;
  /** The group's members, the buyer included; absent = the instrument alone. */
  memberAssetIds?: string[];
}

export interface ModelExclusion {
  assetId: string;
  reason: ModelExclusionReason;
}

export interface ModelWeightsResult {
  weights: ModelWeight[];
  excluded: ModelExclusion[];
}

function exclusionReason(asset: Asset): ModelExclusionReason | null {
  if (asset.type === 'realestate') return 'property';
  // A cash ACCOUNT is out whatever its role.
  if (asset.type === 'cash') return 'cashAccount';
  // In the base, but no plan buys it: what the ledger does not trade, and a money-market fund.
  if (!isLedgerAssetType(asset.type) || asset.assetClass === 'cash') return 'notBuyable';
  const role = resolveAllocationRole(asset);
  if (role === 'frozen') return 'frozen';
  if (role === 'excluded') return 'excluded';
  return null;
}

export function toModelWeights(proposed: ModelWeight[], assetsById: Map<string, Asset>): ModelWeightsResult {
  const kept: ModelWeight[] = [];
  const excluded: ModelExclusion[] = [];
  for (const entry of proposed) {
    // «Liquidità» is no asset: read before the lookup, or the row would pass as an unknown one.
    if (entry.assetId === LIQUIDITY_CANDIDATE_KEY) {
      excluded.push({ assetId: entry.assetId, reason: 'liquidity' });
      continue;
    }
    const asset = assetsById.get(entry.assetId);
    const reason = asset ? exclusionReason(asset) : null;
    if (reason) {
      excluded.push({ assetId: entry.assetId, reason });
      continue;
    }
    // A member that cannot be in the model leaves the group; one member left = the instrument alone.
    const members = (entry.memberAssetIds ?? []).filter((id) => {
      if (id === entry.assetId) return true;
      const member = assetsById.get(id);
      const memberReason = member ? exclusionReason(member) : null;
      if (memberReason) excluded.push({ assetId: id, reason: memberReason });
      return !memberReason;
    });
    kept.push(members.length > 1 ? { ...entry, memberAssetIds: members } : { assetId: entry.assetId, pct: entry.pct });
  }

  const total = kept.reduce((sum, entry) => sum + entry.pct, 0);
  if (total <= 0) return { weights: [], excluded };

  // Work in hundredths of a point so the remainder is an exact integer.
  const cents = kept.map((entry) => Math.round((entry.pct / total) * 10000));
  const remainder = 10000 - cents.reduce((sum, c) => sum + c, 0);
  if (remainder !== 0) {
    let largest = 0;
    for (let i = 1; i < cents.length; i++) if (cents[i] > cents[largest]) largest = i;
    cents[largest] += remainder;
  }

  return {
    weights: kept.map((entry, i) => ({
      assetId: entry.assetId,
      pct: cents[i] / 100,
      ...(entry.memberAssetIds ? { memberAssetIds: entry.memberAssetIds } : {}),
    })),
    excluded,
  };
}

const EXCLUSION_TEXT: Record<ModelExclusionReason, string> = {
  frozen: 'bloccato in Impostazioni',
  cashAccount: 'è un conto di liquidità',
  excluded: 'escluso dall’allocazione',
  liquidity: 'la liquidità conta nella base, non nel modello',
  property: 'un immobile conta nella base, non si compra a rate',
  notBuyable: 'conta nella base, ma un piano non lo compra',
};

/** «FONDO resta fuori: bloccato in Impostazioni. CONTO resta fuori: è un conto di liquidità.» */
export function describeModelExclusions(excluded: ModelExclusion[], labelOf: (assetId: string) => string): string {
  return excluded.map((e) => `${labelOf(e.assetId)} resta fuori: ${EXCLUSION_TEXT[e.reason]}.`).join(' ');
}

export const MODEL_NO_TRADABLE_INSTRUMENTS = 'Nessuno strumento acquistabile fra i pesi proposti.';

// ─── The saved model ────────────────────────────────────────────────────────

/** Σ of the weights must be 100 within this tolerance. */
export const MODEL_WEIGHT_SUM_TOLERANCE = 0.01;

export const MODEL_ERROR_EMPTY = 'Il portafoglio modello non ha strumenti.';
export const MODEL_ERROR_SUM = 'I pesi del portafoglio modello devono sommare 100%.';
export const MODEL_ERROR_UNKNOWN_ASSET = 'Uno strumento del portafoglio modello non esiste più.';
export const MODEL_ERROR_GROUP = 'Uno strumento non può stare in due righe del portafoglio modello.';
export const MODEL_ERROR_NOT_ALLOWED = 'Un conto di liquidità o uno strumento bloccato non può stare nel portafoglio modello.';

/** The instruments one row stands for: the group's members, else the instrument alone. */
export function groupMembers(weight: Pick<ModelPortfolioWeight, 'assetId' | 'memberAssetIds'>): string[] {
  return weight.memberAssetIds && weight.memberAssetIds.length > 1 ? weight.memberAssetIds : [weight.assetId];
}

/** The buyer first, then the other members, in their saved order. */
function orderMembers(weight: Pick<ModelPortfolioWeight, 'assetId' | 'memberAssetIds'>): string[] {
  const members = groupMembers(weight);
  return [weight.assetId, ...members.filter((id) => id !== weight.assetId)];
}

/** The rows that are a group of equivalent instruments, in the shape the candidates take. */
export function modelGroups(weights: ModelPortfolioWeight[]): Array<{ buyAssetId: string; memberAssetIds: string[] }> {
  return weights
    .filter((weight) => groupMembers(weight).length > 1)
    .map((weight) => ({ buyAssetId: weight.assetId, memberAssetIds: groupMembers(weight) }));
}

/**
 * The reason a set of weights cannot be saved as the model, or null when it can: not empty, Σ = 100
 * (±0,01), every instrument still in the portfolio and none a frozen/excluded asset or a liquidity
 * account — the service refuses with this sentence.
 */
export function validateModelWeights(weights: ModelPortfolioWeight[], assetsById: Map<string, Asset>): string | null {
  if (weights.length === 0) return MODEL_ERROR_EMPTY;
  const seen = new Set<string>();
  for (const weight of weights) {
    // The members of a group are checked like the buyer, and an instrument sits in ONE row.
    const members = groupMembers(weight);
    if (!members.includes(weight.assetId)) return MODEL_ERROR_GROUP;
    for (const id of members) {
      if (id === LIQUIDITY_CANDIDATE_KEY) return MODEL_ERROR_NOT_ALLOWED;
      const asset = assetsById.get(id);
      if (!asset) return MODEL_ERROR_UNKNOWN_ASSET;
      if (exclusionReason(asset)) return MODEL_ERROR_NOT_ALLOWED;
      if (seen.has(id)) return MODEL_ERROR_GROUP;
      seen.add(id);
    }
  }
  const total = weights.reduce((sum, weight) => sum + weight.targetPercentage, 0);
  if (Math.abs(total - 100) > MODEL_WEIGHT_SUM_TOLERANCE) return MODEL_ERROR_SUM;
  return null;
}

/**
 * A calculation's proposed weights as the model's rows, filtered on the way in. `candidateIds` are the
 * instruments evaluated at 0 shares: they keep the flag only while they still hold nothing.
 */
export function proposalToModelWeights(
  proposed: ModelWeight[],
  assetsById: Map<string, Asset>,
  quantityOf: (asset: Asset) => number,
): ModelWeightsResult & { portfolioWeights: ModelPortfolioWeight[] } {
  const fit = toModelWeights(proposed, assetsById);
  const portfolioWeights = fit.weights.map((weight): ModelPortfolioWeight => {
    const held = groupMembers({ assetId: weight.assetId, memberAssetIds: weight.memberAssetIds }).reduce((sum, id) => {
      const member = assetsById.get(id);
      return member ? sum + quantityOf(member) : sum;
    }, 0);
    const candidate = !!assetsById.get(weight.assetId) && held <= 0;
    return {
      assetId: weight.assetId,
      targetPercentage: weight.pct,
      ...(weight.memberAssetIds ? { memberAssetIds: weight.memberAssetIds } : {}),
      ...(candidate ? { candidate: true } : {}),
    };
  });
  return { ...fit, portfolioWeights };
}

/**
 * A model written by hand from nothing starts from what is held: the tradable instruments with
 * value, at today's market weights (Σ = 100, 0,01 step). Empty when nothing tradable is held.
 */
export function seedModelFromToday(allAssets: Asset[], valueOf: (asset: Asset) => number): ModelPortfolioWeight[] {
  const held = allAssets
    .map((asset) => ({ assetId: asset.id, pct: Math.max(0, valueOf(asset)) }))
    .filter((entry, i) => entry.pct > 0 && exclusionReason(allAssets[i]) === null);
  return toModelWeights(held, new Map(allAssets.map((asset) => [asset.id, asset]))).weights.map((weight) => ({
    assetId: weight.assetId,
    targetPercentage: weight.pct,
  }));
}

/** Adds an instrument to evaluate: weight 0, `candidate`; a no-op when it is already there. */
export function addModelCandidate(weights: ModelPortfolioWeight[], assetId: string): ModelPortfolioWeight[] {
  if (weights.some((weight) => groupMembers(weight).includes(assetId))) return weights;
  return [...weights, { assetId, targetPercentage: 0, candidate: true }];
}

/** Drops the `candidate` flag from every instrument that now holds shares (at the next save). */
export function clearHeldCandidates(
  weights: ModelPortfolioWeight[],
  assetsById: Map<string, Asset>,
  quantityOf: (asset: Asset) => number,
): ModelPortfolioWeight[] {
  return weights.map((weight) => {
    if (!weight.candidate) return weight;
    const held = groupMembers(weight).some((id) => {
      const member = assetsById.get(id);
      return !!member && quantityOf(member) > 0;
    });
    if (!held) return weight;
    const { candidate: _candidate, ...rest } = weight;
    void _candidate;
    return rest;
  });
}

export interface ModelVsTodayRow {
  assetId: string;
  /** The instruments the row stands for (the buyer first); one entry for an instrument alone. */
  memberAssetIds: string[];
  modelPct: number;
  todayPct: number;
  /** (modello% − oggi%)/100 · M — positive = to buy. */
  diffEur: number;
  candidate: boolean;
}

export interface ModelVsToday {
  /** M = Σ value of the model's instruments. */
  baseEur: number;
  rows: ModelVsTodayRow[];
  /** Tradable instruments held but not in the model (not part of M). */
  outside: { assetIds: string[]; valueEur: number };
}

/**
 * «Oggi contro modello». Base `M` = Σ value of the model's instruments; per row `oggi% =
 * value / M · 100` and `differenza € = (modello% − oggi%)/100 · M`. Rows by model weight, the
 * candidates last; a tradable instrument held outside the model is summed apart.
 */
export function describeModelVsToday(
  weights: ModelPortfolioWeight[],
  allAssets: Asset[],
  valueOf: (asset: Asset) => number,
): ModelVsToday {
  const assetsById = new Map(allAssets.map((asset) => [asset.id, asset]));
  const inModel = new Set(weights.flatMap((weight) => groupMembers(weight)));
  // A group's value today is the sum of its members'.
  const valueById = new Map(
    weights.map((weight) => [
      weight.assetId,
      groupMembers(weight).reduce((sum, id) => {
        const member = assetsById.get(id);
        return member ? sum + Math.max(0, valueOf(member)) : sum;
      }, 0),
    ]),
  );
  const baseEur = [...valueById.values()].reduce((sum, value) => sum + value, 0);

  const rows = weights
    .map((weight, index): ModelVsTodayRow & { index: number } => {
      const value = valueById.get(weight.assetId) ?? 0;
      const todayPct = baseEur > 0 ? (value / baseEur) * 100 : 0;
      return {
        index,
        assetId: weight.assetId,
        memberAssetIds: orderMembers(weight),
        modelPct: weight.targetPercentage,
        todayPct,
        diffEur: ((weight.targetPercentage - todayPct) / 100) * baseEur,
        candidate: !!weight.candidate,
      };
    })
    .sort((a, b) => Number(a.candidate) - Number(b.candidate) || b.modelPct - a.modelPct || a.index - b.index)
    .map(({ index: _index, ...row }) => {
      void _index;
      return row;
    });

  const outsideAssets = allAssets.filter(
    (asset) => !inModel.has(asset.id) && asset.type !== 'cash' && resolveAllocationRole(asset) === 'tradable' && valueOf(asset) > 0,
  );
  return {
    baseEur,
    rows,
    outside: { assetIds: outsideAssets.map((asset) => asset.id), valueEur: outsideAssets.reduce((sum, asset) => sum + valueOf(asset), 0) },
  };
}

// ─── The plan and the model ──────────────────────────────────────────────

/** The part of a plan position the model needs (structural: no import cycle with the plan types). */
export interface PlanPositionLike {
  buyAssetId: string;
  memberAssetIds: string[];
  targetPercentage: number;
}

/**
 * The plan's weights as the model's rows: each position is one row (the buyer carries the weight,
 * a group keeps its members), rescaled to Σ = 100 with the model's own rule. A position at 0 is left out.
 */
export function planPositionsToModelWeights(
  positions: PlanPositionLike[],
  assetsById: Map<string, Asset>,
  quantityOf: (asset: Asset) => number,
): ReturnType<typeof proposalToModelWeights> {
  return proposalToModelWeights(
    positions
      // A held position at 0 stays in at 0: out of the model it would leave the base of «Oggi» (owner, 2026-11-18).
      .filter((position) => position.targetPercentage > 0 || position.memberAssetIds.some((id) => {
        const asset = assetsById.get(id);
        return !!asset && quantityOf(asset) > 0;
      }))
      .map((position) => ({
        assetId: position.buyAssetId,
        pct: position.targetPercentage,
        ...(position.memberAssetIds.length > 1 ? { memberAssetIds: position.memberAssetIds } : {}),
      })),
    assetsById,
    quantityOf,
  );
}

/** A weight gap above this many points is a difference between the plan and the model. */
export const PLAN_MODEL_WEIGHT_GAP = 0.5;

export interface PlanModelDifference {
  /** Same instruments in both, a weight apart by more than `PLAN_MODEL_WEIGHT_GAP`. */
  weightAssetIds: string[];
  /** The plan buys it (a weight above 0) and the model does not hold it. */
  onlyInPlanAssetIds: string[];
  /** The model holds it (a weight above 0) and the plan does not. */
  onlyInModelAssetIds: string[];
  /** Both hold it, but as a different group or with another buyer. */
  groupAssetIds: string[];
  /** Instruments (rows) that differ in any of the four ways. */
  count: number;
}

/**
 * Does the plan still say what the model says? Rows are compared by instrument: a gap above 0,5
 * points, an instrument in only one of the two (at a weight above 0), a different group or buyer.
 * A model candidate at 0 and a plan position at 0 are not differences.
 */
export function comparePlanToModel(positions: PlanPositionLike[], model: Pick<{ weights: ModelPortfolioWeight[] }, 'weights'>): PlanModelDifference {
  const planRows = positions.filter((position) => position.targetPercentage > 0);
  const modelRows = model.weights.filter((weight) => weight.targetPercentage > 0);
  const planRowOf = (assetId: string) => planRows.find((position) => position.memberAssetIds.includes(assetId) || position.buyAssetId === assetId);
  const modelRowOf = (assetId: string) => modelRows.find((weight) => groupMembers(weight).includes(assetId));

  const weightIds: string[] = [];
  const onlyPlan: string[] = [];
  const onlyModel: string[] = [];
  const groupIds: string[] = [];
  const counted = new Set<string>();

  for (const position of planRows) {
    const modelRow = modelRowOf(position.buyAssetId) ?? position.memberAssetIds.map(modelRowOf).find((row) => !!row);
    if (!modelRow) {
      onlyPlan.push(position.buyAssetId);
      counted.add(position.buyAssetId);
      continue;
    }
    const planMembers = new Set(position.memberAssetIds.length > 1 ? position.memberAssetIds : [position.buyAssetId]);
    const modelMembers = new Set(groupMembers(modelRow));
    const sameGroup =
      modelRow.assetId === position.buyAssetId && planMembers.size === modelMembers.size && [...planMembers].every((id) => modelMembers.has(id));
    if (!sameGroup) {
      groupIds.push(position.buyAssetId);
      counted.add(position.buyAssetId);
    } else if (Math.abs(position.targetPercentage - modelRow.targetPercentage) > PLAN_MODEL_WEIGHT_GAP) {
      weightIds.push(position.buyAssetId);
      counted.add(position.buyAssetId);
    }
  }
  for (const weight of modelRows) {
    if (groupMembers(weight).some((id) => planRowOf(id))) continue;
    onlyModel.push(weight.assetId);
    counted.add(weight.assetId);
  }

  return { weightAssetIds: weightIds, onlyInPlanAssetIds: onlyPlan, onlyInModelAssetIds: onlyModel, groupAssetIds: groupIds, count: counted.size };
}

// ─── «superato»: what the model was computed against (2026-11-12) ──────────

/** JSON with sorted keys and no undefined: the same object always gives the same text. */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`;
}

/** FNV-1a, 32 bit, 8 hex digits: a change detector, not a secret. */
function fnv1a(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/**
 * What the model rests on, WITHOUT a price in it: the stored targets, the criteria and, with goal-driven
 * allocation on, the goals' inputs. The derived targets move with every price and would stale the model at
 * each refresh.
 */
export interface ModelBasis {
  targets: AssetAllocationTarget | null;
  /** «Criteri del modello» as the optimizer reads them: the stored ones, else the defaults. */
  criteria: IdealAllocationSettings;
  goals: Array<Pick<InvestmentGoal, 'id' | 'targetAmount' | 'priority' | 'recommendedAllocation'>> | null;
}

export function buildModelBasis(
  settings: AssetAllocationSettings | null | undefined,
  goals: readonly InvestmentGoal[] | undefined
): ModelBasis {
  const goalDriven = !!settings?.goalBasedInvestingEnabled && !!settings?.goalDrivenAllocationEnabled;
  return {
    targets: settings?.targets ?? null,
    criteria: settings?.idealAllocation ?? DEFAULT_IDEAL_ALLOCATION,
    goals:
      goalDriven && goals && goals.length > 0
        ? goals.map(({ id, targetAmount, priority, recommendedAllocation }) => ({ id, targetAmount, priority, recommendedAllocation }))
        : null,
  };
}

/**
 * The targets as they weigh, not as they are written: a class at 0% with nothing else, a switched-off
 * sub-category block and a switched-off fixed amount count as absent — Impostazioni writes them on a save that
 * changes nothing, and they turned the model «superato» (owner, 2026-11-17). Anything else is kept as is.
 */
function weighingTargets(targets: AssetAllocationTarget | null): Record<string, unknown> | null {
  if (!targets) return null;
  const out: Record<string, unknown> = {};
  for (const [assetClass, target] of Object.entries(targets)) {
    const { targetPercentage, useFixedAmount, fixedAmount, subCategoryConfig, ...rest } = target;
    const kept: Record<string, unknown> = { ...rest };
    if (targetPercentage) kept.targetPercentage = targetPercentage;
    if (useFixedAmount) Object.assign(kept, { useFixedAmount, fixedAmount });
    if (subCategoryConfig?.enabled) kept.subCategoryConfig = subCategoryConfig;
    if (Object.keys(kept).length > 0) out[assetClass] = kept;
  }
  return out;
}

/** What the model was computed against: the basis and every role that is not `tradable`. */
export function modelFingerprint(basis: ModelBasis, assets: readonly Asset[]): string {
  const roles = assets
    .map((asset) => `${asset.id}:${resolveAllocationRoleWithin(asset, assets)}`)
    .filter((entry) => !entry.endsWith(':tradable'))
    .sort();
  return fnv1a(stableStringify({ basis: { ...basis, targets: weighingTargets(basis.targets) }, roles }));
}

/** «superato»: the targets, the criteria, the goals behind them or a role changed since the save (by hand or by an «Applica»). */
export function isModelStale(model: Pick<ModelPortfolio, 'fingerprint'>, basis: ModelBasis, assets: readonly Asset[]): boolean {
  return model.fingerprint === undefined || model.fingerprint !== modelFingerprint(basis, assets);
}
