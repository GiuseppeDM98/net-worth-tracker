/**
 * The words of Cashflow › Dividendi: the verdict that answers «quanto rendono i miei flussi?»
 * before any number, and the one-line reading under each tile.
 *
 * Same design as `cashflowNarrative.ts` and `patrimonioNarrative.ts`: every function is pure
 * and returns a `Narrative` (segments flagged `mono`/`sign`), so the component sets figures in
 * Geist Mono and colours them by sign while the prose stays prose; no component writes copy,
 * and each phrasing is pinned by a test.
 *
 * Two honesty rules shape almost every sentence here (DESIGN.md → The Narrative Honesty Rule):
 *
 *   1. **Received and announced are never one figure.** A dividend with a future payment date
 *      is a promise, not income. It is counted, totalled and named separately everywhere.
 *   2. **A window still running is drawn but not ranked.** The current calendar year is on the
 *      chart and out of the average, and a year-to-date is compared with the SAME months of
 *      the previous year — a full year against eight months reads as a collapse by construction.
 *
 * Percentages go through chartService's it-IT formatter (comma decimals), currency through
 * `cachedFormatCurrencyEUR` (no-break space before €, four-digit amounts ungrouped).
 */

import type { Narrative, NarrativeSegment, PageVerdictModel, VerdictTone } from '@/lib/utils/narrative';
import type {
  CoverageMonth,
  DividendNetComparison,
  DpsGrowthSummary,
  TotalReturnSummary,
  DividendPeriod,
  DividendPeriodSummary,
  DividendReliability,
  PayerRanking,
  PaymentsInventory,
  UpcomingPayment,
  YearlyIncomeSummary,
  YieldSummary,
} from '@/lib/utils/dividendAnalytics';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import { formatNumber, formatPercentage } from '@/lib/services/chartService';
import { articleForPercent, ofThePercent, pluralArticleFor } from '@/lib/utils/patrimonioNarrative';
import type { DividendType } from '@/types/dividend';
import { getItalyMonthYear } from '@/lib/utils/dateHelpers';
import { MONTH_NAMES } from '@/lib/constants/months';
import { MONTH_NAMES_SHORT } from '@/lib/utils/period';

/** Months of the trailing window and of the yield window — stated, never implied. */
const TRAILING_MONTHS = 12;

// ─── Segment helpers ──────────────────────────────────────────────────────────

const prose = (text: string): NarrativeSegment => ({ text });
const figure = (text: string): NarrativeSegment => ({ text, mono: true });
const signed = (text: string, sign: 'positive' | 'negative'): NarrativeSegment => ({ text, mono: true, sign });

/** A whole-euro figure — a dividend reading never needs cents. */
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

/** "il 40%", "l'8%", "lo 0%" — the PRINTED integer decides the article. */
function percentWithArticle(value: number, decimals = 0): NarrativeSegment[] {
  return [prose(articleForPercent(value, decimals)), figure(formatPercentage(value, decimals))];
}

/**
 * A delta as the reader sees it: one decimal, so a change that prints as 0,0% is narrated as
 * no change. The direction follows the figure AS PRINTED, exactly like the article does.
 */
export function printedDelta(deltaPct: number): number {
  return Math.round(Math.abs(deltaPct * 100) * 10) / 10;
}

/** "15 settembre", or "12 gennaio 2027" when the payment lands outside the current year. */
function dayAndMonth(date: Date, now: Date): string {
  const { year: currentYear } = getItalyMonthYear(now);
  const { year, month } = getItalyMonthYear(date);
  const base = `${date.getDate()} ${monthInSentence(month)}`;
  return year === currentYear ? base : `${base} ${year}`;
}

// ─── The period as a grammatical subject ──────────────────────────────────────

export interface DividendPeriodSubject {
  /** The subject of a headline: "Agosto", "Il 2026", "Gli ultimi 12 mesi". */
  subject: string;
  /** The in-sentence form: "ad agosto", "nel 2026", "da sempre". */
  inPeriod: string;
}

/**
 * How each period is named. Every one of the four ends today, so the tense is always present
 * — unlike Tracciamento, where a closed month needs the past. That is one branch fewer to get
 * wrong, and it is a property of the axis, not a simplification.
 */
