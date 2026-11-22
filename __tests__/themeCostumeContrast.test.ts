/**
 * What a costume theme prints on its own ground (DESIGN.md → The Costume Rule, doc/guide/temi.md § Il costume).
 * The four gate tests measure a theme's palette; a costume adds three things they never read — the ground
 * behind `#page-main` (stripes, in light), the eyebrow ink and the ornament — and moves two sign tokens
 * onto a ground that is darker than any card:
 *
 *   - K1: the eyebrow ink ≥ 4,5:1 on `--card`, `--background`, `--muted` and on every opaque `oklch()` of
 *     `--costume-ground` (the page header's label is an eyebrow printed on the ground); `--foreground` and
 *     `--muted-foreground` ≥ 4,5:1 on every opaque ground colour; the ornament ≥ 3:1 on `--card` (a non-text
 *     signal: the cap line, the corner marks).
 *   - K2 (2026-11-22): a `radial-gradient` layer of a ground whose first size is over 2px is a nebula, not a star: it is
 *     composited at its alpha over `--background` (a browser blends on the gamma-encoded values) and is one more
 *     surface of K1 and K3, with its own case for `--foreground`, `--muted-foreground` and the eyebrow.
 *   - K3: `--positive` and `--destructive` ≥ 4,5:1 on those surfaces, each measured on the value the BROWSER
 *     resolves: a light block's own value, else `:root`'s; a dark block's own, else its theme's light block's
 *     (`[data-theme]` has the specificity of `.dark` and comes later, so it beats it), else `.dark`'s.
 *   - G2: `--chart-3` (the slot of COMPRA, `ACTION_CHART_NUMBER`) keeps ≥ 30° of hue from `--destructive`, on
 *     the circle, so a chip that says «compra» never wears the red of a loss.
 *
 * Reads `app/globals.css` itself, over `COSTUME_THEMES`, so a theme that becomes a costume is measured from
 * the day it does. Own oklch → sRGB code, as the sibling gate tests.
 */
import { describe, expect, it } from 'vitest';
import { COSTUME_THEMES, type ColorTheme } from '@/lib/constants/colorTheme';
import { ACTION_CHART_NUMBER } from '@/lib/utils/allocationUtils';
import { DEFAULT_LIGHT_HEADER, themeBlockBody, themeBlockHeader } from './themeBlocks';

type Oklch = readonly [number, number, number];
type Rgb = readonly [number, number, number];
type Mode = 'light' | 'dark';

const MIN_TEXT_CONTRAST = 4.5;
const MIN_NON_TEXT_CONTRAST = 3;
const MIN_HUE_GAP = 30;

const OKLCH = /oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\)/g;

