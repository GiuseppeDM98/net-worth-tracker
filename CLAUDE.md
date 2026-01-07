# CLAUDE.md - Portfolio Tracker

## Project Overview

**Portfolio Tracker** is a comprehensive web application for tracking and managing investment portfolios across multiple asset classes, with integrated expense tracking, FIRE (Financial Independence, Retire Early) calculator, and personal financial rankings.

### Project Purpose
Replace spreadsheet-based portfolio management with a modern, automated solution specifically designed for Italian investors using European exchanges.

### Key Features

**Core Features:**
- **Portfolio Management**: Multi-asset class support (8 types), automatic price updates from Yahoo Finance, tracking TER, composite assets, cost basis tracking with tax estimation
- **Asset Price History**: 5 tabs for price/value visualization with YTD/From Start columns, color-coded cells (green/red), conditional display for cash assets, mobile-optimized
- **Expense & Income Tracking**: 4 entry types, hierarchical filtering (Type→Category→Subcategory), drill-down charts, income-to-expense ratio, React Query caching
- **Asset Allocation & Rebalancing**: 3-tier target allocation (Asset Class→Subcategory→Specific Assets), buy/sell recommendations, formula-based targets
- **FIRE Calculator**: Safe Withdrawal Rate configuration (4% Trinity Study), progress tracking, Monte Carlo simulations, historical evolution charts
- **Historical Analysis**: Automated monthly snapshots via cron jobs, net worth timeline, asset class evolution, YoY comparison, CSV export
- **Dividend Tracking**: Automatic scraping from Borsa Italiana, multi-currency support (EUR/USD/GBP/CHF) with auto-conversion, expense integration, TTM yield analytics
- **Performance Metrics**: 8 key metrics (ROI, CAGR, TWR, IRR, Sharpe, Volatility), 7 time periods (YTD, 1Y, 3Y, 5Y, All Time, Rolling 12M/36M, Custom), dividend income separation
- **Hall of Fame**: Top 20 months and Top 10 years by net worth growth, income, expenses with percentage growth columns, mobile card layout
- **PDF Export**: 6 customizable sections (Portfolio, Allocation, History, Cashflow, FIRE, Summary), 3 temporal modes (Total/Annual/Monthly), chart embedding

**Localization:**
- 🇮🇹 Fully Italian UI
- EUR currency format: €1.234,56
- Italian date format: DD/MM/YYYY
- Support for European exchanges (XETRA, Borsa Italiana, Euronext)

---

## Tech Stack

### Frameworks and Languages
| Category | Technology | Version |
|----------|-----------|---------|
| **Frontend Framework** | Next.js (App Router) | 16.0.1 |
| **Runtime** | React | 19.2.0 |
| **Language** | TypeScript | 5.x |
| **Styling** | Tailwind CSS | 4.x |
| **UI Components** | shadcn/ui | - |
| **Base Components** | Radix UI | - |

### Backend and Database
| Category | Technology | Version |
|----------|-----------|---------|
| **Backend** | Next.js API Routes (serverless) | 16.0.1 |
| **Database** | Firebase Firestore (NoSQL) | - |
| **Authentication** | Firebase Authentication | 12.5.0 |
| **Admin SDK** | Firebase Admin | 13.6.0 |

### Libraries and Utilities
| Category | Technology | Version | Purpose |
|----------|-----------|---------|---------|
| **Price Data** | yahoo-finance2 | 3.10.1 | Financial price API from Yahoo Finance |
| **Charts** | Recharts | 3.3.0 | Interactive charts and visualizations |
| **HTML Parsing** | cheerio | 1.0.0 | Lightweight HTML parsing for Borsa Italiana dividend scraping (serverless-compatible) |
| **State Management** | @tanstack/react-query | 5.x | Data fetching, caching, server state management |
| **Form Management** | react-hook-form | 7.66.0 | Form handling |
| **Validation** | zod | 4.1.12 | Schema validation |
| **Date Utilities** | date-fns | 4.1.0 | Date manipulation (Italian locale) |
| **Theming** | next-themes | 0.4.6 | Dark/light mode |
| **Icons** | lucide-react | 0.553.0 | Icon library |
| **Notifications** | sonner | 2.0.7 | Toast notifications |
| **Styling Utils** | clsx + tailwind-merge | - | Class name utilities |
| **CSS Variance** | class-variance-authority | 0.7.1 | Component variants |

