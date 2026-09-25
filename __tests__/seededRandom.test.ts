/**
 * Tests for lib/utils/seededRandom.ts — the seeded uniform source the FIRE fan runs on: the same
 * seed gives the same sequence (which is what lets two plans share their shocks), a different
 * seed a different one, and every draw stays inside [0, 1).
 */

import { describe, expect, it } from 'vitest';
import { createSeededRandom } from '@/lib/utils/seededRandom';

function draws(seed: number, count: number): number[] {
  const random = createSeededRandom(seed);
  return Array.from({ length: count }, () => random());
}

describe('createSeededRandom', () => {
  it('gives the same sequence for the same seed', () => {
    expect(draws(0x46495245, 1000)).toEqual(draws(0x46495245, 1000));
  });

  it('gives a different sequence for a different seed', () => {
    expect(draws(1, 100)).not.toEqual(draws(2, 100));
  });

  it('stays within [0, 1) and does not sit still', () => {
    const values = draws(7, 10_000);
    expect(values.every((value) => value >= 0 && value < 1)).toBe(true);
    expect(new Set(values).size).toBeGreaterThan(9_900);
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    expect(mean).toBeGreaterThan(0.48);
    expect(mean).toBeLessThan(0.52);
  });
});
