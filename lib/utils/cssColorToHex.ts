/**
 * A theme colour as the browser serves it, as `#rrggbb` — for the chart libraries that cannot take
 * a CSS colour as is (Nivo's react-spring interpolates neither `oklch()` nor `lab()`).
 *
 * Why several input forms: a theme block is written in `oklch()`, but the CSS the app actually
 * serves has been down-levelled by the build (Lightning CSS) to `#rrggbb` for colours inside sRGB
 * and to `lab()` for the rest, and `getComputedStyle` hands back that served form. Out-of-gamut
 * values are clipped per channel, which is what the browser does when painting them.
 *
 * Every form is read by `lib/utils/colorParse.ts`, the one colour parser of the repo (PERF-14,
 * 2026-10-08): this module only chooses the route — an sRGB form keeps its exact channels, an
 * `oklch()` / `lab()` one goes through OKLCH.
 *
 * Used by: lib/utils/themePalette.ts (the `--role-*` hexes of the 50/30/20 Sankey)
 */

import { oklchToHex, parseSrgbChannels, parseToOklch, srgbChannelsToHex } from '@/lib/utils/colorParse';

/**
 * A colour as `getComputedStyle` can hand it back — `oklch()`, `#rgb`/`#rrggbb`, `lab()`, `rgb()` —
 * as `#rrggbb`; `null` for anything else (an empty token, a keyword, `color-mix()`).
 */
export function colorToHex(color: string): string | null {
  const channels = parseSrgbChannels(color);
  if (channels) return srgbChannelsToHex(channels);

  const oklch = parseToOklch(color);
  return oklch ? oklchToHex(oklch) : null;
}
