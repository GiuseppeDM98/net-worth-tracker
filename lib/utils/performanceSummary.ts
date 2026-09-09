/**
 * Pure helpers that turn the Rendimenti page's already-computed numbers into the
 * single answers its redesign leads with. Nothing here fetches or touches Firebase;
 * every function is a pure transform over types the page already has in hand, so the
 * unit tests import it without mocking anything.
 *
 * Three questions the old page never answered at a glance:
 *   1. VERDICT (B1) — "am I doing well?" `summarizePerformance` blends TWR-vs-risk-free
 *      and the Sharpe band into one qualitative tone + one line of prose.
 *   2. CONSISTENCY (B2) — "how steady is it?" `computeReturnConsistency` reads the
 *      monthly-returns heatmap for the positive-month share and the best/worst month.
 *   3. DRAWDOWN STATUS (B3) — "where am I vs my peak right now?" `computeDrawdownStatus`
 *      reads the last underwater point.
 *
 * NOTE on B2 vs the Storico page: Storico counts positive/negative MONTHS on net-worth
 * growth (savings included). This counts months of investment RETURN (cash-flow-isolated,
 * the heatmap's own definition). Different question, different number — intentionally.
 */

import type {
  CashFlowData,
  MonthlyReturnHeatmapData,
  PeriodMonth,
  UnderwaterDrawdownData,
} from '@/types/performance';
import type { MonthlySnapshot } from '@/types/assets';
import { buildTwrIndex, findMaxDrawdown, type TwrIndexPoint } from '@/lib/utils/drawdownSeries';
import { annualizeTWR, buildIndexedSeries, type MonthlyReturnPoint } from '@/lib/utils/benchmarkPeriodReturn';

// ---------------------------------------------------------------------------
// B1 — performance verdict
// ---------------------------------------------------------------------------

/** Qualitative tone of the verdict. Maps to a color band in the UI (action colors). */
type PerformanceTone = 'strong' | 'solid' | 'fragile' | 'weak' | 'neutral';

export interface PerformanceVerdict {
  tone: PerformanceTone;
  /** Short headline, e.g. "Solido". */
  headline: string;
  /** One sentence of plain-Italian reasoning. */
  detail: string;
}

// Sharpe interpretation bands (standard finance reading, matches the metric tooltip).
const SHARPE_GOOD = 1;
const SHARPE_EXCELLENT = 2;

/**
 * Blend return-above-risk-free with the Sharpe band into a single verdict.
 *
 * The logic is deliberately simple and explainable (no magic weights): the SIGN of the
 * excess return over the risk-free rate sets the basic direction (are you beating cash?),
 * and the Sharpe band refines it (is that return worth the risk taken?). When Sharpe is
 * unavailable (too few months for volatility) we fall back to the excess-return sign.
 */
export function summarizePerformance(params: {
  timeWeightedReturn: number | null;
  sharpeRatio: number | null;
  riskFreeRate: number;
}): PerformanceVerdict {
  const { timeWeightedReturn: twr, sharpeRatio: sharpe, riskFreeRate } = params;

  if (twr === null) {
    return {
      tone: 'neutral',
      headline: 'Dati insufficienti',
      detail: 'Servono più mesi di storico per esprimere un giudizio sul rendimento.',
    };
  }

  const beatsRiskFree = twr > riskFreeRate;
  const isPositive = twr > 0;

  // With a Sharpe ratio we can speak about risk-adjusted quality, not just direction.
  if (sharpe !== null) {
    if (sharpe >= SHARPE_EXCELLENT && beatsRiskFree) {
      return {
        tone: 'strong',
        headline: 'Eccellente',
        detail: 'Rendimento ben sopra il tasso privo di rischio e ottimo equilibrio rischio-rendimento.',
      };
    }
    if (sharpe >= SHARPE_GOOD && beatsRiskFree) {
      return {
        tone: 'solid',
        headline: 'Solido',
        detail: 'Il rendimento supera il tasso privo di rischio con un buon rapporto rischio-rendimento.',
      };
    }
    if (isPositive && sharpe >= 0) {
      return {
        tone: 'fragile',
        headline: 'Fragile',
        detail: 'Il rendimento è positivo ma il rischio assunto è alto rispetto a quanto rende.',
      };
    }
    return {
      tone: 'weak',
      headline: 'Debole',
      detail: 'Il rendimento non compensa il rischio: sotto il tasso privo di rischio per unità di rischio.',
    };
  }

  // No Sharpe — judge on direction vs risk-free only.
  if (beatsRiskFree) {
    return {
      tone: 'solid',
      headline: 'Positivo',
      detail: 'Il rendimento supera il tasso privo di rischio nel periodo selezionato.',
    };
  }
  if (isPositive) {
    return {
      tone: 'fragile',
      headline: 'Modesto',
      detail: 'Rendimento positivo ma sotto il tasso privo di rischio del periodo.',
    };
  }
  return {
    tone: 'weak',
    headline: 'Negativo',
    detail: 'Il portafoglio ha perso valore nel periodo, al netto dei contributi.',
  };
}

