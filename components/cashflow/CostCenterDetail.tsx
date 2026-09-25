'use client';

/**
 * CostCenterDetail — one center as a verdict over a tile grid (2026-08-23).
 *
 * The view answers «quanto mi è costato?» before any number: the rule-generated verdict
 * (lib/utils/costCenterNarrative.ts → buildCostCenterVerdict) with the actions beside it,
 * then a 12-column bento, each tile ONE question with a reading line over its figures:
 *
 *   Desktop (12 col): Costo (5, 2 rows) | Per categoria (4) | Ciclo di vita (3)
 *                                       | Per sottocategoria (7)
 *                     Movimenti collegati (12)
 *   Mobile (1 col):   ← Centri di costo → verdict → [Modifica · Archivia · Elimina] at 44px →
 *                     Costo → Per categoria → Ciclo di vita → Per sottocategoria → Movimenti
 *
 * NO period axis: every figure is the center's whole cost, and the ones on another window
 * name it (the ceiling's own month or year with today's mark, «Questo mese», «Quest'anno»,
 * «Ultimi 12 mesi»). Every number is born in costCenterSummary.ts, every sentence in
 * costCenterNarrative.ts; this component fetches, memoizes and renders.
 *
 * Opening is a navigation (CostCentersTab keeps the center in the URL), so the view lands
 * like a page: `main` scrolled to the top and the focus on the back link. On a phone the row
 * that opens it sits below the fold, and the detail used to mount 530px down its own length
 * with the title, the verdict and the actions out of sight (measured 2026-09-18).
 *
 * A center is filled AND corrected from here (2026-09-18): «Collega spese…» links many
 * expenses in one confirm (cost-centers/LinkExpensesDialog), a row of Movimenti opens its
 * expense in the form Tracciamento uses, and «Scollega» takes it out of the center in place
 * — a row of a series through «solo questa o tutta?». Every write is a two-sided plan
 * (lib/utils/costCenterLinking.ts), so the outcome toast carries a real «Annulla».
 *
 * The subcategory exclusions are session-only and stored WITH the center they were made
 * for (a stale key falls back to none, no effect, no extra render), like the movements'
 * visible window.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Archive, ArchiveRestore, Link2, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { useActiveAccount } from '@/contexts/ActiveAccountContext';
import { queryKeys } from '@/lib/query/queryKeys';
import type { CostCenter } from '@/types/costCenters';
import type { Expense } from '@/types/expenses';
import { assignExpensesToCostCenter, getExpensesForCostCenter } from '@/lib/services/costCenterService';
import { buildUnlinkPlan, seriesKeyOf, seriesRowsOf, type LinkPlan } from '@/lib/utils/costCenterLinking';
import { describeWriteError } from '@/lib/utils/dialogNarrative';
import { buildCategoryComposition, buildSubCategoryComposition } from '@/lib/utils/costCenterUtils';
import { buildCenterMonthStack, summarizeCenter } from '@/lib/utils/costCenterSummary';
import {
  CATEGORIE_FOOTER,
  SOTTOCATEGORIE_FOOTER,
  buildCostCenterVerdict,
  describeAverageKpi,
  describeCategorie,
  describeCenterTrailingCaption,
  describeCiclo,
  describeCicloAside,
  describeCicloFooter,
  describeCosto,
  describeCostoAside,
  describeCostoFooter,
  describeMonthKpi,
  describeMovimenti,
  describeMovimentiAside,
  describeLinkOutcome,
  describeLinkUndone,
  describeUnlinkOutcome,
  describeSottocategorie,
  describeSottocategorieAside,
  describeYearKpi,
} from '@/lib/utils/costCenterNarrative';
import { resolveCostCenterColor } from '@/lib/utils/costCenterColors';
import { isItalyDayAfter, toDate } from '@/lib/utils/dateHelpers';
import { useChartColors } from '@/lib/hooks/useChartColors';
import { cn } from '@/lib/utils';
import { useArmedDelete } from '@/lib/hooks/useArmedDelete';
import { Button } from '@/components/ui/button';
import { PageVerdict } from '@/components/ui/page-verdict';
import { TILE_CELL_CLASS } from '@/components/ui/tile';
import { TileGridSkeleton } from '@/components/ui/tile-grid-skeleton';
import type { TileSkeletonCell } from '@/lib/utils/tileGridSkeleton';
import { ErrorNotice } from '@/components/ui/error-notice';
import { describeReadFailure } from '@/lib/utils/statesNarrative';
import { CostoTile } from './cost-centers/tiles/CostoTile';
import { CategorieTile } from './cost-centers/tiles/CategorieTile';
import { CicloTile } from './cost-centers/tiles/CicloTile';
import { SottocategorieTile } from './cost-centers/tiles/SottocategorieTile';
import { MovimentiTile, MOVEMENTS_PAGE_SIZE } from './cost-centers/tiles/MovimentiTile';
import { LinkExpensesDialog } from './cost-centers/LinkExpensesDialog';
import { UnlinkSeriesDialog, type UnlinkSeriesRequest } from './cost-centers/UnlinkSeriesDialog';
import { ExpenseDialog } from '@/components/expenses/ExpenseDialog';

/** Stable identity for the empty case: a `= []` default would defeat every memo below. */
const EMPTY_EXPENSES: Expense[] = [];
const EMPTY_KEYS: ReadonlySet<string> = new Set();
const TRAILING_MONTHS = 12;

