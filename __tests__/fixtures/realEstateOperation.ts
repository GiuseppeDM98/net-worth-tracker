/**
 * Invented, round fixtures for the Compravendita suites (WORKFLOW.md § 1, rule 6): a house, its
 * mortgage, two accounts, the categories a property operation needs, a mortgage series, a policy
 * series and an unrelated one.
 */

import type { Asset, FamilyMember } from '@/types/assets';
import type { CostCenter } from '@/types/costCenters';
import type { Expense, ExpenseCategory } from '@/types/expenses';
import type { RealEstateDraftContext } from '@/lib/utils/realEstateOperationDraft';

export const TODAY_ISO = '2026-06-15';

export const asset = (fields: Partial<Asset> & Pick<Asset, 'id' | 'name' | 'type' | 'assetClass' | 'quantity'>): Asset =>
  ({ userId: 'u1', ticker: '', currency: 'EUR', currentPrice: 1, lastPriceUpdate: new Date(2026, 0, 1), createdAt: new Date(2026, 0, 1), updatedAt: new Date(2026, 0, 1), ...fields }) as Asset;

export const ACCOUNT = asset({ id: 'acc', name: 'Conto Fenicottero', type: 'cash', assetClass: 'cash', quantity: 50000 });
export const ACCOUNT_2 = asset({ id: 'acc2', name: 'Conto Ornitorinco', type: 'cash', assetClass: 'cash', quantity: 1000 });
export const HOUSE = asset({ id: 'house', name: 'Casa Gabbiano', type: 'realestate', assetClass: 'realestate', quantity: 130000, isPrimaryResidence: true });
export const PRICED_HOUSE = asset({ id: 'priced', name: 'Casa a prezzo', type: 'realestate', assetClass: 'realestate', quantity: 1, currentPrice: 90000 });
export const MORTGAGE = asset({ id: 'loan', name: 'Mutuo Gabbiano', type: 'loan', assetClass: 'realestate', quantity: 60000, financedAssetId: 'house', debtInterestRate: 2 });

const category = (id: string, name: string, type: ExpenseCategory['type'], subs: string[] = []): ExpenseCategory =>
  ({ id, userId: 'u1', name, type, subCategories: subs.map((sub) => ({ id: `${id}-${sub.toLowerCase().replace(/\W+/g, '-')}`, name: sub })), createdAt: new Date(), updatedAt: new Date() }) as ExpenseCategory;

export const CATEGORIES: ExpenseCategory[] = [
  category('casa', 'Casa', 'fixed', ['Condominio', 'Assicurazione casa', 'Notaio']),
  category('tasse', 'Tasse', 'fixed'),
  category('assic', 'Assicurazioni', 'fixed', ['Vita']),
  category('mutuo', 'Mutuo', 'debt'),
  category('prestiti', 'Prestiti', 'debt'),
  category('rimborsi', 'Rimborsi', 'income'),
  category('svago', 'Svago', 'variable'),
  category('trasf', 'Trasferimenti', 'transfer'),
];

const day = (iso: string) => new Date(`${iso}T00:00:00`);

export const expense = (fields: Partial<Expense> & Pick<Expense, 'id' | 'type' | 'amount' | 'date'>): Expense =>
  ({ userId: 'u1', categoryId: 'casa', categoryName: 'Casa', currency: 'EUR', createdAt: new Date(), updatedAt: new Date(), ...fields }) as Expense;

/**
 * A mortgage series linked to the loan, a home policy series linked to the house, a personal life
 * policy and a car loan (both unlinked: a sale must not propose them), a gym series, and a deposit received.
 */
export const EXPENSES: Expense[] = [
  ...['2026-05-27', '2026-06-27', '2026-07-27', '2026-08-27'].map((iso, index) =>
    expense({ id: `m${index}`, type: 'debt', amount: -500, date: day(iso), categoryId: 'mutuo', categoryName: 'Mutuo', recurringParentId: 'series-mortgage', debtAssetId: 'loan', linkedCashAssetId: 'acc' })
  ),
  ...['2026-06-27', '2026-07-27'].map((iso, index) =>
    expense({ id: `p${index}`, type: 'fixed', amount: -2, date: day(iso), subCategoryName: 'Assicurazione casa', notes: 'Quota con il mutuo', recurringParentId: 'series-policy', linkedCashAssetId: 'acc', propertyAssetId: 'house' })
  ),
  ...['2026-07-10', '2026-08-10'].map((iso, index) =>
    expense({ id: `v${index}`, type: 'fixed', amount: -25, date: day(iso), categoryId: 'assic', categoryName: 'Assicurazioni', subCategoryName: 'Vita', notes: 'Polizza vita Airone', recurringParentId: 'series-life', linkedCashAssetId: 'acc' })
  ),
  expense({ id: 'c0', type: 'debt', amount: -200, date: day('2026-07-05'), categoryId: 'prestiti', categoryName: 'Prestiti', notes: 'Rata auto', recurringParentId: 'series-car', linkedCashAssetId: 'acc' }),
  ...['2026-07-01', '2026-08-01'].map((iso, index) =>
    expense({ id: `g${index}`, type: 'variable', amount: -40, date: day(iso), categoryId: 'svago', categoryName: 'Svago', notes: 'Palestra', recurringParentId: 'series-gym', linkedCashAssetId: 'acc' })
  ),
  expense({ id: 'dep', type: 'transfer', amount: 15000, date: day('2026-03-01'), categoryId: 'trasf', categoryName: 'Trasferimenti', linkedCashAssetId: 'house', transferCashAssetId: 'acc' }),
];

/** The household: who a life policy insures. */
export const MEMBERS: FamilyMember[] = [
  { id: 'm-airone', name: 'Airone' },
  { id: 'm-cormorano', name: 'Cormorano' },
];

export const CENTERS: CostCenter[] = [{ id: 'cc1', userId: 'u1', name: 'Vendita Casa Gabbiano', createdAt: new Date(), updatedAt: new Date() } as CostCenter];

export function makeContext(overrides: Partial<RealEstateDraftContext> = {}): RealEstateDraftContext {
  return {
    todayIso: TODAY_ISO,
    familyMembers: MEMBERS,
    splitEnabled: false,
    assets: [ACCOUNT, ACCOUNT_2, HOUSE, PRICED_HOUSE, MORTGAGE],
    categories: CATEGORIES,
    costCenters: [],
    costCentersEnabled: true,
    expenses: EXPENSES,
    settings: { defaultDebitCashAssetId: 'acc', defaultCreditCashAssetId: 'acc', realEstateCostCategories: [] },
    ...overrides,
  };
}
