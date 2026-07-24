import { describe, it, expect } from 'vitest';

import {
  derivePensionDeductibleByYear,
  derivePensionContributionsByYearAndNature,
} from '@/lib/utils/pensionContributions';
import type { ContributionSource, PensionContribution } from '@/types/pension';

/**
 * Build a contribution record with only the fields the roll-ups read; everything else is filler.
 * `taxYear` defaults to the calendar year of `date` (the service's own default).
 */
function makeContribution(
  source: ContributionSource,
  amount: number,
  taxYear: number,
  overrides: Partial<PensionContribution> = {}
): PensionContribution {
  return {
    id: `contribution-${taxYear}-${source}-${amount}`,
    userId: 'user-1',
    assetId: 'fund-1',
    source,
    amount,
    date: new Date(taxYear, 5, 15),
    taxYear,
    deductible: source !== 'tfr',
    createdAt: new Date(taxYear, 5, 15),
    ...overrides,
  };
}

describe('derivePensionDeductibleByYear', () => {
  it('should return an empty map for no contributions', () => {
    expect(derivePensionDeductibleByYear([])).toEqual({});
  });

  it('should exclude TFR from the deductible base', () => {
    // Arrange: only TFR was conferred in 2026 — deductible by law is zero.
    const contributions = [makeContribution('tfr', 2000, 2026)];

    // Act
    const byYear = derivePensionDeductibleByYear(contributions);

    // Assert: the year does not appear at all (a missing year reads as 0 in the tax fold).
    expect(byYear).toEqual({});
  });

  it('should sum voluntary and employer contributions within the same tax year', () => {
    const contributions = [
      makeContribution('voluntary', 1200, 2026),
      makeContribution('employer', 800, 2026),
      makeContribution('tfr', 2500, 2026),
    ];

    expect(derivePensionDeductibleByYear(contributions)).toEqual({ 2026: 2000 });
  });

  it('should keep tax years separate', () => {
    const contributions = [
      makeContribution('voluntary', 1000, 2025),
      makeContribution('voluntary', 1500, 2026),
      makeContribution('employer', 500, 2026),
    ];

    expect(derivePensionDeductibleByYear(contributions)).toEqual({ 2025: 1000, 2026: 2000 });
  });

  it('should group by taxYear, not by the calendar year of the payment date', () => {
    // A January 2027 payroll instalment booked to the 2026 tax year (cash-principle straddle).
    const contributions = [
      makeContribution('voluntary', 300, 2026, { date: new Date(2027, 0, 10) }),
      makeContribution('voluntary', 700, 2026),
    ];

    expect(derivePensionDeductibleByYear(contributions)).toEqual({ 2026: 1000 });
  });

  it('should normalise a negatively-signed amount to its magnitude', () => {
    const contributions = [makeContribution('voluntary', -500, 2026)];

    expect(derivePensionDeductibleByYear(contributions)).toEqual({ 2026: 500 });
  });
});

describe('derivePensionContributionsByYearAndNature', () => {
  it('should return an empty map for no contributions', () => {
    expect(derivePensionContributionsByYearAndNature([])).toEqual({});
  });

  it('should split a year across all three natures, TFR included', () => {
    const contributions = [
      makeContribution('tfr', 2500, 2026),
      makeContribution('voluntary', 1200, 2026),
      makeContribution('employer', 800, 2026),
    ];

    expect(derivePensionContributionsByYearAndNature(contributions)).toEqual({
      2026: { tfr: 2500, voluntary: 1200, employer: 800 },
    });
  });

  it('should default the untouched natures of a year to zero', () => {
    const contributions = [makeContribution('tfr', 2500, 2026)];

    expect(derivePensionContributionsByYearAndNature(contributions)).toEqual({
      2026: { tfr: 2500, voluntary: 0, employer: 0 },
    });
  });

  it('should accumulate repeated contributions of the same nature', () => {
    const contributions = [
      makeContribution('voluntary', 100, 2026, { id: 'a' }),
      makeContribution('voluntary', 250, 2026, { id: 'b' }),
    ];

    expect(derivePensionContributionsByYearAndNature(contributions)[2026]).toEqual({
      tfr: 0,
      voluntary: 350,
      employer: 0,
    });
  });

  it('should build one independent bucket per tax year', () => {
    const contributions = [
      makeContribution('tfr', 2000, 2025),
      makeContribution('employer', 600, 2026),
    ];

    expect(derivePensionContributionsByYearAndNature(contributions)).toEqual({
      2025: { tfr: 2000, voluntary: 0, employer: 0 },
      2026: { tfr: 0, voluntary: 0, employer: 600 },
    });
  });
});
