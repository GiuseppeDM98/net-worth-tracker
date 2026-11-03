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

import { cachedFormatCurrencyEUR, isPrintedZero } from '@/lib/utils/formatters';
import { formatPercentageIt as formatPercentage } from '@/lib/utils/formatters';
import { MONTH_NAMES } from '@/lib/constants/months';
import { getItalyDate } from '@/lib/utils/dateHelpers';
import { resolveDeclineCause, resolveTaxedGrowth, type PeriodSalesSummary } from '@/lib/utils/periodSales';
import {
  declineHeadlineTail,
  describeMonthSplit,
  describePurchases,
  describeSales,
  taxedGrowthHeadline,
} from '@/lib/utils/salesNarrative';
import type { Narrative, NarrativeSegment, PageVerdictModel, VerdictTone } from '@/lib/utils/narrative';
import type { MonthFlows } from '@/lib/utils/marketEffect';
import type { OwnershipBasis, OwnershipSummary } from '@/lib/utils/assetOwnership';
import { ownershipRowOn } from '@/lib/utils/ownershipBasis';
import type { MortgageSummary, MortgageYear } from '@/lib/utils/mortgageSummary';

export interface PatrimonioVerdictInput {
  /** Current calendar month, 1-12. */
  month: number;
  totalValue: number;
  monthlyVariation: { value: number; percentage: number } | null;
  /**
   * Since the first snapshot of the year; null without one, absent on an older caller. Its
   * sentence opens what a phone keeps behind «Il perché» (2026-10-14; doc/guide/patrimonio.md
   * § Composizione mobile).
   */
  yearlyVariation?: { value: number; percentage: number } | null;
  isNewATH: boolean;
  /** Positions other than cash accounts (the rows of the Strumenti table). */
  instrumentCount: number;
  /** Cash accounts (type cash AND class cash). */
  accountCount: number;
  /** Loans with a principal left (types/assets.ts → LOAN_ASSET_TYPE); absent on an older caller. */
  loanCount?: number;
  /** Portfolio-wide market effect this month; null when not attributable. */
  marketEffect: number | null;
  /** The pension contributions and the debts repaid this month, named in the split; absent on an older payload. */
  monthFlows?: MonthFlows | null;
  /** The instrument whose market price moved the most; null when none. */
  topMover: { id: string; name: string; delta: number } | null;
  /**
   * The month's sells from the trade ledger, with the estimated tax withheld on them; null when
   * nothing was sold, absent on a payload computed before the field existed.
   */
  sales?: PeriodSalesSummary | null;
  /**
   * Income − expenses already happened this month (the Panoramica's `resolveLivedCashflow`); null
   * or absent when not known — the split then names no part «risparmiati».
   */
  savings?: number | null;
}

export type PatrimonioVerdict = PageVerdictModel;

// ─── Formatting helpers ───────────────────────────────────────────────────────

const prose = (text: string): NarrativeSegment => ({ text });
const figure = (text: string): NarrativeSegment => ({ text, mono: true });

/**
 * A signed figure, or a bare one when it prints as zero: «0,00 €» and «0,00%» take no sign and no
 * colour whatever the sign of the raw value (`isPrintedZero`, the strip's rule — AGENTS.md § Layout
 * and Color Tokens; on this page since 2026-10-14, at 1440 too). It used to print «+0,00 €»
 * in green.
 */
function signed(value: number, unsigned: string): NarrativeSegment {
  if (isPrintedZero(unsigned)) return { text: unsigned, mono: true };
  const negative = value < 0;
  return { text: `${negative ? '−' : '+'}${unsigned}`, mono: true, sign: negative ? 'negative' : 'positive' };
}

/** Signed euro figure with a typographic minus, coloured by sign; a printed zero unsigned. */
function signedCurrency(value: number, compact = false): NarrativeSegment {
  return signed(value, cachedFormatCurrencyEUR(Math.abs(value), compact));
}

