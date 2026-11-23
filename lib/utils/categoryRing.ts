/**
 * An income ranking as ring parts («Entrate per categoria» on Tracciamento and on the Panoramica; DESIGN.md → The
 * Ring Rule, 2026-11-12). A module of its own, not a function of tracciamentoSummary.ts, so the Panoramica draws the
 * ring without that module's dates, grouping and savings-rate imports (perf:budget, 2026-11-15).
 */

import type { CategoryRanking } from '@/lib/utils/tracciamentoSummary';
import { RING_CATEGORY_COLORS, RING_REST_COLOR, RING_REST_KEY, isRingWhole, type RingSegment } from '@/lib/utils/ringChart';

/** The ranking as ring parts: the rows by rank, then what the cut left as «Altre categorie»; null unless a whole. */
export function incomeRingSegments(ranking: CategoryRanking): RingSegment[] | null {
  const segments: RingSegment[] = ranking.rows.map((row, index) => ({
    key: row.categoryKey,
    label: row.category,
    value: row.amount,
    color: RING_CATEGORY_COLORS[index % RING_CATEGORY_COLORS.length],
  }));
  // The same euro floor as `CategoryTile`'s residual row: a part the rows cannot show is not drawn.
  const rest = ranking.total - ranking.rows.reduce((sum, row) => sum + row.amount, 0);
  if (rest >= 1) segments.push({ key: RING_REST_KEY, label: 'Altre categorie', value: rest, color: RING_REST_COLOR });
  return isRingWhole(segments) ? segments : null;
}
