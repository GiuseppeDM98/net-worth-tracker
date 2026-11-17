/**
 * ACCUMULATION PLAN SERVICE (client SDK) — the writes of the Accumulo tab.
 *
 * One document per plan in `accumulationPlans`, on the `pensionContributionService.ts` model: client
 * SDK, `db` from `@/lib/firebase/config`. The read lives in `accumulationPlanRead.ts` and the
 * converters in `lib/utils/accumulationPlanDoc.ts`, so the Allocazione page's first load never pulls
 * this module.
 *
 * ONE PLAN IN DRAFT OR ACTIVE PER ACCOUNT (2026-11-12): a client-SDK transaction can `tx.get()` a
 * document but never run a query, so the invariant lives in a lock document,
 * `accumulationPlanLocks/{ownerUid}` `{ userId, openPlanId, updatedAt }`. Every transaction that opens
 * or closes a plan reads the lock and the plan it names FIRST (all reads before any write), decides
 * with `openPlanHeldBy`, then writes the plan and the lock together. A lock naming a plan deleted
 * outside the app reads as free: the plans' rule lets a missing document be read.
 *
 * MONEY IN CENTS (2026-11-12): every euro field of a written plan passes through `roundPlanEuros`
 * once, here — the editor's typed amounts, the calendar's and the baseline's float sums alike.
 *
 * Errors meant for the user are thrown with `userFacingError` (`lib/utils/dialogNarrative.ts`), so
 * `describeWriteError` can surface them verbatim instead of a generic Firestore message.
 */
import {
  collection,
  deleteField,
  doc,
  runTransaction,
  type DocumentReference,
  type Transaction,
} from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { removeUndefinedDeep } from '@/lib/utils/firestoreData';
import { roundToCents } from '@/lib/utils/cents';
import { userFacingError } from '@/lib/utils/dialogNarrative';
import { accumulationPlanDraftSchema, validateDraftAgainstAssets } from '@/lib/utils/accumulationPlanSchema';
import { describeDraftIssue, ACCUMULO_ONE_OPEN_PLAN, ACCUMULO_REACTIVATE_REFUSED } from '@/lib/utils/accumulationNarrative';
import { canReactivatePlan } from '@/lib/utils/accumuloSummary';
import {
  ACCUMULATION_PLAN_LOCKS_COLLECTION,
  ACCUMULATION_PLANS_COLLECTION,
  docToAccumulationPlan,
  openPlanHeldBy,
} from '@/lib/utils/accumulationPlanDoc';
import {
  resolvePositionStates,
  proceedsOfDisposal,
  buildRevisedPlan,
  computeUsableLiquidity,
  computeTotalPurchases,
  scheduleInstallments,
  buildClassMeasurement,
  type PlanDeps,
  type AllocationCompare,
  type RecalibrationLine,
  type PlanRevisionInput,
} from '@/lib/utils/accumulationPlanUtils';
import type {
  AccumulationPlanDraft,
  AccumulationPlanStatus,
  Installment,
  InstallmentLine,
  InstallmentLineStatus,
  PlanBaseline,
  PlanDisposal,
} from '@/types/accumulationPlan';
import type { Asset, AssetAllocationTarget } from '@/types/assets';

export { ACCUMULATION_PLANS_COLLECTION } from '@/lib/utils/accumulationPlanDoc';
export { getAccumulationPlans } from '@/lib/services/accumulationPlanRead';

// ---------------------------------------------------------------------------
// Money in cents
// ---------------------------------------------------------------------------

/** The euro amounts a plan stores; a unit price (`priceEurAtPlan`, `pricesEur`) is not one. */
const EURO_FIELDS = new Set([
  'plannedAmountEur', 'executedAmountEur', 'estimatedProceedsEur', 'residualEur',
  'reserveEur', 'monthlyInflowEur', 'sourceCashEur', 'marketBaseEur',
]);
/** The maps whose every value is a euro amount. */
const EURO_MAPS = new Set(['carryInEur', 'positionValuesEur', 'classNotionalEur']);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype;
}

