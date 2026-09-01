import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock Firebase-dependent modules to prevent initialization errors in tests
vi.mock('@/lib/firebase/config', () => ({
  auth: {
    currentUser: null,
  },
  db: {},
}))
vi.mock('@/lib/services/expenseService', () => ({}))
vi.mock('@/lib/services/snapshotService', () => ({}))
vi.mock('@/lib/services/assetAllocationService', () => ({}))

import {
  buildCacheKey,
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
  prepareMonthlyReturnsHeatmap,
  preparePerformanceChartData,
  calculateYocMetrics,
  calculateCurrentYieldMetrics,
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

  it('should adjust for cash flows', () => {
    const snapshots = [
      makeSnapshot(2025, 1, 100000),
      makeSnapshot(2025, 2, 150000), // Looks like +50% but CF explains it
      makeSnapshot(2025, 3, 152000),
      makeSnapshot(2025, 4, 153500),
    ]
    const cashFlows = [makeCashFlow(2025, 2, 49000)] // Large contribution
    const result = calculateVolatility(snapshots, cashFlows)
    expect(result).not.toBeNull()
    // After adjusting for CF, actual return is ~1%, so volatility should be low
    expect(result!).toBeLessThan(10)
  })

  // ─── A6: perché il filtro ±50% è stato rimosso invece che reso uniforme ───

  it('a tracked contribution produces no spike at all, however large', () => {
    // Il patrimonio triplica in un mese, ma è tutto denaro versato: il rendimento aggiustato è ~0.
    // Il filtro ±50% diceva di servire proprio a questo — ma la formula lo risolve già, quindi
    // toglierlo non cambia una virgola qui. È la prova che il filtro non stava facendo quel lavoro.
    // Febbraio: +1% di mercato su 100.000 e 200.000 versati → 301.000. Da lì +1% al mese.
    const snapshots = [
      makeSnapshot(2025, 1, 100000),
      makeSnapshot(2025, 2, 301000), // +201% apparente, ma il rendimento vero è 1%
      makeSnapshot(2025, 3, 304010),
      makeSnapshot(2025, 4, 307050.1),
    ]
    const withContribution = calculateVolatility(snapshots, [makeCashFlow(2025, 2, 200000)])
    // Lo stesso portafoglio senza il versamento: +1% al mese, identico rendimento mensile.
    const steadySeries = calculateVolatility(
      [
        makeSnapshot(2025, 1, 100000),
        makeSnapshot(2025, 2, 101000),
        makeSnapshot(2025, 3, 102010),
        makeSnapshot(2025, 4, 103030.1),
      ],
      []
    )

    expect(withContribution).not.toBeNull()
    expect(withContribution!).toBeCloseTo(steadySeries!, 6) // entrambe ~0: nessuno spike da filtrare
  })

  it('reports a real crash beyond 50% instead of hiding it', () => {
    // Un crollo del 60% non aggiustato da nessun cash flow è la cosa più importante che una metrica
    // di rischio debba riportare. Il filtro lo cancellava proprio dalla volatilità, lasciandolo
    // visibile in heatmap e Underwater: tre superfici, due storie (A6).
    const crash = [
      makeSnapshot(2025, 1, 100000),
      makeSnapshot(2025, 2, 40000), // −60%
      makeSnapshot(2025, 3, 41000),
      makeSnapshot(2025, 4, 42000),
    ]
    const calm = [
      makeSnapshot(2025, 1, 100000),
      makeSnapshot(2025, 2, 101000),
      makeSnapshot(2025, 3, 102000),
      makeSnapshot(2025, 4, 103000),
    ]

    const crashVolatility = calculateVolatility(crash, [])
    const calmVolatility = calculateVolatility(calm, [])

    expect(crashVolatility).not.toBeNull()
    expect(crashVolatility!).toBeGreaterThan(calmVolatility! * 10)
  })

  it('sees exactly the same monthly returns as the heatmap', () => {
    // L invariante che il filtro rompeva: volatilità, heatmap e indice dei drawdown devono leggere
    // la STESSA serie. Qui un movimento non tracciato (nessun CashFlowData) crea un mese estremo:
    // deve comparire in entrambe, o le card di rischio smettono di parlarsi.
    const snapshots = [
      makeSnapshot(2025, 1, 100000),
      makeSnapshot(2025, 2, 180000), // +80%, nessun cash flow registrato
      makeSnapshot(2025, 3, 181000),
      makeSnapshot(2025, 4, 182000),
    ]
    const heatmap = prepareMonthlyReturnsHeatmap(snapshots, [])
    const februaryReturn = heatmap[0].months.find(m => m.month === 2)!.return

    expect(februaryReturn).toBeCloseTo(80, 6)
    // La deviazione standard di [80, 0.55, 0.55] annualizzata: se il mese fosse filtrato via
    // resterebbero due sole osservazioni quasi identiche e la volatilità crollerebbe sotto l 1%.
    expect(calculateVolatility(snapshots, [])!).toBeGreaterThan(100)
  })

  it('returns null with fewer than 3 monthly returns', () => {
    // Due osservazioni producono sempre "una" deviazione standard, ma con un solo grado di libertà
    // non dice niente sul portafoglio — e lo Sharpe costruito sopra ne eredita il rumore.
    const twoReturns = [
      makeSnapshot(2025, 1, 100000),
      makeSnapshot(2025, 2, 101000),
      makeSnapshot(2025, 3, 102000),
    ]
    expect(calculateVolatility(twoReturns, [])).toBeNull()
    expect(calculateVolatility([...twoReturns, makeSnapshot(2025, 4, 103000)], [])).not.toBeNull()
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
    // Duration: months elapsed from peak (idx 0) to recovery (idx 3) = 3 - 0 = 3
    expect(result.duration).toBe(3)
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
    // Recovery time: months elapsed from trough (idx 1) to recovery (idx 3) = 3 - 1 = 2
    expect(result.duration).toBe(2)
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

  it('should include dummy snapshots for ALL', () => {
    const result = getSnapshotsForPeriod(allSnapshots, 'ALL')
    expect(result.length).toBe(6)
    expect(result.some(s => s.isDummy)).toBe(true)
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

  it('should include the month before a CUSTOM range as baseline', () => {
    // Monthly dataset Nov 2025 → Mar 2026. A custom range Jan→Mar 2026 must reach
    // back to Dec 2025 as baseline so January gets a computed return (parity with YTD).
    const monthly: MonthlySnapshot[] = [
      makeSnapshot(2025, 11, 100000),
      makeSnapshot(2025, 12, 101000),
      makeSnapshot(2026, 1, 102000),
      makeSnapshot(2026, 2, 103000),
      makeSnapshot(2026, 3, 104000),
    ]
    const result = getSnapshotsForPeriod(
      monthly,
      'CUSTOM',
      new Date(2026, 0, 1),
      new Date(2026, 2, 31)
    )
    // Dec 2025 (baseline) + Jan, Feb, Mar 2026
    expect(result.map(s => `${s.year}-${s.month}`)).toEqual([
      '2025-12',
      '2026-1',
      '2026-2',
      '2026-3',
    ])
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

  it('should equal CAGR over the MEASURED months when no cashflows (2 snapshots)', () => {
    // Two end-of-month photographs = ONE measured month (end of Mar → end of Apr), not two:
    // March's value is the starting valuation, not a return. Both metrics annualize that
    // single +5% over 1 month → 1.05^12 - 1 ≈ 79.6%.
    const snapshots = [makeSnapshot(2025, 3, 100000), makeSnapshot(2025, 4, 105000)]
    const twr = calculateTimeWeightedReturn(snapshots, [])
    const cagr = calculateCAGR(100000, 105000, 0, 1)
    expect(twr).not.toBeNull()
    expect(twr!).toBeCloseTo(cagr!, 4)
    expect(twr!).toBeCloseTo(79.59, 1)
  })

  it('should equal CAGR over the MEASURED months when no cashflows (3 snapshots)', () => {
    // 5% per month over 2 measured months (Apr and May) — TWR and CAGR agree once both
    // count the same span.
    const snapshots = [
      makeSnapshot(2025, 3, 100000),
      makeSnapshot(2025, 4, 105000),
      makeSnapshot(2025, 5, 110250),
    ]
    const twr = calculateTimeWeightedReturn(snapshots, [])
    const cagr = calculateCAGR(100000, 110250, 0, 2)
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

  it('should annualize one linked return over one month, not two (A3 regression)', () => {
    // The measured span is n − 1 months for n snapshots. Counting it inclusively (the pre-fix
    // else branch) annualized ONE return over TWO months and understated the result by ~45pp
    // here — the same bias, smaller but systematic, that flattened the Storico TWR.
    const snapshots = [makeSnapshot(2026, 1, 100000), makeSnapshot(2026, 2, 105000)]
    const twr = calculateTimeWeightedReturn(snapshots, [])
    expect(twr).not.toBeNull()
    expect(twr!).toBeCloseTo(79.59, 1)  // 1.05^12 - 1, NOT 1.05^6 - 1 ≈ 34%
  })

  it('should derive the same period length the explicit periodMonths override states', () => {
    // YTD Feb scenario: Dec (baseline) + Jan + Feb = 3 snapshots, 2 measured months.
    // The derived length and the explicit override must agree — they disagreed by one month
    // before the fix, so the same series answered differently depending on the call site
    // (the rolling windows took the derived path, the period metrics the explicit one).
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
    expect(twrWithOverride!).toBeCloseTo(cagr!, 4)
    expect(twrWithout!).toBeCloseTo(twrWithOverride!, 10)
  })

  it('should return null when the snapshots span less than one month', () => {
    // Duplicate month: no measurable span, and annualizing would divide by zero years.
    const snapshots = [makeSnapshot(2026, 1, 100000), makeSnapshot(2026, 1, 105000)]
    expect(calculateTimeWeightedReturn(snapshots, [])).toBeNull()
  })
})

// ─── IRR (Money-Weighted Return) ───

describe('calculateIRR', () => {
  // Il periodo misurato parte a gennaio 2025: un flusso di gennaio sta a t=0, uno di luglio a t=6.
  const PERIOD_START = new Date(2025, 0, 1)

  it('should return null when numberOfMonths < 1', () => {
    expect(calculateIRR(100000, 110000, [], 0, PERIOD_START)).toBeNull()
  })

  it('should return null when startNW is 0', () => {
    expect(calculateIRR(0, 110000, [], 12, PERIOD_START)).toBeNull()
  })

  it('should calculate ~10% for 12-month 10% gain with no cashflows', () => {
    // -100000 at t=0, +110000 at t=12 months → IRR = 10%
    const result = calculateIRR(100000, 110000, [], 12, PERIOD_START)
    expect(result).not.toBeNull()
    expect(result!).toBeCloseTo(10, 6)
  })

  it('should calculate negative IRR for a loss', () => {
    // -100000 at t=0, +90000 at t=12 months → IRR = -10%
    const result = calculateIRR(100000, 90000, [], 12, PERIOD_START)
    expect(result).not.toBeNull()
    expect(result!).toBeCloseTo(-10, 6)
  })

  it('treats a contribution as money PAID IN, not received (sign regression)', () => {
    // Il patrimonio sale da 100.000 a 110.000, ma i 10.000 sono stati versati: il rendimento per
    // l investitore è esattamente zero. NPV = −100.000 − 10.000 + 110.000/(1+r) = 0 → r = 0.
    // Contando il versamento con segno positivo (come faceva prima) l equazione diventa
    // −100.000 + 10.000/(1+r)^(1/12) + 110.000/(1+r) = 0, la cui radice è +22,00%.
    const result = calculateIRR(100000, 110000, [makeCashFlow(2025, 1, 10000)], 12, PERIOD_START)
    expect(result).not.toBeNull()
    expect(result!).toBeCloseTo(0, 6)
  })

  it('discounts a mid-period contribution over the time it was actually invested', () => {
    // −100.000 a t=0, −10.000 a t=6 mesi, +121.000 a t=12. Con x = 1+r la NPV si riduce a
    // 100.000x + 10.000√x − 121.000 = 0, cioè 100s² + 10s − 121 = 0 con s = √x:
    // s = (−10 + √48.500)/200 → x = s² → r = 10,488642%. Verificato in forma chiusa, a mano.
    const result = calculateIRR(100000, 121000, [makeCashFlow(2025, 7, 10000)], 12, PERIOD_START)
    expect(result).not.toBeNull()
    expect(result!).toBeCloseTo(10.488642, 5)
  })

  it('treats a withdrawal as money taken out', () => {
    // 100.000 → 90.000 dopo aver prelevato 10.000: nessuna perdita, rendimento zero.
    const result = calculateIRR(100000, 90000, [makeCashFlow(2025, 1, -10000)], 12, PERIOD_START)
    expect(result).not.toBeNull()
    expect(result!).toBeCloseTo(0, 6)
  })

  it('anchors the timeline at the period start, not at the first month with movements', () => {
    // Stesso versamento, stesso risultato finale, momenti diversi: versare PRIMA significa tenere
    // il capitale investito più a lungo per lo stesso guadagno, quindi un IRR più basso. Con la
    // vecchia ancora (primo mese CON movimenti) entrambi finivano allo stesso t e i due casi
    // davano lo stesso numero.
    const early = calculateIRR(100000, 121000, [makeCashFlow(2025, 2, 10000)], 12, PERIOD_START)
    const late = calculateIRR(100000, 121000, [makeCashFlow(2025, 11, 10000)], 12, PERIOD_START)

    expect(early).not.toBeNull()
    expect(late).not.toBeNull()
    expect(early!).toBeLessThan(late!)
  })

  it('ignores flows dated outside the measured window', () => {
    // Un flusso prima dell inizio o dopo la fine verrebbe scontato su un tempo che non ha passato
    // investito. I chiamanti filtrano già sulla stessa finestra: questa è una guardia.
    const withStrays = calculateIRR(
      100000,
      110000,
      [makeCashFlow(2024, 6, 50000), makeCashFlow(2026, 6, 50000)],
      12,
      PERIOD_START
    )
    expect(withStrays!).toBeCloseTo(10, 6)
  })

  it('converges on a collapse that Newton alone would struggle with (bisection fallback)', () => {
    // Prelevati 95.000 su 100.000, ne restano 1.000: −100.000 + 95.000 + 1.000/(1+r) = 0 → r = −80%.
    const result = calculateIRR(100000, 1000, [makeCashFlow(2025, 1, -95000)], 12, PERIOD_START)
    expect(result).not.toBeNull()
    expect(result!).toBeCloseTo(-80, 6)
  })

  it('reaches an extreme but well-defined rate instead of giving up', () => {
    // Versato un milione su 100.000, ne restano 1.000: −1.100.000 + 1.000/(1+r) = 0 → r = −99,909%.
    // È un numero estremo ma vero, e vive dove Newton (che parte dal +10%) fatica ad arrivare.
    const result = calculateIRR(100000, 1000, [makeCashFlow(2025, 1, 1000000)], 12, PERIOD_START)
    expect(result).not.toBeNull()
    expect(result!).toBeCloseTo(-99.909091, 5)
  })

  it('returns null when no rate can explain the stream', () => {
    // Patrimonio finale zero: la NPV resta negativa a ogni tasso (il limite sarebbe −100%, che non
    // è raggiungibile). Meglio nessuna risposta che una inventata.
    const result = calculateIRR(100000, 0, [], 12, PERIOD_START)
    expect(result).toBeNull()
  })

  it('differs from CAGR when the contribution lands mid-period', () => {
    // CAGR mette tutti i flussi a t=0 per definizione (formula diversa, non un bug: vedi A8);
    // l IRR li sconta quando sono avvenuti, quindi sopra un versamento tardivo i due divergono.
    const irr = calculateIRR(100000, 121000, [makeCashFlow(2025, 7, 10000)], 12, PERIOD_START)
    const cagr = calculateCAGR(100000, 121000, 10000, 12)
    expect(irr!).toBeGreaterThan(cagr!)
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

  it('buy-after-dividend: per-asset YOC stays 10% even when quantity doubles', () => {
    // March dividend paid on 10 shares (DPS = €1/share). April: buy 10 more at €10 →
    // current quantity = 20, averageCost still €10. YOC is per-share (DPS/avgCost), so it
    // is unchanged at 10% regardless of how many shares are now held.
    const div = makeDividend('eni', new Date(2025, 2, 1), 1, 10) // quantity at ex-date = 10
    const asset = makeAsset('eni', 20, 10) // current quantity = 20

    const result = calculateYocMetrics([div], [asset], START, END, 12)

    // DPS €1/share ÷ averageCost €10 = 10%
    expect(result.yocGross).toBeCloseTo(10, 4)
    // Cost basis is on CURRENT holdings: 20 shares × €10 = €200
    expect(result.yocCostBasis).toBe(200)
    // Dividends actually received remain €10 (paid on the original 10 shares)
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

  it('portfolio YOC is weighted by CURRENT holdings (prospective)', () => {
    // Asset A: DPS €1/share, avgCost €8.20, now holds 100 shares (bought more after dividend).
    // Asset B: DPS €2/share, avgCost €20, holds 10 shares.
    //
    // Per-asset YOC: A = 1/8.20 ≈ 12.20%, B = 2/20 = 10%.
    // Portfolio YOC weights each asset by its current cost basis:
    //   annual income = DPS×currentQty → A: 1×100 = 100, B: 2×10 = 20 → 120
    //   cost basis    = currentQty×avgCost → A: 100×8.20 = 820, B: 10×20 = 200 → 1020
    //   YOC = 120/1020 ≈ 11.7647%
    // Holding more of A correctly pulls the portfolio YOC toward A's individual yield.
    const divA = makeDividend('assetA', new Date(2025, 2, 1), 1, 10)
    const divB = makeDividend('assetB', new Date(2025, 2, 1), 2, 10)
    const assetA = makeAsset('assetA', 100, 8.20) // current qty=100, blended avgCost
    const assetB = makeAsset('assetB', 10, 20)

    const result = calculateYocMetrics([divA, divB], [assetA, assetB], START, END, 12)

    expect(result.yocGross).toBeCloseTo(11.7647, 2)
    // Cost basis is on current holdings: 100×8.20 + 10×20 = 1020
    expect(result.yocCostBasis).toBeCloseTo(1020, 4)
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

  // ─── cost basis source (current averageCost) ───

  it('repurchase / averaging: YOC uses CURRENT averageCost, not historical costPerShare', () => {
    // The fix: a dividend was paid when avgCost was €10 (costPerShare=10). The investor then
    // bought more shares (or sold and rebought), so the CURRENT avgCost is €8.50.
    // YOC must reflect the current cost €8.50 — the stored historical snapshot is ignored.
    const div = makeDividend('eni', new Date(2025, 2, 1), 1, 10, { costPerShare: 10 })
    const asset = makeAsset('eni', 20, 8.5) // current avgCost after further purchases

    const result = calculateYocMetrics([div], [asset], START, END, 12)

    // DPS €1/share ÷ current averageCost €8.50 = 11.7647%; cost basis = 20 × €8.50 = €170
    expect(result.yocGross).toBeCloseTo(11.7647, 2)
    expect(result.yocCostBasis).toBeCloseTo(170, 4)
  })

  it('cost basis = current quantity × current averageCost', () => {
    const div = makeDividend('eni', new Date(2025, 2, 1), 1, 10)
    const asset = makeAsset('eni', 10, 12)

    const result = calculateYocMetrics([div], [asset], START, END, 12)

    // DPS €1/share ÷ €12 = 8.33%; cost basis = 10 × €12 = €120
    expect(result.yocGross).toBeCloseTo(8.333, 2)
    expect(result.yocCostBasis).toBeCloseTo(120, 4)
  })

  it('multi-dividend same asset: per-share DPS sums, cost basis on current holdings', () => {
    // Two payments of €0.25/share each → annual DPS €0.50/share, regardless of the
    // quantity at each ex-date. Cost basis uses current quantity (120) × current avgCost (9.5).
    const divQ1 = makeDividend('eni', new Date(2025, 2, 1), 0.25, 100)
    const divQ2 = makeDividend('eni', new Date(2025, 8, 1), 0.25, 120)
    const asset = makeAsset('eni', 120, 9.5)

    const result = calculateYocMetrics([divQ1, divQ2], [asset], START, END, 12)

    // annualDPS €0.50 ÷ €9.50 = 5.263%; cost basis = 120 × €9.50 = €1140
    expect(result.yocGross).toBeCloseTo(5.263, 2)
    expect(result.yocCostBasis).toBeCloseTo(1140, 4)
  })

  it('excludes dividends from sold assets (held + sold mix)', () => {
    // The reported bug: a sold position's dividends must not enter the numerator while its
    // cost basis is absent from the denominator. Only the held asset contributes.
    const divHeld = makeDividend('held', new Date(2025, 2, 1), 1, 10)
    const divSold = makeDividend('sold', new Date(2025, 2, 1), 5, 10) // €50, but asset now sold
    const assetHeld = makeAsset('held', 10, 10)
    const assetSold = makeAsset('sold', 0, 10) // quantity 0 → sold

    const result = calculateYocMetrics([divHeld, divSold], [assetHeld, assetSold], START, END, 12)

    expect(result.yocAssetCount).toBe(1)
    expect(result.yocGross).toBeCloseTo(10, 4) // only the held asset (€1/€10)
    expect(result.yocDividendsGross).toBe(10)  // sold asset's €50 excluded
  })
})

// ─── calculateCurrentYieldMetrics ───

describe('calculateCurrentYieldMetrics (prospective, per-share)', () => {
  const START = new Date(2025, 0, 1)
  const END = new Date(2025, 11, 31)

  it('uses current market price as denominator', () => {
    // DPS €1/share, current price €20 → current yield 5% (vs YOC 10% on €10 cost)
    const div = makeDividend('eni', new Date(2025, 2, 1), 1, 10)
    const asset = makeAsset('eni', 10, 10, 20) // averageCost €10, currentPrice €20

    const result = calculateCurrentYieldMetrics([div], [asset], START, END, 12)

    expect(result.currentYield).toBeCloseTo(5, 4)
    expect(result.currentYieldPortfolioValue).toBe(200) // 10 × €20
    expect(result.currentYieldAssetCount).toBe(1)
  })

  it('excludes dividends from sold assets', () => {
    const divHeld = makeDividend('held', new Date(2025, 2, 1), 1, 10)
    const divSold = makeDividend('sold', new Date(2025, 2, 1), 5, 10)
    const assetHeld = makeAsset('held', 10, 10, 20)
    const assetSold = makeAsset('sold', 0, 10, 20)

    const result = calculateCurrentYieldMetrics([divHeld, divSold], [assetHeld, assetSold], START, END, 12)

    expect(result.currentYieldAssetCount).toBe(1)
    expect(result.currentYield).toBeCloseTo(5, 4) // only held asset
    expect(result.currentYieldDividends).toBe(10) // sold asset excluded
  })

  it('returns nulls when no held dividend-paying assets', () => {
    const result = calculateCurrentYieldMetrics([], [], START, END, 12)
    expect(result.currentYield).toBeNull()
    expect(result.currentYieldPortfolioValue).toBe(0)
    expect(result.currentYieldAssetCount).toBe(0)
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

// ─── Cache key ───

describe('buildCacheKey', () => {
  // Ogni input che sposta i numeri deve spostare la chiave: una chiave stabile su un input cambiato
  // significa servire per 6 ore metriche calcolate da qualcos'altro.
  const snapshots = [
    makeSnapshot(2025, 1, 100000),
    makeSnapshot(2025, 2, 105000),
    makeSnapshot(2025, 3, 110000),
  ]
  const baseline = {
    snapshots,
    baseOptions: {},
    riskFreeRate: 2.5,
    dividendCategoryId: 'div-cat',
  }

  it('is stable for identical inputs', () => {
    expect(buildCacheKey(baseline)).toBe(buildCacheKey({ ...baseline }))
  })

  it('carries the math version, so a formula change can invalidate what inputs cannot', () => {
    // Nessuna firma degli input può accorgersi che sono cambiate le FORMULE: senza questo token
    // l'utente continua a leggere numeri pre-fix per 6 ore. Il test è qui perché il bump è manuale
    // e va ricordato — se questa asserzione fallisce dopo un cambio di matematica, è corretto
    // aggiornarla; se fallisce senza, qualcuno ha rotto il prefisso.
    // v5 -> v6 il 2026-08-30: i flussi seguono la base (fix D1, portfolioFlows.ts). Ogni numero
    // in cache era stato calcolato con i flussi del Cashflow anche dove la base escludeva la
    // liquidita', ed e' da buttare.
    // v6 -> v7 il 2026-08-31: la stessa regola arriva alle finestre rolling, che erano rimaste
    // fuori dal fix D1 (capitale del portafoglio, flussi del patrimonio), e un CAGR non
    // misurabile smette di essere scritto come 0.
    expect(buildCacheKey(baseline).startsWith('v7-')).toBe(true)
    expect(buildCacheKey({ ...baseline, snapshots: [] }).startsWith('v7-')).toBe(true)
  })

  it('ignores the order snapshots arrive in', () => {
    // La stessa storia descritta in un altro ordine è la stessa storia.
    const shuffled = [snapshots[2], snapshots[0], snapshots[1]]
    expect(buildCacheKey({ ...baseline, snapshots: shuffled })).toBe(buildCacheKey(baseline))
  })

  it('changes when a HISTORICAL snapshot is corrected (A9)', () => {
    // Il caso che la vecchia chiave non vedeva: stesso numero di snapshot, stesso ultimo mese,
    // stesso valore finale — ma un mese di mezzo corretto riscrive rendimenti e drawdown.
    const corrected = [snapshots[0], makeSnapshot(2025, 2, 106000), snapshots[2]]
    expect(buildCacheKey({ ...baseline, snapshots: corrected })).not.toBe(buildCacheKey(baseline))
  })

  it('changes when the last snapshot value changes', () => {
    const updated = [snapshots[0], snapshots[1], makeSnapshot(2025, 3, 111000)]
    expect(buildCacheKey({ ...baseline, snapshots: updated })).not.toBe(buildCacheKey(baseline))
  })

  it('changes when a snapshot is added', () => {
    const extended = [...snapshots, makeSnapshot(2025, 4, 112000)]
    expect(buildCacheKey({ ...baseline, snapshots: extended })).not.toBe(buildCacheKey(baseline))
  })

  it('changes when the risk-free rate changes (A9)', () => {
    // Muove ogni Sharpe e il verdetto dell hero: prima restava stantio fino a 6 ore.
    expect(buildCacheKey({ ...baseline, riskFreeRate: 3.94 })).not.toBe(buildCacheKey(baseline))
  })

  it('distinguishes a 0% risk-free rate from the 2.5% default', () => {
    expect(buildCacheKey({ ...baseline, riskFreeRate: 0 })).not.toBe(buildCacheKey(baseline))
  })

  it('changes when the dividend income category changes (A9)', () => {
    // Riclassifica i cash flow: cosa è contributo e cosa è rendimento del portafoglio.
    expect(buildCacheKey({ ...baseline, dividendCategoryId: 'other-cat' })).not.toBe(buildCacheKey(baseline))
    expect(buildCacheKey({ ...baseline, dividendCategoryId: undefined })).not.toBe(buildCacheKey(baseline))
  })

  it('changes when either exclusion of the metrics base is flipped', () => {
    const withPension = buildCacheKey({ ...baseline, baseOptions: { includePensionFunds: true } })
    const withExcluded = buildCacheKey({ ...baseline, baseOptions: { includeExcludedAssets: true } })
    expect(withPension).not.toBe(buildCacheKey(baseline))
    expect(withExcluded).not.toBe(buildCacheKey(baseline))
    expect(withPension).not.toBe(withExcluded)
  })

  it('handles an empty history without pretending it is the same as any other input', () => {
    const empty = buildCacheKey({ ...baseline, snapshots: [] })
    expect(empty).not.toBe(buildCacheKey(baseline))
    expect(empty).toBe(buildCacheKey({ ...baseline, snapshots: [] }))
    expect(buildCacheKey({ ...baseline, snapshots: [], riskFreeRate: 0 })).not.toBe(empty)
  })

  it('ignores sub-euro noise in snapshot values', () => {
    // I centesimi ballano a ogni riconversione FX: farebbero girare la chiave per nulla.
    const noisy = [makeSnapshot(2025, 1, 100000.004), snapshots[1], snapshots[2]]
    expect(buildCacheKey({ ...baseline, snapshots: noisy })).toBe(buildCacheKey(baseline))
  })
})

// ─── Evoluzione Patrimonio: le tre bande (A11) ───

describe('preparePerformanceChartData', () => {
  const snapshots = [
    makeSnapshot(2025, 1, 200000), // valutazione di partenza
    makeSnapshot(2025, 2, 215000),
    makeSnapshot(2025, 3, 225000),
  ]
  const cashFlows = [makeCashFlow(2025, 2, 5000), makeCashFlow(2025, 3, 5000)]

  it('splits net worth into initial capital + contributions + market growth', () => {
    const chart = preparePerformanceChartData(snapshots, cashFlows)

    expect(chart[1].initialCapital).toBe(200000)
    expect(chart[1].contributions).toBe(5000)
    expect(chart[1].returns).toBe(10000) // 215000 - 200000 - 5000
    expect(chart[2].returns).toBe(15000) // 225000 - 200000 - 10000
  })

  it('keeps the decomposition adding up to the net worth line', () => {
    for (const point of preparePerformanceChartData(snapshots, cashFlows)) {
      expect(point.initialCapital + point.contributions + point.returns).toBeCloseTo(point.netWorth, 6)
      expect(point.investedBase).toBeCloseTo(point.initialCapital + point.contributions, 6)
      expect(point.investedBase + point.returns).toBeCloseTo(point.netWorth, 6)
    }
  })

  it('lets the invested base fall below the initial capital when withdrawals exceed contributions', () => {
    // Il caso che rompeva il grafico a bande impilate: contributi cumulati negativi. Con un'area e
    // una linea non c'è niente da impilare, quindi la base scende e basta.
    const withdrawing = preparePerformanceChartData(snapshots, [makeCashFlow(2025, 2, -30000)])

    expect(withdrawing[1].contributions).toBe(-30000)
    expect(withdrawing[1].investedBase).toBe(170000)
    expect(withdrawing[1].investedBase).toBeLessThan(withdrawing[1].initialCapital)
    expect(withdrawing[1].investedBase + withdrawing[1].returns).toBeCloseTo(withdrawing[1].netWorth, 6)
  })

  it('shows a losing period as a negative market band, not as capital', () => {
    // Prima del fix la banda "Investimenti" partiva dal capitale iniziale e restava ampiamente
    // positiva anche perdendo: mostrava come rendimento un capitale che il mercato non aveva creato.
    const losing = [makeSnapshot(2025, 1, 200000), makeSnapshot(2025, 2, 190000)]
    const chart = preparePerformanceChartData(losing, [])

    expect(chart[1].returns).toBe(-10000)
  })

  it('keeps the baseline month as the initial capital when it is skipped from the points', () => {
    // Con skipBaseline il primo mese non si disegna, ma resta la valutazione da cui il periodo parte:
    // è lo stesso startNW che alimenta ROI e TWR, quindi grafico e card scompongono lo stesso periodo.
    const chart = preparePerformanceChartData(snapshots, cashFlows, true)

    expect(chart.length).toBe(2)
    expect(chart[0].date).toBe('02/2025')
    expect(chart[0].initialCapital).toBe(200000)
  })
})

// Importando la storia vera (2024-10 in poi) aprile 2025 e' un mese interamente liquidato, e con
// qualche saldo netto negativo la base di partenza puo' scendere sotto zero. Un denominatore
// negativo non fallisce: ribalta il segno, e la catena del TWR si azzera in silenzio.
describe('una base di partenza non positiva non produce un rendimento', () => {
  function nw(year: number, month: number, totalNetWorth: number) {
    return {
      userId: 'user-1', year, month, totalNetWorth,
      liquidNetWorth: totalNetWorth, illiquidNetWorth: 0,
      byAssetClass: {}, byAsset: [], assetAllocation: {},
      createdAt: new Date(year, month - 1, 28),
    } as never
  }

  it('calculateROI returns null on a zero or negative starting capital', () => {
    expect(calculateROI(-800, 31_000, 31_000)).toBeNull()
    expect(calculateROI(0, 31_000, 31_000)).toBeNull()
  })

  it('the TWR skips the month instead of collapsing the chain', () => {
    // gen 1000 -> feb 1100 (+10%), poi una liquidazione porta la base a -800 e il mese dopo risale.
    // Senza la guardia il mese ripartito da -800 varrebbe -100% e azzererebbe tutto.
    const snapshots = [nw(2026, 1, 1000), nw(2026, 2, 1100), nw(2026, 3, -800), nw(2026, 4, 900)]
    const flows = [
      { date: new Date(2026, 2, 1), income: 0, expenses: 0, dividendIncome: 0, netCashFlow: -1900 },
      { date: new Date(2026, 3, 1), income: 0, expenses: 0, dividendIncome: 0, netCashFlow: 1700 },
    ]

    const twr = calculateTimeWeightedReturn(snapshots, flows, 3)

    expect(twr).not.toBeNull()
    expect(Number.isFinite(twr!)).toBe(true)
    expect(twr!).toBeGreaterThan(0)
  })
})
