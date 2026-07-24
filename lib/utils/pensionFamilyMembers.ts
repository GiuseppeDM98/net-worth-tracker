/**
 * Fondo pensione — grouping pension-fund assets by household member.
 *
 * The IRPEF pension-deduction ceiling is per TAXPAYER, not per account: an account tracking more
 * than one person's fondo pensione (e.g. both spouses) must compute the tax recap once PER PERSON,
 * against that person's own RAL, not once for the account with every fund's contributions summed
 * together. This module is the bridge between the account's `pensionFund` assets and the per-member
 * grouping the Previdenza view needs — a different axis from `pensionContributions.ts` (which groups
 * by tax year, not by person).
 *
 * Zero Firebase imports — a pure function of its input arrays.
 */

import type { Asset, FamilyMember } from '@/types/assets';

export interface FundFamilyMemberGroup {
  member: FamilyMember;
  funds: Asset[];
}

export interface FundFamilyMemberGrouping {
  /** One entry per member with >=1 linked fund, in the same order as `members`. */
  matched: FundFamilyMemberGroup[];
  /** Funds with no `familyMemberId`, or one that doesn't resolve to any member in `members`
   *  (e.g. the member was since deleted) — never silently folded into another member's group. */
  unassigned: Asset[];
}

/**
 * Group `funds` (expected to be `type === 'pensionFund'` assets) by
 * `Asset.pensionFundDetails.familyMemberId`, resolved against `members`.
 */
export function groupFundsByFamilyMember(
  funds: Asset[],
  members: FamilyMember[]
): FundFamilyMemberGrouping {
  const fundsByMemberId = new Map<string, Asset[]>();
  const unassigned: Asset[] = [];

  for (const fund of funds) {
    const memberId = fund.pensionFundDetails?.familyMemberId;
    if (!memberId) {
      unassigned.push(fund);
      continue;
    }
    const existing = fundsByMemberId.get(memberId);
    if (existing) existing.push(fund);
    else fundsByMemberId.set(memberId, [fund]);
  }

  const matched: FundFamilyMemberGroup[] = [];
  for (const member of members) {
    const memberFunds = fundsByMemberId.get(member.id);
    if (memberFunds && memberFunds.length > 0) {
      matched.push({ member, funds: memberFunds });
      fundsByMemberId.delete(member.id);
    }
  }

  // Whatever is left in the map belonged to a familyMemberId that matched no current member
  // (e.g. the member was deleted) — those funds are unassigned too, not silently dropped.
  for (const staleFunds of fundsByMemberId.values()) {
    unassigned.push(...staleFunds);
  }

  return { matched, unassigned };
}
