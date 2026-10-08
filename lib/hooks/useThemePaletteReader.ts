'use client';

import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { useColorTheme } from '@/contexts/ColorThemeContext';
import { INITIAL_THEME_PALETTE, readThemePalette, type ThemePalette } from '@/lib/utils/themePalette';

/**
 * The active theme's chart palette, read from `<html>`'s computed style — ONE `getComputedStyle`
 * per colour-theme or light/dark change. Called by `ChartColorsProvider` (always on) and, as the
 * fallback when no provider is mounted (the landing, the auth pages), by `useChartColors`,
 * `useActionColors` and `useCssColorTokens` themselves.
 *
 * The timing is the rule of doc/guide/temi.md: `useEffect` + `requestAnimationFrame` + `useState`,
 * never `useMemo` — a read during render runs before next-themes has applied the new `.dark` class
 * and returns the previous mode's colours. The first render paints `INITIAL_THEME_PALETTE`.
 *
 * `enabled: false` schedules nothing (no rAF, no read, no `setState`): a hook whose provider is
 * mounted keeps its fallback switched off, so it costs a host no second render.
 */
export function useThemePaletteReader(enabled: boolean): ThemePalette {
  const { colorTheme } = useColorTheme();
  const { resolvedTheme } = useTheme();
  const [palette, setPalette] = useState<ThemePalette>(INITIAL_THEME_PALETTE);

  useEffect(() => {
    if (!enabled) return;
    const frame = requestAnimationFrame(() => {
      const style = getComputedStyle(document.documentElement);
      setPalette(readThemePalette((property) => style.getPropertyValue(property).trim(), resolvedTheme === 'dark'));
    });
    return () => cancelAnimationFrame(frame);
  }, [enabled, colorTheme, resolvedTheme]);

  return palette;
}
