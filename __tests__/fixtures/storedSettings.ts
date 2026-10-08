/**
 * The settings document fixtures shared by `settingsRoundTrip.test.ts` (the service's read and
 * write whitelists) and `settingsDraft.test.ts` (the page's draft: slice → compose must give the
 * document back). One fixture, two suites: a field added to the type reaches both guards or
 * neither, and the round-trip stays green while the draft is still dropping it — which is
 * exactly the regression the two tests exist for (2026-07-27 for the service, 2026-09-25 for the
 * page's sub-targets).
 */

import type { AssetAllocationSettings } from '@/types/assets';

/** Ogni valore è scelto per essere DIVERSO dal default, così un campo perso si vede. */
export const STORED_SETTINGS = {
  targets: { equity: { targetPercentage: 60 }, bonds: { targetPercentage: 40 } },
  performanceIncludesPensionFunds: true,
  performanceIncludesExcludedAssets: true,
  performanceExcludesCash: true,
  pensionReturnStartMonth: '2026-07',
  costCentersEnabled: true,
  includePrimaryResidenceInFIRE: true,
  respectPensionLockInFire: true,
  pensionInpsRetirementAge: 68,
  pensionRitaLongUnemployment: true,
  cashflowHistoryStartYear: 2019,
  familyMembers: [{ id: 'm1', name: 'Giuseppe' }],
  expenseSplitEnabled: true,
  spendingRolesEnabled: true,
  dividendCashAssetId: 'cash-1',
  transferFeeCategoryId: 'cat-fee',
  transferFeeSubCategoryId: 'sub-fee',
};

/**
 * Every field Impostazioni's «Salva» writes, each at a value no default produces, with the
 * target tree in BOTH saved shapes (a plain number, a `SubCategoryTarget` with specific assets)
 * and the cash class as a fixed euro amount. `composeSettingsDocument(sliceSettings(doc), doc)`
 * must deep-equal this document — the identity the draft is built to keep.
 */
export const FULL_PAGE_SETTINGS: AssetAllocationSettings = {
  userAge: 41,
  riskFreeRate: 3.25,
  autoCalculateEquityBonds: false,
  includePrimaryResidenceInFIRE: true,
  goalBasedInvestingEnabled: true,
  goalDrivenAllocationEnabled: true,
  withdrawalRate: 3.5,
  plannedAnnualExpenses: 24000,
  targets: {
    equity: {
      targetPercentage: 55.5,
      subCategoryConfig: { enabled: true, categories: ['World', 'Small Cap'] },
      subTargets: {
        World: {
          targetPercentage: 70,
          specificAssetsEnabled: true,
          specificAssets: [
            { name: 'SWDA', targetPercentage: 60 },
            { name: 'VWCE', targetPercentage: 40 },
          ],
        },
        'Small Cap': 30,
      },
    },
    bonds: { targetPercentage: 20, subCategoryConfig: { enabled: false, categories: [] } },
    commodity: {
      targetPercentage: 5,
      subCategoryConfig: { enabled: true, categories: ['Oro'] },
      subTargets: { Oro: 100 },
    },
    realestate: { targetPercentage: 4, subCategoryConfig: { enabled: false, categories: [] } },
    cash: {
      targetPercentage: 0,
      useFixedAmount: true,
      fixedAmount: 15000,
      subCategoryConfig: { enabled: true, categories: ['Conto corrente', 'Deposito'] },
      subTargets: { 'Conto corrente': 40, Deposito: 60 },
    },
    crypto: { targetPercentage: 7.5, subCategoryConfig: { enabled: false, categories: [] } },
    trendFollowing: { targetPercentage: 6, subCategoryConfig: { enabled: false, categories: [] } },
    carry: { targetPercentage: 2, subCategoryConfig: { enabled: false, categories: [] } },
  },
  dividendIncomeCategoryId: 'cat-div',
  dividendIncomeSubCategoryId: 'sub-div',
  dividendCashAssetId: 'cash-div',
  defaultDebitCashAssetId: 'cash-debit',
  defaultCreditCashAssetId: 'cash-credit',
  transferFeeCategoryId: 'cat-fee',
  transferFeeSubCategoryId: 'sub-fee',
  stampDutyEnabled: true,
  stampDutyRate: 0.25,
  checkingAccountSubCategory: 'Conto corrente',
  cashflowHistoryStartYear: 2019,
  laborIncomeCategoryIds: ['cat-salary', 'cat-bonus'],
  costCentersEnabled: true,
  expenseSplitEnabled: true,
  spendingRolesEnabled: true,
  performanceIncludesPensionFunds: true,
  performanceIncludesExcludedAssets: true,
  performanceExcludesCash: true,
  pensionReturnStartMonth: '2026-07',
  monthlyEmailEnabled: true,
  quarterlyEmailEnabled: true,
  semiAnnualEmailEnabled: true,
  yearlyEmailEnabled: true,
  weeklyBudgetEmailEnabled: true,
  monthlyEmailRecipients: ['a@example.com', 'b@example.com'],
  familyMembers: [
    { id: 'm1', name: 'Giuseppe', grossAnnualIncome: 42000, isFirstEmploymentPost2007: true, firstEmploymentYear: 2015 },
    { id: 'm2', name: 'Marcella', grossAnnualIncome: 38000.5, isFirstEmploymentPost2007: false },
  ],
};
