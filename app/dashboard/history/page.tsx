'use client';

/**
 * STORICO — a verdict over tiles (2026-08-25)
 *
 * The page answers «come sono arrivato qui?» before it shows a number: a rule-generated verdict
 * (lib/utils/storicoNarrative.ts) on the growth since the first snapshot — WEALTH growth,
 * contributions included, never Rendimenti's investment return — over a 12-column grid of
 * tiles that each answer one question with a reading line above their figures. The page has NO
 * period axis: its question is the whole history, and the one tile on a window (Driver, from
 * the cashflow floor) names it. Everything deeper lives below the grid behind «Dettaglio».
 *
 *   Desktop (12 col): Evoluzione(8, 2 rows) | Raddoppi(4, 2 rows)
 *                     Composizione(8)       | Driver(4)
 *                     Valore per strumento(12)
 *   Below desktop:    ONE sequence, the DOM above (The First-Screen Rule; since 2026-10-14 —
 *                     the `order-*` are gone, the two column wrappers are `contents`): title → the
 *                     first sentence → the last twelve months and the featured year's savings as a
 *                     strip → «Il perché» → Evoluzione, open, its chips lifted and its curve at 120px
 *                     → «Il resto della pagina» → Composizione, Raddoppi, Driver, Valore per strumento
 *                     as closed rows (`useMobileSections`; doc/guide/storico.md § Composizione mobile).
 *
 * DATA: snapshots, assets, settings, expenses, the ledger and the pension contributions come
 * from React Query keys (2026-09-29: one read per session, no `Promise.all`) — five of them the
 * ones every page shares, and the expenses WHOLE (`useExpenses`), by declared need: the Driver
 * splits the growth of every year recorded, so this page has no window to read. It shares that
 * list with Analisi and Centri di Costo; since 2026-09-30 Cashflow's other tabs and FIRE read a
 * window of their own instead (lib/utils/expenseWindows.ts); every
 * figure a tile shows is derived from them in a pure, tested util (storicoSummary.ts, the
 * chartService preparers, snapshotAssetBreakdown.ts, historyComposition.ts) — never in a
 * component. A snapshot is a frozen photograph: nothing here recomputes a stored value.
 */

