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
- **Multi-card grid breakpoint decision**: adding `sm:grid-cols-2` to a 3-item row leaves the third card alone on a half-width row at 640px — often worse than a full-width stack. Prefer no `sm:` breakpoint (full-width stack on mobile) → `desktop:grid-cols-3` directly. Reserve `sm:grid-cols-2` for content where 2 columns genuinely helps at 640px (e.g. Bear/Base/Bull scenario cards where any pairing is better than a single tall column).
- **`items-end` for mixed-height label rows**: only use `items-end` on a form grid when ALL cells have the same structure (label + input, nothing else). `items-end` aligns the bottom edge of the entire cell div — if any cell has hint text below its input, the hint becomes the new "bottom", so cells without hint text float their input down to match the hint height of the taller cell. In that case use `items-start` instead and shorten long labels so they don't cause height divergence. Rule: hint text in any cell → `items-start`; uniform label+input only → `items-end` is safe.
- **Nested Radix collapsible chevron rotation**: `CollapsibleTrigger asChild` propagates `data-state="open|closed"` to its child element. Add `group` to the child Button, then `group-data-[state=open]:rotate-180 transition-transform duration-200 motion-reduce:transition-none` to the `ChevronDown` inside. No extra React state needed. Works in Tailwind v4.
- **`layout` vs `layout="position"` when a Framer Motion parent wraps a Radix Collapsible**: Using bare `layout` on a `motion.div` that contains `CollapsibleContent` causes visible text stretch when collapsing. When `CollapsibleContent` changes height, Framer Motion intercepts the parent's size change and applies a scale transform to animate it — this scales all children including the trigger text. Fix: use `layout="position"` which only animates X/Y translation, not size changes. Applied in the cost-basis section of `app/dashboard/page.tsx`.
- **Chevron rotation for manual `useState` open/close** (no Radix `data-state`): pair the icon with `transition-transform duration-200 motion-reduce:transition-none ${open ? 'rotate-180' : ''}`. Always render the chevron on expandable rows — the click affordance is invisible without it. Applied in `ExposureSection` row drill-downs.

### shadcn Card Built-in Padding
- `Card` (new-york) has `py-6` built-in via its own className. When there is no `CardHeader`, `CardContent` is the first child — no manual `pt-6` is needed on `CardContent`. Add it only if you need extra top spacing beyond the Card's own `py-6`.
- `CardContent` adds `px-6` only (no vertical padding). The vertical rhythm comes entirely from the Card's `py-6` + the `gap-6` between children.
- **`CardHeader` applies `flex flex-col` — breaks inner flex-1 truncation**: shadcn's `CardHeader` renders as `flex flex-col`. If you place a `flex justify-between` row inside it, any `flex-1` grandchild acts on the vertical axis instead of horizontal — text `truncate` stops working and `shrink-0` siblings get pushed off-screen. Fix: replace `CardHeader` with a plain `<div className="px-4 py-3 flex items-start gap-2">` (or whatever padding you need) when you need a horizontal flex layout in a card header. This was the root cause of long asset names overflowing `AssetCard` and hiding the chevron. Applied in `components/assets/AssetCard.tsx`.

### Layout Tokens
- Never hardcode structural layout colors in shell components
- Use semantic tokens like `bg-background`, `text-foreground`, `border-border`
- Hardcoded green/red for gains and losses is allowed
- **Overview KPI value colors**: financial values in conditional sections (cost basis, TER, costs) on Panoramica must use design system tokens. Neutral values (Patrimonio Netto/Liquido Netto) → `text-foreground`. Cost/warning signals (Tasse Stimate, Costo Annuale Portfolio, TER) → `text-amber-600 dark:text-amber-400` (Amber Watch, `--chart-3`). `text-blue-600`, `text-purple-600`, `text-orange-600` are raw Tailwind defaults with no semantic meaning in this design system; `text-purple-600` is flagged by the `impeccable` detector as `ai-color-palette`.
- **Sidebar accent token semantics**: `--sidebar-accent` is the background for active/hover items. `--sidebar-accent-foreground` is for text that sits ON that background (designed to contrast with it). `--sidebar-primary` is for accent-colored elements on the plain sidebar background — do NOT use it for text on an accent-colored background. In cyberpunk/solar-dusk dark, `--sidebar-accent` is bright (L≈0.89 cyan), so only `--sidebar-accent-foreground` (dark) has sufficient contrast.
- **Inline `style` blocks Tailwind hover variants**: if a color or opacity is set via inline `style={{ color, opacity }}`, Tailwind hover/focus class variants (e.g. `hover:text-sidebar-accent-foreground`) cannot override it — inline styles always win. Migrate to Tailwind classes before adding any hover/focus variants. Applied in `BottomNavigation.tsx` (sessions sidebar-hover-theme-fix, bottom-nav-hover-theme-fix).

---

## Key Patterns

### React Query and Derived State
- Invalidate all related caches after mutations
- Never remove tabs from `mountedTabs`
- For state-preserving tab UIs, keep per-scope active tab state explicitly (e.g. separate sub-tab state for `Anno Corrente` and `Storico`) instead of sharing one global sub-tab value
- Use `useMemo` for derived state; do not use `useEffect + setState` for computed values
- When a private API returns date-like values for React Query consumers, normalize them at the hook boundary with `toDate()` instead of scattering conversions inside page components
- **Lazy-load gating for heavy panels**: for collapsible sections that hit an expensive endpoint (Yahoo Finance, scraping, etc.), gate the query with `enabled: !!userId && isOpen`. The fetch only fires on first expand; subsequent expands hit the React Query cache. Applied in `usePortfolioExposure` + `ExposureSection`.

### Dynamic Imports
- `next/dynamic` with named exports must unwrap via `.then(m => ({ default: m.Named }))`
- Use `ssr: false` for client-only dialogs and panels
- Pass the props type parameter to preserve type safety

