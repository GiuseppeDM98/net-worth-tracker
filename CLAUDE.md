# CLAUDE.md - Portfolio Tracker

## Project Overview

**Portfolio Tracker** is a comprehensive web application for tracking and managing investment portfolios across multiple asset classes, with integrated expense tracking, FIRE (Financial Independence, Retire Early) calculator, and personal financial rankings.

### Project Purpose
Replace spreadsheet-based portfolio management with a modern, automated solution specifically designed for Italian investors using European exchanges.

### Key Features

**Portfolio Management:**
- Multi-asset class support: Stocks, ETFs, bonds, crypto, real estate, commodities, cash, private equity
- Automatic price updates from Yahoo Finance (100+ worldwide exchanges)
- Asset allocation tracking with target vs actual comparison
- Cost basis tracking with unrealized gains calculation and tax estimation
- TER (Total Expense Ratio) tracking for cost-conscious investing
- Composite assets for pension funds and mixed-allocation investments

**Historical Analysis:**
- Automated monthly snapshots via scheduled cron jobs
- Net worth timeline with interactive charts
- Asset class evolution visualization over time
- Year-over-year performance comparison
- CSV export for external analysis

**Expense & Income Tracking:**
- Four entry types: Income, Fixed Expenses, Variable Expenses, Debts
- Custom categories with subcategories and color coding
- Recurring expenses with automatic monthly generation
- Advanced hierarchical filtering system (Type → Category → Subcategory)
- Visual analytics: interactive three-level drill-down charts
- Income-to-expense ratio metric with financial health indicators
- **React Query Integration:**
  - Automatic data caching with `useExpenses()` and `useExpenseCategories()` hooks
  - Prevents duplicate API requests across tabs
  - Auto-refetch on window focus for data freshness
  - Global cache invalidation on create/edit/delete operations
  - Query keys centralized in `lib/query/queryKeys.ts`

**FIRE Calculator & Tracker:**
- Safe Withdrawal Rate configuration (4% rule based on Trinity Study)
- FIRE Number calculator (25x annual expenses methodology)
- Progress tracking toward financial independence
- Monte Carlo retirement simulations for probabilistic planning
- Historical evolution charts of income, expenses, and sustainable withdrawals

**Hall of Fame:**
- Personal financial records of all time
- Best/worst months by net worth growth, income, and expenses (Top 20)
- Best/worst years by annual performance (Top 10)
- Percentage growth columns for net worth rankings (month-over-month and year-over-year)
- Automatic ranking updates with each new snapshot
- Mobile-optimized responsive card layout eliminates horizontal scroll
- Card-based mobile UI (<768px) with vertical stacking and large text
- Desktop table layout preserved (≥768px) for detailed data view

**Performance Metrics & Analytics:**
- Advanced portfolio performance analysis with industry-standard metrics
- **8 Key Metrics**: ROI, CAGR, Time-Weighted Return (TWR), Money-Weighted Return (IRR), Sharpe Ratio, Volatility, Net Cash Flows, Duration
- **7 Time Periods**: YTD, 1Y, 3Y, 5Y, All Time, Rolling 12M/36M, Custom Date Range
- Time-Weighted Return (TWR) as primary metric (eliminates cash flow timing effects)
- Money-Weighted Return (IRR) using Newton-Raphson iterative solver
- Sharpe Ratio calculation with configurable risk-free rate from user settings
- Annualized volatility calculation with outlier filtering (±50% threshold)
- Interactive charts: Net Worth Evolution (contributions vs returns), Rolling CAGR trends
- Cash flow integration: Automatic aggregation from expense/income data with temporal alignment
- **Enhanced Contributi Netti card**: Shows detailed breakdown (Entrate | Uscite) for full transparency
- **Comprehensive tooltips**: Each metric includes detailed explanations, formulas, and interpretation guidelines
- **Temporal accuracy**: Cash flows and portfolio values are properly aligned to end-of-month snapshots
- **Accurate time periods**: YTD (year-to-date) vs 1Y/3Y/5Y (rolling periods) with clear examples
- **Inclusive month calculations**: Correct duration counting (Jan-Dec = 12 months, not 11)
- Mobile-responsive grid layout with optimized chart formatting
- Custom date range selector for flexible period analysis
- Methodology section with "Periodi Temporali e Snapshot" explaining snapshot timing and period calculations

**Dividend Tracking & Automation:**
- Automatic dividend import from Borsa Italiana for Italian stocks/ETFs
- Manual entry with automatic withholding tax calculation (26% Italian, customizable)
- Expense integration: Auto-create income entries on payment date
- Web scraping: Bulk import historical dividends via ISIN lookup (cheerio-based)
- Daily automation: Cron job processes new dividends and creates expenses
- Four dividend types: Ordinary, Extraordinary, Interim, Final
- Multi-currency support: EUR, USD, GBP, CHF
- Analytics: Dividend yield TTM, top contributors, trends, upcoming payments
- Smart filtering by asset, type, date range
- CSV export functionality

**PDF Export & Comprehensive Reporting:**
- Professional PDF generation powered by @react-pdf/renderer library
- **Temporal filtering**: Three export modes (Total, Annual, Monthly) to filter snapshots and expenses by time period
  - Total Export: Complete historical data across all time
  - Annual Export (YYYY): Data from January 1st of current year to present
  - Monthly Export (Month YYYY): Data from current calendar month only
  - Smart section management: History and FIRE sections automatically disabled for monthly exports
  - Automatic section reset: All sections re-enabled when switching to Annual/Total modes
  - Data validation: Prevents PDF generation with insufficient data (e.g., <2 snapshots for History)
  - Period badge on cover page: Clear indication of report type with specific month/year
- Customizable section selection via export dialog with toggles for 6 report sections
- Chart embedding using html2canvas for visual data preservation
- Six exportable sections:
  1. Portfolio Assets: Complete asset table with totals, G/P, TER
  2. Asset Allocation: Current vs target with rebalancing recommendations (±2% threshold)
  3. Historical Performance: Net worth evolution and YoY comparison
  4. Cashflow Analysis: Income/Expenses with savings rate and top categories
  5. FIRE Calculator: Progress to FI with customizable Safe Withdrawal Rate
  6. Summary: Key metrics snapshot across all sections
- Dynamic calculations:
  - Safe Withdrawal Rate integration: Retrieves user setting from `assetAllocationTargets` collection (default 4%)
  - FIRE Number multiplier: Auto-calculates 100/SWR (e.g., 25x for 4%, 33.33x for 3%)
  - Average monthly savings: Net cashflow divided by number of unique tracked months
  - Rebalancing completeness: Iterates directly on `comparisonResult` to include all asset classes with action !== 'OK'
- Professional styling: Color-coded metrics, branded headers/footers, table formatting
- Efficient data aggregation: Single service (`pdfDataService.ts`) prepares all section data
- Chart capture utilities: `chartCapture.ts` with html2canvas integration
- Type-safe architecture: Comprehensive TypeScript definitions in `types/pdf.ts`
- Modular component structure: Reusable PDF primitives (Text, Table, Section, Chart)

**Technical Implementation:**
- React-PDF Renderer: Version 4.3.1 for declarative PDF generation
- Data Service: `lib/services/pdfDataService.ts` orchestrates data fetching and preparation
- Time Filter Utilities: `lib/utils/pdfTimeFilters.ts` handles temporal filtering logic
  - `filterSnapshotsByTime()`: Filters snapshots by total/yearly/monthly periods
  - `filterExpensesByTime()`: Filters expenses with Firestore Timestamp handling
  - `validateTimeFilterData()`: Checks data availability for each time period
  - `adjustSectionsForTimeFilter()`: Auto-disables incompatible sections (History/FIRE for monthly)
  - `validatePDFGeneration()`: Ensures minimum data requirements before generation
- PDF Components: Modular structure in `components/pdf/`
  - `PDFDocument.tsx`: Main wrapper with conditional section rendering
  - `PDFExportDialog.tsx`: Enhanced with RadioGroup for time filter selection
  - `sections/`: Individual section components (Portfolio, Allocation, History, Cashflow, FIRE, Summary)
    - `CoverSection.tsx`: Displays period-specific badge (e.g., "REPORT ANNUALE - 2025")
  - `primitives/`: Reusable UI elements (Text, Table, Section, Chart)
- Chart Integration: `lib/utils/chartCapture.ts` captures Recharts as PNG using html2canvas
- Type Definitions: Complete interfaces in `types/pdf.ts` for all data structures
  - `TimeFilter`: Type for 'total' | 'yearly' | 'monthly'
  - `TimeFilterValidation`: Interface for data availability checks
  - `PDFDataContext`: Extended with optional `timeFilter` field
- Service Integrations:
  - `assetService.ts`: Portfolio data and calculations
  - `assetAllocationService.ts`: Target allocation and rebalancing logic
  - `fireService.ts`: FIRE metrics with user-configured SWR
  - `expenseService.ts`: Cashflow data aggregation

