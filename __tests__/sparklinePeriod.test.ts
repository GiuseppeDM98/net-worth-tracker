/**
 * Tests for lib/utils/sparklinePeriod.ts — the pure slicer behind the hero
 * sparkline's period pill (PeriodSelector, wired into app/dashboard/page.tsx).
 */

import { describe, it, expect } from 'vitest';
import type { DashboardOverviewSparklinePoint } from '@/types/dashboardOverview';
import { filterSparklineByPeriod } from '@/lib/utils/sparklinePeriod';

// 15 monthly points: 2025-04 .. 2026-06 (14 months back + current).
function makeData(): DashboardOverviewSparklinePoint[] {
  const points: DashboardOverviewSparklinePoint[] = [];
  let year = 2025;
  let month = 4;
  for (let i = 0; i < 15; i++) {
    points.push({ month, year, totalNetWorth: 1000 + i * 100 });
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return points;
}

describe('filterSparklineByPeriod', () => {
  it('returns [] unchanged for empty data', () => {
    expect(filterSparklineByPeriod([], '1A')).toEqual([]);
  });

  it('"All" returns every point', () => {
    const data = makeData();
    expect(filterSparklineByPeriod(data, 'All')).toHaveLength(15);
  });

  it('"3M" returns the baseline + 3 points (4 total)', () => {
    const data = makeData();
    const result = filterSparklineByPeriod(data, '3M');
    expect(result).toHaveLength(4);
    expect(result[result.length - 1]).toEqual(data[data.length - 1]);
  });

  it('"3A" (36 months) returns the whole array when there is less history than that', () => {
    const data = makeData(); // only 15 points
    const result = filterSparklineByPeriod(data, '3A');
    expect(result).toHaveLength(15);
  });

  it('"1A" returns the last 13 points (12 months + baseline)', () => {
    const data = makeData();
    const result = filterSparklineByPeriod(data, '1A');
    expect(result).toHaveLength(13);
    expect(result[result.length - 1]).toEqual(data[data.length - 1]);
  });

  it('"YTD" returns only points from the last point\'s year', () => {
    const data = makeData(); // last point is 2026-06
    const result = filterSparklineByPeriod(data, 'YTD');
    // 2026-01 .. 2026-06 = 6 points
    expect(result).toHaveLength(6);
    expect(result.every((p) => p.year === 2026)).toBe(true);
  });

  it('"YTD" falls back to the last 2 points when the current year has only 1', () => {
    const data: DashboardOverviewSparklinePoint[] = [
      { month: 12, year: 2025, totalNetWorth: 1000 },
      { month: 1, year: 2026, totalNetWorth: 1100 },
    ];
    const result = filterSparklineByPeriod(data, 'YTD');
    expect(result).toHaveLength(2);
  });
});
