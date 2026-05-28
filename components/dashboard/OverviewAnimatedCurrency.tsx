'use client';

import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import { useCountUp } from '@/lib/utils/useCountUp';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';

interface OverviewAnimatedCurrencyProps {
  /** Final value to display. Passed as a stable computed prop from the page. */
  value: number;
  /**
   * When true, animates from 0 to value on the first non-zero data load (once-mode).
   * When false, shows the final value immediately without any rAF loop.
   */
  animateOnMount: boolean;
  /**
   * How to format the interpolated value during and after animation.
   * - 'currency' (default): EUR via cachedFormatCurrencyEUR
   * - 'integer': Math.round() — avoids fractional display on count-based KPIs
   */
  format?: 'currency' | 'integer';
  /** Optional Tailwind classes applied to the wrapping span. */
  className?: string;
  /**
   * Fires once when the initial count-up animation completes.
   * Only called when animateOnMount is true.
   * The page uses this to know when the hero has settled so it can
   * schedule the chart subtree mount via requestIdleCallback.
   */
  onSettled?: () => void;
  /**
   * Delay in ms before the count-up animation begins.
   * Keeps the start frame budget low when multiple cards mount simultaneously.
   */
  startDelay?: number;
  /** Duration in ms for the count-up rAF loop. */
  duration?: number;
}

/**
 * Leaf component that owns count-up animation for Overview KPI currency values.
 *
 * COUNT-UP ISOLATION:
 * Keeping useCountUp here — not in the page component — means each rAF tick
 * causes a re-render of only this tiny leaf, not the entire DashboardPage subtree.
 * The chart section and secondary cards remain completely stable during animation.
 *
 * HOOK RULE COMPLIANCE:
 * useCountUp is always called unconditionally. When animateOnMount=false we pass
 * null as the target, which makes the hook skip the rAF loop and return null
 * immediately — zero overhead on non-hero cards.
 *
 * SETTLED SIGNAL:
 * onSettled fires exactly once, when animated reaches value after the rAF loop.
 * The reduced-motion branch of useCountUp also jumps straight to value, so
 * onSettled fires immediately in that case — correct behavior.
 */
export function OverviewAnimatedCurrency({
  value,
  animateOnMount,
  format = 'currency',
  className,
  onSettled,
  startDelay = 80,
  duration = 420,
}: OverviewAnimatedCurrencyProps) {
  // Pass null when not animating so useCountUp skips the rAF loop entirely.
  const animated = useCountUp(animateOnMount ? value : null, {
    once: true,
    startDelay,
    duration,
  });

  // When animateOnMount is true, use the animated value (falls back to final value
  // before animation starts). When false, bypass the hook result entirely.
  const displayValue = animateOnMount ? (animated ?? value) : value;

  // Guard against firing onSettled more than once — useEffect can re-run if
  // the parent re-renders while animated === value.
  const settledRef = useRef(false);

  useEffect(() => {
    if (!animateOnMount || !onSettled || settledRef.current) return;
    // Fire once the count-up loop reaches the target value.
    // No value !== 0 guard here: this component only renders after the page's
    // loading skeleton is dismissed, so value=0 means a legitimately empty
    // portfolio, not a loading placeholder. Guarding on !== 0 would prevent
    // heroSettled from firing for new users, leaving charts in a permanent
    // "Preparazione grafico..." state on desktop.
    if (animated !== null && animated === value) {
      settledRef.current = true;
      onSettled();
    }
  }, [animated, value, animateOnMount, onSettled]);

  const formatted = format === 'integer'
    ? String(Math.round(displayValue))
    : cachedFormatCurrencyEUR(displayValue);

  return (
    <span className={cn('tabular-nums', className)}>
      {formatted}
    </span>
  );
}
