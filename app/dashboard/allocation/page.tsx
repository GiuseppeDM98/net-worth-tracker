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
 * TWO TABS (doc/guide/accumulo.md): «Bilanciamento» (the page below, the default) and «Accumulo»
 * (`?tab=accumulo`, `AccumuloTab`: the monthly accumulation plan). The band is page state shared by
 * both. With an active plan, Bilanciamento's verdict names the plan's installment in place of Versa
 * (`pac` in `buildAllocazioneVerdict`) and the Piano says that it does not count the plan.
 *
 * Bilanciamento:
 *   Desktop (12 col): Bilanciamento(5) | Piano(7)
 *                     Per classe(5)    |
 *                     Esposizione(12)
 *                     Previdenza(12, only with a pension fund)
 *   Below desktop:    ONE sequence, the DOM above (DESIGN.md → The First-Screen Rule,
 *                     since 2026-10-15): the verdict's title → the first sentence → the strip of
 *                     two figures («Fuori posizione», the largest drift) → «Il perché» →
 *                     Bilanciamento open, its KPI value lifted into the strip → «Il resto della
 *                     pagina» → Per classe, Piano, Esposizione, Previdenza as closed rows
 *                     (`useMobileSections`, doc/guide/allocazione.md § Composizione mobile) →
 *                     «Modifica target» → the Dettaglio. No `order-*`: the phone reads the DOM.
 *                     The Esposizione reads its profiles only once its row has been opened.
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

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Scale, SlidersHorizontal, Sparkles, TrendingUp } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useActiveAccount } from '@/contexts/ActiveAccountContext';
import { queryKeys } from '@/lib/query/queryKeys';
import { useAssets } from '@/lib/hooks/useAssets';
import { useSettings } from '@/lib/hooks/useSettings';
import { useGoalData } from '@/lib/hooks/useGoalData';
import { useFreshness } from '@/lib/hooks/useFreshness';
import { useInstrumentProfilesState } from '@/lib/hooks/usePortfolioExposure';
import { useAllocationAdvice } from '@/lib/hooks/useAllocationAdvice';
import { describeReviewBy, REVIEW_INVITE_LABEL, reviewDueState } from '@/lib/utils/allocationAdviceNarrative';
import { getItalyDateIso } from '@/lib/utils/dateHelpers';
import { useMobileSections } from '@/lib/hooks/useMobileSections';
import { useTabletComposition, useTabletStage } from '@/lib/hooks/useTabletComposition';
import {
  COMPACT_GRID_CLASS,
  COMPACT_GRID_WRAPPER_CLASS,
  INDEX_CLASS,
  LEAD_CELL_CLASS,
  REST_CELL_CLASS,
  STAGE_CLASS,
  STAGE_WRAPPER_CLASS,
  VERDICT_CELL_CLASS,
} from '@/lib/utils/tabletComposition';
import { VERDICT_REST_SECTION } from '@/lib/utils/mobileSections';
import { liftedBlocks } from '@/lib/utils/verdictStrip';
import { calculateAssetValue } from '@/lib/services/assetService';
import {
  compareAllocations,
  deriveTargetLeverageRatio,
  getDefaultTargets,
  buildTargetsFromGoalAllocation,
} from '@/lib/services/assetAllocationService';
import { deriveTargetAllocationFromGoals } from '@/lib/services/goalService';
import type { LeveragePlanInputs } from '@/lib/utils/leverageAwareAllocationUtils';
import type { Asset, AssetAllocationTarget } from '@/types/assets';
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
  ALLOCAZIONE_SECTION_IDS,
  buildCompositionPair,
  buildPensionLookThrough,
  buildPlanView,
  findPacSubstitutions,
  listPlanBuyAssetIds,
  activeClassGaps,
  estimatePlanSaleTax,
  offTargetGaps,
  planSaleNodes,
  resolveAllocazioneSections,
  selectAllocazioneStrip,
  summarizeClassGaps,
  summarizeHoldings,
  summarizeNextMoney,
  untargetedClassLabels,
  type PlanInputs,
  type PlanMode,
} from '@/lib/utils/allocazioneSummary';
import {
  ALLOCAZIONE_CLOSED_ASIDES,
  buildAllocazioneVerdict,
  describeAllocazioneClosedAnswers,
  describeAllocazioneHeader,
  describeBalance,
  describeBalanceFooter,
  describeBandChange,
  describeClasses,
  describePension,
  describePensionAside,
  describePlan,
  describePlanFooter,
  describePacOverlap,
} from '@/lib/utils/allocazioneNarrative';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { PageContainer } from '@/components/layout/PageContainer';
import { PageHeader } from '@/components/layout/PageHeader';
import { PageVerdict } from '@/components/ui/page-verdict';
import { PageTabs, type TabDef } from '@/components/layout/PageTabs';
import { pageTabPanelId } from '@/components/layout/PageTabBar';
import { TabsContent } from '@/components/ui/tabs';
import { VerdictStrip } from '@/components/ui/verdict-strip';
import { PageRest } from '@/components/ui/page-rest';
import { RowAnswers } from '@/components/ui/row-answers';
import { TILE_CELL_CLASS, TILE_ROW_CELL_CLASS } from '@/components/ui/tile';
import { TileGridSkeleton } from '@/components/ui/tile-grid-skeleton';
import { ErrorNotice } from '@/components/ui/error-notice';
import { describeReadFailure } from '@/lib/utils/statesNarrative';
import type { TileSkeletonCell } from '@/lib/utils/tileGridSkeleton';
import { BilanciamentoTile, isBilanciamentoLiftedBlock } from '@/components/allocation/tiles/BilanciamentoTile';
import { PianoTile } from '@/components/allocation/tiles/PianoTile';
import { AccumuloTab } from '@/components/allocation/AccumuloTab';
import { useModelPortfolio } from '@/lib/hooks/useModelPortfolio';
import { PerClasseTile } from '@/components/allocation/tiles/PerClasseTile';
import { EsposizioneTile } from '@/components/allocation/tiles/EsposizioneTile';
import { PrevidenzaTile } from '@/components/allocation/tiles/PrevidenzaTile';
import { AllocazioneDettaglio } from '@/components/allocation/AllocazioneDettaglio';
import { useOpenAccumuloPlan } from '@/lib/hooks/useOpenAccumuloPlan';
import { summarizePacMonth } from '@/lib/utils/accumuloSummary';
import { getAssetDisplayTicker } from '@/lib/utils/assetDisplay';

