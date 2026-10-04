'use client';

/**
 * RENDIMENTI — a verdict over tiles (2026-08-25)
 *
 * The page answers «quanto rende il portafoglio, e rispetto a cosa?» before it shows a number:
 * a rule-generated verdict (lib/utils/performanceNarrative.ts) with the page's ONE axis — the
 * period — beside it, the measured base named under it, and a 12-column grid of tiles that each
 * answer one question with a reading line above their figures. Everything deeper lives below
 * the grid behind the «Dettaglio» disclosure.
 *
 *   Desktop (12 col): Rendimento(5) | Benchmark(4) | Contributi(3)      — one row, the three tall tiles
 *                     then two columns, every tile at its natural height:
 *                       left (7)  Da dove viene il rendimento · Capitale e mercato (takes the slack)
 *                       right (5) Rischio · Consistenza · Plusvalenze (absent without a closed sale)
 *   Mobile (1 col):   Rendimento → Rischio → Consistenza → Benchmark → Contributi → Attribuzione → Plusvalenze → Capitale e mercato
 *
 * Tiles share a row only with tiles of their own height (2026-09-20): Rendimento used to span two
 * rows beside four short tiles, so its plot stretched to 669px and three neighbours were half void.
 * The DOM follows the DESKTOP order, so the Tab order is the visual one there; the phone re-orders.
 *
 * CALCULATION ENGINE (unchanged): every metric comes from performanceService.ts — TWR, IRR,
 * Sharpe, volatility, drawdown, rolling windows — cached in performance-cache/{userId} under
 * CACHE_MATH_VERSION. Every collection is read ONCE, through the app's shared hooks
 * (lib/hooks/usePerformanceData.ts), and handed to the service; the snapshots are resolved onto
 * the configurable base (`resolvePerformanceBase`: which capital, from which month the pension
 * funds count, which boundary flows), so a period switch and a custom range recompute from
 * memory. The dividend yields of the five periods come from one route, asked together with the
 * metrics and merged in. The window is always read back off the payload (`nominalPeriodStart`,
 * `selectSnapshotsForMetrics`), never re-derived from today's date.
 *
 * Every figure a tile shows that the payload does not carry is computed in a pure, tested util
 * (performanceSummary.ts: the drawdown story, Sortino, growth-of-100, the benchmark ranking) —
 * never in a component.
 */

