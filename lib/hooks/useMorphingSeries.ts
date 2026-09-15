'use client';

import { useEffect, useState } from 'react';
import { blendSeries, resampleSeries, sameSeries, type SeriesValue } from '@/lib/utils/seriesMorph';

/** How long a plotted series takes to become its next window — one glide, felt, not watched. */
export const SERIES_MORPH_MS = 420;

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** The glide as one piece of state keyed on the target it answers to (adjust-state-during-render). */
interface MorphState {
  target: SeriesValue[];
  shown: SeriesValue[];
  /** Where the running glide started; null once it has landed. */
  from: SeriesValue[] | null;
}

/**
 * The series a hand-written chart should DRAW right now: `target` once it has landed, and in the
 * meantime a frame of the glide from the series it was drawing before (`lib/utils/seriesMorph.ts`).
 * The first target is drawn at once (the tile's entrance is the page's, not the chart's); every
 * later target — a period switch — is reached by gliding. Under `prefers-reduced-motion` the
 * chart jumps: the preference reduces the motion, never the figure.
 */
export function useMorphingSeries(target: SeriesValue[]): SeriesValue[] {
  const [state, setState] = useState<MorphState>({ target, shown: target, from: null });

  // A new target is settled on the render that brings it: the glide starts from what is on screen
  // now (resampled onto the new length), never from a frame the user has not seen.
  if (state.target !== target && !sameSeries(state.target, target)) {
    const from = prefersReducedMotion() || state.shown.length === 0 ? null : resampleSeries(state.shown, target.length);
    setState({ target, shown: from ?? target, from });
  } else if (state.target !== target) {
    // Same picture, new reference: adopt it so the effect never re-runs on an equal series.
    setState({ ...state, target });
  }

  const { from, target: animatingTo } = state;

  // The glide itself, one frame at a time, keyed on the (from, target) pair so its own ticks never restart it.
  useEffect(() => {
    if (from === null) return;
    let raf = 0;
    let start: number | null = null;
    const tick = (now: number) => {
      if (start === null) start = now;
      const t = Math.min((now - start) / SERIES_MORPH_MS, 1);
      if (t >= 1) {
        setState((previous) => (previous.target === animatingTo ? { target: animatingTo, shown: animatingTo, from: null } : previous));
        return;
      }
      setState((previous) => (previous.target === animatingTo ? { ...previous, shown: blendSeries(from, animatingTo, t) } : previous));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [from, animatingTo]);

  return state.shown;
}
