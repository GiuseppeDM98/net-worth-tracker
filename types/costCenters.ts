import { Timestamp } from 'firebase/firestore';

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
  createdAt: Date | Timestamp;
  updatedAt: Date | Timestamp;
}

export interface CostCenterFormData {
  name: string;
  description?: string;
  color?: string;
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
// WARNING: If you add colors here, also update the color label map in CostCenterDialog.tsx.
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
