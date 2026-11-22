'use client';

import type { Narrative } from '@/lib/utils/narrative';
import type { CostCenterSubCategorySlice } from '@/types/costCenters';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import { formatPercentage } from '@/lib/services/chartService';
import { cn } from '@/lib/utils';
import { COSTUME_PILL_RADIUS_CLASS } from '@/lib/constants/themeCostume';
import { Tile, type TileCollapse } from '@/components/ui/tile';
import { NarrativeText } from '@/components/ui/narrative-text';
import { ringSwatchAt, type RingSegment } from '@/lib/utils/ringChart';
import { RING_LAYOUT_CLASS, RING_ROWS_CLASS, RingChart } from '@/components/ui/ring-chart';

interface SottocategorieTileProps {
  slices: CostCenterSubCategorySlice[];
  excludedKeys: ReadonlySet<string>;
  /** The total over the rows still included — the base of every share shown. */
  netTotal: number;
  /** The counted subcategories as ring parts (`subCategoryRingSegments`); null keeps today's bars. */
  ring: RingSegment[] | null;
  /** «1 esclusa»; null while nothing is excluded. */
  aside: Narrative | null;
  reading: Narrative;
  footer: Narrative;
  color: string;
  onToggle: (key: string) => void;
  onReset: () => void;
  /** The row below `desktop:` (`useMobileSections().collapse(id)`); `undefined` at 1440. */
  collapse?: TileCollapse;
  /** What the closed row says beside its eyebrow («in totale», «2 escluse»). */
  asideWhenClosed?: string;
  className?: string;
}

/**
 * «Quanto costa al netto di X?» — one level under the categories, every subcategory a
 * toggle row: pressing it excludes the row from a net total the reading names. The lens is
 * session-only and lives in this tile alone; the hero, the budget and the other tiles keep
 * the real spend (the footer says so). Rows stay operable when excluded, so they keep their
 * contrast: the line-through carries the state, never an opacity.
 *
 * With two or more rows counted the counted ones are a ring beside the rows (The Ring Rule; the owner on
 * the mirror tour, 2026-11-15), the net total in its hole — «in tutto», or «al netto» once a row is out —
 * each counted row led by its arc's swatch (`ringSwatchAt`: past six the fold's grey) in place of its bar;
 * an excluded row is not a part, so it has no swatch. Fewer than two counted: today's bars.
 */
export function SottocategorieTile({ slices, excludedKeys, netTotal, ring, aside, reading, footer, color, onToggle, onReset, collapse, asideWhenClosed, className }: SottocategorieTileProps) {
  const hasMultipleCategories = new Set(slices.map((slice) => slice.categoryName)).size > 1;
  const maxIncluded = Math.max(...slices.filter((slice) => !excludedKeys.has(slice.key)).map((slice) => slice.total), 0);
  const ringIndex = new Map((ring ?? []).map((segment, index) => [segment.key, index]));

  const rows = (
    <ul className="flex flex-col divide-y divide-border">
      {slices.map((slice) => {
        const excluded = excludedKeys.has(slice.key);
        const share = !excluded && netTotal > 0 ? (slice.total / netTotal) * 100 : null;
        const arc = ring ? ringIndex.get(slice.key) : undefined;
        return (
          <li key={slice.key}>
            <button
              type="button"
              // Pressed = the row COUNTS. It was `aria-pressed={excluded}`, so a screen reader
              // heard «premuto» on the very rows the user had taken out of the total.
              aria-pressed={!excluded}
              onClick={() => onToggle(slice.key)}
              className={cn(
                'flex min-h-[44px] w-full items-center gap-3 py-2 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset desktop:-mx-2 desktop:w-[calc(100%+16px)] desktop:rounded-md desktop:px-2',
                excluded && 'text-muted-foreground',
              )}
            >
              <span className="sr-only">Conta nel totale: </span>
              {ring && (
                // The swatch's box stays on an excluded row, empty, so the names keep one left edge.
                <span className="h-2 w-2 shrink-0 self-center">
                  {arc !== undefined && (
                    <span data-swatch aria-hidden="true" className="block h-2 w-2 rounded-[2px]" style={{ background: ringSwatchAt(ring, arc) }} />
                  )}
                </span>
              )}
              <span className={cn('flex shrink-0 flex-col', ring ? 'min-w-0 flex-1' : 'w-[150px] desktop:w-[170px]')}>
                <span className={cn('truncate text-[13px]', excluded ? 'line-through' : 'text-foreground')}>{slice.subCategoryName}</span>
                {hasMultipleCategories && <span className="truncate text-[11px] text-muted-foreground">{slice.categoryName}</span>}
              </span>
              {!ring && (
                <span className={cn('h-[3px] min-w-[40px] flex-1 overflow-hidden bg-muted', COSTUME_PILL_RADIUS_CLASS)} aria-hidden="true">
                  {!excluded && <span className={cn('block h-full', COSTUME_PILL_RADIUS_CLASS)} style={{ width: `${maxIncluded > 0 ? (slice.total / maxIncluded) * 100 : 0}%`, background: color }} />}
                </span>
              )}
              <span className={cn('w-[64px] shrink-0 text-right font-mono text-[13px] tabular-nums', excluded ? 'line-through' : 'text-foreground')}>
                {cachedFormatCurrencyEUR(slice.total, true)}
              </span>
              <span className="w-[34px] shrink-0 text-right font-mono text-[11px] tabular-nums text-muted-foreground">
                {share === null ? '—' : formatPercentage(share, 0)}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );

  return (
    <Tile
      eyebrow="Per sottocategoria"
      // A string while nothing is excluded, so a closed-or-open row keeps it beside the eyebrow;
      // with the lens on it carries a control («Reimposta»), which a row moves into its panel.
      aside={
        aside ? (
          <span className="flex items-center gap-1.5">
            <NarrativeText segments={aside} figureClassName="font-medium" />
            <span aria-hidden="true">·</span>
            <button type="button" onClick={onReset} className="-my-3 px-1 py-3 text-foreground underline underline-offset-2 hover:no-underline">
              Reimposta
            </button>
          </span>
        ) : (
          'in totale'
        )
      }
      reading={reading}
      collapse={collapse}
      asideWhenClosed={asideWhenClosed}
      className={className}
    >
      {ring ? (
        <div className="@container mt-2">
          <div className={RING_LAYOUT_CLASS}>
            <RingChart segments={ring} centerValue={netTotal} centerLabel={excludedKeys.size > 0 ? 'al netto' : 'in tutto'} ariaLabel="Per sottocategoria" />
            <div className={RING_ROWS_CLASS}>{rows}</div>
          </div>
        </div>
      ) : (
        <div className="mt-2">{rows}</div>
      )}
      <div className="mt-auto border-t border-border pt-3.5">
        <NarrativeText segments={footer} className="text-[11px] text-muted-foreground" figureClassName="font-medium" />
      </div>
    </Tile>
  );
}
