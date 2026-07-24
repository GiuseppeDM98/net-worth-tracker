import 'server-only';
import { FieldValue } from 'firebase-admin/firestore';
import type { Transaction, DocumentData, DocumentReference, DocumentSnapshot } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase/admin';
import {
  replayTransactions,
  buildDerivedAssetFields,
  computeCashDelta,
} from '@/lib/utils/assetTransactionUtils';
import {
  resolveTradePriceEur,
  resolveBaselinePriceEur,
} from '@/lib/server/tradeFxService';
import { getUserAssetsAdmin } from '@/lib/server/assetAdminRepository';
import { invalidateDashboardOverviewSummaryServer } from '@/lib/services/dashboardOverviewInvalidation.server';
import { removeUndefinedDeep } from '@/lib/utils/firestoreData';
import { toDate, getItalyDayBoundsUtc } from '@/lib/utils/dateHelpers';
import {
  ASSET_TRANSACTIONS_COLLECTION,
  ASSET_TRANSACTIONS_META_COLLECTION,
  isLedgerAssetType,
  type AssetTransaction,
  type AssetTransactionFormData,
  type AssetTransactionType,
} from '@/types/assetTransactions';
import type { AssetType } from '@/types/assets';

/**
 * Server-side orchestration for the asset trade ledger (Registro operazioni asset).
 *
 * DESIGN (docs/specs/1-asset-transactions/03-service-and-api.md): every trade mutation atomically
 * (1) writes the trade doc, (2) rewrites the derived fields on assets/{assetId} from a FULL replay
 * of the asset's trades, and (3) optionally moves a linked cash asset's balance. Step (2) depends
 * on a QUERY of all the asset's trades — only the Admin SDK can run a query inside a transaction —
 * which is why writes are Admin-API-only. This module is the use case (the dividendUseCase.ts
 * precedent): route handlers do auth+validate+delegate, the money-math lives in the pure engine
 * (assetTransactionUtils.ts), and this glue holds the atomic write.
 *
 * The engine's `replayTransactions` doubles as pre-write validation: it throws LedgerValidationError
 * on any invalid history (over-sell, negative input, mis-ordered baseline), which the route forwards
 * as a 422. Editing/deleting a mid-history trade re-runs the whole replay, so a later over-sell is
 * caught even though the edited row itself looks fine.
 */

const ASSETS_COLLECTION = 'assets';

/**
 * A semantic failure that needs Firestore context (meta missing, wrong asset type, out-of-bounds
 * date, baseline protection). Carries the HTTP status and an Italian, user-displayable message the
 * route forwards verbatim — mirrors the engine's LedgerValidationError for the pure-math failures.
 */
export class TradeUseCaseError extends Error {
  status: number;
  userMessage: string;

  constructor(status: number, userMessage: string) {
    super(userMessage);
    this.name = 'TradeUseCaseError';
    this.status = status;
    this.userMessage = userMessage;
    Object.setPrototypeOf(this, TradeUseCaseError.prototype);
  }
}

export interface TradeMutationResult {
  transactionId: string;
  derived: { quantity: number; averageCost: number | undefined };
  /** Realized P&L of THIS operation (present only for sells) — lets the UI toast without refetch. */
  realizedPnlEur?: number;
}

export type MigrationResult =
  | { alreadyMigrated: true }
  | { alreadyMigrated?: false; migratedAssetCount: number; baselineDate: Date };

// ---------------------------------------------------------------------------
// Firestore <-> domain converters
// ---------------------------------------------------------------------------

/** Read a stored trade doc into the domain shape, normalizing Timestamp → Date at the boundary. */
function docToAssetTransaction(id: string, data: DocumentData): AssetTransaction {
  return {
    id,
    userId: data.userId,
    assetId: data.assetId,
    type: data.type,
    date: toDate(data.date),
    quantity: data.quantity,
    pricePerUnit: data.pricePerUnit,
    priceEur: data.priceEur,
    fees: data.fees,
    linkedCashAssetId: data.linkedCashAssetId,
    isBaseline: data.isBaseline,
    note: data.note,
    createdAt: toDate(data.createdAt),
    updatedAt: toDate(data.updatedAt),
  };
}