function signedPercent(value: number, decimals = 2): NarrativeSegment {
  return signed(value, formatPercentage(Math.abs(value), decimals));
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

interface ResolvedHeadline {
  headline: string;
  tone: VerdictTone;
}

function resolveHeadline(input: PatrimonioVerdictInput): ResolvedHeadline {
  if (!input.monthlyVariation) {
    return { headline: `Il tuo portafoglio ${withPrepositionA(monthInSentence(input.month))}.`, tone: 'neutral' };
  }
  // Grown only on paper: the tax on a sale took at least half of the growth — the same rule as
  // the Panoramica's (`resolveTaxedGrowth`). It outranks the record: on the real account settembre
  // 2026 was a new high at +0,04%, with 4.089 € of withholding on a VWCE sale.
  const taxedGrowth = resolveTaxedGrowth({
    delta: input.monthlyVariation.value,
    deltaPct: input.monthlyVariation.percentage,
    salesTax: input.sales?.estimatedTax ?? null,
  });
  if (taxedGrowth) {
    return { headline: taxedGrowthHeadline('Il portafoglio', taxedGrowth, input.sales), tone: 'warning' };
  }
  // The record is measured on the live total, the monthly change on the month's snapshot: the
  // two can disagree intraday, and the headline must never contradict the sign the sentence prints.
  if (input.isNewATH && input.monthlyVariation.value >= 0) {
    return { headline: 'Il portafoglio è al massimo storico.', tone: 'positive' };
  }

  const marketLost = input.marketEffect !== null && input.marketEffect < 0;

  if (input.monthlyVariation.value >= 0) {
    // Grown while the market lost: the user's own flows did it, and the sentence must not
    // credit the market.
    if (marketLost) return { headline: 'Il portafoglio cresce, nonostante il mercato.', tone: 'positive' };
    return { headline: 'Il portafoglio cresce.', tone: 'positive' };
  }

  // A falling month is blamed on the market only when the market actually lost money — and never
  // on the market alone when the tax on a sale or the user's own flows weighed more: the same
  // decision the Panoramica and the email make (`resolveDeclineCause`).
  const cause = resolveDeclineCause({
    marketEffect: input.marketEffect,
    ownFlows: input.marketEffect === null ? null : input.monthlyVariation.value - input.marketEffect,
    salesTax: input.sales?.estimatedTax ?? null,
  });
  return {
    headline: `Il portafoglio è in calo${declineHeadlineTail(cause, input.sales)}`,
    // The market did not lose: a tax withheld on a gain is worth attention, not alarm.
    tone: cause === 'despite-market' || cause === 'taxes-despite-market' ? 'warning' : 'negative',
  };
}

/**
 * ", 16 strumenti, 3 conti e 1 prestito" — whichever counts are non-zero, in the singular when
 * one; the loans (types/assets.ts → LOAN_ASSET_TYPE) are neither instruments nor accounts and
 * are counted apart, so «18 strumenti» never includes a debt.
 */
function buildCountClause(instrumentCount: number, accountCount: number, loanCount: number = 0): Narrative {
  const parts: Narrative[] = [];
  if (instrumentCount > 0) {
    parts.push([figure(String(instrumentCount)), prose(` ${pluralize(instrumentCount, 'strumento', 'strumenti')}`)]);
  }
  if (accountCount > 0) {
    parts.push([figure(String(accountCount)), prose(` ${pluralize(accountCount, 'conto', 'conti')}`)]);
  }
  if (loanCount > 0) {
    parts.push([figure(String(loanCount)), prose(` ${pluralize(loanCount, 'prestito', 'prestiti')}`)]);
  }
  if (parts.length === 0) return [];
  const clause: Narrative = [prose(', ')];
  parts.forEach((part, i) => {
    if (i > 0) clause.push(prose(i === parts.length - 1 ? ' e ' : ', '));
    clause.push(...part);
  });
  return clause;
}

/** "16 strumenti e 3 conti" as plain text — the hero tile's count line. Empty when all are 0. */
export function formatHoldingCounts(instrumentCount: number, accountCount: number, loanCount: number = 0): string {
  return buildCountClause(instrumentCount, accountCount, loanCount)
    .map((segment) => segment.text)
    .join('')
    .replace(/^, /, '');
}

/**
 * The headline + the sentence under it. Assembled clause by clause so a missing input drops
 * its clause: no prior snapshot → no monthly clause; no attributable market effect → no
 * driver, even if a top mover was handed in.
 *
 * Where a phone cuts (2026-10-14; DESIGN.md → The Binding-Clause Rule, its full stop at 1440 too): after
 * the first sentence — the total, the month and the counts. Behind «Il perché» go the year
 * (a sentence of its own: its chip is lifted whole from THE tile, so its euro lives here, in brackets after
 * the percentage, at 1440 too), the market — a sentence of its own at every width, «; sul
 * mercato» until then — the month's split and the sale. The sale's tax and counterfactual are
 * `binding` (`describeSales`): that month the whole paragraph stays under the title.
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

  sentence.push(...buildCountClause(input.instrumentCount, input.accountCount, input.loanCount ?? 0));
  sentence.push(prose('.'));
  const leadLength = sentence.length;

  const yearly = input.yearlyVariation ?? null;
  if (yearly) {
    sentence.push(prose(' Da inizio anno '), signedPercent(yearly.percentage), prose(' ('), signedCurrency(yearly.value), prose(').'));
  }

  // The top mover explains the MARKET half, not the month (the Panoramica's driver clause says the
  // same): «ha fatto il grosso» credited an instrument with more than the month's whole change.
  const hasDriver = input.topMover !== null && input.marketEffect !== null;
  if (input.topMover && input.marketEffect !== null) {
    const action = input.topMover.delta >= 0 ? 'ha spinto' : 'ha pesato';
    sentence.push(
      prose(` Sul mercato ${action} soprattutto ${input.topMover.name} (`),
      signedCurrency(input.topMover.delta, true),
      prose(').'),
    );
  }

  // The market-vs-flows split and the sale behind it, the same words the Panoramica prints. A
  // taxed sale carries the split itself, with the month without the tax, so the
  // plain split is printed only when there is no tax to take out.
  const split =
    input.monthlyVariation && input.marketEffect !== null
      ? { delta: input.monthlyVariation.value, marketEffect: input.marketEffect, savings: input.savings ?? null, flows: input.monthFlows ?? null }
      : undefined;
  const saleCarriesSplit = split !== undefined && (input.sales?.estimatedTax ?? 0) > 0;
  const hasSplit = split !== undefined && !saleCarriesSplit;
  if (split && !saleCarriesSplit) {
    sentence.push(prose(' '), ...describeMonthSplit(split));
  }
  if (input.sales) {
    sentence.push(prose(' '), ...describeSales(input.sales, split));
    const purchases = describePurchases(input.sales);
    if (purchases.length > 0) sentence.push(prose(' '), ...purchases);
  }

  if (sentence.length <= leadLength) return { headline, tone, sentence };
  const restLabel = patrimonioRestLabel({ year: yearly !== null, market: hasDriver || hasSplit, sale: Boolean(input.sales) });
  return { headline, tone, sentence, leadLength, restLabel };
}

/**
 * What «Il perché» opens on a phone, from what the rest holds: «il mercato del mese», «la vendita
 * del mese», «mercato e vendita del mese» (the `overviewRestLabel` of the Panoramica, on this
 * page's subjects); with the year in front of them (since 2026-10-14) «l'anno», «l'anno e il mercato
 * del mese», «l'anno e la vendita del mese», «l'anno, il mercato e la vendita del mese».
 */
export function patrimonioRestLabel(subjects: { year: boolean; market: boolean; sale: boolean }): string {
  const { year, market, sale } = subjects;
  if (!year) {
    if (market && sale) return 'mercato e vendita del mese';
    return sale ? 'la vendita del mese' : 'il mercato del mese';
  }
  if (market && sale) return "l'anno, il mercato e la vendita del mese";
  if (market) return "l'anno e il mercato del mese";
  if (sale) return "l'anno e la vendita del mese";
  return "l'anno";
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

/** «04/03» in the same year as `now`, «04/03/2032» otherwise — the compact date a row's sub-line uses. */
function shortDate(date: Date, now: Date): string {
  const d = getItalyDate(date);
  const sameYear = d.getFullYear() === getItalyDate(now).getFullYear();
  const dayMonth = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
  return sameYear ? dayMonth : `${dayMonth}/${d.getFullYear()}`;
}

/**
 * «scade il 04/03/2032 · prossima cedola 04/09» — the sub-line of a bond row, so a BTP is not
 * typographically a crypto row (TER and PMC say nothing about a bond; its maturity and its next
 * coupon do). The coupon clause drops for a zero coupon or once the bond has matured; the whole
 * line drops without a maturity. `nextCoupon` is the caller's (couponUtils knows the schedule).
 */
export function describeBondRow(
  bond: { maturityDate: Date; hasCoupons: boolean },
  nextCoupon: Date | null,
  now: Date,
): string | null {
  if (!(bond.maturityDate instanceof Date) || Number.isNaN(bond.maturityDate.getTime())) return null;
  const parts = [`scade il ${shortDate(bond.maturityDate, now)}`];
  if (bond.hasCoupons && nextCoupon && nextCoupon <= bond.maturityDate) {
    parts.push(`prossima cedola ${shortDate(nextCoupon, now)}`);
  }
  return parts.join(' · ');
}

/**
 * «valore a mano dal 12/08» — the sub-line of a hand-valued row (a property, a fund, a
 * private-equity stake): the table prints its value and WHEN the owner last typed it, instead
 * of a quantity and a price of 1,0000 € that describe the storage, not the holding.
 */
export function describeManualValuation(lastUpdate: Date | null | undefined, now: Date): string | null {
  if (!(lastUpdate instanceof Date) || Number.isNaN(lastUpdate.getTime())) return null;
  return `valore a mano dal ${shortDate(lastUpdate, now)}`;
}

/**
 * «mutuo su Casa · TAN 3,2%» / «prestito · senza TAN» — the sub-line of a loan row (types/assets.ts
 * → LOAN_ASSET_TYPE): what it finances and the rate its instalments are split on. A TAN prints with
 * the decimals it was typed with, never a padded «3,20%».
 */
export function describeLoanRow(financedAssetName: string | null, annualRatePct: number | undefined): string {
  const subject = financedAssetName ? `mutuo su ${financedAssetName}` : 'prestito';
  if (!annualRatePct || annualRatePct <= 0) return `${subject} · senza TAN`;
  const rate = new Intl.NumberFormat('it-IT', { style: 'percent', maximumFractionDigits: 3 }).format(annualRatePct / 100);
  return `${subject} · TAN ${rate}`;
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

// ─── Mutuo ────────────────────────────────────────────────────────────────────

/** «novembre 2036»: a month named with its year, lower case, from a local date. */
function monthYearOf(date: Date): string {
  return `${MONTH_NAMES[date.getMonth()].toLowerCase()} ${date.getFullYear()}`;
}

/** «28 settembre»: the day of an instalment still to come. */
function dayMonthOf(date: Date): string {
  return `${date.getDate()} ${MONTH_NAMES[date.getMonth()].toLowerCase()}`;
}

/** «nov 2036» — the projected end, short enough for a KPI and for the closed row's answer (moved out of MutuoTile, 2026-10-16). */
export function shortMonthYear(date: Date): string {
  return `${MONTH_NAMES[date.getMonth()].slice(0, 3).toLowerCase()} ${date.getFullYear()}`;
}

/** The «Fine prevista» KPI of the Mutuo tile: «nov 2036», «estinto», or «—» without a projection the debt follows. */
export function payoffKpiValue(payoff: MortgageSummary['payoff']): string {
  if (payoff?.kind === 'date') return shortMonthYear(payoff.date);
  return payoff?.kind === 'repaid' ? 'estinto' : '—';
}

/** «il mutuo» or «il prestito», by what the loan finances (lib/utils/mortgageSummary.ts). */
export function loanNoun(kind: MortgageSummary['kind']): string {
  return kind === 'mortgage' ? 'mutuo' : 'prestito';
}

/** Where the plan ends, as the clause that closes the reading; null without a projection. */
function describePayoff(summary: MortgageSummary): NarrativeSegment[] | null {
  const payoff = summary.payoff;
  if (!payoff) return null;
  if (payoff.kind === 'repaid') return [prose('il debito è estinto.')];
  if (payoff.kind === 'never') return [prose('con questa rata il debito non scende: copre appena gli interessi.')];
  return [prose(`al ritmo di oggi il ${loanNoun(summary.kind)} si chiude a `), figure(monthYearOf(payoff.date)), prose('.')];
}

/**
 * The reading of Patrimonio's «Mutuo» tile (lib/utils/mortgageSummary.ts): what the instalments
 * SETTLED this year cost in interest and repaid in principal, then where the plan ends. Before
 * the first settled instalment it says what the next one will do, on today's debt — never a
 * figure for the instalments paid before the link, which the app did not measure.
 */
export function describeMortgage(summary: MortgageSummary): Narrative {
  const payoff = describePayoff(summary);
  const closing = payoff ? [prose('; '), ...payoff] : [prose('.')];
  if (summary.yearInstalments > 0) {
    return [
      prose(`Nel ${summary.year} hai pagato `),
      figure(cachedFormatCurrencyEUR(summary.yearInterest)),
      prose(' di interessi e rimborsato '),
      figure(cachedFormatCurrencyEUR(summary.yearPrincipal)),
      prose(` di capitale, in ${summary.yearInstalments === 1 ? '1 rata' : `${summary.yearInstalments} rate`}`),
      ...closing,
    ];
  }
  if (summary.next) {
    const lead = summary.trackedSince ? 'La prossima rata, il ' : 'La prima rata collegata, il ';
    return [
      prose(lead),
      figure(dayMonthOf(summary.next.date)),
      prose(', rimborserà '),
      figure(cachedFormatCurrencyEUR(summary.next.principal)),
      prose(' di capitale; '),
      figure(cachedFormatCurrencyEUR(summary.next.interest)),
      prose(' saranno interessi'),
      ...closing,
    ];
  }
  return [prose(`Nel ${summary.year} nessuna rata collegata è ancora stata pagata`), ...closing];
}

/**
 * The tile's footer line: from when the interest is measured, and on which TAN — or that the
 * property has none, so every instalment counts as principal.
 */
export function describeMortgageScope(summary: MortgageSummary): string {
  const since = summary.trackedSince ? `Interessi dalle rate collegate, da ${monthYearOf(summary.trackedSince)}` : 'Interessi dalle rate collegate, dalla prima pagata';
  if (!summary.annualRatePct || summary.annualRatePct <= 0) return `${since} · senza TAN: ogni rata va tutta in capitale.`;
  const rate = new Intl.NumberFormat('it-IT', { style: 'percent', maximumFractionDigits: 3 }).format(summary.annualRatePct / 100);
  return `${since} · TAN ${rate}.`;
}

/**
 * The caption of a year in the «Per anno» list: the first measured year is partial from the link
 * («da settembre»), the running year is not over («finora») — a partial year printed bare would
 * read as a year of lower interest.
 */
export function describeMortgageYearScope(entry: MortgageYear, currentYear: number): string | null {
  const parts: string[] = [];
  if (entry.partialFrom) parts.push(`da ${MONTH_NAMES[entry.partialFrom.getMonth()].toLowerCase()}`);
  if (entry.year === currentYear) parts.push('finora');
  return parts.length > 0 ? parts.join(', ') : null;
}

// ─── Intestatari (owner, 2026-10-17) ──────────────────────────────────────────

/**
 * The reading of the «Intestatari» tile (Panoramica and Patrimonio): who holds what share of the
 * NET total — «Il 54% è intestato a Marco, il 31% a Giulia, il resto in comune.» Members by
 * value, each share the integer the row prints (`Math.round`, the article decided on it:
 * «L'8%»); the shared group closes as «il resto» when it holds something, the orphaned ids as
 * «il 5% senza intestatario»; one member and nothing else is «Tutto è intestato a Marco.»; a
 * group that is a net debt is named as such («Giulia è in negativo»). Null with no owner set —
 * the tile does not exist then (`OwnershipSummary.hasOwners`).
 *
 * On the Carico basis (the tile's switch, owner 2026-10-18) the same sentence opens by naming
 * it, so the reader never mistakes one split for the other: «Al prezzo di carico, il 55% è
 * intestato a Marco, il 31% a Giulia, il resto in comune.», «Al prezzo di carico, tutto è
 * intestato a Marco.» The page's verdict never follows the switch (DESIGN.md → The
 * Scope-Is-Not-An-Axis Rule): this reading is the tile's own.
 */
export function describeOwnership(summary: OwnershipSummary, basis: OwnershipBasis = 'value'): Narrative | null {
  if (!summary.hasOwners || summary.rows.length === 0) return null;
  const members = summary.rows.filter((row) => row.kind === 'member');
  const common = summary.rows.find((row) => row.kind === 'common');
  const unassigned = summary.rows.find((row) => row.kind === 'unassigned');
  const opening = basis === 'cost' ? [prose('Al prezzo di carico, ')] : [];

  if (members.length === 1 && !common && !unassigned) {
    return capitalised([...opening, prose('tutto è intestato a '), prose(members[0].label), prose('.')]);
  }

  const clauses: Narrative[] = [];
  members.forEach((row, index) => {
    const { value, sharePct } = ownershipRowOn(row, basis);
    if (sharePct === null || sharePct < 0) {
      clauses.push([prose(`${row.label} è in negativo (`), figure(cachedFormatCurrencyEUR(Math.abs(value), true)), prose(' di debiti)')]);
      return;
    }
    const pct = Math.round(sharePct);
    const verb = index === 0 ? 'è intestato a ' : 'a ';
    clauses.push([prose(`${articleForPercent(pct, 0)}`), figure(`${pct}%`), prose(` ${verb}${row.label}`)]);
  });
  if (common) clauses.push([prose('il resto in comune')]);
  const unassignedShare = unassigned ? ownershipRowOn(unassigned, basis).sharePct : null;
  if (unassigned && unassignedShare !== null) {
    const pct = Math.round(unassignedShare);
    clauses.push([prose(`${articleForPercent(pct, 0)}`), figure(`${pct}%`), prose(' senza intestatario')]);
  }

  const sentence = clauses.flatMap((clause, index) => (index === 0 ? clause : [prose(', '), ...clause]));
  return capitalised([...opening, ...sentence, prose('.')]);
}

/** The first word capitalised: «Il 54%…», «L'8%…», «Marco è in negativo…», «Al prezzo di carico, il 55%…». */
function capitalised(sentence: Narrative): Narrative {
  const [first, ...rest] = sentence;
  return [{ ...first, text: first.text.charAt(0).toUpperCase() + first.text.slice(1) }, ...rest];
}

/** The tile's aside: how many held assets the shares are made of («su 12 asset»). */
export function describeOwnershipAside(summary: OwnershipSummary): string {
  return `su ${summary.assetCount} asset`;
}

/** The closed row's answer (the landscape index): the largest owner and its printed share — «Marco 54%». Null with no owner. */
export function describeOwnershipAnswer(summary: OwnershipSummary): Narrative | null {
  const top = summary.rows.find((row) => row.kind === 'member' && row.sharePct !== null && row.sharePct >= 0);
  if (!top || top.sharePct === null) return null;
  return [{ text: `${top.label} ` }, { text: `${Math.round(top.sharePct)}%`, mono: true }];
}

/** The tile's footer: where the owner is set, and the two assets that derive theirs. */
export const OWNERSHIP_FOOTER =
  'Le quote per persona si scrivono nel form di ogni asset; un fondo pensione segue il membro di Previdenza, un mutuo le quote del suo immobile.';

/**
 * The footer of the Intestatari tile, ONE line (AGENTS.md § Hierarchy, Density and Disclosure):
 * in the warning tone the assets whose stored quotas no longer fit their quantity («1 asset ha
 * quote da riassegnare: VWCE.»), since a sale or a value typed lower leaves the units as written
 * (lib/utils/assetSlice.ts) — on either basis, a datum to fix comes first; else, on the Carico
 * basis, the quoted instruments with no PMC in euro, which count at their value there («2 asset
 * senza prezzo di carico contano al valore attuale: X e Y.», owner 2026-10-18); else the neutral
 * note. `reassign` and `withoutCostBasis` may be missing on a payload cached before them: read
 * as none.
 */
export function describeOwnershipFooter(
  summary: Pick<OwnershipSummary, 'reassign' | 'withoutCostBasis'>,
  basis: OwnershipBasis = 'value',
): { text: string; tone: 'neutral' | 'warning' } {
  const reassign = summary.reassign ?? [];
  if (reassign.length > 0) {
    const names = reassign.map((entry) => entry.name);
    return { text: `${names.length} asset ${names.length === 1 ? 'ha' : 'hanno'} quote da riassegnare: ${joinNames(names)}.`, tone: 'warning' };
  }
  const withoutCostBasis = summary.withoutCostBasis ?? [];
  if (basis === 'cost' && withoutCostBasis.length > 0) {
    const names = withoutCostBasis.map((entry) => entry.name);
    return { text: `${names.length} asset senza prezzo di carico ${names.length === 1 ? 'conta' : 'contano'} al valore attuale: ${joinNames(names)}.`, tone: 'neutral' };
  }
  return { text: OWNERSHIP_FOOTER, tone: 'neutral' };
}

/** «VWCE», «VWCE e SWDA», «VWCE, SWDA e AGGH». */
function joinNames(names: string[]): string {
  return names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} e ${names[names.length - 1]}`;
}

/** The caption under a property listed net of its mortgage («Asset principali», 2026-10-17): «netto del mutuo di 95.000 €». */
export function describeNetOfDebtCaption(debtNetted: number): string {
  return `netto del mutuo di ${cachedFormatCurrencyEUR(debtNetted, true)}`;
}
