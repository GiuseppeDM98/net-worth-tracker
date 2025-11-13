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
  prepareAssetClassHistoryData,
  prepareYoYVariationData,
  formatCurrency,
  formatPercentage,
} from '@/lib/services/chartService';
import { Asset, MonthlySnapshot, AssetAllocationTarget } from '@/types/assets';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';
import { toast } from 'sonner';
import { PieChart as PieChartComponent } from '@/components/ui/pie-chart';
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { getAssetClassColor } from '@/lib/constants/colors';

export default function HistoryPage() {
  const { user } = useAuth();
  const [snapshots, setSnapshots] = useState<MonthlySnapshot[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [targets, setTargets] = useState<AssetAllocationTarget | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAssetClassPercentage, setShowAssetClassPercentage] = useState(false);
  const [showLiquidityPercentage, setShowLiquidityPercentage] = useState(false);
  const [showYoYPercentage, setShowYoYPercentage] = useState(false);

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
  const assetClassHistory = prepareAssetClassHistoryData(snapshots);
  const yoyVariationData = prepareYoYVariationData(snapshots);

  // Prepare liquidity data with percentages
  const liquidityHistory = netWorthHistory.map((item) => {
    const total = item.liquidNetWorth + item.illiquidNetWorth;
    return {
      ...item,
      liquidPercentage: total > 0 ? (item.liquidNetWorth / total) * 100 : 0,
      illiquidPercentage: total > 0 ? (item.illiquidNetWorth / total) * 100 : 0,
    };
  });

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

  // Custom label render functions for charts
  const renderNetWorthLabelTotal = (props: any) => {
    const { x, y, value } = props;
    const text = formatCurrency(value).replace(/,00$/, '');
    const padding = 6;
    const textWidth = text.length * 7; // Approximate width

    return (
      <g>
        <rect
          x={x - textWidth / 2 - padding}
          y={y - 20}
          width={textWidth + padding * 2}
          height={20}
          fill="white"
          stroke="#3B82F6"
          strokeWidth={1.5}
          rx={4}
          opacity={0.95}
        />
        <text
          x={x}
          y={y - 6}
          fill="#1F2937"
          fontSize={12}
          textAnchor="middle"
          fontWeight="600"
        >
          {text}
        </text>
      </g>
    );
  };


  const renderLiquidityLabelIlliquid = (props: any) => {
    const { x, y, value } = props;
    const text = showLiquidityPercentage
      ? `${value.toFixed(1)}%`
      : formatCurrency(value).replace(/,00$/, '');
    const padding = 6;
    const textWidth = text.length * 7;

    return (
      <g>
        <rect
          x={x - textWidth / 2 - padding}
          y={y - 10}
          width={textWidth + padding * 2}
          height={20}
          fill="white"
          stroke="#F59E0B"
          strokeWidth={1.5}
          rx={4}
          opacity={0.95}
        />
        <text
          x={x}
          y={y + 4}
          fill="#1F2937"
          fontSize={12}
          textAnchor="middle"
          fontWeight="600"
        >
          {text}
        </text>
      </g>
    );
  };

  const renderLiquidityLabelLiquid = (props: any) => {
    const { x, y, value } = props;
    const text = showLiquidityPercentage
      ? `${value.toFixed(1)}%`
      : formatCurrency(value).replace(/,00$/, '');
    const padding = 6;
    const textWidth = text.length * 7;

    return (
      <g>
        <rect
          x={x - textWidth / 2 - padding}
          y={y - 20}
          width={textWidth + padding * 2}
          height={20}
          fill="white"
          stroke="#10B981"
          strokeWidth={1.5}
          rx={4}
          opacity={0.95}
        />
        <text
          x={x}
          y={y - 6}
          fill="#1F2937"
          fontSize={12}
          textAnchor="middle"
          fontWeight="600"
        >
          {text}
        </text>
      </g>
    );
  };

  // Asset Class Label Renderers
  const renderAssetClassLabel = (color: string, offsetY: number = -10) => (props: any) => {
    const { x, y, value } = props;
    if (!value || value === 0) return null;

    const text = showAssetClassPercentage
      ? `${value.toFixed(1)}%`
      : formatCurrency(value).replace(/,00$/, '');
    const padding = 6;
    const textWidth = text.length * 7;

    return (
      <g>
        <rect
          x={x - textWidth / 2 - padding}
          y={y + offsetY}
          width={textWidth + padding * 2}
          height={20}
          fill="white"
          stroke={color}
          strokeWidth={1.5}
          rx={4}
          opacity={0.95}
        />
        <text
          x={x}
          y={y + offsetY + 14}
          fill="#1F2937"
          fontSize={12}
          textAnchor="middle"
          fontWeight="600"
        >
          {text}
        </text>
      </g>
    );
  };

  const renderEquityLabel = renderAssetClassLabel('#3B82F6', -10);
  const renderBondsLabel = renderAssetClassLabel('#EF4444', -10);
  const renderCryptoLabel = renderAssetClassLabel('#F59E0B', -10);
  const renderRealEstateLabel = renderAssetClassLabel('#10B981', -10);
  const renderCashLabel = renderAssetClassLabel('#6B7280', -10);
  const renderCommodityLabel = renderAssetClassLabel('#92400E', -10);

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
              <LineChart data={netWorthHistory} margin={{ left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis
                  width={80}
                  tickFormatter={(value) =>
                    formatCurrency(value).replace(/,00$/, '')
                  }
                  domain={[(dataMin: number) => dataMin * 0.95, (dataMax: number) => dataMax * 1.05]}
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
                  isAnimationActive={false}
                  label={false}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Asset Class Evolution Chart */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Patrimonio Netto per Asset Class</CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowAssetClassPercentage(!showAssetClassPercentage)}
            >
              {showAssetClassPercentage ? '€ Valori Assoluti' : '% Percentuali'}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {assetClassHistory.length === 0 ? (
            <div className="flex h-64 items-center justify-center text-gray-500">
              Nessuno storico disponibile.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={400}>
              {showAssetClassPercentage ? (
                // Percentage mode: Use LineChart with separate lines
                <LineChart data={assetClassHistory} margin={{ left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis
                    width={80}
                    tickFormatter={(value) => `${value.toFixed(0)}%`}
                    domain={[0, 100]}
                  />
                  <Tooltip
                    formatter={(value: number) => `${value.toFixed(2)}%`}
                    labelStyle={{ color: '#000' }}
                  />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="equityPercentage"
                    stroke="#3B82F6"
                    strokeWidth={2}
                    name="Azioni"
                    dot={{ r: 4 }}
                    isAnimationActive={false}
                    label={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="bondsPercentage"
                    stroke="#EF4444"
                    strokeWidth={2}
                    name="Obbligazioni"
                    dot={{ r: 4 }}
                    isAnimationActive={false}
                    label={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="cryptoPercentage"
                    stroke="#F59E0B"
                    strokeWidth={2}
                    name="Criptovalute"
                    dot={{ r: 4 }}
                    isAnimationActive={false}
                    label={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="realestatePercentage"
                    stroke="#10B981"
                    strokeWidth={2}
                    name="Immobili"
                    dot={{ r: 4 }}
                    isAnimationActive={false}
                    label={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="cashPercentage"
                    stroke="#6B7280"
                    strokeWidth={2}
                    name="Liquidità"
                    dot={{ r: 4 }}
                    isAnimationActive={false}
                    label={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="commodityPercentage"
                    stroke="#92400E"
                    strokeWidth={2}
                    name="Materie Prime"
                    dot={{ r: 4 }}
                    isAnimationActive={false}
                    label={false}
                  />
                </LineChart>
              ) : (
                // Absolute values mode: Use Stacked AreaChart
                <AreaChart data={assetClassHistory} margin={{ left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis
                    width={80}
                    tickFormatter={(value) => formatCurrency(value).replace(/,00$/, '')}
                  />
                  <Tooltip
                    formatter={(value: number) => formatCurrency(value)}
                    labelStyle={{ color: '#000' }}
                  />
                  <Legend />
                  <Area
                    type="monotone"
                    dataKey="equity"
                    stroke="#3B82F6"
                    fill="#3B82F6"
                    fillOpacity={0.8}
                    name="Azioni"
                    isAnimationActive={false}
                    label={false}
                  />
                  <Area
                    type="monotone"
                    dataKey="bonds"
                    stroke="#EF4444"
                    fill="#EF4444"
                    fillOpacity={0.8}
                    name="Obbligazioni"
                    isAnimationActive={false}
                    label={false}
                  />
                  <Area
                    type="monotone"
                    dataKey="crypto"
                    stroke="#F59E0B"
                    fill="#F59E0B"
                    fillOpacity={0.8}
                    name="Criptovalute"
                    isAnimationActive={false}
                    label={false}
                  />
                  <Area
                    type="monotone"
                    dataKey="realestate"
                    stroke="#10B981"
                    fill="#10B981"
                    fillOpacity={0.8}
                    name="Immobili"
                    isAnimationActive={false}
                    label={false}
                  />
                  <Area
                    type="monotone"
                    dataKey="cash"
                    stroke="#6B7280"
                    fill="#6B7280"
                    fillOpacity={0.8}
                    name="Liquidità"
                    isAnimationActive={false}
                    label={false}
                  />
                  <Area
                    type="monotone"
                    dataKey="commodity"
                    stroke="#92400E"
                    fill="#92400E"
                    fillOpacity={0.8}
                    name="Materie Prime"
                    isAnimationActive={false}
                    label={false}
                  />
                </AreaChart>
              )}
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Liquidity Evolution Chart */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Evoluzione Liquidità vs Illiquidità</CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowLiquidityPercentage(!showLiquidityPercentage)}
            >
              {showLiquidityPercentage ? '€ Valori Assoluti' : '% Percentuali'}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {netWorthHistory.length === 0 ? (
            <div className="flex h-64 items-center justify-center text-gray-500">
              Nessuno storico disponibile.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={400}>
              {showLiquidityPercentage ? (
                // Percentage mode: Use LineChart with separate lines
                <LineChart data={liquidityHistory} margin={{ left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis
                    width={80}
                    tickFormatter={(value) => `${value.toFixed(0)}%`}
                    domain={[0, 100]}
                  />
                  <Tooltip
                    formatter={(value: number) => `${value.toFixed(2)}%`}
                    labelStyle={{ color: '#000' }}
                  />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="liquidPercentage"
                    stroke="#10B981"
                    strokeWidth={2}
                    name="Liquido"
                    dot={{ r: 4 }}
                    isAnimationActive={false}
                    label={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="illiquidPercentage"
                    stroke="#F59E0B"
                    strokeWidth={2}
                    name="Illiquido"
                    dot={{ r: 4 }}
                    isAnimationActive={false}
                    label={false}
                  />
                </LineChart>
              ) : (
                // Absolute values mode: Use AreaChart with overlapping areas (no stack)
                <AreaChart data={liquidityHistory} margin={{ left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis
                    width={80}
                    tickFormatter={(value) => formatCurrency(value).replace(/,00$/, '')}
                    domain={[(dataMin: number) => dataMin * 0.95, (dataMax: number) => dataMax * 1.05]}
                  />
                  <Tooltip
                    formatter={(value: number) => formatCurrency(value)}
                    labelStyle={{ color: '#000' }}
                  />
                  <Legend />
                  <Area
                    type="monotone"
                    dataKey="liquidNetWorth"
                    stroke="#10B981"
                    fill="#10B981"
                    fillOpacity={0.6}
                    name="Liquido"
                    isAnimationActive={false}
                    label={false}
                  />
                  <Area
                    type="monotone"
                    dataKey="illiquidNetWorth"
                    stroke="#F59E0B"
                    fill="#F59E0B"
                    fillOpacity={0.6}
                    name="Illiquido"
                    isAnimationActive={false}
                    label={false}
                  />
                </AreaChart>
              )}
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* YoY Variation Chart */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Storico YoY</CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowYoYPercentage(!showYoYPercentage)}
            >
              {showYoYPercentage ? '€ Valori Assoluti' : '% Percentuali'}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {yoyVariationData.length === 0 ? (
            <div className="flex h-64 items-center justify-center text-gray-500">
              Nessuno storico disponibile.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={400}>
              <BarChart data={yoyVariationData} margin={{ left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="year" />
                <YAxis
                  width={80}
                  tickFormatter={(value) =>
                    showYoYPercentage
                      ? `${value.toFixed(0)}%`
                      : formatCurrency(value).replace(/,00$/, '')
                  }
                />
                <Tooltip
                  formatter={(value: number, name: string) => {
                    if (name === 'Variazione') {
                      return showYoYPercentage
                        ? `${value.toFixed(2)}%`
                        : formatCurrency(value);
                    }
                    return formatCurrency(value);
                  }}
                  labelStyle={{ color: '#000' }}
                />
                <Legend />
                <Bar
                  dataKey={showYoYPercentage ? 'variationPercentage' : 'variation'}
                  name="Variazione"
                  isAnimationActive={false}
                >
                  {yoyVariationData.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={entry.variation >= 0 ? '#10B981' : '#EF4444'}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Asset Distribution Pie Chart */}
        <Card className="md:col-span-2">
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
              <PieChartComponent data={assetDistribution} />
            )}
          </CardContent>
        </Card>

        {/* Current vs Target Comparison */}
        <Card className="md:col-span-2">
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
