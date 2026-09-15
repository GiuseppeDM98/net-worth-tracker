/**
 * The Panoramica's narrative layer: the verdict headline that answers "come va?" before any
 * number, the sentence under it, and the one-line reading under each tile.
 *
 * Design: every function is pure and returns a `Narrative` (a list of segments) rather than a
 * string, so the component can set figures in Geist Mono and colour them by sign while the
 * prose stays prose — the same split `PerformanceHero` makes between verdict and detail. The
 * words are chosen by rules, never free-form, and each rule is pinned by a test: the sentence
 * is what the user reads FIRST, so it must never claim something the data cannot support
 * (a month that fell while the market gained is not "the market's fault").
 *
 * Percentages go through chartService's it-IT formatter (comma decimals) like every other
 * pure module that feeds a screen — see AGENTS.md → Italian Localization.
 */

import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import { formatPercentage } from '@/lib/services/chartService';
import { MONTH_NAMES } from '@/lib/constants/months';
import { atThePercent } from '@/lib/utils/patrimonioNarrative';
import { PENSION_BAND_KEY } from '@/lib/utils/historyComposition';
import { resolveDeclineCause, type DeclineCause, type PeriodSalesSummary } from '@/lib/utils/periodSales';
import { declineHeadlineTail, describeOwnFlowsSplit, describeSales } from '@/lib/utils/salesNarrative';

import type { Narrative, NarrativeSegment, VerdictTone } from '@/lib/utils/narrative';
import type { CategoryRanking } from '@/lib/utils/tracciamentoSummary';
import type { DashboardOverviewCategoryAmount } from '@/types/dashboardOverview';

// The segment shape and its plain-text rendering live in `narrative.ts` so every page's
// narrative module shares them; re-exported here for the Panoramica's existing importers.
export type { Narrative, VerdictTone } from '@/lib/utils/narrative';
export { narrativeToText } from '@/lib/utils/narrative';

export interface OverviewVerdictInput {
  /** Current calendar month, 1-12. */
  month: number;
  totalValue: number;
  monthlyVariation: { value: number; percentage: number } | null;
  yearlyVariation: { value: number; percentage: number } | null;
  isNewATH: boolean;
  /** Current-month savings rate in percent; null when there is no income to measure against. */
  savingsRate: number | null;
  /** Portfolio-wide market effect this month; null when not attributable. */
  marketEffect: number | null;
  /** The asset class whose market price moved the most; null when none. */
  topMover: { assetClass: string; delta: number } | null;
  /**
   * The month's sells from the trade ledger, with the estimated tax withheld on them; null when
   * nothing was sold, absent on a payload computed before the field existed.
   */
  sales?: PeriodSalesSummary | null;
}

export interface OverviewVerdict {
  headline: string;
  tone: VerdictTone;
  sentence: Narrative;
}

// ─── Formatting helpers ───────────────────────────────────────────────────────

const prose = (text: string): NarrativeSegment => ({ text });

/** Signed euro figure with a typographic minus, coloured by sign. */
function signedCurrency(value: number, compact = false): NarrativeSegment {
  const sign = value >= 0 ? '+' : '−';
  return {
    text: `${sign}${cachedFormatCurrencyEUR(Math.abs(value), compact)}`,
    mono: true,
    sign: value >= 0 ? 'positive' : 'negative',
  };
}

function signedPercent(value: number, decimals = 2): NarrativeSegment {
  const sign = value >= 0 ? '+' : '−';
  return {
    text: `${sign}${formatPercentage(Math.abs(value), decimals)}`,
    mono: true,
    sign: value >= 0 ? 'positive' : 'negative',
  };
}

const figure = (text: string): NarrativeSegment => ({ text, mono: true });

/** Lower-case month name for use inside a sentence ("su luglio", "a maggio"). */
function monthInSentence(month: number): string {
  return MONTH_NAMES[month - 1].toLowerCase();
}

/** "a maggio" but "ad agosto" — the euphonic d before a vowel. */
function withPrepositionA(monthName: string): string {
  return /^[aeiou]/i.test(monthName) ? `ad ${monthName}` : `a ${monthName}`;
}

function previousMonthIndex(month: number): number {
  return month === 1 ? 12 : month - 1;
}

