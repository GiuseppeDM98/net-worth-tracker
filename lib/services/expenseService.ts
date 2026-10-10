/**
 * Expense Service
 *
 * Manages expense tracking for budgeting and cashflow analysis.
 *
 * Features:
 * - CRUD operations for expenses (create, read, update, delete)
 * - Recurring expenses (monthly or yearly series of fixed/variable/debt entries)
 * - Installment expenses (BNPL - Buy Now Pay Later)
 * - Monthly summaries and statistics with month-over-month comparison
 * - Category and subcategory management integration
 *
 * Amount sign convention:
 * - Expenses (fixed, variable, debt): stored as negative values
 * - Income: stored as positive values
 * - Transfers: stored as positive values (direction encoded by origin/destination asset IDs)
 * This allows simple summing for net cashflow calculations.
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  Timestamp,
  orderBy,
  limit,
  writeBatch,
  deleteField,
  type DocumentReference,
  type DocumentSnapshot
} from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { removeUndefinedDeep as removeUndefinedFields } from '@/lib/utils/firestoreData';
import { invalidateDashboardOverviewSummary } from '@/lib/services/dashboardOverviewInvalidation';
import { needsSignFlip, crossesTransferBoundary } from '@/lib/utils/expenseTypeTransition';
import { buildRecurrenceDates, resolveRecurrenceFrequency } from '@/lib/utils/recurrenceDates';
import { appliedBalanceEffectsOf, editBalanceEffects, hasDatedEffects, repaysDebt, reverseBalanceEffects, selectLinkableOccurrences, settlesLater, type BalanceEffect, type SettlementRow } from '@/lib/utils/cashSettlement';
import { buildExpenseFeeFormData, type ExpenseFeeCategory, type ExpenseFeePlan } from '@/lib/utils/expenseFee';
import { selectDebtLinkableOccurrences, type DebtRow } from '@/lib/utils/mortgageRepayment';
import {
  Expense,
  ExpenseFormData,
  ExpenseType
} from '@/types/expenses';

const EXPENSES_COLLECTION = 'expenses';

/**
 * Raised by the batch re-typing paths (moveExpensesToCategory,
 * moveExpensesFromSubCategory, updateExpensesType) when a move would cross the
 * transfer boundary with linked expenses: each of those rows touches two cash
 * accounts, so no batch reconciliation of balances is possible. Carries a
 * user-facing message the dialogs surface as-is.
 */
export class TransferBoundaryError extends Error {
  constructor() {
    super(
      'Impossibile convertire in blocco da o verso Trasferimento: ogni voce tocca due conti e i saldi non sarebbero riconciliabili. Modifica le singole voci dal Cashflow.'
    );
    this.name = 'TransferBoundaryError';
  }
}

/**
 * Get all expenses for a specific user
 */
export async function getAllExpenses(userId: string): Promise<Expense[]> {
  try {
    const expensesRef = collection(db, EXPENSES_COLLECTION);
    const q = query(
      expensesRef,
      where('userId', '==', userId),
      orderBy('date', 'desc')
    );

    const querySnapshot = await getDocs(q);

    const expenses = querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      date: doc.data().date?.toDate() || new Date(),
      createdAt: doc.data().createdAt?.toDate() || new Date(),
      updatedAt: doc.data().updatedAt?.toDate() || new Date(),
    })) as Expense[];

    return expenses;
  } catch (error) {
    console.error('Error getting expenses:', error);
    throw new Error('Failed to fetch expenses');
  }
}

/** The dates of the oldest and of the newest expense of an account. */
export interface ExpenseDateBounds {
  oldest: Date;
  newest: Date;
}

/**
 * The dates of the oldest and of the newest expense — two one-document reads on the
 * `(userId, date)` indexes — or null for an account with no expense at all.
 *
 * What a page that reads a WINDOW of the collection (lib/utils/expenseWindows.ts) still needs
 * to know about the rest of it: which years its period picker can offer, and whether an empty
 * window is an empty period or an empty account.
 */
export async function getExpenseDateBounds(userId: string): Promise<ExpenseDateBounds | null> {
  try {
    const expensesRef = collection(db, EXPENSES_COLLECTION);
    // The `userId` filter is what the rules need on a list, at any size (AGENTS.md § Firestore Queries and the Rules).
    const readEdge = (direction: 'asc' | 'desc') =>
      getDocs(query(expensesRef, where('userId', '==', userId), orderBy('date', direction), limit(1)));
    const [oldest, newest] = await Promise.all([readEdge('asc'), readEdge('desc')]);

    const oldestDate: Date | undefined = oldest.docs[0]?.data().date?.toDate();
    const newestDate: Date | undefined = newest.docs[0]?.data().date?.toDate();
    if (!oldestDate || !newestDate) return null;
    return { oldest: oldestDate, newest: newestDate };
  } catch (error) {
    console.error('Error getting expense date bounds:', error);
    throw new Error('Failed to fetch expense date bounds');
  }
}

/**
 * Get expenses in a date range, both ends included.
 *
 * The reader behind every page that shows a window of the collection (`useExpensesInRange`);
 * the bounds come from lib/utils/expenseWindows.ts, never from `Date.UTC`.
 */
export async function getExpensesByDateRange(
  userId: string,
  startDate: Date,
  endDate: Date
): Promise<Expense[]> {
  try {
    const expensesRef = collection(db, EXPENSES_COLLECTION);
    const q = query(
      expensesRef,
      where('userId', '==', userId),
      where('date', '>=', Timestamp.fromDate(startDate)),
      where('date', '<=', Timestamp.fromDate(endDate)),
      orderBy('date', 'desc')
    );

    const querySnapshot = await getDocs(q);

    const expenses = querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      date: doc.data().date?.toDate() || new Date(),
      createdAt: doc.data().createdAt?.toDate() || new Date(),
      updatedAt: doc.data().updatedAt?.toDate() || new Date(),
    })) as Expense[];

    return expenses;
  } catch (error) {
    console.error('Error getting expenses by date range:', error);
    throw new Error('Failed to fetch expenses by date range');
  }
}

/**
 * Create a new expense (single, recurring, or installment)
 *
 * Handles three creation modes based on form data:
 * 1. Installment (BNPL): Creates multiple expenses spread over months with defined amounts
 * 2. Recurring: Creates multiple expenses with the same amount, one per month or per year
 * 3. Single: Creates one expense
 *
 * Priority: Installment > Recurring > Single (installments checked first)
 *
 * @param userId - User ID
 * @param expenseData - Form data with expense details and mode flags
 * @param categoryName - Category name for display
 * @param subCategoryName - Optional subcategory name
 * @returns Single expense ID or array of IDs (for recurring/installments)
 */
export async function createExpense(
  userId: string,
  expenseData: ExpenseFormData,
  categoryName: string,
  subCategoryName?: string
): Promise<string | string[]> {
  const created = await writeExpenseRows(userId, expenseData, categoryName, subCategoryName);
  return created.isSeries ? created.ids : created.ids[0];
}

/**
 * Create an expense of any shape whose linked account(s) move ON THE ROWS' OWN DATES
 * (lib/utils/cashSettlement.ts): every occurrence of a series carries the account, a row dated
 * after today is written `balancePending` and settled by the server on the day. Returns the
 * created ids and the effects of the rows ALREADY happened — applied by the caller in one
 * transaction, so a series saved with three past rows moves the account by those three.
 *
 * `createExpense` keeps the older contract (series linked on the first row only, nothing
 * pending) for the callers that move the balance themselves — a voluntary pension
 * contribution's transfer, recorded and settled by `pensionContributionService`.
 */
