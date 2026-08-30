/**
 * The words of Cashflow › Tracciamento: the verdict that answers «come sta andando il mese
 * (o il periodo scelto)?» before any number, and the one-line reading under each tile.
 *
 * Design: every function is pure and returns a `Narrative` (segments with `mono`/`sign`), so
 * the component sets figures in Geist Mono and colours them by sign while the prose stays
 * prose; no component writes copy. Each phrasing is pinned by a test. The Narrative Honesty
 * Rule holds throughout: a missing input drops its clause (no previous period → no
 * comparison; no income → no rate), never a placeholder. Italian grammar is data, not a
 * guess at render: the tense follows whether the period is still running, the article
 * follows the percentage AS PRINTED (`articleForPercent`), «ad» before a vowel month.
 *
 * Percentages go through chartService's it-IT formatter (comma decimals); currency through
 * `cachedFormatCurrencyEUR` (nbsp before €, four-digit amounts ungrouped).
 */

import type { Period } from '@/lib/utils/period';
import type { Narrative, NarrativeSegment, PageVerdictModel, VerdictTone } from '@/lib/utils/narrative';
import type {
  CategoryRanking,
  MonthFlow,
  MovementsSummary,
  PeriodCashflowTotals,
  PeriodDelta,
  SavingsHistory,
  ScheduledSlice,
} from '@/lib/utils/tracciamentoSummary';
import { format } from 'date-fns';
import { it } from 'date-fns/locale';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import { formatNumber, formatPercentage } from '@/lib/services/chartService';
import { articleForPercent, ofThePercent, pluralArticleFor } from '@/lib/utils/patrimonioNarrative';
import { getItalyDate, getItalyMonthYear } from '@/lib/utils/dateHelpers';
import { MONTH_NAMES } from '@/lib/constants/months';
import { MONTH_NAMES_SHORT } from '@/lib/utils/period';
import { isYearToDate, resolveAnchorMonth } from '@/lib/utils/tracciamentoSummary';

/** A month saving this share of its income or more is going well (the Panoramica's bar). */
export const GOOD_SAVINGS_RATE = 20;

// ─── Segment helpers ──────────────────────────────────────────────────────────

const prose = (text: string): NarrativeSegment => ({ text });
const figure = (text: string): NarrativeSegment => ({ text, mono: true });
const signed = (text: string, sign: 'positive' | 'negative'): NarrativeSegment => ({ text, mono: true, sign });

/** A whole euro figure, compact (no decimals) — the verdict and the readings never need cents. */
const euro = (value: number) => cachedFormatCurrencyEUR(Math.abs(value), true);

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function pluralize(count: number, singular: string, plural: string): string {
  return count === 1 ? singular : plural;
}

function monthInSentence(month: number): string {
  return MONTH_NAMES[month - 1].toLowerCase();
}

/** "a maggio" but "ad agosto" — the euphonic d before a vowel. */
function withPrepositionA(monthName: string): string {
  return /^[aeiou]/i.test(monthName) ? `ad ${monthName}` : `a ${monthName}`;
}

/** "il 40%", "l'8%", "lo 0%" — the printed integer decides the article. */
function percentWithArticle(value: number): NarrativeSegment[] {
  return [prose(articleForPercent(value, 0)), figure(formatPercentage(value, 0))];
}

/**
 * A delta as the reader sees it: one decimal, so a change that prints as 0,0% is narrated as
 * no change — the direction follows the figure AS PRINTED, like the article does.
 */
export function printedDelta(delta: number): number {
  return Math.round(Math.abs(delta) * 10) / 10;
}

/**
 * "gen–ago 2025" — January to the period's anchor month, one year earlier. The only honest
 * comparison for a window that stops mid-year: a full previous year against eight months
 * reads as a drop by construction.
 */
