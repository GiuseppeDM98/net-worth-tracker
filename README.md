# 💰 Portfolio Tracker

A comprehensive web application for tracking and managing investment portfolios across multiple asset classes, with integrated expense tracking, FIRE (Financial Independence, Retire Early) calculator, and personal financial rankings.

Built with Next.js, Firebase, and TypeScript. Designed to replace spreadsheet-based portfolio management with a modern, automated solution.

[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL%203.0-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)
[![Next.js](https://img.shields.io/badge/Next.js-16.0-black)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue)](https://www.typescriptlang.org/)
[![Firebase](https://img.shields.io/badge/Firebase-Firestore-orange)](https://firebase.google.com/)

---

## 📸 Screenshots

### Dashboard Overview
<img width="2284" height="1271" alt="image" src="https://github.com/user-attachments/assets/8b11c9a4-3907-4801-8b6d-7cbac8f0882b" />


### Asset Management
<img width="2299" height="600" alt="image" src="https://github.com/user-attachments/assets/aa8373f5-883e-438f-af6d-b511009edf9e" />


### Asset Allocation Comparison
<img width="2293" height="1070" alt="image" src="https://github.com/user-attachments/assets/2b9b2450-9d64-4127-813d-c7b77fb84b02" />


### Historical Performance Charts
<img width="2289" height="1234" alt="image" src="https://github.com/user-attachments/assets/fee5a375-39d4-4030-901f-a6fb2d3ba99b" />


### Expense Tracking
<img width="2281" height="1262" alt="image" src="https://github.com/user-attachments/assets/fde827b9-60a0-4b63-857f-51f56813141d" />


### Expense Analytics
<img width="2251" height="1273" alt="image" src="https://github.com/user-attachments/assets/b4d7fa8f-49a1-46fd-af4a-9065a90c9d36" />


### FIRE Tracker
<img width="2283" height="1258" alt="image" src="https://github.com/user-attachments/assets/580da85f-8557-4e2f-b973-92159b69be18" />


### Hall of Fame Rankings
<img width="2286" height="1261" alt="image" src="https://github.com/user-attachments/assets/7fe5b615-2905-4da3-9ec3-54bdaee184c9" />


---

## ✨ Key Features

### 📊 **Portfolio Management**
- **Multi-asset class support**: Stocks, ETFs, bonds, crypto, real estate, commodities, cash, private equity
- **Automatic price updates** from Yahoo Finance for 100+ exchanges worldwide
- **Asset allocation tracking** with target vs current comparison and rebalancing recommendations
- **Composite assets** for pension funds and mixed-allocation investments
- **Liquidity tracking** to separate liquid and illiquid net worth
- **Cost basis tracking** with unrealized gains and tax estimation
  - Track average cost per share/unit for each asset
  - Automatic calculation of unrealized gains (current value - cost basis)
  - **G/P (Gain/Loss) column** in Assets table showing absolute value and percentage for each asset
  - **Total portfolio G/P** displayed in table footer with aggregate performance
  - Special calculation for real estate: G/P based on gross property value vs purchase cost (independent of outstanding debt)
  - Estimated tax calculation based on configurable tax rates
  - Gross and net net worth visualization (before/after taxes)
- **Capital Gains Tax Calculator** for simulating asset sales
  - Interactive modal accessible from Assets page (calculator icon)
  - Two input modes: sell by quantity or by target sale value
  - Real-time calculations showing sale value, gains/losses, taxes, and net proceeds
  - Visual indicators: green for gains, red for losses
  - Edge case handling (prevents selling more than owned)
  - Read-only simulator with no database changes
  - Helpful contextual messages (e.g., "to get €10k net, you need to sell €11.2k gross")
  - Only visible for assets with cost basis tracking enabled
- **TER (Total Expense Ratio) tracking** for cost-conscious investing
  - Optional TER field for ETFs, mutual funds, and other managed investments
  - Weighted average portfolio TER calculation
  - **Annual portfolio cost** displayed in absolute terms (EUR)
  - Dashboard cards showing Portfolio TER percentage and yearly management costs
  - **PMC (Average Cost) and TER columns** in Assets table for quick reference

### 💰 **Dividend Tracking & Income Automation**
- **Automatic dividend import** from Borsa Italiana for Italian stocks and ETFs
- **Manual entry** with automatic withholding tax calculation (26% Italian rate, customizable for foreign dividends)
- **Expense integration**: Automatically create income entries when dividends are paid
- **Web scraping**: Bulk import historical dividends using ISIN lookup from Borsa Italiana
- **Daily automation**: Scheduled cron job processes new dividends and creates corresponding income expenses
- **Comprehensive analytics**:
  - Dividend yield (TTM - Trailing Twelve Months)
  - Top dividend contributors by asset
  - Historical trends (by year and month)
  - Upcoming payments tracker for assets still owned
- **Four dividend types**: Ordinary, Extraordinary, Interim, Final
- **Multi-currency support**: EUR, USD, GBP, CHF
- **Interactive visualizations**:
  - Pie chart: Dividends by asset
  - Bar chart: Dividends by year (gross, tax, net)
  - Line chart: Monthly dividend income trends
  - Top 10 assets table ranked by net dividends
- **Detailed tracking**: Per-share amounts, quantity held, total gross/net, tax breakdown
- **Smart filtering**: By asset, dividend type, and date range
- **CSV export**: Download dividend history for external analysis

### 📈 **Historical Analysis**
- **Automated monthly snapshots** via scheduled cron jobs
- **Net worth timeline** with interactive charts
- **Asset class evolution** visualization over time
- **Year-over-year performance** comparison
- **CSV export** for external analysis

### 📊 **Performance Metrics & Analytics**
- **Advanced portfolio performance analysis** with industry-standard metrics
- **8 Key Metrics** calculated automatically:
  - **ROI (Return on Investment)**: Simple total return percentage
  - **CAGR (Compound Annual Growth Rate)**: Annualized growth rate accounting for time
  - **Time-Weighted Return (TWR)**: Primary performance metric that eliminates cash flow timing effects using geometric linking
  - **Money-Weighted Return (IRR)**: Internal rate of return using Newton-Raphson iterative solver, shows actual investor return
  - **Sharpe Ratio**: Risk-adjusted performance metric (excess return per unit of volatility)
  - **Volatility**: Annualized standard deviation with ±50% outlier filtering
  - **Net Cash Flows**: Total contributions minus withdrawals with detailed income/expense breakdown
  - **Duration**: Investment period in months and years with accurate inclusive counting
- **7 Time Periods** for flexible analysis:
  - Year-to-Date (YTD), 1 Year, 3 Years, 5 Years, All Time
  - Rolling 12-month and 36-month windows
  - Custom date range selector for precise period analysis
- **Temporal accuracy**: Cash flows and portfolio values properly aligned to end-of-month snapshots
- **Enhanced Contributi Netti card**: Shows detailed breakdown (Entrate | Uscite) for full transparency
- **Comprehensive tooltips**: Each metric includes detailed explanations, formulas, and interpretation guidelines
- **Automatic cash flow integration**: Derives contributions/withdrawals from expense and income data
- **Interactive visualizations**:
  - Net Worth Evolution chart: Shows portfolio growth split into contributions vs investment returns
  - Rolling CAGR trend chart: Tracks annualized performance over time
- **Sharpe Ratio configuration**: Uses risk-free rate from user's asset allocation settings
- **Mobile-responsive design**: Optimized grid layout with clean chart formatting
- **Methodology section**: Includes "Periodi Temporali e Snapshot" with concrete examples explaining YTD vs 1Y difference
- **Insufficient data handling**: Clear messaging when period has <2 snapshots or limited data

### 📄 **PDF Export & Reporting**
- **Comprehensive portfolio reports** with professional PDF generation
- **Customizable sections**: Choose which data to include (Portfolio, Allocation, History, Cashflow, FIRE, Summary)
- **Visual data preservation**: Charts captured as high-quality images embedded in PDF
- **Six exportable sections**:
  - **Portfolio Assets**: Complete asset listing with values, weights, G/P, TER
  - **Asset Allocation**: Current vs target comparison with rebalancing recommendations
  - **Historical Performance**: Net worth evolution and asset class trends over time
  - **Cashflow Analysis**: Income, expenses, savings rate with top spending categories
  - **FIRE Calculator**: Progress to Financial Independence with customizable Safe Withdrawal Rate
  - **Summary Overview**: Key metrics snapshot (net worth, allocation score, FIRE progress)
- **Dynamic calculations**:
  - Safe Withdrawal Rate integration (4% default or custom user setting)
  - FIRE Number multiplier automatically adjusts (25x for 4% SWR, 33.33x for 3%, etc.)
  - Average monthly savings calculated across all tracked months
  - Rebalancing actions include all asset classes with ±2% threshold deviation
- **Professional formatting**: Styled headers, color-coded metrics, branded footer
- **Export dialog**: Toggle individual sections on/off before generating
- **One-click download**: Generates and downloads PDF with timestamp in filename

### 💸 **Expense & Income Tracking**
- **Four entry types**: Income, Fixed Expenses, Variable Expenses, Debts
- **Custom categories** with sub-categories and color coding
- **Recurring expenses** with automatic monthly generation
- **Installment payments (BNPL)** for tracking multi-payment purchases
  - **Dual modes**: Auto-calculate equal installments or enter custom amounts per payment
  - **Flexible terms**: 2-60 installments with monthly frequency
  - **Smart preview**: Shows simplified format when payments are equal, detailed breakdown when different
  - **Batch creation**: Generates all installments in one operation with proper date distribution
  - **Visual tracking**: "Rata X/Y" badges in expense table for easy identification
  - **Bulk deletion**: Option to delete entire installment series or individual payments
  - **Universal support**: Available for all expense/income types, not just debts
  - **Mutual exclusion**: Prevents conflicts with recurring expense feature
- **Visual analytics**: Spending breakdown by category, type, and monthly trends
- **Interactive drill-down pie charts** for hierarchical data exploration
  - **Three-level navigation**: Categories → Subcategories → Individual transactions
  - **Click-to-explore**: Click any pie chart slice to drill down into detailed breakdowns
  - **Color inheritance**: Subcategories use derived color variations from parent category
  - **"Altro" slice**: Automatically groups expenses without assigned subcategories
  - **Back navigation**: Breadcrumb-style titles and back button for easy navigation
  - **Transaction details**: View date, amount, notes, and links for individual expenses/income
  - **Informative alert**: Dismissible tip explaining drill-down functionality (persisted via localStorage)
  - **Auto-scroll on drill-down**: Automatically scrolls to keep the active chart in view when navigating
  - Available for both "Spese per Categoria" and "Entrate per Categoria" charts
  - Year filter context maintained across all drill-down levels
- **Specific asset allocation tracking** (#57) for granular portfolio target management
  - **Three-level allocation hierarchy**: Asset Class → Subcategory → Specific Assets
  - Define target percentages for individual tickers within subcategories
  - Interactive drill-down with info icon (ℹ️) and breadcrumb navigation
  - Per-subcategory toggle with collapsible UI for space efficiency
  - Real-time validation: specific asset percentages must sum to 100%
  - Theoretical targets with automatic buy/sell recommendations
  - Backward compatible with existing allocation data
  - Example: Track "AAPL 25%, MSFT 25%, GOOGL 25%, AMZN 25%" within "Single Stock" subcategory
- **Year/month filtering** with dynamic statistics
- **Advanced expense filtering system** (#50) for precision expense tracking
  - **Hierarchical filter progression**: Type → Category → Subcategory with smart field enabling
  - **Searchable comboboxes**: Real-time search across all filter levels for quick selection
  - **Progressive filtering logic**: Categories enabled only after type selection, subcategories only after category
  - **Individual filter removal**: X buttons on each active filter for granular control without full reset
  - **Smart hierarchical clearing**: Clearing Type resets Category and Subcategory; clearing Category resets only Subcategory
  - **Real-time statistics**: All dashboard cards update dynamically based on filtered expense data
  - **Cumulative AND filtering**: Combine multiple filters for precise data exploration
  - **Visual filter badges**: Active selections displayed with colored badges and clear indicators
  - Type filter automatically narrows available categories (e.g., only "Spese Fisse" categories when type is "fixed")
  - Example workflow: Filter "Variabili" → "Animali domestici" → "Cibo" to analyze specific pet food expenses
- **Income-to-expense ratio metric** for financial health monitoring
  - Real-time calculation of income/expense ratio
  - Color-coded indicators: Green (≥1.2 optimal), Yellow (0.8-1.2 balanced), Red (<0.8 warning)
  - Descriptive status messages for quick financial health assessment
  - Year-filtered metric that updates dynamically with selected period
  - Handles edge cases (displays "N/A" when no expenses recorded)
- **Dynamic page title**: Automatically displays the filtered month/year in the page title
  - Shows "Tracciamento Spese Gennaio 2025" when filtering by month
  - Shows "Tracciamento Spese 2025" when viewing entire year
  - Clean, space-efficient design without redundant indicators
  - Prevents confusion between filtered and unfiltered views
- **Collapsible filters section** with toggle to show/hide filter controls
  - Saves screen space when filters are not actively being changed
  - Chevron icon indicates expand/collapse state
  - Defaults to expanded for easy access
- **Current year view** by default with automatic filters
- **Smart category management** with expense protection
  - **Automatic expense reassignment** when deleting categories with associated expenses
  - **Interactive reassignment dialog** with searchable category dropdown
  - **Inline category creation** during deletion workflow (no need to leave the dialog)
  - **Flexible deletion options**:
    - Reassign expenses to another category before deletion
    - Delete without reassignment (expenses marked as "Senza categoria")
  - **Auto-update expense records** when category names are modified
  - **Subcategory protection** with same reassignment workflow
  - **Prevents orphaned data** and maintains data integrity across all expense records
- **Searchable category and subcategory dropdowns** (#43) for faster expense entry
  - **Real-time search** with partial match support (case-insensitive)
  - **Reusable SearchableCombobox** component with consistent UX
  - **Keyboard navigation** and click-outside detection for seamless interaction
  - **Color-coded category indicators** displayed in search results
  - **Significantly improved UX** especially for users with many categories
  - No more scrolling through long dropdown lists - just start typing
  - Example: Type "food" to instantly find "Food & Dining", "Fast Food", "Pet Food"
  - Maintains all existing functionality: inline creation, validation, color display
- **Amount column sorting** (#63) in Cashflow tracking table
  - **Three-state toggle**: Click "Importo" header to cycle between descending → ascending → default date order
  - **Visual indicators**: Arrow icons (↓/↑) show current sort direction
  - **Real-value sorting**: Income and expenses grouped naturally (highest income first when descending, largest expenses first when ascending)
  - **Smart auto-reset**: Sort resets to date order when filters change
  - **Preserves all functionality**: Works seamlessly with pagination, filtering, and existing table features
  - Example: Quickly identify highest monthly expense or largest income source with one click
- **Current Month Quick Filter** (#64) for instant access to current month data
  - **One-click filtering**: "Mese corrente" button next to month dropdown automatically sets current year and month
  - **Smart year override**: Updates both year and month filters to ensure consistency
  - **Perfect alignment**: Filter controls aligned with `items-end` for clean visual appearance
  - **Mobile-responsive**: Button wraps appropriately on smaller screens
  - **Always accessible**: Button remains enabled for quick data refresh
  - Example: Jump to current month's expenses with a single click instead of navigating dropdowns

### 🔥 **FIRE Calculator & Tracker**
- **Safe Withdrawal Rate** configuration (4% rule based on Trinity Study)
- **FIRE Number calculator** (25x annual expenses methodology)
- **Progress tracking** toward financial independence
- **Current vs Planned scenarios** comparison
- **Monthly/Annual/Daily allowance** calculations
- **Years of expenses** coverage tracker
- **Historical evolution** charts of income, expenses, and sustainable withdrawal

### 🎲 **Monte Carlo Retirement Simulations**
- **Probabilistic retirement planning** with thousands of simulations
- **Success rate calculation** to assess plan sustainability
- **Market vs Historical parameters**: Use standard market assumptions or your own historical returns
- **Flexible portfolio selection**: Total net worth, liquid assets only, or custom amount
- **Interactive visualizations**:
  - Fan chart showing percentile distributions (10th, 25th, 50th, 75th, 90th)
  - Distribution histogram of final portfolio values
  - Failure analysis with median and average depletion years
- **Configurable parameters**: Retirement duration, asset allocation, withdrawal rates, inflation
- **Automatic data integration**: Pre-populates with your current portfolio and expense data

### 🏆 **Hall of Fame Rankings**
- **Personal financial records** across all time
- **Best/Worst months** by net worth growth, income, and expenses (Top 20)
- **Best/Worst years** by annual performance (Top 10)
- **Automatic ranking updates** with each new snapshot
- **Motivation tracking** to compare current performance with historical bests
- **Dedicated notes system**: Add contextual notes to specific periods across multiple ranking sections with visual indicators

### 🎨 **Streamlined Navigation & UI**
- **Simplified sidebar** from 11 to 8 navigation items for cleaner UX
- **Grouped related pages** with tab-based navigation:
  - **FIRE e Simulazioni**: Combines FIRE Calculator and Monte Carlo simulations in one place
  - **Cashflow**: Unified section with 3 tabs:
    - **Tracciamento**: Full expense/income tracking with filters
    - **Anno Corrente**: Current year analytics with drill-down charts
    - **Storico Totale**: All-time cashflow trends and visualizations
- **Contextual navigation**: Switch between related views without leaving the page
- **Backward compatible**: Original URLs still work for existing bookmarks and links
- **Reduced cognitive load**: Logical grouping makes features easier to discover

### ⚙️ **Smart Automation**
- **Formula-based allocation**: Auto-calculate equity/bonds % based on age and risk-free rate
- **End-of-month automation**: Prices update and snapshots create automatically
- **Smart price updates**: Skip assets that don't need updates (cash, real estate)
- **Duplicate protection**: Prevent creating duplicate snapshots

---

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ and npm
- Firebase account (free tier)
- Vercel account (free tier) or any Node.js hosting

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/your-username/portfolio-tracker.git
   cd portfolio-tracker
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up Firebase**
   - Create a Firebase project ([detailed guide](./SETUP.md#firebase-setup))
   - Enable Firestore Database and Authentication
   - Configure security rules

4. **Configure environment variables**

   Create a `.env.local` file:
   ```bash
   # Firebase Client SDK
   NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key
   NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
   NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
   NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
   NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
   NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id

   # Firebase Admin SDK (server-side)
   FIREBASE_SERVICE_ACCOUNT_KEY={"type":"service_account",...}

   # Cron Job Security
   CRON_SECRET=your_secure_random_string

   # App URL
   NEXT_PUBLIC_APP_URL=http://localhost:3000
   ```

   **For detailed setup instructions, see [SETUP.md](./SETUP.md)**

5. **Run the development server**
   ```bash
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000)

6. **Deploy to Vercel**

   See the [Deployment Guide](./SETUP.md#vercel-deployment) for production deployment instructions.

---

## 🛠 Tech Stack

| Category | Technology |
|----------|-----------|
| **Frontend** | Next.js 16 (App Router), React 19, TypeScript 5 |
| **Styling** | Tailwind CSS 4, shadcn/ui components |
| **Backend** | Next.js API Routes (serverless) |
| **Database** | Firebase Firestore (NoSQL) |
| **Authentication** | Firebase Authentication |
| **Price Data** | Yahoo Finance API (via yahoo-finance2) |
| **Charts** | Recharts |
| **Deployment** | Vercel (with Cron Jobs) |
| **Form Management** | react-hook-form + zod validation |
| **Date Utilities** | date-fns (Italian locale) |

### Why These Choices?

- **Next.js**: Best-in-class React framework with excellent developer experience
- **Firebase**: Generous free tier, real-time updates, easy authentication, no server management
- **Yahoo Finance**: Free, reliable, extensive ticker coverage (unlike most paid APIs)
- **Vercel**: Seamless Next.js integration, automatic deployments, built-in cron jobs
- **TypeScript**: Type safety prevents bugs and improves maintainability

---

## 📚 Documentation

- **[Setup Guide](./SETUP.md)**: Complete installation and configuration guide
  - Firebase setup (Firestore, Authentication, Security Rules)
  - Vercel deployment (environment variables, cron jobs)
  - Price data provider alternatives (Alpha Vantage, Finnhub, Twelve Data)
  - Infrastructure alternatives (MongoDB, Supabase, Netlify, Railway)

- **[Vercel Configuration](./VERCEL_SETUP.md)**: Firebase Admin SDK troubleshooting on Vercel

- **[Cron Job Configuration](./vercel.json)**: Automated monthly snapshots schedule

---

## 🌍 Localization

The application is designed for **Italian users** with:

- 🇮🇹 **Italian UI** (labels, navigation, messages)
- **EUR currency** formatting: €1.234,56
- **Italian date format**: DD/MM/YYYY
- **Italian number format**: 1.234,56
- Support for **European exchanges** (XETRA, Borsa Italiana, Euronext, etc.)

### Supported Markets

- 🇺🇸 US exchanges (NYSE, NASDAQ)
- 🇪🇺 European exchanges (XETRA, LSE, Euronext, Borsa Italiana)
- 🌏 Global exchanges (Tokyo, Hong Kong, Toronto, etc.)

*Ticker format examples*:
- US: `AAPL`, `TSLA`, `MSFT`
- Germany (XETRA): `VWCE.DE`, `BMW.DE`
- UK (LSE): `BP.L`, `HSBA.L`
- Italy: `ENEL.MI`, `UCG.MI`

---

## 🔐 Security & Privacy

- **Authentication**: Firebase Auth with email/password and Google sign-in
- **Authorization**: Firestore security rules ensure users can only access their own data
- **Registration Control**: Optional whitelist system to restrict who can create accounts
- **Data Privacy**: Your financial data stays in your Firebase project (no third-party services)
- **Server-side Validation**: Prevents client-side manipulation of critical operations
- **Cron Secret**: Protects automated endpoints from unauthorized access

### Registration Control

Configure who can register for your deployment:

```bash
# Open to everyone (default)
NEXT_PUBLIC_REGISTRATIONS_ENABLED=true

# Completely block new registrations
NEXT_PUBLIC_REGISTRATIONS_ENABLED=false

# Only allow specific emails (whitelist)
NEXT_PUBLIC_REGISTRATIONS_ENABLED=false
NEXT_PUBLIC_REGISTRATION_WHITELIST_ENABLED=true
NEXT_PUBLIC_REGISTRATION_WHITELIST=your-email@gmail.com,admin@example.com
```

See [SETUP.md](./SETUP.md#registration-control) for details.

---

## 🧪 Development Features

### Test Snapshot Generator

For development and testing purposes, the application includes a **bulk test snapshot generator** that creates realistic historical data to test charts, statistics, and UI components.

#### How to Enable

1. **Set environment variable** in your `.env.local`:
   ```bash
   NEXT_PUBLIC_ENABLE_TEST_SNAPSHOTS=true
   ```

2. **Navigate to Settings page** in the application

3. **Scroll to "Funzionalità di Sviluppo"** section (only visible when enabled)

4. **Click "Genera Snapshot di Test"** button

#### What It Does

The test data generator creates:

**1. Historical Monthly Snapshots** (going back N months, configurable up to 120)
- Initial net worth: Configurable (default: €50,000)
- Monthly growth rate: Configurable average portfolio growth (default: 0.8% → ~10% annual)
- Asset allocation: 85% liquid / 15% illiquid
- Asset class distribution: 60% equity, 25% bonds, 8% crypto, 5% real estate, 2% cash
- **Realistic asset class returns** with different volatilities:
  - **Equity** (60%): ~1.0% monthly (~12% annual), volatility ~5% annual
  - **Bonds** (25%): ~0.4% monthly (~5% annual), volatility ~1.5% annual
  - **Crypto** (8%): ~1.2% monthly (~15% annual), volatility ~10% annual (high risk)
  - **Real Estate** (5%): ~0.6% monthly (~7% annual), volatility ~1% annual
  - **Cash** (2%): ~0.2% monthly (~2.4% annual, inflation), minimal volatility
- 10 dummy assets: AAPL, GOOGL, MSFT, TSLA, BTC, ETH, US Treasury, Corporate Bonds, Real Estate Fund, Cash EUR
- Random but realistic price variations using normal distribution (Box-Muller transform)

**Technical Implementation:**
- Each asset class grows **independently** with its own return rate and volatility
- Equity, bonds, crypto, real estate, and cash are tracked separately month-by-month
- Portfolio value is recalculated as sum of all asset classes each month
- This creates realistic correlation and diversification effects
- Asset allocation percentages vary over time based on performance (e.g., if equity outperforms, its percentage increases)
- **Perfect for testing Monte Carlo simulations** with historical data that has proper equity/bonds differentiation

**2. Expenses & Income Data** (optional, enabled by default)
- **Income entries**: 1-2 per month with ±8% variation
  - Categories: Stipendio, Freelance, Investimenti, Altro
- **Fixed expenses**: Constant with ±3% variation (35% of total expenses)
  - Categories: Affitto, Utenze, Abbonamenti
- **Variable expenses**: 8-15 entries per month with ±40% variation (50% of total expenses)
  - Categories: Spesa, Trasporti, Svago, Shopping
- **Debts**: Nearly constant with ±1% variation (15% of total expenses)
  - Categories: Mutuo, Prestito Auto
- Realistic date distribution throughout each month

#### Parameters

When you click the button, a modal allows you to configure:

**Patrimonio (Net Worth):**
- **Patrimonio Iniziale** (Initial Net Worth): Starting amount in EUR (default: €50,000)
- **Tasso di Crescita Mensile** (Monthly Growth Rate): Average monthly portfolio growth percentage (default: 0.8% → ~10% annual). Realistic range: 0.5-1.0% for typical portfolios
- **Numero di Mesi** (Number of Months): How many months to generate (1-120, default: 24)

**Spese ed Entrate (optional toggle):**
- **Entrate Mensili Medie** (Average Monthly Income): Mean monthly income in EUR (default: €3,000)
- **Spese Mensili Medie** (Average Monthly Expenses): Mean monthly expenses in EUR (default: €2,500)

#### 🏷️ Dummy Data Identification

All test data generated by this feature is marked with special identifiers for easy management:

- **Snapshots**: Have `isDummy: true` field in the database
- **Expenses**: Have IDs starting with `dummy-` (e.g., `dummy-income-...`, `dummy-fixed-...`)
- **Categories**: Have IDs starting with `dummy-category-` (e.g., `dummy-category-income-stipendio`)

This naming convention allows you to identify and remove all test data at once.

#### ⚠️ Important Warning

**Test data is saved to the same Firebase collections as real data:**
- Snapshots → `monthly-snapshots` collection (with `isDummy: true`)
- Expenses → `expenses` collection (with IDs starting with `dummy-`)
- Categories → `expenseCategories` collection (with IDs starting with `dummy-category-`)

All test data will appear in your charts, statistics, and Hall of Fame alongside real data.

#### 🗑️ Removing Test Data

You have two options to remove test data:

**Option 1: Use the Built-in Delete Button (Recommended)**
1. Navigate to **Settings** page in the application
2. Scroll to **"Funzionalità di Sviluppo"** section
3. Click **"Elimina Tutti i Dati Dummy"** button
4. Review the count of items to be deleted
5. Confirm deletion

This will remove all dummy snapshots, expenses, and categories in one operation.

**Option 2: Manual Firebase Console Deletion**
1. Open [Firebase Console](https://console.firebase.google.com/)
2. Navigate to Firestore Database
3. Select your project
4. Delete test documents from these collections:
   - `monthly-snapshots`: Documents with `isDummy: true` field
   - `expenses`: Documents with IDs starting with `dummy-`
   - `expenseCategories`: Documents with IDs starting with `dummy-category-`

**Recommendation**: Only use this feature in a development/test environment or in a separate Firebase project to avoid mixing test data with real financial data.

#### Use Cases

- **Testing charts** with historical data without waiting months for real snapshots
- **Hall of Fame testing** with realistic income/expense variations to see best/worst months and years
- **FIRE calculator testing** with actual expense data to validate sustainable withdrawal calculations
- **Monte Carlo simulation testing** with realistic equity/bonds returns and volatilities that differ appropriately (equity higher return/volatility, bonds lower)
- **Expense analytics testing** to verify category breakdowns, trends, and monthly comparisons
- **UI development** to see how components handle different data scales and edge cases
- **Performance testing** with large datasets (up to 120 months of data)
- **Demo purposes** to showcase the application's full capabilities
- **Development** of new features requiring historical portfolio and expense data

---

## 🔄 Price Data Providers

This project uses **Yahoo Finance** by default (free, no API key required).

### Want to use a different provider?

The following alternatives are supported but **require custom integration**:

| Provider | Free Tier | Rate Limit | API Key Required |
|----------|-----------|------------|------------------|
| **Yahoo Finance** ✅ | Unlimited | Reasonable use | No |
| **Alpha Vantage** | 500 calls/day | 5 calls/min | Yes |
| **Finnhub** | Unlimited | 60 calls/min | Yes |
| **Twelve Data** | 800 calls/day | 8 calls/min | Yes |

**Implementation required**: If you want to use an alternative provider, you'll need to:
1. Modify `src/services/yahooFinanceService.ts`
2. Update API routes in `/api/prices/`
3. Handle provider-specific rate limits and error codes

See [Price Data Provider Alternatives](./SETUP.md#price-data-provider-alternatives) for implementation guidance.

---

## 🏗 Infrastructure Alternatives

While the default setup uses **Firebase + Vercel**, the application can be adapted to:

### Database Alternatives
- **MongoDB Atlas**: NoSQL document database (similar migration)
- **Supabase**: PostgreSQL with real-time features (requires SQL migration)
- **PlanetScale**: Serverless MySQL (requires SQL migration)

### Hosting Alternatives
- **Netlify**: Similar to Vercel, easy migration
- **Railway**: Docker-based deployment
- **Self-hosted**: VPS with Docker

### Cron Job Alternatives

If you experience issues with **Vercel Cron Jobs** (common on Hobby plan with unpredictable delays of 15-60+ minutes), you can replace them with **GitHub Actions** for more reliable scheduling.

**Why GitHub Actions?**
- ✅ **Free** for public repositories (2,000 minutes/month for private repos)
- ✅ **Reliable timing**: Executes within 1-2 minutes of scheduled time
- ✅ **Better logging**: Clear execution history and error messages
- ✅ **No plan limitations**: Works the same on free and paid GitHub accounts

**How to migrate:**

1. **Create workflow file** in your repository:
   ```bash
   mkdir -p .github/workflows
   touch .github/workflows/cron-jobs.yml
   ```

2. **Add workflow configuration** (`.github/workflows/cron-jobs.yml`):
   ```yaml
   name: Scheduled Cron Jobs

   on:
     schedule:
       # Monthly snapshot: Every day at 20:00 UTC
       - cron: '0 20 * * *'
     workflow_dispatch:  # Allow manual triggering

   jobs:
     monthly-snapshot:
       runs-on: ubuntu-latest
       steps:
         - name: Call Monthly Snapshot API
           run: |
             curl -X GET "${{ secrets.APP_URL }}/api/cron/monthly-snapshot" \
               -H "Authorization: Bearer ${{ secrets.CRON_SECRET }}" \
               -w "\nHTTP Status: %{http_code}\n"

     daily-dividend-processing:
       runs-on: ubuntu-latest
       steps:
         - name: Call Dividend Processing API
           run: |
             curl -X GET "${{ secrets.APP_URL }}/api/cron/daily-dividend-processing" \
               -H "Authorization: Bearer ${{ secrets.CRON_SECRET }}" \
               -w "\nHTTP Status: %{http_code}\n"
   ```

3. **Set GitHub Secrets**:
   - Go to your repo → Settings → Secrets and variables → Actions
   - Add secrets:
     - `APP_URL`: Your Vercel app URL (e.g., `https://your-app.vercel.app`)
     - `CRON_SECRET`: Same value as in your Vercel environment variables

4. **Remove Vercel cron configuration** (optional):
   - Delete or comment out the `crons` array in `vercel.json`
   - This prevents duplicate executions

5. **Test manually**:
   - Go to repo → Actions → "Scheduled Cron Jobs" workflow
   - Click "Run workflow" to test immediately
   - Check logs to verify successful execution

**Schedule syntax examples:**
```yaml
# Every day at 6:00 UTC (7:00 CET / 8:00 CEST)
- cron: '0 6 * * *'

# Every day at 22:00 UTC (23:00 CET / 00:00 CEST)
- cron: '0 22 * * *'

# First day of every month at midnight
- cron: '0 0 1 * *'

# Multiple schedules for different jobs
- cron: '0 6 * * *'   # Snapshot at 6:00 UTC
- cron: '0 12 * * *'  # Dividends at 12:00 UTC
```

**Notes:**
- GitHub Actions uses UTC timezone (same as Vercel)
- Minimum interval: 5 minutes (GitHub limitation)
- Actual execution may have 1-2 minute delay (much better than Vercel Hobby plan)
- Logs are kept for 90 days
- You can keep both Vercel and GitHub Actions active (they won't conflict due to snapshot ID deduplication)

See [Infrastructure Alternatives](./SETUP.md#infrastructure-alternatives) for migration guides.

---

## 📖 Usage Examples

### Adding Your First Asset

1. Navigate to **"Patrimonio"** (Assets)
2. Click **"Add Asset"**
3. Fill in the form:
   - **Ticker**: `VWCE.DE` (Vanguard All-World ETF on XETRA)
   - **Name**: Vanguard FTSE All-World
   - **Type**: ETF
   - **Asset Class**: Equity
   - **Quantity**: 15
4. Click **"Crea"** - the system automatically fetches the current price
5. Your asset appears in the table with total value calculated

### Setting Up Recurring Expenses

1. Go to **Settings** → Create category "Mortgage" (type: Debts)
2. Navigate to **"Tracciamento Spese"** (Expense Tracking)
3. Click **"Nuova Spesa"**
4. Fill form:
   - Type: Debts
   - Category: Mortgage
   - Amount: €800
   - Date: 2025-01-10
   - Enable **"Crea voce per ogni mese"** (recurring)
   - Day: 10
   - Months: 12
5. System creates 12 monthly entries automatically

### Tracking Installment Payments (Buy Now Pay Later)

The **Installment Payments** feature allows you to track purchases split into multiple monthly payments, common with Buy Now Pay Later (BNPL) services or financing options.

**When to use:**
- Amazon Pay in Installments (5 monthly payments)
- Scalapay, Klarna, or other BNPL services
- Store financing (e.g., 12-month furniture payment plan)
- Auto loans with fixed monthly payments
- Any purchase split into multiple scheduled payments

**How to create installment expenses:**

**Option 1: Auto-Calculate Equal Installments**
1. Navigate to **"Tracciamento Spese"** (Expense Tracking)
2. Click **"Nuova Spesa"**
3. Enter the base expense details:
   - Amount: €500 (this will auto-populate "Importo Totale")
   - Category: Shopping
   - Date: 2025-12-05
4. Enable **"Acquisto rateale"** toggle
5. The system automatically:
   - Switches to "Calcolo Automatico" tab
   - Pre-fills "Importo Totale" with €500
6. Configure installments:
   - Numero di Rate: 5
   - Prima Rata il: 05/12/2025
7. Review the smart preview:
   - If equal: "5 rate da 100,00 €"
   - If different: "4 rate da 66,68 € + 1 rata da 66,69 €"
8. Click **"Crea Spesa"**
9. System creates 5 monthly expenses:
   - Expense 1: €100 on 05/12/2025 (Rata 1/5)
   - Expense 2: €100 on 05/01/2026 (Rata 2/5)
   - Expense 3: €100 on 05/02/2026 (Rata 3/5)
   - Expense 4: €100 on 05/03/2026 (Rata 4/5)
   - Expense 5: €100 on 05/04/2026 (Rata 5/5)

**Option 2: Custom Amounts per Installment**
1. Follow steps 1-5 from Option 1
2. Switch to **"Importi Personalizzati"** tab
3. Configure:
   - Numero di Rate: 3
   - Prima Rata il: 05/12/2025
4. Click **"Genera Campi Rate"**
5. Enter custom amounts:
   - Rata 1 (Dic 2025): €150
   - Rata 2 (Gen 2026): €200
   - Rata 3 (Feb 2026): €150
6. View real-time total: €500
7. Click **"Crea Spesa"**

**Viewing installments in the table:**
- Each expense displays a **"Rata X/Y" badge** (e.g., "Rata 1/5")
- Expenses are grouped by `installmentParentId` in the database
- Notes automatically include installment information

**Deleting installments:**
1. Click delete icon on any installment expense
2. System shows prompt: "Questa è la rata 3/5. Vuoi eliminare solo questa rata o tutte le 5 rate?"
3. Choose:
   - **Solo questa rata**: Deletes individual payment
   - **Tutte le rate**: Bulk deletes entire installment series

**Important notes:**
- Installment feature is **mutually exclusive** with recurring expenses
- Available for all expense types (Fixed, Variable, Debt, Income)
- Maximum 60 installments (5 years)
- Minimum 2 installments
- Monthly frequency only (daily/weekly not supported)
- First installment date must be today or in the future

**Example use cases:**
- Amazon BNPL: €333.41 purchase → 5 equal installments
- Furniture financing: €3,000 → 12 monthly payments
- Jewelry store layaway: Custom amounts per month
- Auto loan: 60 installments over 5 years

### Managing Categories with Associated Expenses

When you need to delete or reorganize expense categories that have expenses associated with them:

**Scenario: Merging two similar categories**
1. Go to **Settings** → **Categorie Spese**
2. Try to delete "Groceries" category (which has 45 expenses)
3. System shows **reassignment dialog** with expense count
4. Use the **search box** to find "Food & Dining" category
5. Select "Food & Dining" from the dropdown
6. Click **"Conferma ed Elimina"**
7. System automatically:
   - Reassigns all 45 expenses to "Food & Dining"
   - Updates expense records with new category name
   - Deletes the old "Groceries" category
   - Shows success message with reassignment count

**Scenario: Creating a new category during deletion**
1. Try to delete category with expenses
2. In the search box, type "Entertainment"
3. No results found → System shows **"Crea categoria 'Entertainment'"**
4. Click to create → Category dialog opens with name pre-filled
5. Set color and type, save
6. New category auto-selected in reassignment dialog
7. Confirm deletion to complete reassignment

**Scenario: Deleting without reassignment**
1. Try to delete category "Miscellaneous" (20 expenses)
2. Click **"Elimina senza riassegnare"** (amber button)
3. System:
   - Marks all 20 expenses as "Senza categoria" (Uncategorized)
   - Deletes the category
   - Expenses remain in database for historical tracking
   - Shows message: "20 spese contrassegnate come 'Senza categoria'"

**Renaming categories**
- Edit category name in Settings
- System automatically updates all associated expense records
- No manual reassignment needed

### Exploring Expenses with Interactive Drill-Down Charts

The **Interactive Drill-Down** feature on the Expense Charts page allows you to explore your spending from high-level categories down to individual transactions with just a few clicks.

**How to use the drill-down:**

1. Navigate to **Dashboard** → **Expense Charts** (Cashflow)
2. View the **"Spese per Categoria"** or **"Entrate per Categoria"** pie chart
3. **Level 1 - Categories**: See your top-level spending/income categories
   - Example: Google (€5,000), Shopping (€3,000), Food (€2,500)
4. **Click on any pie slice** or legend item to drill down
5. **Level 2 - Subcategories**: View breakdown within that category
   - Example: Clicking "Google" shows:
     - Google Workspace (€2,000)
     - Google Cloud (€1,500)
     - Google Ads (€1,000)
     - Altro (€500) - expenses without subcategory
6. **Click on any subcategory slice** to see individual transactions
7. **Level 3 - Transaction List**: Detailed table showing:
   - Date of each expense/income
   - Amount (color-coded: red for expenses, green for income)
   - Notes/descriptions
   - External links (if available)
8. **Navigate back**: Use the "← Indietro" button to return to previous levels

**Visual cues:**
- **Cursor changes to pointer** on clickable slices
- **Title updates** to show your current location (e.g., "Spese - Google - Workspace")
- **Colors**: Subcategories use lighter/darker variations of the parent category color
- **"Altro" slice**: Automatically created for transactions without subcategories

**Example workflow:**
- "Where did my Google expenses come from this year?"
  - Click Google category → See Workspace dominates
  - Click Workspace → Review 12 monthly subscription charges
- "What made up my 'Shopping' category?"
  - Click Shopping → See Amazon vs IKEA vs Other retailers
  - Click Amazon → View individual orders with links

**Benefits:**
- Quickly identify spending patterns without filters
- Drill down to specific transactions in 2 clicks
- Understand subcategory distribution within categories
- Access transaction details (notes, links) directly from charts

### Understanding Income-to-Expense Ratio

The **Income-to-Expense Ratio** metric provides instant insight into your financial health by comparing total income against total expenses for the selected period.

**Interpreting the ratio:**

1. Navigate to **"Tracciamento Spese"** (Expense Tracking)
2. Select a year (e.g., 2025)
3. View the **"Rapporto Entrate/Spese"** card (fourth metric)

**What the colors mean:**

🟢 **Green (≥1.2)** - "Salute finanziaria ottima"
- Example: Ratio 1.49 (Income: €53,051, Expenses: €35,581)
- You're earning significantly more than you spend
- Strong savings potential and financial cushion
- Ideal for building wealth and reaching FIRE goals

🟡 **Yellow (0.8-1.2)** - "In equilibrio"
- Example: Ratio 1.05 (Income: €3,150, Expenses: €3,000)
- Income slightly exceeds expenses
- Balanced budget with modest savings
- Consider optimizing expenses or increasing income

🔴 **Red (<0.8)** - "Attenzione alle spese"
- Example: Ratio 0.65 (Income: €2,600, Expenses: €4,000)
- Spending more than you earn
- Unsustainable long-term without drawing from savings
- Review budget and identify areas to reduce expenses

⚪ **Gray (N/A)** - "Nessuna spesa registrata"
- No expense data available for the selected period
- Start tracking expenses to see your ratio

**Year-over-year comparison:**
- Change year filter to compare financial health across different periods
- Track improvement over time as you optimize spending
- Set personal goals (e.g., maintain ratio ≥1.3 for aggressive savings)

**Example scenarios:**

*Aggressive saver for FIRE:*
- Income: €4,000/month
- Expenses: €2,200/month
- Ratio: 1.82 (green) → Saving ~45% of income

*Living paycheck to paycheck:*
- Income: €2,800/month
- Expenses: €2,750/month
- Ratio: 1.02 (yellow) → Saving only 2%, vulnerable to emergencies

*Overspending situation:*
- Income: €3,500/month
- Expenses: €4,200/month
- Ratio: 0.83 (yellow, close to red) → Burning savings, needs budget review

### Managing Specific Asset Allocation Targets

The **Specific Asset Allocation Tracking** feature allows you to define granular target allocations for individual stocks, ETFs, or other assets within your subcategories.

**When to use this:**
- You want precise control over which tickers to hold within a subcategory
- Track allocation to specific stocks like "AAPL, MSFT, GOOGL, AMZN" within your "Single Stock" allocation
- Monitor target percentages for individual ETFs in your "All-World" or "Momentum" strategies

**How to set up specific asset tracking:**

1. Navigate to **Settings** → **Sotto-Categorie** section
2. Find the subcategory you want to track (e.g., "Single Stock" under Equity)
3. Enable the **"Abilita tracciamento asset specifici"** toggle
4. Click **"Mostra specific assets"** to expand the configuration
5. Click **"+ Aggiungi Specific Asset"**
6. Enter:
   - **Ticker/Nome**: AAPL (or asset name)
   - **Target %**: 25 (percentage relative to the subcategory)
7. Add more specific assets until the total equals 100%
8. The system validates that percentages sum to exactly 100%
9. Click **"Salva Impostazioni"**

**Example configuration:**

If your allocation is:
- **Equity**: 60% of total portfolio (€60,000)
- **Single Stock**: 6% of Equity (€3,600)

Set specific assets within "Single Stock":
- AAPL: 25% → Target: €900 (1.5% of total Equity)
- MSFT: 25% → Target: €900 (1.5% of total Equity)
- GOOGL: 25% → Target: €900 (1.5% of total Equity)
- AMZN: 25% → Target: €900 (1.5% of total Equity)

**Viewing specific asset allocation in Allocation page:**

1. Navigate to **Allocazione Asset** page
2. Scroll to the subcategory section (e.g., "Sotto-Categoria Azioni")
3. Look for subcategories with the **ℹ️ info icon**
4. **Click on the row** to drill down
5. View the detailed breakdown:
   - **Asset Name**: Specific ticker or asset name (e.g., "AAPL", "Enel")
   - **Target %**: Target percentage (relative to subcategory)
   - **Target €**: Target value in euros
   - **Current %/€**: Automatically calculated by matching real portfolio assets
   - **Difference**: Shows how much to buy or sell to reach target
   - **Action**: COMPRA, VENDI, or OK (threshold: ±100€)
6. Use the **← back button** to return to the main view

**Important notes:**
- Specific assets are **automatically linked** to your real portfolio assets based on ticker/name matching
- The system performs case-insensitive partial matching on both ticker and asset name
- Current values are calculated by summing all matching assets in your portfolio
- Example: A specific asset "Enel" will automatically match any portfolio asset with "enel" in its ticker or name
- Use the "Action" column to see buy/sell recommendations to reach your targets

**Benefits:**
- More granular portfolio rebalancing guidance
- Better visibility into desired individual asset allocation
- Flexibility to enable tracking only for subcategories where you need detail
- Maintains consistency with existing allocation tracking UX

### Analyzing Portfolio Performance

The **Performance Metrics** page provides comprehensive analysis of your investment returns using industry-standard financial metrics.

**Getting started:**

1. Navigate to **"Performance"** page from the sidebar
2. Ensure you have:
   - At least **2 monthly snapshots** for basic metrics
   - **Expense tracking data** for accurate cash flow calculations (contributions/withdrawals)
   - Snapshots spanning your desired analysis period

**Understanding the time periods:**

**Year-to-Date (YTD):**
- Shows performance from January 1st to today
- Example: On June 15, 2025 → Analyzes Jan 1 - Jun 15, 2025
- Best for: Tracking current year progress

**1 Year / 3 Years / 5 Years:**
- Rolling windows from today backwards
- Example: If today is Dec 15, 2025 → 1Y analyzes Dec 15, 2024 - Dec 15, 2025
- Best for: Standard investment performance reporting

**All Time:**
- Analyzes from your first snapshot to latest snapshot
- Example: First snapshot Feb 2023 → Analyzes entire 2+ year history
- Best for: Overall portfolio lifetime performance

**Rolling 12M / 36M:**
- Shows how CAGR evolves over time with moving windows
- Chart displays multiple data points instead of single metric
- Best for: Identifying performance trends and consistency

**Custom Date Range:**
- Click "CUSTOM" tab → Select specific start and end dates
- Example: Analyze just Q4 2024 (Oct 1 - Dec 31)
- Best for: Comparing specific market events or testing strategies

**Reading the metrics:**

**ROI (Return on Investment):**
- Formula: `(End NW - Start NW - Net Cash Flow) / Start NW × 100`
- Example: Started with €50k, ended with €60k, contributed €5k → ROI = 10%
- Meaning: Your investments grew 10% excluding contributions
- Limitation: Doesn't account for time or when money was added

**CAGR (Compound Annual Growth Rate):**
- Formula: `((End NW / (Start NW + Net Cash Flow))^(12/months) - 1) × 100`
- Example: 15% CAGR over 3 years
- Meaning: Portfolio grew at 15% per year on average
- Best for: Comparing performance across different time periods

**Time-Weighted Return (TWR)** ⭐ PRIMARY METRIC:
- Formula: Geometric linking of monthly returns: `[(1+R₁) × (1+R₂) × ... × (1+Rₙ)]^(12/months) - 1`
- Example: 12.5% TWR annualized
- Meaning: Isolates investment performance from contribution timing
- **Why it matters**: If you invested €10k in January and €50k in December, TWR shows your actual investment skill independent of when you had more money invested
- Industry standard: Professional fund managers are evaluated using TWR

**Money-Weighted Return (IRR):**
- Formula: Solves NPV equation using Newton-Raphson: `NPV = -Start + Σ(CF/(1+r)^t) + End/(1+r)^T = 0`
- Example: 10.2% IRR annualized
- Meaning: Your actual investor return considering when you added/withdrew money
- **When it differs from TWR**:
  - If you invested more money right before a market crash → IRR will be lower than TWR
  - If you invested more during a market bottom → IRR will be higher than TWR
- Best for: Self-assessment of your personal timing decisions

**Sharpe Ratio:**
- Formula: `(Portfolio Return - Risk-Free Rate) / Volatility`
- Example: Sharpe = 1.45
- Interpretation:
  - **> 1.0**: Good risk-adjusted returns
  - **> 2.0**: Excellent risk-adjusted returns
  - **< 0**: Portfolio underperforms risk-free rate (bonds/savings accounts)
- Meaning: For every 1% of volatility (risk), you earned 1.45% excess return above the risk-free rate
- Risk-free rate: Retrieved from your asset allocation settings (default: current government bond rate)

**Volatility:**
- Formula: `σ_monthly × √12` (annualized standard deviation with ±50% outlier filtering)
- Example: 15.2% volatility
- Meaning: Your portfolio typically fluctuates ±15.2% per year
- Context:
  - **< 5%**: Very stable (mostly bonds/cash)
  - **5-15%**: Moderate (balanced portfolio)
  - **15-25%**: Aggressive (heavy equity)
  - **> 25%**: Very volatile (crypto, individual stocks)

**Example scenario:**

You started investing in January 2023 with €10,000. It's now December 2025.

**Your data:**
- Snapshots: 24 months (Jan 2023 - Dec 2025)
- Current net worth: €45,000
- Total contributions: €30,000 (€1,250/month average)
- Net worth growth: €35,000 (€45k - €10k initial)
- Investment gain: €5,000 (€35k growth - €30k contributions)

**Performance page shows (All Time period):**
- **ROI**: +16.7% (€5k gain on €30k invested)
- **CAGR**: +7.8% annualized
- **TWR**: +8.2% annualized (you picked good investments!)
- **IRR**: +7.4% annualized (your timing was average, slightly hurt by contributing heavily in 2024 when market was high)
- **Sharpe Ratio**: 1.3 (good risk-adjusted returns)
- **Volatility**: 12.1% (typical balanced portfolio)
- **Net Cash Flows**: +€30,000
- **Duration**: 24 months (2.0 years)

**Net Worth Evolution Chart:**
- Blue area: Investment returns (€5k)
- Green area: Contributions (€30k)
- Total height: Current net worth (€45k)

**What this tells you:**
- Your investment selection is solid (TWR 8.2% beats typical 7% market average)
- Your contribution timing slightly hurt you (IRR 7.4% < TWR 8.2%)
- Your risk-adjusted returns are good (Sharpe 1.3)
- Volatility is moderate and acceptable (12.1%)
- You're on track to reach financial goals

**Using different time periods:**

Click **"1Y"** tab to see just the last 12 months:
- Maybe 2025 was a great year (CAGR 15%) vs lifetime average (7.8%)
- Helps identify if recent changes to your strategy are working

Click **"ROLLING_12M"** to see performance consistency:
- Chart shows your 12-month CAGR calculated month-by-month
- Spot trends: Is your performance improving? Are there volatility spikes?
- Identify best/worst rolling 12-month periods

**When metrics show "N/A":**
- **Insufficient data**: Period has <2 snapshots
- **Missing cash flows**: No expense/income data (affects IRR accuracy)
- **Zero values**: Start or end net worth is €0
- **Calculation errors**: Extreme outliers or data quality issues

### Tracking FIRE Progress

1. Navigate to **"FIRE"** page
2. Set **Safe Withdrawal Rate**: 4.0%
3. (Optional) Set **Planned Annual Expenses**: €25,000
4. View metrics:
   - FIRE Number (target net worth)
   - Progress to FI (%)
   - Monthly Allowance (sustainable withdrawal)
   - Years of Expenses remaining
5. Compare current vs planned scenarios
6. Track progress month-over-month with historical chart

### Tracking Cost Basis and Taxes

1. Navigate to **"Patrimonio"** (Assets)
2. Click on an existing asset or create a new one
3. Enable **"Tracciamento Cost Basis"** toggle
4. Enter:
   - **Costo Medio per Azione**: €85.50 (your average purchase price)
   - **Aliquota Fiscale**: 26 (tax rate percentage)
5. Save the asset
6. View on Dashboard:
   - **Patrimonio Totale Lordo/Netto**: Gross and net total worth
   - **Patrimonio Liquido Lordo/Netto**: Gross and net liquid worth
   - **Plusvalenze Non Realizzate**: Unrealized gains (green) or losses (red)
   - **Tasse Stimate**: Estimated taxes on gains

### Simulating Asset Sales with Tax Calculator

Before selling an asset, you can simulate the tax impact to understand your net proceeds.

**Prerequisites:**
- Asset must have **cost basis tracking enabled** (average cost and tax rate configured)

**How to use:**

1. Navigate to **"Patrimonio"** (Assets) page
2. Find the asset you want to simulate selling
3. Click the **blue calculator icon** (🧮) in the Actions column
4. The Tax Calculator modal opens with asset details

**Selling by Quantity:**
1. Select **"Per Quantità"** mode (default)
2. Enter how many shares/units to sell (e.g., 10)
3. View instant calculations:
   - Total sale value (gross)
   - Capital gain or loss (+€200 or -€150)
   - Taxes owed (€52 on gains, €0 on losses)
   - Net proceeds after taxes

**Selling by Target Value:**
1. Select **"Per Valore Target"** mode
2. Enter desired gross sale amount (e.g., €10,000)
3. System calculates:
   - Required quantity to sell (e.g., 0.1923 BTC)
   - Resulting gains/losses
   - Taxes to pay
   - **Net proceeds** (what you'll actually receive)
4. Use the helpful message to understand: "To get €10k net, you need to sell €11.2k gross"

**Example Scenarios:**

*Profitable ETF sale:*
- Asset: VWCE.DE ETF
- Current price: €105.50, Average cost: €85.50
- Selling: 10 shares
- Result: +€200 gain (+23.4%), €52 taxes (26%), €1,003 net proceeds

*Cryptocurrency with target proceeds:*
- Asset: BTC
- Current: €52,000, Cost: €30,000
- Target: Need €10,000 cash
- Calculator shows: Must sell 0.1923 BTC (€10,000 gross), pays €1,100 taxes, nets €8,900
- **Insight**: You actually need to sell €11,235 worth to get €10k after taxes

*Loss scenario (tax loss harvesting):*
- Asset: TSLA stock
- Current: €180, Cost: €220
- Selling: 20 shares
- Result: -€800 loss (-18.2%), €0 taxes, €3,600 net proceeds
- **Note**: The modal explains that losses can offset future gains

**Benefits:**
- Make informed selling decisions before execution
- Understand true after-tax proceeds
- Plan for tax-efficient rebalancing
- Avoid surprises at tax time
- Calculate optimal sale amounts to reach net cash goals

### Viewing Gain/Loss in Assets Table

Once you've set up cost basis tracking for your assets, the **G/P (Gain/Loss) column** provides immediate visibility into each investment's performance.

#### Understanding the G/P Column

1. Navigate to **"Patrimonio"** (Assets) page
2. The G/P column appears after **"Valore Totale"** (Total Value)
3. For each asset with cost basis set:
   - **First line**: Absolute gain/loss (e.g., +€1,250.00 or -€340.00)
   - **Second line**: Percentage gain/loss (e.g., +12.5% or -4.2%)
   - **Green text**: Positive returns
   - **Red text**: Losses
4. Assets without cost basis show **"-"** in gray

#### Table Footer Totals

At the bottom of the assets table:
- **Total portfolio value**: Sum of all asset values
- **Total G/P**: Aggregate gain/loss across all assets with cost basis
  - Calculated as: Sum of all individual gains/losses
  - Percentage: (Total G/P / Total Cost Basis) × 100

#### Special Case: Real Estate with Debt

For real estate properties with outstanding mortgages, the G/P calculation follows this logic:

**Example:**
- House purchased at: €200,000 (cost basis)
- Current market value: €250,000
- Outstanding mortgage: €150,000

**What you see in the table:**
- **Valore Totale (Total Value)**: €100,000 (net value: €250k - €150k debt)
- **G/P**: +€50,000 (+25%)

**Why this calculation?**
The G/P reflects the **property's appreciation**, not your equity gain. The calculation is:
- Gain/Loss = Current Gross Value - Purchase Cost
- Gain/Loss = €250,000 - €200,000 = +€50,000
- Percentage = €50,000 / €200,000 = +25%

This approach accurately represents the investment performance of the property itself, independent of how it was financed. Your net worth correctly shows €100,000 (after debt), while the G/P shows the true appreciation of the asset (+€50,000).

### Tracking TER and Portfolio Costs

The **TER (Total Expense Ratio)** feature helps you monitor and optimize the management costs of your portfolio, particularly important for ETFs and mutual funds.

#### Setting Up TER for Assets

1. Navigate to **"Patrimonio"** (Assets) page
2. Click on an existing asset or create a new one
3. Enable **"TER (Total Expense Ratio)"** toggle
4. Enter the TER percentage (e.g., 0.20 for 0.20%)
   - Find TER in the fund's factsheet or prospectus
   - Common examples: Vanguard FTSE All-World ~0.22%, iShares Core S&P 500 ~0.07%
5. Save the asset

#### Understanding Portfolio TER Metrics

Once you've added TER data for your assets, two new cards appear in the **Dashboard Overview**:

**Portfolio TER Card (Purple)**
- Shows the weighted average TER across all your investments
- Formula: `(TER₁ × Value₁ + TER₂ × Value₂ + ...) / Total Portfolio Value`
- Only includes assets with TER defined (stocks without TER are excluded)
- Example: If you have €50k in an ETF with 0.20% TER and €30k in another with 0.50% TER, your Portfolio TER = 0.31%

**Annual Portfolio Cost Card (Orange)**
- Displays the real cost in euros you'll pay annually
- Formula: `Portfolio Value × (Portfolio TER / 100)`
- Example: €80k portfolio with 0.31% TER = €248/year in management fees

#### Viewing TER in Assets Table

The **Assets table** includes dedicated columns for cost analysis:
- **PMC (Prezzo Medio di Carico)**: Your average purchase cost per unit
- **TER**: The expense ratio for each asset (displayed in purple)
- Assets without TER show "-" in gray

#### Use Cases

**Compare Investment Options**
- ETF A: €50k, TER 0.20% → €100/year
- ETF B: €50k, TER 0.75% → €375/year
- **Savings by choosing A: €275/year**

**Optimize Existing Portfolio**
- Identify high-cost funds dragging down returns
- Calculate the impact of switching to lower-cost alternatives
- Track how costs evolve as your portfolio grows

**Real Numbers Matter**
- A 0.50% difference might sound small
- On a €100k portfolio: **€500/year difference**
- Over 30 years at 7% growth: **€47,000+ in lost returns**

### Exporting Portfolio Report to PDF

Generate a comprehensive PDF report of your portfolio for offline review, sharing with advisors, or archiving.

**How to export:**

1. Navigate to any dashboard page
2. Click the **"Esporta PDF"** button in the top navigation bar
3. The **PDF Export Dialog** opens with section toggles
4. **Choose sections to include**:
   - ✅ Portfolio Assets (asset list with totals)
   - ✅ Asset Allocation (current vs target with rebalancing actions)
   - ✅ Historical Performance (net worth evolution charts)
   - ✅ Cashflow Analysis (income/expenses breakdown)
   - ✅ FIRE Calculator (Financial Independence progress)
   - ✅ Summary (key metrics overview)
5. Click **"Genera PDF"** button
6. Wait for generation (typically 5-10 seconds)
7. PDF automatically downloads with filename: `portfolio-report-YYYYMMDD-HHMMSS.pdf`

**What's included in each section:**

**Portfolio Assets:**
- Complete list of all assets with ticker, name, type, quantity, current price
- Total value, weight percentage, G/P (Gain/Loss), TER
- Footer totals: Total portfolio value, Liquid/Illiquid breakdown, Total G/P

**Asset Allocation:**
- Table: Asset class, current value, current %, target %, difference (€ and %)
- Rebalancing actions (±2% threshold): Buy/Sell recommendations with amounts
- Includes all asset classes, even those with 0€ current value but configured target

**Historical Performance:**
- Net worth evolution table (embedded chart image)
- Year-over-year comparison if >1 year of data
- Oldest and latest snapshot values with total growth %

**Cashflow Analysis:**
- Total Income, Total Expenses, Net Cashflow
- Income-to-Expense Ratio with health indicator (Green/Yellow/Red)
- **Savings Rate**: Calculated as (Net Cashflow / Total Income) × 100
- **Average Monthly Savings**: Net cashflow divided by number of tracked months
  - Example: "Risparmi 999,87 € al mese (media su 12 mesi)"
- Top 5 expense categories with amounts and percentages

**FIRE Calculator:**
- FIRE Number with **dynamic multiplier** based on Safe Withdrawal Rate
  - If SWR = 4% → "25x spese annuali"
  - If SWR = 3% → "33.33x spese annuali"
  - If SWR = 5% → "20x spese annuali"
- Progress to Financial Independence (%)
- Annual expenses and income
- Monthly/Daily allowance (sustainable withdrawal)
- Safe Withdrawal Rate (retrieved from user settings, defaults to 4%)
- **Trinity Study explanation** (shown only when SWR = 4%)
- Years of expenses covered by current net worth

**Summary:**
- Total and liquid net worth
- Asset count and top asset class
- Portfolio weighted TER
- Unrealized gains
- Allocation score (0-100)
- FIRE progress percentage
- Income-to-expense ratio
- Report generation timestamp

**Example use cases:**
- **Tax filing**: Share portfolio snapshot with accountant
- **Financial advisor meetings**: Present comprehensive portfolio overview
- **Personal archiving**: Keep yearly records of financial progress
- **FIRE tracking**: Document journey to Financial Independence
- **Performance reviews**: Compare year-over-year portfolio evolution

---

## 🤝 Contributing

Contributions are welcome! This project is open source under the AGPL-3.0 license.

### How to Contribute

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Development Guidelines

- Follow TypeScript best practices
- Use existing component patterns (shadcn/ui)
- Test with multiple asset types and edge cases
- Ensure Firestore security rules are maintained
- Update documentation for new features

---

## 🐛 Troubleshooting

### Common Issues

**Ticker not found**
- Verify ticker format on [Yahoo Finance](https://finance.yahoo.com/)
- European tickers need exchange suffix (`.DE`, `.L`, `.MI`)

**Cron job not running**
- Check Vercel Functions logs
- Verify `CRON_SECRET` environment variable
- Test manually: `curl https://your-app.vercel.app/api/cron/monthly-snapshot?secret=YOUR_SECRET`

**Firebase Admin SDK errors on Vercel**
- See detailed troubleshooting in [VERCEL_SETUP.md](./VERCEL_SETUP.md)
- Use `FIREBASE_SERVICE_ACCOUNT_KEY` with full JSON content

For more troubleshooting help, see the [SETUP.md Troubleshooting section](./SETUP.md#troubleshooting).

---

## 📄 License

This project is licensed under the **GNU Affero General Public License v3.0 (AGPL-3.0)**.

### What does this mean?

- ✅ You can use, modify, and distribute this software freely
- ✅ You must disclose your source code when distributing
- ✅ If you run a modified version as a web service, you must share the source code with users
- ✅ All derivative works must use the same AGPL-3.0 license

**Why AGPL-3.0?**
This license ensures the project remains open source even when deployed as a web service, preventing someone from taking the code and offering it as a proprietary SaaS product.

See the [LICENSE](./LICENSE) file for the full license text.

---

## 🙏 Acknowledgments

- Built to replace 5+ years of Google Sheets-based portfolio tracking
- Inspired by the FIRE (Financial Independence, Retire Early) community
- Designed for Italian investors using European exchanges
- Expense tracking methodology inspired by YNAB and Mint
- FIRE calculations based on the **Trinity Study** (Safe Withdrawal Rate research)

---

## 📞 Support

- **Documentation**: See [SETUP.md](./SETUP.md) for detailed guides
- **Issues**: Report bugs or request features via [GitHub Issues](https://github.com/GiuseppeDM98/net-worth-tracker/issues)
- **Discussions**: Ask questions in [GitHub Discussions](https://github.com/GiuseppeDM98/net-worth-tracker/discussions)

---

## 🗺 Roadmap

### Current Features (Completed ✅)
- ✅ Multi-asset portfolio management
- ✅ Automatic price updates from Yahoo Finance
- ✅ Asset allocation tracking and rebalancing
- ✅ Historical snapshots and performance charts
- ✅ Expense and income tracking
- ✅ Period indicator for expense tracking (visual display of selected month/year)
- ✅ Smart category management with automatic expense reassignment
- ✅ Income-to-expense ratio metric with color-coded financial health indicators
- ✅ Interactive drill-down pie charts for category expense/income exploration
- ✅ FIRE calculator and progress tracker
- ✅ Hall of Fame personal financial rankings
- ✅ Registration control system
- ✅ Cost basis tracking with unrealized gains and tax estimation
- ✅ Gain/Loss (G/P) column in Assets table with total portfolio performance
- ✅ Monte Carlo retirement simulations
- ✅ TER (Total Expense Ratio) tracking with portfolio cost analysis
- ✅ Specific asset allocation tracking within subcategories with drill-down functionality
- ✅ UI/UX rationalization with streamlined navigation and grouped pages (sidebar reduced from 11 to 8 items)
- ✅ Advanced expense filtering system with hierarchical Type/Category/Subcategory filters and searchable comboboxes
- ✅ Capital Gains Tax Calculator for simulating asset sales with dual input modes and real-time tax impact calculation
- ✅ Installment payments (BNPL) tracking with dual input modes (auto-calculate or custom amounts), visual badges, and bulk operations
- ✅ Amount column sorting in Cashflow table with three-state toggle (desc/asc/none), visual indicators, and smart auto-reset
- ✅ Current Month Quick Filter button in Cashflow tracking for instant access to current month data with one-click filtering
- ✅ Dividend tracking with automatic Borsa Italiana scraping, manual entry, expense synchronization, and comprehensive analytics
- ✅ PDF export of comprehensive portfolio reports with customizable sections, dynamic FIRE calculations, and professional formatting
- ✅ Performance metrics with 8 key indicators (ROI, CAGR, TWR, IRR, Sharpe ratio, volatility) across 7 time periods, interactive charts, and automatic cash flow integration

### Future Enhancements (Planned 🔜)
- 🔜 Email notifications (monthly summary)
- 🔜 Multi-currency full conversion support
- 🔜 Internationalization (i18n) for multi-language support
- 🔜 Configurable dividend withholding tax rate: Currently hardcoded at 26% (Italian rate) for automatic dividend scraping. Future enhancement would add global tax rate configuration in user settings with per-dividend override capability. This would support:
  - Different withholding rates for foreign dividends without double taxation treaties
  - Distinction between "regime amministrato" (broker-managed) vs "regime dichiarativo" (self-reported) tax regimes
  - Country-specific tax rates for international portfolios
  - Note: Manual dividend entry already allows tax rate editing; this enhancement would extend configurability to automatic scraping
- 🔜 Monte Carlo: Expand asset allocation to include all asset classes (Equity, Bonds, Commodities, Cryptocurrencies, Real Estate, Cash) with configurable percentages
- 🔜 Monte Carlo: Calculate historical returns and volatility from user snapshots when sufficient data is available (minimum 24 monthly data points per asset class). Display warning message when data is insufficient for specific asset classes (e.g., "⚠️ Asset X: Limited historical data. Using market averages")
- 🔜 Dummy snapshot generator: Add Commodity asset class generation (currently set to 0%) to match all available asset classes

### Long-term Vision (Future 🚀)
- 🚀 CSV/Excel import for bulk asset additions
- 🚀 Risk analysis (volatility, max drawdown, correlation)
- 🚀 Backtesting allocation strategies
- 🚀 AI-powered rebalancing suggestions
- 🚀 Tax reporting (capital gains, dividends)
- 🚀 Automatic price tracking for individual bonds
- 🚀 Find a way to dockerize the application for easy self-hosting by anyone, explore database structure modifications (SQLite or other options?) to give users broad choice based on an .env.local variable, so the software will know whether to use Firebase or a local database - Idea to explore

---


## ⭐ Star History
If you find this project useful, please consider giving it a star on GitHub!

<a href="https://www.star-history.com/#GiuseppeDM98/net-worth-tracker&type=date&legend=top-left">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=GiuseppeDM98/net-worth-tracker&type=date&theme=dark&legend=top-left" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=GiuseppeDM98/net-worth-tracker&type=date&legend=top-left" />
   <img alt="Star History Chart" src="https://api.star-history.com/svg?repos=GiuseppeDM98/net-worth-tracker&type=date&legend=top-left" />
 </picture>
</a>

---

**Made with ❤️ for the FIRE community and DIY investors**
