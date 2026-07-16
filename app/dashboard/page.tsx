'use client';

import { CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import {
  staggerContainer,
  cardItem,
  heroMetricSettle,
  springLayoutTransition,
} from '@/lib/utils/motionVariants';
import { useAuth } from '@/contexts/AuthContext';
import { useActiveAccount } from '@/contexts/ActiveAccountContext';
import { updateHallOfFame } from '@/lib/services/hallOfFameService';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Camera, Receipt, TrendingDown, TrendingUp, Trophy } from 'lucide-react';
import { CashflowWidget } from '@/components/cashflow/cashflow-kpi/CashflowWidget';
import { toast } from 'sonner';
import { useCreateSnapshot } from '@/lib/hooks/useSnapshots';
import { useDashboardOverview } from '@/lib/hooks/useDashboardOverview';
import { useExpenseCategories } from '@/lib/hooks/useExpenses';
import { SavingsRateBadge } from '@/components/ui/SavingsRateBadge';
import { useMediaQuery } from '@/lib/hooks/useMediaQuery';
import { getItalyDate, getItalyMonthYear } from '@/lib/utils/dateHelpers';
import { getGreeting } from '@/lib/utils/getGreeting';
import { OverviewAnimatedCurrency } from '@/components/dashboard/OverviewAnimatedCurrency';
import { OverviewChartsSection } from '@/components/dashboard/OverviewChartsSection';
import { NetWorthSparkline } from '@/components/dashboard/NetWorthSparkline';
import { PeriodSelector, SparklinePeriod } from '@/components/dashboard/PeriodSelector';
import { useChartColors } from '@/lib/hooks/useChartColors';
import { useDemoMode } from '@/lib/hooks/useDemoMode';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import { ASSET_CLASS_CHART_INDEX } from '@/lib/utils/allocationUtils';
import { filterSparklineByPeriod } from '@/lib/utils/sparklinePeriod';
import { cn } from '@/lib/utils';
import { PageContainer } from '@/components/layout/PageContainer';
import { PageHeader } from '@/components/layout/PageHeader';

const MotionButtonShell = motion.div;

/**
 * MAIN DASHBOARD PAGE — "Bento Asimmetrico" redesign (v2)
 *
 * Layout:
 *   Mobile:  Hero → Liquid → VariationBlocks → Cashflow → [Costs] → [Fiscal] → Assets → Charts
 *   Desktop: Hero(2/3)+Liquid(1/3) → Cashflow(full) → [Costs 2-col] → [Fiscal] → Assets → Charts
 *
 * Changes from v1:
 * - Liquid card: donut replaced by flat 3-row breakdown (Liquidità/Investimenti/Illiquidi)
 * - Fiscal section: no longer collapsible, always visible when hasCostBasisTracking
 * - Asset list card: new "N Asset in Portafoglio" card with value / weight / return columns
 * - Cashflow card: full-width, 4 KPI chips + top-5 category bars; TER/Costo moved to 2-col row below
 */

// Italian month names for the cashflow card header.
const MONTH_NAMES_IT = [
  'Gennaio',
  'Febbraio',
  'Marzo',
  'Aprile',
  'Maggio',
  'Giugno',
  'Luglio',
  'Agosto',
  'Settembre',
  'Ottobre',
  'Novembre',
  'Dicembre',
];

/**
 * Sign-aware theme-token classes for financial values (gain vs loss).
 *
 * Returns the semantic tokens `text-positive` / `text-destructive` (plus the
 * matching `/10` tint for chips) so the sign color follows the active theme on
 * all six themes. Raw `text-green-*` / `text-red-*` is forbidden here: those stay
 * literal and diverge from `--destructive` on non-default themes (e.g. Cyberpunk
 * renders destructive as orange). See DESIGN.md "The Sign-Color Token Rule".
 * Zero is treated as positive, matching the previous chip/fiscal behaviour.
 */
const signTextClass = (value: number): string =>
  value >= 0 ? 'text-positive' : 'text-destructive';

const signChipClass = (value: number): string =>
  value >= 0 ? 'bg-positive/10 text-positive' : 'bg-destructive/10 text-destructive';

