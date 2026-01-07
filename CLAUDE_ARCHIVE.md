# CLAUDE_ARCHIVE.md - Storico Documentazione Portfolio Tracker

Questo file contiene lo storico di decisioni, implementazioni e dettagli rimossi da CLAUDE.md per mantenerlo lean e focalizzato sullo sviluppo corrente.

---

## Q4 2025 (Ottobre - Dicembre) + Inizio Q1 2026

### 📦 Implementazioni Completate

#### Asset Price History - 5 Tab Layout (31 Dicembre 2025)

**Feature 1 - Conditional Display Logic:**
- Assets with `price = 1` (e.g., cash, liquidity) automatically show `totalValue` instead of price in ALL tabs
- Unified logic: `displayMode === 'totalValue' || cell.price === 1`
- Applied to both "Prezzi" and "Valori" tabs for consistency

**Feature 2 - FilterStartDate Support:**
- New `AssetHistoryDateFilter` type: `{ year: number, month: number }`
- Filters snapshots from specific month onwards (e.g., November 2025 = real data start)
- Priority: `filterStartDate` > `filterYear` when both provided
- Logic: `if (year < filterYear) return false; if (year === filterYear && month < filterMonth) return false;`

**Feature 3 - Total Value Display Mode:**
- New `displayMode: 'price' | 'totalValue'` prop for AssetPriceHistoryTable
- When `displayMode = 'totalValue'`: Always shows totalValue for ALL assets
- Automatic total row calculation: Sums totalValue across all non-deleted assets
- Total row: Sticky bottom footer with background muted, excluded from lazy-loading

**Feature 4 - 5-Tab Layout:**
- **Tab 1 - Gestione Asset**: Unchanged (always mounted)
- **Tab 2 - Prezzi Anno Corrente**: filterYear=2025, displayMode="price", showTotalRow=false
- **Tab 3 - Prezzi Nov 2025+**: filterStartDate={year:2025, month:11}, displayMode="price", showTotalRow=false
- **Tab 4 - Valori Anno Corrente**: filterYear=2025, displayMode="totalValue", showTotalRow=true
- **Tab 5 - Valori Storici+**: filterStartDate={year:2025, month:11}, displayMode="totalValue", showTotalRow=true
- Responsive: Horizontal scroll mobile (<1025px), Grid 5-col desktop (≥1025px)

**Files modified** (4 files, ~205 lines added):
- `types/assets.ts`: +3 new types (AssetHistoryDisplayMode, AssetHistoryDateFilter, AssetHistoryTotalRow)
- `lib/utils/assetPriceHistoryUtils.ts`: +90 lines (filterStartDate, displayMode, totalRow calc, fallback totalValue)
- `components/assets/AssetPriceHistoryTable.tsx`: +40 lines (conditional display, TableFooter, total row rendering)
- `app/dashboard/assets/page.tsx`: +60 lines (5 tabs, responsive TabsList, icon imports)

**Testing**: `npm run build` successful (6.9s, zero TypeScript errors)

---

#### Dividend Income Separation in Performance Metrics (2 Gennaio 2026)

**Feature**: Separate dividend income from external income in performance calculations
- Dividends correctly treated as portfolio returns (not external contributions)
- Mathematical accuracy: ROI, CAGR, TWR, IRR, Sharpe Ratio, and Volatility aligned with CFA Institute standards
- Implementation: `dividendIncomeCategoryId` from user settings
- Filter logic: `type='income' && categoryId===dividendIncomeCategoryId`
- Backward compatible: If categoryId not set → legacy behavior (all income treated as external)

**Files Modified**:
- `types/performance.ts`: Added `dividendIncomeCategoryId` to PerformanceCalculationParams
- `performanceService.ts`: Implemented dividend filtering in cash flow calculations (lines 348-354)
- `app/dashboard/performance/page.tsx`: Updated UI to show dividend separation in Contributi Netti card

