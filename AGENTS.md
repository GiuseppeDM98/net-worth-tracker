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
- Use `toDate()` from `dateHelpers.ts` (handles Timestamps, ISO strings, null)
- **Month/year extraction**: Use `getItalyMonth()`, `getItalyYear()`, `getItalyMonthYear()` (NOT `Date.getMonth()`)
- **Why**: Server (UTC) and client (browser) produce same results

### Custom Tailwind Breakpoint
- Use `desktop:` (1025px) instead of `lg:` (1024px)
- Define in `app/globals.css` with `@theme inline`

---

## Key Patterns

### React Query Cache Invalidation
Invalidate all related caches after mutations (direct + indirect dependencies).

### Lazy-Loading Tabs
Never remove from `mountedTabs` once added to preserve state.

### Date Range Queries (Firestore)
End date must include full day: `new Date(year, month, 0, 23, 59, 59, 999)`

### Asset & Chart Patterns
- **Hall of Fame**: Include years with expenses even if <2 snapshots
- **Asset Price %**: For `price === 1` or `displayMode === 'totalValue'`, use total value
- **Asset Historical Aggregation**: Use `name` (not `assetId`) as aggregation key in price history tables to unify data when asset sold and re-purchased
- **Borsa Italiana**: Pass `assetType` to scraper (ETF vs Stock table structures differ)
- **Currency**: Use `currencyConversionService.ts` (Frankfurter API, 24h cache)
- **Chart Y Axis**: Use `formatCurrencyCompact()` on mobile
- **Chart Data**: Check `chartService.ts` prepared data before adding filters
- **Dividend Calendar**: Use `paymentDate` (not `exDate`) for display and filters

### YOC (Yield on Cost) and Current Yield Calculation Pattern
- **Annualization**: < 12 months scale up, >= 12 months average
- **YOC**: Only assets with `quantity > 0` and `averageCost > 0`, uses original cost basis
- **Current Yield**: Uses `currentPrice` (market value) instead of cost
- **Filter dividends**: Use `paymentDate` not `exDate`
- **Architecture**: Use API route (server-only dividend service)

### Time-Sensitive Metrics Pattern
- **Separate date parameters**: Use dedicated `*EndDate` field capped at TODAY
- **Example**: YOC uses `dividendEndDate = min(endDate, today)` for only received dividends
- **Rationale**: Snapshot metrics need end-of-period; dividend metrics need actual data

### Table Totals Row Pattern
- Use `<TableFooter>` for semantic HTML
- Calculate totals on all filtered data (not just current page)
- Use EUR amounts for multi-currency (`netAmountEur ?? netAmount`)

### Expense Amount Sign Convention
- **Income**: POSITIVE, **Expenses**: NEGATIVE in database
- **Net Savings**: `sum(income) + sum(expenses)` (NOT subtraction)
- **Example**: €1000 + (-€400) = €600

### Sankey Diagram Multi-Layer Pattern
When implementing complex data flow visualizations:
- **4-layer structure**: Income → Budget → Types → Categories + Savings
- **5-layer optional**: Toggle to add Subcategories layer (Categories → Subcategories)
- **Multi-mode drill-down**: Support 4 modes (budget, type drill-down, category drill-down, transactions)
- **State management**: Use `mode` field + `parentType`/`parentCategory` for navigation context
- **Conditional rendering**: `{mode !== 'transactions' && <ResponsiveSankey ... />}` prevents crashes with empty data
- **Mobile filtering**: Top 3-4 items per parent to prevent overcrowding (top 4 for subcategories)
- **Unique IDs with separator**: Use `"Category__Subcategory"` format (double underscore) for collision-free IDs
- **Label vs ID in Nivo**: Add `label` field to nodes + configure `label={(node) => node.label || node.id}` in ResponsiveSankey
- **Dual-path navigation**: Support both drill-down flow (4 clicks) and direct 5-layer click (1 click to transactions)
- **"Altro" filtering**: Skip nodes/links when `subcategories.length === 1 && name === 'Altro'` (not informative)
- **Example**: CashflowSankeyChart with 4 modes + optional 5-layer + transaction table

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

### Firestore Nested Object Deletion Pattern
**Critical**: Firestore `merge: true` does RECURSIVE merge on nested objects, preventing key deletion.
- **Problem**: Cannot delete nested keys by omitting them in new object
  ```typescript
  // Even if you build completely new object:
  const newSubTargets = { "All-World": 33, "Momentum": 33 }; // "azioni" omitted
  await setDoc(ref, { targets: { equity: { subTargets: newSubTargets } } }, { merge: true });
  // Result: Firestore KEEPS "azioni" key! (recursive merge)
  ```
