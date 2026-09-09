/**
 * Dividend analytics pure utilities
 *
 * All the in-memory derivation behind the redesigned "Dividendi & Cedole" tab lives
 * here, free of React, Firestore and the DOM, so it can be unit-tested in isolation.
 * The tab fetches the full dividend list once and derives every period view from it,
 * exactly like the Cost Centers Panoramica — switching period is instant and needs no
 * refetch.
 *
 * MONEY:
 * Every figure is in EUR. We always prefer the converted *Eur fields (populated for
 * non-EUR dividends via Frankfurter) and fall back to the native amount for legacy or
 * already-EUR records. A dividend is "paid" once its payment date has passed; future
 * payment dates are "upcoming" (announced but not yet cashed).
 *
 * TIMEZONE:
 * Calendar boundaries are computed in Italy time via dateHelpers, so a coupon paid late
 * on 31/12 in Italy lands in the right month/year regardless of the server's UTC offset.
 * Every function accepts an explicit `now` for deterministic tests.
 */

import { format } from 'date-fns';
import { it } from 'date-fns/locale';
import { Dividend, DividendStatsPayload, DividendType } from '@/types/dividend';
import { toDate, getItalyMonth, getItalyYear } from '@/lib/utils/dateHelpers';

// The period axis driving every figure on the tab. Mirrors the Cost Centers axis;
// "year" is the current calendar year (Jan 1 → now), which for a calendar-based tracker
// is the same as year-to-date — so we deliberately don't carry a separate YTD option.
export type DividendPeriod = 'month' | 'year' | 'rolling12' | 'all';

// ==================== Money helpers ====================

/** Net dividend in EUR (converted field when present, native amount otherwise). */
export function netEur(d: Dividend): number {
  return d.netAmountEur ?? d.netAmount;
}

/** Gross dividend in EUR. */
export function grossEur(d: Dividend): number {
  return d.grossAmountEur ?? d.grossAmount;
}

/** Withholding tax in EUR. */
export function taxEur(d: Dividend): number {
  return d.taxAmountEur ?? d.taxAmount;
}

/** A dividend is paid once its payment date is on or before `now`. */
export function isPaid(d: Dividend, now: Date): boolean {
  return toDate(d.paymentDate) <= now;
}

// ==================== Period filtering ====================

/** A {year, month} pair (month 1-based) used as an ordered month key. */
interface YearMonth {
  year: number;
  month: number;
}

function toYearMonth(date: Date): YearMonth {
  return { year: getItalyYear(date), month: getItalyMonth(date) };
}

/** Subtract `count` whole months from a {year, month} pair (month 1-based). */
function subtractMonths({ year, month }: YearMonth, count: number): YearMonth {
  const zeroBased = month - 1 - count;
  const y = year + Math.floor(zeroBased / 12);
  const m = ((zeroBased % 12) + 12) % 12;
  return { year: y, month: m + 1 };
}

function isOnOrAfter(a: YearMonth, b: YearMonth): boolean {
  return a.year !== b.year ? a.year > b.year : a.month >= b.month;
}

/** A noon Date that lands inside the given {year, month} regardless of timezone. */
function noonOf({ year, month }: YearMonth): Date {
  return new Date(year, month - 1, 15, 12, 0, 0);
}

/**
 * Returns the paid dividends whose payment date falls inside the given period window,
 * measured in Italy time relative to `now`. We filter on payment date (when the money
 * arrives) because that is what the user cares about for an income view.
 *
 * - month: the current calendar month
 * - year: the current calendar year (Jan 1 → now)
 * - rolling12: the trailing 12 calendar months, current month included
 * - all: every paid dividend
 */
/** The month bounds of a period, inclusive. `null` means unbounded on that side ("all"). */
export interface PeriodBounds {
  from: YearMonth | null;
  to: YearMonth | null;
}

/**
 * The calendar window a period stands for, upper bound INCLUDED — and the upper bound is the
 * end of the period's own unit, not today.
 *
 * That distinction is the whole point: a payment announced for the 28th is genuinely "of this
 * month" and belongs in the month's list, while one announced for 2032 is not, and used to show
 * up there because announced rows carried no upper bound at all. Every figure that counts INCOME
 * still gates on `isPaid` as well — the bounds decide what belongs to the period, `isPaid`
 * decides what has actually arrived.
 */