**Key Fixes Implemented (#68):**
- Dynamic FIRE multiplier: Replaces hardcoded "25x" with calculated 100/SWR
- Trinity Study conditional display: Detailed explanation shown only when SWR = 4%
- Average monthly savings: Corrected from showing total to actual per-month average
- Months tracked: Displays "(media su N mesi)" for transparency
- Rebalancing completeness: Fixed to include asset classes with 0€ current value but positive target
- Threshold compliance: Confirmed ±2% in percentage points (not €100 absolute value)

**Mobile Optimizations:**
- Compact chart Y-axis formatting (K/M notation) for improved readability on small screens
- Responsive bottom navigation bar for mobile portrait mode
- 4 primary navigation icons: Overview, Assets, Cashflow, Menu
- Secondary menu drawer with 6 additional sections: Allocation, Performance, History, Hall of Fame, FIRE, Settings
- Intelligent responsive behavior across Desktop, Mobile Landscape, and Mobile Portrait
- Preserved backward compatibility for desktop and landscape modes
- **Hall of Fame mobile UI**: Card layout replaces tables on mobile portrait (<768px) with MonthlyRecordCard and YearlyRecordCard components for zero horizontal scroll
- **Cashflow Page Mobile Optimizations:**
  - **Mobile card layout** (<768px): Compact `ExpenseCard` component with collapsible details
    - Always visible: Date, Type badge, Amount with icon
    - Collapsible: Notes, installment info, external links
    - Smart delete confirmations for recurring/installment expenses
  - **FAB button** (<640px): Floating Action Button for "Nuova Spesa" fixed bottom-right
    - Position: `fixed bottom-24 right-4` (avoids bottom navigation overlap)
    - Size: 56×56px (standard FAB, touch-friendly)
    - Desktop: Traditional top-right button with icon + text
  - **Icon-only tabs** (<640px): Compact tab navigation showing only icons
    - 4 tabs: Tracciamento (Receipt), Dividendi (Coins), Anno Corrente (Trending Up), Storico Totale (Bar Chart)
    - Desktop (≥640px): Full icon + text labels
    - Saves ~60px width per tab on mobile
  - **Dialog spacing optimization**: Responsive form spacing in `ExpenseDialog`
    - Mobile (<640px): `space-y-4` (16px gaps) reduces total height by ~208px (17%)
    - Desktop (≥640px): `space-y-6` (24px gaps) maintains readability
    - Improves UX when mobile keyboard is visible
  - **Responsive breakpoint**: `sm` (640px) consistent across all optimizations
- **Settings Page Mobile Optimizations:**
  - **Header buttons**: Stack vertically full-width on mobile (<640px) for better touch targets
  - **Responsive spacing**: Reduced vertical spacing (`space-y-4` mobile → `sm:space-y-6` desktop) saves ~80-120px
  - **Card padding**: Reduced internal padding (`p-4` mobile → `sm:p-6` desktop) saves ~32px per card (~192px total)
  - **Touch-friendly buttons**: Increased gap between Edit/Delete buttons (`gap-3`) prevents accidental taps
  - **Nested sections**: Reduced padding/indentation for sub-categories and specific assets on mobile
  - **Section headers**: Stack vertically with full-width action buttons on mobile
  - **Label wrapping fix**: Switch+label containers use `flex-col` on mobile with `block` labels for proper text flow
  - **Breakpoint**: `sm` (640px) - applies to both mobile portrait and landscape

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

### Architectural Choices

**Why Next.js?**
- Best-in-class React framework with excellent developer experience
- App Router for modern routing and server components
- API Routes for serverless backend without separate infrastructure

**Why Firebase?**
- Generous free tier
- Real-time updates
- Easy authentication without server management
- Firestore Security Rules for server-side authorization

**Why Yahoo Finance?**
- Free API without required API key
- Reliable with extensive ticker coverage (unlike paid APIs)
- Support for 100+ worldwide exchanges

**Why Vercel?**
- Seamless Next.js integration
- Automatic deployments from Git
- Built-in cron jobs for automation

**Why TypeScript?**
- Type safety prevents bugs
- Improves maintainability and developer experience
- Safe autocomplete and refactoring

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

**app/** - Next.js App Router
- Filesystem-based routing
- Server Components by default
- API Routes in `app/api/`
- Nested layouts for shared UI structure

**components/** - Reusable React components
- `ui/` contains shadcn/ui components (design system)
- Components organized by feature/domain
- Presentational components separated from business logic

**lib/** - Business logic and utilities
- `firebase/` manages client and admin SDK connections
- `services/` contains all business logic (CRUD, external APIs)
- `utils/` for generic helper functions

**types/** - TypeScript definitions
- Shared types for domain entities
- Interfaces for API responses
- Type guards and utility types

**contexts/** - React Context providers
- AuthContext for global authentication state
- Pattern: Context + Provider + custom hook

---

## Architecture & Design Patterns

### Core Architectural Patterns

The application follows a **layered architecture** with clear separation of concerns between presentation, business logic, and data access layers.

#### 1. Context + Provider Pattern (Global State Management)

**Location:** `contexts/AuthContext.tsx`

The application uses React Context API for global authentication state management:

```typescript
// Context definition with typed interface
const AuthContext = createContext<AuthContextType>({...});

// Custom hook for consuming context
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

// Provider component wrapping the app
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Firebase Auth state listener
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      // Transform Firebase user to app User type
      // Fetch additional user data from Firestore if needed
    });
    return () => unsubscribe();
  }, []);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
```

**Key Features:**
- Single source of truth for authentication state
- Automatic Firebase Auth state synchronization
- Type-safe access via custom hook
- Error handling for context misuse

**Usage in components:**
```typescript
const { user, loading, signIn, signOut } = useAuth();
```

#### 2. Protected Routes Pattern (Auth Guards)

**Location:** `components/ProtectedRoute.tsx`, `app/dashboard/layout.tsx`

Protected routes are implemented using a wrapper component that checks authentication state:

```typescript
export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
  }, [user, loading, router]);

  if (loading) return <LoadingSpinner />;
  if (!user) return null;

  return <>{children}</>;
}
```

Dashboard routes are automatically protected:
```typescript
// app/dashboard/layout.tsx
export default function DashboardLayout({ children }) {
  return (
    <ProtectedRoute>
      <Sidebar />
      <Header />
      {children}
    </ProtectedRoute>
  );
}
```

#### 3. Service Layer Pattern (Business Logic Abstraction)

**Location:** `lib/services/*.ts`

Business logic is encapsulated in service modules, keeping components clean and testable:

```typescript
// lib/services/assetService.ts
export async function getAllAssets(userId: string): Promise<Asset[]> {
  const assetsRef = collection(db, 'assets');
  const q = query(assetsRef, where('userId', '==', userId));
  const querySnapshot = await getDocs(q);

  const assets = querySnapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data(),
    // Transform Firestore Timestamps to Dates
    lastPriceUpdate: doc.data().lastPriceUpdate?.toDate() || new Date(),
  })) as Asset[];

  // Sort by asset class, then by name
  return assets.sort((a, b) => {
    const orderA = ASSET_CLASS_ORDER[a.assetClass] || 999;
    const orderB = ASSET_CLASS_ORDER[b.assetClass] || 999;
    if (orderA !== orderB) return orderA - orderB;
    return a.name.localeCompare(b.name);
  });
}
```

**Service responsibilities:**
- Data fetching and transformation
- Business logic implementation
- Error handling and validation
- Firestore query construction

#### 4. Dual Firebase SDK Pattern (Client/Server Separation)

**Location:** `lib/firebase/config.ts` (client), `lib/firebase/admin.ts` (server)

The application uses two separate Firebase SDK configurations:

**Client-side SDK** (`lib/firebase/config.ts`):
```typescript
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
export const auth = getAuth(app);
export const db = getFirestore(app);
```
- Used in React components and client-side services
- Authenticated with Firebase Auth (user-scoped)
- Subject to Firestore Security Rules

**Server-side Admin SDK** (`lib/firebase/admin.ts`):
```typescript
const adminApp = initializeApp({
  credential: cert(serviceAccount),
});
export const adminAuth = getAuth(adminApp);
export const adminDb = getFirestore(adminApp);
```
- Used exclusively in API routes and server-side code
- Authenticated with service account credentials
- Bypasses Firestore Security Rules (requires manual authorization)

#### 5. Serverless API Routes Pattern

**Location:** `app/api/**/*.ts`

Next.js API routes provide a serverless backend for operations requiring server-side execution:

```typescript
// app/api/auth/check-registration/route.ts
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email } = body;

    // Server-side validation that cannot be bypassed
    const allowed = isRegistrationAllowed(email);

    if (!allowed) {
      return NextResponse.json(
        { allowed: false, message: 'Registration closed' },
        { status: 403 }
      );
    }

    return NextResponse.json({ allowed: true });
  } catch (error) {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
```

**API Route types:**
- **Authentication endpoints** (`/api/auth/*`): Registration validation, user management
- **Cron job endpoints** (`/api/cron/*`): Scheduled tasks (monthly snapshots)
- **Price data endpoints** (`/api/prices/*`): Yahoo Finance API integration
- **Portfolio operations** (`/api/portfolio/*`): Server-side portfolio calculations

#### 6. Environment-based Configuration Pattern

**Location:** `lib/constants/appConfig.ts`

Feature flags and configuration are managed via environment variables:

```typescript
export const APP_CONFIG = {
  REGISTRATIONS_ENABLED: process.env.NEXT_PUBLIC_REGISTRATIONS_ENABLED !== 'false',
  REGISTRATION_WHITELIST_ENABLED: process.env.NEXT_PUBLIC_REGISTRATION_WHITELIST_ENABLED === 'true',
  REGISTRATION_WHITELIST: (process.env.NEXT_PUBLIC_REGISTRATION_WHITELIST || '')
    .split(',')
    .map(email => email.trim())
    .filter(email => email.length > 0),
};

export function isRegistrationAllowed(email: string): boolean {
  if (!APP_CONFIG.REGISTRATIONS_ENABLED) {
    if (APP_CONFIG.REGISTRATION_WHITELIST_ENABLED) {
      return APP_CONFIG.REGISTRATION_WHITELIST.includes(email.toLowerCase());
    }
    return false;
  }
  return true;
}
```

**Benefits:**
- Runtime configuration without code changes
- Environment-specific behavior (dev/staging/prod)
- Feature flag toggles for gradual rollouts

#### 7. Repository Pattern (Data Access Abstraction)

Services act as repositories, abstracting Firestore operations:

```typescript
// Create
export async function createAsset(userId: string, data: AssetFormData): Promise<Asset> {
  const assetRef = await addDoc(collection(db, 'assets'), {
    ...data,
    userId,
    createdAt: Timestamp.now(),
  });
  return getAssetById(assetRef.id);
}

// Read
export async function getAssetById(assetId: string): Promise<Asset | null> {
  const assetDoc = await getDoc(doc(db, 'assets', assetId));
  return assetDoc.exists() ? { id: assetDoc.id, ...assetDoc.data() } : null;
}

// Update
export async function updateAsset(assetId: string, data: Partial<AssetFormData>): Promise<void> {
  await updateDoc(doc(db, 'assets', assetId), {
    ...data,
    updatedAt: Timestamp.now(),
  });
}

// Delete
export async function deleteAsset(assetId: string): Promise<void> {
  await deleteDoc(doc(db, 'assets', assetId));
}
```

### Key Architectural Files

| File | Purpose | Pattern |
|------|---------|---------|
| `contexts/AuthContext.tsx` | Global authentication state | Context + Provider + Custom Hook |
| `components/ProtectedRoute.tsx` | Route protection guard | Higher-Order Component |
| `lib/firebase/config.ts` | Client-side Firebase SDK | Singleton Configuration |
| `lib/firebase/admin.ts` | Server-side Firebase SDK | Singleton Configuration |
| `app/layout.tsx` | Root layout with providers | Provider Composition |
| `app/dashboard/layout.tsx` | Protected dashboard layout | Layout Nesting + Auth Guard |
| `lib/services/assetService.ts` | Asset business logic | Service Layer + Repository |
| `app/api/cron/monthly-snapshot/route.ts` | Automated snapshots | Cron Job + Serverless Function |
| `lib/constants/appConfig.ts` | Feature flags | Configuration Management |

---

## Data Flow

### Client-Side Data Flow (User Interactions)

```
┌─────────────────────────────────────────────────────────────┐
│                    USER INTERACTION                         │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│            React Component (UI Layer)                       │
│  • Dashboard pages (app/dashboard/*)                        │
│  • Reusable components (components/*)                       │
│  • Uses hooks: useAuth(), useState(), useEffect()           │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│         Service Layer (lib/services/*)                      │
│  • assetService.ts - Asset CRUD operations                  │
│  • expenseService.ts - Expense/income management            │
│  • snapshotService.ts - Historical snapshots                │
│  • Business logic and data transformation                   │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│      Firebase Client SDK (lib/firebase/config.ts)           │
│  • getFirestore() - Firestore database                      │
│  • getAuth() - Authentication                               │
│  • User-scoped authentication context                       │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│                   FIRESTORE DATABASE                        │
│  • Collections: assets, expenses, monthly-snapshots         │
│  • Security Rules enforce user isolation                    │
│  • Real-time updates via listeners                          │
└─────────────────────────────────────────────────────────────┘
```

**Example: Adding a New Asset**
1. User fills form in `app/dashboard/assets/page.tsx`
2. Component calls `createAsset(userId, formData)` from `assetService.ts`
3. Service validates data and calls `addDoc(collection(db, 'assets'), {...})`
4. Firebase Client SDK sends request to Firestore
5. Firestore Security Rules verify `userId` matches authenticated user
6. Document created, service returns new `Asset` object
7. Component updates UI with new asset

### Server-Side Data Flow (API Routes & Cron Jobs)

```
┌─────────────────────────────────────────────────────────────┐
│         EXTERNAL TRIGGER                                    │
│  • Vercel Cron Job (scheduled)                              │
│  • Client API call (fetch('/api/...'))                      │
│  • Webhook (external service)                               │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│          Next.js API Route (app/api/**/*.ts)                │
│  • Route handlers: GET, POST, PUT, DELETE                   │
│  • Request validation (body, headers, auth)                 │
│  • Error handling and response formatting                   │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│    Service/Helper Layer (lib/services/* or lib/helpers/*)   │
│  • yahooFinanceService.ts - Price data from Yahoo Finance   │
│  • priceUpdater.ts - Bulk price updates                     │
│  • hallOfFameService.ts - Ranking calculations              │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│     Firebase Admin SDK (lib/firebase/admin.ts)              │
│  • getFirestore() - Firestore with admin privileges         │
│  • getAuth() - User management                              │
│  • Bypasses security rules (requires manual auth checks)    │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│                   FIRESTORE DATABASE                        │
│  • Full read/write access (server-side)                     │
│  • Batch operations for efficiency                          │
│  • No security rule enforcement                             │
└─────────────────────────────────────────────────────────────┘
```

**Example: Monthly Snapshot Cron Job**
1. Vercel Cron triggers `GET /api/cron/monthly-snapshot` at end of month
2. API route validates `Authorization: Bearer {CRON_SECRET}` header
3. Route queries all users via Firebase Admin SDK
4. For each user, calls `POST /api/portfolio/snapshot` with user ID
5. Snapshot API fetches user assets, calculates totals, creates snapshot document
6. Calls `updateHallOfFame(userId)` to recalculate rankings
7. Returns success/error response with snapshot IDs

### Authentication Flow

```
┌─────────────────────────────────────────────────────────────┐
│              USER LOGIN/REGISTRATION                        │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│        AuthContext (contexts/AuthContext.tsx)               │
│  • signIn(email, password)                                  │
│  • signUp(email, password, displayName)                     │
│  • signInWithGoogle()                                       │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│      Server-Side Validation (API Route)                     │
│  POST /api/auth/check-registration                          │
│  • Validates email against whitelist                        │
│  • Checks if registrations are enabled                      │
│  • Returns 200 (allowed) or 403 (blocked)                   │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│         Firebase Authentication                             │
│  • createUserWithEmailAndPassword()                         │
│  • signInWithEmailAndPassword()                             │
│  • signInWithPopup(GoogleAuthProvider)                      │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│      User Document Creation (Firestore)                     │
│  • Create /users/{uid} document                             │
│  • Set default asset allocation (60/40 equity/bonds)        │
│  • Store displayName, email, createdAt                      │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│       onAuthStateChanged Listener                           │
│  • Updates AuthContext user state                           │
│  • Fetches additional user data from Firestore              │
│  • Triggers re-render of protected routes                   │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│           ProtectedRoute Guard                              │
│  • Checks if user is authenticated                          │
│  • Redirects to /login if not authenticated                 │
│  • Shows loading spinner during auth check                  │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│              DASHBOARD ACCESS GRANTED                       │
└─────────────────────────────────────────────────────────────┘
```

### Price Update Flow (Yahoo Finance Integration)

```
┌─────────────────────────────────────────────────────────────┐
│    USER CLICKS "Update Prices" or Cron Job Triggers        │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│         POST /api/prices/update                             │
│  • Receives userId from request body                        │
│  • Validates user authentication                            │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│     updateUserAssetPrices(userId)                           │
│  (lib/helpers/priceUpdater.ts)                              │
│  • Fetch all user assets from Firestore                     │
│  • Filter assets that need price updates                    │
│    (skip cash, real estate, manual-only assets)             │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│     Yahoo Finance Service (yahooFinanceService.ts)          │
│  • Batch fetch prices for multiple tickers                  │
│  • Handle ticker symbol formatting (.DE, .MI, .L)           │
│  • Parse response and extract current price                 │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│              YAHOO FINANCE API                              │
│  • External HTTP request to finance.yahoo.com               │
│  • Returns JSON with price, market cap, etc.                │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│       Update Firestore Asset Documents                      │
│  • Batch update: set currentPrice, lastPriceUpdate          │
│  • Calculate new totalValue (quantity × currentPrice)       │
│  • Update timestamp                                         │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│         Return Success Response to Client                   │
│  • Updated count, failed tickers, error messages            │
└─────────────────────────────────────────────────────────────┘
```

### Data Flow Characteristics

**Client-Side:**
- **User-scoped operations**: All queries filtered by `userId`
- **Real-time updates**: Firestore listeners provide live data sync
- **Optimistic UI**: Components update immediately, sync asynchronously
- **Security Rules**: Firestore rules enforce user isolation server-side

**Server-Side:**
- **Admin privileges**: Bypasses security rules, requires manual authorization
- **Batch operations**: Process multiple users/assets efficiently
- **Scheduled automation**: Cron jobs run independent of user sessions
- **External API integration**: Yahoo Finance, future webhooks

**Security Layers:**
1. **Client**: Firebase Auth token validation
2. **Server**: API route authentication (CRON_SECRET for automated jobs)
3. **Database**: Firestore Security Rules (client) or manual checks (admin)

---

## Key Features & Components

This section documents the 5 core features of the application, their key components, services, and implementation details.

### 1. Portfolio Management (Assets)

**Purpose:** Manage multi-asset class portfolio with automatic price updates and comprehensive tracking.

**Key Components:**
- **AssetDialog.tsx** (`components/assets/AssetDialog.tsx`):
  - Complex form dialog for creating/editing assets
  - Supports 8 asset types: Stocks, ETFs, bonds, crypto, real estate, commodities, cash, private equity
  - Conditional fields based on asset type and class
  - Cost basis tracking toggle (average cost per unit, tax rate)
  - TER (Total Expense Ratio) tracking
  - Composite asset allocation (mixed pension funds)
  - Auto/manual price update toggle
  - Form validation with react-hook-form + zod

**Key Services:**
- **assetService.ts** (`lib/services/assetService.ts`):
  - CRUD operations: `getAllAssets()`, `createAsset()`, `updateAsset()`, `deleteAsset()`
  - Value calculations: `calculateAssetValue()`, `calculateTotalValue()`
  - Unrealized gains: `calculateUnrealizedGains()`, `calculateEstimatedTaxes()`
  - Sorting by asset class priority (Equity → Bonds → Commodities → Real Estate → Cash → Crypto)

- **yahooFinanceService.ts** (`lib/services/yahooFinanceService.ts`):
  - Fetch real-time prices from Yahoo Finance API
  - Support for 100+ global exchanges
  - Ticker symbol formatting (.DE, .MI, .L suffixes)
  - Batch price fetching for efficiency

**Page:** `app/dashboard/assets/page.tsx`

**Data Flow:**
```
User → AssetDialog → assetService.createAsset() → Firestore /assets
User clicks "Update Prices" → /api/prices/update → yahooFinanceService → Update Firestore
Firestore listeners → Auto-refresh asset list
```

**Key Features:**
- Real-time portfolio valuation
- Automatic price updates (skip cash, real estate, manual-only assets)
- Liquid vs illiquid classification
- G/P (Gain/Loss) column with absolute and percentage values
- **Portfolio weight percentage**: "Peso in %" column showing each asset's weight on total portfolio (desktop and mobile)
- TER tracking with weighted portfolio average
- Manual price override for non-tradeable assets
- Mobile-optimized card layout with collapsible details

---

### 2. Expense & Income Tracking (Cashflow)

**Purpose:** Track income, expenses, and debts with advanced filtering, categorization, and analytics.

**Key Components:**
- **ExpenseDialog.tsx** (`components/expenses/ExpenseDialog.tsx`):
  - Unified form for all 4 expense types: Income, Fixed Expenses, Variable Expenses, Debts
  - Category and subcategory selection (hierarchical)
  - Recurring expense generator (create N monthly entries)
  - External link field (for receipts, invoices)
  - Date picker with Italian locale
  - Type-specific validation

- **ExpenseTable.tsx** (`components/expenses/ExpenseTable.tsx`):
  - Sortable table with Tanstack Table
  - Inline edit/delete actions
  - Color-coded by type (green for income, red for expenses)
  - Pagination and filtering
  - Responsive design

- **CategoryManagementDialog.tsx** (`components/expenses/CategoryManagementDialog.tsx`):
  - Create/edit/delete expense categories
  - Subcategory management
  - Color picker for visual identification
  - Smart category deletion with expense reassignment workflow

**Key Services:**
- **expenseService.ts** (`lib/services/expenseService.ts`):
  - CRUD operations: `getAllExpenses()`, `createExpense()`, `updateExpense()`, `deleteExpense()`
  - Filtering: `getExpensesByMonth()`, `getExpensesByDateRange()`, `getExpensesByType()`
  - Statistics: `calculateTotalIncome()`, `calculateTotalExpenses()`, `getExpenseStats()`
  - Recurring expense generation: `createRecurringExpenses()`
  - Category reassignment: `reassignExpensesCategory()`

- **expenseCategoryService.ts** (`lib/services/expenseCategoryService.ts`):
  - Category CRUD with validation
  - Automatic expense updates on category rename
  - Protected deletion (require reassignment if expenses exist)

**Page:** `app/dashboard/cashflow/page.tsx`

**Data Flow:**
```
User → ExpenseDialog → expenseService.createExpense() → Firestore /expenses
User → CategoryManagementDialog → expenseCategoryService → Firestore /expenseCategories
Filter change → Re-query with WHERE clauses → Update stats and charts
```

**Key Features:**
- **Advanced hierarchical filtering**: Type → Category → Subcategory with progressive enabling
- **Interactive drill-down pie charts**: 3-level navigation (Categories → Subcategories → Transactions)
- **Income-to-expense ratio metric**: Color-coded financial health indicator (Green ≥1.2, Yellow 0.8-1.2, Red <0.8)
- **Smart category management**: Automatic expense reassignment, inline category creation during deletion
- **Recurring expenses**: Generate 12 monthly entries in one operation
- **Year/month filtering**: Dynamic statistics update based on selected period

---

### 3. Asset Allocation & Rebalancing

**Purpose:** Define target allocation, track current vs target, and get rebalancing recommendations.

**Key Components:**
- **Allocation page** (`app/dashboard/allocation/page.tsx`):
  - Three-tier allocation hierarchy: Asset Class → Subcategory → Specific Assets
  - Target percentage input for each level
  - Current allocation calculated from real portfolio
  - Difference calculation (target - current)
  - Buy/Sell recommendations (threshold: ±€100)
  - Interactive drill-down with breadcrumb navigation
  - Formula-based allocation calculator (age-based equity/bonds split)

**Key Services:**
- **assetAllocationService.ts** (`lib/services/assetAllocationService.ts`):
  - Settings management: `getSettings()`, `setSettings()`
  - Allocation calculation: `calculateAllocation()` (handles composite assets)
  - Rebalancing: `calculateRebalancing()` (buy/sell amounts)
  - Default targets: `getDefaultTargets()` (60/40 equity/bonds)
  - Specific asset tracking: Match portfolio assets to target tickers
  - Subcategory-level granularity with percentage validation

**Data Model:**
```typescript
AssetAllocationTarget {
  equity: { percentage: number, subCategories: SubCategoryTarget[] }
  bonds: { percentage: number, subCategories: SubCategoryTarget[] }
  crypto: { percentage: number }
  realestate: { percentage: number }
  commodity: { percentage: number }
  cash: { percentage: number }
}

SubCategoryTarget {
  name: string
  percentage: number  // Relative to asset class
  specificAssets?: SpecificAssetAllocation[]
}

SpecificAssetAllocation {
  ticker: string
  percentage: number  // Relative to subcategory, must sum to 100%
}
```

**Page:** `app/dashboard/allocation/page.tsx`

**Data Flow:**
```
User → Settings page → assetAllocationService.setSettings() → Firestore /assetAllocationTargets
Allocation page load → getSettings() + getAllAssets() → calculateAllocation() → Display
User drills down → Filter to subcategory → Calculate specific asset targets
```

**Key Features:**
- **Multi-level allocation tracking**: Asset class → Subcategory → Individual tickers
- **Composite asset support**: Pension funds with mixed allocations (e.g., 60% equity, 40% bonds)
- **Formula-based targets**: Auto-calculate equity/bonds based on age and risk-free rate
- **Specific asset drill-down**: Define target % for individual stocks within subcategories
- **Real-time validation**: Specific asset percentages must sum to 100%
- **Automatic portfolio matching**: Link specific assets to real holdings by ticker/name

---

### 4. FIRE Calculator & Monte Carlo Simulations

**Purpose:** Calculate Financial Independence goals and simulate retirement scenarios probabilistically.

**Key Components:**
- **FireCalculatorTab.tsx** (`components/fire-simulations/FireCalculatorTab.tsx`):
  - Safe Withdrawal Rate (SWR) configuration (default: 4%)
  - Current scenario metrics (based on actual net worth and expenses)
  - Planned scenario metrics (user-defined annual expenses)
  - Progress bar to FI
  - Monthly/daily allowance calculations
  - Years of expenses coverage
  - Historical FIRE evolution chart (income, expenses, sustainable withdrawal over time)

- **MonteCarloTab.tsx** (`components/fire-simulations/MonteCarloTab.tsx`):
  - Simulation parameter inputs (retirement years, inflation, allocation, returns)
  - Portfolio amount selector (total, liquid only, custom)
  - Market vs Historical returns toggle
  - Run simulation button (1,000-10,000 iterations)
  - Results display: success rate, median/average outcomes
  - Fan chart (10th, 25th, 50th, 75th, 90th percentiles over time)
  - Distribution histogram (final portfolio values)
  - Failure analysis (depletion years)

**Key Services:**
- **fireService.ts** (`lib/services/fireService.ts`):
  - Annual calculations: `getAnnualExpenses()`, `getAnnualIncome()`
  - FIRE metrics: `calculateFIREMetrics()` (FIRE number, progress %, allowances)
  - Planned metrics: `calculatePlannedFIREMetrics()`
  - Historical data: `getMonthlyFIREData()` (12-month rolling window)
  - Trinity Study methodology: 25x rule (FIRE Number = Annual Expenses × 25)

- **monteCarloService.ts** (`lib/services/monteCarloService.ts`):
  - Simulation engine: `runMonteCarloSimulation()` (N iterations)
  - Random number generation: `randomNormal()` (Box-Muller transform)
  - Historical returns calculation: `calculateHistoricalReturns()` (from snapshots)
  - Statistical analysis: `calculatePercentiles()`, `calculateSuccessRate()`
  - Asset class-specific returns and volatilities
  - Inflation adjustment for withdrawal amounts

**Pages:**
- `app/dashboard/fire/page.tsx` (FIRE Calculator)
- `app/dashboard/monte-carlo/page.tsx` (Monte Carlo Simulations)

**Data Flow:**
```
FIRE Calculator:
User → fireService.getAnnualExpenses() + getAnnualIncome() → Display metrics
Settings change → calculateFIREMetrics() → Update progress and allowances

Monte Carlo:
User clicks "Run Simulation" → monteCarloService.runMonteCarloSimulation()
  ↓ (for each iteration)
  - Generate random returns (normal distribution)
  - Simulate portfolio growth/depletion over N years
  - Track outcomes
  ↓
Calculate percentiles and success rate → Display charts
```

**Key Features:**
- **FIRE Number calculation**: 25x annual expenses (4% SWR from Trinity Study)
- **Dual scenarios**: Current (actual expenses) vs Planned (target expenses)
- **Monte Carlo simulations**: 1,000+ iterations with probabilistic outcomes
- **Historical returns integration**: Use actual portfolio returns if ≥24 months of data
- **Success rate analysis**: % of simulations where portfolio lasts N years
- **Fan chart visualization**: 5 percentile bands showing range of outcomes
- **Failure analysis**: Median/average depletion year when portfolio fails
- **Configurable parameters**: Asset allocation, expected returns, volatility, inflation

---

### 5. Historical Analysis & Snapshots

**Purpose:** Track net worth evolution over time with automated monthly snapshots.

**Key Components:**
- **CreateManualSnapshotModal.tsx** (`components/CreateManualSnapshotModal.tsx`):
  - Manual snapshot creation for specific date
  - Fetches current portfolio state
  - Calculates totals by asset class and liquidity
  - Preview before saving
  - Duplicate prevention

- **History page** (`app/dashboard/history/page.tsx`):
  - Net worth timeline chart (Recharts area chart)
  - Asset class breakdown over time (stacked area chart)
  - Year-over-year comparison table
  - Monthly growth rate calculations
  - CSV export functionality
  - Filter by date range

**Key Services:**
- **snapshotService.ts** (`lib/services/snapshotService.ts`):
  - Snapshot creation: `createSnapshot()` (captures portfolio state)
  - Retrieval: `getUserSnapshots()`, `getSnapshotsByDateRange()`
  - Duplicate check: `snapshotExistsForMonth()`
  - Calculations: `calculateTotalsByAssetClass()`, `calculateLiquidVsIlliquid()`
  - CSV export: `exportSnapshotsToCSV()`

**Data Model:**
```typescript
MonthlySnapshot {
  userId: string
  date: Date
  totalNetWorth: number
  liquidNetWorth: number
  illiquidNetWorth: number
  byAssetClass: {
    equity: number
    bonds: number
    crypto: number
    realestate: number
    commodity: number
    cash: number
  }
  assets: SnapshotAsset[]  // Full asset details
  isDummy?: boolean  // Test data flag
  createdAt: Date
}
```

**Pages:** `app/dashboard/history/page.tsx`

**Data Flow:**
```
Automated (Cron):
Vercel Cron (monthly) → /api/cron/monthly-snapshot → snapshotService.createSnapshot()
  ↓
  For each user:
  - Fetch all assets
  - Calculate totals by asset class
  - Check for duplicates
  - Save to Firestore /monthly-snapshots
  - Update Hall of Fame rankings

Manual:
User → CreateManualSnapshotModal → /api/portfolio/snapshot → snapshotService.createSnapshot()

Historical Analysis:
Page load → getUserSnapshots() → Sort by date → Render charts
Export button → exportSnapshotsToCSV() → Download file
```

**Key Features:**
- **Automated monthly snapshots**: Cron job captures portfolio state on last day of month
- **Asset class evolution**: Visualize how allocation changes over time
- **Growth tracking**: Month-over-month and year-over-year performance
- **Duplicate prevention**: Only one snapshot per user per month
- **CSV export**: Download historical data for external analysis (Excel, Google Sheets)
- **Test data support**: Dummy snapshot generator for development/demo (up to 120 months)
- **Composite asset handling**: Correctly split mixed-allocation assets (e.g., 60/40 pension funds)

---

### 6. Dividend Tracking & Automation

**Purpose:** Track dividend income with automatic scraping from Borsa Italiana and expense synchronization.

**Key Components:**
- **DividendDialog.tsx** (`components/dividends/DividendDialog.tsx`):
  - Form for manual dividend entry
  - Automatic tax calculation (26% Italian withholding, customizable)
  - Supports 4 dividend types: ordinary, extraordinary, interim, final
  - Multi-currency support (EUR, USD, GBP, CHF)
  - Per-share amount with quantity calculation
  - Gross/net/tax breakdown
  - Payment date tracking for expense creation
  - **Date handling**: Uses `toDate()` helper to handle Date/Timestamp/string formats (fixes JSON serialization issues)

- **DividendTable.tsx** (`components/dividends/DividendTable.tsx`):
  - Sortable table with per-share amounts, quantity, gross/tax/net
  - Color-coded by dividend type
  - Linked expense indicator (icon shows if expense created)
  - Edit/delete actions
  - CSV export
  - **Currency conversion display**: Shows EUR amounts with tooltip for foreign currency dividends (AmountWithConversion component)

- **BorsaItalianaScraperModal.tsx** (`components/dividends/BorsaItalianaScraperModal.tsx`):
  - Bulk import dividends by ISIN from Borsa Italiana
  - Manual "Scarica Tutti" button for historical backfill
  - Progress indicator during scraping
  - Duplicate detection
  - Error handling for failed lookups

- **DividendAnalytics.tsx** (`components/dividends/DividendAnalytics.tsx`):
  - Dividend yield TTM (trailing twelve months)
  - Top 10 contributors (pie chart + table)
  - Historical trends (line chart)
  - Upcoming payments timeline
  - Filter by asset, type, date range

**Key Services:**
- **dividendService.ts** (`lib/services/dividendService.ts`):
  - CRUD operations: `getAllDividends()`, `createDividend()`, `updateDividend()`, `deleteDividend()`
  - Filtering: `getDividendsByAsset()`, `getDividendsByDateRange()`, `getDividendsByType()`
  - Statistics: `calculateDividendYieldTTM()`, `getUpcomingPayments()`, `getTopContributors()`
  - Duplicate check: `isDuplicateDividend(userId, assetId, exDate)`
  - Expense linking: Track which dividends have created expenses
  - **Automatic currency conversion**: Converts USD/GBP/CHF to EUR on create/update using `currencyConversionService`

- **currencyConversionService.ts** (`lib/services/currencyConversionService.ts`):
  - Currency conversion using **Frankfurter API** (free, no API key required)
  - `convertToEur(amount, currency)`: Single conversion
  - `convertMultipleToEur(amounts[], currency)`: Batch conversion
  - `getExchangeRateToEur(currency)`: Get current exchange rate
  - **24-hour in-memory cache** with TTL to reduce API calls
  - **Graceful fallback**: Uses stale cache if API fails
  - Supports EUR, USD, GBP, CHF

- **borsaItalianaScraperService.ts** (`lib/services/borsaItalianaScraperService.ts`):
  - Web scraping from Borsa Italiana using **cheerio** (lightweight, serverless-compatible)
  - **ISIN-based dividend lookup**: `scrapeDividendsByIsin(isin: string, assetType: AssetType)`
  - **Dual URL routing**: Stock URL vs ETF URL based on asset type
  - **Intelligent table detection**: Auto-detects 4-column ETF tables vs 7+ column Stock tables
  - **ETF parsing**: Fixed positions (Cell 0=ex-date, 1=amount, 2=currency, 3=payment-date)
  - **Stock parsing**: Pattern matching with `isDateFormat()` validator
  - Italian date/number parsing: Handles "DD/MM/YY" and "1.234,56" formats
  - Currency mapping: "Dollaro Usa" → "USD"
  - Error handling: Returns empty array on failure (no crash)

- **dividendIncomeService.ts** (`lib/services/dividendIncomeService.ts`):
  - Create expense entries from dividends: `createExpenseFromDividend()`
  - Link dividend to expense: Update `dividend.expenseId`
  - Use configured dividend income category from user settings
  - **EUR preference**: Uses `netAmountEur` if available, otherwise `netAmount`
  - **Conversion notes**: Includes original amount in notes (e.g., "100.00 USD convertiti")

**Data Model:**
```typescript
Dividend {
  id: string
  userId: string
  assetId: string
  assetTicker: string
  assetName: string
  isin: string
  exDate: Date                    // Ex-dividend date
  paymentDate: Date              // Payment date (triggers expense creation)
  dividendPerShare: number       // Amount per share
  quantity: number               // Shares held
  grossAmount: number            // dividendPerShare × quantity (original currency)
  taxAmount: number              // Withholding tax (default 26%)
  netAmount: number              // grossAmount - taxAmount (original currency)
  currency: string               // EUR, USD, GBP, CHF
  dividendType: DividendType     // ordinary | extraordinary | interim | final
  // Currency conversion fields (optional, only if currency !== EUR)
  grossAmountEur?: number        // Converted gross amount in EUR
  taxAmountEur?: number          // Converted tax amount in EUR
  netAmountEur?: number          // Converted net amount in EUR
  exchangeRate?: number          // Exchange rate used (for audit trail)
  notes?: string
  expenseId?: string             // Link to created expense (if paid)
  isAutoGenerated: boolean       // True if scraped, false if manual
  createdAt: Date
  updatedAt: Date
}
```

**Pages:**
- `app/dashboard/dividends/page.tsx` (Dividend tracking page with table + analytics)
- Integrated in `app/dashboard/cashflow/page.tsx` (income from dividends)

**Data Flow:**

```
Automatic Scraping (Daily Cron):
Vercel Cron (00:00 UTC) → /api/cron/daily-dividend-processing
  ↓ Phase 1: Dividend Discovery
  For each user:
  - Get equity assets with ISIN
  - Call scrapeDividendsByIsin(isin) → cheerio HTML parsing
  - Filter: exDate >= (today - 60 days) AND exDate >= asset.createdAt
  - Check isDuplicateDividend()
  - Create dividend entries (isAutoGenerated: true)

  ↓ Phase 2: Expense Creation
  For each user:
  - Get dividends with paymentDate = today AND no expenseId
  - Create expense entry (type: income, amount: netAmount)
  - Link dividend.expenseId → expense.id

Manual Backfill:
User → "Scarica Tutti" button → BorsaItalianaScraperModal
  ↓
  scrapeDividendsByIsin(isin) → Returns ALL dividends from Borsa Italiana
  ↓
  Filter by asset.createdAt (no 60-day limit)
  ↓
  Create dividend entries

Expense Integration:
Dividend paymentDate = today → Auto-create expense
  ↓
  User sees income in Cashflow page
  ↓
  Linked via dividend.expenseId (bidirectional reference)
```

**Key Features:**
- **ETF support**: ISIN field enabled for both Stocks and ETFs (AssetDialog.tsx)
- **Automatic scraping**: Daily cron job with 60-day lookback window for Stocks and ETFs
- **Smart filtering**: Only dividends after asset creation date
- **Duplicate prevention**: Check by userId + assetId + exDate
- **Manual backfill**: "Scarica Tutti" button for full historical import
- **Expense automation**: Auto-create income entries on payment date
- **Borsa Italiana integration**: Scrape dividend data via ISIN lookup with asset type routing
- **Tax calculation**: Italian 26% withholding (configurable per dividend)
- **Multi-currency**: Support EUR, USD, GBP, CHF
- **Automatic currency conversion**: Foreign dividends auto-converted to EUR using Frankfurter API
- **Conversion transparency**: Tooltips show original amounts, exchange rate saved for audit
- **EUR-based expenses**: Income entries created in EUR (app's base currency)
- **Analytics**: Yield TTM, top contributors, trends, upcoming payments

**Scraper Logic (Important):**

The automatic scraper uses a **60-day lookback window** from the cron run date:
```typescript
const sixtyDaysAgo = new Date();
sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

const relevantDividends = scrapedDividends.filter((div) => {
  return div.exDate >= sixtyDaysAgo && isDateOnOrAfter(div.exDate, asset.createdAt);
});
```

This means:
- ✅ Dividends with ex-date in the last 60 days are scraped automatically
- ✅ Dividends before asset creation are never scraped (user didn't own them)
- ❌ Historical dividends (>60 days old) are NOT scraped automatically
- ✅ Use "Scarica Tutti" button for manual backfill of old dividends

**Cron Job:**
- **Endpoint**: `/api/cron/daily-dividend-processing`
- **Schedule**: Daily at 00:00 UTC (Vercel Cron)
- **Configuration**: `vercel.json`
- **Two phases**:
  1. Scrape new dividends (60-day window)
  2. Create expenses for dividends with paymentDate = today

---

### 7. Mobile Optimizations

**Purpose:** Optimize user experience on mobile devices with compact data formatting and native-app-like navigation.

**Key Components:**

- **BottomNavigation.tsx** (`components/layout/BottomNavigation.tsx`):
  - Fixed bottom navigation bar visible only on mobile portrait mode
  - 4 primary navigation icons with active state highlighting
  - Menu button opens SecondaryMenuDrawer
  - Native app-like UI with icon + label layout
  - Color-coded active states (blue for selected, gray for inactive)

- **SecondaryMenuDrawer.tsx** (`components/layout/SecondaryMenuDrawer.tsx`):
  - Sheet component sliding from bottom (shadcn/ui)
  - Contains 5 secondary navigation items: Allocation, History, Hall of Fame, FIRE, Settings
  - Auto-closes after navigation selection
  - Active route highlighting
  - Responsive max-height (80vh)

**Key Services:**

- **chartService.ts** (`lib/services/chartService.ts`):
  - `formatCurrencyCompact(value: number)`: Compact currency formatting
  - K/M notation for large numbers (€850k, €1,5 Mln)
  - Optimized for small screen readability
  - Applied to ~19 YAxis instances across all monetary charts

**Responsive Behavior Matrix:**

| Device Mode | Screen Size | Orientation | Navigation UI |
|-------------|-------------|-------------|---------------|
| **Desktop** | ≥1025px | Any | Sidebar lateral (always visible) |
| **Mobile Landscape** | <1025px | Landscape | Sidebar with hamburger toggle |
| **Mobile Portrait** | <1025px | Portrait | Bottom navigation + drawer |

**Note:** Custom breakpoint `desktop: 1025px` (instead of default `lg: 1024px`) fixes iPad Mini landscape (1024px) being treated as desktop. This ensures iPad Mini landscape (1024x768) correctly displays mobile landscape UI with hamburger menu.

**Technical Implementation:**

The implementation uses Tailwind CSS v4 responsive utilities with careful combination of breakpoint and orientation variants:

```typescript
// CRITICAL: Use max-desktop: prefix to limit orientation variants to mobile only

// Bottom Navigation - Mobile Portrait ONLY
<nav className="desktop:hidden max-desktop:portrait:flex max-desktop:landscape:hidden">

// Sidebar - Desktop always visible, Mobile Portrait hidden, Mobile Landscape toggle
<div className={cn(
  'desktop:relative desktop:translate-x-0',                    // Desktop: always visible
  'max-desktop:landscape:fixed max-desktop:landscape:z-50',    // Mobile Landscape: fixed with toggle
  'max-desktop:portrait:hidden',                               // Mobile Portrait: hidden
  isOpen ? 'translate-x-0' : 'max-desktop:landscape:-translate-x-full'
)}>

// Main content padding - Bottom nav spacing on Mobile Portrait
<main className="desktop:pb-6 max-desktop:portrait:pb-20 max-desktop:landscape:pb-6">
```

**Custom Breakpoint Definition** (in `app/globals.css`):
```css
@theme inline {
  /* ... other theme variables ... */

  /* Custom breakpoint for desktop (avoid iPad Mini landscape = 1024px) */
  --breakpoint-desktop: 1025px;
}
```

**Why `max-desktop:` prefix is critical:**
- `landscape:` and `portrait:` apply to ALL screen sizes, including desktop
- Desktop monitors are typically in landscape orientation
- Without `max-desktop:`, `landscape:fixed` overrides `desktop:relative` on desktop
- `max-desktop:portrait:` = "Only on screens <1025px AND portrait"
- `max-desktop:landscape:` = "Only on screens <1025px AND landscape"

**Chart Formatting Examples:**

```typescript
// BEFORE (unreadable on mobile):
YAxis tickFormatter={(value) => formatCurrency(value).replace(/,00$/, '')}
// Output: €1.500.000

