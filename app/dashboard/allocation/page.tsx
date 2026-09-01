'use client';

/**
 * ALLOCAZIONE — a verdict over tiles (2026-08-25)
 *
 * The page answers «sono allineato al piano, e cosa faccio con i prossimi soldi?» before it shows
 * a number: a rule-generated verdict (lib/utils/allocazioneNarrative.ts) names the balance score,
 * the classes off target in points and where the next money goes, over a 12-column grid of tiles
 * that each answer one question with a reading line above their figures.
 *
 * The page has NO period axis — an allocation is always read today. Its one control is the
 * rebalance BAND (±2 · ±5 · 5/25 · custom), which re-classifies every COMPRA/VENDI/OK across the
 * verdict, the Piano and the Per classe chips; it lives in the Bilanciamento tile's aside, next to
 * the score it qualifies (Alt A of the canvas, chosen on 2026-08-25). The balance score itself is
 * band-INDEPENDENT (`computeBalanceScore`) and never moves with the band.
 *
 *   Desktop (12 col): Bilanciamento(5) | Piano(7)
 *                     Per classe(6)    | Esposizione(6)
 *                     Previdenza(12, only with a pension fund)
 *   Mobile (1 col):   Bilanciamento → Piano → Per classe → Esposizione → Previdenza → Dettaglio
 *
 * The «Dettaglio» disclosure under the grid holds the two holdings lists the old hero kept in
 * popovers — Non negoziabili (inside the total, untouchable) and Esclusi (outside it).
 *
 * ALLOCATION ROLES: every asset carries an `allocationRole` — `tradable`, `frozen`, or `excluded`
 * — and `partitionByAllocationRole` splits them BEFORE `compareAllocations`, never downstream (see
 * `allocationUtils.ts` for why the filter cannot live after the comparison: it would break the
 * Σ(current − target) = 0 invariant the plans rely on). `frozen` counts in the denominator and in
 * the percentages but never appears in a plan; `excluded` leaves the page entirely, denominator
 * included — which is why the header's total is SMALLER than the Panoramica net worth, and the
 * Bilanciamento footer says so. `Asset.excludeFromAllocation` survives only as a read-fallback in
 * `resolveAllocationRole`; never reintroduce it as a write path.
 *
 * The Piano's amount (default 1000 €) is page state on purpose: the verdict's last clause is the
 * VERSA answer at that amount whatever mode the tile shows, so the two can never disagree.
 * No component computes a figure or writes a sentence: numbers come from
 * lib/utils/allocazioneSummary.ts, words from lib/utils/allocazioneNarrative.ts.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { SlidersHorizontal } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { useActiveAccount } from '@/contexts/ActiveAccountContext';
import { getAllAssets, calculateAssetValue } from '@/lib/services/assetService';
import {
  getSettings,
  compareAllocations,
  deriveTargetLeverageRatio,
  getDefaultTargets,
  buildTargetsFromGoalAllocation,
} from '@/lib/services/assetAllocationService';
import { getGoalData, deriveTargetAllocationFromGoals } from '@/lib/services/goalService';
import type { LeveragePlanInputs } from '@/lib/utils/leverageAwareAllocationUtils';
import type { Asset, AllocationResult, AssetAllocationTarget } from '@/types/assets';
import {
  applyRebalanceBand,
  summarizeBalance,
  computeBalanceScore,
  partitionByAllocationRole,
  buildHoldings,
  sumHoldingsByClass,
  sumHoldingsBySubCategory,
  sumTradableByClass,
  findOrphanedTargets,
  stripOrphanedSubTargets,
  DEFAULT_REBALANCE_BAND,
  type AllocatableHolding,
  type RebalanceBand,
} from '@/lib/utils/allocationUtils';
import {
  buildCompositionPair,
  buildPensionLookThrough,
  buildPlanView,
  offTargetGaps,
  summarizeClassGaps,
  summarizeHoldings,
  summarizeNextMoney,
  untargetedClassLabels,
  type PlanInputs,
  type PlanMode,
} from '@/lib/utils/allocazioneSummary';
import {
  buildAllocazioneVerdict,
  describeAllocazioneHeader,
  describeBalance,
  describeBalanceFooter,
  describeClasses,
  describePension,
  describePensionAside,
  describePlan,
  describePlanFooter,
} from '@/lib/utils/allocazioneNarrative';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { PageContainer } from '@/components/layout/PageContainer';
import { PageHeader } from '@/components/layout/PageHeader';
import { PageVerdict } from '@/components/ui/page-verdict';
import { TILE_CELL_CLASS } from '@/components/ui/tile';
import { TileGridSkeleton } from '@/components/ui/tile-grid-skeleton';
import { ErrorNotice } from '@/components/ui/error-notice';
import { describeReadFailure } from '@/lib/utils/statesNarrative';
import type { TileSkeletonCell } from '@/lib/utils/tileGridSkeleton';
import { BilanciamentoTile } from '@/components/allocation/tiles/BilanciamentoTile';
import { PianoTile } from '@/components/allocation/tiles/PianoTile';
import { PerClasseTile } from '@/components/allocation/tiles/PerClasseTile';
import { EsposizioneTile } from '@/components/allocation/tiles/EsposizioneTile';
import { PrevidenzaTile } from '@/components/allocation/tiles/PrevidenzaTile';
import { AllocazioneDettaglio } from '@/components/allocation/AllocazioneDettaglio';

/** The grid's geometry, for the skeleton: the same spans as the tiles below. */
const SKELETON_CELLS: TileSkeletonCell[] = [
  { span: 5, lines: 10 },
  { span: 7, lines: 8 },
  { span: 6, lines: 7 },
  { span: 6, lines: 7 },
  { span: 12, lines: 4 },
];

