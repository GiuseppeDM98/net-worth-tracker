import { cn } from '@/lib/utils';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';

export interface RankedRow {
  key: string;
  label: string;
  /** A short muted note after the label («12 ago · Volo»): the date and the subcategory of a single expense. */
  caption?: string;
  amount: number;
  /** Share of the total, 0-100 — shown as the trailing figure. */
  percentage: number;
}

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
  // The label column yields before the bar does: the bar is the row's only visual, so it
  // keeps a track even in a 3-column tile with the sidebar open.
  const labelWidth = labelClassName ?? 'w-[92px]';
  const maxAmount = Math.max(...rows.map((r) => r.amount), 0);

  const rowContent = (row: RankedRow, active: boolean) => (
    <>
      {/* The caption yields before the label: a long «12 ago · Manutenzione straordinaria» must
          never push the category name out of its own column. */}
      <span className={cn('flex min-w-0 shrink-0 items-baseline gap-1.5 text-[13px] text-foreground', labelWidth, active && 'font-semibold')}>
        <span className={cn('truncate', row.caption && 'max-w-[65%] shrink-0')}>{row.label}</span>
        {row.caption && <span className="min-w-0 truncate font-mono text-[11px] tabular-nums text-muted-foreground">{row.caption}</span>}
      </span>
      <div className="h-[3px] min-w-[40px] flex-1 overflow-hidden rounded-full bg-muted" role="presentation">
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
      <span className="w-[34px] shrink-0 text-right font-mono text-[11px] tabular-nums text-muted-foreground">
        {Math.round(row.percentage)}%
      </span>
    </>
  );

  return (
    <ul className="flex flex-col divide-y divide-border" aria-label={ariaLabel}>
      {rows.map((row) => {
        const active = activeKey === row.key;
        return (
          <li key={row.key}>
            {onRowClick ? (
              <button
                type="button"
                onClick={() => onRowClick(row)}
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
          <span className={cn('shrink-0 truncate text-[13px] text-muted-foreground', labelWidth)}>
            {remainder.label}
          </span>
          <div className="flex-1" />
          <span className="w-[64px] shrink-0 text-right font-mono text-[13px] tabular-nums text-muted-foreground">
            {cachedFormatCurrencyEUR(remainder.amount, true)}
          </span>
          <span className="w-[34px] shrink-0 text-right font-mono text-[11px] tabular-nums text-muted-foreground">
            {Math.round(remainder.percentage)}%
          </span>
        </li>
      )}
    </ul>
  );
}
