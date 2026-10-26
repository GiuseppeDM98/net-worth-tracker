/**
 * accumuloSummary — the numbers of Allocazione's «Accumulo» tab (doc/pac-ottimizzatore § RV2–RV3).
 *
 * Pure: the tab's verdict (`buildAccumuloVerdict`) and the one clause the Bilanciamento verdict
 * borrows from the active plan (`summarizePacMonth`) are read from the SAME open installment, so
 * the two tabs can never name different months or amounts. Words live in `accumulationNarrative.ts`.
 */
import type { Asset, AssetAllocationTarget, AssetClass } from '@/types/assets';
import type { AccumulationPlan, Installment } from '@/types/accumulationPlan';
import type { PageVerdictModel } from './narrative';
import type { LineUiState } from './accumulationPlanMatching';
import type { PacVerdictInput } from './allocazioneNarrative';
import { ACCUMULO_SECTION_IDS, describeAccumuloVerdict, monthLabelLong, type AccumuloVerdictInput, type ClosedPlanReadingInput } from './accumulationNarrative';
import {
  buildDraftPreview,
  selectClassStripRows,
  type ClassTrajectoryPoint,
  computeTotalPurchases,
  computeUsableLiquidity,
  resolvePositionStates,
  resolveTargetPct,
  toMonthKey,
  weightsToSeedPositions,
  type AllocationCompare,
  type PlanDeps,
} from './accumulationPlanUtils';
import { ASSET_CLASS_LABELS, resolveAllocationRole, type RebalanceBand } from './allocationUtils';
import type { StripFigure } from './verdictStrip';
import { VERDICT_REST_SECTION } from './mobileSections';
import type { SectionSpec } from '@/lib/hooks/useMobileSections';

/** Every installment fully closed, `late` lines included — the plan has nothing left to do. */
export function isPlanDone(plan: AccumulationPlan, currentIndex: number): boolean {
  if (currentIndex <= plan.months) return false;
  const linesClosed = plan.installments.every((installment) => installment.lines.every((line) => line.status !== 'planned'));
  const disposalsClosed = plan.disposals.every((disposal) => disposal.status !== 'planned');
  return linesClosed && disposalsClosed;
}

/** The installment the tab is about: the one of `currentIndex`, clamped into the plan's range. */
export function findOpenInstallment(plan: AccumulationPlan, currentIndex: number): Installment | undefined {
  const clamped = Math.min(Math.max(currentIndex, 1), plan.months);
  return plan.installments.find((installment) => installment.index === clamped);
}

/**
 * RV2 — the open installment as the Bilanciamento verdict says it: Σ `plannedAmountEur` of the lines
 * not skipped, the positions they buy, and whether none is left to do. `null` unless the plan is
 * active (a draft proposes nothing, D1) and not finished.
 */
export function summarizePacMonth(plan: AccumulationPlan | undefined, currentIndex: number): PacVerdictInput | null {
  if (!plan || plan.status !== 'active') return null;
  if (isPlanDone(plan, currentIndex)) return null;
  const installment = findOpenInstallment(plan, currentIndex);
  if (!installment) return null;
  const lines = installment.lines.filter((line) => line.status !== 'skipped' && (line.plannedQuantity > 0 || line.status !== 'planned'));
  return {
    monthTotalEur: lines.reduce((sum, line) => sum + (line.status === 'executed' ? (line.executedAmountEur ?? line.plannedAmountEur) : line.plannedAmountEur), 0),
    instrumentCount: new Set(lines.map((line) => line.positionId)).size,
    monthLabel: monthLabelLong(installment.month, false),
    allClosed: installment.lines.every((line) => line.status !== 'planned'),
  };
}

export interface AccumuloVerdictContext {
  plan: AccumulationPlan | undefined;
  /** `monthIndexOf(plan, today)`. */
  currentIndex: number;
  /** Σ value of the source cash accounts (none state). */
  sourceCashEur: number;
  /** The ledger matching's state per `${index}:${positionId}`. */
  lineStates: Record<string, LineUiState>;
  /** Draft: Σ of the whole plan's purchases (`computeTotalPurchases`). */
  draftTotalEur: number;
  /** `describeBandReentry` for the open month, already worded. */
  reentry: string;
}

