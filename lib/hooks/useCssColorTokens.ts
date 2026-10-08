'use client';

import { useMemo } from 'react';
import { useSharedThemePalette } from '@/contexts/ChartColorsContext';
import { useThemePaletteReader } from '@/lib/hooks/useThemePaletteReader';

/**
 * Theme colour tokens resolved to `#rrggbb`, for the chart libraries that cannot take a CSS
 * colour as the browser serves it (Nivo's react-spring interpolates neither `oklch()` nor `lab()`).
 *
 * `tokens` maps a result key to a CSS custom property; `fallbacks` gives the hex painted before the
 * first read and whenever a token is missing or unreadable. The hexes come from
 * `ChartColorsProvider`, which resolves `THEME_HEX_TOKENS` (lib/utils/themePalette.ts) once per
 * theme — a token passed here must be in that list (since 2026-10-08, PERF-14; the five `--role-*`
 * aliases are, by construction).
 *
 * `enabled` is whether the caller will actually PAINT the colours this render. With the provider
 * mounted nothing is read here at all; without it (no dashboard layout above), the fallback read
 * runs only while enabled — disabled, no requestAnimationFrame, no getComputedStyle, no setState,
 * so a host that draws nothing with them renders once at mount. The last colours read, or the
 * fallbacks, are returned meanwhile.
 *
 * Pass module-level constants: the result is memoized on the objects' identity.
 *
 * Used by: components/cashflow/analisi/tiles/FlussoTile.tsx (the 50/30/20 Sankey's role colours).
 */
export function useCssColorTokens<K extends string>(
  tokens: Readonly<Record<K, string>>,
  fallbacks: Readonly<Record<K, string>>,
  enabled: boolean
): Record<K, string> {
  const shared = useSharedThemePalette();
  const local = useThemePaletteReader(shared === null && enabled);
  const { tokenHex } = shared ?? local;

  return useMemo(() => {
    const colors: Record<K, string> = { ...fallbacks };
    for (const key of Object.keys(tokens) as K[]) {
      colors[key] = tokenHex[tokens[key]] ?? fallbacks[key];
    }
    return colors;
  }, [tokenHex, tokens, fallbacks]);
}
