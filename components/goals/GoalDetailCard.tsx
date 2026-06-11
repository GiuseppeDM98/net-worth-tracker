/**
 * Flat list row for a single goal, expandable inline.
 * No outer Card — the parent GoalBasedInvestingTab provides the Card container.
 *
 * Redesign: the row is now centered on trajectory, not just a progress bar. At rest it shows
 * the on-track verdict chip (A3) and, for dated goals, the required vs planned monthly
 * contribution. Expanded reveals the trajectory breakdown + a projection glide-path chart (B2),
 * the allocation comparison, and the assigned assets as a flat divide-y list (A6 — no nested
 * table). Verdict + priority colors are token-driven (A5); the goal's own color stays as
 * identity on the dot / bar / projection line.
 */

'use client';

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Asset } from '@/types/assets';
import { InvestmentGoal, GoalAssetAssignment, GoalProgress } from '@/types/goals';
import { GoalTrajectory } from '@/lib/utils/goalTrajectory';
import { Button } from '@/components/ui/button';
import { ChevronDown, Edit, Trash2, Plus, X, Calendar } from 'lucide-react';
import { formatCurrency } from '@/lib/utils/formatters';
import { AllocationComparisonBar } from './AllocationComparisonBar';
import { GoalProjectionChart } from './GoalProjectionChart';
import { calculateAssetValue } from '@/lib/services/assetService';
import { slideDown } from '@/lib/utils/motionVariants';
import {
  VERDICT_META,
  PRIORITY_META,
  formatShortMonthYear,
} from './goalVerdictMeta';

interface GoalDetailCardProps {
  goal: InvestmentGoal;
  progress: GoalProgress;
  trajectory: GoalTrajectory;
  assignments: GoalAssetAssignment[];
  assets: Asset[];
  onEdit: () => void;
  onDelete: () => void;
  onAddAssignment: () => void;
  onRemoveAssignment: (assetId: string) => void;
}

/** Flat trajectory row inside the expanded body. */
function TrajectoryRow({
  label,
  value,
  valueClass,
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="flex items-center justify-between py-2">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className={`text-sm font-medium font-mono tabular-nums ${valueClass ?? 'text-foreground'}`}>
        {value}
      </span>
    </div>
  );
}

