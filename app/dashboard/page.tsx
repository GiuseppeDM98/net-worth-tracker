'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Asset } from '@/types/assets';
import {
  getAllAssets,
  calculateTotalValue,
  calculateLiquidNetWorth,
} from '@/lib/services/assetService';
import {
  formatCurrency,
  prepareAssetClassDistributionData,
  prepareAssetDistributionData,
} from '@/lib/services/chartService';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PieChart as PieChartComponent } from '@/components/ui/pie-chart';
import { Wallet, TrendingUp, PieChart, DollarSign } from 'lucide-react';

export default function DashboardPage() {
  const { user } = useAuth();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      loadAssets();
    }
  }, [user]);

  const loadAssets = async () => {
    if (!user) return;

    try {
      setLoading(true);
      const data = await getAllAssets(user.uid);
      setAssets(data);
    } catch (error) {
      console.error('Error loading assets:', error);
    } finally {
      setLoading(false);
    }
  };

  const totalValue = calculateTotalValue(assets);
  const liquidNetWorth = calculateLiquidNetWorth(assets);
  const assetCount = assets.length;

  // Prepare chart data
  const assetClassData = prepareAssetClassDistributionData(assets);
  const assetData = prepareAssetDistributionData(assets);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-gray-500">Caricamento...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
        <p className="mt-2 text-gray-600">
          Panoramica del tuo portafoglio di investimenti
        </p>
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
            <p className="text-xs text-muted-foreground">
              Escluso immobili e private equity
            </p>
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
            <div className="text-2xl font-bold">-</div>
            <p className="text-xs text-muted-foreground">
              Dati non disponibili
            </p>
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
    </div>
  );
}
