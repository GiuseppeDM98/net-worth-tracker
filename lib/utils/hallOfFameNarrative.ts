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

import { cachedFormatCurrencyEUR, formatDate } from '@/lib/utils/formatters';
import { formatPercentage } from '@/lib/services/chartService';
import { articleForPercent, pluralArticleFor } from '@/lib/utils/patrimonioNarrative';
import { MONTH_NAMES } from '@/lib/constants/months';
import { MONTH_NAMES_SHORT } from '@/lib/utils/period';
import type { Narrative, NarrativeSegment, PageVerdictModel } from '@/lib/utils/narrative';
import type { HallOfFameSectionKey, HallOfFameStats, SinceWorstMonth } from '@/types/hall-of-fame';
import { SECTION_LABELS } from '@/lib/constants/hallOfFame';
import { isPartialYear, type NotesSummary, type RecordBoard, type RecordCategory, type RecordEntry, type RecordPeriod } from '@/lib/utils/hallOfFameSummary';

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

/**
 * «, l'88,5%» / «, il 53,6%» — the article follows the figure AS PRINTED (`articleForPercent`),
 * never a hand-written «il»: «il 88,5%» shipped for a month before the critique of 2026-09-24.
 */
function withArticle(value: number, decimals = 1): Narrative {
  return [prose(`, ${articleForPercent(value, decimals)}`), share(value, decimals)];
}

/** «su 1 mese» / «su 3 mesi» — how much of a partial year the record covers; empty on a whole one. */
function partialYearClause(entry: RecordEntry): Narrative {
  if (!isPartialYear(entry) || entry.monthsCovered === null) return [];
  return [prose(' su '), figure(`${entry.monthsCovered}`), prose(` ${plural(entry.monthsCovered, 'mese', 'mesi')}`)];
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

/**
 * «I tre mesi migliori valgono insieme +22.630 €; l'ultimo in tessera, marzo 2024, è a +2195 €.»
 *
 * The verdict has already named the record month and its two figures, 200px above: the tile
 * says what the verdict does not — what the podium is worth and where the board ends — so the
 * same figure is never printed twice on one screen (the rule Storico settled). Below three
 * records there is no podium to sum, and the reading names the best month instead.
 */
export function describeNetWorthRecords(input: {
  best: RecordEntry | null;
  topThreeGrowth: number | null;
  /** The last row the tile shows; null when the board is shorter than the tile. */
  last: RecordEntry | null;
}): Narrative {
  const { best, topThreeGrowth, last } = input;
  if (!best) return [prose('Nessun mese in crescita, per ora.')];

  if (topThreeGrowth === null) {
    const narrative: Narrative = [prose('Il mese migliore è '), prose(best.longLabel), prose(': '), signedCurrency(best.value)];
    if (best.percentage !== null) {
      narrative.push(prose(', il '), signedPercent(best.percentage), prose(' in un mese'));
    }
    narrative.push(prose('.'));
    return narrative;
  }

  const narrative: Narrative = [prose('I tre mesi migliori valgono insieme '), signedCurrency(topThreeGrowth)];
  if (last && last.key !== best.key) {
    narrative.push(prose(`; l'ultimo in tessera, ${last.longLabel}, è a `), signedCurrency(last.value));
  }
  narrative.push(prose('.'));
  return narrative;
}

/**
 * The Record tile's footer: the worst month, and the recovery since.
 *
 * «Il mese peggiore resta ottobre 2023: −9800 €, il −7,5%; da allora 27 mesi su 35 in crescita.»
 * The page celebrates, and its dominant tile used to END on the one red figure it prints. The
 * recovery is the same truth with the right ending — and it is a stored figure (`stats.
 * sinceWorstMonth`), never derived from the top slices: without it the clause drops. Null
 * without a decline on record — the footer disappears with it.
 */
export function describeWorstMonth(worst: RecordEntry | null, since: SinceWorstMonth | null = null): Narrative | null {
  if (!worst) return null;
  const narrative: Narrative = [
    prose('Il mese peggiore resta '),
    prose(worst.longLabel),
    prose(': '),
    signedCurrency(worst.value),
    ...(worst.percentage !== null ? [prose(', il '), signedPercent(worst.percentage)] : []),
  ];
  if (since && since.months > 0) {
    narrative.push(
      prose('; da allora '),
      figure(`${since.growing}`),
      prose(` ${plural(since.growing, 'mese', 'mesi')} su `),
      figure(`${since.months}`),
      prose(' in crescita'),
    );
  }
  narrative.push(prose('.'));
  return narrative;
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
      narrative.push(...withArticle(gap), prose(' sopra la tua media mensile'));
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
    narrative.push(...withArticle(top.percentage));
  }
  narrative.push(prose('.'));
  return narrative;
}