function sameMonthsLastYear(period: Period, now: Date): string {
  const anchor = resolveAnchorMonth(period, now);
  return `${MONTH_NAMES_SHORT[0].toLowerCase()}–${MONTH_NAMES_SHORT[anchor.month - 1].toLowerCase()} ${anchor.year - 1}`;
}

// ─── The period as a grammatical subject ──────────────────────────────────────

export interface PeriodSubject {
  /** The subject of the headline: "Agosto", "Agosto 2025", "Il 2026", "Il periodo". */
  subject: string;
  /** The in-sentence form: "ad agosto", "nel 2026", "nel periodo". */
  inPeriod: string;
  /** Whether the period is still running today — decides the tense. */
  ongoing: boolean;
}

export function describePeriodSubject(period: Period, now: Date): PeriodSubject {
  const today = getItalyMonthYear(now);
  if (period.kind === 'month') {
    const sameYear = period.year === today.year;
    const yearSuffix = sameYear ? '' : ` ${period.year}`;
    const name = monthInSentence(period.month);
    return {
      subject: `${MONTH_NAMES[period.month - 1]}${yearSuffix}`,
      inPeriod: `${withPrepositionA(name)}${yearSuffix}`,
      ongoing: sameYear && period.month === today.month,
    };
  }
  if (period.kind === 'year') {
    return { subject: `Il ${period.year}`, inPeriod: `nel ${period.year}`, ongoing: period.year === today.year };
  }
  // «Il 2026 finora» — never the bare year, which names the whole twelve months.
  if (period.kind === 'ytd') {
    return {
      subject: `Il ${period.year} finora`,
      inPeriod: `nel ${period.year} finora`,
      ongoing: period.year === today.year && period.throughMonth >= today.month,
    };
  }
  const todayDate = getItalyDate(now);
  todayDate.setHours(0, 0, 0, 0);
  return { subject: 'Il periodo', inPeriod: 'nel periodo', ongoing: period.to >= todayDate };
}

function previousMonthIndex(month: number): number {
  return month === 1 ? 12 : month - 1;
}

/**
 * "su luglio", "sul 2025", "su gen–ago 2025" (a year still running is compared with the same
 * months of the previous year) — how the previous period is named; null for a custom range.
 */
export function describeComparisonPhrase(period: Period, now: Date): string | null {
  if (period.kind === 'month') return `su ${monthInSentence(previousMonthIndex(period.month))}`;
  if (period.kind === 'ytd') return `su ${sameMonthsLastYear(period, now)}`;
  if (period.kind === 'year') return isYearToDate(period, now) ? `su ${sameMonthsLastYear(period, now)}` : `sul ${period.year - 1}`;
  return null;
}

/** "luglio", "2025", "gen–ago 2025" — the previous period as the caption of a delta ("vs luglio"); null for a custom range. */
export function describePreviousPeriodLabel(period: Period, now: Date): string | null {
  if (period.kind === 'month') return monthInSentence(previousMonthIndex(period.month));
  if (period.kind === 'ytd') return sameMonthsLastYear(period, now);
  if (period.kind === 'year') return isYearToDate(period, now) ? sameMonthsLastYear(period, now) : String(period.year - 1);
  return null;
}

/** "A luglio", "Ad agosto" — the row label of last month's figure beside a projection; months only. */
export function describeProjectionReference(period: Period): string | null {
  if (period.kind !== 'month') return null;
  return capitalise(withPrepositionA(monthInSentence(previousMonthIndex(period.month))));
}

// ─── Verdict ──────────────────────────────────────────────────────────────────

export interface CashflowVerdictInput {
  period: Period;
  now: Date;
  totals: PeriodCashflowTotals;
  /** Against the previous period; null when there is none (a custom range). */
  delta: PeriodDelta | null;
  /**
   * The part of the period that has not happened yet — instalments and recurring rows dated
   * ahead. The totals above INCLUDE it, so the verdict closes by naming it: without that
   * sentence a forecast would read as a fact.
   */
  scheduled: ScheduledSlice;
}

