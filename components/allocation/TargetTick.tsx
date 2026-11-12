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
 *
 * `projectedPercentage` (optional, the Accumulo tile's class strip) adds a THIRD fact: a hollow
 * ring where the plan leaves the class. Fill = today, hairline = target, ring = end of the plan —
 * the reader sees whether the plan closes the gap without reading two pp figures. The scale takes
 * it into account; without the prop the track is exactly the Per classe one.
 */
'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { formatPercentage } from '@/lib/services/chartService';

interface TargetTickProps {
  /** The fill's colour; the row's class colour, behind the theme's --allocation-row-bar. */
  color?: string;
  currentPercentage: number;
  targetPercentage: number;
  /** Where a plan leaves the class (end of the PAC); drawn as a hollow ring when given. */
  projectedPercentage?: number;
  /** Replaces the percentage wording (a leverage objective reads in ×). */
  ariaLabel?: string;
  className?: string;
}

export function TargetTick({
  color = 'var(--allocation-row-bar, var(--chart-1))',
  currentPercentage,
  targetPercentage,
  projectedPercentage,
  ariaLabel,
  className,
}: TargetTickProps) {
  const reducedMotion = useReducedMotion();

  const scaleMax = Math.max(currentPercentage, targetPercentage, projectedPercentage ?? 0, 1) * 1.12;
  const fillWidth = Math.min((currentPercentage / scaleMax) * 100, 100);
  const targetPosition = Math.min((targetPercentage / scaleMax) * 100, 100);
  const projectedPosition = projectedPercentage === undefined ? null : Math.min((projectedPercentage / scaleMax) * 100, 100);
  const projectedClause = projectedPercentage === undefined ? '' : `, a fine piano ${formatPercentage(projectedPercentage, 1)}`;

  return (
    <div
      className={cn('relative h-[10px] w-full', className)}
      role="progressbar"
      aria-valuenow={Math.round(currentPercentage)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={ariaLabel ?? `Allocazione corrente ${formatPercentage(currentPercentage, 1)}, target ${formatPercentage(targetPercentage, 0)}${projectedClause}`}
    >
      {/* The 4px track, centred in the 10px root so the marker has 3px on each side. */}
      <div className="absolute inset-x-0 top-[3px] h-1 overflow-hidden rounded-full bg-muted">
        <motion.div
          className="absolute inset-y-0 left-0 rounded-full"
          style={{
            backgroundColor: color,
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
      {/* The end of the plan: a hollow ring on the track, the card showing through it. */}
      {projectedPosition !== null && (
        <div
          className="absolute top-1/2 size-[9px] -translate-x-1/2 -translate-y-1/2 rounded-full border-[1.5px] border-foreground/70 bg-card"
          style={{ left: `${projectedPosition}%` }}
          aria-hidden="true"
        />
      )}
    </div>
  );
}
