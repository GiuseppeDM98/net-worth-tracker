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

### Layout Tokens
- Never hardcode structural layout colors in shell components
- Use semantic tokens like `bg-background`, `text-foreground`, `border-border`
- Hardcoded green/red for gains and losses is allowed
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

### Settings Synchronization
- Every new settings field must be handled in three places: type definition, `getSettings()`, `setSettings()`
- `setSettings()` has two write branches; update both
- Assistant preference fields mirrored into settings must stay aligned with the assistant memory document and `AssetAllocationSettings`
- **Feature toggle placement**: all feature toggles (`costCentersEnabled`, `goalBasedInvestingEnabled`, `stampDutyEnabled`, etc.) live in `AssetAllocationSettings` (`types/assets.ts` + `assetAllocationService.ts`). Do NOT add them to `UserPreferences` / `userPreferencesService.ts`. The 3-place rule applies here too.

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
- All 4 builders (`buildAssistantMonthContext`, `buildAssistantYearContext`, `buildAssistantYtdContext`, `buildAssistantHistoryContext`) return the same `AssistantMonthContextBundle` type; the `selector.month` encoding distinguishes period type downstream.
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
- Chat max_tokens is 1500 normally, 2500 when web search is enabled — macro/geopolitical responses with web search are structurally longer and truncate at 1500.
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
- Thread dates: use `formatDistanceToNow` (date-fns, Italian locale) for dates within the past 7 days; fall back to `toLocaleDateString('it-IT', {day:'2-digit', month:'2-digit', year:'numeric'})` for older dates. Never use relative-only formatting — absolute dates are more useful for threads weeks old.
- Mobile thread list: use a `Sheet` (`side="right"`) triggered by a button in the page header (hidden on `desktop:` via `desktop:hidden`). The desktop right panel card uses `hidden desktop:block`. This ensures the same `ThreadList` component is used in both surfaces without duplicating the item render logic.
- Desktop right column order: Threads → Context panel → Memory (collapsible). Preferences moved to a header popover (Settings2 icon). Threads first so the user can pick a conversation immediately without scrolling.
- Desktop right column is `sticky top-6` with `max-h-[calc(100vh-6rem)] overflow-y-auto` so panels remain visible while the conversation scrolls. `overflow-y-auto` on the column itself (not a wrapper) lets the sidebar scroll internally if memory list is very long.
- Mobile hero shows chips first, then last 5 threads below as "Riprendi conversazione" (`desktop:hidden`) — chips must be above the fold on mobile. Capped at 5 to avoid overwhelming the hero.
- **Do not use `DropdownMenu` for panels that contain `Select` or `Switch`** — `DropdownMenu` closes on any click inside, including opening a Select dropdown or toggling a Switch. Use `Popover` (`@radix-ui/react-popover`, `components/ui/popover.tsx`) for self-contained settings panels.
- `AssistantMemoryPanel` accepts optional `isOpen`/`onToggle` props for controlled collapsible mode. When provided, the `CardHeader` becomes the `CollapsibleTrigger` and a `ChevronDown` chevron appears. Without these props the panel is static (backwards compatible). Buttons inside the header that must not toggle the collapsible need `e.stopPropagation()`.
- **Thread list action button layout**: do NOT use `absolute` positioning for the delete/action button in thread list cards when a Badge is already in the top-right corner — they will overlap. Use a `flex shrink-0` sibling div at the right edge of the card row instead. The select button takes `flex-1 min-w-0`; the action column has its own padding.
- **Mobile Sheet auto-close after thread selection**: the mobile "Conversazioni" Sheet must use controlled state (`open`/`onOpenChange`) so it can be closed programmatically when the user selects a thread. Without this, the drawer stays open after selection and the user must manually dismiss it. Pattern: add `isThreadSheetOpen` state, pass `open={isThreadSheetOpen} onOpenChange={setIsThreadSheetOpen}`, call `setIsThreadSheetOpen(false)` inside the `onSelect` handler.
- **Mobile memory Sheet**: hide `AssistantMemoryPanel` from the right-column scroll flow on mobile by wrapping it in `hidden desktop:block`. Expose it via a Brain icon button (`desktop:hidden`) in the page header that opens a Sheet. The panel's `isOpen`/`onToggle` props are omitted inside the Sheet (no collapsible needed when the Sheet itself is the container).
- **Mobile context pill**: `AssistantContextPill` (exported from `AssistantContextCard.tsx`) renders a single-line `period · +€X (+Y%)` strip inside the conversation header, shown only on mobile via `desktop:hidden`. Full `AssistantContextCard` stays in the right column but is wrapped in `hidden desktop:block`. Avoids hiding key financial numbers below the fold on mobile.
- **Mobile header button layout**: use `flex-col gap-2 desktop:flex-row` on the outer wrapper and split buttons into two `flex` rows on mobile. Text buttons get `flex-1` so they span available width; icon-only buttons (`size="icon"`) are `shrink-0`. On desktop everything becomes one inline flex row via `desktop:flex-none` on the text buttons.
- **Breakpoint-conditional controls (Select vs chips)**: for controls where a dropdown is fine on desktop but awkward on mobile, render two versions — chips with `desktop:hidden` for mobile, Select with `hidden desktop:flex` for desktop. Share state; only the presentation differs. Keep both in the same component so they stay synchronized. Applied in `AssistantComposer` for mode and chat context type.
- **Inline destructive confirmation pattern** (both `AssistantMemoryItemRow` and `ThreadList`): first click "arms" — sets `isPendingDelete` state + starts a 3s `setTimeout` auto-disarm stored in a ref. Second click confirms and calls the delete handler. X button or timeout disarms. Use `pendingDeleteId: string | undefined` (not boolean) when multiple items share the same list component, so one state variable handles the whole list. Clear the timer in all branches (confirm, disarm, and on component cleanup if needed).

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

