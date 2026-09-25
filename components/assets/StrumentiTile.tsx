/**
 * STRUMENTI — the management table of Patrimonio, with the cadence of a tile.
 *
 * The tile answers "cosa possiedo?": eyebrow, a reading line (how many instruments, how many
 * priced by hand, how concentrated the top of the table is), then the table itself. It stays a
 * table because this is the management page: sortable columns (the three Δ windows included),
 * the «Andamento» VIEW — the three Δ windows in place of Quantità · Prezzo · PMC · TER, so the
 * table never scrolls at 1440 — the optional grouping by class, the `--chart-3` tint on
 * hand-priced rows and the two-click delete.
 *
 * Three things the table says that the storage does not (2026-09-14, the page's first critique):
 * a hand-valued holding (a property, a fund, a private-equity stake) prints its VALUE and when
 * it was typed («valore a mano dal 12/08»), never a quantity of 130.000 at 1,0000 €; a bond
 * prints its maturity and its next coupon under the name, so a BTP is not typographically a
 * crypto row; and the actions column is sticky, so switching «Andamento» on never scrolls the
 * only gestures of the page out of view (it did, by 202px at 1440).
 *
 * Below `desktop:` the table becomes a flat list of expandable rows (`AssetRow`): a card per
 * row would be a card inside the tile. The two toggles are remembered per browser
 * (localStorage): a reader who compares the Δ windows every month should not re-enable them.
 *
 * The numbers are not computed here. Δ columns and the unit-price series come from
 * `lib/utils/assetPerformanceDeltas.ts`; the concentration and the bond facts from
 * `patrimonioSummary.ts`; the words from `patrimonioNarrative.ts`. Every dialog is owned by the
 * page (one AssetDialog serves the header, the Liquidità tile and this table); the tile only
 * asks for them through callbacks.
 */
'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { useArmedDelete } from '@/lib/hooks/useArmedDelete';
import { useRovingFocus } from '@/lib/hooks/useRovingFocus';
import { Checkbox } from '@/components/ui/checkbox';
import { resolveDisplayAssetClass } from '@/lib/utils/assetDisplayClass';
import { getAssetDisplayTicker } from '@/lib/utils/assetDisplay';
import { hasMarketPrice, requiresManualPricing } from '@/lib/utils/assetPricing';
import { costBasisPerUnitEur, isEurNative } from '@/lib/utils/costBasisEur';
import { getMetricValueColor } from '@/lib/utils/metricColors';
import type { AssetPerformanceData } from '@/lib/utils/assetPerformanceDeltas';
import { computeTopWeightShare, computeUnrealizedGain, hasCostBasis, isHeld } from '@/lib/utils/patrimonioSummary';
import { describeInstruments } from '@/lib/utils/patrimonioNarrative';
import { describeWriteError } from '@/lib/utils/dialogNarrative';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Tile, TILE_SUB_EYEBROW_CLASS } from '@/components/ui/tile';
import {
  AssetClassChip,
  AssetRow,
  RealEstateValueTooltip,
  describeAssetRowSubLine,
  formatDeltaPercent,
} from '@/components/assets/AssetRow';

const DELTA_WINDOWS = [
  { key: 'lastSnapshotDelta', label: 'Δ Mese' },
  { key: 'ytdDelta', label: 'Δ YTD' },
  { key: 'allTimeDelta', label: 'Δ Inizio' },
] as const;

type DeltaKey = (typeof DELTA_WINDOWS)[number]['key'];
type SortColumn = 'value' | 'gainPct' | 'weight' | 'name' | 'class' | DeltaKey;
type SortDir = 'asc' | 'desc';
interface SortState {
  column: SortColumn;
  dir: SortDir;
}

const DELTA_KEYS: ReadonlySet<string> = new Set(DELTA_WINDOWS.map((w) => w.key));

