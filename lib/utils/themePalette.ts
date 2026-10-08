/**
 * themePalette — every colour the charts read from the active theme, resolved in ONE pass.
 *
 * Three readers used to do this each on its own, once per HOST: `useChartColors` (the nine
 * `--chart-*` slots), `useActionColors` (COMPRA / VENDI / OK, clamped to a legible band) and
 * `useCssColorTokens` (the five `--role-*` aliases as hexes for Nivo). The values are the same for
 * the whole page until the colour theme or the light/dark mode changes, so since 2026-10-08
 * (PERF-14) `ChartColorsProvider` reads them once per theme and the three hooks read its context.
 * This module is the pure half: given a token reader and the mode, the palette. The provider and
 * the hooks' no-provider fallback both call `readThemePalette`, so the two can never disagree.
 *
 * THE LUMINANCE FILTER IS LIVE SINCE 2026-10-08. A slot lighter than L 0.82 in light mode, or darker
 * than L 0.30 in dark, falls back to the static `CHART_COLORS` entry at its index — a guard for a
 * theme whose chart colours would vanish into the page. The old filter matched `/oklch\(/` on the
 * SERVED string, which is `lab(…)` or `#rrggbb` (lib/utils/colorParse.ts), so it never fired; it
 * now reads the served form through `cssColorToOklch`. `__tests__/chartPaletteDistinctness.test.ts`
 * holds every authored slot of the twelve blocks inside the band, so on today's themes the filter
 * changes nothing — it exists for the next theme.
 */

import { CHART_COLORS } from '@/lib/constants/colors';
import { SPENDING_ROLE_TOKEN } from '@/lib/constants/spendingRoleColors';
import { clampActionLightness } from '@/lib/utils/actionColor';
import { ACTION_CHART_NUMBER, type AllocationAction } from '@/lib/utils/allocationUtils';
import { cssColorToOklch } from '@/lib/utils/colorParse';
import { colorToHex } from '@/lib/utils/cssColorToHex';

/** A token's served value, trimmed — `''` when the property is not declared. */
export type ReadToken = (property: string) => string;

export interface ThemePalette {
  /** Ten colours: indices 0-8 are `--chart-1..9`, index 9 the static lime. */
  chartColors: string[];
  /** COMPRA / VENDI / OK, clamped to the band that clears 4,5:1 as text. */
  actionColors: Record<AllocationAction, string>;
  /** `#rrggbb` per custom property of `THEME_HEX_TOKENS`; `null` until read, or when unreadable. */
  tokenHex: Readonly<Record<string, string | null>>;
}

/** Above this OKLCH lightness a slot is too light for a light page (`chartPaletteDistinctness` repeats it). */
export const CHART_LIGHT_MAX_L = 0.82;
/** Below this OKLCH lightness a slot is too dark for a dark page. */
export const CHART_DARK_MIN_L = 0.3;

/**
 * The custom properties resolved to hex for Nivo, which interpolates neither `oklch()` nor `lab()`.
 * A token read through `useCssColorTokens` must be in this list: with the provider mounted, a
 * token outside it gets its fallback.
 */
export const THEME_HEX_TOKENS: readonly string[] = Object.values(SPENDING_ROLE_TOKEN);

/** Legible default-theme action colours, shown until the first read. */
export const INITIAL_ACTION_COLORS: Record<AllocationAction, string> = {
  COMPRA: 'oklch(0.62 0.17 70)', // amber
  VENDI: 'oklch(0.62 0.21 25)', // coral
  OK: 'oklch(0.62 0.15 162)', // jade
};

/** What a host paints before the first read: the static palette. */
export const INITIAL_THEME_PALETTE: ThemePalette = {
  chartColors: CHART_COLORS,
  actionColors: INITIAL_ACTION_COLORS,
  tokenHex: Object.fromEntries(THEME_HEX_TOKENS.map((token) => [token, null])),
};

/**
 * A served slot, or the static colour at its index when it is missing or outside the luminance
 * band. A form `cssColorToOklch` does not model (a keyword, `color-mix()`, `color(display-p3 …)`)
 * has no lightness to judge, so it passes UNFILTERED — the one case the filter does not cover.
 */
function filterChartSlot(served: string, index: number, isDark: boolean): string {
  if (!served) return CHART_COLORS[index];
  const oklch = cssColorToOklch(served);
  if (!oklch) return served;
  const [L] = oklch;
  if (!isDark && L > CHART_LIGHT_MAX_L) return CHART_COLORS[index];
  if (isDark && L < CHART_DARK_MIN_L) return CHART_COLORS[index];
  return served;
}

/** The ten chart colours: `--chart-1..9` through the luminance filter, then the static lime. */
export function resolveChartPalette(read: ReadToken, isDark: boolean): string[] {
  const slots = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((n, index) => filterChartSlot(read(`--chart-${n}`), index, isDark));
  return [...slots, ...CHART_COLORS.slice(9, 10)];
}

/**
 * COMPRA / VENDI / OK from their chart slots, the lightness clamped (never the same-index fallback
 * of the chart filter: that would lose the theme's hue and can collapse two actions onto one colour).
 */
export function resolveActionColors(read: ReadToken, isDark: boolean): Record<AllocationAction, string> {
  const resolve = (action: AllocationAction): string => {
    const served = read(`--chart-${ACTION_CHART_NUMBER[action]}`);
    return served ? clampActionLightness(served, isDark) : INITIAL_ACTION_COLORS[action];
  };
  return { COMPRA: resolve('COMPRA'), VENDI: resolve('VENDI'), OK: resolve('OK') };
}

/** Every `THEME_HEX_TOKENS` property as `#rrggbb`, `null` when missing or unreadable. */
export function resolveTokenHex(read: ReadToken): Record<string, string | null> {
  return Object.fromEntries(THEME_HEX_TOKENS.map((token) => [token, colorToHex(read(token))]));
}

/** The whole palette from one token reader — what `ChartColorsProvider` computes once per theme. */
export function readThemePalette(read: ReadToken, isDark: boolean): ThemePalette {
  return {
    chartColors: resolveChartPalette(read, isDark),
    actionColors: resolveActionColors(read, isDark),
    tokenHex: resolveTokenHex(read),
  };
}
