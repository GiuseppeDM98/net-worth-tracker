'use client';

import { useRef } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import type { Narrative } from '@/lib/utils/narrative';
import type { BudgetItem } from '@/types/budget';
import type { AnnualBudgetRow, AnnualBudgetSummary } from '@/lib/utils/budgetSummary';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import { formatPercentage } from '@/lib/services/chartService';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Tile } from '@/components/ui/tile';
import { NarrativeText } from '@/components/ui/narrative-text';
import { BudgetTrack } from '@/components/cashflow/budget/BudgetTrack';
import { progressFillColor, progressTextClass } from '@/components/cashflow/budget/budgetProgressStyle';
import { useArmedDelete } from '@/lib/hooks/useArmedDelete';

interface AnnualiTileProps {
  summary: AnnualBudgetSummary;
  aside: Narrative;
  reading: Narrative;
  footer: Narrative;
  isDemo: boolean;
  onEdit: (item: BudgetItem) => void;
  onDelete: (id: string) => void;
  className?: string;
}

function AnnualRow({
  row,
  yearElapsedPct,
  isDemo,
  onEdit,
  onDelete,
}: {
  row: AnnualBudgetRow;
  yearElapsedPct: number;
  isDemo: boolean;
  onEdit: (item: BudgetItem) => void;
  onDelete: (id: string) => void;
}) {
  const ratio = row.spent / row.budget;
  const deleteRef = useRef<HTMLButtonElement | null>(null);
  const del = useArmedDelete(deleteRef, () => onDelete(row.item.id));

  return (
    <li className="flex flex-col gap-2 py-[10px]">
      <div className="flex items-center justify-between gap-3">
        <span className="min-w-0 flex-1 truncate text-[13px] text-foreground">{row.label}</span>
        <span className="shrink-0 font-mono text-[13px] tabular-nums text-foreground">
          {cachedFormatCurrencyEUR(row.spent, true)}
          <span className="text-muted-foreground"> / {cachedFormatCurrencyEUR(row.budget, true)}</span>
        </span>
        {/* The same two actions the monthly rows carry; 44px on touch, 32px with a mouse. */}
        <span className="flex shrink-0 items-center gap-0.5 -my-1">
          <Button
            size="icon"
            variant="ghost"
            className="h-11 w-11 desktop:h-8 desktop:w-8"
            disabled={isDemo}
            aria-label={`Modifica budget ${row.label}`}
            onClick={() => onEdit(row.item)}
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
            ref={deleteRef}
            size="icon"
            variant="ghost"
            className={cn('h-11 w-11 desktop:h-8 desktop:w-8', del.armed && 'text-destructive')}
            disabled={isDemo}
            aria-label={del.armed ? `Conferma eliminazione budget ${row.label}` : `Elimina budget ${row.label}`}
            onClick={del.onClick}
            onBlur={del.onBlur}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </span>
      </div>
      <BudgetTrack ratio={ratio} calendarPct={yearElapsedPct} color={progressFillColor(ratio)} label={`Avanzamento ${row.label}`} />
      <div className="flex justify-between text-[11px] text-muted-foreground">
        <span className={cn('font-mono tabular-nums', progressTextClass(ratio))}>{formatPercentage(row.usedPct, 0)}</span>
        <span>
          {row.exceeded ? (
            <>
              oltre di <span className="font-mono tabular-nums text-destructive">{cachedFormatCurrencyEUR(row.spent - row.budget, true)}</span>
            </>
          ) : (
            <>
              restano <span className="font-mono tabular-nums">{cachedFormatCurrencyEUR(row.remaining, true)}</span>
            </>
          )}
        </span>
      </div>
    </li>
  );
}

/**
 * "Come vanno i budget annuali?" — the budgets measured year-to-date, on a window the rest
 * of the page does not use (the Off-Axis Tile Rule): the aside names it («2026, da gennaio ·
 * anno al 64%») and every row carries the year's mark on its track, so «56% used» is read
 * against «64% of the year gone» without leaving the row. Each row keeps the pencil and the
 * 2-click bin of the monthly list: an annual budget is set and removed here, not elsewhere.
 */
export function AnnualiTile({ summary, aside, reading, footer, isDemo, onEdit, onDelete, className }: AnnualiTileProps) {
  return (
    <Tile eyebrow="Budget annuali" aside={<NarrativeText segments={aside} figureClassName="font-medium" />} reading={reading} className={className}>
      <ul className="mt-2 flex flex-col divide-y divide-border">
        {summary.rows.map((row) => (
          <AnnualRow key={row.key} row={row} yearElapsedPct={summary.yearElapsedPct} isDemo={isDemo} onEdit={onEdit} onDelete={onDelete} />
        ))}
      </ul>
      <NarrativeText
        segments={footer}
        className="mt-auto border-t border-border pt-3.5 text-[11px] leading-[1.45] text-muted-foreground"
        figureClassName="font-medium"
      />
    </Tile>
  );
}
