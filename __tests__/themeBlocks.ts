/**
 * The theme blocks of `app/globals.css`, derived from the registry (`COLOR_THEMES`) — a helper the
 * four gate tests share (chartPaletteDistinctness, actionColorContrast, chartColorsContext,
 * mutedForegroundContrast), not a test. A theme added to the list is measured by all four, and a
 * name with no CSS turns all four red (doc/guide/temi.md § Adding a theme).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { COLOR_THEMES, DEFAULT_COLOR_THEME, type ColorTheme } from '@/lib/constants/colorTheme';

export const GLOBALS_CSS = readFileSync(resolve(__dirname, '../app/globals.css'), 'utf8');

/** The default theme's light block also answers `[data-theme="default"]`, so a swatch can apply it to a `div`. */
export const DEFAULT_LIGHT_HEADER = ':root, [data-theme="default"]';

export function themeBlockHeader(theme: ColorTheme, mode: 'light' | 'dark'): string {
  if (theme === DEFAULT_COLOR_THEME) return mode === 'light' ? DEFAULT_LIGHT_HEADER : '.dark';
  return mode === 'light' ? `[data-theme="${theme}"]` : `.dark[data-theme="${theme}"]`;
}

/** The body of one block, `null` when the stylesheet has none. */
export function themeBlockBody(header: string): string | null {
  const start = GLOBALS_CSS.indexOf(`\n${header} {`);
  return start === -1 ? null : GLOBALS_CSS.slice(start, GLOBALS_CSS.indexOf('\n}', start));
}

export const THEME_MODES = COLOR_THEMES.flatMap((theme) =>
  (['light', 'dark'] as const).map((mode) => ({
    theme,
    mode,
    label: `${theme} · ${mode}`,
    header: themeBlockHeader(theme, mode),
  })),
);
