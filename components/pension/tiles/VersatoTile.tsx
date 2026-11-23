'use client';

/**
 * «Com'è composto il versato dell'anno?» — the Versato tile of Previdenza (7 columns, ON the
 * year axis).
 *
 * The year's contributions by nature (voluntary · TFR · employer) as ranked rows, the same
 * primitive the category tiles use: the bar encodes rank (the largest nature fills the track),
 * the trailing figure encodes the share of the year's total, and the caption under each label
 * says whether that nature is IRPEF-deductible — the one fact of a nature the Anno fiscale tile
 * reads by, so the reader can tie the two tiles without a second table. With two natures or more
 * the rows are the legend of a ring (`versatoRing`), each nature in its own slot; with one, a bar
 * in `--chart-2`, money coming in: a contribution is an inflow, never a gain, so no row wears a
 * sign token.
 *
 * Words and numbers arrive as props from `pensionSummary.ts` / `pensionNarrative.ts`: the tile
 * formats nothing and computes nothing, it only renders. The footer carries the previous
 * recorded year and the competence rule («per anno d'imposta, non per data») pinned to the
 * bottom with `mt-auto`: the tile closes the hero's second row, so its footer sits on the same
 * line as the hero's.
 */

import type { Narrative } from '@/lib/utils/narrative';
import type { VersatoRow } from '@/lib/utils/pensionSummary';
import type { RingSegment } from '@/lib/utils/ringChart';
import { Tile, type TileCollapse } from '@/components/ui/tile';
import { NarrativeText } from '@/components/ui/narrative-text';
import { RankedRows, type RankedRow } from '@/components/ui/ranked-rows';
import { RING_LAYOUT_CLASS, RING_ROWS_CLASS, RingChart } from '@/components/ui/ring-chart';

export interface VersatoTileProps {
  /** The axis year the rows are read on — «Versato nel 2026». */
  taxYear: number;
  /** The answer in words (`describeVersato`): the total and the natures behind it. */
  reading: Narrative;
  /** The scope printed beside the eyebrow («per natura»). */
  aside: string;
  /** The secondary fact (`describeVersatoFooter`): the previous recorded year and the competence rule. */
  footer: Narrative;
  /** Natures with something paid in the year, largest first, shares of the year's total. */
  rows: VersatoRow[];
  /** The natures as ring parts (`versatoRing`); null with fewer than two, and the rows keep their bar. */
  ring: RingSegment[] | null;
  /** The year's total, printed in the ring's hole. */
  total: number;
  /** The row of the phone composition (The Closed-Row Rule); absent at 1440. */
  collapse?: TileCollapse;
  asideWhenClosed?: string;
  /** Passed through to the tile's `section`. */
  className?: string;
}

/** Row list name — the list reads as the tile's body. */
const ROWS_ARIA_LABEL = 'Versato per natura';

/**
 * The caption is a fixed pair («deducibile» / «non deducibile») and the primitive truncates it
 * before the label: at 132px «Volontario · deducibile» is a few pixels over, so from desktop,
 * where a 7-column tile has the room, the column widens. Below it 132px is the most a 390px phone
 * can give the row (the bar keeps 40px).
 */
const LABEL_CLASS = 'min-w-[132px] desktop:min-w-[168px]';

export function VersatoTile({ taxYear, reading, aside, footer, rows, ring, total, collapse, asideWhenClosed, className }: VersatoTileProps) {
  const rankedRows: RankedRow[] = rows.map((row) => ({
    key: row.nature,
    label: row.label,
    caption: row.deductible ? 'deducibile' : 'non deducibile',
    amount: row.amount,
    percentage: row.percentage,
  }));
  const ringColor = new Map((ring ?? []).map((segment) => [segment.key, segment.color]));

  return (
    // The tile's name is its visible eyebrow, year included (WCAG 2.5.3: the name contains the label).
    <Tile eyebrow={`Versato nel ${taxYear}`} aside={aside} asideWhenClosed={asideWhenClosed} reading={reading} ariaLabel={`Versato nel ${taxYear}`} className={className} collapse={collapse}>
      {/* Without a contribution in the year the reading already says so; an empty list would only
          add a border under the sentence. */}
      {rows.length > 0 && ring && (
        <div className="@container mt-3.5">
          <div className={RING_LAYOUT_CLASS}>
            <RingChart segments={ring} centerValue={total} centerLabel="versati" ariaLabel={`Versato nel ${taxYear} per natura`} />
            <div className={RING_ROWS_CLASS}>
              <RankedRows
                rows={rankedRows.map((row) => ({ ...row, swatch: ringColor.get(row.key) }))}
                color="var(--chart-2)"
                bars={false}
                labelClassName={LABEL_CLASS}
                ariaLabel={ROWS_ARIA_LABEL}
              />
            </div>
          </div>
        </div>
      )}
      {rows.length > 0 && !ring && (
        <div className="mt-3.5">
          <RankedRows
            rows={rankedRows}
            color="var(--chart-2)"
            labelClassName={LABEL_CLASS}
            ariaLabel={ROWS_ARIA_LABEL}
          />
        </div>
      )}
      <NarrativeText
        segments={footer}
        className="mt-auto border-t border-border pt-3.5 text-[11px] leading-[1.45] text-muted-foreground"
        figureClassName="font-medium"
      />
    </Tile>
  );
}