export function resolvePeriodBounds(period: DividendPeriod, now: Date = new Date()): PeriodBounds {
  const current = toYearMonth(now);
  switch (period) {
    case 'month':
      return { from: current, to: current };
    case 'year':
      return { from: { year: current.year, month: 1 }, to: { year: current.year, month: 12 } };
    case 'rolling12':
      return { from: subtractMonths(current, 11), to: current };
    case 'all':
      return { from: null, to: null };
  }
}

/** Whether a payment date falls inside the period's calendar window. */
function isInPeriodWindow(date: Date, bounds: PeriodBounds): boolean {
  const ym = toYearMonth(date);
  if (bounds.from && !isOnOrAfter(ym, bounds.from)) return false;
  if (bounds.to && !isOnOrAfter(bounds.to, ym)) return false;
  return true;
}

export function filterPaidByPeriod(
  dividends: Dividend[],
  period: DividendPeriod,
  now: Date = new Date(),
): Dividend[] {
  const bounds = resolvePeriodBounds(period, now);
  // A paid dividend is by definition on or before today, so the upper bound never excludes one:
  // this is the same set the four hand-written branches used to produce.
  return dividends.filter((d) => isPaid(d, now) && isInPeriodWindow(toDate(d.paymentDate), bounds));
}

/**
 * Number of calendar months spanned by the period window, used as the denominator for
 * the monthly average and the income-coverage ratio. For "all" it spans from the first
 * paid dividend to now.
 */
export function monthsInWindow(
  period: DividendPeriod,
  paidDividends: Dividend[],
  now: Date,
): number {
  switch (period) {
    case 'month':
      return 1;
    case 'year':
      return getItalyMonth(now); // months elapsed this year (1-based)
    case 'rolling12':
      return 12;
    case 'all': {
      if (paidDividends.length === 0) return 1;
      const first = paidDividends.reduce(
        (min, d) => (toDate(d.paymentDate) < min ? toDate(d.paymentDate) : min),
        toDate(paidDividends[0].paymentDate),
      );
      const a = toYearMonth(first);
      const b = toYearMonth(now);
      return Math.max(1, (b.year - a.year) * 12 + (b.month - a.month) + 1);
    }
  }
}

// ==================== Period summary (hero + KPI grid) ====================

export interface DividendPeriodSummary {
  net: number;
  gross: number;
  tax: number;
  count: number;
  // Net divided by the calendar months in the window — a true monthly average, so a
  // lumpy semi-annual payer reads as the modest monthly income it really is.
  averageMonthlyNet: number;
}

/**
 * Aggregate net / gross / tax for the paid dividends in the period — the figures behind
 * the hero number and the KPI chip grid.
 */
export function computePeriodSummary(
  dividends: Dividend[],
  period: DividendPeriod,
  now: Date = new Date(),
): DividendPeriodSummary {
  const scoped = filterPaidByPeriod(dividends, period, now);
  const net = scoped.reduce((sum, d) => sum + netEur(d), 0);
  const gross = scoped.reduce((sum, d) => sum + grossEur(d), 0);
  const tax = scoped.reduce((sum, d) => sum + taxEur(d), 0);
  return {
    net,
    gross,
    tax,
    count: scoped.length,
    averageMonthlyNet: net / monthsInWindow(period, scoped, now),
  };
}

export interface DividendNetComparison {
  current: number;
  previous: number;
  // Signed fraction (e.g. 0.2 = +20%). null when there is no comparable predecessor
  // (the "all" period) or the previous window had zero income.
  deltaPct: number | null;
}

/**
 * Compares the current period's net income against the immediately preceding comparable
 * window: previous month, previous year, or the 12 months before the trailing year.
 * Drives the variation chip under the hero. "all" has no predecessor → deltaPct null.
 */
export function computeNetComparison(
  dividends: Dividend[],
  period: DividendPeriod,
  now: Date = new Date(),
): DividendNetComparison {
  const net = (list: Dividend[]) => list.reduce((sum, d) => sum + netEur(d), 0);
  const current = net(filterPaidByPeriod(dividends, period, now));

  if (period === 'all') return { current, previous: 0, deltaPct: null };

  const shift = period === 'month' ? 1 : 12;
  const prevNow = noonOf(subtractMonths(toYearMonth(now), shift));
  const previous = net(filterPaidByPeriod(dividends, period, prevNow));

  const deltaPct = previous > 0 ? (current - previous) / previous : null;
  return { current, previous, deltaPct };
}

