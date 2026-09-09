/**
 * Storico's words: the verdict that answers «come sono arrivato qui?» before any number, and
 * the reading line under each tile of that page.
 *
 * Same design as the other `*Narrative.ts` modules: every function is pure and returns a
 * `Narrative` (segments flagged `mono`/`sign`) rendered by `NarrativeText`; the phrasings are
 * pinned by tests, and a sentence never claims what the data cannot support — a missing input
 * drops its clause, never a placeholder (DESIGN.md → The Narrative Honesty Rule).
 *
 * The one thing this page must never confuse: its growth rate is WEALTH growth, contributions
 * included, and the sentence says so («il 19,4% l'anno, versamenti inclusi»); Rendimenti's
 * CAGR is an investment return. Both are honest; naming the basis is what keeps them apart.
 *
 * Percentages go through chartService's it-IT formatter (comma decimals), currency through
 * `cachedFormatCurrencyEUR` (no-break space before €) — AGENTS.md → Italian Localization.
 */

import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import { formatPercentage } from '@/lib/services/chartService';
import { MONTH_NAMES } from '@/lib/constants/months';
import { MONTH_NAMES_SHORT } from '@/lib/utils/period';
import { articleForPercent, atThePercent, monthWithPrepositionA } from '@/lib/utils/patrimonioNarrative';
import type { Narrative, NarrativeSegment, PageVerdictModel, VerdictTone } from '@/lib/utils/narrative';
import type { DoublingMode, DoublingTimeSummary } from '@/types/assets';
import type { CompositionCut, CompositionSeries } from '@/lib/utils/historyComposition';
import { resolveDriverShares, runningSinceMonth, type AllTimeHigh, type DoublingProjection, type DriverYear, type GrowthPace, type GrowthSummary, type LaborMetrics, type MonthlyMoves, type OtherIncomeCategory, type PeriodMonth } from '@/lib/utils/storicoSummary';
import type { MonthAssetBreakdown } from '@/lib/utils/snapshotAssetBreakdown';

// ─── Formatting helpers ───────────────────────────────────────────────────────

const prose = (text: string): NarrativeSegment => ({ text });
const figure = (text: string): NarrativeSegment => ({ text, mono: true });
const MINUS = '−';

/** True when a formatted figure is a zero («0 €», «0,0%», «0,0 pp»): the sign is decided on the text the screen prints (The Comma Rule). */
function isPrintedZero(text: string): boolean {
  return !/[1-9]/.test(text);
}

/** A mono segment signed and coloured on the PRINTED value; a printed zero gets neither. */
function signedOn(unsigned: string, value: number, coloured: boolean): NarrativeSegment {
  if (isPrintedZero(unsigned) || value === 0) return { text: unsigned, mono: true };
  const negative = value < 0;
  const text = `${negative ? MINUS : '+'}${unsigned}`;
  return coloured ? { text, mono: true, sign: negative ? 'negative' : 'positive' } : { text, mono: true };
}

/** «+4930 €», «−130 €», «0 €» — signed and coloured on the printed amount; a printed zero has neither. */
function signedCurrency(value: number): NarrativeSegment {
  return signedOn(cachedFormatCurrencyEUR(Math.abs(value), true), value, true);
}

/** «+4930 €» set in mono with a typographic sign but NO colour: a flow (a buy, a deposit) is neither a gain nor a loss. */
function signedFlow(value: number): NarrativeSegment {
  return signedOn(cachedFormatCurrencyEUR(Math.abs(value), true), value, false);
}

/** An unsigned euro amount without cents, coloured by the sign of the printed value. */
function currencyWithSign(value: number): NarrativeSegment {
  const text = cachedFormatCurrencyEUR(Math.abs(value), true);
  if (isPrintedZero(text) || value === 0) return { text, mono: true };
  return { text, mono: true, sign: value < 0 ? 'negative' : 'positive' };
}

function amount(value: number): NarrativeSegment {
  return figure(cachedFormatCurrencyEUR(Math.abs(value), true));
}

/** «+236,4%», «−4,1%», «0,0%» — a printed zero has no sign and no colour. */
function signedPercent(value: number, decimals = 1): NarrativeSegment {
  return signedOn(formatPercentage(Math.abs(value), decimals), value, true);
}

