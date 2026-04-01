/**
 * Celebration utilities for milestone confetti effects.
 *
 * Uses localStorage to ensure each milestone is celebrated only once per user
 * per browser. Keys are prefixed with `celebrated_` to avoid collisions with
 * other localStorage entries.
 *
 * Confetti is loaded lazily via dynamic import — it is never included in the
 * main bundle, only fetched when a celebration is actually needed.
 */

const STORAGE_PREFIX = 'celebrated_';

/**
 * Check whether a milestone has already been celebrated in this browser.
 *
 * @param key - Unique identifier for the milestone (e.g. "milestone_1_raddoppio")
 * @returns true if the milestone was already celebrated
 */
export function hasCelebrated(key: string): boolean {
  try {
    return localStorage.getItem(`${STORAGE_PREFIX}${key}`) === 'true';
  } catch {
    // localStorage can be unavailable in private browsing or when storage is full
    return false;
  }
}

/**
 * Mark a milestone as celebrated so it is not shown again.
 *
 * @param key - Unique identifier for the milestone
 */
export function markCelebrated(key: string): void {
  try {
    localStorage.setItem(`${STORAGE_PREFIX}${key}`, 'true');
  } catch {
    // Silently ignore — losing a celebration record is acceptable
  }
}

/**
 * Check whether the user has requested reduced motion via OS/browser settings.
 *
 * Used to skip confetti animations — matches the project-wide convention of
 * respecting `prefers-reduced-motion` that Framer Motion's MotionProvider also
 * enforces.
 *
 * @returns true if reduced motion is preferred
 */
export function shouldReduceMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    // matchMedia unavailable (SSR or unusual environment) — default to no motion
    return false;
  }
}