// ---------------------------------------------------------------------------
// A7 — what the hero number actually is on a short period
// ---------------------------------------------------------------------------

/**
 * Below this many months the hero shows the PERIOD return instead of the annualized one.
 *
 * Annualizing extrapolates: +4% over two months becomes "+26% a year", a forecast dressed as a
 * measurement, and two months of a portfolio say nothing about a year of it. Six months is where
 * the extrapolation stops dominating the number. Above it, annualized stays — it is what makes
 * periods and benchmarks comparable.
 */
const MIN_MONTHS_FOR_ANNUALIZATION = 6;

export interface HeroReturn {
  /** The figure to display, already in percent. */
  value: number | null;
  /** true when `value` is the plain period return because the window is too short to annualize. */
  isPeriodReturn: boolean;
  /** Qualifier to print next to the number, so it is never ambiguous which one it is. */
  label: string;
}

/**
 * The ONE de-annualisation of the page: `(1 + annual)^(months/12) − 1`, the exact inverse of the
 * annualisation the TWR already applied, so no information is invented — the cumulative return
 * the portfolio actually produced over the period is recovered. The hero below six months, the
 * period-return chip and the narrative's benchmark gap all take this step; a second copy of the
 * formula is how two figures of the same page drift apart.
 */
export function deannualizeReturn(annualizedPct: number, numberOfMonths: number): number {
  return (Math.pow(1 + annualizedPct / 100, numberOfMonths / 12) - 1) * 100;
}

/**
 * Decide whether the hero states an annualized rate or the return of the period itself.
 *
 * Only the DISPLAYED number changes. The verdict and the benchmark delta keep using the annualized
 * TWR, because comparing to a risk-free rate or to a benchmark is only meaningful per year.
 *
 * @param annualizedReturn - TWR as computed by the service (annualized), or null
 * @param numberOfMonths - Length of the measured period
 */
export function resolveHeroReturn(
  annualizedReturn: number | null,
  numberOfMonths: number
): HeroReturn {
  if (annualizedReturn === null) {
    return { value: null, isPeriodReturn: false, label: 'annualizzato' };
  }

  if (numberOfMonths >= MIN_MONTHS_FOR_ANNUALIZATION) {
    return { value: annualizedReturn, isPeriodReturn: false, label: 'annualizzato' };
  }

  const periodReturn = deannualizeReturn(annualizedReturn, numberOfMonths);
  return {
    value: isFinite(periodReturn) ? periodReturn : null,
    isPeriodReturn: true,
    label: numberOfMonths === 1 ? 'nel mese' : `nei ${numberOfMonths} mesi`,
  };
}

export interface PeriodReturnChip {
  /** The cumulative TWR of the period, in percent. */
  value: number;
  /** «cumulato in 9 mesi» — the qualifier under the chip. */
  label: string;
}