/**
 * "da qui a fine mese", "da qui a fine anno", "da qui al 20 marzo" — how far the scheduled
 * figure reaches. It is the PERIOD's end, not the last scheduled row's: the amount is
 * bounded by the window the reader is looking at, and «361 € entro ottobre» would be a
 * different (and smaller) claim than the figure actually is.
 *
 * Null for a period with no end to name — the clause is then dropped rather than guessed
 * (the Narrative Honesty Rule).
 */
export function describeScheduledHorizon(period: Period, now: Date): string | null {
  const today = getItalyMonthYear(now);
  const endOfMonthNamed = (year: number, month: number) =>
    year === today.year && month === today.month ? 'a fine mese' : `a fine ${monthInSentence(month)}`;

  if (period.kind === 'month') return endOfMonthNamed(period.year, period.month);
  // A ytd window runs to the END of today's month (period.ts → periodToRange), so it DOES carry
  // the rest of this month: its horizon is that month's end.
  if (period.kind === 'ytd') return endOfMonthNamed(period.year, period.throughMonth);
  if (period.kind === 'year') return period.year === today.year ? 'a fine anno' : `a fine ${period.year}`;
  // A custom range ends on a day, not on a calendar unit: name the day.
  return `al ${format(period.to, 'd MMMM', { locale: it })}`;
}

/**
 * "Nel totale ci sono ancora 1850 € di spese e 500 € di entrate già in calendario da qui a fine
 * anno." — the second sentence of the verdict whenever the period reaches past today; null when
 * it does not.
 *
 * It opens on «Nel totale» and not on «In calendario» because the amount is INSIDE the figure
 * the verdict has just printed, not beside it. The bare existential form shipped until
 * 2026-08-30 and read as an addition — «spese 2910 €. In calendario ci sono ancora 1850 €»
 * invites the reader to sum to 4760, when 1850 is part of the 2910. Centri di Costo says the
 * same words about a total that genuinely EXCLUDES them, which is the other half of the reason
 * this one has to be unambiguous.
 *
 * The verb agrees with the AMOUNT, not with the number of clauses: «1850 €» is plural however
 * few clauses follow it. Only a lone «1 €» takes the singular, and «1 €» means the figure AS
 * PRINTED — the euro figures here are compact, so 1,40 € prints as «1 €» and reads as one.
 * Same rule as `articleForPercent`: Italian grammar follows what the reader sees.
 *
 * `horizon` closes the sentence with how far the figure reaches («a fine mese»); without one
 * the sentence still stands, it just stops at the amount.
 */
export function scheduledSentence(scheduled: ScheduledSlice, horizon: string | null): Narrative | null {
  const amounts: number[] = [];
  const parts: Narrative[] = [];
  if (scheduled.expenses > 0) {
    amounts.push(scheduled.expenses);
    parts.push([figure(euro(scheduled.expenses)), prose(' di spese')]);
  }
  if (scheduled.income > 0) {
    amounts.push(scheduled.income);
    parts.push([figure(euro(scheduled.income)), prose(' di entrate')]);
  }
  if (parts.length === 0) return null;

  const singular = amounts.length === 1 && Math.round(amounts[0]) === 1;
  const narrative: Narrative = [prose(' Nel totale '), prose(singular ? "c'è ancora " : 'ci sono ancora ')];
  parts.forEach((part, index) => {
    if (index > 0) narrative.push(prose(' e '));
    narrative.push(...part);
  });
  narrative.push(prose(' già in calendario'));
  if (horizon) narrative.push(prose(` da qui ${horizon}`));
  narrative.push(prose('.'));
  return narrative;
}

function resolveTone(savingsRate: number | null, expenses: number): VerdictTone {
  if (savingsRate === null) return expenses > 0 ? 'negative' : 'neutral';
  if (savingsRate < 0) return 'negative';
  return savingsRate >= GOOD_SAVINGS_RATE ? 'positive' : 'neutral';
}

