/**
 * The eight chart slots of the default theme must be tellable apart in BOTH modes — a rule
 * DESIGN.md stated in prose since 2026-08-30 (when the static teal at index 6 measured ΔE00 0.87
 * from `--chart-2`) and nothing enforced: the light palette shipped with Liquidità 10.1 ΔE00
 * from Immobili until the Panoramica critique of 2026-09-13 measured it on the real account.
 *
 * The suite reads `app/globals.css` itself (the `:root` and `.dark` blocks), so a token edited
 * in the stylesheet is what gets measured — never a transcription that can drift. Two floors:
 *
 *   - ΔE00 ≥ 14 between any two slots of one mode (the dark set, designed by hand, sits at 18.8;
 *     the re-pitched light set at 16.0). A composition bar is 8px of colour and nothing else.
 *   - the luminance guard of `useChartColors` must not trip: L ≤ 0.82 in light and L ≥ 0.30 in
 *     dark, or the slot silently falls back to the static palette (doc/guide/temi.md).
 *
 * Scope: the default theme only. The five named themes are not measured here — retro-arcade
 * declares two identical slots and elegant-luxury three reds (CLAUDE.md → Known Issues).
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// ─── OKLCH → CIE Lab (D65), then CIEDE2000 ────────────────────────────────────

type Oklch = readonly [number, number, number];

function oklchToLinearSrgb([L, C, H]: Oklch): [number, number, number] {
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

function linearSrgbToLab([r, g, b]: [number, number, number]): [number, number, number] {
  const x = 0.4124564 * r + 0.3575761 * g + 0.1804375 * b;
  const y = 0.2126729 * r + 0.7151522 * g + 0.072175 * b;
  const z = 0.0193339 * r + 0.119192 * g + 0.9503041 * b;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const [fx, fy, fz] = [x / 0.95047, y / 1, z / 1.08883].map(f);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

/** CIEDE2000 (Sharma, Wu, Dalal 2005), the reference implementation's formula. */
function deltaE00([L1, a1, b1]: number[], [L2, a2, b2]: number[]): number {
  const rad = Math.PI / 180;
  const deg = 180 / Math.PI;
  const C1 = Math.hypot(a1, b1);
  const C2 = Math.hypot(a2, b2);
  const Cb = (C1 + C2) / 2;
  const G = 0.5 * (1 - Math.sqrt(Cb ** 7 / (Cb ** 7 + 25 ** 7)));
  const a1p = a1 * (1 + G);
  const a2p = a2 * (1 + G);
  const C1p = Math.hypot(a1p, b1);
  const C2p = Math.hypot(a2p, b2);
  const hue = (a: number, b: number) => {
    if (a === 0 && b === 0) return 0;
    const v = Math.atan2(b, a) * deg;
    return v < 0 ? v + 360 : v;
  };
  const h1 = hue(a1p, b1);
  const h2 = hue(a2p, b2);
  const dL = L2 - L1;
  const dC = C2p - C1p;
  let dh = 0;
  if (C1p * C2p !== 0) {
    dh = h2 - h1;
    if (dh > 180) dh -= 360;
    else if (dh < -180) dh += 360;
  }
  const dH = 2 * Math.sqrt(C1p * C2p) * Math.sin((dh / 2) * rad);
  const Lb = (L1 + L2) / 2;
  const Cbp = (C1p + C2p) / 2;
  let hb = h1 + h2;
  if (C1p * C2p !== 0) {
    if (Math.abs(h1 - h2) > 180) hb = h1 + h2 < 360 ? hb + 360 : hb - 360;
    hb /= 2;
  }
  const T =
    1 -
    0.17 * Math.cos((hb - 30) * rad) +
    0.24 * Math.cos(2 * hb * rad) +
    0.32 * Math.cos((3 * hb + 6) * rad) -
    0.2 * Math.cos((4 * hb - 63) * rad);
  const dTheta = 30 * Math.exp(-(((hb - 275) / 25) ** 2));
  const RC = 2 * Math.sqrt(Cbp ** 7 / (Cbp ** 7 + 25 ** 7));
  const SL = 1 + (0.015 * (Lb - 50) ** 2) / Math.sqrt(20 + (Lb - 50) ** 2);
  const SC = 1 + 0.045 * Cbp;
  const SH = 1 + 0.015 * Cbp * T;
  const RT = -Math.sin(2 * dTheta * rad) * RC;
  return Math.sqrt((dL / SL) ** 2 + (dC / SC) ** 2 + (dH / SH) ** 2 + RT * (dC / SC) * (dH / SH));
}

