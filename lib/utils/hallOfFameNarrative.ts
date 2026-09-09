/**
 * Hall of Fame's words: the verdict that answers «quali sono stati i mesi e gli anni migliori?»
 * before any number, and the reading line under each tile of that page.
 *
 * Same design as the other `*Narrative.ts` modules: every function is pure and returns a
 * `Narrative` (segments flagged `mono`/`sign`) rendered by `NarrativeText`; the phrasings are
 * pinned by tests, and a sentence never claims what the data cannot support — a missing input
 * drops its clause, never a placeholder (DESIGN.md → The Narrative Honesty Rule).
 *
 * Two things this page must never confuse. A record is a POSITION, so the verdict names the
 * best month and the Record tile's footer the worst — the same figure is never printed twice
 * (the rule Storico settled). And a cost is not a loss: an expense record is set in mono
 * without a sign colour, because the sign tokens mean gain and loss and nothing else.
 *
 * Percentages go through chartService's it-IT formatter (comma decimals), currency through
 * `cachedFormatCurrencyEUR` (no-break space before €) — AGENTS.md → Italian Localization.
 */

import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import { formatPercentage } from '@/lib/services/chartService';
import { MONTH_NAMES } from '@/lib/constants/months';
import type { Narrative, NarrativeSegment, PageVerdictModel } from '@/lib/utils/narrative';
import type { HallOfFameStats } from '@/types/hall-of-fame';
import type { NotesSummary, RecordBoard, RecordCategory, RecordEntry, RecordPeriod } from '@/lib/utils/hallOfFameSummary';

// ─── Formatting helpers ───────────────────────────────────────────────────────

const prose = (text: string): NarrativeSegment => ({ text });
const figure = (text: string): NarrativeSegment => ({ text, mono: true });
const MINUS = '−';

/** True when a formatted figure prints as a zero: the sign is decided on the TEXT (The Comma Rule). */
function isPrintedZero(text: string): boolean {
  return !/[1-9]/.test(text);
}

/** «+8240 €», «−8420 €», «0 €» — signed and coloured on the printed amount. */
function signedCurrency(value: number): NarrativeSegment {
  const unsigned = cachedFormatCurrencyEUR(Math.abs(value), true);
  if (isPrintedZero(unsigned) || value === 0) return figure(unsigned);
  const negative = value < 0;
  return { text: `${negative ? MINUS : '+'}${unsigned}`, mono: true, sign: negative ? 'negative' : 'positive' };
}

/** An unsigned amount in the numeric face, with no colour: a cost is neither a gain nor a loss. */
function amount(value: number): NarrativeSegment {
  return figure(cachedFormatCurrencyEUR(Math.abs(value), true));
}

/** «+4,1%», «−3,9%» — signed and coloured on the printed figure. */
function signedPercent(value: number, decimals = 1): NarrativeSegment {
  const unsigned = formatPercentage(Math.abs(value), decimals);
  if (isPrintedZero(unsigned) || value === 0) return figure(unsigned);
  const negative = value < 0;
  return { text: `${negative ? MINUS : '+'}${unsigned}`, mono: true, sign: negative ? 'negative' : 'positive' };
}

/** «60,0%» — a share is a proportion, not a gain: mono, never coloured. */
function share(value: number, decimals = 1): NarrativeSegment {
  return figure(formatPercentage(Math.abs(value), decimals));
}

/** «3°» */
function ordinal(rank: number): string {
  return `${rank}°`;
}

function plural(count: number, one: string, many: string): string {
  return count === 1 ? one : many;
}

/** «gennaio 2026» → «Gennaio 2026», for a headline that opens on a period. */
function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** The month alone, lowercase: «agosto». */
function monthNameOf(entry: RecordEntry): string {
  return entry.month ? MONTH_NAMES[entry.month - 1].toLowerCase() : `${entry.year}`;
}

// ─── Verdict ──────────────────────────────────────────────────────────────────

export interface HallOfFameVerdictInput {
  /** False when the document holds nothing to rank. */
  hasRecords: boolean;
  bestMonth: RecordEntry | null;
  worstMonth: RecordEntry | null;
  /** The running month's row in the growth ranking, when it has one. */
  currentMonth: RecordEntry | null;
  currentMonthRank: number | null;
  bestYear: RecordEntry | null;
  /** The running year's row in the yearly growth ranking, when it has one. */
  currentYear: RecordEntry | null;
  currentYearRank: number | null;
}

