/**
 * accumulationPlanUtils — the pure engine of the PAC (Accumulo) tile.
 *
 * Zero Firebase/service imports on purpose, so the unit suite never mocks `@/lib/firebase/config`:
 * every dependency on live data (an asset's EUR value, its unit price, `compareAllocations`) is
 * injected (`PlanDeps`, `AllocationCompare`) rather than imported. No `Date.now()` inside any
 * function — "today" always arrives as a parameter.
 */
import type { Asset, AssetAllocationSettings, AssetAllocationTarget, AssetClass, AllocationResult } from '@/types/assets';
import type {
  AccumulationPlan,
  AccumulationPlanDraft,
  ClassMeasurement,
  Installment,
  InstallmentLine,
  MonthKey,
  PlanDisposal,
  PlanLiquidity,
  PlanPosition,
} from '@/types/accumulationPlan';
import { splitTowardTarget, bandForTarget, resolveAllocationRoleWithin, type RebalanceBand } from './allocationUtils';
import { isLedgerAssetType } from '@/types/assetTransactions';
import { roundToCents } from './cents';
import type { ModelPortfolio } from '@/types/modelPortfolio';
import { modelGroups } from '@/lib/utils/modelPortfolio';
import { unitPriceEur } from './costBasisEur';
import { addMonths } from './planMonths';
import { describeZeroQuantityChip, NEVER_BOUGHT_CHIP } from './zeroQuantityChip';

// ---------------------------------------------------------------------------
// 5.1 Month helpers
// ---------------------------------------------------------------------------

// Moved to planMonths.ts (the page's first load reads them without this engine).
export { toMonthKey, addMonths, monthIndexOf } from './planMonths';

// ---------------------------------------------------------------------------
// 5.2 Exposure per euro (no service import — mirrors expandAssetExposure's rule)
// ---------------------------------------------------------------------------

/** Notional € per €1 of market value, per asset class — mirrors expandAssetExposure's rule. */
export function exposurePerEuro(asset: Asset): Partial<Record<AssetClass, number>> {
  const leverage = asset.leverageRatio ?? 1;
  if (!asset.composition || asset.composition.length === 0) {
    return { [asset.assetClass]: leverage };
  }
  const result: Partial<Record<AssetClass, number>> = {};
  for (const component of asset.composition) {
    const contribution = (component.percentage / 100) * leverage;
    result[component.assetClass] = (result[component.assetClass] ?? 0) + contribution;
  }
  return result;
}

// ---------------------------------------------------------------------------
// 5.3 resolvePositionStates
// ---------------------------------------------------------------------------

export interface PlanDeps {
  valueOf: (asset: Asset) => number;    // calculateAssetValue
  priceOf: (asset: Asset) => number;    // unitPriceEur
}

export interface PositionState {
  positionId: string;
  label: string;
  targetPercentage: number;
  currentValueEur: number;   // Σ valueOf(member) over memberAssetIds
  buyAssetId: string;
  buyPriceEur: number;       // priceOf(buy asset)
  unpriced: boolean;         // buyPriceEur <= 0 or buy asset missing
}

/**
 * what a disposal brings in at `asset`'s current price — `quantity × price` for a partial sale
 * (never more than the shares held), the whole position's value when `quantity` is absent.
 */
export function proceedsOfDisposal(disposal: PlanDisposal, asset: Asset | undefined, deps: PlanDeps): number {
  if (!asset) return disposal.estimatedProceedsEur;
  if (disposal.quantity === undefined) return roundToCents(deps.valueOf(asset));
  return roundToCents(Math.min(disposal.quantity, asset.quantity) * deps.priceOf(asset));
}

/**
 * The instrument an OPEN sale's proceeds buy, when it is a swap that can be planned (owner, 2026-11-20): the
 * instrument exists and has a price. Otherwise undefined, and the sale is an ordinary one: its money joins the pool.
 */
export function swapTargetOf(disposal: PlanDisposal, assetsById: Map<string, Asset>, deps: PlanDeps): string | undefined {
  if (!disposal.reinvestAssetId || disposal.status === 'executed' || disposal.status === 'skipped') return undefined;
  const target = assetsById.get(disposal.reinvestAssetId);
  return target && deps.priceOf(target) > 0 ? target.id : undefined;
}

export function resolvePositionStates(
  positions: PlanPosition[],
  assetsById: Map<string, Asset>,
  deps: PlanDeps,
  disposals: PlanDisposal[] = []
): PositionState[] {
  // the shares still to be sold leave the position's value (an executed/skipped sale already left the ledger or never will).
  const pendingSale = new Map<string, number>();
  // A swap's proceeds are the bought instrument's from its month: the rates split on top of them (2026-11-20).
  const swapIn = new Map<string, number>();
  for (const disposal of disposals) {
    const target = swapTargetOf(disposal, assetsById, deps);
    if (target) swapIn.set(target, (swapIn.get(target) ?? 0) + disposal.estimatedProceedsEur);
    if (disposal.quantity === undefined) continue;
    if (disposal.status === 'executed' || disposal.status === 'skipped') continue;
    pendingSale.set(disposal.assetId, (pendingSale.get(disposal.assetId) ?? 0) + disposal.quantity);
  }
  return positions.map((position) => {
    let currentValueEur = swapIn.get(position.buyAssetId) ?? 0;
    for (const memberId of position.memberAssetIds) {
      const member = assetsById.get(memberId);
      if (!member) continue;
      const sold = Math.min(pendingSale.get(memberId) ?? 0, member.quantity);
      currentValueEur += deps.valueOf(member) - sold * deps.priceOf(member);
    }
    const buyAsset = assetsById.get(position.buyAssetId);
    const buyPriceEur = buyAsset ? deps.priceOf(buyAsset) : 0;
    return {
      positionId: position.id,
      label: position.label,
      targetPercentage: position.targetPercentage,
      currentValueEur,
      buyAssetId: position.buyAssetId,
      buyPriceEur,
      unpriced: !buyAsset || buyPriceEur <= 0,
    };
  });
}

// ---------------------------------------------------------------------------
// 5.4 computeUsableLiquidity
// ---------------------------------------------------------------------------

export interface UsableLiquidity {
  sourceCashEur: number;        // Σ valueOf(source cash assets)
  availableNowEur: number;      // max(0, sourceCashEur − reserveEur)
  disposalProceedsEur: number;  // Σ estimatedProceedsEur of disposals not yet executed/skipped
  inflowTotalEur: number;       // monthlyInflowEur × monthsRemaining
  L0: number;                   // availableNowEur + disposalProceedsEur
  L: number;                    // availableNowEur + max(0, disposalProceedsEur + inflowTotalEur − shortfallEur)
  belowReserve: boolean;        // sourceCashEur < reserveEur
  /** max(0, reserveEur − sourceCashEur): what the sales and the inflows bring back first. */
  shortfallEur: number;
  /** The months whose inflows refill the reserve, bought nothing (0..monthsRemaining). */
  refillMonths: number;
  /** Σ proceeds of the open sales due by the first month scheduled: they arrive at once. */
  dueProceedsEur: number;
  /** Each month's share of L (Σ = 1) when a later sale leaves a tranche; null = the even spread. */
  monthShares: number[] | null;
  /** Σ proceeds of the open swaps: outside L, the pool and the reserve (2026-11-20). */
  swapProceedsEur: number;
  /** What each open swap buys and when (`offset` 0-based inside the months scheduled). */
  swaps: SwapPurchase[];
}

/** A swap's purchase: the whole proceeds of a sale buy `assetId` in the month at `offset` (owner, 2026-11-20). */
export interface SwapPurchase {
  assetId: string;
  offset: number;
  eur: number;
}

/** The plan month a sale falls in, counted from the plan's first month; absent = month 1. */
export function disposalMonthIndex(disposal: Pick<PlanDisposal, 'monthIndex'>): number {
  return disposal.monthIndex ?? 1;
}

/**
 * Each tranche is spent evenly from the month it arrives to the last: the base from the first buying
 * month, what the refill left of a later sale from its own. Null when no later sale leaves a tranche: the
 * caller keeps the even spread it always had. `offset` is 0-based inside the months scheduled.
 */
function spreadMonthShares(
  baseEur: number,
  later: Array<{ offset: number; eur: number }>,
  months: number,
  refillMonths: number
): number[] | null {
  const totalEur = baseEur + later.reduce((sum, tranche) => sum + tranche.eur, 0);
  if (later.length === 0 || months < 1 || totalEur <= 0) return null;
  const euros = new Array<number>(months).fill(0);
  const spread = (eur: number, from: number) => {
    const start = Math.min(Math.max(0, from), months - 1);
    for (let m = start; m < months; m++) euros[m] += eur / (months - start);
  };
  spread(baseEur, refillMonths);
  for (const tranche of later) spread(tranche.eur, tranche.offset);
  return euros.map((eur) => eur / totalEur);
}

/**
 * The money a plan may spend over `monthsRemaining` months and WHEN it arrives. `firstIndex` is the plan
 * month of the first month scheduled (1 at activation and in the preview, `k` in a revision, the open
 * index in a recalibration): a sale's `monthIndex` is counted from the plan's first month, so a sale
 * due by `firstIndex` arrives at once and a later one from its own month.
 */
