'use client';

import type { ReactNode } from 'react';
import type { Narrative } from '@/lib/utils/narrative';
import type { DrawdownStory } from '@/lib/utils/performanceSummary';
import { formatNumber, formatPercentage } from '@/lib/services/chartService';
import { MONTH_NAMES_SHORT } from '@/lib/utils/period';
import { cn } from '@/lib/utils';
import { Tile } from '@/components/ui/tile';
import { TileMethodNote } from '@/components/ui/tile-method-note';

interface RischioTileProps {
  reading: Narrative;
  /** Months of return in the window and the risk-free rate the ratios use — the aside. */
  monthsMeasured: number;
  riskFreeRate: number;
  volatility: number | null;
  sharpeRatio: number | null;
  sortinoRatio: number | null;
  drawdown: DrawdownStory | null;
  className?: string;
}

function monthShort(m: { year: number; month: number }): string {
  return `${MONTH_NAMES_SHORT[m.month - 1].toLowerCase()} ${String(m.year).slice(-2)}`;
}

function ratio(value: number): string {
  return formatNumber(value, 2).replace('-', '−');
}

function Row({ label, sub, children }: { label: string; sub?: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-[9px]">
      <span className="min-w-0 text-[13px] text-foreground">
        {label}
        {sub && <span className="ml-1.5 text-[11px] text-muted-foreground">{sub}</span>}
      </span>
      {children}
    </div>
  );
}

function Value({ value, className }: { value: string | null; className?: string }) {
  return <span className={cn('shrink-0 font-mono text-[13px] font-semibold tabular-nums', value === null ? 'text-muted-foreground' : className)}>{value ?? '—'}</span>;
}

/**
 * «Quanto rischio?» — volatility, Sharpe, Sortino and the deepest drawdown with its months, as
 * flat rows. Below three measured months the ratios are `—` and the reading says why: a
 * deviation on two points is noise, not a statistic (doc/guide/rendimenti.md § Rendimenti — the measurement window).
 *
 * Sharpe and Sortino are printed in the neutral ink (2026-09-20): a ratio is not a gain. With the
 * sign colour a Sharpe of 0,20 was green under a reading that said the risk is poorly paid — the
 * judgement belongs to the reading, which knows the thresholds. Max drawdown IS a loss and stays red.
 */
export function RischioTile({ reading, monthsMeasured, riskFreeRate, volatility, sharpeRatio, sortinoRatio, drawdown, className }: RischioTileProps) {
  const duration = drawdown
    ? drawdown.recovery
      ? `${monthShort(drawdown.peak)} – ${monthShort(drawdown.recovery)}`
      : `da ${monthShort(drawdown.peak)}`
    : undefined;

  return (
    <Tile
      eyebrow="Rischio"
      aside={
        <span>
          <span className="font-mono tabular-nums">{monthsMeasured}</span> {monthsMeasured === 1 ? 'mese' : 'mesi'} · RF{' '}
          <span className="font-mono tabular-nums">{formatPercentage(riskFreeRate, 1)}</span>
        </span>
      }
      reading={reading}
      className={className}
    >
      <div className="mt-3 flex flex-col divide-y divide-border">
        <Row label="Volatilità" sub="annua">
          <Value value={volatility === null ? null : formatPercentage(volatility, 1)} className="text-foreground" />
        </Row>
        <Row label="Sharpe">
          <Value value={sharpeRatio === null ? null : ratio(sharpeRatio)} className="text-foreground" />
        </Row>
        <Row label="Sortino">
          <Value value={sortinoRatio === null ? null : ratio(sortinoRatio)} className="text-foreground" />
        </Row>
        <Row label="Max drawdown" sub={drawdown ? monthShort(drawdown.trough) : undefined}>
          <Value value={drawdown ? `−${formatPercentage(Math.abs(drawdown.value), 1)}` : null} className="text-destructive" />
        </Row>
        <Row label="Durata" sub={duration}>
          <Value value={drawdown ? `${drawdown.durationMonths} ${drawdown.durationMonths === 1 ? 'mese' : 'mesi'}` : null} className="text-foreground" />
        </Row>
      </div>
      <TileMethodNote subject="Rischio" summary="Misurato sui rendimenti mensili.">
        <span className="block">Volatilità = deviazione standard dei rendimenti mensili × √12, senza filtri sugli estremi.</span>
        <span className="block">Volatilità, Sharpe e Sortino chiedono almeno 3 mesi misurati: sotto, la riga resta vuota.</span>
        <span className="block">Sharpe e Sortino usano il tasso privo di rischio (RF) delle Impostazioni; il Sortino conta solo i mesi negativi.</span>
        <span className="block">Il drawdown è misurato sull&apos;indice TWR: un versamento non lo sposta.</span>
      </TileMethodNote>
    </Tile>
  );
}
