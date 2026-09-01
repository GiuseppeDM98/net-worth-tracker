'use client';

import { CSSProperties, useEffect, useMemo, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { cardItem, springLayoutTransition, staggerContainer } from '@/lib/utils/motionVariants';
import { useAuth } from '@/contexts/AuthContext';
import { useActiveAccount } from '@/contexts/ActiveAccountContext';
import { updateHallOfFame } from '@/lib/services/hallOfFameService';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Camera } from 'lucide-react';
import { toast } from 'sonner';
import { useCreateSnapshot } from '@/lib/hooks/useSnapshots';
import { useDashboardOverview } from '@/lib/hooks/useDashboardOverview';
import { SavingsRateBadge } from '@/components/ui/SavingsRateBadge';
import { getItalyDate, getItalyMonthYear } from '@/lib/utils/dateHelpers';
import { getGreeting } from '@/lib/utils/getGreeting';
import { SparklinePeriod } from '@/components/dashboard/PeriodSelector';
import { useChartColors } from '@/lib/hooks/useChartColors';
import { useDemoMode } from '@/lib/hooks/useDemoMode';
import { ASSET_CLASS_CHART_INDEX } from '@/lib/utils/allocationUtils';
import { filterSparklineByPeriod } from '@/lib/utils/sparklinePeriod';
import { buildOverviewVerdict } from '@/lib/utils/overviewNarrative';
import { cn } from '@/lib/utils';
import { PageContainer } from '@/components/layout/PageContainer';
import { PageHeader } from '@/components/layout/PageHeader';
import { OverviewVerdict } from '@/components/dashboard/overview/OverviewVerdict';
import { PatrimonioTile, resolveHeroValueClass } from '@/components/dashboard/overview/PatrimonioTile';
import { SintesiTile } from '@/components/dashboard/overview/SintesiTile';
import { CashflowTile } from '@/components/dashboard/overview/CashflowTile';
import { ComposizioneTile } from '@/components/dashboard/overview/ComposizioneTile';
import { CostiTile } from '@/components/dashboard/overview/CostiTile';
import { ObiettivoTile } from '@/components/dashboard/overview/ObiettivoTile';
import { CategoryTile } from '@/components/dashboard/overview/CategoryTile';
import { AssetPrincipaliTile } from '@/components/dashboard/overview/AssetPrincipaliTile';
import { OverviewTile, TILE_CELL_CLASS } from '@/components/dashboard/overview/OverviewTile';
import { TileGridSkeleton } from '@/components/ui/tile-grid-skeleton';
import { ErrorNotice } from '@/components/ui/error-notice';
import { describeReadFailure, resolveSurfaceState } from '@/lib/utils/statesNarrative';

const MotionButtonShell = motion.div;

/**
 * PANORAMICA — verdict + tile grid (v3, 2026-08-22)
 *
 * The page answers "come va?" before it shows a number: a rule-generated verdict sentence
 * (lib/utils/overviewNarrative.ts) sits at the top, and under it a 12-column bento of tiles,
 * each answering ONE question with a one-line reading above its figures. Dense, but it scrolls:
 * the third row (categories, top assets) sits below the fold at 1440×900 by design.
 *
 *   Mobile (1 col):  Verdict → Patrimonio → Cashflow → Sintesi → Composizione → Costi →
 *                    Obiettivo → Spese → Entrate → Asset principali
 *   Desktop (12 col): Patrimonio(5, 2 rows) | Sintesi(3) | Cashflow(4)
 *                                           | Composizione(3) | Costi(2) | Obiettivo(2)
 *                     Spese(4) | Entrate(3) | Asset principali(5)
 *
 * Data still flows through the single overview payload (`useDashboardOverview`); the verdict
 * and every reading are derived from it, nothing is fetched separately.
 */

