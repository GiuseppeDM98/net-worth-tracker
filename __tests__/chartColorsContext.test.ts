/**
 * The palette `ChartColorsProvider` hands to every chart (PERF-14, 2026-10-08) — and the luminance
 * filter inside it, which was INERT until that day.
 *
 * The provider and the hooks' no-provider fallback (the landing) run the same reader,
 * `useThemePaletteReader`, which runs the same pure `readThemePalette` on `<html>`'s computed style:
 * the palette is therefore the same with or without the provider by construction, and the cases
 * below exercise that one function on a fake `getPropertyValue` that answers what Chrome answers —
 * `lab(…)` or `#rrggbb`, never the `oklch(…)` the stylesheet holds (AGENTS.md § Layout and Color
 * Tokens). The vitest environment has no DOM to render the hooks in.
 *
 * Seen red (2026-10-08): `filterChartSlot` put back on the old `/oklch\(\s*([\d.]+)/` reader turns
 * the three «falls back» cases red — the filter never fires on a served string — and leaves the
 * pass-through cases green.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CHART_COLORS } from '@/lib/constants/colors';
import { SPENDING_ROLE_TOKEN } from '@/lib/constants/spendingRoleColors';
import { clampActionLightness } from '@/lib/utils/actionColor';
import { cssColorToOklch, oklchToHex, parseToOklch, type Triple } from '@/lib/utils/colorParse';
import { colorToHex } from '@/lib/utils/cssColorToHex';
import {
  CHART_DARK_MIN_L,
  CHART_LIGHT_MAX_L,
  INITIAL_THEME_PALETTE,
  THEME_HEX_TOKENS,
  readThemePalette,
  resolveChartPalette,
  type ReadToken,
} from '@/lib/utils/themePalette';

/** A computed style that answers `values[property]`, `''` for anything undeclared. */
const servedStyle = (values: Record<string, string>): ReadToken => (property) => values[property] ?? '';

/**
 * Nine in-band slots in the two forms Chrome serves. `--chart-3` is the real one (the default theme's
 * light amber, read on the dev server on 2026-08-30); the others are invented values of the same kind.
 */
const SERVED_LIGHT = {
  '--chart-1': 'lab(46.9% 12.4 -64.2)',
  '--chart-2': 'lab(55.2% -45.1 18.3)',
  '--chart-3': 'lab(64.8793% 25.0679 78.4211)',
  '--chart-4': 'lab(48.1% 38.2 -52.7)',
  '--chart-5': 'lab(57.3% 48.6 33.9)',
  '--chart-6': '#a78a1c',
  '--chart-7': '#1b8a8a',
  '--chart-8': '#c0437a',
  '--chart-9': 'lab(52% 20 -40)',
};

describe('readThemePalette — the chart slots as the browser serves them', () => {
  it('keeps a served lab() slot verbatim — no /^oklch\\(/ anywhere on the way', () => {
    const palette = resolveChartPalette(servedStyle(SERVED_LIGHT), false);
    expect(palette[2]).toBe('lab(64.8793% 25.0679 78.4211)');
    expect(palette.slice(0, 9)).toEqual(Object.values(SERVED_LIGHT));
  });

  it('pads index 9 from the static palette and falls back per slot when a token is undeclared', () => {
    const palette = resolveChartPalette(servedStyle({ '--chart-1': 'lab(46.9% 12.4 -64.2)' }), false);
    expect(palette).toHaveLength(10);
    expect(palette[0]).toBe('lab(46.9% 12.4 -64.2)');
    expect(palette.slice(1)).toEqual(CHART_COLORS.slice(1, 10));
  });

  it('falls back to the static colour at its index when a served lab() slot is too light for a light page', () => {
    const tooLight = 'lab(93% 2 10)';
    expect(cssColorToOklch(tooLight)![0]).toBeGreaterThan(CHART_LIGHT_MAX_L);
    const palette = resolveChartPalette(servedStyle({ ...SERVED_LIGHT, '--chart-5': tooLight }), false);
    expect(palette[4]).toBe(CHART_COLORS[4]);
    expect(palette[3]).toBe(SERVED_LIGHT['--chart-4']);
  });

  it('falls back when a served #hex slot is too light — the form Lightning CSS gives an sRGB colour', () => {
    const tooLight = '#f4ece0';
    expect(cssColorToOklch(tooLight)![0]).toBeGreaterThan(CHART_LIGHT_MAX_L);
    const palette = resolveChartPalette(servedStyle({ ...SERVED_LIGHT, '--chart-6': tooLight }), false);
    expect(palette[5]).toBe(CHART_COLORS[5]);
  });

  it('falls back when a served slot is too dark for a dark page, and keeps the same slot in light', () => {
    const tooDark = 'lab(12% 8 -20)';
    expect(cssColorToOklch(tooDark)![0]).toBeLessThan(CHART_DARK_MIN_L);
    const read = servedStyle({ ...SERVED_LIGHT, '--chart-1': tooDark });
    expect(resolveChartPalette(read, true)[0]).toBe(CHART_COLORS[0]);
    expect(resolveChartPalette(read, false)[0]).toBe(tooDark);
  });

  it('passes a form it cannot measure through unfiltered, never inventing a colour', () => {
    const unmodelled = 'color(display-p3 0.98 0.95 0.9)';
    expect(cssColorToOklch(unmodelled)).toBeNull();
    expect(resolveChartPalette(servedStyle({ ...SERVED_LIGHT, '--chart-2': unmodelled }), false)[1]).toBe(unmodelled);
  });
});

