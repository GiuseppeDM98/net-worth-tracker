/**
 * accumuloSummary — the numbers of Allocazione's «Accumulo» tab.
 *
 * Pure: the tab's verdict (`buildAccumuloVerdict`) and the one clause the Bilanciamento verdict
 * borrows from the active plan (`summarizePacMonth`) are read from the SAME open installment, so
 * the two tabs can never name different months or amounts. Words live in `accumulationNarrative.ts`.
 */
import type { Asset, AssetAllocationTarget, AssetClass } from '@/types/assets';
import type { AccumulationPlan, Installment, MonthKey, PlanDisposal } from '@/types/accumulationPlan';
import type { PageVerdictModel } from './narrative';
import type { LineUiState } from './accumulationPlanMatching';
import { ACCUMULO_SECTION_IDS, describeAccumuloVerdict, monthLabelLong, type AccumuloVerdictInput, type ClosedPlanReadingInput } from './accumulationNarrative';
import {
  buildDraftPreview,
  selectClassStripRows,
  type ClassTrajectoryPoint,
  computeTotalPurchases,
  computeUsableLiquidity,
  disposalMonthIndex,
  resolvePositionStates,
  isPlanBuyable,
  isPlanSourceAccount,
  resolveTargetPct,
  toMonthKey,
  weightsToSeedPositions,
  type AllocationCompare,
  type PlanDeps,
} from './accumulationPlanUtils';
import { toModelWeights } from './modelPortfolio';
import type { ModelPortfolioWeight } from '@/types/modelPortfolio';
import { ASSET_CLASS_LABELS, type RebalanceBand } from './allocationUtils';
import type { StripFigure } from './verdictStrip';
import { VERDICT_REST_SECTION } from './mobileSections';
import { roundToCents } from './cents';
import { getItalyMonthYear } from './dateHelpers';
import type { SectionSpec } from '@/lib/hooks/useMobileSections';

// The month helpers the page's first load reads live in accumuloMonth.ts, without this module's imports.
export { findOpenInstallment, isPlanDone, summarizePacMonth } from './accumuloMonth';
import { countPlanInstalments, findFirstBuyingInstallment, findOpenInstallment, isPlanDone } from './accumuloMonth';
import { addMonths } from './planMonths';

export interface AccumuloVerdictContext {
  plan: AccumulationPlan | undefined;
  /** `monthIndexOf(plan, today)`. */
  currentIndex: number;
  /** Σ value of the source cash accounts (none state). */
  sourceCashEur: number;
  /** The reserve on the accounts (`resolveAccountReserveEur`): not spendable (none state). */
  reserveEur: number;
  /** The cash class held outside the accounts (a money-market fund), part of the quota. */
  otherCashEur?: number;
  /** A saved model portfolio exists; false until then. */
  hasModel: boolean;
  /** The ledger matching's state per `${index}:${positionId}`. */
  lineStates: Record<string, LineUiState>;
  /** Draft: Σ of the whole plan's purchases (`computeTotalPurchases`). */
  draftTotalEur: number;
  /** Draft: the first months that refill the reserve and buy nothing (`UsableLiquidity.refillMonths`). */
  draftRefillMonths?: number;
  /** Draft: the first instalment when a later sale makes the instalments differ (`summarizeDraftTotal`); null = even. */
  draftFirstEur?: number | null;
  /** `describeBandReentry` for the open month, already worded. */
  reentry: string;
  /** The day the tab reads (its Italian year decides whether a start month names its year). */
  today: Date;
}

/**
 * the inputs of the tab's verdict. Split from the words (since 2026-10-18) so the phone's strip
 * reads the SAME figures the verdict prints (`selectAccumuloStrip`) and never recomputes them.
 */