// AFTER (compact notation):
YAxis tickFormatter={(value) => formatCurrencyCompact(value)}
// Output: €1,5 Mln

// Logic:
- value >= 1M → €X,X Mln (1 decimal)
- value >= 1k → €Xk (rounded to nearest thousand)
- value < 1k → €X (rounded to nearest euro)
```

**Files Modified:**

| File | Changes |
|------|---------|
| [BottomNavigation.tsx](components/layout/BottomNavigation.tsx) | NEW: Bottom nav component |
| [SecondaryMenuDrawer.tsx](components/layout/SecondaryMenuDrawer.tsx) | NEW: Drawer component |
| [Sidebar.tsx](components/layout/Sidebar.tsx) | Fixed responsive classes with `max-lg:` |
| [dashboard/layout.tsx](app/dashboard/layout.tsx) | Integrated bottom nav, fixed responsive classes |
| [history/page.tsx](app/dashboard/history/page.tsx) | Updated 4 YAxis formatters |
| [TotalHistoryTab.tsx](components/cashflow/TotalHistoryTab.tsx) | Updated 8 YAxis formatters |
| [FireCalculatorTab.tsx](components/fire-simulations/FireCalculatorTab.tsx) | Updated 1 YAxis formatter |
| [DividendStats.tsx](components/dividends/DividendStats.tsx) | Updated 2 YAxis formatters |
| [CurrentYearTab.tsx](components/cashflow/CurrentYearTab.tsx) | Updated 4 YAxis formatters |

**Key Features:**

- **Chart readability**: 19 charts updated with compact K/M formatting for mobile portrait
- **Native app feel**: Bottom navigation mimics iOS/Android app behavior
- **Context preservation**: Primary actions (Overview, Assets, Cashflow) always accessible
- **Secondary access**: Less frequent actions (Allocation, FIRE, Settings) in drawer
- **Zero desktop impact**: All changes scoped to mobile screens only
- **Orientation awareness**: Different UX for portrait vs landscape mobile
- **State management**: Simple local state (no global context pollution)
- **Performance**: No additional network requests or data fetching

**Design Decisions:**

1. **Why Bottom Navigation?**
   - Thumb-friendly on modern large smartphones
   - Industry standard (iOS, Android Material Design)
   - Faster navigation than hamburger menu
   - Always visible (no need to open menu)

2. **Why 4 Primary + Drawer?**
   - Bottom nav should have 3-5 items max (UX best practice)
   - Overview, Assets, Cashflow are most frequently used
   - Menu button provides access to remaining 5 sections
   - Avoids cluttered bottom bar

3. **Why Sheet from Bottom?**
   - More ergonomic on portrait phones (easier to reach)
   - Consistent with mobile OS patterns (iOS action sheets)
   - Better use of vertical space than sidebar
   - Quick dismiss by swiping down

4. **Why K/M Notation?**
   - €1.500.000 takes 10 characters, hard to read at small font
   - €1,5 Mln takes 7 characters, easier to scan
   - Reduces horizontal space requirements
   - Standard in financial apps (Bloomberg, Yahoo Finance)

**Backward Compatibility:**

- ✅ Desktop experience unchanged (sidebar always visible)
- ✅ Mobile landscape unchanged (hamburger + sidebar toggle)
- ✅ All existing functionality preserved
- ✅ No breaking changes to APIs or data structures
- ✅ Progressive enhancement (older browsers gracefully degrade)

**Future Enhancements:**

- [ ] Swipe gestures for navigation between sections
- [ ] Pull-to-refresh for price updates
- [ ] Haptic feedback on iOS devices
- [ ] PWA (Progressive Web App) manifest for "Add to Home Screen"
- [ ] Offline mode with service workers

#### Settings Page Mobile Optimizations

**File**: `app/dashboard/settings/page.tsx`

**Optimizations Applied** (8 total):

1. **Header Buttons Stack**: Main action buttons (`Ripristina Default`, `Salva`) stack vertically full-width on mobile
   - Container: `flex flex-col sm:flex-row gap-2 w-full sm:w-auto`
   - Buttons: `w-full sm:w-auto`
   - Benefit: Larger touch targets, easier thumb reach

2. **Responsive Spacing Globale**: Reduced vertical spacing throughout page
   - Main container: `space-y-4 sm:space-y-6`
   - CardContent: `space-y-4 sm:space-y-6`
   - Section margins: `mt-4 sm:mt-8`
   - Benefit: ~80-120px total height savings, less scrolling

3. **Card Padding Reduction**: All CardContent components use responsive padding
   - Mobile: `p-4` (16px)
   - Desktop: `sm:p-6` (24px)
   - Benefit: ~32px height savings per card, ~192px total with 6 cards

4. **Touch-Friendly Button Spacing**: Category Edit/Delete buttons have increased gap
   - Changed from `gap-2` to `gap-3`
   - Benefit: Prevents accidental taps on adjacent buttons

5. **Nested Section Optimization**: Sub-category and specific asset sections reduced padding
   - Sub-target containers: `p-2 sm:p-3`
   - Specific assets: `ml-3 sm:ml-6`, `pl-2 sm:pl-4`
   - Nested lists: `ml-2 sm:ml-4`
   - Benefit: ~16px savings per nested section, better content visibility

6. **Section Headers Stack**: Expense categories and dividend settings headers stack vertically
   - Header: `flex-col sm:flex-row items-start sm:items-center gap-3`
   - Action buttons: `w-full sm:w-auto`
   - Benefit: No text overflow, full-width tap areas

7. **Main Page Header**: Top-level header with title and action buttons
   - Container: `flex-col sm:flex-row items-start sm:items-center justify-between gap-4`
   - Benefit: Clean layout, no horizontal scroll

8. **Label Wrapping Fix**: Auto-calculate formula switch properly wraps text with inline links
   - Container: `flex-col sm:flex-row items-start sm:items-center`
   - Label: `block` class forces proper multi-line wrapping
   - Switch: `shrink-0` prevents compression
   - Benefit: Fixes awkward text wrapping of "The Bull" link on mobile

**Technical Details**:
- **Breakpoint**: `sm:` (640px) - applies to both mobile portrait and landscape
- **Pattern**: Consistent with Cashflow, Hall of Fame, and other mobile optimizations
- **Backward compatibility**: Desktop layout completely unchanged (≥640px)
- **Zero breaking changes**: All modifications are additive Tailwind classes

**Total Mobile Savings**:
- Vertical space: ~300-350px less scrolling
- Touch targets: +50% area for primary buttons
- Nested sections: -30% indentation, better readability

---

### 8. Hall of Fame - Personal Financial Rankings

**Purpose:** Track personal financial records with best/worst months and years across net worth growth, income, and expenses.

**Key Components:**

- **Hall of Fame page** (`app/dashboard/hall-of-fame/page.tsx`):
  - Four monthly rankings (Top 20 each): Best/worst months by net worth growth, best months by income, worst months by expenses
  - Four yearly rankings (Top 10 each): Best/worst years by net worth growth, best years by income, worst years by expenses
  - **Percentage growth columns**: Month-over-month and year-over-year percentage calculations for net worth rankings
  - Recalculate button to manually trigger ranking updates
  - Mobile-optimized responsive grid layout
  - Optional note display for monthly records with icon tooltip

- **MonthlyTable component**:
  - Displays monthly rankings with rank, month/year, value, percentage (conditional), and notes
  - Percentage column appears only for `netWorthDiff` rankings
  - Formula: `(netWorthDiff / previousNetWorth) * 100`
  - Responsive: `w-12 sm:w-16` for rank column, `min-w-[80px]` for month, `whitespace-nowrap` for values
  - Horizontal scroll on small screens with `overflow-y-auto` and `max-h-[400px]`

- **YearlyTable component**:
  - Displays yearly rankings with rank, year, value, and percentage (conditional)
  - Percentage column appears only for `netWorthDiff` rankings
  - Formula: `(netWorthDiff / startOfYearNetWorth) * 100`
  - Responsive sizing similar to MonthlyTable

**Key Services:**

- **hallOfFameService.ts** (`lib/services/hallOfFameService.ts`):
  - Client-side service using Firebase SDK
  - `getHallOfFameData(userId)`: Retrieves pre-calculated rankings from Firestore
  - `updateHallOfFame(userId)`: Recalculates all rankings from snapshots and expenses
  - `calculateMonthlyRecords()`: Computes month-over-month changes with `previousNetWorth`
  - `calculateYearlyRecords()`: Computes year-over-year changes with `startOfYearNetWorth`

- **hallOfFameService.server.ts** (`lib/services/hallOfFameService.server.ts`):
  - Server-side service using Firebase Admin SDK
  - Used by `/api/hall-of-fame/recalculate` API route
  - Same calculation logic as client-side service
  - Batch operations for all users during cron jobs

**Data Model:**

```typescript
MonthlyRecord {
  year: number
  month: number                // 1-12
  monthYear: string            // "MM/YYYY" format
  netWorthDiff: number         // Month-over-month NW change
  previousNetWorth: number     // NW of previous month (for % calculation)
  totalIncome: number          // Income for this month
  totalExpenses: number        // Expenses for this month
  note?: string                // Optional snapshot note
}

