/**
 * The arithmetic under a chart that TRANSFORMS into its next window instead of being redrawn.
 *
 * Two series measured on different windows rarely share a length (YTD has nine points, «1 anno»
 * twelve), and a tween is only defined index by index. So the series on screen is first
 * RESAMPLED onto the length of the incoming one — linear interpolation over the normalised
 * x-axis, the shape kept, the point count changed — and then every index glides to its target.
 * At the end of the glide the chart shows exactly the incoming points: the resampling only ever
 * describes where the glide STARTS, never what is measured.
 *
 * A `null` is a gap (a benchmark month not yet published) and is never interpolated across: a
 * target gap is a gap from the first frame, and a source gap borrows its nearest neighbour so
 * the glide has somewhere to start from.
 */

export type SeriesValue = number | null;

/** ease-out-quart, the app's single easing (`lib/utils/motionVariants.ts`). */
export function easeOutQuart(t: number): number {
  const clamped = Math.min(Math.max(t, 0), 1);
  return 1 - Math.pow(1 - clamped, 4);
}

/** The nearest non-null value to `index`, or null when the series has none. */
function nearestKnown(values: SeriesValue[], index: number): number | null {
  if (values[index] !== null && values[index] !== undefined) return values[index];
  for (let distance = 1; distance < values.length; distance += 1) {
    const before = values[index - distance];
    if (before !== null && before !== undefined) return before;
    const after = values[index + distance];
    if (after !== null && after !== undefined) return after;
  }
  return null;
}

/**
 * `values` stretched or squeezed onto `length` points by linear interpolation over the normalised
 * x-axis. Gaps are filled from their nearest neighbour first, because a start position cannot be
 * "nowhere". An empty source gives an all-null result: nothing to start from.
 */
export function resampleSeries(values: SeriesValue[], length: number): SeriesValue[] {
  if (length <= 0) return [];
  if (values.length === 0) return Array.from({ length }, () => null);
  const filled = values.map((_, i) => nearestKnown(values, i));
  if (filled.length === 1 || length === 1) return Array.from({ length }, () => filled[0]);

  return Array.from({ length }, (_, i) => {
    const x = (i / (length - 1)) * (filled.length - 1);
    const lower = Math.floor(x);
    const upper = Math.min(lower + 1, filled.length - 1);
    const a = filled[lower];
    const b = filled[upper];
    if (a === null || b === null) return a ?? b;
    return a + (b - a) * (x - lower);
  });
}

/**
 * One frame of the glide: `from` (already resampled onto `to`'s length) moved towards `to` by the
 * eased progress `t` in [0, 1]. A target gap stays a gap; a missing start jumps to the target.
 */
export function blendSeries(from: SeriesValue[], to: SeriesValue[], t: number): SeriesValue[] {
  const eased = easeOutQuart(t);
  return to.map((target, i) => {
    if (target === null) return null;
    const start = from[i];
    if (start === null || start === undefined) return target;
    return start + (target - start) * eased;
  });
}

/** True when the two series would draw the same picture — nothing to glide between. */
export function sameSeries(a: SeriesValue[], b: SeriesValue[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((value, i) => value === b[i]);
}
