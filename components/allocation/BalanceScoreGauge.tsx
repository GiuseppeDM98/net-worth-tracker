/**
 * BalanceScoreGauge — the equilibrio verdict as a single glanceable score (A2).
 *
 * Replaces the old plain "N classi fuori target" line. The hero already computed the raw
 * material (`summarizeBalance` exposed `totalAbsDriftPp` but the page never showed it);
 * `computeBalanceScore` turns that into a 0–100 "how close to target" number and the
 * complementary "X% del portafoglio fuori posizione". A radial ring (DESIGN.md "Radial
 * Progress Ring") is the right metaphor: one percentage, snapshot display.
 *
 * The score is band-INDEPENDENT by design (see computeBalanceScore) — it measures absolute
 * distance from target, so it does NOT move when the user changes the rebalance band; only
 * the verdict text and the plan react to the band. The ring color is reinforcement, drawn
 * from the same theme chart hues as the action chips via `useActionColors` (good → OK hue,
 * mid → COMPRA/amber, low → VENDI/coral); the number carries the meaning on its own.
 */
'use client';

import { useId } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { useActionColors } from '@/lib/hooks/useActionColors';
import type { BalanceScore } from '@/lib/utils/allocationUtils';

interface BalanceScoreGaugeProps {
  balance: BalanceScore;
}

// Score thresholds for the reinforcement color band. Tuned so a portfolio within a tight
// ±2 band reads "good", a moderate drift reads "watch", and a large drift reads "act".
const GOOD_SCORE = 92;
const WATCH_SCORE = 80;

const RADIUS = 32;
const STROKE = 6;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function BalanceScoreGauge({ balance }: BalanceScoreGaugeProps) {
  const reducedMotion = useReducedMotion();
  const actionColors = useActionColors();
  const titleId = useId();

  const { score, misallocationPct } = balance;
  const color =
    score >= GOOD_SCORE
      ? actionColors.OK
      : score >= WATCH_SCORE
        ? actionColors.COMPRA
        : actionColors.VENDI;

  // Fraction of the ring to fill. dashoffset shrinks as the score grows.
  const filled = Math.max(0, Math.min(100, score)) / 100;
  const dashoffset = CIRCUMFERENCE * (1 - filled);

  return (
    <div className="flex items-center gap-4">
      <div className="relative shrink-0">
        <svg
          width={(RADIUS + STROKE) * 2}
          height={(RADIUS + STROKE) * 2}
          viewBox={`0 0 ${(RADIUS + STROKE) * 2} ${(RADIUS + STROKE) * 2}`}
          role="img"
          aria-labelledby={titleId}
          className="-rotate-90"
        >
          <title id={titleId}>{`Equilibrio ${score} su 100`}</title>
          {/* Muted track ring */}
          <circle
            cx={RADIUS + STROKE}
            cy={RADIUS + STROKE}
            r={RADIUS}
            fill="none"
            stroke="var(--muted)"
            strokeWidth={STROKE}
          />
          {/* Score arc */}
          <motion.circle
            cx={RADIUS + STROKE}
            cy={RADIUS + STROKE}
            r={RADIUS}
            fill="none"
            stroke={color}
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            initial={reducedMotion ? false : { strokeDashoffset: CIRCUMFERENCE }}
            animate={{ strokeDashoffset: dashoffset }}
            transition={
              reducedMotion ? undefined : { duration: 0.8, ease: [0.16, 1, 0.3, 1], delay: 0.15 }
            }
          />
        </svg>
        {/* Centered score number */}
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="font-mono text-xl font-bold tabular-nums leading-none text-foreground">
            {score}
          </span>
        </div>
      </div>

      <div className="min-w-0">
        <p className="text-sm font-semibold text-foreground">Equilibrio</p>
        <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
          {misallocationPct < 0.05 ? (
            'Allocazione perfettamente in linea col target.'
          ) : (
            <>
              <span className="font-mono tabular-nums text-foreground">
                {misallocationPct.toFixed(1)}%
              </span>{' '}
              del portafoglio fuori posizione rispetto al target.
            </>
          )}
        </p>
      </div>
    </div>
  );
}