- **Solution**: Use GET + spread + setDoc WITHOUT merge for complete replacement
  ```typescript
  // Correct approach:
  if (settings.targets !== undefined) {
    const existingDoc = await getDoc(ref);
    const existingData = existingDoc.exists() ? existingDoc.data() : {};

    const docData = {
      ...existingData,           // Preserve all other fields
      targets: settings.targets, // COMPLETELY REPLACE targets
      updatedAt: Timestamp.now()
    };

    await setDoc(ref, docData); // NO merge: true!
  }
  ```
- **Rationale**: Read-modify-write pattern with explicit replacement instead of merge
- **Trade-off**: Extra GET call (~100-200ms overhead) for correctness
- **Use case**: Deleting subcategories, removing asset allocation keys, any nested object cleanup

---

### Asset Re-acquisition Aggregation Pattern
When displaying historical asset data across time periods:
- **Aggregation key**: Use `asset.name` instead of `assetId` to unify re-purchased assets
- **Rationale**: When user sells asset (deletes document) and re-buys later, new Firestore doc gets new ID
- **Display logic**: `Map<name, metadata>` groups all instances with same name into single row
- **Badge "Venduto"**: Shows only if name NOT found in current portfolio (`isDeleted: true`)
- **React keys**: Use `asset.name` for stable keys across re-acquisitions
- **Edge case**: Different names (e.g., "Apple Inc." vs "Apple") → separate rows (user controlled)
- **Files**: `assetPriceHistoryUtils.ts` (aggregation), `AssetPriceHistoryTable.tsx` (display)
- **No DB migration**: Snapshots still save `assetId`, transformation happens at render time

### Server-Only Module Constraints (Firebase)
When implementing features requiring Firebase data access:
- **Pattern**: Client Components cannot import modules with `'server-only'` directive
- **Solution**: Create API route for server-side operations, fetch from client
- **Performance**: Use `Promise.all` to parallelize multiple API calls

---

## Common Errors to Avoid

### Date Range Query Errors
**Sintomo**: Missing last day in Firestore results
**Causa**: End date missing time component (cuts at midnight)
**Soluzione**: `new Date(year, month, 0, 23, 59, 59, 999)`

### React Query Incomplete Cache Invalidation
**Sintomo**: Stale UI after mutation
**Soluzione**: Invalidate all related caches (direct + indirect dependencies)

### Firestore Nested Object Deletion Not Persisting
**Sintomo**: Deleted nested keys reappear after page reload (e.g., removed subcategories come back)
**Causa**: Firestore `merge: true` does RECURSIVE merge - even new objects get merged with old data
**Debug time**: >2 hours (tried multiple approaches before discovering root cause)
**Soluzione**:
```typescript
// For nested object deletions, use GET + setDoc WITHOUT merge:
const existingDoc = await getDoc(ref);
const existingData = existingDoc.exists() ? existingDoc.data() : {};
const docData = { ...existingData, targets: newTargets, updatedAt: Timestamp.now() };
await setDoc(ref, docData); // NO { merge: true }
```
**Prevenzione**: Use `merge: true` for partial updates, but NOT for nested object key deletions

### Timezone Boundary Bugs (Server vs Client)
**Sintomo**: Entries in wrong month when server (UTC) vs client (CET) near midnight
**Causa**: `Date.getMonth()` is timezone-dependent
**Debug time**: ~1 hour to identify timezone mismatch
**Soluzione**: Use `getItalyMonthYear()` from `dateHelpers.ts` (NOT `Date.getMonth()`)
**Test**: `TZ=UTC npm run dev` to simulate production

### Settings Persistence Bugs (Service Layer Incomplete)
**Sintomo**: UI toggles/inputs save correctly but reset to defaults after page reload
**Causa**: Type definition includes new field, but service layer doesn't read/write it from Firestore
**Debug time**: ~30min identifying service layer was missing field handling
**Soluzione**: Update BOTH `getSettings()` (read) and `setSettings()` (write) functions
**Debug checklist**:
1. Does field appear in Firestore? NO → setSettings not writing
2. Does UI show saved value after reload? NO → getSettings not reading
**Prevenzione**: Use three-place rule pattern (see Settings Service Synchronization Pattern above)

---

## Key Files
- **Utils**: `lib/utils/dateHelpers.ts`, `formatters.ts`, `assetPriceHistoryUtils.ts`
- **Services**: `performanceService.ts`, `assetAllocationService.ts`, `currencyConversionService.ts`, `chartService.ts`
- **API Routes**: `app/api/performance/yoc/route.ts`
- **Components**: `CashflowSankeyChart.tsx`, `MetricSection.tsx`, `FireCalculatorTab.tsx`
- **Pages**: `app/dashboard/settings/page.tsx`, `history/page.tsx`

**Last updated**: 2026-01-20
