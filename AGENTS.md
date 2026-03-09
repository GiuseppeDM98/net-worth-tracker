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
- **Cross-type move**: When moving expenses between income ↔ expense types, flip the amount sign. Helper `needsSignFlip()` in `expenseService.ts`
- **Category type change**: Allowed after creation. `updateExpensesType(categoryId, oldType, newType, userId)` in `expenseService.ts` batch-updates `type` + flips signs if crossing income ↔ expense. Called from `updateCategory()` in `expenseCategoryService.ts` which fetches old category once for both name and type change detection.

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

**Gotcha**: `setSettings()` has TWO write branches (with targets → `setDoc` without merge, without targets → `setDoc` with merge). New fields must be added to BOTH branches or they won't persist.

### Per-Asset Boolean Flags Pattern
- Prefer per-asset opt-in/opt-out flags (`stampDutyExempt`, `isLiquid`, etc.) over hardcoded category exclusions
- More flexible: users have edge cases (pension funds in equity class, real estate exempt from stamp duty, etc.) that category-level rules can't cover
- Add to `Asset` + `AssetFormData` types, Zod schema, reset defaults, edit-mode prefill, save payload, and UI toggle in `AssetDialog.tsx`

### Dashboard Settings Loading
- Dashboard page loads `AssetAllocationSettings` via `useEffect` + `useState` (NOT React Query) — one-time read per session
- Pattern: `getSettings(user.uid).then(setPortfolioSettings).catch(() => {})`
- Add `portfolioSettings` to the `portfolioMetrics` useMemo dependency array when calculations depend on it

### Firestore Nested Object Deletion
- `merge: true` does RECURSIVE merge — cannot delete nested keys by omitting them
- **Solution**: GET existing doc → spread + replace target field → `setDoc()` WITHOUT `merge: true`

### Firestore Rejects `undefined` Values
- `setDoc()` throws `FirebaseError: Unsupported field value: undefined` if any field is `undefined`
- TypeScript optional fields (`field?: T`) spread as `undefined` into Firestore documents
- **Solution**: Build the document object manually, only including fields that have a value
- **Files**: `goalService.ts` (`saveGoalData`)

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
- **Historical YOC (v3)**: numerator = actual `grossAmountEur` received; denominator = `maxDivQty × effectiveCostPerShare`. `effectiveCostPerShare` = gross-weighted average of `div.costPerShare` (stored on record at creation); fallback to `asset.averageCost` for legacy records. Uses `div.quantity` (not `asset.quantity`) so post-dividend purchases don't inflate portfolio weight.
- `div.costPerShare` is set server-side at dividend creation from `asset.averageCost` — never from user input. All creation paths set it: POST `/api/dividends`, POST `/api/dividends/scrape`, cron Phase 1 + Phase 3.
- `yocDividendsGross/Net` = actual dividends received (for display); `yocCostBasis` = `maxDivQty × effectiveCostPerShare`
- **Dividendi % (Rendimento Totale per Asset)**: same costPerShare philosophy — `dividendReturnPercentage = sum(div.netAmountEur / (div.quantity × div.costPerShare)) × 100`. Buying new shares after a dividend does NOT reduce the historical percentage. Fallback to `asset.averageCost` for legacy records without `costPerShare`. Can exceed 100% (correct: dividends > original cost). Computed in `app/api/dividends/stats/route.ts`.

### Table Totals Row
- Use `<TableFooter>` for semantic HTML
- Calculate totals on all filtered data (not just current page), use EUR amounts for multi-currency

