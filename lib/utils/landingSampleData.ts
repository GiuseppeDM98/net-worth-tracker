/**
 * The invented profile the public landing draws its four Panoramica tiles on.
 *
 * Design: the landing IS the Panoramica shown to someone who has no data yet, so it renders
 * the app's own tiles rather than pictures of them — which means it needs a portfolio to feed
 * them. Every figure here is made up, and the page declares it in words above the grid; what
 * is NOT made up is the ARITHMETIC between the figures. A visitor who adds the six classes and
 * gets a different total, or who sees a market digest larger than the month's whole variation,
 * has been shown a broken instrument, and the instrument is the product.
 *
 * The invariants are therefore pinned by `__tests__/landingSampleData.test.ts` at the repo root:
 *   1. the six classes sum to the gross total, and their shares to 100%;
 *   2. the monthly variation is the last two points of the series, the yearly one the distance
 *      from the previous December — the same two windows the payload measures;
 *   3. the market digest is never larger than the monthly variation (what is left is the
 *      month's contributions, which is what a digest labelled "Mercato" must leave room for);
 *   4. income − expenses = net, in both months, and the expense delta is their real change;
 *   5. the month-end projection at the sample's day lands BELOW the previous month, so the
 *      figure the tile paints with the positive token deserves it.
 *
 * The month is FIXED (agosto 2026) rather than derived from today. A profile whose month
 * followed the clock would need its expenses to follow the day too, and a projection computed
 * on the 3rd of a month is nonsense; a snapshot that is honestly labelled ages better than a
 * half-simulated "now" (PRODUCT.md → «Wrong beats missing»).
 */

import type { PieChartData } from '@/types/assets';
import type {
  DashboardOverviewExpenseStats,
  DashboardOverviewGoalProgress,
  DashboardOverviewSparklinePoint,
} from '@/types/dashboardOverview';
import type { MarketDigestEntry } from '@/components/dashboard/overview/PatrimonioTile';

/** The month the profile is a snapshot of: agosto 2026, read on the 27th. */
export const SAMPLE_MONTH = 8;
export const SAMPLE_YEAR = 2026;
export const SAMPLE_DAY_OF_MONTH = 27;
export const SAMPLE_DAYS_IN_MONTH = 31;

/** Instruments behind the profile — the count line under the hero's market digest. */
export const SAMPLE_ASSET_COUNT = 11;

/** Twelve monthly snapshots, set-25 → ago-26. The hero's sparkline and both variations. */
export const SAMPLE_SPARKLINE: DashboardOverviewSparklinePoint[] = [
  { month: 9, year: 2025, totalNetWorth: 152_300 },
  { month: 10, year: 2025, totalNetWorth: 155_900 },
  { month: 11, year: 2025, totalNetWorth: 154_100 },
  { month: 12, year: 2025, totalNetWorth: 161_700 },
  { month: 1, year: 2026, totalNetWorth: 163_400 },
  { month: 2, year: 2026, totalNetWorth: 167_900 },
  { month: 3, year: 2026, totalNetWorth: 166_200 },
  { month: 4, year: 2026, totalNetWorth: 172_600 },
  { month: 5, year: 2026, totalNetWorth: 176_400 },
  { month: 6, year: 2026, totalNetWorth: 178_900 },
  { month: 7, year: 2026, totalNetWorth: 184_240 },
  { month: 8, year: 2026, totalNetWorth: 187_420 },
];

export const SAMPLE_TOTAL_VALUE = SAMPLE_SPARKLINE[SAMPLE_SPARKLINE.length - 1].totalNetWorth;

const previousMonthValue = SAMPLE_SPARKLINE[SAMPLE_SPARKLINE.length - 2].totalNetWorth;
const previousDecemberValue = SAMPLE_SPARKLINE.find(
  (point) => point.month === 12 && point.year === SAMPLE_YEAR - 1,
)!.totalNetWorth;

/** Both variations are DERIVED from the series, so the chips can never contradict the chart. */
export const SAMPLE_VARIATIONS = {
  monthly: {
    value: SAMPLE_TOTAL_VALUE - previousMonthValue,
    percentage: ((SAMPLE_TOTAL_VALUE - previousMonthValue) / previousMonthValue) * 100,
  },
  yearly: {
    value: SAMPLE_TOTAL_VALUE - previousDecemberValue,
    percentage: ((SAMPLE_TOTAL_VALUE - previousDecemberValue) / previousDecemberValue) * 100,
  },
};

