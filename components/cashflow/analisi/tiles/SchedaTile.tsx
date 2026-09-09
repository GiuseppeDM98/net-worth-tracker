'use client';

import { ChevronLeft, X } from 'lucide-react';
import { EXPENSE_TYPE_LABELS, type Expense, type ExpenseType } from '@/types/expenses';
import type { Narrative } from '@/lib/utils/narrative';
import type { EntityScope } from '@/lib/utils/expenseEntityStats';
import type { CompositionSlice } from '@/lib/utils/cashflowComposition';
import { Tile, TILE_SUB_EYEBROW_CLASS } from '@/components/ui/tile';
import { DrillBreadcrumb } from '@/components/ui/drill-breadcrumb';
import { RankedRows } from '@/components/ui/ranked-rows';
import { EntityDossier } from '@/components/cashflow/EntityDossier';
import { FocusTransactions } from '@/components/cashflow/analisi/FocusTransactions';

export interface SchedaFocus {
  level: 'subcategory' | 'expenseList';
  kind: 'expenses' | 'income';
  category: { expenseType: ExpenseType; key: string; label: string };
  subCategory: { key: string; label: string } | null;
}

interface SchedaTileProps {
  focus: SchedaFocus;
  scope: EntityScope;
  reading: Narrative;
  allExpenses: Expense[];
  /** Series colour for the trend, from useChartColors. */
  color: string;
  period: { year: number | null; month: number | null };
  periodLabel: string;
  historyStartYear: number;
  /** The category's subcategories in the period (category level only). */
  subcategoryRows: CompositionSlice[];
  /** The focused subcategory's rows in the period (subcategory level only). */
  transactions: Expense[];
  onBack: () => void;
  onClose: () => void;
  /** A crumb click: the root closes the focus, the category step returns to it. */
  onCategoryCrumb: () => void;
  onSubcategorySelect: (slice: CompositionSlice) => void;
  className?: string;
}

const ACTION_CLASS =
  'inline-flex h-11 items-center justify-center gap-1 rounded-md border border-border px-3 text-[12px] text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring desktop:h-7 desktop:border-0 desktop:px-2';

/**
 * «Cosa succede in questa voce?» — the one place every entity entry point lands (the
 * category rows, the anomalies, the top expenses, the Sankey, the search, the Confronto):
 * a full-width tile with the breadcrumb, the reading and the dossier in two columns, plus the
 * period's subcategory ranking (category level) or its transactions (subcategory level).
 * The tile is a grid cell like the others; the page scrolls to it on focus.
 */
export function SchedaTile({ focus, scope, reading, allExpenses, color, period, periodLabel, historyStartYear, subcategoryRows, transactions, onBack, onClose, onCategoryCrumb, onSubcategorySelect, className }: SchedaTileProps) {
  const isIncome = focus.kind === 'income';
  const title = focus.subCategory?.label ?? focus.category.label;
  const scopeKey = `${focus.category.expenseType}:${focus.category.key}:${focus.subCategory?.key ?? ''}:${periodLabel}`;

  return (
      <Tile
        eyebrow={`Scheda · ${title}`}
        ariaLabel={`Scheda di ${title}`}
        aside={
          <div className="flex w-full flex-wrap items-center justify-end gap-x-2 gap-y-2 desktop:w-auto">
            <span>
              {EXPENSE_TYPE_LABELS[focus.category.expenseType]} · storico dal <span className="font-mono tabular-nums">{historyStartYear}</span>
            </span>
            {/* Below desktop the two exits take a full-width row of 44px targets; from desktop they are the aside's ghost buttons. */}
            <div className="flex w-full gap-2 [&>button]:flex-1 desktop:w-auto desktop:[&>button]:flex-none">
              <button type="button" onClick={onBack} className={ACTION_CLASS}>
                <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
                Indietro
              </button>
              <button type="button" onClick={onClose} className={ACTION_CLASS} aria-label="Chiudi la scheda">
                <X className="h-3.5 w-3.5" aria-hidden="true" />
                Chiudi
              </button>
            </div>
          </div>
        }
        reading={reading}
        className={className}
      >
        <div className="mt-2">
          <DrillBreadcrumb
            ariaLabel="Posizione nel drill-down"
            steps={[
              { label: isIncome ? 'Entrate' : 'Spese', onClick: onClose },
              focus.subCategory ? { label: focus.category.label, onClick: onCategoryCrumb } : { label: focus.category.label },
              ...(focus.subCategory ? [{ label: focus.subCategory.label }] : []),
            ]}
          />
        </div>
        <div className="mt-4">
          <EntityDossier
            allExpenses={allExpenses}
            scope={scope}
            color={color}
            period={period}
            periodLabel={periodLabel}
            historyStartYear={historyStartYear}
            isIncome={isIncome}
            columns
            aside={
              focus.level === 'subcategory' ? (
                subcategoryRows.length > 0 ? (
                  <div>
                    <p className={TILE_SUB_EYEBROW_CLASS}>Sottocategorie · {periodLabel}</p>
                    <div className="mt-1">
                      <RankedRows
                        rows={subcategoryRows.map((slice) => ({ key: slice.key, label: slice.name, amount: slice.value, percentage: slice.percentage }))}
                        color={isIncome ? 'var(--chart-2)' : 'var(--chart-1)'}
                        labelClassName="w-[38%] min-w-[110px]"
                        ariaLabel={`Sottocategorie di ${focus.category.label}`}
                        onRowClick={(row) => {
                          const slice = subcategoryRows.find((candidate) => candidate.key === row.key);
                          if (slice) onSubcategorySelect(slice);
                        }}
                      />
                    </div>
                  </div>
                ) : null
              ) : (
                // Keyed on the subject: the «Mostra altre» window belongs to the entity it was opened on.
                <FocusTransactions key={scopeKey} expenses={transactions} isIncome={isIncome} periodLabel={periodLabel} />
              )
            }
          />
        </div>
      </Tile>
  );
}