export function resolveAccumuloVerdictInput(context: AccumuloVerdictContext): AccumuloVerdictInput {
  const { plan, currentIndex } = context;
  if (!plan) return { state: 'none', sourceCashEur: context.sourceCashEur, reserveEur: context.reserveEur, otherCashEur: context.otherCashEur ?? 0, hasModel: context.hasModel };

  if (plan.status === 'draft') {
    return {
      state: 'draft',
      // Only the months that buy: the first ones refill the reserve (2026-11-17).
      months: plan.months - Math.min(context.draftRefillMonths ?? 0, plan.months),
      monthlyEur: plan.months - (context.draftRefillMonths ?? 0) > 0 ? context.draftTotalEur / (plan.months - (context.draftRefillMonths ?? 0)) : 0,
      startMonth: addMonths(plan.startMonth, Math.min(context.draftRefillMonths ?? 0, plan.months)),
      firstEur: context.draftFirstEur ?? null,
    };
  }

  const executedAmount = (line: { status: string; executedAmountEur?: number; plannedAmountEur: number }) =>
    line.status === 'executed' ? (line.executedAmountEur ?? line.plannedAmountEur) : 0;
  const investedEur = plan.installments.reduce((sum, i) => sum + i.lines.reduce((s, line) => s + executedAmount(line), 0), 0);
  const planTotalEur = plan.installments.reduce((sum, i) => sum + i.lines.reduce((s, line) => s + line.plannedAmountEur, 0), 0);

  if (isPlanDone(plan, currentIndex)) return { state: 'done', investedEur, totalEur: planTotalEur };

  // Active before its first month: the first instalment, nothing «questo mese» (2026-11-12).
  if (currentIndex < 1) {
    const first = findFirstBuyingInstallment(plan) ?? plan.installments.find((i) => i.index === 1);
    const lines = (first?.lines ?? []).filter((l) => l.plannedQuantity > 0);
    return { state: 'scheduled', startMonth: plan.startMonth, firstMonth: first?.month ?? plan.startMonth, months: plan.months, lineCount: lines.length,
      firstInstalmentEur: roundToCents(lines.reduce((sum, l) => sum + l.plannedAmountEur, 0)),
      todayYear: getItalyMonthYear(context.today).year };
  }

  const installment = findOpenInstallment(plan, currentIndex);
  if (!installment) return { state: 'none', sourceCashEur: context.sourceCashEur, reserveEur: context.reserveEur, otherCashEur: context.otherCashEur ?? 0, hasModel: context.hasModel };

  // A month with no line (the reserve refilling, or a price above the month's share): nothing to buy,
  // the next instalment named (2026-11-17). Late lines keep the active reading.
  const hasLate = plan.installments.some((i) => i.index < installment.index && i.lines.some((line) => line.status === 'planned'));
  if (installment.lines.length === 0 && !hasLate) {
    const next = findFirstBuyingInstallment(plan, installment.index + 1);
    return {
      state: 'quiet',
      monthKey: installment.month,
      nextMonth: next?.month,
      installmentIndex: installment.index,
      months: plan.months,
      refilling: (plan.baseline?.sourceCashEur ?? Infinity) < plan.liquidity.reserveEur - 0.005,
    };
  }

  const lines = installment.lines.filter((line) => line.plannedQuantity > 0 || line.status !== 'planned');
  const toConfirmCount = lines.filter((line) => context.lineStates[`${installment.index}:${line.positionId}`] === 'toConfirm').length;
  const lateCount = plan.installments
    .filter((i) => i.index < currentIndex)
    .reduce((sum, i) => sum + i.lines.filter((line) => line.status === 'planned').length, 0);
  return {
    state: 'active',
    monthKey: installment.month,
    installmentTotalEur: lines.reduce((sum, line) => sum + (line.status === 'executed' ? (line.executedAmountEur ?? line.plannedAmountEur) : line.plannedAmountEur), 0),
    lineCount: lines.length,
    executedCount: lines.filter((line) => line.status === 'executed').length,
    toConfirmCount,
    lateCount,
    installmentClosed: installment.lines.every((line) => line.status !== 'planned'),
    installmentIndex: installment.index,
    months: plan.months,
    investedEur,
    planTotalEur,
    reentry: context.reentry,
  };
}