/**
 * The second chip of the Rendimento tile: the return the portfolio produced over the WHOLE period,
 * cumulative, beside the annualised hero. Until 2026-09-07 that chip printed the ROI under the
 * caption «ROI del periodo» — a gain divided by the FIRST month's capital, which is not the
 * period's return and grows with the window on a saver's account (+126% against a +134%
 * cumulative TWR on the real account, +73% against +30% on another). `null` when the hero is
 * already the period return (below six months, One-Tile-One-Question), when there is nothing to
 * de-annualise, or over exactly twelve months, where the two figures coincide.
 */
export function resolvePeriodReturnChip(
  annualizedReturn: number | null,
  numberOfMonths: number,
  heroReturn: Pick<HeroReturn, 'isPeriodReturn'>
): PeriodReturnChip | null {
  if (annualizedReturn === null || heroReturn.isPeriodReturn || numberOfMonths <= 0 || numberOfMonths === 12) return null;
  const value = deannualizeReturn(annualizedReturn, numberOfMonths);
  if (!isFinite(value)) return null;
  return { value, label: `cumulato in ${numberOfMonths} mesi` };
}

/**
 * Signed gap between the portfolio's annualized TWR and a reference benchmark's
 * annualized return, in percentage points. Null when either side is missing.
 * Positive = the portfolio is beating the benchmark.
 */
export function computeBenchmarkDelta(
  portfolioTWR: number | null,
  benchmarkAnnualized: number | null
): number | null {
  if (portfolioTWR === null || benchmarkAnnualized === null) return null;
  return portfolioTWR - benchmarkAnnualized;
}

// ---------------------------------------------------------------------------
// B2 — return consistency (from the monthly-returns heatmap)
// ---------------------------------------------------------------------------

/**
 * Below this many months the positive-month SHARE is not reported.
 *
 * A proportion computed on one or two observations can only come out 0, 50 or 100: it looks like a
 * statistic and reads like one ("100% di mesi positivi"), while carrying no more information than
 * the raw count already shown next to it. The counts stay — they are facts — only the percentage,
 * which is the part that invites over-reading, goes away. Same reasoning as the volatility floor in
 * performanceService.ts, and the same threshold.
 */
const MIN_MONTHS_FOR_POSITIVE_SHARE = 3;

/** One month of the consistency reading: the short label the strip prints, the calendar month the narrative names. */
export interface ConsistencyMonth {
  label: string;
  year: number;
  month: number;
  return: number;
}

export interface ReturnConsistency {
  positiveMonths: number;
  totalMonths: number;
  /** Share of months with a positive return, 0–100. Null on a sample too small to express one. */
  positiveShare: number | null;
  best: ConsistencyMonth | null;
  worst: ConsistencyMonth | null;
}

const MONTH_ABBR = [
  'Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu',
  'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic',
];

/** Format a year+month (1-12) as "Mag 25" for the best/worst labels. */
function formatMonthLabel(year: number, month: number): string {
  const abbr = MONTH_ABBR[month - 1] ?? String(month);
  return `${abbr} ${String(year).slice(-2)}`;
}

/**
 * Read the monthly-returns heatmap for steadiness signals: how many months were
 * positive, and the single best and worst month. A flat month (return exactly 0) is
 * counted as non-positive — it neither grew nor lost. Months with no data are skipped.
 *
 * `positiveShare` is null below MIN_MONTHS_FOR_POSITIVE_SHARE months; `best` and `worst` are the
 * SAME month when there is only one, which the caller should render once rather than twice.
 */
export function computeReturnConsistency(
  heatmap: MonthlyReturnHeatmapData[]
): ReturnConsistency {
  let positiveMonths = 0;
  let totalMonths = 0;
  let best: ConsistencyMonth | null = null;
  let worst: ConsistencyMonth | null = null;

  for (const yearRow of heatmap) {
    for (const m of yearRow.months) {
      if (m.return === null) continue;
      totalMonths += 1;
      if (m.return > 0) positiveMonths += 1;
      const entry: ConsistencyMonth = { label: formatMonthLabel(yearRow.year, m.month), year: yearRow.year, month: m.month, return: m.return };
      if (!best || m.return > best.return) best = entry;
      if (!worst || m.return < worst.return) worst = entry;
    }
  }

  return {
    positiveMonths,
    totalMonths,
    positiveShare:
      totalMonths >= MIN_MONTHS_FOR_POSITIVE_SHARE ? (positiveMonths / totalMonths) * 100 : null,
    best,
    worst,
  };
}