export async function createExpenseSettledOnDate(
  userId: string,
  expenseData: ExpenseFormData,
  categoryName: string,
  subCategoryName: string | undefined,
  now: Date,
  fee?: ExpenseFee
): Promise<{ ids: string[]; appliedEffects: BalanceEffect[]; appliedDebtRows: DebtRow[] }> {
  const created = await writeExpenseRows(userId, expenseData, categoryName, subCategoryName, now, fee);
  // The rows already happened that repay a loan: applied by the caller with the balances
  // (lib/services/debtRepaymentService.ts), in date order on the debt as it stands. A fee row
  // never repays anything (it carries no `debtAssetId`).
  const appliedDebtRows = created.rows
    .map((row, index) => ({ ...row, id: created.ids[index] }))
    .filter((row) => repaysDebt(row) && !row.balancePending);
  return { ids: created.ids, appliedEffects: created.rows.flatMap(appliedBalanceEffectsOf), appliedDebtRows };
}

/**
 * The fee a new row (or every occurrence of a new series) carries (lib/utils/expenseFee.ts):
 * its amount, the category from Impostazioni and the note it is born with.
 */
export interface ExpenseFee {
  amount: number;
  category: ExpenseFeeCategory;
  notes: string;
}

/**
 * Carry out an `ExpenseFeePlan` on an EDITED row — the fee row created, updated or deleted — and
 * return the effects on the accounts (for the caller to apply with the row's own, in one
 * transaction) and the id the row must now point at (null: no fee).
 *
 * The fee row follows its parent: its date, its account (a transfer's origin), the amount asked
 * for. An update is an edit like any other (`editBalanceEffects`: what it applied given back, the
 * new effect applied unless its date is still to come); a delete gives back only what was applied.
 * Its category, subcategory and note are the row's own and are never touched by an edit — the
 * owner may have re-filed or re-worded it. A new fee needs the category from Impostazioni.
 */
export async function saveExpenseFee(
  userId: string,
  parent: { id: string; date: Date; currency: string; linkedCashAssetId?: string },
  existingFee: Expense | null,
  plan: ExpenseFeePlan,
  category: ExpenseFeeCategory | null,
  notes: string,
  now: Date
): Promise<{ effects: BalanceEffect[]; feeExpenseId: string | null }> {
  switch (plan.kind) {
    case 'none':
      return { effects: [], feeExpenseId: null };
    case 'delete': {
      if (!existingFee) return { effects: [], feeExpenseId: null };
      await deleteDoc(doc(db, EXPENSES_COLLECTION, existingFee.id));
      await invalidateDashboardOverviewSummary(userId, 'expense_deleted');
      return { effects: reverseBalanceEffects(appliedBalanceEffectsOf(existingFee)), feeExpenseId: null };
    }
    case 'update': {
      if (!existingFee) throw new Error('A fee update needs the fee row it updates');
      const after = { type: existingFee.type, amount: -plan.amount, date: parent.date, linkedCashAssetId: parent.linkedCashAssetId };
      const settlement = editBalanceEffects(existingFee, after, now);
      await updateDoc(doc(db, EXPENSES_COLLECTION, existingFee.id), {
        amount: after.amount,
        date: Timestamp.fromDate(parent.date),
        currency: parent.currency,
        linkedCashAssetId: parent.linkedCashAssetId ?? deleteField(),
        balancePending: settlement.pending ? true : deleteField(),
        updatedAt: new Date(),
      });
      await invalidateDashboardOverviewSummary(userId, 'expense_updated');
      return { effects: settlement.effects, feeExpenseId: existingFee.id };
    }
    case 'create': {
      // The form disables the field without a category, so reaching here without one is a bug in
      // the caller — refused rather than written into a category the owner never chose.
      if (!category) throw new Error('A new fee needs the fee category from Impostazioni');
      const feeData = {
        ...buildExpenseFeeFormData({ date: parent.date, currency: parent.currency, linkedCashAssetId: parent.linkedCashAssetId }, plan.amount, category, notes),
        feeOfTransferId: parent.id,
      };
      const { data, row } = buildSingleExpenseDoc(userId, feeData, category.categoryName, category.subCategoryName, now, new Date());
      const feeRef = await addDoc(collection(db, EXPENSES_COLLECTION), data);
      await invalidateDashboardOverviewSummary(userId, 'expense_created');
      return { effects: appliedBalanceEffectsOf(row), feeExpenseId: feeRef.id };
    }
  }
}

/** A written row, as far as its accounts are concerned. */
type WrittenRow = SettlementRow & { date: Date; isDebtPayoff?: boolean };

interface WrittenRows {
  ids: string[];
  rows: WrittenRow[];
  isSeries: boolean;
}

/** Firestore's ceiling on one `writeBatch`, with room to spare. */
const OPERATIONS_PER_BATCH = 450;

/**
 * Write the given documents in batches under Firestore's 500-operation ceiling: a series of 360
 * instalments with a fee each is 720 documents, which one batch refuses whole.
 */
async function commitInBatches(docs: { ref: DocumentReference; data: Record<string, unknown> }[]): Promise<void> {
  for (let start = 0; start < docs.length; start += OPERATIONS_PER_BATCH) {
    const batch = writeBatch(db);
    for (const { ref, data } of docs.slice(start, start + OPERATIONS_PER_BATCH)) batch.set(ref, data);
    await batch.commit();
  }
}

/**
 * The fee row of ONE written occurrence (lib/utils/expenseFee.ts): the parent's date, currency
 * and account, the fee category's type, pointing at the parent — whose document carries the
 * fee's id (`transferFeeExpenseId`). Returns the document and the row for the balances.
 */
function buildFeeDoc(
  userId: string,
  parentRef: DocumentReference,
  parent: Pick<ExpenseFormData, 'date' | 'currency' | 'linkedCashAssetId'>,
  fee: ExpenseFee,
  settleNow: Date | undefined,
  now: Date
): { ref: DocumentReference; data: Record<string, unknown>; row: WrittenRow } {
  const ref = doc(collection(db, EXPENSES_COLLECTION));
  const feeData = { ...buildExpenseFeeFormData(parent, fee.amount, fee.category, fee.notes), feeOfTransferId: parentRef.id };
  const { data, row } = buildSingleExpenseDoc(userId, feeData, fee.category.categoryName, fee.category.subCategoryName, settleNow, now);
  return { ref, data, row };
}

/**
 * The settlement fields of one row: with `settleNow` a row that moves an account and is dated
 * after today is written `balancePending: true`; without it (the legacy contract) nothing.
 */
function settlementFieldsOf(row: WrittenRow, settleNow: Date | undefined): { balancePending?: true } {
  if (!settleNow || !hasDatedEffects(row)) return {};
  return settlesLater(row.date, settleNow) ? { balancePending: true } : {};
}

/**
 * The document of ONE non-series row, and the row as far as its accounts are concerned (its
 * settlement fields included). Shared by the single-row create and by the transfer-with-fee
 * batch, which writes two such rows at once.
 */
