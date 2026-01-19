# AI Agent Guidelines - Net Worth Tracker (Lean)

Project-specific conventions and recurring pitfalls for Net Worth Tracker.
For architecture and status, see [CLAUDE.md](CLAUDE.md).

---

## Critical Conventions

### Italian Localization
- All user-facing text in Italian
- Use `formatCurrency()` for EUR formatting (e.g. €1.234,56)
- Use `formatDate()` for DD/MM/YYYY format
- **All code comments in English only**

### Firebase Date Handling & Timezone
- Always use `toDate()` from `lib/utils/dateHelpers.ts`
- API responses serialize Firestore Timestamps as ISO strings
- Never use manual `instanceof Date` checks on API data
- **For month/year extraction**: Use `getItalyMonth()`, `getItalyYear()`, `getItalyMonthYear()` (not `Date.getMonth()`)
- **Ensures consistency**: Server (UTC) and client (browser) produce same results

### Custom Tailwind Breakpoint
- Use `desktop:` (1025px) instead of `lg:` (1024px)
- Define in `app/globals.css` with `@theme inline`

---

## Key Patterns

### React Query Cache Invalidation
Invalidate all related caches (direct + indirect) after mutations.
```typescript
onSuccess: () => {
  queryClient.invalidateQueries({ queryKey: queryKeys.snapshots.all(userId) });
  queryClient.invalidateQueries({ queryKey: queryKeys.assets.all(userId) });
}
```

### Lazy-Loading Tabs (mountedTabs)
Never remove from `mountedTabs` once added to preserve state.

### Date Range Queries (Firestore)
End date must include full day:
```typescript
const endDate = new Date(year, month, 0, 23, 59, 59, 999);
```

### Hall of Fame Annual Rankings
Include years that have expenses even if they have fewer than 2 snapshots (NW diff stays 0).

### Asset Price History %
For assets with `price === 1` or `displayMode === 'totalValue'`, compute % using total value.

### Borsa Italiana Scraper
- ETF and Stock tables have different structures
- Pass `assetType` to `scrapeDividendsByIsin(asset.isin, asset.type)`

### Currency Conversion (Dividends)
- Use `currencyConversionService.ts` (Frankfurter API)
- Cache 24h and store `exchangeRate` for audit

### Chart Y Axis
Use `formatCurrencyCompact()` for Y axis labels on mobile to avoid layout compression.

### Chart Data Preparation (chartService)
Functions in `lib/services/chartService.ts` (e.g., `prepareNetWorthHistoryData()`) already include all relevant fields from snapshots (note, month, year). Always check the prepared data structure before implementing additional filtering or matching logic.

### Dividend Calendar Date Filtering
When implementing calendar views for dividends:
- Use `paymentDate` for calendar display (when money arrives)
- Use `paymentDate` for date range filters (not `exDate`)
- Users care about cash arrival dates, not technical ex-dividend dates

### YOC (Yield on Cost) and Current Yield Calculation Pattern
When implementing dividend yield metrics (YOC, Current Yield):
- **Annualization**: < 12 months scale up `(dividends / months) × 12`, >= 12 months average `dividends / (months / 12)`
- **YOC cost basis**: Only include assets with `quantity > 0` and `averageCost > 0` (excludes sold assets)
- **Current Yield portfolio value**: Only include assets with `quantity > 0` and `currentPrice > 0` that paid dividends
- **Currency**: Prefer `grossAmountEur ?? grossAmount` for multi-currency portfolios
- **Filter dividends**: Use `paymentDate` not `exDate` (consistent with calendar)
- **Architecture**: Use API route pattern due to server-only dividend service constraints
- **Difference**: YOC uses `quantity × averageCost` (original cost), Current Yield uses `quantity × currentPrice` (market value)

### Time-Sensitive Metrics Pattern
When implementing metrics requiring "as of today" data filtering:
- **Separate date parameters**: Use dedicated `*EndDate` field capped at TODAY, don't modify global `endDate`
- **Example**: YOC uses `dividendEndDate = min(endDate, today)` while other metrics use original `endDate`
- **Rationale**: Snapshot-based metrics (ROI, CAGR, TWR) need end-of-period dates; dividend metrics need actual received data
- **Architecture**: Add to type interface, calculate in service, pass through API, document in JSDoc
- **Zero regression**: Keeps existing metrics unchanged while adding time-aware filtering

