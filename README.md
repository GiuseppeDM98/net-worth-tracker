# Portfolio Tracker

A comprehensive web application for tracking and managing investment portfolios across multiple asset classes, with integrated expense tracking and budgeting. Built to replace a 5+ year old Google Sheets workflow with a modern, automated solution.

## Project Vision

This application serves as a complete financial management system designed for serious investors who want to:
- Track multi-asset class portfolios (stocks, ETFs, bonds, crypto, real estate, commodities, cash)
- Monitor asset allocation against target percentages
- Maintain historical records of portfolio value over time
- Make data-driven rebalancing decisions
- **Track income and expenses with custom categories**
- **Analyze spending patterns with visual charts**
- **Calculate and track progress toward Financial Independence / Retire Early (FIRE) goals with Safe Withdrawal Rate analysis**
- **Compare personal financial records with Hall of Fame rankings**

The app prioritizes:
- **Accuracy**: Automated price updates from reliable sources
- **Clarity**: Visual representations of portfolio composition and financial data
- **Control**: Manual oversight of automated processes
- **Persistence**: Long-term historical tracking (months/years)
- **Privacy**: Self-hosted data in Firebase (no third-party portfolio services)
- **Completeness**: All-in-one solution for investments and personal finance

## Core Features

### 1. Asset Management
- **Add/Edit/Delete Assets**: Full CRUD for all portfolio holdings
- **Multi-Asset Class Support**:
  - Stocks (individual companies)
  - ETFs (index funds, factor ETFs)
  - Bonds (individual bonds, bond ETFs)
  - Cryptocurrency (Bitcoin, Ethereum, etc.)
  - Real Estate (physical properties with fixed valuations)
  - Commodities (gold ETFs, physical holdings)
  - Cash (bank accounts, money market funds)
  - Private Equity (unlisted investments with manual valuations)
- **Detailed Asset Information**:
  - Ticker symbol (with exchange suffix for European securities, e.g., `VWCE.DE`)
  - Asset name
  - Asset type and class categorization
  - Quantity held
  - Current market price (automatically fetched from Yahoo Finance)
  - Last price update timestamp
  - Currency (default EUR, multi-currency support)
- **Composite Assets**: Support for mixed-allocation assets (e.g., pension funds with equity + bonds)
- **Liquidity Tracking**: Flag assets as liquid or illiquid for separate net worth calculations
- **Automatic Price Fetching**: Prices are automatically retrieved from Yahoo Finance when adding new assets (no manual entry required)

### 2. Automated Price Updates
- **Yahoo Finance Integration**: Real-time price fetching for publicly traded securities
- **Manual Update Trigger**: On-demand button to update all prices instantly
- **End-of-Month Updates**: Scheduled automatic updates at month-end (28-31st, 8 PM UTC)
- **Price History**: Historical price data stored for trend analysis
- **Error Handling**: Graceful handling of tickers not found or API failures
- **Multi-Market Support**: European (XETRA, LSE, Euronext), US (NYSE, NASDAQ), and other exchanges
- **Smart Update Logic**: Automatically skips assets that don't need price updates (real estate, cash, private equity)

### 3. Asset Allocation Management
Portfolio allocation tracking with two-level hierarchy:

#### Primary Asset Classes
- Equity (stocks and stock ETFs)
- Bonds (fixed income securities)
- Real Estate (physical properties)
- Cryptocurrency (digital assets)
- Commodities (precious metals, etc.)
- Cash (liquid savings)

#### Sub-Categories (Example: Equity)
- **All-World Equity**: Broad market ETFs (VWCE, SWDA)
- **Factor ETFs**:
  - Momentum (IWMO)
  - Quality (IWQU)
  - Value (IWVL)
- **Pension Funds**: Employer-sponsored retirement accounts
- **Private Equity**: Illiquid private investments
- **High Risk**: Thematic/speculative ETFs (ARKK)
- **Single Stocks**: Individual company holdings (Ferrari, etc.)

#### Allocation Features
- **Default Allocation for New Users**: Automatically set to 60% Equity, 40% Bonds on account creation
- **Target Setting**: Define desired allocation percentages (must sum to 100%)
- **Formula-Based Allocation**: Auto-calculate Equity/Bonds based on age and risk-free rate
  - Formula: `125 - age - (riskFreeRate × 5) = % Equity`
- **Fixed Amount Cash**: Set cash as fixed € amount (not percentage)
- **Current vs Target**: Real-time comparison showing deviations
- **Rebalancing Actions**: Automated suggestions (COMPRA/VENDI/OK)
- **Visual Indicators**: Color-coded differences (red = rebalance needed, green = on target)
- **Euro Amounts**: Show both percentages and absolute euro values for clarity
- **Sub-Category Targets**: Set precise allocations within each asset class

### 4. 💰 Expense Tracking System
**Complete personal finance management integrated with portfolio tracking.**

#### Expense Management (`/dashboard/expenses`)
- **4 Types of Entries**:
  - **Income** (Entrate): Salary, bonuses, dividends, etc.
  - **Fixed Expenses** (Spese Fisse): Rent, insurance, subscriptions
  - **Variable Expenses** (Variabili): Groceries, dining, shopping
  - **Debts** (Debiti): Mortgage, loans, installments
- **Custom Categories**: Create unlimited categories for each expense type
- **Sub-Categories**: Hierarchical organization (e.g., Food → Groceries, Restaurants)
- **Category Colors**: Visual coding with customizable colors
- **Notes Field**: Detailed descriptions (e.g., "Spesa supermercato Conad")
- **Date Tracking**: Record exact date of each transaction
- **Amount Management**: Automatic positive/negative handling (income +, expenses -)
- **Dashboard Statistics**:
  - Total Income this month
  - Total Expenses this month
  - Net Balance (income - expenses)
  - Transaction count by type
- **Month/Year Filtering**:
  - **Default view**: Shows current year expenses automatically on page load
  - **Year selection**: Interactive buttons for each available year (sorted descending)
  - Filter by specific month within selected year (dropdown with Italian month names)
  - "Tutti" option to view all expenses for the entire year
  - Statistics cards update dynamically based on active filters (year + month)
  - **Automatic month reset**: Changing year automatically resets month filter to "Tutti"
  - **Dynamic page title**: Shows selected year in header (e.g., "Tracciamento Spese 2025")
  - **Dynamic table title**: Changes to reflect active filters (e.g., "Voci di Novembre 2025" or "Voci del 2025")
  - **Performance optimization**: Loads all expenses in background for year calculation, displays only filtered data

#### Recurring Expenses (Debts)
- **Automatic Creation**: Generate N months of recurring expenses in one action
- **Day-of-Month**: Specify recurring day (1-31)
- **Smart Date Handling**: Auto-adjust for months with fewer days (e.g., Feb 30 → Feb 28/29)
- **Batch Management**: Edit or delete all recurring entries together
- **Use Case**: Perfect for mortgages, car loans, subscriptions

#### Expense Charts
**Two pages for different time periods:**

**Cashflow Current Year** (`/dashboard/expense-charts`)
- **4 interactive visualizations for current year analysis:**
1. **Expenses by Category** (Pie Chart)
   - Visual breakdown of spending across categories
   - Percentage labels for categories >5%
   - Color-coded by category
2. **Income by Category** (Pie Chart)
   - Income sources distribution
   - Track multiple income streams