### Deployment and Automation
| Category | Technology | Purpose |
|----------|-----------|---------|
| **Hosting** | Vercel | Automatic deployment, serverless functions |
| **Cron Jobs** | Vercel Cron | Automatic monthly snapshots, price updates |

---

## Project Structure

```
net-worth-tracker/
├── app/                      # Next.js App Router
│   ├── api/                  # API Routes (serverless functions)
│   │   ├── cron/             # Cron job endpoints (monthly snapshots)
│   │   ├── prices/           # Asset price update endpoints
│   │   ├── auth/             # Authentication endpoints
│   │   └── ...               # Other API endpoints
│   ├── dashboard/            # Dashboard pages (protected routes)
│   │   ├── patrimonio/       # Asset and portfolio management
│   │   ├── cashflow/         # Expense and income tracking
│   │   ├── fire/             # FIRE calculator and simulations
│   │   ├── allocazione/      # Asset allocation and rebalancing
│   │   ├── storico/          # Historical analysis and performance
│   │   ├── hall-of-fame/     # Personal record rankings
│   │   └── settings/         # Settings and configuration
│   ├── login/                # Login page
│   ├── register/             # Registration page
│   ├── layout.tsx            # Root layout (auth provider, themes)
│   ├── page.tsx              # Homepage/landing
│   └── globals.css           # Global styles (Tailwind)
│
├── components/               # Reusable React components
│   ├── ui/                   # shadcn/ui components (Button, Dialog, etc.)
│   ├── auth/                 # Authentication components
│   ├── dashboard/            # Dashboard-specific components
│   ├── charts/               # Chart components (Recharts wrappers)
│   └── ...                   # Other shared components
│
├── contexts/                 # React Contexts
│   └── AuthContext.tsx       # Firebase authentication context
│
├── lib/                      # Libraries and utilities
│   ├── firebase/             # Firebase configuration (client + admin)
│   ├── services/             # Business logic services
│   │   ├── yahooFinanceService.ts  # Yahoo Finance API
│   │   ├── assetService.ts         # Asset CRUD operations
│   │   └── ...                     # Other services
│   └── utils/                # Utility functions
│
├── types/                    # TypeScript type definitions
│   ├── asset.ts              # Asset and portfolio types
│   ├── expense.ts            # Expense and income types
│   └── ...                   # Other types
│
├── public/                   # Static assets (images, favicon)
│
├── firestore.rules           # Firestore Security Rules
├── firestore.indexes.json    # Firestore database indexes
├── vercel.json               # Vercel configuration (cron jobs)
├── next.config.ts            # Next.js configuration
├── tsconfig.json             # TypeScript configuration
├── package.json              # Dependencies and scripts
├── .env.local.example        # Environment variables template
├── README.md                 # Project documentation
├── SETUP.md                  # Setup and deployment guide
└── VERCEL_SETUP.md           # Vercel + Firebase troubleshooting
```

### Main Directories

