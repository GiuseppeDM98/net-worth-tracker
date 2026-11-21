/**
 * The colour theme's storage key, DOM attribute and closed list of names — ONE module, without
 * `'use client'`, because two worlds read them: `contexts/ColorThemeContext.tsx` (the client store)
 * and `app/layout.tsx`, a Server Component that inlines the pre-hydration script below. A value
 * imported from a client module into a Server Component is a client reference, not the string
 * (the shell is in the prerendered HTML since 2026-09-28).
 *
 * WARNING: adding a theme means its CSS blocks in `app/globals.css` and its `COLOR_THEME_META`
 * entry; the gate tests and the swatches derive from here (doc/guide/temi.md § Adding a theme).
 */

export const COLOR_THEME_STORAGE_KEY = 'color-theme';
export const COLOR_THEME_ATTRIBUTE = 'data-theme';
/** On `<html>` when the active theme has a costume: it gates every costume rule (DESIGN.md → The Costume Rule). */
export const COSTUME_ATTRIBUTE = 'data-costume';

export const COLOR_THEMES = [
  'default',
  'solar-dusk',
  'elegant-luxury',
  'midnight-bloom',
  'cyberpunk',
  'retro-arcade',
] as const;

export type ColorTheme = (typeof COLOR_THEMES)[number];

/**
 * What a costume theme draws with React; every other mechanism — the header band too — is a token of its scope
 * blocks. `resourceBar`: the Panoramica's four-figure bar, at ≥ 1440 only (owner, 2026-11-12).
 */
export interface ThemeCostume {
  resourceBar: boolean;
}

/** `costume: null` = a palette theme: colours and radius only (DESIGN.md → The Costume Rule). */
export interface ColorThemeMeta {
  name: string;
  description: string;
  costume: ThemeCostume | null;
}

/** The one source of a theme's name, description and costume: a theme in `COLOR_THEMES` without an entry fails `tsc`. */
export const COLOR_THEME_META: Record<ColorTheme, ColorThemeMeta> = {
  default: { name: 'Default', description: 'Zinc classico', costume: null },
  'solar-dusk': { name: 'Solar Dusk', description: 'Ambra calda', costume: null },
  'elegant-luxury': { name: 'Elegant Luxury', description: 'Borgogna raffinato', costume: null },
  'midnight-bloom': { name: 'Midnight Bloom', description: 'Viola profondo', costume: null },
  cyberpunk: { name: 'Cyberpunk', description: 'Neon pink & teal', costume: null },
  'retro-arcade': { name: 'Retro Arcade', description: 'Rosso & teal vintage', costume: null },
};

/** `'default'` is the `:root` block: no attribute on `<html>`. */
export const DEFAULT_COLOR_THEME: ColorTheme = 'default';

export function isColorTheme(value: unknown): value is ColorTheme {
  return typeof value === 'string' && (COLOR_THEMES as readonly string[]).includes(value);
}

/** The themes that put an attribute on `<html>`: every one but the default. */
const ATTRIBUTE_THEMES = COLOR_THEMES.filter((theme) => theme !== DEFAULT_COLOR_THEME);

/** The themes that also put `data-costume` on `<html>`. */
export const COSTUME_THEMES = COLOR_THEMES.filter((theme) => COLOR_THEME_META[theme].costume !== null);

/**
 * The script `app/layout.tsx` inlines in `<head>`, so the stored theme is on `<html>` before the
 * first paint — the way next-themes puts `.dark` there. Without it the shell, now in the
 * prerendered HTML, would paint the default palette and switch to the reader's theme only after
 * hydration (the `useEffect` in `ColorThemeProvider`). It is a plain function so it runs before
 * any module loads; it reads only its own key, accepts only a name from the list, and swallows a
 * `localStorage` that throws (a sandboxed frame) — a storage failure is not a reason to fail the page.
 * A costume theme also gets `data-costume`, so its rules are on before the first paint too.
 * Exported for the VM test: the script with the lists it is given.
 */
export function buildColorThemeInitScript(attributeThemes: readonly string[], costumeThemes: readonly string[]): string {
  return (
    '(function(){try{' +
    `var theme=localStorage.getItem(${JSON.stringify(COLOR_THEME_STORAGE_KEY)});` +
    `if(theme&&${JSON.stringify(attributeThemes)}.indexOf(theme)!==-1){` +
    `document.documentElement.setAttribute(${JSON.stringify(COLOR_THEME_ATTRIBUTE)},theme);` +
    `if(${JSON.stringify(costumeThemes)}.indexOf(theme)!==-1)` +
    `document.documentElement.setAttribute(${JSON.stringify(COSTUME_ATTRIBUTE)},'')}` +
    '}catch(e){}})()'
  );
}

export const COLOR_THEME_INIT_SCRIPT = buildColorThemeInitScript(ATTRIBUTE_THEMES, COSTUME_THEMES);
