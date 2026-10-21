/**
 * Tests for lib/utils/propertyLink.ts — the house a row belongs to, linked or derived from its loan
 * (owner, 2026-10-21 tour). Invented ids.
 */

import { describe, expect, it } from 'vitest';

import { houseOfRow, housesByLoan } from '@/lib/utils/propertyLink';

const loanHouses = housesByLoan([
  { id: 'mortgage', type: 'loan', financedAssetId: 'house' },
  { id: 'car-loan', type: 'loan' },
  { id: 'house', type: 'realestate' },
]);

describe('housesByLoan', () => {
  it('should map only the loans that finance a house', () => {
    expect([...loanHouses.entries()]).toEqual([['mortgage', 'house']]);
  });
});

describe('houseOfRow', () => {
  it('should read the row own link when it repays no house loan', () => {
    expect(houseOfRow({ propertyAssetId: 'other-house' }, loanHouses)).toEqual({ houseId: 'other-house', viaLoan: false });
    expect(houseOfRow({ propertyAssetId: 'other-house', debtAssetId: 'car-loan' }, loanHouses)).toEqual({ houseId: 'other-house', viaLoan: false });
  });

  it('should put the mortgage first: an instalment belongs to the house its loan finances (owner, 2026-10-21 tour)', () => {
    expect(houseOfRow({ propertyAssetId: 'house', debtAssetId: 'mortgage' }, loanHouses)).toEqual({ houseId: 'house', viaLoan: true });
  });

  it('should derive the house from the mortgage the row repays', () => {
    expect(houseOfRow({ debtAssetId: 'mortgage' }, loanHouses)).toEqual({ houseId: 'house', viaLoan: true });
  });

  it('should find no house for a loan that finances none, or a row with neither', () => {
    expect(houseOfRow({ debtAssetId: 'car-loan' }, loanHouses)).toBeNull();
    expect(houseOfRow({}, loanHouses)).toBeNull();
  });
});
