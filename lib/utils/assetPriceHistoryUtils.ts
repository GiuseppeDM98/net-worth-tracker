import { format } from 'date-fns';
import { it } from 'date-fns/locale';
import type {
  Asset,
  MonthlySnapshot,
  AssetHistoryDisplayMode,
  AssetHistoryDateFilter,
  AssetHistoryTotalRow
} from '@/types/assets';

/**
 * Data for a single month in the history table
 * Renamed from MonthPriceCell to support both price and totalValue display
 */
export interface MonthDataCell {
  price: number | null; // Null if asset didn't exist in that month
  totalValue: number | null; // Total value (quantity × price), null if asset didn't exist
  colorCode: 'green' | 'red' | 'neutral';
  change?: number; // Percentage change vs previous month
}

/**
 * Asset row in the price history table
 */
export interface AssetPriceHistoryRow {
  name: string; // Primary key for aggregation (replaces assetId to unify re-acquired assets)
  ticker: string;
  isDeleted: boolean; // True if asset not in current portfolio
  months: {
    [monthKey: string]: MonthDataCell; // monthKey: "2025-1", "2025-2", etc.
  };
  ytd?: number; // Year-to-date percentage change (first month → last month of current year)
  fromStart?: number; // Percentage change from first available month → last available month
}

/**
 * Transformed data for the entire price history table
 */
export interface PriceHistoryTableData {
  assets: AssetPriceHistoryRow[];
  monthColumns: {
    key: string; // "2025-1"
    label: string; // "Gen 2025"
    year: number;
    month: number;
  }[];
  totalRow?: AssetHistoryTotalRow; // Optional total row for totalValue display mode
}

/**
 * Calculate color code based on month-over-month price comparison
 *
 * @param currentPrice - Current month price
 * @param previousPrice - Previous month price (null if no previous month)
 * @returns Color code for the cell
 */
function calculateColorCode(
  currentPrice: number,
  previousPrice: number | null
): 'green' | 'red' | 'neutral' {
  // No previous month to compare (first month for asset)
  if (previousPrice === null) {
    return 'neutral';
  }

  // Price increased
  if (currentPrice > previousPrice) {
    return 'green';
  }

  // Price decreased
  if (currentPrice < previousPrice) {
    return 'red';
  }

  // Price unchanged
  return 'neutral';
}

/**
 * Format month label for column headers in Italian
 *
 * @param year - Year number (e.g., 2025)
 * @param month - Month number (1-12)
 * @returns Formatted month label (e.g., "Gen 2025")
 */
function formatMonthLabel(year: number, month: number): string {
  // Create date object (day doesn't matter, we only format month+year)
  const date = new Date(year, month - 1, 1);

  // Format: "Gen 2025", "Feb 2025", etc. (abbreviated month + year)
  return format(date, 'MMM yyyy', { locale: it });
}

/**
 * Get current year
 *
 * @returns Current year as number
 */
export function getCurrentYear(): number {
  return new Date().getFullYear();
}

/**
 * Transform snapshots into price history table data
 *
 * Algorithm:
 * 1. Filter snapshots by year or start date (if specified)
 * 2. Build month columns (chronological order)
 * 3. Collect all unique assets (current + deleted from snapshots)
 * 4. For each asset, build price/value history row with color coding
 * 5. Calculate total row if displayMode is 'totalValue'
 * 6. Sort assets alphabetically by ticker
 *
 * @param snapshots - All user snapshots from Firestore
 * @param currentAssets - Current assets in portfolio
 * @param filterYear - Optional year filter (undefined = show all years)
 * @param filterStartDate - Optional start date filter (overrides filterYear if provided)
 * @param displayMode - Display mode: 'price' or 'totalValue' (default: 'price')
 * @returns Transformed table data ready for rendering
 */