function buildSingleExpenseDoc(
  userId: string,
  expenseData: ExpenseFormData,
  categoryName: string,
  subCategoryName: string | undefined,
  settleNow: Date | undefined,
  now: Date
): { data: Record<string, unknown>; row: WrittenRow } {
  // Apply amount sign convention: expenses negative, income/transfers positive
  // This allows simple sum() for net cashflow without conditional logic
  let amount = Math.abs(expenseData.amount);
  if (expenseData.type !== 'income' && expenseData.type !== 'transfer') {
    amount = -amount;
  }

  const row: WrittenRow = {
    type: expenseData.type,
    amount,
    date: expenseData.date,
    linkedCashAssetId: expenseData.linkedCashAssetId,
    transferCashAssetId: expenseData.transferCashAssetId,
    debtAssetId: expenseData.type === 'debt' ? expenseData.debtAssetId : undefined,
  };
  // The payoff flag rides with the row the caller applies NOW (`applyDebtRepayments` reads it):
  // without it a payoff saved today would be split like an instalment (seen in the browser, 2026-10-10).
  if (row.debtAssetId && expenseData.isDebtPayoff) row.isDebtPayoff = true;
  const settlement = settlementFieldsOf(row, settleNow);
  const data = removeUndefinedFields({
    userId,
    type: expenseData.type,
    categoryId: expenseData.categoryId,
    categoryName,
    subCategoryId: expenseData.subCategoryId,
    subCategoryName,
    amount,
    currency: expenseData.currency,
    date: Timestamp.fromDate(expenseData.date),
    notes: expenseData.notes,
    link: expenseData.link,
    isRecurring: false,
    linkedCashAssetId: expenseData.linkedCashAssetId,
    transferCashAssetId: expenseData.transferCashAssetId,
    debtAssetId: row.debtAssetId,
    // The payoff flag only means something on a row that repays a loan.
    isDebtPayoff: row.debtAssetId && expenseData.isDebtPayoff ? true : undefined,
    ...settlement,
    costCenterId: expenseData.costCenterId,
    costCenterName: expenseData.costCenterName,
    personalMemberId: expenseData.personalMemberId,
    transferFeeExpenseId: expenseData.transferFeeExpenseId,
    feeOfTransferId: expenseData.feeOfTransferId,
    createdAt: now,
    updatedAt: now,
  });
  return { data, row: { ...row, ...settlement } };
}

/**
 * Write the rows of any shape — one row, an instalment plan, a recurring series — and, with a
 * `fee`, the fee row of EACH of them (lib/utils/expenseFee.ts), every pair in the same batch and
 * pointing at each other: a half-written pair would leave a fee nobody can reach from its parent,
 * or a parent naming a fee that does not exist. The fee rows come AFTER the parents in `ids` and
 * `rows`, so a caller indexing the parents by position is unaffected.
 */
async function writeExpenseRows(
  userId: string,
  expenseData: ExpenseFormData,
  categoryName: string,
  subCategoryName: string | undefined,
  settleNow?: Date,
  fee?: ExpenseFee
): Promise<WrittenRows> {
  try {
    const now = new Date();

    // Priority 1: Check installment first (BNPL payments with varying amounts)
    // Installments have priority over recurring since they're more specific
    if (expenseData.isInstallment && expenseData.installmentCount && expenseData.installmentCount > 1) {
      return await createInstallmentExpenses(userId, expenseData, categoryName, subCategoryName, settleNow, fee);
    }

    // Priority 2: Recurring expenses (a fixed amount repeating monthly or yearly)
    if (expenseData.isRecurring && expenseData.recurringCount && expenseData.recurringCount > 0) {
      return await createRecurringExpenses(userId, expenseData, categoryName, subCategoryName, settleNow, fee);
    }

    // Priority 3: Create single expense (with its fee in the same batch, when it has one)
    const expensesRef = collection(db, EXPENSES_COLLECTION);
    const docRef = doc(expensesRef);
    const feeDoc = fee ? buildFeeDoc(userId, docRef, expenseData, fee, settleNow, now) : null;
    const { data: cleanedData, row } = buildSingleExpenseDoc(
      userId,
      feeDoc ? { ...expenseData, transferFeeExpenseId: feeDoc.ref.id } : expenseData,
      categoryName,
      subCategoryName,
      settleNow,
      now
    );

    await commitInBatches([{ ref: docRef, data: cleanedData }, ...(feeDoc ? [{ ref: feeDoc.ref, data: feeDoc.data }] : [])]);
    await invalidateDashboardOverviewSummary(userId, 'expense_created');

    return { ids: [docRef.id, ...(feeDoc ? [feeDoc.ref.id] : [])], rows: [row, ...(feeDoc ? [feeDoc.row] : [])], isSeries: false };
  } catch (error) {
    console.error('Error creating expense:', error);
    throw new Error('Failed to create expense');
  }
}

/**
 * Create a recurring expense series (fixed, variable or debt).
 *
 * The series is MATERIALISED: one real, future-dated document per occurrence, all sharing a
 * `recurringParentId` so they can be deleted together. Nothing downstream evaluates a rule —
 * Cashflow, Analisi, Budget and the assistant all read ordinary expense rows.
 *
 * The occurrence count is capped at `MAX_RECURRENCE_OCCURRENCES` (see recurrenceDates.ts) so the
 * form states a legible number; the write goes in batches under Firestore's 500-operation ceiling
 * (`commitInBatches`), because with a fee each occurrence is two documents.
 *
 * With `settleNow` every occurrence carries the linked account and moves it on its own date
 * (lib/utils/cashSettlement.ts); without it only the first one does, at save (legacy contract).
 *
 * @returns The ids of every created occurrence, in chronological order, then the fees' ids, and the rows written.
 */
