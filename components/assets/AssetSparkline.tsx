'use client';

import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { LineChart, Line, YAxis, ResponsiveContainer } from 'recharts';

interface AssetSparklineProps {
  data: { value: number }[];
}

export function AssetSparkline({ data }: AssetSparklineProps) {
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

  const isPositive = data[data.length - 1].value >= data[0].value;
  const strokeColor = isPositive ? '#16a34a' : '#dc2626';

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