/** Doc payload for a NEW trade (set). Optional undefined fields are stripped (no delete needed). */
function buildTradeSetDocData(t: AssetTransaction): Record<string, unknown> {
  return removeUndefinedDeep({
    userId: t.userId,
    assetId: t.assetId,
    type: t.type,
    date: t.date,
    quantity: t.quantity,
    pricePerUnit: t.pricePerUnit,
    priceEur: t.priceEur,
    fees: t.fees,
    linkedCashAssetId: t.linkedCashAssetId,
    isBaseline: t.isBaseline,
    note: t.note,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
  });
}

/**
 * Doc payload for an EDIT (update). Optional fields that were cleared must be REMOVED, not left
 * stale: updateDoc leaves absent fields intact, so an undefined value would keep the old one (the
 * Firestore optional-field-deletion trap). userId/assetId/isBaseline/createdAt are immutable.
 */
function buildTradeUpdateDocData(t: AssetTransaction): Record<string, unknown> {
  return {
    type: t.type,
    date: t.date,
    quantity: t.quantity,
    pricePerUnit: t.pricePerUnit,
    priceEur: t.priceEur,
    fees: t.fees ?? FieldValue.delete(),
    linkedCashAssetId: t.linkedCashAssetId ?? FieldValue.delete(),
    note: t.note ?? FieldValue.delete(),
    updatedAt: t.updatedAt,
  };
}

// ---------------------------------------------------------------------------
// Semantic validation (needs Firestore data — kept out of zod, spec 03 §1)
// ---------------------------------------------------------------------------

async function getMetaOrThrow(ownerId: string): Promise<{ baselineDate: Date }> {
  const snap = await adminDb.collection(ASSET_TRANSACTIONS_META_COLLECTION).doc(ownerId).get();
  if (!snap.exists) {
    // The UI triggers migration before showing any trade affordance, so this is a safety net.
    throw new TradeUseCaseError(409, 'Registro operazioni non ancora inizializzato.');
  }
  return { baselineDate: toDate(snap.data()?.baselineDate) };
}

async function getLedgerAssetCurrencyOrThrow(ownerId: string, assetId: string): Promise<string> {
  const snap = await adminDb.collection(ASSETS_COLLECTION).doc(assetId).get();
  const data = snap.exists ? snap.data() : undefined;
  if (!data || data.userId !== ownerId) {
    throw new TradeUseCaseError(404, 'Asset non trovato.');
  }
  if (!isLedgerAssetType(data.type as AssetType)) {
    throw new TradeUseCaseError(422, 'Questo tipo di asset non usa il registro operazioni.');
  }
  return (data.currency as string) ?? 'EUR';
}

async function getOwnedTradeOrThrow(ownerId: string, transactionId: string): Promise<AssetTransaction> {
  const snap = await adminDb.collection(ASSET_TRANSACTIONS_COLLECTION).doc(transactionId).get();
  if (!snap.exists || snap.data()?.userId !== ownerId) {
    throw new TradeUseCaseError(404, 'Operazione non trovata.');
  }
  return docToAssetTransaction(snap.id, snap.data() as DocumentData);
}

async function assertCashSettlementAsset(ownerId: string, cashAssetId: string): Promise<void> {
  const snap = await adminDb.collection(ASSETS_COLLECTION).doc(cashAssetId).get();
  const data = snap.exists ? snap.data() : undefined;
  if (!data || data.userId !== ownerId || data.assetClass !== 'cash') {
    throw new TradeUseCaseError(422, 'Il conto di regolamento selezionato non è valido.');
  }
}

/** meta.baselineDate <= date <= end of today (Italy day bounds — never setHours on Vercel). */
function assertDateWithinBounds(date: Date, baselineDate: Date): void {
  const { end } = getItalyDayBoundsUtc();
  if (date.getTime() < baselineDate.getTime()) {
    throw new TradeUseCaseError(422, "La data non può precedere l'apertura del registro operazioni.");
  }
  if (date.getTime() > end.getTime()) {
    throw new TradeUseCaseError(422, 'La data non può essere nel futuro.');
  }
}

/** Baseline is the frozen opening position: only quantity/pricePerUnit/note may change (spec 03 §1). */
function assertBaselineEditableFields(updates: Partial<AssetTransactionFormData>): void {
  if (
    updates.type !== undefined ||
    updates.date !== undefined ||
    updates.fees !== undefined ||
    updates.linkedCashAssetId !== undefined
  ) {
    throw new TradeUseCaseError(
      400,
      'Della posizione iniziale puoi modificare solo quantità, prezzo e nota.'
    );
  }
}

