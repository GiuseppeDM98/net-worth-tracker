import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/services/assetService', () => ({
  calculateAssetValue: vi.fn(),
  calculateTotalValue: vi.fn(),
}))

vi.mock('@/lib/services/assetAllocationService', () => ({
  calculateCurrentAllocation: vi.fn(),
}))

import { prepareMonthlyLaborMetricsData, prepareAssetClassHistoryData } from '@/lib/services/chartService'
import { Asset, MonthlySnapshot } from '@/types/assets'
import { Expense } from '@/types/expenses'

function makeSnapshot(year: number, month: number, totalNetWorth: number): MonthlySnapshot {
  return { year, month, totalNetWorth, isDummy: false } as MonthlySnapshot
}

function makeExpense(year: number, month: number, day: number, type: 'income' | 'fixed', amount: number, categoryId: string): Expense {
  return {
    id: `${year}-${month}-${day}-${type}-${amount}`,
    userId: 'user-1',
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

describe('prepareMonthlyLaborMetricsData', () => {
  it('includes net worth growth and uses previous December as January baseline', () => {
    const snapshots = [
      makeSnapshot(2024, 12, 1000),
      makeSnapshot(2025, 1, 1150),
      makeSnapshot(2025, 2, 1100),
    ]

    const expenses = [
      makeExpense(2025, 1, 10, 'income', 200, 'salary'),
      makeExpense(2025, 1, 12, 'fixed', -50, 'rent'),
      makeExpense(2025, 2, 11, 'income', 100, 'salary'),
      makeExpense(2025, 2, 14, 'fixed', -180, 'rent'),
    ]

    const result = prepareMonthlyLaborMetricsData(snapshots, expenses, ['salary'], 2025)

    expect(result).toEqual([
      {
        period: 'Gen 2025',
        month: 1,
        year: 2025,
        laborIncome: 200,
        savedFromWork: 150,
        investmentGrowth: 0,
        netWorthGrowth: 150,
      },
      {
        period: 'Feb 2025',
        month: 2,
        year: 2025,
        laborIncome: 100,
        savedFromWork: -80,
        investmentGrowth: 30,
        netWorthGrowth: -50,
      },
    ])
  })
})

describe('prepareAssetClassHistoryData', () => {
  function makeAssetClassSnapshot(
    year: number,
    month: number,
    totalNetWorth: number,
    byAssetClass: Record<string, number>,
    byAsset: Array<{ assetId: string; totalValue: number }> = []
  ): MonthlySnapshot {
    return { year, month, totalNetWorth, byAssetClass, byAsset } as unknown as MonthlySnapshot
  }

  it('should emit every member of the AssetClass union, not the six the chart used to plot', () => {
    // Arrange
    const snapshots = [
      makeAssetClassSnapshot(2025, 1, 1000, { equity: 500, trendFollowing: 300, carry: 200 }),
    ]

    // Act
    const [point] = prepareAssetClassHistoryData(snapshots)

    // Assert
    expect(Object.keys(point.byClass).sort()).toEqual([
      'bonds', 'carry', 'cash', 'commodity', 'crypto', 'equity', 'realestate', 'trendFollowing',
    ])
    expect(point.byClass.trendFollowing).toBe(300)
    expect(point.byClass.carry).toBe(200)
  })

  it('should default a class absent from the snapshot to zero rather than undefined', () => {
    // Arrange
    const snapshots = [makeAssetClassSnapshot(2025, 1, 500, { equity: 500 })]

    // Act
    const [point] = prepareAssetClassHistoryData(snapshots)

    // Assert
    expect(point.byClass.bonds).toBe(0)
    expect(point.byClass.carry).toBe(0)
  })

  it('should carve the pension fund out of the classes its composition was folded into', () => {
    // Arrange — a 300 fund split 60/40 equity/bonds, already included in byAssetClass
    const snapshots = [
      makeAssetClassSnapshot(2025, 1, 1000, { equity: 680, bonds: 320 }, [
        { assetId: 'fund-1', totalValue: 300 },
      ]),
    ]
    const pensionAssets = [
      {
        id: 'fund-1',
        assetClass: 'equity',
        composition: [
          { assetClass: 'equity', percentage: 60 },
          { assetClass: 'bonds', percentage: 40 },
        ],
      },
    ] as unknown as Asset[]

    // Act
    const [point] = prepareAssetClassHistoryData(snapshots, pensionAssets)

    // Assert
    expect(point.pension).toBe(300)
    expect(point.byClass.equity).toBe(500)
    expect(point.byClass.bonds).toBe(200)
  })

  it('should fall back to the fund assetClass when it carries no composition', () => {
    // Arrange
    const snapshots = [
      makeAssetClassSnapshot(2025, 1, 1000, { equity: 1000 }, [
        { assetId: 'fund-1', totalValue: 250 },
      ]),
    ]
    const pensionAssets = [{ id: 'fund-1', assetClass: 'equity' }] as unknown as Asset[]

    // Act
    const [point] = prepareAssetClassHistoryData(snapshots, pensionAssets)

    // Assert
    expect(point.pension).toBe(250)
    expect(point.byClass.equity).toBe(750)
  })

  it('should clamp the carve-out at zero, which is what lets the plotted sum exceed the total', () => {
    // Arrange — today's composition attributes more to bonds than that class held back then
    const snapshots = [
      makeAssetClassSnapshot(2025, 1, 900, { equity: 800, bonds: 100 }, [
        { assetId: 'fund-1', totalValue: 400 },
      ]),
    ]
    const pensionAssets = [
      {
        id: 'fund-1',
        assetClass: 'bonds',
        composition: [{ assetClass: 'bonds', percentage: 100 }],
      },
    ] as unknown as Asset[]

    // Act
    const [point] = prepareAssetClassHistoryData(snapshots, pensionAssets)

    // Assert — bonds floors at 0 instead of going to -300, so the parts now overshoot the total
    expect(point.byClass.bonds).toBe(0)
    const plotted = Object.values(point.byClass).reduce((sum, v) => sum + v, 0) + point.pension
    expect(plotted).toBeGreaterThan(point.totalNetWorth)
  })

  it('should pass the snapshot total and the MM/YY axis key through unchanged', () => {
    // Arrange
    const snapshots = [makeAssetClassSnapshot(2026, 8, 12345, { equity: 1 })]

    // Act
    const [point] = prepareAssetClassHistoryData(snapshots)

    // Assert
    expect(point.totalNetWorth).toBe(12345)
    expect(point.date).toBe('08/26')
    expect(point.month).toBe(8)
    expect(point.year).toBe(2026)
  })
})

describe('prepareAssetClassHistoryData — pension carve-out paths', () => {
  function makeSnapshot(
    year: number,
    month: number,
    totalNetWorth: number,
    byAssetClass: Record<string, number>,
    // Loose on purpose: the fixtures give `byAsset` entries only the fields under test, which a
    // `Partial<MonthlySnapshot>` would reject because its array element type is complete.
    extra: Record<string, unknown> = {}
  ): MonthlySnapshot {
    return { year, month, totalNetWorth, byAssetClass, byAsset: [], ...extra } as unknown as MonthlySnapshot
  }

  /** A fund whose composition TODAY is 50/50 but was 70/30 when the snapshot was written. */
  const rebalancedFund = [
    {
      id: 'fund-1',
      assetClass: 'equity',
      composition: [
        { assetClass: 'equity', percentage: 50 },
        { assetClass: 'bonds', percentage: 50 },
      ],
    },
  ] as unknown as Asset[]

  it('should subtract the frozen split when the snapshot carries one, ignoring today composition', () => {
    // Arrange — snapshot froze 70/30 of a 1000 fund; the fund is 50/50 today
    const snapshots = [
      makeSnapshot(2026, 8, 3000, { equity: 2200, bonds: 800 }, {
        pension: { totalValue: 1000, byAssetClass: { equity: 700, bonds: 300 } },
      }),
    ]

    // Act
    const [point] = prepareAssetClassHistoryData(snapshots, rebalancedFund)

    // Assert — the historical 70/30 is used, not the current 50/50
    expect(point.pension).toBe(1000)
    expect(point.byClass.equity).toBe(1500)
    expect(point.byClass.bonds).toBe(500)
  })

  it('should reconcile exactly, leaving nothing unattributed on the measured path', () => {
    // Arrange — bonds held only 200, while today's 50/50 fund would claim 500 of it: on the
    // estimated path the clamp floors bonds at 0 and swallows 300, so the parts overshoot the
    // total. The frozen split cannot do that, because it is a subset of what it subtracts from.
    const snapshots = [
      makeSnapshot(2026, 8, 3000, { equity: 2800, bonds: 200 }, {
        byAsset: [{ assetId: 'fund-1', totalValue: 1000 }],
        pension: { totalValue: 1000, byAssetClass: { equity: 800, bonds: 200 } },
      }),
    ]

    // Act
    const [point] = prepareAssetClassHistoryData(snapshots, rebalancedFund)

    // Assert — Σ classes + pension === the snapshot total, with no clamp swallowing anything
    const plotted = Object.values(point.byClass).reduce((sum, v) => sum + v, 0) + point.pension
    expect(plotted).toBeCloseTo(point.totalNetWorth, 9)
  })

  it('should not need the live asset list at all when the snapshot carries the split', () => {
    // Arrange — no pensionAssets passed, which the legacy path depends on entirely
    const snapshots = [
      makeSnapshot(2026, 8, 1000, { equity: 1000 }, {
        pension: { totalValue: 400, byAssetClass: { equity: 400 } },
      }),
    ]

    // Act
    const [point] = prepareAssetClassHistoryData(snapshots, [])

    // Assert
    expect(point.pension).toBe(400)
    expect(point.byClass.equity).toBe(600)
  })

  it('should record a measured zero as different from an absent split', () => {
    // Arrange — a user with no pension funds still gets the block written
    const snapshots = [
      makeSnapshot(2026, 8, 1000, { equity: 1000 }, {
        byAsset: [{ assetId: 'fund-1', totalValue: 400 }],
        pension: { totalValue: 0, byAssetClass: {} },
      }),
    ]

    // Act
    const [point] = prepareAssetClassHistoryData(snapshots, rebalancedFund)

    // Assert — the estimated path must NOT run and invent a band from byAsset
    expect(point.pension).toBe(0)
    expect(point.byClass.equity).toBe(1000)
  })

  it('should fall back to today composition on a snapshot written before the field existed', () => {
    // Arrange — no `pension` block, so the 50/50 of today is applied to a 70/30 month
    const snapshots = [
      makeSnapshot(2026, 1, 3000, { equity: 2200, bonds: 800 }, {
        byAsset: [{ assetId: 'fund-1', totalValue: 1000 }],
      }),
    ]

    // Act
    const [point] = prepareAssetClassHistoryData(snapshots, rebalancedFund)

    // Assert — the estimate over-subtracts bonds and under-subtracts equity
    expect(point.pension).toBe(1000)
    expect(point.byClass.equity).toBe(1700)
    expect(point.byClass.bonds).toBe(300)
  })
})