export function describeDividendPeriod(period: DividendPeriod, now: Date): DividendPeriodSubject {
  const { year, month } = getItalyMonthYear(now);
  switch (period) {
    case 'month':
      return { subject: MONTH_NAMES[month - 1], inPeriod: withPrepositionA(monthInSentence(month)) };
    case 'year':
      return { subject: `Il ${year}`, inPeriod: `nel ${year}` };
    case 'rolling12':
      return { subject: `Gli ultimi ${TRAILING_MONTHS} mesi`, inPeriod: `negli ultimi ${TRAILING_MONTHS} mesi` };
    case 'all':
      return { subject: 'Il portafoglio', inPeriod: 'da sempre' };
  }
}

/**
 * How the previous window is named — «luglio», «gen–ago 2025», «i 12 mesi prima» — or null
 * when there is none. A running year is compared with the SAME months of the previous year
 * (`computeNetComparison` shifts `now` back twelve months and re-filters by year), so the
 * label must say so: «sul 2025» over eight months would be a lie in one word.
 */
export function describeComparisonLabel(period: DividendPeriod, now: Date): string | null {
  const { year, month } = getItalyMonthYear(now);
  switch (period) {
    case 'month':
      return monthInSentence(month === 1 ? 12 : month - 1);
    case 'year':
      return `${MONTH_NAMES_SHORT[0].toLowerCase()}–${MONTH_NAMES_SHORT[month - 1].toLowerCase()} ${year - 1}`;
    case 'rolling12':
      return `i ${TRAILING_MONTHS} mesi prima`;
    case 'all':
      return null;
  }
}

/** "Incasso netto · 2026" — the hero tile's eyebrow, question then scope. */
export function describePeriodEyebrow(period: DividendPeriod, now: Date): string {
  const { year, month } = getItalyMonthYear(now);
  switch (period) {
    case 'month':
      return `Incasso netto · ${monthInSentence(month)}`;
    case 'year':
      return `Incasso netto · ${year}`;
    case 'rolling12':
      return `Incasso netto · ultimi ${TRAILING_MONTHS} mesi`;
    case 'all':
      return 'Incasso netto · storico';
  }
}

// ─── Verdict ──────────────────────────────────────────────────────────────────

export interface DividendiVerdictInput {
  period: DividendPeriod;
  now: Date;
  summary: DividendPeriodSummary;
  /** Against the comparable previous window; `deltaPct` null when there is none. */
  comparison: DividendNetComparison;
  payerCount: number;
  /** The server-measured yield; null when no held instrument has a cost basis. */
  yieldSummary: YieldSummary | null;
  /**
   * The soonest announced payment of the whole portfolio, whatever the period. It carries its
   * own date, so it names its own scope — «il prossimo stacco è ENI il 15 settembre» is true in
   * August and in the year alike.
   */
  next: UpcomingPayment | null;
  /** Announced money INSIDE the period window — the same figure the hero's chip prints. */
  upcomingNet: number;
}

function resolveHeadline(input: DividendiVerdictInput, subject: DividendPeriodSubject): { headline: string; tone: VerdictTone } {
  if (input.summary.count === 0) {
    return input.next
      ? { headline: `Nessun dividendo ${subject.inPeriod}, ma qualcosa è in arrivo.`, tone: 'neutral' }
      : { headline: `Nessun dividendo ${subject.inPeriod}.`, tone: 'neutral' };
  }

  const { deltaPct } = input.comparison;
  // No comparable predecessor (the whole history, or a first period): the verdict states what
  // it can see — that the portfolio produces income — and claims no direction it cannot measure.
  if (deltaPct === null) return { headline: 'Il portafoglio produce reddito.', tone: 'neutral' };

  const printed = printedDelta(deltaPct);
  if (printed === 0) return { headline: 'Il flusso di dividendi tiene.', tone: 'neutral' };
  // A falling dividend flow is a warning, not a loss: the money already received is still
  // received. `negative` is reserved for a figure that is itself a loss.
  return deltaPct > 0
    ? { headline: 'Il flusso di dividendi cresce.', tone: 'positive' }
    : { headline: 'Il flusso di dividendi è in calo.', tone: 'warning' };
}

