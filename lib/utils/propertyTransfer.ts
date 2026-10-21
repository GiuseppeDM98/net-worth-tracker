/**
 * A transfer that touches a PROPERTY — patrimony changing form, never income nor spending.
 *
 * Two directions, one rule (doc/guide/cashflow.md § A transfer can land on a PROPERTY):
 *   - account → property: a deposit or an instalment paid towards a house (2026-10-10);
 *   - property → account: a sale, or a deposit RECEIVED from a buyer (owner, 2026-10-21).
 * Either way the property's value lives in `quantity` at price 1 — the shape the asset form writes
 * for a property — so a euro delta lands on it as it lands on an account (`balanceEffectsOf` is
 * generic over asset ids). A property priced otherwise cannot take a euro delta and is never offered.
 *
 * A property never gives more than it is worth (owner, 2026-10-21): a sale above the recorded value
 * is a revaluation first, and the revaluation is the owner's own gesture in Patrimonio, so the
 * Storico sees it as one. The transfer is refused instead of leaving the house below zero.
 *
 * SDK-free: plain assets and rows in, figures out.
 */

import type { Asset } from '@/types/assets';
import { appliedBalanceEffectsOf, type SettlementRow } from '@/lib/utils/cashSettlement';

/** Whether a transfer can move money into or out of this asset as a property: valued in `quantity` at price 1. */
export function isTransferableProperty(asset: Pick<Asset, 'type' | 'assetClass' | 'currentPrice'>): boolean {
  return asset.type === 'realestate' && asset.assetClass === 'realestate' && asset.currentPrice === 1;
}

/**
 * What the property can give a transfer saved now: its value today, plus whatever the edited row
 * itself already took from it (an edit gives that back before applying the new amount). The rows
 * still in calendar are not counted — they move the property on their own date.
 */
export function propertyValueAvailable(property: Pick<Asset, 'id' | 'quantity'>, editedRow: SettlementRow | null): number {
  const alreadyMoved = editedRow
    ? appliedBalanceEffectsOf(editedRow)
        .filter((effect) => effect.assetId === property.id)
        .reduce((sum, effect) => sum + effect.delta, 0)
    : 0;
  return property.quantity - alreadyMoved;
}

/** Whether `amount` taken from a property worth `available` would leave it below zero (a cent of float noise allowed). */
export function exceedsPropertyValue(amount: number, available: number): boolean {
  return amount - available > 0.005;
}
