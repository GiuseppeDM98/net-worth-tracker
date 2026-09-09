/**
 * The words of Rendimenti: the verdict that answers «quanto rende il portafoglio, e rispetto a
 * cosa?» before any number, and the one-line reading under each tile.
 *
 * Same design as `overviewNarrative.ts` and `dividendiNarrative.ts`: every function is pure and
 * returns a `Narrative` (segments flagged `mono`/`sign`), so the component sets figures in Geist
 * Mono and colours them by sign while the prose stays prose; no component writes copy, and each
 * phrasing is pinned by a test.
 *
 * The honesty rules that shape these sentences (DESIGN.md → The Narrative Honesty Rule):
 *
 *   1. **The figure says what it is, and the gap next to it is on the same basis.** Below six
 *      months the hero is the period return and the sentence prints the qualifier
 *      `resolveHeroReturn` chose («nei 4 mesi»); the gap against the model is then the gap of the
 *      PERIOD (both rates compounded to the same months), never the annualised one beside a
 *      period figure.
 *   2. **A window shorter than its name is named by what it measured.** «Negli ultimi 3 anni» on
 *      fourteen months of history would be a lie in three words: the subject becomes «Negli ultimi
 *      14 mesi», and a year-to-date that starts in April says «Da aprile».
 *   3. **A missing input drops its clause.** No benchmark yet → no benchmark clause; no Sharpe →
 *      no Sharpe; a portfolio that never fell → «mai sotto il massimo», never a fake drawdown; a
 *      ranking with no portfolio return → no reading at all.
 *   4. **Direction follows the figure AS PRINTED.** A return that prints as 0,0% is neither a gain
 *      nor a loss, a gap that prints as 0,0 punti is «in linea» — the same rule as `printedDelta`
 *      on the cashflow pages.
 *   5. **«Oggi» only when the window ends at the latest snapshot.** A custom range that closes in
 *      December 2024 says «a fine dicembre 2024», never «oggi».
 *
 * Percentages go through chartService's it-IT formatter (comma decimals), currency through
 * `cachedFormatCurrencyEUR` (no-break space before €, four-digit amounts ungrouped), and every
 * minus is the typographic U+2212.
 */

import type { Narrative, NarrativeSegment, PageVerdictModel, VerdictTone } from '@/lib/utils/narrative';
import type { FlowSource, PeriodMonth, TimePeriod } from '@/types/performance';
import type { PerformanceBaseResolution } from '@/lib/utils/performanceBase';
import { RESIDUAL_ALERT_SHARE, type ResidualMonth, type ReturnAttribution } from '@/lib/utils/performanceAttribution';
import type {
  BenchmarkRanking,
  DrawdownStory,
  HeroReturn,
  PerformanceVerdict,
  RealizedGainsSummary,
  ReturnConsistency,
} from '@/lib/utils/performanceSummary';
import { deannualizeReturn, printedGap } from '@/lib/utils/performanceSummary';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import { formatNumber, formatPercentage } from '@/lib/services/chartService';
import { articleForPercent, monthWithPrepositionA, ofThePercent, startsWithVowel } from '@/lib/utils/patrimonioNarrative';
import { MONTH_NAMES } from '@/lib/constants/months';
import { MONTH_NAMES_SHORT } from '@/lib/utils/period';

// ─── Segment helpers ──────────────────────────────────────────────────────────

const prose = (text: string): NarrativeSegment => ({ text });
const figure = (text: string): NarrativeSegment => ({ text, mono: true });
const signed = (text: string, value: number): NarrativeSegment =>
  value > 0 ? { text, mono: true, sign: 'positive' } : value < 0 ? { text, mono: true, sign: 'negative' } : { text, mono: true };

const MINUS = '−';