// ==================== Payer ranking (leaderboard) ====================

export interface PayerRow {
  assetId: string;
  assetTicker: string;
  assetName: string;
  net: number;
  count: number;
}

/**
 * The period's payers folded by asset and sorted by net, descending. Private: every surface
 * goes through `rankPayerShares`, which adds the residual row the tiles need — two rankings
 * of the same thing would drift.
 */
function rankPayersRaw(
  dividends: Dividend[],
  period: DividendPeriod,
  now: Date = new Date(),
): PayerRow[] {
  const scoped = filterPaidByPeriod(dividends, period, now);

  const byAsset = new Map<string, PayerRow>();
  for (const d of scoped) {
    const row = byAsset.get(d.assetId) ?? {
      assetId: d.assetId,
      assetTicker: d.assetTicker,
      assetName: d.assetName,
      net: 0,
      count: 0,
    };
    row.net += netEur(d);
    row.count += 1;
    byAsset.set(d.assetId, row);
  }

  return [...byAsset.values()].sort((a, b) => b.net - a.net);
}

// ==================== Time series (sparkline + charts) ====================

/** Enumerate a gap-free, inclusive month axis from `start` to `end`. */
function enumerateMonths(start: YearMonth, end: YearMonth): YearMonth[] {
  const months: YearMonth[] = [];
  let cursor = start;
  while (isOnOrAfter(end, cursor)) {
    months.push(cursor);
    cursor = subtractMonths(cursor, -1); // add one month
  }
  return months;
}

function monthLabel(year: number, month: number): string {
  return format(new Date(year, month - 1, 1), 'MMM yy', { locale: it });
}

/** "gen" — the axis label of an in-tile bar chart, where the year is stated once above it. */
function shortMonthLabel(month: number): string {
  return format(new Date(2000, month - 1, 1), 'MMM', { locale: it });
}

export interface MonthlyNetPoint {
  /** "gen 26" — names the point unambiguously in a tooltip or an aria-label. */
  label: string;
  /** "gen" — the axis label under an in-tile bar. */
  shortLabel: string;
  year: number;
  month: number;
  net: number;
}

export interface YearlyNetPoint {
  year: number;
  gross: number;
  tax: number;
  net: number;
}

/**
 * Net / gross / tax grouped by calendar year of payment, oldest → newest. Feeds the
 * "Dividendi per anno" bar chart.
 */
export function buildYearlySeries(
  dividends: Dividend[],
  now: Date = new Date(),
): YearlyNetPoint[] {
  const paid = dividends.filter((d) => isPaid(d, now));
  const byYear = new Map<number, YearlyNetPoint>();
  for (const d of paid) {
    const year = getItalyYear(toDate(d.paymentDate));
    const entry = byYear.get(year) ?? { year, gross: 0, tax: 0, net: 0 };
    entry.gross += grossEur(d);
    entry.tax += taxEur(d);
    entry.net += netEur(d);
    byYear.set(year, entry);
  }
  return [...byYear.values()].sort((a, b) => a.year - b.year);
}

// ==================== Reliability (B2) ====================

export interface DividendReliability {
  // How many distinct calendar months in the window actually had income.
  monthsWithIncome: number;
  monthsInWindow: number;
  // monthsWithIncome / monthsInWindow — how "smooth" the income stream is (0..1).
  coveragePct: number;
  // Largest single payer's share of the window's net income (0..1).
  topPayerSharePct: number;
  topPayerTicker: string | null;
  // Herfindahl-Hirschman index over payer shares (0..1). 1 = a single payer; lower =
  // more diversified. A blunt but honest concentration signal for an income stream.
  concentrationHhi: number;
  payerCount: number;
}

/**
 * Derives two risk signals for the income stream over the period (B2):
 * smoothness (how many months actually paid) and concentration (how dependent the
 * income is on one or two payers). Both are latent in the data but never surfaced today.
 */
