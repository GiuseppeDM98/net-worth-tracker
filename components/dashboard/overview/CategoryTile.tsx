import type { ReactNode } from 'react';
import type { DashboardOverviewCategoryAmount } from '@/types/dashboardOverview';
import type { Narrative } from '@/lib/utils/narrative';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import { OverviewTile } from './OverviewTile';
import { RankedRows } from './RankedRows';

interface CategoryTileProps {
  eyebrow: string;
  /** The period total the rows are a share of — shown beside the eyebrow and used for the residual. */
  total: number;
  categories: DashboardOverviewCategoryAmount[];
  /** The one-line reading over the rows (Tracciamento names the concentration); the Panoramica has none. */
  reading?: Narrative | null;
  /** Bar colour, a theme chart slot. */
  color: string;
  emptyCopy: string;
  /** Width of the label column; a 3-column tile passes a narrower one so the bar keeps a track. */
  labelClassName?: string;
  /** Pinned under the rows (a link to the full breakdown). */
  footer?: ReactNode;
  className?: string;
}

/**
 * "Dove vanno / da dove arrivano i soldi?" — the period's top categories as ranked rows, on
 * the Panoramica (the overview payload's top 5) and on Tracciamento (`rankCategories`). Only
 * the top 5 are carried, so the list closes with the residual ("Altre categorie") — a list
 * titled "per categoria" that does not add up to the total reads as missing data.
 */
export function CategoryTile({ eyebrow, total, categories, reading, color, emptyCopy, labelClassName, footer, className }: CategoryTileProps) {
  const shown = categories.reduce((sum, c) => sum + c.amount, 0);
  const remainderAmount = Math.max(0, total - shown);

  return (
    <OverviewTile
      eyebrow={eyebrow}
      aside={<span className="font-mono tabular-nums">{cachedFormatCurrencyEUR(total, true)}</span>}
      reading={reading}
      className={className}
    >
      {categories.length === 0 ? (
        <p className="mt-3 text-[13px] text-muted-foreground">{emptyCopy}</p>
      ) : (
        <div className="mt-2">
          <RankedRows
            rows={categories.map((c) => ({
              key: c.categoryKey ?? c.category,
              label: c.category,
              amount: c.amount,
              percentage: c.percentage,
            }))}
            color={color}
            labelClassName={labelClassName}
            remainder={
              remainderAmount >= 1
                ? {
                    label: 'Altre categorie',
                    amount: remainderAmount,
                    percentage: total > 0 ? (remainderAmount / total) * 100 : 0,
                  }
                : null
            }
          />
        </div>
      )}
      {footer && <div className="mt-auto border-t border-border pt-3.5 text-[11px] text-muted-foreground">{footer}</div>}
    </OverviewTile>
  );
}
