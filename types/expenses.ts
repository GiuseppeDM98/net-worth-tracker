// Expense categories for cashflow tracking.
// These are mutually exclusive and determine UI filtering/display logic.
// - fixed: Regular fixed expenses (rent, subscriptions)
// - variable: Variable expenses (groceries, entertainment)
// - debt: Debt payments (loan installments, mortgages)
// - income: Income entries (salary, bonuses, gifts)
// - transfer: Inter-account transfers (net-zero for portfolio, excluded from all metrics)
export type ExpenseType = 'fixed' | 'variable' | 'debt' | 'income' | 'transfer';

// How often a recurring expense series repeats.
// Declared here rather than next to the date arithmetic (lib/utils/recurrenceDates.ts) so that
// module can depend on the domain types without the types depending back on it.
export type RecurrenceFrequency = 'monthly' | 'yearly';

export const EXPENSE_TYPE_LABELS: Record<ExpenseType, string> = {
  fixed: 'Spese Fisse',
  variable: 'Spese Variabili',
  debt: 'Debiti',
  income: 'Entrate',
  transfer: 'Trasferimento',
};

// Sentinel for expenses that carry no subcategory, so they still get a row a reader can
// inspect rather than silently vanishing from a breakdown.
// Shared between the Cost Centers UI (costCenterUtils) and the AI assistant context
// (expenseBreakdown): the two surfaces must name the same thing the same way, otherwise
// the label the user reads on screen and the one the assistant cites start to drift.
export const NO_SUBCATEGORY_KEY = '__none__';
export const NO_SUBCATEGORY_LABEL = 'Senza sottocategoria';

// Same contract one level up: a row whose category is missing or blank still needs a
// bucket with a name. Kept here rather than in any single aggregator because the
// Sankey, the composition lists and the assistant context all have to say it the
// same way — see lib/utils/expenseGrouping.ts.
export const UNCATEGORIZED_LABEL = 'Senza categoria';

// The 50/30/20 role of a spending category (opt-in, settings.spendingRolesEnabled).
// Lives ONLY on the category/subcategory documents, never on an Expense row: rows carry
// categoryId, so a reclassification is retroactive with no bulk update. Absent = «Da
// classificare». Meaningful only for spending types (fixed/variable/debt) — resolved in
// lib/utils/spendingRoles.ts, the one place that decides a row's role.
export type SpendingRole = 'need' | 'want' | 'saving';

export const SPENDING_ROLES: SpendingRole[] = ['need', 'want', 'saving'];

export const SPENDING_ROLE_LABELS: Record<SpendingRole, string> = {
  need: 'Necessità',
  want: 'Desideri',
  saving: 'Risparmi',
};

export const UNCLASSIFIED_SPENDING_LABEL = 'Da classificare';

export interface ExpenseSubCategory {
  id: string;
  name: string;
  icon?: string;
  // Overrides the parent category's role for this subcategory only (WiFi = need inside a
  // want-classified Abbonamenti). Absent = inherit the category's role.
  spendingRole?: SpendingRole;
}

export interface ExpenseCategory {
  id: string;
  userId: string;
  name: string;
  type: ExpenseType;
  color?: string;
  icon?: string;
  spendingRole?: SpendingRole;
  subCategories: ExpenseSubCategory[];
  createdAt: Date;
  updatedAt: Date;
}

export interface ExpenseCategoryFormData {
  name: string;
  type: ExpenseType;
  color?: string;
  icon?: string;
  // On update, the KEY present with an undefined value clears the stored role (deleteField);
  // the key absent leaves it untouched — see expenseCategoryService.updateCategory.
  spendingRole?: SpendingRole;
  subCategories?: ExpenseSubCategory[];
}

