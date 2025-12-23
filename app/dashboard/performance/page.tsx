'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { getAllPerformanceData, calculatePerformanceForPeriod, preparePerformanceChartData, getSnapshotsForPeriod } from '@/lib/services/performanceService';
import { getUserSnapshots } from '@/lib/services/snapshotService';
import { PerformanceData, PerformanceMetrics, TimePeriod } from '@/types/performance';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { RefreshCw, TrendingUp, Info } from 'lucide-react';
import { toast } from 'sonner';
import { formatCurrency, formatPercentage } from '@/lib/services/chartService';
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';
import { CustomDateRangeDialog } from '@/components/performance/CustomDateRangeDialog';
import { MetricCard } from '@/components/performance/MetricCard';
import { PerformanceTooltip } from '@/components/performance/PerformanceTooltip';

export default function PerformancePage() {
  const { user } = useAuth();
  const [performanceData, setPerformanceData] = useState<PerformanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedPeriod, setSelectedPeriod] = useState<TimePeriod>('YTD');
  const [showCustomDateDialog, setShowCustomDateDialog] = useState(false);

  useEffect(() => {
    if (user) {
      loadPerformanceData();
    }
  }, [user]);

  const loadPerformanceData = async () => {
    if (!user) return;

    try {
      setLoading(true);
      const data = await getAllPerformanceData(user.uid);
      setPerformanceData(data);
    } catch (error) {
      console.error('Error loading performance data:', error);
      toast.error('Errore nel caricamento delle metriche di performance');
    } finally {
      setLoading(false);
    }
  };

  const handleCustomDateRange = async (startDate: Date, endDate: Date) => {
    if (!user || !performanceData) return;

    try {
      const snapshots = await getUserSnapshots(user.uid);
      const customMetrics = await calculatePerformanceForPeriod(
        user.uid,
        snapshots,
        'CUSTOM',
        performanceData.ytd.riskFreeRate,
        startDate,
        endDate
      );

      setPerformanceData({
        ...performanceData,
        custom: customMetrics,
      });

      setSelectedPeriod('CUSTOM');
      toast.success('Periodo personalizzato calcolato');
    } catch (error) {
      console.error('Error calculating custom period:', error);
      toast.error('Errore nel calcolo del periodo personalizzato');
    }
  };

  const getCurrentMetrics = (): PerformanceMetrics | null => {
    if (!performanceData) return null;

    switch (selectedPeriod) {
      case 'YTD': return performanceData.ytd;
      case '1Y': return performanceData.oneYear;
      case '3Y': return performanceData.threeYear;
      case '5Y': return performanceData.fiveYear;
      case 'ALL': return performanceData.allTime;
      case 'CUSTOM': return performanceData.custom;
      default: return performanceData.ytd;
    }
  };

  const getChartData = async () => {
    if (!user || !performanceData) return [];

    const metrics = getCurrentMetrics();
    if (!metrics) return [];

    const snapshots = await getUserSnapshots(user.uid);
    const periodSnapshots = getSnapshotsForPeriod(
      snapshots,
      metrics.timePeriod,
      metrics.startDate,
      metrics.endDate
    );

    return preparePerformanceChartData(periodSnapshots, metrics.cashFlows);
  };

  const [chartData, setChartData] = useState<any[]>([]);

  useEffect(() => {
    if (performanceData && user) {
      getChartData().then(setChartData);
    }
  }, [performanceData, selectedPeriod, user]);

  const metrics = getCurrentMetrics();

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Caricamento metriche...</p>
        </div>
      </div>
    );
  }

  if (!performanceData || !metrics) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <Info className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
          <h2 className="text-xl font-semibold mb-2">Dati insufficienti</h2>
          <p className="text-muted-foreground max-w-md">
            Servono almeno 2 snapshot mensili per calcolare le metriche di performance.
          </p>
        </div>
      </div>
    );
  }

  if (metrics.hasInsufficientData) {
    return (
      <div className="space-y-6 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Performance Portafoglio</h1>
            <p className="text-muted-foreground mt-1">
              Analisi dei rendimenti e metriche di rischio-rendimento
            </p>
          </div>
        </div>

        <Tabs value={selectedPeriod} onValueChange={(value) => setSelectedPeriod(value as TimePeriod)}>
          <TabsList className="grid w-full grid-cols-6">
            <TabsTrigger value="YTD">YTD</TabsTrigger>
            <TabsTrigger value="1Y">1 Anno</TabsTrigger>
            <TabsTrigger value="3Y">3 Anni</TabsTrigger>
            <TabsTrigger value="5Y">5 Anni</TabsTrigger>
            <TabsTrigger value="ALL">Storico</TabsTrigger>
            <TabsTrigger value="CUSTOM" disabled={!performanceData.custom}>
              Personalizzato
            </TabsTrigger>
          </TabsList>

          <Card className="mt-6">
            <CardContent className="pt-6">
              <div className="text-center py-12">
                <Info className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <h3 className="text-lg font-semibold mb-2">Dati insufficienti per questo periodo</h3>
                <p className="text-muted-foreground">
                  Servono almeno 2 snapshot mensili per calcolare le metriche.
                  {metrics.errorMessage && <><br />{metrics.errorMessage}</>}
                </p>
              </div>
            </CardContent>
          </Card>
        </Tabs>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Performance Portafoglio</h1>
          <p className="text-muted-foreground mt-1">
            Analisi dei rendimenti e metriche di rischio-rendimento
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowCustomDateDialog(true)}>
            Periodo Personalizzato
          </Button>
          <Button onClick={loadPerformanceData}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Aggiorna
          </Button>
        </div>
      </div>

      {/* Period Selector */}
      <Tabs value={selectedPeriod} onValueChange={(value) => setSelectedPeriod(value as TimePeriod)}>
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="YTD">YTD</TabsTrigger>
          <TabsTrigger value="1Y">1 Anno</TabsTrigger>
          <TabsTrigger value="3Y">3 Anni</TabsTrigger>
          <TabsTrigger value="5Y">5 Anni</TabsTrigger>
          <TabsTrigger value="ALL">Storico</TabsTrigger>
          <TabsTrigger value="CUSTOM" disabled={!performanceData.custom}>
            Personalizzato
          </TabsTrigger>
        </TabsList>

        {/* Metrics Cards - Row 1 */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
          <MetricCard
            title="ROI Totale"
            value={metrics.roi}
            format="percentage"
            description="Rendimento complessivo (senza annualizzazione)"
            tooltip="ROI = (Valore Finale - Valore Iniziale - Flussi di Cassa) / Valore Iniziale"
          />
          <MetricCard
            title="CAGR"
            value={metrics.cagr}
            format="percentage"
            description="Tasso di crescita annuale composto"
            tooltip="CAGR considera i flussi di cassa e annualizza il rendimento"
            isPrimary
          />
          <MetricCard
            title="Time-Weighted Return"
            value={metrics.timeWeightedReturn}
            format="percentage"
            description="Rendimento time-weighted (annualizzato)"
            tooltip="TWR elimina l'effetto dei flussi di cassa. Metrica ideale per confrontare performance."
            isPrimary
          />
          <MetricCard
            title="Sharpe Ratio"
            value={metrics.sharpeRatio}
            format="number"
            description="Rendimento aggiustato per il rischio"
            tooltip="Sharpe Ratio = (Rendimento - Tasso Risk-Free) / Volatilità. Valori > 1 sono buoni."
          />
        </div>

        {/* Metrics Cards - Row 2 */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mt-4">
          <MetricCard
            title="Volatilità"
            value={metrics.volatility}
            format="percentage"
            description="Deviazione standard annualizzata"
            tooltip="Misura la variabilità dei rendimenti. Valori bassi indicano minore rischio."
          />
          <MetricCard
            title="Money-Weighted Return (IRR)"
            value={metrics.moneyWeightedReturn}
            format="percentage"
            description="Tasso interno di rendimento"
            tooltip="IRR considera il timing dei flussi di cassa. Mostra il rendimento reale dell'investitore."
          />
          <MetricCard
            title="Contributi Netti"
            value={metrics.netCashFlow}
            format="currency"
            description={`${formatCurrency(metrics.totalContributions)} - ${formatCurrency(metrics.totalWithdrawals)}`}
            tooltip="Differenza tra contributi (entrate) e prelievi (uscite)"
          />
          <MetricCard
            title="Durata"
            value={metrics.numberOfMonths}
            format="months"
            description={`Da ${metrics.startDate.toLocaleDateString('it-IT')} a ${metrics.endDate.toLocaleDateString('it-IT')}`}
          />
        </div>

        {/* Charts Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
          {/* Net Worth Evolution Chart */}
          <Card>
            <CardHeader>
              <CardTitle>Evoluzione Patrimonio</CardTitle>
              <CardDescription>Patrimonio vs Contributi Cumulativi</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis tickFormatter={(value) => formatCurrency(value).replace(',00', '')} />
                  <Tooltip content={<PerformanceTooltip />} />
                  <Legend />
                  <Area
                    type="monotone"
                    dataKey="contributions"
                    stackId="1"
                    stroke="#8884d8"
                    fill="#8884d8"
                    name="Contributi"
                  />
                  <Area
                    type="monotone"
                    dataKey="returns"
                    stackId="1"
                    stroke="#82ca9d"
                    fill="#82ca9d"
                    name="Rendimenti"
                  />
                  <Line
                    type="monotone"
                    dataKey="netWorth"
                    stroke="#ff7300"
                    strokeWidth={2}
                    name="Patrimonio Totale"
                    dot={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Rolling CAGR Chart */}
          {performanceData.rolling12M.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>CAGR Rolling 12 Mesi</CardTitle>
                <CardDescription>
                  Evoluzione del rendimento annualizzato su finestra mobile
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={performanceData.rolling12M}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="periodEndDate"
                      tickFormatter={(date) => new Date(date).toLocaleDateString('it-IT', { month: 'short', year: '2-digit' })}
                    />
                    <YAxis tickFormatter={(value) => `${value.toFixed(1)}%`} />
                    <Tooltip
                      formatter={(value: number) => `${value.toFixed(2)}%`}
                      labelFormatter={(date) => new Date(date).toLocaleDateString('it-IT')}
                    />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="cagr"
                      stroke="#8884d8"
                      strokeWidth={2}
                      name="CAGR 12M"
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Methodology Section */}
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Note Metodologiche</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div>
              <h4 className="font-semibold mb-1">Time-Weighted Return (Raccomandato)</h4>
              <p className="text-muted-foreground">
                Misura la performance del portafoglio eliminando l&apos;effetto dei flussi di cassa.
                Ideale per confrontare la performance con benchmark o altri portafogli.
              </p>
            </div>
            <div>
              <h4 className="font-semibold mb-1">Money-Weighted Return (IRR)</h4>
              <p className="text-muted-foreground">
                Considera il timing dei contributi e prelievi. Mostra il rendimento effettivo
                dell&apos;investitore basato sulle sue decisioni di investimento.
              </p>
            </div>
            <div>
              <h4 className="font-semibold mb-1">Sharpe Ratio</h4>
              <p className="text-muted-foreground">
                Rapporto tra eccesso di rendimento (vs tasso risk-free: {formatPercentage(metrics.riskFreeRate)})
                e volatilità. Valori &gt; 1 sono considerati buoni, &gt; 2 eccellenti.
              </p>
            </div>
            <div>
              <h4 className="font-semibold mb-1">Flussi di Cassa</h4>
              <p className="text-muted-foreground">
                Calcolati come differenza mensile tra entrate e uscite registrate nella sezione Cashflow.
                Valori positivi sono contributi, negativi sono prelievi.
              </p>
            </div>
          </CardContent>
        </Card>
      </Tabs>

      {/* Custom Date Range Dialog */}
      <CustomDateRangeDialog
        open={showCustomDateDialog}
        onOpenChange={setShowCustomDateDialog}
        onConfirm={handleCustomDateRange}
      />
    </div>
  );
}