**Impact**:
- **Contributi Netti** card now shows: Entrate | Dividendi | Uscite
- Net cash flow correctly excludes dividends from external contributions
- All 6 performance metrics (ROI, CAGR, TWR, IRR, Sharpe, Volatility) now mathematically accurate

---

### 🎨 Mobile Optimizations (Dicembre 2025)

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

---

#### Settings Page Mobile Optimizations (Dicembre 2025)

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

### 🔧 Decisioni Tecniche Archiviate (Pre-Novembre 2025)

#### Asset Price History Data Source (30 Dicembre 2025)
**Decisione**: Use existing `MonthlySnapshot.byAsset[]` field instead of creating new data model
**Rationale**:
- Zero database migrations needed
- Data already available in snapshots
- No additional Firestore reads required
**Impact**: Simplified implementation, faster development

---

#### Reusable Table Component (30 Dicembre 2025)
**Decisione**: Single `AssetPriceHistoryTable` component with optional `filterYear` prop serves both "Current Year" and "Total History" tabs
**Rationale**:
- DRY principle - avoid code duplication
- Single source of truth for table logic
- Easier maintenance and bug fixes
**Implementation**: Pass `filterYear` prop, component filters internally

---

#### Color Coding Logic (30 Dicembre 2025)
**Decisione**: Sequential month-over-month comparison (not year-over-year) for price trend visualization
**Rationale**:
- More intuitive for users to see recent trends
- Immediate visual feedback on price movements
- Aligns with financial charting conventions
**Formula**: Compare current month vs previous month only

---

#### Lazy-Loading Tabs (30 Dicembre 2025)
**Decisione**: `mountedTabs` Set pattern - only render tab content after first user click
**Rationale**:
- Save memory/CPU on initial page load
- Most users don't visit all tabs
- Pattern proven successful in cashflow page
**Implementation**:
```typescript
const [mountedTabs, setMountedTabs] = useState(new Set(['tab1']));
// Render only if mounted
{mountedTabs.has('tab2') && <TabContent />}
```

---

#### Date Range Timestamp Precision (30 Dicembre 2025)
**Decisione**: Always use full timestamp `23:59:59.999` for `endDate` in range queries
**Rationale**:
- Include entire last day of period
- Default `00:00:00` excludes expenses after midnight
- Fixes €373,81 discrepancy found in testing
**Implementation**:
```typescript
endDate.setHours(23, 59, 59, 999);
```

---

#### Responsive Chart Height Pattern (30 Dicembre 2025)
**Decisione**: Duplicate `getChartHeight()` helper in each page instead of shared utility
**Rationale**:
- Function is trivial (3 lines)
- Only 2 pages use it
- Avoids unnecessary coupling
- Easier to customize per-page if needed
**Trade-off**: Minor code duplication vs cleaner architecture

---

#### Chart Formatter Consistency (30 Dicembre 2025)
**Decisione**: Use `formatCurrencyCompact()` for all Y-axis labels in monetary charts
**Rationale**:
- Compact notation (€1,5 Mln vs €1.234.567) prevents mobile chart compression
- Consistent visual language across all charts
- Aligns Performance page with History page pattern
- Industry standard in financial apps
**Implementation**: Applied to ~19 YAxis instances

---

#### Asset Price History Conditional Display (31 Dicembre 2025)
**Decisione**: Show `totalValue` when `displayMode === 'totalValue'` OR `cell.price === 1`
**Rationale**:
- Unified logic handles both "Valori" tabs (always totalValue) and "Prezzi" tabs
- Cash/liquidity assets (price=1) should show totalValue even in "Prezzi" tabs
- Prevents meaningless "€1" display
**Implementation**: [AssetPriceHistoryTable.tsx:142-145]

---

#### FilterStartDate Priority (31 Dicembre 2025)
**Decisione**: `filterStartDate` parameter takes precedence over `filterYear` when both provided
**Rationale**:
- Allows precise date filtering (e.g., November 2025+)
- Maintains backward compatibility with year-only filtering
- More flexible for future use cases
**Implementation**: Early return in filter logic [assetPriceHistoryUtils.ts:130-138]