### Dialog Form Reset Pattern
- Dialog `useEffect` that resets form state must include `open` in its dependency array — without it, reopening the dialog for a second creation (where the guarding prop, e.g. `asset`, stays `null` between opens) leaves the effect's deps unchanged and the effect never re-fires, so stale field values persist.
- Guard the top of the effect with `if (!open) return` — prevents a spurious reset when the dialog closes (open transitions `true → false`).
- The `else` (new-record) branch of the reset must enumerate **every** field including optional ones (e.g. `isin`, `bondCouponRate`, `bondCouponRateSchedule`, …). Omitting a field silently carries its value across opens; only the edit branch round-trips those fields from Firestore and catches the omission.
- Call `replaceTiers([])` (or equivalent `useFieldArray` reset) in the same branch — `reset()` does not clear field arrays.
- **`React.ElementType` for Lucide icons in data arrays**: when storing a Lucide icon component in a typed constant array (e.g. `TYPE_CARDS`), use `React.ElementType` as the field type — NOT `(p: { className?: string }) => JSX.Element` or `React.ReactElement`. Lucide exports `ForwardRefExoticComponent`, which is not assignable to a function-call signature but is assignable to `React.ElementType`. Requires `import React from 'react'`.
- **`useWatch()` for render, `getValues()` for handlers — never `watch()`**: React Hook Form's `watch()` is incompatible with the React Compiler; the compiler skips the entire component and logs "Compilation Skipped". Convention: use `useWatch({ control, name: 'field' })` at the top of the component for all reactive render-time reads (including values referenced in JSX and render IIFEs). Use `getValues('field')` inside event handlers (`onChange`, `onCheckedChange`, `useEffect`) for point-in-time reads. Never call `watch('field')` directly — remove `watch` from all `useForm` destructures. Applied in `AssetDialog.tsx`, `ExpenseDialog.tsx`, `CategoryManagementDialog.tsx`, `DividendDialog.tsx` (session refactor-usewatch-2026-05-17).
- **Submit button outside `<form>` via `form` attribute**: `<button type="submit" form="my-form-id">` connects a button to a form by ID without nesting. Critical when the form is inside a scrollable div and the footer button is a sibling outside that div — nesting would break the layout. The `<form>` tag just needs `id="my-form-id"`.

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
- **Cashflow settings fallback semantics**: `cashflowHistoryStartYear` may bootstrap from a hardcoded default, but that value is only a non-fatal fallback; preserve the saved settings value whenever `getSettings()` succeeds and log fallback activation explicitly.

### Settings UX Layer (Overdrive)
- Unsaved preview in Settings is local-only: use a baseline snapshot key captured on load/save and compare against current state (`hasUnsaved*`) without introducing autosave behavior
- If you add a new Settings field that participates in unsaved preview, update both baseline and current snapshot builders; missing fields create false clean/dirty states
- For immediate control feedback in Settings forms, prefer one shared utility class for `Input`/`SelectTrigger`/`Switch` transitions and include `motion-reduce` fallback
- For nested allocation editors, prefer `CollapsibleContent` with short, sober transitions over custom animation stacks; keep expand/collapse readable under dense forms
- Sensitive Settings dialogs (move/delete) should open with trigger continuity via `transform-origin` from the clicked control, and clear custom origin on close

### Assistant SSE Streaming State
- Never clear `streamingMessages` in a `useEffect([selectedThreadId])` — the SSE `meta` event sets `selectedThreadId` mid-stream, causing the effect to fire and wipe the buffer before text arrives
- Clear streaming state explicitly only on user-initiated thread switches (click handler), not reactively
- The `context` SSE event fires before text streaming begins; handle it separately from `text` events to populate the numeric panel without touching the message buffer
- When loading a thread, sync `mode` and `selectedMonth` to `thread.pinnedMonth`/`thread.mode` via a `useEffect([threadDetail])` guarded by `streamingMessages.length === 0`
- Track `streamingMessageId` (the ID of the assistant message slot currently receiving tokens) and pass it to the message renderer to switch between plain-text and ReactMarkdown — plain text during stream avoids re-parse layout jumps on every chunk; markdown renders on `done`
- Do NOT auto-select the most recent thread on first load — it causes a jarring double-load (skeleton → hero → immediate thread fetch). Show the hero state and let the user pick a thread. `hasAutoSelectedRef` has been removed.
- After "new thread" deselection, React Query keeps the previous thread's data in cache (query disabled but stale data present); guard `renderedMessages` with `!selectedThreadId` to return `[]` and show the hero immediately
- `handleStreamSubmit` accepts optional `promptOverride`/`modeOverride` so chip clicks can pass values synchronously — React state updates are async; relying on updated state after `setDraft`/`setMode` inside the same handler does not work
- Button `onClick` always passes the `MouseEvent` as the first argument; if the handler signature accepts an optional string (`promptOverride?`), wrap as `onClick={() => onSubmit()}` — never `onClick={onSubmit}` — or the event object is received as the prompt and `.trim()` throws
- **AbortController for SSE**: store `new AbortController()` in a ref (`abortControllerRef`) at submit time, pass `signal` via `authenticatedFetch` init. In the catch block, detect user-initiated stops with `(error as Error).name !== 'AbortError'` and skip `toast.error` — partial text stays visible, `isInterrupted` is set. Clear the ref in `finally`. The stop button must be a separate element that is always enabled during streaming (not conditionally disabled via `canSubmit`); swap the send icon for Square and use `variant="destructive"` to signal the destructive action.
- **React Query stale cache after new thread**: `handleStreamSubmit` captures `selectedThreadId` as a closure value at call time (e.g. `undefined` for a brand-new thread). The SSE `meta` event calls `setSelectedThreadId(newId)` (async React update) but the closure value doesn't change. Post-stream invalidation must use a local `resolvedThreadId` variable updated synchronously from the `meta` event — never `selectedThreadId` from the closure. Otherwise the new thread's React Query cache is never invalidated and shows stale data (missing the assistant message) until a hard refresh.
- Use `renderedMessages` (not `threadDetail?.messages`) as the base when building `streamingMessages` at submit time — React Query may not have reloaded the thread yet after the previous stream's cache invalidation, so `threadDetail` is stale and excludes the last exchange
- `scrollIntoView` must be gated on `renderedMessages.length > 0 && !(loadingThreadDetail && !isStreaming)` — without it, selecting a thread scrolls the page to the bottom before any messages arrive, leaving the user staring at empty space
- **`scrollIntoView` behavior during streaming must be `'instant'`, not `'smooth'`** — `smooth` schedules a CSS scroll animation on every SSE token, saturating the browser's animation thread and causing visible jank on slow devices. Reserve `{ behavior: 'smooth' }` for non-streaming events (initial thread load). Pattern: `if (isStreaming) el.scrollIntoView({ behavior: 'instant' }); else el.scrollIntoView({ behavior: 'smooth' })`

### Assistant Month Context Service
- `assistantMonthContextService.ts` runs server-side inside an API route — use `adminDb` (Firebase Admin SDK) directly, not `getUserSnapshots`/`getExpensesByDateRange`/`getSettings` (client SDK, requires browser auth session)
- Pattern: inline Admin SDK queries matching `dashboardOverviewService.ts`; mock `adminDb.collection` in tests, not the service functions
- The server never trusts client-supplied numbers: always rebuild the bundle from the period selector. For year_analysis/ytd/history the client only supplies the mode + year; the builder fetches everything from Firestore.
- `bySubCategoryAllocation` is built by fetching live `Asset` records (which have `subCategory`) and cross-referencing with `currentSnapshot.byAsset` (which has `assetId + value`). Slight historical inaccuracy is acceptable — subCategory changes are not tracked historically.
- All 5 builders (`buildAssistantMonthContext`, `buildAssistantYearContext`, `buildAssistantYtdContext`, `buildAssistantHistoryContext`, `buildAssistantQuarterContext`) return the same `AssistantMonthContextBundle` type; the `selector.month` encoding distinguishes period type downstream. For quarterly, `selector = { year, month: quarter * 3, quarter }` — e.g. Q1 → `{ year: 2026, month: 3, quarter: 1 }`. The `quarter` field is what distinguishes it from a regular March monthly.
- All 4 builders accept an optional `includeDummySnapshots = false` param that propagates to the 3 snapshot finder functions (`findSnapshot`, `findLatestSnapshotInYear`, `findLatestSnapshotAtOrBeforeYear`). Default is false — dummy snapshots are excluded for all real users.
- `includeDummySnapshots` flows differently between the two context endpoints: `stream/route.ts` receives it from `body.preferences` (client-sent); `context/route.ts` must re-read it from `getAssistantMemoryDocument()` because it is a GET request with no body.

