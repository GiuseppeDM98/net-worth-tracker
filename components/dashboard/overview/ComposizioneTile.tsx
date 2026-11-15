'use client';

import type { ReactNode } from 'react';
import type { PieChartData } from '@/types/assets';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import { formatPercentage } from '@/lib/services/chartService';
import { describeComposition } from '@/lib/utils/overviewNarrative';
import { compositionRing } from '@/lib/utils/compositionRing';
import { RING_REST_KEY } from '@/lib/utils/ringChart';
import { CompositionBar } from '@/components/ui/composition-bar';
import { RING_LAYOUT_CLASS, RING_ROWS_CLASS, RingChart } from '@/components/ui/ring-chart';
import type { TileCollapse } from '@/components/ui/tile';
import { OverviewTile } from './OverviewTile';

interface ComposizioneTileProps {
  /** Asset-class distribution with colours already remapped through ASSET_CLASS_CHART_INDEX. */
  data: PieChartData[];
  /** The tile's question as its eyebrow — "Composizione" on the Panoramica, "Classi" on Patrimonio. */
  eyebrow?: string;
  /** Optional secondary fact pinned to the bottom (Patrimonio links to Allocazione here). */
  footer?: ReactNode;
  /** The row below `desktop:` (`useMobileSections().collapse(id)`); `undefined` at 1440. */
  collapse?: TileCollapse;
  /** What the closed row says beside its eyebrow (`describeOverviewAsides`). */
  asideWhenClosed?: string;
  className?: string;
}

interface ClassRowProps {
  color: string;
  label: string;
  value: number;
  /** Share of the whole, 0-100 — printed with one decimal. */
  percentage: number;
  /** A second line under the label (the classes a fold holds). */
  caption?: string;
}

/** One class: its swatch, its name, its value and its share. */
function ClassRow({ color, label, value, percentage, caption }: ClassRowProps) {
  return (
    <div className="flex items-center justify-between gap-2 py-[8px]" data-class-row="">
      <span className="flex min-w-0 items-center gap-2 text-[13px] text-foreground">
        <span className="h-2 w-2 shrink-0 rounded-[2px]" style={{ background: color }} aria-hidden="true" />
        <span className="flex min-w-0 flex-col">
          <span className="truncate" data-class-label="">{label}</span>
          {caption && (
            <span className="line-clamp-2 text-[11px] text-muted-foreground" data-class-caption="">
              {caption}
            </span>
          )}
        </span>
      </span>
      <span className="flex shrink-0 items-baseline gap-2">
        <span className="font-mono text-[13px] tabular-nums text-foreground">{cachedFormatCurrencyEUR(value, true)}</span>
        <span className="w-[44px] text-right font-mono text-[11px] tabular-nums text-muted-foreground">
          {formatPercentage(percentage, 1)}
        </span>
      </span>
    </div>
  );
}

/**
 * "Dove sono i soldi?" — a ring of the classes over their rows as its legend when every class is
 * ≥ 0 (The Ring Rule); one stacked bar and the rows when a class is below zero or only one is
 * positive.
 */
export function ComposizioneTile({ data, eyebrow = 'Composizione', footer, collapse, asideWhenClosed, className }: ComposizioneTileProps) {
  const classes = data
    .filter((d) => d.percentage > 0)
    .map((d) => ({ assetClass: d.assetClass ?? d.name, percentage: d.percentage }));
  const ring = compositionRing(data);

  return (
    <OverviewTile
      eyebrow={eyebrow}
      aside="per asset class"
      asideWhenClosed={asideWhenClosed}
      collapse={collapse}
      reading={describeComposition(classes)}
      className={className}
    >
      {data.length === 0 ? (
        <p className="mt-3 text-[13px] text-muted-foreground">Aggiungi asset per vedere la composizione.</p>
      ) : ring ? (
        <div className="@container mt-3.5">
          <div className={RING_LAYOUT_CLASS}>
            <RingChart segments={ring.segments} centerValue={ring.total} centerLabel="patrimonio" ariaLabel="Composizione per asset class" />
            <div className={RING_ROWS_CLASS}>
              {/* A class at 0 € has no arc, so it has no row either: a key to nothing. */}
              <div className="flex flex-col divide-y divide-border">
                {ring.segments.map((segment) => (
                  <ClassRow
                    key={segment.key}
                    color={segment.color}
                    label={segment.label}
                    value={segment.value}
                    percentage={(segment.value / ring.total) * 100}
                    caption={segment.key === RING_REST_KEY ? ring.folded.map((d) => d.name).join(', ') : undefined}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
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
              <ClassRow
                key={item.assetClass ?? item.name}
                color={item.color}
                label={item.name}
                value={item.value}
                percentage={item.percentage}
              />
            ))}
          </div>
        </>
      )}
      {footer && <div className="mt-auto border-t border-border pt-3.5 text-[11px] text-muted-foreground">{footer}</div>}
    </OverviewTile>
  );
}
