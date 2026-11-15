/**
 * The ring: the parts of ONE positive whole as arcs of a thin circle (DESIGN.md → The Ring Rule,
 * 2026-11-12). Pure — the geometry, the fold past six parts, the text alternative and the figure the
 * hole can hold; `components/ui/ring-chart.tsx` draws it.
 */
import { cachedFormatCurrencyEUR, formatNumberIt } from '@/lib/utils/formatters';

export interface RingSegment {
  key: string;
  label: string;
  /** A magnitude in euros; a part below zero makes the whole no ring (`isRingWhole`). */
  value: number;
  /** A theme chart slot (`var(--chart-N)`) or the colour the page already resolved for its rows. */
  color: string;
}

/** One arc in units of `pathLength = 100`: dash `length`, starting `offset` units clockwise from 12 o'clock. */
export interface RingArc {
  key: string;
  color: string;
  length: number;
  offset: number;
}

/** A 100 viewBox, the arc's centre line on r 43, 9 units thick: the hole's radius is 38,5. */
export const RING_VIEWBOX = 100;
export const RING_RADIUS = 43;
export const RING_STROKE = 9;
export const RING_DEFAULT_SIZE = 120;
/** Two to six parts: one part is a sentence, a seventh is folded. */
export const RING_MIN_PARTS = 2;
export const RING_MAX_PARTS = 6;
/** The folded tail and a host's residual («Altre categorie»): the neutral ink, ≥ 3:1 on the card. */
export const RING_REST_KEY = 'ring-rest';
export const RING_REST_COLOR = 'var(--muted-foreground)';
/**
 * A host without colours of its own, by rank: income's slot first, never spending's (`--chart-1` on
 * Cashflow) nor the coral beside the loss token (`--chart-5`). Six slots, one per part of a full
 * ring: with five, the sixth part would repeat the first's colour beside it at 12 o'clock.
 */
export const RING_CATEGORY_COLORS = [
  'var(--chart-2)',
  'var(--chart-7)',
  'var(--chart-6)',
  'var(--chart-3)',
  'var(--chart-8)',
  'var(--chart-4)',
] as const;

const RING_GAP = 1; // the gap after each arc, where the card shows through (pathLength units)
const NBSP = ' '; // before «€» and «Mln», as `Intl` writes it
const round3 = (value: number) => Math.round(value * 1000) / 1000;

/** Parts of one positive whole: none prints below zero, at least two are above it. */
export function isRingWhole(segments: readonly RingSegment[]): boolean {
  let parts = 0;
  for (const segment of segments) {
    if (!Number.isFinite(segment.value) || segment.value <= -0.5) return false; // −0,50 € prints «−1 €»
    if (segment.value > 0) parts += 1;
  }
  return parts >= RING_MIN_PARTS;
}

/** The positive parts in the host's order (largest first); past six, the tail is one part. */
export function foldRingSegments(
  segments: readonly RingSegment[],
  restLabel: (count: number) => string,
): RingSegment[] {
  const positive = segments.filter((segment) => segment.value > 0);
  if (positive.length <= RING_MAX_PARTS) return positive;
  const tail = positive.slice(RING_MAX_PARTS - 1);
  const value = tail.reduce((sum, segment) => sum + segment.value, 0);
  return [
    ...positive.slice(0, RING_MAX_PARTS - 1),
    { key: RING_REST_KEY, label: restLabel(tail.length), value, color: RING_REST_COLOR },
  ];
}

/** The swatch of the host's row `index` beside the ring: its part's colour, the fold's from the sixth on past six. */
export function ringSwatchAt(segments: readonly RingSegment[], index: number): string {
  return segments.length > RING_MAX_PARTS && index >= RING_MAX_PARTS - 1 ? RING_REST_COLOR : segments[index].color;
}

