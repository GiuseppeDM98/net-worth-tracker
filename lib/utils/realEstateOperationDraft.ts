/**
 * Patrimonio › Compravendita — the path as a value (owner, 2026-10-21): the answers being typed and
 * the screen open. A `useReducer` reducer with no React in it, like the Consulente's
 * (lib/utils/allocationAdviceDraft.ts), so every transition is unit-tested.
 *
 * The screens are `REAL_ESTATE_OPERATION_SCREENS` filtered by `screensFor`: an answer set needs only
 * its event's screens (a preliminare has no mortgage, a purchase no payoff), «Rivaluta» only when the
 * price moves the property's value, «Estinzione» only with a loan to pay off, «Centro» only with the
 * cost centres on. The draft lives on this browser (`real-estate-operation-draft:{uid}`); a confirmed
 * run clears it.
 */

import type { Asset, AssetAllocationSettings } from '@/types/assets';
import type { CostCenter } from '@/types/costCenters';
import type { ExpenseCategory } from '@/types/expenses';
import {
  REAL_ESTATE_OPERATION_SCREENS,
  realEstateDefaultsByKind,
  type CategoryChoice,
  type CostAnswer,
  type LifePolicyAnswer,
  type LoanAnswer,
  type RealEstateCostKind,
  type RealEstateOperationAnswers,
  type RealEstateOperationScreen,
} from '@/types/realEstateOperation';
import {
  addMonthsIso,
  costKindsFor,
  defaultCostCenterName,
  depositsReceivedFrom,
  figuresOf,
  futureSeriesAfter,
  isProposedToStop,
  loansFinancing,
  propertiesOf,
  propertyNameOf,
  suggestCategory,
  type RealEstatePlanContext,
} from '@/lib/utils/realEstateOperationPlan';

export interface RealEstateOperationDraft {
  /** The screen open, by NAME: the list of screens moves with the answers. */
  screen: RealEstateOperationScreen;
  answers: RealEstateOperationAnswers;
  /** The (kind, event, property) the event-dependent answers were last prefilled for. */
  preparedFor: string | null;
}

/** What the reducer reads besides the draft: the plan's context and the saved defaults. */
export interface RealEstateDraftContext extends RealEstatePlanContext {
  settings: Pick<AssetAllocationSettings, 'defaultDebitCashAssetId' | 'defaultCreditCashAssetId' | 'realEstateCostCategories'> | null;
}

export type RealEstateOperationAction =
  | { type: 'patch'; patch: Partial<RealEstateOperationAnswers> }
  | { type: 'patchCost'; kind: RealEstateCostKind; patch: Partial<CostAnswer> }
  | { type: 'patchMortgage'; patch: Partial<LoanAnswer> }
  | { type: 'addLifePolicy' }
  | { type: 'updateLifePolicy'; index: number; patch: Partial<LifePolicyAnswer> }
  | { type: 'removeLifePolicy'; index: number }
  | { type: 'next'; context: RealEstateDraftContext }
  | { type: 'back'; context: RealEstateDraftContext }
  | { type: 'goto'; screen: RealEstateOperationScreen }
  | { type: 'reset'; draft: RealEstateOperationDraft };

/** The screens an answer set needs, in order. */
export function screensFor(answers: RealEstateOperationAnswers, context: RealEstatePlanContext): RealEstateOperationScreen[] {
  const { kind, event } = answers;
  const figures = figuresOf(answers, context);
  const hasLoans = !!answers.propertyId && loansFinancing(answers.propertyId, context.assets).length > 0;
  const hasSeries = !!answers.propertyId && futureSeriesAfter(answers.eventDateIso, context.expenses, new Set()).length > 0;
  const needs: Record<RealEstateOperationScreen, boolean> = {
    operazione: true,
    immobile: true,
    caparra: event === 'preliminare',
    saldo: event === 'rogito',
    rivaluta: kind === 'sale' && event === 'rogito' && Math.abs(figures.saleAdjustment) >= 0.01,
    mutuo: kind === 'purchase' && event === 'rogito',
    polizze: kind === 'purchase' && event === 'rogito',
    estinzione: kind === 'sale' && event === 'rogito' && hasLoans,
    serie: kind === 'sale' && event === 'rogito' && hasSeries,
    costi: true,
    centro: context.costCentersEnabled,
    riepilogo: true,
  };
  return REAL_ESTATE_OPERATION_SCREENS.filter((screen) => needs[screen]);
}

/** «Passo n di N»: the screen's position among the ones the answers need. */
export function screenPosition(draft: RealEstateOperationDraft, context: RealEstatePlanContext): { index: number; total: number } {
  const screens = screensFor(draft.answers, context);
  return { index: Math.max(0, screens.indexOf(draft.screen)), total: screens.length };
}

const emptyLoan = (todayIso: string): LoanAnswer => ({ principal: null, ratePct: null, years: null, firstInstalmentIso: addMonthsIso(todayIso, 1), instalmentOverride: null });

