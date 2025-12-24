# AI Agent Guidelines for Code Development

This document provides instructions for AI agents working on the **Net Worth Tracker** codebase—a Next.js 16 + Firebase portfolio management application. Follow these principles when proposing new code or modifying existing code.

## General Principles

### Readability and Maintainability
- Use descriptive names for variables, functions, and classes
- Avoid ambiguous abbreviations
- Write code that is self-documenting where possible
- Structure code for clarity and ease of understanding

### SOLID Principles
- **Single Responsibility Principle**: Each component/function should have one clear purpose
  - ✅ `AuthProvider` (contexts/AuthContext.tsx) - handles only authentication logic
  - ✅ `formatCurrency()` (lib/utils/formatters.ts) - formats currency values only
  - ✅ `ProtectedRoute` (components/ProtectedRoute.tsx) - guards routes, nothing else
- **Open/Closed Principle**: Use TypeScript interfaces and composition for extensibility
  - ✅ `Asset` interface (types/assets.ts) can be extended for new asset types
  - ✅ Color functions (lib/constants/colors.ts) accept any asset class string
- **Liskov Substitution Principle**: Use composition over inheritance (React patterns)
  - ✅ Component composition preferred over class inheritance
- **Interface Segregation Principle**: Keep interfaces focused and minimal
  - ✅ `AssetFormData` (types/assets.ts:24) - simplified for form input
  - ✅ `User` (types/assets.ts:79) - contains only auth-relevant fields
- **Dependency Inversion Principle**: Depend on abstractions via Context API and utility modules
  - ✅ Components use `useAuth()` hook instead of direct Firebase calls
  - ✅ Firebase config centralized in `lib/firebase/config.ts`

### DRY (Don't Repeat Yourself)
- Centralize formatting logic in `lib/utils/formatters.ts` for currency, dates, percentages
- Extract constants to dedicated files (e.g., `lib/constants/colors.ts`)
- **Example**: Instead of `new Intl.NumberFormat('it-IT', {...})` everywhere, use `formatCurrency(amount)`

### Compact Functions
- Target: 5-15 lines per function (see `formatters.ts` for examples)
- Functions doing one thing: `formatCurrency()`, `formatPercentage()`, `formatDate()`
- Component functions should render UI or manage state, not both
- If a useEffect does multiple things, split into separate effects

### Error Handling
- **Pattern**: Try-catch with user-friendly toast notifications (requires `sonner` library)
- **Example from Header.tsx:21-28**:
  ```typescript
  try {
    await signOut();
    toast.success('Logout effettuato con successo');
    router.push('/login');
  } catch (error) {
    toast.error('Errore durante il logout');
  }
  ```
- **Future API routes**: Return structured errors with HTTP status codes

### Testing
- **Current Status**: No tests yet (⚠️ to be implemented)
- **Recommended Stack**: Jest + React Testing Library for components, Playwright for E2E
- **Priority Areas**: Test utility functions (formatters, calculations), authentication flows
- When adding tests, place in `__tests__` folders adjacent to source files

### Style Conventions
- **Linter**: ESLint (Next.js config)
- **Formatter**: Follow Next.js/React conventions (run `npm run lint`)
- **Indentation**: 2 spaces (TypeScript/TSX files)
- **Client Components**: Add `'use client';` directive at top of file when using hooks/browser APIs
- **Import Order**: External deps → internal `@/` imports → types → styles

---

## Comment Guidelines

**IMPORTANT: All comments must be written in English.**

This codebase follows a **"self-documenting code first"** philosophy. Comments are sparse but high-quality—used only when code alone cannot convey intent. Current usage:
- **9 JSDoc blocks** in utility modules (`formatters.ts`, `colors.ts`)
- **6 inline comments** for non-obvious code (type conversions, Firebase quirks)
- **0 trivial/redundant comments** (❌ avoid `// increment i`)

Use comments strategically to make the codebase more accessible and maintainable.

### Recommended Comment Types

#### 1. Function Comments
Document the interface of **public utility functions** and **exported modules**.

**When to Use:**
- ✅ Functions in `lib/` that are reused across the app
- ✅ Complex calculations or transformations
- ❌ Simple React components (component name should be self-explanatory)
- ❌ One-liner functions

