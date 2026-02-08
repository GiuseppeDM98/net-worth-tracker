# AI Agent Guidelines - Net Worth Tracker (Lean)

Project-specific conventions and recurring pitfalls for Net Worth Tracker.
For architecture and status, see [CLAUDE.md](CLAUDE.md).

---

## Critical Conventions

### Italian Localization
- All user-facing text in Italian, **all code comments in English only**
- Use `formatCurrency()` for EUR (e.g. €1.234,56), `formatDate()` for DD/MM/YYYY

### Firebase Date Handling & Timezone
- Use `toDate()` from `dateHelpers.ts` (handles Timestamps, ISO strings, null)
- **Month/year extraction**: Use `getItalyMonth()`, `getItalyYear()`, `getItalyMonthYear()` (NOT `Date.getMonth()`)
- **Why**: Server (UTC) and client (browser) produce same results

### Custom Tailwind Breakpoint
- Use `desktop:` (1025px) instead of `lg:` (1024px), defined in `app/globals.css`

---

## Key Patterns

### React Query & Lazy-Loading
- Invalidate all related caches after mutations (direct + indirect dependencies)
- Never remove from `mountedTabs` once added to preserve tab state

### Date Range Queries (Firestore)
End date must include full day: `new Date(year, month, 0, 23, 59, 59, 999)`

### Expense Amount Sign Convention
- **Income**: POSITIVE, **Expenses**: NEGATIVE in database
- **Net Savings**: `sum(income) + sum(expenses)` (NOT subtraction)

### Cashflow Tab Pattern (Parallel Siblings)
- CurrentYearTab and TotalHistoryTab are parallel siblings with independent state
- **Prefer replicating patterns inline** over extracting shared components (only 2 consumers, they diverge over time)
- Pie chart drill-down: 3-level state machine (category → subcategory → expenseList) with `DrillDownState` type
- Always reset drill-down state when filters change to prevent stale data
- Blue-bordered card pattern for filtered sections: `border-blue-200 bg-blue-50/50 dark:bg-blue-950/10 dark:border-blue-800`

### Radix UI Select Values
- **Empty string NOT allowed** as `SelectItem` value (runtime error)
- Use sentinel values: `__all_years__`, `__all__`, `__none__` for "unselected" options
- For optional fields: use `undefined` value + placeholder text

### Sankey Diagram Multi-Layer Pattern
- 4-layer structure: Income → Budget → Types → Categories + Savings (5th optional: Subcategories)
- Use `"Category__Subcategory"` format (double underscore) for collision-free IDs
- Add `label` field to nodes + configure `label={(node) => node.label || node.id}`
- When filtering nodes, ALWAYS filter corresponding links too (prevents "missing: [NodeName]" errors)
- Skip "Altro" nodes when `subcategories.length === 1 && name === 'Altro'`

### Settings Service Synchronization
ALL fields in settings types must be handled in THREE places:
1. Type definition (e.g., `AssetAllocationSettings`)
2. `getSettings()` function (read from Firestore)
3. `setSettings()` function (write to Firestore, with `if (field !== undefined)` check)

### Firestore Nested Object Deletion
- `merge: true` does RECURSIVE merge — cannot delete nested keys by omitting them
- **Solution**: GET existing doc → spread + replace target field → `setDoc()` WITHOUT `merge: true`

### Firestore User-Managed Data Preservation
- When updating documents mixing calculated + user-managed fields: GET existing → preserve user fields
- NEVER initialize user-managed fields (notes, configs) in calculated data objects
- **Files**: `hallOfFameService.ts`, `hallOfFameService.server.ts`

### Server-Only Module Constraints (Firebase)
- Client Components cannot import `'server-only'` modules → create API route, fetch from client
- Use `Promise.all` to parallelize multiple API calls

### YOC / Current Yield Calculation
- Annualization: < 12 months scale up, >= 12 months average
- YOC uses `averageCost` (cost basis), Current Yield uses `currentPrice` (market value)
- Filter dividends by `paymentDate` (not `exDate`); use API route (server-only service)
- Time-sensitive: use dedicated `*EndDate` capped at TODAY for dividend metrics

### Table Totals Row
- Use `<TableFooter>` for semantic HTML
- Calculate totals on all filtered data (not just current page), use EUR amounts for multi-currency

### Asset Patterns
- **Historical Aggregation**: Use `name` (not `assetId`) as key to unify re-purchased assets
- **Borsa Italiana**: Pass `assetType` to scraper (ETF vs Stock table structures differ)
- **Currency**: Use `currencyConversionService.ts` (Frankfurter API, 24h cache)
- **Chart Y Axis**: Use `formatCurrencyCompact()` on mobile
- **Doubling Time**: Skip pre-existing milestones (`threshold <= firstPositive.totalNetWorth`)
- **Dividend Calendar**: Use `paymentDate` (not `exDate`) for display and filters

### Anthropic API Patterns
- **Current date in prompt**: Provide `Oggi è il ${today}` for time-sensitive analysis (knowledge cutoff)
- **SSE Streaming**: ReadableStream with `text/event-stream`, split by `\n\n`, keep incomplete lines in buffer
- **Extended Thinking**: 10k token budget for deeper reasoning
- **Web Search**: Multi-query with `Promise.allSettled`, top 2 per category, deduplicate by URL

---

## Common Errors to Avoid

### Timezone Boundary Bugs
**Symptom**: Entries in wrong month near midnight (server UTC vs client CET)
**Fix**: Use `getItalyMonthYear()` from `dateHelpers.ts` (NOT `Date.getMonth()`)

### Settings Persistence Bug
**Symptom**: UI toggles save but reset after reload
**Fix**: Update BOTH `getSettings()` and `setSettings()` (three-place rule)

### Radix Dialog Auto-Trigger Bug
**Symptom**: Callback doesn't fire when component mounted with `open={true}`
**Fix**: Use `useEffect(() => { ... }, [open])` instead of `onOpenChange` callback

### Firebase Auth Registration Race Condition
**Symptom**: PERMISSION_DENIED on first Firestore write after user creation
**Fix**: Triple-layer: force `getIdToken(true)` + retry logic + Firestore rules using `docId` (not `resource.data`) for reads
**Files**: `authHelpers.ts`, `AuthContext.tsx`, `firestore.rules`

### Firestore Nested Object Deletion Not Persisting
**Symptom**: Deleted nested keys reappear after reload
**Fix**: GET + setDoc WITHOUT `merge: true` (see pattern above)

---

## Key Files
- **Utils**: `lib/utils/dateHelpers.ts`, `formatters.ts`, `assetPriceHistoryUtils.ts`
- **Services**: `performanceService.ts`, `assetAllocationService.ts`, `currencyConversionService.ts`, `chartService.ts`, `tavilySearchService.ts`
- **API Routes**: `app/api/performance/yoc/route.ts`, `app/api/ai/analyze-performance/route.ts`
- **Components**: `CashflowSankeyChart.tsx`, `TotalHistoryTab.tsx`, `CurrentYearTab.tsx`, `MetricSection.tsx`
- **Pages**: `app/dashboard/settings/page.tsx`, `history/page.tsx`

**Last updated**: 2026-02-08
