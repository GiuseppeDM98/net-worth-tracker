'use client';

/**
 * CashflowKpiCarousel — reusable KPI grid for cashflow data.
 *
 * Renders the cashflow KPIs (Entrate, Spese, Risparmio Netto, Rapporto) plus a
 * "Spese per categorie" cell that opens a bottom-sheet drawer.
 *
 * The layout is **container-query responsive** (it adapts to the width of the
 * nearest `@container` ancestor, NOT the viewport):
 *   - narrow container  → 2×2 grid + full-width "categorie" cell below
 *   - wide container (≥ `@2xl`) → single row of 4 KPIs; the "categorie" cell is
 *     hidden because the wide consumer (CashflowWidget) shows an inline breakdown.
 *
 * IMPORTANT: every consumer must wrap this component in an element with the
 * `@container` class, otherwise the `@2xl:` variants never trigger.
 */

import React, { useState } from 'react';
import { HelpCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import { type CategoryBreakdownItem } from '../CategoryBreakdownList';
import { coverageHealthLabel } from './CashflowWidget';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { ExpenseCategory } from '@/types/expenses';
import { CashflowCategoryDrawer } from './CashflowCategoryDrawer';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getDeltaColorClass(delta: number, invert = false): string {
  if (delta === 0) return 'text-muted-foreground';
  const positive = invert ? delta < 0 : delta > 0;
  return positive ? 'text-positive' : 'text-destructive';
}

function getDeltaArrow(delta: number): string {
  if (delta > 0) return '↑';
  if (delta < 0) return '↓';
  return '→';
}

function getRatioColorClass(ratio: number | null): string {
  if (ratio === null) return 'text-muted-foreground';
  if (ratio >= 1.3) return 'text-positive';
  if (ratio >= 1.0) return 'text-amber-500 dark:text-amber-400';
  return 'text-destructive';
}

/** Grey for 0, positive token for positive, destructive for negative. */
function getEuroColor(value: number): string {
  if (value === 0) return 'text-muted-foreground';
  return value > 0 ? 'text-positive' : 'text-destructive';
}

// ─── DeltaRow ─────────────────────────────────────────────────────────────────

interface DeltaRowProps {
  delta: number | null | undefined;
  /** When true, a negative delta is good (e.g. expenses going down). */
  invert?: boolean;
}

function DeltaRow({ delta, invert = false }: Readonly<DeltaRowProps>) {
  if (delta === null || delta === undefined) {
    return (
      <p className="text-muted-foreground mt-1.5 text-[11px] leading-none opacity-50">
        vs mese prec.
      </p>
    );
  }
  return (
    <p
      className={cn(
        'mt-1.5 text-[11px] leading-none font-medium',
        getDeltaColorClass(delta, invert),
      )}
    >
      {getDeltaArrow(delta)} {Math.abs(delta).toFixed(1)}% vs prec.
    </p>
  );
}

// ─── KpiCell ──────────────────────────────────────────────────────────────────

interface KpiCellProps {
  label: string;
  /** The large primary value line. */
  children: React.ReactNode;
  /** The small third-line subtext. */
  subtext: React.ReactNode;
  /**
   * Optional explanation shown in a tappable info popover next to the label.
   * Used to disambiguate metrics whose meaning overlaps at a glance
   * (e.g. "Risparmio Netto" vs "Rapporto").
   */
  info?: React.ReactNode;
  /** When set, renders as an interactive `<button>` with press feedback. */
  onClick?: () => void;
  /** Accessible label — required when `onClick` is set. */
  'aria-label'?: string;
  className?: string;
}

/** A single flat grid cell. The parent grid provides the hairline dividers. */
function KpiCell({
  label,
  children,
  subtext,
  info,
  onClick,
  'aria-label': ariaLabel,
  className,
}: Readonly<KpiCellProps>) {
  const inner = (
    <>
      <div className="flex items-center gap-1">
        <p className="text-muted-foreground text-[11px] font-semibold tracking-wide uppercase">
          {label}
        </p>
        {/* Popover (not Tooltip) so the explanation is reachable on touch devices. */}
        {info && (
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-label={`Cosa significa ${label}`}
                className="text-muted-foreground hover:text-foreground inline-flex items-center justify-center transition-colors"
              >
                <HelpCircle className="h-3.5 w-3.5" />
              </button>
            </PopoverTrigger>
            <PopoverContent side="top" className="max-w-[15rem] text-xs leading-relaxed">
              {info}
            </PopoverContent>
          </Popover>
        )}
      </div>
      {children}
      {subtext}
    </>
  );

  // Each cell is its own `@container` so the value font can scale to the cell width
  // (4-column cells on tablet are much narrower than 2-column ones).
  const base = '@container min-w-0 bg-card p-4 @[220px]:p-5';

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label={ariaLabel}
        className={cn(
          base,
          'flex w-full flex-col text-left transition-transform duration-100 active:scale-[0.99]',
          className,
        )}
      >
        {inner}
      </button>
    );
  }

  return <div className={cn(base, className)}>{inner}</div>;
}

