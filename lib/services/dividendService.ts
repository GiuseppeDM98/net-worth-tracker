import 'server-only';

import { adminDb } from '@/lib/firebase/admin';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { Dividend, DividendFormData } from '@/types/dividend';
import { resolveEcbRateToEur } from '@/lib/server/tradeFxService';
import { resolveDividendFx, type DividendFxInput, type DividendFxResolution } from '@/lib/utils/dividendFx';
import { TradeFxError } from '@/lib/utils/tradeFx';
import { removeUndefinedDeep as removeUndefinedFields } from '@/lib/utils/firestoreData';
import { getItalyDateIso, getItalyDayBoundsUtc } from '@/lib/utils/dateHelpers';

const DIVIDENDS_COLLECTION = 'dividends';

/**
 * Get all dividends for a specific user
 * Sorted by payment date (most recent first)
 */
export async function getAllDividends(userId: string): Promise<Dividend[]> {
  try {
    console.log('[dividendService] getAllDividends called for userId:', userId);
    const querySnapshot = await adminDb
      .collection(DIVIDENDS_COLLECTION)
      .where('userId', '==', userId)
      .orderBy('paymentDate', 'desc')
      .get();

    console.log('[dividendService] Query successful, docs count:', querySnapshot.size);

    const dividends = querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      exDate: doc.data().exDate?.toDate() || new Date(),
      paymentDate: doc.data().paymentDate?.toDate() || new Date(),
      createdAt: doc.data().createdAt?.toDate() || new Date(),
      updatedAt: doc.data().updatedAt?.toDate() || new Date(),
    })) as Dividend[];

    console.log('[dividendService] Returning', dividends.length, 'dividends');
    return dividends;
  } catch (error) {
    console.error('[dividendService] Error getting dividends:', error);
    console.error('[dividendService] Error details:', {
      name: (error as Error).name,
      message: (error as Error).message,
      stack: (error as Error).stack,
    });
    throw error;
  }
}

/**
 * Get dividends for a specific asset
 * Sorted by payment date (most recent first)
 */
export async function getDividendsByAsset(
  userId: string,
  assetId: string
): Promise<Dividend[]> {
  try {
    const querySnapshot = await adminDb
      .collection(DIVIDENDS_COLLECTION)
      .where('userId', '==', userId)
      .where('assetId', '==', assetId)
      .orderBy('paymentDate', 'desc')
      .get();

    const dividends = querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      exDate: doc.data().exDate?.toDate() || new Date(),
      paymentDate: doc.data().paymentDate?.toDate() || new Date(),
      createdAt: doc.data().createdAt?.toDate() || new Date(),
      updatedAt: doc.data().updatedAt?.toDate() || new Date(),
    })) as Dividend[];

    return dividends;
  } catch (error) {
    console.error('Error getting dividends by asset:', error);
    throw new Error('Failed to fetch dividends by asset');
  }
}

/**
 * Get dividends in a date range
 * Sorted by payment date (most recent first)
 */
export async function getDividendsByDateRange(
  userId: string,
  startDate: Date,
  endDate: Date
): Promise<Dividend[]> {
  try {
    const querySnapshot = await adminDb
      .collection(DIVIDENDS_COLLECTION)
      .where('userId', '==', userId)
      .where('paymentDate', '>=', Timestamp.fromDate(startDate))
      .where('paymentDate', '<=', Timestamp.fromDate(endDate))
      .orderBy('paymentDate', 'desc')
      .get();

    const dividends = querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      exDate: doc.data().exDate?.toDate() || new Date(),
      paymentDate: doc.data().paymentDate?.toDate() || new Date(),
      createdAt: doc.data().createdAt?.toDate() || new Date(),
      updatedAt: doc.data().updatedAt?.toDate() || new Date(),
    })) as Dividend[];

    return dividends;
  } catch (error) {
    console.error('Error getting dividends by date range:', error);
    throw new Error('Failed to fetch dividends by date range');
  }
}

