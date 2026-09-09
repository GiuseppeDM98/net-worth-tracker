'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { ChevronDown, Pencil, Trash2, Calculator, ArrowLeftRight, ScrollText, PiggyBank, Info } from 'lucide-react';
import type { Asset } from '@/types/assets';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { formatCurrency, formatNumber, formatPercentage } from '@/lib/services/chartService';
import { calculateAssetValue } from '@/lib/services/assetService';
import { computeUnrealizedGain } from '@/lib/utils/patrimonioSummary';
import { costBasisPerUnitEur, isEurNative } from '@/lib/utils/costBasisEur';
import { getAssetClassCssVar } from '@/lib/constants/colors';
import { ASSET_CLASS_LABELS } from '@/lib/utils/allocationUtils';
import { resolveDisplayAssetClass } from '@/lib/utils/assetDisplayClass';
import { getAssetDisplayTicker } from '@/lib/utils/assetDisplay';
import { getMetricValueColor } from '@/lib/utils/metricColors';
import type { AssetPerformanceData } from '@/lib/utils/assetPerformanceDeltas';
import { cn } from '@/lib/utils';
import { AssetSparkline } from '@/components/assets/AssetSparkline';

/** "+1,2%" / "−3,4%" / "—" — it-IT decimals, typographic minus (The Comma Rule). */
export function formatDeltaPercent(delta: number | null): string {
  if (delta === null) return '—';
  return `${delta >= 0 ? '+' : '−'}${formatPercentage(Math.abs(delta), 1)}`;
}

/**
 * The class chip every Strumenti row carries — the class's chart slot as tint and border, the
 * label in the foreground colour (a chart slot is not a text colour, AGENTS.md → Layout and Color
 * Tokens), from ASSET_CLASS_LABELS (the one Italian enumeration; the chip used to say "Equity"
 * next to a Classi tile saying "Azioni").
 */
export function AssetClassChip({ assetClass, className }: { assetClass: string; className?: string }) {
  const cssVar = getAssetClassCssVar(assetClass);
  return (
    <span
      className={cn('inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium text-foreground', className)}
      style={{
        backgroundColor: `color-mix(in srgb, var(${cssVar}) 15%, transparent)`,
        border: `1px solid color-mix(in srgb, var(${cssVar}) 30%, transparent)`,
      }}
    >
      {ASSET_CLASS_LABELS[assetClass] ?? assetClass}
    </span>
  );
}

/** The gross/debt/net breakdown of a mortgaged property, as a tooltip on its value. */
export function RealEstateValueTooltip({ asset, value }: { asset: Asset; value: number }) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex cursor-help items-center gap-1">
            {formatCurrency(value)}
            <Info className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
          </span>
        </TooltipTrigger>
        <TooltipContent>
          <div className="space-y-1 text-xs">
            <p>
              <strong>Valore lordo:</strong> {formatCurrency(asset.quantity * asset.currentPrice)}
            </p>
            <p>
              <strong>Debito residuo:</strong> {formatCurrency(asset.outstandingDebt ?? 0)}
            </p>
            <p>
              <strong>Valore netto:</strong> {formatCurrency(value)}
            </p>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

interface AssetRowProps {
  asset: Asset;
  /** The gross portfolio total the weight is measured against. */
  totalValue: number;
  onEdit: (asset: Asset) => void;
  onDelete: (assetId: string) => void;
  onCalculateTaxes?: (asset: Asset) => void;
  isManualPrice: boolean;
  isDemo?: boolean;
  sparklineData?: { value: number }[];
  performance?: AssetPerformanceData;
  /** Trade-ledger row actions — shown only for ledger asset types once migration has run. */
  showLedgerActions?: boolean;
  onRegisterTrade?: (asset: Asset) => void;
  onMovements?: (asset: Asset) => void;
}

/**
 * One instrument below `desktop:` — a flat row (name, class, value, G/P) that expands in place
 * on the details, the unit-price sparkline, the three Δ windows and the actions. Flat on purpose:
 * the rows live inside the Strumenti tile, and a card per row would be a card inside a card.
 * Expansion is the CSS `grid-rows-[0fr] → [1fr]` technique (AGENTS.md → Motion), with `inert`
 * on the closed panel so its buttons leave the tab order.
 */
