/**
 * When a cashflow row moves the balance of its account — the ONE rule, shared by the expense form,
 * the deletes, «Collega la serie» and the server job that settles what came due.
 *
 * A row linked to an account moves it ON ITS OWN DATE (owner, 2026-09-19). Until then the row
 * carries `balancePending: true` and moves nothing; the day its Italian calendar date arrives the
 * server settles it (`lib/server/cashSettlement.ts`, run before every snapshot) and clears the
 * flag. Before this rule a series moved its account ONCE, for its first row, the day it was saved,
 * and the other occurrences never at all — a mortgage entered in January for the whole year left
 * the account eleven instalments too high by December — and a single row dated in the future moved
 * the account the day it was typed.
 *
 * The flag's ABSENCE means «applied» for a linked row: every row written before the rule moved its
 * account at save time, so no migration is needed and nothing old is ever applied twice.
 *
 * The same date, and the same flag, govern the OTHER thing a row can move: a `debt` row linked to a
 * property (`debtAssetId`) pays down its debt on its date (lib/utils/mortgageRepayment.ts). One
 * flag for both, so a row is never half-settled.
 *
 * SDK-free: plain rows in, balance effects out.
 */

import type { Expense } from '@/types/expenses';
import { getItalyDateIso } from '@/lib/utils/dateHelpers';

/** What a row does to one account: `delta` euro added to its balance (negative = debited). */
export interface BalanceEffect {
  assetId: string;
  delta: number;
}

/** The fields that decide a row's effect on the accounts. */
export type SettlementRow = Pick<Expense, 'type' | 'amount' | 'linkedCashAssetId' | 'transferCashAssetId' | 'debtAssetId'> & {
  balancePending?: boolean;
};

/**
 * A row dated AFTER today (Italian calendar day) waits for its date; today's and past rows move the
 * account at once. The same boundary as Tracciamento's «in calendario» (`isScheduledRow`).
 */
export function settlesLater(date: Date, now: Date): boolean {
  return getItalyDateIso(date) > getItalyDateIso(now);
}

/**
 * The effect of a row on its accounts, whether or not it has been applied: a transfer debits its
 * origin and credits its destination by the (positive) amount; any other row adds its signed
 * amount — income positive, spending negative — to the linked account. No account, no effect.
 */
export function balanceEffectsOf(row: SettlementRow): BalanceEffect[] {
  if (row.type === 'transfer') {
    const amount = Math.abs(row.amount);
    const effects: BalanceEffect[] = [];
    if (row.linkedCashAssetId) effects.push({ assetId: row.linkedCashAssetId, delta: -amount });
    if (row.transferCashAssetId) effects.push({ assetId: row.transferCashAssetId, delta: amount });
    return effects;
  }
  return row.linkedCashAssetId ? [{ assetId: row.linkedCashAssetId, delta: row.amount }] : [];
}

/** The effect a row HAS HAD on its accounts: none while it waits for its date. */
export function appliedBalanceEffectsOf(row: SettlementRow): BalanceEffect[] {
  return row.balancePending ? [] : balanceEffectsOf(row);
}

/** Whether a row has anything to settle: an account and a positive amount. */
export function movesAnAccount(row: SettlementRow): boolean {
  return balanceEffectsOf(row).some((effect) => Math.abs(effect.delta) > 0);
}

/** Whether a row pays down a property's debt on its date: a `debt` row linked to a property. */
export function repaysDebt(row: Pick<Expense, 'type' | 'amount' | 'debtAssetId'>): boolean {
  return row.type === 'debt' && !!row.debtAssetId && Math.abs(row.amount) > 0;
}

/**
 * Whether a row has anything that waits for its date — an account to move or a debt to repay —
 * and so is written `balancePending` when dated after today.
 */
export function hasDatedEffects(row: SettlementRow): boolean {
  return movesAnAccount(row) || repaysDebt(row);
}

/** The effects summed per account, the ones that cancel out dropped (a sub-cent residue is float noise). */
export function netBalanceEffects(effects: BalanceEffect[]): BalanceEffect[] {
  const byAsset = new Map<string, number>();
  for (const { assetId, delta } of effects) byAsset.set(assetId, (byAsset.get(assetId) ?? 0) + delta);
  return [...byAsset.entries()].filter(([, delta]) => Math.abs(delta) > 0.001).map(([assetId, delta]) => ({ assetId, delta }));
}

/** The opposite of each effect — what a delete, or the old side of an edit, gives back. */
export function reverseBalanceEffects(effects: BalanceEffect[]): BalanceEffect[] {
  return effects.map(({ assetId, delta }) => ({ assetId, delta: -delta }));
}

/**
 * «Collega la serie»: the occurrences a series can still be linked on — the ones dated after today
 * that have not moved an account yet (none linked, or linked and waiting). An occurrence already
 * happened is left alone: whatever it did is in today's balance, which the owner aligned to the
 * bank. One linked AND applied is never re-pointed: its account already moved.
 */
export function selectLinkableOccurrences<T extends SettlementRow & { date: Date }>(rows: T[], now: Date): T[] {
  return rows.filter((row) => settlesLater(row.date, now) && (!row.linkedCashAssetId || row.balancePending === true));
}

/**
 * What an edit does to the accounts: the old row's APPLIED effect given back, the new row's effect
 * applied unless its new date is still to come. Covers every change at once — amount, account,
 * type across the transfer boundary, and the date moving across today in either direction.
 */
export function editBalanceEffects(before: SettlementRow, after: SettlementRow & { date: Date }, now: Date): { effects: BalanceEffect[]; pending: boolean } {
  const pending = hasDatedEffects(after) && settlesLater(after.date, now);
  const applied = pending ? [] : balanceEffectsOf(after);
  return { effects: netBalanceEffects([...reverseBalanceEffects(appliedBalanceEffectsOf(before)), ...applied]), pending };
}
