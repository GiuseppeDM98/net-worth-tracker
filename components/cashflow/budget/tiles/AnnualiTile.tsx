'use client';

import { useCallback, useState } from 'react';
import { Pencil } from 'lucide-react';
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
import { BudgetDeleteButton } from '@/components/cashflow/budget/BudgetDeleteButton';
import { progressFillColor, progressTextClass } from '@/components/cashflow/budget/budgetProgressStyle';
import { describeBudgetDeleteConsequence } from '@/lib/utils/budgetNarrative';

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
  armed,
  announce,
  onArmedChange,
  onEdit,
  onDelete,
}: {
  row: AnnualBudgetRow;
  yearElapsedPct: number;
  isDemo: boolean;
  armed: boolean;
  announce: (text: string) => void;
  onArmedChange: (key: string, armed: boolean) => void;
  onEdit: (item: BudgetItem) => void;
  onDelete: (id: string) => void;
}) {
  const ratio = row.spent / row.budget;
  const setArmed = useCallback((value: boolean) => onArmedChange(row.key, value), [onArmedChange, row.key]);
  const overBy = cachedFormatCurrencyEUR(row.spent - row.budget, true);

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
          <BudgetDeleteButton
            variant="icon"
            label={row.label}
            kind="expense"
            disabled={isDemo}
            onDelete={() => onDelete(row.item.id)}
            announce={announce}
            onArmedChange={setArmed}
          />
        </span>
      </div>
      <BudgetTrack
        ratio={ratio}
        calendarPct={yearElapsedPct}
        color={progressFillColor(ratio)}
        label={`Avanzamento ${row.label}`}
        valueText={row.exceeded ? `${formatPercentage(row.usedPct, 0)}, oltre di ${overBy}` : `${formatPercentage(row.usedPct, 0)}, restano ${cachedFormatCurrencyEUR(row.remaining, true)}`}
      />
      <div className="flex justify-between gap-3 text-[11px] text-muted-foreground">
        <span className={cn('shrink-0 font-mono tabular-nums', progressTextClass(ratio))}>{formatPercentage(row.usedPct, 0)}</span>
        {/* While the delete is armed the row's hint is the consequence of the second press. */}
        {armed ? (
          <span className="text-right text-destructive">{describeBudgetDeleteConsequence('expense', row.label)}</span>
        ) : (
          <span>
            {row.exceeded ? (
              <>
                oltre di <span className="font-mono tabular-nums text-destructive">{overBy}</span>
              </>
            ) : (
              <>
                restano <span className="font-mono tabular-nums">{cachedFormatCurrencyEUR(row.remaining, true)}</span>
              </>
            )}
          </span>
        )}
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
 * One live region for the whole list announces arm and disarm.
 */
export function AnnualiTile({ summary, aside, reading, footer, isDemo, onEdit, onDelete, className }: AnnualiTileProps) {
  const [announcement, setAnnouncement] = useState('');
  const [armedKey, setArmedKey] = useState<string | null>(null);
  const announce = useCallback((text: string) => setAnnouncement(text), []);
  const onArmedChange = useCallback((key: string, armed: boolean) => {
    setArmedKey((current) => (armed ? key : current === key ? null : current));
  }, []);
  const handleDelete = (id: string) => {
    setArmedKey(null);
    onDelete(id);
  };

  return (
    <Tile eyebrow="Budget annuali" aside={<NarrativeText segments={aside} figureClassName="font-medium" />} reading={reading} className={className}>
      <ul className="mt-2 flex flex-col divide-y divide-border">
        {summary.rows.map((row) => (
          <AnnualRow
            key={row.key}
            row={row}
            yearElapsedPct={summary.yearElapsedPct}
            isDemo={isDemo}
            armed={armedKey === row.key}
            announce={announce}
            onArmedChange={onArmedChange}
            onEdit={onEdit}
            onDelete={handleDelete}
          />
        ))}
      </ul>
      <span className="sr-only" role="status" aria-live="polite">
        {announcement}
      </span>
      <NarrativeText
        segments={footer}
        className="mt-auto border-t border-border pt-3.5 text-[11px] leading-[1.45] text-muted-foreground"
        figureClassName="font-medium"
      />
    </Tile>
  );
}
