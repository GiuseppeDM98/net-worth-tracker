import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock Firebase-dependent modules to prevent initialization errors in tests
vi.mock('@/lib/services/expenseService', () => ({}))
vi.mock('@/lib/services/snapshotService', () => ({}))
vi.mock('@/lib/services/assetAllocationService', () => ({}))

import {
  calculateROI,
  calculateCAGR,
  calculateTimeWeightedReturn,
  calculateIRR,
  calculateSharpeRatio,
  calculateVolatility,
  calculateMaxDrawdown,
  calculateDrawdownDuration,
  calculateRecoveryTime,
  getSnapshotsForPeriod,
  getCashFlowsFromExpenses,
  calculateYocMetrics,
} from '@/lib/services/performanceService'
import { MonthlySnapshot } from '@/types/assets'
import { CashFlowData } from '@/types/performance'
import { Expense, ExpenseType } from '@/types/expenses'

// Helper to create minimal snapshot objects for testing
function makeSnapshot(year: number, month: number, totalNetWorth: number): MonthlySnapshot {
  return { year, month, totalNetWorth, isDummy: false } as MonthlySnapshot
}

// Helper to create cash flow data
function makeCashFlow(year: number, month: number, netCashFlow: number): CashFlowData {
  return {
    date: new Date(year, month - 1, 1),
    income: netCashFlow > 0 ? netCashFlow : 0,
    expenses: netCashFlow < 0 ? Math.abs(netCashFlow) : 0,
    dividendIncome: 0,
    netCashFlow,
  }
}

// Helper to create minimal Expense objects for testing
function makeExpense(year: number, month: number, day: number, type: ExpenseType, amount: number, categoryId = 'cat1'): Expense {
  return {
    id: `exp-${year}-${month}-${day}-${amount}`,
    userId: 'user1',
    type,
    categoryId,
    categoryName: 'Test',
    amount,
    currency: 'EUR',
    date: new Date(year, month - 1, day),
    createdAt: new Date(),
    updatedAt: new Date(),
  } as Expense
}

// ─── ROI ───

describe('calculateROI', () => {
  it('should calculate positive ROI', () => {
    // Gain = 120000 - 100000 - 5000 = 15000. ROI = (15000/100000)*100 = 15%
    expect(calculateROI(100000, 120000, 5000)).toBe(15)
  })

  it('should calculate negative ROI (loss)', () => {
    // Gain = 90000 - 100000 - 0 = -10000. ROI = -10%
    expect(calculateROI(100000, 90000, 0)).toBe(-10)
  })

  it('should return null when start NW is zero', () => {
    expect(calculateROI(0, 100000, 5000)).toBeNull()
  })

  it('should handle zero gain', () => {
    // Gain = 105000 - 100000 - 5000 = 0
    expect(calculateROI(100000, 105000, 5000)).toBe(0)
  })

  it('should account for large contributions', () => {
    // Without CF adjustment: naive return = 100%. With CF: true return = 0%
    expect(calculateROI(100000, 200000, 100000)).toBe(0)
  })
})

// ─── CAGR ───

describe('calculateCAGR', () => {
  it('should calculate CAGR for 12 months', () => {
    // (110000 / (100000 + 0))^(1/1) - 1 = 10%
    const result = calculateCAGR(100000, 110000, 0, 12)
    expect(result).toBeCloseTo(10, 0)
  })

  it('should calculate CAGR for multi-year period', () => {
    // (121000 / 100000)^(1/2) - 1 = 10% over 24 months
    const result = calculateCAGR(100000, 121000, 0, 24)
    expect(result).toBeCloseTo(10, 0)
  })

  it('should return null when numberOfMonths < 1', () => {
    expect(calculateCAGR(100000, 110000, 0, 0)).toBeNull()
  })

  it('should return null when adjusted start <= 0', () => {
    // Adjusted start = 100000 + (-150000) = -50000
    expect(calculateCAGR(100000, 50000, -150000, 12)).toBeNull()
  })

  it('should handle negative CAGR (loss)', () => {
    const result = calculateCAGR(100000, 90000, 0, 12)
    expect(result).not.toBeNull()
    expect(result!).toBeLessThan(0)
  })
})

// ─── Sharpe Ratio ───

describe('calculateSharpeRatio', () => {
  it('should calculate Sharpe correctly', () => {
    // (10 - 2) / 15 = 0.533
    expect(calculateSharpeRatio(10, 2, 15)).toBeCloseTo(0.533, 2)
  })

  it('should return null when volatility is zero', () => {
    expect(calculateSharpeRatio(10, 2, 0)).toBeNull()
  })

  it('should handle negative Sharpe (underperformance)', () => {
    // (1 - 3) / 10 = -0.2
    expect(calculateSharpeRatio(1, 3, 10)).toBeCloseTo(-0.2)
  })

  it('should handle zero return', () => {
    expect(calculateSharpeRatio(0, 2, 10)).toBeCloseTo(-0.2)
  })
})