/**
 * «il secondo anno migliore» / «al 4° posto tra gli anni» — a podium place gets its word, a
 * place past it gets its number, because «il settimo anno migliore» reads as praise it is not.
 */
function yearRankPhrase(rank: number): string {
  if (rank === 1) return 'il tuo anno migliore';
  if (rank === 2) return 'il secondo anno migliore';
  if (rank === 3) return 'il terzo anno migliore';
  return `al ${ordinal(rank)} posto tra gli anni`;
}

export function buildHallOfFameVerdict(input: HallOfFameVerdictInput): PageVerdictModel {
  const { hasRecords, bestMonth, worstMonth, currentMonth, currentMonthRank, currentYear, currentYearRank } = input;

  if (!bestMonth) {
    // A history that has only ever fallen still has something true to say — and it is not a record.
    if (hasRecords && worstMonth) {
      return {
        headline: "Non c'è ancora un mese in crescita.",
        tone: 'warning',
        sentence: [
          prose('Il mese peggiore è '),
          prose(worstMonth.longLabel),
          prose(': '),
          signedCurrency(worstMonth.value),
          ...(worstMonth.percentage !== null ? [prose(', il '), signedPercent(worstMonth.percentage)] : []),
          prose('.'),
        ],
      };
    }
    return {
      headline: 'I record cominciano dal secondo snapshot.',
      tone: 'neutral',
      sentence: [
        prose(
          'Ogni mese viene confrontato con quello prima: dal secondo snapshot in poi ogni mese, e ogni anno chiuso, entra in classifica. Crea uno snapshot dalla Panoramica, oppure aggiungi un mese passato dallo Storico.',
        ),
      ],
    };
  }

  // The headline names the record; when the record IS the running month it says so there, and
  // the sentence never repeats the position.
  const headline = bestMonth.isCurrent
    ? `${capitalize(bestMonth.longLabel)} è il tuo mese migliore.`
    : `Il tuo mese migliore è ${bestMonth.longLabel}.`;

  const sentence: Narrative = [prose('In quel mese il patrimonio è salito di '), signedCurrency(bestMonth.value)];
  if (bestMonth.percentage !== null) {
    sentence.push(prose(', il '), signedPercent(bestMonth.percentage), prose(' in un mese'));
  }

  if (currentYear && currentYearRank !== null) {
    sentence.push(
      prose('; il '),
      figure(currentYear.label),
      prose(` è finora ${yearRankPhrase(currentYearRank)}, con `),
      signedCurrency(currentYear.value),
    );
  }

  if (currentMonth && currentMonthRank !== null && !bestMonth.isCurrent) {
    sentence.push(
      prose(`, e ${monthNameOf(currentMonth)} è oggi al `),
      figure(ordinal(currentMonthRank)),
      prose(' posto tra i mesi'),
    );
  }

  sentence.push(prose('.'));

  return { headline, tone: 'positive', sentence };
}

// ─── Tile readings ────────────────────────────────────────────────────────────

/** «Il mese migliore è ottobre 2025: +8240 €, il +4,1% in un mese. I tre migliori valgono insieme +22.630 €.» */
export function describeNetWorthRecords(input: { best: RecordEntry | null; topThreeGrowth: number | null }): Narrative {
  const { best, topThreeGrowth } = input;
  if (!best) return [prose('Nessun mese in crescita, per ora.')];

  const narrative: Narrative = [prose('Il mese migliore è '), prose(best.longLabel), prose(': '), signedCurrency(best.value)];
  if (best.percentage !== null) {
    narrative.push(prose(', il '), signedPercent(best.percentage), prose(' in un mese'));
  }
  narrative.push(prose('.'));

  if (topThreeGrowth !== null) {
    narrative.push(prose(' I tre migliori valgono insieme '), signedCurrency(topThreeGrowth), prose('.'));
  }
  return narrative;
}

/** The Record tile's footer. Null without a decline on record — the footer disappears with it. */
export function describeWorstMonth(worst: RecordEntry | null): Narrative | null {
  if (!worst) return null;
  return [
    prose('Il mese peggiore resta '),
    prose(worst.longLabel),
    prose(': '),
    signedCurrency(worst.value),
    ...(worst.percentage !== null ? [prose(', il '), signedPercent(worst.percentage)] : []),
    prose('.'),
  ];
}