3. **Expenses by Type** (Pie Chart)
   - Fixed vs Variable vs Debt breakdown
   - Identify spending patterns
4. **Monthly Trend** (Bar Chart)
   - 12-month view of current year
   - Income, Expenses, and Net Balance bars
   - Identify seasonal patterns and trends

**Cashflow Totale** (`/dashboard/expense-charts-total`)
- **Same 4 charts but with all-time data:**
- Includes all expenses from all years
- Useful for long-term trend analysis
- Compare spending patterns across multiple years
- Monthly Trend shows complete history (not just current year)

#### Category Management (`/dashboard/settings`)
- **Settings Integration**: Manage categories in Settings page
- **Type-Based Organization**: Categories grouped by expense type
- **Visual Management**: See all categories with colors and sub-categories
- **Bulk Operations**: Easy edit/delete with confirmation
- **Empty State**: Start from scratch - no default categories
- **Validation**: Prevent duplicate category names

#### Expense Statistics in Dashboard
- **Income This Month**: With % change from previous month
- **Expenses This Month**: With % change from previous month
- **Trend Indicators**: Green/red arrows for increase/decrease
- **At-a-Glance**: Quick financial health check on main dashboard

### 5. Portfolio Visualization
- **Asset Class Pie Chart**: High-level distribution across major categories
- **Individual Asset Pie Chart**: Detailed breakdown by specific holdings (top 10 + "Others")
- **Liquidity Distribution**: Liquid vs Illiquid net worth visualization
- **Percentage Labels**: Clear labeling on chart slices (shown if >5%)
- **Interactive Tooltips**: Hover details showing name, value, percentage
- **Consistent Color Coding**: Asset classes always use same colors across all views
- **Toggle View**: Switch between € amounts and percentages

### 6. Dashboard Overview
Summary metrics displayed prominently:
- **Total Net Worth**: Complete portfolio value
- **Liquid Net Worth**: Excluding illiquid assets (real estate, private equity)
- **Asset Count**: Total number of holdings
- **Month-over-Month Change**: Growth/decline from previous month with percentage
- **Year-to-Date Change**: Annual performance from first snapshot of current year with percentage
- **Income This Month**: Total income with MoM delta
- **Expenses This Month**: Total expenses with MoM delta

### 7. Historical Tracking
**Comprehensive time-series analysis of portfolio performance:**

#### Monthly Snapshots
- **Automated Creation**: Cron job creates snapshots at month-end (28-31st, 8 PM UTC)
- **Manual Creation**: Button to create snapshot anytime with duplicate protection
- **Price Update Integration**: Automatically updates prices before snapshot
- **Data Captured**:
  - Total net worth
  - Liquid net worth
  - Illiquid net worth
  - Asset class breakdown (€ and %)
  - Individual asset details

#### Historical Charts (`/dashboard/history`)
1. **Net Worth Timeline** (Line Chart)
   - Total net worth evolution
   - Liquid net worth overlay
   - Illiquid net worth overlay
   - Toggle € / % view
   - Last 6+ months visible

2. **Asset Class Evolution** (Stacked Area Chart)
   - Visual evolution of all asset classes over time
   - Color-coded by asset class
   - Toggle € / % view
   - Identify allocation drift

3. **Liquidity Evolution** (Area Chart)
   - Separate tracking of liquid vs illiquid assets
   - Overlay visualization
   - Monitor portfolio liquidity ratio

4. **YoY Historical Variation** (Bar Chart)
   - Year-over-year comparison for each year with data
   - Shows variation from first to last snapshot of each year
   - Toggle € / % view
   - Green bars for positive years, red for negative
   - Identifies best/worst performing years

5. **Current vs Target Allocation** (Progress Bars)
   - Visual comparison per asset class
   - Overlay display (target background, current foreground)
   - Instant identification of rebalancing needs

#### Export & Analysis
- **CSV Export**: Download complete snapshot history
- **Date Range**: Display last 6+ snapshots
- **Statistics Table**: Detailed breakdown by snapshot

### 8. Settings & Configuration
- **Allocation Targets**: Configure target % for each asset class
- **Sub-Category Targets**: Set precise sub-allocations (must sum to 100%)
- **Auto-Calculate Mode**: Enable age-based Equity/Bonds formula
- **User Age**: Input for formula-based allocation
- **Risk-Free Rate**: BTP 10-year rate input for calculations
- **Fixed Cash Amount**: Set cash as € amount (not %)
- **Validation**: Real-time validation of percentage totals
- **Reset to Defaults**: Restore default allocation template
- **Expense Categories**: Full CRUD for income/expense categories
- **Category Organization**: Grouped by expense type with visual indicators

### 9. 🔥 FIRE Tracker & Calculator
**Complete Financial Independence tracking and retirement planning.**

#### FIRE Metrics (`/dashboard/fire`)
- **Safe Withdrawal Rate Configuration**: Set your target withdrawal rate (default 4% based on Trinity Study)
- **Planned Annual Expenses**: Optional input for future retirement expense planning
- **Current Metrics** (based on actual year-to-date expenses):
  - **FIRE Number**: Target net worth needed for financial independence (Annual Expenses ÷ Withdrawal Rate)
  - **Progress to FI**: Percentage toward financial independence goal
  - **Annual/Monthly/Daily Allowance**: Sustainable withdrawal amounts based on current net worth
  - **Current Withdrawal Rate**: Actual expense ratio vs net worth (real spending vs 4% rule)
  - **Years of Expenses**: Portfolio longevity at current spending level
- **Planned Metrics** (if planned expenses set):
  - **Planned FIRE Number**: Target based on projected retirement expenses
  - **Planned Progress**: Comparison with planned scenario
  - **Side-by-side comparison** of current vs planned scenarios
  - **Gap Analysis**: How much less you need if reducing expenses
- **Historical Evolution Chart**:
  - Income, Expenses, and Monthly Allowance trends over time
  - Visual tracking of FIRE progress month-by-month
  - Identify periods where expenses exceeded allowance
- **Educational Info Box**: Explains FIRE concepts, Trinity Study, Safe Withdrawal Rate methodology
- **Database Integration**:
  - Withdrawal rate stored in `assetAllocationTargets` collection
  - Planned expenses persisted across sessions
  - Automatic recalculation when creating new snapshots
- **Calculations**:
  - FIRE Number = Annual Expenses ÷ Withdrawal Rate
  - Progress = Current Net Worth ÷ FIRE Number × 100
  - Monthly Allowance = Net Worth × (Withdrawal Rate ÷ 12)
  - Current WR = (Annual Expenses ÷ Net Worth) × 100

### 10. 🏆 Hall of Fame
**Personal financial rankings showcasing your best and worst months/years.**

#### Monthly Rankings (`/dashboard/hall-of-fame`)
- **Top 20 Best Months**:
  - **Highest Net Worth Growth**: Months with largest € increase vs previous month
  - **Highest Income**: Months with maximum income earned
- **Top 20 Worst Months**:
  - **Largest Net Worth Decline**: Months with biggest € decrease (market crashes, major expenses)
  - **Highest Expenses**: Months with maximum spending
- **Format**: Ranked tables showing:
  - Rank (1-20)
  - Month/Year (MM/YYYY format, e.g., "11/2025")
  - Value (€ formatted with Italian locale)

