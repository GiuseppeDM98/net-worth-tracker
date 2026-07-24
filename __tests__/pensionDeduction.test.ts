/**
 * Unit tests for the fondo pensione deduction/plafond engine (Fase P0).
 * Pure math — no Firebase, no React, no fake timers (the engine takes the target year as a param).
 *
 * Covers the full 18-case matrix of docs/specs/2-pension-fund/02-tax-engine.md §6.
 */

import { describe, it, expect } from 'vitest';
import {
  PENSION_DEDUCTION_CEILING_LEGACY,
  PENSION_DEDUCTION_CEILING_2026,
  getPensionDeductionCeiling,
  getPensionExtraDeductionCap,
  computePensionDeductionState,
  computePensionTaxBenefit,
  deriveBenefitTaxRate,
  computePensionTaxRecap,
} from '@/lib/utils/pensionDeduction';
import type { PensionDeductionInput } from '@/types/pension';
import { isLedgerAssetType } from '@/types/assetTransactions';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/**
 * Local progressive-tax fixture, same semantics as `calculateProgressiveTax` in fireService
 * (cumulative `upTo` bounds, the last bracket unbounded). Deliberately NOT imported from the
 * service: `taxOf` is injected precisely so this suite needs no Firebase mocks — importing
 * fireService would drag in `@/lib/firebase/config` and defeat the dependency inversion.
 */
const IRPEF_BRACKETS: Array<{ upTo: number | null; rate: number }> = [
  { upTo: 28000, rate: 23 },
  { upTo: 50000, rate: 35 },
  { upTo: null, rate: 43 },
];

function progressiveTaxOf(income: number): number {
  if (income <= 0) return 0;
  let tax = 0;
  let previousBound = 0;
  for (const bracket of IRPEF_BRACKETS) {
    const upperBound = bracket.upTo ?? income;
    const taxable = Math.max(Math.min(income, upperBound) - previousBound, 0);
    tax += taxable * (bracket.rate / 100);
    if (bracket.upTo === null || income <= upperBound) break;
    previousBound = upperBound;
  }
  return tax;
}

