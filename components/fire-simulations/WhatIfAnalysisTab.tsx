'use client';

/**
 * FIRE › WHAT IF — a verdict over tiles (2026-08-25)
 *
 * The tab answers «cosa cambia se…?» before it shows a number: a rule-generated verdict
 * (`buildWhatIfVerdict` in lib/utils/whatIfNarrative.ts) takes its headline and its tone from the
 * delta in years («Il FIRE slitta di 1 anno.») and names, with their bounds, what the event does
 * to the capital, the FIRE number, the year, the passive income and the Coast plan, over a
 * 12-column grid of tiles that each answer one question with a reading line above their figures.
 *
 *   Desktop (12 col): Prima e dopo(5) | Delta(3) | Evento(4)
 *                     Sensibilità(12)
 *   Mobile (1 col):   Evento → Prima e dopo → Delta → Sensibilità
 *
 * On a phone the Evento comes first: on this tab the event IS the question, the verdict is about
 * what is typed there. The page has NO period axis — an event is applied today (year 0) — and the
 * one control that moves the verdict, the event form, is a tile of the grid, not a disclosure.
 * The Sensibilità matrix runs on the plan of TODAY, off the event, and says so in its aside.
 *
 * Data flow:
 * 1. settings + assets + annual cashflow queries (shared React Query keys with the other FIRE
 *    tabs, so the cache is reused — no extra fetching), keyed by `ownerId`;
 * 2. a `WhatIfBaseline` assembled with useMemo — the pension bridge included, so the «prima» side
 *    agrees with the Calcolatore's year when the lock is on;
 * 3. the active event + its inputs build a `WhatIfScenario`; `calculateWhatIfImpact` re-runs the
 *    pure FIRE/Coast functions on baseline vs adjusted and diffs them.
 *
 * This file is the ORCHESTRATOR and computes nothing: the numbers come from
 * lib/utils/whatIfSummary.ts over the impact the service returns, the words from
 * lib/utils/whatIfNarrative.ts. The income-source selection and its sum stay here (UI-only): the
 * pure layer is category-agnostic. Scenario inputs are ephemeral local state — exploration, not
 * persisted settings.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useActiveAccount } from '@/contexts/ActiveAccountContext';
import { calculateAssetValue, calculateFIRENetWorth, calculateIlliquidFIRENetWorth, calculateLiquidFIRENetWorth, getAllAssets } from '@/lib/services/assetService';
import { resolvePensionLockState, resolveRitaUnlockAge } from '@/lib/utils/pensionUnlock';
import { getSettings } from '@/lib/services/assetAllocationService';
import {
  calculateFIRESensitivityMatrix,
  getAnnualCashflowData,
  getDefaultScenarios,
  normalizeCoastFirePensions,
  normalizeCoastFireTaxBrackets,
  type IncomeSourceCategory,
  type PensionCapitalInflowToday,
} from '@/lib/services/fireService';
import { calculateWhatIfImpact, WHAT_IF_HORIZON_YEARS } from '@/lib/services/whatIfService';
import { getItalyYear } from '@/lib/utils/dateHelpers';
import { summarizeLock } from '@/lib/utils/fireSummary';
import {
  buildWhatIfComparisonSeries,
  decomposeJobLossHit,
  summarizeDivergence,
  summarizeSensitivity,
  summarizeWhatIf,
  summarizeWhatIfEvent,
} from '@/lib/utils/whatIfSummary';
import {
  buildDeltaRows,
  buildWhatIfVerdict,
  describeBeforeAfter,
  describeBeforeAfterAside,
  describeBeforeAfterFooter,
  describeDelta,
  describeDeltaFooter,
  describeEvent,
  describeEventFooter,
  describeSensitivity,
  SENSITIVITY_ASIDE,
  SENSITIVITY_FOOTER,
} from '@/lib/utils/whatIfNarrative';
import type { WhatIfBaseline, WhatIfEventType, WhatIfScenario } from '@/types/whatIf';
import type { Settings } from '@/types/settings';
import type { TileSkeletonCell } from '@/lib/utils/tileGridSkeleton';
import { cn } from '@/lib/utils';
import { PageVerdict } from '@/components/ui/page-verdict';
import { TILE_CELL_CLASS } from '@/components/ui/tile';
import { TileGridSkeleton } from '@/components/ui/tile-grid-skeleton';
import { ErrorNotice } from '@/components/ui/error-notice';
import { describeReadFailure, resolveSurfaceState } from '@/lib/utils/statesNarrative';
import { categoryLeafKeys, collectLeafKeys, sumSelectedIncome } from '@/components/fire-simulations/whatif/incomeSelection';
import { WhatIfProjectionChart } from '@/components/fire-simulations/whatif/WhatIfProjectionChart';
import { PrimaDopoTile } from '@/components/fire-simulations/whatif/tiles/PrimaDopoTile';
import { DeltaTile } from '@/components/fire-simulations/whatif/tiles/DeltaTile';
import { EventoTile, type WhatIfEventForm } from '@/components/fire-simulations/whatif/tiles/EventoTile';
import { SensibilitaTile } from '@/components/fire-simulations/whatif/tiles/SensibilitaTile';

/** The grid's geometry, for the skeleton: the same spans as the tiles below. */
const SKELETON_CELLS: TileSkeletonCell[] = [
  { span: 5, lines: 12 },
  { span: 3, lines: 9 },
  { span: 4, lines: 10 },
  { span: 12, lines: 6 },
];