### FX Conversion for Non-EUR Assets
- `Asset.currentPriceEur` stores the EUR-converted price, populated server-side during price updates (`priceUpdater.ts`) and at creation (`/api/prices/quote`). `calculateAssetValue()` uses it for non-EUR assets; falls back to `currentPrice` for EUR assets and pre-migration docs.
- **GBp (pence) ≠ GBP**: Yahoo Finance returns LSE prices in pence (`quote.currency === 'GBp'`). Normalize with `price / 100` and treat currency as `'GBP'` before any FX call. Failing to do this inflates values 100×. Applied in both `priceUpdater.ts` and `/api/prices/quote/route.ts`.
- **Never call Frankfurter from the browser**: client-side `fetch('https://api.frankfurter.app/...')` is silently blocked by Next.js security headers / network policy. All FX calls must be server-side. Pattern: extend the existing `/api/prices/quote` route to return `currentPriceEur` alongside `price` and `currency`; the client reads from the API response, never calls Frankfurter directly.
- `priceUpdater.ts` always overwrites the asset's `currency` field from `quote.currency` (after GBp normalization) — this self-corrects assets created with the wrong currency in the form.
- Cron (`monthly-snapshot` → `portfolio/snapshot` → `priceUpdater`) propagates the fix automatically to all users on each snapshot run.

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
- **Coast FIRE UX copy**: when pensions start after the target age or multiple pensions start at different dates, add contextual explanatory text in-page. Treat delayed pension starts as informational, not invalid — users need a dynamic explanation of bridge years, target-age coverage, and post-pension steady state.
- **Coast FIRE pension hierarchy**: inside `Coast FIRE`, the `pensione statale` surface should be summary-first, not form-first. Keep a compact summary visible, place `Configurazione Coast FIRE` immediately after it, and make the editor collapsible with auto-open on empty / incomplete / unsaved states.
- **Coast FIRE multi-pension density**: optimize the editor for 1-2 pensions; for 3+ pensions switch to a denser presentation and keep explanatory detail progressive instead of always expanded.
- **Coast FIRE warning policy**: separate `avvisi informativi` (e.g. pensione dopo la target age, bridge years) from truly incomplete data (missing start date, zero amount, invalid mensilita). Hard-stop only on missing core prerequisites (`userAge`, target age, annual expenses, positive FIRE patrimonio).
- **Annual-need wording**: when UI copy appends `l'anno` to a formatted amount, prefer a dedicated helper such as `formatCurrencyPerYear()` instead of manual JSX concatenation. This avoids regressions like `€l'anno`.

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
- Pattern: before duplicating a primitive array in a second file, check `lib/constants/` first

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