### Assistant Prompt Builder (`formatBundleForPrompt`)
- Always include a full `--- ALLOCAZIONE CORRENTE (tutte le classi) ---` section built from `currentSnapshot.byAssetClass` before the top-5 movers section. Without it, Claude only sees the 5 largest monthly movers and labels stable asset classes (real estate, pension funds) as "unclassified" patrimony — producing hallucinated gap analysis.
- `allocationChanges` is already capped at 5 by the context builder; render it as a *separate* section labelled `--- VARIAZIONI ALLOCAZIONE MENSILI (top 5) ---` so the distinction between "current holdings" and "this month's movement" is explicit in the prompt.
- `currentSnapshot` was already present in `AssistantMonthContextBundle` but `formatBundleForPrompt` was destructuring only named fields — adding a new field to the prompt requires explicitly reading it from `bundle`, not from the destructured const.

### Assistant Thread Store
- `deleteAssistantThread` must delete the `messages` subcollection in batches (≤400 docs per batch) before deleting the parent document — Firestore Admin SDK does not cascade-delete subcollections automatically.
- Use `FieldValue.increment(1)` (from `firebase-admin/firestore`) inside `appendAssistantMessage` to atomically increment `messageCount` on the thread document without a separate read-modify-write cycle.
- `ThreadList` is defined as a module-level component (not nested inside the page component) and rendered both in the desktop right panel and in the mobile `Sheet` drawer — keeps selection, date formatting, and delete behaviour in one place. Never inline it as JSX inside the page or selection updates will remount the whole list.
- **Conversation history injection**: load `getAssistantThreadDetail` BEFORE `appendAssistantMessage` in `stream/route.ts` — so the new user message is not included in the history passed to Claude. Loading after would include the just-appended message and duplicate it in the Anthropic payload. Pass the result as `conversationHistory` to `streamAssistantResponse`.
- **Multi-turn messages array**: `buildMessagesArray()` in `anthropicStream.ts` prepends history before the current user turn. Filter to `role === 'user' | 'assistant'` only — Anthropic's messages array does not accept `role: 'system'`. Cap: chat → last 20 msgs (10 pairs); structured analysis → last 6 msgs (3 pairs) because those prompts already carry large context bundles.

### Assistant Memory Injection
- Saving items to `assistantMemory/{userId}` is not enough — Claude has no implicit access to Firestore. Items must be serialized into the prompt via `formatMemoryForPrompt()` in `prompts.ts`. A generic instruction like "you can reuse saved preferences" without the actual text is useless.
- Only `status === 'active'` items are injected. `completed` and `archived` items are explicitly excluded.
- Memory fetch in the stream route is wrapped in `.catch(() => null)` — memory failure must never block the chat stream.
- `extractAndSaveMemory` is fire-and-forget: call with `.catch(...)` after `appendAssistantMessage`, never `await` it inside the stream. Errors are logged server-side only.
- Memory extraction runs in **all modes**, not just chat. The only gate is `memoryEnabled` in `AssistantPreferences` — mode is irrelevant.
- The Anthropic client for memory extraction is instantiated lazily inside `extractAndSaveMemory` (dynamic import), not at module level — module-level `new Anthropic()` breaks test environments where `ANTHROPIC_API_KEY` is absent.
- `hasDummySnapshots` in `AssistantMemoryDocument` is a computed field injected **only** by `GET /api/ai/assistant/memory` via a parallel Firestore `limit(1)` query — never persisted to Firestore. All return sites in `store.ts` use `hasDummySnapshots: false` as a placeholder; the real value is overlaid by the route handler. Pattern for other computed UI flags: same approach — don't store them, compute at the read boundary.
- Goal lifecycle lives in the same memory document: `AssistantMemoryItem.status` now supports `active | completed | archived`, while pending completion proposals live in a separate `suggestions` array. Do not overload archived items to mean "goal reached".
- Goal-completion suggestions must come from authoritative portfolio data (`AssistantMonthContextBundle`), never from assistant prose or previously extracted memory facts. Semantic split: `liquidità` means cash only (`currentSnapshot.byAssetClass.cash`), while `patrimonio liquido` / `asset liquidi` use `currentSnapshot.liquidNetWorth`.
- Structured goal parsing is pattern-based and runs when a goal item is created or updated. If parsing semantics change later, existing saved goals keep their old `structuredGoal` shape until re-saved; during testing, do not mistake that for an evaluation bug.

### Assistant Chat Mode Unification
- Chat mode can receive numeric context from any period builder. The `chatContext` field in the stream request (`'none' | 'month' | 'year' | 'ytd' | 'history'`) selects the builder; `'none'` skips all context and sends Claude no portfolio data.
- `enableWebSearch` must be passed from `streamAssistantResponse` through `buildPrompt` → `buildChatPrompt` — without it, the chat prompt has no instruction to use web results for specific recent events even when the tool is active.
- **Web search policy for chat** (`webSearchPolicy.ts`): `return preferences.includeMacroContext || shouldUseWebSearch(prompt)`. Toggle ON → always enable in chat. Toggle OFF → keyword detection only (inflazione, tassi, BCE…). Structured analysis modes use only the toggle, not keyword detection.
- Chat max_tokens is 3000 normally, 5000 when web search is enabled — macro/geopolitical responses with web search are structurally longer and need headroom. Structured analysis max_tokens is 7000 (thinking budget 4000).
- The SSE `context` event (numeric panel) is sent for all analysis modes and for chat when a context bundle was built. Chat mode with `chatContext: 'none'` produces no panel.

### Assistant Context Panel Persistence
- The context bundle lives in React state, populated by the SSE `context` event during streaming. On reload or thread switch the panel is empty even if the thread has a pinned period.
- Pattern to repopulate: `GET /api/ai/assistant/context?userId=&mode=&year=&month=` rebuilds the bundle via the matching builder. Hook: `useAssistantPeriodContext(userId, mode, pinnedMonth, pinnedYear, currentYear, 0, enabled)` — calls all 4 specialized hooks always (React hook rules) but enables only the matching one.
- Enable the fetch only when `shouldFetchContext` is true: thread is loaded + has a pinned period for its mode + `streamingMessages.length === 0` + `contextBundle === null`. All conditions matter — without the `streamingMessages` guard the hook fires while SSE is delivering its own bundle.
- `selector.month` encoding convention: `>0` = monthly analysis, `0` = full-year (`pinnedYear`), `-1` = YTD, `-2` = total history. `AssistantContextCard.getPeriodLabel` handles all four cases inline (cannot import from `lib/server/assistant/prompts.ts` — server-only module).
- Never persist the bundle to the thread Firestore document. Rebuilding from source keeps the streaming and storage layers independent.
- The `AssistantContextCard` renders a skeleton (plain `animate-pulse` divs) when `isLoading` is passed. Pass `bundle={{} as AssistantMonthContextBundle} isLoading` — the prop is safe because `isLoading` short-circuits before any field access.

