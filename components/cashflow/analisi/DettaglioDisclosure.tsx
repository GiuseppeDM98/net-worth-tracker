'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { Expense } from '@/types/expenses';
import { cn } from '@/lib/utils';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { TILE_EYEBROW_CLASS } from '@/components/ui/tile';
import { SavingsRateTrendSection } from '@/components/cashflow/SavingsRateTrendSection';
import { AndamentoStoricoSection } from '@/components/cashflow/AndamentoStoricoSection';

interface DettaglioDisclosureProps {
  allExpenses: Expense[];
  historyStartYear: number;
  /** The year the savings trend is scoped to; null in history mode (full history with its own range toggle). */
  scopeYear: number | null;
  /** History mode only: the per-year/per-month evolution of flows, categories and types. */
  showHistory: boolean;
}

/**
 * «Dettaglio», below the grid behind a disclosure: the reference material for whoever wants to
 * go deeper — the savings-rate trend (year-scoped whenever a year is selected) and, in
 * history mode only, the evolution over time (in the year modes the Confronto already covers
 * the period, and a Mese/Anno axis would degenerate to one bucket). Closed by default.
 */
export function DettaglioDisclosure({ allExpenses, historyStartYear, scopeYear, showHistory }: DettaglioDisclosureProps) {
  const [open, setOpen] = useState(false);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex w-full items-center justify-between gap-3 border-t border-border/40 py-3 text-left" aria-label="Dettaglio">
        <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className={TILE_EYEBROW_CLASS}>Dettaglio</span>
          <span className="text-[13px] text-muted-foreground">
            {showHistory ? 'Andamento del risparmio e dei flussi nel tempo' : 'Andamento del risparmio mese per mese'}
          </span>
        </span>
        <ChevronDown className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} aria-hidden="true" />
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-1">
        <div className="flex flex-col gap-3">
          {showHistory && <AndamentoStoricoSection allExpenses={allExpenses} historyStartYear={historyStartYear} />}
          <SavingsRateTrendSection allExpenses={allExpenses} historyStartYear={historyStartYear} scopeYear={scopeYear} />
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