/** ", +18,0% su gen–ago 2025" / ", invariato su …" — or nothing at all. */
function comparisonClause(comparison: DividendNetComparison, label: string | null): Narrative {
  if (comparison.deltaPct === null || !label) return [];
  const printed = printedDelta(comparison.deltaPct);
  if (printed === 0) return [prose(`, invariato su ${label}`)];
  const rising = comparison.deltaPct > 0;
  return [
    prose(', '),
    signed(`${rising ? '+' : '−'}${formatPercentage(printed, 1)}`, rising ? 'positive' : 'negative'),
    prose(` su ${label}`),
  ];
}

/** ". Il prossimo stacco è ENI il 15 settembre." — or nothing. */
function nextPaymentClause(next: UpcomingPayment | null, now: Date): Narrative {
  if (!next) return [];
  return [
    prose(`. Il prossimo stacco è ${next.assetTicker || next.assetName} il `),
    figure(dayAndMonth(next.paymentDate, now)),
  ];
}

/**
 * The headline and the sentence under it. Each clause is present only when its input is:
 * no predecessor → no comparison, no cost basis → no yield, nothing announced → no next stacco.
 */
export function buildDividendiVerdict(input: DividendiVerdictInput): PageVerdictModel {
  const subject = describeDividendPeriod(input.period, input.now);
  const { headline, tone } = resolveHeadline(input, subject);

  // Nothing received: the sentence is about what is coming, not about a zero.
  if (input.summary.count === 0) {
    if (!input.next) {
      return { headline, tone, sentence: [prose('Nessun pagamento incassato e nessuno annunciato.')] };
    }
    const nextName = input.next.assetTicker || input.next.assetName;
    // The period holds no announced money either: printing «0 € sono annunciati» beside a next
    // payment that IS coming would contradict itself. The clause goes, the date stays.
    if (input.upcomingNet <= 0) {
      return {
        headline,
        tone,
        sentence: [
          prose(`Nessun pagamento incassato ${subject.inPeriod}; il prossimo stacco è ${nextName} il `),
          figure(dayAndMonth(input.next.paymentDate, input.now)),
          prose('.'),
        ],
      };
    }
    return {
      headline,
      tone,
      sentence: [
        prose('Nessun pagamento incassato: '),
        figure(euro(input.upcomingNet)),
        prose(` ${pluralize(input.upcomingNet === 1 ? 1 : 2, 'è annunciato', 'sono annunciati')}, il prossimo è ${nextName} il `),
        figure(dayAndMonth(input.next.paymentDate, input.now)),
        prose('.'),
      ],
    };
  }

  const comparison = comparisonClause(input.comparison, describeComparisonLabel(input.period, input.now));
  const sentence: Narrative = [
    prose(`${capitalise(subject.inPeriod)} hai incassato `),
    figure(euro(input.summary.net)),
    prose(' netti'),
    ...comparison,
  ];

  if (input.payerCount > 0) {
    // The comma is the comparison clause's closing one: without a comparison the two figures
    // read as one phrase ("3116 € netti da 7 strumenti") and a comma would break it.
    sentence.push(
      prose(comparison.length > 0 ? ', da ' : ' da '),
      figure(String(input.payerCount)),
      prose(` ${pluralize(input.payerCount, 'strumento', 'strumenti')}`),
    );
  }
  if (input.yieldSummary?.yocGross != null) {
    sentence.push(prose('; rendono '), ...percentWithArticle(input.yieldSummary.yocGross, 1), prose(' lordo sul costo'));
  }
  sentence.push(...nextPaymentClause(input.next, input.now), prose('.'));

  return { headline, tone, sentence };
}

// ─── Tile readings ────────────────────────────────────────────────────────────

/**
 * "Lordo 3.998 €, ritenute 882 €: in media 390 € al mese." — the two facts the hero number
 * hides (what the taxman took) and the pace behind it. Over a single month the average IS the
 * hero, so the clause is dropped rather than repeated.
 */
