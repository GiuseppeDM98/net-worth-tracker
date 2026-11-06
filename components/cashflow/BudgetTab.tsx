/**
 * Cashflow › Budget — a verdict over a tile grid (2026-08-23).
 *
 * The tab answers «sto rispettando il budget?» before any number: the rule-generated verdict
 * (lib/utils/budgetNarrative.ts) at the top, and under it a 12-column bento of tiles, each
 * answering ONE question with a reading line over its figures. There is no period axis: a
 * budget is always read on the current month (annual budgets are year-to-date and their tile
 * says so — the Off-Axis Tile Rule).
 *
 *   Below desktop:    ONE sequence, the desktop DOM (DESIGN.md → The First-Screen Rule;
 *                     composed since 2026-10-12): verdict (one sentence, never cut — no
 *                     `leadLength`) → the strip of two, «Fine mese» and «Restano» / «Oltre» /
 *                     «Supererai», the Tetto's KPIs lifted (The Risk-vs-Fact Rule in the strip;
 *                     «Supererai» opens the verdict, which names the day) → [Aggiungi budget ·
 *                     impostazioni] → Tetto del mese, open → «Il resto della pagina» → Categorie a
 *                     rischio, Avvisi, Budget annuali, Per categoria as closed rows → Impostazioni.
 *                     Without a ceiling THE tile is Categorie a rischio, no strip; without a
 *                     budget at all, Per categoria alone with its empty state.
 *   Desktop (12 col): Tetto del mese (5, 2 rows) | Categorie a rischio (4) | Avvisi (3)
 *                                                | Budget annuali (7)
 *                     Per categoria (12)
 *                     Impostazioni (disclosure, below the fold; open while no ceiling is set)
 *
 * TWO RULES THE TILES DIVIDE. The projection is the app's ONE rule (pace on what is booked to
 * date + the rows already in the calendar — Tracciamento's), and a FIXED category never
 * follows the pace. The projected overruns live in «Categorie a rischio»; the crossed
 * thresholds in «Avvisi»: no row appears in two tiles. Every number is born in
 * budgetSummary.ts / budgetUtils.ts, every sentence in budgetNarrative.ts.
 *
 * Budgets are opt-in and persisted through debounced auto-save (useBudgetConfig), paused
 * while the category budgets exceed the ceiling; the status shows in the Per categoria aside and
 * is SPOKEN by one `sr-only` live node beside the tile (since 2026-10-12, so a closed row on a
 * phone keeps it). Alerts also surface in the monthly email (lib/server/monthlyEmailService.ts).
 */
