/**
 * Patrimonio's narrative layer: the verdict that answers "cosa possiedo, e cosa si è mosso?"
 * before any number, and the one-line reading under each tile of that page.
 *
 * Same design as `overviewNarrative.ts` (the Panoramica): every function is pure and returns a
 * `Narrative` (segments flagged `mono`/`sign`) so the component can set figures in Geist Mono and
 * colour them by sign while the prose stays prose. The words are chosen by rules pinned by
 * tests, and a sentence never claims what the data cannot support — a missing input drops its
 * clause, it never prints a placeholder (DESIGN.md → The Narrative Honesty Rule).
 *
 * The one difference from the Panoramica: the driver of the month is an INSTRUMENT, not an
 * asset class — "Vanguard FTSE All-World ha fatto il grosso" — fed by `topInstrumentMovers`,
 * the same price attribution as the class digest before it is folded into classes.
 *
 * Percentages go through the it-IT formatter of lib/utils/formatters (comma decimals), currency through
 * `cachedFormatCurrencyEUR` (no-break space before €) — AGENTS.md → Italian Localization.
 */

import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import { formatPercentageIt as formatPercentage } from '@/lib/utils/formatters';
import { MONTH_NAMES } from '@/lib/constants/months';
import { getItalyDate } from '@/lib/utils/dateHelpers';
import type { Narrative, NarrativeSegment, PageVerdictModel, VerdictTone } from '@/lib/utils/narrative';

export interface PatrimonioVerdictInput {
  /** Current calendar month, 1-12. */
  month: number;
  totalValue: number;
  monthlyVariation: { value: number; percentage: number } | null;
  isNewATH: boolean;
  /** Positions other than cash accounts (the rows of the Strumenti table). */
  instrumentCount: number;
  /** Cash accounts (type cash AND class cash). */
  accountCount: number;
  /** Portfolio-wide market effect this month; null when not attributable. */
  marketEffect: number | null;
  /** The instrument whose market price moved the most; null when none. */
  topMover: { id: string; name: string; delta: number } | null;
}

export type PatrimonioVerdict = PageVerdictModel;

// ─── Formatting helpers ───────────────────────────────────────────────────────

const prose = (text: string): NarrativeSegment => ({ text });
const figure = (text: string): NarrativeSegment => ({ text, mono: true });

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

function monthInSentence(month: number): string {
  return MONTH_NAMES[month - 1].toLowerCase();
}

/** "a maggio" but "ad agosto" — the euphonic d before a vowel. */
function withPrepositionA(monthName: string): string {
  return /^[aeiou]/i.test(monthName) ? `ad ${monthName}` : `a ${monthName}`;
}

/** "ad agosto" / "a maggio" for a 1-12 month — the in-sentence form a tile footer needs. */
export function monthWithPrepositionA(month: number): string {
  return withPrepositionA(monthInSentence(month));
}

function previousMonthIndex(month: number): number {
  return month === 1 ? 12 : month - 1;
}

/** Whether an Italian number name starts with a vowel: uno, otto, undici, ottanta… (diciotto does not). */
export function startsWithVowel(integer: number): boolean {
  return integer === 1 || integer === 8 || integer === 11 || (integer >= 80 && integer <= 89) || (integer >= 800 && integer <= 899);
}

/**
 * The integer part of a percentage AS PRINTED: the article must follow the rounded figure next
 * to it ("L'8,0%" for 7,96), not the raw value.
 */
function printedInteger(value: number, decimals: number): number {
  return parseInt(formatPercentage(Math.abs(value), decimals).replace(/,.*$/, ''), 10);
}

/**
 * The definite article before a percentage: "l'8%", "l'11%", "l'80%", "lo 0,5%" (zero starts
 * with z) but "il 7%", "il 39%". Shared with every page narrative that names a percentage.
 */
export function articleForPercent(value: number, decimals = 1): string {
  const leading = printedInteger(value, decimals);
  if (leading === 0) return 'lo ';
  return startsWithVowel(leading) ? "l'" : 'il ';
}

/** The articulated preposition "del" before a percentage: "del 3,2%", "dell'8,1%", "dello 0,5%". */
export function ofThePercent(value: number, decimals = 1): string {
  const leading = printedInteger(value, decimals);
  if (leading === 0) return 'dello ';
  return startsWithVowel(leading) ? "dell'" : 'del ';
}

/** The articulated preposition "al" before a percentage: "al 71%", "all'8%", "allo 0,5%". */
export function atThePercent(value: number, decimals = 1): string {
  const leading = printedInteger(value, decimals);
  if (leading === 0) return 'allo ';
  return startsWithVowel(leading) ? "all'" : 'al ';
}

function pluralize(count: number, singular: string, plural: string): string {
  return count === 1 ? singular : plural;
}

