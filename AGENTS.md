# AI Agent Guidelines - Net Worth Tracker (Lean)

Project-specific conventions and recurring pitfalls for Net Worth Tracker.
For architecture and status, see [CLAUDE.md](CLAUDE.md).

---

## Critical Conventions

### Italian Localization
- All user-facing text in Italian, **all code comments in English only**
- Use `formatCurrency()` for EUR (e.g. €1.234,56), `formatDate()` for DD/MM/YYYY
- **Compound words**: use "Sottocategoria" (no hyphen) — not "Sotto-categoria" or "sub-category"

### Firebase Date Handling & Timezone
- Use `toDate()` from `dateHelpers.ts` (handles Timestamps, ISO strings, null)
- **Month/year extraction**: Use `getItalyMonth()`, `getItalyYear()`, `getItalyMonthYear()` (NOT `Date.getMonth()`)
- **Why**: Server (UTC) and client (browser) produce same results

### Custom Tailwind Breakpoint
- Use `desktop:` (1440px) instead of `lg:` (1024px), defined in `app/globals.css`
- Below 1440px = mobile/tablet — includes iPad Mini landscape (1024px)
- Built-in orientation variants: `portrait:`, `landscape:`
- **Never use `lg:`** — it's 1024px, which is the wrong threshold
- Bottom nav padding on portrait: `max-desktop:portrait:pb-20` on page root wrappers
- Mobile header (title + buttons): `flex flex-col gap-3 landscape:flex-row landscape:items-center landscape:justify-between` — buttons `w-full landscape:w-auto`
- **Dialog-internal breakpoints**: dialogs never reach `desktop:` (1440px). Use `sm:` (640px) for 2-column grids inside dialogs.
- **Filter sections on mobile**: `flex flex-wrap` does NOT expand items to fill rows. Fix: `grid grid-cols-1 gap-3 desktop:flex desktop:flex-wrap desktop:items-end desktop:gap-4`
- **Quick-action button paired with a filter**: merge in a single grid item as a flex row — `<div class="flex gap-2"><div class="flex-1 min-w-0">…Select…</div><Button class="shrink-0">…</Button></div>`
- **Currency value font in card grids**: `text-2xl` overflows on mobile for 6+ digit amounts. Use `text-lg desktop:text-2xl`
- **Card header with long title + action controls**: `flex flex-col gap-2 desktop:flex-row desktop:items-center desktop:justify-between`
- **Structural overflow tables** (13+ columns): use `hidden desktop:block` wrapper + contextual "disponibile su desktop" hint in mobile UI (e.g. inside detail dialog)
- **Data-dense table pages**: may use `isTablet = useMediaQuery('(min-width: 768px) and (max-width: 1023px)')` to switch to cards below 1024px

### Layout Shell Design Tokens
- **Never hardcode colors in layout components** (Header, Sidebar, BottomNavigation, SecondaryMenuDrawer)
- Use semantic tokens: `bg-background`, `text-foreground`, `border-border` for chrome; `bg-sidebar`, `text-sidebar-foreground`, `bg-sidebar-accent`, `border-sidebar-border` for sidebar
- `bg-white` / `bg-gray-900` / `text-gray-900` in layout = bug — they break the opposite color mode
- Gain/loss colors (`text-green-600`, `text-red-600`) are intentionally hardcoded — they are domain-semantic, not theme-structural
- **Auth pages (login/register) background**: use `bg-gray-50 dark:bg-gray-950` — same as the dashboard main content area (`dark:bg-gray-950`). Do NOT use gradient variants (`bg-gradient-to-br from-blue-50 ... dark:from-gray-950`): they produce an inconsistent dark appearance.
- **Card dark mode on auth pages**: explicitly add `dark:bg-gray-900 dark:border-gray-800` to the `<Card>` — same as dashboard panels. shadcn `CardTitle`/`CardDescription` may also need explicit `dark:text-gray-100`/`dark:text-gray-400` when used outside the normal theme context.
- **`bg-background` in shadcn separators** (e.g. "Oppure" divider): correct as-is — it is a CSS variable that already handles both modes. Do not replace.

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
- **Category type change**: `updateExpensesType(categoryId, oldType, newType, userId)` batch-updates `type` + flips signs if crossing income ↔ expense boundary

