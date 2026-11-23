'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { TOP_EXPENSES_SHOWN, limitTopExpenses, type TopExpenseRow, type TopExpenses } from '@/lib/utils/analisiSummary';
import { describeTopExpenses } from '@/lib/utils/analisiNarrative';
import { cn } from '@/lib/utils';
import { Tile, TILE_FOOTER_ACTION_CLASS, type TileCollapse } from '@/components/ui/tile';
import { RankedRows, type RankedRow } from '@/components/ui/ranked-rows';

interface SpeseMaggioriTileProps {
  /** Up to `TOP_EXPENSES_MORE` rows; the first `TOP_EXPENSES_SHOWN` show until «Mostra altre». */
  top: TopExpenses;
  /** A row opens the Scheda of its category (or subcategory). */
  onSelect: (row: TopExpenseRow) => void;
  /** The row below `desktop:` (`useMobileSections().collapse(id)`); `undefined` at 1440. */
  collapse?: TileCollapse;
  /** What the closed row says beside its eyebrow, in words (The Closed-Row Rule). */
  asideWhenClosed?: string;
  /** Rows past the tenth that fill the void beside a longer «Dove vanno i soldi» (`useBalancedRows`). */
  extraRows?: number;
  className?: string;
}

/**
 * «Quali sono le spese più grandi?» — the largest single rows of the period as ranked rows: the row's
 * own note when it has one (else its category) beside the amount and its share of the period's
 * spending, then the caption (category of a noted row, subcategory, day) beside the bar, on two lines. Ten show, «Mostra altre» unfolds up to twenty; the
 * aside counts the rows SHOWN («10 di 412») and the reading speaks of them. At 1440, beside a longer «Dove vanno i soldi», the
 * page hands it the rows that fill its void (`extraRows`, 2026-11-23); unfolded by the reader it takes none.
 */
export function SpeseMaggioriTile({ top, onSelect, collapse, asideWhenClosed, extraRows = 0, className }: SpeseMaggioriTileProps) {
  const [showMore, setShowMore] = useState(false);
  const room = showMore ? 0 : Math.max(0, top.rows.length - TOP_EXPENSES_SHOWN);
  const extra = Math.min(Math.max(0, extraRows), room);
  const shownTop = limitTopExpenses(top, showMore ? top.rows.length : TOP_EXPENSES_SHOWN + extra);
  const shown = shownTop.rows.length;
  const reading = describeTopExpenses(shownTop);
  const byKey = new Map(top.rows.map((row) => [row.key, row]));
  const rows: RankedRow[] = shownTop.rows.map((row) => ({ key: row.key, label: row.note ?? row.label, caption: row.caption, amount: row.amount, percentage: row.percentage }));
  const more = top.rows.length - shown;

  return (
    <Tile
      eyebrow="Spese maggiori"
      collapse={collapse}
      asideWhenClosed={asideWhenClosed}
      aside={
        // A row keeps a TEXT aside beside its eyebrow (`Tile`): the same words there, without the mono spans.
        top.count > 0 && collapse ? (
          `${shown} di ${top.count}`
        ) : top.count > 0 ? (
          <span>
            <span className="font-mono tabular-nums">{shown}</span> di <span className="font-mono tabular-nums">{top.count}</span>
          </span>
        ) : undefined
      }
      reading={reading}
      className={className}
    >
      {rows.length === 0 ? (
        <p className="mt-3 text-[13px] text-muted-foreground">Nessuna spesa registrata nel periodo.</p>
      ) : (
        <div className="mt-2 flex flex-1 flex-col">
          <div data-fill-body="" data-fill-list="" data-fill-extra={extra} data-fill-room={room}>
            <RankedRows
              rows={rows}
              color="var(--chart-1)"
              // Two lines per row (owner, 2026-11-15): a note is a sentence and the caption three facts
              // («Casa · Arredamento · 12 mar»); sharing one 46% column they cut the one and wrapped the other.
              layout="stacked"
              ariaLabel="Spese maggiori del periodo"
              onRowClick={(row) => {
                const source = byKey.get(row.key);
                if (source) onSelect(source);
              }}
            />
          </div>
          <div data-fill-foot="" className="mt-auto flex items-center justify-between gap-3 border-t border-border pt-3.5 text-[11px] text-muted-foreground">
            <span>Quota sulle spese del periodo; una riga apre la scheda della voce.</span>
            {(showMore || more > 0) && (
              <button
                type="button"
                onClick={() => setShowMore((value) => !value)}
                aria-expanded={showMore}
                className={cn(TILE_FOOTER_ACTION_CLASS, 'shrink-0 gap-1 hover:text-muted-foreground')}
              >
                {showMore ? 'Mostra meno' : `Mostra altre ${more}`}
                <ChevronDown className={cn('h-3 w-3 transition-transform', showMore && 'rotate-180')} aria-hidden="true" />
              </button>
            )}
          </div>
        </div>
      )}
    </Tile>
  );
}