**Project Example (lib/utils/formatters.ts:4-9)**:
```typescript
/**
 * Format a number as currency (Italian format)
 * @param amount - The amount to format
 * @param currency - The currency code (default: EUR)
 * @returns Formatted currency string
 */
export function formatCurrency(amount: number, currency: string = 'EUR'): string {
  return new Intl.NumberFormat('it-IT', {
    style: 'currency',
    currency: currency,
  }).format(amount);
}
```

**Pattern**: Use JSDoc with `@param` and `@returns` tags. Keep descriptions concise.

#### 2. Design Comments
Explain **architectural decisions** and **non-obvious patterns**.

**Current Usage**: ⚠️ Rare in this codebase (could be improved)

**When to Add**:
- At the top of service layer files (when implemented)
- In complex state management logic
- When implementing patterns that differ from Next.js defaults

**Recommended Example (for future API routes)**:
```typescript
/**
 * Price Update API Route
 *
 * This endpoint updates asset prices from Yahoo Finance.
 * Designed to be called by:
 * 1. Manual user trigger (Update Prices button)
 * 2. Vercel Cron job (end-of-month automated update)
 *
 * We batch all updates in a single Firestore transaction to ensure
 * atomic updates and avoid partial state if Yahoo Finance API fails.
 */
```

**Placement**: Top of file or major code blocks

#### 3. Why Comments
Explain **WHY** the code does something, not **WHAT** it does.

**Project Example (lib/firebase/admin.ts:13)**:
```typescript
privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n'),
```
**Why comment (currently missing, should add)**:
```typescript
// Firebase Admin SDK requires actual newlines in private key,
// but environment variables escape them as \\n
privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n'),
```

**Another Example (contexts/AuthContext.tsx:50-56)**:
```typescript
// Convert Firebase user to our User type
const userData: User = {
  uid: firebaseUser.uid,
  email: firebaseUser.email,
  displayName: firebaseUser.displayName,
};
```
✅ Good: Explains **why** we transform the Firebase type instead of using it directly

**When to Use**: Clarify business rules, workarounds, or non-obvious decisions

#### 4. Teacher Comments
Educate readers about **domain-specific financial concepts**.

**Current Usage**: ✅ Used in performance metrics service (performanceService.ts)

**Example from Performance Metrics** (lib/services/performanceService.ts):
```typescript
/**
 * Calculate Time-Weighted Return (TWR) - preferred metric for portfolio performance.
 *
 * TWR uses geometric linking to eliminate the effect of cash flow timing:
 * For each month: Ri = (End NW - Cash Flow) / Start NW - 1
 * TWR = [(1 + R1) × (1 + R2) × ... × (1 + Rn)] - 1
 * Annualized TWR = (1 + TWR)^(12/months) - 1
 *
 * This metric is superior to simple ROI because it isolates investment
 * performance from the timing of contributions/withdrawals.
 */
export function calculateTimeWeightedReturn(
  snapshots: MonthlySnapshot[],
  cashFlows: CashFlowData[]
): number | null {
  // Implementation...
}

/**
 * Calculate Money-Weighted Return (IRR) using Newton-Raphson method.
 *
 * IRR finds the discount rate where NPV of all cash flows equals zero:
 * NPV = -Start NW + Σ(CFi / (1+r)^ti) + End NW / (1+r)^T = 0
 *
 * Newton-Raphson iteration: rn+1 = rn - NPV(rn) / NPV'(rn)
 * Converges in ~100 iterations for typical portfolios.
 *
 * Unlike TWR, IRR shows the actual investor return considering when
 * money was added/withdrawn (useful for self-assessment).
 */
export function calculateIRR(
  startNW: number,
  endNW: number,
  cashFlows: CashFlowData[],
  numberOfMonths: number
): number | null {
  // Implementation with Newton-Raphson solver...
}

/**
 * Calculate Sharpe Ratio - risk-adjusted performance metric.
 *
 * Formula: (Portfolio Return - Risk-Free Rate) / Portfolio Volatility
 *
 * Interpretation:
 * - Sharpe > 1.0: Good risk-adjusted returns
 * - Sharpe > 2.0: Excellent risk-adjusted returns
 * - Sharpe < 0: Portfolio underperforms risk-free rate
 *
 * Risk-free rate retrieved from user's asset allocation settings.
 */
```

