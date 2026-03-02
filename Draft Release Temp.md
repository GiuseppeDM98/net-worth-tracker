# Draft Release Notes

## ✨ New Features

### Stamp Duty (Imposta di Bollo) Tracking
- Enable stamp duty tracking from Settings with a configurable annual rate (e.g. 0.20%)
- Stamp duty cost is included in the "Annual Portfolio Cost" card on the dashboard, alongside TER costs — a breakdown shows each component when both are active
- Specify which cash sub-category represents checking accounts (conti correnti): stamp duty for these accounts applies only when their balance exceeds €5,000
- Mark any individual asset as exempt from stamp duty directly from the asset edit dialog — useful for pension funds, real estate, or any other asset that qualifies for exemption

### Linked Cash Account for Transactions
- Link any expense or income entry to a cash account (bank account, current account) directly from the transaction dialog
- Account balance updates automatically when a transaction is saved — no manual adjustment needed
- Bidirectional: editing a transaction adjusts the balance by the delta; deleting reverses the effect
- For recurring and installment series, only the first entry updates the account balance
- Optional field: fully backwards-compatible with existing transactions

### Default Cash Accounts in Settings
- Set a default withdrawal account for expenses and a separate default credit account for income in Settings
- Pre-selected automatically when creating new transactions — override anytime in the dialog
- Label in the dialog adapts dynamically: "Withdrawal Account" for expenses, "Credit Account" for income
- Dropdowns only appear in Settings if you have at least one cash-class asset

### Unified Month Filter for Cashflow Charts
- Added unified month filter for 3 main cashflow charts in Current Year tab: Sankey diagram, Expenses by Category, and Income by Category
- Filter dropdown with all 12 months in Italian + "All year" option to easily analyze specific months
- Charts reordered with filtered section at the top for better visibility (Sankey → Expenses → Income → other charts)
- Visual grouping with blue-bordered container clearly showing which charts are affected by the filter
- Visual indicator banner showing active filter with quick clear button
- Dynamic chart titles update to reflect selected month (e.g., "Expenses by Category - March 2026")
- Drill-down navigation preserved when changing month filter - explore subcategories in filtered data without losing your place
- Helpful empty state message when selected month has no transactions
- Timezone-aware filtering ensures consistent results regardless of server location
- Filter does not affect other charts (trends, expense types) for full year comparison

### Doubling Time Analysis
- Added Doubling Time Analysis section to History page to track how long your net worth takes to double over time
- Dual-mode visualization:
  - **Geometric mode**: Track exponential growth (2x, 4x, 8x, 16x...)
  - **Fixed Thresholds mode**: Track psychological milestones (€100k, €200k, €500k, €1M, €2M)
- Toggle button to easily switch between calculation modes
- Summary metrics dashboard showing:
  - Fastest doubling period achieved
  - Average time to double across all milestones
  - Total number of milestones completed
- Timeline visualization displaying all completed milestones with detailed information
- Progress tracking for current milestone in progress with percentage completion and progress bar
- Smart handling of edge cases (negative net worth periods, insufficient data, portfolios starting above thresholds)

### AI Performance Analysis
- Added AI-powered portfolio analysis button on Performance page powered by Claude Sonnet 4.5
- Click "Analizza con AI" button (with sparkles icon) to get instant AI-generated insights on your portfolio metrics
- Real-time streaming analysis appears progressively as it's generated (ChatGPT-style experience)
- AI analyzes all your performance metrics (returns, risk, dividends) for the selected time period
- Get actionable insights including:
  - Interpretation of key metrics and what they mean for your portfolio
  - Strengths highlighted in your performance
  - Areas for improvement or risks to consider
  - Concrete suggestions when appropriate
- Beautiful dialog interface with markdown formatting (bold text, bullet points) for easy reading
- Regenerate button to get fresh analysis if needed
- Works across all time periods (YTD, 1Y, 3Y, 5Y, ALL, CUSTOM)
- Analysis in Italian language matching the rest of the app
- Disclaimer footer reminding users that AI analysis is not financial advice