/** the five states of the tab's verdict. */
export function buildAccumuloVerdict(context: AccumuloVerdictContext): PageVerdictModel {
  return describeAccumuloVerdict(resolveAccumuloVerdictInput(context));
}

// ─── The phone composition (2026-10-18) ───────────────────────────────────────

// The ids are defined next to the words that name them (`ACCUMULO_CLOSED_ASIDES`), so the narrative does not
// import this module (it imports the narrative).
export { ACCUMULO_SECTION_IDS };

export interface ResolveAccumuloSectionsInput {
  /** Classi del piano is on the page: an active plan, not finished, with a trajectory to show. */
  hasClasses: boolean;
  /** Piani conclusi is on the page: at least one plan closed or interrupted. */
  hasClosedPlans: boolean;
  /** The model portfolio's read failed: the row opens by itself (`failed`). */
  modelFailed: boolean;
}

/**
 * The rows below `desktop:`, in the DOM's order: Portafoglio modello, Classi del piano, Criteri
 * del modello, Piani conclusi — the subset on the page. Portafoglio modello and Criteri are always there
 * (an empty model is a row with its own words).
 */
export function resolveAccumuloSections(input: ResolveAccumuloSectionsInput): readonly SectionSpec[] {
  return [
    { id: ACCUMULO_SECTION_IDS.modello, eyebrow: 'Portafoglio modello', failed: input.modelFailed },
    ...(input.hasClasses ? [{ id: ACCUMULO_SECTION_IDS.classi, eyebrow: 'Classi del piano' }] : []),
    { id: ACCUMULO_SECTION_IDS.criteri, eyebrow: 'Criteri del modello' },
    ...(input.hasClosedPlans ? [{ id: ACCUMULO_SECTION_IDS.conclusi, eyebrow: 'Piani conclusi' }] : []),
  ];
}

export interface AccumuloStripInput {
  /** `resolveAccumuloVerdictInput(...)`: the strip reads the figures the verdict prints. */
  verdictInput: AccumuloVerdictInput;
  /** `projectClassTrajectory(...)`, empty without one. */
  trajectory: ClassTrajectoryPoint[];
  /** The plan's open month, clamped like the chart's cursor. */
  currentIndex: number;
}

/**
 * The cells of a phone's first screen, only with an active plan on its open month — a draft, a
 * finished plan and the empty state have a headline with one figure and no strip:
 *   - «Rata di {mese}» — the headline's amount, opening Questo mese (THE tile);
 *   - «Investito» — the first sentence's «investiti finora», opening Classi del piano; without a
 *     trajectory it has nowhere to open (Questo mese is the first cell's), so it is not drawn;
 *   - «{Classe} sopra|sotto» — the class farthest out of its band at the cursor's month, in points
 *     (`null` «tutte in soglia» with every class inside), opening the verdict's «Il perché», which
 *     says when each class is back in band; the chart's cursor starts on the same month.
 * Nothing is lifted: Questo mese prints none of the three as a block of its own.
 */
export function selectAccumuloStrip({ verdictInput, trajectory, currentIndex }: AccumuloStripInput): StripFigure[] {
  if (verdictInput.state !== 'active') return [];
  const rata: StripFigure = {
    label: `Rata di ${monthLabelLong(verdictInput.monthKey, false)}`,
    value: verdictInput.installmentTotalEur,
    format: 'currency',
    opens: ACCUMULO_SECTION_IDS.mese,
  };
  if (trajectory.length === 0) return [rata];

  const outOfBand = selectClassStripRows(trajectory, currentIndex).filter((row) => row.outOfBandNow);
  const farthest = outOfBand.reduce<(typeof outOfBand)[number] | null>(
    (best, row) => (best === null || Math.abs(row.currentDriftPp) > Math.abs(best.currentDriftPp) ? row : best),
    null,
  );
  return [
    rata,
    { label: 'Investito', value: verdictInput.investedEur, format: 'currency', opens: ACCUMULO_SECTION_IDS.classi },
    farthest
      ? {
          label: `${ASSET_CLASS_LABELS[farthest.assetClass] ?? farthest.assetClass} ${farthest.currentDriftPp > 0 ? 'sopra' : 'sotto'}`,
          value: Math.abs(farthest.currentDriftPp),
          format: 'pp',
          tone: 'neutral',
          // Two cells never open the same section (`validateStrip`): «Investito» has the chart's row,
          // and this one the verdict's «Il perché», where the sentence says when the class is back in band.
          opens: VERDICT_REST_SECTION,
        }
      : { label: 'Scarto maggiore', value: null, format: 'pp', tone: 'neutral', opens: VERDICT_REST_SECTION, reason: 'tutte in soglia' },
  ];
}

