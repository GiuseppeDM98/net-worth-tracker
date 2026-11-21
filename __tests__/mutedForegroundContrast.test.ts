/**
 * `--muted-foreground` is the reading line, the eyebrow, every caption and every inactive label
 * of the app, and it is printed on three surfaces: the page (`--background`), a tile (`--card`)
 * and a pill or chip (`--muted`). WCAG AA for body text is 4,5:1 on each.
 *
 * Reads `app/globals.css` itself, like `chartPaletteDistinctness` and `actionColorContrast`, so
 * what is measured is what ships, in every theme block. Written on 2026-10-08, the day the
 * six blocks below the floor were re-pitched (CLAUDE.md § Known Issues since 2026-09-21: the default
 * light theme at 4,34:1 on `bg-muted`, retro-arcade dark at 2,01:1, midnight-bloom at 2,93:1).
 * Seen red before the token change on those six blocks. Since 2026-11-21 the blocks measured are the
 * registry's (`THEME_MODES`, ./themeBlocks), and the stylesheet's own list of theme blocks must be
 * exactly theirs: a theme in `COLOR_THEMES` without CSS, or a block without a registry entry, is red.
 */

import { describe, expect, it } from 'vitest';
import { GLOBALS_CSS, THEME_MODES, themeBlockBody } from './themeBlocks';

type Oklch = [L: number, C: number, H: number];
type Rgb = [r: number, g: number, b: number];

const AA_BODY_TEXT = 4.5;
const SURFACES = ['background', 'card', 'muted'] as const;

/** Every theme block the stylesheet declares, in file order: the default's pair and every `[data-theme]` pair. */
function stylesheetThemeHeaders(): string[] {
  const re = /(?:^|\n)\s*((?::root, \[data-theme="default"\]|:root|\.dark|\[data-theme="[^"]+"\]|\.dark\[data-theme="[^"]+"\]))\s*\{/g;
  const headers: string[] = [];
  for (let m = re.exec(GLOBALS_CSS); m; m = re.exec(GLOBALS_CSS)) headers.push(m[1]);
  return headers;
}

function readOklch(body: string, name: string): Oklch {
  const declaration = new RegExp(`--${name}:\\s*oklch\\(\\s*([\\d.]+)\\s+([\\d.]+)\\s+([\\d.]+)`).exec(body);
  if (!declaration) throw new Error(`--${name} is not an oklch() token in this block`);
  return [Number(declaration[1]), Number(declaration[2]), Number(declaration[3])];
}

/** oklch → linear-light sRGB, clipped to gamut (Björn Ottosson's matrices). */
function oklchToLinearSrgb([L, C, H]: Oklch): Rgb {
  const h = (H * Math.PI) / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ ** 3;
  const m = m_ ** 3;
  const s = s_ ** 3;
  const clip = (v: number) => Math.min(1, Math.max(0, v));
  return [
    clip(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    clip(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    clip(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ];
}

/** WCAG 2.x relative luminance, from LINEAR-light sRGB (the transfer function is already undone). */
function relativeLuminance([r, g, b]: Rgb): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(fg: Oklch, bg: Oklch): number {
  const a = relativeLuminance(oklchToLinearSrgb(fg));
  const b = relativeLuminance(oklchToLinearSrgb(bg));
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

describe('--muted-foreground across every theme block', () => {
  it('finds in globals.css exactly the theme blocks of the registry', () => {
    expect([...stylesheetThemeHeaders()].sort()).toEqual(THEME_MODES.map(({ header }) => header).sort());
  });

  it.each(THEME_MODES)('$label: ≥ 4,5:1 on --background, --card and --muted', ({ header }) => {
    const block = themeBlockBody(header);
    expect(block, `block "${header}" in app/globals.css`).not.toBeNull();
    const body = block!;
    const ink = readOklch(body, 'muted-foreground');
    const ratios = Object.fromEntries(
      SURFACES.map((surface) => [surface, Number(contrastRatio(ink, readOklch(body, surface)).toFixed(2))]),
    );
    for (const surface of SURFACES) {
      expect(ratios[surface], `on --${surface} (${JSON.stringify(ratios)})`).toBeGreaterThanOrEqual(AA_BODY_TEXT);
    }
  });
});