export function describeNetIncome(summary: DividendPeriodSummary, monthsInWindow: number): Narrative | null {
  if (summary.count === 0) return null;
  const narrative: Narrative = [
    prose('Lordo '),
    figure(euro(summary.gross)),
    prose(', ritenute '),
    figure(euro(summary.tax)),
  ];
  if (monthsInWindow > 1) {
    narrative.push(prose(': in media '), figure(euro(summary.averageMonthlyNet)), prose(' al mese'));
  }
  narrative.push(prose('.'));
  return narrative;
}

/**
 * "Hai incassato in 7 mesi su 8: solo a febbraio non è arrivato niente." — how regular the
 * income is. The dry months are NAMED when the strip could draw them and there are at most
 * three; otherwise they are only counted, because a list of nine month names is not a reading.
 */
export function describeReliability(reliability: DividendReliability, dryMonthNames: string[]): Narrative | null {
  const { monthsWithIncome, monthsInWindow } = reliability;
  if (reliability.payerCount === 0 || monthsInWindow === 0) return null;

  if (monthsWithIncome >= monthsInWindow) {
    return [
      prose(`Hai incassato in tutti ${pluralArticleFor(monthsInWindow)} `),
      figure(String(monthsInWindow)),
      prose(' mesi del periodo.'),
    ];
  }

  const opening: Narrative = [
    prose('Hai incassato in '),
    figure(String(monthsWithIncome)),
    prose(' mesi su '),
    figure(String(monthsInWindow)),
  ];

  if (dryMonthNames.length === 0 || dryMonthNames.length > 3) return [...opening, prose('.')];

  const withPreposition = dryMonthNames.map((name) => withPrepositionA(name));
  const list =
    withPreposition.length === 1
      ? `solo ${withPreposition[0]}`
      : `${withPreposition.slice(0, -1).join(', ')} e ${withPreposition[withPreposition.length - 1]}`;
  return [...opening, prose(`: ${list} non è arrivato niente.`)];
}

/** The Affidabilità aside: the window, with the noun agreeing with the number in front of it. */
export function describeReliabilityWindow(months: number): Narrative {
  return [figure(String(months)), prose(` ${pluralize(months, 'mese', 'mesi')}`)];
}

/**
 * "Concentrazione moderata: ENI vale il 34% del netto, i primi tre il 70%." — how dependent
 * the income is on one payer. HHI bands: < 0,15 diversified, 0,15–0,25 moderate, above that
 * high. `topThreeShare` is null when there is no third payer to sum.
 */
export function describeConcentration(reliability: DividendReliability, topThreeShare: number | null): Narrative | null {
  if (reliability.payerCount === 0 || !reliability.topPayerTicker) return null;

  if (reliability.payerCount === 1) {
    return [prose(`Tutto il flusso arriva da ${reliability.topPayerTicker}.`)];
  }

  const band =
    reliability.concentrationHhi > 0.25 ? 'alta' : reliability.concentrationHhi > 0.15 ? 'moderata' : 'bassa';
  const narrative: Narrative = [
    prose(`Concentrazione ${band}: ${reliability.topPayerTicker} vale `),
    ...percentWithArticle(reliability.topPayerSharePct * 100),
    prose(' del netto'),
  ];
  if (topThreeShare !== null && reliability.payerCount > 3) {
    narrative.push(prose(', i primi tre '), ...percentWithArticle(topThreeShare));
  }
  narrative.push(prose('.'));
  return narrative;
}

/**
 * "Sul costo di quanto detieni oggi rendi il 4,6% lordo, contro il 3,4% sul valore di mercato:
 * il prezzo d'ingresso vale 1,2 punti." — the reading states the BASE, because a yield without
 * its denominator is not a number the user can act on.
 */