/** The Versa/Preleva amount the page opens with: the verdict needs one to name the next money. */
const DEFAULT_PLAN_AMOUNT_INPUT = '1000';

const EMPTY_HOLDINGS: AllocatableHolding[] = [];

export default function AllocationPage() {
  const { user } = useAuth();
  const { ownerId } = useActiveAccount();
  const [targets, setTargets] = useState<AssetAllocationTarget | null>(null);
  const [allocation, setAllocation] = useState<AllocationResult | null>(null);
  const [loading, setLoading] = useState(true);
  /** A failed load is not an empty set: it gets an alert, never a verdict about zeros. */
  const [loadFailed, setLoadFailed] = useState(false);
  const [usingGoalTargets, setUsingGoalTargets] = useState(false);

  // Per-instrument rows of everything IN the allocation — tradable and frozen alike. Each carries
  // its own `tradable` flag: the frozen ones count in every total and percentage but are never
  // offered as a source or destination, so the plans reach the target by moving the others.
  const [holdings, setHoldings] = useState<AllocatableHolding[]>(EMPTY_HOLDINGS);
  // The `tradable` assets themselves: the trade CANDIDATES for the leverage-aware planner.
  const [tradableAssets, setTradableAssets] = useState<Asset[]>([]);
  // The wealth this page deliberately ignores — the home you live in. Reported only.
  const [excludedHoldings, setExcludedHoldings] = useState<AllocatableHolding[]>(EMPTY_HOLDINGS);
  // Full, unfiltered asset list — the Previdenza tile's «tutto il patrimonio» needs every role.
  const [allAssets, setAllAssets] = useState<Asset[]>([]);

  // The page's one control: the drift tolerance that decides COMPRA/VENDI/OK. Session-only; the
  // default matches the server's ±2 p.p. so the first render equals the persisted classification.
  const [band, setBand] = useState<RebalanceBand>(DEFAULT_REBALANCE_BAND);
  const [planMode, setPlanMode] = useState<PlanMode>('rebalance');
  const [amountInput, setAmountInput] = useState(DEFAULT_PLAN_AMOUNT_INPUT);

  const loadData = useCallback(async () => {
    if (!user || !ownerId) return;
    try {
      setLoadFailed(false);
      const [assetsData, settings, goalData] = await Promise.all([
        getAllAssets(ownerId),
        getSettings(ownerId),
        getGoalData(ownerId),
      ]);

      // Split by role BEFORE any allocation math (see `partitionByAllocationRole`). Goal-derived
      // targets keep reading the full asset list — a goal is funded by total wealth.
      const { tradable, frozen, excluded } = partitionByAllocationRole(assetsData);
      const inAllocation = [...tradable, ...frozen];

      let effectiveTargets: AssetAllocationTarget;
      let fromGoals = false;
      if (
        settings?.goalBasedInvestingEnabled &&
        settings?.goalDrivenAllocationEnabled &&
        goalData &&
        goalData.goals.length > 0
      ) {
        const derived = deriveTargetAllocationFromGoals(goalData.goals, goalData.assignments, assetsData);
        if (derived) {
          effectiveTargets = buildTargetsFromGoalAllocation(derived, settings?.targets);
          fromGoals = true;
        } else {
          effectiveTargets = settings?.targets || getDefaultTargets();
        }
      } else {
        effectiveTargets = settings?.targets || getDefaultTargets();
      }

      setTargets(effectiveTargets);
      setUsingGoalTargets(fromGoals);
      setAllocation(compareAllocations(inAllocation, effectiveTargets));
      setHoldings(buildHoldings(inAllocation, calculateAssetValue));
      setTradableAssets(tradable);
      setExcludedHoldings(buildHoldings(excluded, calculateAssetValue));
      setAllAssets(assetsData);
    } catch (error) {
      setLoadFailed(true);
      console.error('Error loading allocation data:', error);
      toast.error('Errore nel caricamento dei dati');
    } finally {
      setLoading(false);
    }
  }, [user, ownerId]);

  useEffect(() => {
    // Deferred so the effect body itself sets no state (react-hooks/set-state-in-effect).
    const timer = setTimeout(() => {
      loadData();
    }, 0);
    return () => clearTimeout(timer);
  }, [loadData]);

  // ─── The numbers (pure layer) ───────────────────────────────────────────────
  // Re-classify the whole result under the active band; the verdict, the plan and the chips all
  // read the banded copy so they can never disagree.
  const bandedAllocation = useMemo(
    () => (allocation ? applyRebalanceBand(allocation, band) : null),
    [allocation, band],
  );
  const balanceSummary = useMemo(
    () => (bandedAllocation ? summarizeBalance(bandedAllocation.byAssetClass) : null),
    [bandedAllocation],
  );
  const balanceScore = useMemo(
    () => (bandedAllocation ? computeBalanceScore(bandedAllocation.byAssetClass) : null),
    [bandedAllocation],
  );
  const tradableByClass = useMemo(() => sumTradableByClass(holdings), [holdings]);
  const frozenGroup = useMemo(() => summarizeHoldings(holdings.filter((h) => !h.tradable)), [holdings]);
  const excludedGroup = useMemo(() => summarizeHoldings(excludedHoldings), [excludedHoldings]);
  const targetLeverageRatio = useMemo(() => deriveTargetLeverageRatio(targets), [targets]);

  // The instrument-aware planner inputs — only when the portfolio actually has leverage.
  const leverageInputs = useMemo<LeveragePlanInputs | undefined>(() => {
    if (!allocation || !allocation.hasLeveragedExposure) return undefined;
    const currentNotionalByAssetClass: Record<string, number> = {};
    for (const [assetClass, data] of Object.entries(allocation.byAssetClass)) {
      currentNotionalByAssetClass[assetClass] = data.currentValue;
    }
    // The comparison's EFFECTIVE targets, on the market base (a fixed-amount cash target keeps a
    // stale percentage in Settings).
    const targetPercentageByAssetClass: Record<string, number> = {};
    for (const [assetClass, data] of Object.entries(allocation.byAssetClass)) {
      targetPercentageByAssetClass[assetClass] = data.targetPercentage;
    }
    return {
      tradableAssets,
      currentNotionalByAssetClass,
      currentNotionalTotal: allocation.notionalValue,
      currentMarketTotal: allocation.marketValue,
      targetPercentageByAssetClass,
      targetLeverageRatio,
    };
  }, [allocation, tradableAssets, targetLeverageRatio]);

  // A target whose entire value sits in excluded assets can never be reached by any buy or sell:
  // the verdict declares it, and it is stripped from the maps handed to the planners AND to the
  // Per classe rows (a COMPRA chip the user can never act on is the same lie in both places).
  const orphanedTargets = useMemo(
    () =>
      bandedAllocation
        ? findOrphanedTargets(
            bandedAllocation.byAssetClass,
            bandedAllocation.bySubCategory,
            sumHoldingsByClass(excludedHoldings),
            sumHoldingsBySubCategory(excludedHoldings),
          )
        : [],
    [bandedAllocation, excludedHoldings],
  );
  const actionableSubCategories = useMemo(
    () => (bandedAllocation ? stripOrphanedSubTargets(bandedAllocation.bySubCategory, orphanedTargets) : {}),
    [bandedAllocation, orphanedTargets],
  );

  const gaps = useMemo(() => (bandedAllocation ? summarizeClassGaps(bandedAllocation.byAssetClass) : []), [bandedAllocation]);
  const offTarget = useMemo(() => offTargetGaps(gaps), [gaps]);
  const composition = useMemo(
    () =>
      bandedAllocation
        ? buildCompositionPair(bandedAllocation.byAssetClass, bandedAllocation.notionalValue, bandedAllocation.hasLeveragedExposure)
        : { current: [], target: [] },
    [bandedAllocation],
  );

  const planInputs = useMemo<PlanInputs | null>(
    () =>
      bandedAllocation
        ? {
            byAssetClass: bandedAllocation.byAssetClass,
            bySubCategory: actionableSubCategories,
            bySpecificAsset: bandedAllocation.bySpecificAsset,
            holdings,
            tradableByClass,
            leverage: leverageInputs,
          }
        : null,
    [bandedAllocation, actionableSubCategories, holdings, tradableByClass, leverageInputs],
  );
  const planAmount = Number(amountInput) || 0;
  const planView = useMemo(
    () => (planInputs ? buildPlanView(planMode, planAmount, planInputs) : null),
    [planInputs, planMode, planAmount],
  );
  const nextMoney = useMemo(
    () => (planInputs ? summarizeNextMoney(planInputs, planAmount) : null),
    [planInputs, planAmount],
  );
  const pension = useMemo(() => buildPensionLookThrough(allAssets, calculateAssetValue), [allAssets]);
  const pensionFundNames = useMemo(
    () => allAssets.filter((asset) => asset.type === 'pensionFund').map((asset) => asset.name),
    [allAssets],
  );

  const classCount = gaps.length;
  const hasAssets = classCount > 0;
  const leverageInPlay = !!bandedAllocation && (bandedAllocation.hasLeveragedExposure || targetLeverageRatio > 1.01);
  const leverageReading = useMemo(
    () => (bandedAllocation && leverageInPlay ? { current: bandedAllocation.leverageRatio, target: targetLeverageRatio } : null),
    [bandedAllocation, leverageInPlay, targetLeverageRatio],
  );
  // Without leverage a negative Σdrift is wealth in classes the targets do not name (a house held
  // with no `realestate` target), not «esposizione sotto il target di leva»: read it as what it is.
  const untargeted = useMemo(() => {
    if (!bandedAllocation || !balanceScore || leverageInPlay || balanceScore.leverageGapPp >= -0.5) return null;
    return { pct: -balanceScore.leverageGapPp, labels: untargetedClassLabels(holdings, bandedAllocation.byAssetClass) };
  }, [bandedAllocation, balanceScore, leverageInPlay, holdings]);

  // ─── The words (pure layer) ─────────────────────────────────────────────────
  const verdict = useMemo(
    () =>
      buildAllocazioneVerdict({
        hasAssets,
        excludedValue: excludedGroup.total,
        score: balanceScore?.score ?? 0,
        isBalanced: balanceSummary?.isBalanced ?? true,
        band,
        offTarget,
        leverage: leverageReading,
        nextMoney,
        orphans: orphanedTargets,
      }),
    [hasAssets, excludedGroup.total, balanceScore, balanceSummary, band, offTarget, leverageReading, nextMoney, orphanedTargets],
  );

  const headerDescription = describeAllocazioneHeader({
    marketValue: bandedAllocation?.marketValue ?? 0,
    classCount,
    targetSource: usingGoalTargets ? 'goals' : 'settings',
  });

  const header = (
    <PageHeader
      label="Pianificazione"
      title="Allocazione"
      description={headerDescription}
      separator={false}
      actions={
        <Link href="/dashboard/settings" className="hidden desktop:block">
          <Button variant="outline" className="h-8 gap-1.5 px-2.5 text-xs">
            <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
            Modifica target
          </Button>
        </Link>
      }
    />
  );

  // Below desktop the header action sits under the verdict as a 44px button.
  const mobileAction = (
    <Link href="/dashboard/settings" className="desktop:hidden">
      <Button variant="outline" className="h-11 w-full gap-1.5">
        <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
        Modifica target
      </Button>
    </Link>
  );

  // ─── Loading and empty states ───────────────────────────────────────────────
  if (loading) {
    return (
      <PageContainer width="wide">
        {header}
        <TileGridSkeleton cells={SKELETON_CELLS} />
      </PageContainer>
    );
  }

  // A failed read comes BEFORE the empty branch: `[]` on failure is indistinguishable from `[]`
  // on a new account, and the empty branch would judge a set that was never read.
  if (loadFailed) {
    return (
      <PageContainer width="wide">
        {header}
        <ErrorNotice
          className="max-w-[920px]"
          onRetry={() => void loadData()}
          notice={describeReadFailure({
            consequence: 'Strumenti e obiettivi di allocazione non sono stati letti: senza di essi il piano non è calcolabile.',
            untouched: 'Il piano registrato non è stato toccato.',
            canRetry: true,
          })}
        />
      </PageContainer>
    );
  }

  if (!hasAssets || !bandedAllocation || !balanceSummary || !balanceScore || !planView) {
    return (
      <PageContainer width="wide">
        {header}
        <div className="pt-1">
          <PageVerdict verdict={verdict} ariaLabel="Verdetto sull'allocazione" />
        </div>
        {mobileAction}
      </PageContainer>
    );
  }

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <PageContainer width="wide">
      {header}

      <div className="pt-1">
        <PageVerdict verdict={verdict} ariaLabel="Verdetto sull'allocazione" />
      </div>
      {mobileAction}

      {/* Tablet (768-1439): Bilanciamento and Piano full width, Per classe beside Esposizione, Previdenza full. */}
      <div className="grid grid-cols-1 gap-3 tablet:grid-cols-2 desktop:grid-cols-12">
        <div className={cn(TILE_CELL_CLASS, 'order-1 tablet:col-span-2 desktop:order-none desktop:col-span-5')}>
          <BilanciamentoTile
            reading={describeBalance({
              marketValue: bandedAllocation.marketValue,
              misallocationPct: balanceScore.misallocationPct,
              leverageGapPp: leverageInPlay ? balanceScore.leverageGapPp : 0,
              offTargetCount: balanceSummary.offTargetCount,
              classCount,
              band,
              untargeted,
            })}
            band={band}
            onBandChange={setBand}
            score={balanceScore.score}
            misallocationPct={balanceScore.misallocationPct}
            misallocationValue={(balanceScore.misallocationPct / 100) * bandedAllocation.notionalValue}
            offTargetCount={balanceSummary.offTargetCount}
            classCount={classCount}
            offTargetLabels={offTarget.map((gap) => gap.label)}
            leverage={leverageReading}
            composition={composition}
            footer={describeBalanceFooter({
              frozen: frozenGroup,
              excluded: excludedGroup,
              netWorth: bandedAllocation.marketValue + excludedGroup.total,
            })}
          />
        </div>

        <div className={cn(TILE_CELL_CLASS, 'order-2 tablet:col-span-2 desktop:order-none desktop:col-span-7')}>
          <PianoTile
            mode={planMode}
            onModeChange={setPlanMode}
            amountInput={amountInput}
            onAmountInputChange={setAmountInput}
            reading={describePlan(planView, band)}
            view={planView}
            footer={describePlanFooter(planMode, !!leverageInputs)}
          />
        </div>

        <div className={cn(TILE_CELL_CLASS, 'order-3 desktop:order-none desktop:col-span-6')}>
          <PerClasseTile
            reading={describeClasses(gaps, band)}
            aside="corrente · target · gap"
            allocation={{ ...bandedAllocation, bySubCategory: actionableSubCategories }}
            targets={targets}
            orphans={orphanedTargets}
          />
        </div>

        <div className={cn(TILE_CELL_CLASS, 'order-4 desktop:order-none desktop:col-span-6')}>
          {user && ownerId && <EsposizioneTile userId={ownerId} />}
        </div>

        {pension && (
          <div className={cn(TILE_CELL_CLASS, 'order-5 tablet:col-span-2 desktop:order-none desktop:col-span-12')}>
            <PrevidenzaTile
              reading={describePension(pension)}
              aside={describePensionAside({ fundNames: pensionFundNames, fundValue: pension.fundValue, allFrozen: pension.allFrozen })}
              lookThrough={pension}
            />
          </div>
        )}
      </div>

      <AllocazioneDettaglio frozen={frozenGroup} excluded={excludedGroup} />
    </PageContainer>
  );
}
