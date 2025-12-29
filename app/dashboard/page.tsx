'use client';

import { useMemo, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { MonthlySnapshot } from '@/types/assets';
import {
  calculateTotalValue,
  calculateLiquidNetWorth,
  calculateIlliquidNetWorth,
  calculateTotalUnrealizedGains,
  calculateTotalEstimatedTaxes,
  calculateLiquidEstimatedTaxes,
  calculateGrossTotal,
  calculateNetTotal,
  calculatePortfolioWeightedTER,
  calculateAnnualPortfolioCost,
} from '@/lib/services/assetService';
import {
  formatCurrency,
  prepareAssetClassDistributionData,
  prepareAssetDistributionData,
} from '@/lib/services/chartService';
import { calculateMonthlyChange, calculateYearlyChange } from '@/lib/services/snapshotService';
import { updateHallOfFame } from '@/lib/services/hallOfFameService';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PieChart as PieChartComponent } from '@/components/ui/pie-chart';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Wallet, TrendingUp, PieChart, DollarSign, Camera, TrendingDown, Receipt } from 'lucide-react';
import { toast } from 'sonner';
import { useAssets } from '@/lib/hooks/useAssets';
import { useSnapshots, useCreateSnapshot } from '@/lib/hooks/useSnapshots';
import { useExpenseStats } from '@/lib/hooks/useExpenseStats';

