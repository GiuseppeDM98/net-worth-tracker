'use client';

import { useEffect } from 'react';
import { motion, useAnimation } from 'framer-motion';

interface SavingsRingChartProps {
  /** Savings rate as a percentage. Can be negative (expenses > income). */
  rate: number;
  size?: number;
}

/**
 * SVG ring chart for the cashflow savings rate.
 *
 * Color thresholds:
 *   ≥ 20%  → green  (ottimo)
 *   10–19% → amber  (discreto)
 *   0–9%   → red    (scarso)
 *   < 0%   → red    (deficit — ring vuoto, testo negativo)
 *
 * Animation: fires ONCE on mount via useAnimation + empty-deps useEffect.
 * This prevents the ring from restarting whenever a parent component
 * re-renders (e.g. when the fiscal detail section is expanded).
 */
export function SavingsRingChart({ rate, size = 88 }: SavingsRingChartProps) {
  const strokeW = 7;
  const r = (size - strokeW) / 2;
  const circ = 2 * Math.PI * r;

  const clampedRate = Math.max(0, Math.min(rate, 100));
  const dash = (clampedRate / 100) * circ;

  const isNegative = rate < 0;

  const color = isNegative || rate < 10
    ? 'oklch(0.645 0.246 16.439)'  // red/coral
    : rate < 20
    ? 'var(--chart-3)'             // amber
    : 'oklch(0.696 0.17 142.5)';   // green

  const absDig = Math.abs(Math.round(rate)).toString().length;
  const fontSize = absDig >= 3 ? 13 : 16;

  // Animation fires only once at mount — not on every parent re-render.
  const controls = useAnimation();
  useEffect(() => {
    const timer = setTimeout(() => {
      controls.start({
        strokeDasharray: `${dash} ${circ - dash}`,
        transition: { duration: 0.9, ease: [0.16, 1, 0.3, 1] },
      });
    }, 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentionally empty — animate once on mount only

  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
      <svg
        width={size}
        height={size}
        style={{ transform: 'rotate(-90deg)', display: 'block' }}
      >
        {/* Track ring */}
        <circle
          cx={size / 2} cy={size / 2} r={r}
          fill="none"
          stroke="var(--border)"
          strokeWidth={strokeW}
        />
        {/* Filled segment — empty when rate ≤ 0 */}
        <motion.circle
          cx={size / 2} cy={size / 2} r={r}
          fill="none"
          stroke={color}
          strokeWidth={strokeW}
          strokeLinecap="round"
          initial={{ strokeDasharray: `0 ${circ}` }}
          animate={controls}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-[2px]">
        <span
          className="font-mono font-bold tabular-nums leading-none"
          style={{ fontSize, color }}
        >
          {isNegative ? '-' : ''}{Math.abs(Math.round(rate))}%
        </span>
        <span className="text-[8px] font-medium uppercase tracking-[0.06em] text-muted-foreground">
          {isNegative ? 'deficit' : 'risparmiati'}
        </span>
      </div>
    </div>
  );
}