/** «dal primo posto» / «dal secondo posto» / «dal 4° posto» — the place just above the running year. */
function placeAbovePhrase(rank: number): string {
  if (rank === 1) return 'dal primo posto';
  if (rank === 2) return 'dal secondo posto';
  if (rank === 3) return 'dal terzo posto';
  return `dal ${ordinal(rank)} posto`;
}

/**
 * «Il tuo anno migliore è il 2024: +48.900 €, il +31,2%. Il 2026 è a 8510 € dal secondo posto e
 * non è ancora finito.»
 *
 * The verdict already says WHERE the running year stands («il terzo anno migliore»); the tile
 * says how far it is from the place above — a figure the verdict does not print. A partial first
 * year says on how many months it was measured (`partialYearClause`).
 */
export function describeYearRecords(input: {
  top: RecordEntry | null;
  current: RecordEntry | null;
  currentRank: number | null;
  /** The row one place above the running year; null when it leads or is unranked. */
  above: RecordEntry | null;
}): Narrative {
  const { top, current, currentRank, above } = input;
  if (!top) return [prose('Nessun anno in crescita, per ora.')];

  const narrative: Narrative = [prose('Il tuo anno migliore è il '), prose(top.label), prose(': '), signedCurrency(top.value)];
  if (top.percentage !== null) {
    narrative.push(prose(', il '), signedPercent(top.percentage));
  }
  narrative.push(...partialYearClause(top));

  // The running year leading its own ranking is one fact, not two sentences.
  if (top.isCurrent) {
    narrative.push(prose(', e non è ancora finito.'));
    return narrative;
  }

  narrative.push(prose('.'));
  if (current && currentRank !== null && above) {
    // A distance to the place above is neither a gain nor a loss: unsigned, uncoloured
    // (DESIGN.md → «don't colour a drift, a gap to target … with the sign tokens»).
    narrative.push(
      prose(' Il '),
      prose(current.label),
      prose(' è a '),
      amount(above.value - current.value),
      prose(` ${placeAbovePhrase(currentRank - 1)} e non è ancora finito.`),
    );
  } else if (current && currentRank !== null) {
    narrative.push(prose(' Il '), prose(current.label), prose(` è al ${ordinal(currentRank)} posto e non è ancora finito.`));
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
    ...partialYearClause(worst),
    prose('.'),
  ];
}

/** «1 mese» / «3 mesi» — the chip beside a partial year's label; null on a whole year or a month. */
export function describePartialYearChip(entry: RecordEntry): string | null {
  if (!isPartialYear(entry) || entry.monthsCovered === null) return null;
  return `${entry.monthsCovered} ${plural(entry.monthsCovered, 'mese', 'mesi')}`;
}

/** «I 12 record più grandi» when the chart drops some, «I 5 record» when it shows them all. */
export function describeTimelineCaption(shown: number, total: number): string {
  const article = capitalize(pluralArticleFor(shown));
  return shown < total ? `${article} ${shown} record più grandi` : `${article} ${shown} record`;
}

/** «marzo 2024» / «2024» — a period as a sentence names it, for a control's accessible name. */
export function describeNotePeriod(year: number, month?: number): string {
  return month ? `${MONTH_NAMES[month - 1].toLowerCase()} ${year}` : `${year}`;
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
  // «i 10 anni», «gli 8 anni»: the article follows the number, not the noun.
  const article = pluralArticleFor(total);
  return period === 'monthly' ? `${capitalize(article)} ${total} mesi ${tail}` : `${capitalize(article)} ${total} anni ${tail}`;
}

