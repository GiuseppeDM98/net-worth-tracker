/**
 * Cashflow breakdown — pure aggregation of a period's expense documents.
 *
 * Free of React, Firestore and the DOM, so it can be unit-tested against plain arrays.
 * Built for the AI assistant's context bundle, but it deliberately knows nothing about
 * the assistant: it takes expenses and returns numbers.
 *
 * WHY ONE FUNCTION AND NOT TWO
 * The assistant context service used to run two separate passes over the same array —
 * one for the totals, one for the category breakdown — each with its own classifier.
 * Nothing made them agree, and they didn't: the totals skipped transfers while the
 * breakdown filtered on the sign of `amount`. The failure mode is nastier than a wrong
 * number, because an LLM that adds up the category rows and lands somewhere other than
 * the stated total will confidently narrate the discrepancy.
 *
 * So: one pass, one accumulator. `Σ expensesByCategory[].total === totals.totalExpenses`
 * holds because the four writes (total, per-type, per-category, per-subcategory) sit on
 * adjacent lines of the same branch. Breaking the invariant would take an `if` that
 * isn't there.
 *
 * CLASSIFICATION
 * By `type`, never by the sign of `amount` — the same rule as expenseService's
 * isCountableExpense and monthlyEmailService's aggregateExpenses. A refund is an
 * expense-type row with a POSITIVE amount; classifying by sign files it under income
 * and under-reports spending. (Email hit this exact bug on 2026-07-01.)
 *
 * SIGN CONVENTION
 * Accumulated as absolute magnitudes, negated once on the way out. See the note above
 * the interfaces in types/expenses.ts for why expenses stay negative here while
 * costCenterUtils returns positives.
 */

import { format } from 'date-fns';
import {
  CashflowBreakdown,
  Expense,
  ExpenseBreakdownType,
  ExpenseCategoryBreakdown,
  EXPENSE_TYPE_LABELS,
  IncomeCategoryBreakdown,
  IndividualExpenseRow,
  NO_SUBCATEGORY_KEY,
  NO_SUBCATEGORY_LABEL,
  UNCATEGORIZED_LABEL,
} from '@/types/expenses';
import { getItalyDate } from '@/lib/utils/dateHelpers';

// Order the spending types are reported in: structural first, then the catch-all.
const EXPENSE_BREAKDOWN_TYPE_ORDER: ExpenseBreakdownType[] = ['fixed', 'variable', 'debt', 'unclassified'];

const BREAKDOWN_TYPE_LABELS: Record<ExpenseBreakdownType, string> = {
  ...EXPENSE_TYPE_LABELS,
  unclassified: 'Non classificate',
};

/**
 * Turns a magnitude into the negative figure the bundle exposes.
 *
 * The zero guard is not cosmetic: plain `-0` survives into the prompt, where the
 * currency formatter renders it as "-0 €" and the assistant faithfully repeats it.
 */
function asNegative(magnitude: number): number {
  return magnitude === 0 ? 0 : -magnitude;
}

export interface BuildCashflowBreakdownOptions {
  /** Income rows in this category are reported as dividends rather than income. */
  dividendCategoryId?: string;
  /** How many largest single expenses to keep. Callers scale this with the period length. */
  topIndividualLimit?: number;
}

const DEFAULT_TOP_INDIVIDUAL_LIMIT = 5;

interface SubCategoryAccumulator {
  subCategoryName: string;
  total: number;
  count: number;
}

interface CategoryAccumulator {
  categoryName: string;
  total: number;
  count: number;
  subCategories: Map<string, SubCategoryAccumulator>;
}

/**
 * Aggregates a period's expenses into totals, a category → subcategory tree, per-type
 * and per-income-category breakdowns, and the largest single transactions.
 *
 * @param expenses The period's expense documents, already filtered by date range.
 * @param options  `dividendCategoryId` splits dividends out of income (matching
 *                 performanceService); `topIndividualLimit` defaults to 5.
 *
 * @returns Totals plus uncapped breakdowns. Expense figures are negative, income
 *          positive. Categories and subcategories are sorted by magnitude descending.
 *
 * Transfers (`type === 'transfer'`) are skipped outright: they are internal movements,
 * net-zero by construction, and counting them would inflate every total they touch.
 */