### Cashflow Tab Pattern (Parallel Siblings)
- CurrentYearTab and TotalHistoryTab are parallel siblings with independent state
- **Prefer replicating patterns inline** over extracting shared components
- Pie chart drill-down: 3-level state machine (category → subcategory → expenseList) with `DrillDownState` type
- Always reset drill-down state when filters change to prevent stale data
- Blue-bordered card pattern for filtered sections: `border-blue-200 bg-blue-50/50 dark:bg-blue-950/10 dark:border-blue-800`

### Budget Tab Pattern
- **Auto-init**: `autoInitBudgetItems` merges saved amounts with live categories on every mount
- **Scope matching**: `expenseMatchesItem` matches by category/subcategory ID regardless of income/expense type
- **Income section**: `DeltaBadge` and `ProgressCell` accept `inverted?: boolean`
- **Firestore**: single doc `budgets/{userId}`, full replacement on save
- **Amount storage**: `monthlyAmount` stored as monthly; annual view multiplies ×12
- **Deep dive**: click any row → `CategoryDeepDive` panel (`hidden desktop:block`); mobile shows contextual hint in detail dialog
- **Aggregate keys**: `__subtotal_{type}__`, `__total_expenses__`, `__total_income__` — collision-free with real `budgetItemKey` values

### Radix UI Select Values
- **Empty string NOT allowed** as `SelectItem` value (runtime error)
- Sentinels: `__all__`, `__none__` for unselected; `__create_new__` for inline creation flows
- **`SelectTrigger` is `w-full` by default** in this project — don't add `w-full` manually
- **Mobile tab-to-Select pattern**: replace cramped `<TabsList>` with `<Select>` on `max-desktop:`, keep TabsList on `hidden desktop:block`. Both call the same state setter.

### Sankey Diagram Multi-Layer Pattern
- 4-layer structure: Income → Budget → Types → Categories + Savings (5th optional: Subcategories)
- Use `"Category__Subcategory"` format (double underscore) for collision-free IDs
- When filtering nodes, ALWAYS filter corresponding links too (prevents "missing: [NodeName]" errors)

### Settings Service Synchronization
ALL fields in settings types must be handled in THREE places: type definition, `getSettings()`, `setSettings()`.
**Gotcha**: `setSettings()` has TWO write branches (with targets → `setDoc` without merge, without targets → `setDoc` with merge). New fields must be added to BOTH branches.

### Per-Asset Boolean Flags Pattern
- Prefer per-asset opt-in/opt-out flags over hardcoded category exclusions
- Add to: `Asset` + `AssetFormData` types, Zod schema, reset defaults, edit-mode prefill, save payload, AssetDialog toggle

### Dashboard Settings Loading
- Dashboard loads `AssetAllocationSettings` via `useEffect` + `useState` (NOT React Query)
- Pattern: `getSettings(user.uid).then(setPortfolioSettings).catch(() => {})`

### Firestore Patterns
- **Nested object deletion**: `merge: true` does RECURSIVE merge — cannot delete nested keys by omitting them. Fix: GET + `setDoc()` WITHOUT `merge: true`
- **No `undefined` values**: `setDoc()` throws on `undefined`. Build the document object manually, only including fields with a value
- **User-managed data**: When updating docs with calculated + user-managed fields: GET existing → preserve user fields

### YOC / Current Yield Calculation
- Annualization: < 12 months scale up, >= 12 months average
- YOC uses `averageCost` (cost basis), Current Yield uses `currentPrice` (market value)
- Filter dividends by `paymentDate` (not `exDate`); use API route (server-only service)
- **Historical YOC (v3)**: numerator = actual `grossAmountEur`; denominator = `maxDivQty × effectiveCostPerShare` (gross-weighted average of `div.costPerShare`; fallback to `asset.averageCost` for legacy records)
- `div.costPerShare` set server-side at dividend creation — never from user input

### Asset Patterns
- **Zero-Quantity Assets**: `quantity = 0` valid; `isDeleted: asset.quantity === 0` in `assetPriceHistoryUtils.ts`
- **Cash Asset Balance**: `quantity` IS the balance. Update via `updateDoc({ quantity })`, NOT via `updateAssetPrice`
- **Bond Price Convention**: Borsa Italiana returns prices as % of par. Stored value = `biPrice × (nominalValue/100)`. Apply in 4 places: `priceUpdater.ts`, AssetDialog Path 1 (manual), Path 2 (auto), averageCost
- **Bond Coupon Phase 3**: use `getFollowingCouponDate(paidDate, frequency, maturityDate)` — never `getNextCouponDate` (uses local "today", unsafe in UTC cron)
- **Stamp Duty**: `calculateStampDuty(assets, rate, checkingAccountSubCategory?)` in `assetService.ts`

