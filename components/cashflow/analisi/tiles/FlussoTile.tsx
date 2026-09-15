'use client';

import { useMemo, useState } from 'react';
import { ChevronLeft } from 'lucide-react';
import { EXPENSE_TYPE_LABELS, type Expense, type ExpenseType } from '@/types/expenses';
import type { Narrative } from '@/lib/utils/narrative';
import {
  buildBudgetFlowData,
  buildBudgetFlowDataWithSubcategories,
  buildTypeDrillDownData,
  countSankeyLayers,
  resolveSankeyHeight,
  MAX_SUBCATEGORY_CATEGORIES,
  type SankeyNodeDescriptor,
  type SankeyView,
} from '@/lib/utils/cashflowSankey';
import { narrativeToText } from '@/lib/utils/narrative';
import { cn } from '@/lib/utils';
import { Tile } from '@/components/ui/tile';
import { DrillBreadcrumb } from '@/components/ui/drill-breadcrumb';
import { CashflowSankeyChart } from '@/components/cashflow/CashflowSankeyChart';

interface FlussoTileProps {
  /** The period's rows (income + spending); transfers are not flows. */
  expenses: Expense[];
  isMobile: boolean;
  reading: Narrative | null;
  /**
   * Category/subcategory node clicks land HERE, not in an internal drill — the page routes
   * them to the one entity-focus path every other entry point uses.
   */
  onEntityClick: (target: { expenseType: ExpenseType; categoryKey: string; subCategoryKey?: string }) => void;
  className?: string;
}

/** The only internal drill left: one expense type's flow. */
interface TypeDrillState {
  expenseType: ExpenseType;
  /** The TYPE node's own colour — the drill-down view derives its shades from it. */
  color: string;
}

/**
 * «Come scorrono i soldi?» — the app's one Sankey inside a tile: eyebrow, the reading over the
 * flow, the view's size and its toggles as the aside, then the plot. The tile owns the two
 * bits of navigation the chart has — the subcategory layer and the single type drill — and
 * builds the view, so the words above the plot describe exactly what is drawn.
 */
export function FlussoTile({ expenses, isMobile, reading, onEntityClick, className }: FlussoTileProps) {
  const [drill, setDrill] = useState<TypeDrillState | null>(null);
  const [showSubcategories, setShowSubcategories] = useState(false);

  const view = useMemo((): SankeyView => {
    if (drill) return buildTypeDrillDownData(expenses, drill.expenseType, drill.color, isMobile);
    return showSubcategories ? buildBudgetFlowDataWithSubcategories(expenses, isMobile) : buildBudgetFlowData(expenses, isMobile);
  }, [expenses, drill, isMobile, showSubcategories]);

  const viewKey = drill ? `type-${drill.expenseType}` : `budget-${showSubcategories ? 'subcategories' : 'categories'}`;
  const modeLabel = drill ? 'Dettaglio per tipologia' : showSubcategories ? `Con sottocategorie · prime ${MAX_SUBCATEGORY_CATEGORIES} categorie` : 'Vista compatta';
  // The plot grows with its widest column, so every label keeps its own line (see resolveSankeyHeight).
  const height = resolveSankeyHeight(countSankeyLayers(view), isMobile);
  // The chart is an image to a screen reader: its name is the tile's reading and its size.
  const chartLabel = `Flusso del periodo, ${modeLabel.toLowerCase()}: ${view.nodes.length} nodi e ${view.links.length} flussi.${reading ? ` ${narrativeToText(reading)}` : ''}`;

  const handleNodeClick = (descriptor: SankeyNodeDescriptor, color: string) => {
    switch (descriptor.kind) {
      case 'budget':
      case 'savings':
        return;
      case 'expenseType':
        // Clicking the root of the view we are already in is a no-op, not a re-entry.
        if (!drill) setDrill({ expenseType: descriptor.expenseType, color });
        return;
      case 'category':
        onEntityClick({ expenseType: descriptor.expenseType, categoryKey: descriptor.categoryKey });
        return;
      case 'subCategory':
        onEntityClick({ expenseType: descriptor.expenseType, categoryKey: descriptor.categoryKey, subCategoryKey: descriptor.subCategoryKey });
        return;
    }
  };

  return (
    <Tile
      eyebrow="Flusso"
      aside={
        <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1">
          <span>
            {modeLabel} · <span className="font-mono tabular-nums">{view.nodes.length}</span> nodi ·{' '}
            <span className="font-mono tabular-nums">{view.links.length}</span> flussi
          </span>
          {!drill && (
            <button
              type="button"
              onClick={() => setShowSubcategories((value) => !value)}
              aria-pressed={showSubcategories}
              className={cn(
                'h-11 rounded-md border border-border px-3 text-[11px] font-medium text-foreground transition-colors hover:bg-muted/40 desktop:h-8 desktop:px-2.5',
                showSubcategories && 'bg-muted',
              )}
            >
              Sottocategorie
            </button>
          )}
        </div>
      }
      reading={reading}
      className={className}
    >
      {drill && (
        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            onClick={() => setDrill(null)}
            className="inline-flex h-11 items-center gap-1 rounded-md border border-border px-3 text-[12px] text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground desktop:h-8 desktop:border-0 desktop:px-2"
          >
            <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
            Indietro
          </button>
          <DrillBreadcrumb
            ariaLabel="Posizione nel flusso"
            steps={[{ label: 'Flusso', onClick: () => setDrill(null) }, { label: EXPENSE_TYPE_LABELS[drill.expenseType] }]}
          />
        </div>
      )}
      {/* The mobile chart drops small slices for legibility — declared, never silent. */}
      {isMobile && (
        <p className="mt-2 text-[11px] text-muted-foreground">
          Su schermi piccoli il grafico mostra solo le voci principali — l&apos;elenco completo è nelle tessere per categoria.
        </p>
      )}
      <div className="mt-3">
        <CashflowSankeyChart view={view} viewKey={viewKey} isMobile={isMobile} height={height} drilled={drill !== null} ariaLabel={chartLabel} onNodeClick={handleNodeClick} />
      </div>
      {/* What a click does, in words — it used to live in a hover tooltip only, invisible to touch. */}
      <p className="mt-auto border-t border-border pt-3.5 text-[11px] text-muted-foreground">
        {drill
          ? 'Una categoria apre la sua scheda; «Indietro» torna al flusso intero.'
          : 'Un tipo di spesa apre il suo dettaglio; una categoria o una sottocategoria apre la scheda.'}
      </p>
    </Tile>
  );
}