**Other Financial Concepts**:
```typescript
/**
 * Calculate asset allocation using the target percentage method.
 *
 * This compares current holdings against user-defined targets to suggest
 * rebalancing actions (COMPRA/VENDI/OK).
 *
 * The "4% rule" for FIRE calculations assumes a 4% annual withdrawal rate
 * from a diversified portfolio to sustain retirement indefinitely.
 * Reference: Trinity Study (1998)
 */
```

**When to Use**: Explain financial concepts (ROI, CAGR, TWR, IRR, Sharpe Ratio, FIRE, asset allocation), complex algorithms (Newton-Raphson), or Firebase patterns

#### 5. Guide Comments
Help readers navigate **complex setup sequences** or **multi-step processes**.

**Current Usage**: ⚠️ None (not needed in current simple components)

**Recommended Usage** (for future Firebase setup or data migrations):
```typescript
// Step 1: Initialize Firebase connection
const app = initializeApp(firebaseConfig);

// Step 2: Set up authentication listener
onAuthStateChanged(auth, handleAuthChange);

// Step 3: Create user document if first login
if (!userDoc.exists()) {
  await createUserDocument(user);
}
```

**When to Use**: Multi-step initialization, data migrations, complex async workflows

#### 6. Checklist Comments
Remind developers of **cross-file dependencies**.

**Current Usage**: ⚠️ None yet

**Recommended Usage** (when adding asset types):
```typescript
// types/assets.ts
// ⚠️ WARNING: If you add a new AssetClass here, also update:
// - lib/constants/colors.ts (add color mapping)
// - README.md (update asset class documentation)
export type AssetClass = 'equity' | 'bonds' | 'crypto' | 'realestate' | 'cash' | 'commodity';
```

**When to Use**: Enums, constants, or configs that require updates in multiple files

---

### Comments to Avoid

#### ❌ Trivial Comments
**Status**: ✅ None found in codebase (keep it this way!)

**Bad Example:**
```typescript
// Set loading to true
setLoading(true);
```

**Why**: The code is self-explanatory. Maintain this standard.

#### ❌ Debt Comments (TODO/FIXME)
**Status**: ✅ None found in code files (only in README.md for roadmap)

**Policy**: Use GitHub Issues instead of inline TODOs
- ✅ Roadmap items belong in README.md
- ❌ Avoid `// TODO: fix this later` in code
- If absolutely necessary, include issue number: `// TODO(#42): implement caching`

#### ❌ Backup Comments
**Status**: ✅ None found (excellent!)

**Policy**: Never commit commented-out code
- Use Git history for old versions
- Delete dead code instead of commenting it out
- Exception: Temporarily during debugging (must be removed before commit)

---

## Project-Specific Guidelines

This section documents patterns and conventions unique to the Net Worth Tracker application.

### Architecture Overview

**Tech Stack**:
- **Framework**: Next.js 16 (App Router) + TypeScript 5
- **Database**: Firebase Firestore (NoSQL)
- **Authentication**: Firebase Auth (email/password + Google OAuth)
- **State Management**: @tanstack/react-query (server state), React Context (auth state)
- **UI**: Tailwind CSS + shadcn/ui components
- **Charts**: Recharts library
- **Deployment**: Vercel (serverless functions + edge runtime)

**Directory Structure**:
```
app/               # Next.js App Router pages
  ├── (auth)/      # Auth-related pages (login, register)
  ├── dashboard/   # Protected dashboard pages
  └── api/         # API routes (future)
components/        # Reusable React components
  ├── ui/          # shadcn/ui primitives
  └── layout/      # Layout components (Header, Sidebar)
contexts/          # React Context providers (AuthContext)
lib/               # Utility modules and services
  ├── firebase/    # Firebase configuration
  ├── constants/   # App constants (colors, etc.)
  └── utils/       # Helper functions (formatters, etc.)
types/             # TypeScript type definitions
```

**Key Architectural Patterns**:
1. **Context API for Global State**: `AuthContext` provides user state to entire app
2. **Protected Routes**: `ProtectedRoute` component wraps authenticated pages
3. **Centralized Utilities**: All formatting logic in `lib/utils/formatters.ts`
4. **Type Safety**: Strict TypeScript with interfaces in `types/assets.ts`

### Italian Localization

**IMPORTANT**: This app is designed for Italian users with specific formatting requirements.

**Number Formatting** (use `formatters.ts` functions):
```typescript
// ✅ Correct - Italian format: €1.234,56
formatCurrency(1234.56); // Uses Intl.NumberFormat('it-IT')

// ❌ Wrong - Don't use raw Intl.NumberFormat everywhere
new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(amount);
```