/** «+2,4 pp», «0,0 pp» — a share drift is neither a gain nor a loss, so it stays uncoloured. */
function points(deltaPp: number): NarrativeSegment {
  return signedOn(`${formatPercentage(Math.abs(deltaPp), 1).replace('%', '')} pp`, deltaPp, false);
}

/** «ottobre 2022» */
export function formatPeriodMonth(period: PeriodMonth): string {
  return `${MONTH_NAMES[period.month - 1].toLowerCase()} ${period.year}`;
}

/** «ott 2022» */
export function formatPeriodMonthShort(period: PeriodMonth): string {
  return `${MONTH_NAMES_SHORT[period.month - 1].toLowerCase()} ${period.year}`;
}

/** «a ottobre 2022» / «ad agosto 2024» */
function atPeriodMonth(period: PeriodMonth): string {
  return `${monthWithPrepositionA(period.month)} ${period.year}`;
}

/** «3 anni e 1 mese», «1 anno», «5 mesi», «meno di un mese». */
export function formatDurationLong(months: number): string {
  const whole = Math.max(0, Math.round(months));
  if (whole === 0) return 'meno di un mese';
  const years = Math.floor(whole / 12);
  const rest = whole % 12;
  const yearPart = years === 0 ? '' : years === 1 ? '1 anno' : `${years} anni`;
  const monthPart = rest === 0 ? '' : rest === 1 ? '1 mese' : `${rest} mesi`;
  if (yearPart && monthPart) return `${yearPart} e ${monthPart}`;
  return yearPart || monthPart;
}

/** «3a 1m», «2a», «5m» — the row form. */
export function formatDurationShort(months: number): string {
  const whole = Math.max(0, Math.round(months));
  const years = Math.floor(whole / 12);
  const rest = whole % 12;
  if (years === 0) return `${rest}m`;
  return rest === 0 ? `${years}a` : `${years}a ${rest}m`;
}

function joinClauses(parts: Narrative[], separator: string): Narrative {
  return parts.flatMap((part, i) => (i === 0 ? part : [prose(separator), ...part]));
}

// ─── Verdict ──────────────────────────────────────────────────────────────────

export interface StoricoVerdictInput {
  growth: GrowthSummary | null;
  moves: MonthlyMoves;
  pace: GrowthPace;
  /** When the last completed doubling closed; null without one. */
  lastDoubling: PeriodMonth | null;
}

function resolveHeadline(input: StoricoVerdictInput): { headline: string; tone: VerdictTone } {
  const { growth, pace } = input;
  if (!growth) return { headline: 'Lo storico comincia con il primo snapshot.', tone: 'neutral' };
  if (growth.snapshotCount === 1) return { headline: `Lo storico comincia da ${formatPeriodMonth(growth.first)}.`, tone: 'neutral' };
  if (growth.delta < 0) return { headline: 'Il patrimonio è sotto il punto di partenza.', tone: 'negative' };
  if (growth.delta === 0) return { headline: "Il patrimonio è dov'era al primo snapshot.", tone: 'neutral' };
  switch (pace.verdict) {
    case 'accelerating':
      return { headline: 'Il patrimonio è cresciuto, e sta accelerando.', tone: 'positive' };
    case 'steady':
      return { headline: 'Il patrimonio cresce al ritmo di sempre.', tone: 'positive' };
    case 'slowing':
      return { headline: 'Il patrimonio è cresciuto, ma ha rallentato.', tone: 'positive' };
    case 'losing':
      return { headline: "Il patrimonio è cresciuto, ma nell'ultimo anno ha perso.", tone: 'warning' };
    default:
      return { headline: 'Il patrimonio è cresciuto dal primo snapshot.', tone: 'positive' };
  }
}

/** «(+236,4%, il 19,4% l'anno, versamenti inclusi)» — the parenthesis after the growth amount. */
function growthParenthesis(growth: GrowthSummary): Narrative {
  if (growth.growthPct === null) return [];
  const inner: Narrative = [signedPercent(growth.growthPct, 1)];
  if (growth.cagr !== null) {
    const article = growth.cagr < 0 ? '' : articleForPercent(growth.cagr, 1);
    inner.push(prose(`, ${article}`), growth.cagr < 0 ? signedPercent(growth.cagr, 1) : figure(formatPercentage(Math.abs(growth.cagr), 1)), prose(" l'anno, versamenti inclusi"));
  }
  return [prose(' ('), ...inner, prose(')')];
}

