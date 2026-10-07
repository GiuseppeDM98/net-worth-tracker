'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ChevronDown, Pencil, Trash2, Calculator, ArrowLeftRight, ScrollText, PiggyBank, Info } from 'lucide-react';
import type { Asset } from '@/types/assets';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { formatCurrency, formatNumber, formatPercentage } from '@/lib/services/chartService';
import { calculateAssetValue } from '@/lib/services/assetService';
import { computeUnrealizedGain, resolveBondRowFacts } from '@/lib/utils/patrimonioSummary';
import { describeBondRow, describeManualValuation } from '@/lib/utils/patrimonioNarrative';
import { costBasisPerUnitEur, isEurNative } from '@/lib/utils/costBasisEur';
import { hasMarketPrice } from '@/lib/utils/assetPricing';
import { toDate } from '@/lib/utils/dateHelpers';
import { useArmedDelete } from '@/lib/hooks/useArmedDelete';
import { getAssetClassCssVar } from '@/lib/constants/colors';
import { ASSET_CLASS_LABELS } from '@/lib/utils/allocationUtils';
import { describeAssetClassChip, type AssetClassChipModel } from '@/lib/utils/assetDisplayClass';
import { getAssetDisplayTicker } from '@/lib/utils/assetDisplay';
import { getMetricValueColor } from '@/lib/utils/metricColors';
import type { AssetPerformanceData } from '@/lib/utils/assetPerformanceDeltas';
import { cn } from '@/lib/utils';
import { lazyComponent } from '@/components/ui/lazy-component';

/**
 * The unit-price sparkline, its code a chunk of its own: it is the only path from Patrimonio to
 * recharts, and it is drawn only inside a row someone opened (AGENTS.md § Dynamic Imports — a chart
 * inside something closed by default). `StrumentiTile` preloads it when idle, on a phone only.
 */
const AssetSparkline = lazyComponent(() => import('@/components/assets/AssetSparkline').then((m) => m.AssetSparkline));

/** Every lazy chart of a row, for `usePreloadWhenIdle` (a module-level array, so it runs once). */
export const ASSET_ROW_LAZY_CHARTS = [AssetSparkline];

/** The sparkline's 32px, reserved before the row is opened and while its chunk arrives: nothing moves. */
const SPARKLINE_SLOT = <div className="h-8" aria-hidden="true" />;

/** "+1,2%" / "−3,4%" / "—" — it-IT decimals, typographic minus (The Comma Rule). */
export function formatDeltaPercent(delta: number | null): string {
  if (delta === null) return '—';
  return `${delta >= 0 ? '+' : '−'}${formatPercentage(Math.abs(delta), 1)}`;
}

/**
 * The sub-line under an instrument's name, shared by the desktop table and the mobile row:
 * a bond says when it matures and when its next coupon falls; a hand-valued holding says when
 * its value was last typed. Null for a quoted instrument, whose ticker is enough.
 */
