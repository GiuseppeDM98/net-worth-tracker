'use client';

/**
 * CashflowKpiCarousel — reusable KPI chip carousel for cashflow data.
 *
 * Renders five Embla carousel cards: Entrate, Spese, Risparmio Netto,
 * Rapporto, and a "Categorie" button that opens a bottom-sheet drawer.
 *
 * Pass `className` for the outer wrapper div (typically a negative-margin
 * bleed like "-mx-4" so the carousel extends to the screen or card edge).
 */

import React, { useState } from 'react';
import { Carousel, CarouselContent, CarouselItem } from '@/components/ui/carousel';
import { cn } from '@/lib/utils';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import { type CategoryBreakdownItem } from '../CategoryBreakdownList';
import { coverageHealthLabel } from './CashflowHeroCard';
import type { ExpenseCategory } from '@/types/expenses';
import { CashflowCategoryDrawer } from './CashflowCategoryDrawer';

// ─── Shadow token ─────────────────────────────────────────────────────────────

const CHIP_SHADOW =
  'shadow-[0_1px_3px_rgba(0,0,0,0.08),0_4px_16px_rgba(0,0,0,0.08),0_12px_28px_rgba(0,0,0,0.05)]' +
  ' dark:shadow-[0_1px_3px_rgba(0,0,0,0.30),0_4px_16px_rgba(0,0,0,0.28),0_12px_28px_rgba(0,0,0,0.20)]';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getDeltaColorClass(delta: number, invert = false): string {
  if (delta === 0) return 'text-muted-foreground';
  const positive = invert ? delta < 0 : delta > 0;
  return positive ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive';
}

function getDeltaArrow(delta: number): string {
  if (delta > 0) return '↑';
  if (delta < 0) return '↓';
  return '→';
}

function getRatioColorClass(ratio: number | null): string {
  if (ratio === null) return 'text-muted-foreground';
  if (ratio >= 1) return 'text-emerald-600 dark:text-emerald-400';
  return 'text-destructive';
}

/** Grey for 0, emerald for positive, destructive for negative. */
function getEuroColor(value: number): string {
  if (value === 0) return 'text-muted-foreground';
  return value > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive';
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
      {getDeltaArrow(delta)} {Math.abs(delta).toFixed(1)}% vs mese prec.
    </p>
  );
}

// ─── KpiChip ─────────────────────────────────────────────────────────────────

interface KpiChipProps {
  label: string;
  /** The large primary value line. */
  children: React.ReactNode;
  /** The small third-line subtext. */
  subtext: React.ReactNode;
  /** When set, renders as an interactive `<button>` with press feedback. */
  onClick?: () => void;
  /** Accessible label — required when `onClick` is set. */
  'aria-label'?: string;
}

function KpiChip({
  label,
  children,
  subtext,
  onClick,
  'aria-label': ariaLabel,
}: Readonly<KpiChipProps>) {
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label={ariaLabel}
        className={cn(
          'bg-card desktop:p-6 ring-border/20 h-full w-full rounded-2xl p-4 text-left ring-1 sm:p-5',
          'transition-transform duration-100 active:scale-[0.97]',
          CHIP_SHADOW,
        )}
      >
        <p className="text-muted-foreground text-[11px] font-semibold tracking-wide uppercase sm:text-xs">
          {label}
        </p>
        {children}
        {subtext}
      </button>
    );
  }

  return (
    <div
      className={cn(
        'bg-card desktop:p-6 ring-border/20 h-full rounded-2xl p-4 ring-1 sm:p-5',
        CHIP_SHADOW,
      )}
    >
      <p className="text-muted-foreground text-[11px] font-semibold tracking-wide uppercase sm:text-xs">
        {label}
      </p>
      {children}
      {subtext}
    </div>
  );
}

// ─── KpiCarouselItem ─────────────────────────────────────────────────────────

