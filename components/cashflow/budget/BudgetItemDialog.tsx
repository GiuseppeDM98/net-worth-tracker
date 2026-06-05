'use client';

import { useMemo, useState } from 'react';
import { ResponsiveModal } from '@/components/ui/responsive-modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { BudgetItem, BudgetKind, BudgetPeriod } from '@/types/budget';
import { Expense, ExpenseCategory } from '@/types/expenses';
import {
  budgetItemKey,
  categoryKind,
  getDefaultAmount,
  validateBudgetAllocation,
} from '@/lib/utils/budgetUtils';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';

const NONE = '__none__';

interface BudgetItemDialogProps {
  open: boolean;
  onClose: () => void;
  categories: ExpenseCategory[];
  allExpenses: Expense[];
  historyStartYear: number;
  existingItems: BudgetItem[];
  overallMonthlyAmount: number | undefined;
  editingItem: BudgetItem | null;
  onSubmit: (item: BudgetItem) => void;
}

/**
 * Create or edit a single budget item.
 *
 * Create: pick a kind (Spesa/Entrata → filters categories), a category and an
 * optional subcategory; the amount is pre-filled from last year's average.
 * Edit: identity is locked — only the monthly amount is editable.
 *
 * For expense category budgets, when an overall budget is set, an amount that
 * would push the total over the available headroom is blocked (issue #148 rule).
 */
