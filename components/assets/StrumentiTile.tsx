/**
 * STRUMENTI — the management table of Patrimonio, with the cadence of a tile.
 *
 * The tile answers "cosa possiedo?": eyebrow, a reading line (how many instruments, how many
 * priced by hand, how concentrated the top of the table is), then the table itself. It stays a
 * table because this is the management page: sortable columns, the three Δ columns behind the
 * "Andamento" toggle, the optional grouping by class, the `--chart-3` tint on hand-priced rows
 * and the 2-click delete are unchanged from AssetManagementTab (its predecessor).
 *
 * Below `desktop:` the table becomes a flat list of expandable rows (`AssetRow`): a card per
 * row would be a card inside the tile.
 *
 * The numbers are not computed here. Δ columns and the unit-price series come from
 * `lib/utils/assetPerformanceDeltas.ts`; the concentration from `patrimonioSummary.ts`. Every
 * dialog is owned by the page (one AssetDialog serves the header, the Liquidità tile and this
 * table); the tile only asks for them through callbacks.
 */
'use client';

import { useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeftRight,
  ArrowUpDown,
  Calculator,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Info,
  LayoutGrid,
  Pencil,
  PiggyBank,
  Plus,
  ScrollText,
  Trash2,
  TrendingUp,
} from 'lucide-react';
import { toast } from 'sonner';
import type { Asset } from '@/types/assets';
import { isLedgerAssetType } from '@/types/assetTransactions';
import { calculateAssetValue } from '@/lib/services/assetService';
import { formatCurrency, formatNumber, formatPercentage } from '@/lib/services/chartService';
import { useDeleteAsset } from '@/lib/hooks/useAssets';
import { resolveDisplayAssetClass } from '@/lib/utils/assetDisplayClass';
import { getAssetDisplayTicker } from '@/lib/utils/assetDisplay';
import { requiresManualPricing } from '@/lib/utils/assetPricing';
import { costBasisPerUnitEur, isEurNative } from '@/lib/utils/costBasisEur';
import { getMetricValueColor } from '@/lib/utils/metricColors';
import type { AssetPerformanceData } from '@/lib/utils/assetPerformanceDeltas';
import { computeTopWeightShare, computeUnrealizedGain, hasCostBasis, isHeld } from '@/lib/utils/patrimonioSummary';
import { describeInstruments } from '@/lib/utils/patrimonioNarrative';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Tile, TILE_SUB_EYEBROW_CLASS } from '@/components/ui/tile';
import { AssetClassChip, AssetRow, RealEstateValueTooltip, formatDeltaPercent } from '@/components/assets/AssetRow';

type SortColumn = 'value' | 'gainPct' | 'weight' | 'name' | 'class';
type SortDir = 'asc' | 'desc';
interface SortState {
  column: SortColumn;
  dir: SortDir;
}

const DELTA_WINDOWS = [
  { key: 'lastSnapshotDelta', label: 'Δ Mese' },
  { key: 'ytdDelta', label: 'Δ YTD' },
  { key: 'allTimeDelta', label: 'Δ Inizio' },
] as const;

const HEAD_CLASS = cn(TILE_SUB_EYEBROW_CLASS, 'whitespace-nowrap px-1.5 py-2.5 text-right font-semibold');
const CELL_CLASS = 'whitespace-nowrap px-1.5 py-2 text-right text-[13px] align-middle';
const ICON_BUTTON_CLASS = 'h-8 w-8';

interface SortHeadProps {
  column: SortColumn;
  children: React.ReactNode;
  align?: 'left' | 'right';
  sortState: SortState | null;
  onSort: (column: SortColumn) => void;
}

