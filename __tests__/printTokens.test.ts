/**
 * The out-of-DOM tokens are the sRGB rendering of `app/globals.css`, and the only thing that
 * can keep that claim true is arithmetic. This suite re-derives every hex from the OKLCH
 * declaration it mirrors, so a hand-edited literal — the exact failure `printTokens.ts` exists
 * to end — fails here instead of shipping into an email.
 *
 * The declarations are transcribed as data at the top of the file. When a token moves in
 * `globals.css`, update the transcription and the assertion tells you the new hex.
 */

import { describe, it, expect } from 'vitest';
import {
  PRINT_COLORS,
  PRINT_CHART_HEX,
  PRINT_RANK_HEX,
  printChartHexForAssetClass,
  EMAIL_SANS_STACK,
  EMAIL_MONO_STACK,
  PDF_FONTS,
} from '@/lib/constants/printTokens';
import { ASSET_CLASS_SEQUENCE, ASSET_CLASS_CHART_INDEX } from '@/lib/utils/allocationUtils';

// ─── OKLCH → sRGB hex, Björn Ottosson's reference matrices ───────────────────

function oklchToHex(L: number, C: number, H: number): string {
  const h = (H * Math.PI) / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);

  // OKLab → LMS (cube roots), then cube back to linear LMS.
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3;

  const linear = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
  ];

  const channels = linear.map((v) => {
    const encoded = v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
    return Math.round(Math.min(1, Math.max(0, encoded)) * 255);
  });

  return `#${channels.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

/** The `:root` declarations these tokens mirror, transcribed from `app/globals.css`. */
const GLOBALS_ROOT: Record<string, [number, number, number]> = {
  background: [1, 0, 0],
  card: [1, 0, 0],
  foreground: [0.145, 0, 0],
  'muted-foreground': [0.556, 0, 0],
  muted: [0.97, 0, 0],
  border: [0.922, 0, 0],
  positive: [0.482, 0.194, 149.214],
  destructive: [0.577, 0.245, 27.325],
  'warning-foreground': [0.468, 0.098, 75],
  'chart-1': [0.646, 0.222, 41.116],
  'chart-2': [0.6, 0.118, 184.704],
  'chart-3': [0.398, 0.07, 227.392],
  'chart-4': [0.828, 0.189, 84.429],
  'chart-5': [0.769, 0.188, 70.08],
  'chart-6': [0.6, 0.118, 100],
  'chart-7': [0.55, 0.092, 215],
  'chart-8': [0.56, 0.205, 340],
};

const hexOf = (token: string) => oklchToHex(...GLOBALS_ROOT[token]);

// ─── The structural palette ───────────────────────────────────────────────────

describe('PRINT_COLORS mirrors the default theme of app/globals.css', () => {
  it.each([
    ['background', 'background'],
    ['card', 'card'],
    ['foreground', 'foreground'],
    ['mutedForeground', 'muted-foreground'],
    ['surfaceMuted', 'muted'],
    ['border', 'border'],
    ['positive', 'positive'],
    ['negative', 'destructive'],
    ['warning', 'warning-foreground'],
  ])('%s is the sRGB rendering of --%s', (tokenKey, cssVar) => {
    expect(PRINT_COLORS[tokenKey as keyof typeof PRINT_COLORS]).toBe(hexOf(cssVar));
  });

  it('gives the in-tile row rule the value of --muted, not --border', () => {
    // Deliberate: a row boundary must read lighter than the tile boundary that contains it.
    expect(PRINT_COLORS.rowRule).toBe(PRINT_COLORS.surfaceMuted);
    expect(PRINT_COLORS.rowRule).not.toBe(PRINT_COLORS.border);
  });

  it('has a hue only where the data earns one', () => {
    // The Zero-Chroma Rule, restated as a test: every structural neutral is a pure grey
    // (r === g === b), and only the three sign colours are allowed to be chromatic.
    const achromatic = ['background', 'card', 'foreground', 'mutedForeground', 'surfaceMuted', 'border', 'rowRule'] as const;
    for (const key of achromatic) {
      const [r, g, b] = [1, 3, 5].map((i) => PRINT_COLORS[key].slice(i, i + 2));
      expect({ key, r, g, b }).toEqual({ key, r, g: r, b: r });
    }
  });
});

// ─── The chart slots ──────────────────────────────────────────────────────────

describe('PRINT_CHART_HEX', () => {
  it('renders --chart-1 through --chart-8, in order', () => {
    expect(PRINT_CHART_HEX).toEqual([
      hexOf('chart-1'),
      hexOf('chart-2'),
      hexOf('chart-3'),
      hexOf('chart-4'),
      hexOf('chart-5'),
      hexOf('chart-6'),
      hexOf('chart-7'),
      hexOf('chart-8'),
    ]);
  });

  it('covers every asset class the union declares', () => {
    // The failure this guards: a ninth class is added, `ASSET_CLASS_CHART_INDEX` grows, and
    // the email silently paints it muted grey while the app gives it a hue.
    for (const assetClass of ASSET_CLASS_SEQUENCE) {
      expect(printChartHexForAssetClass(assetClass)).not.toBe(PRINT_COLORS.mutedForeground);
    }
  });

  it('gives each class the slot ASSET_CLASS_CHART_INDEX assigns it', () => {
    for (const assetClass of ASSET_CLASS_SEQUENCE) {
      const slot = ASSET_CLASS_CHART_INDEX[assetClass];
      expect(printChartHexForAssetClass(assetClass)).toBe(PRINT_CHART_HEX[slot]);
    }
  });

  it('refuses a class it does not know, instead of guessing a slot', () => {
    expect(printChartHexForAssetClass('fenicottero')).toBe(PRINT_COLORS.mutedForeground);
  });

  it('draws a ranked list in one hue', () => {
    expect(PRINT_RANK_HEX).toBe(PRINT_CHART_HEX[2]);
  });
});

// ─── Type faces ───────────────────────────────────────────────────────────────

describe('type faces', () => {
  it('names no webfont in either email stack', () => {
    // A mail client cannot load one, and a stack that lists Geist would render the fallback
    // silently — the reader would see Arial and we would believe they saw Geist.
    for (const stack of [EMAIL_SANS_STACK, EMAIL_MONO_STACK]) {
      expect(stack.toLowerCase()).not.toContain('geist');
    }
  });

  it('ends both email stacks on a generic family', () => {
    expect(EMAIL_SANS_STACK.trim().endsWith('sans-serif')).toBe(true);
    expect(EMAIL_MONO_STACK.trim().endsWith('monospace')).toBe(true);
  });

  it('uses only the standard PDF families react-pdf ships', () => {
    // Anything else needs Font.register with a real file; there is none in this repo.
    expect(Object.values(PDF_FONTS)).toEqual(['Helvetica', 'Helvetica-Bold', 'Helvetica-Oblique']);
  });
});
