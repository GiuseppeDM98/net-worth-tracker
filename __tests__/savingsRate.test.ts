import { describe, expect, it } from 'vitest';
import {
  SAVINGS_RATE_FLOOR,
  meaningfulSavingsRate,
  readSavings,
  weightedSavingsRate,
} from '@/lib/utils/savingsRate';

// The three cases every savings-rate test names: no income, a tiny income, a true −30%.
describe('readSavings', () => {
  it('should read spending without income as no-income', () => {
    expect(readSavings(0, 500)).toEqual({ kind: 'no-income', spending: 500 });
  });

  it('should read a deficit larger than the income as a deficit in euros', () => {
    expect(readSavings(3, 500)).toEqual({ kind: 'deficit', deficit: 497, income: 3, spending: 500 });
  });

  it('should keep a true −30% as a rate', () => {
    expect(readSavings(2000, 2600)).toEqual({ kind: 'rate', rate: -30, savings: -600, income: 2000, spending: 2600 });
  });

  it('should read nothing at all as none', () => {
    expect(readSavings(0, 0)).toEqual({ kind: 'none' });
  });

  it('should keep exactly the floor as a rate', () => {
    const reading = readSavings(1000, 2000);
    expect(reading).toEqual({ kind: 'rate', rate: SAVINGS_RATE_FLOOR, savings: -1000, income: 1000, spending: 2000 });
  });

  it('should count a negative income as none', () => {
    expect(readSavings(-50, 0)).toEqual({ kind: 'none' });
    expect(readSavings(-50, 500)).toEqual({ kind: 'no-income', spending: 500 });
  });
});

describe('meaningfulSavingsRate', () => {
  it('should return the rate only when it can be printed as a percentage', () => {
    expect(meaningfulSavingsRate(2000, 2600)).toBe(-30);
    expect(meaningfulSavingsRate(3, 500)).toBeNull();
    expect(meaningfulSavingsRate(0, 500)).toBeNull();
    expect(meaningfulSavingsRate(0, 0)).toBeNull();
  });
});

describe('weightedSavingsRate', () => {
  it('should weigh the rates by income and skip the periods that are not rates', () => {
    const periods = [
      { income: 1000, spending: 500 },
      { income: 3, spending: 500 },
      { income: 2000, spending: 1000 },
    ];
    // (500 + 1000) / (1000 + 2000) = 50%; the mean of the two rates would be 50% too, so the
    // weights are pinned by a fourth period where the two disagree.
    expect(weightedSavingsRate(periods)).toBe(50);
    expect(weightedSavingsRate([...periods, { income: 1000, spending: 1000 }])).toBe(37.5);
  });

  it('should return null when no period is a rate', () => {
    expect(weightedSavingsRate([{ income: 3, spending: 500 }, { income: 0, spending: 0 }])).toBeNull();
    expect(weightedSavingsRate([])).toBeNull();
  });
});
