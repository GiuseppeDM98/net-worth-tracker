'use client';

/**
 * BILANCIAMENTO — «quanto sono lontano dal piano?»: the band toggle as the aside, the score ring
 * beside two KPIs (three under leverage), the current and the target mix as two stacked bars over
 * ONE legend, and a footer on what the total holds but cannot move and what it leaves out.
 *
 * This is the old hero's companion card and its composition bar folded into one tile, at the
 * tile's cadence. Two things it keeps straight on purpose. The score and the misallocation are
 * band-INDEPENDENT (`computeBalanceScore`) while the count of classes off target is the band's:
 * the ring does not move when the toggle in the aside does, only the count and the reading do, so
 * the reader sees a fixed measurement beside a tunable classification instead of a gauge that
 * agrees with whatever threshold was picked. And a drift is neither a gain nor a loss: nothing
 * here wears a sign token — the arc takes an action hue, every figure stays `text-foreground`.
 *
 * Two bars over one legend, rather than a legend per bar: the question is the DISTANCE between
 * the two mixes, and two tracks sharing a left edge show it as a misalignment of segment
 * boundaries; «58,3% → 55%» beside each swatch says the same distance in numbers, once. The tile
 * computes nothing: figures come from `allocazioneSummary.ts`, words from `allocazioneNarrative.ts`.
 */

import type { ReactNode } from 'react';
import type { Narrative } from '@/lib/utils/narrative';
import type { RebalanceBand } from '@/lib/utils/allocationUtils';
import { buildCompositionLegend, type CompositionPair, type CompositionSegment } from '@/lib/utils/allocazioneSummary';
import { formatLeverage } from '@/lib/utils/allocazioneNarrative';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import { formatPercentage } from '@/lib/services/chartService';
import { useChartColors } from '@/lib/hooks/useChartColors';
import { CHART_COLORS } from '@/lib/constants/colors';
import { cn } from '@/lib/utils';
import { Tile, TILE_SUB_EYEBROW_CLASS } from '@/components/ui/tile';
import { NarrativeText } from '@/components/ui/narrative-text';
import { CompositionBar, type CompositionBarSegment } from '@/components/ui/composition-bar';
import { BandToggle } from '@/components/allocation/BandToggle';
import { BalanceRing } from '@/components/allocation/BalanceRing';

interface BilanciamentoTileProps {
  /** `describeBalance(...)`. */
  reading: Narrative;
  band: RebalanceBand;
  onBandChange: (band: RebalanceBand) => void;
  /** `BalanceScore.score`, 0-100. */
  score: number;
  /** Share of the allocated total that sits in the wrong class, and the euro it amounts to. */
  misallocationPct: number;
  misallocationValue: number;
  offTargetCount: number;
  classCount: number;
  offTargetLabels: string[];
  /** The third KPI, only when the portfolio or its target is leveraged. */
  leverage: { current: number; target: number } | null;
  /** `buildCompositionPair(...)`. */
  composition: CompositionPair;
  /** `describeBalanceFooter(...)`; null when nothing is frozen or excluded. */
  footer: Narrative | null;
  className?: string;
}

const KPI_VALUE_CLASS = 'mt-1.5 font-mono text-[22px] font-bold leading-none tracking-[-0.03em] tabular-nums text-foreground';

function Kpi({ label, value, caption }: { label: string; value: ReactNode; caption: string }) {
  return (
    <div className="min-w-0">
      <p className={TILE_SUB_EYEBROW_CLASS}>{label}</p>
      <p className={KPI_VALUE_CLASS}>{value}</p>
      <p className="mt-1.5 text-[11px] leading-[1.4] text-muted-foreground">{caption}</p>
    </div>
  );
}

function describeBar(kind: string, segments: CompositionBarSegment[]): string {
  return `Composizione ${kind}: ${segments.map((segment) => `${segment.label} ${formatPercentage(segment.displayPct ?? segment.pct, 1)}`).join(', ')}`;
}

