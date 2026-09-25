'use client';

import type { Narrative } from '@/lib/utils/narrative';
import type { MonthlyReturnHeatmapData } from '@/types/performance';
import { Tile } from '@/components/ui/tile';
import { TileMethodNote } from '@/components/ui/tile-method-note';
import { HeatmapLegend, MonthlyReturnsHeatmap } from '@/components/performance/MonthlyReturnsHeatmap';

interface ConsistenzaTileProps {
  reading: Narrative;
  heatmap: MonthlyReturnHeatmapData[];
  className?: string;
}

/**
 * «Quanto è regolare?» — the positive months over the measured ones, the best and the worst, and
 * the heatmap of every month in the period, colour only: the figures are in the reading and in the
 * line under the grid, which reads the month that is tapped, focused or under the pointer. Months
 * of investment RETURN (cash-flow isolated), not net-worth growth months like Storico's — a
 * different question, a different number.
 */
export function ConsistenzaTile({ reading, heatmap, className }: ConsistenzaTileProps) {
  return (
    <Tile eyebrow="Consistenza" aside="mesi misurati" reading={reading} className={className}>
      {heatmap.length > 0 && (
        <>
          <MonthlyReturnsHeatmap data={heatmap} className="mt-4" />
          {/* Directly under the grid it keys. ONE `mt-auto` in the tile, the footer's: two of them
              split the row's slack and left the legend floating mid-void (2026-09-20). */}
          <HeatmapLegend className="pb-3.5 pt-2" />
        </>
      )}
      <TileMethodNote summary="Ogni cella è il rendimento di un mese." subject="Consistenza">
        <span className="block">
          Ogni mese isola il proprio rendimento sottraendo il cashflow di quel mese: versamenti e prelievi non contano come
          rendimento.
        </span>
        <span className="block">
          Il colore dice il segno, l&apos;intensità la misura: tre gradini, gli stessi della legenda. Un mese fuori dal periodo
          resta neutro.
        </span>
      </TileMethodNote>
    </Tile>
  );
}
