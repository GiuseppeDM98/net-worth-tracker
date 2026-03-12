## ✨ New Features

- Added **Budget** tab to Cashflow page with automatic budget tracking for all expense categories
- Budget items auto-generated from your categories (Fixed Expenses, Variable, Debt, Income) — no manual setup required
- Annual view: compare current year spending vs budget, previous year, and historical average with color-coded progress bars
- **Category deep dive**: click any category row in the annual view to open a historical panel — a year × month table spanning all available years, so you can spot seasonal patterns across all your history at a glance
- Highest and lowest spending month per year are highlighted in the deep dive (red/green, inverted for Income) — no manual scanning needed
- Collapsible sections — click any section header to expand or collapse
- Reorder budget items within sections using up/down arrows
- Add subcategory-level budget items for more granular tracking
- Income section with inverted color logic (green = income growth)
- Contextual guide ("Come leggere questa pagina") explaining each view

- Assets page now has a monthly Asset Class breakdown table — see how Equities, Bonds, Crypto, Real Estate, Liquidity, and Commodities evolved month by month in EUR totals, with color-coded month-over-month changes and summary columns (YTD %, Last Month %, From Start %)
- Assets page reorganized from 5 separate tabs into 3 grouped tabs (Management, Current Year, Historical), each containing sub-tabs for Prices, Values, and Asset Class — easier to navigate between views while keeping the temporal grouping clear
- Settings page is now organized into 4 tabs (Allocation, Preferences, Expenses, Dividends) — no more scrolling through a single long page
- Profile settings (age, risk-free rate, auto-calculate allocation formula) are now in the Allocation tab, next to the target percentages they affect
- Risk-free rate field now shows an inline link to retrieve the current BTP 10Y value directly below the input

## 🐛 Bug Fixes

- Fixed duplicate upcoming dividends appearing in the dividend table after the daily cron job ran: equity dividends (e.g. NEXI, FBK, ENI) could appear twice with identical data if Vercel retried or double-fired the cron endpoint. Auto-generated dividends now use a deterministic ID so concurrent writes are idempotent

- Fixed Yield on Cost (YOC) calculation in the Performance page: buying additional shares after a dividend payment no longer understates YOC. The metric now correctly reflects the dividend yield relative to your average cost per share, regardless of when shares were purchased
- Fixed YOC accuracy when your average cost per share changes over time: each dividend now records the exact cost basis at the time of payment, so the metric reflects what you actually paid for the shares that generated that income — not your current blended average
- Fixed "Dividendi %" in the Total Return per Asset table (Dividends page): buying additional shares no longer artificially reduces your historical dividend return percentage. Each dividend payment now contributes based on the cost basis that was in effect when it was received
- Fixed Dividends page filters: the "Dividends by Year" and "Monthly Dividend Income" charts now correctly reflect the active asset and date filters — previously they always showed all-time data for all assets regardless of active filters
- Fixed "Upcoming Dividends" card not respecting the asset filter — it now shows only upcoming dividends for the selected asset
- Fixed date filters on the Dividends page: setting only a start date (without an end date) now correctly filters the summary cards and charts. Previously, a single date bound was silently ignored

## 🔧 Improvements

- Budget annual view now shows separate **Total Expenses** and **Total Income** rows in the footer, each with their own year-over-year delta and progress bar — previously a single combined total mixed expenses and income together, producing a meaningless number
- Cashflow now shows an expense type breakdown (Fixed / Variable / Debt) pie chart in the filtered sections of both Current Year and Full History — the chart respects the active month or period filter, so it always reflects the selected time range
- "Ripristina Default" button in Settings is now only shown in the Allocation tab where it is relevant
- Settings tabs use lazy loading — only the default tab (Allocation) renders on page load
- Expense category type (Fixed, Variable, Debt, Income) can now be changed after creation — all associated transactions are updated automatically, including amount sign correction when switching between income and expense types
- Dividend table now shows a "Costo/Az." (cost per share) column displaying the historical average cost recorded at the time each dividend was paid — useful for verifying the basis used in return calculations
- AI Performance Analysis now uses Claude's native web search — no more separate Tavily integration. Claude autonomously searches for relevant market events during the analysis period and incorporates them into the commentary
- AI Performance Analysis upgraded to Claude Sonnet 4.6 (latest model)
- AI Performance Analysis now includes a full metrics panel alongside the analysis text — all performance metrics (Return, Risk, Context, Dividends) are visible in a sidebar while reading, so you can reference the numbers Claude is commenting on
- AI Performance Analysis now decomposes portfolio growth into organic returns vs. net contributions, and comments on TWR vs. MWR divergence when significant
- AI Performance Analysis dialog no longer jumps or shifts layout while text is streaming — text now appears smoothly and markdown formatting is applied only once generation is complete
- AI Performance Analysis dialog is now responsive on mobile — metrics appear above the analysis text in a compact two-column grid instead of a sidebar
- Overview (Dashboard) page is now optimized for mobile: the header title and "Create Snapshot" button stack vertically on portrait to prevent overflow; the button spans full width for easier tapping
- Overview distribution charts (Asset Class, Asset, Liquidity) are now collapsible on mobile — tap the header to expand or collapse each chart, reducing the page scroll from ~1050px of charts to three compact headers by default
- Overview metric cards now correctly display in 3 columns on landscape phones (previously only 2 columns despite available space)
