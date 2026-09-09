'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { Narrative } from '@/lib/utils/narrative';
import type { CategorySlice } from '@/lib/utils/cashflowComposition';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import { cn } from '@/lib/utils';
import { Tile } from '@/components/ui/tile';
import { RankedRows } from '@/components/ui/ranked-rows';

/** Rows shown before «Mostra tutte» takes over — enough for the shape, not a whole taxonomy. */
const VISIBLE_ROWS = 8;

interface CategorieTileProps {
  eyebrow: string;
  kind: 'expenses' | 'income';
  /** The whole composition, ranked, keyed by category id. */
  slices: CategorySlice[];
  total: number;
  reading: Narrative | null;
  /** The category focused elsewhere on the page (`aria-current` on its row). */
  activeKey: string | null;
  onSelect: (slice: CategorySlice) => void;
  emptyCopy: string;
  labelClassName?: string;
  className?: string;
}

/**
 * «Dove vanno / da dove arrivano i soldi?» — the FULL composition of the period (Analisi is
 * where Tracciamento's «Tutte le categorie» link lands), as ranked rows a click opens. The
 * first eight rows show by default and the rest fold into a residual row, so the tile keeps
 * the grid's rhythm and the list still visibly adds up to its total.
 */
export function CategorieTile({ eyebrow, kind, slices, total, reading, activeKey, onSelect, emptyCopy, labelClassName, className }: CategorieTileProps) {
  const [showAll, setShowAll] = useState(false);
  const bySliceKey = new Map(slices.map((slice) => [slice.key, slice]));

  // A focused category beyond the fold stays visible: the row the reader clicked must not vanish.
  const activeHidden = activeKey !== null && slices.findIndex((slice) => slice.key === activeKey) >= VISIBLE_ROWS;
  const expanded = showAll || activeHidden;
  const visible = expanded ? slices : slices.slice(0, VISIBLE_ROWS);
  const hidden = expanded ? [] : slices.slice(VISIBLE_ROWS);
  const hiddenAmount = hidden.reduce((sum, slice) => sum + slice.value, 0);
  const hiddenLabel = hidden.length === 1 ? "Un'altra categoria" : `Altre ${hidden.length} categorie`;

  return (
    <Tile
      eyebrow={eyebrow}
      aside={<span className="font-mono tabular-nums">{cachedFormatCurrencyEUR(total, true)}</span>}
      reading={reading}
      className={className}
    >
      {slices.length === 0 ? (
        <p className="mt-3 text-[13px] text-muted-foreground">{emptyCopy}</p>
      ) : (
        <div className="mt-2 flex flex-1 flex-col">
          <RankedRows
            rows={visible.map((slice) => ({ key: slice.key, label: slice.name, amount: slice.value, percentage: slice.percentage }))}
            color={kind === 'income' ? 'var(--chart-2)' : 'var(--chart-1)'}
            labelClassName={labelClassName}
            ariaLabel={eyebrow}
            activeKey={activeKey}
            onRowClick={(row) => {
              const slice = bySliceKey.get(row.key);
              if (slice) onSelect(slice);
            }}
            remainder={
              hidden.length > 0
                ? { label: hiddenLabel, amount: hiddenAmount, percentage: total > 0 ? (hiddenAmount / total) * 100 : 0 }
                : null
            }
          />
          <div className="mt-auto flex items-center justify-between gap-3 border-t border-border pt-3.5 text-[11px] text-muted-foreground">
            <span>Una riga apre la scheda della categoria.</span>
            {slices.length > VISIBLE_ROWS && !activeHidden && (
              <button
                type="button"
                onClick={() => setShowAll((value) => !value)}
                aria-expanded={expanded}
                className="inline-flex min-h-[44px] shrink-0 items-center gap-1 text-foreground hover:text-muted-foreground desktop:min-h-0"
              >
                {expanded ? 'Mostra meno' : `Mostra tutte (${slices.length})`}
                <ChevronDown className={cn('h-3 w-3 transition-transform', expanded && 'rotate-180')} aria-hidden="true" />
              </button>
            )}
          </div>
        </div>
      )}
    </Tile>
  );
}