// ─── The empty state's preview on the reader's own numbers ──────────────

/** The reserve the preview assumes: what the editor proposes first, never typed by the reader here. */
export const PREVIEW_MONTHS = 12;

export interface AccumuloPreview {
  /** The months that buy (the preview's twelve minus the ones that refill the reserve). */
  months: number;
  /** The first months whose inflows only refill the reserve (2026-11-17). */
  refillMonths: number;
  /** The cash class outside the accounts: with `reserveEur`, the allocation's quota. */
  otherCashEur: number;
  reserveEur: number;
  /** Σ of the purchases over the plan divided by the months — what a month would move. */
  monthlyEur: number;
  /** The monthly inflow the preview assumed (the editor's suggestion, 0 when none). */
  inflowEur: number;
  /** Where the classes would stand today and at the end of the plan, on today's prices. */
  classes: { assetClass: AssetClass; currentPct: number; targetPct: number; finalPct: number }[];
  /** The saved model portfolio when there is one, else today's holdings. */
  weightsFrom: 'today' | 'model';
  /** The cash in the liquidity accounts the preview spends from. */
  cashEur: number;
}

/**
 * Today's weights as a plan can use them: only what a plan may buy (`isPlanBuyable`: no account, no
 * loan, no property, nothing frozen or excluded from the allocation), rescaled to Σ = 100 in hundredths of a point with the remainder
 * on the largest.
 */
function tradableWeights(proposed: Array<{ assetId: string; pct: number }>, assetsById: Map<string, Asset>): Array<{ assetId: string; pct: number }> {
  const assets = [...assetsById.values()];
  const kept = proposed.filter((entry) => {
    const asset = assetsById.get(entry.assetId);
    return !!asset && isPlanBuyable(asset, assets);
  });
  const total = kept.reduce((sum, entry) => sum + entry.pct, 0);
  if (total <= 0) return [];
  const cents = kept.map((entry) => Math.round((entry.pct / total) * 10000));
  const remainder = 10000 - cents.reduce((sum, c) => sum + c, 0);
  if (remainder !== 0) {
    let largest = 0;
    for (let i = 1; i < cents.length; i++) if (cents[i] > cents[largest]) largest = i;
    cents[largest] += remainder;
  }
  return kept.map((entry, i) => ({ assetId: entry.assetId, pct: cents[i] / 100 }));
}

/**
 * «Senza piano»: what a plan would do with the cash the reader has, at the default reserve, 12
 * months, no monthly inflow and today's weights over the tradable instruments. `null` when nothing
 * would be left to spend or no instrument can be bought — the tile then says why instead of a figure.
 */
