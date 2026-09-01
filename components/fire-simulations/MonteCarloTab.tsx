'use client';

/**
 * FIRE › MONTE CARLO — a verdict over tiles (2026-08-26)
 *
 * The tab answers «quanto è probabile?» before it shows a number: a rule-generated verdict
 * (`buildMonteCarloVerdict` in lib/utils/monteCarloNarrative.ts) reads the base scenario's run —
 * the share of simulations in which the capital holds to the horizon, the median final value,
 * the year the worst tenth runs out, the bear and bull probabilities, the pension bridge — over a
 * 12-column grid of tiles that each answer one question with a reading line above their figures.
 *
 *   Desktop (12 col): Probabilità(5) | Distribuzione(4) | Scenari a confronto(3)
 *                     Parametri(12)
 *   Mobile (1 col):   Probabilità → Distribuzione → Scenari → Parametri
 *
 * ONE run = the three scenarios (Orso · Base · Toro) with the plan's shared inputs; the verdict,
 * Probabilità and Distribuzione read Base, the Scenari tile reads all three. The old
 * «Simulazione singola | Confronto scenari» toggle is gone with the mode it switched: the single
 * form's market parameters ARE the Base scenario's. The run is automatic once the auto-filled
 * plan settles (the Ventaglio's precedent) and explicit afterwards: while the typed inputs differ
 * from the ones the shown results were run with, the Parametri footer says so and the figures
 * stay the last run's — never a silent re-run on every keystroke of a 30.000-path simulation.
 *
 * The page has NO period axis — a plan is simulated today — and its one input, the plan, is a
 * tile of the grid (The Input Tile Rule) in the desktop's last position: the plan is auto-filled
 * from the portfolio, so the page is answered before anything is typed.
 *
 * This file is the ORCHESTRATOR and computes nothing: the numbers come from
 * lib/utils/monteCarloSummary.ts over the results the service returns, the words from
 * lib/utils/monteCarloNarrative.ts. The form is ephemeral local state (strings, so a field can
 * hold «22.» while typing); only the scenarios persist, in the settings document.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { useActiveAccount } from '@/contexts/ActiveAccountContext';
import { useDemoMode } from '@/lib/hooks/useDemoMode';
import { calculateAssetValue, calculateLiquidNetWorth, calculateTotalValue, getAllAssets } from '@/lib/services/assetService';
import { calculateCurrentAllocation, getDefaultTargets, getSettings, setSettings } from '@/lib/services/assetAllocationService';
import { buildParamsFromScenario, getDefaultMarketParameters, getDefaultMonteCarloScenarios, runMonteCarloSimulation } from '@/lib/services/monteCarloService';
import { resolvePensionLockState, resolveRitaUnlockAge } from '@/lib/utils/pensionUnlock';
import { DEFAULT_MONTE_CARLO_SIMULATIONS, deriveMonteCarloAllocation } from '@/lib/utils/monteCarloParams';
import { getItalyYear } from '@/lib/utils/dateHelpers';
import { summarizeLock } from '@/lib/utils/fireSummary';
import {
  buildOverlaySeries,
  buildPercentileRows,
  formatInputAmount,
  haveRunInputsChanged,
  parseItalianNumber,
  summarizeMonteCarloPlan,
  summarizeMonteCarloRun,
  summarizeScenarios,
  type MonteCarloRunInputs,
  type ScenarioResults,
} from '@/lib/utils/monteCarloSummary';
import {
  buildMonteCarloVerdict,
  describeDistribuzione,
  describeDistribuzioneAside,
  describeDistribuzioneFooter,
  describeParametri,
  describeParametriFooter,
  describePercentili,
  describeProbabilita,
  describeProbabilitaAside,
  describeProbabilitaFooter,
  describeScenari,
  describeScenarioNote,
  describeTraiettorie,
  DETTAGLIO_DESCRIPTION,
  PARAMETRI_ASIDE,
  SCENARI_ASIDE,
  SCENARI_FOOTER,
  scenarioLabel,
} from '@/lib/utils/monteCarloNarrative';
import type { MonteCarloCapitalInflow, MonteCarloParams, MonteCarloScenarios } from '@/types/assets';
import type { TileSkeletonCell } from '@/lib/utils/tileGridSkeleton';
import { cn } from '@/lib/utils';
import { PageVerdict } from '@/components/ui/page-verdict';
import { TILE_CELL_CLASS } from '@/components/ui/tile';
import { TileGridSkeleton } from '@/components/ui/tile-grid-skeleton';
import { ErrorNotice } from '@/components/ui/error-notice';
import { describeReadFailure, resolveSurfaceState } from '@/lib/utils/statesNarrative';
import { MonteCarloFanChart } from '@/components/monte-carlo/MonteCarloFanChart';
import { MonteCarloDettaglio } from '@/components/monte-carlo/MonteCarloDettaglio';
import { ProbabilitaTile } from '@/components/monte-carlo/tiles/ProbabilitaTile';
import { DistribuzioneTile } from '@/components/monte-carlo/tiles/DistribuzioneTile';
import { ScenariConfrontoTile } from '@/components/monte-carlo/tiles/ScenariConfrontoTile';
import { ParametriTile, type MonteCarloForm } from '@/components/monte-carlo/tiles/ParametriTile';

/** The grid's geometry, for the skeleton: the same spans as the tiles below. */
const SKELETON_CELLS: TileSkeletonCell[] = [
  { span: 5, lines: 14 },
  { span: 4, lines: 10 },
  { span: 3, lines: 9 },
  { span: 12, lines: 10 },
];

