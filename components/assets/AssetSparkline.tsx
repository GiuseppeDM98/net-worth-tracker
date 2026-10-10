'use client';

import { LineChart, Line, YAxis, ResponsiveContainer } from '@/components/ui/charts/recharts';

interface AssetSparklineProps {
  data: { value: number }[];
  /** What the line is («Prezzo unitario di VWCE»): the chart's accessible name, since it has no axes. */
  label: string;
  /** The page's `useChartColors()` palette: [0] a rising line, [3] a falling one. */
  colors: readonly string[];
}

/**
 * The unit-price line inside an expanded `AssetRow`. Recharts 3 puts `tabIndex=0` and
 * `role="application"` on its own `<svg>`, which made every expanded row a mute tab stop on a
 * phone (13 of them, measured 2026-09-14): the chart is an image with a name, not a widget
 * (doc/guide/grafici.md § Recharts, accessibility goes on the chart).
 *
 * No hook of its own (since 2026-10-07): it used to call `useChartColors` and wait one more rAF
 * per row, and every row mounted it closed — 15 recharts charts, 30 rAF and 16 `getComputedStyle`
 * on the owner's phone at each visit. Now the row draws it at its first opening, as a
 * `lazyComponent` (the module is the only path to recharts on Patrimonio), with the page's colours.
 * No draw animation: the line used to animate while its row was still closed, so a reader opening
 * a row always found it already still — it stays that way.
 */
export function AssetSparkline({ data, label, colors }: AssetSparklineProps) {
  if (data.length < 2) return null;

  const isPositive = data[data.length - 1].value >= data[0].value;
  const strokeColor = isPositive ? (colors[0] ?? '#16a34a') : (colors[3] ?? '#dc2626');

  return (
    <ResponsiveContainer width="100%" height={32} minWidth={0}>
      <LineChart
        data={data}
        margin={{ top: 2, right: 0, left: 0, bottom: 2 }}
        role="img"
        aria-label={`${label}: ${isPositive ? 'in salita' : 'in calo'} nel periodo`}
        accessibilityLayer={false}
        tabIndex={-1}
      >
        {/* Hidden YAxis scales line to data range, not from zero */}
        <YAxis hide domain={['auto', 'auto']} />
        <Line type="monotone" dataKey="value" dot={false} strokeWidth={1.5} stroke={strokeColor} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}