function roundEuroMap(map: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(map).map(([key, value]) => [key, typeof value === 'number' ? roundToCents(value) : value]));
}

function roundDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(roundDeep);
  // Dates and Firestore sentinels (`deleteField()`) pass untouched.
  if (!isPlainObject(value)) return value;
  const out: Record<string, unknown> = {};
  for (const [key, field] of Object.entries(value)) {
    if (typeof field === 'number' && EURO_FIELDS.has(key)) out[key] = roundToCents(field);
    else if (EURO_MAPS.has(key) && isPlainObject(field)) out[key] = roundEuroMap(field);
    else out[key] = roundDeep(field);
  }
  return out;
}

/** The patch of a plan write with every euro field in cents and no `undefined` left. */
function roundPlanEuros<T extends Record<string, unknown>>(patch: T): T {
  return removeUndefinedDeep(roundDeep(patch) as T);
}

// ---------------------------------------------------------------------------
// The lock
// ---------------------------------------------------------------------------

function lockRefOf(ownerId: string): DocumentReference {
  return doc(db, ACCUMULATION_PLAN_LOCKS_COLLECTION, ownerId);
}

function planRefOf(planId: string): DocumentReference {
  return doc(db, ACCUMULATION_PLANS_COLLECTION, planId);
}

/** The lock's `openPlanId` (null when the lock does not exist), read inside `tx`. */
async function readLockedPlanId(tx: Transaction, ownerId: string): Promise<string | null> {
  const lock = await tx.get(lockRefOf(ownerId));
  return lock.exists() ? ((lock.data().openPlanId as string | null | undefined) ?? null) : null;
}

/** The status of the plan `planId`, null when it does not exist — read inside `tx`. */
async function readPlanStatus(tx: Transaction, planId: string): Promise<AccumulationPlanStatus | null> {
  const snap = await tx.get(planRefOf(planId));
  return snap.exists() ? (snap.data().status as AccumulationPlanStatus) : null;
}

function writeLock(tx: Transaction, ownerId: string, openPlanId: string | null, now: Date): void {
  tx.set(lockRefOf(ownerId), { userId: ownerId, openPlanId, updatedAt: now });
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

/** Validate the draft's shape and write it as a new `draft` plan with an empty calendar, taking the lock. */
export async function createDraftPlan(ownerId: string, draft: AccumulationPlanDraft): Promise<string> {
  accumulationPlanDraftSchema.parse(draft);
  const planRef = doc(collection(db, ACCUMULATION_PLANS_COLLECTION));

  await runTransaction(db, async (tx) => {
    const heldId = await readLockedPlanId(tx, ownerId);
    const heldStatus = heldId ? await readPlanStatus(tx, heldId) : null;
    if (openPlanHeldBy(heldId, heldStatus)) throw userFacingError(ACCUMULO_ONE_OPEN_PLAN);
    const now = new Date();
    tx.set(planRef, roundPlanEuros({
      userId: ownerId,
      name: draft.name,
      status: 'draft' as AccumulationPlanStatus,
      startMonth: draft.startMonth,
      months: draft.months,
      liquidity: draft.liquidity,
      positions: draft.positions,
      disposals: draft.disposals,
      installments: [] as Installment[],
      createdAt: now,
      updatedAt: now,
    }));
    writeLock(tx, ownerId, planRef.id, now);
  });
  return planRef.id;
}

/** Replace a draft's editable fields — refused once the plan has left `draft`. */
export async function updateDraftPlan(planId: string, draft: AccumulationPlanDraft): Promise<void> {
  accumulationPlanDraftSchema.parse(draft);
  const ref = doc(db, ACCUMULATION_PLANS_COLLECTION, planId);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw userFacingError('Il piano non esiste più.');
    if ((snap.data().status as AccumulationPlanStatus) !== 'draft') {
      throw userFacingError('Il piano non è più una bozza: non può essere modificato da qui.');
    }
    tx.update(
      ref,
      roundPlanEuros({
        name: draft.name,
        startMonth: draft.startMonth,
        months: draft.months,
        liquidity: draft.liquidity,
        positions: draft.positions,
        disposals: draft.disposals,
        updatedAt: new Date(),
      })
    );
  });
}

