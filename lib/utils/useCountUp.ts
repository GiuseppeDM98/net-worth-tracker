import { useState, useRef, useEffect } from 'react';

export interface UseCountUpOptions {
  /** Delay in ms before animation starts. Default: 60 */
  startDelay?: number;
  /**
   * When true, animates only on the first non-null value received and never
   * re-triggers on subsequent changes. Useful for page-level KPIs that should
   * animate once on mount, not on every data refresh.
   * Default: false (re-triggers on every target change — original MetricCard behavior)
   */
  once?: boolean;
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
  const { startDelay = 60, once = false } = options;

  const [current, setCurrent] = useState<number | null>(null);
  const rafRef = useRef<number | undefined>(undefined);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const hasAnimatedRef = useRef(false);

  useEffect(() => {
    // When `once` is true, skip any re-trigger after the first meaningful animation.
    // "Meaningful" = target is non-zero (target=0 during loading is ignored so that
    // the animation fires when real data arrives, not during the empty-assets phase).
    if (once && hasAnimatedRef.current) return;

    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (timerRef.current) clearTimeout(timerRef.current);

    if (target === null) {
      setCurrent(null);
      return;
    }

    // For zero targets, jump immediately without counting as "animated" in once-mode.
    // This handles the loading phase where all metrics compute to 0 from empty assets.
    if (target === 0) {
      setCurrent(0);
      return;
    }

    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setCurrent(target);
      if (once) hasAnimatedRef.current = true;
      return;
    }

    const duration = 700;
    let startTime: number | null = null;

    timerRef.current = setTimeout(() => {
      const tick = (now: number) => {
        if (startTime === null) startTime = now;
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / duration, 1);
        // ease-out-quart: fast start, smooth deceleration
        const eased = 1 - Math.pow(1 - progress, 4);
        setCurrent(progress >= 1 ? target : target * eased);
        if (progress < 1) {
          rafRef.current = requestAnimationFrame(tick);
        } else if (once) {
          // Mark as animated only after completing a real (non-zero) animation
          hasAnimatedRef.current = true;
        }
      };
      rafRef.current = requestAnimationFrame(tick);
    }, startDelay);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  return current;
}