### Dashboard Data Isolation
- Do not add `useAllExpenses` or other full-history queries to Overview/Dashboard
- Full-history expense analysis belongs in History or Cashflow
- Overview/Panoramica data pipeline should flow through the private `GET /api/dashboard/overview` route and `useDashboardOverview()`; do not reintroduce page-level fan-out queries for assets, snapshots, expense stats, or settings
- `DashboardOverviewPayload` should stay lean: only KPI, variations, expense stats, chart datasets, flags, and freshness fields actually rendered by Panoramica belong there
- `dashboardOverviewSummaries/{userId}` is a server-owned materialized summary for warm loads; the client must never read it directly, only the authenticated overview route may do that
- Overview materialized summaries must have explicit invalidation on overview-relevant mutations plus a short TTL fallback, so stale docs never become a silent source of truth

### Loading and Skeletons
- Skeletons should mirror the final layout
- Reuse the same skeleton across chained loading states
- Use full-page skeletons only on truly slow pages; otherwise prefer delayed or null loading
- `Loader2` is for initial loading; `RefreshCw` is for user-triggered refresh; `RotateCcw` is for retry/regenerate actions — keep these semantics consistent across the app
- **Unsaved-state banners**: use `Info` icon (static) when the form has unsaved local changes but no async operation is in progress. Switch to `Loader2 animate-spin` only while the save mutation is actually pending. Do not dim `Loader2` with `opacity-60` as a substitute for a semantically different icon — it reads as a stuck spinner.

### Error State Levels
- **Query-level (blocking)**: use `Alert variant="destructive"` with `AlertCircle` icon — these represent a failure to load the page's primary data and need visible presence
- **Mutation (transient)**: use `toast.error()` — the user's action failed but the page is still usable; a toast is enough
- **Never** render a bare `<p class="text-destructive text-xs">` for errors the user must act on — it is invisible at small sizes and especially on dark backgrounds

### Empty State Layering
- **One CTA surface per screen context** — do not show a hero empty state AND a secondary empty state for the same surface at the same time; they compete and confuse
- Pattern: if a page-level chips/hero card is already the primary CTA, the conversation/content area inside it must stay silent (no nested `EmptyState`) until the user has selected a specific item to view
- Reserve the nested empty state for the case where a specific item IS selected but has no content (e.g. thread selected but messages array is empty)