export default function DashboardPage() {
  const { user } = useAuth();

  // React Query hooks - automatic parallel data fetching with caching
  const { data: assets = [], isLoading: loadingAssets } = useAssets(user?.uid);
  const { data: snapshots = [], isLoading: loadingSnapshots } = useSnapshots(user?.uid);
  const { data: expenseStats, isLoading: loadingExpenses } = useExpenseStats(user?.uid);
  const createSnapshotMutation = useCreateSnapshot(user?.uid || '');

  const loading = loadingAssets || loadingSnapshots;

  const [creatingSnapshot, setCreatingSnapshot] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [existingSnapshot, setExistingSnapshot] = useState<MonthlySnapshot | null>(null);

  // Memoize portfolio calculations
  const portfolioMetrics = useMemo(() => ({
    totalValue: calculateTotalValue(assets),
    liquidNetWorth: calculateLiquidNetWorth(assets),
    illiquidNetWorth: calculateIlliquidNetWorth(assets),
    assetCount: assets.length,
    unrealizedGains: calculateTotalUnrealizedGains(assets),
    estimatedTaxes: calculateTotalEstimatedTaxes(assets),
    liquidEstimatedTaxes: calculateLiquidEstimatedTaxes(assets),
    grossTotal: calculateGrossTotal(assets),
    netTotal: calculateNetTotal(assets),
    portfolioTER: calculatePortfolioWeightedTER(assets),
    annualPortfolioCost: calculateAnnualPortfolioCost(assets),
  }), [assets]);

  // Memoize variation calculations
  const variations = useMemo(() => {
    if (snapshots.length === 0) return { monthly: null, yearly: null };

    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;

    // Check if a snapshot exists for the current month
    const currentMonthSnapshot = snapshots.find(
      (s) => s.year === currentYear && s.month === currentMonth
    );

    let currentNetWorth: number;
    let previousSnapshot: MonthlySnapshot | null;

    if (currentMonthSnapshot) {
      // Use the current month's snapshot
      currentNetWorth = currentMonthSnapshot.totalNetWorth;
      // Previous month is the second-to-last snapshot
      previousSnapshot = snapshots.length > 1
        ? snapshots[snapshots.length - 2]
        : null;
    } else {
      // No current month snapshot, use live portfolio value
      currentNetWorth = portfolioMetrics.totalValue;
      // Previous month is the most recent snapshot
      previousSnapshot = snapshots[snapshots.length - 1];
    }

    const monthlyVariation = previousSnapshot
      ? calculateMonthlyChange(currentNetWorth, previousSnapshot)
      : null;

    const yearlyVariation = calculateYearlyChange(currentNetWorth, snapshots);

    return { monthly: monthlyVariation, yearly: yearlyVariation };
  }, [snapshots, portfolioMetrics.totalValue]);

  // Memoize chart data
  const chartData = useMemo(() => {
    const assetClassData = prepareAssetClassDistributionData(assets);
    const assetData = prepareAssetDistributionData(assets);

    const liquidityData = [
      {
        name: 'Liquido',
        value: portfolioMetrics.liquidNetWorth,
        percentage: portfolioMetrics.totalValue > 0
          ? (portfolioMetrics.liquidNetWorth / portfolioMetrics.totalValue) * 100
          : 0,
        color: '#10b981', // green
      },
      {
        name: 'Illiquido',
        value: portfolioMetrics.illiquidNetWorth,
        percentage: portfolioMetrics.totalValue > 0
          ? (portfolioMetrics.illiquidNetWorth / portfolioMetrics.totalValue) * 100
          : 0,
        color: '#f59e0b', // amber
      },
    ];

    return { assetClassData, assetData, liquidityData };
  }, [assets, portfolioMetrics.liquidNetWorth, portfolioMetrics.illiquidNetWorth, portfolioMetrics.totalValue]);

  const handleCreateSnapshot = async () => {
    if (!user) return;

    // Check if snapshot for current month already exists
    try {
      const now = new Date();
      const currentYear = now.getFullYear();
      const currentMonth = now.getMonth() + 1;

      const existing = snapshots.find(
        (s) => s.year === currentYear && s.month === currentMonth
      );

      if (existing) {
        setExistingSnapshot(existing);
        setShowConfirmDialog(true);
      } else {
        await createSnapshot();
      }
    } catch (error) {
      console.error('Error checking existing snapshots:', error);
      toast.error('Errore nel controllo degli snapshot esistenti');
    }
  };

  const createSnapshot = async () => {
    if (!user) return;

    try {
      setCreatingSnapshot(true);
      setShowConfirmDialog(false);

      // Show loading toast
      toast.loading('Aggiornamento prezzi e creazione snapshot...', {
        id: 'snapshot-creation',
      });

      // Use mutation hook to create snapshot
      const result = await createSnapshotMutation.mutateAsync({});

      // Dismiss loading toast
      toast.dismiss('snapshot-creation');

      toast.success(result.message);

      // Update Hall of Fame after successful snapshot creation
      try {
        await updateHallOfFame(user.uid);
        console.log('Hall of Fame updated successfully');
      } catch (error) {
        console.error('Error updating Hall of Fame:', error);
        // Don't show error to user - Hall of Fame update is non-critical
      }

      // React Query automatically refetches snapshots via cache invalidation in the mutation hook
    } catch (error) {
      console.error('Error creating snapshot:', error);
      toast.dismiss('snapshot-creation');
      toast.error('Errore nella creazione dello snapshot');
    } finally {
      setCreatingSnapshot(false);
      setExistingSnapshot(null);
    }
  };

  // Calculate derived values for display
  const liquidNetTotal = portfolioMetrics.liquidNetWorth - portfolioMetrics.liquidEstimatedTaxes;

  // Check if any asset has cost basis tracking enabled
  const hasCostBasisTracking = assets.some(a => (a.averageCost && a.averageCost > 0) || (a.taxRate && a.taxRate > 0));

  // Check if any asset has TER tracking
  const hasTERTracking = assets.some(a => a.totalExpenseRatio && a.totalExpenseRatio > 0);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-gray-500">Caricamento...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
          <p className="mt-2 text-gray-600">
            Panoramica del tuo portafoglio di investimenti
          </p>
        </div>
        <Button
          onClick={handleCreateSnapshot}
          disabled={creatingSnapshot || portfolioMetrics.assetCount === 0}
          variant="default"
        >
          <Camera className="mr-2 h-4 w-4" />
          {creatingSnapshot ? 'Creazione...' : 'Crea Snapshot'}
        </Button>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Patrimonio Totale Lordo</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(portfolioMetrics.totalValue)}</div>
            <p className="text-xs text-muted-foreground">
              {portfolioMetrics.assetCount === 0 ? 'Aggiungi assets per iniziare' : `${portfolioMetrics.assetCount} asset${portfolioMetrics.assetCount !== 1 ? 's' : ''}`}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Patrimonio Liquido Lordo</CardTitle>
            <Wallet className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(portfolioMetrics.liquidNetWorth)}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Numero Assets</CardTitle>
            <PieChart className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{portfolioMetrics.assetCount}</div>
            <p className="text-xs text-muted-foreground">
              {portfolioMetrics.assetCount === 0 ? 'Nessun asset presente' : 'Asset in portafoglio'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Cost Basis Cards - only show if any asset has cost basis tracking */}
      {hasCostBasisTracking && (
        <>
          {/* Net Worth Cards */}
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Patrimonio Totale Netto</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-blue-600">
                  {formatCurrency(portfolioMetrics.netTotal)}
                </div>
                <p className="text-xs text-muted-foreground">
                  Dopo tasse stimate
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Patrimonio Liquido Netto</CardTitle>
                <Wallet className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-blue-600">
                  {formatCurrency(liquidNetTotal)}
                </div>
                <p className="text-xs text-muted-foreground">
                  Liquidità dopo tasse stimate
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Gains and Taxes Cards */}
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Plusvalenze Non Realizzate</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className={`text-2xl font-bold ${
                  portfolioMetrics.unrealizedGains >= 0 ? 'text-green-600' : 'text-red-600'
                }`}>
                  {portfolioMetrics.unrealizedGains >= 0 ? '+' : ''}{formatCurrency(portfolioMetrics.unrealizedGains)}
                </div>
                <p className="text-xs text-muted-foreground">
                  Guadagno/perdita rispetto al costo medio
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Tasse Stimate</CardTitle>
                <Receipt className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-orange-600">
                  {formatCurrency(portfolioMetrics.estimatedTaxes)}
                </div>
                <p className="text-xs text-muted-foreground">
                  Imposte su plusvalenze non realizzate
                </p>
              </CardContent>
            </Card>
          </div>
        </>
      )}

      {/* Variazioni Cards */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Variazione Mensile</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {variations.monthly ? (
              <>
                <div className={`text-2xl font-bold ${
                  variations.monthly.value >= 0 ? 'text-green-600' : 'text-red-600'
                }`}>
                  {variations.monthly.value >= 0 ? '+' : ''}{formatCurrency(variations.monthly.value)}
                </div>
                <p className={`text-xs ${
                  variations.monthly.percentage >= 0 ? 'text-green-600' : 'text-red-600'
                }`}>
                  {variations.monthly.percentage >= 0 ? '+' : ''}{variations.monthly.percentage.toFixed(2)}%
                </p>
              </>
            ) : (
              <>
                <div className="text-2xl font-bold">-</div>
                <p className="text-xs text-muted-foreground">
                  Dati non disponibili
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Variazione Annuale (YTD)</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {variations.yearly ? (
              <>
                <div className={`text-2xl font-bold ${
                  variations.yearly.value >= 0 ? 'text-green-600' : 'text-red-600'
                }`}>
                  {variations.yearly.value >= 0 ? '+' : ''}{formatCurrency(variations.yearly.value)}
                </div>
                <p className={`text-xs ${
                  variations.yearly.percentage >= 0 ? 'text-green-600' : 'text-red-600'
                }`}>
                  {variations.yearly.percentage >= 0 ? '+' : ''}{variations.yearly.percentage.toFixed(2)}%
                </p>
              </>
            ) : (
              <>
                <div className="text-2xl font-bold">-</div>
                <p className="text-xs text-muted-foreground">
                  Dati non disponibili
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Expense Stats Cards */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Entrate Questo Mese</CardTitle>
            <TrendingUp className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            {loadingExpenses ? (
              <div className="text-sm text-muted-foreground">Caricamento...</div>
            ) : expenseStats ? (
              <>
                <div className="text-2xl font-bold text-green-600">
                  {formatCurrency(expenseStats.currentMonth.income)}
                </div>
                <p className={`text-xs ${
                  expenseStats.delta.income >= 0 ? 'text-green-600' : 'text-red-600'
                }`}>
                  {expenseStats.delta.income >= 0 ? '+' : ''}{expenseStats.delta.income.toFixed(1)}% dal mese scorso
                </p>
              </>
            ) : (
              <>
                <div className="text-2xl font-bold">€0,00</div>
                <p className="text-xs text-muted-foreground">Nessun dato</p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Spese Questo Mese</CardTitle>
            <TrendingDown className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            {loadingExpenses ? (
              <div className="text-sm text-muted-foreground">Caricamento...</div>
            ) : expenseStats ? (
              <>
                <div className="text-2xl font-bold text-red-600">
                  {formatCurrency(expenseStats.currentMonth.expenses)}
                </div>
                <p className={`text-xs ${
                  expenseStats.delta.expenses >= 0 ? 'text-red-600' : 'text-green-600'
                }`}>
                  {expenseStats.delta.expenses >= 0 ? '+' : ''}{expenseStats.delta.expenses.toFixed(1)}% dal mese scorso
                </p>
              </>
            ) : (
              <>
                <div className="text-2xl font-bold">€0,00</div>
                <p className="text-xs text-muted-foreground">Nessun dato</p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* TER Cards - only show if any asset has TER tracking */}
      {hasTERTracking && (
        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">TER Portfolio</CardTitle>
              <Receipt className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-purple-600">
                {portfolioMetrics.portfolioTER.toFixed(2)}%
              </div>
              <p className="text-xs text-muted-foreground">
                Total Expense Ratio medio ponderato
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Costo Annuale Portfolio</CardTitle>
              <TrendingDown className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-orange-600">
                {formatCurrency(portfolioMetrics.annualPortfolioCost)}
              </div>
              <p className="text-xs text-muted-foreground">
                Costi di gestione annuali stimati
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Distribuzione per Asset Class</CardTitle>
          </CardHeader>
          <CardContent>
            <PieChartComponent data={chartData.assetClassData} />
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Distribuzione per Asset</CardTitle>
          </CardHeader>
          <CardContent>
            <PieChartComponent data={chartData.assetData} />
          </CardContent>
        </Card>
      </div>

      {/* Liquidity Chart */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Liquidità Portfolio</CardTitle>
          </CardHeader>
          <CardContent>
            <PieChartComponent data={chartData.liquidityData} />
          </CardContent>
        </Card>
      </div>

      {/* Confirm Dialog */}
      <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Snapshot già esistente</DialogTitle>
            <DialogDescription>
              Esiste già uno snapshot per questo mese (
              {existingSnapshot &&
                `${String(existingSnapshot.month).padStart(2, '0')}/${existingSnapshot.year}`}
              ). Vuoi sovrascriverlo con i dati attuali?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowConfirmDialog(false)}
              disabled={creatingSnapshot}
            >
              Annulla
            </Button>
            <Button
              onClick={createSnapshot}
              disabled={creatingSnapshot}
            >
              {creatingSnapshot ? 'Creazione...' : 'Sovrascrivi'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
