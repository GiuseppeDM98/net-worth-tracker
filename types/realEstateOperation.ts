/**
 * Patrimonio › Compravendita (owner, 2026-10-21): the guided path that records the purchase or the
 * sale of a property — one EVENT per run (the preliminare, then the rogito), each written on the day
 * it happens. The answers are the path's state; the plan (lib/utils/realEstateOperationPlan.ts) turns
 * them into writes made of the app's own pieces: a property, a loan, transfers, spending rows, series,
 * a payoff and the series stopped after a sale.
 */

import type { ExpenseType } from '@/types/expenses';

export type OperationKind = 'purchase' | 'sale';
export type OperationEvent = 'preliminare' | 'rogito';

/**
 * The kinds of money a property operation moves besides the price — each a row in its own category,
 * with a default in Impostazioni › Spese (`realEstateCostCategories`). The insurance premiums and the
 * instalments are kinds too: they need a category like any cost.
 */
export const REAL_ESTATE_COST_KINDS = [
  'agency',
  'notary',
  'purchaseTaxes',
  'mortgageCosts',
  'mortgageTax',
  'homeInsurance',
  'lifeInsurance',
  'mortgageInstalment',
  'insuranceLoanInstalment',
  'saleCertificates',
  'capitalGainsTax',
  'payoffCosts',
  'insuranceRefund',
] as const;
export type RealEstateCostKind = (typeof REAL_ESTATE_COST_KINDS)[number];

/** The expense types a kind's category may have: an instalment repays a loan, a refund is income. */
export const REAL_ESTATE_COST_TYPES: Record<RealEstateCostKind, readonly ExpenseType[]> = {
  agency: ['fixed', 'variable'],
  notary: ['fixed', 'variable'],
  purchaseTaxes: ['fixed', 'variable'],
  mortgageCosts: ['fixed', 'variable'],
  mortgageTax: ['fixed', 'variable'],
  homeInsurance: ['fixed', 'variable'],
  lifeInsurance: ['fixed', 'variable'],
  mortgageInstalment: ['debt'],
  insuranceLoanInstalment: ['debt'],
  saleCertificates: ['fixed', 'variable'],
  capitalGainsTax: ['fixed', 'variable'],
  payoffCosts: ['fixed', 'variable'],
  insuranceRefund: ['income'],
};

/** A category choice: the category and, optionally, one of its subcategories. */
export interface CategoryChoice {
  categoryId: string;
  subCategoryId?: string;
}

/**
 * A kind's default category, as Impostazioni › Spese saves it (`AssetAllocationSettings.
 * realEstateCostCategories`). A LIST, not a map: the settings' merge branch writes with
 * `merge: true`, which merges a map key by key and would keep a default the owner removed —
 * an array is replaced whole.
 */
export interface RealEstateCostDefault extends CategoryChoice {
  kind: RealEstateCostKind;
}

/** The saved list as a map, the shape the path reads; an unknown kind is dropped. */
export function realEstateDefaultsByKind(list: readonly RealEstateCostDefault[] | undefined): Partial<Record<RealEstateCostKind, CategoryChoice>> {
  const map: Partial<Record<RealEstateCostKind, CategoryChoice>> = {};
  for (const entry of list ?? []) {
    if (!(REAL_ESTATE_COST_KINDS as readonly string[]).includes(entry.kind) || !entry.categoryId) continue;
    map[entry.kind] = entry.subCategoryId ? { categoryId: entry.categoryId, subCategoryId: entry.subCategoryId } : { categoryId: entry.categoryId };
  }
  return map;
}

/** Who owns the property: in comune (no field), one member, or percent quotas (types/assets.ts → ownerShares). */
export type OwnershipAnswer =
  | { mode: 'common' }
  | { mode: 'member'; memberId: string }
  | { mode: 'shares'; shares: { memberId: string; percent: number | null }[] };

