import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/services/assetService', () => ({
  calculateAssetValue: vi.fn(),
  calculateTotalValue: vi.fn(),
}))

vi.mock('@/lib/services/assetAllocationService', () => ({
  calculateCurrentAllocation: vi.fn(),
}))

import { prepareMonthlyLaborMetricsData } from '@/lib/services/chartService'
import { MonthlySnapshot } from '@/types/assets'
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