// ---------------------------------------------------------------------------
// Prepared mutation (everything network-bound is resolved BEFORE the transaction)
// ---------------------------------------------------------------------------

interface PreparedMutation {
  ownerId: string;
  assetId: string;
  op: 'set' | 'update' | 'delete';
  tradeRef: DocumentReference;
  /** The new/edited trade (in-memory, with id) used in the replay sequence. Absent for delete. */
  newTransaction?: AssetTransaction;
  /** The Firestore payload for the trade write. Absent for delete. */
  tradeDocData?: Record<string, unknown>;
  /** Id of the trade replaced (edit) or removed (delete). Absent for create. */
  targetTransactionId?: string;
  /** Reversal of old + application of new, aggregated per cash-asset docId (self-edit nets). */
  cashDeltaByDocId: Map<string, number>;
  /** Trade type whose result drives the response (new type for create/edit, old type for delete). */
  affectedType: AssetTransactionType;
  invalidationReason: string;
}

/** Add sign·computeCashDelta(t) to the per-docId map (sign −1 reverses an old version, +1 applies). */
function addCashDelta(map: Map<string, number>, t: AssetTransaction, sign: 1 | -1): void {
  if (!t.linkedCashAssetId) return;
  const delta = sign * computeCashDelta(t); // 0 for adjustments — nothing to settle
  if (delta === 0) return;
  map.set(t.linkedCashAssetId, (map.get(t.linkedCashAssetId) ?? 0) + delta);
}

async function prepareCreate(
  ownerId: string,
  data: AssetTransactionFormData
): Promise<PreparedMutation> {
  const { baselineDate } = await getMetaOrThrow(ownerId);
  const currency = await getLedgerAssetCurrencyOrThrow(ownerId, data.assetId);
  assertDateWithinBounds(data.date, baselineDate);
  if (data.linkedCashAssetId) await assertCashSettlementAsset(ownerId, data.linkedCashAssetId);

  // priceEur resolved here (network) — never inside the Firestore transaction.
  const priceEur = await resolveTradePriceEur(currency, data.pricePerUnit, data.date);

  const tradeRef = adminDb.collection(ASSET_TRANSACTIONS_COLLECTION).doc();
  const now = new Date();
  const newTransaction: AssetTransaction = {
    id: tradeRef.id,
    userId: ownerId,
    assetId: data.assetId,
    type: data.type,
    date: data.date,
    quantity: data.quantity,
    pricePerUnit: data.pricePerUnit,
    priceEur,
    fees: data.fees,
    linkedCashAssetId: data.linkedCashAssetId,
    note: data.note,
    createdAt: now,
    updatedAt: now,
  };

  const cashDeltaByDocId = new Map<string, number>();
  addCashDelta(cashDeltaByDocId, newTransaction, 1);

  return {
    ownerId,
    assetId: data.assetId,
    op: 'set',
    tradeRef,
    newTransaction,
    tradeDocData: buildTradeSetDocData(newTransaction),
    cashDeltaByDocId,
    affectedType: newTransaction.type,
    invalidationReason: 'asset_transaction_created',
  };
}

