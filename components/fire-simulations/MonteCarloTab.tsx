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
 * Supports 4 asset classes (equity, bonds, real estate, commodities) and two modes:
 * - Single Simulation: one set of market parameters, full results
 * - Scenario Comparison: Bear/Base/Bull scenarios run in parallel for side-by-side comparison
 *
 * @returns Tab component with parameter form, simulation button, and results visualization
 */

import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { getAllAssets, calculateTotalValue, calculateLiquidNetWorth } from '@/lib/services/assetService';
import { getSettings, setSettings, getDefaultTargets, calculateCurrentAllocation } from '@/lib/services/assetAllocationService';
import {
  runMonteCarloSimulation,
  getDefaultMarketParameters,
  getDefaultMonteCarloScenarios,
  buildParamsFromScenario,
} from '@/lib/services/monteCarloService';
import { formatCurrencyCompact } from '@/lib/services/chartService';
import { MonteCarloParams, MonteCarloResults, MonteCarloScenarios } from '@/types/assets';
import { toast } from 'sonner';
import { Dices } from 'lucide-react';
import { SimulationChart } from '@/components/monte-carlo/SimulationChart';
import { SuccessRateCard } from '@/components/monte-carlo/SuccessRateCard';
import { ParametersForm } from '@/components/monte-carlo/ParametersForm';
import { DistributionChart } from '@/components/monte-carlo/DistributionChart';
import { ScenarioParameterCards } from '@/components/monte-carlo/ScenarioParameterCards';
import { ScenarioComparisonResults } from '@/components/monte-carlo/ScenarioComparisonResults';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export function MonteCarloTab() {
  // ========== State and Data Fetching ==========

  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [results, setResults] = useState<MonteCarloResults | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  // Scenario mode state
  const [scenarioMode, setScenarioMode] = useState(false);
  const [scenarios, setScenarios] = useState<MonteCarloScenarios>(getDefaultMonteCarloScenarios());
  const [scenarioResults, setScenarioResults] = useState<{
    bear: MonteCarloResults;
    base: MonteCarloResults;
    bull: MonteCarloResults;
  } | null>(null);

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
   * Initial params use sensible defaults:
   * - equity/bonds/realEstate/commodities: 60/40/0/0 (classic balanced, backward compatible)
   * - New asset classes default to 0% so existing behavior is unchanged until user opts in
   */
  const [params, setParams] = useState<MonteCarloParams>({
    portfolioSource: 'total',
    initialPortfolio: 0,
    retirementYears: 30,
    equityPercentage: 60,
    bondsPercentage: 40,
    realEstatePercentage: 0,
    commoditiesPercentage: 0,
    annualWithdrawal: 30000,
    withdrawalAdjustment: 'inflation',
    equityReturn: defaultMarketParams.equityReturn,
    equityVolatility: defaultMarketParams.equityVolatility,
    bondsReturn: defaultMarketParams.bondsReturn,
    bondsVolatility: defaultMarketParams.bondsVolatility,
    realEstateReturn: defaultMarketParams.realEstateReturn,
    realEstateVolatility: defaultMarketParams.realEstateVolatility,
    commoditiesReturn: defaultMarketParams.commoditiesReturn,
    commoditiesVolatility: defaultMarketParams.commoditiesVolatility,
    inflationRate: defaultMarketParams.inflationRate,
    numberOfSimulations: 10000,
  });

  /**
   * Auto-fill portfolio value, withdrawal, and asset allocation from user data.
   * Allocation is derived from real portfolio proportions, normalized to 100%
   * across the 4 MC asset classes (excluding crypto and cash).
   */
  useEffect(() => {
    if (totalNetWorth > 0) {
      setParams((prev) => {
        const updates: Partial<MonteCarloParams> = {
          initialPortfolio: totalNetWorth,
        };

        if (settings) {
          updates.annualWithdrawal = settings.plannedAnnualExpenses || 30000;
        }

        // Derive allocation from real portfolio, filtering to the 4 MC classes
        if (assets && assets.length > 0) {
          const { byAssetClass } = calculateCurrentAllocation(assets);
          const equity = byAssetClass['equity'] || 0;
          const bonds = byAssetClass['bonds'] || 0;
          const realEstate = byAssetClass['realestate'] || 0;
          const commodities = byAssetClass['commodity'] || 0;
          const total = equity + bonds + realEstate + commodities;

          if (total > 0) {
            // Sort by value descending so rounding residual goes to smallest class
            const classes = [
              { key: 'equityPercentage' as const, value: equity },
              { key: 'bondsPercentage' as const, value: bonds },
              { key: 'realEstatePercentage' as const, value: realEstate },
              { key: 'commoditiesPercentage' as const, value: commodities },
            ].sort((a, b) => b.value - a.value);

            // Round first 3, compute last as remainder to guarantee sum = 100
            let allocated = 0;
            for (let i = 0; i < classes.length - 1; i++) {
              const pct = Math.round((classes[i].value / total) * 100);
              updates[classes[i].key] = pct;
              allocated += pct;
            }
            updates[classes[classes.length - 1].key] = 100 - allocated;
          }
        }

        return { ...prev, ...updates };
      });
    }
  }, [totalNetWorth, settings, assets]);

  // Sync scenario params from Firestore when settings load
  useEffect(() => {
    if (settings?.monteCarloScenarios) {
      setScenarios(settings.monteCarloScenarios);
    }
  }, [settings?.monteCarloScenarios]);

  // ========== Scenario Persistence ==========

  const saveMutation = useMutation({
    mutationFn: () => {
      if (!user) throw new Error('User not authenticated');
      return setSettings(user.uid, {
        ...settings,
        targets: settings?.targets || getDefaultTargets(),
        monteCarloScenarios: scenarios,
      });
    },
    onSuccess: () => {
      toast.success('Parametri scenari salvati');
      queryClient.invalidateQueries({ queryKey: ['settings', user?.uid] });
    },
    onError: () => toast.error('Errore nel salvataggio dei parametri'),
  });

  // ========== Validation ==========

  const validateParams = (): boolean => {
    if (params.initialPortfolio <= 0) {
      toast.error('Inserisci un patrimonio iniziale valido');
      return false;
    }
    if (params.annualWithdrawal <= 0) {
      toast.error('Inserisci un prelievo annuale valido');
      return false;
    }

    // All 4 asset classes must sum to 100%
    const allocationSum = params.equityPercentage + params.bondsPercentage +
      params.realEstatePercentage + params.commoditiesPercentage;
    if (Math.abs(allocationSum - 100) > 0.01) {
      toast.error('La somma delle allocazioni deve essere 100%');
      return false;
    }
    if (params.retirementYears < 1 || params.retirementYears > 60) {
      toast.error('Gli anni di pensionamento devono essere tra 1 e 60');
      return false;
    }
    return true;
  };

  // ========== Simulation Logic ==========

  const handleRunSimulation = () => {
    if (!validateParams()) return;

    setIsRunning(true);
    toast.info('Esecuzione simulazione in corso...');

    /**
     * Why setTimeout with 100ms delay?
     * Monte Carlo simulation is CPU-intensive and blocks the main thread.
     * The delay lets the browser render the "running" state before computation starts.
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
  };

  const handleRunScenarioSimulation = () => {
    if (!validateParams()) return;

    setIsRunning(true);
    toast.info('Esecuzione 3 scenari in corso...');

    setTimeout(() => {
      try {
        const bearParams = buildParamsFromScenario(params, scenarios.bear);
        const baseParams = buildParamsFromScenario(params, scenarios.base);
        const bullParams = buildParamsFromScenario(params, scenarios.bull);

        const bearResults = runMonteCarloSimulation(bearParams);
        const baseResults = runMonteCarloSimulation(baseParams);
        const bullResults = runMonteCarloSimulation(bullParams);

        setScenarioResults({ bear: bearResults, base: baseResults, bull: bullResults });
        toast.success('Simulazione scenari completata!');
      } catch (error) {
        console.error('Error running scenario simulation:', error);
        toast.error('Errore durante la simulazione scenari');
      } finally {
        setIsRunning(false);
      }
    }, 100);
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
          <CardTitle className="text-lg">Come Funzionano le Simulazioni</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div>
            <p className="font-semibold mb-1">Parametri di Mercato</p>
            <ul className="list-disc list-inside space-y-1 text-gray-700 ml-2">
              <li>
                <strong>4 Asset Class:</strong> Equity, Bonds, Immobili e Materie Prime con
                rendimenti e volatilità personalizzabili
              </li>
              <li>
                <strong>Scenari:</strong> Confronta scenari Orso/Base/Toro con parametri
                diversi per ogni asset class
              </li>
            </ul>
          </div>
          <div>
            <p className="font-semibold mb-1">Interpretazione Risultati</p>
            <ul className="list-disc list-inside space-y-1 text-gray-700 ml-2">
              <li>
                <strong>Tasso di Successo:</strong> % di simulazioni dove il patrimonio
                dura almeno N anni
              </li>
              <li>
                <strong>&gt;90%:</strong> Piano molto sicuro | <strong>80-90%:</strong> Rischio moderato | <strong>&lt;80%:</strong> Considera aggiustamenti
              </li>
            </ul>
          </div>
        </CardContent>
      </Card>

      {/* ========== Mode Toggle ========== */}
      <div className="flex items-center justify-center">
        <div className="inline-flex rounded-lg border bg-muted p-1">
          <button
            onClick={() => setScenarioMode(false)}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              !scenarioMode
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Simulazione Singola
          </button>
          <button
            onClick={() => setScenarioMode(true)}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              scenarioMode
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Confronto Scenari
          </button>
        </div>
      </div>

      {/* Parameters Form — hides market params in scenario mode */}
      <ParametersForm
        params={params}
        onParamsChange={setParams}
        onRunSimulation={scenarioMode ? handleRunScenarioSimulation : handleRunSimulation}
        totalNetWorth={totalNetWorth}
        liquidNetWorth={liquidNetWorth}
        isRunning={isRunning}
        hideMarketParams={scenarioMode}
      />

      {/* ========== Scenario Parameter Cards (only in scenario mode) ========== */}
      {scenarioMode && (
        <ScenarioParameterCards
          scenarios={scenarios}
          onScenariosChange={setScenarios}
          onSave={() => saveMutation.mutate()}
          onReset={() => setScenarios(getDefaultMonteCarloScenarios())}
          isSaving={saveMutation.isPending}
        />
      )}

      {/* ========== Single Mode Results ========== */}
      {!scenarioMode && results && (
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

      {/* ========== Scenario Mode Results ========== */}
      {scenarioMode && scenarioResults && (
        <ScenarioComparisonResults
          bear={scenarioResults.bear}
          base={scenarioResults.base}
          bull={scenarioResults.bull}
          retirementYears={params.retirementYears}
          numberOfSimulations={params.numberOfSimulations}
        />
      )}

      {/* Empty State */}
      {((!scenarioMode && !results) || (scenarioMode && !scenarioResults)) && !isRunning && (
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
