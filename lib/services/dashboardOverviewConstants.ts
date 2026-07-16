export const DASHBOARD_OVERVIEW_SUMMARY_COLLECTION = 'dashboardOverviewSummaries';
// Bumped from 1→2: sparklineData expanded from slice(-11) to slice(-40)
// to support 3A and All period selectors in the hero card.
// Bumped from 2→3: cashNetWorth/liquidInvestmentsNetWorth/liquidEstimatedTaxes added to
// metrics; topAssets array added; topExpenseCategories/topIncomeCategories added to
// expenseStats — all needed for the Panoramica redesign (liquid card, asset list, cashflow).
// Bumped from 3→4: ath (all-time-high check), topMovers (monthly asset-class digest), and
// goalProgress (featured Goal-Based Investing progress) added — all needed for the
// Panoramica critique follow-up (2026-07-16).
export const DASHBOARD_OVERVIEW_SOURCE_VERSION = 4;
export const DASHBOARD_OVERVIEW_SUMMARY_TTL_MS = 5 * 60 * 1000;