#### Yearly Rankings
- **Top 10 Best Years**:
  - **Highest Net Worth Growth**: Years with largest annual increase (Dec 31 - Jan 1)
  - **Highest Income**: Years with maximum total income
- **Top 10 Worst Years**:
  - **Largest Net Worth Decline**: Years with biggest annual decrease
  - **Highest Expenses**: Years with maximum total spending
- **Automatic Calculation**:
  - Updated automatically when creating new monthly snapshots
  - Calculates from all historical snapshots and expenses
  - Stored in Firestore `hall-of-fame` collection (one document per user)
- **Visual Indicators**:
  - Green cards with TrendingUp icons for achievements
  - Red cards with TrendingDown icons for challenges
  - Trophy icon in page header
- **Motivation & Insights**:
  - Track personal financial records over time
  - Identify spending/earning patterns
  - Compare current performance with historical bests
  - Empty state message if < 2 snapshots available

## Technical Architecture

### Technology Stack
- **Frontend**: Next.js 16.0.1 (App Router), React 19.2.0, TypeScript 5
- **Styling**: Tailwind CSS 4, shadcn/ui component library, lucide-react icons
- **Backend**: Next.js API Routes (serverless functions)
- **Database**: Firebase Firestore (NoSQL document database)
- **Authentication**: Firebase Authentication (email/password + OAuth)
- **Price Data**: yahoo-finance2 v3.10.1 (npm package with YahooFinance instance API)
- **Charts**: Recharts 3.3.0 (React charting library)
- **Deployment**: Vercel (automatic deployments from Git)
- **Form Management**: react-hook-form 7.66.0 + zod 4.1.12 (validation)
- **Date Utilities**: date-fns 4.1.0 (with Italian locale)
- **Notifications**: sonner 2.0.7 (toast notifications)
- **Themes**: next-themes 0.4.6 (dark mode support)

### Why These Choices?
- **Next.js**: Best-in-class React framework with excellent DX and performance
- **Firebase**: Generous free tier, real-time updates, easy authentication, no server management
- **Yahoo Finance**: Free, reliable, extensive ticker coverage (unlike most APIs)
- **Vercel**: Seamless Next.js integration, generous free tier, cron jobs, edge functions
- **TypeScript**: Type safety prevents bugs, improves code maintainability
- **shadcn/ui**: High-quality, customizable components, no runtime JS overhead
- **Recharts**: Powerful, flexible charting with great TypeScript support

### Database Schema

#### Collections Structure
```
users/
  └─ {userId}/
      - email: string
      - displayName: string
      - createdAt: timestamp

assets/
  └─ {assetId}/
      - userId: string (indexed)
      - ticker: string
      - name: string
      - type: "stock" | "etf" | "bond" | "crypto" | "commodity" | "cash" | "realestate"
      - assetClass: "equity" | "bonds" | "crypto" | "realestate" | "cash" | "commodity"
      - subCategory?: string
      - currency: string
      - quantity: number
      - currentPrice: number
      - isLiquid?: boolean
      - autoUpdatePrice?: boolean
      - composition?: Array<{assetClass, percentage, subCategory?}>
      - lastPriceUpdate: timestamp
      - createdAt: timestamp
      - updatedAt: timestamp

assetAllocationTargets/
  └─ {userId}/
      - userId: string
      - userAge?: number
      - riskFreeRate?: number
      - withdrawalRate?: number (Safe Withdrawal Rate for FIRE, default 4%)
      - plannedAnnualExpenses?: number (planned retirement expenses in €)
      - targets: {
          equity: {
            targetPercentage: number
            useFixedAmount?: boolean
            fixedAmount?: number
            subCategoryConfig?: { enabled: boolean, categories: string[] }
            subTargets?: { allWorld: number, momentum: number, ... }
          }
          bonds: { targetPercentage: number }
          ...
        }
      - updatedAt: timestamp

expenses/
  └─ {expenseId}/
      - userId: string (indexed)
      - type: "income" | "fixed" | "variable" | "debt"
      - categoryId: string
      - categoryName: string (denormalized)
      - subCategoryId?: string
      - subCategoryName?: string (denormalized)
      - amount: number (positive for income, negative for expenses)
      - currency: string
      - date: timestamp
      - notes?: string
      - isRecurring?: boolean
      - recurringDay?: number (1-31)
      - recurringParentId?: string (links recurring expenses)
      - createdAt: timestamp
      - updatedAt: timestamp

expenseCategories/
  └─ {categoryId}/
      - userId: string (indexed)
      - name: string
      - type: "income" | "fixed" | "variable" | "debt"
      - color?: string (#hex)
      - icon?: string
      - subCategories: Array<{id: string, name: string}>
      - createdAt: timestamp
      - updatedAt: timestamp

priceHistory/
  └─ {ticker}-{YYYY-MM-DD}/
      - ticker: string
      - price: number
      - date: timestamp
      - currency: string

monthlySnapshots/
  └─ {userId}-{YYYY-MM}/
      - userId: string
      - year: number
      - month: number
      - totalNetWorth: number
      - liquidNetWorth: number
      - illiquidNetWorth: number
      - byAssetClass: { equity: number, bonds: number, ... }
      - byAsset: Array<{ assetId, ticker, name, quantity, price, totalValue }>
      - assetAllocation: { equity: %, bonds: %, ... }
      - createdAt: timestamp

hall-of-fame/
  └─ {userId}/
      - userId: string
      - bestMonthsByNetWorthGrowth: Array<MonthlyRecord> (top 20)
      - bestMonthsByIncome: Array<MonthlyRecord> (top 20)
      - worstMonthsByNetWorthDecline: Array<MonthlyRecord> (top 20)
      - worstMonthsByExpenses: Array<MonthlyRecord> (top 20)
      - bestYearsByNetWorthGrowth: Array<YearlyRecord> (top 10)
      - bestYearsByIncome: Array<YearlyRecord> (top 10)
      - worstYearsByNetWorthDecline: Array<YearlyRecord> (top 10)
      - worstYearsByExpenses: Array<YearlyRecord> (top 10)
      - updatedAt: timestamp

      MonthlyRecord: {
        year: number,
        month: number (1-12),
        monthYear: string (MM/YYYY format),
        netWorthDiff: number (€ change vs previous month),
        totalIncome: number (€ income for month),
        totalExpenses: number (€ expenses for month)
      }

      YearlyRecord: {
        year: number,
        netWorthDiff: number (€ change from Jan 1 to Dec 31),
        totalIncome: number (€ total income for year),
        totalExpenses: number (€ total expenses for year)
      }
```

### Key Design Decisions

#### 1. End-of-Month Price Updates & Snapshots
**Rationale**: User's workflow involves monthly portfolio reviews at month-end. This timing:
- Aligns with salary deposits and investment purchases
- Provides clean monthly boundaries for historical snapshots
- Matches typical financial reporting periods

**Implementation**: Vercel Cron job scheduled for last 3 days of each month (28-31st) at 8 PM UTC

#### 2. Manual Price Update Override
**Rationale**: While automated updates are convenient, users need control to:
- Update prices immediately before making investment decisions
- Verify prices after market volatility
- Refresh data if automated job fails

**Implementation**: Button in UI calls API route that triggers batch Yahoo Finance updates

#### 3. Separate Asset Allocation Targets
**Rationale**: Targets change infrequently but are referenced often. Storing separately:
- Reduces data duplication in asset documents
- Allows atomic updates to entire allocation strategy
- Enables historical tracking of target changes

