'use client';

import { useMemo, useState } from 'react';
import { ChevronLeft } from 'lucide-react';
import { EXPENSE_TYPE_LABELS, type Expense, type ExpenseType } from '@/types/expenses';
import type { Narrative } from '@/lib/utils/narrative';
import {
  buildBudgetFlowData,
  buildBudgetFlowDataWithSubcategories,
  buildSpendingRoleDrillDownData,
  buildSpendingRolesFlowData,
  buildSpendingRolesFlowDataWithSubcategories,
  buildTypeDrillDownData,
  countSankeyLayers,
  DEFAULT_SPENDING_ROLE_PALETTE,
  resolveSankeyHeight,
  MAX_SUBCATEGORY_CATEGORIES,
  type SankeyNodeDescriptor,
  type SankeyView,
  type SpendingRolePalette,
} from '@/lib/utils/cashflowSankey';
import { SPENDING_BUCKET_LABELS, type SpendingBucket, type SpendingRoleSource, type SpendingRolesSummary } from '@/lib/utils/spendingRoles';
import { buildTypeFlowBreakdown, type FlowSummary } from '@/lib/utils/analisiSummary';
import type { ScheduledSlice } from '@/lib/utils/tracciamentoSummary';
import { useCssColorTokens } from '@/lib/hooks/useCssColorTokens';
import { SPENDING_ROLE_TOKEN } from '@/lib/constants/spendingRoleColors';
import { narrativeToText } from '@/lib/utils/narrative';
import { cn } from '@/lib/utils';
import { Tile } from '@/components/ui/tile';
import { AsideToggle } from '@/components/ui/aside-toggle';
import { DrillBreadcrumb } from '@/components/ui/drill-breadcrumb';
import { Skeleton } from '@/components/ui/skeleton';
import { lazyComponent } from '@/components/ui/lazy-component';
import { SpendingRolesMobileFlow } from '@/components/cashflow/analisi/SpendingRolesMobileFlow';
import { SpendingTypesMobileFlow } from '@/components/cashflow/analisi/SpendingTypesMobileFlow';

/** The 50/30/20 view's inputs; `null` while settings.spendingRolesEnabled is off. */
export interface SpendingRolesFlowInput {
  categories: SpendingRoleSource[];
  summary: SpendingRolesSummary;
  reading: Narrative | null;
}

interface FlussoTileProps {
  /** The period's rows (income + spending); transfers are not flows. */
  expenses: Expense[];
  /** Below 640px: the tile draws a share bar and rows, never a Sankey. */
  isMobile: boolean;
  /** The reading of the type view. */
  reading: Narrative | null;
  /** The reading's own figures (`summarizeFlow`) — the phone's type bar is built from them, only when drawn. */
  flow: FlowSummary;
  spendingRoles: SpendingRolesFlowInput | null;
  /** The period's not-yet-happened slice and how far it reaches: the phone's surplus note declares it. */
  scheduled: ScheduledSlice;
  scheduledHorizon: string | null;
  /**
   * Category/subcategory node clicks land HERE, not in an internal drill — the page routes
   * them to the one entity-focus path every other entry point uses.
   */
  onEntityClick: (target: { expenseType: ExpenseType; categoryKey: string; subCategoryKey?: string }) => void;
  className?: string;
}

/**
 * The Sankey (`@nivo/sankey`, d3-sankey and react-spring) is its own chunk, requested only where
 * the tile draws it — from 640px: a phone, which gets the share bar and rows, never downloads it
 * (2026-09-30; pinned by `e2e/bundle.lazy{,.mobile}.spec.ts`). Declared at MODULE level,
 * never in a render (AGENTS.md § Dynamic Imports). The wait fills the box the plot is given: the
 * caller wraps it in a container of the view's own height (`resolveSankeyHeight`), so the chart
 * lands in place and nothing under the tile moves.
 *
 * From 640px the download starts when THIS module is evaluated — with the page, in parallel with
 * its reads — not when the tile first draws the Sankey, after every expense is read. And it is a
 * `lazyComponent`, not a `next/dynamic`: with the chunk already in memory the chart draws in the
 * same render as the figures, where a Suspense fallback held the placeholder ~275 ms longer
 * (measured on the mirror, the same day). The width test is AnalisiTab's phone query, negated:
 * below it nothing is fetched.
 */
const CashflowSankeyChart = lazyComponent(() => import('@/components/cashflow/CashflowSankeyChart').then((m) => m.CashflowSankeyChart));
if (typeof window !== 'undefined' && !window.matchMedia('(max-width: 639px)').matches) {
  CashflowSankeyChart.preload().catch(() => {}); // a failure is retried by the first draw
}

type FlowMode = 'types' | 'roles';