function oklchToLinearSrgb([L, C, H]: Oklch): Rgb {
  const h = (H * Math.PI) / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const clip = (v: number) => Math.min(1, Math.max(0, v));
  return [
    clip(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    clip(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    clip(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ];
}

/** WCAG 2.x relative luminance, from LINEAR-light sRGB (the transfer function is already undone). */
const luminance = ([r, g, b]: Rgb) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

/** A surface is an oklch colour or an already composited linear-sRGB one (the nebula). */
type Surface = Oklch | { readonly linear: Rgb };

const linearOf = (surface: Surface): Rgb => ('linear' in surface ? surface.linear : oklchToLinearSrgb(surface));

function contrast(fg: Oklch, bg: Surface): number {
  const [a, b] = [luminance(oklchToLinearSrgb(fg)), luminance(linearOf(bg))];
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

const toGamma = (v: number) => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);
const toLinear = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);

/** `top` at `alpha` over `base`, blended the way a browser does it: on the gamma-encoded sRGB values. */
function compositeOver(top: Oklch, alpha: number, base: Oklch): { linear: Rgb } {
  const [t, b] = [oklchToLinearSrgb(top).map(toGamma), oklchToLinearSrgb(base).map(toGamma)];
  const blended = t.map((channel, i) => toLinear(alpha * channel + (1 - alpha) * b[i]));
  return { linear: [blended[0], blended[1], blended[2]] };
}

function parseOklchList(text: string): Oklch[] {
  return [...text.matchAll(OKLCH)].map((m) => [Number(m[1]), Number(m[2]), Number(m[3])] as const);
}

function declaration(body: string, name: string): string | null {
  const match = new RegExp(`(?:^|[\\s;{])${name}:\\s*([^;]+);`).exec(body);
  return match ? match[1] : null;
}

function bodyOf(header: string): string {
  const body = themeBlockBody(header);
  expect(body, `block "${header}" in app/globals.css`).not.toBeNull();
  return body!;
}

/** The value a token resolves to in a theme and mode, as the browser's cascade does. */
function resolveToken(theme: ColorTheme, mode: Mode, name: string): Oklch {
  const chain =
    mode === 'light'
      ? [themeBlockHeader(theme, 'light'), DEFAULT_LIGHT_HEADER]
      : [themeBlockHeader(theme, 'dark'), themeBlockHeader(theme, 'light'), themeBlockHeader('default', 'dark')];
  for (const header of chain) {
    const value = declaration(bodyOf(header), name);
    if (value !== null) {
      const [colour] = parseOklchList(value);
      expect(colour, `${name} in "${header}" is not an oklch()`).toBeDefined();
      return colour;
    }
  }
  throw new Error(`${name} is declared nowhere for ${theme} · ${mode}`);
}

/** The scope block's value: the dark block's own, else the light block's (a scope property that does not differ is written once). */
function scopeValue(theme: ColorTheme, mode: Mode, name: string): string {
  const light = `[data-theme="${theme}"] [data-costume-scope]`;
  const dark = `.dark[data-theme="${theme}"] [data-costume-scope]`;
  for (const header of mode === 'dark' ? [dark, light] : [light]) {
    const value = declaration(bodyOf(header), name);
    if (value !== null) return value;
  }
  throw new Error(`${name} is declared in no scope block of ${theme} · ${mode}`);
}

/** The top-level layers of a `background` shorthand: the commas outside any parenthesis. */
function splitLayers(ground: string): string[] {
  const layers: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < ground.length; i++) {
    if (ground[i] === '(') depth++;
    else if (ground[i] === ')') depth--;
    else if (ground[i] === ',' && depth === 0) {
      layers.push(ground.slice(start, i));
      start = i + 1;
    }
  }
  layers.push(ground.slice(start));
  return layers.map((layer) => layer.trim());
}

const ALPHA_OKLCH = /oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\/\s*([\d.]+)%\s*\)/;
/** A star is a speck of two pixels or less; a radial layer whose first size is larger is the nebula. */
const MAX_STAR_SIZE_PX = 2;

/**
 * Where the ground is a haze, not a speck: a `radial-gradient` layer whose first size is over 2px, composited at its
 * alpha over the block's `--background` — the lightest the haze ever gets under a line of text (its centre).
 */
function nebulaColours(theme: ColorTheme, mode: Mode): Array<{ linear: Rgb }> {
  const base = resolveToken(theme, mode, '--background');
  return splitLayers(scopeValue(theme, mode, '--costume-ground'))
    .filter((layer) => layer.startsWith('radial-gradient('))
    .filter((layer) => Number(/([\d.]+)px/.exec(layer)?.[1] ?? 0) > MAX_STAR_SIZE_PX)
    .flatMap((layer) => {
      const match = ALPHA_OKLCH.exec(layer);
      return match ? [compositeOver([Number(match[1]), Number(match[2]), Number(match[3])], Number(match[4]) / 100, base)] : [];
    });
}

/** Every colour the ground paints under a line of text: the opaque ones and the nebula; a `var(--background)` ground is the block's own `--background`. */
function groundColours(theme: ColorTheme, mode: Mode): Surface[] {
  const ground = scopeValue(theme, mode, '--costume-ground');
  const colours: Surface[] = parseOklchList(ground);
  if (ground.includes('var(--background)')) colours.push(resolveToken(theme, mode, '--background'));
  colours.push(...nebulaColours(theme, mode));
  expect(colours.length, `${theme} · ${mode}: the ground names no colour this test can read`).toBeGreaterThan(0);
  return colours;
}

const scopeColour = (theme: ColorTheme, mode: Mode, name: string): Oklch => {
  const [colour] = parseOklchList(scopeValue(theme, mode, name));
  expect(colour, `${theme} · ${mode}: ${name} is not an oklch()`).toBeDefined();
  return colour;
};

