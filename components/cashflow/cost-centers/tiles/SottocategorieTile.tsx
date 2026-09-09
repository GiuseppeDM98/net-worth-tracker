'use client';

import type { Narrative } from '@/lib/utils/narrative';
import type { CostCenterSubCategorySlice } from '@/types/costCenters';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import { formatPercentage } from '@/lib/services/chartService';
import { cn } from '@/lib/utils';
import { Tile } from '@/components/ui/tile';
import { NarrativeText } from '@/components/ui/narrative-text';

interface SottocategorieTileProps {
  slices: CostCenterSubCategorySlice[];
  excludedKeys: ReadonlySet<string>;
  /** The total over the rows still included — the base of every share shown. */
  netTotal: number;
  /** «1 esclusa»; null while nothing is excluded. */
  aside: Narrative | null;
  reading: Narrative;
  footer: Narrative;
  color: string;
  onToggle: (key: string) => void;
  onReset: () => void;
  className?: string;
}

/**
 * «Quanto costa al netto di X?» — one level under the categories, every subcategory a
 * toggle row: pressing it excludes the row from a net total the reading names. The lens is
 * session-only and lives in this tile alone; the hero, the budget and the other tiles keep
 * the real spend (the footer says so). Rows stay operable when excluded, so they keep their
 * contrast: the line-through carries the state, never an opacity.
 */
export function SottocategorieTile({ slices, excludedKeys, netTotal, aside, reading, footer, color, onToggle, onReset, className }: SottocategorieTileProps) {
  const hasMultipleCategories = new Set(slices.map((slice) => slice.categoryName)).size > 1;
  const maxIncluded = Math.max(...slices.filter((slice) => !excludedKeys.has(slice.key)).map((slice) => slice.total), 0);

  return (
    <Tile
      eyebrow="Per sottocategoria"
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
          <span>in totale</span>
        )
      }
      reading={reading}
      className={className}
    >
      <ul className="mt-2 flex flex-col divide-y divide-border">
        {slices.map((slice) => {
          const excluded = excludedKeys.has(slice.key);
          const share = !excluded && netTotal > 0 ? (slice.total / netTotal) * 100 : null;
          return (
            <li key={slice.key}>
              <button
                type="button"
                aria-pressed={excluded}
                onClick={() => onToggle(slice.key)}
                className={cn(
                  'flex min-h-[44px] w-full items-center gap-3 py-2 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset desktop:-mx-2 desktop:w-[calc(100%+16px)] desktop:rounded-md desktop:px-2',
                  excluded && 'text-muted-foreground',
                )}
              >
                <span className="flex w-[150px] shrink-0 flex-col desktop:w-[170px]">
                  <span className={cn('truncate text-[13px]', excluded ? 'line-through' : 'text-foreground')}>{slice.subCategoryName}</span>
                  {hasMultipleCategories && <span className="truncate text-[11px] text-muted-foreground">{slice.categoryName}</span>}
                </span>
                <span className="h-[3px] min-w-[40px] flex-1 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                  {!excluded && <span className="block h-full rounded-full" style={{ width: `${maxIncluded > 0 ? (slice.total / maxIncluded) * 100 : 0}%`, background: color }} />}
                </span>
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
      <div className="mt-auto border-t border-border pt-3.5">
        <NarrativeText segments={footer} className="text-[11px] text-muted-foreground" figureClassName="font-medium" />
      </div>
    </Tile>
  );
}