export function computeUsableLiquidity(
  liquidity: PlanLiquidity,
  assetsById: Map<string, Asset>,
  disposals: PlanDisposal[],
  monthsRemaining: number,
  deps: PlanDeps,
  firstIndex = 1
): UsableLiquidity {
  let sourceCashEur = 0;
  for (const id of liquidity.sourceCashAssetIds) {
    const asset = assetsById.get(id);
    if (asset) sourceCashEur += deps.valueOf(asset);
  }
  const availableNowEur = Math.max(0, sourceCashEur - liquidity.reserveEur);
  // 0 = due by the first month scheduled; a sale past the last month is the validator's issue, clamped here.
  const offsetOf = (d: PlanDisposal) =>
    Math.min(Math.max(0, disposalMonthIndex(d) - firstIndex), Math.max(0, monthsRemaining - 1));
  const openAll = disposals.filter((d) => d.status !== 'executed' && d.status !== 'skipped');
  // A swap never enters the pool nor refills the reserve: its proceeds buy their instrument (owner, 2026-11-20).
  const swaps: SwapPurchase[] = [];
  const open: PlanDisposal[] = [];
  for (const d of openAll) {
    const target = swapTargetOf(d, assetsById, deps);
    if (!target || monthsRemaining <= 0) {
      open.push(d);
      continue;
    }
    // Sales that buy one instrument in one month are ONE purchase, on their summed proceeds (2026-11-20).
    const same = swaps.find((s) => s.assetId === target && s.offset === offsetOf(d));
    if (same) same.eur = roundToCents(same.eur + d.estimatedProceedsEur);
    else swaps.push({ assetId: target, offset: offsetOf(d), eur: d.estimatedProceedsEur });
  }
  const swapProceedsEur = swaps.reduce((sum, s) => sum + s.eur, 0);
  // Every open sale but the swaps, whatever its month: the draft box «Vendite fuori piano» reads this total.
  const disposalProceedsEur = open.reduce((sum, d) => sum + d.estimatedProceedsEur, 0);
  const dueProceedsEur = open.filter((d) => offsetOf(d) === 0).reduce((sum, d) => sum + d.estimatedProceedsEur, 0);
  const inflowTotalEur = liquidity.monthlyInflowEur * monthsRemaining;
  const L0 = availableNowEur + disposalProceedsEur;
  // The cash below the reserve is brought back first and only then invested (owner, 2026-11-17), in the
  // order the money arrives (owner, 2026-11-19): the sales due; then, month by month, a later sale BEFORE
  // that month's inflow. What a later sale has left is its tranche; a month whose inflow refills buys nothing.
  const shortfallEur = Math.max(0, liquidity.reserveEur - sourceCashEur);
  let gapEur = Math.max(0, shortfallEur - dueProceedsEur);
  let refillMonths = 0;
  const later: Array<{ offset: number; eur: number }> = [];
  for (let m = 0; m < monthsRemaining; m++) {
    for (const d of open) {
      if (m === 0 || offsetOf(d) !== m) continue;
      const refillEur = Math.min(gapEur, d.estimatedProceedsEur);
      gapEur -= refillEur;
      if (d.estimatedProceedsEur - refillEur > 1e-9) later.push({ offset: m, eur: d.estimatedProceedsEur - refillEur });
    }
    if (gapEur > 1e-9) {
      gapEur -= Math.min(gapEur, liquidity.monthlyInflowEur);
      refillMonths = m + 1;
    }
  }
  // Every sale refills before it is invested, so L does not depend on the sales' months — only WHEN it is spent.
  const L = availableNowEur + Math.max(0, disposalProceedsEur + inflowTotalEur - shortfallEur);
  const laterEur = later.reduce((sum, tranche) => sum + tranche.eur, 0);
  const monthShares = spreadMonthShares(L - laterEur, later, monthsRemaining, refillMonths);
  return {
    sourceCashEur,
    availableNowEur,
    disposalProceedsEur,
    inflowTotalEur,
    L0,
    L,
    belowReserve: sourceCashEur < liquidity.reserveEur,
    shortfallEur,
    refillMonths,
    dueProceedsEur,
    monthShares,
    swapProceedsEur,
    swaps,
  };
}

/**
 * The reserve reading of the tile and the draft box: only the plan's SOURCE accounts count,
 * never every cash-class asset. `availableNowEur` is what the draft can spend today.
 */
export function summarizeReserve(
  liquidity: PlanLiquidity,
  assetsById: Map<string, Asset>,
  deps: PlanDeps
): { sourceCashEur: number; availableNowEur: number; belowReserve: boolean } {
  const usable = computeUsableLiquidity(liquidity, assetsById, [], 0, deps);
  return {
    sourceCashEur: usable.sourceCashEur,
    availableNowEur: usable.availableNowEur,
    belowReserve: liquidity.reserveEur > 0 && usable.sourceCashEur < liquidity.reserveEur,
  };
}

// ---------------------------------------------------------------------------
// 5.5 computeTotalPurchases (Passo 1)
// ---------------------------------------------------------------------------

export function computeTotalPurchases(
  states: PositionState[],
  L: number
): Record<string, number> {
  const priced = states.filter((s) => !s.unpriced);
  const items = priced.map((s) => ({
    key: s.positionId,
    currentValue: s.currentValueEur,
    targetPercentage: s.targetPercentage,
  }));
  const B = states.reduce((sum, s) => sum + s.currentValueEur, 0) + L;
  const split = splitTowardTarget(items, L, B);
  const result: Record<string, number> = {};
  for (const s of states) result[s.positionId] = split[s.positionId] ?? 0;
  return result;
}

// ---------------------------------------------------------------------------
// 5.6 scheduleInstallments
// ---------------------------------------------------------------------------

export interface ScheduleResult {
  installments: Installment[];
  residualEur: number;
}

export function scheduleInstallments(
  totals: Record<string, number>,
  states: PositionState[],
  months: number,
  startMonth: MonthKey,
  firstIndex = 1,
  /** `UsableLiquidity.refillMonths`: the first months buy nothing, the totals spread over the rest. */
  refillMonths = 0,
  /** `UsableLiquidity.monthShares`: each month's share of the totals; null = the even spread over the buying months. */
  monthShares: number[] | null = null,
  /** `UsableLiquidity.swaps`: bought whole in their month, even a refill month (owner, 2026-11-20). */
  swaps: SwapPurchase[] = []
): ScheduleResult {
  const refill = Math.min(Math.max(0, refillMonths), months);
  let swapResidualEur = 0;
  const buyingMonths = months - refill;
  const pricedStates = states.filter((s) => !s.unpriced);
  const carry: Record<string, number> = {};
  const spentByPosition: Record<string, number> = {};
  for (const s of states) {
    carry[s.positionId] = 0;
    spentByPosition[s.positionId] = 0;
  }

  const installments: Installment[] = [];
  let residualEur = 0;

  for (let m = 1; m <= months; m++) {
    const carryInEur: Record<string, number> = {};
    // The carry is computed exact and RECORDED in cents: rounding it month by month would lose cents
    // from the plan's total (Σ spend + residual = total).
    for (const s of states) carryInEur[s.positionId] = roundToCents(carry[s.positionId]);

    const lines: InstallmentLine[] = [];
    const lineByPosition: Record<string, InstallmentLine> = {};
    const share = monthShares ? (monthShares[m - 1] ?? 0) : null;

    for (const s of pricedStates) {
      if (m <= refill) break;
      const total = totals[s.positionId] ?? 0;
      const budget = (share === null ? total / buyingMonths : total * share) + carry[s.positionId];
      const q = Math.floor(budget / s.buyPriceEur + 1e-9);
      const spend = q * s.buyPriceEur;
      carry[s.positionId] = budget - spend;
      if (q > 0) {
        const line: InstallmentLine = {
          positionId: s.positionId,
          assetId: s.buyAssetId,
          plannedQuantity: q,
          priceEurAtPlan: s.buyPriceEur,
          plannedAmountEur: roundToCents(spend),
          status: 'planned',
        };
        lines.push(line);
        lineByPosition[s.positionId] = line;
        spentByPosition[s.positionId] += spend;
      }
    }

    // The swaps of this month: the whole proceeds, in whole units, on the month's line of that instrument when
    // it already buys (one line per position), else on a line of their own; the cents left are residual.
    for (const swap of swaps) {
      if (swap.offset !== m - 1) continue;
      const s = pricedStates.find((state) => state.buyAssetId === swap.assetId);
      if (!s) {
        swapResidualEur += swap.eur;
        continue;
      }
      const q = Math.floor(swap.eur / s.buyPriceEur + 1e-9);
      swapResidualEur += swap.eur - q * s.buyPriceEur;
      if (q === 0) continue;
      const existing = lineByPosition[s.positionId];
      if (existing) {
        existing.plannedQuantity += q;
        existing.plannedAmountEur = roundToCents(existing.plannedAmountEur + q * s.buyPriceEur);
      } else {
        lines.push({
          positionId: s.positionId,
          assetId: s.buyAssetId,
          plannedQuantity: q,
          priceEurAtPlan: s.buyPriceEur,
          plannedAmountEur: roundToCents(q * s.buyPriceEur),
          status: 'planned',
          swap: true,
        });
      }
    }

    if (m === months && buyingMonths === 0) {
      // Every month refills the reserve: nothing is bought, and what the last refill left over stays the
      // plan's residual, so Σ lines + residual = Σ totals holds here too (owner, 2026-11-19).
      residualEur = roundToCents(Object.values(totals).reduce((sum, total) => sum + total, 0));
    } else if (m === months) {
      let pool = Object.values(carry).reduce((sum, c) => sum + c, 0);
      const remainingDeficit: Record<string, number> = {};
      for (const s of pricedStates) {
        remainingDeficit[s.positionId] = (totals[s.positionId] ?? 0) - spentByPosition[s.positionId];
      }

      for (;;) {
        const candidates = pricedStates.filter(
          (s) => remainingDeficit[s.positionId] > 1e-9 && s.buyPriceEur <= pool
        );
        if (candidates.length === 0) break;
        candidates.sort((a, b) => {
          const byDeficit = remainingDeficit[b.positionId] - remainingDeficit[a.positionId];
          if (byDeficit !== 0) return byDeficit;
          const byPrice = a.buyPriceEur - b.buyPriceEur;
          if (byPrice !== 0) return byPrice;
          return a.positionId.localeCompare(b.positionId);
        });
        const picked = candidates[0];
        let line = lineByPosition[picked.positionId];
        if (!line) {
          line = {
            positionId: picked.positionId,
            assetId: picked.buyAssetId,
            plannedQuantity: 0,
            priceEurAtPlan: picked.buyPriceEur,
            plannedAmountEur: 0,
            status: 'planned',
          };
          lines.push(line);
          lineByPosition[picked.positionId] = line;
        }
        line.plannedQuantity += 1;
        line.plannedAmountEur = roundToCents(line.plannedAmountEur + picked.buyPriceEur);
        spentByPosition[picked.positionId] += picked.buyPriceEur;
        pool -= picked.buyPriceEur;
        remainingDeficit[picked.positionId] -= picked.buyPriceEur;
      }

      residualEur = roundToCents(pool);
    }

    installments.push({ index: firstIndex + m - 1, month: addMonths(startMonth, m - 1), lines, carryInEur });
  }

  return { installments, residualEur: roundToCents(residualEur + swapResidualEur) };
}

