'use client';

import { cn } from '@/lib/utils';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import { useRovingFocus } from '@/lib/hooks/useRovingFocus';

export interface RankedRow {
  key: string;
  label: string;
  /** A short muted note after the label («12 ago · Volo»): the date and the subcategory of a single expense. */
  caption?: string;
  amount: number;
  /** Share of the total, 0-100 — shown as the trailing figure. */
  percentage: number;
}

/**
 * The label column is a SHARE of the row (38%, floored), never a fixed pixel width: the rows of
 * one list must share one track for the bar's width to encode rank, and a 92px column that fit
 * «Automobili» cut «Stipendio Giuseppe» — the user's own category name — to «Stipendio Giu…» at
 * every width while the bar beside it grew to 210px. At 42% a 4-column tile at 1440 gives the
 * label 139px and a phone column 133px; the bar takes what is left, down to its 40px floor.
 * `labelClassName` raises the floor (a wider tile, a longer vocabulary), it does not fix the width.
 */
const LABEL_COLUMN_CLASS = 'w-[42%] min-w-[72px] shrink-0';
const BAR_TRACK_CLASS = 'min-w-[40px] flex-1';

/**
 * The share column yields when the list is narrower than its floors add up to. The row's floors
 * — label 72 + bar 40 + amount 64 + share 34 + three 12px gaps — are 246px; a `col-span-3` tile
 * at 1440 gives the list 235px, and until 2026-09-14 the three percentages of «Entrate per
 * categoria» were painted 37px outside the tile (neither the tile nor the list clips). The bar
 * already encodes rank and the reading names the top share, so below 250px the figure is the
 * one column that can go; the row's accessible name keeps it. A container query, not a
 * viewport one: the same list sits in a 3-column tile, a 4-column tile and a phone column.
 */
const SHARE_COLUMN_CLASS = 'w-[34px] shrink-0 text-right font-mono text-[11px] tabular-nums text-muted-foreground @max-[250px]:hidden';

interface RankedRowsProps {
  rows: RankedRow[];
  /** Bar colour, a theme chart slot (`var(--chart-1)`), never a literal hex. */
  color: string;
  /**
   * The residual not covered by `rows` (the month total minus the rows shown), rendered as a
   * muted closing row so the list visibly adds up to the total. Omit when rows are exhaustive.
   */
  remainder?: { label: string; amount: number; percentage: number } | null;
  /** Width reserved for the label column. */
  labelClassName?: string;
  /**
   * Makes every row a real `<button>` (inside its `<li>`), named «{label} · {caption}, {amount},
   * {share}%» — on Analisi a row opens the entity's Scheda. Locate them by role `button`.
   */
  onRowClick?: (row: RankedRow) => void;
  /** The row that is currently focused elsewhere on the page (`aria-current`). */
  activeKey?: string | null;
  /** Accessible name of the list. */
  ariaLabel?: string;
}

/**
 * Flat, `divide-y` ranked rows with a 3px bar — label, bar, mono amount, share. The bar width
 * encodes RANK (the largest row fills the track), the trailing figure encodes share, so a month
 * where no category dominates still reads at a glance (the `CompositionList` rule). The list is
 * a real `<ul>`: a clickable row keeps its button semantics instead of borrowing `listitem`.
 */
export function RankedRows({ rows, color, remainder, labelClassName, onRowClick, activeKey, ariaLabel }: RankedRowsProps) {
  const labelWidth = cn(LABEL_COLUMN_CLASS, labelClassName);
  const maxAmount = Math.max(...rows.map((r) => r.amount), 0);
  // ONE Tab stop for the whole list, the arrows moving inside it: six clickable rows put whatever
  // follows six presses further away, on every surface this primitive serves (2026-09-21).
  const roving = useRovingFocus(onRowClick ? rows.length : 0);

  const rowContent = (row: RankedRow, active: boolean) => (
    <>
      {/* The caption yields before the label: a long «12 ago · Manutenzione straordinaria» must
          never push the category name out of its own column — and it WRAPS to a second line
          instead of truncating, because «30 set · Asilo nido · in calendario» is the row's
          second fact (the day, the subcategory, the calendar) and a cut fact is no fact
          (2026-09-14; the accessible name always carried it whole). */}
      <span className={cn('flex min-w-0 items-baseline gap-1.5 text-[13px] text-foreground', labelWidth, active && 'font-semibold')}>
        <span className={cn('truncate', row.caption && 'max-w-[65%] shrink-0')}>{row.label}</span>
        {row.caption && <span className="line-clamp-2 min-w-0 break-words font-mono text-[11px] leading-[1.35] tabular-nums text-muted-foreground">{row.caption}</span>}
      </span>
      <div className={cn('h-[3px] overflow-hidden rounded-full bg-muted', BAR_TRACK_CLASS)} role="presentation">
        <div
          className="h-full rounded-full"
          style={{
            width: `${maxAmount > 0 ? (row.amount / maxAmount) * 100 : 0}%`,
            background: color,
          }}
        />
      </div>
      <span className="w-[64px] shrink-0 text-right font-mono text-[13px] tabular-nums text-foreground">
        {cachedFormatCurrencyEUR(row.amount, true)}
      </span>
      <span className={SHARE_COLUMN_CLASS}>
        {Math.round(row.percentage)}%
      </span>
    </>
  );

  return (
    <ul className="@container flex flex-col divide-y divide-border" aria-label={ariaLabel} {...roving.containerProps}>
      {rows.map((row, index) => {
        const active = activeKey === row.key;
        return (
          <li key={row.key}>
            {onRowClick ? (
              <button
                type="button"
                onClick={() => onRowClick(row)}
                {...roving.itemProps(index)}
                aria-label={`${row.label}${row.caption ? ` · ${row.caption}` : ''}, ${cachedFormatCurrencyEUR(row.amount, true)}, ${Math.round(row.percentage)}%`}
                aria-current={active ? 'true' : undefined}
                className={cn(
                  'flex min-h-[44px] w-full items-center gap-3 py-[9px] text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset desktop:-mx-2 desktop:min-h-0 desktop:w-[calc(100%+16px)] desktop:rounded-md desktop:px-2',
                  active && 'bg-muted/40',
                )}
              >
                {rowContent(row, active)}
              </button>
            ) : (
              <div className="flex items-center gap-3 py-[9px]">{rowContent(row, false)}</div>
            )}
          </li>
        );
      })}
      {remainder && remainder.amount > 0 && (
        <li className="flex items-center gap-3 py-[9px]">
          <span className={cn('min-w-0 truncate text-[13px] text-muted-foreground', labelWidth)}>
            {remainder.label}
          </span>
          <div className={BAR_TRACK_CLASS} aria-hidden="true" />
          <span className="w-[64px] shrink-0 text-right font-mono text-[13px] tabular-nums text-muted-foreground">
            {cachedFormatCurrencyEUR(remainder.amount, true)}
          </span>
          <span className={SHARE_COLUMN_CLASS}>
            {Math.round(remainder.percentage)}%
          </span>
        </li>
      )}
    </ul>
  );
}
