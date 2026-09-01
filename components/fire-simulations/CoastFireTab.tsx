'use client';

/**
 * FIRE › COAST FIRE — a verdict over tiles (2026-08-25)
 *
 * The tab answers «posso smettere di versare?» before it shows a number: a rule-generated
 * verdict (`buildCoastVerdict` in lib/utils/coastFireView.ts) names the gap to the Coast number
 * of today, what the free capital becomes at the target age against what is required, the state
 * pensions' share of the expenses and — with the bridge model on — the locked fund, over a
 * 12-column grid of tiles that each answer one question with a reading line above their figures.
 *
 *   Desktop (12 col): Traguardo(5, 2 rows) | Afflussi(7)
 *                                          | Scenari(7)
 *   Mobile (1 col):   Traguardo → Afflussi → Scenari
 *
 * Below the grid, two disclosures: «Ipotesi» (the form — ages, expenses, state pensions, IRPEF
 * brackets — config-first: open only while no age is saved, reopening on an unsaved edit or an
 * incomplete pension) and «Dettaglio» (coverage phases, target vs steady state, the pensions'
 * impact, how to read it).
 *
 * The page has NO period axis — a Coast plan is read today — and no control of its own: the
 * pension-lock switch is the Calcolatore's (Base di calcolo) and governs the WHOLE FIRE page.
 *
 * This file is the ORCHESTRATOR: the three queries, the projection, and the summaries the tiles
 * read. The form lives in `useCoastFireSettingsDraft`, the numbers and the words in
 * `lib/utils/coastFireView.ts`, the math in `fireService` — where it already was, unchanged.
 * The tab computes nothing: a figure that cannot be pointed at inside a `CoastFIREScenarioMetrics`
 * (or the lock state) does not belong here.
 *
 * The state-pension inputs are intentionally scoped to Coast FIRE only: they affect the
 * retirement-phase portfolio need, not the classic FIRE tab.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useActiveAccount } from '@/contexts/ActiveAccountContext';
import { useDemoMode } from '@/lib/hooks/useDemoMode';
import { useCoastFireSettingsDraft } from '@/lib/hooks/useCoastFireSettingsDraft';
import { calculateCoastFIREProjection, getAnnualExpenses, getDefaultScenarios, type PensionCapitalInflowToday } from '@/lib/services/fireService';
import { calculateAssetValue, calculateFIRENetWorth, calculateLiquidFIRENetWorth, getAllAssets } from '@/lib/services/assetService';
import { getSettings } from '@/lib/services/assetAllocationService';
import { resolvePensionLockState, resolveRitaUnlockAge } from '@/lib/utils/pensionUnlock';
import { summarizeLock } from '@/lib/utils/fireSummary';
import { getItalyYear } from '@/lib/utils/dateHelpers';
import {
  buildBaseScenarioInterpretation,
  buildCoastCoverageSteps,
  buildCoastInflowEvents,
  buildCoastVerdict,
  COAST_INFLOWS_FOOTER,
  COAST_SCENARIOS_FOOTER,
  describeCoastDettaglio,
  describeCoastInflows,
  describeCoastScenarios,
  describeCoastTarget,
  describeCoastTargetCaption,
  describeCoastTargetFooter,
  describeCoverage,
  describeIpotesi,
  describePensionImpact,
  describeTargetAndSteadyState,
  getPensionConfigurationState,
  resolveCoastBridgeYears,
  resolveCoastIncompleteReason,
  sortPensionBreakdown,
  summarizeCoastPensions,
  summarizeCoastScenarios,
  summarizeCoastTarget,
} from '@/lib/utils/coastFireView';
import type { Settings } from '@/types/settings';
import type { TileSkeletonCell } from '@/lib/utils/tileGridSkeleton';
import { cn } from '@/lib/utils';
import { PageVerdict } from '@/components/ui/page-verdict';
import { TILE_CELL_CLASS } from '@/components/ui/tile';
import { TileGridSkeleton } from '@/components/ui/tile-grid-skeleton';
import { ErrorNotice } from '@/components/ui/error-notice';
import { describeReadFailure, resolveSurfaceState } from '@/lib/utils/statesNarrative';
import { CoastTraguardoTile } from './coast/tiles/CoastTraguardoTile';
import { AfflussiTile } from './coast/tiles/AfflussiTile';
import { CoastScenariTile } from './coast/tiles/CoastScenariTile';
import { CoastIpotesi } from './coast/CoastIpotesi';
import { CoastDettaglio } from './coast/CoastDettaglio';
import { CoastFireProjectionChart } from './CoastFireProjectionChart';

/** The grid's geometry, for the skeleton: the same spans as the tiles below. */
const SKELETON_CELLS: TileSkeletonCell[] = [
  { span: 5, rows: 2, lines: 12 },
  { span: 7, lines: 5 },
  { span: 7, lines: 4 },
];

