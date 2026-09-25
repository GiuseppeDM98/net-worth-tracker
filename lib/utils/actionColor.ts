/**
 * actionColor — the legibility clamp for COMPRA / VENDI / OK, and the colour maths it needs.
 *
 * WHY THIS IS A MODULE AND NOT THREE LINES IN THE HOOK. `useActionColors` reads the active theme's
 * `--chart-*` through `getComputedStyle().getPropertyValue()` and clamped it with a regex on
 * `oklch(…)`. **The browser never returns `oklch(…)`**: Chrome serialises a computed custom
 * property to CSS `lab()` — `--chart-3`, authored `oklch(0.700 0.160 72)`, comes back as
 * `lab(64.8793% 25.0679 78.4211)`. The regex therefore never matched, `clampLightness` returned
 * its input untouched, and the clamp had been dead code since it was written (measured on the
 * mirror, 2026-09-21). AGENTS.md records the same trap for `useChartColors` — «the browser RETURNS
 * `lab(…)`, not the `oklch()` you authored» — and this hook was written against the assumption it
 * does not.
 *
 * So the parse accepts what the browser actually hands over, converts it to OKLCH (where the
 * lightness band is expressed), clamps L and hands back an `oklch()` string the browser accepts.
 * Pure and Firebase-free, so `__tests__/actionColorContrast.test.ts` exercises THIS function
 * rather than a re-implementation that can drift from it.
 *
 * CSS `lab()` is D50-referenced (CSS Color 4) while OKLab is D65, so the path is
 * Lab(D50) → XYZ(D50) → Bradford → XYZ(D65) → OKLab → OKLCH.
 */

import { ACTION_DARK_MIN_L, ACTION_LIGHT_MAX_L } from '@/lib/utils/allocationUtils';

type Triple = [number, number, number];

/** CIE standard: the actual rational values, not the rounded 0.008856 / 903.3 of older sources. */
const EPSILON = 216 / 24389;
const KAPPA = 24389 / 27;

/** D50 white point, as CSS Color 4 defines it for `lab()`. */
const D50: Triple = [0.3457 / 0.3585, 1, (1 - 0.3457 - 0.3585) / 0.3585];

/** Bradford-adapted D50 → D65 (CSS Color 4, «Converting Colors»). */
const D50_TO_D65: [Triple, Triple, Triple] = [
  [0.955473421488075, -0.02309845494876471, 0.06325924320057072],
  [-0.0283697093338637, 1.0099953980813041, 0.021041441191917323],
  [0.012314014864481998, -0.020507649298898964, 1.330365926242124],
];

/** XYZ (D65) → LMS, the first stage of OKLab. */
const XYZ_TO_LMS: [Triple, Triple, Triple] = [
  [0.8190224379967030, 0.3619062600528904, -0.1288737815209879],
  [0.0329836539323885, 0.9292868615863434, 0.0361446663506424],
  [0.0481771893596242, 0.2642395317527308, 0.6335478284694309],
];

/** LMS′ → OKLab. */
const LMS_TO_OKLAB: [Triple, Triple, Triple] = [
  [0.2104542683093140, 0.7936177747023054, -0.0040720430116193],
  [1.9779985324311684, -2.4285922420485799, 0.4505937096174110],
  [0.0259040424655478, 0.7827717124575296, -0.8086757549230774],
];

function apply(matrix: [Triple, Triple, Triple], [x, y, z]: Triple): Triple {
  return [
    matrix[0][0] * x + matrix[0][1] * y + matrix[0][2] * z,
    matrix[1][0] * x + matrix[1][1] * y + matrix[1][2] * z,
    matrix[2][0] * x + matrix[2][1] * y + matrix[2][2] * z,
  ];
}

/** CIE Lab (L* 0-100, a, b) in the D50 reference → XYZ, also D50. */
export function labD50ToXyzD50([L, a, b]: Triple): Triple {
  const fy = (L + 16) / 116;
  const fx = fy + a / 500;
  const fz = fy - b / 200;
  const inv = (f: number) => (f ** 3 > EPSILON ? f ** 3 : (116 * f - 16) / KAPPA);
  const yr = L > KAPPA * EPSILON ? ((L + 16) / 116) ** 3 : L / KAPPA;
  return [inv(fx) * D50[0], yr * D50[1], inv(fz) * D50[2]];
}

/** XYZ (D65) → OKLCH: lightness 0-1, chroma, hue in degrees 0-360. */
export function xyzD65ToOklch(xyz: Triple): Triple {
  const lms = apply(XYZ_TO_LMS, xyz);
  const lmsPrime = lms.map((v) => Math.cbrt(v)) as Triple;
  const [L, a, b] = apply(LMS_TO_OKLAB, lmsPrime);
  const C = Math.hypot(a, b);
  const H = C < 1e-6 ? 0 : (Math.atan2(b, a) * 180) / Math.PI;
  return [L, C, (H + 360) % 360];
}

/**
 * Any colour a computed custom property can hand over, as OKLCH. `null` when the form is one this
 * does not model — the caller then leaves the colour alone rather than inventing one.
 *
 * `oklch()` is accepted too: it is what the stylesheet holds, so the unit tests can feed the
 * authored value and the browser's serialisation to the same function and compare.
 */
export function parseToOklch(css: string): Triple | null {
  const value = css.trim();

  const oklch = value.match(/^oklch\(\s*([\d.]+%?)\s+([\d.]+%?)\s+([-\d.]+)/i);
  if (oklch) {
    const l = oklch[1].endsWith('%') ? parseFloat(oklch[1]) / 100 : parseFloat(oklch[1]);
    const c = oklch[2].endsWith('%') ? (parseFloat(oklch[2]) / 100) * 0.4 : parseFloat(oklch[2]);
    return [l, c, ((parseFloat(oklch[3]) % 360) + 360) % 360];
  }

  const lab = value.match(/^lab\(\s*([\d.]+)%?\s+([-\d.]+)\s+([-\d.]+)/i);
  if (lab) {
    const xyzD50 = labD50ToXyzD50([parseFloat(lab[1]), parseFloat(lab[2]), parseFloat(lab[3])]);
    return xyzD65ToOklch(apply(D50_TO_D65, xyzD50));
  }

  return null;
}

/**
 * COMPRA / VENDI / OK at a lightness that clears WCAG AA as TEXT, in the theme's own hue.
 *
 * Only L moves: the hue is the theme's identity and the three actions must stay tellable apart
 * from each other, which clamping chroma or hue would break. Returns the input untouched when the
 * colour is in a form this cannot read — a wrong colour is worse than an unclamped one.
 */
export function clampActionLightness(css: string, isDark: boolean): string {
  const parsed = parseToOklch(css);
  if (!parsed) return css;
  const [L, C, H] = parsed;
  const clamped = isDark ? Math.max(L, ACTION_DARK_MIN_L) : Math.min(L, ACTION_LIGHT_MAX_L);
  return `oklch(${clamped.toFixed(4)} ${C.toFixed(4)} ${H.toFixed(2)})`;
}
