/**
 * The landing on the Scheda glides (owner, 2026-11-15, the NOVE-10 mirror tour: «non troppo lenta, ma
 * neanche istantaneamente»): `lib/utils/smoothScroll.ts`. Seen red with the easing returned linear
 * (`t` itself) and with the scroll margin left out of the target.
 */

import { describe, expect, it } from 'vitest';
import { SCROLL_GLIDE_MS, easeOutQuart, glideOffset, glideTargetTop, scrollTargetTop } from '@/lib/utils/smoothScroll';

describe('easeOutQuart', () => {
  it('starts at 0, ends at 1 and covers most of the way early', () => {
    expect(easeOutQuart(0)).toBe(0);
    expect(easeOutQuart(1)).toBe(1);
    // Ease-out: at a quarter of the time well over a quarter of the way (1 − 0,75⁴ ≈ 0,68).
    expect(easeOutQuart(0.25)).toBeCloseTo(0.68359375, 6);
  });
});

describe('glideOffset', () => {
  it('moves from the start to the target over the glide, clamped past it', () => {
    expect(SCROLL_GLIDE_MS).toBe(450);
    expect(glideOffset(100, 1100, 0)).toBe(100);
    expect(glideOffset(100, 1100, SCROLL_GLIDE_MS)).toBe(1100);
    expect(glideOffset(100, 1100, SCROLL_GLIDE_MS * 2)).toBe(1100);
    expect(glideOffset(100, 1100, SCROLL_GLIDE_MS / 4)).toBeCloseTo(100 + 1000 * 0.68359375, 6);
    // Upwards too.
    expect(glideOffset(1100, 100, SCROLL_GLIDE_MS)).toBe(100);
  });
});

describe('scrollTargetTop', () => {
  it('puts the element top at the container top, less its scroll margin, never below zero', () => {
    // The container scrolled 300; the element sits 820 below the container's top edge; 16px of margin.
    expect(scrollTargetTop({ scrollTop: 300, containerTop: 64, elementTop: 884, scrollMarginTop: 16, maxScroll: 5000 })).toBe(1104);
    expect(scrollTargetTop({ scrollTop: 0, containerTop: 0, elementTop: 4, scrollMarginTop: 16, maxScroll: 5000 })).toBe(0);
    // Never past the end of the page.
    expect(scrollTargetTop({ scrollTop: 0, containerTop: 0, elementTop: 9000, scrollMarginTop: 0, maxScroll: 5000 })).toBe(5000);
  });
});

// The way back (owner, 2026-11-15): «Chiudi» glides to the row that opened the Scheda and centres it,
// and does not move when the row is already in view. Seen red with the row put at the top and with
// the in-view check removed.
describe('glideTargetTop, centred', () => {
  const box = { scrollTop: 2000, containerTop: 64, containerHeight: 800, maxScroll: 5000 };
  it('centres a row above the view in the container', () => {
    // The row's top is 1500 above the container's top edge, 40 tall: centred, its top sits 380 below the edge.
    expect(glideTargetTop({ ...box, elementTop: 64 - 1500, elementHeight: 40 })).toBe(2000 - 1500 - 380);
  });
  it('stays put when the row is already wholly in view', () => {
    expect(glideTargetTop({ ...box, elementTop: 300, elementHeight: 40 })).toBe(2000);
  });
});
