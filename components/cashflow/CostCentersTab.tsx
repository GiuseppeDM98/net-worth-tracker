'use client';

/**
 * Cashflow › Centri di Costo — a verdict over a tile grid (2026-08-23).
 *
 * The tab answers «quanto sta costando il progetto?» before any number: the rule-generated
 * verdict (lib/utils/costCenterNarrative.ts) at the top, and under it a 12-column bento of
 * tiles, each answering ONE question with a reading line over its figures. There is NO
 * period axis: a center's cost is its whole cost, and every tile measured on another window
 * names it («quest'anno», «ultimi 12 mesi», the ceiling's own month or year).
 *
 *   Mobile (1 col):   Verdict → [Nuovo centro] → Totale → Centri → Dormienti → Archiviati
 *   Desktop (12 col): Totale (5, 2 rows) | Centri (7)
 *                                        | Dormienti (7)
 *                     Archiviati (disclosure, below the fold)
 *
 * Every number is born in costCenterSummary.ts, every sentence in costCenterNarrative.ts.
 * Opening a center swaps the grid for CostCenterDetail (the same shape on one center).
 *
 * WHY client-side aggregation: every center's rows are fetched once and every figure is
 * derived in memory; for 2-10 centers with a few hundred rows each this is cheap. The query
 * returns TWO numbers per center — its spending rows (the math) and how many rows are linked
 * at all, income included (what `deleteCostCenter` unlinks) — so the delete confirmation
 * counts what the mutation will actually touch.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { useActiveAccount } from '@/contexts/ActiveAccountContext';
import { useDemoMode } from '@/lib/hooks/useDemoMode';
import { useChartColors } from '@/lib/hooks/useChartColors';
import { queryKeys } from '@/lib/query/queryKeys';
import type { CostCenter } from '@/types/costCenters';
import type { Expense } from '@/types/expenses';
import { getCostCenters, getExpensesForCostCenter, deleteCostCenter, setCostCenterArchived } from '@/lib/services/costCenterService';
import { buildCenterMonthStack, summarizeCostCenters } from '@/lib/utils/costCenterSummary';
import {
  CENTRI_FOOTER,
  DORMIENTI_ASIDE,
  DORMIENTI_FOOTER,
  buildCostCentersVerdict,
  describeArchiviati,
  describeCentri,
  describeDormienti,
  describeLastYearCaption,
  describeTotale,
  describeTotaleAside,
  describeTotaleFooter,
  describeTrailingCaption,
} from '@/lib/utils/costCenterNarrative';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { PageVerdict } from '@/components/ui/page-verdict';
import { TILE_CELL_CLASS } from '@/components/ui/tile';
import { TileGridSkeleton } from '@/components/ui/tile-grid-skeleton';
import type { TileSkeletonCell } from '@/lib/utils/tileGridSkeleton';
import { CostCenterDialog } from './CostCenterDialog';
import { CostCenterDetail } from './CostCenterDetail';
import { ErrorNotice } from '@/components/ui/error-notice';
import { describeReadFailure } from '@/lib/utils/statesNarrative';
import { TotaleTile } from './cost-centers/tiles/TotaleTile';
import { CentriTile } from './cost-centers/tiles/CentriTile';
import { DormientiTile } from './cost-centers/tiles/DormientiTile';
import { ArchiviatiDisclosure } from './cost-centers/ArchiviatiDisclosure';

const TRAILING_MONTHS = 12;

/** The page's own grid, so the loading state has the proportions of what replaces it. */
const SKELETON_CELLS: TileSkeletonCell[] = [
  { span: 5, rows: 2, lines: 8 },
  { span: 7, lines: 6 },
  { span: 7, lines: 3 },
];

interface CenterRows {
  spending: Expense[];
  linkedCount: number;
}

