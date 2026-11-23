'use client';

import { type MouseEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion, useReducedMotion } from 'framer-motion';
import { cardItem, staggerContainer } from '@/lib/utils/motionVariants';
import { useAuth } from '@/contexts/AuthContext';
import { useActiveAccount } from '@/contexts/ActiveAccountContext';
import { updateHallOfFame } from '@/lib/services/hallOfFameService';
import { Button } from '@/components/ui/button';
import { ResponsiveModal } from '@/components/ui/responsive-modal';
import { Camera } from 'lucide-react';
import { toast } from 'sonner';
import { useCreateSnapshot } from '@/lib/hooks/useSnapshots';
import { DASHBOARD_OVERVIEW_STALE_TIME_MS, useDashboardOverview } from '@/lib/hooks/useDashboardOverview';
import { useFreshness } from '@/lib/hooks/useFreshness';
import { SavingsRateBadge } from '@/components/ui/SavingsRateBadge';
import { getItalyDate, getItalyMonthYear } from '@/lib/utils/dateHelpers';
import { getGreeting } from '@/lib/utils/getGreeting';
import { SparklinePeriod } from '@/components/dashboard/PeriodSelector';
import { useChartColors } from '@/lib/hooks/useChartColors';
import { useDemoMode } from '@/lib/hooks/useDemoMode';
import { ASSET_CLASS_CHART_INDEX } from '@/lib/utils/allocationUtils';
import { filterSparklineByPeriod } from '@/lib/utils/sparklinePeriod';
import {
  buildOverviewVerdict,
  describeScheduledCaption,
  rankingFromOverview,
  resolveLivedCashflow,
  type OverviewVerdictInput,
} from '@/lib/utils/overviewNarrative';
import {
  describeOverviewAsides,
  describeOverviewClosedAnswers,
  monthCoverageRatio,
  monthSavingsRate,
  OVERVIEW_PATRIMONIO_ID,
  OVERVIEW_SECTION_IDS,
  selectOverviewStrip,
  selectResourceBar,
  verdictNamesMarket,
} from '@/lib/utils/overviewSummary';
import { useMobileSections, type SectionSpec } from '@/lib/hooks/useMobileSections';
import { VERDICT_REST_SECTION } from '@/lib/utils/mobileSections';
import { splitVerdict } from '@/lib/utils/narrative';
import { liftedBlocks } from '@/lib/utils/verdictStrip';
import { describeCategoryShare } from '@/lib/utils/cashflowNarrative';
import { describeSnapshotOverwrite } from '@/lib/utils/dialogNarrative';
import { resolveCenteredModalOrigin } from '@/lib/utils/modalOrigin';
import type { DashboardOverviewCategoryAmount } from '@/types/dashboardOverview';
import { cn } from '@/lib/utils';
import { PageContainer } from '@/components/layout/PageContainer';
import { PageHeader } from '@/components/layout/PageHeader';
import { OVERVIEW_VERDICT_ID, OverviewVerdict } from '@/components/dashboard/overview/OverviewVerdict';
import {
  isPatrimonioLiftedBlock,
  PATRIMONIO_CURVE_ID_SUFFIX,
  PatrimonioTile,
  resolveHeroValueClass,
  type PatrimonioLiftedBlock,
} from '@/components/dashboard/overview/PatrimonioTile';
import { ResourceBar } from '@/components/dashboard/overview/ResourceBar';
import { SintesiTile } from '@/components/dashboard/overview/SintesiTile';
import { CashflowTile } from '@/components/dashboard/overview/CashflowTile';
import { ComposizioneTile } from '@/components/dashboard/overview/ComposizioneTile';
import { CostiTile } from '@/components/dashboard/overview/CostiTile';
import { ObiettivoTile } from '@/components/dashboard/overview/ObiettivoTile';
import { CategoryTile } from '@/components/dashboard/overview/CategoryTile';
import { incomeRingSegments } from '@/lib/utils/categoryRing';
import { AssetPrincipaliTile } from '@/components/dashboard/overview/AssetPrincipaliTile';
import { IntestatariTile } from '@/components/dashboard/overview/IntestatariTile';
import { OverviewTile, TILE_CELL_CLASS } from '@/components/dashboard/overview/OverviewTile';
import { TILE_ROW_CELL_CLASS } from '@/components/ui/tile';
import { VerdictStrip } from '@/components/ui/verdict-strip';
import { PageRest } from '@/components/ui/page-rest';
import { RowAnswers } from '@/components/ui/row-answers';
import { useTabletComposition, useTabletStage } from '@/lib/hooks/useTabletComposition';
import {
  COMPACT_GRID_CLASS,
  COMPACT_GRID_WRAPPER_CLASS,
  INDEX_CLASS,
  LEAD_CELL_CLASS,
  REST_CELL_CLASS,
  STAGE_CLASS,
  STAGE_WRAPPER_CLASS,
  VERDICT_CELL_CLASS,
} from '@/lib/utils/tabletComposition';
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
 *   Desktop (12 col): Patrimonio(5, 2 rows) | Sintesi(3) | Cashflow(4)
 *                                           | Composizione(3) | Costi(2) | Obiettivo(2)
 *                     Spese(4) | Entrate(4) | Asset principali(4)
 *   Below desktop:    ONE sequence, the DOM above (DESIGN.md → The First-Screen Rule;
 *                     since 2026-10-11): title → the strip of three figures → «Il perché» →
 *                     Patrimonio, open, its chips lifted and its curve at 120px → «Il resto della
 *                     pagina» → Sintesi, Cashflow, Composizione, Costi, Obiettivo, Spese, Entrate,
 *                     Asset principali as closed rows (`useMobileSections`; doc/guide/panoramica.md
 *                     § Composizione mobile). No `order-*`: Sintesi reads before Cashflow on a phone
 *                     as it does at 1440.
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

