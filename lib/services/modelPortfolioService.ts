/**
 * MODEL PORTFOLIO SERVICE (client SDK) — persistence of the PAC's model portfolio: ONE document per account,
 * `modelPortfolios/{ownerId}`, with the fingerprint of what its weights were computed against.
 *
 * Client SDK, `db` from `@/lib/firebase/config`, on the `accumulationPlanService.ts` model. A failed
 * validation or a missing rule is thrown with `userFacingError`, so `describeWriteError` shows the
 * sentence instead of a generic Firestore message (the rule is deployed by hand, see the guide).
 */
import { deleteDoc, doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { toDate } from '@/lib/utils/dateHelpers';
import { removeUndefinedDeep } from '@/lib/utils/firestoreData';
import { userFacingError } from '@/lib/utils/dialogNarrative';
import { modelFingerprint, validateModelWeights, type ModelBasis } from '@/lib/utils/modelPortfolio';
import type { OptimizerSnapshot } from '@/types/optimizer';
import type { Asset } from '@/types/assets';
import type { ModelPortfolio, ModelPortfolioInput, ModelPortfolioWeight } from '@/types/modelPortfolio';

export const MODEL_PORTFOLIOS_COLLECTION = 'modelPortfolios';

function toOptimizerSnapshot(data: Record<string, unknown> | undefined): OptimizerSnapshot | undefined {
  if (!data) return undefined;
  return {
    computedAt: toDate(data.computedAt as never),
    mode: data.mode as OptimizerSnapshot['mode'],
    settingsUsed: data.settingsUsed as OptimizerSnapshot['settingsUsed'],
    weights: (data.weights ?? []) as OptimizerSnapshot['weights'],
    objectives: (data.objectives ?? []) as OptimizerSnapshot['objectives'],
    ...(Array.isArray(data.conflicts) ? { conflicts: data.conflicts as NonNullable<OptimizerSnapshot['conflicts']> } : {}),
  };
}

/** The owner's model portfolio, or `null` when none was saved yet. */
export async function getModelPortfolio(ownerId: string): Promise<ModelPortfolio | null> {
  const snapshot = await getDoc(doc(db, MODEL_PORTFOLIOS_COLLECTION, ownerId));
  if (!snapshot.exists()) return null;
  const data = snapshot.data() as Record<string, unknown>;
  return {
    userId: data.userId as string,
    weights: (data.weights ?? []) as ModelPortfolioWeight[],
    origin: data.origin === 'optimizer' ? 'optimizer' : 'manual',
    optimizerSnapshot: toOptimizerSnapshot(data.optimizerSnapshot as Record<string, unknown> | undefined),
    // Never validated: a stale model must still load.
    ...(typeof data.fingerprint === 'string' ? { fingerprint: data.fingerprint } : {}),
    updatedAt: toDate(data.updatedAt as never),
  };
}

/**
 * Replaces the model. Refuses Σ ≠ 100 ± 0,01, an unknown asset and what the model never holds. The fingerprint
 * is the basis's, unless the input keeps the stored one (`undefined` kept = no field).
 */
export async function saveModelPortfolio(
  ownerId: string,
  input: ModelPortfolioInput,
  allAssets: Asset[],
  basis: ModelBasis,
): Promise<void> {
  const problem = validateModelWeights(input.weights, new Map(allAssets.map((asset) => [asset.id, asset])));
  if (problem) throw userFacingError(problem);
  await setDoc(
    doc(db, MODEL_PORTFOLIOS_COLLECTION, ownerId),
    removeUndefinedDeep({
      userId: ownerId,
      weights: input.weights,
      origin: input.origin,
      optimizerSnapshot: input.optimizerSnapshot,
      fingerprint: 'keepFingerprint' in input ? input.keepFingerprint : modelFingerprint(basis, allAssets),
      updatedAt: new Date(),
    }),
  );
}

export async function deleteModelPortfolio(ownerId: string): Promise<void> {
  await deleteDoc(doc(db, MODEL_PORTFOLIOS_COLLECTION, ownerId));
}
