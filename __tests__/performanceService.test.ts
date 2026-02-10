import { describe, it, expect, vi } from 'vitest'

// Mock Firebase-dependent modules to prevent initialization errors in tests
vi.mock('@/lib/services/expenseService', () => ({}))
vi.mock('@/lib/services/snapshotService', () => ({}))
vi.mock('@/lib/services/assetAllocationService', () => ({}))

import {
  calculateROI,
  calculateCAGR,
  calculateSharpeRatio,
  calculateVolatility,
  calculateMaxDrawdown,
  calculateDrawdownDuration,
  calculateRecoveryTime,
  getSnapshotsForPeriod,
} from '@/lib/services/performanceService'
import { MonthlySnapshot } from '@/types/assets'
import { CashFlowData } from '@/types/performance'

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
})
