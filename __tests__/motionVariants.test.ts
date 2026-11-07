/**
 * The Consulente's scene variants (lib/utils/motionVariants.ts, 2026-11-07): the screen comes in from
 * the side it is going to, leaves to the other; reduced motion is a cross-fade with no travel; a
 * question card enters by a translate only (decision 78).
 */

import { describe, expect, it } from 'vitest';
import { cardEnterVariants, sceneEnter, sceneExit, sceneVariants, sceneVariantsReduced } from '@/lib/utils/motionVariants';

type Target = Record<string, unknown> & { transition?: { duration?: number } };

describe('the scene variants', () => {
  it('slides 24px from the side the reader is going to, and out to the other', () => {
    expect(sceneEnter(1)).toEqual({ x: 24, opacity: 0 });
    expect(sceneEnter(-1)).toEqual({ x: -24, opacity: 0 });
    expect(sceneExit(1)).toMatchObject({ x: -24, opacity: 0, transition: { duration: 0.18 } });
    expect(sceneExit(-1).x).toBe(24);
    expect((sceneVariants.center as Target).transition?.duration).toBe(0.25);
    expect(sceneVariants.enter).toBe(sceneEnter);
    expect(sceneVariants.exit).toBe(sceneExit);
  });

  it('keeps no travel under reduced motion', () => {
    expect(Object.values(sceneVariantsReduced).every((variant) => !('x' in (variant as Target)))).toBe(true);
    expect((sceneVariantsReduced.center as Target).transition?.duration).toBe(0.15);
    expect((sceneVariantsReduced.exit as Target).transition?.duration).toBe(0.1);
  });

  it('enters a question card by a translate only', () => {
    expect(cardEnterVariants.enter).toEqual({ y: 8 });
    expect('opacity' in (cardEnterVariants.enter as Target)).toBe(false);
    expect((cardEnterVariants.center as Target).transition?.duration).toBe(0.2);
  });
});
