/**
 * Patrimonio › Compravendita — the arithmetic and the PLAN of writes (owner, 2026-10-21).
 *
 * The path records ONE event of a property's purchase or sale — the preliminare, then the rogito —
 * on the day it happens, out of the app's own pieces, and this module says which pieces:
 *
 *   purchase · preliminare   a new property (worth 0) and the deposit TRANSFERRED onto it from the
 *                            account; the agency as a spending row.
 *   purchase · rogito        the property (new, or the one the preliminare created), the mortgage as a
 *                            `loan` that finances it — its principal lands on the property's value at
 *                            once, the bank pays the seller — the rest of the price transferred from the
 *                            account, the instalments as a monthly `debt` series linked to the loan, the
 *                            policies (a premium, a monthly series, or a personal loan that paid it) and
 *                            the costs (notary, taxes, the mortgage's own) as spending rows.
 *   sale · preliminare       the deposit RECEIVED: a transfer out of the property onto the account.
 *   sale · rogito            the property's value brought to the price first (the «Rivaluta» screen,
 *                            owner 2026-10-21: up or down, a line of its own), the rest of the price
 *                            transferred out — the property ends at zero, «Azzerato» —, each loan that
 *                            financed it paid off from the account, the series still in calendar after
 *                            the rogito stopped, the costs and a policy refund as rows.
 *
 * Costs are SPENDING, never value (owner, 2026-10-21): the property is worth its price. A premium paid
 * by a personal loan is no spending row: the loan's instalments are, as the mortgage's are for the house.
 *
 * Pure: answers and a context of plain documents in, plan steps out; the executor is
 * `lib/services/realEstateOperationService.ts`, the words `realEstateOperationNarrative.ts`.
 */

import type { Asset, FamilyMember } from '@/types/assets';
import type { CostCenter } from '@/types/costCenters';
import type { Expense, ExpenseCategory, ExpenseType } from '@/types/expenses';
import {
  REAL_ESTATE_COST_TYPES,
  type CategoryChoice,
  type LifePolicyAnswer,
  type LoanAnswer,
  type OwnershipAnswer,
  type RealEstateCostKind,
  type RealEstateOperationAnswers,
} from '@/types/realEstateOperation';
import { roundToCents } from '@/lib/utils/cents';
import { getItalyDateIso } from '@/lib/utils/dateHelpers';
import { isLoanAsset } from '@/types/assets';
import { isTransferableProperty } from '@/lib/utils/propertyTransfer';

/** What the plan reads besides the answers: today, and the account's documents. */
export interface RealEstatePlanContext {
  todayIso: string;
  /** The household of Impostazioni: who a life policy insures. */
  familyMembers: readonly FamilyMember[];
  /** Cashflow › Divisione on: a personal policy's rows are its insured's («Spesa di»). */
  splitEnabled: boolean;
  assets: readonly Asset[];
  categories: readonly ExpenseCategory[];
  costCenters: readonly CostCenter[];
  costCentersEnabled: boolean;
  expenses: readonly Expense[];
}

// ─── Dates ─────────────────────────────────────────────────────────────────────

/** A calendar day as the expense form stores it: local midnight of that day. */
export function dateOfIso(iso: string): Date {
  return new Date(`${iso}T00:00:00`);
}

/** Whether `iso` is a real calendar day written `YYYY-MM-DD`. */
export function isValidIso(iso: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const date = dateOfIso(iso);
  return !Number.isNaN(date.getTime()) && getItalyDateIso(date) === iso;
}

/** The same day `months` months later, clamped to the month's length (31 gennaio + 1 → 28 febbraio). */
export function addMonthsIso(iso: string, months: number): string {
  const [year, month, day] = iso.split('-').map(Number);
  const target = new Date(year, month - 1 + months, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  const clamped = Math.min(day, lastDay);
  return `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, '0')}-${String(clamped).padStart(2, '0')}`;
}

// ─── Money ─────────────────────────────────────────────────────────────────────

/**
 * The French (constant) instalment of a loan: P·r / (1 − (1 + r)^−n), r the monthly rate (TAN / 12),
 * n the months — the plan an Italian bank amortises a mortgage on. A 0% loan repays P / n a month.
 */
export function frenchInstalment(principal: number, ratePct: number, months: number): number {
  if (!(principal > 0) || !(months > 0)) return 0;
  const monthlyRate = ratePct / 100 / 12;
  if (monthlyRate <= 0) return roundToCents(principal / months);
  return roundToCents((principal * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -months)));
}

