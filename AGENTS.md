# AI Agent Guidelines - Net Worth Tracker

Project-specific patterns and recurring errors for Net Worth Tracker codebase.

For general architecture, tech stack, and feature documentation, see [CLAUDE.md](CLAUDE.md).

---

## Critical Conventions

### Italian Localization
- All user-facing text in Italian
- Use `formatCurrency()` for EUR formatting (€1.234,56)
- Use `formatDate()` for DD/MM/YYYY format
- **All code comments in English only**

### Firebase Date Handling
- Always use `toDate()` helper from `lib/utils/dateHelpers.ts`
- API responses serialize Firestore Timestamps as ISO strings, not Date objects
- Never use manual `instanceof Date` checks for API data

### Custom Tailwind Breakpoint
- Use `desktop:` (1025px) instead of `lg:` (1024px)
- Excludes iPad Mini landscape (exactly 1024px) from desktop UI
- **Tailwind v4**: Define in `app/globals.css` with `@theme inline`, NOT `tailwind.config.js`

---

## Key Patterns

### React Query Cache Invalidation
**MUST invalidate ALL related caches** (direct + indirect dependencies):
```typescript
// Snapshot creation updates BOTH collections
export function useCreateSnapshot(userId: string) {
  return useMutation({
    mutationFn: createSnapshot,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.snapshots.all(userId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.assets.all(userId) }); // Critical!
    }
  });
}
```
Trace: API → Firestore → Cache → UI to find all dependencies

### Lazy-Loading Tabs (mountedTabs Pattern)
```typescript
const [mountedTabs, setMountedTabs] = useState<Set<string>>(new Set(['default-tab']));
const handleTabChange = (value: string) => {
  setActiveTab(value);
  setMountedTabs((prev) => new Set(prev).add(value)); // Never remove!
};

// Lazy-load tabs
{mountedTabs.has('lazy-tab') && (
  <TabsContent value="lazy-tab">
    <ExpensiveComponent />
  </TabsContent>
)}
```
- First tab always mounted
- Others mount on first click
- Never remove from Set (preserve state)

### Date Range Queries (Firestore)
End date MUST include full day:
```typescript
// ✅ CORRECT
const endDate = new Date(year, month, 0, 23, 59, 59, 999);

// ❌ WRONG - Excludes records after midnight
const endDate = new Date(year, month, 0);
```

### Borsa Italiana Scraper
- ETF and Stock tables have **DIFFERENT structures** (4 vs 7+ columns)
- Must pass `assetType` parameter to `scrapeDividendsByIsin(asset.isin, asset.type)`
- ETF: Italian currency names ("Dollaro Usa" → "USD" via mapping)
- Stock: 3-letter codes directly

### Currency Conversion (Dividends)
- Use `currencyConversionService.ts` (Frankfurter API)
- 24h in-memory cache with stale fallback
- Always store `exchangeRate` for audit trail
- UI: Show EUR with tooltip for original currency

---

## Common Errors to Avoid

### Date Range Query Errors (CRITICAL)
**Symptom**: Discrepancies between pages showing same data (missing last day records)

**Example**: Performance page showed €37.273,67 expenses while Cashflow showed €37.647,48 (€373,81 difference from missing 31/12/2025 records)

**Root Cause**:
```typescript
// ❌ WRONG - Excludes records after midnight on last day
const endDate = new Date(year, month, 0);
// For Dec 2025: 31 Dec 2025 00:00:00
// Expense at 31 Dec 14:30 → EXCLUDED

// ✅ CORRECT - Include entire last day
const endDate = new Date(year, month, 0, 23, 59, 59, 999);
// For Dec 2025: 31 Dec 2025 23:59:59.999
// Expense at 31 Dec 14:30 → INCLUDED
```

**Where to Check**:
- Any function creating date ranges for Firestore queries
- Pattern to search: `new Date\([^)]*,\s*0\)\s*;`

**Fixed Locations** (2025-12-30):
- ✅ `lib/services/performanceService.ts` lines 478, 585, 640

**Prevention**: Always use `23, 59, 59, 999` parameters for end-of-period queries

---

