'use client';

/**
 * MonteCarloTab Component
 *
 * Monte Carlo simulation interface for retirement planning and portfolio analysis.
 *
 * Monte Carlo Method:
 * Runs N simulations (default 10,000) of portfolio performance over retirement years.
 * Each simulation uses random sampling from normal distributions defined by return/volatility params.
 * Success rate = % of simulations where portfolio doesn't run out before retirement ends.
 *
 * Market parameters use long-term historical averages (equity 7%/18%, bonds 3%/6%)
 * which are the standard for FIRE Monte Carlo simulations. Users can manually adjust
 * these values to test different scenarios.
 *
 * Key Features:
 * - Auto-prefill portfolio value from user's current net worth
 * - Auto-prefill annual withdrawal from planned expenses (if set)
 * - Portfolio allocation validation (equity + bonds must equal 100%)
 * - Withdrawal adjustment modes: inflation-adjusted or fixed
 * - Rich visualization: percentile chart, distribution chart, success rate card
 *
 * @returns Tab component with parameter form, simulation button, and results visualization
 */

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { getAllAssets, calculateTotalValue, calculateLiquidNetWorth } from '@/lib/services/assetService';
import { getSettings } from '@/lib/services/assetAllocationService';
import {
  runMonteCarloSimulation,
  getDefaultMarketParameters,
} from '@/lib/services/monteCarloService';
import { formatCurrencyCompact } from '@/lib/services/chartService';
import { MonteCarloParams, MonteCarloResults } from '@/types/assets';
import { toast } from 'sonner';
import { Dices } from 'lucide-react';
import { SimulationChart } from '@/components/monte-carlo/SimulationChart';
import { SuccessRateCard } from '@/components/monte-carlo/SuccessRateCard';
import { ParametersForm } from '@/components/monte-carlo/ParametersForm';
import { DistributionChart } from '@/components/monte-carlo/DistributionChart';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export function MonteCarloTab() {
  // ========== State and Data Fetching ==========

  const { user } = useAuth();
  const [results, setResults] = useState<MonteCarloResults | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  /**
   * React Query Integration: Both queries run in parallel and are cached for 5 minutes.
   * This prevents redundant API calls when switching between tabs or re-rendering.
   */

  // Fetch assets data (will be cached)
  const { data: assets, isLoading: isLoadingAssets } = useQuery({
    queryKey: ['assets', user?.uid],
    queryFn: () => getAllAssets(user!.uid),
    enabled: !!user,
    staleTime: 300000, // 5 minutes
  });

  // Fetch settings data (will be cached)
  const { data: settings, isLoading: isLoadingSettings } = useQuery({
    queryKey: ['settings', user?.uid],
    queryFn: () => getSettings(user!.uid),
    enabled: !!user,
    staleTime: 300000, // 5 minutes
  });

  // Derived data calculations
  const totalNetWorth = assets ? calculateTotalValue(assets) : 0;
  const liquidNetWorth = assets ? calculateLiquidNetWorth(assets) : 0;

  // ========== Parameter Initialization ==========

  const defaultMarketParams = getDefaultMarketParameters();

  /**
   * Teacher Comment: Smart Parameter Initialization
   *
   * Initial params use sensible defaults:
   * - portfolioSource: 'total' (use total net worth, not just liquid)
   * - initialPortfolio: 0 (will be auto-filled from totalNetWorth in useEffect)
   * - retirementYears: 30 (common planning horizon)
   * - equity/bonds: 60/40 (classic balanced portfolio allocation)
   * - annualWithdrawal: 30000 (placeholder, will be auto-filled from settings)
   * - numberOfSimulations: 10000 (good balance of accuracy vs performance)
   *
   * Why initialize with 0 for initialPortfolio?
   * Assets query might not be loaded yet. The useEffect below will populate it
   * once data arrives, avoiding premature simulation runs with incomplete data.
   */
  const [params, setParams] = useState<MonteCarloParams>({
    portfolioSource: 'total',
    initialPortfolio: 0,
    retirementYears: 30,
    equityPercentage: 60,
    bondsPercentage: 40,
    annualWithdrawal: 30000,
    withdrawalAdjustment: 'inflation',
    equityReturn: defaultMarketParams.equityReturn,
    equityVolatility: defaultMarketParams.equityVolatility,
    bondsReturn: defaultMarketParams.bondsReturn,
    bondsVolatility: defaultMarketParams.bondsVolatility,
    inflationRate: defaultMarketParams.inflationRate,
    numberOfSimulations: 10000,
  });

  /**
   * Auto-fill portfolio value and withdrawal from user data.
   *
   * Why this effect depends on totalNetWorth and settings?
   * - Both values come from async queries that may not be loaded on mount
   * - We want to update params once data arrives, but not on every render
   * - Dependency array ensures we only update when these specific values change
   */
  useEffect(() => {
    if (totalNetWorth > 0 && settings) {
      setParams((prev) => ({
        ...prev,
        initialPortfolio: totalNetWorth,
        annualWithdrawal: settings.plannedAnnualExpenses || 30000,
      }));
    } else if (totalNetWorth > 0) {
      setParams((prev) => ({
        ...prev,
        initialPortfolio: totalNetWorth,
      }));
    }
  }, [totalNetWorth, settings]);

  // ========== Simulation Logic ==========

  const handleRunSimulation = () => {
    // Validation: Ensure all required parameters are valid before running
    if (params.initialPortfolio <= 0) {
      toast.error('Inserisci un patrimonio iniziale valido');
      return;
    }
    if (params.annualWithdrawal <= 0) {
      toast.error('Inserisci un prelievo annuale valido');
      return;
    }

    /**
     * Why Math.abs() with 0.01 tolerance instead of strict === 100?
     *
     * Floating point arithmetic can cause small precision errors. For example,
     * 60 + 40 might actually be 99.99999999999999 due to JavaScript's number
     * representation. Using absolute difference with small tolerance (0.01%)
     * accounts for these precision issues while still validating the sum is 100%.
     */
    if (Math.abs(params.equityPercentage + params.bondsPercentage - 100) > 0.01) {
      toast.error('La somma di Equity e Bonds deve essere 100%');
      return;
    }
    if (params.retirementYears < 1 || params.retirementYears > 60) {
      toast.error('Gli anni di pensionamento devono essere tra 1 e 60');
      return;
    }

    try {
      setIsRunning(true);
      toast.info('Esecuzione simulazione in corso...');

      /**
       * Why setTimeout with 100ms delay?
       *
       * Monte Carlo simulation with 10,000 runs is CPU-intensive and can block
       * the main thread for 1-2 seconds, freezing the UI. By wrapping in setTimeout,
       * we give the browser a chance to render the "running" state (spinner, disabled
       * button) before the heavy computation starts. This provides visual feedback
       * that something is happening, improving perceived performance.
       *
       * Alternative would be to use Web Workers, but that adds significant complexity.
       */
      setTimeout(() => {
        try {
          const simulationResults = runMonteCarloSimulation(params);
          setResults(simulationResults);
          toast.success(`Simulazione completata! Tasso di successo: ${simulationResults.successRate.toFixed(1)}%`);
        } catch (error) {
          console.error('Error running simulation:', error);
          toast.error('Errore durante la simulazione');
        } finally {
          setIsRunning(false);
        }
      }, 100);
    } catch (error) {
      console.error('Error starting simulation:', error);
      toast.error("Errore durante l'avvio della simulazione");
      setIsRunning(false);
    }
  };

  // ========== Render ==========

  if (isLoadingAssets || isLoadingSettings) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-gray-500">Caricamento...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ========== Information Card ========== */}
      <Card className="bg-gradient-to-r from-purple-50 to-blue-50 border-purple-200">
        <CardHeader>
          <CardTitle className="text-lg">ℹ️ Come Funzionano le Simulazioni</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div>
            <p className="font-semibold mb-1">📊 Parametri di Mercato</p>
            <ul className="list-disc list-inside space-y-1 text-gray-700 ml-2">
              <li>
                <strong>Default:</strong> Rendimenti e volatilità basati su medie storiche
                di lungo periodo (Equity 7%/18%, Bonds 3%/6%)
              </li>
              <li>
                <strong>Personalizzabili:</strong> Puoi modificare manualmente tutti i
                parametri per testare scenari diversi
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
