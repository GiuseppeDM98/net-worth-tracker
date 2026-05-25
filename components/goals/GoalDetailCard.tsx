/**
 * Flat list row for a single goal, expandable inline.
 * No outer Card — the parent GoalBasedInvestingTab provides the Card container.
 * Follows Trade Republic flat-row pattern: header row + progress bar + AnimatePresence body.
 */

'use client';

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Asset } from '@/types/assets';
import { InvestmentGoal, GoalAssetAssignment, GoalProgress } from '@/types/goals';
import { Button } from '@/components/ui/button';
import {
  ChevronDown,
  Edit,
  Trash2,
  Plus,
  X,
  Calendar,
  Flag,
} from 'lucide-react';
import { formatCurrency } from '@/lib/utils/formatters';
import { AllocationComparisonBar } from './AllocationComparisonBar';
import { calculateAssetValue } from '@/lib/services/assetService';
import { slideDown } from '@/lib/utils/motionVariants';

interface GoalDetailCardProps {
  goal: InvestmentGoal;
  progress: GoalProgress;
  assignments: GoalAssetAssignment[];
  assets: Asset[];
  onEdit: () => void;
  onDelete: () => void;
  onAddAssignment: () => void;
  onRemoveAssignment: (assetId: string) => void;
}

const PRIORITY_LABELS: Record<string, string> = {
  alta: 'Alta',
  media: 'Media',
  bassa: 'Bassa',
};

const PRIORITY_COLORS: Record<string, string> = {
  alta: 'text-red-600 bg-red-50 dark:bg-red-950/40 dark:text-red-400',
  media: 'text-amber-600 bg-amber-50 dark:bg-amber-950/40 dark:text-amber-400',
  bassa: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 dark:text-emerald-400',
};

