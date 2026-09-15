/**
 * Tests for lib/utils/movementsOwnerFilter.ts — the «Intestatario» filter of Tracciamento's
 * Movimenti list and the owner chip a row prints.
 */

import { describe, expect, it } from 'vitest';

import {
  OWNER_FILTER_ALL,
  OWNER_FILTER_COMMON,
  OWNER_FILTER_UNASSIGNED,
  listOwnerFilterOptions,
  matchesOwnerFilter,
  resolveOwnerLabel,
} from '@/lib/utils/movementsOwnerFilter';
import { SPLIT_UNASSIGNED_LABEL } from '@/lib/utils/expenseSplitSummary';
import type { Expense } from '@/types/expenses';
import type { FamilyMember } from '@/types/assets';

const GIUSEPPE: FamilyMember = { id: 'm-giuseppe', name: 'Giuseppe' };
const MARCELLA: FamilyMember = { id: 'm-marcella', name: 'Marcella' };
const MEMBERS = [GIUSEPPE, MARCELLA];
const KNOWN = new Set(MEMBERS.map((member) => member.id));
const NAMES = new Map(MEMBERS.map((member) => [member.id, member.name]));

let sequence = 0;
function row(personalMemberId?: string): Expense {
  sequence += 1;
  return {
    id: `row-${sequence}`,
    userId: 'u1',
    type: 'variable',
    categoryId: 'cat-casa',
    categoryName: 'Casa',
    amount: -10,
    currency: 'EUR',
    date: new Date(2026, 8, 10, 12),
    createdAt: new Date(2026, 8, 10, 12),
    updatedAt: new Date(2026, 8, 10, 12),
    personalMemberId,
  };
}

const COMMON = row();
const BLANK = row('');
const MINE = row(GIUSEPPE.id);
const HERS = row(MARCELLA.id);
const ORPHAN = row('m-deleted');

describe('listOwnerFilterOptions', () => {
  it('should offer Tutti, In comune and every member, in the settings order', () => {
    expect(listOwnerFilterOptions([COMMON, MINE, HERS], MEMBERS)).toEqual([
      { value: OWNER_FILTER_ALL, label: 'Tutti' },
      { value: OWNER_FILTER_COMMON, label: 'In comune' },
      { value: GIUSEPPE.id, label: 'Giuseppe' },
      { value: MARCELLA.id, label: 'Marcella' },
    ]);
  });

  it('should add «Senza intestatario» only when the rows hold a member that no longer exists', () => {
    const withOrphan = listOwnerFilterOptions([COMMON, ORPHAN], MEMBERS);
    expect(withOrphan.at(-1)).toEqual({ value: OWNER_FILTER_UNASSIGNED, label: SPLIT_UNASSIGNED_LABEL });
    expect(listOwnerFilterOptions([COMMON, MINE], MEMBERS).some((option) => option.value === OWNER_FILTER_UNASSIGNED)).toBe(false);
  });
});

describe('matchesOwnerFilter', () => {
  const rows = [COMMON, BLANK, MINE, HERS, ORPHAN];
  const passing = (filter: string) => rows.filter((expense) => matchesOwnerFilter(expense, filter, KNOWN)).map((e) => e.id);

  it('should pass everything on «Tutti»', () => {
    expect(passing(OWNER_FILTER_ALL)).toEqual(rows.map((e) => e.id));
  });

  it('should treat an absent AND a blank owner as «in comune»', () => {
    expect(passing(OWNER_FILTER_COMMON)).toEqual([COMMON.id, BLANK.id]);
  });

  it('should pass only that person on a member id', () => {
    expect(passing(GIUSEPPE.id)).toEqual([MINE.id]);
    expect(passing(MARCELLA.id)).toEqual([HERS.id]);
  });

  it('should pass only the orphaned rows on «Senza intestatario» — never fold them into the pool', () => {
    expect(passing(OWNER_FILTER_UNASSIGNED)).toEqual([ORPHAN.id]);
  });
});

describe('resolveOwnerLabel', () => {
  it('should print nothing for a shared row, the name for an attributed one, the orphan label for a lost owner', () => {
    expect(resolveOwnerLabel(COMMON, NAMES)).toBeNull();
    expect(resolveOwnerLabel(BLANK, NAMES)).toBeNull();
    expect(resolveOwnerLabel(MINE, NAMES)).toBe('Giuseppe');
    expect(resolveOwnerLabel(ORPHAN, NAMES)).toBe(SPLIT_UNASSIGNED_LABEL);
  });
});