// Expense/Income record for cashflow tracking.
// Supports one-time, recurring, and installment (BNPL) payments.
export interface Expense {
  id: string;
  userId: string;
  type: ExpenseType;
  categoryId: string;
  // WARNING: categoryName and subCategoryName are denormalized for query performance.
  // When updating category/subcategory names, also update all expenses in that category via bulk update.
  categoryName: string; // Denormalized for faster queries
  subCategoryId?: string;
  subCategoryName?: string; // Denormalized for faster queries
  amount: number; // Sign convention: POSITIVE for income, NEGATIVE for expenses/debts, POSITIVE for transfers (direction encoded by origin/destination asset IDs)
  currency: string;
  date: Date;
  notes?: string;
  link?: string; // Optional link (e.g., Amazon order, receipt, etc.)
  // Recurring payment configuration
  // If isRecurring=true, this expense is one occurrence of a series that repeats on the
  // specified day (1-31), either monthly or yearly. For months with fewer days (e.g. February
  // with 28/29 days), the payment is scheduled on the last day of the month.
  // The whole series is materialised as real documents sharing one recurringParentId — the
  // date arithmetic lives in lib/utils/recurrenceDates.ts.
  isRecurring?: boolean; // Set on every occurrence of a recurring series
  // Cadence of the series. ABSENT on rows written before the yearly cadence existed, and those
  // are all monthly — read it through resolveRecurrenceFrequency(), never directly.
  recurringFrequency?: RecurrenceFrequency;
  recurringDay?: number; // Day of month for recurring expenses (1-31)
  recurringParentId?: string; // Reference to parent recurring expense
  // Installment payment (BNPL - Buy Now Pay Later) tracking
  // Structure: one "parent" expense with N "child" expenses linked via installmentParentId.
  // - Parent: installmentParentId = undefined, amount = total purchase price
  // - Child: installmentParentId = parent.id, installmentNumber = 1..N, installmentTotal = N
  // Use installmentNumber/installmentTotal for UI display (e.g., "Payment 2 of 12")
  isInstallment?: boolean; // For installment payments (BNPL)
  installmentParentId?: string; // Reference to parent installment series
  installmentNumber?: number; // Current installment number (1, 2, 3...)
  installmentTotal?: number; // Total number of installments in series
  installmentTotalAmount?: number; // Total amount of the purchase (for analytics)
  // Optional link to a cash-class asset whose balance this row moves ON ITS DATE
  // (lib/utils/cashSettlement.ts). Since 2026-09-19 every occurrence of a series carries it;
  // older series carry it on their first entry only (the one that moved the account at save).
  linkedCashAssetId?: string;
  // Destination cash asset for transfer-type expenses. Origin is `linkedCashAssetId`.
  transferCashAssetId?: string;
  // True while a linked row waits for its date: it has NOT moved its account(s) yet, and the
  // server settles it on the day (lib/server/cashSettlement.ts). Absent = applied — every row
  // written before the rule moved its account at save, so none is ever applied twice.
  balancePending?: boolean;
  // The fee of a row is a row of its own (lib/utils/expenseFee.ts): a spending row in the category
  // chosen in Impostazioni, debiting the parent row's account on the parent's date. The two point
  // at each other — the parent names its fee, the fee names its parent — so the fee is edited from
  // the parent and deleted with it. Since 2026-10-10 ANY row can carry one (a transfer only until
  // then, hence the field names, kept so no document had to be rewritten); every occurrence of a
  // series carries its own.
  transferFeeExpenseId?: string; // On any row: the fee row it created
  feeOfTransferId?: string; // On a fee row: the row it was charged for
  // A `debt` row may repay a loan (lib/utils/mortgageRepayment.ts; a property's own debt until
  // 2026-10-10): on the row's date — `balancePending` until then, like its account — the loan's
  // principal falls by the instalment's PRINCIPAL (instalment − debt × TAN / 12), which is then
  // stored here so an edit or a delete gives back exactly what was repaid. Absent while pending.
  debtAssetId?: string;
  // «Estinzione anticipata» (2026-10-10): the row repays its whole amount as principal, no interest
  // split — a partial or total early repayment. A penalty or the period's accrued interest is a
  // cost, and goes on the row's fee (`transferFeeExpenseId`), never into the principal.
  isDebtPayoff?: boolean;
  debtPrincipalRepaid?: number;
  // The interest the same instalment paid (debt × TAN / 12 on the day it settled), stored beside
  // the principal for Patrimonio's «Mutuo» tile. Absent on a row settled before the field existed:
  // read it through `interestPaidOf` (lib/utils/mortgageSummary.ts).
  debtInterestPaid?: number;
  // Optional cost center assignment for grouping expenses by object/project (e.g. "Automobile Dacia").
  // costCenterName is denormalized for query performance — same pattern as categoryName.
  // WARNING: If a cost center is renamed, bulk-update all linked expenses via costCenterService.renameCostCenter.
  costCenterId?: string;
  costCenterName?: string;
  // Who this row belongs to when a household splits its expenses (Cashflow › Divisione).
  //
  // ABSENT (or null) MEANS "IN COMUNE", and that default is the whole reason the feature costs
  // nothing to adopt: every row ever written is already common, so there is no migration, and a
  // household where most spending is shared only ever marks the exception. A value is the id of a
  // FamilyMember (types/assets.ts) and means the row is that person's alone — their salary on an
  // `income` row, their own spending on an expense one.
  //
  // Deliberately NOT denormalized to a name, unlike costCenterName: the members live in the
  // settings document that every consumer already loads, so the label is resolved at read time
  // and renaming a person costs no bulk update. An id whose member no longer exists is treated as
  // unassigned rather than folded into anyone else's figures — see lib/utils/expenseSplitSummary.ts.
  personalMemberId?: string;
  // Set only on expenses written by the historical CSV importer (lib/services/expenseImportService.ts).
  // Groups every row of one import together so the whole batch can be undone in one call.
  importBatchId?: string;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Cashflow breakdown (see lib/utils/expenseBreakdown.ts) ──────────────────
//
// SIGN CONVENTION: expense totals below are NEGATIVE, income totals POSITIVE.
// This deliberately diverges from costCenterUtils and monthlyEmailService, which
// both return positive magnitudes. The reason is the consumer: these figures are
// serialised into an LLM prompt right underneath `Uscite: -23.310 €`, and the same
// concept carrying two different signs on one page of data is how a model ends up
// comparing them wrong — or presenting a spending category as income.

// Legacy/imported rows can reach the aggregator with no `type` at all. They still count
// toward total spending, so they need a bucket of their own — otherwise the per-type
// breakdown quietly fails to add up to the total, and a reader (human or model) summing
// the rows lands on a number that contradicts the headline figure.
export type ExpenseBreakdownType = ExpenseType | 'unclassified';

export interface ExpenseSubCategoryBreakdown {
  subCategoryName: string; // NO_SUBCATEGORY_LABEL when the expense carries none
  total: number; // negative
  transactionCount: number;
}

export interface ExpenseCategoryBreakdown {
  categoryName: string;
  total: number; // negative
  transactionCount: number;
  // Sorted by |total| descending. Deliberately UNCAPPED: a silent cap here is what
  // made the assistant answer "N/D" on subcategories that exist in Firestore.
  subCategories: ExpenseSubCategoryBreakdown[];
}

export interface IncomeCategoryBreakdown {
  categoryName: string;
  total: number; // positive
  transactionCount: number;
}

export interface IndividualExpenseRow {
  categoryName: string;
  subCategoryName?: string;
  amount: number; // negative
  notes?: string;
  // 'yyyy-MM-dd', never a Date: this travels to the browser as JSON in the assistant's
  // SSE `context` event, where a Date would arrive as a string anyway.
  date: string;
}

export interface CashflowBreakdown {
  totals: {
    totalIncome: number; // positive, dividends excluded
    totalDividends: number; // positive
    totalExpenses: number; // negative
    netCashFlow: number;
    transactionCount: number; // rows that fed the totals (transfers excluded)
    expenseTransactionCount: number; // rows classified as spending
  };
  expensesByCategory: ExpenseCategoryBreakdown[]; // by |total| desc, uncapped
  incomeByCategory: IncomeCategoryBreakdown[]; // by total desc, uncapped, dividends excluded
  expensesByType: { type: ExpenseBreakdownType; label: string; total: number }[]; // negative
  topIndividualExpenses: IndividualExpenseRow[];
  // Share of period spending with no subcategory assigned (0-1). Lets the caller declare
  // a thin breakdown as a known limitation instead of letting it read as a bug.
  unclassifiedSubCategoryShare: number;
}

export interface ExpenseFormData {
  type: ExpenseType;
  categoryId: string;
  subCategoryId?: string;
  amount: number;
  currency: string;
  date: Date;
  notes?: string;
  link?: string;
  isRecurring?: boolean;
  recurringFrequency?: RecurrenceFrequency; // Cadence of the series (default: monthly)
  recurringDay?: number;
  // Number of occurrences to create, the first one included. Its unit follows the cadence:
  // months for a monthly series, years for a yearly one. Form-only — never persisted, since
  // the series is materialised as N independent documents.
  recurringCount?: number;
  isInstallment?: boolean; // Enable installment payments
  installmentMode?: 'auto' | 'manual'; // Auto-calculate or manual amounts
  installmentCount?: number; // Number of installments (2-60)
  installmentTotalAmount?: number; // Total amount to divide (auto mode only)
  installmentAmounts?: number[]; // Individual amounts for each installment (manual mode)
  installmentStartDate?: Date; // Date of first installment
  linkedCashAssetId?: string; // ID of cash asset whose balance the row moves on its date
  transferCashAssetId?: string; // Destination cash asset for transfers (origin = linkedCashAssetId)
  balancePending?: boolean; // Written by the edit path: the row's new date is still to come (see Expense)
  transferFeeExpenseId?: string; // On any row: its fee row (see Expense); written by the service
  feeOfTransferId?: string; // On a fee row: the row it was charged for (see Expense); written by the service
  debtAssetId?: string; // On a debt row: the loan it repays on its date (see Expense)
  isDebtPayoff?: boolean; // On a debt row: an early repayment, all principal (see Expense)
  costCenterId?: string;    // Optional cost center assignment
  costCenterName?: string;  // Denormalized name, must be kept in sync via costCenterService
  personalMemberId?: string; // FamilyMember this row belongs to; absent = in comune (see Expense)
}

