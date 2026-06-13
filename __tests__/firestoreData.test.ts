import { describe, it, expect } from 'vitest';
import { removeUndefinedDeep } from '@/lib/utils/firestoreData';

describe('removeUndefinedDeep', () => {
  it('removes top-level undefined keys', () => {
    const result = removeUndefinedDeep({ name: 'Food', color: undefined, icon: 'Tag' });
    expect(result).toEqual({ name: 'Food', icon: 'Tag' });
    expect('color' in result).toBe(false);
  });

  it('removes undefined nested inside array elements (the subcategory icon case)', () => {
    // Reproduces the reported bug: a subcategory added without an icon.
    const input = {
      name: 'Casa',
      subCategories: [
        { id: '1', name: 'Affitto', icon: undefined },
        { id: '2', name: 'Bollette', icon: 'Zap' },
      ],
    };

    const result = removeUndefinedDeep(input);

    expect(result.subCategories[0]).toEqual({ id: '1', name: 'Affitto' });
    expect('icon' in result.subCategories[0]).toBe(false);
    expect(result.subCategories[1]).toEqual({ id: '2', name: 'Bollette', icon: 'Zap' });
  });

  it('removes undefined inside a nested plain object', () => {
    const result = removeUndefinedDeep({
      bondDetails: { couponRate: 3.5, nominalValue: undefined },
    });
    expect(result.bondDetails).toEqual({ couponRate: 3.5 });
  });

  it('preserves Date instances instead of flattening them to {}', () => {
    const now = new Date('2026-06-13T00:00:00.000Z');
    const result = removeUndefinedDeep({ updatedAt: now, name: 'x' });
    expect(result.updatedAt).toBe(now);
    expect(result.updatedAt instanceof Date).toBe(true);
  });

  it('preserves null, arrays of primitives, and empty arrays', () => {
    const result = removeUndefinedDeep({
      color: null,
      tags: ['a', 'b'],
      subCategories: [],
    });
    expect(result).toEqual({ color: null, tags: ['a', 'b'], subCategories: [] });
  });

  it('passes through non-plain class instances untouched (Timestamp/FieldValue proxy)', () => {
    // A class instance stands in for Firestore Timestamp / FieldValue sentinels:
    // its prototype is not Object.prototype, so it must not be recursed into.
    class Sentinel {
      readonly kind = 'delete';
    }
    const sentinel = new Sentinel();
    const result = removeUndefinedDeep({ field: sentinel, name: 'x' });
    expect(result.field).toBe(sentinel);
  });

  it('does not mutate the input', () => {
    const input = { a: 1, nested: { b: undefined, c: 2 } };
    const snapshot = JSON.parse(JSON.stringify(input));
    removeUndefinedDeep(input);
    // The original still carries the undefined key (only the returned copy is cleaned).
    expect('b' in input.nested).toBe(true);
    expect(JSON.parse(JSON.stringify(input))).toEqual(snapshot);
  });
});
