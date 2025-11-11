'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { getAllAssets } from '@/lib/services/assetService';
import { getUserSnapshots } from '@/lib/services/snapshotService';
import {
  getTargets,
  compareAllocations,
  getDefaultTargets,
} from '@/lib/services/assetAllocationService';
import {
  prepareNetWorthHistoryData,
  prepareAssetDistributionData,
  formatCurrency,
  formatPercentage,
} from '@/lib/services/chartService';
import { Asset, MonthlySnapshot, AssetAllocationTarget } from '@/types/assets';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';
import { toast } from 'sonner';
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { getAssetClassColor } from '@/lib/constants/colors';

export default function HistoryPage() {
  const { user } = useAuth();
  const [snapshots, setSnapshots] = useState<MonthlySnapshot[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [targets, setTargets] = useState<AssetAllocationTarget | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      loadData();
    }
  }, [user]);

  const loadData = async () => {
    if (!user) return;

    try {
      setLoading(true);
      const [snapshotsData, assetsData, targetsData] = await Promise.all([
        getUserSnapshots(user.uid),
        getAllAssets(user.uid),
        getTargets(user.uid),
      ]);

      setSnapshots(snapshotsData);
      setAssets(assetsData);
      setTargets(targetsData || getDefaultTargets());
    } catch (error) {
      console.error('Error loading history data:', error);
      toast.error('Errore nel caricamento dello storico');
    } finally {
      setLoading(false);
    }
  };

  const handleExportCSV = () => {
    if (snapshots.length === 0) {
      toast.error('Nessun dato da esportare');
      return;
    }

    // Create CSV content
    const headers = ['Data', 'Patrimonio Totale', 'Patrimonio Liquido', 'Patrimonio Illiquido'];
    const rows = snapshots.map((snapshot) => [
      `${String(snapshot.month).padStart(2, '0')}/${snapshot.year}`,
      snapshot.totalNetWorth,
      snapshot.liquidNetWorth,
      snapshot.illiquidNetWorth || 0,
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map((row) => row.join(',')),
    ].join('\n');

    // Download file
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `net-worth-history-${Date.now()}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast.success('Storico esportato con successo');
  };

  const netWorthHistory = prepareNetWorthHistoryData(snapshots);
  const assetDistribution = prepareAssetDistributionData(assets);

  // Prepare current vs target data
  const allocation = compareAllocations(
    assets,
    targets || getDefaultTargets()
  );

  const currentVsTargetData = Object.entries(allocation.byAssetClass).map(
    ([assetClass, data]) => ({
      name: assetClass,
      corrente: data.currentPercentage,
      target: data.targetPercentage,
      color: getAssetClassColor(assetClass),
    })
  );

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
          <h1 className="text-3xl font-bold text-gray-900">Storico</h1>
          <p className="mt-2 text-gray-600">
            Analizza l'evoluzione del tuo patrimonio nel tempo
          </p>
        </div>
        <Button
          variant="outline"
          onClick={handleExportCSV}
          disabled={snapshots.length === 0}
        >
          <Download className="mr-2 h-4 w-4" />
          Esporta CSV
        </Button>
      </div>

      {/* Net Worth History Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Evoluzione Patrimonio Netto</CardTitle>
        </CardHeader>
        <CardContent>
          {netWorthHistory.length === 0 ? (
            <div className="flex h-64 items-center justify-center text-gray-500">
              Nessuno storico disponibile. Gli snapshot mensili verranno creati
              automaticamente.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={400}>
              <LineChart data={netWorthHistory}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis
                  tickFormatter={(value) =>
                    formatCurrency(value).replace(/,00$/, '')
                  }
                />
                <Tooltip
                  formatter={(value: number) => formatCurrency(value)}
                  labelStyle={{ color: '#000' }}
                />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="totalNetWorth"
                  stroke="#3B82F6"
                  strokeWidth={2}
                  name="Patrimonio Totale"
                  dot={{ r: 4 }}
                />
                <Line
                  type="monotone"
                  dataKey="liquidNetWorth"
                  stroke="#10B981"
                  strokeWidth={2}
                  name="Patrimonio Liquido"
                  dot={{ r: 4 }}
                />
                <Line
                  type="monotone"
                  dataKey="illiquidNetWorth"
                  stroke="#F59E0B"
                  strokeWidth={2}
                  name="Patrimonio Illiquido"
                  dot={{ r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Liquidity Evolution Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Evoluzione Liquidità vs Illiquidità</CardTitle>
        </CardHeader>
        <CardContent>
          {netWorthHistory.length === 0 ? (
            <div className="flex h-64 items-center justify-center text-gray-500">
              Nessuno storico disponibile.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={400}>
              <AreaChart data={netWorthHistory}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis
                  tickFormatter={(value) =>
                    formatCurrency(value).replace(/,00$/, '')
                  }
                />
                <Tooltip
                  formatter={(value: number) => formatCurrency(value)}
                  labelStyle={{ color: '#000' }}
                />
                <Legend />
                <Area
                  type="monotone"
                  dataKey="liquidNetWorth"
                  stackId="1"
                  stroke="#10B981"
                  fill="#10B981"
                  fillOpacity={0.6}
                  name="Liquido"
                />
                <Area
                  type="monotone"
                  dataKey="illiquidNetWorth"
                  stackId="1"
                  stroke="#F59E0B"
                  fill="#F59E0B"
                  fillOpacity={0.6}
                  name="Illiquido"
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Asset Distribution Pie Chart */}
        <Card>
          <CardHeader>
            <CardTitle>Distribuzione Asset Corrente</CardTitle>
          </CardHeader>
          <CardContent>
            {assetDistribution.length === 0 ? (
              <div className="flex h-64 items-center justify-center text-gray-500">
                Nessun asset presente. Aggiungi degli asset per vedere la
                distribuzione.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={assetDistribution}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }: any) =>
                      percent > 5 ? `${name} ${formatPercentage(percent)}` : ''
                    }
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {assetDistribution.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: number) => formatCurrency(value)}
                  />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Current vs Target Comparison */}
        <Card>
          <CardHeader>
            <CardTitle>Asset Class: Corrente vs Desiderata</CardTitle>
          </CardHeader>
          <CardContent>
            {currentVsTargetData.length === 0 ? (
              <div className="flex h-64 items-center justify-center text-gray-500">
                Nessun dato disponibile.
              </div>
            ) : (
              <div className="space-y-4">
                {currentVsTargetData.map((item) => (
                  <div key={item.name} className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium capitalize">{item.name}</span>
                      <span className="text-gray-600">
                        {formatPercentage(item.corrente)} /{' '}
                        {formatPercentage(item.target)}
                      </span>
                    </div>
                    <div className="relative h-6 w-full overflow-hidden rounded-full bg-gray-200">
                      {/* Target bar (background) */}
                      <div
                        className="absolute h-full bg-gray-300"
                        style={{
                          width: `${Math.min(item.target, 100)}%`,
                        }}
                      />
                      {/* Current bar (foreground) */}
                      <div
                        className="absolute h-full transition-all"
                        style={{
                          width: `${Math.min(item.corrente, 100)}%`,
                          backgroundColor: item.color,
                          opacity: 0.8,
                        }}
                      />
                      {/* Labels */}
                      <div className="absolute inset-0 flex items-center justify-center text-xs font-semibold text-white mix-blend-difference">
                        Corrente
                      </div>
                    </div>
                    <div className="flex justify-between text-xs text-gray-500">
                      <span>Corrente: {formatPercentage(item.corrente)}</span>
                      <span>Target: {formatPercentage(item.target)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {snapshots.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Snapshot Mensili</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {snapshots.slice(-6).reverse().map((snapshot) => (
                <div
                  key={`${snapshot.year}-${snapshot.month}`}
                  className="rounded-lg border p-4"
                >
                  <div className="text-sm font-medium text-gray-500">
                    {String(snapshot.month).padStart(2, '0')}/{snapshot.year}
                  </div>
                  <div className="mt-2">
                    <div className="text-lg font-bold">
                      {formatCurrency(snapshot.totalNetWorth)}
                    </div>
                    <div className="text-sm text-gray-600">
                      Liquido: {formatCurrency(snapshot.liquidNetWorth)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