### Table Totals Row Pattern
For filtered tables showing totals:
- Use `<TableFooter>` (not `<TableBody>`) for semantic HTML
- Calculate totals on **all filtered data**, not just current page
- Use optional props with defaults: `showTotals?: boolean = false`
- Always use EUR amounts for multi-currency totals (`netAmountEur ?? netAmount`)

### Expense Amount Sign Convention
When working with expense data for calculations (cashflow, savings, etc.):
- **Income**: Stored as POSITIVE values in database
- **Expenses**: Stored as NEGATIVE values in database
- **Net Savings formula**: `sum(income) + sum(expenses)` (NOT `income - expenses`)
- **Why**: Simplifies aggregation, consistent across app (see TotalHistoryTab.tsx)
- **Example**: Income €1000 + Expense -€400 = Net €600

### Sankey Diagram Multi-Layer Pattern
When implementing complex data flow visualizations:
- **4-layer structure**: Income → Budget → Types → Categories + Savings
- **Multi-mode drill-down**: Support 4 modes (budget, type drill-down, category drill-down, transactions)
- **State management**: Use `mode` field + `parentType`/`parentCategory` to preserve navigation context
- **Conditional rendering**: Wrap Nivo components to prevent crashes with empty data
  - Pattern: `{mode !== 'transactions' && <ResponsiveSankey ... />}`
  - Never render heavy chart components with empty datasets
- **Early exit conditions**: Exclude special modes (e.g., transactions) from data validation checks
- **valueFormat prop**: Use for consistent number formatting in tooltips AND links (Nivo applies globally)
- **Color derivation**: Use `deriveSubcategoryColors()` for child node colors from parent
- **Mobile filtering**: Apply aggressive filtering (top 3-4 per parent) to prevent overcrowding
- **Transaction integration**: Reuse filtering logic from parent components (e.g., CurrentYearTab pattern)
- **Example**: CashflowSankeyChart with 4 modes + transaction table integration

### Settings Service Synchronization Pattern
When adding new fields to settings/configuration types:
- **Three-place rule**: ALL fields in settings types must be handled in THREE places
  1. Type definition (e.g., `AssetAllocationSettings` in `types/assets.ts`)
  2. `getSettings()` function to read from database
  3. `setSettings()` function to save to database
- **Firestore merge mode**: Use `if (field !== undefined)` checks in setSettings to preserve existing fields
- **Example pattern**:
```typescript
// 1. Type definition
export interface AssetAllocationSettings {
  includePrimaryResidenceInFIRE?: boolean;
}

// 2. getSettings()
return {
  includePrimaryResidenceInFIRE: data.includePrimaryResidenceInFIRE,
  // ... other fields
};

// 3. setSettings()
if (settings.includePrimaryResidenceInFIRE !== undefined) {
  docData.includePrimaryResidenceInFIRE = settings.includePrimaryResidenceInFIRE;
}
```
- **Why critical**: Omitting service layer updates causes settings to not persist across reloads
- **Prevention**: Mental checklist when adding any settings field

---

### Component Unmounting & Dialog State
When implementing dialogs in conditionally rendered components:
- Dialog state in a component is lost when the component unmounts
- Avoid auto-switching parent view modes that unmount the dialog's parent
- Example: Calendar click should NOT auto-switch to table if dialog is in calendar component
- Solution: Keep dialog state in parent, or avoid unmounting during interaction

### Server-Only Module Constraints (Firebase)
When implementing features requiring Firebase data access:
- **Pattern**: Client Components cannot import modules with `'server-only'` directive
- **Symptom**: Build error: "'server-only' cannot be imported from a Client Component module"
- **Root cause**: `dividendService.ts` and similar files use Firebase Admin SDK (server-only)
- **Solution**: Create API route for server-side operations
```typescript
// ✅ CORRECT - API route with Admin SDK
// app/api/performance/yoc/route.ts
import { adminDb } from '@/lib/firebase/admin';
async function getUserAssetsAdmin(userId: string): Promise<Asset[]> {
  const querySnapshot = await adminDb
    .collection('assets')
    .where('userId', '==', userId)
    .get();
  return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}
```
- **Client-side**: Fetch from API instead of direct service import
- **Performance**: Use `Promise.all` to parallelize multiple API calls

