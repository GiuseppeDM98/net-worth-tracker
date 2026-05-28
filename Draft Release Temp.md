## ✨ New Features

- Added 9 risk and risk-adjusted return metrics to the benchmark comparison table in the Performance section: Volatility, Sharpe Ratio, Sortino Ratio, Calmar Ratio, Max Drawdown, Best Month, Worst Month, and positive/negative month counts.
- Added two new model portfolios to the benchmark comparison: **Permanent Portfolio** and **100% ACWI**, bringing the total from 4 to 6 model portfolios.
- Added AI narrative commentary to all periodic emails, with web search always active for macro context.
- Added monthly, quarterly, and yearly summary emails with recipient management, manual preview sending, and asset-class performance sections.
- Added a **new dedicated Analisi page** at `/dashboard/analisi` with period selector, Sankey and pie drill-downs, top expenses, anomaly detection, year-over-year comparison, savings-rate trend, and per-category sparklines.
- Added total summary rows to expense drill-down views so Sankey and pie chart drill-downs show the aggregated "Totale (N voci)" on desktop and mobile.
- Added a collapsible desktop sidebar with persisted icon-only mode.
- Added a Cashflow bottom-navigation `+` action that opens the unified movement flow.

## 🔧 Improvements

- Improved benchmark positive/negative month counters to show "X/Y" observation counts.
- Improved Sharpe and Sortino accuracy in benchmark comparison by using the period-average ECB deposit facility rate.
- Improved periodic email summaries so income and expense breakdowns show all categories with euro totals and percentages.
- Improved AI email narrative formatting for paragraphs, lists, italics, and headings.
- Improved AI Assistant macro-context behavior in chat mode and increased response length limits.
- Improved History net-worth chart styling with a clean continuous line and preserved note markers.
- Improved Cashflow/Budget error feedback and dashboard overview refresh resilience.
- Reworded expense type descriptions to clarify fixed versus variable expenses.
- Aligned Allocation table columns across cards and removed English parentheticals from asset-class names.
- Clarified FIRE runway target label.
- Added target allocation to assistant context and the "Allocazione vs target" prompt chip.
- Moved the History year-over-year variation chart into Growth Drivers and removed the redundant monthly snapshot grid.
- Made the History Work & Investments chart theme-aware.
- Reorganized navigation so read-only analysis pages live under the analytics group and Allocation lives with planning tools.
- Fixed goal-based allocation weighting to use outstanding gap multiplied by priority.
- Simplified the Overview "Sintesi Patrimoniale" card into a clearer financial-statement structure.
- Replaced hardcoded Sankey transaction colors and links with design tokens.
- Improved Assets "Δ Inizio" to use purchase cost basis when available.
- Excluded cash accounts from total unrealized G/P calculations.
- Clarified CAGR tooltips in History and Performance.
- Updated Cashflow, FIRE, and Settings tab bars to the shared underline indicator.
- Made the dashboard main background theme-aware.
- Updated the landing page feature grid to a connected hairline grid.
- Improved navigation, loading-state, motion, touch-target, and autofill accessibility across landing, auth, sidebar, bottom nav, and secondary drawer.
- Fixed sidebar accent contrast in Retro Arcade and Solar Dusk themes.

## 🐛 Bug Fixes

- Fixed YOC showing when no dividends were actually received in the trailing 12 months.
- Fixed AI email narratives rendering raw HTML details blocks or raw italic markers.
- Fixed mobile Asset Distribution pie chart clipping with many assets.
- Fixed dividend income entries not being created immediately for past payment dates.
- Fixed the Settings auto-calculate Equity/Bonds toggle persistence.
- Fixed Sankey drill-down back-navigation color restoration.
- Fixed empty-portfolio Overview charts getting stuck on "Preparazione grafico...".
- Fixed Overview loading spinner remount flicker and added chart skeletons.
- Fixed Register password mismatch error visibility.

## 🔒 Security

- Updated dependencies to resolve a critical protobufjs vulnerability and a high-severity Next.js server components denial-of-service vulnerability; Next.js updated to 16.2.4.

## 📚 Documentation

- Updated SETUP.md, VERCEL_SETUP.md, and DOCKER.md with Resend configuration notes.