**Date Formatting**:
```typescript
// ✅ Correct - Italian format: 31/12/2024
formatDate(new Date()); // DD/MM/YYYY

// ✅ With time: 31/12/2024 15:30
formatDateTime(new Date());
```

**UI Language**:
- Primary language: **Italian** for all user-facing strings
- Technical terms: English is acceptable (ETF, FIRE, etc.)
- Action labels: Italian (`COMPRA`, `VENDI`, `OK` for rebalancing actions)
- Toast messages: Italian (`toast.success('Logout effettuato con successo')`)

### Firebase Patterns

**Client-Side Firebase** (`lib/firebase/config.ts`):
```typescript
// ✅ Singleton pattern - only initialize once
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
```

**Server-Side Firebase** (`lib/firebase/admin.ts`):
```typescript
// ✅ Admin SDK for API routes (future)
// Note: Private key env var requires newline replacement
privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n'),
```

**Firestore Data Access**:
- All queries must filter by `userId` for security
- Use `doc()` for single documents, `collection()` for queries
- Timestamps: Store as Firestore `Timestamp`, convert to `Date` in UI

**Security Rules Philosophy**:
- Users can only read/write their own data
- Price history is read-only (updated by backend only)

### Next.js App Router Conventions

**Client vs Server Components**:
```typescript
// ✅ Add 'use client' when using hooks or browser APIs
'use client';

import { useState } from 'react';
```

**When to Use**:
- ✅ Components using `useState`, `useEffect`, `useContext`
- ✅ Components with event handlers (`onClick`, `onChange`)
- ✅ Components using browser APIs (`localStorage`, `window`)
- ❌ Static pages, layouts without interactivity (default to Server Components)

**File-Based Routing**:
- `app/dashboard/page.tsx` → `/dashboard`
- `app/dashboard/layout.tsx` → Layout wrapping all `/dashboard/*` pages
- `app/api/prices/route.ts` → `/api/prices` endpoint (future)

### shadcn/ui Component Usage

**Import Pattern**:
```typescript
// ✅ Always import from @/components/ui
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
```

