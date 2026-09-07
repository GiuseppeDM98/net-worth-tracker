/**
 * User-authored fields of a monthly snapshot
 *
 * A snapshot document mixes two natures:
 *   - RECOMPUTED fields (totalNetWorth, byAssetClass, byAsset, assetAllocation, pension…):
 *     the pipeline derives them from the assets every time it writes, and a write must
 *     REPLACE them wholesale.
 *   - USER-AUTHORED fields (`note`): nothing recomputes them. They exist only because the
 *     user typed them on Storico, and a recomputation must carry them over untouched.
 *
 * Why not just `set(..., { merge: true })`: merging is wrong for the recomputed half.
 * Firestore merges MAPS key by key, so an asset class that left the portfolio would keep
 * its old amount in `byAssetClass` forever — a snapshot that never goes back down. The
 * write stays a full replace; only the fields listed here ride across it.
 *
 * WARNING: if a new field is added to `MonthlySnapshot` that the snapshot pipeline does
 * NOT derive from the assets, add it here too, or the nightly cron will erase it the same
 * evening it is written.
 */

import { MonthlySnapshot } from '@/types/assets';

/**
 * The snapshot fields no pipeline recomputes.
 *
 * Typed against `MonthlySnapshot` so that renaming the field in the type breaks this list
 * at compile time instead of silently emptying it.
 */
export const SNAPSHOT_USER_AUTHORED_FIELDS = ['note'] as const satisfies ReadonlyArray<
  keyof MonthlySnapshot
>;

type UserAuthoredField = (typeof SNAPSHOT_USER_AUTHORED_FIELDS)[number];

/**
 * Carry the user-authored fields of an existing snapshot into a freshly computed one.
 *
 * @param recomputed - The snapshot document about to be written (a full replace)
 * @param existing - The document currently stored, or undefined when there is none
 * @returns A copy of `recomputed` with the user-authored fields of `existing` added back
 *
 * A field absent, `undefined` or `null` on `existing` is not carried over: there is
 * nothing to preserve, and writing `undefined` into Firestore is rejected.
 */
export function preserveUserAuthoredSnapshotFields<T extends object>(
  recomputed: T,
  existing: Record<string, unknown> | undefined
): T & Partial<Pick<MonthlySnapshot, UserAuthoredField>> {
  if (!existing) return recomputed;

  const preserved: Record<string, unknown> = { ...(recomputed as object) } as Record<
    string,
    unknown
  >;

  for (const field of SNAPSHOT_USER_AUTHORED_FIELDS) {
    const value = existing[field];
    if (value !== undefined && value !== null) {
      preserved[field] = value;
    }
  }

  return preserved as T & Partial<Pick<MonthlySnapshot, UserAuthoredField>>;
}
