/**
 * Asset Management Tab - Main Interface for Portfolio Asset Management
 *
 * Primary component for viewing, creating, editing, and deleting portfolio assets.
 *
 * Key Features:
 * - Responsive dual-view layout: table (desktop) + cards (mobile)
 * - Batch price updates via Yahoo Finance API (POST /api/prices/update)
 * - Optimistic updates for delete operations (React Query)
 * - Tax calculator integration for capital gains analysis
 * - Real-time asset value calculations (quantity × current price)
 * - Cost basis tracking and unrealized gains display
 * - Column sorting: Valore Totale, G/P%, Peso%, Nome, Classe
 * - 2-click inline delete confirmation with 3s auto-disarm
 *
 * Why POST /api/prices/update instead of client-side fetching?
 * - Yahoo Finance rate limits would fail for many assets
 * - Server can batch requests and implement exponential backoff
 * - Centralized error handling and response caching
 * - Prevents CORS issues with third-party APIs
 */
'use client';

import { useMemo, useRef, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useDemoMode } from '@/lib/hooks/useDemoMode';
import { Asset, MonthlySnapshot } from '@/types/assets';
import {
  calculateAssetValue,
  calculateTotalValue,
  calculateUnrealizedGains,
} from '@/lib/services/assetService';
import { formatCurrency, formatNumber } from '@/lib/services/chartService';
import { useDeleteAsset } from '@/lib/hooks/useAssets';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/queryKeys';
import { getAssetClassCssVar } from '@/lib/constants/colors';
import { formatAssetClassName } from '@/lib/utils/assetUtils';
import { authenticatedFetch } from '@/lib/utils/authFetch';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Plus, RefreshCw, Pencil, Trash2, Info, Calculator, ArrowUpDown, ChevronUp, ChevronDown, ChevronRight, Wallet, LayoutGrid } from 'lucide-react';
import { toast } from 'sonner';
import { AssetDialog } from '@/components/assets/AssetDialog';
import { AssetCard, type AssetPerformanceData } from '@/components/assets/AssetCard';
import { TaxCalculatorModal } from '@/components/assets/TaxCalculatorModal';
import { getItalyYear, getItalyMonth } from '@/lib/utils/dateHelpers';

// Format a % delta: "+1.2%" / "-3.4%" / "—"
function formatDeltaPct(delta: number | null): string {
  if (delta === null) return '—';
  return `${delta >= 0 ? '+' : ''}${delta.toFixed(1)}%`;
}

// Tailwind color class for a % delta value in the table.
function deltaColorClass(delta: number | null): string {
  if (delta === null) return 'text-muted-foreground';
  if (delta > 0) return 'text-green-600 dark:text-green-400';
  if (delta < 0) return 'text-red-600 dark:text-red-400';
  return 'text-muted-foreground';
}

type SortColumn = 'value' | 'gainPct' | 'weight' | 'name' | 'class';
type SortDir = 'asc' | 'desc';
interface SortState { column: SortColumn; dir: SortDir }

interface AssetManagementTabProps {
  assets: Asset[];
  /** Full portfolio list (incl. cash accounts shown separately above).
   *  Used only for the summary count + total G/P in the action bar. */
  allAssets?: Asset[];
  loading: boolean;
  onRefresh: () => Promise<void>;
  snapshots?: MonthlySnapshot[];
}

interface SortHeadProps {
  column: SortColumn;
  children: React.ReactNode;
  className?: string;
  sortState: SortState | null;
  onSort: (column: SortColumn) => void;
}

function SortHead({ column, children, className, sortState, onSort }: SortHeadProps) {
  const isActive = sortState?.column === column;
  // aria-sort communicates sort state to screen readers per WCAG 1.3.1.
  // tabIndex + onKeyDown let keyboard-only users activate sort via Enter/Space.
  const ariaSort = isActive
    ? (sortState.dir === 'asc' ? 'ascending' : 'descending')
    : 'none';
  return (
    <TableHead
      className={`cursor-pointer select-none hover:text-foreground ${className ?? ''}`}
      aria-sort={ariaSort as 'ascending' | 'descending' | 'none'}
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
          sortState.dir === 'asc' ? (
            <ChevronUp className="h-3 w-3" />
          ) : (
            <ChevronDown className="h-3 w-3" />
          )
        ) : (
          <ArrowUpDown className="h-3 w-3 opacity-40" />
        )}
      </span>
    </TableHead>
  );
}

