'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { Narrative } from '@/lib/utils/narrative';
import type { CategorySlice } from '@/lib/utils/cashflowComposition';
import { buildRingShares } from '@/lib/utils/analisiSummary';
import { RING_CATEGORY_COLORS, RING_REST_COLOR } from '@/lib/utils/ringChart';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import { cn } from '@/lib/utils';
import { Tile, TILE_EYEBROW_CLASS, TILE_FOOTER_ACTION_CLASS, type TileCollapse } from '@/components/ui/tile';
import { RankedRows } from '@/components/ui/ranked-rows';
import { RING_LAYOUT_CLASS, RING_ROWS_CLASS, RingChart } from '@/components/ui/ring-chart';

/** The ring's named parts: three categories and the rest. */
const RING_PARTS = 3;

interface EntrateTileProps {
  /** The income by category, ranked (`buildCategoryRanking`'s income slices). */
  slices: CategorySlice[];
  total: number;
  /** `describeCategoryShare(incomeRanking, 'income')`. */
  reading: Narrative | null;
  /** The category focused elsewhere on the page (`aria-current` on its row). */
  activeKey: string | null;
  onSelect: (slice: CategorySlice) => void;
  /** The row below `desktop:` (`useMobileSections().collapse(id)`); `undefined` at 1440. */
  collapse?: TileCollapse;
  /** What the closed row says beside its eyebrow, in words (The Closed-Row Rule). */
  asideWhenClosed?: string;
  className?: string;
}

/**
 * «Da dove arrivano i soldi?» — the income as a ring of its first three categories and the rest, the
 * rows its legend (2026-11-12). The ring keeps its four parts when «Mostra tutte» lists every
 * category: the rows past the third are the rest's, and take its swatch. One category is no ring
 * (The Ring Rule): the total stands as the hero line.
 */
export function EntrateTile({ slices, total, reading, activeKey, onSelect, collapse, asideWhenClosed, className }: EntrateTileProps) {
  const [showAll, setShowAll] = useState(false);
  const bySliceKey = new Map(slices.map((slice) => [slice.key, slice]));
  const head = buildRingShares(slices, RING_PARTS);
  const colorOf = (index: number, rest: boolean) => (rest ? RING_REST_COLOR : RING_CATEGORY_COLORS[index % RING_CATEGORY_COLORS.length]);
  const segments = head.map((share, index) => ({ key: share.key, label: share.label, value: share.value, color: colorOf(index, share.rest) }));

  // A focused category inside the rest stays visible: the row the reader clicked must not vanish.
  const folded = head.some((share) => share.rest);
  const activeHidden = folded && activeKey !== null && !head.some((share) => share.key === activeKey) && bySliceKey.has(activeKey);
  const expanded = folded && (showAll || activeHidden);
  const shares = expanded ? buildRingShares(slices, slices.length) : head;
  const oneCategory = slices.length === 1;

  const legend = (
    <RankedRows
      rows={shares
        .filter((share) => !share.rest)
        .map((share, index) => ({ key: share.key, label: share.label, amount: share.value, percentage: share.printedPercentage, swatch: colorOf(index < RING_PARTS ? index : 0, index >= RING_PARTS) }))}
      color="var(--chart-2)"
      bars={false}
      ariaLabel="Entrate per categoria"
      activeKey={activeKey}
      onRowClick={(row) => {
        const slice = bySliceKey.get(row.key);
        if (slice) onSelect(slice);
      }}
      remainders={shares.filter((share) => share.rest).map((share) => ({ label: share.label, amount: share.value, percentage: share.printedPercentage, swatch: RING_REST_COLOR }))}
    />
  );

  return (
    <Tile eyebrow="Entrate" collapse={collapse} asideWhenClosed={asideWhenClosed} reading={reading} className={className}>
      {slices.length === 0 ? (
        <p className="mt-3 text-[13px] text-muted-foreground">Nessuna entrata registrata nel periodo.</p>
      ) : (
        <div className="@container mt-3.5 flex flex-1 flex-col">
          <div className={RING_LAYOUT_CLASS}>
            {oneCategory ? (
              <p className="m-0 flex shrink-0 flex-col self-start">
                <span data-entrate-total="" className="font-mono text-[22px] font-semibold leading-tight tabular-nums text-foreground">
                  {cachedFormatCurrencyEUR(total, true)}
                </span>
                <span className={TILE_EYEBROW_CLASS}>entrate</span>
              </p>
            ) : (
              <RingChart segments={segments} centerValue={total} centerLabel="entrate" ariaLabel="Entrate per categoria" size={120} />
            )}
            <div className={RING_ROWS_CLASS}>{legend}</div>
          </div>
          {folded && !activeHidden && (
            <div className="mt-auto flex justify-end border-t border-border pt-3.5 text-[11px] text-muted-foreground">
              <button
                type="button"
                onClick={() => setShowAll((value) => !value)}
                aria-expanded={expanded}
                className={cn(TILE_FOOTER_ACTION_CLASS, 'shrink-0 gap-1 hover:text-muted-foreground')}
              >
                {expanded ? 'Mostra meno' : `Mostra tutte (${slices.length})`}
                <ChevronDown className={cn('h-3 w-3 transition-transform', expanded && 'rotate-180')} aria-hidden="true" />
              </button>
            </div>
          )}
        </div>
      )}
    </Tile>
  );
}
