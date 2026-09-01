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
 *   Mobile (1 col):   Evoluzione → Raddoppi → Composizione → Driver → Valore per strumento
 *
 * DATA: the snapshots, assets, targets, expenses and settings load once in parallel; every
 * figure a tile shows is derived from them in a pure, tested util (storicoSummary.ts, the
 * chartService preparers, snapshotAssetBreakdown.ts, historyComposition.ts) — never in a
 * component. A snapshot is a frozen photograph: nothing here recomputes a stored value.
 */

import { useEffect, useMemo, useState } from 'react';
import { Download, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { useActiveAccount } from '@/contexts/ActiveAccountContext';
import { useDemoMode } from '@/lib/hooks/useDemoMode';
import { getAllAssets, calculateTotalEstimatedTaxes } from '@/lib/services/assetService';
import { getUserSnapshots, updateSnapshotNote } from '@/lib/services/snapshotService';
import { getTargets, getDefaultTargets, getSettings } from '@/lib/services/assetAllocationService';
import { getAllExpenses } from '@/lib/services/expenseService';
import {
  prepareNetWorthHistoryData,
  prepareAssetClassHistoryData,
  prepareYoYVariationData,
  prepareSavingsVsInvestmentData,
  prepareSavingsVsInvestmentDataAllMonths,
  prepareDoublingTimeData,
  prepareMonthlyLaborMetricsData,
} from '@/lib/services/chartService';
import type { Asset, MonthlySnapshot, AssetAllocationTarget, DoublingMode, AssetAllocationSettings } from '@/types/assets';
import type { Expense } from '@/types/expenses';
import { getItalyMonthYear } from '@/lib/utils/dateHelpers';
import {
  projectNextDoubling,
  resolveFeaturedDriverYear,
  selectDriverYears,
  selectTrailingMonths,
  sortSnapshots,
  summarizeAllTimeHigh,
  summarizeGrowth,
  summarizeGrowthPace,
  summarizeLaborMetrics,
  summarizeMonthlyMoves,
  sumDriverYears,
  withMonthDeltas,
} from '@/lib/utils/storicoSummary';
import {
  buildStoricoVerdict,
  describeDoublings,
  describeDrivers,
  describeEvolution,
  describeEvolutionAside,
  describeMonthBreakdown,
  describeStoricoHeader,
} from '@/lib/utils/storicoNarrative';
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
import { EvoluzioneTile } from '@/components/history/tiles/EvoluzioneTile';
import { RaddoppiTile } from '@/components/history/tiles/RaddoppiTile';
import { ComposizioneTile } from '@/components/history/tiles/ComposizioneTile';
import { DriverTile } from '@/components/history/tiles/DriverTile';
import { ValoreStrumentoTile } from '@/components/history/tiles/ValoreStrumentoTile';
import { StoricoDettaglio } from '@/components/history/StoricoDettaglio';

/** The grid's geometry, for the skeleton: the same spans as the tiles below. */
const SKELETON_CELLS: TileSkeletonCell[] = [
  { span: 8, rows: 2, lines: 12 },
  { span: 4, rows: 2, lines: 9 },
  { span: 8, lines: 9 },
  { span: 4, lines: 7 },
  { span: 12, lines: 6 },
];

/** How many of the last months the Driver tile draws. */
const DRIVER_TRAILING_MONTHS = 12;
/** The cashflow floor when the settings carry none. */
const DEFAULT_CASHFLOW_START_YEAR = 2025;

export default function HistoryPage() {
  const { user } = useAuth();
  const { ownerId } = useActiveAccount();
  const isDemo = useDemoMode();
  const [snapshots, setSnapshots] = useState<MonthlySnapshot[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [targets, setTargets] = useState<AssetAllocationTarget | null>(null);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [portfolioSettings, setPortfolioSettings] = useState<AssetAllocationSettings | null>(null);
  const [loading, setLoading] = useState(true);
  /** A failed load is not an empty set: it gets an alert, never a verdict about zeros. */
  const [loadFailed, setLoadFailed] = useState(false);
  const [doublingMode, setDoublingMode] = useState<DoublingMode>('geometric');
  const [showManualSnapshotModal, setShowManualSnapshotModal] = useState(false);
  const [noteDialogOpen, setNoteDialogOpen] = useState(false);
  // Valore per strumento: the month (null = the latest with a breakdown) and the ticked instruments.
  const [selectedMonthKey, setSelectedMonthKey] = useState<string | null>(null);
  const [selectedAssetIds, setSelectedAssetIds] = useState<Set<string>>(new Set());

  /** Snapshots, assets, targets, expenses and settings, in parallel. */
  const loadData = async () => {
    if (!user || !ownerId) return;
    try {
      setLoading(true);
      setLoadFailed(false);
      const [snapshotsData, assetsData, targetsData, expensesData, settingsData] = await Promise.all([
        getUserSnapshots(ownerId),
        getAllAssets(ownerId),
        getTargets(ownerId),
        getAllExpenses(ownerId),
        getSettings(ownerId),
      ]);
      setSnapshots(snapshotsData);
      setAssets(assetsData);
      setTargets(targetsData || getDefaultTargets());
      setExpenses(expensesData);
      setPortfolioSettings(settingsData);
    } catch (error) {
      setLoadFailed(true);
      console.error('Error loading history data:', error);
      toast.error('Errore nel caricamento dello storico');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!user || !ownerId) return;
    // Deferred so the effect body itself sets no state (react-hooks/set-state-in-effect).
    const timer = setTimeout(() => {
      loadData();
    }, 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, ownerId]);

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

  /** A note is saved first, then patched into the local snapshot — no refetch. Never in demo: the snapshots are shared. */
  const handleSaveNote = async (year: number, month: number, note: string) => {
    if (!user || !ownerId || isDemo) return;
    await updateSnapshotNote(ownerId, year, month, note);
    setSnapshots((previous) => previous.map((s) => (s.year === year && s.month === month ? { ...s, note: note.trim() || undefined } : s)));
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

  // Driver: the yearly split from the cashflow floor, the running year featured, the last twelve months.
  const startYear = portfolioSettings?.cashflowHistoryStartYear ?? DEFAULT_CASHFLOW_START_YEAR;
  const currentYear = getItalyMonthYear().year;
  const driverYears = useMemo(() => selectDriverYears(prepareSavingsVsInvestmentData(ordered, expenses), startYear), [ordered, expenses, startYear]);
  const featuredDriverYear = useMemo(() => resolveFeaturedDriverYear(driverYears, currentYear), [driverYears, currentYear]);
  const driverTotal = useMemo(() => sumDriverYears(driverYears), [driverYears]);
  const monthlyDrivers = useMemo(() => prepareSavingsVsInvestmentDataAllMonths(ordered, expenses).filter((row) => row.year >= startYear), [ordered, expenses, startYear]);
  const trailingDriverMonths = useMemo(() => selectTrailingMonths(monthlyDrivers, DRIVER_TRAILING_MONTHS), [monthlyDrivers]);
  const driverYearOptions = useMemo(() => [...new Set(monthlyDrivers.map((row) => row.year))].sort((a, b) => b - a), [monthlyDrivers]);

  const yearlyVariation = useMemo(() => prepareYoYVariationData(ordered), [ordered]);

  // Lavoro e investimenti — only when the labor categories are configured; the maths is the pure
  // `summarizeLaborMetrics`, the tax estimate is the Patrimonio's (Firebase-coupled, so passed in).
  const laborMetrics = useMemo(() => {
    const categoryIds = portfolioSettings?.laborIncomeCategoryIds ?? [];
    const metrics = summarizeLaborMetrics(ordered, expenses, categoryIds, startYear, calculateTotalEstimatedTaxes(assets));
    if (!metrics) return null;
    return { metrics, chartData: prepareMonthlyLaborMetricsData(ordered, expenses, categoryIds, startYear) };
  }, [expenses, ordered, portfolioSettings, assets, startYear]);

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
      label="Analisi"
      title="Storico"
      description={describeStoricoHeader(growth)}
      separator={false}
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
      <CreateManualSnapshotModal open={showManualSnapshotModal} onOpenChange={setShowManualSnapshotModal} userId={ownerId || ''} onSuccess={loadData} />
      <SnapshotSearchDialog open={noteDialogOpen} onOpenChange={setNoteDialogOpen} snapshots={snapshots} onSave={handleSaveNote} />
    </>
  );

  // ─── Loading and empty states ───────────────────────────────────────────────
  if (loading) {
    return (
      <PageContainer width="wide">
        {header}
        <TileGridSkeleton cells={SKELETON_CELLS} />
      </PageContainer>
    );
  }

  // A failed read comes BEFORE the empty branch: `[]` on failure is indistinguishable from `[]`
  // on a new account, and the empty branch would judge a set that was never read.
  if (loadFailed) {
    return (
      <PageContainer width="wide">
        {header}
        <ErrorNotice
          className="max-w-[920px]"
          onRetry={() => void loadData()}
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
      <PageContainer width="wide">
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
    <PageContainer width="wide">
      {header}

      <div className="pt-1">
        <PageVerdict verdict={verdict} ariaLabel="Verdetto sullo storico" />
      </div>

      {/* Below desktop the three actions sit under the verdict as 44px buttons. */}
      <div className="grid grid-cols-2 gap-2 desktop:hidden">{headerActions(true)}</div>

      {/* Tablet (768-1439): Evoluzione full, Raddoppi beside Driver, then Composizione and Valore full — the
          two 4-column tiles are the only ones narrow enough to share a row there. */}
      <div className="grid grid-cols-1 gap-3 tablet:grid-cols-2 desktop:grid-cols-12">
        <div className={cn(TILE_CELL_CLASS, 'order-1 tablet:col-span-2 desktop:order-none desktop:col-span-8 desktop:row-span-2')}>
          <EvoluzioneTile
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

        <div className={cn(TILE_CELL_CLASS, 'order-2 desktop:order-none desktop:col-span-4 desktop:row-span-2')}>
          <RaddoppiTile
            reading={describeDoublings({ summary: doublingSummary, mode: doublingMode, projection })}
            summary={doublingSummary}
            mode={doublingMode}
            onModeChange={setDoublingMode}
            projection={projection}
            pace={pace}
            latestValue={growth.latest.value}
          />
        </div>

        <div className={cn(TILE_CELL_CLASS, 'order-3 tablet:order-4 tablet:col-span-2 desktop:order-none desktop:col-span-8')}>
          <ComposizioneTile assetClassHistory={assetClassHistory} liquidityHistory={netWorthHistory} hasPensionFunds={pensionAssets.length > 0} />
        </div>

        <div className={cn(TILE_CELL_CLASS, 'order-4 tablet:order-3 desktop:order-none desktop:col-span-4')}>
          <DriverTile
            reading={describeDrivers(featuredDriverYear)}
            years={driverYears}
            featured={featuredDriverYear}
            total={driverTotal}
            startYear={startYear}
            months={trailingDriverMonths}
            windowMonths={DRIVER_TRAILING_MONTHS}
          />
        </div>

        <div className={cn(TILE_CELL_CLASS, 'order-5 tablet:col-span-2 desktop:order-none desktop:col-span-12')}>
          <ValoreStrumentoTile
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

      {dialogs}
    </PageContainer>
  );
}
