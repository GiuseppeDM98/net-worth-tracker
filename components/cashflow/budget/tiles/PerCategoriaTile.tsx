'use client';

import { useCallback, useState, type ReactNode } from 'react';
import { ChevronDown, Pencil } from 'lucide-react';
import type { Narrative } from '@/lib/utils/narrative';
import type { BudgetItem } from '@/types/budget';
import type { CategoryBudgetRow, CategoryBudgetRows } from '@/lib/utils/budgetSummary';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import { formatPercentage } from '@/lib/services/chartService';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Tile, TILE_SUB_EYEBROW_CLASS } from '@/components/ui/tile';
import { NarrativeText } from '@/components/ui/narrative-text';
import { BudgetTrack } from '@/components/cashflow/budget/BudgetTrack';
import { BudgetDeleteButton } from '@/components/cashflow/budget/BudgetDeleteButton';
import { progressFillColor, progressTextClass } from '@/components/cashflow/budget/budgetProgressStyle';
import { describeBudgetDeleteConsequence } from '@/lib/utils/budgetNarrative';

interface PerCategoriaTileProps {
  rows: CategoryBudgetRows;
  /** Where today stands on the month, 0-100 — the mark on every expense track. */
  calendarPct: number;
  aside: ReactNode;
  reading: Narrative;
  footer: Narrative;
  isDemo: boolean;
  onEdit: (item: BudgetItem) => void;
  onDelete: (id: string) => void;
  /** What to render when there is no monthly row at all. */
  empty?: ReactNode;
  className?: string;
}

/** What the row's delete button and the live region both need from the tile. */
interface RowDeleteProps {
  armed: boolean;
  announce: (text: string) => void;
  onArmedChange: (key: string, armed: boolean) => void;
}

function projectionCell(row: CategoryBudgetRow): { text: string; className: string } {
  if (row.projection === null) return { text: '—', className: 'text-muted-foreground' };
  const over = Math.round(row.projection) > row.budget;
  // A fixed category's figure is what is booked, not an estimate: no tilde.
  const text = row.pace === 'fixed' ? cachedFormatCurrencyEUR(row.projection, true) : `~${cachedFormatCurrencyEUR(row.projection, true)}`;
  return { text, className: over ? 'text-destructive' : 'text-muted-foreground' };
}

/** What a screen reader hears for the track: the used share, and «oltre» when it is past the budget. */
function trackValueText(row: CategoryBudgetRow): string {
  const share = formatPercentage(row.usedPct, 0);
  if (row.kind === 'income') return row.spent >= row.budget ? `${share}, obiettivo raggiunto` : share;
  return row.spent > row.budget ? `${share}, oltre di ${cachedFormatCurrencyEUR(row.spent - row.budget, true)}` : share;
}

// ─── Desktop: the table ───────────────────────────────────────────────────────

function HeaderCell({ children, className, srOnly }: { children: ReactNode; className?: string; srOnly?: boolean }) {
  return (
    <th scope="col" className={cn(TILE_SUB_EYEBROW_CLASS, 'pb-1.5 text-left font-semibold', className)}>
      {srOnly ? <span className="sr-only">{children}</span> : children}
    </th>
  );
}

function TableRow({
  row,
  calendarPct,
  isDemo,
  armed,
  announce,
  onArmedChange,
  onEdit,
  onDelete,
}: {
  row: CategoryBudgetRow;
  calendarPct: number | null;
  isDemo: boolean;
  onEdit: (item: BudgetItem) => void;
  onDelete: (id: string) => void;
} & RowDeleteProps) {
  const inverted = row.kind === 'income';
  const ratio = row.budget > 0 ? row.spent / row.budget : 0;
  const projection = inverted ? null : projectionCell(row);
  const setArmed = useCallback((value: boolean) => onArmedChange(row.key, value), [onArmedChange, row.key]);

  return (
    <tr className="border-t border-border">
      <th scope="row" className="py-2 pr-3 text-left text-[13px] font-normal text-foreground">
        <span className="flex items-center gap-1.5">
          <span className="truncate">{row.label}</span>
          {row.pace === 'fixed' && !inverted && (
            <span className="shrink-0 rounded-md border border-border px-1.5 text-[10px] font-semibold leading-4 text-muted-foreground">fissa</span>
          )}
        </span>
        {/* While the delete is armed the row says what the second press does (the 72px column cannot). */}
        {armed && <span className="mt-0.5 block text-[11px] leading-[1.35] text-destructive">{describeBudgetDeleteConsequence(row.kind, row.label)}</span>}
      </th>
      <td className="py-2 pr-3 text-right font-mono text-[13px] tabular-nums text-foreground">{cachedFormatCurrencyEUR(row.budget, true)}</td>
      <td className="py-2 pr-3 text-right font-mono text-[13px] tabular-nums text-foreground">{cachedFormatCurrencyEUR(row.spent, true)}</td>
      <td className="min-w-[80px] py-2 pr-3">
        <BudgetTrack
          ratio={ratio}
          calendarPct={inverted ? null : calendarPct}
          color={progressFillColor(ratio, inverted)}
          label={`Avanzamento ${row.label}`}
          valueText={trackValueText(row)}
        />
      </td>
      <td className={cn('py-2 pr-3 text-right font-mono text-[12px] tabular-nums', progressTextClass(ratio, inverted))}>
        {formatPercentage(row.usedPct, 0)}
      </td>
      <td className={cn('py-2 pr-3 text-right font-mono text-[13px] tabular-nums', projection?.className ?? 'text-muted-foreground')}>
        {projection?.text ?? '—'}
      </td>
      <td className="py-1">
        <div className="flex justify-end gap-0.5">
          {/* The pencil gives its room to «Conferma» while the delete is armed: one action per armed row. */}
          {!armed && (
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8"
              disabled={isDemo}
              aria-label={`Modifica budget ${row.label}`}
              onClick={() => onEdit(row.item)}
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
          )}
          <BudgetDeleteButton
            variant="icon"
            className="h-8 w-8"
            label={row.label}
            kind={row.kind}
            disabled={isDemo}
            onDelete={() => onDelete(row.item.id)}
            announce={announce}
            onArmedChange={setArmed}
          />
        </div>
      </td>
    </tr>
  );
}

