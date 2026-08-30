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
 * name it (the ceiling's own month or year with today's mark, «Fine mese», «Fine anno»,
 * «Ultimi 12 mesi»). Every number is born in costCenterSummary.ts, every sentence in
 * costCenterNarrative.ts; this component fetches, memoizes and renders.
 *
 * The subcategory exclusions are session-only and stored WITH the center they were made
 * for (a stale key falls back to none, no effect, no extra render), like the movements'
 * visible window.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Archive, ArchiveRestore, Pencil, Trash2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useActiveAccount } from '@/contexts/ActiveAccountContext';
import { queryKeys } from '@/lib/query/queryKeys';
import type { CostCenter } from '@/types/costCenters';
import type { Expense } from '@/types/expenses';
import { getExpensesForCostCenter } from '@/lib/services/costCenterService';
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
  describeMonthEndKpi,
  describeMovimenti,
  describeMovimentiAside,
  describeSottocategorie,
  describeSottocategorieAside,
  describeYearEndKpi,
} from '@/lib/utils/costCenterNarrative';
import { resolveCostCenterColor } from '@/lib/utils/costCenterColors';
import { isItalyDayAfter, toDate } from '@/lib/utils/dateHelpers';
import { useChartColors } from '@/lib/hooks/useChartColors';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { PageVerdict } from '@/components/ui/page-verdict';
import { TILE_CELL_CLASS } from '@/components/ui/tile';
import { TileGridSkeleton } from '@/components/ui/tile-grid-skeleton';
import type { TileSkeletonCell } from '@/lib/utils/tileGridSkeleton';
import { CostCenterErrorNotice } from './CostCenterErrorNotice';
import { CostoTile } from './cost-centers/tiles/CostoTile';
import { CategorieTile } from './cost-centers/tiles/CategorieTile';
import { CicloTile } from './cost-centers/tiles/CicloTile';
import { SottocategorieTile } from './cost-centers/tiles/SottocategorieTile';
import { MovimentiTile, MOVEMENTS_PAGE_SIZE } from './cost-centers/tiles/MovimentiTile';

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

  // --- Two-click delete: the arm is announced, and so is the disarm (emptying a live region
  // announces nothing). Escape or a pointer outside the button releases it; not a timer (a
  // WCAG 2.2.1 time limit) and not onBlur alone (Safari never focuses a tapped button). ---
  const [deleteArmed, setDeleteArmed] = useState(false);
  const [deleteAnnouncement, setDeleteAnnouncement] = useState('');
  const deleteButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!deleteArmed) return;
    const disarm = () => {
      setDeleteArmed(false);
      setDeleteAnnouncement('Eliminazione annullata.');
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') disarm();
    };
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (target && deleteButtonRef.current?.contains(target)) return;
      disarm();
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [deleteArmed]);

  const handleDeleteClick = () => {
    if (deleteArmed) {
      // Disarm BEFORE delegating: on failure the parent only raises a toast and the view stays
      // mounted, and an armed button would delete on the next single click.
      setDeleteArmed(false);
      setDeleteAnnouncement('');
      onDelete(costCenter);
      return;
    }
    setDeleteArmed(true);
    setDeleteAnnouncement(
      linkedExpenseCount > 0
        ? `Eliminazione armata. Premi di nuovo per eliminare "${costCenter.name}" e scollegare ${linkedExpenseCount} spese.`
        : `Eliminazione armata. Premi di nuovo per eliminare "${costCenter.name}".`,
    );
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
    : deleteArmed
      ? linkedExpenseCount > 0
        ? `Conferma eliminazione — ${linkedExpenseCount} spese perderanno il collegamento`
        : 'Conferma eliminazione del centro di costo'
      : 'Elimina centro di costo';

  return (
    <div className="space-y-4 max-desktop:portrait:pb-20">
      {/* ── Back link, verdict and the actions beside it ─────────────────────────── */}
      <div className="flex flex-col gap-1 pt-1">
        <button
          type="button"
          onClick={onBack}
          className="-ml-1 inline-flex min-h-[44px] w-fit items-center gap-1.5 rounded-md px-1 text-[13px] text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          Centri di costo
        </button>
        <div className="flex flex-col gap-4 desktop:flex-row desktop:items-start desktop:justify-between desktop:gap-6">
          <PageVerdict verdict={verdict} ariaLabel={`Verdetto su ${costCenter.name}`} />
          <div className="flex shrink-0 gap-2 [&>button]:h-11 [&>button]:flex-1 desktop:[&>button]:h-8 desktop:[&>button]:flex-none">
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
              variant={deleteArmed ? 'destructive' : 'outline'}
              size="sm"
              disabled={isDemo}
              aria-label={deleteLabel}
              onClick={handleDeleteClick}
              onBlur={() => {
                if (!deleteArmed) return;
                setDeleteArmed(false);
                setDeleteAnnouncement('Eliminazione annullata.');
              }}
            >
              <Trash2 className="h-3.5 w-3.5" />
              {deleteArmed ? 'Conferma' : 'Elimina'}
            </Button>
          </div>
        </div>
        {/* The arm reveals the consequence — what the click does is the user's real doubt. */}
        {deleteArmed && linkedExpenseCount > 0 && (
          <p className="text-[11px] text-muted-foreground">
            <span className="font-mono tabular-nums">{linkedExpenseCount}</span>{' '}
            {linkedExpenseCount === 1 ? 'spesa collegata non viene cancellata: perde il collegamento e resta' : 'spese collegate non vengono cancellate: perdono il collegamento e restano'} in
            Cashflow.
          </p>
        )}
        <p className="sr-only" role="status" aria-live="polite">
          {deleteAnnouncement}
        </p>
      </div>

      {loading ? (
        <TileGridSkeleton verdict={false} cells={SKELETON_CELLS} />
      ) : isError ? (
        <CostCenterErrorNotice message="Non è stato possibile caricare le spese di questo centro." />
      ) : (
        /* ── Tile grid ─────────────────────────────────────────────────────────── */
        <div className="grid grid-cols-1 gap-3 tablet:grid-cols-2 desktop:grid-cols-12">
          <div className={cn(TILE_CELL_CLASS, 'order-1 tablet:col-span-2 desktop:order-none desktop:col-span-5 desktop:row-span-2')}>
            <CostoTile
              summary={summary}
              stack={stack}
              stackCaption={describeCenterTrailingCaption(stack, now)}
              aside={describeCostoAside(summary)}
              reading={describeCosto(summary)}
              footer={describeCostoFooter(summary)}
              kpis={{ monthEnd: describeMonthEndKpi(summary, now), yearEnd: describeYearEndKpi(summary), average: describeAverageKpi(summary) }}
              palette={chartColors}
              now={now}
            />
          </div>
          <div className={cn(TILE_CELL_CLASS, 'order-2 desktop:order-none desktop:col-span-4')}>
            <CategorieTile slices={composition} reading={describeCategorie(composition)} footer={CATEGORIE_FOOTER} color={accentColor} />
          </div>
          <div className={cn(TILE_CELL_CLASS, 'order-3 desktop:order-none desktop:col-span-3')}>
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
            />
          </div>
        </div>
      )}
    </div>
  );
}
