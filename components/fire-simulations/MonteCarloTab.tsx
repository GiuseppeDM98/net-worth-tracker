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
 * Supports two modes:
 * - Single Simulation: one set of market parameters, full fan chart + distribution
 * - Scenario Comparison: Bear/Base/Bull scenarios run in parallel for side-by-side comparison
 */

import { useEffect, useState } from 'react';
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
import { formatCurrency, formatCurrencyCompact, formatPercentage } from '@/lib/services/chartService';
import { MonteCarloParams, MonteCarloResults, MonteCarloScenarios } from '@/types/assets';
import { toast } from 'sonner';
import { Dices, Loader2, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCountUp } from '@/lib/utils/useCountUp';
import { MonteCarloSkeleton } from '@/components/fire-simulations/MonteCarloSkeleton';
import { SimulationChart } from '@/components/monte-carlo/SimulationChart';
import { ParametersForm } from '@/components/monte-carlo/ParametersForm';
import { DistributionChart } from '@/components/monte-carlo/DistributionChart';
import { ScenarioParameterCards } from '@/components/monte-carlo/ScenarioParameterCards';
import { ScenarioComparisonResults } from '@/components/monte-carlo/ScenarioComparisonResults';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { chartReveal, simulationShellSettle } from '@/lib/utils/motionVariants';

// ===== Module-level pure helpers =====

function getSuccessLabel(rate: number): string {
  if (rate >= 95) return 'Eccellente';
  if (rate >= 90) return 'Molto buono';
  if (rate >= 80) return 'Buono';
  if (rate >= 70) return 'Moderato';
  return 'Attenzione';
}