// ─── Volatility ───

describe('calculateVolatility', () => {
  it('should return null with fewer than 2 snapshots', () => {
    expect(calculateVolatility([makeSnapshot(2025, 1, 100000)], [])).toBeNull()
  })

  it('should calculate volatility from monthly returns', () => {
    // Steady growth: low volatility
    const snapshots = [
      makeSnapshot(2025, 1, 100000),
      makeSnapshot(2025, 2, 101000),
      makeSnapshot(2025, 3, 102000),
      makeSnapshot(2025, 4, 103000),
    ]
    const result = calculateVolatility(snapshots, [])
    expect(result).not.toBeNull()
    // Low volatility because returns are consistent (~1% monthly)
    expect(result!).toBeLessThan(5)
  })

  it('should filter extreme values (>±50%)', () => {
    const snapshots = [
      makeSnapshot(2025, 1, 100000),
      makeSnapshot(2025, 2, 200000), // +100% spike (should be filtered)
      makeSnapshot(2025, 3, 102000),
      makeSnapshot(2025, 4, 103000),
    ]
    const result = calculateVolatility(snapshots, [])
    // Should still return a result after filtering the spike
    expect(result).not.toBeNull()
  })

  it('should adjust for cash flows', () => {
    const snapshots = [
      makeSnapshot(2025, 1, 100000),
      makeSnapshot(2025, 2, 150000), // Looks like +50% but CF explains it
      makeSnapshot(2025, 3, 152000),
    ]
    const cashFlows = [makeCashFlow(2025, 2, 49000)] // Large contribution
    const result = calculateVolatility(snapshots, cashFlows)
    expect(result).not.toBeNull()
    // After adjusting for CF, actual return is ~1%, so volatility should be low
    expect(result!).toBeLessThan(10)
  })
})

// ─── Max Drawdown ───

describe('calculateMaxDrawdown', () => {
  it('should return null values with fewer than 2 snapshots', () => {
    const result = calculateMaxDrawdown([makeSnapshot(2025, 1, 100000)], [])
    expect(result.value).toBeNull()
    expect(result.troughDate).toBeNull()
  })

  it('should return null values when portfolio only goes up', () => {
    const snapshots = [
      makeSnapshot(2025, 1, 100000),
      makeSnapshot(2025, 2, 110000),
      makeSnapshot(2025, 3, 120000),
    ]
    const result = calculateMaxDrawdown(snapshots, [])
    expect(result.value).toBeNull()
  })

  it('should calculate drawdown correctly', () => {
    const snapshots = [
      makeSnapshot(2025, 1, 100000), // Peak
      makeSnapshot(2025, 2, 85000),  // -15%
      makeSnapshot(2025, 3, 90000),  // Partial recovery
    ]
    const result = calculateMaxDrawdown(snapshots, [])
    expect(result.value).not.toBeNull()
    expect(result.value!).toBeCloseTo(-15, 0)
    expect(result.troughDate).toBe('02/25')
  })

  it('should find the deepest drawdown', () => {
    const snapshots = [
      makeSnapshot(2025, 1, 100000),
      makeSnapshot(2025, 2, 95000),  // -5%
      makeSnapshot(2025, 3, 105000), // New peak
      makeSnapshot(2025, 4, 84000),  // -20% from 105000
      makeSnapshot(2025, 5, 100000),
    ]
    const result = calculateMaxDrawdown(snapshots, [])
    expect(result.value!).toBeCloseTo(-20, 0)
    expect(result.troughDate).toBe('04/25')
  })
})

// ─── Drawdown Duration ───

describe('calculateDrawdownDuration', () => {
  it('should return null values with fewer than 2 snapshots', () => {
    const result = calculateDrawdownDuration([makeSnapshot(2025, 1, 100000)], [])
    expect(result.duration).toBeNull()
  })

  it('should return null values when no drawdown', () => {
    const snapshots = [
      makeSnapshot(2025, 1, 100000),
      makeSnapshot(2025, 2, 110000),
    ]
    const result = calculateDrawdownDuration(snapshots, [])
    expect(result.duration).toBeNull()
  })

  it('should calculate duration from peak to recovery', () => {
    const snapshots = [
      makeSnapshot(2025, 1, 100000), // Peak (index 0)
      makeSnapshot(2025, 2, 90000),  // Drawdown
      makeSnapshot(2025, 3, 95000),  // Partial recovery
      makeSnapshot(2025, 4, 101000), // Recovery (index 3)
    ]
    const result = calculateDrawdownDuration(snapshots, [])
    expect(result.duration).not.toBeNull()
    // Duration: from peak (index 0) to recovery (index 3) = 4 months inclusive
    expect(result.duration).toBe(4)
  })

  it('should show "Presente" when still in drawdown', () => {
    const snapshots = [
      makeSnapshot(2025, 1, 100000),
      makeSnapshot(2025, 2, 85000),
      makeSnapshot(2025, 3, 90000), // Still below peak
    ]
    const result = calculateDrawdownDuration(snapshots, [])
    expect(result.period).toContain('Presente')
  })
})

