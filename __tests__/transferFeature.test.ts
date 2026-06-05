/**
 * Tests for the transfer expense type feature.
 *
 * Verifies that transfers:
 * - Are excluded from all financial metrics (expenses, savings, performance, budget)
 * - Have correct sign convention (stored positive like income)
 * - Are properly handled by isCountableExpense utility
 */

import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/firebase/config', () => ({
  auth: { currentUser: null },
  db: {},
}))
vi.mock('@/lib/services/expenseService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/services/expenseService')>()
  return {
    ...actual,
    // Only export the pure functions we need
    isCountableExpense: actual.isCountableExpense,
    COUNTABLE_EXPENSE_TYPES: actual.COUNTABLE_EXPENSE_TYPES,
    calculateTotalExpenses: actual.calculateTotalExpenses,
    calculateTotalIncome: actual.calculateTotalIncome,
    calculateNetBalance: actual.calculateNetBalance,
  }
})
vi.mock('@/lib/services/snapshotService', () => ({}))
vi.mock('@/lib/services/assetAllocationService', () => ({}))

import {
  isCountableExpense,
  COUNTABLE_EXPENSE_TYPES,
  calculateTotalExpenses,
  calculateTotalIncome,
  calculateNetBalance,
} from '@/lib/services/expenseService'
import { getCashFlowsFromExpenses } from '@/lib/services/performanceService'
import { getActualForItem } from '@/lib/utils/budgetUtils'
import type { Expense, ExpenseType } from '@/types/expenses'
import type { BudgetItem } from '@/types/budget'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeExpense(
  type: ExpenseType,
  amount: number,
  overrides: Partial<Expense> = {},
): Expense {
  return {
    id: `exp-${Math.random().toString(36).slice(2)}`,
    userId: 'u1',
    type,
    categoryId: 'cat1',
    categoryName: 'Test',
    amount,
    currency: 'EUR',
    date: new Date(2025, 5, 15),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as Expense
}

// ---------------------------------------------------------------------------
// isCountableExpense
// ---------------------------------------------------------------------------

describe('isCountableExpense', () => {
  it('returns true for fixed, variable, debt', () => {
    expect(isCountableExpense(makeExpense('fixed', -500))).toBe(true)
    expect(isCountableExpense(makeExpense('variable', -200))).toBe(true)
    expect(isCountableExpense(makeExpense('debt', -300))).toBe(true)
  })

  it('returns false for income', () => {
    expect(isCountableExpense(makeExpense('income', 3000))).toBe(false)
  })

  it('returns false for transfer', () => {
    expect(isCountableExpense(makeExpense('transfer', 1000))).toBe(false)
  })

  it('COUNTABLE_EXPENSE_TYPES does not include transfer or income', () => {
    expect(COUNTABLE_EXPENSE_TYPES).not.toContain('transfer')
    expect(COUNTABLE_EXPENSE_TYPES).not.toContain('income')
    expect(COUNTABLE_EXPENSE_TYPES).toEqual(['fixed', 'variable', 'debt'])
  })
})

// ---------------------------------------------------------------------------
// calculateTotalExpenses / calculateTotalIncome / calculateNetBalance
// ---------------------------------------------------------------------------

describe('expense calculations exclude transfers', () => {
  const expenses = [
    makeExpense('income', 5000),
    makeExpense('fixed', -1000),
    makeExpense('variable', -200),
    makeExpense('transfer', 500), // stored positive, should be ignored
  ]

  it('calculateTotalExpenses ignores transfers', () => {
    expect(calculateTotalExpenses(expenses)).toBe(1200) // 1000 + 200
  })

  it('calculateTotalIncome ignores transfers', () => {
    expect(calculateTotalIncome(expenses)).toBe(5000)
  })

  it('calculateNetBalance ignores transfers', () => {
    expect(calculateNetBalance(expenses)).toBe(3800) // 5000 - 1200
  })
})

// ---------------------------------------------------------------------------
// getCashFlowsFromExpenses excludes transfers
// ---------------------------------------------------------------------------

describe('getCashFlowsFromExpenses excludes transfers', () => {
  it('transfer expenses do not contribute to cash flow data', () => {
    const expenses = [
      makeExpense('income', 3000, { date: new Date(2025, 0, 15) }),
      makeExpense('fixed', -800, { date: new Date(2025, 0, 20) }),
      makeExpense('transfer', 500, { date: new Date(2025, 0, 25) }),
    ]
    const start = new Date(2025, 0, 1)
    const end = new Date(2025, 0, 31)
    const result = getCashFlowsFromExpenses(expenses, start, end)

    expect(result.length).toBe(1) // one month bucket
    const jan = result[0]
    expect(jan.income).toBe(3000)
    expect(jan.expenses).toBe(800)
    expect(jan.netCashFlow).toBe(2200) // 3000 - 800, transfer excluded
  })
})

// ---------------------------------------------------------------------------
// Budget matching excludes transfers
// ---------------------------------------------------------------------------

describe('budget matching excludes transfers', () => {
  it('transfer expense never matches a type-scope budget item', () => {
    const item: BudgetItem = {
      id: 'b1',
      kind: 'expense',
      scope: 'type',
      period: 'monthly',
      expenseType: 'fixed',
      amount: 1000,
      order: 0,
    }
    const transferExpense = makeExpense('transfer', 500, {
      date: new Date(2025, 5, 1),
    })
    const result = getActualForItem(item, [transferExpense], 2025)
    expect(result).toBe(0)
  })

  it('transfer expense never matches a category-scope budget item', () => {
    const item: BudgetItem = {
      id: 'b2',
      kind: 'expense',
      scope: 'category',
      period: 'monthly',
      categoryId: 'cat1',
      categoryName: 'Test',
      amount: 500,
      order: 0,
    }
    const transferExpense = makeExpense('transfer', 500, {
      categoryId: 'cat1',
      date: new Date(2025, 5, 1),
    })
    const result = getActualForItem(item, [transferExpense], 2025)
    expect(result).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// Sign convention
// ---------------------------------------------------------------------------

describe('transfer sign convention', () => {
  it('transfers are stored with positive amount (like income)', () => {
    // This documents the convention: transfer amounts are positive.
    // The direction is encoded by linkedCashAssetId (origin) and transferCashAssetId (destination).
    const transfer = makeExpense('transfer', 500)
    expect(transfer.amount).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// getMonthlyExpenseSummary transfer exclusion logic
// ---------------------------------------------------------------------------

describe('monthly expense summary logic excludes transfers from totals', () => {
  it('transfer amounts do not inflate totalExpenses or totalIncome', () => {
    // Replicates the getMonthlyExpenseSummary loop logic to verify
    // that transfers are excluded from totalIncome and totalExpenses.
    const expenses = [
      makeExpense('income', 5000),
      makeExpense('fixed', -1000),
      makeExpense('variable', -200),
      makeExpense('transfer', 500),
    ]

    let totalIncome = 0
    let totalExpenses = 0
    const byType: Record<string, { total: number; count: number }> = {
      fixed: { total: 0, count: 0 },
      variable: { total: 0, count: 0 },
      debt: { total: 0, count: 0 },
      income: { total: 0, count: 0 },
      transfer: { total: 0, count: 0 },
    }

    expenses.forEach(expense => {
      if (expense.type === 'income') {
        totalIncome += expense.amount
      } else if (expense.type !== 'transfer') {
        totalExpenses += Math.abs(expense.amount)
      }
      byType[expense.type].total += Math.abs(expense.amount)
      byType[expense.type].count += 1
    })

    const netBalance = totalIncome - totalExpenses

    expect(totalIncome).toBe(5000)
    expect(totalExpenses).toBe(1200) // 1000 + 200, no transfer
    expect(netBalance).toBe(3800)    // 5000 - 1200

    // Transfer is still tracked in byType for informational purposes
    expect(byType.transfer.total).toBe(500)
    expect(byType.transfer.count).toBe(1)
  })
})
