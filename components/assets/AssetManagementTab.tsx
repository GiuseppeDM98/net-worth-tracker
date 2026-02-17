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
 *
 * State Management:
 * - 6 useState hooks for UI state (dialogs, modals, loading)
 * - React Query for cache invalidation after mutations
 * - Parent refresh callback for coordinating with other tabs
 *
 * Why POST /api/prices/update instead of client-side fetching?
 * - Yahoo Finance rate limits would fail for many assets
 * - Server can batch requests and implement exponential backoff
 * - Centralized error handling and response caching
 * - Prevents CORS issues with third-party APIs
 */
'use client';

import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Asset } from '@/types/assets';
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
import { Plus, RefreshCw, Pencil, Trash2, Info, Calculator } from 'lucide-react';
import { toast } from 'sonner';
import { AssetDialog } from '@/components/assets/AssetDialog';
import { AssetCard } from '@/components/assets/AssetCard';
import { TaxCalculatorModal } from '@/components/assets/TaxCalculatorModal';
import { format } from 'date-fns';
import { it } from 'date-fns/locale';

// Helper function to format asset class and type names
const formatAssetName = (name: string): string => {
  const nameMap: Record<string, string> = {
    realestate: 'Real Estate',
    equity: 'Equity',
    bonds: 'Bonds',
    crypto: 'Crypto',
    cash: 'Cash',
    commodity: 'Commodity',
  };

  return nameMap[name.toLowerCase()] || name.charAt(0).toUpperCase() + name.slice(1);
};

interface AssetManagementTabProps {
  assets: Asset[];
  loading: boolean;
  onRefresh: () => Promise<void>;
}

