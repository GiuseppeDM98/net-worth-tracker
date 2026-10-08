'use client';

import { useSharedThemePalette } from '@/contexts/ChartColorsContext';
import { useThemePaletteReader } from '@/lib/hooks/useThemePaletteReader';
import type { AllocationAction } from '@/lib/utils/allocationUtils';

/**
 * Resolves COMPRA / VENDI / OK to colors from the active theme's chart palette, clamped to
 * a lightness band that stays legible on the page background.
 *
 * Why clamp (and not reuse useChartColors): some themes define chart colors at extreme
 * lightness — cyberpunk's chart-5 is oklch(0.92), near-white — which is unreadable as chip
 * text on a light card. `useChartColors` swaps such colors for a *static* palette entry at
 * the same index, which here would both lose the theme hue and let two actions collapse to
 * the same color. Clamping only the L channel keeps each theme's hue and keeps the three
 * actions distinct.
 *
 * The band is NOT a guess: these three colours are printed as text (a 10px chip label, an 18px
 * plan amount, a 13px gap figure), so they are held to WCAG AA 4.5:1 on `--card` AND on the chip's
 * own tinted fill, in all twelve theme blocks, by `__tests__/actionColorContrast.test.ts`. Until
 * 2026-09-21 this docstring claimed to guarantee contrast and the default light palette measured
 * 2,39:1.
 *
 * Read from `ChartColorsProvider` since 2026-10-08 (PERF-14), with the hook's own read as the
 * fallback when no provider is mounted (`resolveActionColors` in lib/utils/themePalette.ts). Read
 * once per section and pass the result down — never call this per row.
 */
export function useActionColors(): Record<AllocationAction, string> {
  const shared = useSharedThemePalette();
  const local = useThemePaletteReader(shared === null);
  return (shared ?? local).actionColors;
}
