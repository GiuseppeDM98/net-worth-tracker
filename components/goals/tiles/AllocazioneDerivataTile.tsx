'use client';

/**
 * ALLOCAZIONE DERIVATA — «che mix chiedono gli obiettivi?»: the target the goals still to fill
 * derive (gap × priority) over the allocation the assigned quotas actually hold, as two bars on
 * ONE legend (Allocazione's Bilanciamento rule). Only rendered with goal-driven allocation on.
 *
 * Colours are the per-class chart slots the whole app uses (`ASSET_CLASS_CHART_INDEX` through
 * `useChartColors`), so bonds are the same hue here, on Allocazione and on Storico — the old
 * comparison bar carried a map of its own, which is the drift the one source exists to prevent.
 */

import type { Narrative } from '@/lib/utils/narrative';
import type { DerivedAllocationRow } from '@/lib/utils/goalsSummary';
import { ASSET_CLASS_CHART_INDEX } from '@/lib/utils/allocationUtils';
import { formatPercentage } from '@/lib/services/chartService';
import { useChartColors } from '@/lib/hooks/useChartColors';
import { Tile, TILE_SUB_EYEBROW_CLASS } from '@/components/ui/tile';
import { NarrativeText } from '@/components/ui/narrative-text';
import { CompositionBar } from '@/components/ui/composition-bar';

interface AllocazioneDerivataTileProps {
  reading: Narrative;
  aside: string;
  rows: DerivedAllocationRow[];
  footer: Narrative;
  className?: string;
}

function pct(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return formatPercentage(rounded, Number.isInteger(rounded) ? 0 : 1);
}

export function AllocazioneDerivataTile({ reading, aside, rows, footer, className }: AllocazioneDerivataTileProps) {
  const chartColors = useChartColors();
  const colorOf = (assetClass: string) => chartColors[ASSET_CLASS_CHART_INDEX[assetClass] ?? 0];

  const derived = rows.filter((r) => r.derivedPct > 0).map((r) => ({ key: r.assetClass, label: r.label, pct: r.derivedPct, color: colorOf(r.assetClass) }));
  const assigned = rows.filter((r) => r.assignedPct > 0).map((r) => ({ key: r.assetClass, label: r.label, pct: r.assignedPct, color: colorOf(r.assetClass) }));

  return (
    <Tile eyebrow="Allocazione derivata" aside={aside} reading={reading} ariaLabel="Allocazione derivata" className={className}>
      <div className="mt-3.5 flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <p className={TILE_SUB_EYEBROW_CLASS}>Derivata dagli obiettivi</p>
          <CompositionBar segments={derived} ariaLabel="Allocazione derivata dagli obiettivi" showLegend={false} />
        </div>
        <div className="flex flex-col gap-1.5">
          <p className={TILE_SUB_EYEBROW_CLASS}>Assegnata oggi</p>
          {assigned.length > 0 ? (
            <CompositionBar segments={assigned} ariaLabel="Allocazione delle quote assegnate" showLegend={false} />
          ) : (
            <p className="text-[11px] text-muted-foreground">Nessuna quota assegnata.</p>
          )}
        </div>
        <ul className="flex flex-wrap gap-x-3 gap-y-1.5" aria-label="Classi: quota derivata e quota assegnata">
          {rows.map((row) => (
            <li key={row.assetClass} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <span className="h-2 w-2 shrink-0 rounded-[2px]" style={{ background: colorOf(row.assetClass) }} aria-hidden="true" />
              <span>{row.label}</span>
              <span className="font-mono tabular-nums text-foreground">
                {pct(row.derivedPct)} · {pct(row.assignedPct)}
              </span>
            </li>
          ))}
        </ul>
      </div>
      <NarrativeText segments={footer} className="mt-auto border-t border-border pt-3.5 text-[11px] leading-[1.45] text-muted-foreground" figureClassName="font-medium" />
    </Tile>
  );
}
