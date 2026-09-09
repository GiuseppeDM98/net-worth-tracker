'use client';

import type { Narrative } from '@/lib/utils/narrative';
import type { CenterSummary } from '@/lib/utils/costCenterSummary';
import type { CostCenter } from '@/types/costCenters';
import { describeDormantRow, describeIdle } from '@/lib/utils/costCenterNarrative';
import { resolveCostCenterColor } from '@/lib/utils/costCenterColors';
import { Tile } from '@/components/ui/tile';
import { NarrativeText } from '@/components/ui/narrative-text';

interface DormientiTileProps {
  /** Longest idle first, never-used last — the pure layer's order. */
  centers: CenterSummary[];
  aside: Narrative;
  reading: Narrative;
  footer: Narrative;
  palette: string[];
  onOpen: (center: CostCenter) => void;
  className?: string;
}

/**
 * «Quali progetti sono fermi?» — the active centers idle past the threshold, or never used,
 * each with its last expense and its lifetime cost. Dormancy is measured on the whole
 * history (`resolveLastActivityDate`), never on a window. A row opens the detail, where
 * the center can be archived.
 */
export function DormientiTile({ centers, aside, reading, footer, palette, onOpen, className }: DormientiTileProps) {
  return (
    <Tile eyebrow="Dormienti" aside={<NarrativeText segments={aside} figureClassName="font-medium" />} reading={reading} className={className}>
      {centers.length > 0 && (
        <ul className="mt-2 flex flex-col divide-y divide-border">
          {centers.map((center) => {
            const idle = describeIdle(center);
            return (
              <li key={center.center.id}>
                <button
                  type="button"
                  onClick={() => onOpen(center.center)}
                  className="flex min-h-[44px] w-full items-center justify-between gap-3 py-2.5 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset desktop:-mx-2 desktop:w-[calc(100%+16px)] desktop:rounded-md desktop:px-2"
                >
                  <span className="sr-only">Apri </span>
                  <span className="flex min-w-0 items-center gap-2.5">
                    <span
                      className="h-2 w-2 shrink-0 rounded-[2px]"
                      style={{ background: resolveCostCenterColor(center.center.color, center.center.id, palette) }}
                      aria-hidden="true"
                    />
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span className="truncate text-[13px] text-foreground">{center.center.name}</span>
                      <NarrativeText segments={describeDormantRow(center)} className="text-[11px] text-muted-foreground" figureClassName="font-medium" />
                    </span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end">
                    <span className="font-mono text-[13px] font-semibold tabular-nums text-foreground">{idle.value}</span>
                    <span className="text-[11px] text-muted-foreground">{idle.caption}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <div className="mt-auto border-t border-border pt-3.5">
        <NarrativeText segments={footer} className="text-[11px] text-muted-foreground" figureClassName="font-medium" />
      </div>
    </Tile>
  );
}
