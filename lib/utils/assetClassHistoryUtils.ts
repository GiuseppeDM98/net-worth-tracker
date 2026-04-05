import { format } from 'date-fns';
import { it } from 'date-fns/locale';
import type {
  MonthlySnapshot,
  AssetHistoryTransformOptions,
  AssetHistoryTotalRow,
} from '@/types/assets';
import { ASSET_CLASS_ORDER } from '@/lib/services/assetService';
import { ASSET_CLASS_COLORS } from '@/lib/constants/colors';

/**
 * Data for a single month in the asset class history table
 */
export interface AssetClassMonthCell {
  value: number | null; // EUR total for this class this month; null if class had no data
  colorCode: 'green' | 'red' | 'neutral';
  change?: number; // Month-over-month percentage change
}

/**
 * One row per asset class in the history table
 */
export interface AssetClassHistoryRow {
  assetClass: string;  // Internal key: 'equity', 'bonds', etc.
  label: string;       // Italian display label
  color: string;       // Hex color from ASSET_CLASS_COLORS
  months: { [monthKey: string]: AssetClassMonthCell };
  ytd?: number;
  fromStart?: number;
  lastMonthChange?: number;
}

/**
 * Transformed data for the entire asset class history table
 */
export interface AssetClassHistoryTableData {
  rows: AssetClassHistoryRow[];
  monthColumns: {
    key: string;   // "2025-1"
    label: string; // "Gen 2025"
    year: number;
    month: number;
  }[];
  totalRow?: AssetHistoryTotalRow;
}

// Italian labels for each asset class
const ASSET_CLASS_LABELS: Record<string, string> = {
  equity: 'Azioni',
  bonds: 'Obbligazioni',
  crypto: 'Crypto',
  realestate: 'Immobili',
  cash: 'Liquidità',
  commodity: 'Materie Prime',
};

/**
 * Format month label for column headers in Italian
 */
function formatMonthLabel(year: number, month: number): string {
  const date = new Date(year, month - 1, 1);
  return format(date, 'MMM yyyy', { locale: it });
}

/**
 * Calculate color code based on month-over-month value comparison
 */
function calculateColorCode(
  current: number,
  previous: number | null
): 'green' | 'red' | 'neutral' {
  if (previous === null) return 'neutral';
  if (current > previous) return 'green';
  if (current < previous) return 'red';
  return 'neutral';
}

/**
 * Transform snapshots into asset class history table data.
 *
 * Algorithm:
 * 1. Filter snapshots by year or start date
 * 2. Build month columns in chronological order
 * 3. Determine which asset classes appear in the data (using ASSET_CLASS_ORDER for sort)
 * 4. For each class, build monthly value cells from snapshot.byAssetClass with MoM color coding
 * 5. Calculate YTD / fromStart / lastMonthChange per row
 * 6. Build total row (sum of all classes per month)
 *
 * @param snapshots - All user monthly snapshots from Firestore
 * @param filterYear - Restrict to a specific calendar year (shows YTD + Mese Prec. % columns)
 * @param filterStartDate - Restrict to months from this date onwards (shows From Start % column)
 * @returns Table data ready for rendering
 */