### Performance Metrics - Dividend Income Separation (CRITICAL)
**Symptom**: All performance metrics (ROI, CAGR, TWR, IRR, Sharpe) systematically underestimated

**Root Cause**: Treating dividend income as external contributions instead of portfolio returns

```typescript
// ❌ WRONG - Mixes dividends with salary
if (expense.type === 'income') {
  entry.income += expense.amount;  // Dividend + salary lumped together
}
// Result: netCashFlow includes dividends (mathematically incorrect)
// TWR formula subtracts dividends: (endNW - cashFlow) / startNW

// ✅ CORRECT - Separate dividend income from external income
if (expense.type === 'income') {
  if (dividendCategoryId && expense.categoryId === dividendCategoryId) {
    entry.dividendIncome += expense.amount;  // Portfolio return (not external)
  } else {
    entry.income += expense.amount;  // External contribution
  }
}
netCashFlow: income - expenses  // WITHOUT dividends (external only)
```

**Mathematical Correctness** (CFA Institute Standards):
- **ROI**: `gain = endNW - startNW - netCashFlow` (dividends NOT in netCashFlow ✓)
- **TWR**: Monthly return = `(endNW - externalCashFlow) / startNW` (dividends NOT subtracted ✓)
- **IRR**: Cash flows exclude dividends, they're part of final value ✓

**Where to Check**:
- Any function aggregating cash flows from expenses
- Pattern to search: `type === 'income'` without dividend separation logic

**Implementation** (2026-01-02):
- ✅ Added `dividendIncome` field to `CashFlowData` interface
- ✅ Modified `getCashFlowsForPeriod()` with `dividendCategoryId` parameter
- ✅ All 6 calculation functions updated in `performanceService.ts`

**Prevention**:
- When aggregating cash flows, ALWAYS separate dividends using `dividendIncomeCategoryId` from settings
- Verify TWR doesn't subtract dividends from end value
- Test: dividends should INCREASE metrics (ROI, CAGR), not decrease them

**Backward Compatibility**: If `dividendIncomeCategoryId` not configured → legacy behavior (all income treated equally)

---

### Asset Price History Percentage Errors (CRITICAL)
**Symptom**: Assets with `price=1` (cash, real estate) show 0.00% change even when `totalValue` changes significantly

**Root Cause**: Using price for percentage calculations when price is constant at 1

```typescript
// ❌ WRONG - Always 0% for price=1 assets
const change = (currentPrice - previousPrice) / previousPrice * 100;
// Casa: Month 1 price=1, Month 2 price=1 → 0.00%
// But totalValue: €40,000 → €40,350 (should be 0.87%)

// ✅ CORRECT - Use shouldUseTotalValue flag for consistent logic
const shouldUseTotalValue = displayMode === 'totalValue' || currentPrice === 1;
const currentValue = shouldUseTotalValue ? currentTotalValue : currentPrice;
const previousValue = shouldUseTotalValue ? previousTotalValue : previousPrice;
const change = (currentValue - previousValue) / previousValue * 100;
```

**Key Pattern**: Single source of truth for value selection
```typescript
const getValue = (cell: MonthDataCell) => {
  // Use totalValue if displayMode is 'totalValue' OR if price === 1
  if (displayMode === 'totalValue' || cell.price === 1) {
    return cell.totalValue;
  }
  return cell.price;
};
```

**Where to Check**:
- Any code calculating percentage changes for asset price history
- Pattern to search: `price - previousPrice` without checking `price === 1`
- File: `lib/utils/assetPriceHistoryUtils.ts`

**Fixed Locations** (2026-01-03):
- ✅ `lib/utils/assetPriceHistoryUtils.ts` lines 229-241 (month-over-month)
- ✅ Lines 271-305 (YTD and fromStart) - already correct

**Prevention**:
- Apply `shouldUseTotalValue` flag to ALL % calculations (monthly, YTD, fromStart)
- Ensure color coding also uses same conditional logic
- Test with assets that have `price=1` (cash, real estate)
- Never compare price-to-price for `price=1` assets (meaningless: always 0%)

**Mathematical Correctness**: Assets with `price=1` are priced "per unit" where unit = total value → percentage changes MUST reflect `totalValue` variations, not `price`