/** How a ranking is ordered, in its own terms: a cost is not «il migliore». */
const RANKING_ORDER: Record<RecordCategory, string> = {
  growth: 'dal migliore',
  decline: 'dal più forte',
  income: 'dal più alto',
  expenses: 'dal più alto',
  savings: 'dal migliore',
};

/**
 * The Dettaglio tile's reading: what the table holds, how much of it is annotated, what is
 * still open. An absence is ONE sentence — the ranking the document does not carry and the
 * ranking nothing ever entered are two different facts, said once each.
 */
export function describeFullRanking(input: { board: RecordBoard | null; notedCount: number }): Narrative {
  const { board, notedCount } = input;
  if (!board) return [prose('Questa classifica arriva con il prossimo aggiornamento dei record.')];
  if (board.total === 0) return [prose('Nessun periodo è entrato in questa classifica.')];

  // A ranking of one has no order to name.
  const opening = `${rankingSubject(board.period, board.category, board.total)}${board.total > 1 ? `, ${RANKING_ORDER[board.category]}` : ''}.`;
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

/**
 * «46 mesi e 5 anni a confronto, da novembre 2022 · record aggiornati il 24/09/2026» — the
 * compact header's description. The date is the rankings' own stamp, so a reader can tell a
 * document the cron has stopped refreshing (an account without assets) from a fresh one; a
 * document written before the stamp existed drops the clause.
 */
export function describeHallOfFameHeader(stats: HallOfFameStats | null, rankingsUpdatedAt: Date | null = null): string | undefined {
  if (!stats || (stats.monthCount === 0 && stats.yearCount === 0)) return undefined;

  const months = `${stats.monthCount} ${plural(stats.monthCount, 'mese', 'mesi')}`;
  const years = `${stats.yearCount} ${plural(stats.yearCount, 'anno', 'anni')}`;
  const since = stats.firstMonth
    ? `, da ${MONTH_NAMES[stats.firstMonth.month - 1].toLowerCase()} ${stats.firstMonth.year}`
    : '';
  const updated = rankingsUpdatedAt ? ` · record aggiornati il ${formatDate(rankingsUpdatedAt)}` : '';
  return `${months} e ${years} a confronto${since}${updated}`;
}

/**
 * «da dic 2022 a set 2026» — the Record tile's aside: its scope is the window the records were
 * drawn from. The month COUNT is the header's (and the Entrate footer's denominator); printing
 * it here too made «46» the most repeated figure on the page.
 */
export function describeRecordWindow(stats: HallOfFameStats | null): string | undefined {
  if (!stats?.firstMonth || !stats.lastMonth) return undefined;
  const short = (m: { year: number; month: number }) => `${MONTH_NAMES_SHORT[m.month - 1].toLowerCase()} ${m.year}`;
  return `da ${short(stats.firstMonth)} a ${short(stats.lastMonth)}`;
}

// ─── The note windows ─────────────────────────────────────────────────────────

/**
 * The note form's reading — its status line. Three states: nothing chosen yet, a period the
 * chosen rankings hold, and a period NONE of them holds (the note is kept, in the Note tile,
 * but no row will ever show its marker: said, never silently accepted).
 */
export function describeNoteFormReading(input: {
  sectionCount: number;
  /** Whether at least one chosen ranking holds the period; null while the period is incomplete. */
  isRanked: boolean | null;
}): string {
  const { sectionCount, isRanked } = input;
  if (sectionCount === 0) return 'Scegli il periodo e almeno una classifica: la nota compare accanto ai record che scegli.';
  if (isRanked === false) return 'Questo periodo non è in nessuna delle classifiche scelte: la nota resta nella tessera Note.';
  return `La nota comparirà su ${sectionCount === 1 ? 'una classifica' : `${sectionCount} classifiche`} di questo periodo.`;
}

/** The note view's reading: which rankings the note hangs on, named when there is one. */
export function describeNoteViewReading(sections: HallOfFameSectionKey[]): string {
  if (sections.length === 1) return `Appesa a una classifica: ${SECTION_LABELS[sections[0]]}.`;
  return `Appesa a ${sections.length} classifiche di questo periodo.`;
}