YearlyRecord {
  year: number
  netWorthDiff: number         // Year-over-year NW change
  startOfYearNetWorth: number  // NW at start of year (for % calculation)
  totalIncome: number          // Total annual income
  totalExpenses: number        // Total annual expenses
}

HallOfFameData {
  userId: string
  bestMonthsByNetWorthGrowth: MonthlyRecord[]    // Top 20, netWorthDiff > 0
  bestMonthsByIncome: MonthlyRecord[]            // Top 20
  worstMonthsByNetWorthDecline: MonthlyRecord[]  // Top 20, netWorthDiff < 0
  worstMonthsByExpenses: MonthlyRecord[]         // Top 20
  bestYearsByNetWorthGrowth: YearlyRecord[]      // Top 10, netWorthDiff > 0
  bestYearsByIncome: YearlyRecord[]              // Top 10
  worstYearsByNetWorthDecline: YearlyRecord[]    // Top 10, netWorthDiff < 0
  worstYearsByExpenses: YearlyRecord[]           // Top 10
  updatedAt: Date
}
```

**Pages:** `app/dashboard/hall-of-fame/page.tsx`

**API Routes:**
- `POST /api/hall-of-fame/recalculate`: Manually trigger Hall of Fame recalculation

**Data Flow:**

```
Automated Update:
Cron job creates monthly snapshot → Calls updateHallOfFame(userId)
  ↓
  - Fetch all user snapshots
  - Fetch all user expenses
  - Calculate monthly records (with previousNetWorth)
  - Calculate yearly records (with startOfYearNetWorth)
  - Generate rankings (filter, sort, slice to Top 20/10)
  - Save to Firestore /hall-of-fame/{userId}

