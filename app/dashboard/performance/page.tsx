'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useMediaQuery } from '@/lib/hooks/useMediaQuery';
import { getAllPerformanceData, calculatePerformanceForPeriod, preparePerformanceChartData, getSnapshotsForPeriod, prepareMonthlyReturnsHeatmap, prepareUnderwaterDrawdownData } from '@/lib/services/performanceService';
import { getUserSnapshots } from '@/lib/services/snapshotService';
import { PerformanceData, PerformanceMetrics, TimePeriod, MonthlyReturnHeatmapData, UnderwaterDrawdownData } from '@/types/performance';
import { MonthlySnapshot } from '@/types/assets';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { RefreshCw, TrendingUp, Info } from 'lucide-react';
import { toast } from 'sonner';
import { formatCurrency, formatPercentage, formatCurrencyCompact } from '@/lib/services/chartService';
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
import { MonthlyReturnsHeatmap } from '@/components/performance/MonthlyReturnsHeatmap';
import { UnderwaterDrawdownChart } from '@/components/performance/UnderwaterDrawdownChart';

export default function PerformancePage() {
  const { user } = useAuth();
  const [performanceData, setPerformanceData] = useState<PerformanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedPeriod, setSelectedPeriod] = useState<TimePeriod>('YTD');
  const [showCustomDateDialog, setShowCustomDateDialog] = useState(false);
  const [cachedSnapshots, setCachedSnapshots] = useState<MonthlySnapshot[]>([]);

  // Responsive breakpoints
  const isMobile = useMediaQuery('(max-width: 767px)');
  const isLandscape = useMediaQuery('(min-width: 568px) and (max-height: 500px) and (orientation: landscape)');

  useEffect(() => {
    if (user) {
      loadPerformanceData();
    }
  }, [user]);

  const loadPerformanceData = async () => {
    if (!user) return;

    try {
      setLoading(true);

      // Fetch snapshots UNA volta e cachali
      const snapshots = await getUserSnapshots(user.uid);
      setCachedSnapshots(snapshots);

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
    if (!user || !performanceData || cachedSnapshots.length === 0) return;

    try {
      // Usa snapshot cachati invece di fetchare di nuovo
      const customMetrics = await calculatePerformanceForPeriod(
        user.uid,
        cachedSnapshots,  // ✅ Usa cache
        'CUSTOM',
        performanceData.ytd.riskFreeRate,
        startDate,
        endDate,
        undefined,  // preFetchedExpenses
        performanceData.ytd.dividendCategoryId  // ✅ Riusa categoryId dalle settings
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

  const getChartData = () => {  // ✅ Non più async!
    if (!performanceData || cachedSnapshots.length === 0) return [];

    const metrics = getCurrentMetrics();
    if (!metrics) return [];

    // Usa snapshot cachati invece di fetchare
    const periodSnapshots = getSnapshotsForPeriod(
      cachedSnapshots,  // ✅ Usa cache
      metrics.timePeriod,
      metrics.startDate,
      metrics.endDate
    );

    return preparePerformanceChartData(periodSnapshots, metrics.cashFlows);
  };

  const [chartData, setChartData] = useState<any[]>([]);
  const [heatmapData, setHeatmapData] = useState<MonthlyReturnHeatmapData[]>([]);
  const [underwaterData, setUnderwaterData] = useState<UnderwaterDrawdownData[]>([]);

  useEffect(() => {
    if (performanceData && cachedSnapshots.length > 0) {
      const data = getChartData();  // ✅ Ora sincrono!
      setChartData(data);

      // Calculate heatmap and underwater data
      const metrics = getCurrentMetrics();
      if (metrics) {
        const periodSnapshots = getSnapshotsForPeriod(
          cachedSnapshots,
          metrics.timePeriod,
          metrics.startDate,
          metrics.endDate
        );

        const heatmap = prepareMonthlyReturnsHeatmap(periodSnapshots, metrics.cashFlows);
        setHeatmapData(heatmap);

        const underwater = prepareUnderwaterDrawdownData(periodSnapshots, metrics.cashFlows);
        setUnderwaterData(underwater);
      }
    }
  }, [performanceData, selectedPeriod, cachedSnapshots]);

  // Responsive helper function
  const getChartHeight = () => {
    if (isLandscape) return 300;
    if (isMobile) return 280;
    return 400;
  };

  const rollingCagrMaWindowMonths = 3;
  const rollingSharpeMaWindowMonths = 3;

  const getRollingCagrData = (currentMetrics: PerformanceMetrics | null) => {
    if (!performanceData) {
      return [];
    }

    const sourceData = performanceData.rolling12M;

    const filteredData = currentMetrics
      ? sourceData.filter((entry) => {
          const entryDate = new Date(entry.periodEndDate);
          return entryDate >= currentMetrics.startDate && entryDate <= currentMetrics.endDate;
        })
      : sourceData;

    return filteredData.map((entry, index) => {
      const startIndex = Math.max(0, index - rollingCagrMaWindowMonths + 1);
      const windowValues = filteredData
        .slice(startIndex, index + 1)
        .map((item) => item.cagr)
        .filter((value) => Number.isFinite(value));

      const cagrMA = windowValues.length > 0
        ? windowValues.reduce((sum, value) => sum + value, 0) / windowValues.length
        : null;

      return { ...entry, cagrMA };
    });
  };

  const getRollingSharpeData = (currentMetrics: PerformanceMetrics | null) => {
    if (!performanceData) {
      return [];
    }

    const sourceData = performanceData.rolling12M;

    const filteredData = currentMetrics
      ? sourceData.filter((entry) => {
          const entryDate = new Date(entry.periodEndDate);
          return entryDate >= currentMetrics.startDate && entryDate <= currentMetrics.endDate;
        })
      : sourceData;

    return filteredData.map((entry, index) => {
      const startIndex = Math.max(0, index - rollingSharpeMaWindowMonths + 1);
      const windowValues = filteredData
        .slice(startIndex, index + 1)
        .map((item) => item.sharpeRatio)
        .filter((value): value is number => value !== null);

      const sharpeRatioMA = windowValues.length > 0
        ? windowValues.reduce((sum, value) => sum + value, 0) / windowValues.length
        : null;

      return { ...entry, sharpeRatioMA };
    });
  };

  const metrics = getCurrentMetrics();
  const rollingCagrData = getRollingCagrData(metrics);
  const rollingSharpeData = getRollingSharpeData(metrics);

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
            tooltip="Misura il guadagno/perdita totale del periodo selezionato. Formula: (Valore Finale - Valore Iniziale - Contributi Netti) / Valore Iniziale × 100. IMPORTANTE: Il valore cambia tra periodi diversi (YTD, 1Y, 3Y) perché calcola rendimenti su durate diverse. Per confrontare periodi diversi usa CAGR o TWR che sono annualizzati."
          />
          <MetricCard
            title="CAGR"
            value={metrics.cagr}
            format="percentage"
            description="Tasso di crescita annuale composto"
            tooltip="Rendimento medio annuo che il portafoglio avrebbe dovuto avere per passare dal valore iniziale (+ contributi) al valore finale. Utile per confrontare periodi di durata diversa. Considera i flussi di cassa ma non il loro timing."
            isPrimary
          />
          <MetricCard
            title="Time-Weighted Return"
            value={metrics.timeWeightedReturn}
            format="percentage"
            description="Rendimento time-weighted (annualizzato)"
            tooltip="Metrica raccomandata per valutare la performance. Elimina l'effetto del timing dei contributi/prelievi, mostrando la vera capacità di generare rendimento. Ideale per confrontare con benchmark o altri portafogli. Calcolo: rendimenti mensili collegati geometricamente e annualizzati."
            isPrimary
          />
          <MetricCard
            title="Sharpe Ratio"
            value={metrics.sharpeRatio}
            format="number"
            description="Rendimento aggiustato per il rischio"
            tooltip={`Misura quanto rendimento extra si ottiene per ogni unità di rischio assunto. Formula: (TWR - Tasso Risk-Free ${formatPercentage(metrics.riskFreeRate)}) / Volatilità. Interpretazione: <1 = scarso, 1-2 = buono, 2-3 = molto buono, >3 = eccellente.`}
          />
        </div>

        {/* Metrics Cards - Row 2 */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mt-4">
          <MetricCard
            title="Volatilità"
            value={metrics.volatility}
            format="percentage"
            description="Deviazione standard annualizzata"
            tooltip="Misura la variabilità dei rendimenti mensili (quanto 'ballano' i risultati). Valori bassi = investimento più stabile e prevedibile. Valori alti = maggiori oscillazioni e rischio. Calcolata sui rendimenti mensili ed espressa in forma annualizzata (× √12)."
          />
          <MetricCard
            title="Money-Weighted Return (IRR)"
            value={metrics.moneyWeightedReturn}
            format="percentage"
            description="Tasso interno di rendimento"
            tooltip="Rendimento personale dell'investitore che tiene conto di QUANDO hai investito o prelevato denaro. Se investi molto prima di una crescita = IRR alto. Se investi prima di un calo = IRR basso. Usa questa metrica per capire quanto hai guadagnato TU con le TUE decisioni di timing."
          />
          <MetricCard
            title="Contributi Netti"
            value={metrics.netCashFlow}
            format="currency"
            description={`Entrate: ${formatCurrency(metrics.totalIncome)} | Dividendi: ${formatCurrency(metrics.totalDividendIncome)} | Uscite: ${formatCurrency(metrics.totalExpenses)}`}
            tooltip={`Differenza netta tra entrate esterne (stipendi, bonus) e uscite (spese quotidiane). I dividendi (${formatCurrency(metrics.totalDividendIncome)}) sono mostrati separatamente perché sono rendimento del portafoglio, non contributi esterni. Valore positivo = stai risparmiando, negativo = stai spendendo più di quanto guadagni.`}
          />
          <MetricCard
            title="Durata"
            value={metrics.numberOfMonths}
            format="months"
            description={`Da ${metrics.startDate.toLocaleDateString('it-IT')} a ${metrics.endDate.toLocaleDateString('it-IT')}`}
            tooltip="Periodo di tempo coperto dall'analisi. La data di inizio è il primo giorno del mese del primo snapshot disponibile. La data di fine è l'ultimo giorno del mese dell'ultimo snapshot disponibile. Gli snapshot automatici vengono creati alla fine di ogni mese (28-31) e includono tutti i cash flow fino a quella data."
          />
        </div>

        {/* Metrics Cards - Row 3 - Max Drawdown & Drawdown Duration */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mt-4">
          <MetricCard
            title="Max Drawdown"
            value={metrics.maxDrawdown}
            subtitle={metrics.maxDrawdownDate}
            format="percentage"
            description="Massima perdita percentuale dal picco"
            tooltip="Misura la peggiore perdita (da picco a valle) che il portafoglio ha subito nel periodo selezionato. Esempio: se il portafoglio valeva €100.000 e scese a €85.000 prima di recuperare, il Max Drawdown è -15%. Calcolo aggiustato per flussi di cassa (sottratte le contribuzioni cumulative) per isolare la performance degli investimenti. Valori vicini allo 0% = portafoglio stabile, valori molto negativi = alta volatilità al ribasso."
          />

          <MetricCard
            title="Durata Drawdown"
            value={metrics.drawdownDuration}
            subtitle={metrics.drawdownPeriod}
            format="months"
            description="Tempo di recupero dal Max Drawdown"
            tooltip="Misura il tempo (in mesi) necessario per recuperare completamente dalla perdita più grande (Max Drawdown). Esempio: se il portafoglio perde il 15% a gennaio e recupera a dicembre, la durata è 11 mesi. Questo indicatore misura la resilienza del portafoglio: durate brevi indicano rapido recupero, durate lunghe segnalano lenta ripresa. Calcolo aggiustato per flussi di cassa per isolare la performance degli investimenti. Se il portafoglio è ancora in drawdown, mostra la durata dall'ultimo picco."
          />

          <MetricCard
            title="Recovery Time"
            value={metrics.recoveryTime}
            subtitle={metrics.recoveryPeriod}
            format="months"
            description="Tempo di risalita dalla valle"
            tooltip="Misura il tempo (in mesi) necessario per recuperare dal punto più basso (trough) del Max Drawdown fino al completo recupero. A differenza della Durata Drawdown (che parte dal picco iniziale), questa metrica misura SOLO la fase di risalita. Esempio: se il portafoglio scende per 6 mesi e poi risale per 9 mesi, Recovery Time = 9 mesi (Durata Drawdown = 15 mesi). Utile per valutare la velocità di recupero dopo aver toccato il fondo. Calcolo aggiustato per flussi di cassa per isolare la performance degli investimenti."
          />
        </div>

        {/* Net Worth Evolution Chart */}
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Evoluzione Patrimonio</CardTitle>
            <CardDescription>Patrimonio vs Contributi Cumulativi</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={getChartHeight()}>
                <AreaChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis tickFormatter={(value) => formatCurrencyCompact(value)} />
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
                    name="Investimenti"
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
        {rollingCagrData.length > 0 && (
          <Card className="mt-6">
            <CardHeader>
              <CardTitle>CAGR Rolling 12 Mesi</CardTitle>
              <CardDescription>
                Evoluzione del rendimento annualizzato su finestra mobile
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={getChartHeight()}>
                  <LineChart data={rollingCagrData}>
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
                    <Line
                      type="monotone"
                      dataKey="cagrMA"
                      stroke="#82ca9d"
                      strokeWidth={2}
                      name={`Media Mobile ${rollingCagrMaWindowMonths}M`}
                      strokeDasharray="6 4"
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

        {/* Rolling Sharpe Ratio Chart */}
        {rollingSharpeData.length > 0 && (
          <Card className="mt-6">
            <CardHeader>
              <CardTitle>Sharpe Ratio Rolling 12 Mesi</CardTitle>
              <CardDescription>
                Evoluzione del rapporto rischio-rendimento su finestra mobile
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={getChartHeight()}>
                <LineChart data={rollingSharpeData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="periodEndDate"
                    tickFormatter={(date) => new Date(date).toLocaleDateString('it-IT', { month: 'short', year: '2-digit' })}
                  />
                  <YAxis tickFormatter={(value) => value.toFixed(2)} />
                  <Tooltip
                    formatter={(value) => {
                      if (typeof value !== 'number' || Number.isNaN(value)) {
                        return 'n/d';
                      }
                      return value.toFixed(2);
                    }}
                    labelFormatter={(date) => new Date(date).toLocaleDateString('it-IT')}
                  />
                  <Legend formatter={(value) => String(value).replace(/^\d+\.\s*/, '')} />
                  <Line
                    type="monotone"
                    dataKey="sharpeRatio"
                    stroke="#ff7300"
                    strokeWidth={2}
                    name="1. Sharpe 12M"
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="sharpeRatioMA"
                    stroke="#82ca9d"
                    strokeWidth={2}
                    name={`2. Media Mobile ${rollingSharpeMaWindowMonths}M`}
                    strokeDasharray="6 4"
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* Monthly Returns Heatmap */}
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Heatmap Rendimenti Mensili</CardTitle>
            <CardDescription>
              Andamento mensile dei rendimenti per anno (aggiustato per flussi di cassa)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <MonthlyReturnsHeatmap data={heatmapData} />
          </CardContent>
        </Card>

        {/* Underwater Drawdown Chart */}
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Grafico Underwater (Drawdown)</CardTitle>
            <CardDescription>
              Distanza percentuale dal massimo storico del portafoglio
            </CardDescription>
          </CardHeader>
          <CardContent>
            <UnderwaterDrawdownChart data={underwaterData} height={getChartHeight()} />
          </CardContent>
        </Card>

        {/* Methodology Section */}
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Note Metodologiche</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div>
              <h4 className="font-semibold mb-1">Grafico: Evoluzione Patrimonio</h4>
              <p className="text-muted-foreground">
                Questo grafico mostra la composizione del patrimonio nel tempo, separando visivamente due componenti:
                <br /><br />
                <strong>Contributi (area blu):</strong> La somma cumulativa di tutti i flussi di cassa netti (entrate - uscite) registrati nella sezione Cashflow. Rappresenta quanto denaro hai effettivamente versato o prelevato nel tempo.
                <br />
                <strong>Investimenti (area verde):</strong> La differenza tra il patrimonio totale e i contributi cumulativi. Mostra quanto valore è stato generato (o perso) dagli investimenti grazie alle variazioni di prezzo degli asset.
                <br />
                <strong>Patrimonio Totale (linea arancione):</strong> Il net worth complessivo, dato dalla somma di contributi + investimenti.
                <br /><br />
                <em>Interpretazione:</em> Se l&apos;area verde cresce, i tuoi investimenti stanno generando rendimenti positivi. Se si riduce, stai perdendo valore sugli investimenti. Questo grafico ti permette di vedere quanto del patrimonio attuale deriva dal risparmio (contributi) rispetto agli investimenti.
              </p>
            </div>
            <div>
              <h4 className="font-semibold mb-1">Grafico: CAGR Rolling 12 Mesi</h4>
              <p className="text-muted-foreground">
                Questo grafico mostra l&apos;andamento del rendimento annualizzato calcolato su finestre mobili di 12 mesi consecutive.
                <br /><br />
                <strong>Finestra Mobile (Rolling):</strong> Per ogni punto del grafico viene calcolato il CAGR (Compound Annual Growth Rate) considerando i 12 mesi precedenti. Ad esempio, il punto di aprile 2025 mostra il CAGR del periodo maggio 2024 - aprile 2025.
                <br />
                <strong>Media Mobile:</strong> La linea tratteggiata è una media mobile a 3 mesi che smussa le oscillazioni e aiuta a leggere il trend.
                <br />
                <strong>Utilità:</strong> Permette di vedere se la performance sta migliorando o peggiorando nel tempo, eliminando l&apos;effetto di singoli mesi fortunati/sfortunati. È più stabile del rendimento mensile ma più reattivo del rendimento totale dall&apos;inizio.
                <br /><br />
                <em>Interpretazione:</em> Una linea in salita indica che la performance è in miglioramento negli ultimi 12 mesi. Una linea in discesa segnala un peggioramento. Le oscillazioni riflettono la volatilità del portafoglio.
              </p>
            </div>
            <div>
              <h4 className="font-semibold mb-1">Grafico: Sharpe Ratio Rolling</h4>
              <p className="text-muted-foreground">
                Questo grafico mostra l&apos;andamento del rapporto rischio-rendimento (Sharpe Ratio) calcolato su finestre mobili.
                <br /><br />
                <strong>Finestra Mobile (Rolling):</strong> Ogni punto rappresenta lo Sharpe Ratio calcolato sui 12 mesi precedenti.
                <br />
                <strong>Media Mobile:</strong> La linea tratteggiata è una media mobile a 3 mesi che smussa le oscillazioni e aiuta a leggere il trend.
                <br />
                <strong>Calcolo:</strong> (Rendimento TWR - tasso risk-free) / volatilità. Il tasso risk-free deriva dalle impostazioni utente, con fallback a un valore di default.
                <br />
                <strong>Utilità:</strong> Evidenzia come cambia nel tempo l&apos;efficienza del portafoglio nel generare rendimento per unità di rischio.
                <br /><br />
                <em>Interpretazione:</em> Valori più alti indicano un miglior rapporto rischio-rendimento. Variazioni ampie possono riflettere periodi di volatilità elevata o rendimenti instabili.
              </p>
            </div>
            <div>
              <h4 className="font-semibold mb-1">Grafico: Heatmap Rendimenti Mensili</h4>
              <p className="text-muted-foreground">
                Questo grafico mostra i rendimenti percentuali mese per mese, organizzati per anno. Ogni cella rappresenta il rendimento di un singolo mese.
                <br /><br />
                <strong>Calcolo:</strong> Il rendimento mensile è calcolato come ((Patrimonio Fine Mese - Flussi di Cassa) / Patrimonio Inizio Mese - 1) × 100. I flussi di cassa sono sottratti per isolare la performance degli investimenti.
                <br />
                <strong>Colori:</strong> Verde = rendimenti positivi, Rosso = rendimenti negativi. L&apos;intensità del colore aumenta con l&apos;ampiezza del rendimento (±5% soglia per colori più scuri).
                <br /><br />
                <em>Interpretazione:</em> Questo grafico aiuta a identificare pattern stagionali e mesi storicamente difficili o favorevoli. Ad esempio, se gennaio è spesso verde e settembre spesso rosso, potresti notare una stagionalità nel portafoglio.
              </p>
            </div>
            <div>
              <h4 className="font-semibold mb-1">Grafico: Underwater (Drawdown)</h4>
              <p className="text-muted-foreground">
                Questo grafico mostra quanto il portafoglio si trova &quot;sotto&quot; il suo massimo storico (drawdown). L&apos;area rossa indica la distanza percentuale dal picco precedente.
                <br /><br />
                <strong>Funzionamento:</strong> Quando il portafoglio raggiunge un nuovo massimo storico, il grafico torna a 0%. Quando il portafoglio scende, il grafico mostra la percentuale di perdita rispetto al picco. Calcolo aggiustato per flussi di cassa per isolare la performance degli investimenti.
                <br />
                <strong>Utilità:</strong> Visualizza rapidamente quanto tempo impiega il portafoglio a recuperare dopo le perdite. Periodi lunghi &quot;sott&apos;acqua&quot; (area rossa estesa) indicano lenti recuperi. Questo si collega alle metriche &quot;Durata Drawdown&quot; e &quot;Recovery Time&quot; mostrate sopra.
                <br /><br />
                <em>Interpretazione:</em> Un grafico che tocca spesso lo 0% indica un portafoglio che raggiunge frequentemente nuovi massimi (buon segno). Lunghe immersioni indicano periodi prolungati di sottoperformance rispetto ai picchi precedenti.
              </p>
            </div>
            <div>
              <h4 className="font-semibold mb-1">Periodi Temporali e Snapshot</h4>
              <p className="text-muted-foreground">
                <strong>Snapshot Automatici:</strong> Vengono creati automaticamente alla fine di ogni mese (dal 28 al 31) e catturano lo stato del portafoglio a quella data. I dati di patrimonio e cash flow sono allineati alla fine del mese.
                <br /><br />
                <strong>YTD (Year-to-Date):</strong> Dall&apos;inizio dell&apos;anno corrente (1° gennaio) fino all&apos;ultimo snapshot disponibile. La durata varia da 1 a 12 mesi a seconda del mese corrente.
                <br />
                <strong>1Y/3Y/5Y (Ultimi N Anni):</strong> Ultimi 12/36/60 mesi completi dalla data attuale, sempre basati su mesi interi (dal 1° all&apos;ultimo giorno del mese).
                <br />
                <strong>Storico:</strong> Tutti i dati disponibili dall&apos;inizio del tracciamento.
                <br /><br />
                <em>Esempio (se oggi è dicembre 2025):</em>
                <br />
                • YTD = gen-dic 2025 (12 mesi) | 1Y = gen-dic 2025 (12 mesi) → identici
                <br />
                <em>Esempio (se oggi è luglio 2025):</em>
                <br />
                • YTD = gen-lug 2025 (7 mesi) | 1Y = ago 2024-lug 2025 (12 mesi) → diversi
              </p>
            </div>
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