const labOf = (oklch: Oklch) => linearSrgbToLab(oklchToLinearSrgb(oklch));

// ─── Reading the stylesheet ───────────────────────────────────────────────────

const GLOBALS = readFileSync(resolve(__dirname, '../app/globals.css'), 'utf8');

/** The `--chart-1..8` declarations of one selector block (`:root` or `.dark`), as OKLCH triples. */
function chartSlotsOf(selector: string): Oklch[] {
  const start = GLOBALS.indexOf(`\n${selector} {`);
  expect(start, `block "${selector}" in app/globals.css`).toBeGreaterThan(-1);
  const end = GLOBALS.indexOf('\n}', start);
  const block = GLOBALS.slice(start, end);
  return Array.from({ length: 8 }, (_, i) => {
    const match = block.match(new RegExp(`--chart-${i + 1}:\\s*oklch\\(([\\d.]+)\\s+([\\d.]+)\\s+([\\d.]+)\\)`));
    expect(match, `--chart-${i + 1} in "${selector}"`).not.toBeNull();
    return [Number(match![1]), Number(match![2]), Number(match![3])] as const;
  });
}

const SLOT_NAMES = ['Azioni', 'Obbligazioni', 'Criptovalute', 'Immobili', 'Liquidità', 'Materie Prime', 'Trend Following', 'Carry'];
const MIN_DELTA_E = 14;

function closestPair(slots: Oklch[]): { a: string; b: string; deltaE: number } {
  let closest = { a: '', b: '', deltaE: Number.POSITIVE_INFINITY };
  for (let i = 0; i < slots.length; i++) {
    for (let j = i + 1; j < slots.length; j++) {
      const deltaE = deltaE00(labOf(slots[i]), labOf(slots[j]));
      if (deltaE < closest.deltaE) closest = { a: SLOT_NAMES[i], b: SLOT_NAMES[j], deltaE };
    }
  }
  return closest;
}

describe.each([
  ['light', ':root', { maxL: 0.82, minL: 0 }],
  ['dark', '.dark', { maxL: 1, minL: 0.3 }],
])('the default theme\'s chart slots in %s mode', (_mode, selector, guard) => {
  const slots = chartSlotsOf(selector);

  it(`keeps every pair of slots at least ΔE00 ${MIN_DELTA_E} apart`, () => {
    const { a, b, deltaE } = closestPair(slots);
    expect({ closest: `${a} ↔ ${b}`, deltaE: Number(deltaE.toFixed(1)) }).toMatchObject({
      deltaE: expect.any(Number),
    });
    expect(deltaE, `${a} ↔ ${b} measure ΔE00 ${deltaE.toFixed(1)} — the same colour to a reader`).toBeGreaterThanOrEqual(MIN_DELTA_E);
  });

  it('stays inside the luminance guard of useChartColors, so no slot falls back to the static palette', () => {
    slots.forEach(([L], i) => {
      expect(L, `${SLOT_NAMES[i]} L=${L}`).toBeLessThanOrEqual(guard.maxL);
      expect(L, `${SLOT_NAMES[i]} L=${L}`).toBeGreaterThanOrEqual(guard.minL);
    });
  });
});

describe('the two modes agree on what a slot looks like', () => {
  it('holds each slot inside the same hue band in light and dark (≤ 30° apart)', () => {
    // The identity of a slot is its hue: a class that is blue in dark and orange in light is
    // two identities, which is what the light palette was until 2026-09-13.
    const light = chartSlotsOf(':root');
    const dark = chartSlotsOf('.dark');
    light.forEach(([, , hueLight], i) => {
      const hueDark = dark[i][2];
      const distance = Math.min(Math.abs(hueLight - hueDark), 360 - Math.abs(hueLight - hueDark));
      expect(distance, `${SLOT_NAMES[i]}: light ${hueLight}°, dark ${hueDark}°`).toBeLessThanOrEqual(30);
    });
  });
});