async function createRecurringExpenses(
  userId: string,
  expenseData: ExpenseFormData,
  categoryName: string,
  subCategoryName: string | undefined,
  settleNow?: Date,
  fee?: ExpenseFee
): Promise<WrittenRows> {
  try {
    const docs: { ref: DocumentReference; data: Record<string, unknown> }[] = [];
    const feeDocs: ReturnType<typeof buildFeeDoc>[] = [];
    const expensesRef = collection(db, EXPENSES_COLLECTION);
    const createdIds: string[] = [];
    const rows: WrittenRow[] = [];
    const now = new Date();

    // Create parent expense ID for reference
    const parentId = `recurring-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Sign convention: only spending types can recur (canTypeRecur), so the amount is always
    // negative here. Kept as an explicit statement rather than an implicit one — if the set of
    // recurring types ever widens to income or transfers, this line is the one that breaks.
    const amount = -Math.abs(expenseData.amount);

    const recurringFrequency = resolveRecurrenceFrequency(expenseData.recurringFrequency);
    const recurringDay = expenseData.recurringDay || expenseData.date.getDate();
    const dates = buildRecurrenceDates({
      start: expenseData.date,
      frequency: recurringFrequency,
      count: expenseData.recurringCount || 1,
      dayOfMonth: recurringDay,
    });

    dates.forEach((expenseDate, index) => {
      const docRef = doc(expensesRef);
      const linkedCashAssetId = settleNow || index === 0 ? expenseData.linkedCashAssetId : undefined;
      // Like the account, every occurrence carries the loan it repays, each on its own date.
      const debtAssetId = settleNow ? expenseData.debtAssetId : undefined;
      // Each occurrence's own fee, on its own date and account (lib/utils/expenseFee.ts).
      const feeDoc = fee ? buildFeeDoc(userId, docRef, { date: expenseDate, currency: expenseData.currency, linkedCashAssetId }, fee, settleNow, now) : null;
      const row: WrittenRow = { type: expenseData.type, amount, date: expenseDate, linkedCashAssetId, debtAssetId };
      const settlement = settlementFieldsOf(row, settleNow);
      const cleanedData = removeUndefinedFields({
        userId,
        type: expenseData.type,
        categoryId: expenseData.categoryId,
        categoryName,
        subCategoryId: expenseData.subCategoryId,
        subCategoryName,
        amount,
        currency: expenseData.currency,
        date: Timestamp.fromDate(expenseDate),
        notes: expenseData.notes,
        link: expenseData.link,
        isRecurring: true,
        recurringFrequency,
        recurringDay,
        recurringParentId: parentId,
        linkedCashAssetId,
        debtAssetId,
        ...settlement,
        costCenterId: expenseData.costCenterId,
        costCenterName: expenseData.costCenterName,
        // Every occurrence of a series belongs to the same person: ownership is a property
        // of the expense, like the account each occurrence settles on its own date.
        personalMemberId: expenseData.personalMemberId,
        transferFeeExpenseId: feeDoc?.ref.id,
        createdAt: now,
        updatedAt: now,
      });

      docs.push({ ref: docRef, data: cleanedData });
      if (feeDoc) feeDocs.push(feeDoc);
      createdIds.push(docRef.id);
      rows.push({ ...row, ...settlement });
    });

    await commitInBatches([...docs, ...feeDocs.map(({ ref, data }) => ({ ref, data }))]);
    await invalidateDashboardOverviewSummary(userId, 'expense_created');

    return { ids: [...createdIds, ...feeDocs.map((feeDoc) => feeDoc.ref.id)], rows: [...rows, ...feeDocs.map((feeDoc) => feeDoc.row)], isSeries: true };
  } catch (error) {
    console.error('Error creating recurring expenses:', error);
    throw new Error('Failed to create recurring expenses');
  }
}

/**
 * Create installment expenses (for BNPL - Buy Now Pay Later payments)
 *
 * Supports two modes:
 * 1. Auto mode: Divides total amount evenly across installments
 *    - Rounds each installment down to 2 decimals
 *    - Last installment gets remainder to match exact total (prevents rounding errors)
 * 2. Manual mode: Uses user-provided amounts for each installment
 *
 * All installments are linked via a shared parentId for bulk operations.
 *
 * @param userId - User ID
 * @param expenseData - Form data with installment configuration
 * @param categoryName - Category name for display
 * @param subCategoryName - Optional subcategory name
 * With `settleNow` every instalment carries the linked account and moves it on its own date
 * (lib/utils/cashSettlement.ts); without it only the first one does, at save (legacy contract).
 *
 * @returns The created ids and the rows written
 */
async function createInstallmentExpenses(
  userId: string,
  expenseData: ExpenseFormData,
  categoryName: string,
  subCategoryName: string | undefined,
  settleNow?: Date,
  fee?: ExpenseFee
): Promise<WrittenRows> {
  try {
    const docs: { ref: DocumentReference; data: Record<string, unknown> }[] = [];
    const feeDocs: ReturnType<typeof buildFeeDoc>[] = [];
    const expensesRef = collection(db, EXPENSES_COLLECTION);
    const createdIds: string[] = [];
    const rows: WrittenRow[] = [];
    const now = new Date();

    // Generate unique parent ID for linking all installments together
    // This allows bulk operations like "delete all installments in this series"
    const parentId = `installment-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const installmentCount = expenseData.installmentCount!;
    const startDate = expenseData.installmentStartDate || expenseData.date;

    // Calculate amounts based on mode
    let installmentAmounts: number[];
    let totalAmount: number;

    if (expenseData.installmentMode === 'auto') {
      // Auto-calculation: divide total amount evenly across installments
      totalAmount = expenseData.installmentTotalAmount!;
      const perInstallment = totalAmount / installmentCount;
      const baseAmount = Math.floor(perInstallment * 100) / 100; // Round down to 2 decimals
      const remainder = totalAmount - (baseAmount * installmentCount);

      // All installments get base amount except last one
      // Last installment gets base + remainder to ensure total matches exactly
      // (e.g., €100 / 3 = €33.33 + €33.33 + €33.34)
      installmentAmounts = Array(installmentCount - 1).fill(baseAmount);
      installmentAmounts.push(baseAmount + remainder);
    } else {
      // Manual mode: use user-provided amounts (for irregular payment schedules)
      installmentAmounts = expenseData.installmentAmounts!;
      totalAmount = installmentAmounts.reduce((sum, amt) => sum + amt, 0);
    }

    // Ensure amounts are negative for expenses (positive for income)
    const isExpense = expenseData.type !== 'income';
    if (isExpense) {
      installmentAmounts = installmentAmounts.map(amt => -Math.abs(amt));
      totalAmount = -Math.abs(totalAmount);
    }

    // Create one expense document per installment
    for (let i = 0; i < installmentCount; i++) {
      const installmentDate = new Date(startDate);
      installmentDate.setMonth(installmentDate.getMonth() + i);

      const docRef = doc(expensesRef);
      const linkedCashAssetId = settleNow || i === 0 ? expenseData.linkedCashAssetId : undefined;
      const debtAssetId = settleNow ? expenseData.debtAssetId : undefined;
      const feeDoc = fee ? buildFeeDoc(userId, docRef, { date: installmentDate, currency: expenseData.currency, linkedCashAssetId }, fee, settleNow, now) : null;
      const row: WrittenRow = { type: expenseData.type, amount: installmentAmounts[i], date: installmentDate, linkedCashAssetId, debtAssetId };
      const settlement = settlementFieldsOf(row, settleNow);
      const cleanedData = removeUndefinedFields({
        userId,
        type: expenseData.type,
        categoryId: expenseData.categoryId,
        categoryName,
        subCategoryId: expenseData.subCategoryId,
        subCategoryName,
        amount: installmentAmounts[i],
        currency: expenseData.currency,
        date: Timestamp.fromDate(installmentDate),
        notes: expenseData.notes
          ? `${expenseData.notes} (Installment ${i + 1}/${installmentCount})`
          : `Installment ${i + 1}/${installmentCount}`,
        link: expenseData.link,

        // Installment-specific fields
        isInstallment: true,
        installmentParentId: parentId,
        installmentNumber: i + 1,
        installmentTotal: installmentCount,
        installmentTotalAmount: totalAmount,

        linkedCashAssetId,
        debtAssetId,
        ...settlement,
        costCenterId: expenseData.costCenterId,
        costCenterName: expenseData.costCenterName,
        // Every occurrence of a series belongs to the same person: ownership is a property
        // of the expense, like the account each occurrence settles on its own date.
        personalMemberId: expenseData.personalMemberId,
        transferFeeExpenseId: feeDoc?.ref.id,

        createdAt: now,
        updatedAt: now,
      });

      docs.push({ ref: docRef, data: cleanedData });
      if (feeDoc) feeDocs.push(feeDoc);
      createdIds.push(docRef.id);
      rows.push({ ...row, ...settlement });
    }

    await commitInBatches([...docs, ...feeDocs.map(({ ref, data }) => ({ ref, data }))]);
    await invalidateDashboardOverviewSummary(userId, 'expense_created');

    console.log(`Created ${installmentCount} installment expenses with parent ID: ${parentId}`);
    return { ids: [...createdIds, ...feeDocs.map((feeDoc) => feeDoc.ref.id)], rows: [...rows, ...feeDocs.map((feeDoc) => feeDoc.row)], isSeries: true };
  } catch (error) {
    console.error('Error creating installment expenses:', error);
    throw new Error('Failed to create installment expenses');
  }
}

