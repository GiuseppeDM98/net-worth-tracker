import { useState, useEffect } from 'react';

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
 * The animation as one piece of state, keyed on the target it answers to.
 *
 * `target` is the subject; `value` the number on screen; `from` is non-null while an animation
 * from that number to `target` is pending or running (the effect below drives it); `hasAnimated`
 * is the once-mode latch, set only when a real (non-zero) count-up completes.
 */
interface CountUpState {
  target: number | null;
  value: number | null;
  from: number | null;
  hasAnimated: boolean;
}

const INITIAL_STATE: CountUpState = { target: null, value: null, from: null, hasAnimated: false };

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Where a new target lands BEFORE any animation frame: the immediate value and whether a
 * count-up follows. Pure, so the decision is taken during render (React's adjust-state-during-
 * render pattern) instead of in an effect — a synchronous setState in an effect is banned by
 * react-hooks/set-state-in-effect, and every branch here used to be one.
 */
function settleTarget(
  previous: CountUpState,
  target: number | null,
  once: boolean,
  fromPrevious: boolean
): CountUpState {
  // No value to show; the next target starts from zero again (the seeds reset with it).
  if (target === null) {
    return { target: null, value: null, from: null, hasAnimated: previous.hasAnimated };
  }

  // Already animated once — update silently without re-animating. Handles cases like a
  // snapshot overwrite where the underlying data changes after mount.
  if (once && previous.hasAnimated) {
    return { target, value: target, from: null, hasAnimated: true };
  }

  // A zero target jumps immediately without counting as "animated" in once-mode: during the
  // loading phase every metric computes to 0 from empty assets, and the animation must fire
  // when the real data arrives, not on that phase.
  if (target === 0 && !fromPrevious) {
    return { target, value: 0, from: null, hasAnimated: previous.hasAnimated };
  }

  if (prefersReducedMotion()) {
    return { target, value: target, from: null, hasAnimated: previous.hasAnimated || once };
  }

  const startValue = fromPrevious ? previous.value ?? previous.target ?? 0 : 0;
  if (startValue === target) {
    return { target, value: target, from: null, hasAnimated: previous.hasAnimated || once };
  }

  return { target, value: startValue, from: startValue, hasAnimated: previous.hasAnimated };
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

  const [state, setState] = useState<CountUpState>(INITIAL_STATE);

  // A new target is settled on the render that brings it: React re-renders at once with the
  // new state, so the old number is never painted under the new target.
  if (!Object.is(state.target, target)) {
    setState(settleTarget(state, target, once, fromPrevious));
  }

  const { from, target: animatingTo } = state;

  // The count-up itself: the only writer that runs outside render, one frame at a time. Keyed on
  // the pair (from, target) and not on the whole state, so its own ticks never restart it.
  useEffect(() => {
    if (from === null || animatingTo === null) return;

    let startTime: number | null = null;
    let rafId: number | undefined;

    const timer = setTimeout(() => {
      const tick = (now: number) => {
        if (startTime === null) startTime = now;
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / duration, 1);
        // ease-out-quart: fast start, smooth deceleration
        const eased = 1 - Math.pow(1 - progress, 4);
        const nextValue = progress >= 1 ? animatingTo : from + (animatingTo - from) * eased;
        const finished = progress >= 1;

        setState((previous) => {
          // A newer target has already replaced this animation: its cleanup cancelled the
          // frame, but a tick queued before it could still land — leave the new state alone.
          if (previous.target !== animatingTo || previous.from !== from) return previous;
          return {
            ...previous,
            value: nextValue,
            from: finished ? null : previous.from,
            // Mark as animated only after completing a real (non-zero) animation
            hasAnimated: finished && once ? true : previous.hasAnimated,
          };
        });

        if (!finished) rafId = requestAnimationFrame(tick);
      };
      rafId = requestAnimationFrame(tick);
    }, startDelay);

    return () => {
      clearTimeout(timer);
      if (rafId !== undefined) cancelAnimationFrame(rafId);
    };
  }, [from, animatingTo, duration, startDelay, once]);

  // Null is the absence of a value: derived from the target, never waited for.
  return target === null ? null : state.value;
}