'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Plus, SlidersHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Expense, ExpenseCategory } from '@/types/expenses';
import { BudgetItem } from '@/types/budget';
import { useActiveAccount } from '@/contexts/ActiveAccountContext';
import { useDemoMode } from '@/lib/hooks/useDemoMode';
import { useBudgetConfig, BudgetSaveStatus } from '@/lib/hooks/useBudgetConfig';
import { useBudgetHistory } from '@/lib/hooks/useBudgetHistory';
import { useExpensesInRange } from '@/lib/hooks/useExpenses';
import { BUDGET_HISTORY_MONTHS, budgetWindow } from '@/lib/utils/expenseWindows';
import { evaluateBudgetAlerts, rankCategoriesAtRisk } from '@/lib/utils/budgetUtils';
import {
  BUDGET_REST_ID,
  BUDGET_SECTION_IDS,
  buildCategoryRows,
  buildSpendingHistory,
  selectBudgetStrip,
  trailingMonthKeys,
  summarizeAlerts,
  summarizeAnnualBudgets,
  summarizeCeiling,
  summarizeIncomeTargets,
} from '@/lib/utils/budgetSummary';
import {
  ANNUAL_FOOTER,
  CATEGORY_FOOTER,
  RISK_ASIDE,
  RISK_FOOTER,
  buildBudgetVerdict,
  describeAlerts,
  describeAlertsAside,
  describeAlertsFooter,
  describeAllocation,
  describeAnnualAside,
  describeAnnualBudgets,
  describeBudgetClosedAnswers,
  describeBudgetClosedAsides,
  describeBudgetCounts,
  describeCeiling,
  describeCeilingAside,
  describeHistory,
  describeIncomeTargets,
  describeRisk,
} from '@/lib/utils/budgetNarrative';
import { resolveBudgetCalendar } from '@/lib/utils/budgetUtils';
import { PageVerdict } from '@/components/ui/page-verdict';
import { TILE_CELL_CLASS, TILE_ROW_CELL_CLASS } from '@/components/ui/tile';
import { NarrativeText } from '@/components/ui/narrative-text';
import { TileGridSkeleton } from '@/components/ui/tile-grid-skeleton';
import { ErrorNotice } from '@/components/ui/error-notice';
import { VerdictStrip } from '@/components/ui/verdict-strip';
import { PageRest } from '@/components/ui/page-rest';
import { RowAnswers } from '@/components/ui/row-answers';
import { useMobileSections, type SectionSpec } from '@/lib/hooks/useMobileSections';
import { useTabletComposition, useTabletStage } from '@/lib/hooks/useTabletComposition';
import {
  COMPACT_GRID_CLASS,
  COMPACT_GRID_WRAPPER_CLASS,
  INDEX_CLASS,
  PLAIN_GRID_CLASS,
  leadCellClass,
  REST_CELL_CLASS,
  STAGE_CLASS,
  STAGE_WRAPPER_CLASS,
  VERDICT_CELL_CLASS,
} from '@/lib/utils/tabletComposition';
import { VERDICT_REST_SECTION } from '@/lib/utils/mobileSections';
import { liftedBlocks } from '@/lib/utils/verdictStrip';
import { describeReadFailure, resolveSurfaceState } from '@/lib/utils/statesNarrative';
import { BUDGET_SKELETON_CELLS } from '@/lib/constants/cashflowTabSkeletons';
import { cn } from '@/lib/utils';
import { BudgetItemDialog } from '@/components/cashflow/budget/BudgetItemDialog';
import { BudgetImpostazioni } from '@/components/cashflow/budget/BudgetImpostazioni';
import { isTettoLiftedBlock, TettoTile } from '@/components/cashflow/budget/tiles/TettoTile';
import { RischioTile } from '@/components/cashflow/budget/tiles/RischioTile';
import { AvvisiTile } from '@/components/cashflow/budget/tiles/AvvisiTile';
import { AnnualiTile } from '@/components/cashflow/budget/tiles/AnnualiTile';
import { PerCategoriaTile } from '@/components/cashflow/budget/tiles/PerCategoriaTile';

interface BudgetTabProps {
  categories: ExpenseCategory[];
  /** The page's categories query: the tab waits for it and for its own expenses window. */
  categoriesLoading: boolean;
  /** The categories query failed: say so, never render zeros (the tab adds its own window's failure). */
  categoriesFailed: boolean;
  historyStartYear: number;
  userId: string;
  /** The tab is the one on screen: `PageRest` remounts on activation so its `role="alert"` speaks for it. */
  active: boolean;
}

/** The box «Supererai» puts the focus on: the verdict names the day the calendar crosses the ceiling. */
const BUDGET_VERDICT_ID = 'bud-verdetto';

/** The four rows, in the DOM's order; which ones are rows depends on the account (`resolveBudgetSections`). */
const BUDGET_ROW_SPECS: Record<Exclude<(typeof BUDGET_SECTION_IDS)[keyof typeof BUDGET_SECTION_IDS], 'bud-tetto'>, SectionSpec> = {
  [BUDGET_SECTION_IDS.rischio]: { id: BUDGET_SECTION_IDS.rischio, eyebrow: 'Categorie a rischio' },
  [BUDGET_SECTION_IDS.avvisi]: { id: BUDGET_SECTION_IDS.avvisi, eyebrow: 'Avvisi' },
  [BUDGET_SECTION_IDS.annuali]: { id: BUDGET_SECTION_IDS.annuali, eyebrow: 'Budget annuali' },
  [BUDGET_SECTION_IDS.categorie]: { id: BUDGET_SECTION_IDS.categorie, eyebrow: 'Per categoria' },
};

