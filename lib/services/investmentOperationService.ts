import {
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDocs,
  query,
  runTransaction,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { invalidateDashboardOverviewSummary } from '@/lib/services/dashboardOverviewInvalidation';
import { appendHouseholdAuditEntrySafe } from '@/lib/services/householdService';
import { Asset } from '@/types/assets';
import { INTERNAL_TRANSFER_PURPOSE_LABELS } from '@/types/household';
import {
  InternalTransfer,
  InternalTransferFormData,
  InvestmentOperation,
  InvestmentOperationFormData,
  RealizedInvestmentSummary,
} from '@/types/investments';
import {
  calculateInternalTransferEffect,
  calculateInvestmentOperationEffect,
} from '@/lib/utils/investmentOperationUtils';

const ASSETS_COLLECTION = 'assets';
const INVESTMENT_OPERATIONS_COLLECTION = 'investmentOperations';
const INTERNAL_TRANSFERS_COLLECTION = 'internalTransfers';

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function toDateValue(value: unknown): Date {
  if (value instanceof Date) return value;
  if (value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function') {
    return value.toDate();
  }
  return new Date();
}

function removeUndefinedFields<T extends Record<string, unknown>>(obj: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, value]) => value !== undefined)
  ) as Partial<T>;
}

function normalizeOperation(docId: string, data: Record<string, unknown>): InvestmentOperation {
  return {
    id: docId,
    ...data,
    date: toDateValue(data.date),
    createdAt: toDateValue(data.createdAt),
    updatedAt: toDateValue(data.updatedAt),
  } as InvestmentOperation;
}

function normalizeTransfer(docId: string, data: Record<string, unknown>): InternalTransfer {
  return {
    id: docId,
    ...data,
    date: toDateValue(data.date),
    createdAt: toDateValue(data.createdAt),
    updatedAt: toDateValue(data.updatedAt),
  } as InternalTransfer;
}

export async function getInvestmentOperations(userId: string): Promise<InvestmentOperation[]> {
  const operationsRef = collection(db, INVESTMENT_OPERATIONS_COLLECTION);
  const q = query(operationsRef, where('userId', '==', userId));
  const snapshot = await getDocs(q);

  return snapshot.docs
    .map(operationDoc => normalizeOperation(operationDoc.id, operationDoc.data()))
    .sort((a, b) => toDateValue(b.date).getTime() - toDateValue(a.date).getTime());
}

