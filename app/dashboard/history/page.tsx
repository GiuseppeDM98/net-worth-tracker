'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useMediaQuery } from '@/lib/hooks/useMediaQuery';
import { getAllAssets, ASSET_CLASS_ORDER } from '@/lib/services/assetService';
import { getUserSnapshots, updateSnapshotNote } from '@/lib/services/snapshotService';
import {
  getTargets,
  compareAllocations,
  getDefaultTargets,
} from '@/lib/services/assetAllocationService';
import {
  prepareNetWorthHistoryData,
  prepareAssetClassHistoryData,
  prepareYoYVariationData,
  formatCurrency,
  formatCurrencyCompact,
  formatPercentage,
} from '@/lib/services/chartService';
import { Asset, MonthlySnapshot, AssetAllocationTarget } from '@/types/assets';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Download, Plus, MessageSquare } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { CreateManualSnapshotModal } from '@/components/CreateManualSnapshotModal';
import { SnapshotSearchDialog } from '@/components/history/SnapshotSearchDialog';
import { CustomChartDot } from '@/components/history/CustomChartDot';
import { ExportPDFButton } from '@/components/dashboard/ExportPDFButton';
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
  LabelList,
} from 'recharts';
import { getAssetClassColor } from '@/lib/constants/colors';

const getMonthName = (month: number): string => {
  const months = [
    'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
    'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'
  ];
  return months[month - 1];
};

