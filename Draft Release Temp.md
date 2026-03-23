## ✨ New Features

- Added smooth animated transitions between dashboard pages — navigating via the sidebar now plays a subtle fade-out then fade-in effect, making the app feel connected and polished rather than abrupt


- The theme toggle in the header now cycles through three states — **Light**, **Dark**, and **System** (follows OS preference) — using Sun, Moon, and Monitor icons respectively. Switching to System removes the manual override and re-syncs the app with the operating system's light/dark setting

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

- Fixed login requiring a second click to succeed after entering credentials — the app now correctly waits for authentication to complete before navigating to the dashboard
- Fixed registration with email/password requiring a second attempt in some cases — same underlying fix as login
- Fixed **Drawdown Duration** showing 1 month too many (e.g., "2m" when only 1 month had elapsed since the portfolio peak) — the metric now correctly shows elapsed months
- Fixed **Recovery Time** showing "1m" when the portfolio was currently at the trough — it now correctly shows "0m" (recovery hasn't started yet)

- Fixed chart tooltips on the History page: hovering over data points now shows each series label in its correct color (blue for Equities, red for Bonds, green for Liquidity, etc.) — previously all tooltip text appeared in the same neutral color regardless of the series
- Fixed chart tooltips on the Dashboard pie charts (Asset Class, Asset, Liquidity): the hovered slice name now appears in its matching color — previously always shown in neutral white regardless of the slice

- Fixed expense cards in dark mode on mobile and tablet: the date, amount box background, category labels, and notes were displayed with light-gray colors that were barely readable against a dark background — all text and backgrounds now correctly adapt to the active theme
- Fixed income and expense amounts on mobile cards appearing in a harsh bright red/green in dark mode — amounts now use softer red/green tones that are easier to read against a dark background

- Fixed the Monthly Change and Yearly Change (YTD) cards on the Dashboard always showing a green upward arrow regardless of the portfolio direction — the icon is now a red downward arrow when the value is negative, and a green upward arrow when positive

- Fixed the monthly returns heatmap on the Performance page overflowing its container on iPad Mini and similar ~744px-wide devices: the compact color-only view (green/red cells, no numbers) now correctly appears on all devices below 1440px wide — previously the full table with month names and percentages was incorrectly triggered at 640px, causing it to overflow without a scrollbar

- Fixed duplicate upcoming dividends appearing in the dividend table after the daily cron job ran: equity dividends (e.g. NEXI, FBK, ENI) could appear twice with identical data if Vercel retried or double-fired the cron endpoint. Auto-generated dividends now use a deterministic ID so concurrent writes are idempotent

- Fixed Yield on Cost (YOC) calculation in the Performance page: buying additional shares after a dividend payment no longer understates YOC. The metric now correctly reflects the dividend yield relative to your average cost per share, regardless of when shares were purchased
- Fixed YOC accuracy when your average cost per share changes over time: each dividend now records the exact cost basis at the time of payment, so the metric reflects what you actually paid for the shares that generated that income — not your current blended average
- Fixed "Dividendi %" in the Total Return per Asset table (Dividends page): buying additional shares no longer artificially reduces your historical dividend return percentage. Each dividend payment now contributes based on the cost basis that was in effect when it was received
- Fixed Dividends page filters: the "Dividends by Year" and "Monthly Dividend Income" charts now correctly reflect the active asset and date filters — previously they always showed all-time data for all assets regardless of active filters
- Fixed "Upcoming Dividends" card not respecting the asset filter — it now shows only upcoming dividends for the selected asset
- Fixed date filters on the Dividends page: setting only a start date (without an end date) now correctly filters the summary cards and charts. Previously, a single date bound was silently ignored

## 🔧 Improvements

- The "Add / Edit Asset", "New / Edit Expense", and "Delete Category" dialogs now keep their title and action buttons always visible while you scroll — the header is pinned at the top and the Save / Confirm button is pinned at the bottom, so you never need to scroll to the very end of a long form just to submit it
- The "Delete Category" confirmation dialog is now wider, uses stacked full-width buttons, and the category list dropdown is fully visible when open — previously the dropdown was clipped and the buttons overflowed the screen on mobile

- Section headers and hint cards in the FIRE Calculator and Cashflow (Current Year) pages now use consistent Lucide icons instead of emoji — icons render identically across Windows, Android, and iOS

- The Dividends & Coupons tab now shows a skeleton loading screen when first opened — the placeholder mirrors the exact layout of the real page (metric cards, charts, tables) so the page feels faster and content appears without layout jumps
- Changing asset or date filters on the Dividends page no longer blanks out the charts and tables while recalculating — existing data stays visible (slightly dimmed) while the updated statistics load in the background

- Metric card entrance animations on the Performance page now respect the system's "Reduce Motion" accessibility preference — slide-in and fade-in effects are skipped for users who have enabled reduced motion in their OS settings

- When editing an asset's quantity, the form now shows a contextual reminder if the quantity increases ("did you invest new capital? record a cashflow income entry") or decreases ("did you sell this asset? record a cashflow expense entry") — helps keep performance metrics (TWR, CAGR) accurate by ensuring capital flows are properly tracked. The reminder does not appear for cash assets or when the quantity is unchanged

- Performance page now shows a **skeleton loading screen** while data is being fetched — the placeholder mirrors the real layout (header, tabs, metric sections, charts) so the page feels faster and the transition is seamless instead of a centered spinner
- Metric cards on the Performance page now animate their values on load and whenever you switch time periods — numbers count up smoothly from zero to their final value
- Metric cards appear with a staggered cascade effect: each card slides up and fades in sequentially (left to right, section by section) instead of all appearing at once
- The "Analizza con AI" button now glows purple on hover with a rotating sparkle icon, making it visually distinct from standard actions

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
- Assets page is now fully optimized for mobile: section navigation uses a styled dropdown (instead of icon-only tabs that were unreadable on small screens), asset cards display in 2 columns on landscape phones to reduce scrolling, and action buttons ("Edit", "Delete", "Calculate Taxes") now meet the 44px minimum touch target size
- Assets page historical tables (Prices, Values, Asset Class) are now more readable on mobile — reduced cell padding and font size so more months are visible without horizontal scrolling
- A "best viewed on desktop" banner appears on the Current Year and Historical sections on mobile, since dense monthly data tables are designed for larger screens
- Assets page now correctly reserves space for the bottom navigation bar on portrait mobile (content was previously cut off)
- Asset cards now use a 2-row button layout: "Calculate Taxes" as a full-width button on top (when available), with "Edit" and "Delete" side-by-side below — eliminates cramped 3-button rows on narrow screens
- The "Last Updated" column in the Assets table now shows the exact time alongside the date, making it easy to confirm that the automatic daily price update ran as expected
- Asset Management table on desktop no longer shows the "Type" column — the Asset Class badge already conveys this visually, and removing it frees up horizontal space
- Long asset names in the Management table are now truncated at a fixed width with a tooltip on hover, preventing the table from expanding unpredictably
- The "Add / Edit Asset" dialog no longer overflows horizontally on narrow mobile screens (~375px) when subcategories are enabled — the composition row now wraps gracefully
- Added a **weighted average cost calculator** to the Add / Edit Asset form — click "Calcola PMC" next to the Average Cost field to open an inline calculator where you can enter your holdings broker by broker (quantity + price per broker); the weighted PMC is computed live and a single click fills the field. Useful when you hold the same asset across multiple brokers at different purchase prices
- Performance page is now fully usable on mobile and tablet — the period selector (YTD / 1Y / 3Y / 5Y / Storico / Custom) becomes a dropdown on phones instead of cramped tabs, the header and action buttons stack vertically on narrow screens, and the "Periodo Personalizzato" button collapses to an icon to save space
- Monthly returns heatmap now works without horizontal scrolling on mobile — each month cell shows its color coding only (green/red scale), with no numbers cluttering the view; the exact return percentage is still available on tap-and-hold. The Year column stays pinned while scrolling on tablet
- Fixed chart legends overlapping the x-axis date labels on the Performance page
- Fixed chart legends overlapping the x-axis date labels on the History page (Asset Class and Liquidity charts) on tablet portrait
- Allocation page is now fully usable on mobile and tablet — asset class cards display in a 2-column grid on tablets (768–1023px) instead of cramped 8-column tables that required horizontal scrolling; drill-down into subcategories and specific assets uses the existing bottom sheet navigation on both mobile and tablet
- "Modifica Target" button on the Allocation page is now full-width on mobile, making it easier to tap and always showing the label text
- Hall of Fame page now shows touch-friendly cards on mobile and tablet — monthly and yearly rankings display cards (instead of dense tables) on all devices below 1440px wide, including iPads in both portrait and landscape
- Hall of Fame page content is no longer cut off by the bottom navigation bar on portrait mobile
- Adding or editing a note on the Hall of Fame page now stacks the Year and Month selectors vertically on phones, making them easier to tap
- Note icon tap target on Hall of Fame has been enlarged for easier interaction on touch devices
- FIRE & Simulations page is now fully usable on mobile and tablet — the tab navigation (FIRE Calculator / Monte Carlo / Goals) becomes a dropdown on devices below 1440px wide, and all metric cards display in a single column on small screens instead of cramped multi-column grids
- FIRE page content is no longer cut off by the bottom navigation bar on portrait mobile
- FIRE projection chart height adapts to screen size — taller on desktop for detail, more compact on mobile so the chart fits without excessive scrolling; axis labels scale accordingly
- The year-by-year projection table now switches to a card-per-year layout on mobile — each card shows Bear / Base / Bull values in a compact 3-column grid instead of a 7-column table that required horizontal scrolling
- Monte Carlo simulation: the "Use Total Portfolio" and "Use Liquid Portfolio" buttons now stack vertically on mobile instead of overflowing the screen edge
- Monte Carlo simulation: the percentile table now switches to a card layout on mobile — one card per year showing all five percentile values, instead of a 6-column table
- Monte Carlo Scenario Comparison: the Bear / Base / Bull parameter cards stack vertically on mobile and tablet instead of sitting side-by-side in an unreadable layout; the header buttons no longer overflow the screen
- Goals page: objective cards now display in a 2-column grid on mobile instead of a horizontal scrollable row — all goals are visible at a glance without swiping
- Budget tab: **subtotal rows** (Subtotale Spese Fisse, Variabili, Debiti) and the **Total Expenses / Total Income** footer rows are now clickable — click any of them to open the same historical year × month deep dive panel that was previously only available for individual category rows
- Budget tab: clicking **Total Expenses** now also shows a per-type breakdown below the aggregate view — three separate month-by-month tables (Fixed Expenses, Variable, Debt) spanning all available years, with the same red/green monthly highlighting, so you can immediately see which category drove spending in any given month
- Budget tab is now fully usable on mobile — each category displays as a tappable card (tap anywhere to open a detail dialog showing budget vs actual, year-over-year delta, and historical average); sections can be expanded or collapsed with a single tap
- The historical year-by-month deep dive ("Analisi Storica") is now a desktop-exclusive feature — mobile shows a clear "available on desktop" hint inside the item detail dialog instead of an unreadable wide table that required horizontal scrolling
- Dividends page: the "Dividends by Asset" pie chart on mobile now shows the top 7 assets plus a grouped "Others" slice — previously all assets were shown, making the legend too long to read on small screens
- Dividends page: the "Dividend Per Share Growth" table is now usable on mobile — tap any asset to open a dialog showing the year-by-year DPS history as a vertical list instead of a horizontally scrollable wide table
- Dividends page: the "Total Return per Asset" table now shows a compact card layout on mobile instead of a horizontally scrolling table
- Dividends page filter dropdowns now fill the full width of the screen on mobile for visual consistency with other form elements
- Settings page is now fully usable on mobile and tablet — the tab navigation (Allocation / Preferences / Expenses / Dividends) becomes a full-width dropdown on devices below 1440px wide; form sections stack to a single column on narrow screens; subcategory target card headers no longer overflow at phone widths
- Dashboard, Hall of Fame, and History pages now animate on load — metric cards, ranking cards, and chart sections slide up and fade in sequentially instead of appearing all at once
- Collapsible sections on the Dashboard (pie charts, cost basis) and the Notes section on the History page now animate smoothly open and closed instead of snapping instantly
- Doubling Time milestone cards on the History page appear with a staggered cascade effect; the in-progress milestone's progress bar fills in from left to right on load
- All new animations automatically disable for users who have enabled "Reduce Motion" in their system accessibility settings
- The subcategory dropdown in the Add / Edit Asset form now includes a **"Create new subcategory"** option at the bottom of the list — no need to find the separate "+" button in the header; the option appears naturally while browsing existing categories
- Add / Edit Asset form is now fully usable on mobile and tablet — all two-column field rows (Ticker/Name, Type/Asset Class, Currency/Quantity, Coupon rate/frequency, Issue/Maturity dates, Average Cost/Tax Rate) now stack to a single column on phones and expand to two columns on wider screens
- The step-up coupon rate schedule (BTP Valore style) now displays as two rows on phones — year range on the first row, rate and delete button on the second — instead of four cramped columns that overflowed the screen
- The multi-broker PMC calculator rows now use a two-column layout for the quantity and price inputs at all screen sizes, with the delete button kept inline — inputs are comfortably sized even on small phones
- All dropdown selectors (asset type, asset class, subcategory, coupon frequency, etc.) now fill the full available width of their container — previously they only expanded to fit their content, leaving visual gaps in the form layout
- Login and registration pages now correctly apply dark mode — the background gradient transitions from light blue to a dark gray/black in dark mode instead of remaining light
- Password fields on the Login and Registration pages now have a show/hide toggle — tap the eye icon to reveal your password while typing
- The "Sign in with Google" and "Register with Google" buttons now display the Google logo alongside the text for clearer visual identification
- The "Create new subcategory" action in the asset form is now integrated directly into the subcategory dropdown — the standalone "+" button in the field header has been removed
- Cashflow tracking page summary cards (Total Income, Total Expenses, Net Balance, Income/Expense Ratio) now scale their font size on mobile — large amounts with 6 or more digits no longer overflow their cards on small screens
- All filters in the Cashflow tracking section (Month, Type, Category, Subcategory, Reset) now expand to fill the full screen width on mobile — previously they only took their minimum width, leaving visible gaps. The "Month" selector and "Mese corrente" button are now paired side-by-side in one row at all screen sizes
- "Subcategory" is now spelled consistently across all forms, dialogs, tables, and toast messages throughout the app — previously it appeared as three different variants depending on where you looked
- The "Save Changes" button in the Add / Edit Asset dialog is now consistent with all other forms — previously it was labeled "Update" while every other dialog already used "Save Changes"
- The sidebar, header, and bottom navigation bar now correctly adapt to light and dark mode — these components previously used fixed colors regardless of the active theme
- Settings page (all four tabs: Allocation, Preferences, Expenses, Dividends) now fully supports dark mode — page header, formula cards, subcategory rows, the Notes card at the bottom, and all buttons are correctly styled in both light and dark themes
- The on/off toggle (Switch) throughout the app is now visually distinct in dark mode — the "on" state was previously near-white and almost indistinguishable from the background
- Login and registration pages now fully match the app's dark mode design — the background uses the same dark gray as the main dashboard, cards are properly styled with dark borders and backgrounds, and text colors are consistent with the rest of the interface
- Login and registration pages now display the app's logo above the sign-in form, along with the "Portfolio Tracker" title — bringing these pages in line with the visual identity of the rest of the app
- Links on the Login and Registration pages now use the app's emerald brand color instead of blue, consistent with the rest of the interface
- Loading indicators on the Dashboard, FIRE Calculator, Monte Carlo, and Goal-Based Investing pages now show an animated spinner instead of a static "Caricamento..." text — the spinner is visible and clearly communicates the loading state in both light and dark mode
- History page now shows a skeleton loading screen while data is being fetched — the placeholder mirrors the exact layout of the page (header, 8 chart sections, snapshot grid) so the transition from loading to loaded feels seamless instead of a sudden appearance
- FIRE Calculator, Monte Carlo, and Goals tabs now show skeleton loading screens that mirror their real layouts while settings and portfolio data are being loaded
- All charts (bar charts, line charts, area charts, and pie charts) now animate smoothly on load — bars grow up from the baseline, lines draw in from left to right, pie slices fan out, and area fills expand into view. Every page with data visualization benefits: History, Performance, Cashflow, Dividends, FIRE, Monte Carlo, Goals, and the portfolio allocation pie
- All buttons now respond to hover with a subtle lift effect and to click/tap with a gentle press-down animation — providing consistent tactile feedback throughout the app. Ghost buttons, link buttons, and icon buttons keep the press feedback only (no lift), matching the existing behavior of metric and ranking cards
- Budget tab collapsible sections (Fixed Expenses, Variable, Debt, Income) now animate smoothly open and closed — expanding slides the rows down with a fade-in and collapsing slides them back up, instead of snapping instantly. The chevron indicator rotates to signal direction. Works on both desktop and mobile views
- Budget tab: the section chevron now clearly indicates expanded (↑) vs collapsed (↓) state at a glance

## 🐛 Bug Fixes

- Fixed the Budget tab historical analysis panel ("Analisi Storica") sometimes requiring an extra scroll to become visible after clicking a category row — the page now always scrolls the panel into view at the top of the viewport after the animation completes
- Fixed the "available on desktop only" hint in the mobile Budget item dialog: the message now clearly states that "L'analisi storica mensile" (monthly historical analysis) is what requires a larger screen, instead of the generic and confusing "Disponibile solo su desktop"
- Performance page chart sections (portfolio evolution, rolling CAGR, rolling Sharpe, monthly heatmap, underwater drawdown, methodology) now animate in with a staggered cascade on load — each chart slides up and fades in sequentially instead of appearing all at once
- The Dividends tab now animates in with a staggered cascade when first opened — action buttons, filters, statistics charts, and the dividend table each appear sequentially with a subtle slide-up effect

## 🔒 Security

- Updated Next.js, undici, fast-xml-parser, and flatted dependencies to patch 3 high-severity and 1 moderate-severity vulnerabilities
