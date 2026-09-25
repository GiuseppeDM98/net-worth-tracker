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
  writeBatch,
  deleteField,
  type DocumentSnapshot
} from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { removeUndefinedDeep as removeUndefinedFields } from '@/lib/utils/firestoreData';
import { invalidateDashboardOverviewSummary } from '@/lib/services/dashboardOverviewInvalidation';
import { needsSignFlip, crossesTransferBoundary } from '@/lib/utils/expenseTypeTransition';
import { buildRecurrenceDates, resolveRecurrenceFrequency } from '@/lib/utils/recurrenceDates';
import { appliedBalanceEffectsOf, editBalanceEffects, hasDatedEffects, repaysDebt, reverseBalanceEffects, selectLinkableOccurrences, settlesLater, type BalanceEffect, type SettlementRow } from '@/lib/utils/cashSettlement';
import { buildTransferFeeFormData, type TransferFeeCategory, type TransferFeePlan } from '@/lib/utils/transferFee';
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

/**
 * Get expenses in a date range
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
  now: Date
): Promise<{ ids: string[]; appliedEffects: BalanceEffect[]; appliedDebtRows: DebtRow[] }> {
  const created = await writeExpenseRows(userId, expenseData, categoryName, subCategoryName, now);
  // The rows already happened that repay a property: applied by the caller with the balances
  // (lib/services/debtRepaymentService.ts), in date order on the debt as it stands.
  const appliedDebtRows = created.rows
    .map((row, index) => ({ ...row, id: created.ids[index] }))
    .filter((row) => repaysDebt(row) && !row.balancePending);
  return { ids: created.ids, appliedEffects: created.rows.flatMap(appliedBalanceEffectsOf), appliedDebtRows };
}

/**
 * Create a transfer and the fee row it carries (lib/utils/transferFee.ts) in ONE batch, each
 * pointing at the other: a half-written pair would leave a fee nobody can reach from its
 * transfer, or a transfer naming a fee that does not exist. The fee row debits the transfer's
 * origin on the transfer's date, and both rows move their accounts on that date — a transfer
 * dated today moves its two balances and the fee's at once, one dated later waits with both
 * rows `balancePending`. Returns both ids (transfer first) and the effects of the rows ALREADY
 * happened, applied by the caller in one transaction, as `createExpenseSettledOnDate` does.
 */
export async function createTransferWithFee(
  userId: string,
  transferData: ExpenseFormData,
  categoryName: string,
  subCategoryName: string | undefined,
  fee: { amount: number; category: TransferFeeCategory; notes: string },
  now: Date
): Promise<{ ids: string[]; appliedEffects: BalanceEffect[]; appliedDebtRows: DebtRow[] }> {
  try {
    const expensesRef = collection(db, EXPENSES_COLLECTION);
    const transferRef = doc(expensesRef);
    const feeRef = doc(expensesRef);
    const writtenAt = new Date();

    const transfer = buildSingleExpenseDoc(userId, { ...transferData, transferFeeExpenseId: feeRef.id }, categoryName, subCategoryName, now, writtenAt);
    const feeData = { ...buildTransferFeeFormData(transferData, fee.amount, fee.category, fee.notes), feeOfTransferId: transferRef.id };
    const feeRow = buildSingleExpenseDoc(userId, feeData, fee.category.categoryName, fee.category.subCategoryName, now, writtenAt);

    const batch = writeBatch(db);
    batch.set(transferRef, transfer.data);
    batch.set(feeRef, feeRow.data);
    await batch.commit();
    await invalidateDashboardOverviewSummary(userId, 'expense_created');

    // Neither row is a mortgage instalment: a transfer repays no debt, and a fee is a cost.
    return { ids: [transferRef.id, feeRef.id], appliedEffects: [transfer.row, feeRow.row].flatMap(appliedBalanceEffectsOf), appliedDebtRows: [] };
  } catch (error) {
    console.error('Error creating transfer with fee:', error);
    throw new Error('Failed to create transfer with fee');
  }
}