/** A new life policy: monthly, its first premium beside the mortgage's first instalment. */
export function emptyLifePolicy(answers: RealEstateOperationAnswers): LifePolicyAnswer {
  return {
    insuredMemberId: '',
    mode: 'monthly',
    amount: null,
    firstIso: answers.mortgage.firstInstalmentIso,
    months: answers.mortgage.years ? Math.round(answers.mortgage.years * 12) : null,
    loan: { ...emptyLoan(answers.eventDateIso), firstInstalmentIso: answers.mortgage.firstInstalmentIso },
    linkedToProperty: false,
  };
}

/** The account a run starts on: the default debit account if it still exists, else the first account. */
function defaultAccountId(context: RealEstateDraftContext): string {
  const accounts = context.assets.filter((asset) => asset.type === 'cash' && asset.assetClass === 'cash');
  const saved = context.settings?.defaultDebitCashAssetId;
  return accounts.find((asset) => asset.id === saved)?.id ?? accounts[0]?.id ?? '';
}

/** A fresh path: a purchase's preliminare today, every category on its default or its suggestion. */
export function initialAnswers(context: RealEstateDraftContext): RealEstateOperationAnswers {
  const defaults = realEstateDefaultsByKind(context.settings?.realEstateCostCategories);
  const suggest = (kind: RealEstateCostKind): CategoryChoice | null => suggestCategory(kind, context.categories, defaults);
  const costs: Partial<Record<RealEstateCostKind, CostAnswer>> = {};
  for (const kind of ['agency', 'notary', 'purchaseTaxes', 'mortgageCosts', 'mortgageTax', 'saleCertificates', 'capitalGainsTax', 'payoffCosts', 'insuranceRefund'] as const) {
    costs[kind] = { amount: null, category: suggest(kind) };
  }
  return {
    kind: 'purchase',
    event: 'preliminare',
    eventDateIso: context.todayIso,
    accountId: defaultAccountId(context),
    propertyId: null,
    propertyName: '',
    isPrimaryResidence: true,
    ownership: { mode: 'common' },
    price: null,
    depositAmount: null,
    depositsReceived: null,
    hasMortgage: true,
    mortgage: emptyLoan(context.todayIso),
    mortgageCategory: suggest('mortgageInstalment'),
    homeInsurance: { mode: 'none', amount: null, firstIso: addMonthsIso(context.todayIso, 1), months: null, category: suggest('homeInsurance') },
    lifePolicies: [],
    lifeCategory: suggest('lifeInsurance'),
    lifeLoanCategory: suggest('insuranceLoanInstalment'),
    payoffs: [],
    stopSeriesIds: [],
    costs,
    costCenter: { mode: context.costCentersEnabled ? 'new' : 'none', name: '', existingId: '' },
  };
}

export function initialDraft(answers: RealEstateOperationAnswers): RealEstateOperationDraft {
  return { screen: 'operazione', answers, preparedFor: null };
}

function preparedKey(answers: RealEstateOperationAnswers): string {
  return `${answers.kind}|${answers.event}|${answers.propertyId ?? `new:${answers.propertyName.trim()}`}`;
}

/**
 * The answers that depend on the event and the property, filled when the property screen is left for
 * a new (kind, event, property): the deposits already received, the loans to pay off at their debt, the
 * series proposed to stop, the centre's name (an existing centre of that name is picked instead).
 */
export function prefillForProperty(answers: RealEstateOperationAnswers, context: RealEstateDraftContext): RealEstateOperationAnswers {
  const name = propertyNameOf(answers, context);
  const propertyId = answers.propertyId;
  const loans = propertyId ? loansFinancing(propertyId, context.assets) : [];
  const loanIds = new Set(loans.map((loan) => loan.id));
  const isSaleRogito = answers.kind === 'sale' && answers.event === 'rogito';
  const centerName = defaultCostCenterName(answers.kind, name);
  const existingCenter = context.costCenters.find((center) => !center.archivedAt && center.name.trim().toLowerCase() === centerName.toLowerCase());
  return {
    ...answers,
    depositsReceived: isSaleRogito && propertyId ? depositsReceivedFrom(propertyId, context.expenses) : answers.depositsReceived,
    payoffs: isSaleRogito ? loans.map((loan) => ({ loanId: loan.id, amount: loan.quantity, include: true })) : [],
    stopSeriesIds: isSaleRogito ? futureSeriesAfter(answers.eventDateIso, context.expenses, loanIds, propertyId).filter(isProposedToStop).map((series) => series.seriesId) : [],
    costCenter: !context.costCentersEnabled
      ? { mode: 'none', name: '', existingId: '' }
      : existingCenter
        ? { mode: 'existing', name: centerName, existingId: existingCenter.id }
        : { mode: 'new', name: centerName, existingId: '' },
  };
}

