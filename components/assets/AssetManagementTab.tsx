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
import { getAssetClassColor } from '@/lib/constants/colors';
import { formatAssetClassName } from '@/lib/utils/assetUtils';
import { authenticatedFetch } from '@/lib/utils/authFetch';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
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
import { Plus, RefreshCw, Pencil, Trash2, Info, Calculator, ArrowUpDown, ChevronUp, ChevronDown, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import { AssetDialog } from '@/components/assets/AssetDialog';
import { AssetCard } from '@/components/assets/AssetCard';
import { TaxCalculatorModal } from '@/components/assets/TaxCalculatorModal';

type SortColumn = 'value' | 'gainPct' | 'weight' | 'name' | 'class';
type SortDir = 'asc' | 'desc';
interface SortState { column: SortColumn; dir: SortDir }

interface AssetManagementTabProps {
  assets: Asset[];
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
  return (
    <TableHead
      className={`cursor-pointer select-none hover:text-foreground ${className ?? ''}`}
      onClick={() => onSort(column)}
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

export function AssetManagementTab({ assets, loading, onRefresh, snapshots }: AssetManagementTabProps) {
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

  // Total G/P across assets with cost basis
  const assetsWithCostBasis = assets.filter((a) => a.averageCost);
  const totalGainLoss = assetsWithCostBasis.reduce(
    (sum, asset) => sum + calculateUnrealizedGains(asset),
    0
  );
  const totalCostBasis = assetsWithCostBasis.reduce(
    (sum, asset) => sum + asset.quantity * asset.averageCost!,
    0
  );
  const totalGainPct = totalCostBasis > 0 ? (totalGainLoss / totalCostBasis) * 100 : 0;
  const totalIsPositive = totalGainLoss > 0;
  const totalIsNegative = totalGainLoss < 0;
  const totalGainColor = totalIsPositive
    ? 'text-green-600'
    : totalIsNegative
    ? 'text-red-600'
    : 'text-muted-foreground';

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

  if (loading) {
    return (
      <div className="space-y-6">
        {/* Header skeleton */}
        <div className="flex flex-col gap-3 landscape:flex-row landscape:items-center landscape:justify-between">
          <div className="space-y-2">
            <div className="h-6 w-40 rounded-lg bg-muted animate-pulse" />
            <div className="h-4 w-48 rounded bg-muted animate-pulse" />
          </div>
          <div className="flex gap-2">
            <div className="h-9 w-36 rounded-md bg-muted animate-pulse" />
            <div className="h-9 w-32 rounded-md bg-muted animate-pulse" />
          </div>
        </div>
        {/* Summary card skeleton */}
        <div className="h-24 rounded-xl bg-muted animate-pulse" />
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
    <div className="space-y-6">
      {/* Header with actions + last-update timestamp */}
      <div className="flex flex-col gap-3 landscape:flex-row landscape:items-center landscape:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
            <Wallet className="h-4 w-4 text-muted-foreground" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-foreground">Gestione Asset</h2>
            <p className="text-xs text-muted-foreground">{assets.length} asset nel portfolio</p>
          </div>
        </div>
        <div className="flex flex-col landscape:flex-row gap-2">
          <Button
            type="button"
            variant="outline"
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

      {/* Total Summary Card — stacked layout: value dominates, G/P as secondary line */}
      <Card>
        <CardContent className="p-4">
          <div className="text-center desktop:text-left">
            <p className="text-xs text-muted-foreground mb-1">Totale Patrimonio</p>
            <p className="text-3xl font-bold text-foreground font-mono tracking-tight">
              {formatCurrency(totalValue)}
            </p>
            {assetsWithCostBasis.length > 0 && (
              <p className={`text-sm font-semibold font-mono mt-1.5 ${totalGainColor}`}>
                {totalIsPositive ? '+' : ''}
                {formatCurrency(totalGainLoss)}
                <span className="text-xs ml-1.5 opacity-80">
                  ({totalIsPositive ? '+' : ''}{formatNumber(totalGainPct, 2)}%)
                </span>
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
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
              {/* Mobile/Tablet Card Layout (< 1440px) */}
              <div className="desktop:hidden grid grid-cols-1 gap-4 landscape:grid-cols-2 pt-4">
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
                  />
                ))}
              </div>

              {/* Desktop Table Layout (1440px+) — 11 columns (Aggiornato removed) */}
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
                      <TableHead className="text-right">Azioni</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedAssets.map((asset) => {
                      const value = calculateAssetValue(asset);
                      const isManualPrice = requiresManualPricing(asset);
                      const assetClassColor = getAssetClassColor(asset.assetClass);
                      const isPending = pendingDeleteId === asset.id;

                      return (
                        <TableRow key={asset.id} className={isManualPrice ? 'bg-amber-50 dark:bg-amber-950/20' : ''}>
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
                                backgroundColor: `${assetClassColor}20`,
                                color: assetClassColor,
                                border: `1px solid ${assetClassColor}40`,
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
                                  ? 'text-green-600'
                                  : isNeg
                                  ? 'text-red-600'
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
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              {hasCostBasisTracking(asset) && (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleCalculateTaxes(asset)}
                                  title="Calcola Plusvalenze"
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
                                title={isDemo ? 'Non disponibile in modalità demo' : undefined}
                              >
                                {isPending ? (
                                  <span className="text-xs px-1">Conferma?</span>
                                ) : (
                                  <Trash2 className="h-4 w-4 text-red-500" />
                                )}
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                  <TableFooter>
                    <TableRow>
                      <TableCell colSpan={7} className="text-right font-semibold">
                        Totale:
                      </TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">{formatCurrency(totalValue)}</TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">100.00%</TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">
                        {assetsWithCostBasis.length > 0 ? (
                          <div className={totalGainColor}>
                            <div>
                              {totalIsPositive ? '+' : ''}
                              {formatCurrency(totalGainLoss)}
                            </div>
                            <div className="text-xs">
                              {totalIsPositive ? '+' : ''}
                              {formatNumber(totalGainPct, 2)}%
                            </div>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell />
                    </TableRow>
                  </TableFooter>
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