export function AssetManagementTab({ assets, allAssets, loading, onRefresh, snapshots }: AssetManagementTabProps) {
  const { user } = useAuth();
  const isDemo = useDemoMode();
  const queryClient = useQueryClient();

  const deleteAssetMutation = useDeleteAsset(user?.uid || '');

  const [updating, setUpdating] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingAsset, setEditingAsset] = useState<Asset | null>(null);
  const [taxCalculatorOpen, setTaxCalculatorOpen] = useState(false);
  const [calculatingAsset, setCalculatingAsset] = useState<Asset | null>(null);
  const [sortState, setSortState] = useState<SortState | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | undefined>(undefined);
  const pendingDeleteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Group-by-class toggle: organises the table into per-class sections.
  const [groupByClass, setGroupByClass] = useState(false);
  // Collapsed group keys (assetClass strings) — empty set means all groups expanded.
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  // Batch update prices for all assets via server-side Yahoo Finance API
  const handleUpdatePrices = async () => {
    if (!user) return;

    try {
      setUpdating(true);
      const response = await authenticatedFetch('/api/prices/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.uid }),
      });

      const data = await response.json();

      if (response.ok) {
        toast.success(
          `Aggiornati ${data.updated} prezzi${
            data.failed.length > 0 ? `, ${data.failed.length} falliti` : ''
          }`
        );
        await onRefresh();
      } else {
        toast.error("Errore nell'aggiornamento dei prezzi");
      }
    } catch (error) {
      console.error('Error updating prices:', error);
      toast.error("Errore nell'aggiornamento dei prezzi");
    } finally {
      setUpdating(false);
    }
  };

  const handleDelete = async (assetId: string) => {
    if (!user) return;
    try {
      await deleteAssetMutation.mutateAsync(assetId);
      toast.success('Asset eliminato con successo');
    } catch (error) {
      console.error('Error deleting asset:', error);
      toast.error("Errore nell'eliminazione dell'asset");
    }
  };

  // 2-click inline delete with 3s auto-disarm (same pattern as Assistente AI delete)
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

  const handleEdit = (asset: Asset) => {
    setEditingAsset(asset);
    setDialogOpen(true);
  };

  const handleDialogClose = () => {
    setDialogOpen(false);
    setEditingAsset(null);
    if (user?.uid) {
      queryClient.invalidateQueries({ queryKey: queryKeys.assets.all(user.uid) });
    }
  };

  const handleCalculateTaxes = (asset: Asset) => {
    setCalculatingAsset(asset);
    setTaxCalculatorOpen(true);
  };

  const handleTaxCalculatorClose = () => {
    setTaxCalculatorOpen(false);
    setCalculatingAsset(null);
  };

  // An asset has cost basis tracking when averageCost is set and positive.
  // taxRate is NOT required — a user may know their PMC without having set a tax rate.
  const hasCostBasisTracking = (asset: Asset) => {
    return !!(asset.averageCost && asset.averageCost > 0);
  };

  const totalValue = calculateTotalValue(assets);

  // For the action bar summary we want to count ALL assets in the portfolio,
  // including cash accounts that are shown separately above the table.
  const summaryAssets = allAssets ?? assets;

  // Determine if asset requires manual price updates (no market ticker available)
  const requiresManualPricing = (asset: Asset) => {
    if (asset.autoUpdatePrice === false) return true;
    const manualTypes = ['realestate', 'cash'];
    if (manualTypes.includes(asset.type)) return true;
    if (asset.subCategory === 'Private Equity') return true;
    return false;
  };

  // Sort handler — first click defaults to desc (numerics) or asc (alpha)
  const handleSort = (column: SortColumn) => {
    setSortState((prev) => {
      if (prev?.column === column) {
        return { column, dir: prev.dir === 'asc' ? 'desc' : 'asc' };
      }
      const defaultDir: SortDir = column === 'name' || column === 'class' ? 'asc' : 'desc';
      return { column, dir: defaultDir };
    });
  };

  const sortedAssets = useMemo(() => {
    if (!sortState) return assets;
    return [...assets].sort((a, b) => {
      const aValue = calculateAssetValue(a);
      const bValue = calculateAssetValue(b);
      let cmp = 0;
      switch (sortState.column) {
        case 'value':
          cmp = aValue - bValue;
          break;
        case 'gainPct': {
          const aPct = a.averageCost && a.averageCost > 0
            ? (calculateUnrealizedGains(a) / (a.quantity * a.averageCost)) * 100
            : 0;
          const bPct = b.averageCost && b.averageCost > 0
            ? (calculateUnrealizedGains(b) / (b.quantity * b.averageCost)) * 100
            : 0;
          cmp = aPct - bPct;
          break;
        }
        case 'weight':
          cmp = (aValue / totalValue) - (bValue / totalValue);
          break;
        case 'name':
          cmp = a.name.localeCompare(b.name, 'it');
          break;
        case 'class':
          cmp = a.assetClass.localeCompare(b.assetClass, 'it');
          break;
      }
      return sortState.dir === 'asc' ? cmp : -cmp;
    });
  }, [assets, sortState, totalValue]);


  // Per-asset sparklines from monthly snapshots (mobile only).
  // Manual-price assets (cash, real estate, private equity, autoUpdatePrice=false) use
  // totalValue because their unit price is fixed at €1 — the quantity carries the signal.
  const assetSparklineData = useMemo(() => {
    if (!snapshots?.length) return {} as Record<string, { value: number }[]>;
    const sorted = [...snapshots].sort((a, b) =>
      a.year !== b.year ? a.year - b.year : a.month - b.month
    );
    const result: Record<string, { value: number }[]> = {};
    for (const asset of assets) {
      const useTotal = requiresManualPricing(asset);
      const points = sorted
        .flatMap((snap) => {
          const entry = snap.byAsset?.find((e) => e.assetId === asset.id);
          return entry ? [{ value: useTotal ? entry.totalValue : entry.price }] : [];
        })
        .slice(-12);
      if (points.length >= 2) result[asset.id] = points;
    }
    return result;
  }, [assets, snapshots]);

  // When groupByClass is active, partition sortedAssets into an ordered map keyed by assetClass.
  // Order is determined by first occurrence in the sorted list (respects current sort column).
  const groupedAssets = useMemo(() => {
    if (!groupByClass) return null;
    const map = new Map<string, Asset[]>();
    for (const asset of sortedAssets) {
      const key = asset.assetClass;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(asset);
    }
    return map;
  }, [groupByClass, sortedAssets]);

  // Performance deltas per asset, derived from monthly snapshots.
  // Uses the same useTotal heuristic as assetSparklineData (manual-price assets use totalValue).
  //
  // Δ Mese: compares against the last COMPLETED month's snapshot (i.e. excludes the
  // current-month snapshot if it already exists). This avoids showing 0% when the
  // cron has already snapshotted this month with today's same prices.
  const assetPerformanceData = useMemo((): Record<string, AssetPerformanceData> => {
    if (!snapshots?.length) return {};
    const italyYear = getItalyYear();
    const italyMonth = getItalyMonth();
    const sorted = [...snapshots].sort((a, b) =>
      a.year !== b.year ? a.year - b.year : a.month - b.month
    );
    const result: Record<string, AssetPerformanceData> = {};
    for (const asset of assets) {
      const useTotal = requiresManualPricing(asset);
      const currentValue = useTotal ? calculateAssetValue(asset) : asset.currentPrice;

      // Collect chronological entries with month info for this asset.
      const entries: Array<{ year: number; month: number; value: number }> = [];
      for (const snap of sorted) {
        const entry = snap.byAsset?.find((e) => e.assetId === asset.id);
        if (entry) {
          entries.push({ year: snap.year, month: snap.month, value: useTotal ? entry.totalValue : entry.price });
        }
      }

      if (entries.length === 0) {
        result[asset.id] = { lastSnapshotDelta: null, ytdDelta: null, allTimeDelta: null };
        continue;
      }

      const calcDelta = (refValue: number): number | null =>
        refValue > 0 ? ((currentValue - refValue) / refValue) * 100 : null;

      // Δ Mese: last snapshot that is NOT the current calendar month.
      // If the cron already ran this month, we skip it and use the previous month.
      const prevMonthEntry = [...entries].reverse().find(
        (e) => !(e.year === italyYear && e.month === italyMonth)
      );
      // Δ YTD: last snapshot of the previous year (Dec 31, since the cron runs daily).
      // Falls back to the first snapshot of the current year if no previous-year data exists.
      const prevYearEntries = entries.filter((e) => e.year === italyYear - 1);
      const ytdEntry = prevYearEntries.length > 0
        ? prevYearEntries[prevYearEntries.length - 1]
        : entries.find((e) => e.year === italyYear);
      const firstEntry = entries[0];

      // Δ Inizio base: prefer averageCost (actual purchase price) over the first snapshot
      // price when cost basis is tracked and the asset uses unit prices (not useTotal).
      // This gives the true return since purchase — the first snapshot may have been taken
      // days/weeks after the buy, already reflecting some price movement.
      // Falls back to first snapshot price for manual-price assets or when no cost basis exists.
      const allTimeBase =
        !useTotal && asset.averageCost && asset.averageCost > 0
          ? asset.averageCost
          : firstEntry.value;

      result[asset.id] = {
        lastSnapshotDelta: prevMonthEntry ? calcDelta(prevMonthEntry.value) : null,
        ytdDelta: ytdEntry ? calcDelta(ytdEntry.value) : null,
        allTimeDelta: calcDelta(allTimeBase),
      };
    }
    return result;
  }, [assets, snapshots]);

  const toggleGroupCollapsed = (key: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  if (loading) {
    return (
      <div className="space-y-4">
        {/* Action bar skeleton */}
        <div className="flex flex-col gap-2 landscape:flex-row landscape:items-center landscape:justify-between">
          <div className="h-4 w-48 rounded bg-muted animate-pulse" />
          <div className="flex gap-2">
            <div className="h-9 w-36 rounded-md bg-muted animate-pulse" />
            <div className="h-9 w-32 rounded-md bg-muted animate-pulse" />
          </div>
        </div>
        {/* Mobile cards skeleton */}
        <div className="desktop:hidden grid grid-cols-1 gap-4 landscape:grid-cols-2">
          {[1, 2, 3].map((i) => <div key={i} className="h-48 rounded-xl bg-muted animate-pulse" />)}
        </div>
        {/* Desktop table skeleton */}
        <div className="hidden desktop:block h-64 rounded-xl bg-muted animate-pulse" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Action bar: asset count left, actions right.
          "Raggruppa per classe" is desktop-only; the price/add buttons are always shown. */}
      <div className="flex flex-col gap-2 landscape:flex-row landscape:items-center landscape:justify-between">
        <p className="text-sm text-muted-foreground">
          {summaryAssets.length} asset nel portfolio
        </p>

        <div className="flex flex-wrap gap-2 items-center">
          {/* Raggruppa per classe — desktop only */}
          {assets.length > 0 && (
            <Button
              type="button"
              variant={groupByClass ? 'default' : 'outline'}
              size="sm"
              className="hidden desktop:inline-flex"
              onClick={() => {
                setGroupByClass((prev) => !prev);
                if (groupByClass) setCollapsedGroups(new Set());
              }}
            >
              <LayoutGrid className="mr-2 h-4 w-4" />
              Raggruppa per classe
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleUpdatePrices}
            disabled={isDemo || updating || assets.length === 0}
            title={isDemo ? 'Non disponibile in modalità demo' : undefined}
            className="w-full landscape:w-auto"
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${updating ? 'animate-spin' : ''}`} />
            Aggiorna Prezzi
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => setDialogOpen(true)}
            disabled={isDemo}
            title={isDemo ? 'Non disponibile in modalità demo' : undefined}
            className="w-full landscape:w-auto"
          >
            <Plus className="mr-2 h-4 w-4" />
            Aggiungi Asset
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {assets.length === 0 ? (
            <div className="flex h-64 flex-col items-center justify-center gap-3 text-muted-foreground">
              <Wallet className="h-10 w-10 opacity-30" />
              <p className="text-sm">Nessun asset presente.</p>
              <Button
                type="button"
                size="sm"
                onClick={() => setDialogOpen(true)}
                disabled={isDemo}
              >
                <Plus className="mr-2 h-4 w-4" />
                Aggiungi il tuo primo asset
              </Button>
            </div>
          ) : (
            <>
              {/* Mobile/Tablet Card Layout (< 1440px) — no collapse on mobile, just section labels.
                  Performance chips are always shown on mobile (no toggle needed — screen is small). */}
              <div className="desktop:hidden space-y-4 pt-4">
                {groupedAssets
                  ? Array.from(groupedAssets.entries()).map(([cls, groupAssets]) => {
                      const assetClassCssVar = getAssetClassCssVar(cls as Asset['assetClass']);
                      return (
                        <div key={cls}>
                          <p
                            className="text-xs font-semibold uppercase tracking-wider mb-2 px-1"
                            style={{ color: `var(${assetClassCssVar})` }}
                          >
                            {formatAssetClassName(cls as Asset['assetClass'])} · {groupAssets.length} asset
                          </p>
                          <div className="grid grid-cols-1 gap-4 landscape:grid-cols-2">
                            {groupAssets.map((asset) => (
                              <AssetCard
                                key={asset.id}
                                asset={asset}
                                totalValue={totalValue}
                                onEdit={handleEdit}
                                onDelete={handleDelete}
                                onCalculateTaxes={hasCostBasisTracking(asset) ? handleCalculateTaxes : undefined}
                                isManualPrice={requiresManualPricing(asset)}
                                isDemo={isDemo}
                                sparklineData={assetSparklineData[asset.id]}
                                performance={assetPerformanceData[asset.id]}
                              />
                            ))}
                          </div>
                        </div>
                      );
                    })
                  : (
                    <div className="grid grid-cols-1 gap-4 landscape:grid-cols-2">
                      {assets.map((asset) => (
                        <AssetCard
                          key={asset.id}
                          asset={asset}
                          totalValue={totalValue}
                          onEdit={handleEdit}
                          onDelete={handleDelete}
                          onCalculateTaxes={hasCostBasisTracking(asset) ? handleCalculateTaxes : undefined}
                          isManualPrice={requiresManualPricing(asset)}
                          isDemo={isDemo}
                          sparklineData={assetSparklineData[asset.id]}
                          performance={assetPerformanceData[asset.id]}
                        />
                      ))}
                    </div>
                  )}
              </div>

              {/* Desktop: Management table — Nome, Ticker, Classe, Qtà, Prezzo, PMC, TER, Valore, Peso%, G/P, Δ Mese, Δ YTD, Δ Inizio, Azioni */}
              <div className="hidden desktop:block overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <SortHead column="name" sortState={sortState} onSort={handleSort}>Nome</SortHead>
                      <TableHead>Ticker</TableHead>
                      <SortHead column="class" sortState={sortState} onSort={handleSort}>Classe</SortHead>
                      <TableHead className="text-right">Quantità</TableHead>
                      <TableHead className="text-right">Prezzo</TableHead>
                      <TableHead className="text-right">PMC</TableHead>
                      <TableHead className="text-right">TER</TableHead>
                      <SortHead column="value" className="text-right" sortState={sortState} onSort={handleSort}>Valore Totale</SortHead>
                      <SortHead column="weight" className="text-right" sortState={sortState} onSort={handleSort}>Peso %</SortHead>
                      <SortHead column="gainPct" className="text-right" sortState={sortState} onSort={handleSort}>G/P</SortHead>
                      <TableHead className="text-right">Δ Mese</TableHead>
                      <TableHead className="text-right">Δ YTD</TableHead>
                      <TableHead className="text-right">Δ Inizio</TableHead>
                      <TableHead className="text-right">Azioni</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {/* Reusable render function for a single asset row — used both in flat and grouped mode */}
                    {(() => {
                      const renderAssetRow = (asset: Asset) => {
                        const value = calculateAssetValue(asset);
                        const isManualPrice = requiresManualPricing(asset);
                        const assetClassCssVar = getAssetClassCssVar(asset.assetClass);
                        const isPending = pendingDeleteId === asset.id;
                        const perf = assetPerformanceData[asset.id];
                        return (
                          <TableRow key={asset.id} className={isManualPrice ? 'bg-[color-mix(in_oklch,var(--chart-3)_6%,transparent)]' : ''}>
                            <TableCell className="font-medium max-w-[180px]">
                              <div className="flex items-center gap-2 min-w-0">
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <span className="block truncate">{asset.name}</span>
                                    </TooltipTrigger>
                                    <TooltipContent>{asset.name}</TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                                {asset.quantity === 0 && (
                                  <span className="shrink-0 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-muted text-muted-foreground border border-border">
                                    Azzerato
                                  </span>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>{asset.ticker}</TableCell>
                            <TableCell>
                              <span
                                className="inline-flex items-center rounded-full px-2 py-1 text-xs font-medium"
                                style={{
                                  backgroundColor: `color-mix(in srgb, var(${assetClassCssVar}) 15%, transparent)`,
                                  color: `var(${assetClassCssVar})`,
                                  border: `1px solid color-mix(in srgb, var(${assetClassCssVar}) 30%, transparent)`,
                                }}
                              >
                                {formatAssetClassName(asset.assetClass)}
                              </span>
                            </TableCell>
                            <TableCell className="text-right tabular-nums">{formatNumber(asset.quantity, 2)}</TableCell>
                            <TableCell className="text-right tabular-nums">{formatCurrency(asset.currentPrice, asset.currency, 4)}</TableCell>
                            <TableCell className="text-right tabular-nums">
                              {asset.averageCost ? (
                                formatCurrency(asset.averageCost, asset.currency, 4)
                              ) : (
                                <span className="text-muted-foreground">-</span>
                              )}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {asset.totalExpenseRatio ? (
                                <span className="text-muted-foreground">{asset.totalExpenseRatio.toFixed(2)}%</span>
                              ) : (
                                <span className="text-muted-foreground">-</span>
                              )}
                            </TableCell>
                            <TableCell className="text-right font-semibold tabular-nums">
                              {asset.assetClass === 'realestate' &&
                              asset.outstandingDebt &&
                              asset.outstandingDebt > 0 ? (
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <div className="flex items-center justify-end gap-1 cursor-help">
                                        {formatCurrency(value)}
                                        <Info className="h-3 w-3 text-muted-foreground" />
                                      </div>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      <div className="text-xs space-y-1">
                                        <p>
                                          <strong>Valore lordo:</strong>{' '}
                                          {formatCurrency(asset.quantity * asset.currentPrice)}
                                        </p>
                                        <p>
                                          <strong>Debito residuo:</strong> {formatCurrency(asset.outstandingDebt)}
                                        </p>
                                        <p>
                                          <strong>Valore netto:</strong> {formatCurrency(value)}
                                        </p>
                                      </div>
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              ) : (
                                formatCurrency(value)
                              )}
                            </TableCell>
                            <TableCell className="text-right font-medium tabular-nums">
                              {totalValue > 0 ? `${((value / totalValue) * 100).toFixed(2)}%` : '-'}
                            </TableCell>
                            <TableCell className="text-right">
                              {asset.averageCost ? (
                                (() => {
                                  const gainLoss = calculateUnrealizedGains(asset);
                                  const costBasis = asset.quantity * asset.averageCost;
                                  const percentage = costBasis > 0 ? (gainLoss / costBasis) * 100 : 0;
                                  const isPos = gainLoss > 0;
                                  const isNeg = gainLoss < 0;
                                  const textColor = isPos
                                    ? 'text-green-600 dark:text-green-400'
                                    : isNeg
                                    ? 'text-red-600 dark:text-red-400'
                                    : 'text-muted-foreground';
                                  return (
                                    <div className={`${textColor} font-medium tabular-nums`}>
                                      <div>
                                        {isPos ? '+' : ''}
                                        {formatCurrency(gainLoss)}
                                      </div>
                                      <div className="text-xs">
                                        {isPos ? '+' : ''}
                                        {formatNumber(percentage, 2)}%
                                      </div>
                                    </div>
                                  );
                                })()
                              ) : (
                                <span className="text-muted-foreground">-</span>
                              )}
                            </TableCell>
                            {/* Δ Mese / Δ YTD / Δ Inizio — inline performance columns */}
                            {(['lastSnapshotDelta', 'ytdDelta', 'allTimeDelta'] as const).map((key) => (
                              <TableCell key={key} className="text-right tabular-nums">
                                <span className={`font-mono font-semibold text-sm ${deltaColorClass(perf?.[key] ?? null)}`}>
                                  {formatDeltaPct(perf?.[key] ?? null)}
                                </span>
                              </TableCell>
                            ))}
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-1">
                                {hasCostBasisTracking(asset) && (
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleCalculateTaxes(asset)}
                                    aria-label="Calcola plusvalenze"
                                  >
                                    <Calculator className="h-4 w-4" />
                                  </Button>
                                )}
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleEdit(asset)}
                                  disabled={isDemo}
                                  aria-label="Modifica asset"
                                  title={isDemo ? 'Non disponibile in modalità demo' : undefined}
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button
                                  type="button"
                                  variant={isPending ? 'destructive' : 'ghost'}
                                  size="sm"
                                  onClick={() => handleDeleteClick(asset.id)}
                                  disabled={isDemo}
                                  aria-label={isPending ? 'Conferma eliminazione' : 'Elimina asset'}
                                  title={isDemo ? 'Non disponibile in modalità demo' : undefined}
                                >
                                  {isPending ? (
                                    <span className="text-xs px-1">Conferma?</span>
                                  ) : (
                                    <Trash2 className="h-4 w-4 text-destructive" />
                                  )}
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      };

                      if (groupedAssets) {
                        // Grouped mode: one collapsible header row per asset class, then asset rows.
                        return Array.from(groupedAssets.entries()).flatMap(([cls, groupAssets]) => {
                          const assetClassCssVar = getAssetClassCssVar(cls as Asset['assetClass']);
                          const groupTotal = groupAssets.reduce(
                            (sum, a) => sum + calculateAssetValue(a),
                            0
                          );
                          const groupWeight = totalValue > 0 ? (groupTotal / totalValue) * 100 : 0;
                          const isCollapsed = collapsedGroups.has(cls);
                          const Chevron = isCollapsed ? ChevronRight : ChevronDown;

                          return [
                            // Group header row
                            <TableRow
                              key={`group-${cls}`}
                              className="bg-muted/40 hover:bg-muted/60 cursor-pointer select-none"
                              onClick={() => toggleGroupCollapsed(cls)}
                            >
                              <TableCell colSpan={14}>
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <Chevron className="h-3.5 w-3.5 text-muted-foreground" />
                                    <span
                                      className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold"
                                      style={{
                                        backgroundColor: `color-mix(in srgb, var(${assetClassCssVar}) 15%, transparent)`,
                                        color: `var(${assetClassCssVar})`,
                                        border: `1px solid color-mix(in srgb, var(${assetClassCssVar}) 30%, transparent)`,
                                      }}
                                    >
                                      {formatAssetClassName(cls as Asset['assetClass'])}
                                    </span>
                                    <span className="text-xs text-muted-foreground">
                                      {groupAssets.length} {groupAssets.length === 1 ? 'asset' : 'asset'}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-3 text-xs font-mono tabular-nums text-foreground">
                                    <span className="font-semibold">{formatCurrency(groupTotal)}</span>
                                    <span className="text-muted-foreground w-[52px] text-right">
                                      {groupWeight.toFixed(1)}%
                                    </span>
                                  </div>
                                </div>
                              </TableCell>
                            </TableRow>,
                            // Asset rows (hidden when group is collapsed)
                            ...(isCollapsed ? [] : groupAssets.map(renderAssetRow)),
                          ];
                        });
                      }

                      // Flat mode: render all assets in sort order
                      return sortedAssets.map(renderAssetRow);
                    })()}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <AssetDialog open={dialogOpen} onClose={handleDialogClose} asset={editingAsset} />

      {calculatingAsset && (
        <TaxCalculatorModal open={taxCalculatorOpen} onClose={handleTaxCalculatorClose} asset={calculatingAsset} />
      )}
    </div>
  );
}