/** The arcs clockwise from 12 o'clock; [] when nothing is positive, one closed arc for a single part. */
export function buildRingArcs(segments: readonly RingSegment[]): RingArc[] {
  const parts = foldRingSegments(segments, (count) => `Altre ${count}`);
  const total = parts.reduce((sum, segment) => sum + segment.value, 0);
  if (total <= 0) return [];
  if (parts.length === 1) return [{ key: parts[0].key, color: parts[0].color, length: 100, offset: 0 }];
  let start = 0;
  return parts.map((segment) => {
    const share = (segment.value / total) * 100;
    // The gap comes off the arc's own end, never more than half of it: a 0,4% part stays visible.
    const length = round3(share - Math.min(RING_GAP, share / 2));
    const arc = { key: segment.key, color: segment.color, length, offset: round3(start) };
    start += share;
    return arc;
  });
}

/** «Stipendio 72%, Dividendi 14%, Altre categorie 5%» — the parts as drawn, for the text alternative. */
export function describeRingSegments(segments: readonly RingSegment[]): string {
  const parts = foldRingSegments(segments, (count) => `Altre ${count}`);
  const total = parts.reduce((sum, segment) => sum + segment.value, 0);
  if (total <= 0) return '';
  return parts.map((segment) => `${segment.label} ${Math.round((segment.value / total) * 100)}%`).join(', ');
}

/** The centre figure's size: 15% of the ring, between 14 and 22px. */
export function ringCenterFontPx(size: number): number {
  return Math.min(22, Math.max(14, Math.round(size * 0.15)));
}

const MONO_ADVANCE_EM = 0.6; // Geist Mono advances every glyph 600/1000 em
const LABEL_BLOCK_PX = 17; // the 4px gap and the 13px line of the 11px label under the figure
const AIR_PX = 8; // 4px between the figure and the arc on each side

/**
 * The characters the hole holds: its chord at the figure's far edge (figure + label centred), less
 * the air. A monospace figure is as wide as its character count, so a count is the whole measure.
 */
export function ringCenterMaxChars(size: number): number {
  const font = ringCenterFontPx(size);
  const hole = (size / RING_VIEWBOX) * (RING_RADIUS - RING_STROKE / 2);
  const reach = (font + LABEL_BLOCK_PX) / 2;
  if (reach >= hole) return 0;
  const chord = 2 * Math.sqrt(hole ** 2 - reach ** 2);
  return Math.max(0, Math.floor((chord - AIR_PX) / (font * MONO_ADVANCE_EM)));
}

/**
 * The total in the hole, in the first form of at most `maxChars` characters: «31.900 €», «31,9k €»,
 * «32k €»; from a million «1,2 Mln €», «1 Mln €» (the words of the axes' `formatCurrencyCompact`,
 * without its forced decimal; U+00A0 before «€» and «Mln»). '' when none fits: the ring prints the
 * full figure above itself. A ring never draws a signed quantity, so the magnitude is printed.
 */
export function formatRingCenter(amount: number, maxChars: number): string {
  const magnitude = Math.abs(amount);
  const forms = [cachedFormatCurrencyEUR(magnitude, true)];
  const thousands = Math.round(magnitude / 100) / 10;
  // 999.960 € rounds to «1000k»: from there the thousands are a million.
  if (magnitude >= 1_000 && Math.round(magnitude / 1_000) < 1_000) {
    forms.push(
      `${formatNumberIt(thousands, Number.isInteger(thousands) ? 0 : 1)}k${NBSP}€`,
      `${Math.round(magnitude / 1_000)}k${NBSP}€`,
    );
  } else if (magnitude >= 1_000) {
    const millions = Math.round(magnitude / 100_000) / 10;
    forms.push(
      `${formatNumberIt(millions, Number.isInteger(millions) ? 0 : 1)}${NBSP}Mln${NBSP}€`,
      `${Math.round(magnitude / 1_000_000)}${NBSP}Mln${NBSP}€`,
    );
  }
  return forms.find((form) => form.length <= maxChars) ?? '';
}
