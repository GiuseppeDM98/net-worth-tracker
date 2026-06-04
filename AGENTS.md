# AI Agent Guidelines - Net Worth Tracker (Lean)

Project-specific conventions and recurring pitfalls for Net Worth Tracker.
For architecture and current product status, see [CLAUDE.md](CLAUDE.md).

---

## Critical Conventions

### Italian Localization
- All user-facing text in Italian, all code comments in English only
- **Microcopy in TSX gotcha — curly apostrophes**: the Edit tool can introduce typographic Unicode apostrophes (`'`, `'`) instead of ASCII straight single quotes (`'`). In `.tsx` files TypeScript treats them as invalid characters and throws `TS1127: Invalid character` on the affected lines. The error points at the string but looks like a syntax problem — not obvious until you inspect the raw bytes. Fix: rewrite the affected string constants using double-quote delimiters (`"..."`) or explicitly replace the curly characters. Apply this check after any session that edits Italian prose strings in TypeScript files.
- **Inline tag spacing in JSX**: placing text directly adjacent to a `<strong>`, `<em>`, or other inline tag causes the browser to collapse whitespace — words get glued together (e.g. `"non"` becomes `"nonil"`). Fix: use explicit `{' '}` on both sides of the tag: `text before {' '}<strong>word</strong>{' '} text after`. Applies to any inline element in JSX, not just `<strong>`.
- Use `formatCurrency()` for EUR and `formatDate()` for `DD/MM/YYYY`
- Use `Sottocategoria` (no hyphen). For overview/header greetings, keep `Buongiorno Giuseppe` / `Buonasera Giuseppe` without a comma before the first name.
- **Navigation taxonomy (established in session 30):** Panoramica, Patrimonio, Allocazione, Rendimenti, Storico, Impostazioni. The following are kept in English intentionally: `Hall of Fame` (premium brand name), `FIRE e Simulazioni` (acronym), `Cashflow` (established financial term in Italian). Do not translate these back.
- `Assistente AI` is an established secondary navigation label under `Analisi`; do not rename it to `Chat AI`, `Copilot`, or generic `Assistant`
- **Performance metric names:** `Time-Weighted Return`, `Money-Weighted Return (IRR)`, `Sharpe Ratio`, `YOC`, `Max Drawdown` are kept as international standard terms. `Recovery Time` → `Tempo di Recupero`, `Current Yield` → `Rendimento Corrente`.

### Firebase Dates and Timezone
- Use `toDate()` from `dateHelpers.ts`
- For month/year extraction use `getItalyMonth()`, `getItalyYear()`, `getItalyMonthYear()`
- Never use `Date.getMonth()` / `Date.getFullYear()` for domain grouping

### Tailwind Breakpoint
- Use `desktop:` (1440px), never `lg:`
- Dialog-internal responsive layouts use `sm:`
- Bottom page wrappers on portrait mobile should use `max-desktop:portrait:pb-20`
- Currency values in compact KPI grids should use `text-lg desktop:text-2xl`
- **Container queries for components rendered at multiple widths**: when the SAME component renders both full-width (e.g. dashboard) and inside a narrow column (e.g. a 360px sidebar), a viewport breakpoint (`desktop:`) cannot serve both — it keys off the screen, not the component's box. Mark the wrapper `@container` and use `@2xl:` (≥672px) etc. against the component's own width. Applied in `CashflowWidget`/`CashflowKpiCarousel` (2×2 grid when narrow → single row of 4 when wide). ⚠️ Mixing axes is fine and often necessary: column count = container query (`@2xl:grid-cols-4`), but mobile-vs-desktop affordances (e.g. show a drawer trigger vs an inline breakdown) stay on viewport (`tablet:hidden`) because they depend on the device, not the box.
- **Per-cell `@container` for monetary values that must not overflow**: large amounts (`+523.677,51 €`) overflow fixed `text-2xl` in narrow grid cells. Make each cell its own `@container` and scale the value font to the CELL width: `text-base @[150px]:text-lg @[190px]:text-xl @[240px]:text-2xl` + `min-w-0 break-words` as a safety net. This adapts to the actual cell width regardless of how many columns the grid has. Applied in `CashflowKpiCarousel` KPI cells.
- **Multi-card grid breakpoint decision**: adding `sm:grid-cols-2` to a 3-item row leaves the third card alone on a half-width row at 640px — often worse than a full-width stack. Prefer no `sm:` breakpoint (full-width stack on mobile) → `desktop:grid-cols-3` directly. Reserve `sm:grid-cols-2` for content where 2 columns genuinely helps at 640px (e.g. Bear/Base/Bull scenario cards where any pairing is better than a single tall column).
- **NEVER mix arbitrary `min-[px]:` with named breakpoints (`sm:`/`desktop:`) on the same property — Tailwind v4 rem/px mis-ordering**: named breakpoints compile to **rem** media queries (`sm` → `@media (min-width:40rem)`) while arbitrary `min-[960px]:` compiles to **px**, and v4 emits the rem block *after* the px block in the stylesheet. So `sm:grid-cols-2 min-[960px]:grid-cols-3` renders **2 cols at every width ≥640px** — the `min-[960px]` rule is overridden by the later `sm` rule and never wins. Verified in the built CSS (`@media (min-width:40rem)` byte-offset > `@media (min-width:960px)`). When you need a column breakpoint between `tablet:`(768) and `desktop:`(1440), use a **container query** instead: wrap in `@container` and use `@[640px]:grid-cols-2 @[960px]:grid-cols-3` (all px, separate cascade, ordered correctly — confirmed `@container (min-width:640px)` precedes `@container (min-width:960px)`). Applied to the Coast FIRE Bear/Base/Bull cards.
- **`items-end` for mixed-height label rows**: only use `items-end` on a form grid when ALL cells have the same structure (label + input, nothing else). `items-end` aligns the bottom edge of the entire cell div — if any cell has hint text below its input, the hint becomes the new "bottom", so cells without hint text float their input down to match the hint height of the taller cell. In that case use `items-start` instead and shorten long labels so they don't cause height divergence. Rule: hint text in any cell → `items-start`; uniform label+input only → `items-end` is safe.
- **Nested Radix collapsible chevron rotation**: `CollapsibleTrigger asChild` propagates `data-state="open|closed"` to its child element. Add `group` to the child Button, then `group-data-[state=open]:rotate-180 transition-transform duration-200 motion-reduce:transition-none` to the `ChevronDown` inside. No extra React state needed. Works in Tailwind v4.
- **Radix `<Collapsible>` vs Framer Motion `height: 'auto'` for tall variable-height sections**: for expandable rows where content height is large or unpredictable (lists of sub-items, full form sections), prefer Radix `<Collapsible>` with CSS transition over `AnimatePresence` + `height: 'auto'`. The Framer Motion `height: 'auto'` animation requires a `ResizeObserver` wrapper to avoid a visible layout flash — extra complexity for minimal gain. Reserve `AnimatePresence + height: 'auto'` for small, predictable-height content (a label toggle, a few lines of text). Applied in the Settings unified asset class card sub-category expansion.
- **Inline accordion via CSS `grid-template-rows` (most robust for nested lists)**: for a list whose rows expand into sub-rows (and sub-sub-rows), animate a wrapper between `grid-rows-[0fr]` and `grid-rows-[1fr]` with the inner child `overflow-hidden` — pure CSS (`transition-[grid-template-rows]`, `motion-reduce:transition-none`), no height measurement, nests cleanly. Content must stay mounted for the transition to size, so mark the closed wrapper `inert` (React 19 boolean prop) to keep it out of the focus order + a11y tree. ⚠️ Framer `AnimatePresence` + `height:'auto'` + `opacity` for such a list left the revealed rows **stuck at opacity 0** (visible box, invisible content) — the symptom looks like missing data, not an animation bug. Applied in `AllocationBreakdown` (`CollapseRegion`).
- **`layout` vs `layout="position"` when a Framer Motion parent wraps a Radix Collapsible**: Using bare `layout` on a `motion.div` that contains `CollapsibleContent` causes visible text stretch when collapsing. When `CollapsibleContent` changes height, Framer Motion intercepts the parent's size change and applies a scale transform to animate it — this scales all children including the trigger text. Fix: use `layout="position"` which only animates X/Y translation, not size changes. Applied in the cost-basis section of `app/dashboard/page.tsx`.
- **Chevron rotation for manual `useState` open/close** (no Radix `data-state`): pair the icon with `transition-transform duration-200 motion-reduce:transition-none ${open ? 'rotate-180' : ''}`. Always render the chevron on expandable rows — the click affordance is invisible without it. Applied in `ExposureSection` row drill-downs.

### shadcn Card Built-in Padding
- `Card` (new-york) has `py-6` built-in via its own className. When there is no `CardHeader`, `CardContent` is the first child — no manual `pt-6` is needed on `CardContent`. Add it only if you need extra top spacing beyond the Card's own `py-6`.
- `CardContent` adds `px-6` only (no vertical padding). The vertical rhythm comes entirely from the Card's `py-6` + the `gap-6` between children.
- **`CardHeader` applies `flex flex-col` — breaks inner flex-1 truncation**: shadcn's `CardHeader` renders as `flex flex-col`. If you place a `flex justify-between` row inside it, any `flex-1` grandchild acts on the vertical axis instead of horizontal — text `truncate` stops working and `shrink-0` siblings get pushed off-screen. Fix: replace `CardHeader` with a plain `<div className="px-4 py-3 flex items-start gap-2">` (or whatever padding you need) when you need a horizontal flex layout in a card header. This was the root cause of long asset names overflowing `AssetCard` and hiding the chevron. Applied in `components/assets/AssetCard.tsx`.

### Layout Tokens
- Never hardcode structural layout colors in shell components
- Use semantic tokens like `bg-background`, `text-foreground`, `border-border`
- For income/positive values use `text-emerald-600 dark:text-emerald-400`; for losses/expenses use `text-destructive`. Never use raw `text-green-*` or `text-red-*` — these diverge from `--destructive` on non-default themes (e.g. Cyberpunk uses orange for destructive). Applied in `ExpenseTrackingTab.tsx` KPI blocks and `MobileExpenseRow`.
- **`--positive` token for performance metric positive values**: `text-positive` / `text-destructive` for positive/negative metric numbers. Shared utility `getMetricValueColor(val, format)` in `lib/utils/metricColors.ts` — single source of truth, avoids the `text-green-600 dark:text-green-400` pattern that was duplicated in `HeroMetricBlock`, `MetricCard`, and `BenchmarkComparisonChart`. Token registered in `globals.css` `@theme inline` as `--color-positive: var(--positive)`. Custom themes that don't declare `--positive` inherit from `:root` (light) or `.dark` (dark) — CSS var cascade: the highest-specificity block that actually *declares* the variable wins; blocks that don't declare it fall through. Do not add `--positive` to each individual theme block unless the theme needs a non-standard green.
- **`--warning` token (amber)**: registered in `globals.css` as `--color-warning/foreground/border` → `bg-warning text-warning-foreground border-warning-border`. ⚠️ In light mode `--warning` is near-white (`oklch(0.986 0.022 90)`), so on a `bg-warning` fill the text must use the dark `text-warning-foreground` arm to stay legible. NOTE: Allocation's COMPRA/VENDI/OK chips no longer use these semantic tokens — they are theme-mapped to the chart palette via `useActionColors` (see "Action/semantic colors that must follow the theme" under Color Theme System), because `--warning/--positive/--destructive` are identical across all six themes and so cannot carry theme personality.
- **Overview KPI value colors**: financial values in conditional sections (cost basis, TER, costs) on Panoramica must use design system tokens. Neutral values (Patrimonio Netto/Liquido Netto) → `text-foreground`. Cost/warning signals (Tasse Stimate, Costo Annuale Portfolio, TER) → `text-amber-600 dark:text-amber-400` (Amber Watch, `--chart-3`). `text-blue-600`, `text-purple-600`, `text-orange-600` are raw Tailwind defaults with no semantic meaning in this design system; `text-purple-600` is flagged by the `impeccable` detector as `ai-color-palette`.
- **Sidebar accent token semantics**: `--sidebar-accent` is the background for active/hover items. `--sidebar-accent-foreground` is for text that sits ON that background (designed to contrast with it). `--sidebar-primary` is for accent-colored elements on the plain sidebar background — do NOT use it for text on an accent-colored background. In cyberpunk/solar-dusk dark, `--sidebar-accent` is bright (L≈0.89 cyan), so only `--sidebar-accent-foreground` (dark) has sufficient contrast.
- **Inline `style` blocks Tailwind hover variants**: if a color or opacity is set via inline `style={{ color, opacity }}`, Tailwind hover/focus class variants (e.g. `hover:text-sidebar-accent-foreground`) cannot override it — inline styles always win. Migrate to Tailwind classes before adding any hover/focus variants. Applied in `BottomNavigation.tsx` (sessions sidebar-hover-theme-fix, bottom-nav-hover-theme-fix).
- **`color-mix()` for alpha tints from runtime colors**: when a component receives a theme-aware color at runtime (e.g. from `useChartColors()`) and needs a tinted border/background, use `color-mix(in srgb, ${color} 40%, transparent)` for border and `color-mix(in srgb, ${color} 10%, transparent)` for fill. Supported in Chromium 111+, Firefox 113+, Safari 16.2+. Apply via inline `style` (not className) since the value is dynamic. Applied in `FIREProjectionSection` sensitivity matrix cells.
- **Scenario config arrays without hardcoded colors**: when a component has semantic per-item colors driven by `useChartColors()`, strip color properties from the static config object — keep only `label` and `icon`. Resolve colors inside the component via an index mapping (`{ bear: chartColors[4], base: chartColors[0], bull: chartColors[1] }`). Pass colors as `style={{ color }}` inline on affected elements, not as className strings. Applied in `FIREProjectionSection.tsx`.

---

## Key Patterns

