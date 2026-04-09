'use client';

import { TrendingDown, TrendingUp, Minus, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AssistantMonthContextBundle } from '@/types/assistant';
import { cn } from '@/lib/utils';
import { MONTH_NAMES } from '@/lib/constants/months';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';

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

/**
 * Returns a human-readable "in progress" badge label for the period.
 */
function getPartialLabel(selector: { year: number; month: number }): string {
  if (selector.month > 0) return 'Mese in corso';
  if (selector.month === 0) return 'Anno in corso';
  return 'In corso';
}

// Reuse the module-level cached formatter instead of allocating a new
// Intl.NumberFormat instance on every render of the context card.
const eur = (value: number) => cachedFormatCurrencyEUR(value, true);

function pct(value: number): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
}

interface KpiRowProps {
  label: string;
  value: string;
  sub?: string;
  positive?: boolean | null;
}

function KpiRow({ label, value, sub, positive }: KpiRowProps) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <span className="text-sm text-muted-foreground">{label}</span>
      <div className="text-right">
        <span
          className={cn(
            'text-sm font-medium tabular-nums',
            positive === true && 'text-green-600 dark:text-green-400',
            positive === false && 'text-red-600 dark:text-red-400',
            positive === null && 'text-foreground'
          )}
        >
          {value}
        </span>
        {sub && (
          <p className="text-xs text-muted-foreground">{sub}</p>
        )}
      </div>
    </div>
  );
}

/**
 * Skeleton shown while the context bundle is being fetched after thread selection.
 * Mirrors the card structure so the layout shift is minimal on data arrival.
 */
