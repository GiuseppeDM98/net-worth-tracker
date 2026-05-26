## ✨ New Features

- **New dedicated Analisi page** — cashflow analysis now lives at its own URL (`/dashboard/analisi`) instead of being buried as a tab inside Cashflow. Navigate directly to it from the sidebar or bottom navigation. The page includes the full period selector (current year / specific year / full history), the Sankey diagram, pie chart drill-downs, top expenses block, and all analytical sections described below
- **Spending anomaly detection** — a new block at the top of the Analisi page automatically flags categories where this month's spending is unusually high compared to the rolling 6-month average (threshold: +25% and +€50). Tap any flagged category chip to jump directly to the relevant section of the Sankey chart
- **Year-over-year comparison charts** — a new "Confronto Annuale" section shows whether you're spending more or less than the same period last year, split either by month (grouped bar chart) or by category (horizontal bar chart). In full-history mode it shows a multi-year bar chart across all available years
- **Savings rate trend** — a new 24-month line chart shows how your savings rate has evolved over time, with a 20% reference line and a red shaded area below the target so you can see at a glance when you fell short
- **Per-category spending sparklines** — a new grid shows a mini area chart for every expense category with at least 3 months of data, ordered by total spend. Tap any card to expand it into a full bar chart for that category's month-by-month history
- Added a **total summary row** to all expense drill-down views in the Cashflow Analisi tab. When drilling into any Sankey node or pie chart category, a "Totale (N voci)" row now appears at the bottom of the transaction list showing the aggregated sum — so you can see the full amount at a glance without scrolling through every entry. Available on both desktop (table footer row) and mobile (summary block below the card list)

## 🐛 Bug Fixes

- Fixed the "Auto-calculate Equity/Bonds" toggle in Settings not persisting after a page refresh — disabling it would revert to enabled on reload because the setting was never saved explicitly
- Fixed a color regression in the Cashflow Sankey chart: after drilling into a spending category (e.g. "Rifiuti") and pressing "Indietro", the panel header reverted to the subcategory's derived gray color instead of the parent type's original color (e.g. blue for "Spese Fisse"). Navigation now correctly restores the original type color at every level

## 🔧 Improvements

- **Navigation reorganized** — the sidebar group is now called "Statistiche" and contains the read-only analytical pages (Analisi, Rendimenti, Storico, Hall of Fame, Assistente AI). The Allocation page has moved to the "Pianificazione" group alongside FIRE & Simulations, since it drives buy/sell/hold decisions rather than being a passive view
- **Goal-based allocation targets** (Settings → Preferences → "Allocazione da Obiettivi") now correctly reflect investment priorities: each goal is weighted by its outstanding gap multiplied by its priority level (Alta 3×, Media 2×, Bassa 1×). Goals that are already fully funded are excluded from the calculation. Previously, only the target amount was used as weight, which made the priority setting have no meaningful effect
- The Allocation page banner and the Goals tab now explain how the priority weighting affects allocation targets, so the logic is transparent and actionable
- The **Overview "Sintesi Patrimoniale" card** no longer shows a redundant large number at the top. The card now reads as a clean financial statement — asset breakdown flows naturally into the fiscal impact section, with "Pat. Netto Totale" as the clear bottom-line conclusion
- Transaction list amounts in the Cashflow Sankey drill-down now use design system color tokens instead of hardcoded hex values — positive amounts in green, negative in red, both correctly adapted to all six color themes and dark mode
- Links in the Sankey transaction detail now use the `primary` color token instead of a hardcoded blue, staying consistent with the rest of the app