// ─── Recovery Time ───

describe('calculateRecoveryTime', () => {
  it('should return null values with fewer than 2 snapshots', () => {
    const result = calculateRecoveryTime([makeSnapshot(2025, 1, 100000)], [])
    expect(result.duration).toBeNull()
  })

  it('should calculate time from trough to recovery', () => {
    const snapshots = [
      makeSnapshot(2025, 1, 100000), // Peak
      makeSnapshot(2025, 2, 85000),  // Trough (index 1)
      makeSnapshot(2025, 3, 90000),
      makeSnapshot(2025, 4, 101000), // Recovery (index 3)
    ]
    const result = calculateRecoveryTime(snapshots, [])
    expect(result.duration).not.toBeNull()
    // Recovery time: from trough (index 1) to recovery (index 3) = 3 months inclusive
    expect(result.duration).toBe(3)
  })

  it('should be shorter than drawdown duration', () => {
    const snapshots = [
      makeSnapshot(2025, 1, 100000),
      makeSnapshot(2025, 2, 85000),
      makeSnapshot(2025, 3, 90000),
      makeSnapshot(2025, 4, 101000),
    ]
    const dd = calculateDrawdownDuration(snapshots, [])
    const rt = calculateRecoveryTime(snapshots, [])

    if (dd.duration !== null && rt.duration !== null) {
      expect(rt.duration).toBeLessThanOrEqual(dd.duration)
    }
  })
})

// ─── getSnapshotsForPeriod ───

