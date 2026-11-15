/**
 * The «Intestatari» tile's ring on «Valore» and «Carico» (The Ring Rule, 2026-11-12). A module of its
 * own, imported only by `IntestatariTile`: `ownershipBasis.ts` is value-imported by
 * `patrimonioNarrative`, which every page's narrative imports, and a value import of `ringChart.ts`
 * there would ride into every route's first load (doc/guide/velocita.md § Registro dei tetti alzati).
 */
import type { OwnershipBasis, OwnershipSummary } from '@/lib/utils/assetOwnership';
import { ownershipRowOn } from '@/lib/utils/ownershipBasis';
import { RING_CATEGORY_COLORS, RING_REST_COLOR, isRingWhole, type RingSegment } from '@/lib/utils/ringChart';

/**
 * The owners on the tile's basis as ring parts — their value, or their carry on «Carico» (the owner on the
 * mirror tour, 2026-11-15) — rows in order, by rank, the orphaned group in the neutral ink.
 */
export function ownershipRingSegments(summary: OwnershipSummary, basis: OwnershipBasis = 'value'): RingSegment[] | null {
  let rank = 0;
  const segments = summary.rows.map((row) => ({
    key: row.key,
    label: row.label,
    value: ownershipRowOn(row, basis).value,
    color: row.kind === 'unassigned' ? RING_REST_COLOR : RING_CATEGORY_COLORS[rank++ % RING_CATEGORY_COLORS.length],
  }));
  // A group that is a net debt is a signed part: the tile keeps its bars.
  return isRingWhole(segments) ? segments : null;
}
