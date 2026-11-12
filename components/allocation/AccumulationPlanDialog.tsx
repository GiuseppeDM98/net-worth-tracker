'use client';

/**
 * AccumulationPlanDialog — the three-step PAC editor (doc/pac-ate.md §10.3).
 *
 * Step 1 picks where the money comes from, step 2 where it goes (one row per tradable asset, a
 * toggle between «Nel piano» and «Da vendere», optional proxy grouping, «+ Nuovo asset» for a
 * position that does not exist yet — D7, `AssetDialog` in its empty-create mode), step 3 is the
 * read-only preview from `buildDraftPreview`. Every screen edits the SAME local `draft`
 * (`AccumulationPlanDraft`) so the liquidity box on step 1 reflects step 2's disposals the moment
 * the reader goes back — nothing here is computed twice.
 *
 * `createDraftPlan`/`updateDraftPlan` run their own zod pass; this dialog additionally runs
 * `validateDraftAgainstAssets` on every render so the status line can name the FIRST domain issue
 * before the write is even attempted (§6, §10.3: "uno alla volta, il primo").
 */
import { useEffect, useMemo, useState } from 'react';
import type { Asset, AssetAllocationTarget } from '@/types/assets';
import type {
  AccumulationPlan,
  AccumulationPlanDraft,
  PlanDisposal,
  PlanPosition,
} from '@/types/accumulationPlan';
import { ACTION_CHIP_FILL_PCT, ASSET_CLASS_CHART_INDEX, ASSET_CLASS_LABELS, resolveAllocationRole, type RebalanceBand } from '@/lib/utils/allocationUtils';
import {
  addMonths,
  applyWeightsToPositions,
  redistributeRemainder,
  replaceBuyAsset,
  separatePosition,
  buildDraftPreview,
  computeTotalPurchases,
  computeUsableLiquidity,
  diffRevisionDisposals,
  findFirstIntactInstallment,
  groupPositions,
  isOpenSavedDisposal,
  listAddableAssets,
  marketWeights,
  orderGroupMembers,
  proceedsOfDisposal,
  resolvePositionStates,
  toMonthKey,
  unitPriceEur,
  type PlanDeps,
} from '@/lib/utils/accumulationPlanUtils';
import { validateDraftAgainstAssets, type DraftIssue } from '@/lib/utils/accumulationPlanSchema';
import { compareAllocations } from '@/lib/services/assetAllocationService';
import { calculateAssetValue } from '@/lib/services/assetService';
import { useCreateDraftPlan, useUpdateDraftPlan, useActivatePlan, useRevisePlan } from '@/lib/hooks/useAccumulationPlan';
import { useAssetLedgerMeta, useAssetTransactions } from '@/lib/hooks/useAssetTransactions';
import { useAnnualCashflow } from '@/lib/hooks/useAnnualCashflow';
import { useActionColors } from '@/lib/hooks/useActionColors';
import { useDemoMode } from '@/lib/hooks/useDemoMode';
import { useChartColors } from '@/lib/hooks/useChartColors';
import { CHART_COLORS } from '@/lib/constants/colors';
import { ResponsiveModal } from '@/components/ui/responsive-modal';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AssetDialog } from '@/components/assets/AssetDialog';
import { PlanDraftSidePanel } from '@/components/allocation/PlanDraftSidePanel';
import { getAssetDisplayTicker } from '@/lib/utils/assetDisplay';
import { SegmentedPill } from '@/components/ui/segmented-pill';
import { cachedFormatCurrencyEUR, formatNumberIt, formatPercentageIt } from '@/lib/utils/formatters';
import { describeModalStatus, describeWriteError, type ModalStatus } from '@/lib/utils/dialogNarrative';
import {
  ACCUMULO_ACTION_ACTIVATE,
  ACCUMULO_ACTION_BACK,
  ACCUMULO_ACTION_GROUP_CANCEL,
  ACCUMULO_ACTION_GROUP_PROXY,
  ACCUMULO_ACTION_SAVE_REVISION,
  ACCUMULO_STEP1_L_AVAILABLE,
  ACCUMULO_STEP1_REMAINING_MONTHS,
  ACCUMULO_STEP1_REVISE_NOTE,
  ACCUMULO_STEP2_ALREADY_SELLING,
  ACCUMULO_STEP2_COL_KEEP_OR_SELL,
  ACCUMULO_STEP2_COL_PER_MONTH,
  ACCUMULO_STEP2_COL_TO_BUY,
  ACCUMULO_STEP2_FROM_LABEL,
  ACCUMULO_STEP2_FROM_PLAN,
  ACCUMULO_STEP2_FROM_HINT,
  ACCUMULO_STEP2_FROM_TODAY,
  ACCUMULO_STEP2_GROUP_HINT,
  ACCUMULO_STEP2_GROUP_NO_BUY,
  ACCUMULO_STEP2_SALE_PROCEEDS,
  ACCUMULO_STEP2_SELL_SHARES,
  ACCUMULO_STEP2_REDISTRIBUTE,
  ACCUMULO_USE_SUGGESTED_INFLOW,
  describeStep1InflowsLabel,
  describeStep2Shares,
  describeSuggestedInflow,
  suggestMonthlyInflow,
  ACCUMULO_ACTION_NEW_ASSET,
  ACCUMULO_ACTION_NEXT,
  ACCUMULO_ACTION_REPLACE,
  ACCUMULO_ACTION_REPLACE_CANCEL,
  ACCUMULO_STEP2_ADD_ASSET_LABEL,
  ACCUMULO_STEP2_ADD_ASSET_PLACEHOLDER,
  ACCUMULO_STEP2_REPLACE_HINT,
  ACCUMULO_STEP2_REPLACE_PLACEHOLDER,
  ACCUMULO_STEP2_REPLACE_PROMPT,
  ACCUMULO_STEP2_SALE_MONTH,
  ACCUMULO_STEP2_SALE_NOT_EXECUTED,
  describeAddableAsset,
  ACCUMULO_ACTION_SAVE_DRAFT,
  ACCUMULO_ACTION_UNGROUP,
  ACCUMULO_ELLIPSIS,
  ACCUMULO_STEP1_INFLOW,
  ACCUMULO_STEP1_L_DISPOSALS,
  ACCUMULO_STEP1_L_HEADLINE,
  ACCUMULO_STEP1_L_MONTHLY,
  ACCUMULO_STEP1_L_MONTHLY_NOTE,
  ACCUMULO_STEP1_L_RESERVE,
  ACCUMULO_STEP1_L_SOURCE,
  ACCUMULO_STEP1_MONTHS,
  ACCUMULO_STEP1_NO_CASH_ACCOUNTS,
  ACCUMULO_STEP1_RESERVE,
  ACCUMULO_STEP1_SOURCE_ACCOUNTS,
  ACCUMULO_STEP1_NAME,
  ACCUMULO_STEP1_SELECT_ALL,
  ACCUMULO_STEP1_SELECT_NONE,
  ACCUMULO_STEP1_START_MONTH,
  ACCUMULO_STEP2_BUY_ASSET_CONFIRM,
  ACCUMULO_STEP2_BUY_ASSET_PROMPT,
  ACCUMULO_STEP2_COL_CURRENT_WEIGHT,
  ACCUMULO_STEP2_COL_INSTRUMENT,
  ACCUMULO_STEP2_COL_TARGET,
  ACCUMULO_STEP2_FOOTNOTE,
  ACCUMULO_STEP2_NO_TRADABLE_ASSETS,
  ACCUMULO_STEP2_PENDING_ASSET_LABEL,
  ACCUMULO_STEP2_TOGGLE_IN_PLAN,
  ACCUMULO_STEP2_TOGGLE_SELL,
  ACCUMULO_STEP2_TOTAL_LABEL,
  ACCUMULO_STEP3_COL_MONTH,
  ACCUMULO_STEP3_COL_TOTAL,
  ACCUMULO_STEP3_SECTION_CLASSES,
  ACCUMULO_STEP3_SECTION_EXPOSURE,
  ACCUMULO_STEP3_SECTION_WEIGHTS,
  ACCUMULO_STEP_TITLES,
  describeStep3Summary,
  ACCUMULO_STEP_READINGS,
  ACCUMULO_STEP3_WEIGHTS_COLUMNS,
  describeAccumuloDialogEyebrow,
  describeInsufficientLiquidityWarning,
  describeUnpricedWarning,
  describeWeightsTotal,
  formatSignedPp,
  monthLabelLong,
  monthLabelShort,
  trajectoryPointLabel,
} from '@/lib/utils/accumulationNarrative';

interface AccumulationPlanDialogProps {
  open: boolean;
  onClose: () => void;
  ownerId: string;
  /** The draft being edited, or `null` for a brand-new plan. */
  plan: AccumulationPlan | null;
  allAssets: Asset[];
  targets: AssetAllocationTarget;
  band: RebalanceBand;
  /** deriveTargetLeverageRatio(targets) — the leva target the preview's class strip reads against. */
  targetLeverageRatio: number;
  /** A «+ Nuovo asset» create landed: the page must reload `allAssets`. */
  onAssetsChanged: () => void;
  onSaved: (planId: string) => void;
  /** RP4: «Rivedi il piano» on an ACTIVE `plan` — same form, step 1 asks the months left, the save is `revisePlan`. */
  revise?: boolean;
}

