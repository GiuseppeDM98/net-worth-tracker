import { describe, it, expect, vi } from 'vitest'

// Mock Firebase-dependent modules to prevent initialization errors in tests
vi.mock('@/lib/services/expenseService', () => ({}))
vi.mock('@/lib/services/snapshotService', () => ({}))

import {
  calculateFIREMetrics,
  calculatePlannedFIREMetrics,
  calculateFIREProjection,
  getDefaultScenarios,
} from '@/lib/services/fireService'

describe('calculateFIREMetrics', () => {
  it('should calculate FIRE Number correctly', () => {
    // FIRE Number = annualExpenses / (withdrawalRate / 100)
    // 40000 / 0.04 = 1,000,000
    const result = calculateFIREMetrics(500000, 40000, 4)
    expect(result.fireNumber).toBe(1000000)
  })

  it('should calculate progress to FI', () => {
    // Progress = (500000 / 1000000) * 100 = 50%
    const result = calculateFIREMetrics(500000, 40000, 4)
    expect(result.progressToFI).toBe(50)
  })

  it('should calculate allowances correctly', () => {
    // Annual = 500000 * 0.04 = 20000
    const result = calculateFIREMetrics(500000, 40000, 4)
    expect(result.annualAllowance).toBe(20000)
    expect(result.monthlyAllowance).toBeCloseTo(20000 / 12)
    expect(result.dailyAllowance).toBeCloseTo(20000 / 365)
  })

  it('should calculate current withdrawal rate', () => {
    // Current WR = (40000 / 500000) * 100 = 8%
    const result = calculateFIREMetrics(500000, 40000, 4)
    expect(result.currentWR).toBe(8)
  })

  it('should calculate years of expenses covered', () => {
    // Years = 1 / (8/100) = 12.5
    const result = calculateFIREMetrics(500000, 40000, 4)
    expect(result.yearsOfExpenses).toBe(12.5)
  })

  it('should handle zero withdrawal rate', () => {
    const result = calculateFIREMetrics(500000, 40000, 0)
    expect(result.fireNumber).toBe(0)
    expect(result.progressToFI).toBe(0)
  })

  it('should handle zero net worth', () => {
    const result = calculateFIREMetrics(0, 40000, 4)
    expect(result.progressToFI).toBe(0)
    expect(result.annualAllowance).toBe(0)
    expect(result.currentWR).toBe(0)
    expect(result.yearsOfExpenses).toBe(0)
  })

  it('should show 100%+ progress when FIRE is achieved', () => {
    // NW = 1,200,000 > FIRE Number = 1,000,000
    const result = calculateFIREMetrics(1200000, 40000, 4)
    expect(result.progressToFI).toBe(120)
  })

  it('should pass through input values', () => {
    const result = calculateFIREMetrics(500000, 40000, 4)
    expect(result.currentNetWorth).toBe(500000)
    expect(result.annualExpenses).toBe(40000)
    expect(result.withdrawalRate).toBe(4)
  })
})

describe('calculatePlannedFIREMetrics', () => {
  it('should calculate planned FIRE Number', () => {
    // 30000 / 0.04 = 750,000
    const result = calculatePlannedFIREMetrics(500000, 30000, 4)
    expect(result.plannedFireNumber).toBe(750000)
  })

  it('should calculate planned progress', () => {
    // (500000 / 750000) * 100 = 66.67%
    const result = calculatePlannedFIREMetrics(500000, 30000, 4)
    expect(result.plannedProgressToFI).toBeCloseTo(66.67, 1)
  })

  it('should handle zero withdrawal rate', () => {
    const result = calculatePlannedFIREMetrics(500000, 30000, 0)
    expect(result.plannedFireNumber).toBe(0)
    expect(result.plannedProgressToFI).toBe(0)
  })
})

describe('getDefaultScenarios', () => {
  it('should return three scenarios', () => {
    const scenarios = getDefaultScenarios()
    expect(scenarios.bear).toBeDefined()
    expect(scenarios.base).toBeDefined()
    expect(scenarios.bull).toBeDefined()
  })

  it('should have Bull > Base > Bear growth rates', () => {
    const s = getDefaultScenarios()
    expect(s.bull.growthRate).toBeGreaterThan(s.base.growthRate)
    expect(s.base.growthRate).toBeGreaterThan(s.bear.growthRate)
  })

  it('should have Bear > Base > Bull inflation rates', () => {
    const s = getDefaultScenarios()
    expect(s.bear.inflationRate).toBeGreaterThan(s.base.inflationRate)
    expect(s.base.inflationRate).toBeGreaterThan(s.bull.inflationRate)
  })
})