export async function createInvestmentOperation(
  userId: string,
  input: InvestmentOperationFormData
): Promise<string> {
  calculateInvestmentOperationEffect({
    type: input.type,
    previousQuantity: 0,
    quantity: input.quantity,
    pricePerUnit: input.pricePerUnit,
    fees: input.fees,
    taxes: input.taxes,
  });

  const fees = input.fees ?? 0;
  const taxes = input.taxes ?? 0;

  const operationId = await runTransaction(db, async transaction => {
    const assetRef = doc(db, ASSETS_COLLECTION, input.assetId);
    const assetSnap = await transaction.get(assetRef);
    if (!assetSnap.exists()) {
      throw new Error('Asset not found');
    }

    const asset = { id: assetSnap.id, ...assetSnap.data() } as Asset;
    if (asset.userId !== userId) {
      throw new Error('Asset does not belong to the authenticated user');
    }
    if (asset.assetClass === 'cash') {
      throw new Error('Use internal transfers or cashflow entries for cash assets');
    }

    const previousQuantity = asset.quantity || 0;
    const previousAverageCost = asset.averageCost;
    const {
      grossAmount,
      resultingQuantity,
      resultingAverageCost,
      realizedGain,
      realizedGainTax,
      netCashEffect,
    } = calculateInvestmentOperationEffect({
      type: input.type,
      previousQuantity,
      previousAverageCost,
      quantity: input.quantity,
      pricePerUnit: input.pricePerUnit,
      fees,
      taxes,
    });

    let cashRef: ReturnType<typeof doc> | undefined;
    let cashAsset: Asset | undefined;
    if (input.cashAssetId && Math.abs(netCashEffect) > 0.000001) {
      cashRef = doc(db, ASSETS_COLLECTION, input.cashAssetId);
      const cashSnap = await transaction.get(cashRef);
      if (!cashSnap.exists()) {
        throw new Error('Cash asset not found');
      }
      cashAsset = cashSnap.data() as Asset;
      if (cashAsset.userId !== userId || cashAsset.assetClass !== 'cash') {
        throw new Error('Cash asset does not belong to the authenticated user');
      }
    }

    const now = Timestamp.now();
    transaction.update(assetRef, {
      quantity: resultingQuantity,
      averageCost: resultingAverageCost === undefined ? deleteField() : resultingAverageCost,
      updatedAt: now,
    });

    if (cashRef && cashAsset) {
      transaction.update(cashRef, {
        quantity: (cashAsset.quantity || 0) + netCashEffect,
        updatedAt: now,
      });
    }

    const operationRef = doc(collection(db, INVESTMENT_OPERATIONS_COLLECTION));
    transaction.set(operationRef, removeUndefinedFields({
      userId,
      assetId: asset.id,
      assetName: asset.name,
      assetTicker: asset.ticker,
      type: input.type,
      date: Timestamp.fromDate(input.date),
      quantity: input.quantity,
      pricePerUnit: input.pricePerUnit,
      grossAmount,
      fees,
      taxes,
      currency: input.currency || asset.currency || 'EUR',
      cashAssetId: input.cashAssetId,
      cashAssetName: cashAsset?.name,
      linkedExpenseId: input.linkedExpenseId,
      notes: input.notes,
      previousQuantity,
      previousAverageCost,
      resultingQuantity,
      resultingAverageCost,
      realizedGain,
      realizedGainTax,
      netCashEffect,
      createdAt: now,
      updatedAt: now,
    }));

    return operationRef.id;
  });

  await invalidateDashboardOverviewSummary(userId, 'investment_operation_created');
  return operationId;
}

export async function getRealizedInvestmentSummary(userId: string): Promise<RealizedInvestmentSummary> {
  const operations = await getInvestmentOperations(userId);
  const sells = operations.filter(operation => operation.type === 'sell' || operation.type === 'withdrawal');
  const byAssetMap = new Map<string, RealizedInvestmentSummary['byAsset'][number]>();

  sells.forEach(operation => {
    const realizedGain = operation.realizedGain ?? 0;
    const realizedTaxes = operation.realizedGainTax ?? operation.taxes ?? 0;
    const current = byAssetMap.get(operation.assetId) ?? {
      assetId: operation.assetId,
      assetName: operation.assetName,
      assetTicker: operation.assetTicker,
      realizedGain: 0,
      realizedTaxes: 0,
      netRealizedGain: 0,
      sellsCount: 0,
    };

    current.realizedGain += realizedGain;
    current.realizedTaxes += realizedTaxes;
    current.netRealizedGain += realizedGain - realizedTaxes;
    current.sellsCount += 1;
    byAssetMap.set(operation.assetId, current);
  });

  const byAsset = Array.from(byAssetMap.values()).sort((a, b) => b.netRealizedGain - a.netRealizedGain);
  const totalRealizedGain = byAsset.reduce((sum, item) => sum + item.realizedGain, 0);
  const totalRealizedTaxes = byAsset.reduce((sum, item) => sum + item.realizedTaxes, 0);

  return {
    totalRealizedGain,
    totalRealizedTaxes,
    totalNetRealizedGain: totalRealizedGain - totalRealizedTaxes,
    sellsCount: sells.length,
    byAsset,
  };
}

