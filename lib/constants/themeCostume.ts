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
  '--costume-page-generated-fill',
] as const;

// The four control properties and the generated fill are read ONLY through a `var()` whose fallback is today's value: «off» is `initial`,
// guaranteed-invalid, so the fallback applies — a bare `var()` would make the declaration invalid (radius 0).
/** `rounded-full` unless a costume squares its pills (temi.md § Il costume). Same computed value as today. */
export const COSTUME_PILL_RADIUS_CLASS = 'rounded-[var(--costume-control-pill-radius,calc(infinity*1px))]';
/** `rounded-xl` unless a costume gives a card-like box the tile's radius. */
export const COSTUME_FRAME_RADIUS_CLASS = 'rounded-[var(--costume-control-frame-radius,calc(var(--radius)_+_4px))]';
/** `bg-muted/40` unless a costume needs the card for the AI accent's 4.5:1 (DESIGN.md → The AI-Accent Rule). */
export const COSTUME_GENERATED_FILL_CLASS =
  'bg-[color:var(--costume-page-generated-fill,color-mix(in_oklab,var(--muted)_40%,transparent))]';

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

/** One Egeo mark for a page, as every other: a single stroked ornament on the 22 × 22 box. */
const egeoMark = (d: string): EmblemArt => ({ viewBox: '0 0 22 22', shapes: [{ kind: 'path', d, tone: 'ornament', strokeWidth: 1.6 }] });

/** A balance: Egeo's mark on Analisi. */
const EGEO_BALANCE = egeoMark('M11 3 V19 M7 19 H15 M4 6 H18 M4 6 L2 12 H6 Z M18 6 L16 12 H20 Z');
/** A laurel branch: Rendimenti. */
const EGEO_LAUREL = egeoMark('M6 19 C9 15 11 10 12 3 M9 15 C7 15 5 13 5 11 C7 11 9 13 9 15 M11 10 C9 9 8 7 9 5 C11 6 11 8 11 10');
/** A scroll: Storico. */
const EGEO_SCROLL = egeoMark(
  'M5 4 H15 C17 4 17 7 15 7 H5 M5 4 C3 4 3 7 5 7 M7 7 V18 M13 7 V18 M5 18 H15 C17 18 17 21 15 21 H5 C3 21 3 18 5 18',
);
/** A meander: Allocazione, and the paths that belong to it. */
const EGEO_MEANDER = egeoMark('M3 19 V3 H19 V15 H7 V7 H15 V11 H11');
/** A round shield, two circles on one centre: Previdenza. */
const EGEO_SHIELD: EmblemArt = {
  viewBox: '0 0 22 22',
  shapes: [
    { kind: 'circle', cx: 11, cy: 11, r: 8, tone: 'ornament', strokeWidth: 1.6 },
    { kind: 'circle', cx: 11, cy: 11, r: 3, tone: 'ornament', strokeWidth: 1.6 },
  ],
};
/** A flame: FIRE. */
const EGEO_FLAME = egeoMark('M11 3 C14 7 16 10 14 13 C16 12 17 14 16 16 C15 19 7 19 6 16 C5 13 8 9 11 3 M9 20 H13');
/** A wreath: Hall of Fame. */
const EGEO_WREATH = egeoMark(
  'M7 19 C2 15 2 7 7 3 M15 19 C20 15 20 7 15 3 M5 15 L3 14 M4 11 L2 10 M5 7 L3 6 M17 15 L19 14 M18 11 L20 10 M17 7 L19 6',
);
/** An oil lamp: the Assistente. */
const EGEO_LAMP = egeoMark('M3 12 H14 C16 12 18 11 20 9 C19 13 17 17 11 17 C7 17 4 15 3 12 Z M11 12 C11 10 12 9 11 7');
/** A column: Impostazioni. */
const EGEO_COLUMN = egeoMark(
  'M6 4 H16 M6 4 C4 4 4 7 6 7 M16 4 C18 4 18 7 16 7 M6 7 H16 M8 7 V18 M11 7 V18 M14 7 V18 M6 18 H16 M5 20 H17',
);

/** A planet with a tilted ring: the Orbita costume's mark (decorative, DESIGN.md → The Costume Rule). */
const ORBITA_PLANET: EmblemArt = {
  viewBox: '0 0 22 22',
  shapes: [
    { kind: 'circle', cx: 11, cy: 11, r: 5, tone: 'primary', strokeWidth: 1.6 },
    { kind: 'ellipse', cx: 11, cy: 11, rx: 10, ry: 3.6, rotate: -24, tone: 'eyebrow', strokeWidth: 1.3 },
  ],
};

/**
 * Filled by each costume theme: one mark for every page, and the pages that have their own — in Egeo every page
 * but the Panoramica, which keeps the temple (2026-11-23); Orbita draws the planet everywhere.
 */
export const THEME_EMBLEMS: Partial<Record<ColorTheme, ThemeEmblems>> = {
  egeo: {
    fallback: EGEO_TEMPLE,
    pages: {
      patrimonio: EGEO_AMPHORA,
      cashflow: EGEO_WAVES,
      analisi: EGEO_BALANCE,
      rendimenti: EGEO_LAUREL,
      storico: EGEO_SCROLL,
      allocazione: EGEO_MEANDER,
      previdenza: EGEO_SHIELD,
      fire: EGEO_FLAME,
      'hall-of-fame': EGEO_WREATH,
      assistente: EGEO_LAMP,
      impostazioni: EGEO_COLUMN,
    },
  },
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
