import { describe, it, expect, vi } from 'vitest'

// Mock Firebase-dependent modules to prevent initialization errors in tests
vi.mock('@/lib/services/expenseService', () => ({}))
vi.mock('@/lib/services/snapshotService', () => ({}))

import {
  calculateCoastFireNetRealAnnualPension,
  calculateCoastFIREMetrics,
  calculateCoastFIREProjection,
  calculateProgressiveTax,
  calculateFIREMetrics,
  calculatePlannedFIREMetrics,
  calculateFIREProjection,
  calculateHistoricalFIRERunway,
  calculateFIRESensitivityMatrix,
  getDefaultCoastFireTaxBrackets,
  getDefaultScenarios,
} from '@/lib/services/fireService'
import type { MonthlySnapshot } from '@/types/assets'

function makeSnapshot(
  year: number,
  month: number,
  totalNetWorth: number,
  liquidNetWorth: number,
  fireNetWorth?: number
): MonthlySnapshot {
  return {
    userId: 'user-1',
    year,
    month,
    totalNetWorth,
    liquidNetWorth,
    illiquidNetWorth: Math.max(totalNetWorth - liquidNetWorth, 0),
    fireNetWorth,
    byAssetClass: {},
    byAsset: [],
    assetAllocation: {},
    createdAt: new Date(),
  }
}

function buildMonthlyBuckets(startYear: number, startMonth: number, count: number, expenses: number) {
  const buckets = new Map<string, { income: number; expenses: number }>()
  for (let index = 0; index < count; index++) {
    const date = new Date(startYear, startMonth - 1 + index, 1)
    const year = date.getFullYear()
    const month = date.getMonth() + 1
    buckets.set(`${year}-${month}`, { income: 0, expenses: -expenses })
  }
  return buckets
}

const FIXED_CURRENT_DATE = new Date('2026-04-12T00:00:00')
const RETIREMENT_DATE_65 = '2056-04-12'
const RETIREMENT_DATE_67 = '2058-04-12'
const RETIREMENT_DATE_68 = '2059-04-12'

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

describe('calculateCoastFIREMetrics', () => {
  const defaultTaxBrackets = getDefaultCoastFireTaxBrackets()

  it('should calculate the Coast FIRE number using the discounted FIRE target', () => {
    const result = calculateCoastFIREMetrics(300000, 40000, 4, 35, 65, 5, 2.5)
    const expectedFireNumber = 1000000
    const expectedCoastNumber = expectedFireNumber / Math.pow(1.05, 30)

    expect(result.fireNumberAtRetirement).toBe(expectedFireNumber)
    expect(result.coastFireNumberToday).toBeCloseTo(expectedCoastNumber, 2)
  })

  it('should calculate progress and residual gap correctly', () => {
    const result = calculateCoastFIREMetrics(200000, 40000, 4, 35, 65, 5, 2.5)

    expect(result.progressToCoastFI).toBeCloseTo((200000 / result.coastFireNumberToday) * 100, 6)
    expect(result.gapToCoastFI).toBeCloseTo(result.coastFireNumberToday - 200000, 6)
  })

  it('should treat retirement age at or below current age as zero years to retirement', () => {
    const result = calculateCoastFIREMetrics(800000, 40000, 4, 60, 60, 5, 2.5)

    expect(result.yearsToRetirement).toBe(0)
    expect(result.coastFireNumberToday).toBe(result.fireNumberAtRetirement)
    expect(result.futureValueAtRetirementWithoutNewContributions).toBe(800000)
  })

  it('should allow progress to exceed 100% once Coast FIRE is reached', () => {
    const result = calculateCoastFIREMetrics(500000, 40000, 4, 35, 65, 5, 2.5)

    expect(result.isCoastReached).toBe(true)
    expect(result.progressToCoastFI).toBeGreaterThan(100)
    expect(result.gapToCoastFI).toBe(0)
  })

  it('should reduce the retirement capital immediately when a pension starts at retirement age', () => {
    const result = calculateCoastFIREMetrics(
      250000,
      40000,
      4,
      35,
      65,
      5,
      2.5,
      [
        {
          id: 'p1',
          label: 'INPS',
          grossMonthlyAmount: 3000,
          monthsPerYear: 13,
          startDate: RETIREMENT_DATE_65,
        },
      ],
      defaultTaxBrackets,
      FIXED_CURRENT_DATE
    )

    expect(result.totalNetAnnualPensionAtRetirement).toBeGreaterThan(0)
    expect(result.retirementCapitalRequired).toBeLessThan(1000000)
    expect(result.annualPortfolioNeedAtRetirement).toBeLessThan(40000)
  })

  it('should require extra bridge capital when a pension starts after retirement age', () => {
    const result = calculateCoastFIREMetrics(
      250000,
      40000,
      4,
      35,
      60,
      4.5,
      2.5,
      [
        {
          id: 'p1',
          label: 'INPS',
          grossMonthlyAmount: 2500,
          monthsPerYear: 13,
          startDate: RETIREMENT_DATE_67,
        },
      ],
      defaultTaxBrackets,
      FIXED_CURRENT_DATE
    )

    expect(result.latestPensionStartDate).toBe(RETIREMENT_DATE_67)
    expect(result.retirementCapitalRequired).toBeGreaterThan(result.steadyStatePortfolioNeed)
  })

  it('should sum multiple pensions after calculating tax for each one separately', () => {
    const result = calculateCoastFIREMetrics(
      250000,
      40000,
      4,
      35,
      65,
      4.5,
      2.5,
      [
        {
          id: 'p1',
          label: 'Persona 1',
          grossMonthlyAmount: 2000,
          monthsPerYear: 13,
          startDate: RETIREMENT_DATE_65,
        },
        {
          id: 'p2',
          label: 'Persona 2',
          grossMonthlyAmount: 1500,
          monthsPerYear: 13,
          startDate: RETIREMENT_DATE_65,
        },
      ],
      defaultTaxBrackets,
      FIXED_CURRENT_DATE
    )

    const pensionTotal = result.totalNetAnnualPensionAtRetirement
    expect(pensionTotal).toBeGreaterThan(0)
    expect(result.totalNetAnnualPensionAtSteadyState).toBeCloseTo(pensionTotal, 6)
    expect(result.annualPortfolioNeedAtRetirement).toBeCloseTo(40000 - pensionTotal, 6)
  })
})