export async function deleteInvestmentOperation(operationId: string): Promise<void> {
  const operationRef = doc(db, INVESTMENT_OPERATIONS_COLLECTION, operationId);
  let userId: string | undefined;

  await runTransaction(db, async transaction => {
    const operationSnap = await transaction.get(operationRef);
    if (!operationSnap.exists()) {
      return;
    }

    const operation = normalizeOperation(operationSnap.id, operationSnap.data());
    userId = operation.userId;

    const assetRef = doc(db, ASSETS_COLLECTION, operation.assetId);
    const assetSnap = await transaction.get(assetRef);
    if (!assetSnap.exists()) {
      throw new Error('Asset not found');
    }

    const asset = assetSnap.data() as Asset;
    const currentQuantity = asset.quantity || 0;
    const expectedQuantity = operation.resultingQuantity;
    if (Math.abs(currentQuantity - expectedQuantity) > 0.000001) {
      throw new Error('Cannot delete operation because the asset changed after it was recorded');
    }

    let cashRef: ReturnType<typeof doc> | undefined;
    let cashAsset: Asset | undefined;
    if (operation.cashAssetId && Math.abs(operation.netCashEffect) > 0.000001) {
      cashRef = doc(db, ASSETS_COLLECTION, operation.cashAssetId);
      const cashSnap = await transaction.get(cashRef);
      if (!cashSnap.exists()) {
        throw new Error('Cash asset not found');
      }
      cashAsset = cashSnap.data() as Asset;
    }

    const now = Timestamp.now();
    transaction.update(assetRef, {
      quantity: operation.previousQuantity,
      averageCost: operation.previousAverageCost === undefined ? deleteField() : operation.previousAverageCost,
      updatedAt: now,
    });

    if (cashRef && cashAsset) {
      transaction.update(cashRef, {
        quantity: (cashAsset.quantity || 0) - operation.netCashEffect,
        updatedAt: now,
      });
    }

    transaction.delete(operationRef);
  });

  if (userId) {
    await invalidateDashboardOverviewSummary(userId, 'investment_operation_deleted');
  } else {
    await deleteDoc(operationRef).catch(() => undefined);
  }
}

export async function updateInvestmentOperation(
  operationId: string,
  input: InvestmentOperationFormData
): Promise<void> {
  const operationRef = doc(db, INVESTMENT_OPERATIONS_COLLECTION, operationId);
  let userId: string | undefined;

  await runTransaction(db, async transaction => {
    const operationSnap = await transaction.get(operationRef);
    if (!operationSnap.exists()) {
      throw new Error('Operation not found');
    }

    const operation = normalizeOperation(operationSnap.id, operationSnap.data());
    userId = operation.userId;
    if (operation.assetId !== input.assetId) {
      throw new Error('Changing the linked asset is not supported. Delete and recreate the operation.');
    }

    const assetRef = doc(db, ASSETS_COLLECTION, operation.assetId);
    const assetSnap = await transaction.get(assetRef);
    if (!assetSnap.exists()) {
      throw new Error('Asset not found');
    }

    const asset = { id: assetSnap.id, ...assetSnap.data() } as Asset;
    if (asset.userId !== operation.userId || asset.assetClass === 'cash') {
      throw new Error('Asset does not belong to the operation owner');
    }
    if (Math.abs((asset.quantity || 0) - operation.resultingQuantity) > 0.000001) {
      throw new Error('Cannot update operation because the asset changed after it was recorded');
    }

    const fees = input.fees ?? 0;
    const taxes = input.taxes ?? 0;
    const {
      grossAmount,
      resultingQuantity,
      resultingAverageCost,
      realizedGain,
      realizedGainTax,
      netCashEffect,
    } = calculateInvestmentOperationEffect({
      type: input.type,
      previousQuantity: operation.previousQuantity,
      previousAverageCost: operation.previousAverageCost,
      quantity: input.quantity,
      pricePerUnit: input.pricePerUnit,
      fees,
      taxes,
    });

    const cashRefs = new Map<string, { ref: ReturnType<typeof doc>; asset: Asset }>();
    const cashIds = Array.from(new Set([operation.cashAssetId, input.cashAssetId].filter(Boolean))) as string[];
    for (const cashId of cashIds) {
      const cashRef = doc(db, ASSETS_COLLECTION, cashId);
      const cashSnap = await transaction.get(cashRef);
      if (!cashSnap.exists()) {
        throw new Error('Cash asset not found');
      }
      const cashAsset = cashSnap.data() as Asset;
      if (cashAsset.userId !== operation.userId || cashAsset.assetClass !== 'cash') {
        throw new Error('Cash asset does not belong to the operation owner');
      }
      cashRefs.set(cashId, { ref: cashRef, asset: cashAsset });
    }

    const now = Timestamp.now();
    transaction.update(assetRef, {
      quantity: resultingQuantity,
      averageCost: resultingAverageCost === undefined ? deleteField() : resultingAverageCost,
      updatedAt: now,
    });

    for (const cashId of cashIds) {
      const cashEntry = cashRefs.get(cashId);
      if (!cashEntry) continue;
      const oldDelta = operation.cashAssetId === cashId ? -operation.netCashEffect : 0;
      const newDelta = input.cashAssetId === cashId ? netCashEffect : 0;
      transaction.update(cashEntry.ref, {
        quantity: (cashEntry.asset.quantity || 0) + oldDelta + newDelta,
        updatedAt: now,
      });
    }

    const newCashAsset = input.cashAssetId ? cashRefs.get(input.cashAssetId)?.asset : undefined;
    transaction.update(operationRef, removeUndefinedFields({
      type: input.type,
      date: Timestamp.fromDate(input.date),
      quantity: input.quantity,
      pricePerUnit: input.pricePerUnit,
      grossAmount,
      fees,
      taxes,
      currency: input.currency || asset.currency || 'EUR',
      cashAssetId: input.cashAssetId || deleteField(),
      cashAssetName: newCashAsset?.name || deleteField(),
      notes: input.notes || deleteField(),
      resultingQuantity,
      resultingAverageCost: resultingAverageCost === undefined ? deleteField() : resultingAverageCost,
      realizedGain: realizedGain === undefined ? deleteField() : realizedGain,
      realizedGainTax: realizedGainTax === undefined ? deleteField() : realizedGainTax,
      netCashEffect,
      updatedAt: now,
    }));
  });

  if (userId) {
    await invalidateDashboardOverviewSummary(userId, 'investment_operation_updated');
  }
}