/** A loan's months: its years × 12. */
export function loanMonths(loan: LoanAnswer): number {
  return Math.round((loan.years ?? 0) * 12);
}

/** The instalment the series will carry: the one typed, else the French instalment. */
export function instalmentOf(loan: LoanAnswer): number {
  if (loan.instalmentOverride !== null && loan.instalmentOverride > 0) return roundToCents(loan.instalmentOverride);
  return frenchInstalment(loan.principal ?? 0, loan.ratePct ?? 0, loanMonths(loan));
}

const positive = (value: number | null | undefined): number => (value !== null && value !== undefined && value > 0 ? roundToCents(value) : 0);

// ─── What the account already holds ────────────────────────────────────────────

/** The properties a run can name: valued in `quantity` at price 1, so a transfer can move them. */
export function propertiesOf(assets: readonly Asset[]): Asset[] {
  return assets.filter(isTransferableProperty);
}

/** The property the answers name, if it still exists and can be moved. */
export function selectedProperty(answers: RealEstateOperationAnswers, context: Pick<RealEstatePlanContext, 'assets'>): Asset | null {
  if (!answers.propertyId) return null;
  return propertiesOf(context.assets).find((asset) => asset.id === answers.propertyId) ?? null;
}

/** The property's value today: 0 for one the run is about to create. */
export function propertyValueToday(answers: RealEstateOperationAnswers, context: Pick<RealEstatePlanContext, 'assets'>): number {
  return roundToCents(selectedProperty(answers, context)?.quantity ?? 0);
}

/** The loans that finance a property and still carry a debt: what a sale pays off. */
export function loansFinancing(propertyId: string, assets: readonly Asset[]): Asset[] {
  return assets.filter((asset) => isLoanAsset(asset) && asset.financedAssetId === propertyId && asset.quantity > 0.005);
}

/** The deposits already received for a property: every transfer out of it (a property is sold once). */
export function depositsReceivedFrom(propertyId: string, expenses: readonly Expense[]): number {
  return roundToCents(
    expenses.filter((row) => row.type === 'transfer' && row.linkedCashAssetId === propertyId).reduce((sum, row) => sum + Math.abs(row.amount), 0)
  );
}

/** A series still in calendar after a day: what a sale may stop. */
export interface FutureSeries {
  seriesId: string;
  /** «Mutuo», «Casa › Assicurazione casa». */
  categoryLabel: string;
  notes: string;
  amount: number;
  type: ExpenseType;
  /** The occurrences dated after the day, oldest first. */
  rows: Expense[];
  /** Linked to one of the property's loans. */
  repaysLoan: boolean;
  /** «Legata all'immobile» (`Expense.propertyAssetId`) on one of its occurrences. */
  linkedToProperty: boolean;
}

/** Every recurring series with occurrences after `afterIso` (Italian calendar day), oldest first. */
export function futureSeriesAfter(afterIso: string, expenses: readonly Expense[], loanIds: ReadonlySet<string>, propertyId: string | null = null): FutureSeries[] {
  const bySeries = new Map<string, Expense[]>();
  for (const row of expenses) {
    if (!row.recurringParentId || getItalyDateIso(row.date) <= afterIso) continue;
    bySeries.set(row.recurringParentId, [...(bySeries.get(row.recurringParentId) ?? []), row]);
  }
  return [...bySeries.entries()]
    .map(([seriesId, rows]) => {
      const sorted = [...rows].sort((a, b) => a.date.getTime() - b.date.getTime());
      const first = sorted[0];
      return {
        seriesId,
        categoryLabel: first.subCategoryName ? `${first.categoryName} › ${first.subCategoryName}` : first.categoryName,
        notes: first.notes?.trim() ?? '',
        amount: Math.abs(first.amount),
        type: first.type,
        rows: sorted,
        repaysLoan: sorted.some((row) => !!row.debtAssetId && loanIds.has(row.debtAssetId)),
        linkedToProperty: !!propertyId && sorted.some((row) => row.propertyAssetId === propertyId),
      };
    })
    .sort((a, b) => a.rows[0].date.getTime() - b.rows[0].date.getTime() || a.categoryLabel.localeCompare(b.categoryLabel, 'it'));
}