const EMPTY_FORM: WhatIfEventForm = {
  monthsWithoutIncome: '6',
  purchaseAmount: '',
  isPrimaryResidence: false,
  savingsDelta: '',
  expensesDelta: '',
  windfallAmount: '',
};

function parseAmount(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function WhatIfAnalysisTab() {
  const { user } = useAuth();
  const { ownerId } = useActiveAccount();

  // ─── Queries ─────────────────────────────────────────────────────────────────
  const { data: settings, isLoading: isLoadingSettings, isError: settingsError } = useQuery<Settings | null>({
    queryKey: ['settings', ownerId],
    queryFn: () => getSettings(ownerId!),
    enabled: !!user && !!ownerId,
    staleTime: 300000,
  });

  const { data: assets, isLoading: isLoadingAssets, isError: assetsError } = useQuery({
    queryKey: ['assets', ownerId],
    queryFn: () => getAllAssets(ownerId!),
    enabled: !!user && !!ownerId,
    staleTime: 300000,
  });

  const { data: cashflowData, isLoading: isLoadingCashflow, isError: cashflowError } = useQuery({
    queryKey: ['annualCashflowData', ownerId],
    queryFn: () => getAnnualCashflowData(ownerId!),
    enabled: !!user && !!ownerId,
    staleTime: 300000,
  });

  // ─── Scenario state (ephemeral) ──────────────────────────────────────────────
  const [eventType, setEventType] = useState<WhatIfEventType>('jobLoss');
  const [form, setForm] = useState<WhatIfEventForm>(EMPTY_FORM);
  const onFormChange = useCallback((patch: Partial<WhatIfEventForm>) => setForm((prev) => ({ ...prev, ...patch })), []);
  // Selected income-source leaves (`categoryId::subCategoryId`) that disappear on job loss.
  const [selectedIncomeLeaves, setSelectedIncomeLeaves] = useState<Set<string>>(new Set());
  const didInitIncomeSelection = useRef(false);
  // The Sensibilità reference expenses — a local override, empty = the actual expenses.
  const [sensitivityBaselineInput, setSensitivityBaselineInput] = useState('');

  // ─── Baseline assembly ───────────────────────────────────────────────────────
  const includePrimaryResidence = settings?.includePrimaryResidenceInFIRE ?? false;

  // The FIRE lock-in toggle governs the whole page — the What If baseline inherits it. Locked
  // pension capital leaves the perturbable net worth and re-enters BOTH walks: the FIRE one as
  // the Calcolatore's bridge (compartment merged at the unlock year, bridge FIRE number until
  // then) and the Coast one as a capital inflow at its unlock year.
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
  const pensionInflowsToday = useMemo<PensionCapitalInflowToday[]>(
    () => (pensionLockState?.inflows ?? []).map((inflow) => ({ yearsFromNow: inflow.yearsFromNow, amountToday: inflow.amount })),
    [pensionLockState],
  );
  // Multi-fund unlocks aggregate on the LATEST year, as the Calcolatore does (AGENTS → FIRE).
  const pensionUnlockYears = pensionLockState && pensionLockState.inflows.length > 0 ? Math.max(...pensionLockState.inflows.map((inflow) => inflow.yearsFromNow)) : 0;
  const pensionBridge = useMemo(
    () => (pensionLockedValue > 0 && pensionUnlockYears > 0 ? { valueToday: pensionLockedValue, yearsToUnlock: pensionUnlockYears } : null),
    [pensionLockedValue, pensionUnlockYears],
  );

  const netWorth = assets ? calculateFIRENetWorth(assets, includePrimaryResidence) - pensionLockedValue : 0;
  const liquidNetWorth = assets ? calculateLiquidFIRENetWorth(assets, includePrimaryResidence) : 0;
  const illiquidNetWorth = assets ? Math.max(0, calculateIlliquidFIRENetWorth(assets, includePrimaryResidence) - pensionLockedValue) : 0;
  const withdrawalRate = settings?.withdrawalRate ?? 4;
  const annualExpenses = cashflowData?.annualExpensesFromCashflow ?? 0;
  const annualSavings = cashflowData?.annualSavings ?? 0;
  const scenarios = useMemo(() => settings?.fireProjectionScenarios ?? getDefaultScenarios(), [settings?.fireProjectionScenarios]);

  // ─── Income sources for the job-loss picker (UI-only) ────────────────────────
  const incomeSources = useMemo(() => cashflowData?.incomeSources ?? [], [cashflowData]);
  const hasIncomeSources = incomeSources.length > 0;
  const laborIncomeCategoryIds = settings?.laborIncomeCategoryIds;

  // Default selection: the categories flagged as labor income in Settings; if none match the
  // available sources, fall back to every source (the original "all household income" behaviour).
  const defaultIncomeLeaves = useMemo(() => {
    const laborSet = new Set(laborIncomeCategoryIds ?? []);
    const laborLeaves = incomeSources.filter((category) => laborSet.has(category.categoryId)).flatMap(categoryLeafKeys);
    return new Set(laborLeaves.length > 0 ? laborLeaves : collectLeafKeys(incomeSources));
  }, [incomeSources, laborIncomeCategoryIds]);

  // Seed the selection once, after the data has loaded, without clobbering later user edits.
  // Deferred so the effect body itself sets no state (react-hooks/set-state-in-effect).
  useEffect(() => {
    if (didInitIncomeSelection.current || isLoadingSettings || isLoadingCashflow) return;
    const timer = setTimeout(() => {
      didInitIncomeSelection.current = true;
      setSelectedIncomeLeaves(defaultIncomeLeaves);
    }, 0);
    return () => clearTimeout(timer);
  }, [isLoadingSettings, isLoadingCashflow, defaultIncomeLeaves]);

  const selectedAnnualIncome = useMemo(() => sumSelectedIncome(incomeSources, selectedIncomeLeaves), [incomeSources, selectedIncomeLeaves]);

  const toggleIncomeLeaf = useCallback((key: string) => {
    setSelectedIncomeLeaves((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);
  const toggleIncomeCategory = useCallback((category: IncomeSourceCategory) => {
    const keys = categoryLeafKeys(category);
    setSelectedIncomeLeaves((prev) => {
      const next = new Set(prev);
      const allSelected = keys.every((key) => next.has(key));
      // All selected → clear the category; otherwise select it fully.
      keys.forEach((key) => (allSelected ? next.delete(key) : next.add(key)));
      return next;
    });
  }, []);
  const selectAllIncome = useCallback(() => setSelectedIncomeLeaves(new Set(collectLeafKeys(incomeSources))), [incomeSources]);
  const selectNoIncome = useCallback(() => setSelectedIncomeLeaves(new Set()), []);

  // ─── The baseline and the scenario ───────────────────────────────────────────
  const currentAge = settings?.userAge ?? null;
  const retirementAge = settings?.coastFireRetirementAge ?? 60;
  const coastCustomExpenses = settings?.coastFireCustomExpenses;

  const baseline = useMemo<WhatIfBaseline>(() => {
    const coastExpenses = coastCustomExpenses && coastCustomExpenses > 0 ? coastCustomExpenses : annualExpenses;
    return {
      netWorth,
      liquidNetWorth,
      illiquidNetWorth,
      annualExpenses,
      annualSavings,
      withdrawalRate,
      scenarios,
      pensionBridge,
      coast:
        currentAge !== null
          ? {
              currentAge,
              retirementAge,
              annualExpenses: coastExpenses,
              realReturnRate: scenarios.base.growthRate - scenarios.base.inflationRate,
              inflationRate: scenarios.base.inflationRate,
              pensions: normalizeCoastFirePensions(settings?.coastFirePensions),
              taxBrackets: normalizeCoastFireTaxBrackets(settings?.coastFireTaxBrackets),
              capitalInflowsToday: pensionInflowsToday,
            }
          : null,
    };
    // settings sub-fields are captured explicitly; the whole settings object is stable per query.
  }, [
    netWorth,
    liquidNetWorth,
    illiquidNetWorth,
    annualExpenses,
    annualSavings,
    withdrawalRate,
    scenarios,
    pensionBridge,
    currentAge,
    retirementAge,
    coastCustomExpenses,
    pensionInflowsToday,
    settings?.coastFirePensions,
    settings?.coastFireTaxBrackets,
  ]);

  const scenario = useMemo<WhatIfScenario>(() => {
    switch (eventType) {
      case 'jobLoss':
        return {
          eventType,
          monthsWithoutIncome: parseAmount(form.monthsWithoutIncome),
          // Only constrain the lost income when we actually have categorised sources to select.
          lostAnnualIncome: hasIncomeSources ? selectedAnnualIncome : undefined,
        };
      case 'majorPurchase':
        return { eventType, lumpSumAmount: parseAmount(form.purchaseAmount), isPrimaryResidence: form.isPrimaryResidence };
      case 'cashflowChange':
        return { eventType, annualSavingsDelta: parseAmount(form.savingsDelta), annualExpensesDelta: parseAmount(form.expensesDelta) };
      case 'windfall':
        return { eventType, lumpSumAmount: parseAmount(form.windfallAmount) };
    }
  }, [eventType, form, hasIncomeSources, selectedAnnualIncome]);

  const hasBaseline = netWorth > 0 && annualExpenses > 0 && withdrawalRate > 0;

  // ─── The numbers (pure layer over the service) ───────────────────────────────
  const currentYear = getItalyYear();
  const impact = useMemo(() => (hasBaseline ? calculateWhatIfImpact(baseline, scenario) : null), [hasBaseline, baseline, scenario]);
  const event = useMemo(() => (impact ? summarizeWhatIfEvent(scenario, baseline, impact.adjusted) : null), [impact, scenario, baseline]);
  const summary = useMemo(() => (impact ? summarizeWhatIf(impact, baseline, currentYear, WHAT_IF_HORIZON_YEARS) : null), [impact, baseline, currentYear]);
  const series = useMemo(() => (impact ? buildWhatIfComparisonSeries(impact.projections.before, impact.projections.after) : []), [impact]);
  const divergence = useMemo(() => (summary ? summarizeDivergence(series, summary.timeline) : null), [series, summary]);
  const jobLossHit = useMemo(
    () => (event && event.kind === 'jobLoss' && !event.isEmpty ? decomposeJobLossHit({ annualSavings, annualExpenses, lostAnnualIncome: event.lostAnnualIncome, months: event.months }) : null),
    [event, annualSavings, annualExpenses],
  );

  const ritaUnlockAge = resolveRitaUnlockAge({ pensionInpsRetirementAge: settings?.pensionInpsRetirementAge, pensionRitaLongUnemployment: settings?.pensionRitaLongUnemployment });
  const lock = useMemo(() => summarizeLock(pensionLockState, { currentYear, ritaUnlockAge }), [pensionLockState, currentYear, ritaUnlockAge]);

  // The Sensibilità runs on the plan of TODAY (the baseline), centred on the actual or the
  // typed reference expenses — never on the event.
  const parsedSensitivityBaseline = Number.parseFloat(sensitivityBaselineInput);
  const sensitivityExpenses = Number.isFinite(parsedSensitivityBaseline) && parsedSensitivityBaseline > 0 ? parsedSensitivityBaseline : annualExpenses;
  const sensitivityMatrix = useMemo(() => {
    if (netWorth <= 0 || sensitivityExpenses <= 0 || withdrawalRate <= 0) return null;
    return calculateFIRESensitivityMatrix(netWorth, sensitivityExpenses, annualSavings, withdrawalRate, scenarios);
  }, [netWorth, sensitivityExpenses, annualSavings, withdrawalRate, scenarios]);
  const sensitivityReading = useMemo(() => (sensitivityMatrix ? summarizeSensitivity(sensitivityMatrix) : null), [sensitivityMatrix]);

  // ─── The words (pure layer) ───────────────────────────────────────────────────
  const verdict = useMemo(() => buildWhatIfVerdict({ hasBaseline, event, summary }), [hasBaseline, event, summary]);

  // ─── Loading ─────────────────────────────────────────────────────────────────
  // A failed read comes BEFORE the wait: these queries default to undefined, and a plan built
  // on a base that was never read is a number with nothing behind it.
  if (resolveSurfaceState({ loading: isLoadingSettings || isLoadingAssets || isLoadingCashflow, failed: settingsError || assetsError || cashflowError }) === 'failed') {
    return (
      <ErrorNotice
        className="max-w-[920px]"
        notice={describeReadFailure({
          consequence: 'Patrimonio, ipotesi e cashflow non sono stati letti: senza la base non c’è uno scenario da confrontare.',
          untouched: 'Le ipotesi salvate non sono state toccate.',
        })}
      />
    );
  }

  if (isLoadingSettings || isLoadingAssets || isLoadingCashflow) {
    return <TileGridSkeleton cells={SKELETON_CELLS} />;
  }

  // ─── Empty state: the verdict says what is missing ───────────────────────────
  if (!hasBaseline || !impact || !event || !summary) {
    return (
      <div className="space-y-4">
        <div className="pt-1">
          <PageVerdict verdict={verdict} ariaLabel="Verdetto sul What If" />
        </div>
      </div>
    );
  }

  const targetsDiffer = Math.abs(summary.fireNumber.delta) >= 0.5;
  const lastProjectedYear = series.length > 0 ? series[series.length - 1].calendarYear : null;
  const eventFooterInput = { kind: eventType, referenceYear: cashflowData?.referenceYear ?? null, isAnnualized: cashflowData?.isAnnualized ?? false };

  // ─── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      <div className="pt-1">
        <PageVerdict verdict={verdict} ariaLabel="Verdetto sul What If" />
      </div>

      {/* Tablet (768-1439): every tile full width, in the phone's order. */}
      <div className="grid grid-cols-1 gap-3 tablet:grid-cols-2 desktop:grid-cols-12">
        <div className={cn(TILE_CELL_CLASS, 'order-2 tablet:col-span-2 desktop:order-none desktop:col-span-5')}>
          <PrimaDopoTile
            reading={describeBeforeAfter(summary, divergence)}
            aside={describeBeforeAfterAside(scenarios.base)}
            chart={
              <WhatIfProjectionChart
                series={series}
                calendarBefore={summary.timeline.reachedBefore ? null : summary.timeline.calendarBefore}
                calendarAfter={summary.timeline.reachedAfter ? null : summary.timeline.calendarAfter}
                targetsDiffer={targetsDiffer}
                height="100%"
                pensionUnlockCalendarYear={summary.isBridge ? lock.unlockCalendarYear : null}
              />
            }
            targetsDiffer={targetsDiffer}
            footer={describeBeforeAfterFooter({ isBridge: summary.isBridge, unlockCalendarYear: lock.unlockCalendarYear, lastProjectedYear })}
          />
        </div>

        <div className={cn(TILE_CELL_CLASS, 'order-3 tablet:col-span-2 desktop:order-none desktop:col-span-3')}>
          <DeltaTile reading={describeDelta(summary)} rows={buildDeltaRows(summary)} coastRetirementAge={summary.coast?.retirementAge ?? null} footer={describeDeltaFooter(summary.coast !== null)} />
        </div>

        <div className={cn(TILE_CELL_CLASS, 'order-1 tablet:col-span-2 desktop:order-none desktop:col-span-4')}>
          <EventoTile
            reading={describeEvent(event)}
            event={event}
            eventType={eventType}
            onEventTypeChange={setEventType}
            form={form}
            onFormChange={onFormChange}
            incomeSelection={
              hasIncomeSources
                ? {
                    sources: incomeSources,
                    selected: selectedIncomeLeaves,
                    onToggleLeaf: toggleIncomeLeaf,
                    onToggleCategory: toggleIncomeCategory,
                    onSelectAll: selectAllIncome,
                    onSelectNone: selectNoIncome,
                  }
                : null
            }
            jobLossHit={jobLossHit}
            annualSavings={annualSavings}
            annualExpenses={annualExpenses}
            footer={describeEventFooter(eventFooterInput)}
          />
        </div>

        <div className={cn(TILE_CELL_CLASS, 'order-4 tablet:col-span-2 desktop:order-none desktop:col-span-12')}>
          <SensibilitaTile
            reading={sensitivityReading ? describeSensitivity(sensitivityReading, WHAT_IF_HORIZON_YEARS) : [{ text: 'Servono un patrimonio FIRE e spese annue maggiori di zero.' }]}
            aside={SENSITIVITY_ASIDE}
            baselineInput={sensitivityBaselineInput}
            onBaselineInputChange={setSensitivityBaselineInput}
            actualAnnualExpenses={annualExpenses}
            matrix={sensitivityMatrix}
            footer={SENSITIVITY_FOOTER}
          />
        </div>
      </div>
    </div>
  );
}
