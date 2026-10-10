/**
 * The app-wide answer to "is an asset of this shape liquid?", used wherever the user
 * has not answered the question themselves.
 *
 * Keyed on the TYPE for real estate, deliberately not on the assetClass: a direct
 * property (type 'realestate') cannot be sold in a day, but an ETF whose assetClass is
 * 'realestate' — a REIT fund — is exchange-traded and stays liquid. Pension funds are
 * locked until retirement and Private Equity until exit, whatever their class says.
 *
 * Three call sites must agree on this predicate, or the same asset reads liquid on one
 * surface and illiquid on another: the create-mode form default and the edit-mode
 * legacy fallback in AssetDialog, and calculateLiquidNetWorth's read-time fallback for
 * documents saved before `isLiquid` existed.
 *
 * A loan follows what it finances (2026-10-10): a mortgage on a property is as illiquid as the
 * property, a personal loan is negative liquidity, like a credit card. The form and the migration
 * always write `isLiquid` on a loan, so the fallback below is reached only by a hand-written doc.
 */

import type { AssetType } from '@/types/assets';

export function suggestIsLiquid(type: AssetType, subCategory?: string, financedAssetId?: string): boolean {
  if (type === 'loan') return !financedAssetId;
  return !(type === 'realestate' || type === 'pensionFund' || subCategory === 'Private Equity');
}