### React Query and Derived State
- Invalidate all related caches after mutations
- **Asset mutations require dual cache invalidation**: `onClose` handlers after `AssetDialog` must invalidate BOTH `queryKeys.assets.all` AND `queryKeys.dashboard.overview`. The hero block on the Patrimonio page reads from `useDashboardOverview` — a separate RQ key from `useAssets`. Invalidating only `assets.all` updates the asset cards and table but leaves the hero total stale until the TTL expires or a manual refresh. Rule: any close handler after an asset mutation must call `invalidateQueries` for both keys. Applied in `handleCashDialogClose` (`assets/page.tsx`) and `handleDialogClose` (`AssetManagementTab.tsx`).
- Never remove tabs from `mountedTabs`
- For state-preserving tab UIs, keep per-scope active tab state explicitly (e.g. separate sub-tab state for `Anno Corrente` and `Storico`) instead of sharing one global sub-tab value
- Use `useMemo` for derived state; do not use `useEffect + setState` for computed values
- When a private API returns date-like values for React Query consumers, normalize them at the hook boundary with `toDate()` instead of scattering conversions inside page components
- **Lazy-load gating for heavy panels**: for collapsible sections that hit an expensive endpoint (Yahoo Finance, scraping, etc.), gate the query with `enabled: !!userId && isOpen`. The fetch only fires on first expand; subsequent expands hit the React Query cache. Applied in `usePortfolioExposure` + `ExposureSection`.
- **`forceMount` tabs that derive from another tab's data MUST use React Query, not `useState`+`useEffect`**: Cashflow tabs are `forceMount` + `mountedTabs`, so a tab's mount-time `useEffect` runs once and never re-fires when sibling data changes. A `useState`/`useEffect` loader becomes stale until a full page reload. `CostCentersTab` (per-center spend stats derived from expenses) was the symptom — adding an expense in the Monitoraggio tab didn't refresh it. Fix: move the loader to `useQuery` and have the mutating tab invalidate the key. Applied: `CostCentersTab`/`CostCenterDetail` on `queryKeys.costCenters.*`, invalidated by `ExpenseDialog` (every save) and `ExpenseTrackingTab` (every delete path). Invalidate **unconditionally** on expense save/delete — an edit can remove a cost center as easily as add one.
- **Shared key prefix for list + detail invalidation**: `queryKeys.costCenters.all(uid)` = `['cost-centers', uid]` is a prefix of `costCenters.expenses(uid, centerId)` = `['cost-centers', uid, centerId, 'expenses']`. Invalidating `all` refreshes an open detail view too via React Query prefix match — one invalidation call covers both.

### Dynamic Imports
- `next/dynamic` with named exports must unwrap via `.then(m => ({ default: m.Named }))`
- Use `ssr: false` for client-only dialogs and panels
- Pass the props type parameter to preserve type safety

### Responsive Modals (`ResponsiveModal`)
- **Prefer `ResponsiveModal` for form-style modals**: `components/ui/responsive-modal.tsx` renders a centered `Dialog` on desktop and a vaul bottom-sheet `Drawer` on mobile (≤768px) from one API (`open`/`onClose`/`title`/`description`/`headerExtra`/`children`/`footer`/`dialogClassName`). When creating or redesigning a modal, prefer it over hand-rolling the `useMediaQuery` + Dialog/Drawer split — it is the **convergence target** so the app's modals behave uniformly across devices. Currently adopted by `ExpenseDialog` and `CategoryManagementDialog`.
- **Caveats (not a universal drop-in)**: default width is `max-w-4xl` — override via `dialogClassName` (too wide for small confirms); the caller resolves footer button layout per breakpoint (the `footer` slot takes a plain `ReactNode` — split it with `useMediaQuery` yourself if desktop/mobile differ); small confirm/alert dialogs (`LogoutDialog`, delete confirms) and specialized flows (e.g. `AssetDialog` 2-step) may stay a plain `Dialog`.
- `DialogDescription`/`DrawerDescription` is handled internally (falls back to the string value of `title`) — you do not need to add it manually when using `ResponsiveModal`. See the description-required note below for plain `Dialog`/`Drawer` usage.

### Dialog Form Reset Pattern
- Dialog `useEffect` that resets form state must include `open` in its dependency array — without it, reopening the dialog for a second creation (where the guarding prop, e.g. `asset`, stays `null` between opens) leaves the effect's deps unchanged and the effect never re-fires, so stale field values persist.
- Guard the top of the effect with `if (!open) return` — prevents a spurious reset when the dialog closes (open transitions `true → false`).
- The `else` (new-record) branch of the reset must enumerate **every** field including optional ones (e.g. `isin`, `bondCouponRate`, `bondCouponRateSchedule`, …). Omitting a field silently carries its value across opens; only the edit branch round-trips those fields from Firestore and catches the omission.
- Call `replaceTiers([])` (or equivalent `useFieldArray` reset) in the same branch — `reset()` does not clear field arrays.
- **`React.ElementType` for Lucide icons in data arrays**: when storing a Lucide icon component in a typed constant array, use `React.ElementType` as the field type — NOT `(p: { className?: string }) => JSX.Element` or `React.ReactElement`. Lucide exports `ForwardRefExoticComponent`, which is not assignable to a function-call signature but is assignable to `React.ElementType`. Requires `import React from 'react'`.
- **`useWatch()` for render, `getValues()` for handlers — never `watch()`**: React Hook Form's `watch()` is incompatible with the React Compiler; the compiler skips the entire component and logs "Compilation Skipped". Convention: use `useWatch({ control, name: 'field' })` at the top of the component for all reactive render-time reads (including values referenced in JSX and render IIFEs). Use `getValues('field')` inside event handlers (`onChange`, `onCheckedChange`, `useEffect`) for point-in-time reads. Never call `watch('field')` directly — remove `watch` from all `useForm` destructures. Applied in `AssetDialog.tsx`, `ExpenseDialog.tsx`, `CategoryManagementDialog.tsx`, `DividendDialog.tsx` (session refactor-usewatch-2026-05-17).
- **Submit button outside `<form>` via `form` attribute**: `<button type="submit" form="my-form-id">` connects a button to a form by ID without nesting. Critical when the form is inside a scrollable div and the footer button is a sibling outside that div — nesting would break the layout. The `<form>` tag just needs `id="my-form-id"`.

### Cashflow Drill-Down: Two Independent Rendering Paths
- The Cashflow Analisi tab has **two completely independent drill-down paths** that both render transaction lists:
  1. **Pie chart drill-down** → `ExpenseList` component in `components/cashflow/AnalisiTab.tsx` (L.~1363)
  2. **Sankey diagram drill-down** → inline IIFE in `components/cashflow/CashflowSankeyChart.tsx` when `mode === 'transactions'`
- A change in one does NOT affect the other. Always apply parallel changes to both files when modifying the transaction list UI.

### Sankey Drill-Down: Preserving Parent Color Through State Levels
- The Sankey uses a 3-level state machine (`mode: 'type' | 'category' | 'transactions'`). Category node colors are derived from the parent type color via `deriveSubcategoryColors()` (darker hex variants).
- **Problem**: `handleBack` from `mode='category'` → `mode='type'` restoring `prev.color` gets the derived (darker) category color, not the original type color → gray panel bug.
- **Fix**: add `parentTypeColor?: string` to state. `handleNodeClick` saves `parentTypeColor: node.color` on the first type-level click and propagates it through category. `handleBack` restores `prev.parentTypeColor || prev.color`.
- Applied in `CashflowSankeyChart.tsx`.

### Cashflow KPI Disambiguation (Risparmio Netto vs Rapporto)
- The Cashflow KPI grid (`components/cashflow/cashflow-kpi/CashflowKpiCarousel.tsx`) shows *Risparmio Netto* (€, `net = income + expenses`, subtitle "X% del reddito") and *Rapporto* (`income / |expenses|`, "X.XX×"). These encode the **same** income-vs-expense relationship in different units (`ratio = 1/(1 − savingsRate)`) and are kept as separate KPIs **on purpose** (saved amount vs coverage health) — do NOT "deduplicate" by removing one. A tappable info `Popover` on each label disambiguates them.
- `KpiCell.info?` is rendered as a `Popover` (NOT `Tooltip`) so it opens on tap on mobile. Pass `info` only to the non-button cells (`netto`/`rapporto`); never to the `categorie` cell, which is already a `<button>` — nesting a `<button>` (the popover trigger) inside it is invalid HTML.

### Cardified Mobile Views Need Their Own Reading Note
- A matrix/table that collapses to per-row cards on mobile (e.g. `WhatIfSensitivitySection`) must NOT reuse the desktop "rows/columns" framing in its help copy — there are no rows/columns on the card view. Split the note: `hidden desktop:block` for the table version, `desktop:hidden` for a card-oriented version. Also label each card's axes explicitly: an eyebrow for the grouping dimension (e.g. `SPESE ANNUE` on the card header) and a sub-label for the inner cell grid (e.g. `Risparmio annuo`).

### Expense Sign Convention
- Income is stored positive
- Expenses are stored negative
- Net savings is `sum(income) + sum(expenses)`
- When moving records across income/expense boundaries, flip the sign

### History and Snapshot Baselines
- End date for Firestore month queries must include the full last day
- Annual deltas use December of the previous year as baseline, not January of the same year
- Monthly heatmaps remain month-over-month and always use the immediately previous month
- For Patrimonio `Anno Corrente` historical tables, include the previous month as a hidden calculation baseline when the first visible month needs a comparison (e.g. January vs previous December), but do not render the baseline month in the UI
- When a hidden baseline is present and only one month is visible in the current year, both `Mese Prec. %` and `YTD %` should reuse that baseline-backed change instead of showing `-`
- `MonthlySnapshot` fields built in `createSnapshot()` must also be added to `POST /api/portfolio/snapshot`

### History: Savings vs Labor vs Performance
- `prepareSavingsVsInvestmentData*()` decomposes monthly/annual net worth growth into `netSavings` and `investmentGrowth`
- `prepareMonthlyLaborMetricsData()` is the single source for the History `Lavoro & Investimenti` section
- For History month counts, use `netWorthGrowth`, not `investmentGrowth`
- Zero-change months (`netWorthGrowth === 0`) are excluded from positive/negative month counters
- Performance heatmap is similar visually but semantically different: it isolates investment returns after cash flows
- **Two CAGR formulas — intentionally different values**: Storico hero CAGR = `(endNW / startNW)^(12/months) - 1` (raw wealth growth, includes contributions in the numerator growth). Rendimenti CAGR = `(endNW / (startNW + netCashFlow))^(1/years) - 1` (investment return, contributions added to denominator as invested capital). They measure different things and will show different numbers for the same period — this is correct. Storico > Rendimenti when the user is actively contributing.

### Patrimonio: Asset Delta Columns
- `assetPerformanceData` in `AssetManagementTab.tsx`: for each asset, `currentValue = useTotal ? calculateAssetValue(asset) : asset.currentPrice` (unit price for ticker assets, total value for manual-price assets). Snapshot entries store `price` or `totalValue` accordingly.
- **Δ Inizio (`allTimeDelta`) base**: for ticker assets with `averageCost` (`!useTotal && averageCost > 0`), use `averageCost` as base — the first monthly snapshot may have been taken days/weeks after purchase with the price already moved. Falls back to `firstEntry.value` for manual-price assets or no cost basis.
- **All three deltas same value**: happens when the asset has only one historical snapshot for the current year and no previous-year snapshots — Δ Mese, Δ YTD (falls back to first this-year snapshot), and Δ Inizio all point to the same snapshot. Normal for recently added assets.
- G/P % ≠ Δ Inizio even after the averageCost fix only when the asset was purchased at a price that was already booked in a snapshot on the same day. They are identical for assets where purchase → first snapshot spans the same price point.

### Budget
- `autoInitBudgetItems` merges saved amounts with live categories on every mount
- `expenseMatchesItem` matches by category/subcategory ID regardless of income/expense type
- Amounts are stored monthly; annual views multiply by 12
- Aggregate keys: `__subtotal_{type}__`, `__total_expenses__`, `__total_income__`
- `BudgetItem.order` is required, including in tests and helper fixtures
- In Budget desktop flows, prefer rendering large local subtrees as pure render helpers or top-level components, not nested JSX component definitions inside the page component; otherwise simple row selection can remount the whole table and cause visible flashes
- **React Compiler: components must be at module level** — never define a component (function that returns JSX) inside another component's body, even as a helper. React Compiler detects this and throws "Cannot create components during render" at every call site. The component can close over parent state IF state is passed as explicit props; if it needs parent state, move it to module level and pass state + setters as props. Applied to `SortHead` in `AssetManagementTab.tsx` (receives `sortState` + `onSort` as props) and `MobileHistoricalView` in `assets/page.tsx` (own `useState` for open/close).

### Settings Synchronization
- Every new settings field must be handled in three places: type definition, `getSettings()`, `setSettings()`
- `setSettings()` has two write branches; update both
- Assistant preference fields mirrored into settings must stay aligned with the assistant memory document and `AssetAllocationSettings`
- **Feature toggle placement**: all feature toggles (`costCentersEnabled`, `goalBasedInvestingEnabled`, `stampDutyEnabled`, etc.) live in `AssetAllocationSettings` (`types/assets.ts` + `assetAllocationService.ts`). Do NOT add them to `UserPreferences` / `userPreferencesService.ts`. The 3-place rule applies here too.
- **Derived-boolean resets on reload — always store explicitly**: if a boolean toggle's initial state is derived from the presence of another field (e.g. `autoCalculate = userAge !== undefined && riskFreeRate !== undefined`), disabling the toggle has no effect on reload because the source fields remain unchanged in Firestore. Always add a dedicated `boolean?` field to `AssetAllocationSettings` and persist it explicitly. Use `?? derivedFallback` on load for backward compatibility with existing users. Applied to `autoCalculateEquityBonds` (was previously derived from `userAge`/`riskFreeRate` presence).
- **Cashflow settings fallback semantics**: `cashflowHistoryStartYear` may bootstrap from a hardcoded default, but that value is only a non-fatal fallback; preserve the saved settings value whenever `getSettings()` succeeds and log fallback activation explicitly.

### Settings UX Layer (Overdrive)
- Unsaved preview in Settings is local-only: use a baseline snapshot key captured on load/save and compare against current state (`hasUnsaved*`) without introducing autosave behavior
- If you add a new Settings field that participates in unsaved preview, update both baseline and current snapshot builders; missing fields create false clean/dirty states
- **Snapshot key purity rule**: include ONLY fields that are persisted in Firestore in dirty-state comparison keys — both the live `useMemo` key and the baseline captured on load. Pure UI state (`expanded`, `open`, collapse state) must be excluded. If it's in the key, toggling a visual control silently creates a false dirty indicator on every click. The `allocationBaselineKey` must also be set *after* the full Firestore state is loaded and applied, not before — otherwise the baseline is "dirty" from the first render.
- For immediate control feedback in Settings forms, prefer one shared utility class for `Input`/`SelectTrigger`/`Switch` transitions and include `motion-reduce` fallback
- For nested allocation editors, prefer `CollapsibleContent` with short, sober transitions over custom animation stacks; keep expand/collapse readable under dense forms
- Sensitive Settings dialogs (move/delete) should open with trigger continuity via `transform-origin` from the clicked control, and clear custom origin on close

