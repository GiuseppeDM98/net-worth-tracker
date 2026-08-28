/**
 * Analisi — a verdict over a tile grid (2026-08-25 redesign).
 *
 * The page answers «dove vanno i soldi, e cosa è cambiato?» before it shows a number: a
 * rule-generated verdict (lib/utils/analisiNarrative.ts) with the ONE period axis beside it,
 * then a 12-column bento of tiles, each answering one question with a reading line over its
 * figures, then two disclosures below the grid (Confronto annuale, Dettaglio).
 *
 *   Desktop (12 col): Periodo(5, 2 rows) | Fuori scala(3) | Spese maggiori(4)
 *                                        | Spese per categoria(4) | Entrate per categoria(3)
 *                     Scheda(12, only with a focus)
 *                     Flusso(12)
 *   Mobile (1 col):   Periodo → Fuori scala → Spese per categoria → Entrate → Spese maggiori →
 *                     Scheda → Flusso
 *
 * THREE PERIOD MODES: "Anno corrente" (current year, optional month), "Anno" (a past year,
 * optional month), "Storico" (everything at or after the history floor). Every figure but two
 * follows the axis: the anomalies run on ONE month (the picked one, or today's for the bare
 * running year — the Fuori scala tile names it, and is absent when no month can be meant),
 * and the Scheda's per-year table and trend ignore the period on purpose.
 *
 * ENTITY FOCUS = the Scheda tile. Level 'subcategory' (a category) → 'expenseList' (one of its
 * subcategories). Every entry point — a category row, an anomaly, a top expense, a Sankey
 * node, the search, a Confronto row — lands through ONE path (handleEntitySelect), which
 * resolves labels exactly like a URL-restored focus and scrolls to the tile. The focus
 * SURVIVES period changes (the period is a cursor over the entity's timeline, not a cage) and
 * is exited only via the breadcrumb, Indietro or Chiudi.
 *
 * URL: the period (?period&year&month) AND the focused entity (?focusType&focusCat&focusSub —
 * three flat params, no composite strings) round-trip through the querystring, so an entity
 * check is a bookmarkable link. The Sankey's internal type-drill state stays out of the URL.
 *
 * Every number is born in a pure module (analisiSummary, comparisonDeltas, cashflowComposition,
 * expenseEntityStats, tracciamentoSummary), every sentence in analisiNarrative / cashflowNarrative.
 */
'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useChartColors } from '@/lib/hooks/useChartColors';
import { useMediaQuery } from '@/lib/hooks/useMediaQuery';
import { MONTH_NAMES } from '@/lib/constants/months';
import {
  Expense,
  ExpenseCategory,
  ExpenseType,
  EXPENSE_TYPE_LABELS,
  NO_SUBCATEGORY_KEY,
  NO_SUBCATEGORY_LABEL,
} from '@/types/expenses';
import { getItalyDate, getItalyMonth, getItalyMonthYear, getItalyYear, toDate } from '@/lib/utils/dateHelpers';
import {
  buildExpenseComposition,
  buildIncomeComposition,
  buildSubCategoryComposition,
  detectSpendingAnomalies,
  type CategorySlice,
  type CompositionSlice,
  type SpendingAnomaly,
} from '@/lib/utils/cashflowComposition';
import { getCategoryKey, getSubCategoryKey, getSubCategoryLabel, selectExpensesForDrillDown, type CategoryScope } from '@/lib/utils/expenseGrouping';
import { buildCategoryComparison, computeTotalsPacing, resolveComparisonScope } from '@/lib/utils/comparisonDeltas';
import { buildEntityYearRows, computeEntityRunRate, type EntityScope } from '@/lib/utils/expenseEntityStats';
import { type EntitySearchTarget } from '@/lib/utils/entitySearch';
import { summarizePeriodCashflow, summarizeScheduled } from '@/lib/utils/tracciamentoSummary';
import {
  buildMonthlySpending,
  buildYearlySpending,
  rankTopExpenses,
  resolveCategoryMovers,
  resolvePeriodThroughMonth,
  resolveSingleMonth,
  summarizeFlow,
  type AnalisiPeriod,
  type MonthRef,
  type PeriodMode,
  type TopExpenseRow,
} from '@/lib/utils/analisiSummary';
import {
  buildAnalisiVerdict,
  describeAnalisiSubject,
  describeAnomalies,
  describeBaseline,
  describeEntityFocus,
  describeFlow,
  describePeriodScope,
  describeSpendingChart,
  describeSpendingChartFooter,
  describeTopExpenses,
} from '@/lib/utils/analisiNarrative';
import { describeCategoryShare, describePeriodCashflow } from '@/lib/utils/cashflowNarrative';
import type { TileSkeletonCell } from '@/lib/utils/tileGridSkeleton';
import { cn } from '@/lib/utils';
import { PageHeader } from '@/components/layout/PageHeader';
import { PageVerdict } from '@/components/ui/page-verdict';
import { Tile, TILE_CELL_CLASS } from '@/components/ui/tile';
import { TileGridSkeleton } from '@/components/ui/tile-grid-skeleton';
import { EntitySearch } from '@/components/cashflow/EntitySearch';
import { AnalisiPeriodControls } from '@/components/cashflow/analisi/AnalisiPeriodControls';
import { ConfrontoDisclosure } from '@/components/cashflow/analisi/ConfrontoDisclosure';
import { DettaglioDisclosure } from '@/components/cashflow/analisi/DettaglioDisclosure';
import { PeriodoTile } from '@/components/cashflow/analisi/tiles/PeriodoTile';
import { FuoriScalaTile } from '@/components/cashflow/analisi/tiles/FuoriScalaTile';
import { SpeseMaggioriTile } from '@/components/cashflow/analisi/tiles/SpeseMaggioriTile';
import { CategorieTile } from '@/components/cashflow/analisi/tiles/CategorieTile';
import { FlussoTile } from '@/components/cashflow/analisi/tiles/FlussoTile';
import { SchedaTile, type SchedaFocus } from '@/components/cashflow/analisi/tiles/SchedaTile';