describe('calculateCoastFIREProjection', () => {
  const scenarios = getDefaultScenarios()

  it('should reuse FIRE scenarios through real return = growth - inflation', () => {
    const result = calculateCoastFIREProjection(250000, 30000, 4, 35, 60, scenarios)

    expect(result.scenarios.bear.realReturnRate).toBe(0.5)
    expect(result.scenarios.base.realReturnRate).toBe(4.5)
    expect(result.scenarios.bull.realReturnRate).toBe(8.5)
  })

  it('should expose a projection series through the retirement age', () => {
    const result = calculateCoastFIREProjection(250000, 30000, 4, 35, 38, scenarios)

    expect(result.projectionData).toHaveLength(4)
    expect(result.projectionData[0].age).toBe(35)
    expect(result.projectionData[3].age).toBe(38)
  })

  it('should allow liquid progress to be derived externally from the coast number', () => {
    const result = calculateCoastFIREProjection(250000, 30000, 4, 35, 60, scenarios)
    const liquidNetWorth = 150000
    const liquidProgress = (liquidNetWorth / result.scenarios.base.coastFireNumberToday) * 100

    expect(liquidProgress).toBeGreaterThan(0)
    expect(liquidProgress).toBeLessThan(result.scenarios.base.progressToCoastFI)
  })

  it('should keep Coast FIRE unchanged when no pensions are configured', () => {
    const baseWithoutPension = calculateCoastFIREMetrics(250000, 30000, 4, 35, 60, 4.5, 2.5)
    const result = calculateCoastFIREProjection(250000, 30000, 4, 35, 60, scenarios)

    expect(result.scenarios.base.retirementCapitalRequired).toBeCloseTo(baseWithoutPension.retirementCapitalRequired, 6)
    expect(result.scenarios.base.coastFireNumberToday).toBeCloseTo(baseWithoutPension.coastFireNumberToday, 6)
  })

  it('should deflate pension income differently across scenarios', () => {
    const pension = [
      {
        id: 'p1',
        label: 'INPS',
        grossMonthlyAmount: 4242,
        monthsPerYear: 13,
        startDate: RETIREMENT_DATE_68,
      },
    ]
    const result = calculateCoastFIREProjection(
      250000,
      30000,
      4,
      35,
      60,
      scenarios,
      pension,
      getDefaultCoastFireTaxBrackets(),
      FIXED_CURRENT_DATE
    )

    expect(result.scenarios.bear.totalNetAnnualPensionAtSteadyState).toBeLessThan(
      result.scenarios.base.totalNetAnnualPensionAtSteadyState
    )
    expect(result.scenarios.base.totalNetAnnualPensionAtSteadyState).toBeLessThan(
      result.scenarios.bull.totalNetAnnualPensionAtSteadyState
    )
  })
})

