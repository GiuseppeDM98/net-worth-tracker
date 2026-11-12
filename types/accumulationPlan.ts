import type { AssetClass, IdealAllocationSettings } from './assets';
import type { ConflictReport, ObjectiveReport, OptimizerMode } from '@/lib/utils/weightOptimizer';

export type AccumulationPlanStatus = 'draft' | 'active' | 'completed' | 'cancelled';
export type InstallmentLineStatus = 'planned' | 'executed' | 'skipped';

/** 'YYYY-MM' in Italy time. */
export type MonthKey = string;

/** One target weight: a single instrument, or a proxy group sharing one weight. */
export interface PlanPosition {
  id: string;               // stable inside the plan (crypto.randomUUID())
  label: string;            // defaults to the buy asset's name
  targetPercentage: number; // % of the plan base B; Σ over positions === 100 (±0.01)
  memberAssetIds: string[]; // length 1 = single instrument, ≥ 2 = proxy group
  buyAssetId: string;       // ∈ memberAssetIds; the ONLY member that receives buys
}

/** A held tradable instrument left out of the plan: sold in month 1, proceeds into L. */
export interface PlanDisposal {
  assetId: string;
  /** Shares to sell (integer > 0); absent = every share held at activation (RP2). */
  quantity?: number;
  /** Installment index of the sale; absent = 1. A revision (RP4) sets it to the first revised month. */
  monthIndex?: number;
  estimatedProceedsEur: number; // quantity × price (or the whole position's value) when the plan is activated
  status: InstallmentLineStatus;
  transactionIds?: string[];    // ledger `sell` ids linked on confirmation
  executedAmountEur?: number;
}

export interface PlanLiquidity {
  sourceCashAssetIds: string[]; // assets with assetClass === 'cash' (any allocationRole)
  reserveEur: number;           // ≥ 0, never touched
  monthlyInflowEur: number;     // E ≥ 0, recurring every month
}

export interface InstallmentLine {
  positionId: string;
  assetId: string;              // always the position's buyAssetId
  plannedQuantity: number;      // integer ≥ 0
  priceEurAtPlan: number;       // unit price in EUR used for the plan
  plannedAmountEur: number;     // plannedQuantity × priceEurAtPlan (NOT the raw share)
  status: InstallmentLineStatus;
  transactionIds?: string[];
  executedQuantity?: number;
  executedAmountEur?: number;   // Σ quantity × priceEur of linked buys, fees excluded
}

/** What Allocazione measured when an installment was closed (D11). */
export interface ClassMeasurement {
  measuredAt: Date;
  classNotionalEur: Partial<Record<AssetClass, number>>; // notional € per class (tradable + frozen base)
  marketBaseEur: number;                                  // AllocationResult.marketValue
}

export interface Installment {
  index: number;                // 1..N
  month: MonthKey;
  lines: InstallmentLine[];
  carryInEur: Record<string, number>; // positionId → carry entering this month (planning trace)
  confirmedAt?: Date;           // set when every line is executed or skipped
  measurement?: ClassMeasurement;
  /** The recalibration the reader declined for the current figures (RP3): the proposal comes back only if they change. */
  recalibrationDismissed?: { quantities: Record<string, number> };
}

/** One «Rivedi il piano» (RP4): what the plan said before the revision. */
export interface PlanRevision {
  at: Date;
  fromIndex: number;
  before: { months: number; monthlyInflowEur: number; reserveEur: number };
}

export interface PlanBaseline {
  capturedAt: Date;
  positionValuesEur: Record<string, number>; // positionId → market value at activation
  sourceCashEur: number;
  pricesEur: Record<string, number>;         // assetId → unit EUR price at activation
  measurement: ClassMeasurement;             // month 0 of the trajectory
}

/** Where the Target step's weights came from, the last time the weight optimizer ran
 *. Stamped by "Usa questi pesi"; stays after the reader
 *  edits a weight by hand — it documents the starting point, not the current one. */
export interface OptimizerSnapshot {
  computedAt: Date;
  mode: OptimizerMode;
  settingsUsed: IdealAllocationSettings;
  weights: Array<{ key: string; proposedPct: number }>;
  objectives: ObjectiveReport[];
  /** The calculation's conflicts (model portfolio, A2): the Obiettivi tile quotes the first. Absent on older snapshots. */
  conflicts?: ConflictReport[];
  /** Only mode 'targeted': the tax cap and the
   *  «Non vendere» keys the weights were computed with. */
  taxCapEur?: number;
  lockedKeys?: string[];
}

export interface AccumulationPlan {
  id: string;
  userId: string;               // ownerId (shared-account convention)
  name: string;
  status: AccumulationPlanStatus;
  startMonth: MonthKey;
  months: number;               // N, integer 1..60
  liquidity: PlanLiquidity;
  positions: PlanPosition[];
  disposals: PlanDisposal[];
  baseline?: PlanBaseline;      // present from 'active'
  installments: Installment[];  // empty in 'draft', the S1 calendar from 'active'
  residualEur?: number;         // planned leftover after the last month (< one share)
  optimizerSnapshot?: OptimizerSnapshot;
  revisions?: PlanRevision[];
  createdAt: Date;
  updatedAt: Date;
  activatedAt?: Date;
  closedAt?: Date;
}

/** Draft input edited by the dialog (no system fields). */
export type AccumulationPlanDraft = Pick<
  AccumulationPlan,
  'name' | 'startMonth' | 'months' | 'liquidity' | 'positions' | 'disposals' | 'optimizerSnapshot'
>;