/**
 * The series a sale proposes to stop: the ones linked to the property and the ones repaying one of its
 * loans — nothing guessed from a type or a word (owner, 2026-10-21 tour: a personal life policy is
 * «Assicurazioni › Vita» too, and a car loan is a `debt` series too). The owner ticks the rest.
 */
export function isProposedToStop(series: FutureSeries): boolean {
  return series.repaysLoan || series.linkedToProperty;
}

// ─── Categories ────────────────────────────────────────────────────────────────

/** A category choice resolved against the categories: names and the type its rows take. */
export interface ResolvedCategory {
  categoryId: string;
  categoryName: string;
  subCategoryId?: string;
  subCategoryName?: string;
  type: ExpenseType;
}

export function resolveCategoryChoice(choice: CategoryChoice | null, categories: readonly ExpenseCategory[], allowed: readonly ExpenseType[]): ResolvedCategory | null {
  if (!choice) return null;
  const category = categories.find((candidate) => candidate.id === choice.categoryId);
  if (!category || !allowed.includes(category.type)) return null;
  const sub = choice.subCategoryId ? category.subCategories.find((candidate) => candidate.id === choice.subCategoryId) : undefined;
  return {
    categoryId: category.id,
    categoryName: category.name,
    subCategoryId: sub?.id,
    subCategoryName: sub?.name,
    type: category.type,
  };
}

/**
 * The words a kind's category is recognised by, most specific first. The specific ones look at the
 * subcategories first («Casa › Assicurazione casa» beats «Assicurazioni»); the BROAD ones look at the
 * categories first, because a broad word inside a subcategory's name points elsewhere (owner,
 * 2026-10-21 tour: «casa» picked «Casa › Assicurazione casa» for the sale's certificates).
 */
