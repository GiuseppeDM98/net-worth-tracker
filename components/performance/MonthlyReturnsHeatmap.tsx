'use client';

import { useState } from 'react';
import type { MonthlyReturnHeatmapData } from '@/types/performance';
import { formatPercentage } from '@/lib/services/chartService';
import { useMediaQuery } from '@/lib/hooks/useMediaQuery';
import { cn } from '@/lib/utils';
import { ChartHoverTip } from '@/components/ui/chart-hover';
import { MONTH_NAMES } from '@/lib/constants/months';

interface MonthlyReturnsHeatmapProps {
  data: MonthlyReturnHeatmapData[];
  className?: string;
}

const MONTH_LETTERS = ['G', 'F', 'M', 'A', 'M', 'G', 'L', 'A', 'S', 'O', 'N', 'D'];

/**
 * The cell's fill: the sign token at three intensities, so the heatmap follows the theme like every
 * other gain and loss on the page (raw `bg-red-*`/`bg-green-*` stayed literal on Cyberpunk, where the
 * negative colour is orange — CLAUDE.md → Known Issues, closed 2026-08-25). A month out of the
 * period, or exactly flat, is the muted surface: neither a gain nor a loss.
 */
export function heatmapCellClass(value: number | null): string {
  if (value === null || value === 0) return 'bg-muted';
  const magnitude = Math.abs(value);
  const step = magnitude < 1 ? 30 : magnitude < 2.5 ? 55 : 85;
  if (value < 0) return step === 30 ? 'bg-destructive/30' : step === 55 ? 'bg-destructive/55' : 'bg-destructive/85';
  return step === 30 ? 'bg-positive/30' : step === 55 ? 'bg-positive/55' : 'bg-positive/85';
}

function signedPercent(value: number): string {
  return `${value > 0 ? '+' : value < 0 ? '−' : ''}${formatPercentage(Math.abs(value), 1)}`;
}

interface HoveredCell {
  x: number;
  label: string;
  value: number | null;
}

/**
 * One cell per month, colour by sign and intensity, no figure inside: at a tile's width twelve
 * columns leave no room for «+1,2%», so the figure lives in the cell's `<title>`, in the
 * screen-reader text, and — with a mouse — in the reading above the grid. A table, because it IS
 * one: years are rows, months are columns, and a screen reader walks it that way.
 */
export function MonthlyReturnsHeatmap({ data, className }: MonthlyReturnsHeatmapProps) {
  const finePointer = useMediaQuery('(pointer: fine)');
  const [hovered, setHovered] = useState<HoveredCell | null>(null);

  if (data.length === 0) return null;

  return (
    <div className={cn('relative', className)} onPointerLeave={() => setHovered(null)}>
      {hovered && finePointer && (
        <ChartHoverTip x={hovered.x} label={hovered.label}>
          <span className={cn('font-mono tabular-nums', hovered.value === null ? 'text-muted-foreground' : hovered.value > 0 ? 'text-positive' : hovered.value < 0 ? 'text-destructive' : 'text-foreground')}>
            {hovered.value === null ? 'nessun dato' : signedPercent(hovered.value)}
          </span>
        </ChartHoverTip>
      )}
      <table className="w-full border-separate border-spacing-[3px] -m-[3px]" style={{ width: 'calc(100% + 6px)' }}>
        <thead>
          <tr>
            <th scope="col" className="w-8 text-left font-mono text-[10px] font-normal text-muted-foreground">
              <span className="sr-only">Anno</span>
            </th>
            {MONTH_LETTERS.map((letter, i) => (
              <th key={i} scope="col" className="text-center font-mono text-[10px] font-normal text-muted-foreground" aria-label={MONTH_NAMES[i]}>
                {letter}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row) => (
            <tr key={row.year}>
              <th scope="row" className="pr-1 text-left font-mono text-[11px] font-normal tabular-nums text-muted-foreground">
                {row.year}
              </th>
              {row.months.map((m) => {
                const title = `${MONTH_NAMES[m.month - 1]} ${row.year}: ${m.return === null ? 'nessun dato' : signedPercent(m.return)}`;
                return (
                  <td
                    key={m.month}
                    className={cn('h-[28px] rounded-[3px]', heatmapCellClass(m.return))}
                    title={title}
                    onPointerEnter={(event) => {
                      if (!finePointer) return;
                      const cell = event.currentTarget;
                      const table = cell.closest('table');
                      if (!table) return;
                      const cellRect = cell.getBoundingClientRect();
                      const tableRect = table.getBoundingClientRect();
                      setHovered({
                        x: (cellRect.left + cellRect.width / 2 - tableRect.left) / tableRect.width,
                        label: `${MONTH_NAMES[m.month - 1]} ${row.year}`,
                        value: m.return,
                      });
                    }}
                  >
                    <span className="sr-only">{title}</span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** The legend under the grid: the six steps and the «out of period» surface, swatches as colour keys. */
export function HeatmapLegend({ className }: { className?: string }) {
  const steps = [-3, -1.5, -0.5, 0.5, 1.5, 3];
  return (
    <div className={cn('flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[11px] text-muted-foreground', className)} aria-hidden="true">
      <span className="flex items-center gap-1">
        {steps.slice(0, 3).map((v) => (
          <span key={v} className={cn('inline-block h-2 w-2 rounded-[2px]', heatmapCellClass(v))} />
        ))}
        <span className="mx-1">−5% … 0 … +5%</span>
        {steps.slice(3).map((v) => (
          <span key={v} className={cn('inline-block h-2 w-2 rounded-[2px]', heatmapCellClass(v))} />
        ))}
      </span>
      <span className="flex items-center gap-1.5">
        <span className="inline-block h-2 w-2 rounded-[2px] bg-muted" />
        fuori periodo
      </span>
    </div>
  );
}
