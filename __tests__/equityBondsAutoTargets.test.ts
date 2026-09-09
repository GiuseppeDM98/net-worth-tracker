import { describe, it, expect } from 'vitest';
import { resolveAutoEquityBondsSplit } from '@/lib/utils/equityBondsAutoTargets';

describe('resolveAutoEquityBondsSplit', () => {
  it('should keep the bond sleeve at the formula residual when other classes are present', () => {
    // Arrange — the owner's real account: 28 years old, BTP 10y at 3,997% → 77,02% equity
    // from the formula, with 12,5% commodity + 2,5% real estate + 7,5% crypto beside it.
    const formulaEquityPercentage = 77.015;
    const otherClassesTotal = 22.5;

    // Act
    const split = resolveAutoEquityBondsSplit(formulaEquityPercentage, otherClassesTotal);

    // Assert — the satellites are paid for by equity, not by bonds
    expect(split.equityPercentage).toBe(54.52);
    expect(split.bondsPercentage).toBe(22.98);
  });

  it('should assign the whole formula to equity when no other class is allocated', () => {
    const split = resolveAutoEquityBondsSplit(70, 0);

    expect(split.equityPercentage).toBe(70);
    expect(split.bondsPercentage).toBe(30);
  });

  it('should total 100 together with the other classes', () => {
    const otherClassesTotal = 18.75;
    const split = resolveAutoEquityBondsSplit(64.5, otherClassesTotal);

    expect(split.equityPercentage + split.bondsPercentage + otherClassesTotal).toBeCloseTo(100, 10);
  });

  it('should round both targets to two decimals', () => {
    const split = resolveAutoEquityBondsSplit(66.6666, 11.1111);

    expect(split.equityPercentage).toBe(55.56);
    expect(split.bondsPercentage).toBe(33.33);
  });

  it('should floor equity at zero when the other classes exceed the formula share', () => {
    // Arrange — an aggressive satellite sleeve larger than the whole equity budget
    const split = resolveAutoEquityBondsSplit(40, 55);

    // Assert — equity cannot go negative, and the overflow lands on the only remaining sleeve
    expect(split.equityPercentage).toBe(0);
    expect(split.bondsPercentage).toBe(45);
  });

  it('should still total 100 when equity is floored at zero', () => {
    const otherClassesTotal = 62;
    const split = resolveAutoEquityBondsSplit(35, otherClassesTotal);

    expect(split.equityPercentage + split.bondsPercentage + otherClassesTotal).toBeCloseTo(100, 10);
  });

  it('should leave nothing for either sleeve when the other classes fill the budget', () => {
    const split = resolveAutoEquityBondsSplit(60, 100);

    expect(split.equityPercentage).toBe(0);
    expect(split.bondsPercentage).toBe(0);
  });

  it('should never return a negative bond target when the other classes overflow past 100', () => {
    const split = resolveAutoEquityBondsSplit(60, 120);

    expect(split.equityPercentage).toBe(0);
    expect(split.bondsPercentage).toBe(0);
  });

  it('should give the whole budget to bonds when the formula returns zero equity', () => {
    const split = resolveAutoEquityBondsSplit(0, 0);

    expect(split.equityPercentage).toBe(0);
    expect(split.bondsPercentage).toBe(100);
  });

  it('should give the whole budget to equity when the formula returns 100 and nothing else is held', () => {
    const split = resolveAutoEquityBondsSplit(100, 0);

    expect(split.equityPercentage).toBe(100);
    expect(split.bondsPercentage).toBe(0);
  });

  it('should hold the bond target constant as the other classes grow', () => {
    // The whole point of the change: the defensive sleeve is decided by age and rate alone.
    const bondTargets = [0, 5, 12.5, 30].map(
      (other) => resolveAutoEquityBondsSplit(72, other).bondsPercentage
    );

    expect(new Set(bondTargets)).toEqual(new Set([28]));
  });

  it('should shrink the equity target one-for-one with the other classes', () => {
    const withoutSatellites = resolveAutoEquityBondsSplit(72, 0).equityPercentage;
    const withSatellites = resolveAutoEquityBondsSplit(72, 12).equityPercentage;

    expect(withoutSatellites - withSatellites).toBeCloseTo(12, 10);
  });
});
