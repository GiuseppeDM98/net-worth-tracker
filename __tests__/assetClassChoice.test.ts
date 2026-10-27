/**
 * Tests for `lib/utils/assetClassChoice.ts` — the class select of `AssetDialog`, «Asset composto»
 * included.
 *
 * The rule under test: «Asset composto» is a SELECT VALUE, not a ninth `AssetClass`. The list
 * derives from `ASSET_CLASS_SEQUENCE` (a hand-written list drops a class and its euros with it),
 * the option is last, and the value the select shows is the composition switch itself — so the
 * select and «Asset composto» cannot disagree.
 */

import { describe, expect, it } from 'vitest';
import { ASSET_CLASS_LABELS, ASSET_CLASS_SEQUENCE } from '@/lib/utils/allocationUtils';
import {
  ASSET_CLASS_CHOICES,
  ASSET_CLASS_OPTIONS,
  classSelectValue,
  emptyMixedComposition,
  isMixedClassChoice,
  MIXED_CLASS_LABEL,
  MIXED_CLASS_VALUE,
} from '@/lib/utils/assetClassChoice';

describe('assetClassChoice', () => {
  it('should offer the eight real classes, in the app sequence, with the app labels', () => {
    expect(ASSET_CLASS_CHOICES.map((choice) => choice.value)).toEqual(ASSET_CLASS_SEQUENCE);
    for (const choice of ASSET_CLASS_CHOICES) {
      expect(choice.label).toBe(ASSET_CLASS_LABELS[choice.value]);
    }
  });

  it('should put «Asset composto» last and keep it out of the composition-leg list', () => {
    expect(MIXED_CLASS_LABEL).toBe('Asset composto');
    expect(ASSET_CLASS_OPTIONS).toHaveLength(ASSET_CLASS_SEQUENCE.length + 1);
    expect(ASSET_CLASS_OPTIONS.at(-1)).toEqual({ value: MIXED_CLASS_VALUE, label: MIXED_CLASS_LABEL });
    expect(ASSET_CLASS_CHOICES.some((choice) => choice.value === MIXED_CLASS_VALUE)).toBe(false);
    // A real class must never collide with the Radix sentinel.
    expect(ASSET_CLASS_SEQUENCE as string[]).not.toContain(MIXED_CLASS_VALUE);
  });

  it('should recognise only the composite value', () => {
    expect(isMixedClassChoice(MIXED_CLASS_VALUE)).toBe(true);
    for (const assetClass of ASSET_CLASS_SEQUENCE) {
      expect(isMixedClassChoice(assetClass)).toBe(false);
    }
  });

  it('should show «Asset composto» exactly while the asset is composite', () => {
    expect(classSelectValue(true, 'bonds')).toBe(MIXED_CLASS_VALUE);
    expect(classSelectValue(false, 'bonds')).toBe('bonds');
    expect(classSelectValue(false, 'cash')).toBe('cash');
  });

  it('should seed two sleeves at 0% — nothing invented, and the 100% rule still bites', () => {
    const legs = emptyMixedComposition();
    expect(legs.map((leg) => leg.assetClass)).toEqual(['equity', 'bonds']);
    expect(legs.every((leg) => leg.percentage === 0)).toBe(true);
    expect(legs.reduce((sum, leg) => sum + leg.percentage, 0)).not.toBe(100);
    // A fresh array per call: the form edits rows in place, and a shared seed would leak.
    expect(emptyMixedComposition()).not.toBe(legs);
  });
});
