/**
 * Cashflow › Budget — a verdict over a tile grid (2026-08-23).
 *
 * The tab answers «sto rispettando il budget?» before any number: the rule-generated verdict
 * (lib/utils/budgetNarrative.ts) at the top, and under it a 12-column bento of tiles, each
 * answering ONE question with a reading line over its figures. There is no period axis: a
 * budget is always read on the current month (annual budgets are year-to-date and their tile
 * says so — the Off-Axis Tile Rule).
 *
 *   Mobile (1 col):   Verdict → [Aggiungi budget · impostazioni] → Tetto del mese →
 *                     Categorie a rischio → Avvisi → Budget annuali → Per categoria → Impostazioni
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
 * while the category budgets exceed the ceiling; the status is the Per categoria aside.
 * Alerts also surface in the monthly email (lib/server/monthlyEmailService.ts).
 */
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, SlidersHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Expense, ExpenseCategory } from '@/types/expenses';
import { BudgetItem } from '@/types/budget';
import { useActiveAccount } from '@/contexts/ActiveAccountContext';
import { useDemoMode } from '@/lib/hooks/useDemoMode';
import { useBudgetConfig, BudgetSaveStatus } from '@/lib/hooks/useBudgetConfig';
import { useBudgetHistory } from '@/lib/hooks/useBudgetHistory';
import { evaluateBudgetAlerts, rankCategoriesAtRisk } from '@/lib/utils/budgetUtils';
import {
  buildCategoryRows,
  buildSpendingHistory,
  trailingMonthKeys,
  summarizeAlerts,
  summarizeAnnualBudgets,
  summarizeCeiling,
  summarizeIncomeTargets,
} from '@/lib/utils/budgetSummary';
import {
  ANNUAL_FOOTER,
  CATEGORY_FOOTER,
  RISK_FOOTER,
  buildBudgetVerdict,
  describeAlerts,
  describeAlertsAside,
  describeAlertsFooter,
  describeAllocation,
  describeAnnualAside,
  describeAnnualBudgets,
  describeBudgetCounts,
  describeCeiling,
  describeCeilingAside,
  describeHistory,
  describeIncomeTargets,
  describeRisk,
} from '@/lib/utils/budgetNarrative';
import { resolveBudgetCalendar } from '@/lib/utils/budgetUtils';
import { PageVerdict } from '@/components/ui/page-verdict';
import { TILE_CELL_CLASS } from '@/components/ui/tile';
import { NarrativeText } from '@/components/ui/narrative-text';
import { TileGridSkeleton } from '@/components/ui/tile-grid-skeleton';
import { ErrorNotice } from '@/components/ui/error-notice';
import { describeReadFailure, resolveSurfaceState } from '@/lib/utils/statesNarrative';
import type { TileSkeletonCell } from '@/lib/utils/tileGridSkeleton';
import { cn } from '@/lib/utils';
import { BudgetItemDialog } from '@/components/cashflow/budget/BudgetItemDialog';
import { BudgetImpostazioni } from '@/components/cashflow/budget/BudgetImpostazioni';
import { TettoTile } from '@/components/cashflow/budget/tiles/TettoTile';
import { RischioTile } from '@/components/cashflow/budget/tiles/RischioTile';
import { AvvisiTile } from '@/components/cashflow/budget/tiles/AvvisiTile';
import { AnnualiTile } from '@/components/cashflow/budget/tiles/AnnualiTile';
import { PerCategoriaTile } from '@/components/cashflow/budget/tiles/PerCategoriaTile';

interface BudgetTabProps {
  allExpenses: Expense[];
  categories: ExpenseCategory[];
  loading: boolean;
  /** The queries behind `allExpenses`/`categories` failed: say so, never render zeros. */
  loadFailed: boolean;
  historyStartYear: number;
  userId: string;
}

const SAVE_STATUS_LABEL: Record<BudgetSaveStatus, string | null> = {
  idle: null,
  saving: 'Salvataggio…',
  saved: 'Salvato',
  invalid: 'Oltre il tetto: non salvato',
  error: 'Errore di salvataggio',
};

/** Months of the hero's bars. */
const HISTORY_MONTHS = 6;

/** The page's own grid, so the loading state has the proportions of what replaces it. */
const SKELETON_CELLS: TileSkeletonCell[] = [
  { span: 5, rows: 2, lines: 8 },
  { span: 4, lines: 4 },
  { span: 3, lines: 4 },
  { span: 7, lines: 4 },
  { span: 12, lines: 6 },
];

const SETTINGS_ID = 'budget-impostazioni';

