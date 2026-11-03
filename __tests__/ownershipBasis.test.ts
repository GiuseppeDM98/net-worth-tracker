import { describe, expect, it } from 'vitest';
import type { OwnershipRow } from '@/lib/utils/assetOwnership';
import { ownershipRowOn } from '@/lib/utils/ownershipBasis';

const ROW: OwnershipRow = {
  key: 'common',
  kind: 'common',
  memberId: null,
  label: 'In comune',
  value: 2500,
  sharePct: 50,
  costValue: 1000,
  costSharePct: null,
  assetCount: 1,
};

describe('ownershipRowOn', () => {
  it('reads the value and its share on the value basis', () => {
    expect(ownershipRowOn(ROW, 'value')).toEqual({ value: 2500, sharePct: 50 });
  });

  it('reads the carry and its share on the cost basis, a null share staying null', () => {
    expect(ownershipRowOn(ROW, 'cost')).toEqual({ value: 1000, sharePct: null });
  });
});