### Period Analysis in Total History (Cashflow)
- Added "Analisi Periodo" section to the Total History (Storico Totale) tab in Cashflow page
- Three interactive charts: Sankey flow diagram, Expenses by Category pie chart, Income by Category pie chart
- Year + Month filtering: optionally filter by year first, then refine by month
- Shows all historical data (2025+) by default — filters are optional refinements, not prerequisites
- Three-level drill-down on pie charts: Category → Subcategory → Individual transactions with dates, amounts, notes, and links
- Blue-bordered container with filter badge showing active filters and quick clear button
- Dynamic chart titles update to reflect selected period (e.g., "Flusso Finanziario - Gennaio 2026")
- Drill-down state resets automatically when filters change to prevent stale data
- Removed redundant standalone Sankey chart (now integrated in the Analisi Periodo section with filtering support)

### Hall of Fame Dedicated Notes System
- Added dedicated notes system for Hall of Fame rankings, completely separate from History page notes
- Create and edit notes associated with specific time periods (year and optional month)
- **Multi-section support**: Associate a single note with multiple ranking tables using checkboxes
  - Example: "Bought car €22,000" can appear in both "Worst Month: Expenses" and "Worst Month: Net Worth Change"
- **Improved UX with dual-dialog pattern**: Click amber icon to view note first (read-only), then optionally edit
  - View dialog shows note content with period and associated sections in clean, organized layout
  - "Modifica Nota" button in view dialog footer transitions to edit mode when needed
  - Separates casual viewing from intentional editing for better user experience
- Smart month field: Automatically hides when only yearly sections selected, becomes required for monthly sections
- Visual note indicators: Amber message icon buttons displayed in relevant ranking tables
- "Aggiungi Nota" button in page header for creating new notes
- Note preservation: User notes automatically preserved during ranking recalculations (triggered after new snapshots)
- 500 character limit with real-time counter and color-coded warnings (green/orange/red)
- Full CRUD operations: Create, view, edit, and delete notes with instant UI updates
- Period-specific filtering: Notes only appear in tables matching their year/month and selected sections
- Available for all 8 ranking tables: 4 monthly (Best/Worst by Net Worth/Income/Expenses) + 4 yearly

### Bond Coupon Scheduling with Step-Up Rates and Final Premium
- Bonds now support automatic coupon generation: configure coupon rate, frequency (monthly/quarterly/semiannual/annual), issue date, maturity date, and nominal value per unit to generate the next coupon automatically on every save
- **Step-up coupon rates**: enable variable coupon rates with up to 5 rate tiers, each covering a range of bond years (e.g. BTP Valore: 2.50% years 1–2, 2.80% years 3–4, 3.20% years 5–6) — each coupon is calculated using the applicable rate for its payment date
- **Final premium (Premio Finale)**: set an optional bonus percentage paid at maturity (e.g. BTP Valore 0.8% of nominal value) — automatically recorded as a "Premio Finale" dividend entry on the maturity date
- **Italian government bond tax hint**: clickable shortcut under the tax rate field fills in 12.5% for BTP, BOT, and CCT bonds
- Bond details (coupon schedule) and cost basis sections now open automatically when creating a new bond asset
- Coupon and final premium entries are recreated automatically whenever you edit and save the asset (e.g. when updating quantity)

### Bond Price Tracking from Borsa Italiana
- Added automatic bond price updates from Borsa Italiana for Italian MOT bonds with ISIN codes
- ISIN field now editable for bonds in asset form (previously only available for stocks/ETFs for dividend tracking)
- Dual-source price fetching: Borsa Italiana as primary source for bonds, Yahoo Finance as fallback
- Integrated in 3 price update flows: monthly automatic snapshots, manual "Update Prices" button, and "Create Snapshot" button
- Dynamic UI labels show correct price source ("Borsa Italiana" for bonds with ISIN, "Yahoo Finance" for other assets)
- Graceful error handling with automatic fallback to Yahoo Finance if Borsa Italiana scraping fails
- Multi-level fallback strategy within Borsa Italiana scraper (ultimo contratto → prezzo ufficiale → apertura → table structure)
- Test API endpoint `/api/prices/bond-quote?isin={ISIN}` for manual price validation
- 6 new unit tests covering ISIN validation logic for Italian bonds
- Timeout optimized for Borsa Italiana's response times (30 seconds)
- Backward compatible: bonds without ISIN continue using Yahoo Finance exclusively