export function buildCashflowBreakdown(
  expenses: Expense[],
  options: BuildCashflowBreakdownOptions = {}
): CashflowBreakdown {
  const { dividendCategoryId, topIndividualLimit = DEFAULT_TOP_INDIVIDUAL_LIMIT } = options;

  let totalIncome = 0;
  let totalDividends = 0;
  let totalExpensesAbs = 0;
  let transactionCount = 0;
  let expenseTransactionCount = 0;
  let unclassifiedSubCategoryAbs = 0;

  const byCategory = new Map<string, CategoryAccumulator>();
  const byIncomeCategory = new Map<string, { categoryName: string; total: number; count: number; subCategories: Map<string, SubCategoryAccumulator> }>();
  const byType = new Map<ExpenseBreakdownType, number>();
  const individualExpenses: IndividualExpenseRow[] = [];

  for (const expense of expenses) {
    // Internal movements: net-zero, out of every figure including the counts.
    if (expense.type === 'transfer') continue;

    transactionCount += 1;

    const categoryName = expense.categoryName?.trim() || UNCATEGORIZED_LABEL;

    if (expense.type === 'income') {
      if (dividendCategoryId && expense.categoryId === dividendCategoryId) {
        totalDividends += expense.amount;
        continue;
      }
      totalIncome += expense.amount;
      const key = expense.categoryId || categoryName;
      const entry = byIncomeCategory.get(key) ?? { categoryName, total: 0, count: 0, subCategories: new Map<string, SubCategoryAccumulator>() };
      entry.total += expense.amount;
      entry.count += 1;
      const incomeSubKey = expense.subCategoryId?.trim() || NO_SUBCATEGORY_KEY;
      const incomeSub = entry.subCategories.get(incomeSubKey) ?? {
        subCategoryName: incomeSubKey === NO_SUBCATEGORY_KEY ? NO_SUBCATEGORY_LABEL : expense.subCategoryName?.trim() || NO_SUBCATEGORY_LABEL,
        total: 0,
        count: 0,
      };
      incomeSub.total += expense.amount;
      incomeSub.count += 1;
      entry.subCategories.set(incomeSubKey, incomeSub);
      byIncomeCategory.set(key, entry);
      continue;
    }

    // Everything else is spending, magnitude-wise: a refund booked against a spending
    // category raises the category's gross rather than netting off, matching
    // expenseService.calculateTotalExpenses.
    const absAmount = Math.abs(expense.amount);
    // `type` is declared required, but these docs come out of Firestore through an
    // `as Expense` cast: a legacy or imported row can genuinely arrive without one.
    const type: ExpenseBreakdownType = expense.type ?? 'unclassified';
    const subCategoryKey = expense.subCategoryId?.trim() || NO_SUBCATEGORY_KEY;
    const subCategoryName =
      subCategoryKey === NO_SUBCATEGORY_KEY
        ? NO_SUBCATEGORY_LABEL
        : expense.subCategoryName?.trim() || NO_SUBCATEGORY_LABEL;

    const categoryKey = expense.categoryId || categoryName;
    const category = byCategory.get(categoryKey) ?? {
      categoryName,
      total: 0,
      count: 0,
      subCategories: new Map<string, SubCategoryAccumulator>(),
    };
    const subCategory = category.subCategories.get(subCategoryKey) ?? { subCategoryName, total: 0, count: 0 };

    // The four writes below must stay adjacent — see the module header.
    totalExpensesAbs += absAmount;
    byType.set(type, (byType.get(type) ?? 0) + absAmount);
    category.total += absAmount;
    subCategory.total += absAmount;

    category.count += 1;
    subCategory.count += 1;
    category.subCategories.set(subCategoryKey, subCategory);
    byCategory.set(categoryKey, category);

    expenseTransactionCount += 1;
    if (subCategoryKey === NO_SUBCATEGORY_KEY) {
      unclassifiedSubCategoryAbs += absAmount;
    }

    individualExpenses.push({
      categoryName,
      subCategoryName: subCategoryKey === NO_SUBCATEGORY_KEY ? undefined : subCategoryName,
      amount: asNegative(absAmount),
      notes: expense.notes?.trim() || undefined,
      date: format(getItalyDate(expense.date), 'yyyy-MM-dd'),
    });
  }

  const expensesByCategory: ExpenseCategoryBreakdown[] = [...byCategory.values()]
    .map((category) => ({
      categoryName: category.categoryName,
      total: asNegative(category.total),
      transactionCount: category.count,
      subCategories: [...category.subCategories.values()]
        .map((sub) => ({
          subCategoryName: sub.subCategoryName,
          total: asNegative(sub.total),
          transactionCount: sub.count,
        }))
        .sort((a, b) => a.total - b.total), // most negative first
    }))
    .sort((a, b) => a.total - b.total);

  const incomeByCategory: IncomeCategoryBreakdown[] = [...byIncomeCategory.values()]
    .map((entry) => {
      const named = [...entry.subCategories.keys()].some((key) => key !== NO_SUBCATEGORY_KEY);
      return {
        categoryName: entry.categoryName,
        total: entry.total,
        transactionCount: entry.count,
        // Only when a row names one: «Senza sottocategoria» alone would say nothing.
        ...(named
          ? {
              subCategories: [...entry.subCategories.values()]
                .map((sub) => ({ subCategoryName: sub.subCategoryName, total: sub.total, transactionCount: sub.count }))
                .sort((a, b) => b.total - a.total),
            }
          : {}),
      };
    })
    .sort((a, b) => b.total - a.total);

  const expensesByType = EXPENSE_BREAKDOWN_TYPE_ORDER.filter((type) => (byType.get(type) ?? 0) > 0).map((type) => ({
    type,
    label: BREAKDOWN_TYPE_LABELS[type],
    total: asNegative(byType.get(type) as number),
  }));

  const topIndividualExpenses = individualExpenses
    .sort((a, b) => a.amount - b.amount)
    .slice(0, topIndividualLimit);

  return {
    totals: {
      totalIncome,
      totalDividends,
      totalExpenses: asNegative(totalExpensesAbs),
      netCashFlow: totalIncome + totalDividends - totalExpensesAbs,
      transactionCount,
      expenseTransactionCount,
    },
    expensesByCategory,
    incomeByCategory,
    expensesByType,
    topIndividualExpenses,
    unclassifiedSubCategoryShare: totalExpensesAbs > 0 ? unclassifiedSubCategoryAbs / totalExpensesAbs : 0,
  };
}
