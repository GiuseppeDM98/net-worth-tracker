import { Timestamp } from 'firebase/firestore';

// Expense categories for cashflow tracking.
// These are mutually exclusive and determine UI filtering/display logic.
// - fixed: Regular fixed expenses (rent, subscriptions)
// - variable: Variable expenses (groceries, entertainment)
// - debt: Debt payments (loan installments, mortgages)
// - income: Income entries (salary, bonuses, gifts)
export type ExpenseType = 'fixed' | 'variable' | 'debt' | 'income';

export const EXPENSE_TYPE_LABELS: Record<ExpenseType, string> = {
  fixed: 'Spese Fisse',
  variable: 'Variabili',
  debt: 'Debiti',
  income: 'Entrate',
};

export interface ExpenseSubCategory {
  id: string;
  name: string;
}

export interface ExpenseCategory {
  id: string;
  userId: string;
  name: string;
  type: ExpenseType;
  color?: string;
  icon?: string;
  subCategories: ExpenseSubCategory[];
  createdAt: Date | Timestamp;
  updatedAt: Date | Timestamp;
}

export interface ExpenseCategoryFormData {
  name: string;
  type: ExpenseType;
  color?: string;
  icon?: string;
  subCategories?: ExpenseSubCategory[];
}

// Expense/Income record for cashflow tracking.
// Supports one-time, recurring, and installment (BNPL) payments.
export interface Expense {
  id: string;
  userId: string;
  type: ExpenseType;
  categoryId: string;
  // WARNING: categoryName and subCategoryName are denormalized for query performance.
  // When updating category/subcategory names, also update all expenses in that category via bulk update.
  categoryName: string; // Denormalized for faster queries
  subCategoryId?: string;
  subCategoryName?: string; // Denormalized for faster queries
  amount: number; // Sign convention: POSITIVE for income, NEGATIVE for expenses/debts
  currency: string;
  date: Date | Timestamp;
  notes?: string;
  link?: string; // Optional link (e.g., Amazon order, receipt, etc.)
  // Recurring payment configuration
  // If isRecurring=true, this expense repeats monthly on the specified day (1-31).
  // For months with fewer days (e.g., February with 28/29 days), the payment is scheduled on the last day of the month.
  isRecurring?: boolean; // For debts with monthly recurrence
  recurringDay?: number; // Day of month for recurring expenses (1-31)
  recurringParentId?: string; // Reference to parent recurring expense
  // Installment payment (BNPL - Buy Now Pay Later) tracking
  // Structure: one "parent" expense with N "child" expenses linked via installmentParentId.
  // - Parent: installmentParentId = undefined, amount = total purchase price
  // - Child: installmentParentId = parent.id, installmentNumber = 1..N, installmentTotal = N
  // Use installmentNumber/installmentTotal for UI display (e.g., "Payment 2 of 12")
  isInstallment?: boolean; // For installment payments (BNPL)
  installmentParentId?: string; // Reference to parent installment series
  installmentNumber?: number; // Current installment number (1, 2, 3...)
  installmentTotal?: number; // Total number of installments in series
  installmentTotalAmount?: number; // Total amount of the purchase (for analytics)
  createdAt: Date | Timestamp;
  updatedAt: Date | Timestamp;
}

export interface ExpenseFormData {
  type: ExpenseType;
  categoryId: string;
  subCategoryId?: string;
  amount: number;
  currency: string;
  date: Date;
  notes?: string;
  link?: string;
  isRecurring?: boolean;
  recurringDay?: number;
  recurringMonths?: number; // Number of months to create recurring expenses
  isInstallment?: boolean; // Enable installment payments
  installmentMode?: 'auto' | 'manual'; // Auto-calculate or manual amounts
  installmentCount?: number; // Number of installments (2-60)
  installmentTotalAmount?: number; // Total amount to divide (auto mode only)
  installmentAmounts?: number[]; // Individual amounts for each installment (manual mode)
  installmentStartDate?: Date; // Date of first installment
}

export interface MonthlyExpenseSummary {
  year: number;
  month: number;
  totalIncome: number;
  totalExpenses: number;
  netBalance: number;
  byCategory: {
    [categoryId: string]: {
      categoryName: string;
      total: number;
      count: number;
    };
  };
  byType: {
    [type in ExpenseType]: {
      total: number;
      count: number;
    };
  };
}

export interface ExpenseStats {
  currentMonth: {
    income: number;
    expenses: number;
    net: number;
  };
  previousMonth: {
    income: number;
    expenses: number;
    net: number;
  };
  delta: {
    income: number; // Percentage change
    expenses: number; // Percentage change
    net: number; // Percentage change
  };
}