export function describeYield(summary: YieldSummary): Narrative | null {
  if (summary.yocGross == null) return null;

  const narrative: Narrative = [
    prose('Sul costo di quanto detieni oggi rendi '),
    ...percentWithArticle(summary.yocGross, 1),
    prose(' lordo'),
  ];

  if (summary.currentYieldGross != null) {
    narrative.push(prose(', contro '), ...percentWithArticle(summary.currentYieldGross, 1), prose(' sul valore di mercato'));
    // Decided on the PRINTED figure, like every other delta on the page: two yields that round
    // to the same tenth have no spread to state, and «0,0 punti in più» is not a fact.
    const points = summary.spread == null ? 0 : Math.round(Math.abs(summary.spread) * 10) / 10;
    if (summary.spread != null && points > 0) {
      // A spread only reads as a fact once it is stated as one: the entry price is worth
      // something, or today's price would be the better entry. Never "il tuo YOC batte".
      narrative.push(
        summary.spread >= 0
          ? prose(': il prezzo d’ingresso vale ')
          : prose(': oggi comprare renderebbe '),
        figure(formatNumber(points, 1)),
        prose(summary.spread >= 0 ? ' punti' : ' punti in più'),
      );
    }
  }
  narrative.push(prose('.'));
  return narrative;
}

/** The Rendimento tile's footer: what the figures cover, and that the window is not the picker's. */
export function describeYieldFooter(summary: YieldSummary): Narrative {
  return [
    prose('Su '),
    figure(String(summary.coverage)),
    prose(` ${pluralize(summary.coverage, 'strumento', 'strumenti')} con costo medio, ancora in portafoglio. La finestra è sempre gli ultimi `),
    figure(String(TRAILING_MONTHS)),
    prose(' mesi: non segue il periodo scelto.'),
  ];
}

/**
 * "7 strumenti hanno pagato nel 2026; ENI ha pagato di più, 1.062 € in 4 stacchi." — the count
 * and the leader, which the rows show but do not say. A lone payer is not ranked against itself.
 */
export function describePayerRanking(ranking: PayerRanking, inPeriod: string): Narrative | null {
  const { top, payerCount } = ranking;
  if (!top || payerCount === 0) return null;

  const leader = top.assetTicker || top.assetName;
  const stacchi: Narrative = [
    figure(euro(top.net)),
    prose(' in '),
    figure(String(top.count)),
    prose(` ${pluralize(top.count, 'stacco', 'stacchi')}.`),
  ];

  if (payerCount === 1) {
    return [prose(`Ha pagato un solo strumento ${inPeriod}: ${leader}, `), ...stacchi];
  }
  return [
    figure(String(payerCount)),
    prose(` strumenti hanno pagato ${inPeriod}; ${leader} ha pagato di più, `),
    ...stacchi,
  ];
}

/**
 * "In media 2.150 € netti l'anno sui 4 anni chiusi; il migliore è stato il 2025 (3.980 €)."
 * The running year never enters the average nor the ranking — but when it has already passed
 * the best closed year that IS a fact, and the sentence says it.
 */
export function describeYearlyIncome(summary: YearlyIncomeSummary): Narrative | null {
  if (summary.closedCount === 0 || summary.average === null || !summary.best) {
    // No closed year to rank against. The tile still has a bar; without a line saying why there
    // is no comparison, the reader is left to guess whether the data or the reading is missing.
    if (!summary.ongoing) return null;
    return [
      prose('Il '),
      figure(String(summary.ongoing.year)),
      prose(' è il primo anno con dividendi: non c’è ancora un anno chiuso da confrontare.'),
    ];
  }

  if (summary.closedCount === 1) {
    return [
      prose(`Un solo anno chiuso, il `),
      figure(String(summary.best.year)),
      prose(': '),
      figure(euro(summary.best.net)),
      prose(' netti.'),
    ];
  }

  const narrative: Narrative = [
    prose('In media '),
    figure(euro(summary.average)),
    prose(' netti l’anno sui '),
    figure(String(summary.closedCount)),
    prose(' anni chiusi; '),
  ];

  const passed = summary.ongoing !== null && summary.ongoing.net > summary.best.net;
  if (passed) {
    narrative.push(prose('il '), figure(String(summary.ongoing!.year)), prose(' ha già superato il '));
  } else {
    narrative.push(prose('il migliore è stato il '));
  }
  narrative.push(figure(String(summary.best.year)), prose(' ('), figure(euro(summary.best.net)), prose(').'));
  return narrative;
}