---

### Responsive Breakpoint Edge Case (iPad Mini)
**Symptom**: iPad Mini landscape (1024px) shows desktop UI instead of mobile UI

**Root Cause**: Tailwind `lg:` breakpoint is inclusive (≥1024px), not exclusive

```css
/* ❌ Tailwind default includes 1024px */
@media (min-width: 1024px) { /* iPad Mini landscape (1024px) included! */ }

/* ✅ Custom breakpoint excludes 1024px */
/* app/globals.css - Tailwind v4 syntax */
@theme inline {
  --breakpoint-desktop: 1025px;
}
```

**Usage**:
```tsx
// ❌ WRONG - iPad Mini landscape gets desktop UI
<nav className="lg:hidden max-lg:portrait:flex">

// ✅ CORRECT - iPad Mini landscape gets mobile UI
<nav className="desktop:hidden max-desktop:portrait:flex">
```

**Key Insights**:
- ❌ Don't assume breakpoints are exclusive (they're inclusive: ≥)
- ❌ Don't test only at breakpoint-1px; test at exact breakpoint
- ✅ Use semantic names (`desktop` not `custom-lg`)
- ✅ Tailwind v4: Define in `globals.css` with `@theme inline`, NOT `tailwind.config.js`

**Affected Files**:
- `app/globals.css`: Custom breakpoint definition
- Navigation components: Replace `lg:` with `desktop:` throughout

**Prevention**:
- Always use `desktop:` not `lg:` in this project
- Test at exact breakpoint (1024px), not just 1023px
- Document edge cases for common devices

---

### Chart YAxis Formatter (Mobile Compression)
**Symptom**: Y-axis labels too wide (€1.234.567) compress chart area on mobile portrait

**Root Cause**: Using `formatCurrency()` for axis labels creates 12+ character strings

```typescript
// ❌ WRONG - Full currency format creates wide labels
<YAxis tickFormatter={(value) => formatCurrency(value)} />
// Output: €1.234.567 (12+ characters)
// Mobile impact: Chart area compressed, hard to read

// ✅ CORRECT - Use compact notation for readability
<YAxis tickFormatter={(value) => formatCurrencyCompact(value)} />
// Output: €1,5 Mln (8 characters)
// Mobile impact: Readable on all devices, no compression
```

**Formatter Behavior**:
| Value | formatCurrency() | formatCurrencyCompact() |
|-------|-----------------|------------------------|
| 5,000 | €5.000,00 | €5k |
| 850,000 | €850.000,00 | €850k |
| 1,500,000 | €1.500.000,00 | **€1,5 Mln** ✓ |

**Where to Check**:
- Any YAxis in Recharts charts with monetary values
- Pattern to search: `<YAxis.*formatCurrency`
- Reference: `app/dashboard/history/page.tsx` line 441 (uses `formatCurrencyCompact` ✓)

**Fixed Locations** (2025-12-30):
- ✅ `app/dashboard/performance/page.tsx` line 323

**Prevention**:
- `formatCurrencyCompact()` for Y-axis labels in monetary charts
- `formatCurrency()` only for tooltips, cards, or tables (full precision needed)
- Test on mobile portrait (< 768px) to verify readability

---

### React Query Incomplete Cache Invalidation
**Symptom**: UI shows stale data after mutation even though Firestore was updated

**Root Cause**: Only invalidating direct cache, missing indirect dependencies

```typescript
// ❌ WRONG - Snapshot API updates assets, but only snapshots cache invalidated
export function useCreateSnapshot(userId: string) {
  return useMutation({
    mutationFn: createSnapshot,  // Calls updateUserAssetPrices() internally
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.snapshots.all(userId) });
      // Missing: assets cache invalidation!
    }
  });
}

// ✅ CORRECT - Invalidate ALL modified collections
onSuccess: () => {
  queryClient.invalidateQueries({ queryKey: queryKeys.snapshots.all(userId) });
  queryClient.invalidateQueries({ queryKey: queryKeys.assets.all(userId) });  // Critical!
}
```

