/**
 * The costume contract's names (DESIGN.md → The Costume Rule; doc/guide/temi.md § Il costume): the
 * custom properties a costume theme declares in its scope blocks, and the emblems it may draw beside a
 * page's name. A palette theme declares none of them and draws no emblem. A type import only, so
 * this module is safe on the server and in the node tests.
 */
import type { ColorTheme } from '@/lib/constants/colorTheme';

/**
 * Every property a costume theme declares in `[data-theme="<id>"] [data-costume-scope]` (the ones that
 * differ in dark go in `.dark[data-theme="<id>"] [data-costume-scope]`), in the guide's order. Each one's
 * «off» value — what a palette theme paints — is in doc/guide/temi.md § Il costume.
 */
export const COSTUME_SCOPE_PROPERTIES = [
  '--radius',
  '--radius-2xl',
  '--costume-ground',
  '--costume-ornament',
  '--costume-tile-image',
  '--costume-tile-image-position',
  '--costume-tile-image-size',
  '--costume-tile-shadow',
  '--costume-heading-font',
  '--costume-heading-weight',
  '--costume-heading-tracking',
  '--costume-heading-case',
  '--costume-heading-size',
  '--costume-eyebrow-color',
  '--costume-eyebrow-weight',
  '--costume-header-band',
  '--costume-header-band-height',
  '--costume-primary-glow',
  '--costume-control-frame-radius',
  '--costume-control-pill-radius',
  '--costume-control-chip-radius',
  '--costume-control-switch-on',
] as const;

// The four control properties are read ONLY through a `var()` whose fallback is today's value: «off» is `initial`,
// guaranteed-invalid, so the fallback applies — a bare `var()` would make the declaration invalid (radius 0).
/** `rounded-full` unless a costume squares its pills (temi.md § Il costume). Same computed value as today. */
export const COSTUME_PILL_RADIUS_CLASS = 'rounded-[var(--costume-control-pill-radius,calc(infinity*1px))]';
/** `rounded-xl` unless a costume gives a card-like box the tile's radius. */
export const COSTUME_FRAME_RADIUS_CLASS = 'rounded-[var(--costume-control-frame-radius,calc(var(--radius)_+_4px))]';

export type EmblemPage =
  | 'panoramica'
  | 'patrimonio'
  | 'cashflow'
  | 'analisi'
  | 'rendimenti'
  | 'allocazione'
  | 'storico'
  | 'previdenza'
  | 'fire'
  | 'hall-of-fame'
  | 'assistente'
  | 'impostazioni';

export type EmblemTone = 'ornament' | 'primary' | 'eyebrow';

export type EmblemShape =
  | { kind: 'path'; d: string; tone: EmblemTone; strokeWidth: number }
  | { kind: 'circle'; cx: number; cy: number; r: number; tone: EmblemTone; strokeWidth: number }
  | { kind: 'ellipse'; cx: number; cy: number; rx: number; ry: number; rotate: number; tone: EmblemTone; strokeWidth: number };

export interface EmblemArt {
  viewBox: string;
  shapes: readonly EmblemShape[];
}

/** A theme's emblem for every page, and the ones a page has of its own. */
export interface ThemeEmblems {
  fallback: EmblemArt;
  pages: Partial<Record<EmblemPage, EmblemArt>>;
}

/** An emblem's stroke is a token of the scope, never a literal (The Data Owns Color Rule). */
export const EMBLEM_TONE_COLOR: Record<EmblemTone, string> = {
  ornament: 'var(--costume-ornament)',
  primary: 'var(--primary)',
  eyebrow: 'var(--costume-eyebrow-color)',
};

/** A pediment on four columns: the Egeo costume's mark (decorative, DESIGN.md → The Costume Rule). */
const EGEO_TEMPLE: EmblemArt = {
  viewBox: '0 0 22 22',
  shapes: [{ kind: 'path', d: 'M2 8 L11 2 L20 8 M4 8 V18 M8 8 V18 M14 8 V18 M18 8 V18 M2 20 H20', tone: 'ornament', strokeWidth: 1.6 }],
};

/** An amphora, its two handles: Egeo's mark on Patrimonio (decorative, DESIGN.md → The Costume Rule). */
const EGEO_AMPHORA: EmblemArt = {
  viewBox: '0 0 22 22',
  shapes: [{ kind: 'path', d: 'M8 2 H14 M9 2 V5 M13 2 V5 M9 5 C4 7 4 14 8 18 H14 C18 14 18 7 13 5 M9 20 H13 '
    + 'M10 18 V20 M12 18 V20 M9 3.5 C6 4 5.5 7 7 9 M13 3.5 C16 4 16.5 7 15 9', tone: 'ornament', strokeWidth: 1.6 }],
};

/** Two waves: Egeo's mark on Cashflow, every tab (decorative, DESIGN.md → The Costume Rule). */
const EGEO_WAVES: EmblemArt = {
  viewBox: '0 0 22 22',
  shapes: [{ kind: 'path', d: 'M2 9 C4 6 6 6 7 9 C8 12 10 12 11 9 C12 6 14 6 15 9 C16 12 18 12 20 9 '
    + 'M2 15 C4 12 6 12 7 15 C8 18 10 18 11 15 C12 12 14 12 15 15 C16 18 18 18 20 15', tone: 'ornament',
    strokeWidth: 1.6 }],
};

/** A planet with a tilted ring: the Orbita costume's mark (decorative, DESIGN.md → The Costume Rule). */
const ORBITA_PLANET: EmblemArt = {
  viewBox: '0 0 22 22',
  shapes: [
    { kind: 'circle', cx: 11, cy: 11, r: 5, tone: 'primary', strokeWidth: 1.6 },
    { kind: 'ellipse', cx: 11, cy: 11, rx: 10, ry: 3.6, rotate: -24, tone: 'eyebrow', strokeWidth: 1.3 },
  ],
};

/** Filled by each costume theme: one mark for every page, and the pages that have their own (Egeo, 2026-11-22). */
export const THEME_EMBLEMS: Partial<Record<ColorTheme, ThemeEmblems>> = {
  egeo: { fallback: EGEO_TEMPLE, pages: { patrimonio: EGEO_AMPHORA, cashflow: EGEO_WAVES } },
  orbita: { fallback: ORBITA_PLANET, pages: {} },
};

/** The art beside a page's name: none out of scope (the landing, the access pages), the page's own over the theme's. */
export function resolveEmblem(
  theme: ColorTheme,
  page: EmblemPage | undefined,
  inScope: boolean,
  emblems: Partial<Record<ColorTheme, ThemeEmblems>> = THEME_EMBLEMS,
): EmblemArt | null {
  if (!inScope) return null;
  const set = emblems[theme];
  return set ? (page && set.pages[page]) || set.fallback : null;
}