import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Download, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { useActiveAccount } from '@/contexts/ActiveAccountContext';
import { useDemoMode } from '@/lib/hooks/useDemoMode';
import { queryKeys } from '@/lib/query/queryKeys';
import { useSnapshots } from '@/lib/hooks/useSnapshots';
import { useAssets } from '@/lib/hooks/useAssets';
import { useSettings } from '@/lib/hooks/useSettings';
import { useFreshness } from '@/lib/hooks/useFreshness';
import { useExpenses } from '@/lib/hooks/useExpenses';
import { useAssetTransactions } from '@/lib/hooks/useAssetTransactions';
import { usePensionContributions } from '@/lib/hooks/usePensionContributions';
import { calculateTotalEstimatedTaxes } from '@/lib/services/assetService';
import { updateSnapshotNote } from '@/lib/services/snapshotService';
import { getDefaultTargets } from '@/lib/services/assetAllocationService';
import { composeReadState } from '@/lib/utils/readState';
import {
  prepareNetWorthHistoryData,
  prepareAssetClassHistoryData,
  prepareYoYVariationData,
  prepareDoublingTimeData,
  prepareMonthlyLaborMetricsData,
} from '@/lib/services/chartService';
import type { Asset, MonthlySnapshot, DoublingMode } from '@/types/assets';
import type { Expense } from '@/types/expenses';
import type { AssetTransaction } from '@/types/assetTransactions';
import type { PensionContribution } from '@/types/pension';
import { getItalyMonthYear, isItalyDayAfter } from '@/lib/utils/dateHelpers';
import { buildMonthlyGrowthDrivers, buildYearlyGrowthDrivers, sumGrowthDrivers, type GrowthDriverContext } from '@/lib/utils/growthDrivers';
import { resolvePensionReturnStart } from '@/lib/utils/pensionReturn';
import {
  alignLaborChartMarket,
  laborWindowsOf,
  projectNextDoubling,
  resolveFeaturedDriverYear,
  selectDriverYears,
  selectStoricoStrip,
  selectTrailingMonths,
  sortSnapshots,
  STORICO_EVOLUZIONE_ID,
  STORICO_SECTION_IDS,
  summarizeAllTimeHigh,
  summarizeGrowth,
  summarizeGrowthPace,
  summarizeLaborMetrics,
  summarizeMonthlyMoves,
  withMonthDeltas,
  type LaborMetrics,
} from '@/lib/utils/storicoSummary';
import {
  buildDriverLedger,
  buildStoricoVerdict,
  describeRunningWindowShort,
  STORICO_CLOSED_ASIDES,
  describeDoublings,
  describeDrivers,
  describeEvolution,
  describeEvolutionAside,
  describeMonthBreakdown,
  describeStoricoClosedAnswers,
  describeStoricoHeader,
} from '@/lib/utils/storicoNarrative';
import { resolveCompositionSeries } from '@/lib/utils/historyComposition';
import { buildMonthAssetBreakdown, buildSelectedAssetTrend, getAvailableSnapshotMonths, summarizeSelection } from '@/lib/utils/snapshotAssetBreakdown';
import { getAssetDisplayTicker } from '@/lib/utils/assetDisplay';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { PageContainer } from '@/components/layout/PageContainer';
import { PageHeader } from '@/components/layout/PageHeader';
import { PageVerdict } from '@/components/ui/page-verdict';
import { TILE_CELL_CLASS } from '@/components/ui/tile';
import { TileGridSkeleton } from '@/components/ui/tile-grid-skeleton';
import { ErrorNotice } from '@/components/ui/error-notice';
import { describeReadFailure } from '@/lib/utils/statesNarrative';
import type { TileSkeletonCell } from '@/lib/utils/tileGridSkeleton';
import { ExportPDFButton } from '@/components/dashboard/ExportPDFButton';
import { CreateManualSnapshotModal } from '@/components/CreateManualSnapshotModal';
import { SnapshotSearchDialog } from '@/components/history/SnapshotSearchDialog';
import { EvoluzioneTile, isEvoluzioneLiftedBlock, type EvoluzioneLiftedBlock } from '@/components/history/tiles/EvoluzioneTile';
import { useMobileSections, type SectionSpec } from '@/lib/hooks/useMobileSections';
import { useTabletComposition, useTabletStage } from '@/lib/hooks/useTabletComposition';
import {
  COMPACT_GRID_CLASS,
  COMPACT_GRID_WRAPPER_CLASS,
  INDEX_CLASS,
  INDEX_GROUP_CLASS,
  LEAD_CELL_CLASS,
  REST_CELL_CLASS,
  STAGE_CLASS,
  STAGE_WRAPPER_CLASS,
  VERDICT_CELL_CLASS,
} from '@/lib/utils/tabletComposition';
import { VERDICT_REST_SECTION } from '@/lib/utils/mobileSections';
import { splitVerdict } from '@/lib/utils/narrative';
import { liftedBlocks } from '@/lib/utils/verdictStrip';
import { TILE_ROW_CELL_CLASS } from '@/components/ui/tile';
import { VerdictStrip } from '@/components/ui/verdict-strip';
import { PageRest } from '@/components/ui/page-rest';
import { RowAnswers } from '@/components/ui/row-answers';
import { RaddoppiTile } from '@/components/history/tiles/RaddoppiTile';
import { ComposizioneTile } from '@/components/history/tiles/ComposizioneTile';
import { DriverTile } from '@/components/history/tiles/DriverTile';
import { ValoreStrumentoTile } from '@/components/history/tiles/ValoreStrumentoTile';
import { StoricoDettaglio } from '@/components/history/StoricoDettaglio';

/** The grid's geometry, for the skeleton: the same spans as the tiles below. */
const SKELETON_CELLS: TileSkeletonCell[] = [
  { span: 8, lines: 12 },
  { span: 4, lines: 7 },
  { span: 8, lines: 9 },
  { span: 4, lines: 12 },
  { span: 12, lines: 6 },
];

/** How many of the last months the Driver tile draws. */
const DRIVER_TRAILING_MONTHS = 12;
/** The cashflow floor when the settings carry none. */
const DEFAULT_CASHFLOW_START_YEAR = 2025;
const EMPTY_SNAPSHOTS: MonthlySnapshot[] = [];
const EMPTY_ASSETS: Asset[] = [];
const EMPTY_EXPENSES: Expense[] = [];
const EMPTY_TRANSACTIONS: AssetTransaction[] = [];
const EMPTY_CONTRIBUTIONS: PensionContribution[] = [];

