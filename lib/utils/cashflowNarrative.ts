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
 * Percentages go through the it-IT formatter of lib/utils/formatters (comma decimals); currency through
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
import { cachedFormatCurrencyEUR, formatEuroMinus, withTypographicMinus } from '@/lib/utils/formatters';
import type { SavingsReading } from '@/lib/utils/savingsRate';
import { formatNumberIt as formatNumber, formatPercentageIt as formatPercentage } from '@/lib/utils/formatters';
import { articleForPercent, ofThePercent, pluralArticleFor } from '@/lib/utils/patrimonioNarrative';
import { getItalyDate, getItalyMonthYear } from '@/lib/utils/dateHelpers';
import { MONTH_NAMES } from '@/lib/constants/months';
import { MONTH_NAMES_SHORT } from '@/lib/utils/period';
import { TRACKING_SECTION_IDS, comparedDaysOfPreviousMonth, isYearToDate, resolveAnchorMonth, settleTotals } from '@/lib/utils/tracciamentoSummary';
import type { RowAnswerMap } from '@/components/ui/row-answers';

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
  // A period that has not ENDED is ongoing — the current unit and every future one alike: a
  // month of instalments dated next year is not «andato», it has not happened (2026-09-14; the
  // picker offers 2043 because a plan reaches it, and the verdict said «nel 2043 hai speso»).
  if (period.kind === 'month') {
    const sameYear = period.year === today.year;
    const yearSuffix = sameYear ? '' : ` ${period.year}`;
    const name = monthInSentence(period.month);
    return {
      subject: `${MONTH_NAMES[period.month - 1]}${yearSuffix}`,
      inPeriod: `${withPrepositionA(name)}${yearSuffix}`,
      ongoing: period.year > today.year || (sameYear && period.month >= today.month),
    };
  }
  if (period.kind === 'year') {
    return { subject: `Il ${period.year}`, inPeriod: `nel ${period.year}`, ongoing: period.year >= today.year };
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
 * months of the previous year), "sui primi 14 giorni di agosto" (the month in progress is
 * compared with the same days of the previous month, `previousComparisonWindow`) — how the
 * previous period is named; null for a custom range and for a month not yet begun.
 */
export function describeComparisonPhrase(period: Period, now: Date): string | null {
  if (period.kind === 'month') {
    const previous = monthInSentence(previousMonthIndex(period.month));
    const days = comparedDaysOfPreviousMonth(period, now);
    if (days === null) return isFutureMonth(period, now) ? null : `su ${previous}`;
    return days === 1 ? `sul primo giorno di ${previous}` : `sui primi ${days} giorni di ${previous}`;
  }
  if (period.kind === 'ytd') return `su ${sameMonthsLastYear(period, now)}`;
  if (period.kind === 'year') return isYearToDate(period, now) ? `su ${sameMonthsLastYear(period, now)}` : `sul ${period.year - 1}`;
  return null;
}

/**
 * "luglio", "2025", "gen–ago 2025", "1–14 ago" — the previous period as the caption of a delta
 * ("vs luglio"); null for a custom range and for a month not yet begun.
 */
export function describePreviousPeriodLabel(period: Period, now: Date): string | null {
  if (period.kind === 'month') {
    const days = comparedDaysOfPreviousMonth(period, now);
    if (days === null) return isFutureMonth(period, now) ? null : monthInSentence(previousMonthIndex(period.month));
    const short = MONTH_NAMES_SHORT[previousMonthIndex(period.month) - 1].toLowerCase();
    return days === 1 ? `1 ${short}` : `1–${days} ${short}`;
  }
  if (period.kind === 'ytd') return sameMonthsLastYear(period, now);
  if (period.kind === 'year') return isYearToDate(period, now) ? sameMonthsLastYear(period, now) : String(period.year - 1);
  return null;
}