### Formatter Utility Duplication
**Gotcha**: `formatCurrency` exists in BOTH `lib/utils/formatters.ts` AND `lib/services/chartService.ts`. Update both when modifying. Never redefine `formatCurrency` inline in a component — always import from `lib/utils/formatters`.

### Derived State — Use `useMemo`, Not `useEffect + setState`
**Antipattern**: Using `useEffect` to compute filtered/derived lists and store them in a separate `useState`:
```tsx
// ❌ Wrong — causes an extra render on every filter change
const [filtered, setFiltered] = useState(items);
useEffect(() => {
  setFiltered(items.filter(...));
}, [items, filter]);

// ✅ Correct — synchronous, no extra render
const filtered = useMemo(() => items.filter(...), [items, filter]);
```
Only use `useEffect` for side effects (API calls, subscriptions, DOM mutations). Computed/derived values from existing state are always `useMemo`.

### Performance Metrics & Capital Flows
- TWR/CAGR/ROI use cashflow expense records as the sole source of contributions/withdrawals
- `AssetDialog` shows contextual amber hint when `quantity` changes (non-cash assets only)

### Performance Period Baseline Pattern
- `getSnapshotsForPeriod` includes 1 extra month before the period as **baseline** for YTD/1Y/3Y/5Y
- All metric functions that annualize **must use `calculateMonthsDifference(periodEnd, periodStart)`** — NOT `snapshots.length - 1`
- Each chart function handles baseline exclusion independently (heatmap: `i=1`; chart: `.slice(1)`; underwater: `continue at i===0`)

### Skeleton Loading Pattern
Build skeleton screens that mirror the real layout to avoid layout shift and provide visual continuity:
- **File convention**: `ComponentSkeleton.tsx` alongside the real component
- **Primitive**: `SkeletonBar` with `motion-safe:animate-pulse motion-reduce:opacity-40` + `animationDelay` style for stagger wave
- **Stagger**: left-to-right wave via per-element `delayMs`; later sections start after earlier ones (e.g. 0ms, 100ms, 200ms… 800ms)
- **Dynamic heights**: use a plain `<div style={{ height }}` with the pulse classes instead of routing through `SkeletonBar` — Tailwind needs static class names, can't interpolate pixel values
- **Two-phase loading** (outer Firestore fetch + inner API fetch): reuse the SAME skeleton component for both so the two loading states fuse into one continuous animation — no visible join
- **Stale-while-revalidate** on filter changes: gate the full-page skeleton on `!data` (first load only); on subsequent fetches keep old data visible with `opacity-50 pointer-events-none transition-opacity duration-200`

```tsx
// First load only → skeleton
if (!stats) {
  if (loading) return <MyComponentSkeleton />;
  return <EmptyState />;
}
// Filter refetch → dim existing content
return (
  <div className={loading ? 'opacity-50 pointer-events-none transition-opacity duration-200' : ''}>
    {/* real content */}
  </div>
);
```

### Framer Motion Animation Patterns
- **Shared variants**: `lib/utils/motionVariants.ts` — never define variants inline
- **Stagger + conditional elements**: use explicit `transition={{ delay: index * 0.1 }}` per card — parent stagger counts ALL children including conditional slots
- **`motion.tr`**: wrapping shadcn `<TableRow>` with `motion()` breaks table structure. Use `motion.tr` directly
- **`AnimatePresence initial={false}`** on collapsibles that start open — avoids exit animation on mount
- **Easing**: always `[0.25, 1, 0.5, 1]` (ease-out-quart). Never bounce or elastic.

### CSS `animate-in` + prefers-reduced-motion
- Framer Motion respects reduced-motion automatically via `MotionConfig` in `MotionProvider.tsx`.
- **CSS `animate-in` classes** (tw-animate-css) must be guarded manually.
- **Server components** (no `'use client'`): use `motion-safe:animate-in` Tailwind variant — no JS, no hydration issues. Pattern already used in `PerformancePageSkeleton` (`motion-safe:animate-pulse`) and `MetricSection` (`motion-safe:animate-in`).
- **Client components only**: `window.matchMedia('(prefers-reduced-motion: reduce)').matches` + `useState/useEffect` works but causes a post-hydration flash on first render. Prefer `motion-safe:` when possible.
- The `animationDelay` style prop is harmless when no animation classes are active — no need to conditionally omit it.

