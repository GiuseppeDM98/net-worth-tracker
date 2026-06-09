import { describe, it, expect, vi } from 'vitest'

// Mock Firebase-dependent modules — whatIfService → fireService imports these transitively.
vi.mock('@/lib/services/expenseService', () => ({}))
vi.mock('@/lib/services/snapshotService', () => ({}))

import { getDefaultScenarios } from '@/lib/services/fireService'
import { applyScenarioToBaseline, calculateWhatIfImpact } from '@/lib/services/whatIfService'
import type { WhatIfBaseline, WhatIfScenario } from '@/types/whatIf'

function makeBaseline(overrides: Partial<WhatIfBaseline> = {}): WhatIfBaseline {
  return {
    netWorth: 200_000,
    liquidNetWorth: 150_000,
    illiquidNetWorth: 50_000,
    annualExpenses: 24_000,
    annualSavings: 12_000,
    withdrawalRate: 4,
    scenarios: getDefaultScenarios(),
    coast: {
      currentAge: 35,
      retirementAge: 60,
      annualExpenses: 24_000,
      realReturnRate: 4.5, // base 7% growth − 2.5% inflation
      inflationRate: 2.5,
      pensions: [],
      taxBrackets: [],
    },
    ...overrides,
  }
}

describe('applyScenarioToBaseline', () => {
  it('should reduce net worth by the lost-income window on job loss', () => {
    // Arrange
    const baseline = makeBaseline()
    const scenario: WhatIfScenario = { eventType: 'jobLoss', monthsWithoutIncome: 6 }

    // Act
    const adjusted = applyScenarioToBaseline(baseline, scenario)

    // Assert: (24000 + 12000) × 6/12 = 18000 lost
    expect(adjusted.netWorth).toBe(182_000)
    expect(adjusted.annualSavings).toBe(12_000)
    expect(adjusted.annualExpenses).toBe(24_000)
  })

  it('should only deduct the selected lost income when sources are chosen on job loss', () => {
    // Arrange: of the 36000 total income, only 20000 (one partner's salary) disappears.
    const baseline = makeBaseline()
    const scenario: WhatIfScenario = {
      eventType: 'jobLoss',
      monthsWithoutIncome: 6,
      lostAnnualIncome: 20_000,
    }

    // Act
    const adjusted = applyScenarioToBaseline(baseline, scenario)

    // Assert: 20000 × 6/12 = 10000 lost, not the full 18000
    expect(adjusted.netWorth).toBe(190_000)
  })

  it('should not touch net worth when no income is lost on job loss', () => {
    // Arrange
    const baseline = makeBaseline()
    const scenario: WhatIfScenario = {
      eventType: 'jobLoss',
      monthsWithoutIncome: 6,
      lostAnnualIncome: 0,
    }

    // Act
    const adjusted = applyScenarioToBaseline(baseline, scenario)

    // Assert
    expect(adjusted.netWorth).toBe(200_000)
  })

  it('should subtract the lump sum from net worth on a major purchase', () => {
    // Arrange
    const baseline = makeBaseline()
    const scenario: WhatIfScenario = { eventType: 'majorPurchase', lumpSumAmount: 50_000 }

    // Act
    const adjusted = applyScenarioToBaseline(baseline, scenario)

    // Assert
    expect(adjusted.netWorth).toBe(150_000)
  })

  it('should add the lump sum to net worth on a windfall', () => {
    // Arrange
    const baseline = makeBaseline()
    const scenario: WhatIfScenario = { eventType: 'windfall', lumpSumAmount: 50_000 }

    // Act
    const adjusted = applyScenarioToBaseline(baseline, scenario)

    // Assert
    expect(adjusted.netWorth).toBe(250_000)
  })

  it('should adjust savings and expenses but not net worth on a cashflow change', () => {
    // Arrange
    const baseline = makeBaseline()
    const scenario: WhatIfScenario = {
      eventType: 'cashflowChange',
      annualSavingsDelta: -6_000,
      annualExpensesDelta: 6_000,
    }

    // Act
    const adjusted = applyScenarioToBaseline(baseline, scenario)

    // Assert
    expect(adjusted.netWorth).toBe(200_000)
    expect(adjusted.annualSavings).toBe(6_000)
    expect(adjusted.annualExpenses).toBe(30_000)
    expect(adjusted.coastAnnualExpenses).toBe(30_000)
  })

  it('should never drive net worth below zero', () => {
    // Arrange
    const baseline = makeBaseline()
    const scenario: WhatIfScenario = { eventType: 'majorPurchase', lumpSumAmount: 999_999 }

    // Act
    const adjusted = applyScenarioToBaseline(baseline, scenario)

    // Assert
    expect(adjusted.netWorth).toBe(0)
  })
})