// ---------------------------------------------------------------------------
// 5.7 recalibrateInstallment
// ---------------------------------------------------------------------------

export interface RecalibrationLine {
  positionId: string;
  assetId: string;
  plannedQuantity: number;     // from the saved calendar (0 if no line)
  suggestedQuantity: number;
  priceEur: number;            // current priceOf(buy asset)
  suggestedAmountEur: number;
}

export interface RecalibrationResult {
  index: number;
  lines: RecalibrationLine[];
  plannedTotalEur: number;
  suggestedTotalEur: number;
  liquidity: UsableLiquidity;  // computed with monthsRemaining = N − index + 1
}

export function recalibrateInstallment(
  plan: AccumulationPlan,
  index: number,
  assetsById: Map<string, Asset>,
  deps: PlanDeps
): RecalibrationResult {
  const monthsRemaining = plan.months - index + 1;
  const liquidity = computeUsableLiquidity(
    plan.liquidity,
    assetsById,
    plan.disposals,
    monthsRemaining,
    deps,
    index
  );
  const states = resolvePositionStates(plan.positions, assetsById, deps, plan.disposals);
  const totals = computeTotalPurchases(states, liquidity.L);
  const pricedStates = states.filter((s) => !s.unpriced);
  // Never under the reserve: the sales due by this month refill it before they are spent (owner, 2026-11-17);
  // a later sale is not in the account yet (owner, 2026-11-19). This month's inflow counts, as the calendar counts it.
  // With the budgets from `monthShares[0]` this ceiling never binds: it stays as a guard.
  const cashCeiling = Math.max(0, liquidity.availableNowEur + liquidity.dueProceedsEur + plan.liquidity.monthlyInflowEur - liquidity.shortfallEur);

  const budgets: Record<string, number> = {};
  const buyingMonths = monthsRemaining - liquidity.refillMonths;
  for (const s of pricedStates) {
    budgets[s.positionId] = liquidity.monthShares
      ? (totals[s.positionId] ?? 0) * liquidity.monthShares[0]
      : buyingMonths > 0 && liquidity.refillMonths === 0 ? (totals[s.positionId] ?? 0) / buyingMonths : 0;
  }

  const floorQuantities = (): Record<string, number> => {
    const quantities: Record<string, number> = {};
    for (const s of pricedStates) {
      quantities[s.positionId] = Math.floor(budgets[s.positionId] / s.buyPriceEur + 1e-9);
    }
    return quantities;
  };

  let quantities = floorQuantities();
  const sumAmounts = pricedStates.reduce((sum, s) => sum + quantities[s.positionId] * s.buyPriceEur, 0);

  if (sumAmounts > cashCeiling) {
    const sumBudgets = Object.values(budgets).reduce((sum, v) => sum + v, 0);
    const ratio = sumBudgets > 0 ? cashCeiling / sumBudgets : 0;
    for (const key of Object.keys(budgets)) budgets[key] *= ratio;
    quantities = floorQuantities();
  }

  // This month's swaps buy what the calendar planned for them, on top of the month's budget (2026-11-20).
  for (const swap of liquidity.swaps) {
    if (swap.offset !== 0) continue;
    const s = pricedStates.find((state) => state.buyAssetId === swap.assetId);
    if (s) quantities[s.positionId] += Math.floor(swap.eur / s.buyPriceEur + 1e-9);
  }

  const plannedByPosition: Record<string, number> = {};
  const installment = plan.installments.find((i) => i.index === index);
  for (const line of installment?.lines ?? []) {
    plannedByPosition[line.positionId] = (plannedByPosition[line.positionId] ?? 0) + line.plannedQuantity;
  }

  const lines: RecalibrationLine[] = pricedStates.map((s) => {
    const suggestedQuantity = quantities[s.positionId];
    return {
      positionId: s.positionId,
      assetId: s.buyAssetId,
      plannedQuantity: plannedByPosition[s.positionId] ?? 0,
      suggestedQuantity,
      priceEur: s.buyPriceEur,
      suggestedAmountEur: suggestedQuantity * s.buyPriceEur,
    };
  });

  return {
    index,
    lines,
    plannedTotalEur: lines.reduce((sum, l) => sum + l.plannedQuantity * l.priceEur, 0),
    suggestedTotalEur: lines.reduce((sum, l) => sum + l.suggestedAmountEur, 0),
    liquidity,
  };
}

/** The patch a saved «Registra» trade puts on its line (fees excluded, as the matching does). */
export function buildRegisteredLinePatch(
  transactionId: string,
  quantity: number,
  priceEur: number
): { status: 'executed'; transactionIds: string[]; executedQuantity: number; executedAmountEur: number } {
  return { status: 'executed', transactionIds: [transactionId], executedQuantity: quantity, executedAmountEur: roundToCents(quantity * priceEur) };
}

/** The suggested whole-share quantities of a recalibration, by position — what «Lascia così» remembers. */
export function recalibrationQuantities(result: RecalibrationResult): Record<string, number> {
  const quantities: Record<string, number> = {};
  for (const line of result.lines) quantities[line.positionId] = line.suggestedQuantity;
  return quantities;
}

/**
 * the open installment's recalibration is proposed when the reserve is breached or some line
 * would move by a whole share, unless the reader already declined these very figures
 * (`Installment.recalibrationDismissed`).
 */