**Implementation**: Single document per user in `assetAllocationTargets` collection

#### 4. Price History Storage
**Rationale**: Historical prices enable:
- Performance analysis over time
- Verification of price changes
- Reduced API calls (check history before fetching)

**Implementation**: One document per ticker per day, indexed by ticker+date for fast queries

#### 5. Monthly Snapshots vs Real-Time Calculation
**Rationale**: Snapshots provide:
- Guaranteed historical accuracy (immune to data changes)
- Fast loading of historical charts (no recalculation needed)
- Audit trail of portfolio state

**Implementation**: Automated cron job creates snapshot from current asset state + prices

#### 6. Denormalized Expense Data
**Rationale**: Storing categoryName alongside categoryId:
- Faster queries (no joins needed)
- Historical accuracy (if category renamed, old expenses keep original name)
- Simplified reporting

**Trade-off**: Slightly more storage, but Firestore pricing is generous

### API Routes

#### `/api/prices/update` ✅
- **Method**: POST
- **Auth**: Required (userId in request body)
- **Body**: `{ userId: string, assetIds?: string[] }`
- **Response**: `{ updated: number, failed: string[], message: string }`
- **Implementation**: Uses Firebase Admin SDK + Yahoo Finance v3+ instance
- **Logic**:
  1. Verify userId provided
  2. Fetch assets from Firestore using Admin SDK
  3. Filter assets that need price updates
  4. Extract unique tickers
  5. Call `yahooFinanceService.getMultipleQuotes(tickers)`
  6. Update each asset's `currentPrice` and `lastPriceUpdate`
  7. Return results with count of updated/failed tickers

#### `/api/prices/quote` ✅
- **Method**: GET
- **Query Params**: `ticker` (required)
- **Response**: `{ ticker: string, price: number | null, currency: string, error?: string }`
- **Implementation**: Server-side only (yahoo-finance2 requires Node.js)
- **Logic**: Fetches single quote from Yahoo Finance

#### `/api/portfolio/snapshot` ✅
- **Method**: POST
- **Auth**: Required (userId) or Cron secret
- **Body**: `{ userId: string, year?: number, month?: number }`
- **Response**: `{ success: boolean, snapshotId: string, message: string }`
- **Logic**:
  1. Update all asset prices
  2. Calculate portfolio metrics
  3. Create monthly snapshot document
  4. Return snapshot ID

#### `/api/cron/monthly-snapshot` ✅
- **Method**: GET
- **Auth**: Vercel Cron secret
- **Trigger**: Automated (28-31st of month, 8 PM UTC)
- **Logic**: Creates snapshots for all users

### Frontend Components Architecture

#### Page Structure
```
app/
├── (auth)/
│   ├── login/page.tsx          # Login form ✅
│   └── register/page.tsx       # Registration form ✅
├── dashboard/
│   ├── page.tsx                # Overview (charts, summary, expense stats) ✅
│   ├── layout.tsx              # Sidebar navigation ✅
│   ├── assets/
│   │   └── page.tsx            # Asset table, CRUD operations ✅
│   ├── allocation/
│   │   └── page.tsx            # Current vs target comparison ✅
│   ├── history/
│   │   └── page.tsx            # Historical charts (5 types) ✅
│   ├── expenses/
│   │   └── page.tsx            # Expense tracking table ✅
│   ├── expense-charts/
│   │   └── page.tsx            # Cashflow current year (4 charts) ✅
│   ├── expense-charts-total/
│   │   └── page.tsx            # Cashflow all time (4 charts) ✅
│   ├── fire/
│   │   └── page.tsx            # FIRE calculator & progress tracker ✅
│   ├── hall-of-fame/
│   │   └── page.tsx            # Personal financial rankings ✅
│   └── settings/
│       └── page.tsx            # Allocation + expense categories ✅
└── api/
    ├── prices/
    │   ├── update/route.ts     # Batch price update ✅
    │   └── quote/route.ts      # Single quote fetch ✅
    ├── portfolio/
    │   └── snapshot/route.ts   # Create snapshot ✅
    └── cron/
        └── monthly-snapshot/route.ts  # Automated snapshots ✅
```

#### Component Hierarchy
```
Layout ✅
├── Header (user menu, logo)
├── Sidebar (navigation with 10 pages)
└── Main Content
    ├── Dashboard ✅
    │   ├── SummaryCard (x7: portfolio, variations, expenses)
    │   ├── AssetClassPie
    │   ├── AssetDistributionPie
    │   └── LiquidityPie
    ├── Assets Page ✅
    │   ├── AssetTable
    │   ├── UpdatePricesButton
    │   └── AssetDialog (add/edit)
    ├── Allocation Page ✅
    │   ├── AllocationTable (current)
    │   ├── AllocationTable (target)
    │   └── Link to settings
    ├── History Page ✅
    │   ├── NetWorthChart (line)
    │   ├── AssetClassEvolutionChart (stacked area)
    │   ├── LiquidityChart (area)
    │   ├── YoYVariationChart (bar)
    │   ├── AllocationProgressBars
    │   └── SnapshotsTable + CSV export
    ├── Expenses Page ✅
    │   ├── ExpenseStatsCards (x3)
    │   ├── ExpenseTable (sortable, filterable)
    │   └── ExpenseDialog (add/edit)
    └── Expense Charts Page ✅
        ├── ExpensesByCategoryPie
        ├── IncomeByCategoryPie
        ├── ExpensesByTypePie
        └── MonthlyTrendBar
```

#### Reusable Components
**Portfolio Components:**
- `AssetTable`: Sortable table with actions (edit/delete) ✅
- `AssetDialog`: Form for adding/editing assets with automatic price fetching ✅
- `AllocationTable`: Display allocation with differences ✅
- `AssetClassPie`: Pie chart for asset class distribution ✅
- `AssetDistributionPie`: Pie chart for individual assets ✅
- `UpdatePricesButton`: Trigger manual price updates ✅

**Expense Components:**
- `ExpenseTable`: Sortable table with delete/edit, recurring badge ✅
- `ExpenseDialog`: Form with cascading selects, recurring options ✅
- `CategoryManagementDialog`: CRUD for categories with sub-categories ✅
- `ExpenseCharts`: 4 chart types (pie + bar) ✅

**Shared Components:**
- `SummaryCard`: Metric display with optional trend indicator ✅
- `LoadingSpinner`: Generic loading indicator
- `LoadingSkeleton`: Skeleton screens for tables/cards
- `ProtectedRoute`: Authentication wrapper ✅

### Service Layer

#### `assetService.ts` ✅
- `getAllAssets(userId)`: Fetch all user assets with sorting
- `getAssetById(assetId)`: Fetch single asset
- `createAsset(userId, assetData)`: Add new asset with automatic price
- `updateAsset(assetId, updates)`: Modify existing asset
- `deleteAsset(assetId)`: Remove asset
- `updateAssetPrice(assetId, price)`: Update price and timestamp
- `calculateAssetValue(asset)`: Calculate total value
- `calculateTotalValue(assets)`: Portfolio total
- `calculateLiquidNetWorth(assets)`: Exclude illiquid
- `calculateIlliquidNetWorth(assets)`: Illiquid only

