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
- For state-preserving tab UIs, keep per-scope active tab state explicitly (e.g. separate sub-tab state for `Anno Corrente` and `Storico`) instead of sharing one global sub-tab value
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
- In Budget desktop flows, prefer rendering large local subtrees as pure render helpers or top-level components, not nested JSX component definitions inside the page component; otherwise simple row selection can remount the whole table and cause visible flashes

### Settings Synchronization
- Every new settings field must be handled in three places: type definition, `getSettings()`, `setSettings()`
- `setSettings()` has two write branches; update both

### Settings UX Layer (Overdrive)
- Unsaved preview in Settings is local-only: use a baseline snapshot key captured on load/save and compare against current state (`hasUnsaved*`) without introducing autosave behavior
- If you add a new Settings field that participates in unsaved preview, update both baseline and current snapshot builders; missing fields create false clean/dirty states
- For immediate control feedback in Settings forms, prefer one shared utility class for `Input`/`SelectTrigger`/`Switch` transitions and include `motion-reduce` fallback
- For nested allocation editors, prefer `CollapsibleContent` with short, sober transitions over custom animation stacks; keep expand/collapse readable under dense forms
- Sensitive Settings dialogs (move/delete) should open with trigger continuity via `transform-origin` from the clicked control, and clear custom origin on close

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
- FIRE calculator unsaved preview is local-only: metrics may react immediately to form edits, but milestone surfaces like the "FIRE raggiunto" banner should remain anchored to saved/loaded data until persistence completes

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
- Auth form shells: prefer a field wrapper with `focus-within` choreography (border + soft ring on the wrapper, not a louder input-level treatment) so label, input, and password toggle read as one control
- Password visibility toggles on auth forms should stay keyboard-focusable; keep the field shell active while focus moves between the input and the toggle inside the same container
- Auth submit feedback should be local and additive: keep existing toast behavior, and pair it with a short inline status line plus button label/icon state (`idle` / `submitting` / `success` / `error`) instead of introducing modal or page-level feedback
- Secondary rhythm on long pages: wrap secondary card clusters in `<div className="space-y-4">` nested inside the page's `space-y-6` container — the 16px vs 24px ratio visually subordinates the group without adding decoration. Use `border-t border-border/40 pt-4` (or `pt-6` when adding an eyebrow label) on a `motion.div` to signal a zone transition; the divider animates with the content automatically
- Section zone eyebrows (e.g. "Composizione"): `text-xs font-medium uppercase tracking-widest text-muted-foreground` — same pattern as page header eyebrows but inside a `pt-6 border-t border-border/40` wrapper to act as a section separator