describe('calculateWhatIfImpact', () => {
  it('should lower the years to FIRE after a windfall', () => {
    // Arrange
    const baseline = makeBaseline()
    const scenario: WhatIfScenario = { eventType: 'windfall', lumpSumAmount: 100_000 }

    // Act
    const impact = calculateWhatIfImpact(baseline, scenario)

    // Assert
    expect(impact.fire.yearsToFIRE.before).not.toBeNull()
    expect(impact.fire.yearsToFIRE.after).not.toBeNull()
    expect(impact.fire.yearsToFIRE.delta).not.toBeNull()
    expect(impact.fire.yearsToFIRE.delta!).toBeLessThan(0)
  })

  it('should raise the FIRE number when expenses increase', () => {
    // Arrange
    const baseline = makeBaseline()
    const scenario: WhatIfScenario = { eventType: 'cashflowChange', annualExpensesDelta: 6_000 }

    // Act
    const impact = calculateWhatIfImpact(baseline, scenario)

    // Assert: 30000 / 0.04 = 750000, up from 600000
    expect(impact.fire.fireNumber.after).toBeCloseTo(750_000, 0)
    expect(impact.fire.fireNumber.delta).toBeCloseTo(150_000, 0)
  })

  it('should reduce progress to FI after a job loss', () => {
    // Arrange
    const baseline = makeBaseline()
    const scenario: WhatIfScenario = { eventType: 'jobLoss', monthsWithoutIncome: 12 }

    // Act
    const impact = calculateWhatIfImpact(baseline, scenario)

    // Assert
    expect(impact.fire.progressToFI.delta).not.toBeNull()
    expect(impact.fire.progressToFI.delta!).toBeLessThan(0)
  })

  it('should report zero deltas for an empty cashflow change', () => {
    // Arrange
    const baseline = makeBaseline()
    const scenario: WhatIfScenario = { eventType: 'cashflowChange' }

    // Act
    const impact = calculateWhatIfImpact(baseline, scenario)

    // Assert
    expect(impact.fire.fireNumber.delta).toBe(0)
    expect(impact.fire.progressToFI.delta).toBe(0)
    expect(impact.fire.annualAllowance.delta).toBe(0)
    expect(impact.fire.yearsToFIRE.delta).toBe(0)
    expect(impact.coast?.coastFireNumberToday.delta).toBe(0)
  })

  it('should improve Coast FIRE progress after a windfall', () => {
    // Arrange
    const baseline = makeBaseline()
    const scenario: WhatIfScenario = { eventType: 'windfall', lumpSumAmount: 100_000 }

    // Act
    const impact = calculateWhatIfImpact(baseline, scenario)

    // Assert
    expect(impact.coast).not.toBeNull()
    expect(impact.coast!.progressToCoastFI.delta).not.toBeNull()
    expect(impact.coast!.progressToCoastFI.delta!).toBeGreaterThan(0)
  })

  it('should omit Coast impact when the baseline has no Coast configuration', () => {
    // Arrange
    const baseline = makeBaseline({ coast: null })
    const scenario: WhatIfScenario = { eventType: 'windfall', lumpSumAmount: 100_000 }

    // Act
    const impact = calculateWhatIfImpact(baseline, scenario)

    // Assert
    expect(impact.coast).toBeNull()
    expect(impact.fire.fireNumber.before).toBeCloseTo(600_000, 0)
  })
})
