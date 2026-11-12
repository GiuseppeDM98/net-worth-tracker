'use client';

/**
 * OptimizerReport / OptimizerObjectivesReport — the weight optimizer's result. `OptimizerObjectivesReport` (the per-objective report, conflicts and warnings —
 * never a weights table, whose columns differ between callers) is shared, byte for byte, between
 * `OptimizerPanel`'s "Ottimizzato" view of the PAC and Allocazione's standalone `IdealCompositionDialog`
 * (§4.3): each renders its OWN weights table (the PAC's has no € column, the standalone tool's does,
 * §4.2) and its own action below it — the PAC applies the weights to its draft, the standalone tool
 * offers "Crea un PAC con questi pesi" instead. `OptimizerReport` wraps `OptimizerObjectivesReport`
 * with the PAC's own table and "Usa questi pesi" action, unchanged from before this split.
 */
import type { ObjectiveReport, OptimizerResult } from '@/lib/utils/weightOptimizer';
import { OBJECTIVE_PRIORITY_LABELS } from '@/lib/utils/settingsNarrative';
import { formatNumberIt, formatPercentageIt } from '@/lib/utils/formatters';
import { ACCUMULO_ACTION_CANCEL } from '@/lib/utils/accumulationNarrative';
import {
  describeConflict,
  formatObjectiveAchieved,
  formatObjectiveGap,
  formatObjectiveTarget,
  describeOptimizerWarning,
  OPTIMIZER_ACTION_APPLY,
  OPTIMIZER_COL_CURRENT,
  OPTIMIZER_COL_INSTRUMENT,
  OPTIMIZER_COL_PROPOSED,
  OPTIMIZER_CONFLICTS_TITLE,
  OPTIMIZER_IDEAL_BELOW_HELD_CONFIRM,
  OPTIMIZER_REPORT_TITLE,
  OPTIMIZER_STATUS_INFEASIBLE_BOUNDS,
  OPTIMIZER_STATUS_NO_CANDIDATES,
  OPTIMIZER_WARNINGS_TITLE,
} from '@/lib/utils/weightOptimizerNarrative';
import { Button } from '@/components/ui/button';

/**
 * RO4 — the objectives as rows: name, priority chip, «target → raggiunto» in mono and a `TargetTick`
 * (the target as the hairline, the achieved value as the fill). One presentation for the standalone
 * tool, the PAC's Target step, the objectives' modal and the Obiettivi tile (from a saved snapshot).
 */
export function ObjectiveBars({ objectives }: { objectives: ObjectiveReport[] }) {
  // The class objectives are ONE row without a track (A4, render): the per-class figures are already
  // in the «Classi del piano» tile and in the weights table; here only the worst gap is said.
  const classRows = objectives.filter((objective) => objective.kind === 'class');
  const classSummary =
    classRows.length > 0
      ? {
          priority: classRows[0].priority,
          maxGapPp: Math.max(...classRows.map((objective) => Math.abs(objective.gapPp))),
        }
      : null;
  const others = objectives.filter((objective) => objective.kind !== 'class');
  const firstClassIndex = objectives.findIndex((objective) => objective.kind === 'class');

  const renderClassRow = () =>
    classSummary && (
      <li key="classes">
        <div className="flex items-baseline justify-between gap-3">
          <span className="min-w-0 text-[13px] text-foreground">
            Classi
            <PriorityChip priority={classSummary.priority} />
          </span>
          <span className="shrink-0 font-mono text-[12px] tabular-nums text-muted-foreground">scarto max {formatNumberIt(classSummary.maxGapPp, 1)} pp</span>
        </div>
      </li>
    );

  return (
    <ul className="space-y-2.5">
      {firstClassIndex === 0 && renderClassRow()}
      {others.map((objective) => {
        const target = formatObjectiveTarget(objective);
        const achieved = formatObjectiveAchieved(objective);
        return (
          <li key={objective.id}>
            <div className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 text-[13px] text-foreground">
                {objective.label}
                <PriorityChip priority={objective.priority} />
              </span>
              <span className="shrink-0 font-mono text-[12px] tabular-nums text-muted-foreground">
                {target} → <span className="font-semibold text-foreground">{achieved}</span> ({formatObjectiveGap(objective)})
              </span>
            </div>
            <ObjectiveTrack achieved={objective.achievedValue} target={objective.targetValue} ariaLabel={`${objective.label}: criterio ${target}, raggiunto ${achieved}`} />
          </li>
        );
      })}
      {firstClassIndex > 0 && renderClassRow()}
    </ul>
  );
}

/**
 * How much an objective weighs, as a chip in ink intensity (A4, the owner's pick): Essenziale a solid
 * dark pill, Alta an outlined dark one, Media a grey fill, Bassa a faint one. Theme neutrals only, so
 * the scale reads the same in every theme and never collides with the sign colours or an accent.
 */
const PRIORITY_CHIP_CLASS: Record<ObjectiveReport['priority'], string> = {
  essential: 'bg-foreground text-background',
  high: 'border border-foreground text-foreground',
  medium: 'bg-muted text-foreground',
  low: 'bg-muted/50 text-muted-foreground',
};

function PriorityChip({ priority }: { priority: ObjectiveReport['priority'] }) {
  const label = OBJECTIVE_PRIORITY_LABELS[priority];
  return (
    <span className={`ml-1.5 rounded-full px-1.5 py-px text-[10px] font-medium ${PRIORITY_CHIP_CLASS[priority]}`}>
      {label.charAt(0).toUpperCase() + label.slice(1)}
    </span>
  );
}

