/**
 * `nextStreamFollow` (lib/utils/streamFollow.ts, 2026-11-25): the page follows a streaming answer
 * only while the reader has not scrolled up.
 */
import { describe, expect, it } from 'vitest';
import { nextStreamFollow } from '@/lib/utils/streamFollow';

describe('nextStreamFollow', () => {
  it('stops following on a scroll up, wherever the end is', () => {
    expect(nextStreamFollow(800, 600, true, true)).toBe(false);
    expect(nextStreamFollow(800, 600, false, true)).toBe(false);
  });

  it('follows again when a scroll down brings the end into view', () => {
    expect(nextStreamFollow(600, 900, true, false)).toBe(true);
  });

  it('keeps its state on a scroll down that leaves the end out of view, and on no move', () => {
    expect(nextStreamFollow(600, 700, false, false)).toBe(false);
    expect(nextStreamFollow(600, 600, true, false)).toBe(false);
    expect(nextStreamFollow(600, 600, false, true)).toBe(true);
  });
});