export interface ActivatePlanInput {
  allAssets: Asset[];
  targets: AssetAllocationTarget;
  compare: AllocationCompare;
  deps: PlanDeps;
  today: Date;
}

/**
 * Turn a draft into the active plan: freeze the disposals' proceeds and the buy prices at today's
 * market, compute the calendar (`scheduleInstallments`) and the baseline measurement (month 0
 * of the trajectory) — all inside one transaction re-reading the plan to confirm it is still
 * a `draft`.
 */
export async function activatePlan(planId: string, input: ActivatePlanInput): Promise<void> {
  const { allAssets, targets, compare, deps, today } = input;
  const ref = doc(db, ACCUMULATION_PLANS_COLLECTION, planId);
  const assetsById = new Map(allAssets.map((asset) => [asset.id, asset]));

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw userFacingError('Il piano non esiste più.');
    const data = snap.data() as Record<string, unknown>;
    if ((data.status as AccumulationPlanStatus) !== 'draft') {
      throw userFacingError('Solo una bozza può essere attivata.');
    }
    const plan = docToAccumulationPlan(snap.id, data);

    const disposals: PlanDisposal[] = plan.disposals.map((disposal) => {
      const asset = assetsById.get(disposal.assetId);
      return {
        ...disposal,
        estimatedProceedsEur: proceedsOfDisposal(disposal, asset, deps),
      };
    });

    const states = resolvePositionStates(plan.positions, assetsById, deps, disposals);
    const liquidity = computeUsableLiquidity(plan.liquidity, assetsById, disposals, plan.months, deps);
    const totals = computeTotalPurchases(states, liquidity.L);
    const { installments, residualEur } = scheduleInstallments(totals, states, plan.months, plan.startMonth, 1, liquidity.refillMonths);

    const positionValuesEur: Record<string, number> = {};
    const pricesEur: Record<string, number> = {};
    for (const state of states) {
      positionValuesEur[state.positionId] = state.currentValueEur;
      if (!state.unpriced) pricesEur[state.buyAssetId] = state.buyPriceEur;
    }

    const baseline: PlanBaseline = {
      capturedAt: today,
      positionValuesEur,
      sourceCashEur: liquidity.sourceCashEur,
      pricesEur,
      measurement: buildClassMeasurement(compare(allAssets, targets), today),
    };

    tx.update(
      ref,
      roundPlanEuros({
        status: 'active' as AccumulationPlanStatus,
        disposals,
        installments,
        residualEur,
        baseline,
        activatedAt: today,
        updatedAt: today,
      })
    );
  });
}

export interface SetInstallmentLinePatch {
  status: InstallmentLineStatus;
  transactionIds?: string[];
  executedQuantity?: number;
  executedAmountEur?: number;
}

export interface MeasurementInput {
  allAssets: Asset[];
  targets: AssetAllocationTarget;
  compare: AllocationCompare;
  today: Date;
}

/**
 * Patch one line of an installment (confirm a match, mark it executed by hand, skip it). Once
 * every line of the installment is `executed`/`skipped` it closes: `confirmedAt` is stamped and
 * `measurement` freezes THAT month's point of the trajectory — the caller supplies
 * `measurementInput` because measuring needs the live portfolio, which this service never reads on
 * its own.
 */
export async function setInstallmentLine(
  planId: string,
  index: number,
  positionId: string,
  patch: SetInstallmentLinePatch,
  measurementInput: MeasurementInput
): Promise<void> {
  const ref = doc(db, ACCUMULATION_PLANS_COLLECTION, planId);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw userFacingError('Il piano non esiste più.');
    const plan = docToAccumulationPlan(snap.id, snap.data() as Record<string, unknown>);
    const installment = plan.installments.find((i) => i.index === index);
    if (!installment) throw userFacingError('Rata non trovata.');

    const lines = installment.lines.map((line) =>
      line.positionId === positionId ? { ...line, ...patch } : line
    );
    const allClosed = lines.every((line) => line.status === 'executed' || line.status === 'skipped');

    const updatedInstallment: Installment = {
      ...installment,
      lines,
      confirmedAt: allClosed ? measurementInput.today : installment.confirmedAt,
      measurement: allClosed
        ? buildClassMeasurement(
            measurementInput.compare(measurementInput.allAssets, measurementInput.targets),
            measurementInput.today
          )
        : installment.measurement,
    };

    const installments = plan.installments.map((i) => (i.index === index ? updatedInstallment : i));
    tx.update(ref, roundPlanEuros({ installments, updatedAt: new Date() }));
  });
}

