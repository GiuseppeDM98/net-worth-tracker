export const DASHBOARD_OVERVIEW_SUMMARY_COLLECTION = 'dashboardOverviewSummaries';
// Bumped from 1→2: sparklineData expanded from slice(-11) to slice(-40)
// to support 3A and All period selectors in the hero card.
// Bumped from 2→3: cashNetWorth/liquidInvestmentsNetWorth/liquidEstimatedTaxes added to
// metrics; topAssets array added; topExpenseCategories/topIncomeCategories added to
// expenseStats — all needed for the Panoramica redesign (liquid card, asset list, cashflow).
// Bumped from 3→4: ath (all-time-high check), topMovers (monthly asset-class digest), and
// goalProgress (featured Goal-Based Investing progress) added — all needed for the
// Panoramica critique follow-up (2026-07-16).
// Bumped from 4→5: top categories keyed by category id instead of name — two same-named
// categories are now two rows (with a type qualifier on collision), no longer one merged one.
// Bumped from 5→6: topMovers now measures the MARKET price effect per class (quantity held at
// the start × unit-value change), no longer the raw class value delta that mixed in the
// user's own buys and sells; marketEffect (the portfolio-wide total) added alongside it.
// Bumped from 6→7: goalProgressList (every in-progress goal, featured order) added; pension funds
// and real estate measured differently in topMovers/marketEffect.
// Bumped from 7→8: costDrivers (held instruments by annual TER cost) added for the Costi tile.
// Bumped from 8→9: topInstrumentMovers (the per-instrument price effects behind topMovers) added
// for Patrimonio's verdict and hero footer.
// Bumped from 9→10: expenseStats.currentMonth.expensesScheduled (the month's spending dated
// after the computation, for the projection) added; sparklineData no longer capped at 40
// points, so the «All» period is the whole snapshot history.
// Bumped from 10→11: costDrivers[].name now resolves via getAssetDisplayTicker (alias →
// ticker → name) instead of the raw asset name, so a long fund name isn't truncated mid-word
// in the Costi tile's "Pesano di più" list.
// Bumped from 11→12: topAssets[].name now resolves via getAssetDisplayTicker too, for the same
// reason — it feeds both Panoramica's "Asset principali" and Patrimonio's "Rendimento" tile.
// Bumped from 12→13: topInstrumentMovers[].name now resolves via getAssetDisplayTicker too —
// it feeds the "Mercato:" digest (Patrimonio) and the verdict's named top mover.
// Bumped from 13→14: two payload changes at once. charts.assetClassData[].name carries the
// Italian label for trendFollowing/carry instead of the raw Firestore key (the Composizione and
// Classi tiles print that string verbatim), and expensesScheduled now splits by Italian calendar
// DAY, so a row recorded today counts as spent rather than as scheduled.
export const DASHBOARD_OVERVIEW_SOURCE_VERSION = 14;
export const DASHBOARD_OVERVIEW_SUMMARY_TTL_MS = 5 * 60 * 1000;
