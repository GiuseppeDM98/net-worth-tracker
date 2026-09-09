'use client';

import type { Narrative } from '@/lib/utils/narrative';
import type { CostCenterCategorySlice } from '@/types/costCenters';
import { Tile } from '@/components/ui/tile';
import { NarrativeText } from '@/components/ui/narrative-text';
import { RankedRows } from '@/components/ui/ranked-rows';

interface CategorieTileProps {
  /** Sorted by the pure layer; the «Altro» tail slice, when present, is the last one. */
  slices: CostCenterCategorySlice[];
  reading: Narrative;
  footer: Narrative;
  /** The center's own colour — the bars take it, as the list's swatch and the hero's bars do. */
  color: string;
  className?: string;
}

const OTHER_KEY = 'Altro';

/**
 * «Di cosa è fatto il costo?» — the center's spending by category as ranked rows: label,
 * 3px bar (rank), mono amount, share; the «Altro» tail closes the list as the residual so
 * the shares visibly add up (The Narrative Honesty Rule).
 */
export function CategorieTile({ slices, reading, footer, color, className }: CategorieTileProps) {
  const named = slices.filter((slice) => slice.key !== OTHER_KEY);
  const other = slices.find((slice) => slice.key === OTHER_KEY);

  return (
    <Tile eyebrow="Per categoria" aside={<span>in totale</span>} reading={reading} className={className}>
      {named.length > 0 && (
        <div className="mt-2">
          <RankedRows
            rows={named.map((slice) => ({ key: slice.key, label: slice.categoryName, amount: slice.total, percentage: slice.pct * 100 }))}
            color={color}
            remainder={other ? { label: other.categoryName, amount: other.total, percentage: other.pct * 100 } : null}
          />
        </div>
      )}
      <div className="mt-auto border-t border-border pt-3.5">
        <NarrativeText segments={footer} className="text-[11px] text-muted-foreground" figureClassName="font-medium" />
      </div>
    </Tile>
  );
}