### Asset Patterns
- **Zero-Quantity Assets**: `quantity = 0` is valid and saved to Firestore (Zod uses `.min(0)`, not `.positive()`). In `assetPriceHistoryUtils.ts`, set `isDeleted: asset.quantity === 0` in the `currentAssets.forEach` loop so the "Venduto" badge appears in price history. Dashboard counter filters `quantity > 0`. No backend validation — client-side only by design.
- **Snapshot byAsset filter**: `createSnapshot` (`snapshotService.ts`) skips assets with `quantity === 0` from `byAsset` — they'd store `totalValue: 0` with a valid price (corrupting immutable snapshot data). Totals/allocation are computed before the filter (all assets included).
- **Cash Asset Balance**: For `assetClass === 'cash'` assets, `quantity` IS the balance (e.g., €8000 = quantity 8000, price stays fixed). Update balance via `updateDoc({ quantity: newQuantity })`, NOT via `updateAssetPrice`/`currentPrice`. See `updateCashAssetBalance()` in `assetService.ts`.
- **Historical Aggregation**: Use `name` (not `assetId`) as key to unify re-purchased assets
- **Borsa Italiana Dividends**: Pass `assetType` to scraper (ETF vs Stock table structures differ)
- **Borsa Italiana Bond Scraping**:
  - **Timeout**: 30s minimum (Borsa Italiana can be slow during market hours)
  - **JavaScript HTML**: Main price displayed on page is client-side rendered → NOT in `fetch()` HTML. Use "Prezzo ufficiale" (official reference price) instead
  - **Cheerio robustness**: Iterate elements + `className.includes('formatPrice')` instead of CSS selectors (leading dash classes fail)
  - **Multi-level fallback**: 5 priorities (main → ultimo contratto → prezzo ufficiale → apertura → table)
  - **Label matching**: Use full labels ("ultimo contratto", not "ultimo") to avoid false positives
  - **Files**: `borsaItalianaBondScraperService.ts`, `priceUpdater.ts`, `AssetDialog.tsx`
- **Bond Price Convention (% of par → EUR)**:
  - Borsa Italiana and Yahoo Finance return bond prices as **% of par** (e.g. 104.2 = 104.2%, not €104.2)
  - Stored `currentPrice` AND `averageCost` must be EUR per unit: `storedValue = biPrice × (nominalValue / 100)`
  - Apply BI → EUR conversion in **four places**: `priceUpdater.ts`, `AssetDialog.onSubmit` Path 2 (auto-fetch), Path 1 (manualPrice), averageCost
  - Condition: only when `isBondWithIsin` (type=bond, assetClass=bonds, ISIN present) AND `bondNominalValue > 1`
  - Edit-mode prefill: both `manualPrice` and `averageCost` are back-converted to BI price so the round-trip is consistent
- **Bond Coupon Scheduling (Cron Phase 3 Timezone)**:
  - `getNextCouponDate` uses `new Date()` with `setHours(0,0,0,0)` in LOCAL time → unsafe in Phase 3 where the comparison is against UTC Firestore Timestamps
  - **Phase 3 must use `getFollowingCouponDate(paidDate, frequency, maturityDate)`** — advances exactly one period from the PAID coupon's date, no "today" comparison
  - `getApplicableCouponRate(paymentDate, issueDate, baseRate, schedule?)` — for step-up bonds
- **Auto-generated dividend cleanup — never create zero-amount entries**: when `quantity === 0` (asset sold), `POST /api/dividends` still runs cleanup but returns early before creating the record
- **Currency**: Use `currencyConversionService.ts` (Frankfurter API, 24h cache)
- **Stamp Duty (Imposta di Bollo)**: `calculateStampDuty(assets, rate, checkingAccountSubCategory?)` in `assetService.ts`. Excluded: `quantity=0` + `stampDutyExempt=true`. Conti correnti (matching subcategory): apply only if value strictly > €5,000. Configured in Settings (`stampDutyEnabled`, `stampDutyRate`, `checkingAccountSubCategory`).

### Dividend Net Amount Storage
- `netAmount` is computed at creation time (`grossAmount - taxAmount`) and **stored in Firestore** — metrics read the saved field, never recalculate at runtime
- Auto-scraped dividends (Borsa Italiana): `taxAmount = grossAmount × 0.26` (flat 26%, hardcoded)
- Bond coupons (auto-generated): `taxRate = asset.taxRate ?? 26` — correctly applies 12.5% for BTPs
- Manual entries: `taxAmount` is whatever the user entered; `netAmount` auto-filled if not provided
- YOC/Current Yield netto: use `div.netAmountEur ?? div.netAmount` (prefer EUR conversion)

### DividendStats Filter Coupling
- `DividendStats` makes an **independent** API fetch to `/api/dividends/stats` — it does NOT read from parent filtered state
- Any filter added to `DividendTrackingTab` **must be explicitly passed** as a prop to `DividendStats` and forwarded to the API
- `calculateDividendStats` in `dividendService.ts` accepts optional `assetId?` — no composite index needed

### Anthropic API Patterns
- **Current date in prompt**: Provide `Oggi è il ${today}` for time-sensitive analysis (knowledge cutoff)
- **SSE Streaming**: ReadableStream with `text/event-stream`, split by `\n\n`, keep incomplete lines in buffer
- **Extended Thinking**: 10k token budget for deeper reasoning
- **Web Search**: Multi-query with `Promise.allSettled`, top 2 per category, deduplicate by URL