### Bulk Move Transactions Between Categories
- Move all transactions from one category or subcategory to another without deleting the source
- Cross-type support: move transactions between different expense types (e.g., from Fixed Expenses to Variable Expenses or Income)
- Available from Settings page: blue arrow icon on each category row, and inside category edit dialog for subcategories
- Searchable destination picker with inline category creation
- Automatic amount sign correction when moving between income and expense types
- Warning banner when moving across different expense types so you know what will change
- Source category/subcategory is preserved after the move

### Goal-Based Investing
- Mentally allocate portions of your portfolio to different financial goals (house purchase, retirement, car, emergency fund, children's savings, etc.)
- Enable/disable from Settings with a dedicated toggle
- Create goals with optional target amount, target date, priority level, color, and notes
- Quick-start templates for common goals: House Purchase, Retirement, Car, Emergency Fund
- Assign assets to goals by percentage — stored as %, displayed as EUR equivalent (scales automatically with price changes)
- Optional recommended allocation per goal (e.g., 70% bonds / 30% equity for house purchase)
- Visual comparison of actual vs recommended asset class allocation for each goal
- Summary cards showing progress toward each goal with progress bar (or accumulated value for open-ended goals)
- Portfolio allocation pie chart showing how your total portfolio is distributed across goals
- Expandable detail cards with assigned assets table, allocation comparison, and remaining amount
- Validation warnings when any asset is over-assigned (>100% across all goals)
- Open-ended goals supported: skip the target amount for goals like "save for children" with no fixed target
- Located in FIRE & Simulations page as the 3rd tab "Obiettivi"
- 21 unit tests covering all calculation logic

### Goal-Driven Asset Allocation
- Added option to automatically derive portfolio allocation targets from your financial goals
- New "Allocazione da Obiettivi" toggle in Settings (appears only when Goal-Based Investing is enabled)
- When enabled, the Allocation page calculates target percentages as a weighted average of each goal's recommended allocation
- Goals with a target amount use that amount as weight; open-ended goals use their current assigned value
- Sub-category drill-down preserved: only asset class targets are overridden, sub-category structure from Settings remains intact
- Green banner indicator on Allocation page shows when targets are derived from goals
- Automatic fallback to manual Settings targets when goal data is insufficient (no goals with recommended allocation)
- Disabling Goal-Based Investing automatically disables goal-driven allocation

## 🐛 Bug Fixes

- Fixed asset value history (Current Year Values / Historical Values tabs) showing "0,00€" instead of the correct amount for assets whose monthly snapshot was captured while their quantity was 0 — value is now correctly recalculated from the stored unit price × quantity. Future snapshots also no longer include zero-quantity assets in the per-asset breakdown to prevent recurrence.

- Fixed dividend page asset filter not showing bond assets — bonds are now listed alongside stocks and ETFs in the filter dropdown so you can filter coupon entries by bond
- Fixed dividend charts (by asset, by year, monthly trend) not updating when filtering by a specific asset — selecting an asset now refreshes both the table and all stats charts together
- Fixed a zero-value coupon entry being created when a bond's quantity was set to 0 (sold position) — coupons are now correctly cleaned up and no €0 record is inserted

- Fixed bond total value showing 10× lower than expected when using Borsa Italiana prices — bond prices are quoted as a percentage of par value (e.g. 104.2%) and are now correctly converted to EUR per unit using the nominal value before being saved (e.g. 104.2% × €1,000 nominal = €1,042 per bond)
- Fixed bond cost basis (average purchase price) being stored incorrectly, causing YOC and Current Yield metrics to show inflated values — manually entered cost basis now uses the same Borsa Italiana convention as auto-fetched prices (price per 100€ of nominal), so entering "100" for a bond bought at par correctly stores €1,000 per unit instead of €100
- Fixed bond price and cost basis being multiplied again each time you opened and re-saved a bond without making changes — edit form now shows back-converted Borsa Italiana price so saving without edits leaves values unchanged

- Fixed Time-Weighted Return (TWR) showing inflated values for short time periods — on a YTD period with only 1–2 months of data, TWR could show values approximately 2× higher than CAGR for the same period. TWR and CAGR now use the same period duration calculation and produce consistent annualized results.

- Fixed performance period filter silently dropping the first month of returns for all time periods (YTD, 1Y, 3Y, 5Y). For example, YTD in February only measured February's performance — January was lost because the first snapshot was used as baseline instead of having a proper pre-period baseline. All periods now include a baseline month so every month within the selected range contributes to performance calculations.

- Fixed monthly returns heatmap showing an empty row for the previous year when viewing YTD performance (e.g., a 2025 row with all dashes when viewing YTD in 2026).

- **CRITICAL**: Fixed user registration failing with permission error when creating default asset allocation settings
  - New users can now successfully complete registration without "Missing or insufficient permissions" errors
  - Registration process is now more reliable with automatic retry logic for edge cases
  - Affected both email/password and Google OAuth registration flows
  - Root cause was a race condition between Firebase Auth token refresh and Firestore security rules evaluation
  - Solution includes forced token refresh after user creation + retry mechanism + improved Firestore security rules
- Fixed threshold milestones incorrectly showing 0-month duration when portfolio tracking started with net worth already above threshold value (e.g., starting at €164k would show €100k milestone as "reached in 0 months")
- **CRITICAL**: Fixed data loss bug where Hall of Fame notes were deleted every time a new snapshot was created from the Dashboard
  - Notes are now properly preserved during automatic ranking recalculations
  - Affects only Dashboard snapshot creation; monthly automated snapshots were not affected
- **CRITICAL**: Fixed historical asset values total calculation incorrectly excluding sold assets from monthly totals
  - Assets that were in the portfolio during historical snapshot months are now correctly included in the total row
  - Affects both "Valori Storici" (Historical Values) and "Valori Anno Corrente" (Current Year Values) tabs
  - Total row now matches manual sum of displayed asset values for each month
  - Month-over-month percentage changes recalculate correctly based on accurate totals
- Fixed Radix Select crash when choosing "No subcategory" option during category reassignment (empty string value not allowed by Radix UI)

### PDF Export Custom Period Selection
- Annual and monthly PDF exports can now target any past year or month — no longer locked to the current date
- Year dropdown populated from available snapshot data (most recent first)
- Month dropdown for monthly exports, dynamically filtered by available months in the selected year
- Intelligent section disabling for past periods:
  - **Past yearly export**: Portfolio, Allocation, Summary, and FIRE sections are automatically disabled (they use live portfolio data, not historical)
  - **Monthly export**: Only Cashflow section is available (single-month data lacks context for trends and projections)
  - **Current year / Total export**: All 8 sections remain available
- Disabled sections show explanatory warning messages in the export dialog
- Cover page and report labels correctly reflect the selected period (e.g., "Report Annuale - 2024")
- Performance data for past years uses correct period label ("Anno 2024" instead of "YTD 2024")

### Dynamic Doubling Time Summary Cards
- Summary cards in the Doubling Time Analysis section now adapt their text to the selected calculation mode
- **Geometric mode**: "Raddoppio Più Rapido", "Tempo Medio di Raddoppio", doubling-focused tooltips
- **Threshold mode**: "Traguardo Più Rapido", "Tempo Medio per Traguardo", milestone-focused tooltips
- Subtitle text ("raddoppio/i" vs "traguardo/i") and tooltip explanations update accordingly
- Previously, cards always showed doubling-related text regardless of mode selection

## 🔧 Improvements

### Income Metrics Section Renamed
- The "Dividend Metrics" section on the Performance page is now called "Income Metrics" (Metriche da Proventi Finanziari) — the metrics it contains (YOC and Current Yield) apply equally to stock dividends and bond coupons, so the name now reflects both

### Bond Cost Basis Input Redesigned
- The "Average Cost" field for bonds now uses the Borsa Italiana price convention (price per 100€ of nominal), consistent with how bond prices are displayed and auto-fetched — enter the price you paid as shown on Borsa Italiana (e.g. 100 for a bond bought at par, 95.50 for a discount bond)
- Live EUR preview shown below the field as you type (e.g. typing "95" with a €1,000 nominal bond shows "≈ 950.00€ per unit") so you always see exactly what will be saved
- Field label and placeholder adapt contextually: bonds with ISIN and nominal value show bond-specific guidance; all other assets show the standard EUR label

### Dividend Page Filter Repositioned to Top
- Filters (asset, type, date range) are now displayed above the statistics charts instead of below them
- Since filters affect both the charts and the transaction table, placing them at the top makes it immediately clear that they control the entire page



### Monte Carlo Smart Asset Allocation
- Monte Carlo simulation now auto-populates asset allocation from your real portfolio instead of defaulting to 60/40/0/0
- Allocation is derived from actual portfolio holdings across the 4 simulation asset classes (Equity, Bonds, Real Estate, Commodities)
- Crypto and cash holdings are excluded and the remaining classes are normalized to 100%
- Falls back to the classic 60/40/0/0 if none of the 4 classes are in your portfolio
- You can still manually adjust the percentages after auto-fill

### Monte Carlo Simulation Simplification
- Removed unreliable "Use personal historical data" toggle that produced inflated return estimates (e.g., 69% equity returns instead of realistic 7%)
- Monte Carlo simulation now uses editable market defaults (Equity 7%/18%, Bonds 3%/6%) as the standard for FIRE planning
- All market parameters remain fully customizable to test different scenarios
- Cleaner, simpler interface with descriptive guidance text under market parameters section

### AI Performance Analysis Enhancements
- **Real-time web search integration**: AI now fetches actual financial news from the analyzed period to provide context
  - Powered by Tavily API with multi-query approach (3 parallel searches for comprehensive coverage)
  - Searches 3 event categories: Central Banks (Fed/ECB decisions), Geopolitical Events (tariffs, elections, policy changes), and Market Events (crashes, rallies, volatility)
  - Displays top 6 most relevant news articles from trusted sources (WSJ, Bloomberg, Financial Times, Reuters)
  - Captures important events beyond AI's knowledge cutoff (e.g., Liberation Day 2025, recent Fed meetings, market volatility)
  - Results are balanced across categories to prevent any single topic from dominating
  - Gracefully continues analysis even if web search fails (no crashes or errors)
- Enhanced dialog with exact date range display for all time periods instead of generic labels (e.g., "feb 25 - gen 26" instead of "Last Year")
- Wider dialog layout (896px) for better text readability and structure with longer AI analysis
- Added financial market events context to AI analysis - identifies key events (crises, rallies, geopolitical shocks, central bank decisions) that may have impacted your portfolio performance during the analyzed period
- AI now correctly analyzes historical periods beyond January 2025 by providing current date context
- Added summary metrics header showing ROI, CAGR, and TWR at a glance with color-coded positive/negative indicators (green/red)
- Added copy-to-clipboard button with visual feedback to easily save analysis text
- Added generation timestamp showing when analysis was created in Italian format
- Extended Thinking enabled for deeper AI reasoning (10k token budget) resulting in more insightful analysis
- Increased analysis length from 300 to 350 words to accommodate market events context

### FIRE Projection Scenarios (Bear / Base / Bull)
- Added deterministic portfolio projection under 3 market scenarios to the FIRE Calculator tab
- Each scenario models different market growth rates and inflation rates:
  - **Bear**: 4% growth, 3.5% inflation (stagflation-like)
  - **Base**: 7% growth, 2.5% inflation (historical average)
  - **Bull**: 10% growth, 1.5% inflation (Goldilocks economy)
- Annual expenses increase with inflation year-over-year, making the FIRE Number a moving target
- Annual savings auto-calculated from your real cashflow data (income - expenses from last complete year)
- Interactive line chart with 3 projected net worth paths + 3 dashed FIRE Number lines (one per scenario, color-matched)
- Vertical reference lines marking the exact year FIRE is reached for each scenario
- Summary cards showing "Years to FIRE" for each scenario with projected year
- Collapsible year-by-year table grouped by scenario, showing both portfolio value and FIRE Number side-by-side
- Annual savings automatically stop for a scenario once FIRE is reached (simulates retirement — no more work income)
- All scenario parameters are fully customizable and can be saved for future sessions
- "Reset to Default" button to restore original scenario values
- Respects the "Include Primary Residence" toggle for net worth calculation
- Complementary to Monte Carlo (stochastic): projections are deterministic for quick planning

### Average Cost Precision
- Increased average cost per share precision from 2 to 4 decimal places (e.g., €100.1119 instead of €100.11)
- More accurate gain/loss calculations, especially for assets with low prices or large quantities
- Input field now accepts up to 4 decimals to match broker precision
- All displays updated: asset cards, management table, and tax calculator
- Backward compatible: existing assets with 2 decimals display correctly with trailing zeros

### Asset Price Display at 4 Decimal Places
- Asset prices now display with 4 decimal places throughout the app (asset table, cards, tax calculator), matching the existing precision of average cost (PMC)
- More accurate price display for bonds, low-priced stocks, and cryptocurrencies
- Manual price input field now accepts up to 4 decimal places

### Zero-Quantity Asset Support
- Assets with a quantity of 0 can now be saved to the portfolio — useful for tracking fully sold positions without losing history
- Zero-quantity assets show an "Azzerato" badge in the asset table and mobile cards for quick identification
- Zero-quantity assets appear with a "Venduto" badge in price history — historical data is preserved and the badge disappears automatically when quantity is restored
- Dashboard asset counter excludes zero-quantity assets from the total count

### Other Improvements
- Improved milestone calculation accuracy by skipping pre-existing thresholds
- Added responsive design support for doubling time cards (mobile/tablet/desktop layouts)
- Dark mode support for all doubling time components

### Monte Carlo 4 Asset Classes + Scenario Comparison
- Expanded Monte Carlo simulation from 2 to 4 asset classes: Equity, Bonds, Real Estate, and Commodities
  - Each asset class has independent return and volatility parameters
  - Default allocation 60/40/0/0 for backward compatibility — new classes weight 0% until activated
- Added **Bear/Base/Bull Scenario Comparison** mode with toggle to switch between single simulation and scenario comparison
  - Three editable parameter cards (one per scenario) with per-scenario returns, volatilities, and inflation rates
  - Overlay chart showing 3 median lines with semi-transparent p10-p90 bands per scenario
  - Three success rate cards showing simulation outcomes per scenario
  - Three side-by-side distribution histograms colored by scenario (red/indigo/green)
  - Comparison table with median portfolio values at 5-year intervals
  - All scenario parameters persist to Firestore for future sessions
  - "Reset to Default" button to restore standard scenario values
- Bear defaults: equity 4%/20%, bonds 2%/7%, real estate 2%/14%, commodities 1%/22%, inflation 3.5%
- Base defaults: equity 7%/18%, bonds 3%/6%, real estate 5%/12%, commodities 3.5%/20%, inflation 2.5%
- Bull defaults: equity 10%/16%, bonds 4%/5%, real estate 8%/10%, commodities 6%/18%, inflation 1.5%

## 🏗️ Technical

- Fixed snapshot ID format inconsistency in database to use standardized format without zero-padding
- Added migration tooling for database maintenance scripts
- Added unit testing infrastructure with Vitest (158 tests covering formatters, date helpers, FIRE calculations, performance metrics, bond ISIN validation, TWR, IRR, and cash flow processing)