const KIND_KEYWORDS: Record<RealEstateCostKind, { specific: RegExp[]; broad: RegExp[] }> = {
  agency: { specific: [/agenzi/i, /mediaz/i], broad: [] },
  notary: { specific: [/notai/i, /rogito/i], broad: [] },
  purchaseTaxes: { specific: [/imposte?\s+(d'|di\s+)?acquist/i, /registro/i], broad: [/impost/i, /tass/i] },
  mortgageCosts: { specific: [/istrutt/i, /perizi/i, /spese\s+mutuo/i], broad: [/commission/i] },
  mortgageTax: { specific: [/sostitutiv/i], broad: [/impost/i, /tass/i] },
  homeInsurance: { specific: [/assicurazione\s+casa/i, /incend/i, /scoppio/i], broad: [/casa/i, /assicuraz/i, /polizz/i] },
  lifeInsurance: { specific: [/vita/i, /\bcpi\b/i], broad: [/assicuraz/i, /polizz/i] },
  mortgageInstalment: { specific: [/mutuo/i, /rata/i], broad: [] },
  insuranceLoanInstalment: { specific: [/prestit/i, /finanziam/i], broad: [/mutuo/i] },
  saleCertificates: { specific: [/certific/i, /\bape\b/i, /pratic/i], broad: [/casa/i] },
  capitalGainsTax: { specific: [/plusvalen/i], broad: [/impost/i, /tass/i] },
  payoffCosts: { specific: [/estinz/i, /penal/i], broad: [/commission/i, /mutuo/i] },
  insuranceRefund: { specific: [/rimbors/i], broad: [] },
};

/**
 * The category a kind starts on: the default saved in Impostazioni › Spese when it still exists with
 * an allowed type, else the first category or subcategory whose name answers the kind's words
 * (`KIND_KEYWORDS`: specific words before broad ones), else none.
 */
export function suggestCategory(
  kind: RealEstateCostKind,
  categories: readonly ExpenseCategory[],
  defaults: Partial<Record<RealEstateCostKind, CategoryChoice>> | undefined
): CategoryChoice | null {
  const allowed = REAL_ESTATE_COST_TYPES[kind];
  const saved = defaults?.[kind];
  if (saved && resolveCategoryChoice(saved, categories, allowed)) return { categoryId: saved.categoryId, ...(saved.subCategoryId ? { subCategoryId: saved.subCategoryId } : {}) };
  const candidates = categories.filter((category) => allowed.includes(category.type));
  const bySubCategory = (pattern: RegExp): CategoryChoice | null => {
    for (const category of candidates) {
      const sub = category.subCategories.find((candidate) => pattern.test(candidate.name));
      if (sub) return { categoryId: category.id, subCategoryId: sub.id };
    }
    return null;
  };
  // Among the categories a word matches, the shortest name is the most generic: «Casa» before
  // «Arredo e casa» (owner, 2026-10-21 tour), whatever order the categories come in.
  const byCategory = (pattern: RegExp): CategoryChoice | null => {
    const [category] = candidates.filter((candidate) => pattern.test(candidate.name)).sort((a, b) => a.name.length - b.name.length);
    return category ? { categoryId: category.id } : null;
  };
  const { specific, broad } = KIND_KEYWORDS[kind];
  for (const pattern of specific) {
    const found = bySubCategory(pattern) ?? byCategory(pattern);
    if (found) return found;
  }
  for (const pattern of broad) {
    const found = byCategory(pattern) ?? bySubCategory(pattern);
    if (found) return found;
  }
  return null;
}

// ─── The figures of a run ──────────────────────────────────────────────────────

export interface RealEstateFigures {
  /** The property's value today (0 for a new one). */
  valueToday: number;
  /** Purchase rogito: what leaves the account for the price (price − value today − mortgage). */
  purchaseBalance: number;
  /** Sale rogito: what the buyer still pays (price − deposits received). */
  saleBalance: number;
  /** Sale rogito: the debt the price closes (the loans ticked on the payoff screen). */
  salePayoff: number;
  /** Sale rogito: what reaches the account — the balance net of the debt the buyer's bank closes. */
  saleNet: number;
  /** Sale rogito: how far the property's value moves to meet the price before it is sold (signed). */
  saleAdjustment: number;
  /** The mortgage's monthly instalment and its last date. */
  mortgageInstalment: number;
  mortgageLastIso: string | null;
}

export function figuresOf(answers: RealEstateOperationAnswers, context: Pick<RealEstatePlanContext, 'assets'>): RealEstateFigures {
  const valueToday = propertyValueToday(answers, context);
  const price = positive(answers.price);
  const principal = answers.hasMortgage ? positive(answers.mortgage.principal) : 0;
  const saleBalance = roundToCents(price - positive(answers.depositsReceived));
  const salePayoff = answers.kind === 'sale' && answers.event === 'rogito' ? roundToCents(answers.payoffs.filter((payoff) => payoff.include).reduce((sum, payoff) => sum + positive(payoff.amount), 0)) : 0;
  const months = loanMonths(answers.mortgage);
  return {
    valueToday,
    purchaseBalance: roundToCents(price - valueToday - principal),
    saleBalance,
    salePayoff,
    saleNet: roundToCents(saleBalance - salePayoff),
    saleAdjustment: roundToCents(saleBalance - valueToday),
    mortgageInstalment: answers.hasMortgage ? instalmentOf(answers.mortgage) : 0,
    mortgageLastIso: answers.hasMortgage && months > 0 && isValidIso(answers.mortgage.firstInstalmentIso) ? addMonthsIso(answers.mortgage.firstInstalmentIso, months - 1) : null,
  };
}

// ─── The plan ──────────────────────────────────────────────────────────────────

/** An asset the plan names: one that exists, or one an earlier step creates. */
export type AssetRef = { id: string } | { ref: 'property' | 'mortgage' | `lifeLoan:${number}`; /** The name a step gives it, for the summary. */ name?: string };

/** A row the plan writes: one row, or a monthly series of `months` rows from `dateIso`. */
export interface PlannedRow {
  type: ExpenseType;
  /** Positive: the service signs it by type. */
  amount: number;
  dateIso: string;
  category: ResolvedCategory;
  notes: string;
  account?: AssetRef;
  /** A transfer's destination. */
  destination?: AssetRef;
  /** A `debt` row's loan, and whether it is all principal («Estinzione anticipata»). */
  loan?: AssetRef;
  isPayoff?: boolean;
  months?: number;
  /** «Legata all'immobile»: the property a later sale stops this series for (`Expense.propertyAssetId`). */
  property?: AssetRef;
  /** «Spesa di»: the household member the row belongs to (`Expense.personalMemberId`); absent = in comune. */
  member?: string;
  /** Booked in the operation's cost centre. */
  inCostCenter: boolean;
}

export type PlanStep =
  | { kind: 'createCostCenter'; name: string }
  | { kind: 'createProperty'; name: string; isPrimaryResidence: boolean; ownership: OwnershipAnswer }
  | { kind: 'createLoan'; ref: 'mortgage' | `lifeLoan:${number}`; name: string; principal: number; ratePct: number; financesProperty: boolean; ownership: OwnershipAnswer }
  /** The property's value moved by hand: the mortgage's principal at a purchase, the revaluation at a sale. */
  | { kind: 'adjustProperty'; delta: number; reason: 'mortgage' | 'revaluation' }
  /**
   * A loan closed WITH the price at a sale: the buyer's bank pays the seller's, so the debt and the
   * house's value fall by the same amount and no row is written — patrimony changing form, never
   * spending (owner, 2026-10-21 tour). The account receives the rest (`saleNet`).
   */
  | { kind: 'payOffWithSale'; loanId: string; loanName: string; amount: number }
  | { kind: 'row'; label: string; row: PlannedRow }
  | { kind: 'stopSeries'; series: FutureSeries };

export interface RealEstatePlan {
  steps: PlanStep[];
  /** Where the operation's costs are booked: 'new' (a step creates it), one that exists, or none. */
  costCenterId: string | null;
  /** The existing property the run is about; null when a step creates it. */
  propertyId: string | null;
  propertyName: string;
}

/** The transfer category's name for the plan; the executor resolves (or creates) the real one. */
export const TRANSFER_CATEGORY_PLACEHOLDER: ResolvedCategory = { categoryId: '', categoryName: 'Trasferimenti', type: 'transfer' };

/** The cost rows each event asks, in the order the screen lists them. */
export function costKindsFor(answers: Pick<RealEstateOperationAnswers, 'kind' | 'event' | 'hasMortgage'>, hasPayoff: boolean): RealEstateCostKind[] {
  if (answers.event === 'preliminare') return ['agency'];
  if (answers.kind === 'purchase') {
    return ['notary', 'purchaseTaxes', 'agency', ...(answers.hasMortgage ? (['mortgageCosts', 'mortgageTax'] as const) : [])];
  }
  return ['agency', 'saleCertificates', 'capitalGainsTax', ...(hasPayoff ? (['payoffCosts'] as const) : []), 'insuranceRefund'];
}

/** The name the operation's new centre starts on. */
export function defaultCostCenterName(kind: RealEstateOperationAnswers['kind'], propertyName: string): string {
  return `${kind === 'purchase' ? 'Acquisto' : 'Vendita'} ${propertyName}`.trim();
}

/** Who a life policy insures, in its notes: the member's name, else the policy's number. */
export function insuredLabel(policy: Pick<LifePolicyAnswer, 'insuredMemberId'>, index: number, members: readonly FamilyMember[]): string {
  return members.find((member) => member.id === policy.insuredMemberId)?.name.trim() || String(index + 1);
}

/** The name of the property the run is about: the existing one's, else the one typed. */
export function propertyNameOf(answers: RealEstateOperationAnswers, context: Pick<RealEstatePlanContext, 'assets'>): string {
  return selectedProperty(answers, context)?.name ?? answers.propertyName.trim();
}

/**
 * The plan of writes, in the order the executor runs them: the centre, the assets, the value moved by
 * hand, the transfers, the series, the costs, the series stopped. Assumes answers that passed every
 * screen (`describeScreenBlock`): a row whose category does not resolve is left out, never guessed.
 */
export function buildRealEstatePlan(answers: RealEstateOperationAnswers, context: RealEstatePlanContext): RealEstatePlan {
  const steps: PlanStep[] = [];
  const property = selectedProperty(answers, context);
  const propertyRef: AssetRef = property ? { id: property.id } : { ref: 'property' };
  const name = propertyNameOf(answers, context);
  const account: AssetRef = { id: answers.accountId };
  const figures = figuresOf(answers, context);
  const date = answers.eventDateIso;
  const resolve = (choice: CategoryChoice | null | undefined, kind: RealEstateCostKind) => resolveCategoryChoice(choice ?? null, context.categories, REAL_ESTATE_COST_TYPES[kind]);

  // The centre first: every cost row below names it.
  let costCenterId: string | null = null;
  if (context.costCentersEnabled && answers.costCenter.mode === 'new' && answers.costCenter.name.trim()) {
    steps.push({ kind: 'createCostCenter', name: answers.costCenter.name.trim() });
    costCenterId = 'new';
  } else if (context.costCentersEnabled && answers.costCenter.mode === 'existing' && context.costCenters.some((center) => center.id === answers.costCenter.existingId)) {
    costCenterId = answers.costCenter.existingId;
  }

  if (answers.kind === 'purchase' && !property) {
    steps.push({ kind: 'createProperty', name, isPrimaryResidence: answers.isPrimaryResidence, ownership: answers.ownership });
  }

  if (answers.kind === 'purchase' && answers.event === 'preliminare') {
    steps.push({ kind: 'row', label: 'deposit', row: { type: 'transfer', amount: positive(answers.depositAmount), dateIso: date, category: TRANSFER_CATEGORY_PLACEHOLDER, notes: `Caparra · ${name}`, account, destination: propertyRef, inCostCenter: false } });
  }

  if (answers.kind === 'purchase' && answers.event === 'rogito') {
    if (answers.hasMortgage) {
      const principal = positive(answers.mortgage.principal);
      steps.push({ kind: 'createLoan', ref: 'mortgage', name: `Mutuo ${name}`, principal, ratePct: answers.mortgage.ratePct ?? 0, financesProperty: true, ownership: answers.ownership });
      // The bank pays the seller: the principal becomes the property's value the day the loan opens.
      steps.push({ kind: 'adjustProperty', delta: principal, reason: 'mortgage' });
    }
    if (figures.purchaseBalance > 0) {
      steps.push({ kind: 'row', label: 'balance', row: { type: 'transfer', amount: figures.purchaseBalance, dateIso: date, category: TRANSFER_CATEGORY_PLACEHOLDER, notes: `Saldo al rogito · ${name}`, account, destination: propertyRef, inCostCenter: false } });
    }
    const mortgageCategory = resolve(answers.mortgageCategory, 'mortgageInstalment');
    if (answers.hasMortgage && mortgageCategory && figures.mortgageInstalment > 0) {
      steps.push({ kind: 'row', label: 'mortgageInstalments', row: { type: 'debt', amount: figures.mortgageInstalment, dateIso: answers.mortgage.firstInstalmentIso, category: mortgageCategory, notes: `Rata mutuo · ${name}`, account, loan: { ref: 'mortgage' }, months: loanMonths(answers.mortgage), inCostCenter: false } });
    }
    const home = answers.homeInsurance;
    const homeCategory = resolve(home.category, 'homeInsurance');
    if (home.mode !== 'none' && homeCategory && positive(home.amount) > 0) {
      steps.push({
        kind: 'row',
        label: 'homeInsurance',
        row: home.mode === 'single'
          ? { type: homeCategory.type, amount: positive(home.amount), dateIso: date, category: homeCategory, notes: `Polizza scoppio e incendio · ${name}`, account, property: propertyRef, inCostCenter: true }
          : { type: homeCategory.type, amount: positive(home.amount), dateIso: home.firstIso, category: homeCategory, notes: `Polizza scoppio e incendio · ${name}`, account, months: home.months ?? 0, property: propertyRef, inCostCenter: false },
      });
    }
    answers.lifePolicies.forEach((policy, index) => {
      const insured = insuredLabel(policy, index, context.familyMembers);
      // A personal policy is its insured's own spending (with Divisione on, as the form writes it); a
      // CPI linked to the house protects the mortgage and stays in comune (owner, 2026-10-21 tour).
      const member = context.splitEnabled && !policy.linkedToProperty && context.familyMembers.some((candidate) => candidate.id === policy.insuredMemberId) ? policy.insuredMemberId : undefined;
      // A CPI belongs to the house (a sale proposes to stop it), a personal life policy does not.
      const property = policy.linkedToProperty ? propertyRef : undefined;
      if (policy.mode === 'financed') {
        const loanCategory = resolve(answers.lifeLoanCategory, 'insuranceLoanInstalment');
        const loan = { ...policy.loan, principal: positive(policy.amount) };
        steps.push({ kind: 'createLoan', ref: `lifeLoan:${index}`, name: `Prestito polizza vita ${insured}`, principal: loan.principal, ratePct: loan.ratePct ?? 0, financesProperty: false, ownership: answers.ownership });
        if (loanCategory && instalmentOf(loan) > 0) {
          steps.push({ kind: 'row', label: 'lifeLoanInstalments', row: { type: 'debt', amount: instalmentOf(loan), dateIso: loan.firstInstalmentIso, category: loanCategory, notes: `Rata prestito polizza vita ${insured}`, account, loan: { ref: `lifeLoan:${index}`, name: `Prestito polizza vita ${insured}` }, months: loanMonths(loan), property, member, inCostCenter: false } });
        }
        return;
      }
      const lifeCategory = resolve(answers.lifeCategory, 'lifeInsurance');
      if (!lifeCategory || positive(policy.amount) === 0) return;
      steps.push({
        kind: 'row',
        label: 'lifeInsurance',
        row: policy.mode === 'single'
          ? { type: lifeCategory.type, amount: positive(policy.amount), dateIso: date, category: lifeCategory, notes: `Polizza vita ${insured}`, account, property, member, inCostCenter: true }
          : { type: lifeCategory.type, amount: positive(policy.amount), dateIso: policy.firstIso, category: lifeCategory, notes: `Polizza vita ${insured}`, account, months: policy.months ?? 0, property, member, inCostCenter: false },
      });
    });
  }

  if (answers.kind === 'sale' && answers.event === 'preliminare') {
    steps.push({ kind: 'row', label: 'deposit', row: { type: 'transfer', amount: positive(answers.depositAmount), dateIso: date, category: TRANSFER_CATEGORY_PLACEHOLDER, notes: `Caparra ricevuta · ${name}`, account: propertyRef, destination: account, inCostCenter: false } });
  }

  if (answers.kind === 'sale' && answers.event === 'rogito') {
    if (Math.abs(figures.saleAdjustment) >= 0.01) steps.push({ kind: 'adjustProperty', delta: figures.saleAdjustment, reason: 'revaluation' });
    // The debt first, as at the notary: the buyer's bank closes it out of the price, the account gets the rest.
    for (const payoff of answers.payoffs) {
      const loan = context.assets.find((asset) => asset.id === payoff.loanId);
      if (!payoff.include || !loan || positive(payoff.amount) === 0) continue;
      steps.push({ kind: 'payOffWithSale', loanId: loan.id, loanName: loan.name, amount: positive(payoff.amount) });
    }
    if (figures.saleNet > 0) {
      steps.push({ kind: 'row', label: 'balance', row: { type: 'transfer', amount: figures.saleNet, dateIso: date, category: TRANSFER_CATEGORY_PLACEHOLDER, notes: `Saldo al rogito · ${name}`, account: propertyRef, destination: account, inCostCenter: false } });
    }
  }

  // The costs of the event, each in its category, on the account and the day of the event.
  const hasPayoff = answers.payoffs.some((payoff) => payoff.include);
  for (const kind of costKindsFor(answers, hasPayoff)) {
    const cost = answers.costs[kind];
    const category = resolve(cost?.category, kind);
    if (!cost || !category || positive(cost.amount) === 0) continue;
    steps.push({ kind: 'row', label: `cost:${kind}`, row: { type: category.type, amount: positive(cost.amount), dateIso: date, category, notes: `${COST_NOTE[kind]} · ${name}`, account, inCostCenter: category.type !== 'income' } });
  }

  if (answers.kind === 'sale' && answers.event === 'rogito' && property) {
    const loanIds = new Set(loansFinancing(property.id, context.assets).map((asset) => asset.id));
    const selected = new Set(answers.stopSeriesIds);
    for (const series of futureSeriesAfter(date, context.expenses, loanIds, property.id)) {
      if (selected.has(series.seriesId)) steps.push({ kind: 'stopSeries', series });
    }
  }

  return { steps, costCenterId, propertyId: property?.id ?? null, propertyName: name };
}

/** The note a cost row is written with (the property's name follows). */
export const COST_NOTE: Record<RealEstateCostKind, string> = {
  agency: 'Agenzia',
  notary: 'Notaio',
  purchaseTaxes: 'Imposte d’acquisto',
  mortgageCosts: 'Istruttoria e perizia del mutuo',
  mortgageTax: 'Imposta sostitutiva sul mutuo',
  homeInsurance: 'Polizza scoppio e incendio',
  lifeInsurance: 'Polizza vita',
  mortgageInstalment: 'Rata mutuo',
  insuranceLoanInstalment: 'Rata prestito polizza',
  saleCertificates: 'Certificazioni e pratiche',
  capitalGainsTax: 'Imposta sulla plusvalenza',
  payoffCosts: 'Costi dell’estinzione',
  insuranceRefund: 'Rimborso polizza',
};
