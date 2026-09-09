/**
 * TargetTick — the 3px current-vs-target track under one allocation row.
 *
 * This is the one visual the Per classe tile legitimately needs: the gap between where a
 * sleeve IS and where it SHOULD be is spatial, and a number alone hides it. The fill is the
 * current weight; the hairline marker is the target. Over- vs under-allocation reads from
 * POSITION (fill past the marker = over), so the fill never carries the action — the chip and
 * the signed gap already do — and it keeps the theme's primary data hue (`--chart-1`), which
 * lets the page follow the chosen theme (the semantic tokens look identical everywhere).
 *
 * The track is 3px, the tile's bar height, so a row stays ONE line plus a hairline instead of a
 * block of its own; the marker sticks 3px out on both sides because a 1px tick that stops at
 * the track's edges disappears into it. The root is 9px tall and holds both, so the row never
 * needs negative margins to make room for the marker.
 *
 * Not a decorative progress bar (DESIGN.md forbids those): it carries information the number
 * cannot surface at a glance, is theme-aware and exposes a `progressbar` role. The scale is
 * per row — max(current, target) × 1.12 — so the fill and the marker stay legible for a tiny
 * sleeve, with the headroom keeping the marker off the right edge.
 */
'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { formatPercentage } from '@/lib/services/chartService';

interface TargetTickProps {
  currentPercentage: number;
  targetPercentage: number;
  className?: string;
}

export function TargetTick({ currentPercentage, targetPercentage, className }: TargetTickProps) {
  const reducedMotion = useReducedMotion();

  const scaleMax = Math.max(currentPercentage, targetPercentage, 1) * 1.12;
  const fillWidth = Math.min((currentPercentage / scaleMax) * 100, 100);
  const targetPosition = Math.min((targetPercentage / scaleMax) * 100, 100);

  return (
    <div
      className={cn('relative h-[9px] w-full', className)}
      role="progressbar"
      aria-valuenow={Math.round(currentPercentage)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={`Allocazione corrente ${formatPercentage(currentPercentage, 1)}, target ${formatPercentage(targetPercentage, 0)}`}
    >
      {/* The 3px track, centred in the 9px root so the marker has 3px on each side. */}
      <div className="absolute inset-x-0 top-[3px] h-[3px] overflow-hidden rounded-full bg-muted">
        <motion.div
          className="absolute inset-y-0 left-0 rounded-full"
          style={{
            backgroundColor: 'var(--chart-1)',
            ...(reducedMotion ? { width: `${fillWidth}%` } : {}),
          }}
          initial={reducedMotion ? false : { width: 0 }}
          animate={reducedMotion ? undefined : { width: `${fillWidth}%` }}
          transition={reducedMotion ? undefined : { duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        />
      </div>
      {/* The target: a hairline the eye reads as «where you should be». */}
      <div
        className="absolute inset-y-0 w-px -translate-x-1/2 bg-foreground/70"
        style={{ left: `${targetPosition}%` }}
        aria-hidden="true"
      />
    </div>
  );
}