/**
 * The plural masculine article before a count: "gli 8", "gli 11", "gli 80" but "i 3", "i 15".
 * Same vowel-initial number names as `articleForPercent`, on the integer.
 */
export function pluralArticleFor(count: number): string {
  return count !== 1 && startsWithVowel(count) ? 'gli' : 'i';
}

// ─── Verdict ──────────────────────────────────────────────────────────────────

function resolveHeadline(input: PatrimonioVerdictInput): { headline: string; tone: VerdictTone } {
  if (!input.monthlyVariation) {
    return { headline: `Il tuo portafoglio ${withPrepositionA(monthInSentence(input.month))}.`, tone: 'neutral' };
  }
  // The record is measured on the live total, the monthly change on the month's snapshot: the
  // two can disagree intraday, and the headline must never contradict the sign the sentence prints.
  if (input.isNewATH && input.monthlyVariation.value >= 0) {
    return { headline: 'Il portafoglio è al massimo storico.', tone: 'positive' };
  }

  const marketLost = input.marketEffect !== null && input.marketEffect < 0;
  const marketGained = input.marketEffect !== null && input.marketEffect >= 0;

  if (input.monthlyVariation.value >= 0) {
    // Grown while the market lost: the user's own flows did it, and the sentence must not
    // credit the market.
    if (marketLost) return { headline: 'Il portafoglio cresce, nonostante il mercato.', tone: 'positive' };
    return { headline: 'Il portafoglio cresce.', tone: 'positive' };
  }

  // A falling month is blamed on the market only when the market actually lost money.
  if (marketGained) return { headline: 'Il portafoglio è in calo, nonostante il mercato.', tone: 'warning' };
  if (marketLost) return { headline: 'Il portafoglio è in calo: il mercato ha pesato.', tone: 'negative' };
  return { headline: 'Il portafoglio è in calo.', tone: 'negative' };
}

/** ", 16 strumenti e 3 conti" — whichever counts are non-zero, in the singular when one. */
function buildCountClause(instrumentCount: number, accountCount: number): Narrative {
  const parts: Narrative[] = [];
  if (instrumentCount > 0) {
    parts.push([figure(String(instrumentCount)), prose(` ${pluralize(instrumentCount, 'strumento', 'strumenti')}`)]);
  }
  if (accountCount > 0) {
    parts.push([figure(String(accountCount)), prose(` ${pluralize(accountCount, 'conto', 'conti')}`)]);
  }
  if (parts.length === 0) return [];
  const clause: Narrative = [prose(', ')];
  parts.forEach((part, i) => {
    if (i > 0) clause.push(prose(' e '));
    clause.push(...part);
  });
  return clause;
}

/** "16 strumenti e 3 conti" as plain text — the hero tile's count line. Empty when both are 0. */
export function formatHoldingCounts(instrumentCount: number, accountCount: number): string {
  return buildCountClause(instrumentCount, accountCount)
    .map((segment) => segment.text)
    .join('')
    .replace(/^, /, '');
}

/**
 * The headline + the sentence under it. Assembled clause by clause so a missing input drops
 * its clause: no prior snapshot → no monthly clause; no attributable market effect → no
 * driver, even if a top mover was handed in.
 */
export function buildPatrimonioVerdict(input: PatrimonioVerdictInput): PatrimonioVerdict {
  const { headline, tone } = resolveHeadline(input);
  const sentence: Narrative = [prose('Il portafoglio vale '), figure(cachedFormatCurrencyEUR(input.totalValue))];

  if (input.monthlyVariation) {
    sentence.push(
      prose(': '),
      signedCurrency(input.monthlyVariation.value),
      prose(' ('),
      signedPercent(input.monthlyVariation.percentage),
      prose(`) su ${monthInSentence(previousMonthIndex(input.month))}`),
    );
  }

  sentence.push(...buildCountClause(input.instrumentCount, input.accountCount));

  if (input.topMover && input.marketEffect !== null) {
    const action = input.topMover.delta >= 0 ? 'ha fatto il grosso' : 'ha pesato';
    sentence.push(prose(`; ${input.topMover.name} ${action} (`), signedCurrency(input.topMover.delta, true), prose(')'));
  }

  sentence.push(prose('.'));
  return { headline, tone, sentence };
}

// ─── Tile readings ────────────────────────────────────────────────────────────

/**
 * "Il 7,2% del patrimonio è sui conti; 18.420 € su Conto Fineco." — the cash accounts' share
 * of the gross total and where most of it sits. With one account the two facts collapse into
 * one sentence; with no account or no total there is nothing to say.
 */
