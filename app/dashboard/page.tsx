'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Asset, MonthlySnapshot } from '@/types/assets';
import {
  getAllAssets,
  calculateTotalValue,
  calculateLiquidNetWorth,
  calculateIlliquidNetWorth,
} from '@/lib/services/assetService';
import {
  formatCurrency,
  prepareAssetClassDistributionData,
  prepareAssetDistributionData,
} from '@/lib/services/chartService';
import { getUserSnapshots, calculateMonthlyChange } from '@/lib/services/snapshotService';
import { getExpenseStats } from '@/lib/services/expenseService';
import { ExpenseStats } from '@/types/expenses';
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

export default function DashboardPage() {
  const { user } = useAuth();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [creatingSnapshot, setCreatingSnapshot] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [existingSnapshot, setExistingSnapshot] = useState<MonthlySnapshot | null>(null);
  const [monthlyVariation, setMonthlyVariation] = useState<{
    value: number;
    percentage: number;
  } | null>(null);
  const [expenseStats, setExpenseStats] = useState<ExpenseStats | null>(null);
  const [loadingExpenses, setLoadingExpenses] = useState(false);

  useEffect(() => {
    if (user) {
      loadAssets();
      loadExpenseStats();
    }
  }, [user]);

  const loadAssets = async () => {
    if (!user) return;

    try {
      setLoading(true);
      const data = await getAllAssets(user.uid);
      setAssets(data);

      // Calculate monthly variation
      const snapshots = await getUserSnapshots(user.uid);
      if (snapshots.length > 0) {
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
          currentNetWorth = calculateTotalValue(data);
          // Previous month is the most recent snapshot
          previousSnapshot = snapshots[snapshots.length - 1];
        }

        if (previousSnapshot) {
          const variation = calculateMonthlyChange(currentNetWorth, previousSnapshot);
          setMonthlyVariation(variation);
        } else {
          setMonthlyVariation(null);
        }
      } else {
        setMonthlyVariation(null);
      }
    } catch (error) {
      console.error('Error loading assets:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadExpenseStats = async () => {
    if (!user) return;

    try {
      setLoadingExpenses(true);
      const stats = await getExpenseStats(user.uid);
      setExpenseStats(stats);
    } catch (error) {
      console.error('Error loading expense stats:', error);
      // Non mostriamo toast error per non disturbare l'utente
      setExpenseStats(null);
    } finally {
      setLoadingExpenses(false);
    }
  };

  const handleCreateSnapshot = async () => {
    if (!user) return;

    // Check if snapshot for current month already exists
    try {
      const snapshots = await getUserSnapshots(user.uid);
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

      const response = await fetch('/api/portfolio/snapshot', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: user.uid,
        }),
      });

      const result = await response.json();

      // Dismiss loading toast
      toast.dismiss('snapshot-creation');

      if (result.success) {
        toast.success(result.message);
      } else {
        toast.error(result.error || 'Errore nella creazione dello snapshot');
      }
    } catch (error) {
      console.error('Error creating snapshot:', error);
      toast.dismiss('snapshot-creation');
      toast.error('Errore nella creazione dello snapshot');
    } finally {
      setCreatingSnapshot(false);
      setExistingSnapshot(null);
    }
  };

  const totalValue = calculateTotalValue(assets);
  const liquidNetWorth = calculateLiquidNetWorth(assets);
  const illiquidNetWorth = calculateIlliquidNetWorth(assets);
  const assetCount = assets.length;

  // Prepare chart data
  const assetClassData = prepareAssetClassDistributionData(assets);
  const assetData = prepareAssetDistributionData(assets);

  // Prepare liquidity chart data
  const liquidityData = [
    {
      name: 'Liquido',
      value: liquidNetWorth,
      percentage: totalValue > 0 ? (liquidNetWorth / totalValue) * 100 : 0,
      color: '#10b981', // green
    },
    {
      name: 'Illiquido',
      value: illiquidNetWorth,
      percentage: totalValue > 0 ? (illiquidNetWorth / totalValue) * 100 : 0,
      color: '#f59e0b', // amber
    },
  ];

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
          disabled={creatingSnapshot || assetCount === 0}
          variant="default"
        >
          <Camera className="mr-2 h-4 w-4" />
          {creatingSnapshot ? 'Creazione...' : 'Crea Snapshot'}
        </Button>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Patrimonio Totale</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(totalValue)}</div>
            <p className="text-xs text-muted-foreground">
              {assetCount === 0 ? 'Aggiungi assets per iniziare' : `${assetCount} asset${assetCount !== 1 ? 's' : ''}`}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Patrimonio Liquido</CardTitle>
            <Wallet className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(liquidNetWorth)}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Numero Assets</CardTitle>
            <PieChart className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{assetCount}</div>
            <p className="text-xs text-muted-foreground">
              {assetCount === 0 ? 'Nessun asset presente' : 'Asset in portafoglio'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Variazione Mensile</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {monthlyVariation ? (
              <>
                <div className={`text-2xl font-bold ${
                  monthlyVariation.value >= 0 ? 'text-green-600' : 'text-red-600'
                }`}>
                  {monthlyVariation.value >= 0 ? '+' : ''}{formatCurrency(monthlyVariation.value)}
                </div>
                <p className={`text-xs ${
                  monthlyVariation.percentage >= 0 ? 'text-green-600' : 'text-red-600'
                }`}>
                  {monthlyVariation.percentage >= 0 ? '+' : ''}{monthlyVariation.percentage.toFixed(2)}%
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

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Distribuzione per Asset Class</CardTitle>
          </CardHeader>
          <CardContent>
            <PieChartComponent data={assetClassData} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Distribuzione per Asset</CardTitle>
          </CardHeader>
          <CardContent>
            <PieChartComponent data={assetData} />
          </CardContent>
        </Card>
      </div>

      {/* Liquidity Chart */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Liquidità Portfolio</CardTitle>
          </CardHeader>
          <CardContent>
            <PieChartComponent data={liquidityData} />
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
