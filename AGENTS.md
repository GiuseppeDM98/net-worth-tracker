# AI Agent Guidelines - Net Worth Tracker (Lean)

Project-specific conventions and recurring pitfalls for Net Worth Tracker.
For architecture and current product status, see [CLAUDE.md](CLAUDE.md).

---

## Critical Conventions

### Italian Localization
- All user-facing text in Italian, all code comments in English only
- Use `formatCurrency()` for EUR and `formatDate()` for `DD/MM/YYYY`
- Use `Sottocategoria` (no hyphen)
- **Navigation taxonomy (established in session 30):** Panoramica, Patrimonio, Allocazione, Rendimenti, Storico, Impostazioni. The following are kept in English intentionally: `Hall of Fame` (premium brand name), `FIRE e Simulazioni` (acronym), `Cashflow` (established financial term in Italian). Do not translate these back.
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

### Layout Tokens
- Never hardcode structural layout colors in shell components
- Use semantic tokens like `bg-background`, `text-foreground`, `border-border`
- Hardcoded green/red for gains and losses is allowed

---

## Key Patterns

### React Query and Derived State
- Invalidate all related caches after mutations
- Never remove tabs from `mountedTabs`
- Use `useMemo` for derived state; do not use `useEffect + setState` for computed values

### Dynamic Imports
- `next/dynamic` with named exports must unwrap via `.then(m => ({ default: m.Named }))`
- Use `ssr: false` for client-only dialogs and panels
- Pass the props type parameter to preserve type safety

### Expense Sign Convention
- Income is stored positive
- Expenses are stored negative
- Net savings is `sum(income) + sum(expenses)`
- When moving records across income/expense boundaries, flip the sign

### History and Snapshot Baselines
- End date for Firestore month queries must include the full last day
- Annual deltas use December of the previous year as baseline, not January of the same year
- Monthly heatmaps remain month-over-month and always use the immediately previous month
- `MonthlySnapshot` fields built in `createSnapshot()` must also be added to `POST /api/portfolio/snapshot`

### History: Savings vs Labor vs Performance
- `prepareSavingsVsInvestmentData*()` decomposes monthly/annual net worth growth into `netSavings` and `investmentGrowth`
- `prepareMonthlyLaborMetricsData()` is the single source for the History `Lavoro & Investimenti` section
- For History month counts, use `netWorthGrowth`, not `investmentGrowth`
- Zero-change months (`netWorthGrowth === 0`) are excluded from positive/negative month counters
- Performance heatmap is similar visually but semantically different: it isolates investment returns after cash flows

### Budget
- `autoInitBudgetItems` merges saved amounts with live categories on every mount
- `expenseMatchesItem` matches by category/subcategory ID regardless of income/expense type
- Amounts are stored monthly; annual views multiply by 12
- Aggregate keys: `__subtotal_{type}__`, `__total_expenses__`, `__total_income__`
- `BudgetItem.order` is required, including in tests and helper fixtures

### Settings Synchronization
- Every new settings field must be handled in three places: type definition, `getSettings()`, `setSettings()`
- `setSettings()` has two write branches; update both

### Asset and FIRE Rules
- `quantity = 0` is valid and marks sold assets in history logic
- Cash asset balance lives in `quantity`, not via price updates
- Borsa Italiana bond prices are `% of par`; store converted EUR values
- FIRE annual expenses must use the last completed year
- `includePrimaryResidence` must flow through both React Query key and query function

### Formatter Duplication
- `formatCurrency` and `formatCurrencyCompact` exist in both `lib/utils/formatters.ts` and `lib/services/chartService.ts`
- Update both when changing formatting behavior

### Dashboard Data Isolation
- Do not add `useAllExpenses` or other full-history queries to Overview/Dashboard
- Full-history expense analysis belongs in History or Cashflow

### Loading and Skeletons
- Skeletons should mirror the final layout
- Reuse the same skeleton across chained loading states
- Use full-page skeletons only on truly slow pages; otherwise prefer delayed or null loading
- `Loader2` is for initial loading, `RefreshCw` is for user-triggered refresh