export function shouldProposeRecalibration(
  result: RecalibrationResult,
  dismissed?: { quantities: Record<string, number> }
): boolean {
  const changes = result.lines.some((line) => Math.abs(line.suggestedQuantity - line.plannedQuantity) >= 1);
  // The cash below the reserve in a refill month is the plan working, not a reason to recalibrate (2026-11-17).
  if (!changes && (!result.liquidity.belowReserve || result.liquidity.refillMonths > 0)) return false;
  if (!dismissed) return true;
  const suggested = recalibrationQuantities(result);
  const keys = new Set([...Object.keys(suggested), ...Object.keys(dismissed.quantities)]);
  for (const key of keys) {
    if ((suggested[key] ?? 0) !== (dismissed.quantities[key] ?? 0)) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// buildRevisedPlan («Rivedi il piano»)
// ---------------------------------------------------------------------------

export interface PlanRevisionInput {
  monthlyInflowEur: number;
  reserveEur: number;
  remainingMonths: number;
  positions: PlanPosition[];
  /** The NEW disposals, each in its month (never before the first revised one); the plan's existing ones stay. */
  disposals: PlanDisposal[];
  /** The plan month to look at the plan again: absent = keep the plan's, null = clear it. */
  reviewMonthIndex?: number | null;
  /** The app's corrections to the Consulente's plan: absent = keep the plan's (the editor's revision keeps them). */
  advisorNotes?: string[];
  /** the source accounts, editable in a revision; absent = the plan's own. */
  sourceCashAssetIds?: string[];
  /** saved sales not yet executed that the revision takes off (by instrument). */
  removedDisposalAssetIds?: string[];
  /** saved sales not yet executed moved to another installment (≥ the first revised one), by instrument. */
  movedDisposalMonthIndexes?: Record<string, number>;
  /**
   * The first intact instalment the caller built the revision on: another one today → `plan_moved` (an
   * instalment confirmed in another tab between the screen and the write). Absent = not checked.
   */
  expectedFirstIndex?: number;
}

/**
 * The draft the gate (`validateDraftAgainstAssets`) reads for a revised plan: its fields, the executed sales
 * left out — they already left the ledger, so the held shares would refuse them. One gate, two readers:
 * `revisePlan` before the write and the guided path's summary before «Conferma».
 */
export function revisedPlanGateDraft(plan: AccumulationPlan): AccumulationPlanDraft {
  return {
    name: plan.name,
    startMonth: plan.startMonth,
    months: plan.months,
    liquidity: plan.liquidity,
    positions: plan.positions,
    // Executed sales already left the ledger, skipped ones sell nothing: only the planned ones meet the held shares
    // (a skipped whole sale of an instrument still held, which keeps its row, refused every revision; 2026-11-21).
    disposals: plan.disposals.filter((disposal) => disposal.status === 'planned'),
  };
}

/** A saved sale a revision can still change: not executed, not skipped, not linked to a ledger sale. */
export function isOpenSavedDisposal(disposal: PlanDisposal): boolean {
  return disposal.status === 'planned' && (disposal.transactionIds?.length ?? 0) === 0;
}

/**
 * what a revision's sales list says about the plan's saved sales. `draftDisposals` is the list the
 * editor holds (the saved open sales it started from, with the reader's changes, and the new ones).
 * A saved open sale missing from it is removed; one whose shares changed is removed and re-entered as
 * a new sale; one that stays may carry another `monthIndex` (moved). Executed or linked sales never move.
 */
export function diffRevisionDisposals(
  plan: Pick<AccumulationPlan, 'disposals'>,
  draftDisposals: PlanDisposal[]
): { newDisposals: PlanDisposal[]; removedDisposalAssetIds: string[]; movedDisposalMonthIndexes: Record<string, number> } {
  const open = new Map(plan.disposals.filter(isOpenSavedDisposal).map((disposal) => [disposal.assetId, disposal]));
  const closedIds = new Set(plan.disposals.filter((disposal) => !isOpenSavedDisposal(disposal)).map((disposal) => disposal.assetId));
  const newDisposals: PlanDisposal[] = [];
  const removed: string[] = [];
  const moved: Record<string, number> = {};
  for (const disposal of draftDisposals) {
    if (closedIds.has(disposal.assetId)) continue;
    const saved = open.get(disposal.assetId);
    if (!saved) {
      newDisposals.push(disposal);
    } else if (saved.quantity !== disposal.quantity || saved.reinvestAssetId !== disposal.reinvestAssetId) {
      removed.push(saved.assetId);
      newDisposals.push(disposal);
    } else if ((disposal.monthIndex ?? 1) !== (saved.monthIndex ?? 1)) {
      moved[saved.assetId] = disposal.monthIndex ?? 1;
    }
  }
  for (const saved of open.values()) {
    if (!draftDisposals.some((disposal) => disposal.assetId === saved.assetId)) removed.push(saved.assetId);
  }
  return { newDisposals, removedDisposalAssetIds: removed, movedDisposalMonthIndexes: moved };
}

export type RevisedPlanResult =
  | { ok: true; plan: AccumulationPlan; firstIndex: number; liquidity: UsableLiquidity }
  | { ok: false; issue: 'nothing_to_revise' | 'plan_moved' | 'months_range' | 'sale_month_range' }
  | { ok: false; issue: 'duplicate_asset'; assetId: string };

/** The first installment with no line executed, skipped or linked: where a revision starts. */
export function findFirstIntactInstallment(plan: AccumulationPlan): Installment | undefined {
  return plan.installments.find(
    (installment) =>
      !installment.lines.some(
        (line) => line.status === 'executed' || line.status === 'skipped' || (line.transactionIds?.length ?? 0) > 0
      )
  );
}

/**
 * Rewrites the calendar from the first intact installment `k` on with new inflow, reserve, months
 * remaining, positions and sales; installments 1..k−1 are kept as they are, measurements included.
 * `baseline` never changes. Pure: the service persists the result.
 */
export function buildRevisedPlan(
  plan: AccumulationPlan,
  revision: PlanRevisionInput,
  assetsById: Map<string, Asset>,
  deps: PlanDeps,
  today: Date
): RevisedPlanResult {
  const first = findFirstIntactInstallment(plan);
  if (!first) return { ok: false, issue: 'nothing_to_revise' };
  const k = first.index;
  if (revision.expectedFirstIndex !== undefined && revision.expectedFirstIndex !== k) return { ok: false, issue: 'plan_moved' };
  const months = k - 1 + revision.remainingMonths;
  if (!Number.isInteger(revision.remainingMonths) || revision.remainingMonths < 1 || months < 1 || months > 60) {
    return { ok: false, issue: 'months_range' };
  }

  // a saved sale not yet executed can come off or move to a month ≥ k; an executed one stays as it is.
  const removedIds = new Set(revision.removedDisposalAssetIds ?? []);
  const moved = revision.movedDisposalMonthIndexes ?? {};
  for (const monthIndex of Object.values(moved)) {
    if (!Number.isInteger(monthIndex) || monthIndex < k || monthIndex > months) return { ok: false, issue: 'sale_month_range' };
  }
  const keptDisposals = plan.disposals
    .filter((disposal) => !(isOpenSavedDisposal(disposal) && removedIds.has(disposal.assetId)))
    .map((disposal) =>
      isOpenSavedDisposal(disposal) && moved[disposal.assetId] !== undefined ? { ...disposal, monthIndex: moved[disposal.assetId] } : disposal
    );

  // One sale per instrument: the ledger matching and `setDisposal` address a sale by its asset.
  const alreadySelling = new Set(keptDisposals.map((disposal) => disposal.assetId));
  const repeated = revision.disposals.find((disposal) => alreadySelling.has(disposal.assetId));
  if (repeated) return { ok: false, issue: 'duplicate_asset', assetId: repeated.assetId };

  if (revision.disposals.some((disposal) => (disposal.monthIndex ?? k) > months)) return { ok: false, issue: 'sale_month_range' };
  const newDisposals: PlanDisposal[] = revision.disposals.map((disposal) => ({
    ...disposal,
    monthIndex: Math.max(k, disposal.monthIndex ?? k),
    estimatedProceedsEur: proceedsOfDisposal(disposal, assetsById.get(disposal.assetId), deps),
  }));
  const disposals = [...keptDisposals, ...newDisposals];
  const liquiditySettings: PlanLiquidity = {
    ...plan.liquidity,
    ...(revision.sourceCashAssetIds ? { sourceCashAssetIds: revision.sourceCashAssetIds } : {}),
    monthlyInflowEur: revision.monthlyInflowEur,
    reserveEur: revision.reserveEur,
  };
  const liquidity = computeUsableLiquidity(liquiditySettings, assetsById, disposals, revision.remainingMonths, deps, k);
  const states = resolvePositionStates(revision.positions, assetsById, deps, disposals);
  const totals = computeTotalPurchases(states, liquidity.L);
  const schedule = scheduleInstallments(totals, states, revision.remainingMonths, first.month, k, liquidity.refillMonths, liquidity.monthShares, liquidity.swaps);
  const reviewMonthIndex = revision.reviewMonthIndex === undefined ? plan.reviewMonthIndex : revision.reviewMonthIndex ?? undefined;

  return {
    ok: true,
    firstIndex: k,
    liquidity,
    plan: {
      ...plan,
      months,
      reviewMonthIndex,
      liquidity: liquiditySettings,
      positions: revision.positions,
      disposals,
      installments: [...plan.installments.filter((installment) => installment.index < k), ...schedule.installments],
      residualEur: schedule.residualEur,
      revisions: [
        ...(plan.revisions ?? []),
        {
          at: today,
          fromIndex: k,
          before: {
            months: plan.months,
            monthlyInflowEur: plan.liquidity.monthlyInflowEur,
            reserveEur: plan.liquidity.reserveEur,
          },
        },
      ],
      updatedAt: today,
    },
  };
}

// ---------------------------------------------------------------------------
// 5.8 projectPlanOutcome
// ---------------------------------------------------------------------------

export interface PositionOutcome {
  positionId: string;
  label: string;
  targetPercentage: number;
  finalValueEur: number;
  finalWeightPct: number;      // finalValueEur / Σ finalValueEur × 100
  driftPp: number;             // finalWeightPct − targetPercentage
}

export interface PlanOutcome {
  positions: PositionOutcome[];
  maxAbsDriftPp: number;
  maxDriftPositionId: string | null;
  residualEur: number;
  implicitClassPct: Partial<Record<AssetClass, number>>; // notional / final market total × 100
  leverageRatio: number;                                  // Σ notional / Σ market
}

export function projectPlanOutcome(
  states: PositionState[],
  installments: Installment[],
  residualEur: number,
  assetsById: Map<string, Asset>,
  positions: PlanPosition[],
  deps: PlanDeps
): PlanOutcome {
  const purchasedByPosition: Record<string, number> = {};
  for (const installment of installments) {
    for (const line of installment.lines) {
      purchasedByPosition[line.positionId] =
        (purchasedByPosition[line.positionId] ?? 0) + line.plannedAmountEur;
    }
  }

  const outcomePositions: PositionOutcome[] = states.map((s) => ({
    positionId: s.positionId,
    label: s.label,
    targetPercentage: s.targetPercentage,
    finalValueEur: s.currentValueEur + (purchasedByPosition[s.positionId] ?? 0),
    finalWeightPct: 0,
    driftPp: 0,
  }));

  const totalFinal = outcomePositions.reduce((sum, p) => sum + p.finalValueEur, 0);
  for (const p of outcomePositions) {
    p.finalWeightPct = totalFinal > 0 ? (p.finalValueEur / totalFinal) * 100 : 0;
    p.driftPp = p.finalWeightPct - p.targetPercentage;
  }

  let maxAbsDriftPp = 0;
  let maxDriftPositionId: string | null = null;
  for (const p of outcomePositions) {
    if (Math.abs(p.driftPp) > maxAbsDriftPp) {
      maxAbsDriftPp = Math.abs(p.driftPp);
      maxDriftPositionId = p.positionId;
    }
  }

  const implicitNotionalByClass: Partial<Record<AssetClass, number>> = {};
  let totalNotional = 0;
  let totalMarket = 0;

  for (const position of positions) {
    const purchases = purchasedByPosition[position.id] ?? 0;
    for (const memberId of position.memberAssetIds) {
      const member = assetsById.get(memberId);
      if (!member) continue;
      const baseValue = deps.valueOf(member);
      const memberMarketValue = memberId === position.buyAssetId ? baseValue + purchases : baseValue;
      totalMarket += memberMarketValue;
      const exposure = exposurePerEuro(member);
      for (const [assetClass, perEuro] of Object.entries(exposure) as Array<[AssetClass, number]>) {
        const notional = memberMarketValue * perEuro;
        implicitNotionalByClass[assetClass] = (implicitNotionalByClass[assetClass] ?? 0) + notional;
        totalNotional += notional;
      }
    }
  }

  const implicitClassPct: Partial<Record<AssetClass, number>> = {};
  for (const [assetClass, notional] of Object.entries(implicitNotionalByClass) as Array<[AssetClass, number]>) {
    implicitClassPct[assetClass] = totalFinal > 0 ? (notional / totalFinal) * 100 : 0;
  }

  return {
    positions: outcomePositions,
    maxAbsDriftPp,
    maxDriftPositionId,
    residualEur,
    implicitClassPct,
    leverageRatio: totalMarket > 0 ? totalNotional / totalMarket : 1,
  };
}

// ---------------------------------------------------------------------------
// 5.9 projectClassTrajectory
// ---------------------------------------------------------------------------

export type AllocationCompare = (assets: Asset[], targets: AssetAllocationTarget | null) => AllocationResult;

export interface ClassTrajectoryPoint {
  index: number;                 // 0..N
  month: MonthKey | 'baseline';
  source: 'measured' | 'projected';
  measuredAt?: Date;
  byClass: Partial<Record<AssetClass, {
    currentPct: number;          // notional % on the market base, as Allocazione shows it
    targetPct: number;           // EFFECTIVE target % (from AllocationResult.byAssetClass)
    driftPp: number;             // currentPct − targetPct
    outOfBand: boolean;          // |driftPp| > bandForTarget(band, targetPct)
  }>>;
}

/**
 * Effective target % for a MEASURED point (no live `compare()` call to read it from — see
 * `classPointFromEntries` below for the projected branch, which reads the target straight off its
 * own `compare()` result instead). Mirrors `compareAllocations`' own fixed-cash-amount scaling
 * (`assetAllocationService.ts` `toLegacyAllocationResult`, lines ~838-864): with a fixed-amount
 * cash target, the reserved € is carved out of the market base BEFORE every other class's target
 * applies, so a non-cash class's effective target is its raw config % scaled by
 * `(marketBaseEur − fixedAmount) / marketBaseEur` — not just cash. Every percentage here is scaled
 * to THIS point's own `marketBaseEur`, never the baseline's: the raw
 * config in `targets` never changes point to point, but the scaling factor does whenever the
 * market base does.
 */
/**
 * The reserve a new plan starts from: the allocation's cash quota, which a plan must not spend (owner,
 * 2026-11-17). The fixed amount when the cash target is one, else its percentage of today's allocated
 * base (`compareAllocations(...).marketValue`), rounded UP to the euro so the quota is never undercut.
 * 0 without targets, without a cash target or without a base. The editor's field stays editable.
 */
export function resolvePlanReserveEur(targets: AssetAllocationTarget | null, marketBaseEur: number): number {
  const cash = targets?.cash;
  if (!cash) return 0;
  if (cash.useFixedAmount) return Math.max(0, Math.ceil(cash.fixedAmount ?? 0));
  if (marketBaseEur <= 0) return 0;
  return Math.max(0, Math.ceil(((cash.targetPercentage ?? 0) / 100) * marketBaseEur - 1e-9));
}

/**
 * The quota covers the whole cash class — a money-market fund too — while a plan spends only from the
 * accounts (owner, 2026-11-17): the accounts keep the quota minus the cash held outside them.
 * `cashClassEur` is `compareAllocations(...).byAssetClass.cash.currentValue`, `accountsEur` the cash accounts.
 */
export function resolveAccountReserveEur(input: {
  quotaEur: number;
  cashClassEur: number;
  accountsEur: number;
  /** The plan's money-market sales (`planCashFundSaleEur`): cash moved onto the accounts, so the reserve rises by it. */
  cashFundSoldEur?: number;
}): { reserveEur: number; otherCashEur: number } {
  const otherCashEur = Math.max(0, input.cashClassEur - input.accountsEur - (input.cashFundSoldEur ?? 0));
  return { reserveEur: Math.max(0, input.quotaEur - otherCashEur), otherCashEur };
}

/** A plan's source: a real account (type and class `cash`), never a money-market fund in the cash class (owner, 2026-11-17). */
export function isPlanSourceAccount(asset: Pick<Asset, 'type' | 'assetClass'>): boolean {
  return asset.assetClass === 'cash' && asset.type === 'cash';
}

/** The settings' account for the investments, when it still is a source account; null otherwise. */
export function resolveInvestmentAccountId(
  settings: Pick<AssetAllocationSettings, 'investmentCashAssetId'> | null | undefined,
  allAssets: readonly Asset[]
): string | null {
  const id = settings?.investmentCashAssetId;
  const asset = id ? allAssets.find((candidate) => candidate.id === id) : undefined;
  return asset && isPlanSourceAccount(asset) ? asset.id : null;
}

/**
 * The reserve a new plan keeps on the cash accounts, from today's allocation: the quota, the cash outside the accounts.
 * `sourceIds` (2026-11-19) names the plan's accounts — the investment account alone, when set: the cash on the
 * other accounts then counts as cash outside the plan (`otherCashEur`); absent, every source account is the plan's.
 */
export function resolvePlanReserve(
  allAssets: Asset[],
  targets: AssetAllocationTarget | null,
  compare: AllocationCompare,
  deps: PlanDeps,
  cashFundSoldEur = 0,
  sourceIds?: readonly string[]
): { reserveEur: number; otherCashEur: number; quotaEur: number } {
  if (!targets) return { reserveEur: 0, otherCashEur: 0, quotaEur: 0 };
  const result = compare(allAssets, targets);
  const quotaEur = resolvePlanReserveEur(targets, result.marketValue);
  const accountsEur = allAssets
    .filter((asset) => isPlanSourceAccount(asset) && (sourceIds === undefined || sourceIds.includes(asset.id)))
    .reduce((sum, asset) => sum + deps.valueOf(asset), 0);
  const { reserveEur, otherCashEur } = resolveAccountReserveEur({
    quotaEur,
    cashClassEur: result.byAssetClass.cash?.currentValue ?? accountsEur,
    accountsEur,
    cashFundSoldEur,
  });
  return { reserveEur: Math.ceil(reserveEur - 1e-9), otherCashEur, quotaEur };
}

export function resolveTargetPct(
  assetClass: AssetClass,
  targets: AssetAllocationTarget,
  marketBaseEur: number
): number {
  if (marketBaseEur <= 0) return 0;
  const rawTargetPercentage = targets[assetClass]?.targetPercentage ?? 0;
  const useCashFixedAmount = targets.cash?.useFixedAmount ?? false;
  if (assetClass === 'cash' && useCashFixedAmount) {
    return ((targets.cash?.fixedAmount ?? 0) / marketBaseEur) * 100;
  }
  if (!useCashFixedAmount) return rawTargetPercentage;
  const fixedAmount = targets.cash?.fixedAmount ?? 0;
  const targetBase = Math.max(0, marketBaseEur - fixedAmount);
  return rawTargetPercentage * (targetBase / marketBaseEur);
}

function classPointFromEntries(
  index: number,
  month: MonthKey | 'baseline',
  source: 'measured' | 'projected',
  measuredAt: Date | undefined,
  entries: Array<[string, number]>,
  currentPctOf: (notionalOrValue: number) => number,
  targetPctOf: (assetClass: AssetClass) => number,
  band: RebalanceBand
): ClassTrajectoryPoint {
  const byClass: ClassTrajectoryPoint['byClass'] = {};
  for (const [key, value] of entries) {
    const assetClass = key as AssetClass;
    const currentPct = currentPctOf(value);
    const targetPct = targetPctOf(assetClass);
    const driftPp = currentPct - targetPct;
    byClass[assetClass] = {
      currentPct,
      targetPct,
      driftPp,
      outOfBand: Math.abs(driftPp) > bandForTarget(band, targetPct),
    };
  }
  return { index, month, source, measuredAt, byClass };
}

/**
 * Clone `allAssets`, projecting the effect of the plan through calendar month `index`: not-yet-
 * executed buys/disposals move quantities as before, and the
 * plan's own cash moves too, instead of sitting untouched while the buy side grows the market base
 * out of nowhere. `cassa(m) = cassa₀ − Σ acquisti pianificati fino a m + E × m + Σ ricavi delle
 * vendite non eseguite, ciascuna dal suo mese (absent = 1)`, split pro-rata over the LIVE balances of
 * `liquidity.sourceCashAssetIds` — never over the user's `allocationRole`: an `excluded` source
 * account is dropped by `compare()`'s market base regardless of its projected balance, so moving it
 * here changes nothing about the trajectory (verified). An `executed` line/disposal is skipped on
 * both the quantity and the cash side, same as before: its real ledger trade already moved both the
 * position and the cash account it settled from.
 */
function buildProjectedAssets(
  allAssets: Asset[],
  installments: Installment[],
  disposals: PlanDisposal[],
  liquidity: PlanLiquidity,
  index: number
): Asset[] {
  const clonesById = new Map<string, Asset>();
  for (const asset of allAssets) clonesById.set(asset.id, { ...asset });

  let spentEur = 0;
  for (const installment of installments) {
    if (installment.index > index) continue;
    for (const line of installment.lines) {
      if (line.status === 'executed') continue;
      const clone = clonesById.get(line.assetId);
      if (clone) clone.quantity = clone.quantity + line.plannedQuantity;
      spentEur += line.plannedAmountEur;
    }
  }

  let proceedsEur = 0;
  for (const disposal of disposals) {
    if (disposal.status === 'executed') continue;
    if (index < (disposal.monthIndex ?? 1)) continue;
    const clone = clonesById.get(disposal.assetId);
    // a partial sale takes `quantity` shares away, a total one zeroes the position.
    if (clone) clone.quantity = disposal.quantity === undefined ? 0 : Math.max(0, clone.quantity - disposal.quantity);
    proceedsEur += disposal.estimatedProceedsEur;
  }

  const inflowEur = liquidity.monthlyInflowEur * index;
  const cashDeltaEur = inflowEur + proceedsEur - spentEur;

  if (cashDeltaEur !== 0) {
    const sourceCashClones = liquidity.sourceCashAssetIds
      .map((id) => clonesById.get(id))
      .filter((asset): asset is Asset => !!asset);
    const totalSourceCashEur = sourceCashClones.reduce(
      (sum, asset) => sum + asset.quantity * unitPriceEur(asset),
      0
    );
    for (const clone of sourceCashClones) {
      const currentValueEur = clone.quantity * unitPriceEur(clone);
      // Weight by the live balance when there is one to weight by; an even split only when every
      // source account happens to be at zero (never silently dropping the delta).
      const share = totalSourceCashEur > 0 ? currentValueEur / totalSourceCashEur : 1 / sourceCashClones.length;
      const price = unitPriceEur(clone);
      if (price > 0) clone.quantity = clone.quantity + (cashDeltaEur * share) / price;
    }
  }

  return Array.from(clonesById.values());
}

export function projectClassTrajectory(input: {
  plan: AccumulationPlan;                       // active or draft preview
  allAssets: Asset[];                           // the page's full asset list
  installments: Installment[];                  // plan.installments, or the draft preview schedule
  targets: AssetAllocationTarget;               // the page's EFFECTIVE targets
  band: RebalanceBand;                          // the page's current band
  compare: AllocationCompare;                   // compareAllocations, injected
  currentIndex: number;                         // 0 for a draft; the open installment for active
}): ClassTrajectoryPoint[] {
  const { plan, allAssets, installments, targets, band, compare, currentIndex } = input;

  const points: ClassTrajectoryPoint[] = [];

  for (let index = 0; index <= plan.months; index++) {
    const month: MonthKey | 'baseline' = index === 0 ? 'baseline' : addMonths(plan.startMonth, index - 1);

    if (index < currentIndex) {
      const measurement: ClassMeasurement | undefined =
        index === 0 ? plan.baseline?.measurement : installments.find((i) => i.index === index)?.measurement;
      if (measurement) {
        points.push(
          classPointFromEntries(
            index,
            month,
            'measured',
            measurement.measuredAt,
            Object.entries(measurement.classNotionalEur) as Array<[string, number]>,
            (notional) => (measurement.marketBaseEur > 0 ? (notional / measurement.marketBaseEur) * 100 : 0),
            (assetClass) => resolveTargetPct(assetClass, targets, measurement.marketBaseEur),
            band
          )
        );
        continue;
      }
    }

    const projectedAssets = buildProjectedAssets(allAssets, installments, plan.disposals, plan.liquidity, index);
    const allocation = compare(projectedAssets, targets);
    points.push(
      classPointFromEntries(
        index,
        month,
        'projected',
        undefined,
        Object.entries(allocation.byAssetClass).map(([k, d]) => [k, d.currentPercentage]),
        (pct) => pct,
        (assetClass) => allocation.byAssetClass[assetClass]?.targetPercentage ?? 0,
        band
      )
    );
  }

  return points;
}

/**
 * The trajectory as the plan's views show it: a class at 0% target (a house, the accounts, saved as 0 by
 * Impostazioni) is no direction of the plan — kept, it filled the panel and squashed the chart's scale
 * (owner, 2026-11-17). The full trajectory stays the engine's: its cash class proves the money conserved.
 */
export function onlyTargetedClasses(points: ClassTrajectoryPoint[]): ClassTrajectoryPoint[] {
  return points.map((point) => ({
    ...point,
    byClass: Object.fromEntries(Object.entries(point.byClass).filter(([, data]) => data && data.targetPct > 0)),
  }));
}

/** Below this share (pp) a class counts as empty on the strip — rounding noise, never a position. */
const DORMANT_CLASS_EPSILON_PP = 0.05;

/** One class of the tile's class strip: where it is today, its target, and where the plan leaves it. */
export interface ClassStripRow {
  assetClass: AssetClass;
  currentPct: number;
  targetPct: number;
  /** The class's share at the plan's last point (the end of the plan). */
  finalPct: number;
  currentDriftPp: number;
  finalDriftPp: number;
  outOfBandNow: boolean;
  /** First month after today the class is back inside the band; only when it is out of it now. */
  reentryMonth?: MonthKey | 'baseline';
}

/**
 * The class strip's rows at `index` (today, clamped to the plan's length) against the trajectory's
 * last point. A DORMANT class — no share today, no target and none at the end of the plan — is
 * dropped: it exists only because the target document carries a 0% entry, and «Immobili 0,0% ·
 * target 0,0%» is a verdict on a void (the same rule as Per classe's `isDormantClass`,
 * doc/guide/allocazione.md). Rows keep the trajectory's class order, so the furthest drift a caller
 * reads from them is aligned with what it prints.
 */
export function selectClassStripRows(trajectory: ClassTrajectoryPoint[], index: number): ClassStripRow[] {
  const currentPoint = trajectory.find((point) => point.index === index);
  if (!currentPoint) return [];
  const finalPoint = trajectory[trajectory.length - 1];

  const rows: ClassStripRow[] = [];
  for (const [assetClass, data] of Object.entries(currentPoint.byClass) as [AssetClass, NonNullable<ClassTrajectoryPoint['byClass'][AssetClass]>][]) {
    const final = finalPoint?.byClass[assetClass] ?? data;
    const isDormant =
      Math.abs(data.currentPct) < DORMANT_CLASS_EPSILON_PP &&
      Math.abs(data.targetPct) < DORMANT_CLASS_EPSILON_PP &&
      Math.abs(final.currentPct) < DORMANT_CLASS_EPSILON_PP;
    if (isDormant) continue;

    const reentry = data.outOfBand
      ? trajectory.find((point) => point.index > index && point.byClass[assetClass] && !point.byClass[assetClass]!.outOfBand)
      : undefined;
    rows.push({
      assetClass,
      currentPct: data.currentPct,
      targetPct: data.targetPct,
      finalPct: final.currentPct,
      currentDriftPp: data.driftPp,
      finalDriftPp: final.driftPp,
      outOfBandNow: data.outOfBand,
      reentryMonth: reentry?.month,
    });
  }
  return rows;
}

// ---------------------------------------------------------------------------
// 5.10 buildClassMeasurement
// ---------------------------------------------------------------------------

export function buildClassMeasurement(result: AllocationResult, measuredAt: Date): ClassMeasurement {
  const classNotionalEur: Partial<Record<AssetClass, number>> = {};
  for (const [assetClass, data] of Object.entries(result.byAssetClass)) {
    classNotionalEur[assetClass as AssetClass] = data.currentValue;
  }
  return { measuredAt, classNotionalEur, marketBaseEur: result.marketValue };
}

// ---------------------------------------------------------------------------
// 5.11 buildDraftPreview
// ---------------------------------------------------------------------------

export function buildDraftPreview(input: {
  draft: AccumulationPlanDraft;
  allAssets: Asset[];
  targets: AssetAllocationTarget;
  band: RebalanceBand;
  compare: AllocationCompare;
  deps: PlanDeps;
  /** The plan month of the draft's first month: 1 for a new plan, `k` for a revision's draft (one frame, the plan's). */
  firstIndex?: number;
}): {
  liquidity: UsableLiquidity;
  totals: Record<string, number>;
  schedule: ScheduleResult;
  outcome: PlanOutcome;
  trajectory: ClassTrajectoryPoint[];
  unpricedPositionIds: string[];
} {
  const { draft, allAssets, targets, band, compare, deps } = input;
  const firstIndex = input.firstIndex ?? 1;
  const assetsById = new Map(allAssets.map((asset) => [asset.id, asset]));

  // Live, not the draft's own stored figure — a disposal's proceeds track the CURRENT market value.
  const liveDisposals: PlanDisposal[] = draft.disposals.map((disposal) => {
    const asset = assetsById.get(disposal.assetId);
    return { ...disposal, estimatedProceedsEur: proceedsOfDisposal(disposal, asset, deps) };
  });

  const states = resolvePositionStates(draft.positions, assetsById, deps, liveDisposals);
  const liquidity = computeUsableLiquidity(draft.liquidity, assetsById, liveDisposals, draft.months, deps, firstIndex);
  const totals = computeTotalPurchases(states, liquidity.L);
  const schedule = scheduleInstallments(
    totals, states, draft.months, draft.startMonth, firstIndex, liquidity.refillMonths, liquidity.monthShares, liquidity.swaps
  );
  const outcome = projectPlanOutcome(
    states,
    schedule.installments,
    schedule.residualEur,
    assetsById,
    draft.positions,
    deps
  );

  const draftPlan: AccumulationPlan = {
    id: 'draft-preview',
    userId: '',
    name: draft.name,
    status: 'draft',
    startMonth: draft.startMonth,
    months: draft.months,
    liquidity: draft.liquidity,
    positions: draft.positions,
    disposals: liveDisposals,
    installments: schedule.installments,
    createdAt: new Date(0),
    updatedAt: new Date(0),
  };

  const trajectory = projectClassTrajectory({
    plan: draftPlan,
    allAssets,
    installments: schedule.installments,
    targets,
    band,
    compare,
    currentIndex: 0,
  });

  return {
    liquidity,
    totals,
    schedule,
    outcome,
    trajectory,
    unpricedPositionIds: states.filter((s) => s.unpriced).map((s) => s.positionId),
  };
}

// Re-exported so a caller of this module never needs to import unitPriceEur from costBasisEur
// separately for a `PlanDeps.priceOf` implementation.
export { unitPriceEur };

// ---------------------------------------------------------------------------
// The weight optimizer's standalone tool: converts its proposed weights into freshly-seeded PAC positions,
// the same shape `seedPositionsFromAssets` builds — one position
// per single instrument, target = the proposed weight. `generateId` is injected (never
// `crypto.randomUUID()` called inline) so the conversion stays deterministic under test.
// ---------------------------------------------------------------------------

/**
 * The editor's second step starts on ONE singleton position per buyable, valued holding — every euro
 * the page knows about needs a bucket the moment the editor opens, never only once the reader has
 * thought to add one. The target starts at 0, not at the holding's current share: a pre-filled 100%
 * for a single-asset portfolio would hide the very total-≠-100 gate the step exists to enforce. A cash
 * account is never seeded: once picked as a source too, its value would enter the base twice.
 * `valueOf` is `calculateAssetValue`, injected.
 */
export function seedPositionsFromAssets(
  allAssets: Asset[],
  valueOf: (asset: Asset) => number,
  generateId: () => string = () => crypto.randomUUID()
): PlanPosition[] {
  return allAssets
    .filter((asset) => isPlanBuyable(asset, allAssets) && valueOf(asset) > 0)
    .map((asset) => ({
      id: generateId(),
      label: asset.name,
      targetPercentage: 0,
      memberAssetIds: [asset.id],
      buyAssetId: asset.id,
    }));
}

/**
 * The sales «Con vendite mirate» chose, as the fresh draft's disposals. A candidate the proposal brings to
 * 0% (`soldOutKeys`) is sold whole; any other sells `floor(€ / price)` shares, never all of them, and
 * nothing when that is 0 — being out of the model (a money-market fund no plan buys) is not being sold
 * out (collaudo 2026-11-18). Amounts in cents.
 */
export function seedDisposalsFromSale(
  sold: Array<{ key: string; soldEur: number }>,
  soldOutKeys: Set<string>,
  assetsById: Map<string, Asset>,
  deps: PlanDeps
): PlanDisposal[] {
  const disposals: PlanDisposal[] = [];
  for (const { key, soldEur } of sold) {
    const asset = assetsById.get(key);
    if (!asset || soldEur <= 0) continue;
    if (soldOutKeys.has(key)) {
      disposals.push({ assetId: key, estimatedProceedsEur: roundToCents(deps.valueOf(asset)), status: 'planned' });
      continue;
    }
    const price = deps.priceOf(asset);
    if (price <= 0) continue;
    const quantity = Math.min(Math.floor(soldEur / price + 1e-9), Math.ceil(asset.quantity) - 1);
    if (quantity <= 0) continue;
    disposals.push({ assetId: key, quantity, estimatedProceedsEur: roundToCents(quantity * price), status: 'planned' });
  }
  return disposals;
}

/**
 * Weights per instrument as freshly-seeded PAC positions: one position per instrument, target = the
 * weight (a group's members ride along when `memberAssetIds` is given). `generateId` is injected
 * (never `crypto.randomUUID()` called inline) so the conversion stays deterministic under test.
 */
export function weightsToSeedPositions(
  weights: Array<{ key: string; label: string; proposedPct: number; /** A group's members, the buyer (`key`) included. */ memberAssetIds?: string[] }>,
  generateId: () => string = () => crypto.randomUUID()
): PlanPosition[] {
  return weights.map((w) => ({
    id: generateId(),
    label: w.label,
    targetPercentage: w.proposedPct,
    memberAssetIds: w.memberAssetIds && w.memberAssetIds.length > 1 ? orderGroupMembers({ memberAssetIds: w.memberAssetIds, buyAssetId: w.key }) : [w.key],
    buyAssetId: w.key,
  }));
}

// ---------------------------------------------------------------------------
// The path's start — where a plan's weights come from (the model, today's weights)
// ---------------------------------------------------------------------------

/** Today's market weights (%) among `assets`: two decimals, Σ = 100 (the rounding remainder goes to the largest). */
export function marketWeights(assets: Asset[], deps: PlanDeps): Record<string, number> {
  const values = assets.map((asset) => ({ id: asset.id, value: Math.max(0, deps.valueOf(asset)) }));
  const total = values.reduce((sum, v) => sum + v.value, 0);
  const weights: Record<string, number> = {};
  if (total <= 0) return weights;
  let largest = values[0];
  let allocated = 0;
  for (const { id, value } of values) {
    const pct = Math.round((value / total) * 10000) / 100;
    weights[id] = pct;
    allocated += pct;
    if (value > largest.value) largest = { id, value };
  }
  weights[largest.id] = Math.round((weights[largest.id] + (100 - allocated)) * 100) / 100;
  return weights;
}

/**
 * Sets the positions' target weights from a per-instrument map (the model portfolio, today's market
 * weights): a position takes the sum of its members' weights (none = 0); an instrument of the map
 * that no position holds and that is not being sold becomes a new single-instrument position.
 */
export function applyWeightsToPositions(
  positions: PlanPosition[],
  weightsByAssetId: Record<string, number>,
  soldAssetIds: Set<string>,
  labelOf: (assetId: string) => string,
  generateId: () => string = () => crypto.randomUUID()
): PlanPosition[] {
  const covered = new Set(positions.flatMap((position) => position.memberAssetIds));
  const updated = positions.map((position) => ({
    ...position,
    targetPercentage: position.memberAssetIds.reduce((sum, id) => sum + (weightsByAssetId[id] ?? 0), 0),
  }));
  const added: PlanPosition[] = Object.entries(weightsByAssetId)
    .filter(([assetId, pct]) => pct > 0 && !covered.has(assetId) && !soldAssetIds.has(assetId))
    .map(([assetId, pct]) => ({
      id: generateId(),
      label: labelOf(assetId),
      targetPercentage: pct,
      memberAssetIds: [assetId],
      buyAssetId: assetId,
    }));
  return [...updated, ...added];
}

/**
 * The model portfolio onto the positions: its groups of equivalent instruments become ONE
 * position that buys the group's buyer (a position keeps its id when it already was that group), then
 * the weights (`applyWeightsToPositions`). A group whose members sit in a position that reaches outside
 * the group is left to the per-instrument weights: it never splits a position the user built.
 */
export function applyModelToPositions(
  positions: PlanPosition[],
  model: ModelPortfolio,
  soldAssetIds: Set<string>,
  labelOf: (assetId: string) => string,
  generateId: () => string = () => crypto.randomUUID()
): PlanPosition[] {
  let next = positions;
  for (const group of modelGroups(model.weights)) {
    const members = new Set(group.memberAssetIds);
    const overlapping = next.filter((position) => position.memberAssetIds.some((id) => members.has(id)));
    if (overlapping.length === 0 || overlapping.some((position) => position.memberAssetIds.some((id) => !members.has(id)))) continue;
    const first = next.indexOf(overlapping[0]);
    const kept = overlapping.find((position) => position.buyAssetId === group.buyAssetId);
    const grouped: PlanPosition = {
      id: kept?.id ?? generateId(),
      label: kept?.label ?? labelOf(group.buyAssetId),
      targetPercentage: 0,
      memberAssetIds: orderGroupMembers({ memberAssetIds: group.memberAssetIds, buyAssetId: group.buyAssetId }),
      buyAssetId: group.buyAssetId,
    };
    next = next.flatMap((position, index) => (index === first ? [grouped] : overlapping.includes(position) ? [] : [position]));
  }
  return applyWeightsToPositions(next, modelWeightMap(model), soldAssetIds, labelOf, generateId);
}

/** The model portfolio as a per-instrument weight map (candidates at 0 are left out). */
export function modelWeightMap(model: ModelPortfolio): Record<string, number> {
  const map: Record<string, number> = {};
  for (const weight of model.weights) if (weight.targetPercentage > 0) map[weight.assetId] = weight.targetPercentage;
  return map;
}

/**
 * «Ridistribuisci il resto»: brings the weights to 100,0% by sharing the gap across the positions
 * that already carry a weight, in proportion to it (equally when none does). One decimal; the
 * largest position absorbs the rounding so the sum is exactly 100,0%. A weight never goes below 0.
 */
export function redistributeRemainder(positions: PlanPosition[]): PlanPosition[] {
  if (positions.length === 0) return positions;
  const sum = positions.reduce((acc, position) => acc + position.targetPercentage, 0);
  const weighted = positions.filter((position) => position.targetPercentage > 0);
  const base = weighted.length > 0 ? weighted : positions;
  const baseSum = base.reduce((acc, position) => acc + position.targetPercentage, 0);
  const gap = 100 - sum;
  const next = positions.map((position) => {
    if (!base.includes(position)) return position;
    const share = baseSum > 0 ? position.targetPercentage / baseSum : 1 / base.length;
    const target = Math.max(0, Math.round((position.targetPercentage + gap * share) * 10) / 10);
    return { ...position, targetPercentage: target };
  });
  const rounded = next.reduce((acc, position) => acc + position.targetPercentage, 0);
  const residue = Math.round((100 - rounded) * 10) / 10;
  if (residue !== 0) {
    const largest = next.reduce((best, position, index) => (position.targetPercentage > next[best].targetPercentage ? index : best), 0);
    next[largest] = { ...next[largest], targetPercentage: Math.max(0, Math.round((next[largest].targetPercentage + residue) * 10) / 10) };
  }
  return next;
}

/**
 * The members of a position with the one that BUYS first. A group's head is the instrument that
 * receives the purchases (`buyAssetId`), never the first of the list: the target step shows the
 * figures (today's weight, target, to buy, shares at ITS price) on the head row.
 * A `buyAssetId` that is not a member leaves the order as it was.
 */
export function orderGroupMembers(position: Pick<PlanPosition, 'memberAssetIds' | 'buyAssetId'>): string[] {
  const { memberAssetIds, buyAssetId } = position;
  if (!memberAssetIds.includes(buyAssetId)) return [...memberAssetIds];
  return [buyAssetId, ...memberAssetIds.filter((id) => id !== buyAssetId)];
}

/**
 * the name of an installment line. A revision can retire a position (a whole sale, a group changed in the
 * model) after some of its lines were closed; those lines then name the instrument that bought, never the id.
 */
export function installmentLineLabel(
  line: Pick<InstallmentLine, 'positionId' | 'assetId'>,
  positions: PlanPosition[],
  nameOfAsset: (assetId: string) => string | undefined
): string {
  const position = positions.find((candidate) => candidate.id === line.positionId);
  if (position && position.buyAssetId === line.assetId) return position.label;
  return nameOfAsset(line.assetId) ?? position?.label ?? line.assetId;
}

/**
 * the instruments of an open plan, for the optimizers' «to evaluate» set — also those at 0 shares
 * (a plan can buy an instrument nobody holds yet), which a model portfolio may not carry.
 */
export function planMemberAssetIds(plan: Pick<AccumulationPlan, 'positions'> | null | undefined): Set<string> {
  return new Set((plan?.positions ?? []).flatMap((position) => position.memberAssetIds));
}

export interface AddableAsset {
  asset: Asset;
  /** Zero shares held: created empty, or sold out. */
  held: boolean;
  /** The Registro has no operation for it (only known when the ledger is read). */
  neverBought: boolean;
}

/**
 * the instruments the path's «strumenti» screen can still take: tradable, not a cash account, not already in
 * the draft (a position or a sale) — also those with no shares, which the seeder never lists. In the
 * lead the never-bought ones (then the sold-out), then the ones held; by name inside each group.
 * `alsoAllow` lets a group's own members through (the «Sostituisci» of a group).
 */
export function listAddableAssets(
  allAssets: Asset[],
  draft: { positions: PlanPosition[]; disposals: PlanDisposal[] },
  tradedAssetIds: ReadonlySet<string> | null = null,
  alsoAllow: ReadonlySet<string> = new Set()
): AddableAsset[] {
  const taken = new Set<string>();
  for (const position of draft.positions) for (const id of position.memberAssetIds) taken.add(id);
  for (const disposal of draft.disposals) taken.add(disposal.assetId);
  return allAssets
    .filter((asset) => isPlanBuyable(asset, allAssets) && (!taken.has(asset.id) || alsoAllow.has(asset.id)))
    .map((asset) => {
      const held = asset.quantity > 0;
      return { asset, held, neverBought: describeZeroQuantityChip(asset, tradedAssetIds) === NEVER_BOUGHT_CHIP };
    })
    .sort((a, b) => rank(a) - rank(b) || a.asset.name.localeCompare(b.asset.name, 'it'));

  function rank(entry: AddableAsset): number {
    return entry.neverBought ? 0 : entry.held ? 2 : 1;
  }
}

/**
 * An asset a plan may buy: an instrument the ledger can register (stock, etf, bond, crypto, commodity) whose role,
 * resolved with what it finances, is tradable; never an account, a money-market fund, a loan, a property or a
 * pension fund (2026-11-12). The ONE predicate of «+ Aggiungi», the editor's list and seeded positions, the
 * draft's validation and the empty tile's preview: a plan buys only what «Registra» can write.
 */
export function isPlanBuyable(asset: Asset, allAssets: readonly Asset[]): boolean {
  if (!isLedgerAssetType(asset.type) || asset.assetClass === 'cash') return false;
  return resolveAllocationRoleWithin(asset, allAssets) === 'tradable';
}

/**
 * A money-market fund (a ledger instrument of the cash class, never an account): a plan may SELL it, never buy it
 * (owner, 2026-11-18). Its sale only moves cash onto the accounts — the reserve rises by it (`planCashFundSaleEur`).
 */
export function isPlanCashFund(asset: Asset, allAssets: readonly Asset[]): boolean {
  if (!isLedgerAssetType(asset.type) || asset.type === 'cash' || asset.assetClass !== 'cash') return false;
  return resolveAllocationRoleWithin(asset, allAssets) === 'tradable';
}

/** The euros a draft's pending money-market sales move onto the accounts. */
export function planCashFundSaleEur(disposals: readonly PlanDisposal[], assetsById: Map<string, Asset>, allAssets: readonly Asset[]): number {
  return disposals
    .filter((d) => d.status !== 'executed' && d.status !== 'skipped')
    .reduce((sum, d) => {
      const asset = assetsById.get(d.assetId);
      return asset && isPlanCashFund(asset, allAssets) ? sum + d.estimatedProceedsEur : sum;
    }, 0);
}

/** Classes of a trajectory point worth showing: with a weight or a target (|x| ≥ 0,05%), as the target step's table. */
export function liveClassEntries(point: ClassTrajectoryPoint): Array<[AssetClass, NonNullable<ClassTrajectoryPoint['byClass'][AssetClass]>]> {
  const entries: Array<[AssetClass, NonNullable<ClassTrajectoryPoint['byClass'][AssetClass]>]> = [];
  for (const [assetClass, entry] of Object.entries(point.byClass) as Array<[AssetClass, ClassTrajectoryPoint['byClass'][AssetClass]]>) {
    if (entry && (Math.abs(entry.currentPct) >= 0.05 || Math.abs(entry.targetPct) >= 0.05)) entries.push([assetClass, entry]);
  }
  return entries;
}