export function buildAccumuloPreview(input: {
  allAssets: Asset[];
  targets: AssetAllocationTarget;
  band: RebalanceBand;
  compare: AllocationCompare;
  deps: PlanDeps;
  today: Date;
  /** The saved model's weights: the preview starts from them instead of today's holdings. */
  model?: ModelPortfolioWeight[] | null;
  /** The entry the editor suggests (the median of the monthly savings); 0 or absent = no inflow. */
  monthlyInflowEur?: number;
  /** The reserve on the accounts (`resolveAccountReserveEur`), the one the editor starts from. */
  reserveEur: number;
  /** The cash class outside the accounts, printed with the quota. */
  otherCashEur?: number;
}): AccumuloPreview | null {
  const { allAssets, targets, band, compare, deps, today, model } = input;
  const inflowEur = Math.max(0, input.monthlyInflowEur ?? 0);
  const cashIds = allAssets.filter(isPlanSourceAccount).map((asset) => asset.id);
  const cashEur = allAssets.filter((asset) => cashIds.includes(asset.id)).reduce((sum, asset) => sum + deps.valueOf(asset), 0);
  const reserveEur = Math.max(0, input.reserveEur);
  // Cash within the quota still leaves the monthly inflows to invest (collaudo, 2026-11-17).
  if (cashEur <= reserveEur && inflowEur <= 0) return null;

  const assetsById = new Map(allAssets.map((asset) => [asset.id, asset]));
  // The saved model's weights when there is one (they already left out what a plan cannot buy), else today's.
  const useModel = !!model && model.length > 0;
  const weights = useModel
    ? toModelWeights(
        model.map((weight) => ({ assetId: weight.assetId, pct: weight.targetPercentage })).filter((entry) => entry.pct > 0),
        assetsById,
      ).weights
    : tradableWeights(
        allAssets
          .filter((asset) => asset.assetClass !== 'cash' && asset.assetClass !== 'realestate')
          .map((asset) => ({ assetId: asset.id, pct: deps.valueOf(asset) }))
          .filter((entry) => entry.pct > 0),
        assetsById,
      );
  if (weights.length === 0) return null;

  let n = 0;
  const positions = weightsToSeedPositions(
    weights.map((weight) => ({ key: weight.assetId, label: assetsById.get(weight.assetId)?.name ?? weight.assetId, proposedPct: weight.pct })),
    () => `preview-${n++}`,
  );
  const preview = buildDraftPreview({
    draft: {
      name: 'Anteprima',
      startMonth: toMonthKey(today),
      months: PREVIEW_MONTHS,
      liquidity: { sourceCashAssetIds: cashIds, reserveEur, monthlyInflowEur: inflowEur },
      positions,
      disposals: [],
    },
    allAssets,
    targets,
    band,
    compare,
    deps,
  });
  const totalEur = Object.values(preview.totals).reduce((sum, value) => sum + value, 0);
  if (totalEur <= 0) return null;
  // The first months only refill the reserve (2026-11-17): the rate is over the months that buy.
  const refillMonths = preview.liquidity.refillMonths;
  const buyingMonths = PREVIEW_MONTHS - refillMonths;
  if (buyingMonths <= 0) return null;

  const first = preview.trajectory[0];
  const last = preview.trajectory[preview.trajectory.length - 1];
  const classes = Object.entries(first?.byClass ?? {}).flatMap(([assetClass, entry]) => {
    const final = last?.byClass[assetClass as AssetClass];
    if (!entry || !final) return [];
    // A class with neither weight nor target is not part of the story (the tile's strip drops it too).
    if (Math.abs(entry.currentPct) < 0.05 && Math.abs(entry.targetPct) < 0.05 && Math.abs(final.currentPct) < 0.05) return [];
    return [{ assetClass: assetClass as AssetClass, currentPct: entry.currentPct, targetPct: entry.targetPct, finalPct: final.currentPct }];
  });
  return {
    months: buyingMonths,
    refillMonths,
    otherCashEur: Math.max(0, input.otherCashEur ?? 0),
    reserveEur,
    monthlyEur: totalEur / buyingMonths,
    inflowEur,
    classes,
    weightsFrom: useModel ? 'model' : 'today',
    cashEur,
  };
}

/**
 * Σ of the purchases a draft would make over its whole length, and the first months that only refill
 * the reserve (the verdict's «10 rate da X € da marzo»), and the first instalment's euros when a later sale
 * makes the instalments differ (`firstEur`, null when they are even).
 */