### Assistant SSE Streaming State
- Never clear `streamingMessages` in a `useEffect([selectedThreadId])` — the SSE `meta` event sets `selectedThreadId` mid-stream, causing the effect to fire and wipe the buffer before text arrives. Clear only on user-initiated thread switches (click handler)
- **React Query stale cache after new thread**: `handleStreamSubmit` captures `selectedThreadId` as a closure value at call time (`undefined` for a new thread). The SSE `meta` event fires async. Post-stream invalidation must use a local `resolvedThreadId` updated synchronously from `meta` — never the closure value. Otherwise the new thread cache is never invalidated and shows stale data until hard refresh
- `handleStreamSubmit` accepts optional `promptOverride`/`modeOverride` for chip clicks — React state updates are async; do not rely on `setDraft`/`setMode` updating before the same handler reads them
- Button `onClick` always passes `MouseEvent` as first arg; if handler accepts `promptOverride?: string`, wrap as `onClick={() => onSubmit()}` — never `onClick={onSubmit}` or the event object lands as the prompt and `.trim()` throws
- **`scrollIntoView` during streaming must be `'instant'`**, not `'smooth'` — smooth schedules a CSS animation on every SSE token and causes jank on mobile
- Use `renderedMessages` (not `threadDetail?.messages`) as the base when building `streamingMessages` — React Query may be stale at submit time and exclude the last exchange

### Assistant Month Context Service
- Runs server-side — use `adminDb` directly, not client SDK (`getUserSnapshots` etc. require browser auth)
- All 5 period builders return `AssistantMonthContextBundle`; `selector.month` encoding: `>0`=monthly, `0`=year, `-1`=YTD, `-2`=history. Quarterly: `selector = { year, month: quarter * 3, quarter }`
- `includeDummySnapshots` flows differently: `stream/route.ts` reads from `body.preferences`; `context/route.ts` must re-read from `getAssistantMemoryDocument()` (GET has no body)
- `fetchSettings` returns only the fields needed for context building (`dividendIncomeCategoryId`, `cashflowHistoryStartYear`, `targets`) — do NOT expand it to full `AssetAllocationSettings`; add fields here only when a context builder actually needs them
- `buildTargetAllocation` normalizes `AssetAllocationTarget` to the bundle shape: `subTargets` can be `number` (legacy, % of asset class) or `SubCategoryTarget` (new, object with `.targetPercentage`); both are normalized to plain `number` so prompt builders need no special-casing
- When adding a new required field to `AssistantMonthContextBundle`, update ALL 5 builders AND any test fixtures that construct the type (e.g. `__tests__/assistantGoalEvaluation.test.ts`); TypeScript will catch missing fields in fixtures but only if the field is non-optional

### Assistant Prompt Builder (`formatBundleForPrompt`)
- Always include `--- ALLOCAZIONE CORRENTE ---` from `currentSnapshot.byAssetClass` before the movers section — without it Claude hallucinates "unclassified" gaps for stable asset classes
- Adding a new field to the prompt requires reading it from `bundle` explicitly — `formatBundleForPrompt` destructures named fields only; new fields are silently missing if not explicitly added
- `--- ALLOCAZIONE TARGET vs CORRENTE ---` section is rendered when `bundle.targetAllocation` is non-null AND `currentSnapshot.byAssetClass` exists. Shows attuale %, target %, and gap in p.p. per asset class; sub-categories show their portfolio-level target (`subTargetPct / 100 * assetClassTarget`) so all comparisons are on the same scale

### Assistant Thread Store
- `deleteAssistantThread` must delete `messages` subcollection in batches (≤400 docs) before deleting parent — Admin SDK does not cascade-delete subcollections
- Load `getAssistantThreadDetail` BEFORE `appendAssistantMessage` in `stream/route.ts` — loading after would duplicate the just-appended message in the Anthropic payload
- `buildMessagesArray()` filters to `role === 'user' | 'assistant'` only — Anthropic rejects `role: 'system'`. Cap: chat → 20 msgs (10 pairs); structured → 6 msgs (3 pairs)

### Assistant Memory Injection
- Memory items must be serialized into the prompt via `formatMemoryForPrompt()` — Claude has no implicit Firestore access. Only `status === 'active'` items are injected
- Memory fetch is wrapped in `.catch(() => null)` — failure must never block the stream
- `extractAndSaveMemory` is fire-and-forget: call with `.catch(...)` after `appendAssistantMessage`, never `await` inside the stream
- Anthropic client for memory extraction is lazily instantiated (dynamic import) — module-level `new Anthropic()` breaks test environments where `ANTHROPIC_API_KEY` is absent
- `hasDummySnapshots` is a computed field overlaid by `GET /api/ai/assistant/memory` — never persisted. All `store.ts` return sites use `false` as placeholder
- Goal-completion suggestions must come from `AssistantMonthContextBundle` (authoritative data), not from assistant prose. `liquidità` = cash only; `patrimonio liquido` = `liquidNetWorth`

### Assistant Chat Mode Unification
- `chatContext` field (`'none' | 'month' | 'year' | 'ytd' | 'history'`) selects the period builder; `'none'` sends Claude no portfolio data
- Web search policy: toggle ON → always active in chat; toggle OFF → keyword detection only (`webSearchPolicy.ts`). Structured modes use toggle only, not keyword detection
- Chat max_tokens: 3000 normally, 5000 when web search enabled (macro responses need headroom). Structured analysis: 7000 (thinking budget 4000)

### Assistant Context Panel Persistence
- Context bundle lives in React state (SSE `context` event). On reload the panel is empty — repopulate via `GET /api/ai/assistant/context` using `useAssistantPeriodContext` hook
- Gate the fetch: thread loaded + has pinned period + `streamingMessages.length === 0` + `contextBundle === null`. The `streamingMessages` guard prevents firing while SSE is delivering its own bundle
- Never persist the bundle to Firestore — rebuilding from source keeps streaming and storage independent

### Assistant Retry Pattern
- Store last successful prompt in `lastSentPromptRef` — update only after `response.ok`, not on click. Calling retry after `setDraft('')` with no override sends empty string silently

### Assistant Thread List UX
- **Do not use `DropdownMenu` for panels containing `Select` or `Switch`** — it closes on any click inside. Use `Popover` instead
- Mobile Sheet: use controlled `open`/`onOpenChange`; call `setIsThreadSheetOpen(false)` in `onSelect` handler
- Inline destructive confirmation: first click arms (`isPendingDelete` + 3s timeout ref); second confirms. Clear timer in all branches

### Assistant Markdown Rendering
- `MARKDOWN_COMPONENTS` must be at module level — an inline `components={{ ... }}` creates a new reference every render, causing ReactMarkdown to re-mount on every chunk. Devastating on long conversations
- `remark-gfm` required for table rendering (`| col | col |` otherwise renders as raw pipes). Override `table/th/td` components explicitly — Tailwind `prose` adds no cell borders. `th` must include `text-left`