### Visual Hierarchy Patterns
- Hero KPI: use `border-l-4 border-l-primary` + `text-3xl desktop:text-4xl tabular-nums` on the single most important card per page (e.g. Patrimonio Totale Lordo on Dashboard, first chart on History)
- Primary MetricCards (`isPrimary`): value renders at `text-3xl`; secondary cards at `text-2xl`. Use `isPrimary` sparingly — max 2 per MetricSection cluster
- Section headers in `MetricSection`: left-border accent (`w-[3px] bg-primary opacity-70`) replaces emoji prefixes. Do not use emoji in section titles
- Page header zone: eyebrow label (`text-xs uppercase tracking-widest text-muted-foreground`) above the `h1` + `border-b border-border` below the full header row separates editorial zone from data grid
- Action hierarchy: one `variant="default"` CTA per page; utility actions (refresh, CSV export, insert snapshot) use `variant="ghost"` or `variant="outline" size="sm"`

### Motion and Charts
- Shared variants live in `lib/utils/motionVariants.ts`
- Do not wrap shadcn `TableRow` with `motion()`; use `motion.tr`
- Recharts defaults:
  - `Bar` / `Pie`: `animationDuration={600}` + `animationEasing="ease-out"`
  - `Line` / `Area`: `animationDuration={800}` + `animationEasing="ease-out"`
  - `Pie` also needs `animationBegin={0}`
- Decorative stacked background areas should keep `isAnimationActive={false}`

### One-Time UI Effects
- Use `localStorage` helpers for once-ever celebrations
- Use `sessionStorage` plus an internal `useRef` guard for once-per-session notifications

### Dialog Layout
- Prefer sticky header + sticky footer dialog layout for long forms
- Do not use `overflow-y-auto` on dialog bodies that contain absolute-positioned custom dropdowns

---

## Testing and Workflow

### Commands
- `npm test -- <file>` or `npx vitest run <file>` for targeted tests
- `npx tsc --noEmit` for repo-wide TypeScript checking without generating build output

### Test Patterns
- Use local `new Date(year, monthIndex, day)` in tests, not ISO strings
- Use `toBeCloseTo()` for floats
- Use fake timers when testing helpers that depend on the current date
- Keep test fixtures aligned with current required types, especially `BudgetItem.order`

---

## Common Errors to Avoid

### Timezone Boundary Bugs
- Symptom: entries appear in the wrong month near midnight
- Fix: group with Italy timezone helpers, never native `Date.getMonth()`

### Settings Persistence Bugs
- Symptom: toggles save but reset after reload
- Fix: update both `getSettings()` and both branches of `setSettings()`

### Radix Select Empty String
- Symptom: runtime error from `SelectItem`
- Fix: use sentinels like `__all__`, `__none__`, `__create_new__`

### Recharts Legend and Tooltip Mismatch
- `Legend` reads `<Bar fill>`, not `<Cell>`
- Always set `fill` on `<Bar>` even when per-bar colors are overridden by `<Cell>`
- Do not set text `color` globally in tooltip style for line/area/bar charts

### ResponsiveContainer in Hidden Tabs
- Symptom: `width(-1)` / `height(-1)` warnings
- Fix: use explicit pixel heights, not `height="100%"`

### Overflow Traps
- `overflow-x-visible` disables useful table scrolling; use `overflow-x-auto`
- `overflow-y-auto` clips absolute overlays such as custom dropdowns

### Nullish vs Falsy Fallbacks
- When `0` is semantically invalid for a snapshot-derived display value, prefer `||` over `??`

### Sign-Dependent Icons
- For nullable metrics, define an explicit no-data fallback icon state
- Default to the neutral/positive visual, not a red negative indicator

### next/font Preload
- `next/font` with default `preload: true` emits a `<link rel="preload">` on every page using the root layout
- If a font is only used on a few pages (e.g. `Geist_Mono` via `font-mono` on FIRE and Hall of Fame), add `preload: false` to suppress the browser warning: *"preloaded using link preload but not used within a few seconds"*
- Revert to default if the font is later added to layout-level or globally shared components