function paceSentence(pace: GrowthPace): Narrative {
  if (pace.trailingDelta === null) return [];
  if (pace.verdict === 'losing' || pace.trailingDelta < 0) {
    return [prose(" Nell'ultimo anno ha perso "), currencyWithSign(pace.trailingDelta), prose('.')];
  }
  const head: Narrative = [prose(" Nell'ultimo anno è salito di "), currencyWithSign(pace.trailingDelta)];
  // «sopra la media di una perdita» says nothing honest: the growth clause already says the history fell.
  if (pace.verdict === null || pace.lifetimeMonthly === null || pace.lifetimeMonthly <= 0) return [...head, prose('.')];
  const comparison = pace.verdict === 'accelerating' ? 'sopra la media di ' : pace.verdict === 'slowing' ? 'sotto la media di ' : 'in linea con la media di ';
  return [...head, prose(`, ${comparison}`), amount(pace.lifetimeMonthly * 12), prose(" l'anno.")];
}

export function buildStoricoVerdict(input: StoricoVerdictInput): PageVerdictModel {
  const { headline, tone } = resolveHeadline(input);
  const { growth, moves, pace, lastDoubling } = input;

  if (!growth) {
    return {
      headline,
      tone,
      sentence: [prose('Ogni snapshot è la fotografia di fine mese del patrimonio: il cron ne salva uno al giorno, oppure creane uno dalla Panoramica o aggiungi un mese passato da qui.')],
    };
  }
  if (growth.snapshotCount === 1) {
    return { headline, tone, sentence: [prose('Un solo snapshot ('), amount(growth.first.value), prose('): la crescita si misura dal secondo.')] };
  }

  const verb = growth.delta < 0 ? 'è sceso di ' : growth.delta === 0 ? 'è rimasto a ' : 'è cresciuto di ';
  const sentence: Narrative = [
    prose(`Dal primo snapshot (${formatPeriodMonth(growth.first)}) il patrimonio ${verb}`),
    growth.delta === 0 ? amount(growth.latest.value) : currencyWithSign(growth.delta),
    ...growthParenthesis(growth),
  ];

  const clauses: Narrative[] = [];
  if (moves.best) clauses.push([prose(`il mese migliore è stato ${formatPeriodMonth(moves.best)} (`), signedCurrency(moves.best.delta), prose(')')]);
  if (lastDoubling) clauses.push([prose(`l'ultimo raddoppio ${atPeriodMonth(lastDoubling)}`)]);
  if (clauses.length > 0) sentence.push(prose(': '), ...joinClauses(clauses, ', '));
  sentence.push(prose('.'));
  sentence.push(...paceSentence(pace));
  return { headline, tone, sentence };
}

// ─── Evoluzione ───────────────────────────────────────────────────────────────

/**
 * «Al massimo storico: 68 mesi su 82 in crescita, il peggiore marzo 2020 (−8300 €).» The
 * verdict already names the best month, so this tile names the worst — no row twice.
 */
export function describeEvolution({ ath, moves }: { ath: AllTimeHigh | null; moves: MonthlyMoves }): Narrative | null {
  if (!ath || moves.measuredMonths === 0) return null;
  const opening: Narrative = ath.isAtHigh
    ? [prose('Al massimo storico')]
    : [
        amount(ath.gap),
        ...(ath.gapPct === null ? [] : [prose(' ('), figure(formatPercentage(Math.abs(ath.gapPct), 1)), prose(')')]),
        prose(` sotto il massimo di ${formatPeriodMonth(ath.peak)}`),
      ];
  const worst: Narrative = moves.worst
    ? [prose(`il peggiore ${formatPeriodMonth(moves.worst)} (`), signedCurrency(moves.worst.delta), prose(')')]
    : [prose('nessun mese in calo')];
  return [...opening, prose(': '), figure(String(moves.risingMonths)), prose(' mesi su '), figure(String(moves.measuredMonths)), prose(' in crescita, '), ...worst, prose('.')];
}

/** «set 2019 → lug 2026» — the Evoluzione tile's aside. */
export function describeEvolutionAside(growth: GrowthSummary): string {
  return `${formatPeriodMonthShort(growth.first)} → ${formatPeriodMonthShort(growth.latest)}`;
}

