/**
 * The Panoramica's model for the small-screen composition (since 2026-10-11): the payload IS
 * the page's summary, so what the other pages derive in a `*Summary` module — the strip's three
 * figures, the two cashflow ratios, the rows' closed asides — is read straight from
 * `DashboardOverviewPayload` here. Pure, SDK-free, tested by `__tests__/overviewSummary.test.ts`.
 *
 * The strip (`selectOverviewStrip`) prints EXACTLY what the verdict prints (The First-Screen
 * Rule): every cell carries the value ALREADY rounded the way the sentence rounds it, with the
 * sentence's `decimals`, so `Intl` never rounds a second time — «Messo da parte finora» at −12,5
 * is «−12%» in both (`Math.round`), where `Intl` alone would print −13%.
 */

import {
  annualPortfolioCostTotal,
  buildOverviewVerdict,
  describeLeadingClass,
  liquidityShare,
  narrativeToText,
  projectCashflowMonthEnd,
  resolveLivedCashflow,
  type OverviewVerdictInput,
} from '@/lib/utils/overviewNarrative';
import { VERDICT_REST_SECTION } from '@/lib/utils/mobileSections';
import { cachedFormatCurrencyEUR, formatPercentageIt, withTypographicMinus } from '@/lib/utils/formatters';
import { describeOwnershipAnswer } from '@/lib/utils/patrimonioNarrative';
import { meaningfulSavingsRate, readSavings } from '@/lib/utils/savingsRate';
import type { Narrative } from '@/lib/utils/narrative';
import type { StripFigure } from '@/lib/utils/verdictStrip';
import type { DashboardOverviewCategoryAmount, DashboardOverviewExpenseStats, DashboardOverviewPayload } from '@/types/dashboardOverview';

/** THE tile of the page: open at every width, never a row (The First-Screen Rule); a strip cell targets it. */
export const OVERVIEW_PATRIMONIO_ID = 'panoramica-patrimonio';

/** The rows below `desktop:`, in the DOM's order (The First-Screen Rule: Sintesi before Cashflow, as at 1440). */
export const OVERVIEW_SECTION_IDS = {
  sintesi: 'panoramica-sintesi',
  cashflow: 'panoramica-cashflow',
  composizione: 'panoramica-composizione',
  costi: 'panoramica-costi',
  obiettivo: 'panoramica-obiettivo',
  spese: 'panoramica-spese',
  entrate: 'panoramica-entrate',
  asset: 'panoramica-asset',
  // «Intestatari» (2026-10-17): present only when a held asset names a person (`overview.ownership`).
  intestatari: 'panoramica-intestatari',
} as const;

export type OverviewSectionId = (typeof OVERVIEW_SECTION_IDS)[keyof typeof OVERVIEW_SECTION_IDS];

// ─── The two ratios of the Cashflow tile (the WHOLE month, calendar included) ─────────────────

/**
 * The month's savings rate in percent — `null` (not 0) when it is not a rate: no income, or a
 * deficit beyond the floor (`meaningfulSavingsRate`).
 */
export function monthSavingsRate(stats: DashboardOverviewExpenseStats | null | undefined): number | null {
  if (!stats) return null;
  const { income, expenses } = stats.currentMonth;
  return meaningfulSavingsRate(income, expenses);
}

/** income / expenses; `null` without expenses. */
export function monthCoverageRatio(stats: DashboardOverviewExpenseStats | null | undefined): number | null {
  if (!stats) return null;
  const { income, expenses } = stats.currentMonth;
  if (expenses <= 0) return null;
  return income / expenses;
}

// ─── The strip ────────────────────────────────────────────────────────────────────────────────

/**
 * The cell «Messo da parte finora», the verdict's own figure: what has already happened
 * (`resolveLivedCashflow`), or the whole month on a payload that cannot say. A rate is rounded as
 * the sentence rounds it (`Math.round`; doc/guide/panoramica.md § Composizione mobile); a lived
 * deficit beyond the floor is the sentence's signed whole euro («−497 €», owner 2026-11-12) —
 * without `decimals` the strip prints `cachedFormatCurrencyEUR(magnitude, true)`, the form
 * `formatEuroMinus` prints in the sentence. On a payload without the calendar the sentence has no
 * clause below the floor, so the cell names the reason.
 */
function savedSoFarFigure(stats: DashboardOverviewExpenseStats | null | undefined): Pick<StripFigure, 'value' | 'format' | 'decimals' | 'reason'> {
  const lived = resolveLivedCashflow(stats);
  const reading = lived ? lived.reading : stats ? readSavings(stats.currentMonth.income, stats.currentMonth.expenses) : { kind: 'none' as const };
  if (reading.kind === 'rate') return { value: Math.round(reading.rate), format: 'percent', decimals: 0 };
  if (reading.kind === 'deficit') {
    return lived
      ? { value: -reading.deficit, format: 'signed-currency' }
      : { value: null, format: 'percent', decimals: 0, reason: 'spese oltre le entrate' };
  }
  return { value: null, format: 'percent', decimals: 0, reason: lived ? 'nessuna entrata finora' : 'nessuna entrata nel mese' };
}