### Assistant Retry Pattern
- `handleRetry` must use a ref (`lastSentPromptRef`) to store the last successfully submitted prompt before `setDraft('')` clears it. Calling `handleStreamSubmit()` without an override after draft is cleared sends an empty string and exits silently — no error, no visible feedback.
- Update `lastSentPromptRef.current` only after `response.ok` — not on click — so a failed network request before the stream starts doesn't overwrite the ref with a prompt that was never sent.

### Assistant Thread List UX
- Thread dates: use `formatDistanceToNow` (date-fns, Italian locale) for dates within the past 7 days; fall back to `toLocaleDateString('it-IT', ...)` for older. Never relative-only.
- Mobile thread list: `Sheet` (`side="right"`) triggered from page header (`desktop:hidden`). Desktop right panel: `hidden desktop:block`. Same `ThreadList` component in both surfaces.
- Desktop right column: `sticky top-6` + `max-h-[calc(100vh-6rem)] overflow-y-auto`. Order: Threads → Context panel → Memory (collapsible). Preferences in header Popover.
- Mobile hero: chips first, then last 5 threads as "Riprendi conversazione" (`desktop:hidden`).
- **Do not use `DropdownMenu` for panels containing `Select` or `Switch`** — it closes on any click inside. Use `Popover` instead.
- **Mobile Sheet auto-close**: use controlled `open`/`onOpenChange` state; call `setIsThreadSheetOpen(false)` in the `onSelect` handler.
- **Inline destructive confirmation**: first click arms (`isPendingDelete` + 3s timeout ref); second confirms. Use `pendingDeleteId: string | undefined` for list-level state. Clear timer in all branches.

### Assistant Markdown Rendering
- Use `remark-gfm` with `ReactMarkdown` — without it markdown tables (`| col | col |`) render as raw pipe characters. `remark-gfm@4.0.1` is already installed.
- Override `table`/`thead`/`th`/`td`/`tr` components explicitly — Tailwind `prose` does not add cell borders or padding. `th` must include `text-left` because some browsers default table headers to `text-center`.
- **MARKDOWN_COMPONENTS must be defined at module level** (outside the render function), not inline in JSX. An inline `components={{ table: ..., th: ... }}` object creates a new reference on every render; ReactMarkdown treats it as changed and re-mounts even when message content hasn't changed. On long conversations with many completed messages this causes cascading re-renders. Pattern: `const MARKDOWN_COMPONENTS: React.ComponentProps<typeof ReactMarkdown>['components'] = { ... }` before the export.

### Assistant Rollout Flag
- `NEXT_PUBLIC_ASSISTANT_AI_ENABLED=false` → `notFound()` in `app/dashboard/assistant/page.tsx` + nav item filtered out of Sidebar, SecondaryMenuDrawer, and `secondaryHrefs` in BottomNavigation. Default is enabled when the variable is absent.
- The flag is inlined at build time (`NEXT_PUBLIC_`), so filtering the nav arrays at module level is safe and has zero runtime overhead.

### Private API Authorization
- Any App Router API route that uses Firebase Admin SDK must authenticate server-side; Firestore rules do not protect Admin SDK calls
- Private routes must verify the Firebase ID token and bind the request to `decodedToken.uid`, not just a client-supplied `userId`
- For record-level mutations on Admin SDK routes, enforce ownership after loading the document (e.g. `dividend.userId`, `asset.userId`)
- Client-side calls to private API routes should use `authenticatedFetch()` so `Authorization: Bearer <idToken>` is sent consistently
- For server-owned materialized documents such as `dashboardOverviewSummaries/{userId}`, client-side mutations must invalidate via a private authenticated API route; do not write these collections directly from the client SDK
- Scheduled server-to-server flows are the exception: cron routes authenticate with `CRON_SECRET`, and `/api/portfolio/snapshot` must continue to accept `cronSecret` for internal cron orchestration
- For user-owned conversational features (assistant threads, messages, memory), generate authoritative thread metadata server-side; do not let the client decide persisted titles or ownership-bound identifiers

### Demo Mode
- **`useDemoMode()` hook** (`lib/hooks/useDemoMode.ts`): compares `user.uid` against `NEXT_PUBLIC_DEMO_USER_ID`. Returns `false` if either is absent — safe on self-hosted deploys without a demo account.
- **Button disable pattern**: `disabled={isDemo || <other conditions>}` + `title={isDemo ? 'Non disponibile in modalità demo' : <other title or undefined>}`. When a button already has a `title`, merge into a single ternary to avoid duplicate JSX attributes (`TS17001`).
- **Header buttons outside conditional blocks**: if a page renders `{isDemo ? <LockScreen /> : <Content />}`, buttons in the `<header>` above that conditional are still rendered and must be disabled explicitly — they are NOT covered by the conditional.
- **Credentials in bundle**: `NEXT_PUBLIC_DEMO_EMAIL` / `NEXT_PUBLIC_DEMO_PASSWORD` are baked into the JS bundle at build time. Acceptable for a non-sensitive public demo. Leave vars empty to hide the CTA automatically (`DEMO_ENABLED = Boolean(DEMO_EMAIL && DEMO_PASSWORD)`).
- The demo user owns their own Firestore data — Firestore rules already protect other users. Client-side `disabled` is the only guard needed; no server-side role system is required.

### FX Conversion for Non-EUR Assets
- `Asset.currentPriceEur` stores the EUR-converted price, populated server-side during price updates (`priceUpdater.ts`) and at creation (`/api/prices/quote`). `calculateAssetValue()` uses it for non-EUR assets; falls back to `currentPrice` for EUR assets and pre-migration docs.
- **GBp (pence) ≠ GBP**: Yahoo Finance returns LSE prices in pence (`quote.currency === 'GBp'`). Normalize with `price / 100` and treat currency as `'GBP'` before any FX call. Failing to do this inflates values 100×. Applied in both `priceUpdater.ts` and `/api/prices/quote/route.ts`.
- **Never call Frankfurter from the browser**: client-side `fetch('https://api.frankfurter.app/...')` is silently blocked by Next.js security headers / network policy. All FX calls must be server-side. Pattern: extend the existing `/api/prices/quote` route to return `currentPriceEur` alongside `price` and `currency`; the client reads from the API response, never calls Frankfurter directly.
- `priceUpdater.ts` always overwrites the asset's `currency` field from `quote.currency` (after GBp normalization) — this self-corrects assets created with the wrong currency in the form.
- Cron (`monthly-snapshot` → `portfolio/snapshot` → `priceUpdater`) propagates the fix automatically to all users on each snapshot run.

