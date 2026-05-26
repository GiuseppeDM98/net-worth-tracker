'use client';

import { useEffect, useState, useMemo } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import Link from 'next/link';
import {
  staggerContainer,
  cardItem,
  slideDown,
  chapterReveal,
  chartShellSettle,
  periodContentSettle,
  tabPanelSwitch,
} from '@/lib/utils/motionVariants';
import { useAuth } from '@/contexts/AuthContext';
import { HistoryPageSkeleton } from '@/components/history/HistoryPageSkeleton';
import { useMediaQuery } from '@/lib/hooks/useMediaQuery';
import { useChartColors } from '@/lib/hooks/useChartColors';
import { getAllAssets, calculateTotalEstimatedTaxes } from '@/lib/services/assetService';
import { getUserSnapshots, updateSnapshotNote } from '@/lib/services/snapshotService';
import {
  getTargets,
  getDefaultTargets,
  getSettings,
} from '@/lib/services/assetAllocationService';
import { getAllExpenses } from '@/lib/services/expenseService';
import {
  prepareNetWorthHistoryData,
  prepareAssetClassHistoryData,
  prepareYoYVariationData,
  prepareSavingsVsInvestmentData,
  prepareSavingsVsInvestmentDataMonthly,
  prepareSavingsVsInvestmentDataAllMonths,
  prepareDoublingTimeData,
  prepareMonthlyLaborMetricsData,
  formatCurrency,
  formatCurrencyCompact,
  formatPercentage,
} from '@/lib/services/chartService';
import LaborMetricsChart from '@/components/dashboard/LaborMetricsChart';
import { HeroMetricBlock } from '@/components/performance/HeroMetricBlock';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Asset, MonthlySnapshot, AssetAllocationTarget, DoublingMode, AssetAllocationSettings } from '@/types/assets';
import { DoublingTimeSummaryCards } from '@/components/history/DoublingTimeSummaryCards';
import { DoublingMilestoneTimeline } from '@/components/history/DoublingMilestoneTimeline';
import { Expense } from '@/types/expenses';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Download,
  Plus,
  MessageSquare,
  Briefcase,
  PiggyBank,
  TrendingUp,
  TrendingDown,
  ChevronDown,
  Settings,
} from 'lucide-react';
import { getItalyYear } from '@/lib/utils/dateHelpers';
import { MONTH_NAMES } from '@/lib/constants/months';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { CreateManualSnapshotModal } from '@/components/CreateManualSnapshotModal';
import { SnapshotSearchDialog } from '@/components/history/SnapshotSearchDialog';
import { CustomChartDot } from '@/components/history/CustomChartDot';
import { ExportPDFButton } from '@/components/dashboard/ExportPDFButton';
import { HouseholdScopeSelect } from '@/components/household/HouseholdScopeSelect';
import { useHouseholdScopeFilter } from '@/lib/hooks/useHouseholdScopeFilter';
import {
  filterAssetsByOwnershipScope,
  filterExpensesByAttributionScope,
  filterSnapshotsByOwnershipScope,
} from '@/lib/utils/householdUtils';
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
} from 'recharts';

/**
 * HISTORY PAGE ARCHITECTURE
 *
 * Narrative order: Hero → Evoluzione → Milestone (Doubling Time) → Composizione → Driver → Appendice
 *
 * DATA FLOW:
 * 1. Load snapshots + assets + targets + expenses from Firebase (parallel)
 * 2. Transform snapshots → chart data via chartService
 * 3. Render with chapter-reveal stagger (chapterReveal variant, 90ms per chapter)
 *
 * DESIGN PRINCIPLES (Trade Republic hierarchy):
 * - Hero block: patrimonio attuale text-4xl + CAGR chip + pill nav shortcuts
 * - No card-in-card: Lavoro KPIs use flat divide-y rows
 * - No side-stripe borders: removed border-l-4 from evolution card
 * - No hardcoded hex in chart series: all colors via useChartColors()
 * - Segmented pills for Annuale/Mensile and Geometrico/Traguardi toggles
 * - YoY + snapshot grid in collapsible appendice (default closed)
 */

// Module-level constants for segmented pill controls — stable reference for React Compiler
const SAVINGS_VIEW_TABS = [
  { value: 'annual' as const, label: 'Annuale' },
  { value: 'monthly' as const, label: 'Mensile' },
];

const DOUBLING_MODE_TABS = [
  { value: 'geometric' as const, label: 'Geometrico' },
  { value: 'threshold' as const, label: 'Traguardi' },
];

// Pill nav links that scroll to named section anchors in the page
const SECTION_PILLS = [
  { label: 'Evoluzione', href: '#section-evolution' },
  { label: 'Raddoppi', href: '#section-milestones' },
  { label: 'Composizione', href: '#section-composition' },
  { label: 'Driver', href: '#section-drivers' },
] as const;

type HistoryChapterId = 'hero' | 'evolution' | 'milestones' | 'composition' | 'drivers';

const HISTORY_CHAPTER_SEQUENCE: HistoryChapterId[] = [
  'hero',
  'evolution',
  'milestones',
  'composition',
  'drivers',
];