/**
 * Get a single dividend by ID
 */
export async function getDividendById(dividendId: string): Promise<Dividend | null> {
  try {
    const dividendDoc = await adminDb
      .collection(DIVIDENDS_COLLECTION)
      .doc(dividendId)
      .get();

    if (!dividendDoc.exists) {
      return null;
    }

    return {
      id: dividendDoc.id,
      ...dividendDoc.data(),
      exDate: dividendDoc.data()?.exDate?.toDate() || new Date(),
      paymentDate: dividendDoc.data()?.paymentDate?.toDate() || new Date(),
      createdAt: dividendDoc.data()?.createdAt?.toDate() || new Date(),
      updatedAt: dividendDoc.data()?.updatedAt?.toDate() || new Date(),
    } as Dividend;
  } catch (error) {
    console.error('Error getting dividend:', error);
    throw new Error('Failed to fetch dividend');
  }
}

/**
 * Compute a deterministic Firestore document ID for auto-generated dividends.
 * Format: {assetId}_{YYYY-MM-DD}_{dividendType}
 *
 * Using a deterministic ID makes concurrent writes idempotent: if the cron job
 * fires twice simultaneously, both writes target the same document ID and
 * last-write-wins produces exactly one document instead of two duplicates.
 *
 * Only used for isAutoGenerated=true dividends. Manual dividends use .add() (random ID).
 *
 * The day is the ITALIAN one (2026-11-24): the cron stores a coupon at Italian midnight (23:00 UTC
 * of the day before) and the asset form at UTC midnight, so a UTC key gave one coupon two ids.
 */
function buildDeterministicDividendId(assetId: string, exDate: Date, dividendType: string): string {
  const dateStr = getItalyDateIso(exDate); // "YYYY-MM-DD"
  return `${assetId}_${dateStr}_${dividendType}`;
}

/**
 * Create a new dividend
 *
 * Features:
 * - Automatically calculates netAmount if not provided (user convenience, avoids manual calculation errors)
 * - Converts a non-EUR record at the ECB rate of its PAYMENT day, or from the euro credited
 *   (`settledNetEur`), and keeps the rate and its source (2026-11-23, lib/utils/dividendFx.ts)
 * - Continues without conversion when no rate can be read (graceful degradation - better to save dividend without EUR data than fail completely)
 * - Auto-generated dividends use deterministic document IDs to prevent duplicates from concurrent cron runs
 *
 * @param userId - User ID
 * @param dividendData - Dividend form data
 * @param assetTicker - Asset ticker symbol
 * @param assetName - Asset display name
 * @param assetIsin - Optional ISIN code
 * @param isAutoGenerated - Whether dividend was auto-generated (e.g., from scraping)
 * @returns Created dividend ID
 * @throws TradeFxError untouched when the credited euro net is refused (`total-off`, `nothing-to-convert`):
 *   the routes answer it with a 422 and its sentence
 */
