/**
 * The strip under a phone's verdict: at most four figures, each READ from a tile's `*Summary`
 * (never recomputed), each opening the row that explains it (The First-Screen Rule, proposed in
 * doc/mobile/MOB-09; the contract is this module's exports since 2026-10-10, under decisions 15,
 * 17, 20, 28 of doc/mobile/README.md § 9).
 *
 * A page's `select<Page>Strip(summary)` builds the figures; `VerdictStrip` renders them;
 * `formatStripFigure` is the ONE formatter, so a cell prints exactly what the tile's reading
 * prints (`__tests__/hallOfFameSummary.test.ts` holds the identity). Pure and SDK-free: it
 * imports from `formatters`, never from `chartService`.
 */

import { cachedFormatCurrencyEUR, formatCurrency, formatNumberIt, formatPercentageIt } from '@/lib/utils/formatters';
import type { NarrativeSegment } from '@/lib/utils/narrative';

export type StripFormat =
  | 'signed-currency'
  | 'currency'
  | 'approx-currency'
  | 'signed-percent'
  | 'percent'
  | 'points'
  | 'pp'
  | 'ratio'
  | 'rank';

export interface StripFigure {
  /** The cell's label, in the sub-eyebrow («Quest'anno», «Entrate record»). */
  label: string;
  /** `null` when the figure cannot be measured: the cell prints `reason`, never a zero. */
  value: number | null;
  format: StripFormat;
  /**
   * The sign colour. Absent, a `signed-*` format follows the value's sign and the others stay
   * uncoloured; `neutral` silences the colour on a signed format (a gap to a target).
   */
  tone?: 'positive' | 'negative' | 'neutral';
  /** The section the cell opens: a row id, `VERDICT_REST_SECTION`, or THE tile's id. */
  opens: string;
  /** What the cell says instead of a figure when `value` is `null`. Required then. */
  reason?: string;
  /** The block of a tile this figure repeats — hidden there on a phone (The Lifted-Figure Rule). */
  lifts?: { section: string; block: string };
  /** The decimals the tile prints with; absent = the format's default. */
  decimals?: number;
}

export const MAX_STRIP_FIGURES = 4;

const MINUS = '−';

/** True when a formatted figure prints as a zero: the sign is decided on the TEXT (The Comma Rule). */
function isPrintedZero(text: string): boolean {
  return !/[1-9]/.test(text);
}

/**
 * «+1,2 pt» — points of difference against a benchmark (`RendimentoTile`'s `formatPoints`): a
 * whole number bare, otherwise one decimal. With the tile's own `decimals` the raw value is
 * formatted directly — rounding to one decimal first printed «+1,20 pt» for 1,234 (2026-10-10).
 */
function formatPoints(value: number, decimals?: number): string {
  const magnitude = Math.abs(value);
  if (decimals !== undefined) return `${formatNumberIt(magnitude, decimals)} pt`;
  const points = Math.round(magnitude * 10) / 10;
  return `${formatNumberIt(points, points === Math.round(points) ? 0 : 1)} pt`;
}

/** The unsigned text of a figure, in the format's own face. */
function unsignedText(value: number, format: StripFormat, decimals?: number): string {
  const magnitude = Math.abs(value);
  switch (format) {
    case 'signed-currency':
    case 'currency':
      return decimals === undefined ? cachedFormatCurrencyEUR(magnitude, true) : formatCurrency(magnitude, 'EUR', decimals);
    case 'approx-currency':
      return `~${decimals === undefined ? cachedFormatCurrencyEUR(magnitude, true) : formatCurrency(magnitude, 'EUR', decimals)}`;
    case 'signed-percent':
    case 'percent':
      return formatPercentageIt(magnitude, decimals ?? 1);
    case 'points':
      return formatPoints(magnitude, decimals);
    case 'pp':
      return `${formatPercentageIt(magnitude, decimals ?? 1).replace('%', '')} pp`;
    case 'ratio':
      return formatNumberIt(magnitude, decimals ?? 2);
    case 'rank':
      return `${Math.round(magnitude)}°`;
  }
}

function isSignedFormat(format: StripFormat): boolean {
  return format === 'signed-currency' || format === 'signed-percent' || format === 'points';
}

/**
 * The cell's figure as ONE narrative segment, or `null` when there is no figure.
 *
 * Signs follow The Comma Rule: a negative amount takes the typographic «−» (U+2212) in front of
 * the absolute figure — `Intl` would print the hyphen-minus — and a `signed-*` format adds «+».
 * A printed zero is unsigned and uncoloured whatever its sign («0 €», «0,0%»: decision 20);
 * «~» stays in front of the sign on an approximation.
 */
export function formatStripFigure(figure: StripFigure): NarrativeSegment | null {
  if (figure.value === null) return null;

  const { value, format, decimals } = figure;
  const unsigned = unsignedText(value, format, decimals);
  if (isPrintedZero(unsigned) || value === 0) return { text: unsigned, mono: true };

  const negative = value < 0;
  const sign = negative ? MINUS : isSignedFormat(format) ? '+' : '';
  // «~» precedes the sign: the approximation is of the signed figure, not of its magnitude.
  const text = format === 'approx-currency' ? `~${sign}${unsigned.slice(1)}` : `${sign}${unsigned}`;

  const toneSign =
    figure.tone === 'neutral'
      ? undefined
      : (figure.tone ?? (isSignedFormat(format) ? (negative ? 'negative' : 'positive') : undefined));

  return toneSign ? { text, mono: true, sign: toneSign } : { text, mono: true };
}

/**
 * What a page's strip must respect, as a list of errors (empty = valid): at most four cells, each
 * opening a known section, no two opening the same one, and a `null` value always with its
 * `reason`. `sections` is the ids the page can open — its rows, `VERDICT_REST_SECTION`, and THE
 * tile's id when a cell targets it (the page handles that one in its own `onOpen`).
 */
export function validateStrip(figures: readonly StripFigure[], sections: readonly string[]): string[] {
  const errors: string[] = [];
  if (figures.length > MAX_STRIP_FIGURES) {
    errors.push(`${figures.length} cells: at most ${MAX_STRIP_FIGURES}`);
  }
  const seen = new Set<string>();
  for (const figure of figures) {
    if (!sections.includes(figure.opens)) errors.push(`«${figure.label}» opens an unknown section «${figure.opens}»`);
    if (seen.has(figure.opens)) errors.push(`two cells open «${figure.opens}»`);
    seen.add(figure.opens);
    if (figure.value === null && !figure.reason) errors.push(`«${figure.label}» has no value and no reason`);
  }
  return errors;
}

/**
 * The blocks of `section` that the strip repeats, to hide on a phone (`LIFTED_FIGURE_CLASS`).
 * A cell without a figure lifts nothing: a tile keeps a block the strip could not print.
 */
export function liftedBlocks(figures: readonly StripFigure[], section: string): string[] {
  return figures
    .filter((figure) => figure.value !== null && figure.lifts?.section === section)
    .map((figure) => figure.lifts!.block);
}
