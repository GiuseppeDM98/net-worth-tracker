'use client';

import { useRef, useState } from 'react';
import { Asset } from '@/types/assets';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  formatCurrency,
  formatNumber,
} from '@/lib/services/chartService';
import {
  calculateAssetValue,
  calculateUnrealizedGains,
} from '@/lib/services/assetService';
import { getAssetClassCssVar } from '@/lib/constants/colors';
import { formatAssetClassName } from '@/lib/utils/assetUtils';
import { Pencil, Trash2, Calculator, ChevronDown, Info, ArrowLeftRight, ScrollText } from 'lucide-react';
import { format } from 'date-fns';
import { it } from 'date-fns/locale';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { AssetSparkline } from '@/components/assets/AssetSparkline';

// Performance delta values for an asset derived from monthly snapshots.
// null means no snapshot data available for that period.
export interface AssetPerformanceData {
  lastSnapshotDelta: number | null; // % change vs last snapshot
  ytdDelta: number | null;          // % change vs first snapshot of current year
  allTimeDelta: number | null;      // % change vs first ever snapshot
}

interface AssetCardProps {
  asset: Asset;
  totalValue: number;
  onEdit: (asset: Asset) => void;
  onDelete: (assetId: string) => void;
  onCalculateTaxes?: (asset: Asset) => void;
  isManualPrice: boolean;
  isDemo?: boolean;
  sparklineData?: { value: number }[];
  performance?: AssetPerformanceData;
  /** Trade-ledger row actions — shown only for ledger asset types once migration has run (spec 04 §1). */
  showLedgerActions?: boolean;
  onRegisterTrade?: (asset: Asset) => void;
  onMovements?: (asset: Asset) => void;
}

// Format a % delta for display: "+1.2%" or "-3.4%" or "—".
function formatDeltaPct(delta: number | null): string {
  if (delta === null) return '—';
  const sign = delta >= 0 ? '+' : '';
  return `${sign}${delta.toFixed(1)}%`;
}

// Theme-aware sign color for a % delta value.
// --positive / --destructive tokens keep the color in sync with the active theme
// (raw text-green/red-* would diverge from --destructive on non-default themes).
function deltaColorClass(delta: number | null): string {
  if (delta === null) return 'text-muted-foreground';
  if (delta > 0) return 'text-positive';
  if (delta < 0) return 'text-destructive';
  return 'text-muted-foreground';
}

