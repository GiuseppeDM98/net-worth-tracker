'use client';

import { useState, type PointerEvent, type ReactNode } from 'react';
import { useMediaQuery } from '@/lib/hooks/useMediaQuery';
import { cn } from '@/lib/utils';

/**
 * Hover reading for the hand-written in-tile charts (the bars of Tracciamento, the net-worth
 * sparkline): a mouse over the plot names the point under it. Desktop only — the hook reports
 * `enabled: false` without a fine pointer, so a phone never mounts the overlay and keeps the
 * chart as a shape (the figures there live in the `<title>`s and the `aria-label`).
 *
 * The plot box must be `relative`: the overlay and the tip position against it.
 */
export function useChartHover(count: number, mode: 'slot' | 'nearest' = 'slot') {
  const enabled = useMediaQuery('(pointer: fine)');
  const [index, setIndex] = useState<number | null>(null);

  const onPointerMove = (event: PointerEvent<HTMLElement>) => {
    if (count === 0) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = Math.min(Math.max(event.clientX - rect.left, 0), rect.width);
    const fraction = rect.width > 0 ? x / rect.width : 0;
    // A bar chart hits the slot under the pointer; a line chart snaps to the nearest point.
    const next = mode === 'slot' ? Math.min(count - 1, Math.floor(fraction * count)) : Math.round(fraction * (count - 1));
    if (next !== index) setIndex(next);
  };
  const onPointerLeave = () => setIndex(null);

  return { enabled, index: enabled ? index : null, handlers: { onPointerMove, onPointerLeave } };
}

interface ChartHoverTipProps {
  /** Horizontal anchor as a fraction of the plot width, 0-1. */
  x: number;
  /** The line the tip names the point with ("Mar 2026"). */
  label: string;
  children: ReactNode;
}

/**
 * The reading itself: a small card at the top of the plot, centred on the anchor and kept
 * inside the plot at the edges. Pointer events pass through it so the hover never flickers.
 */
export function ChartHoverTip({ x, label, children }: ChartHoverTipProps) {
  const side = x < 0.2 ? 'start' : x > 0.8 ? 'end' : 'center';
  return (
    <div
      className={cn(
        'pointer-events-none absolute top-1 z-10 flex w-max flex-col gap-0.5 whitespace-nowrap rounded-md border border-border bg-popover px-2.5 py-1.5 text-[11px] text-popover-foreground shadow-md',
        side === 'center' && '-translate-x-1/2',
        side === 'end' && '-translate-x-full',
      )}
      style={{ left: `${x * 100}%` }}
      role="status"
    >
      <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}