// Parallel names that say what the flow is grouped by, one always pressed: the tile-aside view
// switch (AsideToggle — one Tab stop, the selected option; 44px below desktop:).
const FLOW_MODE_OPTIONS: ReadonlyArray<{ value: FlowMode; label: string }> = [
  { value: 'roles', label: 'Per ruolo' },
  { value: 'types', label: 'Per tipo' },
];

/**
 * The only internal drill left: one expense type's flow, or one role's. `color` is the root
 * node's own colour — the drill-down view derives its shades from it.
 */
type DrillState =
  | { kind: 'type'; expenseType: ExpenseType; color: string }
  | { kind: 'role'; bucket: SpendingBucket; color: string };

/**
 * «Come scorrono i soldi?» — the app's one Sankey inside a tile: eyebrow, the reading over the
 * flow, the view's size and its toggles as the aside, then the plot. The tile owns the navigation
 * the chart has — the view (by type or by 50/30/20 role, the latter the default once the setting is
 * on), the subcategory layer and the single type/role drill — and builds the view, so the words
 * above the plot describe exactly what is drawn.
 *
 * THE FLUSSO PICKS ITS DRAWING AT 640px (owner's decision, 2026-09-27): a legibility threshold of
 * the chart, not a second composition. From 640 the Sankey; below it, where a four-column flow gets
 * ~80px a column, the SAME figures as a share bar and ranked rows — SpendingRolesMobileFlow for the
 * roles view, SpendingTypesMobileFlow for the type view, both drawn by FlowShareMobile. Below 640
 * no Sankey model is built at all (no view, no height, no label), and the role colours are not read.
 */