export function CoastFireTab() {
  const { user } = useAuth();
  const { ownerId } = useActiveAccount();
  const isDemo = useDemoMode();
  const [ipotesiOpen, setIpotesiOpen] = useState(false);

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

  const { data: annualExpenses, isLoading: isLoadingAnnualExpenses, isError: expensesError } = useQuery({
    queryKey: ['coastFireAnnualExpenses', ownerId],
    queryFn: () => getAnnualExpenses(ownerId!),
    enabled: !!user && !!ownerId,
    staleTime: 300000,
  });

  const draft = useCoastFireSettingsDraft({ settings, isLoadingSettings, userId: user?.uid, ownerId });

  const includePrimaryResidence = settings?.includePrimaryResidenceInFIRE ?? false;
  const liquidNetWorth = assets ? calculateLiquidFIRENetWorth(assets, includePrimaryResidence) : 0;
  const scenarios = settings?.fireProjectionScenarios ?? getDefaultScenarios();
  const withdrawalRate = settings?.withdrawalRate ?? 4.0;
  const currentAge = draft.currentAge;
  const retirementAge = draft.parsedRetirementAge;

  // ─── Pension lock (the Calcolatore's switch governs the whole page) ──────────
  // When on, locked pension funds leave the Coast starting capital and re-enter the walk as
  // capital inflows at their unlock year, at TODAY's value.
  const respectPensionLockIn = settings?.respectPensionLockInFire ?? false;
  const pensionLockState = useMemo(() => {
    if (!respectPensionLockIn || !assets) return null;
    return resolvePensionLockState(
      assets,
      {
        userAge: currentAge ?? settings?.userAge,
        pensionInpsRetirementAge: settings?.pensionInpsRetirementAge,
        pensionRitaLongUnemployment: settings?.pensionRitaLongUnemployment,
      },
      new Date(),
      calculateAssetValue,
    );
  }, [respectPensionLockIn, assets, currentAge, settings?.userAge, settings?.pensionInpsRetirementAge, settings?.pensionRitaLongUnemployment]);
  const pensionLockedValue = pensionLockState?.totalLockedToday ?? 0;
  const pensionInflowsToday = useMemo<PensionCapitalInflowToday[]>(
    () => (pensionLockState?.inflows ?? []).map((inflow) => ({ yearsFromNow: inflow.yearsFromNow, amountToday: inflow.amount })),
    [pensionLockState],
  );
  const currentNetWorth = assets ? calculateFIRENetWorth(assets, includePrimaryResidence) - pensionLockedValue : 0;

  // Custom expenses when the toggle is on and the value parses to a positive number; otherwise
  // the last complete year's actuals from the query.
  const effectiveAnnualExpenses = draft.usesCustomExpenses ? draft.parsedCustomExpenses : annualExpenses;

  // ─── The projection (fireService, unchanged) ─────────────────────────────────
  const { previewPensions, previewTaxBrackets } = draft;
  const coastProjection = useMemo(() => {
    if (currentAge === null || retirementAge === null || effectiveAnnualExpenses === undefined || effectiveAnnualExpenses <= 0 || withdrawalRate <= 0 || currentNetWorth <= 0) {
      return null;
    }
    return calculateCoastFIREProjection(
      currentNetWorth,
      effectiveAnnualExpenses,
      withdrawalRate,
      currentAge,
      retirementAge,
      scenarios,
      previewPensions,
      previewTaxBrackets,
      undefined, // currentDate: keep the function's own default
      pensionInflowsToday,
    );
  }, [effectiveAnnualExpenses, currentAge, currentNetWorth, pensionInflowsToday, previewPensions, previewTaxBrackets, retirementAge, scenarios, withdrawalRate]);

  // ─── The numbers (pure layer over the projection) ────────────────────────────
  const currentYear = getItalyYear();
  const baseScenario = coastProjection?.scenarios.base ?? null;
  const resolvedRetirementAge = coastProjection?.retirementAge ?? retirementAge ?? 0;
  const ritaUnlockAge = resolveRitaUnlockAge({ pensionInpsRetirementAge: settings?.pensionInpsRetirementAge, pensionRitaLongUnemployment: settings?.pensionRitaLongUnemployment });
  const lock = useMemo(() => summarizeLock(pensionLockState, { currentYear, ritaUnlockAge }), [pensionLockState, currentYear, ritaUnlockAge]);
  const isBridge = pensionInflowsToday.length > 0;

  const target = useMemo(
    () =>
      baseScenario && currentAge !== null
        ? summarizeCoastTarget(baseScenario, { currentNetWorth, liquidNetWorth, currentAge, retirementAge: resolvedRetirementAge, isBridge })
        : null,
    [baseScenario, currentNetWorth, liquidNetWorth, currentAge, resolvedRetirementAge, isBridge],
  );
  const pensions = useMemo(
    () => (baseScenario ? summarizeCoastPensions(baseScenario, currentYear) : { count: 0, entries: [], annualNetReal: 0, monthlyNetReal: 0, annualNetRealAtRetirement: 0 }),
    [baseScenario, currentYear],
  );
  const scenarioRows = useMemo(() => (coastProjection ? summarizeCoastScenarios(coastProjection.scenarios, currentNetWorth) : []), [coastProjection, currentNetWorth]);
  const bridgeYears = baseScenario ? resolveCoastBridgeYears(baseScenario, resolvedRetirementAge) : 0;
  const sortedPensionBreakdown = useMemo(() => (baseScenario ? sortPensionBreakdown(baseScenario.pensionBreakdown) : []), [baseScenario]);
  const inflowEvents = useMemo(
    () => buildCoastInflowEvents(sortedPensionBreakdown, pensionInflowsToday, currentYear, currentAge),
    [sortedPensionBreakdown, pensionInflowsToday, currentYear, currentAge],
  );
  const pensionConfigurationState = getPensionConfigurationState(previewPensions, draft.pensionIssues);
  const incompleteReason = resolveCoastIncompleteReason(currentNetWorth, effectiveAnnualExpenses, currentAge, retirementAge);

  // ─── The words (pure layer) ───────────────────────────────────────────────────
  const verdict = useMemo(() => buildCoastVerdict({ target, incompleteReason, pensions, lock }), [target, incompleteReason, pensions, lock]);
  const ipotesiDescription = describeIpotesi({
    currentAge,
    retirementAge,
    annualExpenses: effectiveAnnualExpenses,
    usesCustomExpenses: draft.usesCustomExpenses,
    withdrawalRate,
    baseRealReturn: baseScenario?.realReturnRate ?? null,
    respectPensionLockIn,
    pensionUnlockCalendarYear: lock.unlockCalendarYear,
    pensionCount: previewPensions.length,
  });

  // ─── Config-first disclosure ─────────────────────────────────────────────────
  // Decide the initial collapsed/expanded state ONCE, after the form has settled to match saved
  // settings (hasUnsavedChanges === false ⇒ temp state seeded). Collapsed when the user has already
  // configured their age (config-first for new users). The flag is set INSIDE the timer: under
  // StrictMode's double-invoke the first timer is cleared before it fires, and a flag set
  // synchronously would leave the panel closed for good.
  const hasSeededConfigRef = useRef(false);
  const hasUnsavedChanges = draft.hasUnsavedChanges;
  const savedUserAge = settings?.userAge;
  useEffect(() => {
    if (hasSeededConfigRef.current || isLoadingSettings || hasUnsavedChanges) return;
    if (savedUserAge != null) {
      hasSeededConfigRef.current = true;
      return;
    }
    const timer = setTimeout(() => {
      hasSeededConfigRef.current = true;
      setIpotesiOpen(true);
    }, 0);
    return () => clearTimeout(timer);
  }, [isLoadingSettings, hasUnsavedChanges, savedUserAge]);

  // After seeding, reopen on a genuine unsaved edit or an incomplete pension to fix.
  // Never auto-close: collapsing after save is disorienting if the user keeps editing.
  useEffect(() => {
    if (!hasSeededConfigRef.current) return;
    if (!hasUnsavedChanges && pensionConfigurationState !== 'incomplete') return;
    const timer = setTimeout(() => setIpotesiOpen(true), 0);
    return () => clearTimeout(timer);
  }, [hasUnsavedChanges, pensionConfigurationState]);

  // ─── Loading ─────────────────────────────────────────────────────────────────
  // A failed read comes BEFORE the wait: these queries default to undefined, and a plan built
  // on a base that was never read is a number with nothing behind it.
  if (resolveSurfaceState({ loading: isLoadingSettings || isLoadingAssets || isLoadingAnnualExpenses, failed: settingsError || assetsError || expensesError }) === 'failed') {
    return (
      <ErrorNotice
        className="max-w-[920px]"
        notice={describeReadFailure({
          consequence: 'Patrimonio, ipotesi e spese annue non sono stati letti: senza di essi non si sa se puoi smettere di versare.',
          untouched: 'Le ipotesi salvate non sono state toccate.',
        })}
      />
    );
  }

  if (isLoadingSettings || isLoadingAssets || isLoadingAnnualExpenses) {
    return <TileGridSkeleton cells={SKELETON_CELLS} />;
  }

  const ipotesi = (
    <CoastIpotesi
      open={ipotesiOpen}
      onOpenChange={setIpotesiOpen}
      description={ipotesiDescription}
      draft={draft}
      isDemo={isDemo}
      detectedAnnualExpenses={annualExpenses}
      withdrawalRate={withdrawalRate}
      includePrimaryResidence={includePrimaryResidence}
      currentNetWorth={currentNetWorth}
      liquidNetWorth={liquidNetWorth}
      lockSubtracted={pensionLockedValue > 0}
    />
  );

  // ─── Empty state: the verdict says what is missing, the Ipotesi stay reachable ─
  if (!coastProjection || !baseScenario || !target) {
    return (
      <div className="space-y-4">
        <div className="pt-1">
          <PageVerdict verdict={verdict} ariaLabel="Verdetto sul Coast FIRE" />
        </div>
        {ipotesi}
      </div>
    );
  }

  const lastPoint = coastProjection.projectionData[coastProjection.projectionData.length - 1];

  return (
    <div className="space-y-4">
      <div className="pt-1">
        <PageVerdict verdict={verdict} ariaLabel="Verdetto sul Coast FIRE" />
      </div>

      {/* Tablet (768-1439): every tile full width, in the phone's order. */}
      <div className="grid grid-cols-1 gap-3 tablet:grid-cols-2 desktop:grid-cols-12">
        <div className={cn(TILE_CELL_CLASS, 'order-1 tablet:col-span-2 desktop:order-none desktop:col-span-5 desktop:row-span-2')}>
          <CoastTraguardoTile
            reading={describeCoastTarget(target)}
            target={target}
            caption={describeCoastTargetCaption(target)}
            chart={
              <CoastFireProjectionChart
                projectionData={coastProjection.projectionData}
                height="100%"
                marginLeft={0}
                pensionUnlockCalendarYear={lock.unlockCalendarYear}
              />
            }
            footer={describeCoastTargetFooter({
              retirementAge: resolvedRetirementAge,
              requiredNet: baseScenario.retirementCapitalRequired,
              lastTargetOnPlot: lastPoint?.fireNumberTarget ?? baseScenario.retirementCapitalRequired,
              lock,
              lastProjectedYear: lastPoint?.calendarYear ?? currentYear,
            })}
          />
        </div>

        <div className={cn(TILE_CELL_CLASS, 'order-2 tablet:col-span-2 desktop:order-none desktop:col-span-7')}>
          <AfflussiTile reading={describeCoastInflows(inflowEvents, pensions, resolvedRetirementAge)} events={inflowEvents} footer={COAST_INFLOWS_FOOTER} />
        </div>

        <div className={cn(TILE_CELL_CLASS, 'order-3 tablet:col-span-2 desktop:order-none desktop:col-span-7')}>
          <CoastScenariTile reading={describeCoastScenarios(scenarioRows)} rows={scenarioRows} footer={COAST_SCENARIOS_FOOTER} />
        </div>
      </div>

      {ipotesi}

      <CoastDettaglio
        description={describeCoastDettaglio({ bridgeYears, pensionCount: pensions.count })}
        base={baseScenario}
        sortedPensionBreakdown={sortedPensionBreakdown}
        coverageSteps={buildCoastCoverageSteps(baseScenario, sortedPensionBreakdown, resolvedRetirementAge, bridgeYears)}
        coverageReading={describeCoverage(baseScenario, pensions, resolvedRetirementAge, bridgeYears)}
        targetReading={describeTargetAndSteadyState(baseScenario, resolvedRetirementAge, bridgeYears, withdrawalRate, isBridge)}
        impactReading={describePensionImpact(pensions)}
        interpretation={buildBaseScenarioInterpretation(baseScenario, effectiveAnnualExpenses, bridgeYears, resolvedRetirementAge)}
        annualExpenses={effectiveAnnualExpenses ?? 0}
        bridgeYears={bridgeYears}
        retirementAge={resolvedRetirementAge}
      />
    </div>
  );
}
