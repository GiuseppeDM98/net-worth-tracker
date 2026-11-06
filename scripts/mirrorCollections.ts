/**
 * What the production mirror owns in the emulators, in lists the seed and mirror:remove share and
 * __tests__/mirrorCollections.test.ts holds against firestore.rules and the assistant's store.
 */

/** Collections whose rows carry `userId`. */
export const USER_COLLECTIONS = ['assets', 'expenses', 'expenseCategories', 'monthly-snapshots', 'assetTransactions', 'pensionContributions', 'dividends', 'costCenters', 'goals', 'assistantThreads'];

/** One document per account, keyed by uid, copied from production. */
export const PER_USER_DOCS = ['users', 'assetAllocationTargets', 'assetTransactionsMeta', 'budgets', 'hall-of-fame', 'performance-cache', 'dashboardOverviewSummaries', 'goalBasedInvesting'];

/**
 * One document per account that the app writes DURING a tour and the seed never reads from production:
 * every per-account document that is not in PER_USER_DOCS. mirror:remove left them behind until 2026-11-03.
 */
export const TOUR_ONLY_DOCS = ['allocationAdvice', 'userPreferences', 'assistantMemory', 'account-access', 'budgetHistory'];