function buildInput(overrides: Partial<PensionDeductionInput> = {}): PensionDeductionInput {
  return {
    targetYear: 2026,
    enrollmentYear: 2026,
    isFirstJobPost2007: false,
    deductibleContribByYear: {},
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Data-model invariant (spec 01 §2) — guards the 18-case matrix below, which assumes the fund's
// value is statement-driven rather than replayed from a trade ledger.
// ---------------------------------------------------------------------------

describe('pensionFund asset type', () => {
  it('should stay outside the trade ledger so its value keeps coming from the statement', () => {
    // Act + Assert — a fondo pensione has no Registro operazioni: quantity is edited directly
    // (like cash/realestate) and incremented by pensionContributions, never replay-derived.
    expect(isLedgerAssetType('pensionFund')).toBe(false);
    expect(isLedgerAssetType('etf')).toBe(true); // control: the guard is not vacuously false
  });
});

// ---------------------------------------------------------------------------
// Per-year ceilings (cases 1-2)
// ---------------------------------------------------------------------------

describe('per-year deduction ceilings', () => {
  it('should apply the legacy ceiling through 2025 and the 2026 reform ceiling from 2026 on', () => {
    // Act + Assert
    expect(getPensionDeductionCeiling(2024)).toBeCloseTo(5164.57, 2);
    expect(getPensionDeductionCeiling(2025)).toBeCloseTo(5164.57, 2);
    expect(getPensionDeductionCeiling(2026)).toBe(5300);
    expect(getPensionDeductionCeiling(2030)).toBe(5300);
  });

  it('should derive the annual extra-deducibilita cap as half the ceiling of that year', () => {
    // Act + Assert
    expect(getPensionExtraDeductionCap(2025)).toBeCloseTo(2582.285, 3);
    expect(getPensionExtraDeductionCap(2026)).toBe(2650);
    expect(getPensionExtraDeductionCap(2025)).toBeCloseTo(PENSION_DEDUCTION_CEILING_LEGACY / 2, 6);
    expect(getPensionExtraDeductionCap(2026)).toBeCloseTo(PENSION_DEDUCTION_CEILING_2026 / 2, 6);
  });
});

// ---------------------------------------------------------------------------
// Ordinary deduction (cases 3-6)
// ---------------------------------------------------------------------------

describe('ordinary deduction (no extra-deducibilita eligibility)', () => {
  it('should cap a non-post-2007 worker at the ordinary ceiling and build no plafond', () => {
    // Arrange
    const input = buildInput({
      targetYear: 2026,
      enrollmentYear: 2020,
      isFirstJobPost2007: false,
      deductibleContribByYear: { 2026: 7000 },
    });

    // Act
    const state = computePensionDeductionState(input);

    // Assert
    expect(state).toEqual({
      ordinaryCeiling: 5300,
      deductibleContributions: 7000,
      plafondCreatedThisYear: 0,
      accruedPlafondResidual: 0,
      extraAvailableThisYear: 0,
      effectiveCeiling: 5300,
      deductedThisYear: 5300,
      isAccrualYear: false,
      isUsageYear: false,
    });
  });

  it('should deduct the full amount when contributions stay below the ceiling', () => {
    // Arrange
    const input = buildInput({ targetYear: 2026, deductibleContribByYear: { 2026: 3000 } });

    // Act
    const state = computePensionDeductionState(input);

    // Assert
    expect(state.deductedThisYear).toBe(3000);
    expect(state.effectiveCeiling).toBe(5300);
  });

  it('should deduct only the ceiling when contributions exceed it', () => {
    // Arrange
    const input = buildInput({
      targetYear: 2025,
      enrollmentYear: 2025,
      deductibleContribByYear: { 2025: 6000 },
    });

    // Act
    const state = computePensionDeductionState(input);

    // Assert
    expect(state.ordinaryCeiling).toBeCloseTo(5164.57, 2);
    expect(state.deductedThisYear).toBeCloseTo(5164.57, 2);
  });

  it('should fall back to the base state when the target year precedes enrollment', () => {
    // Arrange — eligible worker, but participation has not started yet in 2024.
    const input = buildInput({
      targetYear: 2024,
      enrollmentYear: 2026,
      isFirstJobPost2007: true,
    });

    // Act
    const state = computePensionDeductionState(input);

    // Assert
    expect(state.ordinaryCeiling).toBeCloseTo(5164.57, 2);
    expect(state.deductibleContributions).toBe(0);
    expect(state.deductedThisYear).toBe(0);
    expect(state.plafondCreatedThisYear).toBe(0);
    expect(state.accruedPlafondResidual).toBe(0);
    expect(state.extraAvailableThisYear).toBe(0);
    expect(state.isAccrualYear).toBe(false);
    expect(state.isUsageYear).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Extra-deducibilita fold (cases 7-13)
// ---------------------------------------------------------------------------

describe('extra-deducibilita fold (first employment after 2007)', () => {
  it('should bank the unused ceiling of an accrual year and count the current year in the residual', () => {
    // Arrange — enrolled 2026, target is the second accrual year.
    const input = buildInput({
      targetYear: 2027,
      enrollmentYear: 2026,
      isFirstJobPost2007: true,
      deductibleContribByYear: { 2026: 2000, 2027: 1500 },
    });

    // Act
    const state = computePensionDeductionState(input);

    // Assert
    expect(state.isAccrualYear).toBe(true);
    expect(state.isUsageYear).toBe(false);
    expect(state.plafondCreatedThisYear).toBeCloseTo(3800, 2); // 5300 - 1500
    expect(state.accruedPlafondResidual).toBeCloseTo(7100, 2); // 3300 banked in 2026 + 3800
    expect(state.extraAvailableThisYear).toBe(0); // no drawdown during accrual
    expect(state.deductedThisYear).toBe(1500);
  });

  it('should sum five accrual years at their own per-year ceilings when the window straddles 2026', () => {
    // Arrange — enrolled 2024, accrual window 2024..2028 (2 legacy years + 3 reform years),
    // employer-only contributions of 1.000 EUR per year.
    const contributions = { 2024: 1000, 2025: 1000, 2026: 1000, 2027: 1000, 2028: 1000 };
    const input = buildInput({
      targetYear: 2028,
      enrollmentYear: 2024,
      isFirstJobPost2007: true,
      deductibleContribByYear: contributions,
    });
    const expectedResidual = Object.keys(contributions)
      .map(Number)
      .reduce((sum, year) => sum + Math.max(0, getPensionDeductionCeiling(year) - 1000), 0);

    // Act
    const state = computePensionDeductionState(input);

    // Assert
    expect(expectedResidual).toBeCloseTo(21229.14, 2); // 2 x 4164.57 + 3 x 4300
    expect(state.accruedPlafondResidual).toBeCloseTo(expectedResidual, 2);
    expect(state.plafondCreatedThisYear).toBeCloseTo(4300, 2);
    expect(state.isAccrualYear).toBe(true);
  });

  it('should draw the plafond down in a usage year when contributions exceed the ordinary ceiling', () => {
    // Arrange — enrolled 2026, nothing paid during 2026..2030 (bank = 5 x 5300), first usage year 2031.
    const input = buildInput({
      targetYear: 2031,
      enrollmentYear: 2026,
      isFirstJobPost2007: true,
      deductibleContribByYear: { 2031: 7000 },
    });

    // Act
    const state = computePensionDeductionState(input);

    // Assert
    expect(state.isUsageYear).toBe(true);
    expect(state.isAccrualYear).toBe(false);
    expect(state.plafondCreatedThisYear).toBe(0);
    expect(state.extraAvailableThisYear).toBe(2650); // min(26500 banked, cap 2650)
    expect(state.effectiveCeiling).toBe(7950); // 5300 + 2650
    expect(state.deductedThisYear).toBe(7000);
    expect(state.accruedPlafondResidual).toBeCloseTo(24800, 2); // 26500 - 1700 actually used
  });

  it('should leave the plafond untouched in a usage year when contributions stay within the ordinary ceiling', () => {
    // Arrange — same bank as above, but only 4.000 EUR paid: nothing spills over the ceiling.
    const input = buildInput({
      targetYear: 2031,
      enrollmentYear: 2026,
      isFirstJobPost2007: true,
      deductibleContribByYear: { 2031: 4000 },
    });

    // Act
    const state = computePensionDeductionState(input);

    // Assert
    expect(state.extraAvailableThisYear).toBe(2650); // headroom offered...
    expect(state.accruedPlafondResidual).toBeCloseTo(26500, 2); // ...but none of it consumed
    expect(state.deductedThisYear).toBe(4000);
    expect(state.effectiveCeiling).toBe(7950);
  });

  it('should never offer more extra headroom than the annual cap, however large the bank', () => {
    // Arrange — bank of 26.500 EUR against a 20.000 EUR contribution year.
    const input = buildInput({
      targetYear: 2031,
      enrollmentYear: 2026,
      isFirstJobPost2007: true,
      deductibleContribByYear: { 2031: 20000 },
    });

    // Act
    const state = computePensionDeductionState(input);

    // Assert
    expect(state.extraAvailableThisYear).toBe(getPensionExtraDeductionCap(2031));
    expect(state.extraAvailableThisYear).toBeLessThan(26500);
    expect(state.deductedThisYear).toBe(7950); // capped at ordinary + annual extra cap
    expect(state.accruedPlafondResidual).toBeCloseTo(23850, 2); // 26500 - 2650 consumed
  });

  it('should expire the whole plafond once the usage window has closed', () => {
    // Arrange — enrolled 2026 => accrual 2026..2030, usage 2031..2050; 2051 is past the window.
    const input = buildInput({
      targetYear: 2051,
      enrollmentYear: 2026,
      isFirstJobPost2007: true,
      deductibleContribByYear: { 2051: 8000 },
    });

    // Act
    const state = computePensionDeductionState(input);

    // Assert
    expect(state.accruedPlafondResidual).toBe(0);
    expect(state.extraAvailableThisYear).toBe(0);
    expect(state.effectiveCeiling).toBe(5300);
    expect(state.deductedThisYear).toBe(5300);
    expect(state.isAccrualYear).toBe(false);
    expect(state.isUsageYear).toBe(false);
  });

  it('should treat years missing from the contribution map exactly as zero-contribution years', () => {
    // Arrange — the same history written explicitly and sparsely.
    const explicitInput = buildInput({
      targetYear: 2029,
      enrollmentYear: 2026,
      isFirstJobPost2007: true,
      deductibleContribByYear: { 2026: 1000, 2027: 0, 2028: 0, 2029: 0 },
    });
    const sparseInput = buildInput({
      targetYear: 2029,
      enrollmentYear: 2026,
      isFirstJobPost2007: true,
      deductibleContribByYear: { 2026: 1000 },
    });

    // Act
    const explicitState = computePensionDeductionState(explicitInput);
    const sparseState = computePensionDeductionState(sparseInput);

    // Assert
    expect(sparseState).toEqual(explicitState);
    expect(sparseState.accruedPlafondResidual).toBeCloseTo(20200, 2); // 4300 + 5300 + 5300 + 5300
  });
});

// ---------------------------------------------------------------------------
// IRPEF benefit and payout rate (cases 14-17)
// ---------------------------------------------------------------------------

describe('IRPEF benefit and payout tax rate', () => {
  it('should value a deduction that stays inside one bracket at that bracket rate', () => {
    // Arrange — RAL 40.000 and RAL-minus-deduction 35.000 are both in the 35% bracket.
    // Act
    const benefit = computePensionTaxBenefit(5000, 40000, progressiveTaxOf);

    // Assert
    expect(benefit).toBeCloseTo(5000 * 0.35, 6);
  });

  it('should split the benefit correctly when the deduction straddles two brackets', () => {
    // Arrange — RAL 30.000: the first 2.000 EUR deducted come off the 35% band, the next 3.000 off the 23% band.
    // Act
    const benefit = computePensionTaxBenefit(5000, 30000, progressiveTaxOf);

    // Assert
    expect(benefit).toBeCloseTo(2000 * 0.35 + 3000 * 0.23, 6); // 1390
    expect(benefit).toBeCloseTo(progressiveTaxOf(30000) - progressiveTaxOf(25000), 6);
  });

  it('should return a zero benefit at zero RAL while still computing the deduction state', () => {
    // Arrange
    const input = buildInput({ targetYear: 2026, deductibleContribByYear: { 2026: 3000 } });

    // Act
    const recap = computePensionTaxRecap(input, 0, progressiveTaxOf);

    // Assert
    expect(recap.taxSaving).toBe(0);
    expect(computePensionTaxBenefit(3000, 0, progressiveTaxOf)).toBe(0);
    expect(recap.state.deductedThisYear).toBe(3000);
    expect(recap.state.ordinaryCeiling).toBe(5300);
  });

  it('should decrease the payout tax rate from 15% to a 9% floor with years of participation', () => {
    // Act + Assert
    expect(deriveBenefitTaxRate(10)).toBeCloseTo(15, 6);
    expect(deriveBenefitTaxRate(15)).toBeCloseTo(15, 6);
    expect(deriveBenefitTaxRate(25)).toBeCloseTo(12, 6); // 15 - 10 x 0.3
    expect(deriveBenefitTaxRate(35)).toBeCloseTo(9, 6); // 15 - 20 x 0.3
    expect(deriveBenefitTaxRate(40)).toBeCloseTo(9, 6); // clamped at the floor
    expect(deriveBenefitTaxRate(-1)).toBeCloseTo(15, 6); // clamped at the max
  });
});

// ---------------------------------------------------------------------------
// Recap wrapper (case 18)
// ---------------------------------------------------------------------------

describe('computePensionTaxRecap', () => {
  it('should combine the deduction state and the euro saving consistently with the single functions', () => {
    // Arrange — the usage-year scenario above (deducts 7.000 EUR) against a 45.000 EUR RAL.
    const input = buildInput({
      targetYear: 2031,
      enrollmentYear: 2026,
      isFirstJobPost2007: true,
      deductibleContribByYear: { 2031: 7000 },
    });

    // Act
    const recap = computePensionTaxRecap(input, 45000, progressiveTaxOf);

    // Assert
    expect(recap.state).toEqual(computePensionDeductionState(input));
    expect(recap.taxSaving).toBeCloseTo(
      computePensionTaxBenefit(recap.state.deductedThisYear, 45000, progressiveTaxOf),
      6
    );
    expect(recap.taxSaving).toBeCloseTo(7000 * 0.35, 6); // fully inside the 35% band
  });
});
