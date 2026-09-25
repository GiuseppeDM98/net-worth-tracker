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
 * Opening a center swaps the grid for CostCenterDetail (the same shape on one center) — and
 * it is a NAVIGATION (2026-09-18): the open center lives in the URL (`?tab=cost-centers&
 * center=<id>`, pushed), so a reload keeps it, the browser's Back returns to the list instead
 * of leaving Cashflow, and a co-owner can be sent the link. Until then it was a `useState`.
 *
 * WHY client-side aggregation: every center's rows are fetched once and every figure is
 * derived in memory; for 2-10 centers with a few hundred rows each this is cheap. The query
 * returns TWO numbers per center — its spending rows (the math) and how many rows are linked
 * at all, income included (what `deleteCostCenter` unlinks) — so the delete confirmation
 * counts what the mutation will actually touch.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
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
  CENTRI_ASIDE,
  CENTRI_FOOTER,
  DORMIENTI_ASIDE,
  DORMIENTI_FOOTER,
  EMPTY_CENTRI,
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
import { EmptyState } from '@/components/ui/empty-state';
import { Tile } from '@/components/ui/tile';
import { describeReadFailure } from '@/lib/utils/statesNarrative';
import { describeWriteError } from '@/lib/utils/dialogNarrative';
import { TotaleTile } from './cost-centers/tiles/TotaleTile';
import { CentriTile } from './cost-centers/tiles/CentriTile';
import { DormientiTile } from './cost-centers/tiles/DormientiTile';
import { ArchiviatiDisclosure } from './cost-centers/ArchiviatiDisclosure';

const TRAILING_MONTHS = 12;
/** The URL parameter that holds the open center's id. */
const CENTER_PARAM = 'center';

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

  // --- The open center is the URL's, never local state (see the header) ---
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const selectedCenterId = searchParams.get(CENTER_PARAM);
  // An id the account does not hold (a stale link, a deleted center) falls back to the list.
  const selectedCenter = useMemo(() => centers.find((center) => center.id === selectedCenterId) ?? null, [centers, selectedCenterId]);

  const openCenter = useCallback(
    (center: CostCenter) => router.push(`${pathname}?tab=cost-centers&${CENTER_PARAM}=${encodeURIComponent(center.id)}`, { scroll: false }),
    [router, pathname],
  );
  const backToList = useCallback(() => router.push(`${pathname}?tab=cost-centers`, { scroll: false }), [router, pathname]);

  // Coming back, the focus returns to the row that opened the detail (it was dropped on
  // `body`, measured 2026-09-18). The row is found by id: a center sits in Centri AND in
  // Dormienti when idle, and the first match in DOM order is the one the eye meets first.
  const lastOpenedId = useRef<string | null>(null);
  useEffect(() => {
    if (selectedCenterId) {
      lastOpenedId.current = selectedCenterId;
      return;
    }
    const opener = lastOpenedId.current;
    lastOpenedId.current = null;
    if (opener) document.querySelector<HTMLElement>(`[data-center-row="${CSS.escape(opener)}"]`)?.focus();
  }, [selectedCenterId]);

  // --- UI state ---
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
  // Whatever had the focus when the dialog was asked for — the header's button (it reaches
  // this tab through a window event), the phone's bar, the detail's «Modifica» — gets it back
  // on close. Radix has no trigger to return to on a controlled dialog: it fell to `body`.
  const dialogOpenerRef = useRef<HTMLElement | null>(null);
  const rememberOpener = () => {
    dialogOpenerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  };

  const openCreate = useCallback(() => {
    rememberOpener();
    setEditingCenter(null);
    setDialogOpen(true);
  }, []);

  const openEdit = (center: CostCenter) => {
    rememberOpener();
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

  // The detail reads its center from `centers`, so a saved edit reaches it with the refetch.
  const handleDialogSuccess = () => {
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
      // replace, not push: Back must not land on the detail of a center that no longer exists.
      router.replace(`${pathname}?tab=cost-centers`, { scroll: false });
      invalidate();
    } catch (error) {
      console.error('Error deleting cost center:', error);
      // What did NOT happen first (the user's doubt after a failed delete), then the cause.
      toast.error(`"${center.name}" non è stato eliminato, e nessuna spesa è stata scollegata. ${describeWriteError(error)}`);
    }
  };

  const handleArchiveToggle = async (center: CostCenter) => {
    const archiving = !center.archivedAt;
    try {
      await setCostCenterArchived(center.id, archiving);
      toast.success(archiving ? `"${center.name}" archiviato` : `"${center.name}" ripristinato`);
      invalidate();
    } catch (error) {
      console.error('Error archiving cost center:', error);
      toast.error(`"${center.name}" non è stato ${archiving ? 'archiviato' : 'ripristinato'}. ${describeWriteError(error)}`);
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
          onBack={backToList}
          onEdit={openEdit}
          onDelete={handleDelete}
          onArchiveToggle={handleArchiveToggle}
          isDemo={isDemo}
        />
        <CostCenterDialog open={dialogOpen} onClose={() => setDialogOpen(false)} costCenter={editingCenter} centers={centers} returnFocusTo={dialogOpenerRef} onSuccess={handleDialogSuccess} />
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
        /* «Nothing recorded» keeps the tile and its eyebrow (The Absence-Has-Three-Names Rule),
           and says the ONE thing a first visit cannot guess: a center fills from the expense
           form, not from here. No second button — the header (desktop) and the bar above
           (phone) already create one, and a page does not ask twice for one thing. */
        <Tile eyebrow="Centri" className="max-w-[920px]">
          <EmptyState message={EMPTY_CENTRI} />
        </Tile>
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
                reading={describeTotale(summary, stack, now)}
                lastYearCaption={describeLastYearCaption(now, summary.firstDate)}
                footer={describeTotaleFooter(summary)}
                palette={chartColors}
              />
            </div>
            <div className={cn(TILE_CELL_CLASS, 'order-2 tablet:col-span-2 desktop:order-none desktop:col-span-7')}>
              <CentriTile
                rows={summary.active}
                aside={CENTRI_ASIDE}
                reading={describeCentri(summary)}
                footer={CENTRI_FOOTER}
                palette={chartColors}
                now={now}
                onOpen={openCenter}
              />
            </div>
            <div className={cn(TILE_CELL_CLASS, 'order-3 tablet:col-span-2 desktop:order-none desktop:col-span-7')}>
              <DormientiTile
                centers={summary.dormant}
                aside={DORMIENTI_ASIDE}
                reading={describeDormienti(summary)}
                footer={DORMIENTI_FOOTER}
                palette={chartColors}
                onOpen={openCenter}
              />
            </div>
          </div>

          {/* ── Archiviati, below the fold ──────────────────────────────────────── */}
          <ArchiviatiDisclosure rows={summary.archived} summary={describeArchiviati(summary)} palette={chartColors} onOpen={openCenter} />
        </>
      )}

      <CostCenterDialog open={dialogOpen} onClose={() => setDialogOpen(false)} costCenter={editingCenter} centers={centers} returnFocusTo={dialogOpenerRef} onSuccess={handleDialogSuccess} />
    </div>
  );
}
