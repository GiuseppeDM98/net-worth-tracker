/**
 * colorParse — the ONE place that reads a colour as the browser serves it.
 *
 * WHY THE BROWSER'S FORM AND NOT THE AUTHORED ONE. A theme block is written in `oklch()`, but the
 * CSS the app serves has been down-levelled by the build (Lightning CSS): `#rrggbb` for a colour
 * inside sRGB, `lab()` for the rest — and `getComputedStyle().getPropertyValue('--chart-3')` hands
 * back that served string. Chrome answers `lab(64.8793% 25.0679 78.4211)` for a `--chart-3`
 * authored `oklch(0.700 0.160 72)`. Two readers were written against `oklch(…)` and were dead code
 * for months: `useActionColors`' clamp until 2026-09-21 (`lib/utils/actionColor.ts`) and
 * `useChartColors`' luminance filter until 2026-10-08 (`lib/utils/themePalette.ts`).
 *
 * So every reader converts what it receives to OKLCH (where the app's lightness bands are
 * expressed) through `cssColorToOklch`, and the Nivo hexes come back out through `oklchToHex`.
 * Pure and Firebase-free: `__tests__/actionColorContrast.test.ts` and `cssColorToHex.test.ts` feed
 * these functions the browser's own serialisation.
 *
 * CSS `lab()` is D50-referenced (CSS Color 4) while OKLab is D65, so the path is
 * Lab(D50) → XYZ(D50) → Bradford → XYZ(D65) → OKLab → OKLCH. sRGB goes straight to OKLab
 * through linear light (Ottosson's matrices). Moved here from `actionColor.ts` and
 * `cssColorToHex.ts` on 2026-10-08.
 */

export type Triple = [number, number, number];

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

/** Linear sRGB → LMS, the same first stage from the other side (Ottosson, «A perceptual color space»). */
const LINEAR_SRGB_TO_LMS: [Triple, Triple, Triple] = [
  [0.4122214708, 0.5363325363, 0.0514459929],
  [0.2119034982, 0.6806995451, 0.1073969566],
  [0.0883024619, 0.2817188376, 0.6299787005],
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

/** LMS (before the cube root) → OKLCH: lightness 0-1, chroma, hue in degrees 0-360. */
function lmsToOklch(lms: Triple): Triple {
  const lmsPrime = lms.map((v) => Math.cbrt(v)) as Triple;
  const [L, a, b] = apply(LMS_TO_OKLAB, lmsPrime);
  const C = Math.hypot(a, b);
  const H = C < 1e-6 ? 0 : (Math.atan2(b, a) * 180) / Math.PI;
  return [L, C, (H + 360) % 360];
}

/** XYZ (D65) → OKLCH: lightness 0-1, chroma, hue in degrees 0-360. */
export function xyzD65ToOklch(xyz: Triple): Triple {
  return lmsToOklch(apply(XYZ_TO_LMS, xyz));
}

/**
 * An `oklch()` or `lab()` colour as OKLCH. `null` for any other form — the caller then leaves the
 * colour alone rather than inventing one.
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
 * `#rgb`, `#rrggbb` or `rgb()` / `rgba()` as its three 0-255 channels (rounded and clamped, as the
 * browser paints them; alpha is dropped). `null` for any other form.
 */
export function parseSrgbChannels(css: string): Triple | null {
  const value = css.trim();

  const hex = value.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hex) {
    const digits = hex[1].length === 3 ? hex[1].split('').map((d) => d + d).join('') : hex[1];
    return [0, 2, 4].map((i) => parseInt(digits.slice(i, i + 2), 16)) as Triple;
  }

  const rgb = value.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i);
  if (rgb) {
    return [rgb[1], rgb[2], rgb[3]].map((channel) =>
      Math.round(Math.min(255, Math.max(0, parseFloat(channel)))),
    ) as Triple;
  }

  return null;
}

/** sRGB channels 0-255 → OKLCH (gamma decoded to linear light first). */
export function srgbChannelsToOklch(channels: Triple): Triple {
  const linear = channels.map((channel) => {
    const encoded = channel / 255;
    return encoded <= 0.04045 ? encoded / 12.92 : ((encoded + 0.055) / 1.055) ** 2.4;
  }) as Triple;
  return lmsToOklch(apply(LINEAR_SRGB_TO_LMS, linear));
}

/**
 * Any colour a computed custom property can hand over — `oklch()`, `lab()`, `#hex`, `rgb()` — as
 * OKLCH. `null` for a form none of these is (a keyword, `color-mix()`, `color(display-p3 …)`).
 */
export function cssColorToOklch(css: string): Triple | null {
  const parsed = parseToOklch(css);
  if (parsed) return parsed;
  const channels = parseSrgbChannels(css);
  return channels ? srgbChannelsToOklch(channels) : null;
}

/** OKLCH → linear sRGB, unclipped (an out-of-gamut colour has channels outside 0-1). */
function oklchToLinearSrgb([l, c, h]: Triple): Triple {
  const a = c * Math.cos((h * Math.PI) / 180);
  const b = c * Math.sin((h * Math.PI) / 180);
  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
    -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
    -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_,
  ];
}

/** sRGB channels 0-255 → `#rrggbb`. */
export function srgbChannelsToHex(channels: Triple): string {
  return `#${channels.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
}

/**
 * OKLCH → `#rrggbb`. An out-of-gamut colour is clipped per channel, which is what the browser does
 * when painting it.
 */
export function oklchToHex(oklch: Triple): string {
  const channels = oklchToLinearSrgb(oklch).map((linear) => {
    const clipped = Math.min(1, Math.max(0, linear));
    const encoded = clipped <= 0.0031308 ? 12.92 * clipped : 1.055 * clipped ** (1 / 2.4) - 0.055;
    return Math.round(encoded * 255);
  }) as Triple;
  return srgbChannelsToHex(channels);
}
