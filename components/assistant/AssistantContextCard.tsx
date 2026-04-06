'use client';

import { TrendingDown, TrendingUp, Minus, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AssistantMonthContextBundle } from '@/types/assistant';
import { cn } from '@/lib/utils';

const MONTH_NAMES = [
  'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
  'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre',
];

function eur(value: number): string {
  return new Intl.NumberFormat('it-IT', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(value);
}

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

interface AssistantContextCardProps {
  bundle: AssistantMonthContextBundle;
  className?: string;
}

/**
 * Numeric context panel shown in the right sidebar during and after month analysis.
 * All data comes from the server-built bundle — no additional fetches needed.
 *
 * Layout: Net worth delta at the top (hero KPI), then cashflow rows, then allocation changes.
 * Data quality notes are rendered as a light callout below.
 */
export function AssistantContextCard({ bundle, className }: AssistantContextCardProps) {
  const { selector, netWorth, cashflow, allocationChanges, dataQuality } = bundle;
  const monthLabel = `${MONTH_NAMES[selector.month - 1]} ${selector.year}`;

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
          <CardTitle className="text-sm font-medium">Contesto {monthLabel}</CardTitle>
          {dataQuality.isPartialMonth && (
            <Badge variant="outline" className="text-[10px]">Mese in corso</Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4 p-4">
        {/* Hero: net worth delta */}
        <div className="rounded-lg border border-border bg-muted/30 p-3">
          <p className="mb-1 text-xs font-medium uppercase tracking-widest text-muted-foreground">
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
            <p className="mb-1 text-xs font-medium uppercase tracking-widest text-muted-foreground">
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
            <p className="mb-1 text-xs font-medium uppercase tracking-widest text-muted-foreground">
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
