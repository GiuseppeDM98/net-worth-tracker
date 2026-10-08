/**
 * Dividend yields for Rendimenti: Yield on Cost and current yield, per measured period.
 *
 * Pure. The engine is `computeDividendYieldMetrics` (lib/utils/yieldOnCost.ts, shared with the
 * Dividendi tab); this module shapes its answer into the twelve yield fields of
 * `PerformanceMetrics` and computes them for SEVERAL periods over ONE read of dividends, assets
 * and snapshots — what `POST /api/performance/yields` serves. Until 2026-10-04 two routes
 * (`/api/performance/yoc`, `/api/performance/current-yield`) each read the three collections once
 * per period: ten calls and thirty collection reads for a page that shows five periods.
 *
 * The yields are NOT part of `performance-cache`: they depend on the dividends registry and on
 * today's prices, which that cache's key does not cover (doc/guide/rendimenti.md).
 */

import type { MonthlySnapshot } from '@/types/assets';
import { deriveHoldingStartDates } from '@/lib/utils/snapshotAssetBreakdown';
import { computeDividendYieldMetrics, type AssetInput, type DividendInput } from '@/lib/utils/yieldOnCost';

/**
 * Calculate Yield on Cost (YOC) metrics for a period
 *
 * YOC measures annualized dividend yield based on original cost basis (not current market value).
 * This metric shows the return on your initial investment, making it useful for evaluating
 * dividend growth over time.
 *
 * ANNUALIZATION STRATEGY:
 * - Periods < 12 months: Scale up to annual rate (totalDividends / months × 12)
 * - Periods >= 12 months: Average annual dividends (totalDividends / years)
 * - This ensures comparability across different time periods
 *
 * FORMULA:
 * YOC% = (Projected Annual Dividends / Cost Basis) × 100
 *
 * Where:
 * - Projected Annual Dividends = annualized DPS × current quantity per asset
 * - Cost Basis = current quantity × averageCost for assets that paid dividends
 *
 * DPS-based projection is used instead of raw dividend totals to avoid a quantity mismatch:
 * if shares are bought AFTER a dividend is paid, raw totals inflate the cost basis without
 * a corresponding increase in dividends received, understating YOC.
 * Using DPS (from dividend records) projected onto current quantity gives forward-looking
 * YOC that is quantity-neutral per asset (annualizedDPS / averageCost cancels qty),
 * correctly reflecting yield on cost regardless of when additional shares were purchased.
 *
 * FILTERING (delegated to computeDividendYieldMetrics):
 * - Dividends filtered by payment date (when money actually received)
 * - endDate is CAPPED AT TODAY to exclude future dividends not yet received
 * - Only currently-held assets (quantity > 0, averageCost > 0) contribute: dividends from
 *   fully-sold positions are excluded from BOTH numerator and denominator, so they no longer
 *   inflate the reported yield
 * - Multi-currency: EUR DPS derived as (grossAmountEur ?? grossAmount) / div.quantity
 *
 * @param dividends - All user dividends (will be filtered by period internally)
 * @param assets - All user assets (for cost basis calculation)
 * @param startDate - Period start date (inclusive)
 * @param endDate - Period end date (inclusive, MUST be capped at today to exclude future dividends)
 * @param numberOfMonths - Duration in months (used for annualization)
 * @returns Object with YOC metrics or null values if insufficient data.
 *          yocDividendsGross/Net report dividends actually received from held assets (display).
 */
export function calculateYocMetrics(
  dividends: DividendInput[],
  assets: AssetInput[],
  startDate: Date,
  endDate: Date,
  numberOfMonths: number
): {
  yocGross: number | null;
  yocNet: number | null;
  yocDividendsGross: number;
  yocDividendsNet: number;
  yocCostBasis: number;
  yocAssetCount: number;
} {
  // Delegate to the shared, per-share YOC engine (single source of truth, also used by
  // the Dividendi tab). It excludes sold assets and uses current averageCost, so the
  // reported yield reflects the CURRENT portfolio (see lib/utils/yieldOnCost.ts).
  const metrics = computeDividendYieldMetrics(dividends, assets, startDate, endDate, numberOfMonths);

  return {
    yocGross: metrics.portfolioYocGross,
    yocNet: metrics.portfolioYocNet,
    // Dividends actually received in the window from currently-held assets (display only)
    yocDividendsGross: metrics.totalRealizedGross,
    yocDividendsNet: metrics.totalRealizedNet,
    yocCostBasis: metrics.totalCostBasis,
    yocAssetCount: metrics.assetCount,
  };
}

