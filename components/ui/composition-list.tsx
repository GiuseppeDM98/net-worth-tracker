/**
 * CompositionList — ranked-bar rows for "which items are biggest, by how much".
 *
 * Pie charts answer "what share is this?" and read well up to ~5 slices. Analisi's
 * category/subcategory breakdowns, Dividendi's per-payer ranking, and similar surfaces
 * ask a different question with 8-15 items — a comparison of magnitudes — which reads
 * on aligned bar lengths, not on angles. This is the Trade Republic row: label + bar +
 * mono value + %.
 *
 * Bar width = value/maxValue (the largest item = 100% of track), NOT `percentage`.
 * Width encodes RANK (how this item compares to the biggest one); the `%` column
 * encodes SHARE (how this item compares to the whole). Using `percentage` as width
 * would leave every bar looking short whenever no single item dominates the total —
 * exactly the empty-card problem this primitive replaces.
 *
 * Colors arrive pre-resolved from the caller (`useChartColors()` or a shading derivation
 * like `computeShadeOpacities`) — this component never invents a color.
 */
'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import { cn } from '@/lib/utils';

export interface CompositionListItem {
  /** Stable key for key/click — normally the same value as `name`. */
  id: string;
  name: string;
  /** Absolute magnitude (e.g. euros). Drives bar width via value/maxValue. */
  value: number;
  /** Share of the total, 0-100. Rendered as the trailing % label. */
  percentage: number;
  /** Resolved color (from useChartColors()/shading) — never hardcoded here. */
  color: string;
  /** Bar fill opacity, default 1. Used by subcategory shading. */
  barOpacity?: number;
}

interface CompositionListProps {
  /** Already sorted descending by the caller. */
  items: CompositionListItem[];
  onItemClick?: (item: CompositionListItem) => void;
  formatValue?: (value: number) => string;
  /** Caps rendered rows to maxRows - 1 + a static "Altre N voci" footer. */
  maxRows?: number;
  ariaLabel: string;
}

export function CompositionList({
  items,
  onItemClick,
  formatValue = (v) => cachedFormatCurrencyEUR(v),
  maxRows,
  ariaLabel,
}: CompositionListProps) {
  const reducedMotion = useReducedMotion();

  if (items.length === 0) return null;

  const maxValue = Math.max(...items.map((i) => i.value), 0);
  const overflow = maxRows && items.length > maxRows;
  const visible = overflow ? items.slice(0, maxRows - 1) : items;
  const hidden = overflow ? items.slice(maxRows - 1) : [];
  const hiddenTotal = hidden.reduce((sum, i) => sum + i.value, 0);

  return (
    <div role="list" aria-label={ariaLabel} className="divide-y divide-border/60">
      {visible.map((item, i) => {
        const widthPct = maxValue > 0 ? (item.value / maxValue) * 100 : 0;
        const rowContent = (
          <>
            <span className="w-[30%] desktop:w-[22%] min-w-0 shrink-0 truncate text-sm font-medium text-foreground">
              {item.name}
            </span>
            <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
              <motion.span
                className="block h-full rounded-full"
                style={{ backgroundColor: item.color, opacity: item.barOpacity ?? 1 }}
                initial={reducedMotion ? false : { width: 0 }}
                animate={{ width: `${widthPct}%` }}
                transition={
                  reducedMotion
                    ? undefined
                    : { duration: 0.5, ease: [0.16, 1, 0.3, 1], delay: 0.05 * i }
                }
              />
            </span>
            <span className="w-24 shrink-0 text-right font-mono text-sm tabular-nums text-foreground">
              {formatValue(item.value)}
            </span>
            <span className="w-14 shrink-0 text-right font-mono text-xs tabular-nums text-muted-foreground">
              {item.percentage.toFixed(1)}%
            </span>
          </>
        );

        const rowClassName = 'flex items-center gap-3 py-2.5';

        if (onItemClick) {
          return (
            <button
              key={item.id}
              type="button"
              role="listitem"
              onClick={() => onItemClick(item)}
              className={cn(
                rowClassName,
                '-mx-2 w-[calc(100%+16px)] rounded-md px-2 text-left transition-colors duration-150 hover:bg-muted/40 cursor-pointer'
              )}
              aria-label={`${item.name}, ${formatValue(item.value)}, ${item.percentage.toFixed(1)}%`}
            >
              {rowContent}
            </button>
          );
        }

        return (
          <div key={item.id} role="listitem" className={rowClassName}>
            {rowContent}
          </div>
        );
      })}

      {overflow && (
        <div className="flex items-center justify-between py-2.5 text-xs text-muted-foreground">
          <span>Altre {hidden.length} voci</span>
          <span className="font-mono tabular-nums">{formatValue(hiddenTotal)}</span>
        </div>
      )}
    </div>
  );
}