export function transformAssetClassHistoryData(
  snapshots: MonthlySnapshot[],
  options: AssetHistoryTransformOptions = {}
): AssetClassHistoryTableData {
  const {
    filterYear,
    filterStartDate,
    includePreviousMonthBaseline = false,
    excludeCash = false,
  } = options;

  const matchesFilter = (snapshot: MonthlySnapshot) => {
    if (filterStartDate) {
      if (snapshot.year < filterStartDate.year) return false;
      if (snapshot.year === filterStartDate.year && snapshot.month < filterStartDate.month) return false;
      return true;
    }
    if (filterYear) {
      return snapshot.year === filterYear;
    }
    return true;
  };

  // Step 1: Filter snapshots by the visible range
  const visibleSnapshots = snapshots.filter(matchesFilter);

  // Step 2: Sort chronologically and optionally prepend one hidden baseline month
  const sortedVisibleSnapshots = [...visibleSnapshots].sort((a, b) => {
    if (a.year !== b.year) return a.year - b.year;
    return a.month - b.month;
  });

  const firstVisibleSnapshot = sortedVisibleSnapshots[0];
  let baselineSnapshot: MonthlySnapshot | undefined;

  if (includePreviousMonthBaseline && firstVisibleSnapshot) {
    const baselineDate = new Date(firstVisibleSnapshot.year, firstVisibleSnapshot.month - 2, 1);
    baselineSnapshot = snapshots.find(
      (snapshot) =>
        snapshot.year === baselineDate.getFullYear() &&
        snapshot.month === baselineDate.getMonth() + 1
    );
  }

  const calculationSnapshots = baselineSnapshot
    ? [baselineSnapshot, ...sortedVisibleSnapshots]
    : sortedVisibleSnapshots;

  const monthColumns = sortedVisibleSnapshots.map((s) => ({
    key: `${s.year}-${s.month}`,
    label: formatMonthLabel(s.year, s.month),
    year: s.year,
    month: s.month,
  }));

  if (monthColumns.length === 0) {
    return { rows: [], monthColumns, totalRow: undefined };
  }

  // Step 3: Collect all asset classes that appear in at least one snapshot.
  // Sort by ASSET_CLASS_ORDER for consistent display (equity first, crypto last).
  const classSet = new Set<string>();
  calculationSnapshots.forEach((snapshot) => {
    Object.keys(snapshot.byAssetClass || {}).forEach((cls) => {
      if (excludeCash && cls === 'cash') return;
      if ((snapshot.byAssetClass[cls] ?? 0) > 0) classSet.add(cls);
    });
  });

  const assetClasses = Array.from(classSet).sort((a, b) => {
    const orderA = ASSET_CLASS_ORDER[a] ?? 999;
    const orderB = ASSET_CLASS_ORDER[b] ?? 999;
    return orderA - orderB;
  });

  // Step 4: Build one row per asset class
  const rows: AssetClassHistoryRow[] = assetClasses.map((assetClass) => {
    const months: { [monthKey: string]: AssetClassMonthCell } = {};
    let previousValue: number | null = null;

    calculationSnapshots.forEach((snapshot) => {
      const monthKey = `${snapshot.year}-${snapshot.month}`;
      const isVisibleMonth = monthColumns.some((column) => column.key === monthKey);
      const rawValue = snapshot.byAssetClass?.[assetClass];
      // Treat missing or zero as null so cells display "—" when class was absent
      const value = rawValue != null && rawValue > 0 ? rawValue : null;

      const colorCode = value !== null ? calculateColorCode(value, previousValue) : 'neutral';
      const change =
        value !== null && previousValue !== null && previousValue !== 0
          ? ((value - previousValue) / previousValue) * 100
          : undefined;

      if (isVisibleMonth) {
        months[monthKey] = { value, colorCode, change };
      }
      // Only advance the comparison chain when we have real data
      if (value !== null) previousValue = value;
      else previousValue = null; // Reset chain on gap
    });

    // Calculate YTD (first → last month of current year)
    let ytd: number | undefined;
    const currentYear = new Date().getFullYear();
    const currentYearCols = monthColumns.filter((c) => c.year === currentYear);
    const currentYearNonNull = currentYearCols.filter((c) => months[c.key].value !== null);
    if (currentYearNonNull.length >= 2) {
      const first = months[currentYearNonNull[0].key].value!;
      const last = months[currentYearNonNull[currentYearNonNull.length - 1].key].value!;
      if (first !== 0) ytd = ((last - first) / first) * 100;
    } else if (includePreviousMonthBaseline && currentYearNonNull.length === 1) {
      // When only one visible month exists, YTD should mirror that month's
      // change vs the hidden baseline (e.g. January vs previous December).
      ytd = months[currentYearNonNull[0].key].change;
    }

    // Calculate fromStart (first available month → last available month)
    let fromStart: number | undefined;
    const nonNullCols = monthColumns.filter((c) => months[c.key].value !== null);
    if (nonNullCols.length >= 2) {
      const first = months[nonNullCols[0].key].value!;
      const last = months[nonNullCols[nonNullCols.length - 1].key].value!;
      if (first !== 0) fromStart = ((last - first) / first) * 100;
    }

    // lastMonthChange: reuse the pre-computed change on the last non-null cell
    let lastMonthChange: number | undefined;
    if (nonNullCols.length >= 1) {
      lastMonthChange = months[nonNullCols[nonNullCols.length - 1].key].change;
    }

    return {
      assetClass,
      label: ASSET_CLASS_LABELS[assetClass] ?? assetClass,
      color: ASSET_CLASS_COLORS[assetClass] ?? '#6B7280',
      months,
      ytd,
      fromStart,
      lastMonthChange,
    };
  });

  // Step 5: Build total row (sum all classes per month, same logic as AssetHistoryTotalRow)
  const totals: { [monthKey: string]: number } = {};
  const monthlyChanges: { [monthKey: string]: number | undefined } = {};
  const baselineTotal =
    baselineSnapshot
      ? Object.entries(baselineSnapshot.byAssetClass || {}).reduce((sum, [assetClass, value]) => {
          if (excludeCash && assetClass === 'cash') {
            return sum;
          }
          return sum + (value || 0);
        }, 0)
      : null;
  let previousMonthTotal: number | null =
    includePreviousMonthBaseline && baselineSnapshot ? baselineTotal : null;

  // First pass: calculate per-month totals across all classes
  monthColumns.forEach((monthCol) => {
    let monthTotal = 0;
    rows.forEach((row) => {
      const cell = row.months[monthCol.key];
      if (cell?.value !== null && cell?.value !== undefined) {
        monthTotal += cell.value;
      }
    });
    totals[monthCol.key] = monthTotal;
  });

  // Second pass: calculate month-over-month percentages for total row
  monthColumns.forEach((monthCol) => {
    const current = totals[monthCol.key];
    if (previousMonthTotal === null || previousMonthTotal === 0) {
      monthlyChanges[monthCol.key] = undefined;
    } else {
      monthlyChanges[monthCol.key] = ((current - previousMonthTotal) / previousMonthTotal) * 100;
    }
    previousMonthTotal = current;
  });

  // YTD for total row
  let totalYtd: number | undefined;
  const currentYear = new Date().getFullYear();
  const totalCurrentYearCols = monthColumns.filter((c) => c.year === currentYear);
  if (totalCurrentYearCols.length >= 2) {
    const first = totals[totalCurrentYearCols[0].key];
    const last = totals[totalCurrentYearCols[totalCurrentYearCols.length - 1].key];
    if (first > 0) totalYtd = ((last - first) / first) * 100;
  } else if (includePreviousMonthBaseline && totalCurrentYearCols.length === 1) {
    totalYtd = monthlyChanges[totalCurrentYearCols[0].key];
  }

  // fromStart for total row
  let totalFromStart: number | undefined;
  if (monthColumns.length >= 2) {
    const first = totals[monthColumns[0].key];
    const last = totals[monthColumns[monthColumns.length - 1].key];
    if (first > 0) totalFromStart = ((last - first) / first) * 100;
  }

  // lastMonthChange for total row
  let totalLastMonthChange: number | undefined;
  if (monthColumns.length >= 2) {
    totalLastMonthChange = monthlyChanges[monthColumns[monthColumns.length - 1].key];
  } else if (includePreviousMonthBaseline && monthColumns.length === 1) {
    totalLastMonthChange = monthlyChanges[monthColumns[0].key];
  }

  const totalRow: AssetHistoryTotalRow = {
    monthColumns: monthColumns.map((c) => c.label),
    totals,
    monthlyChanges,
    ytd: totalYtd,
    fromStart: totalFromStart,
    lastMonthChange: totalLastMonthChange,
  };

  return { rows, monthColumns, totalRow };
}
