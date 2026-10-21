/**
 * The model portfolio: ONE saved set of market weights
 * per instrument, the starting point of a PAC. One document per account, `modelPortfolios/{ownerId}`.
 */
import type { OptimizerSnapshot } from '@/types/accumulationPlan';

/** One instrument of the model portfolio. */
export interface ModelPortfolioWeight {
  /** The instrument that BUYS: for a group of equivalent instruments, the buyer (AL16). */
  assetId: string;
  /** AL16 — a group of equivalent instruments, the buyer included; absent = the instrument alone. */
  memberAssetIds?: string[];
  /** Market weight; Σ over the model === 100 (±0.01). */
  targetPercentage: number;
  /** True for an instrument held at 0 shares only to be evaluated (PO10, D7). */
  candidate?: boolean;
}

export interface ModelPortfolio {
  userId: string; // ownerId (shared-account convention)
  weights: ModelPortfolioWeight[];
  origin: 'manual' | 'optimizer';
  /** The same type the PAC stores: documents the calculation the weights started from. */
  optimizerSnapshot?: OptimizerSnapshot;
  updatedAt: Date;
}

/** What the caller supplies; `userId` and `updatedAt` are the service's. */
export type ModelPortfolioInput = Pick<ModelPortfolio, 'weights' | 'origin' | 'optimizerSnapshot'>;
