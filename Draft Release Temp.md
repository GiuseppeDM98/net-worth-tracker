## What's New

### Features

- **Max Drawdown Risk Metric**: New downside risk measurement to track worst portfolio declines
  - **Portfolio risk visibility**: Shows maximum percentage loss from peak to trough before recovery (e.g., -15.5% means portfolio fell 15.5% from its highest point)
  - **Cash flow adjusted**: Automatically excludes contributions and withdrawals to isolate true investment performance
  - **All timeframes supported**: Available for YTD, 1Y, 3Y, 5Y, All Time, and Custom date ranges
  - **Smart null handling**: Displays "N/D" when portfolio has never declined (always growing)
  - **Color-coded display**: Negative values shown in red for immediate visual recognition
  - **Educational tooltip**: Detailed explanation with practical example (€100k → €85k = -15% drawdown)
  - **Professional layout**: Dedicated third row in Performance page metrics grid
  - **Zero performance impact**: Uses already-cached snapshot data with no additional database queries

- **Drawdown Duration Metric**: Portfolio resilience measurement showing recovery time from worst losses
  - **Recovery time visibility**: Shows how many months it took to recover from the deepest Max Drawdown (e.g., "11m" means 11 months from peak to recovery)
  - **Perfect alignment with Max Drawdown**: Uses identical cash flow adjustment logic to ensure both metrics analyze the same drawdown event
  - **Ongoing drawdown support**: Displays current duration if portfolio hasn't recovered yet (e.g., "5m and counting")
  - **Intuitive time format**: Automatically displays as months ("5m") or years + months ("1a 3m" for 15 months)
  - **All timeframes supported**: Available for YTD, 1Y, 3Y, 5Y, All Time, and Custom date ranges
  - **Smart null handling**: Displays "N/D" when portfolio has never declined
  - **Educational tooltip**: Detailed explanation with practical example (15% loss in Jan → recovery in Dec = 11 months duration)
  - **Complementary metric**: Pairs with Max Drawdown to tell complete story (depth + recovery speed)
  - **Professional layout**: Positioned next to Max Drawdown in third row of Performance page metrics grid

- **Recovery Time Metric**: Ascent-only measurement showing speed of portfolio recovery from downturns
  - **Trough-to-recovery tracking**: Measures months from lowest point (trough) to full recovery, isolating the ascent phase (e.g., "4m" means 4 months from bottom to recovery)
  - **Complements Drawdown Duration**: Shows only recovery phase, while Drawdown Duration includes both descent and ascent (Drawdown Duration = Descent Time + Recovery Time)
  - **Perfect coherence**: Uses identical cash flow adjustment as Max Drawdown and Drawdown Duration to analyze the same drawdown event
  - **Ongoing drawdown display**: Shows months from trough to present if portfolio hasn't recovered yet
  - **Visual consistency**: Same intuitive time format as Drawdown Duration (months or years + months)
  - **All timeframes supported**: Available for YTD, 1Y, 3Y, 5Y, All Time, and Custom date ranges
  - **Smart null handling**: Displays "N/D" when portfolio has never declined
  - **Educational tooltip**: Practical example explaining recovery-only measurement (6 months down + 4 months up = 4 months Recovery Time)
  - **Professional layout**: Third metric in Performance page Row 3, completing the drawdown analysis suite

- **Temporal Context for Drawdown Metrics**: Enhanced drawdown metrics with when/where information for actionable insights
  - **Trough date display**: Max Drawdown now shows the month when the lowest point occurred (e.g., "04/25")
  - **Period ranges**: Drawdown Duration and Recovery Time display start-to-end periods (e.g., "01/25 - 07/25" for completed, "01/25 - Presente" for ongoing)
  - **MM/YY format**: Compact Italian-aligned date format for quick scanning
  - **Subtitle layout**: Temporal context appears below main metric value in subtle gray for clean visual hierarchy
  - **Instant context**: See at a glance when drawdowns happened without hovering or drilling down
  - **All timeframes**: Temporal data updates dynamically when switching between YTD, 1Y, 3Y, 5Y, All Time, and Custom
  - **Null-safe**: Temporal info hidden when metric shows "N/D" (no drawdown occurred)
  - **Professional presentation**: Non-intrusive design maintains metric card readability

