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
 *   Below desktop:    ONE sequence, the DOM above (The First-Screen Rule; since 2026-10-14 —
 *                     the `order-1…7` are gone): title → the axis → the first sentence → Entrate and
 *                     Risparmio as a strip → the calendar's scope → «Il perché» → Periodo, open, its
 *                     trio lifted and its bars at 120px → «Il resto della pagina» → Fuori scala,
 *                     Spese maggiori, Spese, Entrate, [Scheda], Flusso as closed rows
 *                     (`useMobileSections`; doc/guide/cashflow-analisi.md § Composizione mobile).
 *
 * FOUR PERIOD MODES: "Da inizio anno" (January → the end of today's month), "Anno corrente"
 * (the whole current year, optional month), "Anno" (a past year, optional month), "Storico"
 * (from the history floor to the CURRENT year, calendar included — never to the last row a
 * plan wrote). Every figure but two follows the axis: the anomalies run on ONE month (the
 * picked one, or today's for the bare running year — the Fuori scala tile names it, and is
 * absent when no month can be meant, a month not started included), and the Scheda's per-year
 * table and trend ignore the period on purpose. The running month is compared with the SAME
 * DAYS of its baseline month (Tracciamento's rule), so its verdict can carry a tone.
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

import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useChartColors } from '@/lib/hooks/useChartColors';
import { Skeleton } from '@/components/ui/skeleton';
import { useMediaQuery } from '@/lib/hooks/useMediaQuery';
import { COMPACT_QUERY } from '@/lib/hooks/useCompactLayout';
import { useMobileSections, type SectionSpec } from '@/lib/hooks/useMobileSections';
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
import { useElementWidth } from '@/lib/hooks/useElementWidth';
import { sectionPanelId, sectionTriggerId, VERDICT_REST_SECTION } from '@/lib/utils/mobileSections';
import { splitVerdict } from '@/lib/utils/narrative';
import { liftedBlocks } from '@/lib/utils/verdictStrip';
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
import { isScheduledRow, summarizePeriodCashflow, summarizeScheduled } from '@/lib/utils/tracciamentoSummary';
import {
  buildMonthlySpending,
  buildYearlySpending,
  rankTopExpenses,
  resolveCategoryMovers,
  resolvePeriodThroughMonth,
  resolveSingleMonth,
  selectAnalisiStrip,
  summarizeFlow,
  ANALISI_PERIODO_ID,
  ANALISI_SECTION_IDS,
  type AnalisiPeriod,
  type MonthRef,
  type PeriodMode,
  type TopExpenseRow,
} from '@/lib/utils/analisiSummary';
import {
  ANALISI_CLOSED_ASIDES,
  buildAnalisiVerdict,
  collectPrintedFigures,
  describeAnalisiScope,
  describeAnalisiScheduledHorizon,
  describeAnalisiSubject,
  describeAnomalies,
  describeBaseline,
  describeEntityFocus,
  describeFlow,
  describeSpendingRolesFlow,
  describeMissingBaseline,
  describePeriodScope,
  describeSpendingChart,
  describeSpendingChartFooter,
  describeTopExpenses,
  describeAnalisiClosedAnswers,
} from '@/lib/utils/analisiNarrative';
import { RowAnswers } from '@/components/ui/row-answers';
import { describeCategoryShare, describePeriodCashflow } from '@/lib/utils/cashflowNarrative';
import type { TileSkeletonCell } from '@/lib/utils/tileGridSkeleton';
import { cn } from '@/lib/utils';
import { PageHeader } from '@/components/layout/PageHeader';
import type { PageFreshness } from '@/lib/hooks/useFreshness';
import { PageVerdict } from '@/components/ui/page-verdict';
import { Tile, TILE_CELL_CLASS, TILE_ROW_CELL_CLASS } from '@/components/ui/tile';
import { NarrativeText } from '@/components/ui/narrative-text';
import { VerdictStrip } from '@/components/ui/verdict-strip';
import { PageRest } from '@/components/ui/page-rest';
import { TileGridSkeleton } from '@/components/ui/tile-grid-skeleton';
import { ErrorNotice } from '@/components/ui/error-notice';
import { describeReadFailure, resolveSurfaceState } from '@/lib/utils/statesNarrative';
import { EntitySearch } from '@/components/cashflow/EntitySearch';
import { AnalisiPeriodControls } from '@/components/cashflow/analisi/AnalisiPeriodControls';
import { ConfrontoDisclosure } from '@/components/cashflow/analisi/ConfrontoDisclosure';
import { DettaglioDisclosure } from '@/components/cashflow/analisi/DettaglioDisclosure';
import { isPeriodoLiftedBlock, PeriodoTile } from '@/components/cashflow/analisi/tiles/PeriodoTile';
import { FuoriScalaTile } from '@/components/cashflow/analisi/tiles/FuoriScalaTile';
import { SpeseMaggioriTile } from '@/components/cashflow/analisi/tiles/SpeseMaggioriTile';
import { CategorieTile } from '@/components/cashflow/analisi/tiles/CategorieTile';
import { FlussoTile, isFlussoLiftedBlock } from '@/components/cashflow/analisi/tiles/FlussoTile';
import { summarizeSpendingRoles } from '@/lib/utils/spendingRoles';
import { SchedaTile, type SchedaFocus } from '@/components/cashflow/analisi/tiles/SchedaTile';
import { ENTITY_DOSSIER_LAZY_CHARTS } from '@/components/cashflow/EntityDossier';
import { usePreloadWhenIdle } from '@/components/ui/lazy-component';
import { readSavings } from '@/lib/utils/savingsRate';

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

/**
 * Every row of the phone composition, in the DOM's order (The Closed-Row Rule;
 * 2026-10-14): every tile but Periodo, which is THE tile and never closes (The First-Screen Rule).
 * Module-level, as the controller asks; the page hands it the rows PRESENT
 * (`resolveAnalisiSections`) — Fuori scala exists only on a month, the Scheda only with a focus,
 * the Flusso only when something flowed. One read for the page: no row is ever `failed`.
 */
const ANALISI_SECTIONS: readonly SectionSpec[] = [
  { id: ANALISI_SECTION_IDS.fuoriScala, eyebrow: 'Fuori scala' },
  { id: ANALISI_SECTION_IDS.maggiori, eyebrow: 'Spese maggiori' },
  { id: ANALISI_SECTION_IDS.spese, eyebrow: 'Spese per categoria' },
  { id: ANALISI_SECTION_IDS.entrate, eyebrow: 'Entrate per categoria' },
  { id: ANALISI_SECTION_IDS.scheda, eyebrow: 'Scheda' },
  { id: ANALISI_SECTION_IDS.flusso, eyebrow: 'Flusso' },
];

/** The rows the period renders — one `SectionSpec` per tile present, the DOM's order kept. */
function resolveAnalisiSections(present: { fuoriScala: boolean; scheda: boolean; flusso: boolean }): readonly SectionSpec[] {
  return ANALISI_SECTIONS.filter((section) => {
    if (section.id === ANALISI_SECTION_IDS.fuoriScala) return present.fuoriScala;
    if (section.id === ANALISI_SECTION_IDS.scheda) return present.scheda;
    if (section.id === ANALISI_SECTION_IDS.flusso) return present.flusso;
    return true;
  });
}

/** The Flusso's cell from which the Sankey is drawn: a 640px viewport's cell (640 − `main`'s 2 × 16px). */
const FLUSSO_SANKEY_MIN_CELL = 608;

/** «Apri tutte», where the focus goes when the Scheda closes with no opener to return to and no Flusso after it. */
const ANALISI_REST_BUTTON_ID = 'analisi-resto';

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
  /** The queries behind `allExpenses`/`categories` failed: say so, never render zeros. */
  loadFailed: boolean;
  historyStartYear?: number;
  /** settings.spendingRolesEnabled — adds the 50/30/20 view to Flusso, and makes it the default. */
  spendingRolesEnabled?: boolean;
  /** The page's freshness reading for the header the tab owns (`useFreshness`). */
  freshness?: PageFreshness;
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

export function AnalisiTab({ allExpenses, categories, loading, loadFailed, historyStartYear = 2024, spendingRolesEnabled = false, freshness }: AnalisiTabProps) {
  const COLORS = useChartColors();
  // The Scheda's trend plot is lazy: fetched when the page is idle AFTER its data, so a
  // Scheda draws it at once and the preload never competes with the first figures.
  usePreloadWhenIdle(ENTITY_DOSSIER_LAZY_CHARTS, !loading && !loadFailed);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Today in the Italian calendar — the tense, the anomaly month and the running bucket.
  const today = useMemo((): MonthRef => getItalyMonthYear(), []);
  // The same clock as a Date — what splits the period into happened and scheduled. A raw instant,
  // like Tracciamento's: `summarizeScheduled` reads the Italian day off it itself, and handing it
  // an already-zoned Date would shift it twice.
  const nowDate = useMemo(() => new Date(), []);
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
  // The element that opened the Scheda (a row, a node's tile, the search's trigger): where the
  // keyboard focus returns when the Scheda closes. Closing left it on `body` until 2026-09-14.
  const focusTriggerRef = useRef<HTMLElement | null>(null);

  // The ONE landing on entity focus — owned by the landing path (handleEntitySelect and the URL
  // restore), never by a parallel effect. Deferred one tick so the Scheda cell exists. Below
  // `desktop:` the Scheda is a closed row (since 2026-10-14): the controller's `reveal` opens it,
  // scrolls to it and focuses its trigger, called here directly — it captures nothing of a render
  // (it reads the memory from the store and `#analisi-scheda` from the DOM when the timer fires),
  // and the timer is the effect's async callback, never a `setState` in an effect's body. The width
  // is read at that moment too: a restore can run before the first render after hydration knows it.
  const landOnScheda = useCallback((reveal: (id: string) => void) => {
    setTimeout(() => {
      if (document.getElementById(sectionTriggerId(ANALISI_SECTION_IDS.scheda)) || window.matchMedia(COMPACT_QUERY).matches) {
        reveal(ANALISI_SECTION_IDS.scheda);
        return;
      }
      const cell = schedaRef.current;
      if (!cell) return;
      cell.scrollIntoView({ behavior: 'instant', block: 'start' });
      // Keyboard and screen-reader focus follow the visual jump.
      cell.focus({ preventScroll: true });
    }, 50);
  }, []);

  // Closing the Scheda hands the focus back to what opened it (if it is still on the page),
  // so a keyboard reader lands where it left instead of at the top of the document. False when
  // there was nothing to return to (a deep link).
  const restoreFocusToTrigger = useCallback((): boolean => {
    const trigger = focusTriggerRef.current;
    focusTriggerRef.current = null;
    if (!trigger || !trigger.isConnected) return false;
    trigger.focus();
    return true;
  }, []);

  // Keep the URL in sync with the period AND the focus — replace (not push) so filter changes
  // don't spam browser history with back-button stops. router/pathname are read, not triggers:
  // only a period or focus change writes the URL.
  const replaceUrl = useEffectEvent((query: string) => {
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  });
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
    replaceUrl(params.toString());
  }, [periodMode, selectedYear, selectedMonth, drillDown]);

  // The Flusso's drawing: bar and rows where its cell is narrower than 608px — a 640px phone's cell,
  // the legibility threshold of the chart (owner, 2026-09-27) — so in the 360px index of a tablet in
  // landscape too, where a Sankey of 320px does not read. Measured on the cell, not the viewport
  // (owner, 2026-10-16: a tile lays out by its box); the viewport's guess only until the first measure.
  const isPhoneWidth = useMediaQuery('(max-width: 639px)');
  const [flussoCellRef, flussoCellWidth] = useElementWidth();
  const flussoNarrow = flussoCellWidth === null ? isPhoneWidth : flussoCellWidth < FLUSSO_SANKEY_MIN_CELL;

  // ─── Period ──────────────────────────────────────────────────────────────────

  const period = useMemo((): AnalisiPeriod => ({ mode: periodMode, year: selectedYear, month: selectedMonth }), [periodMode, selectedYear, selectedMonth]);
  const periodLabel = resolvePeriodLabel(period);

  // ─── Rows ────────────────────────────────────────────────────────────────────

  const baseExpenses = useMemo(() => allExpenses.filter((e) => getItalyYear(toDate(e.date)) >= historyStartYear), [allExpenses, historyStartYear]);

  // The years the page can be about: from the floor to the CURRENT year. A materialised
  // instalment plan writes rows into 2043, and until 2026-09-14 those years counted («19 anni»)
  // and drew — the calendar ahead belongs to the running year, not to years of their own.
  const availableYears = useMemo(() => {
    const years = new Set<number>();
    baseExpenses.forEach((e) => {
      const year = getItalyYear(toDate(e.date));
      if (year <= currentYear) years.add(year);
    });
    return Array.from(years).sort((a, b) => b - a);
  }, [baseExpenses, currentYear]);
  const pastYears = useMemo(() => availableYears.filter((y) => y < currentYear), [availableYears, currentYear]);

  // A bookmarked `?year=` below the floor names a year the page cannot show (the KPIs are
  // floored, the Select has no such option): settled during render on the loaded floor, it
  // degrades to the newest past year — the same stance as readPeriodFromSearchParams.
  const [settledFloor, setSettledFloor] = useState<number | null>(null);
  if (!loading && settledFloor !== historyStartYear) {
    setSettledFloor(historyStartYear);
    if (periodMode === 'year' && selectedYear !== null && selectedYear < historyStartYear) {
      setSelectedYear(pastYears[0] ?? currentYear - 1);
      setSelectedMonth(null);
    }
  }

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
    // The history closes on the current year, calendar included — not on the last row written.
    if (selectedYear === null) return baseExpenses.filter((e) => getItalyYear(toDate(e.date)) <= today.year);
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
  // A row still ahead ranks with the others (it is in the total) and says so in its caption.
  const topExpenses = useMemo(() => rankTopExpenses(periodExpenses, dayOf, 5, (expense) => isScheduledRow(expense, nowDate)), [periodExpenses, nowDate]);
  const expenseSlices = useMemo(() => buildExpenseComposition(periodExpenses), [periodExpenses]);
  const incomeSlices = useMemo(() => buildIncomeComposition(periodExpenses), [periodExpenses]);
  const flow = useMemo(() => summarizeFlow(periodExpenses), [periodExpenses]);
  // The 50/30/20 view reads the same totals the Sankey draws (summarizeSpendingRoles), off when the setting is.
  const spendingRolesFlow = useMemo(() => {
    if (!spendingRolesEnabled) return null;
    const summary = summarizeSpendingRoles(periodExpenses, categories);
    return { categories, summary, reading: describeSpendingRolesFlow(summary) };
  }, [spendingRolesEnabled, categories, periodExpenses]);

  // The month the anomalies run on — an Off-Axis figure the tile names; null when none can be meant.
  const singleMonth = useMemo(() => resolveSingleMonth(period, today), [period, today]);
  const anomalies = useMemo<SpendingAnomaly[]>(
    () => (singleMonth ? detectSpendingAnomalies(allExpenses, singleMonth.year, singleMonth.month, monthOf) : []),
    [allExpenses, singleMonth],
  );

  // ─── The phone composition (2026-10-14) ───────────────────────────────────────
  // The rows present: Fuori scala on a month, the Scheda with a focus, the Flusso when something
  // flowed. Here, before every handler that lands on the Scheda: `sections.reveal` closes over
  // nothing of a tap (lib/hooks/useMobileSections.ts), so it is a stable dependency of theirs.
  const hasFlow = flow.incomeTotal > 0 || flow.expensesTotal > 0;
  const hasScheda = drillDown.level !== 'category' && drillDown.selectedCategory !== null && drillDown.chartType !== null;
  const sectionSpecs = useMemo(
    () => resolveAnalisiSections({ fuoriScala: singleMonth !== null, scheda: hasScheda, flusso: hasFlow }),
    [singleMonth, hasScheda, hasFlow],
  );
  const sections = useMobileSections({ route: 'analisi', sections: sectionSpecs });
  const stageRef = useTabletStage();
  const tablet = useTabletComposition({ sections, order: sectionSpecs.map((section) => section.id) });

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
    // A deep link should LAND on the Scheda, not leave it below the fold — on a phone, open.
    landOnScheda(sections.reveal);
    // Fires once when loading settles: the ref is cleared on the first pass; landOnScheda and the
    // controller's reveal are stable.
  }, [loading, allExpenses, categories, historyStartYear, landOnScheda, sections.reveal]);

  // YoY pacing against the year before — scope AND caption from the SAME module the Confronto
  // reads, so the two cannot diverge on which window they measure. Each period compares on its
  // OWN span: «Da inizio anno» on the months lived, «Anno corrente» and a closed year on twelve.
  // Null in Storico, for a month that has not started, or when the previous year predates the
  // tracked history.
  const comparisonYear = selectedYear !== null && selectedYear - 1 >= historyStartYear ? selectedYear - 1 : null;
  // The running month is cut at today's DAY on both sides (Tracciamento's «stessi giorni»), so
  // the rows go in with their day: `dayOf` is `monthOf` plus the day the cut reads.
  const scope = useMemo(() => resolveComparisonScope(periodMode, selectedMonth, today.month, calendar.dayOfMonth), [periodMode, selectedMonth, today.month, calendar.dayOfMonth]);
  const pacing = useMemo(() => {
    if (selectedYear === null || comparisonYear === null || !scope) return null;
    return computeTotalsPacing(allExpenses, selectedYear, comparisonYear, scope, dayOf);
  }, [allExpenses, selectedYear, comparisonYear, scope]);
  const baseline = scope && comparisonYear !== null && pacing ? describeBaseline(scope, comparisonYear) : null;
  // A baseline window inside the history with no row at all: the Periodo says so, never nothing.
  const missingBaseline = scope && comparisonYear !== null && !pacing ? describeMissingBaseline(scope, comparisonYear) : null;
  const movers = useMemo(() => {
    if (selectedYear === null || comparisonYear === null || !scope || !pacing) return { grown: null, shrunk: null };
    return resolveCategoryMovers(buildCategoryComparison(allExpenses, selectedYear, comparisonYear, scope, dayOf));
  }, [allExpenses, selectedYear, comparisonYear, scope, pacing]);
  // «Anno corrente» compares twelve months against twelve while some of them are still only in
  // the calendar (the owner's Same-Basis call, 2026-08-30): the delta's caption says how many,
  // right where the red is printed — a −32% on income with three salaries still to come.
  const monthsAhead = periodMode === 'current' && selectedMonth === null && selectedYear === today.year ? 12 - today.month : 0;
  const comparisonPhrase = baseline ? (monthsAhead > 0 ? `su ${baseline} (${monthsAhead} ${monthsAhead === 1 ? 'mese' : 'mesi'} ancora in calendario)` : `su ${baseline}`) : null;

  // The spending series of the Periodo tile: the year's months beside the previous year's, or
  // the years of the history.
  const chartKind: 'month' | 'year' = selectedYear === null ? 'year' : 'month';
  // Floored rows only: a `?year=` below the floor must not draw bars the KPIs refuse.
  const spendingPoints = useMemo(() => {
    if (selectedYear === null) return buildYearlySpending(baseExpenses, historyStartYear, monthOf, today);
    // The chart draws the period: twelve months for a year, up to today's month for «Da
    // inizio anno». The months still ahead are marked, never dropped.
    const throughMonth = resolvePeriodThroughMonth({ mode: periodMode, year: selectedYear, month: null }, today) ?? 12;
    return buildMonthlySpending(baseExpenses, selectedYear, throughMonth, historyStartYear, monthOf, today);
  }, [baseExpenses, periodMode, selectedYear, historyStartYear, today]);

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
    [period, today, historyStartYear, totals, scheduled, pacing, baseline, expenseSlices, movers, anomalies, singleMonth],
  );

  const periodoReading = describePeriodCashflow(
    totals,
    pacing ? { income: pacing.income.previous > 0 ? pacing.income.deltaPercent : null, expenses: pacing.expenses.previous > 0 ? pacing.expenses.deltaPercent : null } : null,
    comparisonPhrase,
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
      // Remember the opener only when it is a real control on the page (the search's modal has
      // its own trigger, and a click on the Sankey lands on the svg — neither is a stop to return to).
      const active = document.activeElement;
      focusTriggerRef.current = active instanceof HTMLElement && active !== document.body && !active.closest('[role="dialog"]') && !active.closest('svg') ? active : focusTriggerRef.current;
      setDrillDown({
        level: resolved.subCategory ? 'expenseList' : 'subcategory',
        chartType: target.expenseType === 'income' ? 'income' : 'expenses',
        selectedCategory: { expenseType: target.expenseType, key: target.categoryKey, label: resolved.categoryLabel },
        selectedSubCategory: resolved.subCategory,
      });
      landOnScheda(sections.reveal);
    },
    [baseExpenses, categories, landOnScheda, sections.reveal],
  );

  // «Chiudi»: the focus returns to the opener; on a phone, with no opener (a deep link), to the row
  // after the Scheda in the DOM — the Flusso's trigger — or to «Apri tutte» without a Flusso.
  const resetFocus = () => {
    setDrillDown(NO_FOCUS);
    if (restoreFocusToTrigger() || !sections.compact) return;
    (document.getElementById(sectionTriggerId(ANALISI_SECTION_IDS.flusso)) ?? document.getElementById(ANALISI_REST_BUTTON_ID))?.focus();
  };
  const backToCategory = () => setDrillDown((prev) => ({ ...prev, level: 'subcategory', selectedSubCategory: null }));
  const handleBack = () => (drillDown.level === 'expenseList' ? backToCategory() : resetFocus());
  // Escape inside the Scheda closes it, like a modal — the tile is the page's one lifted surface.
  // As a row it does so only inside the open panel: on the trigger Escape does nothing.
  const handleSchedaKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Escape' || event.defaultPrevented) return;
    if (sections.compact && !(event.target instanceof Element && event.target.closest(`#${sectionPanelId(ANALISI_SECTION_IDS.scheda)}`))) return;
    event.preventDefault();
    resetFocus();
  };

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

  // The Scheda's period is the page's, cut where the page cuts it: «Da inizio anno» stops at
  // today's month here too, or the reading said «finora» over a twelve-month total.
  const focusPeriod = useMemo(
    () => ({ year: selectedYear, month: selectedMonth, throughMonth: resolvePeriodThroughMonth(period, today) }),
    [selectedYear, selectedMonth, period, today],
  );

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
          ? {
              amount: yearRow.delta,
              percent: yearRow.deltaPercent,
              sameMonths: yearRow.isPartial,
              comparisonYear: yearRow.year - 1,
              // The partial row's own window (its total is the same-months total), so the
              // sentence can name it when the period total spans the whole calendar year.
              ...(yearRow.isPartial ? { livedTotal: yearRow.total, livedMonths: today.month } : {}),
            }
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
      freshness={freshness}
      actions={<EntitySearch categories={categories} expenses={baseExpenses} onSelect={handleEntitySelect} />}
    />
  );

  // Structural skeleton only on the initial load: a refetch with data present shows the data.
  // A failed read comes before every reading: `allExpenses` is `[]` on failure too, and a
  // Sankey of an unread ledger is a picture of nothing presented as a picture of something.
  if (resolveSurfaceState({ loading: loading, failed: loadFailed }) === 'failed') {
    return (
      <>
        {header}
        <ErrorNotice
          className="max-w-[920px]"
          notice={describeReadFailure({
            consequence: 'I movimenti non sono stati letti: senza di essi non c’è nulla da confrontare né da scomporre.',
            untouched: 'I movimenti registrati non sono stati toccati.',
          })}
        />
      </>
    );
  }

  if (loading && allExpenses.length === 0) {
    return (
      <>
        {header}
        <TileGridSkeleton cells={SKELETON_CELLS} className="pt-1" toolbar={<Skeleton className="mx-auto h-9 w-[280px] rounded-md desktop:hidden" />} />
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

  // The strip: the period's income and what was left, the trio's own figures (The Binding-Clause Rule
  // keeps the calendar in the `scope` under them, at every width). The Periodo hides the trio, the
  // Flusso its «Risparmio» block, and in a cell narrower than 608px (`FLUSSO_SANKEY_MIN_CELL`, since
  // 2026-10-16) a caption of the bar drops an amount the first screen already prints (2026-10-14).
  const strip = selectAnalisiStrip(totals, { notStarted: describeAnalisiSubject(period, today, historyStartYear).future });
  const scheduledScope = describeAnalisiScope({ scheduled, period, today });
  const periodoLifted = liftedBlocks(strip, ANALISI_PERIODO_ID).filter(isPeriodoLiftedBlock);
  const flussoLifted = liftedBlocks(strip, ANALISI_SECTION_IDS.flusso).filter(isFlussoLiftedBlock);
  const printedFigures = sections.compact ? collectPrintedFigures(splitVerdict(verdict).lead, strip) : undefined;
  // What the closed rows answer in the landscape index, from the figures the tiles already hold.
  const rowAnswers = describeAnalisiClosedAnswers({
    anomalies,
    topExpenses,
    expenseRanking: toRanking(expenseSlices),
    incomeRanking: toRanking(incomeSlices),
    flow,
    spendingRoles: spendingRolesFlow?.summary ?? null,
  });

  return (
    <>
      {header}
      <div className="space-y-4">
        {/* ── Verdict, with the one period axis: in the verdict's `axis` slot below `desktop:`, beside
            it from `desktop:` (two instances of one control, DESIGN.md → Page Verdict) ──────────────── */}
        {/* The stage: the verdict over the grid; on a tablet in landscape the answer on the left
            (verdict and THE tile) and the index on the right (lib/utils/tabletComposition.ts). */}
        <div className={STAGE_WRAPPER_CLASS}>
        <div ref={stageRef} className={STAGE_CLASS}>
        <div data-stage="verdict" className={cn('flex items-start justify-between gap-6 pt-1', VERDICT_CELL_CLASS)}>
          <div className="min-w-0 flex-1">
            <PageVerdict
              verdict={verdict}
              ariaLabel="Verdetto del periodo"
              axis={periodControls}
              strip={<VerdictStrip figures={strip} onOpen={sections.reveal} eyebrows={sections.eyebrows} />}
              scope={scheduledScope ? <NarrativeText segments={scheduledScope} className="text-[13px] leading-[1.45] text-muted-foreground" figureClassName="font-medium" /> : undefined}
              restCollapse={sections.collapse(VERDICT_REST_SECTION)}
            />
          </div>
          {/* Bounded, so the picker wraps to two lines instead of squeezing the headline. */}
          <div className="hidden desktop:flex desktop:w-[420px] desktop:shrink-0 desktop:justify-end">{periodControls}</div>
        </div>

        {/* ── Tile grid ───────────────────────────────────────────────────────────── */}
        <div className={COMPACT_GRID_WRAPPER_CLASS}>
        <div className={COMPACT_GRID_CLASS}>
          <div data-stage="lead" className={cn(TILE_CELL_CLASS, LEAD_CELL_CLASS, 'desktop:col-span-5 desktop:row-span-2')}>
            <PeriodoTile
              id={ANALISI_PERIODO_ID}
              liftedFigures={periodoLifted}
              eyebrow={`Periodo · ${periodLabel}`}
              aside={describePeriodScope(period, today, calendar, historyStartYear)}
              reading={periodoReading}
              totals={totals}
              pacing={pacing}
              missingBaseline={missingBaseline}
              points={spendingPoints}
              chartKind={chartKind}
              chartLabel={describeSpendingChart(chartKind, selectedYear, hasBaselineSeries, historyStartYear)}
              chartFooter={describeSpendingChartFooter(spendingPoints, chartKind, selectedYear, historyStartYear)}
            />
          </div>

          <RowAnswers value={rowAnswers}>
          <div className={INDEX_CLASS}>
          <PageRest sections={sections} buttonId={ANALISI_REST_BUTTON_ID} className={REST_CELL_CLASS} />

          {/* Fuori scala exists only on a month; without one, Spese maggiori takes its columns. */}
          {singleMonth && (
            <div className={cn(TILE_ROW_CELL_CLASS, tablet.cellClass(ANALISI_SECTION_IDS.fuoriScala), 'desktop:col-span-3')}>
              <FuoriScalaTile
                collapse={sections.collapse(ANALISI_SECTION_IDS.fuoriScala)}
                asideWhenClosed={`${MONTH_NAMES[singleMonth.month - 1].toLowerCase()} ${singleMonth.year}`}
                anomalies={anomalies}
                monthLabel={`${MONTH_NAMES[singleMonth.month - 1].toLowerCase()} ${singleMonth.year}`}
                reading={describeAnomalies(anomalies)}
                followsPeriod={period.month !== null}
                onSelect={handleAnomalySelect}
              />
            </div>
          )}

          <div
            className={cn(TILE_ROW_CELL_CLASS, tablet.cellClass(ANALISI_SECTION_IDS.maggiori), singleMonth ? 'desktop:col-span-4' : 'desktop:col-span-7')}
           
          >
            <SpeseMaggioriTile
              top={topExpenses}
              reading={describeTopExpenses(topExpenses)}
              onSelect={handleTopExpenseSelect}
              collapse={sections.collapse(ANALISI_SECTION_IDS.maggiori)}
              asideWhenClosed={ANALISI_CLOSED_ASIDES.maggiori}
            />
          </div>

          <div className={cn(TILE_ROW_CELL_CLASS, tablet.cellClass(ANALISI_SECTION_IDS.spese), 'desktop:col-span-4')}>
            <CategorieTile
              collapse={sections.collapse(ANALISI_SECTION_IDS.spese)}
              asideWhenClosed={ANALISI_CLOSED_ASIDES.spese}
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

          <div className={cn(TILE_ROW_CELL_CLASS, tablet.cellClass(ANALISI_SECTION_IDS.entrate), 'desktop:col-span-3')}>
            <CategorieTile
              collapse={sections.collapse(ANALISI_SECTION_IDS.entrate)}
              asideWhenClosed={ANALISI_CLOSED_ASIDES.entrate}
              eyebrow="Entrate per categoria"
              kind="income"
              slices={incomeSlices}
              total={incomeTotal}
              reading={describeCategoryShare(toRanking(incomeSlices), 'income')}
              activeKey={focus?.kind === 'income' ? activeSliceKey : null}
              onSelect={handleCategorySelect}
              emptyCopy="Nessuna entrata registrata nel periodo."
              labelClassName="min-w-[72px]"
            />
          </div>

          {focus && focusScope && focusReading && (
            <div
              ref={schedaRef}
              tabIndex={-1}
              onKeyDown={handleSchedaKeyDown}
              className={cn(TILE_ROW_CELL_CLASS, tablet.cellClass(ANALISI_SECTION_IDS.scheda), 'scroll-mt-20 outline-none desktop:scroll-mt-4 desktop:col-span-12')}
             
            >
              <SchedaTile
                collapse={sections.collapse(ANALISI_SECTION_IDS.scheda)}
                asideWhenClosed={focus.subCategory?.label ?? focus.category.label}
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
          {hasFlow && (
            <div ref={flussoCellRef} className={cn(TILE_ROW_CELL_CLASS, tablet.cellClass(ANALISI_SECTION_IDS.flusso), 'desktop:col-span-12')}>
              <FlussoTile
                collapse={sections.collapse(ANALISI_SECTION_IDS.flusso)}
                liftedFigures={flussoLifted}
                printedFigures={printedFigures}
                expenses={periodExpenses}
                isMobile={flussoNarrow}
                reading={describeFlow(flow, readSavings(totals.income, totals.expenses))}
                flow={flow}
                spendingRoles={spendingRolesFlow}
                // The verdict's own calendar slice: on a phone the surplus note declares it too.
                scheduled={scheduled}
                scheduledHorizon={describeAnalisiScheduledHorizon(period, today)}
                onEntityClick={handleEntitySelect}
              />
            </div>
          )}
          </div>
          </RowAnswers>
        </div>
        </div>
        </div>
        </div>

        {/* ── Below the grid: the comparison and the reference material, behind disclosures ── */}
        <div className="flex flex-col">
          <ConfrontoDisclosure
            allExpenses={allExpenses}
            period={period}
            today={today}
            todayDay={calendar.dayOfMonth}
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
