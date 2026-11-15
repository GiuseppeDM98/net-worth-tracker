'use client';

import { cn } from '@/lib/utils';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import { useRovingFocus } from '@/lib/hooks/useRovingFocus';

export interface RankedRow {
  key: string;
  label: string;
  /** A short muted note after the label («Volo · 12 ago»): the subcategory and the date of a single expense. */
  caption?: string;
  amount: number;
  /** Share of the total, 0-100 — shown as the trailing figure. */
  percentage: number;
  /** The colour this row is keyed to in a legend the host draws (a ring's arc, a type): an 8×8 swatch before the label. */
  swatch?: string;
}

/**
 * The label column is a SHARE of the row (38%, floored), never a fixed pixel width: the rows of
 * one list must share one track for the bar's width to encode rank, and a 92px column that fit
 * «Automobili» cut «Stipendio Paolo» — the user's own category name — to «Stipendio Pa…» at
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
/** Without a bar the floors are label 72 + amount 64 + share 34 + two 12px gaps = 194px. */
const SHARE_COLUMN_LEGEND_CLASS = 'w-[34px] shrink-0 text-right font-mono text-[11px] tabular-nums text-muted-foreground @max-[200px]:hidden';
/** The legend's colour key (DESIGN.md → Chart Legend Swatch): a square, carrying no text. */
const SWATCH_CLASS = 'h-2 w-2 shrink-0 self-center rounded-[2px]';

interface RankedRowsProps {
  rows: RankedRow[];
  /** Bar colour, a theme chart slot (`var(--chart-1)`), never a literal hex. */
  color: string;
  /**
   * What `rows` do not cover, rendered as muted closing rows so the list visibly adds up to the
   * total: one row on most surfaces (the month total minus the rows shown), two on the
   * Esposizione («Resto letto», then «Non letto»). Omit when rows are exhaustive.
   */
  remainders?: Array<{ label: string; amount: number; percentage: number; swatch?: string }> | null;
  /** false when the list is a ring's legend: the ring is the bar (default true). */
  bars?: boolean;
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
  /**
   * `stacked` (Spese maggiori, owner 2026-11-15): two lines per row — the label beside the amount and
   * the share, then the caption beside the bar — for rows whose label is a sentence of its own (a
   * note) and whose caption is three facts. Default `inline`: one line, the caption after the label.
   */
  layout?: 'inline' | 'stacked';
}

/**
 * Flat, `divide-y` ranked rows with a 3px bar — label, bar, mono amount, share. The bar width
 * encodes RANK (the largest row fills the track), the trailing figure encodes share, so a month
 * where no category dominates still reads at a glance (the `CompositionList` rule). The list is
 * a real `<ul>`: a clickable row keeps its button semantics instead of borrowing `listitem`; with
 * `bars={false}` the list is a ring's legend: a swatch per row, no bar.
 */