function getSuccessLabelColor(rate: number): string {
  if (rate >= 90) return 'text-green-600 dark:text-green-400 border-green-200 dark:border-green-800';
  if (rate >= 80) return 'text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-800';
  return 'text-destructive border-destructive/30';
}

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

  // ===== Hero count-up animations =====
  // Both hooks must be called unconditionally; active one selected at render time
  const animatedSingleRate = useCountUp(results?.successRate ?? null, {
    fromPrevious: true,
    once: true,
    duration: 520,
  });
  const animatedScenarioRate = useCountUp(scenarioResults?.base.successRate ?? null, {
    fromPrevious: true,
    once: true,
    duration: 520,
  });

  /**
   * React Query Integration: Both queries run in parallel and are cached for 5 minutes.
   */
  const { data: assets, isLoading: isLoadingAssets } = useQuery({
    queryKey: ['assets', user?.uid],
    queryFn: () => getAllAssets(user!.uid),
    enabled: !!user,
    staleTime: 300000,
  });

  const { data: settings, isLoading: isLoadingSettings } = useQuery({
    queryKey: ['settings', user?.uid],
    queryFn: () => getSettings(user!.uid),
    enabled: !!user,
    staleTime: 300000,
  });

  // Derived data
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
        const updates: Partial<MonteCarloParams> = { initialPortfolio: totalNetWorth };

        if (settings) {
          updates.annualWithdrawal = settings.plannedAnnualExpenses || 30000;
        }

        if (assets && assets.length > 0) {
          const { byAssetClass } = calculateCurrentAllocation(assets);
          const equity = byAssetClass['equity'] || 0;
          const bonds = byAssetClass['bonds'] || 0;
          const realEstate = byAssetClass['realestate'] || 0;
          const commodities = byAssetClass['commodity'] || 0;
          const total = equity + bonds + realEstate + commodities;

          if (total > 0) {
            // Sort descending so rounding residual goes to the smallest class
            const classes = [
              { key: 'equityPercentage' as const, value: equity },
              { key: 'bondsPercentage' as const, value: bonds },
              { key: 'realEstatePercentage' as const, value: realEstate },
              { key: 'commoditiesPercentage' as const, value: commodities },
            ].sort((a, b) => b.value - a.value);

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
    const allocationSum =
      params.equityPercentage +
      params.bondsPercentage +
      params.realEstatePercentage +
      params.commoditiesPercentage;
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

    /**
     * Why setTimeout with 100ms delay?
     * Monte Carlo is CPU-intensive and blocks the main thread.
     * The delay lets the browser render the "running" state before computation starts.
     */
    setTimeout(() => {
      try {
        const simulationResults = runMonteCarloSimulation(params);
        setResults(simulationResults);
        setSingleRunVersion((v) => v + 1);
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

    setTimeout(() => {
      try {
        const bearResults = runMonteCarloSimulation(buildParamsFromScenario(params, scenarios.bear));
        const baseResults = runMonteCarloSimulation(buildParamsFromScenario(params, scenarios.base));
        const bullResults = runMonteCarloSimulation(buildParamsFromScenario(params, scenarios.bull));
        setScenarioResults({ bear: bearResults, base: baseResults, bull: bullResults });
        setScenarioRunVersion((v) => v + 1);
        toast.success('Simulazione scenari completata!');
      } catch (error) {
        console.error('Error running scenario simulation:', error);
        toast.error('Errore durante la simulazione scenari');
      } finally {
        setIsRunning(false);
      }
    }, 100);
  };

  // ========== Derived flags (must be before early return to avoid hooks ordering issues) =====

  const hasVisibleResults =
    (!scenarioMode && !!results) || (scenarioMode && !!scenarioResults);

  // Active hero value depends on mode
  const heroAnimatedRate = scenarioMode ? animatedScenarioRate : animatedSingleRate;
  const heroHasResult = scenarioMode ? !!scenarioResults : !!results;

  // ========== Render ==========

  if (isLoadingAssets || isLoadingSettings) {
    return <MonteCarloSkeleton />;
  }

  return (
    <div className="space-y-6 max-desktop:portrait:pb-20">
      {/* ========== 1. Hero Block — Tasso di Successo ========== */}
      <Card className="overflow-hidden">
        <div className="px-6 py-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1 space-y-1">
              <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground/70">
                {scenarioMode ? 'Probabilità di Successo (Scenario Base)' : 'Probabilità di Successo'}
              </p>
              <p
                className={cn(
                  'font-mono text-4xl font-bold tabular-nums leading-none tracking-tight',
                  heroHasResult ? 'text-foreground' : 'text-muted-foreground/30'
                )}
                aria-label={
                  heroHasResult && heroAnimatedRate !== null
                    ? `Probabilità di successo: ${heroAnimatedRate.toFixed(1)}%`
                    : 'Nessuna simulazione eseguita'
                }
              >
                {heroHasResult && heroAnimatedRate !== null
                  ? formatPercentage(heroAnimatedRate)
                  : '--'}
              </p>
              <p className="text-xs text-muted-foreground">
                {heroHasResult
                  ? scenarioMode
                    ? `${scenarioResults!.base.successCount.toLocaleString('it-IT')} / ${params.numberOfSimulations.toLocaleString('it-IT')} simulazioni riuscite`
                    : `${results!.successCount.toLocaleString('it-IT')} / ${params.numberOfSimulations.toLocaleString('it-IT')} simulazioni riuscite`
                  : 'Configura i parametri ed esegui la simulazione'}
              </p>
            </div>
            {heroHasResult && heroAnimatedRate !== null && (
              <Badge
                variant="outline"
                className={cn('mt-1 shrink-0 text-xs', getSuccessLabelColor(heroAnimatedRate))}
              >
                {getSuccessLabel(heroAnimatedRate)}
              </Badge>
            )}
          </div>
        </div>
        {/* Median final value flat row — only in single mode */}
        {!scenarioMode && results && results.medianFinalValue > 0 && (
          <div className="flex items-center justify-between px-6 py-3.5 border-t border-border">
            <span className="text-sm text-muted-foreground">Valore mediano (sim. riuscite)</span>
            <span className="text-sm font-semibold font-mono">
              {formatCurrency(results.medianFinalValue)}
            </span>
          </div>
        )}
      </Card>

      {/* ========== 2. Mode Toggle ========== */}
      <div className="flex items-center justify-center">
        <div role="tablist" className="inline-flex rounded-lg border bg-muted p-1 gap-0.5">
          {[
            { id: 'single', label: 'Simulazione Singola', active: !scenarioMode },
            { id: 'scenario', label: 'Confronto Scenari', active: scenarioMode },
          ].map(({ id, label, active }) => (
            <button
              key={id}
              role="tab"
              type="button"
              aria-selected={active}
              onClick={() => setScenarioMode(id === 'scenario')}
              className={cn(
                'relative px-3 py-1.5 text-sm font-medium rounded-md transition-colors',
                active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {active && (
                <motion.div
                  layoutId="montecarlo-mode-pill"
                  className="absolute inset-0 rounded-md bg-background shadow-sm"
                  transition={{ type: 'spring', stiffness: 400, damping: 35 }}
                />
              )}
              <span className="relative z-10">{label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ========== 3. Parameters Form ========== */}
      <ParametersForm
        params={params}
        onParamsChange={setParams}
        onRunSimulation={scenarioMode ? handleRunScenarioSimulation : handleRunSimulation}
        totalNetWorth={totalNetWorth}
        liquidNetWorth={liquidNetWorth}
        isRunning={isRunning}
        hideMarketParams={scenarioMode}
      />

      {/* ========== 4. Scenario Parameter Cards (scenario mode only) ========== */}
      {scenarioMode && (
        <ScenarioParameterCards
          scenarios={scenarios}
          onScenariosChange={setScenarios}
          onSave={() => saveMutation.mutate()}
          onReset={() => setScenarios(getDefaultMonteCarloScenarios())}
          isSaving={saveMutation.isPending}
        />
      )}

      {/* ========== Ricalcolo in corso banner ========== */}
      {isRunning && hasVisibleResults && (
        <Card className="border-border bg-muted/40">
          <CardContent className="flex items-center gap-3 py-4 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin shrink-0" />
            <span>
              Ricalcolo in corso. Manteniamo visibile l&apos;ultima simulazione valida finché
              il nuovo scenario non si assesta.
            </span>
          </CardContent>
        </Card>
      )}

      {/* ========== 5. Single Mode Results ========== */}
      {!scenarioMode && results && (
        <motion.div
          className="space-y-6"
          variants={simulationShellSettle}
          initial={false}
          animate={resultsAnimationState}
        >
          {/* Fan Chart */}
          <motion.div
            variants={chartReveal}
            initial={reducedMotion ? false : 'hidden'}
            animate="visible"
          >
            <SimulationChart
              data={results.percentiles}
              retirementYears={params.retirementYears}
              revealKey={singleRunVersion}
            />
          </motion.div>

          {/* Distribution Chart */}
          <motion.div
            variants={chartReveal}
            initial={reducedMotion ? false : 'hidden'}
            animate="visible"
          >
            <DistributionChart
              data={results.distribution}
              retirementYears={params.retirementYears}
              revealKey={singleRunVersion}
            />
          </motion.div>

          {/* Failure Analysis — only when there are failures */}
          {results.failureAnalysis && (
            <Card
              className="overflow-hidden"
              style={{
                borderColor: 'color-mix(in srgb, var(--destructive) 35%, transparent)',
                background: 'color-mix(in srgb, var(--destructive) 6%, transparent)',
              }}
            >
              <CardHeader>
                <CardTitle style={{ color: 'var(--destructive)' }}>Analisi Fallimenti</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 desktop:grid-cols-2">
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Anno Medio di Fallimento</p>
                    <p className="text-2xl font-bold font-mono">
                      Anno {Math.round(results.failureAnalysis.averageFailureYear)}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Anno Mediano di Fallimento</p>
                    <p className="text-2xl font-bold font-mono">
                      Anno {results.failureAnalysis.medianFailureYear}
                    </p>
                  </div>
                </div>
                <p className="mt-4 text-sm text-muted-foreground">
                  In {results.failureCount} simulazioni (
                  {((results.failureCount / params.numberOfSimulations) * 100).toFixed(1)}%) il
                  patrimonio si è esaurito prima di raggiungere {params.retirementYears} anni.
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
              {/* Mobile: card view — one card per year */}
              <div className="desktop:hidden space-y-2">
                {results.percentiles
                  .filter((_, index) => index % 5 === 0)
                  .map((p) => (
                    <div key={p.year} className="rounded-lg border bg-muted/30 p-3">
                      <p className="font-semibold text-sm mb-2">Anno {p.year}</p>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">10° %ile</span>
                          <span>{formatCurrencyCompact(p.p10)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">25° %ile</span>
                          <span>{formatCurrencyCompact(p.p25)}</span>
                        </div>
                        <div className="flex justify-between font-bold">
                          <span className="text-muted-foreground">Mediana</span>
                          <span>{formatCurrencyCompact(p.p50)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">75° %ile</span>
                          <span>{formatCurrencyCompact(p.p75)}</span>
                        </div>
                        <div className="flex justify-between col-span-2">
                          <span className="text-muted-foreground">90° %ile</span>
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

      {/* ========== 6. Scenario Mode Results ========== */}
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

      {/* ========== Empty State ========== */}
      {((!scenarioMode && !results) || (scenarioMode && !scenarioResults)) && !isRunning && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Dices className="h-16 w-16 text-muted-foreground mb-4" />
            <p className="text-muted-foreground text-center">
              Configura i parametri sopra e clicca su &quot;Esegui Simulazione&quot; per
              vedere i risultati
            </p>
          </CardContent>
        </Card>
      )}

      {/* ========== 7. Appendice — Come funziona (Collapsible, default closed) ========== */}
      <Collapsible>
        <CollapsibleTrigger asChild>
          <div className="group flex cursor-pointer select-none items-center justify-between border-t border-border pt-4 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
            <span>Come funziona</span>
            <ChevronDown className="h-4 w-4 transition-transform duration-200 motion-reduce:transition-none group-data-[state=open]:rotate-180" />
          </div>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="pt-4 space-y-4 text-sm text-muted-foreground">
            <div>
              <p className="font-semibold text-foreground mb-1">Come Funziona la Simulazione</p>
              <ul className="list-disc list-inside space-y-1 ml-1">
                <li>Vengono eseguite migliaia di simulazioni con rendimenti casuali</li>
                <li>Ogni simulazione parte dal patrimonio iniziale e preleva annualmente</li>
                <li>I rendimenti sono generati seguendo una distribuzione normale</li>
                <li>
                  La <strong className="text-foreground">probabilità di successo</strong> indica
                  in quante simulazioni il patrimonio dura almeno N anni
                </li>
              </ul>
            </div>
            <div>
              <p className="font-semibold text-foreground mb-1">Parametri di Mercato</p>
              <ul className="list-disc list-inside space-y-1 ml-1">
                <li>
                  <strong className="text-foreground">4 Asset Class:</strong> Equity, Bonds,
                  Immobili e Materie Prime con rendimenti e volatilità personalizzabili
                </li>
                <li>
                  <strong className="text-foreground">Scenari:</strong> Confronta scenari
                  Orso/Base/Toro con parametri diversi per ogni asset class
                </li>
              </ul>
            </div>
            <div>
              <p className="font-semibold text-foreground mb-1">Interpretazione dei Risultati</p>
              <ul className="list-disc list-inside space-y-1 ml-1">
                <li>
                  <strong className="text-foreground">≥95%:</strong> Piano molto sicuro (Eccellente)
                </li>
                <li>
                  <strong className="text-foreground">80–94%:</strong> Rischio moderato (Buono)
                </li>
                <li>
                  <strong className="text-foreground">&lt;80%:</strong> Considera di aumentare il
                  patrimonio o ridurre i prelievi
                </li>
              </ul>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