export async function createDividend(
  userId: string,
  dividendData: DividendFormData,
  assetTicker: string,
  assetName: string,
  assetIsin?: string,
  isAutoGenerated: boolean = false
): Promise<string> {
  try {
    const now = new Date();

    // Auto-calculate netAmount if not already set
    // User convenience: avoid manual calculation errors (gross - tax = net)
    const netAmount = dividendData.netAmount || (dividendData.grossAmount - dividendData.taxAmount);

    // Convert dates to Date objects if they're strings
    const exDate = dividendData.exDate instanceof Date
      ? dividendData.exDate
      : new Date(dividendData.exDate);
    const paymentDate = dividendData.paymentDate instanceof Date
      ? dividendData.paymentDate
      : new Date(dividendData.paymentDate);

    // The euro side of a foreign record: every stat, chart and report reads euro. An EUR record
    // has none, and a credited euro net sent with it means nothing (dropped).
    const isEur = dividendData.currency.toUpperCase() === 'EUR';
    const fx = isEur
      ? undefined
      : await resolveDividendFxOrNone(dividendData.currency, paymentDate, {
          grossAmount: dividendData.grossAmount,
          netAmount,
          foreignTaxAmount: dividendData.foreignTaxAmount ?? 0,
          settledNetEur: dividendData.settledNetEur,
        });

    const cleanedData = removeUndefinedFields({
      userId,
      assetId: dividendData.assetId,
      assetTicker,
      assetName,
      assetIsin,
      exDate: Timestamp.fromDate(exDate),
      paymentDate: Timestamp.fromDate(paymentDate),
      dividendPerShare: dividendData.dividendPerShare,
      quantity: dividendData.quantity,
      grossAmount: dividendData.grossAmount,
      taxAmount: dividendData.taxAmount,
      netAmount,
      currency: dividendData.currency,
      dividendType: dividendData.dividendType,
      notes: dividendData.notes,
      isAutoGenerated,
      // Provisional flag for inflation-linked coupons still awaiting their announced FOI rate.
      // Stripped by removeUndefinedFields for manual/equity dividends (always undefined there).
      isProvisional: dividendData.isProvisional,
      // Historical cost basis snapshot: asset.averageCost at time of dividend creation.
      // Undefined for dividends created before this field was introduced.
      costPerShare: dividendData.costPerShare,
      foreignTaxAmount: dividendData.foreignTaxAmount,
      settledNetEur: isEur ? undefined : dividendData.settledNetEur,
      ...(fx ?? {}),
      createdAt: now,
      updatedAt: now,
    });

    let docId: string;
    if (isAutoGenerated) {
      // Deterministic ID makes concurrent writes idempotent.
      // .set() on an existing doc is last-write-wins — safe since
      // concurrent writes produce identical data.
      docId = buildDeterministicDividendId(
        dividendData.assetId,
        exDate,
        dividendData.dividendType
      );
      await adminDb.collection(DIVIDENDS_COLLECTION).doc(docId).set(cleanedData);
    } else {
      // Manual dividends: preserve random ID behaviour
      const docRef = await adminDb.collection(DIVIDENDS_COLLECTION).add(cleanedData);
      docId = docRef.id;
    }

    return docId;
  } catch (error) {
    // A refused credit is the owner's to correct, not a failure: the routes turn it into a 422.
    if (error instanceof TradeFxError) throw error;
    console.error('Error creating dividend:', error);
    throw new Error('Failed to create dividend');
  }
}

/**
 * The euro side of a foreign record at the ECB rate of its payment day (or from the credit), or
 * undefined when no rate can be read at all — the record is then saved without euro fields, as
 * before 2026-11-23. A refused credit is rethrown.
 */
async function resolveDividendFxOrNone(
  currency: string,
  paymentDate: Date,
  amounts: Omit<DividendFxInput, 'ecb'>
): Promise<DividendFxResolution | undefined> {
  const ecb = await resolveEcbRateToEur(currency, paymentDate);
  try {
    return resolveDividendFx({ ...amounts, ecb });
  } catch (error) {
    if (error instanceof TradeFxError && error.code === 'no-rate') {
      console.error(`[dividendService] No EUR rate for ${currency}: saved without the euro fields`);
      return undefined;
    }
    throw error;
  }
}

/** What an update may carry: the form's fields, `null` to remove an optional one, the income link. */
export type DividendUpdateData = Omit<Partial<DividendFormData>, 'foreignTaxAmount' | 'settledNetEur'> & {
  foreignTaxAmount?: number | null;
  settledNetEur?: number | null;
} & Pick<Dividend, 'expenseId'>;

/** The keys an edit converts again on; any other (a note, the income link) never reads a rate. */
const FX_INPUT_KEYS = ['currency', 'grossAmount', 'taxAmount', 'netAmount', 'foreignTaxAmount', 'settledNetEur', 'paymentDate'] as const;

