/**
 * accumulationPlanDoc — a plan document as the app reads it, and the lock that keeps one plan open.
 *
 * No `db`, no write API: the Allocazione page's first load reads the plans through this module for
 * the Piano's note (2026-11-12), so it must never pull the plan's service, engine or words. The
 * converters turn Firestore's Timestamps into Dates at the boundary, like every other reader here.
 *
 * THE LOCK: `accumulationPlanLocks/{ownerUid}` `{ userId, openPlanId, updatedAt }`, written in the
 * same transaction as the plan. A client transaction cannot run a query, so «at most one plan in
 * draft or active per account» is decided by reading the lock and the plan it names.
 */
import type {
  AccumulationPlan,
  AccumulationPlanStatus,
  ClassMeasurement,
  Installment,
  InstallmentLine,
  OptimizerSnapshot,
  PlanBaseline,
  PlanDisposal,
  PlanLiquidity,
  PlanPosition,
  PlanRevision,
} from '@/types/accumulationPlan';
import type { AssetClass } from '@/types/assets';
import { toDate } from './dateHelpers';

export const ACCUMULATION_PLANS_COLLECTION = 'accumulationPlans';
export const ACCUMULATION_PLAN_LOCKS_COLLECTION = 'accumulationPlanLocks';

function toClassMeasurement(data: Record<string, unknown> | undefined): ClassMeasurement | undefined {
  if (!data) return undefined;
  return {
    measuredAt: toDate(data.measuredAt as never),
    classNotionalEur: (data.classNotionalEur ?? {}) as Partial<Record<AssetClass, number>>,
    marketBaseEur: data.marketBaseEur as number,
  };
}

function toInstallment(data: Record<string, unknown>): Installment {
  return {
    index: data.index as number,
    month: data.month as string,
    lines: (data.lines ?? []) as InstallmentLine[],
    carryInEur: (data.carryInEur ?? {}) as Record<string, number>,
    confirmedAt: data.confirmedAt ? toDate(data.confirmedAt as never) : undefined,
    measurement: toClassMeasurement(data.measurement as Record<string, unknown> | undefined),
    ...(data.recalibrationDismissed
      ? { recalibrationDismissed: data.recalibrationDismissed as Installment['recalibrationDismissed'] }
      : {}),
  };
}

function toRevisions(data: unknown): PlanRevision[] | undefined {
  if (!Array.isArray(data)) return undefined;
  return (data as Record<string, unknown>[]).map((revision) => ({
    at: toDate(revision.at as never),
    fromIndex: revision.fromIndex as number,
    before: revision.before as PlanRevision['before'],
  }));
}

function toPlanBaseline(data: Record<string, unknown> | undefined): PlanBaseline | undefined {
  if (!data) return undefined;
  return {
    capturedAt: toDate(data.capturedAt as never),
    positionValuesEur: (data.positionValuesEur ?? {}) as Record<string, number>,
    sourceCashEur: data.sourceCashEur as number,
    pricesEur: (data.pricesEur ?? {}) as Record<string, number>,
    measurement: toClassMeasurement(data.measurement as Record<string, unknown>)!,
  };
}

/** The optimizer's run a plan was seeded from, as stored with the plan. */
function toOptimizerSnapshot(data: Record<string, unknown> | undefined): OptimizerSnapshot | undefined {
  if (!data) return undefined;
  return {
    computedAt: toDate(data.computedAt as never),
    mode: data.mode as OptimizerSnapshot['mode'],
    settingsUsed: data.settingsUsed as OptimizerSnapshot['settingsUsed'],
    weights: (data.weights ?? []) as OptimizerSnapshot['weights'],
    objectives: (data.objectives ?? []) as OptimizerSnapshot['objectives'],
    ...(Array.isArray(data.conflicts) ? { conflicts: data.conflicts as NonNullable<OptimizerSnapshot['conflicts']> } : {}),
    // «Con vendite mirate» only: the cap and the locks the run was computed with.
    ...(typeof data.taxCapEur === 'number' ? { taxCapEur: data.taxCapEur } : {}),
    ...(Array.isArray(data.lockedKeys) ? { lockedKeys: data.lockedKeys as string[] } : {}),
  };
}

/** A plan document as the domain type. */
export function docToAccumulationPlan(id: string, data: Record<string, unknown>): AccumulationPlan {
  return {
    id,
    userId: data.userId as string,
    name: data.name as string,
    status: data.status as AccumulationPlanStatus,
    startMonth: data.startMonth as string,
    months: data.months as number,
    liquidity: data.liquidity as PlanLiquidity,
    positions: (data.positions ?? []) as PlanPosition[],
    disposals: (data.disposals ?? []) as PlanDisposal[],
    baseline: toPlanBaseline(data.baseline as Record<string, unknown> | undefined),
    installments: ((data.installments ?? []) as Record<string, unknown>[]).map(toInstallment),
    residualEur: data.residualEur as number | undefined,
    optimizerSnapshot: toOptimizerSnapshot(data.optimizerSnapshot as Record<string, unknown> | undefined),
    reviewMonthIndex: data.reviewMonthIndex as number | undefined,
    advisorNotes: Array.isArray(data.advisorNotes) ? (data.advisorNotes as string[]) : undefined,
    revisions: toRevisions(data.revisions),
    createdAt: toDate(data.createdAt as never),
    updatedAt: toDate(data.updatedAt as never),
    activatedAt: data.activatedAt ? toDate(data.activatedAt as never) : undefined,
    closedAt: data.closedAt ? toDate(data.closedAt as never) : undefined,
  };
}

export { selectOpenPlan } from './openAccumulationPlan';

/** The plan a lock still holds open, or null when the lock is free or points at a closed plan. */
export function openPlanHeldBy(
  lockOpenPlanId: string | null | undefined,
  pointedStatus: AccumulationPlanStatus | null,
): string | null {
  if (!lockOpenPlanId) return null;
  return pointedStatus === 'draft' || pointedStatus === 'active' ? lockOpenPlanId : null;
}