async function prepareEdit(
  ownerId: string,
  transactionId: string,
  updates: Partial<AssetTransactionFormData>
): Promise<PreparedMutation> {
  const oldTrade = await getOwnedTradeOrThrow(ownerId, transactionId);
  const { baselineDate } = await getMetaOrThrow(ownerId);
  const currency = await getLedgerAssetCurrencyOrThrow(ownerId, oldTrade.assetId);

  if (oldTrade.isBaseline) assertBaselineEditableFields(updates);

  // Merge: an absent key means "keep the old value" (JSON cannot carry an explicit undefined).
  const mergedType = updates.type ?? oldTrade.type;
  const mergedDate = updates.date ?? oldTrade.date;
  const mergedQuantity = updates.quantity ?? oldTrade.quantity;
  const mergedPricePerUnit = updates.pricePerUnit ?? oldTrade.pricePerUnit;
  const isAdjustment = mergedType === 'adjustment';
  // An absolute reset carries neither fees nor a cash settlement — normalize on a type change.
  const mergedFees = isAdjustment ? undefined : updates.fees !== undefined ? updates.fees : oldTrade.fees;
  const mergedLinkedCash = isAdjustment
    ? undefined
    : updates.linkedCashAssetId !== undefined
      ? updates.linkedCashAssetId
      : oldTrade.linkedCashAssetId;
  const mergedNote = updates.note !== undefined ? updates.note : oldTrade.note;

  assertDateWithinBounds(mergedDate, baselineDate);
  if (updates.linkedCashAssetId !== undefined && mergedLinkedCash) {
    await assertCashSettlementAsset(ownerId, mergedLinkedCash);
  }

  // Re-resolve priceEur only when price or date changed (otherwise reuse — avoids a network call).
  const priceEur =
    updates.pricePerUnit !== undefined || updates.date !== undefined
      ? await resolveTradePriceEur(currency, mergedPricePerUnit, mergedDate)
      : oldTrade.priceEur;

  const newTransaction: AssetTransaction = {
    ...oldTrade,
    type: mergedType,
    date: mergedDate,
    quantity: mergedQuantity,
    pricePerUnit: mergedPricePerUnit,
    priceEur,
    fees: mergedFees,
    linkedCashAssetId: mergedLinkedCash,
    note: mergedNote,
    updatedAt: new Date(),
  };

  const cashDeltaByDocId = new Map<string, number>();
  addCashDelta(cashDeltaByDocId, oldTrade, -1); // reverse the previous settlement
  addCashDelta(cashDeltaByDocId, newTransaction, 1); // apply the new one (nets if unchanged)

  return {
    ownerId,
    assetId: oldTrade.assetId,
    op: 'update',
    tradeRef: adminDb.collection(ASSET_TRANSACTIONS_COLLECTION).doc(transactionId),
    newTransaction,
    tradeDocData: buildTradeUpdateDocData(newTransaction),
    targetTransactionId: transactionId,
    cashDeltaByDocId,
    affectedType: newTransaction.type,
    invalidationReason: 'asset_transaction_updated',
  };
}

async function prepareDelete(ownerId: string, transactionId: string): Promise<PreparedMutation> {
  const oldTrade = await getOwnedTradeOrThrow(ownerId, transactionId);
  if (oldTrade.isBaseline) {
    throw new TradeUseCaseError(400, 'La posizione iniziale non può essere eliminata.');
  }

  const cashDeltaByDocId = new Map<string, number>();
  addCashDelta(cashDeltaByDocId, oldTrade, -1); // reverse its settlement

  return {
    ownerId,
    assetId: oldTrade.assetId,
    op: 'delete',
    tradeRef: adminDb.collection(ASSET_TRANSACTIONS_COLLECTION).doc(transactionId),
    targetTransactionId: transactionId,
    cashDeltaByDocId,
    affectedType: oldTrade.type,
    invalidationReason: 'asset_transaction_deleted',
  };
}

// ---------------------------------------------------------------------------
// Atomic commit (ALL reads before ANY writes — AGENTS.md runTransaction)
// ---------------------------------------------------------------------------

