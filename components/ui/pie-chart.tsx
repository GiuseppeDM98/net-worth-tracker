'use client';

import { useEffect, useState } from 'react';
import { PieChart as RechartsPC, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { PieChartData } from '@/types/assets';
import { formatCurrency } from '@/lib/services/chartService';
import { useMediaQuery } from '@/lib/hooks/useMediaQuery';

interface PieChartProps {
  data: PieChartData[];
  animateOnMount?: boolean;
  onFirstRender?: () => void;
  /**
   * compact=true: small fixed-size donut with no internal labels or legend.
   * Used by OverviewChartsSection which supplies its own custom legend.
   * In compact mode, pass explicit `width` and `height` (pixels) to bypass
   * ResponsiveContainer entirely — ResponsiveContainer always initialises with
   * width/height = -1 and logs a warning before ResizeObserver fires, even
   * with a fixed-size parent. Explicit dimensions eliminate the warning.
   */
  compact?: boolean;
  /** Pixel width for compact mode (default 160). */
  width?: number;
  /** Pixel height for compact mode (default 160). */
  height?: number;
}

export function PieChart({
  data,
  animateOnMount = true,
  onFirstRender,
  compact = false,
  width: explicitWidth = 160,
  height: explicitHeight = 160,
}: PieChartProps) {
  // Detect mobile screen for responsive sizing (full-size mode only).
  const isMobile = useMediaQuery('(max-width: 768px)');
  const prefersReducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const [isAnimationActive, setIsAnimationActive] = useState(animateOnMount);

  // All hooks must appear before any conditional return (React rules of hooks).
  useEffect(() => {
    onFirstRender?.();
    // We only need to mark the chart as seen once for the parent page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (prefersReducedMotion || !animateOnMount) {
      setIsAnimationActive(false);
      return;
    }

    setIsAnimationActive(true);
    const frameId = requestAnimationFrame(() => {
      setIsAnimationActive(false);
    });

    return () => cancelAnimationFrame(frameId);
  }, [animateOnMount, prefersReducedMotion]);

  if (!data || data.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">
        Nessun dato disponibile. Aggiungi assets per visualizzare il grafico.
      </div>
    );
  }

  // Ensure data is sorted by value descending for legend order
  const sortedData = [...data].sort((a, b) => b.value - a.value);

  // compact mode: explicit pixel dimensions passed by the caller so we can skip
  // ResponsiveContainer. ResponsiveContainer always initialises with {-1, -1}
  // and emits a warning before ResizeObserver fires its first measurement —
  // there is no rAF/rIC workaround that reliably suppresses this. Passing width
  // and height directly to the Recharts PieChart removes the dependency entirely.
  if (compact) {
    return (
      <RechartsPC width={explicitWidth} height={explicitHeight}>
        <Pie
          data={sortedData as any}
          cx="50%"
          cy="50%"
          labelLine={false}
          label={false}
          outerRadius={72}
          fill="#8884d8"
          dataKey="value"
          isAnimationActive={isAnimationActive}
          animationBegin={0}
          animationDuration={600}
          animationEasing="ease-out"
        >
          {sortedData.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={entry.color} />
          ))}
        </Pie>
        <Tooltip
          content={({ active, payload }) => {
            if (!active || !payload || !payload.length) return null;
            const entry = payload[0];
            const color = (entry.payload as any)?.color ?? entry.color;
            return (
              <div style={{
                backgroundColor: 'var(--card)',
                border: '1px solid var(--border)',
                borderRadius: '4px',
                padding: '6px 10px',
                fontSize: '13px',
              }}>
                <span style={{ color }}>
                  {entry.name}: {(entry.payload as any)?.percentage?.toFixed(1)}%
                </span>
              </div>
            );
          }}
        />
      </RechartsPC>
    );
  }

  // Responsive configuration for full-size mode
  const chartConfig = {
    height: isMobile ? 350 : 500,
    outerRadius: isMobile ? 90 : 140,
    labelThreshold: isMobile ? 10 : 5,
    legendLayout: isMobile ? 'horizontal' : 'vertical',
    legendAlign: isMobile ? 'center' : 'right',
    legendVerticalAlign: isMobile ? 'bottom' : 'middle',
  };

  return (
    <ResponsiveContainer width="100%" height={chartConfig.height}>
      <RechartsPC>
        <Pie
          data={sortedData as any}
          cx="50%"
          cy={isMobile ? "45%" : "50%"}
          labelLine={false}
          label={isMobile ? false : (entry: any) => entry.percentage >= chartConfig.labelThreshold ? `${entry.name}: ${(entry.percentage as number).toFixed(1)}%` : ''}
          outerRadius={chartConfig.outerRadius}
          fill="#8884d8"
          dataKey="value"
          isAnimationActive={isAnimationActive}
          animationBegin={0}
          animationDuration={600}
          animationEasing="ease-out"
        >
          {sortedData.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={entry.color} />
          ))}
        </Pie>
        {/*
          PieChart tooltips don't auto-color item text from <Cell fill> like Line/Area/Bar do.
          A custom tooltip is needed to explicitly read the color from the hovered slice payload.
        */}
        <Tooltip
          content={({ active, payload }) => {
            if (!active || !payload || !payload.length) return null;
            const entry = payload[0];
            const color = (entry.payload as any)?.color ?? entry.color;
            return (
              <div style={{
                backgroundColor: 'var(--card)',
                border: '1px solid var(--border)',
                borderRadius: '4px',
                padding: '8px 12px',
                fontSize: '14px',
              }}>
                <span style={{ color }}>{entry.name} : {formatCurrency(entry.value as number)}</span>
              </div>
            );
          }}
        />
        <Legend
          layout={chartConfig.legendLayout as any}
          align={chartConfig.legendAlign as any}
          verticalAlign={chartConfig.legendVerticalAlign as any}
          content={() => {
            // On mobile, cap to the top 5 items (>= 7% first, then slice) to prevent
            // the legend from overflowing the fixed-height container and clipping the pie.
            const MAX_MOBILE_LEGEND = 5;
            const legendData = isMobile
              ? sortedData.filter(entry => entry.percentage >= 7).slice(0, MAX_MOBILE_LEGEND)
              : sortedData;

            return (
              <div
                className={isMobile ? "flex flex-wrap justify-center gap-3 px-4" : ""}
                style={isMobile ? { paddingTop: '20px' } : { paddingLeft: '20px' }}
              >
                {legendData.map((entry, index) => (
                <div
                  key={`legend-item-${index}`}
                  className={isMobile ? "flex items-center" : "flex items-center mb-2"}
                  style={{ fontSize: '14px' }}
                >
                  <div
                    style={{
                      width: '14px',
                      height: '14px',
                      backgroundColor: entry.color,
                      marginRight: '8px',
                      flexShrink: 0,
                    }}
                  />
                  <span className="text-foreground/80">
                    {entry.name} ({entry.percentage.toFixed(1)}%)
                  </span>
                </div>
              ))}
            </div>
            );
          }}
        />
      </RechartsPC>
    </ResponsiveContainer>
  );
}
