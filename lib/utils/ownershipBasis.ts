import type { OwnershipBasis, OwnershipRow } from '@/lib/utils/assetOwnership';

/**
 * A row's amount and share on the chosen basis — the rows, the reading and the answer read ONE rule.
 *
 * Its own module because `patrimonioNarrative` needs it and every page's narrative imports that file:
 * read from `assetOwnership` it carried the whole module into eight routes' first load, the landing's
 * included (2026-11-03, doc/guide/velocita.md § Registro dei tetti alzati).
 */
export function ownershipRowOn(row: OwnershipRow, basis: OwnershipBasis): { value: number; sharePct: number | null } {
  return basis === 'cost' ? { value: row.costValue, sharePct: row.costSharePct } : { value: row.value, sharePct: row.sharePct };
}