/**
 * The rows of the phone composition for this account (The Closed-Row Rule): with a ceiling the
 * Tetto is THE tile and the four others are rows; without one Categorie a rischio is THE tile
 * and three are rows; without a budget at all Per categoria alone, with its empty state, and no
 * rows (THE tile never closes: The First-Screen Rule; `BudgetTab`'s header the three states).
 * Budget annuali is a row only while there is an annual budget.
 */
function resolveBudgetSections(state: { hasCeiling: boolean; hasItems: boolean; hasAnnual: boolean }): readonly SectionSpec[] {
  if (!state.hasItems) return [];
  const rows: SectionSpec[] = [];
  if (state.hasCeiling) rows.push(BUDGET_ROW_SPECS[BUDGET_SECTION_IDS.rischio]);
  rows.push(BUDGET_ROW_SPECS[BUDGET_SECTION_IDS.avvisi]);
  if (state.hasAnnual) rows.push(BUDGET_ROW_SPECS[BUDGET_SECTION_IDS.annuali]);
  rows.push(BUDGET_ROW_SPECS[BUDGET_SECTION_IDS.categorie]);
  return rows;
}

const SAVE_STATUS_LABEL: Record<BudgetSaveStatus, string | null> = {
  idle: null,
  saving: 'Salvataggio…',
  saved: 'Salvato',
  invalid: 'Oltre il tetto: non salvato',
  error: 'Errore di salvataggio',
};

/** How long «Salvato» stays in the aside: a confirmation, not a permanent state. */
const SAVED_LABEL_MS = 4000;

const SETTINGS_ID = 'budget-impostazioni';

const EMPTY_EXPENSES: Expense[] = [];

