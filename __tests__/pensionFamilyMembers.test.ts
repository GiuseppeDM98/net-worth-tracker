import { describe, it, expect } from 'vitest';
import { groupFundsByFamilyMember } from '@/lib/utils/pensionFamilyMembers';
import type { Asset, FamilyMember } from '@/types/assets';

function makeFund(id: string, familyMemberId?: string): Asset {
  return {
    id,
    userId: 'user-1',
    ticker: '',
    name: `Fund ${id}`,
    type: 'pensionFund',
    assetClass: 'equity',
    currency: 'EUR',
    quantity: 1000,
    currentPrice: 1,
    lastPriceUpdate: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...(familyMemberId ? { pensionFundDetails: { provider: 'Test', familyMemberId } } : {}),
  } as Asset;
}

function makeMember(id: string, name: string): FamilyMember {
  return { id, name };
}

describe('groupFundsByFamilyMember', () => {
  it('returns empty matched/unassigned for no members and no funds', () => {
    const result = groupFundsByFamilyMember([], []);
    expect(result.matched).toEqual([]);
    expect(result.unassigned).toEqual([]);
  });

  it('puts funds with no familyMemberId entirely in unassigned', () => {
    const funds = [makeFund('f1'), makeFund('f2')];
    const members = [makeMember('m1', 'Paolo')];

    const result = groupFundsByFamilyMember(funds, members);

    expect(result.matched).toEqual([]);
    expect(result.unassigned.map((f) => f.id)).toEqual(['f1', 'f2']);
  });

  it('matches a fund to its member 1:1', () => {
    const paolo = makeMember('m1', 'Paolo');
    const elena = makeMember('m2', 'Elena');
    const fundG = makeFund('f1', 'm1');
    const fundM = makeFund('f2', 'm2');

    const result = groupFundsByFamilyMember([fundG, fundM], [paolo, elena]);

    expect(result.matched).toEqual([
      { member: paolo, funds: [fundG] },
      { member: elena, funds: [fundM] },
    ]);
    expect(result.unassigned).toEqual([]);
  });

  it('groups two funds belonging to the same member into one group', () => {
    const paolo = makeMember('m1', 'Paolo');
    const fund1 = makeFund('f1', 'm1');
    const fund2 = makeFund('f2', 'm1');

    const result = groupFundsByFamilyMember([fund1, fund2], [paolo]);

    expect(result.matched).toHaveLength(1);
    expect(result.matched[0].member).toBe(paolo);
    expect(result.matched[0].funds.map((f) => f.id)).toEqual(['f1', 'f2']);
  });

  it('treats a familyMemberId pointing at a deleted member as unassigned', () => {
    const paolo = makeMember('m1', 'Paolo');
    const orphanFund = makeFund('f1', 'm-deleted');

    const result = groupFundsByFamilyMember([orphanFund], [paolo]);

    expect(result.matched).toEqual([]);
    expect(result.unassigned.map((f) => f.id)).toEqual(['f1']);
  });

  it('preserves member order in matched regardless of fund order', () => {
    const paolo = makeMember('m1', 'Paolo');
    const elena = makeMember('m2', 'Elena');
    // Elena's fund appears BEFORE Paolo's in the input array.
    const fundM = makeFund('f1', 'm2');
    const fundG = makeFund('f2', 'm1');

    const result = groupFundsByFamilyMember([fundM, fundG], [paolo, elena]);

    expect(result.matched.map((g) => g.member.id)).toEqual(['m1', 'm2']);
  });

  it('does not include a member with zero funds in matched', () => {
    const paolo = makeMember('m1', 'Paolo');
    const elena = makeMember('m2', 'Elena');
    const fundG = makeFund('f1', 'm1');

    const result = groupFundsByFamilyMember([fundG], [paolo, elena]);

    expect(result.matched.map((g) => g.member.id)).toEqual(['m1']);
  });

  it('mixes matched and unassigned funds in the same call', () => {
    const paolo = makeMember('m1', 'Paolo');
    const fundG = makeFund('f1', 'm1');
    const fundNone = makeFund('f2');
    const fundOrphan = makeFund('f3', 'm-deleted');

    const result = groupFundsByFamilyMember([fundG, fundNone, fundOrphan], [paolo]);

    expect(result.matched).toEqual([{ member: paolo, funds: [fundG] }]);
    expect(result.unassigned.map((f) => f.id).sort()).toEqual(['f2', 'f3']);
  });
});