/** The euro fields an EUR record never carries. */
const EURO_FIELDS = ['grossAmountEur', 'taxAmountEur', 'netAmountEur', 'foreignTaxAmountEur', 'exchangeRate', 'fxSource', 'settledNetEur'] as const;

/** Two amounts are the same figure unless they differ beyond binary noise. */
const sameAmount = (a: number | undefined, b: number | undefined) =>
  a === undefined || b === undefined ? a === b : Math.abs(a - b) < 1e-9;

/** A `{ toDate }` stand-in, a Timestamp or a Date, as a Date. */
const storedDate = (value: unknown): Date | undefined =>
  value instanceof Date ? value : (value as { toDate?: () => Date } | undefined)?.toDate?.();

/**
 * Update an existing dividend.
 *
 * The form sends every field at every save, so the rate is resolved again only when a MERGED value
 * of the currency, the gross, the net, the foreign tax, the credit or the Italian payment day
 * DIFFERS from the stored one (2026-11-23): converting at each save would move the income of a
 * record already cashed. An absent key keeps the stored value, `null` removes `foreignTaxAmount` or
 * `settledNetEur`; a merged currency of EUR removes the euro fields.
 *
 * @throws TradeFxError untouched when the credited euro net is refused, like createDividend
 */
export async function updateDividend(
  dividendId: string,
  // expenseId is not a form field: only the income sync writes it, to link (or unlink)
  // the expense row it created for this dividend. Passing the key with `undefined` is
  // the unlink — see the delete sentinel below; omitting the key leaves the link alone.
  updates: DividendUpdateData
): Promise<void> {
  try {
    // Convert dates to Date objects if they're strings, then to Timestamps
    const exDate = updates.exDate
      ? (updates.exDate instanceof Date ? updates.exDate : new Date(updates.exDate))
      : undefined;
    const paymentDate = updates.paymentDate
      ? (updates.paymentDate instanceof Date ? updates.paymentDate : new Date(updates.paymentDate))
      : undefined;

    // Recalculate netAmount if gross or tax amounts changed
    let netAmount = updates.netAmount;
    if (updates.grossAmount !== undefined && updates.taxAmount !== undefined && !netAmount) {
      netAmount = updates.grossAmount - updates.taxAmount;
    }

    const docRef = adminDb.collection(DIVIDENDS_COLLECTION).doc(dividendId);
    const fxUpdates = FX_INPUT_KEYS.some((key) => key in updates)
      ? await resolveFxUpdates(docRef, updates, netAmount, paymentDate)
      : {};

    // A present-but-undefined `expenseId` is the unlink request. `removeUndefinedFields` would
    // drop the key and the stale link would survive the write, so it becomes the Admin delete
    // sentinel — a class instance the deep clean keeps. The `in` guard is what keeps a partial
    // caller (the PATCH route, a price refresh) that simply omits the field from wiping it.
    const expenseIdUpdate =
      'expenseId' in updates && updates.expenseId === undefined ? { expenseId: FieldValue.delete() } : {};

    const cleanedUpdates = removeUndefinedFields({
      ...updates,
      ...expenseIdUpdate,
      netAmount,
      exDate: exDate ? Timestamp.fromDate(exDate) : undefined,
      paymentDate: paymentDate ? Timestamp.fromDate(paymentDate) : undefined,
      ...fxUpdates,
      updatedAt: new Date(),
    });

    await docRef.update(cleanedUpdates);
  } catch (error) {
    if (error instanceof TradeFxError) throw error;
    console.error('Error updating dividend:', error);
    throw new Error('Failed to update dividend');
  }
}

/**
 * The fields an update writes beside the form's: the removals (`null`) as delete sentinels, and
 * the euro side converted again — only when a merged figure differs from the stored record.
 */