function SortHead({ column, children, align = 'right', sortState, onSort }: SortHeadProps) {
  const isActive = sortState?.column === column;
  // aria-sort for screen readers (WCAG 1.3.1); tabIndex + onKeyDown for keyboard sorting.
  const ariaSort: 'ascending' | 'descending' | 'none' = isActive ? (sortState.dir === 'asc' ? 'ascending' : 'descending') : 'none';
  return (
    <th
      scope="col"
      className={cn(HEAD_CLASS, 'cursor-pointer select-none hover:text-foreground', align === 'left' && 'text-left', isActive && 'text-foreground')}
      aria-sort={ariaSort}
      tabIndex={0}
      onClick={() => onSort(column)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSort(column);
        }
      }}
    >
      <span className="inline-flex items-center gap-1">
        {children}
        {isActive ? (
          sortState.dir === 'asc' ? <ChevronUp className="h-3 w-3" aria-hidden="true" /> : <ChevronDown className="h-3 w-3" aria-hidden="true" />
        ) : (
          <ArrowUpDown className="h-3 w-3 opacity-40" aria-hidden="true" />
        )}
      </span>
    </th>
  );
}

interface StrumentiTileProps {
  /** The instruments — every asset that is not a cash account. */
  assets: Asset[];
  /** The gross portfolio total every weight is measured against (cash accounts included). */
  totalValue: number;
  performance: Record<string, AssetPerformanceData>;
  unitPriceSeries: Record<string, { value: number }[]>;
  ledgerReady: boolean;
  isDemo: boolean;
  ownerId: string | undefined;
  onAdd: () => void;
  onEdit: (asset: Asset) => void;
  onRegisterTrade: (asset: Asset) => void;
  onMovements: (asset: Asset) => void;
  onCalculateTaxes: (asset: Asset) => void;
  className?: string;
}