- **PDF Export with Enhanced Accuracy** (#68): Comprehensive portfolio reports with professional formatting
  - **Customizable sections**: Toggle 6 report sections (Portfolio, Allocation, History, Cashflow, FIRE, Summary)
  - **Dynamic FIRE calculations**: Safe Withdrawal Rate automatically retrieved from user settings (defaults to 4%)
  - **Accurate multiplier display**: FIRE Number shows correct multiplier (25x for 4% SWR, 33.33x for 3%, 20x for 5%)
  - **Trinity Study conditional**: Detailed 95%+ success rate explanation appears only when SWR = 4%
  - **Fixed monthly savings**: Now displays average per-month savings instead of total (e.g., "€999.87/month over 12 months")
  - **Complete rebalancing**: Asset classes with 0€ current value but positive targets now appear in rebalancing actions
  - **Threshold compliance**: Confirmed ±2% percentage point threshold for rebalancing recommendations
  - **Professional formatting**: Embedded charts, color-coded metrics, branded headers/footers
  - **One-click export**: Generates and downloads PDF with timestamp filename

- **PDF Export with Temporal Filtering**: Enhanced portfolio reports with time-period selection and smart section management
  - **Three export modes**: Choose between Total (all-time data), Annual (current year), and Monthly (current month)
  - **Period-specific branding**: Cover page clearly displays report type with exact timeframe (e.g., "MONTHLY REPORT - DECEMBER 2025")
  - **Smart section management**: History and FIRE sections automatically disabled for monthly exports; re-enabled when switching to Annual/Total
  - **Data validation & tooltips**: Export options disabled with explanatory tooltips when data is insufficient (e.g., yearly requires ≥2 snapshots)
  - **Error prevention**: Integrated toast notifications block generation attempts if data requirements are not met
  - **Filtered data accuracy**: Snapshots and Expenses filtered by period; FIRE metrics use full annual data for precision
  - **Seamless UX**: Radio button UI positioned above section toggles with labels showing current year/month
  - **Backward compatible**: Existing generation workflow remains unchanged; time filter defaults to 'Total' for legacy support

- **ETF Dividend Tracking with Multi-Currency Support**: Extended automatic dividend tracking to ETFs with intelligent currency conversion
  - **ISIN field enabled for ETFs**: Asset creation dialog now allows ISIN input for both Stock and ETF asset types
  - **Automatic currency conversion**: Foreign currency dividends (USD, GBP, CHF) automatically converted to EUR using Frankfurter API
  - **Dual amount storage**: Original amounts preserved alongside EUR conversions with exchange rate saved for audit trail
  - **Visual transparency**: EUR amounts displayed with Info icon tooltip showing original currency values
  - **EUR-based expenses**: Income entries created using converted EUR amounts (app's base currency) with original amount in notes
  - **24-hour caching**: In-memory cache reduces API calls; graceful fallback to stale cache if API unavailable
  - **ETF scraper support**: Borsa Italiana scraper now handles both Stock and ETF dividend pages with intelligent table detection
  - **Currency mapping**: Italian currency names ("Dollaro Usa") automatically mapped to ISO codes (USD)

- **Borsa Italiana Scraper - Smart Table Detection**: Enhanced web scraping with automatic format recognition
  - **Dual URL routing**: Separate URLs for Stock (`/azioni/elenco-completo-dividendi.html`) and ETF (`/etf/dividendi.html`) dividend pages
  - **Intelligent parsing**: Auto-detects table structure (4-column ETF vs 7+-column Stock) and applies appropriate parsing strategy
  - **ETF parsing**: Fixed-position extraction (Cell 0=ex-date, 1=amount, 2=currency, 3=payment-date)
  - **Stock parsing**: Pattern matching with `isDateFormat()` validator for flexible cell detection
  - **Whitespace cleaning**: Handles excessive `\t\n\r` in ETF table cells
  - **Asset type parameter**: `scrapeDividendsByIsin()` now accepts `assetType` for correct URL selection
  - **Cron job integration**: Daily dividend processing updated to pass asset type for automatic scraping

- **Monthly Returns Heatmap**: Visual performance calendar showing month-by-month portfolio returns in color-coded grid
  - **At-a-glance seasonality**: Year × month table with red-to-green color scale instantly reveals seasonal patterns and difficult months
  - **6-tier color scale**: Returns categorized from dark red (≤ -5%) to dark green (> +5%) for immediate visual interpretation
  - **Cash flow adjusted**: Month-over-month returns calculated as `((End NW - Cash Flows) / Start NW - 1) × 100` to isolate investment performance
  - **All timeframes supported**: Dynamically filters to show only months within selected period (YTD, 1Y, 3Y, 5Y, All Time, Custom)
  - **Incomplete year handling**: Missing months display "-" for clarity; first month skipped (no previous month for comparison)
  - **Responsive design**: Horizontal scrolling on mobile for comfortable viewing of 12-month grid
  - **Interactive tooltips**: Hover over cells to see exact percentage and month/year details
  - **Educational methodology**: Detailed explanation in "Note Metodologiche" section covering calculation, color scale, and interpretation
  - **Zero performance impact**: Uses already-cached snapshot and cash flow data with no additional queries

- **Underwater Drawdown Chart**: Visual recovery timeline showing portfolio distance from all-time highs
  - **Recovery visualization**: Area chart displays drawdown percentage from running peak, staying at 0% when at all-time highs and going negative when underwater
  - **Cash flow adjusted**: TWR-style calculation (`Portfolio Value - Cumulative Cash Flows`) isolates true investment performance from contributions
  - **Running peak tracking**: Automatically updates peak as portfolio reaches new highs, showing real-time distance from best performance
  - **Red underwater area**: 30% opacity red fill creates intuitive "underwater" effect when portfolio is below previous peak
  - **All timeframes supported**: Dynamically updates when switching between YTD, 1Y, 3Y, 5Y, All Time, and Custom date ranges
  - **Always-at-peak handling**: Displays flat 0% line when portfolio has never declined (continuous growth)
  - **Smart Y-axis**: Domain set to `['auto', 0]` ensures 0% always at top, auto-scales negative values for optimal viewing
  - **Custom tooltip**: Shows drawdown percentage with special "Massimo storico" message when at peak (0%)
  - **Complements duration metrics**: Visual counterpart to "Drawdown Duration" and "Recovery Time" metrics shown above
  - **Educational methodology**: Comprehensive explanation in "Note Metodologiche" covering TWR adjustment, peak tracking, and interpretation
  - **Responsive heights**: Adapts to device (400px desktop, 280px mobile, 300px landscape) for optimal viewing

- Added **Yield on Cost (YOC) analysis** to dividends dashboard
  - Portfolio-level YOC metric card showing return on original investment cost
  - Detailed per-asset comparison table with 8 columns: asset details, quantity, average cost, current price, TTM dividends, YOC %, current yield %, and difference
  - Highlights dividend growth over time by comparing cost-based yield vs market-based yield
  - Automatic sorting by YOC percentage (highest performers first)
  - Portfolio totals footer in comparison table
  - Only displays for assets with configured cost basis and TTM dividends

### User Experience Enhancements

- **Net Worth History - Notes Table View**: Improved notes visualization with dedicated responsive table replacing truncated chart labels
  - **Dedicated table display**: Notes now appear in a clean, readable table below the chart instead of crowded labels on the graph
  - **Full note visibility**: Complete note text displayed without truncation (previously limited to 50 characters)
  - **Responsive layout**: Mobile shows card layout with stacked information, desktop displays table with sticky header
  - **Sorted by date**: Notes automatically sorted from newest to oldest for easy scanning
  - **Scrollable container**: Desktop table supports vertical scrolling (max 500px) while keeping headers visible
  - **Note counter**: Footer displays total count (e.g., "3 note trovate") for quick reference
  - **Clean close button**: Single "Chiudi" button in header to hide the table
  - **Preserved indicators**: Chart dots still show amber color with message icon for snapshots containing notes
  - **Better readability**: Eliminates visual clutter on chart while maintaining full note accessibility

- **Hall of Fame - Percentage Growth Columns**: Enhanced financial rankings with percentage calculations for better performance tracking
  - **Month-over-month percentage**: Added "%" column to monthly net worth rankings showing `(netWorthDiff / previousNetWorth) × 100`
  - **Year-over-year percentage**: Added "%" column to yearly net worth rankings showing `(netWorthDiff / startOfYearNetWorth) × 100`
  - **Smart display logic**: Percentage column appears only in "Differenza NW" tables (not in Income/Expenses rankings)
  - **Sign formatting**: Displays `+X.XX%` for growth, `-X.XX%` for decline
  - **Zero-division safety**: Gracefully handles edge cases when previous net worth is zero
  - **Updated data model**: `MonthlyRecord` now includes `previousNetWorth`, `YearlyRecord` includes `startOfYearNetWorth`
  - **Dual service update**: Both client (`hallOfFameService.ts`) and server (`hallOfFameService.server.ts`) updated with identical logic

- **Assets Table - Portfolio Weight Column**: New "Peso in %" column showing each asset's weight on total portfolio
  - **Desktop table**: New column after "Valore Totale" displaying `(assetValue / totalValue) × 100`
  - **Mobile cards**: "Peso in %" field added to AssetCard component in gray summary box
  - **Color coding**: Blue text (`text-blue-600`) for visual distinction
  - **Footer total**: Always displays "100.00%" for verification
  - **Dynamic calculation**: Updates in real-time as portfolio values change
  - **Format**: Two decimal places (e.g., "15.42%", "3.89%")

- **Hall of Fame - Mobile Optimizations**: Responsive layout improvements for better mobile experience
  - **Mobile Responsiveness**: Replaced horizontal scrolling tables with vertical card layout for screens <768px
  - **Component Architecture**: Introduced `MonthlyRecordCard` and `YearlyRecordCard` components for mobile-first display
  - **Layout Pattern**: Implemented md: breakpoint toggle between card view (mobile) and table view (desktop)
  - **Color Coding**: Enhanced visual hierarchy with green/red color coding for positive/negative values
  - **Accessibility**: Maintained rank badges, percentage displays, and note icons across all 8 ranking sections
  - **Zero Horizontal Scroll**: Eliminated horizontal scrolling on mobile portrait, improving UX for financial data review

- **Dividend Table - Currency Conversion Display**: Enhanced dividend table with EUR conversion transparency
  - **Tooltip integration**: Foreign currency dividends show EUR amount with Info icon; tooltip displays original amount
  - **Smart display logic**: Shows EUR conversion only when `currency !== 'EUR'` and conversion available
  - **Visual feedback**: AmountWithConversion component for gross, tax, and net amounts
  - **Color preservation**: Green for net amounts, red for taxes, consistent across currencies
  - **Exchange rate visibility**: Users can see conversion rate used in dividend details

### Bug Fixes

- **Drawdown Duration Calculation Mismatch**: Fixed visual inconsistency between displayed period ranges and duration values
  - **Issue**: Duration showed 6 months but period "01/25 - 07/25" visually suggested 7 months (Jan, Feb, Mar, Apr, May, Jun, Jul)
  - **Cause**: Durations calculated as interval count (array index difference) but periods displayed as inclusive ranges (month count)
  - **Impact**: User confusion - "From January to July should be 7 months, not 6"
  - **Fix**: Changed calculation to inclusive count (both start and end months included), added +1 to all duration formulas
  - **Result**: "01/25 - 07/25" now correctly shows "7m" duration, matching user's mental model
  - **Breaking change**: All drawdown duration values increased by 1 month for consistency
  - **Metrics affected**: Drawdown Duration and Recovery Time (both now use inclusive counting)
  - **Backward compatibility**: Performance metrics calculated on-the-fly (not cached), next page load shows correct values automatically

- **Cashflow Section** (#68): Fixed misleading savings text that showed total savings as "per month" amount
  - Now calculates: Total Net Cashflow ÷ Number of Tracked Months = Average Monthly Savings
  - Example: €11,998 saved over 12 months → "Risparmi €999.87 al mese (media su 12 mesi)"

- **FIRE Section** (#68): Fixed hardcoded "25x spese annuali" that was incorrect for non-4% Safe Withdrawal Rates
  - Dynamic calculation: 100 ÷ SWR = Multiplier
  - User-configured SWR now properly retrieved from settings (previously always showed 4%)
  - Trinity Study explanation now conditional (shown only for 4% SWR)

- **Asset Allocation** (#68): Fixed rebalancing actions missing asset classes with zero current value
  - Previously: Only asset classes in `assetClassData` appeared in rebalancing recommendations
  - Now: Directly iterates on `comparisonResult.byAssetClass` to ensure completeness
  - Example: "Materie Prime" with 0€ current value but 4.21% target now correctly shows "COMPRA €10,699.38"

- **Dividend Scraper - ETF URL Routing**: Fixed hardcoded Stock URL causing ETF dividend scraping failures
  - **Issue**: Scraper used single URL constant (`BORSA_ITALIANA_BASE_URL`) for all asset types
  - **Impact**: ETF dividend imports failed with wrong URL (`/azioni/listino-a-z.html` instead of `/etf/dividendi.html`)
  - **Fix**: Implemented dual URL routing with `BORSA_ITALIANA_STOCK_URL` and `BORSA_ITALIANA_ETF_URL` constants
  - **Solution**: `scrapeDividendsByIsin()` now accepts `assetType` parameter and selects correct URL dynamically
  - **Integration**: Updated all call sites (`/api/dividends/scrape`, `/api/cron/daily-dividend-processing`) to pass `asset.type`
  - **Testing**: Verified with VWRL.MI (IE00B3RBWM25) ETF successfully scraping USD dividends

- **DividendDialog - Date Conversion Error**: Fixed crash when editing existing dividends
  - **Error**: `dividend.exDate.toDate is not a function` when clicking Edit button in dividend table
  - **Cause**: API responses serialize Firestore Timestamps as ISO strings (JSON format), not Date/Timestamp objects
  - **Impact**: Manual `instanceof Date` checks and `.toDate()` calls failed on string data
  - **Fix**: Replaced manual conversion logic with `toDate()` helper from `lib/utils/dateHelpers.ts`
  - **Solution**: Helper gracefully handles Date objects, Timestamps, ISO strings, and undefined/null values
  - **Prevention**: Updated AGENTS.md with critical date handling pattern to prevent future occurrences


- **Mobile Optimizations**: Enhanced mobile user experience with compact chart formatting and native-app-like navigation
  - **Compact chart Y-axis notation**: Applied K/M formatting to 19 monetary charts for improved readability on small screens (€1,500,000 → €1.5 Mln, €850,000 → €850k)
  - **Bottom navigation bar**: Fixed navigation at bottom of screen for mobile portrait mode with 4 primary actions (Overview, Assets, Cashflow, Menu)
  - **Secondary menu drawer**: Sheet component sliding from bottom with 5 additional navigation items (Allocation, History, Hall of Fame, FIRE, Settings)
  - **Intelligent responsive behavior**: Three-tier system across Desktop (sidebar always visible), Mobile Landscape (hamburger toggle), and Mobile Portrait (bottom nav + drawer)
  - **Native app feel**: Thumb-friendly navigation mimicking iOS/Android Material Design patterns
  - **Active state highlighting**: Color-coded navigation items (blue for active, gray for inactive)
  - **Auto-close drawer**: Automatic dismissal after navigation selection for faster workflow
  - **Zero desktop impact**: All optimizations scoped to mobile screens only, preserving desktop experience
  - **Preserved backward compatibility**: Mobile landscape mode unchanged (hamburger menu + sidebar toggle)
  - **Critical bug fix**: Resolved sidebar disappearing on desktop by limiting orientation variants to mobile with `max-lg:` Tailwind prefix

- **Hall of Fame Recalculation**: Fixed server-side service not saving new percentage fields when using "Ricalcola Rankings" button
  - Issue: `/api/hall-of-fame/recalculate` was using outdated `hallOfFameService.server.ts` without `previousNetWorth` and `startOfYearNetWorth`
  - Fix: Updated server-side service with identical calculation logic as client-side version
  - Impact: Percentage columns now populate correctly after manual recalculation

- **Timezone Boundary Bug**: Fixed Hall of Fame entries and snapshots appearing in wrong month when operations executed from production server
  - **Issue**: December 2023 entries incorrectly displayed as November 2023 after server-side ranking recalculation
  - **Cause**: JavaScript `Date.getMonth()` and `getFullYear()` are timezone-dependent; server (Vercel/UTC) and browser (Italy/CET) extracted different month values near midnight boundaries
  - **Impact**: Affected Hall of Fame monthly/yearly rankings, monthly snapshot creation (cron jobs), expense statistics in Cashflow dashboard
  - **Example**: Entry created December 31 at 23:30 CET was stored correctly but appeared as November when server recalculated at UTC midnight
  - **Fix**: All date operations now consistently use Italy timezone (Europe/Rome) via new timezone-aware helper functions
  - **Result**: Rankings, snapshots, and statistics display correctly regardless of server timezone or recalculation location
  - **Scope**: Ensures consistency across Hall of Fame, monthly snapshots (automatic cron + manual creation), and current month detection in Cashflow stats

### Technical Improvements

- **PDF Data Service**: Refactored `pdfDataService.ts` for dynamic SWR integration and complete rebalancing logic
- **Type Safety**: Enhanced `types/pdf.ts` with `numberOfMonthsTracked` and `averageMonthlySavings` fields; updated `types/hall-of-fame.ts` with `previousNetWorth` and `startOfYearNetWorth`
- **Service Integration**: `getSettings()` from `assetAllocationService` now used for SWR retrieval in PDF generation
- **Service Parity**: Ensured both client (`hallOfFameService.ts`) and server (`hallOfFameService.server.ts`) Hall of Fame services calculate identical percentage fields
- **Component Props**: Updated `AssetCard.tsx` to accept `totalValue` prop for weight calculations
- **Code Maintainability**: Improved comments and documentation for FIRE multiplier calculations
- **Calculation Transparency**: Added "(media su N mesi)" text for user clarity on savings rate

- **Currency Conversion Service**: New `currencyConversionService.ts` with production-ready architecture
  - **Frankfurter API integration**: Free, no-API-key currency conversion service
  - **In-memory caching**: 24-hour TTL cache with `CachedExchangeRate` interface (rate + timestamp)
  - **Graceful fallback**: Uses stale cache if API fails, preventing conversion failures
  - **Batch operations**: `convertMultipleToEur()` for efficient multi-value conversion
  - **Type safety**: Full TypeScript support with proper error handling
  - **Zero dependencies**: Uses native `fetch` API, no npm packages required

- **Dividend Data Model Extension**: Enhanced `Dividend` type with optional EUR conversion fields
  - **New fields**: `grossAmountEur`, `taxAmountEur`, `netAmountEur`, `exchangeRate` (all optional)
  - **Conditional population**: Fields only present when `currency !== 'EUR'`
  - **Audit trail**: Exchange rate stored for transparency and future reference
  - **Backward compatible**: Existing dividends without EUR fields continue working

- **Web Scraper Architecture**: Refactored `borsaItalianaScraperService.ts` for multi-format support
  - **Table detection algorithm**: Automatic recognition via cell count (4-col vs 7+-col)
  - **Dual parsing strategies**: Fixed positions for ETF, pattern matching for Stock
  - **Currency normalization**: Italian names mapped to ISO codes via `CURRENCY_MAPPING` constant
  - **Whitespace sanitization**: `.replace(/[\t\n\r]+/g, ' ')` for clean data extraction
  - **Type-safe parameters**: `AssetType` parameter ensures correct URL selection
  - **Error resilience**: Returns empty array on failure (no crashes), detailed logging for debugging

- **Date Handling Utilities**: Centralized date conversion with `toDate()` helper in `dateHelpers.ts`
  - **Universal compatibility**: Handles Date, Timestamp, ISO strings, undefined/null
  - **API response safety**: Prevents crashes from JSON-serialized Firestore Timestamps
  - **Type guards**: Uses duck typing (`'toDate' in date`) for Timestamp detection
  - **Fallback behavior**: Returns `new Date()` for invalid inputs
  - **Integration points**: DividendDialog, filtering logic, display formatting

- **Timezone Infrastructure**: Comprehensive timezone handling for consistent date operations across client and server
  - **New dependency**: `date-fns-tz` (v3.2.0) for reliable timezone conversions (~20KB bundle impact)
  - **Four timezone helpers**: `getItalyDate()`, `getItalyMonth()`, `getItalyYear()`, `getItalyMonthYear()` in `lib/utils/dateHelpers.ts`
  - **Timezone constant**: `ITALY_TIMEZONE = 'Europe/Rome'` for centralized timezone management
  - **Updated 7 files**: Server snapshot route, Hall of Fame services (client + server), snapshot services, expense service, Hall of Fame UI page
  - **Consistent behavior**: All month/year extractions now use Europe/Rome timezone instead of server/browser local timezone
  - **Server-client parity**: Prevents UTC (Vercel) vs CET/CEST (browser) timezone mismatches
  - **DST handling**: Automatic CET (UTC+1) ↔ CEST (UTC+2) transition support via date-fns-tz
  - **Zero migration**: Only affects calculation logic, no database changes required
  - **Full compatibility**: Existing snapshots and data remain valid, backwards compatible
  - **Prevention pattern**: Updated AGENTS.md with timezone error prevention guidelines for future development

- **AssetDialog Enhancement**: ISIN field enablement for ETF type with conditional logic update
  - **Condition change**: `(selectedType !== 'stock' && selectedType !== 'etf')` replaces `selectedType !== 'stock'`
  - **Placeholder update**: Changed to `IE00B3RBWM25` (ETF example) from stock ISIN
  - **Help text update**: "Necessario per azioni ed ETF quotati su Borsa Italiana"

- **API Route Updates**: Modified `/api/dividends/scrape` and `/api/cron/daily-dividend-processing` to pass `asset.type` parameter

- Enhanced YOC metric clarity with explicit "gross dividends TTM (12 months)" labels
  - Added explanation in YOC card to clarify calculation uses gross (pre-tax) dividends
  - Updated table description to emphasize TTM (Trailing Twelve Months) period
  - Helps users understand the metric is independent from selected period filters


### Documentation

- **CLAUDE.md Updates**: Comprehensive documentation of ETF dividend tracking and currency conversion
  - Updated Dividend Tracking section (section 6) with ETF support, currency conversion service, dual URL routing
  - Enhanced key services descriptions with `currencyConversionService.ts` and updated `borsaItalianaScraperService.ts`
  - Extended `Dividend` data model with EUR conversion fields and exchange rate
  - Updated Current Status with latest session implementation (2025-12-26)
  - Added Frankfurter API to Stack & Dependencies (external APIs section)
  - Enhanced Known Issues with currency conversion and date serialization warnings
  - Updated key features list with ETF support and automatic currency conversion
  - Updated Hall of Fame section (section 8) with percentage calculations, data models, and mobile optimizations
  - Enhanced Portfolio Management section (section 1) with portfolio weight percentage column documentation
  - Added PDF Export architecture and implementation details

- **AGENTS.md Updates**: Critical patterns and error prevention for future AI agents
  - **New section**: Date Handling with Firestore - critical `toDate()` helper usage pattern
  - **New section**: Currency Conversion (Dividends) - Frankfurter API integration patterns and UI display
  - **New section**: Borsa Italiana Scraper - ETF vs Stock table differences with comparison table
  - **Common Errors expanded**: Added Date Handling Errors, Currency Conversion Errors, Dividend Scraper Errors
  - **Key File References updated**: Added `types/dividend.ts`, `dateHelpers.ts`, `currencyConversionService.ts`, `borsaItalianaScraperService.ts`, `dividendService.ts`
  - **Code examples**: Real implementation patterns from DividendDialog, DividendTable, dividendService

- **README.md Updates**: Added comprehensive PDF Export section with usage examples, moved PDF export from roadmap to Current Features (Completed ✅)


---

## 🔧 Improvements
- Improved Hall of Fame rankings by highlighting the current month or year row for quicker scanning
- Improved Performance charts with rolling 12‑month Sharpe Ratio and smoother 3‑month moving‑average trend lines

## 🐛 Bug Fixes
- Fixed Hall of Fame "Worst Month: Expenses" and "Worst Year: Expenses" showing positive values and green styling on mobile
- Fixed Hall of Fame yearly expense rankings missing years that only have expense data (even with fewer than two snapshots)
- Fixed Sharpe Rolling legend ordering so labels match the visual series order
- Fixed Cashflow % trend charts showing out-of-scale values when toggling percentage view

## 🔧 Improvements
- Improved Cashflow % trend charts with a zero reference line for clearer positive/negative reading