function BudgetTable({
  rows,
  calendarPct,
  isDemo,
  armedKey,
  announce,
  onArmedChange,
  onEdit,
  onDelete,
  caption,
}: {
  rows: CategoryBudgetRow[];
  calendarPct: number | null;
  isDemo: boolean;
  armedKey: string | null;
  announce: (text: string) => void;
  onArmedChange: (key: string, armed: boolean) => void;
  onEdit: (item: BudgetItem) => void;
  onDelete: (id: string) => void;
  caption: string;
}) {
  return (
    <table className="w-full table-fixed">
      <caption className="sr-only">{caption}</caption>
      <colgroup>
        <col className="w-[22%]" />
        <col className="w-[11%]" />
        <col className="w-[11%]" />
        <col />
        <col className="w-[8%]" />
        <col className="w-[13%]" />
        <col className="w-[84px]" />
      </colgroup>
      <thead>
        <tr>
          <HeaderCell>Categoria</HeaderCell>
          <HeaderCell className="text-right">Budget</HeaderCell>
          <HeaderCell className="text-right">{rows[0]?.kind === 'income' ? 'Registrato' : 'Speso'}</HeaderCell>
          <HeaderCell srOnly>Avanzamento</HeaderCell>
          <HeaderCell className="text-right">Usato</HeaderCell>
          <HeaderCell className="text-right">Fine mese</HeaderCell>
          <HeaderCell srOnly>Azioni</HeaderCell>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <TableRow
            key={row.key}
            row={row}
            calendarPct={calendarPct}
            isDemo={isDemo}
            armed={armedKey === row.key}
            announce={announce}
            onArmedChange={onArmedChange}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        ))}
      </tbody>
    </table>
  );
}

// ─── Below desktop: flat expandable rows ──────────────────────────────────────

