/**
 * accumulationPlanUtils — the pure engine of the PAC (Accumulo) tile.
 *
 * Zero Firebase/service imports on purpose, so the unit suite never mocks `@/lib/firebase/config`:
 * every dependency on live data (an asset's EUR value, its unit price, `compareAllocations`) is
 * injected (`PlanDeps`, `AllocationCompare`) rather than imported. No `Date.now()` inside any
 * function — "today" always arrives as a parameter.
 */
import type { Asset, AssetAllocationTarget, AssetClass, AllocationResult } from '@/types/assets';
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
import type { ModelPortfolio } from '@/types/modelPortfolio';
import { modelGroups } from '@/lib/utils/modelPortfolio';
import { splitTowardTarget, bandForTarget, resolveAllocationRole, type RebalanceBand } from './allocationUtils';
import { unitPriceEur } from './costBasisEur';
import { getItalyMonthYear } from './dateHelpers';
import { describeZeroQuantityChip, NEVER_BOUGHT_CHIP } from './zeroQuantityChip';

// ---------------------------------------------------------------------------
// 5.1 Month helpers
// ---------------------------------------------------------------------------

/** 'YYYY-MM' in Italy time. */
export function toMonthKey(date: Date): MonthKey {
  const { year, month } = getItalyMonthYear(date);
  return `${year}-${String(month).padStart(2, '0')}`;
}

/** Add `n` months to a MonthKey (n may be negative or zero); handles year rollover. */
export function addMonths(month: MonthKey, n: number): MonthKey {
  const [yearStr, monthStr] = month.split('-');
  const zeroBased = Number(monthStr) - 1 + n;
  const year = Number(yearStr) + Math.floor(zeroBased / 12);
  const newMonth = ((zeroBased % 12) + 12) % 12 + 1;
  return `${year}-${String(newMonth).padStart(2, '0')}`;
}

/** 1..N inside the plan, 0 before startMonth, N+1 after the last month. */
export function monthIndexOf(
  plan: Pick<AccumulationPlan, 'startMonth' | 'months'>,
  month: MonthKey
): number {
  const toOrdinal = (key: MonthKey): number => {
    const [y, m] = key.split('-').map(Number);
    return y * 12 + (m - 1);
  };
  const diff = toOrdinal(month) - toOrdinal(plan.startMonth);
  const index = diff + 1;
  if (index < 1) return 0;
  if (index > plan.months) return plan.months + 1;
  return index;
}

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
 * RP2: what a disposal brings in at `asset`'s current price — `quantity × price` for a partial sale
 * (never more than the shares held), the whole position's value when `quantity` is absent.
 */
export function proceedsOfDisposal(disposal: PlanDisposal, asset: Asset | undefined, deps: PlanDeps): number {
  if (!asset) return disposal.estimatedProceedsEur;
  if (disposal.quantity === undefined) return deps.valueOf(asset);
  return Math.min(disposal.quantity, asset.quantity) * deps.priceOf(asset);
}

