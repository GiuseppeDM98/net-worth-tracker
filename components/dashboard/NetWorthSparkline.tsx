'use client';

/**
 * HERO SPARKLINE — net worth trend over the last 3 historical snapshots.
 *
 * Intentionally minimal: no axes, no grid, no tooltip, no legend.
 * The variation chips above already carry the numeric context; this
 * chart adds the visual shape of the trend — is it a steady climb,
 * a dip-and-recovery, or a recent downturn?
 *
 * Recharts -1 dimension guard: ResponsiveContainer fires ResizeObserver
 * before layout is complete when mounted inside an async data flow.
 * We defer the mount one rAF tick to let the browser finish layout first.
 */

import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { LineChart, Line, YAxis, ResponsiveContainer } from 'recharts';
import { DashboardOverviewSparklinePoint } from '@/types/dashboardOverview';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';

interface NetWorthSparklineProps {
  data: DashboardOverviewSparklinePoint[];
}

export function NetWorthSparkline({ data }: NetWorthSparklineProps) {
  const prefersReducedMotion = useReducedMotion();
  const [ready, setReady] = useState(false);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    rafRef.current = requestAnimationFrame(() => setReady(true));
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  if (!ready || data.length < 2) return null;

  // Positive trend when the most recent snapshot is higher than the oldest.
  const isPositive = data[data.length - 1].totalNetWorth >= data[0].totalNetWorth;
  const strokeColor = isPositive ? '#16a34a' : '#dc2626';

  const firstValue = data[0].totalNetWorth;
  const lastValue = data[data.length - 1].totalNetWorth;

  return (
    <div>
      <ResponsiveContainer width="100%" height={48} minWidth={0}>
        <LineChart data={data} margin={{ top: 4, right: 0, left: 0, bottom: 4 }}>
          {/* Hidden YAxis with auto domain so the line fills the chart height
              relative to the data range, not from zero. Without this a +8% YTD
              growth looks like a flat line at the top of a 0-to-284k scale. */}
          <YAxis hide domain={['auto', 'auto']} />
          <Line
            type="monotone"
            dataKey="totalNetWorth"
            dot={false}
            strokeWidth={1.5}
            stroke={strokeColor}
            isAnimationActive={!prefersReducedMotion}
            animationDuration={600}
            animationEasing="ease-out"
          />
        </LineChart>
      </ResponsiveContainer>
      {/* Start / end labels for immediate readability */}
      <div className="flex justify-between mt-0.5">
        <span className="text-[10px] text-muted-foreground">{cachedFormatCurrencyEUR(firstValue, true)}</span>
        <span className="text-[10px] text-muted-foreground">{cachedFormatCurrencyEUR(lastValue, true)}</span>
      </div>
    </div>
  );
}