async function commitTradeMutation(
  plan: PreparedMutation
): Promise<{ derived: { quantity: number; averageCost: number | undefined }; realizedDelta?: number }> {
  let outcome:
    | { derived: { quantity: number; averageCost: number | undefined }; realizedDelta?: number }
    | undefined;

  await adminDb.runTransaction(async (tx: Transaction) => {
    // ── READS ────────────────────────────────────────────────────────────────
    // r1: every existing trade of the asset (equality-only query — no composite index).
    const tradesQuery = adminDb
      .collection(ASSET_TRANSACTIONS_COLLECTION)
      .where('userId', '==', plan.ownerId)
      .where('assetId', '==', plan.assetId);
    const existingSnap = await tx.get(tradesQuery);

    // r2: the asset doc (locks it for the transaction; confirms it still exists).
    const assetRef = adminDb.collection(ASSETS_COLLECTION).doc(plan.assetId);
    const assetSnap = await tx.get(assetRef);

    // r3: every cash asset touched by the aggregated deltas.
    const cashReads: { ref: DocumentReference; snap: DocumentSnapshot }[] = [];
    for (const docId of plan.cashDeltaByDocId.keys()) {
      const ref = adminDb.collection(ASSETS_COLLECTION).doc(docId);
      cashReads.push({ ref, snap: await tx.get(ref) });
    }

    // ── COMPUTE (pure) ─────────────────────────────────────────────────────────
    const existing = existingSnap.docs.map((d) => docToAssetTransaction(d.id, d.data()));
    const newSequence = buildNewSequence(existing, plan);

    // replayTransactions throws LedgerValidationError (→ 422) on any invalid history.
    const newState = replayTransactions(newSequence);
    const derived = buildDerivedAssetFields(newState);

    // Realized P&L of THIS operation = cumulative(new) − cumulative(old). Best-effort: if the
    // pre-existing history is somehow invalid, skip the figure rather than fail the mutation.
    let realizedDelta: number | undefined;
    try {
      const oldState = replayTransactions(existing);
      realizedDelta = newState.realizedPnlEur - oldState.realizedPnlEur;
    } catch {
      realizedDelta = undefined;
    }

    if (!assetSnap.exists) {
      throw new TradeUseCaseError(404, 'Asset non trovato.');
    }

    // ── WRITES ───────────────────────────────────────────────────────────────
    // w1: the trade doc.
    if (plan.op === 'set') {
      tx.set(plan.tradeRef, plan.tradeDocData!);
    } else if (plan.op === 'update') {
      tx.update(plan.tradeRef, plan.tradeDocData!);
    } else {
      tx.delete(plan.tradeRef);
    }

    // w2: derived asset fields. NEVER deleteField() holdingStartDate — undefined means "leave
    // untouched" (spec 02 §holdingStartDate); removeUndefinedDeep drops the undefined key so the
    // stored value survives. Written directly, NOT via updateAsset (whose undefined→deleteField()
    // for averageCost is exactly the trap we avoid).
    tx.update(
      assetRef,
      removeUndefinedDeep({
        quantity: derived.quantity,
        averageCost: derived.averageCost,
        updatedAt: new Date(),
        ...(derived.holdingStartDate !== undefined ? { holdingStartDate: derived.holdingStartDate } : {}),
      })
    );

    // w3: cash settlements (skip zero and missing accounts, like updateCashAssetBalancesAtomic).
    for (const { ref, snap } of cashReads) {
      const delta = plan.cashDeltaByDocId.get(ref.id) ?? 0;
      if (delta === 0) continue;
      if (!snap.exists) {
        console.warn('[assetTransactionUseCase] Skipping cash settlement: asset not found', { assetId: ref.id });
        continue;
      }
      const currentQuantity = (snap.data()?.quantity as number) ?? 0;
      tx.update(ref, { quantity: currentQuantity + delta, updatedAt: new Date() });
    }

    outcome = { derived: { quantity: derived.quantity, averageCost: derived.averageCost }, realizedDelta };
  });

  if (!outcome) {
    throw new Error('Trade mutation transaction produced no result');
  }

  // After commit: the hero total and asset table both change when a settlement moves cash.
  await invalidateDashboardOverviewSummaryServer(plan.ownerId, plan.invalidationReason);
  return outcome;
}

/** Splice the mutation into the existing trade list: append (create), replace (edit), drop (delete). */
function buildNewSequence(existing: AssetTransaction[], plan: PreparedMutation): AssetTransaction[] {
  if (plan.op === 'set') {
    return [...existing, plan.newTransaction!];
  }
  if (plan.op === 'update') {
    return existing.map((t) => (t.id === plan.targetTransactionId ? plan.newTransaction! : t));
  }
  return existing.filter((t) => t.id !== plan.targetTransactionId);
}

function buildResult(plan: PreparedMutation, commit: Awaited<ReturnType<typeof commitTradeMutation>>): TradeMutationResult {
  const includeRealized = plan.affectedType === 'sell' && commit.realizedDelta !== undefined;
  return {
    transactionId: plan.tradeRef.id,
    derived: commit.derived,
    ...(includeRealized ? { realizedPnlEur: commit.realizedDelta } : {}),
  };
}

// ---------------------------------------------------------------------------
// Public use-case API
// ---------------------------------------------------------------------------

export async function createAssetTransaction(
  ownerId: string,
  data: AssetTransactionFormData
): Promise<TradeMutationResult> {
  const plan = await prepareCreate(ownerId, data);
  const commit = await commitTradeMutation(plan);
  return buildResult(plan, commit);
}

export async function updateAssetTransaction(
  ownerId: string,
  transactionId: string,
  updates: Partial<AssetTransactionFormData>
): Promise<TradeMutationResult> {
  const plan = await prepareEdit(ownerId, transactionId, updates);
  const commit = await commitTradeMutation(plan);
  return buildResult(plan, commit);
}