### Motion and Charts
- Shared variants live in `lib/utils/motionVariants.ts`
- For long, data-dense pages like History, prefer chapter-level reveals (`chapterReveal`) over one global stagger; reveal only the main sections on first entry
- For dense tabbed data views, prefer short container transitions (`tabPanelSwitch`, `tableShellSettle`) and scoped refresh feedback on the active panel only; do not animate table geometry or whole row sets
- Hall of Fame pattern: drive monthly/yearly ranking surfaces from shared config objects so mobile cards, desktop tables, and current-period spotlights stay aligned without duplicating labels or section logic
- Hall of Fame spotlight pattern: the current month/year summary should show both ranking position and actual value; the summary must answer "where is the current period?" and "with what number?" at a glance
- Monte Carlo pattern: when re-running a simulation or switching scenario assumptions, keep the previous valid result shell mounted until the new computation completes; the update should read as a data morph, not an empty/reset state
- Monte Carlo build pattern: percentile bands and histogram bins may reveal sequentially on first result entry or scenario rerun, but keep the underlying Recharts decorative areas non-animated to avoid chaotic multi-layer motion
- Dividends page pattern: keep calendar, active date filter, stats, and table derived from the same source of truth; the calendar should reflect filter focus instead of running its own separate selection model
- For Nivo Sankey filter updates, keep the chart instance mounted and let the library animate data diffs; remounting via React `key` or keyed wrapper shells suppresses the native update animation
- Performance page pattern: derive `chartData`, heatmap data, and underwater data with `useMemo`; do not store them in local state via `useEffect + setState`
- Performance period morph: do not key KPI sections or metric cards by selected period; KPI values should settle from the previous rendered value (`useCountUp({ fromPrevious: true })`) while chart shells can re-key only when a first-class staged reveal is intentional
- Performance staged reveals should run on first mount or major period change only; manual refresh feedback must stay scoped to the page header or active chart shell instead of replaying the whole page
- History page pattern: for mode switches (`%`/`€`, annual/monthly, doubling mode), animate the local chart shell or summary row only; avoid remounting or replaying unrelated sections
- Goal-based investing pattern: drive summary cards, allocation chart, and detail cards from one shared focus state so the relationship between selected goal and resulting allocation stays explicit across the tab
- For contextual dividend details, prefer a read-only detail surface first and compute `transform-origin` from the clicked row/card; only transition into edit mode when the user explicitly asks to modify the record
- Hall of Fame notes pattern: note view/edit dialogs should open from the clicked ranking row/card or the "Aggiungi Nota" CTA via contextual `transform-origin`; the note trigger can be local to the page if the older shared cell component becomes too limiting
- Allocation mobile drill-down pattern: keep the sheet's native bottom-entry animation, but make the sheet body the only scrollable region and reset its scroll to top on each level/content change; this preserves orientation more reliably than custom container-entry choreography
- Allocation target markers inside progress bars should use a centered dot without a vertical stem; if bar height/border changes, recheck visual centering against the live track
- Do not wrap shadcn `TableRow` with `motion()`; use `motion.tr`
- Use `motion.create(Component)` — `motion(Component)` is deprecated in Framer Motion v11+ and logs a warning
- Page-level Framer Motion quality should be validated in production mode (`npm run build` + `npm run start`) before treating desktop smoothness as a regression; `next dev` can noticeably exaggerate count-up and layout-motion cost
- Recharts defaults:
  - `Bar` / `Pie`: `animationDuration={600}` + `animationEasing="ease-out"`
  - `Line` / `Area`: `animationDuration={800}` + `animationEasing="ease-out"`
  - `Pie` also needs `animationBegin={0}`
- Decorative stacked background areas should keep `isAnimationActive={false}`
- Overview/Panoramica pattern: keep hero KPI motion focused on the primary card, avoid replaying chart animations on every secondary refetch, and prefer one-time chart reveal flags for expensive Recharts mounts
- Dialog continuity pattern: for trigger-to-dialog continuity, forward the ref through `DialogContent` and compute a `transform-origin` from the triggering control; clear the custom origin on close so the exit animation stays neutral
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
- For compact explanatory help inside dense cards, prefer the local click-to-toggle pattern used in `components/performance/MetricCard.tsx` over generic Radix tooltip poppers when positioning must stay tightly anchored to the card header
- One-time guide strips: position them outside the `key={selectedPeriod}` (or equivalent period/tab reset div) so they don't replay their entrance animation on every period switch
- History chapter intro pattern: use a short editorial intro plus 2-3 sentence section headers to orient the user before dense chart clusters; keep these blocks informational, not decorative
- Dev/internal tool sections in settings pages: isolate with `border-t border-border pt-6` + a `text-xs uppercase tracking-widest` eyebrow label in a distinct color (e.g. orange for dev/danger zones); never co-locate dev tools in a functional product tab (dividendi, spese, etc.)
- For refresh affordances on dense historical tables, highlight only the active shell/header and timestamp the refresh there; avoid flashing rows or cells broadly

### Dialog Layout
- Prefer sticky header + sticky footer dialog layout for long forms
- Do not use `overflow-y-auto` on dialog bodies that contain absolute-positioned custom dropdowns

---

## Testing and Workflow

