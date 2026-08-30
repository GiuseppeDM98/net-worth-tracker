'use client';

import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { useColorTheme } from '@/contexts/ColorThemeContext';
import { CHART_COLORS } from '@/lib/constants/colors';

/**
 * Extracts the L (lightness) channel from an oklch() string.
 * Returns null if the string is not a recognisable oklch value.
 * Example: "oklch(0.9200 0.0651 74.44)" → 0.92
 */
function parseOklchL(value: string): number | null {
  const match = value.match(/oklch\(\s*([\d.]+)/i);
  if (!match) return null;
  return parseFloat(match[1]);
}

/**
 * Returns a 10-color palette that respects the active color theme.
 *
 * Indices 0–7 resolve --chart-1 through --chart-8 from the current theme's
 * CSS variables; 8–9 still fall back to the static CHART_COLORS palette.
 *
 * It used to stop at 5, which is how the eight asset classes ended up with two
 * theme-independent tails: `ASSET_CLASS_CHART_INDEX` gives commodity slot 5,
 * trendFollowing 6 and carry 7, and on the default theme the static teal at index 6
 * measured ΔE00 0.87 from --chart-2 — not "close to" Obbligazioni, the same colour.
 *
 * Uses useEffect + requestAnimationFrame to read CSS vars AFTER the browser
 * has recalculated styles following a theme change. useMemo would read them
 * synchronously during the render, before next-themes has finished applying
 * the new .dark class — causing stale colors on dark↔light transitions.
 */
export function useChartColors(): string[] {
  const { colorTheme } = useColorTheme();
  const { resolvedTheme } = useTheme();
  const [colors, setColors] = useState<string[]>(CHART_COLORS);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const style = getComputedStyle(document.documentElement);
      const isDark = resolvedTheme === 'dark';

      const themePalette = [1, 2, 3, 4, 5, 6, 7, 8].map((n) =>
        style.getPropertyValue(`--chart-${n}`).trim()
      );

      const resolved = themePalette.map((color, i) => {
        if (!color) return CHART_COLORS[i];
        // Some tweakcn themes define chart colors with extreme luminance that
        // disappears against the page background (e.g. Caffeine chart-2/3 are
        // oklch(0.93) — nearly white — making them invisible in light mode).
        // Parse the L channel and fall back to the static palette if the color
        // would lack contrast in the current mode.
        const l = parseOklchL(color);
        if (l !== null) {
          if (!isDark && l > 0.82) return CHART_COLORS[i]; // too light for light bg
          if (isDark && l < 0.30) return CHART_COLORS[i];  // too dark for dark bg
        }
        return color;
      });

      setColors([...resolved, ...CHART_COLORS.slice(8, 10)]);
    });
    return () => cancelAnimationFrame(frame);
  }, [colorTheme, resolvedTheme]);

  return colors;
}