export function transformPriceHistoryData(
  snapshots: MonthlySnapshot[],
  currentAssets: Asset[],
  filterYear?: number,
  filterStartDate?: AssetHistoryDateFilter,
  displayMode: AssetHistoryDisplayMode = 'price'
): PriceHistoryTableData {
  // Step 1: Filter snapshots by start date or year if specified
  const filteredSnapshots = snapshots.filter((snapshot) => {
    // filterStartDate takes precedence over filterYear
    if (filterStartDate) {
      const snapshotYear = snapshot.year;
      const snapshotMonth = snapshot.month;

      if (snapshotYear < filterStartDate.year) return false;
      if (snapshotYear === filterStartDate.year && snapshotMonth < filterStartDate.month) return false;
      return true;
    }

    // Existing year filter
    if (filterYear) {
      return snapshot.year === filterYear;
    }

    return true;
  });

  // Step 2: Build month columns (chronological order)
  // Sort snapshots by year, then month
  const sortedSnapshots = [...filteredSnapshots].sort((a, b) => {
    if (a.year !== b.year) return a.year - b.year;
    return a.month - b.month;
  });

  const monthColumns = sortedSnapshots.map((s) => ({
    key: `${s.year}-${s.month}`,
    label: formatMonthLabel(s.year, s.month),
    year: s.year,
    month: s.month,
  }));

  // Step 3: Collect all unique assets by name (aggregate re-acquired assets)
  // Use name as key to unify assets that were sold and re-purchased
  const assetMetadata = new Map<
    string,
    { ticker: string; name: string; isDeleted: boolean }
  >();

  // Add current assets (group by name)
  currentAssets.forEach((asset) => {
    // Use name as key - if multiple assets with same name exist, use latest ticker
    assetMetadata.set(asset.name, {
      ticker: asset.ticker,
      name: asset.name,
      isDeleted: false,
    });
  });

  // Add historical assets from snapshots (only if not already in current portfolio)
  filteredSnapshots.forEach((snapshot) => {
    snapshot.byAsset.forEach((snapshotAsset) => {
      // Check if asset with this name is already tracked
      const existingMetadata = assetMetadata.get(snapshotAsset.name);

      if (!existingMetadata) {
        // New asset name not in current portfolio - add as deleted
        assetMetadata.set(snapshotAsset.name, {
          ticker: snapshotAsset.ticker,
          name: snapshotAsset.name,
          isDeleted: true, // Not in current portfolio
        });
      } else if (existingMetadata.isDeleted) {
        // If we already marked it as deleted but find it in a snapshot,
        // keep it deleted (prefer current portfolio status)
        // But update ticker if current one is missing
        if (!existingMetadata.ticker && snapshotAsset.ticker) {
          existingMetadata.ticker = snapshotAsset.ticker;
        }
      }
    });
  });

  // Step 4: Build price/value history rows (grouped by asset name)
  const assetRows: AssetPriceHistoryRow[] = [];

  assetMetadata.forEach((metadata, assetName) => {
    const months: { [monthKey: string]: MonthDataCell } = {};
    let previousPrice: number | null = null; // Track for color coding
    let previousTotalValue: number | null = null; // Track for color coding

    monthColumns.forEach((monthCol) => {
      // Find snapshot for this month
      const snapshot = sortedSnapshots.find(
        (s) => s.year === monthCol.year && s.month === monthCol.month
      );

      // Find asset in snapshot.byAsset by name (aggregate all instances with same name)
      const snapshotAsset = snapshot?.byAsset.find(
        (a) => a.name === assetName
      );

      if (!snapshotAsset) {
        // Asset didn't exist in this month
        months[monthCol.key] = {
          price: null,
          totalValue: null,
          colorCode: 'neutral',
        };
        previousPrice = null; // Reset comparison chain
        previousTotalValue = null;
      } else {
        const currentPrice = snapshotAsset.price;
        // Fallback: calculate totalValue if missing in snapshot (for old data)
        const currentTotalValue = snapshotAsset.totalValue ?? (snapshotAsset.price * snapshotAsset.quantity);

        // Determine which value to use for color coding based on displayMode OR price=1 condition
        // Use totalValue if displayMode is 'totalValue' OR if price === 1 (cash/liquidity assets)
        const shouldUseTotalValue = displayMode === 'totalValue' || currentPrice === 1;
        const currentValue = shouldUseTotalValue ? currentTotalValue : currentPrice;
        const previousValue = shouldUseTotalValue ? previousTotalValue : previousPrice;

        const colorCode = calculateColorCode(currentValue, previousValue);

        // Calculate percentage change based on same logic (aligned with YTD/fromStart)
        const change =
          previousValue !== null
            ? ((currentValue - previousValue) / previousValue) * 100
            : undefined;

        months[monthCol.key] = {
          price: currentPrice,
          totalValue: currentTotalValue,
          colorCode,
          change,
        };

        previousPrice = currentPrice;
        previousTotalValue = currentTotalValue;
      }
    });

    // Calculate YTD and fromStart percentage changes
    let ytd: number | undefined;
    let fromStart: number | undefined;

    // Get all month entries in chronological order
    const sortedMonthEntries = monthColumns
      .map((col) => ({
        key: col.key,
        year: col.year,
        month: col.month,
        cell: months[col.key],
      }))
      .filter((entry) => entry.cell.price !== null || entry.cell.totalValue !== null);

    if (sortedMonthEntries.length >= 2) {
      // Determine which value to use (price or totalValue)
      const getValue = (cell: MonthDataCell) => {
        // Use totalValue if displayMode is 'totalValue' or if price === 1 (cash/liquidity)
        if (displayMode === 'totalValue' || cell.price === 1) {
          return cell.totalValue;
        }
        return cell.price;
      };

      // Calculate YTD (year-to-date): first month → last month of current year
      const currentYear = new Date().getFullYear();
      const currentYearEntries = sortedMonthEntries.filter((e) => e.year === currentYear);

      if (currentYearEntries.length >= 2) {
        const firstEntry = currentYearEntries[0];
        const lastEntry = currentYearEntries[currentYearEntries.length - 1];

        const firstValue = getValue(firstEntry.cell);
        const lastValue = getValue(lastEntry.cell);

        if (firstValue !== null && lastValue !== null && firstValue !== 0) {
          ytd = ((lastValue - firstValue) / firstValue) * 100;
        }
      }

      // Calculate fromStart: first available month → last available month
      const firstEntry = sortedMonthEntries[0];
      const lastEntry = sortedMonthEntries[sortedMonthEntries.length - 1];

      const firstValue = getValue(firstEntry.cell);
      const lastValue = getValue(lastEntry.cell);

      if (firstValue !== null && lastValue !== null && firstValue !== 0) {
        fromStart = ((lastValue - firstValue) / firstValue) * 100;
      }
    }

    assetRows.push({
      name: metadata.name, // Use name as primary key (aggregates re-acquired assets)
      ticker: metadata.ticker,
      isDeleted: metadata.isDeleted,
      months,
      ytd,
      fromStart,
    });
  });

  // Step 5: Sort assets alphabetically by ticker (Italian locale)
  assetRows.sort((a, b) => a.ticker.localeCompare(b.ticker, 'it'));

  // Step 6: Calculate total row only for totalValue mode
  let totalRow: AssetHistoryTotalRow | undefined;
  if (displayMode === 'totalValue') {
    const totals: { [monthKey: string]: number } = {};
    const monthlyChanges: { [monthKey: string]: number | undefined } = {};
    let previousMonthTotal: number | null = null;

    // First pass: Calculate monthly totals
    // Calculate monthly totals by summing all assets with data in that month.
    // Sold assets (isDeleted: true) have values for months when held and null
    // for months after sale, so they naturally contribute to historical totals
    // and are excluded from future months without needing explicit filtering.
    monthColumns.forEach((monthCol) => {
      let monthTotal = 0;

      assetRows.forEach((assetRow) => {
        const cell = assetRow.months[monthCol.key];
        if (cell?.totalValue !== null && cell?.totalValue !== undefined) {
          monthTotal += cell.totalValue;
        }
      });

      totals[monthCol.key] = monthTotal;
    });

    // Second pass: Calculate month-over-month percentages
    monthColumns.forEach((monthCol) => {
      const currentTotal = totals[monthCol.key];

      if (previousMonthTotal === null) {
        // First month: no percentage
        monthlyChanges[monthCol.key] = undefined;
      } else if (previousMonthTotal === 0) {
        // Avoid division by zero
        monthlyChanges[monthCol.key] = undefined;
      } else {
        // Calculate percentage change
        monthlyChanges[monthCol.key] =
          ((currentTotal - previousMonthTotal) / previousMonthTotal) * 100;
      }

      previousMonthTotal = currentTotal;
    });

    // Calculate YTD percentage
    let ytd: number | undefined = undefined;
    const currentYear = new Date().getFullYear();
    const currentYearMonths = monthColumns.filter(col => col.year === currentYear);

    if (currentYearMonths.length >= 2) {
      const firstMonthKey = currentYearMonths[0].key;
      const lastMonthKey = currentYearMonths[currentYearMonths.length - 1].key;
      const firstTotal = totals[firstMonthKey];
      const lastTotal = totals[lastMonthKey];

      if (firstTotal > 0) {  // Avoid division by zero
        ytd = ((lastTotal - firstTotal) / firstTotal) * 100;
      }
    }

    // Calculate From Start percentage
    let fromStart: number | undefined = undefined;

    if (monthColumns.length >= 2) {
      const firstMonthKey = monthColumns[0].key;
      const lastMonthKey = monthColumns[monthColumns.length - 1].key;
      const firstTotal = totals[firstMonthKey];
      const lastTotal = totals[lastMonthKey];

      if (firstTotal > 0) {  // Avoid division by zero
        fromStart = ((lastTotal - firstTotal) / firstTotal) * 100;
      }
    }

    totalRow = {
      monthColumns: monthColumns.map(col => col.label),
      totals,
      monthlyChanges,
      ytd,
      fromStart,
    };
  }

  return {
    assets: assetRows,
    monthColumns,
    totalRow,
  };
}