export default function DashboardPage() {
  const { user } = useAuth();
  const { ownerId } = useActiveAccount();
  const isDemo = useDemoMode();
  const prefersReducedMotion = useReducedMotion();

  const greeting = useMemo(() => {
    const italyHour = getItalyDate(new Date()).getHours();
    const result = getGreeting(italyHour);
    const firstName = user?.displayName?.split(' ')[0];
    const label =
      firstName && firstName.length <= 20 ? `${result.greeting} ${firstName}` : result.greeting;
    return { label, subtitle: result.subtitle };
  }, [user?.displayName]);

  const { data: overview, isLoading: loadingOverview } = useDashboardOverview(ownerId);
  const { data: expenseCategories = [] } = useExpenseCategories(ownerId);
  const createSnapshotMutation = useCreateSnapshot(ownerId || '');

  const loading = loadingOverview;

  // ─── UI State ─────────────────────────────────────────────────────────────────
  const [creatingSnapshot, setCreatingSnapshot] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [snapshotDialogStyle, setSnapshotDialogStyle] = useState<CSSProperties | undefined>(
    undefined,
  );

  const snapshotButtonRef = useRef<HTMLButtonElement | null>(null);
  const snapshotDialogRef = useRef<HTMLDivElement | null>(null);

  const isMobile = useMediaQuery('(max-width: 1439px)');
  const chartColors = useChartColors();

  // heroSettled becomes true when the Patrimonio Totale Lordo count-up completes.
  const [heroSettled, setHeroSettled] = useState(false);
  const handleHeroSettled = useCallback(() => setHeroSettled(true), []);

  // Hero sparkline period control — defaults to 1A, matching the previous fixed behaviour.
  const [sparklinePeriod, setSparklinePeriod] = useState<SparklinePeriod>('1A');

  // ─── Derived metrics ──────────────────────────────────────────────────────────
  const totalValue = overview?.metrics.totalValue ?? 0;

  const savingsRate = useMemo(() => {
    if (!overview?.expenseStats) return 0;
    const { income, expenses } = overview.expenseStats.currentMonth;
    if (income <= 0) return 0;
    return Math.round(((income - expenses) / income) * 100);
  }, [overview?.expenseStats]);

  // Coverage ratio (income / expenses) for RAPPORTO KPI chip.
  const coverageRatio = useMemo(() => {
    if (!overview?.expenseStats) return null;
    const { income, expenses } = overview.expenseStats.currentMonth;
    if (expenses <= 0) return null;
    return income / expenses;
  }, [overview]);

  // ─── Sparkline — displayed range follows the period pill; a fixed last-13-points
  // (12 months + baseline) copy is kept separately for the "Ultimi 12 mesi" reassurance
  // line, which stays anchored to a full year regardless of what period is selected. ──
  const sparklineDisplay = useMemo(() => {
    if (!overview?.sparklineData) return [];
    return filterSparklineByPeriod(overview.sparklineData, sparklinePeriod);
  }, [overview, sparklinePeriod]);

  const sparkline12mFixed = useMemo(() => {
    if (!overview?.sparklineData) return [];
    return overview.sparklineData.slice(-13);
  }, [overview]);

  // Long-run (12m) context shown only when the monthly chip is negative, so a red
  // month always has an offsetting figure in the same glance (DESIGN.md deference —
  // no copy, just another real number, always available whenever the sparkline is).
  const longRunChangePercent = useMemo(() => {
    if (sparkline12mFixed.length < 2) return null;
    const first = sparkline12mFixed[0].totalNetWorth;
    const last = sparkline12mFixed[sparkline12mFixed.length - 1].totalNetWorth;
    if (first === 0) return null;
    return ((last - first) / Math.abs(first)) * 100;
  }, [sparkline12mFixed]);

  // Overflow guard for the hero number (P1): a 7-8 figure net worth at 44/54px in a
  // ~346px mobile card can wrap or clip. Step down to a smaller size once the formatted
  // string gets long, rather than letting the single most important number on the page overflow.
  const heroValueClass = useMemo(() => {
    const formattedLength = cachedFormatCurrencyEUR(totalValue).length;
    return cn(
      'font-mono font-bold tracking-[-0.03em] tabular-nums',
      formattedLength > 13 ? 'text-[32px] desktop:text-[40px]' : 'desktop:text-[54px] text-[44px]',
    );
  }, [totalValue]);

  // ─── Chart sections (stable memoized objects for memo isolation) ──────────────
  // Liquidity chart removed — now shown as the hero donut in the Patrimonio Liquido card.
  const chartSections = useMemo(
    () =>
      [
        {
          id: 'assetClass',
          title: 'Distribuzione per Asset Class',
          // Remap by the shared ASSET_CLASS_CHART_INDEX (not positional index) so a
          // class renders the same color here as on Allocazione/Storico — a positional
          // remap drifts whenever object key iteration order changes.
          data: (overview?.charts.assetClassData ?? []).map((d) => ({
            ...d,
            color: chartColors[ASSET_CLASS_CHART_INDEX[d.assetClass ?? ''] ?? 0] ?? d.color,
          })),
        },
        {
          id: 'asset',
          title: 'Distribuzione per Asset',
          data: (overview?.charts.assetData ?? []).map((d, i) => ({
            ...d,
            color: chartColors[i] ?? d.color,
          })),
        },
      ] as const,
    [overview, chartColors],
  );

  // ─── Dialog position animation ────────────────────────────────────────────────
  useEffect(() => {
    // When closed or with reduced motion we don't compute a transform-origin.
    // The style is cleared by the onOpenChange handler on close, so no synchronous
    // setState is needed here (avoids react-hooks/set-state-in-effect).
    if (!showConfirmDialog || prefersReducedMotion) return;
    const frameId = requestAnimationFrame(() => {
      const trigger = snapshotButtonRef.current;
      const dialog = snapshotDialogRef.current;
      if (!trigger || !dialog) {
        setSnapshotDialogStyle(undefined);
        return;
      }
      const triggerRect = trigger.getBoundingClientRect();
      const dialogRect = dialog.getBoundingClientRect();
      const originX = triggerRect.left + triggerRect.width / 2 - dialogRect.left;
      const originY = triggerRect.top + triggerRect.height / 2 - dialogRect.top;
      setSnapshotDialogStyle({ transformOrigin: `${originX}px ${originY}px` });
    });
    return () => cancelAnimationFrame(frameId);
  }, [showConfirmDialog, prefersReducedMotion]);

  const currentMonthReference = useMemo(() => getItalyMonthYear(), []);

  // ─── Snapshot handlers ────────────────────────────────────────────────────────
  const handleCreateSnapshot = async () => {
    if (!user || !ownerId) return;
    try {
      if (overview?.flags.currentMonthSnapshotExists) {
        setShowConfirmDialog(true);
      } else {
        await createSnapshot();
      }
    } catch (error) {
      console.error('Error checking existing snapshots:', error);
      toast.error('Errore nel controllo degli snapshot esistenti');
    }
  };

  const createSnapshot = async () => {
    if (!user || !ownerId) return;
    try {
      setCreatingSnapshot(true);
      setShowConfirmDialog(false);
      toast.loading('Aggiornamento prezzi e creazione snapshot...', { id: 'snapshot-creation' });
      const result = await createSnapshotMutation.mutateAsync({});
      toast.dismiss('snapshot-creation');
      toast.success(result.message);
      try {
        await updateHallOfFame(ownerId);
      } catch {
        /* non-critical */
      }
    } catch (error) {
      console.error('Error creating snapshot:', error);
      toast.dismiss('snapshot-creation');
      toast.error('Errore nella creazione dello snapshot');
    } finally {
      setCreatingSnapshot(false);
    }
  };

  // ─── Loading skeleton ─────────────────────────────────────────────────────────
  if (loading) {
    return (
      <PageContainer className="space-y-4">
        <div className="border-border border-b pb-4">
          <div className="bg-muted mb-2 h-3 w-20 animate-pulse rounded" />
          <div className="bg-muted mb-2 h-8 w-56 animate-pulse rounded" />
          <div className="bg-muted h-4 w-44 animate-pulse rounded" />
        </div>
        {/* Hero + Liquid skeleton — mirrors the desktop:grid-cols-[2fr_1fr] live layout */}
        <div className="desktop:grid-cols-[2fr_1fr] grid gap-4">
          <div className="border-border bg-card rounded-2xl border p-[22px]">
            <div className="bg-muted mb-3 h-3 w-40 animate-pulse rounded" />
            <div className="bg-muted mb-4 h-12 w-52 animate-pulse rounded" />
            <div className="mb-3 flex gap-1.5">
              <div className="bg-muted h-6 w-40 animate-pulse rounded" />
              <div className="bg-muted h-6 w-28 animate-pulse rounded" />
            </div>
            <div className="bg-muted mb-2 h-[68px] animate-pulse rounded" />
            <div className="bg-muted h-7 animate-pulse rounded" />
          </div>
          <div className="border-border bg-card rounded-2xl border p-[22px]">
            <div className="bg-muted mb-3 h-3 w-32 animate-pulse rounded" />
            <div className="bg-muted mb-4 h-8 w-36 animate-pulse rounded" />
            <div className="space-y-2">
              <div className="bg-muted h-4 animate-pulse rounded" />
              <div className="bg-muted h-4 animate-pulse rounded" />
              <div className="bg-muted h-4 animate-pulse rounded" />
              <div className="bg-muted h-4 animate-pulse rounded" />
            </div>
          </div>
        </div>
        {/* Cashflow skeleton */}
        <div className="border-border bg-card rounded-2xl border p-[22px]">
          <div className="bg-muted mb-4 h-3 w-36 animate-pulse rounded" />
          <div className="desktop:grid-cols-4 mb-4 grid grid-cols-2 gap-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="bg-muted h-16 animate-pulse rounded-xl p-3" />
            ))}
          </div>
          <div className="bg-muted mb-3 h-3 animate-pulse rounded" />
          <div className="desktop:grid-cols-2 grid gap-4">
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="bg-muted h-6 animate-pulse rounded" />
              ))}
            </div>
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="bg-muted h-6 animate-pulse rounded" />
              ))}
            </div>
          </div>
        </div>

        {/* Charts skeleton — mirrors OverviewChartsSection structure */}
        <div className="border-border/40 border-t pt-4">
          <div className="bg-muted mb-4 h-3 w-24 animate-pulse rounded" />
          <div className="desktop:grid-cols-2 grid gap-4">
            <div className="bg-muted h-[220px] animate-pulse rounded-2xl" />
            <div className="bg-muted h-[220px] animate-pulse rounded-2xl" />
          </div>
        </div>
      </PageContainer>
    );
  }

  // ─── Render ───────────────────────────────────────────────────────────────────
  return (
    <motion.div
      layout="position"
      transition={springLayoutTransition}
      className="max-desktop:portrait:pb-20 mx-auto w-full max-w-[1600px] space-y-4"
    >
      <PageHeader
        label="Panoramica"
        title={greeting.label}
        description={greeting.subtitle}
        actions={
          <MotionButtonShell
            whileTap={prefersReducedMotion ? undefined : { scale: 0.97 }}
            transition={springLayoutTransition}
          >
            <Button
              ref={snapshotButtonRef}
              onClick={handleCreateSnapshot}
              disabled={isDemo || creatingSnapshot || (overview?.flags.assetCount ?? 0) === 0}
              title={isDemo ? 'Non disponibile in modalità demo' : undefined}
              variant="default"
              className="w-full sm:w-auto"
            >
              <Camera className="mr-2 h-4 w-4" aria-hidden="true" />
              {creatingSnapshot ? 'Creazione...' : 'Crea Snapshot'}
            </Button>
          </MotionButtonShell>
        }
      />

      {/* ── HERO + LIQUID — desktop: 2/3 + 1/3 grid ── */}
      <motion.section
        aria-label="Patrimonio"
        layout="position"
        transition={springLayoutTransition}
        variants={staggerContainer}
        initial="hidden"
        animate="visible"
      >
        <div className="desktop:grid-cols-[2fr_1fr] grid gap-4">
          {/* Hero Card */}
          <motion.div
            layout="position"
            transition={springLayoutTransition}
            variants={heroMetricSettle}
          >
            <Card className="h-full overflow-hidden rounded-2xl">
              <CardContent className="flex h-full flex-col p-[22px]">
                <p className="text-muted-foreground mb-2 text-[10px] font-semibold tracking-[0.1em] uppercase">
                  Patrimonio Totale Lordo
                </p>

                {/* Animated number — heroValueClass steps down for very long formatted values */}
                <OverviewAnimatedCurrency
                  value={totalValue}
                  animateOnMount={true}
                  onSettled={handleHeroSettled}
                  className={heroValueClass}
                />

                {/* Variation chips */}
                <div className="mt-2 flex flex-wrap gap-2">
                  {overview?.variations.monthly && (
                    <span
                      className={cn(
                        'inline-flex items-center gap-2 rounded-[9px] px-[13px] py-[6px]',
                        'font-mono text-[15px] font-semibold tracking-[-0.01em]',
                        signChipClass(overview.variations.monthly.value),
                      )}
                    >
                      {overview.variations.monthly.value >= 0 ? (
                        <TrendingUp className="h-[13px] w-[13px]" aria-hidden="true" />
                      ) : (
                        <TrendingDown className="h-[13px] w-[13px]" aria-hidden="true" />
                      )}
                      {overview.variations.monthly.value >= 0 ? '+' : ''}
                      {cachedFormatCurrencyEUR(overview.variations.monthly.value)} (
                      {overview.variations.monthly.percentage >= 0 ? '+' : ''}
                      {overview.variations.monthly.percentage.toFixed(2)}%) questo mese
                    </span>
                  )}
                  {overview?.variations.yearly && (
                    <span
                      className={cn(
                        'inline-flex items-center gap-2 rounded-[9px] px-[13px] py-[6px]',
                        'font-mono text-[15px] font-semibold tracking-[-0.01em]',
                        signChipClass(overview.variations.yearly.value),
                      )}
                    >
                      {overview.variations.yearly.value >= 0 ? (
                        <TrendingUp className="h-[13px] w-[13px]" aria-hidden="true" />
                      ) : (
                        <TrendingDown className="h-[13px] w-[13px]" aria-hidden="true" />
                      )}
                      {overview.variations.yearly.value >= 0 ? '+' : ''}
                      {cachedFormatCurrencyEUR(overview.variations.yearly.value)} (
                      {overview.variations.yearly.percentage >= 0 ? '+' : ''}
                      {overview.variations.yearly.percentage.toFixed(2)}%) YTD
                    </span>
                  )}
                  {overview?.ath?.isNewATH && (
                    <span className="bg-positive/10 text-positive inline-flex items-center gap-2 rounded-[9px] px-[13px] py-[6px] font-mono text-[15px] font-semibold tracking-[-0.01em]">
                      <Trophy className="h-[13px] w-[13px]" aria-hidden="true" />
                      Nuovo massimo storico
                    </span>
                  )}
                </div>

                {/* Long-run reassurance — only when the monthly chip is negative, so a red
                    month always has an offsetting figure in the same glance. */}
                {overview?.variations.monthly &&
                  overview.variations.monthly.value < 0 &&
                  longRunChangePercent !== null && (
                    <p
                      className={cn(
                        'mt-1.5 font-mono text-[12px] tabular-nums',
                        signTextClass(longRunChangePercent),
                      )}
                    >
                      Ultimi 12 mesi: {longRunChangePercent >= 0 ? '+' : ''}
                      {longRunChangePercent.toFixed(1)}%
                    </p>
                  )}

                {/* Sparkline period control */}
                {(overview?.sparklineData?.length ?? 0) >= 2 && (
                  <div className="mt-3">
                    <PeriodSelector value={sparklinePeriod} onChange={setSparklinePeriod} />
                  </div>
                )}

                {/* Area sparkline — displayed range follows the period pill, edge-to-edge via -mx-[22px] */}
                {sparklineDisplay.length >= 2 && (
                  <>
                    <div className="-mx-[22px] mt-3" style={{ height: 68 }}>
                      <NetWorthSparkline
                        data={sparklineDisplay}
                        filled={true}
                        color="var(--chart-1)"
                        height={68}
                      />
                    </div>
                    <div className="text-muted-foreground mt-1 mb-3 flex justify-between px-px font-mono text-[10px]">
                      <span>{cachedFormatCurrencyEUR(sparklineDisplay[0].totalNetWorth, true)}</span>
                      <span>
                        {cachedFormatCurrencyEUR(
                          sparklineDisplay[sparklineDisplay.length - 1].totalNetWorth,
                          true,
                        )}
                      </span>
                    </div>
                  </>
                )}

                {/* "Guidato da" digest — the 1-2 asset classes that moved the most this month. */}
                {overview?.topMovers && overview.topMovers.length > 0 && (
                  <p className="text-muted-foreground mt-0.5 text-[11px] truncate">
                    Guidato da:{' '}
                    {overview.topMovers.map((mover, i) => (
                      <span key={mover.assetClass}>
                        {i > 0 && ' · '}
                        {mover.label}{' '}
                        <span className={cn('font-mono tabular-nums', signTextClass(mover.delta))}>
                          {mover.delta >= 0 ? '+' : ''}
                          {cachedFormatCurrencyEUR(mover.delta, true)}
                        </span>
                      </span>
                    ))}
                  </p>
                )}

                <p className="text-muted-foreground mt-1 text-[11px]">
                  {(overview?.flags.assetCount ?? 0) === 0
                    ? 'Aggiungi asset per iniziare'
                    : `${overview?.flags.assetCount ?? 0} asset in portafoglio`}
                </p>

                {/* ── TER + Costo Annuale — desktop only, pinned to bottom of hero card ── */}
                {(overview?.flags.hasTERTracking || overview?.flags.hasStampDuty) &&
                  (() => {
                    const annualTotal =
                      (overview.metrics.annualPortfolioCost ?? 0) +
                      (overview.metrics.annualStampDuty ?? 0);
                    const bothPresent =
                      overview.flags.hasTERTracking && overview.flags.hasStampDuty;
                    return (
                      <div className="desktop:grid border-border mt-auto hidden grid-cols-2 gap-4 border-t pt-4">
                        {overview.flags.hasTERTracking && (
                          <div>
                            <p className="text-muted-foreground mb-2 text-[10px] font-semibold tracking-[0.1em] uppercase">
                              TER Medio Ponderato
                            </p>
                            <p className="text-foreground font-mono text-[22px] leading-none font-bold tracking-[-0.025em] tabular-nums">
                              {overview.metrics.portfolioTER.toFixed(2)}%
                            </p>
                          </div>
                        )}
                        <div className={cn(!overview.flags.hasTERTracking && 'col-span-2')}>
                          <p className="text-muted-foreground mb-2 text-[10px] font-semibold tracking-[0.1em] uppercase">
                            Costo Annuale Stimato
                          </p>
                          <p className="text-warning-foreground font-mono text-[22px] leading-none font-bold tracking-[-0.025em] tabular-nums">
                            {cachedFormatCurrencyEUR(annualTotal)}
                          </p>
                          {bothPresent && (
                            <div className="border-border divide-border mt-2 divide-y border-t pt-2">
                              <div className="flex justify-between py-[4px] text-[11px]">
                                <span className="text-muted-foreground">
                                  Costi di gestione (TER)
                                </span>
                                <span className="text-foreground font-mono tabular-nums">
                                  {cachedFormatCurrencyEUR(overview.metrics.annualPortfolioCost)}
                                </span>
                              </div>
                              <div className="flex justify-between py-[4px] text-[11px]">
                                <span className="text-muted-foreground">Imposta di bollo</span>
                                <span className="text-foreground font-mono tabular-nums">
                                  {cachedFormatCurrencyEUR(overview.metrics.annualStampDuty)}
                                </span>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })()}
              </CardContent>
            </Card>
          </motion.div>

          {/* ── LIQUID CARD — redesigned: flat 3-row breakdown ── */}
          <motion.div layout="position" transition={springLayoutTransition} variants={cardItem}>
            <Card className="h-full rounded-2xl">
              <CardContent className="p-[22px]">
                <p className="text-muted-foreground mb-2 text-[10px] font-semibold tracking-[0.1em] uppercase">
                  Sintesi Patrimoniale
                </p>

                {/* Breakdown by class + total footer. Only meaningful once there is value to split. */}
                {totalValue > 0 ? (
                <div className="border-border divide-border divide-y border-t pt-3">
                  {[
                    {
                      label: 'Liquidità',
                      value: overview?.metrics.cashNetWorth ?? 0,
                      pct:
                        totalValue > 0
                          ? ((overview?.metrics.cashNetWorth ?? 0) / totalValue) * 100
                          : 0,
                    },
                    {
                      label: 'Investimenti Liquidabili',
                      value: overview?.metrics.liquidInvestmentsNetWorth ?? 0,
                      pct:
                        totalValue > 0
                          ? ((overview?.metrics.liquidInvestmentsNetWorth ?? 0) / totalValue) * 100
                          : 0,
                    },
                    {
                      label: 'Investimenti Illiquidi',
                      value: overview?.metrics.illiquidNetWorth ?? 0,
                      pct:
                        totalValue > 0
                          ? ((overview?.metrics.illiquidNetWorth ?? 0) / totalValue) * 100
                          : 0,
                    },
                  ].map((row) => (
                    <div key={row.label} className="flex items-center justify-between py-[7px]">
                      <span className="text-muted-foreground text-[14px]">{row.label}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-foreground font-mono text-[14px] tabular-nums">
                          {cachedFormatCurrencyEUR(row.value)}
                        </span>
                        <span className="text-muted-foreground w-[42px] text-right font-mono text-[12px] tabular-nums">
                          {row.pct.toFixed(1)}%
                        </span>
                      </div>
                    </div>
                  ))}

                  {/* Bottom row: total (bold). The breakdown above sums to this. */}
                  <div className="flex items-center justify-between py-[7px]">
                    <span className="text-foreground text-[14px] font-semibold">Totale</span>
                    <div className="flex items-center gap-2">
                      <span className="text-foreground font-mono text-[14px] font-bold tabular-nums">
                        {cachedFormatCurrencyEUR(totalValue)}
                      </span>
                      <span className="text-muted-foreground w-[42px] text-right font-mono text-[12px] tabular-nums">
                        100.0%
                      </span>
                    </div>
                  </div>
                </div>
                ) : (
                  <div className="border-border border-t pt-3">
                    <p className="text-muted-foreground text-[13px]">
                      Il riepilogo per classe apparirà dopo il primo asset.
                    </p>
                  </div>
                )}

                {/* ── Fiscal rows — shown only when cost basis tracking is enabled ── */}
                {overview?.flags.hasCostBasisTracking && overview.metrics && (
                  <div className="border-border divide-border mt-3 divide-y border-t pt-3">
                    <p className="text-muted-foreground pb-2 text-[10px] font-semibold tracking-[0.1em] uppercase">
                      Impatto Fiscale
                    </p>
                    {[
                      {
                        label: 'Plusvalenze Non Realizzate',
                        value: overview.metrics.unrealizedGains,
                        className: signTextClass(overview.metrics.unrealizedGains),
                        prefix: overview.metrics.unrealizedGains >= 0 ? '+' : '',
                      },
                      {
                        label: 'Tasse Stimate',
                        value: overview.metrics.estimatedTaxes,
                        className: 'text-warning-foreground',
                        prefix: '',
                      },
                      {
                        label: 'Patrimonio Liquidabile Netto',
                        value: overview.metrics.liquidNetTotal,
                        className: 'text-foreground',
                        prefix: '',
                      },
                      {
                        label: 'Patrimonio Illiquido Netto',
                        value: overview.metrics.netTotal - overview.metrics.liquidNetTotal,
                        className: 'text-foreground',
                        prefix: '',
                      },
                    ].map((row) => (
                      <div key={row.label} className="flex items-center justify-between py-[7px]">
                        <span className="text-muted-foreground text-[14px]">{row.label}</span>
                        <span
                          className={cn(
                            'font-mono text-[14px] font-bold tabular-nums',
                            row.className,
                          )}
                        >
                          {row.prefix}
                          {cachedFormatCurrencyEUR(row.value)}
                        </span>
                      </div>
                    ))}

                    {/* Concluding row: Pat. Netto Totale. Kept at the same 14px bold tier as
                        the subtotal rows above it (not promoted past them) — a subtotal
                        derived from the ones above, not a second dominant total. */}
                    <div className="flex items-center justify-between py-[9px]">
                      <span className="text-foreground text-[14px] font-semibold">
                        Pat. Netto Totale
                      </span>
                      <span className="text-foreground font-mono text-[14px] font-bold tracking-[-0.01em] tabular-nums">
                        {cachedFormatCurrencyEUR(overview.metrics.netTotal)}
                      </span>
                    </div>
                  </div>
                )}

                {/* Featured Goal-Based Investing progress — the single most relevant
                    in-progress goal, thin category bar reusing the goal's own color. */}
                {overview?.goalProgress && (
                  <div className="border-border mt-3 border-t pt-3">
                    <div className="mb-1.5 flex items-center justify-between gap-2">
                      <span className="text-muted-foreground min-w-0 truncate text-[10px] font-semibold tracking-[0.1em] uppercase">
                        Obiettivo · {overview.goalProgress.goalName}
                      </span>
                      <span className="text-foreground font-mono text-[12px] font-semibold tabular-nums">
                        {Math.round(overview.goalProgress.progressPercentage)}%
                      </span>
                    </div>
                    <div className="bg-muted h-[3px] overflow-hidden rounded-full">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${Math.min(100, overview.goalProgress.progressPercentage)}%`,
                          background: overview.goalProgress.goalColor,
                        }}
                      />
                    </div>
                    <p className="text-muted-foreground mt-1.5 font-mono text-[11px] tabular-nums">
                      {cachedFormatCurrencyEUR(overview.goalProgress.currentValue, true)} di{' '}
                      {cachedFormatCurrencyEUR(overview.goalProgress.targetAmount, true)}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </motion.section>

      {/* ── TER + COSTO ANNUALE — 2-col row (both platforms) ── */}
      {(overview?.flags.hasTERTracking || overview?.flags.hasStampDuty) &&
        (() => {
          const annualTotal =
            (overview.metrics.annualPortfolioCost ?? 0) + (overview.metrics.annualStampDuty ?? 0);
          const bothPresent = overview.flags.hasTERTracking && overview.flags.hasStampDuty;
          return (
            <motion.div
              layout="position"
              transition={springLayoutTransition}
              variants={cardItem}
              initial="hidden"
              animate="visible"
              className="desktop:hidden grid grid-cols-2 gap-4"
            >
              {/* TER medio */}
              {overview.flags.hasTERTracking && (
                <div className="bg-card border-border flex flex-col justify-between rounded-2xl border p-5">
                  <span className="text-muted-foreground text-[10px] font-semibold tracking-[0.1em] uppercase">
                    TER Medio Ponderato
                  </span>
                  <div>
                    <p className="text-foreground mt-3 font-mono text-[22px] leading-none font-bold tracking-[-0.025em] tabular-nums">
                      {overview.metrics.portfolioTER.toFixed(2)}%
                    </p>
                    <p className="text-muted-foreground mt-2 text-[10px]">
                      Total Expense Ratio medio ponderato
                    </p>
                  </div>
                </div>
              )}

              {/* Costo annuale */}
              <div
                className={cn(
                  'bg-card border-border flex flex-col justify-between rounded-2xl border p-5',
                  !overview.flags.hasTERTracking && 'col-span-2',
                )}
              >
                <span className="text-muted-foreground text-[10px] font-semibold tracking-[0.1em] uppercase">
                  Costo Annuale Stimato
                </span>
                <div>
                  <p className="text-warning-foreground mt-3 font-mono text-[22px] leading-none font-bold tracking-[-0.025em] tabular-nums">
                    {cachedFormatCurrencyEUR(annualTotal)}
                  </p>
                  {bothPresent && (
                    <div className="border-border divide-border mt-3 space-y-0 divide-y border-t pt-3">
                      <div className="flex justify-between py-[5px] text-[11px]">
                        <span className="text-muted-foreground">Costi di gestione (TER)</span>
                        <span className="text-foreground font-mono tabular-nums">
                          {cachedFormatCurrencyEUR(overview.metrics.annualPortfolioCost)}
                        </span>
                      </div>
                      <div className="flex justify-between py-[5px] text-[11px]">
                        <span className="text-muted-foreground">Imposta di bollo</span>
                        <span className="text-foreground font-mono tabular-nums">
                          {cachedFormatCurrencyEUR(overview.metrics.annualStampDuty)}
                        </span>
                      </div>
                    </div>
                  )}
                  {!bothPresent && (
                    <p className="text-muted-foreground mt-2 text-[10px]">
                      {overview.flags.hasTERTracking
                        ? 'Costi di gestione annuali stimati'
                        : 'Imposta di bollo annuale stimata'}
                    </p>
                  )}
                </div>
              </div>
            </motion.div>
          );
        })()}

      {/* ── CASHFLOW CARD ── */}
      {overview?.expenseStats &&
        (() => {
          const { income, expenses, net } = overview.expenseStats.currentMonth;
          const { income: incomeDelta, expenses: expensesDelta } = overview.expenseStats.delta;
          const { month: italyMonth, year: italyYear } = getItalyMonthYear();
          const monthLabel = `${MONTH_NAMES_IT[italyMonth - 1].toUpperCase()} ${italyYear}`;

          return (
            <motion.div
              layout="position"
              transition={springLayoutTransition}
              variants={cardItem}
              initial="hidden"
              animate="visible"
            >
              <CashflowWidget
                monthLabel={monthLabel}
                income={income}
                expenses={expenses}
                net={net}
                ratio={coverageRatio}
                incomeDelta={incomeDelta}
                expensesDelta={expensesDelta}
                savingsRate={savingsRate}
                expenseCategories={overview.expenseStats.topExpenseCategories}
                incomeCategories={overview.expenseStats.topIncomeCategories}
                categories={expenseCategories}
                className="rounded-2xl"
              />
            </motion.div>
          );
        })()}
      {/* No cashflow data fallback */}
      {!overview?.expenseStats && (
        <motion.div
          layout="position"
          transition={springLayoutTransition}
          variants={cardItem}
          initial="hidden"
          animate="visible"
        >
          <Card className="rounded-2xl">
            <CardContent className="p-[22px]">
              <p className="text-muted-foreground mb-3 text-[10px] font-semibold tracking-[0.1em] uppercase">
                Cashflow
              </p>
              <div className="text-muted-foreground flex items-center gap-2 text-sm">
                <Receipt className="h-4 w-4" aria-hidden="true" />
                <span>Nessun dato questo mese</span>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* ── CHARTS SECTION ── */}
      <OverviewChartsSection
        sections={chartSections}
        heroSettled={heroSettled}
        isMobile={isMobile}
        prefersReducedMotion={!!prefersReducedMotion}
      />

      {/* ── SNAPSHOT CONFIRM DIALOG ── */}
      <Dialog
        open={showConfirmDialog}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setSnapshotDialogStyle(undefined);
          setShowConfirmDialog(nextOpen);
        }}
      >
        <DialogContent
          ref={snapshotDialogRef}
          style={snapshotDialogStyle}
          className="data-[state=open]:zoom-in-90 data-[state=closed]:zoom-out-100 data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0 duration-300 sm:max-w-md"
          showCloseButton={false}
        >
          <DialogHeader>
            <p className="text-muted-foreground text-xs font-medium tracking-widest uppercase">
              Snapshot mensile
            </p>
            <DialogTitle>Snapshot già esistente</DialogTitle>
            <DialogDescription>
              Esiste già uno snapshot per questo mese (
              {`${String(currentMonthReference.month).padStart(2, '0')}/${currentMonthReference.year}`}
              ). Vuoi sovrascriverlo con i dati attuali?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowConfirmDialog(false)}
              disabled={creatingSnapshot}
            >
              Annulla
            </Button>
            <Button onClick={createSnapshot} disabled={creatingSnapshot}>
              {creatingSnapshot ? 'Creazione...' : 'Sovrascrivi'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Savings rate celebration badge */}
      {overview?.expenseStats && (
        <SavingsRateBadge
          previousMonthIncome={overview.expenseStats.previousMonth.income}
          previousMonthExpenses={overview.expenseStats.previousMonth.expenses}
        />
      )}
    </motion.div>
  );
}
