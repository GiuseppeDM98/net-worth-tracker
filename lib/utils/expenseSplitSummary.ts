/**
 * The numbers of Cashflow › Divisione: how a household's shared spending is split between the
 * people who live in it, and what is left of each person's salary once their share is paid.
 *
 * THE MODEL, in one paragraph. Every expense row is either the household's («in comune», the
 * default, which is what an absent `personalMemberId` means) or one person's. The common
 * spending is a pool. Each person carries a share of that pool proportional to the salary they
 * brought into the period, and what remains to them is `salary − share of the pool − their own
 * spending`. That last figure is the point of the page: it is the money that can go to a
 * personal investment account at the end of the month.
 *
 * THE SHARES ARE THE PERIOD'S, and that is a deliberate choice with a cost. Reading them off the
 * salaries actually received in the window is the most faithful answer to «how did THIS month
 * go», and it is also the most volatile: a bonus or a thirteenth month moves the percentage, and
 * a salary not yet recorded would move it to 100/0. So the shares are never guessed. When one of
 * the people has no salary in the period, `resolveSplitBasis` returns `unavailable` naming who is
 * missing, and every figure that depends on the split disappears with it rather than being
 * invented — the same rule that makes an unknowable baseline `null` instead of `0` elsewhere in
 * this codebase.
 *
 * WHAT IS DELIBERATELY NOT HERE. There is no reconciliation of who paid what: the question this
 * page answers is «how much is left to each of us», not «who owes whom». The paying account
 * (`linkedCashAssetId`) is therefore never read, and a couple whose common expenses leave a joint
 * account needs no extra bookkeeping to use any of this.
 *
 * Words live in `expenseSplitNarrative.ts`; nothing here formats anything.
 */

import type { Expense } from '@/types/expenses';
import type { FamilyMember } from '@/types/assets';
import { isScheduledRow, summarizeScheduled, type ScheduledSlice } from '@/lib/utils/tracciamentoSummary';

/**
 * A row whose `personalMemberId` names nobody the settings still know — the member was deleted
 * after the row was written. It is NOT folded back into the common pool: the user said it was
 * one person's, and charging everyone for it would be a worse answer than admitting the row has
 * lost its owner. It gets a bucket of its own, so the parts still add up to the whole and the
 * reader has something to click on. Same contract as NO_SUBCATEGORY_LABEL.
 */
export const SPLIT_UNASSIGNED_LABEL = 'Senza intestatario';

/** Spending types, in this app's convention: a transfer is net-zero and never spending. */
const SPENDING_TYPES = new Set(['fixed', 'variable', 'debt']);

export interface SplitMember {
  id: string;
  name: string;
}

/** One person's salary in the period, and the share of the common pool it earns them. */
export interface MemberShare {
  member: SplitMember;
  /** Labor income attributed to this person inside the period, positive. */
  salary: number;
  /** 0..1, summing to 1 across the members. */
  share: number;
}

/** Why the split could not be computed. Each value names an input the user can go and fix. */
export type SplitUnavailableReason =
  /** Fewer than two people configured under Impostazioni → Famiglia. */
  | 'not-enough-members'
  /** No income category is marked as labor income, so no row can count as a salary. */
  | 'no-labor-categories'
  /** At least one person has no salary in this period — see `missingNames`. */
  | 'missing-salary';

export type SplitBasis =
  | { kind: 'computed'; members: MemberShare[]; totalSalary: number; unattributedSalary: number }
  | {
      kind: 'unavailable';
      reason: SplitUnavailableReason;
      missingNames: string[];
      unattributedSalary: number;
    };

/** The household's shared spending over the period. */
export interface CommonSpending {
  /** Positive magnitude, the `calculateTotalExpenses` convention. */
  total: number;
  rowCount: number;
  /** The part of `total` dated after today — inside it, never beside it. */
  scheduled: ScheduledSlice;
}

/** What one person owes and what is left to them. */
export interface MemberBalance {
  member: SplitMember;
  /** Their labor income in the period, positive. */
  salary: number;
  /** 0..1, or null when the basis is unavailable. */
  share: number | null;
  /** Their slice of the common pool, positive; null when the basis is unavailable. */
  commonShare: number | null;
  /** Their own spending, positive. Known whatever the basis does. */
  personalSpending: number;
  /**
   * What is left once EVERY row of the period is counted, the ones still in the calendar
   * included: salary − commonShare − personalSpending. Null when the basis is unavailable — a
   * residual computed without a share would be the whole pool charged to nobody.
   *
   * This is where the period ENDS, not where it stands. The figure a surface prints is
   * `remainingBooked`.
   */
  remaining: number | null;
  /**
   * The same residual counting only what has already HAPPENED by `now` — the figure the page
   * prints and colours, and the one the verdict says «mancano» about.
   *
   * The two differ by the money the period still has ahead of it: this person's share of the
   * common rows dated after today, their own rows dated after today, and any salary of theirs
   * not yet received. Before this existed the page charged an unpaid bill to a person as if it
   * had left their account — the whole of a deficit could be money still in the bank — which is
   * the same claim `resolveSplitBasis` refuses to make about a share (2026-09-21, Impeccable
   * critique). Tracciamento's verdict draws the line in the same place (`settleTotals`), and
   * Centri di Costo separates the fact (`exceeded`) from the calendar (`atRisk`) for the same
   * reason.
   */
  remainingBooked: number | null;
}