### Asset Sparklines (Mobile)
- `AssetSparkline` component (`components/assets/AssetSparkline.tsx`) reuses the `NetWorthSparkline` pattern: Recharts `LineChart` + `<YAxis hide domain={['auto','auto']} />` + rAF defer (`requestAnimationFrame` before mount) + `useReducedMotion()`. Height 32px, no start/end labels.
- **`price` vs `totalValue` for fixed-price assets**: cash, real estate, private equity, and any asset with `autoUpdatePrice=false` have their unit price permanently fixed at €1. A sparkline on `price` would be a flat horizontal line. Use `entry.totalValue` from `MonthlySnapshot.byAsset` for these assets, `entry.price` for all others. Gate: `requiresManualPricing(asset)` in `AssetManagementTab.tsx` already encodes this logic — reuse it.
- Data field: name it `value` (not `price`) in the interface so the component is agnostic to the underlying source.
- Data is extracted from snapshots as `useMemo` in `AssetManagementTab`, keyed by `asset.id`, last 12 months, sorted chronologically. Passed as `sparklineData?` prop to `AssetCard`. Guard in `AssetCard`: only render when `sparklineData && sparklineData.length >= 2`.
- Render inside `<div className="desktop:hidden">` — sparklines are mobile-only; the desktop table already has the price column.

### Asset and FIRE Rules
- `quantity = 0` is valid and marks sold assets in history logic
- Cash asset balance lives in `quantity`, not via price updates
- Do not filter `cash` out of Patrimonio historical tables unless the product request is explicit; the default behavior keeps liquidity visible in both `Anno Corrente` and `Storico`
- Borsa Italiana bond prices are `% of par`; store converted EUR values
- **Patrimonio history tables** (Anno Corrente + Storico) show only assets with `includeInHistoryTables === true` (set via "Includi nelle tabelle storiche" toggle in AssetDialog). Anno Corrente additionally requires `quantity > 0`; Storico includes `quantity === 0` so sold assets show historical months with a "Venduto" badge. Assets deleted from Firestore entirely lose the flag and can't be recovered from snapshots.
- **`restrictToPassedAssets` pattern**: when you pre-filter the `assets` array before passing to `AssetPriceHistoryTable`, always set `restrictToPassedAssets={true}` or the transform's snapshot-scan step will silently re-add excluded assets as `isDeleted: true` ("Venduto"). The two arrays in the page (`historyTableAssets` for Anno Corrente, `historyTableAssetsAll` for Storico) both require this flag.
- FIRE annual expenses must use the last completed year
- `includePrimaryResidence` must flow through both React Query key and query function
- FIRE calculator unsaved preview is local-only: metrics may react immediately to form edits, but milestone surfaces like the "FIRE raggiunto" banner should remain anchored to saved/loaded data until persistence completes
- **Historical FIRE runway**: use rolling 12-month expenses, not a fixed annual denominator. The first runway point requires 12 snapshots; same-month YoY delta needs 24 snapshots; missing cashflow months inside the window count as `0`.
- If runway cards show values rounded to 1 decimal, compute summary deltas from the same rounded values. If the UI exposes both total and liquid runway cards, keep the deltas split too (`Totale` and `Liquido`).
- **Coast FIRE inputs**: current age comes from `settings.userAge`; retirement age is a separate persisted field (`coastFireRetirementAge`) with an initial fallback of `60`. If `userAge` is missing, keep the input blank and do not run the calculation.
- **Coast FIRE methodology**: use real annual expenses from the last completed year by default; override with `coastFireCustomExpenses` when the user wants to model different retirement spending. The effective value is resolved once as `effectiveAnnualExpenses` and used everywhere — calculations, display cards, and interpretation text. Scenario math reuses FIRE Bear/Base/Bull with `real return = growthRate - inflationRate`.
- **Coast FIRE state pensions**: pensions live only in the `Coast FIRE` tab, use `startDate` as the canonical retirement-start field, and keep `startAge` only as a legacy read fallback. Pension inputs are gross future nominal monthly amounts; the model annualizes them, deflates them to real terms, applies progressive IRPEF per pension, and reduces the portfolio need only from each pension's own start date onward.
- **Coast FIRE persistence gotcha**: nested pension rows must be serialized without `undefined` fields before writing settings to Firestore. Leaving legacy keys like `startAge: undefined` inside `coastFirePensions[]` can break persistence silently on refresh.
- **Coast FIRE outputs**: `Valore stimato a pensione` is only the future value of the current FIRE-eligible patrimonio without new contributions; `gap residuo` clamps at `0` once Coast FIRE is reached, while progress `%` may exceed `100`.
- **Coast FIRE pension UX**: summary-first layout; configuration collapsible (auto-open when empty/incomplete/unsaved); separate informational warnings (pension after target age, bridge years) from hard-stop errors (missing start date, zero amount). `buildPensionDraftIssues` is a pure function — pass `now: Date` explicitly.
- **Annual-need wording**: when UI copy appends `l'anno` to a formatted amount, prefer a dedicated helper such as `formatCurrencyPerYear()` instead of manual JSX concatenation. This avoids regressions like `€l'anno`.
- **`resolveBondPrice` centralizes % of par conversion**: `rawPrice * (nominalValue / 100)`, file-scope in `AssetDialog.tsx`. The `nominalValue <= 1` check is intentional — retail bonds with par=1 don't use the Borsa Italiana convention and passthrough unchanged. Both manual entry (Path 1) and auto-fetch (Path 2) call the same helper so the conversion can never diverge.

### Firestore Optional Field Deletion
- `updateDoc` only touches fields present in the update object — omitting a field leaves the old value intact in Firestore
- `removeUndefinedFields` (used before `updateDoc` in `assetService.ts`) strips `undefined` keys, so clearing an optional field by setting it to `undefined` is silently ignored
- **Pattern for `updateDoc`**: after `removeUndefinedFields`, explicitly translate `undefined` → `deleteField()` for fields the user can intentionally clear: `if (updates.field === undefined) cleaned.field = deleteField()`
- Applied in `updateAsset` for `averageCost` and `taxRate`. Follow this pattern for any other nullable asset/settings fields that users can toggle off
- **`deleteField()` is NOT allowed with `setDoc()` without `merge:true`** — calling it throws `FirebaseError: deleteField() cannot be used with set() unless you pass {merge:true}`. The settings save path in `assetAllocationService.ts` uses full `setDoc` (no merge), so omitting the field from `docData` is the correct deletion strategy: `delete docData.fieldName`. The full overwrite drops fields that are absent from the written object.

### Formatter Cache
- `lib/utils/formatters.ts` exports `cachedFormatCurrencyEUR(amount, compact?)` backed by two module-level `Intl.NumberFormat` instances
- Use `cachedFormatCurrencyEUR` in components that format inside animation loops (count-up rAF ticks, Recharts tooltips rendered at 60fps)
- `formatCurrency(amount, 'EUR')` also reuses the cached instance internally — the cache benefit is automatic for the common EUR path
- Add a new cached instance only for a genuinely distinct locale/format combination; do not cache per-call options objects
- `compact=true` → `_fmtEURCompact` (0 decimal places, `it-IT`, EUR) — use this for any assistant context panel value that previously used `new Intl.NumberFormat(..., { maximumFractionDigits: 0 })`

