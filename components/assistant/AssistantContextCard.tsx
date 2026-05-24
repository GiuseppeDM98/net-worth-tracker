'use client';

import { TrendingDown, TrendingUp, Minus, AlertCircle } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AssistantMonthContextBundle } from '@/types/assistant';
import { cn } from '@/lib/utils';
import { MONTH_NAMES } from '@/lib/constants/months';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';

const EASE_OUT_QUINT = [0.22, 1, 0.36, 1] as const;

/**
 * Returns a human-readable label for the period encoded in selector.
 * Duplicated from prompts.ts to avoid importing server-only code in this client component.
 *   month > 0  → "Marzo 2025"
 *   month === 0 → "Anno 2025"
 *   month === -1 → "YTD 2025"
 *   month === -2 → "Storico da 2020"
 */
function getPeriodLabel(selector: { year: number; month: number }): string {
  if (selector.month > 0) return `${MONTH_NAMES[selector.month - 1]} ${selector.year}`;
  if (selector.month === 0) return `Anno ${selector.year}`;
  if (selector.month === -1) return `YTD ${selector.year}`;
  if (selector.month === -2) return `Storico da ${selector.year}`;
  return `${selector.year}`;
}

/** Returns a "in progress" badge label for the period. */
function getPartialLabel(selector: { year: number; month: number }): string {
  if (selector.month > 0) return 'Mese in corso';
  if (selector.month === 0) return 'Anno in corso';
  return 'In corso';
}

const eur = (value: number) => cachedFormatCurrencyEUR(value, true);

function pct(value: number): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
}

interface KpiRowProps {
  label: string;
  value: string;
  positive?: boolean | null;
}

/** Flat divide-y row — no nested cards, no progress bars. */
function KpiRow({ label, value, positive }: KpiRowProps) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2.5">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span
        className={cn(
          'text-sm font-semibold tabular-nums font-mono',
          positive === true && 'text-green-600 dark:text-green-400',
          positive === false && 'text-red-600 dark:text-red-400',
          positive === null && 'text-foreground'
        )}
      >
        {value}
      </span>
    </div>
  );
}

/**
 * Skeleton for the context block while the bundle is being fetched.
 * Flat structure (no Card wrapper) — caller decides the container.
 */
export function AssistantContextCardSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn('animate-pulse space-y-0 overflow-hidden rounded-xl border border-border', className)}>
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="h-3 w-28 rounded bg-muted" />
        <div className="h-5 w-20 rounded bg-muted" />
      </div>
      {/* Hero row */}
      <div className="px-4 py-4 border-b border-border/50">
        <div className="h-3 w-24 rounded bg-muted mb-2" />
        <div className="h-7 w-32 rounded bg-muted" />
        <div className="h-3 w-40 rounded bg-muted mt-2" />
      </div>
      {/* KPI rows */}
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="flex justify-between px-4 py-2.5 border-b border-border/50 last:border-0">
          <div className="h-3 w-16 rounded bg-muted" />
          <div className="h-3 w-20 rounded bg-muted" />
        </div>
      ))}
    </div>
  );
}

interface AssistantContextCardProps {
  bundle: AssistantMonthContextBundle;
  className?: string;
  isLoading?: boolean;
}

/**
 * Numeric context block shown in the right sidebar during and after analysis.
 *
 * Flat design: no nested card-in-card. The variazione patrimonio is a dominant
 * text-2xl row at the top, followed by flat divide-y KPI rows for cashflow and
 * allocation changes. No rounded inner boxes — the outer container (caller-provided)
 * is the only visual boundary.
 *
 * Animation: content fades + slides up when periodLabel changes (period switch).
 */
