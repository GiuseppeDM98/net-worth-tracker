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
] as const;

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

/** Filled by each costume theme: one temple for every page (a page's own art is a later addition). */
export const THEME_EMBLEMS: Partial<Record<ColorTheme, ThemeEmblems>> = {
  egeo: { fallback: EGEO_TEMPLE, pages: {} },
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