export function describeCashAccounts(
  shareOfTotal: number | null,
  largest: { name: string; balance: number } | null,
  accountCount: number,
): Narrative | null {
  if (accountCount === 0 || shareOfTotal === null || !largest) return null;
  const article = articleForPercent(shareOfTotal);
  const opening: Narrative = [
    prose(article.charAt(0).toUpperCase() + article.slice(1)),
    figure(formatPercentage(shareOfTotal, 1)),
    prose(' del patrimonio è su'),
  ];
  if (accountCount === 1) {
    return [...opening, prose(` ${largest.name}.`)];
  }
  return [...opening, prose('i conti; '), figure(cachedFormatCurrencyEUR(largest.balance, true)), prose(` su ${largest.name}.`)];
}

/** "Hai comprato 2500 € e venduto 800 €." — the month's buys and sells from the trade ledger. */
export function describeMonthTrades(bought: number, sold: number, month: number): Narrative {
  if (bought <= 0 && sold <= 0) {
    return [prose(`Nessuna operazione ${withPrepositionA(monthInSentence(month))}.`)];
  }
  if (sold <= 0) {
    return [prose('Hai comprato '), figure(cachedFormatCurrencyEUR(bought, true)), prose(', nessuna vendita.')];
  }
  if (bought <= 0) {
    return [prose('Hai venduto '), figure(cachedFormatCurrencyEUR(sold, true)), prose(', nessun acquisto.')];
  }
  return [
    prose('Hai comprato '),
    figure(cachedFormatCurrencyEUR(bought, true)),
    prose(' e venduto '),
    figure(cachedFormatCurrencyEUR(sold, true)),
    prose('.'),
  ];
}

/**
 * "Le posizioni rendono +8,1% sul costo; Ferrari rende di più (+44,5%)." — the unrealized
 * gain over the cost basis and the best position. Null when nothing has a cost basis.
 */
export function describeInstrumentReturns(
  gainPercent: number | null,
  best: { name: string; returnPercent: number } | null,
): Narrative | null {
  if (gainPercent === null) return null;
  const narrative: Narrative =
    gainPercent >= 0
      ? [prose('Le posizioni rendono '), signedPercent(gainPercent, 1), prose(' sul costo')]
      : [prose(`Le posizioni sono sotto il costo ${ofThePercent(gainPercent)}`), figure(formatPercentage(Math.abs(gainPercent), 1))];
  if (best) {
    narrative.push(prose(`; ${best.name} rende di più (`), signedPercent(best.returnPercent, 1), prose(')'));
  }
  narrative.push(prose('.'));
  return narrative;
}

/**
 * "16 strumenti, 2 valutati a mano; i 3 maggiori pesano il 39,3%." — what the table holds,
 * how many of its prices are typed in by hand, and how concentrated it is. The weight clause
 * is dropped when the largest n ARE the whole table.
 */
export function describeInstruments(
  instrumentCount: number,
  manualCount: number,
  topShare: { count: number; percent: number } | null,
): Narrative | null {
  if (instrumentCount <= 0) return null;
  const narrative: Narrative = [figure(String(instrumentCount)), prose(` ${pluralize(instrumentCount, 'strumento', 'strumenti')}`)];

  if (manualCount > 0) {
    const valued = pluralize(manualCount, 'valutato', 'valutati');
    if (instrumentCount === 1) {
      narrative.push(prose(`, ${valued} a mano`));
    } else {
      narrative.push(prose(', '), figure(String(manualCount)), prose(` ${valued} a mano`));
    }
  }

  if (topShare && topShare.count < instrumentCount) {
    narrative.push(
      prose(`; ${pluralArticleFor(topShare.count)} ${topShare.count} maggiori pesano ${articleForPercent(topShare.percent)}`),
      figure(formatPercentage(topShare.percent, 1)),
    );
  }

  narrative.push(prose('.'));
  return narrative;
}

/**
 * "prezzi aggiornati oggi alle 09:12" — the compact header's description. Day words follow the
 * Italian wall clock of both instants; beyond yesterday the date is spelled as dd/MM.
 */
export function describeLastPriceUpdate(lastUpdate: Date | null, now: Date): string | null {
  if (!lastUpdate) return null;
  const updated = getItalyDate(lastUpdate);
  const today = getItalyDate(now);
  const time = `${String(updated.getHours()).padStart(2, '0')}:${String(updated.getMinutes()).padStart(2, '0')}`;

  const dayOf = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86_400_000;
  const daysAgo = dayOf(today) - dayOf(updated);
  if (daysAgo === 0) return `prezzi aggiornati oggi alle ${time}`;
  if (daysAgo === 1) return `prezzi aggiornati ieri alle ${time}`;
  // Beyond yesterday the date is spelled out; a quote older than the calendar year names its
  // year, or a ticker that stopped updating last September reads as three weeks ago.
  const sameYear = updated.getFullYear() === today.getFullYear();
  const date = `${String(updated.getDate()).padStart(2, '0')}/${String(updated.getMonth() + 1).padStart(2, '0')}${sameYear ? '' : `/${updated.getFullYear()}`}`;
  return `prezzi aggiornati il ${date} alle ${time}`;
}
