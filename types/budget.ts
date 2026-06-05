import { ExpenseType } from './expenses';

// Budget feature types
//
// Budget items target expense types, categories, or subcategories.
// Scope drives which fields are populated:
//   'type'        → expenseType only
//   'category'    → categoryId + categoryName
//   'subcategory' → categoryId + categoryName + subCategoryId + subCategoryName
//
// `kind` separates spending limits from income targets:
//   'expense' → a ceiling; going over is bad (progress fills toward 100% = warning).
//   'income'  → a target; reaching 100% is good (inverted progress semantics).
// Income budgets are intentionally kept separate from expense budgets so the
// Overall budget (a spending ceiling) only ever aggregates expense items.

export type BudgetScope = 'type' | 'category' | 'subcategory';

export type BudgetKind = 'expense' | 'income';

// The horizon a budget is measured over:
//   'monthly' → `amount` is a per-month limit, tracked against the current month.
//   'annual'  → `amount` is a per-year limit, tracked against year-to-date spend.
// Annual budgets fit "spiky" categories (vacations, gifts) where a monthly cap is
// meaningless. They are independent of the (monthly) overall budget.
export type BudgetPeriod = 'monthly' | 'annual';

export interface BudgetItem {
  id: string;
  kind: BudgetKind;
  scope: BudgetScope;
  period: BudgetPeriod;
  // Populated only for scope='type' — expense items exclude 'income' and 'transfer'
  expenseType?: Exclude<ExpenseType, 'transfer'>;
  // Populated for scope='category' | 'subcategory'
  categoryId?: string;
  categoryName?: string; // denormalized fallback if category is deleted
  // Populated only for scope='subcategory'
  subCategoryId?: string;
  subCategoryName?: string; // denormalized fallback
  amount: number; // positive EUR limit for the item's period (monthly or annual)
  // Sort order within the item's section (period + kind group)
  order: number;
}

// Single document per user stored at budgets/{userId}
export interface BudgetConfig {
  userId: string;
  items: BudgetItem[];
  // Overall monthly spending ceiling across all expenses. undefined = not set.
  // When set, the sum of expense Category budgets must not exceed it (validateBudgetAllocation).
  overallMonthlyAmount?: number;
  // Master switch for threshold alerts (in-app banner + monthly-email section).
  alertsEnabled?: boolean;
  // Percentage thresholds that trigger an alert when crossed (default [50, 75, 90, 100]).
  alertThresholds?: number[];
  updatedAt: Date;
}

export const DEFAULT_ALERT_THRESHOLDS = [50, 75, 90, 100];

export type BudgetViewMode = 'annual' | 'monthly';

// Computed comparison object built from allExpenses for display
export interface BudgetComparison {
  item: BudgetItem;
  // Annual totals
  currentYearTotal: number;
  previousYearTotal: number;
  // Mean of annual totals from historyStartYear to currentYear-1
  // 0 when no historical years exist
  historicalAverage: number;
  // Monthly breakdowns (index 0 = Jan, index 11 = Dec)
  currentYearMonthly: number[];
  previousYearMonthly: number[];
  // Historical average per calendar month across available years
  historicalMonthlyAverage: number[];
  // currentYearTotal / (monthlyAmount * 12) — for the annual progress bar
  budgetUsedRatio: number;
}

// ==================== Spending Forecast ====================

// End-of-month projection for a single budget scope (one item, or the overall budget),
// derived from the current month's spending pace.
export interface SpendingForecast {
  // EUR already spent (or earned, for income) in the current month so far
  spentSoFar: number;
  // Monthly budget amount this forecast is measured against
  budgetAmount: number;
  // Linear projection of the full-month total at the current daily pace
  projectedTotal: number;
  // budgetAmount − projectedTotal (negative = projected overspend)
  remainingBudget: number;
  // max(0, projectedTotal − budgetAmount) — how much the projection exceeds the budget
  estimatedOverspend: number;
  // Budget left for the rest of the month spread evenly over remaining days.
  // 0 when the budget is already exhausted.
  dailyAllowance: number;
  daysElapsed: number;
  daysInMonth: number;
}

// ==================== Budget Insights ====================

export interface BudgetInsights {
  // Expense category with the highest spend in the current month (null if none)
  topCategory: { label: string; amount: number } | null;
  // Expense items whose end-of-month projection exceeds their budget
  categoriesAtRisk: Array<{ label: string; projectedTotal: number; budgetAmount: number }>;
  // Current-month total expenses vs the trailing average of prior months this year
  currentMonthExpenses: number;
  priorMonthsAverage: number;
  // priorMonthsAverage prorated to the current day of month — the spend you would
  // typically have reached by today. Used for an apples-to-apples comparison with
  // the partial current month (instead of comparing against a full month).
  expectedSpendToDate: number;
  // Average daily expense spend so far this month
  averageDailySpend: number;
}

// ==================== Budget Alerts ====================

export type BudgetAlertLevel = 'warning' | 'exceeded';

// A single fired alert for an expense budget (or the overall budget) that has
// crossed one of the configured thresholds in the current period.
export interface BudgetAlert {
  // Stable identifier of the budget scope this alert refers to (budgetItemKey or '__overall__')
  key: string;
  label: string;
  level: BudgetAlertLevel;
  // Highest crossed threshold (e.g. 90) — 100+ means the budget is exceeded
  threshold: number;
  spent: number;
  budgetAmount: number;
  usedRatio: number;
  // True when the end-of-month projection (not just current spend) crosses the budget
  forecastedOverrun: boolean;
}
