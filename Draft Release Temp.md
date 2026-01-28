# Draft Release Notes

## ✨ New Features

### Month Filter for Sankey Chart
- Added month filter to Sankey flow diagram in Current Year cashflow tab
- Filter dropdown with all 12 months in Italian + "All year" option to easily analyze specific months
- Visual indicator banner showing active filter with quick clear button
- Dynamic chart title updates to reflect selected month (e.g., "Cashflow January 2026")
- Helpful empty state message when selected month has no transactions
- Filter affects only the Sankey chart, leaving other charts (trends, pie charts) unaffected for full year comparison
- Timezone-aware filtering ensures consistent results regardless of server location

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

- Fixed threshold milestones incorrectly showing 0-month duration when portfolio tracking started with net worth already above threshold value (e.g., starting at €164k would show €100k milestone as "reached in 0 months")
- **CRITICAL**: Fixed data loss bug where Hall of Fame notes were deleted every time a new snapshot was created from the Dashboard
  - Notes are now properly preserved during automatic ranking recalculations
  - Affects only Dashboard snapshot creation; monthly automated snapshots were not affected

## 🔧 Improvements

### AI Performance Analysis Enhancements
- Enhanced dialog with exact date range display for all time periods instead of generic labels (e.g., "feb 25 - gen 26" instead of "Last Year")
- Wider dialog layout (896px) for better text readability and structure with longer AI analysis
- Added financial market events context to AI analysis - identifies key events (crises, rallies, geopolitical shocks, central bank decisions) that may have impacted your portfolio performance during the analyzed period
- AI now correctly analyzes historical periods beyond January 2025 by providing current date context
- Added summary metrics header showing ROI, CAGR, and TWR at a glance with color-coded positive/negative indicators (green/red)
- Added copy-to-clipboard button with visual feedback to easily save analysis text
- Added generation timestamp showing when analysis was created in Italian format
- Extended Thinking enabled for deeper AI reasoning (10k token budget) resulting in more insightful analysis
- Increased analysis length from 300 to 350 words to accommodate market events context

### Other Improvements
- Improved milestone calculation accuracy by skipping pre-existing thresholds
- Added responsive design support for doubling time cards (mobile/tablet/desktop layouts)
- Dark mode support for all doubling time components

## 🏗️ Technical

- Fixed snapshot ID format inconsistency in database to use standardized format without zero-padding
- Added migration tooling for database maintenance scripts
