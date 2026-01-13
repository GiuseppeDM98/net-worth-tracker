'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DollarSign, TrendingUp, TrendingDown, Percent, Calendar } from 'lucide-react';
import { formatCurrency } from '@/lib/utils/formatters';
import { formatCurrencyCompact } from '@/lib/services/chartService';
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { toast } from 'sonner';

interface DividendStatsProps {
  startDate?: Date;
  endDate?: Date;
}

interface DividendStatsData {
  period: {
    totalGross: number;
    totalTax: number;
    totalNet: number;
    count: number;
  };
  allTime: {
    totalGross: number;
    totalTax: number;
    totalNet: number;
    count: number;
  };
  averageYield: number;
  upcomingTotal: number;
  byAsset: Array<{
    assetTicker: string;
    assetName: string;
    totalNet: number;
    count: number;
  }>;
  byYear: Array<{
    year: number;
    totalGross: number;
    totalTax: number;
    totalNet: number;
  }>;
  byMonth: Array<{
    month: string;
    totalNet: number;
  }>;
  // YOC (Yield on Cost) fields
  portfolioYieldOnCost?: number;
  totalCostBasis?: number;
  yieldOnCostAssets?: Array<{
    assetId: string;
    assetTicker: string;
    assetName: string;
    quantity: number;
    averageCost: number;
    currentPrice: number;
    ttmGrossDividends: number;
    yocPercentage: number;
    currentYieldPercentage: number;
    difference: number;
  }>;
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8', '#82CA9D', '#FFC658', '#FF6B9D'];

export function DividendStats({ startDate, endDate }: DividendStatsProps) {
  const { user } = useAuth();
  const [stats, setStats] = useState<DividendStatsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      loadStats();
    }
  }, [user, startDate, endDate]);

  const loadStats = async () => {
    if (!user) return;

    try {
      setLoading(true);

      const params = new URLSearchParams();
      params.append('userId', user.uid);
      if (startDate) params.append('startDate', startDate.toISOString());
      if (endDate) params.append('endDate', endDate.toISOString());

      const response = await fetch(`/api/dividends/stats?${params.toString()}`);

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Errore nel caricamento delle statistiche');
      }

      const data = await response.json();
      setStats(data.stats);
    } catch (error) {
      console.error('Error loading dividend stats:', error);
      toast.error('Errore nel caricamento delle statistiche');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-gray-500">Caricamento statistiche...</div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-gray-500">Nessuna statistica disponibile</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Metric Cards Row 1: Period Stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Dividendi Ricevuti (Netto)</CardTitle>
            <DollarSign className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {formatCurrency(stats.period.totalNet)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {startDate && endDate
                ? `Dal ${startDate.toLocaleDateString('it-IT')} al ${endDate.toLocaleDateString('it-IT')}`
                : 'Periodo selezionato'}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Totale storico: {formatCurrency(stats.allTime.totalNet)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Tasse Pagate</CardTitle>
            <TrendingDown className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {formatCurrency(stats.period.totalTax)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {startDate && endDate
                ? 'Periodo selezionato'
                : 'Totale ritenute'}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Totale storico: {formatCurrency(stats.allTime.totalTax)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Yield Medio</CardTitle>
            <Percent className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">
              {stats.averageYield > 0 ? `${stats.averageYield.toFixed(2)}%` : 'N/A'}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Yield ponderato del portafoglio
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {stats.period.count} dividendi nel periodo
            </p>
          </CardContent>
        </Card>

        {/* YOC Card - Only show if data exists */}
        {stats.portfolioYieldOnCost !== undefined && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Yield on Cost</CardTitle>
              <TrendingUp className="h-4 w-4 text-emerald-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-emerald-600">
                {stats.portfolioYieldOnCost.toFixed(2)}%
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Rendimento sul costo originale
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Base costi: {formatCurrency(stats.totalCostBasis || 0)}
              </p>
              <p className="text-xs text-muted-foreground mt-1 italic">
                Dividendi lordi TTM (12 mesi)
              </p>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Dividendi in Arrivo</CardTitle>
            <Calendar className="h-4 w-4 text-purple-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-600">
              {formatCurrency(stats.upcomingTotal)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Annunciati ma non ancora pagati
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Basati su ex-date future
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row 1: Pie Chart (Dividends by Asset) */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Dividendi per Asset</CardTitle>
          </CardHeader>
          <CardContent>
            {stats.byAsset.length === 0 ? (
              <div className="flex h-64 items-center justify-center text-gray-500">
                Nessun dato disponibile
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={stats.byAsset}
                    dataKey="totalNet"
                    nameKey="assetTicker"
                    cx="50%"
                    cy="50%"
                    outerRadius={100}
                    label={(entry: any) => `${entry.assetTicker}: ${formatCurrency(entry.totalNet)}`}
                    isAnimationActive={false}
                  >
                    {stats.byAsset.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: number) => formatCurrency(value)}
                    labelStyle={{ color: '#000' }}
                  />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Bar Chart: Dividends by Year */}
        <Card>
          <CardHeader>
            <CardTitle>Dividendi per Anno</CardTitle>
          </CardHeader>
          <CardContent>
            {stats.byYear.length === 0 ? (
              <div className="flex h-64 items-center justify-center text-gray-500">
                Nessun dato disponibile
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={stats.byYear}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="year" />
                  <YAxis tickFormatter={(value) => formatCurrencyCompact(value)} />
                  <Tooltip
                    formatter={(value: number) => formatCurrency(value)}
                    labelStyle={{ color: '#000' }}
                  />
                  <Legend />
                  <Bar dataKey="totalGross" fill="#10B981" name="Lordo" isAnimationActive={false} />
                  <Bar dataKey="totalTax" fill="#EF4444" name="Tasse" isAnimationActive={false} />
                  <Bar dataKey="totalNet" fill="#3B82F6" name="Netto" isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Charts Row 2: Line Chart (Monthly Dividend Income) */}
      <Card>
        <CardHeader>
          <CardTitle>Reddito Mensile da Dividendi</CardTitle>
        </CardHeader>
        <CardContent>
          {stats.byMonth.length === 0 ? (
            <div className="flex h-64 items-center justify-center text-gray-500">
              Nessun dato disponibile
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={stats.byMonth}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis tickFormatter={(value) => formatCurrency(value).replace(/,00$/, '')} />
                <Tooltip
                  formatter={(value: number) => formatCurrency(value)}
                  labelStyle={{ color: '#000' }}
                />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="totalNet"
                  stroke="#10B981"
                  strokeWidth={2}
                  name="Dividendi Netti"
                  dot={{ r: 4 }}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Top Assets Table */}
      {stats.byAsset.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Top Asset per Dividendi</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {stats.byAsset.slice(0, 10).map((asset, index) => (
                <div key={asset.assetTicker} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center text-white font-semibold text-sm"
                      style={{ backgroundColor: COLORS[index % COLORS.length] }}
                    >
                      {index + 1}
                    </div>
                    <div>
                      <p className="font-medium">{asset.assetTicker}</p>
                      <p className="text-sm text-muted-foreground">{asset.assetName}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-green-600">{formatCurrency(asset.totalNet)}</p>
                    <p className="text-xs text-muted-foreground">{asset.count} dividendi</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Yield on Cost Table - Only show if data exists */}
      {stats.yieldOnCostAssets && stats.yieldOnCostAssets.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Yield on Cost per Asset</CardTitle>
            <p className="text-sm text-muted-foreground mt-2">
              Confronto tra rendimento sul costo originale (YOC) e rendimento corrente,
              basato su <strong>dividendi lordi TTM (ultimi 12 mesi)</strong>.
              Una differenza positiva indica crescita dei dividendi.
            </p>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-3 font-semibold text-sm">Asset</th>
                    <th className="text-right p-3 font-semibold text-sm">Quantità</th>
                    <th className="text-right p-3 font-semibold text-sm">Costo Medio</th>
                    <th className="text-right p-3 font-semibold text-sm">Prezzo Corrente</th>
                    <th className="text-right p-3 font-semibold text-sm">Dividendi TTM</th>
                    <th className="text-right p-3 font-semibold text-sm">YOC %</th>
                    <th className="text-right p-3 font-semibold text-sm">Yield Corrente %</th>
                    <th className="text-right p-3 font-semibold text-sm">Differenza</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.yieldOnCostAssets.map((asset) => (
                    <tr key={asset.assetId} className="border-b hover:bg-gray-50">
                      <td className="p-3">
                        <div>
                          <p className="font-medium">{asset.assetTicker}</p>
                          <p className="text-xs text-muted-foreground">{asset.assetName}</p>
                        </div>
                      </td>
                      <td className="text-right p-3">{asset.quantity.toLocaleString('it-IT')}</td>
                      <td className="text-right p-3">{formatCurrency(asset.averageCost)}</td>
                      <td className="text-right p-3">{formatCurrency(asset.currentPrice)}</td>
                      <td className="text-right p-3 font-medium text-green-600">
                        {formatCurrency(asset.ttmGrossDividends)}
                      </td>
                      <td className="text-right p-3">
                        <span className="font-semibold text-emerald-600">
                          {asset.yocPercentage.toFixed(2)}%
                        </span>
                      </td>
                      <td className="text-right p-3">
                        <span className="font-semibold text-blue-600">
                          {asset.currentYieldPercentage.toFixed(2)}%
                        </span>
                      </td>
                      <td className="text-right p-3">
                        <span
                          className={`font-semibold ${
                            asset.difference > 0
                              ? 'text-green-600'
                              : asset.difference < 0
                              ? 'text-red-600'
                              : 'text-gray-600'
                          }`}
                        >
                          {asset.difference > 0 ? '+' : ''}
                          {asset.difference.toFixed(2)}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 font-semibold bg-gray-50">
                    <td className="p-3" colSpan={4}>Portfolio Totale</td>
                    <td className="text-right p-3 text-green-600">
                      {formatCurrency(
                        stats.yieldOnCostAssets.reduce((sum, a) => sum + a.ttmGrossDividends, 0)
                      )}
                    </td>
                    <td className="text-right p-3 text-emerald-600">
                      {stats.portfolioYieldOnCost?.toFixed(2)}%
                    </td>
                    <td className="text-right p-3 text-blue-600">
                      {stats.averageYield > 0 ? `${stats.averageYield.toFixed(2)}%` : 'N/A'}
                    </td>
                    <td className="text-right p-3">
                      {stats.portfolioYieldOnCost !== undefined && stats.averageYield > 0 ? (
                        <span
                          className={`font-semibold ${
                            stats.portfolioYieldOnCost - stats.averageYield > 0
                              ? 'text-green-600'
                              : stats.portfolioYieldOnCost - stats.averageYield < 0
                              ? 'text-red-600'
                              : 'text-gray-600'
                          }`}
                        >
                          {stats.portfolioYieldOnCost - stats.averageYield > 0 ? '+' : ''}
                          {(stats.portfolioYieldOnCost - stats.averageYield).toFixed(2)}%
                        </span>
                      ) : (
                        'N/A'
                      )}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