/** A month that starts after today's — nothing lived on its side of a comparison yet. */
function isFutureMonth(period: Extract<Period, { kind: 'month' }>, now: Date): boolean {
  const today = getItalyMonthYear(now);
  return period.year > today.year || (period.year === today.year && period.month > today.month);
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

/**
 * The same words as a caption of their own — the leading space of `scheduledSentence` dropped, so
 * the clause can open a line instead of closing a sentence. The `scope` of a verdict whose strip
 * prints totals that CONTAIN the calendar (The Binding-Clause Rule, since 2026-10-10: rendered at
 * every width by `PageVerdict`, after the strip on a phone and under the paragraph at 1440).
 */
export function scheduledScope(scheduled: ScheduledSlice, horizon: string | null): Narrative | null {
  const sentence = scheduledSentence(scheduled, horizon);
  if (!sentence) return null;
  return [{ ...sentence[0], text: sentence[0].text.trimStart() }, ...sentence.slice(1)];
}

/**
 * Tracciamento's scope line: «Nel totale ci sono ancora 1850 € di spese e 500 € di entrate già in
 * calendario da qui a fine mese.» under the three cells, which print the PERIOD's totals;
 * `null` with nothing in the calendar, and the line is simply absent. Its words are
 * `scheduledSentence`'s, the one source of that clause. Analisi gets a scope line of its own in
 * the same form (since 2026-10-14, `describeAnalisiScope` over its own horizon): what it shares is
 * `scheduledScope` above, not this function.
 */
export function describeTrackingScope(period: Period, now: Date, scheduled: ScheduledSlice): Narrative | null {
  return scheduledScope(scheduled, describeScheduledHorizon(period, now));
}

/**
 * The two labels of «Il perché» on a phone (The Binding-Clause Rule): the first sentence restates the strip's
 * three figures, so without a calendar the title stands alone and the whole sentence is «le cifre
 * del periodo»; with a calendar and a lived part, the first sentence (what has happened) stands
 * and the second — «dove chiude il periodo» — goes behind the tap.
 */
export const TRACKING_REST_LABEL_FIGURES = 'le cifre del periodo';
export const TRACKING_REST_LABEL_CLOSING = 'dove chiude il periodo';

/**
 * What the closed rows of Tracciamento say beside their eyebrow (The Closed-Row Rule): words, never
 * a figure. Movimenti is the exception that is no exception — its count («12 di 24 voci»,
 * `describeMovementsCount`) is a count of rows, not of euro.
 */
export const TRACKING_CLOSED_ASIDES = {
  spese: 'per categoria',
  entrate: 'per categoria',
  risparmio: 'mese per mese',
} as const;

// The verdict branches on the TOTALS, never on `savingsRate === null`: a null rate is also a deficit
// beyond the savings floor (`meaningfulSavingsRate`, 2026-11-12), and 3 € in with 500 € out is not
// «senza entrate».
function resolveTone(totals: PeriodCashflowTotals): VerdictTone {
  if (totals.income <= 0) return totals.expenses > 0 ? 'negative' : 'neutral';
  if (totals.net < 0) return 'negative';
  return totals.savingsRate !== null && totals.savingsRate >= GOOD_SAVINGS_RATE ? 'positive' : 'neutral';
}

function resolveHeadline(subject: PeriodSubject, totals: PeriodCashflowTotals, settled = false): string {
  const { savingsRate, income, expenses } = totals;
  // Judging the lived part with a calendar still ahead: an empty lived part is «not yet», not «none».
  if (income <= 0 && expenses <= 0) return settled ? `Nessun movimento ancora ${subject.inPeriod}.` : `Nessuna entrata né spesa ${subject.inPeriod}.`;
  if (income <= 0) return `${capitalise(subject.inPeriod)} hai speso senza entrate.`;
  if (totals.net < 0) return `${capitalise(subject.inPeriod)} hai speso più di quanto è entrato.`;
  if (savingsRate === null) return `${subject.subject} ${subject.ongoing ? 'tiene' : 'ha tenuto'}, ma con poco margine.`;
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
 * The first sentence: the savings (or the deficit), then the two totals, then the spending
 * delta — each clause present only when its input is: no income → no rate, no previous period →
 * no comparison. `opening` is the period as the sentence's subject («Ad agosto», «Nel 2026
 * finora»); the tense follows `subject.ongoing`.
 */
function figuresSentence(opening: string, subject: PeriodSubject, totals: PeriodCashflowTotals, delta: PeriodDelta | null, comparison: string | null): Narrative {
  const sentence: Narrative = [];
  if (totals.income <= 0) {
    sentence.push(prose(`${opening} nessuna entrata: spese `), figure(euro(totals.expenses)));
  } else {
    if (totals.net < 0 || totals.savingsRate === null) {
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
  sentence.push(...expensesDeltaClause(delta, comparison), prose('.'));
  return sentence;
}

/** «il mese», «l'anno», «il periodo» — what «chiude» in the calendar sentence. */
function closingSubject(period: Period): string {
  if (period.kind === 'month') return 'il mese';
  if (period.kind === 'year') return "l'anno";
  return 'il periodo';
}

/**
 * "Con 1297 € di spese e 2456 € di entrate già in calendario da qui a fine mese, il mese chiude
 * a +805 € (il 29%)." — the second sentence of a verdict whose period reaches past today: where
 * the calendar takes the figures the first sentence has just judged.
 *
 * Both sides are ALWAYS named, an empty one as «nessuna entrata attesa» / «nessuna spesa
 * attesa»: the two are materialised differently (an instalment plan writes its future rows, a
 * salary is not recurring — `canTypeRecur`), so a running year holds three months of instalments
 * and no income, and a sentence naming only the side that exists would let the 4% it produces
 * pass for a measure. The outcome is the PERIOD's total, the figure the tiles print, so the two
 * sentences meet on the same number.
 */
function calendarSentence(period: Period, now: Date, totals: PeriodCashflowTotals, scheduled: ScheduledSlice): Narrative {
  const horizon = describeScheduledHorizon(period, now);
  const sides: Narrative[] = [];
  if (scheduled.expenses > 0) sides.push([figure(euro(scheduled.expenses)), prose(' di spese')]);
  if (scheduled.income > 0) sides.push([figure(euro(scheduled.income)), prose(' di entrate')]);
  const missing = scheduled.expenses > 0 && scheduled.income <= 0 ? 'nessuna entrata attesa' : scheduled.income > 0 && scheduled.expenses <= 0 ? 'nessuna spesa attesa' : null;

  const sentence: Narrative = [prose(' Con ')];
  sides.forEach((side, index) => {
    if (index > 0) sentence.push(prose(' e '));
    sentence.push(...side);
  });
  sentence.push(prose(' già in calendario'));
  if (horizon) sentence.push(prose(` da qui ${horizon}`));
  if (missing) sentence.push(prose(` e ${missing}`));
  sentence.push(prose(`, ${closingSubject(period)} chiude `));

  if (totals.income <= 0) {
    sentence.push(prose('con '), figure(euro(totals.expenses)), prose(' di spese e nessuna entrata.'));
  } else if (totals.net < 0) {
    sentence.push(prose('a '), signed(`−${euro(totals.net)}`, 'negative'), prose('.'));
  } else {
    sentence.push(prose('a '), signed(`+${euro(totals.net)}`, 'positive'));
    if (totals.savingsRate !== null) sentence.push(prose(' ('), ...percentWithArticle(totals.savingsRate), prose(')'));
    sentence.push(prose('.'));
  }
  return sentence;
}

/**
 * The headline + the sentence under it.
 *
 * With nothing in the calendar, the period's totals ARE what happened: one sentence, headline
 * and tone from the totals. With something still ahead — the month in progress, a running year,
 * a period not yet begun — the totals include a forecast (the owner's decision, declared on the
 * page), and the verdict judges what has HAPPENED (`settleTotals`): headline, tone and the first
 * sentence come from the lived part («A settembre finora …»), and a second sentence says where
 * the calendar takes it. Until 2026-09-14 the tone came from the whole span, so on the 14th a
 * salary dated the 15th made the month «andare bene».
 *
 * Where a phone cuts it (since 2026-10-12; The Binding-Clause Rule): the strip
 * under the title prints the period's three totals, so a sentence that restates them goes whole
 * behind «Il perché» (`leadLength: 0`) — without a calendar, or with the calendar alone (nothing
 * lived yet: the verdict IS the calendar sentence). With a calendar AND a lived part the first
 * sentence judges what happened on figures the strip does not print, and stands; the calendar
 * sentence goes behind the tap. A period with no strip at all (nothing in, nothing out) keeps
 * its one sentence whole: the title alone would say less than it (2026-10-12,
 * doc/guide/cashflow-tracciamento.md).
 */
export function buildCashflowVerdict(input: CashflowVerdictInput): PageVerdictModel {
  const subject = describePeriodSubject(input.period, input.now);
  const { totals, scheduled } = input;
  const comparison = describeComparisonPhrase(input.period, input.now);
  const hasCalendar = scheduled.expenses > 0 || scheduled.income > 0;

  if (!hasCalendar) {
    const headline = resolveHeadline(subject, totals);
    const tone = resolveTone(totals);
    if (totals.income <= 0 && totals.expenses <= 0) {
      // A transfer is a movement, not a flow: the inventory counts it, the verdict must not deny it.
      const sentence =
        totals.transferCount > 0
          ? [prose(`Solo ${totals.transferCount} ${pluralize(totals.transferCount, 'trasferimento', 'trasferimenti')} tra i tuoi conti.`)]
          : [prose('Nessun movimento registrato.')];
      return { headline, tone, sentence };
    }
    return {
      headline,
      tone,
      sentence: figuresSentence(capitalise(subject.inPeriod), subject, totals, input.delta, comparison),
      leadLength: 0,
      restLabel: TRACKING_REST_LABEL_FIGURES,
    };
  }

  const settled = settleTotals(totals, scheduled);
  const headline = resolveHeadline(subject, settled, true);
  const tone = resolveTone(settled);
  const calendar = calendarSentence(input.period, input.now, totals, scheduled);

  if (settled.income <= 0 && settled.expenses <= 0) {
    // Nothing lived yet: the calendar sentence stands alone (its leading space trimmed).
    return {
      headline,
      tone,
      sentence: [{ ...calendar[0], text: calendar[0].text.trimStart() }, ...calendar.slice(1)],
      leadLength: 0,
      restLabel: TRACKING_REST_LABEL_FIGURES,
    };
  }

  // «finora» marks the lived part; the ytd subject already says it.
  const opening = `${capitalise(subject.inPeriod)}${input.period.kind === 'ytd' ? '' : ' finora'}`;
  const lived = figuresSentence(opening, subject, settled, input.delta, comparison);
  return { headline, tone, sentence: [...lived, ...calendar], leadLength: lived.length, restLabel: TRACKING_REST_LABEL_CLOSING };
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
 * only over the measurable months (`rankedCount`: closed months whose reading is a rate, so a
 * month below the savings floor or without income is out, 2026-11-14); one is named as such,
 * none → null.
 */
export function describeSavingsHistory(history: SavingsHistory): Narrative | null {
  if (history.rankedCount === 0 || history.average === null || !history.best || !history.worst) return null;

  if (history.rankedCount === 1) {
    return [
      prose(`Un solo mese misurabile: ${monthInSentence(history.best.month)} (`),
      historyRate(history.best.savingsRate ?? 0),
      prose(').'),
    ];
  }

  // A negative average takes no article ("In media −8%"): the elision would bind to a minus.
  const average: Narrative = history.average < 0 ? [historyRate(history.average)] : percentWithArticle(history.average);

  // The running month, or a month below the savings floor, was left out of the average: say over
  // how many months it runs — «misurabili», the months that are rates (owner, 2026-11-14).
  const leftOut = history.ongoing !== null || history.measuredCount > history.rankedCount;
  const scope: Narrative = leftOut
    ? [prose(' su '), figure(String(history.rankedCount)), prose(` ${pluralize(history.rankedCount, 'mese misurabile', 'mesi misurabili')}`)]
    : [];

  // Equal rates everywhere are not a ranking.
  if ((history.best.savingsRate ?? 0) === (history.worst.savingsRate ?? 0)) {
    const tail = leftOut ? ', uguale in tutti.' : `, uguale in tutti ${pluralArticleFor(history.rankedCount)} ${history.rankedCount} mesi misurabili.`;
    return [prose('In media '), ...average, ...scope, prose(tail)];
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

/**
 * One month of «Risparmio nel tempo» in words — the `<title>` of its bar, its entry in the SVG's
 * `aria-label` and the hover tip, so the three never disagree: «Ago: 20%», «Ago: −30%» (the
 * typographic minus, none on a printed zero), «Ago: spese oltre le entrate, −497 €» below the
 * savings floor or without income (2026-11-12), «Ago: nessun movimento», and «Ago: non ancora
 * iniziato» for a month after today's, which is not judged.
 */
export function describeSavingsBar(reading: SavingsReading, label: string, isFuture: boolean): string {
  if (isFuture) return `${label}: non ancora iniziato`;
  switch (reading.kind) {
    case 'rate':
      return `${label}: ${withTypographicMinus(reading.rate, formatPercentage(Math.abs(reading.rate), 0))}`;
    case 'deficit':
      return `${label}: spese oltre le entrate, ${formatEuroMinus(-reading.deficit)}`;
    case 'no-income':
      return `${label}: spese oltre le entrate, ${formatEuroMinus(-reading.spending)}`;
    case 'none':
      return `${label}: nessun movimento`;
  }
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
  if (history.measuredCount === 0 && history.deficitMonths.length === 0) return null;
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
 * "N spese per 3200 €" — a count with the amount it adds up to. A negative total (income
 * reversed to more than it was received) keeps its minus and its colour, like every other
 * signed figure of the page.
 */
/**
 * «40 spese per 3200 €». A total that would round to «0 €» while the rows are not nothing (three
 * coffees at 1,20 € are 3,60 €; a search on a 0,40 € note) says «meno di 1 €» instead — an
 * inventory that prints zero for rows it has just counted reads as broken.
 */
function countWithTotal(count: number, singular: string, plural: string, total: number): Narrative {
  const head: Narrative = [figure(String(count)), prose(` ${pluralize(count, singular, plural)} per `)];
  if (total !== 0 && Math.abs(total) < 0.5) return [...head, prose('meno di '), figure(euro(1))];
  const amount = total < 0 ? signed(`−${euro(total)}`, 'negative') : figure(euro(total));
  return [...head, amount];
}

/**
 * "47 movimenti, di cui 2 in calendario (406 €): 40 spese per 3200 €, 5 entrate per 4500 € e 2
 * trasferimenti per 500 €; la voce più grande è Stipendio (4200 €)." — the reading of the
 * Movimenti tile. Earlier wording, superseded:
 * "47 movimenti: 40 spese per 3200 €, 5 entrate per 4500 € e 2 trasferimenti per 500 €, di
 * cui 2 in calendario (406 €); la voce più grande è Stipendio (4200 €)." — the inventory's
 * own count and sum by type, and its largest row.
 *
 * The sums are what makes a free-text search an aggregate: with «caffè» typed in the toolbar
 * the reading answers «120 movimenti: 120 spese per 264 €», which is the whole point of
 * reusing one note as an implicit subcategory. They are the sums of the rows the list SHOWS
 * (`filteredExpenses`), never of the period — that is what the tiles above are for.
 *
 * The «di cui … in calendario» clause is what keeps the list honest: the register lists rows
 * dated after today, the figures above it COUNT them, and this is the sentence that decomposes
 * the count the same way `scheduledSentence` decomposes the amount. Both say «di cui» / «nel
 * totale» on purpose — the page speaks one dialect, and neither clause is an addition.
 */
export function describeMovements(summary: MovementsSummary): Narrative | null {
  if (summary.count === 0) return null;

  const parts: Narrative[] = [];
  if (summary.expenseCount > 0) parts.push(countWithTotal(summary.expenseCount, 'spesa', 'spese', summary.expenseTotal));
  if (summary.incomeCount > 0) parts.push(countWithTotal(summary.incomeCount, 'entrata', 'entrate', summary.incomeTotal));
  if (summary.transferCount > 0) {
    parts.push(countWithTotal(summary.transferCount, 'trasferimento', 'trasferimenti', summary.transferTotal));
  }

  // The calendar clause qualifies the COUNT («47 movimenti, di cui 2 in calendario») and comes
  // before the colon: after the per-type totals it read as «2 trasferimenti, di cui 2 in
  // calendario» — a subset of the last type instead of the list.
  const narrative: Narrative = [figure(String(summary.count)), prose(` ${pluralize(summary.count, 'movimento', 'movimenti')}`)];
  if (summary.scheduled.count > 0) {
    narrative.push(prose(', di cui '), figure(String(summary.scheduled.count)), prose(' in calendario ('), figure(euro(summary.scheduled.total)), prose(')'));
  }
  narrative.push(prose(': '));
  parts.forEach((part, index) => {
    if (index > 0) narrative.push(prose(index === parts.length - 1 ? ' e ' : ', '));
    narrative.push(...part);
  });
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

// ─── The closed rows' answers (2026-10-16) ────────────────────────────────────

/**
 * A category ranking as a closed row answers it: «Auto 29%», the first row as `RankedRows` prints
 * it (the share rounded to the integer). One category is «tutto in Casa» with no figure (it is the
 * whole total), and a first share that PRINTS as 100% beside other rows is «quasi tutto in Casa»,
 * the reading's own words — the row never claims it all. Null without rows (the empty state).
 * Shared by Tracciamento and Analisi, whose category tiles are the same tile.
 */
export function describeCategoryShareAnswer(ranking: CategoryRanking, kind: 'expenses' | 'income'): Narrative | null {
  const [top, ...rest] = ranking.rows;
  if (!top) return null;
  const preposition = kind === 'income' ? 'da' : 'in';
  if (rest.length === 0) return [prose(`tutto ${preposition} ${top.category}`)];
  const share = Math.round(top.percentage);
  if (share >= 100) return [prose(`quasi tutto ${preposition} ${top.category}`)];
  return [prose(top.category), figure(`${share}%`)];
}

/**
 * «in media il 22%» — the savings history's average, the tile reading's first words; a negative one
 * «in media −8%» in the loss colour, as `historyRate` prints it (no article before a minus). The
 * article is its own segment, which the index binds to the figure when elided («in media l'8%»). Null when no closed month
 * had income, and with ONE measured month: the mean of one month is not a mean (the reading names
 * that month instead). Beside THE tile's rate of the period, «in media» tells them apart.
 */
function describeSavingsHistoryAnswer(history: SavingsHistory): Narrative | null {
  if (history.average === null || history.rankedCount < 2) return null;
  // Decided on the printed integer: −0,3 prints «0%», with no sign.
  if (Math.round(history.average) < 0) return [prose('in media'), historyRate(history.average)];
  const average = Math.max(history.average, 0);
  return [prose('in media'), prose(articleForPercent(average, 0).trim()), figure(formatPercentage(average, 0))];
}

export interface TrackingClosedAnswersInput {
  expenseRanking: CategoryRanking;
  incomeRanking: CategoryRanking;
  savingsHistory: SavingsHistory;
}

/**
 * What Tracciamento's closed rows answer in the landscape index (components/ui/row-answers.tsx):
 * the first category of each ranking and the savings history's average — none of them in the strip,
 * THE tile or the verdict's first sentence. Movimenti keeps its count: an inventory's honest answer
 * is how many rows it lists, and it follows the toolbar's filters.
 */
export function describeTrackingClosedAnswers({ expenseRanking, incomeRanking, savingsHistory }: TrackingClosedAnswersInput): RowAnswerMap {
  return {
    [TRACKING_SECTION_IDS.spese]: describeCategoryShareAnswer(expenseRanking, 'expenses'),
    [TRACKING_SECTION_IDS.entrate]: describeCategoryShareAnswer(incomeRanking, 'income'),
    [TRACKING_SECTION_IDS.risparmio]: describeSavingsHistoryAnswer(savingsHistory),
    [TRACKING_SECTION_IDS.movimenti]: null,
  };
}