#### `yahooFinanceService.ts` ✅
- `getQuote(ticker)`: Fetch single ticker price (YahooFinance v3+ instance)
- `getMultipleQuotes(tickers)`: Batch fetch (parallel execution)
- `validateTicker(ticker)`: Check if ticker exists
- `searchTicker(query)`: Search for tickers by name/symbol
- `shouldUpdatePrice(type, subCategory)`: Determine if asset needs updates

#### `assetAllocationService.ts` ✅
- `getSettings(userId)`: Fetch allocation settings
- `setSettings(userId, settings)`: Save allocation settings
- `getTargets(userId)`: Get allocation targets
- `calculateCurrentAllocation(assets)`: Compute by class and sub-category
- `compareAllocations(current, targets)`: Generate rebalancing actions
- `getDefaultTargets()`: Default allocation template
- `addSubCategory(userId, assetClass, name)`: Add sub-category
- `calculateEquityPercentage(age, riskFreeRate)`: Formula-based calculation

#### `snapshotService.ts` ✅
- `createSnapshot(userId, assets, year?, month?)`: Create portfolio snapshot
- `getUserSnapshots(userId)`: Fetch all snapshots
- `getSnapshotsInRange(userId, start, end)`: Date range query
- `getLatestSnapshot(userId)`: Most recent snapshot
- `calculateMonthlyChange(current, previous)`: MoM change calculation
- `calculateYearlyChange(current, snapshots)`: YTD change from first snapshot of current year

#### `expenseService.ts` ✅
- `getAllExpenses(userId)`: Fetch all expenses sorted by date
- `getExpensesByMonth(userId, year, month)`: Month filter
- `getExpensesByDateRange(userId, start, end)`: Range query
- `getExpenseById(expenseId)`: Single expense
- `createExpense(userId, data, categoryName, subCategoryName?)`: Create entry
- `createRecurringExpenses(userId, data, ...)`: Batch create recurring
- `updateExpense(expenseId, updates, ...)`: Update entry
- `deleteExpense(expenseId)`: Delete single
- `deleteRecurringExpenses(parentId)`: Delete all recurring
- `getMonthlyExpenseSummary(userId, year, month)`: Aggregate by month
- `getExpenseStats(userId)`: Current vs previous month with delta
- `calculateTotalIncome(expenses)`: Sum income
- `calculateTotalExpenses(expenses)`: Sum expenses
- `calculateNetBalance(expenses)`: Income - expenses

#### `expenseCategoryService.ts` ✅
- `getAllCategories(userId)`: Fetch all categories
- `getCategoriesByType(userId, type)`: Filter by expense type
- `getCategoryById(categoryId)`: Single category
- `createCategory(userId, data)`: Create new category
- `updateCategory(categoryId, updates)`: Update category
- `deleteCategory(categoryId)`: Delete category
- `addSubCategory(categoryId, name)`: Add sub-category
- `removeSubCategory(categoryId, subCategoryId)`: Remove sub-category
- `updateSubCategory(categoryId, subCategoryId, name)`: Rename sub-category

#### `fireService.ts` ✅
- `getAnnualExpenses(userId)`: Calculate current year expenses (Jan 1 - Dec 31)
- `getAnnualIncome(userId)`: Calculate current year income (Jan 1 - today)
- `calculateFIREMetrics(netWorth, annualExpenses, withdrawalRate)`: Compute FIRE Number, Progress, Allowances, Years of Expenses
- `calculatePlannedFIREMetrics(netWorth, plannedExpenses, withdrawalRate)`: Planned scenario metrics
- `prepareFIREChartData(userId, snapshots, withdrawalRate)`: Format historical FIRE evolution data for charts
- `getFIREData(userId, netWorth, withdrawalRate)`: Complete FIRE data package with current and planned metrics

#### `hallOfFameService.ts` ✅
- `getHallOfFameData(userId)`: Fetch user's Hall of Fame rankings from Firestore
- `updateHallOfFame(userId)`: Recalculate and update all rankings (called after snapshot creation)
- `calculateMonthlyRecords(snapshots, expenses)`: Generate monthly rankings from historical data
- `calculateYearlyRecords(snapshots, expenses)`: Generate yearly rankings, aggregate full-year data

#### `chartService.ts` ✅
- `prepareAssetDistributionData(assets)`: Format for asset pie (top 10 + others)
- `prepareAssetClassDistributionData(assets)`: Aggregate by class
- `prepareNetWorthHistoryData(snapshots)`: Format historical line charts
- `prepareAssetClassHistoryData(snapshots)`: Format asset class evolution over time
- `prepareYoYVariationData(snapshots)`: Calculate year-over-year variations for bar chart
- `formatCurrency(value)`: Italian currency formatting (€1.234,56)
- `formatPercentage(value, decimals)`: Italian percentage (12,34%)
- `formatNumber(value, decimals)`: Italian number formatting

#### `dummySnapshotGenerator.ts` ✅
- **Purpose**: Testing utility for generating sample historical data
- `generateDummySnapshots(userId, months)`: Create N months of fake snapshots
- Used during development, not in production

## User Workflow Examples

### Monthly Portfolio Review (Primary Use Case)
1. **Day 28-31 of month**: Automated Cron job updates all asset prices and creates snapshot
2. **Month-end**: User logs in to review portfolio
3. User views **Dashboard** for high-level overview:
   - Total net worth: €251,953
   - Liquid net worth: €193,207 (excluding €58,746 real estate)
   - Month-over-month change: +€3,240 (+1.3%)
   - Year-to-date change: +€12,450 (+5.2%)
   - Income this month: €3,500 (+5% from last month)
   - Expenses this month: €2,100 (-3% from last month)
4. User clicks **"Allocation"** to check rebalancing needs:
   - Equity: 84.5% current vs 80.6% target → **VENDI** €9,804
   - Bonds: 5.5% current vs 16.9% target → **COMPRA** €28,723
   - Crypto: 2.1% current vs 2.5% target → **COMPRA** €1,008
5. User invests €2,000 monthly savings according to rebalancing:
   - €1,500 into bond ETF (IMB28)
   - €500 into crypto (WBIT)
6. User updates holdings in **"Assets"** page:
   - Edit IMB28: increase quantity by 15 shares
   - Edit WBIT: increase quantity by 0.02 BTC
7. Click **"Aggiorna Prezzi"** to refresh current values
8. Return to **"Allocation"** to verify closer to targets
9. Review **"Tracciamento Spese"** to see monthly spending breakdown
10. Check **"Grafici Spese"** to identify spending trends

### Monthly Expense Review
1. User logs in at month-end
2. Dashboard shows:
   - Income: €3,500 this month (+5% from last month ✅)
   - Expenses: €2,100 (-3% from last month ✅)
   - Net balance: +€1,400
3. Navigate to **"Tracciamento Spese"**
4. Page automatically displays current year (2025) expenses
5. Review transactions with filtering:
   - Use year buttons to switch between years (if available)
   - Select specific month from dropdown (Gennaio, Febbraio, etc.)
   - View "Tutti" to see all months for selected year
   - Statistics cards update automatically based on filters
6. Sort and analyze:
   - Sort by amount, category, or date
   - Check category breakdown in table
7. Navigate to **"Grafici Spese"**
8. Analyze spending patterns:
   - **Expenses by Category**: Alimentari (€600), Trasporti (€300), Intrattenimento (€200)
   - **Monthly Trend**: Compare last 12 months, identify anomalies
   - **Expenses by Type**: Fixed 45%, Variable 40%, Debts 15%