export async function createInternalTransfer(
  userId: string,
  input: InternalTransferFormData
): Promise<string> {
  calculateInternalTransferEffect(input.amount, input.fees ?? 0);
  if (input.fromCashAssetId === input.toCashAssetId) {
    throw new Error('Source and destination cash assets must be different');
  }

  const fees = input.fees ?? 0;

  const transferId = await runTransaction(db, async transaction => {
    const fromRef = doc(db, ASSETS_COLLECTION, input.fromCashAssetId);
    const toRef = doc(db, ASSETS_COLLECTION, input.toCashAssetId);
    const [fromSnap, toSnap] = await Promise.all([
      transaction.get(fromRef),
      transaction.get(toRef),
    ]);

    if (!fromSnap.exists() || !toSnap.exists()) {
      throw new Error('Cash asset not found');
    }

    const fromAsset = { id: fromSnap.id, ...fromSnap.data() } as Asset;
    const toAsset = { id: toSnap.id, ...toSnap.data() } as Asset;
    if (
      fromAsset.userId !== userId ||
      toAsset.userId !== userId ||
      fromAsset.assetClass !== 'cash' ||
      toAsset.assetClass !== 'cash'
    ) {
      throw new Error('Transfer assets must be cash assets owned by the authenticated user');
    }

    const now = Timestamp.now();
    const { fromCashDelta, toCashDelta } = calculateInternalTransferEffect(input.amount, fees);

    transaction.update(fromRef, {
      quantity: (fromAsset.quantity || 0) + fromCashDelta,
      updatedAt: now,
    });
    transaction.update(toRef, {
      quantity: (toAsset.quantity || 0) + toCashDelta,
      updatedAt: now,
    });

    const transferRef = doc(collection(db, INTERNAL_TRANSFERS_COLLECTION));
    transaction.set(transferRef, removeUndefinedFields({
      userId,
      fromCashAssetId: fromAsset.id,
      fromCashAssetName: fromAsset.name,
      toCashAssetId: toAsset.id,
      toCashAssetName: toAsset.name,
      amount: input.amount,
      currency: input.currency || fromAsset.currency || 'EUR',
      date: Timestamp.fromDate(input.date),
      fees,
      purpose: input.purpose ?? 'neutral_transfer',
      notes: input.notes,
      linkedExpenseId: input.linkedExpenseId,
      createdAt: now,
      updatedAt: now,
    }));

    return transferRef.id;
  });

  await invalidateDashboardOverviewSummary(userId, 'internal_transfer_created');
  appendHouseholdAuditEntrySafe(userId, {
    entityType: 'internalTransfer',
    entityId: transferId,
    action: 'create',
    summary: `Trasferimento creato: ${INTERNAL_TRANSFER_PURPOSE_LABELS[input.purpose ?? 'neutral_transfer']}`,
    after: {
      fromCashAssetId: input.fromCashAssetId,
      toCashAssetId: input.toCashAssetId,
      amount: input.amount,
      purpose: input.purpose ?? 'neutral_transfer',
    },
  });
  return transferId;
}