/**
 * RV3 — the inputs of the tab's verdict. Split from the words (since 2026-10-18) so the phone's strip
 * reads the SAME figures the verdict prints (`selectAccumuloStrip`) and never recomputes them.
 */
export function resolveAccumuloVerdictInput(context: AccumuloVerdictContext): AccumuloVerdictInput {
  const { plan, currentIndex } = context;
  if (!plan) return { state: 'none', sourceCashEur: context.sourceCashEur };

  if (plan.status === 'draft') {
    return {
      state: 'draft',
      months: plan.months,
      monthlyEur: plan.months > 0 ? context.draftTotalEur / plan.months : 0,
      startMonth: plan.startMonth,
    };
  }

  const executedAmount = (line: { status: string; executedAmountEur?: number; plannedAmountEur: number }) =>
    line.status === 'executed' ? (line.executedAmountEur ?? line.plannedAmountEur) : 0;
  const investedEur = plan.installments.reduce((sum, i) => sum + i.lines.reduce((s, line) => s + executedAmount(line), 0), 0);
  const planTotalEur = plan.installments.reduce((sum, i) => sum + i.lines.reduce((s, line) => s + line.plannedAmountEur, 0), 0);

  if (isPlanDone(plan, currentIndex)) return { state: 'done', investedEur, totalEur: planTotalEur };

  const installment = findOpenInstallment(plan, currentIndex);
  if (!installment) return { state: 'none', sourceCashEur: context.sourceCashEur };

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

/** RV3 — the five states of the tab's verdict. */
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
}

/**
 * The rows below `desktop:`, in the DOM's order: Classi del piano, Piani conclusi — the subset on the
 * page (none at all with no trajectory and no closed plan: «Il resto della pagina» is then not drawn).
 */