// ---------------------------------------------------------------------------
// B3 — current drawdown status (from the underwater series)
// ---------------------------------------------------------------------------

export interface DrawdownStatus {
  /** true when the latest point is at a fresh high for the selected period (drawdown ~0). */
  atPeak: boolean;
  /** Current distance below the peak, as a non-positive percentage (e.g. -3.2). */
  current: number;
}

// Drawdowns shallower than this read as "at the peak" — floating-point noise and
// sub-tenth-of-a-percent dips are not a meaningful distance from the high.
const AT_PEAK_THRESHOLD = 0.05;

/**
 * Current position versus the all-time high, read from the LAST underwater point.
 * Returns null for an empty series (no snapshots to judge).
 */
export function computeDrawdownStatus(
  underwater: UnderwaterDrawdownData[]
): DrawdownStatus | null {
  if (underwater.length === 0) return null;
  const current = underwater[underwater.length - 1].drawdown;
  return { atPeak: Math.abs(current) < AT_PEAK_THRESHOLD, current };
}

// ---------------------------------------------------------------------------
// The tiles (2026-08-25) — every number a tile shows that the payload did not carry
// ---------------------------------------------------------------------------

/**
 * The heatmap as a sorted decimal series — the ONE bridge from the page's percent months to
 * the growth-of-100 and the risk ratios. It used to live inside BenchmarkComparisonChart, which
 * meant a second copy for every surface that needed it.
 */
export function flattenHeatmapReturns(heatmap: MonthlyReturnHeatmapData[]): MonthlyReturnPoint[] {
  const flat: MonthlyReturnPoint[] = [];
  for (const yearRow of heatmap) {
    for (const m of yearRow.months) {
      if (m.return === null) continue;
      flat.push({ year: yearRow.year, month: m.month, return: m.return / 100 });
    }
  }
  return flat.sort((a, b) => (a.year !== b.year ? a.year - b.year : a.month - b.month));
}

/**
 * Same floor as `calculateVolatility` in performanceService.ts: below three monthly returns a
 * deviation is noise dressed as a statistic, and the Sortino built on it inherits that.
 */
const MIN_RETURNS_FOR_DEVIATION = 3;

/**
 * Annualised downside deviation (%) of monthly returns in PERCENT, with 0 as the minimum
 * acceptable return: only the negative months contribute, squared, over ALL the months.
 * No outlier filter — the same rule as volatility (a real crash is what this must report).
 */
export function computeDownsideDeviation(monthlyReturnsPct: number[]): number | null {
  if (monthlyReturnsPct.length < MIN_RETURNS_FOR_DEVIATION) return null;
  const meanSquared =
    monthlyReturnsPct.reduce((sum, r) => sum + Math.pow(Math.min(r, 0), 2), 0) / monthlyReturnsPct.length;
  return Math.sqrt(meanSquared) * Math.sqrt(12);
}

/**
 * Sortino = (annualised TWR − risk-free) / downside deviation. Null below the floor, without an
 * annualised return, or when no month was negative — a zero denominator is not an infinite ratio.
 */
export function computeSortinoRatio(
  heatmap: MonthlyReturnHeatmapData[],
  annualizedReturn: number | null,
  riskFreeRate: number
): number | null {
  if (annualizedReturn === null) return null;
  const returnsPct = flattenHeatmapReturns(heatmap).map((p) => p.return * 100);
  const downside = computeDownsideDeviation(returnsPct);
  if (downside === null || downside === 0) return null;
  return (annualizedReturn - riskFreeRate) / downside;
}

/** The deepest drawdown of the period, told in calendar months. */
export interface DrawdownStory {
  /** Negative percent, e.g. −4.1. */
  value: number;
  peak: PeriodMonth;
  trough: PeriodMonth;
  /** First month back at the peak's level; null while still underwater. */
  recovery: PeriodMonth | null;
  /** Trough → recovery, in months; null while still underwater. */
  monthsToRecover: number | null;
  /** Peak → recovery, or peak → last snapshot while still underwater. */
  durationMonths: number;
}

