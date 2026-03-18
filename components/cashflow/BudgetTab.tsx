/**
 * BUDGET TAB
 *
 * Displays budget items auto-generated from the user's expense categories,
 * grouped into three fixed sections: Spese Fisse / Variabili / Debiti.
 *
 * AUTO-INIT:
 *   On every mount, budget items are derived from the categories prop merged
 *   with any saved config. New categories appear automatically; deleted ones
 *   disappear. Monthly amounts from saved config are preserved.
 *
 * SECTIONS:
 *   Fixed sections matching expense types (fixed → variable → debt).
 *   Users can add subcategory-scope items within any section.
 *   Category items cannot be deleted (they come from categories); subcategory
 *   items can be deleted.
 *
 * REORDER:
 *   Up/down arrow buttons reorder items within their section. Order is saved
 *   to Firestore on explicit Save.
 *
 * VIEW MODES:
 *   Annual — table with section headers + subtotals + grand total
 *   Monthly — grouped bar charts per section
 */

'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { Expense, ExpenseCategory, ExpenseType } from '@/types/expenses';
import { BudgetItem } from '@/types/budget';
import { getBudgetConfig, saveBudgetConfig } from '@/lib/services/budgetService';
import {
  buildBudgetComparison,
  getDefaultMonthlyAmount,
  autoInitBudgetItems,
  budgetItemKey,
  getActualForItem,
  getMonthlyActualsForItem,
} from '@/lib/utils/budgetUtils';
import { getItalyYear, getItalyMonth } from '@/lib/utils/dateHelpers';
import { formatCurrency } from '@/lib/utils/formatters';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableFooter,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Target, Plus, Trash2, Pencil, Save, X, Info, HelpCircle, ChevronUp, ChevronDown, ChevronRight } from 'lucide-react';
import {
  Tooltip as UITooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { toast } from 'sonner';
import { Alert, AlertDescription } from '@/components/ui/alert';

// ==================== Constants ====================

const MONTH_LABELS = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'];

// Fixed sections in display order (income last)
const SECTIONS: Array<{ type: ExpenseType; label: string; isIncome: boolean }> = [
  { type: 'fixed', label: 'Spese Fisse', isIncome: false },
  { type: 'variable', label: 'Variabili', isIncome: false },
  { type: 'debt', label: 'Debiti', isIncome: false },
  { type: 'income', label: 'Entrate', isIncome: true },
];

// Sentinel keys for aggregate deep-dive rows — subtotals per section and grand totals.
// Format __subtotal_{sectionType}__ avoids collisions with real budgetItemKey values.
const SUBTOTAL_KEY = (sectionType: string) => `__subtotal_${sectionType}__`;
const TOTAL_EXPENSES_KEY = '__total_expenses__';
const TOTAL_INCOME_KEY = '__total_income__';

// Only spending types for type-scope budget items (income is category-scope only)
const BUDGET_EXPENSE_TYPES: Array<Exclude<ExpenseType, 'income'>> = ['fixed', 'variable', 'debt'];
const BUDGET_TYPE_LABELS: Record<Exclude<ExpenseType, 'income'>, string> = {
  fixed: 'Spese Fisse',
  variable: 'Variabili',
  debt: 'Debiti',
};

// ==================== Types ====================

interface BudgetTabProps {
  allExpenses: Expense[];
  categories: ExpenseCategory[];
  loading: boolean;
  historyStartYear: number;
  userId: string;
}

// Subcategory form shown inline at the bottom of a section during edit mode
interface SubCategoryForm {
  sectionType: ExpenseType;
  categoryId: string;
  subCategoryId: string;
  monthlyAmount: string;
}

// ==================== Helpers ====================

/**
 * Returns the expense type a budget item belongs to, used for section grouping.
 * Category/subcategory items derive their section from the live categories list.
 * Falls back to categoryName lookup for items whose parent was deleted.
 */
function getItemSectionType(
  item: BudgetItem,
  categories: ExpenseCategory[]
): Exclude<ExpenseType, 'income'> | null {
  if (item.scope === 'type') return item.expenseType ?? null;
  const cat = categories.find((c) => c.id === item.categoryId);
  if (!cat) return null;
  return cat.type as Exclude<ExpenseType, 'income'>;
}

/** Display label for a budget item, resolving live category names */
function getItemLabel(item: BudgetItem, categories: ExpenseCategory[]): string {
  if (item.scope === 'type') {
    return BUDGET_TYPE_LABELS[item.expenseType as keyof typeof BUDGET_TYPE_LABELS] ?? '';
  }
  const cat = categories.find((c) => c.id === item.categoryId);
  const catName = cat?.name ?? item.categoryName ?? '';
  if (item.scope === 'subcategory') {
    const sub = cat?.subCategories.find((s) => s.id === item.subCategoryId);
    const subName = sub?.name ?? item.subCategoryName ?? '';
    return `${catName} › ${subName}`;
  }
  return catName;
}

/** Progress bar fill color. Inverted = income (higher is better). */
function progressColor(ratio: number, inverted = false): string {
  if (inverted) {
    if (ratio >= 1) return 'bg-green-500';
    if (ratio >= 0.8) return 'bg-amber-500';
    return 'bg-red-500';
  }
  if (ratio > 1) return 'bg-red-500';
  if (ratio >= 0.8) return 'bg-amber-500';
  return 'bg-green-500';
}

function progressBadgeVariant(ratio: number, inverted = false): 'destructive' | 'secondary' | 'outline' {
  if (inverted) {
    if (ratio >= 1) return 'outline';
    if (ratio >= 0.8) return 'secondary';
    return 'destructive';
  }
  if (ratio > 1) return 'destructive';
  if (ratio >= 0.8) return 'secondary';
  return 'outline';
}

// ==================== Sub-components ====================

function ProgressCell({ ratio, inverted = false }: { ratio: number; inverted?: boolean }) {
  const pct = Math.round(ratio * 100);
  return (
    <div className="flex items-center gap-2 min-w-[120px]">
      <div className="flex-1 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${progressColor(ratio, inverted)}`}
          style={{ width: `${Math.min(100, pct)}%` }}
        />
      </div>
      <Badge variant={progressBadgeVariant(ratio, inverted)} className="text-xs tabular-nums w-14 justify-center">
        {pct}%
      </Badge>
    </div>
  );
}

// ==================== Main Component ====================

export function BudgetTab({
  allExpenses,
  categories,
  loading,
  historyStartYear,
  userId,
}: BudgetTabProps) {
  const currentYear = getItalyYear();
  const currentMonth = getItalyMonth();

  // Raw saved items from Firestore (may be empty on first load)
  const [savedItems, setSavedItems] = useState<BudgetItem[]>([]);
  const [budgetLoading, setBudgetLoading] = useState(true);

  // Edit mode
  const [isEditing, setIsEditing] = useState(false);
  const [draftItems, setDraftItems] = useState<BudgetItem[]>([]);
  const [saving, setSaving] = useState(false);

  // Inline subcategory add form state
  const [subForm, setSubForm] = useState<SubCategoryForm | null>(null);

  // Collapsed sections — sections whose rows are hidden
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());

  function toggleSection(type: string) {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }

  // Guide box visibility per view mode
  const [showGuide, setShowGuide] = useState(false);

  // Tooltip open state for "Avanzamento" header
  const [progressTooltipOpen, setProgressTooltipOpen] = useState(false);

  // Key of the budget item shown in the historical deep dive (null = hidden).
  // Uses budgetItemKey() as stable identifier.
  const [selectedItemKey, setSelectedItemKey] = useState<string | null>(null);

  // Load saved config on mount
  useEffect(() => {
    if (!userId) return;
    getBudgetConfig(userId)
      .then((cfg) => { if (cfg) setSavedItems(cfg.items); })
      .catch(() => toast.error('Errore nel caricamento del budget'))
      .finally(() => setBudgetLoading(false));
  }, [userId]);

  // Scroll to the deep dive panel shortly after it opens so the user sees it
  // without losing context of which row they clicked. 100ms matches the
  // CurrentYearTab pattern for post-DOM-update scroll timing.
  useEffect(() => {
    if (!selectedItemKey) return;
    const timeout = setTimeout(() => {
      document.getElementById('budget-deep-dive')?.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
      });
    }, 100);
    return () => clearTimeout(timeout);
  }, [selectedItemKey]);

  // Derive display items: auto-init merges saved amounts with live categories.
  // Runs on every render so new categories appear without an explicit save.
  const displayItems = useMemo(
    () => autoInitBudgetItems(categories, allExpenses, historyStartYear, savedItems),
    [categories, allExpenses, historyStartYear, savedItems]
  );

  // Build comparisons for all display items
  const comparisons = useMemo(
    () => displayItems.map((item) => buildBudgetComparison(item, allExpenses, currentYear, historyStartYear)),
    [displayItems, allExpenses, currentYear, historyStartYear]
  );

  // Year-by-year breakdown for the selected item (or aggregate key).
  // Produces one row per year from historyStartYear to currentYear (newest first),
  // with 12 monthly actuals so the deep dive table can render Gen–Dic columns.
  const deepDiveData = useMemo(() => {
    if (!selectedItemKey) return null;

    // Aggregate branch: handles subtotals (__subtotal_{type}__) and grand totals.
    // Sums getMonthlyActualsForItem across all relevant items — same functions as
    // individual rows, so the CategoryDeepDive panel needs no changes.
    if (
      selectedItemKey === TOTAL_EXPENSES_KEY ||
      selectedItemKey === TOTAL_INCOME_KEY ||
      selectedItemKey.startsWith('__subtotal_')
    ) {
      let aggItems: BudgetItem[];
      let label: string;
      let isIncome: boolean;

      if (selectedItemKey === TOTAL_EXPENSES_KEY) {
        aggItems = displayItems.filter(i => (getItemSectionType(i, categories) as string) !== 'income');
        label = 'Totale Spese';
        isIncome = false;
      } else if (selectedItemKey === TOTAL_INCOME_KEY) {
        aggItems = displayItems.filter(i => (getItemSectionType(i, categories) as string) === 'income');
        label = 'Totale Entrate';
        isIncome = true;
      } else {
        // Strip __subtotal_ prefix (11 chars) and __ suffix (2 chars)
        const sectionType = selectedItemKey.slice(11, -2);
        aggItems = displayItems.filter(i => getItemSectionType(i, categories) === sectionType);
        const section = SECTIONS.find(s => s.type === sectionType);
        label = `Subtotale ${section?.label ?? sectionType}`;
        isIncome = section?.isIncome ?? false;
      }

      const years: number[] = [];
      for (let y = historyStartYear; y <= currentYear; y++) years.push(y);

      return {
        item: null as unknown as BudgetItem, // aggregate rows have no single BudgetItem
        label,
        isIncome,
        rows: [...years].reverse().map((year) => ({
          year,
          total: aggItems.reduce((s, i) => s + getActualForItem(i, allExpenses, year), 0),
          monthly: aggItems.reduce(
            (sums, i) => {
              const m = getMonthlyActualsForItem(i, allExpenses, year);
              return sums.map((v, idx) => v + m[idx]);
            },
            new Array<number>(12).fill(0)
          ),
          budgetAnnual: aggItems.reduce((s, i) => s + i.monthlyAmount * 12, 0),
        })),
      };
    }

    const item = displayItems.find((i) => budgetItemKey(i) === selectedItemKey);
    if (!item) return null;
    const isIncome = (getItemSectionType(item, categories) as string) === 'income';
    const years: number[] = [];
    for (let y = historyStartYear; y <= currentYear; y++) years.push(y);
    return {
      item,
      label: getItemLabel(item, categories),
      isIncome,
      // Newest year first — natural reading direction for historical tables
      rows: [...years].reverse().map((year) => ({
        year,
        total: getActualForItem(item, allExpenses, year),
        monthly: getMonthlyActualsForItem(item, allExpenses, year),
        budgetAnnual: item.monthlyAmount * 12,
      })),
    };
  }, [selectedItemKey, displayItems, allExpenses, historyStartYear, currentYear, categories]);

  // ==================== Grouping helpers ====================

  /** Items for a given section type (any ExpenseType), sorted by order */
  function sectionItems(items: BudgetItem[], sectionType: string): BudgetItem[] {
    return items
      .filter((item) => getItemSectionType(item, categories) === sectionType)
      .sort((a, b) => a.order - b.order);
  }

  // ==================== Edit mode handlers ====================

  function handleStartEditing() {
    setDraftItems(displayItems.map((item) => ({ ...item })));
    setSubForm(null);
    setSelectedItemKey(null);
    setIsEditing(true);
  }

  function handleCancelEditing() {
    setDraftItems([]);
    setSubForm(null);
    setIsEditing(false);
  }

  function handleAmountChange(id: string, value: string) {
    setDraftItems((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, monthlyAmount: parseFloat(value) || 0 } : item
      )
    );
  }

  function handleDeleteSubItem(id: string) {
    setDraftItems((prev) => prev.filter((item) => item.id !== id));
  }

  /** Move an item up or down within its section */
  function handleReorder(id: string, direction: 'up' | 'down') {
    setDraftItems((prev) => {
      const item = prev.find((i) => i.id === id);
      if (!item) return prev;
      const sectionType = getItemSectionType(item, categories);
      if (!sectionType) return prev;

      // Get section items sorted by order
      const inSection = prev
        .filter((i) => getItemSectionType(i, categories) === sectionType)
        .sort((a, b) => a.order - b.order);

      const idx = inSection.findIndex((i) => i.id === id);
      const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (targetIdx < 0 || targetIdx >= inSection.length) return prev;

      // Swap order values between the two items
      const swapId = inSection[targetIdx].id;
      return prev.map((i) => {
        if (i.id === id) return { ...i, order: inSection[targetIdx].order };
        if (i.id === swapId) return { ...i, order: item.order };
        return i;
      });
    });
  }

  /** Open the subcategory add form for a specific section */
  function handleOpenSubForm(sectionType: ExpenseType) {
    setSubForm({
      sectionType,
      categoryId: '__none__',
      subCategoryId: '__none__',
      monthlyAmount: '',
    });
  }

  function handleAddSubItem() {
    if (!subForm) return;
    if (subForm.categoryId === '__none__' || subForm.subCategoryId === '__none__') {
      toast.error('Seleziona categoria e sottocategoria.');
      return;
    }
    const amount = parseFloat(subForm.monthlyAmount);
    if (isNaN(amount) || amount < 0) {
      toast.error('Inserisci un importo valido.');
      return;
    }

    // Check duplicate
    const key = `sub-${subForm.categoryId}-${subForm.subCategoryId}`;
    const exists = draftItems.some((i) => budgetItemKey(i) === key);
    if (exists) {
      toast.error('Questa sottocategoria ha già una voce budget.');
      return;
    }

    const cat = categories.find((c) => c.id === subForm.categoryId);
    const sub = cat?.subCategories.find((s) => s.id === subForm.subCategoryId);

    // Assign order after the last item in this section
    const maxOrder = Math.max(
      0,
      ...draftItems
        .filter((i) => getItemSectionType(i, categories) === subForm.sectionType)
        .map((i) => i.order)
    );

    const newItem: BudgetItem = {
      id: crypto.randomUUID(),
      scope: 'subcategory',
      categoryId: subForm.categoryId,
      categoryName: cat?.name,
      subCategoryId: subForm.subCategoryId,
      subCategoryName: sub?.name,
      monthlyAmount: amount,
      order: maxOrder + 1,
    };

    setDraftItems((prev) => [...prev, newItem]);
    setSubForm(null);
  }

  async function handleSave() {
    // Validate: all amounts must be >= 0
    const invalid = draftItems.find((i) => i.monthlyAmount < 0);
    if (invalid) {
      toast.error('Gli importi non possono essere negativi.');
      return;
    }

    setSaving(true);
    try {
      await saveBudgetConfig(userId, draftItems);
      setSavedItems(draftItems);
      setIsEditing(false);
      setDraftItems([]);
      setSubForm(null);
      toast.success('Budget salvato');
    } catch {
      toast.error('Errore nel salvataggio del budget');
    } finally {
      setSaving(false);
    }
  }

  // ==================== View mode: Annual table ====================

  /**
   * Percentage delta badge.
   * Default (expenses): green = down (less spending = good), red = up.
   * Inverted (income):  green = up (more income = good), red = down.
   */
  function DeltaBadge({ value, reference, inverted = false }: { value: number; reference: number; inverted?: boolean }) {
    if (reference === 0 || value === 0) return <span className="text-gray-400 text-xs">—</span>;
    const pct = ((value - reference) / reference) * 100;
    const isUp = pct > 0;
    // For expenses: up = bad. For income: up = good.
    const isBad = inverted ? !isUp : isUp;
    const color = isBad ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-500';
    const sign = isUp ? '+' : '';
    return (
      <span className={`text-xs font-medium tabular-nums ${color}`}>
        {sign}{pct.toFixed(1)}%
      </span>
    );
  }

  function AnnualTable() {
    const hasHistory = comparisons.some((c) => c.historicalAverage > 0);

    // Separate totals for expenses vs income.
    // getItemSectionType return type excludes 'income' but at runtime income categories return 'income' — cast to string for comparison.
    const isIncomeItem = (item: BudgetItem) => (getItemSectionType(item, categories) as string) === 'income';
    const expenseItems = displayItems.filter(i => !isIncomeItem(i));
    const incomeItems = displayItems.filter(i => isIncomeItem(i));
    const expenseComparisons = comparisons.filter(c => !isIncomeItem(c.item));
    const incomeComparisons = comparisons.filter(c => isIncomeItem(c.item));

    const totalExpCurrentYear = expenseComparisons.reduce((s, c) => s + c.currentYearTotal, 0);
    const totalExpPrevYear = expenseComparisons.reduce((s, c) => s + c.previousYearTotal, 0);
    const totalExpHistAvg = expenseComparisons.reduce((s, c) => s + c.historicalAverage, 0);
    const totalExpBudgetMonthly = expenseItems.reduce((s, i) => s + i.monthlyAmount, 0);

    const totalIncCurrentYear = incomeComparisons.reduce((s, c) => s + c.currentYearTotal, 0);
    const totalIncPrevYear = incomeComparisons.reduce((s, c) => s + c.previousYearTotal, 0);
    const totalIncHistAvg = incomeComparisons.reduce((s, c) => s + c.historicalAverage, 0);
    const totalIncBudgetMonthly = incomeItems.reduce((s, i) => s + i.monthlyAmount, 0);

    const compMap = new Map(comparisons.map((c) => [c.item.id, c]));

    return (
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Voce</TableHead>
              <TableHead className="text-right">Budget/anno</TableHead>
              <TableHead className="text-right text-blue-600 dark:text-blue-400">{currentYear}</TableHead>
              <TableHead className="text-right text-amber-600 dark:text-amber-400">{currentYear - 1}</TableHead>
              <TableHead className="text-right text-xs">vs {currentYear - 1}</TableHead>
              {hasHistory && (
                <TableHead className="text-right text-purple-600 dark:text-purple-400">Media storica</TableHead>
              )}
              {hasHistory && (
                <TableHead className="text-right text-xs">vs Media</TableHead>
              )}
              <TableHead className="min-w-[160px]">
                <TooltipProvider>
                  <UITooltip open={progressTooltipOpen} onOpenChange={setProgressTooltipOpen}>
                    <TooltipTrigger asChild>
                      <button
                        className="flex items-center gap-1 cursor-pointer select-none"
                        onClick={() => setProgressTooltipOpen((v) => !v)}
                      >
                        Avanzamento
                        <HelpCircle className="h-3.5 w-3.5 text-gray-400" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-xs text-xs leading-relaxed p-3">
                      <p>Spesa anno corrente ÷ budget/anno.</p>
                      <p className="mt-1">Verde &lt;80% · Arancione 80–100% · Rosso &gt;100%.</p>
                    </TooltipContent>
                  </UITooltip>
                </TooltipProvider>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {SECTIONS.map(({ type: sectionType, label: sectionLabel, isIncome }) => {
              const items = sectionItems(displayItems, sectionType);
              if (items.length === 0) return null;

              const isCollapsed = collapsedSections.has(sectionType);

              // Section subtotals
              const sectionComparisons = items.map((i) => compMap.get(i.id)!).filter(Boolean);
              const secCurrentYear = sectionComparisons.reduce((s, c) => s + c.currentYearTotal, 0);
              const secPrevYear = sectionComparisons.reduce((s, c) => s + c.previousYearTotal, 0);
              const secHistAvg = sectionComparisons.reduce((s, c) => s + c.historicalAverage, 0);
              const secBudgetMonthly = items.reduce((s, i) => s + i.monthlyAmount, 0);
              const secRatio = secBudgetMonthly > 0
                ? secCurrentYear / (secBudgetMonthly * 12)
                : 0;

              // Total columns: Voce + Budget/mese + currentYear + prevYear + vs prevYear
              //   + (Media storica + vs Media)? + Avanzamento
              const totalCols = 5 + (hasHistory ? 2 : 0);

              return (
                <React.Fragment key={sectionType}>
                  {/* Section header row — click to collapse/expand */}
                  <TableRow
                    key={`section-${sectionType}`}
                    className="bg-gray-50 dark:bg-gray-800/60 cursor-pointer select-none hover:bg-gray-100 dark:hover:bg-gray-800"
                    onClick={() => toggleSection(sectionType)}
                  >
                    <TableCell
                      colSpan={totalCols}
                      className="py-2 font-semibold text-sm text-gray-700 dark:text-gray-300"
                    >
                      <span className="flex items-center gap-2">
                        <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${isCollapsed ? '-rotate-90' : ''}`} />
                        {sectionLabel}
                        <span className="text-xs font-normal text-gray-400">
                          ({items.length} {items.length === 1 ? 'voce' : 'voci'})
                        </span>
                      </span>
                    </TableCell>
                  </TableRow>

                  {/* Item rows — hidden when collapsed */}
                  {!isCollapsed && items.map((item) => {
                    const c = compMap.get(item.id);
                    if (!c) return null;
                    const itemKey = budgetItemKey(item);
                    const isSelected = selectedItemKey === itemKey;
                    return (
                      <TableRow
                        key={item.id}
                        className={`pl-4 cursor-pointer transition-colors ${
                          isSelected
                            ? 'bg-blue-50/60 dark:bg-blue-950/20 hover:bg-blue-50/80 dark:hover:bg-blue-950/30'
                            : 'hover:bg-muted/40'
                        }`}
                        onClick={() =>
                          setSelectedItemKey((prev) => (prev === itemKey ? null : itemKey))
                        }
                      >
                        <TableCell className="pl-6 text-sm">
                          <span className="flex items-center gap-1">
                            {isSelected
                              ? <ChevronDown className="h-3 w-3 text-blue-500 shrink-0" />
                              : <ChevronRight className="h-3 w-3 text-gray-300 dark:text-gray-600 shrink-0" />}
                            {getItemLabel(item, categories)}
                          </span>
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-sm">
                          {formatCurrency(item.monthlyAmount * 12)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums font-semibold text-sm">
                          {formatCurrency(c.currentYearTotal)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-gray-500 text-sm">
                          {c.previousYearTotal > 0 ? formatCurrency(c.previousYearTotal) : '—'}
                        </TableCell>
                        <TableCell className="text-right">
                          <DeltaBadge value={c.currentYearTotal} reference={c.previousYearTotal} inverted={isIncome} />
                        </TableCell>
                        {hasHistory && (
                          <TableCell className="text-right tabular-nums text-gray-500 text-sm">
                            {c.historicalAverage > 0 ? formatCurrency(c.historicalAverage) : '—'}
                          </TableCell>
                        )}
                        {hasHistory && (
                          <TableCell className="text-right">
                            <DeltaBadge value={c.currentYearTotal} reference={c.historicalAverage} inverted={isIncome} />
                          </TableCell>
                        )}
                        <TableCell>
                          <ProgressCell ratio={c.budgetUsedRatio} inverted={isIncome} />
                        </TableCell>
                      </TableRow>
                    );
                  })}

                  {/* Section subtotal row — only shown when not collapsed */}
                  {!isCollapsed && (
                  <TableRow
                    key={`subtotal-${sectionType}`}
                    className={`border-t border-gray-200 dark:border-gray-700 cursor-pointer select-none transition-colors ${
                      selectedItemKey === SUBTOTAL_KEY(sectionType)
                        ? 'bg-blue-50/60 dark:bg-blue-950/20 hover:bg-blue-50/80 dark:hover:bg-blue-950/30'
                        : 'bg-gray-50/60 dark:bg-gray-800/30 hover:bg-muted/40'
                    }`}
                    onClick={() => setSelectedItemKey(prev => prev === SUBTOTAL_KEY(sectionType) ? null : SUBTOTAL_KEY(sectionType))}
                  >
                    <TableCell className="pl-6 text-xs font-medium text-gray-500">
                      <span className="flex items-center gap-1">
                        {selectedItemKey === SUBTOTAL_KEY(sectionType)
                          ? <ChevronDown className="h-3 w-3 text-blue-500 shrink-0" />
                          : <ChevronRight className="h-3 w-3 text-gray-300 dark:text-gray-600 shrink-0" />}
                        Subtotale {sectionLabel}
                      </span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-xs font-medium">
                      {formatCurrency(secBudgetMonthly * 12)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-xs font-medium">
                      {formatCurrency(secCurrentYear)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-xs text-gray-500">
                      {secPrevYear > 0 ? formatCurrency(secPrevYear) : '—'}
                    </TableCell>
                    <TableCell className="text-right">
                      {secPrevYear > 0 && secCurrentYear > 0 && (
                        <DeltaBadge value={secCurrentYear} reference={secPrevYear} inverted={isIncome} />
                      )}
                    </TableCell>
                    {hasHistory && (
                      <TableCell className="text-right tabular-nums text-xs text-gray-500">
                        {secHistAvg > 0 ? formatCurrency(secHistAvg) : '—'}
                      </TableCell>
                    )}
                    {hasHistory && (
                      <TableCell className="text-right">
                        {secHistAvg > 0 && secCurrentYear > 0 && (
                          <DeltaBadge value={secCurrentYear} reference={secHistAvg} inverted={isIncome} />
                        )}
                      </TableCell>
                    )}
                    <TableCell>
                      <ProgressCell ratio={secRatio} inverted={isIncome} />
                    </TableCell>
                  </TableRow>
                  )}
                </React.Fragment>
              );
            })}
          </TableBody>
          <TableFooter>
            {expenseItems.length > 0 && (
              <TableRow
                className={`cursor-pointer select-none transition-colors ${
                  selectedItemKey === TOTAL_EXPENSES_KEY
                    ? 'bg-blue-50/60 dark:bg-blue-950/20 hover:bg-blue-50/80 dark:hover:bg-blue-950/30'
                    : 'hover:bg-muted/40'
                }`}
                onClick={() => setSelectedItemKey(prev => prev === TOTAL_EXPENSES_KEY ? null : TOTAL_EXPENSES_KEY)}
              >
                <TableCell className="font-semibold">
                  <span className="flex items-center gap-1">
                    {selectedItemKey === TOTAL_EXPENSES_KEY
                      ? <ChevronDown className="h-3 w-3 text-blue-500 shrink-0" />
                      : <ChevronRight className="h-3 w-3 text-gray-300 dark:text-gray-600 shrink-0" />}
                    Totale Spese
                  </span>
                </TableCell>
                <TableCell className="text-right tabular-nums font-semibold">
                  {formatCurrency(totalExpBudgetMonthly * 12)}
                </TableCell>
                <TableCell className="text-right tabular-nums font-semibold">
                  {formatCurrency(totalExpCurrentYear)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {totalExpPrevYear > 0 ? formatCurrency(totalExpPrevYear) : '—'}
                </TableCell>
                <TableCell className="text-right">
                  {totalExpPrevYear > 0 && totalExpCurrentYear > 0 && (
                    <DeltaBadge value={totalExpCurrentYear} reference={totalExpPrevYear} />
                  )}
                </TableCell>
                {hasHistory && (
                  <TableCell className="text-right tabular-nums">
                    {totalExpHistAvg > 0 ? formatCurrency(totalExpHistAvg) : '—'}
                  </TableCell>
                )}
                {hasHistory && (
                  <TableCell className="text-right">
                    {totalExpHistAvg > 0 && totalExpCurrentYear > 0 && (
                      <DeltaBadge value={totalExpCurrentYear} reference={totalExpHistAvg} />
                    )}
                  </TableCell>
                )}
                <TableCell>
                  <ProgressCell ratio={totalExpBudgetMonthly > 0 ? totalExpCurrentYear / (totalExpBudgetMonthly * 12) : 0} inverted={false} />
                </TableCell>
              </TableRow>
            )}
            {incomeItems.length > 0 && (
              <TableRow
                className={`cursor-pointer select-none transition-colors ${
                  selectedItemKey === TOTAL_INCOME_KEY
                    ? 'bg-blue-50/60 dark:bg-blue-950/20 hover:bg-blue-50/80 dark:hover:bg-blue-950/30'
                    : 'hover:bg-muted/40'
                }`}
                onClick={() => setSelectedItemKey(prev => prev === TOTAL_INCOME_KEY ? null : TOTAL_INCOME_KEY)}
              >
                <TableCell className="font-semibold">
                  <span className="flex items-center gap-1">
                    {selectedItemKey === TOTAL_INCOME_KEY
                      ? <ChevronDown className="h-3 w-3 text-blue-500 shrink-0" />
                      : <ChevronRight className="h-3 w-3 text-gray-300 dark:text-gray-600 shrink-0" />}
                    Totale Entrate
                  </span>
                </TableCell>
                <TableCell className="text-right tabular-nums font-semibold">
                  {formatCurrency(totalIncBudgetMonthly * 12)}
                </TableCell>
                <TableCell className="text-right tabular-nums font-semibold">
                  {formatCurrency(totalIncCurrentYear)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {totalIncPrevYear > 0 ? formatCurrency(totalIncPrevYear) : '—'}
                </TableCell>
                <TableCell className="text-right">
                  {totalIncPrevYear > 0 && totalIncCurrentYear > 0 && (
                    <DeltaBadge value={totalIncCurrentYear} reference={totalIncPrevYear} inverted />
                  )}
                </TableCell>
                {hasHistory && (
                  <TableCell className="text-right tabular-nums">
                    {totalIncHistAvg > 0 ? formatCurrency(totalIncHistAvg) : '—'}
                  </TableCell>
                )}
                {hasHistory && (
                  <TableCell className="text-right">
                    {totalIncHistAvg > 0 && totalIncCurrentYear > 0 && (
                      <DeltaBadge value={totalIncCurrentYear} reference={totalIncHistAvg} inverted />
                    )}
                  </TableCell>
                )}
                <TableCell>
                  <ProgressCell ratio={totalIncBudgetMonthly > 0 ? totalIncCurrentYear / (totalIncBudgetMonthly * 12) : 0} inverted={true} />
                </TableCell>
              </TableRow>
            )}
          </TableFooter>
        </Table>
      </div>
    );
  }

  // ==================== Category deep dive ====================

  /**
   * Historical deep dive panel, shown below the annual table when the user
   * clicks a category row. Renders one row per year (newest first) with
   * Jan–Dec columns so spending patterns across years are easy to compare.
   *
   * WHY inline rather than a modal: consistent with CurrentYearTab's inline
   * drill-down pattern; keeps the user in context while viewing the main table.
   */
  function CategoryDeepDive() {
    if (!deepDiveData) return null;
    const { label, isIncome, rows } = deepDiveData;

    return (
      <div
        id="budget-deep-dive"
        className="rounded-lg border-2 border-blue-200 bg-blue-50/50 dark:bg-blue-950/10 dark:border-blue-800 p-4"
      >
        {/* Header with title and close button */}
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-sm text-blue-800 dark:text-blue-300">
            Analisi Storica: {label}
          </h3>
          <button
            onClick={() => setSelectedItemKey(null)}
            aria-label="Chiudi analisi storica"
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Wide table — 12 month columns + totals. Scrolls horizontally on mobile. */}
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-blue-200 dark:border-blue-800">
                <th className="text-left pr-3 py-1 font-medium text-gray-600 dark:text-gray-400 whitespace-nowrap">Anno</th>
                <th className="text-right pr-3 py-1 font-medium text-gray-600 dark:text-gray-400 whitespace-nowrap">Budget</th>
                {MONTH_LABELS.map((m) => (
                  <th key={m} className="text-right px-1.5 py-1 font-medium text-gray-500 dark:text-gray-500 whitespace-nowrap">{m}</th>
                ))}
                <th className="text-right pl-3 py-1 font-semibold text-gray-700 dark:text-gray-300 whitespace-nowrap">Totale</th>
                <th className="text-right pl-2 py-1 font-medium text-gray-600 dark:text-gray-400 whitespace-nowrap">vs Budget</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ year, total, monthly, budgetAnnual }) => {
                const isCurrentYear = year === currentYear;
                const ratio = budgetAnnual > 0 ? total / budgetAnnual : 0;
                // Derive a text color from the same thresholds used elsewhere for consistency
                const vsColorClass = total > 0 && budgetAnnual > 0
                  ? progressColor(ratio, isIncome)
                      .replace('bg-green-500', 'text-green-600 dark:text-green-500')
                      .replace('bg-amber-500', 'text-amber-600 dark:text-amber-500')
                      .replace('bg-red-500', 'text-red-600 dark:text-red-400')
                  : 'text-gray-300 dark:text-gray-600';

                // Identify the highest and lowest spending months for this year.
                // Exclude future months and zero months — they don't carry real data.
                // Skip highlight when fewer than 2 real months exist or all values are equal.
                const realMonths = monthly
                  .map((v, i) => ({ v, i }))
                  .filter(({ v, i }) => !(isCurrentYear && i >= currentMonth) && v > 0);
                const maxVal = realMonths.length >= 2 ? Math.max(...realMonths.map(({ v }) => v)) : null;
                const minVal = realMonths.length >= 2 ? Math.min(...realMonths.map(({ v }) => v)) : null;
                const highlightEnabled = maxVal !== null && minVal !== null && maxVal !== minVal;

                return (
                  <tr
                    key={year}
                    className={`border-b border-blue-100 dark:border-blue-900/50 ${
                      isCurrentYear
                        ? 'bg-blue-100/60 dark:bg-blue-900/30 font-medium'
                        : 'hover:bg-blue-50/30 dark:hover:bg-blue-950/20'
                    }`}
                  >
                    <td className="pr-3 py-1.5 tabular-nums whitespace-nowrap">
                      {year}
                      {/* Small marker so the current year stands out in a long list */}
                      {isCurrentYear && <span className="ml-1 text-blue-500">◂</span>}
                    </td>
                    <td className="pr-3 py-1.5 text-right tabular-nums text-gray-500 whitespace-nowrap">
                      {budgetAnnual > 0 ? formatCurrency(budgetAnnual) : '—'}
                    </td>
                    {monthly.map((v, i) => {
                      // Future months in the current year haven't happened yet — show a dash
                      const isFuture = isCurrentYear && i >= currentMonth;
                      const isEmpty = isFuture || v === 0;
                      // Max/min highlight: expenses use red=max, green=min; income inverts
                      const isMax = !isEmpty && highlightEnabled && v === maxVal;
                      const isMin = !isEmpty && highlightEnabled && v === minVal;
                      const highlightClass = isMax
                        ? (isIncome ? 'bg-green-100 dark:bg-green-900/30 font-semibold rounded' : 'bg-red-100 dark:bg-red-900/30 font-semibold rounded')
                        : isMin
                        ? (isIncome ? 'bg-red-100 dark:bg-red-900/30 font-semibold rounded' : 'bg-green-100 dark:bg-green-900/30 font-semibold rounded')
                        : '';
                      return (
                        <td
                          key={i}
                          className={`px-1.5 py-1.5 text-right tabular-nums whitespace-nowrap ${
                            isEmpty ? 'text-gray-300 dark:text-gray-600' : highlightClass
                          }`}
                        >
                          {isEmpty ? '—' : formatCurrency(v)}
                        </td>
                      );
                    })}
                    <td className="pl-3 py-1.5 text-right tabular-nums font-semibold whitespace-nowrap">
                      {total > 0 ? formatCurrency(total) : '—'}
                    </td>
                    <td className={`pl-2 py-1.5 text-right tabular-nums whitespace-nowrap ${vsColorClass}`}>
                      {total > 0 && budgetAnnual > 0 ? `${Math.round(ratio * 100)}%` : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Per-type month-by-month breakdown — only shown for "Totale Spese".
            One mini-table per expense type (Fisse / Variabili / Debiti), each with
            the same Anno × Gen…Dic structure as the aggregate table above, so the
            user can spot high-spend months per category at a glance. */}
        {selectedItemKey === TOTAL_EXPENSES_KEY && SECTIONS.filter(s => !s.isIncome).map(section => {
          const secItems = sectionItems(displayItems, section.type);
          if (secItems.length === 0) return null;

          const secBudgetAnnual = secItems.reduce((s, i) => s + i.monthlyAmount * 12, 0);
          // Newest year first — matches the aggregate table order
          const secRows = [...rows].map(({ year }) => {
            const isCurrentYear = year === currentYear;
            const monthly = secItems.reduce(
              (sums, i) => { const m = getMonthlyActualsForItem(i, allExpenses, year); return sums.map((v, idx) => v + m[idx]); },
              new Array<number>(12).fill(0)
            );
            const total = monthly.reduce((s, v) => s + v, 0);
            return { year, isCurrentYear, monthly, total };
          });

          return (
            <div key={section.type} className="mt-4 pt-4 border-t border-blue-200 dark:border-blue-800">
              <p className="text-xs font-medium text-blue-700 dark:text-blue-400 mb-2">{section.label}</p>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-blue-200 dark:border-blue-800">
                      <th className="text-left pr-3 py-1 font-medium text-gray-600 dark:text-gray-400 whitespace-nowrap">Anno</th>
                      <th className="text-right pr-3 py-1 font-medium text-gray-600 dark:text-gray-400 whitespace-nowrap">Budget</th>
                      {MONTH_LABELS.map((m) => (
                        <th key={m} className="text-right px-1.5 py-1 font-medium text-gray-500 dark:text-gray-500 whitespace-nowrap">{m}</th>
                      ))}
                      <th className="text-right pl-3 py-1 font-semibold text-gray-700 dark:text-gray-300 whitespace-nowrap">Totale</th>
                      <th className="text-right pl-2 py-1 font-medium text-gray-600 dark:text-gray-400 whitespace-nowrap">vs Budget</th>
                    </tr>
                  </thead>
                  <tbody>
                    {secRows.map(({ year, isCurrentYear, monthly, total }) => {
                      const ratio = secBudgetAnnual > 0 ? total / secBudgetAnnual : 0;
                      const vsColorClass = total > 0 && secBudgetAnnual > 0
                        ? progressColor(ratio, false)
                            .replace('bg-green-500', 'text-green-600 dark:text-green-500')
                            .replace('bg-amber-500', 'text-amber-600 dark:text-amber-500')
                            .replace('bg-red-500', 'text-red-600 dark:text-red-400')
                        : 'text-gray-300 dark:text-gray-600';

                      // Same min/max highlight logic as the aggregate table
                      const realMonths = monthly
                        .map((v, i) => ({ v, i }))
                        .filter(({ v, i }) => !(isCurrentYear && i >= currentMonth) && v > 0);
                      const maxVal = realMonths.length >= 2 ? Math.max(...realMonths.map(({ v }) => v)) : null;
                      const minVal = realMonths.length >= 2 ? Math.min(...realMonths.map(({ v }) => v)) : null;
                      const highlightEnabled = maxVal !== null && minVal !== null && maxVal !== minVal;

                      return (
                        <tr
                          key={year}
                          className={`border-b border-blue-100 dark:border-blue-900/50 ${
                            isCurrentYear
                              ? 'bg-blue-100/60 dark:bg-blue-900/30 font-medium'
                              : 'hover:bg-blue-50/30 dark:hover:bg-blue-950/20'
                          }`}
                        >
                          <td className="pr-3 py-1.5 tabular-nums whitespace-nowrap">
                            {year}{isCurrentYear && <span className="ml-1 text-blue-500">◂</span>}
                          </td>
                          <td className="pr-3 py-1.5 text-right tabular-nums text-gray-500 whitespace-nowrap">
                            {secBudgetAnnual > 0 ? formatCurrency(secBudgetAnnual) : '—'}
                          </td>
                          {monthly.map((v, i) => {
                            const isFuture = isCurrentYear && i >= currentMonth;
                            const isEmpty = isFuture || v === 0;
                            const isMax = !isEmpty && highlightEnabled && v === maxVal;
                            const isMin = !isEmpty && highlightEnabled && v === minVal;
                            const highlightClass = isMax
                              ? 'bg-red-100 dark:bg-red-900/30 font-semibold rounded'
                              : isMin
                              ? 'bg-green-100 dark:bg-green-900/30 font-semibold rounded'
                              : '';
                            return (
                              <td
                                key={i}
                                className={`px-1.5 py-1.5 text-right tabular-nums whitespace-nowrap ${
                                  isEmpty ? 'text-gray-300 dark:text-gray-600' : highlightClass
                                }`}
                              >
                                {isEmpty ? '—' : formatCurrency(v)}
                              </td>
                            );
                          })}
                          <td className="pl-3 py-1.5 text-right tabular-nums font-semibold whitespace-nowrap">
                            {total > 0 ? formatCurrency(total) : '—'}
                          </td>
                          <td className={`pl-2 py-1.5 text-right tabular-nums whitespace-nowrap ${vsColorClass}`}>
                            {total > 0 && secBudgetAnnual > 0 ? `${Math.round(ratio * 100)}%` : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  // ==================== Edit mode ====================

  function EditPanel() {
    return (
      <div className="space-y-6">
        <Alert className="border-blue-200 bg-blue-50 dark:bg-blue-950/20">
          <Info className="h-4 w-4" />
          <AlertDescription className="text-xs">
            Le categorie vengono rilevate automaticamente. Modifica gli importi mensili e aggiungi
            voci per sottocategorie se vuoi un dettaglio maggiore.
          </AlertDescription>
        </Alert>

        {SECTIONS.map(({ type: sectionType, label: sectionLabel }) => {
          const items = sectionItems(draftItems, sectionType as ExpenseType);
          const catItems = items.filter((i) => i.scope === 'category');
          const subItems = items.filter((i) => i.scope === 'subcategory');

          // Categories available for adding subcategory items in this section
          const sectionCategories = categories.filter(
            (c) => c.type === sectionType && c.subCategories.length > 0
          );

          // If subForm is open for this section
          const isSubFormOpen = subForm?.sectionType === sectionType;

          return (
            <Card key={sectionType} className="border-gray-200 dark:border-gray-700">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-gray-700 dark:text-gray-300">
                  {sectionLabel}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {/* Category items — amount editable, not deletable */}
                {catItems.map((item, idx) => (
                  <div key={item.id} className="flex items-center gap-2 py-1">
                    {/* Reorder arrows */}
                    <div className="flex flex-col">
                      <button
                        className="text-gray-400 hover:text-gray-600 disabled:opacity-20"
                        onClick={() => handleReorder(item.id, 'up')}
                        disabled={idx === 0}
                        title="Sposta su"
                      >
                        <ChevronUp className="h-3.5 w-3.5" />
                      </button>
                      <button
                        className="text-gray-400 hover:text-gray-600 disabled:opacity-20"
                        onClick={() => handleReorder(item.id, 'down')}
                        disabled={idx === catItems.length - 1 && subItems.length === 0}
                        title="Sposta giù"
                      >
                        <ChevronDown className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <span className="flex-1 text-sm">{getItemLabel(item, categories)}</span>
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-gray-400">€</span>
                      <Input
                        type="number"
                        min="0"
                        step="1"
                        className="h-7 w-28 text-sm text-right"
                        value={item.monthlyAmount === 0 ? '' : item.monthlyAmount}
                        onChange={(e) => handleAmountChange(item.id, e.target.value)}
                        placeholder="0"
                      />
                      <span className="text-xs text-gray-400">/mese</span>
                    </div>
                  </div>
                ))}

                {/* Subcategory items — amount editable, deletable, reorderable */}
                {subItems.map((item, idx) => (
                  <div key={item.id} className="flex items-center gap-2 py-1 pl-4 border-l-2 border-gray-200 dark:border-gray-700">
                    <div className="flex flex-col">
                      <button
                        className="text-gray-400 hover:text-gray-600 disabled:opacity-20"
                        onClick={() => handleReorder(item.id, 'up')}
                        disabled={idx === 0 && catItems.length === 0}
                        title="Sposta su"
                      >
                        <ChevronUp className="h-3.5 w-3.5" />
                      </button>
                      <button
                        className="text-gray-400 hover:text-gray-600 disabled:opacity-20"
                        onClick={() => handleReorder(item.id, 'down')}
                        disabled={idx === subItems.length - 1}
                        title="Sposta giù"
                      >
                        <ChevronDown className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <span className="flex-1 text-sm text-gray-600 dark:text-gray-400">
                      {getItemLabel(item, categories)}
                    </span>
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-gray-400">€</span>
                      <Input
                        type="number"
                        min="0"
                        step="1"
                        className="h-7 w-28 text-sm text-right"
                        value={item.monthlyAmount === 0 ? '' : item.monthlyAmount}
                        onChange={(e) => handleAmountChange(item.id, e.target.value)}
                        placeholder="0"
                      />
                      <span className="text-xs text-gray-400">/mese</span>
                    </div>
                    <button
                      className="text-red-400 hover:text-red-600 ml-1"
                      onClick={() => handleDeleteSubItem(item.id)}
                      title="Rimuovi"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}

                {/* Inline subcategory add form */}
                {isSubFormOpen && (
                  <div className="mt-2 p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 space-y-2">
                    <p className="text-xs font-medium text-gray-600 dark:text-gray-400">Aggiungi sottocategoria</p>
                    <div className="flex flex-wrap gap-2 items-end">
                      {/* Category select */}
                      <div className="flex flex-col gap-1 min-w-[150px]">
                        <Label className="text-xs text-gray-500">Categoria</Label>
                        <Select
                          value={subForm!.categoryId}
                          onValueChange={(v) => {
                            const cat = categories.find((c) => c.id === v);
                            const suggested = v !== '__none__'
                              ? getDefaultMonthlyAmount(
                                  { scope: 'subcategory', categoryId: v, categoryName: cat?.name, order: 0 },
                                  allExpenses, historyStartYear
                                )
                              : 0;
                            setSubForm((f) => f ? {
                              ...f, categoryId: v, subCategoryId: '__none__',
                              monthlyAmount: suggested > 0 ? String(Math.round(suggested)) : '',
                            } : f);
                          }}
                        >
                          <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Seleziona…" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__" disabled>Seleziona…</SelectItem>
                            {sectionCategories.map((c) => (
                              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Subcategory select */}
                      <div className="flex flex-col gap-1 min-w-[150px]">
                        <Label className="text-xs text-gray-500">Sottocategoria</Label>
                        <Select
                          value={subForm!.subCategoryId}
                          disabled={subForm!.categoryId === '__none__'}
                          onValueChange={(v) => {
                            const cat = categories.find((c) => c.id === subForm!.categoryId);
                            const sub = cat?.subCategories.find((s) => s.id === v);
                            const suggested = v !== '__none__'
                              ? getDefaultMonthlyAmount(
                                  { scope: 'subcategory', categoryId: subForm!.categoryId, subCategoryId: v, subCategoryName: sub?.name, order: 0 },
                                  allExpenses, historyStartYear
                                )
                              : 0;
                            setSubForm((f) => f ? {
                              ...f, subCategoryId: v,
                              monthlyAmount: suggested > 0 ? String(Math.round(suggested)) : f.monthlyAmount,
                            } : f);
                          }}
                        >
                          <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Seleziona…" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__" disabled>Seleziona…</SelectItem>
                            {(categories.find((c) => c.id === subForm!.categoryId)?.subCategories ?? []).map((s) => (
                              <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Amount input */}
                      <div className="flex flex-col gap-1 min-w-[110px]">
                        <Label className="text-xs text-gray-500">Budget/mese (€)</Label>
                        <Input
                          type="number" min="0" step="1" className="h-8 text-sm"
                          value={subForm!.monthlyAmount}
                          onChange={(e) => setSubForm((f) => f ? { ...f, monthlyAmount: e.target.value } : f)}
                          placeholder="0"
                        />
                      </div>

                      <Button size="sm" className="h-8" onClick={handleAddSubItem}>Aggiungi</Button>
                      <Button variant="ghost" size="sm" className="h-8" onClick={() => setSubForm(null)}>
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                )}

                {/* Add subcategory button (hidden if form already open) */}
                {!isSubFormOpen && sectionCategories.length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mt-1 h-7 text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1"
                    onClick={() => handleOpenSubForm(sectionType)}
                  >
                    <Plus className="h-3 w-3" />
                    Aggiungi sottocategoria
                  </Button>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    );
  }

  // ==================== Render ====================

  if (budgetLoading || loading) {
    return (
      <div className="flex items-center justify-center py-16 text-gray-500">
        <span className="text-sm">Caricamento budget…</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Target className="h-5 w-5 text-blue-500" />
            Budget
          </h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Confronta la spesa effettiva con il budget, l&apos;anno precedente e la media storica
          </p>
        </div>

        <div className="flex items-center gap-2">
          {!isEditing && (
            <Button variant="outline" size="sm" onClick={handleStartEditing} className="flex items-center gap-1.5">
              <Pencil className="h-3.5 w-3.5" />
              Modifica
            </Button>
          )}
          {isEditing && (
            <>
              <Button variant="outline" size="sm" onClick={handleCancelEditing} disabled={saving} className="flex items-center gap-1.5">
                <X className="h-3.5 w-3.5" />
                Annulla
              </Button>
              <Button size="sm" onClick={handleSave} disabled={saving} className="flex items-center gap-1.5">
                <Save className="h-3.5 w-3.5" />
                {saving ? 'Salvataggio…' : 'Salva'}
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Edit panel */}
      {isEditing && <EditPanel />}

      {/* Annual table + deep dive */}
      {!isEditing && (
        <>
          {/* Guide toggle */}
          <button
            onClick={() => setShowGuide((v) => !v)}
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          >
            <HelpCircle className="h-3.5 w-3.5" />
            {showGuide ? 'Nascondi guida' : 'Come leggere questa pagina'}
          </button>

          {/* Collapsible guide */}
          {showGuide && (
            <div className="rounded-lg border border-blue-200 bg-blue-50/60 dark:bg-blue-950/10 dark:border-blue-800 p-4 text-sm space-y-3">
              <p className="font-medium text-gray-700 dark:text-gray-300">Come leggere la tabella</p>
              <ul className="space-y-1.5 text-gray-600 dark:text-gray-400 text-xs list-disc list-inside">
                <li><span className="font-medium">Budget/anno</span> — il tetto annuale impostato (budget/mese × 12). Di default corrisponde al totale speso l&apos;anno precedente.</li>
                <li><span className="font-medium text-blue-600 dark:text-blue-400">{currentYear}</span> — quanto hai speso finora nell&apos;anno corrente.</li>
                <li><span className="font-medium text-amber-600 dark:text-amber-400">{currentYear - 1}</span> — totale speso nell&apos;anno precedente.</li>
                <li><span className="font-medium">vs {currentYear - 1}</span> — variazione % rispetto all&apos;anno scorso (verde = stai spendendo meno, rosso = di più).</li>
                <li><span className="font-medium text-purple-600 dark:text-purple-400">Media storica</span> — media annuale dal {historyStartYear} al {currentYear - 1}.</li>
                <li><span className="font-medium">Avanzamento</span> — spesa corrente ÷ budget/anno. Verde &lt;80%, arancione 80–100%, rosso oltre.</li>
                <li>Clicca sull&apos;intestazione di una sezione per espanderla o collassarla.</li>
                <li>Clicca una voce per aprire l&apos;analisi storica anno per anno con dettaglio mensile.</li>
              </ul>
              <p className="text-xs text-gray-400">Per le <span className="font-medium">Entrate</span> i colori sono invertiti: verde = entrate in crescita.</p>
            </div>
          )}

          {/* Mobile/tablet notice — budget table has 7-8 columns, desktop is recommended */}
          <div className="desktop:hidden rounded-md border border-amber-200 bg-amber-50/50 dark:bg-amber-950/10 dark:border-amber-800 p-3 flex items-start gap-2 text-sm text-amber-700 dark:text-amber-400">
            <Info className="h-4 w-4 flex-shrink-0 mt-0.5" />
            <span>Per la miglior esperienza si consiglia la visualizzazione su desktop. La tabella è comunque navigabile scorrendo orizzontalmente.</span>
          </div>

          <Card>
            <CardContent className="pt-6">
              <AnnualTable />
            </CardContent>
          </Card>

          <CategoryDeepDive />

          <p className="text-xs text-gray-400 flex items-center gap-1">
            <Info className="h-3 w-3" />
            Avanzamento calcolato sul budget annuale (budget/mese × 12). · Clicca una voce per l&apos;analisi storica mensile.
          </p>
        </>
      )}
    </div>
  );
}