describe('calculateFIREProjection', () => {
  const scenarios = getDefaultScenarios()

  it('should return yearly data for the projection horizon', () => {
    const result = calculateFIREProjection(100000, 30000, 20000, 4, scenarios, 10)
    // Should have data for up to 10 years (may stop early if all reach FIRE)
    expect(result.yearlyData.length).toBeGreaterThan(0)
    expect(result.yearlyData.length).toBeLessThanOrEqual(10)
  })

  it('should apply growth correctly on year 1', () => {
    const result = calculateFIREProjection(100000, 30000, 20000, 4, scenarios, 1)
    const year1 = result.yearlyData[0]

    // Bear: 100000 * 1.04 + 20000 = 124000
    expect(year1.bearNetWorth).toBeCloseTo(124000, -2)
    // Base: 100000 * 1.07 + 20000 = 127000
    expect(year1.baseNetWorth).toBeCloseTo(127000, -2)
    // Bull: 100000 * 1.10 + 20000 = 130000
    expect(year1.bullNetWorth).toBeCloseTo(130000, -2)
  })

  it('should inflate expenses per scenario', () => {
    const result = calculateFIREProjection(100000, 30000, 20000, 4, scenarios, 2)
    const year1 = result.yearlyData[0]
    const year2 = result.yearlyData[1]

    // Bear inflation 3.5%: expenses grow faster
    expect(year2.bearExpenses).toBeGreaterThan(year1.bearExpenses)
    // Bull inflation 1.5%: expenses grow slower
    expect(year2.bullExpenses - year1.bullExpenses).toBeLessThan(
      year2.bearExpenses - year1.bearExpenses
    )
  })

  it('should calculate FIRE Numbers per scenario', () => {
    const result = calculateFIREProjection(100000, 30000, 20000, 4, scenarios, 1)
    const year1 = result.yearlyData[0]

    // FIRE Number = inflated expenses / 0.04
    expect(year1.bearFireNumber).toBeCloseTo(year1.bearExpenses / 0.04, -2)
    expect(year1.baseFireNumber).toBeCloseTo(year1.baseExpenses / 0.04, -2)
    expect(year1.bullFireNumber).toBeCloseTo(year1.bullExpenses / 0.04, -2)
  })

  it('should detect FIRE reached when portfolio >= FIRE Number', () => {
    // Large initial NW should reach FIRE quickly
    const result = calculateFIREProjection(2000000, 30000, 0, 4, scenarios, 50)

    // All scenarios should reach FIRE (NW >> FIRE Number)
    expect(result.bullYearsToFIRE).not.toBeNull()
    expect(result.baseYearsToFIRE).not.toBeNull()
    expect(result.bearYearsToFIRE).not.toBeNull()
  })

  it('should have Bull reach FIRE first, Bear last', () => {
    const result = calculateFIREProjection(500000, 30000, 20000, 4, scenarios, 50)

    if (result.bullYearsToFIRE && result.baseYearsToFIRE && result.bearYearsToFIRE) {
      expect(result.bullYearsToFIRE).toBeLessThanOrEqual(result.baseYearsToFIRE)
      expect(result.baseYearsToFIRE).toBeLessThanOrEqual(result.bearYearsToFIRE)
    }
  })

  it('should stop adding savings after FIRE is reached', () => {
    // High NW + modest savings → FIRE reached quickly
    const result = calculateFIREProjection(2000000, 30000, 50000, 4, scenarios, 50)

    if (result.bullYearsToFIRE !== null && result.bullYearsToFIRE < result.yearlyData.length - 1) {
      const yearAtFIRE = result.yearlyData[result.bullYearsToFIRE - 1]
      const yearAfterFIRE = result.yearlyData[result.bullYearsToFIRE]

      // After FIRE, portfolio grows only by market return (no savings added)
      // Growth should be roughly bullGrowthRate%, not bullGrowthRate% + savings
      const growthAfterFIRE = yearAfterFIRE.bullNetWorth / yearAtFIRE.bullNetWorth - 1
      const expectedGrowth = scenarios.bull.growthRate / 100

      expect(growthAfterFIRE).toBeCloseTo(expectedGrowth, 1)
    }
  })

  it('should stop early when all scenarios reached FIRE + 5 years', () => {
    // Very high NW → all scenarios reach FIRE in year 1
    const result = calculateFIREProjection(10000000, 30000, 0, 4, scenarios, 50)

    // Should stop well before 50 years (FIRE year 1 + 5 = 6 max)
    expect(result.yearlyData.length).toBeLessThanOrEqual(10)
  })

  it('should return metadata correctly', () => {
    const result = calculateFIREProjection(100000, 30000, 20000, 4, scenarios, 10)
    expect(result.annualSavings).toBe(20000)
    expect(result.initialNetWorth).toBe(100000)
    expect(result.initialExpenses).toBe(30000)
    expect(result.scenarios).toEqual(scenarios)
  })

  it('should handle zero savings', () => {
    const result = calculateFIREProjection(100000, 30000, 0, 4, scenarios, 5)
    expect(result.yearlyData.length).toBeGreaterThan(0)

    // Without savings, growth is purely market returns
    const year1 = result.yearlyData[0]
    expect(year1.baseNetWorth).toBeCloseTo(100000 * 1.07, -2)
  })

  it('should handle zero withdrawal rate', () => {
    const result = calculateFIREProjection(100000, 30000, 20000, 0, scenarios, 5)
    // FIRE Number should be 0 when WR is 0
    result.yearlyData.forEach(yr => {
      expect(yr.bearFireNumber).toBe(0)
      expect(yr.baseFireNumber).toBe(0)
      expect(yr.bullFireNumber).toBe(0)
    })
  })
})