/**
 * Calculate Current Yield metrics for a period
 *
 * Current Yield measures annualized dividend yield based on current market value.
 * Unlike YOC (which uses original cost basis), Current Yield shows the yield
 * an investor would receive TODAY if purchasing the assets at current prices.
 *
 * ANNUALIZATION STRATEGY (same as YOC):
 * - Periods < 12 months: Scale up to annual rate (totalDividends / months × 12)
 * - Periods >= 12 months: Average annual dividends (totalDividends / years)
 * - This ensures comparability across different time periods
 *
 * FORMULA:
 * Current Yield% = (Annualized Dividends / Current Portfolio Value) × 100
 *
 * Where:
 * - Annualized Dividends = Dividends adjusted to annual rate
 * - Current Portfolio Value = Sum of (quantity × currentPrice) for dividend-paying assets
 *
 * FILTERING (consistent with YOC):
 * - Dividends filtered by payment date (when money actually received)
 * - endDate CAPPED AT TODAY to exclude future dividends
 * - Only assets with quantity > 0 that paid dividends in period
 * - Multi-currency dividends use EUR conversion if available
 *
 * COMPARISON WITH YOC:
 * - Current Yield > YOC: Price increased more than dividend growth
 * - Current Yield < YOC: Dividends grew or price decreased (good for long-term holders)
 * - Current Yield = YOC: Proportional growth in both price and dividends
 *
 * @param dividends - All user dividends (filtered by period internally)
 * @param assets - All user assets (for current price calculation)
 * @param startDate - Period start date (inclusive)
 * @param endDate - Period end date (inclusive, MUST be capped at today)
 * @param numberOfMonths - Duration in months (for annualization)
 * @returns Object with Current Yield metrics or null if insufficient data
 */
export function calculateCurrentYieldMetrics(
  dividends: DividendInput[],
  assets: AssetInput[],
  startDate: Date,
  endDate: Date,
  numberOfMonths: number
): {
  currentYield: number | null;
  currentYieldNet: number | null;
  currentYieldDividends: number;
  currentYieldDividendsNet: number;
  currentYieldPortfolioValue: number;
  currentYieldAssetCount: number;
} {
  // Delegate to the shared per-share engine (same source as YOC). Current Yield differs
  // from YOC only in the denominator: current market value instead of cost basis. Sold
  // assets are excluded, so the numerator can no longer count payouts whose value is
  // absent from the denominator (see lib/utils/yieldOnCost.ts).
  const metrics = computeDividendYieldMetrics(dividends, assets, startDate, endDate, numberOfMonths);

  return {
    currentYield: metrics.portfolioCurrentYieldGross,
    currentYieldNet: metrics.portfolioCurrentYieldNet,
    // Dividends actually received in the window from currently-held assets (display only)
    currentYieldDividends: metrics.totalRealizedGross,
    currentYieldDividendsNet: metrics.totalRealizedNet,
    currentYieldPortfolioValue: metrics.totalMarketValue,
    currentYieldAssetCount: metrics.assetCount,
  };
}

/** The twelve yield fields of `PerformanceMetrics`: YOC and current yield for one period. */
export type PerformanceYields = ReturnType<typeof calculateYocMetrics> & ReturnType<typeof calculateCurrentYieldMetrics>;

/** A period with nothing to measure: no rate, no dividends. */
export const EMPTY_PERFORMANCE_YIELDS: PerformanceYields = {
  yocGross: null,
  yocNet: null,
  yocDividendsGross: 0,
  yocDividendsNet: 0,
  yocCostBasis: 0,
  yocAssetCount: 0,
  currentYield: null,
  currentYieldNet: null,
  currentYieldDividends: 0,
  currentYieldDividendsNet: 0,
  currentYieldPortfolioValue: 0,
  currentYieldAssetCount: 0,
};

/** The dividend window of one measured period, as the performance metrics carry it. */
export interface PerformanceYieldPeriod {
  /** The caller's name for the period («ytd», «oneYear», «custom»): the key of its result. */
  key: string;
  /** First day measured (inclusive). */
  startDate: Date;
  /** Last day whose dividends count — the period's end CAPPED AT TODAY by the caller. */
  dividendEndDate: Date;
  /** Measured months, for the annualisation. */
  numberOfMonths: number;
}

/**
 * Tag each asset with the start of its CURRENT holding, so the engine ignores the dividends of a
 * previous, discontinuous one (an instrument sold and rebought keeps the same id).
 *
 * The start stamped at the (re)purchase wins; the snapshot-derived one covers the assets rebought
 * before `holdingStartDate` was recorded.
 */
function withHoldingStarts<T extends AssetInput>(assets: T[], snapshots: MonthlySnapshot[]): T[] {
  const holdingStarts = deriveHoldingStartDates(snapshots);
  return assets.map((asset) => ({ ...asset, holdingStartDate: asset.holdingStartDate ?? holdingStarts.get(asset.id) }));
}

/**
 * YOC and current yield for every period asked, over one set of dividends, assets and snapshots.
 *
 * @param input.dividends - Every dividend of the account (each period filters by payment date)
 * @param input.assets - Every asset of the account (cost basis and market value)
 * @param input.snapshots - Every snapshot of the account (the current holding's start)
 * @param input.periods - The periods to measure; a repeated key keeps its last period
 * @returns The yields of each period, by its key
 */
export function computeYieldsForPeriods(input: {
  dividends: DividendInput[];
  assets: AssetInput[];
  snapshots: MonthlySnapshot[];
  periods: PerformanceYieldPeriod[];
}): Record<string, PerformanceYields> {
  const assets = withHoldingStarts(input.assets, input.snapshots);
  const yieldsByKey: Record<string, PerformanceYields> = {};
  for (const period of input.periods) {
    yieldsByKey[period.key] = {
      ...calculateYocMetrics(input.dividends, assets, period.startDate, period.dividendEndDate, period.numberOfMonths),
      ...calculateCurrentYieldMetrics(input.dividends, assets, period.startDate, period.dividendEndDate, period.numberOfMonths),
    };
  }
  return yieldsByKey;
}