---

#### Total Row Asset Filtering (31 Dicembre 2025)
**Decisione**: Exclude assets with `isDeleted: true` from total row calculations
**Rationale**:
- Sold assets don't contribute to current portfolio value
- Still appear in table for historical transparency
- Avoids inflating totals with assets no longer held
**Implementation**: Filter before summing [assetPriceHistoryUtils.ts:272]

---

#### Color Coding Metric Consistency (31 Dicembre 2025)
**Decisione**: Always compare same metric for month-over-month changes
**Rationale**:
- price vs previousPrice when `displayMode='price'`
- totalValue vs previousTotalValue when `displayMode='totalValue'`
- Prevents meaningless comparisons between different magnitudes
- Ensures percentage changes are accurate
**Example**: €50 price vs €40,000 totalValue would be invalid comparison
**Implementation**: [assetPriceHistoryUtils.ts:228-231]

---

#### TotalValue Fallback Calculation (31 Dicembre 2025)
**Decisione**: Calculate `totalValue = price × quantity` on-the-fly for old snapshots missing the field
**Rationale**:
- Backward compatibility with snapshots created before totalValue field added
- Transparent to users
- No database migration needed
**Implementation**: [assetPriceHistoryUtils.ts:225]

---

#### Five-Tab Responsive Layout (31 Dicembre 2025)
**Decisione**: Asset Price History page uses horizontal scroll on mobile (<1025px) and grid 5-column layout on desktop (≥1025px)
**Rationale**:
- 5 tabs don't fit in mobile viewport
- Horizontal scroll is industry standard (iOS/Android apps)
- Desktop has space for full grid
**Implementation**: `overflow-x-auto` + `desktop:grid desktop:grid-cols-5` [assets/page.tsx]

---

### 🐛 Bug Risolti (Q4 2025)

#### Dividend Income Incorrectly Treated as External Contributions (2 Gennaio 2026)
**Problema**: Dividends were being subtracted from returns as if they were salary contributions instead of counted as portfolio returns
**Causa**: No separation between dividend income and external income in performance calculations
**Fix**: Implemented `dividendIncomeCategoryId` filtering - dividends now correctly treated as portfolio returns
**Impatto**: All 6 metrics (ROI, CAGR, TWR, IRR, Sharpe, Volatility) now aligned with CFA Institute standards
**Files Modified**: 3 files (`types/performance.ts`, `performanceService.ts`, `performance/page.tsx`)

---

#### Performance Chart Y-axis Visibility (30 Dicembre 2025)
**Problema**: Y-axis labels too wide (€1.234.567) compressed mobile charts
**Causa**: Using full currency format with no abbreviation
**Fix**: Replaced `formatCurrency()` with `formatCurrencyCompact()` - new format (€1,5 Mln) compact and readable
**Files Modified**: 2 lines in `performance/page.tsx`

---

#### Performance Metrics Timestamp Bug (30 Dicembre 2025)
**Problema**: €373,81 discrepancy between Performance and Cashflow pages
**Causa**: `endDate` using `00:00:00` instead of `23:59:59.999`, excluding expenses after midnight on last day
**Fix**: Set full timestamp to include entire day
**Files Modified**: 3 lines in `performanceService.ts`

---

#### iPad Mini Landscape Navigation (29 Dicembre 2025)
**Problema**: iPad Mini landscape (1024px) showing desktop sidebar instead of mobile hamburger menu
**Causa**: Default `lg: 1024px` breakpoint treats 1024px as desktop
**Fix**: Created custom breakpoint `desktop: 1025px` to replace `lg: 1024px`
**Impatto**: iPad Mini landscape (1024x768) now correctly displays mobile landscape UI

---

### 📚 Architectural Choices Storiche (da Tech Stack)

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

*Fine archivio Q4 2025 + inizio Q1 2026*
