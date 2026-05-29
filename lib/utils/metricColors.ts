/**
 * Shared color utility for performance metric values.
 *
 * Positive percentage/number values use --positive (green token); negative values
 * use --destructive (red token); currency and months are always neutral foreground.
 *
 * Centralised here because the same logic was duplicated across HeroMetricBlock,
 * MetricCard, and BenchmarkComparisonChart — three independent instantiations
 * that must agree on which token to emit (Rule of Three, DEVELOPMENT_GUIDELINES).
 *
 * Adding a new format: extend the MetricValueFormat union and add a branch below
 * if the format needs semantic color (most formats should remain neutral).
 */

export type MetricValueFormat = 'percentage' | 'currency' | 'number' | 'months';

/**
 * Returns the Tailwind text-color class for a metric value.
 *
 * @param val    - The numeric value (null renders as neutral).
 * @param format - The display format; only percentage and number get semantic color.
 */
export function getMetricValueColor(
  val: number | null,
  format: MetricValueFormat
): string {
  if (val === null) return 'text-muted-foreground';
  if (format === 'percentage' || format === 'number') {
    if (val > 0) return 'text-positive';
    if (val < 0) return 'text-destructive';
  }
  return 'text-foreground';
}