/**
 * Carry out a `TransferFeePlan` on an EDITED transfer — the fee row created, updated or deleted —
 * and return the effects on the accounts (for the caller to apply with the transfer's own, in one
 * transaction) and the id the transfer must now point at (null: no fee).
 *
 * The fee row follows the transfer: its date, its origin account, the amount asked for. An update
 * is an edit like any other (`editBalanceEffects`: what it applied given back, the new effect
 * applied unless its date is still to come); a delete gives back only what was applied. Its
 * category, subcategory and note are the row's own and are never touched by an edit — the owner
 * may have re-filed or re-worded it. A new fee needs the category from Impostazioni.
 */
export async function saveTransferFee(
  userId: string,
  transfer: { id: string; date: Date; currency: string; linkedCashAssetId?: string },
  existingFee: Expense | null,
  plan: TransferFeePlan,
  category: TransferFeeCategory | null,
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
      const after = { type: existingFee.type, amount: -plan.amount, date: transfer.date, linkedCashAssetId: transfer.linkedCashAssetId };
      const settlement = editBalanceEffects(existingFee, after, now);
      await updateDoc(doc(db, EXPENSES_COLLECTION, existingFee.id), {
        amount: after.amount,
        date: Timestamp.fromDate(transfer.date),
        currency: transfer.currency,
        linkedCashAssetId: transfer.linkedCashAssetId ?? deleteField(),
        balancePending: settlement.pending ? true : deleteField(),
        updatedAt: new Date(),
      });
      await invalidateDashboardOverviewSummary(userId, 'expense_updated');
      return { effects: settlement.effects, feeExpenseId: existingFee.id };
    }
    case 'create': {
      // The form disables the field without a category, so reaching here without one is a bug in
      // the caller — refused rather than written into a category the owner never chose.
      if (!category) throw new Error('A new transfer fee needs the fee category from Impostazioni');
      const feeData = {
        ...buildTransferFeeFormData({ date: transfer.date, currency: transfer.currency, linkedCashAssetId: transfer.linkedCashAssetId }, plan.amount, category, notes),
        feeOfTransferId: transfer.id,
      };
      const { data, row } = buildSingleExpenseDoc(userId, feeData, category.categoryName, category.subCategoryName, now, new Date());
      const feeRef = await addDoc(collection(db, EXPENSES_COLLECTION), data);
      await invalidateDashboardOverviewSummary(userId, 'expense_created');
      return { effects: appliedBalanceEffectsOf(row), feeExpenseId: feeRef.id };
    }
  }
}

/** A written row, as far as its accounts are concerned. */
type WrittenRow = SettlementRow & { date: Date };

interface WrittenRows {
  ids: string[];
  rows: WrittenRow[];
  isSeries: boolean;
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

async function writeExpenseRows(
  userId: string,
  expenseData: ExpenseFormData,
  categoryName: string,
  subCategoryName: string | undefined,
  settleNow?: Date
): Promise<WrittenRows> {
  try {
    const now = new Date();

    // Priority 1: Check installment first (BNPL payments with varying amounts)
    // Installments have priority over recurring since they're more specific
    if (expenseData.isInstallment && expenseData.installmentCount && expenseData.installmentCount > 1) {
      return await createInstallmentExpenses(userId, expenseData, categoryName, subCategoryName, settleNow);
    }

    // Priority 2: Recurring expenses (a fixed amount repeating monthly or yearly)
    if (expenseData.isRecurring && expenseData.recurringCount && expenseData.recurringCount > 0) {
      return await createRecurringExpenses(userId, expenseData, categoryName, subCategoryName, settleNow);
    }

    // Priority 3: Create single expense
    const expensesRef = collection(db, EXPENSES_COLLECTION);
    const { data: cleanedData, row } = buildSingleExpenseDoc(userId, expenseData, categoryName, subCategoryName, settleNow, now);

    const docRef = await addDoc(expensesRef, cleanedData);
    await invalidateDashboardOverviewSummary(userId, 'expense_created');

    return { ids: [docRef.id], rows: [row], isSeries: false };
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
 * The whole batch is committed at once, which is why the occurrence count is capped at
 * `MAX_RECURRENCE_OCCURRENCES` (see recurrenceDates.ts): a `writeBatch` takes at most 500
 * operations, and `deleteRecurringExpenses` has the same ceiling on the way out.
 *
 * With `settleNow` every occurrence carries the linked account and moves it on its own date
 * (lib/utils/cashSettlement.ts); without it only the first one does, at save (legacy contract).
 *
 * @returns The ids of every created occurrence, in chronological order, and the rows written.
 */
async function createRecurringExpenses(
  userId: string,
  expenseData: ExpenseFormData,
  categoryName: string,
  subCategoryName: string | undefined,
  settleNow?: Date
): Promise<WrittenRows> {
  try {
    const batch = writeBatch(db);
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
      // Like the account, every occurrence carries the property it repays, each on its own date.
      const debtAssetId = settleNow ? expenseData.debtAssetId : undefined;
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
        createdAt: now,
        updatedAt: now,
      });

      batch.set(docRef, cleanedData);
      createdIds.push(docRef.id);
      rows.push({ ...row, ...settlement });
    });