import { useMemo, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { CalendarDays, RefreshCw, Sparkles } from 'lucide-react';
import dynamic from 'next/dynamic';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { useActiveAccount } from '@/contexts/ActiveAccountContext';
import { useDemoMode } from '@/lib/hooks/useDemoMode';
import { Skeleton } from '@/components/ui/skeleton';
import {
  calculatePerformanceForPeriod,
  preparePerformanceChartData,
  selectSnapshotsForMetrics,
  prepareMonthlyReturnsHeatmap,
  prepareUnderwaterDrawdownData,
} from '@/lib/services/performanceService';
import { useQueryClient } from '@tanstack/react-query';
import { usePerformanceData } from '@/lib/hooks/usePerformanceData';
import { useFreshness } from '@/lib/hooks/useFreshness';
import { performanceYieldsQueryOptions, withYields } from '@/lib/query/performanceQueries';
import { resolveHasBaseline, type PerformanceBaseResolution } from '@/lib/utils/performanceBase';
import { resolveCenteredModalOrigin } from '@/lib/utils/modalOrigin';
import { attributePeriodReturn, sumDividendsByAsset, type DividendReceipt } from '@/lib/utils/performanceAttribution';
import type { PerformanceData, PerformanceMetrics, TimePeriod } from '@/types/performance';
import type { Asset, MonthlySnapshot } from '@/types/assets';
import type { PensionContribution } from '@/types/pension';
import type { AssetTransaction } from '@/types/assetTransactions';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { PageContainer } from '@/components/layout/PageContainer';
import { PageHeader } from '@/components/layout/PageHeader';
import { PageVerdict } from '@/components/ui/page-verdict';
import { TILE_CELL_CLASS } from '@/components/ui/tile';
import { TileGridSkeleton } from '@/components/ui/tile-grid-skeleton';
import { ErrorNotice } from '@/components/ui/error-notice';
import { describeReadFailure } from '@/lib/utils/statesNarrative';
import type { TileSkeletonCell } from '@/lib/utils/tileGridSkeleton';
import { useBenchmarkReturns } from '@/lib/hooks/useBenchmarkReturns';
import { useFxRates } from '@/lib/hooks/useFxRates';
import { BENCHMARKS } from '@/lib/constants/benchmarks';
import { applyFxConversion, type MonthlyReturnPoint } from '@/lib/utils/benchmarkPeriodReturn';
import {
  buildGrowthOfHundred,
  computeBenchmarkRanking,
  computeDrawdownStatus,
  computeReturnConsistency,
  computeSortinoRatio,
  resolveDrawdownStory,
  resolveHeroReturn,
  resolveCompanionReturnChip,
  summarizeCapitalEntered,
  summarizePerformance,
  summarizeRealizedGains,
} from '@/lib/utils/performanceSummary';
import {
  buildPerformanceVerdict,
  describeAttribution,
  describeBenchmarkRanking,
  describeCapitalAndMarket,
  describeConsistency,
  describeContributions,
  describeGrowthOfHundred,
  describeMeasurementBase,
  describePeriodAside,
  describeRealizedGains,
  describeRisk,
  describeWindow,
  resolveBenchmarkGap,
} from '@/lib/utils/performanceNarrative';
import { useAssetLedgerMeta } from '@/lib/hooks/useAssetTransactions';
import { computeInvestedCapital, aggregateRealizedByYear } from '@/lib/utils/assetTransactionUtils';
import { getItalyMonthYear } from '@/lib/utils/dateHelpers';
import { MONTH_NAMES_SHORT } from '@/lib/utils/period';
import { CustomDateRangeDialog } from '@/components/performance/CustomDateRangeDialog';
import type { AIAnalysisDialogProps } from '@/components/performance/AIAnalysisDialog';
import { CustomPeriodChip, PerformancePeriodPicker, type PickerPeriod } from '@/components/performance/PerformancePeriodPicker';
import { RendimentoTile } from '@/components/performance/tiles/RendimentoTile';
import { RischioTile } from '@/components/performance/tiles/RischioTile';
import { ConsistenzaTile } from '@/components/performance/tiles/ConsistenzaTile';
import { ContributiTile } from '@/components/performance/tiles/ContributiTile';
import { BenchmarkTile } from '@/components/performance/tiles/BenchmarkTile';
import { PlusvalenzeTile } from '@/components/performance/tiles/PlusvalenzeTile';
import { AttribuzioneTile } from '@/components/performance/tiles/AttribuzioneTile';
import { CapitaleMercatoTile } from '@/components/performance/tiles/CapitaleMercatoTile';
import { PerformanceDettaglio } from '@/components/performance/PerformanceDettaglio';

// Lazy-load AIAnalysisDialog to keep react-markdown and remark-gfm (~60KB gzipped)
// out of the initial Performance page bundle — loaded only on first "Analizza con AI" click.
const AIAnalysisDialog = dynamic<AIAnalysisDialogProps>(
  () => import('@/components/performance/AIAnalysisDialog').then((m) => ({ default: m.AIAnalysisDialog })),
  { ssr: false },
);

/** The grid's geometry, for the skeleton: the same spans as the tiles below. */
const SKELETON_CELLS: TileSkeletonCell[] = [
  { span: 5, lines: 10 },
  { span: 4, lines: 8 },
  { span: 3, lines: 8 },
  { span: 7, rows: 3, lines: 12 },
  { span: 5, lines: 6 },
  { span: 5, lines: 4 },
  { span: 5, lines: 2 },
];

/** The base before the first load: the product default, so the caption under the verdict is right on first paint. */
const DEFAULT_BASE: Pick<PerformanceBaseResolution, 'options' | 'pensionEntryMonth' | 'pensionFundIds'> = {
  options: { includePensionFunds: false, includeExcludedAssets: false },
  pensionEntryMonth: null,
  pensionFundIds: [],
};

/** The reference model of the verdict: the first definition, the classic balanced allocation. */
const REFERENCE_BENCHMARK = BENCHMARKS[0];

/** The custom range's key in the yields request. */
const CUSTOM_YIELD_KEY = 'custom';

// Stable empties: a fresh `[]` per render would re-run every memo that reads it.
const NO_SNAPSHOTS: MonthlySnapshot[] = [];
const NO_ASSETS: Asset[] = [];
const NO_CONTRIBUTIONS: PensionContribution[] = [];
const NO_DIVIDENDS: DividendReceipt[] = [];
const NO_TRADES: AssetTransaction[] = [];

/** «1 ago 2025» for the compact header's description. */
function shortDate(date: Date): string {
  return date.toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** The measured window as a compact string: «misurati dal 1 ago 2025 al 31 lug 2026». */
function describeHeaderWindow(metrics: PerformanceMetrics | null): string | undefined {
  if (!metrics || metrics.hasInsufficientData) return undefined;
  return `misurati dal ${shortDate(metrics.startDate)} al ${shortDate(metrics.endDate)}`;
}

/**
 * The three actions — a custom range, the AI report, the refresh. Inline in the compact header
 * from `desktop:`; below it the refresh stays in the sticky navbar's slot and the two text
 * actions sit under the period picker as 44px buttons (`stacked`).
 */
function HeaderActions({
  stacked,
  isDemo,
  aiDisabled,
  isRefreshing,
  onCustom,
  onAI,
  onRefresh,
}: {
  stacked?: boolean;
  isDemo: boolean;
  aiDisabled: boolean;
  isRefreshing: boolean;
  onCustom: (e: React.MouseEvent<HTMLButtonElement>) => void;
  onAI: (e: React.MouseEvent<HTMLButtonElement>) => void;
  onRefresh: () => void;
}) {
  const size = stacked ? 'h-11 w-full justify-center' : 'h-8 px-2.5 text-xs';
  return (
    <>
      <Button variant="outline" onClick={onCustom} disabled={isDemo} className={cn('gap-1.5', size)} aria-label={isDemo ? 'Periodo personalizzato — non disponibile in modalità demo' : 'Periodo personalizzato'}>
        <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
        Periodo personalizzato
      </Button>
      <Button
        variant="outline"
        onClick={onAI}
        disabled={aiDisabled}
        className={cn(
          'group gap-1.5 transition-[border-color,color,box-shadow] duration-200 hover:border-[var(--ai-accent)] hover:text-[var(--ai-accent)] hover:shadow-[0_0_14px_color-mix(in_oklch,var(--ai-accent)_40%,transparent)]',
          size,
        )}
        aria-label={isDemo ? 'Analizza con AI — non disponibile in modalità demo' : 'Analizza con AI'}
      >
        <Sparkles className="h-3.5 w-3.5 transition-transform duration-200 group-hover:rotate-12 group-hover:scale-110" aria-hidden="true" />
        Analizza con AI
      </Button>
      {!stacked && (
        <Button variant="ghost" onClick={onRefresh} disabled={isDemo || isRefreshing} className={cn('text-muted-foreground hover:text-foreground', size)} aria-label={isRefreshing ? 'Aggiornamento in corso' : 'Aggiorna'}>
          <RefreshCw className={cn('h-3.5 w-3.5', isRefreshing && 'animate-spin')} aria-hidden="true" />
          Aggiorna
        </Button>
      )}
    </>
  );
}

export default function PerformancePage() {
  const { user } = useAuth();
  const { ownerId } = useActiveAccount();
  const isDemo = useDemoMode();
  const [isPendingPeriodChange, startPeriodTransition] = useTransition();
  const [selectedPeriod, setSelectedPeriod] = useState<TimePeriod>('YTD');
  const [showCustomDateDialog, setShowCustomDateDialog] = useState(false);
  const [showAIAnalysisDialog, setShowAIAnalysisDialog] = useState(false);
  /** The custom range's metrics, computed here on demand; the five periods come from the hook. */
  const [customMetrics, setCustomMetrics] = useState<PerformanceMetrics | null>(null);
  // Every read of the page — the six collections once, then the metrics and the yields together
  // (lib/hooks/usePerformanceData.ts). A failed read is not an empty set: `loadFailed` gets an
  // alert, never a verdict about zeros.
  const loaded = usePerformanceData(ownerId);
  const { loading, loadFailed, isRefreshing, refresh } = loaded;
  // The resolved base (which capital, the pension entry month, the boundary flows) with its
  // projected snapshots — what a period switch and a custom range recompute from, in memory — the
  // inputs the attribution reads beside it, and the dividends it adds to each instrument.
  const base = loaded.base;
  const cachedSnapshots = base?.snapshots ?? NO_SNAPSHOTS;
  const assets = loaded.assets ?? NO_ASSETS;
  const pensionContributions = loaded.contributions ?? NO_CONTRIBUTIONS;
  const dividends = loaded.dividends ?? NO_DIVIDENDS;
  const performanceData = useMemo<PerformanceData | null>(
    () => (loaded.performanceData ? { ...loaded.performanceData, custom: customMetrics } : null),
    [loaded.performanceData, customMetrics],
  );
  // «Aggiornato alle…» in the header while figures restored from the persisted cache are reread.
  const freshness = useFreshness(loaded.freshnessQueries);
  // Where each window grows from: the header button, resolved at the click
  // (lib/utils/modalOrigin.ts). Never cleared on close — the exit animates too, and an origin
  // that changes mid-animation is tweened by the dialog's own `duration-200`, not swapped.
  const [customDialogOrigin, setCustomDialogOrigin] = useState<string | undefined>(undefined);
  const [aiDialogOrigin, setAiDialogOrigin] = useState<string | undefined>(undefined);
  // Where focus returns when a dialog closes: the button that opened it, taken at the click (the
  // header mounts its actions twice, and only `currentTarget` is the copy the reader pressed). A
  // controlled Radix dialog with no Trigger restores focus to nothing, i.e. to `body`.
  const customOpenerRef = useRef<HTMLElement | null>(null);
  const aiOpenerRef = useRef<HTMLElement | null>(null);

  // Asset trade ledger: «Capitale investito» and «Plusvalenze realizzate» are gated on the migration
  // having run — the tiles degrade (no ledger figure, no Plusvalenze tile) while meta is absent. The
  // trades are the list the base resolution already read (one key, one read).
  const { data: ledgerMeta } = useAssetLedgerMeta(ownerId);
  const isLedgerMigrated = !!ledgerMeta;
  const ledgerTrades = isLedgerMigrated ? (loaded.trades ?? NO_TRADES) : NO_TRADES;
  // The custom range asks its yields through the same query options as the five periods.
  const queryClient = useQueryClient();

  // The six model portfolios, one fixed hook each (React rules: a stable hook count), all enabled:
  // the Benchmark tile is always on the page. The FX series is what makes them EUR — the portfolio is
  // EUR-denominated, so a USD return beside it would compare two currencies.
  const b0 = useBenchmarkReturns(BENCHMARKS[0].id, true);
  const b1 = useBenchmarkReturns(BENCHMARKS[1].id, true);
  const b2 = useBenchmarkReturns(BENCHMARKS[2].id, true);
  const b3 = useBenchmarkReturns(BENCHMARKS[3].id, true);
  const b4 = useBenchmarkReturns(BENCHMARKS[4].id, true);
  const b5 = useBenchmarkReturns(BENCHMARKS[5].id, true);
  const { data: fxRates, isLoading: isFxLoading, isError: isFxError } = useFxRates(true);
  const benchmarkResults = [b0, b1, b2, b3, b4, b5];
  const isAnyBenchmarkLoading = benchmarkResults.some((r) => r.isLoading) || isFxLoading;

  // EUR-converted series per model. While FX is still loading nothing is converted yet, so the
  // ranking waits (an unconverted USD row beside an EUR portfolio would be a wrong number, not a
  // late one); if FX failed for good the raw series are used and the tiles say USD.
  const benchmarkCurrency: 'EUR' | 'USD' = isFxError ? 'USD' : 'EUR';
  const eurReturnsById = useMemo(() => {
    const map: Record<string, MonthlyReturnPoint[] | undefined> = {};
    if (isFxLoading) return map;
    BENCHMARKS.forEach((b, i) => {
      const raw = benchmarkResults[i].data;
      if (!raw) return;
      map[b.id] = fxRates && fxRates.length > 0 ? applyFxConversion(raw, fxRates) : raw;
    });
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [b0.data, b1.data, b2.data, b3.data, b4.data, b5.data, fxRates, isFxLoading]);

  const handlePeriodChange = (nextPeriod: TimePeriod) => {
    if (nextPeriod === selectedPeriod) return;
    startPeriodTransition(() => {
      setSelectedPeriod(nextPeriod);
    });
  };

  const handleResetCustomPeriod = () => {
    startPeriodTransition(() => {
      setSelectedPeriod('YTD');
    });
  };

  /**
   * «Aggiorna» (and the retry of a failed read): the six collections read anew, the metrics
   * recomputed past the Firestore cache, the yields asked again. A custom range was measured on
   * the snapshots of before, so it goes: the page returns to the year to date.
   */
  const handleRefresh = async () => {
    setCustomMetrics(null);
    if (selectedPeriod === 'CUSTOM') setSelectedPeriod('YTD');
    const refreshed = await refresh();
    if (!refreshed) toast.error('Errore nel caricamento delle metriche di performance');
  };

  /** A custom range recomputes from the base's snapshots — no round trip but the yields of its window. */
  const handleCustomDateRange = async (startDate: Date, endDate: Date) => {
    if (!user || !ownerId || !performanceData || cachedSnapshots.length === 0) return;
    try {
      const measured = await calculatePerformanceForPeriod(
        ownerId,
        cachedSnapshots,
        'CUSTOM',
        performanceData.ytd.riskFreeRate,
        startDate,
        endDate,
        undefined,
        performanceData.ytd.dividendCategoryId,
        base?.pensionFlows ?? [],
        base?.portfolioFlows ?? [],
      );
      // A yield that cannot be read leaves the range without it, like the five periods.
      const yields = measured.hasInsufficientData
        ? undefined
        : await queryClient
            .fetchQuery(
              performanceYieldsQueryOptions(ownerId, [
                { key: CUSTOM_YIELD_KEY, startDate: measured.startDate, dividendEndDate: measured.dividendEndDate, numberOfMonths: measured.numberOfMonths },
              ]),
            )
            .catch((error) => {
              console.warn('Dividend yields not read for the custom range:', error);
              return undefined;
            });
      setCustomMetrics(withYields(measured, yields?.[CUSTOM_YIELD_KEY]));
      handlePeriodChange('CUSTOM');
      toast.success('Periodo personalizzato calcolato');
    } catch (error) {
      console.error('Error calculating custom period:', error);
      toast.error('Errore nel calcolo del periodo personalizzato');
    }
  };

  // ─── The selected period's metrics and the derived series ──────────────────
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

  // The same snapshot window the service measured, read back off the payload — never re-derived
  // from today's date, which is how the charts and the metrics used to disagree.
  const periodSnapshots = useMemo(() => {
    if (!metrics || cachedSnapshots.length === 0) return [];
    return selectSnapshotsForMetrics(cachedSnapshots, metrics);
  }, [cachedSnapshots, metrics]);

  const hasBaseline = useMemo(() => resolveHasBaseline(periodSnapshots, metrics?.nominalPeriodStart), [periodSnapshots, metrics]);

  const chartData = useMemo(() => {
    if (!metrics || periodSnapshots.length === 0) return [];
    return preparePerformanceChartData(periodSnapshots, metrics.cashFlows, hasBaseline);
  }, [metrics, periodSnapshots, hasBaseline]);

  const heatmapData = useMemo(() => {
    if (!metrics || periodSnapshots.length === 0) return [];
    return prepareMonthlyReturnsHeatmap(periodSnapshots, metrics.cashFlows);
  }, [metrics, periodSnapshots]);

  const underwaterData = useMemo(() => {
    if (!metrics || periodSnapshots.length === 0) return [];
    return prepareUnderwaterDrawdownData(periodSnapshots, metrics.cashFlows, hasBaseline);
  }, [metrics, periodSnapshots, hasBaseline]);

  // ─── The figures the tiles add (pure layer) ─────────────────────────────────
  const referenceReturns = eurReturnsById[REFERENCE_BENCHMARK.id] ?? null;

  const growthSeries = useMemo(() => {
    if (!metrics) return { baseMonth: null, points: [], portfolioEnd: null, benchmarkEnd: null };
    return buildGrowthOfHundred({ heatmap: heatmapData, benchmarkReturns: referenceReturns, startDate: metrics.startDate, endDate: metrics.endDate });
  }, [metrics, heatmapData, referenceReturns]);

  const ranking = useMemo(() => {
    if (!metrics) return { rows: [], beaten: 0, tied: 0, measured: 0 };
    return computeBenchmarkRanking({
      portfolioTWR: metrics.timeWeightedReturn,
      numberOfMonths: metrics.numberOfMonths,
      startDate: metrics.startDate,
      endDate: metrics.endDate,
      benchmarks: BENCHMARKS,
      returnsById: eurReturnsById,
    });
  }, [metrics, eurReturnsById]);

  const referenceRow = ranking.rows.find((r) => r.id === REFERENCE_BENCHMARK.id) ?? null;
  const referenceModel = referenceRow?.annualized == null ? null : { name: REFERENCE_BENCHMARK.name, annualized: referenceRow.annualized };

  // Below a year the hero states the period's return, not an annualised one: «+16,0%» on nine months
  // is a forecast. The verdict's QUALITY keeps the annualised figure («beats the risk-free rate» is a
  // per-year comparison); the gap against the model follows the hero's basis, in the verdict AND in
  // the tile's chip — one function, so the two can never print two different gaps again.
  const heroReturn = resolveHeroReturn(metrics?.timeWeightedReturn ?? null, metrics?.numberOfMonths ?? 0);
  const benchmarkGap = resolveBenchmarkGap({
    benchmark: referenceModel,
    annualizedReturn: metrics?.timeWeightedReturn ?? null,
    heroReturn,
    numberOfMonths: metrics?.numberOfMonths ?? 0,
  });
  const benchmark = benchmarkGap === null ? null : { name: REFERENCE_BENCHMARK.name, delta: benchmarkGap };
  // The second chip: the same TWR on the other basis (the ROI, a gain over the first month's capital, lives in the Dettaglio).
  const companionReturnChip = resolveCompanionReturnChip(metrics?.timeWeightedReturn ?? null, metrics?.numberOfMonths ?? 0, heroReturn);
  const quality = metrics
    ? summarizePerformance({ timeWeightedReturn: metrics.timeWeightedReturn, sharpeRatio: metrics.sharpeRatio, riskFreeRate: metrics.riskFreeRate })
    : null;
  const consistency = useMemo(() => computeReturnConsistency(heatmapData), [heatmapData]);
  const drawdownStatus = useMemo(() => computeDrawdownStatus(underwaterData), [underwaterData]);
  const drawdownStory = useMemo(() => (metrics ? resolveDrawdownStory(periodSnapshots, metrics.cashFlows) : null), [metrics, periodSnapshots]);
  const sortinoRatio = useMemo(
    () => (metrics ? computeSortinoRatio(heatmapData, metrics.timeWeightedReturn, metrics.riskFreeRate) : null),
    [metrics, heatmapData],
  );

  // Da dove viene il rendimento: the market gain of the SAME window and base, instrument by
  // instrument, with the dividends received in it (capped at today like every dividend figure).
  const attribution = useMemo(() => {
    if (!metrics || !base || periodSnapshots.length === 0) return null;
    return attributePeriodReturn({
      snapshots: periodSnapshots,
      cashFlows: metrics.cashFlows,
      excludedAssetIds: base.excludedAssetIds,
      pension: { fundIds: base.pensionFundIds, entryMonth: base.pensionEntryMonth, contributions: pensionContributions },
      assets,
      dividendsByAsset: sumDividendsByAsset(dividends, metrics.startDate, metrics.dividendEndDate),
    });
  }, [metrics, base, periodSnapshots, pensionContributions, assets, dividends]);

  // The ledger's real buys and sells, on the SAME period bounds as the page — a term of comparison
  // on the Contributi tile, never its answer (opening positions are not purchases).
  const investedCapital = useMemo(() => {
    if (!metrics || !isLedgerMigrated) return null;
    return computeInvestedCapital(ledgerTrades, metrics.startDate, metrics.endDate);
  }, [metrics, ledgerTrades, isLedgerMigrated]);

  // Contributi's one answer: what every return formula neutralised, channel by channel.
  const capitalEntered = useMemo(() => summarizeCapitalEntered(metrics?.cashFlows ?? [], metrics?.numberOfMonths ?? 0), [metrics]);

  // Plusvalenze realizzate: all-time, independent of the selected period — a sale belongs to its fiscal year.
  const realizedGains = useMemo(() => aggregateRealizedByYear(ledgerTrades), [ledgerTrades]);
  const realizedSummary = useMemo(() => (isLedgerMigrated ? summarizeRealizedGains(realizedGains.byYear) : null), [isLedgerMigrated, realizedGains]);

  const verdict = useMemo(() => {
    if (!metrics || !quality) return null;
    return buildPerformanceVerdict({
      period: selectedPeriod,
      nominalPeriodStart: metrics.nominalPeriodStart,
      startDate: metrics.startDate,
      endDate: metrics.endDate,
      numberOfMonths: metrics.numberOfMonths,
      heroReturn,
      annualizedReturn: metrics.timeWeightedReturn,
      quality,
      sharpeRatio: metrics.sharpeRatio,
      benchmark: referenceModel,
      drawdown: drawdownStory,
      consistency,
    });
    // heroReturn/quality/referenceModel are derived from the same inputs as the deps below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metrics, selectedPeriod, referenceRow?.annualized, drawdownStory, consistency]);

  const rollingCagr = useMemo(() => {
    if (!performanceData || !metrics) return [];
    const rows = performanceData.rolling12M.filter((e) => {
      const d = new Date(e.periodEndDate);
      return d >= metrics.startDate && d <= metrics.endDate;
    });
    // A 3-month moving average smooths the month-to-month noise without lagging behind the trend.
    return rows.map((entry, index) => {
      const window = rows.slice(Math.max(0, index - 2), index + 1).map((r) => r.cagr).filter((v): v is number => v !== null && Number.isFinite(v));
      return { ...entry, cagrMA: window.length > 0 ? window.reduce((s, v) => s + v, 0) / window.length : null };
    });
  }, [performanceData, metrics]);

  const rollingSharpe = useMemo(() => {
    if (!performanceData || !metrics) return [];
    const rows = performanceData.rolling12M.filter((e) => {
      const d = new Date(e.periodEndDate);
      return d >= metrics.startDate && d <= metrics.endDate;
    });
    return rows.map((entry, index) => {
      const window = rows.slice(Math.max(0, index - 2), index + 1).map((r) => r.sharpeRatio).filter((v): v is number => v !== null);
      return { ...entry, sharpeRatioMA: window.length > 0 ? window.reduce((s, v) => s + v, 0) / window.length : null };
    });
  }, [performanceData, metrics]);

  const currentYear = getItalyMonthYear().year;

  const headerActions = (stacked: boolean) => (
    <HeaderActions
      stacked={stacked}
      isDemo={isDemo}
      aiDisabled={isDemo || !metrics || metrics.hasInsufficientData}
      isRefreshing={isRefreshing}
      onCustom={(event) => {
        customOpenerRef.current = event.currentTarget;
        setCustomDialogOrigin(resolveCenteredModalOrigin(event.currentTarget.getBoundingClientRect()));
        setShowCustomDateDialog(true);
      }}
      onAI={(event) => {
        aiOpenerRef.current = event.currentTarget;
        setAiDialogOrigin(resolveCenteredModalOrigin(event.currentTarget.getBoundingClientRect()));
        setShowAIAnalysisDialog(true);
      }}
      onRefresh={handleRefresh}
    />
  );

  const header = (
    <PageHeader
      label="Analisi"
      title="Rendimenti"
      description={describeHeaderWindow(metrics)}
      freshness={freshness}
      actions={
        <>
          <div className="hidden items-center gap-2 desktop:flex">{headerActions(false)}</div>
          {/* The sticky navbar's slot is cramped: only the refresh fits there on a phone. */}
          <Button
            variant="ghost"
            size="icon"
            onClick={handleRefresh}
            disabled={isDemo || isRefreshing}
            className="h-11 w-11 text-muted-foreground desktop:hidden"
            aria-label={isRefreshing ? 'Aggiornamento in corso' : 'Aggiorna'}
          >
            <RefreshCw className={cn('h-4 w-4', isRefreshing && 'animate-spin')} aria-hidden="true" />
          </Button>
        </>
      }
    />
  );

  const picker = <PerformancePeriodPicker value={selectedPeriod} onChange={(p: PickerPeriod) => handlePeriodChange(p)} />;

  // ─── Loading and empty states ───────────────────────────────────────────────
  if (loading) {
    return (
      <PageContainer>
        {header}
        <TileGridSkeleton cells={SKELETON_CELLS} toolbar={<Skeleton className="h-9 w-72 rounded-full" />} />
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
          onRetry={() => void handleRefresh()}
          notice={describeReadFailure({
            consequence: 'Le metriche di rendimento non sono state lette: un rendimento non misurato non è uno zero.',
            untouched: 'Le rilevazioni e le operazioni registrate non sono state toccate.',
            canRetry: true,
          })}
        />
      </PageContainer>
    );
  }

  if (!performanceData || !metrics || metrics.hasInsufficientData) {
    return (
      <PageContainer>
        {header}
        <div className="flex flex-col gap-3 pt-1 desktop:flex-row desktop:items-start desktop:justify-between desktop:gap-6">
          <PageVerdict
            verdict={{
              headline: 'Servono almeno due snapshot mensili per misurare un rendimento.',
              tone: 'neutral',
              sentence: [
                { text: metrics?.errorMessage ? `${metrics.errorMessage}. ` : '' },
                { text: 'Ogni snapshot è una fotografia di fine mese del portafoglio; il primo è la valutazione di partenza, dal secondo in poi c’è un mese misurato. Crea uno snapshot dalla Panoramica, o cambia periodo.' },
              ],
            }}
            ariaLabel="Verdetto sui rendimenti"
          />
          <div className="shrink-0">{picker}</div>
        </div>
        {selectedPeriod === 'CUSTOM' && performanceData?.custom && (
          <CustomPeriodChip startDate={performanceData.custom.startDate} endDate={performanceData.custom.endDate} onClear={handleResetCustomPeriod} />
        )}
        <CustomDateRangeDialog
          open={showCustomDateDialog}
          onOpenChange={setShowCustomDateDialog}
          onConfirm={handleCustomDateRange}
          triggerOrigin={customDialogOrigin}
          returnFocusTo={customOpenerRef}
        />
      </PageContainer>
    );
  }

  const lastChartPoint = chartData.length > 0 ? chartData[chartData.length - 1] : null;
  // «Oggi» only when the window closes on the latest snapshot: a custom range that ends earlier names its month.
  const latestSnapshot = cachedSnapshots.length > 0 ? cachedSnapshots[cachedSnapshots.length - 1] : null;
  const lastPeriodSnapshot = periodSnapshots.length > 0 ? periodSnapshots[periodSnapshots.length - 1] : null;
  const windowEnd = {
    endMonth: { year: metrics.endDate.getFullYear(), month: metrics.endDate.getMonth() + 1 },
    endsAtLatest: !!latestSnapshot && !!lastPeriodSnapshot && latestSnapshot.year === lastPeriodSnapshot.year && latestSnapshot.month === lastPeriodSnapshot.month,
  };
  const periodAside = describePeriodAside({
    period: selectedPeriod,
    nominalPeriodStart: metrics.nominalPeriodStart,
    startDate: metrics.startDate,
    endDate: metrics.endDate,
    numberOfMonths: metrics.numberOfMonths,
  });
  const portfolioLastMonth = growthSeries.points.length > 0 ? growthSeries.points[growthSeries.points.length - 1] : null;
  const baseMonthLabel = growthSeries.baseMonth
    ? `${MONTH_NAMES_SHORT[growthSeries.baseMonth.month - 1].toLowerCase()} ${growthSeries.baseMonth.year}`
    : null;

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <PageContainer>
      {header}

      {/* ── Verdict, with the one period axis beside it from desktop ─────────────── */}
      {verdict && (
        <div className="flex items-start justify-between gap-6 pt-1">
          <div className="flex min-w-0 flex-col gap-2">
            <PageVerdict verdict={verdict} ariaLabel="Verdetto sui rendimenti" />
            {/* The measured base, named where the numbers are — the recurring question is why the
                drawdown does not match Storico, and the answer is that they measure different capitals. */}
            <p className="max-w-[920px] text-[12px] leading-[1.5] text-muted-foreground">
              {describeMeasurementBase(base ?? DEFAULT_BASE)}{' '}
              <Link href="/dashboard/settings" className="underline hover:no-underline">
                Cambia base
              </Link>
            </p>
          </div>
          <div className="hidden shrink-0 desktop:block">{picker}</div>
        </div>
      )}

      {/* Below desktop the axis goes under the verdict, with the two text actions as 44px buttons. */}
      <div className="flex flex-col gap-2 desktop:hidden">
        {picker}
        <div className="grid grid-cols-2 gap-2">{headerActions(true)}</div>
      </div>

      {selectedPeriod === 'CUSTOM' && performanceData.custom && (
        <CustomPeriodChip startDate={metrics.startDate} endDate={metrics.endDate} onClear={handleResetCustomPeriod} />
      )}

      {/* ── Tile grid ───────────────────────────────────────────────────────────── */}
      {/* No `key` on the grid (2026-09-12): a period switch TRANSFORMS every tile — the hero glides,
          the plots morph, the heatmap fades cell by cell, the bars slide — so the tiles must survive
          it. Only a refresh, which re-reads the data, dims the grid while it waits. */}
      <div
        className={cn('grid grid-cols-1 gap-3 transition-opacity duration-200 tablet:grid-cols-2 desktop:grid-cols-12', (isRefreshing || loaded.isRecomputing) && 'opacity-60')}
        aria-busy={isPendingPeriodChange || isRefreshing || loaded.isRecomputing}
      >
        <div className={cn(TILE_CELL_CLASS, 'order-1 tablet:col-span-2 desktop:order-none desktop:col-span-5')}>
          <RendimentoTile
            aside={periodAside}
            reading={
              growthSeries.baseMonth && growthSeries.portfolioEnd !== null
                ? describeGrowthOfHundred({ baseMonth: growthSeries.baseMonth, end: windowEnd, portfolioEnd: growthSeries.portfolioEnd, benchmarkEnd: growthSeries.benchmarkEnd, benchmarkName: REFERENCE_BENCHMARK.name })
                : null
            }
            heroReturn={heroReturn}
            numberOfMonths={metrics.numberOfMonths}
            benchmark={benchmark}
            benchmarkLoading={benchmark === null && isAnyBenchmarkLoading}
            benchmarkName={REFERENCE_BENCHMARK.name}
            companionReturn={companionReturnChip}
            drawdown={drawdownStatus}
            series={growthSeries}
            baseMonthLabel={baseMonthLabel}
            benchmarkCurrency={benchmarkCurrency}
          />
        </div>

        {/* «Rispetto a cosa?» is the page's question: the models sit beside the return, on a phone right after the risk tiles. */}
        <div className={cn(TILE_CELL_CLASS, 'order-4 desktop:order-none desktop:col-span-4')}>
          <BenchmarkTile
            reading={describeBenchmarkRanking(ranking)}
            ranking={ranking}
            portfolioTWR={metrics.timeWeightedReturn}
            numberOfMonths={metrics.numberOfMonths}
            portfolioLastMonth={portfolioLastMonth ? { year: portfolioLastMonth.year, month: portfolioLastMonth.month } : null}
            isLoading={isAnyBenchmarkLoading}
            currency={benchmarkCurrency}
          />
        </div>

        <div className={cn(TILE_CELL_CLASS, 'order-5 desktop:order-none desktop:col-span-3')}>
          <ContributiTile
            reading={describeContributions({
              capital: capitalEntered,
              totalMonths: metrics.numberOfMonths,
              pensionEntry: { flow: metrics.pensionEntryFlow, month: base?.pensionEntryMonth ?? null },
            })}
            capital={capitalEntered}
            numberOfMonths={metrics.numberOfMonths}
            invested={investedCapital}
            netCashFlow={metrics.netCashFlow}
            totalIncome={metrics.totalIncome}
            totalExpenses={metrics.totalExpenses}
            totalDividendIncome={metrics.totalDividendIncome}
            pensionEntryFlow={metrics.pensionEntryFlow}
            pensionInternalFlow={metrics.pensionInternalFlow}
          />
        </div>

        {/* Below the first row the grid is TWO COLUMNS from desktop (2026-09-20, Storico's answer): each
            tile keeps its natural height and the capital chart — the one element that can be any
            height — takes the slack, so no tile is stretched into a void beside a taller neighbour
            (Plusvalenze with one fiscal year is a sentence). Below desktop the wrappers are
            `contents`: the tiles are items of the grid again, in their `order-*`. */}
        <div className="contents desktop:flex desktop:flex-col desktop:gap-3 desktop:col-span-7">
          {attribution && (
            <div className={cn(TILE_CELL_CLASS, 'order-6 desktop:order-none')}>
              <AttribuzioneTile aside={periodAside} reading={describeAttribution(attribution)} attribution={attribution} />
            </div>
          )}

          <div className={cn(TILE_CELL_CLASS, 'order-8 tablet:col-span-2 desktop:order-none desktop:flex-1')}>
            <CapitaleMercatoTile
              aside={`${periodAside} · base misurata`}
              reading={lastChartPoint ? describeCapitalAndMarket(lastChartPoint, windowEnd) : null}
              data={chartData}
              pensionFlow={metrics.pensionFlow}
              flowSource={metrics.flowSource}
            />
          </div>
        </div>

        <div className="contents desktop:flex desktop:flex-col desktop:gap-3 desktop:col-span-5">
          <div className={cn(TILE_CELL_CLASS, 'order-2 desktop:order-none')}>
            <RischioTile
              reading={describeRisk({ volatility: metrics.volatility, sharpeRatio: metrics.sharpeRatio, monthsMeasured: consistency.totalMonths })}
              monthsMeasured={consistency.totalMonths}
              riskFreeRate={metrics.riskFreeRate}
              volatility={metrics.volatility}
              sharpeRatio={metrics.sharpeRatio}
              sortinoRatio={sortinoRatio}
              drawdown={drawdownStory}
            />
          </div>

          <div className={cn(TILE_CELL_CLASS, cn('order-3 desktop:order-none', !realizedSummary && 'desktop:flex-1'))}>
            <ConsistenzaTile reading={describeConsistency(consistency)} heatmap={heatmapData} />
          </div>

          {realizedSummary && (
            <div className={cn(TILE_CELL_CLASS, 'order-7 desktop:order-none')}>
              <PlusvalenzeTile reading={describeRealizedGains(realizedSummary, currentYear)} summary={realizedSummary} skippedAssets={realizedGains.skippedAssets} />
            </div>
          )}

        </div>
      </div>

      {/* ── Dettaglio, below the fold ───────────────────────────────────────────── */}
      <PerformanceDettaglio
        metrics={metrics}
        periodAside={describeWindow(metrics.startDate, metrics.endDate)}
        drawdown={drawdownStory}
        rollingCagr={rollingCagr}
        rollingSharpe={rollingSharpe}
        underwater={underwaterData}
        attribution={attribution}
        windowEnd={windowEnd}
      />

      {/* ── Dialogs ─────────────────────────────────────────────────────────────── */}
      <CustomDateRangeDialog
        open={showCustomDateDialog}
        onOpenChange={setShowCustomDateDialog}
        onConfirm={handleCustomDateRange}
        triggerOrigin={customDialogOrigin}
        returnFocusTo={customOpenerRef}
      />

      {user && ownerId && (
        <AIAnalysisDialog
          open={showAIAnalysisDialog}
          onOpenChange={setShowAIAnalysisDialog}
          metrics={metrics}
          // The modal's title IS this verdict: one sentence judging these numbers, never a
          // second phrasing of it inside the dialog (DESIGN.md → The Verdict-First Rule).
          verdict={verdict}
          timePeriod={selectedPeriod}
          userId={ownerId}
          triggerOrigin={aiDialogOrigin}
          returnFocusTo={aiOpenerRef}
        />
      )}
    </PageContainer>
  );
}
