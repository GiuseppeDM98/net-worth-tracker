'use client';

import { CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import {
  staggerContainer,
  cardItem,
  heroMetricSettle,
  slideDown,
  springLayoutTransition,
} from '@/lib/utils/motionVariants';
import { useAuth } from '@/contexts/AuthContext';
import { formatCurrency } from '@/lib/services/chartService';
import { updateHallOfFame } from '@/lib/services/hallOfFameService';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Wallet, TrendingUp, Camera, TrendingDown, Receipt, ChevronDown } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
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
import { useChartColors } from '@/lib/hooks/useChartColors';
import { useDemoMode } from '@/lib/hooks/useDemoMode';

const MotionButtonShell = motion.div;

/**
 * MAIN DASHBOARD PAGE
 *
 * Central overview showing current portfolio state and key metrics.
 *
 * DATA LOADING STRATEGY:
 * The page now consumes a single server-aggregated overview query plus the
 * existing snapshot mutation. This keeps the render layer thin while preserving
 * the same cards, charts, and conditional sections users already see.
 */

export default function DashboardPage() {
  const { user } = useAuth();
  const isDemo = useDemoMode();
  const prefersReducedMotion = useReducedMotion();

  // Calculated once at mount — no need to re-evaluate on every render.
  // Hour extracted in Europe/Rome timezone so the greeting is always contextually correct.
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

  const [creatingSnapshot, setCreatingSnapshot] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  // Cost basis detail starts open — user can collapse to reduce visual density
  const [costBasisOpen, setCostBasisOpen] = useState(true);
  const [snapshotDialogStyle, setSnapshotDialogStyle] = useState<CSSProperties | undefined>(undefined);
  const snapshotButtonRef = useRef<HTMLButtonElement | null>(null);
  const snapshotDialogRef = useRef<HTMLDivElement | null>(null);

  const isMobile = useMediaQuery('(max-width: 1439px)');
  const chartColors = useChartColors();

  // heroSettled becomes true when the Patrimonio Totale Lordo count-up completes.
  // OverviewChartsSection watches this flag to schedule the chart SVG mount via
  // requestIdleCallback, ensuring charts never render while the hero is counting.
  const [heroSettled, setHeroSettled] = useState(false);

  // Stable callback ref — prevents OverviewAnimatedCurrency from re-rendering
  // just because DashboardPage re-renders while heroSettled is still false.
  const handleHeroSettled = useCallback(() => setHeroSettled(true), []);

  useEffect(() => {
    if (!showConfirmDialog || prefersReducedMotion) {
      setSnapshotDialogStyle(undefined);
      return;
    }

    const frameId = requestAnimationFrame(() => {
      const trigger = snapshotButtonRef.current;
      const dialog = snapshotDialogRef.current;

      if (!trigger || !dialog) {
        setSnapshotDialogStyle(undefined);
        return;
      }

      const triggerRect = trigger.getBoundingClientRect();
      const dialogRect = dialog.getBoundingClientRect();
      const originX = triggerRect.left + (triggerRect.width / 2) - dialogRect.left;
      const originY = triggerRect.top + (triggerRect.height / 2) - dialogRect.top;

      setSnapshotDialogStyle({
        transformOrigin: `${originX}px ${originY}px`,
      });
    });

    return () => cancelAnimationFrame(frameId);
  }, [showConfirmDialog, prefersReducedMotion]);

  const currentMonthReference = useMemo(() => getItalyMonthYear(), []);

  /**
   * Create monthly snapshot of current portfolio state.
   *
   * Flow:
   * 1. Check if snapshot already exists for current month
   * 2. If exists: Show confirmation dialog with overwrite warning
   * 3. If not: Proceed directly to snapshot creation
   * 4. Update Hall of Fame rankings after successful snapshot creation
   *
   * Snapshot includes:
   * - Total/liquid/illiquid net worth
   * - Asset class breakdown for historical charts
   * - Individual asset values and prices (enables price history tracking)
   * - Timestamp for audit trail
   *
   * Note: Price updates automatically fetched before snapshot creation (handled by API route).
   * This ensures snapshot captures most recent market prices.
   */
  const handleCreateSnapshot = async () => {
    if (!user) return;

    // Check if snapshot for current month already exists (prevent accidental duplicates)
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

  /**
   * Execute snapshot creation and handle UI feedback.
   *
   * Uses React Query mutation hook for:
   * - Automatic loading states (tracked in createSnapshotMutation.isLoading)
   * - Cache invalidation (triggers automatic re-fetch of snapshots list)
   * - Error handling with retry logic (built into React Query)
   *
   * Side effects:
   * - Updates Hall of Fame rankings (non-critical, failure doesn't stop flow)
   * - Toast notifications for user feedback (loading → success/error)
   * - Cache invalidation triggers re-render with new snapshot data
   *
   * @mutates Firestore: Creates new snapshot document in user's snapshots collection
   * @mutates Cache: Invalidates snapshots query to trigger automatic refetch
   */
  const createSnapshot = async () => {
    if (!user) return;

    try {
      setCreatingSnapshot(true);
      setShowConfirmDialog(false);

      // Show loading toast with unique ID for later dismissal
      toast.loading('Aggiornamento prezzi e creazione snapshot...', {
        id: 'snapshot-creation',
      });

      // Use mutation hook to create snapshot (handles API call + cache invalidation)
      const result = await createSnapshotMutation.mutateAsync({});

      // Dismiss loading toast
      toast.dismiss('snapshot-creation');

      toast.success(result.message);

      // Update Hall of Fame after successful snapshot creation.
      // This is non-critical: failure doesn't block user flow or show error.
      // Hall of Fame can be manually recalculated from Hall of Fame page if needed.
      try {
        await updateHallOfFame(user.uid);
      } catch (error) {
        console.error('Error updating Hall of Fame:', error);
        // Don't show error to user - Hall of Fame update is non-critical
      }

      // React Query automatically refetches snapshots via cache invalidation in the mutation hook
    } catch (error) {
      console.error('Error creating snapshot:', error);
      toast.dismiss('snapshot-creation');
      toast.error('Errore nella creazione dello snapshot');
    } finally {
      setCreatingSnapshot(false);
    }
  };

  // Chart sections are stable memoized objects so OverviewChartsSection's memo
  // shallowly compares them without re-rendering during non-chart state updates.
  const chartSections = useMemo(() => [
    {
      id: 'assetClass',
      title: 'Distribuzione per Asset Class',
      data: overview?.charts.assetClassData ?? [],
    },
    {
      id: 'asset',
      title: 'Distribuzione per Asset',
      // Colors come from the server-cached service; remap here so theme changes
      // take effect immediately without invalidating the React Query cache.
      data: (overview?.charts.assetData ?? []).map((d, i) => ({
        ...d,
        color: chartColors[i] ?? d.color,
      })),
    },
    {
      id: 'liquidity',
      title: 'Liquidità Portfolio',
      data: overview?.charts.liquidityData ?? [],
    },
  ] as const, [overview, chartColors]);

  if (loading) {
    return (
      <div className="space-y-6 max-desktop:portrait:pb-20">
        {/* Header skeleton */}
        <div className="pb-4 border-b border-border">
          <div className="h-3 w-20 bg-muted rounded animate-pulse mb-2" />
          <div className="h-8 w-56 bg-muted rounded animate-pulse mb-2" />
          <div className="h-4 w-44 bg-muted rounded animate-pulse" />
        </div>
        {/* Hero card skeleton */}
        <div className="rounded-xl border border-border bg-card px-6 py-6">
          <div className="h-3 w-40 bg-muted rounded animate-pulse mb-4" />
          <div className="h-12 w-52 bg-muted rounded animate-pulse mb-4" />
          <div className="flex gap-2">
            <div className="h-6 w-36 bg-muted rounded animate-pulse" />
            <div className="h-6 w-24 bg-muted rounded animate-pulse" />
          </div>
        </div>
        {/* Secondary KPI skeleton */}
        <div className="rounded-xl border border-border bg-card px-6 py-6">
          <div className="h-3 w-36 bg-muted rounded animate-pulse mb-3" />
          <div className="h-8 w-44 bg-muted rounded animate-pulse" />
        </div>
        {/* Cashflow skeleton */}
        <div className="rounded-xl border border-border bg-card px-6 py-6">
          <div className="h-3 w-40 bg-muted rounded animate-pulse mb-5" />
          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-2">
              <div className="h-3 w-16 bg-muted rounded animate-pulse" />
              <div className="h-8 w-28 bg-muted rounded animate-pulse" />
              <div className="h-3 w-24 bg-muted rounded animate-pulse" />
            </div>
            <div className="space-y-2">
              <div className="h-3 w-12 bg-muted rounded animate-pulse" />
              <div className="h-8 w-28 bg-muted rounded animate-pulse" />
              <div className="h-3 w-24 bg-muted rounded animate-pulse" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    // pb-20 on portrait mobile compensates for the BottomNavigation bar (h-16 = 64px)
    <motion.div
      layout="position"
      transition={springLayoutTransition}
      className="space-y-6 max-desktop:portrait:pb-20"
    >
      {/* Header — greeting text anchors the page; "Crea Snapshot" is the only primary
          action on this view so it gets full emphasis. A bottom border separates the
          editorial header zone from the data grid that follows. */}
      <div className="pb-4 border-b border-border">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-widest mb-1">Panoramica</p>
            <h1 className="text-2xl font-bold text-foreground sm:text-3xl">{greeting.label}</h1>
            <p className="mt-1 text-muted-foreground sm:mt-2">
              {greeting.subtitle}
            </p>
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

      {/* Hero KPI row — Patrimonio Totale Lordo is the single most important number
          on the dashboard. Full-width, larger type, left-accent border communicate
          primary status without adding decoration. The two secondary KPIs follow
          in a 2-col row, visually subordinate by smaller font and narrower cards. */}
      <motion.section
        layout="position"
        transition={springLayoutTransition}
        variants={staggerContainer}
        initial="hidden"
        animate="visible"
        className="space-y-4"
      >

        {/* Hero card — full-width, dominant number.
            No side-stripe border (banned by design system); the card's natural
            border + shadow provide sufficient separation. Variation chips live
            inline so the user gets trend context without scrolling past the hero. */}
        <motion.div
          layout="position"
          transition={springLayoutTransition}
          variants={heroMetricSettle}
        >
          <Card>
            <CardContent>
              <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground mb-3">
                Patrimonio Totale Lordo
              </p>
              {/* animateOnMount=true — hero is the primary KPI, animates once on load.
                  onSettled triggers heroSettled so OverviewChartsSection can schedule
                  chart mount via requestIdleCallback after the animation completes. */}
              <OverviewAnimatedCurrency
                value={overview?.metrics.totalValue ?? 0}
                animateOnMount={true}
                onSettled={handleHeroSettled}
                className="text-4xl font-bold tracking-tight desktop:text-5xl"
              />
              {/* Variation chips — monthly and YTD changes inline under the number.
                  Only rendered when snapshot data is available (at least one prior month). */}
              <div className="mt-3 flex flex-wrap gap-2">
                {overview?.variations.monthly && (
                  <span className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium ${
                    overview.variations.monthly.value >= 0
                      ? 'bg-green-500/10 text-green-600 dark:text-green-400'
                      : 'bg-red-500/10 text-red-600 dark:text-red-400'
                  }`}>
                    {overview.variations.monthly.value >= 0
                      ? <TrendingUp className="h-3 w-3" />
                      : <TrendingDown className="h-3 w-3" />
                    }
                    {overview.variations.monthly.value >= 0 ? '+' : ''}{formatCurrency(overview.variations.monthly.value)}{' '}
                    ({overview.variations.monthly.percentage >= 0 ? '+' : ''}{overview.variations.monthly.percentage.toFixed(2)}%) questo mese
                  </span>
                )}
                {overview?.variations.yearly && (
                  <span className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium ${
                    overview.variations.yearly.value >= 0
                      ? 'bg-green-500/10 text-green-600 dark:text-green-400'
                      : 'bg-red-500/10 text-red-600 dark:text-red-400'
                  }`}>
                    {overview.variations.yearly.value >= 0
                      ? <TrendingUp className="h-3 w-3" />
                      : <TrendingDown className="h-3 w-3" />
                    }
                    {overview.variations.yearly.value >= 0 ? '+' : ''}{formatCurrency(overview.variations.yearly.value)}{' '}
                    ({overview.variations.yearly.percentage >= 0 ? '+' : ''}{overview.variations.yearly.percentage.toFixed(2)}%) YTD
                  </span>
                )}
              </div>
              {/* Sparkline — 3-month net worth trend for visual context under the chips.
                  Renders only when at least 2 historical snapshots are available. */}
              {overview?.sparklineData && overview.sparklineData.length >= 2 && (
                <div className="mt-3 -mx-1 opacity-70">
                  <NetWorthSparkline data={overview.sparklineData} />
                </div>
              )}
              <p className="text-xs text-muted-foreground mt-2">
                {(overview?.flags.assetCount ?? 0) === 0
                  ? 'Aggiungi asset per iniziare'
                  : `${overview?.flags.assetCount ?? 0} asset in portafoglio`}
              </p>
            </CardContent>
          </Card>
        </motion.div>

        {/* Secondary KPI — Patrimonio Liquido full-width; asset count is already
            surfaced as a caption below the hero number, no need for a separate card. */}
        <motion.div layout="position" transition={springLayoutTransition} variants={cardItem}>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Patrimonio Liquido Lordo</CardTitle>
              <Wallet className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <OverviewAnimatedCurrency
                value={overview?.metrics.liquidNetWorth ?? 0}
                animateOnMount={true}
                startDelay={105}
                duration={390}
                className="text-2xl font-bold"
              />
            </CardContent>
          </Card>
        </motion.div>

      </motion.section>

      {/* Cost Basis Cards - only show if any asset has cost basis tracking */}
      <AnimatePresence initial={false} mode="popLayout">
        {overview?.flags.hasCostBasisTracking && (
          <motion.div
            key="cost-basis-section"
            layout="position"
            transition={springLayoutTransition}
            variants={slideDown}
            initial="hidden"
            animate="visible"
            exit="exit"
          >
            {/* Collapsible header — clicking toggles visibility of the 4 fiscal detail cards.
                CollapsibleTrigger asChild avoids nested <button> inside the div trigger. */}
            <Collapsible open={costBasisOpen} onOpenChange={setCostBasisOpen}>
              <CollapsibleTrigger asChild>
                <div className="flex items-center justify-between cursor-pointer select-none mb-4 group">
                  <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                    Dettaglio Fiscale
                  </p>
                  <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform duration-200 motion-reduce:transition-none group-data-[state=open]:rotate-180" />
                </div>
              </CollapsibleTrigger>

              <CollapsibleContent className="space-y-6">
                {/* Net Worth Cards */}
                <motion.div
                  layout="position"
                  transition={springLayoutTransition}
                  variants={staggerContainer}
                  initial="hidden"
                  animate="visible"
                  className="grid gap-6 sm:grid-cols-2"
                >
                  <motion.div layout="position" transition={springLayoutTransition} variants={cardItem}>
                    <Card>
                      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Patrimonio Totale Netto</CardTitle>
                        <Wallet className="h-4 w-4 text-muted-foreground" />
                      </CardHeader>
                      <CardContent>
                        {/* No onSettled here; hero (Lordo) already drives the settled signal. */}
                        <OverviewAnimatedCurrency
                          value={overview.metrics.netTotal}
                          animateOnMount={true}
                          startDelay={125}
                          duration={380}
                          className="text-2xl font-bold"
                        />
                        <p className="text-xs text-muted-foreground">
                          Dopo tasse stimate
                        </p>
                      </CardContent>
                    </Card>
                  </motion.div>

                  <motion.div layout="position" transition={springLayoutTransition} variants={cardItem}>
                    <Card>
                      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Patrimonio Liquido Netto</CardTitle>
                        <Wallet className="h-4 w-4 text-muted-foreground" />
                      </CardHeader>
                      <CardContent>
                        <OverviewAnimatedCurrency
                          value={overview.metrics.liquidNetTotal}
                          animateOnMount={true}
                          startDelay={140}
                          duration={380}
                          className="text-2xl font-bold"
                        />
                        <p className="text-xs text-muted-foreground">
                          Liquidità dopo tasse stimate
                        </p>
                      </CardContent>
                    </Card>
                  </motion.div>
                </motion.div>

                {/* Gains and Taxes Cards */}
                <motion.div
                  layout="position"
                  transition={springLayoutTransition}
                  variants={staggerContainer}
                  initial="hidden"
                  animate="visible"
                  className="grid gap-6 sm:grid-cols-2"
                >
                  <motion.div layout="position" transition={springLayoutTransition} variants={cardItem}>
                    <Card>
                      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Plusvalenze Non Realizzate</CardTitle>
                        <TrendingUp className="h-4 w-4 text-muted-foreground" />
                      </CardHeader>
                      <CardContent>
                        <div className={`text-2xl font-bold ${
                          overview.metrics.unrealizedGains >= 0 ? 'text-green-600' : 'text-red-600'
                        }`}>
                          {overview.metrics.unrealizedGains >= 0 ? '+' : ''}
                          <OverviewAnimatedCurrency
                            value={overview.metrics.unrealizedGains}
                            animateOnMount={true}
                            startDelay={155}
                            duration={380}
                          />
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Guadagno/perdita rispetto al costo medio
                        </p>
                      </CardContent>
                    </Card>
                  </motion.div>

                  <motion.div layout="position" transition={springLayoutTransition} variants={cardItem}>
                    <Card>
                      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Tasse Stimate</CardTitle>
                        <Receipt className="h-4 w-4 text-muted-foreground" />
                      </CardHeader>
                      <CardContent>
                        <OverviewAnimatedCurrency
                          value={overview.metrics.estimatedTaxes}
                          animateOnMount={true}
                          startDelay={170}
                          duration={380}
                          className="text-2xl font-bold text-amber-600 dark:text-amber-400"
                        />
                        <p className="text-xs text-muted-foreground">
                          Imposte su plusvalenze non realizzate
                        </p>
                      </CardContent>
                    </Card>
                  </motion.div>
                </motion.div>
              </CollapsibleContent>
            </Collapsible>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Secondary metrics group — cashflow card + optional cost section.
          Variations moved inline to the hero; this group now handles cashflow
          context and portfolio cost references. */}
      <motion.div
        layout="position"
        transition={springLayoutTransition}
        className="space-y-4"
      >

      {/* Cashflow mensile — income and expenses in one card so the user can
          compare them at a glance without scrolling between two separate cards. */}
      <motion.div
        layout="position"
        transition={springLayoutTransition}
        variants={cardItem}
        initial="hidden"
        animate="visible"
      >
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
            <CardTitle className="text-sm font-medium">Cashflow Questo Mese</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {overview?.expenseStats ? (
              <>
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <div className="flex items-center gap-1.5 mb-2">
                      <TrendingUp className="h-3.5 w-3.5 text-green-600" />
                      <p className="text-xs text-muted-foreground">Entrate</p>
                    </div>
                    <div className="text-2xl font-bold text-green-600">
                      {formatCurrency(overview.expenseStats.currentMonth.income)}
                    </div>
                    <p className={`text-xs mt-0.5 ${
                      overview.expenseStats.delta.income >= 0 ? 'text-green-600' : 'text-red-600'
                    }`}>
                      {overview.expenseStats.delta.income >= 0 ? '+' : ''}{overview.expenseStats.delta.income.toFixed(1)}% dal mese scorso
                    </p>
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5 mb-2">
                      <TrendingDown className="h-3.5 w-3.5 text-red-600" />
                      <p className="text-xs text-muted-foreground">Spese</p>
                    </div>
                    <div className="text-2xl font-bold text-red-600">
                      {formatCurrency(overview.expenseStats.currentMonth.expenses)}
                    </div>
                    <p className={`text-xs mt-0.5 ${
                      overview.expenseStats.delta.expenses >= 0 ? 'text-red-600' : 'text-green-600'
                    }`}>
                      {overview.expenseStats.delta.expenses >= 0 ? '+' : ''}{overview.expenseStats.delta.expenses.toFixed(1)}% dal mese scorso
                    </p>
                  </div>
                </div>
                {/* Savings rate row — only when income > 0 to avoid division by zero */}
                {overview.expenseStats.currentMonth.income > 0 && (() => {
                  const { income, expenses } = overview.expenseStats!.currentMonth;
                  const rate = ((income - expenses) / income) * 100;
                  const rateColor = rate >= 20
                    ? 'text-green-600 dark:text-green-400'
                    : rate >= 10
                    ? 'text-amber-600 dark:text-amber-400'
                    : 'text-red-600 dark:text-red-400';
                  return (
                    <div className="border-t border-border mt-4 pt-4 flex items-center justify-between">
                      <p className="text-xs text-muted-foreground">Tasso di risparmio</p>
                      <span className={`text-sm font-semibold ${rateColor}`}>
                        {rate >= 0 ? '+' : ''}{rate.toFixed(0)}%
                      </span>
                    </div>
                  );
                })()}
              </>
            ) : (
              <div className="flex flex-col items-center justify-center py-4 gap-2">
                <Receipt className="h-7 w-7 text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground">Nessuna spesa registrata questo mese</p>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Cost cards — shown if any asset has TER tracking or stamp duty is enabled */}
      <AnimatePresence initial={false} mode="popLayout">
        {(overview?.flags.hasTERTracking || overview?.flags.hasStampDuty) && (
        <motion.div
          key="cost-cards"
          layout
          transition={springLayoutTransition}
          variants={staggerContainer}
          initial="hidden"
          animate="visible"
          exit="exit"
          className="grid gap-6 sm:grid-cols-2"
        >
          {overview?.flags.hasTERTracking && (
            <motion.div layout="position" transition={springLayoutTransition} variants={cardItem}>
            <Card className="h-full">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">TER Portfolio</CardTitle>
                <Receipt className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {overview.metrics.portfolioTER.toFixed(2)}%
                </div>
                <p className="text-xs text-muted-foreground">
                  Total Expense Ratio medio ponderato
                </p>
              </CardContent>
            </Card>
            </motion.div>
          )}

          <motion.div
            layout="position"
            transition={springLayoutTransition}
            variants={cardItem}
            className={!overview?.flags.hasTERTracking ? 'sm:col-span-2' : ''}
          >
          <Card className="h-full">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Costo Annuale Portfolio</CardTitle>
              <TrendingDown className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">
                {formatCurrency(overview.metrics.annualPortfolioCost + overview.metrics.annualStampDuty)}
              </div>
              {overview.flags.hasTERTracking && overview.flags.hasStampDuty ? (
                <div className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                  <div>TER: {formatCurrency(overview.metrics.annualPortfolioCost)}</div>
                  <div>Bollo: {formatCurrency(overview.metrics.annualStampDuty)}</div>
                </div>
              ) : overview.flags.hasTERTracking ? (
                <p className="text-xs text-muted-foreground">Costi di gestione annuali stimati</p>
              ) : (
                <p className="text-xs text-muted-foreground">Imposta di bollo annuale stimata</p>
              )}
            </CardContent>
          </Card>
          </motion.div>
        </motion.div>
        )}
      </AnimatePresence>

      </motion.div>

      {/* Composition charts — isolated in a memoized subtree so count-up re-renders
          in OverviewAnimatedCurrency leaf nodes never reach this section. */}
      <OverviewChartsSection
        sections={chartSections}
        heroSettled={heroSettled}
        isMobile={isMobile}
        prefersReducedMotion={!!prefersReducedMotion}
      />

      {/* Confirm Dialog */}
      <Dialog
        open={showConfirmDialog}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            setSnapshotDialogStyle(undefined);
          }
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
            <Button
              onClick={createSnapshot}
              disabled={creatingSnapshot}
            >
              {creatingSnapshot ? 'Creazione...' : 'Sovrascrivi'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Savings rate celebration badge — shown once per session when last month > threshold */}
      {overview?.expenseStats && (
        <SavingsRateBadge
          previousMonthIncome={overview.expenseStats.previousMonth.income}
          previousMonthExpenses={overview.expenseStats.previousMonth.expenses}
        />
      )}
    </motion.div>
  );
}
