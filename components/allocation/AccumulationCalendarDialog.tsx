'use client';

/**
 * AccumulationCalendarDialog — the plan's whole calendar, month by month.
 *
 * `ClassDriftChart` draws the trajectory (D11: solid where measured, dashed where projected);
 * under it, one row per installment — month, total, the class drift after that rata (grey while
 * only projected), a status chip — that expands into its lines on a tap, with the SAME simplified
 * actions S4 gave the tile (mark a line executed by hand, skip it, undo a manual mark): this modal
 * keeps its own plan-calendar-only view, never ledger matching (`accumulationPlanMatching.ts` §9),
 * which lives on the tile itself. `initialExpandedIndex` (S5) lets the tile's «Rivedi» action on a
 * `lostLink` line open the modal already expanded on the rata that needs a look.
 */
import { useMemo, useState } from 'react';
import type { Asset, AssetAllocationTarget } from '@/types/assets';
import type { AccumulationPlan, Installment, InstallmentLine } from '@/types/accumulationPlan';
import { ASSET_CLASS_LABELS, type RebalanceBand } from '@/lib/utils/allocationUtils';
import { compareAllocations } from '@/lib/services/assetAllocationService';
import { installmentLineLabel, liveClassEntries, monthIndexOf, projectClassTrajectory, toMonthKey } from '@/lib/utils/accumulationPlanUtils';
import { useSetInstallmentLine } from '@/lib/hooks/useAccumulationPlan';
import { useDemoMode } from '@/lib/hooks/useDemoMode';
import { ResponsiveModal } from '@/components/ui/responsive-modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ClassDriftChart } from '@/components/allocation/ClassDriftChart';
import { cachedFormatCurrencyEUR, formatNumberIt } from '@/lib/utils/formatters';
import { describeWriteError } from '@/lib/utils/dialogNarrative';
import {
  ACCUMULO_ACTION_CANCEL,
  ACCUMULO_ACTION_MARK_EXECUTED,
  ACCUMULO_ACTION_SAVE,
  ACCUMULO_ACTION_SKIP,
  ACCUMULO_ACTION_UNDO_EXECUTED,
  ACCUMULO_CALENDAR_TITLE,
  ACCUMULO_LINE_STATUS_LABEL,
  ACCUMULO_MANUAL_AMOUNT_LABEL,
  ACCUMULO_MANUAL_QUANTITY_LABEL,
  describeAccumuloModalEyebrow,
  describeMeasuredOn,
  formatSignedPp,
  monthLabelLong,
} from '@/lib/utils/accumulationNarrative';

interface AccumulationCalendarDialogProps {
  open: boolean;
  onClose: () => void;
  plan: AccumulationPlan;
  ownerId: string;
  allAssets: Asset[];
  targets: AssetAllocationTarget;
  band: RebalanceBand;
  /** Open already expanded on this installment (the tile's «Rivedi» action on a `lostLink` line). */
  initialExpandedIndex?: number;
}

/** This modal's own simplified status (no ledger matching — see the file header); shares its
 *  labels with the tile's richer `LineUiState` (`todo` for a still-open, on-time line). */
type CalendarLineStatus = 'todo' | 'executed' | 'skipped' | 'late';

function chipStatusOf(line: InstallmentLine, installmentIndex: number, currentIndex: number): CalendarLineStatus {
  if (line.status === 'executed') return 'executed';
  if (line.status === 'skipped') return 'skipped';
  return installmentIndex < currentIndex ? 'late' : 'todo';
}

function installmentTotalEur(installment: Installment): number {
  return installment.lines.reduce((sum, line) => sum + (line.status === 'executed' ? (line.executedAmountEur ?? line.plannedAmountEur) : line.plannedAmountEur), 0);
}