// ─── Props ────────────────────────────────────────────────────────────────────

export interface CashflowKpiCarouselProps {
  /** Gross income for the period (positive, EUR). */
  income: number;
  /** Gross expenses for the period (negative, EUR). Displayed as `Math.abs(expenses)`. */
  expenses: number;
  /** Net savings: `income + expenses`. Can be negative. */
  net: number;
  /** Coverage ratio `income / |expenses|`. `null` when expenses === 0 → chip shows "—". */
  ratio: number | null;
  /** Month-over-month income change (%). `null` = no prior month available. */
  incomeDelta?: number | null;
  /** Month-over-month expense change (%). `null` = no prior month. Colour is inverted (down = good). */
  expensesDelta?: number | null;
  /** Savings rate 0–100. Shown as "X% del reddito" below the net savings value. */
  savingsRate: number;
  /** Aggregated expense categories for the period. Shown in the Categorie drawer. */
  expenseCategories: CategoryBreakdownItem[];
  /** Aggregated income categories for the period. Shown in the Categorie drawer. */
  incomeCategories: CategoryBreakdownItem[];
  /** Raw Firestore categories — used for icon/colour lookup in the drawer list. */
  categories: ExpenseCategory[];
  /** Class on the grid wrapper `<div>`. */
  className?: string;
  /** Controlled open state for the Categorie drawer. Omit to use internal state. */
  drawerOpen?: boolean;
  /** Called when the drawer requests an open/close transition. Required when `drawerOpen` is set. */
  onDrawerOpenChange?: (open: boolean) => void;
  /**
   * Visibility of the "Spese per categorie" drawer-trigger cell:
   *   - `'always'` (default): always shown full-width below the KPIs. Use when the
   *     consumer has no inline category breakdown (e.g. the mobile tracking view).
   *   - `'mobile-only'`: hidden from `tablet:` up, where the consumer shows an inline
   *     breakdown instead (e.g. CashflowWidget on tablet/desktop).
   */
  categoriesCell?: 'always' | 'mobile-only';
}

// ─── Card data ────────────────────────────────────────────────────────────────

interface KpiCardData {
  id: string;
  label: string;
  displayValue: string;
  valueClassName: string;
  subtext: React.ReactNode;
  /** Optional disambiguation copy rendered in the label's info popover. */
  info?: React.ReactNode;
  onClick?: () => void;
  ariaLabel?: string;
}

// Font size scales to the cell's own width (container query) so large amounts
// like "+523.677,51 €" don't overflow narrow 4-column cells on tablet.
const VALUE_CLASS =
  'mt-1.5 font-mono font-bold leading-none tabular-nums break-words text-base @[150px]:text-lg @[190px]:text-xl @[240px]:text-2xl';

// ─── Component ────────────────────────────────────────────────────────────────

