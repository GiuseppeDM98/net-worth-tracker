// lib/utils/pdfTimeFilters.ts
// Helper functions for PDF time filtering

import type { MonthlySnapshot } from '@/types/assets';
import type { SectionSelection, TimeFilter, TimeFilterValidation } from '@/types/pdf';

/**
 * Filter snapshots by time filter.
 *
 * Optional year/month allow exporting past periods (not just current).
 * Falls back to current date when not specified, preserving backwards compatibility.
 *
 * @param snapshots - Array of all snapshots
 * @param timeFilter - Filter type: 'total' | 'yearly' | 'monthly'
 * @param year - Target year (defaults to current year)
 * @param month - Target month 1-12 (defaults to current month)
 * @returns Filtered snapshots array
 */
export function filterSnapshotsByTime(
  snapshots: MonthlySnapshot[],
  timeFilter: TimeFilter = 'total',
  year?: number,
  month?: number
): MonthlySnapshot[] {
  if (timeFilter === 'total') {
    return snapshots;
  }

  const now = new Date();
  const targetYear = year ?? now.getFullYear();
  const targetMonth = month ?? (now.getMonth() + 1);

  if (timeFilter === 'yearly') {
    return snapshots.filter(s => s.year === targetYear);
  }

  if (timeFilter === 'monthly') {
    return snapshots.filter(s =>
      s.year === targetYear && s.month === targetMonth
    );
  }

  return snapshots;
}

/**
 * Filter expenses by time filter.
 *
 * Optional year/month allow exporting past periods.
 * Falls back to current date when not specified.
 *
 * @param expenses - Array of all expenses
 * @param timeFilter - Filter type: 'total' | 'yearly' | 'monthly'
 * @param year - Target year (defaults to current year)
 * @param month - Target month 1-12 (defaults to current month)
 * @returns Filtered expenses array
 */
export function filterExpensesByTime(
  expenses: any[],
  timeFilter: TimeFilter = 'total',
  year?: number,
  month?: number
): any[] {
  if (timeFilter === 'total') {
    return expenses;
  }

  const now = new Date();
  const targetYear = year ?? now.getFullYear();
  const targetMonth = month ?? (now.getMonth() + 1);

  return expenses.filter(expense => {
    // Handle both Date and Firestore Timestamp
    const date = expense.date instanceof Date
      ? expense.date
      : expense.date.toDate();

    const expenseYear = date.getFullYear();
    const expenseMonth = date.getMonth() + 1;

    if (timeFilter === 'yearly') {
      return expenseYear === targetYear;
    }

    if (timeFilter === 'monthly') {
      return expenseYear === targetYear && expenseMonth === targetMonth;
    }

    return true;
  });
}

/**
 * Validate available data for each time filter option.
 *
 * Checks ALL available years/months (not just current) so users can export
 * past periods even if the current period has no data yet.
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

  // Check if any year has enough data for yearly export (>=2 snapshots)
  const snapshotsByYear = new Map<number, number>();
  for (const s of snapshots) {
    snapshotsByYear.set(s.year, (snapshotsByYear.get(s.year) ?? 0) + 1);
  }
  const hasYearlyData = Array.from(snapshotsByYear.values()).some(count => count >= 2);

  return {
    hasMonthlyData: snapshots.length >= 1,
    hasYearlyData,
    hasTotalData: snapshots.length >= 2,
    currentMonth,
    currentYear,
  };
}

/**
 * Adjust sections for time filter and period selection.
 *
 * Disabling rules:
 * - Monthly: only Cashflow available (all others disabled)
 * - Past yearly: Portfolio/Allocation/Summary disabled (no historical asset-level data)
 * - Current yearly / Total: all sections available
 *
 * @param timeFilter - Selected time filter
 * @param currentSections - Current section selection
 * @param isPastPeriod - True when exporting a past year or any monthly period
 * @returns Adjusted section selection
 */
export function adjustSectionsForTimeFilter(
  timeFilter: TimeFilter,
  currentSections: SectionSelection,
  isPastPeriod?: boolean
): SectionSelection {
  if (timeFilter === 'monthly') {
    // Monthly: only Cashflow is meaningful for a single month
    return {
      ...currentSections,
      fire: false,
      history: false,
      performance: false,
      portfolio: false,
      allocation: false,
      summary: false,
    };
  }

  // Past yearly: disable sections that need current asset-level data.
  // FIRE also disabled: it uses current net worth and unfiltered expenses,
  // so it would show identical data regardless of selected year.
  if (isPastPeriod) {
    return {
      ...currentSections,
      portfolio: false,
      allocation: false,
      summary: false,
      fire: false,
    };
  }

  // Current yearly and Total: all sections available
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
    return 'Nessuno snapshot disponibile per export mensile';
  }

  if (timeFilter === 'yearly' && !validation.hasYearlyData) {
    return 'Dati insufficienti per export annuale (minimo 2 snapshot in un anno)';
  }

  return undefined;
}

/**
 * Get formatted label for time filter option.
 *
 * Accepts optional selectedYear/selectedMonth to display the user's chosen
 * period instead of the current date.
 *
 * @param timeFilter - Time filter type
 * @param validation - Validation results for dynamic year/month
 * @param selectedYear - User-selected year (defaults to current)
 * @param selectedMonth - User-selected month (defaults to current)
 * @returns Formatted label
 */
export function getTimeFilterLabel(
  timeFilter: TimeFilter,
  validation: TimeFilterValidation,
  selectedYear?: number,
  selectedMonth?: number
): string {
  switch (timeFilter) {
    case 'total':
      return 'Export Totale';
    case 'yearly':
      return `Export Annuale (${selectedYear ?? validation.currentYear})`;
    case 'monthly': {
      const m = selectedMonth ?? validation.currentMonth;
      const y = selectedYear ?? validation.currentYear;
      return `Export Mensile (${m}/${y})`;
    }
    default:
      return 'Export Totale';
  }
}
