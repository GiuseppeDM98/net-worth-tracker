'use client';

/**
 * TransactionFeed — the canonical transaction list for the Cashflow "Tracciamento" tab.
 *
 * The redesign collapses the two old list paradigms (desktop = paginated 8-column table,
 * mobile = day-grouped feed) into ONE pattern shared by both surfaces, so a movement, its
 * delete model, and its temporal rhythm read identically everywhere. Desktop keeps the
 * dense `ExpenseTable` available behind a "Vista tabella" toggle, but this feed is the
 * default on both.
 *
 * Tapping a row opens its detail — a `ResponsiveModal` `sm`, so a bottom sheet on a phone and a
 * centred dialog above, in the app's one modal vocabulary (doc/guide/dialog.md) — with edit and
 * delete. The delete ARMS in the footer and the reading prints what the second press does to
 * the account; a row of an instalment plan or a recurring series does not arm, because its
 * delete is a choice and the choice is `SeriesDeleteDialog`, opened by the parent. The detail
 * names the account a row moves and WHEN (on its own date, lib/utils/cashSettlement.ts), and a
 * series row offers «Collega la serie…» (`LinkSeriesDialog`, also the parent's). When
 * `grouped` is true, rows are bucketed by day with Oggi / Ieri / "EEE d MMM" headers;
 * otherwise they render as one flat list.
 */

import { Suspense, useMemo, useRef, useState } from 'react';
import { format, subDays } from 'date-fns';
import { it } from 'date-fns/locale';
import { Home, Link2, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ResponsiveModal } from '@/components/ui/responsive-modal';
import { EmptyState } from '@/components/ui/empty-state';
import { cn } from '@/lib/utils';
import { TILE_SUB_EYEBROW_CLASS } from '@/components/ui/tile';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import { getItalyDate } from '@/lib/utils/dateHelpers';
import { getExpenseDate } from '@/lib/utils/expenseHelpers';
import { describeRecurrence } from '@/lib/utils/recurrenceDates';
import { describeMovementDetailReading } from '@/lib/utils/dialogNarrative';
import { useArmedDelete } from '@/lib/hooks/useArmedDelete';
import { resolveSeriesDeleteMode } from '@/components/expenses/SeriesDeleteDialog';
import { isScheduledRow } from '@/lib/utils/tracciamentoSummary';
import { resolveOwnerLabel } from '@/lib/utils/movementsOwnerFilter';
import { appliedBalanceEffectsOf } from '@/lib/utils/cashSettlement';
import type { Expense, ExpenseType } from '@/types/expenses';
import { CompactExpenseRow } from '@/components/cashflow/CompactExpenseRow';
import type { LinkSeriesTarget } from '@/components/expenses/LinkSeriesDialog';
import { EXPENSE_TYPE_DOT_CLASS as TYPE_DOT_CLASS } from '@/lib/constants/expenseTypeColors';
import { LAZY_CATEGORY_ICONS } from '@/components/expenses/IconPickerPopover';

// ─── Italian type labels ───────────────────────────────────────────────────────

const EXPENSE_TYPE_LABELS: Record<ExpenseType, string> = {
  income: 'Entrata',
  fixed: 'Spesa fissa',
  variable: 'Spesa variabile',
  debt: 'Debito',
  transfer: 'Trasferimento',
};

// Module-level component, and the icon is a LOOKUP in the shared map, never a call: a
// component obtained from a call during render is a new type every render to the React
// Compiler (`react-hooks/static-components`), which would remount it and reset Suspense.
function TransactionDetailIcon({
  iconName,
  color,
  type,
}: {
  iconName?: string;
  color?: string;
  type: ExpenseType;
}) {
  const Icon = iconName ? LAZY_CATEGORY_ICONS[iconName] : undefined;
  const dot = (
    <span className={cn('h-2.5 w-2.5 rounded-full', TYPE_DOT_CLASS[type] ?? 'bg-muted-foreground')} />
  );
  return (
    <div
      className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg"
      style={{ backgroundColor: color ? `${color}20` : 'var(--muted)' }}
    >
      {Icon ? (
        <Suspense fallback={dot}>
          <Icon
            className="h-4.5 w-4.5"
            style={{ color: color || 'var(--muted-foreground)' }}
            aria-hidden="true"
          />
        </Suspense>
      ) : (
        dot
      )}
    </div>
  );
}

