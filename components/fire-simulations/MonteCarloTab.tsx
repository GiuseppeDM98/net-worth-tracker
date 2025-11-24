'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { getAllAssets, calculateTotalValue, calculateLiquidNetWorth } from '@/lib/services/assetService';
import { getSettings } from '@/lib/services/assetAllocationService';
import { getUserSnapshots } from '@/lib/services/snapshotService';
import {
  runMonteCarloSimulation,
  calculateHistoricalReturns,
  getDefaultMarketParameters,
} from '@/lib/services/monteCarloService';
import { formatCurrencyCompact } from '@/lib/services/chartService';
import { Asset, MonteCarloParams, MonteCarloResults, HistoricalReturnsData } from '@/types/assets';
import { toast } from 'sonner';
import { Dices } from 'lucide-react';
import { SimulationChart } from '@/components/monte-carlo/SimulationChart';
import { SuccessRateCard } from '@/components/monte-carlo/SuccessRateCard';
import { ParametersForm } from '@/components/monte-carlo/ParametersForm';
import { DistributionChart } from '@/components/monte-carlo/DistributionChart';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export function MonteCarloTab() {
  const { user } = useAuth();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [totalNetWorth, setTotalNetWorth] = useState(0);
  const [liquidNetWorth, setLiquidNetWorth] = useState(0);
  const [historicalReturns, setHistoricalReturns] = useState<HistoricalReturnsData | null>(null);
  const [availableSnapshotCount, setAvailableSnapshotCount] = useState(0);
  const [results, setResults] = useState<MonteCarloResults | null>(null);
  const [loading, setLoading] = useState(true);
  const [isRunning, setIsRunning] = useState(false);

  const defaultMarketParams = getDefaultMarketParameters();

  const [params, setParams] = useState<MonteCarloParams>({
    portfolioSource: 'total',
    initialPortfolio: 0,
    retirementYears: 30,
    equityPercentage: 60,
    bondsPercentage: 40,
    annualWithdrawal: 30000,
    withdrawalAdjustment: 'inflation',
    parameterSource: 'market',
    equityReturn: defaultMarketParams.equityReturn,
    equityVolatility: defaultMarketParams.equityVolatility,
    bondsReturn: defaultMarketParams.bondsReturn,
    bondsVolatility: defaultMarketParams.bondsVolatility,
    inflationRate: defaultMarketParams.inflationRate,
    numberOfSimulations: 10000,
  });

  useEffect(() => {
    if (user) {
      loadData();
    }
  }, [user]);

  const loadData = async () => {
    if (!user) return;

    try {
      setLoading(true);

      // Load assets, settings, and snapshots
      const [assetsData, settingsData, snapshots] = await Promise.all([
        getAllAssets(user.uid),
        getSettings(user.uid),
        getUserSnapshots(user.uid),
      ]);

      setAssets(assetsData);

      // Calculate net worth
      const total = calculateTotalValue(assetsData);
      const liquid = calculateLiquidNetWorth(assetsData);
      setTotalNetWorth(total);
      setLiquidNetWorth(liquid);

      // Count real (non-dummy) snapshots
      const realSnapshotsCount = snapshots.filter((s) => !s.isDummy).length;
      setAvailableSnapshotCount(realSnapshotsCount);

      // Calculate historical returns if enough snapshots
      const historicalData = calculateHistoricalReturns(snapshots);
      setHistoricalReturns(historicalData);

      // Pre-populate parameters
      const plannedExpenses = settingsData?.plannedAnnualExpenses || 30000;

      setParams((prev) => ({
        ...prev,
        initialPortfolio: total,
        annualWithdrawal: plannedExpenses,
      }));
    } catch (error) {
      console.error('Error loading data:', error);
      toast.error('Errore nel caricamento dei dati');
    } finally {
      setLoading(false);
    }
  };

  const handleRunSimulation = () => {
    // Validate parameters
    if (params.initialPortfolio <= 0) {
      toast.error('Inserisci un patrimonio iniziale valido');
      return;
    }

    if (params.annualWithdrawal <= 0) {
      toast.error('Inserisci un prelievo annuale valido');
      return;
    }

    if (Math.abs(params.equityPercentage + params.bondsPercentage - 100) > 0.01) {
      toast.error('La somma di Equity e Bonds deve essere 100%');
      return;
    }

    if (params.retirementYears < 1 || params.retirementYears > 60) {
      toast.error('Gli anni di pensionamento devono essere tra 1 e 60');
      return;
    }

    // Run simulation
    try {
      setIsRunning(true);
      toast.info('Esecuzione simulazione in corso...');

      // Run simulation in a setTimeout to allow UI to update
      setTimeout(() => {
        try {
          const simulationResults = runMonteCarloSimulation(params);
          setResults(simulationResults);
          toast.success(
            `Simulazione completata! Tasso di successo: ${simulationResults.successRate.toFixed(1)}%`
          );
        } catch (error) {
          console.error('Error running simulation:', error);
          toast.error('Errore durante la simulazione');
        } finally {
          setIsRunning(false);
        }
      }, 100);
    } catch (error) {
      console.error('Error starting simulation:', error);
      toast.error('Errore durante l\'avvio della simulazione');
      setIsRunning(false);
    }
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
      {/* Info Card */}
      <Card className="bg-gradient-to-r from-purple-50 to-blue-50 border-purple-200">
        <CardHeader>
          <CardTitle className="text-lg">ℹ️ Come Funzionano le Simulazioni</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div>
            <p className="font-semibold mb-1">📊 Parametri di Mercato</p>
            <ul className="list-disc list-inside space-y-1 text-gray-700 ml-2">
              <li>
                <strong>Standard:</strong> Usa rendimenti e volatilità tipici del mercato
                (es. Equity 7%/18%, Bonds 3%/6%)
              </li>
              <li>
                <strong>Storici Personali:</strong> Calcola dai TUOI snapshot mensili
                (richiede ≥24 mesi di dati)
              </li>
            </ul>
          </div>
          <div>
            <p className="font-semibold mb-1">🎯 Interpretazione Risultati</p>
            <ul className="list-disc list-inside space-y-1 text-gray-700 ml-2">
              <li>
                <strong>Tasso di Successo:</strong> % di simulazioni dove il patrimonio
                dura almeno N anni
              </li>
              <li>
                <strong>&gt;90%:</strong> Piano molto sicuro e sostenibile
              </li>
              <li>
                <strong>80-90%:</strong> Piano buono con rischio moderato
              </li>
              <li>
                <strong>&lt;80%:</strong> Considera di ridurre prelievi o aumentare
                patrimonio
              </li>
            </ul>
          </div>
          <div>
            <p className="font-semibold mb-1">📈 Grafico Fan Chart</p>
            <ul className="list-disc list-inside space-y-1 text-gray-700 ml-2">
              <li>
                Mostra i percentili (10°, 25°, 50°, 75°, 90°) dell'evoluzione del
                patrimonio
              </li>
              <li>La linea blu rappresenta il valore mediano (50° percentile)</li>
              <li>Le aree colorate mostrano il range di possibili risultati</li>
            </ul>
          </div>
        </CardContent>
      </Card>

      {/* Parameters Form */}
      <ParametersForm
        params={params}
        onParamsChange={setParams}
        onRunSimulation={handleRunSimulation}
        totalNetWorth={totalNetWorth}
        liquidNetWorth={liquidNetWorth}
        historicalReturns={historicalReturns}
        availableSnapshotCount={availableSnapshotCount}
        isRunning={isRunning}
      />

      {/* Results */}
      {results && (
        <>
          {/* Success Rate Card */}
          <SuccessRateCard
            successRate={results.successRate}
            successCount={results.successCount}
            totalSimulations={params.numberOfSimulations}
            retirementYears={params.retirementYears}
            medianFinalValue={results.medianFinalValue}
          />

          {/* Simulation Chart (Fan Chart) */}
          <SimulationChart data={results.percentiles} retirementYears={params.retirementYears} />

          {/* Distribution Chart */}
          <DistributionChart data={results.distribution} retirementYears={params.retirementYears} />

          {/* Failure Analysis (if applicable) */}
          {results.failureAnalysis && (
            <Card className="border-red-200 bg-red-50">
              <CardHeader>
                <CardTitle className="text-red-900">Analisi Fallimenti</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <p className="text-sm text-red-700 mb-1">Anno Medio di Fallimento</p>
                    <p className="text-2xl font-bold text-red-900">
                      Anno {Math.round(results.failureAnalysis.averageFailureYear)}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-red-700 mb-1">Anno Mediano di Fallimento</p>
                    <p className="text-2xl font-bold text-red-900">
                      Anno {results.failureAnalysis.medianFailureYear}
                    </p>
                  </div>
                </div>
                <p className="mt-4 text-sm text-red-800">
                  In {results.failureCount} simulazioni ({(results.failureCount / params.numberOfSimulations * 100).toFixed(1)}%)
                  il patrimonio si è esaurito prima di raggiungere {params.retirementYears} anni.
                </p>
              </CardContent>
            </Card>
          )}

          {/* Percentile Table */}
          <Card>
            <CardHeader>
              <CardTitle>Tabella Percentili</CardTitle>
              <p className="text-sm text-muted-foreground">
                Valori del patrimonio ai percentili chiave durante il pensionamento
              </p>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-2">Anno</th>
                      <th className="text-right p-2">10° %ile</th>
                      <th className="text-right p-2">25° %ile</th>
                      <th className="text-right p-2 font-bold">Mediana</th>
                      <th className="text-right p-2">75° %ile</th>
                      <th className="text-right p-2">90° %ile</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.percentiles
                      .filter((_, index) => index % 5 === 0) // Show every 5 years
                      .map((p) => (
                        <tr key={p.year} className="border-b">
                          <td className="p-2">{p.year}</td>
                          <td className="text-right p-2">{formatCurrencyCompact(p.p10)}</td>
                          <td className="text-right p-2">{formatCurrencyCompact(p.p25)}</td>
                          <td className="text-right p-2 font-bold">{formatCurrencyCompact(p.p50)}</td>
                          <td className="text-right p-2">{formatCurrencyCompact(p.p75)}</td>
                          <td className="text-right p-2">{formatCurrencyCompact(p.p90)}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* Empty State */}
      {!results && !isRunning && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Dices className="h-16 w-16 text-gray-400 mb-4" />
            <p className="text-gray-600 text-center">
              Configura i parametri sopra e clicca su &quot;Esegui Simulazione&quot; per
              vedere i risultati
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