export function describeAssetRowSubLine(asset: Asset, now: Date): string | null {
  const bond = resolveBondRowFacts(asset);
  if (bond) return describeBondRow(bond, bond.nextCoupon, now);
  if (!hasMarketPrice(asset.type, asset.subCategory)) return describeManualValuation(toDate(asset.lastPriceUpdate), now);
  return null;
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

/** Hard-stop gradient of the chip's segments at `mix`% of each class's chart slot. */
function segmentGradient(segments: AssetClassChipModel['segments'], mix: number): string {
  let start = 0;
  const stops = segments.map(({ assetClass, share }) => {
    const end = start + share;
    const stop = `color-mix(in srgb, var(${getAssetClassCssVar(assetClass)}) ${mix}%, transparent) ${start}% ${end}%`;
    start = end;
    return stop;
  });
  return `linear-gradient(to right, ${stops.join(', ')})`;
}

/**
 * The class chip of ONE instrument row (desktop table and phone row). A single-class asset gets the
 * plain `AssetClassChip`; a composite one (a 60/40 fund) splits into one segment per leg, each as
 * wide as its share and tinted like that class's own chip: a 15% fill, and a 30% ring that is the
 * same segment gradient masked down to its outer 1px. The ring is an OVERLAY, not a CSS border: a
 * gradient on the border box sits under the translucent 15% fill, shows through it and doubles the
 * tint of every segment, so the chip has no border at all and the overlay draws the ring on top,
 * following the rounded ends. The visible label is short («Azioni · Obbl.», «Misto»); the shares are
 * `sr-only` text, not an `aria-label`, because the chip's content IS the information (AGENTS.md).
 * The group header keeps `AssetClassChip`: it names the group, not an instrument.
 */
export function InstrumentClassChip({ asset }: { asset: Pick<Asset, 'assetClass' | 'composition'> }) {
  const chip = describeAssetClassChip(asset);
  if (chip.accessibleName === null) return <AssetClassChip assetClass={chip.segments[0].assetClass} />;
  return (
    <span
      data-composite-chip
      // No CSS border: the plain chip's 1px border becomes 1px of padding (px-[9px] py-[3px] = px-2
      // py-0.5 + 1px), and the ring is the overlay below — a border-box gradient would show through
      // the translucent fill and double its tint. From two segments on, a minimum width in the desktop
      // table only: there the chips stand in the Classe column and the proportions compare down it.
      // On the phone row each chip starts after a ticker of its own width, so there is no column to
      // compare down, and a floor would only push the chip under the amount on a long ticker.
      className={cn(
        'relative inline-flex items-center justify-center whitespace-nowrap rounded-full px-[9px] py-[3px] text-[11px] font-medium text-foreground',
        chip.segments.length > 1 && 'desktop:min-w-[112px]',
      )}
      style={{ background: segmentGradient(chip.segments, 15) }}
    >
      {/* The ring: the 30% gradient masked down to its outer 1px (the padding box minus the content
          box), like the plain chip's border drawn over its own fill. The prefixed pair comes FIRST
          and the standard `mask` last: an engine that treats `-webkit-mask` as an alias of `mask`
          resets `mask-composite` with that shorthand, so a standard declaration placed before it
          would lose its `exclude`; declared last, the standard shorthand wins wherever it is
          understood, and older WebKit keeps the prefixed `xor`. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 rounded-full p-px"
        style={{
          background: segmentGradient(chip.segments, 30),
          WebkitMask: 'linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)',
          WebkitMaskComposite: 'xor',
          mask: 'linear-gradient(#000 0 0) content-box exclude, linear-gradient(#000 0 0)',
        }}
      />
      <span aria-hidden="true" data-chip-label className="relative">
        {chip.label}
      </span>
      <span className="sr-only">{chip.accessibleName}</span>
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
  /** The clock the dated sub-line is read against (one per tile). */
  now: Date;
  /** `opener` is the button pressed: the page hands the focus back to it when the dialog closes. */
  onEdit: (asset: Asset, opener: HTMLElement) => void;
  onDelete: (assetId: string) => void;
  /** The tile's one live region: the arm and the disarm of Elimina are spoken there. */
  announce: (text: string) => void;
  onCalculateTaxes?: (asset: Asset) => void;
  isManualPrice: boolean;
  isDemo?: boolean;
  sparklineData?: { value: number }[];
  /** The page's `useChartColors()` palette, for the sparkline: one read per page, not one per row. */
  chartColors: readonly string[];
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
 * on the closed panel so its buttons leave the tab order. Elimina is a two-click confirm without
 * a timer (`useArmedDelete`, since 2026-09-14).
 */
export function AssetRow({
  asset,
  totalValue,
  now,
  onEdit,
  onDelete,
  announce,
  onCalculateTaxes,
  isManualPrice,
  isDemo = false,
  sparklineData,
  chartColors,
  performance,
  showLedgerActions = false,
  onRegisterTrade,
  onMovements,
}: AssetRowProps) {
  const [open, setOpen] = useState(false);
  // The sparkline is born at the first opening and stays: unmounting it on close would empty the
  // panel while it collapses, and a reopened row would draw it again for nothing.
  const [hasOpened, setHasOpened] = useState(false);
  const deleteRef = useRef<HTMLButtonElement | null>(null);
  const { armed, onClick: onDeleteClick, onBlur: onDeleteBlur } = useArmedDelete(deleteRef, () => onDelete(asset.id));
  const wasArmed = useRef(false);
  useEffect(() => {
    if (armed) {
      wasArmed.current = true;
      announce(`Premi di nuovo per eliminare ${asset.name}`);
    } else if (wasArmed.current) {
      wasArmed.current = false;
      announce('Eliminazione annullata');
    }
  }, [armed, announce, asset.name]);

  const value = calculateAssetValue(asset);
  // A hand-VALUED holding keeps its value in `quantity` at price 1: those cells describe the
  // storage, so the details say the value and when it was typed instead.
  const isHandValued = !hasMarketPrice(asset.type, asset.subCategory);
  // One rule for "this row has a G/P" — the same the desktop table and the Rendimento KPI use.
  const gain = computeUnrealizedGain(asset);
  const hasGainLoss = gain !== null;
  const gainLoss = gain?.gainLoss ?? 0;
  const gainLossPercent = gain?.gainPercent ?? 0;
  const weight = totalValue > 0 ? (value / totalValue) * 100 : null;
  const isMortgaged = asset.assetClass === 'realestate' && !!asset.outstandingDebt && asset.outstandingDebt > 0;
  const panelId = `asset-row-${asset.id}`;
  const subLine = describeAssetRowSubLine(asset, now);
  const showTicker = !!asset.ticker && asset.type !== 'pensionFund';
  // The actions sit in a two-column grid; with an odd count the last one (Elimina) would be
  // alone in its row, so it takes the whole row instead of leaving a hole beside it.
  const actionCount = 2 + (onCalculateTaxes ? 1 : 0) + (showLedgerActions ? 2 : 0) + (asset.type === 'pensionFund' ? 1 : 0);
  const deleteSpansRow = actionCount % 2 === 1;

  // The EUR PMC (fees included, the G/P's basis) and, on a foreign row, the native one beside it.
  const pmcEur = isHandValued ? undefined : costBasisPerUnitEur(asset);
  const nativePmc = !isHandValued && !isEurNative(asset) && asset.averageCost ? asset.averageCost : undefined;
  const details: Array<{ label: string; value: string; className?: string }> = [
    ...(isHandValued
      ? []
      : [
          { label: 'Quantità', value: formatNumber(asset.quantity, 2) },
          { label: 'Prezzo', value: formatCurrency(asset.currentPrice, asset.currency, 4) },
        ]),
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
        onClick={() => {
          setOpen((v) => !v);
          setHasOpened(true);
        }}
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
          <span className="flex min-w-0 items-center gap-1.5">
            {/* pensionFund has no ticker input — a leftover raw value must not resurface here. */}
            {showTicker && <span className="font-mono text-[11px] text-muted-foreground">{getAssetDisplayTicker(asset)}</span>}
            <InstrumentClassChip asset={asset} />
          </span>
          {subLine && <span className="truncate text-[11px] text-muted-foreground">{subLine}</span>}
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

            {sparklineData &&
              sparklineData.length >= 2 &&
              (hasOpened ? (
                <AssetSparkline
                  fallback={SPARKLINE_SLOT}
                  data={sparklineData}
                  label={`Prezzo unitario di ${asset.name}`}
                  colors={chartColors}
                />
              ) : (
                SPARKLINE_SLOT
              ))}

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
                onClick={(event) => onEdit(asset, event.currentTarget)}
                disabled={isDemo}
                title={isDemo ? 'Non disponibile in modalità demo' : undefined}
              >
                <Pencil className="h-4 w-4" aria-hidden="true" />
                Modifica
              </Button>
              <Button
                ref={deleteRef}
                type="button"
                variant={armed ? 'destructive' : 'outline'}
                className={cn('h-11', deleteSpansRow && 'col-span-2', !armed && 'text-destructive hover:text-destructive')}
                onClick={onDeleteClick}
                onBlur={onDeleteBlur}
                disabled={isDemo}
                title={isDemo ? 'Non disponibile in modalità demo' : undefined}
                aria-pressed={armed}
                aria-label={armed ? `Premi di nuovo per eliminare ${asset.name}` : `Elimina ${asset.name}`}
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
                {armed ? 'Premi di nuovo' : 'Elimina'}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