export function BudgetItemDialog({
  open,
  onClose,
  categories,
  allExpenses,
  historyStartYear,
  existingItems,
  overallMonthlyAmount,
  editingItem,
  onSubmit,
}: BudgetItemDialogProps) {
  const isEdit = editingItem !== null;

  const [kind, setKind] = useState<BudgetKind>(editingItem?.kind ?? 'expense');
  const [period, setPeriod] = useState<BudgetPeriod>(editingItem?.period ?? 'monthly');
  const [categoryId, setCategoryId] = useState<string>(editingItem?.categoryId ?? NONE);
  const [subCategoryId, setSubCategoryId] = useState<string>(editingItem?.subCategoryId ?? NONE);
  const [amount, setAmount] = useState<string>(
    editingItem ? String(editingItem.amount) : ''
  );

  const filteredCategories = useMemo(
    () => categories.filter((c) => categoryKind(c) === kind),
    [categories, kind]
  );

  const selectedCategory = categories.find((c) => c.id === categoryId);

  // Headroom left under the (monthly) overall budget, excluding the item being
  // edited. Only monthly expense budgets consume it — annual budgets don't.
  const available = useMemo(() => {
    if (kind !== 'expense' || period !== 'monthly' || overallMonthlyAmount == null) return null;
    const others = existingItems.filter((i) => i.id !== editingItem?.id);
    return validateBudgetAllocation(others, overallMonthlyAmount).available;
  }, [kind, period, overallMonthlyAmount, existingItems, editingItem]);

  const parsedAmount = parseFloat(amount);
  const amountValid = !isNaN(parsedAmount) && parsedAmount >= 0;

  // A subcategory budget is a slice within its parent and is excluded from the
  // overall-allocation sum, so it is never blocked by the available headroom.
  const isWholeCategory = subCategoryId === NONE;
  const exceedsOverall =
    available != null && isWholeCategory && amountValid && parsedAmount > available;

  // Prevent two budgets for the same target.
  const duplicate = useMemo(() => {
    if (categoryId === NONE) return false;
    const key = budgetItemKey({
      scope: subCategoryId === NONE ? 'category' : 'subcategory',
      categoryId,
      subCategoryId: subCategoryId === NONE ? undefined : subCategoryId,
    });
    return existingItems.some((i) => i.id !== editingItem?.id && budgetItemKey(i) === key);
  }, [categoryId, subCategoryId, existingItems, editingItem]);

  const canSubmit =
    amountValid &&
    !exceedsOverall &&
    !duplicate &&
    (isEdit || (categoryId !== NONE && selectedCategory != null));

  function handleCategoryChange(id: string) {
    setCategoryId(id);
    setSubCategoryId(NONE);
    // Pre-fill the amount from history when the user hasn't typed one yet.
    if (id !== NONE && amount === '') {
      const cat = categories.find((c) => c.id === id);
      if (cat) {
        const suggested = getDefaultAmount(
          { kind, scope: 'category', categoryId: id },
          allExpenses,
          historyStartYear,
          period
        );
        if (suggested > 0) setAmount(String(Math.round(suggested)));
      }
    }
  }

  function handleSubmit() {
    if (!canSubmit) return;

    if (isEdit && editingItem) {
      onSubmit({ ...editingItem, amount: parsedAmount });
      onClose();
      return;
    }

    const cat = selectedCategory!;
    const sub = isWholeCategory ? undefined : cat.subCategories.find((s) => s.id === subCategoryId);
    const maxOrder = existingItems
      .filter((i) => i.kind === kind && i.period === period)
      .reduce((max, i) => Math.max(max, i.order), -1);

    onSubmit({
      id: crypto.randomUUID(),
      kind,
      period,
      scope: isWholeCategory ? 'category' : 'subcategory',
      categoryId: cat.id,
      categoryName: cat.name,
      subCategoryId: sub?.id,
      subCategoryName: sub?.name,
      amount: parsedAmount,
      order: maxOrder + 1,
    });
    onClose();
  }

  const lockedLabel = editingItem
    ? `${editingItem.categoryName ?? ''}${editingItem.subCategoryName ? ` › ${editingItem.subCategoryName}` : ''}`
    : '';

  const footer = (
    <div className="flex gap-2 justify-end">
      <Button variant="outline" onClick={onClose}>Annulla</Button>
      <Button onClick={handleSubmit} disabled={!canSubmit}>
        {isEdit ? 'Salva' : 'Aggiungi'}
      </Button>
    </div>
  );

  return (
    <ResponsiveModal
      open={open}
      onClose={onClose}
      title={isEdit ? 'Modifica budget' : 'Nuovo budget'}
      description="Imposta un limite di spesa per categoria o un obiettivo di entrata."
      headerExtra={
        isEdit ? (
          <Badge variant="outline">
            {kind === 'income' ? 'Entrata' : 'Spesa'} · {period === 'annual' ? 'Annuale' : 'Mensile'}
          </Badge>
        ) : undefined
      }
      footer={footer}
      dialogClassName="max-w-md"
    >
      <div className="space-y-4">
        {!isEdit && (
          <div className="space-y-2">
            <Label>Tipo</Label>
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Tipo di budget">
              {(['expense', 'income'] as BudgetKind[]).map((k) => (
                <button
                  key={k}
                  type="button"
                  role="radio"
                  aria-checked={kind === k}
                  onClick={() => {
                    setKind(k);
                    setCategoryId(NONE);
                    setSubCategoryId(NONE);
                  }}
                  className={`rounded-lg border px-3 py-2 text-sm transition-colors ${
                    kind === k ? 'border-primary bg-primary/5 font-medium' : 'border-border hover:border-primary/40'
                  }`}
                >
                  {k === 'expense' ? 'Spesa' : 'Entrata'}
                </button>
              ))}
            </div>
          </div>
        )}

        {!isEdit && (
          <div className="space-y-2">
            <Label>Periodo</Label>
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Periodo del budget">
              {(['monthly', 'annual'] as BudgetPeriod[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  role="radio"
                  aria-checked={period === p}
                  onClick={() => setPeriod(p)}
                  className={`rounded-lg border px-3 py-2 text-sm transition-colors ${
                    period === p ? 'border-primary bg-primary/5 font-medium' : 'border-border hover:border-primary/40'
                  }`}
                >
                  {p === 'monthly' ? 'Mensile' : 'Annuale'}
                </button>
              ))}
            </div>
          </div>
        )}

        {isEdit ? (
          <div className="space-y-1.5">
            <Label>Categoria</Label>
            <div className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm">{lockedLabel}</div>
          </div>
        ) : (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="budget-category">Categoria</Label>
              <Select value={categoryId} onValueChange={handleCategoryChange}>
                <SelectTrigger id="budget-category">
                  <SelectValue placeholder="Seleziona categoria" />
                </SelectTrigger>
                <SelectContent>
                  {filteredCategories.length === 0 && (
                    <div className="px-2 py-1.5 text-sm text-muted-foreground">Nessuna categoria</div>
                  )}
                  {filteredCategories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedCategory && selectedCategory.subCategories.length > 0 && (
              <div className="space-y-1.5">
                <Label htmlFor="budget-subcategory">Sottocategoria (opzionale)</Label>
                <Select value={subCategoryId} onValueChange={setSubCategoryId}>
                  <SelectTrigger id="budget-subcategory">
                    <SelectValue placeholder="Tutta la categoria" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Tutta la categoria</SelectItem>
                    {selectedCategory.subCategories.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="budget-amount">Importo {period === 'annual' ? 'annuale' : 'mensile'} (€)</Label>
          <Input
            id="budget-amount"
            type="number"
            inputMode="decimal"
            min={0}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0"
            className="font-mono tabular-nums"
          />
          {available != null && isWholeCategory && (
            <p className="text-xs text-muted-foreground">
              Disponibile sotto il budget complessivo:{' '}
              <span className="font-mono tabular-nums">{cachedFormatCurrencyEUR(Math.max(0, available))}</span>
            </p>
          )}
        </div>

        {exceedsOverall && (
          <p className="text-xs text-destructive">
            L&apos;importo supera il budget complessivo disponibile.
          </p>
        )}
        {duplicate && (
          <p className="text-xs text-destructive">Esiste già un budget per questa voce.</p>
        )}
      </div>
    </ResponsiveModal>
  );
}
