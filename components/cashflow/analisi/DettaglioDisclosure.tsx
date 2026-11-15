'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { Expense } from '@/types/expenses';
import { cn } from '@/lib/utils';
import { useMediaQuery } from '@/lib/hooks/useMediaQuery';
import { useElementWidth } from '@/lib/hooks/useElementWidth';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Skeleton } from '@/components/ui/skeleton';
import { TILE_EYEBROW_CLASS } from '@/components/ui/tile';
import { SAVINGS_LAZY_CHARTS, SavingsRateTrendSection } from '@/components/cashflow/SavingsRateTrendSection';
import { ANDAMENTO_LAZY_CHARTS, AndamentoStoricoSection } from '@/components/cashflow/AndamentoStoricoSection';
import { lazyComponent, usePreloadWhenIdle } from '@/components/ui/lazy-component';
import type { FlussoTileProps } from '@/components/cashflow/analisi/tiles/FlussoTile';

/**
 * The Flusso is content of «Dettaglio» since 2026-11-12: its module (and the Sankey's, from 640px)
 * is fetched at idle with the sections' plots, never in the page's first graph. Only the TYPE comes
 * from it statically (AGENTS.md § Dynamic Imports: lazy the plot, never the section that owns the
 * trigger — the trigger is this file's, static).
 */
const FlussoTile = lazyComponent(() => import('./tiles/FlussoTile').then((m) => m.FlussoTile));

/** The lazy content, fetched while the page is idle so an opening draws it at once. */
const DETTAGLIO_LAZY_CHARTS = [FlussoTile, ...SAVINGS_LAZY_CHARTS, ...ANDAMENTO_LAZY_CHARTS];

/** The Flusso's cell from which the Sankey is drawn: a 640px viewport's cell (640 − `main`'s 2 × 16px). */
const FLUSSO_SANKEY_MIN_CELL = 608;

interface DettaglioDisclosureProps {
  allExpenses: Expense[];
  historyStartYear: number;
  /** The year the savings trend is scoped to; null in history mode (full history with its own range toggle). */
  scopeYear: number | null;
  /** History mode only: the per-year/per-month evolution of flows, categories and types. */
  showHistory: boolean;
  /** The Flusso's props but its width, which this disclosure measures; null when nothing flowed. */
  flusso: Omit<FlussoTileProps, 'isMobile' | 'className'> | null;
}

/**
 * «Dettaglio», below the grid behind a disclosure: the reference material for whoever wants to
 * go deeper — the period's Flusso (2026-11-12; until then a tile of the grid), the savings-rate
 * trend (year-scoped whenever a year is selected) and, in history mode only, the evolution over
 * time (in the year modes the Confronto already covers the period, and a Mese/Anno axis would
 * degenerate to one bucket). Closed by default.
 */
export function DettaglioDisclosure({ allExpenses, historyStartYear, scopeYear, showHistory, flusso }: DettaglioDisclosureProps) {
  const [open, setOpen] = useState(false);
  usePreloadWhenIdle(DETTAGLIO_LAZY_CHARTS);
  // The Flusso's drawing: bar and rows where its cell is narrower than 608px — a 640px phone's cell,
  // the legibility threshold of the chart (owner, 2026-09-27). Measured on the cell, not the viewport
  // (owner, 2026-10-16: a tile lays out by its box); the viewport's guess only until the first measure.
  const isPhoneWidth = useMediaQuery('(max-width: 639px)');
  const [flussoCellRef, flussoCellWidth] = useElementWidth();
  const flussoNarrow = flussoCellWidth === null ? isPhoneWidth : flussoCellWidth < FLUSSO_SANKEY_MIN_CELL;
  const lines = flusso
    ? showHistory
      ? 'Il flusso, il risparmio e i flussi nel tempo'
      : 'Il flusso del periodo e il risparmio mese per mese'
    : showHistory
      ? 'Andamento del risparmio e dei flussi nel tempo'
      : 'Andamento del risparmio mese per mese';

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex w-full items-center justify-between gap-3 border-t border-border/40 py-3 text-left" aria-label="Dettaglio">
        <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className={TILE_EYEBROW_CLASS}>Dettaglio</span>
          <span className="text-[13px] text-muted-foreground">{lines}</span>
        </span>
        <ChevronDown className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} aria-hidden="true" />
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-1">
        <div className="flex flex-col gap-3">
          {/* Transfers are not flows: a period holding only transfers has no Flusso to draw. */}
          {flusso && (
            <div ref={flussoCellRef} data-dettaglio-flusso="" className="flex min-w-0 [&>section]:flex-1">
              <FlussoTile {...flusso} isMobile={flussoNarrow} fallback={<Skeleton className="min-h-[360px] w-full rounded-2xl sm:min-h-[600px]" />} />
            </div>
          )}
          {showHistory && <AndamentoStoricoSection allExpenses={allExpenses} historyStartYear={historyStartYear} />}
          <SavingsRateTrendSection allExpenses={allExpenses} historyStartYear={historyStartYear} scopeYear={scopeYear} />
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
