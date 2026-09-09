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
 */

import type { AssetType } from '@/types/assets';

export function suggestIsLiquid(type: AssetType, subCategory?: string): boolean {
  return !(type === 'realestate' || type === 'pensionFund' || subCategory === 'Private Equity');
}
