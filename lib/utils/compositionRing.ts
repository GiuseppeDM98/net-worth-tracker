/**
 * The classes' ring (Composizione on the Panoramica and the landing, Classi on Patrimonio; DESIGN.md →
 * The Ring Rule, 2026-11-12). A module of its own, not a function of overviewSummary.ts: the landing
 * and the Panoramica import it for `ComposizioneTile`, and overviewSummary.ts would bring its
 * narrative and savings-rate imports into both bundles (perf:budget, 2026-11-15).
 */

import type { PieChartData } from '@/types/assets';
import { RING_MAX_PARTS, foldRingSegments, isRingWhole, type RingSegment } from '@/lib/utils/ringChart';

export interface CompositionRing {
  segments: RingSegment[];
  /** The sum of the positive classes — the net total, since none is below zero. */
  total: number;
  /** The classes folded into «Altre N classi», in order; empty when none. */
  folded: PieChartData[];
}

/**
 * The classes as ring parts, in the colours the page already remapped (server-cached colours are
 * remapped at render time); null when one is below zero (a signed whole, which a ring never
 * draws) or fewer than two are positive — then the tile keeps its stacked bar.
 */
export function compositionRing(data: readonly PieChartData[]): CompositionRing | null {
  const segments = data.map((d) => ({ key: d.assetClass ?? d.name, label: d.name, value: d.value, color: d.color }));
  if (!isRingWhole(segments)) return null;
  const positive = data.filter((d) => d.value > 0);
  return {
    segments: foldRingSegments(segments, (count) => `Altre ${count} classi`),
    total: positive.reduce((sum, d) => sum + d.value, 0),
    folded: positive.length > RING_MAX_PARTS ? positive.slice(RING_MAX_PARTS - 1) : [],
  };
}
