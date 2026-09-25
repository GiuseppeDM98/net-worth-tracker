/**
 * COMPRA / VENDI / OK are chart slots promoted to TEXT, and text has a different floor.
 *
 * `useActionColors` resolves the three actions from `--chart-3 / --chart-5 / --chart-2` of the
 * active theme. Allocazione then prints them as an `ActionChip` label at 10px/600, as the Piano's
 * amounts at 18px/600 and as the Per classe gap column at 13px — none of which is WCAG large text
 * (24px, or 18.66px at ≥700), so the floor is **4.5:1**, not the ~3:1 a chart slot is pitched to
 * against a plot area.
 *
 * Nothing enforced that until 2026-09-21, when the Impeccable critique of Allocazione measured
 * thirteen failing samples on the DEFAULT light palette: the COMPRA chip at 2,39:1, OK at 3,07:1,
 * VENDI at 3,33:1, and the Piano's «+5000 €» at 2,74:1 on the flat card. The old clamp fired
 * only above L 0.72 — above every value in the palette — and its target was L 0.62, exactly
 * VENDI's own lightness, so even a clamped colour would still have failed.
 *
 * Two surfaces are measured because the chip is the harder one: its background is
 * `color-mix(in srgb, <colour> ACTION_CHIP_FILL_PCT%, transparent)` over the card — the card washed
 * with the text's OWN hue, which always pulls the background's luminance towards the text's. That
 * fill was 14% and is 8%: at 14% the same clamp left the worst block at 4,06:1.
 *
 * Reads `app/globals.css` itself, like `chartPaletteDistinctness`, so what is measured is what
 * ships — never a transcription that can drift.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ACTION_CHART_NUMBER, ACTION_CHIP_FILL_PCT, ACTION_LIGHT_MAX_L, type AllocationAction } from '@/lib/utils/allocationUtils';
import { clampActionLightness, parseToOklch } from '@/lib/utils/actionColor';

// ─── OKLCH → sRGB → relative luminance ────────────────────────────────────────

type Oklch = readonly [number, number, number];
type Rgb = readonly [number, number, number];

function oklchToLinearSrgb([L, C, H]: Oklch): Rgb {
  const h = (H * Math.PI) / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

/** Linear-light sRGB, clipped to the gamut: a colour outside it is painted at the edge. */
const clip = ([r, g, b]: Rgb): Rgb => [Math.min(1, Math.max(0, r)), Math.min(1, Math.max(0, g)), Math.min(1, Math.max(0, b))];

/** WCAG 2.x relative luminance, from LINEAR-light sRGB (the transfer function is already undone). */
function relativeLuminance([r, g, b]: Rgb): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(fg: Rgb, bg: Rgb): number {
  const [a, b] = [relativeLuminance(fg), relativeLuminance(bg)];
  const [light, dark] = a >= b ? [a, b] : [b, a];
  return (light + 0.05) / (dark + 0.05);
}

/**
 * `color-mix(in srgb, <colour> <pct>%, transparent)` composited over `backdrop`.
 *
 * The mix produces the colour at alpha = pct, and `srcOver` then lays it on the card. sRGB mixing
 * is specified on the ENCODED channels, so the operands are encoded, mixed and decoded again —
 * compositing in linear light would flatter the result by a few hundredths.
 */
function chipBackground(colour: Rgb, pct: number, backdrop: Rgb): Rgb {
  const encode = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
  const decode = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const alpha = pct / 100;
  return clip(colour).map((channel, i) => {
    const mixed = encode(channel) * alpha; // over transparent black, premultiplied
    const over = mixed + encode(clip(backdrop)[i]) * (1 - alpha);
    return decode(over);
  }) as unknown as Rgb;
}

// ─── The stylesheet ───────────────────────────────────────────────────────────

const GLOBALS = readFileSync(resolve(__dirname, '../app/globals.css'), 'utf8');

function blockOf(selector: string): string {
  const start = GLOBALS.indexOf(`\n${selector} {`);
  expect(start, `block "${selector}" in app/globals.css`).toBeGreaterThan(-1);
  return GLOBALS.slice(start, GLOBALS.indexOf('\n}', start));
}

function oklchToken(block: string, name: string): Oklch {
  const match = block.match(new RegExp(`${name}:\\s*oklch\\(([\\d.]+)\\s+([\\d.]+)\\s+([\\d.]+)\\)`));
  expect(match, `${name} in the block`).not.toBeNull();
  return [Number(match![1]), Number(match![2]), Number(match![3])] as const;
}

/**
 * The clamp the PAGE runs, not a re-implementation of it: the whole defect of 2026-09-21 was a
 * clamp that silently did nothing, and a test carrying its own copy of the rule would have stayed
 * green through it.
 */
function clampLightness([L, C, H]: Oklch, isDark: boolean): Oklch {
  const clamped = parseToOklch(clampActionLightness(`oklch(${L} ${C} ${H})`, isDark));
  expect(clamped, 'the clamp returned a colour the parser cannot read back').not.toBeNull();
  return clamped as Oklch;
}