export function summarizeDraftTotal(
  plan: AccumulationPlan,
  allAssets: Asset[],
  deps: PlanDeps
): { totalEur: number; refillMonths: number; firstEur: number | null } {
  const assetsById = new Map(allAssets.map((asset) => [asset.id, asset]));
  const liquidity = computeUsableLiquidity(plan.liquidity, assetsById, plan.disposals, plan.months, deps);
  const totals = computeTotalPurchases(resolvePositionStates(plan.positions, assetsById, deps, plan.disposals), liquidity.L);
  return {
    totalEur: Object.values(totals).reduce((sum, value) => sum + value, 0),
    refillMonths: liquidity.refillMonths,
    firstEur: liquidity.monthShares ? liquidity.L * liquidity.monthShares[liquidity.refillMonths] : null,
  };
}

/**
 * The trajectory's cursor: where a key sends the month cursor (a position in the trajectory, 0..length−1),
 * stopping at both ends. `null` for a key the chart does not answer to.
 */
export function stepTrajectoryCursor(position: number, key: string, length: number): number | null {
  const last = Math.max(0, length - 1);
  switch (key) {
    case 'ArrowRight':
      return Math.min(position + 1, last);
    case 'ArrowLeft':
      return Math.max(position - 1, 0);
    case 'Home':
      return 0;
    case 'End':
      return last;
    default:
      return null;
  }
}

/**
 * one finished plan (`completed` or `cancelled`) as the Piani conclusi row reads it. «Invested» is
 * Σ `executedAmountEur` of the lines; «planned» is the `L` the plan had at activation
 * (`max(0, baseline.sourceCashEur − reserve) + Σ sale proceeds + E × N`). The final drift is the
 * largest class gap |current − target| at the LAST saved measurement, against today's targets.
 */
export function summarizeClosedPlan(plan: AccumulationPlan, targets: AssetAllocationTarget | null): ClosedPlanReadingInput {
  const installments = plan.installments;
  const { closed: closedCount, total: instalmentCount } = countPlanInstalments(plan);
  const investedEur = installments.reduce(
    (sum, i) => sum + i.lines.reduce((lineSum, line) => lineSum + (line.executedAmountEur ?? 0), 0),
    0
  );
  // The engine's L at activation: the sales and the inflows refill the reserve first (2026-11-17).
  const baselineCashEur = plan.baseline?.sourceCashEur ?? 0;
  const plannedEur =
    Math.max(0, baselineCashEur - plan.liquidity.reserveEur) +
    Math.max(
      0,
      plan.disposals.reduce((sum, d) => sum + d.estimatedProceedsEur, 0) +
        plan.liquidity.monthlyInflowEur * plan.months -
        Math.max(0, plan.liquidity.reserveEur - baselineCashEur),
    );

  const lastMeasured = [...installments].reverse().find((i) => i.measurement);
  let finalDrift: ClosedPlanReadingInput['finalDrift'] = null;
  const measurement = lastMeasured?.measurement;
  if (measurement && targets && measurement.marketBaseEur > 0) {
    for (const [assetClass, notional] of Object.entries(measurement.classNotionalEur)) {
      const currentPct = ((notional ?? 0) / measurement.marketBaseEur) * 100;
      const driftPp = currentPct - resolveTargetPct(assetClass as AssetClass, targets, measurement.marketBaseEur);
      if (!finalDrift || Math.abs(driftPp) > Math.abs(finalDrift.driftPp)) {
        finalDrift = { label: ASSET_CLASS_LABELS[assetClass as AssetClass] ?? assetClass, driftPp };
      }
    }
  }

  return {
    name: plan.name,
    startMonth: plan.startMonth,
    endMonth: installments[installments.length - 1]?.month ?? plan.startMonth,
    closedCount,
    totalMonths: instalmentCount,
    interrupted: plan.status === 'cancelled',
    investedEur,
    plannedEur,
    finalDrift,
  };
}

/** A plan stopped this recently can be reactivated. */
export const PLAN_REACTIVATION_DAYS = 30;

/**
 * «Riattiva» is offered on a plan the owner INTERRUPTED (`cancelled`, never a `completed` one) less
 * than 30 days ago, and only while no other plan is open (one `draft` or `active` per account).
 */