/** «dal set 2019 · 83 rilevazioni» — the compact header's description. */
export function describeStoricoHeader(growth: GrowthSummary | null): string | undefined {
  if (!growth) return undefined;
  if (growth.snapshotCount === 1) return `${formatPeriodMonthShort(growth.first)} · 1 rilevazione`;
  return `dal ${formatPeriodMonthShort(growth.first)} · ${growth.snapshotCount} rilevazioni`;
}

// ─── Raddoppi ─────────────────────────────────────────────────────────────────

export interface DoublingsInput {
  summary: DoublingTimeSummary;
  mode: DoublingMode;
  projection: DoublingProjection | null;
}

/**
 * «Raddoppiato una volta, ad ottobre 2022 in 3 anni e 1 mese; il prossimo raddoppio è al 66% e
 * al ritmo dell'ultimo anno arriva a gennaio 2028.» In threshold mode the amounts are named.
 */
export function describeDoublings({ summary, mode, projection }: DoublingsInput): Narrative {
  const completed = summary.milestones.filter((m) => m.isComplete);
  const current = summary.currentDoublingInProgress;
  const isThreshold = mode === 'threshold';
  const last = completed[completed.length - 1] ?? null;

  const progress: Narrative = [];
  if (current && current.progressPercentage !== undefined) {
    const subject = completed.length === 0 ? 'il primo' : 'il prossimo';
    // «Nessun raddoppio ancora: il primo è al 45%» — the noun was just said.
    const noun = isThreshold || completed.length === 0 ? '' : ' raddoppio';
    const target = isThreshold && current.thresholdValue ? [prose(' ('), amount(current.thresholdValue), prose(')')] : [];
    const pct = Math.round(current.progressPercentage);
    progress.push(prose(`${subject}${noun}`), ...target);
    if (pct <= 0) {
      // chartService caps the progress at 99 but never floors it: below the start the row's track is
      // empty, and the sentence says what is true instead of printing a negative progress.
      progress.push(prose(current.progressPercentage < 0 ? ' è sotto il punto di partenza' : ' non è ancora iniziato'));
    } else {
      progress.push(prose(` è ${atThePercent(pct, 0)}`), figure(`${pct}%`));
    }
    if (projection) progress.push(prose(` e al ritmo dell'ultimo anno arriva ${atPeriodMonth(projection.eta)}`));
  }

  if (!last) {
    const head = isThreshold ? 'Nessun traguardo ancora' : 'Nessun raddoppio ancora';
    return progress.length > 0 ? [prose(`${head}: `), ...progress, prose('.')] : [prose(`${head}.`)];
  }

  const head: Narrative = [];
  if (isThreshold) {
    const n = completed.length;
    head.push(prose(n === 1 ? 'Superato un traguardo (' : `Superati ${n} traguardi, l'ultimo (`), amount(last.thresholdValue ?? last.endValue), prose(`) ${atPeriodMonth(last.endDate)} in ${formatDurationLong(last.durationMonths)}`));
  } else {
    const n = completed.length;
    head.push(prose(n === 1 ? `Raddoppiato una volta, ${atPeriodMonth(last.endDate)}` : `Raddoppiato ${n} volte, l'ultima ${atPeriodMonth(last.endDate)}`), prose(` in ${formatDurationLong(last.durationMonths)}`));
  }
  return progress.length > 0 ? [...head, prose('; '), ...progress, prose('.')] : [...head, prose('.')];
}

// ─── Composizione ─────────────────────────────────────────────────────────────

/** The subject of each band as it reads in a sentence, with the verb «pesare» agreeing with it. */
const BAND_SUBJECTS: Record<string, { subject: string; plural: boolean }> = {
  equity: { subject: 'le azioni', plural: true },
  bonds: { subject: 'le obbligazioni', plural: true },
  crypto: { subject: 'le criptovalute', plural: true },
  realestate: { subject: 'gli immobili', plural: true },
  cash: { subject: 'la liquidità', plural: false },
  commodity: { subject: 'le materie prime', plural: true },
  trendFollowing: { subject: 'il Trend Following', plural: false },
  carry: { subject: 'il Carry', plural: false },
  pension: { subject: 'la Previdenza', plural: false },
  residual: { subject: 'il non attribuito', plural: false },
};

