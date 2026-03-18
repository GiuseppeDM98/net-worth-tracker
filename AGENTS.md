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
- Use `desktop:` (1440px) instead of `lg:` (1024px), defined in `app/globals.css` (`--breakpoint-desktop: 1440px`)
- Below 1440px = mobile/tablet — includes iPad Mini landscape (1024px)
- Built-in orientation variants: `portrait:`, `landscape:`, compound `landscape:md:grid-cols-3`
- **Never use `lg:`** — it's 1024px, which is the wrong threshold for this project
- Bottom nav padding on portrait: `max-desktop:portrait:pb-20` on page root wrappers
- Mobile header pattern (title + buttons): `flex flex-col gap-3 landscape:flex-row landscape:items-center landscape:justify-between` — buttons `w-full landscape:w-auto` (same as Overview "Crea Snapshot")
- Card layout in landscape: `grid grid-cols-1 gap-4 landscape:grid-cols-2`
- Desktop-only tables/views: `desktop:hidden` banner to warn mobile users ("si consiglia la visualizzazione su desktop")
- **Exception — data-dense table pages**: pages with 8+ column tables may use `isTablet = useMediaQuery('(min-width: 768px) and (max-width: 1023px)')` + `useCardView = isMobile || isTablet` to switch to cards below 1024px. The `desktop:` 1440px breakpoint is for layout/navigation patterns, not card-vs-table decisions on dense data pages (e.g. Allocation page).

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

### Budget Tab Pattern
- **Auto-init**: `autoInitBudgetItems` merges saved amounts with live categories on every mount — new categories auto-appear without requiring an explicit save action
- **Scope matching**: `expenseMatchesItem` matches by category/subcategory ID regardless of income/expense type — handles cross-type lookups correctly
- **Income section**: `DeltaBadge` and `ProgressCell` accept `inverted?: boolean` — green means growth for income, red means underspend
- **Firestore**: single doc `budgets/{userId}`, full replacement on save (same pattern as `goalBasedInvesting/{userId}`)
- **Amount storage**: `monthlyAmount` stored internally as monthly; annual view multiplies by 12 for display and ratio calculation (`budgetUsedRatio = currentYearTotal / (monthlyAmount × 12)`)
- **`monthlyAmount` ambiguity**: may be user-set (saved in Firestore) OR auto-computed as `previousYearTotal / 12` via `getDefaultMonthlyAmount()`. The UI does not distinguish between the two — "Budget/anno" column and progress bar use this value in both cases.
- **Deep dive**: click on an item row in annual view → inline `CategoryDeepDive` panel (blue-bordered card, same pattern as Cashflow Tab Pattern). State `selectedItemKey: string | null`. Reset in `handleStartEditing()`. Auto-scroll `scrollIntoView('nearest')` with 100ms delay (same pattern as `CurrentYearTab.tsx`). Min/max month highlight per year row: guards for <2 real months or all equal → no highlight. Colors inverted for Income section.

### Radix UI Select Values
- **Empty string NOT allowed** as `SelectItem` value (runtime error)
- Use sentinel values: `__all_years__`, `__all__`, `__none__` for "unselected" options
- For optional fields: use `undefined` value + placeholder text
- **Always use Radix `Select` (`@/components/ui/select`) for styled dropdowns** — native HTML `<select>` ignores `height`, `padding-y`, and most CSS on iOS. Radix renders a fully styleable trigger button.
- **Mobile tab-to-Select pattern**: when a `<TabsList>` becomes cramped on mobile (long labels, icons, or ≥ 3 tabs), replace with a `<Select>` on `max-desktop:` and keep TabsList on `hidden desktop:block`. The Select updates the same controlled state variable — tab content renders correctly because it reads state, not DOM. Pattern used in Assets, FIRE, and Performance pages. Use `useState<TabValue>` + `<Tabs value={activeTab} onValueChange={...}>` in the page; both Select and TabsList call the same setter.

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
- **`chartDividends` vs `paidDividends`** in the stats route: `paidDividends` is all-time/all-asset (used for `totalReturnAssets`, `dividendGrowthData`); `chartDividends` is derived from it with active `assetId` + date range applied (used for `byYear`, `byMonth`)
- **Single-bound date filter**: route accepts `startDate` or `endDate` independently. Missing bound is filled: `startDate` only → `endDate = new Date('9999-12-31')`; `endDate` only → `startDate = new Date(0)`. This lets `calculateDividendStats` (which requires both) work correctly without changing the service layer.

### Anthropic API Patterns
- **Current date in prompt**: Provide `Oggi è il ${today}` for time-sensitive analysis (knowledge cutoff)
- **SSE Streaming**: ReadableStream with `text/event-stream`, split by `\n\n`, keep incomplete lines in buffer
- **Extended Thinking**: 10k token budget for deeper reasoning
- **Native Web Search**: Use `{ type: 'web_search_20250305', name: 'web_search', max_uses: N }` in `tools[]` — no beta header, no external API key. Claude decides autonomously what to search. Stream emits `server_tool_use` + `web_search_tool_result` blocks; filter for `text_delta` only.
- **Streaming + ReactMarkdown**: Never render partial markdown with ReactMarkdown during streaming — it re-parses the entire string on every chunk causing layout jumps. Render as `whitespace-pre-wrap` plain text during streaming; switch to ReactMarkdown only on completion.

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

