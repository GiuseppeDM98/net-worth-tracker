import { ASSET_CLASS_CHART_INDEX } from '@/lib/utils/allocationUtils';

/**
 * Color palette for asset classes
 */
const ASSET_CLASS_COLORS: Record<string, string> = {
  equity: '#3B82F6',      // blue
  bonds: '#EF4444',       // red
  crypto: '#F59E0B',      // amber
  realestate: '#10B981',  // green
  cash: '#6B7280',        // gray
  commodity: '#92400E',   // brown
  trendFollowing: '#8B5CF6', // violet
  carry: '#EC4899',       // pink
};

/**
 * Chart colors for various visualizations.
 *
 * This is now only the FALLBACK palette: `useChartColors()` resolves --chart-1..8 from
 * the active theme and pads just the last two slots from here. It still backs every
 * Recharts caller that cannot read a CSS variable, and the first paint before the hook's
 * rAF fires, so the contrast rule below still holds: these hues are also 4px identity
 * rails on a light card, and every one must clear the WCAG 1.4.11 3:1 floor against white
 * AND against the dark themes' cards — the ~0.12-0.30 relative-luminance band. Teal and
 * orange sit at their -600 steps for exactly this reason (3.74:1 and 3.56:1 vs white);
 * their -500 originals measured 2.49:1 and 2.80:1.
 */
export const CHART_COLORS = [
  '#3B82F6', // blue
  '#EF4444', // red
  '#10B981', // green
  '#F59E0B', // amber
  '#8B5CF6', // violet
  '#EC4899', // pink
  '#0D9488', // teal (teal-600)
  '#EA580C', // orange (orange-600)
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
 * Fixed mapping from asset class to CSS custom property (e.g. "--chart-1").
 * Use this for badge/chip styling so colours follow the active theme.
 * Recharts components must keep using getAssetClassColor (hex) since they
 * cannot consume CSS variables at render time.
 *
 * It is DERIVED from `ASSET_CLASS_CHART_INDEX`, the app's single source for a class's chart
 * slot, and not written by hand: the hand-written version had crypto on --chart-4 while the
 * charts painted it with slot 2 (= --chart-3), so the same class wore two hues on one screen,
 * and it stopped at six keys, which is why Trend Following and Carry were as grey as Liquidità.
 * `cash` keeps the neutral on purpose — liquidity is the absence of a position, not a series.
 */
const CASH_CSS_VAR = '--muted-foreground';

export function getAssetClassCssVar(assetClass: string): string {
  if (assetClass === 'cash') return CASH_CSS_VAR;
  const slot = ASSET_CLASS_CHART_INDEX[assetClass];
  return slot === undefined ? CASH_CSS_VAR : `--chart-${slot + 1}`;
}

/**
 * Get color from chart colors array by index
 * @param index - The index
 * @returns Hex color code
 */
export function getChartColor(index: number): string {
  return CHART_COLORS[index % CHART_COLORS.length];
}