export interface ExpenseSplitSummary {
  basis: SplitBasis;
  common: CommonSpending;
  /** One entry per configured member, in the order the settings list them. */
  members: MemberBalance[];
  /** Rows whose owner no longer exists. Positive magnitude. */
  unassigned: { total: number; rowCount: number };
  /** The common rows, for the tile that ranks them by category. */
  commonExpenses: Expense[];
}

export interface ExpenseSplitInput {
  /** Already narrowed to the period the page is showing. */
  expenses: Expense[];
  members: FamilyMember[];
  /** `AssetAllocationSettings.laborIncomeCategoryIds` — which income counts as a salary. */
  laborIncomeCategoryIds: string[];
  now: Date;
}

/** A member id that still resolves to somebody, or null. Blank strings count as absent. */
function resolveOwnerId(expense: Expense, knownIds: Set<string>): string | null {
  const raw = expense.personalMemberId;
  if (!raw) return null;
  return knownIds.has(raw) ? raw : SPLIT_UNASSIGNED_LABEL;
}

function isSpending(expense: Expense): boolean {
  return SPENDING_TYPES.has(expense.type);
}

/**
 * The share each person carries of the common pool, or the reason there is none.
 *
 * Shares come from labor income ONLY: a refund or a gift attributed to somebody is their money
 * but it is not what the household agreed to divide on, and every sentence built on this basis
 * says «stipendio» out loud.
 *
 * `unattributedSalary` rides on BOTH outcomes because it is a fact about the window, not about
 * the split: labor income nobody is named on — a salary row left «in comune», or one whose owner
 * has since left Famiglia — cannot earn anybody a share, and used to vanish here behind two mute
 * `continue`s. The spending side has always declared its orphans out loud; the income side, the
 * one that DECIDES the percentages, declared nothing, so a 60/40 computed on 80% of the month's
 * salaries was printed with full confidence (2026-09-21, Impeccable critique).
 *
 * @param incomeRows Income-type rows already narrowed to the period.
 */
export function resolveSplitBasis(
  incomeRows: Expense[],
  members: FamilyMember[],
  laborIncomeCategoryIds: string[]
): SplitBasis {
  const laborCategories = new Set(laborIncomeCategoryIds);
  const knownIds = new Set(members.map((member) => member.id));
  const salaryByMember = new Map<string, number>(members.map((member) => [member.id, 0]));
  let unattributedSalary = 0;

  for (const row of incomeRows) {
    if (row.type !== 'income') continue;
    if (!laborCategories.has(row.categoryId)) continue;
    // Labor income that belongs to nobody the settings still know: named, never counted.
    if (!row.personalMemberId || !knownIds.has(row.personalMemberId)) {
      unattributedSalary += row.amount;
      continue;
    }
    salaryByMember.set(row.personalMemberId, (salaryByMember.get(row.personalMemberId) ?? 0) + row.amount);
  }

  if (members.length < 2) {
    return { kind: 'unavailable', reason: 'not-enough-members', missingNames: [], unattributedSalary };
  }
  if (laborIncomeCategoryIds.length === 0) {
    return { kind: 'unavailable', reason: 'no-labor-categories', missingNames: [], unattributedSalary };
  }

  // A person with nothing recorded cannot be given a share of 0: that would silently hand the
  // whole pool to the other one. The window is declared incomplete instead.
  const missingNames = members
    .filter((member) => (salaryByMember.get(member.id) ?? 0) <= 0)
    .map((member) => member.name);
  if (missingNames.length > 0) {
    return { kind: 'unavailable', reason: 'missing-salary', missingNames, unattributedSalary };
  }

  const totalSalary = members.reduce((sum, member) => sum + (salaryByMember.get(member.id) ?? 0), 0);
  const shares: MemberShare[] = members.map((member) => {
    const salary = salaryByMember.get(member.id) ?? 0;
    return { member: { id: member.id, name: member.name }, salary, share: salary / totalSalary };
  });

  return { kind: 'computed', members: shares, totalSalary, unattributedSalary };
}

/**
 * Split `total` across the shares so the parts sum back to it EXACTLY.
 *
 * Rounding every part independently leaves a stray cent, and a page that prints the pool next to
 * its own pieces is where that cent is visible. The rule this codebase already uses for a pair
 * that must sum to a constant — round one side and subtract — generalises here as: round every
 * part, then charge the residual to the LARGEST share, where it is proportionally smallest.
 *
 * Note for anyone testing this: with exactly TWO shares the two roundings always cancel, so the
 * correction below is unreachable in the two-person case this feature was built for. It bites
 * from three people up (a flatshare), which is the only shape a fixture can prove it with.
 */