export function CostCentersTab() {
  const { user } = useAuth();
  const { ownerId } = useActiveAccount();
  const isDemo = useDemoMode();
  const queryClient = useQueryClient();
  const chartColors = useChartColors();

  // Reads the OWNER's data, not the viewer's: on a shared account they differ.
  const { data, isLoading: loading, isError } = useQuery({
    queryKey: queryKeys.costCenters.all(ownerId ?? ''),
    enabled: !!user && !!ownerId,
    queryFn: async () => {
      const userId = ownerId!;
      const centers = await getCostCenters(userId);
      const entries = await Promise.all(
        centers.map(async (center) => {
          const expenses = await getExpensesForCostCenter(userId, center.id);
          return [center.id, { spending: expenses.filter((e) => e.amount < 0), linkedCount: expenses.length }] as [string, CenterRows];
        }),
      );
      return { centers, byCenter: Object.fromEntries(entries) as Record<string, CenterRows> };
    },
  });

  const centers = useMemo(() => data?.centers ?? [], [data]);
  const byCenter = useMemo(() => data?.byCenter ?? {}, [data]);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: queryKeys.costCenters.all(ownerId ?? '') });

  // --- UI state ---
  const [selectedCenter, setSelectedCenter] = useState<CostCenter | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCenter, setEditingCenter] = useState<CostCenter | null>(null);

  // Evaluated once per mount — the figures read the day the tab was opened.
  const now = useMemo(() => new Date(), []);

  // --- Every number, from the pure layer ---
  const summary = useMemo(
    () => summarizeCostCenters(centers.map((center) => ({ center, expenses: byCenter[center.id]?.spending ?? [] })), now),
    [centers, byCenter, now],
  );
  const stack = useMemo(() => buildCenterMonthStack(summary.active, now, TRAILING_MONTHS), [summary, now]);
  const verdict = useMemo(() => buildCostCentersVerdict(summary, now), [summary, now]);

  // --- Handlers ---
  const openCreate = useCallback(() => {
    setEditingCenter(null);
    setDialogOpen(true);
  }, []);

  const openEdit = (center: CostCenter) => {
    setEditingCenter(center);
    setDialogOpen(true);
  };

  // The page header owns the desktop «Nuovo centro»; the tab owns the dialog, so the two
  // talk through a window event — the channel Tracciamento, Dividendi and Budget use.
  useEffect(() => {
    const onAdd = () => openCreate();
    window.addEventListener('cashflow:add-cost-center', onAdd);
    return () => window.removeEventListener('cashflow:add-cost-center', onAdd);
  }, [openCreate]);

  const handleDialogSuccess = (saved: CostCenter) => {
    if (selectedCenter?.id === saved.id) setSelectedCenter(saved);
    invalidate();
  };

  const handleDelete = async (center: CostCenter) => {
    if (!user || !ownerId) return;
    const unlinkedCount = byCenter[center.id]?.linkedCount ?? 0;
    try {
      await deleteCostCenter(ownerId, center.id);
      // The cascade is the part the user cannot see: name the outcome and the reassurance —
      // the expenses survive, they only lose the tag.
      toast.success(
        unlinkedCount > 0
          ? `"${center.name}" eliminato · ${unlinkedCount} ${unlinkedCount === 1 ? 'spesa scollegata resta' : 'spese scollegate restano'} in Cashflow`
          : `"${center.name}" eliminato`,
      );
      setSelectedCenter(null);
      invalidate();
    } catch (error) {
      console.error('Error deleting cost center:', error);
      toast.error("Errore durante l'eliminazione");
    }
  };

  const handleArchiveToggle = async (center: CostCenter) => {
    const archiving = !center.archivedAt;
    try {
      const archivedAt = await setCostCenterArchived(center.id, archiving);
      const updated = { ...center, archivedAt };
      if (selectedCenter?.id === center.id) setSelectedCenter(updated);
      toast.success(archiving ? `"${center.name}" archiviato` : `"${center.name}" ripristinato`);
      invalidate();
    } catch (error) {
      console.error('Error archiving cost center:', error);
      toast.error("Errore durante l'archiviazione");
    }
  };

  const addButtonLabel = isDemo ? 'Nuovo centro — non disponibile in modalità demo' : 'Nuovo centro';

  // --- Detail view ---
  if (selectedCenter) {
    return (
      <>
        <CostCenterDetail
          costCenter={selectedCenter}
          linkedExpenseCount={byCenter[selectedCenter.id]?.linkedCount ?? 0}
          initialExpenses={byCenter[selectedCenter.id]?.spending}
          onBack={() => setSelectedCenter(null)}
          onEdit={openEdit}
          onDelete={handleDelete}
          onArchiveToggle={handleArchiveToggle}
          isDemo={isDemo}
        />
        <CostCenterDialog open={dialogOpen} onClose={() => setDialogOpen(false)} costCenter={editingCenter} onSuccess={handleDialogSuccess} />
      </>
    );
  }

  if (loading) {
    return <TileGridSkeleton cells={SKELETON_CELLS} className="pt-1" />;
  }

  // --- List view ---
  return (
    <div className="space-y-4 max-desktop:portrait:pb-20">
      {/* ── Verdict ─────────────────────────────────────────────────────────────── */}
      <div className="pt-1">
        <PageVerdict verdict={verdict} ariaLabel="Verdetto sui centri di costo" />
      </div>

      {/* ── Below desktop: the only add affordance there is on a phone (the bottom-nav FAB
          belongs to Tracciamento) ──────────────────────────────────────────────── */}
      <Button variant="outline" className="h-11 w-full desktop:hidden" onClick={openCreate} disabled={isDemo} aria-label={addButtonLabel}>
        <Plus className="h-4 w-4" />
        Nuovo centro
      </Button>

      {isError ? (
        /* Before the empty check, never after: `centers` defaults to [] on failure too. */
        <ErrorNotice
          className="max-w-[920px]"
          notice={describeReadFailure({
            consequence: 'I centri di costo non sono stati letti: senza di essi la pagina direbbe che non ne hai nessuno.',
            untouched: 'I centri e le spese registrate non sono stati toccati.',
          })}
        />
      ) : centers.length === 0 ? (
        <div className="hidden desktop:block">
          <Button onClick={openCreate} disabled={isDemo} variant="outline" size="sm" aria-label={addButtonLabel}>
            <Plus className="h-4 w-4" />
            Crea il primo centro
          </Button>
        </div>
      ) : (
        <>
          {/* ── Tile grid ─────────────────────────────────────────────────────── */}
          <div className="grid grid-cols-1 gap-3 tablet:grid-cols-2 desktop:grid-cols-12">
            <div className={cn(TILE_CELL_CLASS, 'order-1 tablet:col-span-2 desktop:order-none desktop:col-span-5 desktop:row-span-2')}>
              <TotaleTile
                summary={summary}
                stack={stack}
                stackCaption={describeTrailingCaption(stack, now)}
                aside={describeTotaleAside(summary)}
                reading={describeTotale(summary)}
                lastYearCaption={describeLastYearCaption(now)}
                footer={describeTotaleFooter(summary)}
                palette={chartColors}
              />
            </div>
            <div className={cn(TILE_CELL_CLASS, 'order-2 tablet:col-span-2 desktop:order-none desktop:col-span-7')}>
              <CentriTile
                rows={summary.active}
                aside={describeTotaleAside(summary)}
                reading={describeCentri(summary)}
                footer={CENTRI_FOOTER}
                palette={chartColors}
                now={now}
                onOpen={setSelectedCenter}
              />
            </div>
            <div className={cn(TILE_CELL_CLASS, 'order-3 tablet:col-span-2 desktop:order-none desktop:col-span-7')}>
              <DormientiTile
                centers={summary.dormant}
                aside={DORMIENTI_ASIDE}
                reading={describeDormienti(summary)}
                footer={DORMIENTI_FOOTER}
                palette={chartColors}
                onOpen={setSelectedCenter}
              />
            </div>
          </div>

          {/* ── Archiviati, below the fold ──────────────────────────────────────── */}
          <ArchiviatiDisclosure rows={summary.archived} summary={describeArchiviati(summary)} palette={chartColors} onOpen={setSelectedCenter} />
        </>
      )}

      <CostCenterDialog open={dialogOpen} onClose={() => setDialogOpen(false)} costCenter={editingCenter} onSuccess={handleDialogSuccess} />
    </div>
  );
}