/** Carousel slot with fixed chip width. Wraps every KpiChip in the carousel. */
function KpiCarouselItem({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <CarouselItem className="desktop:basis-[240px] basis-[160px] pl-3 sm:basis-[200px]">
      {children}
    </CarouselItem>
  );
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
  /** Savings rate 0–100. Shown as "Tasso X%" below the net savings value. */
  savingsRate: number;
  /** Aggregated expense categories for the period. Shown in the Categorie drawer. */
  expenseCategories: CategoryBreakdownItem[];
  /** Aggregated income categories for the period. Shown in the Categorie drawer. */
  incomeCategories: CategoryBreakdownItem[];
  /** Raw Firestore categories — used for icon/colour lookup in the drawer list. */
  categories: ExpenseCategory[];
  /** Class on the outermost `<div>`. Typically a negative-margin bleed, e.g. `"-mx-4"`. */
  className?: string;
  /** Controlled open state for the Categorie drawer. Omit to use internal state. */
  drawerOpen?: boolean;
  /** Called when the drawer requests an open/close transition. Required when `drawerOpen` is set. */
  onDrawerOpenChange?: (open: boolean) => void;
}

// ─── Card data ────────────────────────────────────────────────────────────────

interface KpiCardData {
  id: string;
  label: string;
  displayValue: string;
  valueClassName: string;
  subtext: React.ReactNode;
  onClick?: () => void;
  ariaLabel?: string;
}

const VALUE_CLASS =
  'desktop:text-3xl mt-1.5 font-mono text-[21px] leading-none font-bold tabular-nums sm:text-2xl';

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
}: Readonly<CashflowKpiCarouselProps>) {
  const [internalDrawerOpen, setInternalDrawerOpen] = useState(false);
  const catDrawerOpen = drawerOpen ?? internalDrawerOpen;
  const setCatDrawerOpen = onDrawerOpenChange ?? setInternalDrawerOpen;

  const cards: KpiCardData[] = [
    {
      id: 'entrate',
      label: 'Entrate',
      displayValue: cachedFormatCurrencyEUR(income),
      valueClassName: getEuroColor(income),
      subtext: <DeltaRow delta={incomeDelta} />,
    },
    {
      id: 'spese',
      label: 'Spese',
      displayValue: cachedFormatCurrencyEUR(Math.abs(expenses)),
      valueClassName: getEuroColor(expenses),
      subtext: <DeltaRow delta={expensesDelta} invert />,
    },
    {
      id: 'netto',
      label: 'Risparmio Netto',
      displayValue: `${net > 0 ? '+' : ''}${cachedFormatCurrencyEUR(net)}`,
      valueClassName: getEuroColor(net),
      subtext: (
        <p className="text-muted-foreground mt-1.5 text-[11px] leading-none">
          Tasso {savingsRate.toFixed(1)}%
        </p>
      ),
    },
    {
      id: 'rapporto',
      label: 'Rapporto',
      displayValue: ratio === null ? '0×' : `${ratio.toFixed(2)}×`,
      valueClassName: getRatioColorClass(ratio),
      subtext: (
        <p className="text-muted-foreground mt-1.5 text-[11px] leading-none">
          {ratio === null ? 'Nessun dato' : coverageHealthLabel(ratio)}
        </p>
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
      <div className={className}>
        <Carousel
          opts={{ align: 'start', dragFree: true, containScroll: false }}
          className="w-full"
          aria-label="Riepilogo cashflow"
        >
          <CarouselContent viewportClassName="px-4 py-3 pb-6" className="items-stretch">
            {cards.map((card) => (
              <KpiCarouselItem key={card.id}>
                <KpiChip
                  label={card.label}
                  onClick={card.onClick}
                  aria-label={card.ariaLabel}
                  subtext={card.subtext}
                >
                  <p className={cn(VALUE_CLASS, card.valueClassName)}>{card.displayValue}</p>
                </KpiChip>
              </KpiCarouselItem>
            ))}
          </CarouselContent>
        </Carousel>
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
