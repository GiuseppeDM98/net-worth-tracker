import { format } from 'date-fns';
import { it } from 'date-fns/locale';
import type { Asset, MonthlySnapshot } from '@/types/assets';

/**
 * Price data for a single month in the history table
 */
export interface MonthPriceCell {
  price: number | null; // Null if asset didn't exist in that month
  colorCode: 'green' | 'red' | 'neutral';
  change?: number; // Percentage change vs previous month
}

/**
 * Asset row in the price history table
 */
export interface AssetPriceHistoryRow {
  assetId: string;
  ticker: string;
  name: string;
  isDeleted: boolean; // True if asset not in current portfolio
  months: {
    [monthKey: string]: MonthPriceCell; // monthKey: "2025-1", "2025-2", etc.
  };
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
 * 1. Filter snapshots by year (if specified)
 * 2. Build month columns (chronological order)
 * 3. Collect all unique assets (current + deleted from snapshots)
 * 4. For each asset, build price history row with color coding
 * 5. Sort assets alphabetically by ticker
 *
 * @param snapshots - All user snapshots from Firestore
 * @param currentAssets - Current assets in portfolio
 * @param filterYear - Optional year filter (undefined = show all years)
 * @returns Transformed table data ready for rendering
 */
export function transformPriceHistoryData(
  snapshots: MonthlySnapshot[],
  currentAssets: Asset[],
  filterYear?: number
): PriceHistoryTableData {
  // Step 1: Filter snapshots by year if specified
  const filteredSnapshots = filterYear
    ? snapshots.filter((s) => s.year === filterYear)
    : snapshots;

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

  // Step 3: Collect all unique assets (current + deleted from snapshots)
  const allAssetIds = new Set<string>();
  const assetMetadata = new Map<
    string,
    { ticker: string; name: string; isDeleted: boolean }
  >();

  // Add current assets
  currentAssets.forEach((asset) => {
    allAssetIds.add(asset.id);
    assetMetadata.set(asset.id, {
      ticker: asset.ticker,
      name: asset.name,
      isDeleted: false,
    });
  });

  // Add historical assets (deleted from portfolio but in snapshots)
  filteredSnapshots.forEach((snapshot) => {
    snapshot.byAsset.forEach((snapshotAsset) => {
      if (!allAssetIds.has(snapshotAsset.assetId)) {
        allAssetIds.add(snapshotAsset.assetId);
        assetMetadata.set(snapshotAsset.assetId, {
          ticker: snapshotAsset.ticker,
          name: snapshotAsset.name,
          isDeleted: true, // Not in current portfolio
        });
      }
    });
  });

  // Step 4: Build price history rows
  const assetRows: AssetPriceHistoryRow[] = [];

  allAssetIds.forEach((assetId) => {
    const metadata = assetMetadata.get(assetId)!;
    const months: { [monthKey: string]: MonthPriceCell } = {};
    let previousPrice: number | null = null; // Track for color coding

    monthColumns.forEach((monthCol) => {
      // Find snapshot for this month
      const snapshot = sortedSnapshots.find(
        (s) => s.year === monthCol.year && s.month === monthCol.month
      );

      // Find asset in snapshot.byAsset
      const snapshotAsset = snapshot?.byAsset.find(
        (a) => a.assetId === assetId
      );

      if (!snapshotAsset) {
        // Asset didn't exist in this month
        months[monthCol.key] = {
          price: null,
          colorCode: 'neutral',
        };
        previousPrice = null; // Reset comparison chain
      } else {
        const currentPrice = snapshotAsset.price;
        const colorCode = calculateColorCode(currentPrice, previousPrice);

        // Calculate percentage change
        const change =
          previousPrice !== null
            ? ((currentPrice - previousPrice) / previousPrice) * 100
            : undefined;

        months[monthCol.key] = {
          price: currentPrice,
          colorCode,
          change,
        };

        previousPrice = currentPrice;
      }
    });

    assetRows.push({
      assetId,
      ticker: metadata.ticker,
      name: metadata.name,
      isDeleted: metadata.isDeleted,
      months,
    });
  });

  // Step 5: Sort assets alphabetically by ticker (Italian locale)
  assetRows.sort((a, b) => a.ticker.localeCompare(b.ticker, 'it'));

  return {
    assets: assetRows,
    monthColumns,
  };
}