describe('readThemePalette — the action colours and the Sankey hexes from the same read', () => {
  it('clamps COMPRA / VENDI / OK from their slots exactly as clampActionLightness does', () => {
    const { actionColors } = readThemePalette(servedStyle(SERVED_LIGHT), false);
    // ACTION_CHART_NUMBER: COMPRA → 3, VENDI → 5, OK → 2 (lib/utils/allocationUtils.ts)
    expect(actionColors.COMPRA).toBe(clampActionLightness(SERVED_LIGHT['--chart-3'], false));
    expect(actionColors.VENDI).toBe(clampActionLightness(SERVED_LIGHT['--chart-5'], false));
    expect(actionColors.OK).toBe(clampActionLightness(SERVED_LIGHT['--chart-2'], false));
  });

  it('keeps the initial action colours while the slots are undeclared', () => {
    expect(readThemePalette(servedStyle({}), true).actionColors).toEqual(INITIAL_THEME_PALETTE.actionColors);
  });

  it('resolves the five --role-* aliases to the hex colorToHex gives the same served tokens', () => {
    const served = {
      '--role-need': 'lab(46.9% 12.4 -64.2)',
      '--role-want': 'lab(48.1% 38.2 -52.7)',
      '--role-saving': '#2899ca',
      '--role-unclassified': 'lab(55% 0 0)',
      '--role-deficit': 'lab(52% 68 52)',
    };
    const { tokenHex } = readThemePalette(servedStyle(served), false);
    expect(THEME_HEX_TOKENS).toEqual(Object.values(SPENDING_ROLE_TOKEN));
    for (const [token, value] of Object.entries(served)) expect(tokenHex[token]).toBe(colorToHex(value));
  });

  it('starts every hex token at null, so a hook with the provider mounted never reads the DOM itself', () => {
    expect(Object.keys(INITIAL_THEME_PALETTE.tokenHex)).toEqual([...THEME_HEX_TOKENS]);
    expect(Object.values(INITIAL_THEME_PALETTE.tokenHex).every((hex) => hex === null)).toBe(true);
  });
});

// ─── The twelve theme blocks: the live filter changes no palette shipped today ─────────────────

const GLOBALS = readFileSync(resolve(__dirname, '../app/globals.css'), 'utf8');
const THEMES = [null, 'retro-arcade', 'cyberpunk', 'solar-dusk', 'elegant-luxury', 'midnight-bloom'] as const;

/** The `--chart-1..9` of one block as authored. */
function authoredSlots(selector: string): Triple[] {
  const start = GLOBALS.indexOf(`\n${selector} {`);
  expect(start, `block "${selector}"`).toBeGreaterThan(-1);
  const block = GLOBALS.slice(start, GLOBALS.indexOf('\n}', start));
  return Array.from({ length: 9 }, (_, i) => {
    const match = block.match(new RegExp(`--chart-${i + 1}:\\s*(oklch\\([^)]*\\))`));
    expect(match, `--chart-${i + 1} in "${selector}"`).not.toBeNull();
    return parseToOklch(match![1])!;
  });
}

/**
 * What the browser serves for an authored slot: the build writes an sRGB colour as `#rrggbb` — 8 bits
 * a channel, so its lightness moves by up to a few thousandths — and anything else as `lab()`, whose
 * four decimals keep it. The hex is the form that can push a slot across the band.
 */
function servedForm(oklch: Triple): string {
  const hex = oklchToHex(oklch);
  const roundTrip = cssColorToOklch(hex)!;
  const inGamut = Math.abs(roundTrip[0] - oklch[0]) < 0.01 && Math.abs(roundTrip[1] - oklch[1]) < 0.01;
  return inGamut ? hex : `oklch(${oklch.join(' ')})`;
}

describe.each(
  THEMES.flatMap((theme) => [
    { label: `${theme ?? 'default'} · light`, selector: theme ? `[data-theme="${theme}"]` : ':root', isDark: false },
    { label: `${theme ?? 'default'} · dark`, selector: theme ? `.dark[data-theme="${theme}"]` : '.dark', isDark: true },
  ]),
)('the live luminance filter on $label', ({ selector, isDark }) => {
  it('keeps every served slot: no colour of the shipped palettes falls back to the static one', () => {
    const served = Object.fromEntries(authoredSlots(selector).map((oklch, i) => [`--chart-${i + 1}`, servedForm(oklch)]));
    expect(resolveChartPalette(servedStyle(served), isDark).slice(0, 9)).toEqual(Object.values(served));
  });
});