/** A label in the sub-eyebrow register and the bar; the two rows share the label width so the tracks align. */
function BarRow({ label, segments, ariaLabel }: { label: string; segments: CompositionBarSegment[]; ariaLabel: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className={cn(TILE_SUB_EYEBROW_CLASS, 'w-14 shrink-0')}>{label}</span>
      <div className="min-w-0 flex-1">
        <CompositionBar segments={segments} ariaLabel={ariaLabel} showLegend={false} />
      </div>
    </div>
  );
}

export function BilanciamentoTile({
  reading,
  band,
  onBandChange,
  score,
  misallocationPct,
  misallocationValue,
  offTargetCount,
  classCount,
  offTargetLabels,
  leverage,
  composition,
  footer,
  className,
}: BilanciamentoTileProps) {
  const chartColors = useChartColors();
  // The class's slot is fixed by ASSET_CLASS_CHART_INDEX, so a class is the same hue here and on Storico.
  const colorOf = (segment: { chartIndex: number }): string =>
    chartColors[segment.chartIndex] ?? CHART_COLORS[segment.chartIndex] ?? CHART_COLORS[0];
  const toBarSegment = (segment: CompositionSegment): CompositionBarSegment => ({
    key: segment.key,
    label: segment.label,
    pct: segment.pct,
    ...(segment.displayPct !== undefined ? { displayPct: segment.displayPct } : {}),
    color: colorOf(segment),
  });

  const currentSegments = composition.current.map(toBarSegment);
  const targetSegments = composition.target.map(toBarSegment);
  const hasTarget = targetSegments.length > 0;
  const legend = buildCompositionLegend(composition);

  return (
    <Tile
      eyebrow="Bilanciamento"
      aside={<BandToggle band={band} onChange={onBandChange} />}
      reading={reading}
      className={className}
      ariaLabel="Bilanciamento dell'allocazione"
    >
      <div className="mt-4 flex items-center gap-5">
        <BalanceRing score={score} />
        <div className="grid min-w-0 flex-1 grid-cols-2 gap-x-4 gap-y-3">
          <Kpi
            label="Fuori posizione"
            value={formatPercentage(misallocationPct, 1)}
            caption={`${cachedFormatCurrencyEUR(misallocationValue, true)} da spostare`}
          />
          <Kpi
            label="Fuori target"
            value={
              <>
                {offTargetCount}{' '}
                <span className="text-[13px] font-normal tracking-normal text-muted-foreground">su {classCount}</span>
              </>
            }
            caption={offTargetLabels.length > 0 ? offTargetLabels.join(', ') : 'nessuna'}
          />
          {leverage && <Kpi label="Leva" value={formatLeverage(leverage.current)} caption={`target ${formatLeverage(leverage.target)}`} />}
        </div>
      </div>

      {currentSegments.length > 0 && (
        <div className="mt-4 flex flex-col gap-2.5">
          <BarRow label="Corrente" segments={currentSegments} ariaLabel={describeBar('corrente', currentSegments)} />
          {hasTarget && <BarRow label="Target" segments={targetSegments} ariaLabel={describeBar('target', targetSegments)} />}
          <ul className="flex flex-wrap gap-x-4 gap-y-1.5" aria-label={hasTarget ? 'Classi: corrente → target' : 'Classi: corrente'}>
            {legend.map((entry) => (
              <li key={entry.key} className="flex items-center gap-1.5">
                <span className="h-2 w-2 shrink-0 rounded-[2px]" style={{ backgroundColor: colorOf(entry) }} aria-hidden="true" />
                <span className="text-[11px] text-muted-foreground">{entry.label}</span>
                <span className="font-mono text-[11px] tabular-nums text-foreground">
                  {entry.current === null ? '—' : formatPercentage(entry.current, 1)}
                  {hasTarget && ` → ${entry.target === null ? '—' : formatPercentage(entry.target, 0)}`}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {footer && (
        <div className="mt-auto border-t border-border pt-3.5">
          <NarrativeText segments={footer} className="text-[11px] leading-[1.5] text-muted-foreground" figureClassName="font-medium text-foreground" />
        </div>
      )}
    </Tile>
  );
}
