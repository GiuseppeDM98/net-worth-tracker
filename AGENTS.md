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

### Private API Authorization
- Any App Router API route that uses Firebase Admin SDK must authenticate server-side; Firestore rules do not protect Admin SDK calls
- Private routes must verify the Firebase ID token and bind the request to `decodedToken.uid`, not just a client-supplied `userId`
- For record-level mutations on Admin SDK routes, enforce ownership after loading the document (e.g. `dividend.userId`, `asset.userId`)
- Client-side calls to private API routes should use `authenticatedFetch()` so `Authorization: Bearer <idToken>` is sent consistently
- Scheduled server-to-server flows are the exception: cron routes authenticate with `CRON_SECRET`, and `/api/portfolio/snapshot` must continue to accept `cronSecret` for internal cron orchestration

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
- Auth pages (`/login`, `/register`): use `bg-background` + `border border-border rounded-xl bg-card p-8` panel — no `Card` component, no hardcoded grays. Top `h-px bg-border` accent line mirrors the dashboard page header separator. Eyebrow label + personal title ("Bentornato." / "Crea il tuo profilo.") apply the same typographic pattern as internal pages. Cross-links use `underline underline-offset-4 text-foreground`, not a colored link
- Secondary rhythm on long pages: wrap secondary card clusters in `<div className="space-y-4">` nested inside the page's `space-y-6` container — the 16px vs 24px ratio visually subordinates the group without adding decoration. Use `border-t border-border/40 pt-4` (or `pt-6` when adding an eyebrow label) on a `motion.div` to signal a zone transition; the divider animates with the content automatically
- Section zone eyebrows (e.g. "Composizione"): `text-xs font-medium uppercase tracking-widest text-muted-foreground` — same pattern as page header eyebrows but inside a `pt-6 border-t border-border/40` wrapper to act as a section separator

### Motion and Charts
- Shared variants live in `lib/utils/motionVariants.ts`
- Do not wrap shadcn `TableRow` with `motion()`; use `motion.tr`
- Use `motion.create(Component)` — `motion(Component)` is deprecated in Framer Motion v11+ and logs a warning
- Recharts defaults:
  - `Bar` / `Pie`: `animationDuration={600}` + `animationEasing="ease-out"`
  - `Line` / `Area`: `animationDuration={800}` + `animationEasing="ease-out"`
  - `Pie` also needs `animationBegin={0}`
- Decorative stacked background areas should keep `isAnimationActive={false}`
- **Page transitions: use `template.tsx`, NOT `layout.tsx` + `AnimatePresence`**. Next.js App Router wraps navigations in `startTransition` (React 18 concurrent); `AnimatePresence` can inherit the previous variant context ("visible") and skip `initial="hidden"` on the new child, causing a 1-frame flash of fully-visible content. `template.tsx` re-mounts on every navigation, guaranteeing Framer Motion treats each mount as a true first mount. Trade-off: no exit animation (old page unmounts immediately). See `app/dashboard/template.tsx`
- Page-level `motion.div variants={pageVariants}` wrappers on individual pages are **redundant** when `template.tsx` is in place — remove them to avoid compounded opacity (opacity `t²` instead of `t`)
- **`prefers-reduced-motion`**: add `<MotionConfig reducedMotion="user">` at the layout root (`app/dashboard/layout.tsx`) — propagates to the entire tree, no per-component guards needed
- **Icon swap animation**: use `AnimatePresence mode="wait"` with `key={stateValue}` around a `motion.span` wrapping the icon. Exit/enter with rotate + scale + opacity. `initial={false}` prevents the animation on first mount. `mode="wait"` ensures exit completes before enter starts — without it two icons overlap briefly
- **`layoutId` inside `position: fixed` containers**: avoid. Framer Motion calculates layout animation coordinates relative to the offset parent; inside a `fixed` container the coordinate system diverges from the viewport, producing incorrect transforms that can displace or hide the element. Use per-element `AnimatePresence` + individual `motion.div` instead

### Mobile Navigation Structure
- Bottom navigation (portrait mobile): 3 primary routes + "Altro" button (MoreHorizontal icon)
- "Altro" button shows active state (blue, `text-blue-600 bg-blue-50 dark:bg-blue-950/20`) when current route is any secondary route — same treatment as primary tabs
- **Sidebar active state — Overview exact match**: `Sidebar.tsx` `isActive` for `/dashboard` must use `pathname === item.href` only, never `startsWith`. `startsWith('/dashboard/')` matches every sub-route (`/dashboard/assets`, `/dashboard/history`, etc.) and keeps Panoramica highlighted on all pages. All other routes can use prefix matching safely
- `secondaryHrefs` array in `BottomNavigation.tsx` must stay in sync with `navigationGroups` hrefs in `SecondaryMenuDrawer.tsx`
- Secondary drawer uses 3 semantic groups: Analisi (Allocazione, Rendimenti, Storico, Hall of Fame), Pianificazione (FIRE e Simulazioni), Preferenze (Impostazioni)
- Eyebrow label style for group headers: `text-xs font-semibold uppercase tracking-wider text-muted-foreground/60`

