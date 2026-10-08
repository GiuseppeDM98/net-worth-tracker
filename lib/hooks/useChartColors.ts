'use client';

import { useSharedThemePalette } from '@/contexts/ChartColorsContext';
import { useThemePaletteReader } from '@/lib/hooks/useThemePaletteReader';

/**
 * Returns a 10-color palette that respects the active color theme.
 *
 * Indices 0–8 resolve --chart-1 through --chart-9 from the current theme's
 * CSS variables; 9 still falls back to the static CHART_COLORS palette.
 *
 * Slot 9 (index 8) is Storico's «Previdenza» band. Until 2026-09-20 it was the static indigo
 * `#6366F1`, which no theme knew about: ΔE00 3.8 from midnight-bloom's Azioni, 10.3 from the
 * default theme's — a ninth colour nobody had measured against the other eight.
 *
 * It used to stop at 5, which is how the eight asset classes ended up with two
 * theme-independent tails: `ASSET_CLASS_CHART_INDEX` gives commodity slot 5,
 * trendFollowing 6 and carry 7, and on the default theme the static teal at index 6
 * measured ΔE00 0.87 from --chart-2 — not "close to" Obbligazioni, the same colour.
 *
 * Read from `ChartColorsProvider` (the dashboard layout reads the theme once, since 2026-10-08),
 * so a host renders once instead of twice. Without the provider (the landing) the hook
 * reads the theme itself, after paint — the timing and the luminance filter are in
 * `useThemePaletteReader` and `lib/utils/themePalette.ts`.
 */
export function useChartColors(): string[] {
  const shared = useSharedThemePalette();
  const local = useThemePaletteReader(shared === null);
  return (shared ?? local).chartColors;
}