export default function HistoryPage() {
  const { user } = useAuth();
  const [snapshots, setSnapshots] = useState<MonthlySnapshot[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [targets, setTargets] = useState<AssetAllocationTarget | null>(null);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [portfolioSettings, setPortfolioSettings] = useState<AssetAllocationSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAssetClassPercentage, setShowAssetClassPercentage] = useState(false);
  const [showLiquidityPercentage, setShowLiquidityPercentage] = useState(false);
  const [showYoYPercentage, setShowYoYPercentage] = useState(false);
  const [showManualSnapshotModal, setShowManualSnapshotModal] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [snapshotSearchDialogOpen, setSnapshotSearchDialogOpen] = useState(false);
  const [doublingMode, setDoublingMode] = useState<DoublingMode>('geometric');
  const [savingsView, setSavingsView] = useState<'annual' | 'monthly'>('annual');
  // 'all' shows all years as a continuous monthly timeline; a number filters to that year
  const [savingsSelectedYear, setSavingsSelectedYear] = useState<number | 'all'>('all');
  const [visibleChapters, setVisibleChapters] = useState<HistoryChapterId[]>([]);
  // Appendice collapsible — default closed so it doesn't overwhelm the page on first load
  const [snapshotsOpen, setSnapshotsOpen] = useState(false);
  const prefersReducedMotion = useReducedMotion();
  const {
    householdConfig,
    householdEnabled,
    options: householdScopeOptions,
    selectedScopeKey,
    setSelectedScopeKey,
    scope,
  } = useHouseholdScopeFilter(user?.uid);

  const chartColors = useChartColors();

  // Responsive breakpoints
  const isMobile = useMediaQuery('(max-width: 767px)');
  const isLandscape = useMediaQuery('(min-width: 568px) and (max-height: 500px) and (orientation: landscape)');

  const getChartHeight = () => {
    if (isLandscape) return 300;
    if (isMobile) return 280;
    return 400;
  };

  const getChartMargins = () => {
    if (isMobile) return { left: 10, right: 10, top: 5, bottom: 5 };
    // bottom: 20 prevents legend from overlapping X-axis labels inside the SVG
    return { left: 50, bottom: 20 };
  };

  const getYAxisWidth = () => (isMobile ? 70 : 100);

  // Shared tooltip style — reduced font size vs old 16px for cleaner desktop display
  const tooltipStyle = {
    contentStyle: {
      backgroundColor: 'var(--card)',
      border: '1px solid var(--border)',
      borderRadius: '8px',
      padding: isMobile ? '8px' : '12px',
      fontSize: isMobile ? '12px' : '13px',
      boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
    },
    labelStyle: {
      color: 'var(--foreground)',
      fontWeight: 600,
      marginBottom: '4px',
      fontSize: isMobile ? '12px' : '13px',
    },
    itemStyle: {
      fontSize: isMobile ? '12px' : '13px',
      padding: '2px 0',
    },
  };

  useEffect(() => {
    if (user) {
      loadData();
    }
  }, [user]);

  useEffect(() => {
    if (loading) return;

    if (prefersReducedMotion) {
      setVisibleChapters(HISTORY_CHAPTER_SEQUENCE);
      return;
    }

    setVisibleChapters([HISTORY_CHAPTER_SEQUENCE[0]]);
    const timers = HISTORY_CHAPTER_SEQUENCE.slice(1).map((chapterId, index) =>
      window.setTimeout(() => {
        setVisibleChapters((current) =>
          current.includes(chapterId) ? current : [...current, chapterId]
        );
      }, 90 * (index + 1))
    );

    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [loading, prefersReducedMotion]);

  /**
   * Load all data needed for history visualization.
   *
   * Fetches in parallel: snapshots, assets, allocation targets, expenses, portfolio settings.
   * All four queries run concurrently to minimize loading time.
   */
  const loadData = async () => {
    if (!user) return;

    try {
      setLoading(true);
      const [snapshotsData, assetsData, targetsData, expensesData, settingsData] = await Promise.all([
        getUserSnapshots(user.uid),
        getAllAssets(user.uid),
        getTargets(user.uid),
        getAllExpenses(user.uid),
        getSettings(user.uid),
      ]);

      setSnapshots(snapshotsData);
      setAssets(assetsData);
      setTargets(targetsData || getDefaultTargets());
      setExpenses(expensesData);
      setPortfolioSettings(settingsData);
    } catch (error) {
      console.error('Error loading history data:', error);
      toast.error('Errore nel caricamento dello storico');
    } finally {
      setLoading(false);
    }
  };

  /**
   * Export snapshot history to CSV file for external analysis.
   *
   * CSV headers: Data (MM/YYYY), Patrimonio Totale, Patrimonio Liquido, Patrimonio Illiquido.
   * Downloads directly to the browser's default download location.
   */
  const handleExportCSV = () => {
    if (displaySnapshots.length === 0) {
      toast.error('Nessun dato da esportare');
      return;
    }

    const headers = ['Data', 'Patrimonio Totale', 'Patrimonio Liquido', 'Patrimonio Illiquido'];
    const rows = displaySnapshots.map((snapshot) => [
      `${String(snapshot.month).padStart(2, '0')}/${snapshot.year}`,
      snapshot.totalNetWorth,
      snapshot.liquidNetWorth,
      snapshot.illiquidNetWorth || 0,
    ]);

    const csvContent = [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `net-worth-history-${Date.now()}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast.success('Storico esportato con successo');
  };

  /**
   * Save user note for a specific snapshot month via optimistic update:
   * writes to Firestore first, then updates local state without re-fetching.
   */
  const handleSaveNote = async (year: number, month: number, note: string) => {
    if (!user) return;

    await updateSnapshotNote(user.uid, year, month, note);

    setSnapshots((prevSnapshots) =>
      prevSnapshots.map((s) =>
        s.year === year && s.month === month
          ? { ...s, note: note.trim() || undefined }
          : s
      )
    );
  };

  const scopedAssets = useMemo(
    () => filterAssetsByOwnershipScope(assets, householdConfig, scope),
    [assets, householdConfig, scope]
  );
  const scopedExpenses = useMemo(
    () => filterExpensesByAttributionScope(expenses, householdConfig, scope),
    [expenses, householdConfig, scope]
  );
  const scopedSnapshots = useMemo(
    () => filterSnapshotsByOwnershipScope(snapshots, assets, householdConfig, scope),
    [assets, householdConfig, scope, snapshots]
  );
  const displayAssets = householdEnabled ? scopedAssets : assets;
  const displayExpenses = householdEnabled ? scopedExpenses : expenses;
  const displaySnapshots = householdEnabled ? scopedSnapshots : snapshots;

  const netWorthHistory = prepareNetWorthHistoryData(displaySnapshots);
  const assetClassHistory = prepareAssetClassHistoryData(displaySnapshots);
  const yoyVariationData = prepareYoYVariationData(displaySnapshots);
  const savingsVsInvestmentData = prepareSavingsVsInvestmentData(displaySnapshots, displayExpenses);
  const savingsVsInvestmentDataMonthly = useMemo(
    () =>
      typeof savingsSelectedYear === 'number'
        ? prepareSavingsVsInvestmentDataMonthly(displaySnapshots, displayExpenses, savingsSelectedYear)
        : [],
    [displaySnapshots, displayExpenses, savingsSelectedYear]
  );
  const savingsVsInvestmentDataAllMonths = useMemo(
    () => prepareSavingsVsInvestmentDataAllMonths(displaySnapshots, displayExpenses),
    [displaySnapshots, displayExpenses]
  );
  const savingsAvailableYears = useMemo(
    () => [...new Set(displaySnapshots.map((s) => s.year))].sort((a, b) => b - a),
    [displaySnapshots]
  );
  const doublingTimeSummary = prepareDoublingTimeData(displaySnapshots, doublingMode);
  const visibleChapterSet = useMemo(() => new Set(visibleChapters), [visibleChapters]);
  const notesCount = useMemo(
    () => netWorthHistory.filter((item) => item.note && item.note.trim() !== '').length,
    [netWorthHistory]
  );
  const savingsViewLabel = savingsView === 'annual' ? 'Annuale' : 'Mensile';
  const savingsScopeLabel = useMemo(() => {
    if (savingsView === 'annual') return 'Confronto per anno';
    if (savingsSelectedYear === 'all') return 'Timeline mensile completa';
    return `Dettaglio ${savingsSelectedYear}`;
  }, [savingsSelectedYear, savingsView]);

  // Aggregate lifetime labor/investment metrics for the KPI rows.
  // Only computed when laborIncomeCategoryIds is configured in Settings.
  const laborIncomeMetrics = useMemo(() => {
    const categoryIds = portfolioSettings?.laborIncomeCategoryIds;
    if (!categoryIds || categoryIds.length === 0 || displayExpenses.length === 0) return null;

    const startYear = portfolioSettings?.cashflowHistoryStartYear ?? 2025;
    const categorySet = new Set(categoryIds);
    const filtered = displayExpenses.filter((e) => getItalyYear(e.date) >= startYear);

    const totalLaborIncome = filtered
      .filter((e) => e.type === 'income' && categorySet.has(e.categoryId))
      .reduce((sum, e) => sum + e.amount, 0);

    const totalExpensesSum = filtered
      .filter((e) => e.type !== 'income')
      .reduce((sum, e) => sum + e.amount, 0);

    const totalSavedFromWork = totalLaborIncome + totalExpensesSum;

    const relevantSnapshots = displaySnapshots
      .filter((s) => s.year >= startYear)
      .sort((a, b) => (a.year !== b.year ? a.year - b.year : a.month - b.month));

    let totalInvestmentGrowthGross = 0;
    if (relevantSnapshots.length >= 1) {
      const baselineSnapshot =
        displaySnapshots.find((s) => s.year === startYear - 1 && s.month === 12) ??
        relevantSnapshots[0];
      const netWorthDelta =
        relevantSnapshots.at(-1)!.totalNetWorth - baselineSnapshot.totalNetWorth;
      const allIncomeSum = filtered
        .filter((e) => e.type === 'income')
        .reduce((sum, e) => sum + e.amount, 0);
      totalInvestmentGrowthGross = netWorthDelta - (allIncomeSum + totalExpensesSum);
    }

    const estimatedTaxes = calculateTotalEstimatedTaxes(assets);
    const totalInvestmentGrowthNet = totalInvestmentGrowthGross - estimatedTaxes;

    return {
      totalLaborIncome,
      totalSavedFromWork,
      totalExpensesSum,
      totalInvestmentGrowthGross,
      totalInvestmentGrowthNet,
      startYear,
    };
  }, [expenses, snapshots, portfolioSettings, assets]);

  const laborMetricsChartData = useMemo(() => {
    const categoryIds = portfolioSettings?.laborIncomeCategoryIds;
    if (!categoryIds || categoryIds.length === 0 || displayExpenses.length === 0) return [];
    const startYear = portfolioSettings?.cashflowHistoryStartYear ?? 2025;
    return prepareMonthlyLaborMetricsData(displaySnapshots, displayExpenses, categoryIds, startYear);
  }, [displaySnapshots, displayExpenses, portfolioSettings]);

  const laborMonthCounts = useMemo(() => {
    return laborMetricsChartData.reduce(
      (counts, month) => {
        if (month.netWorthGrowth > 0) counts.positiveMonths += 1;
        if (month.netWorthGrowth < 0) counts.negativeMonths += 1;
        return counts;
      },
      { positiveMonths: 0, negativeMonths: 0 }
    );
  }, [laborMetricsChartData]);

  // Pre-calculate liquid/illiquid percentages for the liquidity chart toggle
  const liquidityHistory = netWorthHistory.map((item) => {
    const total = item.liquidNetWorth + item.illiquidNetWorth;
    return {
      ...item,
      liquidPercentage: total > 0 ? (item.liquidNetWorth / total) * 100 : 0,
      illiquidPercentage: total > 0 ? (item.illiquidNetWorth / total) * 100 : 0,
    };
  });

  // Hero metrics: latest patrimonio, total growth %, and annualized CAGR
  const heroMetrics = useMemo(() => {
    if (snapshots.length === 0) return null;
    const sorted = [...snapshots].sort((a, b) =>
      a.year !== b.year ? a.year - b.year : a.month - b.month
    );
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    const totalMonths = (last.year - first.year) * 12 + (last.month - first.month);
    const totalGrowthPct =
      first.totalNetWorth > 0
        ? ((last.totalNetWorth / first.totalNetWorth) - 1) * 100
        : null;
    // CAGR requires at least 12 months of data to be meaningful
    const cagr =
      totalMonths >= 12 && first.totalNetWorth > 0
        ? (Math.pow(last.totalNetWorth / first.totalNetWorth, 12 / totalMonths) - 1) * 100
        : null;
    return { latestNetWorth: last.totalNetWorth, totalGrowthPct, cagr, firstYear: first.year, totalMonths };
  }, [snapshots]);

  if (loading) {
    return <HistoryPageSkeleton />;
  }

  // Asset class series color assignments (consistent with ASSET_CLASS_ORDER)
  const acColors = {
    equity: chartColors[0],
    bonds: chartColors[1],
    crypto: chartColors[2],
    realestate: chartColors[3],
    cash: chartColors[4],
    commodity: chartColors[5],
  };

  return (
    <div className="space-y-6 max-desktop:portrait:pb-20">
      {/* Page header */}
      <div className="pb-4 border-b border-border">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex-1">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-widest mb-1">Patrimonio</p>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Storico</h1>
            <p className="mt-1 sm:mt-2 text-sm sm:text-base text-muted-foreground">
              Analizza l&apos;evoluzione del tuo patrimonio (lordo) nel tempo
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto sm:items-center">
            <ExportPDFButton
              snapshots={displaySnapshots}
              assets={displayAssets}
              allocationTargets={targets || getDefaultTargets()}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportCSV}
              disabled={displaySnapshots.length === 0}
              className="w-full sm:w-auto"
            >
              <Download className="mr-2 h-4 w-4" />
              Esporta CSV
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowManualSnapshotModal(true)}
              className="w-full sm:w-auto text-muted-foreground hover:text-foreground"
            >
              <Plus className="mr-2 h-4 w-4" />
              Snapshot Passato
            </Button>
          </div>
        </div>
      </div>

      {/* ── HERO ──────────────────────────────────────────────────────── */}
      <motion.section
        variants={chapterReveal}
        initial="hidden"
        animate={visibleChapterSet.has('hero') ? 'visible' : 'hidden'}
      >
        <Card className="overflow-hidden">
          <HeroMetricBlock
            label="Patrimonio Attuale"
            value={heroMetrics?.latestNetWorth ?? null}
            format="currency"
            subtitle={heroMetrics ? `Dal ${heroMetrics.firstYear}` : undefined}
          />

          {heroMetrics && (heroMetrics.cagr !== null || heroMetrics.totalGrowthPct !== null) && (
            <div className="flex flex-wrap items-center gap-2 px-6 pb-4">
              {heroMetrics.cagr !== null && (
                <span className={cn(
                  'inline-flex items-center rounded-md px-2.5 py-1 text-xs font-medium',
                  heroMetrics.cagr >= 0
                    ? 'bg-green-500/10 text-green-600 dark:text-green-400'
                    : 'bg-red-500/10 text-red-600 dark:text-red-400'
                )}>
                  {heroMetrics.cagr >= 0 ? '+' : ''}{heroMetrics.cagr.toFixed(1)}% /anno (CAGR)
                </span>
              )}
              {heroMetrics.totalGrowthPct !== null && (
                <span className={cn(
                  'inline-flex items-center rounded-md px-2.5 py-1 text-xs font-medium',
                  heroMetrics.totalGrowthPct >= 0
                    ? 'bg-green-500/10 text-green-600 dark:text-green-400'
                    : 'bg-red-500/10 text-red-600 dark:text-red-400'
                )}>
                  {heroMetrics.totalGrowthPct >= 0 ? '+' : ''}{heroMetrics.totalGrowthPct.toFixed(1)}% totale
                </span>
              )}
            </div>
          )}

          {/* Pill nav — scroll to named section anchors */}
          <div className="border-t border-border/40 px-6 py-3 flex flex-wrap gap-2">
            {SECTION_PILLS.map(({ label, href }) => (
              <a
                key={href}
                href={href}
                className="inline-flex items-center rounded-full border border-border/60 px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:border-border hover:text-foreground"
              >
                {label}
              </a>
            ))}
          </div>
        </Card>
      </motion.section>

      {/* ── EVOLUZIONE ────────────────────────────────────────────────── */}
      <motion.section
        id="section-evolution"
        variants={chapterReveal}
        initial="hidden"
        animate={visibleChapterSet.has('evolution') ? 'visible' : 'hidden'}
        className="space-y-4 pt-6 border-t border-border/40"
      >
        <div>
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">Evoluzione</p>
          <h2 className="mt-1 text-lg font-semibold text-foreground">Patrimonio nel tempo</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Trend complessivo del patrimonio. Usa le note per contestualizzare i punti di svolta.
          </p>
        </div>

        <motion.div variants={cardItem} initial="hidden" animate="visible">
          <Card>
            <CardHeader>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-2">
                  <CardTitle className="text-xl sm:text-2xl">Evoluzione Patrimonio Netto</CardTitle>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span className="rounded-full border border-border bg-muted/40 px-2.5 py-1 font-medium text-foreground">
                      Vista principale
                    </span>
                    <span className="rounded-full border border-border bg-background px-2.5 py-1">
                      {netWorthHistory.length} rilevazioni
                    </span>
                    <span className="rounded-full border border-border bg-background px-2.5 py-1">
                      {notesCount} {notesCount === 1 ? 'nota' : 'note'}
                    </span>
                  </div>
                </div>
                <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowNotes(!showNotes)}
                    className="w-full sm:w-auto text-xs sm:text-sm"
                  >
                    {showNotes ? 'Nascondi Note' : 'Visualizza Note'}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSnapshotSearchDialogOpen(true)}
                    className="w-full sm:w-auto text-xs sm:text-sm"
                  >
                    <MessageSquare className="h-3 w-3 sm:h-4 sm:w-4 mr-1" />
                    Inserisci una nota
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {netWorthHistory.length === 0 ? (
                <div className="flex h-64 items-center justify-center text-muted-foreground text-sm">
                  Nessuno storico disponibile. Gli snapshot mensili verranno creati automaticamente.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={getChartHeight()} id="chart-net-worth-evolution">
                  <LineChart data={netWorthHistory} margin={getChartMargins()}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" strokeOpacity={0.6} />
                    <XAxis dataKey="date" />
                    <YAxis
                      width={getYAxisWidth()}
                      tickFormatter={(value) => formatCurrencyCompact(value)}
                      domain={[(dataMin: number) => dataMin * 0.95, (dataMax: number) => dataMax * 1.05]}
                    />
                    <Tooltip
                      formatter={(value) => formatCurrency(value as number)}
                      {...tooltipStyle}
                      cursor={{ stroke: 'var(--border)', strokeWidth: 1, strokeDasharray: '5 5' }}
                    />
                    <Legend
                      wrapperStyle={{ display: isMobile ? 'none' : 'block', paddingTop: '20px' }}
                      iconSize={10}
                      fontSize={12}
                    />
                    <Line
                      type="monotone"
                      dataKey="totalNetWorth"
                      stroke={chartColors[0]}
                      strokeWidth={2}
                      name="Patrimonio Totale"
                      dot={({ key, ...props }: any) => <CustomChartDot key={key} {...props} isMobile={isMobile} />}
                      activeDot={{ r: 6 }}
                      animationDuration={800}
                      animationEasing="ease-out"
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Notes panel — expands below the evolution chart */}
        <AnimatePresence>
          {showNotes && (
            <motion.div key="notes-section" variants={slideDown} initial="hidden" animate="visible" exit="exit">
              {(() => {
                const snapshotsWithNotes = netWorthHistory
                  .filter((item) => item.note && item.note.trim() !== '')
                  .map((item) => ({ year: item.year, month: item.month, note: item.note!, date: item.date }))
                  .sort((a, b) => b.year !== a.year ? b.year - a.year : b.month - a.month);

                return (
                  <Card>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-lg sm:text-xl">Note Patrimonio Netto</CardTitle>
                        <Button variant="ghost" size="sm" onClick={() => setShowNotes(false)} className="text-xs sm:text-sm">
                          Chiudi
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent>
                      {snapshotsWithNotes.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">Nessuna nota disponibile</div>
                      ) : (
                        <>
                          {/* Mobile: card-based stacked layout */}
                          <div className="space-y-3 sm:hidden">
                            {snapshotsWithNotes.map((item) => (
                              <div key={`${item.year}-${item.month}`} className="rounded-md border p-3">
                                <div className="font-medium text-sm text-muted-foreground mb-2">
                                  {MONTH_NAMES[item.month - 1]} {item.year}
                                </div>
                                <div className="text-sm text-foreground whitespace-pre-line">{item.note}</div>
                              </div>
                            ))}
                          </div>

                          {/* Desktop: sticky-header table */}
                          <div className="hidden sm:block rounded-md border">
                            <div className="max-h-[500px] overflow-y-auto">
                              <table className="w-full">
                                <thead className="sticky top-0 bg-muted/50 border-b">
                                  <tr>
                                    <th className="px-4 py-3 text-left text-sm font-medium w-[200px]">Periodo</th>
                                    <th className="px-4 py-3 text-left text-sm font-medium">Nota</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {snapshotsWithNotes.map((item) => (
                                    <tr key={`${item.year}-${item.month}`} className="border-b hover:bg-muted/30">
                                      <td className="px-4 py-3 text-sm font-medium align-top">
                                        {MONTH_NAMES[item.month - 1]} {item.year}
                                      </td>
                                      <td className="px-4 py-3 text-sm text-muted-foreground whitespace-pre-line">
                                        {item.note}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>

                          <div className="mt-4 text-sm text-muted-foreground">
                            {snapshotsWithNotes.length} {snapshotsWithNotes.length === 1 ? 'nota trovata' : 'note trovate'}
                          </div>
                        </>
                      )}
                    </CardContent>
                  </Card>
                );
              })()}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.section>

      {/* ── MILESTONE (DOUBLING TIME) ──────────────────────────────────── */}
      {/* Moved to chapter 2: this is the most distinctive feature of the page */}
      <motion.section
        id="section-milestones"
        variants={chapterReveal}
        initial="hidden"
        animate={visibleChapterSet.has('milestones') ? 'visible' : 'hidden'}
        className="space-y-4 pt-6 border-t border-border/40"
      >
        <div>
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">Milestone</p>
          <h2 className="mt-1 text-lg font-semibold text-foreground">Tempo di raddoppio</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Quanto tempo ha impiegato il tuo patrimonio per raddoppiare nei diversi periodi.
            Ogni milestone rappresenta un traguardo significativo nella tua crescita.
          </p>
        </div>

        <motion.div variants={cardItem} initial="hidden" animate="visible" transition={{ duration: 0.4, ease: [0.25, 1, 0.5, 1] }}>
          <Card>
            <CardHeader>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <CardTitle className="text-lg sm:text-xl">Tempo di Raddoppio Patrimonio</CardTitle>

                {/* Segmented pill: Geometrico / Traguardi */}
                <div
                  role="tablist"
                  className="relative flex items-center gap-0.5 rounded-lg bg-muted p-1 shrink-0"
                >
                  {DOUBLING_MODE_TABS.map((tab) => (
                    <button
                      key={tab.value}
                      role="tab"
                      type="button"
                      aria-selected={doublingMode === tab.value}
                      onClick={() => setDoublingMode(tab.value)}
                      className="relative z-10 flex h-7 flex-1 items-center justify-center rounded-md px-3 text-xs font-medium transition-colors aria-selected:text-foreground aria-[selected=false]:text-muted-foreground"
                    >
                      {doublingMode === tab.value && (
                        <motion.span
                          layoutId="history-doubling-mode"
                          className="absolute inset-0 rounded-md bg-background shadow-sm"
                          transition={{ type: 'spring', stiffness: 400, damping: 35 }}
                        />
                      )}
                      <span className="relative">{tab.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {doublingTimeSummary.totalDoublings === 0 && !doublingTimeSummary.currentDoublingInProgress ? (
                <div className="flex h-32 items-center justify-center text-muted-foreground text-sm">
                  Nessuna milestone ancora completata. Continua a costruire il tuo patrimonio!
                </div>
              ) : (
                <div className="space-y-6">
                  <motion.div
                    key={doublingMode}
                    variants={periodContentSettle}
                    initial="idle"
                    animate="settle"
                    className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground"
                  >
                    <span className="rounded-full border border-border bg-muted/40 px-2.5 py-1 font-medium text-foreground">
                      Lettura {doublingMode === 'geometric' ? 'Geometrica' : 'a Traguardi'}
                    </span>
                    <span className="rounded-full border border-border bg-background px-2.5 py-1">
                      {doublingTimeSummary.totalDoublings} milestone completate
                    </span>
                  </motion.div>

                  <DoublingTimeSummaryCards summary={doublingTimeSummary} doublingMode={doublingMode} />

                  <div>
                    <h3 className="text-sm font-semibold text-foreground mb-3">
                      Storico {doublingMode === 'geometric' ? 'Raddoppi' : 'Traguardi'}
                    </h3>
                    <DoublingMilestoneTimeline
                      milestones={doublingTimeSummary.milestones}
                      currentInProgress={doublingTimeSummary.currentDoublingInProgress}
                    />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* CTA to Allocation page — replaces the removed "Corrente vs Desiderata" section */}
          <div className="mt-3 flex items-center justify-end">
            <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground" asChild>
              <Link href="/dashboard/allocation">Vai all&apos;Allocazione &rarr;</Link>
            </Button>
          </div>
        </motion.div>
      </motion.section>

      {/* ── COMPOSIZIONE ──────────────────────────────────────────────── */}
      <motion.section
        id="section-composition"
        variants={chapterReveal}
        initial="hidden"
        animate={visibleChapterSet.has('composition') ? 'visible' : 'hidden'}
        className="space-y-4 pt-6 border-t border-border/40"
      >
        <div>
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">Composizione</p>
          <h2 className="mt-1 text-lg font-semibold text-foreground">Asset class e liquidità</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Come si distribuisce il patrimonio tra le classi di investimento e quanto rimane liquido.
          </p>
        </div>

        <div className="space-y-4">
          {/* Asset Class Evolution Chart */}
          <motion.div variants={cardItem} initial="hidden" animate="visible" transition={{ duration: 0.4, ease: [0.25, 1, 0.5, 1] }}>
            <Card>
              <CardHeader>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <CardTitle className="text-lg sm:text-xl">Patrimonio per Asset Class</CardTitle>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowAssetClassPercentage(!showAssetClassPercentage)}
                    className="w-full sm:w-auto text-xs sm:text-sm"
                  >
                    {showAssetClassPercentage ? '€ Valori Assoluti' : '% Percentuali'}
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {assetClassHistory.length === 0 ? (
                  <div className="flex h-64 items-center justify-center text-muted-foreground text-sm">
                    Nessuno storico disponibile.
                  </div>
                ) : (
                  <AnimatePresence mode="wait" initial={false}>
                    <motion.div
                      key={showAssetClassPercentage ? 'ac-pct' : 'ac-abs'}
                      variants={tabPanelSwitch}
                      initial="hidden"
                      animate="visible"
                      exit="hidden"
                    >
                      <ResponsiveContainer key={isLandscape ? 'landscape' : 'portrait'} width="100%" height={getChartHeight()} id="chart-asset-class-evolution">
                        {showAssetClassPercentage ? (
                          <LineChart data={assetClassHistory} margin={getChartMargins()}>
                            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" strokeOpacity={0.6} />
                            <XAxis dataKey="date" />
                            <YAxis width={getYAxisWidth()} tickFormatter={(v) => `${v.toFixed(0)}%`} domain={[0, 100]} />
                            <Tooltip
                              formatter={(v) => `${(v as number).toFixed(2)}%`}
                              {...tooltipStyle}
                              cursor={{ fill: 'rgba(128,128,128,0.1)' }}
                            />
                            <Legend wrapperStyle={{ display: isMobile ? 'none' : 'block', paddingTop: '20px' }} iconSize={10} fontSize={12} />
                            <Line type="monotone" dataKey="equityPercentage" stroke={acColors.equity} strokeWidth={2} name="Azioni" dot={{ r: 4 }} animationDuration={800} animationEasing="ease-out" label={false} />
                            <Line type="monotone" dataKey="bondsPercentage" stroke={acColors.bonds} strokeWidth={2} name="Obbligazioni" dot={{ r: 4 }} animationDuration={800} animationEasing="ease-out" label={false} />
                            <Line type="monotone" dataKey="cryptoPercentage" stroke={acColors.crypto} strokeWidth={2} name="Criptovalute" dot={{ r: 4 }} animationDuration={800} animationEasing="ease-out" label={false} />
                            <Line type="monotone" dataKey="realestatePercentage" stroke={acColors.realestate} strokeWidth={2} name="Immobili" dot={{ r: 4 }} animationDuration={800} animationEasing="ease-out" label={false} />
                            <Line type="monotone" dataKey="cashPercentage" stroke={acColors.cash} strokeWidth={2} name="Liquidità" dot={{ r: 4 }} animationDuration={800} animationEasing="ease-out" label={false} />
                            <Line type="monotone" dataKey="commodityPercentage" stroke={acColors.commodity} strokeWidth={2} name="Materie Prime" dot={{ r: 4 }} animationDuration={800} animationEasing="ease-out" label={false} />
                          </LineChart>
                        ) : (
                          <AreaChart data={assetClassHistory} margin={getChartMargins()}>
                            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" strokeOpacity={0.6} />
                            <XAxis dataKey="date" />
                            <YAxis width={getYAxisWidth()} tickFormatter={(v) => formatCurrencyCompact(v)} />
                            <Tooltip formatter={(v) => formatCurrency(v as number)} {...tooltipStyle} cursor={{ fill: 'rgba(128,128,128,0.1)' }} />
                            <Legend wrapperStyle={{ display: isMobile ? 'none' : 'block', paddingTop: '20px' }} iconSize={10} fontSize={12} />
                            <Area type="monotone" dataKey="equity" stroke={acColors.equity} fill={acColors.equity} fillOpacity={0.8} name="Azioni" animationDuration={800} animationEasing="ease-out" label={false} />
                            <Area type="monotone" dataKey="bonds" stroke={acColors.bonds} fill={acColors.bonds} fillOpacity={0.8} name="Obbligazioni" animationDuration={800} animationEasing="ease-out" label={false} />
                            <Area type="monotone" dataKey="crypto" stroke={acColors.crypto} fill={acColors.crypto} fillOpacity={0.8} name="Criptovalute" animationDuration={800} animationEasing="ease-out" label={false} />
                            <Area type="monotone" dataKey="realestate" stroke={acColors.realestate} fill={acColors.realestate} fillOpacity={0.8} name="Immobili" animationDuration={800} animationEasing="ease-out" label={false} />
                            <Area type="monotone" dataKey="cash" stroke={acColors.cash} fill={acColors.cash} fillOpacity={0.8} name="Liquidità" animationDuration={800} animationEasing="ease-out" label={false} />
                            <Area type="monotone" dataKey="commodity" stroke={acColors.commodity} fill={acColors.commodity} fillOpacity={0.8} name="Materie Prime" animationDuration={800} animationEasing="ease-out" label={false} />
                          </AreaChart>
                        )}
                      </ResponsiveContainer>

                      {/* Mobile inline legend — replaces hidden Recharts legend on narrow screens */}
                      {isMobile && (
                        <div className="flex flex-wrap gap-x-3 gap-y-1.5 mt-3 px-1">
                          {(Object.entries(acColors) as [string, string][]).map(([key, color]) => {
                            const labels: Record<string, string> = {
                              equity: 'Azioni',
                              bonds: 'Obblig.',
                              crypto: 'Crypto',
                              realestate: 'Immobili',
                              cash: 'Liquidità',
                              commodity: 'Commodity',
                            };
                            return (
                              <div key={key} className="flex items-center gap-1.5">
                                <span className="h-2 w-2 rounded-full shrink-0" style={{ background: color }} />
                                <span className="text-xs text-muted-foreground">{labels[key]}</span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </motion.div>
                  </AnimatePresence>
                )}
              </CardContent>
            </Card>
          </motion.div>

          {/* Liquidity Evolution Chart */}
          <motion.div variants={cardItem} initial="hidden" animate="visible" transition={{ duration: 0.4, ease: [0.25, 1, 0.5, 1], delay: 0.1 }}>
            <Card>
              <CardHeader>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <CardTitle className="text-lg sm:text-xl">Liquidità vs Illiquidità</CardTitle>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowLiquidityPercentage(!showLiquidityPercentage)}
                    className="w-full sm:w-auto text-xs sm:text-sm"
                  >
                    {showLiquidityPercentage ? '€ Valori Assoluti' : '% Percentuali'}
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {netWorthHistory.length === 0 ? (
                  <div className="flex h-64 items-center justify-center text-muted-foreground text-sm">
                    Nessuno storico disponibile.
                  </div>
                ) : (
                  <AnimatePresence mode="wait" initial={false}>
                    <motion.div
                      key={showLiquidityPercentage ? 'liq-pct' : 'liq-abs'}
                      variants={tabPanelSwitch}
                      initial="hidden"
                      animate="visible"
                      exit="hidden"
                    >
                      <ResponsiveContainer key={isLandscape ? 'landscape' : 'portrait'} width="100%" height={getChartHeight()} id="chart-liquidity">
                        {showLiquidityPercentage ? (
                          <LineChart data={liquidityHistory} margin={getChartMargins()}>
                            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" strokeOpacity={0.6} />
                            <XAxis dataKey="date" />
                            <YAxis width={getYAxisWidth()} tickFormatter={(v) => `${v.toFixed(0)}%`} domain={[0, 100]} />
                            <Tooltip formatter={(v) => `${(v as number).toFixed(2)}%`} {...tooltipStyle} cursor={{ fill: 'rgba(128,128,128,0.1)' }} />
                            <Legend wrapperStyle={{ display: isMobile ? 'none' : 'block', paddingTop: '20px' }} iconSize={10} fontSize={12} />
                            <Line type="monotone" dataKey="liquidPercentage" stroke={chartColors[0]} strokeWidth={2} name="Liquido" dot={{ r: 4 }} animationDuration={800} animationEasing="ease-out" label={false} />
                            <Line type="monotone" dataKey="illiquidPercentage" stroke={chartColors[2]} strokeWidth={2} name="Illiquido" dot={{ r: 4 }} animationDuration={800} animationEasing="ease-out" label={false} />
                          </LineChart>
                        ) : (
                          <AreaChart data={liquidityHistory} margin={getChartMargins()}>
                            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" strokeOpacity={0.6} />
                            <XAxis dataKey="date" />
                            <YAxis
                              width={getYAxisWidth()}
                              tickFormatter={(v) => formatCurrencyCompact(v)}
                              domain={[(dataMin: number) => dataMin * 0.95, (dataMax: number) => dataMax * 1.05]}
                            />
                            <Tooltip formatter={(v) => formatCurrency(v as number)} {...tooltipStyle} cursor={{ fill: 'rgba(128,128,128,0.1)' }} />
                            <Legend wrapperStyle={{ display: isMobile ? 'none' : 'block', paddingTop: '20px' }} iconSize={10} fontSize={12} />
                            <Area type="monotone" dataKey="liquidNetWorth" stroke={chartColors[0]} fill={chartColors[0]} fillOpacity={0.6} name="Liquido" animationDuration={800} animationEasing="ease-out" label={false} />
                            <Area type="monotone" dataKey="illiquidNetWorth" stroke={chartColors[2]} fill={chartColors[2]} fillOpacity={0.6} name="Illiquido" animationDuration={800} animationEasing="ease-out" label={false} />
                          </AreaChart>
                        )}
                      </ResponsiveContainer>

                      {isMobile && (
                        <div className="flex flex-wrap gap-x-3 gap-y-1.5 mt-3 px-1">
                          <div className="flex items-center gap-1.5">
                            <span className="h-2 w-2 rounded-full shrink-0" style={{ background: chartColors[0] }} />
                            <span className="text-xs text-muted-foreground">Liquido</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className="h-2 w-2 rounded-full shrink-0" style={{ background: chartColors[2] }} />
                            <span className="text-xs text-muted-foreground">Illiquido</span>
                          </div>
                        </div>
                      )}
                    </motion.div>
                  </AnimatePresence>
                )}
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </motion.section>

      {/* ── DRIVER DELLA CRESCITA ─────────────────────────────────────── */}
      <motion.section
        id="section-drivers"
        variants={chapterReveal}
        initial="hidden"
        animate={visibleChapterSet.has('drivers') ? 'visible' : 'hidden'}
        className="space-y-4 pt-6 border-t border-border/40"
      >
        <div>
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">Driver della crescita</p>
          <h2 className="mt-1 text-lg font-semibold text-foreground">Risparmio vs investimenti</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Separa il contributo del risparmio da quello del mercato. Aggiunge la lettura lavoro vs investimenti quando configurata.
          </p>
        </div>

        <div className="space-y-4">
          {/* Savings vs Investment Growth Chart */}
          <motion.div variants={cardItem} initial="hidden" animate="visible" transition={{ duration: 0.4, ease: [0.25, 1, 0.5, 1] }}>
            <Card>
              <CardHeader>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="space-y-2">
                    <CardTitle className="text-lg sm:text-xl">Risparmio vs Crescita Investimenti</CardTitle>
                    <motion.div
                      key={`${savingsView}-${savingsSelectedYear}`}
                      variants={periodContentSettle}
                      initial="idle"
                      animate="settle"
                      className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground"
                    >
                      <span className="rounded-full border border-border bg-muted/40 px-2.5 py-1 font-medium text-foreground">
                        Modalità {savingsViewLabel}
                      </span>
                      <span className="rounded-full border border-border bg-background px-2.5 py-1">
                        {savingsScopeLabel}
                      </span>
                    </motion.div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {/* Segmented pill: Annuale / Mensile */}
                    <div
                      role="tablist"
                      className="relative flex items-center gap-0.5 rounded-lg bg-muted p-1"
                    >
                      {SAVINGS_VIEW_TABS.map((tab) => (
                        <button
                          key={tab.value}
                          role="tab"
                          type="button"
                          aria-selected={savingsView === tab.value}
                          onClick={() => setSavingsView(tab.value)}
                          className="relative z-10 flex h-7 flex-1 items-center justify-center rounded-md px-3 text-xs font-medium transition-colors aria-selected:text-foreground aria-[selected=false]:text-muted-foreground"
                        >
                          {savingsView === tab.value && (
                            <motion.span
                              layoutId="history-savings-view"
                              className="absolute inset-0 rounded-md bg-background shadow-sm"
                              transition={{ type: 'spring', stiffness: 400, damping: 35 }}
                            />
                          )}
                          <span className="relative">{tab.label}</span>
                        </button>
                      ))}
                    </div>

                    {/* Year selector — only in monthly view */}
                    {savingsView === 'monthly' && savingsAvailableYears.length > 0 && (
                      <Select
                        value={savingsSelectedYear.toString()}
                        onValueChange={(v) => setSavingsSelectedYear(v === 'all' ? 'all' : Number(v))}
                      >
                        <SelectTrigger className="w-28 h-8 text-xs sm:text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Tutti</SelectItem>
                          {savingsAvailableYears.map((year) => (
                            <SelectItem key={year} value={year.toString()}>{year}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <AnimatePresence mode="wait" initial={false}>
                  <motion.div
                    key={`${savingsView}-${savingsSelectedYear}`}
                    variants={tabPanelSwitch}
                    initial="hidden"
                    animate="visible"
                    exit="hidden"
                  >
                    {savingsView === 'annual' ? (
                      savingsVsInvestmentData.length === 0 ? (
                        <div className="flex h-64 items-center justify-center text-muted-foreground text-sm">
                          Dati insufficienti. Servono snapshot e transazioni cashflow per ogni anno.
                        </div>
                      ) : (
                        <motion.div variants={chartShellSettle} initial="idle" animate="settle">
                          <ResponsiveContainer width="100%" height={getChartHeight()} id="chart-savings-vs-investment">
                            <BarChart data={savingsVsInvestmentData} margin={getChartMargins()}>
                              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" strokeOpacity={0.6} />
                              <XAxis dataKey="year" />
                              <YAxis width={getYAxisWidth()} tickFormatter={(v) => formatCurrencyCompact(v)} />
                              <Tooltip formatter={(v, name) => [formatCurrency(v as number), name]} {...tooltipStyle} cursor={{ fill: 'rgba(128,128,128,0.1)' }} />
                              <Legend wrapperStyle={{ display: isMobile ? 'none' : 'block', paddingTop: '20px' }} iconSize={10} fontSize={12} />
                              <Bar dataKey="netSavings" name="Risparmio Netto" fill={chartColors[1] || '#10B981'} stackId="a" animationDuration={600} animationEasing="ease-out" />
                              {/* fill sets legend color; Cell overrides individual bar color based on sign */}
                              <Bar dataKey="investmentGrowth" name="Crescita Investimenti" fill={chartColors[0] || '#3B82F6'} stackId="a" animationDuration={600} animationEasing="ease-out">
                                {savingsVsInvestmentData.map((entry, index) => (
                                  <Cell key={`cell-${index}`} fill={entry.investmentGrowth >= 0 ? (chartColors[0] || '#3B82F6') : '#EF4444'} />
                                ))}
                              </Bar>
                            </BarChart>
                          </ResponsiveContainer>
                          {isMobile && (
                            <div className="flex flex-wrap gap-x-3 gap-y-1.5 mt-3 px-1">
                              <div className="flex items-center gap-1.5">
                                <span className="h-2 w-2 rounded-full shrink-0" style={{ background: chartColors[1] || '#10B981' }} />
                                <span className="text-xs text-muted-foreground">Risparmio</span>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <span className="h-2 w-2 rounded-full shrink-0" style={{ background: chartColors[0] || '#3B82F6' }} />
                                <span className="text-xs text-muted-foreground">Investimenti</span>
                              </div>
                            </div>
                          )}
                        </motion.div>
                      )
                    ) : (
                      (() => {
                        const monthlyData =
                          savingsSelectedYear === 'all'
                            ? savingsVsInvestmentDataAllMonths
                            : savingsVsInvestmentDataMonthly;
                        return monthlyData.length === 0 ? (
                          <div className="flex h-64 items-center justify-center text-muted-foreground text-sm">
                            Nessun dato per la selezione corrente.
                          </div>
                        ) : (
                          <motion.div variants={chartShellSettle} initial="idle" animate="settle">
                            <ResponsiveContainer width="100%" height={getChartHeight()} id="chart-savings-vs-investment-monthly">
                              <BarChart data={monthlyData} margin={getChartMargins()}>
                                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" strokeOpacity={0.6} />
                                <XAxis dataKey="period" tick={{ fontSize: savingsSelectedYear === 'all' ? 10 : 12 }} />
                                <YAxis width={getYAxisWidth()} tickFormatter={(v) => formatCurrencyCompact(v)} />
                                <Tooltip formatter={(v, name) => [formatCurrency(v as number), name]} {...tooltipStyle} cursor={{ fill: 'rgba(128,128,128,0.1)' }} />
                                <Legend wrapperStyle={{ display: isMobile ? 'none' : 'block', paddingTop: '20px' }} iconSize={10} fontSize={12} />
                                <Bar dataKey="netSavings" name="Risparmio Netto" fill={chartColors[1] || '#10B981'} stackId="a" animationDuration={600} animationEasing="ease-out" />
                                <Bar dataKey="investmentGrowth" name="Crescita Investimenti" fill={chartColors[0] || '#3B82F6'} stackId="a" animationDuration={600} animationEasing="ease-out">
                                  {monthlyData.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={entry.investmentGrowth >= 0 ? (chartColors[0] || '#3B82F6') : '#EF4444'} />
                                  ))}
                                </Bar>
                              </BarChart>
                            </ResponsiveContainer>
                          </motion.div>
                        );
                      })()
                    )}
                  </motion.div>
                </AnimatePresence>
              </CardContent>
            </Card>
          </motion.div>

          {/* Lavoro & Investimenti — flat divide-y rows (Trade Republic hierarchy) */}
          <motion.div variants={cardItem} initial="hidden" animate="visible" transition={{ duration: 0.4, ease: [0.25, 1, 0.5, 1], delay: 0.1 }}>
            {laborIncomeMetrics ? (
              <Card className="overflow-hidden">
                {/* Plain div header — avoids CardHeader flex-col breaking inner layout */}
                <div className="px-6 pt-5 pb-3 border-b border-border">
                  <h3 className="text-base font-semibold text-foreground">Lavoro &amp; Investimenti</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Risparmiato da lavoro = entrate "reddito da lavoro" meno tutte le spese.
                    Dividendi e affitti non rientrano nel risparmio.
                  </p>
                </div>

                {/* Flat divide-y KPI rows */}
                <div className="divide-y divide-border">
                  <div className="flex items-center justify-between px-6 py-3.5">
                    <div className="flex items-center gap-3 min-w-0">
                      <Briefcase className="h-4 w-4 shrink-0 text-muted-foreground/50" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground">Guadagnato da Lavoro</p>
                        <p className="text-xs text-muted-foreground">Dal {laborIncomeMetrics.startYear}</p>
                      </div>
                    </div>
                    <p className="text-base font-bold font-mono tabular-nums text-primary shrink-0 ml-4">
                      {formatCurrency(laborIncomeMetrics.totalLaborIncome)}
                    </p>
                  </div>

                  <div className="flex items-center justify-between px-6 py-3.5">
                    <div className="flex items-center gap-3 min-w-0">
                      <PiggyBank className={cn('h-4 w-4 shrink-0', laborIncomeMetrics.totalSavedFromWork >= 0 ? 'text-green-500 dark:text-green-400' : 'text-red-500 dark:text-red-400')} />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground">Risparmiato da Lavoro</p>
                        <p className="text-xs text-muted-foreground">
                          Dal {laborIncomeMetrics.startYear} &middot; Spese: {formatCurrency(laborIncomeMetrics.totalExpensesSum)}
                        </p>
                      </div>
                    </div>
                    <p className={cn('text-base font-bold font-mono tabular-nums shrink-0 ml-4', laborIncomeMetrics.totalSavedFromWork >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400')}>
                      {laborIncomeMetrics.totalSavedFromWork >= 0 ? '+' : ''}{formatCurrency(laborIncomeMetrics.totalSavedFromWork)}
                    </p>
                  </div>

                  <div className="flex items-center justify-between px-6 py-3.5">
                    <div className="flex items-center gap-3 min-w-0">
                      {laborIncomeMetrics.totalInvestmentGrowthGross >= 0
                        ? <TrendingUp className="h-4 w-4 shrink-0 text-green-500 dark:text-green-400" />
                        : <TrendingDown className="h-4 w-4 shrink-0 text-red-500 dark:text-red-400" />}
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground">Crescita Investimenti (Lordo)</p>
                        <p className="text-xs text-muted-foreground">Dal {laborIncomeMetrics.startYear}</p>
                      </div>
                    </div>
                    <p className={cn('text-base font-bold font-mono tabular-nums shrink-0 ml-4', laborIncomeMetrics.totalInvestmentGrowthGross >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400')}>
                      {laborIncomeMetrics.totalInvestmentGrowthGross >= 0 ? '+' : ''}{formatCurrency(laborIncomeMetrics.totalInvestmentGrowthGross)}
                    </p>
                  </div>

                  <div className="flex items-center justify-between px-6 py-3.5">
                    <div className="flex items-center gap-3 min-w-0">
                      {laborIncomeMetrics.totalInvestmentGrowthNet >= 0
                        ? <TrendingUp className="h-4 w-4 shrink-0 text-green-500 dark:text-green-400" />
                        : <TrendingDown className="h-4 w-4 shrink-0 text-red-500 dark:text-red-400" />}
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground">Crescita Investimenti (Netto)</p>
                        <p className="text-xs text-muted-foreground">Dal {laborIncomeMetrics.startYear} &middot; al netto tasse stimate</p>
                      </div>
                    </div>
                    <p className={cn('text-base font-bold font-mono tabular-nums shrink-0 ml-4', laborIncomeMetrics.totalInvestmentGrowthNet >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400')}>
                      {laborIncomeMetrics.totalInvestmentGrowthNet >= 0 ? '+' : ''}{formatCurrency(laborIncomeMetrics.totalInvestmentGrowthNet)}
                    </p>
                  </div>

                  <div className="flex items-center justify-between px-6 py-3.5">
                    <div className="flex items-center gap-3 min-w-0">
                      <TrendingUp className="h-4 w-4 shrink-0 text-green-500 dark:text-green-400" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground">Mesi in Positivo</p>
                        <p className="text-xs text-muted-foreground">Dal {laborIncomeMetrics.startYear} &middot; patrimonio in crescita</p>
                      </div>
                    </div>
                    <p className="text-base font-bold font-mono tabular-nums text-green-600 dark:text-green-400 shrink-0 ml-4">
                      {laborMonthCounts.positiveMonths}
                    </p>
                  </div>

                  <div className="flex items-center justify-between px-6 py-3.5">
                    <div className="flex items-center gap-3 min-w-0">
                      <TrendingDown className="h-4 w-4 shrink-0 text-red-500 dark:text-red-400" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground">Mesi in Negativo</p>
                        <p className="text-xs text-muted-foreground">Dal {laborIncomeMetrics.startYear} &middot; patrimonio in calo</p>
                      </div>
                    </div>
                    <p className="text-base font-bold font-mono tabular-nums text-red-600 dark:text-red-400 shrink-0 ml-4">
                      {laborMonthCounts.negativeMonths}
                    </p>
                  </div>
                </div>

                {/* Monthly breakdown chart below the flat rows */}
                {laborMetricsChartData.length > 0 && (
                  <div className="border-t border-border px-6 pt-4 pb-2">
                    <motion.div variants={chartShellSettle} initial="idle" animate="settle">
                      <LaborMetricsChart data={laborMetricsChartData} isMobile={isMobile} />
                    </motion.div>
                  </div>
                )}
              </Card>
            ) : (
              // Empty state — shown when laborIncomeCategoryIds is not configured in Settings
              <Card>
                <CardContent className="py-12 text-center">
                  <Briefcase className="mx-auto h-8 w-8 text-muted-foreground/30 mb-3" />
                  <p className="text-sm font-medium text-foreground">Analisi lavoro non configurata</p>
                  <p className="mt-1 text-xs text-muted-foreground max-w-sm mx-auto">
                    Configura le categorie "Reddito da Lavoro" in Impostazioni per vedere
                    quanto hai guadagnato, risparmiato e quanto ha contribuito il mercato.
                  </p>
                  <Button variant="outline" size="sm" className="mt-4" asChild>
                    <Link href="/dashboard/settings">
                      <Settings className="h-3.5 w-3.5 mr-1.5" />
                      Configura in Impostazioni
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            )}
          </motion.div>
        </div>
      </motion.section>

      {/* ── APPENDICE (collapsible, default chiusa) ───────────────────── */}
      {/* Contains YoY variation chart + raw snapshot grid */}
      <div className="pt-6 border-t border-border/40">
        <Collapsible open={snapshotsOpen} onOpenChange={setSnapshotsOpen}>
          <CollapsibleTrigger asChild>
            <div className="group flex cursor-pointer select-none items-center justify-between pb-2">
              <div>
                <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">Appendice</p>
                <h2 className="mt-1 text-lg font-semibold text-foreground">Storico YoY e dati grezzi</h2>
              </div>
              <ChevronDown className="h-5 w-5 text-muted-foreground transition-transform duration-200 motion-reduce:transition-none group-data-[state=open]:rotate-180" />
            </div>
          </CollapsibleTrigger>

          <CollapsibleContent>
            <div className="space-y-4 mt-4">
              {/* YoY Variation Chart */}
              <Card>
                <CardHeader>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <CardTitle className="text-lg sm:text-xl">Variazione Anno su Anno</CardTitle>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowYoYPercentage(!showYoYPercentage)}
                      className="w-full sm:w-auto text-xs sm:text-sm"
                    >
                      {showYoYPercentage ? '€ Valori Assoluti' : '% Percentuali'}
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {yoyVariationData.length === 0 ? (
                    <div className="flex h-64 items-center justify-center text-muted-foreground text-sm">
                      Nessuno storico disponibile.
                    </div>
                  ) : (
                    <AnimatePresence mode="wait" initial={false}>
                      <motion.div
                        key={showYoYPercentage ? 'yoy-pct' : 'yoy-abs'}
                        variants={tabPanelSwitch}
                        initial="hidden"
                        animate="visible"
                        exit="hidden"
                      >
                        <ResponsiveContainer width="100%" height={getChartHeight()} id="chart-yoy-variation">
                          <BarChart data={yoyVariationData} margin={getChartMargins()}>
                            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" strokeOpacity={0.6} />
                            <XAxis dataKey="year" />
                            <YAxis
                              width={getYAxisWidth()}
                              tickFormatter={(v) => showYoYPercentage ? `${v.toFixed(0)}%` : formatCurrencyCompact(v)}
                            />
                            <Tooltip
                              formatter={(v, name) => {
                                const num = v as number;
                                if (name === 'Variazione') return showYoYPercentage ? `${num.toFixed(2)}%` : formatCurrency(num);
                                return formatCurrency(num);
                              }}
                              {...tooltipStyle}
                              cursor={{ fill: 'rgba(128,128,128,0.1)' }}
                            />
                            <Bar
                              dataKey={showYoYPercentage ? 'variationPercentage' : 'variation'}
                              name="Variazione"
                              fill={chartColors[0]}
                              animationDuration={600}
                              animationEasing="ease-out"
                            >
                              {yoyVariationData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.variation >= 0 ? '#10B981' : '#EF4444'} />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </motion.div>
                    </AnimatePresence>
                  )}
                </CardContent>
              </Card>

              {/* Raw Snapshot Grid */}
              {snapshots.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle>Snapshot Mensili</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <motion.div
                      variants={staggerContainer}
                      initial="hidden"
                      animate="visible"
                      className={cn(
                        'grid gap-4',
                        isLandscape ? 'grid-cols-2' : 'grid-cols-1',
                        'desktop:grid-cols-3'
                      )}
                    >
                      {snapshots.slice(-6).reverse().map((snapshot) => (
                        <motion.div
                          key={`${snapshot.year}-${snapshot.month}`}
                          variants={cardItem}
                          className="rounded-lg border p-4"
                        >
                          <div>
                            <div className="text-base font-semibold text-foreground">
                              {MONTH_NAMES[snapshot.month - 1]} {snapshot.year}
                            </div>
                            <div className="text-xs text-muted-foreground mt-1">
                              Creato il:{' '}
                              {snapshot.createdAt.toLocaleString('it-IT', {
                                day: '2-digit',
                                month: '2-digit',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </div>
                          </div>
                          <div className="mt-3">
                            <div className="text-lg font-bold font-mono tabular-nums text-foreground">
                              {formatCurrency(snapshot.totalNetWorth)}
                            </div>
                            <div className="text-sm text-muted-foreground">
                              Liquido: {formatCurrency(snapshot.liquidNetWorth)}
                            </div>
                          </div>
                          {snapshot.note && (
                            <div className="mt-3 pt-3 border-t">
                              <div className="text-xs text-amber-600 dark:text-amber-400 font-medium mb-1 flex items-center gap-1">
                                <MessageSquare className="h-3 w-3" />
                                Nota:
                              </div>
                              <div className="text-sm text-muted-foreground whitespace-pre-line">
                                {snapshot.note.length > 100 ? snapshot.note.substring(0, 100) + '...' : snapshot.note}
                              </div>
                            </div>
                          )}
                        </motion.div>
                      ))}
                    </motion.div>
                  </CardContent>
                </Card>
              )}
            </div>
          </CollapsibleContent>
        </Collapsible>
      </div>

      <CreateManualSnapshotModal
        open={showManualSnapshotModal}
        onOpenChange={setShowManualSnapshotModal}
        userId={user?.uid || ''}
        onSuccess={loadData}
      />

      <SnapshotSearchDialog
        open={snapshotSearchDialogOpen}
        onOpenChange={setSnapshotSearchDialogOpen}
        snapshots={displaySnapshots}
        onSave={handleSaveNote}
      />
    </div>
  );
}