function monthOf(point: TwrIndexPoint): PeriodMonth {
  return { year: point.snapshot.year, month: point.snapshot.month };
}

/**
 * The verdict's drawdown clause — «−4,1% a marzo, recuperato in 2 mesi» — from the SAME TWR index
 * the heatmap and the Underwater chart draw (`drawdownSeries.ts`), so the months are exact. The
 * payload only carries the story as 'MM/YY - Presente' strings; this reads the structure instead.
 * Null when the portfolio never fell below a peak, or with fewer than two snapshots.
 */
export function resolveDrawdownStory(
  periodSnapshots: MonthlySnapshot[],
  cashFlows: CashFlowData[]
): DrawdownStory | null {
  const index = buildTwrIndex(periodSnapshots, cashFlows);
  if (index.length < 2) return null;
  const dd = findMaxDrawdown(index);
  // A dip shallower than the at-peak threshold is floating-point noise, not a story to tell.
  if (dd.value > -AT_PEAK_THRESHOLD) return null;
  const peak = monthOf(index[dd.peakIndex]);
  const trough = monthOf(index[dd.troughIndex]);
  const recovery = dd.recoveryIndex === null ? null : monthOf(index[dd.recoveryIndex]);
  // Calendar months, not index steps: a missing snapshot must not shorten «recuperato in N mesi».
  return {
    value: dd.value,
    peak,
    trough,
    recovery,
    monthsToRecover: recovery === null ? null : monthSpan(trough, recovery),
    durationMonths: monthSpan(peak, recovery ?? monthOf(index[index.length - 1])),
  };
}

/** Calendar months from `a` to `b` (Jan → Mar = 2). */
export function monthSpan(a: PeriodMonth, b: PeriodMonth): number {
  return (b.year - a.year) * 12 + (b.month - a.month);
}

export interface GrowthPoint {
  year: number;
  month: number;
  portfolio: number;
  /** Null where the benchmark has no month yet (the running month, a series that ends earlier). */
  benchmark: number | null;
}

export interface GrowthOfHundredSeries {
  /** The month the base 100 sits on — the snapshot before the first measured month. */
  baseMonth: PeriodMonth | null;
  /** The base point first, then one point per measured month. */
  points: GrowthPoint[];
  portfolioEnd: number | null;
  /** The benchmark's OWN last available month, not the portfolio's. */
  benchmarkEnd: number | null;
}

function previousMonth(startDate: Date): PeriodMonth {
  const month = startDate.getMonth() + 1;
  return month === 1 ? { year: startDate.getFullYear() - 1, month: 12 } : { year: startDate.getFullYear(), month: month - 1 };
}

/**
 * The Rendimento tile's chart: the portfolio and the reference benchmark compounded from 100 over
 * the measured window, through the same `buildIndexedSeries` the ranking uses. Both series carry
 * an explicit base point, because a chart that starts at 100 × (1 + r₁) hides the first month.
 */
export function buildGrowthOfHundred(input: {
  heatmap: MonthlyReturnHeatmapData[];
  /** Already in the portfolio's currency (EUR-converted); null while loading or unavailable. */
  benchmarkReturns: MonthlyReturnPoint[] | null;
  startDate: Date;
  endDate: Date;
}): GrowthOfHundredSeries {
  const portfolio = buildIndexedSeries(flattenHeatmapReturns(input.heatmap), input.startDate, input.endDate);
  if (portfolio.length === 0) return { baseMonth: null, points: [], portfolioEnd: null, benchmarkEnd: null };

  const benchmark = input.benchmarkReturns ? buildIndexedSeries(input.benchmarkReturns, input.startDate, input.endDate) : [];
  const benchmarkByKey = new Map(benchmark.map((p) => [`${p.year}-${p.month}`, p.indexed]));
  const baseMonth = previousMonth(input.startDate);

  const points: GrowthPoint[] = [
    { ...baseMonth, portfolio: 100, benchmark: benchmark.length > 0 ? 100 : null },
    ...portfolio.map((p) => ({ year: p.year, month: p.month, portfolio: p.indexed, benchmark: benchmarkByKey.get(`${p.year}-${p.month}`) ?? null })),
  ];

  return {
    baseMonth,
    points,
    portfolioEnd: portfolio[portfolio.length - 1].indexed,
    benchmarkEnd: benchmark.length > 0 ? benchmark[benchmark.length - 1].indexed : null,
  };
}