const HEAD_CLASS = cn(TILE_SUB_EYEBROW_CLASS, 'whitespace-nowrap px-1.5 py-2.5 text-right font-semibold');
const CELL_CLASS = 'whitespace-nowrap px-1.5 py-2 text-right text-[13px] align-middle';
const ICON_BUTTON_CLASS = 'h-8 w-8';
/** The «no market quote» row tint — the same mix on the row and on its sticky cell, over the card. */
const MANUAL_ROW_TINT = 'bg-[color-mix(in_oklch,var(--chart-3)_6%,var(--card))]';
/**
 * The actions column stays in view if the table ever scrolls (a narrow desktop, a long group
 * header): sticky at `right-0` — the sticky constraint is measured from the scroller's CONTENT
 * edge, so a `right-5` meant to mirror the wrapper's `px-5` pushed the column 20px over the
 * last Δ cell on a table that did not scroll at all (seen 2026-09-14) — on the card surface so
 * the cells behind slide under it, with a 1px left rule only while the table actually scrolls.
 */
const STICKY_ACTIONS_CLASS = 'sticky right-0 z-[1] bg-card';

/** The two toggles are remembered per browser: a monthly reader keeps the Δ windows on. */
const STORAGE_KEYS = { showDeltas: 'patrimonio.strumenti.andamento', groupByClass: 'patrimonio.strumenti.raggruppa' } as const;

