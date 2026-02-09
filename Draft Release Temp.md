# Draft Release Notes

## ✨ New Features

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

## 🐛 Bug Fixes

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

## 🔧 Improvements

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
- Interactive line chart showing 3 projected net worth paths + dashed FIRE Number reference line
- Summary cards showing "Years to FIRE" for each scenario with projected year
- Collapsible year-by-year table with detailed projections per scenario
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

### Other Improvements
- Improved milestone calculation accuracy by skipping pre-existing thresholds
- Added responsive design support for doubling time cards (mobile/tablet/desktop layouts)
- Dark mode support for all doubling time components

## 🏗️ Technical

- Fixed snapshot ID format inconsistency in database to use standardized format without zero-padding
- Added migration tooling for database maintenance scripts