/**
 * Delete all expenses in an installment series
 * @param userId - Owner of the series
 * @param installmentParentId - The parent ID linking all installments
 *
 * SCOPED BY userId, and it has to be: `firestore.rules` guards `expenses` with
 * `canAccess(resource.data.userId)`, and Firestore refuses a LIST whose constraints do not
 * already guarantee the rule holds. A query on the parent id alone comes back
 * `permission-denied` at any result size (verified on the emulator), so the series would read
 * as empty and the delete would silently do nothing.
 */
export async function deleteInstallmentExpenses(
  userId: string,
  installmentParentId: string
): Promise<void> {
  try {
    const expensesRef = collection(db, EXPENSES_COLLECTION);
    const q = query(
      expensesRef,
      where('userId', '==', userId),
      where('installmentParentId', '==', installmentParentId)
    );

    const querySnapshot = await getDocs(q);
    await deleteSeriesDocuments(querySnapshot.docs);
    await invalidateDashboardOverviewSummary(userId, 'expense_deleted');
    console.log(`Deleted ${querySnapshot.size} installment expenses with parent ID: ${installmentParentId}`);
  } catch (error) {
    console.error('Error deleting installment expenses:', error);
    throw new Error('Failed to delete installment expenses');
  }
}

/**
 * Update an existing expense
 */
export async function updateExpense(
  expenseId: string,
  updates: Partial<ExpenseFormData>,
  categoryName?: string,
  subCategoryName?: string
): Promise<void> {
  try {
    const expenseRef = doc(db, EXPENSES_COLLECTION, expenseId);
    const existingExpense = await getDoc(expenseRef);

    // If amount is being updated, ensure correct sign
    let updatedAmount = updates.amount;
    if (updatedAmount !== undefined && updates.type) {
      updatedAmount = Math.abs(updatedAmount);
      if (updates.type !== 'income' && updates.type !== 'transfer') {
        updatedAmount = -updatedAmount;
      }
    }

    const cleanedUpdates = removeUndefinedFields({
      ...updates,
      amount: updatedAmount,
      categoryName,
      subCategoryName,
      date: updates.date ? Timestamp.fromDate(updates.date) : undefined,
      linkedCashAssetId: updates.linkedCashAssetId,
      transferCashAssetId: updates.transferCashAssetId,
      updatedAt: new Date(),
    });

    await updateDoc(expenseRef, cleanedUpdates);
    const userId = existingExpense.data()?.userId as string | undefined;
    if (userId) {
      await invalidateDashboardOverviewSummary(userId, 'expense_updated');
    }
  } catch (error) {
    console.error('Error updating expense:', error);
    throw new Error('Failed to update expense');
  }
}

/**
 * Delete an expense
 */
export async function deleteExpense(expenseId: string): Promise<void> {
  try {
    const expenseRef = doc(db, EXPENSES_COLLECTION, expenseId);
    const existingExpense = await getDoc(expenseRef);
    await deleteDoc(expenseRef);
    const userId = existingExpense.data()?.userId as string | undefined;
    if (userId) {
      await invalidateDashboardOverviewSummary(userId, 'expense_deleted');
    }
  } catch (error) {
    console.error('Error deleting expense:', error);
    throw new Error('Failed to delete expense');
  }
}

/** A stored expense document as the app reads it: Timestamps converted to Dates. */
function expenseFromSnapshot(snapshot: DocumentSnapshot): Expense {
  const data = snapshot.data()!;
  return {
    id: snapshot.id,
    ...data,
    date: data.date?.toDate() || new Date(),
    createdAt: data.createdAt?.toDate() || new Date(),
    updatedAt: data.updatedAt?.toDate() || new Date(),
  } as Expense;
}

/**
 * The fee row a row created (lib/utils/expenseFee.ts), as stored, or null — the row has no fee,
 * or the fee was deleted by hand since. Read before an edit (the form shows its amount) and
 * before a delete (the fee goes with its parent).
 */
export async function getFeeOf(expense: Pick<Expense, 'transferFeeExpenseId'>): Promise<Expense | null> {
  if (!expense.transferFeeExpenseId) return null;
  const snapshot = await getDoc(doc(db, EXPENSES_COLLECTION, expense.transferFeeExpenseId));
  return snapshot.exists() ? expenseFromSnapshot(snapshot) : null;
}

/**
 * The fee rows of the given rows (a whole series), as stored: ONE `in` query per 30 parents
 * (`chunkForInQuery`), with the `userId` the rules need. A caller deleting a series reverses
 * their balances with the series' own (`reverseAppliedBalances`) before the delete.
 */
export async function getFeesOf(userId: string, rows: Pick<Expense, 'id' | 'transferFeeExpenseId'>[]): Promise<Expense[]> {
  const parentIds = rows.filter((row) => !!row.transferFeeExpenseId).map((row) => row.id);
  if (parentIds.length === 0) return [];
  const perChunk = await Promise.all(
    chunkForInQuery(parentIds).map(async (ids) => {
      const snapshot = await getDocs(query(collection(db, EXPENSES_COLLECTION), where('userId', '==', userId), where('feeOfTransferId', 'in', ids)));
      return snapshot.docs.map((docSnapshot) => expenseFromSnapshot(docSnapshot));
    })
  );
  return perChunk.flat();
}

/**
 * Delete rows that go together — a row and its fee (`rowsDeletedWith`) — in ONE batch. The
 * caller gives back their applied balances first (`reverseAppliedBalances`), as for any delete.
 *
 * A fee row deleted WITHOUT its parent (deleted by hand from the list) unlinks itself from it
 * in the same batch, so the parent never points at a row that is gone.
 */
export async function deleteExpenseRows(userId: string, rows: Expense[]): Promise<void> {
  try {
    const deletedIds = new Set(rows.map((row) => row.id));
    const batch = writeBatch(db);
    for (const row of rows) batch.delete(doc(db, EXPENSES_COLLECTION, row.id));
    for (const row of rows) {
      if (!row.feeOfTransferId || deletedIds.has(row.feeOfTransferId)) continue;
      const parentRef = doc(db, EXPENSES_COLLECTION, row.feeOfTransferId);
      // An update on a missing document fails the whole batch: a parent already gone needs nothing.
      if ((await getDoc(parentRef)).exists()) {
        batch.update(parentRef, { transferFeeExpenseId: deleteField(), updatedAt: new Date() });
      }
    }
    await batch.commit();
    await invalidateDashboardOverviewSummary(userId, 'expense_deleted');
  } catch (error) {
    console.error('Error deleting expense rows:', error);
    throw new Error('Failed to delete expense');
  }
}

/**
 * Delete the documents of a whole series — the occurrences the query returns and the fee row of
 * each (`transferFeeExpenseId`) — in batches under Firestore's ceiling. The balances were given
 * back by the caller (`reverseAppliedBalances` over the series AND its fees, `getFeesOf`).
 */
async function deleteSeriesDocuments(docs: DocumentSnapshot[]): Promise<void> {
  const refs = docs.flatMap((docSnapshot) => {
    const feeId = docSnapshot.data()?.transferFeeExpenseId as string | undefined;
    return feeId ? [docSnapshot.ref, doc(db, EXPENSES_COLLECTION, feeId)] : [docSnapshot.ref];
  });
  for (let start = 0; start < refs.length; start += OPERATIONS_PER_BATCH) {
    const batch = writeBatch(db);
    for (const ref of refs.slice(start, start + OPERATIONS_PER_BATCH)) batch.delete(ref);
    await batch.commit();
  }
}