export async function deleteAssetTransaction(
  ownerId: string,
  transactionId: string
): Promise<TradeMutationResult> {
  const plan = await prepareDelete(ownerId, transactionId);
  const commit = await commitTradeMutation(plan);
  return buildResult(plan, commit);
}

/**
 * Delete EVERY trade for one asset, no replay — the ledger-orphan fix for converting a ledger asset
 * (stock/etf/bond/crypto/commodity) to `pensionFund` (docs/specs/2-pension-fund/04-ui-and-views.md
 * §1.1, option 1). The asset is about to leave the ledger for good: `pensionFund` is not a
 * LEDGER_ASSET_TYPE, so the caller's metadata write already stopped deriving quantity/PMC from these
 * trades. Left in place, they would still be summed by ledger consumers keyed on `assetId` alone
 * (e.g. Rendimenti "Capitale investito") even though the asset itself no longer looks like a ledger
 * position — a silent, hard-to-diagnose overcount. Batched delete, well under Firestore's 500-op cap
 * for a single asset's trade history.
 *
 * Not exposed for any other use case: a still-ledger asset must never lose its trades this way (use
 * `deleteAssetTransaction` for a single trade, which re-validates the replay).
 */
export async function deleteAllAssetTransactionsForAsset(
  ownerId: string,
  assetId: string
): Promise<number> {
  const snap = await adminDb
    .collection(ASSET_TRANSACTIONS_COLLECTION)
    .where('userId', '==', ownerId)
    .where('assetId', '==', assetId)
    .get();

  if (snap.empty) return 0;

  const batch = adminDb.batch();
  for (const doc of snap.docs) {
    batch.delete(doc.ref);
  }
  await batch.commit();
  return snap.docs.length;
}

// ---------------------------------------------------------------------------
// Migration (idempotent, per-user, server-side — spec 03 §4)
// ---------------------------------------------------------------------------

/**
 * One-shot migration: every ledger asset with quantity > 0 gets ONE baseline BUY freezing the
 * position held at migration time. Idempotent — the meta doc's presence is the "done" signal, and
 * deterministic baseline ids (`baseline-${assetId}`) make a crashed re-run overwrite, not duplicate.
 * Does NOT touch the asset docs: quantity/PMC are identical by construction and holdingStartDate
 * must not move (invariant #4).
 */
export async function migrateAssetLedger(ownerId: string): Promise<MigrationResult> {
  const metaRef = adminDb.collection(ASSET_TRANSACTIONS_META_COLLECTION).doc(ownerId);
  const metaSnap = await metaRef.get();
  if (metaSnap.exists) {
    return { alreadyMigrated: true };
  }

  const assets = await getUserAssetsAdmin(ownerId);
  const ledgerAssets = assets.filter((a) => isLedgerAssetType(a.type) && a.quantity > 0);

  // Start-of-day Italy of migration day: the global floor for every future trade date.
  const { start: baselineDate } = getItalyDayBoundsUtc();
  const now = new Date();

  // Batched writes, well under Firestore's 500-op cap (costCenterService precedent uses ≤400).
  let batch = adminDb.batch();
  let opsInBatch = 0;
  for (const asset of ledgerAssets) {
    const priceEur = await resolveBaselinePriceEur(asset);
    const baselineRef = adminDb.collection(ASSET_TRANSACTIONS_COLLECTION).doc(`baseline-${asset.id}`);
    batch.set(
      baselineRef,
      removeUndefinedDeep({
        userId: ownerId,
        assetId: asset.id,
        type: 'buy' as const,
        isBaseline: true,
        date: baselineDate,
        quantity: asset.quantity,
        // No PMC → the position starts at market; returns are then measured from today (user decision).
        pricePerUnit: asset.averageCost ?? asset.currentPrice,
        priceEur,
        note: 'Posizione iniziale (migrazione registro operazioni)',
        createdAt: now,
        updatedAt: now,
      })
    );
    opsInBatch++;
    if (opsInBatch >= 400) {
      await batch.commit();
      batch = adminDb.batch();
      opsInBatch = 0;
    }
  }
  if (opsInBatch > 0) await batch.commit();

  // Meta doc LAST — its presence marks the migration complete.
  await metaRef.set(
    removeUndefinedDeep({
      userId: ownerId,
      migratedAt: now,
      baselineDate,
      migratedAssetCount: ledgerAssets.length,
      createdAt: now,
      updatedAt: now,
    })
  );

  return { migratedAssetCount: ledgerAssets.length, baselineDate };
}
