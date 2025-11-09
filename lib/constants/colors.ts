/**
 * Color palette for asset classes
 */
export const ASSET_CLASS_COLORS: Record<string, string> = {
  equity: '#3B82F6',      // blue
  bonds: '#EF4444',       // red
  crypto: '#F59E0B',      // amber
  realestate: '#10B981',  // green
  cash: '#6B7280',        // gray
  commodity: '#92400E',   // brown
};

/**
 * Chart colors for various visualizations
 */
export const CHART_COLORS = [
  '#3B82F6', // blue
  '#EF4444', // red
  '#10B981', // green
  '#F59E0B', // amber
  '#8B5CF6', // violet
  '#EC4899', // pink
  '#14B8A6', // teal
  '#F97316', // orange
  '#6366F1', // indigo
  '#84CC16', // lime
];

/**
 * Get color for a specific asset class
 * @param assetClass - The asset class
 * @returns Hex color code
 */
export function getAssetClassColor(assetClass: string): string {
  return ASSET_CLASS_COLORS[assetClass] || '#6B7280'; // default to gray
}

/**
 * Get color from chart colors array by index
 * @param index - The index
 * @returns Hex color code
 */
export function getChartColor(index: number): string {
  return CHART_COLORS[index % CHART_COLORS.length];
}