export function resolveAccumuloSections(input: ResolveAccumuloSectionsInput): readonly SectionSpec[] {
  return [
    ...(input.hasClasses ? [{ id: ACCUMULO_SECTION_IDS.classi, eyebrow: 'Classi del piano' }] : []),
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
 * The cells of a phone's first screen (D-CU16), only with an active plan on its open month — a draft, a
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

// ─── RV4: the empty state's preview on the reader's own numbers ──────────────

/** The reserve the preview assumes: what the editor proposes first, never typed by the reader here. */
export const PREVIEW_RESERVE_EUR = 10000;
export const PREVIEW_MONTHS = 12;

export interface AccumuloPreview {
  months: number;
  reserveEur: number;
  /** Σ of the purchases over the plan divided by the months — what a month would move. */
  monthlyEur: number;
  /** The monthly inflow the preview assumed (RP7's suggestion, 0 when none). */
  inflowEur: number;
  /** Where the classes would stand today and at the end of the plan, on today's prices. */
  classes: { assetClass: AssetClass; currentPct: number; targetPct: number; finalPct: number }[];
  /** The cash in the liquidity accounts the preview spends from. */
  cashEur: number;
}

/**
 * Today's weights as a plan can use them: only tradable instruments (no cash account, nothing frozen
 * or excluded from the allocation), rescaled to Σ = 100 in hundredths of a point with the remainder
 * on the largest.
 */
function tradableWeights(proposed: Array<{ assetId: string; pct: number }>, assetsById: Map<string, Asset>): Array<{ assetId: string; pct: number }> {
  const kept = proposed.filter((entry) => {
    const asset = assetsById.get(entry.assetId);
    if (!asset || asset.type === 'cash') return false;
    const role = resolveAllocationRole(asset);
    return role !== 'frozen' && role !== 'excluded';
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
  /** RV4: the entry RP7 suggests; 0 or absent = no inflow. */
  monthlyInflowEur?: number;
}): AccumuloPreview | null {
  const { allAssets, targets, band, compare, deps, today } = input;
  const inflowEur = Math.max(0, input.monthlyInflowEur ?? 0);
  const cashIds = allAssets.filter((asset) => asset.assetClass === 'cash' && asset.type === 'cash').map((asset) => asset.id);
  const cashEur = allAssets.filter((asset) => cashIds.includes(asset.id)).reduce((sum, asset) => sum + deps.valueOf(asset), 0);
  if (cashEur <= PREVIEW_RESERVE_EUR) return null;

  const assetsById = new Map(allAssets.map((asset) => [asset.id, asset]));
  const weights = tradableWeights(
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
      liquidity: { sourceCashAssetIds: cashIds, reserveEur: PREVIEW_RESERVE_EUR, monthlyInflowEur: inflowEur },
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

  const first = preview.trajectory[0];
  const last = preview.trajectory[preview.trajectory.length - 1];
  const classes = Object.entries(first?.byClass ?? {}).flatMap(([assetClass, entry]) => {
    const final = last?.byClass[assetClass as AssetClass];
    if (!entry || !final) return [];
    // A class with neither weight nor target is not part of the story (the tile's strip drops it too).
    if (Math.abs(entry.currentPct) < 0.05 && Math.abs(entry.targetPct) < 0.05 && Math.abs(final.currentPct) < 0.05) return [];
    return [{ assetClass: assetClass as AssetClass, currentPct: entry.currentPct, targetPct: entry.targetPct, finalPct: final.currentPct }];
  });
  return { months: PREVIEW_MONTHS, reserveEur: PREVIEW_RESERVE_EUR, monthlyEur: totalEur / PREVIEW_MONTHS, inflowEur, classes, cashEur };
}

/** Σ of the purchases a draft would make over its whole length (the verdict's «12 rate da X €»). */
export function summarizeDraftTotal(plan: AccumulationPlan, allAssets: Asset[], deps: PlanDeps): number {
  const assetsById = new Map(allAssets.map((asset) => [asset.id, asset]));
  const liquidity = computeUsableLiquidity(plan.liquidity, assetsById, plan.disposals, plan.months, deps);
  const totals = computeTotalPurchases(resolvePositionStates(plan.positions, assetsById, deps, plan.disposals), liquidity.L);
  return Object.values(totals).reduce((sum, value) => sum + value, 0);
}

/**
 * RV5's cursor: where a key sends the month cursor (a position in the trajectory, 0..length−1),
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
 * RP6: one finished plan (`completed` or `cancelled`) as the Piani conclusi row reads it. «Invested» is
 * Σ `executedAmountEur` of the lines; «planned» is the `L` the plan had at activation
 * (`max(0, baseline.sourceCashEur − reserve) + Σ sale proceeds + E × N`). The final drift is the
 * largest class gap |current − target| at the LAST saved measurement, against today's targets.
 */
export function summarizeClosedPlan(plan: AccumulationPlan, targets: AssetAllocationTarget | null): ClosedPlanReadingInput {
  const installments = plan.installments;
  const closedCount = installments.filter((i) => i.lines.length > 0 && i.lines.every((line) => line.status !== 'planned')).length;
  const investedEur = installments.reduce(
    (sum, i) => sum + i.lines.reduce((lineSum, line) => lineSum + (line.executedAmountEur ?? 0), 0),
    0
  );
  const plannedEur =
    Math.max(0, (plan.baseline?.sourceCashEur ?? 0) - plan.liquidity.reserveEur) +
    plan.disposals.reduce((sum, d) => sum + d.estimatedProceedsEur, 0) +
    plan.liquidity.monthlyInflowEur * plan.months;

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
    totalMonths: plan.months,
    interrupted: plan.status === 'cancelled',
    investedEur,
    plannedEur,
    finalDrift,
  };
}

/** D-AL2: a plan stopped this recently can be reactivated (AL12). */
export const PLAN_REACTIVATION_DAYS = 30;

/**
 * AL12: «Riattiva» is offered on a plan the owner INTERRUPTED (`cancelled`, never a `completed` one) less
 * than 30 days ago, and only while no other plan is open (D12: one `draft` or `active` per account).
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
