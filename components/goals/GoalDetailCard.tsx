/**
 * Expandable card for a single goal showing progress, allocation comparison,
 * and assigned assets table. Uses chevron toggle pattern (same as Settings page).
 */

'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Asset } from '@/types/assets';
import { InvestmentGoal, GoalAssetAssignment, GoalProgress } from '@/types/goals';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  ChevronDown,
  ChevronUp,
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
import { goalLinkSettle, slideDown } from '@/lib/utils/motionVariants';

interface GoalDetailCardProps {
  goal: InvestmentGoal;
  progress: GoalProgress;
  assignments: GoalAssetAssignment[];
  assets: Asset[];
  onEdit: () => void;
  onDelete: () => void;
  onAddAssignment: () => void;
  onRemoveAssignment: (assetId: string) => void;
  isActive: boolean;
  onSelect: () => void;
}

const PRIORITY_LABELS: Record<string, string> = {
  alta: 'Alta',
  media: 'Media',
  bassa: 'Bassa',
};

const PRIORITY_COLORS: Record<string, string> = {
  alta: 'text-red-600 bg-red-50 dark:bg-red-950/40 dark:text-red-400',
  media: 'text-yellow-600 bg-yellow-50 dark:bg-yellow-950/40 dark:text-yellow-400',
  bassa: 'text-green-600 bg-green-50 dark:bg-green-950/40 dark:text-green-400',
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
  isActive,
  onSelect,
}: GoalDetailCardProps) {
  const [expanded, setExpanded] = useState(false);
  const assetMap = new Map(assets.map((a) => [a.id, a]));

  useEffect(() => {
    if (isActive) {
      setExpanded(true);
    }
  }, [isActive]);

  // Format target date
  const targetDateStr = goal.targetDate
    ? new Date(goal.targetDate).toLocaleDateString('it-IT', {
        month: 'long',
        year: 'numeric',
      })
    : null;

  // Calculate remaining time
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
    <motion.div variants={goalLinkSettle} initial={false} animate={isActive ? 'settle' : 'idle'}>
    <Card className={isActive ? 'ring-1 ring-border shadow-sm' : ''}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          {/* Left: expand toggle + goal info */}
          <button
            onClick={() => {
              onSelect();
              setExpanded(!expanded);
            }}
            className="flex items-center gap-3 text-left flex-1 min-w-0"
          >
            {expanded ? (
              <ChevronUp className="h-4 w-4 text-gray-400 dark:text-gray-500 shrink-0" />
            ) : (
              <ChevronDown className="h-4 w-4 text-gray-400 dark:text-gray-500 shrink-0" />
            )}
            <div
              className="w-4 h-4 rounded-full shrink-0"
              style={{ backgroundColor: goal.color }}
            />
            <div className="min-w-0">
              <h3 className="font-semibold text-gray-900 dark:text-gray-100 truncate">
                {goal.name}
              </h3>
              <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400 mt-0.5">
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
                      <span className="text-gray-400 dark:text-gray-500">
                        ({remainingMonths} {remainingMonths === 1 ? 'mese' : 'mesi'})
                      </span>
                    )}
                  </span>
                )}
              </div>
            </div>
          </button>

          {/* Right: progress + actions */}
          <div className="flex items-center gap-3 shrink-0">
            <div className="text-right hidden sm:block">
              <p className="text-sm font-medium">
                {formatCurrency(progress.currentValue)}
              </p>
              {progress.targetAmount != null && (
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  / {formatCurrency(progress.targetAmount)}
                </p>
              )}
            </div>
            {progress.progressPercentage != null && (
              <span
                className="text-sm font-bold min-w-[50px] text-right"
                style={{ color: goal.color }}
              >
                {progress.progressPercentage.toFixed(1)}%
              </span>
            )}
          </div>
        </div>

        {/* Progress bar (only if target is set) */}
        {progress.progressPercentage != null && (
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 mt-3">
            <div
              className="h-2 rounded-full transition-all duration-300"
              style={{
                width: `${Math.min(100, progress.progressPercentage)}%`,
                backgroundColor: goal.color,
              }}
            />
          </div>
        )}
      </CardHeader>

      {/* Expanded content */}
      <AnimatePresence initial={false}>
      {expanded && (
        <motion.div
          key="expanded"
          variants={slideDown}
          initial="hidden"
          animate="visible"
          exit="exit"
        >
        <CardContent className="pt-0 space-y-4">
          {/* Mobile values (hidden on desktop, visible on mobile) */}
          <div className="sm:hidden text-sm text-gray-600 dark:text-gray-400">
            {formatCurrency(progress.currentValue)}
            {progress.targetAmount != null && (
              <> / {formatCurrency(progress.targetAmount)}</>
            )}
            {progress.remainingAmount != null && progress.remainingAmount > 0 && (
              <span className="text-gray-400 dark:text-gray-500">
                {' '}
                (mancano {formatCurrency(progress.remainingAmount)})
              </span>
            )}
          </div>

          {/* Remaining amount (desktop) */}
          {progress.remainingAmount != null && progress.remainingAmount > 0 && (
            <p className="text-sm text-gray-500 dark:text-gray-400 hidden sm:block">
              Mancano {formatCurrency(progress.remainingAmount)} per raggiungere l&apos;obiettivo
            </p>
          )}

          {/* Notes */}
          {goal.notes && (
            <p className="text-sm text-gray-600 dark:text-gray-400 italic">{goal.notes}</p>
          )}

          {/* Allocation comparison */}
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
              <p className="text-xs font-medium text-gray-600 dark:text-gray-400">
                Asset Assegnati ({assignments.length})
              </p>
              <Button variant="outline" size="sm" onClick={onAddAssignment}>
                <Plus className="mr-1 h-3 w-3" />
                Aggiungi
              </Button>
            </div>

            {assignments.length > 0 ? (
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 dark:bg-gray-900">
                    <tr>
                      <th className="text-left px-3 py-2 text-xs font-medium text-gray-500 dark:text-gray-400">
                        Asset
                      </th>
                      <th className="text-right px-3 py-2 text-xs font-medium text-gray-500 hidden sm:table-cell">
                        Valore Totale
                      </th>
                      <th className="text-right px-3 py-2 text-xs font-medium text-gray-500 dark:text-gray-400">
                        %
                      </th>
                      <th className="text-right px-3 py-2 text-xs font-medium text-gray-500 dark:text-gray-400">
                        EUR Assegnati
                      </th>
                      <th className="w-10"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                    {assignments.map((a) => {
                      const asset = assetMap.get(a.assetId);
                      if (!asset) return null;
                      const totalValue = calculateAssetValue(asset);
                      const assignedValue = (totalValue * a.percentage) / 100;

                      return (
                        <tr key={a.assetId} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                          <td className="px-3 py-2">
                            <div className="font-medium text-gray-900 dark:text-gray-100">
                              {asset.name}
                            </div>
                            <div className="text-xs text-gray-400 dark:text-gray-500">
                              {asset.ticker}
                            </div>
                          </td>
                          <td className="px-3 py-2 text-right text-gray-600 dark:text-gray-400 hidden sm:table-cell">
                            {formatCurrency(totalValue)}
                          </td>
                          <td className="px-3 py-2 text-right font-medium">
                            {a.percentage.toFixed(1)}%
                          </td>
                          <td className="px-3 py-2 text-right font-medium text-gray-900 dark:text-gray-100">
                            {formatCurrency(assignedValue)}
                          </td>
                          <td className="px-1 py-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => onRemoveAssignment(a.assetId)}
                              className="h-10 w-10 p-0"
                            >
                              <X className="h-3 w-3 text-red-500" />
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-xs text-gray-400 dark:text-gray-500 italic py-2">
                Nessun asset assegnato a questo obiettivo
              </p>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex gap-2 pt-2 border-t">
            <Button variant="outline" size="sm" onClick={onEdit}>
              <Edit className="mr-1 h-3 w-3" />
              Modifica
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (
                  window.confirm(
                    `Sei sicuro di voler eliminare l'obiettivo "${goal.name}"?`
                  )
                ) {
                  onDelete();
                }
              }}
              className="text-red-600 hover:text-red-700"
            >
              <Trash2 className="mr-1 h-3 w-3" />
              Elimina
            </Button>
          </div>
        </CardContent>
        </motion.div>
      )}
      </AnimatePresence>
    </Card>
    </motion.div>
  );
}