function resolveHeadline(subject: PeriodSubject, totals: PeriodCashflowTotals): string {
  const { savingsRate, income, expenses } = totals;
  if (income <= 0 && expenses <= 0) return `Nessuna entrata né spesa ${subject.inPeriod}.`;
  if (savingsRate === null) return `${capitalise(subject.inPeriod)} hai speso senza entrate.`;
  if (savingsRate < 0) return `${capitalise(subject.inPeriod)} hai speso più di quanto è entrato.`;
  if (savingsRate >= GOOD_SAVINGS_RATE) return `${subject.subject} ${subject.ongoing ? 'sta andando' : 'è andato'} bene.`;
  return `${subject.subject} ${subject.ongoing ? 'tiene' : 'ha tenuto'}, ma con poco margine.`;
}

/** ", in calo del 6,4% su luglio" / ", in aumento del …" / ", invariate su luglio" — or nothing. */
function expensesDeltaClause(delta: PeriodDelta | null, comparison: string | null): Narrative {
  if (!delta || delta.expenses === null || !comparison) return [];
  const printed = printedDelta(delta.expenses);
  if (printed === 0) return [prose(`, invariate ${comparison}`)];
  const falling = delta.expenses < 0;
  return [
    prose(`, in ${falling ? 'calo' : 'aumento'} ${ofThePercent(printed)}`),
    signed(formatPercentage(printed, 1), falling ? 'positive' : 'negative'),
    prose(` ${comparison}`),
  ];
}

/**
 * The headline + the sentence under it. The sentence opens with the savings (or the
 * deficit), then the two totals, then the spending delta — each clause present only when
 * its input is: no income → no rate, no previous period → no comparison.
 */
export function buildCashflowVerdict(input: CashflowVerdictInput): PageVerdictModel {
  const subject = describePeriodSubject(input.period, input.now);
  const { totals } = input;
  const headline = resolveHeadline(subject, totals);
  const tone = resolveTone(totals.savingsRate, totals.expenses);

  if (totals.income <= 0 && totals.expenses <= 0) {
    // A transfer is a movement, not a flow: the inventory counts it, the verdict must not deny it.
    const sentence =
      totals.transferCount > 0
        ? [prose(`Solo ${totals.transferCount} ${pluralize(totals.transferCount, 'trasferimento', 'trasferimenti')} tra i tuoi conti.`)]
        : [prose('Nessun movimento registrato.')];
    return { headline, tone, sentence: [...sentence, ...(scheduledSentence(input.scheduled, describeScheduledHorizon(input.period, input.now)) ?? [])] };
  }

  const opening = capitalise(subject.inPeriod);
  const sentence: Narrative = [];
  if (totals.savingsRate === null) {
    sentence.push(prose(`${opening} nessuna entrata: spese `), figure(euro(totals.expenses)));
  } else {
    if (totals.savingsRate < 0) {
      sentence.push(
        prose(`${opening} le spese ${subject.ongoing ? 'superano' : 'hanno superato'} le entrate di `),
        signed(euro(totals.net), 'negative'),
      );
    } else {
      sentence.push(
        prose(`${opening} hai messo da parte `),
        ...percentWithArticle(totals.savingsRate),
        prose(' ('),
        signed(euro(totals.net), 'positive'),
        prose(')'),
      );
    }
    sentence.push(prose(': entrate '), figure(euro(totals.income)), prose(', spese '), figure(euro(totals.expenses)));
  }
  sentence.push(...expensesDeltaClause(input.delta, describeComparisonPhrase(input.period, input.now)), prose('.'));
  sentence.push(...(scheduledSentence(input.scheduled, describeScheduledHorizon(input.period, input.now)) ?? []));

  return { headline, tone, sentence };
}

// ─── Tile readings ────────────────────────────────────────────────────────────

