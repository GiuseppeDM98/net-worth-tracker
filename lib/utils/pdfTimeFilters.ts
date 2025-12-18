// lib/utils/pdfTimeFilters.ts
// Helper functions for PDF time filtering

import type { MonthlySnapshot } from '@/types/assets';
import type { SectionSelection, TimeFilter, TimeFilterValidation } from '@/types/pdf';

/**
 * Filter snapshots by time filter
 *
 * @param snapshots - Array of all snapshots
 * @param timeFilter - Filter type: 'total' | 'yearly' | 'monthly'
 * @returns Filtered snapshots array
 */
export function filterSnapshotsByTime(
  snapshots: MonthlySnapshot[],
  timeFilter: TimeFilter = 'total'
): MonthlySnapshot[] {
  if (timeFilter === 'total') {
    return snapshots;
  }

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1; // JavaScript 0-11 → 1-12

  if (timeFilter === 'yearly') {
    // From January 1st of current year to today
    return snapshots.filter(s => s.year === currentYear);
  }

  if (timeFilter === 'monthly') {
    // Only snapshots from current month
    return snapshots.filter(s =>
      s.year === currentYear && s.month === currentMonth
    );
  }

  return snapshots;
}

/**
 * Filter expenses by time filter
 *
 * @param expenses - Array of all expenses
 * @param timeFilter - Filter type: 'total' | 'yearly' | 'monthly'
 * @returns Filtered expenses array
 */
export function filterExpensesByTime(
  expenses: any[],
  timeFilter: TimeFilter = 'total'
): any[] {
  if (timeFilter === 'total') {
    return expenses;
  }

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1; // JavaScript 0-11 → 1-12

  return expenses.filter(expense => {
    // Handle both Date and Firestore Timestamp
    const date = expense.date instanceof Date
      ? expense.date
      : expense.date.toDate();

    const expenseYear = date.getFullYear();
    const expenseMonth = date.getMonth() + 1;

    if (timeFilter === 'yearly') {
      return expenseYear === currentYear;
    }

    if (timeFilter === 'monthly') {
      return expenseYear === currentYear && expenseMonth === currentMonth;
    }

    return true;
  });
}

/**
 * Validate available data for each time filter option
 *
 * @param snapshots - Array of all snapshots
 * @returns Validation object with availability flags
 */
export function validateTimeFilterData(
  snapshots: MonthlySnapshot[]
): TimeFilterValidation {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  const monthlySnapshots = filterSnapshotsByTime(snapshots, 'monthly');
  const yearlySnapshots = filterSnapshotsByTime(snapshots, 'yearly');

  return {
    hasMonthlyData: monthlySnapshots.length >= 1,
    hasYearlyData: yearlySnapshots.length >= 2,
    hasTotalData: snapshots.length >= 2,
    currentMonth,
    currentYear,
  };
}

/**
 * Adjust sections for time filter (disable FIRE for monthly)
 *
 * @param timeFilter - Selected time filter
 * @param currentSections - Current section selection
 * @returns Adjusted section selection
 */
export function adjustSectionsForTimeFilter(
  timeFilter: TimeFilter,
  currentSections: SectionSelection
): SectionSelection {
  if (timeFilter === 'monthly') {
    // Monthly: disable FIRE and history sections
    return {
      ...currentSections,
      fire: false,
      history: false,
    };
  }

  // Yearly and Total: all sections available
  return currentSections;
}

/**
 * Validate if PDF generation can proceed
 *
 * @param snapshots - Filtered snapshots for selected time period
 * @param sections - Selected sections
 * @param timeFilter - Selected time filter
 * @throws Error with descriptive message if validation fails
 * @returns true if valid
 */
export function validatePDFGeneration(
  snapshots: MonthlySnapshot[],
  sections: SectionSelection,
  timeFilter: TimeFilter
): boolean {
  // Get filter label for error messages
  const filterLabels: Record<TimeFilter, string> = {
    total: 'totale',
    yearly: 'annuale',
    monthly: 'mensile',
  };
  const filterLabel = filterLabels[timeFilter];

  // Validate history section requires at least 2 snapshots
  if (sections.history && snapshots.length < 2) {
    throw new Error(
      `Dati insufficienti per il periodo ${filterLabel}. ` +
      `Sono richiesti almeno 2 snapshot per la sezione Storico.`
    );
  }

  // Validate cashflow section requires at least 1 snapshot
  if (sections.cashflow && snapshots.length < 1) {
    throw new Error(
      `Nessuno snapshot disponibile per il periodo ${filterLabel}.`
    );
  }

  return true;
}

/**
 * Get tooltip text for disabled time filter options
 *
 * @param timeFilter - Time filter being checked
 * @param validation - Validation results
 * @returns Tooltip text or undefined if option is enabled
 */
export function getTimeFilterTooltip(
  timeFilter: TimeFilter,
  validation: TimeFilterValidation
): string | undefined {
  if (timeFilter === 'monthly' && !validation.hasMonthlyData) {
    return `Nessuno snapshot disponibile per ${validation.currentMonth}/${validation.currentYear}`;
  }

  if (timeFilter === 'yearly' && !validation.hasYearlyData) {
    return `Dati insufficienti per l'anno ${validation.currentYear} (minimo 2 snapshot)`;
  }

  return undefined;
}

/**
 * Get formatted label for time filter option
 *
 * @param timeFilter - Time filter type
 * @param validation - Validation results for dynamic year/month
 * @returns Formatted label
 */
export function getTimeFilterLabel(
  timeFilter: TimeFilter,
  validation: TimeFilterValidation
): string {
  switch (timeFilter) {
    case 'total':
      return 'Export Totale';
    case 'yearly':
      return `Export Annuale (${validation.currentYear})`;
    case 'monthly':
      return `Export Mensile (${validation.currentMonth}/${validation.currentYear})`;
    default:
      return 'Export Totale';
  }
}