/**
 * «Il mese con più entrate è dicembre 2025: 6940 €, il 62,1% sopra la tua media mensile.»
 *
 * The gap against the average is printed only when an average exists: the document keeps the
 * top slice alone, so without the stored average there is no denominator and the clause goes.
 */
export function describeIncomeRecords(input: { top: RecordEntry | null; averageMonthlyIncome: number | null }): Narrative {
  const { top, averageMonthlyIncome } = input;
  if (!top) return [prose('Nessuna entrata registrata, per ora.')];

  const narrative: Narrative = [prose('Il mese con più entrate è '), prose(top.longLabel), prose(': '), amount(top.value)];

  if (averageMonthlyIncome && averageMonthlyIncome > 0) {
    const gap = (top.value / averageMonthlyIncome - 1) * 100;
    const printed = formatPercentage(Math.abs(gap), 1);
    if (!isPrintedZero(printed)) {
      narrative.push(prose(', il '), share(gap), prose(' sopra la tua media mensile'));
    }
  }

  narrative.push(prose('.'));
  return narrative;
}

/** The Entrate tile's footer: the average, and the months it was measured on. */
export function describeIncomeAverage(stats: HallOfFameStats | null): Narrative | null {
  if (!stats || stats.averageMonthlyIncome <= 0) return null;
  return [
    prose('Media mensile '),
    amount(stats.averageMonthlyIncome),
    prose(` su${stats.monthCount === 1 ? 'l' : 'i'} `),
    figure(`${stats.monthCount}`),
    prose(` ${plural(stats.monthCount, 'mese tracciato', 'mesi tracciati')}.`),
  ];
}

/** «Il mese in cui hai messo da parte di più è marzo 2026: +3180 € su 5300 € di entrate, il 60,0%.» */
export function describeSavingsRecords(top: RecordEntry | null): Narrative {
  if (!top) return [prose('Nessun mese con entrate registrate, per ora.')];

  const narrative: Narrative = [
    prose('Il mese in cui hai messo da parte di più è '),
    prose(top.longLabel),
    prose(': '),
    signedCurrency(top.value),
  ];
  if (top.income !== null) {
    narrative.push(prose(' su '), amount(top.income), prose(' di entrate'));
  }
  if (top.percentage !== null) {
    narrative.push(prose(', il '), share(top.percentage));
  }
  narrative.push(prose('.'));
  return narrative;
}

/** «secondo» / «terzo» / «al 4° posto» — the running year's standing, in the Anni tile. */
function currentYearStanding(rank: number): string {
  if (rank === 2) return 'è secondo';
  if (rank === 3) return 'è terzo';
  return `è al ${ordinal(rank)} posto`;
}

/** «Il tuo anno migliore è il 2024: +48.900 €, il +31,2%. Il 2026 è secondo e non è ancora finito.» */
export function describeYearRecords(input: {
  top: RecordEntry | null;
  current: RecordEntry | null;
  currentRank: number | null;
}): Narrative {
  const { top, current, currentRank } = input;
  if (!top) return [prose('Nessun anno in crescita, per ora.')];

  const narrative: Narrative = [prose('Il tuo anno migliore è il '), prose(top.label), prose(': '), signedCurrency(top.value)];
  if (top.percentage !== null) {
    narrative.push(prose(', il '), signedPercent(top.percentage));
  }

  // The running year leading its own ranking is one fact, not two sentences.
  if (top.isCurrent) {
    narrative.push(prose(', e non è ancora finito.'));
    return narrative;
  }

  narrative.push(prose('.'));
  if (current && currentRank !== null) {
    narrative.push(prose(' Il '), prose(current.label), prose(` ${currentYearStanding(currentRank)} e non è ancora finito.`));
  }
  return narrative;
}

/** The Anni tile's footer. «Nessun anno in perdita.» is a claim the empty decline ranking supports. */
export function describeWorstYear(worst: RecordEntry | null): Narrative {
  if (!worst) return [prose('Nessun anno in perdita.')];
  return [
    prose('Il tuo anno peggiore è il '),
    prose(worst.label),
    prose(': '),
    signedCurrency(worst.value),
    ...(worst.percentage !== null ? [prose(', il '), signedPercent(worst.percentage)] : []),
    prose('.'),
  ];
}