export function StrumentiTile({
  assets,
  totalValue,
  performance,
  unitPriceSeries,
  ledgerReady,
  isDemo,
  ownerId,
  onAdd,
  onEdit,
  onRegisterTrade,
  onMovements,
  onCalculateTaxes,
  className,
}: StrumentiTileProps) {
  const deleteAssetMutation = useDeleteAsset(ownerId || '');

  const [sortState, setSortState] = useState<SortState | null>(null);
  // Hidden by default: with the three Δ columns the table needs a horizontal scroll at 1440.
  const [showDeltas, setShowDeltas] = useState(false);
  const [groupByClass, setGroupByClass] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [pendingDeleteId, setPendingDeleteId] = useState<string | undefined>(undefined);
  const pendingDeleteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sold-out rows stay in the table («Azzerato») but are not something the user owns: the
  // reading counts held positions only.
  const held = assets.filter(isHeld);
  const manualCount = held.filter((asset) => requiresManualPricing(asset)).length;
  const reading = describeInstruments(held.length, manualCount, computeTopWeightShare(assets, totalValue));

  // Ledger row actions apply to ledger asset types once migration has produced the meta doc.
  const showLedgerActions = (asset: Asset) => ledgerReady && isLedgerAssetType(asset.type);

  const handleDelete = async (assetId: string) => {
    if (!ownerId) return;
    try {
      await deleteAssetMutation.mutateAsync(assetId);
      toast.success('Asset eliminato con successo');
    } catch (error) {
      console.error('Error deleting asset:', error);
      toast.error("Errore nell'eliminazione dell'asset");
    }
  };

  // 2-click inline delete with 3s auto-disarm — unchanged from AssetManagementTab.
  const handleDeleteClick = (assetId: string) => {
    if (pendingDeleteId === assetId) {
      if (pendingDeleteTimerRef.current) clearTimeout(pendingDeleteTimerRef.current);
      setPendingDeleteId(undefined);
      handleDelete(assetId);
    } else {
      if (pendingDeleteTimerRef.current) clearTimeout(pendingDeleteTimerRef.current);
      setPendingDeleteId(assetId);
      pendingDeleteTimerRef.current = setTimeout(() => setPendingDeleteId(undefined), 3000);
    }
  };

  // First click defaults to desc for numeric columns, asc for alphabetical ones.
  const handleSort = (column: SortColumn) => {
    setSortState((prev) => {
      if (prev?.column === column) return { column, dir: prev.dir === 'asc' ? 'desc' : 'asc' };
      return { column, dir: column === 'name' || column === 'class' ? 'asc' : 'desc' };
    });
  };

  const sortedAssets = useMemo(() => {
    if (!sortState) return assets;
    const gainPct = (a: Asset) => computeUnrealizedGain(a)?.gainPercent ?? 0;
    return [...assets].sort((a, b) => {
      let cmp = 0;
      switch (sortState.column) {
        case 'value':
        case 'weight':
          cmp = calculateAssetValue(a) - calculateAssetValue(b);
          break;
        case 'gainPct':
          cmp = gainPct(a) - gainPct(b);
          break;
        case 'name':
          cmp = a.name.localeCompare(b.name, 'it');
          break;
        case 'class':
          // Display class (composition-prevalent), the one the Classe column shows.
          cmp = resolveDisplayAssetClass(a).localeCompare(resolveDisplayAssetClass(b), 'it');
          break;
      }
      return sortState.dir === 'asc' ? cmp : -cmp;
    });
  }, [assets, sortState]);

  // Grouped mode: an ordered map keyed by display class, in first-occurrence order of the sort.
  const groupedAssets = useMemo(() => {
    if (!groupByClass) return null;
    const map = new Map<string, Asset[]>();
    for (const asset of sortedAssets) {
      const key = resolveDisplayAssetClass(asset);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(asset);
    }
    return map;
  }, [groupByClass, sortedAssets]);

  const toggleGroupCollapsed = (key: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const columnCount = 9 + (showDeltas ? DELTA_WINDOWS.length : 0) + 1;

  const renderRow = (asset: Asset) => {
    const value = calculateAssetValue(asset);
    const isManualPrice = requiresManualPricing(asset);
    const displayAssetClass = resolveDisplayAssetClass(asset);
    const isPending = pendingDeleteId === asset.id;
    const perf = performance[asset.id];
    const gain = computeUnrealizedGain(asset);
    const withCost = gain !== null;
    const gainLoss = gain?.gainLoss ?? 0;
    const gainPct = gain?.gainPercent ?? 0;
    const isMortgaged = asset.assetClass === 'realestate' && !!asset.outstandingDebt && asset.outstandingDebt > 0;
    // The PMC cell is the EUR PMC (fees included — the one the G/P beside it uses); a foreign row
    // keeps its native PMC under it, alone when the ledger has not projected the EUR one yet.
    const pmcEur = costBasisPerUnitEur(asset);
    const nativePmc = !isEurNative(asset) && asset.averageCost ? asset.averageCost : undefined;

    return (
      <tr
        key={asset.id}
        className={cn(
          'border-t border-border',
          isManualPrice && 'bg-[color-mix(in_oklch,var(--chart-3)_6%,transparent)]',
        )}
      >
        <th scope="row" className={cn(CELL_CLASS, 'max-w-[220px] text-left font-normal')}>
          <div className="flex min-w-0 items-center gap-2">
            <div className="min-w-0">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="block truncate font-medium text-foreground">{asset.name}</span>
                  </TooltipTrigger>
                  <TooltipContent>{asset.name}</TooltipContent>
                </Tooltip>
              </TooltipProvider>
              {/* pensionFund has no ticker input — a leftover raw value must not resurface. */}
              {asset.ticker && asset.type !== 'pensionFund' && (
                <span className="block truncate font-mono text-[11px] text-muted-foreground">{getAssetDisplayTicker(asset)}</span>
              )}
            </div>
            {asset.quantity === 0 && (
              <span className="shrink-0 rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                Azzerato
              </span>
            )}
          </div>
        </th>
        <td className={cn(CELL_CLASS, 'text-left')}>
          <AssetClassChip assetClass={displayAssetClass} />
        </td>
        <td className={cn(CELL_CLASS, 'font-mono tabular-nums')}>{formatNumber(asset.quantity, 2)}</td>
        <td className={cn(CELL_CLASS, 'font-mono tabular-nums')}>{formatCurrency(asset.currentPrice, asset.currency, 4)}</td>
        <td className={cn(CELL_CLASS, 'font-mono tabular-nums')}>
          {pmcEur !== undefined || nativePmc !== undefined ? (
            <span className="flex flex-col items-end leading-tight">
              {pmcEur !== undefined && <span>{formatCurrency(pmcEur, 'EUR', 4)}</span>}
              {nativePmc !== undefined && (
                <span className={cn(pmcEur !== undefined && 'text-[11px] text-muted-foreground')}>
                  {formatCurrency(nativePmc, asset.currency, 4)}
                </span>
              )}
            </span>
          ) : (
            <span className="text-muted-foreground">-</span>
          )}
        </td>
        <td className={cn(CELL_CLASS, 'font-mono tabular-nums text-muted-foreground')}>
          {asset.totalExpenseRatio ? formatPercentage(asset.totalExpenseRatio, 2) : '-'}
        </td>
        <td className={cn(CELL_CLASS, 'font-mono font-semibold tabular-nums')}>
          {isMortgaged ? <RealEstateValueTooltip asset={asset} value={value} /> : formatCurrency(value)}
        </td>
        <td className={cn(CELL_CLASS, 'font-mono font-medium tabular-nums')}>
          {totalValue > 0 ? formatPercentage((value / totalValue) * 100, 2) : '-'}
        </td>
        <td className={CELL_CLASS}>
          {withCost ? (
            <div className={cn('font-mono font-medium tabular-nums', getMetricValueColor(gainLoss, 'number'))}>
              <div>
                {gainLoss >= 0 ? '+' : '−'}
                {formatCurrency(Math.abs(gainLoss))}
              </div>
              <div className="text-[11px]">
                {gainPct >= 0 ? '+' : '−'}
                {formatPercentage(Math.abs(gainPct), 2)}
              </div>
            </div>
          ) : (
            <span className="text-muted-foreground">-</span>
          )}
        </td>
        {showDeltas &&
          DELTA_WINDOWS.map(({ key }) => (
            <td key={key} className={cn(CELL_CLASS, 'font-mono font-semibold tabular-nums', getMetricValueColor(perf?.[key] ?? null, 'percentage'))}>
              {formatDeltaPercent(perf?.[key] ?? null)}
            </td>
          ))}
        <td className={CELL_CLASS}>
          <div className="flex justify-end gap-0.5">
            {withCost && (
              <Button type="button" variant="ghost" size="sm" className={ICON_BUTTON_CLASS} onClick={() => onCalculateTaxes(asset)} aria-label="Calcola plusvalenze">
                <Calculator className="h-4 w-4" aria-hidden="true" />
              </Button>
            )}
            {showLedgerActions(asset) && (
              <>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className={ICON_BUTTON_CLASS}
                  onClick={() => onRegisterTrade(asset)}
                  disabled={isDemo}
                  aria-label="Registra operazione"
                  title={isDemo ? 'Non disponibile in modalità demo' : undefined}
                >
                  <ArrowLeftRight className="h-4 w-4" aria-hidden="true" />
                </Button>
                <Button type="button" variant="ghost" size="sm" className={ICON_BUTTON_CLASS} onClick={() => onMovements(asset)} aria-label="Movimenti">
                  <ScrollText className="h-4 w-4" aria-hidden="true" />
                </Button>
              </>
            )}
            {asset.type === 'pensionFund' && (
              <Button type="button" variant="ghost" size="sm" className={ICON_BUTTON_CLASS} asChild>
                <Link href="/dashboard/pension" aria-label="Vai a Previdenza">
                  <PiggyBank className="h-4 w-4" aria-hidden="true" />
                </Link>
              </Button>
            )}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className={ICON_BUTTON_CLASS}
              onClick={() => onEdit(asset)}
              disabled={isDemo}
              aria-label="Modifica asset"
              title={isDemo ? 'Non disponibile in modalità demo' : undefined}
            >
              <Pencil className="h-4 w-4" aria-hidden="true" />
            </Button>
            <Button
              type="button"
              variant={isPending ? 'destructive' : 'ghost'}
              size="sm"
              className={isPending ? 'h-8' : ICON_BUTTON_CLASS}
              onClick={() => handleDeleteClick(asset.id)}
              disabled={isDemo}
              aria-label={isPending ? 'Conferma eliminazione' : 'Elimina asset'}
              title={isDemo ? 'Non disponibile in modalità demo' : undefined}
            >
              {isPending ? <span className="px-1 text-xs">Conferma?</span> : <Trash2 className="h-4 w-4 text-destructive" aria-hidden="true" />}
            </Button>
          </div>
        </td>
      </tr>
    );
  };

  const renderGroupHeader = (cls: string, groupAssets: Asset[]) => {
    const groupTotal = groupAssets.reduce((sum, a) => sum + calculateAssetValue(a), 0);
    const groupWeight = totalValue > 0 ? (groupTotal / totalValue) * 100 : null;
    const isCollapsed = collapsedGroups.has(cls);
    const Chevron = isCollapsed ? ChevronRight : ChevronDown;
    return (
      <tr key={`group-${cls}`} className="border-t border-border bg-muted/40">
        <td colSpan={columnCount} className="p-0">
          <button
            type="button"
            onClick={() => toggleGroupCollapsed(cls)}
            aria-expanded={!isCollapsed}
            className="flex w-full items-center justify-between px-1.5 py-2 text-left hover:bg-muted/60"
          >
            <span className="flex items-center gap-2">
              <Chevron className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
              <AssetClassChip assetClass={cls} />
              <span className="text-[11px] text-muted-foreground">
                {groupAssets.length} {groupAssets.length === 1 ? 'strumento' : 'strumenti'}
              </span>
            </span>
            <span className="flex items-center gap-3 font-mono text-[12px] tabular-nums text-foreground">
              <span className="font-semibold">{formatCurrency(groupTotal)}</span>
              <span className="w-[52px] text-right text-muted-foreground">{groupWeight === null ? '-' : formatPercentage(groupWeight, 1)}</span>
            </span>
          </button>
        </td>
      </tr>
    );
  };

  return (
    <Tile
      eyebrow="Strumenti"
      ariaLabel="Strumenti"
      aside={
        assets.length > 0 ? (
          <div className="hidden items-center gap-1.5 desktop:flex">
            <Button
              type="button"
              variant={showDeltas ? 'default' : 'outline'}
              size="sm"
              className="h-7 px-2.5 text-[11px]"
              onClick={() => setShowDeltas((prev) => !prev)}
              aria-pressed={showDeltas}
            >
              <TrendingUp className="h-3 w-3" aria-hidden="true" />
              Andamento
            </Button>
            <Button
              type="button"
              variant={groupByClass ? 'default' : 'outline'}
              size="sm"
              className="h-7 px-2.5 text-[11px]"
              onClick={() => {
                setGroupByClass((prev) => !prev);
                if (groupByClass) setCollapsedGroups(new Set());
              }}
              aria-pressed={groupByClass}
            >
              <LayoutGrid className="h-3 w-3" aria-hidden="true" />
              Raggruppa per classe
            </Button>
          </div>
        ) : undefined
      }
      reading={reading}
      className={className}
    >
      {assets.length === 0 ? (
        <div className="mt-3 flex flex-col items-start gap-3">
          <p className="text-[13px] text-muted-foreground">Nessuno strumento ancora: aggiungi il primo per vedere la tabella.</p>
          <Button type="button" size="sm" onClick={onAdd} disabled={isDemo} title={isDemo ? 'Non disponibile in modalità demo' : undefined}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            Aggiungi il primo strumento
          </Button>
        </div>
      ) : (
        <>
          {/* Below desktop: flat expandable rows (the Δ windows and actions live inside each). */}
          <div className="mt-2 flex flex-col divide-y divide-border desktop:hidden">
            {sortedAssets.map((asset) => (
              <AssetRow
                key={asset.id}
                asset={asset}
                totalValue={totalValue}
                onEdit={onEdit}
                onDelete={handleDelete}
                onCalculateTaxes={hasCostBasis(asset) ? onCalculateTaxes : undefined}
                isManualPrice={requiresManualPricing(asset)}
                isDemo={isDemo}
                sparklineData={unitPriceSeries[asset.id]}
                performance={performance[asset.id]}
                showLedgerActions={showLedgerActions(asset)}
                onRegisterTrade={onRegisterTrade}
                onMovements={onMovements}
              />
            ))}
          </div>

          {/* Desktop: the table. Scrolls inside the tile when the Δ columns are on. */}
          <div className="-mx-5 mt-2 hidden overflow-x-auto px-5 desktop:block">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <SortHead column="name" align="left" sortState={sortState} onSort={handleSort}>Nome</SortHead>
                  <SortHead column="class" align="left" sortState={sortState} onSort={handleSort}>Classe</SortHead>
                  <th scope="col" className={HEAD_CLASS}>Quantità</th>
                  <th scope="col" className={HEAD_CLASS}>Prezzo</th>
                  <th scope="col" className={HEAD_CLASS}>PMC</th>
                  <th scope="col" className={HEAD_CLASS}>TER</th>
                  <SortHead column="value" sortState={sortState} onSort={handleSort}>Valore</SortHead>
                  <SortHead column="weight" sortState={sortState} onSort={handleSort}>Peso</SortHead>
                  <SortHead column="gainPct" sortState={sortState} onSort={handleSort}>G/P</SortHead>
                  {showDeltas &&
                    DELTA_WINDOWS.map(({ key, label }) => (
                      <th key={key} scope="col" className={HEAD_CLASS}>
                        {key === 'allTimeDelta' ? (
                          // The three Δ columns are price variations over time windows, not G/P.
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="inline-flex cursor-help items-center gap-1">
                                  {label}
                                  <Info className="h-3 w-3" aria-hidden="true" />
                                </span>
                              </TooltipTrigger>
                              <TooltipContent className="max-w-[240px] text-left font-normal normal-case tracking-normal">
                                Variazione del prezzo unitario nel periodo (dal primo dato registrato, per Δ Inizio). Diverso dal
                                G/P, che confronta col prezzo medio di carico (PMC). Per fondi pensione e conti non esiste.
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        ) : (
                          label
                        )}
                      </th>
                    ))}
                  <th scope="col" className={HEAD_CLASS}>Azioni</th>
                </tr>
              </thead>
              <tbody>
                {groupedAssets
                  ? Array.from(groupedAssets.entries()).flatMap(([cls, groupAssets]) => [
                      renderGroupHeader(cls, groupAssets),
                      ...(collapsedGroups.has(cls) ? [] : groupAssets.map(renderRow)),
                    ])
                  : sortedAssets.map(renderRow)}
              </tbody>
            </table>
          </div>

          {/* The tint is a theme slot (blue on the default light theme), so the copy names the
              meaning, not a hue; the «Andamento» sentence only where the toggle exists. */}
          <p className="mt-auto border-t border-border pt-3.5 text-[11px] text-muted-foreground">
            {manualCount > 0 && <span>Righe evidenziate: prezzo inserito a mano.</span>}
            {manualCount > 0 && <span className="hidden desktop:inline"> · </span>}
            <span className="hidden desktop:inline">
              Il PMC è in euro e include le commissioni d&apos;acquisto; uno strumento in valuta mostra sotto anche il PMC nella sua
              valuta. Le colonne dietro «Andamento» sono variazioni di prezzo, non G/P.
            </span>
            <span className="desktop:hidden">{manualCount === 0 && 'Apri una riga per i dettagli, le variazioni di prezzo e le azioni.'}</span>
          </p>
        </>
      )}
    </Tile>
  );
}
