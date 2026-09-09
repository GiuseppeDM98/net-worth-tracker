'use client';

import type { ReactNode } from 'react';
import type { PieChartData } from '@/types/assets';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import { formatPercentage } from '@/lib/services/chartService';
import { describeComposition } from '@/lib/utils/overviewNarrative';
import { CompositionBar } from '@/components/ui/composition-bar';
import { OverviewTile } from './OverviewTile';

interface ComposizioneTileProps {
  /** Asset-class distribution with colours already remapped through ASSET_CLASS_CHART_INDEX. */
  data: PieChartData[];
  /** The tile's question as its eyebrow — "Composizione" on the Panoramica, "Classi" on Patrimonio. */
  eyebrow?: string;
  /** Optional secondary fact pinned to the bottom (Patrimonio links to Allocazione here). */
  footer?: ReactNode;
  className?: string;
}

/** "Dove sono i soldi?" — one stacked bar and a flat legend with value and share per class. */
export function ComposizioneTile({ data, eyebrow = 'Composizione', footer, className }: ComposizioneTileProps) {
  const classes = data
    .filter((d) => d.percentage > 0)
    .map((d) => ({ assetClass: d.assetClass ?? d.name, percentage: d.percentage }));

  return (
    <OverviewTile
      eyebrow={eyebrow}
      aside="per asset class"
      reading={describeComposition(classes)}
      className={className}
    >
      {data.length === 0 ? (
        <p className="mt-3 text-[13px] text-muted-foreground">Aggiungi asset per vedere la composizione.</p>
      ) : (
        <>
          <div className="mt-3.5">
            <CompositionBar
              segments={data
                .filter((d) => d.percentage > 0)
                .map((d) => ({ key: d.assetClass ?? d.name, label: d.name, pct: d.percentage, color: d.color }))}
              ariaLabel="Composizione per asset class"
              showLegend={false}
            />
          </div>
          <div className="mt-2 flex flex-col divide-y divide-border">
            {data.map((item) => (
              <div key={item.assetClass ?? item.name} className="flex items-center justify-between gap-2 py-[8px]">
                <span className="flex min-w-0 items-center gap-2 text-[13px] text-foreground">
                  <span
                    className="h-2 w-2 shrink-0 rounded-[2px]"
                    style={{ background: item.color }}
                    aria-hidden="true"
                  />
                  <span className="truncate">{item.name}</span>
                </span>
                <span className="flex shrink-0 items-baseline gap-2">
                  <span className="font-mono text-[13px] tabular-nums text-foreground">
                    {cachedFormatCurrencyEUR(item.value, true)}
                  </span>
                  <span className="w-[44px] text-right font-mono text-[11px] tabular-nums text-muted-foreground">
                    {formatPercentage(item.percentage, 1)}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </>
      )}
      {footer && <div className="mt-auto border-t border-border pt-3.5 text-[11px] text-muted-foreground">{footer}</div>}
    </OverviewTile>
  );
}