type DrillDownLevel = 'category' | 'subcategory' | 'expenseList';
type ChartType = 'expenses' | 'income';

interface DrillDownState {
  level: DrillDownLevel;
  chartType: ChartType | null;
  /**
   * The category document being focused, not its name. Two categories can share a name under
   * different types, and a name-keyed focus showed a mix of both. No colour is stored: the
   * series colour is derived at render from the kind.
   */
  selectedCategory: (CategoryScope & { label: string }) | null;
  /** Subcategory id, or NO_SUBCATEGORY_KEY for the rows carrying none. */
  selectedSubCategory: { key: string; label: string } | null;
}

const NO_FOCUS: DrillDownState = { level: 'category', chartType: null, selectedCategory: null, selectedSubCategory: null };

/** The page's own grid, for the skeleton: Periodo · Fuori scala · Spese maggiori / Spese · Entrate / Flusso. */
const SKELETON_CELLS: TileSkeletonCell[] = [
  { span: 5, rows: 2, lines: 8 },
  { span: 3, lines: 3 },
  { span: 4, lines: 5 },
  { span: 4, lines: 6 },
  { span: 3, lines: 4 },
  { span: 12, lines: 8 },
];

interface AnalisiTabProps {
  allExpenses: Expense[];
  /** Full category taxonomy — resolves labels for a URL-restored focus and feeds the entity search. */
  categories: ExpenseCategory[];
  loading: boolean;
  historyStartYear?: number;
}

// The focusable expense types, used to validate the focusType URL param without trusting
// arbitrary query input. Transfers are deliberately absent: they are net-zero movements
// excluded from every Analisi metric, so a transfer "entity" has no Scheda — a hand-edited
// ?focusType=transfer degrades to no focus.
const EXPENSE_TYPE_SET = new Set<string>(Object.keys(EXPENSE_TYPE_LABELS).filter((type) => type !== 'transfer'));

// Resolves an expense's Italy-calendar bucket for the pure layer.
const monthOf = (expense: Expense): MonthRef => {
  const date = toDate(expense.date);
  return { year: getItalyYear(date), month: getItalyMonth(date) };
};

// The same, with the day — for the caption of a single expense («12 ago»).
const dayOf = (expense: Expense): MonthRef & { day: number } => {
  const date = getItalyDate(toDate(expense.date));
  return { year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate() };
};

interface UrlFocus {
  expenseType: ExpenseType;
  categoryKey: string;
  subCategoryKey: string | null;
}

// Parses the deep-linkable entity focus (?focusType&focusCat&focusSub — three FLAT params, no
// composite string to split: focusCat can be a legacy name-fallback key, and a name may contain
// any delimiter we could pick). Returns null on any missing/malformed piece; EXISTENCE
// validation happens later in resolveFocusLabels, because it needs expenses/categories.
function readFocusFromSearchParams(searchParams: URLSearchParams): UrlFocus | null {
  const typeParam = searchParams.get('focusType');
  const catParam = searchParams.get('focusCat');
  if (!typeParam || !catParam || !EXPENSE_TYPE_SET.has(typeParam)) return null;
  return { expenseType: typeParam as ExpenseType, categoryKey: catParam, subCategoryKey: searchParams.get('focusSub') || null };
}