/**
 * "Entrate in aumento del 3,2% su luglio; per ogni euro speso ne entrano 1,67." — the two
 * facts the verdict does not state: how income moved, and the coverage ratio (kept next to
 * the savings rate on purpose: same relationship, different unit).
 */
export function describePeriodCashflow(totals: PeriodCashflowTotals, delta: PeriodDelta | null, comparison: string | null): Narrative | null {
  const clauses: Narrative[] = [];

  if (delta && delta.income !== null && comparison) {
    const printed = printedDelta(delta.income);
    if (printed === 0) {
      clauses.push([prose(`entrate invariate ${comparison}`)]);
    } else {
      const rising = delta.income > 0;
      clauses.push([
        prose(`entrate in ${rising ? 'aumento' : 'calo'} ${ofThePercent(printed)}`),
        signed(formatPercentage(printed, 1), rising ? 'positive' : 'negative'),
        prose(` ${comparison}`),
      ]);
    }
  }
  if (totals.coverageRatio !== null) {
    clauses.push([prose('per ogni euro speso ne entrano '), figure(formatNumber(totals.coverageRatio, 2))]);
  }
  if (clauses.length === 0) return null;

  const narrative: Narrative = [];
  clauses.forEach((clause, index) => {
    if (index > 0) narrative.push(prose('; '));
    narrative.push(...clause);
  });
  narrative[0] = { ...narrative[0], text: capitalise(narrative[0].text) };
  narrative.push(prose('.'));
  return narrative;
}

/**
 * "Il 40% va in Casa; le prime tre fanno il 68%." / "L'87% arriva da Stipendio." — the
 * concentration a ranked list shows but does not say. The phrasing works for any category
 * name because the name is never the grammatical subject.
 */
export function describeCategoryShare(ranking: CategoryRanking, kind: 'expenses' | 'income'): Narrative | null {
  const [top, ...rest] = ranking.rows;
  if (!top) return null;
  const verb = kind === 'income' ? 'arriva da' : 'va in';

  const preposition = kind === 'income' ? 'da' : 'in';
  if (rest.length === 0) return [prose(`Tutto ${preposition} ${top.category}.`)];

  // Decided on the printed integer: a 99,6% share prints as 100% and must not claim it all.
  const narrative: Narrative =
    Math.round(top.percentage) >= 100
      ? [prose(`Quasi tutto ${preposition} ${top.category}`)]
      : (() => {
          const [article, share] = percentWithArticle(top.percentage);
          return [{ ...article, text: capitalise(article.text) }, share, prose(` ${verb} ${top.category}`)];
        })();

  // The top-three clause only when something lies beyond them — otherwise it is a tautology.
  const beyondThree = ranking.rows.length > 3 || ranking.remainder !== null;
  if (kind === 'expenses' && ranking.rows.length >= 3 && beyondThree) {
    const topThree = ranking.rows.slice(0, 3).reduce((sum, row) => sum + row.percentage, 0);
    narrative.push(
      prose('; le prime tre fanno '),
      ...(Math.round(topThree) >= 100 ? [prose('quasi tutto')] : percentWithArticle(topThree)),
    );
  }
  narrative.push(prose('.'));
  return narrative;
}

/** A month's rate as printed in a history reading: "44%", or "−8%" with the loss colour. */
function historyRate(rate: number): NarrativeSegment {
  const text = formatPercentage(Math.abs(rate), 0);
  return rate < 0 ? signed(`−${text}`, 'negative') : figure(text);
}

/**
 * "In media il 31%; il mese migliore è stato aprile (44%), il peggiore dicembre (12%)." —
 * only over the months that had income; one measured month is named as such, none → null.
 */
