import { Asset, PieChartData, MonthlySnapshot } from '@/types/assets';
import { calculateAssetValue, calculateTotalValue } from './assetService';
import { getAssetClassColor, getChartColor } from '@/lib/constants/colors';

/**
 * Prepare data for asset class distribution pie chart
 */
export function prepareAssetClassDistributionData(
  assets: Asset[]
): PieChartData[] {
  const totalValue = calculateTotalValue(assets);

  if (totalValue === 0) {
    return [];
  }

  // Aggregate by asset class
  const byAssetClass = new Map<string, number>();

  assets.forEach((asset) => {
    const value = calculateAssetValue(asset);
    const current = byAssetClass.get(asset.assetClass) || 0;
    byAssetClass.set(asset.assetClass, current + value);
  });

  // Convert to chart data format
  const chartData: PieChartData[] = [];

  byAssetClass.forEach((value, assetClass) => {
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
    name: `${asset.name} (${asset.ticker})`,
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
  month: number;
  year: number;
}[] {
  return snapshots.map((snapshot) => ({
    date: `${String(snapshot.month).padStart(2, '0')}/${snapshot.year}`,
    totalNetWorth: snapshot.totalNetWorth,
    liquidNetWorth: snapshot.liquidNetWorth,
    month: snapshot.month,
    year: snapshot.year,
  }));
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