### Recharts ResponsiveContainer Inside Hidden Radix Tab
**Symptom**: Console warning `The width(-1) and height(-1) of chart should be greater than 0`.
**Cause**: `ResponsiveContainer height="100%"` measures its container while it is `display:none` (inactive Radix `TabsContent`), returning -1.
**Fix**: Use an explicit pixel height directly on `ResponsiveContainer`: `<ResponsiveContainer width="100%" height={300}>`. Never use `height="100%"` inside a fixed-height wrapper div — pass the number directly and remove the wrapper div.

### Recharts Legend Overlapping X-Axis Labels
**Symptom**: `<Legend>` renders on top of the x-axis tick labels inside a `ResponsiveContainer`.
**Context**: Recharts renders the legend inside the SVG height — it eats into chart space and can overlap the bottom axis without explicit margin.
**Fix**: Add `margin={{ bottom: 20 }}` to the chart root element (`<AreaChart>`, `<LineChart>`, etc.). Apply to every chart component that uses `<Legend />`.

### Unit Testing Patterns

- **Local Date constructor**: Use `new Date(year, month, day)` not ISO string `new Date('2024-03-09')` in test fixtures — ISO strings parse as UTC and shift by 1 hour in CET, causing off-by-one day bugs
- **Float assertions**: Use `toBeCloseTo(expected, precision)` not `toBe` for results of float arithmetic (e.g. `2.8/100/2*1000` = `13.999…` in IEEE 754)
- **Fake timers**: `vi.useFakeTimers()` + `vi.setSystemTime(new Date(year, month, day))` in `beforeEach`; `vi.useRealTimers()` in `afterEach` — required when function calls `new Date()` internally (e.g. `getNextCouponDate`)
- **No mocks needed for pure utils**: Functions with zero external dependencies (only TS type imports) need no `vi.mock()` — directly testable

### Auto-Generated Dividend Idempotency
- `createDividend()` in `dividendService.ts` uses a **deterministic Firestore document ID** for `isAutoGenerated=true` dividends: `{assetId}_{YYYY-MM-DD}_{dividendType}`
- This makes cron writes idempotent — concurrent Vercel invocations write to the same doc ID (last-write-wins = one document, no duplicates)
- Manual dividends (`isAutoGenerated=false`) still use `.add()` (random ID)
- `isDuplicateDividend()` is kept as a cheap early-exit optimisation but is NOT the dedup guarantee

### Equal-Width Button Groups
- **Avoid `flex-1` on `inline-flex` buttons** for equal-width distribution — centering is unreliable across devices
- **Use `grid grid-cols-N`** instead: each cell has a fixed equal width, button fills with `w-full`, centering is guaranteed
- For conditional buttons (e.g. optional "Tasse"): 2-row layout — optional full-width button on top, fixed 2-col grid below

### CSS Grid Animation Wrapper — Equal Height Broken
**Symptom**: Cards in the same grid row have different heights after wrapping them in a `<div>` for stagger animations.
**Cause**: CSS grid stretches *direct children* to row height. A wrapper div is stretched, but the component inside takes only its natural height.
**Fix**: Add `h-full` to **both** the wrapper div AND the inner component's root element. Missing either one breaks equal-height.
```tsx
// MetricSection.tsx
<div className="... h-full" style={{ animationDelay: ... }}>  {/* wrapper */}
  {child}  {/* child must also have h-full on its root Card */}
</div>
```

### Controlled Numeric Inputs — Use String State
**Symptom**: Controlled `<input type="number">` shows `NaN` or `0` when the user clears the field.
**Cause**: Storing state as `number` means an empty field becomes `NaN`, which React renders as an empty string but the next `onChange` reads back as `NaN`, causing a feedback loop.
**Fix**: Store transient input state as `string`; convert to `number` only when computing a result (e.g., `parseFloat(entry.qty)`). Pattern used in `brokerEntries` for the PMC calculator.

### `invisible` vs `hidden` for Layout-Preserving Removal
**Symptom**: Removing a button with `hidden` causes sibling elements to shift or resize.
**Cause**: `display: none` removes the element from flow; the grid column or flex row collapses.
**Fix**: Use `invisible` (Tailwind) — the element is hidden visually but still occupies space. Use when a placeholder must hold its position (e.g., the X button on the first calculator row when only one row exists).

### Inline Panel vs Dialog-Within-Dialog
**Symptom**: Opening a `<Dialog>` from inside another `<Dialog>` causes focus/z-index issues in Radix UI.
**Fix**: Use an inline expandable panel (toggle state + conditional render) instead. Keeps visual context, avoids Radix nesting issues. Pattern used in the PMC multi-broker calculator in `AssetDialog.tsx`.

### Animated Float Values with Integer Display Formats
**Symptom**: `format="months"` cards show decimals during count-up animation (e.g. `"1a 1.5m"` instead of `"1a 2m"`).
**Cause**: `useCountUp` passes float intermediates (e.g. `13.5`) to `formatValue`. The `months` case uses `val % 12` which returns `1.5` on floats.
**Fix**: `Math.round(val)` before any integer math (`Math.floor`, `%`) in display-format functions that expect whole numbers.

**Last updated**: 2026-03-18 (session: FIRE & Simulazioni mobile & tablet responsive audit)