/** The value rounded to the decimals the screen prints, so sign and words follow the figure. */
function printed(value: number, decimals = 1): number {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

/** A signed percentage as the screen prints it: «+7,3%», «−4,1%», «0,0%» (a rounded zero has no sign). */
export function signedPercent(value: number, decimals = 1): string {
  const shown = printed(value, decimals);
  const abs = formatPercentage(Math.abs(shown), decimals);
  return shown > 0 ? `+${abs}` : shown < 0 ? `${MINUS}${abs}` : abs;
}

/** A percentage segment signed and coloured on the PRINTED value. */
function percentSegment(value: number, decimals = 1): NarrativeSegment {
  return signed(signedPercent(value, decimals), printed(value, decimals));
}

/** A signed whole-euro amount: «+3745 €», «−412 €». */
function signedEuro(value: number): string {
  const abs = cachedFormatCurrencyEUR(Math.abs(value), true);
  return value > 0 ? `+${abs}` : value < 0 ? `${MINUS}${abs}` : abs;
}

/** A whole-euro figure — a reading never needs cents. */
const euro = (value: number) => cachedFormatCurrencyEUR(Math.abs(value), true);

/** A ratio with two decimals and a typographic minus: «1,08», «−0,30». */
function ratio(value: number): string {
  return formatNumber(value, 2).replace('-', MINUS);
}

/** «107,3 €» — an index value read as money, one decimal. */
function indexedEuro(value: number): string {
  return `${formatNumber(value, 1)} €`;
}

function pluralize(count: number, singular: string, plural: string): string {
  return count === 1 ? singular : plural;
}

function monthInSentence(month: number): string {
  return MONTH_NAMES[month - 1].toLowerCase();
}

/** «marzo 2026» — a month named with its year, for stories that may span years. */
function monthAndYear(m: PeriodMonth): string {
  return `${monthInSentence(m.month)} ${m.year}`;
}

/** «ad aprile 2026» / «a maggio 2026». */
function toMonthAndYear(m: PeriodMonth): string {
  return `${monthWithPrepositionA(m.month)} ${m.year}`;
}

/**
 * The group an amount's name opens with: «199.600» → centonovantanove (199), «8000» → ottomila (8),
 * «18.000» → diciottomila (18), «1500» → millecinquecento (1 — but «mille», a consonant).
 */
function leadingGroup(amount: number): number {
  let group = Math.abs(Math.round(amount));
  while (group >= 1000) group = Math.floor(group / 1000);
  return group;
}

/** «dei 199.600 €» but «degli 8000 €», «degli 11.000 €», «degli 80.000 €»; «dei 1500 €» (mille). */
function ofThePlural(amount: number): string {
  const group = leadingGroup(amount);
  const isMille = group === 1 && Math.abs(amount) >= 1000;
  return !isMille && startsWithVowel(group) ? 'degli ' : 'dei ';
}

/** The article before a model portfolio's name: «il 90/10 Buffett», «l'All Weather». */
function nameWithArticle(name: string): string {
  return /^[aeiou]/i.test(name) ? `l'${name}` : `il ${name}`;
}

/** «del Portafoglio 60/40» / «dell'All Weather». */
function ofTheName(name: string): string {
  return /^[aeiou]/i.test(name) ? `dell'${name}` : `del ${name}`;
}

/** «nel Portafoglio 60/40» / «nell'All Weather». */
function inTheName(name: string): string {
  return /^[aeiou]/i.test(name) ? `nell'${name}` : `nel ${name}`;
}

/** «60/40» out of «Portafoglio 60/40» — the headline names the model, not its label. */
function shortBenchmarkName(name: string): string {
  return name.replace(/^Portafoglio\s+/i, '');
}

// ─── The period as a grammatical subject ──────────────────────────────────────

export interface PerformancePeriodInput {
  period: TimePeriod;
  nominalPeriodStart: PeriodMonth | null;
  /** First month actually measured (the 1st of the month after the starting valuation). */
  startDate: Date;
  endDate: Date;
  numberOfMonths: number;
}

export interface PerformancePeriodSubject {
  /** The subject of a headline: «Da inizio anno», «Nell'ultimo anno», «Negli ultimi 14 mesi». */
  subject: string;
  /** The in-sentence form: «da inizio anno», «nell'ultimo anno». */
  inPeriod: string;
}

const NOMINAL_MONTHS: Partial<Record<TimePeriod, number>> = { '1Y': 12, '3Y': 36, '5Y': 60 };

function lastMonthsSubject(months: number): string {
  if (months === 1) return "Nell'ultimo mese";
  if (months === 12) return "Nell'ultimo anno";
  if (months > 12 && months % 12 === 0) return `Negli ultimi ${months / 12} anni`;
  return `Negli ultimi ${months} mesi`;
}

/**
 * How each period is named. A rolling window is named by its nominal length only when the history
 * fills it; otherwise by the months actually measured. A year-to-date whose first measured month
 * is not January says from which month it runs.
 */
export function describePerformancePeriod(input: PerformancePeriodInput): PerformancePeriodSubject {
  const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
  switch (input.period) {
    case 'YTD': {
      const firstMonth = input.startDate.getMonth() + 1;
      const subject = firstMonth === 1 ? 'Da inizio anno' : `Da ${monthInSentence(firstMonth)}`;
      return { subject, inPeriod: lower(subject) };
    }
    case '1Y':
    case '3Y':
    case '5Y': {
      const nominal = NOMINAL_MONTHS[input.period] ?? input.numberOfMonths;
      const subject = lastMonthsSubject(Math.min(input.numberOfMonths, nominal) || nominal);
      return { subject, inPeriod: lower(subject) };
    }
    case 'ALL':
      return { subject: 'Da sempre', inPeriod: 'da sempre' };
    default:
      return { subject: 'Nel periodo scelto', inPeriod: 'nel periodo scelto' };
  }
}

const PERIOD_LABELS: Record<TimePeriod, string> = {
  YTD: 'YTD',
  '1Y': '1 anno',
  '3Y': '3 anni',
  '5Y': '5 anni',
  ALL: 'Storico',
  CUSTOM: 'Personalizzato',
  ROLLING_12M: '12 mesi',
};

/** «ago 2025 – lug 2026», or «gen – lug 2026» inside one year. */
export function describeWindow(startDate: Date, endDate: Date): string {
  const from = MONTH_NAMES_SHORT[startDate.getMonth()].toLowerCase();
  const to = MONTH_NAMES_SHORT[endDate.getMonth()].toLowerCase();
  if (startDate.getFullYear() === endDate.getFullYear()) return `${from} – ${to} ${endDate.getFullYear()}`;
  return `${from} ${startDate.getFullYear()} – ${to} ${endDate.getFullYear()}`;
}

/** «1 anno · ago 2025 – lug 2026» — the Rendimento tile's aside: the axis, then the window. */
export function describePeriodAside(input: PerformancePeriodInput): string {
  return `${PERIOD_LABELS[input.period]} · ${describeWindow(input.startDate, input.endDate)}`;
}

// ─── Verdict ──────────────────────────────────────────────────────────────────

export interface PerformanceVerdictInput extends PerformancePeriodInput {
  /** The hero figure — annualised, or the period return below six months (`resolveHeroReturn`). */
  heroReturn: HeroReturn;
  /** The annualised TWR the quality and the model are compared on; null without one. */
  annualizedReturn: number | null;
  /** The risk-adjusted quality from `summarizePerformance`; its tone is the verdict's tone. */
  quality: PerformanceVerdict;
  sharpeRatio: number | null;
  /** The reference model and ITS annualised return; null while its series is not loaded. */
  benchmark: { name: string; annualized: number } | null;
  /** The deepest drawdown of the period; null when the portfolio never fell. */
  drawdown: DrawdownStory | null;
  consistency: ReturnConsistency;
}

/** The page's one de-annualisation (`performanceSummary.deannualizeReturn`) — the same step the hero and the period chip take. */
function deannualise(annualPct: number, months: number): number {
  return deannualizeReturn(annualPct, months);
}

/**
 * The gap against the model ON THE HERO'S BASIS: annualised when the hero is annualised, the
 * period's gap when the hero is the period return (rule 1 above). Null without both sides.
 */
export function resolveBenchmarkGap(input: PerformanceVerdictInput): number | null {
  if (!input.benchmark || input.annualizedReturn === null) return null;
  if (input.heroReturn.isPeriodReturn) {
    return deannualise(input.annualizedReturn, input.numberOfMonths) - deannualise(input.benchmark.annualized, input.numberOfMonths);
  }
  return input.annualizedReturn - input.benchmark.annualized;
}

function resolveHeadline(input: PerformanceVerdictInput, gap: number | null): { headline: string; tone: VerdictTone } {
  const { subject } = describePerformancePeriod(input);
  const lead = `${subject} il portafoglio`;
  const value = input.heroReturn.value;

  if (value === null || input.quality.tone === 'neutral') {
    return { headline: 'Servono più mesi per giudicare il rendimento.', tone: 'neutral' };
  }
  const shown = printed(value);
  if (input.quality.tone === 'weak') {
    return shown <= 0
      ? { headline: `${lead} perde.`, tone: 'negative' }
      : { headline: `${lead} rende, ma non compensa il rischio.`, tone: 'negative' };
  }
  if (input.quality.tone === 'fragile') {
    return input.sharpeRatio !== null
      ? { headline: `${lead} rende, ma il rischio pesa.`, tone: 'warning' }
      : { headline: `${lead} rende, ma meno del tasso privo di rischio.`, tone: 'warning' };
  }
  // solid / strong: the risk is paid — the model decides the rest of the sentence.
  if (!input.benchmark || gap === null) return { headline: `${lead} rende bene.`, tone: 'positive' };
  const model = shortBenchmarkName(input.benchmark.name);
  const points = printedGap(gap);
  if (points === 0) return { headline: `${lead} rende quanto il ${model}.`, tone: 'positive' };
  return points > 0
    ? { headline: `${lead} rende più ${ofTheName(model)}.`, tone: 'positive' }
    : { headline: `${lead} rende, ma meno ${ofTheName(model)}.`, tone: 'neutral' };
}

/** «a marzo», or «ad aprile 2025» when the window is longer than a year and a month name alone is ambiguous. */
function drawdownMonth(m: PeriodMonth, input: PerformancePeriodInput): string {
  return input.numberOfMonths > 12 ? `${monthWithPrepositionA(m.month)} ${m.year}` : monthWithPrepositionA(m.month);
}

/** «1,2 punti», «1 punto», «0,4 punti» — on the printed gap. */
function pointsLabel(gap: number): string {
  const points = Math.abs(printedGap(gap));
  return `${formatNumber(points, points === Math.round(points) ? 0 : 1)} ${pluralize(points, 'punto', 'punti')}`;
}

function buildSentence(input: PerformanceVerdictInput, gap: number | null): Narrative {
  const value = input.heroReturn.value;
  if (value === null) {
    return [prose('Il periodo non ha ancora un rendimento misurabile; il verdetto arriva con i prossimi snapshot mensili.')];
  }

  const out: Narrative = [
    prose(printed(value) < 0 ? 'Perde ' : 'Rende '),
    percentSegment(value),
    prose(` ${input.heroReturn.label} (TWR)`),
  ];

  if (input.benchmark && gap !== null) {
    const points = printedGap(gap);
    if (points === 0) {
      out.push(prose(`, in linea con il ${input.benchmark.name}`));
    } else {
      out.push(prose(', '), signed(pointsLabel(gap), points), prose(` ${points > 0 ? 'sopra' : 'sotto'} il ${input.benchmark.name}`));
    }
  }

  if (input.sharpeRatio !== null) {
    out.push(prose(', con uno Sharpe di '), figure(ratio(input.sharpeRatio)));
  }

  if (input.drawdown) {
    const d = input.drawdown;
    const recovery =
      d.monthsToRecover === null
        ? 'non ancora recuperato'
        : `recuperato in ${d.monthsToRecover} ${pluralize(d.monthsToRecover, 'mese', 'mesi')}`;
    out.push(prose('; il drawdown massimo è stato '), percentSegment(d.value), prose(` ${drawdownMonth(d.trough, input)}, ${recovery}`));
  } else {
    out.push(prose('; mai sotto il massimo del periodo'));
  }

  const c = input.consistency;
  if (c.totalMonths > 0) {
    out.push(prose('; '), figure(`${c.positiveMonths} ${pluralize(c.positiveMonths, 'mese', 'mesi')} su ${c.totalMonths}`), prose(` ${pluralize(c.positiveMonths, 'positivo', 'positivi')}.`));
  } else {
    out.push(prose('.'));
  }
  return out;
}

/** The page's opening: a headline whose tone is the risk-adjusted quality, then the facts. */
export function buildPerformanceVerdict(input: PerformanceVerdictInput): PageVerdictModel {
  const gap = resolveBenchmarkGap(input);
  const { headline, tone } = resolveHeadline(input, gap);
  return { headline, tone, sentence: buildSentence(input, gap) };
}

// ─── Tile readings ────────────────────────────────────────────────────────────

/** The month a window closes on, and whether that is the latest snapshot («oggi») or a past one. */
export interface WindowEnd {
  endMonth: PeriodMonth;
  /** True when the window ends at the latest snapshot — the only case the reading may say «oggi». */
  endsAtLatest: boolean;
}

/** «oggi» or «a fine dicembre 2024». */
function endLabel(end: WindowEnd): string {
  return end.endsAtLatest ? 'oggi' : `a fine ${monthAndYear(end.endMonth)}`;
}

/** «100 € a fine luglio 2025 oggi valgono 107,3 €; nel Portafoglio 60/40 varrebbero 106,1 €.» */
export function describeGrowthOfHundred(input: {
  baseMonth: PeriodMonth;
  end: WindowEnd;
  portfolioEnd: number;
  benchmarkEnd: number | null;
  benchmarkName: string;
}): Narrative {
  const out: Narrative = [
    figure('100 €'),
    prose(` a fine ${monthAndYear(input.baseMonth)} ${endLabel(input.end)} valgono `),
    signed(indexedEuro(input.portfolioEnd), printed(input.portfolioEnd - 100)),
  ];
  if (input.benchmarkEnd !== null) {
    out.push(prose(`; ${inTheName(input.benchmarkName)} varrebbero `), figure(indexedEuro(input.benchmarkEnd)));
  }
  out.push(prose('.'));
  return out;
}

/** The Sharpe bands of `summarizePerformance`, read as a consequence. */
function sharpeReading(sharpe: number): string {
  if (sharpe >= 1) return 'il rischio è pagato';
  if (sharpe >= 0) return 'il rendimento paga poco il rischio';
  return 'sotto il tasso privo di rischio';
}

/**
 * «Volatilità del 4,9% annua e Sharpe di 1,08: il rischio è pagato.» Below the three-month floor
 * the tile says why there is no number instead of printing one.
 */
export function describeRisk(input: { volatility: number | null; sharpeRatio: number | null; monthsMeasured: number }): Narrative {
  if (input.volatility === null) {
    return [prose(`Con ${input.monthsMeasured} ${pluralize(input.monthsMeasured, 'mese misurato', 'mesi misurati')} la volatilità non si calcola: servono almeno 3.`)];
  }
  const out: Narrative = [prose(`Volatilità ${ofThePercent(input.volatility, 1)}`), figure(formatPercentage(input.volatility, 1)), prose(' annua')];
  if (input.sharpeRatio !== null) {
    out.push(prose(' e Sharpe di '), figure(ratio(input.sharpeRatio)), prose(`: ${sharpeReading(input.sharpeRatio)}.`));
  } else {
    out.push(prose('.'));
  }
  return out;
}

/** «9 mesi su 12 positivi (75%); il migliore aprile 2026 (+3,1%), il peggiore marzo 2026 (−3,0%).» */
export function describeConsistency(c: ReturnConsistency): Narrative {
  if (c.totalMonths === 0) return [prose('Nessun mese misurato nel periodo.')];
  const out: Narrative = [
    figure(`${c.positiveMonths} ${pluralize(c.positiveMonths, 'mese', 'mesi')} su ${c.totalMonths}`),
    prose(` ${pluralize(c.positiveMonths, 'positivo', 'positivi')}`),
  ];
  if (c.positiveShare !== null) out.push(prose(' ('), figure(formatPercentage(c.positiveShare, 0)), prose(')'));
  if (c.best && c.worst) {
    const single = c.best.year === c.worst.year && c.best.month === c.worst.month;
    if (single) {
      out.push(prose(`; ${monthAndYear(c.best)} (`), percentSegment(c.best.return), prose(').'));
    } else {
      out.push(
        prose(`; il migliore ${monthAndYear(c.best)} (`),
        percentSegment(c.best.return),
        prose(`), il peggiore ${monthAndYear(c.worst)} (`),
        percentSegment(c.worst.return),
        prose(').'),
      );
    }
  } else {
    out.push(prose('.'));
  }
  return out;
}

/** The measured boundary flows of the period, when the base is a subset and some month could be measured. */
export interface PortfolioFlowReading {
  /** Σ of the measured flows over the months that had one. */
  flow: number;
  source: FlowSource;
  measuredMonths: number;
  totalMonths: number;
}

/**
 * Two figures that measure two different things, side by side on purpose: the ledger's buys minus
 * sells and the cashflow's income minus spending. Without the ledger the reading says so. When the
 * base is a subset, a third sentence says what the formulas actually neutralised — the capital
 * measured on the base's boundary — and on how many months, since it is neither of the two.
 */
export function describeContributions(input: {
  invested: { investedEur: number; divestedEur: number; netInvestedEur: number } | null;
  netCashFlow: number;
  /** The pension channel of the period; absent or 0 drops its sentence. */
  pension?: { flow: number; entryFlow: number; entryMonth: string | null; internalFlow?: number };
  /** The measured boundary flows; absent or `source: 'cashflow'` drops its sentence. */
  portfolio?: PortfolioFlowReading;
}): Narrative {
  const cashflowClause: Narrative =
    input.netCashFlow >= 0
      ? [figure(euro(input.netCashFlow)), prose(' messi da parte')]
      : [prose('dal cashflow sono usciti '), figure(euro(input.netCashFlow)), prose(' più di quanto è entrato')];

  const out: Narrative = [];
  if (!input.invested) {
    out.push(
      ...(input.netCashFlow >= 0
        ? [prose('Dal cashflow hai messo da parte '), figure(euro(input.netCashFlow)), prose(' nel periodo; il registro operazioni non è attivo.')]
        : [prose('Dal cashflow sono usciti '), figure(euro(input.netCashFlow)), prose(' più di quanto è entrato nel periodo; il registro operazioni non è attivo.')])
    );
  } else {
    const net = input.invested.netInvestedEur;
    out.push(prose(net >= 0 ? 'Hai investito ' : 'Hai disinvestito '), figure(euro(net)), prose(' dal registro'));
    out.push(prose(input.netCashFlow >= 0 ? ', a fronte di ' : ', mentre '), ...cashflowClause, prose('.'));
  }
  out.push(...describeMeasuredFlows(input.portfolio));
  out.push(...describePensionChannel(input.pension));
  return out;
}

/**
 * The measured boundary flows as their own sentence: what the return formulas neutralised when the
 * base is a subset, and over how many months — «Nella base sono entrati 4200 € misurati sul
 * confine (registro e quantità) in 8 mesi su 9; negli altri vale il risparmio del cashflow.» A
 * negative figure is capital that left. Nothing when every month used the cashflow.
 */
function describeMeasuredFlows(portfolio: PortfolioFlowReading | undefined): Narrative {
  if (!portfolio || portfolio.source === 'cashflow' || portfolio.measuredMonths === 0) return [];
  const verb = portfolio.flow >= 0 ? ' Nella base sono entrati ' : ' Dalla base sono usciti ';
  const out: Narrative = [prose(verb), figure(euro(portfolio.flow)), prose(' misurati sul confine (registro e quantità)')];
  if (portfolio.source === 'portfolio') {
    out.push(prose(portfolio.measuredMonths === 1 ? ' nel mese.' : ` in tutti i ${portfolio.measuredMonths} mesi.`));
  } else {
    out.push(prose(` in ${portfolio.measuredMonths} ${portfolio.measuredMonths === 1 ? 'mese' : 'mesi'} su ${portfolio.totalMonths}; negli altri vale il risparmio del cashflow.`));
  }
  return out;
}

/**
 * The pension channel as its own sentence, after the cashflow's: money that reached the funds
 * from outside is capital, not savings, and the funds' entry into the base is neither — it is
 * named for what it is, with its month. Nothing when the channel is empty. A `transfer` from an
 * account inside the base only restores what the measured flows already counted on the account's
 * side: it is named as moved within the base, never as money from outside.
 */
function describePensionChannel(pension: { flow: number; entryFlow: number; entryMonth: string | null; internalFlow?: number } | undefined): Narrative {
  if (!pension || Math.round(pension.flow) === 0) return [];
  const internal = pension.internalFlow ?? 0;
  const external = pension.flow - internal;
  if (Math.round(external) === 0 && Math.round(internal) !== 0) {
    return [prose(' Nei fondi pensione sono passati '), figure(euro(internal)), prose(' da un conto già nella base: capitale spostato, non entrato.')];
  }
  if (pension.flow < 0) {
    return [prose(' Dai conti sono passati '), figure(euro(pension.flow)), prose(' ai fondi pensione, fuori dalla base.')];
  }
  const out: Narrative = [prose(' Nei fondi pensione sono entrati '), figure(euro(external))];
  if (Math.round(pension.entryFlow) > 0 && pension.entryMonth) {
    out.push(prose(', di cui '), figure(euro(pension.entryFlow)), prose(` per l'ingresso del fondo nella base a ${monthYearFromKey(pension.entryMonth)}`));
  } else {
    out.push(prose(' da fuori (TFR, datoriale, busta paga)'));
  }
  if (Math.round(internal) !== 0) out.push(prose('; altri '), figure(euro(internal)), prose(' sono passati da un conto già nella base'));
  out.push(prose('.'));
  return out;
}

/** «luglio 2026» from a 'YYYY-MM' key. */
function monthYearFromKey(key: string): string {
  const [year, month] = key.split('-').map(Number);
  return `${monthInSentence(month)} ${year}`;
}

/**
 * «Batte 4 portafogli modello su 6; solo il 90/10 Buffett ha reso di più.» Null while nothing is
 * measured or the portfolio has no return to compare (no comparison → no sentence). A model within
 * a tenth of a point is «alla pari», counted neither as beaten nor as above.
 */
export function describeBenchmarkRanking(ranking: BenchmarkRanking): Narrative | null {
  const compared = ranking.rows.filter((r) => r.annualized !== null && r.delta !== null);
  if (compared.length === 0) return null;
  const above = compared.filter((r) => printedGap(r.delta as number) < 0);
  const tied = compared.filter((r) => printedGap(r.delta as number) === 0);
  const tieClause = tied.length === 1 ? `, alla pari con ${nameWithArticle(tied[0].name)}` : tied.length > 1 ? `, alla pari con ${tied.length}` : '';

  if (above.length === 0 && ranking.beaten > 0) {
    const all = ranking.beaten === compared.length;
    if (compared.length === 1) return [prose(`Batte ${nameWithArticle(compared[0].name)}, l'unico portafoglio modello misurato.`)];
    return all
      ? [prose(`Batte tutti e ${compared.length} i portafogli modello.`)]
      : [prose('Batte '), figure(String(ranking.beaten)), prose(` ${pluralize(ranking.beaten, 'portafoglio modello', 'portafogli modello')} su ${compared.length}${tieClause}.`)];
  }
  if (ranking.beaten === 0) {
    const tail = above.length === 0 ? tieClause.replace(/^, /, '') : `il migliore è ${nameWithArticle(above[0].name)}`;
    return [prose(above.length === 0 ? `Alla pari con ${tied.length === 1 ? nameWithArticle(tied[0].name) : `${tied.length} portafogli modello`}.` : `Nessun portafoglio modello ha reso meno; ${tail}.`)];
  }
  const aboveClause =
    above.length === 1
      ? `solo ${nameWithArticle(above[0].name)} ha reso di più`
      : above.length === 2
        ? `${nameWithArticle(above[0].name)} e ${nameWithArticle(above[1].name)} hanno reso di più`
        : `${above.length} hanno reso di più`;
  return [
    prose('Batte '),
    figure(String(ranking.beaten)),
    prose(` ${pluralize(ranking.beaten, 'portafoglio modello', 'portafogli modello')} su ${compared.length}${tieClause}; ${aboveClause}.`),
  ];
}

/** «Dal registro operazioni hai realizzato +3745 € in totale; il 2026 chiude per ora in perdita (−412 €).» */
export function describeRealizedGains(summary: RealizedGainsSummary, currentYear: number): Narrative {
  const out: Narrative = [prose('Dal registro operazioni hai realizzato '), signed(signedEuro(summary.total), summary.total), prose(' in totale')];
  const latest = summary.years[0];
  if (latest.year === currentYear) {
    out.push(
      prose(latest.amount < 0 ? `; il ${latest.year} chiude per ora in perdita (` : `; il ${latest.year} è per ora a `),
      signed(signedEuro(latest.amount), latest.amount),
      prose(latest.amount < 0 ? ').' : '.'),
    );
    return out;
  }
  if (summary.years.length === 1) {
    out.push(prose(`, tutto nel ${latest.year}.`));
    return out;
  }
  const best = summary.years.reduce((a, b) => (b.amount > a.amount ? b : a));
  // A best year that still lost money is not «migliore»: every year lost, this one the least.
  out.push(
    prose(best.amount > 0 ? `; l'anno migliore è il ${best.year} (` : `; tutti gli anni in perdita, il meno pesante il ${best.year} (`),
    signed(signedEuro(best.amount), best.amount),
    prose(').'),
  );
  return out;
}

/** «Dei 199.600 € di oggi, 186.500 € sono capitale immesso e 13.100 € rendimento del mercato.» */
export function describeCapitalAndMarket(last: { netWorth: number; investedBase: number; returns: number }, end: WindowEnd): Narrative {
  const article = ofThePlural(last.netWorth);
  const when = end.endsAtLatest ? ' di oggi' : ` ${endLabel(end)}`;
  const out: Narrative = [
    prose(`${article.charAt(0).toUpperCase()}${article.slice(1)}`),
    figure(euro(last.netWorth)),
    prose(`${when}, `),
    figure(euro(last.investedBase)),
    prose(' sono capitale immesso'),
  ];
  if (last.returns >= 0) {
    out.push(prose(' e '), signed(euro(last.returns), last.returns), prose(' rendimento del mercato.'));
  } else {
    out.push(prose(': il mercato ha tolto '), signed(euro(last.returns), last.returns), prose('.'));
  }
  return out;
}

/**
 * The line under the verdict that names the measured base. It exists because the recurring
 * question is «perché il drawdown non torna con Storico?» — the two pages measure different
 * capitals, and that must be said on the page, not left to deduce.
 *
 * With the pension toggle on the funds are in only from `pensionEntryMonth`, so the line names
 * that month and what a contribution is from then on; a toggle that is on with nothing trackable
 * says why the funds are still out (The Narrative Honesty Rule).
 */
export function describeMeasurementBase(base: Pick<PerformanceBaseResolution, 'options' | 'pensionEntryMonth' | 'pensionFundIds'>): string {
  const { options } = base;
  const hasFunds = base.pensionFundIds.length > 0;
  const excluded = [
    options.includePensionFunds ? null : 'dei fondi pensione',
    options.includeExcludedAssets ? null : "degli asset esclusi dall'allocazione",
    // The liquidity toggle: the cash accounts are out, and what they pay for is a measured flow.
    options.excludeCash ? 'della liquidità (gli acquisti pagati dai conti sono flussi)' : null,
  ].filter((x): x is string => x !== null);
  const fundsIn = options.includePensionFunds && base.pensionEntryMonth !== null;
  const fundsClause = fundsIn ? `i fondi pensione da ${monthYearFromKey(base.pensionEntryMonth!)} (i versamenti sono flussi, non rendimento)` : null;
  const notYet =
    options.includePensionFunds && hasFunds && !fundsIn
      ? ' I fondi pensione restano fuori finché non c’è un versamento registrato o un mese di partenza in Impostazioni.'
      : '';

  if (excluded.length === 0) {
    return fundsClause ? `Base: patrimonio totale, con ${fundsClause}.` : `Base: patrimonio totale.${notYet}`;
  }
  const head = fundsClause ? `Base: portafoglio gestito più ${fundsClause}` : 'Base: portafoglio gestito';
  const list = excluded.length <= 2 ? excluded.join(' e ') : `${excluded.slice(0, -1).join(', ')} e ${excluded[excluded.length - 1]}`;
  return `${head}, al netto ${list}.${notYet}`;
}

// ─── Da dove viene il rendimento ─────────────────────────────────────────────

/** «2%» — the guard's threshold as the screen prints it. */
const residualThreshold = () => formatPercentage(RESIDUAL_ALERT_SHARE * 100, 0);

/** «marzo 2026 (−1850 €, il 4% della base)», the months of the residual guard, at most three, joined. */
function residualMonthsList(months: ResidualMonth[]): Narrative {
  const shown = months.slice(0, 3);
  const out: Narrative = [];
  shown.forEach((m, index) => {
    if (index > 0) out.push(prose(index === shown.length - 1 ? ' e ' : ', '));
    out.push(prose(`${monthAndYear(m.month)} (`), signed(signedEuro(m.unattributed), m.unattributed), prose(`, il ${formatPercentage(m.share * 100, 0)} della base)`));
  });
  if (months.length > shown.length) out.push(prose(` e altri ${months.length - shown.length} mesi`));
  return out;
}

/**
 * The Dettaglio's reading over the full table: «10 strumenti attribuiti su 9 mesi (da gennaio a
 * settembre 2026); −2269 € non attribuibili a uno strumento. In marzo 2026 (−1850 €, il 4% della
 * base) il non attribuito supera il 2% della base di inizio mese: qualcosa ha mosso il totale
 * senza passare dal prezzo di uno strumento — un dividendo incassato, un saldo corretto a mano, una
 * spesa pagata da un conto fuori dal tracciamento.» When the breakdown covers only part of the
 * period, the measured count is named beside the attributed one; the second sentence exists only
 * when the residual guard named a month (`residualMonths`).
 */
export function describeAttributionCoverage(attribution: ReturnAttribution): Narrative {
  const { coverage, rows, unattributed, residualMonths } = attribution;
  if (coverage.attributedMonths === 0 || !coverage.firstAttributed || !coverage.lastAttributed) {
    return [prose('Nessun mese del periodo ha il dettaglio per strumento.')];
  }
  const sameMonth = coverage.attributedMonths === 1;
  const window = sameMonth
    ? monthAndYear(coverage.firstAttributed)
    : `da ${monthInSentence(coverage.firstAttributed.month)}${coverage.firstAttributed.year !== coverage.lastAttributed.year ? ` ${coverage.firstAttributed.year}` : ''} a ${monthAndYear(coverage.lastAttributed)}`;
  const out: Narrative = [
    figure(`${rows.length} ${pluralize(rows.length, 'strumento', 'strumenti')}`),
    prose(` ${pluralize(rows.length, 'attribuito', 'attribuiti')} su `),
    figure(`${coverage.attributedMonths} ${pluralize(coverage.attributedMonths, 'mese', 'mesi')}`),
    prose(` (${window})`),
  ];
  if (coverage.attributedMonths < coverage.measuredMonths) out.push(prose(` dei ${coverage.measuredMonths} misurati`));
  if (Math.abs(Math.round(unattributed)) >= 1) {
    out.push(prose('; '), signed(signedEuro(unattributed), unattributed), prose(' non attribuibili a uno strumento'));
  }
  out.push(prose('.'));
  if (residualMonths.length > 0) {
    out.push(
      prose(' In '),
      ...residualMonthsList(residualMonths),
      prose(
        ` il non attribuito supera il ${residualThreshold()} della base di inizio mese: qualcosa ha mosso il totale senza passare dal prezzo di uno strumento — un dividendo incassato, un saldo corretto a mano, una spesa pagata da un conto fuori dal tracciamento.`,
      ),
    );
  }
  return out;
}

/**
 * «Il mercato ha reso +16.836 € da gennaio: Vanguard All-World ne ha portati +16.569 €, MSCI World
 * +2977 €; −2269 € non sono attribuibili a uno strumento (in marzo 2026 oltre il 2% della base).»
 * The gain is the page's own (the TWR numerator over the attributed months), the top instruments
 * are named with their euro effect, and the residual is said, never spread — with the month(s)
 * the residual guard flagged in brackets, so the reader knows WHERE the sum comes from. When only
 * part of the period has a per-instrument breakdown the sentence names the covered window instead
 * of pretending the sum is the period's.
 */
export function describeAttribution(attribution: ReturnAttribution): Narrative {
  const { coverage, rows, gain, unattributed, residualMonths } = attribution;
  if (coverage.attributedMonths === 0) {
    return [prose('Nessun mese del periodo ha il dettaglio per strumento: l’attribuzione parte dagli snapshot che lo registrano.')];
  }

  const partial = coverage.attributedMonths < coverage.measuredMonths && coverage.firstAttributed;
  const window = partial
    ? ` nei ${coverage.attributedMonths} ${pluralize(coverage.attributedMonths, 'mese', 'mesi')} con il dettaglio per strumento (da ${monthAndYear(coverage.firstAttributed!)})`
    : '';
  const shownGain = Math.round(gain);
  const lead: Narrative =
    shownGain > 0
      ? [prose('Il mercato ha reso '), signed(signedEuro(gain), gain), prose(window)]
      : shownGain < 0
        ? [prose('Il mercato ha tolto '), signed(signedEuro(gain), gain), prose(window)]
        : [prose(`Il mercato ha chiuso in pari${window}`)];

  if (rows.length === 0) {
    return [...lead, prose(': nessuno strumento ha mosso il rendimento.')];
  }

  const [first, second] = rows;
  const out: Narrative = [...lead, prose(': '), prose(`${first.name} `), prose(first.total >= 0 ? 'ne ha portati ' : 'ne ha tolti '), signed(signedEuro(first.total), first.total)];
  if (second) out.push(prose(`, ${second.name} `), signed(signedEuro(second.total), second.total));
  if (Math.abs(Math.round(unattributed)) >= 1) {
    out.push(prose('; '), signed(signedEuro(unattributed), unattributed), prose(' non sono attribuibili a uno strumento'));
    if (residualMonths.length > 0) {
      const named = residualMonths.slice(0, 2).map((m) => monthAndYear(m.month));
      const tail = residualMonths.length > 2 ? ` e altri ${residualMonths.length - 2} mesi` : '';
      out.push(prose(` (in ${named.join(' e ')}${tail} oltre il ${residualThreshold()} della base)`));
    }
  }
  out.push(prose('.'));
  return out;
}

// ─── Dettaglio readings ───────────────────────────────────────────────────────

/**
 * «ROI del 9,8% sul capitale iniziale e CAGR del 7,6%; il tuo timing ha reso l'8,9% (IRR).» A
 * negative value takes a direction word and the absolute figure («ROI negativo dell'8,1%», «ha
 * perso il 2,3%»): an elided article never lands on a minus sign. The ROI names its denominator
 * because that is what it is — a gain over the FIRST month's capital, never the period's return
 * (the cumulative TWR is the Rendimento tile's chip).
 */
export function describeReturnMetrics(m: { roi: number | null; cagr: number | null; moneyWeightedReturn: number | null }): Narrative {
  const absPercent = (value: number) => signed(formatPercentage(Math.abs(printed(value)), 1), printed(value));
  const parts: Narrative[] = [];
  if (m.roi !== null) {
    parts.push([prose(`ROI ${printed(m.roi) < 0 ? 'negativo ' : ''}${ofThePercent(m.roi, 1)}`), absPercent(m.roi), prose(' sul capitale iniziale')]);
  }
  if (m.cagr !== null) {
    parts.push([prose(`CAGR ${printed(m.cagr) < 0 ? 'negativo ' : ''}${ofThePercent(m.cagr, 1)}`), absPercent(m.cagr)]);
  }
  if (parts.length === 0 && m.moneyWeightedReturn === null) return [prose('ROI, CAGR e IRR non sono calcolabili su questo periodo.')];
  const out: Narrative = parts.flatMap((p, i) => (i === 0 ? p : [prose(' e '), ...p]));
  if (m.moneyWeightedReturn !== null) {
    const irr = m.moneyWeightedReturn;
    const verb = printed(irr) < 0 ? 'ha perso' : 'ha reso';
    out.push(prose(`${out.length ? '; il' : 'Il'} tuo timing ${verb} ${articleForPercent(irr, 1)}`), absPercent(irr), prose(' (IRR)'));
  }
  out.push(prose('.'));
  return out;
}

/** «Dal picco di febbraio 2026 alla valle di marzo 2026, poi 2 mesi di risalita fino a maggio 2026.» */
export function describeDrawdownDetail(story: DrawdownStory | null): Narrative {
  if (!story) return [prose('Il portafoglio non è mai sceso sotto un massimo nel periodo.')];
  const head = `Dal picco di ${monthAndYear(story.peak)} alla valle di ${monthAndYear(story.trough)}`;
  if (story.recovery === null || story.monthsToRecover === null) return [prose(`${head}; il recupero non è ancora arrivato.`)];
  return [
    prose(`${head}, poi `),
    figure(`${story.monthsToRecover} ${pluralize(story.monthsToRecover, 'mese', 'mesi')}`),
    prose(` di risalita fino ${toMonthAndYear(story.recovery)}.`),
  ];
}

/** «I dividendi rendono il 3,1% netto sul costo e il 2,6% sul prezzo di oggi.» Null without either. */
export function describeYields(y: { yocNet: number | null; currentYieldNet: number | null }): Narrative | null {
  if (y.yocNet === null && y.currentYieldNet === null) return null;
  if (y.yocNet !== null && y.currentYieldNet !== null) {
    return [
      prose(`I dividendi rendono ${articleForPercent(y.yocNet, 1)}`),
      figure(formatPercentage(y.yocNet, 1)),
      prose(` netto sul costo e ${articleForPercent(y.currentYieldNet, 1)}`),
      figure(formatPercentage(y.currentYieldNet, 1)),
      prose(' sul prezzo di oggi.'),
    ];
  }
  if (y.yocNet !== null) {
    return [prose(`I dividendi rendono ${articleForPercent(y.yocNet, 1)}`), figure(formatPercentage(y.yocNet, 1)), prose(' netto sul costo.')];
  }
  return [
    prose(`I dividendi rendono ${articleForPercent(y.currentYieldNet as number, 1)}`),
    figure(formatPercentage(y.currentYieldNet as number, 1)),
    prose(' netto sul prezzo di oggi; nessun costo medio per lo YOC.'),
  ];
}

/**
 * «31 mesi di storico, con 18.400 € versati nel periodo.» — what the figures beside it are
 * measured ON, for the tile of the AI analysis that answers exactly that.
 *
 * The contribution clause disappears when nothing moved in or out: «con 0 € versati» is a
 * sentence about an absence, and the reading already says how long the window is.
 */
export function describeAnalysisBase(input: { monthsMeasured: number; netCashFlow: number | null }): Narrative {
  const out: Narrative = [
    figure(`${input.monthsMeasured} ${pluralize(input.monthsMeasured, 'mese', 'mesi')}`),
    prose(' di storico'),
  ];
  if (input.netCashFlow !== null && Math.round(input.netCashFlow) !== 0) {
    const verb = input.netCashFlow > 0 ? 'versati' : 'prelevati';
    out.push(prose(', con '), figure(euro(input.netCashFlow)), prose(` ${verb} nel periodo`));
  }
  out.push(prose('.'));
  return out;
}