describe('state pension tax helpers', () => {
  it('should apply progressive tax brackets correctly', () => {
    const brackets = getDefaultCoastFireTaxBrackets()
    const tax = calculateProgressiveTax(60000, brackets)

    expect(tax).toBe(15000 * 0.23 + 13000 * 0.25 + 22000 * 0.35 + 10000 * 0.43)
  })

  it('should convert a future nominal pension into a net real annual amount', () => {
    const result = calculateCoastFireNetRealAnnualPension(
      {
        id: 'p1',
        label: 'INPS',
        grossMonthlyAmount: 4242,
        monthsPerYear: 13,
        startDate: RETIREMENT_DATE_68,
      },
      35,
      2.5,
      getDefaultCoastFireTaxBrackets(),
      FIXED_CURRENT_DATE
    )

    expect(result.grossAnnualFutureNominal).toBe(4242 * 13)
    expect(result.grossAnnualRealAtStart).toBeLessThan(result.grossAnnualFutureNominal)
    expect(result.netAnnualRealAtStart).toBeLessThan(result.grossAnnualRealAtStart)
  })

  it('should respect custom tax brackets', () => {
    const pension = calculateCoastFireNetRealAnnualPension(
      {
        id: 'p1',
        label: 'INPS',
        grossMonthlyAmount: 3000,
        monthsPerYear: 13,
        startDate: RETIREMENT_DATE_65,
      },
      35,
      2.5,
      [
        { id: 'flat', upTo: null, rate: 10 },
      ],
      FIXED_CURRENT_DATE
    )

    expect(pension.netAnnualRealAtStart).toBeCloseTo(pension.grossAnnualRealAtStart * 0.9, 6)
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

describe('calculateHistoricalFIRERunway', () => {
  it('should skip the first 11 snapshots for rolling 12-month runway', () => {
    const snapshots = Array.from({ length: 12 }, (_, index) =>
      makeSnapshot(2024, index + 1, 120000 + index * 5000, 60000 + index * 2000, 100000 + index * 4000)
    )
    const buckets = buildMonthlyBuckets(2024, 1, 12, 10000)

    const result = calculateHistoricalFIRERunway(snapshots, buckets, 4, false)

    expect(result.runwayData).toHaveLength(1)
    expect(result.runwayData[0].month).toBe(12)
  })

  it('should use fireNetWorth when primary residence is excluded and totalNetWorth when included', () => {
    const snapshots = Array.from({ length: 12 }, (_, index) =>
      makeSnapshot(2024, index + 1, 240000, 120000, 180000)
    )
    const buckets = buildMonthlyBuckets(2024, 1, 12, 12000)

    const excluded = calculateHistoricalFIRERunway(snapshots, buckets, 4, false)
    const included = calculateHistoricalFIRERunway(snapshots, buckets, 4, true)

    expect(excluded.runwayData[0].fireNetWorthUsed).toBe(180000)
    expect(included.runwayData[0].fireNetWorthUsed).toBe(240000)
  })

  it('should fall back to totalNetWorth when historical fireNetWorth is missing', () => {
    const snapshots = Array.from({ length: 12 }, (_, index) =>
      makeSnapshot(2024, index + 1, 200000, 100000)
    )
    const buckets = buildMonthlyBuckets(2024, 1, 12, 10000)

    const result = calculateHistoricalFIRERunway(snapshots, buckets, 4, false)

    expect(result.runwayData[0].fireNetWorthUsed).toBe(200000)
  })

  it('should return null runway values when trailing expenses are zero', () => {
    const snapshots = Array.from({ length: 12 }, (_, index) =>
      makeSnapshot(2024, index + 1, 200000, 100000, 180000)
    )
    const buckets = buildMonthlyBuckets(2024, 1, 12, 0)

    const result = calculateHistoricalFIRERunway(snapshots, buckets, 4, false)

    expect(result.runwayData[0].yearsOfExpenses).toBeNull()
    expect(result.runwayData[0].liquidYearsOfExpenses).toBeNull()
    expect(result.runwayData[0].fireProgressToFI).toBeNull()
  })

  it('should compute delta vs 12 months ago only when comparison point exists', () => {
    const snapshots = Array.from({ length: 24 }, (_, index) =>
      makeSnapshot(2024 + Math.floor(index / 12), (index % 12) + 1, 120000 + index * 10000, 60000 + index * 5000, 100000 + index * 8000)
    )
    const buckets = buildMonthlyBuckets(2024, 1, 24, 10000)

    const noComparison = calculateHistoricalFIRERunway(snapshots.slice(0, 23), buckets, 4, false)
    const withComparison = calculateHistoricalFIRERunway(snapshots, buckets, 4, false)

    expect(noComparison.runwaySummary.totalDeltaVs12Months).toBeNull()
    expect(withComparison.runwaySummary.totalDeltaVs12Months).not.toBeNull()
  })

  it('should compute the summary delta from the same one-decimal values shown in the UI', () => {
    const snapshots = [
      ...Array.from({ length: 12 }, (_, index) =>
        makeSnapshot(2024, index + 1, 702000, 300000, 702000)
      ),
      ...Array.from({ length: 12 }, (_, index) =>
        makeSnapshot(2025, index + 1, index === 11 ? 612000 : 702000, 300000, index === 11 ? 612000 : 702000)
      ),
    ]
    const buckets = buildMonthlyBuckets(2024, 1, 24, 10000)

    const result = calculateHistoricalFIRERunway(snapshots, buckets, 4, false)

    expect(result.runwaySummary.currentYearsOfExpenses).toBeCloseTo(5.1, 2)
    expect(result.runwaySummary.totalDeltaVs12Months).toBe(-0.8)
  })

  it('should compute a separate liquid delta for the summary card', () => {
    const snapshots = [
      ...Array.from({ length: 12 }, (_, index) =>
        makeSnapshot(2024, index + 1, 702000, 444000, 702000)
      ),
      ...Array.from({ length: 12 }, (_, index) =>
        makeSnapshot(2025, index + 1, 612000, index === 11 ? 528000 : 444000, 612000)
      ),
    ]
    const buckets = buildMonthlyBuckets(2024, 1, 24, 10000)

    const result = calculateHistoricalFIRERunway(snapshots, buckets, 4, false)

    expect(result.runwaySummary.currentLiquidYearsOfExpenses).toBeCloseTo(4.4, 2)
    expect(result.runwaySummary.liquidDeltaVs12Months).toBe(0.7)
  })
})

describe('calculateFIRESensitivityMatrix', () => {
  const scenarios = getDefaultScenarios()

  it('should align the baseline cell with the base scenario projection', () => {
    const baselineProjection = calculateFIREProjection(500000, 30000, 20000, 4, scenarios)
    const matrix = calculateFIRESensitivityMatrix(500000, 30000, 20000, 4, scenarios)
    const baselineCell = matrix.rows.flatMap((row) => row.cells).find((cell) => cell.isBaseline)

    expect(matrix.baselineYearsToFIRE).toBe(baselineProjection.baseYearsToFIRE)
    expect(baselineCell?.yearsToFIRE).toBe(baselineProjection.baseYearsToFIRE)
  })

  it('should improve or hold years-to-fire when annual savings increase', () => {
    const matrix = calculateFIRESensitivityMatrix(500000, 30000, 20000, 4, scenarios)
    const baselineRow = matrix.rows.find((row) => row.multiplier === 1)!

    for (let index = 1; index < baselineRow.cells.length; index++) {
      const previous = baselineRow.cells[index - 1].yearsToFIRE
      const current = baselineRow.cells[index].yearsToFIRE
      if (previous !== null && current !== null) {
        expect(current).toBeLessThanOrEqual(previous)
      }
    }
  })

  it('should worsen or hold years-to-fire when annual expenses increase', () => {
    const matrix = calculateFIRESensitivityMatrix(500000, 30000, 20000, 4, scenarios)
    const baselineColumnIndex = matrix.columns.findIndex((column) => column.isBaseline)
    const columnValues = matrix.rows.map((row) => row.cells[baselineColumnIndex].yearsToFIRE)

    for (let index = 1; index < columnValues.length; index++) {
      const previous = columnValues[index - 1]
      const current = columnValues[index]
      if (previous !== null && current !== null) {
        expect(current).toBeGreaterThanOrEqual(previous)
      }
    }
  })
})