/**
 * Resolve display labels for a focus, or reject it.
 *
 * Label source order: the composition over the full (floored) history — so a "Casa"/"Casa"
 * collision keeps its type qualifier, exactly as a clicked row would — then the taxonomy (an
 * entity with zero recorded expenses is still a legitimate focus). A category resolving in
 * neither place means a stale or foreign link: the focus is dropped, mirroring
 * readPeriodFromSearchParams' degrade-don't-crash stance. An unresolvable SUBcategory degrades
 * to the parent category focus instead.
 */
function resolveFocusLabels(
  focus: UrlFocus,
  expenses: Expense[],
  categories: ExpenseCategory[],
): { categoryLabel: string; subCategory: { key: string; label: string } | null } | null {
  const composition = focus.expenseType === 'income' ? buildIncomeComposition(expenses) : buildExpenseComposition(expenses);
  const slice = composition.find((candidate) => candidate.categoryKey === focus.categoryKey && candidate.expenseType === focus.expenseType);
  const taxonomyCategory = categories.find((candidate) => candidate.id === focus.categoryKey && candidate.type === focus.expenseType);
  const categoryLabel = slice?.name ?? taxonomyCategory?.name;
  if (!categoryLabel) return null;

  if (!focus.subCategoryKey) return { categoryLabel, subCategory: null };
  if (focus.subCategoryKey === NO_SUBCATEGORY_KEY) return { categoryLabel, subCategory: { key: NO_SUBCATEGORY_KEY, label: NO_SUBCATEGORY_LABEL } };

  const taxonomySub = taxonomyCategory?.subCategories?.find((sub) => sub.id === focus.subCategoryKey);
  const rowWithSub = expenses.find(
    (expense) => expense.type === focus.expenseType && getCategoryKey(expense) === focus.categoryKey && getSubCategoryKey(expense) === focus.subCategoryKey,
  );
  const subLabel = taxonomySub?.name ?? (rowWithSub ? getSubCategoryLabel(rowWithSub) : undefined);
  return { categoryLabel, subCategory: subLabel ? { key: focus.subCategoryKey, label: subLabel } : null };
}

// Parses the "period"/"year"/"month" query params into a valid initial period state. Falls
// back to the "Anno corrente" default whenever a param is missing or malformed — a bad/stale
// link degrades to the default view rather than crashing or showing garbage.
function readPeriodFromSearchParams(searchParams: URLSearchParams, currentYear: number): { periodMode: PeriodMode; selectedYear: number | null; selectedMonth: number | null } {
  const periodParam = searchParams.get('period');
  const periodMode: PeriodMode = periodParam === 'year' || periodParam === 'history' || periodParam === 'ytd' ? periodParam : 'current';

  const monthParam = searchParams.get('month');
  const parsedMonth = monthParam ? parseInt(monthParam, 10) : NaN;
  const selectedMonth = periodMode !== 'history' && parsedMonth >= 1 && parsedMonth <= 12 ? parsedMonth : null;

  if (periodMode === 'current' || periodMode === 'ytd') return { periodMode, selectedYear: currentYear, selectedMonth };
  if (periodMode === 'history') return { periodMode, selectedYear: null, selectedMonth: null };

  const yearParam = searchParams.get('year');
  const parsedYear = yearParam ? parseInt(yearParam, 10) : NaN;
  // Only PAST years are valid in 'year' mode — the UI never offers the current year here
  // (Anno corrente is its dedicated entry point), and accepting it from a crafted URL would run
  // a partial year against a FULL previous year under the fullYear scope.
  const selectedYear = Number.isFinite(parsedYear) && parsedYear < currentYear ? parsedYear : currentYear - 1;
  return { periodMode, selectedYear, selectedMonth };
}

/** «Agosto 2026», «2026», «Storico completo» — the window every period-scoped block names. */
function resolvePeriodLabel(period: AnalisiPeriod): string {
  if (period.year === null) return 'Storico completo';
  if (period.month !== null) return `${MONTH_NAMES[period.month - 1]} ${period.year}`;
  return String(period.year);
}