    await batch.commit();
    await invalidateDashboardOverviewSummary(userId, 'expense_created');

    return { ids: createdIds, rows, isSeries: true };
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
  settleNow?: Date
): Promise<WrittenRows> {
  try {
    const batch = writeBatch(db);
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

        createdAt: now,
        updatedAt: now,
      });

      batch.set(docRef, cleanedData);
      createdIds.push(docRef.id);
      rows.push({ ...row, ...settlement });
    }

    await batch.commit();
    await invalidateDashboardOverviewSummary(userId, 'expense_created');

    console.log(`Created ${installmentCount} installment expenses with parent ID: ${parentId}`);
    return { ids: createdIds, rows, isSeries: true };
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
    const batch = writeBatch(db);

    querySnapshot.docs.forEach(docSnapshot => {
      batch.delete(docSnapshot.ref);
    });

    await batch.commit();
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
 * The fee row a transfer created (lib/utils/transferFee.ts), as stored, or null — the row is not
 * a transfer with a fee, or the fee was deleted by hand since. Read before an edit (the form
 * shows its amount) and before a delete (the fee goes with its transfer).
 */
export async function getTransferFeeOf(expense: Pick<Expense, 'type' | 'transferFeeExpenseId'>): Promise<Expense | null> {
  if (expense.type !== 'transfer' || !expense.transferFeeExpenseId) return null;
  const snapshot = await getDoc(doc(db, EXPENSES_COLLECTION, expense.transferFeeExpenseId));
  return snapshot.exists() ? expenseFromSnapshot(snapshot) : null;
}

/**
 * Delete rows that go together — a transfer and its fee (`rowsDeletedWith`) — in ONE batch. The
 * caller gives back their applied balances first (`reverseAppliedBalances`), as for any delete.
 *
 * A fee row deleted WITHOUT its transfer (deleted by hand from the list) unlinks itself from it
 * in the same batch, so the transfer never points at a row that is gone.
 */
export async function deleteExpenseRows(userId: string, rows: Expense[]): Promise<void> {
  try {
    const deletedIds = new Set(rows.map((row) => row.id));
    const batch = writeBatch(db);
    for (const row of rows) batch.delete(doc(db, EXPENSES_COLLECTION, row.id));
    for (const row of rows) {
      if (!row.feeOfTransferId || deletedIds.has(row.feeOfTransferId)) continue;
      const transferRef = doc(db, EXPENSES_COLLECTION, row.feeOfTransferId);
      // An update on a missing document fails the whole batch: a transfer already gone needs nothing.
      if ((await getDoc(transferRef)).exists()) {
        batch.update(transferRef, { transferFeeExpenseId: deleteField(), updatedAt: new Date() });
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
    const batch = writeBatch(db);

    querySnapshot.docs.forEach(docSnapshot => {
      batch.delete(docSnapshot.ref);
    });

    await batch.commit();
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

/**
 * The instalments linked to each of the given properties (`debtAssetId`), for Patrimonio's «Mutuo»
 * tile (lib/utils/mortgageSummary.ts). One query per property with two equalities — `userId`,
 * which `firestore.rules` needs on every list, and the property — the same shape as a series
 * lookup, so no composite index is involved.
 */
export async function getMortgageInstalments(userId: string, propertyIds: string[]): Promise<Expense[]> {
  const perProperty = await Promise.all(
    propertyIds.map(async (propertyId) => {
      const snapshot = await getDocs(query(collection(db, EXPENSES_COLLECTION), where('userId', '==', userId), where('debtAssetId', '==', propertyId)));
      return snapshot.docs.map((docSnapshot) => expenseFromSnapshot(docSnapshot));
    })
  );
  return perProperty.flat();
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