/** The grid's geometry, for the skeleton: the same spans as the tiles below. */
const SKELETON_CELLS: TileSkeletonCell[] = [
  { span: 5, lines: 10 },
  { span: 7, lines: 8 },
  { span: 6, lines: 7 },
  { span: 6, lines: 7 },
  { span: 12, lines: 4 },
];

const ALLOCATION_TABS: TabDef[] = [
  { value: 'bilanciamento', label: 'Bilanciamento', icon: Scale },
  { value: 'accumulo', label: 'Accumulo', icon: TrendingUp },
];
type AllocationTabId = 'bilanciamento' | 'accumulo';

function getInitialTab(param: string | null): AllocationTabId {
  return param === 'accumulo' ? 'accumulo' : 'bilanciamento';
}

/** The Versa/Preleva amount the page opens with: the verdict needs one to name the next money. */
const DEFAULT_PLAN_AMOUNT_INPUT = '1000';

const EMPTY_HOLDINGS: AllocatableHolding[] = [];
const EMPTY_ASSETS: Asset[] = [];

export default function AllocationPage() {
  const { user } = useAuth();
  const { ownerId } = useActiveAccount();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<AllocationTabId>(() => getInitialTab(searchParams.get('tab')));
  // The accumulation plan the Bilanciamento verdict names in place of Versa.
  const { plan: openPlan, currentIndex: pacMonthIndex } = useOpenAccumuloPlan(ownerId ?? undefined);
  const pac = useMemo(() => summarizePacMonth(openPlan, pacMonthIndex), [openPlan, pacMonthIndex]);
  const queryClient = useQueryClient();

  // ─── The reads: three keys, shared with every other page (2026-09-29) ──────────
  // Assets, settings and the goal document come from the hooks, so a visit after Patrimonio or
  // Impostazioni opens on the cache; the page gates on EVERY query it reads (doc/guide/stati.md).
  const assetsQuery = useAssets(ownerId);
  const settingsQuery = useSettings(ownerId);
  const goalsQuery = useGoalData(ownerId);
  // The Consulente's last run, for the «rivedi entro» line and its button (2026-10-20): read
  // beside the page's data, never a reason for the page to wait or fail.
  const adviceQuery = useAllocationAdvice(ownerId);
  const showConsulente = process.env.NEXT_PUBLIC_ASSISTANT_AI_ENABLED !== 'false';
  // Today's Italian day, read once per mount: near or past the plan's review date the Consulente
  // button becomes the invite to review (2026-10-20), and the path then starts from the plan in force.
  const [todayIso] = useState(() => getItalyDateIso());
  const reviewDue = reviewDueState(adviceQuery.data, todayIso);
  const reviewInvited = reviewDue.state === 'soon' || reviewDue.state === 'due';
  const consulenteHref = reviewInvited ? '/dashboard/allocation/consulente?rivedi=1' : '/dashboard/allocation/consulente';
  const consulenteLabel = reviewInvited ? REVIEW_INVITE_LABEL : 'Consulente';
  const { data: assetsData, isLoading: assetsLoading, isError: assetsError } = assetsQuery;
  const { data: settings, isLoading: settingsLoading, isError: settingsError } = settingsQuery;
  const { data: goalData, isLoading: goalsLoading, isError: goalsError } = goalsQuery;
  // The header's «Aggiornato alle…» while figures restored from the persisted cache are being
  // reread. The Esposizione's profiles stay out: they sit behind a server cache of their own.
  const freshness = useFreshness([assetsQuery, settingsQuery, goalsQuery]);
  const loading = assetsLoading || settingsLoading || goalsLoading;
  /** A failed load is not an empty set: it gets an alert, never a verdict about zeros. */
  const loadFailed = assetsError || settingsError || goalsError;
  // Full, unfiltered asset list — the Previdenza tile's «tutto il patrimonio» needs every role.
  const allAssets = useMemo(() => assetsData ?? [], [assetsData]);
  const modelQuery = useModelPortfolio(ownerId);

  // The page's one control: the drift tolerance that decides COMPRA/VENDI/OK. Session-only; the
  // default matches the server's ±2 p.p. so the first render equals the persisted classification.
  const [band, setBand] = useState<RebalanceBand>(DEFAULT_REBALANCE_BAND);
  const [planMode, setPlanMode] = useState<PlanMode>('rebalance');
  const [amountInput, setAmountInput] = useState(DEFAULT_PLAN_AMOUNT_INPUT);
  const handleTabChange = (value: string) => {
    const next = getInitialTab(value);
    setActiveTab(next);
    router.replace(`${pathname}?tab=${next}`, { scroll: false });
  };

  // What the old `Promise.all` loader composed, now derived once the three reads have answered
  // (`undefined` = not read yet; a settings or goal document that does not exist is `null`).
  const composed = useMemo(() => {
    if (!assetsData || settings === undefined || goalData === undefined) return null;

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

    return {
      targets: effectiveTargets,
      usingGoalTargets: fromGoals,
      // The owner's model-portfolio criteria (Allocazione › Accumulo) — the PAC editor's Ottimizzato view
      // reads it; `null` before the first load, same as `targets`.
      idealAllocation: settings?.idealAllocation ?? null,
      allocation: compareAllocations(inAllocation, effectiveTargets),
      // Per-instrument rows of everything IN the allocation — tradable and frozen alike. Each
      // carries its own `tradable` flag: the frozen ones count in every total and percentage but
      // are never offered as a source or destination, so the plans reach the target by moving the others.
      holdings: buildHoldings(inAllocation, calculateAssetValue),
      // The same rows WITH the debts (a mortgage on a property in the allocation, a personal
      // loan): what the frozen group reports. Never handed to a planner (2026-10-17).
      reportedHoldings: buildHoldings(inAllocation, calculateAssetValue, { includeDebts: true }),
      // The `tradable` assets themselves: the trade CANDIDATES for the leverage-aware planner.
      tradableAssets: tradable,
      // The wealth this page deliberately ignores — the home you live in, and the mortgage that
      // follows it (owner, 2026-10-17: the excluded figure is NET of its debts). Reported only.
      excludedHoldings: buildHoldings(excluded, calculateAssetValue, { includeDebts: true }),
    };
  }, [assetsData, settings, goalData]);
  const targets = composed?.targets ?? null;
  const allocation = composed?.allocation ?? null;
  const usingGoalTargets = composed?.usingGoalTargets ?? false;
  const idealAllocation = composed?.idealAllocation ?? null;
  const holdings = composed?.holdings ?? EMPTY_HOLDINGS;
  const reportedHoldings = composed?.reportedHoldings ?? EMPTY_HOLDINGS;
  const tradableAssets = composed?.tradableAssets ?? EMPTY_ASSETS;
  const excludedHoldings = composed?.excludedHoldings ?? EMPTY_HOLDINGS;

  /** «Riprova» on a failed read: invalidate the three keys, never a bare refetch (AGENTS.md § Caching). */
  const retryLoad = () => {
    if (!ownerId) return;
    queryClient.invalidateQueries({ queryKey: queryKeys.assets.all(ownerId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.settings.all(ownerId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.goals.all(ownerId) });
  };

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
  const frozenGroup = useMemo(() => summarizeHoldings(reportedHoldings.filter((h) => !h.tradable)), [reportedHoldings]);
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
  // A class with neither allocated value nor a target cannot be off target, so it never counts in
  // «N classi su M» and is never named «in linea» — «Immobili · OK · 0 €» was a verdict on a void
  // while the Previdenza tile printed the same class at 60.000 € (`isDormantClass`).
  const activeGaps = useMemo(() => activeClassGaps(gaps), [gaps]);
  const offTarget = useMemo(() => offTargetGaps(activeGaps), [activeGaps]);
  const excludedByClass = useMemo(() => sumHoldingsByClass(excludedHoldings), [excludedHoldings]);
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
  // With an active plan the Piano says what the PAC buys this month, and which instrument the plan
  // bought in place of one this Piano proposes. The three engines are untouched.
  const pacNote = useMemo(() => {
    if (!pac || !planView) return null;
    const labelOfAsset = (assetId: string): string => {
      const asset = allAssets.find((candidate) => candidate.id === assetId);
      return asset ? getAssetDisplayTicker(asset) : (holdings.find((holding) => (holding.assetId ?? holding.id) === assetId)?.label ?? assetId);
    };
    const substitutions = findPacSubstitutions(openPlan?.positions ?? [], listPlanBuyAssetIds(planView, holdings)).map((item) => ({
      replaced: labelOfAsset(item.replacedAssetId),
      buying: labelOfAsset(item.buyAssetId),
    }));
    return describePacOverlap(pac, substitutions);
  }, [pac, planView, openPlan, holdings, allAssets]);
  const nextMoney = useMemo(
    () => (planInputs ? summarizeNextMoney(planInputs, planAmount) : null),
    [planInputs, planAmount],
  );
  // What the plan's SELL legs would actually deliver. The broker withholds on the day of the sale,
  // so «vendi 25.000 €» is gross; `null` (a missing EUR cost basis or rate on some leg) keeps the
  // reading silent and the footer's «non sono considerate» — never a flattering zero.
  const saleTax = useMemo(
    () => (planView ? estimatePlanSaleTax(planSaleNodes(planView), holdings) : null),
    [planView, holdings],
  );
  const pension = useMemo(() => buildPensionLookThrough(allAssets, calculateAssetValue), [allAssets]);
  const pensionFundNames = useMemo(
    () => allAssets.filter((asset) => asset.type === 'pensionFund').map((asset) => asset.name),
    [allAssets],
  );

  const classCount = activeGaps.length;
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
  // The exposure gap as the reading gets it: the score's only while leverage is in play.
  const leverageGapPp = leverageInPlay && balanceScore ? balanceScore.leverageGapPp : 0;

  // ─── The phone composition (2026-10-15) ──────────────────────────────────────
  // The profiles' read state, observed without reading (the tile's hook is the one that reads,
  // and only once its row has been opened): a failed first read is an `ErrorNotice` row, a failed
  // «Aggiorna» over profiles already read keeps the tile — both flag the row (`failed`).
  const profilesState = useInstrumentProfilesState(ownerId, allAssets);
  const exposureFailed = profilesState.isError;
  const hasPension = pension !== null;
  // The rows exist only with the composed grid below: the empty branch renders none, so the
  // controller knows none (`resolveAllocazioneSections`, lib/utils/allocazioneSummary.ts).
  const hasRows = activeTab === 'bilanciamento' && hasAssets && !!bandedAllocation && !!balanceSummary && !!balanceScore && !!planView;
  const sectionSpecs = useMemo(() => resolveAllocazioneSections({ hasRows, hasPension, exposureFailed }), [hasRows, hasPension, exposureFailed]);
  const sections = useMobileSections({ route: 'allocation', sections: sectionSpecs });
  // At 768 the same rows on two columns; on a tablet in landscape the index beside the verdict and
  // THE tile (lib/utils/tabletComposition.ts). The specs ARE the DOM's rows.
  const stageRef = useTabletStage();
  const tablet = useTabletComposition({ sections, order: sectionSpecs.map((section) => section.id) });
  const { reveal: handleStripOpen } = sections;
  const exposureCollapse = sections.collapse(ALLOCAZIONE_SECTION_IDS.esposizione);
  // Below `desktop:` the Esposizione reads its profiles only once its row has been opened — React
  // Query fetches a key as soon as one observer is enabled, so the hook inside the tile is off until
  // then. `useCompactLayout` is true from the first render inside `ProtectedRoute`, so a phone never
  // starts with `compact` false and a read already fired.
  const exposureEnabled = !sections.compact || !!exposureCollapse?.mounted;
  // The two figures of the first screen, read from the balance and the gaps the tiles already
  // print, on the same leverage gap and untargeted wealth the Bilanciamento reading gets; the KPI
  // «Fuori posizione» hides its value on a phone (the strip has it).
  const strip = balanceScore ? selectAllocazioneStrip({ balance: balanceScore, gaps, leverageGapPp, untargeted }) : [];
  const bilanciamentoLifted = liftedBlocks(strip, ALLOCAZIONE_SECTION_IDS.bilanciamento).filter(isBilanciamentoLiftedBlock);
  // What each closed row answers in the landscape index (2026-10-16): figures the page already has.
  // Memoized: a new map on every render would re-render every row.
  const rowAnswers = useMemo(() => describeAllocazioneClosedAnswers({ gaps: activeGaps, planView, pension }), [activeGaps, planView, pension]);

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
        pac,
      }),
    [hasAssets, excludedGroup.total, balanceScore, balanceSummary, band, offTarget, leverageReading, nextMoney, orphanedTargets, pac],
  );

  const headerDescription = describeAllocazioneHeader({
    marketValue: bandedAllocation?.marketValue ?? 0,
    classCount,
    targetSource: activeTab === 'accumulo' ? (modelQuery.data ? 'model' : 'plan') : usingGoalTargets ? 'goals' : 'settings',
    // The Consulente's «rivedi entro» once its plan was applied (2026-10-20); a failed read of
    // that document drops the clause, never the header.
    reviewBy: describeReviewBy(adviceQuery.data),
  });

  const header = (
    <PageHeader
      label="Pianificazione"
      title="Allocazione"
      description={headerDescription}
      freshness={freshness}
      actions={
        <div className="hidden items-center gap-2 desktop:flex">
          {showConsulente && (
            <Button asChild variant={reviewInvited ? 'default' : 'outline'} className="h-8 gap-1.5 px-2.5 text-xs">
              <Link href={consulenteHref}>
                <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                {consulenteLabel}
              </Link>
            </Button>
          )}
          <Button asChild variant="outline" className="h-8 gap-1.5 px-2.5 text-xs">
            <Link href="/dashboard/settings">
              <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
              Modifica target
            </Link>
          </Button>
        </div>
      }
    />
  );

  // Below desktop the header action sits AFTER the tiles as a 44px button: «Modifica target» is
  // what you do once you have read the plan, and above the grid it outranked reading it. It is
  // `asChild` so the DOM is one <a>, never the <a><button> pair that costs two Tab stops.
  const mobileAction = (
    <div className="flex flex-col gap-2 desktop:hidden">
      {showConsulente && (
        <Button asChild variant={reviewInvited ? 'default' : 'outline'} className="h-11 w-full gap-1.5">
          <Link href={consulenteHref}>
            <Sparkles className="h-4 w-4" aria-hidden="true" />
            {consulenteLabel}
          </Link>
        </Button>
      )}
      <Button asChild variant="outline" className="h-11 w-full gap-1.5">
        <Link href="/dashboard/settings">
          <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
          Modifica target
        </Link>
      </Button>
    </div>
  );

  // ─── Loading and empty states ───────────────────────────────────────────────
  if (loading) {
    return (
      <PageContainer>
        {header}
        <TileGridSkeleton cells={SKELETON_CELLS} />
      </PageContainer>
    );
  }

  // A failed read comes BEFORE the empty branch: `[]` on failure is indistinguishable from `[]`
  // on a new account, and the empty branch would judge a set that was never read.
  if (loadFailed) {
    return (
      <PageContainer>
        {header}
        <ErrorNotice
          className="max-w-[920px]"
          onRetry={retryLoad}
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
      <PageContainer>
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
    <PageContainer>
      {header}

      <PageTabs
        tabs={ALLOCATION_TABS}
        value={activeTab}
        onValueChange={handleTabChange}
        layoutId="allocation-tab"
        ariaLabel="Sezioni di Allocazione"
        renderedPanels={new Set([activeTab])}
      >
        {/* Only the active panel is mounted: each carries its own verdict, and two sections with the
            page-verdict view-transition name would break the page scene. */}
        {activeTab === 'bilanciamento' && (
          <TabsContent
            value="bilanciamento"
            id={pageTabPanelId('allocation-tab', 'bilanciamento')}
            aria-label="Bilanciamento"
            // Radix names a Content after ITS trigger; these triggers are plain buttons, so the
            // generated reference points at nothing. The name is the label above.
            aria-labelledby={undefined}
            className="mt-4 flex flex-col gap-3"
          >
      {/* The stage: the verdict over the grid; on a tablet in landscape the answer on the left
          (verdict and THE tile) and the index on the right (lib/utils/tabletComposition.ts). */}
      <RowAnswers value={rowAnswers}>
      <div className={STAGE_WRAPPER_CLASS}>
      <div ref={stageRef} className={STAGE_CLASS}>
      <div data-stage="verdict" className={cn('pt-1', VERDICT_CELL_CLASS)}>
        <PageVerdict
          verdict={verdict}
          ariaLabel="Verdetto sull'allocazione"
          strip={<VerdictStrip figures={strip} onOpen={handleStripOpen} eyebrows={sections.eyebrows} />}
          restCollapse={sections.collapse(VERDICT_REST_SECTION)}
        />

        {/* The band re-classifies the verdict, this page's plan and every chip at once. The region is
            mounted with the page, before anything changes, so a reader is already watching it when the
            text is rewritten — one created together with its content announces nothing. In the
            verdict's box, never a loose cell of the stage; `sr-only` is out of the flow, so the box
            measures what it did. */}
        <p className="sr-only" role="status" aria-live="polite">
          {describeBandChange({ band, offTargetCount: balanceSummary.offTargetCount, classCount })}
        </p>
      </div>

      {/* Two columns from `desktop:`: Bilanciamento at its own height, Per classe under it
          stretched to the Piano's bottom edge when the Piano is the taller (owner, 2026-10-17 — the
          `1fr` second row takes the Piano's extra height and the cell no longer `self-start`s, so
          Per classe's rows stay at the top and its footer sits on the Piano's last line; with a
          shorter Piano everything is at natural height). Until that day both columns sat at
          natural height, by the 2026-09-21 reading of AGENTS.md → a tile stretched beside a taller
          neighbour is cured in the GRID: the owner preferred the aligned edges to the void under
          Per classe. Esposizione takes the full width below. Below `desktop:` the tiles are items of the grid in the DOM's order — ONE
          sequence, no `order-*` (The First-Screen Rule): Bilanciamento, «Il resto della pagina», Per classe,
          Piano, Esposizione, Previdenza.
          At 768 Bilanciamento on two columns, the closed rows two by two, an open row on the whole
          grid row; on a tablet in landscape the index beside the verdict and Bilanciamento. */}
      <div className={COMPACT_GRID_WRAPPER_CLASS}>
      {/* At 1440 the left column is placed on the grid, not wrapped (since 2026-10-16, so that «Il resto»
          and the rows fit ONE index on a tablet in landscape): Bilanciamento on row 1, Per classe under it
          on row 2, Piano across both; the `1fr` second row takes Piano's extra height, and Per classe
          fills it (no `desktop:self-start` on its cell, 2026-10-17). */}
      <div className={cn(COMPACT_GRID_CLASS, 'desktop:grid-rows-[auto_1fr]')}>
        <div data-stage="lead" className={cn(TILE_CELL_CLASS, LEAD_CELL_CLASS, 'desktop:col-span-5 desktop:row-start-1 desktop:self-start')}>
          <BilanciamentoTile
            liftedFigures={bilanciamentoLifted}
            reading={describeBalance({
              marketValue: bandedAllocation.marketValue,
              misallocationPct: balanceScore.misallocationPct,
              leverageGapPp,
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

        <div className={INDEX_CLASS}>
        <PageRest sections={sections} className={REST_CELL_CLASS} />

        <div className={cn(TILE_ROW_CELL_CLASS, tablet.cellClass(ALLOCAZIONE_SECTION_IDS.perClasse), 'desktop:col-span-5 desktop:col-start-1 desktop:row-start-2')}>
          <PerClasseTile
            collapse={sections.collapse(ALLOCAZIONE_SECTION_IDS.perClasse)}
            asideWhenClosed={ALLOCAZIONE_CLOSED_ASIDES[ALLOCAZIONE_SECTION_IDS.perClasse]}
            reading={describeClasses(activeGaps, band)}
            aside="corrente · target · gap"
            allocation={{ ...bandedAllocation, bySubCategory: actionableSubCategories }}
            targets={targets}
            orphans={orphanedTargets}
            excludedByClass={excludedByClass}
          />
        </div>

        <div className={cn(TILE_ROW_CELL_CLASS, tablet.cellClass(ALLOCAZIONE_SECTION_IDS.piano), 'desktop:col-span-7 desktop:col-start-6 desktop:row-span-2 desktop:row-start-1 desktop:self-start')}>
          <PianoTile
            collapse={sections.collapse(ALLOCAZIONE_SECTION_IDS.piano)}
            asideWhenClosed={ALLOCAZIONE_CLOSED_ASIDES[ALLOCAZIONE_SECTION_IDS.piano]}
            mode={planMode}
            onModeChange={setPlanMode}
            amountInput={amountInput}
            onAmountInputChange={setAmountInput}
            reading={describePlan(planView, band, saleTax)}
            view={planView}
            footer={describePlanFooter(planMode, !!leverageInputs, saleTax?.tax !== null && saleTax?.tax !== undefined)}
            pacNote={pacNote ? { reading: pacNote, onOpenAccumulo: () => handleTabChange('accumulo') } : null}
          />
        </div>

        {/* A failed FIRST read of the profiles is a failed row below `desktop:` (silent: `PageRest`
            carries the one live node); a failed «Aggiorna» over profiles already read keeps the
            tile with its own notice. An unread slice is never a failed read: `failed` is the
            query's `isError` alone. At 1440 the tile is the tile of today. */}
        <div className={cn(TILE_ROW_CELL_CLASS, tablet.cellClass(ALLOCAZIONE_SECTION_IDS.esposizione), 'desktop:col-span-12')}>
          {user && ownerId && exposureCollapse && exposureFailed && !profilesState.hasProfiles ? (
            <ErrorNotice
              collapse={exposureCollapse}
              live={false}
              onRetry={() => void profilesState.refetch()}
              notice={describeReadFailure({
                subject: 'Esposizione',
                consequence: 'Le composizioni degli strumenti quotati non sono state lette: senza di esse titoli, settori ed emittenti non si pesano.',
                untouched: 'Il portafoglio e i target registrati non sono stati toccati.',
                canRetry: true,
              })}
            />
          ) : (
            user &&
            ownerId && (
              <EsposizioneTile
                ownerId={ownerId}
                assets={allAssets}
                enabled={exposureEnabled}
                collapse={exposureCollapse}
                asideWhenClosed={ALLOCAZIONE_CLOSED_ASIDES[ALLOCAZIONE_SECTION_IDS.esposizione]}
              />
            )
          )}
        </div>

        {pension && (
          <div className={cn(TILE_ROW_CELL_CLASS, tablet.cellClass(ALLOCAZIONE_SECTION_IDS.previdenza), 'desktop:col-span-12')}>
            <PrevidenzaTile
              collapse={sections.collapse(ALLOCAZIONE_SECTION_IDS.previdenza)}
              asideWhenClosed={ALLOCAZIONE_CLOSED_ASIDES[ALLOCAZIONE_SECTION_IDS.previdenza]}
              reading={describePension(pension)}
              aside={describePensionAside({ fundNames: pensionFundNames, fundValue: pension.fundValue, allFrozen: pension.allFrozen })}
              lookThrough={pension}
            />
          </div>
        )}
        </div>
      </div>
      </div>
      </div>
      </div>
      </RowAnswers>

          {mobileAction}

          <AllocazioneDettaglio frozen={frozenGroup} excluded={excludedGroup} />
          </TabsContent>
        )}

        {activeTab === 'accumulo' && (
          <TabsContent
            value="accumulo"
            id={pageTabPanelId('allocation-tab', 'accumulo')}
            aria-label="Accumulo"
            aria-labelledby={undefined}
          >
            {ownerId && (
              <AccumuloTab
                ownerId={ownerId}
                allAssets={allAssets}
                targets={targets}
                band={band}
                targetLeverageRatio={targetLeverageRatio}
                idealAllocation={idealAllocation}
                onAssetsChanged={retryLoad}
              />
            )}
          </TabsContent>
        )}
      </PageTabs>
    </PageContainer>
  );
}