export function describeSavingsHistory(history: SavingsHistory): Narrative | null {
  if (history.measuredCount === 0 || history.average === null || !history.best || !history.worst) return null;

  if (history.measuredCount === 1) {
    return [
      prose(`Un solo mese con entrate: ${monthInSentence(history.best.month)} (`),
      historyRate(history.best.savingsRate ?? 0),
      prose(').'),
    ];
  }

  // A negative average takes no article ("In media −8%"): the elision would bind to a minus.
  const average: Narrative = history.average < 0 ? [historyRate(history.average)] : percentWithArticle(history.average);

  // The running month was left out of the ranking: say over how many closed months it runs.
  const scope: Narrative = history.ongoing
    ? [prose(' su '), figure(String(history.closedCount)), prose(` ${pluralize(history.closedCount, 'mese chiuso', 'mesi chiusi')}`)]
    : [];

  // Equal rates everywhere are not a ranking.
  if ((history.best.savingsRate ?? 0) === (history.worst.savingsRate ?? 0)) {
    return [prose('In media '), ...average, ...scope, prose(`, uguale in tutti ${pluralArticleFor(history.measuredCount)} ${history.measuredCount} mesi con entrate.`)];
  }

  return [
    prose('In media '),
    ...average,
    ...scope,
    prose(`; il mese migliore è stato ${monthInSentence(history.best.month)} (`),
    historyRate(history.best.savingsRate ?? 0),
    prose(`), il peggiore ${monthInSentence(history.worst.month)} (`),
    historyRate(history.worst.savingsRate ?? 0),
    prose(').'),
  ];
}

/** Whether the history ends on the current Italian month — what makes «ultimi N mesi» true. */
function endsToday(history: SavingsHistory, now: Date): boolean {
  const last = history.months[history.months.length - 1];
  const today = getItalyMonthYear(now);
  return !!last && last.year === today.year && last.month === today.month;
}

/** "set 2024 – ago 2025" — the bounds of a month window, short names and years in mono. */
function windowBounds(first: MonthFlow, last: MonthFlow): Narrative {
  return [
    prose(`${MONTH_NAMES_SHORT[first.month - 1].toLowerCase()} `),
    figure(String(first.year)),
    prose(` – ${MONTH_NAMES_SHORT[last.month - 1].toLowerCase()} `),
    figure(String(last.year)),
  ];
}

/**
 * How a month window is named: «ultimi 12 mesi» only when it ends today (the figures are
 * right either way — the label must not call a window anchored on May 2025 «ultimi»), else
 * its bounds, «set 2024 – ago 2025».
 */
export function describeMonthWindow(months: MonthFlow[], now: Date): Narrative {
  if (months.length === 0) return [prose('nessun mese')];
  const last = months[months.length - 1];
  const today = getItalyMonthYear(now);
  if (last.year === today.year && last.month === today.month) {
    return [prose('ultimi '), figure(String(months.length)), prose(' mesi')];
  }
  return windowBounds(months[0], last);
}

/** The sub-eyebrow of the hero's bars: «Ultimi 6 mesi», «6 mesi fino a maggio 2025», or «Mese per mese» for a year. */
export function describeFlowWindow(flows: MonthFlow[], isYear: boolean, now: Date): Narrative {
  if (isYear) return [prose('Mese per mese')];
  if (flows.length === 0) return [prose('Nessun mese')];
  const last = flows[flows.length - 1];
  const today = getItalyMonthYear(now);
  if (last.year === today.year && last.month === today.month) {
    return [prose('Ultimi '), figure(String(flows.length)), prose(' mesi')];
  }
  return [figure(String(flows.length)), prose(` mesi fino ${withPrepositionA(monthInSentence(last.month))} `), figure(String(last.year))];
}