function AssistantContextCardSkeleton({ className }: { className?: string }) {
  return (
    <Card className={cn('overflow-hidden animate-pulse', className)}>
      <CardHeader className="border-b border-border pb-3 pt-4">
        <div className="h-4 w-36 rounded bg-muted" />
      </CardHeader>
      <CardContent className="space-y-5 p-4">
        {/* Hero KPI placeholder */}
        <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2">
          <div className="h-3 w-28 rounded bg-muted" />
          <div className="h-6 w-32 rounded bg-muted" />
          <div className="h-3 w-48 rounded bg-muted" />
        </div>
        {/* Cashflow rows placeholder */}
        <div className="space-y-1">
          <div className="h-3 w-16 rounded bg-muted mb-2" />
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex justify-between py-1.5">
              <div className="h-3 w-20 rounded bg-muted" />
              <div className="h-3 w-24 rounded bg-muted" />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

interface AssistantContextCardProps {
  bundle: AssistantMonthContextBundle;
  className?: string;
  isLoading?: boolean;
}

/**
 * Numeric context panel shown in the right sidebar during and after month analysis.
 * All data comes from the server-built bundle — no additional fetches needed.
 *
 * When isLoading is true (bundle being fetched for an existing thread), renders a
 * skeleton that matches the card structure to minimise layout shift on data arrival.
 *
 * Layout: Net worth delta at the top (hero KPI), then cashflow rows, then allocation changes.
 * Data quality notes are rendered as a light callout below.
 */
export function AssistantContextCard({ bundle, className, isLoading }: AssistantContextCardProps) {
  if (isLoading) {
    return <AssistantContextCardSkeleton className={className} />;
  }
  const { selector, netWorth, cashflow, allocationChanges, dataQuality } = bundle;
  const periodLabel = getPeriodLabel(selector);

  const deltaPositive =
    netWorth.delta !== null ? netWorth.delta >= 0 : null;

  const DeltaIcon =
    deltaPositive === true
      ? TrendingUp
      : deltaPositive === false
        ? TrendingDown
        : Minus;

  return (
    <Card className={cn('overflow-hidden', className)}>
      <CardHeader className="border-b border-border pb-3 pt-4">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-sm font-medium">Contesto {periodLabel}</CardTitle>
          {dataQuality.isPartialMonth && (
            <Badge variant="outline" className="text-[10px]">{getPartialLabel(selector)}</Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-5 p-4">
        {/* Hero: net worth delta */}
        <div className="rounded-lg border border-border bg-muted/30 p-4">
          <p className="mb-2 text-xs font-medium uppercase tracking-widest text-muted-foreground">
            Variazione patrimonio
          </p>
          <div className="flex items-center gap-2">
            <DeltaIcon
              className={cn(
                'h-4 w-4 shrink-0',
                deltaPositive === true && 'text-green-600 dark:text-green-400',
                deltaPositive === false && 'text-red-600 dark:text-red-400',
                deltaPositive === null && 'text-muted-foreground'
              )}
            />
            <span
              className={cn(
                'text-lg font-semibold tabular-nums',
                deltaPositive === true && 'text-green-600 dark:text-green-400',
                deltaPositive === false && 'text-red-600 dark:text-red-400',
                deltaPositive === null && 'text-muted-foreground'
              )}
            >
              {netWorth.delta !== null ? eur(netWorth.delta) : 'N/D'}
            </span>
            {netWorth.deltaPct !== null && (
              <span className="text-sm text-muted-foreground">
                ({pct(netWorth.deltaPct)})
              </span>
            )}
          </div>
          <div className="mt-1 flex gap-4 text-xs text-muted-foreground">
            <span>Inizio: {netWorth.start !== null ? eur(netWorth.start) : 'N/D'}</span>
            <span>Fine: {netWorth.end !== null ? eur(netWorth.end) : 'N/D'}</span>
          </div>
        </div>

        {/* Cashflow rows */}
        {dataQuality.hasCashflowData && (
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-widest text-muted-foreground">
              Cashflow
            </p>
            <div className="divide-y divide-border/50 rounded-lg border border-border">
              <div className="px-3">
                <KpiRow
                  label="Entrate"
                  value={eur(cashflow.totalIncome)}
                  positive={cashflow.totalIncome > 0 ? true : null}
                />
              </div>
              <div className="px-3">
                <KpiRow
                  label="Dividendi"
                  value={eur(cashflow.totalDividends)}
                  positive={cashflow.totalDividends > 0 ? true : null}
                />
              </div>
              <div className="px-3">
                <KpiRow
                  label="Uscite"
                  value={eur(cashflow.totalExpenses)}
                  positive={cashflow.totalExpenses >= 0 ? null : false}
                />
              </div>
              <div className="px-3">
                <KpiRow
                  label="Flusso netto"
                  value={eur(cashflow.netCashFlow)}
                  positive={cashflow.netCashFlow >= 0 ? true : false}
                />
              </div>
            </div>
          </div>
        )}

        {/* Top allocation changes */}
        {allocationChanges.length > 0 && (
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-widest text-muted-foreground">
              Allocazione (top variazioni)
            </p>
            <div className="space-y-1">
              {allocationChanges.map((change) => (
                <div
                  key={change.assetClass}
                  className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-1.5"
                >
                  <span className="truncate text-xs text-muted-foreground">
                    {change.assetClass}
                  </span>
                  <span
                    className={cn(
                      'text-xs font-medium tabular-nums',
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

        {/* Data quality callout */}
        {dataQuality.notes.length > 0 && (
          <Alert className="border-amber-200 bg-amber-50/50 py-2 dark:border-amber-800 dark:bg-amber-950/10">
            <AlertCircle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
            <AlertDescription className="ml-1 text-xs text-amber-700 dark:text-amber-400">
              {dataQuality.notes.map((note, i) => (
                <span key={i} className="block">{note}</span>
              ))}
            </AlertDescription>
          </Alert>
        )}

        {!dataQuality.hasSnapshot && !dataQuality.hasCashflowData && (
          <p className="text-center text-xs text-muted-foreground py-2">
            Nessun dato disponibile per questo mese.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
