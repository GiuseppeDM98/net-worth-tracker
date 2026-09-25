/**
 * Celebration utilities: the once-per-milestone record behind the savings-rate badge.
 *
 * Uses localStorage to ensure each milestone is celebrated only once per user
 * per browser. Keys are prefixed with `celebrated_` to avoid collisions with
 * other localStorage entries.
 *
 * Since 2026-09-22 no surface fires confetti any more (Storico's burst went on 2026-09-13,
 * the FIRE Calcolatore's with its impeccable critique): the one caller left is the monthly
 * savings-rate badge, which records that a month was shown — the product reports, it does not
 * cheer (DESIGN.md → Celebration Badge).
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