export function AnalisiTab({ allExpenses, categories, loading, historyStartYear = 2024 }: AnalisiTabProps) {
  const COLORS = useChartColors();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Today in the Italian calendar — the tense, the anomaly month and the running bucket.
  const today = useMemo((): MonthRef => getItalyMonthYear(), []);
  // The same clock as a Date — what splits the period into happened and scheduled.
  const nowDate = useMemo(() => getItalyDate(), []);
  const currentYear = today.year;
  const calendar = useMemo(() => {
    const date = getItalyDate();
    return { dayOfMonth: date.getDate(), daysInMonth: new Date(today.year, today.month, 0).getDate() };
  }, [today]);

  // Three-state period selector — initial value read once from the URL so a shared/refreshed
  // link reopens on the same period. The entity focus is ALSO in the URL (see the sync effect).
  const [periodMode, setPeriodMode] = useState<PeriodMode>(() => readPeriodFromSearchParams(searchParams, currentYear).periodMode);
  const [selectedYear, setSelectedYear] = useState<number | null>(() => readPeriodFromSearchParams(searchParams, currentYear).selectedYear);
  const [selectedMonth, setSelectedMonth] = useState<number | null>(() => readPeriodFromSearchParams(searchParams, currentYear).selectedMonth);
  const [drillDown, setDrillDown] = useState<DrillDownState>(NO_FOCUS);

  const schedaRef = useRef<HTMLDivElement>(null);

  // The ONE scroll on entity focus — owned by the landing path (handleEntitySelect and the URL
  // restore), never by a parallel effect. Deferred one tick so the Scheda cell exists.
  const scrollToScheda = useCallback(() => {
    setTimeout(() => {
      const cell = schedaRef.current;
      if (!cell) return;
      cell.scrollIntoView({ behavior: 'instant', block: 'start' });
      // Keyboard and screen-reader focus follow the visual jump.
      cell.focus({ preventScroll: true });
    }, 50);
  }, []);

  // Keep the URL in sync with the period AND the focus — replace (not push) so filter changes
  // don't spam browser history with back-button stops.
  useEffect(() => {
    const params = new URLSearchParams();
    if (periodMode !== 'current') params.set('period', periodMode);
    if (periodMode === 'year' && selectedYear !== null) params.set('year', String(selectedYear));
    if (selectedMonth !== null) params.set('month', String(selectedMonth));
    if (drillDown.level !== 'category' && drillDown.selectedCategory) {
      params.set('focusType', drillDown.selectedCategory.expenseType);
      params.set('focusCat', drillDown.selectedCategory.key);
      if (drillDown.level === 'expenseList' && drillDown.selectedSubCategory) params.set('focusSub', drillDown.selectedSubCategory.key);
    }
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- router/pathname are stable
  }, [periodMode, selectedYear, selectedMonth, drillDown]);

  // Cold-load focus restore: the URL triple is captured once at mount, then applied as soon as
  // the data needed to validate it has loaded (expenses/taxonomy, both async).
  const initialFocusRef = useRef<UrlFocus | null>(readFocusFromSearchParams(searchParams));
  useEffect(() => {
    const focus = initialFocusRef.current;
    if (!focus || loading) return;
    initialFocusRef.current = null;

    const withinFloor = allExpenses.filter((e) => getItalyYear(toDate(e.date)) >= historyStartYear);
    const resolved = resolveFocusLabels(focus, withinFloor, categories);
    if (!resolved) return;
    setDrillDown({
      level: resolved.subCategory ? 'expenseList' : 'subcategory',
      chartType: focus.expenseType === 'income' ? 'income' : 'expenses',
      selectedCategory: { expenseType: focus.expenseType, key: focus.categoryKey, label: resolved.categoryLabel },
      selectedSubCategory: resolved.subCategory,
    });
    // A deep link should LAND on the Scheda, not leave it below the fold.
    scrollToScheda();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fires once when loading settles
  }, [loading, allExpenses, categories, historyStartYear]);

  const isMobile = useMediaQuery('(max-width: 639px)');

  // ─── Period ──────────────────────────────────────────────────────────────────

  const period = useMemo((): AnalisiPeriod => ({ mode: periodMode, year: selectedYear, month: selectedMonth }), [periodMode, selectedYear, selectedMonth]);
  const periodLabel = resolvePeriodLabel(period);

  // ─── Rows ────────────────────────────────────────────────────────────────────

  const baseExpenses = useMemo(() => allExpenses.filter((e) => getItalyYear(toDate(e.date)) >= historyStartYear), [allExpenses, historyStartYear]);

  const availableYears = useMemo(() => {
    const years = new Set<number>();
    baseExpenses.forEach((e) => years.add(getItalyYear(toDate(e.date))));
    return Array.from(years).sort((a, b) => b - a);
  }, [baseExpenses]);
  const pastYears = useMemo(() => availableYears.filter((y) => y < currentYear), [availableYears, currentYear]);

  // Period changes deliberately do NOT reset the focus: the focused entity is an object of
  // study (its Scheda spans every year regardless of the window), not a filter of the period.
  const handlePeriodModeChange = (mode: PeriodMode) => {
    setPeriodMode(mode);
    if (mode === 'current' || mode === 'ytd') {
      setSelectedYear(currentYear);
      setSelectedMonth(null);
    } else if (mode === 'history') {
      setSelectedYear(null);
      setSelectedMonth(null);
    } else {
      // The most recent PAST year — the current one belongs to «Anno corrente».
      setSelectedYear(availableYears.find((y) => y < currentYear) ?? currentYear - 1);
      setSelectedMonth(null);
    }
  };
  const handleYearChange = (year: number) => {
    setSelectedYear(year);
    setSelectedMonth(null);
  };

  // A year is January → December even while it is running (the Tracciamento rule): recurring
  // series and instalments are materialised as real future-dated rows, and the page shows
  // them rather than hiding them. What has not happened yet is never passed off as done —
  // `scheduled` below carries it, and the verdict closes by naming it.
  const periodExpenses = useMemo(() => {
    if (selectedYear === null) return baseExpenses;
    // «Da inizio anno» stops at the end of today's month; every other window takes its months whole.
    const throughMonth = resolvePeriodThroughMonth({ mode: periodMode, year: selectedYear, month: selectedMonth }, today);
    return baseExpenses.filter((e) => {
      const date = toDate(e.date);
      if (getItalyYear(date) !== selectedYear) return false;
      if (throughMonth !== null && getItalyMonth(date) > throughMonth) return false;
      return selectedMonth === null || getItalyMonth(date) === selectedMonth;
    });
  }, [baseExpenses, periodMode, selectedYear, selectedMonth, today]);

  // The part of the period still ahead. The figures above include it; this is what lets every
  // sentence say so instead of letting a forecast read as a fact.
  const scheduled = useMemo(() => summarizeScheduled(periodExpenses, nowDate), [periodExpenses, nowDate]);

  // ─── Figures (pure modules) ──────────────────────────────────────────────────

  const totals = useMemo(() => summarizePeriodCashflow(periodExpenses), [periodExpenses]);
  const topExpenses = useMemo(() => rankTopExpenses(periodExpenses, dayOf, 5), [periodExpenses]);
  const expenseSlices = useMemo(() => buildExpenseComposition(periodExpenses), [periodExpenses]);
  const incomeSlices = useMemo(() => buildIncomeComposition(periodExpenses), [periodExpenses]);
  const flow = useMemo(() => summarizeFlow(periodExpenses), [periodExpenses]);

  // The month the anomalies run on — an Off-Axis figure the tile names; null when none can be meant.
  const singleMonth = useMemo(() => resolveSingleMonth(period, today), [period, today]);
  const anomalies = useMemo<SpendingAnomaly[]>(
    () => (singleMonth ? detectSpendingAnomalies(allExpenses, singleMonth.year, singleMonth.month, monthOf) : []),
    [allExpenses, singleMonth],
  );

  // YoY pacing against the year before — scope AND caption from the SAME module the Confronto
  // reads, so the same-months rule cannot diverge. Null in Storico, for a month that has not
  // started, or when the previous year predates the tracked history.
  const comparisonYear = selectedYear !== null && selectedYear - 1 >= historyStartYear ? selectedYear - 1 : null;
  const scope = useMemo(() => resolveComparisonScope(periodMode, selectedMonth, today.month), [periodMode, selectedMonth, today.month]);
  const pacing = useMemo(() => {
    if (selectedYear === null || comparisonYear === null || !scope) return null;
    return computeTotalsPacing(allExpenses, selectedYear, comparisonYear, scope, monthOf);
  }, [allExpenses, selectedYear, comparisonYear, scope]);
  const baseline = scope && comparisonYear !== null && pacing ? describeBaseline(scope, comparisonYear) : null;
  const movers = useMemo(() => {
    if (selectedYear === null || comparisonYear === null || !scope || !pacing) return { grown: null, shrunk: null };
    return resolveCategoryMovers(buildCategoryComparison(allExpenses, selectedYear, comparisonYear, scope, monthOf));
  }, [allExpenses, selectedYear, comparisonYear, scope, pacing]);

  // The spending series of the Periodo tile: the year's months beside the previous year's, or
  // the years of the history.
  const chartKind: 'month' | 'year' = selectedYear === null ? 'year' : 'month';
  const spendingPoints = useMemo(() => {
    if (selectedYear === null) return buildYearlySpending(allExpenses, historyStartYear, monthOf, today);
    // The chart draws the period: twelve months for a year, up to today's month for «Da
    // inizio anno». The months still ahead are marked, never dropped.
    const throughMonth = resolvePeriodThroughMonth({ mode: periodMode, year: selectedYear, month: null }, today) ?? 12;
    return buildMonthlySpending(allExpenses, selectedYear, throughMonth, historyStartYear, monthOf, today);
  }, [allExpenses, periodMode, selectedYear, historyStartYear, today]);

  // ─── Words (analisiNarrative / cashflowNarrative) ────────────────────────────

  const verdict = useMemo(
    () =>
      buildAnalisiVerdict({
        period,
        today,
        historyStartYear,
        totals,
        scheduled,
        pacing,
        baseline,
        topCategory: expenseSlices[0]
          ? { label: expenseSlices[0].name, percentage: expenseSlices[0].percentage, categoryKey: expenseSlices[0].categoryKey, expenseType: expenseSlices[0].expenseType }
          : null,
        grown: movers.grown,
        shrunk: movers.shrunk,
        anomalies,
        anomalyMonth: singleMonth,
      }),
    [period, today, historyStartYear, totals, pacing, baseline, expenseSlices, movers, anomalies, singleMonth],
  );

  const periodoReading = describePeriodCashflow(
    totals,
    pacing ? { income: pacing.income.previous > 0 ? pacing.income.deltaPercent : null, expenses: pacing.expenses.previous > 0 ? pacing.expenses.deltaPercent : null } : null,
    baseline ? `su ${baseline}` : null,
  );
  const hasBaselineSeries = spendingPoints.some((point) => point.prevYearValue !== null);

  const toRanking = (slices: CategorySlice[]) => ({
    rows: slices.map((slice) => ({ category: slice.name, categoryKey: slice.key, amount: slice.value, percentage: slice.percentage })),
    total: slices.reduce((sum, slice) => sum + slice.value, 0),
    remainder: null,
  });
  const expenseTotal = expenseSlices.reduce((sum, slice) => sum + slice.value, 0);
  const incomeTotal = incomeSlices.reduce((sum, slice) => sum + slice.value, 0);

  // ─── Focus (the Scheda tile) ─────────────────────────────────────────────────

  // One landing path for every entity entry point: resolve labels exactly like a URL-restored
  // focus, then focus and scroll to the Scheda.
  const handleEntitySelect = useCallback(
    (target: EntitySearchTarget) => {
      const resolved = resolveFocusLabels({ expenseType: target.expenseType, categoryKey: target.categoryKey, subCategoryKey: target.subCategoryKey ?? null }, baseExpenses, categories);
      if (!resolved) return;
      setDrillDown({
        level: resolved.subCategory ? 'expenseList' : 'subcategory',
        chartType: target.expenseType === 'income' ? 'income' : 'expenses',
        selectedCategory: { expenseType: target.expenseType, key: target.categoryKey, label: resolved.categoryLabel },
        selectedSubCategory: resolved.subCategory,
      });
      scrollToScheda();
    },
    [baseExpenses, categories, scrollToScheda],
  );

  const resetFocus = () => setDrillDown(NO_FOCUS);
  const backToCategory = () => setDrillDown((prev) => ({ ...prev, level: 'subcategory', selectedSubCategory: null }));
  const handleBack = () => (drillDown.level === 'expenseList' ? backToCategory() : resetFocus());

  const handleCategorySelect = (slice: CategorySlice) => handleEntitySelect({ expenseType: slice.expenseType, categoryKey: slice.categoryKey });
  const handleAnomalySelect = (anomaly: SpendingAnomaly) => handleEntitySelect({ expenseType: anomaly.expenseType, categoryKey: anomaly.categoryKey });
  const handleTopExpenseSelect = (row: TopExpenseRow) =>
    handleEntitySelect({ expenseType: row.expenseType, categoryKey: row.categoryKey, subCategoryKey: row.subCategoryKey ?? undefined });
  const handleSubcategorySelect = (slice: CompositionSlice) => {
    if (!drillDown.selectedCategory) return;
    handleEntitySelect({ expenseType: drillDown.selectedCategory.expenseType, categoryKey: drillDown.selectedCategory.key, subCategoryKey: slice.key });
  };

  const focus = useMemo((): SchedaFocus | null => {
    if (drillDown.level === 'category' || !drillDown.selectedCategory || !drillDown.chartType) return null;
    return {
      level: drillDown.level,
      kind: drillDown.chartType,
      category: drillDown.selectedCategory,
      subCategory: drillDown.level === 'expenseList' ? drillDown.selectedSubCategory : null,
    };
  }, [drillDown]);

  const focusScope = useMemo<EntityScope | null>(() => {
    if (!focus) return null;
    return { category: { expenseType: focus.category.expenseType, key: focus.category.key }, subCategory: focus.subCategory ? { key: focus.subCategory.key } : undefined };
  }, [focus]);

  const focusPeriod = useMemo(() => ({ year: selectedYear, month: selectedMonth }), [selectedYear, selectedMonth]);

  // The Scheda's reading: the period total and its shares, the newest year's delta, the pace.
  const focusReading = useMemo(() => {
    if (!focus || !focusScope) return null;
    const runRate = computeEntityRunRate(allExpenses, focusScope, focusPeriod, historyStartYear, today, monthOf);
    const yearRows = buildEntityYearRows(allExpenses, focusScope, historyStartYear, today, monthOf);
    // The delta of the year the period is about — the running year's row is partial (same months),
    // a past year's compares with the year before it; a month or the history has no year row to quote.
    const yearRow = period.year !== null && period.month === null ? (yearRows.find((row) => row.year === period.year) ?? null) : null;
    const parentTotal = focus.subCategory
      ? computeEntityRunRate(allExpenses, { category: focusScope.category }, focusPeriod, historyStartYear, today, monthOf).periodTotal
      : null;
    return describeEntityFocus({
      label: focus.subCategory?.label ?? focus.category.label,
      parentLabel: focus.subCategory ? focus.category.label : null,
      isIncome: focus.kind === 'income',
      subject: describeAnalisiSubject(period, today, historyStartYear),
      periodTotal: runRate.periodTotal,
      shareOfPeriod: runRate.shareOfPeriodTotal,
      shareOfParent: parentTotal !== null && parentTotal > 0 ? runRate.periodTotal / parentTotal : null,
      delta:
        yearRow && yearRow.delta !== null
          ? { amount: yearRow.delta, percent: yearRow.deltaPercent, sameMonths: yearRow.isPartial, comparisonYear: yearRow.year - 1 }
          : null,
      monthlyAverage: period.month === null ? runRate.periodMonthlyAverage : null,
      hasHistory: yearRows.some((row) => row.total > 0),
      historyStartYear,
    });
  }, [focus, focusScope, focusPeriod, allExpenses, historyStartYear, today, period]);

  const subcategoryRows = useMemo(
    () => (focus && focus.level === 'subcategory' ? buildSubCategoryComposition(periodExpenses, focus.category) : []),
    [focus, periodExpenses],
  );
  const focusTransactions = useMemo(
    () => (focus && focus.level === 'expenseList' ? selectExpensesForDrillDown(periodExpenses, focus.category, focus.subCategory ?? undefined) : []),
    [focus, periodExpenses],
  );

  // The focused category's row in its tile (`aria-current`), keyed like the composition.
  const activeSliceKey = useMemo(() => {
    if (!focus) return null;
    const slices = focus.kind === 'income' ? incomeSlices : expenseSlices;
    return slices.find((slice) => slice.categoryKey === focus.category.key && slice.expenseType === focus.category.expenseType)?.key ?? null;
  }, [focus, incomeSlices, expenseSlices]);

  // ─── Render ──────────────────────────────────────────────────────────────────

  const header = (
    <PageHeader
      label="Analisi"
      title="Analisi Cashflow"
      description="Dove vanno i soldi, e cosa è cambiato"
      separator={false}
      actions={<EntitySearch categories={categories} expenses={baseExpenses} onSelect={handleEntitySelect} />}
    />
  );

  // Structural skeleton only on the initial load: a refetch with data present shows the data.
  if (loading && allExpenses.length === 0) {
    return (
      <>
        {header}
        <TileGridSkeleton cells={SKELETON_CELLS} className="pt-1" toolbar={<div className="mx-auto h-9 w-[280px] animate-pulse rounded-md bg-muted desktop:hidden" />} />
      </>
    );
  }

  if (allExpenses.length === 0) {
    return (
      <>
        {header}
        <Tile eyebrow="Analisi" className="mt-1">
          <p className="mt-3 text-[13px] text-muted-foreground">Nessun dato disponibile. Aggiungi alcune spese per vedere dove vanno i soldi.</p>
        </Tile>
      </>
    );
  }

  const periodControls = (
    <AnalisiPeriodControls
      periodMode={periodMode}
      selectedYear={selectedYear}
      selectedMonth={selectedMonth}
      pastYears={pastYears}
      onModeChange={handlePeriodModeChange}
      onYearChange={handleYearChange}
      onMonthChange={setSelectedMonth}
    />
  );

  return (
    <>
      {header}
      <div className="space-y-4">
        {/* ── Verdict, with the one period axis beside it on desktop ──────────────── */}
        <div className="flex items-start justify-between gap-6 pt-1">
          <PageVerdict verdict={verdict} ariaLabel="Verdetto del periodo" />
          {/* Bounded, so the picker wraps to two lines instead of squeezing the headline. */}
          <div className="hidden desktop:flex desktop:w-[420px] desktop:shrink-0 desktop:justify-end">{periodControls}</div>
        </div>
        <div className="desktop:hidden">{periodControls}</div>

        {/* ── Tile grid ───────────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 gap-3 tablet:grid-cols-2 desktop:grid-cols-12">
          <div className={cn(TILE_CELL_CLASS, 'order-1 desktop:order-none tablet:col-span-2 desktop:col-span-5 desktop:row-span-2')}>
            <PeriodoTile
              eyebrow={`Periodo · ${periodLabel}`}
              aside={describePeriodScope(period, today, calendar, historyStartYear)}
              reading={periodoReading}
              totals={totals}
              pacing={pacing}
              points={spendingPoints}
              chartKind={chartKind}
              chartLabel={describeSpendingChart(chartKind, selectedYear, hasBaselineSeries, historyStartYear)}
              chartFooter={describeSpendingChartFooter(spendingPoints, chartKind, selectedYear, historyStartYear)}
            />
          </div>

          {/* Fuori scala exists only on a month; without one, Spese maggiori takes its columns. */}
          {singleMonth && (
            <div className={cn(TILE_CELL_CLASS, 'order-2 desktop:order-none desktop:col-span-3')}>
              <FuoriScalaTile
                anomalies={anomalies}
                monthLabel={`${MONTH_NAMES[singleMonth.month - 1].toLowerCase()} ${singleMonth.year}`}
                reading={describeAnomalies(anomalies)}
                followsPeriod={period.month !== null}
                onSelect={handleAnomalySelect}
              />
            </div>
          )}

          <div className={cn(TILE_CELL_CLASS, 'order-5 desktop:order-none', singleMonth ? 'desktop:col-span-4' : 'tablet:col-span-2 desktop:col-span-7')}>
            <SpeseMaggioriTile top={topExpenses} reading={describeTopExpenses(topExpenses)} onSelect={handleTopExpenseSelect} />
          </div>

          <div className={cn(TILE_CELL_CLASS, 'order-3 desktop:order-none desktop:col-span-4')}>
            <CategorieTile
              eyebrow="Spese per categoria"
              kind="expenses"
              slices={expenseSlices}
              total={expenseTotal}
              reading={describeCategoryShare(toRanking(expenseSlices), 'expenses')}
              activeKey={focus?.kind === 'expenses' ? activeSliceKey : null}
              onSelect={handleCategorySelect}
              emptyCopy="Nessuna spesa registrata nel periodo."
            />
          </div>

          <div className={cn(TILE_CELL_CLASS, 'order-4 desktop:order-none desktop:col-span-3')}>
            <CategorieTile
              eyebrow="Entrate per categoria"
              kind="income"
              slices={incomeSlices}
              total={incomeTotal}
              reading={describeCategoryShare(toRanking(incomeSlices), 'income')}
              activeKey={focus?.kind === 'income' ? activeSliceKey : null}
              onSelect={handleCategorySelect}
              emptyCopy="Nessuna entrata registrata nel periodo."
              labelClassName="w-[72px]"
            />
          </div>

          {focus && focusScope && focusReading && (
            <div
              ref={schedaRef}
              tabIndex={-1}
              className={cn(TILE_CELL_CLASS, 'order-6 scroll-mt-20 outline-none desktop:order-none desktop:scroll-mt-4 tablet:col-span-2 desktop:col-span-12')}
            >
              <SchedaTile
                focus={focus}
                scope={focusScope}
                reading={focusReading}
                allExpenses={allExpenses}
                color={focus.kind === 'income' ? COLORS[1] : COLORS[0]}
                period={focusPeriod}
                periodLabel={periodLabel}
                historyStartYear={historyStartYear}
                subcategoryRows={subcategoryRows}
                transactions={focusTransactions}
                onBack={handleBack}
                onClose={resetFocus}
                onCategoryCrumb={backToCategory}
                onSubcategorySelect={handleSubcategorySelect}
              />
            </div>
          )}

          {/* Transfers are not flows: a period holding only transfers has no Sankey to draw. */}
          {(flow.incomeTotal > 0 || flow.expensesTotal > 0) && (
            <div className={cn(TILE_CELL_CLASS, 'order-7 desktop:order-none tablet:col-span-2 desktop:col-span-12')}>
              <FlussoTile expenses={periodExpenses} isMobile={isMobile} reading={describeFlow(flow, totals.savingsRate)} onEntityClick={handleEntitySelect} />
            </div>
          )}
        </div>

        {/* ── Below the grid: the comparison and the reference material, behind disclosures ── */}
        <div className="flex flex-col">
          <ConfrontoDisclosure
            allExpenses={allExpenses}
            period={period}
            today={today}
            historyStartYear={historyStartYear}
            availableDataYears={availableYears}
            onCategoryFocus={handleEntitySelect}
          />
          <DettaglioDisclosure allExpenses={allExpenses} historyStartYear={historyStartYear} scopeYear={selectedYear} showHistory={periodMode === 'history'} />
        </div>
      </div>
    </>
  );
}
