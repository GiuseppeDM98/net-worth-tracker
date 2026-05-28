'use client';

import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { LineChart, Line, YAxis, ResponsiveContainer } from 'recharts';
import { useChartColors } from '@/lib/hooks/useChartColors';

interface AssetSparklineProps {
  data: { value: number }[];
}

export function AssetSparkline({ data }: AssetSparklineProps) {
  const prefersReducedMotion = useReducedMotion();
  const [ready, setReady] = useState(false);
  const rafRef = useRef<number | null>(null);
  // useChartColors reads CSS vars after paint via rAF — must be called unconditionally (hooks rule).
  // By the time `ready` is true (also one rAF), colors are resolved. Fallbacks cover the rare
  // case where the two rAF ticks land out of order.
  const chartColors = useChartColors();

  useEffect(() => {
    rafRef.current = requestAnimationFrame(() => setReady(true));
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  if (!ready || data.length < 2) return null;

  const isPositive = data[data.length - 1].value >= data[0].value;
  // chartColors[0] = primary series (positive trend), chartColors[3] = contrast series (negative trend).
  const strokeColor = isPositive ? (chartColors[0] ?? '#16a34a') : (chartColors[3] ?? '#dc2626');

  return (
    <ResponsiveContainer width="100%" height={32} minWidth={0}>
      <LineChart data={data} margin={{ top: 2, right: 0, left: 0, bottom: 2 }}>
        {/* Hidden YAxis scales line to data range, not from zero */}
        <YAxis hide domain={['auto', 'auto']} />
        <Line
          type="monotone"
          dataKey="value"
          dot={false}
          strokeWidth={1.5}
          stroke={strokeColor}
          isAnimationActive={!prefersReducedMotion}
          animationDuration={600}
          animationEasing="ease-out"
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