/**
 * «ad agosto» / «a luglio» for the month BEFORE `month` — the Cashflow tile's row label and its
 * flat-delta line read it from here so no component types the preposition (a tile printed
 * «A agosto» on the real account until 2026-09-13). `capitalised` for the start of a label.
 */
export function atPreviousMonth(month: number, capitalised = false): string {
  const phrase = withPrepositionA(monthInSentence(previousMonthIndex(month)));
  return capitalised ? capitalise(phrase) : phrase;
}

// ─── Asset classes as grammatical subjects ────────────────────────────────────

interface ClassSubject {
  subject: string;
  plural: boolean;
}

/**
 * How each class reads as the subject of a sentence. Gender and number decide the verb, so
 * they are stored with the noun rather than guessed from the label. The keys are the eight
 * asset classes AND the pension band: the market digest lists the pension funds as their own
 * «Previdenza» line (`PENSION_BAND_KEY`), so the top mover can be that key — on the real
 * account it was, and the verdict printed «e pension hanno fatto il grosso del lavoro» until
 * 2026-09-13. A key missing here is a missing input: the driver clause is DROPPED (the
 * Narrative Honesty Rule), never printed as a database key with a guessed verb.
 */
const CLASS_SUBJECTS: Record<string, ClassSubject> = {
  equity: { subject: 'le azioni', plural: true },
  bonds: { subject: 'le obbligazioni', plural: true },
  crypto: { subject: 'le criptovalute', plural: true },
  realestate: { subject: 'gli immobili', plural: true },
  cash: { subject: 'la liquidità', plural: false },
  commodity: { subject: 'le materie prime', plural: true },
  trendFollowing: { subject: 'il trend following', plural: false },
  carry: { subject: 'il carry', plural: false },
  [PENSION_BAND_KEY]: { subject: 'i fondi pensione', plural: true },
};

function classSubject(assetClass: string): ClassSubject | null {
  return CLASS_SUBJECTS[assetClass] ?? null;
}

/**
 * The class name without its article, for "in azioni" / "criptovalute al 2,7%". A class the
 * map does not know keeps its label here: a composition reading names what the bar shows.
 */