9. Identify areas to reduce spending
10. Adjust next month's budget mentally

### Setting Up Recurring Debt (Mortgage)
1. Navigate to **Settings**
2. Scroll to **"Impostazioni Tracciamento Spese"**
3. Click **"Nuova Categoria"**
4. Create category:
   - Name: "Mutuo Casa"
   - Type: Debiti
   - Color: Orange
5. Save category
6. Navigate to **"Tracciamento Spese"**
7. Click **"Nuova Spesa"**
8. Fill form:
   - Type: Debiti
   - Category: Mutuo Casa
   - Amount: €800
   - Date: 2025-01-10 (first payment)
   - Enable **"Crea voce per ogni mese"**
   - Recurring Day: 10
   - Number of Months: 12 (full year)
9. Click **"Crea Spesa"**
10. System creates 12 entries automatically (Jan 10 - Dec 10)
11. Success notification: "12 voci ricorrenti create con successo"
12. All entries appear in table with 🗓️ recurring badge

### Adding a New Investment
1. User purchases new ETF: VWCE (all-world equity)
2. Navigate to **"Assets"** page
3. Click **"Add Asset"** button
4. Fill form:
   - Ticker: `VWCE.DE` (XETRA exchange)
   - Name: Vanguard FTSE All-World
   - Type: ETF
   - Asset Class: Equity
   - Sub-category: All-World
   - Currency: EUR
   - Quantity: 15
5. Click **"Crea"** → System automatically fetches price
6. Success notification: "Prezzo recuperato: €108.50 EUR"
7. Asset appears in table with:
   - Quantity: 15
   - Current Price: €108.50
   - Total Value: €1,627.50

### Tracking Composite Asset (Pension Fund)
1. User has pension fund: 60% equity, 30% bonds, 10% real estate
2. Navigate to **"Assets"**
3. Add new asset:
   - Ticker: FONDOPENS
   - Name: Fondo Pensione Giuseppe
   - Type: ETF
   - Asset Class: Equity (primary)
   - Enable **"Asset Composto"**
4. Define composition:
   - Equity 60% (All-World sub-category)
   - Bonds 30% (Government sub-category)
   - Real Estate 10%
5. Set quantity and price
6. System calculates allocation across multiple classes automatically

### Tracking FIRE Progress
1. User logs in and navigates to **"FIRE"** page
2. First-time setup:
   - Set **Safe Withdrawal Rate**: 4.0% (Trinity Study recommendation)
   - Optionally set **Planned Annual Expenses**: €25,000 (retirement budget estimate)
   - Click **"Salva Impostazioni"**
3. Review **Current Metrics** (based on actual year-to-date expenses):
   - Current Net Worth: €193,207
   - Annual Expenses (current year): €28,800
   - **FIRE Number**: €720,000 (€28,800 ÷ 0.04)
   - **Progress to FI**: 26.8%
   - **Monthly Allowance**: €643.36 (what you could sustainably withdraw each month)
   - **Current Withdrawal Rate**: 14.9% (currently living above 4% rule)
   - **Years of Expenses**: 6.7 years of runway
4. Review **Planned Metrics** (if planned expenses set):
   - **Planned FIRE Number**: €625,000 (€25,000 ÷ 0.04)
   - **Planned Progress**: 30.9% (closer to goal with reduced expenses!)
   - **Difference**: €95,000 less capital needed if reducing expenses to €25k/year
5. Analyze **Historical Evolution Chart**:
   - See how monthly allowance has grown over time
   - Compare income vs expenses trends month-by-month
   - Identify months where expenses exceeded sustainable allowance
6. **Action Plan**: Need to accumulate €526,793 more (or reduce expenses to €25k/year target)
7. Navigate to **"Hall of Fame"** to:
   - Review best months by income for motivation
   - Identify worst months by expenses to spot problem areas
   - Track personal financial records over time
8. Return monthly to track progress as net worth grows

## Localization & Formatting

### Italian Standards
- **Currency**: €1.234,56 (period for thousands, comma for decimals)
- **Dates**: DD/MM/YYYY (e.g., 31/12/2024)
- **Percentages**: 12,34% (comma for decimals)
- **Number Format**: Use `Intl.NumberFormat('it-IT')`
- **Date Library**: date-fns with `it` locale

### UI Language
- Primary language: Italian for user-facing strings
- Technical terms: English acceptable (ETF, FIRE, ROI)
- Action labels: Italian (COMPRA, VENDI, OK, Crea, Modifica, Elimina)
- Navigation: Italian
  - Overview → Panoramica
  - Assets → Patrimonio
  - Allocation → Allocazione
  - History → Storico
  - Expenses → Spese
  - Settings → Impostazioni