/**
 * Every row of the phone composition, in the DOM's order (The Closed-Row Rule;
 * 2026-10-14): every tile but Evoluzione, which is THE tile and never closes (The First-Screen Rule). The
 * page composes its six reads into ONE state (`composeReadState`), so no row is ever `failed`.
 */
const STORICO_SECTIONS: readonly SectionSpec[] = [
  { id: STORICO_SECTION_IDS.composizione, eyebrow: 'Composizione' },
  { id: STORICO_SECTION_IDS.raddoppi, eyebrow: 'Raddoppi' },
  { id: STORICO_SECTION_IDS.driver, eyebrow: 'Driver della crescita' },
  { id: STORICO_SECTION_IDS.valore, eyebrow: 'Valore per strumento' },
];
/** The four rows are always on the page: their DOM order is the tablet's (lib/utils/tabletComposition.ts). */
const STORICO_ORDER = STORICO_SECTIONS.map((section) => section.id);

/** What the «Ultimi 12 mesi» cell announces it opens: neither the verdict's rest nor THE tile is a row of the controller. */
const STRIP_EYEBROW_REST = 'il perché';
const STRIP_EYEBROW_EVOLUZIONE = "l'andamento";

export default function HistoryPage() {
  const { user } = useAuth();
  const { ownerId } = useActiveAccount();
  const isDemo = useDemoMode();
  const queryClient = useQueryClient();

  // ─── The reads: six keys (2026-09-29), the expenses the whole collection (see the header) ─────
  // The page gates on EVERY query it reads (doc/guide/stati.md): `loading` while any is still
  // reading, `failed` when any read did not happen — a failed read is not an empty set.
  const snapshotsQuery = useSnapshots(ownerId);
  const assetsQuery = useAssets(ownerId);
  const settingsQuery = useSettings(ownerId);
  const expensesQuery = useExpenses(ownerId);
  // The ledger and the pension contributions: the Driver measures the market from them.
  const transactionsQuery = useAssetTransactions(ownerId);
  const contributionsQuery = usePensionContributions(ownerId);
  // The header's «Aggiornato alle…» while figures restored from the persisted cache are being
  // reread: the same six keys the read state composes.
  const freshness = useFreshness([snapshotsQuery, assetsQuery, settingsQuery, expensesQuery, transactionsQuery, contributionsQuery]);
  const { loading, loadFailed } = useMemo(
    () => composeReadState([snapshotsQuery, assetsQuery, settingsQuery, expensesQuery, transactionsQuery, contributionsQuery]),
    [snapshotsQuery, assetsQuery, settingsQuery, expensesQuery, transactionsQuery, contributionsQuery],
  );
  const snapshots = snapshotsQuery.data ?? EMPTY_SNAPSHOTS;
  const assets = assetsQuery.data ?? EMPTY_ASSETS;
  const portfolioSettings = settingsQuery.data ?? null;
  const expenses = expensesQuery.data ?? EMPTY_EXPENSES;
  const transactions = transactionsQuery.data ?? EMPTY_TRANSACTIONS;
  const pensionContributions = contributionsQuery.data ?? EMPTY_CONTRIBUTIONS;
  // What `getTargets` used to read in a second round trip: the same document's `targets`.
  const targets = portfolioSettings?.targets ?? null;

  /** «Riprova» and a new manual snapshot: invalidate the keys, never a bare refetch (AGENTS.md § Caching). */
  const reloadData = () => {
    if (!ownerId) return;
    for (const key of [
      queryKeys.snapshots.all(ownerId),
      queryKeys.assets.all(ownerId),
      queryKeys.settings.all(ownerId),
      queryKeys.expenses.all(ownerId),
      queryKeys.assetTransactions.all(ownerId),
      queryKeys.pensionContributions.all(ownerId),
    ]) {
      queryClient.invalidateQueries({ queryKey: key });
    }
  };
  const [doublingMode, setDoublingMode] = useState<DoublingMode>('geometric');
  const [showManualSnapshotModal, setShowManualSnapshotModal] = useState(false);
  const [noteDialogOpen, setNoteDialogOpen] = useState(false);
  // Valore per strumento: the month (null = the latest with a breakdown) and the ticked instruments.
  const [selectedMonthKey, setSelectedMonthKey] = useState<string | null>(null);
  const [selectedAssetIds, setSelectedAssetIds] = useState<Set<string>>(new Set());

  /** CSV of the whole history: date, total, liquid, illiquid. */
  const handleExportCSV = () => {
    if (snapshots.length === 0) {
      toast.error('Nessun dato da esportare');
      return;
    }
    const headers = ['Data', 'Patrimonio Totale', 'Patrimonio Liquido', 'Patrimonio Illiquido'];
    const rows = sortSnapshots(snapshots).map((s) => [`${String(s.month).padStart(2, '0')}/${s.year}`, s.totalNetWorth, s.liquidNetWorth, s.illiquidNetWorth || 0]);
    const csv = [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `net-worth-history-${Date.now()}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success('Storico esportato con successo');
  };

  /** A note is saved first, then patched into the cached snapshot — no refetch. Never in demo: the snapshots are shared. */
  const handleSaveNote = async (year: number, month: number, note: string) => {
    if (!user || !ownerId || isDemo) return;
    await updateSnapshotNote(ownerId, year, month, note);
    queryClient.setQueryData<MonthlySnapshot[]>(queryKeys.snapshots.all(ownerId), (previous) =>
      previous?.map((s) => (s.year === year && s.month === month ? { ...s, note: note.trim() || undefined } : s)),
    );
  };

  // ─── The numbers (pure layer) ───────────────────────────────────────────────
  const ordered = useMemo(() => sortSnapshots(snapshots), [snapshots]);
  const growth = useMemo(() => summarizeGrowth(ordered), [ordered]);
  const moves = useMemo(() => summarizeMonthlyMoves(ordered), [ordered]);
  const ath = useMemo(() => summarizeAllTimeHigh(ordered), [ordered]);
  const pace = useMemo(() => summarizeGrowthPace(ordered), [ordered]);

  // The verdict's «ultimo raddoppio» is always the geometric one; the tile follows its toggle.
  const geometricSummary = useMemo(() => prepareDoublingTimeData(ordered, 'geometric'), [ordered]);
  const doublingSummary = useMemo(() => (doublingMode === 'geometric' ? geometricSummary : prepareDoublingTimeData(ordered, 'threshold')), [ordered, doublingMode, geometricSummary]);
  const lastDoubling = geometricSummary.milestones.at(-1) ?? null;
  const projection = useMemo(
    () => (growth ? projectNextDoubling(doublingSummary.currentDoublingInProgress, growth.latest, pace.trailingMonthly) : null),
    [doublingSummary, growth, pace.trailingMonthly],
  );

  const verdict = useMemo(() => buildStoricoVerdict({ growth, moves, pace, lastDoubling: lastDoubling ? lastDoubling.endDate : null }), [growth, moves, pace, lastDoubling]);

  const netWorthHistory = useMemo(() => prepareNetWorthHistoryData(ordered), [ordered]);
  const evolutionPoints = useMemo(() => withMonthDeltas(netWorthHistory), [netWorthHistory]);
  const notes = useMemo(
    () =>
      ordered
        .filter((s) => s.note && s.note.trim() !== '')
        .map((s) => ({ year: s.year, month: s.month, note: s.note! }))
        .reverse(),
    [ordered],
  );

  const pensionAssets = useMemo(() => assets.filter((a) => a.type === 'pensionFund'), [assets]);
  const assetClassHistory = useMemo(() => prepareAssetClassHistoryData(ordered, pensionAssets), [ordered, pensionAssets]);

  // Driver: the yearly split from the cashflow floor, the running year featured, the last twelve
  // months — savings, the market measured per instrument, sale taxes, mortgage, pension
  // contributions and the rest (lib/utils/growthDrivers.ts). `today` is read when the data
  // changes: a row after it is in calendar, not saved.
  const startYear = portfolioSettings?.cashflowHistoryStartYear ?? DEFAULT_CASHFLOW_START_YEAR;
  const currentYear = getItalyMonthYear().year;
  const driverContext = useMemo<GrowthDriverContext>(
    () => ({
      expenses,
      transactions,
      assets,
      pension: { contributions: pensionContributions, startMonth: resolvePensionReturnStart(pensionContributions, portfolioSettings?.pensionReturnStartMonth) },
      today: new Date(),
    }),
    [expenses, transactions, assets, pensionContributions, portfolioSettings],
  );
  const driverYears = useMemo(() => selectDriverYears(buildYearlyGrowthDrivers(ordered, driverContext), startYear), [ordered, driverContext, startYear]);
  const featuredDriverYear = useMemo(() => resolveFeaturedDriverYear(driverYears, currentYear), [driverYears, currentYear]);
  const driverTotal = useMemo(() => sumGrowthDrivers(driverYears), [driverYears]);
  const monthlyDrivers = useMemo(() => buildMonthlyGrowthDrivers(ordered, driverContext).filter((row) => row.year >= startYear), [ordered, driverContext, startYear]);
  const driverMeasuredSince = useMemo(() => {
    const first = monthlyDrivers.find((row) => row.isMarketMeasured);
    return first ? { year: first.year, month: first.month } : null;
  }, [monthlyDrivers]);
  const trailingDriverMonths = useMemo(() => selectTrailingMonths(monthlyDrivers, DRIVER_TRAILING_MONTHS), [monthlyDrivers]);
  const driverYearOptions = useMemo(() => [...new Set(monthlyDrivers.map((row) => row.year))].sort((a, b) => b - a), [monthlyDrivers]);

  const yearlyVariation = useMemo(() => prepareYoYVariationData(ordered), [ordered]);

  // Lavoro e investimenti — only when the labor categories are configured; the maths is the pure
  // `summarizeLaborMetrics` over the Driver's own windows (baseline → last snapshot, one per year)
  // AND the Driver's own parts, so the two tiles never print two «mercato»; its rows stop at today
  // like the Driver's savings. The tax estimate on latent gains is the Patrimonio's
  // (Firebase-coupled, so passed in) and belongs to the cumulative recap only.
  const laborMetrics = useMemo(() => {
    const categoryIds = portfolioSettings?.laborIncomeCategoryIds ?? [];
    const livedExpenses = expenses.filter((expense) => !isItalyDayAfter(expense.date, driverContext.today));
    const all = summarizeLaborMetrics(ordered, livedExpenses, categoryIds, startYear, laborWindowsOf(driverYears), calculateTotalEstimatedTaxes(assets), sumGrowthDrivers(driverYears));
    if (!all) return null;
    const years = driverYears
      .map((row) => ({ year: Number(row.year), metrics: summarizeLaborMetrics(ordered, livedExpenses, categoryIds, startYear, laborWindowsOf([row]), 0, row) }))
      .filter((entry): entry is { year: number; metrics: LaborMetrics } => entry.metrics !== null);
    return {
      all,
      years,
      chartData: alignLaborChartMarket(prepareMonthlyLaborMetricsData(ordered, livedExpenses, categoryIds, startYear), monthlyDrivers),
      hasDividendCategory: Boolean(portfolioSettings?.dividendIncomeCategoryId),
    };
  }, [expenses, ordered, portfolioSettings, assets, startYear, driverYears, monthlyDrivers, driverContext]);

  // Valore per strumento.
  const displayTickerByAssetId = useMemo(() => {
    const map = new Map<string, string>();
    assets.forEach((asset) => map.set(asset.id, getAssetDisplayTicker(asset)));
    return map;
  }, [assets]);
  const breakdownMonths = useMemo(() => getAvailableSnapshotMonths(ordered), [ordered]);
  const activeMonthKey = useMemo(() => {
    if (selectedMonthKey && breakdownMonths.some((m) => m.key === selectedMonthKey)) return selectedMonthKey;
    return breakdownMonths[0]?.key ?? null;
  }, [selectedMonthKey, breakdownMonths]);
  const breakdown = useMemo(() => (activeMonthKey ? buildMonthAssetBreakdown(ordered, activeMonthKey) : null), [ordered, activeMonthKey]);
  const selection = useMemo(() => (breakdown ? summarizeSelection(breakdown, selectedAssetIds) : null), [breakdown, selectedAssetIds]);
  const selectionTrend = useMemo(() => buildSelectedAssetTrend(ordered, selectedAssetIds), [ordered, selectedAssetIds]);

  // What each closed row answers in the landscape index (2026-10-16): figures the page already has;
  // Composizione on the asset-class cut, the scope its closed row names («per classe»). Memoized: a
  // new map on every render would re-render every row.
  const rowAnswers = useMemo(
    () =>
      describeStoricoClosedAnswers({
        composition: resolveCompositionSeries('assetClass', { assetClassHistory, liquidityHistory: netWorthHistory }),
        doublings: { summary: doublingSummary, mode: doublingMode },
        featuredDriverYear,
        breakdown,
      }),
    [assetClassHistory, netWorthHistory, doublingSummary, doublingMode, featuredDriverYear, breakdown],
  );

  const toggleAsset = (assetId: string) => {
    setSelectedAssetIds((previous) => {
      const next = new Set(previous);
      if (next.has(assetId)) next.delete(assetId);
      else next.add(assetId);
      return next;
    });
  };
  // The master checkbox touches only this month's instruments: a selection made in another month survives.
  const toggleAllInMonth = () => {
    if (!breakdown) return;
    const ids = breakdown.rows.map((r) => r.assetId);
    const allSelected = ids.length > 0 && ids.every((id) => selectedAssetIds.has(id));
    setSelectedAssetIds((previous) => {
      const next = new Set(previous);
      ids.forEach((id) => (allSelected ? next.delete(id) : next.add(id)));
      return next;
    });
  };

  // ─── The phone composition (2026-10-14) ──────────────────────────────────────
  // Before the early returns: hooks run on every render.
  const sections = useMobileSections({ route: 'history', sections: STORICO_SECTIONS });
  // At 768 the same rows on two columns; on a tablet in landscape the index beside the verdict and
  // THE tile (lib/utils/tabletComposition.ts).
  const stageRef = useTabletStage();
  const tablet = useTabletComposition({ sections, order: STORICO_ORDER });
  const restCollapse = sections.collapse(VERDICT_REST_SECTION);
  // The strip: the last twelve months (Evoluzione's third chip, its euro lifted) and ONE cell of the
  // Driver — the featured year's savings as its ledger prints them (2026-10-10; doc/guide/storico.md
  // § Composizione mobile). With fewer than two snapshots there is nothing to measure: no strip.
  const strip =
    growth && growth.snapshotCount >= 2
      ? selectStoricoStrip({
          pace,
          featured: featuredDriverYear,
          ledger: featuredDriverYear ? buildDriverLedger(featuredDriverYear.row) : [],
          window: featuredDriverYear?.isRunning ? describeRunningWindowShort(featuredDriverYear.row) : null,
        })
      : [];
  // THE tile hides the chips the first sentence restates (growth, percentage and CAGR) and the euro
  // of the twelve months the strip prints; its percentage stays (The Lifted-Figure Rule).
  const evoluzioneLifted: EvoluzioneLiftedBlock[] = [...liftedBlocks(strip, STORICO_EVOLUZIONE_ID).filter(isEvoluzioneLiftedBlock), 'growth', 'cagr'];
  const stripEyebrows = { ...sections.eyebrows, [VERDICT_REST_SECTION]: STRIP_EYEBROW_REST, [STORICO_EVOLUZIONE_ID]: STRIP_EYEBROW_EVOLUZIONE };
  const hasRest = splitVerdict(verdict).rest.length > 0;
  /**
   * «Ultimi 12 mesi» opens «Il perché», which names the pace — or, with less than a year of
   * history, THE tile's curve; the Driver's cell its row.
   */
  const handleStripOpen = (section: string) => {
    if (section === VERDICT_REST_SECTION) {
      if (restCollapse && hasRest) restCollapse.onOpenChange(true);
      return;
    }
    if (section === STORICO_EVOLUZIONE_ID) {
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      document.getElementById(STORICO_EVOLUZIONE_ID)?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
      return;
    }
    sections.reveal(section);
  };

  // ─── Header ─────────────────────────────────────────────────────────────────
  const headerActions = (stacked: boolean) => {
    const size = stacked ? 'h-11 w-full justify-center' : 'h-8 px-2.5 text-xs';
    return (
      <>
        <ExportPDFButton snapshots={snapshots} assets={assets} allocationTargets={targets || getDefaultTargets()} variant="outline" className={cn('gap-1.5', size)} iconClassName="h-3.5 w-3.5" />
        <Button variant="outline" onClick={handleExportCSV} disabled={snapshots.length === 0} className={cn('gap-1.5', size)}>
          <Download className="h-3.5 w-3.5" aria-hidden="true" />
          Esporta CSV
        </Button>
        <Button
          variant={stacked ? 'outline' : 'ghost'}
          onClick={() => setShowManualSnapshotModal(true)}
          disabled={isDemo}
          className={cn('gap-1.5', size, stacked ? 'col-span-2' : 'text-muted-foreground hover:text-foreground')}
          aria-label={isDemo ? 'Snapshot passato — non disponibile in modalità demo' : 'Aggiungi uno snapshot passato'}
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          Snapshot passato
        </Button>
      </>
    );
  };

  const header = (
    <PageHeader
      emblem="storico"
      label="Analisi"
      title="Storico"
      description={describeStoricoHeader(growth)}
      freshness={freshness}
      actions={
        <>
          <div className="hidden items-center gap-2 desktop:flex">{headerActions(false)}</div>
          {/* The sticky navbar's slot is cramped: only the manual snapshot fits there on a phone. */}
          <Button variant="ghost" size="icon" onClick={() => setShowManualSnapshotModal(true)} disabled={isDemo} className="h-9 w-9 text-muted-foreground desktop:hidden" aria-label="Aggiungi uno snapshot passato">
            <Plus className="h-4 w-4" aria-hidden="true" />
          </Button>
        </>
      }
    />
  );

  const dialogs = (
    <>
      <CreateManualSnapshotModal open={showManualSnapshotModal} onOpenChange={setShowManualSnapshotModal} userId={ownerId || ''} onSuccess={reloadData} />
      <SnapshotSearchDialog open={noteDialogOpen} onOpenChange={setNoteDialogOpen} snapshots={snapshots} onSave={handleSaveNote} />
    </>
  );

  // ─── Loading and empty states ───────────────────────────────────────────────
  if (loading) {
    return (
      <PageContainer>
        {header}
        <TileGridSkeleton cells={SKELETON_CELLS} />
      </PageContainer>
    );
  }

  // A failed read comes BEFORE the empty branch: `[]` on failure is indistinguishable from `[]`
  // on a new account, and the empty branch would judge a set that was never read.
  if (loadFailed) {
    return (
      <PageContainer>
        {header}
        <ErrorNotice
          className="max-w-[920px]"
          onRetry={reloadData}
          notice={describeReadFailure({
            consequence: 'Lo storico non è stato letto: senza le rilevazioni mensili non c’è una crescita da misurare.',
            untouched: 'Le rilevazioni registrate non sono state toccate.',
            canRetry: true,
          })}
        />
      </PageContainer>
    );
  }

  if (!growth) {
    return (
      <PageContainer>
        {header}
        <div className="pt-1">
          <PageVerdict verdict={verdict} ariaLabel="Verdetto sullo storico" />
        </div>
        <div className="grid grid-cols-2 gap-2 desktop:hidden">{headerActions(true)}</div>
        {dialogs}
      </PageContainer>
    );
  }

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <PageContainer>
      {header}

      {/* The stage: the verdict over the grid; on a tablet in landscape the answer on the left
          (verdict and THE tile) and the index on the right (lib/utils/tabletComposition.ts). */}
      <RowAnswers value={rowAnswers}>
      <div className={STAGE_WRAPPER_CLASS}>
      <div ref={stageRef} className={STAGE_CLASS}>
      <div data-stage="verdict" className={cn('pt-1', VERDICT_CELL_CLASS)}>
        <PageVerdict
          verdict={verdict}
          ariaLabel="Verdetto sullo storico"
          strip={<VerdictStrip figures={strip} onOpen={handleStripOpen} eyebrows={stripEyebrows} />}
          restCollapse={restCollapse}
        />
      </div>

      {/* Below desktop the DOM order is the order (the `order-*` went on 2026-10-14): Evoluzione,
          then Composizione, Raddoppi, Driver and Valore as rows — at 768 Raddoppi beside the Driver, the two
          4-column tiles. Desktop: two COLUMNS, not two rows. Raddoppi keeps its natural height and the Driver
          takes the rest of the right column (its ledger and bars want it); on the left the Evoluzione chart is
          the element that stretches. Below desktop the two wrappers are `contents`, so the tiles and «Il resto
          della pagina» are direct items of the grid. */}
      <div className={COMPACT_GRID_WRAPPER_CLASS}>
      {/* At 1440 the left column is placed on the grid, not wrapped (since 2026-10-16, so that «Il resto»
          and the rows fit ONE index on a tablet in landscape): Evoluzione on row 1, Composizione under it
          on row 2, the right column across both; the `1fr` first row takes the right column's extra
          height, so the Evoluzione chart stretches as the old `flex-1` made it. */}
      <div className={cn(COMPACT_GRID_CLASS, 'desktop:grid-rows-[1fr_auto]')}>
          <div data-stage="lead" className={cn(TILE_CELL_CLASS, LEAD_CELL_CLASS, 'desktop:col-span-8 desktop:row-start-1')}>
            <EvoluzioneTile
              id={STORICO_EVOLUZIONE_ID}
              className="scroll-mt-24"
              liftedFigures={evoluzioneLifted}
              aside={describeEvolutionAside(growth)}
              reading={describeEvolution({ ath, moves })}
              growth={growth}
              pace={pace}
              points={evolutionPoints}
              noteCount={notes.length}
              onAddNote={() => !isDemo && setNoteDialogOpen(true)}
              disabled={isDemo}
            />
          </div>
          <div className={INDEX_CLASS}>
          <PageRest sections={sections} className={REST_CELL_CLASS} />
          <div className={cn(TILE_ROW_CELL_CLASS, tablet.cellClass(STORICO_SECTION_IDS.composizione), 'desktop:col-span-8 desktop:col-start-1 desktop:row-start-2')}>
            <ComposizioneTile
              assetClassHistory={assetClassHistory}
              liquidityHistory={netWorthHistory}
              hasPensionFunds={pensionAssets.length > 0}
              collapse={sections.collapse(STORICO_SECTION_IDS.composizione)}
              asideWhenClosed={STORICO_CLOSED_ASIDES.composizione}
            />
          </div>

        <div className={cn('contents desktop:col-span-4 desktop:col-start-9 desktop:row-span-2 desktop:row-start-1 desktop:flex desktop:min-w-0 desktop:flex-col desktop:gap-3', INDEX_GROUP_CLASS)}>
          <div className={cn(TILE_ROW_CELL_CLASS, tablet.cellClass(STORICO_SECTION_IDS.raddoppi))}>
            <RaddoppiTile
              collapse={sections.collapse(STORICO_SECTION_IDS.raddoppi)}
              reading={describeDoublings({ summary: doublingSummary, mode: doublingMode, projection })}
              summary={doublingSummary}
              mode={doublingMode}
              onModeChange={setDoublingMode}
              projection={projection}
              pace={pace}
              latestValue={growth.latest.value}
            />
          </div>
          <div className={cn(TILE_ROW_CELL_CLASS, tablet.cellClass(STORICO_SECTION_IDS.driver), 'desktop:flex-1')}>
            <DriverTile
              collapse={sections.collapse(STORICO_SECTION_IDS.driver)}
              reading={describeDrivers(featuredDriverYear)}
              years={driverYears}
              featured={featuredDriverYear}
              total={driverTotal}
              startYear={startYear}
              measuredSince={driverMeasuredSince}
              months={trailingDriverMonths}
              windowMonths={DRIVER_TRAILING_MONTHS}
            />
          </div>
        </div>

        <div className={cn(TILE_ROW_CELL_CLASS, tablet.cellClass(STORICO_SECTION_IDS.valore), 'desktop:col-span-12')}>
          <ValoreStrumentoTile
            collapse={sections.collapse(STORICO_SECTION_IDS.valore)}
            asideWhenClosed={STORICO_CLOSED_ASIDES.valore}
            reading={describeMonthBreakdown(breakdown)}
            months={breakdownMonths}
            activeMonthKey={activeMonthKey}
            onMonthChange={setSelectedMonthKey}
            breakdown={breakdown}
            displayTickerByAssetId={displayTickerByAssetId}
            selectedAssetIds={selectedAssetIds}
            onToggleAsset={toggleAsset}
            onToggleAllInMonth={toggleAllInMonth}
            selection={selection}
            trend={selectionTrend}
          />
        </div>
          </div>
      </div>
      </div>
      </div>
      </div>
      </RowAnswers>

      <StoricoDettaglio
        currentYear={currentYear}
        startYear={startYear}
        yearlyVariation={yearlyVariation}
        monthlyDrivers={monthlyDrivers}
        driverYears={driverYearOptions}
        labor={laborMetrics}
        notes={notes}
        snapshotCount={growth.snapshotCount}
        onAddNote={() => !isDemo && setNoteDialogOpen(true)}
        disabled={isDemo}
      />

      {/* Below desktop the three actions are 44px buttons AFTER the content: exports and a past snapshot
          are yearly gestures, and under the verdict they stood between the thumb and the first figure
          (the navbar keeps the «+»). */}
      <div className="grid grid-cols-2 gap-2 desktop:hidden">{headerActions(true)}</div>

      {dialogs}
    </PageContainer>
  );
}