/** The Per anno tile's footer: what the dashed line is, and why the last bar is not judged. */
export function describeYearlyFooter(summary: YearlyIncomeSummary): Narrative | null {
  if (summary.average === null) return null;
  const narrative: Narrative = [
    prose('La tratteggiata è la media dei '),
    figure(String(summary.closedCount)),
    prose(' anni chiusi.'),
  ];
  if (summary.ongoing) {
    narrative.push(prose(' Il '), figure(String(summary.ongoing.year)), prose(' è ancora in corso: non entra nel confronto.'));
  }
  return narrative;
}

/**
 * How the largest row is introduced, per type. The article and the elision are DATA, not a
 * template: «il ordinario» is not Italian, and an ordinary dividend does not need naming as one
 * at all — the row is already in a list of dividends. Only the types a reader would otherwise
 * mistake for a plain dividend carry a prefix.
 */
const LARGEST_TYPE_PREFIX: Record<DividendType, string> = {
  ordinary: '',
  extraordinary: 'il dividendo straordinario ',
  interim: "l'acconto ",
  final: 'il saldo ',
  coupon: 'la cedola ',
  finalPremium: 'il premio finale ',
};

/**
 * "15 voci: 12 incassate (3.116 €) e 3 annunciate (712 €); la più grande è la cedola BTP Italia
 * Nv30 (618 €)." — the inventory's own count. The two totals stay apart on purpose.
 */
export function describePaymentsInventory(inventory: PaymentsInventory): Narrative | null {
  if (inventory.total === 0) return null;

  const narrative: Narrative = [figure(String(inventory.total))];
  if (inventory.announcedCount === 0) {
    narrative.push(
      prose(` ${pluralize(inventory.total, 'voce incassata', 'voci incassate')} (`),
      figure(euro(inventory.receivedNet)),
      prose(')'),
    );
  } else if (inventory.receivedCount === 0) {
    narrative.push(
      prose(` ${pluralize(inventory.total, 'voce annunciata', 'voci annunciate')} (`),
      figure(euro(inventory.announcedNet)),
      prose(')'),
    );
  } else {
    narrative.push(
      prose(` ${pluralize(inventory.total, 'voce', 'voci')}: `),
      figure(String(inventory.receivedCount)),
      prose(` ${pluralize(inventory.receivedCount, 'incassata', 'incassate')} (`),
      figure(euro(inventory.receivedNet)),
      prose(') e '),
      figure(String(inventory.announcedCount)),
      prose(` ${pluralize(inventory.announcedCount, 'annunciata', 'annunciate')} (`),
      figure(euro(inventory.announcedNet)),
      prose(')'),
    );
  }

  if (inventory.largest) {
    narrative.push(
      prose(`; la più grande è ${LARGEST_TYPE_PREFIX[inventory.largest.dividendType]}${inventory.largest.label} (`),
      figure(euro(inventory.largest.net)),
      prose(')'),
    );
  }
  narrative.push(prose('.'));
  return narrative;
}

/** The Pagamenti tile's aside: "15 voci", or "4 di 15 voci" while the toolbar narrows the list. */
export function describePaymentsCount(shown: number, total: number): Narrative {
  if (total === 0) return [prose('nessuna voce')];
  const voci: Narrative = [figure(String(total)), prose(` ${pluralize(total, 'voce', 'voci')}`)];
  return shown === total ? voci : [figure(String(shown)), prose(' di '), ...voci];
}

/**
 * The sub-eyebrow over the hero's bars. A year draws its own months, so it is "mese per mese";
 * every other period draws a trailing window and the label says how long it is — the chart and
 * the KPIs above it are then visibly on different windows, which is the point.
 */
export function describeMonthlyWindow(period: DividendPeriod, months: number): Narrative {
  if (period === 'year') return [prose('Mese per mese')];
  return [prose('Ultimi '), figure(String(months)), prose(' mesi')];
}

/**
 * "Su 5 strumenti con almeno due anni di storico il dividendo per azione cresce del 5,4%
 * l'anno (mediana); Intesa Sanpaolo è la migliore, +10,3% sull'ultimo anno chiuso." — the
 * growth table's own reading. "Ultimo anno CHIUSO" is not decoration: the running year's DPS
 * is a partial sum and comparing it would invent a collapse every January.
 */