### One-Time UI Effects
- Use `localStorage` helpers for once-ever UI (guide strips, celebrations)
- Use `sessionStorage` plus an internal `useRef` guard for once-per-session notifications
- localStorage key convention for guide strips: `{page}_guide_dismissed` (e.g. `perf_guide_dismissed`)
- Init localStorage reads inside `useEffect(() => {}, [])` — not during render — to avoid hydration mismatch on `'use client'` pages

### Progressive Disclosure on Data-Dense Pages
- Collapsible methodology/reference blocks: use `Collapsible` (shadcn, from `@/components/ui/collapsible`) with `open` state defaulting to `false`; wrap the trigger around `CardHeader` via `asChild` for a large click target
- `cn` is NOT auto-imported in page files — add `import { cn } from '@/lib/utils'` explicitly when using conditional class logic in pages (it is already available in all component files)
- Badge chips for complexity signals: `badge?: string` prop on `MetricCard` renders a `Badge variant="outline"` below the title; requires `CardHeader` to be `items-start` (not `items-center`) because the left column has variable height
- One-time guide strips: position them outside the `key={selectedPeriod}` (or equivalent period/tab reset div) so they don't replay their entrance animation on every period switch
- Dev/internal tool sections in settings pages: isolate with `border-t border-border pt-6` + a `text-xs uppercase tracking-widest` eyebrow label in a distinct color (e.g. orange for dev/danger zones); never co-locate dev tools in a functional product tab (dividendi, spese, etc.)

### Dialog Layout
- Prefer sticky header + sticky footer dialog layout for long forms
- Do not use `overflow-y-auto` on dialog bodies that contain absolute-positioned custom dropdowns

---

## Testing and Workflow

### Commands
- `npm test -- <file>` or `npx vitest run <file>` for targeted tests
- `npx tsc --noEmit` for repo-wide TypeScript checking without generating build output
- For private API auth regressions, run `npx vitest run __tests__/apiAuthRoutes.test.ts`

### Test Patterns
- Use local `new Date(year, monthIndex, day)` in tests, not ISO strings
- Use `toBeCloseTo()` for floats
- Use fake timers when testing helpers that depend on the current date
- Keep test fixtures aligned with current required types, especially `BudgetItem.order`
- For private route auth tests, prefer route-handler unit tests with mocked `adminAuth.verifyIdToken` and Admin SDK service calls over heavier browser/E2E coverage

---

## Common Errors to Avoid

### Timezone Boundary Bugs
- Symptom: entries appear in the wrong month near midnight
- Fix: group with Italy timezone helpers, never native `Date.getMonth()`

### Settings Persistence Bugs
- Symptom: toggles save but reset after reload
- Fix: update both `getSettings()` and both branches of `setSettings()`

### Admin SDK Auth Gaps
- Symptom: private API route accepts `userId`/resource IDs from the client and works without a verified Firebase ID token
- Fix: require server-side token verification plus `decodedToken.uid` matching or explicit resource ownership checks; Admin SDK bypasses Firestore rules

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

### useMediaQuery — Mobile Re-render Trap
- `useMediaQuery` initializes with the real `window.matchMedia(query).matches` value, not `false`
- The classic `useState(false)` SSR-safe pattern would cause an extra re-render on mobile (false → true) that competes with `requestAnimationFrame` animation loops at mount time
- Safe to read `window` directly because all callers are `'use client'` components rendered only after login
- **Only revert to `useState(false)` if adding a hook call to a public SSR page**

### Heavy Renders vs rAF Animations
- On mobile, CPU budget is ~3–5x tighter. Multiple concurrent tasks at mount (re-renders, Recharts SVG, Framer Motion stagger, rAF loops) can exceed the 16ms/frame budget and cause visible animation jank
- When a page uses `useCountUp` for mount-time KPI animations, avoid simultaneously rendering heavy components (Recharts charts, large lists) that aren't immediately visible
- Pattern: start collapsible/below-fold Recharts components as collapsed on mobile, let users expand — use `isMobile` from `useMediaQuery` in the `useState` initializer for the expanded state

### AnimatePresence + Next.js App Router Flash
- **Symptom:** Content flashes at full opacity for ~1 frame before entrance animations begin; only on navigation (not hard refresh); `style={{ opacity: 0 }}` on the `motion.div` does NOT fix it
- **Cause:** `layout.tsx` persists between navigations. `AnimatePresence mode="wait"` with `key={pathname}` is supposed to handle transitions, but Next.js wraps navigations in `startTransition` (React 18 concurrent). The variant context ("visible") from the completed previous animation can be inherited by the new child, causing Framer Motion to skip `initial="hidden"` and show content at opacity 1 immediately
- **Fix:** Use `template.tsx` — it re-mounts on every navigation, so Framer Motion always treats the mount as a true first mount. Remove `AnimatePresence` from `layout.tsx`. See `app/dashboard/template.tsx`

### next/font Preload
- `next/font` with default `preload: true` emits a `<link rel="preload">` on every page using the root layout
- If a font is only used on a few pages (e.g. `Geist_Mono` via `font-mono` on FIRE and Hall of Fame), add `preload: false` to suppress the browser warning: *"preloaded using link preload but not used within a few seconds"*
- Revert to default if the font is later added to layout-level or globally shared components
