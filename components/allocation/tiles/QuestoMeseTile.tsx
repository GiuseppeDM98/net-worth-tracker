'use client';

/**
 * QuestoMeseTile — «cosa compro questo mese?» (doc/pac-ottimizzatore § RV1, doc/pac-ate.md §10.2).
 *
 * The left half of Allocazione's Accumulo tab: the plan's own installment. It used to be the first
 * half of `AccumuloTile`, which also drew the class strip — now `ClassiDelPianoTile`; the
 * loading/failed/none states moved up to `AccumuloTab`, which owns the plan read and the verdict
 * (the tile no longer carries a reading of its own: the tab's verdict IS the reading). Three
 * states remain, all with a plan: `draft`, `active`, `done`. Every figure comes from
 * `accumulationPlanUtils.ts`, every word from `accumulationNarrative.ts`.
 *
 * The ledger matching (§9) arrives as `matchResult`: a `planned` line's state is the richer
 * `LineUiState` (`todo`/`toConfirm`/`late`), with the actions §10.2 punto 4 lists per state —
 * `toConfirm` → Conferma · Ignora (Ignora is a session-local dismiss only, never a write),
 * `executed` (ledger-linked) → Scollega, `late` → the manual actions, `lostLink` → Rivedi (opens the
 * Calendario on that rata). `todo`/`skipped` carry no action, on purpose: the tile nudges towards
 * recording the trade in the Registro rather than pre-empting it by hand. The same vocabulary
 * covers the disposals («Vendite fuori piano»).
 */
import { useMemo, useRef, useState } from 'react';
import type { Asset, AssetAllocationTarget } from '@/types/assets';
import type { AccumulationPlan } from '@/types/accumulationPlan';
import type { RebalanceBand } from '@/lib/utils/allocationUtils';
import {
  computeUsableLiquidity,
  summarizeReserve,
  buildRegisteredLinePatch,
  findFirstIntactInstallment,
  projectPlanOutcome,
  recalibrateInstallment,
  recalibrationQuantities,
  resolvePositionStates,
  shouldProposeRecalibration,
} from '@/lib/utils/accumulationPlanUtils';
import type { LineMatch, LineUiState } from '@/lib/utils/accumulationPlanMatching';
import { isPlanDone } from '@/lib/utils/accumuloSummary';
import { compareAllocations } from '@/lib/services/assetAllocationService';
import { getAssetDisplayTicker } from '@/lib/utils/assetDisplay';
import {
  useActivatePlan,
  useApplyRecalibration,
  useDismissRecalibration,
  useClosePlan,
  useDeleteDraftPlan,
  useSetDisposal,
  useSetInstallmentLine,
} from '@/lib/hooks/useAccumulationPlan';
import { validateDraftAgainstAssets } from '@/lib/utils/accumulationPlanSchema';
import { toast } from 'sonner';
import { useDemoMode } from '@/lib/hooks/useDemoMode';
import { useArmedDelete } from '@/lib/hooks/useArmedDelete';
import { Tile, TILE_SUB_EYEBROW_CLASS } from '@/components/ui/tile';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NarrativeText } from '@/components/ui/narrative-text';
import { AccumulationPlanDialog } from '@/components/allocation/AccumulationPlanDialog';
import { AccumulationCalendarDialog } from '@/components/allocation/AccumulationCalendarDialog';
import { TransactionDialog } from '@/components/assets/TransactionDialog';
import { DEPS, DraftBox, ROW_ACTION_CLASS, ROW_UNDO_CLASS, LineStateChip, TILE_ACTION_CLASS, effectiveLineState } from '@/components/allocation/tiles/accumuloShared';
import { cachedFormatCurrencyEUR, formatNumberIt } from '@/lib/utils/formatters';
import { armedActionLabel, describeWriteError } from '@/lib/utils/dialogNarrative';
import {
  ACCUMULO_ACTION_ACTIVATE,
  ACCUMULO_ACTION_CALENDAR,
  ACCUMULO_ACTION_CANCEL,
  ACCUMULO_ACTION_CLOSE,
  ACCUMULO_ACTION_CLOSE_VERB,
  ACCUMULO_ACTION_CONFIRM,
  ACCUMULO_ACTION_DELETE_DRAFT,
  ACCUMULO_ACTION_DELETE_DRAFT_VERB,
  ACCUMULO_ACTION_EDIT,
  ACCUMULO_ACTION_IGNORE_MATCH,
  ACCUMULO_ACTION_MARK_EXECUTED,
  ACCUMULO_ACTION_APPLY,
  ACCUMULO_ACTION_KEEP_AS_IS,
  ACCUMULO_ACTION_REGISTER,
  ACCUMULO_ACTION_REVISE,
  ACCUMULO_ACTION_REVIEW,
  ACCUMULO_ACTION_SAVE,
  ACCUMULO_ACTION_SKIP,
  ACCUMULO_ACTION_STOP,
  ACCUMULO_ACTION_STOP_VERB,
  ACCUMULO_ACTION_UNDO_EXECUTED,
  ACCUMULO_ACTION_UNLINK,
  ACCUMULO_DISPOSALS_SECTION_TITLE,
  ACCUMULO_DONE_BOX_DRIFT,
  ACCUMULO_DONE_BOX_EXECUTED,
  ACCUMULO_DONE_BOX_RESIDUAL,
  ACCUMULO_DRAFT_BOX_DISPOSALS,
  ACCUMULO_DRAFT_BOX_INFLOWS,
  ACCUMULO_DRAFT_BOX_LIQUIDITY,
  ACCUMULO_DRAFT_BOX_POSITIONS,
  ACCUMULO_LINE_STATUS_LABEL,
  describeMatchNote,
  describeMonthTileAside,
  ACCUMULO_MANUAL_AMOUNT_LABEL,
  ACCUMULO_MANUAL_QUANTITY_LABEL,
  ACCUMULO_MONTH_TILE_DONE_EYEBROW,
  ACCUMULO_MONTH_TILE_DRAFT_EYEBROW,
  ACCUMULO_MONTH_TILE_EYEBROW,
  describeAccumulationOutcomeFooter,
  describeMonthsBarCaption,
  describeMonthReading,
  describePriceChangeNotice,
  describeRegisterNote,
  describeRegisterSaleNote,
  describeReserveWarning,
} from '@/lib/utils/accumulationNarrative';

