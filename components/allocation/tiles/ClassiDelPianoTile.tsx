'use client';

/**
 * ClassiDelPianoTile — «dove porta le classi il piano, mese per mese?» (doc/pac-ottimizzatore § RV5,
 * PO15). The right half of Allocazione's Accumulo tab with an active plan: the class trajectory in
 * view (`ClassDriftChart` with its cursor on the month), the sentence that says when each class is
 * back in band (said once, in the page verdict, not repeated here), and under it the strip that stood alone in the old `AccumuloTile` — one row per
 * class the plan touches (D11): today's share and the target on one line, the track under it
 * (fill = today, hairline = target, ring = end of the plan), the drift in pp as the muted second
 * figure. Amber marks only a class OUT of band now, on its drift line and its re-entry month, never
 * the whole row (owner's call, 2026-09-25). Prices are today's: the chart says so in its legend.
 */
import { useState } from 'react';
import type { AccumulationPlan } from '@/types/accumulationPlan';
import type { RebalanceBand } from '@/lib/utils/allocationUtils';
import { ASSET_CLASS_LABELS } from '@/lib/utils/allocationUtils';
import { selectClassStripRows, type ClassTrajectoryPoint } from '@/lib/utils/accumulationPlanUtils';
import { getAssetClassCssVar } from '@/lib/constants/colors';
import { Tile, TILE_SUB_EYEBROW_CLASS, type TileCollapse } from '@/components/ui/tile';
import { ClassDriftChart } from '@/components/allocation/ClassDriftChart';
import { TargetTick } from '@/components/allocation/TargetTick';
import {
  ACCUMULO_CLASSES_TILE_ASIDE,
  ACCUMULO_CLASSES_TILE_EYEBROW,
  ACCUMULO_CLASS_STRIP_LEGEND,
  describeClassStripItem,
  monthLabelLong,
} from '@/lib/utils/accumulationNarrative';

interface ClassiDelPianoTileProps {
  plan: AccumulationPlan;
  trajectory: ClassTrajectoryPoint[];
  /** `monthIndexOf(plan, today)`; the chart's cursor starts on the open month. */
  currentIndex: number;
  band: RebalanceBand;
  /** The row of the phone composition (The Closed-Row Rule); absent at 1440. */
  collapse?: TileCollapse;
  asideWhenClosed?: string;
}

export function ClassiDelPianoTile({ plan, trajectory, currentIndex, band, collapse, asideWhenClosed }: ClassiDelPianoTileProps) {
  const clampedIndex = Math.min(Math.max(currentIndex, 0), plan.months);
  // `null` = the cursor has not been moved: it follows the open month, so a month that turns while
  // the page is open moves it too.
  const [picked, setPicked] = useState<number | null>(null);
  const selectedIndex = picked ?? clampedIndex;

  const classRows = selectClassStripRows(trajectory, clampedIndex);
  const classStrip = classRows.map((row) => ({
    row,
    item: describeClassStripItem({
      label: ASSET_CLASS_LABELS[row.assetClass] ?? row.assetClass,
      currentPct: row.currentPct,
      targetPct: row.targetPct,
      currentDriftPp: row.currentDriftPp,
      finalDriftPp: row.finalDriftPp,
      outOfBandNow: row.outOfBandNow,
      reentersAt: row.reentryMonth ? monthLabelLong(row.reentryMonth === 'baseline' ? plan.startMonth : row.reentryMonth, false) : undefined,
    }),
  }));

  return (
    <Tile eyebrow={ACCUMULO_CLASSES_TILE_EYEBROW} aside={ACCUMULO_CLASSES_TILE_ASIDE} asideWhenClosed={asideWhenClosed} collapse={collapse}>
      {trajectory.length > 1 && (
        <ClassDriftChart className="mt-3" points={trajectory} band={band} height={180} selectedIndex={selectedIndex} onSelect={setPicked} />
      )}

      {classStrip.length > 0 && (
        <div className="mt-4 min-w-0 border-t border-border pt-3.5">
          <p className={TILE_SUB_EYEBROW_CLASS}>Oggi e a fine piano</p>
          <p className="mt-0.5 text-[10px] text-muted-foreground">{ACCUMULO_CLASS_STRIP_LEGEND}</p>
          <ul className="mt-2.5 space-y-3">
            {classStrip.map(({ row, item }) => (
              <li key={row.assetClass}>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 text-[13px] text-foreground">{item.label}</span>
                  <span className="shrink-0 font-mono text-[12px] tabular-nums">
                    <span className="font-semibold text-foreground">{item.current}</span>
                    <span className="ml-1.5 text-muted-foreground">{item.target}</span>
                  </span>
                </div>
                <TargetTick
                  className="mt-1"
                  color={`var(--allocation-row-bar, var(${getAssetClassCssVar(row.assetClass)}))`}
                  currentPercentage={row.currentPct}
                  targetPercentage={row.targetPct}
                  projectedPercentage={row.finalPct}
                />
                <p className={`mt-0.5 font-mono text-[10px] tabular-nums ${item.outOfBandNow ? 'text-warning-foreground' : 'text-muted-foreground'}`}>
                  {item.secondary}
                  {item.note && <span className="font-sans"> · {item.note}</span>}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Tile>
  );
}