async function resolveFxUpdates(
  docRef: FirebaseFirestore.DocumentReference,
  updates: DividendUpdateData,
  netAmount: number | undefined,
  paymentDate: Date | undefined
): Promise<Record<string, unknown>> {
  const stored = (await docRef.get()).data() ?? {};
  const removals: Record<string, unknown> = {};
  if (updates.foreignTaxAmount === null) removals.foreignTaxAmount = FieldValue.delete();
  if (updates.settledNetEur === null) removals.settledNetEur = FieldValue.delete();

  const pick = <T>(sent: T | null | undefined, kept: T | undefined) => (sent === null ? undefined : sent ?? kept);
  const merged = {
    currency: (updates.currency ?? stored.currency ?? 'EUR') as string,
    grossAmount: pick(updates.grossAmount, stored.grossAmount as number | undefined) ?? 0,
    netAmount: pick(netAmount, stored.netAmount as number | undefined) ?? 0,
    foreignTaxAmount: pick(updates.foreignTaxAmount, stored.foreignTaxAmount as number | undefined),
    settledNetEur: pick(updates.settledNetEur, stored.settledNetEur as number | undefined),
    paymentDate: paymentDate ?? storedDate(stored.paymentDate) ?? new Date(),
  };

  if (merged.currency.toUpperCase() === 'EUR') {
    return { ...removals, ...Object.fromEntries(EURO_FIELDS.map((field) => [field, FieldValue.delete()])) };
  }

  const storedPayment = storedDate(stored.paymentDate);
  const changed =
    merged.currency !== stored.currency ||
    !sameAmount(merged.grossAmount, stored.grossAmount) ||
    !sameAmount(merged.netAmount, stored.netAmount) ||
    !sameAmount(merged.foreignTaxAmount, stored.foreignTaxAmount) ||
    !sameAmount(merged.settledNetEur, stored.settledNetEur) ||
    !storedPayment ||
    getItalyDateIso(merged.paymentDate) !== getItalyDateIso(storedPayment);
  if (!changed) return removals;

  const fx = await resolveDividendFxOrNone(merged.currency, merged.paymentDate, {
    grossAmount: merged.grossAmount,
    netAmount: merged.netAmount,
    foreignTaxAmount: merged.foreignTaxAmount ?? 0,
    settledNetEur: merged.settledNetEur,
  });
  return { ...removals, ...(fx ?? {}) };
}

/**
 * On its payment day, before its income is built: a foreign record converted at a rate that was
 * not the day's — `'ecb-latest'` (announced for a later day), or none at all (saved before
 * 2026-11-23, owner's decision) — is converted again at the payment day's ECB rate and written.
 * A record with a credited net, one already at the day's rate and an EUR one are returned as
 * they are, with no read. With no rate it is returned unchanged: the income takes the euro figures
 * it has.
 */
export async function reconvertAtPaymentDay(dividend: Dividend): Promise<Dividend> {
  if (dividend.currency.toUpperCase() === 'EUR' || dividend.settledNetEur !== undefined || dividend.fxSource === 'ecb') {
    return dividend;
  }
  const ecb = await resolveEcbRateToEur(dividend.currency, dividend.paymentDate);
  if (!ecb) {
    console.error(`[dividendService] No EUR rate for ${dividend.currency} on the payment day of ${dividend.id}`);
    return dividend;
  }
  const fx = resolveDividendFx({
    grossAmount: dividend.grossAmount,
    netAmount: dividend.netAmount,
    foreignTaxAmount: dividend.foreignTaxAmount ?? 0,
    ecb,
  });
  await adminDb.collection(DIVIDENDS_COLLECTION).doc(dividend.id).update({ ...fx, updatedAt: new Date() });
  return { ...dividend, ...fx };
}

/**
 * Delete a dividend
 */
export async function deleteDividend(dividendId: string): Promise<void> {
  try {
    await adminDb
      .collection(DIVIDENDS_COLLECTION)
      .doc(dividendId)
      .delete();
  } catch (error) {
    console.error('Error deleting dividend:', error);
    throw new Error('Failed to delete dividend');
  }
}