function bandSubject(key: string, label: string): { subject: string; plural: boolean } {
  return BAND_SUBJECTS[key] ?? { subject: label.toLowerCase(), plural: false };
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function driftClause(deltaPp: number | null): Narrative {
  return deltaPp === null ? [] : [prose(' ('), points(deltaPp), prose(' in un anno)')];
}

/**
 * Asset-class cut: «Le azioni pesano il 57,0% del patrimonio (+2,4 pp in un anno) e le
 * obbligazioni il 17,0%; la Previdenza è il 7,5%.» Liquidity cut: «Il 71,2% del patrimonio è
 * liquido (+1,2 pp in un anno), il 28,8% illiquido.» Reads the series' own breakdown — the
 * maths stays in `historyComposition.ts`.
 */
export function describeComposition(series: CompositionSeries, cut: CompositionCut): Narrative | null {
  const breakdown = series.breakdown;
  if (breakdown.length === 0) return null;

  if (cut === 'liquidity') {
    const liquid = breakdown.find((b) => b.key === 'liquid');
    const illiquid = breakdown.find((b) => b.key === 'illiquid');
    const residual = breakdown.find((b) => b.key === 'residual');
    const parts: Narrative = [];
    if (liquid) {
      parts.push(prose(capitalize(articleForPercent(liquid.sharePct, 1))), figure(formatPercentage(liquid.sharePct, 1)), prose(' del patrimonio è liquido'), ...driftClause(liquid.deltaPp));
      if (illiquid) parts.push(prose(`, ${articleForPercent(illiquid.sharePct, 1)}`), figure(formatPercentage(illiquid.sharePct, 1)), prose(' illiquido'));
    } else if (illiquid) {
      parts.push(prose(capitalize(articleForPercent(illiquid.sharePct, 1))), figure(formatPercentage(illiquid.sharePct, 1)), prose(' del patrimonio è illiquido'), ...driftClause(illiquid.deltaPp));
    }
    if (residual) parts.push(prose(`; ${articleForPercent(residual.sharePct, 1)}`), figure(formatPercentage(residual.sharePct, 1)), prose(' non è attribuito'));
    parts.push(prose('.'));
    return parts;
  }

  const [top, second] = breakdown;
  const topSubject = bandSubject(top.key, top.label);
  const parts: Narrative = [
    prose(`${capitalize(topSubject.subject)} ${topSubject.plural ? 'pesano' : 'pesa'} ${articleForPercent(top.sharePct, 1)}`),
    figure(formatPercentage(top.sharePct, 1)),
    prose(' del patrimonio'),
    ...driftClause(top.deltaPp),
  ];
  if (second) {
    parts.push(prose(` e ${bandSubject(second.key, second.label).subject} ${articleForPercent(second.sharePct, 1)}`), figure(formatPercentage(second.sharePct, 1)));
  }
  const pension = breakdown.find((b) => b.key === 'pension');
  if (pension && pension !== top && pension !== second) {
    parts.push(prose(`; la Previdenza è ${articleForPercent(pension.sharePct, 1)}`), figure(formatPercentage(pension.sharePct, 1)));
  }
  parts.push(prose('.'));
  return parts;
}

// ─── Driver ───────────────────────────────────────────────────────────────────

/**
 * «Nel 2025 il patrimonio è cresciuto di 44.966 € (+18,2%): 23.678 € dal risparmio (53%) e
 * 21.288 € dal mercato (47%).» A running year names its window — «Da gennaio ad agosto 2026»
 * — because its savings are counted on the same months as its growth. A negative half is said
 * in words («mentre il mercato ha tolto», «hai speso … più di quanto hai incassato»), never as
 * a share of a mixed-sign total.
 */
export function describeDrivers(input: { row: DriverYear; isRunning: boolean } | null): Narrative | null {
  if (!input) return null;
  const { row, isRunning } = input;
  const total = row.netWorthGrowth;
  const opening = isRunning ? `${describeRunningWindow(row)} il patrimonio ` : `Nel ${row.year} il patrimonio `;
  const verb = total > 0 ? 'è cresciuto di ' : total < 0 ? 'è sceso di ' : "è rimasto dov'era";
  const pct: Narrative = total !== 0 && typeof row.growthPct === 'number' ? [prose(' ('), signedPercent(row.growthPct, 1), prose(')')] : [];
  const head: Narrative = total === 0 ? [prose(`${opening}${verb}`)] : [prose(`${opening}${verb}`), currencyWithSign(total), ...pct];

  const savingsPositive = row.netSavings >= 0;
  const marketPositive = row.investmentGrowth >= 0;
  const shares = resolveDriverShares(row);
  let tail: Narrative;
  if (savingsPositive && marketPositive) {
    tail = shares
      ? [amount(row.netSavings), prose(' dal risparmio ('), figure(`${shares.savings}%`), prose(') e '), amount(row.investmentGrowth), prose(' dal mercato ('), figure(`${shares.market}%`), prose(')')]
      : [amount(row.netSavings), prose(' dal risparmio e '), amount(row.investmentGrowth), prose(' dal mercato')];
  } else if (savingsPositive) {
    tail = [amount(row.netSavings), prose(' dal risparmio, mentre il mercato ha tolto '), amount(row.investmentGrowth)];
  } else if (marketPositive) {
    tail = [amount(row.investmentGrowth), prose(' dal mercato, ma hai speso '), amount(row.netSavings), prose(' più di quanto hai incassato')];
  } else {
    tail = [prose('il mercato ha tolto '), amount(row.investmentGrowth), prose(' e hai speso '), amount(row.netSavings), prose(' più di quanto hai incassato')];
  }
  return [...head, prose(': '), ...tail, prose('.')];
}

/**
 * «Da gennaio ad agosto 2026» — the running year's window, from the month after its baseline
 * to its last snapshot; «Ad agosto 2026» when the two coincide.
 */
export function describeRunningWindow(row: Pick<DriverYear, 'year' | 'baseline' | 'latest'>): string {
  const since = runningSinceMonth(row);
  const until = row.latest.month;
  if (since === until) return `${capitalize(monthWithPrepositionA(until))} ${row.year}`;
  return `Da ${MONTH_NAMES[since - 1].toLowerCase()} ${monthWithPrepositionA(until)} ${row.year}`;
}

/** «gen–ago» — the running year's window, as the Driver row prints it. */
export function describeRunningWindowShort(row: Pick<DriverYear, 'baseline' | 'latest'>): string {
  const since = runningSinceMonth(row);
  const until = row.latest.month;
  const short = (m: number) => MONTH_NAMES_SHORT[m - 1].toLowerCase();
  return since === until ? short(until) : `${short(since)}–${short(until)}`;
}

// ─── Valore per strumento ─────────────────────────────────────────────────────

/**
 * «A luglio 2026 il portafoglio valeva 248.900 € su 11 strumenti: +4800 € su giugno, di cui
 * +4930 € dai prezzi e −130 € dalle quantità (acquisti, vendite e versamenti).» The quantity
 * effect is a flow — a deposit on a cash account lands there too — so it is neither coloured nor
 * called a trade.
 */
export function describeMonthBreakdown(breakdown: MonthAssetBreakdown | null): Narrative | null {
  if (!breakdown) return null;
  const { month, previous, change } = breakdown;
  const count = breakdown.instrumentCount;
  const head: Narrative = [
    prose(`${capitalize(monthWithPrepositionA(month.month))} ${month.year} il portafoglio valeva `),
    amount(breakdown.total),
    prose(' su '),
    figure(String(count)),
    prose(count === 1 ? ' strumento' : ' strumenti'),
  ];
  if (!previous || !change) return [...head, prose('; è il primo mese con il dettaglio.')];
  const previousLabel = previous.year === month.year ? MONTH_NAMES[previous.month - 1].toLowerCase() : formatPeriodMonth(previous);
  return [
    ...head,
    prose(': '),
    signedCurrency(change.delta),
    prose(` su ${previousLabel}, di cui `),
    signedCurrency(change.priceEffect),
    prose(' dai prezzi e '),
    signedFlow(change.quantityEffect),
    prose(' dalle quantità (acquisti, vendite e versamenti).'),
  ];
}

/** «giu» when the previous month is in the same year as the read one, «dic 2025» otherwise — the Δ column's header. */
export function describePreviousMonthShort(breakdown: MonthAssetBreakdown | null): string | null {
  if (!breakdown?.previous) return null;
  const { previous, month } = breakdown;
  return previous.year === month.year ? MONTH_NAMES_SHORT[previous.month - 1].toLowerCase() : formatPeriodMonthShort(previous);
}

/**
 * The selection panel when instruments are ticked but none of them exists in the month being
 * read (ticked in another month, sold since): the trend line under it still draws them.
 */
export function describeEmptySelection(month: PeriodMonth): Narrative {
  return [prose(`Nessuno degli strumenti selezionati è presente ${atPeriodMonth(month)}; l'andamento qui sotto li segue negli altri mesi.`)];
}

// ─── Dettaglio ────────────────────────────────────────────────────────────────

export interface YearlyVariationRow {
  year: string;
  variation: number;
  variationPercentage: number;
  /** The snapshot the year is measured FROM; absent means «December of the previous year». */
  baseline?: PeriodMonth;
}

/** «Il 2025 è stato l'anno migliore (+29.700 €, +15,0%); il 2026 è a +21.400 € da gennaio.» */
export function describeYearlyVariation(rows: YearlyVariationRow[], currentYear: number): Narrative | null {
  if (rows.length === 0) return null;
  const running = rows.find((r) => Number(r.year) === currentYear) ?? null;
  const closed = rows.filter((r) => Number(r.year) !== currentYear);
  const parts: Narrative[] = [];
  if (closed.length > 0) {
    const best = closed.reduce((a, b) => (b.variation > a.variation ? b : a));
    if (best.variation > 0) {
      parts.push([prose(`Il ${best.year} è stato l'anno migliore (`), signedCurrency(best.variation), prose(', '), signedPercent(best.variationPercentage, 1), prose(')')]);
    } else {
      const worst = closed.reduce((a, b) => (b.variation < a.variation ? b : a));
      parts.push([prose(`Nessun anno chiuso in crescita; il peggiore è stato il ${worst.year} (`), signedCurrency(worst.variation), prose(')')]);
    }
  }
  if (running) {
    const clause: Narrative = [prose(`${parts.length === 0 ? 'Il' : 'il'} ${running.year} è a `), signedCurrency(running.variation), prose(` da ${MONTH_NAMES[runningSinceMonth(running) - 1].toLowerCase()}`)];
    parts.push(clause);
  }
  return [...joinClauses(parts, '; '), prose('.')];
}

export interface MonthlyDriverRow extends PeriodMonth {
  netSavings: number;
  investmentGrowth: number;
}

/** «Il risparmio non è mai mancato (12 mesi su 12); il mercato ha tolto in 4 mesi, al massimo −1400 € a febbraio 2026.» */
export function describeMonthlyDrivers(rows: MonthlyDriverRow[]): Narrative | null {
  if (rows.length === 0) return null;
  const saved = rows.filter((r) => r.netSavings > 0).length;
  const negative = rows.filter((r) => r.investmentGrowth < 0);
  const savings: Narrative =
    saved === rows.length
      ? [prose('Il risparmio non è mai mancato ('), figure(String(saved)), prose(' mesi su '), figure(String(rows.length)), prose(')')]
      : [prose('Hai risparmiato in '), figure(String(saved)), prose(' mesi su '), figure(String(rows.length))];
  if (negative.length === 0) return [...savings, prose('; il mercato non ha mai tolto.')];
  const worst = negative.reduce((a, b) => (b.investmentGrowth < a.investmentGrowth ? b : a));
  return [...savings, prose('; il mercato ha tolto in '), figure(String(negative.length)), prose(negative.length === 1 ? ' mese, ' : ' mesi, al massimo '), signedCurrency(worst.investmentGrowth), prose(` ${atPeriodMonth(worst)}.`)];
}

export type LaborMetricsInput = LaborMetrics;

/**
 * «Da gennaio 2025 a settembre 2026», «Da gennaio a settembre 2026», «A settembre 2026» — the
 * months the recap counts, named so the closing month is said (DESIGN.md → The Same-Basis Rule:
 * the window closes on a snapshot, never on «oggi»).
 */
export function describeLaborWindow(metrics: Pick<LaborMetrics, 'since' | 'until'>): string {
  const { since, until } = metrics;
  const untilText = `${monthWithPrepositionA(until.month)} ${until.year}`;
  if (since.year === until.year && since.month === until.month) return capitalize(untilText);
  const sinceMonth = MONTH_NAMES[since.month - 1].toLowerCase();
  if (since.year === until.year) return `Da ${sinceMonth} ${untilText}`;
  return `Da ${sinceMonth} ${since.year} ${untilText}`;
}

/**
 * «Da gennaio 2025 a settembre 2026 il lavoro ha coperto il 121% delle spese: 90.183 € guadagnati
 * lavorando contro 74.736 € spesi; il mercato ha aggiunto 49.295 €.» The coverage leads because
 * it answers «il lavoro mi mantiene?» without knowing the amounts — above 100% the work alone
 * pays the bills and everything else is accumulation. It needs both sides: without spending or
 * without labor income the sentence says which is missing instead of a ratio. The taxes are a
 * footer, not a clause: an estimate on latent gains is not a fact of the window.
 */
export function describeLabor(metrics: LaborMetricsInput): Narrative {
  const window = describeLaborWindow(metrics);
  const market: Narrative =
    metrics.totalInvestmentGrowthGross < 0
      ? [prose('; il mercato ha tolto '), currencyWithSign(metrics.totalInvestmentGrowthGross), prose('.')]
      : [prose('; il mercato ha aggiunto '), currencyWithSign(metrics.totalInvestmentGrowthGross), prose('.')];
  if (metrics.coverage !== null) {
    return [
      prose(`${window} il lavoro ha coperto il `),
      figure(formatPercentage(metrics.coverage * 100, 0)),
      prose(' delle spese: '),
      amount(metrics.totalLaborIncome),
      prose(' guadagnati lavorando contro '),
      amount(metrics.totalExpensesSum),
      prose(' spesi'),
      ...market,
    ];
  }
  if (metrics.totalLaborIncome > 0) {
    return [prose(`${window} hai guadagnato `), amount(metrics.totalLaborIncome), prose(' lavorando e non risulta nessuna spesa'), ...market];
  }
  const spent: Narrative = metrics.totalExpensesSum < 0 ? [prose(' e hai speso '), amount(metrics.totalExpensesSum)] : [];
  return [prose(`${window} non risulta reddito nelle categorie «reddito da lavoro»`), ...spent, ...market];
}

/**
 * «Rimborsi 3468 € · Assegno Unico 2100 € e altre 2» — the caption under «Altre entrate»,
 * heaviest first, three named; «nessuna entrata fuori dal lavoro» when the window has none.
 */
export function describeOtherIncome(categories: OtherIncomeCategory[], max = 3): string {
  if (categories.length === 0) return 'nessuna entrata fuori dalle categorie «reddito da lavoro»';
  const shown = categories.slice(0, max).map((c) => `${c.name} ${cachedFormatCurrencyEUR(Math.abs(c.amount), true)}`);
  const rest = categories.length - shown.length;
  if (rest === 0) return shown.join(' · ');
  return `${shown.join(' · ')} e ${rest === 1 ? "un'altra" : `altre ${rest}`}`;
}

/**
 * «Al netto di 2300 € di tasse stimate sulle plusvalenze latenti, il mercato vale +11.900 €.» —
 * the Patrimonio's estimate on ALL latent gains, so a positive gross can turn negative net and the
 * minus is in the figure. `null` when nothing is estimated: the sentence must not print a zero.
 */
export function describeLaborTaxes(metrics: Pick<LaborMetrics, 'totalInvestmentGrowthGross' | 'totalInvestmentGrowthNet'>): Narrative | null {
  const taxes = metrics.totalInvestmentGrowthGross - metrics.totalInvestmentGrowthNet;
  if (isPrintedZero(cachedFormatCurrencyEUR(Math.abs(taxes), true)) || taxes <= 0) return null;
  return [prose('Al netto di '), amount(taxes), prose(' di tasse stimate sulle plusvalenze latenti, il mercato vale '), signedCurrency(metrics.totalInvestmentGrowthNet), prose('.')];
}

/** Said only when the settings carry no dividend category: those receipts never become a cashflow row, so they stay inside «Mercato». */
export const DIVIDENDS_OUTSIDE_CASHFLOW = 'Senza una categoria «dividendi» nelle Impostazioni gli incassi non passano dal cashflow e restano dentro «Mercato».';

/** «4 note su 83 rilevazioni; l'ultima a febbraio 2025.» — counted on snapshots, since a gappy history has fewer of them than months. */
export function describeNotes(count: number, snapshotCount: number, last: PeriodMonth | null): Narrative {
  if (count === 0 || !last) return [prose('Nessuna nota: segna qui un evento che spiega un salto del grafico.')];
  if (count === 1) return [prose('Una nota su '), figure(String(snapshotCount)), prose(` rilevazioni, ${atPeriodMonth(last)}.`)];
  return [figure(String(count)), prose(' note su '), figure(String(snapshotCount)), prose(` rilevazioni; l'ultima ${atPeriodMonth(last)}.`)];
}
