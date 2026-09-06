'use client';

import { Suspense, type ComponentType, type LazyExoticComponent } from 'react';
import type { LucideProps } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import { getLazyIcon } from '@/components/expenses/IconPickerPopover';
import { CATEGORY_ICON_NAMES } from '@/lib/constants/categoryIcons';
import type { Expense, ExpenseType } from '@/types/expenses';

/**
 * Every category icon as a lazy component, resolved ONCE at module load through
 * `getLazyIcon`, so the feed, the drawer, the table and the picker share one cache and no
 * chunk is requested until an icon is rendered. In render an icon is a plain lookup: a
 * component obtained from a CALL during render is a new type every render to the React
 * Compiler (`react-hooks/static-components`), even when the callee caches it. This map and
 * `IconPickerPopover`'s `LAZY_ICONS` are two views over the same instances; they can be folded into one.
 */
export const LAZY_CATEGORY_ICONS: Partial<Record<string, LazyExoticComponent<ComponentType<LucideProps>>>> =
  Object.fromEntries(
    CATEGORY_ICON_NAMES.flatMap((name) => {
      const Icon = getLazyIcon(name);
      return Icon ? [[name, Icon] as const] : [];
    }),
  );

// Tailwind dot-color classes keyed by expense type.
// All entries use semantic token references to stay theme-aware across all 6 colour themes;
// income takes the sign token so it matches every other "gain" on the page.
export const TYPE_DOT_CLASS: Record<ExpenseType, string> = {
  income:   'bg-positive',
  fixed:    'bg-[var(--chart-1)]',
  variable: 'bg-[var(--chart-4)]',
  debt:     'bg-[var(--chart-3)]',
  transfer: 'bg-[var(--chart-5)]',
};

export interface CompactExpenseRowProps {
  expense: Expense;
  onSelect: (expense: Expense) => void;
  categoryIcon?: string;
  categoryColor?: string;
  /** The row is dated after today — listed, not yet happened. */
  scheduled?: boolean;
}

/**
 * Flat list row for mobile expense display (Trade Republic divide-y style).
 *
 * Tapping the row opens a detail bottom-sheet managed by the parent.
 *
 * A scheduled row (an instalment, a recurring occurrence dated ahead) takes an «In
 * calendario» chip and drops the sign colour on its amount: the sign tokens mean money
 * gained and money lost, and neither has happened yet.
 */
export function CompactExpenseRow({
  expense,
  onSelect,
  categoryIcon,
  categoryColor,
  scheduled = false,
}: Readonly<CompactExpenseRowProps>) {
  const isIncome = expense.type === 'income';
  const isTransfer = expense.type === 'transfer';

  const subtitle = [expense.categoryName, expense.subCategoryName || null]
    .filter(Boolean)
    .join(' · ');

  const title = expense.notes?.trim() || expense.categoryName;

  const amountLabel = `${isIncome ? '+' : isTransfer ? '' : ''}${cachedFormatCurrencyEUR(Math.abs(expense.amount))}`;

  return (
    <button
      type="button"
      className="w-full flex items-center gap-3 text-left py-1"
      onClick={() => onSelect(expense)}
      aria-label={`${title}, ${amountLabel}`}
    >
      {/* Category icon badge or type dot */}
      {(() => {
        const CatIcon = categoryIcon ? LAZY_CATEGORY_ICONS[categoryIcon] : undefined;
        if (CatIcon) {
          return (
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: categoryColor ? `${categoryColor}20` : 'var(--muted)' }}
            >
              <Suspense fallback={<span className={cn('w-2 h-2 rounded-full', TYPE_DOT_CLASS[expense.type] ?? 'bg-muted-foreground')} />}>
                <CatIcon className="w-3.5 h-3.5" style={{ color: categoryColor || 'var(--muted-foreground)' }} aria-hidden="true" />
              </Suspense>
            </div>
          );
        }
        return (
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: categoryColor ? `${categoryColor}20` : 'var(--muted)' }}
          >
            <span className={cn('w-2 h-2 rounded-full flex-shrink-0', TYPE_DOT_CLASS[expense.type] ?? 'bg-muted-foreground')} />
          </div>
        );
      })()}

      {/* Title + badges + subtitle */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-[14px] font-medium text-foreground truncate">{title}</span>
          {expense.isInstallment && expense.installmentNumber && expense.installmentTotal && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 flex-shrink-0 font-mono tabular-nums">
              {expense.installmentNumber}/{expense.installmentTotal}
            </Badge>
          )}
          {expense.isRecurring && !expense.isInstallment && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 flex-shrink-0">
              Ric.
            </Badge>
          )}
          {scheduled && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 flex-shrink-0 text-muted-foreground">
              In calendario
            </Badge>
          )}
        </div>
        <p className="text-[12px] text-muted-foreground truncate mt-0.5">{subtitle}</p>
      </div>

      {/* Amount — the sign tokens for income and spending, muted for a net-zero transfer
          and for anything that has not happened yet */}
      <span
        className={cn(
          'text-[14px] font-bold font-mono tabular-nums flex-shrink-0',
          scheduled || isTransfer
            ? 'text-muted-foreground'
            : isIncome
              ? 'text-positive'
              : 'text-destructive',
        )}
      >
        {amountLabel}
      </span>
    </button>
  );
}
