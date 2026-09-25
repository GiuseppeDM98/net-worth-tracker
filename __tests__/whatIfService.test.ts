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

describe('calculateWhatIfImpact — honest baseline (2026-09-24)', () => {
  it('reads the FIRE number with the tax and the pensions in, on both sides of the event', () => {
    const plain = calculateWhatIfImpact(makeBaseline(), { eventType: 'windfall', lumpSumAmount: 50_000 })
    const taxed = calculateWhatIfImpact(
      makeBaseline({ honest: { pensions: [], taxBrackets: [], withdrawalTax: { basisToday: 100_000, rate: 26 }, now: new Date('2026-04-12T00:00:00') } }),
      { eventType: 'windfall', lumpSumAmount: 50_000 },
    )
    // 200k on a basis of 100k: half is gain, the number grosses up by 1 / (1 − 0,5 × 0,26).
    expect(plain.fire.fireNumber.before).toBe(600_000)
    expect(taxed.fire.fireNumber.before).toBeCloseTo(600_000 / 0.87, 4)
    // The windfall lands as basis: 250k on 150k of basis is a 40% gain share, 1 / (1 − 0,104).
    expect(taxed.fire.fireNumber.after).toBeCloseTo(600_000 / 0.896, 4)
    expect(taxed.fire.fireNumber.after as number).toBeLessThan(taxed.fire.fireNumber.before as number)
    // A purchase sells at the portfolio's gain share: 150k left on 75k of basis, still 50%.
    const purchase = calculateWhatIfImpact(
      makeBaseline({ honest: { pensions: [], taxBrackets: [], withdrawalTax: { basisToday: 100_000, rate: 26 }, now: new Date('2026-04-12T00:00:00') } }),
      { eventType: 'majorPurchase', lumpSumAmount: 50_000 },
    )
    expect(purchase.fire.fireNumber.after).toBeCloseTo(600_000 / 0.87, 4)

    const withPension = calculateWhatIfImpact(
      makeBaseline({ honest: { userAge: 40, pensions: [{ id: 'p', label: 'INPS', grossMonthlyAmount: 1000, monthsPerYear: 13, startAge: 40 }], taxBrackets: [], now: new Date('2026-04-12T00:00:00') } }),
      { eventType: 'windfall', lumpSumAmount: 0 },
    )
    expect(withPension.fire.fireNumber.before as number).toBeLessThan(600_000)
  })
})

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

describe('calculateWhatIfImpact — projections and the pension bridge', () => {
  it('should expose the two base-scenario walks it runs', () => {
    // Arrange
    const baseline = makeBaseline()
    const scenario: WhatIfScenario = { eventType: 'majorPurchase', lumpSumAmount: 50_000 }

    // Act
    const impact = calculateWhatIfImpact(baseline, scenario)

    // Assert: the walks start from the two net worths and agree with the years reported.
    expect(impact.projections.before?.initialNetWorth).toBe(200_000)
    expect(impact.projections.after?.initialNetWorth).toBe(150_000)
    expect(impact.projections.before?.baseYearsToFIRE).toBe(impact.fire.yearsToFIRE.before)
    expect(impact.projections.after?.baseYearsToFIRE).toBe(impact.fire.yearsToFIRE.after)
  })

  it('should still run the walk when a purchase empties the net worth', () => {
    // Arrange
    const baseline = makeBaseline()
    const scenario: WhatIfScenario = { eventType: 'majorPurchase', lumpSumAmount: 200_000 }

    // Act
    const impact = calculateWhatIfImpact(baseline, scenario)

    // Assert: savings alone still reach FIRE within the horizon.
    expect(impact.adjusted.netWorth).toBe(0)
    expect(impact.projections.after).not.toBeNull()
    expect(impact.fire.yearsToFIRE.after).not.toBeNull()
  })

  it('should read the bridge FIRE number and step the walk when the baseline carries a locked fund', () => {
    // Arrange
    const withoutBridge = makeBaseline()
    const withBridge = makeBaseline({ pensionBridge: { valueToday: 40_000, yearsToUnlock: 10 } })
    const scenario: WhatIfScenario = { eventType: 'windfall', lumpSumAmount: 10_000 }

    // Act
    const plain = calculateWhatIfImpact(withoutBridge, scenario)
    const bridged = calculateWhatIfImpact(withBridge, scenario)

    // Assert: the fund tops up the requirement at the unlock, so the number today is lower...
    expect(bridged.fire.fireNumber.before!).toBeLessThan(plain.fire.fireNumber.before!)
    expect(bridged.fire.progressToFI.before!).toBeGreaterThan(plain.fire.progressToFI.before!)
    // ...and the walk shows the step: year 10 jumps by more than the plain growth + savings.
    const rows = bridged.projections.before!.yearlyData
    const plainRows = plain.projections.before!.yearlyData
    expect(rows[9].baseNetWorth - rows[8].baseNetWorth).toBeGreaterThan(plainRows[9].baseNetWorth - plainRows[8].baseNetWorth + 30_000)
    // The bridge never reaches FIRE later than the plain walk.
    expect(bridged.fire.yearsToFIRE.before!).toBeLessThanOrEqual(plain.fire.yearsToFIRE.before!)
  })

  it('should ignore a bridge with nothing locked or no years to unlock', () => {
    // Arrange
    const plain = calculateWhatIfImpact(makeBaseline(), { eventType: 'windfall', lumpSumAmount: 10_000 })
    const zeroValue = calculateWhatIfImpact(makeBaseline({ pensionBridge: { valueToday: 0, yearsToUnlock: 10 } }), { eventType: 'windfall', lumpSumAmount: 10_000 })
    const zeroYears = calculateWhatIfImpact(makeBaseline({ pensionBridge: { valueToday: 40_000, yearsToUnlock: 0 } }), { eventType: 'windfall', lumpSumAmount: 10_000 })

    // Assert
    expect(zeroValue.fire.fireNumber.before).toBe(plain.fire.fireNumber.before)
    expect(zeroYears.fire.fireNumber.before).toBe(plain.fire.fireNumber.before)
    expect(zeroValue.projections.before?.yearlyData).toEqual(plain.projections.before?.yearlyData)
  })
})
