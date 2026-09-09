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

type BudgetScope = 'type' | 'category' | 'subcategory';

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

// The budget configuration as it stood in a given month — budgetHistory/{userId}/months/{YYYY-MM}.
// Written by the daily cron (lib/server/budgetHistoryService.ts), so the document of a month
// holds the configuration of its LAST captured day; the ceiling itself is not versioned in
// `budgets/{userId}`, and without this record a closed month can only be read against
// today's ceiling. Never written by the client.
export interface BudgetHistoryRecord {
  userId: string;
  // 'YYYY-MM', Italian calendar
  month: string;
  overallMonthlyAmount?: number;
  items: BudgetItem[];
  alertsEnabled: boolean;
  alertThresholds: number[];
  capturedAt: Date;
}

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

// How a budget scope's month-end figure is projected (budgetUtils.resolveItemPace):
//   'variable' → the linear pace on what is booked to date, plus the rows already
//                dated after today (the app's ONE projection rule, spendingProjection.ts).
//   'fixed'    → no pace at all: a fixed or debt category is a charge that lands once
//                (rent on the 1st, an instalment on the 27th), so projecting it by the
//                day would flag it "at risk" all month. Only booked + scheduled rows count.
export type BudgetPace = 'variable' | 'fixed';

// What is booked in the month, split at today: the projection extrapolates only the former.
export interface SpendingSplit {
  spentToDate: number;
  scheduled: number;
}

// End-of-month projection for a single budget scope (one item, or the overall budget).
export interface SpendingForecast {
  // Everything booked in the month (spentToDate + scheduled) — what the ratios read.
  spentSoFar: number;
  spentToDate: number;
  scheduled: number;
  // Monthly budget amount this forecast is measured against
  budgetAmount: number;
  // Month-end total: the pace on spentToDate + scheduled ('variable'), or spentSoFar ('fixed')
  projectedTotal: number;
  // budgetAmount − projectedTotal (negative = projected overspend)
  remainingBudget: number;
  // max(0, projectedTotal − budgetAmount) — how much the projection exceeds the budget
  estimatedOverspend: number;
  // Budget left for the rest of the month spread evenly over remaining days.
  // 0 when the budget is already exhausted or the month is over.
  dailyAllowance: number;
  daysElapsed: number;
  daysInMonth: number;
}

// ==================== Categories at Risk ====================

// A monthly expense budget whose month-end projection exceeds its amount.
export interface BudgetAtRisk {
  key: string;
  label: string;
  projectedTotal: number;
  budgetAmount: number;
  // projectedTotal − budgetAmount, always > 0
  overBy: number;
}

export interface BudgetRiskSummary {
  // Largest overrun first
  atRisk: BudgetAtRisk[];
  // Monthly expense budgets the projection was run on (subcategory slices excluded)
  evaluated: number;
  // False in the first days of the month, when a pace is not yet a pace
  canForecast: boolean;
}

// ==================== Budget Alerts ====================

type BudgetAlertLevel = 'warning' | 'exceeded';

// A single fired alert for an expense budget (or the overall budget) that has
// crossed one of the configured thresholds in the current period.
export interface BudgetAlert {
  // Stable identifier of the budget scope this alert refers to (budgetItemKey or '__overall__')
  key: string;
  label: string;
  level: BudgetAlertLevel;
  // Highest crossed threshold (e.g. 90) — 100+ means the budget is exceeded. For a
  // forecast-only alert (nothing crossed yet) it reads 100 and `thresholdCrossed` is false.
  threshold: number;
  // True when current spend crossed a configured threshold — the Avvisi tile lists only
  // these; a forecast-only alert belongs to «Categorie a rischio» instead.
  thresholdCrossed: boolean;
  spent: number;
  budgetAmount: number;
  usedRatio: number;
  // True when the end-of-month projection (not just current spend) crosses the budget
  forecastedOverrun: boolean;
  // Day of the month on which the running total first exceeded the budget (monthly
  // budgets and the ceiling); null while under, and for annual budgets.
  crossedOn: number | null;
}