export function computeReliability(
  dividends: Dividend[],
  period: DividendPeriod,
  now: Date = new Date(),
): DividendReliability {
  const scoped = filterPaidByPeriod(dividends, period, now);
  const totalMonths = monthsInWindow(period, scoped, now);

  // Distinct paid months in the window.
  const paidMonths = new Set<string>();
  // Net per payer, for concentration.
  const netByAsset = new Map<string, { ticker: string; net: number }>();
  let totalNet = 0;

  for (const d of scoped) {
    const ym = toYearMonth(toDate(d.paymentDate));
    paidMonths.add(`${ym.year}-${ym.month}`);

    const net = netEur(d);
    totalNet += net;
    const entry = netByAsset.get(d.assetId) ?? { ticker: d.assetTicker, net: 0 };
    entry.net += net;
    netByAsset.set(d.assetId, entry);
  }

  const monthsWithIncome = paidMonths.size;
  const coveragePct = totalMonths > 0 ? monthsWithIncome / totalMonths : 0;

  let topPayerSharePct = 0;
  let topPayerTicker: string | null = null;
  let concentrationHhi = 0;
  if (totalNet > 0) {
    for (const { ticker, net } of netByAsset.values()) {
      const share = net / totalNet;
      concentrationHhi += share * share;
      if (share > topPayerSharePct) {
        topPayerSharePct = share;
        topPayerTicker = ticker;
      }
    }
  }

  return {
    monthsWithIncome,
    monthsInWindow: totalMonths,
    coveragePct,
    topPayerSharePct,
    topPayerTicker,
    concentrationHhi,
    payerCount: netByAsset.size,
  };
}

// ==================== Payer ranking, shaped for the tiles ====================

/** One row of a ranked list, the shape `RankedRows` renders (label · bar · amount · share). */
export interface PayerRankingRow {
  key: string;
  label: string;
  amount: number;
  /** Share of `total`, 0-100. */
  percentage: number;
}

export interface PayerRanking {
  rows: PayerRankingRow[];
  /** What the cut left out, so the shares visibly add up to `total`; null when nothing was cut. */
  remainder: { label: string; amount: number; percentage: number } | null;
  /** The period's whole net income — the denominator every share is measured against. */
  total: number;
  /** Distinct payers in the period, cut or not. */
  payerCount: number;
  top: PayerRow | null;
}

/**
 * The period's payers as ranked rows plus a residual — the same shape the category tiles use,
 * so one primitive renders both. Only RECEIVED payments count: a leaderboard that credits an
 * announced coupon would rank money nobody has.
 */
export function rankPayerShares(
  dividends: Dividend[],
  period: DividendPeriod,
  now: Date = new Date(),
  limit = 5,
): PayerRanking {
  // rankPayers already folds by asset, sorts by net and scopes to the period's PAID rows;
  // asking it for the raw list (no "Altri" collapse) keeps the two functions in step.
  const payers = rankPayersRaw(dividends, period, now);
  const total = payers.reduce((sum, p) => sum + p.net, 0);
  if (payers.length === 0) return { rows: [], remainder: null, total: 0, payerCount: 0, top: null };

  const shown = payers.slice(0, limit);
  const cut = payers.slice(limit);
  const share = (value: number) => (total > 0 ? (value / total) * 100 : 0);

  const remainderAmount = cut.reduce((sum, p) => sum + p.net, 0);
  return {
    rows: shown.map((p) => ({ key: p.assetId, label: p.assetTicker || p.assetName, amount: p.net, percentage: share(p.net) })),
    remainder: cut.length > 0
      ? { label: `Altri ${cut.length} ${cut.length === 1 ? 'strumento' : 'strumenti'}`, amount: remainderAmount, percentage: share(remainderAmount) }
      : null,
    total,
    payerCount: payers.length,
    top: payers[0],
  };
}

// ==================== Yearly income ====================

export interface YearlyIncomePoint {
  year: number;
  gross: number;
  net: number;
  /** True for the calendar year `now` falls in — drawn, but never ranked. */
  ongoing: boolean;
}

export interface YearlyIncomeSummary {
  /** Gap-free, oldest → newest, at most `maxYears`. */
  years: YearlyIncomePoint[];
  /** Closed years among those drawn — the denominator of `average`. */
  closedCount: number;
  average: number | null;
  best: YearlyIncomePoint | null;
  worst: YearlyIncomePoint | null;
  ongoing: YearlyIncomePoint | null;
}