/**
 * Check if a dividend already exists for an asset on a specific ex-date
 *
 * Uses same-day range logic (00:00:00 to 23:59:59) to match dividends with the same ex-date,
 * even if the exact timestamp differs slightly. This prevents duplicate imports from scraping.
 *
 * @param userId - User ID
 * @param assetId - Asset ID
 * @param exDate - Ex-dividend date to check
 * @returns True if duplicate exists, false otherwise
 */
export async function isDuplicateDividend(
  userId: string,
  assetId: string,
  exDate: Date
): Promise<boolean> {
  try {
    // The ITALIAN day of the ex-date (2026-11-24), never the process zone's: on Vercel that is
    // UTC, and a coupon stored at Italian midnight (23:00 UTC of the day before) missed the same
    // coupon stored at UTC midnight by the asset form — the cron then created it a second time.
    const { start: startOfDay, end: endOfDay } = getItalyDayBoundsUtc(exDate);

    const querySnapshot = await adminDb
      .collection(DIVIDENDS_COLLECTION)
      .where('userId', '==', userId)
      .where('assetId', '==', assetId)
      .where('exDate', '>=', Timestamp.fromDate(startOfDay))
      .where('exDate', '<=', Timestamp.fromDate(endOfDay))
      .get();

    return !querySnapshot.empty;
  } catch (error) {
    console.error('Error checking duplicate dividend:', error);
    throw new Error('Failed to check duplicate dividend');
  }
}

/**
 * Delete all upcoming auto-generated coupon dividends for an asset.
 *
 * Used before generating a new next-coupon entry when bond details change
 * (e.g., rate update, quantity change, frequency change).
 *
 * Why: We store only the "next" coupon per bond. On any asset update,
 * we delete the old upcoming coupon and regenerate with new parameters.
 *
 * A CASHED coupon (expenseId) is never deleted (owner, 2026-11-24): «upcoming» starts at the
 * Italian day, so the coupon paid today is a candidate, and deleting it would take its income
 * row with it. The caller then creates no second coupon on a day that still holds one.
 *
 * @param userId - User ID (security filter)
 * @param assetId - Asset ID to clean up coupons for
 */
export async function deleteUpcomingCouponsForAsset(
  userId: string,
  assetId: string
): Promise<void> {
  // From the start of the ITALIAN day (2026-11-24): the process zone's midnight is UTC on Vercel.
  const now = getItalyDayBoundsUtc().start;

  const querySnapshot = await adminDb
    .collection(DIVIDENDS_COLLECTION)
    .where('userId', '==', userId)
    .where('assetId', '==', assetId)
    .where('dividendType', '==', 'coupon')
    .where('isAutoGenerated', '==', true)
    .where('paymentDate', '>=', Timestamp.fromDate(now))
    .get();

  const pending = querySnapshot.docs.filter((doc) => !doc.data().expenseId);
  if (pending.length === 0) return;

  const batch = adminDb.batch();
  pending.forEach((doc) => batch.delete(doc.ref));
  await batch.commit();
}

/**
 * Deletes all auto-generated finalPremium dividends for an asset.
 * Called before regenerating the final premium when bond details change.
 * No date filter: there is at most one finalPremium per asset.
 *
 * Side effect: any cashflow expense linked to a deleted premium (expenseId) is
 * removed in the same batch, mirroring deleteUpcomingCouponsForAsset.
 */
export async function deleteUpcomingFinalPremiumForAsset(
  userId: string,
  assetId: string
): Promise<void> {
  const querySnapshot = await adminDb
    .collection(DIVIDENDS_COLLECTION)
    .where('userId', '==', userId)
    .where('assetId', '==', assetId)
    .where('dividendType', '==', 'finalPremium')
    .where('isAutoGenerated', '==', true)
    .get();

  if (querySnapshot.empty) return;

  const batch = adminDb.batch();
  querySnapshot.docs.forEach(doc => {
    const expenseId = doc.data().expenseId as string | undefined;
    if (expenseId) {
      batch.delete(adminDb.collection('expenses').doc(expenseId));
    }
    batch.delete(doc.ref);
  });
  await batch.commit();
}