export function AssetCard({
  asset,
  totalValue,
  onEdit,
  onDelete,
  onCalculateTaxes,
  isManualPrice,
  isDemo = false,
  sparklineData,
  performance,
  showLedgerActions = false,
  onRegisterTrade,
  onMovements,
}: AssetCardProps) {
  const [showDetails, setShowDetails] = useState(false);
  const [isPendingDelete, setIsPendingDelete] = useState(false);
  const pendingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const value = calculateAssetValue(asset);
  const lastUpdate =
    asset.lastPriceUpdate instanceof Date
      ? asset.lastPriceUpdate
      : new Date();
  const assetClassCssVar = getAssetClassCssVar(asset.assetClass);

  // Guards against division by zero when averageCost is absent or zero.
  // Some assets (cash, imported positions) have no cost basis and should
  // show no gain/loss rather than a misleading 0%.
  const hasGainLoss = !!(asset.averageCost && asset.averageCost > 0);
  let gainLoss = 0;
  let gainLossPercentage = 0;
  if (hasGainLoss) {
    gainLoss = calculateUnrealizedGains(asset);
    const costBasis = asset.quantity * asset.averageCost!;
    gainLossPercentage = costBasis > 0 ? (gainLoss / costBasis) * 100 : 0;
  }

  const isPositive = gainLoss > 0;
  const isNegative = gainLoss < 0;
  // Theme-aware sign tokens — track --positive / --destructive across all 6 themes.
  // The desktop table (deltaColorClass) uses the same tokens — keep both in sync.
  const gainLossColor = isPositive
    ? 'text-positive'
    : isNegative
    ? 'text-destructive'
    : 'text-muted-foreground';

  const handleDeleteClick = () => {
    if (isPendingDelete) {
      if (pendingTimerRef.current) clearTimeout(pendingTimerRef.current);
      setIsPendingDelete(false);
      onDelete(asset.id);
    } else {
      if (pendingTimerRef.current) clearTimeout(pendingTimerRef.current);
      setIsPendingDelete(true);
      pendingTimerRef.current = setTimeout(() => setIsPendingDelete(false), 3000);
    }
  };

  return (
    // color-mix() tracks the active theme's --chart-3, matching the desktop table row treatment.
    // Avoids hardcoded amber-50/amber-950 which break on non-default themes.
    <Card className={isManualPrice ? 'bg-[color-mix(in_oklch,var(--chart-3)_6%,transparent)]' : ''}>
      {/* Header: plain div avoids CardHeader's flex-col which breaks inner flex-1 truncation */}
      <div className="p-4 pb-0 flex items-start gap-2">
        <div className="flex-1 overflow-hidden min-w-0">
          <h3 className="font-semibold text-base text-foreground truncate">
            {asset.name}
          </h3>
          {asset.ticker && (
            <p className="text-sm text-muted-foreground mt-0.5 truncate">{asset.ticker}</p>
          )}
          {asset.quantity === 0 && (
            <Badge variant="outline" className="mt-1 text-xs bg-muted text-muted-foreground border-border">
              Azzerato
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Badge
            style={{
              backgroundColor: `color-mix(in srgb, var(${assetClassCssVar}) 15%, transparent)`,
              color: `var(${assetClassCssVar})`,
              border: `1px solid color-mix(in srgb, var(${assetClassCssVar}) 30%, transparent)`,
            }}
          >
            {formatAssetClassName(asset.assetClass)}
          </Badge>
          <button
            type="button"
            onClick={() => setShowDetails(!showDetails)}
            className="p-1.5 rounded-md border border-border bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            aria-label={showDetails ? 'Nascondi dettagli' : 'Mostra dettagli'}
          >
            <ChevronDown
              className={`h-4 w-4 transition-transform duration-200 motion-reduce:transition-none ${
                showDetails ? 'rotate-180' : ''
              }`}
            />
          </button>
        </div>
      </div>

      <CardContent className="p-4 pt-3">
        {/* Valore Totale e G/P — stacked layout, mirrors summary card pattern */}
        <div className="mb-3">
          <p className="text-xs text-muted-foreground">Valore Totale</p>
          <p className="text-lg font-bold text-foreground font-mono">
            {asset.assetClass === 'realestate' &&
            asset.outstandingDebt &&
            asset.outstandingDebt > 0 ? (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="flex items-center gap-1 cursor-help">
                      {formatCurrency(value)}
                      <Info className="h-3 w-3 text-muted-foreground" />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>
                    <div className="text-xs space-y-1">
                      <p>
                        <strong>Valore lordo:</strong>{' '}
                        {formatCurrency(asset.quantity * asset.currentPrice)}
                      </p>
                      <p>
                        <strong>Debito residuo:</strong>{' '}
                        {formatCurrency(asset.outstandingDebt)}
                      </p>
                      <p>
                        <strong>Valore netto:</strong>{' '}
                        {formatCurrency(value)}
                      </p>
                    </div>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ) : (
              formatCurrency(value)
            )}
          </p>
          {hasGainLoss && (
            <p className={`text-sm font-semibold font-mono mt-0.5 ${gainLossColor}`}>
              {isPositive ? '+' : ''}
              {formatCurrency(gainLoss, asset.currency)}
              <span className="text-xs ml-1.5 opacity-80">
                ({isPositive ? '+' : ''}{formatNumber(gainLossPercentage, 2)}%)
              </span>
            </p>
          )}
        </div>

        {/* Sparkline — mobile only, graceful degradation se dati insufficienti */}
        {sparklineData && sparklineData.length >= 2 && (
          <div className="desktop:hidden mt-2 mb-1">
            <AssetSparkline data={sparklineData} />
          </div>
        )}

        {/* Performance rows: Δ Mese / Δ YTD / Δ Inizio — vertical divide-y layout */}
        {performance && (
          <div className="mt-2 mb-1 divide-y divide-border border-t border-border">
            {[
              { label: 'Mese', delta: performance.lastSnapshotDelta, hint: false },
              { label: 'YTD', delta: performance.ytdDelta, hint: false },
              // Δ Inizio carries the info hint: these rows are price variations over
              // time, not profit/loss — clarifies the distinction from G/P (vs PMC).
              { label: 'Inizio', delta: performance.allTimeDelta, hint: true },
            ].map(({ label, delta, hint }) => (
              <div key={label} className="flex items-center justify-between py-1">
                <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                  {label}
                  {hint && (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Info className="h-3 w-3 cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent className="max-w-[240px] text-left font-normal">
                          Variazione di prezzo nel periodo (dal primo dato registrato,
                          per Inizio). Diverso dal G/P, che confronta col prezzo medio
                          di carico (PMC).
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                </span>
                <span className={`text-[11px] font-mono font-semibold tabular-nums ${deltaColorClass(delta)}`}>
                  {formatDeltaPct(delta)}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Peso % separato da border-t */}
        <div className="pt-2 border-t border-border mb-3">
          <p className="text-xs text-muted-foreground">Peso in %</p>
          <p className="text-sm font-semibold text-foreground font-mono">
            {totalValue > 0 ? `${((value / totalValue) * 100).toFixed(2)}%` : '-'}
          </p>
        </div>

        {/* Dati base (sempre visibili) */}
        <div className="grid grid-cols-2 gap-2 text-sm mb-3">
          <div>
            <span className="text-muted-foreground">Tipo:</span>{' '}
            <span className="font-medium">{formatAssetClassName(asset.type)}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Quantità:</span>{' '}
            <span className="font-medium font-mono">
              {formatNumber(asset.quantity, 2)}
            </span>
          </div>
          <div>
            <span className="text-muted-foreground">Prezzo:</span>{' '}
            <span className="font-medium font-mono">
              {formatCurrency(asset.currentPrice, asset.currency, 4)}
            </span>
          </div>
          {asset.averageCost && (
            <div>
              <span className="text-muted-foreground">PMC:</span>{' '}
              <span className="font-medium font-mono">
                {formatCurrency(asset.averageCost, asset.currency, 4)}
              </span>
            </div>
          )}
        </div>

        {/* Dettagli collassabili */}
        {showDetails && (
          <div className="grid grid-cols-2 gap-2 text-sm mb-3 pt-2 border-t border-border">
            {asset.totalExpenseRatio && (
              <div>
                <span className="text-muted-foreground">TER:</span>{' '}
                <span className="font-medium font-mono">
                  {asset.totalExpenseRatio.toFixed(2)}%
                </span>
              </div>
            )}
            {asset.taxRate !== undefined && asset.taxRate >= 0 && (
              <div>
                <span className="text-muted-foreground">Aliquota:</span>{' '}
                <span className="font-medium">{asset.taxRate}%</span>
              </div>
            )}
            {asset.subCategory && (
              <div className="col-span-2">
                <span className="text-muted-foreground">Sottocategoria:</span>{' '}
                <span className="font-medium">{asset.subCategory}</span>
              </div>
            )}
            <div className="col-span-2">
              <span className="text-muted-foreground">Ultimo Agg.:</span>{' '}
              <span className="font-medium tabular-nums">
                {format(lastUpdate, 'dd/MM/yyyy HH:mm', { locale: it })}
              </span>
            </div>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex flex-col gap-2">
          {onCalculateTaxes && (
            <Button
              type="button"
              variant="outline"
              size="default"
              onClick={() => onCalculateTaxes(asset)}
              className="w-full"
            >
              <Calculator className="h-4 w-4" />
              Calcola Tasse
            </Button>
          )}
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant="outline"
              size="default"
              onClick={() => onEdit(asset)}
              disabled={isDemo}
              title={isDemo ? 'Non disponibile in modalità demo' : undefined}
              className="w-full"
            >
              <Pencil className="h-4 w-4" />
              Modifica
            </Button>
            <Button
              type="button"
              variant={isPendingDelete ? 'destructive' : 'outline'}
              size="default"
              onClick={handleDeleteClick}
              disabled={isDemo}
              title={isDemo ? 'Non disponibile in modalità demo' : undefined}
              className="w-full"
            >
              <Trash2 className="h-4 w-4" />
              {isPendingDelete ? 'Conferma?' : 'Elimina'}
            </Button>
          </div>
          {/* Trade-ledger actions — Registra operazione (mutation, demo-disabled) + Movimenti (read-only). */}
          {showLedgerActions && (
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant="outline"
                size="default"
                onClick={() => onRegisterTrade?.(asset)}
                disabled={isDemo}
                title={isDemo ? 'Non disponibile in modalità demo' : undefined}
                className="w-full"
                aria-label="Registra operazione"
              >
                <ArrowLeftRight className="h-4 w-4" />
                Operazione
              </Button>
              <Button
                type="button"
                variant="outline"
                size="default"
                onClick={() => onMovements?.(asset)}
                className="w-full"
                aria-label="Movimenti"
              >
                <ScrollText className="h-4 w-4" />
                Movimenti
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