/**
 * The objective's track: a 4px track filled with `--hero-series` (the colour of Storico's net-worth
 * trend chart) in ONE flat colour — no warming gradient, the hairline already says where the
 * target is.
 */
function ObjectiveTrack({ achieved, target, ariaLabel }: { achieved: number; target: number; ariaLabel: string }) {
  const scaleMax = Math.max(achieved, target, 1) * 1.12;
  const fillWidth = Math.min((achieved / scaleMax) * 100, 100);
  const targetPosition = Math.min((target / scaleMax) * 100, 100);
  const progress = target > 0 ? Math.min(100, Math.max(0, Math.round((achieved / target) * 100))) : 100;
  return (
    <div className="relative mt-1 h-[10px] w-full" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} aria-label={ariaLabel}>
      <div className="absolute inset-x-0 top-[3px] h-1 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full"
          style={{ width: `${fillWidth}%`, backgroundColor: 'var(--hero-series)' }}
        />
      </div>
      <div className="absolute inset-y-0 w-px -translate-x-1/2 bg-foreground/70" style={{ left: `${targetPosition}%` }} aria-hidden="true" />
    </div>
  );
}

interface OptimizerObjectivesReportProps {
  result: OptimizerResult;
  /** Resolves a `result.warnings[].key` to the label the caller already knows (a position/candidate). */
  labelOf: (key: string) => string;
}

/** The per-objective report, conflicts and warnings — never the weights table (§4.3). */
export function OptimizerObjectivesReport({ result, labelOf }: OptimizerObjectivesReportProps) {
  return (
    <>
      {result.objectives.length > 0 && (
        <div>
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{OPTIMIZER_REPORT_TITLE}</p>
          <ObjectiveBars objectives={result.objectives} />
        </div>
      )}

      {result.conflicts.length > 0 && (
        <div>
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{OPTIMIZER_CONFLICTS_TITLE}</p>
          <ul className="space-y-1 text-[12px] text-muted-foreground">
            {result.conflicts.map((conflict) => (
              <li key={conflict.removedObjectiveId}>{describeConflict(conflict, result.objectives)}</li>
            ))}
          </ul>
        </div>
      )}

      {result.warnings.length > 0 && (
        <div>
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{OPTIMIZER_WARNINGS_TITLE}</p>
          <ul className="space-y-1 text-[12px] text-warning-foreground">
            {result.warnings.map((warning, i) => (
              <li key={i}>{describeOptimizerWarning(warning, labelOf)}</li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}

interface OptimizerReportProps {
  result: OptimizerResult;
  labelOf: (key: string) => string;
  pendingIdealConfirm: boolean;
  onApplyClick: () => void;
  onConfirmApply: () => void;
  onCancelConfirm: () => void;
}

/** The PAC's own report: weights table (no € column — a PAC position moves by QUOTA, not by a
 *  fixed euro purchase) + `OptimizerObjectivesReport` + "Usa questi pesi". */
export function OptimizerReport({
  result,
  labelOf,
  pendingIdealConfirm,
  onApplyClick,
  onConfirmApply,
  onCancelConfirm,
}: OptimizerReportProps) {
  if (result.status === 'no_candidates') {
    return <p className="text-[12px] text-muted-foreground">{OPTIMIZER_STATUS_NO_CANDIDATES}</p>;
  }
  if (result.status === 'infeasible_bounds') {
    return <p className="text-[12px] text-destructive">{OPTIMIZER_STATUS_INFEASIBLE_BOUNDS}</p>;
  }

  return (
    <>
      <table className="w-full text-[13px]">
        <thead>
          <tr className="border-b border-border text-left">
            <th scope="col" className="py-1.5 pr-2 text-[9px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              {OPTIMIZER_COL_INSTRUMENT}
            </th>
            <th scope="col" className="py-1.5 pr-2 text-right text-[9px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              {OPTIMIZER_COL_CURRENT}
            </th>
            <th scope="col" className="py-1.5 text-right text-[9px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              {OPTIMIZER_COL_PROPOSED}
            </th>
          </tr>
        </thead>
        <tbody>
          {result.weights.map((w) => (
            <tr key={w.key} className="border-b border-border last:border-0">
              <th scope="row" className="py-1.5 pr-2 text-left font-normal text-foreground">{w.label}</th>
              <td className="py-1.5 pr-2 text-right font-mono tabular-nums text-muted-foreground">{formatPercentageIt(w.currentPct, 1)}</td>
              <td className="py-1.5 text-right font-mono tabular-nums text-foreground">{formatPercentageIt(w.proposedPct, 1)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <OptimizerObjectivesReport result={result} labelOf={labelOf} />

      {pendingIdealConfirm ? (
        <div className="rounded-lg bg-muted p-3">
          <p className="text-[12px] text-foreground">{OPTIMIZER_IDEAL_BELOW_HELD_CONFIRM}</p>
          <div className="mt-2 flex gap-2">
            <Button variant="outline" className="h-11 text-[12px] desktop:h-8" onClick={onCancelConfirm}>
              {ACCUMULO_ACTION_CANCEL}
            </Button>
            <Button className="h-11 text-[12px] desktop:h-8" onClick={onConfirmApply}>
              {OPTIMIZER_ACTION_APPLY}
            </Button>
          </div>
        </div>
      ) : (
        <Button className="h-11 text-[12px] desktop:h-8" onClick={onApplyClick}>
          {OPTIMIZER_ACTION_APPLY}
        </Button>
      )}
    </>
  );
}