### Shared Constants
- Italian month names live in `lib/constants/months.ts` as `MONTH_NAMES` (`as const` array). Import from there — do not redeclare inline in assistant components

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
- When a component needs data from a variable number of sources (e.g. user toggles which of N benchmarks to show), declare N fixed hook instances (`b0`–`bN`) at component level with `enabled: false` for inactive ones — never loop over hooks. React enforces stable hook call counts and throws at runtime otherwise
- Applied in `BenchmarkComparisonSection`: 6 fixed `useBenchmarkReturns` hooks, one per benchmark constant
- **Adding a new benchmark**: (1) add entry to `BENCHMARKS[]` in `lib/constants/benchmarks.ts`, (2) add `const bN = useBenchmarkReturns(BENCHMARKS[N].id, ...)` in `BenchmarkComparisonSection.tsx`, (3) add `bN` to `hookResults` array and update `b*.data`/`b*.isError` dependency arrays in `benchmarkData`/`benchmarkErrors` memos

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
- For long, data-dense pages like History, prefer chapter-level reveals (`chapterReveal`) over one global stagger; reveal only the main sections on first entry
- For dense tabbed data views, prefer short container transitions (`tabPanelSwitch`, `tableShellSettle`) and scoped refresh feedback on the active panel only; do not animate table geometry or whole row sets
- Performance page pattern: derive `chartData`, heatmap data, and underwater data with `useMemo`; do not store them in local state via `useEffect + setState`
- Performance period morph: do not key KPI sections or metric cards by selected period; on period switches, values jump silently to the new number (no re-animation); chart shells can re-key only when a first-class staged reveal is intentional
- `useCountUp` on KPI cards: always use `once: true` so the count-up fires exactly once on first meaningful data arrival and does not re-trigger on React Query cache hits. `fromPrevious: true` alone (without `once`) causes a first-load flash — the 60ms `startDelay` window is cancelled and restarted on every value update before the animation can complete
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
- **Server-cached chart data**: `prepareAssetDistributionData` runs server-side; colors are baked into React Query cache. Remap colors at render time in the page component (`assetData.map((d, i) => ({ ...d, color: chartColors[i] ?? d.color }))`); do not invalidate the cache.
- **View Transition circle-reveal**: remove `disableTransitionOnChange` from `ThemeProvider` or the CSS animation is blocked. Set `--vt-cx`, `--vt-cy`, `--vt-r` inline before calling `document.startViewTransition(() => setTheme(next))`. TypeScript already knows `startViewTransition` — no `@ts-expect-error` needed.
- **Adding a new theme checklist**: (1) add CSS blocks `[data-theme="name"]` + `.dark[data-theme="name"]` in `globals.css`, (2) add `'name'` to `ColorTheme` union in `userPreferencesService.ts`, (3) add swatch object to the themes array in `settings/page.tsx`, (4) update grid cols if needed, (5) `npx tsc --noEmit`.
- **Dark theme chroma gotcha**: in oklch, chroma values below ~0.015 are invisible on dark backgrounds — all themes look identical gray. When adding or editing a `.dark[data-theme="..."]` block, verify `--card`, `--background`, and `--muted` have chroma ≥ 0.020. Themes sourced from tweakcn usually have adequate chroma; hand-edited or copy-pasted dark blocks often don't. Also verify the **hue** matches the theme personality — elegant-luxury had hue 56° (amber) instead of ~20° (burgundy) because it was copied from solar-dusk.

### Mobile Navigation Structure
- Bottom navigation (portrait mobile): 3 primary routes + "Altro" button (MoreHorizontal icon)
- **Bottom nav uses `--sidebar-*` CSS vars** for theme-aware colors — background `var(--sidebar)`, border `var(--sidebar-border)`, active tab `var(--sidebar-primary)` + `var(--sidebar-accent)` bg, inactive `var(--sidebar-foreground)` at opacity 0.65. Use `style={{ ... }}` inline because sidebar vars are not mapped to Tailwind utility classes.
- **Sidebar active state — Overview exact match**: `Sidebar.tsx` `isActive` for `/dashboard` must use `pathname === item.href` only, never `startsWith`. `startsWith('/dashboard/')` matches every sub-route (`/dashboard/assets`, `/dashboard/history`, etc.) and keeps Panoramica highlighted on all pages. All other routes can use prefix matching safely
- `secondaryHrefs` array in `BottomNavigation.tsx` must stay in sync with `navigationGroups` hrefs in `SecondaryMenuDrawer.tsx`
- Secondary drawer uses 3 semantic groups: Analisi (Allocazione, Rendimenti, Storico, Hall of Fame), Pianificazione (FIRE e Simulazioni), Preferenze (Impostazioni)
- `Assistente AI` belongs in the `Analisi` group and must be included anywhere secondary analytical routes are enumerated
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
- Applied in Allocazione (`AllocationCard` + page render functions) vs Patrimonio (`AssetCard` card grid). The distinction: allocation items are affordances, asset cards are information blocks.

### Mobile Tab Switcher: Segmented Pill vs Select
- **≤3 tabs → segmented pill control**, never a `Select` dropdown. `Select` is a form-input pattern (2 taps, hidden options, overlay); a segmented pill is a navigation affordance (1 tap, all options visible at a glance).
- **Pattern**: module-level `TABS` constant (stable reference for React Compiler), `role="tablist"` on the container div, `role="tab"` + `aria-selected={activeTab === value}` + `type="button"` on each button. Framer Motion `layoutId` spring pill (stiffness 400, damping 35) behind the active segment. Abbreviated labels (≤8 chars) to survive iPhone SE widths — icon + label always fits at `text-xs` in `flex-1 h-9` segments.
- **Anti-pattern: floating pill for page-local tabs**. The floating pill (bottom nav style) is reserved for global page navigation. Using it for within-page section switching creates a semantic mismatch — floating signals "always accessible regardless of scroll", which is inappropriate for local tabs. Keep page-local switchers inline and let them scroll away.
- **4+ tabs**: reconsider the pattern — horizontal scroll tab bar or a Select may be appropriate when 4+ labels can't fit equally. The ≤3 rule is strict.
- Applied in `app/dashboard/assets/page.tsx` (Gestione / Corrente / Storico).

### Mobile Header Trash Icon Pattern
- In a card header that has a title/subtitle block on the left and a destructive icon button on the right, always use `flex items-start justify-between` (not `flex-col` + `sm:flex-row`). `flex-col` puts the trash button on its own row on mobile, wasting vertical space and breaking visual grouping. The subtitle text stays under the title in the left block; the button stays top-right in all viewports.

### Resend Integration
- Use a **static import** (`import { Resend } from 'resend'`) not a dynamic one. `vi.mock` only intercepts static imports.
- `onboarding@resend.dev` delivers only to the Resend account owner's email. Custom domain required for arbitrary recipients.

