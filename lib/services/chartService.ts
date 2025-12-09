import { Asset, PieChartData, MonthlySnapshot } from '@/types/assets';
import { calculateAssetValue, calculateTotalValue } from './assetService';
import { calculateCurrentAllocation } from './assetAllocationService';
import { getAssetClassColor, getChartColor } from '@/lib/constants/colors';

/**
 * Prepare data for asset class distribution pie chart
 *
 * Uses calculateCurrentAllocation to properly handle composite assets
 * (e.g., pension funds distributed across multiple asset classes).
 *
 * @param assets - All user assets
 * @returns Array of pie chart data points with percentages and colors
 */
export function prepareAssetClassDistributionData(
  assets: Asset[]
): PieChartData[] {
  const allocation = calculateCurrentAllocation(assets);
  const totalValue = allocation.totalValue;

  if (totalValue === 0) {
    return [];
  }

  // Convert to chart data format
  const chartData: PieChartData[] = [];

  Object.entries(allocation.byAssetClass).forEach(([assetClass, value]) => {
    const percentage = (value / totalValue) * 100;
    chartData.push({
      name: getAssetClassName(assetClass),
      value,
      percentage,
      color: getAssetClassColor(assetClass),
    });
  });

  // Sort by value descending
  return chartData.sort((a, b) => b.value - a.value);
}

/**
 * Prepare data for individual asset distribution pie chart
 */
export function prepareAssetDistributionData(assets: Asset[]): PieChartData[] {
  const totalValue = calculateTotalValue(assets);

  if (totalValue === 0) {
    return [];
  }

  // Calculate value for each asset
  const assetValues = assets.map((asset) => ({
    name: asset.name,
    ticker: asset.ticker,
    value: calculateAssetValue(asset),
  }));

  // Sort by value descending
  assetValues.sort((a, b) => b.value - a.value);

  // Take top 10 and aggregate the rest as "Others"
  const top10 = assetValues.slice(0, 10);
  const others = assetValues.slice(10);

  const chartData: PieChartData[] = top10.map((asset, index) => ({
    name: asset.ticker,
    value: asset.value,
    percentage: (asset.value / totalValue) * 100,
    color: getChartColor(index),
  }));

  // Add "Others" if there are more than 10 assets
  if (others.length > 0) {
    const othersValue = others.reduce((sum, asset) => sum + asset.value, 0);
    chartData.push({
      name: 'Altri',
      value: othersValue,
      percentage: (othersValue / totalValue) * 100,
      color: '#9CA3AF', // gray
    });
  }

  return chartData;
}

/**
 * Prepare data for net worth history line chart
 */
export function prepareNetWorthHistoryData(snapshots: MonthlySnapshot[]): {
  date: string;
  totalNetWorth: number;
  liquidNetWorth: number;
  illiquidNetWorth: number;
  month: number;
  year: number;
  note?: string;
}[] {
  return snapshots.map((snapshot) => ({
    date: `${String(snapshot.month).padStart(2, '0')}/${String(snapshot.year).slice(-2)}`,
    totalNetWorth: snapshot.totalNetWorth,
    liquidNetWorth: snapshot.liquidNetWorth,
    illiquidNetWorth: snapshot.illiquidNetWorth || 0, // Default to 0 for backward compatibility with older snapshots
    month: snapshot.month,
    year: snapshot.year,
    note: snapshot.note,
  }));
}

/**
 * Prepare data for asset class history chart
 */