Manual Recalculation:
User clicks "Ricalcola Rankings" → POST /api/hall-of-fame/recalculate
  ↓
  - hallOfFameService.server.updateHallOfFame(userId)
  - Same calculation logic as automated update
  - Returns success response

Page Load:
User navigates to Hall of Fame → getHallOfFameData(userId)
  ↓
  - Fetch pre-calculated data from /hall-of-fame/{userId}
  - Render tables with percentage columns for netWorthDiff rankings
```

**Key Features:**

- **Percentage growth tracking**: See month-over-month and year-over-year percentage changes for net worth rankings
- **Conditional percentage display**: Percentage column appears only in "Differenza NW" tables (not in Income/Expenses tables)
- **Smart percentage calculation**: Shows `+X.XX%` for growth, `-X.XX%` for decline, handles zero-division gracefully
- **Automatic ranking updates**: Hall of Fame recalculated automatically when new monthly snapshots are created
- **Manual recalculation**: Users can trigger on-demand ranking updates via "Ricalcola Rankings" button
- **Mobile-optimized layout**: Responsive grid (1 column on mobile, 2 columns on desktop), horizontal scrollable tables
- **Top performers only**: Top 20 months and Top 10 years to focus on significant events
- **Note integration**: Monthly records can display optional notes from snapshots with tooltip icon

**Mobile Optimizations:**

- **Responsive grid**: `grid-cols-1 lg:grid-cols-2` (single column on mobile, two columns on large screens)
- **Spacing**: `gap-4 sm:gap-6` for tighter spacing on mobile
- **Padding**: `p-4 sm:p-6 lg:p-8` for progressive padding scaling
- **Header**: Flexbox column on mobile (`flex-col sm:flex-row`), full-width button on mobile (`w-full sm:w-auto`)
- **Table columns**: Smaller rank column on mobile (`w-12 sm:w-16`), minimum widths to prevent excessive compression
- **Text sizing**: Responsive titles (`text-2xl sm:text-3xl`), responsive icons (`h-6 w-6 sm:h-8 sm:w-8`)
- **Horizontal scroll**: Tables wrapped in `max-h-[400px] overflow-y-auto` for long rankings

**Technical Implementation:**

- **Dual service pattern**: Client (`hallOfFameService.ts`) and server (`hallOfFameService.server.ts`) versions share identical calculation logic
- **Pre-calculated rankings**: Data computed once and cached in Firestore, page loads are instant (no expensive calculations)
- **Incremental updates**: Only recalculate when snapshots/expenses change (manual or cron-triggered)
- **Type safety**: Complete TypeScript interfaces in `types/hall-of-fame.ts`
- **Firestore collection**: `/hall-of-fame` with document ID = `userId`

---

## Current Status (Latest Session)

- **Architecture status**: Next.js App Router + Firebase + React Query + Recharts + Frankfurter API (external, no npm package).
- **Mobile optimizations**: Custom breakpoint `desktop: 1025px` fixes iPad Mini landscape navigation UI.
- **Responsive navigation**: iPad Mini landscape (1024px) now correctly displays mobile UI with hamburger menu.

## Implemented in This Session

- **iPad Mini Landscape Navigation UI Fix** (2025-12-29):
  - **Problem**: iPad Mini in landscape mode (1024px width) displayed desktop sidebar instead of mobile hamburger menu
  - **Root cause**: Tailwind `lg:` breakpoint uses `min-width: 1024px`, which **includes** 1024px (not exclusive)
  - **Solution**: Created custom breakpoint `desktop: 1025px` to replace `lg:` in navigation components
  - **Breakpoint definition**: Added `--breakpoint-desktop: 1025px` in `app/globals.css` using Tailwind v4 `@theme inline` syntax
  - **Files modified**: 4 files, 19 occurrences `lg:` → `desktop:`
    - `app/globals.css`: Added custom breakpoint (+2 lines)
    - `app/dashboard/layout.tsx`: 7 occurrences replaced (3 lines modified)
    - `components/layout/Sidebar.tsx`: 9 occurrences replaced (5 lines modified)
    - `components/layout/BottomNavigation.tsx`: 3 occurrences replaced (1 line modified)
  - **Key changes**:
    - `lg:hidden` → `desktop:hidden`
    - `max-lg:landscape:` → `max-desktop:landscape:`
    - `max-lg:portrait:` → `max-desktop:portrait:`
  - **Benefits**:
    - ✅ iPad Mini landscape (1024px) → Mobile landscape UI (hamburger menu)
    - ✅ Desktop (≥1025px) → Desktop UI (sidebar always visible)
    - ✅ Zero breaking changes for other breakpoints or components
    - ✅ Semantic naming (`desktop` more explicit than `lg`)
  - **Testing**: ✅ Build completed successfully, no compilation errors
  - **Documentation updated**: `CLAUDE.md` section "Mobile Optimizations" updated with new breakpoint and fix details

## Key Technical Decisions

- **Custom desktop breakpoint**: `desktop: 1025px` instead of `lg: 1024px` to fix iPad Mini landscape edge case
- **Tailwind v4 breakpoint syntax**: Custom breakpoints defined in `globals.css` with `@theme inline`, not in `tailwind.config.js`
- **Breakpoint choice**: 1025px ensures iPad Mini landscape (1024px) is treated as mobile, while desktop (≥1025px) gets full sidebar
- **Additive-only changes**: All optimizations use Tailwind responsive variants, zero breaking changes
- **Desktop preservation**: ≥1025px screens remain completely unchanged

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

## Recently Fixed Issues

- ✅ **iPad Mini landscape navigation** (2025-12-29): Fixed iPad Mini landscape (1024px) showing desktop sidebar instead of mobile hamburger menu - created custom breakpoint `desktop: 1025px` to replace `lg: 1024px`

---

*Auto-generated document - Version 1.0*