**app/** - Next.js App Router with filesystem routing, Server Components, API Routes, nested layouts

**components/** - Reusable React components, ui/ (shadcn/ui design system), organized by feature/domain

**lib/** - Business logic and utilities: firebase/ (client + admin SDK), services/ (CRUD, APIs), utils/

**types/** - TypeScript definitions for domain entities, API responses, type guards

**contexts/** - React Context providers (AuthContext for global auth state)

---

## Architecture & Design Patterns

### Core Architectural Patterns

The application follows a **layered architecture** with clear separation of concerns.

**1. Context + Provider Pattern**
Global authentication state via React Context API. Custom hook `useAuth()` provides type-safe access. Single source of truth for auth state with automatic Firebase Auth synchronization. Location: `contexts/AuthContext.tsx`

**2. Protected Routes Pattern**
Wrapper component checks auth state and redirects to /login if unauthenticated. Dashboard routes automatically protected via layout nesting. Location: `components/ProtectedRoute.tsx`, `app/dashboard/layout.tsx`

**3. Service Layer Pattern**
Business logic encapsulated in service modules. Handles data fetching, transformation, validation, and Firestore query construction. Keeps components clean and testable. Location: `lib/services/*.ts`

**4. Dual Firebase SDK Pattern**
Separate client (`lib/firebase/config.ts`) and server (`lib/firebase/admin.ts`) SDKs. Client is user-scoped with Security Rules, server has admin privileges and bypasses rules (requires manual authorization checks).

**5. Serverless API Routes Pattern**
Next.js API routes provide serverless backend for server-side operations. Route types: Authentication (`/api/auth/*`), Cron jobs (`/api/cron/*`), Price data (`/api/prices/*`), Portfolio operations (`/api/portfolio/*`). Location: `app/api/**/*.ts`

**6. Environment-based Configuration**
Feature flags via environment variables. Runtime config without code changes, environment-specific behavior (dev/staging/prod), gradual rollout toggles. Location: `lib/constants/appConfig.ts`

**7. Repository Pattern**
Services act as repositories abstracting Firestore operations. Standard CRUD with transformation and error handling. Location: `lib/services/*.ts`

---

## Data Flow

### Client-Side (User Interactions)
User → React Component → Service Layer → Firebase Client SDK → Firestore Database

- User-scoped operations filtered by `userId`
- Real-time updates via Firestore listeners
- Optimistic UI with async sync
- Security Rules enforce user isolation

**Example**: Adding asset: User fills form → `assetService.createAsset()` → Firebase validates userId → Document created → UI updates

### Server-Side (API Routes & Cron Jobs)
External Trigger → Next.js API Route → Service/Helper Layer → Firebase Admin SDK → Firestore Database

- Admin privileges bypass security rules
- Batch operations for efficiency
- Scheduled automation via Vercel Cron
- External API integration (Yahoo Finance)

**Example**: Monthly snapshot: Vercel Cron → `/api/cron/monthly-snapshot` → For each user: fetch assets, calculate totals, create snapshot, update Hall of Fame

### Authentication Flow
User Login → AuthContext.signIn() → Server validation (`/api/auth/check-registration`) → Firebase Auth → User doc creation → onAuthStateChanged listener → ProtectedRoute guard → Dashboard access

### Price Update Flow
User clicks "Update Prices" → `/api/prices/update` → updateUserAssetPrices() → yahooFinanceService (batch fetch) → Yahoo Finance API → Update Firestore assets → Success response

### Security Layers
1. **Client**: Firebase Auth token validation
2. **Server**: API route authentication (CRON_SECRET for jobs)
3. **Database**: Firestore Security Rules (client) or manual checks (admin)

---

## Key Features & Components

### 1. Portfolio Management (Assets)

**Purpose:** Manage multi-asset class portfolio with automatic price updates and historical price visualization.

**Key Components:**
- **AssetDialog.tsx**: Form for creating/editing assets with support for 8 asset types, cost basis tracking, TER tracking, composite allocations
- **AssetManagementTab.tsx**: CRUD operations table with mobile card layout and desktop table view
- **AssetPriceHistoryTable.tsx**: Reusable historical price table with color-coded cells, YTD/From Start columns, "Venduto" badge for deleted assets

**Key Services:**
- **assetService.ts**: CRUD operations, value calculations, unrealized gains, sorting by asset class
- **yahooFinanceService.ts**: Real-time prices from Yahoo Finance API, 100+ exchanges support, batch fetching
- **assetPriceHistoryUtils.ts**: Transform snapshots into table format, color coding, month-over-month % calculations

**Page:** `app/dashboard/assets/page.tsx`

**Key Features:**
- Multi-asset class support (stocks, ETFs, bonds, crypto, real estate, commodities, cash, private equity)
- Automatic price updates from Yahoo Finance
- Three-tab interface: Gestione Asset, Anno Corrente (current year prices), Storico Totale (full history)
- Historical price visualization with color-coded month-over-month changes
- Portfolio weight percentage column
- TER tracking with weighted average
- Liquid vs illiquid classification

---

### 2. Expense & Income Tracking (Cashflow)

**Purpose:** Track income, expenses, and debts with advanced filtering and analytics.

**Key Components:**
- **ExpenseDialog.tsx**: Unified form for 4 expense types (Income, Fixed, Variable, Debts) with category selection, recurring expense generator
- **ExpenseTable.tsx**: Sortable table with Tanstack Table, inline edit/delete, color-coded by type, pagination
- **CategoryManagementDialog.tsx**: Category/subcategory management with color picker, smart deletion with reassignment workflow

**Key Services:**
- **expenseService.ts**: CRUD operations, filtering by month/date/type, statistics calculations, recurring expense generation
- **expenseCategoryService.ts**: Category CRUD, automatic expense updates on rename, protected deletion

**Page:** `app/dashboard/cashflow/page.tsx`

**Key Features:**
- Hierarchical filtering: Type → Category → Subcategory
- Interactive drill-down pie charts (3 levels)
- Income-to-expense ratio with color-coded health indicator
- Recurring expenses (generate 12 monthly entries)
- Year/month filtering with dynamic statistics
- React Query integration for caching

---

### 3. Asset Allocation & Rebalancing

**Purpose:** Define target allocation, track current vs target, get rebalancing recommendations.

**Key Components:**
- **Allocation page**: Three-tier hierarchy (Asset Class → Subcategory → Specific Assets), target % input, current allocation display, buy/sell recommendations (±€100 threshold), breadcrumb navigation, formula-based calculator

**Key Services:**
- **assetAllocationService.ts**: Settings management, allocation calculation with composite asset support, rebalancing calculations, default targets (60/40), specific asset matching

**Page:** `app/dashboard/allocation/page.tsx`

**Key Features:**
- Multi-level allocation tracking down to individual tickers
- Composite asset support (mixed-allocation pension funds)
- Formula-based targets (age + risk-free rate)
- Real-time validation (specific assets must sum to 100%)
- Interactive drill-down with difference calculation
- Automatic portfolio matching by ticker/name

---

### 4. FIRE Calculator & Monte Carlo Simulations

**Purpose:** Calculate Financial Independence goals and simulate retirement scenarios probabilistically.

**Key Components:**
- **FireCalculatorTab.tsx**: SWR configuration (default 4%), current/planned scenarios, progress bar, monthly/daily allowances, historical FIRE evolution chart
- **MonteCarloTab.tsx**: Simulation parameter inputs, portfolio amount selector, market/historical returns toggle, results display with success rate, fan chart (5 percentiles), distribution histogram, failure analysis

**Key Services:**
- **fireService.ts**: Annual expense/income calculations, FIRE metrics (25x rule), planned metrics, historical data (12-month rolling)
- **monteCarloService.ts**: Simulation engine (N iterations), Box-Muller random generation, historical returns, percentile calculations, asset class volatilities

**Pages:** `app/dashboard/fire/page.tsx`, `app/dashboard/monte-carlo/page.tsx`

**Key Features:**
- FIRE Number calculation (25x annual expenses, 4% SWR Trinity Study)
- Dual scenarios: Current vs Planned
- Monte Carlo simulations (1,000-10,000 iterations)
- Historical returns integration (≥24 months data)
- Success rate and failure analysis
- Fan chart with 5 percentile bands
- Configurable parameters (allocation, returns, volatility, inflation)

---

### 5. Historical Analysis & Snapshots

**Purpose:** Track net worth evolution with automated monthly snapshots.

**Key Components:**
- **CreateManualSnapshotModal.tsx**: Manual snapshot creation with portfolio state fetch, asset class/liquidity totals, preview, duplicate prevention
- **History page**: Net worth timeline (Recharts), asset class breakdown (stacked area), year-over-year comparison, growth rates, CSV export, date range filter

**Key Services:**
- **snapshotService.ts**: Snapshot creation/retrieval, duplicate check, asset class/liquidity calculations, CSV export

**Page:** `app/dashboard/history/page.tsx`

**Key Features:**
- Automated monthly snapshots via Vercel Cron (last day of month)
- Asset class evolution visualization
- Month-over-month and year-over-year tracking
- Duplicate prevention (one per user per month)
- CSV export for external analysis
- Composite asset handling (mixed allocations)
- Test data generator (up to 120 months)

---

### 6. Dividend Tracking & Automation

**Purpose:** Track dividend income with automatic scraping from Borsa Italiana and expense synchronization.

**Key Components:**
- **DividendDialog.tsx**: Manual entry form with 4 dividend types, multi-currency (EUR/USD/GBP/CHF), automatic tax calculation (26%), gross/net/tax breakdown
- **DividendTable.tsx**: Sortable table with currency conversion display, expense link indicator, CSV export
- **BorsaItalianaScraperModal.tsx**: Bulk ISIN import with "Scarica Tutti" button, progress indicator, duplicate detection
- **DividendAnalytics.tsx**: Yield TTM, top 10 contributors, trends, upcoming payments

**Key Services:**
- **dividendService.ts**: CRUD, filtering, statistics (yield TTM, top contributors), duplicate check, expense linking, automatic EUR conversion
- **currencyConversionService.ts**: Frankfurter API integration, 24h cache, graceful fallback
- **borsaItalianaScraperService.ts**: Cheerio-based scraping, ISIN lookup, dual URL routing (Stock/ETF), intelligent table detection
- **dividendIncomeService.ts**: Auto-create expenses from dividends with EUR conversion

**Pages:** `app/dashboard/dividends/page.tsx`, integrated in `app/dashboard/cashflow/page.tsx`

**Key Features:**
- Automatic daily scraping (60-day lookback, `/api/cron/daily-dividend-processing`)
- Manual backfill button for historical data
- Multi-currency with automatic EUR conversion (Frankfurter API)
- Expense automation on payment date
- Tax calculation (26% Italian withholding)
- Duplicate prevention (userId + assetId + exDate)
- Analytics: Yield TTM, top contributors, trends

---

### 7. Hall of Fame - Personal Financial Rankings

**Purpose:** Track personal financial records with best/worst months and years across net worth growth, income, and expenses.

**Key Components:**

- **Hall of Fame page**: Four monthly rankings (Top 20 each) and four yearly rankings (Top 10 each) with percentage growth columns, recalculate button, responsive grid
- **MonthlyTable/YearlyTable components**: Display rankings with conditional percentage columns for netWorthDiff (month-over-month/year-over-year)

**Key Services:**
- **hallOfFameService.ts**: Client-side service, retrieves pre-calculated rankings, recalculates from snapshots/expenses, computes month-over-month and year-over-year changes
- **hallOfFameService.server.ts**: Server-side service with Firebase Admin SDK, batch operations for cron jobs

**Page:** `app/dashboard/hall-of-fame/page.tsx`

**Key Features:**
- Automatic ranking updates when snapshots created
- Manual recalculation button
- Pre-calculated rankings cached in Firestore
- Top 20 months and Top 10 years
- Percentage growth tracking (month-over-month, year-over-year)
- Mobile-optimized responsive grid
- Dual service pattern (client + server)

---

## Current Status

**Architecture:** Next.js 16 + Firebase + React Query + Recharts + Frankfurter API (no npm package)
**Mobile:** Custom breakpoint `desktop: 1025px` fixes iPad Mini landscape navigation

**Latest Updates (Gennaio 2026):**
- Settings Page Data Loss Fix: FIRE settings preserved on save (dual-layer fix)
- Firestore Merge Mode: All partial updates now use `{ merge: true }`
- Asset Price History: YTD & From Start columns, cashflow charts 2025+ filter
- Dividend Income Separation: Correct treatment as portfolio returns in performance metrics

## Implemented in This Session (07/01/2026)

### Settings Page FIRE Data Loss - FIXED
- **Problem**: Clicking "Salva" in Settings page lost Safe Withdrawal Rate and Planned Annual Expenses
- **Root Cause**:
  1. `handleSave()` didn't preserve FIRE fields when saving asset allocation
  2. `setSettings()` used `setDoc()` without `{ merge: true }`, overwriting entire Firestore document
- **Solution**: Dual-layer fix
  - Application layer: Fetch + preserve FIRE fields in `handleSave()` (settings/page.tsx line 635)
  - Service layer: Add `{ merge: true }` to `setDoc()` call (assetAllocationService.ts line 92)
- **Verification**: All 7 `setDoc()` usages audited - only assetAllocationService had the issue
- **Files Modified**: `settings/page.tsx` (+3 lines), `assetAllocationService.ts` (+6 lines)

## Key Technical Decisions (Ultimi 2 Mesi)

- **Firestore setDoc Merge Mode** (01/2026): Always use `{ merge: true }` when updating existing documents with partial data - prevents silent data loss when multiple pages update different fields of same document
- **Dividend Income Separation** (01/2026): Separate dividend income from external contributions using `dividendIncomeCategoryId` - mathematically correct per CFA standards, backward compatible
- **Cashflow 2025+ Filter Pattern** (01/2026): Pass `expenses` parameter to functions instead of closure - DRY, testable, no duplication
- **YTD/From Start Percentage** (01/2026): Use `getValue()` helper respecting `displayMode === 'totalValue' || price === 1` - single source of truth for calculations
- **shouldUseTotalValue Flag** (01/2026): Unified flag for ALL % calculations (month-over-month, YTD, fromStart) - consistent behavior across calculation contexts
- **Custom Desktop Breakpoint** (12/2025): `desktop: 1025px` instead of `lg: 1024px` - fixes iPad Mini landscape (1024px) edge case
- **Asset Price History Data Source** (12/2025): Use existing `MonthlySnapshot.byAsset[]` field - zero database migrations needed
- **Lazy-loading Tabs** (12/2025): `mountedTabs` Set pattern - only render tab content after first user click to save memory
- **Chart Formatter Consistency** (12/2025): `formatCurrencyCompact()` for Y-axis labels - compact notation (€1,5 Mln) prevents mobile compression

## Stack & Dependencies

- **Core**: Next.js 16, TypeScript, Firebase, React Query, Recharts, Tailwind, shadcn/ui.
- **External APIs**:
  - Yahoo Finance (price data, free, no API key)
  - Frankfurter API (currency conversion, free, no API key)
- **Web scraping**: cheerio (Borsa Italiana dividend scraping)

## Known Issues / Risks

- **Legend truncation**: Mobile legends show top 3 items only; users must tap chart/tooltip for full detail.
- **Currency conversion**: Relies on external Frankfurter API; has 24h cache + stale fallback but could fail if API down for extended period.
- **Date serialization**: API responses serialize Firestore Timestamps as ISO strings; always use `toDate()` helper for conversions.

---

*Auto-generated document - Version 1.0*