// ─── Transaction detail ────────────────────────────────────────────────────────

interface TransactionDetailModalProps {
  expense: Expense;
  open: boolean;
  now: Date;
  onClose: () => void;
  onEdit: (expense: Expense) => void;
  onDelete: (expense: Expense) => void;
  /** «Collega la serie…» on a series row; absent = the action is not offered. */
  onLinkSeries?: (expense: Expense, target: LinkSeriesTarget) => void;
  isDemo: boolean;
  categoryMetaMap: Map<string, { icon?: string; color?: string }>;
  memberNames: Map<string, string> | null;
  /** Cash account names by id, for the «Conto» row; absent = the row is not printed. */
  accountNames?: Map<string, string>;
  /**
   * Names of the properties a debt row can repay (lib/utils/mortgageRepayment.ts), for the «Mutuo»
   * row and «Collega la serie al mutuo…»; absent or empty = neither is offered.
   */
  propertyNames?: Map<string, string>;
}

/**
 * «Casa · capitale 412,30 €», «Casa · alla data della rata» — which property a mortgage
 * instalment repays and, once it has, by how much principal. A deleted one reads «immobile
 * eliminato».
 */
function describeDebtLink(expense: Expense, names: Map<string, string>): string | null {
  if (expense.type !== 'debt' || !expense.debtAssetId) return null;
  const name = names.get(expense.debtAssetId) ?? 'immobile eliminato';
  if (expense.balancePending) return `${name} · alla data della rata`;
  return expense.debtPrincipalRepaid !== undefined ? `${name} · capitale ${cachedFormatCurrencyEUR(expense.debtPrincipalRepaid)}` : name;
}

/**
 * «Conto BNL», «Conto BNL · si muove il 28 settembre», «Conto BNL → Carta» — which account(s) the
 * row moves and, while it waits for its date, when. A deleted account reads «conto eliminato».
 */
function describeAccounts(expense: Expense, names: Map<string, string>): string | null {
  const name = (id?: string) => (id ? (names.get(id) ?? 'conto eliminato') : null);
  const origin = name(expense.linkedCashAssetId);
  const destination = expense.type === 'transfer' ? name(expense.transferCashAssetId) : null;
  const accounts = origin && destination ? `${origin} → ${destination}` : (origin ?? destination);
  if (!accounts) return null;
  return expense.balancePending ? `${accounts} · si muove il ${format(getExpenseDate(expense.date), 'd MMMM', { locale: it })}` : accounts;
}