/**
 * Net income per calendar year, with the running year drawn but excluded from every
 * comparison: at the end of August a year that is two thirds done would be "the worst year"
 * by construction. The axis is gap-free so a silent year reads as a zero and not as a hole,
 * and it is capped at `maxYears` so the average the reading states is the average of the
 * bars the user can see.
 */
export function summarizeYearlyIncome(
  dividends: Dividend[],
  now: Date = new Date(),
  maxYears = 6,
): YearlyIncomeSummary {
  const series = buildYearlySeries(dividends, now);
  if (series.length === 0) {
    return { years: [], closedCount: 0, average: null, best: null, worst: null, ongoing: null };
  }

  const currentYear = getItalyYear(now);
  const byYear = new Map(series.map((entry) => [entry.year, entry]));
  const first = series[0].year;
  const last = Math.max(series[series.length - 1].year, currentYear);

  const all: YearlyIncomePoint[] = [];
  for (let year = first; year <= last; year++) {
    const entry = byYear.get(year);
    all.push({ year, gross: entry?.gross ?? 0, net: entry?.net ?? 0, ongoing: year === currentYear });
  }
  const years = all.slice(-maxYears);

  const closed = years.filter((y) => !y.ongoing);
  const average = closed.length > 0 ? closed.reduce((sum, y) => sum + y.net, 0) / closed.length : null;
  const sorted = [...closed].sort((a, b) => b.net - a.net);

  return {
    years,
    closedCount: closed.length,
    average,
    best: sorted[0] ?? null,
    worst: sorted[sorted.length - 1] ?? null,
    ongoing: years.find((y) => y.ongoing) ?? null,
  };
}

// ==================== Announced payments ====================

export interface UpcomingPayment {
  id: string;
  assetId: string;
  assetTicker: string;
  assetName: string;
  paymentDate: Date;
  net: number;
  /** An inflation-linked coupon still at its guaranteed fixed floor: the figure is not final. */
  isProvisional: boolean;
}

/** The announced payments, soonest first — what the hero tile lists and the verdict names. */
export function nextPayments(dividends: Dividend[], now: Date = new Date(), limit = 3): UpcomingPayment[] {
  return dividends
    .filter((d) => !isPaid(d, now))
    .sort((a, b) => toDate(a.paymentDate).getTime() - toDate(b.paymentDate).getTime())
    .slice(0, limit)
    .map((d) => ({
      id: d.id,
      assetId: d.assetId,
      assetTicker: d.assetTicker,
      assetName: d.assetName,
      paymentDate: toDate(d.paymentDate),
      net: netEur(d),
      isProvisional: d.isProvisional === true,
    }));
}

// ==================== The list's own inventory ====================

export interface PaymentsInventory {
  /** Rows listed, received and announced together — this counts the LIST, not the income. */
  total: number;
  receivedCount: number;
  receivedNet: number;
  announcedCount: number;
  announcedNet: number;
  largest: { label: string; net: number; dividendType: DividendType } | null;
}

/**
 * What the Pagamenti tile is holding. Received and announced are counted and totalled
 * SEPARATELY and never added: one is money in the account, the other is a promise, and a
 * single figure covering both would tell the user they already have what they do not.
 */
export function summarizePayments(list: Dividend[], now: Date = new Date()): PaymentsInventory {
  let receivedCount = 0;
  let receivedNet = 0;
  let announcedCount = 0;
  let announcedNet = 0;
  let largest: Dividend | null = null;

  for (const d of list) {
    const net = netEur(d);
    if (isPaid(d, now)) {
      receivedCount += 1;
      receivedNet += net;
    } else {
      announcedCount += 1;
      announcedNet += net;
    }
    if (!largest || net > netEur(largest)) largest = d;
  }

  return {
    total: list.length,
    receivedCount,
    receivedNet,
    announcedCount,
    announcedNet,
    largest: largest
      ? { label: largest.assetTicker || largest.assetName, net: netEur(largest), dividendType: largest.dividendType }
      : null,
  };
}

// ==================== Month windows the tiles draw ====================

