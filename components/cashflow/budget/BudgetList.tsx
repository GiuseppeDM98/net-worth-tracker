'use client';

import { useEffect, useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { BudgetItem } from '@/types/budget';
import { ExpenseCategory } from '@/types/expenses';
import { sectionWeight } from '@/lib/utils/budgetUtils';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import { progressFillColor, progressTextClass } from './budgetProgressStyle';

interface BudgetListProps {
  items: BudgetItem[];
  categories: ExpenseCategory[];
  // Period actual per item id (positive EUR): current month for monthly budgets,
  // year-to-date for annual budgets.
  actualById: Record<string, number>;
  isDemo: boolean;
  onEdit: (item: BudgetItem) => void;
  onDelete: (id: string) => void;
}

function itemLabel(item: BudgetItem): string {
  if (item.scope === 'subcategory') {
    return `${item.categoryName ?? ''} › ${item.subCategoryName ?? ''}`;
  }
  return item.categoryName ?? item.expenseType ?? '';
}

// Sort: expenses before income, then by section, then by user order.
function sortItems(items: BudgetItem[], categories: ExpenseCategory[]): BudgetItem[] {
  return [...items].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'expense' ? -1 : 1;
    const sw = sectionWeight(a, categories) - sectionWeight(b, categories);
    if (sw !== 0) return sw;
    return a.order - b.order;
  });
}

function BudgetRow({
  item,
  spent,
  isDemo,
  onEdit,
  onDelete,
}: {
  item: BudgetItem;
  spent: number;
  isDemo: boolean;
  onEdit: (item: BudgetItem) => void;
  onDelete: (id: string) => void;
}) {
  const [armed, setArmed] = useState(false);
  const inverted = item.kind === 'income';
  const ratio = item.amount > 0 ? spent / item.amount : 0;
  const pct = Math.round(ratio * 100);

  // 2-click delete: first click arms, auto-disarms after 3s.
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 3000);
    return () => clearTimeout(t);
  }, [armed]);

  return (
    <li className="py-3 first:pt-0 last:pb-0">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm truncate min-w-0">{itemLabel(item)}</span>
        <div className="flex items-center gap-1 shrink-0">
          <span className="text-sm font-mono tabular-nums">
            {cachedFormatCurrencyEUR(spent)}
            <span className="text-muted-foreground"> / {cachedFormatCurrencyEUR(item.amount)}</span>
          </span>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            disabled={isDemo}
            aria-label={`Modifica budget ${itemLabel(item)}`}
            onClick={() => onEdit(item)}
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className={`h-7 w-7 ${armed ? 'text-destructive' : ''}`}
            disabled={isDemo}
            aria-label={armed ? `Conferma eliminazione budget ${itemLabel(item)}` : `Elimina budget ${itemLabel(item)}`}
            onClick={() => (armed ? onDelete(item.id) : setArmed(true))}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <div
          role="progressbar"
          aria-valuenow={Math.min(100, pct)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Avanzamento ${itemLabel(item)}`}
          className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden"
        >
          <div
            className="h-full rounded-full"
            style={{ width: `${Math.min(100, ratio * 100)}%`, backgroundColor: progressFillColor(ratio, inverted) }}
          />
        </div>
        <span className={`text-xs font-mono tabular-nums w-10 text-right ${progressTextClass(ratio, inverted)}`}>
          {pct}%
        </span>
      </div>
    </li>
  );
}

/**
 * Opt-in budget list: only budgets the user created are shown, grouped into
 * Spese (expense ceilings) and Entrate (income targets), each a flat divide-y
 * list with a current-month progress bar and inline edit / 2-click delete.
 */
export function BudgetList({ items, categories, actualById, isDemo, onEdit, onDelete }: BudgetListProps) {
  const monthlyItems = sortItems(items.filter((i) => i.period === 'monthly'), categories);
  const annualItems = sortItems(items.filter((i) => i.period === 'annual'), categories);

  const renderGroup = (title: string, subtitle: string, group: BudgetItem[]) =>
    group.length > 0 && (
      <Card className="p-5">
        <div className="flex items-baseline justify-between mb-3">
          <h3 className="text-sm font-semibold">{title}</h3>
          <span className="text-xs text-muted-foreground">{subtitle}</span>
        </div>
        <ul className="divide-y divide-border">
          {group.map((item) => (
            <BudgetRow
              key={item.id}
              item={item}
              spent={actualById[item.id] ?? 0}
              isDemo={isDemo}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))}
        </ul>
      </Card>
    );

  return (
    <div className="space-y-4">
      {renderGroup('Budget mensili', 'questo mese', monthlyItems)}
      {renderGroup('Budget annuali', "quest'anno", annualItems)}
    </div>
  );
}
