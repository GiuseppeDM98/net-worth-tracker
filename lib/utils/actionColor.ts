/**
 * actionColor — the legibility clamp for COMPRA / VENDI / OK.
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
 * So the parse accepts what the browser actually hands over (`lib/utils/colorParse.ts`, the one
 * parser), clamps L in OKLCH, where the lightness band is expressed, and hands back an `oklch()`
 * string the browser accepts. Pure and Firebase-free, so `__tests__/actionColorContrast.test.ts`
 * exercises THIS function rather than a re-implementation that can drift from it.
 */

import { ACTION_DARK_MIN_L, ACTION_LIGHT_MAX_L } from '@/lib/utils/allocationUtils';
import { parseToOklch } from '@/lib/utils/colorParse';

// Re-exported: the contrast test reads the parser from here, beside the clamp it feeds.
export { parseToOklch };

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
