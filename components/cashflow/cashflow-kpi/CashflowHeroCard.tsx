'use client';

import { useState } from 'react';
import { ChevronDown, ArrowRightLeft } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import {
  CategoryBreakdownList,
  type CategoryBreakdownItem,
} from '@/components/cashflow/CategoryBreakdownList';
import { CashflowKpiCarousel } from '@/components/cashflow/cashflow-kpi/CashflowKpiCarousel';
import type { ExpenseCategory } from '@/types/expenses';

// Coverage ratio → Italian health label.
export function coverageHealthLabel(ratio: number): string {
  if (ratio >= 2.0) return 'Salute ottima';
  if (ratio >= 1.3) return 'Salute buona';
  if (ratio >= 1.0) return 'In pareggio';
  return 'In deficit';
}

export interface CashflowHeroCardProps {
  /** Period label shown in the card header (e.g. "MAGGIO 2026"). */
  monthLabel: string;
  income: number;
  expenses: number;
  net: number;
  /** Income / expenses ratio; null when expenses === 0. */
  ratio: number | null;
  /** Month-over-month income delta (percentage). Null when no comparison is available. */
  incomeDelta?: number | null;
  /** Month-over-month expenses delta (percentage). Null when no comparison is available. */
  expensesDelta?: number | null;
  savingsRate: number;
  expenseCategories: CategoryBreakdownItem[];
  incomeCategories: CategoryBreakdownItem[];
  /** Full expense category list — used by CategoryBreakdownList for label + icon lookup. */
  categories: ExpenseCategory[];
  /** Optional internal transfers total shown as a separate row on desktop. */
  transfers?: number;
  className?: string;
}

export function CashflowHeroCard({
  monthLabel,
  income,
  expenses,
  net,
  ratio,
  incomeDelta,
  expensesDelta,
  savingsRate,
  expenseCategories,
  incomeCategories,
  categories,
  transfers,
  className,
}: CashflowHeroCardProps) {
  const [catsExpanded, setCatsExpanded] = useState(false);

  return (
    <Card className={cn('py-0', className)}>
      <CardContent className="p-5">
        {/* Header eyebrow */}
        <p className="text-muted-foreground mb-3 text-[10px] font-semibold tracking-[0.1em] uppercase">
          Cashflow · {monthLabel}
        </p>

        {/* ── MOBILE: Embla carousel ── */}
        <div>
          <CashflowKpiCarousel
            className="-mx-5"
            income={income}
            expenses={expenses}
            net={net}
            ratio={ratio}
            incomeDelta={incomeDelta}
            expensesDelta={expensesDelta}
            savingsRate={savingsRate}
            expenseCategories={expenseCategories}
            incomeCategories={incomeCategories}
            categories={categories}
          />

          {/* Category breakdowns */}
          {
            <div className="desktop:block hidden">
              <div className="border-border mt-4 border-t" />

              {/* Toggle button */}
              <button
                type="button"
                className="text-muted-foreground mt-3 flex w-full items-center justify-between text-[11px] font-semibold tracking-[0.06em] uppercase"
                onClick={() => setCatsExpanded((v) => !v)}
                aria-expanded={catsExpanded}
              >
                <span>Voci per categorie</span>
                <ChevronDown
                  className={cn(
                    'h-3.5 w-3.5 transition-transform duration-200 motion-reduce:transition-none',
                    catsExpanded && 'rotate-180',
                  )}
                />
              </button>

              <div className={cn('mt-3 grid gap-y-4', !catsExpanded && 'hidden')}>
                <div>
                  <p className="text-muted-foreground mb-3 text-[11px] font-semibold tracking-[0.06em] uppercase">
                    Spese per Categoria
                  </p>
                  <CategoryBreakdownList items={expenseCategories} categories={categories} />
                </div>
                <div>
                  <p className="text-muted-foreground mb-3 text-[11px] font-semibold tracking-[0.06em] uppercase">
                    Entrate per Categoria
                  </p>
                  <CategoryBreakdownList items={incomeCategories} categories={categories} />
                </div>
              </div>
            </div>
          }
        </div>
      </CardContent>
    </Card>
  );
}