/** Patch one disposal (confirm the sell match, mark it executed by hand, skip it) — mirrors `setInstallmentLine`. */
export async function setDisposal(
  planId: string,
  assetId: string,
  patch: { status: InstallmentLineStatus; transactionIds?: string[]; executedAmountEur?: number }
): Promise<void> {
  const ref = doc(db, ACCUMULATION_PLANS_COLLECTION, planId);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw userFacingError('Il piano non esiste più.');
    const plan = docToAccumulationPlan(snap.id, snap.data() as Record<string, unknown>);
    const disposals = plan.disposals.map((disposal) =>
      disposal.assetId === assetId ? { ...disposal, ...patch } : disposal
    );
    tx.update(ref, roundPlanEuros({ disposals, updatedAt: new Date() }));
  });
}

/** Replace the `planned` lines of an installment with `recalibrateInstallment`'s suggestion; `executed` lines are untouched. */
export async function applyRecalibration(
  planId: string,
  index: number,
  lines: RecalibrationLine[]
): Promise<void> {
  const ref = doc(db, ACCUMULATION_PLANS_COLLECTION, planId);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw userFacingError('Il piano non esiste più.');
    const plan = docToAccumulationPlan(snap.id, snap.data() as Record<string, unknown>);
    const installment = plan.installments.find((i) => i.index === index);
    if (!installment) throw userFacingError('Rata non trovata.');

    const executedLines = installment.lines.filter((line) => line.status === 'executed');
    const suggestedLines: InstallmentLine[] = lines
      .filter((line) => line.suggestedQuantity > 0)
      .map((line) => ({
        positionId: line.positionId,
        assetId: line.assetId,
        plannedQuantity: line.suggestedQuantity,
        priceEurAtPlan: line.priceEur,
        plannedAmountEur: line.suggestedAmountEur,
        status: 'planned',
      }));

    const updatedInstallment: Installment = {
      ...installment,
      lines: [...executedLines, ...suggestedLines],
      recalibrationDismissed: undefined,
    };
    const installments = plan.installments.map((i) => (i.index === index ? updatedInstallment : i));
    tx.update(ref, roundPlanEuros({ installments, updatedAt: new Date() }));
  });
}

export interface RevisePlanInput {
  allAssets: Asset[];
  deps: PlanDeps;
  today: Date;
}

/**
 * «Rivedi il piano»: re-reads the plan inside the transaction, refuses anything but an `active`
 * one, validates the revised plan against the live portfolio and writes the new calendar from the
 * first intact installment on (`buildRevisedPlan`).
 */
export async function revisePlan(planId: string, revision: PlanRevisionInput, input: RevisePlanInput): Promise<void> {
  const { allAssets, deps, today } = input;
  const ref = doc(db, ACCUMULATION_PLANS_COLLECTION, planId);
  const assetsById = new Map(allAssets.map((asset) => [asset.id, asset]));

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw userFacingError('Il piano non esiste più.');
    const plan = docToAccumulationPlan(snap.id, snap.data() as Record<string, unknown>);
    if (plan.status !== 'active') throw userFacingError('Solo un piano attivo può essere rivisto.');

    const result = buildRevisedPlan(plan, revision, assetsById, deps, today);
    if (!result.ok) {
      throw userFacingError(
        result.issue === 'duplicate_asset'
          ? describeDraftIssue({ code: 'duplicate_asset', label: assetsById.get(result.assetId)?.name ?? result.assetId })
          : describeDraftIssue({ code: result.issue })
      );
    }

    const issues = validateDraftAgainstAssets(
      {
        name: result.plan.name,
        startMonth: result.plan.startMonth,
        months: result.plan.months,
        liquidity: result.plan.liquidity,
        positions: result.plan.positions,
        // Executed sales already left the ledger: only the pending ones are checked against the held shares.
        disposals: result.plan.disposals.filter((d) => d.status !== 'executed'),
      },
      assetsById
    );
    if (issues.length > 0) throw userFacingError(issues[0].message);

    tx.update(
      ref,
      roundPlanEuros({
        months: result.plan.months,
        liquidity: result.plan.liquidity,
        positions: result.plan.positions,
        disposals: result.plan.disposals,
        installments: result.plan.installments,
        residualEur: result.plan.residualEur,
        revisions: result.plan.revisions,
        updatedAt: today,
      })
    );
  });
}

