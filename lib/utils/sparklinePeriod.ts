/**
 * Slices the hero sparkline's monthly history down to a selected period.
 *
 * Pure and framework-free so it's directly unit-testable. The server provides
 * up to 40 monthly points (see dashboardOverviewService.ts) — one per month, so
 * "1M" really means "this month vs last" (2 points), not intra-month granularity.
 */

import type { DashboardOverviewSparklinePoint } from '@/types/dashboardOverview';
import type { SparklinePeriod } from '@/components/dashboard/PeriodSelector';

const PERIOD_MONTHS: Partial<Record<SparklinePeriod, number>> = {
  '3M': 3,
  '6M': 6,
  '1A': 12,
  '3A': 36,
};

export function filterSparklineByPeriod(
  data: DashboardOverviewSparklinePoint[],
  period: SparklinePeriod
): DashboardOverviewSparklinePoint[] {
  if (data.length === 0) return data;
  if (period === 'All') return data;

  if (period === 'YTD') {
    const currentYear = data[data.length - 1].year;
    const ytd = data.filter((d) => d.year === currentYear);
    // A user checking in January has ~1 YTD point — fall back to the last 2
    // points (previous month + now) so the chart always has a line to draw.
    return ytd.length >= 2 ? ytd : data.slice(-2);
  }

  const months = PERIOD_MONTHS[period] ?? data.length;
  // +1 for the baseline point the line starts from.
  return data.slice(-(months + 1));
}
