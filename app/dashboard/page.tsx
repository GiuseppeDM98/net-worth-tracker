'use client';

import { CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import {
  staggerContainer,
  cardItem,
  heroMetricSettle,
  springLayoutTransition,
} from '@/lib/utils/motionVariants';
import { useAuth } from '@/contexts/AuthContext';
import { formatCurrency } from '@/lib/services/chartService';
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
import { Collapsible, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Camera, ChevronDown, Receipt, TrendingDown, TrendingUp } from 'lucide-react';
import { toast } from 'sonner';
import { useCreateSnapshot } from '@/lib/hooks/useSnapshots';
import { useDashboardOverview } from '@/lib/hooks/useDashboardOverview';
import { SavingsRateBadge } from '@/components/ui/SavingsRateBadge';
import { useMediaQuery } from '@/lib/hooks/useMediaQuery';
import { getItalyDate, getItalyMonthYear } from '@/lib/utils/dateHelpers';
import { getGreeting } from '@/lib/utils/getGreeting';
import { OverviewAnimatedCurrency } from '@/components/dashboard/OverviewAnimatedCurrency';
import { OverviewChartsSection } from '@/components/dashboard/OverviewChartsSection';
import { NetWorthSparkline } from '@/components/dashboard/NetWorthSparkline';
import { SavingsRingChart } from '@/components/dashboard/SavingsRingChart';
import { useChartColors } from '@/lib/hooks/useChartColors';
import { useDemoMode } from '@/lib/hooks/useDemoMode';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import { cn } from '@/lib/utils';

const MotionButtonShell = motion.div;

/**
 * MAIN DASHBOARD PAGE — "Bento Asimmetrico" redesign
 *
 * Layout:
 *   Mobile:  Hero → Liquid → VariationBlocks → [Fiscal] → Cashflow → [Costs] → Charts
 *   Desktop: Hero(2/3)+Liquid(1/3) → BentoRow(4-col) → [Fiscal] → Charts(3-col)
 *
 * All existing data is preserved; only presentation changes.
 */


export default function DashboardPage() {
  const { user } = useAuth();
  const isDemo = useDemoMode();
  const prefersReducedMotion = useReducedMotion();

  const greeting = useMemo(() => {
    const italyHour = getItalyDate(new Date()).getHours();
    const result = getGreeting(italyHour);
    const firstName = user?.displayName?.split(' ')[0];
    const label = firstName && firstName.length <= 20
      ? `${result.greeting} ${firstName}`
      : result.greeting;
    return { label, subtitle: result.subtitle };
  }, [user?.displayName]);

  const { data: overview, isLoading: loadingOverview } = useDashboardOverview(user?.uid);
  const createSnapshotMutation = useCreateSnapshot(user?.uid || '');

  const loading = loadingOverview;

  // ─── UI State ─────────────────────────────────────────────────────────────────
  const [creatingSnapshot, setCreatingSnapshot] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  // Fiscal detail section — starts closed (user opens on demand)
  const [costBasisOpen, setCostBasisOpen] = useState(false);
  // Liquid card expandable detail
  const [liquidExpanded, setLiquidExpanded] = useState(false);
  const [snapshotDialogStyle, setSnapshotDialogStyle] = useState<CSSProperties | undefined>(undefined);

  const snapshotButtonRef = useRef<HTMLButtonElement | null>(null);
  const snapshotDialogRef = useRef<HTMLDivElement | null>(null);

  const isMobile = useMediaQuery('(max-width: 1439px)');
  const chartColors = useChartColors();

  // heroSettled becomes true when the Patrimonio Totale Lordo count-up completes.
  const [heroSettled, setHeroSettled] = useState(false);
  const handleHeroSettled = useCallback(() => setHeroSettled(true), []);

  // ─── Derived metrics ──────────────────────────────────────────────────────────
  const totalValue = overview?.metrics.totalValue ?? 0;
  const liquidValue = overview?.metrics.liquidNetWorth ?? 0;
  const liquidPercent = totalValue > 0 ? (liquidValue / totalValue) * 100 : 0;
  const investedAmount = totalValue - liquidValue;

  const savingsRate = useMemo(() => {
    if (!overview?.expenseStats) return 0;
    const { income, expenses } = overview.expenseStats.currentMonth;
    if (income <= 0) return 0;
    return Math.round(((income - expenses) / income) * 100);
  }, [overview?.expenseStats]);

  // ─── Sparkline — last 13 points (12 months + baseline) ──────────────────────
  const sparkline12m = useMemo(() => {
    if (!overview?.sparklineData) return [];
    return overview.sparklineData.slice(-13);
  }, [overview?.sparklineData]);

  // ─── Fiscal detail items (must be before early return — hooks rule) ─────────────
  // Inline JSX in the return reads this; see note below near the render section.
  const fiscalItems = useMemo(() => {
    if (!overview?.flags.hasCostBasisTracking || !overview.metrics) return [];
    return [
      {
        label: 'Pat. Netto Totale',
        value: overview.metrics.netTotal,
        className: 'text-foreground',
        prefix: '',
      },
      {
        label: 'Liquido Netto',
        value: overview.metrics.liquidNetTotal,
        className: 'text-[var(--chart-2)]',
        prefix: '',
      },
      {
        label: 'Plusvalenze',
        value: overview.metrics.unrealizedGains,
        className: overview.metrics.unrealizedGains >= 0
          ? 'text-green-500 dark:text-green-400'
          : 'text-red-500 dark:text-red-400',
        prefix: overview.metrics.unrealizedGains >= 0 ? '+' : '',
      },
      {
        label: 'Tasse Stimate',
        value: overview.metrics.estimatedTaxes,
        className: 'text-amber-500 dark:text-amber-400',
        prefix: '',
      },
    ];
  }, [overview]);

  // ─── Chart sections (stable memoized objects for memo isolation) ──────────────
  // Liquidity chart removed — now shown as the hero donut in the Patrimonio Liquido card.
  const chartSections = useMemo(() => [
    {
      id: 'assetClass',
      title: 'Distribuzione per Asset Class',
      data: overview?.charts.assetClassData ?? [],
    },
    {
      id: 'asset',
      title: 'Distribuzione per Asset',
      data: (overview?.charts.assetData ?? []).map((d, i) => ({
        ...d,
        color: chartColors[i] ?? d.color,
      })),
    },
  ] as const, [overview, chartColors]);

  // ─── Dialog position animation ────────────────────────────────────────────────
  useEffect(() => {
    if (!showConfirmDialog || prefersReducedMotion) {
      setSnapshotDialogStyle(undefined);
      return;
    }
    const frameId = requestAnimationFrame(() => {
      const trigger = snapshotButtonRef.current;
      const dialog = snapshotDialogRef.current;
      if (!trigger || !dialog) { setSnapshotDialogStyle(undefined); return; }
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
    if (!user) return;
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
    if (!user) return;
    try {
      setCreatingSnapshot(true);
      setShowConfirmDialog(false);
      toast.loading('Aggiornamento prezzi e creazione snapshot...', { id: 'snapshot-creation' });
      const result = await createSnapshotMutation.mutateAsync({});
      toast.dismiss('snapshot-creation');
      toast.success(result.message);
      try { await updateHallOfFame(user.uid); } catch { /* non-critical */ }
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
      <div className="space-y-4 max-desktop:portrait:pb-20">
        <div className="pb-4 border-b border-border">
          <div className="h-3 w-20 bg-muted rounded animate-pulse mb-2" />
          <div className="h-8 w-56 bg-muted rounded animate-pulse mb-2" />
          <div className="h-4 w-44 bg-muted rounded animate-pulse" />
        </div>
        {/* Hero + Liquid skeleton */}
        <div className="grid gap-4 desktop:grid-cols-[2fr_1fr]">
          <div className="rounded-2xl border border-border bg-card p-[22px]">
            <div className="h-3 w-40 bg-muted rounded animate-pulse mb-3" />
            <div className="h-12 w-52 bg-muted rounded animate-pulse mb-4" />
            <div className="flex gap-1.5 mb-3">
              <div className="h-6 w-40 bg-muted rounded animate-pulse" />
              <div className="h-6 w-28 bg-muted rounded animate-pulse" />
            </div>
            <div className="h-[68px] bg-muted rounded animate-pulse mb-2" />
            <div className="h-7 bg-muted rounded animate-pulse" />
          </div>
          <div className="rounded-2xl border border-border bg-card p-[22px]">
            <div className="h-3 w-32 bg-muted rounded animate-pulse mb-3" />
            <div className="h-8 w-36 bg-muted rounded animate-pulse mb-2.5" />
            <div className="h-1.5 bg-muted rounded animate-pulse mb-2" />
            <div className="h-3 w-48 bg-muted rounded animate-pulse" />
          </div>
        </div>
        {/* Variation blocks skeleton */}
        <div className="grid grid-cols-2 gap-2.5">
          <div className="rounded-2xl border border-border bg-card p-4">
            <div className="h-2.5 w-20 bg-muted rounded animate-pulse mb-2" />
            <div className="h-7 w-28 bg-muted rounded animate-pulse mb-2" />
            <div className="h-5 w-16 bg-muted rounded animate-pulse" />
          </div>
          <div className="rounded-2xl border border-border bg-card p-4">
            <div className="h-2.5 w-12 bg-muted rounded animate-pulse mb-2" />
            <div className="h-7 w-28 bg-muted rounded animate-pulse mb-2" />
            <div className="h-5 w-16 bg-muted rounded animate-pulse" />
          </div>
        </div>
        {/* Cashflow skeleton */}
        <div className="rounded-2xl border border-border bg-card p-[22px]">
          <div className="h-3 w-36 bg-muted rounded animate-pulse mb-4" />
          <div className="flex gap-3.5">
            <div className="flex-1 space-y-3">
              <div className="h-6 w-28 bg-muted rounded animate-pulse" />
              <div className="h-6 w-28 bg-muted rounded animate-pulse" />
            </div>
            <div className="w-20 h-20 rounded-2xl bg-muted animate-pulse" />
          </div>
        </div>
      </div>
    );
  }

  /** 2-col cost cards (mobile) */
  const CostCards = () => {
    if (!overview?.flags.hasTERTracking && !overview?.flags.hasStampDuty) return null;
    const annualTotal = overview.metrics.annualPortfolioCost + overview.metrics.annualStampDuty;
    const bothPresent = overview.flags.hasTERTracking && overview.flags.hasStampDuty;
    return (
      <motion.div
        layout="position"
        transition={springLayoutTransition}
        variants={cardItem}
        initial="hidden"
        animate="visible"
        className="grid grid-cols-2 gap-2.5"
      >
        {/* TER medio */}
        {overview.flags.hasTERTracking && (
          <div className="bg-card border border-border rounded-2xl p-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground mb-2">
              TER Medio
            </p>
            <p className="text-[20px] font-bold font-mono tabular-nums text-foreground">
              {overview.metrics.portfolioTER.toFixed(2)}%
            </p>
          </div>
        )}
        {/* Costo annuale — con breakdown TER/bollo se entrambi presenti */}
        <div className={cn(
          'bg-card border border-border rounded-2xl p-4',
          !overview.flags.hasTERTracking && 'col-span-2'
        )}>
          <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground mb-2">
            Costo Annuale
          </p>
          <p className="text-[20px] font-bold font-mono tabular-nums text-amber-500 dark:text-amber-400">
            {formatCurrency(annualTotal)}
          </p>
          {bothPresent && (
            <div className="mt-2 pt-2 border-t border-border divide-y divide-border">
              <div className="flex justify-between py-[4px] text-[10.5px]">
                <span className="text-muted-foreground">Gestione (TER)</span>
                <span className="font-mono tabular-nums text-foreground">
                  {formatCurrency(overview.metrics.annualPortfolioCost)}
                </span>
              </div>
              <div className="flex justify-between py-[4px] text-[10.5px]">
                <span className="text-muted-foreground">Imposta di bollo</span>
                <span className="font-mono tabular-nums text-foreground">
                  {formatCurrency(overview.metrics.annualStampDuty)}
                </span>
              </div>
            </div>
          )}
        </div>
      </motion.div>
    );
  };

  // ─── Render ───────────────────────────────────────────────────────────────────
  return (
    <motion.div
      layout="position"
      transition={springLayoutTransition}
      className="space-y-4 max-desktop:portrait:pb-20"
    >
      {/* ── PAGE HEADER ── */}
      <div className="pb-4 border-b border-border">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-widest mb-1">Panoramica</p>
            <h1 className="text-2xl font-bold text-foreground sm:text-3xl">{greeting.label}</h1>
            <p className="mt-1 text-muted-foreground sm:mt-2">{greeting.subtitle}</p>
          </div>
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
              <Camera className="mr-2 h-4 w-4" />
              {creatingSnapshot ? 'Creazione...' : 'Crea Snapshot'}
            </Button>
          </MotionButtonShell>
        </div>
      </div>

      {/* ── HERO + LIQUID — desktop: 2/3 + 1/3 grid ── */}
      <motion.section
        layout="position"
        transition={springLayoutTransition}
        variants={staggerContainer}
        initial="hidden"
        animate="visible"
      >
        <div className="grid gap-4 desktop:grid-cols-[2fr_1fr]">

          {/* Hero Card */}
          <motion.div layout="position" transition={springLayoutTransition} variants={heroMetricSettle}>
            <Card className="rounded-2xl overflow-hidden">
              <CardContent className="p-[22px]">
                <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground mb-2">
                  Patrimonio Totale Lordo
                </p>

                {/* Animated number */}
                <OverviewAnimatedCurrency
                  value={totalValue}
                  animateOnMount={true}
                  onSettled={handleHeroSettled}
                  className="text-[44px] font-bold font-mono tracking-[-0.03em] desktop:text-[54px]"
                />

                {/* Variation chips — larger, more readable than before */}
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {overview?.variations.monthly && (
                    <span className={cn(
                      'inline-flex items-center gap-1.5 rounded-[7px] px-[9px] py-[4px]',
                      'text-[11px] font-semibold font-mono tracking-[-0.01em]',
                      overview.variations.monthly.value >= 0
                        ? 'bg-green-500/10 text-green-500 dark:text-green-400'
                        : 'bg-red-500/10 text-red-500 dark:text-red-400'
                    )}>
                      {overview.variations.monthly.value >= 0
                        ? <TrendingUp className="h-[9px] w-[9px]" />
                        : <TrendingDown className="h-[9px] w-[9px]" />
                      }
                      {overview.variations.monthly.value >= 0 ? '+' : ''}
                      {formatCurrency(overview.variations.monthly.value)}{' '}
                      ({overview.variations.monthly.percentage >= 0 ? '+' : ''}
                      {overview.variations.monthly.percentage.toFixed(2)}%) questo mese
                    </span>
                  )}
                  {overview?.variations.yearly && (
                    <span className={cn(
                      'inline-flex items-center gap-1.5 rounded-[7px] px-[9px] py-[4px]',
                      'text-[11px] font-semibold font-mono tracking-[-0.01em]',
                      overview.variations.yearly.value >= 0
                        ? 'bg-green-500/10 text-green-500 dark:text-green-400'
                        : 'bg-red-500/10 text-red-500 dark:text-red-400'
                    )}>
                      {overview.variations.yearly.value >= 0
                        ? <TrendingUp className="h-[9px] w-[9px]" />
                        : <TrendingDown className="h-[9px] w-[9px]" />
                      }
                      {overview.variations.yearly.value >= 0 ? '+' : ''}
                      {formatCurrency(overview.variations.yearly.value)}{' '}
                      ({overview.variations.yearly.percentage >= 0 ? '+' : ''}
                      {overview.variations.yearly.percentage.toFixed(2)}%) YTD
                    </span>
                  )}
                </div>

                {/* Area sparkline — last 12 months, edge-to-edge via -mx-[22px] */}
                {sparkline12m.length >= 2 && (
                  <>
                    <div className="-mx-[22px] mt-3" style={{ height: 68 }}>
                      <NetWorthSparkline
                        data={sparkline12m}
                        filled={true}
                        color="var(--chart-1)"
                        height={68}
                      />
                    </div>
                    <div className="flex justify-between mt-1 mb-3 px-px text-[10px] text-muted-foreground font-mono">
                      <span>{cachedFormatCurrencyEUR(sparkline12m[0].totalNetWorth, true)}</span>
                      <span>{cachedFormatCurrencyEUR(sparkline12m[sparkline12m.length - 1].totalNetWorth, true)}</span>
                    </div>
                  </>
                )}

                <p className="text-[11px] text-muted-foreground mt-2.5">
                  {(overview?.flags.assetCount ?? 0) === 0
                    ? 'Aggiungi asset per iniziare'
                    : `${overview?.flags.assetCount ?? 0} asset in portafoglio`}
                </p>
              </CardContent>
            </Card>
          </motion.div>

          {/* Liquid Card */}
          <motion.div layout="position" transition={springLayoutTransition} variants={cardItem}>
            <Card className="rounded-2xl h-full">
              <CardContent className="p-[22px]">
                {/* Header row */}
                <div className="flex items-start justify-between mb-4">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                    Patrimonio Liquido
                  </p>
                  <button
                    onClick={() => setLiquidExpanded(e => !e)}
                    className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <span>{liquidExpanded ? 'Meno' : 'Dettaglio'}</span>
                    <ChevronDown className={cn(
                      'h-3 w-3 transition-transform duration-200',
                      liquidExpanded && 'rotate-180'
                    )} />
                  </button>
                </div>

                {/* Donut chart + values side by side */}
                {(() => {
                  const size = 116;
                  const strokeW = 12;
                  const r = (size - strokeW) / 2;
                  const circ = 2 * Math.PI * r;
                  const liquidDash = (Math.min(liquidPercent, 100) / 100) * circ;
                  const colorLiquid = chartColors[1] || 'var(--chart-2)';
                  const colorIlliquid = chartColors[0] || 'var(--chart-1)';
                  return (
                    <div className="flex items-center gap-4">
                      {/* Values */}
                      <div className="flex-1 flex flex-col gap-3.5">
                        {/* Liquid */}
                        <div>
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <div className="w-2 h-2 rounded-[2px] flex-shrink-0" style={{ background: colorLiquid }} />
                            <span className="text-[10px] text-muted-foreground">Liquido</span>
                          </div>
                          <OverviewAnimatedCurrency
                            value={liquidValue}
                            animateOnMount={true}
                            startDelay={105}
                            duration={390}
                            className="text-[22px] font-bold font-mono tracking-[-0.025em]"
                          />
                        </div>
                        {/* Illiquid */}
                        <div>
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <div className="w-2 h-2 rounded-[2px] flex-shrink-0" style={{ background: colorIlliquid }} />
                            <span className="text-[10px] text-muted-foreground">Illiquido</span>
                          </div>
                          <span className="text-[22px] font-bold font-mono tracking-[-0.025em] tabular-nums text-foreground">
                            {cachedFormatCurrencyEUR(investedAmount)}
                          </span>
                        </div>
                      </div>

                      {/* Donut — 2-color: illiquid base ring, liquid animated segment on top */}
                      <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
                        <svg
                          width={size}
                          height={size}
                          style={{ transform: 'rotate(-90deg)', display: 'block' }}
                        >
                          {/* Illiquid: full background ring */}
                          <circle
                            cx={size / 2} cy={size / 2} r={r}
                            fill="none"
                            stroke={colorIlliquid}
                            strokeWidth={strokeW}
                          />
                          {/* Liquid: animated segment on top */}
                          <motion.circle
                            cx={size / 2} cy={size / 2} r={r}
                            fill="none"
                            stroke={colorLiquid}
                            strokeWidth={strokeW}
                            strokeLinecap="butt"
                            initial={{ strokeDasharray: `0 ${circ}` }}
                            animate={{ strokeDasharray: `${liquidDash} ${circ - liquidDash}` }}
                            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1], delay: 0.15 }}
                          />
                        </svg>
                        {/* Center label */}
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-px">
                          <span
                            className="font-mono font-bold tabular-nums leading-none"
                            style={{ fontSize: 17, color: colorLiquid }}
                          >
                            {liquidPercent.toFixed(1)}%
                          </span>
                          <span className="text-[8px] font-medium uppercase tracking-[0.06em] text-muted-foreground">
                            liquido
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* Expandable fiscal detail — smooth height animation */}
                <AnimatePresence initial={false}>
                  {liquidExpanded && (
                    <motion.div
                      key="liquid-detail"
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
                      style={{ overflow: 'hidden' }}
                    >
                      <div className="mt-3.5 pt-3.5 border-t border-border divide-y divide-border">
                        {[
                          { label: 'Patrimonio Lordo', value: totalValue,                            className: 'text-foreground' },
                          { label: 'Patrimonio Netto', value: overview?.metrics.netTotal ?? 0,       className: 'text-foreground' },
                          { label: 'Liquido Netto',    value: overview?.metrics.liquidNetTotal ?? 0, className: '' },
                        ].map((row, i) => (
                          <div key={row.label} className="flex justify-between py-[5px] text-[12px]">
                            <span className="text-muted-foreground">{row.label}</span>
                            <span
                              className={cn('font-mono font-semibold tabular-nums', row.className)}
                              style={i === 2 ? { color: chartColors[1] } : undefined}
                            >
                              {formatCurrency(row.value)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </CardContent>
            </Card>
          </motion.div>

        </div>
      </motion.section>

      {/* ── DESKTOP ONLY: 3-col bento (cashflow + TER + costo annuale) ── */}
      {!isMobile && (
        <motion.div
          layout="position"
          transition={springLayoutTransition}
          variants={cardItem}
          initial="hidden"
          animate="visible"
          className="grid grid-cols-3 gap-4"
        >
          {/* Cashflow */}
          <div className="bg-card border border-border rounded-2xl p-5 flex flex-col gap-3">
            <span className="text-[9px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
              Cashflow
            </span>
            {overview?.expenseStats ? (
              <div className="flex items-center gap-5 mt-1">
                <SavingsRingChart rate={savingsRate} size={116} />
                {/* Entrate e Spese affiancate — c'è spazio su desktop */}
                <div className="flex gap-6">
                  {/* Entrate */}
                  <div>
                    <p className="text-[10px] text-muted-foreground mb-1">Entrate</p>
                    <div className="text-[22px] font-bold font-mono text-green-500 dark:text-green-400 leading-none">
                      {cachedFormatCurrencyEUR(overview.expenseStats.currentMonth.income, true)}
                    </div>
                    {(() => {
                      const d = overview.expenseStats.delta.income;
                      const pos = d >= 0;
                      return (
                        <p className={cn(
                          'text-[10.5px] font-mono mt-1',
                          pos ? 'text-green-500 dark:text-green-400' : 'text-red-500 dark:text-red-400'
                        )}>
                          {pos ? '+' : ''}{d.toFixed(1)}% vs mese scorso
                        </p>
                      );
                    })()}
                  </div>
                  {/* Spese */}
                  <div>
                    <p className="text-[10px] text-muted-foreground mb-1">Spese</p>
                    <div className="text-[22px] font-bold font-mono text-red-500 dark:text-red-400 leading-none">
                      {cachedFormatCurrencyEUR(overview.expenseStats.currentMonth.expenses, true)}
                    </div>
                    {(() => {
                      const d = overview.expenseStats.delta.expenses;
                      // Per le spese il segno è invertito: +% è negativo (hai speso di più)
                      const pos = d >= 0;
                      return (
                        <p className={cn(
                          'text-[10.5px] font-mono mt-1',
                          pos ? 'text-red-500 dark:text-red-400' : 'text-green-500 dark:text-green-400'
                        )}>
                          {pos ? '+' : ''}{d.toFixed(1)}% vs mese scorso
                        </p>
                      );
                    })()}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                <Receipt className="h-4 w-4" />
                <span>Nessun dato questo mese</span>
              </div>
            )}
          </div>

          {/* TER medio */}
          <div className="bg-card border border-border rounded-2xl p-5 flex flex-col justify-between">
            <span className="text-[9px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
              TER Medio Ponderato
            </span>
            {overview?.flags.hasTERTracking ? (
              <div>
                <p className="text-[36px] font-bold font-mono tabular-nums tracking-[-0.03em] text-foreground leading-none mt-3">
                  {overview.metrics.portfolioTER.toFixed(2)}%
                </p>
                <p className="text-[10px] text-muted-foreground mt-2">
                  Total Expense Ratio medio ponderato
                </p>
              </div>
            ) : (
              <p className="text-[11px] text-muted-foreground mt-2">Nessun ETF/fondo configurato</p>
            )}
          </div>

          {/* Costo annuale */}
          <div className="bg-card border border-border rounded-2xl p-5 flex flex-col justify-between">
            <span className="text-[9px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
              Costo Annuale Stimato
            </span>
            {(overview?.flags.hasTERTracking || overview?.flags.hasStampDuty) ? (
              <div>
                <p className="text-[36px] font-bold font-mono tabular-nums tracking-[-0.03em] text-amber-500 dark:text-amber-400 leading-none mt-3">
                  {formatCurrency(overview.metrics.annualPortfolioCost + overview.metrics.annualStampDuty)}
                </p>
                {/* Breakdown — shown only when both components are present */}
                {overview.flags.hasTERTracking && overview.flags.hasStampDuty && (
                  <div className="mt-3 pt-3 border-t border-border space-y-0 divide-y divide-border">
                    <div className="flex justify-between py-[5px] text-[11px]">
                      <span className="text-muted-foreground">Costi di gestione (TER)</span>
                      <span className="font-mono tabular-nums text-foreground">
                        {formatCurrency(overview.metrics.annualPortfolioCost)}
                      </span>
                    </div>
                    <div className="flex justify-between py-[5px] text-[11px]">
                      <span className="text-muted-foreground">Imposta di bollo</span>
                      <span className="font-mono tabular-nums text-foreground">
                        {formatCurrency(overview.metrics.annualStampDuty)}
                      </span>
                    </div>
                  </div>
                )}
                {/* Single-line caption when only one component present */}
                {!(overview.flags.hasTERTracking && overview.flags.hasStampDuty) && (
                  <p className="text-[10px] text-muted-foreground mt-2">
                    {overview.flags.hasTERTracking ? 'Costi di gestione annuali stimati' : 'Imposta di bollo annuale stimata'}
                  </p>
                )}
              </div>
            ) : (
              <p className="text-[11px] text-muted-foreground mt-2">Nessun costo configurato</p>
            )}
          </div>
        </motion.div>
      )}

      {/* ── FISCAL SECTION — both platforms ── inline JSX (not a sub-component) ── */}
      {overview?.flags.hasCostBasisTracking && (
        <motion.div
          layout="position"
          transition={springLayoutTransition}
          variants={cardItem}
          initial="hidden"
          animate="visible"
        >
          <Card className="rounded-2xl overflow-hidden">
            <Collapsible open={costBasisOpen} onOpenChange={setCostBasisOpen}>
              <CollapsibleTrigger asChild>
                <div className="flex items-center justify-between cursor-pointer select-none px-5 py-4 group">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                    Dettaglio Fiscale
                  </p>
                  <ChevronDown className={cn(
                    'h-3.5 w-3.5 text-muted-foreground transition-transform duration-200',
                    costBasisOpen && 'rotate-180'
                  )} />
                </div>
              </CollapsibleTrigger>
              <AnimatePresence initial={false}>
                {costBasisOpen && (
                  <motion.div
                    key="fiscal-detail"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
                    style={{ overflow: 'hidden' }}
                  >
                    <div className="grid grid-cols-2 desktop:grid-cols-4 gap-2 pb-4 px-4">
                      {fiscalItems.map(item => (
                        <div
                          key={item.label}
                          className="bg-muted rounded-xl p-3.5 border border-border"
                        >
                          <p className="text-[9.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground mb-1.5">
                            {item.label}
                          </p>
                          <p className={cn('text-[16px] font-bold font-mono tabular-nums', item.className)}>
                            {item.prefix}{formatCurrency(item.value)}
                          </p>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </Collapsible>
          </Card>
        </motion.div>
      )}

      {/* ── MOBILE ONLY: Cashflow card + Cost cards ── inline JSX (not a sub-component) ── */}
      {isMobile && overview?.expenseStats && (() => {
        const { income, expenses } = overview.expenseStats.currentMonth;
        const { income: incomeDelta, expenses: expensesDelta } = overview.expenseStats.delta;
        return (
          <motion.div
            layout="position"
            transition={springLayoutTransition}
            variants={cardItem}
            initial="hidden"
            animate="visible"
          >
            <Card className="rounded-2xl">
              <CardContent className="p-[22px]">
                <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground mb-4">
                  Cashflow questo mese
                </p>
                <div className="flex items-center gap-3.5">
                  <div className="flex-1 flex flex-col gap-3.5">
                    {[
                      { label: 'Entrate', value: income, delta: incomeDelta, positiveGood: true },
                      { label: 'Spese',   value: expenses, delta: expensesDelta, positiveGood: false },
                    ].map(row => {
                      const valueColor = row.label === 'Entrate'
                        ? 'text-green-500 dark:text-green-400'
                        : 'text-red-500 dark:text-red-400';
                      const deltaColor = row.positiveGood
                        ? row.delta >= 0 ? 'text-green-500 dark:text-green-400' : 'text-red-500 dark:text-red-400'
                        : row.delta >= 0 ? 'text-red-500 dark:text-red-400'   : 'text-green-500 dark:text-green-400';
                      return (
                        <div key={row.label}>
                          <div className="flex items-center gap-1.5 mb-1">
                            {row.label === 'Entrate'
                              ? <TrendingUp className="h-3.5 w-3.5 text-green-500 dark:text-green-400" />
                              : <TrendingDown className="h-3.5 w-3.5 text-red-500 dark:text-red-400" />
                            }
                            <p className="text-[11px] text-muted-foreground">{row.label}</p>
                          </div>
                          <div className={cn('text-[22px] font-bold font-mono tabular-nums leading-none', valueColor)}>
                            {formatCurrency(row.value)}
                          </div>
                          <p className={cn('text-[10.5px] font-mono mt-0.5', deltaColor)}>
                            {row.delta >= 0 ? '+' : ''}{row.delta.toFixed(1)}% vs mese scorso
                          </p>
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex flex-col items-center gap-1.5 px-3.5 py-2.5 bg-muted rounded-2xl border border-border">
                    <SavingsRingChart rate={savingsRate} size={96} />
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        );
      })()}
      {isMobile && <CostCards />}

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
          className="duration-300 data-[state=open]:zoom-in-90 data-[state=closed]:zoom-out-100 data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0 sm:max-w-md"
          showCloseButton={false}
        >
          <DialogHeader>
            <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
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