export function AssistantContextCard({ bundle, className, isLoading }: AssistantContextCardProps) {
  const prefersReducedMotion = useReducedMotion();

  if (isLoading) {
    return <AssistantContextCardSkeleton className={className} />;
  }

  const { selector, netWorth, cashflow, allocationChanges, dataQuality } = bundle;
  const periodLabel = getPeriodLabel(selector);
  const deltaPositive = netWorth.delta !== null ? netWorth.delta >= 0 : null;

  const DeltaIcon =
    deltaPositive === true ? TrendingUp : deltaPositive === false ? TrendingDown : Minus;

  return (
    // AnimatePresence mode="wait": old content fades out before new one fades in on period change.
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={periodLabel}
        initial={{ opacity: 0, y: prefersReducedMotion ? 0 : 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: prefersReducedMotion ? 0 : -4 }}
        transition={{ duration: prefersReducedMotion ? 0 : 0.28, ease: EASE_OUT_QUINT }}
        className={cn('overflow-hidden rounded-xl border border-border', className)}
      >
        {/* Header: period label + partial badge */}
        <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Contesto {periodLabel}
          </p>
          {dataQuality.isPartialMonth && (
            <Badge variant="outline" className="text-[10px]">{getPartialLabel(selector)}</Badge>
          )}
        </div>

        {/* Hero: net worth delta as dominant value — no inner box, just prominent text */}
        <div className="border-b border-border/50 px-4 py-4">
          <p className="mb-1 text-xs uppercase tracking-widest text-muted-foreground/70">
            Variazione patrimonio
          </p>
          <div className="flex items-baseline gap-2">
            <DeltaIcon
              className={cn(
                'h-4 w-4 shrink-0 self-center',
                deltaPositive === true && 'text-green-600 dark:text-green-400',
                deltaPositive === false && 'text-red-600 dark:text-red-400',
                deltaPositive === null && 'text-muted-foreground'
              )}
            />
            <span
              className={cn(
                'text-2xl font-bold tabular-nums font-mono',
                deltaPositive === true && 'text-green-600 dark:text-green-400',
                deltaPositive === false && 'text-red-600 dark:text-red-400',
                deltaPositive === null && 'text-muted-foreground'
              )}
            >
              {netWorth.delta !== null ? eur(netWorth.delta) : 'N/D'}
            </span>
            {netWorth.deltaPct !== null && (
              <span className="text-sm text-muted-foreground tabular-nums">
                ({pct(netWorth.deltaPct)})
              </span>
            )}
          </div>
          {/* Start → end sub-row */}
          <div className="mt-1 flex gap-4 text-xs text-muted-foreground">
            <span>Inizio: {netWorth.start !== null ? eur(netWorth.start) : 'N/D'}</span>
            <span>Fine: {netWorth.end !== null ? eur(netWorth.end) : 'N/D'}</span>
          </div>
        </div>

        {/* Cashflow rows — flat divide-y, no inner border-box */}
        {dataQuality.hasCashflowData && (
          <div className="border-b border-border/50">
            <p className="px-4 pt-3 pb-1 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Cashflow
            </p>
            <div className="divide-y divide-border/50">
              <KpiRow
                label="Entrate"
                value={eur(cashflow.totalIncome)}
                positive={cashflow.totalIncome > 0 ? true : null}
              />
              <KpiRow
                label="Dividendi"
                value={eur(cashflow.totalDividends)}
                positive={cashflow.totalDividends > 0 ? true : null}
              />
              <KpiRow
                label="Uscite"
                value={eur(cashflow.totalExpenses)}
                positive={cashflow.totalExpenses >= 0 ? null : false}
              />
              <KpiRow
                label="Flusso netto"
                value={eur(cashflow.netCashFlow)}
                positive={cashflow.netCashFlow >= 0 ? true : false}
              />
            </div>
          </div>
        )}

        {/* Allocation changes — flat rows */}
        {allocationChanges.length > 0 && (
          <div className="border-b border-border/50">
            <p className="px-4 pt-3 pb-1 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Allocazione
            </p>
            <div className="divide-y divide-border/50">
              {allocationChanges.map((change) => (
                <div
                  key={change.assetClass}
                  className="flex items-center justify-between gap-2 px-4 py-2.5"
                >
                  <span className="truncate text-sm text-muted-foreground">
                    {change.assetClass}
                  </span>
                  <span
                    className={cn(
                      'text-sm font-semibold tabular-nums font-mono',
                      change.absoluteChange >= 0
                        ? 'text-green-600 dark:text-green-400'
                        : 'text-red-600 dark:text-red-400'
                    )}
                  >
                    {change.absoluteChange >= 0 ? '+' : ''}
                    {eur(change.absoluteChange)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Data quality notes */}
        {dataQuality.notes.length > 0 && (
          <div className="px-4 py-3">
            <Alert className="border-amber-200 bg-amber-50/50 py-2 dark:border-amber-800 dark:bg-amber-950/10">
              <AlertCircle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
              <AlertDescription className="ml-1 text-xs text-amber-700 dark:text-amber-400">
                {dataQuality.notes.map((note, i) => (
                  <span key={i} className="block">{note}</span>
                ))}
              </AlertDescription>
            </Alert>
          </div>
        )}

        {!dataQuality.hasSnapshot && !dataQuality.hasCashflowData && (
          <p className="px-4 py-4 text-center text-xs text-muted-foreground">
            Nessun dato disponibile per questo periodo.
          </p>
        )}
      </motion.div>
    </AnimatePresence>
  );
}

/**
 * Compact single-line context strip for mobile — sits inside the conversation header.
 * Shows net worth delta + percentage so the user always has the key number at a glance
 * without having to scroll to the full context block.
 */
export function AssistantContextPill({ bundle }: { bundle: AssistantMonthContextBundle }) {
  const { selector, netWorth } = bundle;
  const periodLabel = getPeriodLabel(selector);
  const deltaPositive = netWorth.delta !== null ? netWorth.delta >= 0 : null;

  return (
    <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">
      {periodLabel}
      {netWorth.delta !== null && (
        <>
          {' · '}
          <span
            className={cn(
              'font-medium',
              deltaPositive === true && 'text-green-600 dark:text-green-400',
              deltaPositive === false && 'text-red-600 dark:text-red-400',
            )}
          >
            {netWorth.delta >= 0 ? '+' : ''}{eur(netWorth.delta)}
          </span>
          {netWorth.deltaPct !== null && (
            <span className="ml-1 text-muted-foreground/70">({pct(netWorth.deltaPct)})</span>
          )}
        </>
      )}
    </p>
  );
}
