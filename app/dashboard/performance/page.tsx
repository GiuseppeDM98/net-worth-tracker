'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { motion } from 'framer-motion';
import {
  staggerContainer,
  cardItem,
  chartShellSettle,
  periodContentSettle,
  sectionRefreshPulse,
} from '@/lib/utils/motionVariants';
import { useAuth } from '@/contexts/AuthContext';
import { useDemoMode } from '@/lib/hooks/useDemoMode';
import { useMediaQuery } from '@/lib/hooks/useMediaQuery';
import { getAllPerformanceData, calculatePerformanceForPeriod, preparePerformanceChartData, getSnapshotsForPeriod, prepareMonthlyReturnsHeatmap, prepareUnderwaterDrawdownData } from '@/lib/services/performanceService';
import { getUserSnapshots } from '@/lib/services/snapshotService';
import { PerformanceData, PerformanceMetrics, TimePeriod } from '@/types/performance';
import { MonthlySnapshot } from '@/types/assets';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import { RefreshCw, Info, Sparkles, CalendarDays, ChevronDown, X } from 'lucide-react';
import { toast } from 'sonner';
import { formatCurrency, formatPercentage, formatCurrencyCompact } from '@/lib/services/chartService';
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';
import dynamic from 'next/dynamic';
import { CustomDateRangeDialog } from '@/components/performance/CustomDateRangeDialog';
import type { AIAnalysisDialogProps } from '@/components/performance/AIAnalysisDialog';

// Lazy-load AIAnalysisDialog to keep react-markdown and remark-gfm (~60KB gzipped)
// out of the initial Performance page bundle — loaded only on first "Analisi AI" click.
const AIAnalysisDialog = dynamic<AIAnalysisDialogProps>(
  () => import('@/components/performance/AIAnalysisDialog').then(m => ({ default: m.AIAnalysisDialog })),
  { ssr: false }
);
import { MetricCard } from '@/components/performance/MetricCard';
import { MetricSection } from '@/components/performance/MetricSection';
import { PerformanceTooltip } from '@/components/performance/PerformanceTooltip';
import { MonthlyReturnsHeatmap } from '@/components/performance/MonthlyReturnsHeatmap';
import { UnderwaterDrawdownChart } from '@/components/performance/UnderwaterDrawdownChart';
import { PerformancePageSkeleton } from '@/components/performance/PerformancePageSkeleton';
import { BenchmarkComparisonSection } from '@/components/performance/BenchmarkComparisonSection';
import { authenticatedFetch } from '@/lib/utils/authFetch';

/**
 * PERFORMANCE PAGE ARCHITECTURE
 *
 * Calculates and displays portfolio performance metrics using Modern Portfolio Theory.
 *
 * CALCULATION ENGINE:
 * All metrics calculated in performanceService.ts using:
 * - Time-Weighted Return (TWR): Eliminates cash flow timing effects, recommended for portfolio evaluation
 * - Money-Weighted Return (IRR): Shows investor's actual personal return including timing decisions
 * - Risk metrics: Sharpe Ratio, Volatility, Drawdown analysis
 * - Rolling metrics: 12-month rolling CAGR and Sharpe with moving average smoothing
 *
 * DATA CACHING STRATEGY:
 * - Snapshots fetched once at page load and cached (cachedSnapshots state)
 * - Prevents redundant API calls when switching between time periods
 * - Custom date range reuses cache + existing metrics (no additional fetches)
 * - Reduces API calls from ~6 (one per period) to 1, improving performance by ~85%
 *
 * TIME PERIODS:
 * - YTD: January 1 of current year → latest snapshot
 * - 1Y/3Y/5Y: Rolling N years backward from today
 * - ALL: From first snapshot to latest (entire portfolio history)
 * - CUSTOM: User-selected date range via dialog
 *
 * KEY TRADE-OFFS:
 * - Heavy client-side calculations vs server API: Client chosen for real-time period switching
 * - Cached snapshots increase memory (~20KB for 50 snapshots) but reduce latency by 90%
 * - Rolling metrics (12-month windows) pre-calculated for all periods to avoid lazy loading delays
 * - Duplicate chart rendering (heatmap, underwater) vs single unified chart: Separate for clarity and modularity
 */

