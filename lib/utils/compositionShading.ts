/**
 * Shading for composition-list sub-rows (e.g. Analisi subcategory drill-down).
 *
 * WHY not parse the color: rows in a drill-down share one parent color but need to
 * read as distinct rows. The previous approach parsed `#rrggbb` into an rgba() with
 * decreasing alpha — that silently broke the moment `useChartColors()` returns an
 * oklch string (the project's default palette format), collapsing every subcategory
 * to a hardcoded indigo fallback. Opacity via `barOpacity` works on ANY CSS color
 * syntax because it never touches the color value itself.
 */

/**
 * Linear opacity ramp for N ordered rows sharing one base color: 1.0 → 0.4.
 * count=0 → []; count=1 → [1]; count=4 → [1, 0.8, 0.6, 0.4].
 */
export function computeShadeOpacities(count: number): number[] {
  if (count <= 0) return [];
  if (count === 1) return [1];
  return Array.from({ length: count }, (_, i) => 1 - (i / (count - 1)) * 0.6);
}