const DEPS: PlanDeps = { valueOf: calculateAssetValue, priceOf: unitPriceEur };
const MAX_CALENDAR_ROWS = 8;

function emptyDraft(
  startMonth: string,
  positions: PlanPosition[] = [],
  disposals: PlanDisposal[] = []
): AccumulationPlanDraft {
  return {
    name: 'Piano di accumulo',
    startMonth,
    months: 12,
    liquidity: { sourceCashAssetIds: [], reserveEur: 0, monthlyInflowEur: 0 },
    positions,
    disposals,
  };
}

function draftFromPlan(plan: AccumulationPlan): AccumulationPlanDraft {
  return {
    name: plan.name,
    startMonth: plan.startMonth,
    months: plan.months,
    liquidity: plan.liquidity,
    positions: plan.positions,
    disposals: plan.disposals,
  };
}

/**
 * RP4: the draft a revision edits — from the first intact installment `k` on: its month, the months
 * left, the plan's positions and the sales not yet executed (the saved ones show but never come off).
 */
function draftForRevision(plan: AccumulationPlan): AccumulationPlanDraft {
  const first = findFirstIntactInstallment(plan);
  const remaining = first ? plan.months - (first.index - 1) : plan.months;
  return {
    name: plan.name,
    startMonth: first?.month ?? plan.startMonth,
    months: Math.max(1, remaining),
    liquidity: plan.liquidity,
    positions: plan.positions,
    disposals: plan.disposals.filter((disposal) => disposal.status !== 'executed'),
  };
}

/**
 * Step 2 starts on ONE singleton position per tradable, valued holding — every euro the page
 * knows about needs a bucket the moment the editor opens (D5/D7), never only once the reader
 * has thought to add one. The target starts at 0, not at the holding's current share: a
 * pre-filled 100% for a single-asset portfolio would hide the very total-≠-100 gate step 2
 * exists to enforce.
 *
 * A cash account is never a candidate here (PR #4 review, rilievo 6): `resolveAllocationRole`
 * reads `tradable` for it by default, so a current account used to seed nothing else would land
 * in step 2 as a 0%-weight row — and, once picked as a step 1 source too, its value would enter B
 * twice (once as `currentValueEur`, once as `L`).
 */
function seedPositionsFromAssets(allAssets: Asset[]): PlanPosition[] {
  return allAssets
    .filter((asset) => asset.assetClass !== 'cash' && resolveAllocationRole(asset) === 'tradable' && calculateAssetValue(asset) > 0)
    .map((asset) => ({
      id: crypto.randomUUID(),
      label: asset.name,
      targetPercentage: 0,
      memberAssetIds: [asset.id],
      buyAssetId: asset.id,
    }));
}