/** «Lascia così»: remembers the suggested quantities so the proposal stays quiet until they change. */
export async function dismissRecalibration(
  planId: string,
  index: number,
  quantities: Record<string, number>
): Promise<void> {
  const ref = doc(db, ACCUMULATION_PLANS_COLLECTION, planId);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw userFacingError('Il piano non esiste più.');
    const plan = docToAccumulationPlan(snap.id, snap.data() as Record<string, unknown>);
    const installments = plan.installments.map((installment) =>
      installment.index === index ? { ...installment, recalibrationDismissed: { quantities } } : installment
    );
    tx.update(ref, roundPlanEuros({ installments, updatedAt: new Date() }));
  });
}

/** Close a plan (`completed` or `cancelled`) — no further edits after this — and free the lock that names it. */
export async function closePlan(
  ownerId: string,
  planId: string,
  status: Extract<AccumulationPlanStatus, 'completed' | 'cancelled'>
): Promise<void> {
  const ref = planRefOf(planId);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const heldId = await readLockedPlanId(tx, ownerId);
    if (!snap.exists()) throw userFacingError('Il piano non esiste più.');
    const now = new Date();
    tx.update(ref, { status, closedAt: now, updatedAt: now });
    if (heldId === planId) writeLock(tx, ownerId, null, now);
  });
}

/**
 * «Riattiva»: an interrupted plan goes back to `active`, `closedAt` removed, and takes the lock. The
 * transaction reads the plan, the lock and the plan the lock names, and refuses when that one is still
 * open or the plan's own conditions fail (`cancelled`, stopped under 30 days ago). The months already
 * past come back `late` for the matcher, as they were before the stop.
 */
export async function reactivatePlan(ownerId: string, planId: string, today: Date): Promise<void> {
  const ref = planRefOf(planId);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const heldId = await readLockedPlanId(tx, ownerId);
    const heldStatus = heldId && heldId !== planId ? await readPlanStatus(tx, heldId) : null;
    if (!snap.exists()) throw userFacingError('Il piano non esiste più.');
    const plan = docToAccumulationPlan(snap.id, snap.data() as Record<string, unknown>);
    const heldByOther = heldId !== planId && openPlanHeldBy(heldId, heldStatus) !== null;
    if (heldByOther || !canReactivatePlan(plan, [], today)) throw userFacingError(ACCUMULO_REACTIVATE_REFUSED);
    const now = new Date();
    tx.update(ref, { status: 'active' as AccumulationPlanStatus, closedAt: deleteField(), updatedAt: now });
    writeLock(tx, ownerId, planId, now);
  });
}

/** Delete a plan still in `draft` — refused once it has been activated — and free the lock that names it. */
export async function deleteDraftPlan(ownerId: string, planId: string): Promise<void> {
  const ref = planRefOf(planId);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const heldId = await readLockedPlanId(tx, ownerId);
    if (!snap.exists()) return;
    if ((snap.data().status as AccumulationPlanStatus) !== 'draft') {
      throw userFacingError('Solo una bozza può essere eliminata da qui.');
    }
    tx.delete(ref);
    if (heldId === planId) writeLock(tx, ownerId, null, new Date());
  });
}