export function canReactivatePlan(plan: AccumulationPlan, plans: AccumulationPlan[], now: Date): boolean {
  if (plan.status !== 'cancelled' || !plan.closedAt) return false;
  if (plans.some((other) => other.status === 'draft' || other.status === 'active')) return false;
  const ageDays = (now.getTime() - plan.closedAt.getTime()) / 86_400_000;
  return ageDays >= 0 && ageDays < PLAN_REACTIVATION_DAYS;
}

/** The finished plans, newest closure first. */
export function selectClosedPlans(plans: AccumulationPlan[] | undefined): AccumulationPlan[] {
  return (plans ?? [])
    .filter((plan) => plan.status === 'completed' || plan.status === 'cancelled')
    .sort((a, b) => (b.closedAt?.getTime() ?? 0) - (a.closedAt?.getTime() ?? 0));
}

/**
 * One entry per month, after the first scheduled, in which an open sale leaves the instalment larger than the
 * month before (`describeSaleStep`'s sentences). `installments[0]` is plan month `firstIndex`; a sale the refill
 * took whole changes no instalment, so it gives no entry.
 */
export function listSaleSteps(input: {
  installments: Installment[];
  disposals: PlanDisposal[];
  firstIndex: number;
  nameOf: (assetId: string) => string;
}): Array<{ month: MonthKey; instalmentEur: number; names: string[] }> {
  const { installments, firstIndex, nameOf } = input;
  const open = input.disposals.filter((d) => d.status !== 'executed' && d.status !== 'skipped');
  const months = [...new Set(open.map(disposalMonthIndex).filter((index) => index > firstIndex))].sort((a, b) => a - b);
  const euros = (installment: Installment | undefined) =>
    roundToCents((installment?.lines ?? []).reduce((sum, line) => sum + line.plannedAmountEur, 0));
  const steps: Array<{ month: MonthKey; instalmentEur: number; names: string[] }> = [];
  for (const index of months) {
    const installment = installments[index - firstIndex];
    if (!installment) continue;
    const instalmentEur = euros(installment);
    if (instalmentEur - euros(installments[index - firstIndex - 1]) <= 0.005) continue;
    const names = open.filter((d) => disposalMonthIndex(d) === index).map((d) => nameOf(d.assetId));
    steps.push({ month: installment.month, instalmentEur, names });
  }
  return steps;
}


/**
 * The months that buy, after the ones that only refill the reserve (owner, 2026-11-19): how many, the first and the
 * average — step 3's reading and the side panel say the same figures. `null` when no month buys.
 */
export function summarizeBuyingInstalments(
  installments: Installment[],
  refillMonths: number,
): { count: number; firstEur: number; firstMonth: MonthKey; averageEur: number } | null {
  const euros = (installment: Installment) => installment.lines.reduce((sum, line) => sum + line.plannedAmountEur, 0);
  const buying = installments.slice(refillMonths);
  const first = buying.find((installment) => installment.lines.length > 0);
  if (!first) return null;
  return {
    count: buying.length,
    firstEur: euros(first),
    firstMonth: first.month,
    averageEur: buying.reduce((sum, installment) => sum + euros(installment), 0) / buying.length,
  };
}

/**
 * The months of the open sales that refill the reserve with the inflows (owner, 2026-11-19): after the first scheduled
 * month (`firstIndex`, whose sales count at once) and by the first month that buys (`firstIndex + refillMonths`).
 */
export function listRefillSaleMonths(input: {
  disposals: PlanDisposal[];
  startMonth: MonthKey;
  firstIndex: number;
  refillMonths: number;
}): MonthKey[] {
  if (input.refillMonths <= 0) return [];
  const lastIndex = input.firstIndex + input.refillMonths;
  return input.disposals
    .filter((d) => d.status !== 'executed' && d.status !== 'skipped')
    .map(disposalMonthIndex)
    .filter((index) => index > input.firstIndex && index <= lastIndex)
    .sort((a, b) => a - b)
    .map((index) => addMonths(input.startMonth, index - 1));
}
