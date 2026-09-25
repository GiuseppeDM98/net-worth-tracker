'use client';

import { type MouseEvent, useCallback, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion, useReducedMotion } from 'framer-motion';
import { cardItem, springLayoutTransition, staggerContainer } from '@/lib/utils/motionVariants';
import { useAuth } from '@/contexts/AuthContext';
import { useActiveAccount } from '@/contexts/ActiveAccountContext';
import { updateHallOfFame } from '@/lib/services/hallOfFameService';
import { Button } from '@/components/ui/button';
import { ResponsiveModal } from '@/components/ui/responsive-modal';
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
import { buildOverviewVerdict, rankingFromOverview, resolveLivedCashflow } from '@/lib/utils/overviewNarrative';
import { describeCategoryShare } from '@/lib/utils/cashflowNarrative';
import { describeSnapshotOverwrite } from '@/lib/utils/dialogNarrative';
import { resolveCenteredModalOrigin } from '@/lib/utils/modalOrigin';
import type { DashboardOverviewCategoryAmount } from '@/types/dashboardOverview';
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
 *                     Spese(4) | Entrate(4) | Asset principali(4)
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
  const router = useRouter();

  // A category row opens its Scheda on Analisi — the same three flat params the Scheda writes
  // to the URL itself (doc/guide/cashflow-analisi.md). A payload from before source version 17
  // carries no type: the row stays a row, never a link to nowhere.
  const openCategoryInAnalisi = useCallback(
    (category: DashboardOverviewCategoryAmount) => {
      if (!category.categoryKey || !category.expenseType) return;
      const params = new URLSearchParams({ focusType: category.expenseType, focusCat: category.categoryKey });
      router.push(`/dashboard/analisi?${params.toString()}`);
    },
    [router],
  );

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
  // Where the confirm grows from, resolved at the click (lib/utils/modalOrigin.ts) and kept
  // through the close, so the panel also leaves toward the button.
  const [snapshotOrigin, setSnapshotOrigin] = useState<string | undefined>(undefined);
  // The button that was PRESSED: the header mounts its actions twice (the desktop row and the
  // phone navbar), so a ref on the element itself would be whichever copy mounted last.
  const snapshotOpenerRef = useRef<HTMLButtonElement | null>(null);

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
    // The verdict judges the cashflow already happened; the Cashflow tile keeps the whole month.
    const cashflow = resolveLivedCashflow(overview.expenseStats);
    return buildOverviewVerdict({
      month: today.month,
      totalValue,
      monthlyVariation: overview.variations.monthly,
      yearlyVariation: overview.variations.yearly,
      isNewATH: overview.ath?.isNewATH ?? false,
      savingsRate: cashflow ? cashflow.savingsRate : savingsRate,
      cashflow,
      marketEffect: overview.marketEffect ?? null,
      topMover: overview.topMovers?.[0] ?? null,
      sales: overview.monthSales ?? null,
    });
  }, [overview, today.month, totalValue, savingsRate]);

  // ─── Snapshot handlers ────────────────────────────────────────────────────────
  const snapshotOverwrite = useMemo(
    () => describeSnapshotOverwrite({ month: today.month, year: today.year }),
    [today.month, today.year],
  );

  const closeSnapshotConfirm = () => setShowConfirmDialog(false);

  const handleCreateSnapshot = async (event: MouseEvent<HTMLButtonElement>) => {
    if (!user || !ownerId) return;
    try {
      if (overview?.flags.currentMonthSnapshotExists) {
        snapshotOpenerRef.current = event.currentTarget;
        setSnapshotOrigin(
          prefersReducedMotion ? undefined : resolveCenteredModalOrigin(event.currentTarget.getBoundingClientRect()),
        );
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

  // A plain button: it used to sit in a `motion.div` with the app's ONLY `whileTap` (scale 0.97)
  // on `springLayoutTransition`, the soft spring DESIGN.md keeps for whole regions — ~300 ms to
  // shrink and ~500 ms to come back, so a normal click was still «breathing» while the confirm
  // opened over it.
  const snapshotAction = (
    <Button
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
  );

  // ─── Loading, then failure — never the two collapsed into one ─────────────────
  // `loadingOverview || !overview` used to be ONE branch, so a failed read pulsed forever: the
  // skeleton is a WAIT, and a wait that cannot end is a lie (lib/utils/statesNarrative.ts).
  const overviewState = resolveSurfaceState({
    loading: loadingOverview,
    failed: overviewError || !overview || !verdict,
  });

  const pageChrome = (
    <PageHeader label="Panoramica" title={header.title} description={header.date} />
  );

  if (overviewState === 'loading') {
    return (
      <PageContainer>
        {pageChrome}
        <TileGridSkeleton />
      </PageContainer>
    );
  }

  // The `!overview || !verdict` repeat is what narrows the types below; `overviewState` is what
  // says WHY the page is here.
  if (overviewState === 'failed' || !overview || !verdict) {
    return (
      <PageContainer>
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
  // The two category tiles read the concentration the way Tracciamento does («Il 29% va in
  // Mutuo; le prime tre fanno il 68%»), and each closes on the page that owns the depth.
  const expenseReading = expenseStats
    ? describeCategoryShare(rankingFromOverview(expenseStats.topExpenseCategories, expenseStats.currentMonth.expenses), 'expenses')
    : null;
  const incomeReading = expenseStats
    ? describeCategoryShare(rankingFromOverview(expenseStats.topIncomeCategories, expenseStats.currentMonth.income), 'income')
    : null;
  const analisiFooter = (
    <>
      Tutte le categorie in{' '}
      <Link href="/dashboard/analisi" className="text-foreground underline-offset-2 hover:underline">
        Analisi
      </Link>
      .
    </>
  );
  const allocazioneFooter = (
    <>
      Il piano in{' '}
      <Link href="/dashboard/allocation" className="text-foreground underline-offset-2 hover:underline">
        Allocazione
      </Link>
      .
    </>
  );
  // Old cached payloads carry only the featured goal; the list supersedes it when present.
  const goals = overview.goalProgressList ?? (overview.goalProgress ? [overview.goalProgress] : []);

  // ─── Render ───────────────────────────────────────────────────────────────────
  return (
    <PageContainer>
      <motion.div layout="position" transition={springLayoutTransition} className="space-y-4">
        <PageHeader
          label="Panoramica"
          title={header.title}
          description={header.date}
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
            <ComposizioneTile data={assetClassData} footer={allocazioneFooter} />
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
                  reading={expenseReading}
                  color="var(--chart-1)"
                  emptyCopy="Nessuna spesa registrata questo mese."
                  onSelectCategory={openCategoryInAnalisi}
                  footer={analisiFooter}
                />
              </motion.div>
              <motion.div
                variants={cardItem}
                className={cn(CELL_CLASS, 'order-7 desktop:order-none desktop:col-span-4')}
              >
                <CategoryTile
                  eyebrow="Entrate per categoria"
                  total={expenseStats.currentMonth.income}
                  categories={expenseStats.topIncomeCategories}
                  reading={incomeReading}
                  color="var(--chart-2)"
                  emptyCopy="Nessuna entrata registrata questo mese."
                  onSelectCategory={openCategoryInAnalisi}
                  footer={analisiFooter}
                />
              </motion.div>
            </>
          )}

          <motion.div
            variants={cardItem}
            className={cn(
              CELL_CLASS,
              'order-8 desktop:order-none tablet:col-span-2',
              // Three equal tiles on the third row (4 · 4 · 4): at 3 columns the income tile
              // could not hold a label, a 40px bar and two figures without overflowing its row.
              expenseStats ? 'desktop:col-span-4' : 'desktop:col-span-12',
            )}
          >
            <AssetPrincipaliTile
              topAssets={overview.topAssets ?? []}
              assetCount={overview.flags.assetCount}
            />
          </motion.div>
        </motion.div>

        {/* ── SNAPSHOT OVERWRITE CONFIRM ──
            `sm`: one question. The primary is NOT armed — the daily cron rewrites the running
            month's snapshot every night, so nothing here is lost that tonight would have kept. */}
        <ResponsiveModal
          open={showConfirmDialog}
          onClose={closeSnapshotConfirm}
          width="sm"
          eyebrow="Snapshot mensile"
          title={snapshotOverwrite.title}
          reading={{ narrative: snapshotOverwrite.reading, tone: 'neutral' }}
          triggerOrigin={snapshotOrigin}
          returnFocusTo={snapshotOpenerRef}
          footer={
            <>
              <Button type="button" variant="outline" onClick={closeSnapshotConfirm} disabled={creatingSnapshot}>
                Annulla
              </Button>
              <Button type="button" onClick={createSnapshot} disabled={creatingSnapshot}>
                Sovrascrivi
              </Button>
            </>
          }
        >
          <p className="text-[13px] leading-[1.45] text-muted-foreground">
            Prima aggiorno i prezzi, poi riscrivo il mese: può richiedere qualche secondo.
          </p>
        </ResponsiveModal>

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