---

## Common Errors to Avoid

### Date Range Query Errors
**Sintomo**: Manca l'ultimo giorno nei risultati Firestore
**Causa**: `new Date(year, month, 0)` taglia dopo mezzanotte
**Soluzione**:
```typescript
const endDate = new Date(year, month, 0, 23, 59, 59, 999);
```
**Prevenzione**: Sempre includere `23, 59, 59, 999` per fine periodo

### React Query Incomplete Cache Invalidation
**Sintomo**: UI mostra dati stale dopo una mutation
**Causa**: Invalidazione solo della cache diretta
**Soluzione**:
```typescript
onSuccess: () => {
  queryClient.invalidateQueries({ queryKey: queryKeys.snapshots.all(userId) });
  queryClient.invalidateQueries({ queryKey: queryKeys.assets.all(userId) });
}
```
**Prevenzione**: Traccia API -> Firestore -> cache e invalida tutte le dipendenze

### Firestore setDoc Data Loss
**Sintomo**: Campi scompaiono dopo save parziali
**Causa**: `setDoc()` senza `{ merge: true }`
**Soluzione**:
```typescript
await setDoc(docRef, payload, { merge: true });
```
**Prevenzione**: Usa merge per ogni update parziale

### Timezone Boundary Bugs (Server vs Client)
**Sintomo**: Entries appaiono in mese/anno sbagliato quando operazioni eseguite da server (Vercel/UTC) vs localhost (CET/CEST)
**Causa**: JavaScript `Date.getMonth()` e `getFullYear()` usano timezone locale. Server (UTC) e client (CET) estraggono valori diversi vicino a mezzanotte
**Soluzione**:
```typescript
// ❌ WRONG - timezone-dependent
const month = new Date().getMonth() + 1;
const year = new Date().getFullYear();

// ✅ CORRECT - always uses Italy timezone
import { getItalyMonthYear } from '@/lib/utils/dateHelpers';
const { month, year } = getItalyMonthYear();
```
**Prevenzione**: Never use `Date.getMonth()` or `getFullYear()` directly. Always use timezone helpers from `dateHelpers.ts`. Test con `TZ=UTC npm run dev` per simulare production.

### Settings Persistence Bugs (Service Layer Incomplete)
**Sintomo**: UI toggles/inputs save correctly but reset to defaults after page reload
**Causa**: Type definition includes new field, but service layer functions (`getSettings`, `setSettings`) don't read/write it from Firestore
**Esempio**: `includePrimaryResidenceInFIRE` defined in type but not handled in `assetAllocationService.ts`
**Soluzione**: Update BOTH service functions:
```typescript
// getSettings() - READ
includePrimaryResidenceInFIRE: data.includePrimaryResidenceInFIRE,

// setSettings() - WRITE
if (settings.includePrimaryResidenceInFIRE !== undefined) {
  docData.includePrimaryResidenceInFIRE = settings.includePrimaryResidenceInFIRE;
}
```
**Debug checklist**:
1. Does field appear in Firestore document? NO → setSettings not writing
2. Does UI show saved value after reload? NO → getSettings not reading
3. Check mutation payload in browser DevTools Network tab
**Prevenzione**: When adding ANY field to settings types, always grep for service file and update both functions. Use three-place rule pattern.

---

## Key Files
- Date helpers: `lib/utils/dateHelpers.ts`
- Formatters: `lib/utils/formatters.ts`
- Asset history utils: `lib/utils/assetPriceHistoryUtils.ts`
- Performance service: `lib/services/performanceService.ts`
- Performance types: `types/performance.ts`
- YOC API route: `app/api/performance/yoc/route.ts`
- Currency conversion: `lib/services/currencyConversionService.ts`
- Query keys: `lib/query/queryKeys.ts`
- Cashflow charts: `components/cashflow/TotalHistoryTab.tsx`, `components/cashflow/CurrentYearTab.tsx`
- Sankey diagram: `components/cashflow/CashflowSankeyChart.tsx`
- History charts: `app/dashboard/history/page.tsx`, `lib/services/chartService.ts`
- Asset allocation service: `lib/services/assetAllocationService.ts`
- Performance section: `components/performance/MetricSection.tsx`
- FIRE calculator: `components/fire-simulations/FireCalculatorTab.tsx`

**Last updated**: 2026-01-19