/**
 * The three figures under the title on a phone: the month's euro (the chip's first figure,
 * lifted from THE tile; it opens «Il perché», where the sentence restates it), the year's
 * percentage (the year's chip, lifted whole; it opens THE tile on its YTD curve) and what was
 * saved so far (it opens the Cashflow row, which keeps the whole month). Every cell carries
 * the sentence's rounding. All three `null` → `[]`: no strip at all.
 */
export function selectOverviewStrip(overview: DashboardOverviewPayload): StripFigure[] {
  const monthly = overview.variations.monthly;
  const yearly = overview.variations.yearly;

  const figures: StripFigure[] = [
    {
      label: 'Questo mese',
      value: monthly ? monthly.value : null,
      format: 'signed-currency',
      decimals: 2,
      opens: VERDICT_REST_SECTION,
      lifts: { section: OVERVIEW_PATRIMONIO_ID, block: 'monthly' },
      ...(monthly ? {} : { reason: 'nessuno snapshot prima di questo mese' }),
    },
    {
      label: 'Da inizio anno',
      value: yearly ? yearly.percentage : null,
      format: 'signed-percent',
      decimals: 2,
      opens: OVERVIEW_PATRIMONIO_ID,
      lifts: { section: OVERVIEW_PATRIMONIO_ID, block: 'yearly' },
      ...(yearly ? {} : { reason: "nessuno snapshot da cui contare l'anno" }),
    },
    {
      label: 'Messo da parte finora',
      ...savedSoFarFigure(overview.expenseStats),
      opens: OVERVIEW_SECTION_IDS.cashflow,
    },
  ];
  return figures.every((figure) => figure.value === null) ? [] : figures;
}

/**
 * Whether the verdict's sentence names the market — then the digest «Mercato:» of THE tile is
 * lifted on a phone (its words are in «Il perché»), otherwise the digest stays. True iff the
 * builder's sentence contains «mercato»: a market effect alone is not enough — a sale with a net
 * loss and a tax above zero skips both the month's split and the counterfactual, and without a
 * driver clause nothing names it.
 */
export function verdictNamesMarket(input: OverviewVerdictInput): boolean {
  return /mercato/.test(narrativeToText(buildOverviewVerdict(input).sentence));
}

// ─── The closed rows' asides ──────────────────────────────────────────────────────────────────

/**
 * What each closed row says beside its eyebrow (The Closed-Row Rule): words, never an amount
 * nor a count of figures — the full phrase when the tile has something to show, the empty one
 * when it has not.
 */
export function describeOverviewAsides(overview: DashboardOverviewPayload): Record<OverviewSectionId, string> {
  const stats = overview.expenseStats;
  const goals = overview.goalProgressList ?? (overview.goalProgress ? [overview.goalProgress] : []);
  const classes = overview.charts.assetClassData.filter((d) => d.percentage > 0);
  return {
    [OVERVIEW_SECTION_IDS.sintesi]: 'cosa è liquidabile',
    [OVERVIEW_SECTION_IDS.cashflow]: stats ? 'entrate, spese e fine mese' : 'nessun dato questo mese',
    [OVERVIEW_SECTION_IDS.composizione]: classes.length > 0 ? 'per asset class' : 'nessun asset',
    [OVERVIEW_SECTION_IDS.costi]: 'stima annua',
    [OVERVIEW_SECTION_IDS.obiettivo]: goals.some((goal) => goal.currentValue < goal.targetAmount) ? 'in corso' : 'raggiunto',
    [OVERVIEW_SECTION_IDS.spese]: stats && stats.topExpenseCategories.length > 0 ? 'le prime del mese' : 'nessuna spesa questo mese',
    [OVERVIEW_SECTION_IDS.entrate]: stats && stats.topIncomeCategories.length > 0 ? 'le prime del mese' : 'nessuna entrata questo mese',
    [OVERVIEW_SECTION_IDS.asset]: (overview.topAssets ?? []).length > 0 ? 'valore, peso, rendimento' : 'nessun asset in portafoglio',
    [OVERVIEW_SECTION_IDS.intestatari]: 'quote per persona',
  };
}

// ─── The closed rows' answers (the landscape index, 2026-10-16) ──────────────────────────────