export function FlussoTile({ expenses, isMobile, reading, flow, spendingRoles, scheduled, scheduledHorizon, onEntityClick, className }: FlussoTileProps) {
  const [showSubcategories, setShowSubcategories] = useState(false);
  const [preferredMode, setPreferredMode] = useState<FlowMode>('roles');
  // A drill is a place INSIDE the Sankey, and the Sankey exists only from 640px. Stored WITH the
  // width it was opened at (AGENTS.md → «State belonging to a subject must be stored WITH its
  // subject»), it resolves to none as soon as the viewport crosses below 640 — no effect resets it,
  // and the phone never builds a view for it; widened again, the reader is back where they were.
  const [storedDrill, setStoredDrill] = useState<{ isMobile: boolean; drill: DrillState } | null>(null);
  const drill = storedDrill !== null && storedDrill.isMobile === isMobile ? storedDrill.drill : null;
  const setDrill = (next: DrillState | null) => setStoredDrill(next ? { isMobile, drill: next } : null);

  // With the setting off there is only one view, whatever was chosen before.
  const mode: FlowMode = spendingRoles ? preferredMode : 'types';
  // The role colours are read from the theme only while the roles Sankey is on screen: with the
  // setting off, on «Per tipo» or on a phone nothing paints them, and the read would cost a second
  // render of the tile and a second build of the Sankey for nothing (PERF-12/PERF-14).
  const rolesSankeyDrawn = !isMobile && spendingRoles !== null && mode === 'roles';
  // SPENDING_ROLE_TOKEN is a module-level constant, so the hook's effect sees a stable identity.
  const palette: SpendingRolePalette = useCssColorTokens(SPENDING_ROLE_TOKEN, DEFAULT_SPENDING_ROLE_PALETTE, rolesSankeyDrawn);

  // Every view that does NOT read the palette — the type flow and both drills (a drill takes its
  // colour from the clicked node) — so a palette read never rebuilds them. Null on a phone.
  const plainView = useMemo((): SankeyView | null => {
    if (isMobile) return null;
    if (drill?.kind === 'type') return buildTypeDrillDownData(expenses, drill.expenseType, drill.color);
    if (drill?.kind === 'role' && spendingRoles) return buildSpendingRoleDrillDownData(expenses, spendingRoles.categories, drill.bucket, drill.color);
    if (mode === 'roles') return null;
    return showSubcategories ? buildBudgetFlowDataWithSubcategories(expenses) : buildBudgetFlowData(expenses);
  }, [isMobile, drill, expenses, spendingRoles, mode, showSubcategories]);

  // The roles flow, the one view painted with the theme's role colours.
  const rolesView = useMemo((): SankeyView | null => {
    if (!rolesSankeyDrawn || drill || !spendingRoles) return null;
    return showSubcategories
      ? buildSpendingRolesFlowDataWithSubcategories(expenses, spendingRoles.categories, palette)
      : buildSpendingRolesFlowData(expenses, spendingRoles.categories, palette);
  }, [rolesSankeyDrawn, drill, spendingRoles, showSubcategories, expenses, palette]);

  const view = rolesView ?? plainView;

  // The phone's type bar and rows, built only when they are what the tile draws.
  const typeBreakdown = useMemo(() => (isMobile && mode === 'types' ? buildTypeFlowBreakdown(expenses, flow) : null), [isMobile, mode, expenses, flow]);

  const layer = showSubcategories ? 'subcategories' : 'categories';
  const viewKey = drill
    ? drill.kind === 'type' ? `type-${drill.expenseType}` : `role-${drill.bucket}`
    : `${mode === 'roles' ? 'roles' : 'budget'}-${layer}`;
  const modeLabel = drill
    ? drill.kind === 'type' ? 'Dettaglio per tipologia' : 'Dettaglio per ruolo'
    : showSubcategories ? `Con sottocategorie · prime ${MAX_SUBCATEGORY_CATEGORIES} categorie` : 'Vista compatta';
  const drillLabel = drill ? (drill.kind === 'type' ? EXPENSE_TYPE_LABELS[drill.expenseType] : SPENDING_BUCKET_LABELS[drill.bucket]) : null;
  const shownReading = mode === 'roles' && spendingRoles && !drill ? spendingRoles.reading : reading;
  // The plot grows with its widest column, so every label keeps its own line (see resolveSankeyHeight).
  const height = view ? resolveSankeyHeight(countSankeyLayers(view)) : 0;
  // The chart is an image to a screen reader: its name is the tile's reading and its size.
  const chartLabel = view
    ? `Flusso del periodo, ${modeLabel.toLowerCase()}: ${view.nodes.length} nodi e ${view.links.length} flussi.${shownReading ? ` ${narrativeToText(shownReading)}` : ''}`
    : '';

  const handleNodeClick = (descriptor: SankeyNodeDescriptor, color: string) => {
    switch (descriptor.kind) {
      case 'budget':
      case 'savings':
      case 'deficit':
        return;
      case 'expenseType':
        // Clicking the root of the view we are already in is a no-op, not a re-entry.
        if (!drill) setDrill({ kind: 'type', expenseType: descriptor.expenseType, color });
        return;
      case 'spendingRole':
        if (!drill) setDrill({ kind: 'role', bucket: descriptor.bucket, color });
        return;
      case 'category':
        onEntityClick({ expenseType: descriptor.expenseType, categoryKey: descriptor.categoryKey });
        return;
      case 'subCategory':
        onEntityClick({ expenseType: descriptor.expenseType, categoryKey: descriptor.categoryKey, subCategoryKey: descriptor.subCategoryKey });
        return;
    }
  };

  const handleModeChange = (next: FlowMode) => {
    setPreferredMode(next);
    setDrill(null);
  };

  return (
    <Tile
      eyebrow="Flusso"
      aside={
        <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1">
          {view && (
            <span>
              {modeLabel} · <span className="font-mono tabular-nums">{view.nodes.length}</span> nodi ·{' '}
              <span className="font-mono tabular-nums">{view.links.length}</span> flussi
            </span>
          )}
          {spendingRoles && !drill && (
            <AsideToggle options={FLOW_MODE_OPTIONS} value={mode} onChange={handleModeChange} ariaLabel="Raggruppa il flusso" />
          )}
          {!drill && !isMobile && (
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
      reading={shownReading}
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
            steps={[{ label: 'Flusso', onClick: () => setDrill(null) }, { label: drillLabel ?? '' }]}
          />
        </div>
      )}
      {isMobile ? (
        spendingRoles && mode === 'roles' ? (
          <SpendingRolesMobileFlow summary={spendingRoles.summary} scheduled={scheduled} horizon={scheduledHorizon} onEntityClick={onEntityClick} />
        ) : (
          typeBreakdown && (
            <SpendingTypesMobileFlow breakdown={typeBreakdown} scheduled={scheduled} horizon={scheduledHorizon} onEntityClick={onEntityClick} />
          )
        )
      ) : (
        view && (
          // The plot's own height, before the chunk: the Skeleton fills it and the chart replaces it in place.
          <div className="mt-3 flex flex-col" style={{ minHeight: view.nodes.length > 0 && view.links.length > 0 ? height : undefined }}>
            <CashflowSankeyChart
              view={view}
              viewKey={viewKey}
              height={height}
              drilled={drill !== null}
              ariaLabel={chartLabel}
              onNodeClick={handleNodeClick}
              nodeSort={mode === 'roles' && !drill ? 'input' : 'auto'}
              fallback={<Skeleton className="w-full flex-1" />}
            />
          </div>
        )
      )}
      {/* What a click does, in words — it used to live in a hover tooltip only, invisible to touch. */}
      <p className="mt-auto border-t border-border pt-3.5 text-[11px] text-muted-foreground">
        {isMobile
          ? 'Una categoria apre la sua scheda.'
          : drill
            ? 'Una categoria apre la sua scheda; «Indietro» torna al flusso intero.'
            : mode === 'roles'
              ? 'Un ruolo apre il suo dettaglio; una categoria o una sottocategoria apre la scheda.'
              : 'Un tipo di spesa apre il suo dettaglio; una categoria o una sottocategoria apre la scheda.'}
      </p>
    </Tile>
  );
}
