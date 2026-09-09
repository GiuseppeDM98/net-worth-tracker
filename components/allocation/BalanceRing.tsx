'use client';

/**
 * BalanceRing — the balance score as an 84px ring with the number in the middle.
 *
 * WHY a ring, when the rule is «flat rows over donuts»: the score is ONE figure on a 0-100 scale,
 * and the ring is the shape that shows how far it is from 100 without a second number — a
 * part-of-whole read with a single slice — the ONE ring DESIGN.md still keeps (§5 Savings / Metric
 * Ring Chart: a bounded 0-100 score is not a rate). The number
 * carries the meaning; the arc's colour is reinforcement drawn from the action hues (OK / COMPRA /
 * VENDI through `useActionColors`), never from the sign tokens: a drift is neither a gain nor a
 * loss. The ring is the tile's only consumer of those hues, so resolving them here IS the one
 * resolution per tile.
 *
 * The score is band-independent (`computeBalanceScore`): it does not move when the band toggle in
 * the tile's aside does, so the ring reads as a fixed measurement beside a tunable classification.
 * Ported from `BalanceScoreGauge` without its prose — the tile's reading line carries the words
 * now — and with `strokeLinecap="butt"`: a round cap on a 97 overlaps the track at the seam and
 * reads as a full ring.
 */

import { useId } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { useActionColors } from '@/lib/hooks/useActionColors';

const SIZE = 84;
const STROKE = 6;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

// Tuned so a portfolio within a tight ±2 band reads «in order» (OK), a moderate drift «watch»
// (COMPRA's amber), a large one «act» (VENDI's coral).
const OK_SCORE = 92;
const WATCH_SCORE = 80;

interface BalanceRingProps {
  /** `BalanceScore.score`, 0-100. */
  score: number;
}

export function BalanceRing({ score }: BalanceRingProps) {
  const reducedMotion = useReducedMotion();
  const actionColors = useActionColors();
  const titleId = useId();

  const clamped = Math.max(0, Math.min(100, score));
  const rounded = Math.round(clamped);
  const color = clamped >= OK_SCORE ? actionColors.OK : clamped >= WATCH_SCORE ? actionColors.COMPRA : actionColors.VENDI;
  // The dash offset shrinks as the score grows; at 100 the arc closes on itself.
  const dashoffset = CIRCUMFERENCE * (1 - clamped / 100);

  return (
    <div className="relative h-[84px] w-[84px] shrink-0">
      <svg
        width={SIZE}
        height={SIZE}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        role="img"
        aria-labelledby={titleId}
        className="-rotate-90"
      >
        <title id={titleId}>{`Equilibrio ${rounded} su 100`}</title>
        <circle cx={SIZE / 2} cy={SIZE / 2} r={RADIUS} fill="none" stroke="var(--muted)" strokeWidth={STROKE} />
        <motion.circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          stroke={color}
          strokeWidth={STROKE}
          strokeLinecap="butt"
          strokeDasharray={CIRCUMFERENCE}
          initial={reducedMotion ? false : { strokeDashoffset: CIRCUMFERENCE }}
          animate={{ strokeDashoffset: dashoffset }}
          transition={reducedMotion ? undefined : { duration: 0.8, ease: [0.16, 1, 0.3, 1], delay: 0.15 }}
        />
      </svg>
      {/* The SVG's title already names the score; the printed number is for the eye only. */}
      <div className="absolute inset-0 flex items-center justify-center" aria-hidden="true">
        <span className="font-mono text-[22px] font-semibold leading-none tracking-[-0.025em] tabular-nums text-foreground">
          {rounded}
        </span>
      </div>
    </div>
  );
}