### Commands
- `npm test -- <file>` or `npx vitest run <file>` for targeted tests
- `npx tsc --noEmit` for repo-wide TypeScript checking without generating build output
- For auth UX-only changes, run `npx tsc --noEmit` and then manually validate keyboard tab flow, password toggle focus continuity, and inline submit feedback on both `/login` and `/register`
- For motion/perceived-performance changes, compare `npm run dev` against `npm run build && npm run start` before optimizing away production-safe motion
- For Hall of Fame UX/motion changes, run `npx tsc --noEmit` and then manually validate current-period spotlight cards, ranking highlight continuity, and note dialog trigger continuity on both desktop and mobile
- For FIRE / Monte Carlo / Goal-based investing UX or motion changes, run `npx tsc --noEmit` plus `npx vitest run __tests__/fireService.test.ts` and `npx vitest run __tests__/goalService.test.ts` before manual validation
- For Dividendi & Cedole UX/motion changes, run `npx tsc --noEmit` and then manually validate calendar focus, table/detail continuity, and tooltip anchoring in the cashflow dividends tab
- For Performance page UX/motion changes, run `npx tsc --noEmit` plus `npx vitest run __tests__/performanceService.test.ts` before manual validation
- For History page UX/motion changes, run `npx tsc --noEmit` plus `npx vitest run __tests__/chartService.test.ts` before manual validation
- For private API auth regressions, run `npx vitest run __tests__/apiAuthRoutes.test.ts`
- For Settings UX-only changes, run `npx tsc --noEmit` plus a targeted smoke/auth check (`npx vitest run __tests__/apiAuthRoutes.test.ts`) before manual UI validation

### Test Patterns
- Use local `new Date(year, monthIndex, day)` in tests, not ISO strings
- Use `toBeCloseTo()` for floats
- Use fake timers when testing helpers that depend on the current date
- Keep test fixtures aligned with current required types, especially `BudgetItem.order`
- For private route auth tests, prefer route-handler unit tests with mocked `adminAuth.verifyIdToken` and Admin SDK service calls over heavier browser/E2E coverage
- For Cashflow/Budget UX changes, run `npx tsc --noEmit` plus `npx vitest run __tests__/budgetUtils.test.ts` before manual validation

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

### Radix Tabs forceMount Layout Gap
- Symptom: switching a `TabsContent forceMount` view leaves blank vertical space even though the old panel looks hidden
- Fix: ensure inactive tab panels are explicitly removed from layout with `data-[state=inactive]:hidden` (see `components/ui/tabs.tsx`)

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

### Bottom Sheet Continuity Trap
- Symptom: mobile drill-down sheets open at the previous level's scroll offset or content appears to slide behind the sticky header
- Cause: the same scroll container is reused across levels, and sticky headers inside the scroll region let content pass underneath during transitions
- Fix: keep the header outside the scrolling region, make only the sheet body scrollable, and reset scroll on level/content key changes

### Custom Sheet Entry Overreach
- Symptom: a custom "open from tapped point" animation feels worse than the native sheet entry even when `transform-origin` is computed correctly
- Cause: shadcn/Radix bottom-sheet semantics and the built-in slide-from-bottom expectation on mobile can conflict with bespoke container-entry motion, especially when the content itself already animates
- Fix: prefer the standard bottom-entry sheet animation and reserve contextual continuity for the internal content/header behavior unless the full container transition is visually verified on device

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

### Nested Component Remount Trap
- Symptom: clicking a row or toggling local state causes an entire dense table below to flash or look recreated, even in production
- Cause: a large subtree renderer is defined inside the parent component and used as JSX (`<InnerComponent />`), so every parent re-render gives React a new component identity and remounts the subtree
- Fix: move the subtree to a top-level component or invoke it as a pure render helper (`InnerComponent()`) when it intentionally closes over local state

### AnimatePresence + Next.js App Router Flash
- **Symptom:** Content flashes at full opacity for ~1 frame before entrance animations begin; only on navigation (not hard refresh); `style={{ opacity: 0 }}` on the `motion.div` does NOT fix it
- **Cause:** `layout.tsx` persists between navigations. `AnimatePresence mode="wait"` with `key={pathname}` is supposed to handle transitions, but Next.js wraps navigations in `startTransition` (React 18 concurrent). The variant context ("visible") from the completed previous animation can be inherited by the new child, causing Framer Motion to skip `initial="hidden"` and show content at opacity 1 immediately
- **Fix:** Use `template.tsx` — it re-mounts on every navigation, so Framer Motion always treats the mount as a true first mount. Remove `AnimatePresence` from `layout.tsx`. See `app/dashboard/template.tsx`

### next/font Preload
- `next/font` with default `preload: true` emits a `<link rel="preload">` on every page using the root layout
- If a font is only used on a few pages (e.g. `Geist_Mono` via `font-mono` on FIRE and Hall of Fame), add `preload: false` to suppress the browser warning: *"preloaded using link preload but not used within a few seconds"*
- Revert to default if the font is later added to layout-level or globally shared components
