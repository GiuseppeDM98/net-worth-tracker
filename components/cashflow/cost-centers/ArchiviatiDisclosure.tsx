'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { Narrative } from '@/lib/utils/narrative';
import type { CenterRankedRow } from '@/lib/utils/costCenterSummary';
import type { CostCenter } from '@/types/costCenters';
import { describeArchivedRow } from '@/lib/utils/costCenterNarrative';
import { resolveCostCenterColor } from '@/lib/utils/costCenterColors';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import { cn } from '@/lib/utils';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Tile, TILE_EYEBROW_CLASS } from '@/components/ui/tile';
import { NarrativeText } from '@/components/ui/narrative-text';

interface ArchiviatiDisclosureProps {
  rows: CenterRankedRow[];
  /** «2 centri · 2440 € · esclusi dal totale» */
  summary: Narrative;
  palette: string[];
  onOpen: (center: CostCenter) => void;
}

/**
 * The archived centers, below the grid behind a disclosure — closed projects the total
 * leaves out (the Totale tile's footer says so). Like Budget's «Impostazioni»: a row with
 * the eyebrow and the summary, a chevron, and one tile inside. A row opens the detail,
 * where the center can be restored.
 */
export function ArchiviatiDisclosure({ rows, summary, palette, onOpen }: ArchiviatiDisclosureProps) {
  const [open, setOpen] = useState(false);
  if (rows.length === 0) return null;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex w-full items-center justify-between gap-3 border-t border-border/40 py-3 text-left" aria-label="Centri archiviati">
        <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className={TILE_EYEBROW_CLASS}>Archiviati</span>
          <NarrativeText segments={summary} className="text-[13px] text-muted-foreground" figureClassName="font-medium" />
        </span>
        <ChevronDown className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} aria-hidden="true" />
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-1">
        <Tile eyebrow="Centri archiviati" aside={<span>esclusi dal totale</span>}>
          <ul className="mt-2 flex flex-col divide-y divide-border">
            {rows.map(({ summary: center }) => (
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
                      <NarrativeText segments={describeArchivedRow(center)} className="text-[11px] text-muted-foreground" figureClassName="font-medium" />
                    </span>
                  </span>
                  <span className="shrink-0 font-mono text-[13px] font-semibold tabular-nums text-foreground">{cachedFormatCurrencyEUR(center.total, true)}</span>
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-auto border-t border-border pt-3.5 text-[11px] text-muted-foreground">Apri un centro archiviato per ripristinarlo.</p>
        </Tile>
      </CollapsibleContent>
    </Collapsible>
  );
}
