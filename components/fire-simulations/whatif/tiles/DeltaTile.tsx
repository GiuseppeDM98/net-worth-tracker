'use client';

/**
 * DELTA — «di quanto cambia?»: every figure of the plan as one row — before → after on the
 * right, the signed change under it — in two blocks, the FIRE plan and, when an age is saved in
 * Coast FIRE, the Coast plan. The rows come formatted from `buildDeltaRows` (words), the sign
 * from the direction that is good for that row: a year later is a loss, a lower FIRE number a
 * gain, a bigger Coast gap a loss. An unchanged row says «invariato», muted — never a «+0 €».
 *
 * The old page had the same figures as two peer cards (FIRE / Coast) with five rows each;
 * inside a tile they are one list in two blocks, so the reader compares eight numbers at once.
 */

import type { Narrative } from '@/lib/utils/narrative';
import type { DeltaRow } from '@/lib/utils/whatIfNarrative';
import { cn } from '@/lib/utils';
import { Tile, TILE_SUB_EYEBROW_CLASS } from '@/components/ui/tile';
import { NarrativeText } from '@/components/ui/narrative-text';

interface DeltaTileProps {
  /** `describeDelta(summary)`. */
  reading: Narrative;
  rows: { fire: DeltaRow[]; coast: DeltaRow[] | null };
  /** The Coast target age, for the block's label. */
  coastRetirementAge: number | null;
  /** `describeDeltaFooter(hasCoast)`. */
  footer: Narrative;
  className?: string;
}

function RowList({ rows, ariaLabel }: { rows: DeltaRow[]; ariaLabel: string }) {
  return (
    <ul className="mt-1 flex flex-col divide-y divide-border" aria-label={ariaLabel}>
      {/* The label keeps its line; when the values need the room («Raggiunto → Raggiunto» in a
          3-column tile) they drop to a second line, right-aligned, instead of splitting the label
          in three (the Per classe row's rule). */}
      {rows.map((row) => (
        <li key={row.key} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 py-[9px]">
          <span className="min-w-0 text-[13px] text-muted-foreground">{row.label}</span>
          <span className="ml-auto flex shrink-0 flex-col items-end">
            <span className="font-mono text-[13px] tabular-nums">
              <span className="text-muted-foreground">{row.before}</span>
              <span className="mx-1 text-muted-foreground/50" aria-hidden="true">
                →
              </span>
              <span className="sr-only">diventa</span>
              <span className="font-semibold text-foreground">{row.after}</span>
            </span>
            {row.change && (
              <span
                className={cn(
                  'font-mono text-[11px] tabular-nums',
                  row.sign === 'positive' && 'text-positive',
                  row.sign === 'negative' && 'text-destructive',
                  !row.sign && 'text-muted-foreground',
                )}
              >
                {row.change}
              </span>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function DeltaTile({ reading, rows, coastRetirementAge, footer, className }: DeltaTileProps) {
  return (
    <Tile eyebrow="Delta" aside="prima → dopo" reading={reading} ariaLabel="Delta dell'evento" className={className}>
      <p className={cn(TILE_SUB_EYEBROW_CLASS, 'mt-3.5')}>FIRE</p>
      <RowList rows={rows.fire} ariaLabel="Prima e dopo per il FIRE" />

      {rows.coast && (
        <>
          <p className={cn(TILE_SUB_EYEBROW_CLASS, 'mt-4')}>Coast FIRE{coastRetirementAge !== null && ` · a ${coastRetirementAge} anni`}</p>
          <RowList rows={rows.coast} ariaLabel="Prima e dopo per il Coast FIRE" />
        </>
      )}

      <NarrativeText segments={footer} className="mt-auto border-t border-border pt-3.5 text-[11px] leading-[1.45] text-muted-foreground" />
    </Tile>
  );
}