### Periodic Email Service (`lib/server/monthlyEmailService.ts`)
- **Firestore query depth**: max 3 `.where()` calls per query — a 4th breaks test chain mocks. Filter post-fetch in code instead.
- **Expense field name**: `notes` (not `note`). Wrong field silently falls back to category name.
- **`buildPeriodEmailData`**: single builder for monthly/quarterly/yearly — one function, adjust date window and snapshot coords per type. Do not split into separate builders.
- **Settings 3-place rule**: email toggles must be added to `types/assets.ts`, `getSettings()`, AND both branches of `setSettings()`.
- **AI comment failure must never block email**: `generateEmailAiComment` returns `null` on any error — email sends without the AI section.
- **`simpleMarkdownToHtml` order**: strip `<details>/<summary>` first; process `**bold**` before `*italic*`; collapse blank lines between `<li>` items before `<ul>` wrap regex; use CSS `margin` on `<li>` for spacing, not `<br/>`.

### Firestore Query Chain Depth in Tests
- Keep Admin SDK query chains to **3 `.where()` calls max** when the function will be unit-tested. A 4th `.where()` (e.g. `isDummy != true`) causes `TypeError: .where(...).where(...).where(...).where is not a function` in tests because the mock chain only goes 3 levels deep.
- Workaround: apply the 4th condition as a post-fetch code filter (`docs.filter(d => !d.data().isDummy)`) — one extra doc fetched at most (with `.limit(1)` the cost is negligible).

### Server-Side Layer Separation (`lib/server/`)
- `lib/server/` hosts server-only modules that sit between API routes and services: use cases, processors, and Admin SDK repositories
- `lib/server/assetAdminRepository.ts` — canonical Admin SDK asset fetch (`getUserAssetsAdmin`). Import from here in all API routes that need server-side asset access; do not re-declare the function inline
- `lib/server/dividendUseCase.ts` — dividend creation orchestration (`createDividendWithOptionalExpense`). Contains coupon cleanup, costPerShare enrichment, and conditional expense creation. Route retains only auth, validation, asset fetch, and ownership check
- `lib/server/dividendProcessor.ts` — 3 cron phases (`runDividendScraping`, `runExpenseCreation`, `runNextCouponScheduling`) with explicit typed result interfaces. Cron route delegates to these; do not add phase logic back into the route handler
- Pattern rule: API route = auth → validate → fetch → ownership check → delegate to use case/processor → return response. No Firestore queries, business logic, or multi-step orchestration in the handler body itself

### Pure Functions and Testability
- If a utility function calls `new Date()` internally to get "now", it is impure and cannot be tested for time-sensitive branches without fake timers. Pass `now: Date` as an explicit parameter. The call site passes `new Date()` — the function stays pure and test code can inject any date. Applied to `buildPensionDraftIssues(drafts, currentAge, retirementAge, now)`.

### Collapsible Config Panel Auto-Open
- When a config panel uses a `useEffect` to auto-open based on a `shouldAutoOpen` condition, only ever call `setIsOpen(true)` — never `setIsOpen(shouldAutoOpen)`. Setting to `false` causes the panel to collapse silently after save (when `hasUnsavedChanges` turns false), which is disorienting if the user wants to continue editing.

### Progress Bar ARIA
- A visual progress bar (`<div>` animated with Framer Motion) has no semantic meaning to screen readers. Always add `role="progressbar"`, `aria-valuenow={Math.round(value)}`, `aria-valuemin={0}`, `aria-valuemax={100}`, and `aria-label` describing what is being measured.

### Accessibility Patterns
- **`aria-live` on streaming content**: any region that receives dynamically injected text (SSE streams, polling) must have `aria-live="polite"` and `aria-atomic="false"` on its container so screen readers announce content as it arrives. Use `aria-label` to give the region a name (e.g. `aria-label="Conversazione con l'assistente"`).
- **Action buttons hidden with `opacity-0` are inaccessible on both keyboard and touch**: `opacity-0 group-hover:opacity-100` makes controls unreachable from keyboard (focus lands on invisible buttons) and invisible on touch (no hover state). Fix: use `[@media(pointer:fine)]:opacity-0 [@media(pointer:fine)]:group-hover:opacity-100 [@media(pointer:fine)]:group-focus-within:opacity-100` — actions remain always visible on touch devices and become visible on keyboard focus. Tailwind v4 JIT supports arbitrary `@media` variants.
- **Tab pattern without ARIA**: `<button>` elements styled as tabs must have `role="tab"`, `aria-selected`, and a `role="tablist"` wrapper to be announced correctly by screen readers.
- **Touch targets**: minimum 44×44px per Apple HIG and Material Design. `h-6 w-6` (24px) icon-only buttons are below threshold — use at least `h-8 w-8` for action buttons in dense lists; `h-10 w-10` for primary CTAs and destructive icon buttons (trash, remove). Tab filters need at least `min-h-[36px]`. shadcn `size="icon"` defaults to 36px — always override with `className="h-10 w-10"` on touch-critical controls.
- **`type="button"` on `<button>` elements**: always set explicit `type="button"` on buttons that are not form submits to prevent accidental form submission in nested contexts.
- **`aria-label` on icon-only selects**: `SelectTrigger` without visible label text must have `aria-label` — screen readers will otherwise only announce the current value with no context about what is being selected.
- **`DialogDescription` is required in every `DialogContent`**: Radix logs "Missing `Description` or `aria-describedby={undefined}`" at runtime when `DialogContent` has no `DialogDescription`. Always import and add `DialogDescription` inside `DialogHeader`, below `DialogTitle`, with a one-line contextual description. In create/edit dialogs use a ternary to match the mode. Never suppress with `aria-describedby={undefined}` — that removes accessibility without silencing the root cause.

---

## Testing and Workflow
### Commands
- `npm test -- <file>` or `npx vitest run <file>` for targeted tests
- `npx tsc --noEmit` for repo-wide TypeScript checking without generating build output
- For Overview data-pipeline / materialized-summary changes, run `npx tsc --noEmit`, `npx vitest run __tests__/apiAuthRoutes.test.ts`, and `npx vitest run __tests__/dashboardOverviewService.test.ts`
- For Patrimonio historical-table baseline changes, run `npx tsc --noEmit` plus `npx vitest run __tests__/assetHistoryUtils.test.ts` before manual validation
- For auth UX-only changes, run `npx tsc --noEmit` and then manually validate keyboard tab flow, password toggle focus continuity, and inline submit feedback on both `/login` and `/register`
- For motion/perceived-performance changes, compare `npm run dev` against `npm run build && npm run start` before optimizing away production-safe motion
- For Hall of Fame UX/motion changes, run `npx tsc --noEmit` and then manually validate current-period spotlight cards, ranking highlight continuity, and note dialog trigger continuity on both desktop and mobile
- For FIRE / Monte Carlo / Goal-based investing UX or motion changes, run `npx tsc --noEmit` plus `npx vitest run __tests__/fireService.test.ts` and `npx vitest run __tests__/goalService.test.ts` before manual validation
- For FIRE runway / sensitivity matrix changes, manually validate all of: rolling-12M runway card values, total vs liquid deltas, tooltip copy, and desktop/mobile readability of the matrix
- For Dividendi & Cedole UX/motion changes, run `npx tsc --noEmit` and then manually validate calendar focus, table/detail continuity, and tooltip anchoring in the cashflow dividends tab
- For Performance page UX/motion changes, run `npx tsc --noEmit` plus `npx vitest run __tests__/performanceService.test.ts` before manual validation
- For History page UX/motion changes, run `npx tsc --noEmit` plus `npx vitest run __tests__/chartService.test.ts` before manual validation
- For Assistant AI foundation changes, run `npx tsc --noEmit` plus `npx vitest run __tests__/assistantRoutes.test.ts __tests__/assistantWebSearchPolicy.test.ts __tests__/assistantMonthContextService.test.ts` before manual validation
- For dividend route / cron handler changes, run `npx tsc --noEmit` plus `npx vitest run __tests__/dividendUseCase.test.ts __tests__/dividendProcessor.test.ts` before manual validation
- For monthly email changes, run `npx tsc --noEmit` plus `npx vitest run __tests__/monthlyEmailService.test.ts` before manual validation

