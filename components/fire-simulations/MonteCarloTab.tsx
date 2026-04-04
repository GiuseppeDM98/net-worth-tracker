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

import { useEffect, useMemo, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
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
import { Dices, Loader2 } from 'lucide-react';
import { MonteCarloSkeleton } from '@/components/fire-simulations/MonteCarloSkeleton';
import { SimulationChart } from '@/components/monte-carlo/SimulationChart';
import { SuccessRateCard } from '@/components/monte-carlo/SuccessRateCard';
import { ParametersForm } from '@/components/monte-carlo/ParametersForm';
import { DistributionChart } from '@/components/monte-carlo/DistributionChart';
import { ScenarioParameterCards } from '@/components/monte-carlo/ScenarioParameterCards';
import { ScenarioComparisonResults } from '@/components/monte-carlo/ScenarioComparisonResults';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { chartReveal, simulationShellSettle } from '@/lib/utils/motionVariants';

export function MonteCarloTab() {
  // ========== State and Data Fetching ==========

  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [results, setResults] = useState<MonteCarloResults | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const reducedMotion = useReducedMotion();
  const [singleRunVersion, setSingleRunVersion] = useState(0);
  const [scenarioRunVersion, setScenarioRunVersion] = useState(0);
  const [resultsAnimationState, setResultsAnimationState] = useState<'idle' | 'settle'>('idle');

  // Scenario mode state
  const [scenarioMode, setScenarioMode] = useState(false);
  const [scenarios, setScenarios] = useState<MonteCarloScenarios>(getDefaultMonteCarloScenarios());
  const [scenarioResults, setScenarioResults] = useState<{
    bear: MonteCarloResults;
    base: MonteCarloResults;
    bull: MonteCarloResults;
  } | null>(null);

  useEffect(() => {
    if (reducedMotion) {
      setResultsAnimationState('idle');
      return;
    }

    const version = scenarioMode ? scenarioRunVersion : singleRunVersion;
    if (version === 0) return;

    setResultsAnimationState('settle');
    const timer = window.setTimeout(() => setResultsAnimationState('idle'), 320);
    return () => window.clearTimeout(timer);
  }, [reducedMotion, scenarioMode, scenarioRunVersion, singleRunVersion]);

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
        setSingleRunVersion((current) => current + 1);
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
        setScenarioRunVersion((current) => current + 1);
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
    return <MonteCarloSkeleton />;
  }

  const hasVisibleResults = useMemo(
    () => (!scenarioMode && !!results) || (scenarioMode && !!scenarioResults),
    [results, scenarioMode, scenarioResults]
  );

  return (
    <div className="space-y-6">
      {/* ========== Information Card ========== */}
      <Card className="bg-gradient-to-r from-purple-50 to-blue-50 border-purple-200 dark:from-purple-950/30 dark:to-blue-950/30 dark:border-purple-800">
        <CardHeader>
          <CardTitle className="text-lg">Come Funzionano le Simulazioni</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div>
            <p className="font-semibold mb-1">Parametri di Mercato</p>
            <ul className="list-disc list-inside space-y-1 text-gray-700 dark:text-gray-300 ml-2">
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
            <ul className="list-disc list-inside space-y-1 text-gray-700 dark:text-gray-300 ml-2">
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
            className={`px-3 py-1.5 sm:px-4 sm:py-2 text-sm font-medium rounded-md transition-colors ${
              !scenarioMode
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Simulazione Singola
          </button>
          <button
            onClick={() => setScenarioMode(true)}
            className={`px-3 py-1.5 sm:px-4 sm:py-2 text-sm font-medium rounded-md transition-colors ${
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

      {isRunning && hasVisibleResults && (
        <Card className="border-border bg-muted/40">
          <CardContent className="flex items-center gap-3 py-4 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>
              Ricalcolo in corso. Manteniamo visibile l&apos;ultima simulazione valida finche&apos; il nuovo scenario non si assesta.
            </span>
          </CardContent>
        </Card>
      )}

      {/* ========== Single Mode Results ========== */}
      {!scenarioMode && results && (
        <motion.div
          className="space-y-6"
          variants={simulationShellSettle}
          initial={false}
          animate={resultsAnimationState}
        >
          {/* Success Rate Card */}
          <SuccessRateCard
            successRate={results.successRate}
            successCount={results.successCount}
            totalSimulations={params.numberOfSimulations}
            retirementYears={params.retirementYears}
            medianFinalValue={results.medianFinalValue}
          />

          {/* Simulation Chart (Fan Chart) */}
          <motion.div variants={chartReveal} initial={reducedMotion ? false : 'hidden'} animate="visible">
            <SimulationChart
              data={results.percentiles}
              retirementYears={params.retirementYears}
              revealKey={singleRunVersion}
            />
          </motion.div>

          {/* Distribution Chart */}
          <motion.div variants={chartReveal} initial={reducedMotion ? false : 'hidden'} animate="visible">
            <DistributionChart
              data={results.distribution}
              retirementYears={params.retirementYears}
              revealKey={singleRunVersion}
            />
          </motion.div>

          {/* Failure Analysis (if applicable) */}
          {results.failureAnalysis && (
            <Card className="border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-800">
              <CardHeader>
                <CardTitle className="text-red-900 dark:text-red-200">Analisi Fallimenti</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 desktop:grid-cols-2">
                  <div>
                    <p className="text-sm text-red-700 dark:text-red-300 mb-1">Anno Medio di Fallimento</p>
                    <p className="text-2xl font-bold text-red-900 dark:text-red-200">
                      Anno {Math.round(results.failureAnalysis.averageFailureYear)}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-red-700 dark:text-red-300 mb-1">Anno Mediano di Fallimento</p>
                    <p className="text-2xl font-bold text-red-900 dark:text-red-200">
                      Anno {results.failureAnalysis.medianFailureYear}
                    </p>
                  </div>
                </div>
                <p className="mt-4 text-sm text-red-800 dark:text-red-300">
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
              {/* Mobile/tablet: card view — one card per row */}
              <div className="desktop:hidden space-y-2">
                {results.percentiles
                  .filter((_, index) => index % 5 === 0)
                  .map((p) => (
                    <div key={p.year} className="rounded-lg border bg-gray-50/50 p-3">
                      <p className="font-semibold text-sm mb-2">Anno {p.year}</p>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                        <div className="flex justify-between">
                          <span className="text-gray-500">10° %ile</span>
                          <span>{formatCurrencyCompact(p.p10)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500">25° %ile</span>
                          <span>{formatCurrencyCompact(p.p25)}</span>
                        </div>
                        <div className="flex justify-between font-bold">
                          <span className="text-gray-500">Mediana</span>
                          <span>{formatCurrencyCompact(p.p50)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500">75° %ile</span>
                          <span>{formatCurrencyCompact(p.p75)}</span>
                        </div>
                        <div className="flex justify-between col-span-2">
                          <span className="text-gray-500">90° %ile</span>
                          <span>{formatCurrencyCompact(p.p90)}</span>
                        </div>
                      </div>
                    </div>
                  ))}
              </div>

              {/* Desktop: full table */}
              <div className="hidden desktop:block overflow-x-auto">
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
                      .filter((_, index) => index % 5 === 0)
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
        </motion.div>
      )}

      {/* ========== Scenario Mode Results ========== */}
      {scenarioMode && scenarioResults && (
        <ScenarioComparisonResults
          bear={scenarioResults.bear}
          base={scenarioResults.base}
          bull={scenarioResults.bull}
          retirementYears={params.retirementYears}
          numberOfSimulations={params.numberOfSimulations}
          refreshKey={scenarioRunVersion}
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
