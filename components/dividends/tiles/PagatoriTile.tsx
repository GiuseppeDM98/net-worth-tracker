'use client';

import type { Narrative } from '@/lib/utils/narrative';
import type { PayerRanking } from '@/lib/utils/dividendAnalytics';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import { RING_REST_COLOR, type RingSegment } from '@/lib/utils/ringChart';
import { Tile, type TileCollapse } from '@/components/ui/tile';
import { NarrativeText } from '@/components/ui/narrative-text';
import { RankedRows } from '@/components/ui/ranked-rows';
import { RING_LAYOUT_CLASS, RING_ROWS_CLASS, RingChart } from '@/components/ui/ring-chart';

interface PagatoriTileProps {
  ranking: PayerRanking;
  /** The payers as ring parts (`payerRingSegments`); null keeps the bars. */
  ring: RingSegment[] | null;
  reading: Narrative | null;
  footer: Narrative | null;
  emptyCopy: string;
  /** The row below `desktop:` (`useMobileSections().collapse(id)`); `undefined` at 1440. */
  collapse?: TileCollapse;
  /** What the closed row says beside its eyebrow («in portafoglio»: the open aside is an amount, the rule forbids it closed). */
  asideWhenClosed?: string;
  className?: string;
}

/**
 * "Chi paga di più?" — the period's payers as ranked rows, the same primitive the category
 * tiles use: bar width encodes rank (the largest fills the track), the trailing figure encodes
 * share, and the list closes with its residual so the shares visibly add up to the total in
 * the aside. When the payers are one positive whole of two parts or more they are a ring (The
 * Ring Rule, 2026-11-12) and the rows its legend, each with its arc's swatch, the remainder in the
 * fold's grey; a part below zero keeps the bars.
 *
 * Only RECEIVED payments are ranked. The announced ones are named in the footer instead of
 * being folded in: a leaderboard is a record of what happened, not of what is promised.
 */
export function PagatoriTile({ ranking, ring, reading, footer, emptyCopy, collapse, asideWhenClosed, className }: PagatoriTileProps) {
  const colorOf = new Map(ring?.map((part) => [part.key, part.color]));
  const remainders = ranking.remainder ? [{ ...ranking.remainder, swatch: ring ? RING_REST_COLOR : undefined }] : null;

  return (
    <Tile
      eyebrow="Chi paga di più"
      aside={ranking.total > 0 ? <span className="font-mono tabular-nums">{cachedFormatCurrencyEUR(ranking.total, true)}</span> : undefined}
      reading={reading}
      collapse={collapse}
      asideWhenClosed={asideWhenClosed}
      className={className}
    >
      {ranking.rows.length === 0 ? (
        <p className="mt-3 text-[13px] text-muted-foreground">{emptyCopy}</p>
      ) : ring ? (
        <div className="@container mt-3.5">
          <div className={RING_LAYOUT_CLASS}>
            <RingChart segments={ring} centerValue={ranking.total} centerLabel="netti" ariaLabel="Chi paga di più" />
            <div className={RING_ROWS_CLASS}>
              <RankedRows
                rows={ranking.rows.map((row) => ({ ...row, swatch: colorOf.get(row.key) }))}
                color="var(--chart-2)"
                bars={false}
                remainders={remainders}
              />
            </div>
          </div>
        </div>
      ) : (
        <div className="mt-2">
          {/* 144px: «BTP Valore Marzo 2032» at 13px, whole; the bar keeps its 40px floor at 390. */}
          <RankedRows rows={ranking.rows} color="var(--chart-2)" remainders={remainders} labelClassName="min-w-[144px]" />
        </div>
      )}
      {footer && (
        <NarrativeText
          segments={footer}
          className="mt-auto border-t border-border pt-3.5 text-[11px] leading-[1.45] text-muted-foreground"
          figureClassName="font-medium"
        />
      )}
    </Tile>
  );
}