/**
 * Delete all recurring expenses with the same parent ID
 * @param userId - Owner of the series
 * @param recurringParentId - The shared parent ID of the recurring series
 *
 * SCOPED BY userId, and it has to be: `firestore.rules` guards `expenses` with
 * `canAccess(resource.data.userId)`, and Firestore refuses a LIST whose constraints do not
 * already guarantee the rule holds. A query on the parent id alone comes back
 * `permission-denied` at any result size (verified on the emulator), so the series would read
 * as empty and the delete would silently do nothing.
 */
export async function deleteRecurringExpenses(
  userId: string,
  recurringParentId: string
): Promise<void> {
  try {
    const expensesRef = collection(db, EXPENSES_COLLECTION);
    const q = query(
      expensesRef,
      where('userId', '==', userId),
      where('recurringParentId', '==', recurringParentId)
    );

    const querySnapshot = await getDocs(q);
    await deleteSeriesDocuments(querySnapshot.docs);
    await invalidateDashboardOverviewSummary(userId, 'expense_deleted');
  } catch (error) {
    console.error('Error deleting recurring expenses:', error);
    throw new Error('Failed to delete recurring expenses');
  }
}


/**
 * Calculate total income for a period
 */
export function calculateTotalIncome(expenses: Expense[]): number {
  return expenses
    .filter(expense => expense.type === 'income')
    .reduce((total, expense) => total + expense.amount, 0);
}

/** Expense types that count as real spending (excludes income and transfers). */
export const COUNTABLE_EXPENSE_TYPES: ExpenseType[] = ['fixed', 'variable', 'debt'];

/** Returns true if the expense is a real spending entry (not income or transfer). */
export function isCountableExpense(e: Expense): boolean {
  return COUNTABLE_EXPENSE_TYPES.includes(e.type);
}

/**
 * Calculate total expenses for a period.
 * Only counts real spending types (fixed, variable, debt) — excludes income and transfers.
 */
export function calculateTotalExpenses(expenses: Expense[]): number {
  return expenses
    .filter(isCountableExpense)
    .reduce((total, expense) => total + Math.abs(expense.amount), 0);
}

/**
 * Calculate net balance (income - expenses)
 */
export function calculateNetBalance(expenses: Expense[]): number {
  return calculateTotalIncome(expenses) - calculateTotalExpenses(expenses);
}

/**
 * Count expenses associated with a category
 */
export async function getExpenseCountByCategoryId(
  categoryId: string,
  userId: string
): Promise<number> {
  try {
    const expensesRef = collection(db, EXPENSES_COLLECTION);
    const q = query(
      expensesRef,
      where('userId', '==', userId),
      where('categoryId', '==', categoryId)
    );

    const querySnapshot = await getDocs(q);
    return querySnapshot.size;
  } catch (error) {
    console.error('Error counting expenses by category:', error);
    throw new Error('Failed to count expenses by category');
  }
}

/**
 * Count expenses associated with a subcategory
 */
export async function getExpenseCountBySubCategoryId(
  categoryId: string,
  subCategoryId: string,
  userId: string
): Promise<number> {
  try {
    const expensesRef = collection(db, EXPENSES_COLLECTION);
    const q = query(
      expensesRef,
      where('userId', '==', userId),
      where('categoryId', '==', categoryId),
      where('subCategoryId', '==', subCategoryId)
    );

    const querySnapshot = await getDocs(q);
    return querySnapshot.size;
  } catch (error) {
    console.error('Error counting expenses by subcategory:', error);
    throw new Error('Failed to count expenses by subcategory');
  }
}

/**
 * Update all expenses when a category name changes
 */
export async function updateExpensesCategoryName(
  categoryId: string,
  newCategoryName: string,
  userId: string
): Promise<void> {
  try {
    const expensesRef = collection(db, EXPENSES_COLLECTION);
    const q = query(
      expensesRef,
      where('userId', '==', userId),
      where('categoryId', '==', categoryId)
    );

    const querySnapshot = await getDocs(q);

    if (querySnapshot.empty) {
      return; // No expenses to update
    }

    const batch = writeBatch(db);

    querySnapshot.docs.forEach(docSnapshot => {
      batch.update(docSnapshot.ref, {
        categoryName: newCategoryName,
        updatedAt: new Date(),
      });
    });

    await batch.commit();
    // The Panoramica prints category names from the rows: a renamed category is a changed input.
    await invalidateDashboardOverviewSummary(userId, 'expense_category_renamed');
  } catch (error) {
    console.error('Error updating expenses category name:', error);
    throw new Error('Failed to update expenses category name');
  }
}


/**
 * Reassign all expenses from one category to another
 */
export async function reassignExpensesCategory(
  oldCategoryId: string,
  newCategoryId: string,
  newCategoryName: string,
  userId: string,
  newSubCategoryId?: string,
  newSubCategoryName?: string
): Promise<number> {
  try {
    const expensesRef = collection(db, EXPENSES_COLLECTION);
    const q = query(
      expensesRef,
      where('userId', '==', userId),
      where('categoryId', '==', oldCategoryId)
    );

    const querySnapshot = await getDocs(q);

    if (querySnapshot.empty) {
      return 0; // No expenses to reassign
    }

    const batch = writeBatch(db);
    let count = 0;

    querySnapshot.docs.forEach(docSnapshot => {
      const updates: Record<string, unknown> = {
        categoryId: newCategoryId,
        categoryName: newCategoryName,
        updatedAt: new Date(),
      };

      // If new subcategory is provided, update it; otherwise clear it
      if (newSubCategoryId && newSubCategoryName) {
        updates.subCategoryId = newSubCategoryId;
        updates.subCategoryName = newSubCategoryName;
      } else {
        updates.subCategoryId = null;
        updates.subCategoryName = null;
      }

      batch.update(docSnapshot.ref, removeUndefinedFields(updates));
      count++;
    });

    await batch.commit();
    await invalidateDashboardOverviewSummary(userId, 'expense_category_reassigned');
    return count;
  } catch (error) {
    console.error('Error reassigning expenses category:', error);
    throw new Error('Failed to reassign expenses category');
  }
}

/**
 * Clear category assignment from expenses when category is deleted without reassignment
 */
export async function clearExpensesCategoryAssignment(
  categoryId: string,
  userId: string
): Promise<number> {
  try {
    const expensesRef = collection(db, EXPENSES_COLLECTION);
    const q = query(
      expensesRef,
      where('userId', '==', userId),
      where('categoryId', '==', categoryId)
    );

    const querySnapshot = await getDocs(q);

    if (querySnapshot.empty) {
      return 0; // No expenses to update
    }

    const batch = writeBatch(db);
    let count = 0;

    querySnapshot.docs.forEach(docSnapshot => {
      const updates: Record<string, unknown> = {
        categoryId: 'uncategorized',
        categoryName: 'Uncategorized',
        subCategoryId: null,
        subCategoryName: null,
        updatedAt: new Date(),
      };

      batch.update(docSnapshot.ref, removeUndefinedFields(updates));
      count++;
    });

    await batch.commit();
    await invalidateDashboardOverviewSummary(userId, 'expense_category_cleared');
    return count;
  } catch (error) {
    console.error('Error clearing expenses category assignment:', error);
    throw new Error('Failed to clear expenses category assignment');
  }
}