/** Enumerate a gap-free monthly net series between two {year, month} bounds, inclusive. */
function buildMonthWindow(dividends: Dividend[], from: YearMonth, to: YearMonth, now: Date): MonthlyNetPoint[] {
  const netByKey = new Map<string, number>();
  for (const d of dividends) {
    if (!isPaid(d, now)) continue; // an announced payment is not income yet
    const ym = toYearMonth(toDate(d.paymentDate));
    const key = `${ym.year}-${ym.month}`;
    netByKey.set(key, (netByKey.get(key) ?? 0) + netEur(d));
  }
  return enumerateMonths(from, to).map(({ year, month }) => ({
    label: monthLabel(year, month),
    shortLabel: shortMonthLabel(month),
    year,
    month,
    net: netByKey.get(`${year}-${month}`) ?? 0,
  }));
}

export interface MonthlyWindow {
  points: MonthlyNetPoint[];
  /** `${year}-${month}` of the month the page is about; null when the period is not one month. */
  highlightKey: string | null;
}

/**
 * The months the hero's bars draw. A month shows the trailing `trailing` months and outlines
 * itself; a year shows its own months from January to the running one (the future is not
 * data); the trailing window and the whole history show twelve — the tile's sub-eyebrow names
 * whichever window it got, because a chart on a different window from the KPIs must say so.
 */
export function resolveMonthlyWindow(
  dividends: Dividend[],
  period: DividendPeriod,
  now: Date = new Date(),
  trailing = 6,
): MonthlyWindow {
  const current = toYearMonth(now);
  if (period === 'year') {
    return { points: buildMonthWindow(dividends, { year: current.year, month: 1 }, current, now), highlightKey: null };
  }
  if (period === 'month') {
    return {
      points: buildMonthWindow(dividends, subtractMonths(current, trailing - 1), current, now),
      highlightKey: `${current.year}-${current.month}`,
    };
  }
  return { points: buildMonthWindow(dividends, subtractMonths(current, 11), current, now), highlightKey: null };
}

export interface CoverageMonth {
  key: string;
  year: number;
  month: number;
  label: string;
  net: number;
  /** Whether at least one payment landed in this month. */
  paid: boolean;
}

/**
 * One cell per month of the reliability window, filled when that month paid. Returns an EMPTY
 * array when the window is longer than `maxMonths`: five years of coverage as sixty squares is
 * not a reading, and drawing a slice of the window under a KPI measured on the whole of it
 * would put two different windows in one tile.
 */
export function buildCoverageMonths(
  dividends: Dividend[],
  period: DividendPeriod,
  now: Date = new Date(),
  maxMonths = 24,
): CoverageMonth[] {
  const scoped = filterPaidByPeriod(dividends, period, now);
  const span = monthsInWindow(period, scoped, now);
  if (span < 1 || span > maxMonths) return [];

  const current = toYearMonth(now);
  const from = period === 'year' ? { year: current.year, month: 1 } : subtractMonths(current, span - 1);
  return buildMonthWindow(scoped, from, current, now).map((point) => ({
    key: `${point.year}-${point.month}`,
    year: point.year,
    month: point.month,
    label: point.shortLabel,
    net: point.net,
    paid: point.net !== 0,
  }));
}

// ==================== Yield (server-measured, TTM) ====================

export interface YieldSummary {
  yocGross: number | null;
  yocNet: number | null;
  currentYieldGross: number | null;
  /** yocGross − currentYieldGross, in percentage points; null when either is missing. */
  spread: number | null;
  dpsMedianGrowth: number | null;
  ttmGross: number | null;
  costBasis: number | null;
  /** Held instruments with a cost basis — what the figures are measured over. */
  coverage: number;
}

/**
 * Reads the yield block of the stats payload into what the Rendimento tile shows. Returns null
 * when the portfolio has no yield on cost at all (no held instrument carries an average cost),
 * which is what makes the verdict's yield clause disappear instead of printing a placeholder.
 */
export function summarizeYield(payload: DividendStatsPayload | null): YieldSummary | null {
  if (!payload || payload.portfolioYieldOnCost === undefined) return null;

  const assets = payload.yieldOnCostAssets ?? [];
  const currentYieldGross = payload.portfolioCurrentYieldGross ?? null;
  const yocGross = payload.portfolioYieldOnCost;

  return {
    yocGross,
    yocNet: payload.portfolioYieldOnCostNet ?? null,
    currentYieldGross,
    spread: currentYieldGross === null ? null : yocGross - currentYieldGross,
    dpsMedianGrowth: payload.dividendGrowthData?.portfolioMedianGrowth ?? null,
    ttmGross: assets.length > 0 ? assets.reduce((sum, a) => sum + a.ttmGrossDividends, 0) : null,
    costBasis: payload.totalCostBasis ?? null,
    coverage: assets.length,
  };
}