function readStoredToggle(key: string): boolean {
  try {
    return typeof window !== 'undefined' && window.localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

function writeStoredToggle(key: string, value: boolean): void {
  try {
    window.localStorage.setItem(key, value ? '1' : '0');
  } catch {
    // A blocked storage only forgets the toggle; the table is unaffected.
  }
}

interface SortHeadProps {
  column: SortColumn;
  children: React.ReactNode;
  align?: 'left' | 'right';
  sortState: SortState | null;
  onSort: (column: SortColumn) => void;
  className?: string;
}

/**
 * A sortable column header: the `<th>` keeps `scope`/`aria-sort` for the table semantics, the
 * BUTTON inside is the command — a focusable `<th>` was announced as a heading and took the
 * browser's default outline beside buttons wearing the app's ring (AGENTS.md → Accessibility).
 */
function SortHead({ column, children, align = 'right', sortState, onSort, className }: SortHeadProps) {
  const isActive = sortState?.column === column;
  const ariaSort: 'ascending' | 'descending' | 'none' = isActive ? (sortState.dir === 'asc' ? 'ascending' : 'descending') : 'none';
  return (
    <th scope="col" className={cn(HEAD_CLASS, align === 'left' && 'text-left', className)} aria-sort={ariaSort}>
      <button
        type="button"
        onClick={() => onSort(column)}
        className={cn(
          'inline-flex items-center gap-1 rounded-sm uppercase tracking-[0.08em] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          isActive && 'text-foreground',
        )}
      >
        {children}
        {isActive ? (
          sortState.dir === 'asc' ? <ChevronUp className="h-3 w-3" aria-hidden="true" /> : <ChevronDown className="h-3 w-3" aria-hidden="true" />
        ) : (
          <ArrowUpDown className="h-3 w-3 opacity-40" aria-hidden="true" />
        )}
      </button>
    </th>
  );
}

interface DeleteButtonProps {
  asset: Asset;
  onDelete: (assetId: string) => void;
  disabled: boolean;
  /** The tile's one live region: arm and disarm are sentences, spoken there. */
  announce: (text: string) => void;
}

/**
 * The row's two-click delete without a timer (`useArmedDelete`): a 3-second auto-disarm was a
 * WCAG 2.2.1 time limit, kept on these rows until 2026-09-14. The armed label repeats what the
 * second press loses; the arm and the disarm are announced through ONE live region per tile
 * (emptying a live region announces nothing, and one region per row made a keyboard reader hear
 * «annullata» on every Tab away).
 */
function DeleteButton({ asset, onDelete, disabled, announce }: DeleteButtonProps) {
  const ref = useRef<HTMLButtonElement | null>(null);
  const { armed, onClick, onBlur } = useArmedDelete(ref, () => onDelete(asset.id));
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

  return (
    <Button
      ref={ref}
      type="button"
      variant={armed ? 'destructive' : 'ghost'}
      size="sm"
      className={armed ? 'h-8' : ICON_BUTTON_CLASS}
      onClick={onClick}
      onBlur={onBlur}
      disabled={disabled}
      aria-pressed={armed}
      aria-label={armed ? `Premi di nuovo per eliminare ${asset.name}` : `Elimina ${asset.name}`}
      title={disabled ? 'Non disponibile in modalità demo' : undefined}
    >
      {armed ? <span className="px-1 text-xs">Conferma</span> : <Trash2 className="h-4 w-4 text-destructive" aria-hidden="true" />}
    </Button>
  );
}

interface BulkDeleteButtonProps {
  count: number;
  onDelete: () => void;
  disabled: boolean;
  /** The tile's one live region: arm and disarm are sentences, spoken there. */
  announce: (text: string) => void;
}

/**
 * The bulk delete beside «N selezionati»: the same two-click vocabulary as the row delete
 * (`useArmedDelete`, no timer), armed «Conferma» naming the count it is about to lose.
 */
function BulkDeleteButton({ count, onDelete, disabled, announce }: BulkDeleteButtonProps) {
  const ref = useRef<HTMLButtonElement | null>(null);
  const { armed, onClick, onBlur } = useArmedDelete(ref, onDelete);
  const wasArmed = useRef(false);
  useEffect(() => {
    if (armed) {
      wasArmed.current = true;
      announce(`Premi di nuovo per eliminare ${count} ${count === 1 ? 'strumento' : 'strumenti'}`);
    } else if (wasArmed.current) {
      wasArmed.current = false;
      announce('Eliminazione annullata');
    }
  }, [armed, announce, count]);

  return (
    <Button
      ref={ref}
      type="button"
      variant={armed ? 'destructive' : 'outline'}
      size="sm"
      className="h-8 px-2.5 text-[11px]"
      onClick={onClick}
      onBlur={onBlur}
      disabled={disabled}
      aria-pressed={armed}
      aria-label={armed ? `Premi di nuovo per eliminare ${count} ${count === 1 ? 'strumento' : 'strumenti'}` : `Elimina i ${count} strumenti selezionati`}
      title={disabled ? 'Non disponibile in modalità demo' : undefined}
    >
      {armed ? (
        'Conferma'
      ) : (
        <>
          <Trash2 className="h-3 w-3" aria-hidden="true" />
          Elimina {count}
        </>
      )}
    </Button>
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
  // Off by default: the Δ view replaces the price columns (see `showPriceColumns`). Both
  // toggles come back the way the reader left them (per browser).
  const [showDeltas, setShowDeltas] = useState(() => readStoredToggle(STORAGE_KEYS.showDeltas));
  const [groupByClass, setGroupByClass] = useState(() => readStoredToggle(STORAGE_KEYS.groupByClass));
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [announcement, setAnnouncement] = useState('');
  // Bulk selection: ids the reader ticked for the armed «Elimina N». Pruned against the
  // instruments on every render, so a deleted row leaves the selection with no effect.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const assetIds = useMemo(() => new Set(assets.map((a) => a.id)), [assets]);
  const validSelected = useMemo(() => new Set([...selectedIds].filter((id) => assetIds.has(id))), [selectedIds, assetIds]);
  // The dates under a row («scade il…», «valore a mano dal…») are read against one clock per mount.
  const now = useMemo(() => new Date(), []);

  // Whether the table wrapper actually scrolls: only then the sticky actions column draws its
  // left rule. Measured after every change that can widen the table.
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const [tableScrolls, setTableScrolls] = useState(false);
  useEffect(() => {
    const measure = () => {
      const el = scrollerRef.current;
      setTableScrolls(!!el && el.scrollWidth > el.clientWidth + 1);
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [showDeltas, groupByClass, assets.length]);

  // Sold-out rows stay in the table («Azzerato») but are not something the user owns: the
  // reading counts held positions only.
  const held = assets.filter(isHeld);
  const manualCount = held.filter((asset) => requiresManualPricing(asset)).length;
  const reading = describeInstruments(held.length, manualCount, computeTopWeightShare(assets, totalValue));

  // Ledger row actions apply to ledger asset types once migration has produced the meta doc.
  const showLedgerActions = (asset: Asset) => ledgerReady && isLedgerAssetType(asset.type);

  const handleDelete = useCallback(
    async (assetId: string) => {
      if (!ownerId) return;
      try {
        await deleteAssetMutation.mutateAsync(assetId);
        toast.success('Asset eliminato');
      } catch (error) {
        console.error('Error deleting asset:', error);
        toast.error(describeWriteError(error));
      }
    },
    [ownerId, deleteAssetMutation],
  );

  const toggleSelect = useCallback((assetId: string, selected: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (selected) next.add(assetId);
      else next.delete(assetId);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(
    (selected: boolean) => {
      setSelectedIds(selected ? new Set(assetIds) : new Set());
    },
    [assetIds],
  );

  // The bulk delete runs the same single-asset mutation once per row (each one also clears
  // that instrument's future dividends) and reports one sentence: a partial failure names how
  // many went through, so the selection left standing is no surprise.
  const handleDeleteSelected = useCallback(async () => {
    if (!ownerId || validSelected.size === 0) return;
    const ids = [...validSelected];
    const results = await Promise.allSettled(ids.map((id) => deleteAssetMutation.mutateAsync(id)));
    const deleted = results.filter((r) => r.status === 'fulfilled').length;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.delete(id));
      return next;
    });
    if (deleted === ids.length) {
      toast.success(deleted === 1 ? 'Asset eliminato' : `${deleted} strumenti eliminati`);
      setAnnouncement(deleted === 1 ? 'Strumento eliminato' : `${deleted} strumenti eliminati`);
    } else if (deleted > 0) {
      toast.error(`Eliminati ${deleted} di ${ids.length}: riprova per i restanti.`);
      setAnnouncement(`Eliminati ${deleted} di ${ids.length} strumenti`);
    } else {
      const reason = results.find((r) => r.status === 'rejected');
      const error = reason && reason.status === 'rejected' ? reason.reason : undefined;
      console.error('Error deleting assets:', error);
      toast.error(describeWriteError(error));
    }
  }, [ownerId, validSelected, deleteAssetMutation]);

  const toggleShowDeltas = () => {
    setShowDeltas((prev) => {
      writeStoredToggle(STORAGE_KEYS.showDeltas, !prev);
      return !prev;
    });
  };

  const toggleGroupByClass = () => {
    setGroupByClass((prev) => {
      writeStoredToggle(STORAGE_KEYS.groupByClass, !prev);
      return !prev;
    });
    if (groupByClass) setCollapsedGroups(new Set());
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
      // A Δ column: a row without the window (a pension fund, a hand-valued row) goes last in
      // both directions — «no measure» is not the smallest measure.
      if (DELTA_KEYS.has(sortState.column)) {
        const key = sortState.column as DeltaKey;
        const da = performance[a.id]?.[key] ?? null;
        const db = performance[b.id]?.[key] ?? null;
        if (da === null && db === null) return 0;
        if (da === null) return 1;
        if (db === null) return -1;
        return sortState.dir === 'asc' ? da - db : db - da;
      }
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
  }, [assets, sortState, performance]);

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

  // The desktop rows actually on screen, in the order they RENDER: grouped mode reorders by
  // class, so the roving index must follow the DOM (a collapsed group hides its rows). The
  // mobile list has no grouping and always shows the whole sort. Each checkbox list is one Tab stop.
  const visibleDesktopAssets = useMemo(() => {
    if (!groupByClass) return sortedAssets;
    const out: Asset[] = [];
    for (const [cls, group] of groupedAssets ?? []) {
      if (collapsedGroups.has(cls)) continue;
      out.push(...group);
    }
    return out;
  }, [groupByClass, sortedAssets, groupedAssets, collapsedGroups]);
  const desktopRoving = useRovingFocus(visibleDesktopAssets.length);
  const flatRoving = useRovingFocus(sortedAssets.length);
  const desktopIndex = useMemo(() => new Map(visibleDesktopAssets.map((a, i) => [a.id, i] as const)), [visibleDesktopAssets]);

  // «Andamento» is a VIEW, not four more columns: the price columns (Quantità · Prezzo · PMC ·
  // TER) leave the table and the three Δ windows take their place, so at 1440 nothing scrolls
  // and the actions never leave the reader's sight. With the Δ columns simply appended, the
  // sticky actions column covered them at rest — hiding what the toggle exists to show.
  const showPriceColumns = !showDeltas;
  const columnCount = 6 + (showPriceColumns ? 4 : 0) + (showDeltas ? DELTA_WINDOWS.length : 0) + 1;
  const stickyCellClass = cn(STICKY_ACTIONS_CLASS, tableScrolls && 'border-l border-border');

  const renderRow = (asset: Asset) => {
    const value = calculateAssetValue(asset);
    const isManualPrice = requiresManualPricing(asset);
    // A hand-VALUED holding (no market quote at all, as opposed to a quoted one the owner
    // prices by hand): its quantity, price and PMC describe the storage, not the holding.
    const isHandValued = !hasMarketPrice(asset.type, asset.subCategory);
    const displayAssetClass = resolveDisplayAssetClass(asset);
    const perf = performance[asset.id];
    const gain = computeUnrealizedGain(asset);
    const withCost = gain !== null;
    const gainLoss = gain?.gainLoss ?? 0;
    const gainPct = gain?.gainPercent ?? 0;
    const isMortgaged = asset.assetClass === 'realestate' && !!asset.outstandingDebt && asset.outstandingDebt > 0;
    // The PMC cell is the EUR PMC (fees included — the one the G/P beside it uses); a foreign row
    // keeps its native PMC under it, alone when the ledger has not projected the EUR one yet.
    const pmcEur = isHandValued ? undefined : costBasisPerUnitEur(asset);
    const nativePmc = !isHandValued && !isEurNative(asset) && asset.averageCost ? asset.averageCost : undefined;
    const subLine = describeAssetRowSubLine(asset, now);
    const dash = <span className="text-muted-foreground">—</span>;

    return (
      <tr key={asset.id} className={cn('border-t border-border', isManualPrice && MANUAL_ROW_TINT, validSelected.has(asset.id) && 'bg-muted/30')}>
        <td className="w-8 align-middle">
          {/* The label is the target (32px, the dense-list floor): a 16px square was the only way to tick. */}
          <label className="-ml-2 flex h-8 w-8 cursor-pointer items-center justify-center">
            <Checkbox
              checked={validSelected.has(asset.id)}
              onCheckedChange={(v) => toggleSelect(asset.id, v === true)}
              aria-label={`Seleziona ${asset.name}`}
              {...desktopRoving.itemProps(desktopIndex.get(asset.id) ?? 0)}
            />
          </label>
        </td>
        <th scope="row" className={cn(CELL_CLASS, 'max-w-[260px] text-left font-normal')}>
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
              {(asset.ticker && asset.type !== 'pensionFund') || asset.exchange || subLine ? (
                <span className="block truncate text-[11px] text-muted-foreground">
                  {asset.ticker && asset.type !== 'pensionFund' && <span className="font-mono">{getAssetDisplayTicker(asset)}</span>}
                  {asset.ticker && asset.type !== 'pensionFund' && (asset.exchange || subLine) && ' · '}
                  {asset.exchange && <span>{asset.exchange}</span>}
                  {asset.exchange && subLine && ' · '}
                  {subLine}
                </span>
              ) : null}
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
        {showPriceColumns && (
          <>
            <td className={cn(CELL_CLASS, 'font-mono tabular-nums')}>{isHandValued ? dash : formatNumber(asset.quantity, 2)}</td>
            <td className={cn(CELL_CLASS, 'font-mono tabular-nums')}>
              {isHandValued ? dash : formatCurrency(asset.currentPrice, asset.currency, 4)}
            </td>
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
                dash
              )}
            </td>
            <td className={cn(CELL_CLASS, 'font-mono tabular-nums text-muted-foreground')}>
              {asset.totalExpenseRatio ? formatPercentage(asset.totalExpenseRatio, 2) : '—'}
            </td>
          </>
        )}
        <td className={cn(CELL_CLASS, 'font-mono font-semibold tabular-nums')}>
          {isMortgaged ? <RealEstateValueTooltip asset={asset} value={value} /> : formatCurrency(value)}
        </td>
        <td className={cn(CELL_CLASS, 'font-mono font-medium tabular-nums')}>
          {totalValue > 0 ? formatPercentage((value / totalValue) * 100, 2) : '—'}
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
            dash
          )}
        </td>
        {showDeltas &&
          DELTA_WINDOWS.map(({ key }) => (
            <td key={key} className={cn(CELL_CLASS, 'font-mono font-semibold tabular-nums', getMetricValueColor(perf?.[key] ?? null, 'percentage'))}>
              {formatDeltaPercent(perf?.[key] ?? null)}
            </td>
          ))}
        <td className={cn(CELL_CLASS, stickyCellClass, isManualPrice && MANUAL_ROW_TINT)}>
          <div className="flex justify-end gap-0.5">
            {withCost && (
              <Button type="button" variant="ghost" size="sm" className={ICON_BUTTON_CLASS} onClick={() => onCalculateTaxes(asset)} aria-label={`Calcola plusvalenze di ${asset.name}`}>
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
                  aria-label={`Registra operazione su ${asset.name}`}
                  title={isDemo ? 'Non disponibile in modalità demo' : undefined}
                >
                  <ArrowLeftRight className="h-4 w-4" aria-hidden="true" />
                </Button>
                <Button type="button" variant="ghost" size="sm" className={ICON_BUTTON_CLASS} onClick={() => onMovements(asset)} aria-label={`Movimenti di ${asset.name}`}>
                  <ScrollText className="h-4 w-4" aria-hidden="true" />
                </Button>
              </>
            )}
            {asset.type === 'pensionFund' && (
              <Button type="button" variant="ghost" size="sm" className={ICON_BUTTON_CLASS} asChild>
                <Link href="/dashboard/pension" aria-label={`${asset.name} in Previdenza`}>
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
              aria-label={`Modifica ${asset.name}`}
              title={isDemo ? 'Non disponibile in modalità demo' : undefined}
            >
              <Pencil className="h-4 w-4" aria-hidden="true" />
            </Button>
            <DeleteButton asset={asset} onDelete={handleDelete} disabled={isDemo} announce={setAnnouncement} />
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
              <span className="w-[52px] text-right text-muted-foreground">{groupWeight === null ? '—' : formatPercentage(groupWeight, 1)}</span>
            </span>
          </button>
        </td>
      </tr>
    );
  };

  return (
    <Tile
      id="strumenti"
      eyebrow="Strumenti"
      ariaLabel="Strumenti"
      aside={
        assets.length > 0 ? (
          <div className="hidden items-center gap-1.5 desktop:flex">
            <Button
              type="button"
              variant={showDeltas ? 'default' : 'outline'}
              size="sm"
              className="h-8 px-2.5 text-[11px]"
              onClick={toggleShowDeltas}
              aria-pressed={showDeltas}
            >
              <TrendingUp className="h-3 w-3" aria-hidden="true" />
              Andamento
            </Button>
            <Button
              type="button"
              variant={groupByClass ? 'default' : 'outline'}
              size="sm"
              className="h-8 px-2.5 text-[11px]"
              onClick={toggleGroupByClass}
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
          {/* One live region for the whole tile: the arm and the disarm of any row's delete. */}
          <span className="sr-only" role="status" aria-live="polite">
            {announcement}
          </span>

          {/* The bulk bar: only while something is ticked — the count, the armed delete, the way out. */}
          {validSelected.size > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="text-[13px] text-muted-foreground">
                {validSelected.size} {validSelected.size === 1 ? 'selezionato' : 'selezionati'}
              </span>
              <BulkDeleteButton count={validSelected.size} onDelete={handleDeleteSelected} disabled={isDemo} announce={setAnnouncement} />
              <Button type="button" variant="ghost" size="sm" className="h-8 px-2.5 text-[11px]" onClick={() => setSelectedIds(new Set())}>
                Deseleziona
              </Button>
            </div>
          )}

          {/* Below desktop: flat expandable rows (the Δ windows and actions live inside each). */}
          <div className="mt-2 flex flex-col divide-y divide-border desktop:hidden" {...flatRoving.containerProps}>
            {sortedAssets.map((asset, index) => (
              <AssetRow
                key={asset.id}
                asset={asset}
                totalValue={totalValue}
                now={now}
                onEdit={onEdit}
                onDelete={handleDelete}
                announce={setAnnouncement}
                onCalculateTaxes={hasCostBasis(asset) ? onCalculateTaxes : undefined}
                isManualPrice={requiresManualPricing(asset)}
                isDemo={isDemo}
                sparklineData={unitPriceSeries[asset.id]}
                performance={performance[asset.id]}
                showLedgerActions={showLedgerActions(asset)}
                onRegisterTrade={onRegisterTrade}
                onMovements={onMovements}
                selected={validSelected.has(asset.id)}
                onToggleSelect={(v) => toggleSelect(asset.id, v)}
                roving={flatRoving.itemProps(index)}
              />
            ))}
          </div>

          {/* Desktop: the table. Scrolls inside the tile when the Δ columns are on; the actions
              column stays put. */}
          <div ref={scrollerRef} className="-mx-5 mt-2 hidden overflow-x-auto px-5 desktop:block" {...desktopRoving.containerProps}>
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th scope="col" className="w-8 text-left">
                    <label className="-ml-2 flex h-8 w-8 cursor-pointer items-center justify-center">
                      <Checkbox
                        checked={validSelected.size > 0 && validSelected.size === assets.length ? true : validSelected.size > 0 ? 'indeterminate' : false}
                        onCheckedChange={(v) => toggleSelectAll(v === true)}
                        aria-label="Seleziona tutti gli strumenti"
                      />
                    </label>
                  </th>
                  <SortHead column="name" align="left" sortState={sortState} onSort={handleSort}>Nome</SortHead>
                  <SortHead column="class" align="left" sortState={sortState} onSort={handleSort}>Classe</SortHead>
                  {showPriceColumns && (
                    <>
                      <th scope="col" className={HEAD_CLASS}>Quantità</th>
                      <th scope="col" className={HEAD_CLASS}>Prezzo</th>
                      <th scope="col" className={HEAD_CLASS}>PMC</th>
                      <th scope="col" className={HEAD_CLASS}>TER</th>
                    </>
                  )}
                  <SortHead column="value" sortState={sortState} onSort={handleSort}>Valore</SortHead>
                  <SortHead column="weight" sortState={sortState} onSort={handleSort}>Peso</SortHead>
                  <SortHead column="gainPct" sortState={sortState} onSort={handleSort}>G/P</SortHead>
                  {showDeltas &&
                    DELTA_WINDOWS.map(({ key, label }) => (
                      <SortHead key={key} column={key} sortState={sortState} onSort={handleSort}>
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
                      </SortHead>
                    ))}
                  {/* Named for a screen reader only: a visible «AZIONI» sat over a column of «Azioni» class chips. */}
                  <th scope="col" className={cn(HEAD_CLASS, stickyCellClass)}>
                    <span className="sr-only">Azioni sulla riga</span>
                  </th>
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
              {showDeltas
                ? 'Le colonne Δ sono variazioni del prezzo unitario nel periodo, non G/P; spegni «Andamento» per tornare a quantità, prezzo, PMC e TER.'
                : 'Il PMC è in euro e include le commissioni d’acquisto; uno strumento in valuta mostra sotto anche il PMC nella sua valuta. «Andamento» mostra le variazioni di prezzo al posto di queste colonne.'}
            </span>
            <span className="desktop:hidden">{manualCount === 0 && 'Apri una riga per i dettagli, le variazioni di prezzo e le azioni.'}</span>
          </p>
        </>
      )}
    </Tile>
  );
}