export function allocateByShare(total: number, shares: MemberShare[]): Map<string, number> {
  const allocated = new Map<string, number>();
  if (shares.length === 0) return allocated;

  let running = 0;
  for (const entry of shares) {
    const amount = Math.round(total * entry.share * 100) / 100;
    allocated.set(entry.member.id, amount);
    running += amount;
  }

  const residual = Math.round((total - running) * 100) / 100;
  if (residual !== 0) {
    const largest = shares.reduce((best, entry) => (entry.share > best.share ? entry : best), shares[0]);
    // Re-round after the correction: 50.02 + (−0.01) is 50.010000000000005 in binary floating
    // point, and an amount that is not exactly a cent leaks into anything comparing cents.
    const corrected = Math.round(((allocated.get(largest.member.id) ?? 0) + residual) * 100) / 100;
    allocated.set(largest.member.id, corrected);
  }
  return allocated;
}

/**
 * Everything the Divisione tab and the monthly email read.
 *
 * Classification is by `type` and never by the sign of `amount` — by sign, a refund would count
 * as income and a reversed salary as spending. Transfers are skipped whole: they are net-zero,
 * and the money one person moves to the joint account is plumbing, not a cost.
 */
export function summarizeExpenseSplit({
  expenses,
  members,
  laborIncomeCategoryIds,
  now,
}: ExpenseSplitInput): ExpenseSplitSummary {
  const knownIds = new Set(members.map((member) => member.id));

  const commonExpenses: Expense[] = [];
  /** `total` is the whole period; `booked` is the part of it dated today or earlier. */
  const personalByMember = new Map<string, { total: number; booked: number; rowCount: number }>(
    members.map((member) => [member.id, { total: 0, booked: 0, rowCount: 0 }])
  );
  const bookedSalaryByMember = new Map<string, number>(members.map((member) => [member.id, 0]));
  const unassigned = { total: 0, rowCount: 0 };
  const incomeRows: Expense[] = [];
  const laborCategories = new Set(laborIncomeCategoryIds);

  for (const expense of expenses) {
    if (expense.type === 'transfer') continue;
    const scheduled = isScheduledRow(expense, now);
    if (expense.type === 'income') {
      incomeRows.push(expense);
      // A salary still to be paid props up a residual exactly as an unpaid bill deflates one.
      if (!scheduled && expense.personalMemberId && knownIds.has(expense.personalMemberId) && laborCategories.has(expense.categoryId)) {
        bookedSalaryByMember.set(
          expense.personalMemberId,
          (bookedSalaryByMember.get(expense.personalMemberId) ?? 0) + expense.amount
        );
      }
      continue;
    }
    if (!isSpending(expense)) continue;

    const magnitude = Math.abs(expense.amount);
    const owner = resolveOwnerId(expense, knownIds);
    if (owner === null) {
      commonExpenses.push(expense);
    } else if (owner === SPLIT_UNASSIGNED_LABEL) {
      unassigned.total += magnitude;
      unassigned.rowCount += 1;
    } else {
      const bucket = personalByMember.get(owner)!;
      bucket.total += magnitude;
      if (!scheduled) bucket.booked += magnitude;
      bucket.rowCount += 1;
    }
  }

  const commonTotal = commonExpenses.reduce((sum, expense) => sum + Math.abs(expense.amount), 0);
  const common: CommonSpending = {
    total: commonTotal,
    rowCount: commonExpenses.length,
    scheduled: summarizeScheduled(commonExpenses, now),
  };
  const commonBooked = commonTotal - common.scheduled.expenses;

  const basis = resolveSplitBasis(incomeRows, members, laborIncomeCategoryIds);
  const shareByMember = new Map<string, MemberShare>(
    basis.kind === 'computed' ? basis.members.map((entry) => [entry.member.id, entry]) : []
  );
  const computedShares = basis.kind === 'computed' ? basis.members : [];
  const allocation = allocateByShare(commonTotal, computedShares);
  // The booked pool is allocated through the SAME rule, so Σ(booked shares) is the booked pool to
  // the cent — a residual derived by subtracting one allocation from another would not close.
  const bookedAllocation = allocateByShare(commonBooked, computedShares);

  const balances: MemberBalance[] = members.map((member) => {
    const personal = personalByMember.get(member.id) ?? { total: 0, booked: 0, rowCount: 0 };
    const entry = shareByMember.get(member.id);
    const commonShare = entry ? (allocation.get(member.id) ?? 0) : null;
    const bookedShare = entry ? (bookedAllocation.get(member.id) ?? 0) : null;
    return {
      member: { id: member.id, name: member.name },
      salary: entry?.salary ?? 0,
      share: entry?.share ?? null,
      commonShare,
      personalSpending: personal.total,
      remaining: entry && commonShare !== null ? entry.salary - commonShare - personal.total : null,
      remainingBooked:
        entry && bookedShare !== null
          ? (bookedSalaryByMember.get(member.id) ?? 0) - bookedShare - personal.booked
          : null,
    };
  });

  return { basis, common, members: balances, unassigned, commonExpenses };
}