### Consistent Data Source Pattern
- When multiple values must be consistent, fetch them from the **same data source in a single function**
- **Example**: `getAnnualCashflowData()` returns both `annualSavings` and `annualExpensesFromCashflow` from the same reference year

### Formatter Utility Duplication
- **Gotcha**: `formatCurrency` exists in BOTH `lib/utils/formatters.ts` AND `lib/services/chartService.ts`
- When modifying formatters, update BOTH functions to keep signatures aligned

### Performance Period Baseline Pattern
- `getSnapshotsForPeriod` includes 1 extra month before the period as **baseline** for YTD/1Y/3Y/5Y
- **`hasBaseline`** in `calculatePerformanceForPeriod`: period dates computed from `sortedSnapshots[1]` (not baseline). Active only for YTD/1Y/3Y/5Y with >= 3 snapshots
- All metric functions that annualize **must use `calculateMonthsDifference(periodEnd, periodStart)`** — NOT `snapshots.length - 1`
- **Chart baseline hiding** — each chart function handles it independently:
  - Heatmap (`prepareMonthlyReturnsHeatmap`): loop starts at `i = 1`
  - Evoluzione Patrimonio (`preparePerformanceChartData`): optional `skipBaseline=true` → `.slice(1)` after sort. Pass `true` for YTD/1Y/3Y/5Y in `getChartData()`. Baseline is always `sortedSnapshots[0]` after chronological sort → slice is safe.

---

## Common Errors to Avoid

### Timezone Boundary Bugs
**Symptom**: Entries in wrong month near midnight (server UTC vs client CET)
**Fix**: Use `getItalyMonthYear()` from `dateHelpers.ts` (NOT `Date.getMonth()`)

### Settings Persistence Bug
**Symptom**: UI toggles save but reset after reload
**Fix**: Update BOTH `getSettings()` and `setSettings()` (three-place rule). Remember the TWO write branches in `setSettings()`.

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

### Wrong Import Source for Service Functions
**Symptom**: Build error when importing settings helpers from constants modules
**Fix**: `getDefaultTargets`, `getSettings`, `setSettings` all live in `assetAllocationService.ts`

### Nullish `??` vs Falsy `||` for Snapshot Fallbacks
**Symptom**: Asset value history shows "0,00€" instead of correct value or "—"
**Context**: `snapshotAsset.totalValue` can be stored as `0` (not null) if a snapshot was taken when `quantity = 0` for a new asset. `??` only catches `null`/`undefined`, so `0` passes through unchanged.
**Fix**: Use `||` when `0` is semantically invalid (e.g., `totalValue || (price * qty)` in `assetPriceHistoryUtils.ts`). `price × 0 = 0` for sold assets, so they are unaffected.

### Recharts Legend Color with Cell Overrides
**Symptom**: `<Legend>` shows a black square for a bar series that uses `<Cell>` for conditional coloring (e.g. blue/red depending on value)
**Context**: `<Cell>` overrides per-bar fill at render time but does NOT propagate to `<Legend>` — the legend reads `fill` directly from the `<Bar>` element. Without `fill` on `<Bar>`, Recharts defaults to black.
**Fix**: Always set `fill` on `<Bar>` to the "default" color (e.g. `fill="#3B82F6"`) so the legend shows the expected color; `<Cell>` fills still override individual bars at runtime.

### Unit Testing Patterns

- **Local Date constructor**: Use `new Date(year, month, day)` not ISO string `new Date('2024-03-09')` in test fixtures — ISO strings parse as UTC and shift by 1 hour in CET, causing off-by-one day bugs
- **Float assertions**: Use `toBeCloseTo(expected, precision)` not `toBe` for results of float arithmetic (e.g. `2.8/100/2*1000` = `13.999…` in IEEE 754)
- **Fake timers**: `vi.useFakeTimers()` + `vi.setSystemTime(new Date(year, month, day))` in `beforeEach`; `vi.useRealTimers()` in `afterEach` — required when function calls `new Date()` internally (e.g. `getNextCouponDate`)
- **No mocks needed for pure utils**: Functions with zero external dependencies (only TS type imports) need no `vi.mock()` — directly testable

**Last updated**: 2026-03-09 (session: Filtered Spese per Tipo pie chart in Cashflow)
