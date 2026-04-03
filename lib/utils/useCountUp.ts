import { useState, useRef, useEffect } from 'react';

export interface UseCountUpOptions {
  /** Delay in ms before animation starts. Default: 60 */
  startDelay?: number;
  /** Duration in ms for the count-up animation. Default: 500 */
  duration?: number;
  /**
   * When true, animates only on the first non-null value received and never
   * re-triggers on subsequent changes. Useful for page-level KPIs that should
   * animate once on mount, not on every data refresh.
   * Default: false (re-triggers on every target change — original MetricCard behavior)
   */
  once?: boolean;
  /**
   * When true, animate from the previous rendered value instead of restarting
   * from zero on every update. Useful for period switches where values should
   * "settle" into the next state rather than replay a fresh count-up.
   * Default: false.
   */
  fromPrevious?: boolean;
}

/**
 * Animates a numeric value from 0 to the target over ~700ms using ease-out-quart.
 * Respects prefers-reduced-motion.
 *
 * @param target - The final value to animate to (null shows no value)
 * @param options - Animation options
 */
export function useCountUp(
  target: number | null,
  options: UseCountUpOptions = {}
): number | null {
  const { startDelay = 60, duration = 500, once = false, fromPrevious = false } = options;

  const [current, setCurrent] = useState<number | null>(null);
  const rafRef = useRef<number | undefined>(undefined);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const hasAnimatedRef = useRef(false);
  const currentRef = useRef<number | null>(null);
  const previousTargetRef = useRef<number | null>(null);

  const updateCurrent = (nextValue: number | null) => {
    currentRef.current = nextValue;
    setCurrent(nextValue);
  };

  useEffect(() => {
    // When `once` is true, skip any re-trigger after the first meaningful animation.
    // "Meaningful" = target is non-zero (target=0 during loading is ignored so that
    // the animation fires when real data arrives, not during the empty-assets phase).
    if (once && hasAnimatedRef.current) {
      // Already animated once — update value silently without re-animating.
      // Handles cases like snapshot overwrite where underlying data changes after mount.
      updateCurrent(target);
      previousTargetRef.current = target;
      return;
    }

    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (timerRef.current) clearTimeout(timerRef.current);

    if (target === null) {
      updateCurrent(null);
      previousTargetRef.current = null;
      return;
    }

    // For zero targets, jump immediately without counting as "animated" in once-mode.
    // This handles the loading phase where all metrics compute to 0 from empty assets.
    if (target === 0 && !fromPrevious) {
      updateCurrent(0);
      previousTargetRef.current = 0;
      return;
    }

    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      updateCurrent(target);
      previousTargetRef.current = target;
      if (once) hasAnimatedRef.current = true;
      return;
    }

    const startValue = fromPrevious
      ? currentRef.current ?? previousTargetRef.current ?? 0
      : 0;

    if (startValue === target) {
      updateCurrent(target);
      previousTargetRef.current = target;
      if (once) hasAnimatedRef.current = true;
      return;
    }

    let startTime: number | null = null;
    updateCurrent(startValue);

    timerRef.current = setTimeout(() => {
      const tick = (now: number) => {
        if (startTime === null) startTime = now;
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / duration, 1);
        // ease-out-quart: fast start, smooth deceleration
        const eased = 1 - Math.pow(1 - progress, 4);
        const nextValue = progress >= 1
          ? target
          : startValue + (target - startValue) * eased;
        updateCurrent(nextValue);
        if (progress < 1) {
          rafRef.current = requestAnimationFrame(tick);
        } else if (once) {
          // Mark as animated only after completing a real (non-zero) animation
          hasAnimatedRef.current = true;
        }
      };
      rafRef.current = requestAnimationFrame(tick);
    }, startDelay);

    previousTargetRef.current = target;

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  return current;
}