const ITALIAN_LONG_DATE = new Intl.DateTimeFormat('it-IT', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

/** Grid cell wrapper: the tile stretches to the row height so `mt-auto` footers align. */
const CELL_CLASS = TILE_CELL_CLASS;

export default function DashboardPage() {
  const { user } = useAuth();
  const { ownerId } = useActiveAccount();
  const isDemo = useDemoMode();
  const prefersReducedMotion = useReducedMotion();

  // ─── Header: greeting + today's date, both in Italian wall-clock time ─────────
  const header = useMemo(() => {
    const now = getItalyDate(new Date());
    const result = getGreeting(now.getHours());
    const firstName = user?.displayName?.split(' ')[0];
    const title =
      firstName && firstName.length <= 20 ? `${result.greeting} ${firstName}` : result.greeting;
    return { title, date: ITALIAN_LONG_DATE.format(now) };
  }, [user?.displayName]);

  const { data: overview, isLoading: loadingOverview, isError: overviewError, refetch: refetchOverview } =
    useDashboardOverview(ownerId);
  const createSnapshotMutation = useCreateSnapshot(ownerId || '');

  // ─── UI State ─────────────────────────────────────────────────────────────────
  const [creatingSnapshot, setCreatingSnapshot] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [snapshotDialogStyle, setSnapshotDialogStyle] = useState<CSSProperties | undefined>(
    undefined,
  );
  const snapshotButtonRef = useRef<HTMLButtonElement | null>(null);
  const snapshotDialogRef = useRef<HTMLDivElement | null>(null);

  const chartColors = useChartColors();
  const [sparklinePeriod, setSparklinePeriod] = useState<SparklinePeriod>('1A');

  // ─── Derived metrics ──────────────────────────────────────────────────────────
  const totalValue = overview?.metrics.totalValue ?? 0;
  const today = useMemo(() => {
    const { month, year } = getItalyMonthYear();
    return {
      month,
      year,
      dayOfMonth: getItalyDate(new Date()).getDate(),
      daysInMonth: new Date(year, month, 0).getDate(),
    };
  }, []);

  // null (not 0) when there is no income: a rate needs a denominator.
  const savingsRate = useMemo(() => {
    if (!overview?.expenseStats) return null;
    const { income, expenses } = overview.expenseStats.currentMonth;
    if (income <= 0) return null;
    return ((income - expenses) / income) * 100;
  }, [overview]);

  const coverageRatio = useMemo(() => {
    if (!overview?.expenseStats) return null;
    const { income, expenses } = overview.expenseStats.currentMonth;
    if (expenses <= 0) return null;
    return income / expenses;
  }, [overview]);

  const sparklineDisplay = useMemo(() => {
    if (!overview?.sparklineData) return [];
    return filterSparklineByPeriod(overview.sparklineData, sparklinePeriod);
  }, [overview, sparklinePeriod]);

  // Overflow guard for the hero number: a 7-8 figure total at 44/54px would wrap in the tile.
  const heroValueClass = useMemo(() => resolveHeroValueClass(totalValue), [totalValue]);

  // Composition remapped by ASSET_CLASS_CHART_INDEX so a class is the same hue as on
  // Allocazione/Storico — a positional remap drifts with object key order.
  const assetClassData = useMemo(
    () =>
      (overview?.charts.assetClassData ?? []).map((d) => ({
        ...d,
        color: chartColors[ASSET_CLASS_CHART_INDEX[d.assetClass ?? ''] ?? 0] ?? d.color,
      })),
    [overview, chartColors],
  );

  // The hero's "Mercato:" digest on this page is per CLASS; Patrimonio passes instruments
  // instead, which is why the mapping lives at the call site and not inside the tile.
  const classMovers = useMemo(
    () => (overview?.topMovers ?? []).map((m) => ({ key: m.assetClass, label: m.label, delta: m.delta })),
    [overview],
  );

  const verdict = useMemo(() => {
    if (!overview) return null;
    return buildOverviewVerdict({
      month: today.month,
      totalValue,
      monthlyVariation: overview.variations.monthly,
      yearlyVariation: overview.variations.yearly,
      isNewATH: overview.ath?.isNewATH ?? false,
      savingsRate,
      marketEffect: overview.marketEffect ?? null,
      topMover: overview.topMovers?.[0] ?? null,
    });
  }, [overview, today.month, totalValue, savingsRate]);

  // ─── Dialog position animation ────────────────────────────────────────────────
  useEffect(() => {
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

  const snapshotAction = (
    <MotionButtonShell
      whileTap={prefersReducedMotion ? undefined : { scale: 0.97 }}
      transition={springLayoutTransition}
    >
      <Button
        ref={snapshotButtonRef}
        onClick={handleCreateSnapshot}
        disabled={isDemo || creatingSnapshot || (overview?.flags.assetCount ?? 0) === 0}
        title={isDemo ? 'Non disponibile in modalità demo' : undefined}
        variant="outline"
        className="h-9"
        aria-label={creatingSnapshot ? 'Creazione snapshot in corso' : 'Crea snapshot'}
      >
        <Camera className="h-4 w-4" aria-hidden="true" />
        <span className="hidden sm:inline">{creatingSnapshot ? 'Creazione...' : 'Crea snapshot'}</span>
      </Button>
    </MotionButtonShell>
  );

  // ─── Loading, then failure — never the two collapsed into one ─────────────────
  // `loadingOverview || !overview` used to be ONE branch, so a failed read pulsed forever: the
  // skeleton is a WAIT, and a wait that cannot end is a lie (lib/utils/statesNarrative.ts).
  const overviewState = resolveSurfaceState({
    loading: loadingOverview,
    failed: overviewError || !overview || !verdict,
  });

  const pageChrome = (
    <PageHeader label="Panoramica" title={header.title} description={header.date} separator={false} />
  );

  if (overviewState === 'loading') {
    return (
      <PageContainer width="wide">
        {pageChrome}
        <TileGridSkeleton />
      </PageContainer>
    );
  }

  // The `!overview || !verdict` repeat is what narrows the types below; `overviewState` is what
  // says WHY the page is here.
  if (overviewState === 'failed' || !overview || !verdict) {
    return (
      <PageContainer width="wide">
        {pageChrome}
        {/* The whole page reads ONE payload, so no tile is left that could answer: the grid is
            absent rather than filled with six cells repeating the same failure. */}
        <ErrorNotice
          className="max-w-[920px]"
          onRetry={() => void refetchOverview()}
          notice={describeReadFailure({
            consequence:
              'La Panoramica legge un riepilogo solo, e non è stato letto: non c’è nessuna tessera che possa rispondere senza di esso.',
            canRetry: true,
          })}
        />
      </PageContainer>
    );
  }

  const costsVisible = overview.flags.hasTERTracking || overview.flags.hasStampDuty;
  const expenseStats = overview.expenseStats;
  // Old cached payloads carry only the featured goal; the list supersedes it when present.
  const goals = overview.goalProgressList ?? (overview.goalProgress ? [overview.goalProgress] : []);

  // ─── Render ───────────────────────────────────────────────────────────────────
  return (
    <PageContainer width="wide">
      <motion.div layout="position" transition={springLayoutTransition} className="space-y-4">
        <PageHeader
          label="Panoramica"
          title={header.title}
          description={header.date}
          separator={false}
          actions={snapshotAction}
        />

        <motion.div variants={cardItem} initial="hidden" animate="visible" className="pt-1">
          <OverviewVerdict verdict={verdict} />
        </motion.div>

        <motion.div
          variants={staggerContainer}
          initial="hidden"
          animate="visible"
          className="grid grid-cols-1 gap-3 tablet:grid-cols-2 desktop:grid-cols-12"
        >
          <motion.div
            variants={cardItem}
            className={cn(CELL_CLASS, 'tablet:col-span-2 desktop:col-span-5 desktop:row-span-2')}
          >
            <PatrimonioTile
              totalValue={totalValue}
              heroValueClass={heroValueClass}
              variations={overview.variations}
              isNewATH={overview.ath?.isNewATH ?? false}
              sparklinePeriod={sparklinePeriod}
              onSparklinePeriodChange={setSparklinePeriod}
              sparklineDisplay={sparklineDisplay}
              movers={classMovers}
              assetCount={overview.flags.assetCount}
              hasCurrentMonthSnapshot={overview.flags.currentMonthSnapshotExists}
            />
          </motion.div>

          {/* Below desktop, Cashflow reads before Sintesi: the month is the more frequent question. */}
          <motion.div
            variants={cardItem}
            className={cn(CELL_CLASS, 'order-2 desktop:order-none desktop:col-span-3')}
          >
            <SintesiTile
              metrics={overview.metrics}
              hasCostBasisTracking={overview.flags.hasCostBasisTracking}
            />
          </motion.div>

          <motion.div
            variants={cardItem}
            className={cn(CELL_CLASS, 'order-1 desktop:order-none desktop:col-span-4')}
          >
            {expenseStats ? (
              <CashflowTile
                expenseStats={expenseStats}
                month={today.month}
                dayOfMonth={today.dayOfMonth}
                daysInMonth={today.daysInMonth}
                savingsRate={savingsRate}
                coverageRatio={coverageRatio}
              />
            ) : (
              <OverviewTile eyebrow="Cashflow">
                <p className="mt-3 text-[13px] text-muted-foreground">Nessun dato questo mese.</p>
              </OverviewTile>
            )}
          </motion.div>

          <motion.div
            variants={cardItem}
            className={cn(CELL_CLASS, 'order-3 desktop:order-none desktop:col-span-3')}
          >
            <ComposizioneTile data={assetClassData} />
          </motion.div>

          {costsVisible && (
            <motion.div
              variants={cardItem}
              className={cn(
                CELL_CLASS,
                'order-4 desktop:order-none',
                goals.length > 0 ? 'desktop:col-span-2' : 'desktop:col-span-4',
              )}
            >
              <CostiTile metrics={overview.metrics} flags={overview.flags} costDrivers={overview.costDrivers ?? []} />
            </motion.div>
          )}

          {goals.length > 0 && (
            <motion.div
              variants={cardItem}
              className={cn(
                CELL_CLASS,
                'order-5 desktop:order-none',
                costsVisible ? 'desktop:col-span-2' : 'desktop:col-span-4',
              )}
            >
              <ObiettivoTile goals={goals} />
            </motion.div>
          )}

          {/* Keeps the second desktop row closed when neither optional tile renders. */}
          {!costsVisible && goals.length === 0 && (
            <div className="hidden desktop:block desktop:col-span-4" aria-hidden="true" />
          )}

          {expenseStats && (
            <>
              <motion.div
                variants={cardItem}
                className={cn(CELL_CLASS, 'order-6 desktop:order-none desktop:col-span-4')}
              >
                <CategoryTile
                  eyebrow="Spese per categoria"
                  total={expenseStats.currentMonth.expenses}
                  categories={expenseStats.topExpenseCategories}
                  color="var(--chart-1)"
                  emptyCopy="Nessuna spesa registrata questo mese."
                />
              </motion.div>
              <motion.div
                variants={cardItem}
                className={cn(CELL_CLASS, 'order-7 desktop:order-none desktop:col-span-3')}
              >
                <CategoryTile
                  eyebrow="Entrate per categoria"
                  total={expenseStats.currentMonth.income}
                  categories={expenseStats.topIncomeCategories}
                  color="var(--chart-2)"
                  emptyCopy="Nessuna entrata registrata questo mese."
                />
              </motion.div>
            </>
          )}

          <motion.div
            variants={cardItem}
            className={cn(
              CELL_CLASS,
              'order-8 desktop:order-none tablet:col-span-2',
              expenseStats ? 'desktop:col-span-5' : 'desktop:col-span-12',
            )}
          >
            <AssetPrincipaliTile
              topAssets={overview.topAssets ?? []}
              assetCount={overview.flags.assetCount}
            />
          </motion.div>
        </motion.div>

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
                {`${String(today.month).padStart(2, '0')}/${today.year}`}
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
        {expenseStats && ownerId && (
          <SavingsRateBadge
            ownerId={ownerId}
            previousMonthIncome={expenseStats.previousMonth.income}
            previousMonthExpenses={expenseStats.previousMonth.expenses}
          />
        )}
      </motion.div>
    </PageContainer>
  );
}
