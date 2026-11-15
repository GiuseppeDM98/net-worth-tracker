import type { ReactNode } from 'react';
import type { DashboardOverviewCategoryAmount } from '@/types/dashboardOverview';
import type { Narrative } from '@/lib/utils/narrative';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import { RING_REST_COLOR, type RingSegment } from '@/lib/utils/ringChart';
import { NarrativeText } from '@/components/ui/narrative-text';
import type { TileCollapse } from '@/components/ui/tile';
import type { RankedRow } from '@/components/ui/ranked-rows';
import { RING_LAYOUT_CLASS, RING_ROWS_CLASS, RingChart } from '@/components/ui/ring-chart';
import { OverviewTile } from './OverviewTile';
import { RankedRows } from './RankedRows';

interface CategoryTileProps {
  eyebrow: string;
  /** The period total the rows are a share of — shown beside the eyebrow and used for the residual. */
  total: number;
  categories: DashboardOverviewCategoryAmount[];
  /** The one-line reading over the rows (Tracciamento names the concentration); the Panoramica has none. */
  reading?: Narrative | null;
  /**
   * «di cui 350 € già in calendario, entro il 30» under the reading, when `total` holds rows dated
   * after today (`describeScheduledCaption`; The Scheduled-Is-Not-Spent Rule, at every width).
   */
  scheduledCaption?: Narrative | null;
  /** The row below `desktop:` (`useMobileSections().collapse(id)`); `undefined` at 1440. */
  collapse?: TileCollapse;
  /** What the closed row says beside its eyebrow (`describeOverviewAsides`). */
  asideWhenClosed?: string;
  /** Bar colour, a theme chart slot. */
  color: string;
  emptyCopy: string;
  /** Minimum width of the label column (`RankedRows` lets it grow before the bar does). */
  labelClassName?: string;
  /** Pinned under the rows (a link to the full breakdown). */
  footer?: ReactNode;
  /**
   * Makes every category row a button that hands back its category — on the Panoramica the row
   * opens the category's Scheda on Analisi. The residual row («Altre categorie») is never a
   * button: it is not a category.
   */
  onSelectCategory?: (category: DashboardOverviewCategoryAmount) => void;
  /** The rows as ring parts (the income, on Tracciamento and the Panoramica: `incomeRingSegments`); absent or null, the rows keep their bar. */
  ring?: RingSegment[] | null;
  /** The word under the ring's figure («entrate»). */
  ringCenterLabel?: string;
  className?: string;
}

/**
 * "Dove vanno / da dove arrivano i soldi?" — the period's top categories as ranked rows, on
 * the Panoramica (the overview payload's top 5) and on Tracciamento (`rankCategories`). Only
 * the top 5 are carried, so the list closes with the residual ("Altre categorie") — a list
 * titled "per categoria" that does not add up to the total reads as missing data; with `ring`
 * (the income, on Tracciamento and the Panoramica) the rows are its legend.
 */
export function CategoryTile({
  eyebrow,
  total,
  categories,
  reading,
  scheduledCaption,
  collapse,
  asideWhenClosed,
  color,
  emptyCopy,
  labelClassName,
  footer,
  onSelectCategory,
  ring,
  ringCenterLabel,
  className,
}: CategoryTileProps) {
  const shown = categories.reduce((sum, c) => sum + c.amount, 0);
  const remainderAmount = Math.max(0, total - shown);
  const rowKey = (c: DashboardOverviewCategoryAmount) => c.categoryKey ?? c.category;
  const handleRowClick = onSelectCategory
    ? (row: { key: string }) => {
        const category = categories.find((c) => rowKey(c) === row.key);
        if (category) onSelectCategory(category);
      }
    : undefined;
  const rankedRows: RankedRow[] = categories.map((c) => ({
    key: rowKey(c),
    label: c.category,
    amount: c.amount,
    percentage: c.percentage,
  }));
  const remainders =
    remainderAmount >= 1
      ? [{ label: 'Altre categorie', amount: remainderAmount, percentage: total > 0 ? (remainderAmount / total) * 100 : 0 }]
      : null;
  const ringColor = new Map((ring ?? []).map((segment) => [segment.key, segment.color]));

  return (
    <OverviewTile
      eyebrow={eyebrow}
      aside={<span className="font-mono tabular-nums">{cachedFormatCurrencyEUR(total, true)}</span>}
      asideWhenClosed={asideWhenClosed}
      collapse={collapse}
      reading={reading}
      className={className}
    >
      {/* The total in the aside holds the rows still in the calendar: said here, under the reading. */}
      {scheduledCaption && (
        <NarrativeText segments={scheduledCaption} figureClassName="" className="mt-1 text-[11px] leading-[1.35] text-muted-foreground" />
      )}
      {categories.length === 0 ? (
        <p className="mt-3 text-[13px] text-muted-foreground">{emptyCopy}</p>
      ) : ring ? (
        <div className="@container mt-3.5">
          <div className={RING_LAYOUT_CLASS}>
            <RingChart segments={ring} centerValue={total} centerLabel={ringCenterLabel ?? ''} ariaLabel={eyebrow} />
            <div className={RING_ROWS_CLASS}>
              <RankedRows
                rows={rankedRows.map((row) => ({ ...row, swatch: ringColor.get(row.key) }))}
                color={color}
                bars={false}
                labelClassName={labelClassName}
                onRowClick={handleRowClick}
                ariaLabel={eyebrow}
                remainders={remainders && remainders.map((remainder) => ({ ...remainder, swatch: RING_REST_COLOR }))}
              />
            </div>
          </div>
        </div>
      ) : (
        <div className="mt-2">
          <RankedRows
            rows={rankedRows}
            color={color}
            labelClassName={labelClassName}
            onRowClick={handleRowClick}
            ariaLabel={eyebrow}
            remainders={remainders}
          />
        </div>
      )}
      {footer && <div className="mt-auto border-t border-border pt-3.5 text-[11px] text-muted-foreground">{footer}</div>}
    </OverviewTile>
  );
}