### Color Coding
- **Asset Classes**:
  - Equity: Blue (#3B82F6)
  - Bonds: Red (#EF4444)
  - Crypto: Amber (#F59E0B)
  - Real Estate: Green (#10B981)
  - Cash: Gray (#6B7280)
  - Commodity: Brown (#92400E)
- **Allocation Actions**:
  - COMPRA (buy): Orange (#F59E0B)
  - VENDI (sell): Red (#EF4444)
  - OK (on target): Green (#10B981)
- **Expense Types**:
  - Income: Green (#10B981)
  - Fixed: Blue (#3B82F6)
  - Variable: Purple (#8B5CF6)
  - Debt: Orange (#F59E0B)

## Special Asset Handling

### Real Estate
- **Fixed Valuation**: Manually set price (no Yahoo Finance updates)
- **Illiquid Flag**: Excluded from "Liquid Net Worth"
- **Example**: Casa Rovereto = €58,745.99 (fixed)
- **Update Process**: User manually updates when reassessed

### Private Equity
- **Fixed Valuation**: No market price
- **Illiquid**: Not tradeable
- **Update Process**: User updates from quarterly reports

### Pension Funds
- **Semi-Liquid**: Restricted withdrawal
- **Composite Asset**: Support for mixed allocations
- **Price Updates**: May require manual updates

### Cryptocurrency
- **High Volatility**: Frequent price updates
- **Multiple Tickers**: WBIT (Bitcoin), CETH (Ethereum)
- **Euro Pairs**: Use EUR pairs when available

### Bank Accounts (Cash)
- **Fixed Value**: No price updates needed
- **Quantity = Balance**: Conto BNL = €14,962.56
- **Price = 1**: Always €1.00 per unit

## Error Handling & Edge Cases

### Price Update Failures
- **Ticker Not Found**: Log error, skip asset, continue
- **API Timeout**: Retry once, mark as failed
- **Invalid Response**: Use previous price, log warning
- **Zero Price**: Reject as invalid, keep previous

### Data Validation
- **Quantity**: Must be positive number
- **Percentage**: Must be 0-100, totals must sum to 100%
- **Ticker**: Alphanumeric + optional exchange suffix
- **Amount**: Positive for income, auto-negative for expenses
- **Recurring Day**: 1-31, auto-adjust for short months

### User Experience
- **Loading States**: Spinners during async operations
- **Error Toasts**: Clear, actionable error messages (sonner)
- **Confirmation Dialogs**: Confirm before deleting assets/expenses
- **Optimistic Updates**: Update UI immediately, rollback on failure
- **Empty States**: Helpful messages when no data
- **Form Validation**: Real-time validation with zod schemas

## Security Considerations

### Firestore Rules
```javascript
// Users can only read/write their own data
match /users/{userId} {
  allow read, write: if request.auth.uid == userId;
}

// Assets belong to users
match /assets/{assetId} {
  allow read, write: if request.auth.uid == resource.data.userId;
}

// Expenses belong to users
match /expenses/{expenseId} {
  allow read, write: if request.auth.uid == resource.data.userId;
}

// Expense categories belong to users
match /expenseCategories/{categoryId} {
  allow read, write: if request.auth.uid == resource.data.userId;
}

// Hall of Fame - personal rankings belong to users
match /hall-of-fame/{userId} {
  allow read: if request.auth.uid == userId;
  allow create, update: if request.auth.uid == userId &&
                           request.resource.data.userId == userId;
  allow delete: if request.auth.uid == userId;
}

// Price history readable by all authenticated users
// Only backend can write (via Admin SDK)
match /priceHistory/{document} {
  allow read: if request.auth != null;
  allow write: if false;
}
```

### API Security
- **Authentication**: All API routes verify Firebase Auth token
- **Authorization**: Users can only access their own data
- **Rate Limiting**: Prevent abuse of price update endpoint
- **Input Validation**: Sanitize all user inputs
- **XSS Prevention**: React auto-escapes by default
- **HTTPS**: All requests encrypted in transit
- **Registration Control**: Server-side validation for user registration with whitelist support

### Data Privacy
- **No Third-Party Analytics**: User data stays in Firebase
- **No External Services**: Direct Yahoo Finance integration only
- **Encrypted Transmission**: HTTPS for all requests
- **Firebase Security**: Google-managed infrastructure, SOC 2 certified
- **User Isolation**: Strict Firestore rules prevent data leaks

## Performance Optimization

### Frontend
- **Code Splitting**: Dynamic imports for charts
- **Memoization**: `React.memo` for expensive components
- **Lazy Loading**: Images and heavy components load when visible
- **Bundle Size**: Tree-shaking to remove unused code
- **Recharts**: Load charts only when page visited

### Backend
- **Batch Operations**: Update multiple prices in single Firebase batch
- **Parallel Execution**: Yahoo Finance fetches run concurrently
- **Indexing**: Firestore composite indexes for complex queries
- **Caching**: Consider 5-minute TTL for Yahoo Finance responses

### Database
- **Denormalization**: Store computed values to avoid recalculation
- **Snapshot Strategy**: Pre-compute historical data
- **Selective Fetching**: Only fetch fields needed for each view
- **Query Optimization**: Use Firestore query limits

## Deployment

### Vercel Configuration
```json
{
  "framework": "nextjs",
  "buildCommand": "npm run build",
  "devCommand": "npm run dev",
  "installCommand": "npm install"
}
```

### Environment Variables
Set in Vercel dashboard or `.env.local`:
```
# Firebase Client SDK
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=

# Firebase Admin SDK (server-side)
FIREBASE_ADMIN_PROJECT_ID=
FIREBASE_ADMIN_CLIENT_EMAIL=
FIREBASE_ADMIN_PRIVATE_KEY=

# Cron Job Configuration
CRON_SECRET=your_secure_random_string_here
NEXT_PUBLIC_APP_URL=https://your-app.vercel.app

# Registration Control (for open source deployments)
NEXT_PUBLIC_REGISTRATIONS_ENABLED=true
NEXT_PUBLIC_REGISTRATION_WHITELIST_ENABLED=false
NEXT_PUBLIC_REGISTRATION_WHITELIST=
```

### Cron Jobs (Vercel Cron)
Create `vercel.json` in project root:
```json
{
  "crons": [{
    "path": "/api/cron/monthly-snapshot",
    "schedule": "0 20 28-31 * *"
  }]
}
```

**Schedule Explanation**:
- `0 20 28-31 * *` = Run at 8 PM UTC on days 28-31 of every month
- Covers month-end for all months (28th for Feb, 30th for Apr/Jun/Sep/Nov, 31st for others)
- UTC time: Adjust for local timezone (Italy = UTC+1 winter, UTC+2 summer)

**Note on Visual Studio npm install error**:
If you receive execution policy errors, run:
```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope Process
```

### Custom Domain (Optional)
- Register domain (e.g., `portfolio.example.com`)
- Add in Vercel dashboard
- Configure DNS (automatic with Vercel nameservers)

## Implementation Status & Roadmap

### ✅ Phase 1: Core Portfolio Features (COMPLETED)
- [x] Asset management (CRUD operations)
- [x] Automatic price fetching from Yahoo Finance v3+
- [x] Asset allocation tracking and comparison
- [x] Formula-based allocation (age + risk-free rate)
- [x] Fixed amount cash support
- [x] Composite assets (pension funds)
- [x] Settings page for allocation targets
- [x] Sub-category management

### ✅ Phase 2: Historical Analysis (COMPLETED)
- [x] Automated monthly snapshot creation (Cron job)
- [x] Net worth timeline chart
- [x] Asset class evolution chart (stacked area)
- [x] Liquidity evolution chart
- [x] Current vs target visualization (progress bars)
- [x] CSV export functionality
- [x] Toggle € / % view

### ✅ Phase 3: Expense Tracking (COMPLETED)
- [x] Expense management (CRUD)
- [x] 4 expense types (Income, Fixed, Variable, Debt)
- [x] Custom categories with sub-categories
- [x] Recurring expenses (automatic creation)
- [x] Expense charts (4 types)
- [x] Monthly statistics with MoM delta
- [x] Category colors and visual coding
- [x] Integration in main dashboard
- [x] Settings page for category management

### ✅ Phase 4: FIRE Tracking (COMPLETED)
- [x] FIRE target configuration (Safe Withdrawal Rate)
- [x] Planned annual expenses input (optional planning)
- [x] FIRE Number calculator (25x annual expenses formula)
- [x] Progress to FI percentage tracker
- [x] Withdrawal rate calculator (4% rule implementation)
- [x] Annual/Monthly/Daily allowance calculations
- [x] Current Withdrawal Rate vs target comparison
- [x] Years of expenses coverage calculator
- [x] Planned vs Actual FIRE scenario comparison
- [x] Historical evolution chart (Income, Expenses, Allowance)
- [x] Integration with Settings page
- [x] Educational info about FIRE methodology (Trinity Study)

### ✅ Phase 5: Hall of Fame (COMPLETED)
- [x] Monthly rankings system (Top 20)
  - [x] Best months by Net Worth growth
  - [x] Best months by Income
  - [x] Worst months by Net Worth decline
  - [x] Worst months by Expenses
- [x] Yearly rankings system (Top 10)
  - [x] Best years by Net Worth growth
  - [x] Best years by Income
  - [x] Worst years by Net Worth decline
  - [x] Worst years by Expenses
- [x] Automatic calculation from snapshots and expenses
- [x] Persistent storage in Firestore (`hall-of-fame` collection)
- [x] Visual ranking tables with color-coded cards
- [x] Trophy icon UI elements
- [x] Empty state handling (< 2 snapshots)
- [x] Firestore security rules for hall-of-fame collection

### 🔄 Phase 6: Advanced Features (FUTURE)
- [ ] CSV/Excel import for bulk asset additions
- [ ] PDF export of portfolio reports
- [ ] Email notifications (monthly summary)
- [ ] Multi-currency full conversion
- [ ] Tax reporting (capital gains, dividends)
- [ ] Dividend tracking
- [ ] Cost basis tracking (average cost per share)

### 🔄 Phase 7: Portfolio Analysis (FUTURE)
- [ ] Performance metrics (ROI, IRR, CAGR)
- [ ] Risk metrics (Sharpe ratio, volatility, max drawdown)
- [ ] Correlation analysis between assets
- [ ] Factor exposure breakdown
- [ ] Backtesting allocation strategies
- [ ] Monte Carlo simulations

## Support & Maintenance

### Common Issues & Solutions

1. **Ticker not found on Yahoo Finance**
   - **Solution**: Verify ticker format. US: `AAPL`, EU needs suffix: `VWCE.DE` (XETRA), `BMW.DE`, `NESN.SW` (Swiss)
   - System shows error, allows manual price entry

2. **Error: "Module not found: Can't resolve 'child_process'"**
   - **Cause**: yahoo-finance2 imported in client component
   - **Solution**: Use `/api/prices/quote` server route instead

3. **Error: "Call const yahooFinance = new YahooFinance() first"**
   - **Cause**: yahoo-finance2 v3+ requires instance
   - **Solution**: Already fixed with singleton pattern

4. **500 Error when updating prices**
   - **Cause**: Missing Firebase Admin SDK credentials
   - **Solution**: Verify `.env.local` has correct `FIREBASE_ADMIN_*` variables

5. **Allocation doesn't sum to 100%**
   - **Issue**: Rounding errors or incorrect targets
   - **Solution**: Settings page validates and shows error

6. **Charts not loading**
   - **Check**: Recharts installed (`npm list recharts`)
   - **Check**: Data format matches expected structure
   - **Check**: Browser console for errors

7. **SelectItem empty value error**
   - **Cause**: shadcn/ui Select doesn't support empty string values
   - **Solution**: Use `undefined` instead of `''` for optional selects

### Debugging
- **Firebase Console**: View raw database documents
- **Vercel Logs**: Check API route execution and errors
- **Browser DevTools**: Network tab for failed requests, Console for JS errors
- **React DevTools**: Component state and props inspection

### Contact
For questions or issues:
- Review Firebase/Vercel documentation
- Consult Next.js App Router guides
- Check shadcn/ui component documentation

## Registration Control System

The application includes a flexible registration control system designed for open source deployments where you may want to limit who can create accounts.

### Features
- **Complete Registration Blocking**: Disable all new registrations while allowing existing users to log in
- **Email Whitelist**: Allow only specific email addresses to register
- **Server-Side Validation**: Impossible to bypass via client-side manipulation
- **Multi-Layer Security**: Client-side UX feedback + server-side validation
- **Orphan Document Prevention**: Automatic cleanup of Firestore documents if registration is blocked

### Configuration

Set these environment variables in Vercel or `.env.local`:

**Scenario 1: Open Registrations (Default)**
```bash
NEXT_PUBLIC_REGISTRATIONS_ENABLED=true
NEXT_PUBLIC_REGISTRATION_WHITELIST_ENABLED=false
```
→ Anyone can register

**Scenario 2: Completely Blocked**
```bash
NEXT_PUBLIC_REGISTRATIONS_ENABLED=false
NEXT_PUBLIC_REGISTRATION_WHITELIST_ENABLED=false
```
→ No new registrations allowed, shows "Registration Disabled" page

**Scenario 3: Whitelist Only**
```bash
NEXT_PUBLIC_REGISTRATIONS_ENABLED=false
NEXT_PUBLIC_REGISTRATION_WHITELIST_ENABLED=true
NEXT_PUBLIC_REGISTRATION_WHITELIST=your-email@gmail.com,admin@example.com
```
→ Only whitelisted emails can register

### Implementation Details

- **Client-Side Check** (`app/register/page.tsx`): Provides immediate user feedback
- **Server-Side API** (`app/api/auth/check-registration/route.ts`): Validates registration permissions
- **AuthContext Integration** (`contexts/AuthContext.tsx`): Validates both email/password and Google sign-in registrations
- **Race Condition Fix**: Prevents orphan Firestore documents when Google registration is blocked

### Security Layers

1. **UI Layer**: Shows appropriate message when registrations are disabled
2. **API Layer**: Server validates registration before allowing Firebase user creation
3. **Cleanup Layer**: Automatically removes orphan documents if race condition occurs

This system is ideal for personal deployments where you want to use the app yourself without allowing public registrations.

## License
Private project - All rights reserved

## Acknowledgments
- Built to replace 5+ years of Google Sheets tracking
- Inspired by FIRE community portfolio tracking needs
- Designed for Italian investors (EUR, XETRA, Borsa Italiana)
- Expense tracking inspired by YNAB and Mint methodologies

---

## Technical Notes

### Yahoo Finance v3+ Migration
This project uses `yahoo-finance2` v3.x which requires creating a YahooFinance instance:
```typescript
import { YahooFinance } from 'yahoo-finance2';
const yahooFinance = new YahooFinance();
```

### Firebase Architecture
- **Client SDK** (`firebase/firestore`): Used in React components for real-time data
- **Admin SDK** (`firebase-admin/firestore`): Used in API routes for server-side operations
- API routes MUST use Admin SDK to avoid auth issues

### API Route Pattern
All price fetching goes through server-side routes:
```
Client Component → fetch('/api/prices/quote') → Server Route → Yahoo Finance API
```

### Expense Amount Convention
- **Income**: Positive values (€3,500)
- **Expenses**: Negative values (-€2,100)
- **Form Input**: Always positive, system converts based on type
- **Net Balance**: Sum of all amounts (€3,500 - €2,100 = €1,400)

### Recurring Expenses Algorithm
1. User specifies: start date, recurring day, number of months
2. System generates N expense entries
3. Each entry gets same `recurringParentId` for batch operations
4. Date calculation handles short months (Feb 30 → Feb 28/29)
5. Delete action offers: delete single OR delete all recurring

---

**Version**: 2.3.0 (Registration Control & Code Cleanup)
**Last Updated**: January 2025
**Status**: ✅ Phases 1-5 Complete - Production Ready

**Recent Updates** (January 2025):
- ✅ **Registration Control System** with email whitelist support for open source deployments
- ✅ **Removed unused Exchange field** from asset management (not needed for Yahoo Finance)
- ✅ **Fixed race condition** preventing orphan Firestore documents during blocked Google registrations
- ✅ **Server-side validation** for user registration to prevent client-side bypass
- ✅ **Multi-layer security** with client UX feedback + API validation + cleanup logic

**Previous Updates** (November 2025):
- ✅ **FIRE Calculator** with Safe Withdrawal Rate configuration
- ✅ **Planned vs Actual FIRE scenarios** comparison
- ✅ **Hall of Fame** personal rankings (monthly & yearly)
- ✅ **Month/Year expense filtering** with cascading dropdowns
- ✅ **Withdrawal rate storage** in user settings
- ✅ **Historical FIRE evolution chart**
- Default asset allocation (60/40) for new users
- Year-to-Date variation tracking in Dashboard
- Historical YoY bar chart in History page
- Separate Cashflow pages (current year vs all-time)
- Improved asset display formatting (e.g., "Real Estate")