export function resolvePositionStates(
  positions: PlanPosition[],
  assetsById: Map<string, Asset>,
  deps: PlanDeps,
  disposals: PlanDisposal[] = []
): PositionState[] {
  // RP2: the shares still to be sold leave the position's value (an executed/skipped sale already left the ledger or never will).
  const pendingSale = new Map<string, number>();
  for (const disposal of disposals) {
    if (disposal.quantity === undefined) continue;
    if (disposal.status === 'executed' || disposal.status === 'skipped') continue;
    pendingSale.set(disposal.assetId, (pendingSale.get(disposal.assetId) ?? 0) + disposal.quantity);
  }
  return positions.map((position) => {
    let currentValueEur = 0;
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
  L: number;                    // L0 + inflowTotalEur
  belowReserve: boolean;        // sourceCashEur < reserveEur
}

export function computeUsableLiquidity(
  liquidity: PlanLiquidity,
  assetsById: Map<string, Asset>,
  disposals: PlanDisposal[],
  monthsRemaining: number,
  deps: PlanDeps
): UsableLiquidity {
  let sourceCashEur = 0;
  for (const id of liquidity.sourceCashAssetIds) {
    const asset = assetsById.get(id);
    if (asset) sourceCashEur += deps.valueOf(asset);
  }
  const availableNowEur = Math.max(0, sourceCashEur - liquidity.reserveEur);
  const disposalProceedsEur = disposals
    .filter((d) => d.status !== 'executed' && d.status !== 'skipped')
    .reduce((sum, d) => sum + d.estimatedProceedsEur, 0);
  const inflowTotalEur = liquidity.monthlyInflowEur * monthsRemaining;
  const L0 = availableNowEur + disposalProceedsEur;
  const L = L0 + inflowTotalEur;
  return {
    sourceCashEur,
    availableNowEur,
    disposalProceedsEur,
    inflowTotalEur,
    L0,
    L,
    belowReserve: sourceCashEur < liquidity.reserveEur,
  };
}

/**
 * The reserve reading of the tile and the draft box (B2, B5): only the plan's SOURCE accounts count,
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
// 5.6 scheduleInstallments (S1, D8, D9)
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
  firstIndex = 1
): ScheduleResult {
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
    for (const s of states) carryInEur[s.positionId] = carry[s.positionId];

    const lines: InstallmentLine[] = [];
    const lineByPosition: Record<string, InstallmentLine> = {};

    for (const s of pricedStates) {
      const total = totals[s.positionId] ?? 0;
      const budget = total / months + carry[s.positionId];
      const q = Math.floor(budget / s.buyPriceEur + 1e-9);
      const spend = q * s.buyPriceEur;
      carry[s.positionId] = budget - spend;
      if (q > 0) {
        const line: InstallmentLine = {
          positionId: s.positionId,
          assetId: s.buyAssetId,
          plannedQuantity: q,
          priceEurAtPlan: s.buyPriceEur,
          plannedAmountEur: spend,
          status: 'planned',
        };
        lines.push(line);
        lineByPosition[s.positionId] = line;
        spentByPosition[s.positionId] += spend;
      }
    }

    if (m === months) {
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
        line.plannedAmountEur += picked.buyPriceEur;
        spentByPosition[picked.positionId] += picked.buyPriceEur;
        pool -= picked.buyPriceEur;
        remainingDeficit[picked.positionId] -= picked.buyPriceEur;
      }

      residualEur = pool;
    }

    installments.push({ index: firstIndex + m - 1, month: addMonths(startMonth, m - 1), lines, carryInEur });
  }

  return { installments, residualEur };
}

// ---------------------------------------------------------------------------
// 5.7 recalibrateInstallment (S3)
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
    deps
  );
  const states = resolvePositionStates(plan.positions, assetsById, deps, plan.disposals);
  const totals = computeTotalPurchases(states, liquidity.L);
  const pricedStates = states.filter((s) => !s.unpriced);
  const cashCeiling = liquidity.availableNowEur + liquidity.disposalProceedsEur;

  const budgets: Record<string, number> = {};
  for (const s of pricedStates) budgets[s.positionId] = (totals[s.positionId] ?? 0) / monthsRemaining;

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

/** RP5: the patch a saved «Registra» trade puts on its line (fees excluded, as the matching does — D10). */
export function buildRegisteredLinePatch(
  transactionId: string,
  quantity: number,
  priceEur: number
): { status: 'executed'; transactionIds: string[]; executedQuantity: number; executedAmountEur: number } {
  return { status: 'executed', transactionIds: [transactionId], executedQuantity: quantity, executedAmountEur: quantity * priceEur };
}

/** The suggested whole-share quantities of a recalibration, by position — what «Lascia così» remembers (RP3). */
export function recalibrationQuantities(result: RecalibrationResult): Record<string, number> {
  const quantities: Record<string, number> = {};
  for (const line of result.lines) quantities[line.positionId] = line.suggestedQuantity;
  return quantities;
}

/**
 * RP3: the open installment's recalibration is proposed when the reserve is breached or some line
 * would move by a whole share, unless the reader already declined these very figures
 * (`Installment.recalibrationDismissed`).
 */
export function shouldProposeRecalibration(
  result: RecalibrationResult,
  dismissed?: { quantities: Record<string, number> }
): boolean {
  const changes = result.lines.some((line) => Math.abs(line.suggestedQuantity - line.plannedQuantity) >= 1);
  if (!result.liquidity.belowReserve && !changes) return false;
  if (!dismissed) return true;
  const suggested = recalibrationQuantities(result);
  const keys = new Set([...Object.keys(suggested), ...Object.keys(dismissed.quantities)]);
  for (const key of keys) {
    if ((suggested[key] ?? 0) !== (dismissed.quantities[key] ?? 0)) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// RP4 buildRevisedPlan («Rivedi il piano», D-A3)
// ---------------------------------------------------------------------------

export interface PlanRevisionInput {
  monthlyInflowEur: number;
  reserveEur: number;
  remainingMonths: number;
  positions: PlanPosition[];
  /** The NEW disposals only (they fall in the first revised month); the plan's existing ones stay. */
  disposals: PlanDisposal[];
  /** AL11: the source accounts, editable in a revision; absent = the plan's own. */
  sourceCashAssetIds?: string[];
  /** AL11: saved sales not yet executed that the revision takes off (by instrument). */
  removedDisposalAssetIds?: string[];
  /** AL11: saved sales not yet executed moved to another installment (≥ the first revised one), by instrument. */
  movedDisposalMonthIndexes?: Record<string, number>;
}

/** A saved sale a revision can still change: not executed, not skipped, not linked to a ledger sale. */
export function isOpenSavedDisposal(disposal: PlanDisposal): boolean {
  return disposal.status === 'planned' && (disposal.transactionIds?.length ?? 0) === 0;
}

/**
 * AL11: what a revision's sales list says about the plan's saved sales. `draftDisposals` is the list the
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
    } else if (saved.quantity !== disposal.quantity) {
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
  | { ok: false; issue: 'nothing_to_revise' | 'months_range' | 'sale_month_range' }
  | { ok: false; issue: 'duplicate_asset'; assetId: string };

/** The first installment with no line executed, skipped or linked: where a revision starts (D-A3). */
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
  const months = k - 1 + revision.remainingMonths;
  if (!Number.isInteger(revision.remainingMonths) || revision.remainingMonths < 1 || months < 1 || months > 60) {
    return { ok: false, issue: 'months_range' };
  }

  // AL11: a saved sale not yet executed can come off or move to a month ≥ k; an executed one stays as it is.
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

  const newDisposals: PlanDisposal[] = revision.disposals.map((disposal) => ({
    ...disposal,
    monthIndex: k,
    estimatedProceedsEur: proceedsOfDisposal(disposal, assetsById.get(disposal.assetId), deps),
  }));
  const disposals = [...keptDisposals, ...newDisposals];
  const liquiditySettings: PlanLiquidity = {
    ...plan.liquidity,
    ...(revision.sourceCashAssetIds ? { sourceCashAssetIds: revision.sourceCashAssetIds } : {}),
    monthlyInflowEur: revision.monthlyInflowEur,
    reserveEur: revision.reserveEur,
  };
  const liquidity = computeUsableLiquidity(liquiditySettings, assetsById, disposals, revision.remainingMonths, deps);
  const states = resolvePositionStates(revision.positions, assetsById, deps, disposals);
  const totals = computeTotalPurchases(states, liquidity.L);
  const schedule = scheduleInstallments(totals, states, revision.remainingMonths, first.month, k);

  return {
    ok: true,
    firstIndex: k,
    liquidity,
    plan: {
      ...plan,
      months,
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
// 5.9 projectClassTrajectory (D11)
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
 * to THIS point's own `marketBaseEur`, never the baseline's (PR #4 review, rilievo 1): the raw
 * config in `targets` never changes point to point, but the scaling factor does whenever the
 * market base does.
 */
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
 * executed buys/disposals move quantities as before, and — since PR #4's review, rilievo 2 — the
 * plan's own cash moves too, instead of sitting untouched while the buy side grows the market base
 * out of nowhere. `cassa(m) = cassa₀ − Σ acquisti pianificati fino a m + E × m + Σ ricavi delle
 * vendite non eseguite (dal mese 1)`, split pro-rata over the LIVE balances of
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
    // RP2: a partial sale takes `quantity` shares away, a total one zeroes the position.
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
}): {
  liquidity: UsableLiquidity;
  totals: Record<string, number>;
  schedule: ScheduleResult;
  outcome: PlanOutcome;
  trajectory: ClassTrajectoryPoint[];
  unpricedPositionIds: string[];
} {
  const { draft, allAssets, targets, band, compare, deps } = input;
  const assetsById = new Map(allAssets.map((asset) => [asset.id, asset]));

  // Live, not the draft's own stored figure — a disposal's proceeds track the CURRENT market value.
  const liveDisposals: PlanDisposal[] = draft.disposals.map((disposal) => {
    const asset = assetsById.get(disposal.assetId);
    return { ...disposal, estimatedProceedsEur: proceedsOfDisposal(disposal, asset, deps) };
  });

  const states = resolvePositionStates(draft.positions, assetsById, deps, liveDisposals);
  const liquidity = computeUsableLiquidity(draft.liquidity, assetsById, liveDisposals, draft.months, deps);
  const totals = computeTotalPurchases(states, liquidity.L);
  const schedule = scheduleInstallments(totals, states, draft.months, draft.startMonth);
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
// §4.4 — the weight optimizer's standalone tool: converts its proposed weights into freshly-seeded PAC positions,
// the same shape `seedPositionsFromAssets` builds in `AccumulationPlanDialog.tsx` — one position
// per single instrument, target = the proposed weight. `generateId` is injected (never
// `crypto.randomUUID()` called inline) so the conversion stays deterministic under test.
// ---------------------------------------------------------------------------

/**
 * RP2: the sales «Con vendite mirate» chose, as the PAC's disposals. A candidate brought to weight 0
 * is sold whole (outside the plan); one that stays in the plan sells `floor(€ / price)` shares, never
 * all of them (a total sale of a position is refused by the schema), and nothing when that is 0.
 */
export function seedDisposalsFromSale(
  sold: Array<{ key: string; soldEur: number }>,
  keptKeys: Set<string>,
  assetsById: Map<string, Asset>,
  deps: PlanDeps
): PlanDisposal[] {
  const disposals: PlanDisposal[] = [];
  for (const { key, soldEur } of sold) {
    const asset = assetsById.get(key);
    if (!asset || soldEur <= 0) continue;
    const price = deps.priceOf(asset);
    if (!keptKeys.has(key)) {
      disposals.push({ assetId: key, estimatedProceedsEur: deps.valueOf(asset), status: 'planned' });
      continue;
    }
    if (price <= 0) continue;
    const quantity = Math.min(Math.floor(soldEur / price + 1e-9), Math.ceil(asset.quantity) - 1);
    if (quantity <= 0) continue;
    disposals.push({ assetId: key, quantity, estimatedProceedsEur: quantity * price, status: 'planned' });
  }
  return disposals;
}

export function weightsToSeedPositions(
  weights: Array<{ key: string; label: string; proposedPct: number; /** AL16: a group's members, the buyer (`key`) included. */ memberAssetIds?: string[] }>,
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
// RP1 «Parti da» — where the Target step's weights come from
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
 * AL16 — the model portfolio onto the positions: its groups of equivalent instruments become ONE
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
 * AL8: the singleton positions of `assetIds` become ONE group that buys `buyAssetId`, at the sum of their
 * weights, appended after the others. The group keeps the id of the buy instrument's own position, so the
 * lines already closed under it still belong to the position that bought them.
 */
export function groupPositions(
  positions: PlanPosition[],
  assetIds: ReadonlySet<string>,
  buyAssetId: string,
  labelOf: (assetId: string) => string,
  newId: () => string = () => crypto.randomUUID()
): PlanPosition[] {
  const selected = positions.filter((position) => position.memberAssetIds.length === 1 && assetIds.has(position.memberAssetIds[0]));
  if (selected.length < 2 || !assetIds.has(buyAssetId)) return positions;
  const buyPosition = selected.find((position) => position.memberAssetIds[0] === buyAssetId);
  const grouped: PlanPosition = {
    id: buyPosition?.id ?? newId(),
    label: labelOf(buyAssetId),
    targetPercentage: selected.reduce((sum, position) => sum + position.targetPercentage, 0),
    memberAssetIds: orderGroupMembers({ memberAssetIds: selected.flatMap((position) => position.memberAssetIds), buyAssetId }),
    buyAssetId,
  };
  return [...positions.filter((position) => !selected.includes(position)), grouped];
}

/**
 * AL8: a group back into one position per instrument, the weight split by today's value (evenly when
 * none has value). The member that buys keeps the group's id (closed lines stay with it).
 */
export function separatePosition(
  positions: PlanPosition[],
  positionId: string,
  valueOf: (assetId: string) => number,
  labelOf: (assetId: string) => string,
  newId: () => string = () => crypto.randomUUID()
): PlanPosition[] {
  const position = positions.find((candidate) => candidate.id === positionId);
  if (!position || position.memberAssetIds.length < 2) return positions;
  const total = position.memberAssetIds.reduce((sum, id) => sum + valueOf(id), 0);
  const split: PlanPosition[] = position.memberAssetIds.map((assetId) => ({
    id: assetId === position.buyAssetId ? position.id : newId(),
    label: labelOf(assetId),
    targetPercentage: total > 0 ? (valueOf(assetId) / total) * position.targetPercentage : position.targetPercentage / position.memberAssetIds.length,
    memberAssetIds: [assetId],
    buyAssetId: assetId,
  }));
  return [...positions.filter((candidate) => candidate.id !== positionId), ...split];
}

/**
 * AL9: «Sostituisci» — `newAssetId` becomes the instrument that BUYS in `positionId`, the old buyer staying
 * in the group (nothing is sold: it keeps what it holds); the weight is the same. A singleton becomes
 * the group [new, old]; a group changes its buyer (to a member or to an instrument from outside). The position
 * takes a new id: the lines already closed under the old id name the old instrument and stay readable.
 * Null when `newAssetId` already sits in another position.
 */
export function replaceBuyAsset(
  positions: PlanPosition[],
  positionId: string,
  newAssetId: string,
  labelOf: (assetId: string) => string,
  newId: () => string = () => crypto.randomUUID()
): PlanPosition[] | null {
  const position = positions.find((candidate) => candidate.id === positionId);
  if (!position) return null;
  if (position.buyAssetId === newAssetId) return positions;
  const usedElsewhere = positions.some((candidate) => candidate.id !== positionId && candidate.memberAssetIds.includes(newAssetId));
  if (usedElsewhere) return null;
  const members = position.memberAssetIds.includes(newAssetId) ? position.memberAssetIds : [...position.memberAssetIds, newAssetId];
  const replaced: PlanPosition = {
    id: newId(),
    label: labelOf(newAssetId),
    targetPercentage: position.targetPercentage,
    memberAssetIds: orderGroupMembers({ memberAssetIds: members, buyAssetId: newAssetId }),
    buyAssetId: newAssetId,
  };
  return positions.map((candidate) => (candidate.id === positionId ? replaced : candidate));
}

/**
 * AL8/AL9: the name of an installment line. A revision can retire a position (a group formed, a buyer
 * replaced) after some of its lines were closed; those lines then name the instrument that bought, never the id.
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
 * AL10: the instruments of an open plan, for the optimizers' «to evaluate» set — also those at 0 shares
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
 * AL10: the instruments the Target step can still take: tradable, not a cash account, not already in
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
    .filter((asset) => asset.assetClass !== 'cash' && asset.type !== 'cash' && resolveAllocationRole(asset) === 'tradable' && (!taken.has(asset.id) || alsoAllow.has(asset.id)))
    .map((asset) => {
      const held = asset.quantity > 0;
      return { asset, held, neverBought: describeZeroQuantityChip(asset, tradedAssetIds) === NEVER_BOUGHT_CHIP };
    })
    .sort((a, b) => rank(a) - rank(b) || a.asset.name.localeCompare(b.asset.name, 'it'));

  function rank(entry: AddableAsset): number {
    return entry.neverBought ? 0 : entry.held ? 2 : 1;
  }
}

/** Classes of a trajectory point worth showing: with a weight or a target (|x| ≥ 0,05%), as the target step's table. */
export function liveClassEntries(point: ClassTrajectoryPoint): Array<[AssetClass, NonNullable<ClassTrajectoryPoint['byClass'][AssetClass]>]> {
  const entries: Array<[AssetClass, NonNullable<ClassTrajectoryPoint['byClass'][AssetClass]>]> = [];
  for (const [assetClass, entry] of Object.entries(point.byClass) as Array<[AssetClass, ClassTrajectoryPoint['byClass'][AssetClass]]>) {
    if (entry && (Math.abs(entry.currentPct) >= 0.05 || Math.abs(entry.targetPct) >= 0.05)) entries.push([assetClass, entry]);
  }
  return entries;
}
