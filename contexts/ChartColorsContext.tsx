'use client';

import { createContext, useContext, type ReactNode } from 'react';
import { useThemePaletteReader } from '@/lib/hooks/useThemePaletteReader';
import type { ThemePalette } from '@/lib/utils/themePalette';

/**
 * The chart palette of the active theme, read ONCE per theme for everything under the dashboard
 * layout (since 2026-10-08, PERF-14). Before it every host of `useChartColors` — up to twelve on a
 * FIRE tab — ran its own rAF and `getComputedStyle`, then rendered a second time one frame after
 * mounting to swap the static palette for the theme's.
 *
 * Mounted in `app/dashboard/layout.tsx`, which outlives the pages: the read happens while the shell
 * waits for Firebase Auth, so a page mounts with the theme's colours already in hand and renders
 * once. The value is the reader's state object, replaced only when the colour theme or the mode
 * changes — a context consumer re-renders on every new value, memoized or not, so it must be
 * stable between those changes.
 *
 * `null` outside the provider: the three hooks then read the theme themselves (the landing, the
 * auth pages), through the same `useThemePaletteReader`.
 */
const ChartColorsContext = createContext<ThemePalette | null>(null);

export function ChartColorsProvider({ children }: { children: ReactNode }) {
  const palette = useThemePaletteReader(true);
  return <ChartColorsContext.Provider value={palette}>{children}</ChartColorsContext.Provider>;
}

/** The provider's palette, or `null` when no `ChartColorsProvider` is above. */
export function useSharedThemePalette(): ThemePalette | null {
  return useContext(ChartColorsContext);
}
