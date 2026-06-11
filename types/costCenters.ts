// A cost center groups expenses under a named object or project (e.g. "Automobile Dacia").
// Expenses opt-in by setting costCenterId + costCenterName (denormalized).
// The feature is gated behind userPreferences.costCentersEnabled.
export interface CostCenter {
  id: string;
  userId: string;
  name: string;
  description?: string;
  // Hex color for visual distinction in list and charts.
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

// The period axis driving the Panoramica hero, per-center figures and ranking.
// Mirrors the period vocabulary used elsewhere in Cashflow/Analisi.
export type CostCenterPeriod = 'month' | 'year' | 'rolling12' | 'all';

// Lifecycle status derived at read time from the last activity + archivedAt.
export type CostCenterLifecycle = 'active' | 'dormant' | 'archived';

// Per-center figures computed for the selected period (pure layer output).
export interface CostCenterPeriodStats {
  totalSpent: number;       // Always positive for display
  transactionCount: number;
  averageMonthly: number;   // totalSpent / calendar months in the period window
  firstActivityDate: Date | null;
  lastActivityDate: Date | null;
}

// Projected full-year cost from the year-to-date pace (B2).
export interface CostCenterAnnualForecast {
  spentYtd: number;
  projectedTotal: number;
  // 0..1 — how far through the year we are (drives the "early year, low confidence" copy).
  yearProgress: number;
}

// Budget verdict for a center with a ceiling set (B1).
export interface CostCenterBudgetVerdict {
  spent: number;
  budgetAmount: number;
  budgetPeriod: CostCenterBudgetPeriod;
  ratio: number;            // spent / budgetAmount (can exceed 1)
  remaining: number;        // budgetAmount - spent (can be negative)
  status: 'ok' | 'warning' | 'over';
}

// One slice of the per-category composition breakdown (A4).
export interface CostCenterCategorySlice {
  categoryName: string;
  total: number;            // Always positive
  pct: number;              // 0..1 share of the center total
  transactionCount: number;
}

// Fixed (recurring/installment) vs one-off split (A4).
export interface CostCenterRecurringSplit {
  recurring: number;        // isRecurring || isInstallment
  oneOff: number;
  recurringPct: number;     // 0..1
}

// One bucket of the stacked-by-category monthly series (A4 chart).
// `byCategory` keys are the top categories; the rest collapse into "Altro".
export interface CostCenterMonthlyBucket {
  label: string;            // e.g. "Gen 25"
  year: number;
  month: number;            // 1-based
  total: number;
  byCategory: Record<string, number>;
}

export interface CostCenterMonthlySeries {
  buckets: CostCenterMonthlyBucket[];
  categories: string[];     // ordered category keys present across buckets (for stacked bars)
}

// One bucket of the cross-center comparison series (B3).
// `byCenter` keys are center ids.
export interface CostCenterComparisonBucket {
  label: string;
  year: number;
  month: number;
  byCenter: Record<string, number>;
}

export interface CostCenterComparisonSeries {
  buckets: CostCenterComparisonBucket[];
  centers: { id: string; name: string; color?: string }[];
}

// Aggregated stats computed client-side from the associated expenses.
export interface CostCenterStats {
  totalSpent: number;       // Sum of all expense amounts (always positive for display)
  transactionCount: number;
  averageMonthly: number;   // totalSpent / number of active months
  firstExpenseDate: Date | null;
  lastExpenseDate: Date | null;
}

// Monthly data point for the bar chart (one bar per calendar month).
export interface CostCenterMonthlyData {
  label: string;  // e.g. "Gen 25"
  year: number;
  month: number;  // 1-based
  total: number;  // Always positive for display
}

// Palette for the color picker in CostCenterDialog.
// WARNING: If you add or change a color here, also update COLOR_LABELS in CostCenterDialog.tsx
// (those labels are what screen readers announce — hex values are unpronounceable).
export const COST_CENTER_COLORS = [
  '#3b82f6', // blue
  '#10b981', // emerald
  '#f59e0b', // amber
  '#ef4444', // red
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#84cc16', // lime
] as const;

export type CostCenterColor = typeof COST_CENTER_COLORS[number];