export function AssetRow({
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
}: AssetRowProps) {
  const [open, setOpen] = useState(false);
  const [isPendingDelete, setIsPendingDelete] = useState(false);
  const pendingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const value = calculateAssetValue(asset);
  const displayAssetClass = resolveDisplayAssetClass(asset);
  // One rule for "this row has a G/P" — the same the desktop table and the Rendimento KPI use.
  const gain = computeUnrealizedGain(asset);
  const hasGainLoss = gain !== null;
  const gainLoss = gain?.gainLoss ?? 0;
  const gainLossPercent = gain?.gainPercent ?? 0;
  const weight = totalValue > 0 ? (value / totalValue) * 100 : null;
  const isMortgaged = asset.assetClass === 'realestate' && !!asset.outstandingDebt && asset.outstandingDebt > 0;
  const panelId = `asset-row-${asset.id}`;
  // The actions sit in a two-column grid; with an odd count the last one (Elimina) would be
  // alone in its row, so it takes the whole row instead of leaving a hole beside it.
  const actionCount = 2 + (onCalculateTaxes ? 1 : 0) + (showLedgerActions ? 2 : 0) + (asset.type === 'pensionFund' ? 1 : 0);
  const deleteSpansRow = actionCount % 2 === 1;

  // 2-click disarm (unchanged from the card): same pattern as the desktop table.
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

  // The EUR PMC (fees included, the G/P's basis) and, on a foreign row, the native one beside it.
  const pmcEur = costBasisPerUnitEur(asset);
  const nativePmc = !isEurNative(asset) && asset.averageCost ? asset.averageCost : undefined;
  const details: Array<{ label: string; value: string; className?: string }> = [
    { label: 'Quantità', value: formatNumber(asset.quantity, 2) },
    { label: 'Prezzo', value: formatCurrency(asset.currentPrice, asset.currency, 4) },
    ...(pmcEur !== undefined ? [{ label: 'PMC', value: formatCurrency(pmcEur, 'EUR', 4) }] : []),
    ...(nativePmc !== undefined ? [{ label: `PMC (${asset.currency})`, value: formatCurrency(nativePmc, asset.currency, 4) }] : []),
    ...(asset.totalExpenseRatio ? [{ label: 'TER', value: formatPercentage(asset.totalExpenseRatio, 2) }] : []),
    { label: 'Peso', value: weight === null ? '—' : formatPercentage(weight, 2) },
    ...(hasGainLoss
      ? [
          {
            label: 'G/P',
            value: `${gainLoss >= 0 ? '+' : '−'}${formatCurrency(Math.abs(gainLoss))}`,
            className: getMetricValueColor(gainLoss, 'number'),
          },
        ]
      : []),
  ];

  return (
    <div
      className={cn(
        'flex flex-col',
        // color-mix() tracks the active theme's --chart-3 — the "no market quote" tint of the table.
        isManualPrice && '-mx-2 rounded-md bg-[color-mix(in_oklch,var(--chart-3)_6%,transparent)] px-2',
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex min-h-[56px] w-full items-center gap-3 py-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate text-[13px] font-medium text-foreground">{asset.name}</span>
            {asset.quantity === 0 && (
              <span className="shrink-0 rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                Azzerato
              </span>
            )}
          </span>
          <span className="flex items-center gap-1.5">
            {/* pensionFund has no ticker input — a leftover raw value must not resurface here. */}
            {asset.ticker && asset.type !== 'pensionFund' && (
              <span className="font-mono text-[11px] text-muted-foreground">{getAssetDisplayTicker(asset)}</span>
            )}
            <AssetClassChip assetClass={displayAssetClass} />
          </span>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-0.5">
          <span className="font-mono text-[13px] font-semibold tabular-nums text-foreground">
            {isMortgaged ? <RealEstateValueTooltip asset={asset} value={value} /> : formatCurrency(value)}
          </span>
          {hasGainLoss ? (
            <span className={cn('font-mono text-[11px] tabular-nums', getMetricValueColor(gainLoss, 'number'))}>
              {gainLoss >= 0 ? '+' : '−'}
              {formatPercentage(Math.abs(gainLossPercent), 2)}
            </span>
          ) : (
            <span className="font-mono text-[11px] text-muted-foreground">{isManualPrice ? 'a mano' : '—'}</span>
          )}
        </div>
        <ChevronDown
          className={cn('h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-200 motion-reduce:transition-none', open && 'rotate-180')}
          aria-hidden="true"
        />
      </button>

      <div
        id={panelId}
        className={cn('grid transition-[grid-template-rows] duration-200 motion-reduce:transition-none', open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]')}
        inert={!open ? true : undefined}
      >
        <div className="overflow-hidden">
          <div className="flex flex-col gap-3 pb-3.5">
            <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[12px]">
              {details.map((d) => (
                <div key={d.label} className="flex items-baseline gap-1.5">
                  <span className="text-muted-foreground">{d.label}</span>
                  <span className={cn('font-mono tabular-nums text-foreground', d.className)}>{d.value}</span>
                </div>
              ))}
            </div>

            {sparklineData && sparklineData.length >= 2 && <AssetSparkline data={sparklineData} />}

            {performance && (
              <div className="flex flex-col divide-y divide-border border-t border-border">
                {[
                  { label: 'Δ Mese', delta: performance.lastSnapshotDelta },
                  { label: 'Δ YTD', delta: performance.ytdDelta },
                  { label: 'Δ Inizio', delta: performance.allTimeDelta },
                ].map(({ label, delta }) => (
                  <div key={label} className="flex items-center justify-between py-1.5">
                    <span className="text-[11px] text-muted-foreground">{label}</span>
                    <span className={cn('font-mono text-[11px] font-semibold tabular-nums', getMetricValueColor(delta, 'percentage'))}>
                      {formatDeltaPercent(delta)}
                    </span>
                  </div>
                ))}
                <p className="pt-1.5 text-[10px] leading-snug text-muted-foreground">
                  Variazioni di prezzo nel periodo, non G/P (che confronta col PMC).
                </p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              {onCalculateTaxes && (
                <Button type="button" variant="outline" className="h-11" onClick={() => onCalculateTaxes(asset)}>
                  <Calculator className="h-4 w-4" aria-hidden="true" />
                  Calcola tasse
                </Button>
              )}
              {showLedgerActions && (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-11"
                    onClick={() => onRegisterTrade?.(asset)}
                    disabled={isDemo}
                    title={isDemo ? 'Non disponibile in modalità demo' : undefined}
                    aria-label="Registra operazione"
                  >
                    <ArrowLeftRight className="h-4 w-4" aria-hidden="true" />
                    Operazione
                  </Button>
                  <Button type="button" variant="outline" className="h-11" onClick={() => onMovements?.(asset)} aria-label="Movimenti">
                    <ScrollText className="h-4 w-4" aria-hidden="true" />
                    Movimenti
                  </Button>
                </>
              )}
              {asset.type === 'pensionFund' && (
                <Button type="button" variant="outline" className="h-11" asChild>
                  <Link href="/dashboard/pension" aria-label="Vai a Previdenza">
                    <PiggyBank className="h-4 w-4" aria-hidden="true" />
                    Previdenza
                  </Link>
                </Button>
              )}
              <Button
                type="button"
                variant="outline"
                className="h-11"
                onClick={() => onEdit(asset)}
                disabled={isDemo}
                title={isDemo ? 'Non disponibile in modalità demo' : undefined}
              >
                <Pencil className="h-4 w-4" aria-hidden="true" />
                Modifica
              </Button>
              <Button
                type="button"
                variant={isPendingDelete ? 'destructive' : 'outline'}
                className={cn('h-11', deleteSpansRow && 'col-span-2', !isPendingDelete && 'text-destructive hover:text-destructive')}
                onClick={handleDeleteClick}
                disabled={isDemo}
                title={isDemo ? 'Non disponibile in modalità demo' : undefined}
                aria-label={isPendingDelete ? 'Conferma eliminazione' : 'Elimina asset'}
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
                {isPendingDelete ? 'Conferma?' : 'Elimina'}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
