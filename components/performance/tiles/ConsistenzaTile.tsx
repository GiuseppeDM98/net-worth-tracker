'use client';

import type { Narrative } from '@/lib/utils/narrative';
import type { MonthlyReturnHeatmapData } from '@/types/performance';
import { Tile } from '@/components/ui/tile';
import { HeatmapLegend, MonthlyReturnsHeatmap } from '@/components/performance/MonthlyReturnsHeatmap';

interface ConsistenzaTileProps {
  reading: Narrative;
  heatmap: MonthlyReturnHeatmapData[];
  className?: string;
}

/**
 * «Quanto è regolare?» — the positive months over the measured ones, the best and the worst, and
 * the heatmap of every month in the period, colour only: the figures are in the reading, in each
 * cell's title and in the hover reading. Months of investment RETURN (cash-flow isolated), not
 * net-worth growth months like Storico's — a different question, a different number.
 */
export function ConsistenzaTile({ reading, heatmap, className }: ConsistenzaTileProps) {
  return (
    <Tile eyebrow="Consistenza" aside="mesi misurati" reading={reading} className={className}>
      {heatmap.length > 0 && (
        <>
          <MonthlyReturnsHeatmap data={heatmap} className="mt-4" />
          {/* Pinned above the footer: the row's height is the neighbours', the slack sits between grid and legend. */}
          <HeatmapLegend className="mt-auto pt-3" />
        </>
      )}
      <p className="mt-auto border-t border-border pt-3.5 text-[11px] leading-[1.45] text-muted-foreground">
        Ogni mese isola il proprio rendimento sottraendo il cashflow di quel mese: versamenti e prelievi non contano come
        rendimento. Con il mouse il mese sotto il puntatore si legge.
      </p>
    </Tile>
  );
}