/**
 * Every row of the phone composition, in the DOM's order (The Closed-Row Rule): every tile but
 * Patrimonio, which is THE tile and never closes (The First-Screen Rule). Module-level, as the controller
 * asks; the page hands it the rows PRESENT (`resolveOverviewSections`), because Costi, Obiettivo
 * and the two category tiles come and go with the payload. The page has one payload, so no row
 * ever carries `failed`.
 */
const OVERVIEW_SECTIONS: readonly SectionSpec[] = [
  { id: OVERVIEW_SECTION_IDS.sintesi, eyebrow: 'Sintesi patrimoniale' },
  { id: OVERVIEW_SECTION_IDS.cashflow, eyebrow: 'Cashflow' },
  { id: OVERVIEW_SECTION_IDS.composizione, eyebrow: 'Composizione' },
  { id: OVERVIEW_SECTION_IDS.costi, eyebrow: 'Costi' },
  { id: OVERVIEW_SECTION_IDS.obiettivo, eyebrow: 'Obiettivi' },
  { id: OVERVIEW_SECTION_IDS.spese, eyebrow: 'Spese per categoria' },
  { id: OVERVIEW_SECTION_IDS.entrate, eyebrow: 'Entrate per categoria' },
  { id: OVERVIEW_SECTION_IDS.asset, eyebrow: 'Asset principali' },
  { id: OVERVIEW_SECTION_IDS.intestatari, eyebrow: 'Intestatari' },
];

/** The rows the payload renders — one `SectionSpec` per tile present, the DOM's order kept. */
function resolveOverviewSections(present: { costs: boolean; goals: boolean; expenseStats: boolean; ownership: boolean }): readonly SectionSpec[] {
  return OVERVIEW_SECTIONS.filter((section) => {
    if (section.id === OVERVIEW_SECTION_IDS.costi) return present.costs;
    if (section.id === OVERVIEW_SECTION_IDS.obiettivo) return present.goals;
    if (section.id === OVERVIEW_SECTION_IDS.spese || section.id === OVERVIEW_SECTION_IDS.entrate) return present.expenseStats;
    if (section.id === OVERVIEW_SECTION_IDS.intestatari) return present.ownership;
    return true;
  });
}

/** What the «Da inizio anno» cell announces it opens: THE tile is no row, so the controller has no eyebrow for it. */
const PATRIMONIO_CELL_EYEBROW = "l'andamento da inizio anno";

