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
- Automatic ranking updates with each new snapshot

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
- TER tracking with weighted portfolio average
- Manual price override for non-tradeable assets

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

*Auto-generated document - Version 1.0*
