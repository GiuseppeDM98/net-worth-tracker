'use client';

import type { Narrative } from '@/lib/utils/narrative';
import type { PayerRanking } from '@/lib/utils/dividendAnalytics';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import { Tile } from '@/components/ui/tile';
import { NarrativeText } from '@/components/ui/narrative-text';
import { RankedRows } from '@/components/ui/ranked-rows';

interface PagatoriTileProps {
  ranking: PayerRanking;
  reading: Narrative | null;
  footer: Narrative | null;
  emptyCopy: string;
  className?: string;
}

/**
 * "Chi paga di più?" — the period's payers as ranked rows, the same primitive the category
 * tiles use: bar width encodes rank (the largest fills the track), the trailing figure encodes
 * share, and the list closes with its residual so the shares visibly add up to the total in
 * the aside.
 *
 * Only RECEIVED payments are ranked. The announced ones are named in the footer instead of
 * being folded in: a leaderboard is a record of what happened, not of what is promised.
 */
export function PagatoriTile({ ranking, reading, footer, emptyCopy, className }: PagatoriTileProps) {
  return (
    <Tile
      eyebrow="Chi paga di più"
      aside={<span className="font-mono tabular-nums">{cachedFormatCurrencyEUR(ranking.total, true)}</span>}
      reading={reading}
      className={className}
    >
      {ranking.rows.length === 0 ? (
        <p className="mt-3 text-[13px] text-muted-foreground">{emptyCopy}</p>
      ) : (
        <div className="mt-2">
          <RankedRows rows={ranking.rows} color="var(--chart-2)" remainder={ranking.remainder} labelClassName="w-[108px]" />
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