### Test Patterns
- Use local `new Date(year, monthIndex, day)` in tests, not ISO strings
- Use `toBeCloseTo()` for floats
- Use fake timers when testing helpers that depend on the current date
- Keep test fixtures aligned with current required types, especially `BudgetItem.order`
- For private route auth tests, prefer route-handler unit tests with mocked `adminAuth.verifyIdToken` and Admin SDK service calls over heavier browser/E2E coverage
- For Cashflow/Budget UX changes, run `npx tsc --noEmit` plus `npx vitest run __tests__/budgetUtils.test.ts` before manual validation
- For asset creation / bond dialog changes, run `npx tsc --noEmit` plus `npx vitest run __tests__/assetDialogHelpers.test.ts __tests__/couponUtils.test.ts` before manual validation of the create-bond-with-ISIN flow
- For snapshot route changes, run `npx tsc --noEmit` plus `npx vitest run __tests__/snapshotHelpers.test.ts` before manual validation
- If a test imports a service that transitively pulls in `lib/firebase/config.ts`, mock `@/lib/firebase/config` at the test boundary; otherwise Firebase client init runs during import and fails on missing/invalid test env vars.
- Materialized-summary tests must keep `updatedAt`/`computedAt` inside the 5-minute TTL when the intent is to exercise the cached branch; older dates intentionally force live recompute and require fuller Admin SDK query mocks.
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

### Skeleton as Dead Code — Loading State Silent Failure
- Symptom: a skeleton component file exists and is well-implemented, but the page shows a blank flash (or nothing) during load.
- Cause: the skeleton was never imported or used in the page. `if (loading) return null` (or no loading guard at all) was left in place — the skeleton was effectively dead code.
- Fix: always verify the loading branch actively uses `<PageSkeleton />`. After creating or rewriting a skeleton, search for `return null` and `if (loading)` in the page file to confirm the skeleton is wired up. The TypeScript compiler does not catch an unused component.
- Applied in `app/dashboard/allocation/page.tsx`: `AllocationPageSkeleton` existed for months but was never imported.

### Recharts Legend and Tooltip Mismatch
- `Legend` reads `<Bar fill>`, not `<Cell>`
- Always set `fill` on `<Bar>` even when per-bar colors are overridden by `<Cell>`
- Do not set text `color` globally in tooltip style for line/area/bar charts
- **Tooltip label invisible in dark mode**: the native Recharts tooltip always uses a white background. If `labelStyle` has no `color`, the label inherits the page's CSS color (light in dark mode) and becomes invisible. Always set `labelStyle={{ fontWeight: 600, color: '#111827' }}`. Same issue applies to `contentStyle` text.
- **BarChart hover cursor overlay**: the default cursor is an opaque light rectangle — too visible in dark mode. Set `cursor={{ fill: 'rgba(128, 128, 128, 0.1)' }}` on `<Tooltip>` for a subtle semi-transparent overlay that works in both modes.

### Cashflow Null State vs Genuine Zero
- Symptom: user sees `€0,00` when no expense data has been entered yet; indistinguishable from a month with zero real spend
- Fix: branch on `expenseStats === null` (data absent) vs `expenseStats` truthy (data present, value may legitimately be zero). For the null case, render an icon + message empty state (e.g. `<Receipt>` + "Nessuna spesa registrata questo mese") instead of a formatted zero. `€0,00` is reserved for confirmed real zero — absence is not zero.

### Recharts Sparkline — flat line when values are large absolute numbers
- Symptom: a sparkline for net worth (e.g. 260k → 284k, +8% growth) renders as a completely flat horizontal line.
- Cause: Recharts' default Y-axis domain starts from `0`. Relative to a 0–284k scale, an 8% variation is imperceptible.
- Fix: add `<YAxis hide domain={['auto', 'auto']} />` — the `hide` prop removes visual rendering while `domain={['auto', 'auto']}` scales the Y range to the data min/max. Applied in `components/dashboard/NetWorthSparkline.tsx`.

### Recharts ResponsiveContainer -1 Warning
- Symptom: `The width(-1) and height(-1) of chart should be greater than 0` (fires twice) when a chart appears after an async state change (e.g. after a fetch completes and `loading` flips to `false`).
- Cause: React mounts the chart section in one render cycle; `ResizeObserver` fires immediately before the browser completes layout, measuring `-1`.
- Fix: defer mount with `requestAnimationFrame`. Pattern:
  ```tsx
  const [chartReady, setChartReady] = useState(false);
  const rafRef = useRef<number | null>(null);
  useEffect(() => {
    if (loading) return;
    rafRef.current = requestAnimationFrame(() => setChartReady(true));
    return () => { if (rafRef.current !== null) cancelAnimationFrame(rafRef.current); };
  }, [loading]);
  // In JSX: {chartReady && <ResponsiveContainer ...>}
  ```
- `minWidth={0}` alone is not sufficient — it only prevents negative width assertions, not the timing issue.

### Radix CollapsibleTrigger Nested Button
- Symptom: `<button> cannot be a descendant of <button>` hydration error in console
- Cause: `CollapsibleTrigger asChild={false}` (the Radix default) renders its own `<button>` element. If the trigger's children contain any `Button` component (another `<button>`), this creates an invalid nested-button DOM tree.
- Fix: always use `asChild` on `CollapsibleTrigger` so it clones the first child element (typically a `div` or `CardHeader`) as the interactive trigger instead of generating its own `<button>`. The child must be a single non-button React element. `disabled` and other props still work correctly via prop merging.
- Applied in `AssistantMemoryPanel` — the `CardHeader` (div) becomes the trigger, keeping the inner `Button` (trash icon) at a safe nesting level.

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
- Tab count depends on async settings: init `useState<boolean | null>(null)`. While `null`, render `<div className="hidden desktop:block h-10 animate-pulse rounded-md bg-muted" />` to hold the space. Mount real `TabsList` only after settings arrive — avoids a 5→6 column reflow flash.