/** A monthly series' shape: the amount, the first date and how many months. */
export interface MonthlySeriesAnswer {
  amount: number | null;
  firstIso: string;
  months: number | null;
}

/** A loan: principal, TAN in percent, years and the first instalment; the instalment is computed, or typed. */
export interface LoanAnswer {
  principal: number | null;
  ratePct: number | null;
  years: number | null;
  firstInstalmentIso: string;
  /** Null: the French instalment of principal, TAN and years (`frenchInstalment`). */
  instalmentOverride: number | null;
}

export type HomeInsuranceMode = 'none' | 'single' | 'monthly';
export type LifePolicyMode = 'single' | 'monthly' | 'financed';

export interface LifePolicyAnswer {
  /**
   * Who the policy insures: a household member of Impostazioni (owner, 2026-10-21 tour — no free
   * name). '' while none is chosen, and always without members (the policy is then named by its number).
   */
  insuredMemberId: string;
  mode: LifePolicyMode;
  /** The single premium (single, financed) or the monthly one. */
  amount: number | null;
  /** Monthly: the first premium and how many months. */
  firstIso: string;
  months: number | null;
  /** Financed: the personal loan that paid the premium. */
  loan: LoanAnswer;
  /**
   * «Legata alla casa» (a CPI of the mortgage): its rows, and its loan's instalments, carry the
   * property, so a sale proposes to stop them. Off by default — a personal life policy outlives the house.
   */
  linkedToProperty: boolean;
}

/** One cost row: its amount (null or 0 = none) and its category. */
export interface CostAnswer {
  amount: number | null;
  category: CategoryChoice | null;
}

export type CostCenterMode = 'new' | 'existing' | 'none';

export interface RealEstateOperationAnswers {
  kind: OperationKind;
  event: OperationEvent;
  /** The day of the preliminare or the rogito: never after today (one run per event, as it happens). */
  eventDateIso: string;
  /** The account the money leaves (purchase) or lands on (sale). */
  accountId: string;
  /** An existing property: always on a sale, on a purchase rogito after a recorded preliminare. */
  propertyId: string | null;
  /** A new property (purchase): its name, whether it is home, who owns it. */
  propertyName: string;
  isPrimaryResidence: boolean;
  ownership: OwnershipAnswer;
  /** The agreed price. */
  price: number | null;
  /** The preliminare's deposit, paid (purchase) or received (sale). */
  depositAmount: number | null;
  /** Sale rogito: the deposits already received, read off the transfers out of the property. */
  depositsReceived: number | null;
  /** Purchase rogito: the mortgage and the policies that come with it. */
  hasMortgage: boolean;
  mortgage: LoanAnswer;
  mortgageCategory: CategoryChoice | null;
  homeInsurance: { mode: HomeInsuranceMode; amount: number | null; firstIso: string; months: number | null; category: CategoryChoice | null };
  lifePolicies: LifePolicyAnswer[];
  lifeCategory: CategoryChoice | null;
  lifeLoanCategory: CategoryChoice | null;
  /** Sale rogito: the loans paid off with the proceeds, and the series stopped after the rogito. */
  payoffs: { loanId: string; amount: number | null; include: boolean }[];
  stopSeriesIds: string[];
  costs: Partial<Record<RealEstateCostKind, CostAnswer>>;
  costCenter: { mode: CostCenterMode; name: string; existingId: string };
}

/** The screens, in order; `screensFor` keeps the ones an answer set needs. */
export const REAL_ESTATE_OPERATION_SCREENS = [
  'operazione',
  'immobile',
  'caparra',
  // At a purchase the balance is the price minus the mortgage, so the mortgage comes first.
  'mutuo',
  'saldo',
  'rivaluta',
  'polizze',
  'estinzione',
  'serie',
  'costi',
  'centro',
  'riepilogo',
] as const;
export type RealEstateOperationScreen = (typeof REAL_ESTATE_OPERATION_SCREENS)[number];