/**
 * Reassign all expenses from one subcategory to another (or to no subcategory)
 */
export async function reassignExpensesSubCategory(
  categoryId: string,
  oldSubCategoryId: string,
  userId: string,
  newSubCategoryId?: string,
  newSubCategoryName?: string
): Promise<number> {
  try {
    const expensesRef = collection(db, EXPENSES_COLLECTION);
    const q = query(
      expensesRef,
      where('userId', '==', userId),
      where('categoryId', '==', categoryId),
      where('subCategoryId', '==', oldSubCategoryId)
    );

    const querySnapshot = await getDocs(q);

    if (querySnapshot.empty) {
      return 0; // No expenses to reassign
    }

    const batch = writeBatch(db);
    let count = 0;

    querySnapshot.docs.forEach(docSnapshot => {
      const updates: Record<string, unknown> = {
        updatedAt: new Date(),
      };

      // If new subcategory is provided, update it; otherwise clear it
      if (newSubCategoryId && newSubCategoryName) {
        updates.subCategoryId = newSubCategoryId;
        updates.subCategoryName = newSubCategoryName;
      } else {
        updates.subCategoryId = null;
        updates.subCategoryName = null;
      }

      batch.update(docSnapshot.ref, removeUndefinedFields(updates));
      count++;
    });

    await batch.commit();
    return count;
  } catch (error) {
    console.error('Error reassigning expenses subcategory:', error);
    throw new Error('Failed to reassign expenses subcategory');
  }
}

/**
 * Move all expenses from one category to another, updating type for cross-type moves.
 *
 * Unlike reassignExpensesCategory (used during deletion), this preserves the source
 * category and also updates the expense `type` field to match the destination category.
 * When crossing the positive/negative sign boundary, flips the amount sign to maintain
 * the sign convention (income/transfer = positive, expenses = negative).
 * Refuses to cross the transfer boundary when expenses exist (TransferBoundaryError).
 */
export async function moveExpensesToCategory(
  oldCategoryId: string,
  oldType: ExpenseType,
  newCategoryId: string,
  newCategoryName: string,
  newType: ExpenseType,
  userId: string,
  newSubCategoryId?: string,
  newSubCategoryName?: string
): Promise<number> {
  try {
    const expensesRef = collection(db, EXPENSES_COLLECTION);
    const q = query(
      expensesRef,
      where('userId', '==', userId),
      where('categoryId', '==', oldCategoryId)
    );

    const querySnapshot = await getDocs(q);

    if (querySnapshot.empty) {
      return 0;
    }

    if (crossesTransferBoundary(oldType, newType)) {
      throw new TransferBoundaryError();
    }

    const flipSign = needsSignFlip(oldType, newType);
    const batch = writeBatch(db);
    let count = 0;

    querySnapshot.docs.forEach(docSnapshot => {
      const updates: Record<string, unknown> = {
        categoryId: newCategoryId,
        categoryName: newCategoryName,
        type: newType,
        updatedAt: new Date(),
      };

      // Flip amount sign when crossing the positive/negative boundary
      if (flipSign) {
        const currentAmount = docSnapshot.data().amount;
        updates.amount = -currentAmount;
      }

      if (newSubCategoryId && newSubCategoryName) {
        updates.subCategoryId = newSubCategoryId;
        updates.subCategoryName = newSubCategoryName;
      } else {
        updates.subCategoryId = null;
        updates.subCategoryName = null;
      }

      batch.update(docSnapshot.ref, removeUndefinedFields(updates));
      count++;
    });

    await batch.commit();
    await invalidateDashboardOverviewSummary(userId, 'expense_category_moved');
    return count;
  } catch (error) {
    if (error instanceof TransferBoundaryError) throw error;
    console.error('Error moving expenses to category:', error);
    throw new Error('Failed to move expenses to category');
  }
}

/**
 * Move all expenses from a specific subcategory to another category/subcategory.
 *
 * Supports cross-category and cross-type moves. Source subcategory is preserved.
 * When crossing the positive/negative sign boundary, flips the amount sign.
 * Refuses to cross the transfer boundary when expenses exist (TransferBoundaryError).
 */
export async function moveExpensesFromSubCategory(
  oldCategoryId: string,
  oldSubCategoryId: string,
  oldType: ExpenseType,
  newCategoryId: string,
  newCategoryName: string,
  newType: ExpenseType,
  userId: string,
  newSubCategoryId?: string,
  newSubCategoryName?: string
): Promise<number> {
  try {
    const expensesRef = collection(db, EXPENSES_COLLECTION);
    const q = query(
      expensesRef,
      where('userId', '==', userId),
      where('categoryId', '==', oldCategoryId),
      where('subCategoryId', '==', oldSubCategoryId)
    );

    const querySnapshot = await getDocs(q);

    if (querySnapshot.empty) {
      return 0;
    }

    if (crossesTransferBoundary(oldType, newType)) {
      throw new TransferBoundaryError();
    }

    const flipSign = needsSignFlip(oldType, newType);
    const batch = writeBatch(db);
    let count = 0;

    querySnapshot.docs.forEach(docSnapshot => {
      const updates: Record<string, unknown> = {
        categoryId: newCategoryId,
        categoryName: newCategoryName,
        type: newType,
        updatedAt: new Date(),
      };

      // Flip amount sign when crossing the positive/negative boundary
      if (flipSign) {
        const currentAmount = docSnapshot.data().amount;
        updates.amount = -currentAmount;
      }

      if (newSubCategoryId && newSubCategoryName) {
        updates.subCategoryId = newSubCategoryId;
        updates.subCategoryName = newSubCategoryName;
      } else {
        updates.subCategoryId = null;
        updates.subCategoryName = null;
      }

      batch.update(docSnapshot.ref, removeUndefinedFields(updates));
      count++;
    });

    await batch.commit();
    await invalidateDashboardOverviewSummary(userId, 'expense_category_moved');
    return count;
  } catch (error) {
    if (error instanceof TransferBoundaryError) throw error;
    console.error('Error moving expenses from subcategory:', error);
    throw new Error('Failed to move expenses from subcategory');
  }
}

/**
 * Batch-update the type of all expenses in a category when the category type changes.
 *
 * Keeps categoryId and categoryName unchanged — only updates the `type` field
 * and flips amount signs when crossing the positive/negative sign boundary.
 * Refuses to cross the transfer boundary when expenses exist (TransferBoundaryError).
 *
 * @param categoryId - The category whose expenses need updating
 * @param oldType - Previous category type
 * @param newType - New category type
 * @param userId - Owner of the expenses
 * @returns Number of expenses updated
 */