**How to Identify Indirect Dependencies**:
1. Check what data the UI actually displays (look for `useMemo` dependencies)
2. Trace back through mutation's API endpoint to see what Firestore collections it modifies
3. Invalidate caches for ALL modified collections, not just the primary one

**Example** (Overview page):
```typescript
// UI depends on assets, not snapshots
const portfolioMetrics = useMemo(() => ({
  totalValue: calculateTotalValue(assets),  // ← FROM ASSETS
}), [assets]); // ← Only re-runs when 'assets' changes

// Snapshot API updates BOTH collections
POST /api/portfolio/snapshot
  → updateUserAssetPrices() // Updates assets collection
  → createSnapshot()        // Creates snapshot document

// Therefore: BOTH caches must be invalidated
```

**Red Flags**:
- ❌ API endpoint modifies multiple Firestore collections but only one cache invalidated
- ❌ UI displays data from collection A but mutation only invalidates collection B
- ✅ Trace data flow: API → Firestore → Cache → UI

**Prevention**:
- Trace API endpoint to find all Firestore collections modified
- Check what data UI displays (useMemo dependencies)
- Invalidate ALL related caches

---

### Firestore setDoc Data Loss (CRITICAL)
**Symptom**: Settings/data mysteriously disappear after save operations, even though Firestore write succeeds

**Root Cause**: Using `setDoc()` without `{ merge: true }` overwrites entire document, deleting fields not included in current update

```typescript
// ❌ WRONG - Deletes all other fields
await setDoc(docRef, { field1: newValue });
// If document had { field1, field2, field3 }, only field1 remains

// ✅ CORRECT - Merges with existing, preserves other fields
await setDoc(docRef, { field1: newValue }, { merge: true });
// Document now has { field1: newValue, field2: old, field3: old }
```

**When This Happens**:
- Multiple pages/components update different fields of same document
- Settings page saves asset allocation while FIRE page saves withdrawal rate
- Without merge: last save wins, other fields lost

**Solution**:
1. **Service Layer**: Add `{ merge: true }` to all `setDoc()` calls that update existing documents
2. **Application Layer**: Fetch current data before save, explicitly preserve unrelated fields

```typescript
// Application layer pattern (defensive)
const currentData = await getSettings(userId);
await setSettings(userId, {
  // Fields managed by this page
  fieldA: newValueA,
  // Explicitly preserve unrelated fields
  fieldB: currentData?.fieldB,
  fieldC: currentData?.fieldC,
});
```

**Prevention**:
- Use `{ merge: true }` by default when updating existing documents
- Only omit merge when intentionally replacing entire document
- Add JSDoc comments to service functions explaining merge behavior
- Audit all `setDoc()` calls during code review

**Example from codebase** (assetAllocationService.ts):
```typescript
/**
 * IMPORTANT: Uses Firestore merge mode to preserve fields not included in this update.
 * This prevents data loss when different parts of the app update different settings fields.
 */
export async function setSettings(userId: string, settings: AssetAllocationSettings) {
  await setDoc(docRef, docData, { merge: true });
}
```

**Fixed Locations** (2026-01-07):
- ✅ `lib/services/assetAllocationService.ts` line 92 - Added merge mode
- ✅ `app/dashboard/settings/page.tsx` line 635 - Added data preservation

---

## File References

Key files for common tasks:
- **Date utilities**: `lib/utils/dateHelpers.ts` (`toDate()` helper)
- **Formatters**: `lib/utils/formatters.ts` (`formatCurrency`, `formatCurrencyCompact`, `formatDate`)
- **Asset price history**: `lib/utils/assetPriceHistoryUtils.ts` (snapshot transformation, color coding)
- **Performance calculations**: `lib/services/performanceService.ts` (ROI, CAGR, TWR, IRR, Sharpe)
- **Currency conversion**: `lib/services/currencyConversionService.ts` (Frankfurter API)
- **Dividend scraper**: `lib/services/borsaItalianaScraperService.ts` (ETF vs Stock handling)
- **Query keys**: `lib/query/queryKeys.ts` (centralized React Query keys)

---

**Last updated**: 2026-01-07
**Reduced from**: 1646 lines → 333 lines (~80% reduction)