interface QuestoMeseTileProps {
  ownerId: string;
  /** The open plan (`draft`, `active` or finished): the tab handles «no plan». */
  plan: AccumulationPlan;
  allAssets: Asset[];
  targets: AssetAllocationTarget;
  band: RebalanceBand;
  /** deriveTargetLeverageRatio(targets) — threaded to the editor's preview. */
  targetLeverageRatio: number;
  /** `monthIndexOf(plan, today)`, from `useOpenAccumuloPlan`. */
  currentIndex: number;
  /** The ledger matching of the plan, computed once by the tab (its verdict reads the same states). */
  matchResult: { matches: LineMatch[]; lineStates: Record<string, LineUiState> };
  onAssetsChanged: () => void;
}

export function QuestoMeseTile({
  ownerId,
  plan,
  allAssets,
  targets,
  band,
  targetLeverageRatio,
  currentIndex,
  matchResult,
  onAssetsChanged,
}: QuestoMeseTileProps) {
  const isDemo = useDemoMode();

  const [planDialogOpen, setPlanDialogOpen] = useState(false);
  const [reviseOpen, setReviseOpen] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calendarFocusIndex, setCalendarFocusIndex] = useState<number | undefined>(undefined);
  const [registerTarget, setRegisterTarget] = useState<
    { kind: 'line'; installmentIndex: number; positionId: string } | { kind: 'disposal'; assetId: string } | null
  >(null);
  const [manualLine, setManualLine] = useState<{ installmentIndex: number; positionId: string; qty: string; amount: string } | null>(null);
  const [manualDisposal, setManualDisposal] = useState<{ assetId: string; amount: string } | null>(null);
  const [ignoredMatches, setIgnoredMatches] = useState<Set<string>>(new Set());

  const deleteDraftRef = useRef<HTMLButtonElement>(null);
  const stopRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const deleteDraftMutation = useDeleteDraftPlan(ownerId);
  const closeMutation = useClosePlan(ownerId);
  const activateMutation = useActivatePlan(ownerId);
  const setLineMutation = useSetInstallmentLine(ownerId);
  const setDisposalMutation = useSetDisposal(ownerId);
  const applyRecalibrationMutation = useApplyRecalibration(ownerId);
  const dismissRecalibrationMutation = useDismissRecalibration(ownerId);

  const deleteDraftArmed = useArmedDelete(deleteDraftRef, () => {
    void deleteDraftMutation.mutateAsync(plan.id);
  });
  const stopArmed = useArmedDelete(stopRef, () => {
    void closeMutation.mutateAsync({ planId: plan.id, status: 'cancelled' });
  });
  const closeArmed = useArmedDelete(closeRef, () => {
    void closeMutation.mutateAsync({ planId: plan.id, status: 'completed' });
  });

  const assetsById = useMemo(() => new Map(allAssets.map((asset) => [asset.id, asset])), [allAssets]);

  const measurementInput = { allAssets, targets, compare: compareAllocations, today: new Date() };

  const setStatus = async (installmentIndex: number, positionId: string, status: 'skipped' | 'planned') => {
    await setLineMutation.mutateAsync({ planId: plan.id, index: installmentIndex, positionId, patch: { status }, measurementInput });
  };

  const saveManual = async () => {
    if (!manualLine) return;
    const executedQuantity = Number(manualLine.qty);
    const executedAmountEur = Number(manualLine.amount);
    if (!Number.isFinite(executedQuantity) || !Number.isFinite(executedAmountEur)) return;
    await setLineMutation.mutateAsync({
      planId: plan.id,
      index: manualLine.installmentIndex,
      positionId: manualLine.positionId,
      patch: { status: 'executed', executedQuantity, executedAmountEur },
      measurementInput,
    });
    setManualLine(null);
  };

  /** §9's «Conferma»: link the proposed ledger trades and close the line. */
  const confirmMatch = async (installmentIndex: number, positionId: string, match: LineMatch) => {
    await setLineMutation.mutateAsync({
      planId: plan.id,
      index: installmentIndex,
      positionId,
      patch: { status: 'executed', transactionIds: match.transactionIds, executedQuantity: match.quantity, executedAmountEur: match.amountEur },
      measurementInput,
    });
  };

  /** §10.2 punto 4's «Scollega»: undo a ledger-linked confirmation, clearing its transaction ids. */
  const unlinkLine = async (installmentIndex: number, positionId: string) => {
    await setLineMutation.mutateAsync({
      planId: plan.id,
      index: installmentIndex,
      positionId,
      patch: { status: 'planned', transactionIds: undefined, executedQuantity: undefined, executedAmountEur: undefined },
      measurementInput,
    });
  };

  const confirmDisposalMatch = async (assetId: string, match: LineMatch) => {
    await setDisposalMutation.mutateAsync({
      planId: plan.id,
      assetId,
      patch: { status: 'executed', transactionIds: match.transactionIds, executedAmountEur: match.amountEur },
    });
  };

  const unlinkDisposal = async (assetId: string) => {
    await setDisposalMutation.mutateAsync({
      planId: plan.id,
      assetId,
      patch: { status: 'planned', transactionIds: undefined, executedAmountEur: undefined },
    });
  };

  const setDisposalStatus = async (assetId: string, status: 'skipped' | 'planned') => {
    await setDisposalMutation.mutateAsync({ planId: plan.id, assetId, patch: { status } });
  };

  const saveManualDisposal = async () => {
    if (!manualDisposal) return;
    const executedAmountEur = Number(manualDisposal.amount);
    if (!Number.isFinite(executedAmountEur)) return;
    await setDisposalMutation.mutateAsync({ planId: plan.id, assetId: manualDisposal.assetId, patch: { status: 'executed', executedAmountEur } });
    setManualDisposal(null);
  };

  const openCalendarOn = (installmentIndex: number) => {
    setCalendarFocusIndex(installmentIndex);
    setCalendarOpen(true);
  };

  /** RP5: the «Registra» dialog's prefill for the targeted line or sale, and what it links when the trade is saved. */
  const registerSubject = (() => {
    if (!registerTarget) return null;
    if (registerTarget.kind === 'line') {
      const installment = plan.installments.find((i) => i.index === registerTarget.installmentIndex);
      const line = installment?.lines.find((l) => l.positionId === registerTarget.positionId);
      const asset = line ? assetsById.get(line.assetId) : undefined;
      if (!installment || !line || !asset) return null;
      const sources = plan.liquidity.sourceCashAssetIds.map((id) => assetsById.get(id)).filter((a): a is Asset => !!a);
      const source = sources.find((a) => DEPS.valueOf(a) >= line.plannedAmountEur) ?? sources[0];
      return {
        asset,
        prefill: {
          type: 'buy' as const,
          quantity: line.plannedQuantity,
          linkedCashAssetId: source?.id,
          note: describeRegisterNote(plan.name, installment.index, plan.months),
        },
      };
    }
    const disposal = plan.disposals.find((d) => d.assetId === registerTarget.assetId);
    const asset = assetsById.get(registerTarget.assetId);
    if (!disposal || !asset) return null;
    const sources = plan.liquidity.sourceCashAssetIds.map((id) => assetsById.get(id)).filter((a): a is Asset => !!a);
    return {
      asset,
      prefill: {
        type: 'sell' as const,
        quantity: disposal.quantity ?? asset.quantity,
        linkedCashAssetId: sources[0]?.id,
        note: describeRegisterSaleNote(plan.name),
      },
    };
  })();

  const handleRegistered = async (result: { transactionId: string }, data: { quantity: number }, priceEur: number) => {
    if (!registerTarget) return;
    const amount = data.quantity * priceEur;
    try {
      if (registerTarget.kind === 'line') {
        const installmentIndex = registerTarget.installmentIndex;
        await setLineMutation.mutateAsync({
          planId: plan.id,
          index: installmentIndex,
          positionId: registerTarget.positionId,
          patch: buildRegisteredLinePatch(result.transactionId, data.quantity, priceEur),
          measurementInput,
        });
      } else {
        await setDisposalMutation.mutateAsync({
          planId: plan.id,
          assetId: registerTarget.assetId,
          patch: { status: 'executed', transactionIds: [result.transactionId], executedAmountEur: amount },
        });
      }
    } catch (error) {
      // The trade is saved; only the link failed — the matching proposes it again from the ledger.
      toast.error(describeWriteError(error));
    }
  };

  const registerDialog = registerSubject && (
    <TransactionDialog
      open
      onClose={() => setRegisterTarget(null)}
      asset={registerSubject.asset}
      prefill={registerSubject.prefill}
      onCreated={(result, data, priceEur) => void handleRegistered(result, data, priceEur)}
    />
  );

  const planDialog = planDialogOpen && (
    <AccumulationPlanDialog
      open={planDialogOpen}
      onClose={() => setPlanDialogOpen(false)}
      ownerId={ownerId}
      plan={plan}
      allAssets={allAssets}
      targets={targets}
      band={band}
      targetLeverageRatio={targetLeverageRatio}
      onAssetsChanged={onAssetsChanged}
      onSaved={() => setPlanDialogOpen(false)}
    />
  );

  const reviseDialog = reviseOpen && (
    <AccumulationPlanDialog
      open={reviseOpen}
      onClose={() => setReviseOpen(false)}
      ownerId={ownerId}
      plan={plan}
      revise
      allAssets={allAssets}
      targets={targets}
      band={band}
      targetLeverageRatio={targetLeverageRatio}
      onAssetsChanged={onAssetsChanged}
      onSaved={() => setReviseOpen(false)}
    />
  );

  const calendarDialog = calendarOpen && (
    <AccumulationCalendarDialog
      open={calendarOpen}
      onClose={() => { setCalendarOpen(false); setCalendarFocusIndex(undefined); }}
      plan={plan}
      ownerId={ownerId}
      allAssets={allAssets}
      targets={targets}
      band={band}
      initialExpandedIndex={calendarFocusIndex}
    />
  );

  // ── draft ────────────────────────────────────────────────────────────────
  if (plan.status === 'draft') {
    const liquidity = computeUsableLiquidity(plan.liquidity, assetsById, plan.disposals, plan.months, DEPS);
    const draftIssues = validateDraftAgainstAssets(plan, assetsById);

    const handleActivate = async () => {
      try {
        await activateMutation.mutateAsync({
          planId: plan.id,
          input: { allAssets, targets, compare: compareAllocations, deps: DEPS, today: new Date() },
        });
      } catch (error) {
        toast.error(describeWriteError(error));
      }
    };

    return (
      <>
        <Tile eyebrow={ACCUMULO_MONTH_TILE_DRAFT_EYEBROW}>
          <div className="mt-3 grid grid-cols-2 gap-3 tablet:grid-cols-4">
            <DraftBox label={ACCUMULO_DRAFT_BOX_LIQUIDITY} value={cachedFormatCurrencyEUR(liquidity.availableNowEur)} />
            <DraftBox label={ACCUMULO_DRAFT_BOX_DISPOSALS} value={cachedFormatCurrencyEUR(liquidity.disposalProceedsEur)} />
            <DraftBox label={ACCUMULO_DRAFT_BOX_INFLOWS} value={cachedFormatCurrencyEUR(liquidity.inflowTotalEur)} />
            <DraftBox label={ACCUMULO_DRAFT_BOX_POSITIONS} value={`${plan.positions.length}`} />
          </div>
          <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-border pt-3.5">
            <Button
              ref={deleteDraftRef}
              variant="outline"
              className={TILE_ACTION_CLASS}
              disabled={isDemo}
              onClick={deleteDraftArmed.onClick}
              onBlur={deleteDraftArmed.onBlur}
            >
              {deleteDraftArmed.armed ? armedActionLabel(ACCUMULO_ACTION_DELETE_DRAFT_VERB) : ACCUMULO_ACTION_DELETE_DRAFT}
            </Button>
            <Button variant="outline" className={TILE_ACTION_CLASS} onClick={() => setPlanDialogOpen(true)}>
              {ACCUMULO_ACTION_EDIT}
            </Button>
            <Button className={TILE_ACTION_CLASS} disabled={isDemo || draftIssues.length > 0} onClick={() => void handleActivate()}>
              {ACCUMULO_ACTION_ACTIVATE}
            </Button>
          </div>
        </Tile>
        {planDialog}
      </>
    );
  }

  // ── active / done ────────────────────────────────────────────────────────
  const done = isPlanDone(plan, currentIndex);
  const states = resolvePositionStates(plan.positions, assetsById, DEPS, plan.disposals);
  const outcome = projectPlanOutcome(states, plan.installments, plan.residualEur ?? 0, assetsById, plan.positions, DEPS);

  if (done) {
    const closedCount = plan.installments.filter((installment) => installment.lines.every((line) => line.status !== 'planned')).length;
    const avgAbsDrift = outcome.positions.length > 0 ? outcome.positions.reduce((sum, p) => sum + Math.abs(p.driftPp), 0) / outcome.positions.length : 0;

    return (
      <>
        <Tile eyebrow={ACCUMULO_MONTH_TILE_DONE_EYEBROW}>
          <div className="mt-3 grid grid-cols-3 gap-3">
            <DraftBox label={ACCUMULO_DONE_BOX_EXECUTED} value={`${closedCount} / ${plan.months}`} />
            <DraftBox label={ACCUMULO_DONE_BOX_RESIDUAL} value={cachedFormatCurrencyEUR(outcome.residualEur)} />
            <DraftBox label={ACCUMULO_DONE_BOX_DRIFT} value={formatNumberIt(avgAbsDrift, 1) + ' pp'} />
          </div>
          <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-border pt-3.5">
            <Button variant="outline" className={TILE_ACTION_CLASS} onClick={() => { setCalendarFocusIndex(undefined); setCalendarOpen(true); }}>
              {ACCUMULO_ACTION_CALENDAR}
            </Button>
            <Button
              ref={closeRef}
              className={TILE_ACTION_CLASS}
              disabled={isDemo}
              onClick={closeArmed.onClick}
              onBlur={closeArmed.onBlur}
            >
              {closeArmed.armed ? armedActionLabel(ACCUMULO_ACTION_CLOSE_VERB) : ACCUMULO_ACTION_CLOSE}
            </Button>
          </div>
        </Tile>
        {calendarDialog}
      </>
    );
  }

  // ── active ───────────────────────────────────────────────────────────────
  const currentInstallment = plan.installments.find((installment) => installment.index === currentIndex);
  const lateLines = plan.installments
    .filter((installment) => installment.index < currentIndex)
    .flatMap((installment) => installment.lines.filter((line) => line.status === 'planned').map((line) => ({ installment, line })));
  const currentLines = currentInstallment ? currentInstallment.lines.filter((line) => line.plannedQuantity > 0 || line.status !== 'planned') : [];

  const { sourceCashEur: planSourceCashEur, belowReserve } = summarizeReserve(plan.liquidity, assetsById, DEPS);

  const maxDrift = outcome.maxDriftPositionId
    ? { label: outcome.positions.find((p) => p.positionId === outcome.maxDriftPositionId)?.label ?? '', deltaPp: outcome.maxAbsDriftPp }
    : null;

  const monthsClosed = plan.installments.filter((installment) => installment.lines.every((line) => line.status !== 'planned')).length;
  const monthsCaption = describeMonthsBarCaption({
    startMonth: plan.startMonth,
    endMonth: plan.installments[plan.installments.length - 1]?.month ?? plan.startMonth,
    closedCount: monthsClosed,
    totalMonths: plan.months,
  });

  // RP3: the open installment's recalibration, proposed in the tile whenever the figures move.
  const recalibration = currentInstallment ? recalibrateInstallment(plan, currentIndex, assetsById, DEPS) : null;
  const proposal =
    currentInstallment && recalibration && shouldProposeRecalibration(recalibration, currentInstallment.recalibrationDismissed)
      ? {
          result: recalibration,
          reading: describePriceChangeNotice({
            lines: recalibration.lines.map((line) => ({
              // The notice names instruments by ticker, as the render does («9 VWCE invece di 10»).
              label: (() => {
                const position = plan.positions.find((p) => p.id === line.positionId);
                const buyAsset = position ? assetsById.get(position.buyAssetId) : undefined;
                return buyAsset ? getAssetDisplayTicker(buyAsset) : (position?.label ?? line.positionId);
              })(),
              plannedQuantity: line.plannedQuantity,
              suggestedQuantity: line.suggestedQuantity,
            })),
            plannedTotalEur: recalibration.plannedTotalEur,
            suggestedTotalEur: recalibration.suggestedTotalEur,
          }),
        }
      : null;

  const applyProposal = async () => {
    if (!proposal) return;
    try {
      await applyRecalibrationMutation.mutateAsync({ planId: plan.id, index: currentIndex, lines: proposal.result.lines });
    } catch (error) {
      toast.error(describeWriteError(error));
    }
  };

  const dismissProposal = async () => {
    if (!proposal) return;
    try {
      await dismissRecalibrationMutation.mutateAsync({
        planId: plan.id,
        index: currentIndex,
        quantities: recalibrationQuantities(proposal.result),
      });
    } catch (error) {
      toast.error(describeWriteError(error));
    }
  };

  // The month's own reading: the lines of the open installment still waiting to be registered.
  const openMonthLines = currentLines.filter((line) => {
    const state = effectiveLineState(matchResult.lineStates[`${currentIndex}:${line.positionId}`] ?? 'todo', `${currentIndex}:${line.positionId}`, ignoredMatches, false);
    return state === 'todo' || state === 'toConfirm' || state === 'late';
  });
  const monthReading = describeMonthReading(
    openMonthLines.length,
    openMonthLines.reduce((sum, line) => sum + line.plannedAmountEur, 0),
  );

  return (
    <>
      <Tile
        eyebrow={ACCUMULO_MONTH_TILE_EYEBROW}
        reading={monthReading}
        aside={describeMonthTileAside(currentInstallment?.month ?? plan.startMonth, Math.min(Math.max(currentIndex, 1), plan.months), plan.months)}
      >
        {belowReserve && (
          <p className="mt-2 text-[12px] text-warning-foreground">
            <NarrativeText
              segments={describeReserveWarning({ sourceCashEur: planSourceCashEur, reserveEur: plan.liquidity.reserveEur, belowReserve: true }) ?? []}
              className="inline"
            />
          </p>
        )}

        {proposal && (
          <div className="mt-3 rounded-lg border border-warning-border bg-warning p-3">
            <NarrativeText segments={proposal.reading} className="text-[12px] leading-[1.5] text-warning-foreground" />
            {!isDemo && (
              <div className="mt-2 flex flex-wrap gap-2">
                <Button className={ROW_ACTION_CLASS} disabled={applyRecalibrationMutation.isPending} onClick={() => void applyProposal()}>
                  {ACCUMULO_ACTION_APPLY}
                </Button>
                <Button variant="outline" className={ROW_ACTION_CLASS} disabled={dismissRecalibrationMutation.isPending} onClick={() => void dismissProposal()}>
                  {ACCUMULO_ACTION_KEEP_AS_IS}
                </Button>
              </div>
            )}
          </div>
        )}

        <div className="mt-3 min-w-0">
        {/* Lines of the current installment, late lines first (§10.2 point 4). */}
        <ul className="divide-y divide-border">
          {[...lateLines.map(({ installment, line }) => ({ installmentIndex: installment.index, line })), ...currentLines.map((line) => ({ installmentIndex: currentIndex, line }))].map(
            ({ installmentIndex, line }) => {
              const key = `${installmentIndex}:${line.positionId}`;
              const isLateRow = installmentIndex < currentIndex;
              const status = effectiveLineState(matchResult.lineStates[key] ?? 'todo', key, ignoredMatches, isLateRow);
              const match = matchResult.matches.find((m) => m.kind === 'installment' && m.index === installmentIndex && m.positionId === line.positionId);
              const isManual = manualLine?.installmentIndex === installmentIndex && manualLine.positionId === line.positionId;
              const asset = assetsById.get(line.assetId);
              return (
                <li key={key} className="py-2">
                  {/* The name takes the room and wraps (never cut — fork-scelte-ui.md § 1); the state
                      and its actions stack at the right on a phone and sit in one line from
                      `desktop:`. A wrapping row put «Scollega» on a line of its own at 390. */}
                  <div className="flex items-center gap-3">
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-2 break-words text-[13px] text-foreground">
                        {plan.positions.find((p) => p.id === line.positionId)?.label ?? asset?.name ?? line.positionId}
                      </span>
                      <span className="mt-0.5 block font-mono text-[11px] tabular-nums text-muted-foreground">
                        {asset && `${getAssetDisplayTicker(asset)} · `}
                        {formatNumberIt(line.plannedQuantity, 0)} · {cachedFormatCurrencyEUR(line.plannedAmountEur)}
                      </span>
                    </span>
                    <div className="flex shrink-0 flex-col items-end gap-1 desktop:flex-row desktop:items-center desktop:gap-3">
                    <LineStateChip state={status} label={ACCUMULO_LINE_STATUS_LABEL[status]} />
                    {!isDemo && status === 'toConfirm' && match && (
                      <span className="flex shrink-0 gap-1.5">
                        <Button
                          variant="outline"
                          className={ROW_ACTION_CLASS}
                          onClick={() => setIgnoredMatches((prev) => new Set(prev).add(key))}
                        >
                          {ACCUMULO_ACTION_IGNORE_MATCH}
                        </Button>
                        <Button className={ROW_ACTION_CLASS} onClick={() => void confirmMatch(installmentIndex, line.positionId, match)}>
                          {ACCUMULO_ACTION_CONFIRM}
                        </Button>
                      </span>
                    )}
                    {!isDemo && (status === 'todo' || status === 'late') && (
                      <Button
                        className={ROW_ACTION_CLASS}
                        onClick={() => setRegisterTarget({ kind: 'line', installmentIndex, positionId: line.positionId })}
                      >
                        {ACCUMULO_ACTION_REGISTER}
                      </Button>
                    )}
                    {!isDemo && status === 'late' && (
                      <span className="flex shrink-0 gap-1.5">
                        <Button
                          variant="outline"
                          className={ROW_ACTION_CLASS}
                          onClick={() =>
                            setManualLine({
                              installmentIndex,
                              positionId: line.positionId,
                              qty: String(line.plannedQuantity),
                              amount: line.plannedAmountEur.toFixed(2),
                            })
                          }
                        >
                          {ACCUMULO_ACTION_MARK_EXECUTED}
                        </Button>
                        <Button variant="outline" className={ROW_ACTION_CLASS} onClick={() => void setStatus(installmentIndex, line.positionId, 'skipped')}>
                          {ACCUMULO_ACTION_SKIP}
                        </Button>
                      </span>
                    )}
                    {!isDemo && status === 'executed' && !!line.transactionIds?.length && (
                      <Button variant="ghost" className={ROW_UNDO_CLASS} onClick={() => void unlinkLine(installmentIndex, line.positionId)}>
                        {ACCUMULO_ACTION_UNLINK}
                      </Button>
                    )}
                    {!isDemo && status === 'executed' && !line.transactionIds?.length && (
                      <Button variant="ghost" className={ROW_UNDO_CLASS} onClick={() => void setStatus(installmentIndex, line.positionId, 'planned')}>
                        {ACCUMULO_ACTION_UNDO_EXECUTED}
                      </Button>
                    )}
                    {!isDemo && status === 'lostLink' && (
                      <Button variant="outline" className={ROW_ACTION_CLASS} onClick={() => openCalendarOn(installmentIndex)}>
                        {ACCUMULO_ACTION_REVIEW}
                      </Button>
                    )}
                  </div>
                  </div>
                  {status === 'toConfirm' && match && (
                    <p className="mt-1 text-[11px] text-muted-foreground">{describeMatchNote(match.quantity, match.amountEur)}</p>
                  )}
                  {isManual && (
                    <div className="mt-1.5 flex items-end gap-2 rounded-lg bg-muted p-2.5">
                      <label className="flex-1 text-[11px] text-muted-foreground">
                        {ACCUMULO_MANUAL_QUANTITY_LABEL}
                        <Input type="number" value={manualLine.qty} onChange={(event) => setManualLine({ ...manualLine, qty: event.target.value })} className="mt-1 h-11 font-mono desktop:h-8" />
                      </label>
                      <label className="flex-1 text-[11px] text-muted-foreground">
                        {ACCUMULO_MANUAL_AMOUNT_LABEL}
                        <Input type="number" value={manualLine.amount} onChange={(event) => setManualLine({ ...manualLine, amount: event.target.value })} className="mt-1 h-11 font-mono desktop:h-8" />
                      </label>
                      <Button variant="ghost" className={ROW_ACTION_CLASS} onClick={() => setManualLine(null)}>
                        {ACCUMULO_ACTION_CANCEL}
                      </Button>
                      <Button className={ROW_ACTION_CLASS} onClick={() => void saveManual()}>
                        {ACCUMULO_ACTION_SAVE}
                      </Button>
                    </div>
                  )}
                </li>
              );
            },
          )}
        </ul>

        {/* Disposals — held instruments left out of the plan, sold at month 1 (D5, §9's disposal matching). */}
        {plan.disposals.length > 0 && (
          <div className="mt-3">
            <p className={TILE_SUB_EYEBROW_CLASS}>{ACCUMULO_DISPOSALS_SECTION_TITLE}</p>
            <ul className="mt-1.5 divide-y divide-border">
              {plan.disposals.map((disposal) => {
                const key = `disposal:${disposal.assetId}`;
                const isLateRow = currentIndex > 1;
                const status = effectiveLineState(matchResult.lineStates[key] ?? 'todo', key, ignoredMatches, isLateRow);
                const match = matchResult.matches.find((m) => m.kind === 'disposal' && m.assetId === disposal.assetId);
                const isManual = manualDisposal?.assetId === disposal.assetId;
                const asset = assetsById.get(disposal.assetId);
                return (
                  <li key={key} className="py-2">
                    <div className="flex items-center gap-3">
                      <span className="min-w-0 flex-1">
                        <span className="line-clamp-2 break-words text-[13px] text-foreground">{asset?.name ?? disposal.assetId}</span>
                        <span className="mt-0.5 block font-mono text-[11px] tabular-nums text-muted-foreground">
                          {asset && `${getAssetDisplayTicker(asset)} · `}
                          {disposal.quantity !== undefined && `${formatNumberIt(disposal.quantity, 0)} quote · `}
                          {cachedFormatCurrencyEUR(disposal.executedAmountEur ?? disposal.estimatedProceedsEur)}
                        </span>
                      </span>
                      <div className="flex shrink-0 flex-col items-end gap-1 desktop:flex-row desktop:items-center desktop:gap-3">
                      <LineStateChip state={status} label={ACCUMULO_LINE_STATUS_LABEL[status]} />
                      {!isDemo && status === 'toConfirm' && match && (
                        <span className="flex shrink-0 gap-1.5">
                          <Button
                            variant="outline"
                            className={ROW_ACTION_CLASS}
                            onClick={() => setIgnoredMatches((prev) => new Set(prev).add(key))}
                          >
                            {ACCUMULO_ACTION_IGNORE_MATCH}
                          </Button>
                          <Button className={ROW_ACTION_CLASS} onClick={() => void confirmDisposalMatch(disposal.assetId, match)}>
                            {ACCUMULO_ACTION_CONFIRM}
                          </Button>
                        </span>
                      )}
                      {!isDemo && (status === 'todo' || status === 'late') && (
                        <Button className={ROW_ACTION_CLASS} onClick={() => setRegisterTarget({ kind: 'disposal', assetId: disposal.assetId })}>
                          {ACCUMULO_ACTION_REGISTER}
                        </Button>
                      )}
                      {!isDemo && status === 'late' && (
                        <span className="flex shrink-0 gap-1.5">
                          <Button
                            variant="outline"
                            className={ROW_ACTION_CLASS}
                            onClick={() => setManualDisposal({ assetId: disposal.assetId, amount: disposal.estimatedProceedsEur.toFixed(2) })}
                          >
                            {ACCUMULO_ACTION_MARK_EXECUTED}
                          </Button>
                          <Button variant="outline" className={ROW_ACTION_CLASS} onClick={() => void setDisposalStatus(disposal.assetId, 'skipped')}>
                            {ACCUMULO_ACTION_SKIP}
                          </Button>
                        </span>
                      )}
                      {!isDemo && status === 'executed' && !!disposal.transactionIds?.length && (
                        <Button variant="ghost" className={ROW_UNDO_CLASS} onClick={() => void unlinkDisposal(disposal.assetId)}>
                          {ACCUMULO_ACTION_UNLINK}
                        </Button>
                      )}
                      {!isDemo && status === 'executed' && !disposal.transactionIds?.length && (
                        <Button variant="ghost" className={ROW_UNDO_CLASS} onClick={() => void setDisposalStatus(disposal.assetId, 'planned')}>
                          {ACCUMULO_ACTION_UNDO_EXECUTED}
                        </Button>
                      )}
                      {/* lostLink: no Calendario surface for disposals — the only recovery is unlinking. */}
                      {!isDemo && status === 'lostLink' && (
                        <Button variant="outline" className={ROW_ACTION_CLASS} onClick={() => void unlinkDisposal(disposal.assetId)}>
                          {ACCUMULO_ACTION_UNLINK}
                        </Button>
                      )}
                    </div>
                    </div>
                    {status === 'toConfirm' && match && (
                      <p className="mt-1 text-[11px] text-muted-foreground">{describeMatchNote(match.quantity, match.amountEur)}</p>
                    )}
                    {isManual && (
                      <div className="mt-1.5 flex items-end gap-2 rounded-lg bg-muted p-2.5">
                        <label className="flex-1 text-[11px] text-muted-foreground">
                          {ACCUMULO_MANUAL_AMOUNT_LABEL}
                          <Input
                            type="number"
                            value={manualDisposal.amount}
                            onChange={(event) => setManualDisposal({ ...manualDisposal, amount: event.target.value })}
                            className="mt-1 h-11 font-mono desktop:h-8"
                          />
                        </label>
                        <Button variant="ghost" className={ROW_ACTION_CLASS} onClick={() => setManualDisposal(null)}>
                          {ACCUMULO_ACTION_CANCEL}
                        </Button>
                        <Button className={ROW_ACTION_CLASS} onClick={() => void saveManualDisposal()}>
                          {ACCUMULO_ACTION_SAVE}
                        </Button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
        </div>

        {/* Months bar (§10.2 point 3): one 3px segment per month. A closed month takes the theme's
            progress fill (`--progress-fill`, the foreground by default, mid slate in Lime Frost —
            «no near-black bar anywhere», doc/guide/fork-scelte-ui.md § 2). */}
        <div className="mt-3 flex gap-[3px]" role="img" aria-label={monthsCaption}>
          {plan.installments.map((installment) => {
            const hasLate = installment.index < currentIndex && installment.lines.some((line) => line.status === 'planned');
            const closed = installment.lines.every((line) => line.status !== 'planned');
            const isCurrent = installment.index === currentIndex;
            return (
              <div
                key={installment.index}
                className={`h-[3px] flex-1 rounded-full ${hasLate ? 'bg-destructive' : closed ? 'bg-[var(--progress-fill)]' : isCurrent ? 'bg-muted-foreground/60' : 'bg-muted'}`}
              />
            );
          })}
        </div>
        <p className="mt-1.5 font-mono text-[10px] tabular-nums text-muted-foreground">{monthsCaption}</p>


        <div className="mt-auto border-t border-border pt-3.5">
          <NarrativeText segments={describeAccumulationOutcomeFooter({ maxDrift, residualEur: outcome.residualEur, reserve: { eur: plan.liquidity.reserveEur, intact: !belowReserve } })} className="text-[11px] leading-[1.5] text-muted-foreground" />
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <Button variant="outline" className={TILE_ACTION_CLASS} onClick={() => { setCalendarFocusIndex(undefined); setCalendarOpen(true); }}>
              {ACCUMULO_ACTION_CALENDAR}
            </Button>
            <Button variant="outline" className={TILE_ACTION_CLASS} disabled={isDemo || !findFirstIntactInstallment(plan)} onClick={() => setReviseOpen(true)}>
              {ACCUMULO_ACTION_REVISE}
            </Button>
            <Button
              ref={stopRef}
              variant="outline"
              className={TILE_ACTION_CLASS}
              disabled={isDemo}
              onClick={stopArmed.onClick}
              onBlur={stopArmed.onBlur}
            >
              {stopArmed.armed ? armedActionLabel(ACCUMULO_ACTION_STOP_VERB) : ACCUMULO_ACTION_STOP}
            </Button>
          </div>
        </div>
      </Tile>

      {calendarDialog}
      {registerDialog}
      {reviseDialog}
    </>
  );
}