// ==================== The two server tables under «Dettaglio» ====================

export interface DpsGrowthSummary {
  /** Instruments with a DPS history at all. */
  coverage: number;
  /** Portfolio median of the latest closed-year YoY; null when no instrument has two years. */
  median: number | null;
  /** Best latest YoY, and who; null when nothing can be compared year over year. */
  best: { assetTicker: string; latestYoyGrowth: number } | null;
  /** Every calendar year present in the table, ascending — the column set. */
  years: number[];
  /** The running calendar year, when it is one of the columns: partial, so never compared. */
  ongoingYear: number | null;
}

/**
 * What the DPS growth table says in one line. The median is the SERVER'S (one definition of a
 * portfolio growth rate, not two); everything else here is a read over the same rows the table
 * draws, so the reading can never name a figure the table does not show.
 */
export function summarizeDpsGrowth(payload: DividendStatsPayload | null, now: Date = new Date()): DpsGrowthSummary | null {
  const growth = payload?.dividendGrowthData;
  if (!growth || growth.byAsset.length === 0) return null;

  const years = [...new Set(growth.byAsset.flatMap((a) => a.yearlyDps.map((y) => y.year)))].sort((a, b) => a - b);
  const currentYear = getItalyYear(now);
  const ranked = growth.byAsset
    .filter((a): a is typeof a & { latestYoyGrowth: number } => a.latestYoyGrowth !== undefined)
    .sort((a, b) => b.latestYoyGrowth - a.latestYoyGrowth);

  return {
    coverage: growth.byAsset.length,
    median: growth.portfolioMedianGrowth ?? null,
    best: ranked[0] ? { assetTicker: ranked[0].assetTicker, latestYoyGrowth: ranked[0].latestYoyGrowth } : null,
    years,
    ongoingYear: years.includes(currentYear) ? currentYear : null,
  };
}

export interface TotalReturnSummary {
  count: number;
  /** Plain mean of the per-instrument total returns — the rows are not weighted by size. */
  average: number;
  best: { assetTicker: string; totalReturnPercentage: number };
  worst: { assetTicker: string; totalReturnPercentage: number };
  /** How many rows are below zero — what makes "la sola sotto zero" an honest phrase. */
  negativeCount: number;
}

/** The one-line read over the per-instrument total return table. */
export function summarizeTotalReturn(payload: DividendStatsPayload | null): TotalReturnSummary | null {
  const rows = payload?.totalReturnAssets ?? [];
  if (rows.length === 0) return null;

  const sorted = [...rows].sort((a, b) => b.totalReturnPercentage - a.totalReturnPercentage);
  const best = sorted[0];
  const worst = sorted[sorted.length - 1];

  return {
    count: rows.length,
    average: rows.reduce((sum, r) => sum + r.totalReturnPercentage, 0) / rows.length,
    best: { assetTicker: best.assetTicker, totalReturnPercentage: best.totalReturnPercentage },
    worst: { assetTicker: worst.assetTicker, totalReturnPercentage: worst.totalReturnPercentage },
    negativeCount: rows.filter((r) => r.totalReturnPercentage < 0).length,
  };
}

/**
 * What the Pagamenti list holds: every payment whose date falls inside the period's calendar
 * window, received or announced.
 *
 * It is the SAME window as the income figures, with the `isPaid` gate lifted — so a coupon
 * announced for later this month is listed under this month, and one announced for 2032 is not.
 * The first version kept every announced row whatever the period, which put a 2032 final premium
 * in the «agosto» list and made the aside's «N voci» a claim the period did not support.
 * `summarizePayments` still counts and totals the two halves apart, so widening the list to
 * announced rows never widens an income figure.
 */
export function sliceForList(
  dividends: Dividend[],
  period: DividendPeriod,
  now: Date = new Date(),
): Dividend[] {
  const bounds = resolvePeriodBounds(period, now);
  return dividends.filter((d) => isInPeriodWindow(toDate(d.paymentDate), bounds));
}