const CASES = COSTUME_THEMES.flatMap((theme) => (['light', 'dark'] as const).map((mode) => ({ theme, mode, label: `${theme} · ${mode}` })));

describe('a costume theme is declared', () => {
  it('has at least one costume theme to measure', () => {
    expect(COSTUME_THEMES.length).toBeGreaterThan(0);
  });

  // Without this the nebula cases would pass for a stylesheet that has none (Egeo's ground is a stripe or the page).
  it('has a nebula to measure on at least one ground, and counts a star as no haze', () => {
    expect(CASES.some(({ theme, mode }) => nebulaColours(theme, mode).length > 0)).toBe(true);
    expect(splitLayers('radial-gradient(1px 1px at 12% 18%, oklch(0.95 0.02 230 / 70%) 50%, transparent 51%), oklch(0.13 0.03 260)')).toHaveLength(2);
  });
});

describe.each(CASES)('the costume of $label', ({ theme, mode }) => {
  const surfaces = (): Array<[string, Surface]> => [
    ['--card', resolveToken(theme, mode, '--card')],
    ['--background', resolveToken(theme, mode, '--background')],
    ['--muted', resolveToken(theme, mode, '--muted')],
    ...groundColours(theme, mode).map((colour, i) => [`ground colour ${i + 1}`, colour] as [string, Surface]),
  ];

  it('prints the eyebrow at 4,5:1 on the card, the page, the pill and every colour of the ground', () => {
    const ink = scopeColour(theme, mode, '--costume-eyebrow-color');
    for (const [name, surface] of surfaces()) {
      const ratio = contrast(ink, surface);
      expect(ratio, `the eyebrow on ${name}: ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(MIN_TEXT_CONTRAST);
    }
  });

  it('prints the foreground and the muted foreground at 4,5:1 on every colour of the ground', () => {
    for (const token of ['--foreground', '--muted-foreground']) {
      const ink = resolveToken(theme, mode, token);
      for (const colour of groundColours(theme, mode)) {
        const ratio = contrast(ink, colour);
        expect(ratio, `${token} on a ground colour: ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(MIN_TEXT_CONTRAST);
      }
    }
  });

  it('prints the foreground, the muted foreground and the eyebrow at 4,5:1 on the nebula at its fullest', () => {
    for (const nebula of nebulaColours(theme, mode)) {
      for (const [name, ink] of [
        ['--foreground', resolveToken(theme, mode, '--foreground')],
        ['--muted-foreground', resolveToken(theme, mode, '--muted-foreground')],
        ['the eyebrow', scopeColour(theme, mode, '--costume-eyebrow-color')],
      ] as const) {
        const ratio = contrast(ink, nebula);
        expect(ratio, `${name} on the nebula: ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(MIN_TEXT_CONTRAST);
      }
    }
  });

  it('draws the ornament at 3:1 on the card', () => {
    const ratio = contrast(scopeColour(theme, mode, '--costume-ornament'), resolveToken(theme, mode, '--card'));
    expect(ratio, `the ornament on the card: ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(MIN_NON_TEXT_CONTRAST);
  });

  it.each(['--positive', '--destructive'])('prints %s at 4,5:1 on the card, the page, the pill and every colour of the ground', (token) => {
    const ink = resolveToken(theme, mode, token);
    for (const [name, surface] of surfaces()) {
      const ratio = contrast(ink, surface);
      expect(ratio, `${token} on ${name}: ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(MIN_TEXT_CONTRAST);
    }
  });

  it('keeps COMPRA (--chart-3) 30° of hue from --destructive, so a chip never wears the red of a loss', () => {
    expect(ACTION_CHART_NUMBER.COMPRA).toBe(3);
    const compra = resolveToken(theme, mode, `--chart-${ACTION_CHART_NUMBER.COMPRA}`)[2];
    const loss = resolveToken(theme, mode, '--destructive')[2];
    const gap = Math.min(Math.abs(compra - loss), 360 - Math.abs(compra - loss));
    expect(gap, `COMPRA ${compra}°, destructive ${loss}°`).toBeGreaterThanOrEqual(MIN_HUE_GAP);
  });
});
