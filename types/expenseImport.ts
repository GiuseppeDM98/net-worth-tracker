// Types for the historical expense/income CSV import tool.
// The pure parse/validate/plan layer lives in lib/utils/expenseImport.ts;
// the Firestore commit/undo layer in lib/services/expenseImportService.ts.

import { ExpenseType } from '@/types/expenses';

// The importable subset of ExpenseType. `transfer` is intentionally excluded:
// a transfer needs origin/destination cash asset IDs to reconcile balances,
// which historical CSV rows cannot provide (it would be a net-zero inert row).
export type ImportableExpenseType = Exclude<ExpenseType, 'transfer'>;

/**
 * A single raw CSV row after header normalization (IT/EN aliases → canonical keys),
 * before any validation or type coercion. All values are trimmed strings.
 * `line` is the 1-based source line number (excluding the header) for error reporting.
 */
export interface RawRow {
  line: number;
  data: string;
  importo: string;
  tipo: string;
  categoria: string;
  sottocategoria: string;
  note: string;
  valuta: string;
}

/**
 * A fully validated row ready to be written as an Expense document.
 * `amount` is the positive magnitude; the sign is applied at commit time
 * from `type` (expenses negative, income positive).
 */
export interface PlannedExpenseRow {
  line: number;
  date: Date;
  amount: number; // positive magnitude
  type: ImportableExpenseType;
  categoryName: string;
  /**
   * Firestore id of the EXISTING category this row attaches to, resolved by the
   * plan on (name, type) — oldest document wins when two share both. Undefined
   * when the category is in `categoriesToCreate`: the commit resolves it from
   * the id returned by createCategory.
   */
  categoryId?: string;
  subCategoryName?: string;
  notes?: string;
  currency: string;
}

/** A row that failed validation (or was intentionally skipped, e.g. transfer). */
export interface RowError {
  line: number;
  reason: string;
  raw?: Partial<RawRow>;
}

/**
 * A category that does not yet exist for the user and must be created before
 * the expenses referencing it can be written. `subCategories` are the new
 * subcategory names required by the imported rows.
 */
export interface CategoryToCreate {
  name: string;
  type: ImportableExpenseType;
  subCategories: string[];
}

/**
 * New subcategories to add to an already-existing category.
 * `categoryId` is the existing category's Firestore ID.
 */
export interface SubCategoryToCreate {
  categoryId: string;
  categoryName: string;
  subCategoryNames: string[];
}

/** Human-facing summary shown in the preview step before committing. */
export interface ImportSummary {
  validCount: number;
  skippedCount: number;
  newCategoriesCount: number;
  totalIncome: number;
  totalExpense: number; // positive magnitude of all expense rows
  dateFrom?: Date;
  dateTo?: Date;
}

/**
 * A non-blocking disclosure the preview must surface before commit: the plan made
 * a deterministic choice the user should see (e.g. two same-named same-typed
 * categories exist and the rows will attach to the oldest one).
 */
export interface ImportNotice {
  categoryName: string;
  type: ImportableExpenseType;
  /** How many existing categories share this (name, type) identity. */
  duplicateCount: number;
  /** Ready-to-render Italian sentence. */
  message: string;
}

/**
 * The complete plan produced by buildImportPlan: what will be written, what
 * categories/subcategories will be created, and what was rejected — all before
 * touching Firestore.
 */
export interface ImportPlan {
  validRows: PlannedExpenseRow[];
  errors: RowError[];
  categoriesToCreate: CategoryToCreate[];
  subCategoriesToCreate: SubCategoryToCreate[];
  notices: ImportNotice[];
  summary: ImportSummary;
}