/** The screen after (or before) `screen` among the ones `answers` need; itself at either end. */
function neighbour(screen: RealEstateOperationScreen, answers: RealEstateOperationAnswers, context: RealEstatePlanContext, step: 1 | -1): RealEstateOperationScreen {
  const screens = screensFor(answers, context);
  const index = screens.indexOf(screen);
  // A screen the answers no longer need (the price moved under «Rivaluta») steps from its place in the full order.
  if (index === -1) {
    const order = REAL_ESTATE_OPERATION_SCREENS.indexOf(screen);
    const candidates = step === 1 ? screens.filter((s) => REAL_ESTATE_OPERATION_SCREENS.indexOf(s) > order) : screens.filter((s) => REAL_ESTATE_OPERATION_SCREENS.indexOf(s) < order).reverse();
    return candidates[0] ?? screen;
  }
  return screens[Math.max(0, Math.min(screens.length - 1, index + step))];
}

export function realEstateOperationReducer(draft: RealEstateOperationDraft, action: RealEstateOperationAction): RealEstateOperationDraft {
  const { answers } = draft;
  switch (action.type) {
    case 'patch':
      return { ...draft, answers: { ...answers, ...action.patch } };
    case 'patchCost': {
      const current = answers.costs[action.kind] ?? { amount: null, category: null };
      return { ...draft, answers: { ...answers, costs: { ...answers.costs, [action.kind]: { ...current, ...action.patch } } } };
    }
    case 'patchMortgage':
      return { ...draft, answers: { ...answers, mortgage: { ...answers.mortgage, ...action.patch } } };
    case 'addLifePolicy':
      return { ...draft, answers: { ...answers, lifePolicies: [...answers.lifePolicies, emptyLifePolicy(answers)] } };
    case 'updateLifePolicy':
      return { ...draft, answers: { ...answers, lifePolicies: answers.lifePolicies.map((policy, index) => (index === action.index ? { ...policy, ...action.patch } : policy)) } };
    case 'removeLifePolicy':
      return { ...draft, answers: { ...answers, lifePolicies: answers.lifePolicies.filter((_, index) => index !== action.index) } };
    case 'next': {
      // Leaving the property screen for a new (kind, event, property) fills what depends on it.
      let nextAnswers = answers;
      let preparedFor = draft.preparedFor;
      if (draft.screen === 'immobile' && preparedKey(answers) !== draft.preparedFor) {
        nextAnswers = prefillForProperty(answers, action.context);
        preparedFor = preparedKey(answers);
      }
      return { screen: neighbour(draft.screen, nextAnswers, action.context, 1), answers: nextAnswers, preparedFor };
    }
    case 'back':
      return { ...draft, screen: neighbour(draft.screen, answers, action.context, -1) };
    case 'goto':
      return { ...draft, screen: action.screen };
    case 'reset':
      return action.draft;
    default:
      return draft;
  }
}

/** The cost rows the costs screen lists for these answers. */
export function costKindsOf(answers: RealEstateOperationAnswers): RealEstateCostKind[] {
  return costKindsFor(answers, answers.payoffs.some((payoff) => payoff.include));
}

/** The properties the property screen offers: every movable one on a sale, those still being bought on a purchase. */
export function propertyChoices(answers: RealEstateOperationAnswers, assets: readonly Asset[]): Asset[] {
  return propertiesOf(assets).filter((asset) => (answers.kind === 'sale' ? asset.quantity > 0 : true));
}

/** The centres a run may book in: the open ones. */
export function openCostCenters(centers: readonly CostCenter[]): CostCenter[] {
  return centers.filter((center) => !center.archivedAt);
}

/** The categories a kind may land in, for its picker. */
export function categoriesFor(allowed: readonly string[], categories: readonly ExpenseCategory[]): ExpenseCategory[] {
  return categories.filter((category) => allowed.includes(category.type)).sort((a, b) => a.name.localeCompare(b.name, 'it'));
}

// ─── localStorage draft ───────────────────────────────────────────────────────

export function draftStorageKey(ownerId: string): string {
  return `real-estate-operation-draft:${ownerId}`;
}

/** The draft stored on this browser, or null; one from another shape is ignored. */
export function readStoredDraft(storage: Pick<Storage, 'getItem'> | null, ownerId: string): RealEstateOperationDraft | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(draftStorageKey(ownerId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<RealEstateOperationDraft>;
    if (typeof parsed.screen !== 'string' || !REAL_ESTATE_OPERATION_SCREENS.includes(parsed.screen as RealEstateOperationScreen)) return null;
    if (!parsed.answers || typeof parsed.answers !== 'object' || !('kind' in parsed.answers) || !('costs' in parsed.answers)) return null;
    return { screen: parsed.screen as RealEstateOperationScreen, answers: parsed.answers as RealEstateOperationAnswers, preparedFor: parsed.preparedFor ?? null };
  } catch {
    return null;
  }
}

export function writeStoredDraft(storage: Pick<Storage, 'setItem'> | null, ownerId: string, draft: RealEstateOperationDraft): void {
  if (!storage) return;
  try {
    storage.setItem(draftStorageKey(ownerId), JSON.stringify(draft));
  } catch {
    // A full or blocked storage loses the convenience, never the path.
  }
}

export function clearStoredDraft(storage: Pick<Storage, 'removeItem'> | null, ownerId: string): void {
  if (!storage) return;
  try {
    storage.removeItem(draftStorageKey(ownerId));
  } catch {
    // Same as above.
  }
}
