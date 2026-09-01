'use client';

import type { Narrative } from '@/lib/utils/narrative';
import { Skeleton } from '@/components/ui/skeleton';
import type { BenchmarkRanking } from '@/lib/utils/performanceSummary';
import { formatNumber, formatPercentage } from '@/lib/services/chartService';
import { getMetricValueColor } from '@/lib/utils/metricColors';
import { MONTH_NAMES_SHORT } from '@/lib/utils/period';
import { cn } from '@/lib/utils';
import { Tile, TILE_SUB_EYEBROW_CLASS } from '@/components/ui/tile';

interface BenchmarkTileProps {
  /** Null while no model has a return yet (the series are loading). */
  reading: Narrative | null;
  ranking: BenchmarkRanking;
  portfolioTWR: number | null;
  /** Months the annualisation runs on, for the aside. */
  numberOfMonths: number;
  portfolioLastMonth: { year: number; month: number } | null;
  isLoading: boolean;
  /** EUR once the FX series is in; USD only when the FX route failed for good. */
  currency: 'EUR' | 'USD';
  className?: string;
}

function signedPercent(value: number, decimals = 1): string {
  return `${value > 0 ? '+' : value < 0 ? '−' : ''}${formatPercentage(Math.abs(value), decimals)}`;
}

function signedPoints(delta: number): string {
  const points = Math.round(Math.abs(delta) * 10) / 10;
  return `${delta > 0 ? '+' : delta < 0 ? '−' : ''}${formatNumber(points, 1)}`;
}

function monthShort(m: { year: number; month: number }): string {
  return `${MONTH_NAMES_SHORT[m.month - 1].toLowerCase()} ${String(m.year).slice(-2)}`;
}

const HEAD_CLASS = cn(TILE_SUB_EYEBROW_CLASS, 'pb-1.5 font-semibold');
const CELL_CLASS = 'py-[7px] text-[13px]';

/**
 * «Rispetto a cosa?» — the six model portfolios annualised over the same window as the TWR, each
 * up to its own last available month (the aside says so). Always in EUR: the portfolio is
 * EUR-denominated, so a USD return beside it would compare two currencies. The portfolio row
 * stays first as the reference the deltas are read against; the models rank by return.
 */
export function BenchmarkTile({ reading, ranking, portfolioTWR, numberOfMonths, portfolioLastMonth, isLoading, currency, className }: BenchmarkTileProps) {
  return (
    <Tile
      eyebrow="Benchmark"
      aside={
        <span>
          <span className="font-mono tabular-nums">{numberOfMonths}</span> mesi · annualizzato · {currency}
        </span>
      }
      reading={reading}
      className={className}
    >
      {reading === null && isLoading && (
        <div className="mt-2 space-y-2" aria-hidden="true">
          <Skeleton className="h-[13px] w-4/5" />
        </div>
      )}
      <div className="mt-3 overflow-x-auto -mx-5 px-5">
        <table className="w-full border-collapse">
          <thead>
            <tr className="text-left">
              <th scope="col" className={HEAD_CLASS}>Portafoglio modello</th>
              <th scope="col" className={cn(HEAD_CLASS, 'text-right')}>Rend.</th>
              <th scope="col" className={cn(HEAD_CLASS, 'text-right')}>Δ vs tuo</th>
              <th scope="col" className={cn(HEAD_CLASS, 'text-right')}>Fino a</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-t border-border">
              <th scope="row" className={cn(CELL_CLASS, 'text-left font-semibold text-foreground')}>Il tuo portafoglio</th>
              <td className={cn(CELL_CLASS, 'text-right font-mono font-semibold tabular-nums', getMetricValueColor(portfolioTWR, 'percentage'))}>
                {portfolioTWR === null ? '—' : signedPercent(portfolioTWR)}
              </td>
              <td className={cn(CELL_CLASS, 'text-right font-mono tabular-nums text-muted-foreground')}>—</td>
              <td className={cn(CELL_CLASS, 'text-right font-mono text-[11px] tabular-nums text-muted-foreground')}>
                {portfolioLastMonth ? monthShort(portfolioLastMonth) : '—'}
              </td>
            </tr>
            {ranking.rows.map((row) => (
              <tr key={row.id} className="border-t border-border">
                <th scope="row" className={cn(CELL_CLASS, 'text-left font-normal text-foreground')}>{row.name}</th>
                <td className={cn(CELL_CLASS, 'text-right font-mono tabular-nums', row.annualized === null ? 'text-muted-foreground' : 'text-foreground')}>
                  {row.annualized === null ? (isLoading ? '…' : '—') : signedPercent(row.annualized)}
                </td>
                <td className={cn(CELL_CLASS, 'text-right font-mono font-semibold tabular-nums', row.delta === null ? 'text-muted-foreground' : getMetricValueColor(row.delta, 'number'))}>
                  {row.delta === null ? '—' : signedPoints(row.delta)}
                </td>
                <td className={cn(CELL_CLASS, 'text-right font-mono text-[11px] tabular-nums text-muted-foreground')}>
                  {row.lastMonth ? monthShort(row.lastMonth) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-auto border-t border-border pt-3.5 text-[11px] leading-[1.45] text-muted-foreground">
        Ogni modello è misurato fino al suo ultimo mese disponibile e annualizzato sugli stessi mesi del tuo portafoglio;{' '}
        {currency === 'EUR'
          ? 'ETF in USD convertiti in EUR ai cambi di fine mese, ribilanciamento annuale.'
          : 'ETF in USD, cambi non disponibili in questo momento: i rendimenti restano in dollari.'}
      </p>
    </Tile>
  );
}
