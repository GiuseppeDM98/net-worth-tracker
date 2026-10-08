'use client';

/**
 * Analisi's Flusso below 640px: one share bar, then each group's categories as ranked rows. A
 * four-column Sankey gets ~80 px a column at 390 and stops saying anything, so on a phone the tile
 * draws its DATA instead — the same figures, the same words, the same landing (a row opens the
 * Scheda through the page's one entry path).
 *
 * Two callers, one per view of the tile: SpendingTypesMobileFlow (the type view — the only one with
 * the 50/30/20 roles off) and SpendingRolesMobileFlow (the roles view). This component knows nothing
 * of either: segments, groups and every sentence come in ready to draw, the sentences as Narrative
 * from analisiNarrative.ts, the shares from the pure layer. It computes nothing a reader sees except
 * a group's own row shares and «Altre N», as Analisi's CategorieTile does.
 *
 * The bar is the shared CompositionBar (ticks, the income edge and whole-percent legend are its
 * additive props); the shares are printed in its legend, never inside the segments — white figures
 * there would sit on whatever chart slot a theme gives the group, and a thin segment would clip its
 * figure away.
 */

import { useId, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { ExpenseType } from '@/types/expenses';
import type { Narrative } from '@/lib/utils/narrative';
import type { FlowAbsence } from '@/lib/utils/spendingRoles';
import { describeFlowAbsence } from '@/lib/utils/analisiNarrative';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import { cn } from '@/lib/utils';
import { CompositionBar } from '@/components/ui/composition-bar';
import { NarrativeText } from '@/components/ui/narrative-text';
import { RankedRows, type RankedRow } from '@/components/ui/ranked-rows';

/** Rows of a group shown before «Mostra tutte». */
const ROWS_SHOWN = 5;

export interface FlowShareSegment {
  key: string;
  label: string;
  /** The segment's width AND its printed share, 0-100, as the pure layer rounded it for the reading. */
  percentage: number;
  /** The share as the legend prints it (`describeShareCompact`): «<1%» for one that rounds to zero. */
  printed: string;
  /** A CSS colour, a theme token (`var(--role-need)`), never a hex. */
  color: string;
}

export interface FlowShareCategory {
  categoryKey: string;
  categoryName: string;
  expenseType: ExpenseType;
  value: number;
}

export interface FlowShareGroup {
  key: string;
  label: string;
  color: string;
  total: number;
  categories: FlowShareCategory[];
  /** A muted line under the rows (describeFlowSurplus). */
  note?: Narrative | null;
}

export interface FlowShareBarModel {
  segments: FlowShareSegment[];
  /** The bar's accessible name: what it is a share of. */
  ariaLabel: string;
  /** Reference ticks, as a share of the bar (the 50/30/20 view's 50 and 80). */
  ticks?: readonly number[];
  /** Where income ends, 0-100 and already clamped by the pure layer, when spending ran past it; null otherwise. */
  incomeEdge: number | null;
  /** The line under the legend: what the bar is a share of, and the deficit if any. Null only with an absence. */
  caption: Narrative | null;
}

interface FlowShareMobileProps {
  /** Non-null when there is nothing to draw: its name is printed instead of the bar and the rows. */
  absence: FlowAbsence | null;
  bar: FlowShareBarModel;
  groups: FlowShareGroup[];
  onEntityClick: (target: { expenseType: ExpenseType; categoryKey: string }) => void;
}

const euro = (value: number) => cachedFormatCurrencyEUR(value, true);

export function FlowShareMobile({ absence, bar, groups, onEntityClick }: FlowShareMobileProps) {
  if (absence !== null) {
    return <NarrativeText segments={describeFlowAbsence(absence)} className="py-8 text-center text-[13px] text-muted-foreground" />;
  }
  return (
    <div className="mt-3">
      {/* Income and no spending leaves no segment: the bar draws nothing, the caption says why. */}
      <CompositionBar
        segments={bar.segments.map((segment) => ({
          key: segment.key,
          label: segment.label,
          pct: segment.percentage,
          displayText: segment.printed,
          color: segment.color,
        }))}
        ariaLabel={bar.ariaLabel}
        ticks={bar.ticks}
        edge={bar.incomeEdge !== null ? { at: bar.incomeEdge, label: 'entrate' } : null}
        legendDecimals={0}
        legendAriaLabel="Quote del flusso"
      />
      {bar.caption && <NarrativeText segments={bar.caption} className="mt-1.5 text-[11px] text-muted-foreground" figureClassName="font-medium" />}
      <div className="mt-4 flex flex-col gap-4">
        {groups.map((group) => (
          <GroupRows key={group.key} group={group} onEntityClick={onEntityClick} />
        ))}
      </div>
    </div>
  );
}

function GroupRows({ group, onEntityClick }: { group: FlowShareGroup; onEntityClick: FlowShareMobileProps['onEntityClick'] }) {
  const [expanded, setExpanded] = useState(false);
  const listId = useId();
  const shown = expanded ? group.categories : group.categories.slice(0, ROWS_SHOWN);
  const rest = group.categories.slice(shown.length);
  const share = (value: number) => (group.total > 0 ? (value / group.total) * 100 : 0);
  const keyOf = (category: FlowShareCategory) => `${category.expenseType}:${category.categoryKey}`;
  const byKey = new Map(group.categories.map((category) => [keyOf(category), category]));
  const rows: RankedRow[] = shown.map((category) => ({
    key: keyOf(category),
    label: category.categoryName,
    amount: category.value,
    percentage: share(category.value),
  }));
  const restTotal = rest.reduce((sum, category) => sum + category.value, 0);
  const restLabel = rest.length === 1 ? "Un'altra categoria" : `Altre ${rest.length} categorie`;

  return (
    <section aria-label={group.label}>
      <div className="flex items-baseline justify-between gap-2 border-b border-border pb-1.5">
        <span className="flex items-center gap-2 text-[13px] font-semibold">
          <span className="h-2 w-2 rounded-[2px]" style={{ background: group.color }} aria-hidden="true" />
          {group.label}
        </span>
        <span className="font-mono text-[12px] tabular-nums">{euro(group.total)}</span>
      </div>
      {rows.length > 0 && (
        // The disclosure below names this wrapper: it is the list «Mostra tutte» opens.
        <div id={listId}>
          <RankedRows
            rows={rows}
            color={group.color}
            remainders={rest.length > 0 ? [{ label: restLabel, amount: restTotal, percentage: share(restTotal) }] : null}
            // No fixed label width: the primitive's 42% column is ~133px at 390 and yields with
            // the tile, where a fixed 140px added up to the whole phone column (review of #400, F2).
            ariaLabel={`Categorie in ${group.label}`}
            onRowClick={(row) => {
              const category = byKey.get(row.key);
              if (category) onEntityClick({ expenseType: category.expenseType, categoryKey: category.categoryKey });
            }}
          />
        </div>
      )}
      {group.categories.length > ROWS_SHOWN && (
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
          aria-controls={listId}
          className="mt-1 inline-flex h-11 items-center gap-1 text-[12px] font-medium text-muted-foreground hover:text-foreground"
        >
          {expanded ? 'Mostra meno' : 'Mostra tutte'}
          <ChevronDown className={cn('h-3 w-3 transition-transform', expanded && 'rotate-180')} aria-hidden="true" />
        </button>
      )}
      {group.note && <NarrativeText segments={group.note} className="mt-1.5 text-[12px] text-muted-foreground" figureClassName="font-medium" />}
    </section>
  );
}
