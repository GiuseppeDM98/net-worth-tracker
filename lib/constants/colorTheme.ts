/**
 * The colour theme's storage key, DOM attribute and closed list of names — ONE module, without
 * `'use client'`, because two worlds read them: `contexts/ColorThemeContext.tsx` (the client store)
 * and `app/layout.tsx`, a Server Component that inlines the pre-hydration script below. A value
 * imported from a client module into a Server Component is a client reference, not the string
 * (PERF-02).
 *
 * WARNING: adding a theme also means the CSS blocks in `app/globals.css`, `COLOR_THEME_SWATCHES` in
 * `app/dashboard/settings/page.tsx` and `__tests__/chartPaletteDistinctness.test.ts` (doc/guide/temi.md).
 */

export const COLOR_THEME_STORAGE_KEY = 'color-theme';
export const COLOR_THEME_ATTRIBUTE = 'data-theme';

export const COLOR_THEMES = [
  'default',
  'solar-dusk',
  'elegant-luxury',
  'midnight-bloom',
  'cyberpunk',
  'retro-arcade',
] as const;

export type ColorTheme = (typeof COLOR_THEMES)[number];

/** `'default'` is the `:root` block: no attribute on `<html>`. */
export const DEFAULT_COLOR_THEME: ColorTheme = 'default';

export function isColorTheme(value: unknown): value is ColorTheme {
  return typeof value === 'string' && (COLOR_THEMES as readonly string[]).includes(value);
}

/** The themes that put an attribute on `<html>`: every one but the default. */
const ATTRIBUTE_THEMES = COLOR_THEMES.filter((theme) => theme !== DEFAULT_COLOR_THEME);

/**
 * The script `app/layout.tsx` inlines in `<head>`, so the stored theme is on `<html>` before the
 * first paint — the way next-themes puts `.dark` there. Without it the shell, now in the
 * prerendered HTML, would paint the default palette and switch to the reader's theme only after
 * hydration (the `useEffect` in `ColorThemeProvider`). It is a plain function so it runs before
 * any module loads; it reads only its own key, accepts only a name from the list, and swallows a
 * `localStorage` that throws (a sandboxed frame) — a storage failure is not a reason to fail the page.
 */
export const COLOR_THEME_INIT_SCRIPT =
  '(function(){try{' +
  `var theme=localStorage.getItem(${JSON.stringify(COLOR_THEME_STORAGE_KEY)});` +
  `if(theme&&${JSON.stringify(ATTRIBUTE_THEMES)}.indexOf(theme)!==-1)` +
  `document.documentElement.setAttribute(${JSON.stringify(COLOR_THEME_ATTRIBUTE)},theme)` +
  '}catch(e){}})()';