export function GoalDetailCard({
  goal,
  progress,
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
    ? new Date(goal.targetDate).toLocaleDateString('it-IT', {
        month: 'long',
        year: 'numeric',
      })
    : null;

  const remainingMonths = goal.targetDate
    ? Math.max(
        0,
        Math.ceil(
          (new Date(goal.targetDate).getTime() - Date.now()) /
            (1000 * 60 * 60 * 24 * 30.44)
        )
      )
    : null;

  return (
    <div>
      {/* Row header — tap/click to expand */}
      <div className="flex items-center justify-between px-6 py-4">
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-3 text-left flex-1 min-w-0"
        >
          <ChevronDown
            className={`h-4 w-4 text-muted-foreground/60 shrink-0 transition-transform duration-200 motion-reduce:transition-none ${
              expanded ? 'rotate-180' : ''
            }`}
          />
          <div
            className="w-3 h-3 rounded-full shrink-0"
            style={{ backgroundColor: goal.color }}
          />
          <div className="min-w-0">
            <h3 className="font-semibold text-foreground truncate">{goal.name}</h3>
            <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5 flex-wrap">
              <span
                className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                  PRIORITY_COLORS[goal.priority] || ''
                }`}
              >
                <Flag className="inline h-2.5 w-2.5 mr-0.5" />
                {PRIORITY_LABELS[goal.priority]}
              </span>
              {targetDateStr && (
                <span className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  {targetDateStr}
                  {remainingMonths !== null && remainingMonths > 0 && (
                    <span className="text-muted-foreground/60">
                      ({remainingMonths} {remainingMonths === 1 ? 'mese' : 'mesi'})
                    </span>
                  )}
                </span>
              )}
            </div>
          </div>
        </button>

        {/* Right: value + progress % */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="text-right hidden desktop:block">
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
              className="text-sm font-bold font-mono tabular-nums min-w-[50px] text-right"
              style={{ color: goal.color }}
            >
              {progress.progressPercentage.toFixed(1)}%
            </span>
          )}
        </div>
      </div>

      {/* Slim progress bar directly below row header (only when target is set) */}
      {progress.progressPercentage != null && (
        <div className="px-6 pb-3">
          <div
            role="progressbar"
            aria-valuenow={Math.round(progress.progressPercentage)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`Progresso verso ${progress.goalName}`}
            className="w-full bg-muted rounded-full h-1.5"
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
            <div className="px-6 pb-5 pt-4 space-y-4 border-t border-border">
              {/* Mobile: current value (hidden at desktop:) */}
              <div className="desktop:hidden text-sm text-muted-foreground font-mono tabular-nums">
                {formatCurrency(progress.currentValue)}
                {progress.targetAmount != null && (
                  <> / {formatCurrency(progress.targetAmount)}</>
                )}
                {progress.remainingAmount != null && progress.remainingAmount > 0 && (
                  <span className="text-muted-foreground/60">
                    {' '}
                    (mancano {formatCurrency(progress.remainingAmount)})
                  </span>
                )}
              </div>

              {/* Remaining amount (desktop only) */}
              {progress.remainingAmount != null && progress.remainingAmount > 0 && (
                <p className="text-sm text-muted-foreground hidden desktop:block">
                  Mancano {formatCurrency(progress.remainingAmount)} per raggiungere l&apos;obiettivo
                </p>
              )}

              {/* Free-text notes */}
              {goal.notes && (
                <p className="text-sm text-muted-foreground italic">{goal.notes}</p>
              )}

              {/* Allocation comparison bars */}
              {goal.recommendedAllocation &&
                Object.keys(goal.recommendedAllocation).length > 0 && (
                  <AllocationComparisonBar
                    actualAllocation={progress.actualAllocation}
                    recommendedAllocation={goal.recommendedAllocation}
                  />
                )}

              {/* Assigned assets table */}
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
                  <div className="border border-border rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50">
                        <tr>
                          <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">
                            Asset
                          </th>
                          <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground hidden desktop:table-cell">
                            Valore Totale
                          </th>
                          <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground">
                            %
                          </th>
                          <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground">
                            EUR Assegnati
                          </th>
                          <th className="w-10"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {assignments.map((a) => {
                          const asset = assetMap.get(a.assetId);
                          if (!asset) return null;
                          const totalValue = calculateAssetValue(asset);
                          const assignedValue = (totalValue * a.percentage) / 100;

                          return (
                            <tr key={a.assetId} className="hover:bg-muted/30">
                              <td className="px-3 py-2">
                                <div className="font-medium text-foreground">
                                  {asset.name}
                                </div>
                                <div className="text-xs text-muted-foreground/60">
                                  {asset.ticker}
                                </div>
                              </td>
                              <td className="px-3 py-2 text-right text-muted-foreground font-mono tabular-nums hidden desktop:table-cell">
                                {formatCurrency(totalValue)}
                              </td>
                              <td className="px-3 py-2 text-right font-medium font-mono tabular-nums">
                                {a.percentage.toFixed(1)}%
                              </td>
                              <td className="px-3 py-2 text-right font-medium text-foreground font-mono tabular-nums">
                                {formatCurrency(assignedValue)}
                              </td>
                              <td className="px-1 py-2">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  type="button"
                                  onClick={() => onRemoveAssignment(a.assetId)}
                                  className="h-10 w-10 p-0"
                                >
                                  <X className="h-3 w-3 text-destructive" />
                                </Button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground/60 italic py-2">
                    Nessun asset assegnato a questo obiettivo
                  </p>
                )}
              </div>

              {/* Action buttons */}
              <div className="flex gap-2 pt-2 border-t border-border">
                <Button variant="outline" size="sm" type="button" onClick={onEdit}>
                  <Edit className="mr-1 h-3 w-3" />
                  Modifica
                </Button>
                <Button
                  variant={deleteArmed ? 'destructive' : 'outline'}
                  size="sm"
                  type="button"
                  onClick={handleDeleteClick}
                  className={
                    deleteArmed ? '' : 'text-destructive hover:text-destructive'
                  }
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
