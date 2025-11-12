import { Asset, PieChartData, MonthlySnapshot } from '@/types/assets';
import { calculateAssetValue, calculateTotalValue } from './assetService';
import { calculateCurrentAllocation } from './assetAllocationService';
import { getAssetClassColor, getChartColor } from '@/lib/constants/colors';

/**
 * Prepare data for asset class distribution pie chart
 * Usa calculateCurrentAllocation per gestire correttamente gli asset composti
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
}[] {
  return snapshots.map((snapshot) => ({
    date: `${String(snapshot.month).padStart(2, '0')}/${snapshot.year}`,
    totalNetWorth: snapshot.totalNetWorth,
    liquidNetWorth: snapshot.liquidNetWorth,
    illiquidNetWorth: snapshot.illiquidNetWorth || 0, // default 0 per retrocompatibilità
    month: snapshot.month,
    year: snapshot.year,
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
      date: `${String(snapshot.month).padStart(2, '0')}/${snapshot.year}`,
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