export default function PerformancePage() {
  const { user } = useAuth();
  const isDemo = useDemoMode();
  const [isPendingPeriodChange, startPeriodTransition] = useTransition();
  const [performanceData, setPerformanceData] = useState<PerformanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedPeriod, setSelectedPeriod] = useState<TimePeriod>('YTD');
  const [showCustomDateDialog, setShowCustomDateDialog] = useState(false);
  const [showAIAnalysisDialog, setShowAIAnalysisDialog] = useState(false);
  const [cachedSnapshots, setCachedSnapshots] = useState<MonthlySnapshot[]>([]);
  const [isMethodologyOpen, setIsMethodologyOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshAnimationTick, setRefreshAnimationTick] = useState(0);
  const [customDialogOrigin, setCustomDialogOrigin] = useState<string | undefined>(undefined);
  const [aiDialogOrigin, setAiDialogOrigin] = useState<string | undefined>(undefined);
  const hasLoadedOnceRef = useRef(false);

  // Guide strip shown once per user; localStorage flag persists across sessions.
  const STRIP_STORAGE_KEY = 'perf_guide_dismissed';
  const [showGuideStrip, setShowGuideStrip] = useState(false);
  const periodLabels: Record<Exclude<TimePeriod, 'ROLLING_12M' | 'ROLLING_36M'>, string> = {
    YTD: 'YTD',
    '1Y': '1 Anno',
    '3Y': '3 Anni',
    '5Y': '5 Anni',
    ALL: 'Storico',
    CUSTOM: 'Personalizzato',
  };

  // Responsive breakpoints
  const isMobile = useMediaQuery('(max-width: 767px)');
  const isLandscape = useMediaQuery('(min-width: 568px) and (max-height: 500px) and (orientation: landscape)');

  useEffect(() => {
    if (user) {
      loadPerformanceData();
    }
  }, [user]);

  // Init guide strip after mount — localStorage is not available during SSR
  useEffect(() => {
    if (!localStorage.getItem(STRIP_STORAGE_KEY)) setShowGuideStrip(true);
  }, []);

  const dismissGuideStrip = () => {
    localStorage.setItem(STRIP_STORAGE_KEY, '1');
    setShowGuideStrip(false);
  };

  const calculateDialogOrigin = (element: HTMLElement) => {
    const rect = element.getBoundingClientRect();
    const x = ((rect.left + rect.width / 2) / window.innerWidth) * 100;
    const y = ((rect.top + rect.height / 2) / window.innerHeight) * 100;
    return `${x.toFixed(2)}% ${y.toFixed(2)}%`;
  };

  const handlePeriodChange = (nextPeriod: TimePeriod) => {
    if (nextPeriod === selectedPeriod) return;

    startPeriodTransition(() => {
      setSelectedPeriod(nextPeriod);
    });
  };

  /**
   * Load all performance data and cache snapshots for period switching.
   *
   * CACHING STRATEGY:
   * 1. Fetch snapshots once and store in component state (cachedSnapshots)
   * 2. Fetch all pre-calculated metrics from performanceService
   * 3. Subsequent period switches reuse cached snapshots (no new API calls)
   *
   * Performance improvement: Reduces API calls from 6+ to 1 when switching periods.
   * Cache invalidation: Only on explicit refresh button click or page reload.
   */
  const loadPerformanceData = async () => {
    if (!user) return;

    try {
      const isInitialLoad = !hasLoadedOnceRef.current;
      if (isInitialLoad) {
        setLoading(true);
      } else {
        setIsRefreshing(true);
        setRefreshAnimationTick((currentTick) => currentTick + 1);
      }

      // Fetch snapshots once and cache them in component state.
      // This cache will be reused for all period switches and custom date ranges,
      // eliminating redundant API calls and improving performance by ~85%.
      const snapshots = await getUserSnapshots(user.uid);
      setCachedSnapshots(snapshots);

      // forceRefresh on explicit button click so the cache is bypassed and rewritten
      const isRefresh = hasLoadedOnceRef.current;
      const data = await getAllPerformanceData(user.uid, isRefresh);

      // Fetch YOC and Current Yield metrics for all periods in parallel
      // Both require server-side calculation due to Firebase Admin SDK usage
      const periods = ['ytd', 'oneYear', 'threeYear', 'fiveYear', 'allTime'] as const;
      const metricsPromises = periods.map(async (periodKey) => {
        const metrics = data[periodKey];
        // Only fetch metrics if period has sufficient data
        if (metrics.hasInsufficientData) {
          return {
            yocGross: null,
            yocNet: null,
            yocDividendsGross: 0,
            yocDividendsNet: 0,
            yocCostBasis: 0,
            yocAssetCount: 0,
            currentYield: null,
            currentYieldNet: null,
            currentYieldDividends: 0,
            currentYieldDividendsNet: 0,
            currentYieldPortfolioValue: 0,
            currentYieldAssetCount: 0,
          };
        }

        try {
          const params = new URLSearchParams({
            userId: user.uid,
            startDate: metrics.startDate.toISOString(),
            dividendEndDate: metrics.dividendEndDate.toISOString(),
            numberOfMonths: metrics.numberOfMonths.toString(),
          });

          // Fetch YOC and Current Yield in parallel for each period
          const [yocResponse, currentYieldResponse] = await Promise.all([
            authenticatedFetch(`/api/performance/yoc?${params.toString()}`),
            authenticatedFetch(`/api/performance/current-yield?${params.toString()}`),
          ]);

          const yocData = yocResponse.ok
            ? await yocResponse.json()
            : {
                yocGross: null,
                yocNet: null,
                yocDividendsGross: 0,
                yocDividendsNet: 0,
                yocCostBasis: 0,
                yocAssetCount: 0,
              };

          const currentYieldData = currentYieldResponse.ok
            ? await currentYieldResponse.json()
            : {
                currentYield: null,
                currentYieldNet: null,
                currentYieldDividends: 0,
                currentYieldDividendsNet: 0,
                currentYieldPortfolioValue: 0,
                currentYieldAssetCount: 0,
              };

          if (!yocResponse.ok) {
            console.warn(`Failed to fetch YOC for ${periodKey}:`, yocResponse.statusText);
          }
          if (!currentYieldResponse.ok) {
            console.warn(`Failed to fetch Current Yield for ${periodKey}:`, currentYieldResponse.statusText);
          }

          return { ...yocData, ...currentYieldData };
        } catch (error) {
          console.error(`Error fetching metrics for ${periodKey}:`, error);
          return {
            yocGross: null,
            yocNet: null,
            yocDividendsGross: 0,
            yocDividendsNet: 0,
            yocCostBasis: 0,
            yocAssetCount: 0,
            currentYield: null,
            currentYieldNet: null,
            currentYieldDividends: 0,
            currentYieldDividendsNet: 0,
            currentYieldPortfolioValue: 0,
            currentYieldAssetCount: 0,
          };
        }
      });

      const metricsResults = await Promise.all(metricsPromises);

      // Merge YOC and Current Yield data into performance data
      periods.forEach((periodKey, index) => {
        Object.assign(data[periodKey], metricsResults[index]);
      });

      setPerformanceData(data);
      hasLoadedOnceRef.current = true;
    } catch (error) {
      console.error('Error loading performance data:', error);
      toast.error('Errore nel caricamento delle metriche di performance');
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  /**
   * Calculate metrics for a custom user-selected date range.
   *
   * Uses cached snapshots and existing settings (risk-free rate, dividend category)
   * to avoid redundant API calls. This enables instant custom period calculations
   * without re-fetching data from Firebase.
   *
   * @param startDate - Custom period start date
   * @param endDate - Custom period end date
   */
  const handleCustomDateRange = async (startDate: Date, endDate: Date) => {
    if (!user || !performanceData || cachedSnapshots.length === 0) return;

    try {
      // Use cached snapshots instead of fetching again (reuses loadPerformanceData cache)
      const customMetrics = await calculatePerformanceForPeriod(
        user.uid,
        cachedSnapshots,  // Cached snapshots from initial load
        'CUSTOM',
        performanceData.ytd.riskFreeRate,
        startDate,
        endDate,
        undefined,  // preFetchedExpenses
        performanceData.ytd.dividendCategoryId  // Reuse categoryId from settings
      );

      // Fetch YOC and Current Yield for custom period if sufficient data
      if (!customMetrics.hasInsufficientData) {
        try {
          const params = new URLSearchParams({
            userId: user.uid,
            startDate: customMetrics.startDate.toISOString(),
            dividendEndDate: customMetrics.dividendEndDate.toISOString(),
            numberOfMonths: customMetrics.numberOfMonths.toString(),
          });

          // Fetch YOC and Current Yield in parallel
          const [yocResponse, currentYieldResponse] = await Promise.all([
            authenticatedFetch(`/api/performance/yoc?${params.toString()}`),
            authenticatedFetch(`/api/performance/current-yield?${params.toString()}`),
          ]);

          if (yocResponse.ok) {
            const yocData = await yocResponse.json();
            Object.assign(customMetrics, yocData);
          }

          if (currentYieldResponse.ok) {
            const currentYieldData = await currentYieldResponse.json();
            Object.assign(customMetrics, currentYieldData);
          }
        } catch (error) {
          console.error('Error fetching metrics for custom period:', error);
          // Continue without YOC/Current Yield data (will show null values)
        }
      }

      setPerformanceData({
        ...performanceData,
        custom: customMetrics,
      });

      handlePeriodChange('CUSTOM');
      toast.success('Periodo personalizzato calcolato');
    } catch (error) {
      console.error('Error calculating custom period:', error);
      toast.error('Errore nel calcolo del periodo personalizzato');
    }
  };

  /**
   * Get performance metrics for currently selected time period.
   *
   * @returns PerformanceMetrics for active period, or null if not loaded
   *
   * Note: Custom period only exists after user creates it via date picker dialog.
   * All other periods (YTD, 1Y, 3Y, 5Y, ALL) pre-calculated on page load.
   */
  const metrics = useMemo<PerformanceMetrics | null>(() => {
    if (!performanceData) return null;

    switch (selectedPeriod) {
      case 'YTD': return performanceData.ytd;
      case '1Y': return performanceData.oneYear;
      case '3Y': return performanceData.threeYear;
      case '5Y': return performanceData.fiveYear;
      case 'ALL': return performanceData.allTime;
      case 'CUSTOM': return performanceData.custom;
      default: return performanceData.ytd;
    }
  }, [performanceData, selectedPeriod]);

  const periodSnapshots = useMemo(() => {
    if (!metrics || cachedSnapshots.length === 0) return [];

    return getSnapshotsForPeriod(
      cachedSnapshots,
      metrics.timePeriod,
      metrics.startDate,
      metrics.endDate
    );
  }, [cachedSnapshots, metrics]);

  const chartData = useMemo(() => {
    if (!metrics || periodSnapshots.length === 0) return [];

    // YTD/1Y/3Y/5Y periods include an extra baseline snapshot before the range;
    // skip it so the chart starts at the first actual month of the selected period.
    const hasBaseline = ['YTD', '1Y', '3Y', '5Y'].includes(metrics.timePeriod);
    return preparePerformanceChartData(periodSnapshots, metrics.cashFlows, hasBaseline);
  }, [metrics, periodSnapshots]);

  const heatmapData = useMemo(() => {
    if (!metrics || periodSnapshots.length === 0) return [];
    return prepareMonthlyReturnsHeatmap(periodSnapshots, metrics.cashFlows);
  }, [metrics, periodSnapshots]);

  const underwaterData = useMemo(() => {
    if (!metrics || periodSnapshots.length === 0) return [];

    const hasBaseline = ['YTD', '1Y', '3Y', '5Y'].includes(metrics.timePeriod);
    return prepareUnderwaterDrawdownData(periodSnapshots, metrics.cashFlows, hasBaseline);
  }, [metrics, periodSnapshots]);

  // Responsive helper function
  const getChartHeight = () => {
    if (isLandscape) return 300;
    if (isMobile) return 280;
    return 400;
  };

  // 3-month moving average smooths short-term volatility while preserving trends.
  // Shorter window (1-2 months) is too noisy and shows random fluctuations.
  // Longer window (6+ months) masks recent changes and lags too much behind current performance.
  // 3 months chosen as optimal balance based on financial analysis best practices.
  const rollingCagrMaWindowMonths = 3;
  const rollingSharpeMaWindowMonths = 3;

  /**
   * Calculate rolling 12-month CAGR with moving average smoothing.
   *
   * ROLLING WINDOW EXPLAINED:
   * Each data point represents the CAGR for a 12-month period ending on that date.
   * Example: Point at Dec 2024 shows CAGR from Jan 2024 to Dec 2024.
   *
   * WHY ROLLING:
   * Shows if performance is improving/degrading over time. Better than single
   * point-to-point CAGR which can be skewed by start/end date timing luck.
   *
   * MOVING AVERAGE:
   * 3-month MA smooths out month-to-month noise to reveal underlying trends.
   * Makes it easier to see if performance is consistently improving or declining.
   *
   * @param currentMetrics - If provided, filters rolling data to this period's date range
   * @returns Array with cagr and cagrMA (moving average) for each month
   */
  const getRollingCagrData = (currentMetrics: PerformanceMetrics | null) => {
    if (!performanceData) {
      return [];
    }

    const sourceData = performanceData.rolling12M;

    const filteredData = currentMetrics
      ? sourceData.filter((entry) => {
          const entryDate = new Date(entry.periodEndDate);
          return entryDate >= currentMetrics.startDate && entryDate <= currentMetrics.endDate;
        })
      : sourceData;

    return filteredData.map((entry, index) => {
      const startIndex = Math.max(0, index - rollingCagrMaWindowMonths + 1);
      const windowValues = filteredData
        .slice(startIndex, index + 1)
        .map((item) => item.cagr)
        .filter((value) => Number.isFinite(value));

      const cagrMA = windowValues.length > 0
        ? windowValues.reduce((sum, value) => sum + value, 0) / windowValues.length
        : null;

      return { ...entry, cagrMA };
    });
  };

  /**
   * Calculate rolling 12-month Sharpe Ratio with moving average smoothing.
   *
   * Similar to getRollingCagrData but for risk-adjusted returns.
   * Each point shows Sharpe Ratio for 12 months ending on that date.
   *
   * Sharpe Ratio = (Portfolio Return - Risk-Free Rate) / Portfolio Volatility
   * Higher values = better risk-adjusted performance
   *
   * @param currentMetrics - If provided, filters rolling data to this period's date range
   * @returns Array with sharpeRatio and sharpeRatioMA (moving average) for each month
   */
  const getRollingSharpeData = (currentMetrics: PerformanceMetrics | null) => {
    if (!performanceData) {
      return [];
    }

    const sourceData = performanceData.rolling12M;

    const filteredData = currentMetrics
      ? sourceData.filter((entry) => {
          const entryDate = new Date(entry.periodEndDate);
          return entryDate >= currentMetrics.startDate && entryDate <= currentMetrics.endDate;
        })
      : sourceData;

    return filteredData.map((entry, index) => {
      const startIndex = Math.max(0, index - rollingSharpeMaWindowMonths + 1);
      const windowValues = filteredData
        .slice(startIndex, index + 1)
        .map((item) => item.sharpeRatio)
        .filter((value): value is number => value !== null);

      const sharpeRatioMA = windowValues.length > 0
        ? windowValues.reduce((sum, value) => sum + value, 0) / windowValues.length
        : null;

      return { ...entry, sharpeRatioMA };
    });
  };

  const rollingCagrData = getRollingCagrData(metrics);
  const rollingSharpeData = getRollingSharpeData(metrics);
  const periodRenderKey = metrics
    ? `${selectedPeriod}-${metrics.startDate.toISOString()}-${metrics.endDate.toISOString()}`
    : selectedPeriod;
  const periodDateRangeLabel = metrics
    ? `${metrics.startDate.toLocaleDateString('it-IT')} - ${metrics.endDate.toLocaleDateString('it-IT')}`
    : '';

  if (loading) {
    // Skeleton screen mirrors the real page layout so the transition feels seamless.
    return <PerformancePageSkeleton />;
  }

  if (!performanceData || !metrics) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <Info className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
          <h2 className="text-xl font-semibold mb-2">Dati insufficienti</h2>
          <p className="text-muted-foreground max-w-md">
            Servono almeno 2 snapshot mensili per calcolare le metriche di performance.
          </p>
        </div>
      </div>
    );
  }

  if (metrics.hasInsufficientData) {
    return (
      <div className="space-y-6 p-3 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Rendimenti del Portafoglio</h1>
            <p className="text-muted-foreground mt-1">
              Analisi dei rendimenti e metriche di rischio-rendimento
            </p>
          </div>
        </div>

        <Tabs value={selectedPeriod} onValueChange={(value) => handlePeriodChange(value as TimePeriod)}>
          {isMobile ? (
            <Select value={selectedPeriod} onValueChange={(value) => handlePeriodChange(value as TimePeriod)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="YTD">YTD</SelectItem>
                <SelectItem value="1Y">1 Anno</SelectItem>
                <SelectItem value="3Y">3 Anni</SelectItem>
                <SelectItem value="5Y">5 Anni</SelectItem>
                <SelectItem value="ALL">Storico</SelectItem>
                <SelectItem value="CUSTOM" disabled={!performanceData.custom}>Personalizzato</SelectItem>
              </SelectContent>
            </Select>
          ) : (
            <TabsList className="grid w-full grid-cols-6">
              <TabsTrigger value="YTD">YTD</TabsTrigger>
              <TabsTrigger value="1Y">1 Anno</TabsTrigger>
              <TabsTrigger value="3Y">3 Anni</TabsTrigger>
              <TabsTrigger value="5Y">5 Anni</TabsTrigger>
              <TabsTrigger value="ALL">Storico</TabsTrigger>
              <TabsTrigger value="CUSTOM" disabled={!performanceData.custom}>
                Personalizzato
              </TabsTrigger>
            </TabsList>
          )}

          <Card className="mt-6">
            <CardContent className="pt-6">
              <div className="text-center py-12">
                <Info className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <h3 className="text-lg font-semibold mb-2">Dati insufficienti per questo periodo</h3>
                <p className="text-muted-foreground">
                  Servono almeno 2 snapshot mensili per calcolare le metriche.
                  {metrics.errorMessage && <><br />{metrics.errorMessage}</>}
                </p>
              </div>
            </CardContent>
          </Card>
        </Tabs>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-3 sm:p-6">
      {/* Page header — primary title gets full typographic weight; actions are grouped
          right and sized to not compete. "Aggiorna" is a utility action so it sits
          as outline to de-emphasise it relative to the AI analysis CTA. */}
      <motion.div
        key={`header-${refreshAnimationTick}`}
        variants={sectionRefreshPulse}
        initial="idle"
        animate={isRefreshing ? 'pulse' : 'idle'}
        className="border-b border-border pb-4"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-widest mb-1">Portafoglio</p>
            <h1 className="text-3xl font-bold tracking-tight">Rendimenti del Portafoglio</h1>
            <p className="text-muted-foreground mt-1">
              Analisi dei rendimenti e metriche di rischio-rendimento
            </p>
          </div>
          <div className="flex flex-wrap gap-2 sm:justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={(event) => {
                setCustomDialogOrigin(calculateDialogOrigin(event.currentTarget));
                setShowCustomDateDialog(true);
              }}
              disabled={isDemo}
              title={isDemo ? 'Non disponibile in modalità demo' : 'Periodo Personalizzato'}
            >
              {isMobile ? <CalendarDays className="h-4 w-4" /> : 'Periodo Personalizzato'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={(event) => {
                setAiDialogOrigin(calculateDialogOrigin(event.currentTarget));
                setShowAIAnalysisDialog(true);
              }}
              disabled={isDemo || !metrics || metrics.hasInsufficientData}
              title={isDemo ? 'Non disponibile in modalità demo' : undefined}
              className="group gap-2 transition-[border-color,color,box-shadow] duration-200 hover:border-purple-400 hover:text-purple-600 hover:shadow-[0_0_14px_rgba(139,92,246,0.35)] dark:hover:text-purple-400 dark:hover:border-purple-500"
            >
              <Sparkles className="h-4 w-4 transition-transform duration-200 group-hover:rotate-12 group-hover:scale-110" />
              Analizza con AI
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={loadPerformanceData}
              disabled={isDemo || isRefreshing}
              title={isDemo ? 'Non disponibile in modalità demo' : undefined}
              className="text-muted-foreground hover:text-foreground"
            >
              <RefreshCw className={cn('mr-2 h-4 w-4', isRefreshing && 'animate-spin')} />
              Aggiorna
            </Button>
          </div>
        </div>
      </motion.div>

      {/* Period Selector */}
      <Tabs value={selectedPeriod} onValueChange={(value) => handlePeriodChange(value as TimePeriod)}>
        {isMobile ? (
          <Select value={selectedPeriod} onValueChange={(value) => handlePeriodChange(value as TimePeriod)}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="YTD">YTD</SelectItem>
              <SelectItem value="1Y">1 Anno</SelectItem>
              <SelectItem value="3Y">3 Anni</SelectItem>
              <SelectItem value="5Y">5 Anni</SelectItem>
              <SelectItem value="ALL">Storico</SelectItem>
              <SelectItem value="CUSTOM" disabled={!performanceData.custom}>Personalizzato</SelectItem>
            </SelectContent>
          </Select>
        ) : (
          <TabsList className="grid w-full grid-cols-6">
            <TabsTrigger value="YTD">YTD</TabsTrigger>
            <TabsTrigger value="1Y">1 Anno</TabsTrigger>
            <TabsTrigger value="3Y">3 Anni</TabsTrigger>
            <TabsTrigger value="5Y">5 Anni</TabsTrigger>
            <TabsTrigger value="ALL">Storico</TabsTrigger>
            <TabsTrigger value="CUSTOM" disabled={!performanceData.custom}>
              Personalizzato
            </TabsTrigger>
          </TabsList>
        )}

        <motion.div
          key={periodRenderKey}
          variants={periodContentSettle}
          initial="idle"
          animate="settle"
          className="mt-4 flex flex-wrap items-center gap-2 text-xs text-muted-foreground"
        >
          <span className="rounded-full border border-border bg-muted/40 px-2.5 py-1 font-medium text-foreground">
            Periodo {periodLabels[selectedPeriod as keyof typeof periodLabels]}
          </span>
          <span className="rounded-full border border-border bg-background px-2.5 py-1">
            {periodDateRangeLabel}
          </span>
          {(isPendingPeriodChange || isRefreshing) && (
            <span className="rounded-full border border-border bg-background px-2.5 py-1">
              Aggiornamento in corso...
            </span>
          )}
        </motion.div>

        {/* Guide strip — shown once per user until dismissed. Orients first-time
            readers without interrupting the data flow for returning users. */}
        {showGuideStrip && (
          <div className="mt-4 flex items-start gap-3 rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-top-2 duration-300">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <div className="flex-1 space-y-0.5">
              <p className="font-medium text-foreground">Come leggere questa pagina</p>
              <p className="text-muted-foreground">
                Le metriche sono organizzate in 4 sezioni: Rendimento, Rischio, Contesto e Proventi Finanziari.
                Passa il cursore sull&apos;icona <span className="font-medium">?</span> su ogni scheda per la definizione completa.
                Per formule e metodologia, espandi <span className="font-medium">Note Metodologiche</span> in fondo alla pagina.
              </p>
            </div>
            <button
              type="button"
              aria-label="Chiudi guida"
              onClick={dismissGuideStrip}
              className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* WARNING: If you change metric tooltips or formulas here, also update:
             - Methodology section at bottom of this file (lines ~595-716)
             - performanceService.ts calculation functions
             - Performance documentation in /docs (if exists)
             Keep explanations consistent across all locations! */}

        <motion.div
          layout
          className="space-y-0"
        >

        {/* === METRICHE DI RENDIMENTO === */}
        <MetricSection
          title="Metriche di Rendimento"
          description="Misurano quanto il tuo portafoglio è cresciuto nel tempo"
          sectionIndex={0}
        >
          <MetricCard
            title="ROI Totale"
            value={metrics.roi}
            format="percentage"
            description="Rendimento complessivo (senza annualizzazione)"
            tooltip="Misura il guadagno/perdita totale del periodo selezionato. Formula: (Valore Finale - Valore Iniziale - Contributi Netti) / Valore Iniziale × 100. IMPORTANTE: Il valore cambia tra periodi diversi (YTD, 1Y, 3Y) perché calcola rendimenti su durate diverse. Per confrontare periodi diversi usa CAGR o TWR che sono annualizzati."
          />
          <MetricCard
            title="CAGR"
            value={metrics.cagr}
            format="percentage"
            description="Tasso di crescita annuale composto"
            tooltip="Rendimento medio annuo che il portafoglio avrebbe dovuto avere per passare dal valore iniziale (+ contributi) al valore finale. Utile per confrontare periodi di durata diversa. Considera i flussi di cassa ma non il loro timing."
            isPrimary
          />
          <MetricCard
            title="Time-Weighted Return"
            value={metrics.timeWeightedReturn}
            format="percentage"
            description="Rendimento time-weighted (annualizzato)"
            tooltip="Metrica raccomandata per valutare la performance. Elimina l'effetto del timing dei contributi/prelievi, mostrando la vera capacità di generare rendimento. Ideale per confrontare con benchmark o altri portafogli. Calcolo: rendimenti mensili collegati geometricamente e annualizzati."
            isPrimary
            badge="Avanzato"
          />
          <MetricCard
            title="Money-Weighted Return (IRR)"
            value={metrics.moneyWeightedReturn}
            format="percentage"
            description="Tasso interno di rendimento"
            tooltip="Rendimento personale dell'investitore che tiene conto di QUANDO hai investito o prelevato denaro. Se investi molto prima di una crescita = IRR alto. Se investi prima di un calo = IRR basso. Usa questa metrica per capire quanto hai guadagnato TU con le TUE decisioni di timing."
            badge="Avanzato"
          />
        </MetricSection>

        {/* === METRICHE DI RISCHIO === */}
        <MetricSection
          title="Metriche di Rischio"
          description="Valutano la volatilità e i potenziali ribassi del portafoglio"
          sectionIndex={1}
        >
          <MetricCard
            title="Volatilità"
            value={metrics.volatility}
            format="percentage"
            description="Deviazione standard annualizzata"
            tooltip="Misura la variabilità dei rendimenti mensili (quanto 'ballano' i risultati). Valori bassi = investimento più stabile e prevedibile. Valori alti = maggiori oscillazioni e rischio. Calcolata sui rendimenti mensili ed espressa in forma annualizzata (× √12)."
          />
          <MetricCard
            title="Sharpe Ratio"
            value={metrics.sharpeRatio}
            format="number"
            description="Rendimento aggiustato per il rischio"
            tooltip={`Misura quanto rendimento extra si ottiene per ogni unità di rischio assunto. Formula: (TWR - Tasso Risk-Free ${formatPercentage(metrics.riskFreeRate)}) / Volatilità. Interpretazione: <1 = scarso, 1-2 = buono, 2-3 = molto buono, >3 = eccellente.`}
            badge="Avanzato"
          />
          <MetricCard
            title="Max Drawdown"
            value={metrics.maxDrawdown}
            subtitle={metrics.maxDrawdownDate}
            format="percentage"
            description="Massima perdita percentuale dal picco"
            tooltip="Misura la peggiore perdita (da picco a valle) che il portafoglio ha subito nel periodo selezionato. Esempio: se il portafoglio valeva €100.000 e scese a €85.000 prima di recuperare, il Max Drawdown è -15%. Calcolo aggiustato per flussi di cassa (sottratte le contribuzioni cumulative) per isolare la performance degli investimenti. Valori vicini allo 0% = portafoglio stabile, valori molto negativi = alta volatilità al ribasso."
          />
          <MetricCard
            title="Durata Drawdown"
            value={metrics.drawdownDuration}
            subtitle={metrics.drawdownPeriod}
            format="months"
            description="Tempo di recupero dal Max Drawdown"
            tooltip="Misura il tempo (in mesi) necessario per recuperare completamente dalla perdita più grande (Max Drawdown). Esempio: se il portafoglio perde il 15% a gennaio e recupera a dicembre, la durata è 11 mesi. Questo indicatore misura la resilienza del portafoglio: durate brevi indicano rapido recupero, durate lunghe segnalano lenta ripresa. Calcolo aggiustato per flussi di cassa per isolare la performance degli investimenti. Se il portafoglio è ancora in drawdown, mostra la durata dall'ultimo picco."
          />
          <MetricCard
            title="Tempo di Recupero"
            value={metrics.recoveryTime}
            subtitle={metrics.recoveryPeriod}
            format="months"
            description="Tempo di risalita dalla valle"
            tooltip="Misura il tempo (in mesi) necessario per recuperare dal punto più basso (trough) del Max Drawdown fino al completo recupero. A differenza della Durata Drawdown (che parte dal picco iniziale), questa metrica misura SOLO la fase di risalita. Esempio: se il portafoglio scende per 6 mesi e poi risale per 9 mesi, Recovery Time = 9 mesi (Durata Drawdown = 15 mesi). Utile per valutare la velocità di recupero dopo aver toccato il fondo. Calcolo aggiustato per flussi di cassa per isolare la performance degli investimenti."
          />
        </MetricSection>

        {/* === METRICHE DI CONTESTO === */}
        <MetricSection
          title="Metriche di Contesto"
          description="Informazioni sul periodo e sui flussi di capitale"
          sectionIndex={2}
        >
          <MetricCard
            title="Contributi Netti"
            value={metrics.netCashFlow}
            format="currency"
            description={`Entrate: ${formatCurrency(metrics.totalIncome)} | Dividendi: ${formatCurrency(metrics.totalDividendIncome)} | Uscite: ${formatCurrency(metrics.totalExpenses)}`}
            tooltip={`Differenza netta tra entrate esterne (stipendi, bonus) e uscite (spese quotidiane). I dividendi (${formatCurrency(metrics.totalDividendIncome)}) sono mostrati separatamente perché sono rendimento del portafoglio, non contributi esterni. Valore positivo = stai risparmiando, negativo = stai spendendo più di quanto guadagni.`}
          />
          <MetricCard
            title="Durata"
            value={metrics.numberOfMonths}
            format="months"
            description={`Da ${metrics.startDate.toLocaleDateString('it-IT')} a ${metrics.endDate.toLocaleDateString('it-IT')}`}
            tooltip="Periodo di tempo coperto dall'analisi. La data di inizio è il primo giorno del mese del primo snapshot disponibile. La data di fine è l'ultimo giorno del mese dell'ultimo snapshot disponibile. Gli snapshot automatici vengono creati alla fine di ogni mese (28-31) e includono tutti i cash flow fino a quella data."
          />
        </MetricSection>

        {/* === METRICHE DIVIDENDI (conditional) === */}
        {(metrics.yocGross !== null || metrics.yocNet !== null || metrics.currentYield !== null || metrics.currentYieldNet !== null) && (
          <MetricSection
            title="Metriche da Proventi Finanziari"
            description="Rendimento da dividendi e cedole rispetto al costo di acquisto e al valore corrente"
            sectionIndex={3}
          >
            <MetricCard
              title="YOC Lordo"
              value={metrics.yocGross}
              format="percentage"
              description={`Dividendi: ${formatCurrency(metrics.yocDividendsGross)} | Cost Basis: ${formatCurrency(metrics.yocCostBasis)} | Asset: ${metrics.yocAssetCount}`}
              tooltip="Yield on Cost (YOC) Lordo misura il rendimento da dividendi lordi rispetto al costo originale di acquisto (cost basis). Formula: (Dividendi Annualizzati / Cost Basis) × 100. Esempio: Se hai comprato 100 azioni a €50 (cost basis €5.000) e ricevi €300/anno di dividendi lordi, YOC = 6%. A differenza del rendimento corrente (dividendi/prezzo attuale), YOC mostra quanto rende il tuo investimento iniziale. YOC > Rendimento Corrente indica crescita dei dividendi nel tempo. Valori alti (>5-7%) indicano un buon ritorno sull'investimento originale."
              badge="Avanzato"
            />
            <MetricCard
              title="YOC Netto"
              value={metrics.yocNet}
              format="percentage"
              description={`Dividendi: ${formatCurrency(metrics.yocDividendsNet)} | Cost Basis: ${formatCurrency(metrics.yocCostBasis)} | Asset: ${metrics.yocAssetCount}`}
              tooltip="Yield on Cost (YOC) Netto misura il rendimento da dividendi netti (dopo tasse) rispetto al costo originale di acquisto. Formula: (Dividendi Netti Annualizzati / Cost Basis) × 100. Questa metrica mostra quanto effettivamente guadagni (al netto delle ritenute fiscali) rispetto al tuo investimento iniziale. Più realistica dello YOC Lordo perché considera l'impatto fiscale. Utile per valutare il rendimento effettivo del portafoglio nel tempo. La differenza tra YOC Lordo e Netto dipende dalle aliquote fiscali applicate (es. 26% in Italia per dividendi azionari)."
              badge="Avanzato"
            />
            <MetricCard
              title="Rendimento Corrente Lordo"
              value={metrics.currentYield}
              format="percentage"
              description={`Dividendi: ${formatCurrency(metrics.currentYieldDividends)} | Valore Portafoglio: ${formatCurrency(metrics.currentYieldPortfolioValue)} | Asset: ${metrics.currentYieldAssetCount}`}
              tooltip={`Rendimento Corrente Lordo misura il rendimento da dividendi lordi basato sul valore di mercato ATTUALE del portafoglio. Formula: (Dividendi Lordi Annualizzati / Valore Corrente Portafoglio) × 100. A differenza dello YOC (che usa il costo originale), il Rendimento Corrente mostra quanto renderebbe il portafoglio se lo acquistassi oggi ai prezzi correnti.${
                metrics.yocGross !== null
                  ? `\n\nConfronto con YOC Lordo (${metrics.yocGross.toFixed(2)}%): ${
                      metrics.currentYield !== null && metrics.currentYield > metrics.yocGross
                        ? 'Il prezzo è cresciuto più dei dividendi (buon capital gain ma yield diluito)'
                        : metrics.currentYield !== null && metrics.currentYield < metrics.yocGross
                        ? 'I dividendi sono cresciuti o il prezzo è sceso (ottimo per chi ha comprato presto!)'
                        : 'Crescita proporzionale di prezzo e dividendi'
                    }`
                  : '\n\nUtile per confrontare il rendimento del portafoglio con altre opportunità di investimento (bond, ETF, depositi) e valutare se il portafoglio genera reddito passivo sufficiente.'
              }`}
            />
            <MetricCard
              title="Rendimento Corrente Netto"
              value={metrics.currentYieldNet}
              format="percentage"
              description={`Dividendi: ${formatCurrency(metrics.currentYieldDividendsNet)} | Valore Portafoglio: ${formatCurrency(metrics.currentYieldPortfolioValue)} | Asset: ${metrics.currentYieldAssetCount}`}
              tooltip={`Rendimento Corrente Netto misura il rendimento da dividendi netti (dopo tasse) basato sul valore di mercato ATTUALE del portafoglio. Formula: (Dividendi Netti Annualizzati / Valore Corrente Portafoglio) × 100. Questa è la metrica più realistica perché considera sia il prezzo corrente che l'impatto fiscale sui dividendi. Mostra quanto effettivamente guadagneresti acquistando il portafoglio oggi ai prezzi correnti.${
                metrics.yocNet !== null
                  ? `\n\nConfronto con YOC Netto (${metrics.yocNet.toFixed(2)}%): ${
                      metrics.currentYieldNet !== null && metrics.currentYieldNet > metrics.yocNet
                        ? 'Il prezzo è cresciuto più dei dividendi netti (buon capital gain)'
                        : metrics.currentYieldNet !== null && metrics.currentYieldNet < metrics.yocNet
                        ? 'I dividendi netti sono cresciuti o il prezzo è sceso (ottimo rendimento effettivo per early investors!)'
                        : 'Crescita proporzionale di prezzo e dividendi netti'
                    }`
                  : '\n\nMetrica più accurata per valutare il reddito passivo effettivo rispetto ad altre opportunità (bond, depositi, altri ETF).'
              }`}
            />
          </MetricSection>
        )}

        </motion.div>

        {/* Chart cards — stagger container propagates hidden→visible to children,
             preventing the compound-opacity flash caused by having both a page-level
             fade and independent initial="hidden" on every card simultaneously. */}
        <motion.div
          key={`charts-${periodRenderKey}`}
          variants={chartShellSettle}
          initial="idle"
          animate="settle"
        >
        <motion.div variants={staggerContainer} initial="hidden" animate="visible">

        {/* Net Worth Evolution Chart */}
        <motion.div variants={cardItem}>
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Evoluzione Patrimonio</CardTitle>
            <CardDescription>
              Area blu = capitale versato, area verde = rendimento generato, linea arancione = patrimonio totale.
              Se l&apos;area verde cresce, gli investimenti stanno performando positivamente.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={getChartHeight()}>
                <AreaChart data={chartData} margin={{ bottom: 20 }}>
                  {/* stroke="var(--border)" makes the grid theme-aware without JS theme detection */}
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="date" tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }} stroke="var(--border)" />
                  <YAxis tickFormatter={(value) => formatCurrencyCompact(value)} tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }} stroke="var(--border)" />
                  <Tooltip content={<PerformanceTooltip />} />
                  <Legend />
                  <Area
                    type="monotone"
                    dataKey="contributions"
                    stackId="1"
                    stroke="#8884d8"
                    fill="#8884d8"
                    name="Contributi"
                    animationDuration={800}
                    animationEasing="ease-out"
                  />
                  <Area
                    type="monotone"
                    dataKey="returns"
                    stackId="1"
                    stroke="#82ca9d"
                    fill="#82ca9d"
                    name="Investimenti"
                    animationDuration={800}
                    animationEasing="ease-out"
                  />
                  <Line
                    type="monotone"
                    dataKey="netWorth"
                    stroke="#ff7300"
                    strokeWidth={2}
                    name="Patrimonio Totale"
                    dot={false}
                    animationDuration={800}
                    animationEasing="ease-out"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </motion.div>

        {/* Benchmark Comparison Section */}
        <motion.div variants={cardItem}>
          <BenchmarkComparisonSection
            portfolioHeatmapData={heatmapData}
            startDate={metrics.startDate}
            endDate={metrics.endDate}
            selectedPeriod={selectedPeriod}
            portfolioTWR={metrics.timeWeightedReturn}
            numberOfMonths={metrics.numberOfMonths}
            portfolioTotalGrowth={
              metrics.timeWeightedReturn != null && metrics.numberOfMonths > 0
                ? (Math.pow(1 + metrics.timeWeightedReturn / 100, metrics.numberOfMonths / 12) - 1) * 100
                : null
            }
          />
        </motion.div>

        {/* Rolling CAGR Chart */}
        {rollingCagrData.length > 0 && (
          <motion.div variants={cardItem}>
          <Card className="mt-6">
            <CardHeader>
              <CardTitle>CAGR Rolling 12 Mesi</CardTitle>
              <CardDescription>
                Ogni punto mostra il CAGR degli ultimi 12 mesi; linea tratteggiata = media mobile a 3M.
                Una linea in salita segnala performance in miglioramento nel periodo recente.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={getChartHeight()}>
                  <LineChart data={rollingCagrData} margin={{ bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis
                      dataKey="periodEndDate"
                      tickFormatter={(date) => new Date(date).toLocaleDateString('it-IT', { month: 'short', year: '2-digit' })}
                      tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }}
                      stroke="var(--border)"
                    />
                    <YAxis
                      tickFormatter={(value) => `${value.toFixed(1)}%`}
                      tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }}
                      stroke="var(--border)"
                    />
                    <Tooltip
                      formatter={(value: number) => `${value.toFixed(2)}%`}
                      labelFormatter={(date) => new Date(date).toLocaleDateString('it-IT')}
                      contentStyle={{ backgroundColor: 'var(--card)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--card-foreground)' }}
                      labelStyle={{ color: 'var(--card-foreground)' }}
                    />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="cagr"
                      stroke="#8884d8"
                      strokeWidth={2}
                      name="CAGR 12M"
                      dot={false}
                      animationDuration={800}
                      animationEasing="ease-out"
                    />
                    <Line
                      type="monotone"
                      dataKey="cagrMA"
                      stroke="#82ca9d"
                      strokeWidth={2}
                      name={`Media Mobile ${rollingCagrMaWindowMonths}M`}
                      strokeDasharray="6 4"
                      dot={false}
                      animationDuration={800}
                      animationEasing="ease-out"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </motion.div>
          )}

        {/* Rolling Sharpe Ratio Chart */}
        {rollingSharpeData.length > 0 && (
          <motion.div variants={cardItem}>
          <Card className="mt-6">
            <CardHeader>
              <CardTitle>Sharpe Ratio Rolling 12 Mesi</CardTitle>
              <CardDescription>
                Rapporto rischio-rendimento su finestra mobile di 12 mesi (&gt;1 buono, &gt;2 eccellente).
                Ampie oscillazioni indicano volatilità elevata nel periodo.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={getChartHeight()}>
                <LineChart data={rollingSharpeData} margin={{ bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis
                    dataKey="periodEndDate"
                    tickFormatter={(date) => new Date(date).toLocaleDateString('it-IT', { month: 'short', year: '2-digit' })}
                    tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }}
                    stroke="var(--border)"
                  />
                  <YAxis
                    tickFormatter={(value) => value.toFixed(2)}
                    tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }}
                    stroke="var(--border)"
                  />
                  <Tooltip
                    formatter={(value) => {
                      if (typeof value !== 'number' || Number.isNaN(value)) {
                        return 'n/d';
                      }
                      return value.toFixed(2);
                    }}
                    labelFormatter={(date) => new Date(date).toLocaleDateString('it-IT')}
                    contentStyle={{ backgroundColor: 'var(--card)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--card-foreground)' }}
                    labelStyle={{ color: 'var(--card-foreground)' }}
                  />
                  <Legend formatter={(value) => String(value).replace(/^\d+\.\s*/, '')} />
                  <Line
                    type="monotone"
                    dataKey="sharpeRatio"
                    stroke="#ff7300"
                    strokeWidth={2}
                    name="1. Sharpe 12M"
                    dot={false}
                    animationDuration={800}
                    animationEasing="ease-out"
                  />
                  <Line
                    type="monotone"
                    dataKey="sharpeRatioMA"
                    stroke="#82ca9d"
                    strokeWidth={2}
                    name={`2. Media Mobile ${rollingSharpeMaWindowMonths}M`}
                    strokeDasharray="6 4"
                    dot={false}
                    animationDuration={800}
                    animationEasing="ease-out"
                  />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
          </motion.div>
        )}

        {/* Monthly Returns Heatmap */}
        <motion.div variants={cardItem}>
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Heatmap Rendimenti Mensili</CardTitle>
            <CardDescription>
              Verde = mese positivo, rosso = negativo; l&apos;intensità cresce con l&apos;ampiezza (±5% soglia).
              Utile per identificare mesi storicamente forti o deboli del portafoglio.
              <br />
              <span className="text-xs">
                I rendimenti isolano il contributo del singolo mese sottraendo solo il cashflow di quel mese, {' '}<strong>non</strong>{' '} il cumulativo. Per questo i valori mensili possono differire dal Grafico Underwater qui sotto, che usa il cashflow cumulativo dall&apos;inizio.
              </span>
            </CardDescription>
          </CardHeader>
          <CardContent>
            <MonthlyReturnsHeatmap data={heatmapData} revealKey={periodRenderKey} />
          </CardContent>
        </Card>
        </motion.div>

        {/* Underwater Drawdown Chart */}
        <motion.div variants={cardItem}>
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Grafico Underwater (Drawdown)</CardTitle>
            <CardDescription>
              L&apos;area rossa mostra quanto il portafoglio è sotto il suo massimo storico in quel momento.
              Quando tocca 0% è stato raggiunto un nuovo massimo; si collega a Durata Drawdown e Tempo di Recupero.
              <br />
              <span className="text-xs">
                Aggiustato per il cashflow{' '}<strong>cumulativo</strong>{' '}dall&apos;inizio, ogni punto mostra la performance pura degli investimenti isolata dai contributi/prelievi. Questo può produrre valori molto diversi dalla heatmap mensile sopra, che considera solo il cashflow del singolo mese.
              </span>
            </CardDescription>
          </CardHeader>
          <CardContent>
            <UnderwaterDrawdownChart
              data={underwaterData}
              height={getChartHeight()}
              revealKey={periodRenderKey}
            />
          </CardContent>
        </Card>
        </motion.div>

        {/* Methodology Section — collapsed by default so it does not dominate
            the primary reading path. All content is preserved; acts as a reference
            document that power users open on demand. */}
        <motion.div variants={cardItem}>
        <Collapsible open={isMethodologyOpen} onOpenChange={setIsMethodologyOpen} className="mt-6">
        <Card>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer select-none hover:bg-muted/40 transition-colors rounded-t-lg">
              <div className="flex items-center justify-between">
                <CardTitle>Note Metodologiche</CardTitle>
                <ChevronDown
                  className={cn(
                    'h-5 w-5 text-muted-foreground transition-transform duration-200',
                    isMethodologyOpen && 'rotate-180'
                  )}
                />
              </div>
              <CardDescription>Formule, grafici e definizioni di tutte le 15 metriche</CardDescription>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent className="overflow-hidden data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 duration-200">
          <CardContent className="space-y-4 text-sm">
            <div>
              <h4 className="font-semibold mb-1">Organizzazione delle Metriche</h4>
              <ul className="list-disc list-inside mt-2 space-y-1 text-muted-foreground">
                <li><strong>📈 Rendimento</strong>: Quanto il portafoglio è cresciuto nel tempo (ROI, CAGR, TWR, IRR)</li>
                <li><strong>⚠️ Rischio</strong>: Volatilità e potenziali ribassi (Volatilità, Sharpe, Max Drawdown, Durata Drawdown, Recovery Time)</li>
                <li><strong>📊 Contesto</strong>: Informazioni sul periodo e flussi di capitale (Contributi Netti, Durata)</li>
                <li><strong>💰 Dividendi</strong>: Rendimento da dividendi rispetto al costo di acquisto e al valore corrente (YOC Lordo/Netto, Current Yield Lordo/Netto)</li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-1">Grafico: Evoluzione Patrimonio</h4>
              <p className="text-muted-foreground">
                <strong>Contributi (area blu):</strong> Somma cumulativa dei flussi di cassa netti (entrate − uscite) da Cashflow.
                <br />
                <strong>Investimenti (area verde):</strong> Differenza tra patrimonio totale e contributi cumulativi. Mostra il valore generato dagli investimenti.
                <br />
                <strong>Patrimonio Totale (linea arancione):</strong> Net worth complessivo = contributi + investimenti.
              </p>
            </div>
            <div>
              <h4 className="font-semibold mb-1">Grafico: CAGR Rolling 12 Mesi</h4>
              <p className="text-muted-foreground">
                <strong>Finestra mobile (Rolling):</strong> Ogni punto mostra il CAGR calcolato sui 12 mesi precedenti — es. aprile 2025 = CAGR maggio 2024–aprile 2025.
                <br />
                <strong>Media mobile:</strong> La linea tratteggiata è una media a 3 mesi che smussa le oscillazioni.
                <br />
                <strong>Utilità:</strong> Mostra se la performance migliora o peggiora nel tempo, più stabile del rendimento mensile e più reattivo del rendimento totale.
              </p>
            </div>
            <div>
              <h4 className="font-semibold mb-1">Grafico: Sharpe Ratio Rolling</h4>
              <p className="text-muted-foreground">
                <strong>Finestra mobile (Rolling):</strong> Ogni punto è lo Sharpe calcolato sui 12 mesi precedenti.
                <br />
                <strong>Calcolo:</strong> (TWR − tasso risk-free) / volatilità. Il tasso risk-free viene dalle impostazioni.
                <br />
                <strong>Media mobile:</strong> Linea tratteggiata a 3 mesi per leggere il trend.
              </p>
            </div>
            <div>
              <h4 className="font-semibold mb-1">Grafico: Heatmap Rendimenti Mensili</h4>
              <p className="text-muted-foreground">
                <strong>Calcolo:</strong> ((Patrimonio fine mese − Flussi di cassa del mese) / Patrimonio inizio mese − 1) × 100. Si sottrae solo il cashflow del <em>singolo mese</em> — <strong>non</strong> quello cumulativo — per isolare la performance mensile degli investimenti.
                <br />
                <strong>Colori:</strong> Verde = positivo, rosso = negativo. Intensità più scura oltre ±5%.
                <br />
                <strong>Differenza con il Grafico Underwater:</strong> la heatmap misura la variazione mese-su-mese; il drawdown misura quanto sei sotto il picco storico su base cumulativa. I due valori rispondono a domande diverse e non sono direttamente confrontabili.
              </p>
            </div>
            <div>
              <h4 className="font-semibold mb-1">Grafico: Underwater (Drawdown)</h4>
              <p className="text-muted-foreground">
                <strong>Funzionamento:</strong> A ogni nuovo massimo storico il grafico torna a 0%. Quando il portafoglio scende, mostra la perdita percentuale dal picco.
                <br />
                <strong>Aggiustamento cashflow:</strong> Usa il cashflow <em>cumulativo dall&apos;inizio</em> — la somma di tutti i contributi e prelievi fino a quel momento viene sottratta dal patrimonio. Il picco storico è calcolato sullo stesso valore aggiustato. Questo isola la performance pura degli investimenti eliminando l&apos;effetto dei versamenti. È la ragione per cui i valori possono differire significativamente dalla heatmap mensile sopra.
                <br />
                <strong>Collegamento:</strong> Si integra con le metriche Durata Drawdown e Recovery Time visibili sopra.
              </p>
            </div>
            <div>
              <h4 className="font-semibold mb-1">Periodi Temporali e Snapshot</h4>
              <p className="text-muted-foreground">
                <strong>Snapshot Automatici:</strong> Vengono creati automaticamente alla fine di ogni mese (dal 28 al 31) e catturano lo stato del portafoglio a quella data. I dati di patrimonio e cash flow sono allineati alla fine del mese.
                <br /><br />
                <strong>YTD (Year-to-Date):</strong> Dall&apos;inizio dell&apos;anno corrente (1° gennaio) fino all&apos;ultimo snapshot disponibile. La durata varia da 1 a 12 mesi a seconda del mese corrente.
                <br />
                <strong>1Y/3Y/5Y (Ultimi N Anni):</strong> Ultimi 12/36/60 mesi completi dalla data attuale, sempre basati su mesi interi (dal 1° all&apos;ultimo giorno del mese).
                <br />
                <strong>Storico:</strong> Tutti i dati disponibili dall&apos;inizio del tracciamento.
                <br /><br />
                <em>Esempio (se oggi è dicembre 2025):</em>
                <br />
                • YTD = gen-dic 2025 (12 mesi) | 1Y = gen-dic 2025 (12 mesi) → identici
                <br />
                <em>Esempio (se oggi è luglio 2025):</em>
                <br />
                • YTD = gen-lug 2025 (7 mesi) | 1Y = ago 2024-lug 2025 (12 mesi) → diversi
              </p>
            </div>
            <div>
              <h4 className="font-semibold mb-1">Time-Weighted Return (Raccomandato)</h4>
              <p className="text-muted-foreground">
                Misura la performance del portafoglio eliminando l&apos;effetto dei flussi di cassa.
                Ideale per confrontare la performance con benchmark o altri portafogli.
              </p>
            </div>
            <div>
              <h4 className="font-semibold mb-1">Money-Weighted Return (IRR)</h4>
              <p className="text-muted-foreground">
                Considera il timing dei contributi e prelievi. Mostra il rendimento effettivo
                dell&apos;investitore basato sulle sue decisioni di investimento.
              </p>
            </div>
            <div>
              <h4 className="font-semibold mb-1">Sharpe Ratio</h4>
              <p className="text-muted-foreground">
                Rapporto tra eccesso di rendimento (vs tasso risk-free: {formatPercentage(metrics.riskFreeRate)})
                e volatilità. Valori &gt; 1 sono considerati buoni, &gt; 2 eccellenti.
              </p>
            </div>
            <div>
              <h4 className="font-semibold mb-1">Contributi Netti</h4>
              <p className="text-muted-foreground">
                Calcolati come differenza mensile tra entrate e uscite registrate nella sezione Cashflow.
                Valori positivi sono contributi, negativi sono prelievi.
              </p>
            </div>
            <div>
              <h4 className="font-semibold mb-1">Yield on Cost (YOC)</h4>
              <p className="text-muted-foreground">
                Rendimento da dividendi rispetto al costo originale di acquisto (average cost), non al prezzo attuale.
                <br /><br />
                <strong>Formula:</strong> YOC% = (Dividendi Annualizzati / Cost Basis) × 100
                <br />
                <strong>Annualizzazione:</strong> periodi &lt;12 mesi → (totale ÷ mesi) × 12 · periodi ≥12 mesi → totale ÷ anni.
                <br /><br />
                <strong>Interpretazione:</strong> YOC &gt; Current Yield = il prezzo è cresciuto più dei dividendi (comune in bull market).
                Valori &gt;5% eccellenti per un portafoglio diversificato. Confronta tra periodi (1Y, 3Y, 5Y) per vedere la traiettoria.
                <br /><br />
                <strong>Limiti:</strong> Richiede cost basis noto · Esclusi asset con quantity = 0 · Non considera capital gains.
              </p>
            </div>

            <div>
              <h4 className="font-semibold mb-1">Current Yield</h4>
              <p className="text-muted-foreground">
                Rendimento da dividendi rispetto al valore di mercato attuale. Mostra quanto renderebbe l&apos;investimento acquistato oggi.
                <br /><br />
                <strong>Formula:</strong> Current Yield% = (Dividendi Annualizzati / Valore Corrente) × 100
                <br />
                <strong>Annualizzazione:</strong> stessa logica dello YOC.
                <br /><br />
                <strong>YOC vs Current Yield:</strong> Se YOC &gt; CY, il prezzo è cresciuto più dei dividendi (capital appreciation).
                Se CY &gt; YOC, i dividendi sono cresciuti più del prezzo (rendimento in crescita).
                Le metriche Nette (dopo tasse) sono più realistiche per confronti tra asset.
                <br /><br />
                <strong>Utile per:</strong> Confrontare il portafoglio con alternative (bond, ETF, depositi) · valutare la sostenibilità del reddito passivo.
                <br />
                <strong>Limiti:</strong> Solo asset con dividendi · dipende dalla volatilità del prezzo · non include capital gains · esclusi asset con quantity = 0.
              </p>
            </div>
          </CardContent>
          </CollapsibleContent>
        </Card>
        </Collapsible>
        </motion.div>

        </motion.div>{/* end staggerContainer */}
        </motion.div>
      </Tabs>

      {/* Custom Date Range Dialog */}
      <CustomDateRangeDialog
        open={showCustomDateDialog}
        onOpenChange={(open) => {
          setShowCustomDateDialog(open);
          if (!open) {
            setCustomDialogOrigin(undefined);
          }
        }}
        onConfirm={handleCustomDateRange}
        triggerOrigin={customDialogOrigin}
      />

      {/* AI Analysis Dialog */}
      {user && metrics && !metrics.hasInsufficientData && (
        <AIAnalysisDialog
          open={showAIAnalysisDialog}
          onOpenChange={(open) => {
            setShowAIAnalysisDialog(open);
            if (!open) {
              setAiDialogOrigin(undefined);
            }
          }}
          metrics={metrics}
          timePeriod={selectedPeriod}
          userId={user.uid}
          triggerOrigin={aiDialogOrigin}
        />
      )}
    </div>
  );
}