### Assistant Period Axis & Reactive Scheda (2026-06-04 redesign)
- **One period axis, `Libera` = `chat`**: the UI shows Mese/Anno/YTD/Storico/**Libera** as a single selector (`AssistantPeriodSelector`); "Libera" maps to `mode === 'chat'`. Do NOT reintroduce a separate chat-context strip in the composer — the optional period for a free question is the co-located `chatContextType` selector inside the period control. The `AssistantMode` backend contract is unchanged.
- **`liveMode` drives the scheda preview**: when no thread is active the scheda fetches the LIVE selection (not a thread pin). In Libera+context, map `chatContextType` → the matching analysis mode (`month`→`month_analysis`, `year`→`year_analysis`, `ytd`/`history` likewise) before calling `useAssistantPeriodContext`, so the scheda shows that period BEFORE the question is asked. Reset `contextBundle` to `null` on period/month/year/context change (empty state only — `renderedMessages.length === 0`) to force a refetch; an SSE `context` event always wins over the fetched bundle.
- **The SSE `status` event is already emitted server-side** (`stream/route.ts` `onStatus` → `{ type: 'status', status }`). The client must handle `event.type === 'status'` to drive the "Sto cercando sul web…" badge — it was defined in `AssistantStreamEvent` but silently dropped before the redesign. Reset `streamStatus` to `null` on submit start and in `finally`.
- **Default month = last completed month** (`getPreviousCompletedMonth`): with the live scheda preview, defaulting to the current partial month renders a disabled composer (`isAnalysisBlocked` fires in the empty state) when that month has no snapshot yet. The last closed month always has data.
- **Behaviour controls have one home**: the memory on/off toggle lives in `AssistantPreferencesPopover` (with style + macro), NOT in `AssistantMemoryPanel`; pending goal-completion suggestions render as `AssistantSuggestionsBanner` in the main column, not inside the panel. The panel manages stored items only.

### Nested Scroll Containers Trap the Wheel (gotcha)
- A scrollable region (`overflow-y-auto` + `max-h`) placed INSIDE another scrollable sticky container makes the inner (often short) region capture the wheel, so content below it becomes unreachable. Symptom: "can't scroll to see the content", desktop-only. The fix is **one scroll container per region**, not nesting — and a partial fix that only removes the inner `max-h` still fails if two scroll ancestors remain. In the assistant redesign the right-column tab card (`max-h-[380px] overflow-y-auto`) nested inside the sticky `max-h-[calc(100vh-6rem)] overflow-y-auto` column trapped scrolling once a tall period scheda pushed the card below the fold; resolved by moving Conversazioni/Memoria into header→`Sheet` and leaving the column a single natural-height child.

### Private API Authorization
- Any App Router API route that uses Firebase Admin SDK must authenticate server-side; Firestore rules do not protect Admin SDK calls
- Private routes must verify the Firebase ID token and bind the request to `decodedToken.uid`, not just a client-supplied `userId`
- For record-level mutations on Admin SDK routes, enforce ownership after loading the document (e.g. `dividend.userId`, `asset.userId`)
- Client-side calls to private API routes should use `authenticatedFetch()` so `Authorization: Bearer <idToken>` is sent consistently
- For server-owned materialized documents such as `dashboardOverviewSummaries/{userId}`, client-side mutations must invalidate via a private authenticated API route; do not write these collections directly from the client SDK
- Scheduled server-to-server flows are the exception: cron routes authenticate with `CRON_SECRET`, and `/api/portfolio/snapshot` must continue to accept `cronSecret` for internal cron orchestration
- For user-owned conversational features (assistant threads, messages, memory), generate authoritative thread metadata server-side; do not let the client decide persisted titles or ownership-bound identifiers

### Demo Mode
- `useDemoMode()` compares `user.uid` against `NEXT_PUBLIC_DEMO_USER_ID`; returns `false` if either absent
- Button disable pattern: `disabled={isDemo || <other>}` + `title` ternary — merge into one ternary to avoid duplicate JSX `title` attributes (`TS17001`)
- **Header buttons outside `{isDemo ? ... : ...}` conditionals are still rendered and must be disabled explicitly** — the conditional does not cover them

### FX Conversion for Non-EUR Assets
- **GBp (pence) ≠ GBP**: Yahoo Finance LSE prices are in pence (`quote.currency === 'GBp'`). Normalize with `price / 100` before any FX call — failing to do this inflates values 100×
- **Never call Frankfurter from the browser** — silently blocked by Next.js headers. All FX calls are server-side via `/api/prices/quote`
- `priceUpdater.ts` always overwrites `currency` from `quote.currency` (after GBp normalization) — self-corrects wrong-currency assets

### Asset and FIRE Rules
- `quantity = 0` marks sold assets — valid in history logic. Cash balance lives in `quantity`, not price
- Borsa Italiana bond prices are `% of par`; store converted EUR values
- **Patrimonio history tables**: show only `includeInHistoryTables === true` assets. Anno Corrente: `quantity > 0` only; Storico includes `quantity === 0` with "Venduto" badge. Set `restrictToPassedAssets={true}` when pre-filtering — otherwise the snapshot-scan step silently re-adds excluded assets as `isDeleted: true`
- FIRE annual expenses must use the last completed year; `includePrimaryResidence` must flow through both React Query key and query function
- **Historical FIRE runway**: rolling 12-month expenses (not fixed annual); first point needs 12 snapshots; missing months count as `0`
- **Coast FIRE persistence gotcha**: nested pension rows must be serialized without `undefined` fields — `startAge: undefined` breaks Firestore persistence silently on refresh
- **`resolveBondPrice`**: `rawPrice * (nominalValue / 100)` in `AssetDialog.tsx`. `nominalValue <= 1` check is intentional — retail bonds with par=1 passthrough unchanged
- **What If Analysis = perturbation + diff (no new projection math)**: the What If tab models every v1 life event as an immediate (year-0) perturbation of three baseline inputs (net worth, annual savings, annual expenses), then re-runs the existing pure `fireService` functions on baseline vs adjusted inputs and diffs them (`lib/services/whatIfService.ts` → `applyScenarioToBaseline` + `calculateWhatIfImpact`). Keep events at year 0 — do NOT add timed/mid-projection cash events to `calculateFIREProjection` for v1; the year-0 reuse mirrors the sensitivity matrix. Coast impact is `null` unless `settings.userAge` is set. The surfaced FIRE/Coast impact metrics depend only on total net worth + expenses, so liquid/illiquid splits are not needed in the adjusted inputs.
- **Config-first collapse: decide ONCE after the form has *settled*, not on the transient `hasUnsavedChanges`**: panels that must be "collapsed if already configured" (FIRE Calculator, Coast FIRE) must NOT auto-open directly on `hasUnsavedChanges`. On load the temp form state (`tempWithdrawalRate='4.0'`, `tempUserAge=''`) has not yet been seeded from settings, so `hasUnsavedChanges` is *transiently* true for one+ renders → the panel pops open and never recloses (inputs live inside the collapsible, so real edits can only happen while it is already open — the transient is the only thing that ever opens it). Fix: a `useRef` "seeded" flag set once when `!isLoadingSettings && !hasUnsavedChanges` (temp has settled to match saved settings); only then decide open/closed — open when the essential persisted field is absent (`settings.withdrawalRate == null` / `settings.userAge == null`) — and only then honor later genuine unsaved edits. Also gate the temp-state **sync effect** on `!isLoadingSettings` (not `if (settings)`) so temp settles even when `getSettings` returns `null` (no doc) — otherwise `hasUnsavedChanges` never reaches false and the seed never fires. Applied in `FireCalculatorTab` (`hasSeededSettingsRef`) and `CoastFireTab` (`hasSeededConfigRef`).

### Firestore Optional Field Deletion
- `updateDoc` only touches fields present in the update object — omitting a field leaves the old value intact in Firestore
- `removeUndefinedFields` (used before `updateDoc` in `assetService.ts`) strips `undefined` keys, so clearing an optional field by setting it to `undefined` is silently ignored
- **Pattern for `updateDoc`**: after `removeUndefinedFields`, explicitly translate `undefined` → `deleteField()` for fields the user can intentionally clear: `if (updates.field === undefined) cleaned.field = deleteField()`
- Applied in `updateAsset` for `averageCost` and `taxRate`. Follow this pattern for any other nullable asset/settings fields that users can toggle off
- **`deleteField()` is NOT allowed with `setDoc()` without `merge:true`** — calling it throws `FirebaseError: deleteField() cannot be used with set() unless you pass {merge:true}`. `setSettings` in `assetAllocationService.ts` has **two write branches with different deletion strategies**: (1) the `targets !== undefined` branch uses full `setDoc` (no merge) seeded from `{ ...existingData }` → clear a field by **deleting the key from `docData`** (`delete docData.fieldName`); the full overwrite drops absent keys. (2) the `else` branch uses `setDoc(..., { merge: true })` → clear a field with **`deleteField()`** (omitting the key leaves the old value). When adding a user-clearable settings field, handle BOTH branches.
- **User-clearable settings fields need `'field' in settings`, not `field !== undefined`** — the `!== undefined` guard skips the field on clear, and in branch (1) `{ ...existingData }` then retains the stale value, so the field can never be unset (the clear-to-"Nessun default" bug for `defaultDebitCashAssetId`/`defaultCreditCashAssetId`). Use the present-but-undefined pattern: `if ('field' in settings) { ...write-or-delete... }`. The Settings page always sends the key (value `undefined` when cleared), so the `in` check distinguishes "clear this" from "not part of this update". Applied to the two default cash account fields and `coastFireCustomExpenses`.

### Shared Constants
- Italian month names: `MONTH_NAMES` from `lib/constants/months.ts` — do not redeclare inline
- Hall of Fame section labels and key arrays: `SECTION_LABELS`, `MONTHLY_SECTION_KEYS`, `YEARLY_SECTION_KEYS` from `lib/constants/hallOfFame.ts`
- Dividend type labels and badge Tailwind classes: `dividendTypeLabels`, `dividendTypeBadgeColor` from `lib/constants/dividendTypes.ts`. Both maps include full dark: variants. Previously duplicated in `DividendTable`, `DividendDetailsDialog`, `DividendTrackingTab` with the detail dialog missing dark: variants (silent dark-mode regression). **Rule of Three applied**: any map used in 3+ files must live in a shared constant.

### Firestore Pre-Computed Cache Pattern
For pages that aggregate large collections (many snapshots + all expenses) on every load, store pre-computed results in a dedicated Firestore collection rather than re-reading and re-calculating each visit.

**Pattern (applied to `performance-cache/{userId}`):**
- Cache key encodes the inputs that determine the result: `{snapshotCount}-{lastYear}-{lastMonth}-{Math.round(lastTotalNetWorth)}`. Changing any of these triggers a cache miss automatically.
- TTL fallback (6h) handles mutations to other collections (e.g. expenses) that don't appear in the cache key — stale data decays without explicit invalidation.
- `forceRefresh` param on the main fetch function lets the UI bypass the cache on explicit user action (refresh button) and rewrite it with fresh data.
- Cache reads/writes are wrapped in `try/catch` and fire-and-forget on write — cache failure must never break the page.
- `Date` ↔ Firestore `Timestamp` serialization: write helpers convert each known `Date` field before `setDoc`; read helpers reverse on `getDoc`. Do this field-by-field with explicit types (`FirestorePerformanceMetrics`, `FirestoreCashFlowData`, etc.) — do not JSON-stringify the whole object.
- Firestore rule for the cache collection uses `isOwner(userId)` with doc ID == userId (same pattern as `userPreferences`, `hall-of-fame`, `budgets`). No `userId` field check needed on reads since doc ID is the auth guard.

**Cache key design rule:** include every input that changes the computed output. A key based only on `{count}-{year}-{month}` misses snapshot *value* updates (same month, different net worth). Including `Math.round(totalNetWorth)` catches those. Sub-cent rounding is intentional — avoid floating-point instability in the key string.

### Global Shared Firestore Cache (Non-User Data)
- For data shared across all users (e.g. benchmark ETF returns, FX rates), use a dedicated collection with a natural key as the doc ID — no `userId` field. Rule: `allow read: if isAuthenticated(); allow write: if false` (Admin SDK writes only)
- Encode TTL as `cachedAt: Timestamp` in the doc; compare `Date.now() - cachedAt.toMillis()` server-side before returning cached vs recomputing
- Fire-and-forget writes: wrap in `.catch((err: unknown) => console.error(...))` — cache failure must never break the API response
- React Query client-side: `staleTime` = server TTL minus headroom (e.g. 6h client for 7d server). Applied: `benchmark-cache/{benchmarkId}`, `fx-rate-cache/usd-eur`, `ecb-rate-cache/deposit-rate`
- **Sparse time-series carry-forward**: external series with observations per event date (not per calendar month) must be expanded to a full monthly array before caching. Pattern: keep the last observation per `YYYY-MM` in a `Map`, then iterate from the start month to the current month using `Date.UTC` (not local), emitting the last seen value for months with no observation. Applied in `lib/server/ecbRatesService.ts` (`buildMonthlyRatesFromFred`) for FRED ECBDFR.

### Yahoo Finance Module Asymmetry: ETF Sectors vs Stock Sectors
- **ETFs/funds**: use `topHoldings` module → `sectorWeightings` is an array of `Record<string, number>` with snake_case keys (`"technology"`, `"financial_services"`) that match `SECTOR_LABELS` directly
- **Individual stocks**: use `assetProfile` module → `sector` is a title-case string (`"Technology"`, `"Financial Services"`) — must be translated via a dedicated map (e.g. `YAHOO_ASSET_PROFILE_SECTOR_TO_KEY`) before matching `SECTOR_LABELS`
- The two modules are mutually exclusive per asset type: `topHoldings` on a stock returns no `sectorWeightings`; `assetProfile` on an ETF returns no `sector`
- Fetch both batches concurrently: `Promise.all([Promise.allSettled(...etfs), Promise.allSettled(...stocks)])` — independent settle semantics, zero added latency
- `cacheKey` must encode both ETF and stock tickers; an ETF-only key goes stale when stock composition changes without any ETF change. Applied in `lib/server/portfolioExposureService.ts`

### Cache Schema Evolution Without cacheKey Bump
- When adding a new field to the data shape inside an existing cache document, add it as **optional** in the TypeScript type. Old cached docs lacking the field then degrade gracefully (UI hides the dependent feature when undefined) without forcing a global recompute on deploy.
- Pair the optional-field migration with an explicit **force-refresh** affordance on the route + hook so users can opt out of the stale-but-valid cache without waiting for the TTL or changing the cacheKey inputs:
  - Route accepts `?force=true` (`request.nextUrl.searchParams.get('force') === 'true'`) which bypasses the cache READ but still WRITES the recomputed result back — so the next non-forced visit benefits from the fresh cache.
  - Hook exposes a `refresh()` callback in addition to `refetch`. `refresh()` arms a `useRef<boolean>` consumed and cleared by the next `queryFn` call. Use a ref, not state — flipping state would force an extra render.
  - Wire UI "Aggiorna" buttons to `refresh()`, never to bare React Query `refetch()`. Bare `refetch` re-hits the endpoint but receives the same cached doc when the cacheKey is unchanged. Applied in `usePortfolioExposure` + `/api/portfolio/exposure?force=true`.

### Fixed Hooks for Variable-Length Data Sources
- Declare N fixed hook instances at component level with `enabled: false` for inactive ones — never loop over hooks. React enforces stable hook call counts and throws at runtime
- Adding a new benchmark: (1) add entry to `BENCHMARKS[]`, (2) add fixed `const bN = useBenchmarkReturns(...)`, (3) add to `hookResults` array and dependency memos

### Cross-Component Metric Consistency
- When a derived value shown in a chart or table must match a KPI card exactly, pass the pre-computed figure as a prop from the page — do not recompute from chart data. The most common drift source is annualization denominator: chart return-point count = n−1, `metrics.numberOfMonths` = n. A 1-month difference produces ~0.4pp divergence at 14% TWR
- De-annualize for "total growth": `(1 + TWR/100)^(months/12) − 1`. Compute in the page, pass as `portfolioTotalGrowth`
- Applied in `BenchmarkComparisonChart` / `BenchmarkComparisonSection`
- **Portfolio vs benchmark month count asymmetry**: `prepareMonthlyReturnsHeatmap` loops `i=1..N` over snapshots — the first snapshot is baseline only, so for a period of N calendar months the portfolio has N−1 return observations. Benchmark data from Yahoo Finance has a return for every calendar month including the first, so it has N observations. `Mesi+/-` for the portfolio can therefore never sum to `numberOfMonths`. Display "X/Y" format with the actual denominator (`returns.length`) to avoid user confusion. `totalMonths` field in `BenchmarkMetrics` = `returns.length` tracks this per row.

### Dashboard Data Isolation
- Do not add `useAllExpenses` or other full-history queries to Overview/Dashboard
- Full-history expense analysis belongs in History or Cashflow
- Overview/Panoramica data pipeline should flow through the private `GET /api/dashboard/overview` route and `useDashboardOverview()`; do not reintroduce page-level fan-out queries for assets, snapshots, expense stats, or settings
- `DashboardOverviewPayload` should stay lean: only KPI, variations, expense stats, chart datasets, flags, and freshness fields actually rendered by Panoramica belong there
- `dashboardOverviewSummaries/{userId}` is a server-owned materialized summary for warm loads; the client must never read it directly, only the authenticated overview route may do that
- Overview materialized summaries must have explicit invalidation on overview-relevant mutations plus a short TTL fallback, so stale docs never become a silent source of truth

### Motion and Charts
- Shared variants live in `lib/utils/motionVariants.ts`
- For long, data-dense pages like History/Hall of Fame, prefer scroll-gated chapter reveals over a global stagger: `whileInView="visible" viewport={{ once: true, margin: "-80px" }}` on each `motion.section`. Using `animate="visible"` instead fires all sections simultaneously at mount — they all appear at once regardless of scroll position
- For dense tabbed data views, prefer short container transitions (`tabPanelSwitch`, `tableShellSettle`) and scoped refresh feedback on the active panel only; do not animate table geometry or whole row sets
- Performance page pattern: derive `chartData`, heatmap data, and underwater data with `useMemo`; do not store them in local state via `useEffect + setState`
- Performance period morph: do not key KPI sections or metric cards by selected period; on period switches, values jump silently to the new number (no re-animation); chart shells can re-key only when a first-class staged reveal is intentional
- `useCountUp` on KPI cards: always use `once: true` so the count-up fires exactly once on first meaningful data arrival and does not re-trigger on React Query cache hits. `fromPrevious: true` alone (without `once`) causes a first-load flash — the 60ms `startDelay` window is cancelled and restarted on every value update before the animation can complete
- **`useCountUp` before conditional early returns**: when a component has an early return (e.g. loading skeleton), every `useCountUp` call must appear before it — React forbids conditional hook calls. For mode-switched views where only one branch uses the value, call `useCountUp` unconditionally for both branches and ignore the result for the inactive one. Using `enabled: false` is not needed — just let the animation run silently in the background.
- Performance staged reveals should run on first mount or major period change only; manual refresh feedback must stay scoped to the page header or active chart shell instead of replaying the whole page
- Assistant SSE pattern: keep Anthropic orchestration server-side, stream `data: {JSON}\n\n` events with typed envelopes (`meta`, `text`, `status`, `done`, `error`), and let the client progressively append chunks without owning persistence decisions
- **Framer Motion in assistant components**: use `AnimatePresence mode="wait"` + `key={stateValue}` for content that fully swaps (e.g. context card on period change, period label crossfade). Use `AnimatePresence initial={false}` (default popLayout) for lists where items are added/removed (messages, memory items). `initial={false}` prevents entrance animation on items already visible when `AnimatePresence` mounts — only genuinely new items animate in.
- **Memory item exit animation**: wrap each item in `motion.div` with `exit={{ opacity: 0, height: 0, marginBottom: 0 }}` + `style={{ overflow: 'hidden' }}`. Height collapse on exit prevents the list from leaving a gap after removal. Pair `height: 0` with `marginBottom: 0` or the bottom gap remains.
- **Collapsible section with Framer Motion**: for height-animated collapsibles outside Radix, use `motion.div` with `initial={{ opacity: 0, height: 0 }}` / `animate={{ opacity: 1, height: 'auto' }}` / `exit={{ opacity: 0, height: 0 }}` + `style={{ overflow: 'hidden' }}`. `height: 'auto'` works in Framer Motion (unlike CSS transitions). Wrap in `AnimatePresence initial={false}`.
- **Full-width collapsible inside a flex row**: if the expandable content must span the full container width, place the `AnimatePresence` block OUTSIDE the flex-row div (sibling, not child). Content inside a `flex: 1` column won't exceed its column width.
- **`useReducedMotion()` pattern**: call once at the component level, then use `prefersReducedMotion ? 0 : <duration>` and `prefersReducedMotion ? 0 : <y>` inline in transition/initial objects. Do not add separate CSS `prefers-reduced-motion` media queries when Framer Motion is already used — the hook is the single source of truth.
- Do not wrap shadcn `TableRow` with `motion()`; use `motion.tr`
- Use `motion.create(Component)` — `motion(Component)` is deprecated in Framer Motion v11+ and logs a warning
- Page-level Framer Motion quality should be validated in production mode (`npm run build` + `npm run start`) before treating desktop smoothness as a regression; `next dev` can noticeably exaggerate count-up and layout-motion cost
- **`useChartColors()` is mandatory for all Recharts series**: never hardcode hex values (`#8884d8`, `#82ca9d`, `#ff7300`, etc.) in `stroke`/`fill` props — these are Recharts defaults and clash with non-default themes. Read CSS vars after paint via `useChartColors()` and pass `chartColors[0..4]` as props. This includes AreaChart series, LineChart series, and any decorative fills.
- **Dark-mode area gradient opacity**: use stop opacities of at least `0.65 / 0.45 / 0.18` (top/mid/bottom) for `<linearGradient>` fills on area charts. The typical `0.4 / 0.2 / 0.05` range makes mid-luminance colors (e.g. `--destructive` in Solar Dusk dark: `oklch(0.57 0.22 ...)`) nearly invisible against a dark background. Also set `strokeWidth={2}` so the boundary line remains legible even when the fill is light. Applied in `UnderwaterDrawdownChart`.
- **Rolling charts: always render, never conditionally hide**: prefer always rendering a rolling chart card with an inline empty-state message when data is insufficient over `{data.length > 0 && <Card>}`. Silent disappearance violates system status visibility — the user can't tell if the section is loading, broken, or just unavailable for their period length.
- Recharts defaults:
  - `Bar` / `Pie`: `animationDuration={600}` + `animationEasing="ease-out"`
  - `Line` / `Area`: `animationDuration={800}` + `animationEasing="ease-out"`
  - `Pie` also needs `animationBegin={0}`
- Decorative stacked background areas should keep `isAnimationActive={false}`
- **Recharts conditional dot markers**: for a `<Line>` where most points need no dot but specific points need a custom marker (e.g. note indicators), use a custom `dot` renderer that returns `null` for the default case and renders the marker only when the condition is met (`hasNote`). Pair with `activeDot={{ r: 6 }}` so the hover dot still works. Applied in `components/history/CustomChartDot.tsx`.
- Overview/Panoramica pattern: count-up lives in `OverviewAnimatedCurrency` leaf nodes, NOT in the page component — each rAF tick re-renders only that leaf, leaving the chart subtree and all other cards untouched. The page passes final computed values as stable props; display timing is entirely the leaf's concern.
- Overview/Panoramica chart scheduling: `OverviewChartsSection` is wrapped with `React.memo` and receives `heroSettled: boolean` from the page. When `heroSettled` becomes true, it schedules chart SVG mount via `requestIdleCallback` (with `{ timeout: 800 }`) or `setTimeout(0)` as fallback — never a fixed arbitrary timeout as the primary strategy. On mobile and reduced-motion, `chartRenderReady` starts true immediately.
- `OverviewAnimatedCurrency` format prop: use `format="integer"` for count-based KPIs (e.g. asset count) to avoid fractional display during rAF interpolation. Default is `"currency"` via `cachedFormatCurrencyEUR`. Add new format values here only if a genuinely distinct format is needed — do not extract a separate component per format.
- **Page transitions: use `template.tsx`, NOT `layout.tsx` + `AnimatePresence`**. `template.tsx` re-mounts on every navigation → Framer Motion always sees a fresh mount. Remove page-level `motion.div variants` wrappers when `template.tsx` is in place (compounded opacity: `t²`). Add `<MotionConfig reducedMotion="user">` at the layout root to propagate reduced-motion to the whole tree.
- **Loading skeleton over spinner**: pages that invest in count-up animation, `heroMetricSettle`, and `requestIdleCallback` chart scheduling must use a structural skeleton for the loading state — not a bare `<Loader2>` spinner centered on the page. The skeleton should replicate the post-load layout (header block, hero block, secondary KPI block, card grid blocks) using `animate-pulse bg-muted rounded` divs. A spinner as the first frame contradicts the motion investment and provides no structure preview. Apply the same grid column counts and spacing as the real layout so the skeleton is visually isomorphic.

### Color Theme System
- **`--sidebar-accent-foreground` dual-use**: this variable is used for text color in TWO contexts in `Sidebar.tsx` — (1) active item, where text sits on top of the `bg-sidebar-accent` pill (dark text on colored bg works fine), and (2) hover on inactive items, where ONLY the text color changes (no background applied). Setting it to a dark color satisfies active but makes hover text invisible on dark sidebars. Fix: use `hover:text-sidebar-foreground` for hover (not `hover:text-sidebar-accent-foreground`) — `sidebar-foreground` is always readable regardless of theme. Only `text-sidebar-accent-foreground` stays on the active state.
- **Parallel theming**: next-themes controls dark/light (`.dark` class on `<html>`); custom system controls color theme (`data-theme` attribute on `<html>`). They are fully independent — never conflate them.
- **CSS structure**: `[data-theme="name"]` for light vars, `.dark[data-theme="name"]` for dark overrides in `app/globals.css`. Default theme uses `:root` / `.dark` (no `data-theme`).
- **`ColorThemeContext`**: manages `data-theme` + localStorage + Firestore sync. Must live inside `AuthProvider`. Uses `syncedUid` ref to avoid re-fetching on re-renders.
- **Firestore rules for `userPreferences/{userId}`**: use `isOwner(userId)` directly — the document has no `userId` field, the doc ID *is* the userId. Do NOT use `hasValidUserId()` (which checks a field).
- **`useChartColors` timing**: use `useEffect + useState + requestAnimationFrame` to read CSS vars, NOT `useMemo`. `useMemo` reads `getComputedStyle` synchronously during render, before next-themes has updated the DOM — produces stale colors on dark↔light transitions.
- **oklch luminance filter**: when adding chart colors from tweakcn themes, check L channel. Thresholds in `useChartColors`: L > 0.82 in light mode → fallback; L < 0.30 in dark mode → fallback. Themes with chart colors at extreme luminance (e.g. L≈0.92 or L≈0.28) will always fall back — avoid or fix at the CSS level.
- **Action/semantic colors that must follow the theme — clamp lightness, don't index-fallback**: when a small set of semantic states (e.g. allocation COMPRA/VENDI/OK) must both (a) follow the active theme and (b) stay legible as chip/text, map them to `--chart-*` slots and resolve via a dedicated hook that reads the var and **clamps only the oklch L channel** (light: L>0.72→0.62; dark: L<0.48→0.60), preserving hue+chroma. Do NOT reuse `useChartColors`: its out-of-range fallback to the static `CHART_COLORS` at the *same index* loses the theme hue AND can collapse two states onto one color (cyberpunk light made OK and VENDI both violet). The `--warning/--positive/--destructive` tokens are identical across all six themes, so they cannot carry theme personality. Resolve **once per section** and pass the color down as a prop — never call the hook per row. Applied in `useActionColors` + `AllocationBreakdown`/`RebalancePlan`/`AllocationHero`; `ACTION_CHART_NUMBER` = COMPRA 3 / VENDI 5 / OK 2.
- **Server-cached chart data**: `prepareAssetDistributionData` runs server-side; colors are baked into React Query cache. Remap colors at render time in the page component (`assetData.map((d, i) => ({ ...d, color: chartColors[i] ?? d.color }))`); do not invalidate the cache. **Apply this remap to EVERY chart data array** — the Overview had `assetData` remapped but `assetClassData` missing, causing the Asset Class pie to ignore the active theme.
- **View Transition circle-reveal**: remove `disableTransitionOnChange` from `ThemeProvider` or the CSS animation is blocked. Set `--vt-cx`, `--vt-cy`, `--vt-r` inline before calling `document.startViewTransition(() => setTheme(next))`. TypeScript already knows `startViewTransition` — no `@ts-expect-error` needed.
- **Adding a new theme checklist**: (1) add CSS blocks `[data-theme="name"]` + `.dark[data-theme="name"]` in `globals.css`, (2) add `'name'` to `ColorTheme` union in `userPreferencesService.ts`, (3) add swatch object to the themes array in `settings/page.tsx`, (4) update grid cols if needed, (5) `npx tsc --noEmit`.
- **Dark theme chroma gotcha**: in oklch, chroma values below ~0.015 are invisible on dark backgrounds — all themes look identical gray. When adding or editing a `.dark[data-theme="..."]` block, verify `--card`, `--background`, and `--muted` have chroma ≥ 0.020. Themes sourced from tweakcn usually have adequate chroma; hand-edited or copy-pasted dark blocks often don't. Also verify the **hue** matches the theme personality — elegant-luxury had hue 56° (amber) instead of ~20° (burgundy) because it was copied from solar-dusk.

### Mobile Navigation Structure
- Bottom navigation (portrait mobile): 3 primary routes + "Altro" button (MoreHorizontal icon)
- **Single source of truth for nav arrays**: `lib/constants/navigation.ts` exports `primaryNav`, `analysisNav`, `planningNav`, `secondaryHrefs`. Sidebar, BottomNavigation, and SecondaryMenuDrawer all import from there — never redeclare nav arrays inline. Adding/removing a route means one file edit.
- **Bottom nav uses `--sidebar-*` CSS vars** for theme-aware colors — background `var(--sidebar)`, border `var(--sidebar-border)`, active tab `var(--sidebar-primary)` + `var(--sidebar-accent)` bg, inactive `var(--sidebar-foreground)` at opacity 0.65. Use `style={{ ... }}` inline because sidebar vars are not mapped to Tailwind utility classes.
- **Sidebar active state — Overview exact match**: `Sidebar.tsx` `isActive` for `/dashboard` must use `pathname === item.href` only, never `startsWith`. `startsWith('/dashboard/')` matches every sub-route (`/dashboard/assets`, `/dashboard/history`, etc.) and keeps Panoramica highlighted on all pages. All other routes can use prefix matching safely
- **Sidebar icon-collapsed mode**: `collapsible="icon"` on `<Sidebar>`. Content hidden via `group-data-[state=collapsed]:hidden`; icon-only alternatives shown via `group-data-[state=collapsed]:flex`. `SidebarMenuButton size="lg"` in the footer auto-collapses to avatar-only. Toggle button uses `hidden desktop:flex` (desktop only). State persists in localStorage via shadcn `useSidebar()` — no custom persistence needed.
- `secondaryHrefs` is exported from `navigation.ts` — derived from `analysisNav` + `planningNav` + `['/dashboard/assistant', '/dashboard/settings']`. Do not hardcode in BottomNavigation.
- Secondary drawer uses 3 semantic groups: **Statistiche** (Analisi, Rendimenti, Storico, Hall of Fame, Assistente AI — read-only views), **Pianificazione** (Allocazione, FIRE e Simulazioni — action-bearing tools), **Preferenze** (Impostazioni)
- `Assistente AI` belongs in the `Statistiche` group. `Allocazione` belongs in `Pianificazione` (has COMPRA/VENDI/OK action chips — not a read-only stat)
- Nav item for the cashflow analysis page is "Analisi" (route `/dashboard/analisi`), NOT "Flussi"
- **Cashflow FAB → ExpenseTrackingTab communication**: the `+` FAB in BottomNavigation has no access to the tab component. Communication uses `window.dispatchEvent(new CustomEvent('cashflow:add-expense'))` in the FAB and `window.addEventListener('cashflow:add-expense', handler)` in `ExpenseTrackingTab`. Pattern: cross-hierarchy components with no shared ancestor → custom DOM events are correct; prop drilling or lifting state to layout would require threading callbacks through multiple unrelated layers.
- **Bottom nav is portrait-only** (`max-desktop:portrait:flex max-desktop:landscape:hidden` on the root) — it disappears in landscape on mobile/tablet. So an in-page "Aggiungi" button that duplicates the FAB must be hidden ONLY in portrait (`max-desktop:portrait:hidden`), not unconditionally: in landscape the FAB is gone, so the in-page button is the only add affordance. Applied in `CashflowTrackingMobile.tsx`.
- Eyebrow label style for group headers: `text-xs font-semibold uppercase tracking-wider text-muted-foreground/60`

### Progressive Disclosure on Data-Dense Pages
- Collapsible methodology/reference blocks: use `Collapsible` (shadcn, from `@/components/ui/collapsible`) with `open` state defaulting to `false`; wrap the trigger around `CardHeader` via `asChild` for a large click target
- `cn` is NOT auto-imported in page files — add `import { cn } from '@/lib/utils'` explicitly when using conditional class logic in pages (it is already available in all component files)
- Badge chips for complexity signals: `badge?: string` prop on `MetricCard` renders a `Badge variant="outline"` below the title; requires `CardHeader` to be `items-start` (not `items-center`) because the left column has variable height
- For compact explanatory help inside dense cards, prefer the local click-to-toggle pattern used in `components/performance/MetricCard.tsx` over generic Radix tooltip poppers when positioning must stay tightly anchored to the card header
- One-time guide strips: position them outside the `key={selectedPeriod}` (or equivalent period/tab reset div) so they don't replay their entrance animation on every period switch
- History chapter intro pattern: use a short editorial intro plus 2-3 sentence section headers to orient the user before dense chart clusters; keep these blocks informational, not decorative
- Dev/internal tool sections in settings pages: isolate with `border-t border-border pt-6` + a `text-xs uppercase tracking-widest` eyebrow label in a distinct color (e.g. orange for dev/danger zones); never co-locate dev tools in a functional product tab (dividendi, spese, etc.)
- For refresh affordances on dense historical tables, highlight only the active shell/header and timestamp the refresh there; avoid flashing rows or cells broadly

### Mobile Layout for Large Monetary Values
- **Side-by-side `text-2xl`+ values overflow on mobile**: a `flex justify-between` row with two large numbers (e.g. `text-3xl` portfolio total + `text-xl` G/P amount) will overflow on narrow screens — the combined width exceeds the card. Fix: use a stacked vertical layout — primary value at full width, secondary value as a smaller colored line below with the percentage as an inline `<span>`. Pattern: `<p className="text-3xl font-bold font-mono">{primary}</p><p className="text-sm font-semibold font-mono {color}">{secondary} <span className="text-xs opacity-80">({pct}%)</span></p>`. This is impossible to overflow regardless of viewport width and follows Trade Republic hierarchy. Applied in `AssetManagementTab` summary card and `AssetCard` Valore Totale + G/P section.

### Flat List vs Card Grid for Navigation Items
- **Navigation-focused items** (users click to drill down or navigate) → flat `divide-y divide-border/50` list inside `overflow-hidden rounded-xl border border-border bg-card`. No card boxes per item, no progress bars — the parent supplies the visual structure.
- **Content-dense items** (users read and compare values without navigating) → card grid (`grid grid-cols-1 sm:grid-cols-2 gap-4`). Each item is self-contained.
- Applied in Allocazione (`AllocationRow` inside `AllocationBreakdown`'s single `divide-y` card) vs Patrimonio (`AssetCard` card grid). The distinction: allocation items are affordances, asset cards are information blocks.

### Trade Republic Metric Hierarchy
- **Hero Dominant Value Block**: the primary metric per section renders at `text-4xl font-bold font-mono` with an eyebrow label (`text-xs uppercase tracking-widest text-muted-foreground/70`). Passed as the `hero` prop of `MetricSection`. Applied in `components/performance/HeroMetricBlock.tsx`.
- **Flat secondary rows**: all other metrics use `flex items-center justify-between px-6 py-3.5` inside a `divide-y divide-border` container — NOT a card-in-card grid. Values at `text-sm font-semibold font-mono`. Applied in `components/performance/MetricCard.tsx`.
- **`MetricSection` container**: single `<Card className="overflow-hidden">` with the hero block separated from flat rows by `border-b border-border`. No progress bars, no side-stripe accents, no `sm:grid-cols-2`.
- **`MetricCard` description vs subtitle placement**: `subtitle` renders on the RIGHT column (`shrink-0`, `text-right`) — use only for short strings (e.g. "Basato su 3 raddoppi"). `description` renders on the LEFT column (`min-w-0 flex-1`) — use for longer strings like date ranges or value progressions ("01/23 – 10/24 · €164k → €201k") that need room to wrap. Using `subtitle` for long content causes overflow in the right column. Applied in `DoublingTimeSummaryCards`.
- **CUSTOM period as chip overlay**: never give a "Custom" state a permanent slot in a period selector — it appears visibly disabled/inert until active. Instead render a `rounded-full` chip with the date range below the selector, only when a custom range is active. A `×` button inside resets to the default period.
- **Period selector without Tabs context**: when a selector must work across multiple return paths (e.g. `hasInsufficientData` + normal), use plain `<button role="tab">` + Framer Motion `layoutId` at module level. shadcn `<Tabs>` requires `<TabsContent>` — using it without children is semantically wrong and creates coupling. Applied as `PerformancePeriodSelector` in `app/dashboard/performance/page.tsx`.

### Mobile Tab Switcher: Segmented Pill vs Select
- **Never use `Select` for tab navigation** — 2 taps, hidden options. Segmented pill = 1 tap, all options visible
- **Pattern**: module-level `TABS` constant, `role="tablist"` wrapper (`bg-muted rounded-lg p-1 w-fit mx-auto`), `role="tab"` + `aria-selected` per `motion.button`, Framer Motion `layoutId` spring pill (400/35). Container is `w-fit mx-auto` — sizes to content and centers on the page
- **`TabDef` is `{ value, label, icon? }` — no `shortLabel`**. Overflow is solved by pattern, not abbreviation: active tab shows icon + full label; inactive shows icon only. `motion.button layout="size"` animates the width change smoothly. For tabs without icons, always show the label regardless of active state (fallback). Applied in `components/layout/PageTabBar.tsx`
- **Two-variant rule** (documented in DESIGN.md §Segmented Pill Control): Variant A = icon section-tabs (Cashflow / Settings / FIRE) → active label + icon-only inactive. Variant B = text period-tabs (Rendimenti YTD/1A/3A/5A/MAX) → all labels always visible, already ≤3 chars, underline indicator. Never force icons onto period selectors
- Async-gated tab: build array dynamically inside render but keep base constant at module level: `const ALL_TABS = flag ? [...BASE, extra] : BASE`
- Floating pill is reserved for global page navigation — page-local switchers must be inline and scroll away

### Mobile Header Trash Icon Pattern
- In a card header that has a title/subtitle block on the left and a destructive icon button on the right, always use `flex items-start justify-between` (not `flex-col` + `sm:flex-row`). `flex-col` puts the trash button on its own row on mobile, wasting vertical space and breaking visual grouping. The subtitle text stays under the title in the left block; the button stays top-right in all viewports.

### Periodic Email Service (`lib/server/monthlyEmailService.ts`)
- **Four period types**: `EmailPeriodType = 'monthly' | 'quarterly' | 'semiannual' | 'yearly'`. Semi-annual closes 30 Jun / 31 Dec (`isLastDayOfHalfYearItaly`); `getMostRecentCompletedHalfYearEnd` treats a period as completed once past midnight of its last day (consistent with `getMostRecentCompletedQuarterEnd`). Each type has its own `*EmailEnabled` toggle but they share `monthlyEmailRecipients`. Cron Phases (monthly/quarterly/semiannual/yearly) are independent: 30 Jun can send both Q2 and H1, 31 Dec can send Q4 + H2 + yearly — intentional, opt-in per toggle. Adding a period type touches: type union, `MonthlyEmailData` (`quarter?`/`semester?`), date helpers, `buildPeriodEmailData` branch, all label helpers, `buildAndSend*`, cron Phase, send route, settings 3-place + UI toggle + test-send button.
- **Email AI comment is a DEDICATED Anthropic call, NOT the assistant pipeline**: `generateEmailAiComment` builds its own email-specific prompt (`buildEmailAiPrompt`) and calls `anthropic.messages.create` directly (lazy `import`, web_search tool, non-streaming). Do **not** route email comments through `streamAssistantResponse`/`AssistantMode` — chat mode with a null bundle injects a misleading "nessun dato disponibile" note, and there is no `semiannual_analysis` mode. The dedicated call gives full control over the period label (semi-annual included) and the 5-section structure (sintesi / vs periodo prec. / vs anno prec. / variazione entrate-spese + cause / azioni) without leaking email concerns into the shared assistant prompt builders. Reuses `formatMemoryForPrompt` + `buildResponseStyleInstruction` (exported from `assistant/prompts.ts`).
- **Comparison data is deterministic, AI only interprets** (`lib/server/emailPeriodComparison.ts` → `buildPeriodComparison`): all deltas (vs previous period + vs same period last year) are computed in code, never by the AI → zero hallucination risk on numbers. **Net worth = end-of-period snapshots (point-in-time); income/expenses/savings = flows summed over the window** — two different comparison semantics, made explicit in the email caption. `previousEqualsYoy` is true for yearly (prev period ≡ year-ago) → single comparison column. Cashflow deltas are `null` (rendered "N/D") when a baseline period has no transactions — avoids false −100% for periods predating tracking.
- **Benign function-level circular import**: `monthlyEmailService` ↔ `emailPeriodComparison` import each other (buildPeriodComparison ← service; aggregateExpenses/period helpers ← comparison). Safe because neither uses the other at module-load, only inside function bodies. Use `import type` for the comparison types in the service to keep the runtime edge one-directional where possible.
- **AI cause analysis needs granular inputs**: `aggregateExpenses` carries `subCategoryName` (+ note via `description`) into `topIndividualExpenses`; the AI prompt has a dedicated "SPESE PIÙ RILEVANTI" block so the "why" can reach subcategory/note level, not just top-level category.
- **Firestore query depth**: max 3 `.where()` calls — a 4th breaks test chain mocks. Filter post-fetch instead
- **Expense field name**: `notes` (not `note`) — wrong field silently falls back to category name
- AI comment failure must never block email: `generateEmailAiComment` returns `null` on any error; comparison build failure is also non-blocking (email sent without the Confronti section). Signals only in logs (`[emailAiComment]` / `[email]`)
- **`simpleMarkdownToHtml` order**: strip `<details>/<summary>` first; `**bold**` before `*italic*`; collapse blank `<li>` gaps before `<ul>` wrap regex
- **`generateEmailHtml(data, comparisonData?)`**: param is named `comparisonData` to avoid colliding with the local `comparison` (= `comparisonLabel(data)` string) already in the function

### Firestore Query Chain Depth in Tests
- Keep Admin SDK query chains to **3 `.where()` calls max** when the function will be unit-tested. A 4th `.where()` (e.g. `isDummy != true`) causes `TypeError: .where(...).where(...).where(...).where is not a function` in tests because the mock chain only goes 3 levels deep.
- Workaround: apply the 4th condition as a post-fetch code filter (`docs.filter(d => !d.data().isDummy)`) — one extra doc fetched at most (with `.limit(1)` the cost is negligible).

### Server-Side Layer Separation (`lib/server/`)
- API route = auth → validate → fetch → ownership check → delegate to use case/processor → return. No Firestore queries or business logic in the handler body
- `assetAdminRepository.ts` — canonical Admin SDK asset fetch. `dividendUseCase.ts` — creation orchestration. `dividendProcessor.ts` — 3 cron phases with typed result interfaces

### Pure Functions and Testability
- Functions that call `new Date()` internally are untestable without fake timers. Pass `now: Date` as explicit param — call site passes `new Date()`. Applied to `buildPensionDraftIssues`

### Progress Bar ARIA
- A visual progress bar (`<div>` animated with Framer Motion) has no semantic meaning to screen readers. Always add `role="progressbar"`, `aria-valuenow={Math.round(value)}`, `aria-valuemin={0}`, `aria-valuemax={100}`, and `aria-label` describing what is being measured.
- Place `role="progressbar"` and all `aria-value*` attrs on the **track container** (outer div), not the fill element. The outer element carries the semantic value; the inner fill is purely decorative.

### `title` Attribute Is Not a Reliable Accessible Name for Buttons
- `title="Sposta su"` on a `<button>` looks like it provides an accessible label, but `title` is not reliably announced by screen readers (VoiceOver on iOS ignores it entirely; NVDA behaviour varies). Always use `aria-label` as the primary accessible name for icon-only action buttons. Keep `title` only if you also want a hover tooltip for pointer users — but `aria-label` must always be present too.
- **Demo-mode disabled buttons**: use `aria-label={isDemo ? 'Azione — non disponibile in modalità demo' : 'Azione'}` instead of `title`. Screen readers announce the disabled state automatically; the `aria-label` explains *why*.

### `title` Attribute Is Not a Tooltip on Mobile
- `title="..."` on any element shows a native browser tooltip on **desktop hover only** after ~1 second delay. On mobile (tap/click) it never fires. `cursor-help` signals intent visually but does not make the content accessible.
- **Rule**: for any informational content users should be able to access (metric explanations, CAGR footnotes, help text), always use Radix `<Popover>` — same pattern as `MetricCard` in Rendimenti. Pattern:
  ```tsx
  <Popover>
    <PopoverTrigger asChild>
      <button type="button" className="... cursor-help">chip text</button>
    </PopoverTrigger>
    <PopoverContent side="bottom" align="start" className="max-w-[280px] text-sm leading-relaxed">
      Explanation text here.
    </PopoverContent>
  </Popover>
  ```
- Applied to History page CAGR chip and total-growth chip (previously used `title` — invisible on mobile).

### Color Picker Buttons — `aria-label` Must Use Human-Readable Names
- Color swatch buttons with `aria-label={`Colore ${hexValue}`}` cause screen readers to spell out the hex string (e.g. "Colore hashtag 3 b 8 2 f 6") — meaningless to AT users. Always maintain a `COLOR_LABELS: Record<string, string>` map alongside the palette constant and use it for labels.
- Pattern: `aria-label={`${COLOR_LABELS[c] ?? c}${color === c ? ' (selezionato)' : ''}`}` + `aria-pressed={color === c}`. The `(selezionato)` suffix tells AT users the current selection without requiring a separate announcement.
- Keep `COLOR_LABELS` in the component file (UI-specific) and add a checklist comment on the palette constant in the type file: "If you add a color here, also update COLOR_LABELS in <Dialog>.tsx". Applied in `CostCenterDialog.tsx`.

### Accessibility Patterns
- **Calendar grid ARIA structure**: a 7-column calendar grid requires explicit ARIA roles — not just visual CSS grid. Pattern: outer container `role="grid" aria-label="Calendario pagamenti dividendi"`; header row `role="row"` with each day cell `role="columnheader" aria-label={fullDayName}`; each of the 6 week rows as `role="row"` (flat 42-cell array must be sliced: `Array.from({ length: 6 }, (_, i) => cells.slice(i*7, i*7+7))`); each date cell `role="gridcell"`. Using CSS `grid-cols-7` alone creates no navigable structure — the DOM rows must exist as elements. Applied in `DividendCalendar.tsx`.
- **`role="gridcell"` on `<button>`**: acceptable for calendar cells. Overrides the implicit `button` role. Modern screen readers (NVDA, VoiceOver, JAWS) treat it as an activatable gridcell. Wrapping in `<div role="gridcell"><button>` is the strictly correct approach but adds DOM complexity with no practical AT benefit. Use the `<button role="gridcell">` pattern only when the button IS the full cell content.
- **`aria-label` for calendar cells must be built in the parent**: the parent calendar component has `getDividendsForDate(date)` already computed for each cell. Pass the result as `ariaLabel: string` prop to the cell — do not re-derive it inside the cell. Format: `"${day} ${monthName} ${year}${dividends.length > 0 ? ' — N pagamenti' : ''}"`. The prop is non-optional (string, not string | undefined) to force the call-site to always supply it.
- **Custom tooltip with `aria-expanded`**: any toggle-button that shows/hides a panel must have `aria-expanded={isOpen}` and `aria-haspopup="true"`. Add a `keydown` handler for Escape on the document (not just the button) — Escape is a global dismiss shortcut for tooltips/popups and screen reader users expect it. Pattern: add/remove the listener inside `useEffect([isOpen])`, remove on cleanup. Applied in `MetricInfoTooltip` in `DividendStats.tsx`.
- **`aria-live` on streaming content**: any region that receives dynamically injected text (SSE streams, polling) must have `aria-live="polite"` and `aria-atomic="false"` on its container so screen readers announce content as it arrives. Use `aria-label` to give the region a name (e.g. `aria-label="Conversazione con l'assistente"`).
- **Action buttons hidden with `opacity-0` are inaccessible on both keyboard and touch**: `opacity-0 group-hover:opacity-100` makes controls unreachable from keyboard (focus lands on invisible buttons) and invisible on touch (no hover state). Fix: use `[@media(pointer:fine)]:opacity-0 [@media(pointer:fine)]:group-hover:opacity-100 [@media(pointer:fine)]:group-focus-within:opacity-100` — actions remain always visible on touch devices and become visible on keyboard focus. Tailwind v4 JIT supports arbitrary `@media` variants.
- **Tab pattern without ARIA**: `<button>` elements styled as tabs must have `role="tab"`, `aria-selected`, and a `role="tablist"` wrapper to be announced correctly by screen readers.
- **Off-tablist active states need `role="status" aria-live="polite"`**: when a UI offers an active state that has no corresponding tab in the tablist (e.g. a CUSTOM date range period), screen readers receive no `aria-selected` feedback. Fix: add a `<div role="status" aria-live="polite" className="sr-only">` inside the selector that describes the active period in plain text. This is the correct pattern when the active state is not representable as a standard tab role. Applied in `PerformancePeriodSelector` for the CUSTOM period chip.
- **`scope="col"` / `scope="row"` on data tables**: every `<th>` in a `<thead>` must have `scope="col"` so screen readers can associate header to column data. Row header cells (e.g. year column in heatmaps, name column in comparison tables) must be `<th scope="row">` (change from `<td>`). Without these, screen readers cannot navigate table structure — violates WCAG 1.3.1. Applied in `MonthlyReturnsHeatmap.tsx` (year `<td>` → `<th scope="row">`, month headers `scope="col"`) and `BenchmarkComparisonChart.tsx` comparison table.
- **`<Card>` (or any non-interactive element) with `onClick` requires explicit keyboard support**: shadcn `<Card>` is a `<div>` — it receives no keyboard events by default. When used as a clickable navigation element, always add `role="button"`, `tabIndex={0}`, `aria-label`, and an `onKeyDown` handler: `(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handler(); } }`. Also add `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2` for the visible focus ring. Omitting these violates WCAG 2.1.1. Applied in `CostCentersTab.tsx` center cards.
- **Touch targets**: minimum 44×44px per Apple HIG and Material Design. `h-6 w-6` (24px) icon-only buttons are below threshold — use at least `h-8 w-8` for action buttons in dense lists; `h-10 w-10` for primary CTAs and destructive icon buttons (trash, remove). Tab filters need at least `min-h-[36px]`. shadcn `size="icon"` defaults to 36px — always override with `className="h-10 w-10"` on touch-critical controls.
- **`type="button"` on `<button>` elements**: always set explicit `type="button"` on buttons that are not form submits to prevent accidental form submission in nested contexts.
- **`aria-label` on icon-only selects**: `SelectTrigger` without visible label text must have `aria-label` — screen readers will otherwise only announce the current value with no context about what is being selected.
- **`DialogDescription`/`DrawerDescription` is required in every `DialogContent`/`DrawerContent`**: Radix (and vaul, which is built on Radix Dialog) logs "Missing `Description` or `aria-describedby={undefined}`" at runtime when the content has a title but no description. Always import and add `DialogDescription`/`DrawerDescription` inside the header, below the title, with a one-line contextual description. In create/edit dialogs use a ternary to match the mode. Use `className="sr-only"` when the description should not be visible. Never suppress with `aria-describedby={undefined}` — that removes accessibility without silencing the root cause. Applied in `ExpenseDialog.tsx`, `MultiSelect` drawer (`multi-select.tsx`).
- **`role="radiogroup"` for ephemeral type pickers**: when N cards act as a single-choice selector that immediately navigates without persistent selected state, apply `role="radiogroup"` on the container + `role="radio"` + `aria-checked={false}` on each card. `aria-checked` is always `false` because clicking immediately navigates away. Applied in `AssetDialog.tsx` Step 1 type picker.
- **`role="group"` + `aria-labelledby` for button groups**: a `<Label>` or `<label>` without `htmlFor` is not associated with anything in the accessibility tree. When a label describes a group of buttons (e.g. year-pill selectors), use `role="group"` on the container + `aria-labelledby` pointing to a labelling element with an `id`. This is the correct ARIA pattern for labelled groups that share no single focusable input. Applied in `ExpenseTrackingTab.tsx` Anno filter.

---

## Testing and Workflow
### Commands
- `npm test -- <file>` or `npx vitest run <file>` for targeted tests; `npx tsc --noEmit` for type checking
- Always run `npx tsc --noEmit` before any PR. For feature area changes, also run the matching test suite:
  - Overview/materialized-summary: `apiAuthRoutes` + `dashboardOverviewService`
  - Performance: `performanceService` | History: `chartService` | FIRE/Goals: `fireService` + `goalService`
  - Assistant: `assistantRoutes` + `assistantWebSearchPolicy` + `assistantMonthContextService`
  - Dividends/cron: `dividendUseCase` + `dividendProcessor` | Email: `monthlyEmailService`
  - Assets/bonds: `assetDialogHelpers` + `couponUtils` | Cashflow/Budget: `budgetUtils`
  - Transfers/cash balances: `cashBalanceReconciliation` + `updateCashAssetBalancesAtomic` + `transferFeature`
  - Allocation: `allocationUtils`
- For motion/perceived-performance changes, compare `npm run dev` vs `npm run build && npm run start` — dev can exaggerate cost

### Test Patterns
- Use `new Date(year, monthIndex, day)` in tests (not ISO strings); `toBeCloseTo()` for floats; fake timers for time-sensitive branches
- Keep test fixtures aligned with current required types — `BudgetItem.order` is required
- If a test imports a service that pulls in `lib/firebase/config.ts`, mock `@/lib/firebase/config` at the test boundary — Firebase init fails without valid env vars
- Materialized-summary tests: keep `updatedAt`/`computedAt` inside the 5-minute TTL to hit the cached branch; older dates force live recompute and need fuller Admin SDK mocks
---
## Common Errors to Avoid
### Quick-Fix Reference
- **Timezone bug** (wrong month near midnight): use Italy timezone helpers, never `Date.getMonth()`
- **Settings toggle resets on reload**: update both `getSettings()` and BOTH branches of `setSettings()`
- **Admin SDK auth gap**: always verify Firebase ID token server-side; Admin SDK bypasses Firestore rules
- **Radix Select runtime error**: never use empty string as value — use sentinels `__all__`, `__none__`, `__create_new__`
- **Radix Tabs forceMount gap** (blank space on hidden panel): add `data-[state=inactive]:hidden` to `TabsContent` in `components/ui/tabs.tsx`
- **Firestore transaction crash** (multi-doc `runTransaction`): ALL `tx.get()` must come before ANY `tx.update()` — see dedicated entry below
- **MultiSelect can't scroll on tablet** (inside a Drawer): pass `forceDrawer` — see dedicated entry below

### Duplicate Badge/Label Maps — Silent Dark Mode Regression
- When a `Record<Type, string>` map (labels, badge Tailwind classes) is copied across 3+ files, the copies drift. The canonical symptom: one copy is missing dark: variant classes that the others have — badges in that one component show near-white backgrounds in dark mode, making text illegible, but TypeScript compiles without error because the type signature matches.
- **Fix**: move the map to `lib/constants/<domain>.ts` on first duplication (Rule of Three). If a copy already exists without dark: variants, audit ALL copies and reconcile before centralising.
- Applied: `dividendTypeBadgeColor` (3 files → `lib/constants/dividendTypes.ts`). `DividendDetailsDialog` had no dark: variants; `DividendTable` had them; silently diverged.

### Skeleton as Dead Code — Loading State Silent Failure
- Skeleton exists but page shows blank flash: the skeleton was never imported — `if (loading) return null` is still in place. TypeScript does not catch unused components. After writing a skeleton, verify it's wired up in the page

### Skeleton Must Wrap in the Same Container as the Real Layout
- **Symptom**: content shifts on load — skeleton has different padding or max-width than the real layout.
- **Root cause**: `if (loading) return <XSkeleton />` fires before the `<PageContainer>` wrapper in the main return, so the skeleton renders without `max-w-[1600px] mx-auto max-desktop:portrait:pb-20`.
- **Fix**: import `PageContainer` inside the skeleton file and wrap its root div there, or wrap at the call site. Applied in `AllocationPageSkeleton.tsx`.

### Recharts Legend and Tooltip Mismatch
- `Legend` reads `<Bar fill>`, not `<Cell>`
- Always set `fill` on `<Bar>` even when per-bar colors are overridden by `<Cell>`
- Do not set text `color` globally in tooltip style for line/area/bar charts
- **Recharts `formatter` prop signature is `(value: ValueType | undefined, ...)`**: `ValueType = string | number | (string | number)[]`. Never type the first param as `number` — TypeScript compiles but runtime receives `undefined` for gap points in line charts with `connectNulls={false}`. Correct coercion patterns: `Number(value ?? 0)` for bar charts; `value != null ? Number(value).toFixed(1) : '—'` for nullable line charts.
- **Recharts tooltip has THREE separate style props — all must be set**: `contentStyle` (the box wrapper), `labelStyle` (the title row, e.g. "apr 26"), and `itemStyle` (each value row, e.g. "Spesa : 208,71 €"). They do NOT inherit from each other. Omitting `itemStyle` leaves value-row text at Recharts' hardcoded default color — invisible on dark backgrounds. Full pattern:
  ```tsx
  const TOOLTIP_CONTENT_STYLE = { backgroundColor: 'var(--card)', border: '1px solid var(--border)', color: 'var(--card-foreground)', fontSize: 12, borderRadius: 8 } as const;
  const TOOLTIP_LABEL_STYLE  = { fontWeight: 600, color: 'var(--card-foreground)' } as const;
  const TOOLTIP_ITEM_STYLE   = { color: 'var(--card-foreground)' } as const;
  <Tooltip contentStyle={TOOLTIP_CONTENT_STYLE} labelStyle={TOOLTIP_LABEL_STYLE} itemStyle={TOOLTIP_ITEM_STYLE} cursor={{ fill: 'var(--muted)', opacity: 0.4 }} />
  ```
  Define the three objects as module-level `as const` constants — avoids re-creating objects on every render and keeps usage sites clean. Applied in `ConfrontoAnnualeSection.tsx` (TOOLTIP_CONTENT_STYLE / TOOLTIP_LABEL_STYLE), `CostCenterDetail.tsx` (all three). Never use `color: '#111827'` in any of them — invisible in dark mode. The `#111827` bug was found and fixed in `BenchmarkComparisonChart.tsx` `labelStyle` (2026-05-29).

### `sticky` on `tfoot` inside a div-scroll wrapper
- **Symptom**: the total/summary footer row overlaps the last visible data rows when a table is inside a scrollable `<div>` — the tfoot appears to float on top of content.
- **Root cause**: `sticky bottom-0` on `<tfoot>` positions relative to the nearest scroll ancestor. If the scroll container is a `<div>` wrapper (not the `<table>` itself), the tfoot sticks to the bottom of the visible viewport area, overlapping content. CSS `sticky` on table parts only works correctly when the table's own scroll context is the scroll container.
- **Fix**: remove `sticky bottom-0` from `<tfoot>`. The total appears naturally at the end of the table after scrolling — correct UX for a long scrollable list.
- Applied in `CashflowSankeyChart.tsx` and `AnalisiTab.tsx` (ExpenseList).

### Sticky `thead` transparent background causes header/row overlap on scroll
- **Symptom**: column headers visually merge with table rows when scrolling inside a `max-h-[...] overflow-y-auto` container — header text and cell content overlap.
- **Root cause**: `bg-muted/50` (50% opacity) on `<thead className="sticky top-0">` is semi-transparent. Inside an overflow scroll wrapper, rows scroll under the sticky header and are visible through the transparent background.
- **Fix**: use a fully opaque token — `bg-card` for tables inside `<Card>`, `bg-background` for tables on plain page backgrounds. Never use alpha-transparent backgrounds on sticky headers.
- Applied in `CashflowSankeyChart.tsx` (Sankey transaction table) and `AnalisiTab.tsx` (ExpenseList drill-down).

### Recharts `<Legend content=>` must receive a module-level component for stable reference
- **Symptom**: Recharts Legend re-renders on every state change unrelated to chart data (drill-down navigation, filter changes) — noticeable flicker or unnecessary reconciliation.
- **Root cause**: `content={() => renderLegendItems(...)}` creates a new function reference every render. Recharts treats a changed `content` reference as a reason to re-render the Legend subtree.
- **Fix**: extract the legend renderer to a module-level component (e.g. `LegendItems`) and use `content={() => <LegendItems items={...} />}`. The component reference itself is stable; only the props change when data changes.
- **Bonus**: module-level component enables proper semantic HTML — clickable legend items can be `<button type="button">` instead of `<div onClick>` (WCAG 2.1.1 compliance).
- Applied in `AnalisiTab.tsx`: `LegendItems` replaces `renderLegendItems`.

### `@nivo/sankey` + `useChartColors()` → react-spring arity crash
- **Symptom**: `createStringInterpolator2: The arity of each output value must be equal` on page load after making Sankey node colors theme-aware.
- **Root cause**: `@nivo/sankey` v0.99 uses `@react-spring/web` internally. `useChartColors()` starts with hex values (CHART_COLORS), then after a `requestAnimationFrame` resolves CSS vars returning `oklch(...)` strings (Tailwind v4 format). When `sankeyData` recomputes with oklch values, react-spring tries to interpolate from hex → oklch — doesn't recognize oklch as a color format, parses it as a generic string with different numeric arity → crash.
- **Workarounds that DO NOT work**: `animate={false}` on ResponsiveSankey (spring objects are initialized regardless); canvas-based oklch→hex normalization (the re-render itself triggers spring updates regardless of color format).
- **Real fix**: Sankey node colors must remain hardcoded hex. Semantic colors (blue=fixed, violet=variable, amber=debt) are intentional — they must not follow the theme palette.
- **General rule**: never pass `useChartColors()` values to any Nivo component backed by `@react-spring/web` (Sankey, Network, TreeMap). Only Recharts is safe (no react-spring dependency).

### Cashflow Null State vs Genuine Zero
- `expenseStats === null` (no data) ≠ `expenseStats = 0` (real zero). Render empty state for null; `€0,00` is reserved for confirmed zero

### Deriving Text-Color Classes from BG-Color Classes via String Replace
- **Anti-pattern**: `progressColor(ratio).replace('bg-green-500', 'text-green-600 dark:text-green-500')` to get a matching text color. Fragile: breaks silently if the source class name changes; Tailwind's JIT scanner treats the derived string as a new class name, which is never statically visible in source — it may or may not appear in the purged output depending on safelist config.
- **Fix**: extract a dedicated `progressTextColor(ratio, inverted)` that returns text-class strings directly, using the same threshold logic as `progressColor`. The two functions stay in sync and both are statically scannable. Applied in `BudgetTab.tsx`.

### Recharts Sparkline — flat line on large absolute numbers
- Symptom: 260k → 284k sparkline is a flat horizontal line. Fix: `<YAxis hide domain={['auto', 'auto']} />` — scales Y to data range instead of starting from 0

### Recharts ResponsiveContainer -1 Warning
- Symptom: `The width(-1) and height(-1) of chart should be greater than 0` fires on mount.
- Root cause: `ResponsiveContainer` always initialises its state with `{ width: -1, height: -1 }` and logs the warning in the render body before `ResizeObserver` fires its first measurement — on every mount, regardless of parent container size.
- **rAF workarounds do not work**: deferring mount by one `requestAnimationFrame` only delays the problem. When the component remounts after `rafReady` becomes `true`, `ResponsiveContainer` initialises with -1 again and logs again.
- **Real fix for fixed-size containers**: when chart dimensions are known at compile time (e.g. compact donut 160×160), bypass `ResponsiveContainer` entirely — pass `width` and `height` props directly to the Recharts chart component (`<PieChart width={160} height={160}>`). No measurement needed, no warning. Applied in `components/ui/pie-chart.tsx` compact mode via `width`/`height` props.
- **For variable-size containers**: `ResponsiveContainer` is still necessary. The -1 warning fires once on mount then disappears — cosmetic only.

### Radix CollapsibleTrigger Nested Button
- Symptom: `<button> cannot be a descendant of <button>` hydration error in console
- Cause: `CollapsibleTrigger asChild={false}` (the Radix default) renders its own `<button>` element. If the trigger's children contain any `Button` component (another `<button>`), this creates an invalid nested-button DOM tree.
- Fix: always use `asChild` on `CollapsibleTrigger` so it clones the first child element as the interactive trigger. **The child must be `<button type="button">`** — never a `<div>` or `<span>`. Non-button elements are excluded from the tab order and do not respond to Enter/Space, breaking keyboard access entirely (WCAG 2.1.1). `disabled` and other props still work correctly via prop merging.
- **`asChild + <div>` is a P1 keyboard accessibility bug**: a `<div>` child looks correct visually but removes the trigger from keyboard navigation. Applied fix in `ExpenseTrackingTab.tsx` Filtri card.
- Applied in `AssistantMemoryPanel` — use `<button type="button">` (or a non-button element only if the trigger itself contains no interactive controls and you add `tabIndex={0}` + `onKeyDown` manually).

### CSS Grid Mobile Overflow: `auto` Tracks vs `minmax(0, 1fr)`
- **Symptom**: on mobile, a page scrolls horizontally — long text in message cards or tables causes the page to expand beyond the viewport.
- **Root cause**: a `grid` without explicit column definitions uses implicit `auto` tracks. `auto` tracks have `min-width: auto` — they expand to accommodate the widest child, even beyond the viewport. On desktop, `minmax(0, 1.7fr)` prevents this; but the mobile fallback has no constraint.
- **Fix**: always add `grid-cols-1` explicitly on mobile for single-column grids. `grid-cols-1` = `repeat(1, minmax(0, 1fr))` — the `minmax(0, ...)` forces the column to be allowed to shrink, so long text wraps instead of expanding the layout. Apply `min-w-0` to the direct flex/grid children as well — flex items have `min-width: auto` by default and resist shrinking.
- **Pattern**: `<div className="grid grid-cols-1 gap-6 desktop:grid-cols-[minmax(0,1.7fr)_...]">` + `<div className="flex min-w-0 flex-col">`.
- Applied in `AssistantPageClient.tsx` — without this, assistant message cards caused horizontal page scroll on tablet/mobile.

### `overflow-x-hidden` on Ancestor Breaks Scroll Containers
- **Symptom**: adding `overflow-x-hidden` to a wrapper stops the page scrolling horizontally, but content inside is truncated (clipped) rather than scrolling — tables, code blocks, and long text are cut off.
- **Root cause**: `overflow-x: hidden` creates a new block formatting context and clips ALL overflow from descendants. Any child with `overflow-x: auto` can no longer create a visible scrollbar — the clipping happens at the ancestor before the scroll container has a chance to render. This also applies to `overflow-y: auto` on `<main>`: setting one overflow axis to non-`visible` implicitly sets the other to `auto`, enabling horizontal scroll as a side effect.
- **Correct fix**: resolve the actual source of overflow (negative margins, `auto` grid tracks, missing `min-w-0`) rather than clamping with `overflow-x-hidden`. Reserve `overflow-x-hidden` only for decorative elements (reveal effects, slide-in panels) that have no scrollable descendants.
- Applied in `AssistantPageClient.tsx` — `overflow-x-hidden` on the page wrapper was clipping table content and text; the real fix was `grid-cols-1` + `min-w-0` + removing `-mx-4`.

### JSX Comment Cannot Be a Sibling in a Ternary Else Branch
- **Symptom**: TypeScript parse errors like `TS1005: ')' expected` or `TS1382: Unexpected token. Did you mean {'>'}?` immediately after adding a `{/* comment */}` before a JSX element inside a ternary.
- **Root cause**: a ternary expression requires a single expression for each branch. `{/* comment */} <div ...>` is two expressions — the comment is a JSX expression (`{...}`), and the element is a second one. The parser sees two children and fails.
- **Fix**: remove the comment, or wrap both in a fragment `<>...</>` if you need the comment. Alternatively, move the comment inside the element itself.
- This error is subtle because the parse failure points at a closing brace or `>` character far from the actual comment.

### `useCountUp` Has No `enabled` Option
- `UseCountUpOptions` interface only has `startDelay`, `duration`, `once`, `fromPrevious`. There is no `enabled` field.
- **Pattern when conditionally animating**: always call `useCountUp(value ?? 0, opts)` unconditionally (hook rules). Gate the display in JSX: `{value !== null ? cachedFormatCurrencyEUR(animated ?? 0) : '—'}`. The `?? 0` on the animated value handles the `number | null` return type.
- Do NOT try to skip the animation by passing `enabled: false` — it doesn't exist and TypeScript will error.

### iOS Safe Area on Sticky Composers
- Sticky input bars positioned with `bottom-N` in a scrollable layout need `padding-bottom: env(safe-area-inset-bottom, 0px)` for iOS devices with home indicator. Use the CSS property directly (not Tailwind class) for reliable cross-browser support: `style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}` or via arbitrary value `pb-[env(safe-area-inset-bottom,0px)]`. The fallback `0px` ensures no extra padding on non-notched devices.
- Do NOT add extra bottom padding to account for BottomNav clearance if the sticky wrapper already uses `bottom-N` — that double-counts. Only the iOS safe area needs a top-up beyond the sticky offset.

### useMediaQuery — Mobile Re-render Trap
- `useMediaQuery` initializes with the real `window.matchMedia(query).matches` value, not `false`
- The classic `useState(false)` SSR-safe pattern would cause an extra re-render on mobile (false → true) that competes with `requestAnimationFrame` animation loops at mount time
- Safe to read `window` directly because all callers are `'use client'` components rendered only after login
- **Only revert to `useState(false)` if adding a hook call to a public SSR page**

### Heavy Renders vs rAF Animations
- On mobile, CPU budget is ~3–5x tighter. Multiple concurrent tasks at mount (re-renders, Recharts SVG, Framer Motion stagger, rAF loops) can exceed the 16ms/frame budget and cause visible animation jank
- When a page uses `useCountUp` for mount-time KPI animations, avoid simultaneously rendering heavy components (Recharts charts, large lists) that aren't immediately visible
- Pattern: start collapsible/below-fold Recharts components as collapsed on mobile, let users expand — use `isMobile` from `useMediaQuery` in the `useState` initializer for the expanded state

### Dividend TTM Filter: paymentDate not exDate
- Symptom: YOC (Yield on Cost) and `averageYield` appear even when no dividends have been received yet
- Cause: `getAllDividends` returns ALL dividends including upcoming ones. Filtering by `exDate >= twelveMonthsAgo` passes dividends with a past ex-date but future paymentDate — meaning cash has not arrived yet
- Fix: filter TTM dividends by `paymentDate >= twelveMonthsAgo && paymentDate <= today`. The `today` variable is already defined for the `paidDividends` chart filter in the same route — reuse it. Applied in `app/api/dividends/stats/route.ts`
- Rule: use `exDate` only for "announced future" dividend data (upcoming dividends card). Use `paymentDate` capped at `today` for any "received" metric (YOC, averageYield, charts)
- **`today` timezone gotcha**: `today.setHours(0, 0, 0, 0)` produces `2026-05-19T22:00:00Z` on a CEST (UTC+2) server — 2 hours *before* midnight UTC. A dividend stored at `2026-05-20T00:00:00Z` (Firestore midnight UTC) then compares as *future* and vanishes from both "received" and "upcoming" lists. Fix: always use `today.setHours(23, 59, 59, 999)` when constructing the upper bound for `paymentDate <=` comparisons — the resulting UTC timestamp is always *after* midnight UTC of the same local day, regardless of server timezone. Applied in `dividendService.ts`, `app/api/dividends/stats/route.ts`, `lib/server/dividendUseCase.ts`.

### JSON Date Deserialization in API Route Bodies
- `Date` fields in `request.json()` bodies arrive as ISO strings (`"2024-04-10T..."`), not `Date` objects
- Comparing a string to a `Date` with `<=` / `>=` always returns `false` in JavaScript — the string coerces to `NaN` via `Number()`
- **Always wrap**: `const paymentDate = new Date(dividendData.paymentDate)` before any date comparison in a route or use case that receives data from the client
- Applied in `lib/server/dividendUseCase.ts` — the bug caused automatic expense creation to silently never trigger for past dividends

### AnimatePresence Dialog Body Collapse
- Symptom: dialog opens but body appears completely blank — no form fields, no cards, just empty white space
- Cause: `absolute inset-0` on a `motion.div` inside `AnimatePresence` requires the parent to have an **explicit pixel height**. Inside a flex dialog driven by content height (`max-h-[90vh] flex flex-col`), a `flex-1` child has no defined pixel height — absolute children collapse to zero.
- Fix: use `div.flex-1.overflow-y-auto.min-h-0` as the scrollable container (no `relative`), plain padding classes on the `motion.div` children, and move the sticky footer outside `AnimatePresence` as a `shrink-0` sibling. Connect the submit button with `<form id="expense-form">` + `<button type="submit" form="expense-form">` so it doesn't need to be physically inside the `<form>` tag.

### Async Tab Count: boolean | null Pattern
- Tab count depends on async settings: init `useState<boolean | null>(null)`. While `null`, render a `h-10 animate-pulse rounded-md bg-muted` placeholder to hold space. Mount real `TabsList` only after settings arrive — avoids a visible column-count reflow flash.

### Components Defined Inside Render — Remount Anti-Pattern
- **Symptom A**: `AnimatePresence initial={false}` enter animation appears instant (never plays). The setup looks correct — the pattern is fine — but it always looks like a fresh mount with no prior state.
- **Symptom B**: `useEffect` with empty deps `[]` fires on every parent state change (e.g. expanding an unrelated collapsible), not just on true mount.
- **Root cause**: defining `const Foo = () => {...}` inside another component's render body creates a new function reference on every call. React uses the function reference as the component type key. When the type changes each render, React fully unmounts the old instance and mounts a new one — even if the rendered output looks identical. Result: `AnimatePresence initial={false}` on a freshly-mounted `AnimatePresence` sees its child already present and skips the enter animation; `useEffect([])` fires because it IS a true new mount.
- **Fix**: never define components inside a render function. Two options: (1) move to module level and pass parent state as explicit props; (2) inline the JSX directly in the return using IIFEs for local variable scoping (`{overview?.expenseStats && (() => { const { income } = ...; return (<div>...); })()} `).
- **Related AGENTS note**: "React Compiler: components must be at module level" covers the React Compiler-specific error. This pattern causes silent remounting even without the Compiler.
- Applied in `app/dashboard/page.tsx`: `FiscalSection`, `CashflowCard`, `VariationBlocks` converted to inline JSX; fiscalItems pre-computed via `useMemo` before the loading early return.

### All Hooks Must Precede Conditional Early Returns
- **Symptom**: `Uncaught Error: Rendered more hooks than during the previous render` at the first `useMemo`/`useEffect`/`useState` call placed after an `if (loading) return (...)`.
- **Rule**: React hooks must be called in the same order on every render. An early return causes renders that hit the guard to skip every hook below it — React detects the count mismatch and throws.
- **Fix**: move ALL hook calls (including "derived data" `useMemo`s that feel close to their usage) above any `if (...) return` guard. Use optional chaining inside the hook body to handle undefined data: `useMemo(() => { if (!overview?.metrics) return []; ... }, [overview])`.
- Applied in `app/dashboard/page.tsx`: `fiscalItems` useMemo initially placed after `if (loading) return (...)` — moved to the derived metrics section above it.

### Recharts ResponsiveContainer inside Flex Row with Sibling Legend
- **Symptom**: the chart takes all available space, squishing the sibling legend column to near-zero width; or the chart reports width/height of `-1` and renders a flat line.
- **Root cause**: `<ResponsiveContainer width="100%">` measures its parent's width. Inside a `flex` row, the parent is a flex item without an explicit width — the flex algorithm doesn't resolve it before `ResizeObserver` fires, so the container gets zero or the full width.
- **Fix**: wrap the chart component in a fixed-size `div` (`style={{ width: 160, height: 160, flexShrink: 0 }}`). `ResponsiveContainer` then measures that fixed parent unambiguously. The sibling legend takes the remaining `flex-1` space.
- **Double-legend corollary**: if the embedded chart has an internal `<Legend>` and the parent renders a second custom legend, suppress the chart's internal one (`compact` prop, or `showLegend={false}`). Two legends is always a bug — one from Recharts SVG, one from the parent JSX.
- Applied in `OverviewChartsSection.tsx`: `compact` prop on `PieChart`; `width`/`height` passed as explicit props (160 desktop, 150 mobile) — no fixed-size wrapper div needed since compact mode bypasses `ResponsiveContainer` entirely.

### `getAvailablePercentage` with `excludeGoalId` — double-counting trap
- `getAvailablePercentage(assetId, assignments, excludeGoalId)` returns `100 - sum(other goals)`, effectively the **total cap** a goal can hold (free pool + its own existing allocation, since its own is excluded from the sum).
- **Do NOT add `existingAssignment` on top**: `maxAllowedPct = available + existingAssignment.percentage` double-counts. If Giulia has 50% and Isabella has 50%, `available=50` (excludes Isabella) + `existingAssignment=50` = 100% — lets Isabella increase to 100%, putting total at 150%.
- **Correct**: `maxAllowedPct = available`. The cap is already the right value.
- **For display** (showing truly free space to the user): use `getAvailablePercentage(assetId, assignments)` with **no exclusion** — returns globally free space. If 0% free and the goal already has an assignment, show "Nessuna quota libera", not "X% disponibile". Applied in `AssetAssignmentDialog.tsx`.

### Firestore `runTransaction` — All Reads Before All Writes (hidden by mocks)
- **Symptom**: a multi-document transaction throws `FirebaseError: Firestore transactions require all reads to be executed before all writes.` in production — but every unit test passes.
- **Root cause**: the Firestore client SDK forbids any `tx.get()` after a `tx.update()`/`set()`/`delete()` within the same transaction. A naive `for` loop that does `get → update` per iteration violates this on the 2nd doc. Critically, this is invisible in tests when the function under test is **mocked away** (e.g. `cashBalanceReconciliation.test.ts` mocked `updateCashAssetBalancesAtomic`), so the real transaction body never runs — 581 tests were green while every 2-account transfer was broken.
- **Fix**: two phases inside `runTransaction` — first loop performs ALL `tx.get()` (collect snapshots), second loop performs ALL `tx.update()`. Also **aggregate deltas per docId before the transaction** so the same ref is never read/written twice (a self-transfer where origin === destination nets to 0 and is skipped). Applied in `updateCashAssetBalancesAtomic` (`assetService.ts`).
- **Test the real thing**: add an integration test with a fake `runTransaction` whose `tx.get` throws once a write has happened (mirrors the SDK). `__tests__/updateCashAssetBalancesAtomic.test.ts` is the template. Rule: any function whose correctness depends on transaction semantics must be tested against the real implementation, not a mock of itself.
- **Toast-after-reconcile corollary**: in `ExpenseDialog`, show the success toast AFTER the balance reconcile (`reconcileTransfer*`/`reconcileSingle*`) returns — never before. A toast fired before the (possibly throwing) transaction shows false "success" while balances stay inconsistent.

### MultiSelect Inside a Drawer — Popover Can't Scroll on Tablet (`forceDrawer`)
- **Symptom**: opening the category MultiSelect inside the Cashflow filters Drawer works on mobile but on tablet (640–1023px) the option list can't scroll and overflows; console logs `Blocked aria-hidden on an element because its descendant retained focus`.
- **Root cause**: `MultiSelect` renders its options in a nested vaul **Drawer** only when `screenSize === "mobile"` (<640px); on tablet/desktop it renders a Radix **Popover**. A Popover nested inside a vaul Drawer fights for focus trapping (the aria-hidden warning) and the floating content is clipped/unscrollable.
- **Fix**: pass `forceDrawer` to render the options as a bottom-sheet Drawer regardless of screen size (the `inDrawer` flag also bumps the list to `max-h-[60vh]`). Use it for any MultiSelect that lives inside another Drawer/Sheet. The filters Drawer only mounts <1440px, so the category selector is always a bottom-sheet there. Applied in `MobileFiltersDrawer.tsx` → `multi-select.tsx`.