export function GoalDetailCard({
  goal,
  progress,
  trajectory,
  assignments,
  assets,
  onEdit,
  onDelete,
  onAddAssignment,
  onRemoveAssignment,
}: GoalDetailCardProps) {
  const [expanded, setExpanded] = useState(false);
  // 2-click delete pattern: first click arms, second click confirms, 3s auto-disarm
  const [deleteArmed, setDeleteArmed] = useState(false);
  const deleteTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const prefersReducedMotion = useReducedMotion();
  const assetMap = new Map(assets.map((a) => [a.id, a]));

  useEffect(() => {
    if (!deleteArmed) return;
    deleteTimerRef.current = setTimeout(() => setDeleteArmed(false), 3000);
    return () => {
      if (deleteTimerRef.current) clearTimeout(deleteTimerRef.current);
    };
  }, [deleteArmed]);

  const handleDeleteClick = () => {
    if (deleteArmed) {
      if (deleteTimerRef.current) clearTimeout(deleteTimerRef.current);
      setDeleteArmed(false);
      onDelete();
    } else {
      setDeleteArmed(true);
    }
  };

  const targetDateStr = goal.targetDate
    ? new Date(goal.targetDate).toLocaleDateString('it-IT', { month: 'long', year: 'numeric' })
    : null;

  const verdictMeta = VERDICT_META[trajectory.verdict];
  const showVerdict = trajectory.verdict !== 'noTarget';
  const required = trajectory.requiredMonthlyContribution;
  const current = trajectory.currentMonthlyContribution;
  // At-rest pace hint only for dated, not-yet-reached goals.
  const showPaceHint =
    (trajectory.verdict === 'onTrack' || trajectory.verdict === 'offTrack') && required != null;

  return (
    <div>
      {/* Row header — tap/click to expand */}
      <div className="flex items-center justify-between gap-3 px-6 py-4">
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded(!expanded)}
          className="flex flex-1 items-center gap-3 text-left min-w-0"
        >
          <ChevronDown
            className={`h-4 w-4 text-muted-foreground/60 shrink-0 transition-transform duration-200 motion-reduce:transition-none ${
              expanded ? 'rotate-180' : ''
            }`}
          />
          <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: goal.color }} />
          <div className="min-w-0">
            <h3 className="font-semibold text-foreground truncate">{goal.name}</h3>
            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
              <span
                className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${PRIORITY_META[goal.priority].chipClass}`}
              >
                {PRIORITY_META[goal.priority].label}
              </span>
              {showVerdict && (
                <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${verdictMeta.chipClass}`}>
                  {verdictMeta.label}
                </span>
              )}
              {targetDateStr && (
                <span className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  {targetDateStr}
                </span>
              )}
            </div>
          </div>
        </button>

        {/* Right: value + progress % */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="hidden text-right desktop:block">
            <p className="text-sm font-medium font-mono tabular-nums">
              {formatCurrency(progress.currentValue)}
            </p>
            {progress.targetAmount != null && (
              <p className="text-xs text-muted-foreground">
                / {formatCurrency(progress.targetAmount)}
              </p>
            )}
          </div>
          {progress.progressPercentage != null && (
            <span
              className="min-w-[50px] text-right text-sm font-bold font-mono tabular-nums"
              style={{ color: goal.color }}
            >
              {progress.progressPercentage.toFixed(1)}%
            </span>
          )}
        </div>
      </div>

      {/* Slim progress bar (only when target is set) */}
      {progress.progressPercentage != null && (
        <div className="px-6 pb-2.5">
          <div
            role="progressbar"
            aria-valuenow={Math.round(progress.progressPercentage)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`Progresso verso ${progress.goalName}`}
            className="h-1.5 w-full rounded-full bg-muted"
          >
            <div
              className="h-1.5 rounded-full transition-all duration-300"
              style={{
                width: `${Math.min(100, progress.progressPercentage)}%`,
                backgroundColor: goal.color,
              }}
            />
          </div>
        </div>
      )}

      {/* At-rest pace hint: required vs planned monthly contribution (A3) */}
      {showPaceHint && (
        <div className="px-6 pb-3 text-xs">
          <span
            className={
              trajectory.verdict === 'offTrack' ? 'text-destructive' : 'text-muted-foreground'
            }
          >
            Richiede{' '}
            <span className="font-mono font-medium tabular-nums">
              {formatCurrency(required!)}/mese
            </span>
          </span>
          <span className="text-muted-foreground/60">
            {' · '}versi{' '}
            <span className="font-mono tabular-nums">{formatCurrency(current)}/mese</span>
          </span>
        </div>
      )}

      {/* Expanded body */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            key="expanded"
            variants={slideDown}
            initial="hidden"
            animate="visible"
            exit="exit"
            transition={prefersReducedMotion ? { duration: 0 } : undefined}
          >
            <div className="space-y-4 border-t border-border px-6 pb-5 pt-4">
              {/* Mobile: current value (hidden at desktop:) */}
              <div className="font-mono text-sm tabular-nums text-muted-foreground desktop:hidden">
                {formatCurrency(progress.currentValue)}
                {progress.targetAmount != null && <> / {formatCurrency(progress.targetAmount)}</>}
                {progress.remainingAmount != null && progress.remainingAmount > 0 && (
                  <span className="text-muted-foreground/60">
                    {' '}
                    (mancano {formatCurrency(progress.remainingAmount)})
                  </span>
                )}
              </div>

              {/* Free-text notes */}
              {goal.notes && <p className="text-sm italic text-muted-foreground">{goal.notes}</p>}

              {/* Trajectory breakdown (B1) — only meaningful when a target is set */}
              {progress.targetAmount != null && (
                <div className="divide-y divide-border rounded-xl border border-border px-3.5">
                  {progress.remainingAmount != null && progress.remainingAmount > 0 && (
                    <TrajectoryRow
                      label="Ancora da raggiungere"
                      value={formatCurrency(progress.remainingAmount)}
                    />
                  )}
                  <TrajectoryRow
                    label="Contributo pianificato / mese"
                    value={current > 0 ? formatCurrency(current) : 'Non impostato'}
                    valueClass={current > 0 ? undefined : 'text-muted-foreground/60'}
                  />
                  {required != null && (
                    <TrajectoryRow
                      label="Contributo richiesto / mese"
                      value={formatCurrency(required)}
                      valueClass={
                        trajectory.verdict === 'offTrack' ? 'text-destructive' : 'text-positive'
                      }
                    />
                  )}
                  <TrajectoryRow
                    label="Completamento previsto"
                    value={trajectory.projectedDate ? formatShortMonthYear(trajectory.projectedDate) : '—'}
                    valueClass={trajectory.projectedDate ? undefined : 'text-muted-foreground/60'}
                  />
                  <TrajectoryRow
                    label="Rendimento atteso"
                    value={`${trajectory.annualReturn.toFixed(1)}%`}
                    valueClass="text-muted-foreground"
                  />
                </div>
              )}

              {/* Projection chart (B2) */}
              {progress.targetAmount != null && (
                <GoalProjectionChart
                  input={{
                    currentValue: progress.currentValue,
                    targetAmount: progress.targetAmount,
                    targetDate: goal.targetDate,
                    monthlyContribution: goal.monthlyContribution,
                    recommendedAllocation: goal.recommendedAllocation,
                  }}
                  color={goal.color}
                />
              )}

              {/* Allocation comparison bars */}
              {goal.recommendedAllocation &&
                Object.keys(goal.recommendedAllocation).length > 0 && (
                  <AllocationComparisonBar
                    actualAllocation={progress.actualAllocation}
                    recommendedAllocation={goal.recommendedAllocation}
                  />
                )}

              {/* Assigned assets — flat divide-y list (A6) */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-muted-foreground">
                    Asset Assegnati ({assignments.length})
                  </p>
                  <Button variant="outline" size="sm" type="button" onClick={onAddAssignment}>
                    <Plus className="mr-1 h-3 w-3" />
                    Aggiungi
                  </Button>
                </div>

                {assignments.length > 0 ? (
                  <ul className="divide-y divide-border rounded-xl border border-border">
                    {assignments.map((a) => {
                      const asset = assetMap.get(a.assetId);
                      if (!asset) return null;
                      const totalValue = calculateAssetValue(asset);
                      const assignedValue = (totalValue * a.percentage) / 100;

                      return (
                        <li key={a.assetId} className="flex items-center gap-3 px-3.5 py-2.5">
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-foreground">
                              {asset.name}
                            </p>
                            <p className="font-mono text-[11px] text-muted-foreground/70">
                              {asset.ticker}
                            </p>
                          </div>
                          <div className="shrink-0 text-right">
                            <p className="font-mono text-sm font-medium tabular-nums text-foreground">
                              {formatCurrency(assignedValue)}
                            </p>
                            <p className="font-mono text-[11px] tabular-nums text-muted-foreground">
                              {a.percentage.toFixed(1)}% del valore
                            </p>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            type="button"
                            onClick={() => onRemoveAssignment(a.assetId)}
                            className="h-9 w-9 shrink-0 p-0"
                            aria-label={`Rimuovi ${asset.name} da ${goal.name}`}
                          >
                            <X className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="py-2 text-xs italic text-muted-foreground/60">
                    Nessun asset assegnato a questo obiettivo
                  </p>
                )}
              </div>

              {/* Action buttons */}
              <div className="flex gap-2 border-t border-border pt-2">
                <Button variant="outline" size="sm" type="button" onClick={onEdit}>
                  <Edit className="mr-1 h-3 w-3" />
                  Modifica
                </Button>
                <Button
                  variant={deleteArmed ? 'destructive' : 'outline'}
                  size="sm"
                  type="button"
                  onClick={handleDeleteClick}
                  className={deleteArmed ? '' : 'text-destructive hover:text-destructive'}
                >
                  <Trash2 className="mr-1 h-3 w-3" />
                  {deleteArmed ? 'Conferma eliminazione' : 'Elimina'}
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