export function BudgetTab({ allExpenses, categories, loading, loadFailed, historyStartYear, userId }: BudgetTabProps) {
  const isDemo = useDemoMode();
  const { ownerId } = useActiveAccount();
  const budget = useBudgetConfig({ userId, categories, disabled: isDemo });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<BudgetItem | null>(null);

  // Evaluated once per mount — the budget month is the current Italy month.
  const now = useMemo(() => new Date(), []);
  const calendar = useMemo(() => resolveBudgetCalendar(now), [now]);

  const expenseItems = useMemo(() => budget.items.filter((i) => i.kind === 'expense'), [budget.items]);

  // --- Every number, from the pure layer ---
  const ceiling = useMemo(() => summarizeCeiling(budget.overallMonthlyAmount, allExpenses, now), [budget.overallMonthlyAmount, allExpenses, now]);
  const risk = useMemo(() => rankCategoriesAtRisk(expenseItems, allExpenses, now, categories), [expenseItems, allExpenses, now, categories]);
  const alerts = useMemo(
    () =>
      summarizeAlerts(
        budget.alertsEnabled
          ? evaluateBudgetAlerts(expenseItems, budget.overallMonthlyAmount, allExpenses, budget.alertThresholds, now, categories)
          : [],
      ),
    [budget.alertsEnabled, expenseItems, budget.overallMonthlyAmount, allExpenses, budget.alertThresholds, now, categories],
  );
  const annual = useMemo(() => summarizeAnnualBudgets(budget.items, allExpenses, now), [budget.items, allExpenses, now]);
  const income = useMemo(() => summarizeIncomeTargets(budget.items, allExpenses, now), [budget.items, allExpenses, now]);
  const rows = useMemo(() => buildCategoryRows(budget.items, categories, allExpenses, now), [budget.items, categories, allExpenses, now]);
  // The ceiling each trailing month reads against: its own where the cron recorded it, today's
  // otherwise. The records are the cron's alone (no invalidation to chase).
  const historyKeys = useMemo(() => trailingMonthKeys(now, HISTORY_MONTHS), [now]);
  const { data: historyRecords = [] } = useBudgetHistory(ownerId, historyKeys);
  const history = useMemo(
    () => buildSpendingHistory(allExpenses, now, ceiling?.ceiling ?? null, HISTORY_MONTHS, historyRecords),
    [allExpenses, now, ceiling, historyRecords],
  );

  const hasItems = budget.items.length > 0 || ceiling !== null;
  const verdict = useMemo(() => buildBudgetVerdict({ ceiling, risk, hasItems, now }), [ceiling, risk, hasItems, now]);

  // --- Handlers ---
  const openCreate = useCallback(() => {
    setEditingItem(null);
    setDialogOpen(true);
  }, []);
  const openEdit = (item: BudgetItem) => {
    setEditingItem(item);
    setDialogOpen(true);
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
    return <TileGridSkeleton cells={SKELETON_CELLS} className="pt-1" />;
  }

  const saveLabel = SAVE_STATUS_LABEL[budget.saveStatus];
  const saveFailed = budget.saveStatus === 'invalid' || budget.saveStatus === 'error';
  const monthlyExpenseCount = rows.expense.length;

  const addButtonLabel = isDemo ? 'Aggiungi budget — non disponibile in modalità demo' : 'Aggiungi budget';

  return (
    <div className="space-y-4 max-desktop:portrait:pb-20">
      {/* ── Verdict ─────────────────────────────────────────────────────────────── */}
      <div className="pt-1">
        <PageVerdict verdict={verdict} ariaLabel="Verdetto sul budget" />
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

      {/* ── Tile grid ───────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-3 tablet:grid-cols-2 desktop:grid-cols-12">
        {ceiling ? (
          <div className={cn(TILE_CELL_CLASS, 'order-1 tablet:col-span-2 desktop:order-none desktop:col-span-5 desktop:row-span-2')}>
            <TettoTile
              summary={ceiling}
              aside={describeCeilingAside(ceiling, now)}
              reading={describeCeiling(ceiling)}
              history={history}
              historyCaption={describeHistory(history)}
              income={income}
              incomeReading={income ? describeIncomeTargets(income) : null}
            />
          </div>
        ) : (
          // No ceiling: the hero's place stays empty rather than faked, and the settings
          // below the fold are open to fill it.
          <div className="hidden desktop:col-span-5 desktop:row-span-2 desktop:block" aria-hidden="true" />
        )}

        <div className={cn(TILE_CELL_CLASS, 'order-2 desktop:order-none desktop:col-span-4')}>
          <RischioTile risk={risk} reading={describeRisk(risk)} footer={RISK_FOOTER} />
        </div>

        <div className={cn(TILE_CELL_CLASS, 'order-3 desktop:order-none desktop:col-span-3')}>
          <AvvisiTile
            rows={alerts.rows}
            enabled={budget.alertsEnabled}
            aside={describeAlertsAside(budget.alertThresholds, budget.alertsEnabled)}
            reading={describeAlerts(alerts.rows, budget.alertsEnabled, now)}
            footer={describeAlertsFooter(budget.alertsEnabled, alerts.forecastOnlyCount)}
          />
        </div>

        {annual.rows.length > 0 ? (
          <div className={cn(TILE_CELL_CLASS, 'order-4 tablet:col-span-2 desktop:order-none desktop:col-span-7')}>
            <AnnualiTile
              summary={annual}
              aside={describeAnnualAside(annual)}
              reading={describeAnnualBudgets(annual)}
              footer={ANNUAL_FOOTER}
              isDemo={isDemo}
              onEdit={openEdit}
              onDelete={budget.deleteItem}
            />
          </div>
        ) : (
          <div className="hidden desktop:col-span-7 desktop:block" aria-hidden="true" />
        )}

        <div className={cn(TILE_CELL_CLASS, 'order-5 tablet:col-span-2 desktop:order-none desktop:col-span-12')}>
          <PerCategoriaTile
            rows={rows}
            calendarPct={(calendar.dayOfMonth / calendar.daysInMonth) * 100}
            aside={
              <span className="flex items-center gap-1.5">
                <NarrativeText segments={describeBudgetCounts(monthlyExpenseCount, rows.income.length, now)} figureClassName="font-medium" />
                <span role="status" aria-live="polite" className={cn(saveFailed ? 'text-destructive' : budget.saveStatus === 'saved' ? 'text-positive' : '')}>
                  {saveLabel ? `· ${saveLabel}` : ''}
                </span>
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
                <Button size="sm" onClick={openCreate} disabled={isDemo} aria-label={addButtonLabel}>
                  <Plus className="h-4 w-4" />
                  Aggiungi budget
                </Button>
              </div>
            }
          />
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
          onClose={() => setDialogOpen(false)}
          categories={categories}
          allExpenses={allExpenses}
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