### next-themes: `theme` vs `resolvedTheme`
- `resolvedTheme` always resolves to `"light"` or `"dark"` — never returns `"system"`. Safe for rendering decisions (pick icon, pick color).
- `theme` preserves the actual stored value: `"light"`, `"dark"`, or `"system"`. Required for cycle logic or detecting "follow OS" state.
- **3-state cycle pattern** (`light → dark → system → light`): use `theme` as the discriminator, call `setTheme('system')` to re-enable OS following. See `Header.tsx`.
- **Testing system-follow**: DevTools "Emulate prefers-color-scheme" only works when `localStorage.getItem('theme')` is `null` or `"system"`. If a user has manually toggled, localStorage wins. Reset with `localStorage.removeItem('theme')` + reload.

---

## Common Errors to Avoid

### Timezone Boundary Bugs
**Symptom**: Entries in wrong month near midnight. **Fix**: Use `getItalyMonthYear()` (NOT `Date.getMonth()`)

### Settings Persistence Bug
**Symptom**: UI toggles save but reset after reload. **Fix**: Update BOTH `getSettings()` and `setSettings()` (three-place rule + two write branches).

### Radix Dialog Auto-Trigger Bug
**Symptom**: Callback doesn't fire when mounted with `open={true}`. **Fix**: Use `useEffect(() => { ... }, [open])`

### Firebase Auth Registration Race Condition
**Symptom**: PERMISSION_DENIED on first Firestore write after user creation. **Fix**: force `getIdToken(true)` + retry logic + Firestore rules using `docId` (not `resource.data`). **Files**: `authHelpers.ts`, `AuthContext.tsx`, `firestore.rules`

### Nullish `??` vs Falsy `||` for Snapshot Fallbacks
**Symptom**: Asset value history shows "0,00€". **Fix**: Use `||` when `0` is semantically invalid (e.g. `totalValue || (price * qty)` in `assetPriceHistoryUtils.ts`).

### Recharts Legend Color with Cell Overrides
**Symptom**: `<Legend>` shows black square for a bar using `<Cell>` for conditional coloring. **Fix**: Always set `fill` on `<Bar>` to the default color — `<Cell>` overrides individual bars but `<Legend>` reads `<Bar>` directly.

### Recharts ResponsiveContainer Inside Hidden Radix Tab
**Symptom**: Console warning `The width(-1) and height(-1)`. **Fix**: Use explicit pixel height: `<ResponsiveContainer width="100%" height={300}>`. Never `height="100%"` inside inactive tabs.

### Recharts Legend Overlapping X-Axis Labels
**Fix**: Add `margin={{ bottom: 20 }}` to the chart root element on every chart with `<Legend />`.

### Unit Testing Patterns
- **Local Date constructor**: `new Date(year, month, day)` not ISO string (ISO parses as UTC, shifts in CET)
- **Float assertions**: `toBeCloseTo(expected, precision)` not `toBe`
- **Fake timers**: `vi.useFakeTimers()` + `vi.setSystemTime()` in `beforeEach`; `vi.useRealTimers()` in `afterEach`

### Controlled Numeric Inputs — Use String State
**Symptom**: `NaN` or `0` when user clears an `<input type="number">`. **Fix**: Store as `string`; convert to `number` only when computing results.

### `invisible` vs `hidden` for Layout-Preserving Removal
Use `invisible` when a placeholder must hold its position in a grid/flex row (e.g. X button on first PMC calculator row).

### `overflow-x-visible` Suppresses Horizontal Scroll
**Fix**: Use `overflow-x-auto` always on wide table wrappers — never remove it at a breakpoint.

### Auto-Generated Dividend Idempotency
Use deterministic Firestore doc ID for `isAutoGenerated=true` dividends: `{assetId}_{YYYY-MM-DD}_{dividendType}`. Makes cron writes idempotent.

### Sign-Dependent Icon Null-State Fallback
When an icon switches between TrendingUp/TrendingDown (or similar) based on a value's sign, always define an explicit fallback for the `null`/no-data case. Default to the "neutral positive" variant (e.g. `TrendingUp` green) — showing a red downward arrow when there is simply no data yet is a false negative signal that confuses users.
```tsx
// Pattern: null → positive default, value < 0 → negative variant
{value && value < 0
  ? <TrendingDown className="h-4 w-4 text-red-500" />
  : <TrendingUp className="h-4 w-4 text-green-500" />
}
```

**Last updated**: 2026-03-20 (session 04: skeleton loading pattern + stale-while-revalidate)
