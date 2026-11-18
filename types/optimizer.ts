/**
 * The weight optimizer's types that other types store: the mode, the reports of a run and the snapshot a
 * plan or the model portfolio keeps of the run it started from. Here, not in `lib/utils/weightOptimizer.ts`,
 * so `types/accumulationPlan.ts` and `types/modelPortfolio.ts` import nothing from `lib/` (2026-11-12).
 */
import type { IdealAllocationSettings, ObjectivePriority } from './assets';

export type OptimizerMode = 'reachable' | 'ideal' | 'targeted';

export interface ObjectiveReport {
  id: string; // e.g. 'class:equity', 'factor:equity:Momentum', 'leverage', 'group:<id>'
  kind: 'class' | 'factor' | 'leverage' | 'group';
  label: string; // Italian, from the narrative module
  priority: ObjectivePriority;
  targetValue: number; // pp or ×, as displayed
  achievedValue: number;
  gapPp: number; // signed, in pp (leverage: 1 pp = 0.01×)
}

export interface ConflictReport {
  removedObjectiveId: string;
  improvements: Array<{ objectiveId: string; fromGapPp: number; toGapPp: number }>;
}

/** Where the Target step's weights came from, the last time the weight optimizer ran. Stamped by «Usa
 *  questi pesi»; stays after the reader edits a weight by hand — it documents the starting point, not the
 *  current one. */
export interface OptimizerSnapshot {
  computedAt: Date;
  mode: OptimizerMode;
  settingsUsed: IdealAllocationSettings;
  weights: Array<{ key: string; proposedPct: number }>;
  objectives: ObjectiveReport[];
  /** The calculation's conflicts: the Obiettivi tile quotes the first. Absent on older snapshots. */
  conflicts?: ConflictReport[];
  /** «Con vendite mirate» only: the tax cap in euro and the «Non vendere» boxes of the run. */
  taxCapEur?: number;
  lockedKeys?: string[];
}