const DEFAULT_RETIREMENT_YEARS = 30;
const DEFAULT_SIMULATIONS = DEFAULT_MONTE_CARLO_SIMULATIONS;
const DEFAULT_WITHDRAWAL = 30000;

/** A run keeps the inputs it was made with, so the page can tell a stale form from a fresh one. */
interface MonteCarloRunState {
  results: ScenarioResults;
  inputs: MonteCarloRunInputs;
}

function parseIntField(value: string, fallback: number): number {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseFloatField(value: string): number {
  const parsed = Number.parseFloat(value.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : 0;
}

export function MonteCarloTab() {
  const { user } = useAuth();
  const { ownerId } = useActiveAccount();
  const queryClient = useQueryClient();
  const isDemo = useDemoMode();

  // ─── Queries (shared keys with the other FIRE tabs) ──────────────────────────
  const { data: assets, isLoading: isLoadingAssets, isError: assetsError } = useQuery({
    queryKey: ['assets', ownerId],
    queryFn: () => getAllAssets(ownerId!),
    enabled: !!user && !!ownerId,
    staleTime: 300000,
  });

  const { data: settings, isLoading: isLoadingSettings, isError: settingsError } = useQuery({
    queryKey: ['settings', ownerId],
    queryFn: () => getSettings(ownerId!),
    enabled: !!user && !!ownerId,
    staleTime: 300000,
  });

  // ─── The pension lock (governs the whole FIRE page) ──────────────────────────
  // With the lock on, the locked funds leave the starting portfolio and re-enter the simulation
  // as capital inflows at their unlock year, at TODAY's value (AGENTS → FIRE, What If and Goals).
  const respectPensionLockIn = settings?.respectPensionLockInFire ?? false;
  const pensionLockState = useMemo(() => {
    if (!respectPensionLockIn || !assets) return null;
    return resolvePensionLockState(
      assets,
      {
        userAge: settings?.userAge,
        pensionInpsRetirementAge: settings?.pensionInpsRetirementAge,
        pensionRitaLongUnemployment: settings?.pensionRitaLongUnemployment,
      },
      new Date(),
      calculateAssetValue,
    );
  }, [respectPensionLockIn, assets, settings?.userAge, settings?.pensionInpsRetirementAge, settings?.pensionRitaLongUnemployment]);
  const pensionLockedValue = pensionLockState?.totalLockedToday ?? 0;
  const pensionInflows = useMemo<MonteCarloCapitalInflow[]>(
    () => (pensionLockState?.inflows ?? []).map((inflow) => ({ year: inflow.yearsFromNow, amount: inflow.amount })),
    [pensionLockState],
  );

  const grossTotalNetWorth = assets ? calculateTotalValue(assets) : 0;
  const liquidNetWorth = assets ? calculateLiquidNetWorth(assets) : 0;
  const totalNetWorth = Math.max(0, grossTotalNetWorth - pensionLockedValue);

  const currentYear = getItalyYear();
  const currentAge = settings?.userAge ?? null;
  const ctx = useMemo(() => ({ startCalendarYear: currentYear, currentAge }), [currentYear, currentAge]);
  const ritaUnlockAge = resolveRitaUnlockAge({ pensionInpsRetirementAge: settings?.pensionInpsRetirementAge, pensionRitaLongUnemployment: settings?.pensionRitaLongUnemployment });
  const lock = useMemo(() => summarizeLock(pensionLockState, { currentYear, ritaUnlockAge }), [pensionLockState, currentYear, ritaUnlockAge]);

  // ─── The form (ephemeral) and the scenarios (persisted) ─────────────────────
  const [form, setForm] = useState<MonteCarloForm | null>(null);
  const onFormChange = useCallback((patch: Partial<MonteCarloForm>) => setForm((prev) => (prev ? { ...prev, ...patch } : prev)), []);
  const [scenarios, setScenarios] = useState<MonteCarloScenarios>(getDefaultMonteCarloScenarios());

  // Seed the form ONCE from the portfolio, after the data has loaded — the starting capital net of
  // the locked funds, the planned expenses, the allocation normalized onto the four MC classes
  // (`deriveMonteCarloAllocation`, shared with the Ventaglio: the two call sites must stay identical).
  // Deferred so the effect body itself sets no state (react-hooks/set-state-in-effect).
  const didSeedRef = useRef(false);
  useEffect(() => {
    if (didSeedRef.current || isLoadingAssets || isLoadingSettings || !assets) return;
    const timer = setTimeout(() => {
      didSeedRef.current = true;
      const allocation = deriveMonteCarloAllocation(calculateCurrentAllocation(assets).byAssetClass) ?? {
        equityPercentage: 60,
        bondsPercentage: 40,
        realEstatePercentage: 0,
        commoditiesPercentage: 0,
      };
      setForm({
        initialPortfolio: formatInputAmount(totalNetWorth),
        retirementYears: String(DEFAULT_RETIREMENT_YEARS),
        annualWithdrawal: String(settings?.plannedAnnualExpenses || DEFAULT_WITHDRAWAL),
        numberOfSimulations: String(DEFAULT_SIMULATIONS),
        equityPercentage: String(allocation.equityPercentage),
        bondsPercentage: String(allocation.bondsPercentage),
        realEstatePercentage: String(allocation.realEstatePercentage),
        commoditiesPercentage: String(allocation.commoditiesPercentage),
      });
      if (settings?.monteCarloScenarios) setScenarios(settings.monteCarloScenarios);
    }, 0);
    return () => clearTimeout(timer);
  }, [isLoadingAssets, isLoadingSettings, assets, settings, totalNetWorth]);

  // ─── The params the run reads (numbers from the strings) ─────────────────────
  const params = useMemo<MonteCarloParams | null>(() => {
    if (!form) return null;
    const market = getDefaultMarketParameters();
    return {
      portfolioSource: 'total',
      initialPortfolio: Math.round(parseItalianNumber(form.initialPortfolio) ?? 0),
      retirementYears: parseIntField(form.retirementYears, DEFAULT_RETIREMENT_YEARS),
      equityPercentage: parseFloatField(form.equityPercentage),
      bondsPercentage: parseFloatField(form.bondsPercentage),
      realEstatePercentage: parseFloatField(form.realEstatePercentage),
      commoditiesPercentage: parseFloatField(form.commoditiesPercentage),
      annualWithdrawal: Math.round(parseFloatField(form.annualWithdrawal)),
      withdrawalAdjustment: 'inflation',
      // The market fields of the shared params are overridden per scenario by
      // `buildParamsFromScenario`; the defaults here are never what a run reads.
      ...market,
      numberOfSimulations: Math.min(50000, Math.max(1000, parseIntField(form.numberOfSimulations, DEFAULT_SIMULATIONS))),
      capitalInflows: pensionInflows.length > 0 ? pensionInflows : undefined,
    };
  }, [form, pensionInflows]);

  const allocationSum = params ? params.equityPercentage + params.bondsPercentage + params.realEstatePercentage + params.commoditiesPercentage : 0;
  const runnable = !!params && params.initialPortfolio > 0 && params.annualWithdrawal > 0;
  const canRun = runnable && Math.abs(allocationSum - 100) <= 0.01 && !!params && params.retirementYears >= 1 && params.retirementYears <= 60;

  const currentInputs = useMemo<MonteCarloRunInputs | null>(() => (params ? { params, scenarios, inflows: pensionInflows } : null), [params, scenarios, pensionInflows]);

  // ─── The run: the three scenarios in one go ──────────────────────────────────
  const [lastRun, setLastRun] = useState<MonteCarloRunState | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  const runScenarios = useCallback((inputs: MonteCarloRunInputs) => {
    setIsRunning(true);
    // Monte Carlo is CPU-bound and blocks the main thread: the delay lets the browser paint the
    // running state before the computation starts.
    window.setTimeout(() => {
      try {
        const results: ScenarioResults = {
          bear: runMonteCarloSimulation(buildParamsFromScenario(inputs.params, inputs.scenarios.bear)),
          base: runMonteCarloSimulation(buildParamsFromScenario(inputs.params, inputs.scenarios.base)),
          bull: runMonteCarloSimulation(buildParamsFromScenario(inputs.params, inputs.scenarios.bull)),
        };
        setLastRun({ results, inputs });
      } catch (error) {
        console.error('Error running the Monte Carlo scenarios:', error);
        toast.error('Errore durante la simulazione');
      } finally {
        setIsRunning(false);
      }
    }, 60);
  }, []);

  // Auto-run once, when the seeded plan can run — the page opens answered, like the Ventaglio.
  const didAutoRunRef = useRef(false);
  useEffect(() => {
    if (didAutoRunRef.current || !currentInputs || !canRun) return;
    didAutoRunRef.current = true;
    const timer = setTimeout(() => runScenarios(currentInputs), 0);
    return () => clearTimeout(timer);
  }, [currentInputs, canRun, runScenarios]);

  const handleRun = useCallback(() => {
    if (currentInputs && canRun) runScenarios(currentInputs);
  }, [currentInputs, canRun, runScenarios]);

  // ─── Scenario persistence ────────────────────────────────────────────────────
  const saveMutation = useMutation({
    mutationFn: () => {
      if (!user || !ownerId) throw new Error('User not authenticated');
      return setSettings(ownerId, { ...settings, targets: settings?.targets || getDefaultTargets(), monteCarloScenarios: scenarios });
    },
    onSuccess: () => {
      toast.success('Parametri degli scenari salvati');
      queryClient.invalidateQueries({ queryKey: ['settings', ownerId] });
    },
    onError: () => toast.error('Errore nel salvataggio dei parametri'),
  });

  // ─── The numbers (pure layer over the results) ───────────────────────────────
  const runParams = lastRun?.inputs.params ?? null;
  const run = useMemo(() => (lastRun && runParams ? summarizeMonteCarloRun(lastRun.results.base, runParams, ctx) : null), [lastRun, runParams, ctx]);
  const comparison = useMemo(() => (lastRun && runParams ? summarizeScenarios(lastRun.results, runParams, ctx) : null), [lastRun, runParams, ctx]);
  const overlay = useMemo(() => (lastRun ? buildOverlaySeries(lastRun.results, ctx.startCalendarYear) : []), [lastRun, ctx.startCalendarYear]);
  const percentileRows = useMemo(() => (lastRun ? buildPercentileRows(lastRun.results.base.percentiles, ctx.startCalendarYear) : []), [lastRun, ctx.startCalendarYear]);
  // The plan as typed (the Parametri reading) and the plan the shown results ran on (the Dettaglio).
  const typedPlan = useMemo(() => (params ? summarizeMonteCarloPlan(params, pensionInflows, pensionLockedValue, ctx) : null), [params, pensionInflows, pensionLockedValue, ctx]);
  const runPlan = useMemo(() => (runParams && lastRun ? summarizeMonteCarloPlan(runParams, lastRun.inputs.inflows, pensionLockedValue, ctx) : null), [runParams, lastRun, pensionLockedValue, ctx]);
  const stale = !!lastRun && !!currentInputs && haveRunInputsChanged(lastRun.inputs, currentInputs);

  // ─── The words (pure layer) ───────────────────────────────────────────────────
  const verdict = useMemo(() => buildMonteCarloVerdict({ runnable, run, scenarios: comparison, lock }), [runnable, run, comparison, lock]);

  // ─── Loading: until the seeded plan has run once ─────────────────────────────
  const awaitingFirstRun = runnable && canRun && !lastRun;
  // A failed read comes BEFORE the wait: these queries default to undefined, and a plan built
  // on a base that was never read is a number with nothing behind it.
  if (resolveSurfaceState({ loading: isLoadingAssets || isLoadingSettings, failed: assetsError || settingsError }) === 'failed') {
    return (
      <ErrorNotice
        className="max-w-[920px]"
        notice={describeReadFailure({
          consequence: 'Patrimonio e ipotesi non sono stati letti: la simulazione girerebbe su una base che non esiste.',
          untouched: 'Le ipotesi salvate non sono state toccate.',
        })}
      />
    );
  }

  if (isLoadingAssets || isLoadingSettings || !form || !params || !typedPlan || awaitingFirstRun) {
    return <TileGridSkeleton cells={SKELETON_CELLS} />;
  }

  const unlockOnPlot = lock.active && lock.lockedValue > 0 && lock.unlockCalendarYear !== null && run !== null && lock.unlockCalendarYear <= run.endCalendarYear ? lock.unlockCalendarYear : null;

  // ─── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      <div className="pt-1">
        <PageVerdict verdict={verdict} ariaLabel="Verdetto sul Monte Carlo" />
      </div>

      {/* Tablet (768-1439): every tile full width, in the phone's order. */}
      <div className="grid grid-cols-1 gap-3 tablet:grid-cols-2 desktop:grid-cols-12">
        {run && lastRun && (
          <div className={cn(TILE_CELL_CLASS, 'order-1 tablet:col-span-2 desktop:order-none desktop:col-span-5')}>
            <ProbabilitaTile
              reading={describeProbabilita(run)}
              aside={describeProbabilitaAside(run)}
              run={run}
              chart={
                <MonteCarloFanChart
                  percentiles={lastRun.results.base.percentiles}
                  startCalendarYear={ctx.startCalendarYear}
                  unlockCalendarYear={unlockOnPlot}
                  height="100%"
                  ariaLabel={`Ventaglio del piano di prelievo, scenario base: bande dei percentili 10–90 e 25–75 e mediana delle ${run.simulations.toLocaleString('it-IT')} simulazioni fino al ${run.endCalendarYear}; la linea tratteggiata in basso è il capitale esaurito.`}
                />
              }
              footer={describeProbabilitaFooter(run, lock)}
            />
          </div>
        )}

        {run && (
          <div className={cn(TILE_CELL_CLASS, 'order-2 tablet:col-span-2 desktop:order-none desktop:col-span-4')}>
            <DistribuzioneTile reading={describeDistribuzione(run)} aside={describeDistribuzioneAside(run)} run={run} footer={describeDistribuzioneFooter(run)} />
          </div>
        )}

        {comparison && (
          <div className={cn(TILE_CELL_CLASS, 'order-3 tablet:col-span-2 desktop:order-none desktop:col-span-3')}>
            <ScenariConfrontoTile
              reading={describeScenari(comparison)}
              aside={SCENARI_ASIDE}
              rows={comparison.rows.map((row) => ({ key: row.key, label: scenarioLabel(row.key), successRate: row.successRate, note: describeScenarioNote(row) }))}
              footer={SCENARI_FOOTER}
            />
          </div>
        )}

        <div className={cn(TILE_CELL_CLASS, 'order-4 tablet:col-span-2 desktop:order-none desktop:col-span-12')}>
          <ParametriTile
            reading={describeParametri(typedPlan)}
            aside={PARAMETRI_ASIDE}
            plan={typedPlan}
            form={form}
            onFormChange={onFormChange}
            allocationSum={allocationSum}
            totalNetWorth={totalNetWorth}
            liquidNetWorth={liquidNetWorth}
            scenarios={scenarios}
            onScenariosChange={setScenarios}
            onRun={handleRun}
            canRun={canRun}
            isRunning={isRunning}
            onSaveScenarios={() => saveMutation.mutate()}
            onResetScenarios={() => setScenarios(getDefaultMonteCarloScenarios())}
            isSavingScenarios={saveMutation.isPending}
            isDemo={isDemo}
            footer={
              lastRun
                ? describeParametriFooter({ stale, simulations: lastRun.inputs.params.numberOfSimulations })
                : [{ text: canRun ? 'Premi Esegui simulazione per lanciare i tre scenari.' : 'Completa il piano: patrimonio e prelievo maggiori di zero, allocazione al 100%, da 1 a 60 anni.' }]
            }
            stale={stale}
          />
        </div>
      </div>

      {lastRun && run && comparison && runPlan && (
        <MonteCarloDettaglio
          description={DETTAGLIO_DESCRIPTION}
          traiettorieReading={describeTraiettorie(comparison, runPlan)}
          overlay={overlay}
          percentiliReading={describePercentili(run)}
          percentileRows={percentileRows}
        />
      )}
    </div>
  );
}
