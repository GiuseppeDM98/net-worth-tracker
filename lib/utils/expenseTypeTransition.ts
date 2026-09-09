/**
 * Predicates for moving a cashflow entry (or a whole category) across expense types.
 *
 * Two boundaries matter when the type changes:
 *
 * 1. The SIGN boundary. Stored amounts follow one convention app-wide so that a plain
 *    sum() yields net cashflow: income and transfers are stored positive,
 *    fixed/variable/debt are stored negative (see createExpense). A move that crosses
 *    the positive/negative line must flip every stored amount.
 *
 * 2. The TRANSFER boundary. A transfer touches TWO cash accounts (origin +
 *    destination) while every other type touches at most one. Re-typing across this
 *    boundary changes the *shape* of the balance reconciliation, not just the sign:
 *    batch paths refuse it (each row would need its own destination account and
 *    per-row reversal), and single rows cross it only through ExpenseDialog, whose
 *    submit handler reconciles both the old and the new shape.
 */

import { ExpenseType } from '@/types/expenses';

/** True for the types whose amounts are stored positive (income and transfers). */
export function isStoredPositive(type: ExpenseType): boolean {
  return type === 'income' || type === 'transfer';
}

/** True when a type move requires flipping the stored amount sign. */
export function needsSignFlip(oldType: ExpenseType, newType: ExpenseType): boolean {
  return isStoredPositive(oldType) !== isStoredPositive(newType);
}

/** True when a type move crosses the transfer boundary in either direction. */
export function crossesTransferBoundary(oldType: ExpenseType, newType: ExpenseType): boolean {
  return (oldType === 'transfer') !== (newType === 'transfer');
}