export function CashflowKpiCarousel({
  income,
  expenses,
  net,
  ratio,
  incomeDelta,
  expensesDelta,
  savingsRate,
  expenseCategories,
  incomeCategories,
  categories,
  className,
  drawerOpen,
  onDrawerOpenChange,
  categoriesCell = 'always',
}: Readonly<CashflowKpiCarouselProps>) {
  const [internalDrawerOpen, setInternalDrawerOpen] = useState(false);
  const catDrawerOpen = drawerOpen ?? internalDrawerOpen;
  const setCatDrawerOpen = onDrawerOpenChange ?? setInternalDrawerOpen;

  const cards: KpiCardData[] = [
    {
      id: 'entrate',
      label: 'Entrate',
      displayValue: cachedFormatCurrencyEUR(income),
      valueClassName: income === 0 ? 'text-muted-foreground' : 'text-positive',
      subtext: <DeltaRow delta={incomeDelta} />,
    },
    {
      id: 'spese',
      label: 'Spese',
      displayValue: cachedFormatCurrencyEUR(Math.abs(expenses)),
      valueClassName: expenses === 0 ? 'text-muted-foreground' : 'text-destructive',
      subtext: <DeltaRow delta={expensesDelta} invert />,
    },
    {
      id: 'netto',
      label: 'Risparmio Netto',
      displayValue: `${net > 0 ? '+' : ''}${cachedFormatCurrencyEUR(net)}`,
      valueClassName: getEuroColor(net),
      subtext: (
        <p className="text-muted-foreground mt-1.5 text-[11px] leading-none">
          {savingsRate.toFixed(1)}% del reddito
        </p>
      ),
      info: (
        <>
          Quanto hai messo da parte nel periodo: entrate − spese. La percentuale è la quota di
          reddito risparmiata.
        </>
      ),
    },
    {
      id: 'rapporto',
      label: 'Rapporto',
      displayValue: ratio === null ? '—' : `${ratio.toFixed(2)}×`,
      valueClassName: getRatioColorClass(ratio),
      subtext: (
        <p className="text-muted-foreground mt-1.5 text-[11px] leading-none">
          {ratio === null ? 'Nessun dato' : coverageHealthLabel(ratio)}
        </p>
      ),
      info: (
        <>
          Quante volte le entrate coprono le spese (entrate ÷ spese). 1,0× = pareggio; sopra 1 =
          avanzo.
        </>
      ),
    },
    {
      id: 'categorie',
      label: 'Spese per categorie',
      displayValue: expenseCategories.length > 0 ? String(expenseCategories.length) : 'Nessuna',
      valueClassName: 'text-foreground',
      subtext: (
        <p className="text-muted-foreground mt-1.5 text-[11px] leading-none">Vedi dettaglio →</p>
      ),
      onClick: () => setCatDrawerOpen(true),
      ariaLabel: 'Apri dettaglio categorie',
    },
  ];

  return (
    <>
      <div
        className={cn(
          'border-border bg-border grid grid-cols-2 gap-px overflow-hidden rounded-xl border',
          '@2xl:grid-cols-4',
          className,
        )}
        aria-label="Riepilogo cashflow"
      >
        {cards.map((card) => {
          // The "categorie" cell always spans the full row, below the KPIs.
          // In 'mobile-only' mode it is hidden from `tablet:` up, where the consumer
          // renders an inline category breakdown instead.
          const categorieClass =
            categoriesCell === 'mobile-only'
              ? 'col-span-2 @2xl:col-span-4 tablet:hidden'
              : 'col-span-2 @2xl:col-span-4';
          return (
            <KpiCell
              key={card.id}
              label={card.label}
              info={card.info}
              onClick={card.onClick}
              aria-label={card.ariaLabel}
              subtext={card.subtext}
              className={card.id === 'categorie' ? categorieClass : undefined}
            >
              <p className={cn(VALUE_CLASS, card.valueClassName)}>{card.displayValue}</p>
            </KpiCell>
          );
        })}
      </div>

      <CashflowCategoryDrawer
        open={catDrawerOpen}
        onOpenChange={setCatDrawerOpen}
        expenseCategories={expenseCategories}
        incomeCategories={incomeCategories}
        categories={categories}
      />
    </>
  );
}