export function RankedRows({ rows, color, remainders, bars = true, labelClassName, onRowClick, activeKey, ariaLabel, layout = 'inline' }: RankedRowsProps) {
  // A legend has no bar to share a track with, so its label takes what the figures leave.
  const labelWidth = bars ? cn(LABEL_COLUMN_CLASS, labelClassName) : cn('min-w-0 flex-1', labelClassName);
  const shareClass = bars ? SHARE_COLUMN_CLASS : SHARE_COLUMN_LEGEND_CLASS;
  const maxAmount = Math.max(...rows.map((r) => r.amount), 0);
  // ONE Tab stop for the whole list, the arrows moving inside it: six clickable rows put whatever
  // follows six presses further away, on every surface this primitive serves (2026-09-21).
  const roving = useRovingFocus(onRowClick ? rows.length : 0);

  const bar = (row: RankedRow, trackClass: string) => (
    <div className={cn('h-[3px] overflow-hidden rounded-full bg-muted', trackClass)} role="presentation">
      <div
        className="h-full rounded-full"
        style={{
          width: `${maxAmount > 0 ? (row.amount / maxAmount) * 100 : 0}%`,
          background: color,
        }}
      />
    </div>
  );

  // Two lines: the label takes the whole first line up to the figures (truncated only at the tile's
  // edge), the caption the second up to the bar. The caption still wraps rather than truncating (a
  // cut fact is no fact); with the row's width it seldom needs to.
  const stackedContent = (row: RankedRow, active: boolean) => (
    <span className="flex min-w-0 flex-1 flex-col gap-1">
      <span data-ranked-line="head" className="flex min-w-0 items-baseline gap-3">
        <span className={cn('min-w-0 flex-1 truncate text-[13px] text-foreground', active && 'font-semibold')}>{row.label}</span>
        <span className="w-[64px] shrink-0 text-right font-mono text-[13px] tabular-nums text-foreground">{cachedFormatCurrencyEUR(row.amount, true)}</span>
        <span className={shareClass}>{Math.round(row.percentage)}%</span>
      </span>
      <span data-ranked-line="caption" className="flex min-w-0 items-center gap-3">
        <span className="line-clamp-2 min-w-0 flex-1 break-words font-mono text-[11px] leading-[1.35] tabular-nums text-muted-foreground">{row.caption}</span>
        {bars && bar(row, 'w-[40%] min-w-[64px] max-w-[240px] shrink-0')}
      </span>
    </span>
  );

  const rowContent = (row: RankedRow, active: boolean) => layout === 'stacked' ? stackedContent(row, active) : (
    <>
      {/* The caption yields before the label: a long «12 ago · Manutenzione straordinaria» must
          never push the category name out of its own column — and it WRAPS to a second line
          instead of truncating, because «30 set · Asilo nido · in calendario» is the row's
          second fact (the day, the subcategory, the calendar) and a cut fact is no fact
          (2026-09-14; the accessible name always carried it whole). */}
      <span className={cn('flex min-w-0 items-baseline gap-1.5 text-[13px] text-foreground', labelWidth, active && 'font-semibold')}>
        {row.swatch && <span className={SWATCH_CLASS} style={{ background: row.swatch }} aria-hidden="true" />}
        <span className={cn('truncate', row.caption && 'max-w-[65%] shrink-0')}>{row.label}</span>
        {row.caption && <span className="line-clamp-2 min-w-0 break-words font-mono text-[11px] leading-[1.35] tabular-nums text-muted-foreground">{row.caption}</span>}
      </span>
      {bars && bar(row, BAR_TRACK_CLASS)}
      <span className="w-[64px] shrink-0 text-right font-mono text-[13px] tabular-nums text-foreground">
        {cachedFormatCurrencyEUR(row.amount, true)}
      </span>
      <span className={shareClass}>
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
      {(remainders ?? [])
        .filter((remainder) => remainder.amount > 0)
        .map((remainder) => (
          <li key={remainder.label} className="flex items-center gap-3 py-[9px]">
            {bars ? (
              <span className={cn('min-w-0 truncate text-[13px] text-muted-foreground', labelWidth)}>
                {remainder.label}
              </span>
            ) : (
              <span className={cn('flex min-w-0 items-center gap-1.5 text-[13px] text-muted-foreground', labelWidth)}>
                {remainder.swatch && <span className={SWATCH_CLASS} style={{ background: remainder.swatch }} aria-hidden="true" />}
                <span className="truncate">{remainder.label}</span>
              </span>
            )}
            {bars && <div className={BAR_TRACK_CLASS} aria-hidden="true" />}
            <span className="w-[64px] shrink-0 text-right font-mono text-[13px] tabular-nums text-muted-foreground">
              {cachedFormatCurrencyEUR(remainder.amount, true)}
            </span>
            <span className={shareClass}>
              {Math.round(remainder.percentage)}%
            </span>
          </li>
        ))}
    </ul>
  );
}