export function AssetManagementTab({ assets, loading, onRefresh }: AssetManagementTabProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const deleteAssetMutation = useDeleteAsset(user?.uid || '');

  const [updating, setUpdating] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingAsset, setEditingAsset] = useState<Asset | null>(null);
  const [taxCalculatorOpen, setTaxCalculatorOpen] = useState(false);
  const [calculatingAsset, setCalculatingAsset] = useState<Asset | null>(null);

  /**
   * Batch update prices for all assets via server-side Yahoo Finance API
   *
   * Why server-side batch operation?
   * - Client-side would hit Yahoo Finance rate limits with many assets
   * - Server can implement retry logic and exponential backoff
   * - Centralized error handling for failed price fetches
   * - Avoids CORS issues with third-party financial APIs
   *
   * API Contract: POST /api/prices/update
   * Request: { userId: string }
   * Response: { updated: number, failed: string[] }
   */
  const handleUpdatePrices = async () => {
    if (!user) return;

    try {
      setUpdating(true);
      const response = await fetch('/api/prices/update', {
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
        // Call parent refresh handler to update all tabs
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

  /**
   * Delete asset with optimistic UI updates
   *
   * Uses React Query mutation which automatically:
   * - Invalidates cache on success (refreshes asset list)
   * - Rolls back optimistic update on error
   * - Handles loading/error states
   */
  const handleDelete = async (assetId: string) => {
    if (!user) return;

    if (!confirm('Sei sicuro di voler eliminare questo asset?')) {
      return;
    }

    try {
      // Use React Query mutation - will auto-invalidate cache on success
      await deleteAssetMutation.mutateAsync(assetId);
      toast.success('Asset eliminato con successo');
    } catch (error) {
      console.error('Error deleting asset:', error);
      toast.error("Errore nell'eliminazione dell'asset");
    }
  };

  const handleEdit = (asset: Asset) => {
    setEditingAsset(asset);
    setDialogOpen(true);
  };

  const handleDialogClose = () => {
    setDialogOpen(false);
    setEditingAsset(null);
    // Invalidate assets cache globally - updates all pages using useAssets hook
    // This ensures allocation, performance, and other tabs reflect the changes
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

  // Check if an asset has cost basis tracking enabled
  const hasCostBasisTracking = (asset: Asset) => {
    return !!(asset.averageCost && asset.averageCost > 0 && asset.taxRate && asset.taxRate >= 0);
  };

  const totalValue = calculateTotalValue(assets);

  /**
   * Determine if asset requires manual price updates
   *
   * Complex decision tree based on asset characteristics:
   * 1. If autoUpdatePrice explicitly false → manual (user override)
   * 2. If type is real estate or cash → manual (no market price)
   * 3. If subcategory is Private Equity → manual (fund valuations)
   * 4. Otherwise → automatic via Yahoo Finance
   *
   * Why this matters?
   * - Manual assets show "Update Price" button instead of auto-refresh
   * - Batch price update skips manual assets to avoid API errors
   * - UI tooltips explain why price can't be automatically fetched
   *
   * @param asset - The asset to check
   * @returns true if asset requires manual price entry
   */
  const requiresManualPricing = (asset: Asset) => {
    // If autoUpdatePrice is explicitly set to false (user override)
    if (asset.autoUpdatePrice === false) {
      return true;
    }
    // Types that don't support automatic updates (no market price available)
    const manualTypes = ['realestate', 'cash'];
    if (manualTypes.includes(asset.type)) {
      return true;
    }
    // Private Equity subcategory (periodic fund valuations, not daily prices)
    if (asset.subCategory === 'Private Equity') {
      return true;
    }
    return false;
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-gray-500">Caricamento...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with action buttons */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Gestione Asset</h2>
          <p className="mt-1 text-sm text-gray-600">
            Gestisci i tuoi asset di investimento
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <Button
            variant="outline"
            onClick={handleUpdatePrices}
            disabled={updating || assets.length === 0}
            className="w-full sm:w-auto"
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${updating ? 'animate-spin' : ''}`} />
            Aggiorna Prezzi
          </Button>
          <Button onClick={() => setDialogOpen(true)} className="w-full sm:w-auto">
            <Plus className="mr-2 h-4 w-4" />
            Aggiungi Asset
          </Button>
        </div>
      </div>

      {/* Total Summary Card - Shown at top for both mobile and desktop */}
      <Card className="border-2 border-primary">
        <CardContent className="p-4">
          <div className="flex justify-between items-center">
            <div>
              <p className="text-sm text-gray-500">Totale Patrimonio</p>
              <p className="text-2xl font-bold text-gray-900">{formatCurrency(totalValue)}</p>
            </div>
            {(() => {
              const assetsWithCostBasis = assets.filter((a) => a.averageCost);
              if (assetsWithCostBasis.length === 0) return null;

              const totalGainLoss = assetsWithCostBasis.reduce(
                (sum, asset) => sum + calculateUnrealizedGains(asset),
                0
              );
              const totalCostBasis = assetsWithCostBasis.reduce(
                (sum, asset) => sum + asset.quantity * asset.averageCost!,
                0
              );
              const totalPercentage = totalCostBasis > 0 ? (totalGainLoss / totalCostBasis) * 100 : 0;

              const isPositive = totalGainLoss > 0;
              const isNegative = totalGainLoss < 0;
              const textColor = isPositive
                ? 'text-green-600'
                : isNegative
                ? 'text-red-600'
                : 'text-gray-600';

              return (
                <div className="text-right">
                  <p className="text-sm text-gray-500">G/P Totale</p>
                  <div className={`font-semibold ${textColor}`}>
                    <div className="text-lg">
                      {isPositive ? '+' : ''}
                      {formatCurrency(totalGainLoss)}
                    </div>
                    <div className="text-xs">
                      {isPositive ? '+' : ''}
                      {formatNumber(totalPercentage, 2)}%
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          {assets.length === 0 ? (
            <div className="flex h-64 items-center justify-center text-gray-500">
              Nessun asset presente. Clicca su "Aggiungi Asset" per iniziare.
            </div>
          ) : (
            <>
              {/* Mobile Card Layout */}
              <div className="md:hidden space-y-4 pt-4">
                {assets.map((asset) => (
                  <AssetCard
                    key={asset.id}
                    asset={asset}
                    totalValue={totalValue}
                    onEdit={handleEdit}
                    onDelete={handleDelete}
                    onCalculateTaxes={hasCostBasisTracking(asset) ? handleCalculateTaxes : undefined}
                    isManualPrice={requiresManualPricing(asset)}
                  />
                ))}
              </div>

              {/* Desktop Table Layout */}
              <div className="hidden md:block overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead>Ticker</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Classe</TableHead>
                      <TableHead className="text-right">Quantità</TableHead>
                      <TableHead className="text-right">Prezzo</TableHead>
                      <TableHead className="text-right">PMC</TableHead>
                      <TableHead className="text-right">TER</TableHead>
                      <TableHead className="text-right">Valore Totale</TableHead>
                      <TableHead className="text-right">Peso in %</TableHead>
                      <TableHead className="text-right">G/P</TableHead>
                      <TableHead>Ultimo Aggiornamento</TableHead>
                      <TableHead className="text-right">Azioni</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {assets.map((asset) => {
                      const value = calculateAssetValue(asset);
                      const lastUpdate =
                        asset.lastPriceUpdate instanceof Date ? asset.lastPriceUpdate : new Date();
                      const isManualPrice = requiresManualPricing(asset);
                      const assetClassColor = getAssetClassColor(asset.assetClass);

                      return (
                        <TableRow key={asset.id} className={isManualPrice ? 'bg-amber-50' : ''}>
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-2">
                              {asset.name}
                              {asset.quantity === 0 && (
                                <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-500 border border-gray-300">
                                  Azzerato
                                </span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>{asset.ticker}</TableCell>
                          <TableCell>{formatAssetName(asset.type)}</TableCell>
                          <TableCell>
                            <span
                              className="inline-flex items-center rounded-full px-2 py-1 text-xs font-medium"
                              style={{
                                backgroundColor: `${assetClassColor}20`,
                                color: assetClassColor,
                                border: `1px solid ${assetClassColor}40`,
                              }}
                            >
                              {formatAssetName(asset.assetClass)}
                            </span>
                          </TableCell>
                          <TableCell className="text-right">{formatNumber(asset.quantity, 2)}</TableCell>
                          <TableCell className="text-right">{formatCurrency(asset.currentPrice, asset.currency, 4)}</TableCell>
                          <TableCell className="text-right">
                            {asset.averageCost ? (
                              formatCurrency(asset.averageCost, asset.currency, 4)
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            {asset.totalExpenseRatio ? (
                              <span className="text-purple-600">{asset.totalExpenseRatio.toFixed(2)}%</span>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right font-semibold">
                            {asset.assetClass === 'realestate' &&
                            asset.outstandingDebt &&
                            asset.outstandingDebt > 0 ? (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <div className="flex items-center justify-end gap-1 cursor-help">
                                      {formatCurrency(value)}
                                      <Info className="h-3 w-3 text-gray-400" />
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
                          <TableCell className="text-right font-medium text-blue-600">
                            {totalValue > 0 ? `${((value / totalValue) * 100).toFixed(2)}%` : '-'}
                          </TableCell>
                          <TableCell className="text-right">
                            {asset.averageCost ? (
                              (() => {
                                const gainLoss = calculateUnrealizedGains(asset);
                                const costBasis = asset.quantity * asset.averageCost;
                                const percentage = costBasis > 0 ? (gainLoss / costBasis) * 100 : 0;
                                const isPositive = gainLoss > 0;
                                const isNegative = gainLoss < 0;
                                const textColor = isPositive
                                  ? 'text-green-600'
                                  : isNegative
                                  ? 'text-red-600'
                                  : 'text-gray-600';

                                return (
                                  <div className={`${textColor} font-medium`}>
                                    <div>
                                      {isPositive ? '+' : ''}
                                      {formatCurrency(gainLoss)}
                                    </div>
                                    <div className="text-xs">
                                      {isPositive ? '+' : ''}
                                      {formatNumber(percentage, 2)}%
                                    </div>
                                  </div>
                                );
                              })()
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {format(lastUpdate, 'dd/MM/yyyy HH:mm', {
                              locale: it,
                            })}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              {hasCostBasisTracking(asset) && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleCalculateTaxes(asset)}
                                  title="Calcola Plusvalenze"
                                >
                                  <Calculator className="h-4 w-4 text-blue-600" />
                                </Button>
                              )}
                              <Button variant="ghost" size="sm" onClick={() => handleEdit(asset)}>
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => handleDelete(asset.id)}>
                                <Trash2 className="h-4 w-4 text-red-500" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                  <TableFooter>
                    <TableRow>
                      <TableCell colSpan={8} className="text-right font-semibold">
                        Totale:
                      </TableCell>
                      <TableCell className="text-right font-semibold">{formatCurrency(totalValue)}</TableCell>
                      <TableCell className="text-right font-semibold text-blue-600">100.00%</TableCell>
                      <TableCell className="text-right font-semibold">
                        {(() => {
                          // Calculate total gain/loss
                          const assetsWithCostBasis = assets.filter((a) => a.averageCost);
                          const totalGainLoss = assetsWithCostBasis.reduce(
                            (sum, asset) => sum + calculateUnrealizedGains(asset),
                            0
                          );
                          const totalCostBasis = assetsWithCostBasis.reduce(
                            (sum, asset) => sum + asset.quantity * asset.averageCost!,
                            0
                          );
                          const totalPercentage =
                            totalCostBasis > 0 ? (totalGainLoss / totalCostBasis) * 100 : 0;

                          const isPositive = totalGainLoss > 0;
                          const isNegative = totalGainLoss < 0;
                          const textColor = isPositive
                            ? 'text-green-600'
                            : isNegative
                            ? 'text-red-600'
                            : 'text-gray-600';

                          return assetsWithCostBasis.length > 0 ? (
                            <div className={`${textColor}`}>
                              <div>
                                {isPositive ? '+' : ''}
                                {formatCurrency(totalGainLoss)}
                              </div>
                              <div className="text-xs">
                                {isPositive ? '+' : ''}
                                {formatNumber(totalPercentage, 2)}%
                              </div>
                            </div>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          );
                        })()}
                      </TableCell>
                      <TableCell colSpan={2}></TableCell>
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