### Visual Hierarchy Patterns
- Hero KPI: use `border-l-4 border-l-primary` + `text-3xl desktop:text-4xl tabular-nums` on the single most important card per page (e.g. Patrimonio Totale Lordo on Dashboard, first chart on History)
- Primary MetricCards (`isPrimary`): value renders at `text-3xl`; secondary cards at `text-2xl`. Use `isPrimary` sparingly — max 2 per MetricSection cluster
- Section headers in `MetricSection`: left-border accent (`w-[3px] bg-primary opacity-70`) replaces emoji prefixes. Do not use emoji in section titles
- Page header zone: eyebrow label (`text-xs uppercase tracking-widest text-muted-foreground`) above the `h1` + `border-b border-border` below the full header row separates editorial zone from data grid
- Action hierarchy: one `variant="default"` CTA per page; utility actions (refresh, CSV export, insert snapshot) use `variant="ghost"` or `variant="outline" size="sm"`
- **Sticky input panel elevation**: a composer or input bar that sticks to the bottom of a scrollable area should use an upward shadow to signal it "floats" above the content. Use `shadow-[0_-4px_16px_-2px_rgba(0,0,0,0.06)] dark:shadow-[0_-4px_16px_-2px_rgba(0,0,0,0.3)]` — hardcoded `rgba` because Tailwind v4 has no semantic upward-shadow token. Dark opacity is 5× higher because dark surfaces absorb shadow contrast. Without this the composer reads as "more card" instead of "distinct input plane".
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
- For Nivo Sankey filter updates, keep the chart instance mounted and let the library animate data diffs; remounting via React `key` or keyed wrapper shells suppresses the native update animation. In drill-down back-navigation, restore the immediate parent level first (`categoria` before root, `tipo` before root) instead of jumping straight to the top-level view.
- **Recharts legend overlap on orientation change**: if a `<Legend />` is conditionally hidden (`display:none`) on mount (e.g. `isMobile=true` in portrait) and then revealed after orientation flip (`isMobile=false` in landscape), Recharts' SVG layout is stale — the legend overlaps the X-axis. Fix: add `key={isLandscape ? 'landscape' : 'portrait'}` to the `ResponsiveContainer`. The key change forces a full remount and fresh measurement. Only needed on charts that toggle legend visibility based on `isMobile`; charts with a static legend are unaffected. Applied to `chart-asset-class-evolution` and `chart-liquidity` in `app/dashboard/history/page.tsx`.
- Performance page pattern: derive `chartData`, heatmap data, and underwater data with `useMemo`; do not store them in local state via `useEffect + setState`
- Performance period morph: do not key KPI sections or metric cards by selected period; on period switches, values jump silently to the new number (no re-animation); chart shells can re-key only when a first-class staged reveal is intentional
- `useCountUp` on KPI cards: always use `once: true` so the count-up fires exactly once on first meaningful data arrival and does not re-trigger on React Query cache hits. `fromPrevious: true` alone (without `once`) causes a first-load flash — the 60ms `startDelay` window is cancelled and restarted on every value update before the animation can complete
- Performance staged reveals should run on first mount or major period change only; manual refresh feedback must stay scoped to the page header or active chart shell instead of replaying the whole page
- Assistant SSE pattern: keep Anthropic orchestration server-side, stream `data: {JSON}\n\n` events with typed envelopes (`meta`, `text`, `status`, `done`, `error`), and let the client progressively append chunks without owning persistence decisions
- History page pattern: for mode switches (`%`/`€`, annual/monthly, doubling mode), animate the local chart shell or summary row only; avoid remounting or replaying unrelated sections
- Goal-based investing pattern: drive summary cards, allocation chart, and detail cards from one shared focus state so the relationship between selected goal and resulting allocation stays explicit across the tab
- For contextual dividend details, prefer a read-only detail surface first and compute `transform-origin` from the clicked row/card; only transition into edit mode when the user explicitly asks to modify the record
- Hall of Fame notes pattern: note view/edit dialogs should open from the clicked ranking row/card or the "Aggiungi Nota" CTA via contextual `transform-origin`; the note trigger can be local to the page if the older shared cell component becomes too limiting
- Allocation mobile drill-down pattern: keep the sheet's native bottom-entry animation, but make the sheet body the only scrollable region and reset its scroll to top on each level/content change; this preserves orientation more reliably than custom container-entry choreography
- Allocation target markers inside progress bars should use a centered dot without a vertical stem; if bar height/border changes, recheck visual centering against the live track
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
- Overview/Panoramica pattern: count-up lives in `OverviewAnimatedCurrency` leaf nodes, NOT in the page component — each rAF tick re-renders only that leaf, leaving the chart subtree and all other cards untouched. The page passes final computed values as stable props; display timing is entirely the leaf's concern.
- Overview/Panoramica chart scheduling: `OverviewChartsSection` is wrapped with `React.memo` and receives `heroSettled: boolean` from the page. When `heroSettled` becomes true, it schedules chart SVG mount via `requestIdleCallback` (with `{ timeout: 800 }`) or `setTimeout(0)` as fallback — never a fixed arbitrary timeout as the primary strategy. On mobile and reduced-motion, `chartRenderReady` starts true immediately.
- `OverviewAnimatedCurrency` format prop: use `format="integer"` for count-based KPIs (e.g. asset count) to avoid fractional display during rAF interpolation. Default is `"currency"` via `cachedFormatCurrencyEUR`. Add new format values here only if a genuinely distinct format is needed — do not extract a separate component per format.
- **Page transitions: use `template.tsx`, NOT `layout.tsx` + `AnimatePresence`**. Next.js App Router wraps navigations in `startTransition` (React 18 concurrent); `AnimatePresence` can inherit the previous variant context ("visible") and skip `initial="hidden"` on the new child, causing a 1-frame flash of fully-visible content. `template.tsx` re-mounts on every navigation, guaranteeing Framer Motion treats each mount as a true first mount. Trade-off: no exit animation (old page unmounts immediately). See `app/dashboard/template.tsx`
- Page-level `motion.div variants={pageVariants}` wrappers on individual pages are **redundant** when `template.tsx` is in place — remove them to avoid compounded opacity (opacity `t²` instead of `t`)
- **`prefers-reduced-motion`**: add `<MotionConfig reducedMotion="user">` at the layout root (`app/dashboard/layout.tsx`) — propagates to the entire tree, no per-component guards needed

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