export function prepareAssetClassHistoryData(snapshots: MonthlySnapshot[]): {
  date: string;
  equity: number;
  bonds: number;
  crypto: number;
  realestate: number;
  cash: number;
  commodity: number;
  equityPercentage: number;
  bondsPercentage: number;
  cryptoPercentage: number;
  realestatePercentage: number;
  cashPercentage: number;
  commodityPercentage: number;
  month: number;
  year: number;
}[] {
  return snapshots.map((snapshot) => {
    const total = snapshot.totalNetWorth;
    const byAssetClass = snapshot.byAssetClass || {};

    const equity = byAssetClass.equity || 0;
    const bonds = byAssetClass.bonds || 0;
    const crypto = byAssetClass.crypto || 0;
    const realestate = byAssetClass.realestate || 0;
    const cash = byAssetClass.cash || 0;
    const commodity = byAssetClass.commodity || 0;

    return {
      date: `${String(snapshot.month).padStart(2, '0')}/${String(snapshot.year).slice(-2)}`,
      equity,
      bonds,
      crypto,
      realestate,
      cash,
      commodity,
      equityPercentage: total > 0 ? (equity / total) * 100 : 0,
      bondsPercentage: total > 0 ? (bonds / total) * 100 : 0,
      cryptoPercentage: total > 0 ? (crypto / total) * 100 : 0,
      realestatePercentage: total > 0 ? (realestate / total) * 100 : 0,
      cashPercentage: total > 0 ? (cash / total) * 100 : 0,
      commodityPercentage: total > 0 ? (commodity / total) * 100 : 0,
      month: snapshot.month,
      year: snapshot.year,
    };
  });
}

/**
 * Get Italian name for asset class
 */
function getAssetClassName(assetClass: string): string {
  const names: Record<string, string> = {
    equity: 'Azioni',
    bonds: 'Obbligazioni',
    crypto: 'Criptovalute',
    realestate: 'Immobili',
    cash: 'Liquidità',
    commodity: 'Materie Prime',
  };

  return names[assetClass] || assetClass;
}

/**
 * Format currency value in Italian format
 */
export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('it-IT', {
    style: 'currency',
    currency: 'EUR',
  }).format(value);
}

/**
 * Format percentage in Italian format
 */
export function formatPercentage(value: number, decimals: number = 2): string {
  return new Intl.NumberFormat('it-IT', {
    style: 'percent',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value / 100);
}

/**
 * Format number in Italian format
 */
export function formatNumber(value: number, decimals: number = 2): string {
  return new Intl.NumberFormat('it-IT', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

/**
 * Format currency value in compact format for chart axes
 * Examples: €1,5 Mln, €850k, €250
 */
export function formatCurrencyCompact(value: number): string {
  const absValue = Math.abs(value);

  if (absValue >= 1_000_000) {
    // Millions: €1,5 Mln
    const millions = value / 1_000_000;
    return `€${millions.toLocaleString('it-IT', {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1
    })} Mln`;
  } else if (absValue >= 1_000) {
    // Thousands: €850k
    const thousands = value / 1_000;
    return `€${Math.round(thousands)}k`;
  } else {
    // Below 1000: €250
    return `€${Math.round(value)}`;
  }
}

/**
 * Prepare data for YoY (Year over Year) variation chart
 * Compares first snapshot of each year with last snapshot of the same year
 */
export function prepareYoYVariationData(snapshots: MonthlySnapshot[]): {
  year: string;
  variation: number;
  variationPercentage: number;
  startValue: number;
  endValue: number;
}[] {
  if (snapshots.length === 0) {
    return [];
  }

  // Group snapshots by year
  const snapshotsByYear = new Map<number, MonthlySnapshot[]>();

  snapshots.forEach((snapshot) => {
    if (!snapshotsByYear.has(snapshot.year)) {
      snapshotsByYear.set(snapshot.year, []);
    }
    snapshotsByYear.get(snapshot.year)!.push(snapshot);
  });

  // Calculate YoY variation for each year
  const yoyData: {
    year: string;
    variation: number;
    variationPercentage: number;
    startValue: number;
    endValue: number;
  }[] = [];

  Array.from(snapshotsByYear.entries())
    .sort((a, b) => a[0] - b[0]) // Sort by year
    .forEach(([year, yearSnapshots]) => {
      // Sort snapshots by month to get first and last
      yearSnapshots.sort((a, b) => a.month - b.month);

      const firstSnapshot = yearSnapshots[0];
      const lastSnapshot = yearSnapshots[yearSnapshots.length - 1];

      const startValue = firstSnapshot.totalNetWorth;
      const endValue = lastSnapshot.totalNetWorth;
      const variation = endValue - startValue;
      const variationPercentage = startValue > 0 ? (variation / startValue) * 100 : 0;

      yoyData.push({
        year: year.toString(),
        variation,
        variationPercentage,
        startValue,
        endValue,
      });
    });

  return yoyData;
}
