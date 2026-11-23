/**
 * The model portfolio: ONE saved set of market weights
 * per instrument, the starting point of a PAC. One document per account, `modelPortfolios/{ownerId}`.
 */
import type { OptimizerSnapshot } from './optimizer';

/** One instrument of the model portfolio. */
export interface ModelPortfolioWeight {
  /** The instrument that BUYS: for a group of equivalent instruments, the buyer. */
  assetId: string;
  /** A group of equivalent instruments, the buyer included; absent = the instrument alone. */
  memberAssetIds?: string[];
  /** Market weight; Σ over the model === 100 (±0.01). */
  targetPercentage: number;
  /** True for an instrument held at 0 shares only to be evaluated. */
  candidate?: boolean;
}

export interface ModelPortfolio {
  userId: string; // ownerId (shared-account convention)
  weights: ModelPortfolioWeight[];
  origin: 'manual' | 'optimizer';
  /** The same type the PAC stores: documents the calculation the weights started from. */
  optimizerSnapshot?: OptimizerSnapshot;
  /** What the weights were computed against (`modelFingerprint`): absent on a model saved before 2026-11-12. */
  fingerprint?: string;
  updatedAt: Date;
}

/** What the caller supplies; `userId` and `updatedAt` are the service's. */
export type ModelPortfolioInput = Pick<ModelPortfolio, 'weights' | 'origin' | 'optimizerSnapshot'> & {
  /** Present = written as is instead of a new fingerprint (an instrument added to evaluate does not refresh a stale model). */
  keepFingerprint?: string | undefined;
};