/** The footer of the savings tile: how many of the measured months closed in deficit, named up to three. */
export function describeDeficitMonths(history: SavingsHistory, now: Date): Narrative | null {
  if (history.measuredCount === 0) return null;
  const deficit = history.deficitMonths;
  if (deficit.length === 0) {
    const { measuredCount, closedCount, months } = history;
    if (measuredCount === 1) return [prose("Nessun deficit nell'unico mese con entrate.")];
    if (measuredCount < closedCount) {
      return [prose(`Nessun mese in deficit ne${pluralArticleFor(measuredCount)} `), figure(String(measuredCount)), prose(' con entrate.')];
    }
    if (history.ongoing) {
      return [prose(`Nessun mese in deficit ne${pluralArticleFor(closedCount)} `), figure(String(closedCount)), prose(' chiusi.')];
    }
    if (endsToday(history, now)) return [prose('Nessun mese in deficit negli ultimi '), figure(String(months.length)), prose('.')];
    const last = months[months.length - 1];
    return [
      prose('Nessun mese in deficit nei '),
      figure(String(months.length)),
      prose(` mesi fino ${withPrepositionA(monthInSentence(last.month))} `),
      figure(String(last.year)),
      prose('.'),
    ];
  }
  const names = deficit.slice(0, 3).map((m) => monthInSentence(m.month));
  const hidden = deficit.length - names.length;
  if (hidden > 0) names.push(hidden === 1 ? 'un altro' : `altri ${hidden}`);
  const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} e ${names[names.length - 1]}`;
  return [figure(String(deficit.length)), prose(` ${pluralize(deficit.length, 'mese', 'mesi')} in deficit: ${list}.`)];
}

/**
 * "47 movimenti: 40 spese, 5 entrate e 2 trasferimenti, di cui 2 in calendario (406 €); la
 * voce più grande è Stipendio (4200 €)." — the inventory's own count, by type, and its
 * largest row.
 *
 * The «di cui … in calendario» clause is what keeps the list honest: the register lists rows
 * dated after today, the figures above it COUNT them, and this is the sentence that decomposes
 * the count the same way `scheduledSentence` decomposes the amount. Both say «di cui» / «nel
 * totale» on purpose — the page speaks one dialect, and neither clause is an addition.
 */
export function describeMovements(summary: MovementsSummary): Narrative | null {
  if (summary.count === 0) return null;

  const parts: Narrative[] = [];
  if (summary.expenseCount > 0) parts.push([figure(String(summary.expenseCount)), prose(` ${pluralize(summary.expenseCount, 'spesa', 'spese')}`)]);
  if (summary.incomeCount > 0) parts.push([figure(String(summary.incomeCount)), prose(` ${pluralize(summary.incomeCount, 'entrata', 'entrate')}`)]);
  if (summary.transferCount > 0) {
    parts.push([figure(String(summary.transferCount)), prose(` ${pluralize(summary.transferCount, 'trasferimento', 'trasferimenti')}`)]);
  }

  const narrative: Narrative = [figure(String(summary.count)), prose(` ${pluralize(summary.count, 'movimento', 'movimenti')}: `)];
  parts.forEach((part, index) => {
    if (index > 0) narrative.push(prose(index === parts.length - 1 ? ' e ' : ', '));
    narrative.push(...part);
  });
  if (summary.scheduled.count > 0) {
    narrative.push(prose(', di cui '), figure(String(summary.scheduled.count)), prose(' in calendario ('), figure(euro(summary.scheduled.total)), prose(')'));
  }
  if (summary.largest) {
    narrative.push(prose(`; la voce più grande è ${summary.largest.label} (`), figure(euro(summary.largest.amount)), prose(')'));
  }
  narrative.push(prose('.'));
  return narrative;
}

/** The aside of the Movimenti tile: "47 voci", or "12 di 47 voci" when the toolbar narrows the list. */
export function describeMovementsCount(shown: number, total: number): Narrative {
  if (total === 0) return [prose('nessuna voce')];
  const voci: Narrative = [figure(String(total)), prose(` ${pluralize(total, 'voce', 'voci')}`)];
  return shown === total ? voci : [figure(String(shown)), prose(' di '), ...voci];
}