**Customization**:
- Modify Tailwind classes directly on components (don't create wrappers)
- Use `cn()` utility for conditional classes: `cn('base-class', condition && 'conditional-class')`

**Tooltip Pattern** (Important):
If Radix UI Tooltip has positioning issues, use custom implementation:
```typescript
// ✅ Custom tooltip with click interaction and proper positioning
const [showTooltip, setShowTooltip] = useState(false);
const tooltipRef = useRef<HTMLDivElement>(null);

// Click-outside detection
useEffect(() => {
  const handleClickOutside = (event: MouseEvent) => {
    if (tooltipRef.current && !tooltipRef.current.contains(event.target as Node)) {
      setShowTooltip(false);
    }
  };
  if (showTooltip) {
    document.addEventListener('mousedown', handleClickOutside);
  }
  return () => document.removeEventListener('mousedown', handleClickOutside);
}, [showTooltip]);

// JSX
<div className="relative" ref={tooltipRef}>
  <button onClick={() => setShowTooltip(!showTooltip)}>
    <HelpCircle className="h-4 w-4" />
  </button>
  {showTooltip && (
    <div className="absolute right-0 top-6 z-50 w-72 rounded-md border bg-popover px-3 py-2 text-sm shadow-md">
      <p>{tooltipContent}</p>
    </div>
  )}
</div>
```
See `components/performance/MetricCard.tsx` for full implementation.

### React Query Data Fetching Patterns

**Pattern** (server state management with automatic caching):

This app uses **@tanstack/react-query** for server state management (Firestore data), separate from React Context which handles auth state.

**When to Use React Query**:
- ✅ Fetching Firestore collections/documents (expenses, categories, assets, snapshots)
- ✅ Data that needs caching to prevent duplicate requests
- ✅ Data shared across multiple components/tabs
- ❌ Local UI state (use `useState`)
- ❌ Authentication state (use `AuthContext`)

**Step 1: Centralized Query Keys** (`lib/query/queryKeys.ts`)

```typescript
export const queryKeys = {
  expenses: {
    all: (userId: string) => ['expenses', userId] as const,
    categories: (userId: string) => ['expense-categories', userId] as const,
  },
  assets: {
    all: (userId: string) => ['assets', userId] as const,
  },
} as const;
```

**Why**: Centralized keys prevent typos and enable type-safe cache invalidation.

**Step 2: Custom Hook Wrapping Service** (`lib/hooks/useExpenses.ts`)

```typescript
'use client';

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/queryKeys';
import { getAllExpenses } from '@/lib/services/expenseService';

export function useExpenses(userId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.expenses.all(userId || ''),
    queryFn: () => getAllExpenses(userId!),
    enabled: !!userId, // Only run when user is authenticated
  });
}
```

**Key Configuration**:
- `enabled: !!userId` - Prevents query when user not authenticated
- No `staleTime` - Uses React Query defaults (immediate background refetch on focus)
- Service layer (`getAllExpenses`) handles Firestore logic

**Step 3: Use Hook in Component**

```typescript
'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useExpenses } from '@/lib/hooks/useExpenses';

export function MyComponent() {
  const { user } = useAuth();
  const { data: expenses = [], isLoading } = useExpenses(user?.uid);

  if (isLoading) return <LoadingSpinner />;

  return <div>{/* Render expenses */}</div>;
}
```

**Benefits**:
- Automatic caching (no duplicate requests)
- Auto-refetch on window focus (data freshness)
- Shared cache across components (no prop drilling needed)
- Loading/error states built-in

**Step 4: Cache Invalidation on Mutations**

```typescript
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/queryKeys';

const queryClient = useQueryClient();

const handleRefresh = async () => {
  await queryClient.invalidateQueries({
    queryKey: queryKeys.expenses.all(user?.uid || ''),
  });
};
```

**When to Invalidate**:
- After create/update/delete operations
- When forcing a manual refresh
- Global invalidation updates all components using the same query

**Current Implementations**:
- ✅ `useExpenses()` - Expense tracking data
- ✅ `useExpenseCategories()` - Category data
- ✅ `useAssets()` - Portfolio assets (with mutations: `useCreateAsset`, `useUpdateAsset`, `useDeleteAsset`)
- ✅ `useSnapshots()` - Historical net worth snapshots

**Example from Codebase** (app/dashboard/cashflow/page.tsx):
```typescript
const { user } = useAuth();
const queryClient = useQueryClient();

// React Query replaces manual useState + useEffect
const { data: allExpenses = [], isLoading: expensesLoading } = useExpenses(user?.uid);
const { data: categories = [], isLoading: categoriesLoading } = useExpenseCategories(user?.uid);

const loading = expensesLoading || categoriesLoading;

const handleRefresh = async () => {
  // Invalidate caches instead of manual refetch
  await queryClient.invalidateQueries({ queryKey: queryKeys.expenses.all(user?.uid || '') });
  await queryClient.invalidateQueries({ queryKey: queryKeys.expenses.categories(user?.uid || '') });
};
```

### Error Handling with Toasts

**Pattern** (using `sonner` library):
```typescript
import { toast } from 'sonner';

try {
  await dangerousOperation();
  toast.success('Operazione completata con successo');
} catch (error) {
  toast.error('Errore durante l\'operazione');
  console.error('Detailed error:', error); // Log details for debugging
}
```

**Guidelines**:
- User-facing messages in Italian
- Generic error messages (don't expose technical details)
- Log full error to console for debugging
- Use `toast.loading()` for long operations

### Color Conventions

**Asset Class Colors** (from `lib/constants/colors.ts`):
```typescript
ASSET_CLASS_COLORS = {
  equity: '#3B82F6',      // blue
  bonds: '#EF4444',       // red
  crypto: '#F59E0B',      // amber
  realestate: '#10B981',  // green
  cash: '#6B7280',        // gray
  commodity: '#92400E',   // brown
}
```

**Usage**:
```typescript
// ✅ Use helper function
import { getAssetClassColor } from '@/lib/constants/colors';
const color = getAssetClassColor('equity');

// ❌ Don't hardcode colors
const color = '#3B82F6';
```

---

## Language-Specific Notes

### TypeScript
- **Strict Mode**: Enabled (`tsconfig.json`)
- **Type Inference**: Prefer explicit types for function signatures, allow inference for variables
- **Interfaces vs Types**: Use `interface` for object shapes, `type` for unions/aliases
- **Avoid `any`**: Use `unknown` or proper types instead

**Example**:
```typescript
// ✅ Good - explicit return type
export function formatCurrency(amount: number, currency: string = 'EUR'): string {
  // ...
}

// ❌ Bad - any type
const data: any = fetchData();
```

### React (v19)
- **Hooks**: Follow Rules of Hooks (only at top level, only in React functions)
- **State Updates**: Use functional updates for state depending on previous value
- **useEffect**: Include all dependencies in dependency array
- **Keys**: Use stable IDs for list items (not array index)

**Example**:
```typescript
// ✅ Good - functional state update
setCount(prevCount => prevCount + 1);

// ❌ Bad - closure stale value
setCount(count + 1);
```

### Tailwind CSS
- **Utility-First**: Prefer utility classes over custom CSS
- **Responsive**: Use responsive prefixes (`md:`, `lg:`) for breakpoints
- **Dark Mode**: Not implemented yet (use `next-themes` when needed)

---

## Quick Reference

**Common Commands**:
```bash
npm run dev          # Start development server (localhost:3000)
npm run build        # Build for production
npm run lint         # Run ESLint
```

**Development Checklist**:
- [ ] Add `'use client'` to components using hooks/browser APIs
- [ ] Use `formatCurrency()` for all currency displays (Italian format)
- [ ] User-facing strings must be in Italian
- [ ] Add JSDoc comments to utility functions in `lib/`
- [ ] Import UI components from `@/components/ui`
- [ ] Filter Firestore queries by `userId` for security
- [ ] Use `toast.success()`/`toast.error()` for user feedback
- [ ] Run `npm run lint` before committing

**Key File References**:
- Type definitions: `types/assets.ts`, `types/performance.ts`
- Formatting utilities: `lib/utils/formatters.ts`
- Color constants: `lib/constants/colors.ts`
- Auth context: `contexts/AuthContext.tsx`
- Firebase config: `lib/firebase/config.ts`
- Performance calculations: `lib/services/performanceService.ts`
- Chart utilities: `lib/services/chartService.ts`

**Adding New Features**:
1. Define types in `types/` (create new file if needed, e.g., `types/performance.ts`)
2. Create service layer in `lib/services/` (business logic, Firestore queries, calculations)
3. Create React Query hook in `lib/hooks/` if data needs caching (wrap service with useQuery)
4. Add query key to `lib/query/queryKeys.ts` for centralized cache management
5. Build reusable UI components in `components/` (organized by feature)
6. Create main page in `app/dashboard/` (authenticated) or `app/` (public)
7. Update navigation in `components/layout/Sidebar.tsx` and `SecondaryMenuDrawer.tsx`
8. Use `ProtectedRoute` for authenticated pages (automatic via dashboard layout)
9. Test manually (no automated tests yet)

**Example: Performance Metrics Feature Implementation**
```
1. Created types/performance.ts with:
   - TimePeriod, PerformanceMetrics, CashFlowData interfaces

2. Created lib/services/performanceService.ts with:
   - calculateROI(), calculateCAGR(), calculateTimeWeightedReturn()
   - calculateIRR() (Newton-Raphson solver)
   - calculateSharpeRatio(), calculateVolatility()
   - preparePerformanceChartData()

3. Created components/performance/:
   - MetricCard.tsx (reusable metric display with tooltip)
   - CustomDateRangeDialog.tsx (date range picker)
   - PerformanceTooltip.tsx (chart tooltip)

4. Created app/dashboard/performance/page.tsx:
   - Period selector tabs (YTD, 1Y, 3Y, 5Y, ALL, CUSTOM)
   - 8 metric cards grid
   - 2 charts (Net Worth Evolution, Rolling CAGR)
   - Methodology explanation section

5. Updated navigation:
   - Added TrendingUp icon to Sidebar.tsx
   - Added Performance link to SecondaryMenuDrawer.tsx
```

---

## Conclusion

These guidelines aim to maintain high code quality and readability in the **Net Worth Tracker** application. When in doubt:
1. **Prioritize clarity over cleverness** - Simple code is maintainable code
2. **Follow existing patterns** - Check similar components/utilities before inventing new approaches
3. **Consult README.md** - Detailed architecture and design decisions documented there
4. **Think in Italian** - User-facing text must be in Italian (it-IT locale)

**Golden Rule**: Code should be self-documenting through clear naming. Add comments only when code alone cannot explain **why** something is done a certain way.

Remember: This is a portfolio tracking app for Italian investors. Every feature should serve the core goal of managing asset allocations and tracking net worth over time.