export function AccumulationPlanDialog({
  open,
  onClose,
  ownerId,
  plan,
  allAssets,
  targets,
  band,
  targetLeverageRatio,
  onAssetsChanged,
  onSaved,
  revise = false,
}: AccumulationPlanDialogProps) {
  const isDemo = useDemoMode();
  const chartColors = useChartColors();
  const [rowOrder, setRowOrder] = useState<string[]>([]);
  // The position a Vendi took away, so Tieni gives it back with its weight.
  const [keptPositions, setKeptPositions] = useState<Record<string, PlanPosition>>({});
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [draft, setDraft] = useState<AccumulationPlanDraft>(() => emptyDraft(addMonths(toMonthKey(new Date()), 1)));
  const [status, setStatus] = useState<ModalStatus>({ phase: 'idle' });
  const [selectedForGroup, setSelectedForGroup] = useState<Set<string>>(new Set());
  const [groupingBuyAssetId, setGroupingBuyAssetId] = useState<string | null>(null);
  const [newAssetDialogOpen, setNewAssetDialogOpen] = useState(false);
  // AL9: the position whose buyer is being replaced (a row's «Sostituisci»), and where a «+ Nuovo asset» lands.
  const [replacingPositionId, setReplacingPositionId] = useState<string | null>(null);
  const [newAssetFor, setNewAssetFor] = useState<'add' | 'replace'>('add');
  const [weightsFrom, setWeightsFrom] = useState<'plan' | 'today' | null>(null);
  // The plan's own weights and sales as the dialog opened on them: «Piano attuale» brings them back.
  const [planBase, setPlanBase] = useState<{ positions: PlanPosition[]; disposals: PlanDisposal[] } | null>(null);
  const [groupingMode, setGroupingMode] = useState(false);

  // Reset on every (open, plan) change, settled during render — AGENTS.md § Dialog Form Reset.
  const [openSubject, setOpenSubject] = useState<{ open: boolean; plan: AccumulationPlan | null } | null>(null);
  if (!openSubject || openSubject.open !== open || openSubject.plan !== plan) {
    setOpenSubject({ open, plan });
    if (open) {
      setDraft(
        plan
          ? revise
            ? draftForRevision(plan)
            : draftFromPlan(plan)
          : emptyDraft(
              addMonths(toMonthKey(new Date()), 1),
              applyWeightsToPositions(
                seedPositionsFromAssets(allAssets),
                marketWeights(
                  seedPositionsFromAssets(allAssets).flatMap((position) => position.memberAssetIds).map((id) => allAssets.find((a) => a.id === id)).filter((a): a is Asset => !!a),
                  DEPS
                ),
                new Set(),
                (id) => allAssets.find((a) => a.id === id)?.name ?? id
              )
            )
      );
      const planDraft = plan ? (revise ? draftForRevision(plan) : draftFromPlan(plan)) : null;
      setPlanBase(planDraft ? { positions: planDraft.positions, disposals: planDraft.disposals } : null);
      setWeightsFrom(plan ? 'plan' : 'today');
      setGroupingMode(false);
      setStep(plan && !revise ? 2 : 1);
      setStatus({ phase: 'idle' });
      setSelectedForGroup(new Set());
      setGroupingBuyAssetId(null);
      setReplacingPositionId(null);
    }
  }

  const assetsById = useMemo(() => new Map(allAssets.map((asset) => [asset.id, asset])), [allAssets]);
  const cashAccounts = useMemo(() => allAssets.filter((asset) => asset.assetClass === 'cash'), [allAssets]);

  // Every tradable holding with a value, plus any asset created empty in THIS session — the
  // moment it exists it must be classified (D7).
  const classifiedAssetIds = useMemo(() => {
    const ids = new Set<string>();
    for (const position of draft.positions) for (const id of position.memberAssetIds) ids.add(id);
    for (const disposal of draft.disposals) ids.add(disposal.assetId);
    return ids;
  }, [draft.positions, draft.disposals]);

  // Step 2 row order, fixed at first appearance, so a row flipping Tieni ↔ Vendi stays where it is
  // (state adjusted during render, guarded: it settles in one extra pass).
  const draftAssetIds = [...draft.positions.flatMap((position) => position.memberAssetIds), ...draft.disposals.map((disposal) => disposal.assetId)];
  const missingFromOrder = draftAssetIds.filter((id, index) => !rowOrder.includes(id) && draftAssetIds.indexOf(id) === index);
  if (open && missingFromOrder.length > 0) setRowOrder([...rowOrder, ...missingFromOrder]);

  // Same rilievo 6 exclusion as the seeder above: a cash account never appears as a step 2 row.
  const candidateAssets = useMemo(
    () =>
      allAssets.filter((asset) => {
        if (asset.assetClass === 'cash') return false;
        if (resolveAllocationRole(asset) !== 'tradable') return false;
        return calculateAssetValue(asset) > 0 || classifiedAssetIds.has(asset.id);
      }),
    [allAssets, classifiedAssetIds],
  );

  const monthOptions = useMemo(() => {
    const current = toMonthKey(new Date());
    return Array.from({ length: 12 }, (_, i) => addMonths(current, i));
  }, []);

  const liquidity = useMemo(
    () => (open ? computeUsableLiquidity(draft.liquidity, assetsById, draft.disposals, draft.months, DEPS) : null),
    [open, draft, assetsById],
  );

  const issues: DraftIssue[] = useMemo(
    () => (open ? validateDraftAgainstAssets(draft, assetsById) : []),
    [open, draft, assetsById],
  );
  const weightsSum = draft.positions.reduce((sum, position) => sum + position.targetPercentage, 0);
  const weightsMessage = describeWeightsTotal(weightsSum);
  const firstIssue = issues[0]?.message ?? null;

  // RP7: the Cashflow's saving as a monthly figure, read only while step 1 is on screen.
  const cashflowQuery = useAnnualCashflow(ownerId, { enabled: open && step === 1 });
  const suggestedInflow = suggestMonthlyInflow(cashflowQuery.data?.annualSavings ?? 0);

  // Step 2's figures: today's share, what to
  // buy (euro, whole shares under it) and the monthly part — the same split the calendar uses.
  const stepTwoFigures = useMemo(() => {
    if (!open || !liquidity) return new Map<string, { todayPct: number; buyEur: number; buyShares: number; monthlyEur: number }>();
    const states = resolvePositionStates(draft.positions, assetsById, DEPS, draft.disposals);
    const totals = computeTotalPurchases(states, liquidity.L);
    // «Oggi» on the same footing as the target and «Pesi di oggi»: the share among the plan's own
    // instruments (they sum to 100%), without the cash still to invest — so «Pesi di oggi» reads
    // as target = oggi, and every other source as the shift it asks for.
    const base = states.reduce((sum, state) => sum + state.currentValueEur, 0);
    const figures = new Map<string, { todayPct: number; buyEur: number; buyShares: number; monthlyEur: number }>();
    for (const state of states) {
      const buyEur = totals[state.positionId] ?? 0;
      figures.set(state.positionId, {
        todayPct: base > 0 ? (state.currentValueEur / base) * 100 : 0,
        buyEur,
        buyShares: state.unpriced ? 0 : Math.floor(buyEur / state.buyPriceEur + 1e-9),
        monthlyEur: draft.months > 0 ? buyEur / draft.months : 0,
      });
    }
    return figures;
  }, [open, liquidity, draft.positions, draft.disposals, draft.months, assetsById]);

  const labelOfAsset = (assetId: string) => assetsById.get(assetId)?.name ?? assetId;
  // AL11: only a sale already executed (or linked to a ledger sale) is closed; a saved one still to do can come off or move.
  const lockedSaleIds = useMemo(
    () => new Set(revise && plan ? plan.disposals.filter((d) => !isOpenSavedDisposal(d)).map((d) => d.assetId) : []),
    [revise, plan],
  );
  const savedOpenSaleIds = useMemo(
    () => new Set(revise && plan ? plan.disposals.filter(isOpenSavedDisposal).map((d) => d.assetId) : []),
    [revise, plan],
  );
  // The installment index a revision starts from (k): the earliest month a moved sale can take.
  const firstRevisedIndex = useMemo(() => (revise && plan ? findFirstIntactInstallment(plan)?.index ?? 1 : 1), [revise, plan]);

  // AL10: the Registro tells a never-bought instrument from a sold-out one; read only while the Target step is up.
  const ledgerMetaQuery = useAssetLedgerMeta(open && step === 2 ? ownerId : undefined);
  const tradesQuery = useAssetTransactions(ownerId, undefined, { enabled: open && step === 2 && !!ledgerMetaQuery.data });
  const tradedAssetIds = useMemo(
    () => (ledgerMetaQuery.data && tradesQuery.data ? new Set(tradesQuery.data.map((trade) => trade.assetId)) : null),
    [ledgerMetaQuery.data, tradesQuery.data],
  );

  const revisionChanges = useMemo(
    () => (revise && plan ? diffRevisionDisposals(plan, draft.disposals) : { newDisposals: [], removedDisposalAssetIds: [], movedDisposalMonthIndexes: {} }),
    [revise, plan, draft.disposals],
  );

  /** RP1: «Parti da» — the plan's own weights, or today's market weights, onto the draft's positions. */
  const startFrom = (source: 'plan' | 'today') => {
    setWeightsFrom(source);
    if (source === 'plan') {
      if (planBase) setDraft((prev) => ({ ...prev, positions: planBase.positions, disposals: planBase.disposals }));
      setKeptPositions({});
      return;
    }
    // Picking a source goes back to its initial setup: every whole-instrument sale taken back to
    // Tieni (the ones the plan already carries stay), then the source's weights.
    const givenBack = draft.disposals.filter((d) => d.quantity === undefined && !lockedSaleIds.has(d.assetId) && keptPositions[d.assetId]);
    const sold = new Set(draft.disposals.filter((d) => d.quantity === undefined && !givenBack.includes(d)).map((d) => d.assetId));
    const base = [...draft.positions, ...givenBack.map((d) => keptPositions[d.assetId])];
    const nextPositions = applyWeightsToPositions(
      base,
      marketWeights(
        draft.positions.flatMap((position) => position.memberAssetIds).map((id) => assetsById.get(id)).filter((a): a is Asset => !!a),
        DEPS
      ),
      sold,
      labelOfAsset
    );
    setDraft((prev) => ({
      ...prev,
      positions: nextPositions,
      disposals: prev.disposals.filter((d) => !givenBack.includes(d)),
    }));
  };

  /** RP2: sell `quantity` shares of a held position member (integer ≥ 1); 0 or blank takes the sale back. */
  const setPartialSale = (asset: Asset, quantity: number) => {
    const rest = draft.disposals.filter((disposal) => disposal.assetId !== asset.id);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      updateDisposals(rest);
      return;
    }
    const whole = Math.floor(quantity);
    updateDisposals([
      ...rest,
      { assetId: asset.id, quantity: whole, estimatedProceedsEur: Math.min(whole, asset.quantity) * DEPS.priceOf(asset), status: 'planned' },
    ]);
  };

  // ── Step 2 helpers — one row per candidate asset ──────────────────────────

  const updatePositions = (positions: PlanPosition[]) => setDraft((prev) => ({ ...prev, positions }));
  const updateDisposals = (disposals: PlanDisposal[]) => setDraft((prev) => ({ ...prev, disposals }));

  const moveAssetToDisposal = (asset: Asset) => {
    const leaving = draft.positions.find((position) => position.memberAssetIds.length === 1 && position.memberAssetIds[0] === asset.id);
    if (leaving) setKeptPositions((prev) => ({ ...prev, [asset.id]: leaving }));
    updatePositions(draft.positions.filter((position) => position !== leaving));
    updateDisposals([
      ...draft.disposals.filter((disposal) => disposal.assetId !== asset.id),
      { assetId: asset.id, estimatedProceedsEur: calculateAssetValue(asset), status: 'planned' },
    ]);
  };

  const moveAssetToPosition = (asset: Asset) => {
    updateDisposals(draft.disposals.filter((disposal) => disposal.assetId !== asset.id));
    updatePositions([
      ...draft.positions,
      keptPositions[asset.id] ?? { id: crypto.randomUUID(), label: asset.name, targetPercentage: 0, memberAssetIds: [asset.id], buyAssetId: asset.id },
    ]);
  };

  const setPositionTarget = (positionId: string, targetPercentage: number) =>
    updatePositions(draft.positions.map((position) => (position.id === positionId ? { ...position, targetPercentage } : position)));

  const confirmGroup = () => {
    if (!groupingBuyAssetId || selectedForGroup.size < 2) return;
    updatePositions(groupPositions(draft.positions, selectedForGroup, groupingBuyAssetId, labelOfAsset));
    setSelectedForGroup(new Set());
    setGroupingBuyAssetId(null);
  };

  const ungroup = (positionId: string) =>
    updatePositions(
      separatePosition(draft.positions, positionId, (assetId) => {
        const asset = assetsById.get(assetId);
        return asset ? calculateAssetValue(asset) : 0;
      }, labelOfAsset),
    );

  /** AL10: an instrument from outside the draft joins at weight 0 (also one with no shares). */
  const addInstrument = (assetId: string) => {
    updatePositions([...draft.positions, { id: crypto.randomUUID(), label: labelOfAsset(assetId), targetPercentage: 0, memberAssetIds: [assetId], buyAssetId: assetId }]);
  };

  /** AL9: `assetId` buys in place of the position's current buyer; the old one stays in the group. */
  const replaceBuyer = (positionId: string, assetId: string) => {
    const replaced = replaceBuyAsset(draft.positions, positionId, assetId, labelOfAsset);
    if (replaced) updatePositions(replaced);
    setReplacingPositionId(null);
  };

  /** AL11: a saved sale not yet executed moves to another installment of the revised calendar. */
  const setSaleMonth = (assetId: string, monthIndex: number) =>
    updateDisposals(draft.disposals.map((disposal) => (disposal.assetId === assetId ? { ...disposal, monthIndex } : disposal)));

  const addableAssets = useMemo(
    () => (open && step === 2 ? listAddableAssets(allAssets, draft, tradedAssetIds) : []),
    [open, step, allAssets, draft, tradedAssetIds],
  );
  const replacingPosition = replacingPositionId ? draft.positions.find((position) => position.id === replacingPositionId) ?? null : null;
  const replacementCandidates = useMemo(
    () =>
      replacingPosition
        ? listAddableAssets(allAssets, draft, tradedAssetIds, new Set(replacingPosition.memberAssetIds.filter((id) => id !== replacingPosition.buyAssetId)))
        : [],
    [replacingPosition, allAssets, draft, tradedAssetIds],
  );

  // ── Save / Activate ────────────────────────────────────────────────────────

  const createMutation = useCreateDraftPlan(ownerId);
  const updateMutation = useUpdateDraftPlan(ownerId);
  const activateMutation = useActivatePlan(ownerId);
  const reviseMutation = useRevisePlan(ownerId);
  const saveDraft = async (): Promise<string | null> => {
    setStatus({ phase: 'submitting' });
    try {
      let planId: string;
      if (plan) {
        await updateMutation.mutateAsync({ planId: plan.id, draft });
        planId = plan.id;
      } else {
        planId = await createMutation.mutateAsync(draft);
      }
      setStatus({ phase: 'idle' });
      return planId;
    } catch (error) {
      setStatus({ phase: 'error', message: describeWriteError(error) });
      return null;
    }
  };

  const handleSaveDraft = async () => {
    const planId = await saveDraft();
    if (planId) {
      onSaved(planId);
      onClose();
    }
  };

  const handleActivate = async () => {
    const planId = await saveDraft();
    if (!planId) return;
    setStatus({ phase: 'submitting' });
    try {
      await activateMutation.mutateAsync({
        planId,
        input: { allAssets, targets, compare: compareAllocations, deps: DEPS, today: new Date() },
      });
    } catch (error) {
      setStatus({ phase: 'error', message: describeWriteError(error) });
      return;
    }
    onSaved(planId);
    onClose();
  };

  /** RP4/AL11: the revision writes the new sales and the changes to the saved ones; executed sales stay as they are. */
  const handleRevise = async () => {
    if (!plan) return;
    setStatus({ phase: 'submitting' });
    try {
      await reviseMutation.mutateAsync({
        planId: plan.id,
        revision: {
          monthlyInflowEur: draft.liquidity.monthlyInflowEur,
          reserveEur: draft.liquidity.reserveEur,
          remainingMonths: draft.months,
          positions: draft.positions,
          disposals: revisionChanges.newDisposals,
          sourceCashAssetIds: draft.liquidity.sourceCashAssetIds,
          removedDisposalAssetIds: revisionChanges.removedDisposalAssetIds,
          movedDisposalMonthIndexes: revisionChanges.movedDisposalMonthIndexes,
        },
        input: { allAssets, deps: DEPS, today: new Date() },
      });
    } catch (error) {
      setStatus({ phase: 'error', message: describeWriteError(error) });
      return;
    }
    onSaved(plan.id);
    onClose();
  };

  const canProceedFromStep2 = Math.abs(weightsSum - 100) <= 0.01 && draft.positions.length > 0;
  const preview = useMemo(
    () => (step === 3 ? buildDraftPreview({ draft, allAssets, targets, band, compare: compareAllocations, deps: DEPS }) : null),
    [step, draft, allAssets, targets, band],
  );
  // Coverage (D9/§5.5): `preview.totals` always SUMS to L (splitTowardTarget redistributes whatever
  // is available), so a shortfall shows only by comparing L against the IDEAL deficit —
  // Σ max(0, target%×B − currentValue) — computed the same way `computeTotalPurchases` does.
  const coveragePct = useMemo(() => {
    if (!preview) return null;
    const states = resolvePositionStates(draft.positions, assetsById, DEPS, draft.disposals);
    const B = states.reduce((sum, s) => sum + s.currentValueEur, 0) + preview.liquidity.L;
    const totalDeficit = states.filter((s) => !s.unpriced).reduce((sum, s) => sum + Math.max(0, (s.targetPercentage / 100) * B - s.currentValueEur), 0);
    if (totalDeficit <= 0.5) return null;
    const pct = Math.min(100, (preview.liquidity.L / totalDeficit) * 100);
    return pct >= 99.5 ? null : pct;
  }, [preview, draft.positions, draft.disposals, assetsById]);
  const step3Summary = preview
    ? describeStep3Summary({
        months: preview.schedule.installments.length,
        firstEur: (preview.schedule.installments[0]?.lines ?? []).reduce((acc, line) => acc + line.plannedAmountEur, 0),
        firstMonth: preview.schedule.installments[0]?.month ?? draft.startMonth,
        averageEur:
          preview.schedule.installments.reduce((sum, i) => sum + i.lines.reduce((acc, line) => acc + line.plannedAmountEur, 0), 0) /
          Math.max(1, preview.schedule.installments.length),
        coveragePct,
        leverageRatio: preview.outcome.leverageRatio,
      })
    : null;
  // Step 3: today's weight on the Target step's footing (the plan's instruments, Σ 100%), and the
  // classes of the trajectory without those that hold neither weight nor target.
  const stepThreeTodayPct = useMemo(() => {
    const map = new Map<string, number>();
    if (!preview) return map;
    const states = resolvePositionStates(draft.positions, assetsById, DEPS, draft.disposals);
    const base = states.reduce((sum, state) => sum + state.currentValueEur, 0);
    for (const state of states) map.set(state.positionId, base > 0 ? (state.currentValueEur / base) * 100 : 0);
    return map;
  }, [preview, draft.positions, draft.disposals, assetsById]);
  const stepThreeClasses = useMemo(() => {
    if (!preview) return [];
    const live = new Set<string>();
    for (const point of preview.trajectory)
      for (const [assetClass, entry] of Object.entries(point.byClass))
        if (entry && (Math.abs(entry.currentPct) >= 0.05 || Math.abs(entry.targetPct) >= 0.05)) live.add(assetClass);
    return Object.keys(preview.trajectory[0]?.byClass ?? {}).filter((assetClass) => live.has(assetClass));
  }, [preview]);
  const modalStatus = describeModalStatus(status, {
    idle: firstIssue
      ? [{ text: firstIssue }]
      : step === 2 && weightsMessage
        ? [{ text: weightsMessage }]
        : step === 3
          ? (step3Summary ?? [{ text: ACCUMULO_STEP_TITLES[3] }])
          : [{ text: ACCUMULO_STEP_READINGS[step as 1 | 2] }],
    submitting: 'Salvataggio in corso…',
  });

  // PO15: the Target step's side panel recomputes 300 ms after the last keystroke, not on each one.
  const [settledDraft, setSettledDraft] = useState(draft);
  useEffect(() => {
    if (step !== 2) return;
    const timer = setTimeout(() => setSettledDraft(draft), 300);
    return () => clearTimeout(timer);
  }, [step, draft]);
  const settledPreview = useMemo(
    () =>
      step === 2 && settledDraft.positions.length > 0
        ? buildDraftPreview({ draft: settledDraft, allAssets, targets, band, compare: compareAllocations, deps: DEPS })
        : null,
    [step, settledDraft, allAssets, targets, band],
  );
  return (
    <>
      <ResponsiveModal
        open={open}
        onClose={onClose}
        width="xl"
        eyebrow={describeAccumuloDialogEyebrow(step, revise)}
        title={ACCUMULO_STEP_TITLES[step]}
        reading={modalStatus}
        footer={
          <>
            {step > 1 && (
              <Button variant="outline" onClick={() => setStep((step - 1) as 1 | 2)}>
                {ACCUMULO_ACTION_BACK}
              </Button>
            )}
            {step < 3 ? (
              <Button onClick={() => setStep((step + 1) as 2 | 3)} disabled={step === 2 && !canProceedFromStep2}>
                {ACCUMULO_ACTION_NEXT}
              </Button>
            ) : revise ? (
              <Button onClick={() => void handleRevise()} disabled={isDemo || status.phase === 'submitting' || issues.length > 0}>
                {ACCUMULO_ACTION_SAVE_REVISION}
              </Button>
            ) : (
              <>
                <Button variant="outline" onClick={() => void handleSaveDraft()} disabled={isDemo || status.phase === 'submitting'}>
                  {ACCUMULO_ACTION_SAVE_DRAFT}
                </Button>
                <Button onClick={() => void handleActivate()} disabled={isDemo || status.phase === 'submitting' || issues.length > 0}>
                  {ACCUMULO_ACTION_ACTIVATE}
                </Button>
              </>
            )}
          </>
        }
      >
        {step === 1 && (
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="space-y-4">
              {/* The name the plan carries in Piani conclusi; a revision keeps the plan's own. */}
              <label className="block text-[13px] text-foreground">
                {ACCUMULO_STEP1_NAME}
                <Input
                  value={draft.name}
                  disabled={revise}
                  maxLength={60}
                  onChange={(event) => setDraft((prev) => ({ ...prev, name: event.target.value }))}
                  onBlur={() => setDraft((prev) => (prev.name.trim() ? prev : { ...prev, name: 'Piano di accumulo' }))}
                  className="mt-1"
                />
              </label>
              <div>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{ACCUMULO_STEP1_SOURCE_ACCOUNTS}</p>
                  {cashAccounts.length > 1 && (() => {
                    const allSelected = cashAccounts.every((account) => draft.liquidity.sourceCashAssetIds.includes(account.id));
                    return (
                      <Button
                        variant="ghost"
                        className="h-11 px-2 text-[12px] desktop:h-7"
                        onClick={() =>
                          setDraft((prev) => ({
                            ...prev,
                            liquidity: { ...prev.liquidity, sourceCashAssetIds: allSelected ? [] : cashAccounts.map((account) => account.id) },
                          }))
                        }
                      >
                        {allSelected ? ACCUMULO_STEP1_SELECT_NONE : ACCUMULO_STEP1_SELECT_ALL}
                      </Button>
                    );
                  })()}
                </div>
                {cashAccounts.length === 0 ? (
                  <p className="text-[13px] text-muted-foreground">{ACCUMULO_STEP1_NO_CASH_ACCOUNTS}</p>
                ) : (
                  <ul className="space-y-1.5">
                    {cashAccounts.map((account) => {
                      const checked = draft.liquidity.sourceCashAssetIds.includes(account.id);
                      return (
                        <li key={account.id} className="flex items-center gap-2">
                          <Checkbox
                            id={`src-${account.id}`}
                            checked={checked}
                            onCheckedChange={(value) =>
                              setDraft((prev) => ({
                                ...prev,
                                liquidity: {
                                  ...prev.liquidity,
                                  sourceCashAssetIds: value
                                    ? [...prev.liquidity.sourceCashAssetIds, account.id]
                                    : prev.liquidity.sourceCashAssetIds.filter((id) => id !== account.id),
                                },
                              }))
                            }
                          />
                          <label htmlFor={`src-${account.id}`} className="flex-1 text-[13px] text-foreground">
                            {account.name}
                          </label>
                          <span className="font-mono text-[12px] tabular-nums text-muted-foreground">{cachedFormatCurrencyEUR(calculateAssetValue(account))}</span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              <label className="block text-[13px] text-foreground">
                {ACCUMULO_STEP1_RESERVE}
                <DraftNumberInput
                  min={0}
                  value={draft.liquidity.reserveEur}
                  fallback={0}
                  onValue={(reserveEur) => setDraft((prev) => ({ ...prev, liquidity: { ...prev.liquidity, reserveEur } }))}
                  className="mt-1 font-mono"
                />
              </label>

              <label className="block text-[13px] text-foreground">
                {ACCUMULO_STEP1_INFLOW}
                <DraftNumberInput
                  min={0}
                  value={draft.liquidity.monthlyInflowEur}
                  fallback={0}
                  onValue={(monthlyInflowEur) => setDraft((prev) => ({ ...prev, liquidity: { ...prev.liquidity, monthlyInflowEur } }))}
                  className="mt-1 font-mono"
                />
              </label>
              {/* RP7: the Cashflow's average saving, offered and never filled in by itself. */}
              {suggestedInflow > 0 && cashflowQuery.data && (
                <p className="-mt-2 flex flex-wrap items-center gap-2 text-[12px] text-muted-foreground">
                  <span>{describeSuggestedInflow(suggestedInflow, cashflowQuery.data.referenceYear, cashflowQuery.data.isAnnualized)}</span>
                  <Button
                    variant="outline"
                    className="h-11 px-2.5 text-[12px] desktop:h-7"
                    onClick={() => setDraft((prev) => ({ ...prev, liquidity: { ...prev.liquidity, monthlyInflowEur: suggestedInflow } }))}
                  >
                    {ACCUMULO_USE_SUGGESTED_INFLOW}
                  </Button>
                </p>
              )}

              <label className="block text-[13px] text-foreground">
                {revise ? ACCUMULO_STEP1_REMAINING_MONTHS : ACCUMULO_STEP1_MONTHS}
                <DraftNumberInput
                  min={1}
                  max={60}
                  value={draft.months}
                  fallback={1}
                  onValue={(months) => setDraft((prev) => ({ ...prev, months: Math.round(months) || 1 }))}
                  className="mt-1 font-mono"
                />
              </label>

              <div className="text-[13px] text-foreground">
                <span className="mb-1 block">{ACCUMULO_STEP1_START_MONTH}</span>
                <Select disabled={revise} value={draft.startMonth} onValueChange={(value) => setDraft((prev) => ({ ...prev, startMonth: value }))}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(revise && !monthOptions.includes(draft.startMonth) ? [draft.startMonth, ...monthOptions] : monthOptions).map((month) => (
                      <SelectItem key={month} value={month}>
                        {monthLabelLong(month)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {revise && <p className="text-[12px] text-muted-foreground">{ACCUMULO_STEP1_REVISE_NOTE}</p>}
            </div>

            {liquidity && (
              <div className="rounded-lg bg-muted p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{ACCUMULO_STEP1_L_HEADLINE}</p>
                <p className="mt-1 font-mono text-[28px] font-bold tabular-nums text-foreground">{cachedFormatCurrencyEUR(liquidity.L)}</p>
                <dl className="mt-3 space-y-1.5 text-[12px]">
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">{ACCUMULO_STEP1_L_SOURCE}</dt>
                    <dd className="font-mono tabular-nums text-foreground">{cachedFormatCurrencyEUR(liquidity.sourceCashEur)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">{ACCUMULO_STEP1_L_RESERVE}</dt>
                    <dd className="font-mono tabular-nums text-foreground">{cachedFormatCurrencyEUR(draft.liquidity.reserveEur)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">{ACCUMULO_STEP1_L_AVAILABLE}</dt>
                    <dd className="font-mono tabular-nums text-foreground">{cachedFormatCurrencyEUR(liquidity.availableNowEur)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">{ACCUMULO_STEP1_L_DISPOSALS}</dt>
                    <dd className="font-mono tabular-nums text-foreground">{cachedFormatCurrencyEUR(liquidity.disposalProceedsEur)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">{describeStep1InflowsLabel(draft.months)}</dt>
                    <dd className="font-mono tabular-nums text-foreground">{cachedFormatCurrencyEUR(liquidity.inflowTotalEur)}</dd>
                  </div>
                  <div className="flex justify-between border-t border-border pt-1.5">
                    <dt className="text-muted-foreground">{ACCUMULO_STEP1_L_MONTHLY}</dt>
                    <dd className="font-mono tabular-nums text-foreground">{cachedFormatCurrencyEUR(draft.months > 0 ? liquidity.L / draft.months : 0)}</dd>
                  </div>
                  <p className="text-[11px] text-muted-foreground">{ACCUMULO_STEP1_L_MONTHLY_NOTE}</p>
                </dl>
              </div>
            )}
          </div>
        )}

        {step === 2 && (
          <div className="grid gap-4 desktop:grid-cols-[minmax(0,1fr)_320px]">
          <div className="min-w-0 space-y-4">
            <div>
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{ACCUMULO_STEP2_FROM_LABEL}</p>
              <SegmentedPill
                options={[
                  ...(planBase ? [{ value: 'plan' as const, label: ACCUMULO_STEP2_FROM_PLAN }] : []),
                  { value: 'today' as const, label: ACCUMULO_STEP2_FROM_TODAY },
                ]}
                value={(weightsFrom ?? 'none') as 'plan' | 'today'}
                onChange={startFrom}
                layoutId="accumulo-step2-from"
                ariaLabel={ACCUMULO_STEP2_FROM_LABEL}
                semantics="radio"
                optionClassName="min-h-11 desktop:min-h-0"
              />
              {weightsFrom && <p className="mt-1.5 text-[12px] text-muted-foreground">{ACCUMULO_STEP2_FROM_HINT[weightsFrom]}</p>}
            </div>

              <>
            {candidateAssets.length === 0 ? (
              <p className="text-[13px] text-muted-foreground">{ACCUMULO_STEP2_NO_TRADABLE_ASSETS}</p>
            ) : (
              <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th scope="col" className="py-1.5 pr-2 text-[9px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{ACCUMULO_STEP2_COL_INSTRUMENT}</th>
                    <th scope="col" className="py-1.5 pr-2 text-center text-[9px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{ACCUMULO_STEP2_COL_KEEP_OR_SELL}</th>
                    <th scope="col" className="py-1.5 pr-2 text-right text-[9px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{ACCUMULO_STEP2_COL_CURRENT_WEIGHT}</th>
                    <th scope="col" className="py-1.5 pr-2 text-right text-[9px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{ACCUMULO_STEP2_COL_TARGET}</th>
                    <th scope="col" className="py-1.5 pr-2 text-right text-[9px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{ACCUMULO_STEP2_COL_TO_BUY}</th>
                    <th scope="col" className="hidden py-1.5 text-right text-[9px] font-semibold uppercase tracking-[0.08em] text-muted-foreground sm:table-cell">{ACCUMULO_STEP2_COL_PER_MONTH}</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const rendered = new Set<string>();
                    const rows: React.ReactNode[] = [];

                    for (const position of draft.positions) {
                      const grouped = position.memberAssetIds.length > 1;
                      const figures = stepTwoFigures.get(position.id);
                      orderGroupMembers(position).forEach((assetId, memberIndex) => {
                        const asset = assetsById.get(assetId);
                        if (!asset || rendered.has(assetId)) return;
                        rendered.add(assetId);
                        // The head is the member that BUYS (R1), not the first of the list.
                        const isHead = memberIndex === 0;
                        const partial = draft.disposals.find((disposal) => disposal.assetId === assetId && disposal.quantity !== undefined);
                        const locked = lockedSaleIds.has(assetId);
                        rows.push(
                          <tr key={assetId} className="border-b border-border last:border-0 align-top">
                            <th scope="row" className={`py-1.5 pr-2 text-left font-normal text-foreground ${grouped && !isHead ? 'pl-5' : ''}`}>
                              {groupingMode && !grouped ? (
                                <button
                                  type="button"
                                  aria-pressed={selectedForGroup.has(assetId)}
                                  className={`-mx-1.5 rounded-md px-1.5 py-1 text-left transition-colors ${selectedForGroup.has(assetId) ? 'bg-muted font-medium ring-1 ring-border' : 'hover:bg-muted/60'}`}
                                  onClick={() =>
                                    setSelectedForGroup((prev) => {
                                      const next = new Set(prev);
                                      if (next.has(assetId)) next.delete(assetId);
                                      else next.add(assetId);
                                      return next;
                                    })
                                  }
                                >
                                  {asset.name}
                                </button>
                              ) : (
                                asset.name
                              )}
                              <span className="block text-[11px] text-muted-foreground">
                                {grouped && !isHead ? ACCUMULO_STEP2_GROUP_NO_BUY : getAssetDisplayTicker(asset)}
                              </span>
                              {grouped && isHead && (
                                <Button variant="ghost" className="ml-2 h-11 px-1.5 text-[11px] desktop:h-6" onClick={() => ungroup(position.id)}>
                                  {ACCUMULO_ACTION_UNGROUP}
                                </Button>
                              )}
                              {isHead && !locked && (
                                // AL9: «Sostituisci» — the new buyer takes the weight, the old one stays in the group.
                                // D1: the picker opens anchored to this row, never below the table.
                                <Popover
                                  open={replacingPositionId === position.id && !newAssetDialogOpen}
                                  onOpenChange={(next) => {
                                    if (next) setReplacingPositionId(position.id);
                                    else if (!newAssetDialogOpen) setReplacingPositionId(null);
                                  }}
                                >
                                  <PopoverTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      className={`${grouped ? '' : 'ml-0 '}h-11 px-1.5 text-[11px] desktop:h-6`}
                                      aria-haspopup="dialog"
                                    >
                                      {ACCUMULO_ACTION_REPLACE}
                                    </Button>
                                  </PopoverTrigger>
                                  <PopoverContent align="start" collisionPadding={12} className="w-[min(22rem,calc(100vw-2rem))] p-3">
                                    <p className="mb-1.5 text-[12px] text-foreground">
                                      {ACCUMULO_STEP2_REPLACE_PROMPT}: {labelOfAsset(position.buyAssetId)}
                                    </p>
                                    <p className="mb-1 text-[11px] text-muted-foreground">{ACCUMULO_STEP2_REPLACE_PLACEHOLDER}</p>
                                    <ul className="max-h-64 overflow-y-auto" aria-label={ACCUMULO_STEP2_REPLACE_PROMPT}>
                                      {replacementCandidates.map((entry) => (
                                        <li key={entry.asset.id}>
                                          <button
                                            type="button"
                                            className="min-h-11 w-full rounded-md px-2 py-1.5 text-left text-[12px] text-foreground transition-colors hover:bg-muted desktop:min-h-8"
                                            onClick={() => replaceBuyer(position.id, entry.asset.id)}
                                          >
                                            {describeAddableAsset({ name: entry.asset.name, ticker: getAssetDisplayTicker(entry.asset), held: entry.held, neverBought: entry.neverBought })}
                                          </button>
                                        </li>
                                      ))}
                                    </ul>
                                    <div className="mt-2 flex flex-wrap items-center gap-2">
                                      <Button
                                        variant="outline"
                                        className="h-11 text-[12px] desktop:h-8"
                                        onClick={() => {
                                          setNewAssetFor('replace');
                                          setNewAssetDialogOpen(true);
                                        }}
                                      >
                                        {ACCUMULO_ACTION_NEW_ASSET}
                                      </Button>
                                      <Button variant="ghost" className="h-11 text-[12px] desktop:h-8" onClick={() => setReplacingPositionId(null)}>
                                        {ACCUMULO_ACTION_REPLACE_CANCEL}
                                      </Button>
                                    </div>
                                    <p className="mt-1.5 text-[11px] text-muted-foreground">{ACCUMULO_STEP2_REPLACE_HINT}</p>
                                  </PopoverContent>
                                </Popover>
                              )}
                            </th>
                            <td className="py-1.5 pr-2 text-center">
                              {grouped ? (
                                // A grouped member never sells alone — "Separa" (above, on the head
                                // row) comes first; this cell only reports the state.
                                <span className="text-muted-foreground">{ACCUMULO_STEP2_TOGGLE_IN_PLAN}</span>
                              ) : (
                                <div className="flex flex-col items-center gap-1">
                                  <KeepSellToggle
                                    sell={false}
                                    disabled={locked}
                                    onKeep={() => undefined}
                                    onSell={() => moveAssetToDisposal(asset)}
                                  />
                                  {locked ? (
                                    <span className="text-[11px] text-muted-foreground">{ACCUMULO_STEP2_ALREADY_SELLING}</span>
                                  ) : (
                                    <label className="flex items-center gap-1 text-[11px] text-muted-foreground">
                                      {ACCUMULO_STEP2_SELL_SHARES}
                                      <Input
                                        type="number"
                                        min={0}
                                        step={1}
                                        max={Math.max(0, Math.ceil(asset.quantity) - 1)}
                                        value={partial?.quantity ?? ''}
                                        onChange={(event) => setPartialSale(asset, Number(event.target.value))}
                                        className="h-11 w-20 px-2 text-right font-mono tabular-nums desktop:h-7 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                                      />
                                    </label>
                                  )}
                                </div>
                              )}
                            </td>
                            <td className="py-1.5 pr-2 text-right font-mono tabular-nums text-muted-foreground">
                              {isHead && figures ? formatPercentageIt(figures.todayPct, 1) : '—'}
                            </td>
                            <td className="py-1.5 pr-2 text-right">
                              {isHead ? (
                                <DraftNumberInput
                                  min={0}
                                  value={position.targetPercentage}
                                  fallback={0}
                                  onValue={(target) => setPositionTarget(position.id, target)}
                                  className="h-11 w-20 px-2 text-right sm:w-24 font-mono tabular-nums desktop:h-8 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                                />
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </td>
                            <td className="py-1.5 pr-2 text-right font-mono tabular-nums text-foreground">
                              {isHead && figures ? (
                                <>
                                  {cachedFormatCurrencyEUR(figures.buyEur)}
                                  <span className="block text-[11px] text-muted-foreground">{describeStep2Shares(figures.buyShares)}</span>
                                </>
                              ) : (
                                '—'
                              )}
                            </td>
                            {/* «Al mese» is «Da comprare» ÷ the months: below 640px it gives way so Target fits. */}
                            <td className="hidden py-1.5 text-right font-mono tabular-nums text-muted-foreground sm:table-cell">
                              {isHead && figures ? cachedFormatCurrencyEUR(figures.monthlyEur) : '—'}
                            </td>
                          </tr>,
                        );
                      });
                    }

                    for (const disposal of draft.disposals) {
                      const asset = assetsById.get(disposal.assetId);
                      if (!asset || rendered.has(disposal.assetId)) continue;
                      rendered.add(disposal.assetId);
                      rows.push(
                        <tr key={disposal.assetId} className="border-b border-border last:border-0">
                          <th scope="row" className="py-1.5 pr-2 text-left font-normal text-foreground">{asset.name}</th>
                          <td className="py-1.5 pr-2 text-center">
                            <KeepSellToggle
                              sell
                              disabled={lockedSaleIds.has(disposal.assetId)}
                              onKeep={() => moveAssetToPosition(asset)}
                              onSell={() => undefined}
                            />
                          </td>
                          <td className="py-1.5 pr-2 text-right font-mono tabular-nums text-muted-foreground">—</td>
                          <td className="py-1.5 pr-2 text-right text-muted-foreground">—</td>
                          <td className="py-1.5 pr-2 text-right font-mono tabular-nums text-foreground">
                            {cachedFormatCurrencyEUR(proceedsOfDisposal(disposal, asset, DEPS))}
                            {savedOpenSaleIds.has(disposal.assetId) ? (
                              <SaleMonthSelect
                                disposal={disposal}
                                firstIndex={firstRevisedIndex}
                                months={draft.months}
                                firstMonth={draft.startMonth}
                                onChange={(monthIndex) => setSaleMonth(disposal.assetId, monthIndex)}
                              />
                            ) : (
                              <span className="block text-[11px] text-muted-foreground">{ACCUMULO_STEP2_SALE_PROCEEDS}</span>
                            )}
                          </td>
                          <td className="hidden py-1.5 text-right text-muted-foreground sm:table-cell">—</td>
                        </tr>,
                      );
                    }

                    // A row keeps its place when it flips Tieni ↔ Vendi: order by first appearance.
                    const rank = (node: React.ReactNode) => {
                      const index = rowOrder.indexOf(String((node as React.ReactElement).key));
                      return index === -1 ? Number.MAX_SAFE_INTEGER : index;
                    };
                    return [...rows].sort((a, b) => rank(a) - rank(b));
                  })()}
                </tbody>
              </table>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                className="h-11 text-[12px] desktop:h-8"
                onClick={() => {
                  if (groupingMode) setSelectedForGroup(new Set());
                  setGroupingBuyAssetId(null);
                  setGroupingMode(!groupingMode);
                }}
              >
                {groupingMode ? ACCUMULO_ACTION_GROUP_CANCEL : ACCUMULO_ACTION_GROUP_PROXY}
              </Button>
              {groupingMode && (
                <Button variant="outline" className="h-11 text-[12px] desktop:h-8" disabled={selectedForGroup.size < 2} onClick={() => setGroupingBuyAssetId(selectedForGroup.values().next().value ?? null)}>
                  {ACCUMULO_STEP2_BUY_ASSET_CONFIRM}…
                </Button>
              )}
              <Button
                variant="outline"
                className="h-11 text-[12px] desktop:h-8"
                disabled={draft.positions.length === 0 || Math.abs(weightsSum - 100) < 0.05}
                onClick={() => updatePositions(redistributeRemainder(draft.positions))}
              >
                {ACCUMULO_STEP2_REDISTRIBUTE}
              </Button>
              <Button
                variant="outline"
                className="h-11 text-[12px] desktop:h-8"
                onClick={() => {
                  setNewAssetFor('add');
                  setNewAssetDialogOpen(true);
                }}
              >
                {ACCUMULO_ACTION_NEW_ASSET}
              </Button>
            </div>
            {/* AL10: an instrument from outside the draft, also one with no shares (created and left behind). */}
            {addableAssets.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[12px] text-muted-foreground">{ACCUMULO_STEP2_ADD_ASSET_LABEL}</span>
                <Select value="" onValueChange={addInstrument}>
                  <SelectTrigger className="h-11 w-full max-w-[22rem] text-[12px] desktop:h-8" aria-label={ACCUMULO_STEP2_ADD_ASSET_LABEL}>
                    <SelectValue placeholder={ACCUMULO_STEP2_ADD_ASSET_PLACEHOLDER} />
                  </SelectTrigger>
                  <SelectContent>
                    {addableAssets.map((entry) => (
                      <SelectItem key={entry.asset.id} value={entry.asset.id}>
                        {describeAddableAsset({ name: entry.asset.name, ticker: getAssetDisplayTicker(entry.asset), held: entry.held, neverBought: entry.neverBought })}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {groupingMode && groupingBuyAssetId === null && <p className="text-[12px] text-muted-foreground">{ACCUMULO_STEP2_GROUP_HINT}</p>}

            {groupingBuyAssetId !== null && (
              <div className="rounded-lg bg-muted p-3">
                <p className="mb-2 text-[12px] text-foreground">{ACCUMULO_STEP2_BUY_ASSET_PROMPT}</p>
                <div className="flex flex-wrap gap-3">
                  {Array.from(selectedForGroup).map((assetId) => {
                    const asset = assetsById.get(assetId);
                    if (!asset) return null;
                    return (
                      <label key={assetId} className="flex items-center gap-1.5 text-[12px] text-foreground">
                        <input
                          type="radio"
                          name="group-buy-asset"
                          checked={groupingBuyAssetId === assetId}
                          onChange={() => setGroupingBuyAssetId(assetId)}
                        />
                        {asset.name}
                      </label>
                    );
                  })}
                </div>
                <Button
                  className="mt-2.5 h-11 text-[12px] desktop:h-8"
                  onClick={() => {
                    confirmGroup();
                    setGroupingMode(false);
                  }}
                >
                  {ACCUMULO_STEP2_BUY_ASSET_CONFIRM}
                </Button>
              </div>
            )}
              </>

            <div className="flex items-center justify-between border-t border-border pt-2.5 text-[13px]">
              <span className="font-medium text-foreground">{ACCUMULO_STEP2_TOTAL_LABEL}</span>
              <span className={`font-mono tabular-nums ${Math.abs(weightsSum - 100) > 0.01 ? 'text-destructive' : 'text-foreground'}`}>
                {formatPercentageIt(weightsSum, 2)}
              </span>
            </div>
            {weightsMessage && <p className="text-[12px] text-destructive">{weightsMessage}</p>}
            <p className="text-[11px] text-muted-foreground">{ACCUMULO_STEP2_FOOTNOTE}</p>
          </div>
          <PlanDraftSidePanel
            preview={settledPreview}
            months={draft.months}
            band={band}
            weightsSum={weightsSum}
            targetLeverageRatio={targetLeverageRatio}
          />
          </div>
        )}

        {step === 3 && preview && (
          <div className="space-y-6">
            {/* The plan in one line is the dialog's reading (describeStep3Summary); here the
                warnings, then where it lands, the calendar and the classes month by month. */}
            {coveragePct !== null && (
              <p className="rounded-lg border border-warning-border bg-warning p-3 text-[12px] text-warning-foreground">{describeInsufficientLiquidityWarning(coveragePct)}</p>
            )}

            {preview.unpricedPositionIds.length > 0 && (
              <p className="rounded-lg border border-warning-border bg-warning p-3 text-[12px] text-warning-foreground">
                {describeUnpricedWarning(
                  preview.unpricedPositionIds.map((id) => draft.positions.find((p) => p.id === id)?.label ?? id),
                )}
              </p>
            )}

            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{ACCUMULO_STEP3_SECTION_WEIGHTS}</p>
              <div className="overflow-x-auto">
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="border-b border-border text-left">
                      {ACCUMULO_STEP3_WEIGHTS_COLUMNS.map((column, index) => (
                        <th
                          key={column}
                          scope="col"
                          className={`py-1.5 text-[9px] font-semibold uppercase tracking-[0.08em] text-muted-foreground ${index === 0 ? 'pr-3' : 'px-2 text-right'}`}
                        >
                          {column}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.outcome.positions.map((position) => {
                      const source = draft.positions.find((p) => p.id === position.positionId);
                      const asset = source ? assetsById.get(source.buyAssetId) : undefined;
                      const today = stepThreeTodayPct.get(position.positionId);
                      const off = Math.abs(position.driftPp) > 0.5;
                      return (
                        <tr key={position.positionId} className="border-b border-border last:border-0">
                          <th scope="row" className="py-2 pr-3 text-left font-normal text-foreground">
                            {position.label}
                            {asset && <span className="block text-[11px] text-muted-foreground">{getAssetDisplayTicker(asset)}</span>}
                          </th>
                          <td className="whitespace-nowrap px-2 py-2 text-right font-mono tabular-nums">
                            <span className="text-muted-foreground">{today === undefined ? '—' : formatPercentageIt(today, 1)}</span>
                            <span className="text-foreground"> → {formatPercentageIt(position.finalWeightPct, 1)}</span>
                          </td>
                          <td className="whitespace-nowrap px-2 py-2 text-right font-mono tabular-nums text-muted-foreground">{formatPercentageIt(position.targetPercentage, 1)}</td>
                          <td className={`whitespace-nowrap py-2 pl-2 text-right font-mono tabular-nums ${off ? 'text-warning-foreground' : 'text-muted-foreground'}`}>
                            {formatSignedPp(position.driftPp)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="mt-3">
                <p className="mb-1.5 text-[11px] text-muted-foreground">
                  {ACCUMULO_STEP3_SECTION_EXPOSURE} {preview.outcome.leverageRatio > 1.01 && `· leva ${formatNumberIt(preview.outcome.leverageRatio, 2)}×`}
                </p>
                <div className="flex h-2 overflow-hidden rounded-full">
                  {Object.entries(preview.outcome.implicitClassPct).map(([assetClass, pct]) => {
                    const idx = ASSET_CLASS_CHART_INDEX[assetClass] ?? 0;
                    const color = chartColors[idx] ?? CHART_COLORS[idx] ?? CHART_COLORS[0];
                    return <div key={assetClass} style={{ width: `${Math.max(0, pct)}%`, backgroundColor: color }} title={`${ASSET_CLASS_LABELS[assetClass] ?? assetClass} ${formatPercentageIt(pct, 1)}`} />;
                  })}
                </div>
              </div>
            </div>

            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Calendario</p>
              <div className="overflow-x-auto">
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="border-b border-border text-left">
                      <th scope="col" className="py-1.5 pr-2 text-[9px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{ACCUMULO_STEP3_COL_MONTH}</th>
                      {draft.positions.map((position) => {
                        const asset = assetsById.get(position.buyAssetId);
                        return (
                          <th key={position.id} scope="col" title={position.label} className="px-2 py-1.5 text-right text-[10px] font-semibold tracking-[0.04em] text-muted-foreground">
                            {asset ? getAssetDisplayTicker(asset) : position.label}
                          </th>
                        );
                      })}
                      <th scope="col" className="py-1.5 pl-2 text-right text-[9px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{ACCUMULO_STEP3_COL_TOTAL}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      const installments = preview.schedule.installments;
                      const compress = installments.length > MAX_CALENDAR_ROWS;
                      const shown = compress ? [...installments.slice(0, 5), null, installments[installments.length - 1]] : installments;
                      return shown.map((installment) => {
                        if (installment === null) {
                          return (
                            <tr key="ellipsis">
                              <td colSpan={draft.positions.length + 2} className="py-1 text-center text-muted-foreground">
                                {ACCUMULO_ELLIPSIS}
                              </td>
                            </tr>
                          );
                        }
                        const total = installment.lines.reduce((sum, line) => sum + line.plannedAmountEur, 0);
                        return (
                          <tr key={installment.index} className="border-b border-border last:border-0">
                            <th scope="row" className="whitespace-nowrap py-2 pr-2 text-left font-normal text-foreground">{monthLabelShort(installment.month)}</th>
                            {draft.positions.map((position) => {
                              const line = installment.lines.find((l) => l.positionId === position.id);
                              return (
                                <td key={position.id} className="px-2 py-2 text-right font-mono tabular-nums text-muted-foreground">
                                  {line ? formatNumberIt(line.plannedQuantity, 0) : '—'}
                                </td>
                              );
                            })}
                            <td className="whitespace-nowrap py-2 pl-2 text-right font-mono tabular-nums text-foreground">{cachedFormatCurrencyEUR(total)}</td>
                          </tr>
                        );
                      });
                    })()}
                  </tbody>
                </table>
              </div>
            </div>

            {/* The classes as a table: the chart lives in the Target step's panel and, once the plan
                is active, in «Classi del piano» — here it would only scale badly. Weight on top,
                drift in pp under it, amber out of band; classes with no weight nor target left out. */}
            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{ACCUMULO_STEP3_SECTION_CLASSES}</p>
              <div className="overflow-x-auto">
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="border-b border-border text-left">
                      <th scope="col" className="py-1.5 pr-2 text-[9px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{ACCUMULO_STEP3_COL_MONTH}</th>
                      {stepThreeClasses.map((assetClass) => {
                        const idx = ASSET_CLASS_CHART_INDEX[assetClass] ?? 0;
                        return (
                          <th
                            key={assetClass}
                            scope="col"
                            className="py-1.5 pl-2 text-right text-[9px] font-semibold uppercase tracking-[0.08em]"
                            style={{ color: chartColors[idx] ?? CHART_COLORS[idx] ?? CHART_COLORS[0] }}
                          >
                            {ASSET_CLASS_LABELS[assetClass] ?? assetClass}
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {[0, 1, 3, 6, 9, draft.months]
                      .filter((i, idx, arr) => i <= draft.months && arr.indexOf(i) === idx)
                      .map((index) => {
                        const point = preview.trajectory.find((p) => p.index === index);
                        if (!point) return null;
                        return (
                          <tr key={index} className="border-b border-border last:border-0">
                            <th scope="row" className="whitespace-nowrap py-2 pr-2 text-left font-normal text-foreground">{trajectoryPointLabel(point.month)}</th>
                            {stepThreeClasses.map((assetClass) => {
                              const data = point.byClass[assetClass as keyof typeof point.byClass];
                              if (!data) return <td key={assetClass} className="py-2 pl-2 text-right text-muted-foreground">—</td>;
                              return (
                                <td key={assetClass} className="py-2 pl-2 text-right">
                                  <div className={`font-mono tabular-nums ${data.outOfBand ? 'text-warning-foreground' : 'text-foreground'}`}>
                                    {formatPercentageIt(data.currentPct, 1)}
                                  </div>
                                  <div className="font-mono text-[11px] tabular-nums text-muted-foreground">{formatSignedPp(data.driftPp)}</div>
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </ResponsiveModal>

      {newAssetDialogOpen && (
        <AssetDialog
          open={newAssetDialogOpen}
          onClose={() => setNewAssetDialogOpen(false)}
          createEmpty
          onCreated={(assetId) => {
            if (newAssetFor === 'replace' && replacingPositionId) {
              // The page has not re-read the assets yet: the label is the pending one until it does.
              const replaced = replaceBuyAsset(draft.positions, replacingPositionId, assetId, () => ACCUMULO_STEP2_PENDING_ASSET_LABEL);
              if (replaced) updatePositions(replaced);
              setReplacingPositionId(null);
            } else {
              updatePositions([
                ...draft.positions,
                { id: crypto.randomUUID(), label: ACCUMULO_STEP2_PENDING_ASSET_LABEL, targetPercentage: 0, memberAssetIds: [assetId], buyAssetId: assetId },
              ]);
            }
            onAssetsChanged();
            setNewAssetDialogOpen(false);
          }}
        />
      )}
    </>
  );
}

/** AL11: where a saved sale not yet executed happens — any installment of the revised calendar, from the first one on. */
function SaleMonthSelect({
  disposal,
  firstIndex,
  months,
  firstMonth,
  onChange,
}: {
  disposal: PlanDisposal;
  firstIndex: number;
  months: number;
  firstMonth: string;
  onChange: (monthIndex: number) => void;
}) {
  const current = disposal.monthIndex ?? 1;
  const indexes = Array.from({ length: months }, (_, i) => firstIndex + i);
  if (!indexes.includes(current)) indexes.unshift(current);
  return (
    <label className="mt-1 flex flex-col items-end gap-0.5 text-[11px] text-muted-foreground">
      <span>
        {ACCUMULO_STEP2_SALE_MONTH} · {ACCUMULO_STEP2_SALE_NOT_EXECUTED}
      </span>
      <Select value={String(current)} onValueChange={(value) => onChange(Number(value))}>
        <SelectTrigger className="h-11 w-36 text-[12px] desktop:h-7" aria-label={ACCUMULO_STEP2_SALE_MONTH}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {indexes.map((index) => (
            <SelectItem key={index} value={String(index)}>
              {monthLabelLong(addMonths(firstMonth, index - firstIndex))}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  );
}

/** «Tieni | Vendi» — a two-state switch with its own heading in the column (RP8), never a link that renames itself. */
function KeepSellToggle({ sell, disabled, onKeep, onSell }: { sell: boolean; disabled?: boolean; onKeep: () => void; onSell: () => void }) {
  const actionColors = useActionColors();
  const base = 'min-h-11 min-w-14 rounded-md border px-2 text-[12px] font-medium desktop:min-h-7 disabled:opacity-50';
  const idle = 'border-transparent text-muted-foreground';
  // The active choice wears the Allocazione colours: Tieni = COMPRA's, Vendi = VENDI's.
  const active = (color: string) => ({
    color,
    backgroundColor: `color-mix(in srgb, ${color} ${ACTION_CHIP_FILL_PCT}%, transparent)`,
    borderColor: `color-mix(in srgb, ${color} 34%, transparent)`,
  });
  return (
    <div role="group" aria-label={ACCUMULO_STEP2_COL_KEEP_OR_SELL} className="inline-flex gap-0.5 rounded-lg bg-muted p-0.5">
      <button type="button" aria-pressed={!sell} disabled={disabled} className={`${base} ${!sell ? '' : idle}`} style={!sell ? active(actionColors.COMPRA) : undefined} onClick={onKeep}>
        {ACCUMULO_STEP2_TOGGLE_IN_PLAN}
      </button>
      <button type="button" aria-pressed={sell} disabled={disabled} className={`${base} ${sell ? '' : idle}`} style={sell ? active(actionColors.VENDI) : undefined} onClick={onSell}>
        {ACCUMULO_STEP2_TOGGLE_SELL}
      </button>
    </div>
  );
}

/**
 * A number field that can be emptied while typing: the text is the field's own, the draft gets
 * the number (`fallback` while the field is blank), and leaving a blank field shows the draft's
 * value again; focusing selects the figure, so typing replaces it. A `value` changed from outside (a «Parti da», «Distribuisci il resto») replaces
 * the text.
 */
function DraftNumberInput({
  value,
  fallback,
  onValue,
  ...props
}: Omit<React.ComponentProps<typeof Input>, 'value' | 'onChange' | 'type'> & { value: number; fallback: number; onValue: (value: number) => void }) {
  const [text, setText] = useState(String(value));
  const [seen, setSeen] = useState(value);
  if (value !== seen) {
    setSeen(value);
    if (text === '' ? value !== fallback : Number(text) !== value) setText(String(value));
  }
  return (
    <Input
      {...props}
      type="number"
      value={text}
      onChange={(event) => {
        const raw = event.target.value;
        setText(raw);
        const parsed = Number(raw);
        onValue(raw === '' || !Number.isFinite(parsed) ? fallback : parsed);
      }}
      onFocus={(event) => {
        event.target.select();
        props.onFocus?.(event);
      }}
      onBlur={(event) => {
        if (text === '') setText(String(value));
        props.onBlur?.(event);
      }}
    />
  );
}
