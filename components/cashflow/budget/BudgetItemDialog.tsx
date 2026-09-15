'use client';

import { useMemo, useRef, useState } from 'react';
import { ResponsiveModal } from '@/components/ui/responsive-modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { cn } from '@/lib/utils';
import { describeFormRefusal, describeModalStatus, type ModalStatus } from '@/lib/utils/dialogNarrative';
import { describeBudgetAmountRefusal, describeBudgetDuplicateRefusal, describeBudgetItemCopy } from '@/lib/utils/budgetNarrative';

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

/** The two fields a refusal can point at; `aria-invalid` and the focus follow it. */
type RefusedField = 'category' | 'amount' | null;

/** The form controls at 44px on a phone and the dialog's 36px above it (AGENTS.md → Accessibility). */
const CONTROL_HEIGHT_CLASS = 'h-11 sm:h-9';

interface RadioChoiceOption<T extends string> {
  value: T;
  label: string;
}

/**
 * A two-way choice as a radio group with ONE tab stop: the checked option takes the focus,
 * the arrows move it (the ARIA radio pattern). Four `<button role="radio">` were four Tab
 * stops until 2026-09-14.
 */
function RadioChoice<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: ReadonlyArray<RadioChoiceOption<T>>;
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
}) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const move = (from: number, delta: number) => {
    const index = (from + delta + options.length) % options.length;
    onChange(options[index].value);
    refs.current[index]?.focus();
  };
  return (
    <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label={ariaLabel}>
      {options.map((option, index) => {
        const checked = option.value === value;
        return (
          <button
            key={option.value}
            ref={(el) => {
              refs.current[index] = el;
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={checked ? 0 : -1}
            onClick={() => onChange(option.value)}
            onKeyDown={(event) => {
              if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
                event.preventDefault();
                move(index, 1);
              } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
                event.preventDefault();
                move(index, -1);
              }
            }}
            className={cn(
              'min-h-11 rounded-lg border px-3 py-2 text-sm transition-colors sm:min-h-9',
              checked ? 'border-primary bg-primary/5 font-medium' : 'border-border hover:border-primary/40',
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

const KIND_OPTIONS: ReadonlyArray<RadioChoiceOption<BudgetKind>> = [
  { value: 'expense', label: 'Spesa' },
  { value: 'income', label: 'Entrata' },
];
const PERIOD_OPTIONS: ReadonlyArray<RadioChoiceOption<BudgetPeriod>> = [
  { value: 'monthly', label: 'Mensile' },
  { value: 'annual', label: 'Annuale' },
];

/**
 * Create or edit a single budget item.
 *
 * Create: pick a kind (Spesa/Entrata → filters categories), a category and an
 * optional subcategory; the amount is pre-filled from last year's average.
 * Edit: identity is locked — only the amount is editable.
 *
 * The reading line IS the form's status line (dialog.md → The Status-Is-The-Reading Rule):
 * idle it says what the form wants, and a refused submit lands there in Italian, marks the
 * field `aria-invalid` and moves the focus to it. The submit stays enabled, so a refusal is
 * always a sentence — until 2026-09-14 the button was simply `disabled` and two red
 * paragraphs sat under the amount while the reading kept its idle sentence.
 *
 * For expense category budgets, when an overall budget is set, an amount that
 * would push the total over the available headroom is refused (issue #148 rule).
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
  const [status, setStatus] = useState<ModalStatus>({ phase: 'idle' });
  const [refusedField, setRefusedField] = useState<RefusedField>(null);

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
  const amountMissing = amount.trim() === '' || Number.isNaN(parsedAmount);
  const amountInvalid = !amountMissing && parsedAmount < 0;

  // A subcategory budget is a slice within its parent and is excluded from the
  // overall-allocation sum, so it is never blocked by the available headroom.
  const isWholeCategory = subCategoryId === NONE;
  const exceedsOverall = available != null && isWholeCategory && !amountMissing && parsedAmount > available;

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

  const lockedLabel = editingItem
    ? `${editingItem.categoryName ?? ''}${editingItem.subCategoryName ? ` › ${editingItem.subCategoryName}` : ''}`
    : '';
  const targetLabel = selectedCategory
    ? `${selectedCategory.name}${!isWholeCategory ? ` › ${selectedCategory.subCategories.find((s) => s.id === subCategoryId)?.name ?? ''}` : ''}`
    : '';

  const reading = describeModalStatus(status, describeBudgetItemCopy({ kind, period, editingLabel: isEdit ? lockedLabel : null }));

  /** Any edit clears a standing refusal: the reading goes back to what the form wants. */
  const clearRefusal = () => {
    if (status.phase !== 'idle') setStatus({ phase: 'idle' });
    if (refusedField !== null) setRefusedField(null);
  };

  function handleCategoryChange(id: string) {
    clearRefusal();
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

  /** The refusal: one sentence in the reading line, the field marked, the focus on it. */
  function refuse(message: string, field: Exclude<RefusedField, null>) {
    setStatus({ phase: 'error', message });
    setRefusedField(field);
    document.getElementById(field === 'category' ? 'budget-category' : 'budget-amount')?.focus();
  }

  function handleSubmit() {
    // Named in the order the reader meets the fields.
    const missing: string[] = [];
    const invalid: string[] = [];
    if (!isEdit && (categoryId === NONE || selectedCategory == null)) missing.push('Categoria');
    if (amountMissing) missing.push('Importo');
    else if (amountInvalid) invalid.push('Importo');
    if (missing.length > 0 || invalid.length > 0) {
      refuse(describeFormRefusal(missing, invalid), missing[0] === 'Categoria' ? 'category' : 'amount');
      return;
    }
    if (duplicate) {
      refuse(describeBudgetDuplicateRefusal(targetLabel), 'category');
      return;
    }
    if (exceedsOverall && available != null) {
      refuse(describeBudgetAmountRefusal(available), 'amount');
      return;
    }

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

  const footer = (
    <>
      <Button variant="outline" onClick={onClose}>Annulla</Button>
      <Button onClick={handleSubmit}>{isEdit ? 'Salva' : 'Aggiungi'}</Button>
    </>
  );

  return (
    <ResponsiveModal
      open={open}
      onClose={onClose}
      // The badge that used to sit beside the title is the eyebrow's scope now: one label
      // register for one fact (DESIGN.md → The One-Eyebrow Rule).
      eyebrow={`Budget · ${kind === 'income' ? 'Entrata' : 'Spesa'} · ${period === 'annual' ? 'Annuale' : 'Mensile'}`}
      title={isEdit ? 'Modifica budget' : 'Nuovo budget'}
      reading={reading}
      footer={footer}
      width="md"
    >
      <div className="space-y-4">
        {!isEdit && (
          <div className="space-y-2">
            <Label>Tipo</Label>
            <RadioChoice
              options={KIND_OPTIONS}
              value={kind}
              ariaLabel="Tipo di budget"
              onChange={(k) => {
                clearRefusal();
                setKind(k);
                setCategoryId(NONE);
                setSubCategoryId(NONE);
              }}
            />
          </div>
        )}

        {!isEdit && (
          <div className="space-y-2">
            <Label>Periodo</Label>
            <RadioChoice
              options={PERIOD_OPTIONS}
              value={period}
              ariaLabel="Periodo del budget"
              onChange={(p) => {
                clearRefusal();
                setPeriod(p);
              }}
            />
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
                <SelectTrigger
                  id="budget-category"
                  className="data-[size=default]:h-11 sm:data-[size=default]:h-9"
                  aria-invalid={refusedField === 'category' ? true : undefined}
                >
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
                <Select
                  value={subCategoryId}
                  onValueChange={(id) => {
                    clearRefusal();
                    setSubCategoryId(id);
                  }}
                >
                  <SelectTrigger id="budget-subcategory" className="data-[size=default]:h-11 sm:data-[size=default]:h-9">
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
            onChange={(e) => {
              clearRefusal();
              setAmount(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleSubmit();
              }
            }}
            placeholder="0"
            aria-invalid={refusedField === 'amount' ? true : undefined}
            className={cn(CONTROL_HEIGHT_CLASS, 'font-mono tabular-nums')}
          />
          {available != null && isWholeCategory && (
            <p className="text-xs text-muted-foreground">
              Disponibile sotto il budget complessivo:{' '}
              <span className="font-mono tabular-nums">{cachedFormatCurrencyEUR(Math.max(0, available), true)}</span>
            </p>
          )}
        </div>
      </div>
    </ResponsiveModal>
  );
}