describe('getSnapshotsForPeriod', () => {
  const allSnapshots: MonthlySnapshot[] = [
    makeSnapshot(2023, 6, 50000),
    makeSnapshot(2024, 1, 60000),
    makeSnapshot(2024, 6, 70000),
    makeSnapshot(2025, 1, 80000),
    makeSnapshot(2025, 6, 90000),
    { ...makeSnapshot(2025, 7, 0), isDummy: true } as MonthlySnapshot,
  ]

  it('should filter out dummy snapshots for ALL', () => {
    const result = getSnapshotsForPeriod(allSnapshots, 'ALL')
    expect(result.every(s => !s.isDummy)).toBe(true)
    expect(result.length).toBe(5)
  })

  it('should return empty array for CUSTOM without dates', () => {
    expect(getSnapshotsForPeriod(allSnapshots, 'CUSTOM')).toEqual([])
  })

  it('should filter by CUSTOM date range', () => {
    const result = getSnapshotsForPeriod(
      allSnapshots,
      'CUSTOM',
      new Date(2024, 0, 1),
      new Date(2024, 11, 31)
    )
    // Should include 2024-01 and 2024-06
    expect(result.length).toBe(2)
    expect(result.every(s => s.year === 2024)).toBe(true)
  })

  it('should return empty array for unknown period', () => {
    expect(getSnapshotsForPeriod(allSnapshots, 'UNKNOWN' as any)).toEqual([])
  })

  // ─── Baseline lookback tests ───
  // Each period extends 1 month back to include a baseline snapshot,
  // so TWR captures all sub-period returns (not just N-1)

  describe('baseline lookback', () => {
    // Dense dataset: monthly snapshots from Jul 2020 to Feb 2026
    const denseSnapshots: MonthlySnapshot[] = []
    for (let y = 2020; y <= 2026; y++) {
      const endMonth = y === 2026 ? 2 : 12
      for (let m = y === 2020 ? 7 : 1; m <= endMonth; m++) {
        denseSnapshots.push(makeSnapshot(y, m, 100000 + (y - 2020) * 10000 + m * 100))
      }
    }

    beforeEach(() => {
      // Fix "now" to Feb 15, 2026 for deterministic period calculations
      vi.useFakeTimers()
      vi.setSystemTime(new Date(2026, 1, 15))
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('YTD should include Dec of previous year as baseline', () => {
      const result = getSnapshotsForPeriod(denseSnapshots, 'YTD')

      // Should include Dec 2025 (baseline), Jan 2026, Feb 2026
      expect(result.length).toBe(3)
      expect(result[0].year).toBe(2025)
      expect(result[0].month).toBe(12)
      expect(result[1].year).toBe(2026)
      expect(result[1].month).toBe(1)
      expect(result[2].year).toBe(2026)
      expect(result[2].month).toBe(2)
    })

    it('1Y should include 13 months (1 baseline + 12 returns)', () => {
      const result = getSnapshotsForPeriod(denseSnapshots, '1Y')

      // 13 months back from Feb 2026 → Feb 2025 through Feb 2026
      expect(result.length).toBe(13)
      expect(result[0].year).toBe(2025)
      expect(result[0].month).toBe(2)
      expect(result[result.length - 1].year).toBe(2026)
      expect(result[result.length - 1].month).toBe(2)
    })

    it('3Y should include 37 months (1 baseline + 36 returns)', () => {
      const result = getSnapshotsForPeriod(denseSnapshots, '3Y')

      // 37 months back from Feb 2026 → Feb 2023 through Feb 2026
      expect(result.length).toBe(37)
      expect(result[0].year).toBe(2023)
      expect(result[0].month).toBe(2)
    })

    it('5Y should include 61 months (1 baseline + 60 returns)', () => {
      const result = getSnapshotsForPeriod(denseSnapshots, '5Y')

      // 61 months back from Feb 2026 → Feb 2021 through Feb 2026
      expect(result.length).toBe(61)
      expect(result[0].year).toBe(2021)
      expect(result[0].month).toBe(2)
    })

    it('should return fewer results if baseline snapshot is missing', () => {
      // Sparse data: only Jan and Feb 2026 (no Dec 2025 baseline)
      const sparse = [
        makeSnapshot(2026, 1, 100000),
        makeSnapshot(2026, 2, 105000),
      ]
      const result = getSnapshotsForPeriod(sparse, 'YTD')

      // Dec 2025 not available, so only Jan + Feb returned
      expect(result.length).toBe(2)
      expect(result[0].month).toBe(1)
      expect(result[1].month).toBe(2)
    })
  })
})

// ─── Time-Weighted Return ───

describe('calculateTimeWeightedReturn', () => {
  it('should return null with fewer than 2 snapshots', () => {
    expect(calculateTimeWeightedReturn([makeSnapshot(2025, 3, 100000)], [])).toBeNull()
  })

  it('should equal CAGR when no cashflows (2 snapshots)', () => {
    // Both should annualize a 5% gain over 2 months the same way
    const snapshots = [makeSnapshot(2025, 3, 100000), makeSnapshot(2025, 4, 105000)]
    const twr = calculateTimeWeightedReturn(snapshots, [])
    const cagr = calculateCAGR(100000, 105000, 0, 2)
    expect(twr).not.toBeNull()
    expect(twr!).toBeCloseTo(cagr!, 4)
  })

  it('should equal CAGR when no cashflows (3 snapshots)', () => {
    // 5% per month for 3 months — TWR and CAGR annualize identically with no cashflows
    const snapshots = [
      makeSnapshot(2025, 3, 100000),
      makeSnapshot(2025, 4, 105000),
      makeSnapshot(2025, 5, 110250),
    ]
    const twr = calculateTimeWeightedReturn(snapshots, [])
    const cagr = calculateCAGR(100000, 110250, 0, 3)
    expect(twr).not.toBeNull()
    expect(twr!).toBeCloseTo(cagr!, 4)
  })

  it('should adjust for cashflows: same return as no-cashflow case when CF explains gain', () => {
    // Portfolio grew 110K→115.5K (+5%), but 5.5K was a contribution
    // True investment return = (115500 - 5500) / 110000 - 1 = 0% = flat
    const snapshots = [makeSnapshot(2025, 3, 110000), makeSnapshot(2025, 4, 115500)]
    const cashFlows = [makeCashFlow(2025, 4, 5500)]
    const twr = calculateTimeWeightedReturn(snapshots, cashFlows)
    expect(twr).not.toBeNull()
    // Investment return is flat (0%), so annualized is also ~0%
    expect(twr!).toBeCloseTo(0, 1)
  })

  it('should handle negative return', () => {
    const snapshots = [makeSnapshot(2025, 3, 100000), makeSnapshot(2025, 4, 95000)]
    const twr = calculateTimeWeightedReturn(snapshots, [])
    expect(twr).not.toBeNull()
    expect(twr!).toBeLessThan(0)
  })

  it('should be identical to CAGR for YTD 2-month scenario (regression: pre-fix TWR was 2x CAGR)', () => {
    // This test documents the bug fix: before the fix, TWR annualized by ^12 (1 transition)
    // while CAGR annualized by ^6 (2 months inclusive). Now both use 2 months.
    const snapshots = [makeSnapshot(2026, 1, 100000), makeSnapshot(2026, 2, 105000)]
    const twr = calculateTimeWeightedReturn(snapshots, [])
    const cagr = calculateCAGR(100000, 105000, 0, 2)
    expect(twr).not.toBeNull()
    // Both must be ~34%, NOT twr ~79% (the old broken value)
    expect(twr!).toBeCloseTo(cagr!, 4)
    expect(twr!).toBeCloseTo(34.01, 0) // 1.05^6 - 1 ≈ 34%
  })

  it('should use periodMonths override for annualization when baseline included', () => {
    // YTD Feb scenario: Dec (baseline) + Jan + Feb = 3 snapshots, but period = 2 months
    // Without override: annualizes over 3 months (wrong for YTD)
    // With override (2): annualizes over 2 months (correct for YTD)
    const snapshots = [
      makeSnapshot(2025, 12, 100000), // Baseline (Dec)
      makeSnapshot(2026, 1, 102000),  // Jan: +2%
      makeSnapshot(2026, 2, 105000),  // Feb: +2.94%
    ]
    const twrWithOverride = calculateTimeWeightedReturn(snapshots, [], 2)
    const twrWithout = calculateTimeWeightedReturn(snapshots, [])
    const cagr = calculateCAGR(100000, 105000, 0, 2)

    expect(twrWithOverride).not.toBeNull()
    expect(twrWithout).not.toBeNull()

    // With override (2 months): TWR matches CAGR — both annualize over 2 months
    expect(twrWithOverride!).toBeCloseTo(cagr!, 4)
    // Without override (3 months): TWR annualizes less aggressively
    expect(twrWithout!).toBeLessThan(twrWithOverride!)
  })
})

// ─── IRR (Money-Weighted Return) ───

describe('calculateIRR', () => {
  it('should return null when numberOfMonths < 1', () => {
    expect(calculateIRR(100000, 110000, [], 0)).toBeNull()
  })

  it('should return null when startNW is 0', () => {
    expect(calculateIRR(0, 110000, [], 12)).toBeNull()
  })

  it('should calculate ~10% for 12-month 10% gain with no cashflows', () => {
    // -100000 at t=0, +110000 at t=12 months → IRR = 10%
    const result = calculateIRR(100000, 110000, [], 12)
    expect(result).not.toBeNull()
    expect(result!).toBeCloseTo(10, 0)
  })

  it('should calculate negative IRR for a loss', () => {
    // -100000 at t=0, +90000 at t=12 months → IRR = -10%
    const result = calculateIRR(100000, 90000, [], 12)
    expect(result).not.toBeNull()
    expect(result!).toBeCloseTo(-10, 0)
  })

  it('should differ from CAGR when cashflows exist mid-period', () => {
    // With a contribution early in the period, IRR gives the investor's actual return
    // which accounts for when money was actually deployed
    const cashFlows: CashFlowData[] = [
      {
        date: new Date(2025, 0, 1), // Jan (month 1 from start)
        income: 10000,
        expenses: 0,
        dividendIncome: 0,
        netCashFlow: 10000,
      },
    ]
    // start=100K, contributed 10K at month 1, end=121K over 12 months
    const irr = calculateIRR(100000, 121000, cashFlows, 12)
    const cagr = calculateCAGR(100000, 121000, 10000, 12)
    expect(irr).not.toBeNull()
    expect(cagr).not.toBeNull()
    // Both should be non-null and in a reasonable range, but they differ
    // because IRR accounts for the timing of the 10K contribution
    expect(irr!).not.toBeCloseTo(cagr!, 1)
  })
})

// ─── calculateYocMetrics ───

// Helper to create minimal dividend objects for YOC tests.
// quantity here is the number of shares at ex-date (stored on the dividend record).
// costPerShare mirrors asset.averageCost at payment time — undefined for legacy records.
function makeDividend(
  assetId: string,
  paymentDate: Date,
  dividendPerShare: number,
  quantity: number,
  options: { grossAmountEur?: number; netAmountEur?: number; costPerShare?: number } = {}
) {
  const grossAmount = dividendPerShare * quantity
  const netAmount = grossAmount * 0.74 // 26% tax as default
  return {
    assetId,
    paymentDate,
    dividendPerShare,
    quantity,
    grossAmount,
    netAmount,
    grossAmountEur: options.grossAmountEur ?? grossAmount,
    netAmountEur: options.netAmountEur ?? netAmount,
    currency: 'EUR',
    costPerShare: options.costPerShare,
  }
}

// Helper to create minimal asset objects for YOC tests
function makeAsset(
  id: string,
  quantity: number,
  averageCost: number,
  currentPrice = averageCost
) {
  return { id, quantity, averageCost, currentPrice }
}

describe('calculateYocMetrics', () => {
  const START = new Date(2025, 0, 1)  // Jan 1 2025
  const END = new Date(2025, 11, 31)  // Dec 31 2025 (12-month period)

  it('returns nulls when no dividends in period', () => {
    const result = calculateYocMetrics([], [], START, END, 12)
    expect(result.yocGross).toBeNull()
    expect(result.yocNet).toBeNull()
    expect(result.yocDividendsGross).toBe(0)
    expect(result.yocAssetCount).toBe(0)
  })

  it('returns nulls when numberOfMonths is 0', () => {
    const div = makeDividend('a1', new Date(2025, 2, 1), 1, 10)
    const asset = makeAsset('a1', 10, 10)
    const result = calculateYocMetrics([div], [asset], START, END, 0)
    expect(result.yocGross).toBeNull()
    expect(result.yocCostBasis).toBe(0)
  })

  it('returns nulls when all assets with dividends are sold (quantity=0)', () => {
    const div = makeDividend('a1', new Date(2025, 2, 1), 1, 10)
    const asset = makeAsset('a1', 0, 10) // sold
    const result = calculateYocMetrics([div], [asset], START, END, 12)
    expect(result.yocGross).toBeNull()
    expect(result.yocCostBasis).toBe(0)
    expect(result.yocAssetCount).toBe(0)
  })

  it('baseline: 10 shares × €1 DPS / €10 averageCost = 10% YOC (1-year period)', () => {
    // March dividend: 10 shares × €1 = €10 gross
    const div = makeDividend('eni', new Date(2025, 2, 1), 1, 10)
    const asset = makeAsset('eni', 10, 10)
    const result = calculateYocMetrics([div], [asset], START, END, 12)

    // DPS = €1, averageCost = €10 → YOC = 10%
    expect(result.yocGross).toBeCloseTo(10, 4)
    expect(result.yocCostBasis).toBe(100)   // 10 × €10
    expect(result.yocDividendsGross).toBe(10) // actual dividends received
    expect(result.yocAssetCount).toBe(1)
  })

  it('buy-after-dividend: YOC stays 10% even when quantity doubles after dividend', () => {
    // March dividend paid on 10 shares (DPS = €1, grossAmount = €10)
    // April: buy 10 more → current quantity = 20, averageCost still €10
    // YOC must still reflect actual €10 received / (10 div-shares × €10 avgCost) = 10%
    const div = makeDividend('eni', new Date(2025, 2, 1), 1, 10) // quantity at ex-date = 10
    const asset = makeAsset('eni', 20, 10) // current quantity = 20

    const result = calculateYocMetrics([div], [asset], START, END, 12)

    // Actual €10 received / (divQty 10 × avgCost €10 = €100) = 10%
    expect(result.yocGross).toBeCloseTo(10, 4)
    // Cost basis uses div.quantity (not current quantity): 10 × €10 = €100
    expect(result.yocCostBasis).toBe(100)
    // Actual dividends received remain €10 (paid on 10 original shares)
    expect(result.yocDividendsGross).toBe(10)
  })

  it('buy-after-dividend at different price: YOC reflects blended averageCost', () => {
    // 10 shares at €10 + 10 shares at €15 → averageCost = €12.50
    // Dividend was paid on original 10 shares: grossAmount = €10
    // YOC = €10 actual / (divQty 10 × avgCost €12.50 = €125) = 8%
    const div = makeDividend('eni', new Date(2025, 2, 1), 1, 10)
    const asset = makeAsset('eni', 20, 12.5) // blended averageCost

    const result = calculateYocMetrics([div], [asset], START, END, 12)
    expect(result.yocGross).toBeCloseTo(8, 4) // €10 / €125 * 100 = 8%
  })

  it('buy-after-dividend cheaper: YOC changes minimally (not inflated by doubled weight)', () => {
    // Scenario from bug report: buying shares at below-average price after dividend
    // should cause only a small YOC change, not a large inflation of asset weight.
    //
    // Asset A paid €10 dividend on 10 shares (DPS €1), avgCost €10.
    // Asset B paid €20 dividend on 10 shares (DPS €2), avgCost €20.
    // Portfolio baseline YOC = (10+20)/(10×10 + 10×20) = 30/300 = 10%
    //
    // Now buy 90 more shares of Asset A at €8 (cheaper), new avgCost ≈ €8.20
    // assetA.quantity = 100, avgCost = (10×10 + 90×8)/100 = (100+720)/100 = 8.20
    //
    // With div.quantity-based approach:
    //   totalProjected = 10 + 20 = 30 (actual dividends received, unchanged)
    //   costBasis = divQty_A × 8.20 + divQty_B × 20 = 10×8.20 + 10×20 = 82 + 200 = 282
    //   YOC = 30/282 ≈ 10.64% (small change due to avgCost drop only)
    //
    // Old DPS-based approach would have used current_qty_A=100:
    //   totalProjected = dps_A×100 + dps_B×10 = 100 + 20 = 120
    //   costBasis = 100×8.20 + 10×20 = 820 + 200 = 1020
    //   YOC = 120/1020 ≈ 11.76% (large inflation from doubled weight of A)
    const divA = makeDividend('assetA', new Date(2025, 2, 1), 1, 10)   // 10 shares at ex-date
    const divB = makeDividend('assetB', new Date(2025, 2, 1), 2, 10)
    const assetA = makeAsset('assetA', 100, 8.20) // current qty=100, blended avgCost
    const assetB = makeAsset('assetB', 10, 20)

    const result = calculateYocMetrics([divA, divB], [assetA, assetB], START, END, 12)

    // div.quantity-based: 30 / (10×8.20 + 10×20) = 30/282 ≈ 10.64%
    expect(result.yocGross).toBeCloseTo(10.638, 2)
    // Cost basis uses divQty (10 per asset), not current qty (100 for A)
    expect(result.yocCostBasis).toBeCloseTo(282, 4)
  })

  it('multi-dividend same asset: DPS accumulates correctly', () => {
    // Two semi-annual dividends of €0.50 each = €1 total DPS for the year
    const div1 = makeDividend('eni', new Date(2025, 2, 1), 0.5, 10)
    const div2 = makeDividend('eni', new Date(2025, 8, 1), 0.5, 10)
    const asset = makeAsset('eni', 10, 10)

    const result = calculateYocMetrics([div1, div2], [asset], START, END, 12)
    expect(result.yocGross).toBeCloseTo(10, 4) // (€0.5+€0.5) / €10 = 10%
    expect(result.yocDividendsGross).toBeCloseTo(10, 4) // €5 + €5 = €10 total
  })

  it('YTD annualization: 1 dividend in 4-month period scales up correctly', () => {
    // 4-month YTD, 1 dividend of €1 DPS received → annualizedDPS = (€1/4)×12 = €3
    // averageCost = €10 → YOC = €3/€10 = 30%
    const ytdStart = new Date(2025, 0, 1)
    const ytdEnd = new Date(2025, 3, 30)
    const div = makeDividend('eni', new Date(2025, 2, 1), 1, 10)
    const asset = makeAsset('eni', 10, 10)

    const result = calculateYocMetrics([div], [asset], ytdStart, ytdEnd, 4)
    expect(result.yocGross).toBeCloseTo(30, 4) // (1/4)*12/10*100 = 30%
  })

  it('multi-asset: portfolio YOC is cost-basis-weighted average', () => {
    // Asset A: €1 DPS, avgCost €10 → 10% YOC, costBasis €100
    // Asset B: €2 DPS, avgCost €20 → 10% YOC, costBasis €200
    // Portfolio: (1×10 + 2×20)/(10+200)*100 = 50/300*100 = 16.67%? No wait:
    // projected A = 1*10 = 10, projected B = 2*10 = 20, totalProjected = 30
    // costBasis = 100+200 = 300
    // YOC = 30/300*100 = 10%
    const divA = makeDividend('assetA', new Date(2025, 2, 1), 1, 10)
    const divB = makeDividend('assetB', new Date(2025, 2, 1), 2, 10)
    const assetA = makeAsset('assetA', 10, 10) // costBasis €100
    const assetB = makeAsset('assetB', 10, 20) // costBasis €200

    const result = calculateYocMetrics([divA, divB], [assetA, assetB], START, END, 12)
    // Both have 10% YOC individually, so portfolio YOC = 10%
    expect(result.yocGross).toBeCloseTo(10, 4)
    expect(result.yocCostBasis).toBe(300)
    expect(result.yocAssetCount).toBe(2)
  })

  it('multi-currency: uses grossAmountEur for EUR-normalised DPS', () => {
    // USD dividend: grossAmount=11 (USD), grossAmountEur=10 (EUR at 0.91 rate)
    // div.quantity=10 → dpsEur = 10/10 = €1 → YOC = 10%
    const div = makeDividend('usAsset', new Date(2025, 2, 1), 1.1, 10, {
      grossAmountEur: 10,  // EUR-converted total
      netAmountEur: 7.4,
    })
    const asset = makeAsset('usAsset', 10, 10)

    const result = calculateYocMetrics([div], [asset], START, END, 12)
    expect(result.yocGross).toBeCloseTo(10, 4) // uses EUR DPS = €10/10 = €1
  })

  it('dividends outside period are excluded', () => {
    const divInPeriod = makeDividend('eni', new Date(2025, 2, 1), 1, 10)
    const divOutsidePeriod = makeDividend('eni', new Date(2024, 2, 1), 1, 10) // prev year
    const asset = makeAsset('eni', 10, 10)

    const resultAll = calculateYocMetrics([divInPeriod, divOutsidePeriod], [asset], START, END, 12)
    const resultOne = calculateYocMetrics([divInPeriod], [asset], START, END, 12)

    // Only the in-period dividend should be counted
    expect(resultAll.yocGross).toBeCloseTo(resultOne.yocGross!, 4)
    expect(resultAll.yocDividendsGross).toBe(10) // only in-period dividend
  })

  // ─── costPerShare tests ───

  it('costPerShare: uses historical cost instead of current avgCost', () => {
    // Dividend paid when avgCost was €10/share (costPerShare=10)
    // Investor later buys more shares at €8 → current avgCost drops to €8.50
    // YOC should use historical €10, not current €8.50
    const div = makeDividend('eni', new Date(2025, 2, 1), 1, 10, { costPerShare: 10 })
    const asset = makeAsset('eni', 20, 8.5) // current avgCost changed after more purchases

    const result = calculateYocMetrics([div], [asset], START, END, 12)

    // cost_basis = divQty(10) × historicalCostPerShare(10) = 100
    // YOC = 10/100 = 10% — uses historical €10, NOT current €8.50
    expect(result.yocGross).toBeCloseTo(10, 4)
    expect(result.yocCostBasis).toBeCloseTo(100, 4)
  })

  it('costPerShare: legacy dividend without costPerShare falls back to current avgCost', () => {
    // Legacy record (no costPerShare) → must fall back to asset.averageCost
    const div = makeDividend('eni', new Date(2025, 2, 1), 1, 10) // no costPerShare
    const asset = makeAsset('eni', 10, 12)

    const result = calculateYocMetrics([div], [asset], START, END, 12)

    // cost_basis = divQty(10) × asset.averageCost(12) = 120
    // YOC = 10/120 * 100 = 8.33%
    expect(result.yocGross).toBeCloseTo(8.333, 2)
    expect(result.yocCostBasis).toBeCloseTo(120, 4)
  })

  it('costPerShare: multi-dividend weighted average uses gross-weighted costPerShare', () => {
    // Q1: qty=100, costPerShare=10, gross=€25  (DPS=€0.25)
    // Q2: qty=120, costPerShare=9.80, gross=€30 (DPS=€0.25)
    // weighted_cost = (25×10 + 30×9.80) / 55 = (250+294)/55 = 544/55 ≈ 9.8909
    // cost_basis = maxDivQty(120) × 9.8909 ≈ 1186.91
    // YOC = annualized(55) / 1186.91 = 55/1186.91 * 100 ≈ 4.633%
    const divQ1 = makeDividend('eni', new Date(2025, 2, 1), 0.25, 100, { costPerShare: 10 })
    const divQ2 = makeDividend('eni', new Date(2025, 8, 1), 0.25, 120, { costPerShare: 9.8 })
    const asset = makeAsset('eni', 120, 9.5) // current avgCost different from historical

    const result = calculateYocMetrics([divQ1, divQ2], [asset], START, END, 12)

    const weightedCost = (25 * 10 + 30 * 9.8) / 55 // ≈ 9.8909
    const expectedCostBasis = 120 * weightedCost
    const expectedYoc = (55 / expectedCostBasis) * 100
    expect(result.yocCostBasis).toBeCloseTo(expectedCostBasis, 2)
    expect(result.yocGross).toBeCloseTo(expectedYoc, 2)
  })
})

// ─── getCashFlowsFromExpenses ───

describe('getCashFlowsFromExpenses', () => {
  const expenses: Expense[] = [
    makeExpense(2025, 1, 15, 'income', 3000),          // Jan income
    makeExpense(2025, 1, 20, 'fixed', -800),            // Jan expense (negative)
    makeExpense(2025, 2, 10, 'income', 4000, 'div-cat'), // Feb dividend income
    makeExpense(2025, 2, 25, 'variable', -200),          // Feb expense
    makeExpense(2025, 3, 5, 'income', 2000),             // Mar income (outside range)
  ]

  it('should filter expenses to the given date range', () => {
    const start = new Date(2025, 0, 1)  // Jan 1
    const end = new Date(2025, 1, 28)   // Feb 28
    const result = getCashFlowsFromExpenses(expenses, start, end)
    // Only Jan and Feb entries should be included, not Mar
    expect(result.length).toBe(2)
    expect(result.every(cf => cf.date < new Date(2025, 2, 1))).toBe(true)
  })

  it('should separate dividend income from regular income', () => {
    const start = new Date(2025, 0, 1)
    const end = new Date(2025, 1, 28)
    const result = getCashFlowsFromExpenses(expenses, start, end, 'div-cat')
    const febEntry = result.find(cf => cf.date.getMonth() === 1) // February
    expect(febEntry).not.toBeUndefined()
    // The 4000 Feb income should be treated as dividend (not regular income)
    expect(febEntry!.dividendIncome).toBe(4000)
    expect(febEntry!.income).toBe(0)
  })

  it('should compute netCashFlow as income minus expenses excluding dividends', () => {
    const start = new Date(2025, 0, 1)
    const end = new Date(2025, 1, 28)
    const result = getCashFlowsFromExpenses(expenses, start, end, 'div-cat')
    const janEntry = result.find(cf => cf.date.getMonth() === 0) // January
    const febEntry = result.find(cf => cf.date.getMonth() === 1) // February
    // Jan: netCashFlow = 3000 - 800 = 2200
    expect(janEntry!.netCashFlow).toBe(2200)
    // Feb: dividend of 4000 excluded from netCashFlow, expense -200 → netCashFlow = 0 - 200 = -200
    expect(febEntry!.netCashFlow).toBe(-200)
  })
})
