import { doc, getDoc, setDoc, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { MonthlySnapshot } from '@/types/assets';
import { Expense } from '@/types/expenses';
import {
  PerformanceMetrics,
  CashFlowData,
  TimePeriod,
  PerformanceData,
  RollingPeriodPerformance,
  PerformanceChartData,
  MonthlyReturnHeatmapData,
  PeriodMonth,
  UnderwaterDrawdownData,
  PerformanceCacheDocument,
  FirestorePerformanceData,
  FirestorePerformanceMetrics,
  FirestoreCashFlowData,
  FirestoreRollingPeriodPerformance,
} from '@/types/performance';
import { getExpensesByDateRange } from './expenseService';
import { getUserSnapshots } from './snapshotService';
import { getSettings } from './assetAllocationService';
import { getAllAssets } from './assetService';
import { buildCashFlowMap, monthKey, monthKeyOf } from '@/lib/utils/cashFlowMap';
import { buildPortfolioCashFlows } from '@/lib/utils/portfolioFlows';
import { getAssetTransactions } from '@/lib/services/assetTransactionService';
import { endOfMonthBound } from '@/lib/utils/dateHelpers';
import { computeDividendYieldMetrics } from '@/lib/utils/yieldOnCost';
import { buildTwrIndex, computeDrawdownSeries, findMaxDrawdown } from '@/lib/utils/drawdownSeries';
import {
  resolvePerformanceBaseOptions,
  resolvePerformanceExclusions,
  toPerformanceBaseSnapshots,
  type PerformanceBaseOptions,
} from '@/lib/utils/performanceBase';

const PERFORMANCE_CACHE_COLLECTION = 'performance-cache';

/**
 * Version token of the cached MATH, prefixed to every cache key.
 *
 * The rest of the key fingerprints the inputs; this covers the one thing no input signature can see —
 * a change to the formulas themselves, which rewrites the numbers while snapshots and settings stay
 * byte-identical. Without a bump the user keeps reading pre-fix figures until the 6h TTL expires.
 *
 * WARNING (checklist comment): bump on ANY change that alters what the pipeline computes from
 * unchanged inputs, and only then. History: v2 = baseline data-driven + first-month cash flows +
 * TWR annualization; v3 = rolling windows; v4 = IRR signs and timeline; v5 = volatility without
 * the ±50% filter, and its 3-observation floor; v6 = i flussi seguono la base nei periodi fissi;
 * v7 = i flussi seguono la base anche nelle finestre rolling, e un CAGR non misurabile smette di
 * essere letto come 0.
 */
const CACHE_MATH_VERSION = 'v7';

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Format month and year to MM/YY format (e.g., "04/25")
 * @param year - Full year (e.g., 2025)
 * @param month - Month (1-12)
 */
function formatMonthYear(year: number, month: number): string {
  const monthStr = String(month).padStart(2, '0');
  const yearStr = String(year).slice(-2);  // Last 2 digits
  return `${monthStr}/${yearStr}`;
}

/**
 * Format a period from start to end (or "Presente" if ongoing)
 * @param startYear - Start year
 * @param startMonth - Start month (1-12)
 * @param endYear - End year (null if ongoing)
 * @param endMonth - End month (1-12, null if ongoing)
 */
function formatPeriod(
  startYear: number,
  startMonth: number,
  endYear: number | null,
  endMonth: number | null
): string {
  const start = formatMonthYear(startYear, startMonth);

  if (endYear === null || endMonth === null) {
    return `${start} - Presente`;
  }

  const end = formatMonthYear(endYear, endMonth);
  return `${start} - ${end}`;
}

/**
 * Calculate ROI for a period
 * Formula: ((End NW - Start NW - Net Cash Flows) / Start NW) * 100
 *
 * @param startNW - Starting net worth
 * @param endNW - Ending net worth
 * @param netCashFlow - Total net cash flow (income - expenses)
 * @returns ROI percentage or null if calculation impossible
 */
export function calculateROI(
  startNW: number,
  endNW: number,
  netCashFlow: number
): number | null {
  // `<= 0`, non `=== 0`: un capitale iniziale nullo O NEGATIVO non ha un rendimento percentuale.
  // Diventa raggiungibile con una storia lunga — un mese interamente liquidato, o saldi netti
  // negativi (crediti/debiti) — e un denominatore negativo non fallisce: ribalta il segno in
  // silenzio, che e' il modo peggiore di sbagliare.
  if (startNW <= 0) return null;

  const gain = endNW - startNW - netCashFlow;
  return (gain / startNW) * 100;
}

/**
 * Calculate CAGR (Compound Annual Growth Rate)
 * Formula: ((End NW / (Start NW + Net Cash Flows))^(1/Years) - 1) * 100
 *
 * This version adjusts for cash flows by adding them to the starting value.
 *
 * @param startNW - Starting net worth
 * @param endNW - Ending net worth
 * @param netCashFlow - Total net cash flow
 * @param numberOfMonths - Duration in months
 * @returns CAGR percentage or null if calculation impossible
 */
export function calculateCAGR(
  startNW: number,
  endNW: number,
  netCashFlow: number,
  numberOfMonths: number
): number | null {
  if (numberOfMonths < 1) return null;

  const adjustedStartValue = startNW + netCashFlow;
  if (adjustedStartValue <= 0) return null;

  const years = numberOfMonths / 12;
  const cagr = (Math.pow(endNW / adjustedStartValue, 1 / years) - 1) * 100;

  return isFinite(cagr) ? cagr : null;
}

/**
 * Calculate Time-Weighted Return (TWR)
 *
 * TWR eliminates the effect of cash flows by calculating returns for each sub-period
 * and geometrically linking them. This is the preferred metric for comparing
 * investment performance.
 *
 * Algorithm:
 * 1. For each month, calculate: R = (End NW - Cash Flow) / Start NW - 1
 * 2. Link returns: TWR = [(1 + R1) × (1 + R2) × ... × (1 + Rn)] - 1
 *
 * @param snapshots - Monthly snapshots for the period (sorted chronologically)
 * @param cashFlows - Monthly cash flows
 * @param periodMonths - Number of months the returns span, for annualization. Pass it whenever the
 *   caller already knows the period (it also survives gaps in the snapshot series); omitted, it is
 *   derived from the first and last snapshot, counting from the END of the first month.
 * @returns Annualized TWR percentage or null if insufficient data
 */
export function calculateTimeWeightedReturn(
  snapshots: MonthlySnapshot[],
  cashFlows: CashFlowData[],
  periodMonths?: number
): number | null {
  if (snapshots.length < 2) return null;

  const cashFlowMap = buildCashFlowMap(cashFlows);

  let linkedReturn = 1.0;

  for (let i = 1; i < snapshots.length; i++) {
    const prevSnapshot = snapshots[i - 1];
    const currSnapshot = snapshots[i];

    const startNW = prevSnapshot.totalNetWorth;
    const endNW = currSnapshot.totalNetWorth;

    // Get cash flow for current month
    const cashFlow = cashFlowMap.get(monthKey(currSnapshot.year, currSnapshot.month)) || 0;

    // Calculate sub-period return: (End NW - Cash Flow) / Start NW - 1
    // Vedi la nota su `<= 0` in calculateROI: nullo o negativo, non c'e' rendimento da misurare.
    if (startNW <= 0) continue;
    const periodReturn = ((endNW - cashFlow) / startNW) - 1;

    // Link returns geometrically
    linkedReturn *= (1 + periodReturn);
  }

  // Annualize over the span the linked returns actually cover: from the END of the first snapshot's
  // month (its value is the starting valuation, not a return) to the end of the last one. The
  // inclusive month count minus that first month — with n monthly snapshots and no gaps, n − 1,
  // matching the n − 1 sub-periods linked above. Counting it inclusively (as this branch used to)
  // annualizes n − 1 returns over n months and understates the result.
  let totalMonths: number;
  if (periodMonths !== undefined) {
    totalMonths = periodMonths;
  } else {
    const firstSnap = snapshots[0];
    const lastSnap = snapshots[snapshots.length - 1];
    const periodStart = new Date(firstSnap.year, firstSnap.month - 1, 1);
    const periodEnd = endOfMonthBound(lastSnap.year, lastSnap.month);
    totalMonths = monthsElapsed(periodStart, periodEnd);
  }
  if (totalMonths <= 0) return null;

  const years = totalMonths / 12;
  const annualizedTWR = (Math.pow(linkedReturn, 1 / years) - 1) * 100;

  return isFinite(annualizedTWR) ? annualizedTWR : null;
}

/** One dated amount of the investor's cash flow stream, in months from the start of the period. */
interface DatedFlow {
  amount: number;
  monthsFromStart: number;
}

/** Lowest rate the solver explores: −99,99%, i.e. everything lost bar a rounding crumb. */
const IRR_MIN_RATE = -0.9999;
/** Highest rate the solver explores: +100000% a year. Beyond this the answer is not a return. */
const IRR_MAX_RATE = 1000;

/** Net present value of the stream at a given annual rate. */
function computeNpv(flows: DatedFlow[], rate: number): number {
  return flows.reduce(
    (npv, flow) => npv + flow.amount * Math.pow(1 + rate, -flow.monthsFromStart / 12),
    0
  );
}

/**
 * Bracketed fallback: halve an interval that is known to contain a root until it collapses onto it.
 *
 * Teacher note — bisection cannot diverge, which is exactly what Newton-Raphson can do: Newton
 * follows the tangent, and on a curve as steep as an NPV near −100% a single step can jump past the
 * root and never come back. The price is speed (one bit of precision per iteration), irrelevant for
 * a handful of flows. It needs the root bracketed first: NPV must have OPPOSITE signs at the two
 * ends, which for a normal portfolio stream it does — money in first, value out at the end, so NPV
 * falls monotonically from a large positive at the floor rate to a negative at the ceiling.
 *
 * @returns The rate where NPV crosses zero, or null when the bracket holds no crossing (no rate can
 *   explain this stream — e.g. contributions that exceed the final value at every discount rate)
 */
function solveIrrByBisection(flows: DatedFlow[]): number | null {
  let low = IRR_MIN_RATE;
  let high = IRR_MAX_RATE;
  const npvLow = computeNpv(flows, low);
  const npvHigh = computeNpv(flows, high);

  if (!isFinite(npvLow) || !isFinite(npvHigh)) return null;
  if (npvLow === 0) return low;
  if (npvHigh === 0) return high;
  if (npvLow > 0 === npvHigh > 0) return null; // same sign at both ends: no crossing to find

  const lowIsPositive = npvLow > 0;
  // 200 halvings take the interval below any float precision this ever needs.
  for (let i = 0; i < 200; i++) {
    const mid = (low + high) / 2;
    const npvMid = computeNpv(flows, mid);
    if (npvMid === 0) return mid;
    if (npvMid > 0 === lowIsPositive) low = mid;
    else high = mid;
  }

  return (low + high) / 2;
}

/**
 * Calculate Money-Weighted Return (IRR)
 *
 * IRR is the annual rate that makes the investor's whole cash flow stream break even — the discount
 * rate where NPV = 0:
 *   NPV = −startNW − Σ contribution_i/(1+r)^t_i + endNW/(1+r)^T
 *
 * SIGNS: money INTO the portfolio is an outflow for the investor and enters negative — the starting
 * value and every contribution alike; money out (the final value, and withdrawals, which arrive as a
 * negative netCashFlow and therefore flip positive) is an inflow. Adding contributions with a plus
 * sign, as this function used to, asks a different question entirely: it treats money paid in as
 * money received, which inflates the answer (a contribution that exactly funds the growth read as
 * +22% a year instead of 0%) and can leave the equation with no root at all, which surfaced as a
 * blank card.
 *
 * TIMELINE: t = 0 is the start of the period, where the starting valuation sits — NOT the first
 * month that happens to have movements, which is what the previous anchor used and which pulled
 * every flow forward whenever the early months were quiet. Month distances are counted as elapsed
 * months, so a flow in the first month of the period sits at t = 0 alongside the starting value, and
 * the final value sits at t = numberOfMonths.
 *
 * WHY IT DIFFERS FROM TWR: TWR neutralises cash flows to judge the strategy; IRR keeps them to judge
 * the outcome for this investor. Paying in right before a rally makes IRR beat TWR, and vice versa.
 *
 * @param startNW - Starting net worth (outflow at t=0)
 * @param endNW - Ending net worth (inflow at t=numberOfMonths)
 * @param cashFlows - Monthly net cash flows during the period (positive = paid in)
 * @param numberOfMonths - Duration in months
 * @param periodStart - First day of the first MEASURED month; the anchor for every flow's date
 * @returns Annualized IRR percentage, or null when no rate can explain the stream
 */
export function calculateIRR(
  startNW: number,
  endNW: number,
  cashFlows: CashFlowData[],
  numberOfMonths: number,
  periodStart: Date
): number | null {
  if (numberOfMonths < 1 || startNW <= 0) return null;

  const flows: DatedFlow[] = [{ amount: -startNW, monthsFromStart: 0 }];

  for (const cf of cashFlows) {
    const monthsFromStart = monthsElapsed(periodStart, cf.date);
    // A flow dated outside the measured window would be discounted over a time it did not spend
    // invested; the callers already filter by the same window, so this is a guard, not a policy.
    if (monthsFromStart < 0 || monthsFromStart > numberOfMonths) continue;
    flows.push({ amount: -cf.netCashFlow, monthsFromStart });
  }

  flows.push({ amount: endNW, monthsFromStart: numberOfMonths });

  // Newton-Raphson first: it converges in a handful of iterations when it converges at all.
  // Each step follows the tangent to where it crosses zero: r ← r − NPV(r)/NPV'(r).
  let rate = 0.1; // Initial guess: 10%
  const maxIterations = 100;
  const tolerance = 1e-9;

  for (let i = 0; i < maxIterations; i++) {
    let npv = 0;
    let derivative = 0;

    for (const flow of flows) {
      const years = flow.monthsFromStart / 12;
      const discountFactor = Math.pow(1 + rate, -years);
      npv += flow.amount * discountFactor;
      derivative -= (flow.amount * years * discountFactor) / (1 + rate);
    }

    if (Math.abs(npv) < tolerance) return rate * 100;
    if (derivative === 0 || !isFinite(derivative)) break;

    const nextRate = rate - npv / derivative;
    if (!isFinite(nextRate) || nextRate <= IRR_MIN_RATE || nextRate >= IRR_MAX_RATE) break;
    rate = nextRate;
  }

  // Newton wandered off (or crawled): fall back to the solver that cannot.
  const bracketed = solveIrrByBisection(flows);
  return bracketed === null ? null : bracketed * 100;
}

/**
 * Calculate Sharpe Ratio
 * Formula: (Portfolio Return - Risk-Free Rate) / Portfolio Volatility
 *
 * @param portfolioReturn - Annualized portfolio return (%)
 * @param riskFreeRate - Risk-free rate (%)
 * @param volatility - Annualized volatility (%)
 * @returns Sharpe Ratio or null if volatility is zero
 */
export function calculateSharpeRatio(
  portfolioReturn: number,
  riskFreeRate: number,
  volatility: number
): number | null {
  if (volatility === 0) return null;
  return (portfolioReturn - riskFreeRate) / volatility;
}

/**
 * Minimum monthly returns required before a standard deviation means anything.
 *
 * Two observations always produce a "volatility" — the two points sit at a fixed distance from
 * their own mean — but it carries no information about how the portfolio behaves; with n−1 = 1
 * degree of freedom the estimate is pure noise, and the Sharpe ratio built on it inherits that.
 * Below this the metric is null, and the card says why instead of showing a confident number.
 */
const MIN_RETURNS_FOR_VOLATILITY = 3;

/**
 * Calculate annualized volatility from monthly snapshots
 *
 * Uses the SAME cash-flow-adjusted monthly returns as the heatmap and the drawdown index — the
 * whole series, unfiltered. There used to be a ±50% cut here (and only here), meant to drop spikes
 * caused by large contributions. It was solving a problem the formula had already solved: the
 * return is `(V_end − CF) / V_start − 1`, so a TRACKED contribution is neutralised before it can
 * become a spike, however large. What the cut actually removed was of two kinds, and both were
 * wrong to remove:
 *
 *  - an UNTRACKED movement (a balance corrected by hand, a transfer nobody recorded) produces the
 *    same artefact in the heatmap, the Underwater chart and the TWR — hiding it from volatility
 *    alone made the risk metric tell a different story from the risk chart, which is finding A6;
 *  - a REAL crash beyond 50% is the single most important thing volatility should report, and it
 *    was being deleted by the metric whose job is to measure exactly that.
 *
 * If artefacts show up here, the fix is in the data (record the movement) or upstream in the base
 * (see performanceBase.ts), never in a silent filter that makes one card disagree with the others.
 *
 * @param snapshots - Monthly snapshots
 * @param cashFlows - Cash flows to adjust for contributions/withdrawals
 * @returns Annualized volatility (%) or null with fewer than MIN_RETURNS_FOR_VOLATILITY returns
 */
export function calculateVolatility(
  snapshots: MonthlySnapshot[],
  cashFlows: CashFlowData[]
): number | null {
  if (snapshots.length < 2) return null;

  const cashFlowMap = buildCashFlowMap(cashFlows);

  const monthlyReturns: number[] = [];

  for (let i = 1; i < snapshots.length; i++) {
    const prevNW = snapshots[i - 1].totalNetWorth;
    const currNW = snapshots[i].totalNetWorth;

    if (prevNW <= 0) continue;

    const cashFlow = cashFlowMap.get(monthKey(snapshots[i].year, snapshots[i].month)) || 0;

    // Monthly return = (End NW - Cash Flow) / Start NW - 1
    monthlyReturns.push(((currNW - cashFlow) / prevNW - 1) * 100);
  }

  if (monthlyReturns.length < MIN_RETURNS_FOR_VOLATILITY) return null;

  // Calculate standard deviation
  const mean = monthlyReturns.reduce((sum, r) => sum + r, 0) / monthlyReturns.length;
  const variance = monthlyReturns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / (monthlyReturns.length - 1);
  const stdDev = Math.sqrt(variance);

  // Annualize: σ_annual = σ_monthly × √12
  return stdDev * Math.sqrt(12);
}

/**
 * Calculate Maximum Drawdown
 * Measures the largest peak-to-trough decline of the TWR index (see lib/utils/drawdownSeries.ts):
 * the geometric chaining of the monthly returns, so the figure is independent of how much capital
 * flowed in and matches what the monthly-returns heatmap shows.
 *
 * @param snapshots - Monthly snapshots (sorted chronologically)
 * @param cashFlows - Monthly cash flows
 * @returns Object with maximum drawdown percentage and trough date, or null values if portfolio never declined
 */
export function calculateMaxDrawdown(
  snapshots: MonthlySnapshot[],
  cashFlows: CashFlowData[]
): { value: number | null; troughDate: string | null } {
  if (snapshots.length < 2) return { value: null, troughDate: null };

  const index = buildTwrIndex(snapshots, cashFlows);
  const { value, troughIndex } = findMaxDrawdown(index);
  if (value === 0) return { value: null, troughDate: null };

  const troughSnapshot = index[troughIndex].snapshot;

  return {
    value,                                                              // Negative percentage (e.g., -7.07)
    troughDate: formatMonthYear(troughSnapshot.year, troughSnapshot.month), // MM/YY format (e.g., "04/25")
  };
}

/**
 * Measure how long the deepest drawdown lasted, counting from a chosen starting point.
 *
 * Drawdown Duration and Recovery Time are the SAME measurement taken from two different anchors —
 * the peak the fall started from, or the trough it bottomed at — so they share this one body
 * instead of two near-identical 60-line copies (they diverged only in one index before).
 * Distance between indices, not inclusive count: Jan(0) → Dec(11) is 11 months.
 *
 * @param snapshots - Monthly snapshots (sorted chronologically)
 * @param cashFlows - Monthly cash flows
 * @param anchor - Where the count starts: from the peak (Duration) or from the trough (Recovery Time)
 * @returns Months elapsed and the labelled period, or nulls when the portfolio never declined
 */
function measureDrawdownSpan(
  snapshots: MonthlySnapshot[],
  cashFlows: CashFlowData[],
  anchor: 'peak' | 'trough'
): { duration: number | null; period: string | null } {
  if (snapshots.length < 2) return { duration: null, period: null };

  const index = buildTwrIndex(snapshots, cashFlows);
  const { value, peakIndex, troughIndex, recoveryIndex } = findMaxDrawdown(index);
  if (value === 0) return { duration: null, period: null };

  const startIndex = anchor === 'peak' ? peakIndex : troughIndex;
  // Still underwater: count up to the most recent snapshot instead of leaving the span open.
  const endIndex = recoveryIndex ?? index.length - 1;
  const startSnapshot = index[startIndex].snapshot;
  const recoverySnapshot = recoveryIndex !== null ? index[recoveryIndex].snapshot : null;

  return {
    duration: Math.max(0, endIndex - startIndex),
    period: formatPeriod(
      startSnapshot.year,
      startSnapshot.month,
      recoverySnapshot?.year ?? null,
      recoverySnapshot?.month ?? null
    ),
  };
}

/**
 * Calculate Drawdown Duration
 * Months from the peak the deepest drawdown started at, to full recovery (or to the present month
 * when the portfolio is still underwater).
 *
 * @param snapshots - Monthly snapshots (sorted chronologically)
 * @param cashFlows - Monthly cash flows
 * @returns Object with duration in months and period range, or null values if portfolio never declined
 *
 * @example
 * Portfolio drops 15% from Jan (index 0) to Apr (index 3), recovers to new peak on Dec (index 11)
 * Duration = 11 months elapsed (Dec index 11 − Jan index 0 = 11)
 */
export function calculateDrawdownDuration(
  snapshots: MonthlySnapshot[],
  cashFlows: CashFlowData[]
): { duration: number | null; period: string | null } {
  return measureDrawdownSpan(snapshots, cashFlows, 'peak');
}

/**
 * Calculate Recovery Time
 * Months from the trough (lowest point) to full recovery. 0 means the portfolio is currently AT the
 * trough, with no recovery time elapsed yet.
 *
 * @param snapshots - Monthly snapshots (sorted chronologically)
 * @param cashFlows - Monthly cash flows
 * @returns Object with duration in months and period range, or null values if portfolio never declined
 *
 * @example
 * Portfolio drops 15% from Jan (index 0) to Apr (index 3), recovers to peak on Dec (index 11)
 * Drawdown Duration = 11 months elapsed (Dec idx 11 − Jan idx 0 = 11)
 * Recovery Time = 8 months elapsed (Dec idx 11 − Apr idx 3 = 8)
 */
export function calculateRecoveryTime(
  snapshots: MonthlySnapshot[],
  cashFlows: CashFlowData[]
): { duration: number | null; period: string | null } {
  return measureDrawdownSpan(snapshots, cashFlows, 'trough');
}

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
  dividends: any[],
  assets: any[],
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
  dividends: any[],
  assets: any[],
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

/**
 * Whole months elapsed from one date to another — month boundaries crossed, days ignored.
 *
 * The measure of DISTANCE between two months: Jan → Mar is 2. Use it whenever the question is
 * "how long", as opposed to "how many months does this range cover" (that is
 * `calculateMonthsDifference`, which counts both ends). Mixing the two is a systematic off-by-one.
 *
 * @param from - Earlier date
 * @param to - Later date
 * @returns Months from `from` to `to`; negative when `to` precedes `from`
 */
function monthsElapsed(from: Date, to: Date): number {
  return (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
}

/**
 * Calculate number of months a range COVERS, both ends included
 *
 * @param date1 - End date
 * @param date2 - Start date
 * @returns Number of months including both start and end months
 *
 * @example
 * calculateMonthsDifference(new Date(2025, 11), new Date(2025, 0)) // 12 months (Jan to Dec inclusive)
 */
function calculateMonthsDifference(date1: Date, date2: Date): number {
  return monthsElapsed(date2, date1) + 1; // +1 to include both start and end month
}

/**
 * The FIRST month the user asked for, per period — the "nominal" start.
 *
 * Nominal, not effective: it is what the selector means (January for YTD, eleven months ago for 1Y),
 * regardless of whether a snapshot exists that far back. Comparing it with the oldest snapshot
 * actually available is what tells a pre-period baseline from a genuine first month of history
 * (`resolveHasBaseline`) — the guess this replaces got that wrong whenever the two differed.
 *
 * ALL has no nominal start by definition (it starts wherever the user's history starts), and the
 * rolling pseudo-periods are not selectable ranges: both return null.
 *
 * @param timePeriod - Period selector
 * @param customStartDate - First month the user picked, required for CUSTOM
 * @param referenceDate - "Today"; injectable so callers within one computation share a single clock
 */
export function resolveNominalPeriodStart(
  timePeriod: TimePeriod,
  customStartDate?: Date,
  referenceDate: Date = new Date()
): PeriodMonth | null {
  const toMonth = (date: Date): PeriodMonth => ({
    year: date.getFullYear(),
    month: date.getMonth() + 1,
  });

  switch (timePeriod) {
    case 'YTD':
      return { year: referenceDate.getFullYear(), month: 1 };
    case '1Y':
      // 12 months of returns ending with the current month → starts 11 months ago
      return toMonth(new Date(referenceDate.getFullYear(), referenceDate.getMonth() - 11, 1));
    case '3Y':
      return toMonth(new Date(referenceDate.getFullYear(), referenceDate.getMonth() - 35, 1));
    case '5Y':
      return toMonth(new Date(referenceDate.getFullYear(), referenceDate.getMonth() - 59, 1));
    case 'CUSTOM':
      return customStartDate ? toMonth(customStartDate) : null;
    default:
      return null;
  }
}

/**
 * The snapshot window a period is computed over: every snapshot inside the period, PLUS the single
 * month right before it.
 *
 * That extra month is the starting valuation the first monthly return is measured against — without
 * it the returns loop (which starts at i=1) would silently skip the first month of the period. It is
 * only reached back for ONE month: an older snapshot separated by a gap is not a valid starting
 * valuation for this period and must stay out, or the first "monthly" return would silently span
 * several months.
 *
 * @param allSnapshots - All available snapshots
 * @param nominalPeriodStart - First month of the period; null means "no lower bound" (ALL)
 * @param endDate - Upper bound, inclusive
 */
function selectSnapshotWindow(
  allSnapshots: MonthlySnapshot[],
  nominalPeriodStart: PeriodMonth | null,
  endDate: Date
): MonthlySnapshot[] {
  // month - 2 in a 0-based Date index = the month BEFORE the period start; the Date constructor
  // rolls a negative index over to the previous year.
  const lowerBound = nominalPeriodStart
    ? new Date(nominalPeriodStart.year, nominalPeriodStart.month - 2, 1)
    : null;

  return allSnapshots.filter(snapshot => {
    const snapshotDate = new Date(snapshot.year, snapshot.month - 1, 1);
    return (lowerBound === null || snapshotDate >= lowerBound) && snapshotDate <= endDate;
  });
}

/**
 * Get snapshots for a specific time period (the period itself + one baseline month before it)
 *
 * @param allSnapshots - All available snapshots (including dummy data)
 * @param timePeriod - Time period selector (YTD, 1Y, 3Y, 5Y, ALL, CUSTOM)
 * @param customStartDate - Start date for CUSTOM period
 * @param customEndDate - End date for CUSTOM period
 * @param referenceDate - "Today"; injectable so one computation uses a single clock
 * @returns Filtered snapshots for the period (empty when CUSTOM is missing its dates)
 */
export function getSnapshotsForPeriod(
  allSnapshots: MonthlySnapshot[],
  timePeriod: TimePeriod,
  customStartDate?: Date,
  customEndDate?: Date,
  referenceDate: Date = new Date()
): MonthlySnapshot[] {
  // ALL is the whole history — no lower bound to reach back from, and no upper bound to apply.
  if (timePeriod === 'ALL') return allSnapshots;

  const nominalPeriodStart = resolveNominalPeriodStart(timePeriod, customStartDate, referenceDate);
  if (!nominalPeriodStart) return []; // CUSTOM without dates, or a non-selectable period
  if (timePeriod === 'CUSTOM' && !customEndDate) return [];

  const endDate = timePeriod === 'CUSTOM' ? customEndDate! : referenceDate;
  return selectSnapshotWindow(allSnapshots, nominalPeriodStart, endDate);
}

/**
 * Re-select the EXACT snapshot window a metrics payload was computed from.
 *
 * For client-side redraws (evolution chart, heatmap, underwater) that must agree with the numbers
 * the service already produced. It reads the period back off the payload instead of re-deriving it
 * from `new Date()`: that round trip is how the page and the service ended up reading different
 * series (finding A10), and for CUSTOM it only worked by accident — the page passed a start date the
 * service had already advanced past the baseline, which `getSnapshotsForPeriod` then moved back.
 */
export function selectSnapshotsForMetrics(
  allSnapshots: MonthlySnapshot[],
  metrics: Pick<PerformanceMetrics, 'nominalPeriodStart' | 'endDate'>
): MonthlySnapshot[] {
  return selectSnapshotWindow(allSnapshots, metrics.nominalPeriodStart ?? null, metrics.endDate);
}

/**
 * Aggregate monthly cash flows from expenses
 * Separates dividend income from other income for accurate performance calculations.
 *
 * Dividend income is excluded from netCashFlow because it represents portfolio returns,
 * not external contributions. Including it would distort ROI, CAGR, and TWR calculations.
 *
 * @param userId - User ID for fetching expenses
 * @param startDate - Start date for expense range
 * @param endDate - End date for expense range
 * @param dividendCategoryId - Category ID for dividend income (from user settings)
 * @returns Array of monthly cash flow data with separated dividend income
 */
async function getCashFlowsForPeriod(
  userId: string,
  startDate: Date,
  endDate: Date,
  dividendCategoryId?: string
): Promise<CashFlowData[]> {
  const expenses = await getExpensesByDateRange(userId, startDate, endDate);

  // Group expenses by month
  const monthlyMap = new Map<string, { income: number; expenses: number; dividendIncome: number }>();

  expenses.forEach(expense => {
    // Transfers are net-zero for portfolio metrics — skip before touching the map
    // so a transfer-only month never creates a spurious empty cashflow entry.
    if (expense.type === 'transfer') return;

    const date = expense.date;
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

    if (!monthlyMap.has(key)) {
      monthlyMap.set(key, { income: 0, expenses: 0, dividendIncome: 0 });
    }

    const entry = monthlyMap.get(key)!;

    // Separate dividend income from other income
    if (expense.type === 'income') {
      if (dividendCategoryId && expense.categoryId === dividendCategoryId) {
        // Dividend income (portfolio return)
        entry.dividendIncome += expense.amount;
      } else {
        // External income (salary, bonus, gifts)
        entry.income += expense.amount;
      }
    } else {
      entry.expenses += Math.abs(expense.amount);
    }
  });

  // Convert to CashFlowData array
  const cashFlows: CashFlowData[] = [];
  monthlyMap.forEach((value, key) => {
    const [year, month] = key.split('-').map(Number);
    cashFlows.push({
      date: new Date(year, month - 1, 1),
      income: value.income,
      expenses: value.expenses,
      dividendIncome: value.dividendIncome,
      netCashFlow: value.income - value.expenses, // Excludes dividends (they are portfolio returns, not contributions)
    });
  });

  return cashFlows.sort((a, b) => a.date.getTime() - b.date.getTime());
}

/**
 * Build cash flows from a pre-fetched expense array (in-memory filtering)
 * This eliminates N Firestore queries in rolling period calculations
 * Separates dividend income from other income for accurate performance calculations
 *
 * @param expenses - Pre-fetched expense array
 * @param startDate - Start date for filtering
 * @param endDate - End date for filtering
 * @param dividendCategoryId - Category ID for dividend income (from user settings)
 * @returns Array of monthly cash flow data
 */
export function getCashFlowsFromExpenses(
  expenses: Expense[],
  startDate: Date,
  endDate: Date,
  dividendCategoryId?: string
): CashFlowData[] {
  // Filter expenses by date range in-memory
  const filtered = expenses.filter(expense => {
    const date = expense.date;
    return date >= startDate && date <= endDate;
  });

  // Group expenses by month (same logic as getCashFlowsForPeriod)
  const monthlyMap = new Map<string, { income: number; expenses: number; dividendIncome: number }>();

  filtered.forEach(expense => {
    // Transfers are net-zero for portfolio metrics — skip before touching the map
    // so a transfer-only month never creates a spurious empty cashflow entry.
    if (expense.type === 'transfer') return;

    const date = expense.date;
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

    if (!monthlyMap.has(key)) {
      monthlyMap.set(key, { income: 0, expenses: 0, dividendIncome: 0 });
    }

    const entry = monthlyMap.get(key)!;

    // Separate dividend income from other income
    if (expense.type === 'income') {
      if (dividendCategoryId && expense.categoryId === dividendCategoryId) {
        // Dividend income (portfolio return)
        entry.dividendIncome += expense.amount;
      } else {
        // External income (salary, bonus, gifts)
        entry.income += expense.amount;
      }
    } else {
      entry.expenses += Math.abs(expense.amount);
    }
  });

  // Convert to CashFlowData array
  const cashFlows: CashFlowData[] = [];
  monthlyMap.forEach((value, key) => {
    const [year, month] = key.split('-').map(Number);
    cashFlows.push({
      date: new Date(year, month - 1, 1),
      income: value.income,
      expenses: value.expenses,
      dividendIncome: value.dividendIncome,
      netCashFlow: value.income - value.expenses, // Excludes dividends (they are portfolio returns, not contributions)
    });
  });

  return cashFlows.sort((a, b) => a.date.getTime() - b.date.getTime());
}

/**
 * I FLUSSI SEGUONO LA BASE (fix D1, 2026-08-30), **mese per mese**.
 *
 * Una base sono due meta': QUALE capitale si misura (`toPerformanceBaseSnapshots`) e QUALI flussi
 * lo attraversano. Applicarne una sola produce una coppia incoerente — capitale del portafoglio
 * con i versamenti dell'intero patrimonio — che non risponde a nessuna delle due domande. Questa
 * funzione e' l'unica risposta alla seconda meta', condivisa da ogni finestra di misura: i cinque
 * periodi fissi e le finestre rolling.
 *
 * `portfolioFlows` porta una voce per ogni mese MISURABILE (serve il `byAsset` di entrambi i mesi
 * della coppia), zeri compresi. Un mese assente non e' un mese a flusso nullo: e' un mese che non
 * si puo' misurare, e li' si ricade sul Cashflow. Senza questo fallback uno storico fatto di
 * snapshot inseriti a mano — nessun breakdown — finirebbe con flussi tutti nulli e ogni
 * versamento verrebbe letto come rendimento: una regressione grave e silenziosa rispetto al
 * comportamento precedente.
 *
 * `portfolioFlows` assente significa «la base E' il patrimonio» (nessuna esclusione): il Cashflow
 * e' allora la fonte GIUSTA, non un ripiego, e la funzione degrada a identita'.
 *
 * @param expenseFlows - I flussi del Cashflow della finestra, gia' filtrati per data
 * @param portfolioFlows - I flussi per asset su tutta la storia, o `undefined` senza esclusioni
 * @param startDate - Inizio della finestra misurata (incluso)
 * @param endDate - Fine della finestra misurata (inclusa)
 */
function resolveBaseAwareCashFlows(
  expenseFlows: CashFlowData[],
  portfolioFlows: CashFlowData[] | undefined,
  startDate: Date,
  endDate: Date
): { cashFlows: CashFlowData[]; flowSource: PerformanceMetrics['flowSource'] } {
  const measured = (portfolioFlows ?? []).filter(cf => cf.date >= startDate && cf.date <= endDate);
  const measuredMonths = new Set(measured.map(cf => monthKeyOf(cf.date)));
  const fallback = portfolioFlows
    ? expenseFlows.filter(cf => !measuredMonths.has(monthKeyOf(cf.date)))
    : expenseFlows;
  const cashFlows = portfolioFlows
    ? [...measured, ...fallback].sort((a, b) => a.date.getTime() - b.date.getTime())
    : expenseFlows;

  // Dichiarare la sorgente per PERIODO sarebbe una semplificazione bugiarda quando le due
  // convivono: la tessera Contributi deve poter dire «in parte».
  const flowSource: PerformanceMetrics['flowSource'] = !portfolioFlows
    ? 'cashflow'
    : fallback.length === 0
      ? 'portfolio'
      : measured.length === 0
        ? 'cashflow'
        : 'mixed';

  return { cashFlows, flowSource };
}

/**
 * Calculate performance metrics for a specific time period
 *
 * @param preFetchedExpenses - Optional pre-fetched expenses array to avoid redundant Firestore queries
 * @param dividendCategoryId - Category ID for dividend income (from user settings)
 */
export async function calculatePerformanceForPeriod(
  userId: string,
  allSnapshots: MonthlySnapshot[],
  timePeriod: TimePeriod,
  riskFreeRate: number,
  customStartDate?: Date,
  customEndDate?: Date,
  preFetchedExpenses?: Expense[],
  dividendCategoryId?: string,
  /**
   * I flussi del portafoglio (variazioni di quantita'), calcolati UNA volta su tutta la storia da
   * `buildPortfolioCashFlows` e passati qui gia' pronti. Presenti = la base esclude qualcosa, quindi
   * un acquisto attraversa il confine ed e' un flusso; assenti = la base e' tutto il patrimonio e i
   * flussi restano quelli del Cashflow. Vedi `lib/utils/portfolioFlows.ts`.
   */
  portfolioFlows?: CashFlowData[]
): Promise<PerformanceMetrics> {
  // One clock for the whole computation: period selection, the nominal start recorded in the
  // payload and the dividend cap must not disagree because they each called new Date().
  const now = new Date();

  // Get snapshots for period
  const snapshots = getSnapshotsForPeriod(
    allSnapshots,
    timePeriod,
    customStartDate,
    customEndDate,
    now
  );
  const nominalPeriodStart = resolveNominalPeriodStart(timePeriod, customStartDate, now);

  // Base metrics object (in case of errors)
  const baseMetrics: PerformanceMetrics = {
    timePeriod,
    nominalPeriodStart,
    startDate: customStartDate || new Date(),
    endDate: customEndDate || new Date(),
    dividendEndDate: new Date(),  // Default to now for error cases
    startNetWorth: 0,
    endNetWorth: 0,
    cashFlows: [],
    roi: null,
    cagr: null,
    timeWeightedReturn: null,
    moneyWeightedReturn: null,
    sharpeRatio: null,
    volatility: null,
    maxDrawdown: null,
    drawdownDuration: null,
    recoveryTime: null,
    maxDrawdownDate: undefined,
    drawdownPeriod: undefined,
    recoveryPeriod: undefined,
    riskFreeRate,
    dividendCategoryId,
    totalContributions: 0,
    totalWithdrawals: 0,
    netCashFlow: 0,
    flowSource: 'cashflow',
    totalIncome: 0,
    totalExpenses: 0,
    totalDividendIncome: 0,
    numberOfMonths: 0,
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
    hasInsufficientData: true,
  };

  if (snapshots.length < 2) {
    baseMetrics.errorMessage = 'Insufficient data: need at least 2 snapshots';
    return baseMetrics;
  }

  // Sort snapshots chronologically
  const sortedSnapshots = [...snapshots].sort((a, b) => {
    if (a.year !== b.year) return a.year - b.year;
    return a.month - b.month;
  });

  // ONE RULE FOR BOTH CASES: the first snapshot is the starting VALUATION, never a measured month.
  //
  // A snapshot is an end-of-month photograph, so the measurement can only open where that photograph
  // was taken — at the END of the first snapshot's month, i.e. on the 1st of the month after it.
  // That holds whether the first snapshot is a pre-period baseline (Dec for YTD) or the first month
  // of the user's own history (ALL, or a window longer than the history): the previous code branched
  // on a guessed `hasBaseline` and got the second case wrong twice over —
  //   A2: cash flows were collected from the 1st of the first month, but that month's savings were
  //       ALREADY inside startNW → the same money was subtracted a second time in ROI and CAGR;
  //   A3: n snapshots produce n−1 monthly returns, but they were annualized over n months.
  // Both vanish here: the period is [month after the first snapshot .. last snapshot], which is
  // exactly the span the linked monthly returns cover.
  //
  // Gaps are handled too: with [Dec, Mar] the period opens in January (three months of cash flows
  // affect that return), where taking sortedSnapshots[1] would have opened it in March.
  const startSnapshot = sortedSnapshots[0];
  const endSnapshot = sortedSnapshots[sortedSnapshots.length - 1];

  // month index (0-based) === month number (1-based) → the first day of the FOLLOWING month
  const startDate = new Date(startSnapshot.year, startSnapshot.month, 1);
  const endDate = endOfMonthBound(endSnapshot.year, endSnapshot.month);

  // For dividend calculations, cap at today to exclude future dividends not yet received
  const dividendEndDate = endDate > now ? now : endDate;

  const numberOfMonths = calculateMonthsDifference(endDate, startDate);
  if (numberOfMonths < 1) {
    // Two snapshots in the same month (duplicates): there is no measurable span, and every
    // annualized metric would divide by zero years.
    baseMetrics.errorMessage = 'Insufficient data: period shorter than one month';
    return baseMetrics;
  }

  // I flussi del Cashflow servono comunque: entrate, uscite e dividendi del periodo sono contesto
  // che la tessera Contributi mostra, e restano quelli anche quando la base e' il solo portafoglio.
  const expenseFlows = preFetchedExpenses
    ? getCashFlowsFromExpenses(preFetchedExpenses, startDate, endDate, dividendCategoryId)
    : await getCashFlowsForPeriod(userId, startDate, endDate, dividendCategoryId);

  // I flussi che neutralizzano il rendimento seguono la base — la regola sta tutta in
  // resolveBaseAwareCashFlows, condivisa con le finestre rolling.
  const { cashFlows, flowSource } = resolveBaseAwareCashFlows(expenseFlows, portfolioFlows, startDate, endDate);

  // Entrate/uscite/dividendi vengono SEMPRE dal Cashflow: un acquisto non e' ne' uno stipendio ne'
  // una spesa, e sommarlo li' mescolerebbe due perimetri.
  let totalIncome = 0;
  let totalExpenses = 0;
  let totalDividendIncome = 0;
  expenseFlows.forEach(cf => {
    totalIncome += cf.income;
    totalExpenses += cf.expenses;
    totalDividendIncome += cf.dividendIncome;
  });

  // Contributi e prelievi sono invece la serie che neutralizza il rendimento, cioe' quella scelta
  // sopra: e' lo stesso denaro che TWR toglie dal numeratore.
  let totalContributions = 0;
  let totalWithdrawals = 0;
  cashFlows.forEach(cf => {
    if (cf.netCashFlow > 0) {
      totalContributions += cf.netCashFlow;
    } else {
      totalWithdrawals += Math.abs(cf.netCashFlow);
    }
  });
  const netCashFlow = totalContributions - totalWithdrawals;

  // Calculate metrics
  const roi = calculateROI(
    startSnapshot.totalNetWorth,
    endSnapshot.totalNetWorth,
    netCashFlow
  );

  const cagr = calculateCAGR(
    startSnapshot.totalNetWorth,
    endSnapshot.totalNetWorth,
    netCashFlow,
    numberOfMonths
  );

  // numberOfMonths is exactly the number of linked monthly returns, so TWR annualizes over the span
  // it actually measured — never over the calendar range, which also counts the starting valuation's
  // month and would flatten the result.
  const timeWeightedReturn = calculateTimeWeightedReturn(
    sortedSnapshots,
    cashFlows,
    numberOfMonths
  );

  // startDate anchors the timeline: it is where -startNW sits, so every flow is discounted over the
  // time it was actually invested — not over its distance from the first month that had movements.
  const moneyWeightedReturn = calculateIRR(
    startSnapshot.totalNetWorth,
    endSnapshot.totalNetWorth,
    cashFlows,
    numberOfMonths,
    startDate
  );

  const volatility = calculateVolatility(sortedSnapshots, cashFlows);

  const maxDrawdownResult = calculateMaxDrawdown(sortedSnapshots, cashFlows);

  const drawdownDurationResult = calculateDrawdownDuration(sortedSnapshots, cashFlows);

  const recoveryTimeResult = calculateRecoveryTime(sortedSnapshots, cashFlows);

  const sharpeRatio = timeWeightedReturn !== null && volatility !== null
    ? calculateSharpeRatio(timeWeightedReturn, riskFreeRate, volatility)
    : null;

  // YOC metrics are calculated server-side via API route
  // These fields are populated by the client after fetching from /api/performance/yoc
  const yocMetrics = {
    yocGross: null as number | null,
    yocNet: null as number | null,
    yocDividendsGross: 0,
    yocDividendsNet: 0,
    yocCostBasis: 0,
    yocAssetCount: 0,
  };

  // Current Yield metrics are calculated server-side via API route
  // These fields are populated by the client after fetching from /api/performance/current-yield
  const currentYieldMetrics = {
    currentYield: null as number | null,
    currentYieldNet: null as number | null,
    currentYieldDividends: 0,
    currentYieldDividendsNet: 0,
    currentYieldPortfolioValue: 0,
    currentYieldAssetCount: 0,
  };

  return {
    timePeriod,
    nominalPeriodStart,
    startDate,
    endDate,
    dividendEndDate,
    startNetWorth: startSnapshot.totalNetWorth,
    endNetWorth: endSnapshot.totalNetWorth,
    cashFlows,
    roi,
    cagr,
    timeWeightedReturn,
    moneyWeightedReturn,
    sharpeRatio,
    volatility,
    maxDrawdown: maxDrawdownResult.value,
    drawdownDuration: drawdownDurationResult.duration,
    recoveryTime: recoveryTimeResult.duration,
    maxDrawdownDate: maxDrawdownResult.troughDate ?? undefined,
    drawdownPeriod: drawdownDurationResult.period ?? undefined,
    recoveryPeriod: recoveryTimeResult.period ?? undefined,
    riskFreeRate,
    dividendCategoryId, // Store for reuse in custom date ranges
    totalContributions,
    totalWithdrawals,
    netCashFlow,
    flowSource,
    totalIncome,
    totalExpenses,
    totalDividendIncome,
    numberOfMonths,
    ...yocMetrics,  // Spread YOC fields (will be populated by client via API)
    ...currentYieldMetrics,  // Spread Current Yield fields (will be populated by client via API)
    hasInsufficientData: false,
  };
}

// ===== PERFORMANCE CACHE HELPERS =====

function serializeCashFlow(cf: CashFlowData): FirestoreCashFlowData {
  return { ...cf, date: Timestamp.fromDate(cf.date) };
}

function deserializeCashFlow(cf: FirestoreCashFlowData): CashFlowData {
  return { ...cf, date: cf.date.toDate() };
}

function serializeMetrics(m: PerformanceMetrics): FirestorePerformanceMetrics {
  return {
    ...m,
    startDate: Timestamp.fromDate(m.startDate),
    endDate: Timestamp.fromDate(m.endDate),
    dividendEndDate: Timestamp.fromDate(m.dividendEndDate),
    cashFlows: m.cashFlows.map(serializeCashFlow),
  };
}

function deserializeMetrics(m: FirestorePerformanceMetrics): PerformanceMetrics {
  return {
    ...m,
    startDate: m.startDate.toDate(),
    endDate: m.endDate.toDate(),
    dividendEndDate: m.dividendEndDate.toDate(),
    cashFlows: m.cashFlows.map(deserializeCashFlow),
  };
}

function serializeRolling(r: RollingPeriodPerformance): FirestoreRollingPeriodPerformance {
  return {
    ...r,
    periodStartDate: Timestamp.fromDate(r.periodStartDate),
    periodEndDate: Timestamp.fromDate(r.periodEndDate),
  };
}

function deserializeRolling(r: FirestoreRollingPeriodPerformance): RollingPeriodPerformance {
  return {
    ...r,
    periodStartDate: r.periodStartDate.toDate(),
    periodEndDate: r.periodEndDate.toDate(),
  };
}

function serializePerformanceData(data: PerformanceData): FirestorePerformanceData {
  return {
    ytd: serializeMetrics(data.ytd),
    oneYear: serializeMetrics(data.oneYear),
    threeYear: serializeMetrics(data.threeYear),
    fiveYear: serializeMetrics(data.fiveYear),
    allTime: serializeMetrics(data.allTime),
    rolling12M: data.rolling12M.map(serializeRolling),
    lastUpdated: Timestamp.fromDate(data.lastUpdated),
    snapshotCount: data.snapshotCount,
  };
}

function deserializePerformanceData(raw: FirestorePerformanceData): PerformanceData {
  return {
    ytd: deserializeMetrics(raw.ytd),
    oneYear: deserializeMetrics(raw.oneYear),
    threeYear: deserializeMetrics(raw.threeYear),
    fiveYear: deserializeMetrics(raw.fiveYear),
    allTime: deserializeMetrics(raw.allTime),
    custom: null,
    rolling12M: raw.rolling12M.map(deserializeRolling),
    lastUpdated: raw.lastUpdated.toDate(),
    snapshotCount: raw.snapshotCount,
  };
}

async function readPerformanceCache(userId: string): Promise<PerformanceCacheDocument | null> {
  try {
    const snap = await getDoc(doc(db, PERFORMANCE_CACHE_COLLECTION, userId));
    if (!snap.exists()) return null;
    return snap.data() as PerformanceCacheDocument;
  } catch (error) {
    // Cache read failure is non-fatal — fall through to full computation
    console.warn('Failed to read performance cache, falling back to live computation', {
      userId,
      operation: 'readPerformanceCache',
      error: getErrorMessage(error),
    });
    return null;
  }
}

async function writePerformanceCache(userId: string, cacheKey: string, data: PerformanceData): Promise<void> {
  try {
    const document: PerformanceCacheDocument = {
      userId,
      cacheKey,
      cachedAt: Timestamp.now(),
      data: serializePerformanceData(data),
    };
    await setDoc(doc(db, PERFORMANCE_CACHE_COLLECTION, userId), document);
  } catch (error) {
    // Cache write failure is non-fatal — page still works with freshly computed data
    console.warn('Failed to write performance cache, keeping live result only', {
      userId,
      operation: 'writePerformanceCache',
      cacheKey,
      snapshotCount: data.snapshotCount,
      error: getErrorMessage(error),
    });
  }
}

/**
 * FNV-1a (32 bit) over the WHOLE snapshot series, chronologically ordered.
 *
 * Teacher note — FNV-1a is a non-cryptographic hash: start from an offset basis, then for each byte
 * xor it in and multiply by a prime. Cheap, no dependencies, and well spread over short strings,
 * which is all a cache key needs (it defends against accidental collisions, not against an attacker
 * crafting one). `Math.imul` keeps the multiplication in 32-bit integer space, which plain `*` would
 * not: JS numbers are doubles and would silently lose the low bits.
 *
 * Order matters and is fixed by sorting: two accounts with the same months in a different array
 * order describe the same history and must produce the same key.
 */
function hashSnapshotSeries(snapshots: MonthlySnapshot[]): string {
  const sorted = [...snapshots].sort((a, b) => (a.year !== b.year ? a.year - b.year : a.month - b.month));

  let hash = 0x811c9dc5; // FNV offset basis
  for (const snapshot of sorted) {
    // Rounded to the euro: cents drift with FX re-conversions and would churn the key for nothing.
    const token = `${snapshot.year}-${snapshot.month}:${Math.round(snapshot.totalNetWorth)};`;
    for (let i = 0; i < token.length; i++) {
      hash ^= token.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193); // FNV prime
    }
  }

  return (hash >>> 0).toString(36);
}

/**
 * Everything the cached numbers depend on, condensed into one string.
 *
 * WHAT INVALIDATES THE CACHE (DEVELOPMENT_GUIDELINES → Caching):
 *  - any snapshot added, removed OR corrected, anywhere in the history — the series hash covers all
 *    of them, where the previous key only fingerprinted the LAST one and happily served stale
 *    metrics after a historical snapshot was fixed;
 *  - the base composition (pension funds / excluded assets), which rewrites every metric while the
 *    snapshots stay untouched;
 *  - the risk-free rate, which moves every Sharpe ratio and the hero verdict built on it;
 *  - the dividend income category, which decides what counts as a contribution instead of a
 *    portfolio return — it reclassifies cash flows, so it changes ROI, CAGR, TWR and IRR too;
 *  - `CACHE_MATH_VERSION`, the manual lever for when the MATH changes but the inputs do not — the
 *    only case no input signature can detect. See its declaration for when to bump it.
 *
 * WHAT STALE COSTS: nothing is corrupted — the payload is only ever a recomputable projection of
 * Firestore data, and the 6h TTL in `getAllPerformanceData` bounds any miss of this list. The user
 * sees numbers that are internally consistent but computed from a previous input, and the Aggiorna
 * button (`forceRefresh`) always bypasses the cache. Known residual: the period boundaries depend on
 * TODAY, so on the first visit after a month rollover the cached YTD/1Y/3Y/5Y still describe the
 * previous month's window until the TTL expires or a new snapshot lands.
 *
 * A 32-bit hash can in principle collide; the key also carries the snapshot count and the last
 * month's value, so a collision would have to match all of them at once.
 */
export function buildCacheKey(inputs: {
  snapshots: MonthlySnapshot[];
  baseOptions: PerformanceBaseOptions;
  riskFreeRate: number;
  dividendCategoryId?: string;
  /**
   * Le operazioni del registro. Da quando i flussi le preferiscono alle Delta-quantita'
   * (portfolioFlows.ts) sono un INPUT dei numeri: senza la firma, registrare una vendita non
   * cambierebbe la chiave e la pagina resterebbe sui valori vecchi fino alla scadenza delle 6 ore.
   */
  ledgerTrades?: Array<{ id: string; date: Date }>;
}): string {
  const { snapshots, baseOptions, riskFreeRate, dividendCategoryId, ledgerTrades = [] } = inputs;

  const baseSignature = `p${baseOptions.includePensionFunds ? 1 : 0}e${baseOptions.includeExcludedAssets ? 1 : 0}`;
  const settingsSignature = `r${riskFreeRate}d${dividendCategoryId ?? 'none'}`;
  // Conteggio + operazione piu' recente: un'aggiunta, una cancellazione o una data spostata
  // cambiano almeno uno dei due.
  const lastTrade = ledgerTrades.reduce((latest, t) => (t.date > latest ? t.date : latest), new Date(0));
  const ledgerSignature = `l${ledgerTrades.length}t${lastTrade.getTime()}`;

  if (snapshots.length === 0) return `${CACHE_MATH_VERSION}-0-${baseSignature}-${settingsSignature}-${ledgerSignature}`;

  const last = snapshots.reduce((latest, s) =>
    s.year !== latest.year ? (s.year > latest.year ? s : latest) : s.month > latest.month ? s : latest
  );

  return [
    CACHE_MATH_VERSION,
    snapshots.length,
    `${last.year}-${last.month}`,
    Math.round(last.totalNetWorth),
    hashSnapshotSeries(snapshots),
    baseSignature,
    settingsSignature,
    ledgerSignature,
  ].join('-');
}

/**
 * Get all performance data for the page
 *
 * Calculates performance metrics for multiple time periods:
 * - YTD, 1Y, 3Y, 5Y, ALL time periods
 * - Rolling 12M and 36M periods
 *
 * On repeated visits with unchanged inputs (snapshots, metrics base, risk-free rate, dividend
 * category), returns cached data from Firestore (performance-cache collection) to avoid re-reading
 * the whole expense history — see buildCacheKey for exactly what invalidates it.
 *
 * @param userId - User ID for fetching data
 * @param forceRefresh - Skip cache and recompute (used by the refresh button)
 * @returns Complete performance data for all periods
 */
export async function getAllPerformanceData(userId: string, forceRefresh = false): Promise<PerformanceData> {
  // ==== STEP 1: Fetch snapshots, settings, and assets in parallel ====
  const [rawSnapshots, settings, assets, ledgerTrades] = await Promise.all([
    getUserSnapshots(userId),
    getSettings(userId),
    getAllAssets(userId),
    // Il registro operazioni e' la fonte PREFERITA dei flussi, per asset — vedi portfolioFlows.ts.
    // Vuoto (registro mai aperto) non e' un errore: si ricade tutto sulle Delta-quantita'.
    //
    // Va letto PRIMA del controllo di cache, perche' entra nella chiave: senza, registrare una
    // vendita non invaliderebbe i numeri. E' una query indicizzata in piu' per caricamento, che si
    // sovrappone a quella che la pagina fa gia' con React Query — il prezzo di non servire numeri
    // stantii dopo un'operazione.
    getAssetTransactions(userId).catch((error) => {
      // Degradare in silenzio significherebbe misurare con le sole Delta-quantita' senza che
      // nessuno lo sappia: meno preciso e indistinguibile da un registro vuoto.
      console.warn('Rendimenti: registro operazioni non leggibile, i flussi useranno le sole variazioni di quantità', {
        userId,
        error,
        operation: 'getAllPerformanceData',
      });
      return [];
    }),
  ]);

  // Rendimenti measures the ACTIVELY MANAGED portfolio: pension funds (illiquid, fed by
  // contributions rather than market activity) and non-allocated assets (the home you live in —
  // manually valued, flat for months then a step) are out of every metric below
  // (TWR/Sharpe/volatility/MaxDD/ROI/CAGR). Both exclusions are user-configurable and default to
  // ON — see performanceBase.ts.
  // WARNING: app/dashboard/performance/page.tsx builds the same base for its client-side
  // chart/heatmap/custom-range helpers. Keep the options in sync or a custom period silently
  // disagrees with the pre-computed YTD/1Y/3Y/5Y/ALL metrics.
  const baseOptions = resolvePerformanceBaseOptions(settings);
  const exclusions = resolvePerformanceExclusions(assets, baseOptions);
  const snapshots = toPerformanceBaseSnapshots(rawSnapshots, exclusions);

  // I FLUSSI SEGUONO LA BASE (fix D1, 2026-08-30).
  //
  // La condizione e' `exclusions.length > 0`, cioe' «la base e' davvero un sottoinsieme del
  // patrimonio». Senza esclusioni `toPerformanceBaseSnapshots` restituisce gli snapshot intatti: la
  // base E' il patrimonio, solo il denaro esterno la cambia, e la domanda e' esattamente quella del
  // Cashflow. Cambiare fonte li' sarebbe un peggioramento gratuito per la maggioranza degli account.
  //
  // Con qualcosa fuori base, invece, un trasferimento che attraversa il confine non e' piu' a saldo
  // zero sul capitale misurato — e il Cashflow non puo' vederlo, salta i trasferimenti per
  // costruzione. Nota che la somma per asset si comporta bene anche con la liquidita' DENTRO la
  // base: l'ETF fa +X e il conto -X, e si annullano da soli.
  //
  // I fondi pensione tengono il valore in `quantity` con prezzo 1, quindi una loro Delta-quantita'
  // non distingue un versamento da un rendimento: restano opachi al ramo Delta-quantita'.
  const flowOpaqueAssetIds = assets.filter((a) => a.type === 'pensionFund').map((a) => a.id);
  const portfolioFlows =
    exclusions.length > 0
      ? buildPortfolioCashFlows(snapshots, exclusions, ledgerTrades, flowOpaqueAssetIds)
      : undefined;

  // `??`, not `||`: a deliberate 0% risk-free rate is a legitimate setting (it makes Sharpe the raw
  // return over volatility) and must not be silently replaced by the 2.5% default.
  const riskFreeRate = settings?.riskFreeRate ?? 2.5;
  const dividendCategoryId = settings?.dividendIncomeCategoryId;

  // ==== STEP 2: Check cache before fetching expenses ====
  // The key fingerprints every input the numbers depend on — see buildCacheKey for the full list
  // and for what a stale hit costs. On a hit we skip the expensive whole-history expense fetch.
  const cacheKey = buildCacheKey({ snapshots, baseOptions, riskFreeRate, dividendCategoryId, ledgerTrades });
  if (!forceRefresh) {
    const cached = await readPerformanceCache(userId);
    if (cached && cached.cacheKey === cacheKey) {
      // Expire cache after 6 hours so expense-only changes don't stay stale indefinitely.
      // Snapshot changes still invalidate immediately via cacheKey mismatch.
      const ageMs = Date.now() - cached.cachedAt.toDate().getTime();
      const maxAgeMs = 6 * 60 * 60 * 1000;
      if (ageMs < maxAgeMs) {
        return deserializePerformanceData(cached.data);
      }
    }
  }

  // ==== STEP 3: Pre-fetch all expenses once for entire history ====
  // Single Firestore query, then filtered in-memory for each period calculation.
  const sortedSnapshots = [...snapshots].sort((a, b) => {
    if (a.year !== b.year) return a.year - b.year;
    return a.month - b.month;
  });

  let allExpenses: Expense[] = [];
  if (sortedSnapshots.length > 0) {
    const firstSnapshot = sortedSnapshots[0];
    const lastSnapshot = sortedSnapshots[sortedSnapshots.length - 1];
    const overallStartDate = new Date(firstSnapshot.year, firstSnapshot.month - 1, 1);
    const overallEndDate = endOfMonthBound(lastSnapshot.year, lastSnapshot.month);
    allExpenses = await getExpensesByDateRange(userId, overallStartDate, overallEndDate);
  }

  // ==== STEP 4: Calculate metrics for all time periods ====
  const [ytd, oneYear, threeYear, fiveYear, allTime] = await Promise.all([
    calculatePerformanceForPeriod(userId, snapshots, 'YTD', riskFreeRate, undefined, undefined, allExpenses, dividendCategoryId, portfolioFlows),
    calculatePerformanceForPeriod(userId, snapshots, '1Y', riskFreeRate, undefined, undefined, allExpenses, dividendCategoryId, portfolioFlows),
    calculatePerformanceForPeriod(userId, snapshots, '3Y', riskFreeRate, undefined, undefined, allExpenses, dividendCategoryId, portfolioFlows),
    calculatePerformanceForPeriod(userId, snapshots, '5Y', riskFreeRate, undefined, undefined, allExpenses, dividendCategoryId, portfolioFlows),
    calculatePerformanceForPeriod(userId, snapshots, 'ALL', riskFreeRate, undefined, undefined, allExpenses, dividendCategoryId, portfolioFlows),
  ]);

  // ==== STEP 5: Calculate rolling periods (reuse allExpenses — no extra Firestore queries) ====
  // `portfolioFlows` come per i periodi fissi: stessa base, stessi flussi, una sola risposta.
  const rolling12M = await calculateRollingPeriods(userId, snapshots, 12, riskFreeRate, dividendCategoryId, allExpenses, portfolioFlows);

  const result: PerformanceData = {
    ytd,
    oneYear,
    threeYear,
    fiveYear,
    allTime,
    custom: null,
    rolling12M,
    lastUpdated: new Date(),
    snapshotCount: snapshots.length,
  };

  // Persist to cache so the next page load skips expense fetch when snapshots are unchanged.
  // Fire-and-forget: cache write failure must not break the page.
  void writePerformanceCache(userId, cacheKey, result);

  return result;
}

/**
 * Calculate rolling period performance
 *
 * Calculates performance metrics for sliding windows of fixed length
 * (e.g., 12-month windows sliding through the entire history).
 *
 * Each window follows the SAME convention as the period metrics (see
 * calculatePerformanceForPeriod): the snapshot that opens it is the starting valuation, so the
 * measured months — and the cash flows that belong to them — start the month after it, and the
 * window closes at the last instant of the end month.
 *
 * Uses in-memory filtering of pre-fetched expenses to avoid N Firestore queries.
 *
 * I FLUSSI SEGUONO LA BASE anche qui. Gli snapshot arrivano gia' proiettati sulla base
 * (`toPerformanceBaseSnapshots`), quindi il capitale misurato e' quello giusto; senza
 * `portfolioFlows` pero' i flussi resterebbero quelli del Cashflow, dimensionati sull'intero
 * patrimonio, e ogni finestra sottrarrebbe da un capitale ridotto i versamenti di tutto il
 * patrimonio. E' la stessa coppia capitale/flussi dei cinque periodi fissi — vedi
 * `resolveBaseAwareCashFlows` — e senza di essa le rolling divergono dai numeri delle tessere
 * mostrate sopra, nella stessa pagina.
 *
 * ASSUMPTION: snapshots are monthly and contiguous, so `windowMonths + 1` snapshots span
 * `windowMonths` measured months. It is the same assumption the index arithmetic below already
 * makes; with a hole in the series a window would cover more calendar time than its name says.
 *
 * @param userId - User ID for data fetching
 * @param allSnapshots - All snapshots
 * @param windowMonths - Size of the rolling window in months
 * @param riskFreeRate - Risk-free rate for Sharpe ratio calculation
 * @param dividendCategoryId - Category ID for dividend income (from user settings)
 * @param prefetchedExpenses - Spese gia' lette, per evitare una query per finestra
 * @param portfolioFlows - I flussi per asset di `buildPortfolioCashFlows`, o `undefined` quando la
 *   base e' tutto il patrimonio (nessuna esclusione) e il Cashflow e' la fonte giusta
 * @returns Array of rolling period performance data
 */
export async function calculateRollingPeriods(
  userId: string,
  allSnapshots: MonthlySnapshot[],
  windowMonths: number,
  riskFreeRate: number,
  dividendCategoryId?: string,
  prefetchedExpenses?: Expense[],
  portfolioFlows?: CashFlowData[]
): Promise<RollingPeriodPerformance[]> {
  const sortedSnapshots = [...allSnapshots]
    .sort((a, b) => {
      if (a.year !== b.year) return a.year - b.year;
      return a.month - b.month;
    });

  if (sortedSnapshots.length < windowMonths + 1) {
    return [];
  }

  const firstSnapshot = sortedSnapshots[0];
  const lastSnapshot = sortedSnapshots[sortedSnapshots.length - 1];
  const overallStartDate = new Date(firstSnapshot.year, firstSnapshot.month - 1, 1);
  const overallEndDate = endOfMonthBound(lastSnapshot.year, lastSnapshot.month);

  // Reuse caller-supplied expenses to avoid a redundant Firestore query
  const allExpenses = prefetchedExpenses ?? await getExpensesByDateRange(userId, overallStartDate, overallEndDate);

  const rollingPeriods: RollingPeriodPerformance[] = [];

  for (let i = windowMonths; i < sortedSnapshots.length; i++) {
    const endSnapshot = sortedSnapshots[i];
    const valuationSnapshot = sortedSnapshots[i - windowMonths];

    // The window opens the month AFTER the starting valuation — that snapshot's own month is
    // already inside its value, so counting its cash flows again would subtract them twice — and
    // closes at the LAST INSTANT of the end month: bounded at midnight on the 1st, the filter in
    // getCashFlowsFromExpenses (`date <= endDate`) threw away every movement of the closing month.
    const periodStartDate = new Date(valuationSnapshot.year, valuationSnapshot.month, 1);
    const periodEndDate = endOfMonthBound(endSnapshot.year, endSnapshot.month);

    // Get snapshots and cash flows for this window
    const windowSnapshots = sortedSnapshots.slice(i - windowMonths, i + 1);
    // OPTIMIZATION: Use in-memory filtering instead of Firestore query
    const expenseFlows = getCashFlowsFromExpenses(allExpenses, periodStartDate, periodEndDate, dividendCategoryId);
    // Le date coincidono per costruzione: `buildPortfolioCashFlows` data ogni voce al 1° del mese
    // e `periodStartDate` e' il 1° del mese successivo alla valutazione, la stessa convenzione del
    // ramo per periodo.
    const { cashFlows } = resolveBaseAwareCashFlows(expenseFlows, portfolioFlows, periodStartDate, periodEndDate);

    // Calculate CAGR
    const netCashFlow = cashFlows.reduce((sum, cf) => sum + cf.netCashFlow, 0);
    const cagr = calculateCAGR(
      valuationSnapshot.totalNetWorth,
      endSnapshot.totalNetWorth,
      netCashFlow,
      windowMonths
    );

    // Calculate volatility and Sharpe. windowMonths is passed explicitly so TWR and CAGR annualize
    // over the SAME span — the derived length would be read off the snapshots, and a rolling Sharpe
    // built on one basis while its CAGR sits on another is two answers to one question.
    const volatility = calculateVolatility(windowSnapshots, cashFlows);
    const twr = calculateTimeWeightedReturn(windowSnapshots, cashFlows, windowMonths);
    const sharpeRatio = twr !== null && volatility !== null
      ? calculateSharpeRatio(twr, riskFreeRate, volatility)
      : null;

    rollingPeriods.push({
      periodEndDate,
      periodStartDate,
      // `?? null`, mai `|| 0`: un CAGR non misurabile non e' un rendimento nullo, e uno zero
      // legittimo (la finestra e' finita dov'era partita) e' un rendimento vero da non schiacciare.
      // Sharpe e volatilita' qui sotto sono `null` per lo stesso motivo da sempre.
      cagr: cagr ?? null,
      sharpeRatio,
      volatility,
    });
  }

  return rollingPeriods;
}

/**
 * Prepare chart data for net worth evolution: money you put in, versus what it is worth.
 *
 *   investedBase   — `initialCapital + contributions`: every euro that entered the portfolio by
 *                    that month, drawn as an area. The chart's baseline for "was this me or the
 *                    market?".
 *   netWorth       — what it is actually worth, drawn as a line. The GAP between the two is the
 *                    market's contribution: above the area it gained, below it lost.
 *   initialCapital / contributions / returns — the same decomposition in numbers, for the tooltip.
 *
 * WHY NOT STACKED BANDS. `returns` used to be `netWorth − contributions`, which silently swallowed
 * the whole starting capital: on a portfolio opening the period at 200k the band labelled
 * "Investimenti" started at 200k and read as if the market had produced it (finding A11). The first
 * fix stacked three bands summing to the line — which works only while every band is positive.
 * Cumulative contributions go NEGATIVE whenever tracked spending outpaces tracked income over the
 * window, and a stacked chart renders a negative band downward: the bands stop meeting the line and
 * the picture becomes unreadable. An area plus a line has no such failure mode — a base that dips
 * and a value below it are both drawn honestly.
 *
 * @param skipBaseline - When true, drops the first snapshot: it is the month before the period,
 *   included so the first month's return can be computed but outside what the user selected.
 *   Decide it with `resolveHasBaseline` (lib/utils/performanceBase.ts) — never from the period type,
 *   which is wrong exactly when the history is shorter than the window.
 */
export function preparePerformanceChartData(
  snapshots: MonthlySnapshot[],
  cashFlows: CashFlowData[],
  skipBaseline = false
): PerformanceChartData[] {
  const sortedSnapshots = [...snapshots].sort((a, b) => {
    if (a.year !== b.year) return a.year - b.year;
    return a.month - b.month;
  });

  // Skip the first snapshot when it is a baseline month (e.g., Dec for YTD).
  // getSnapshotsForPeriod includes it for return calculations but it falls
  // outside the selected period and should not appear as a chart data point.
  const chartSnapshots =
    skipBaseline && sortedSnapshots.length > 1
      ? sortedSnapshots.slice(1)
      : sortedSnapshots;

  // The starting valuation is the FIRST snapshot of the window, baseline included: the same value
  // the metrics use as startNW, so the chart and the ROI/TWR cards decompose the same period.
  const initialCapital = sortedSnapshots[0]?.totalNetWorth ?? 0;

  let cumulativeContributions = 0;
  const cashFlowMap = buildCashFlowMap(cashFlows);

  return chartSnapshots.map(snapshot => {
    const cashFlow = cashFlowMap.get(monthKey(snapshot.year, snapshot.month)) || 0;
    cumulativeContributions += cashFlow;

    return {
      date: `${String(snapshot.month).padStart(2, '0')}/${snapshot.year}`,
      netWorth: snapshot.totalNetWorth,
      initialCapital,
      contributions: cumulativeContributions,
      investedBase: initialCapital + cumulativeContributions,
      returns: snapshot.totalNetWorth - initialCapital - cumulativeContributions,
    };
  });
}

/**
 * Prepare monthly returns heatmap data
 * Calculates month-over-month returns adjusted for cash flows
 *
 * Formula: monthlyReturn = ((current NW - cash flow) / previous NW - 1) × 100
 *
 * @param snapshots - Monthly snapshots (will be sorted chronologically)
 * @param cashFlows - Monthly cash flows
 * @returns Array of yearly data with monthly returns
 */
export function prepareMonthlyReturnsHeatmap(
  snapshots: MonthlySnapshot[],
  cashFlows: CashFlowData[]
): MonthlyReturnHeatmapData[] {
  if (snapshots.length < 2) return [];

  // Sort snapshots chronologically
  const sortedSnapshots = [...snapshots].sort((a, b) => {
    if (a.year !== b.year) return a.year - b.year;
    return a.month - b.month;
  });

  const cashFlowMap = buildCashFlowMap(cashFlows);

  // Calculate monthly returns
  const monthlyReturnsMap = new Map<string, number>(); // key: "YYYY-MM", value: return %

  for (let i = 1; i < sortedSnapshots.length; i++) {
    const prevSnapshot = sortedSnapshots[i - 1];
    const currSnapshot = sortedSnapshots[i];

    const startNW = prevSnapshot.totalNetWorth;
    const endNW = currSnapshot.totalNetWorth;

    if (startNW <= 0) continue;

    // Get cash flow for current month
    const cfKey = monthKey(currSnapshot.year, currSnapshot.month);
    const cashFlow = cashFlowMap.get(cfKey) || 0;

    // Calculate monthly return: (End NW - Cash Flow) / Start NW - 1
    const monthlyReturn = ((endNW - cashFlow) / startNW - 1) * 100;

    monthlyReturnsMap.set(cfKey, monthlyReturn);
  }

  // Group by year and organize by month
  const yearMap = new Map<number, Map<number, number | null>>();

  // Initialize years only from months that have a calculated return.
  // This excludes the baseline snapshot (e.g., Dec 2025 for YTD)
  // which is only used as starting value, not displayed in the heatmap
  monthlyReturnsMap.forEach((_, key) => {
    const year = Number(key.split('-')[0]);
    if (!yearMap.has(year)) {
      yearMap.set(year, new Map());
    }
  });

  // Populate monthly returns
  monthlyReturnsMap.forEach((returnValue, key) => {
    const [year, month] = key.split('-').map(Number);
    const yearData = yearMap.get(year);
    if (yearData) {
      yearData.set(month, returnValue);
    }
  });

  // Convert to output format
  const heatmapData: MonthlyReturnHeatmapData[] = [];

  Array.from(yearMap.entries())
    .sort((a, b) => a[0] - b[0]) // Sort by year ascending
    .forEach(([year, monthsMap]) => {
      const months = [];
      for (let month = 1; month <= 12; month++) {
        months.push({
          month,
          return: monthsMap.get(month) ?? null, // null if no data for that month
        });
      }

      heatmapData.push({ year, months });
    });

  return heatmapData;
}

/**
 * Prepare underwater drawdown chart data
 * Shows how far the TWR index is below its running peak at each month.
 *
 * - Value is 0% when portfolio is at all-time high
 * - Value is negative when portfolio is below previous peak
 *
 * Built on the SAME index as Max Drawdown / Duration / Recovery Time (lib/utils/drawdownSeries.ts),
 * which chains the monthly returns of the heatmap — so a point here is the compounding of the
 * heatmap months up to that date, not a separate calculation with its own answer.
 *
 * @param snapshots - Monthly snapshots (will be sorted chronologically)
 * @param cashFlows - Monthly cash flows
 * @param skipBaseline - When true, drops the first snapshot from the output: it is the month before
 *   the period, outside what the user selected. It is still used internally to seed the index at 100
 *   before being excluded. Decide it with `resolveHasBaseline` (lib/utils/performanceBase.ts).
 * @returns Array of underwater drawdown data points
 */
export function prepareUnderwaterDrawdownData(
  snapshots: MonthlySnapshot[],
  cashFlows: CashFlowData[],
  skipBaseline = false
): UnderwaterDrawdownData[] {
  if (snapshots.length < 1) return [];

  // Sort snapshots chronologically
  const sortedSnapshots = [...snapshots].sort((a, b) => {
    if (a.year !== b.year) return a.year - b.year;
    return a.month - b.month;
  });

  const index = buildTwrIndex(sortedSnapshots, cashFlows);
  const drawdowns = computeDrawdownSeries(index);

  return index
    // The baseline month seeds the index at 100 but falls outside the selected period.
    .filter((_, i) => !(skipBaseline && i === 0))
    .map((point, i) => ({
      date: `${String(point.snapshot.month).padStart(2, '0')}/${String(point.snapshot.year).slice(-2)}`,
      drawdown: drawdowns[skipBaseline ? i + 1 : i],
      year: point.snapshot.year,
      month: point.snapshot.month,
    }));
}