const THEMES = [null, 'retro-arcade', 'cyberpunk', 'solar-dusk', 'elegant-luxury', 'midnight-bloom'] as const;

const BLOCKS = THEMES.flatMap((theme) => [
  { label: `${theme ?? 'default'} · light`, selector: theme ? `[data-theme="${theme}"]` : ':root', isDark: false },
  { label: `${theme ?? 'default'} · dark`, selector: theme ? `.dark[data-theme="${theme}"]` : '.dark', isDark: true },
]);

const ACTIONS: AllocationAction[] = ['COMPRA', 'VENDI', 'OK'];
/** The AA floor for text that is not «large» — every surface these three land on. */
const MIN_TEXT_CONTRAST = 4.5;
/** `ActionChip`'s own fill: the card washed with its share of the text colour. */
const CHIP_FILL_PCT = ACTION_CHIP_FILL_PCT;

/**
 * THE BUG THIS FILE EXISTS FOR. `useActionColors` reads the token through
 * `getComputedStyle().getPropertyValue('--chart-3')`, and Chrome answers in CSS `lab()`, never in
 * the `oklch()` the stylesheet holds. The old clamp matched `/oklch\(/` and so returned its input
 * untouched on every render since it was written — the page shipped the raw chart slots as text.
 * The three strings below were read off the running app on the mirror (2026-09-21, default light).
 */
describe('the form the browser actually hands over', () => {
  const SERIALISED: Array<{ token: string; lab: string; authored: Oklch }> = [
    { token: '--chart-2 (OK)', lab: 'lab(55.2353% -44.1237 6.30857)', authored: [0.6, 0.125, 172] },
    { token: '--chart-3 (COMPRA)', lab: 'lab(64.8793% 25.0679 78.4211)', authored: [0.7, 0.16, 72] },
    { token: '--chart-5 (VENDI)', lab: 'lab(53.7159% 64.654 24.0942)', authored: [0.62, 0.2, 16] },
  ];

  it.each(SERIALISED)('reads $token back to the oklch the stylesheet authored', ({ lab, authored }) => {
    const parsed = parseToOklch(lab);
    expect(parsed).not.toBeNull();
    const [L, C, H] = parsed!;
    expect(L).toBeCloseTo(authored[0], 2);
    expect(C).toBeCloseTo(authored[1], 2);
    expect(H).toBeCloseTo(authored[2], 0);
  });

  it.each(SERIALISED)('actually clamps $token instead of handing it straight back', ({ lab }) => {
    const clamped = clampActionLightness(lab, false);
    expect(clamped, 'the clamp returned its input — the regression this file guards').not.toBe(lab);
    expect(parseToOklch(clamped)![0]).toBeLessThanOrEqual(ACTION_LIGHT_MAX_L + 1e-6);
  });

  it('leaves a colour it cannot read alone rather than inventing one', () => {
    expect(clampActionLightness('color(display-p3 1 0 0)', false)).toBe('color(display-p3 1 0 0)');
    expect(parseToOklch('not a colour')).toBeNull();
  });
});

describe.each(BLOCKS)('the action colours of $label', ({ selector, isDark }) => {
  const block = blockOf(selector);
  const card = clip(oklchToLinearSrgb(oklchToken(block, '--card')));

  describe.each(ACTIONS)('%s', (action) => {
    const raw = oklchToken(block, `--chart-${ACTION_CHART_NUMBER[action]}`);
    const resolved = clip(oklchToLinearSrgb(clampLightness(raw, isDark)));

    it('clears AA as plain text on the card — the Piano amount and the gap column', () => {
      const ratio = contrastRatio(resolved, card);
      expect(ratio, `measured ${ratio.toFixed(2)}:1 on --card`).toBeGreaterThanOrEqual(MIN_TEXT_CONTRAST);
    });

    it('clears AA on its own chip fill, which is the card washed with its own hue', () => {
      const fill = chipBackground(clip(oklchToLinearSrgb(clampLightness(raw, isDark))), CHIP_FILL_PCT, card);
      const ratio = contrastRatio(resolved, fill);
      expect(ratio, `measured ${ratio.toFixed(2)}:1 on the chip fill`).toBeGreaterThanOrEqual(MIN_TEXT_CONTRAST);
    });
  });

  it('keeps the three actions tellable apart after the clamp', () => {
    // Clamping only L: two slots that shared a hue band could otherwise collapse onto each other,
    // and COMPRA/VENDI/OK differing only by position would be no signal at all.
    const resolved = ACTIONS.map((action) => clampLightness(oklchToken(block, `--chart-${ACTION_CHART_NUMBER[action]}`), isDark));
    for (let i = 0; i < resolved.length; i++) {
      for (let j = i + 1; j < resolved.length; j++) {
        const hueGap = Math.abs(((resolved[i][2] - resolved[j][2] + 540) % 360) - 180);
        expect(hueGap, `${ACTIONS[i]} and ${ACTIONS[j]} are ${hueGap.toFixed(0)}° apart`).toBeGreaterThan(25);
      }
    }
  });
});