/** The checked option of the curve's period picker — where the «Da inizio anno» cell lands the focus. */
const CHECKED_PERIOD_SELECTOR = '[role="radiogroup"][aria-label="Periodo del grafico"] [role="radio"][aria-checked="true"]';

/**
 * Whether the tile grid's entrance cascade has played in this session (until a reload). The
 * cascade — `staggerContainer` × 8 tiles + `cardItem` — keeps the figures semi-transparent for
 * ~1 s after the data (962 ms measured on the mirror, 2026-10-08); the Panoramica is the page
 * reopened most, and from the second opening the cascade reveals nothing the page scene does not
 * already say. So it plays the FIRST time the grid renders in a session, and later openings show
 * the tiles at once (owner's call, 2026-10-08). Set after the grid commits, never on a
 * skeleton or a failed read: those openings have not shown the cascade.
 */
const tileGridEntrance = { played: false };

// Module-level so the page's try block holds no conditional: keeps it compilable by the React Compiler.
function resolveSnapshotDialogOrigin(reducedMotion: boolean | null, trigger: HTMLElement): string | undefined {
  return reducedMotion ? undefined : resolveCenteredModalOrigin(trigger.getBoundingClientRect());
}

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

  const overviewQuery = useDashboardOverview(ownerId);
  const { data: overview, isLoading: loadingOverview, isError: overviewError, refetch: refetchOverview } = overviewQuery;
  // The header's «Aggiornato alle…» while a payload restored from the persisted cache is being
  // reread: on the overview's own one-minute threshold, and dated by the payload's
  // `freshness.updatedAt` when the materialised summary is older than the read that fetched it.
  const freshness = useFreshness([
    {
      query: overviewQuery,
      staleAfterMs: DASHBOARD_OVERVIEW_STALE_TIME_MS,
      contentUpdatedAt: overview ? Date.parse(overview.freshness.updatedAt) : null,
    },
  ]);
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
  // Decided once per mount: a later opening in the session finds the cascade already played.
  const [playsEntrance] = useState(() => !tileGridEntrance.played);

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

  // The Cashflow tile's two ratios, on the WHOLE month (lib/utils/overviewSummary.ts); the
  // verdict and the strip judge the days lived instead (`resolveLivedCashflow`).
  const savingsRate = monthSavingsRate(overview?.expenseStats);
  const coverageRatio = monthCoverageRatio(overview?.expenseStats);

  // The rows of the phone composition (The Closed-Row Rule, since 2026-10-11): one per tile present, in the
  // DOM's order; at 1440 every `collapse()` is `undefined` and the page is the page of every width.
  const costsVisible = Boolean(overview && (overview.flags.hasTERTracking || overview.flags.hasStampDuty));
  const goals = useMemo(
    () => overview?.goalProgressList ?? (overview?.goalProgress ? [overview.goalProgress] : []),
    [overview],
  );
  const hasExpenseStats = Boolean(overview?.expenseStats);
  const hasGoals = goals.length > 0;
  // The Intestatari tile exists only when a held asset names a person (2026-10-17).
  const hasOwnership = Boolean(overview?.ownership);
  const overviewSections = useMemo(
    () => resolveOverviewSections({ costs: costsVisible, goals: hasGoals, expenseStats: hasExpenseStats, ownership: hasOwnership }),
    [costsVisible, hasGoals, hasExpenseStats, hasOwnership],
  );
  const sections = useMobileSections({ route: 'panoramica', sections: overviewSections });
  // At 768 the same rows on two columns, in landscape in the index (since 2026-10-16): the rows present ARE the order.
  const stageRef = useTabletStage();
  const tablet = useTabletComposition({ sections, order: overviewSections.map((section) => section.id) });

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

  const verdictInput = useMemo<OverviewVerdictInput | null>(() => {
    if (!overview) return null;
    // The verdict judges the cashflow already happened; the Cashflow tile keeps the whole month.
    const cashflow = resolveLivedCashflow(overview.expenseStats);
    return {
      month: today.month,
      totalValue,
      monthlyVariation: overview.variations.monthly,
      yearlyVariation: overview.variations.yearly,
      isNewATH: overview.ath?.isNewATH ?? false,
      savingsRate: cashflow ? cashflow.savingsRate : savingsRate,
      cashflow,
      marketEffect: overview.marketEffect ?? null,
      monthFlows: overview.monthFlows ?? null,
      topMover: overview.topMovers?.[0] ?? null,
      sales: overview.monthSales ?? null,
    };
  }, [overview, today.month, totalValue, savingsRate]);
  const verdict = useMemo(() => (verdictInput ? buildOverviewVerdict(verdictInput) : null), [verdictInput]);

  // ─── Snapshot handlers ────────────────────────────────────────────────────────
  const snapshotOverwrite = useMemo(
    () => describeSnapshotOverwrite({ month: today.month, year: today.year }),
    [today.month, today.year],
  );

  const closeSnapshotConfirm = () => setShowConfirmDialog(false);

  const handleCreateSnapshot = async (event: MouseEvent<HTMLButtonElement>) => {
    if (!user || !ownerId) return;
    // Read before the try, which may hold no optional chain under the React Compiler.
    const snapshotExists = overview?.flags.currentMonthSnapshotExists;
    try {
      if (snapshotExists) {
        snapshotOpenerRef.current = event.currentTarget;
        setSnapshotOrigin(resolveSnapshotDialogOrigin(prefersReducedMotion, event.currentTarget));
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
    }
    // After the try/catch rather than in a `finally`: keeps the page compilable by the React Compiler.
    setCreatingSnapshot(false);
  };

  // A plain button: it used to sit in a `motion.div` with the app's ONLY `whileTap` (scale 0.97)
  // on `springLayoutTransition`, the soft spring for whole regions (gone with the page wrapper on
  // 2026-10-08) — ~300 ms to shrink and ~500 ms to come back, so a normal click was still
  // «breathing» while the confirm opened over it.
  const snapshotAction = (
    <Button
      onClick={handleCreateSnapshot}
      disabled={isDemo || creatingSnapshot || (overview?.flags.assetCount ?? 0) === 0}
      title={isDemo ? 'Non disponibile in modalità demo' : undefined}
      variant="outline"
      // 44px to the thumb below `desktop:`, the 36px of the header row from it (AGENTS.md § Accessibility).
      className="h-11 desktop:h-9"
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
  useEffect(() => {
    if (overviewState === 'ready') tileGridEntrance.played = true;
  }, [overviewState]);
  const entranceInitial = playsEntrance ? 'hidden' : false;

  const pageChrome = (
    <PageHeader label="Panoramica" title={header.title} description={header.date} freshness={freshness} emblem="panoramica" />
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
  if (overviewState === 'failed' || !overview || !verdict || !verdictInput) {
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

  const expenseStats = overview.expenseStats;
  // The two category tiles read the concentration the way Tracciamento does («Il 29% va in
  // Mutuo; le prime tre fanno il 68%»), and each closes on the page that owns the depth.
  const expenseReading = expenseStats
    ? describeCategoryShare(rankingFromOverview(expenseStats.topExpenseCategories, expenseStats.currentMonth.expenses), 'expenses')
    : null;
  const incomeRanking = expenseStats ? rankingFromOverview(expenseStats.topIncomeCategories, expenseStats.currentMonth.income) : null;
  const incomeReading = incomeRanking ? describeCategoryShare(incomeRanking, 'income') : null;
  // The income is the ring Tracciamento draws (The Ring Rule, 2026-11-15: the owner's tour aligned the two pages);
  // the spending stays ranked rows, a ranking on both.
  const incomeRing = incomeRanking ? incomeRingSegments(incomeRanking) : null;
  // The two totals hold the rows still in the calendar: declared under the readings
  // (The Scheduled-Is-Not-Spent Rule, at every width — DESIGN.md → The Binding-Clause Rule).
  const expensesScheduledCaption = expenseStats ? describeScheduledCaption(expenseStats.currentMonth.expensesScheduled ?? 0, today.daysInMonth) : null;
  const incomeScheduledCaption = expenseStats ? describeScheduledCaption(expenseStats.currentMonth.incomeScheduled ?? 0, today.daysInMonth) : null;

  // ─── The phone composition (2026-10-11) ───────────────────────────────────────────
  const strip = selectOverviewStrip(overview);
  const asides = describeOverviewAsides(overview);
  // What each closed row answers in the landscape index (2026-10-16): figures the strip and THE tile do not print.
  const rowAnswers = describeOverviewClosedAnswers(overview, today);
  const restCollapse = sections.collapse(VERDICT_REST_SECTION);
  // No «Il perché» when a binding clause (the tax on a sale) cancels the cut: the paragraph is whole.
  const hasRest = splitVerdict(verdict).rest.length > 0;
  // THE tile hides what the strip prints (The Lifted-Figure Rule): the two chips, the curve's
  // last label (the hero in compact form) and, only when the sentence names the market in words,
  // the «Mercato:» digest.
  const liftedFigures: PatrimonioLiftedBlock[] = [
    ...liftedBlocks(strip, OVERVIEW_PATRIMONIO_ID).filter(isPatrimonioLiftedBlock),
    'curve-end',
    ...(verdictNamesMarket(verdictInput) ? (['movers'] as const) : []),
  ];
  // The controller names the rows; the two cells that open no row get their words here.
  const stripEyebrows = { ...sections.eyebrows, [OVERVIEW_PATRIMONIO_ID]: PATRIMONIO_CELL_EYEBROW, [VERDICT_REST_SECTION]: 'il perché' };

  /**
   * What a strip cell opens: «Questo mese» the verdict's rest (or, with the paragraph already
   * whole, the focus on it); «Da inizio anno» THE tile on its YTD curve — the tile never closes,
   * so the cell changes the window, scrolls to the «Andamento» row after the commit and lands the
   * focus on the checked period; «Messo da parte finora» the Cashflow row through the controller.
   */
  const handleStripOpen = (section: string) => {
    if (section === VERDICT_REST_SECTION) {
      if (restCollapse && hasRest) restCollapse.onOpenChange(true);
      else document.getElementById(OVERVIEW_VERDICT_ID)?.focus({ preventScroll: true });
      return;
    }
    if (section === OVERVIEW_PATRIMONIO_ID) {
      setSparklinePeriod('YTD');
      requestAnimationFrame(() => {
        const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        // Without a curve (fewer than two points) the row does not exist: the tile itself, then.
        const target = document.getElementById(`${OVERVIEW_PATRIMONIO_ID}${PATRIMONIO_CURVE_ID_SUFFIX}`) ?? document.getElementById(OVERVIEW_PATRIMONIO_ID);
        target?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
        document.querySelector<HTMLElement>(CHECKED_PERIOD_SELECTOR)?.focus({ preventScroll: true });
      });
      return;
    }
    sections.reveal(section);
  };
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
  // ─── Render ───────────────────────────────────────────────────────────────────
  return (
    <PageContainer>
      <div className="space-y-4">
        <PageHeader
          label="Panoramica"
          emblem="panoramica"
          title={header.title}
          description={header.date}
          actions={snapshotAction}
          freshness={freshness}
        />

        {/* A costume theme's four-figure bar, at ≥ 1440 only: nothing in any other theme (DESIGN.md → The Costume Rule). */}
        <ResourceBar figures={selectResourceBar(overview)} />

        {/* The stage: the verdict over the grid; on a tablet in landscape the answer on the left
            (verdict and THE tile) and the index on the right (lib/utils/tabletComposition.ts). */}
        <RowAnswers value={rowAnswers}>
        <div className={STAGE_WRAPPER_CLASS}>
        <div ref={stageRef} className={STAGE_CLASS}>
        <motion.div variants={cardItem} initial={entranceInitial} animate="visible" data-stage="verdict" className={cn('pt-1', VERDICT_CELL_CLASS)}>
          <OverviewVerdict
            verdict={verdict}
            strip={<VerdictStrip figures={strip} onOpen={handleStripOpen} eyebrows={stripEyebrows} />}
            restCollapse={restCollapse}
          />
        </motion.div>

        {/* ONE sequence: the DOM order is the reading order at every width, no `order-*`
            (The First-Screen Rule); a new tile takes its place in the JSX — inside the index if it is a row. */}
        <div className={COMPACT_GRID_WRAPPER_CLASS}>
        <motion.div
          variants={staggerContainer}
          initial={entranceInitial}
          animate="visible"
          className={COMPACT_GRID_CLASS}
        >
          <motion.div
            variants={cardItem}
            data-stage="lead"
            className={cn(CELL_CLASS, LEAD_CELL_CLASS, 'desktop:col-span-5 desktop:row-span-2')}
          >
            <PatrimonioTile
              id={OVERVIEW_PATRIMONIO_ID}
              className="scroll-mt-24"
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
              liftedFigures={liftedFigures}
            />
          </motion.div>

          <div className={INDEX_CLASS}>
          <PageRest sections={sections} className={REST_CELL_CLASS} />

          <motion.div
            variants={cardItem}
            className={cn(TILE_ROW_CELL_CLASS, tablet.cellClass(OVERVIEW_SECTION_IDS.sintesi), 'desktop:col-span-3')}
          >
            <SintesiTile
              metrics={overview.metrics}
              hasCostBasisTracking={overview.flags.hasCostBasisTracking}
              collapse={sections.collapse(OVERVIEW_SECTION_IDS.sintesi)}
              asideWhenClosed={asides[OVERVIEW_SECTION_IDS.sintesi]}
            />
          </motion.div>

          <motion.div
            variants={cardItem}
            className={cn(TILE_ROW_CELL_CLASS, tablet.cellClass(OVERVIEW_SECTION_IDS.cashflow), 'desktop:col-span-4')}
          >
            {expenseStats ? (
              <CashflowTile
                expenseStats={expenseStats}
                month={today.month}
                dayOfMonth={today.dayOfMonth}
                daysInMonth={today.daysInMonth}
                savingsRate={savingsRate}
                coverageRatio={coverageRatio}
                collapse={sections.collapse(OVERVIEW_SECTION_IDS.cashflow)}
                asideWhenClosed={asides[OVERVIEW_SECTION_IDS.cashflow]}
              />
            ) : (
              // `expenseStats: null` is a month with no rows OR a failed read of the expenses: the
              // payload cannot tell them apart (doc/guide/panoramica.md § Per-page blind spots).
              <OverviewTile
                eyebrow="Cashflow"
                collapse={sections.collapse(OVERVIEW_SECTION_IDS.cashflow)}
                asideWhenClosed={asides[OVERVIEW_SECTION_IDS.cashflow]}
              >
                <p className="mt-3 text-[13px] text-muted-foreground">Nessun dato questo mese.</p>
              </OverviewTile>
            )}
          </motion.div>

          <motion.div
            variants={cardItem}
            className={cn(TILE_ROW_CELL_CLASS, tablet.cellClass(OVERVIEW_SECTION_IDS.composizione), 'desktop:col-span-3')}
          >
            <ComposizioneTile
              data={assetClassData}
              footer={allocazioneFooter}
              collapse={sections.collapse(OVERVIEW_SECTION_IDS.composizione)}
              asideWhenClosed={asides[OVERVIEW_SECTION_IDS.composizione]}
            />
          </motion.div>

          {costsVisible && (
            <motion.div
              variants={cardItem}
              className={cn(TILE_ROW_CELL_CLASS, tablet.cellClass(OVERVIEW_SECTION_IDS.costi), hasGoals ? 'desktop:col-span-2' : 'desktop:col-span-4')}
            >
              <CostiTile
                metrics={overview.metrics}
                flags={overview.flags}
                costDrivers={overview.costDrivers ?? []}
                collapse={sections.collapse(OVERVIEW_SECTION_IDS.costi)}
                asideWhenClosed={asides[OVERVIEW_SECTION_IDS.costi]}
              />
            </motion.div>
          )}

          {hasGoals && (
            <motion.div
              variants={cardItem}
              className={cn(TILE_ROW_CELL_CLASS, tablet.cellClass(OVERVIEW_SECTION_IDS.obiettivo), costsVisible ? 'desktop:col-span-2' : 'desktop:col-span-4')}
            >
              <ObiettivoTile
                goals={goals}
                collapse={sections.collapse(OVERVIEW_SECTION_IDS.obiettivo)}
                asideWhenClosed={asides[OVERVIEW_SECTION_IDS.obiettivo]}
              />
            </motion.div>
          )}

          {/* Keeps the second desktop row closed when neither optional tile renders. */}
          {!costsVisible && !hasGoals && (
            <div className="hidden desktop:block desktop:col-span-4" aria-hidden="true" />
          )}

          {expenseStats && (
            <>
              <motion.div
                variants={cardItem}
                className={cn(TILE_ROW_CELL_CLASS, tablet.cellClass(OVERVIEW_SECTION_IDS.spese), 'desktop:col-span-4')}
              >
                <CategoryTile
                  eyebrow="Spese per categoria"
                  total={expenseStats.currentMonth.expenses}
                  categories={expenseStats.topExpenseCategories}
                  reading={expenseReading}
                  scheduledCaption={expensesScheduledCaption}
                  color="var(--chart-1)"
                  emptyCopy="Nessuna spesa registrata questo mese."
                  onSelectCategory={openCategoryInAnalisi}
                  footer={analisiFooter}
                  collapse={sections.collapse(OVERVIEW_SECTION_IDS.spese)}
                  asideWhenClosed={asides[OVERVIEW_SECTION_IDS.spese]}
                />
              </motion.div>
              <motion.div
                variants={cardItem}
                className={cn(TILE_ROW_CELL_CLASS, tablet.cellClass(OVERVIEW_SECTION_IDS.entrate), 'desktop:col-span-4')}
              >
                <CategoryTile
                  eyebrow="Entrate per categoria"
                  total={expenseStats.currentMonth.income}
                  categories={expenseStats.topIncomeCategories}
                  reading={incomeReading}
                  scheduledCaption={incomeScheduledCaption}
                  color="var(--chart-2)"
                  ring={incomeRing}
                  ringCenterLabel="entrate"
                  emptyCopy="Nessuna entrata registrata questo mese."
                  onSelectCategory={openCategoryInAnalisi}
                  footer={analisiFooter}
                  collapse={sections.collapse(OVERVIEW_SECTION_IDS.entrate)}
                  asideWhenClosed={asides[OVERVIEW_SECTION_IDS.entrate]}
                />
              </motion.div>
            </>
          )}

          <motion.div
            variants={cardItem}
            className={cn(
              TILE_ROW_CELL_CLASS,
              tablet.cellClass(OVERVIEW_SECTION_IDS.asset),
              // Three equal tiles on the third row (4 · 4 · 4): at 3 columns the income tile
              // could not hold a label, a 40px bar and two figures without overflowing its row.
              expenseStats ? 'desktop:col-span-4' : 'desktop:col-span-12',
            )}
          >
            <AssetPrincipaliTile
              topAssets={overview.topAssets ?? []}
              assetCount={overview.flags.assetCount}
              collapse={sections.collapse(OVERVIEW_SECTION_IDS.asset)}
              asideWhenClosed={asides[OVERVIEW_SECTION_IDS.asset]}
            />
          </motion.div>

          {/* «Di chi è?» — the net worth by Intestatario, a full row in the tail (owner, 2026-10-17);
              absent when no held asset names a person. */}
          {overview.ownership && (
            <motion.div
              variants={cardItem}
              className={cn(TILE_ROW_CELL_CLASS, tablet.cellClass(OVERVIEW_SECTION_IDS.intestatari), 'desktop:col-span-12')}
            >
              <IntestatariTile
                summary={overview.ownership}
                collapse={sections.collapse(OVERVIEW_SECTION_IDS.intestatari)}
                asideWhenClosed={asides[OVERVIEW_SECTION_IDS.intestatari]}
              />
            </motion.div>
          )}
          </div>
        </motion.div>
        </div>
        </div>
        </div>
        </RowAnswers>

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
      </div>
    </PageContainer>
  );
}