export async function updateInternalTransfer(
  transferId: string,
  input: InternalTransferFormData
): Promise<void> {
  calculateInternalTransferEffect(input.amount, input.fees ?? 0);
  if (input.fromCashAssetId === input.toCashAssetId) {
    throw new Error('Source and destination cash assets must be different');
  }

  const transferRef = doc(db, INTERNAL_TRANSFERS_COLLECTION, transferId);
  let userId: string | undefined;

  await runTransaction(db, async transaction => {
    const transferSnap = await transaction.get(transferRef);
    if (!transferSnap.exists()) {
      throw new Error('Transfer not found');
    }

    const transfer = normalizeTransfer(transferSnap.id, transferSnap.data());
    userId = transfer.userId;
    const fees = input.fees ?? 0;
    const oldFees = transfer.fees ?? 0;
    const cashIds = Array.from(new Set([
      transfer.fromCashAssetId,
      transfer.toCashAssetId,
      input.fromCashAssetId,
      input.toCashAssetId,
    ]));
    const cashRefs = new Map<string, { ref: ReturnType<typeof doc>; asset: Asset }>();

    for (const cashId of cashIds) {
      const cashRef = doc(db, ASSETS_COLLECTION, cashId);
      const cashSnap = await transaction.get(cashRef);
      if (!cashSnap.exists()) {
        throw new Error('Cash asset not found');
      }
      const cashAsset = cashSnap.data() as Asset;
      if (cashAsset.userId !== transfer.userId || cashAsset.assetClass !== 'cash') {
        throw new Error('Transfer assets must be cash assets owned by the transfer owner');
      }
      cashRefs.set(cashId, { ref: cashRef, asset: cashAsset });
    }

    const deltas = new Map<string, number>();
    const addDelta = (cashId: string, delta: number) => {
      deltas.set(cashId, (deltas.get(cashId) ?? 0) + delta);
    };
    addDelta(transfer.fromCashAssetId, transfer.amount + oldFees);
    addDelta(transfer.toCashAssetId, -transfer.amount);
    addDelta(input.fromCashAssetId, -(input.amount + fees));
    addDelta(input.toCashAssetId, input.amount);

    const now = Timestamp.now();
    for (const [cashId, delta] of deltas) {
      const cashEntry = cashRefs.get(cashId);
      if (!cashEntry || Math.abs(delta) < 0.000001) continue;
      transaction.update(cashEntry.ref, {
        quantity: (cashEntry.asset.quantity || 0) + delta,
        updatedAt: now,
      });
    }

    const fromAsset = cashRefs.get(input.fromCashAssetId)?.asset;
    const toAsset = cashRefs.get(input.toCashAssetId)?.asset;
    transaction.update(transferRef, removeUndefinedFields({
      fromCashAssetId: input.fromCashAssetId,
      fromCashAssetName: fromAsset?.name,
      toCashAssetId: input.toCashAssetId,
      toCashAssetName: toAsset?.name,
      amount: input.amount,
      currency: input.currency || fromAsset?.currency || 'EUR',
      date: Timestamp.fromDate(input.date),
      fees,
      purpose: input.purpose ?? 'neutral_transfer',
      notes: input.notes || deleteField(),
      updatedAt: now,
    }));
  });

  if (userId) {
    await invalidateDashboardOverviewSummary(userId, 'internal_transfer_updated');
    appendHouseholdAuditEntrySafe(userId, {
      entityType: 'internalTransfer',
      entityId: transferId,
      action: 'update',
      summary: `Trasferimento aggiornato: ${INTERNAL_TRANSFER_PURPOSE_LABELS[input.purpose ?? 'neutral_transfer']}`,
      after: {
        fromCashAssetId: input.fromCashAssetId,
        toCashAssetId: input.toCashAssetId,
        amount: input.amount,
        purpose: input.purpose ?? 'neutral_transfer',
      },
    });
  }
}

