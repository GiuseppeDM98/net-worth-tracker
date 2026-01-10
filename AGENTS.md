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
**Symptom**: Missing last day records in Firestore queries

**Root Cause**: Using `new Date(year, month, 0)` excludes records after midnight

```typescript
// ❌ WRONG - Excludes last day records
const endDate = new Date(year, month, 0);

// ✅ CORRECT - Include entire last day
const endDate = new Date(year, month, 0, 23, 59, 59, 999);
```

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

// ✅ CORRECT - Use shouldUseTotalValue flag
const shouldUseTotalValue = displayMode === 'totalValue' || currentPrice === 1;
const currentValue = shouldUseTotalValue ? currentTotalValue : currentPrice;
const change = (currentValue - previousValue) / previousValue * 100;
```

**Prevention**: Apply `shouldUseTotalValue` flag to ALL % calculations (monthly, YTD, fromStart), test with `price=1` assets

---

### Responsive Breakpoint Edge Case (iPad Mini)
**Symptom**: iPad Mini landscape (1024px) shows desktop UI instead of mobile UI

**Root Cause**: Tailwind `lg:` breakpoint is inclusive (≥1024px)

```css
/* ✅ Custom breakpoint in app/globals.css */
@theme inline {
  --breakpoint-desktop: 1025px;
}
```

**Prevention**: Always use `desktop:` not `lg:`, test at exact 1024px breakpoint

---

### Chart YAxis Formatter (Mobile Compression)
**Symptom**: Y-axis labels too wide compress chart area on mobile

**Root Cause**: Using `formatCurrency()` creates 12+ character strings

```typescript
// ❌ WRONG - €1.234.567 (too wide)
<YAxis tickFormatter={(value) => formatCurrency(value)} />

// ✅ CORRECT - €1,5 Mln (compact)
<YAxis tickFormatter={(value) => formatCurrencyCompact(value)} />
```

**Prevention**: Use `formatCurrencyCompact()` for Y-axis, `formatCurrency()` only for tooltips/tables

---

### React Query Incomplete Cache Invalidation
**Symptom**: UI shows stale data after mutation even though Firestore was updated

**Root Cause**: Only invalidating direct cache, missing indirect dependencies

```typescript
// ❌ WRONG - Snapshot API updates assets, but only snapshots cache invalidated
onSuccess: () => {
  queryClient.invalidateQueries({ queryKey: queryKeys.snapshots.all(userId) });
  // Missing: assets cache!
}

// ✅ CORRECT - Invalidate ALL modified collections
onSuccess: () => {
  queryClient.invalidateQueries({ queryKey: queryKeys.snapshots.all(userId) });
  queryClient.invalidateQueries({ queryKey: queryKeys.assets.all(userId) });
}
```

**Prevention**: Trace API endpoint to find ALL Firestore collections modified, invalidate all related caches

---

### Firestore setDoc Data Loss (CRITICAL)
**Symptom**: Settings/data mysteriously disappear after save operations

**Root Cause**: Using `setDoc()` without `{ merge: true }` overwrites entire document

```typescript
// ❌ WRONG - Deletes all other fields
await setDoc(docRef, { field1: newValue });

// ✅ CORRECT - Merges with existing
await setDoc(docRef, { field1: newValue }, { merge: true });
```

**Prevention**: Use `{ merge: true }` by default when updating existing documents, audit all `setDoc()` calls

---

### Double Percentage Multiplication (CRITICAL)
**Symptom**: UI displays correct percentage value but progress bars/charts show 100% (or wrong visual representation)

**Root Cause**: Multiplying by 100 a value already in percentage range (0-100 instead of 0-1)

```typescript
// ❌ WRONG - progressToFI already returns 72.06 (0-100 range)
<div style={{ width: `${Math.min(fireMetrics.progressToFI * 100, 100)}%` }} />
// Result: 72.06 * 100 = 7206 → Math.min(7206, 100) = 100% (always full)

// ✅ CORRECT - Use value directly
<div style={{ width: `${Math.min(fireMetrics.progressToFI, 100)}%` }} />
// Result: 72.06 → Math.min(72.06, 100) = 72.06% (correct)
```

**Where to Check**:
- Progress bar width calculations with percentage values
- Chart scales using service-returned percentages
- Pattern: Verify if service returns 0-1 (decimal) or 0-100 (percentage)
  - `fireService.ts`: Returns 0-100 → DON'T multiply
  - `formatPercentage()`: Expects 0-100, multiplies internally by 100

**Prevention**:
- Check service return type before applying `* 100`
- Test with values <10% to spot full bars immediately
- Ensure text display and visual width use same value

**Fixed Locations** (2026-01-07):
- ✅ `components/fire-simulations/FireCalculatorTab.tsx` lines 227, 294

---

### Cash Flow Adjustment Mismatch in Correlated Metrics (CRITICAL)
**Symptom**: Max Drawdown shows -15% at month 5, but Drawdown Duration counts from month 3 (different peak), creating confusion

**Cause**: Using different cash flow adjustment logic in correlated metrics (e.g., Max Drawdown vs Drawdown Duration)

**Solution**: Use identical TWR-style cash flow adjustment for correlated metrics (see `calculateMaxDrawdown()` and `calculateDrawdownDuration()` for reference pattern):
```typescript
// Build cash flow map: YYYY-MM → netCashFlow
const cashFlowMap = new Map<string, number>();
cashFlows.forEach(cf => {
  const key = `${cf.date.getFullYear()}-${String(cf.date.getMonth() + 1).padStart(2, '0')}`;
  cashFlowMap.set(key, cf.netCashFlow);
});

// Calculate adjusted values: totalNetWorth - cumulative contributions
let cumulativeCashFlow = 0;
const adjustedValues: number[] = [];
for (const snapshot of snapshots) {
  const cfKey = `${snapshot.year}-${String(snapshot.month).padStart(2, '0')}`;
  cumulativeCashFlow += cashFlowMap.get(cfKey) || 0;
  adjustedValues.push(snapshot.totalNetWorth - cumulativeCashFlow);
}
```

**Prevention**: Reuse exact adjustment logic for drawdown-related metrics; verify alignment with test (Max Drawdown at month X → duration counts from same peak); extract to helper if >3 uses

**Where**: `calculateMaxDrawdown()`, `calculateDrawdownDuration()`, future drawdown metrics

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

**Last updated**: 2026-01-10
**Reduced from**: 1646 lines → 324 lines (~80% reduction)
