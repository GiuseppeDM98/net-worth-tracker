// A cost center groups expenses under a named object or project (e.g. "Automobile Dacia").
// Expenses opt-in by setting costCenterId + costCenterName (denormalized).
// The feature is gated behind userPreferences.costCentersEnabled.
export interface CostCenter {
  id: string;
  userId: string;
  name: string;
  description?: string;
  // Identity colour for list rows and chart series, persisted as a palette SLOT KEY
  // ('chart-1'…'chart-8'); pre-migration documents still hold a raw hex. Both are resolved
  // against the active theme by resolveCostCenterColor() — never paint this value directly.
  color?: string;
  // Optional spending ceiling. When set, the detail/list show a budget verdict and
  // the projected annual cost is compared against it. `budgetAmount` is interpreted
  // per `budgetPeriod` (a monthly ceiling vs a whole-year ceiling).
  budgetAmount?: number;
  budgetPeriod?: CostCenterBudgetPeriod;
  // Lifecycle: when set, the center is archived (closed) and hidden from the active list.
  // A center with no spending for DORMANT_THRESHOLD_DAYS is "dormant" but NOT archived —
  // dormancy is derived at read time, archival is an explicit user action stored here.
  archivedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export type CostCenterBudgetPeriod = 'monthly' | 'annual';

export interface CostCenterFormData {
  name: string;
  description?: string;
  color?: string;
  budgetAmount?: number;
  budgetPeriod?: CostCenterBudgetPeriod;
}

// Lifecycle status derived at read time from the last activity + archivedAt.
export type CostCenterLifecycle = 'active' | 'dormant' | 'archived';

// One slice of the per-category composition breakdown (A4).
export interface CostCenterCategorySlice {
  key: string;              // categoryId (name-fallback for legacy rows), or "Altro" for the tail slice
  categoryName: string;     // display label; carries a type qualifier when two keys share a name
  total: number;            // Always positive
  pct: number;              // 0..1 share of the center total
  transactionCount: number;
}

// One slice of the per-subcategory breakdown in the center detail.
export interface CostCenterSubCategorySlice {
  key: string;              // subCategoryId, or a sentinel for expenses without a subcategory
  subCategoryName: string;  // display name ("Senza sottocategoria" fallback)
  categoryName: string;     // parent category, for disambiguation across categories
  total: number;            // Always positive
  transactionCount: number;
}

// Fixed (recurring/installment) vs one-off split (A4).
export interface CostCenterRecurringSplit {
  recurring: number;        // isRecurring || isInstallment
  oneOff: number;
  recurringPct: number;     // 0..1
}

// The picker's palette lives in lib/utils/costCenterColors.ts, because a center's colour is
// now a theme slot resolved at render time rather than a stored hex — see that module's header
// for why, and for how legacy hex documents keep their identity without a backfill.