/** The detail's own grid, so the loading state has the proportions of what replaces it. */
const SKELETON_CELLS: TileSkeletonCell[] = [
  { span: 5, rows: 2, lines: 8 },
  { span: 4, lines: 5 },
  { span: 3, lines: 4 },
  { span: 7, lines: 6 },
  { span: 12, lines: 6 },
];

interface CostCenterDetailProps {
  costCenter: CostCenter;
  /** Rows linked to this center, income included — the delete cascade's count. */
  linkedExpenseCount: number;
  /** The list's already-loaded spending rows, seeding the query so the view paints at once. */
  initialExpenses?: Expense[];
  onBack: () => void;
  onEdit: (costCenter: CostCenter) => void;
  onDelete: (costCenter: CostCenter) => void;
  onArchiveToggle: (costCenter: CostCenter) => void;
  isDemo?: boolean;
}

export function CostCenterDetail({
  costCenter,
  linkedExpenseCount,
  initialExpenses,
  onBack,
  onEdit,
  onDelete,
  onArchiveToggle,
  isDemo = false,
}: CostCenterDetailProps) {
  const { user } = useAuth();
  const { ownerId } = useActiveAccount();
  const chartColors = useChartColors();
  const queryClient = useQueryClient();

  // Shares the ['cost-centers', userId] prefix invalidated by ExpenseDialog, so the detail
  // stays in sync with expense mutations elsewhere. placeholderData, NOT initialData: the
  // global staleTime would turn a seeded query into one that never fetches.
  const { data, isLoading: loading, isError } = useQuery({
    queryKey: queryKeys.costCenters.expenses(ownerId ?? '', costCenter.id),
    enabled: !!user && !!ownerId,
    queryFn: async () => {
      const rows = await getExpensesForCostCenter(ownerId!, costCenter.id);
      return rows.filter((e) => e.amount < 0);
    },
    placeholderData: initialExpenses,
  });
  const allExpenses = data ?? EMPTY_EXPENSES;

  // Evaluated once per mount — the figures read the day the view was opened.
  const now = useMemo(() => new Date(), []);

  // --- Landing: the top of the page and the focus on the way back (see the header) ---
  const backLinkRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    document.querySelector('main')?.scrollTo({ top: 0 });
    backLinkRef.current?.focus({ preventScroll: true });
  }, [costCenter.id]);

  // --- Two-click delete, the app's one mechanism (`useArmedDelete`: no timer, Escape / a
  // pointer elsewhere / blur disarm, disarm BEFORE delegating). Until 2026-09-18 this view
  // kept its own copy of it. Arm and disarm are both sentences for the live region, because
  // emptying one announces nothing; «disarmed» is only said once something was armed. ---
  const deleteButtonRef = useRef<HTMLButtonElement | null>(null);
  const deletion = useArmedDelete(deleteButtonRef, () => onDelete(costCenter));
  const [wasArmed, setWasArmed] = useState(false);
  if (deletion.armed && !wasArmed) setWasArmed(true);
  const deleteAnnouncement = deletion.armed
    ? linkedExpenseCount > 0
      ? `Eliminazione armata. Premi di nuovo per eliminare "${costCenter.name}" e scollegare ${linkedExpenseCount} spese.`
      : `Eliminazione armata. Premi di nuovo per eliminare "${costCenter.name}".`
    : wasArmed
      ? 'Eliminazione annullata.'
      : '';

  // --- Linking, unlinking, opening an expense ---
  const [linkOpen, setLinkOpen] = useState(false);
  const [unlinkSeries, setUnlinkSeries] = useState<UnlinkSeriesRequest | null>(null);
  const [unlinking, setUnlinking] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const linkButtonRef = useRef<HTMLButtonElement | null>(null);

  // A link changes which rows belong to which center — every center's figures — and the
  // `costCenterName` Tracciamento prints on the row; no amount moves, so nothing else is stale.
  const refreshAfterLinkChange = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.costCenters.all(ownerId ?? '') }),
      queryClient.invalidateQueries({ queryKey: queryKeys.expenses.all(ownerId ?? '') }),
    ]);

  /** Writes a plan and offers its undo in the outcome toast: «Annulla» is the plan's other side, not a guess. */
  const applyPlan = async (plan: LinkPlan, outcome: string) => {
    try {
      await assignExpensesToCostCenter(plan.writes);
    } finally {
      // Also on failure: past one batch a run can stop half-way, and the lists must show what IS.
      await refreshAfterLinkChange();
    }
    toast.success(outcome, {
      action: {
        label: 'Annulla',
        onClick: async () => {
          try {
            await assignExpensesToCostCenter(plan.undo);
            toast.success(describeLinkUndone(plan.undo.length));
          } catch (error) {
            console.error('Error undoing a cost center link change:', error);
            toast.error(`L'annullamento non è riuscito. ${describeWriteError(error)}`);
          } finally {
            await refreshAfterLinkChange();
          }
        },
      },
    });
  };

  const handleLink = (plan: LinkPlan) => applyPlan(plan, describeLinkOutcome(plan.writes.length, costCenter.name));

  const handleUnlink = async (rows: Expense[]) => {
    setUnlinking(true);
    try {
      await applyPlan(buildUnlinkPlan(rows), describeUnlinkOutcome(rows.length, costCenter.name));
      setUnlinkSeries(null);
    } catch (error) {
      console.error('Error unlinking expenses from cost center:', error);
      toast.error(`${rows.length === 1 ? 'La spesa non è stata scollegata' : 'Le spese non sono state scollegate'}. ${describeWriteError(error)}`);
    } finally {
      setUnlinking(false);
    }
  };

  const askUnlinkSeries = (expense: Expense) => {
    const series = seriesKeyOf(expense);
    if (series) setUnlinkSeries({ expense, kind: series.kind, seriesRows: seriesRowsOf(expense, allExpenses) });
  };

  // --- Session-only lenses, stored with the center they belong to ---
  const [exclusion, setExclusion] = useState<{ id: string; keys: ReadonlySet<string> } | null>(null);
  const excludedKeys = exclusion?.id === costCenter.id ? exclusion.keys : EMPTY_KEYS;
  const [listWindow, setListWindow] = useState<{ id: string; count: number } | null>(null);
  const visibleCount = listWindow?.id === costCenter.id ? listWindow.count : MOVEMENTS_PAGE_SIZE;

  const toggleSubKey = (key: string) => {
    const next = new Set(excludedKeys);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setExclusion({ id: costCenter.id, keys: next });
  };

  // --- Every number, from the pure layer ---
  const summary = useMemo(() => summarizeCenter(costCenter, allExpenses, now), [costCenter, allExpenses, now]);
  const stack = useMemo(() => buildCenterMonthStack([{ summary, share: 100, rank: 100 }], now, TRAILING_MONTHS), [summary, now]);
  const booked = useMemo(() => allExpenses.filter((e) => !isItalyDayAfter(toDate(e.date), now)), [allExpenses, now]);
  const composition = useMemo(() => buildCategoryComposition(booked), [booked]);
  const hasCategorySplit = composition.length > 1;
  const subComposition = useMemo(() => buildSubCategoryComposition(booked), [booked]);
  const netSubTotal = useMemo(
    () => subComposition.filter((s) => !excludedKeys.has(s.key)).reduce((sum, s) => sum + s.total, 0),
    [subComposition, excludedKeys],
  );
  const sortedExpenses = useMemo(() => [...allExpenses].sort((a, b) => toDate(b.date).getTime() - toDate(a.date).getTime()), [allExpenses]);
  const verdict = useMemo(() => buildCostCenterVerdict(summary, now), [summary, now]);

  const accentColor = resolveCostCenterColor(costCenter.color, costCenter.id, chartColors);
  const isArchived = !!costCenter.archivedAt;

  const deleteLabel = isDemo
    ? 'Elimina — non disponibile in modalità demo'
    : deletion.armed
      ? linkedExpenseCount > 0
        ? `Conferma eliminazione — ${linkedExpenseCount} spese perderanno il collegamento`
        : 'Conferma eliminazione del centro di costo'
      : 'Elimina centro di costo';

  return (
    <div className="space-y-4 max-desktop:portrait:pb-20">
      {/* ── Back link, verdict and the actions beside it ─────────────────────────── */}
      <div className="flex flex-col gap-1 pt-1">
        <button
          ref={backLinkRef}
          type="button"
          onClick={onBack}
          className="-ml-1 inline-flex min-h-[44px] w-fit items-center gap-1.5 rounded-md px-1 text-[13px] text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          Centri di costo
        </button>
        <div className="flex flex-col gap-4 desktop:flex-row desktop:items-start desktop:justify-between desktop:gap-6">
          <PageVerdict verdict={verdict} ariaLabel={`Verdetto su ${costCenter.name}`} />
          {/* The actions and, under them, what the armed one does: the consequence sits where
              the eye already is (it used to open at the far left of the row, 11px muted) and
              its line is reserved from `desktop:`, so arming no longer pushes the grid down. */}
          <div className="flex shrink-0 flex-col gap-1.5 desktop:items-end">
            <div className="flex flex-wrap gap-2 [&>button]:h-11 [&>button]:flex-1 desktop:flex-nowrap desktop:[&>button]:h-8 desktop:[&>button]:flex-none">
              {/* On a phone it takes a row of its own above the three: four labels do not fit 390px. */}
              <Button
                ref={linkButtonRef}
                variant="outline"
                size="sm"
                className="basis-full desktop:basis-auto"
                onClick={() => setLinkOpen(true)}
                disabled={isDemo || isArchived}
                aria-label={isDemo ? 'Collega spese — non disponibile in modalità demo' : isArchived ? 'Collega spese — il centro è archiviato' : 'Collega spese'}
              >
                <Link2 className="h-3.5 w-3.5" />
                Collega spese…
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onEdit(costCenter)}
                disabled={isDemo}
                aria-label={isDemo ? 'Modifica — non disponibile in modalità demo' : 'Modifica centro di costo'}
              >
                <Pencil className="h-3.5 w-3.5" />
                Modifica
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onArchiveToggle(costCenter)}
                disabled={isDemo}
                aria-label={isDemo ? 'Archivia — non disponibile in modalità demo' : isArchived ? 'Ripristina il centro di costo' : 'Archivia il centro di costo'}
              >
                {isArchived ? <ArchiveRestore className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />}
                {isArchived ? 'Ripristina' : 'Archivia'}
              </Button>
              <Button
                ref={deleteButtonRef}
                variant="outline"
                size="sm"
                className={cn(deletion.armed && 'border-destructive text-destructive hover:text-destructive')}
                disabled={isDemo}
                aria-pressed={deletion.armed}
                aria-label={deleteLabel}
                onClick={deletion.onClick}
                onBlur={deletion.onBlur}
              >
                <Trash2 className="h-3.5 w-3.5" />
                {deletion.armed ? 'Conferma' : 'Elimina'}
              </Button>
            </div>
            <p className="text-[12px] leading-4 text-destructive desktop:min-h-4 desktop:text-right">
              {deletion.armed &&
                (linkedExpenseCount > 0 ? (
                  <>
                    <span className="font-mono tabular-nums">{linkedExpenseCount}</span>{' '}
                    {linkedExpenseCount === 1 ? 'spesa resta in Cashflow e perde solo il collegamento.' : 'spese restano in Cashflow e perdono solo il collegamento.'}
                  </>
                ) : (
                  'Nessuna spesa è collegata: si elimina solo il centro.'
                ))}
            </p>
          </div>
        </div>
        <p className="sr-only" role="status" aria-live="polite">
          {deleteAnnouncement}
        </p>
      </div>

      {loading ? (
        <TileGridSkeleton verdict={false} cells={SKELETON_CELLS} />
      ) : isError ? (
        <ErrorNotice
          className="max-w-[920px]"
          notice={describeReadFailure({
            consequence: 'Le spese collegate a questo centro non sono state lette: il costo del progetto non è calcolabile.',
            untouched: 'Il centro e le spese registrate non sono stati toccati.',
          })}
        />
      ) : (
        /* ── Tile grid ─────────────────────────────────────────────────────────── */
        <div className="grid grid-cols-1 gap-3 tablet:grid-cols-2 desktop:grid-cols-12">
          <div className={cn(TILE_CELL_CLASS, 'order-1 tablet:col-span-2 desktop:order-none desktop:col-span-5 desktop:row-span-2')}>
            <CostoTile
              summary={summary}
              stack={stack}
              stackCaption={describeCenterTrailingCaption(stack, now)}
              aside={describeCostoAside(summary)}
              reading={describeCosto(summary, now)}
              footer={describeCostoFooter(summary)}
              kpis={{ month: describeMonthKpi(summary, now), year: describeYearKpi(summary), average: describeAverageKpi(summary) }}
              palette={chartColors}
              now={now}
            />
          </div>
          {/* One category at 100% is the hero said again: the tile is not rendered and Ciclo
              di vita takes its columns (a tile with nothing to say is not a tile). */}
          {hasCategorySplit && (
            <div className={cn(TILE_CELL_CLASS, 'order-2 desktop:order-none desktop:col-span-4')}>
              <CategorieTile slices={composition} reading={describeCategorie(composition)} footer={CATEGORIE_FOOTER} color={accentColor} />
            </div>
          )}
          <div className={cn(TILE_CELL_CLASS, 'order-3 desktop:order-none', hasCategorySplit ? 'desktop:col-span-3' : 'tablet:col-span-2 desktop:col-span-7')}>
            <CicloTile summary={summary} aside={describeCicloAside(summary)} reading={describeCiclo(summary)} footer={describeCicloFooter(summary)} />
          </div>
          <div className={cn(TILE_CELL_CLASS, 'order-4 tablet:col-span-2 desktop:order-none desktop:col-span-7')}>
            <SottocategorieTile
              slices={subComposition}
              excludedKeys={excludedKeys}
              netTotal={netSubTotal}
              aside={describeSottocategorieAside(excludedKeys.size)}
              reading={describeSottocategorie(subComposition, excludedKeys, netSubTotal)}
              footer={SOTTOCATEGORIE_FOOTER}
              color={accentColor}
              onToggle={toggleSubKey}
              onReset={() => setExclusion({ id: costCenter.id, keys: new Set() })}
            />
          </div>
          <div className={cn(TILE_CELL_CLASS, 'order-5 tablet:col-span-2 desktop:order-none desktop:col-span-12')}>
            <MovimentiTile
              expenses={sortedExpenses}
              now={now}
              aside={describeMovimentiAside(summary)}
              reading={describeMovimenti(summary)}
              visibleCount={visibleCount}
              onShowMore={() => setListWindow({ id: costCenter.id, count: visibleCount + MOVEMENTS_PAGE_SIZE })}
              onOpen={setEditingExpense}
              onUnlink={(expense) => handleUnlink([expense])}
              onUnlinkSeries={askUnlinkSeries}
              disabled={isDemo}
            />
          </div>
        </div>
      )}

      <LinkExpensesDialog open={linkOpen} onClose={() => setLinkOpen(false)} costCenter={costCenter} onLink={handleLink} returnFocusTo={linkButtonRef} />
      <UnlinkSeriesDialog request={unlinkSeries} centerName={costCenter.name} onClose={() => setUnlinkSeries(null)} onUnlink={handleUnlink} busy={unlinking} />
      {/* The form Tracciamento uses, with its own save, reconciliation and invalidations
          (it already refreshes the centers); unlinking from inside it works too. */}
      <ExpenseDialog open={editingExpense !== null} expense={editingExpense} onClose={() => setEditingExpense(null)} onSuccess={refreshAfterLinkChange} />
    </div>
  );
}