/**
 * «Hai annotato 4 periodi con 6 note; il più recente è gennaio 2026.»
 *
 * "The most recent" is the most recent PERIOD annotated, never the last note written: the
 * stored note timestamps are not normalised anywhere, and the period is what the reader sees.
 */
export function describeNotes(summary: NotesSummary): Narrative {
  if (summary.total === 0) return [prose('Nessuna nota, per ora.')];

  const narrative: Narrative = [
    prose('Hai annotato '),
    figure(`${summary.periodCount}`),
    prose(` ${plural(summary.periodCount, 'periodo', 'periodi')}`),
  ];
  if (summary.total > summary.periodCount) {
    narrative.push(prose(' con '), figure(`${summary.total}`), prose(` ${plural(summary.total, 'nota', 'note')}`));
  }
  if (summary.latest) {
    narrative.push(prose('; il più recente è '), prose(summary.latest.longLabel));
  }
  narrative.push(prose('.'));
  return narrative;
}

/** What each ranking is, in the singular and in the plural. */
const RANKING_SUBJECT: Record<RecordCategory, { monthly: string; annual: string }> = {
  growth: { monthly: 'con la crescita di patrimonio più alta', annual: 'con la crescita di patrimonio più alta' },
  decline: { monthly: 'con il calo di patrimonio più forte', annual: 'con il calo di patrimonio più forte' },
  income: { monthly: 'con le entrate più alte', annual: 'con le entrate più alte' },
  expenses: { monthly: 'con le spese più alte', annual: 'con le spese più alte' },
  savings: { monthly: 'in cui hai messo da parte di più', annual: 'in cui hai messo da parte di più' },
};

function rankingSubject(period: RecordPeriod, category: RecordCategory, total: number): string {
  const tail = RANKING_SUBJECT[category][period];
  if (total === 1) return period === 'monthly' ? `Il mese ${tail}` : `L'anno ${tail}`;
  return period === 'monthly' ? `I ${total} mesi ${tail}` : `Gli ${total} anni ${tail}`;
}

/** The Dettaglio tile's reading: what the table holds, how much of it is annotated, what is still open. */
export function describeFullRanking(input: { board: RecordBoard | null; notedCount: number }): Narrative {
  const { board, notedCount } = input;
  if (!board || board.total === 0) return [prose('Nessun record in questa classifica.')];

  // A ranking of one has no order to name.
  const opening = `${rankingSubject(board.period, board.category, board.total)}${board.total > 1 ? ', dal migliore' : ''}.`;
  const narrative: Narrative = [prose(opening)];

  const clauses: Narrative = [];
  if (notedCount > 0) {
    clauses.push(figure(`${notedCount}`), prose(` ${plural(notedCount, 'ha', 'hanno')} una nota`));
  }
  if (board.current) {
    const running = `${board.current.longLabel} è ancora in corso`;
    clauses.push(prose(clauses.length > 0 ? `, e ${running}` : capitalize(running)));
  }
  if (clauses.length > 0) {
    narrative.push(prose(' '), ...clauses, prose('.'));
  }
  return narrative;
}

// ─── Header ───────────────────────────────────────────────────────────────────

/** «46 mesi e 5 anni a confronto, da novembre 2022» — the compact header's description. */
export function describeHallOfFameHeader(stats: HallOfFameStats | null): string | undefined {
  if (!stats || (stats.monthCount === 0 && stats.yearCount === 0)) return undefined;

  const months = `${stats.monthCount} ${plural(stats.monthCount, 'mese', 'mesi')}`;
  const years = `${stats.yearCount} ${plural(stats.yearCount, 'anno', 'anni')}`;
  const since = stats.firstMonth
    ? `, da ${MONTH_NAMES[stats.firstMonth.month - 1].toLowerCase()} ${stats.firstMonth.year}`
    : '';
  return `${months} e ${years} a confronto${since}`;
}

/** «46 mesi confrontati» — the Record tile's aside. */
export function describeMonthsAside(stats: HallOfFameStats | null): string | undefined {
  if (!stats || stats.monthCount === 0) return undefined;
  return `${stats.monthCount} ${plural(stats.monthCount, 'mese confrontato', 'mesi confrontati')}`;
}