export default function HistoryPage() {
  const { user } = useAuth();
  const [snapshots, setSnapshots] = useState<MonthlySnapshot[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [targets, setTargets] = useState<AssetAllocationTarget | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAssetClassPercentage, setShowAssetClassPercentage] = useState(false);
  const [showLiquidityPercentage, setShowLiquidityPercentage] = useState(false);
  const [showYoYPercentage, setShowYoYPercentage] = useState(false);
  const [showManualSnapshotModal, setShowManualSnapshotModal] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [snapshotSearchDialogOpen, setSnapshotSearchDialogOpen] = useState(false);

  // Responsive breakpoints
  const isMobile = useMediaQuery('(max-width: 767px)');
  const isLandscape = useMediaQuery('(min-width: 568px) and (max-height: 500px) and (orientation: landscape)');

  // Responsive helper functions
  const getChartHeight = () => {
    if (isLandscape) return 300;
    if (isMobile) return 280;
    return 400;
  };

  const getChartMargins = () => {
    if (isMobile) return { left: 10, right: 10, top: 5, bottom: 5 };
    return { left: 50 };
  };

  const getYAxisWidth = () => (isMobile ? 70 : 100);

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

  const handleSaveNote = async (year: number, month: number, note: string) => {
    if (!user) return;

    await updateSnapshotNote(user.uid, year, month, note);

    // Aggiorna stato locale (optimistic update)
    setSnapshots((prevSnapshots) =>
      prevSnapshots.map((s) =>
        s.year === year && s.month === month
          ? { ...s, note: note.trim() || undefined }
          : s
      )
    );
  };

  const netWorthHistory = prepareNetWorthHistoryData(snapshots);
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

  const assetClassLabels: Record<string, string> = {
    equity: 'Azioni (Equity)',
    bonds: 'Obbligazioni (Bonds)',
    crypto: 'Criptovalute (Crypto)',
    realestate: 'Immobili (Real Estate)',
    cash: 'Liquidità (Cash)',
    commodity: 'Materie Prime (Commodity)',
  };

  const currentVsTargetData = Object.entries(allocation.byAssetClass)
    .sort(([a], [b]) => {
      const orderA = ASSET_CLASS_ORDER[a] || 999;
      const orderB = ASSET_CLASS_ORDER[b] || 999;
      return orderA - orderB;
    })
    .map(([assetClass, data]) => ({
      name: assetClassLabels[assetClass] || assetClass,
      corrente: data.currentPercentage,
      target: data.targetPercentage,
      color: getAssetClassColor(assetClass),
    }));

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
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex-1">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Storico</h1>
          <p className="mt-1 sm:mt-2 text-sm sm:text-base text-gray-600">
            Analizza l'evoluzione del tuo patrimonio (lordo) nel tempo
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
          <Button
            variant="outline"
            onClick={() => setShowManualSnapshotModal(true)}
            className="w-full sm:w-auto"
          >
            <Plus className="mr-2 h-4 w-4" />
            <span className="hidden sm:inline">Inserisci Snapshot Passato</span>
            <span className="sm:hidden">Snapshot Passato</span>
          </Button>
          <Button
            variant="outline"
            onClick={handleExportCSV}
            disabled={snapshots.length === 0}
            className="w-full sm:w-auto"
          >
            <Download className="mr-2 h-4 w-4" />
            Esporta CSV
          </Button>
          <ExportPDFButton
            snapshots={snapshots}
            assets={assets}
            allocationTargets={targets || getDefaultTargets()}
          />
        </div>
      </div>

      {/* Net Worth History Chart */}
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-lg sm:text-xl">Evoluzione Patrimonio Netto</CardTitle>
            <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
              {/* Toggle Visualizza Note */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowNotes(!showNotes)}
                className="w-full sm:w-auto text-xs sm:text-sm"
              >
                {showNotes ? 'Nascondi Note' : 'Visualizza Note'}
              </Button>

              {/* Bottone Inserisci Nota */}
              <Button
                variant="default"
                size="sm"
                onClick={() => setSnapshotSearchDialogOpen(true)}
                className="w-full sm:w-auto text-xs sm:text-sm"
              >
                <MessageSquare className="h-3 w-3 sm:h-4 sm:w-4 mr-1" />
                Inserisci una nota
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {netWorthHistory.length === 0 ? (
            <div className="flex h-64 items-center justify-center text-gray-500">
              Nessuno storico disponibile. Gli snapshot mensili verranno creati
              automaticamente.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={getChartHeight()} id="chart-net-worth-evolution">
              <LineChart data={netWorthHistory} margin={getChartMargins()}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis
                  width={getYAxisWidth()}
                  tickFormatter={(value) => formatCurrencyCompact(value)}
                  domain={[(dataMin: number) => dataMin * 0.95, (dataMax: number) => dataMax * 1.05]}
                />
                <Tooltip
                  formatter={(value: number) => formatCurrency(value)}
                  contentStyle={{
                    backgroundColor: 'rgba(255, 255, 255, 0.98)',
                    border: '1px solid #ccc',
                    borderRadius: '8px',
                    padding: isMobile ? '8px' : '12px',
                    fontSize: isMobile ? '11px' : '13px',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                  }}
                  labelStyle={{
                    color: '#000',
                    fontWeight: 600,
                    marginBottom: '4px',
                    fontSize: isMobile ? '14px' : '16px',
                  }}
                  itemStyle={{
                    fontSize: isMobile ? '14px' : '16px',
                    padding: '2px 0',
                  }}
                  cursor={{ stroke: '#3B82F6', strokeWidth: 1, strokeDasharray: '5 5' }}
                />
                <Legend
                  wrapperStyle={{
                    display: isMobile ? 'none' : 'block',
                    paddingTop: isMobile ? '0' : '20px'
                  }}
                  iconSize={isMobile ? 8 : 10}
                  fontSize={isMobile ? 11 : 12}
                />
                <Line
                  type="monotone"
                  dataKey="totalNetWorth"
                  stroke="#3B82F6"
                  strokeWidth={2}
                  name="Patrimonio Totale"
                  dot={({ key, ...props }: any) => <CustomChartDot key={key} {...props} isMobile={isMobile} />}
                  activeDot={{ r: 6 }}
                  isAnimationActive={false}
                >
                  {showNotes && (
                    <LabelList
                      dataKey="note"
                      position="top"
                      content={(props: any) => {
                        // Only render label if note exists
                        if (!props.value) return null;

                        const note = String(props.value);
                        const displayText = note.length > 50
                          ? note.substring(0, 50) + '...'
                          : note;

                        return (
                          <text
                            x={props.x}
                            y={props.y - 18}
                            fill="#F59E0B"
                            fontSize={15}
                            fontWeight={600}
                            textAnchor="middle"
                            style={{ pointerEvents: 'none' }}
                          >
                            {displayText}
                          </text>
                        );
                      }}
                    />
                  )}
                </Line>
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Asset Class Evolution Chart */}
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-lg sm:text-xl">Patrimonio Netto per Asset Class</CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowAssetClassPercentage(!showAssetClassPercentage)}
              className="w-full sm:w-auto text-xs sm:text-sm"
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
            <ResponsiveContainer width="100%" height={getChartHeight()} id="chart-asset-class-evolution">
              {showAssetClassPercentage ? (
                // Percentage mode: Use LineChart with separate lines
                <LineChart data={assetClassHistory} margin={getChartMargins()}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis
                    width={getYAxisWidth()}
                    tickFormatter={(value) => `${value.toFixed(0)}%`}
                    domain={[0, 100]}
                  />
                  <Tooltip
                    formatter={(value: number) => `${value.toFixed(2)}%`}
                    contentStyle={{
                      backgroundColor: 'rgba(255, 255, 255, 0.98)',
                      border: '1px solid #ccc',
                      borderRadius: '8px',
                      padding: isMobile ? '8px' : '12px',
                      fontSize: isMobile ? '14px' : '16px',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                    }}
                    labelStyle={{
                      color: '#000',
                      fontWeight: 600,
                      marginBottom: '4px',
                    }}
                    itemStyle={{
                      fontSize: isMobile ? '14px' : '16px',
                      padding: '2px 0',
                    }}
                  />
                  <Legend
                    wrapperStyle={{
                      display: isMobile ? 'none' : 'block',
                      paddingTop: isMobile ? '0' : '20px'
                    }}
                    iconSize={isMobile ? 8 : 10}
                    fontSize={isMobile ? 11 : 12}
                  />
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
                <AreaChart data={assetClassHistory} margin={getChartMargins()}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis
                    width={getYAxisWidth()}
                    tickFormatter={(value) => formatCurrencyCompact(value)}
                  />
                  <Tooltip
                    formatter={(value: number) => formatCurrency(value)}
                    contentStyle={{
                      backgroundColor: 'rgba(255, 255, 255, 0.98)',
                      border: '1px solid #ccc',
                      borderRadius: '8px',
                      padding: isMobile ? '8px' : '12px',
                      fontSize: isMobile ? '14px' : '16px',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                    }}
                    labelStyle={{
                      color: '#000',
                      fontWeight: 600,
                      marginBottom: '4px',
                    }}
                    itemStyle={{
                      fontSize: isMobile ? '14px' : '16px',
                      padding: '2px 0',
                    }}
                  />
                  <Legend
                    wrapperStyle={{
                      display: isMobile ? 'none' : 'block',
                      paddingTop: isMobile ? '0' : '20px'
                    }}
                    iconSize={isMobile ? 8 : 10}
                    fontSize={isMobile ? 11 : 12}
                  />
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
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-lg sm:text-xl">Evoluzione Liquidità vs Illiquidità</CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowLiquidityPercentage(!showLiquidityPercentage)}
              className="w-full sm:w-auto text-xs sm:text-sm"
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
            <ResponsiveContainer width="100%" height={getChartHeight()} id="chart-liquidity">
              {showLiquidityPercentage ? (
                // Percentage mode: Use LineChart with separate lines
                <LineChart data={liquidityHistory} margin={getChartMargins()}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis
                    width={getYAxisWidth()}
                    tickFormatter={(value) => `${value.toFixed(0)}%`}
                    domain={[0, 100]}
                  />
                  <Tooltip
                    formatter={(value: number) => `${value.toFixed(2)}%`}
                    contentStyle={{
                      backgroundColor: 'rgba(255, 255, 255, 0.98)',
                      border: '1px solid #ccc',
                      borderRadius: '8px',
                      padding: isMobile ? '8px' : '12px',
                      fontSize: isMobile ? '14px' : '16px',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                    }}
                    labelStyle={{
                      color: '#000',
                      fontWeight: 600,
                      marginBottom: '4px',
                    }}
                    itemStyle={{
                      fontSize: isMobile ? '14px' : '16px',
                      padding: '2px 0',
                    }}
                  />
                  <Legend
                    wrapperStyle={{
                      display: isMobile ? 'none' : 'block',
                      paddingTop: isMobile ? '0' : '20px'
                    }}
                    iconSize={isMobile ? 8 : 10}
                    fontSize={isMobile ? 11 : 12}
                  />
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
                <AreaChart data={liquidityHistory} margin={getChartMargins()}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis
                    width={getYAxisWidth()}
                    tickFormatter={(value) => formatCurrencyCompact(value)}
                    domain={[(dataMin: number) => dataMin * 0.95, (dataMax: number) => dataMax * 1.05]}
                  />
                  <Tooltip
                    formatter={(value: number) => formatCurrency(value)}
                    contentStyle={{
                      backgroundColor: 'rgba(255, 255, 255, 0.98)',
                      border: '1px solid #ccc',
                      borderRadius: '8px',
                      padding: isMobile ? '8px' : '12px',
                      fontSize: isMobile ? '14px' : '16px',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                    }}
                    labelStyle={{
                      color: '#000',
                      fontWeight: 600,
                      marginBottom: '4px',
                    }}
                    itemStyle={{
                      fontSize: isMobile ? '14px' : '16px',
                      padding: '2px 0',
                    }}
                  />
                  <Legend
                    wrapperStyle={{
                      display: isMobile ? 'none' : 'block',
                      paddingTop: isMobile ? '0' : '20px'
                    }}
                    iconSize={isMobile ? 8 : 10}
                    fontSize={isMobile ? 11 : 12}
                  />
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
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-lg sm:text-xl">Storico YoY</CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowYoYPercentage(!showYoYPercentage)}
              className="w-full sm:w-auto text-xs sm:text-sm"
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
            <ResponsiveContainer width="100%" height={getChartHeight()} id="chart-yoy-variation">
              <BarChart data={yoyVariationData} margin={getChartMargins()}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="year" />
                <YAxis
                  width={getYAxisWidth()}
                  tickFormatter={(value) =>
                    showYoYPercentage
                      ? `${value.toFixed(0)}%`
                      : formatCurrencyCompact(value)
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
                  contentStyle={{
                    backgroundColor: 'rgba(255, 255, 255, 0.98)',
                    border: '1px solid #ccc',
                    borderRadius: '8px',
                    padding: isMobile ? '8px' : '12px',
                    fontSize: isMobile ? '14px' : '16px',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                  }}
                  labelStyle={{
                    color: '#000',
                    fontWeight: 600,
                    marginBottom: '4px',
                  }}
                  itemStyle={{
                    fontSize: isMobile ? '14px' : '16px',
                    padding: '2px 0',
                  }}
                />
                <Legend
                  wrapperStyle={{
                    display: isMobile ? 'none' : 'block',
                    paddingTop: isMobile ? '0' : '20px'
                  }}
                  iconSize={isMobile ? 8 : 10}
                  fontSize={isMobile ? 11 : 12}
                />
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
                      <span className="font-medium">{item.name}</span>
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

      {snapshots.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Snapshot Mensili</CardTitle>
          </CardHeader>
          <CardContent>
            <div className={cn(
              "grid gap-4",
              isLandscape ? "grid-cols-2" : "grid-cols-1",
              "md:grid-cols-2 lg:grid-cols-3"
            )}>
              {snapshots.slice(-6).reverse().map((snapshot) => (
                <div
                  key={`${snapshot.year}-${snapshot.month}`}
                  className="rounded-lg border p-4"
                >
                  <div>
                    <div className="text-lg font-semibold">
                      {getMonthName(snapshot.month)} {snapshot.year}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      Creato il: {snapshot.createdAt.toLocaleString('it-IT', {
                        day: '2-digit',
                        month: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </div>
                  </div>
                  <div className="mt-3">
                    <div className="text-lg font-bold">
                      {formatCurrency(snapshot.totalNetWorth)}
                    </div>
                    <div className="text-sm text-gray-600">
                      Liquido: {formatCurrency(snapshot.liquidNetWorth)}
                    </div>
                  </div>
                  {snapshot.note && (
                    <div className="mt-3 pt-3 border-t">
                      <div className="text-xs text-amber-600 dark:text-amber-400 font-medium mb-1 flex items-center gap-1">
                        <MessageSquare className="h-3 w-3" />
                        Nota:
                      </div>
                      <div className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-line">
                        {snapshot.note.length > 100
                          ? snapshot.note.substring(0, 100) + '...'
                          : snapshot.note}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <CreateManualSnapshotModal
        open={showManualSnapshotModal}
        onOpenChange={setShowManualSnapshotModal}
        userId={user?.uid || ''}
        onSuccess={loadData}
      />

      <SnapshotSearchDialog
        open={snapshotSearchDialogOpen}
        onOpenChange={setSnapshotSearchDialogOpen}
        snapshots={snapshots}
        onSave={handleSaveNote}
      />
    </div>
  );
}