export async function getInternalTransfers(userId: string): Promise<InternalTransfer[]> {
  const transfersRef = collection(db, INTERNAL_TRANSFERS_COLLECTION);
  const q = query(transfersRef, where('userId', '==', userId));
  const snapshot = await getDocs(q);

  return snapshot.docs
    .map(transferDoc => normalizeTransfer(transferDoc.id, transferDoc.data()))
    .sort((a, b) => toDateValue(b.date).getTime() - toDateValue(a.date).getTime());
}

export async function deleteInternalTransfer(transferId: string): Promise<void> {
  const transferRef = doc(db, INTERNAL_TRANSFERS_COLLECTION, transferId);
  let userId: string | undefined;

  await runTransaction(db, async transaction => {
    const transferSnap = await transaction.get(transferRef);
    if (!transferSnap.exists()) {
      return;
    }

    const transfer = normalizeTransfer(transferSnap.id, transferSnap.data());
    userId = transfer.userId;

    const fromRef = doc(db, ASSETS_COLLECTION, transfer.fromCashAssetId);
    const toRef = doc(db, ASSETS_COLLECTION, transfer.toCashAssetId);
    const [fromSnap, toSnap] = await Promise.all([
      transaction.get(fromRef),
      transaction.get(toRef),
    ]);

    if (!fromSnap.exists() || !toSnap.exists()) {
      throw new Error('Cash asset not found');
    }

    const fromAsset = fromSnap.data() as Asset;
    const toAsset = toSnap.data() as Asset;
    if (
      fromAsset.userId !== transfer.userId ||
      toAsset.userId !== transfer.userId ||
      fromAsset.assetClass !== 'cash' ||
      toAsset.assetClass !== 'cash'
    ) {
      throw new Error('Transfer assets are no longer valid cash assets');
    }

    const fees = transfer.fees ?? 0;
    const now = Timestamp.now();
    transaction.update(fromRef, {
      quantity: (fromAsset.quantity || 0) + transfer.amount + fees,
      updatedAt: now,
    });
    transaction.update(toRef, {
      quantity: (toAsset.quantity || 0) - transfer.amount,
      updatedAt: now,
    });
    transaction.delete(transferRef);
  });

  if (userId) {
    await invalidateDashboardOverviewSummary(userId, 'internal_transfer_deleted');
    appendHouseholdAuditEntrySafe(userId, {
      entityType: 'internalTransfer',
      entityId: transferId,
      action: 'delete',
      summary: `Trasferimento eliminato: ${transferId}`,
    });
  } else {
    await deleteDoc(transferRef).catch(() => undefined);
  }
}

export async function markInvestmentOperationExpenseLink(
  operationId: string,
  linkedExpenseId: string
): Promise<void> {
  try {
    await updateDoc(doc(db, INVESTMENT_OPERATIONS_COLLECTION, operationId), {
      linkedExpenseId,
      updatedAt: Timestamp.now(),
    });
  } catch (error) {
    console.error('Failed to link investment operation to expense', {
      operationId,
      linkedExpenseId,
      error: getErrorMessage(error),
    });
    throw error;
  }
}
