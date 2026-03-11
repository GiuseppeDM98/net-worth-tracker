import { Timestamp } from 'firebase/firestore';
import { ExpenseType } from './expenses';

// Budget feature types
//
// Budget items target expense types, categories, or subcategories.
// Scope drives which fields are populated:
//   'type'        → expenseType only
//   'category'    → categoryId + categoryName
//   'subcategory' → categoryId + categoryName + subCategoryId + subCategoryName
//
// Income is intentionally excluded — budgets track spending limits only.

export type BudgetScope = 'type' | 'category' | 'subcategory';

export interface BudgetItem {
  id: string;
  scope: BudgetScope;
  // Populated only for scope='type' — excludes 'income'
  expenseType?: Exclude<ExpenseType, 'income'>;
  // Populated for scope='category' | 'subcategory'
  categoryId?: string;
  categoryName?: string; // denormalized fallback if category is deleted
  // Populated only for scope='subcategory'
  subCategoryId?: string;
  subCategoryName?: string; // denormalized fallback
  monthlyAmount: number; // positive EUR amount set by user
  // Sort order within the item's section (expense type group)
  order: number;
}

// Single document per user stored at budgets/{userId}
export interface BudgetConfig {
  userId: string;
  items: BudgetItem[];
  updatedAt: Timestamp;
}

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
  // currentYearTotal / (monthlyAmount * monthsElapsed) — for progress bar
  budgetUsedRatio: number;
}