export function BudgetTab({ categories, categoriesLoading, categoriesFailed, historyStartYear, userId, active }: BudgetTabProps) {
  const isDemo = useDemoMode();
  const { ownerId } = useActiveAccount();
  const budget = useBudgetConfig({ userId, categories, disabled: isDemo });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<BudgetItem | null>(null);
  // The control that opened the dialog: the dialog is mounted only while open, so Radix has
  // nothing to return the focus to and it landed on `body` (measured 2026-09-14).
  const openerRef = useRef<HTMLElement | null>(null);

  // «Salvato» is a confirmation and fades after a moment; the next save shows it again. The
  // dismissal is settled during render on the status it belongs to (AGENTS.md § React Compiler and the hooks rules,
  // `react-hooks/set-state-in-effect`), and the timer lives in its own effect.
  const [savedDismissed, setSavedDismissed] = useState(false);
  const [prevSaveStatus, setPrevSaveStatus] = useState<BudgetSaveStatus>(budget.saveStatus);
  if (prevSaveStatus !== budget.saveStatus) {
    setPrevSaveStatus(budget.saveStatus);
    setSavedDismissed(false);
  }
  useEffect(() => {
    if (budget.saveStatus !== 'saved') return;
    const timer = setTimeout(() => setSavedDismissed(true), SAVED_LABEL_MS);
    return () => clearTimeout(timer);
  }, [budget.saveStatus]);

  // Evaluated once per mount — the budget month is the current Italy month.
  const now = useMemo(() => new Date(), []);

  // The tab's own read: the rows of `budgetWindow` — this year whole (the annual budgets count the
  // months ahead too) and the trailing months of the hero's bars, never the account's history. Read
  // here and not by the page because the window follows THIS tab's clock, and the tab mounts late.
  const expensesWindow = useMemo(() => budgetWindow(now), [now]);
  const { data: windowExpenses = EMPTY_EXPENSES, isLoading: expensesLoading, isError: expensesFailed } = useExpensesInRange(ownerId, expensesWindow);
  const loading = categoriesLoading || expensesLoading;
  const loadFailed = categoriesFailed || expensesFailed;
  const calendar = useMemo(() => resolveBudgetCalendar(now), [now]);

  const expenseItems = useMemo(() => budget.items.filter((i) => i.kind === 'expense'), [budget.items]);

  // --- Every number, from the pure layer ---
  const ceiling = useMemo(() => summarizeCeiling(budget.overallMonthlyAmount, windowExpenses, now), [budget.overallMonthlyAmount, windowExpenses, now]);
  const risk = useMemo(() => rankCategoriesAtRisk(expenseItems, windowExpenses, now, categories), [expenseItems, windowExpenses, now, categories]);
  const alerts = useMemo(
    () =>
      summarizeAlerts(
        budget.alertsEnabled
          ? evaluateBudgetAlerts(expenseItems, budget.overallMonthlyAmount, windowExpenses, budget.alertThresholds, now, categories)
          : [],
      ),
    [budget.alertsEnabled, expenseItems, budget.overallMonthlyAmount, windowExpenses, budget.alertThresholds, now, categories],
  );
  const annual = useMemo(() => summarizeAnnualBudgets(budget.items, windowExpenses, now), [budget.items, windowExpenses, now]);
  const income = useMemo(() => summarizeIncomeTargets(budget.items, windowExpenses, now), [budget.items, windowExpenses, now]);
  const rows = useMemo(() => buildCategoryRows(budget.items, categories, windowExpenses, now), [budget.items, categories, windowExpenses, now]);
  // The ceiling each trailing month reads against: its own where the cron recorded it, today's
  // otherwise. The records are the cron's alone (no invalidation to chase).
  const historyKeys = useMemo(() => trailingMonthKeys(now, BUDGET_HISTORY_MONTHS), [now]);
  const { data: historyRecords = [] } = useBudgetHistory(ownerId, historyKeys);
  const history = useMemo(
    () => buildSpendingHistory(windowExpenses, now, ceiling?.ceiling ?? null, BUDGET_HISTORY_MONTHS, historyRecords),
    [windowExpenses, now, ceiling, historyRecords],
  );

  const hasItems = budget.items.length > 0 || ceiling !== null;
  const verdict = useMemo(() => buildBudgetVerdict({ ceiling, risk, hasItems, now }), [ceiling, risk, hasItems, now]);

  // The rows of the phone composition and the verdict's «Il perché» (The Closed-Row Rule, since
  // 2026-10-12): at 1440 every `collapse()` is `undefined` and the tab is the tab of every width.
  // Which tiles are rows follows the account (`resolveBudgetSections`), memoized on the three flags.
  const hasCeiling = ceiling !== null;
  const hasAnnual = annual.rows.length > 0;
  const budgetSections = useMemo(() => resolveBudgetSections({ hasCeiling, hasItems, hasAnnual }), [hasCeiling, hasItems, hasAnnual]);
  const sections = useMobileSections({ route: 'cashflow', tab: 'budget', sections: budgetSections, restId: BUDGET_REST_ID });
  // At 768 the same rows on two columns; on a tablet in landscape the index beside the verdict and
  // THE tile (lib/utils/tabletComposition.ts). The specs ARE the DOM's rows.
  const stageRef = useTabletStage();
  const tablet = useTabletComposition({ sections, order: budgetSections.map((section) => section.id) });

  // --- Handlers ---
  const openCreate = useCallback(() => {
    openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setEditingItem(null);
    setDialogOpen(true);
  }, []);
  const openEdit = (item: BudgetItem) => {
    openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setEditingItem(item);
    setDialogOpen(true);
  };
  const closeDialog = () => {
    setDialogOpen(false);
    const opener = openerRef.current;
    openerRef.current = null;
    // After the dialog has unmounted: a synchronous focus lands in the frame Radix is still tearing down.
    if (opener?.isConnected) requestAnimationFrame(() => opener.focus());
  };

  // The page header owns the desktop «Aggiungi budget»; the tab owns the dialog, so the two
  // talk through a window event — the channel Tracciamento and Dividendi already use.
  useEffect(() => {
    const onAdd = () => openCreate();
    window.addEventListener('cashflow:add-budget', onAdd);
    return () => window.removeEventListener('cashflow:add-budget', onAdd);
  }, [openCreate]);

  const scrollToSettings = () => {
    document.getElementById(SETTINGS_ID)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  if (resolveSurfaceState({ loading: loading || budget.loading, failed: loadFailed }) === 'failed') {
    return (
      <ErrorNotice
        className="max-w-[920px]"
        notice={describeReadFailure({
          consequence: 'I movimenti non sono stati letti: senza di essi non si sa quanto del tetto è stato usato.',
          untouched: 'Budget e movimenti registrati non sono stati toccati.',
        })}
      />
    );
  }

  if (loading || budget.loading) {
    return <TileGridSkeleton cells={BUDGET_SKELETON_CELLS} className="pt-1" />;
  }

  const saveLabel = budget.saveStatus === 'saved' && savedDismissed ? null : SAVE_STATUS_LABEL[budget.saveStatus];
  const saveFailed = budget.saveStatus === 'invalid' || budget.saveStatus === 'error';
  const saveLabelClass = saveFailed ? 'text-destructive' : budget.saveStatus === 'saved' ? 'text-positive' : '';
  const monthlyExpenseCount = rows.expense.length;

  const addButtonLabel = isDemo ? 'Aggiungi budget — non disponibile in modalità demo' : 'Aggiungi budget';

  // ─── The phone composition (2026-10-12) ───────────────────────────────────────────
  // The strip is two KPIs of the Tetto, lifted whole; «Supererai» opens no row but puts the focus
  // on the verdict (it names the day; 2026-10-12), which the controller does not know: its words
  // come from here.
  const strip = selectBudgetStrip(ceiling);
  const tettoLifted = liftedBlocks(strip, BUDGET_SECTION_IDS.tetto).filter(isTettoLiftedBlock);
  const closedAsides = describeBudgetClosedAsides(budget.alertsEnabled);
  // What the closed rows answer in the landscape index, from the figures the tiles already hold.
  const rowAnswers = describeBudgetClosedAnswers({
    risk,
    alertRows: alerts.rows,
    alertsEnabled: budget.alertsEnabled,
    annual,
    validation: budget.validation,
    monthlyExpenseCount,
  });
  const stripEyebrows = { ...sections.eyebrows, [VERDICT_REST_SECTION]: 'il verdetto' };
  const handleStripOpen = (section: string) => {
    if (section === VERDICT_REST_SECTION) {
      document.getElementById(BUDGET_VERDICT_ID)?.focus({ preventScroll: true });
      return;
    }
    sections.reveal(section);
  };
  // Categorie a rischio is a row with a ceiling and THE tile without one; without any budget it says
  // «Nessun budget mensile» under Per categoria's own empty state — hidden below `desktop:` with
  // Avvisi, the desktop unchanged (The First-Screen Rule). ONE element, placed by the grid below: inside the
  // index after «Il resto» with a ceiling, before it (THE tile's place) without one.
  const rischioCell = (
    <div
      data-stage={!hasCeiling && hasItems ? 'lead' : undefined}
      className={cn(
        hasCeiling ? TILE_ROW_CELL_CLASS : TILE_CELL_CLASS,
        hasCeiling ? tablet.cellClass(BUDGET_SECTION_IDS.rischio) : leadCellClass(hasItems),
        'desktop:col-span-4',
        !hasItems && 'max-desktop:hidden',
      )}
    >
      <RischioTile
        risk={risk}
        aside={RISK_ASIDE}
        reading={describeRisk(risk)}
        footer={RISK_FOOTER}
        id={hasCeiling ? undefined : BUDGET_SECTION_IDS.rischio}
        collapse={hasCeiling ? sections.collapse(BUDGET_SECTION_IDS.rischio) : undefined}
        asideWhenClosed={closedAsides[BUDGET_SECTION_IDS.rischio]}
      />
    </div>
  );

  return (
    <div className="space-y-4 max-desktop:portrait:pb-20">
      {/* The stage: the verdict over the grid; on a tablet in landscape the answer on the left
          (verdict and THE tile) and the index on the right (lib/utils/tabletComposition.ts).
          Without a budget there are no rows: the stage stays a plain column and the grid the
          grid of before. */}
      <div className={STAGE_WRAPPER_CLASS}>
      <div ref={stageRef} className={hasItems ? STAGE_CLASS : 'space-y-4'}>
      {/* The verdict's box holds the verdict and, below desktop, the add row under it: in
          landscape the two are the left column's top, never a loose cell of the stage. */}
      <div data-stage="verdict" className={cn('space-y-4', hasItems && VERDICT_CELL_CLASS)}>
      {/* ── Verdict (one sentence, never cut: no `leadLength`); the box takes the focus from «Supererai» ── */}
      <div id={BUDGET_VERDICT_ID} tabIndex={-1} className="pt-1 outline-none">
        <PageVerdict
          verdict={verdict}
          ariaLabel="Verdetto sul budget"
          strip={<VerdictStrip figures={strip} onOpen={handleStripOpen} eyebrows={stripEyebrows} />}
          restCollapse={sections.collapse(BUDGET_REST_ID)}
        />
      </div>

      {/* ── Below desktop: the only add affordance there is on a phone (the bottom-nav FAB
          belongs to Tracciamento), and a shortcut to the settings below the fold ───── */}
      <div className="flex items-center gap-2 desktop:hidden">
        <Button variant="outline" className="h-11 flex-1" onClick={openCreate} disabled={isDemo} aria-label={addButtonLabel}>
          <Plus className="h-4 w-4" />
          Aggiungi budget
        </Button>
        <Button variant="outline" size="icon" className="h-11 w-11 shrink-0" onClick={scrollToSettings} aria-label="Vai alle impostazioni del budget">
          <SlidersHorizontal className="h-4 w-4" />
        </Button>
      </div>
      </div>

      {/* ── Tile grid: ONE sequence, the DOM order is the reading order at every width (decision
          11; the `order-*` the phone used went on 2026-10-12) — THE tile, «Il resto della
          pagina», then the rows (inside the index) — without a budget, no row and the grid of
          before (Per categoria alone) ─────────────────────────────────────────────────── */}
      <RowAnswers value={rowAnswers}>
      <div className={hasItems ? COMPACT_GRID_WRAPPER_CLASS : undefined}>
      <div className={hasItems ? COMPACT_GRID_CLASS : PLAIN_GRID_CLASS}>
        {ceiling ? (
          <div data-stage="lead" className={cn(TILE_CELL_CLASS, leadCellClass(hasItems), 'desktop:col-span-5 desktop:row-span-2')}>
            <TettoTile
              id={BUDGET_SECTION_IDS.tetto}
              summary={ceiling}
              aside={describeCeilingAside(ceiling, now)}
              reading={describeCeiling(ceiling)}
              history={history}
              historyCaption={describeHistory(history)}
              income={income}
              incomeReading={income ? describeIncomeTargets(income) : null}
              liftedFigures={tettoLifted}
            />
          </div>
        ) : (
          // No ceiling: the hero's place stays empty rather than faked, and the settings
          // below the fold are open to fill it.
          <div className="hidden desktop:col-span-5 desktop:row-span-2 desktop:block" aria-hidden="true" />
        )}
        {/* Without a ceiling Categorie a rischio is THE tile, before «Il resto». */}
        {!ceiling && rischioCell}

        {/* The index: «Il resto della pagina» and every row after it — ONE box at the same place
            in every state, so Avvisi, Annuali and Per categoria (its live save status) never
            remount when the ceiling comes or goes. Without a budget it is only `contents`: no
            rest, no row, the grid of before. */}
        <div className={hasItems ? INDEX_CLASS : 'contents'}>
        {hasItems && <PageRest key={active ? 'attiva' : 'inattiva'} sections={sections} className={REST_CELL_CLASS} />}
        {ceiling && rischioCell}

        <div
          className={cn(TILE_ROW_CELL_CLASS, tablet.cellClass(BUDGET_SECTION_IDS.avvisi), 'desktop:col-span-3', !hasItems && 'max-desktop:hidden')}
        >
          <AvvisiTile
            rows={alerts.rows}
            enabled={budget.alertsEnabled}
            aside={describeAlertsAside(budget.alertThresholds, budget.alertsEnabled)}
            reading={describeAlerts(alerts.rows, budget.alertsEnabled, now)}
            footer={describeAlertsFooter(budget.alertsEnabled, alerts.forecastOnlyCount)}
            collapse={sections.collapse(BUDGET_SECTION_IDS.avvisi)}
            asideWhenClosed={closedAsides[BUDGET_SECTION_IDS.avvisi]}
          />
        </div>

        {hasAnnual ? (
          <div className={cn(TILE_ROW_CELL_CLASS, tablet.cellClass(BUDGET_SECTION_IDS.annuali), 'desktop:col-span-7')}>
            <AnnualiTile
              summary={annual}
              aside={describeAnnualAside(annual)}
              reading={describeAnnualBudgets(annual)}
              footer={ANNUAL_FOOTER}
              isDemo={isDemo}
              onEdit={openEdit}
              onDelete={budget.deleteItem}
              collapse={sections.collapse(BUDGET_SECTION_IDS.annuali)}
              asideWhenClosed={closedAsides[BUDGET_SECTION_IDS.annuali]}
            />
          </div>
        ) : (
          <div className="hidden desktop:col-span-7 desktop:block" aria-hidden="true" />
        )}

        {/* The save status is ONE stable live node, a sibling of the tile in its cell (`sr-only`,
            so a closed row keeps it in the DOM); the aside shows the same words, `aria-hidden`,
            where the aside renders — open, or at 1440 (doc/guide/dialog.md: a live node changes
            text and empties, it never appears). */}
        <div
          className={cn(
            hasItems ? TILE_ROW_CELL_CLASS : TILE_CELL_CLASS,
            hasItems ? tablet.cellClass(BUDGET_SECTION_IDS.categorie) : 'tablet:col-span-2',
            'desktop:col-span-12',
          )}
        >
          <PerCategoriaTile
            rows={rows}
            calendarPct={(calendar.dayOfMonth / calendar.daysInMonth) * 100}
            aside={
              <span className="flex items-center gap-1.5">
                <NarrativeText segments={describeBudgetCounts(monthlyExpenseCount, rows.income.length, now)} figureClassName="font-medium" />
                {/* The separator stays outside the live region: a reader hears «Salvato», not «punto mediano Salvato». */}
                {saveLabel && <span aria-hidden="true">·</span>}
                {saveLabel && (
                  <span aria-hidden="true" className={saveLabelClass}>
                    {saveLabel}
                  </span>
                )}
              </span>
            }
            reading={describeAllocation(budget.validation, monthlyExpenseCount)}
            footer={CATEGORY_FOOTER}
            isDemo={isDemo}
            onEdit={openEdit}
            onDelete={budget.deleteItem}
            empty={
              <div className="flex flex-col items-start gap-3">
                <p className="text-[13px] text-muted-foreground">Crea il tuo primo budget per categoria o un obiettivo di entrata.</p>
                <Button className="h-11 desktop:h-9" onClick={openCreate} disabled={isDemo} aria-label={addButtonLabel}>
                  <Plus className="h-4 w-4" />
                  Aggiungi budget
                </Button>
              </div>
            }
            id={hasItems ? undefined : BUDGET_SECTION_IDS.categorie}
            collapse={hasItems ? sections.collapse(BUDGET_SECTION_IDS.categorie) : undefined}
            asideWhenClosed={closedAsides[BUDGET_SECTION_IDS.categorie]}
          />
          <span role="status" aria-live="polite" className="sr-only">
            {saveLabel ?? ''}
          </span>
        </div>
        </div>
      </div>
      </div>
      </RowAnswers>
      </div>
      </div>

      {/* ── Impostazioni, below the fold ─────────────────────────────────────────── */}
      <div id={SETTINGS_ID} className="scroll-mt-4">
        <BudgetImpostazioni
          overallMonthlyAmount={budget.overallMonthlyAmount}
          alertsEnabled={budget.alertsEnabled}
          alertThresholds={budget.alertThresholds}
          validation={budget.validation}
          isDemo={isDemo}
          onOverallChange={budget.setOverall}
          onAlertsEnabledChange={budget.setAlertsEnabled}
          onAlertThresholdsChange={budget.setAlertThresholds}
        />
      </div>

      {dialogOpen && (
        <BudgetItemDialog
          open={dialogOpen}
          onClose={closeDialog}
          categories={categories}
          ownerId={ownerId ?? null}
          now={now}
          historyStartYear={historyStartYear}
          existingItems={budget.items}
          overallMonthlyAmount={budget.overallMonthlyAmount}
          editingItem={editingItem}
          onSubmit={budget.upsertItem}
        />
      )}
    </div>
  );
}
