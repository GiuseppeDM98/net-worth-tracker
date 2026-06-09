import { describe, it, expect, vi } from 'vitest'

// Mock Firebase-dependent modules — fireService imports these transitively.
vi.mock('@/lib/services/expenseService', () => ({}))
vi.mock('@/lib/services/snapshotService', () => ({}))

import { buildIncomeSourceBreakdown } from '@/lib/services/fireService'
import type { Expense } from '@/types/expenses'

function makeExpense(overrides: Partial<Expense>): Expense {
  return {
    id: 'e',
    userId: 'u',
    type: 'income',
    categoryId: 'cat',
    categoryName: 'Stipendio',
    amount: 1000,
    currency: 'EUR',
    date: new Date('2025-06-01'),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

describe('buildIncomeSourceBreakdown', () => {
  it('should group income into a category → subcategory tree', () => {
    // Arrange
    const expenses: Expense[] = [
      makeExpense({ subCategoryId: 's1', subCategoryName: 'Giuseppe', amount: 2000 }),
      makeExpense({ subCategoryId: 's2', subCategoryName: 'Partner', amount: 1500 }),
      makeExpense({
        categoryId: 'rent',
        categoryName: 'Affitti',
        subCategoryId: undefined,
        amount: 800,
      }),
    ]

    // Act
    const breakdown = buildIncomeSourceBreakdown(expenses, 1)

    // Assert
    const salary = breakdown.find((c) => c.categoryId === 'cat')!
    expect(salary.annualAmount).toBe(3500)
    expect(salary.subCategories).toHaveLength(2)
    expect(salary.subCategories.find((s) => s.subCategoryId === 's1')!.annualAmount).toBe(2000)

    const rent = breakdown.find((c) => c.categoryId === 'rent')!
    expect(rent.subCategories[0].subCategoryId).toBe('__none__')
    expect(rent.annualAmount).toBe(800)
  })

  it('should ignore non-income expenses', () => {
    // Arrange
    const expenses: Expense[] = [
      makeExpense({ amount: 2000 }),
      makeExpense({ type: 'variable', amount: -500 }),
      makeExpense({ type: 'transfer', amount: 300 }),
    ]

    // Act
    const breakdown = buildIncomeSourceBreakdown(expenses, 1)

    // Assert
    expect(breakdown).toHaveLength(1)
    expect(breakdown[0].annualAmount).toBe(2000)
  })

  it('should scale amounts by the annualization factor so they sum to the annualised total', () => {
    // Arrange: 6 months of data → factor 2 to project a full year.
    const expenses: Expense[] = [
      makeExpense({ subCategoryId: 's1', subCategoryName: 'Giuseppe', amount: 6000 }),
    ]

    // Act
    const breakdown = buildIncomeSourceBreakdown(expenses, 2)

    // Assert
    expect(breakdown[0].annualAmount).toBe(12_000)
    expect(breakdown[0].subCategories[0].annualAmount).toBe(12_000)
  })

  it('should return an empty array when there is no income', () => {
    expect(buildIncomeSourceBreakdown([], 1)).toEqual([])
  })
})