/**
 * The "Mercato:" digest — the price effect of the month, never the flows. It sums to 2360 €
 * of the month's 3180 €: the remaining 820 € are contributions, which is exactly the split
 * the real digest makes (AGENTS.md → Panoramica: topMovers are market return).
 */
export const SAMPLE_MARKET_MOVERS: MarketDigestEntry[] = [
  { key: 'equity', label: 'Azioni', delta: 2140 },
  { key: 'crypto', label: 'Criptovalute', delta: 410 },
  { key: 'bonds', label: 'Obbligazioni', delta: -190 },
];

/** Value per class, largest first; the shares are derived so the two can never disagree. */
const SAMPLE_CLASS_VALUES: Array<{ assetClass: string; name: string; value: number }> = [
  { assetClass: 'equity', name: 'Azioni', value: 109_453 },
  { assetClass: 'bonds', name: 'Obbligazioni', value: 34_110 },
  { assetClass: 'cash', name: 'Liquidità', value: 22_678 },
  { assetClass: 'realestate', name: 'Immobili', value: 12_932 },
  { assetClass: 'crypto', name: 'Criptovalute', value: 5_060 },
  { assetClass: 'commodity', name: 'Materie Prime', value: 3_187 },
];

/**
 * `color` is a placeholder: the page remaps every slot through `ASSET_CLASS_CHART_INDEX` and
 * `useChartColors()`, exactly as the Panoramica does, so a class wears the same hue here and
 * inside the app.
 */
export const SAMPLE_ASSET_CLASSES: PieChartData[] = SAMPLE_CLASS_VALUES.map((entry) => ({
  name: entry.name,
  value: entry.value,
  percentage: (entry.value / SAMPLE_TOTAL_VALUE) * 100,
  color: 'var(--chart-1)',
  assetClass: entry.assetClass,
}));

const sampleIncome = 2980;
const sampleExpenses = 1780;
const samplePreviousIncome = 2980;
const samplePreviousExpenses = 2180;

export const SAMPLE_EXPENSE_STATS: DashboardOverviewExpenseStats = {
  currentMonth: {
    income: sampleIncome,
    expenses: sampleExpenses,
    net: sampleIncome - sampleExpenses,
    expensesScheduled: 0,
  },
  previousMonth: {
    income: samplePreviousIncome,
    expenses: samplePreviousExpenses,
    net: samplePreviousIncome - samplePreviousExpenses,
  },
  delta: {
    income: ((sampleIncome - samplePreviousIncome) / samplePreviousIncome) * 100,
    expenses: ((sampleExpenses - samplePreviousExpenses) / samplePreviousExpenses) * 100,
    net: 0,
  },
  // The landing shows no category tile, so there is nothing to rank; an invented top-5 would
  // be five more numbers nobody reads.
  topExpenseCategories: [],
  topIncomeCategories: [],
};

export const SAMPLE_SAVINGS_RATE = ((sampleIncome - sampleExpenses) / sampleIncome) * 100;
export const SAMPLE_COVERAGE_RATIO = sampleIncome / sampleExpenses;

/**
 * Three goals in progress. The colour is a theme chart slot rather than a hex: a real goal
 * carries a colour the user picked, and hard-coding one here would be the only literal hue on
 * a page whose every other colour follows the theme.
 */
export const SAMPLE_GOALS: DashboardOverviewGoalProgress[] = [
  {
    goalId: 'sample-emergency',
    goalName: 'Fondo di emergenza',
    goalColor: 'var(--chart-2)',
    currentValue: 12_400,
    targetAmount: 15_000,
    progressPercentage: (12_400 / 15_000) * 100,
  },
  {
    goalId: 'sample-house',
    goalName: 'Casa',
    goalColor: 'var(--chart-4)',
    currentValue: 31_500,
    targetAmount: 80_000,
    progressPercentage: (31_500 / 80_000) * 100,
  },
  {
    goalId: 'sample-trip',
    goalName: 'Viaggio in Giappone',
    goalColor: 'var(--chart-6)',
    currentValue: 4_350,
    targetAmount: 6_000,
    progressPercentage: (4_350 / 6_000) * 100,
  },
];
