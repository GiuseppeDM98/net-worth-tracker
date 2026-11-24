/**
 * The SVG path of a sparkline: a cubic through every point that never leaves the band between the two
 * points it joins.
 *
 * A Catmull-Rom spline (what this replaced on 2026-11-23) overshoots where the slope turns sharply: a
 * value that sat flat, jumped and sat flat again drew a curve ABOVE its own maximum, cut by the plot's
 * edge. A monotone cubic takes its tangents from the two neighbouring slopes — zero at a turning point,
 * their harmonic mean elsewhere (Fritsch–Butland) — so every control point stays between its segment's
 * ends, and so does the curve.
 */
export type SparkPoint = [number, number];

export interface SparkSegment {
  c1: SparkPoint;
  c2: SparkPoint;
  to: SparkPoint;
}

function slope(from: SparkPoint, to: SparkPoint): number {
  return (to[1] - from[1]) / (to[0] - from[0]);
}

function monotoneTangents(pts: SparkPoint[]): number[] {
  const last = pts.length - 1;
  const tangents: number[] = [slope(pts[0], pts[1])];
  for (let i = 1; i < last; i++) {
    const before = slope(pts[i - 1], pts[i]);
    const after = slope(pts[i], pts[i + 1]);
    tangents.push(before * after <= 0 ? 0 : (2 * before * after) / (before + after));
  }
  tangents.push(slope(pts[last - 1], pts[last]));
  return tangents;
}

/** The Bézier segments joining `pts` (x strictly increasing). Empty under two points. */
export function monotoneSegments(pts: SparkPoint[]): SparkSegment[] {
  if (pts.length < 2) return [];
  const tangents = monotoneTangents(pts);
  const segments: SparkSegment[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[i + 1];
    const third = (x2 - x1) / 3;
    segments.push({
      c1: [x1 + third, y1 + tangents[i] * third],
      c2: [x2 - third, y2 - tangents[i + 1] * third],
      to: [x2, y2],
    });
  }
  return segments;
}

export function monotonePath(pts: SparkPoint[]): string {
  if (pts.length < 2) return '';
  const parts = [`M ${pts[0][0]},${pts[0][1]}`];
  for (const { c1, c2, to } of monotoneSegments(pts)) {
    parts.push(`C ${c1[0]},${c1[1]} ${c2[0]},${c2[1]} ${to[0]},${to[1]}`);
  }
  return parts.join(' ');
}
