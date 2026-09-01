'use client';

import type { Narrative } from '@/lib/utils/narrative';
import { Skeleton } from '@/components/ui/skeleton';
import type { YieldSummary } from '@/lib/utils/dividendAnalytics';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import { formatPercentage } from '@/lib/services/chartService';
import { getMetricValueColor } from '@/lib/utils/metricColors';
import { cn } from '@/lib/utils';
import { Tile, TILE_SUB_EYEBROW_CLASS } from '@/components/ui/tile';
import { NarrativeText } from '@/components/ui/narrative-text';

interface RendimentoTileProps {
  /** null while the server block is loading, or when no held instrument has a cost basis. */
  summary: YieldSummary | null;
  reading: Narrative | null;
  footer: Narrative | null;
  isLoading: boolean;
  isError: boolean;
  className?: string;
}

const KPI_VALUE_CLASS = 'font-mono text-[22px] font-bold leading-none tracking-[-0.03em] tabular-nums';

function Kpi({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="min-w-0">
      <p className={cn(TILE_SUB_EYEBROW_CLASS, 'mb-1.5')}>{label}</p>
      <p className={cn(KPI_VALUE_CLASS, muted ? 'text-muted-foreground' : 'text-foreground')}>{value}</p>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 py-[9px]">
      <span className="min-w-0 flex-1 text-[13px] text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

/**
 * "Quanto rendono, davvero?" — yield on cost against yield on today's market value, plus how
 * fast the dividend per share is growing.
 *
 * The ONE tile on the page that does not follow the period axis: every figure here is measured
 * by the server over the trailing twelve months on the CURRENT holding, and DPS growth over
 * closed calendar years. That is stated in the aside and spelled out in the footer, because a
 * view that shows figures from a window other than the picker's must name that window
 * (AGENTS.md → Centri di Costo).
 *
 * A failed fetch is an alert, not an empty tile: the rest of the page keeps working.
 */
export function RendimentoTile({ summary, reading, footer, isLoading, isError, className }: RendimentoTileProps) {
  return (
    <Tile
      eyebrow="Rendimento"
      aside={
        <span>
          ultimi <span className="font-mono font-medium tabular-nums">12</span> mesi
        </span>
      }
      reading={summary ? reading : null}
      className={className}
    >
      {isError ? (
        <p role="alert" className="mt-3 text-[13px] leading-[1.45] text-muted-foreground">
          Le metriche di rendimento non sono disponibili in questo momento. Gli incassi qui sopra sono aggiornati.
        </p>
      ) : isLoading ? (
        <div className="mt-4 space-y-3" aria-hidden="true">
          <Skeleton className="h-[22px] w-2/3" />
          <Skeleton className="h-3.5 w-full" />
          <Skeleton className="h-3.5 w-4/5" />
        </div>
      ) : !summary ? (
        <p className="mt-3 text-[13px] leading-[1.45] text-muted-foreground">
          Serve un costo medio sugli strumenti per misurare un rendimento sul costo. Aggiungilo dal Patrimonio e
          questa tessera si popola da sola.
        </p>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-3 gap-3.5">
            <Kpi label="YOC lordo" value={formatPercentage(summary.yocGross ?? 0, 2)} />
            <Kpi
              label="YOC netto"
              value={summary.yocNet === null ? '—' : formatPercentage(summary.yocNet, 2)}
              muted={summary.yocNet === null}
            />
            <Kpi
              label="Corrente"
              value={summary.currentYieldGross === null ? '—' : formatPercentage(summary.currentYieldGross, 2)}
              muted
            />
          </div>

          <div className="mt-4 flex flex-col divide-y divide-border border-t border-border">
            <Row label="Crescita DPS · mediana anno su anno">
              <span
                className={cn(
                  'font-mono text-[13px] font-semibold tabular-nums',
                  summary.dpsMedianGrowth === null
                    ? 'text-muted-foreground'
                    : getMetricValueColor(summary.dpsMedianGrowth, 'percentage'),
                )}
              >
                {summary.dpsMedianGrowth === null
                  ? '—'
                  : `${summary.dpsMedianGrowth >= 0 ? '+' : '−'}${formatPercentage(Math.abs(summary.dpsMedianGrowth), 1)}`}
              </span>
            </Row>
            <Row label="Dividendi lordi degli ultimi 12 mesi">
              <span className="font-mono text-[13px] tabular-nums text-foreground">
                {summary.ttmGross === null ? '—' : cachedFormatCurrencyEUR(summary.ttmGross, true)}
              </span>
            </Row>
            <Row label="Costo del possesso attuale">
              <span className="font-mono text-[13px] tabular-nums text-foreground">
                {summary.costBasis === null ? '—' : cachedFormatCurrencyEUR(summary.costBasis, true)}
              </span>
            </Row>
          </div>
        </>
      )}

      {summary && footer && (
        <NarrativeText
          segments={footer}
          className="mt-auto border-t border-border pt-3.5 text-[11px] leading-[1.45] text-muted-foreground"
          figureClassName="font-medium"
        />
      )}
    </Tile>
  );
}