/**
 * A category list's first row as a closed row's answer, with the words of its reading
 * (`describeCategoryShare`): «Auto 29%» as the row prints its share (`Math.round`), «tutto in
 * Casa» with one category, «quasi tutto in Casa» when the first rounds to 100 beside others —
 * a 99,6% share must not claim it all. Null with no row.
 */
function describeLeadingCategory(rows: readonly DashboardOverviewCategoryAmount[], kind: 'expenses' | 'income'): Narrative | null {
  const [top, ...rest] = rows;
  if (!top) return null;
  const preposition = kind === 'income' ? 'da' : 'in';
  if (rest.length === 0) return [{ text: `tutto ${preposition} ${top.category}` }];
  if (Math.round(top.percentage) >= 100) return [{ text: `quasi tutto ${preposition} ${top.category}` }];
  return [{ text: `${top.category} ` }, { text: `${Math.round(top.percentage)}%`, mono: true }];
}

/** The one figure of an answer, as printed; null for an answer in words only. */
function answerFigure(answer: Narrative | null): string | null {
  return answer?.find((segment) => segment.mono)?.text ?? null;
}

/**
 * What each closed row of the Panoramica ANSWERS in the landscape index (components/ui/row-answers.tsx):
 * words and at most one figure, never one the strip, THE tile or the verdict's first sentence
 * already print (The Lifted-Figure Rule) — so the Cashflow row answers with the month-end
 * projection, not the savings rate the strip carries. `null` keeps the row's scope aside: a tile
 * with nothing to show, and «Asset principali» when its weight prints the same figure as
 * «Composizione» two rows above (a house that is the only property: one number twice in one index).
 * Every figure is printed as its tile prints it, from the same function.
 */
export function describeOverviewClosedAnswers(
  overview: DashboardOverviewPayload,
  calendar: { dayOfMonth: number; daysInMonth: number },
): Record<OverviewSectionId, Narrative | null> {
  const stats = overview.expenseStats;
  const goals = overview.goalProgressList ?? (overview.goalProgress ? [overview.goalProgress] : []);
  const { metrics, flags } = overview;

  const liquid = liquidityShare(metrics.cashNetWorth, metrics.liquidInvestmentsNetWorth, metrics.totalValue);
  // Liquid can go below zero (cards and loans over the accounts): the typographic minus, never Intl's hyphen.
  const sintesi: Narrative | null = liquid
    ? [{ text: 'liquidabile ' }, { text: withTypographicMinus(liquid.share, formatPercentageIt(Math.abs(liquid.share), 1)), mono: true }]
    : null;

  const projected = stats ? projectCashflowMonthEnd(stats.currentMonth, calendar.dayOfMonth, calendar.daysInMonth) : null;
  const cashflow: Narrative | null =
    projected === null ? null : [{ text: 'a fine mese ' }, { text: `~${cachedFormatCurrencyEUR(projected, true)}`, mono: true }];

  const composizione = describeLeadingClass(overview.charts.assetClassData);

  const costi: Narrative | null =
    flags.hasTERTracking || flags.hasStampDuty
      ? [{ text: 'costo annuo ' }, { text: cachedFormatCurrencyEUR(annualPortfolioCostTotal(metrics), true), mono: true }]
      : null;

  const featuredGoal = goals[0];
  const obiettivo: Narrative | null = featuredGoal
    ? [{ text: `${featuredGoal.goalName} ` }, { text: `${Math.round(featuredGoal.progressPercentage)}%`, mono: true }]
    : null;

  const topAsset = (overview.topAssets ?? [])[0];
  const topAssetAnswer: Narrative | null = topAsset
    ? [{ text: `${topAsset.name} ` }, { text: formatPercentageIt(topAsset.portfolioPercent, 1), mono: true }]
    : null;
  const asset = topAssetAnswer && answerFigure(topAssetAnswer) !== answerFigure(composizione) ? topAssetAnswer : null;

  return {
    [OVERVIEW_SECTION_IDS.sintesi]: sintesi,
    [OVERVIEW_SECTION_IDS.cashflow]: cashflow,
    [OVERVIEW_SECTION_IDS.composizione]: composizione,
    [OVERVIEW_SECTION_IDS.costi]: costi,
    [OVERVIEW_SECTION_IDS.obiettivo]: obiettivo,
    [OVERVIEW_SECTION_IDS.spese]: stats ? describeLeadingCategory(stats.topExpenseCategories, 'expenses') : null,
    [OVERVIEW_SECTION_IDS.entrate]: stats ? describeLeadingCategory(stats.topIncomeCategories, 'income') : null,
    [OVERVIEW_SECTION_IDS.asset]: asset,
    // The largest owner and its share — a figure no other row, cell or sentence prints.
    [OVERVIEW_SECTION_IDS.intestatari]: overview.ownership ? describeOwnershipAnswer(overview.ownership) : null,
  };
}