### Mobile Header Trash Icon Pattern
- In a card header that has a title/subtitle block on the left and a destructive icon button on the right, always use `flex items-start justify-between` (not `flex-col` + `sm:flex-row`). `flex-col` puts the trash button on its own row on mobile, wasting vertical space and breaking visual grouping. The subtitle text stays under the title in the left block; the button stays top-right in all viewports.

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
- For private API auth regressions, run `npx vitest run __tests__/apiAuthRoutes.test.ts`
- For Assistant AI foundation changes, run `npx tsc --noEmit` plus `npx vitest run __tests__/assistantRoutes.test.ts __tests__/assistantWebSearchPolicy.test.ts __tests__/assistantMonthContextService.test.ts` before manual validation
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
- **Tooltip label invisible in dark mode**: the native Recharts tooltip always uses a white background. If `labelStyle` has no `color`, the label inherits the page's CSS color (light in dark mode) and becomes invisible. Always set `labelStyle={{ fontWeight: 600, color: '#111827' }}`. Same issue applies to `contentStyle` text.
- **BarChart hover cursor overlay**: the default cursor is an opaque light rectangle — too visible in dark mode. Set `cursor={{ fill: 'rgba(128, 128, 128, 0.1)' }}` on `<Tooltip>` for a subtle semi-transparent overlay that works in both modes.

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

### createExpense Field Enumeration Trap
- `createExpense` in `expenseService.ts` explicitly enumerates every field in `removeUndefinedFields({...})` before `addDoc`. `updateExpense` spreads `...updates`, so new fields work automatically there.
- **Symptom**: a new field saved correctly on edit but silently missing on create.
- **Fix**: whenever you add a field to `ExpenseFormData`, also add it to the `cleanedData` object in ALL three creation paths: single expense, recurring expenses (the batch loop), and installment expenses (the batch loop). Search for `linkedCashAssetId: expenseData.linkedCashAssetId` — all three occurrences need the new field right next to it.

### Async Tab Count: boolean | null Pattern
- When the number of visible tabs depends on an async settings fetch, initializing the state as `false` causes the TabsList to mount twice (5 cols → 6 cols), producing a visible reflow flash on desktop.
- Fix: use `boolean | null` as the initial state (`null` = not yet loaded). While `null`, render an `animate-pulse` placeholder div with the same height as the TabsList (`h-10`). Mount the real TabsList only after the settings are known, so the correct column count is set in one paint.
- Pattern: `const [featureEnabled, setFeatureEnabled] = useState<boolean | null>(null)` → `{featureEnabled === null ? <div className="hidden desktop:block h-10 animate-pulse rounded-md bg-muted" /> : <TabsList ...>}`

### Docker — NEXT_PUBLIC_* Must Be Build Args
- `NEXT_PUBLIC_*` variables are inlined into the JS bundle by Next.js at compile time. In Docker, they must be passed as `--build-arg` to `docker build` (declared as `ARG`/`ENV` in the builder stage) — setting them only as runtime `-e` or `env_file` values has no effect; the client bundle already has empty strings baked in.
- Docker Compose reads `.env` by default for variable substitution in the YAML (`${VAR}`). It does NOT read `.env.local`. Always run with `--env-file .env.local`: `docker compose --env-file .env.local up -d --build`.
- Firebase Authorized Domains must include any custom self-hosted domain. `*.vercel.app` is pre-authorized by Firebase; all other domains (including Docker/VPS deployments) must be added manually in Firebase Console → Authentication → Settings → Authorized domains.

### Nested Component Remount Trap
- Symptom: clicking a row or toggling local state causes an entire dense table below to flash or look recreated, even in production
- Cause: a large subtree renderer is defined inside the parent component and used as JSX (`<InnerComponent />`), so every parent re-render gives React a new component identity and remounts the subtree
- Fix: move the subtree to a top-level component or invoke it as a pure render helper (`InnerComponent()`) when it intentionally closes over local state