export async function updateExpensesType(
  categoryId: string,
  oldType: ExpenseType,
  newType: ExpenseType,
  userId: string
): Promise<number> {
  try {
    const expensesRef = collection(db, EXPENSES_COLLECTION);
    const q = query(
      expensesRef,
      where('userId', '==', userId),
      where('categoryId', '==', categoryId)
    );

    const querySnapshot = await getDocs(q);

    if (querySnapshot.empty) {
      return 0;
    }

    if (crossesTransferBoundary(oldType, newType)) {
      throw new TransferBoundaryError();
    }

    const flipSign = needsSignFlip(oldType, newType);
    const batch = writeBatch(db);
    let count = 0;

    querySnapshot.docs.forEach(docSnapshot => {
      const updates: Record<string, unknown> = {
        type: newType,
        updatedAt: new Date(),
      };

      if (flipSign) {
        const currentAmount = docSnapshot.data().amount as number;
        updates.amount = -currentAmount;
      }

      batch.update(docSnapshot.ref, updates);
      count++;
    });

    await batch.commit();
    await invalidateDashboardOverviewSummary(userId, 'expense_category_type_changed');
    return count;
  } catch (error) {
    if (error instanceof TransferBoundaryError) throw error;
    console.error('Error updating expense types in category:', error);
    throw new Error('Failed to update expense types');
  }
}

/**
 * Fetch all expenses in a recurring series by parent ID.
 *
 * Used before deleting a series to identify which entries had a linked cash asset
 * so the asset balance can be reversed before deletion.
 *
 * @param userId - Owner of the series
 * @param recurringParentId - The shared parent ID of the recurring series
 *
 * SCOPED BY userId, and it has to be: `firestore.rules` guards `expenses` with
 * `canAccess(resource.data.userId)`, and Firestore refuses a LIST whose constraints do not
 * already guarantee the rule holds. A query on the parent id alone comes back
 * `permission-denied` at any result size (verified on the emulator), so the series would read
 * as empty and the delete would silently do nothing.
 */
export async function getExpensesByRecurringParentId(
  userId: string,
  recurringParentId: string
): Promise<Expense[]> {
  try {
    const expensesRef = collection(db, EXPENSES_COLLECTION);
    const q = query(
      expensesRef,
      where('userId', '==', userId),
      where('recurringParentId', '==', recurringParentId)
    );
    const snapshot = await getDocs(q);

    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      date: doc.data().date?.toDate() || new Date(),
      createdAt: doc.data().createdAt?.toDate() || new Date(),
      updatedAt: doc.data().updatedAt?.toDate() || new Date(),
    })) as Expense[];
  } catch (error) {
    console.error('Error fetching recurring series expenses:', error);
    throw new Error('Failed to fetch recurring series expenses');
  }
}

/**
 * Fetch all expenses in an installment series by parent ID.
 *
 * Used before deleting a series to identify which entries had a linked cash asset
 * so the asset balance can be reversed before deletion.
 *
 * @param userId - Owner of the series
 * @param installmentParentId - The shared parent ID of the installment series
 *
 * SCOPED BY userId, and it has to be: `firestore.rules` guards `expenses` with
 * `canAccess(resource.data.userId)`, and Firestore refuses a LIST whose constraints do not
 * already guarantee the rule holds. A query on the parent id alone comes back
 * `permission-denied` at any result size (verified on the emulator), so the series would read
 * as empty and the delete would silently do nothing.
 */
export async function getExpensesByInstallmentParentId(
  userId: string,
  installmentParentId: string
): Promise<Expense[]> {
  try {
    const expensesRef = collection(db, EXPENSES_COLLECTION);
    const q = query(
      expensesRef,
      where('userId', '==', userId),
      where('installmentParentId', '==', installmentParentId)
    );
    const snapshot = await getDocs(q);

    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      date: doc.data().date?.toDate() || new Date(),
      createdAt: doc.data().createdAt?.toDate() || new Date(),
      updatedAt: doc.data().updatedAt?.toDate() || new Date(),
    })) as Expense[];
  } catch (error) {
    console.error('Error fetching installment series expenses:', error);
    throw new Error('Failed to fetch installment series expenses');
  }
}

/**
 * The rows of the series a row belongs to (an instalment plan or a recurring series), or just
 * the row itself when it belongs to none.
 */
export async function getSeriesOf(userId: string, expense: Expense): Promise<Expense[]> {
  if (expense.isInstallment && expense.installmentParentId) return getExpensesByInstallmentParentId(userId, expense.installmentParentId);
  if (expense.isRecurring && expense.recurringParentId) return getExpensesByRecurringParentId(userId, expense.recurringParentId);
  return [expense];
}

/**
 * «Collega la serie»: link the occurrences of `expense`'s series that are still to come (and have
 * not moved an account) to `cashAssetId`, each waiting for its own date — the server settles it on
 * the day (lib/server/cashSettlement.ts). Occurrences already happened are left as they are
 * (`selectLinkableOccurrences`). One batch: a series is capped under 500 rows. Returns how many
 * occurrences were linked.
 */
export async function linkSeriesToCashAccount(userId: string, expense: Expense, cashAssetId: string, now: Date): Promise<number> {
  const linkable = selectLinkableOccurrences(await getSeriesOf(userId, expense), now);
  if (linkable.length === 0) return 0;
  const batch = writeBatch(db);
  for (const row of linkable) {
    batch.update(doc(db, EXPENSES_COLLECTION, row.id), { linkedCashAssetId: cashAssetId, balancePending: true, updatedAt: new Date() });
  }
  await batch.commit();
  await invalidateDashboardOverviewSummary(userId, 'expense_updated');
  return linkable.length;
}

/** Firestore's ceiling on the values of one `in` filter. */
export const FIRESTORE_IN_LIMIT = 30;

/** Split ids into the chunks one `in` filter accepts (30): 31 ids are two queries. */
export function chunkForInQuery<T>(ids: readonly T[], limit: number = FIRESTORE_IN_LIMIT): T[][] {
  const chunks: T[][] = [];
  for (let start = 0; start < ids.length; start += limit) chunks.push(ids.slice(start, start + limit));
  return chunks;
}

/**
 * The instalments linked to the given properties (`debtAssetId`), for Patrimonio's «Mutuo» tile
 * (lib/utils/mortgageSummary.ts). ONE query for every property (2026-09-29 — it used to be
 * one per property): `userId`, which `firestore.rules` needs on every list, and `debtAssetId in
 * [...]`; two `.where()` calls, so no composite index is involved. Firestore takes at most 30
 * values in an `in` filter, so past that the ids go in chunks of 30, read in parallel.
 */
export async function getMortgageInstalments(userId: string, propertyIds: string[]): Promise<Expense[]> {
  const perChunk = await Promise.all(
    chunkForInQuery(propertyIds).map(async (ids) => {
      const snapshot = await getDocs(query(collection(db, EXPENSES_COLLECTION), where('userId', '==', userId), where('debtAssetId', 'in', ids)));
      return snapshot.docs.map((docSnapshot) => expenseFromSnapshot(docSnapshot));
    })
  );
  return perChunk.flat();
}

/**
 * «Collega la serie al mutuo»: link the occurrences of `expense`'s series still to come to the
 * property `debtAssetId`, each repaying its principal on its own date (lib/utils/mortgageRepayment.ts,
 * settled by the server like an account). The past is never touched: the debt typed on the property
 * already reflects it. Returns how many occurrences were linked.
 */
export async function linkSeriesToDebt(userId: string, expense: Expense, debtAssetId: string, now: Date): Promise<number> {
  const linkable = selectDebtLinkableOccurrences(await getSeriesOf(userId, expense), now);
  if (linkable.length === 0) return 0;
  const batch = writeBatch(db);
  for (const row of linkable) {
    batch.update(doc(db, EXPENSES_COLLECTION, row.id), { debtAssetId, balancePending: true, updatedAt: new Date() });
  }
  await batch.commit();
  await invalidateDashboardOverviewSummary(userId, 'expense_updated');
  return linkable.length;
}