function MobileRow({
  row,
  calendarPct,
  isDemo,
  armed,
  announce,
  onArmedChange,
  onEdit,
  onDelete,
}: {
  row: CategoryBudgetRow;
  calendarPct: number | null;
  isDemo: boolean;
  onEdit: (item: BudgetItem) => void;
  onDelete: (id: string) => void;
} & RowDeleteProps) {
  const [open, setOpen] = useState(false);
  const inverted = row.kind === 'income';
  const ratio = row.budget > 0 ? row.spent / row.budget : 0;
  const projection = inverted ? null : projectionCell(row);
  const setArmed = useCallback((value: boolean) => onArmedChange(row.key, value), [onArmedChange, row.key]);
  const panelId = `budget-row-${row.key}`;

  return (
    <li className="flex flex-col">
      <button
        type="button"
        className="flex min-h-[44px] w-full flex-col gap-2 py-2.5 text-left"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="flex items-center justify-between gap-3">
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="truncate text-[13px] text-foreground">{row.label}</span>
            {row.pace === 'fixed' && !inverted && (
              <span className="shrink-0 rounded-md border border-border px-1.5 text-[10px] font-semibold leading-4 text-muted-foreground">fissa</span>
            )}
          </span>
          <span className="flex shrink-0 items-center gap-2">
            <span className="font-mono text-[13px] tabular-nums text-foreground">
              {cachedFormatCurrencyEUR(row.spent, true)}
              <span className="text-muted-foreground"> / {cachedFormatCurrencyEUR(row.budget, true)}</span>
            </span>
            <ChevronDown className={cn('h-3.5 w-3.5 text-muted-foreground motion-safe:transition-transform', open && 'rotate-180')} aria-hidden="true" />
          </span>
        </span>
        <BudgetTrack
          ratio={ratio}
          calendarPct={inverted ? null : calendarPct}
          color={progressFillColor(ratio, inverted)}
          label={`Avanzamento ${row.label}`}
          valueText={trackValueText(row)}
        />
        <span className="flex justify-between text-[11px] text-muted-foreground">
          <span className={cn('font-mono tabular-nums', progressTextClass(ratio, inverted))}>{formatPercentage(row.usedPct, 0)}</span>
          {projection && (
            <span>
              {row.projection === null ? (
                row.spent === 0 ? 'nessuna spesa' : 'proiezione dal quarto giorno'
              ) : (
                <>
                  a fine mese <span className={cn('font-mono tabular-nums', projection.className)}>{projection.text}</span>
                  {row.pace === 'fixed' ? ' · solo rate' : ''}
                </>
              )}
            </span>
          )}
        </span>
      </button>
      {/* The CSS grid-rows technique: no Framer height animation, `inert` while closed. */}
      <div
        id={panelId}
        className={cn('grid motion-safe:transition-[grid-template-rows] motion-safe:duration-200', open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]')}
        inert={!open ? true : undefined}
      >
        <div className="overflow-hidden">
          {armed && <p className="pb-2 text-[11px] leading-[1.35] text-destructive">{describeBudgetDeleteConsequence(row.kind, row.label)}</p>}
          <div className="grid grid-cols-2 gap-2 pb-3">
            <Button variant="outline" className="h-11" disabled={isDemo} onClick={() => onEdit(row.item)}>
              <Pencil className="h-4 w-4" />
              Modifica
            </Button>
            <BudgetDeleteButton
              variant="wide"
              label={row.label}
              kind={row.kind}
              disabled={isDemo}
              onDelete={() => onDelete(row.item.id)}
              announce={announce}
              onArmedChange={setArmed}
            />
          </div>
        </div>
      </div>
    </li>
  );
}

// ─── The tile ─────────────────────────────────────────────────────────────────

/**
 * "Cosa ho impostato, e come va ogni voce?" — the inventory of the monthly budgets with the
 * tile's cadence: eyebrow, the counts and the save status as the aside, the allocation as
 * the reading (the one place the validator speaks), then a table from `desktop:` — budget,
 * spent, the 3px track with today's mark, used share, month-end — and flat expandable rows
 * below it, with 44px actions (a card per row inside a tile would be a card inside a card).
 * Income targets are a second group with their own sub-eyebrow; annual budgets are not
 * here — they live in their own tile, on their own axis. One live region for the whole
 * inventory announces an armed delete and its cancellation; the armed row prints what the
 * second press does.
 */
export function PerCategoriaTile({ rows, calendarPct, aside, reading, footer, isDemo, onEdit, onDelete, empty, className }: PerCategoriaTileProps) {
  const hasRows = rows.expense.length + rows.income.length > 0;
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
  const listProps = { isDemo, armedKey, announce, onArmedChange, onEdit, onDelete: handleDelete };

  return (
    <Tile eyebrow="Per categoria" aside={aside} reading={reading} className={className}>
      {!hasRows && empty && <div className="mt-3.5">{empty}</div>}

      {hasRows && (
        <>
          {/* Desktop */}
          <div className="mt-3.5 hidden desktop:block">
            {rows.expense.length > 0 && <BudgetTable rows={rows.expense} calendarPct={calendarPct} caption="Budget mensili di spesa" {...listProps} />}
            {rows.income.length > 0 && (
              <div className={cn(rows.expense.length > 0 && 'mt-[18px]')}>
                <p className={cn(TILE_SUB_EYEBROW_CLASS, 'mb-1.5')}>Entrate previste</p>
                <BudgetTable rows={rows.income} calendarPct={null} caption="Obiettivi di entrata del mese" {...listProps} />
              </div>
            )}
          </div>

          {/* Below desktop */}
          <div className="mt-2 desktop:hidden">
            {rows.expense.length > 0 && (
              <ul className="flex flex-col divide-y divide-border">
                {rows.expense.map((row) => (
                  <MobileRow key={row.key} row={row} calendarPct={calendarPct} armed={armedKey === row.key} {...listProps} />
                ))}
              </ul>
            )}
            {rows.income.length > 0 && (
              <div className={cn(rows.expense.length > 0 && 'mt-4')}>
                <p className={cn(TILE_SUB_EYEBROW_CLASS, 'border-b border-border pb-1.5')}>Entrate previste</p>
                <ul className="flex flex-col divide-y divide-border">
                  {rows.income.map((row) => (
                    <MobileRow key={row.key} row={row} calendarPct={null} armed={armedKey === row.key} {...listProps} />
                  ))}
                </ul>
              </div>
            )}
          </div>

          <span className="sr-only" role="status" aria-live="polite">
            {announcement}
          </span>
        </>
      )}

      <NarrativeText
        segments={footer}
        className="mt-auto border-t border-border pt-3.5 text-[11px] leading-[1.45] text-muted-foreground"
        figureClassName="font-medium"
      />
    </Tile>
  );
}