function classNoun(assetClass: string): string {
  const subject = classSubject(assetClass)?.subject ?? assetClass.toLowerCase();
  return subject.replace(/^(le|gli|la|il|lo|l') /, '');
}

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

// ─── Verdict ──────────────────────────────────────────────────────────────────

interface ResolvedHeadline {
  headline: string;
  tone: VerdictTone;
  /** The cause of a falling month; null when the month did not fall. */
  declineCause: DeclineCause | null;
}

function resolveHeadline(input: OverviewVerdictInput): ResolvedHeadline {
  const month = MONTH_NAMES[input.month - 1];

  if (!input.monthlyVariation) {
    return { headline: `Il tuo patrimonio ${withPrepositionA(month.toLowerCase())}.`, tone: 'neutral', declineCause: null };
  }

  if (input.monthlyVariation.value >= 0) {
    if (input.savingsRate !== null && input.savingsRate < 0) {
      return { headline: `${month} cresce, ma le spese superano le entrate.`, tone: 'warning', declineCause: null };
    }
    return { headline: `${month} sta andando bene.`, tone: 'positive', declineCause: null };
  }

  // A falling month: name the market only when the market actually lost money, and never the
  // market ALONE when the ledger says the tax on a sale (or the user's own flows) weighed more —
  // ONE decision for the three verdicts (`resolveDeclineCause`). A tax that explains the drop
  // while the market gained is named in the headline, instrument included.
  const cause = resolveDeclineCause({
    marketEffect: input.marketEffect,
    ownFlows: input.marketEffect === null ? null : input.monthlyVariation.value - input.marketEffect,
    salesTax: input.sales?.estimatedTax ?? null,
  });
  return {
    headline: `${month} è in calo${declineHeadlineTail(cause, input.sales)}`,
    // The market did not lose: a tax withheld on a gain is worth attention, not alarm.
    tone: cause === 'despite-market' || cause === 'taxes-despite-market' ? 'warning' : 'negative',
    declineCause: cause,
  };
}

/** Null when the class has no subject in the map — the clause is dropped, never guessed. */
function buildDriverClause(topMover: { assetClass: string; delta: number }, leading: boolean): Narrative | null {
  const resolved = classSubject(topMover.assetClass);
  if (!resolved) return null;
  const { subject, plural } = resolved;
  const verb = plural ? 'hanno' : 'ha';
  const action = topMover.delta >= 0 ? 'fatto il grosso del lavoro' : 'pesato';
  const opening = leading ? capitalise(subject) : subject;
  return [prose(`${opening} ${verb} ${action} (`), signedCurrency(topMover.delta, true), prose(')')];
}

/**
 * The headline + the sentence under it. The sentence is assembled clause by clause so that a
 * missing input drops its clause instead of printing a placeholder: no prior snapshot → no
 * monthly clause; no income → no savings clause; nothing attributable → no market driver.
 */
export function buildOverviewVerdict(input: OverviewVerdictInput): OverviewVerdict {
  const { headline, tone, declineCause } = resolveHeadline(input);
  const sentence: Narrative = [prose('Il patrimonio vale '), figure(cachedFormatCurrencyEUR(input.totalValue))];

  if (input.monthlyVariation) {
    sentence.push(
      prose(': '),
      signedCurrency(input.monthlyVariation.value),
      prose(' ('),
      signedPercent(input.monthlyVariation.percentage),
      prose(`) su ${monthInSentence(previousMonthIndex(input.month))}`),
    );
  }
  if (input.yearlyVariation) {
    sentence.push(prose(', '), signedPercent(input.yearlyVariation.percentage), prose(' da inizio anno'));
  }
  if (input.isNewATH) {
    sentence.push(prose(', nuovo massimo storico'));
  }
  sentence.push(prose('.'));

  // When the headline blames the tax on a sale, the sale is the month's story and comes right
  // after the variation — before the savings rate, which is the pleasantry — and the
  // market-vs-flows split is redundant (the headline already said the market did not lose).
  const taxIsTheStory = declineCause === 'taxes-despite-market';
  if (taxIsTheStory && input.sales) {
    sentence.push(prose(' '), ...describeSales(input.sales));
  }

  const hasSavingsClause = input.savingsRate !== null;
  if (input.savingsRate !== null) {
    sentence.push(
      prose(' Hai messo da parte il '),
      figure(`${Math.round(input.savingsRate)}%`),
      prose(' delle entrate'),
    );
  }

  // The driver is only stated when a market effect was actually measured this month, and only
  // for a class the map can name as a subject.
  const driverClause =
    input.topMover && input.marketEffect !== null ? buildDriverClause(input.topMover, !hasSavingsClause) : null;
  if (driverClause) {
    sentence.push(prose(hasSavingsClause ? ' e ' : ' '));
    sentence.push(...driverClause);
  }

  if (hasSavingsClause || driverClause) {
    sentence.push(prose('.'));
  }

  // The split between the market and everything the user did, then the sale that explains it:
  // a month that fell by 4.900 € with the market at −1.100 € must not read as a market month.
  if (!taxIsTheStory && input.monthlyVariation && input.marketEffect !== null) {
    sentence.push(prose(' '), ...describeOwnFlowsSplit(input.monthlyVariation.value, input.marketEffect));
  }
  if (!taxIsTheStory && input.sales) {
    sentence.push(prose(' '), ...describeSales(input.sales));
  }

  return { headline, tone, sentence };
}

// ─── Tile readings ────────────────────────────────────────────────────────────

/** "Il 72,9% è liquidabile: 300.380 €." — cash plus liquid investments over the gross total. */
export function describeLiquidity(
  cashNetWorth: number,
  liquidInvestmentsNetWorth: number,
  totalValue: number,
): Narrative | null {
  if (totalValue <= 0) return null;
  const liquid = cashNetWorth + liquidInvestmentsNetWorth;
  const share = (liquid / totalValue) * 100;
  return [
    prose('Il '),
    figure(formatPercentage(share, 1)),
    prose(' è liquidabile: '),
    figure(cachedFormatCurrencyEUR(liquid, true)),
    prose('.'),
  ];
}

/**
 * "Messo da parte il 40%; spese in calo del 6,4% su luglio." The expense delta is the
 * percentage change against the previous month (negative = spent less, which is the good
 * direction, hence coloured positive).
 */
export function describeCashflow(
  savingsRate: number | null,
  expensesDeltaPercent: number,
  currentMonth: number,
): Narrative | null {
  if (savingsRate === null) return null;
  if (savingsRate < 0) return [prose('Speso più di quanto è entrato.')];

  const narrative: Narrative = [prose('Messo da parte il '), figure(`${Math.round(savingsRate)}%`)];
  if (expensesDeltaPercent !== 0) {
    const direction = expensesDeltaPercent < 0 ? 'calo' : 'aumento';
    narrative.push(
      prose(`; spese in ${direction} del `),
      {
        text: formatPercentage(Math.abs(expensesDeltaPercent), 1),
        mono: true,
        sign: expensesDeltaPercent < 0 ? 'positive' : 'negative',
      },
      prose(` su ${monthInSentence(previousMonthIndex(currentMonth))}`),
    );
  }
  narrative.push(prose('.'));
  return narrative;
}

/**
 * "Più della metà in azioni; criptovalute al 2,7%." — the dominant class and the smallest
 * one, the two facts a composition bar does not state out loud.
 */
export function describeComposition(
  classes: Array<{ assetClass: string; percentage: number }>,
): Narrative | null {
  if (classes.length === 0) return null;
  const sorted = [...classes].sort((a, b) => b.percentage - a.percentage);
  const top = sorted[0];
  const bottom = sorted[sorted.length - 1];

  if (sorted.length === 1) {
    return [prose(`Tutto in ${classNoun(top.assetClass)}.`)];
  }

  // The article follows the figure AS PRINTED (`atThePercent`, the app's one rule): «allo 0,1%»
  // for a class rounding to zero, «all'8,5%» before a vowel-initial number name. A hard-coded
  // «al » printed «carry al 0,1%», which is not Italian.
  const lead: Narrative =
    top.percentage > 50
      ? [prose(`Più della metà in ${classNoun(top.assetClass)}`)]
      : [
          prose(`${capitalise(classNoun(top.assetClass))} ${atThePercent(top.percentage, 1)}`),
          figure(formatPercentage(top.percentage, 1)),
        ];

  return [
    ...lead,
    prose(`; ${classNoun(bottom.assetClass)} ${atThePercent(bottom.percentage, 1)}`),
    figure(formatPercentage(bottom.percentage, 1)),
    prose('.'),
  ];
}

/**
 * "Pesa 86 € al mese, lo 0,25% del patrimonio." — the annual portfolio cost as a monthly figure
 * and as a share of the gross total (TER and stamp duty together); the share is dropped when
 * there is no total to measure against.
 */
export function describeCosts(annualCost: number, totalValue = 0): Narrative | null {
  if (annualCost <= 0) return null;
  const narrative: Narrative = [prose('Pesa '), figure(cachedFormatCurrencyEUR(annualCost / 12, true)), prose(' al mese')];
  if (totalValue > 0) {
    narrative.push(prose(', lo '), figure(formatPercentage((annualCost / totalValue) * 100)), prose(' del patrimonio'));
  }
  narrative.push(prose('.'));
  return narrative;
}

/**
 * The overview payload's top categories as the ranking Tracciamento's reading understands
 * (`describeCategoryShare`): the same five rows, the period total, and the residual when the
 * five do not add up to it — so the Panoramica's two category tiles read «Il 29% va in Mutuo;
 * le prime tre fanno il 68%» with the words Tracciamento uses, never a second phrasing.
 */
export function rankingFromOverview(rows: DashboardOverviewCategoryAmount[], total: number): CategoryRanking {
  const shown = rows.reduce((sum, row) => sum + row.amount, 0);
  const remainderAmount = Math.max(0, total - shown);
  return {
    rows: rows.map((row) => ({
      category: row.category,
      categoryKey: row.categoryKey ?? row.category,
      amount: row.amount,
      percentage: row.percentage,
    })),
    total,
    remainder:
      remainderAmount >= 1 ? { amount: remainderAmount, percentage: total > 0 ? (remainderAmount / total) * 100 : 0 } : null,
  };
}

/** "Mancano 62.000 €." — the distance to the goal, or the fact that it is reached. */
export function describeGoal(currentValue: number, targetAmount: number): Narrative | null {
  if (targetAmount <= 0) return null;
  const missing = targetAmount - currentValue;
  if (missing <= 0) return [prose('Obiettivo raggiunto.')];
  return [prose('Mancano '), figure(cachedFormatCurrencyEUR(missing, true)), prose('.')];
}

// The projection rule lives in spendingProjection.ts (SDK-free, shared with the budget layer
// and the emails); re-exported here for the two tiles that read it from this module.
export { projectMonthEndSpending } from '@/lib/utils/spendingProjection';