export function describeDpsGrowth(summary: DpsGrowthSummary): Narrative | null {
  if (summary.median === null) return null;

  const narrative: Narrative = [
    prose('Su '),
    figure(String(summary.coverage)),
    prose(` ${pluralize(summary.coverage, 'strumento', 'strumenti')} con storico il dividendo per azione `),
    ...(summary.median >= 0
      ? [prose('cresce '), prose(ofThePercent(Math.abs(summary.median), 1)), signed(formatPercentage(Math.abs(summary.median), 1), 'positive')]
      : [prose('cala '), prose(ofThePercent(Math.abs(summary.median), 1)), signed(formatPercentage(Math.abs(summary.median), 1), 'negative')]),
    prose(' l’anno (mediana)'),
  ];

  if (summary.best) {
    narrative.push(
      prose(`; ${summary.best.assetTicker} è il migliore, `),
      signed(
        `${summary.best.latestYoyGrowth >= 0 ? '+' : '−'}${formatPercentage(Math.abs(summary.best.latestYoyGrowth), 1)}`,
        summary.best.latestYoyGrowth >= 0 ? 'positive' : 'negative',
      ),
      prose(' sull’ultimo anno chiuso'),
    );
  }
  narrative.push(prose('.'));
  return narrative;
}

/**
 * "In media +25,6% sul capitale investito; VWCE è il migliore (+62,4%), iShares Core Global
 * Aggregate il solo sotto zero (−3,1%)." — the total-return table's reading. The worst row is
 * called "sotto zero" only when it actually is, and "il solo" only when it is alone there.
 */
export function describeTotalReturn(summary: TotalReturnSummary): Narrative | null {
  if (summary.count === 0) return null;

  const narrative: Narrative = [
    prose('In media '),
    signed(
      `${summary.average >= 0 ? '+' : '−'}${formatPercentage(Math.abs(summary.average), 1)}`,
      summary.average >= 0 ? 'positive' : 'negative',
    ),
    prose(' sul capitale investito'),
  ];

  if (summary.count === 1) {
    narrative.push(prose('.'));
    return narrative;
  }

  const signOf = (value: number): 'positive' | 'negative' => (value >= 0 ? 'positive' : 'negative');
  const printed = (value: number) => `${value >= 0 ? '+' : '−'}${formatPercentage(Math.abs(value), 1)}`;

  narrative.push(
    prose(`; ${summary.best.assetTicker} è il migliore (`),
    signed(printed(summary.best.totalReturnPercentage), signOf(summary.best.totalReturnPercentage)),
    prose(')'),
  );

  const worstLabel =
    summary.negativeCount === 1 ? 'il solo sotto zero' : summary.negativeCount > 1 ? 'il peggiore' : 'il peggiore';
  narrative.push(
    prose(`, ${summary.worst.assetTicker} ${worstLabel} (`),
    signed(printed(summary.worst.totalReturnPercentage), signOf(summary.worst.totalReturnPercentage)),
    prose(')'),
  );
  narrative.push(prose('.'));
  return narrative;
}

/** The Chi-paga tile's footer: what the ranking deliberately leaves out. */
export function describePayersFooter(upcomingNet: number): Narrative | null {
  if (upcomingNet <= 0) return null;
  return [
    prose('Solo i pagamenti già incassati: i '),
    figure(euro(upcomingNet)),
    prose(' annunciati entrano quando arrivano.'),
  ];
}

/** The Pagamenti tile's footer: where the rows come from, and why two totals and not one. */
export function describePaymentsFooter(): Narrative {
  return [
    prose(
      'I dividendi recenti si scaricano da soli ogni giorno. Un importo in grigio è annunciato, non ancora incassato: i due totali restano separati.',
    ),
  ];
}

/** The names of the months the coverage strip marks as unpaid, in order. */
export function dryMonthNames(months: CoverageMonth[]): string[] {
  return months.filter((month) => !month.paid).map((month) => monthInSentence(month.month));
}