export interface BenchmarkRankingRow {
  id: string;
  name: string;
  /** Annualised return (%) over the period, on the model's own last available month. */
  annualized: number | null;
  /** Portfolio minus model, in percentage points; null without either side. */
  delta: number | null;
  lastMonth: PeriodMonth | null;
}

export interface BenchmarkRanking {
  /** Best return first; models without data last, in the order given. */
  rows: BenchmarkRankingRow[];
  /** Models the portfolio beats by at least a printed tenth of a point. */
  beaten: number;
  /** Models within a tenth of a point of the portfolio — «alla pari», neither beaten nor above. */
  tied: number;
  /** Models with a return at all. */
  measured: number;
}

/** A gap as the reader sees it, one decimal: below 0,05 it prints as 0,0 and reads as a tie. */
export function printedGap(delta: number): number {
  return Math.round(delta * 10) / 10;
}

/**
 * The Benchmark tile: every model portfolio annualised over the SAME window as the portfolio TWR
 * (`annualizeTWR` with the page's `numberOfMonths`), measured up to each model's own last month.
 * A model whose series is not loaded keeps its row with nulls, so the table never shrinks.
 */
export function computeBenchmarkRanking(input: {
  portfolioTWR: number | null;
  numberOfMonths: number;
  startDate: Date;
  endDate: Date;
  benchmarks: Array<{ id: string; name: string }>;
  /** Series already in the portfolio's currency; undefined while a model is loading. */
  returnsById: Record<string, MonthlyReturnPoint[] | undefined>;
}): BenchmarkRanking {
  const rows: BenchmarkRankingRow[] = input.benchmarks.map((b) => {
    const returns = input.returnsById[b.id];
    const indexed = returns ? buildIndexedSeries(returns, input.startDate, input.endDate) : [];
    if (indexed.length === 0) return { id: b.id, name: b.name, annualized: null, delta: null, lastMonth: null };
    const last = indexed[indexed.length - 1];
    const annualized = annualizeTWR(last.indexed, input.numberOfMonths);
    return {
      id: b.id,
      name: b.name,
      annualized,
      delta: computeBenchmarkDelta(input.portfolioTWR, annualized),
      lastMonth: { year: last.year, month: last.month },
    };
  });

  rows.sort((a, b) => {
    if (a.annualized === null && b.annualized === null) return 0;
    if (a.annualized === null) return 1;
    if (b.annualized === null) return -1;
    return b.annualized - a.annualized;
  });

  const measuredRows = rows.filter((r) => r.annualized !== null);
  const compared = input.portfolioTWR === null ? [] : measuredRows.filter((r) => r.delta !== null);
  return {
    rows,
    measured: measuredRows.length,
    beaten: compared.filter((r) => printedGap(r.delta as number) > 0).length,
    tied: compared.filter((r) => printedGap(r.delta as number) === 0).length,
  };
}

export interface RealizedGainsSummary {
  total: number;
  /** Newest fiscal year first. */
  years: Array<{ year: number; amount: number }>;
}

/** The Plusvalenze tile's rows, newest year first, with their total. Null without a closed sale. */
export function summarizeRealizedGains(byYear: Record<number, number>): RealizedGainsSummary | null {
  const years = Object.keys(byYear)
    .map(Number)
    .sort((a, b) => b - a)
    .map((year) => ({ year, amount: byYear[year] }));
  if (years.length === 0) return null;
  return { total: years.reduce((sum, y) => sum + y.amount, 0), years };
}