export function AccumulationCalendarDialog({ open, onClose, plan, ownerId, allAssets, targets, band, initialExpandedIndex }: AccumulationCalendarDialogProps) {
  const isDemo = useDemoMode();
  const [expandedIndex, setExpandedIndex] = useState<number | null>(initialExpandedIndex ?? null);
  const [manualLine, setManualLine] = useState<{ index: number; positionId: string; qty: string; amount: string } | null>(null);
  const [writeError, setWriteError] = useState<string | null>(null);
  const setLineMutation = useSetInstallmentLine(ownerId);

  const currentIndex = monthIndexOf(plan, toMonthKey(new Date()));

  const trajectory = useMemo(
    () =>
      open
        ? projectClassTrajectory({
            plan,
            allAssets,
            installments: plan.installments,
            targets,
            band,
            compare: compareAllocations,
            currentIndex,
          })
        : [],
    [open, plan, allAssets, targets, band, currentIndex],
  );

  const measurementInput = { allAssets, targets, compare: compareAllocations, today: new Date() };

  const setStatus = async (index: number, positionId: string, status: 'skipped' | 'planned') => {
    setWriteError(null);
    try {
      await setLineMutation.mutateAsync({ planId: plan.id, index, positionId, patch: { status }, measurementInput });
    } catch (error) {
      setWriteError(describeWriteError(error));
    }
  };

  const saveManual = async () => {
    if (!manualLine) return;
    const executedQuantity = Number(manualLine.qty);
    const executedAmountEur = Number(manualLine.amount);
    if (!Number.isFinite(executedQuantity) || !Number.isFinite(executedAmountEur)) return;
    setWriteError(null);
    try {
      await setLineMutation.mutateAsync({
        planId: plan.id,
        index: manualLine.index,
        positionId: manualLine.positionId,
        patch: { status: 'executed', executedQuantity, executedAmountEur },
        measurementInput,
      });
      setManualLine(null);
    } catch (error) {
      setWriteError(describeWriteError(error));
    }
  };

  return (
    <ResponsiveModal
      open={open}
      onClose={onClose}
      width="lg"
      eyebrow={describeAccumuloModalEyebrow(plan.name)}
      title={ACCUMULO_CALENDAR_TITLE}
    >
      <div className="space-y-5">
        {writeError && (
          <p role="alert" className="text-[12px] text-destructive">
            {writeError}
          </p>
        )}
        <ClassDriftChart points={trajectory} band={band} height={180} />

        <ul className="divide-y divide-border" aria-label={ACCUMULO_CALENDAR_TITLE}>
          {plan.installments.map((installment) => {
            const point = trajectory.find((p) => p.index === installment.index);
            const isOpen = expandedIndex === installment.index;
            const allClosed = installment.lines.every((line) => line.status === 'executed' || line.status === 'skipped');
            return (
              <li key={installment.index} className="py-2.5">
                <button
                  type="button"
                  onClick={() => setExpandedIndex(isOpen ? null : installment.index)}
                  className="flex w-full items-center justify-between gap-3 text-left"
                  aria-expanded={isOpen}
                >
                  <span className="min-w-0 flex-1">
                    <span className="text-[13px] font-medium text-foreground">{monthLabelLong(installment.month)}</span>
                    {installment.measurement && (
                      <span className="ml-2 text-[11px] text-muted-foreground">{describeMeasuredOn(installment.measurement.measuredAt)}</span>
                    )}
                  </span>
                  <span className="shrink-0 font-mono text-[13px] tabular-nums text-foreground">
                    {cachedFormatCurrencyEUR(installmentTotalEur(installment))}
                  </span>
                  <span className="shrink-0 text-[11px] text-muted-foreground">
                    {allClosed ? ACCUMULO_LINE_STATUS_LABEL.executed : ACCUMULO_LINE_STATUS_LABEL.todo}
                  </span>
                </button>

                {point && (
                  <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
                    {liveClassEntries(point).map(([assetClass, data]) => (
                      <span
                        key={assetClass}
                        className={`font-mono text-[11px] tabular-nums ${point.source === 'measured' ? 'text-foreground' : 'text-muted-foreground'}`}
                      >
                        {ASSET_CLASS_LABELS[assetClass] ?? assetClass} {formatSignedPp(data.driftPp)}
                      </span>
                    ))}
                  </div>
                )}

                {isOpen && (
                  <ul className="mt-2.5 space-y-2 border-t border-border pt-2.5">
                    {installment.lines.map((line) => {
                      const status = chipStatusOf(line, installment.index, currentIndex);
                      const isManual = manualLine?.index === installment.index && manualLine.positionId === line.positionId;
                      return (
                        <li key={line.positionId} className="flex flex-col gap-1.5">
                          <div className="flex items-center justify-between gap-3">
                            <span className="min-w-0 flex-1 text-[13px] text-foreground">
                              {installmentLineLabel(line, plan.positions, (assetId) => allAssets.find((asset) => asset.id === assetId)?.name)}
                              <span className="ml-2 font-mono text-[11px] tabular-nums text-muted-foreground">
                                {formatNumberIt(line.plannedQuantity, 0)} · {cachedFormatCurrencyEUR(line.plannedAmountEur)}
                              </span>
                            </span>
                            <span className="shrink-0 text-[11px] text-muted-foreground">{ACCUMULO_LINE_STATUS_LABEL[status]}</span>
                            {!isDemo && (status === 'todo' || status === 'late') && (
                              <span className="flex shrink-0 gap-1.5">
                                <Button
                                  variant="outline"
                                  className="h-11 px-2 text-[11px] desktop:h-7"
                                  onClick={() =>
                                    setManualLine({ index: installment.index, positionId: line.positionId, qty: String(line.plannedQuantity), amount: String(line.plannedAmountEur.toFixed(2)) })
                                  }
                                >
                                  {ACCUMULO_ACTION_MARK_EXECUTED}
                                </Button>
                                <Button variant="outline" className="h-11 px-2 text-[11px] desktop:h-7" onClick={() => void setStatus(installment.index, line.positionId, 'skipped')}>
                                  {ACCUMULO_ACTION_SKIP}
                                </Button>
                              </span>
                            )}
                            {!isDemo && status === 'executed' && !line.transactionIds?.length && (
                              <Button variant="outline" className="h-11 shrink-0 px-2 text-[11px] desktop:h-7" onClick={() => void setStatus(installment.index, line.positionId, 'planned')}>
                                {ACCUMULO_ACTION_UNDO_EXECUTED}
                              </Button>
                            )}
                          </div>
                          {isManual && (
                            <div className="flex items-end gap-2 rounded-lg bg-muted p-2.5">
                              <label className="flex-1 text-[11px] text-muted-foreground">
                                {ACCUMULO_MANUAL_QUANTITY_LABEL}
                                <Input
                                  type="number"
                                  value={manualLine.qty}
                                  onChange={(event) => setManualLine({ ...manualLine, qty: event.target.value })}
                                  className="mt-1 h-8 font-mono"
                                />
                              </label>
                              <label className="flex-1 text-[11px] text-muted-foreground">
                                {ACCUMULO_MANUAL_AMOUNT_LABEL}
                                <Input
                                  type="number"
                                  value={manualLine.amount}
                                  onChange={(event) => setManualLine({ ...manualLine, amount: event.target.value })}
                                  className="mt-1 h-8 font-mono"
                                />
                              </label>
                              <Button variant="ghost" className="h-8 px-2 text-[11px]" onClick={() => setManualLine(null)}>
                                {ACCUMULO_ACTION_CANCEL}
                              </Button>
                              <Button className="h-8 px-2 text-[11px]" onClick={() => void saveManual()}>
                                {ACCUMULO_ACTION_SAVE}
                              </Button>
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </ResponsiveModal>
  );
}