function TransactionDetailModal({
  expense,
  open,
  now,
  onClose,
  onEdit,
  onDelete,
  onLinkSeries,
  isDemo,
  categoryMetaMap,
  memberNames,
  accountNames,
  propertyNames,
}: Readonly<TransactionDetailModalProps>) {
  const deleteRef = useRef<HTMLButtonElement | null>(null);
  const { armed, onClick: onArmedClick, onBlur } = useArmedDelete(deleteRef, () => onDelete(expense));

  // «Disarmed» is a phase of ONE opening: settled during render (never in an effect), and
  // forgotten on close so the same row reopened starts from its idle reading.
  const [wasArmed, setWasArmed] = useState(false);
  if (armed && !wasArmed) setWasArmed(true);
  if (!open && wasArmed) setWasArmed(false);

  const isIncome = expense.type === 'income';
  const isTransfer = expense.type === 'transfer';
  const isSeries = resolveSeriesDeleteMode(expense) !== null;
  const scheduled = isScheduledRow(expense, now);
  const date = getExpenseDate(expense.date);
  const catMeta = categoryMetaMap.get(expense.categoryId);
  const rowName = expense.notes?.trim() || expense.categoryName;

  const amountLabel = `${isIncome ? '+' : ''}${cachedFormatCurrencyEUR(Math.abs(expense.amount))}`;

  // No «Note» row: the title IS the note, and the modal prints it whole (the raw drawer
  // truncated its title, which is the only reason the row used to repeat it).
  const details: { label: string; value: string }[] = [
    { label: 'Data', value: format(date, 'd MMMM yyyy', { locale: it }) },
    { label: 'Categoria', value: expense.categoryName },
  ];

  // The one line that says why this row is in the list and not in the totals above it. It
  // repeats the reading on purpose: the reading gives way to the consequence while armed.
  if (scheduled) {
    details.push({ label: 'Stato', value: 'In calendario — non ancora avvenuta' });
  }

  if (expense.subCategoryName) {
    details.push({ label: 'Sottocategoria', value: expense.subCategoryName });
  }
  const accounts = accountNames ? describeAccounts(expense, accountNames) : null;
  if (accounts) {
    details.push({ label: expense.type === 'transfer' ? 'Conti' : 'Conto', value: accounts });
  }
  const debtLink = propertyNames ? describeDebtLink(expense, propertyNames) : null;
  if (debtLink) {
    details.push({ label: 'Mutuo', value: debtLink });
  }
  if (expense.costCenterName) {
    details.push({ label: 'Centro di costo', value: expense.costCenterName });
  }
  // Only with Divisione on, and only for an attributed row: «in comune» is the silent default.
  const ownerLabel = memberNames ? resolveOwnerLabel(expense, memberNames) : null;
  if (ownerLabel) {
    details.push({ label: 'Intestatario', value: ownerLabel });
  }
  if (expense.isInstallment && expense.installmentNumber && expense.installmentTotal) {
    details.push({
      label: 'Rata',
      value: `${expense.installmentNumber} di ${expense.installmentTotal}${
        expense.installmentTotalAmount
          ? ` (totale ${cachedFormatCurrencyEUR(Math.abs(expense.installmentTotalAmount))})`
          : ''
      }`,
    });
  }
  const recurrenceDetail = describeRecurrence(
    expense.recurringFrequency,
    expense.recurringDay,
    expense.date
  );
  if (expense.isRecurring && recurrenceDetail) {
    details.push({ label: 'Ricorrenza', value: recurrenceDetail });
  }
  if (expense.link) {
    details.push({ label: 'Link', value: expense.link });
  }

  return (
    <ResponsiveModal
      open={open}
      onClose={onClose}
      width="sm"
      // The scope after the dot is the SINGULAR of the row's type (doc/guide/dialog.md).
      eyebrow={`Movimenti · ${EXPENSE_TYPE_LABELS[expense.type]}`}
      title={rowName}
      reading={describeMovementDetailReading({
        date,
        scheduled,
        phase: armed ? 'armed' : wasArmed ? 'disarmed' : 'idle',
        // A row still waiting for its date has moved nothing, so its delete gives nothing back.
        deletion: { type: expense.type, amount: expense.amount, hasAccount: appliedBalanceEffectsOf(expense).length > 0, hasFee: !!expense.transferFeeExpenseId },
      })}
      footer={
        <>
          <Button
            ref={deleteRef}
            type="button"
            variant={armed ? 'destructive' : 'outline'}
            className={cn(!armed && 'text-destructive hover:text-destructive')}
            onClick={isSeries ? () => onDelete(expense) : onArmedClick}
            onBlur={isSeries ? undefined : onBlur}
            disabled={isDemo}
            aria-pressed={isSeries ? undefined : armed}
            aria-label={
              isDemo
                ? 'Elimina — non disponibile in modalità demo'
                : isSeries
                  ? `Elimina ${rowName} o la sua serie`
                  : armed
                    ? `Premi di nuovo per eliminare ${rowName}`
                    : `Elimina ${rowName}`
            }
          >
            {!armed && <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" />}
            {/* The ellipsis is the convention for «this opens a question»: a series row never arms. */}
            {armed ? 'Premi di nuovo per eliminare' : isSeries ? 'Elimina…' : 'Elimina'}
          </Button>
          <Button
            type="button"
            onClick={() => onEdit(expense)}
            disabled={isDemo}
            aria-label={isDemo ? 'Modifica — non disponibile in modalità demo' : `Modifica ${rowName}`}
          >
            <Pencil className="mr-2 h-4 w-4" aria-hidden="true" />
            Modifica
          </Button>
        </>
      }
    >
      <div className="flex items-center gap-3">
        <TransactionDetailIcon iconName={catMeta?.icon} color={catMeta?.color} type={expense.type} />
        <p
          className={cn(
            'min-w-0 font-mono text-[22px] font-bold leading-none tabular-nums',
            scheduled
              ? 'text-muted-foreground'
              : isIncome
                ? 'text-positive'
                : isTransfer
                  ? 'text-foreground'
                  : 'text-destructive',
          )}
        >
          {amountLabel}
        </p>
      </div>

      {/* The row's facts as a summary block — `bg-muted`, never a card inside the modal. */}
      <dl className="mt-4 divide-y divide-border rounded-lg bg-muted px-4 text-[13px]">
        {details.map(({ label, value }) => (
          <div key={label} className="flex items-start justify-between gap-4 py-2.5">
            <dt className="shrink-0 text-muted-foreground">{label}</dt>
            <dd className="min-w-0 text-right font-medium break-words text-foreground">
              {label === 'Link' ? (
                <a
                  href={value}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="break-all text-primary underline underline-offset-2"
                >
                  {value.length > 40 ? `${value.slice(0, 40)}...` : value}
                </a>
              ) : (
                value
              )}
            </dd>
          </div>
        ))}
      </dl>
      {isSeries && onLinkSeries && !isDemo && (
        <Button type="button" variant="outline" size="sm" className="mt-3 h-11 w-full desktop:h-8" onClick={() => onLinkSeries(expense, 'account')}>
          <Link2 className="mr-2 h-4 w-4" aria-hidden="true" />
          {expense.isInstallment ? 'Collega il piano a un conto…' : 'Collega la serie a un conto…'}
        </Button>
      )}
      {/* A mortgage entered as a series before the property link existed: its occurrences still to
          come take the property here, each repaying its principal on its date. */}
      {isSeries && expense.type === 'debt' && onLinkSeries && !isDemo && propertyNames && propertyNames.size > 0 && (
        <Button type="button" variant="outline" size="sm" className="mt-2 h-11 w-full desktop:h-8" onClick={() => onLinkSeries(expense, 'debt')}>
          <Home className="mr-2 h-4 w-4" aria-hidden="true" />
          {expense.isInstallment ? 'Collega il piano al mutuo…' : 'Collega la serie al mutuo…'}
        </Button>
      )}
    </ResponsiveModal>
  );
}

// ─── Props ─────────────────────────────────────────────────────────────────────

export interface TransactionFeedProps {
  /** Full sorted list (not yet sliced). The feed slices to `showCount` internally. */
  transactions: Expense[];
  /**
   * The page's clock. A row dated after it is marked «in calendario» — the list carries
   * scheduled rows (instalments, recurring occurrences) that the figures above do not count.
   */
  now: Date;
  /** Total count before slicing, used for the load-more display. */
  totalCount: number;
  showCount: number;
  onLoadMore: () => void;
  /** When true, rows are grouped by day (use only when sorting by date). */
  grouped: boolean;
  onEdit: (expense: Expense) => void;
  onDelete: (expense: Expense) => void;
  /** «Collega la serie…» from a series row's detail; absent = not offered. */
  onLinkSeries?: (expense: Expense, target: LinkSeriesTarget) => void;
  /** Cash account names by id, for the detail's «Conto» row. */
  accountNames?: Map<string, string>;
  /** Property names by id, for the detail's «Mutuo» row and «Collega la serie al mutuo…». */
  propertyNames?: Map<string, string>;
  isDemo: boolean;
  hasActiveFilters: boolean;
  /** Map of categoryId → { icon?, color? } for row icon badges. */
  categoryMetaMap: Map<string, { icon?: string; color?: string }>;
  /**
   * memberId → name for the owner chip and the detail row; null when Divisione is off, so no
   * row is ever labelled by a feature the account does not use.
   */
  memberNames?: Map<string, string> | null;
  /** Hint shown in the empty state when no filters are active. */
  emptyHint?: string;
  /**
   * How each day-group is framed:
   *   - `'card'` (default): a standalone rounded card per day. Use on mobile, where the
   *     feed sits directly on the page background.
   *   - `'flat'`: plain `divide-y` rows with no inner card chrome. Use on desktop, where
   *     the feed already lives inside a Card (a card-in-card would be box-within-box).
   */
  surface?: 'card' | 'flat';
  className?: string;
}

// ─── Component ─────────────────────────────────────────────────────────────────

export function TransactionFeed({
  transactions,
  now,
  totalCount,
  showCount,
  onLoadMore,
  grouped,
  onEdit,
  onDelete,
  onLinkSeries,
  accountNames,
  propertyNames,
  isDemo,
  hasActiveFilters,
  categoryMetaMap,
  memberNames = null,
  emptyHint = 'Nessun movimento registrato nel periodo: aggiungi la prima voce per iniziare a tracciare.',
  surface = 'card',
  className,
}: Readonly<TransactionFeedProps>) {
  // The row stays with its detail after a close, so the modal animates out on its content
  // instead of unmounting on an empty shell.
  const [detail, setDetail] = useState<{ expense: Expense; open: boolean } | null>(null);
  const closeDetail = () => setDetail((current) => (current ? { ...current, open: false } : current));

  // Slice the visible window.
  const sliced = useMemo(() => transactions.slice(0, showCount), [transactions, showCount]);

  // Bucket by day with Oggi / Ieri / "EEE d MMM" labels; flat when not grouped.
  const dateGroups = useMemo(() => {
    if (!grouped) {
      return [{ label: null as string | null, items: sliced }];
    }

    const todayDate = getItalyDate(new Date());
    const yesterdayDate = subDays(todayDate, 1);
    const todayStr = format(todayDate, 'yyyy-MM-dd');
    const yesterdayStr = format(yesterdayDate, 'yyyy-MM-dd');

    const groupMap = new Map<string, Expense[]>();
    for (const expense of sliced) {
      const key = format(getExpenseDate(expense.date), 'yyyy-MM-dd');
      if (!groupMap.has(key)) groupMap.set(key, []);
      groupMap.get(key)!.push(expense);
    }

    return Array.from(groupMap.entries()).map(([key, items]) => {
      let label: string;
      if (key === todayStr) {
        label = 'Oggi';
      } else if (key === yesterdayStr) {
        label = 'Ieri';
      } else {
        const [y, m, d] = key.split('-').map(Number);
        label = format(new Date(y, m - 1, d), 'EEE d MMM', { locale: it });
      }
      return { label, items };
    });
  }, [sliced, grouped]);

  if (transactions.length === 0) {
    return (
      <EmptyState
        className={className}
        message={
          hasActiveFilters
            ? 'Nessun movimento passa i filtri applicati: azzerali per rivedere il periodo intero.'
            : emptyHint
        }
      />
    );
  }

  return (
    <div className={cn('space-y-5', className)}>
      {dateGroups.map((group, idx) => (
        <div key={group.label ?? idx}>
          {/* Date group header */}
          {group.label !== null && (
            <p className={cn(TILE_SUB_EYEBROW_CLASS, 'mb-2 pl-1 font-mono tabular-nums')}>{group.label}</p>
          )}

          {/* All rows for this date. On mobile a standalone card; on desktop flat rows,
              since the feed already sits inside the list Card. */}
          <div
            className={cn(
              'divide-border/40 divide-y',
              surface === 'card' && 'bg-card ring-border/10 overflow-hidden rounded-2xl ring-1',
            )}
          >
            {group.items.map((expense) => {
              const catMeta = categoryMetaMap.get(expense.categoryId);
              return (
                <div key={expense.id} className="px-2">
                  <CompactExpenseRow
                    expense={expense}
                    onSelect={(selected) => setDetail({ expense: selected, open: true })}
                    categoryIcon={catMeta?.icon}
                    categoryColor={catMeta?.color}
                    scheduled={isScheduledRow(expense, now)}
                    ownerLabel={memberNames ? resolveOwnerLabel(expense, memberNames) : null}
                  />
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {/* Load more */}
      {showCount < totalCount && (
        <div className="pt-2 text-center">
          <Button variant="outline" size="sm" onClick={onLoadMore}>
            Carica altri {Math.min(20, totalCount - showCount)}
          </Button>
          <p className="text-muted-foreground mt-2 font-mono text-xs tabular-nums">
            {showCount} di {totalCount} voci
          </p>
        </div>
      )}

      {/* Detail — one edit/delete model for desktop and mobile. Keyed by row, so the armed
          state of one movement can never be read on the next one opened. */}
      {detail && (
        <TransactionDetailModal
          key={detail.expense.id}
          expense={detail.expense}
          open={detail.open}
          now={now}
          onClose={closeDetail}
          onEdit={(expense) => {
            closeDetail();
            onEdit(expense);
          }}
          onDelete={(expense) => {
            closeDetail();
            onDelete(expense);
          }}
          onLinkSeries={
            onLinkSeries
              ? (expense, target) => {
                  closeDetail();
                  onLinkSeries(expense, target);
                }
              : undefined
          }
          isDemo={isDemo}
          categoryMetaMap={categoryMetaMap}
          memberNames={memberNames}
          accountNames={accountNames}
          propertyNames={propertyNames}
        />
      )}
    </div>
  );
}
