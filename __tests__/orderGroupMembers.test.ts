import { describe, expect, it } from 'vitest';
import { orderGroupMembers } from '@/lib/utils/accumulationPlanUtils';

describe('orderGroupMembers (AL1 · R1)', () => {
  it('should put the instrument that buys first, whatever the order of the list', () => {
    expect(orderGroupMembers({ memberAssetIds: ['vecchio', 'nuovo'], buyAssetId: 'nuovo' })).toEqual(['nuovo', 'vecchio']);
  });
  it('should leave a list already led by the buyer, and a single instrument, as they are', () => {
    expect(orderGroupMembers({ memberAssetIds: ['nuovo', 'vecchio'], buyAssetId: 'nuovo' })).toEqual(['nuovo', 'vecchio']);
    expect(orderGroupMembers({ memberAssetIds: ['solo'], buyAssetId: 'solo' })).toEqual(['solo']);
  });
  it('should keep the order when the buyer is not a member, and not mutate its input', () => {
    const ids = ['a', 'b'];
    expect(orderGroupMembers({ memberAssetIds: ids, buyAssetId: 'x' })).toEqual(['a', 'b']);
    orderGroupMembers({ memberAssetIds: ids, buyAssetId: 'b' });
    expect(ids).toEqual(['a', 'b']);
  });
});
