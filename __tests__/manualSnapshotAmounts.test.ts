/**
 * The manual snapshot's class amounts. The load-bearing property is the FIRST test: the form
 * offers a field for every member of the union, because its sum is validated against the total
 * — a missing field does not make a snapshot incomplete, it makes it unenterable.
 */
import { describe, it, expect } from 'vitest';
import { ASSET_CLASS_SEQUENCE } from '@/lib/utils/allocationUtils';
import {
  emptyClassAmounts,
  parseAmount,
  sumClassAmounts,
} from '@/lib/utils/manualSnapshotAmounts';

describe('emptyClassAmounts', () => {
  it('should offer one field per member of the AssetClass union, never a hand-written subset', () => {
    const amounts = emptyClassAmounts();
    expect(Object.keys(amounts).sort()).toEqual([...ASSET_CLASS_SEQUENCE].sort());
    // The two classes the six hard-coded fields used to drop.
    expect(amounts).toHaveProperty('trendFollowing', '0');
    expect(amounts).toHaveProperty('carry', '0');
  });

  it('should start every field at the string "0", not at 0 or an empty string', () => {
    // The values feed <input type="number"> straight back; a number would make the field
    // uncontrolled on the first keystroke.
    expect(Object.values(emptyClassAmounts()).every((v) => v === '0')).toBe(true);
  });
});

describe('parseAmount', () => {
  it('should read a field the way the form means it', () => {
    expect(parseAmount('1250.75')).toBe(1250.75);
    expect(parseAmount(' 42 ')).toBe(42);
    expect(parseAmount('0')).toBe(0);
  });

  it('should treat an absent or unusable field as zero, never as NaN', () => {
    // A class left alone did not happen; it is not an error, and a NaN would poison the sum
    // the user is asked to reconcile against the total.
    expect(parseAmount('')).toBe(0);
    expect(parseAmount('   ')).toBe(0);
    expect(parseAmount(undefined)).toBe(0);
    expect(parseAmount('abc')).toBe(0);
  });
});

describe('sumClassAmounts', () => {
  it('should total every class the union knows', () => {
    const amounts = { ...emptyClassAmounts(), equity: '60000', bonds: '30000', trendFollowing: '10000' };
    expect(sumClassAmounts(amounts)).toBe(100000);
  });

  it('should let a portfolio holding Trend Following and Carry reconcile against its total', () => {
    // The regression this module exists for: with six fields the sum could reach at most
    // 90.000 against a 100.000 total, so the guard rejected every honest attempt.
    const amounts = {
      ...emptyClassAmounts(),
      equity: '55000',
      bonds: '25000',
      trendFollowing: '12000',
      carry: '8000',
    };
    expect(sumClassAmounts(amounts)).toBe(100000);
  });

  it('should ignore a key the union does not know', () => {
    // A stale key from an older document must not inflate the figure the user reconciles.
    const amounts = { ...emptyClassAmounts(), equity: '100', legacyClass: '999' };
    expect(sumClassAmounts(amounts)).toBe(100);
  });

  it('should be zero for an untouched form', () => {
    expect(sumClassAmounts(emptyClassAmounts())).toBe(0);
  });
});
