/**
 * The «Intestatario» filter of Cashflow › Tracciamento's Movimenti list, and the owner label a
 * row prints — the two readers of `Expense.personalMemberId` outside Divisione.
 *
 * Same contract as `expenseSplitSummary`: absent (or blank) means «in comune», a member id that
 * no longer resolves is «Senza intestatario» (`SPLIT_UNASSIGNED_LABEL`), never folded back into
 * the pool. The members are Previdenza's `FamilyMember`s; the label is resolved here, on read,
 * because the field is deliberately NOT denormalized to a name (doc/guide/cashflow-divisione.md).
 */

import { SPLIT_UNASSIGNED_LABEL } from '@/lib/utils/expenseSplitSummary';
import type { Expense } from '@/types/expenses';
import type { FamilyMember } from '@/types/assets';

/** No filter. */
export const OWNER_FILTER_ALL = 'all';
/** Only the rows with no owner — the household's shared ones. */
export const OWNER_FILTER_COMMON = 'common';
/** Only the rows whose owner was deleted from the settings. */
export const OWNER_FILTER_UNASSIGNED = 'unassigned';

export interface OwnerFilterOption {
  value: string;
  label: string;
}

/** «Tutti · In comune · {members…}», plus «Senza intestatario» only when such rows exist. */
export function listOwnerFilterOptions(expenses: Expense[], members: FamilyMember[]): OwnerFilterOption[] {
  const options: OwnerFilterOption[] = [
    { value: OWNER_FILTER_ALL, label: 'Tutti' },
    { value: OWNER_FILTER_COMMON, label: 'In comune' },
    ...members.map((member) => ({ value: member.id, label: member.name })),
  ];
  const knownIds = new Set(members.map((member) => member.id));
  if (expenses.some((expense) => expense.personalMemberId && !knownIds.has(expense.personalMemberId))) {
    options.push({ value: OWNER_FILTER_UNASSIGNED, label: SPLIT_UNASSIGNED_LABEL });
  }
  return options;
}

/** Whether a row passes the owner filter. `all` passes everything. */
export function matchesOwnerFilter(expense: Expense, filter: string, knownIds: Set<string>): boolean {
  const owner = expense.personalMemberId || null;
  switch (filter) {
    case OWNER_FILTER_ALL:
      return true;
    case OWNER_FILTER_COMMON:
      return owner === null;
    case OWNER_FILTER_UNASSIGNED:
      return owner !== null && !knownIds.has(owner);
    default:
      return owner === filter;
  }
}

/**
 * The chip a row prints: the member's name, «Senza intestatario» for an orphaned row, `null` for
 * a shared row — the default case stays clean, the exception is named.
 */
export function resolveOwnerLabel(expense: Expense, memberNames: Map<string, string>): string | null {
  const owner = expense.personalMemberId || null;
  if (owner === null) return null;
  return memberNames.get(owner) ?? SPLIT_UNASSIGNED_LABEL;
}
