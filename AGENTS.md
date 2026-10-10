# AI Agent Guidelines — Net Worth Tracker

Conventions and recurring pitfalls. **Rules only**: how each one was learned lives in `git log`, and what each feature
*is* lives in CLAUDE.md — this file says only what an agent can get wrong.

Companion documents — do not duplicate their content into this file:

| File | Owns |
| --- | --- |
| `CLAUDE.md` | Architecture snapshot, feature index, **Known Issues** (open debt) |
| `DESIGN.md` | The aesthetic spec (normative frontmatter + narrative). Never regenerate it |
| `PRODUCT.md` | Users, positioning, accessibility posture |
| `SETUP.md` | Env vars, Firebase, emulators, Playwright, local-verification troubleshooting |
| `WORKFLOW.md` | Standing session rules + the guided-verification protocol (portable across repos) |
| `doc/guide/*.md` | One file per domain — a page, a tab, an integration, a subsystem: the full rules for that area. Read the one you are about to touch |
| `COMMENTS.md` · `DEVELOPMENT_GUIDELINES.md` | How to write code and comments here |

---

## 0. How this file is organised

**This file is every rule that holds repo-wide** — conventions, data/state patterns, UI
patterns, testing, workflow. Read it every session. **A rule about one area's behaviour lives
in `doc/guide/<tema>.md`** (one file per page, tab, integration or subsystem — since 2026-09-06 also the
cross-cutting subsystems: `stati`, `dialog`, `temi`, `account-condiviso-demo`, Settings inside `impostazioni`;
since 2026-09-20 the test harness, `e2e-emulatori`, whose two stubs sit in section 5 under their old names; since
2026-09-30 `shell`, its stub under *Navigation* in section 4, and `cache-persistita`, its stub under *Caching* in
section 2; since 2026-10-10 `prima-schermata`, the first-screen census, its stub under *Performance tooling* in
section 5): open the guide for the area you are about to touch. **Sizes** (owner, 2026-10-10): this file ~1000 lines,
a guide ~500 — past that a guide splits by sub-topic in a session of its own, never trimmed at a session's close
(`prima-schermata.md` left `velocita.md` at 514 lines). Each guide opens with a scope line, lists its files
and the suites to run after a change there (§ *Files*), and ends with its *Per-page blind spots* — behaviours that
look like bugs and are not. Section 3 is the index: the 3–4 things to know before opening each guide, then the
pointer — a stub that grows past that is a guide leaking back (2026-09-20: ten had, up to 2700 characters each;
2026-09-30: four more, up to 2970). A session-closing lesson about a domain goes in that domain's guide, never here.
**Here a lesson is RULE + DATE + WHERE IT IS PINNED** (the test or the file that holds it): how it was learned is
`git log`'s.

## 1. Conventions

### Italian Localization
- UI text Italian, code comments English. `formatCurrency()`, `formatDate()` (`DD/MM/YYYY`), `Sottocategoria` (no
  hyphen), `Buongiorno Giuseppe` (no comma). English on purpose: `Hall of Fame`, `FIRE e Simulazioni`, `Cashflow`,
  `Assistente AI` and the standard metric names; `Current Yield` → `Rendimento Corrente`.
- **`formatPercentage` exists TWICE and the two disagree**: `lib/utils/formatters`' `formatPercentage` is `toFixed`
  (`40.71%`); the it-IT one is `Intl('it-IT')` (`40,71%`) — `formatPercentageIt`/`formatNumberIt` in
  `lib/utils/formatters.ts`, to which `chartService` DELEGATES (2026-08-31). `formatCurrency` matches in both;
  `formatNumberIt` takes a `decimals` argument and pins the width, `formatNumber` does not. Import from the module the
  surrounding component uses, or one surface prints both separators — a hand-rolled `toFixed` beside an `Intl` number
  and `aria-label` text included. **A narrative module the server reads imports from `formatters`, never from
  `chartService`**, which top-level-imports the client Firebase SDK — a periodic email would initialise
  `firebase/auth` inside a Lambda (`cashflowNarrative`, `patrimonioNarrative` and `expenseSplitNarrative` are verified
  SDK-free; a pure module feeding a screen through `chartService` still mocks the Firebase chain in its tests).
- **Curly apostrophes break `.tsx`** (`TS1127`) — delimit with double quotes. **JSX eats the space next to an inline tag
  or wrapped expression** once Prettier breaks the line: write `{' '}` on both sides of `<strong>`/`{expr}`. **An
  `inline-flex` chip drops the leading space of a text-node child too** (each child is a flex item: «69,7%verso FI»)
  — give the words their own `<span>` and let `gap-1` space them, `{' '}` does not paint there.
- **Italian `Intl` breaks naive matching**: four-digit amounts print ungrouped (`1821,01 €` but `29.800,00 €`) and the
  `€` carries a non-breaking space. Anchor as `/^821,01[\s ]*€$/`; never concatenate `amount + ' €'`.

### Firebase Dates and Timezone
- `toDate()` to convert; `getItalyMonth()`/`getItalyYear()`/`getItalyMonthYear()` for domain grouping, never
  `Date.getMonth()`/`getFullYear()`. Server "today" window (cron): `getItalyDayBoundsUtc()`.
- **A reader typed `Expense[]` may still hand out raw Timestamps — convert in the service** (2026-09-18:
  `getExpensesForCostCenter` did, only `getAllExpenses` converted, and `ExpenseDialog` threw «Invalid time value» on a
  row that came from the other reader).
- Inclusive month upper bound: `endOfMonthBound(year, month)` — the 1st at midnight drops the whole closing month.
  `<input type="date">` defaults take `getItalyDateIso()`, since `toISOString()` proposes yesterday from 22:00.

### Tailwind Breakpoints and Responsive Layout
- `desktop:` = 1440px, never `lg:`. Dialog-internal layouts use `sm:`; portrait wrappers `max-desktop:portrait:pb-20`.
  **`min-width` is inclusive**, so `h-11 desktop:h-9` measures 36px at exactly 1440 — the width the Playwright
  desktop projects run at (2026-09-21).
- **NEVER mix arbitrary `min-[px]:` with named breakpoints on the same property** — named ones compile to rem and v4
  emits them last, so `sm:grid-cols-2 min-[960px]:grid-cols-3` renders 2 columns at every width ≥ 640px. Between
  `tablet:`(768) and `desktop:`(1440) use a container query (`@container` + `@[640px]:`, all px).
- **Container queries when one component renders at several widths**: column count = container query, drawer-vs-inline =
  viewport. Per-cell `@container` scales a monetary value to the CELL width, or large amounts overflow.
- **A grid item stretches to the row height, but a normal-flow child does not inherit it without its own `h-full`** —
  side-by-side cards of different content length need `h-full` on BOTH the grid-item wrapper and the card `div`.
- **`sticky`, three rules.** It travels only inside its containing block: put it on the box whose PARENT is the tall
  one and prove it by scrolling `main` in a spec (2026-09-22, the compact `PageHeader`'s mobile navbar;
  `e2e/settings.mobile.spec.ts`). On a grid item it needs `self-start`, or the stretched item leaves a `sticky top-6`
  column no room to travel and it silently behaves as static. Its offset is measured from the scroller's CONTENT edge,
  padding excluded (2026-09-14, Strumenti's actions column: `sticky right-5` mirroring a `-mx-5 px-5` wrapper sat 20px
  over the last cell) — `right-0`, and draw the edge rule only while `scrollWidth > clientWidth`, measured.
- **Horizontal page scroll on mobile**: an implicit-`auto`-track grid expands to its widest child — add explicit
  `grid-cols-1` and `min-w-0` on flex/grid children (they default to `min-width:auto`). To center one flex child use
  `self-center`, not `items-center`, which shrinks every child to content width.
- **`main` is the horizontal scroll container, not the document**: the shell clips at `SidebarProvider`/`SidebarInset`
  and the page sits in `<main class="flex-1 overflow-y-auto">`, whose non-`visible` `overflow-y` computes `overflow-x`
  to **`auto`** — so `document.scrollWidth - clientWidth` reads 0 even while the page scrolls sideways. Assert on
  `main.scrollWidth === main.clientWidth`.
- **Measure the elements, not the container**: walk `main *` and flag any `getBoundingClientRect().right >
  main.getBoundingClientRect().left + main.clientWidth` (`rect.right` is viewport-relative and at 1440 `main` starts
  256px in, so against `clientWidth` alone every full-width child is an overflow). The culpable node is the fix, a
  total in pixels is not. Reference guard: `e2e/fire.mobile.spec.ts`. **Exclude `.sr-only` descendants from the walk**
  (2026-09-20, `e2e/history.mobile.spec.ts`: a visually hidden TABLE is clipped to 1px but its cells keep their
  rectangles — 69 «offenders» on Storico with `main.scrollWidth === clientWidth`).
- **One scroll container per region**: a nested scrollable captures the wheel and content below becomes unreachable
  (desktop-only symptom). `overflow-x-hidden` on an ancestor also CLIPS a descendant's `overflow-x:auto`.
- **An overflow INSIDE a tile never reaches `main`** (2026-09-14, «Entrate per categoria»: 37px past the tile's
  border, 0 on `main`) — neither `Tile` nor a list clips. Measure a list against its own `section`
  (`e2e/cashflow.tracciamento.spec.ts`), and let a column yield under a container query, not a viewport one.
- **`max-w` on a `td` does not bind an auto-layout table** (2026-09-14, the armed row of the Movimenti table, 40px
  past the tile): constrain the BLOCK inside the cell.

### shadcn Card and Dialog Surface
- **`CardHeader` is `flex flex-col`**, so a `flex justify-between` row inside it makes a `flex-1` grandchild act
  vertically (`truncate` dies, `shrink-0` siblings get pushed off-screen) — use a plain `<div className="px-4 py-3 flex
  items-start gap-2">`.
- **`ResponsiveModal` is now the ONE modal** (2026-08-31): every surface with a form, a list or a report goes through
  it. Only two things stay a plain primitive — `LogoutDialog`, an `AlertDialog` because it interrupts and wants
  `role="alertdialog"` with the focus on «Annulla», and the popovers, which are not modals (doc/guide/dialog.md).
- **`DialogDescription`/`DrawerDescription` is required** in every `DialogContent`/`DrawerContent` (`sr-only` if it
  should not show); never silence the warning with `aria-describedby={undefined}`. `ResponsiveModal` handles it: the
  `reading` becomes the Description through `asChild`, and without one the `description` prop is rendered `sr-only`.
- **A shadcn wrapper's own classes ride through `asChild` and win the merge** (2026-09-14, `ModalStatusLine`):
  `DialogDescription` hands `text-sm text-muted-foreground` down to the child, and a child that runs
  `cn(own…, className)` lets `tailwind-merge` keep the wrapper's; a font-size utility also drops a `leading-*`. Put
  the incoming `className` BEFORE the classes that must win, and read the result with `getComputedStyle`.

### Layout and Color Tokens
- Never hardcode structural colors in shell components — `bg-background`, `text-foreground`, `border-border`.
- **Sign colors are tokens: `text-positive`/`text-destructive`**, chips `bg-positive/10`, resolved via
  `getMetricValueColor()`. Two gotchas: **drop `dark:` variants** (the token swaps itself) and the function returns
  neutral for the `currency` format by design — signed currency uses `signChipClass`/`signTextClass`. No legacy
  `text-emerald-*` is left in the DOM (the Tracciamento feed 2026-08-22; `ExpenseTable`, the dividend dialogs and
  table 2026-09-14; `budgetProgressStyle` speaks tokens).
- **An expense type has ONE colour map** (`lib/constants/expenseTypeColors.ts`, 2026-09-14), read by the feed's dot,
  the table's badge and the hero's legend: a row's `income` is the sign token `positive`, each outflow a chart slot,
  `fixed` on the slot the flow series paints spending with; the SERIES (bars) take chart slots, never the sign token.
- **Sign tokens mean gain and loss, and nothing else.** A neutral delta — a class gaining share of a composition — must
  stay `text-muted-foreground`: colouring it asserts a verdict the surface has no target to justify.
- **`--warning` is near-white in light mode**, so text on a `bg-warning` fill MUST be `text-warning-foreground`;
  standalone amber text is a different case (a caution reading uses `text-warning-foreground`, the verdict's dot too).
- **A chart slot is not a text colour** — `--chart-1..8` target ~3:1 against a plot area (`text-[var(--chart-3)]`
  measured 1.02:1 on one theme). The 2026-08-30 tail was audited to the same floor across all twelve blocks (worst case
  3.38:1, so the range is 1..8 and not 1..5) — but on 2026-09-18 `--chart-3` light measured 2,74:1 and `--chart-1`
  dark 2,62:1 ON A CARD: re-measure before leaning on that floor (doc/guide/temi.md § Per-page blind spots). The
  semantic amber is `--warning-foreground`; only `ExpenseTable`'s chips are exempt. **A chart slot used as TEXT is
  held to 4,5:1, not to the ~3:1 it was pitched for**: `__tests__/actionColorContrast.test.ts` measures
  COMPRA/VENDI/OK across all twelve theme blocks, on `--card` and on the chip's own `color-mix` fill — the HARDER
  surface, because a fill mixed from the text's own hue pulls the background towards the text.
- **A computed custom property comes back as `lab()`, never as the `oklch()` you authored**
  (`getComputedStyle(root).getPropertyValue('--chart-3')` answers `lab(64.8793% 25.0679 78.4211)`): **anything that
  READS a colour token parses `lab()` (and `#hex`) too and never asserts `/^oklch\(/` — through
  `lib/utils/colorParse.ts`, the ONE parser since 2026-10-08. Two readers were DEAD CODE from the day they were
  written: `useActionColors`' legibility clamp (until 2026-09-21, measured in the browser: raw chart slots as 10-18px
  text at 2,39-4,02:1) and `useChartColors`' luminance filter (until 2026-10-08, `__tests__/chartColorsContext.test.ts`).
  Worked example: `lib/utils/actionColor.ts`, whose test feeds it the browser's own serialisation.
- **Sidebar tokens**: `--sidebar-accent` is a background, `--sidebar-accent-foreground` text ON it; hover on inactive
  items uses `hover:text-sidebar-foreground`. **Inline `style` blocks Tailwind hover variants**, so migrate to classes
  before adding `hover:`/`focus:`.
- **CSS custom properties never reach emails or the PDF** (both render outside the DOM) — the sign hexes there are
  permanently out of sync (doc/guide/email-pdf.md § Per-page blind spots).

---

## 2. Data and State Patterns

### React Query and Derived State
- **Query + invalidation, never realtime — and Firestore is not the limit** (measured 2026-09-26, the speed dossier):
  with the emulator answering in ~1 ms Cashflow still took 2,1 s and Storico 2,3 s to show a figure — browser CPU
  (deserialising 1533 documents, reducing, mounting) and the boot chain, not the database; in production a round trip
  is 50–150 ms, so what counts is round trips IN SERIES. No `onSnapshot`, and no migration (Postgres/Supabase/Convex
  would rewrite ~40 services, the rules and the harness without touching the measured causes): the two Firestore
  levers are the function region (SETUP.md § Function region) and the materialized per-page summaries (§ Caching).
- **A page or a component never calls a read service: it reads a HOOK** (2026-09-29). One key per collection,
  in `lib/query/queryKeys.ts`, one hook apiece in `lib/hooks/`: `useAssets`, `useSnapshots`, `useExpenses` (and its
  windows, next bullet), `useExpenseCategories`, `useSettings` (the ONE `['settings', ownerId]`), `usePensionContributions`,
  `useAssetTransactions`, `useCostCenters`, `useGoalData`, `useDividendReceipts`, `useHallOfFame`, `useMortgageInstalments`,
  `useDashboardOverview`. **A service that computes from collections takes them as an argument** (2026-10-04,
  `getAllPerformanceData(userId, forceRefresh, inputs?)`): the page hands over what its hooks hold instead of letting the
  service read them a second time. An imperative read (a refresh, a dialog reading once after a write, the CSV import before it
  commits) goes through the hook's exported `…QueryOptions(ownerId)` with `queryClient.fetchQuery` — the same key, the
  same reader, the global staleTime; `staleTime: 0` where the CURRENT document is the point («Annulla» on Impostazioni,
  the pre-read of its «Salva», the import's commit). **A form seeded from a document OBSERVES its hook and settles the
  seed during render** (Impostazioni since 2026-10-08): the first document of the owner seeds the draft, a fresher
  read re-seeds it only while nothing is dirty, and «Annulla» is a RE-READ (`fetchQuery`, `staleTime: 0`) followed by
  a reset — never a copy kept in memory (doc/guide/impostazioni.md). The closing grep of a session is
  `grep -rn "getSettings(\|getAllAssets(\|getUserSnapshots(\|getAllExpenses(\|getAllCategories(" app components`: hooks
  and services only. Every writer invalidates the key its readers read (`queryKeys.settings.all` from the seven places of
  doc/guide/impostazioni.md § Settings — the FIVE places, `goals.all` from Obiettivi AND the assistant's goal card).
- **The expenses are read by WINDOW, and `lib/utils/expenseWindows.ts` is the ONE source of the windows** (2026-09-30):
  Tracciamento and Divisione (`trackingWindow`), Budget (`budgetWindow`, `budgetSuggestionWindow`) and FIRE
  (`fireWindows`) read `useExpensesInRange(ownerId, window)`, one key per window UNDER `expenses.all`; Storico, Analisi
  (owner's decision: a window left out only 48 rows of 1547) and the cost centres read the whole list. **A window is the UNION of what its
  page reads** — a new reader widens it in the same commit and joins `__tests__/expenseWindows.test.ts`; the bounds are
  calendar days in both calendars, never UTC; never `placeholderData` on a window — doc/guide/cashflow.md § Expenses by window.
- **A page over several keys composes ONE read state** (`composeReadState`, `lib/utils/readState.ts`): `loading` while
  any query reads, `loadFailed` when any failed — then `resolveSurfaceState`. Storico reads six keys this way.
- Invalidate all related caches after a mutation; **asset mutations need a dual invalidation** (`queryKeys.assets.all` +
  `queryKeys.dashboard.overview` — the Patrimonio hero reads the overview).
- `useMemo` for derived state, never `useEffect + setState`. **`forceMount` tabs deriving from a sibling's data MUST use
  React Query** — a mount-time `useEffect` loader runs once and the tab goes stale until reload; invalidate
  **unconditionally** on expense save/delete.
- **`initialData` on a query with a global `staleTime` silently disables its fetch** (5min + `refetchOnWindowFocus:
  false` here): it never fetches, never reaches `isError`, never sees a co-owner's change. **Use `placeholderData`.**
- Lazy-gate expensive panels with `enabled: !!userId && isOpen`, and read **`isLoading`, not `isPending`**, on a disabled
  query — `isPending` stays true forever and the skeleton never lifts.
- **An async view must gate on EVERY query it reads**: queries defaulting to `[]` short-circuit into "nothing tracked
  yet" on a cold load. **A failed fetch is not an empty set** — route `isError` to a `role="alert"` notice first.
- **State belonging to a subject must be stored WITH its subject**, not reset by an effect (banned by
  `react-hooks/set-state-in-effect`): store `useState<{ scopeKey, value } | null>` and derive, so a stale key falls back
  to the default with no effect and no extra render.

### Dialog Form Reset
- The reset `useEffect` must include `open` in its deps and start with `if (!open) return`. It holds ONLY the
  react-hook-form calls (`reset`, `setValue`, `replaceTiers`); every `useState` setter of the dialog's own UI state
  (step, status, toggles, a selected id) is settled during render, keyed on `(open, record)` — see *Motion* →
  `react-hooks/set-state-in-effect` (2026-09-06).
- The new-record branch must enumerate **every** field, optional ones included, and call `replaceTiers([])` — `reset()`
  does not clear field arrays.
- **`useWatch()` for render, `getValues()` for handlers — never `watch()`** (incompatible with the React Compiler, which
  then skips the whole component).

### Two-Step Create Dialogs (`AssetDialog`, `ExpenseDialog`)
> The default for a form whose fields depend on a discriminant. Keep the two implementations in step.
- **A marker on a label is a claim the validation has to honour.** `*` = required, `(opzionale)` in
  `text-muted-foreground font-normal` = explicitly optional; the zod schema, any imperative guard in `onSubmit` and the
  marker's own condition must agree (2026-08-30: Sottocategoria was `.optional()` in zod, blocked by a guard, and
  starred on a condition NARROWER than the guard's). `AssetDialog`'s own fields, and how Sottocategoria became
  genuinely optional on both write paths: doc/guide/patrimonio.md § Two-Step Create Dialogs — `AssetDialog`.
- **The picker exists because the type is not one field among many** — it decides which categories/classes exist, which
  accounts are asked for, and how many balances move. Step 1 turns *one form with N conditional shapes* into *N plain
  forms*; a discriminant that only re-labels things does NOT earn a step.
- **Create opens on step 1, edit skips to step 2** — changing a saved record's type is a different act, with
  reconciliation consequences the in-form notice must explain, so the `Select` stays there and only there.
- **`setStep(record ? 2 : 1)` is settled during render on the `(open, record)` subject**, never in `useState`'s
  initializer (the record prop stays null between opens and the second "new" would reopen on the form) and, since
  2026-09-06, no longer in the `open` effect either (`react-hooks/set-state-in-effect`). **It stays so where the host
  mounts the dialog only while open** (Patrimonio since 2026-10-07 — doc/guide/dialog.md): there an
  initializer would be right, but one way that holds for every host beats two; the comment above `openSubject` in
  `AssetDialog.tsx` says so, and `e2e/assets.rows.spec.ts` keeps «Nuovo after Modifica opens on step 1» as a guard.
- **Make the back-link callback OPTIONAL and let its absence select the `Select`** (`onBackToTypePicker?`), so the two
  controls are mutually exclusive by construction rather than via a second boolean that can drift.
- **The picker is a module-level component**, and the type entry carries `Icon` as the COMPONENT, never a rendered node.
- Step 1 selects through the same handler that re-points the category on a type change: the user can return to the
  picker with a category already chosen, and that category belongs to the type being left.

### Firestore Writes
- `updateDoc` only touches fields present in the object and `removeUndefinedDeep` strips `undefined`, so clearing an
  optional field needs `deleteField()` — **not allowed with `setDoc()` without `merge:true`**. Never reintroduce a
  shallow `removeUndefinedDeep`: it must recurse preserving `Date`/`Timestamp`/`FieldValue`.
- **The clear-guard depends on whether partial callers exist**: `averageCost`/`taxRate`/`displayTicker` are written only
  by `AssetDialog` with a complete form, so `=== undefined → deleteField()` is safe; `leverageRatio` also rides on plain
  `updateAsset` and needs the `'leverageRatio' in updates` guard, or a price refresh wipes it.
- **`runTransaction`: ALL `tx.get()` before ANY write** — a `get→update` loop breaks on the second doc and is invisible
  when the function is mocked. Aggregate deltas per docId first (template
  `__tests__/updateCashAssetBalancesAtomic.test.ts`), and fire success toasts AFTER the reconcile returns.
- Firestore rejects `undefined` inside an array element, and `assetAllocationService.ts` builds `docData` by hand, so its
  array fields need a whitelisting serializer with conditional spreads.
- **A bare `.set()` on a server-owned doc DELETES every field its object omits, and the daily cron re-runs them all.**
  When a saved value disappears "sometimes", ask *which periodic write targets this document, and over which window* —
  never a TTL (2026-09-07: the snapshot cron rewrites only the CURRENT month, which made it look intermittent). Keep
  the replace and carry the hand-written fields across it (`preserveUserAuthoredSnapshotFields`, pinned by
  `__tests__/apiAuthRoutes.test.ts` → *keeps the Storico note of the snapshot it overwrites*); `merge: true` is the
  wrong fix whenever the doc holds a MAP the pipeline recomputes, since merging resurrects keys that should have
  disappeared.

### Firestore Queries and the Rules
- **A `list` must carry the constraint the rule needs, or it is refused entirely.** Every collection guarded by
  `allow read: if canAccess(resource.data.userId)` rejects a query that does not already filter on `userId` —
  `permission-denied` at ANY result size, so it never looks like a scale problem, and a batch built from the empty
  result silently does nothing. `deleteExpensesByImportBatch` is the correct shape. **Unit suites cannot see this** —
  they mock Firestore away; only an emulator exercise driving the CLIENT SDK evaluates the rules.
- **Max 3 `.where()` calls** on a chain that will be unit-tested; a 4th breaks the mock chain.

### Caching
- **A per-user pre-computed cache keys EVERY determining input** (`performance-cache/{userId}`: a hash of the whole
  snapshot series, the base signature, the risk-free rate, the dividend category); a 6h TTL covers what the key cannot;
  reads/writes are `try/catch` fire-and-forget; `Date` ↔ `Timestamp` field-by-field, never JSON. **A figure whose inputs
  the key does not cover stays OUT of the document** (2026-10-04, Rendimenti's dividend yields — doc/guide/rendimenti.md).
- **A changed FORMULA is the one input no signature sees — bump `CACHE_MATH_VERSION`** (`v8`); verifying by hand, press
  **Aggiorna** (`forceRefresh`) first. A new optional field needs no bump if paired with `?force=true`; wire «Aggiorna»
  to `refresh()`, never to a bare `refetch()`, which receives the same doc.
- **Global shared cache** (benchmark, FX, ECB): natural key as doc id, no `userId`, `read: isAuthenticated(); write:
  false`; client `staleTime` = server TTL minus headroom. **A shared per-ticker cache the client NEVER reads**
  (`instrument-profile-cache`, 2026-09-28): rules `if false`, Admin SDK only, ONLY the external source's answers
  (`mergeFields` per module), nothing of any user's — doc/guide/allocazione.md § Esposizione.
- **A server-owned materialized summary is fresh only while every write to an input invalidates it**
  (`dashboardOverviewSummaries/{userId}`, 2026-10-03): a new writer owes its invalidation in the same commit; fresh =
  no `invalidatedAt`, same `sourceVersion`, same Italian day, ≤ 6 h; rebuilt in `after()` under a precondition —
  doc/guide/panoramica.md § The materialized summary.
- **The React Query cache is persisted to IndexedDB** (2026-09-29) → `doc/guide/cache-persistita.md`: only the
  `PERSISTED_QUERY_PREFIXES` keys (`lib/constants/persistCache.ts`), only successful reads, never the demo uid; `gcTime`
  per prefix (`applyPersistedQueryDefaults`). **Bump `PERSIST_CACHE_VERSION` when a persisted payload's field is
  renamed, removed or retyped.** Three traps: a surface outside `ProtectedRoute` gates on `useIsRestoring()`; the cache
  is forgotten at sign-out by the provider (`SignOutCacheGuard`); the persister's first write is immediate
  (`e2e/freshness.spec.ts`). Rollback `NEXT_PUBLIC_PERSIST_QUERIES=false`.

### Server Layer and API Authorization
- Route = auth → validate → fetch → ownership check → delegate → return; no Firestore queries or business logic in the
  handler body. Firestore rules do not protect Admin SDK calls, so enforce record-level ownership after loading the doc.
- **Owner-scoped routes authorize with `assertCanAccessAccount(decodedToken, ownerUserId)`**, never a fallback to
  `decodedToken.uid`; viewer-scoped routes (sharing management) just read the token uid.
- Server-owned materialized docs are mutated only via a private authenticated route; cron routes use `CRON_SECRET`, and
  `/api/portfolio/snapshot` must keep accepting `cronSecret`.
- **Validation**: `lib/server/validation.ts` owns the reusable schemas and `parseOr400` — never cast with `as { … }`
  first, coerce dates with `z.coerce.date()` (behind a string when they come from a request, below), and validate
  **Firestore-originated** inputs at the service entry point too.
  **A date in a request is a STRING first** (2026-10-04, `isoDateSchema` = `z.string().min(1).pipe(z.coerce.date())`):
  alone, `z.coerce.date()` turns `null` into 1970-01-01 and a number into a timestamp, so a missing date answers 200 on
  an epoch instead of 400 — every request date in the file goes through it (yields, dividends, transactions), pinned by
  the «a null date» case of `__tests__/performanceYieldsRoute.test.ts` and the date cases of `serverValidation.test.ts`.
  Tests that touch a `server-only` module need `vi.mock('server-only', () => ({}))`.
- **A route's latency is a `Server-Timing` header** (`lib/server/serverTiming.ts`; five routes since 2026-10-05: overview,
  yields, dividend stats, instrument profiles, assistant threads): `startTiming()` at the handler's top, `mark('auth')`
  after `assertCanAccessAccount`, `mark('db')` after ONE round of reads, `mark('compute')` before the response; a service
  with stages of its own takes the recorder (`timing?: ServerTimingRecorder`) instead of returning times, and a count
  the header carries travels BESIDE the body, never inside it (`resolveInstrumentProfiles` → `{ response, counts }`).
  The route tests read the header's stage names (`__tests__/{dividendStatsRoute,instrumentProfilesRoute}.test.ts`).
- **`REGISTRATION_WHITELIST` has no `NEXT_PUBLIC_` prefix**, and `lib/constants/appConfig.ts` must stay client-safe.
- **A Vercel Function never `require()`s an ESM-only package — whatever the Node version** (2026-10-08): Vercel starts
  Node with `--no-experimental-require-module`, so `firebase-admin@14 → jwks-rsa@4 → jose@6` (pure ESM, loaded by
  `require` in `jwks-rsa/src/utils.js`) answered 500 on every Admin route — `ERR_REQUIRE_ESM` in the runtime log of the
  develop deploy of PR #436, on 22.x AND on 24.x — while the same production build on the laptop (Node 24, standalone,
  real credentials) answers 401 to a forged token. The cure is `package.json` `overrides` → `jwks-rsa ^3.2.2` (jose 4,
  CommonJS; firebase-admin calls only `jwks({ jwksUri, cache })` and `getSigningKeys()`, identical in 3.x), held by
  `__tests__/vercelConfig.test.ts` with `engines.node` `"24.x"` (local and Lambda on the same major). Before taking
  any server dependency whose chain reaches an ESM-only package, grep its `require(` calls; the emulators cannot see
  this (`verifyIdToken` skips the signature there) and only a real token on a deploy proves it. The same bump pins
  the CLIENT `firebase` to ≥ 12.19 (one `@firebase/app`, CLAUDE.md § Known Issues).
- **A `server-only` module is not protected by `tsc`**: importing `lib/services/dividendService.ts` (Admin SDK) from a
  client page type-checks and dies in the browser as a Next build error («You're importing a module that depends on
  "server-only"») — the browser is the check (2026-09-06). A client page reads such a registry through a client
  reader: `lib/services/dividendReceiptsService.ts` is the worked example.

### Dynamic Imports and Module Hygiene
- **Components must be at module level** — one defined in a render body is a new type every render (remount,
  `AnimatePresence` enter never plays, `useEffect([])` re-fires, the React Compiler throws). **`react-hooks/static-components`
  flags ANY component obtained from a call during render, `useMemo(() => lazy(…))` included** (probed 2026-09-06): only a
  property read of a module constant passes — the icon pickers' ONE map `LAZY_CATEGORY_ICONS` (`IconPickerPopover`),
  one chunk per icon since 2026-09-30 through the 121 loaders of `components/expenses/categoryIconLoaders.ts`, never
  `import('lucide-react')` by a runtime name nor `lucide-react/dynamicIconImports` (+49 KB gz, measured); a new curated
  name needs its loader (`__tests__/categoryIcons.test.ts`) — doc/guide/cashflow.md.
- **A library several pages use goes behind ONE module of real code** (2026-09-30): recharts only from
  `components/ui/charts/recharts.ts`, which binds `export const X = RechartsX` — Turbopack batches a library by where it
  is ENTERED (four identical 350 KB copies, one per page), and a barrel of bare re-exports is transparent to it.
  `perf:budget`'s `libraryCopies` is red at two copies.
- **A chart inside something closed by default is a `lazyComponent` at MODULE level** (2026-09-30,
  `components/ui/lazy-component.tsx`) with a `fallback` of the chart's OWN height, so it lands with `layout-shift` 0.
  **Not `next/dynamic`**: React.lazy + Suspense suspends on every first render and React 19 holds a committed fallback
  ~300 ms. Preload with `usePreloadWhenIdle(ARRAY, enabled)` — a module-level array, `enabled` = the page's data is in
  (an «idle» browser waiting on Firestore is not idle: +130 ms on Analisi) and, where only one width draws the chart, that
  width (Patrimonio's sparkline, phone only, 2026-10-07). Lazy the PLOT, never the section that owns the trigger; decide
  an empty series outside the lazy module; import types only from it. **A lazy TAB's fallback is the tab's own loading
  state, control rows included** (2026-10-06, `components/cashflow/CashflowTabSkeletons.tsx`, `e2e/lazyTabLanding.ts`).
  Worked examples: `PerformanceDettaglio`, `ConfrontoAnnualeSection`, `FlussoTile`, the four lazy FIRE tabs, Cashflow's
  four non-default tabs, `AssetRow`'s sparkline. **Next prefetches every shell link's route, client chunks included**:
  only a chunk reached solely by an `import()` stays unfetched (`doc/guide/velocita.md`, «Il prefetch dei link della shell»).
- Pure `lib/utils` modules reach `calculateAssetValue` **injected** as a `valueOf` param (`allocationUtils`,
  `pensionFire`) or **imported directly** with the test mocking `@/lib/firebase/config` + `firebase/firestore` +
  `authFetch` + `dashboardOverviewInvalidation` — check the precedent.
- **Functions that call `new Date()` internally are untestable** — pass `now: Date`. **shadcn vendored surface policy**:
  `components/ui/**` is knip-ignored and standard shadcn API stays even at zero references; only **custom additions made
  in this repo** get deleted.
- **CSS custom property liveness — the 5-check sweep.** A token is live if ANY holds: `var(--name` in `.ts/.tsx/.css`; if
  mapped via `@theme`, the **generated utility name** appears (grep `bg-X`, not the variable); `getPropertyValue`; an
  internal chain; the vendored-surface contract. A confirmed-dead token leaves **every** theme block in one commit.

### Shared Constants and Fixed Hooks
- **Rule of Three**: a map used in 3+ files lives in `lib/constants/<domain>.ts`. The canonical symptom of a duplicated
  `Record<Type, string>` is one copy missing its `dark:` variants — illegible in dark mode with a clean `tsc`.
- **Declare N fixed hook instances with `enabled: false` for the inactive ones — never loop over hooks.**
- **Yahoo module asymmetry** — funds `topHoldings` → `sectorWeightings`, stocks `assetProfile` → `sector`, the two
  maps in `lib/constants/exposureSectors.ts`, two MODULES of one per-ticker document since 2026-09-28:
  doc/guide/allocazione.md § Esposizione — the per-ticker cache and Yahoo's two modules.

---

## 3. Domain guides

The per-area rules live in `doc/guide/`. Each entry below is the **stub** — the 3–4 things to
know before opening the guide — then the pointer. In code comments and the other docs,
`doc/guide/<f>.md § <name>` resolves to a `##` heading kept verbatim from the section name this
file used to carry.

### Panoramica → `doc/guide/panoramica.md`
- Overview data flows through `GET /api/dashboard/overview` + `useDashboardOverview()` only — no page-level fan-out, no full-history expense queries; `dashboardOverviewSummaries/{userId}` is server-owned, fresh for the Italian day, and every write to an input invalidates it — a new writer owes its invalidation (§ The materialized summary). Both endpoints owner-scoped.
- `topMovers`/`marketEffect` are MARKET return, never the user's flows: `[]` when the previous snapshot has no `byAsset`, `null` when not attributable (≠ measured 0).
- Every sentence comes from `overviewNarrative.ts`; a falling month blames the market only when `marketEffect < 0`. `resolveDeclineCause` (`lib/utils/periodSales.ts`) is the ONE decision for Panoramica, Patrimonio and the email (the tax in the headline, 2026-09-13), `resolveTaxedGrowth` its twin for a month that did NOT fall (2026-09-19).
- A driver subject missing from `CLASS_SUBJECTS` drops the clause, never prints itself; the page has no «Dettaglio» of its own.
- Il resto — `salesNarrative.ts` (the shared words), the tax headlines, the month's split, the trade-aware market, the lived savings rate, the category deep link, the hero step-down, the tile grid, the superseded-pattern rule, the Italian-copy test trap — in `doc/guide/panoramica.md`.

### Patrimonio · Asset Pricing, FX and Assets → `doc/guide/patrimonio.md`
- "Does this asset have a market price?" is ONE rule in `assetPricing.ts` (`hasMarketPrice`/`requiresManualPricing`); a new hand-valued type goes in `MANUALLY_VALUED_TYPES` and nowhere else.
- **A debt is a `loan` ASSET worth minus its principal** (2026-10-10, `types/assets.ts` → `LOAN_ASSET_TYPE`, the sign in `calculateAssetValue`): the property stays GROSS, the loan sits in the class of what it finances (`realestate` when `financedAssetId`, else `cash` = negative liquidity), always `excluded` from the allocation and from every Rendimenti base, out of FIRE with the primary residence it finances. Where the debt lives on the document is `debtBalanceField`'s alone (a loan's `quantity`, a legacy property's `outstandingDebt`, read-only since the one-shot migration `loanMigration.ts`).
- GBp (pence) ≠ GBP — normalize `price / 100` before any FX; never call Frankfurter from the browser; `quantity = 0` marks a sold asset.
- A Borsa Italiana bond quote is `% of par`, always, and `lib/utils/bondPricing.ts` is the ONE conversion (`quote / 100 × nominal × coefficient`, nominal **1 €** by default). Never re-implement it; never guard it on `nominal > 1` again (issue #340).
- Every G/P, tax estimate, YOC and PMC cell stands EUR against EUR through `lib/utils/costBasisEur.ts` (`costBasisPerUnitEur`, fees included); `undefined` without a EUR PMC — print nothing, never dollars against euros.
- Δ columns are UNIT-PRICE variations, not P&L; `isHeld` (`quantity > 0`) gates every count/share/sum; numbers not in the payload are born in `patrimonioSummary.ts`; the page owns every dialog.
- Il resto — the «Mutuo» tile, one per LOAN (interest measured only from the settled instalments, `mortgageSummary.ts`), the loan migration and its blind spots, the split class chip of a composite instrument (`describeAssetClassChip`), BTP€i, the «Andamento» view, `hasCostBasis`, `MIN_ANNUALIZABLE_DAYS`, the instrument driver, `suggestIsLiquid`, the cash-account picker rule, the article helpers, the failed-overview branch, the `averageCostEur` backfill — in `doc/guide/patrimonio.md`.

### Asset Trade Ledger → `doc/guide/registro-operazioni.md`
- ALL trade money-math (replay, PMC, realized P&L, XIRR, invested capital) lives in `assetTransactionUtils.ts`, pure; the service/route layer is a thin atomic writer. A new `AssetTransactionType` updates the replay switch, the zod schema AND `TransactionDialog`.
- Writes are Admin-API-only, all reads before any writes, derived fields written in-tx (never via `updateAsset`); ledger-type edits go through `updateAssetMetadata`. A settlement moves CENTS (`lib/utils/cents.ts`), and a sell credits proceeds − fees − `withheldTaxEur` (`lib/utils/saleTax.ts`, 2026-09-20); realized P&L and XIRR stay gross of the tax.
- The migration baseline (`isBaseline` BUY) NEVER stamps `holdingStartDate`; a replay returning `holdingStartDate: undefined` means leave the doc untouched (never `deleteField()`).
- A trade date has ONE floor — the asset's OWN baseline (`BASELINE_NOT_FIRST`) — and the future as its only ceiling (2026-09-13); `assetTransactionsMeta.baselineDate` is NOT a floor.
- Per-transaction derived data comes from `replayTransactionsWithEffects` (one pass), never a replay per prefix.
- Il resto — settlement timing, `buildDerivedAssetFields` and the `averageCostEur` backfill, `resolveBondPrice` reuse, the two `totalReturnAssets` paths, the static-copy audit rule — in `doc/guide/registro-operazioni.md`.

### Cashflow — expense mechanics → `doc/guide/cashflow.md`
- Category names are NOT unique: group by `getCategoryKey`/`getSubCategoryKey`, display via `resolveDisplayLabels`.
- Income positive, expenses negative, `net = sum(income) + sum(expenses)`; classification ALWAYS by `type`, never by the sign of `amount`. Crossing the transfer boundary flips the sign and the BATCH paths refuse it; a `transfer` IS its two accounts (the schema refuses it otherwise).
- A recurring expense is N real future-dated rows sharing `recurringParentId`, not a rule; `canTypeRecur` = `fixed`/`variable`/`debt` only; `MAX_RECURRENCE_OCCURRENCES` keeps the batch under 500.
- A linked row moves its account ON ITS OWN DATE (`lib/utils/cashSettlement.ts`, 2026-09-19): `balancePending` until `settleDueBalances` runs in `/api/portfolio/snapshot`; the flag ABSENT means applied; edits and deletes move only what was applied.
- CSV import: MANDATORY preview, undo by `importBatchId`, category identity is (name, type). ONE drill destination (`handleEntitySelect`); Sankey ids are built from ids.
- **A row's fee is a row of its own, on ANY row and on every occurrence of a series** (2026-10-10, `lib/utils/expenseFee.ts`; a transfer's alone until then — the stored field names `transferFeeExpenseId`/`feeOfTransferId` keep their birth name): created in the same batch as its parent, edited from it, deleted with it — a SERIES delete gives the fees' balances back too (`getFeesOf`), from the tab AND the table. A `debt` row repays a LOAN (`debtAssetId`); «Estinzione anticipata» (`isDebtPayoff`) is all principal. A transfer may land on a property priced 1 (a deposit).
- Il resto — le sei regole per esteso, `linkedCashAssetId` su ogni occorrenza, «Collega la serie», lo schema del transfer e la sua spec, la commissione come riga propria (`expenseFee.ts`), la rata che riduce il debito per la QUOTA CAPITALE (`mortgageRepayment.ts`), l'estinzione, il trasferimento su un immobile — in `doc/guide/cashflow.md`.

### Cashflow › Tracciamento → `doc/guide/cashflow-tracciamento.md`
- ONE period axis, two slices: `expenses` feeds the verdict and every tile; `filteredExpenses` feeds ONLY the Movimenti list. Never route a tile through `filteredExpenses`; the phone bar's picker is a second HANDLE on the same `period`, never a second axis.
- A period is its WHOLE calendar span; what has not happened is DECLARED (chip «In calendario», sign colour dropped). `isScheduledRow` = after today by Italian calendar DAY (`isItalyDayAfter`), shared with `budgetUtils` and `costCenterSummary`.
- The verdict judges what has HAPPENED (`settleTotals`, 2026-09-14), then says where the calendar takes it. The month in progress is compared with the SAME DAYS of the previous month (`currentComparisonWindow`/`previousComparisonWindow`); a previous period is honest or absent.
- «Da inizio anno» (`Period.kind = 'ytd'`) and «Anno corrente» (`'current'`, full-year delta since 2026-08-30) are different windows, never one.
- Every number from `tracciamentoSummary.ts`, every sentence from `cashflowNarrative.ts`.
- Il resto — the verdict's two sentences, `previousPeriod`, the two windows anchored to today, the month-end projection, the feed, the mobile filters, the Movimenti reading, «Intestatario» (`lib/utils/movementsOwnerFilter.ts`, `memberNames`) — in `doc/guide/cashflow-tracciamento.md`.

### Analisi — a verdict over tiles → `doc/guide/cashflow-analisi.md`
- FOUR axis modes (`Da inizio anno | Anno corrente | Anno | Storico`); `ytd` and `current` are not the same window.
- A running year is NOT clipped (`periodExpenses` takes the whole calendar year); the pacing compares year vs year−1 on the period's own span (`resolveComparisonScope`), the running MONTH on the same days of its baseline (`throughDay`, rows through `dayOf`), plus the shared `scheduledSentence`. The history CLOSES on the current year (`availableYears`, the Storico slice, the two charts' `BucketCeiling`): a plan's rows in 2043 are a calendar, not years.
- The Scheda is a tile of the grid; every entry point lands through `handleEntitySelect`; URL focus is three FLAT params (`?focusType&focusCat&focusSub`); closing it returns the focus to its opener. Its pace divides the LIVED total by the months lived (`computeEntityRunRate`: `livedTotal`/`livedMonths`), the projection takes the calendar as a FLOOR under the pace, and its period carries the page's `throughMonth` cut.
- Every number has one source (`analisiSummary.ts`, `comparisonDeltas.ts`); every sentence from `analisiNarrative.ts`/`cashflowNarrative.ts`, never a component.
- Il resto — «Fuori scala», the Periodo pacing, `EntityDossier`, the Sankey rules, the optional Flusso by 50/30/20 role (`spendingRoles.ts`), the Flusso's drawing below 640px (a share bar and rows, a legibility threshold of the chart), Playwright — in `doc/guide/cashflow-analisi.md`.

### Cashflow › Budget → `doc/guide/cashflow-budget.md`
- Opt-in (`reconcileBudgetItems` never auto-creates); NO period axis (always the current Italian month; annual budgets are year-to-date on their own Off-Axis tile).
- ONE projection rule, the app's: `buildSpendingForecast` over the month's spending SPLIT at today (`spendingProjection.ts`, shared with Panoramica/Tracciamento); a FIXED category never follows the pace; `MIN_FORECAST_DAYS` (4).
- Risk vs fact: «Categorie a rischio» = projection over amount AND not over yet; a budget already over is a fact for «Avvisi». No row in two tiles. A threshold is a fact of what is BOOKED (`BudgetAlert.spent` = up to today), read against the calendar of its own window (`calendarPct`, `aheadOfCalendar`): the amber is for the rows ahead of it only. «Speso» is `spentToDate`; the scheduled rows are their own clause in every sentence (2026-09-14).
- The ceiling IS historicised by the cron (phase 8, one doc per month, `budgetHistory/{uid}/months/{YYYY-MM}`, `allow write: if false`). The crossing day is a fact of the EXPENSE DATES, never a cron's memory.
- Il resto — `summarizeCeiling`, the two-face KPIs on `exceeded`, `BudgetTrack`, the `cashflow:add-budget` event — in `doc/guide/cashflow-budget.md`.

### Centri di Costo → `doc/guide/centri-di-costo.md`
- NO period axis, by decision (2026-08-23): a project's cost is its whole cost; every figure is lifetime («in totale») unless the tile names its window.
- `summarizeCenter` splits rows at today: booked ones are the cost; scheduled ones get an «in calendario» chip, feed a window's end and a ceiling's `spent`, and are NEVER summed into the total.
- A CENTER HAS NO PACE (2026-09-18): a window's end is booked + calendar (`ytd + yearScheduled`), never `projectWindowEndWithScheduled`. Budget keeps its pace — do not unify; a monthly ceiling reads Budget's `summarizeCeiling` but re-derives `exceeded`.
- The open center lives in the URL (`?tab=cost-centers&center=<id>`); a new center opens on `firstFreeColorKey`, and existing documents are never re-coloured.
- Every number from `costCenterSummary.ts`, every sentence from `costCenterNarrative.ts`. Any count next to a destructive action comes from the same read the mutation runs (the rows are grouped in memory from the expenses key since 2026-09-29).
- Il resto — risk vs fact (`exceeded`/`atRisk`) and the detail's ranking, the retired picker, the backdated row, how the detail lands and refocuses (`data-center-row`), `CenterStackBars`, «Collega spese…», session-only lenses — in `doc/guide/centri-di-costo.md`.

### Cashflow › Divisione → `doc/guide/cashflow-divisione.md`
- Opt-in, on Tracciamento's period axis. ONE field carries the feature: `Expense.personalMemberId`; absent (or `null`) MEANS «in comune» (so no migration). Members are Previdenza's `FamilyMember`s, never a second list. Writing it is a FOUR-place fan-out.
- The share is NEVER invented: `resolveSplitBasis` returns `unavailable` (with `missingNames`) below two people or when one person has no income attributed in the period; every split figure is then `null`. The base is the PERIOD's attributed income, WHATEVER its category (owner's decision, 2026-09-27; labor-only from 2026-08-31 until then) — do not «stabilise» it silently.
- Income left «in comune» pays the pool FIRST (2026-09-27): the shares divide `CommonSpending.toSplit = max(0, total − income)`, a `surplus` is declared and never distributed. A residual is of money that has MOVED (2026-09-21): the page prints and colours `remainingBooked`; `remaining` is the whole period's.
- `allocateByShare` charges the rounding residual to the LARGEST share and re-rounds — untestable on two shares (they cancel), test on three.
- Il resto — `unattributedIncome`, the booked pool net of the income received and the «Da dividere» row, the calendar as a separate clause, `laborIncomeCategoryIds` no longer read, the readers outside the tab (`movementsOwnerFilter.ts`), the deleted-member bucket, the dialog control, `effectiveTab`, the one-cell people row, the verdict-explains/tile-instructs split, «Attribuisci spese» — in `doc/guide/cashflow-divisione.md`.

### Cashflow › Dividendi · Dividends and Coupons → `doc/guide/cashflow-dividendi.md`
- RECEIVED AND ANNOUNCED ARE NEVER ONE FIGURE — counted, totalled and coloured apart on every surface; `summarizePayments` returns two halves and no sum.
- ONE period axis (`resolvePeriodBounds`, upper bound = end of the period's own unit, NOT today), the announced money ON it; filters narrow only the list. TWO POPULATIONS, BOTH NAMED (2026-09-14): verdict and inventory read the REGISTRY (sold included); Affidabilità and Chi paga di più measure the HELD portfolio (`heldAssetIds`).
- A coupon's cashflow expense is created only by the daily cron on payment date (`!isAutoGenerated`, idempotent via `expenseId`), and it credits the instrument's account, else the default, ONLY when the payment is not an arrear (`lib/utils/dividendAccount.ts`, 2026-09-20) — row, balance and `expenseId` in one transaction.
- Two inflation mechanisms, ONE field (`inflationIndexation`, read via `resolveInflationIndexation`): BTP Italia ADDS the FOI rate, a BTP€i MULTIPLIES by the coefficient. Adding a `DividendType` is a six-file fan-out. **A `CouponFrequency 'maturity'` is ONE coupon with the redemption** (2026-10-10, the BTP Valore Insieme): `getPeriodsPerYear` is 0 there and every divider asks `isSingleCouponAtMaturity` first; the coupon is the rate COMPOUNDED over the term (`calculateMaturityCouponPerShare`).
- Il resto — the Rendimento tile off the axis, `useDividendStats` without date bounds, the tab's ONE request (the stats answer carries the list, `useDividendRegistry`; `stats: null` keeps the list when a measure fails), every number from `dividendAnalytics.ts`, a scraped dividend's ONE floor (`lib/utils/dividendEligibility.ts`, 2026-09-13), the zero coupon (`hasCouponPayments`), the calendar, the form (`taxRate` proposal, picker) and the armed row delete, `computeDividendYieldMetrics`, the legacy `isInflationLinked`, provisional coupons, the running-window rule, `couponUtils` — in `doc/guide/cashflow-dividendi.md`.

### Storico · History and Snapshot Baselines → `doc/guide/storico.md`
- The snapshot cron runs DAILY (the name lies) and both writers REPLACE the document: a new `MonthlySnapshot` field no pipeline recomputes goes in `SNAPSHOT_USER_AUTHORED_FIELDS` or the cron erases it (§ *Firestore Writes*).
- Reuse `byAsset.totalValue` for per-instrument history, never recompute; `byAsset.price` is RAW NATIVE currency (EUR unit value = `totalValue / quantity`).
- The page's CAGR is WEALTH growth (`(endNW/startNW)^(12/months)−1`, «versamenti inclusi»), never Rendimenti's return; ONE linear pace (`summarizeGrowthPace`), do not compound it.
- The Driver is SIX parts (`lib/utils/growthDrivers.ts`, 2026-09-19), its market MEASURED per instrument (`marketEffect.ts`) — never «Δ − risparmio»; Lavoro takes the Driver's windows AND parts. «Mutuo» reads the LOAN rows as a total since 2026-10-10 (a loan's `byAsset.totalValue` is minus its principal), the legacy property pairing beside it: the two cross the migration month without a jump.
- The parts are a LEDGER (`buildDriverLedger`, 2026-09-20) that closes TO THE EURO (`reconcileRemainder`); a flow is signed and uncoloured (`isFlowDominated`).
- Il resto — baselines, attribution (`buildMonthAssetBreakdown`), each Driver part, `summarizeLaborMetrics`/`laborWindowsOf`, the manual-snapshot cross-validation, Recharts in a flex tile, the container-query table, the two-column grid — in `doc/guide/storico.md`.

### Hall of Fame — a verdict over tiles → `doc/guide/hall-of-fame.md`
- The page has NO axis and re-derives nothing: `hall-of-fame/{userId}` holds the rankings; "today" is a PARAMETER, never `new Date()` inside the module.
- `hallOfFameRecords.ts` is the ONE definition of a record AND a ranking — both writers and the periodic email call `buildHallOfFameRankings`; never re-implement a ranking.
- A stale document heals only from the page's «Aggiorna» button when the account has no assets (the cron gates on `snapshotResult.success`); disabled in demo. Never document a field as "the cron will fill it in".
- A savings record needs income (`totalIncome > 0` guard); `stats` and the two savings rankings are OPTIONAL on pre-2026-08-25 documents — `getBoard` returns `null` (≠ empty board), never `?? []`. Same for `rankingsUpdatedAt`, `stats.sinceWorstMonth` and `YearlyRecord.monthsCovered` (2026-09-24): stored by `updateHallOfFame`, never derived, their clause dropped when absent.
- Il resto — the podium-vs-chronology split, the tile-never-repeats-the-verdict rule, `NoteTrigger` and the prefilled note, the section-key fan-out, the Playwright locators — in `doc/guide/hall-of-fame.md`.

### Rendimenti → `doc/guide/rendimenti.md`
- The base is resolved ONCE by `resolvePerformanceBase` for its THREE call sites (service, page, PDF). An exclusion read from `byAsset` MUST be backfilled across the pre-`byAsset` months (constant `E₀`) or it becomes a phantom crash.
- The pension toggle WINS over a fund's `allocationRole`. A contribution is a flow iff it crosses the base's boundary; flows ride their own channels (`externalFlowOf`), `netCashFlow` stays the cashflow's savings.
- **The flows follow the base** (2026-09-07): with anything out of it, the months with `byAsset` on both snapshots neutralise the MEASURED boundary flows (`lib/utils/portfolioFlows.ts`); the ledger speaks for an instrument only once the base has SEEN it (2026-09-13).
- The first snapshot of a period is the starting valuation, never a measured month; the page must NEVER re-derive the window from `new Date()` (`metrics.nominalPeriodStart`).
- No silent filters inside a metric (`null` with a reason); the attribution (`performanceAttribution.ts`) is EURO and reconciled to the TWR numerator.
- Il resto — `buildCacheKey`, the flow channels and the entry month, `performanceExcludesCash`, the hero below a YEAR and `resolveCompanionReturnChip`, Contributi's ONE answer (`summarizeCapitalEntered`; a migration baseline is never a purchase), the heatmap read by keyboard and tap, the residual guard (`RESIDUAL_ALERT_SHARE`), EUR benchmarks, drawdown, IRR signs, the verdict-over-tiles rules, the heatmap — in `doc/guide/rendimenti.md`.

### Allocazione → `doc/guide/allocazione.md`
- `Asset.allocationRole` is ONE field, THREE values: `tradable` (default), `frozen` (in the denominator, never in the plans), `excluded` (out of the page entirely); no role is ever inferred at read time. THE RULE: partition upstream of `compareAllocations`, never downstream (filtering the output breaks `targetValue = target% × totalValue` and the Σ(current − target) = 0 invariant), and do NOT push the filter into `calculateCurrentAllocation` (it also serves `/api/portfolio/snapshot`).
- Every euro lands in a bucket: the subcategory is OPTIONAL (`NO_SUBCATEGORY_LABEL`), the orphaned target is the trap (`findOrphanedTargets`/`stripOrphanedSubTargets`), and `ASSET_CLASS_SEQUENCE` is the ONE enumeration of the union — a hand-listed class drops its EUROS, not just its label.
- "Versa" and "Preleva" are ONE tree with the sign flipped, and Ribilancia descends to the INSTRUMENT through those same splits (`RebalanceDescent`, 2026-09-21) — never a second algorithm. «Prelevare 1000 €» means 1000 € IN HAND: `solveWithdrawalGross` is a FIXED POINT, never a division by (1 − rate), and a plan that sells prices the withholding (`estimatePlanSaleTax`), `null` WITH a reason when a leg has no EUR basis or rate.
- Esposizione (2026-09-28): the engine runs in the BROWSER on the page's assets; the route answers only Yahoo's profiles from ONE cache per ticker, owner-scoped (`assertCanAccessAccount`), and nothing of the user's goes in a profile. Every euro of the Allocazione base has ONE of four destinies and the list adds up to 100 on screen.
- Il resto — THE ASYMMETRY of the two plans and the band-independent score, the dormant class (`isDormantClass`, `activeClassGaps` and never the raw `summarizeClassGaps`), `collapseRepeatedLevels` and the node's own `isInstrument`, the leverage engine and its tree, what Titoli, Settori and Emittenti weigh (`hasMarketPrice` + a ticker), the per-ticker cache and Yahoo's two modules, the Bull's formula, the six label maps, the action colours' measured lightness band and the `lab()` trap that made the old clamp dead code, the verdict-over-tiles rules — in `doc/guide/allocazione.md`.

### Previdenza · Fondo Pensione → `doc/guide/previdenza.md`
- `pensionFund` is an `AssetType`, never an `AssetClass`, never a ledger type; its value is statement-driven, held in `quantity` at price 1 (`assertFundValueLivesInQuantity`).
- «Aggiorna valore» (`updatePensionFundValue`, 2026-09-13) overwrites the asset only, never a contribution; the value's age is ONE rule, `isPensionValueStale` — never re-derive it in a component.
- Contributions run on the CLIENT SDK; `taxYear` groups every roll-up, never `date.getFullYear()`; contributions never touch spending or savings.
- Three causes of growth, three numbers — never one blended percentage. A contribution belongs to the month its VALUE MOVED (`createdAt`); `MonthlySnapshot.pension` is FROZEN at write time.
- A return is a measure only through `isPensionReturnMeasurable`; `resolveReturnState` reads the contradiction BEFORE the suspicion.
- Il resto — the return's formulas and window (`resolvePensionReturnStart`), the `isFirstEmploymentPost2007` trap, the two coverage guards, `indexPensionSnapshots` and what is deliberately not bounded, the two tax mechanisms, `overlayLivePensionValue`, the per-contributor return, the verdict-over-tiles rules — in `doc/guide/previdenza.md`.

### FIRE, What If and Goals → `doc/guide/fire.md`
- `respectPensionLockInFire` governs the WHOLE FIRE page: each tab subtracts the locked total AND passes the inflows (subtraction alone reintroduces "sottratto per sempre"). Pension unlock is ONE rule in `pensionUnlock.ts` (explicit `now`); the bridge model reuses the Coast walk, never a second formula.
- **The requirement is ONE rule, `resolveFireRequirement`** (2026-09-24): the walk's `*FireNumber` rows ARE it, the fan's targets are those rows, What If and Coast read the same inputs. **Year 0 is a year in both walks** (2026-09-22): a target already cleared today is `yearsToFIRE = 0`, rendered as a word («già raggiunto»), never «tra 1 anno».
- The Ventaglio engine mirrors the deterministic walk BY CONSTRUCTION — at zero volatility every path collapses onto the base scenario (the coherence test pins that WITHOUT inflows) — and **the fan is seeded** (2026-09-24, `createSeededRandom`: every lever comparison runs on the same shocks). What If = perturbation + diff, no new projection math; `deriveMonteCarloAllocation` is the ONE allocation→4-class normalizer.
- Goal math the server needs lives in `goalMath.ts` (imports `calculateAssetValue` directly); `serializeGoalForFirestore` IS the persistence allowlist; the goal document is rewritten WHOLE, never patched.
- Il resto — what the requirement takes off and grosses up (the Coast pensions by the saved age, the tax of `lib/utils/withdrawalTax.ts` and its `null` without any PMC, the fund at its unlock), the fan's second ledger (`retirements`, which never touches `paths`), the Distribuzione's nearest-rank percentiles (`fireYears`, `fireDistribution.ts`, never the fan's `floor`), the category-agnostic pure layer, each tab computing nothing (numbers from `*Summary`, words from `*Narrative`), config-first collapse, the five verdict-over-tiles sections, Playwright locators — in `doc/guide/fire.md` (pagina e Calcolatore), `fire-coast.md`, `fire-what-if.md`, `fire-monte-carlo.md`, `fire-obiettivi.md`.

### Assistant · Assistente → `doc/guide/assistente.md`
- The context service runs server-side (`adminDb` directly); every mode maps to its own builder in `stream/route.ts` (a missing branch silently falls through to monthly); `buildAssistantPeriodRangeContext` is the FIFTH builder.
- ONE aggregator (`buildCashflowBreakdown`) per builder; a new required bundle field means updating ALL 4 builders. `system` is byte-identical per mode — never interpolate per-request data; `cache_control` deliberately NOT used.
- A silent cap in a context builder becomes a hallucinated "N/D": a cap either does not exist or is stated in the text the model reads. `ASSISTANT_SYSTEM_CORE` is shared with `buildEmailAiPrompt`.
- THE PROPOSAL PROTOCOL: the AI never writes — it emits ONE fenced ```goal-proposal block, the write happens on the user's Conferma via `POST /api/goals`; `goalProposal.ts` owns the ONE zod schema.
- Il resto — memory merge rules, `deleteAssistantThread` batching, the verdict-is-the-context rules, streaming traps — in `doc/guide/assistente.md`.

### Periodic Emails · PDF Export → `doc/guide/email-pdf.md`
- Both render OUTSIDE the DOM: every hex comes from `lib/constants/printTokens.ts` and nothing else; every email layout is a nested table (Outlook = Word). Verify by RENDERING — no check is in the suite.
- A verdict over tiles: the email opens on a RULE-generated verdict (also the preheader), the AI comment is a tile in SECOND position and non-blocking. ONE template for the four periods; «Rispetto a un anno fa» is ABSENT on a yearly email (`previousEqualsYoy`). The «mercato» residual is `Δ − risparmio + tasse stimate sulle vendite` (`periodSales` from the ledger): a broker's withholding has no cashflow row and used to read as a market loss.
- PDF: the cover IS the verdict; on Cashflow, Export Totale applies `cashflowHistoryStartYear` as a floor and DECLARES it; the Rendimenti section measures the page's base (`resolvePerformanceBase`, `baseLabel` on its scope line), never the raw snapshots. No monospace, no typographic minus — `pdfSafeText` converts U+2212 at the boundary (react-pdf drops unencodable chars silently).
- The weekly budget email is a SEPARATE module and nothing in it is weekly (month-to-date + year-to-date); name every figure's window.
- Il resto — `PDF_RAMP`, the class labels, `signedPct`/`signedEur` it-IT, the deterministic-comparison rule, the AI-prompt body — in `doc/guide/email-pdf.md`.

### Impostazioni — tessere senza verdetto → `doc/guide/impostazioni.md`
- ONE draft, six views (2026-10-08): the page is an orchestrator over `useReducer(settingsDraftReducer)` (`lib/utils/settingsDraft.ts`), each tab a module-level CONTROLLED view of its slice with no form state of its own (Radix unmounts an inactive panel); `compose ∘ slice ≡ document` is pinned by `__tests__/settingsDraft.test.ts`; the read is an observed `useSettings` seeding the draft in render; the focus of a refused «Salva» crosses the tabs through the draft (`pendingFocus`).
- The page has NO verdict and must not grow one (a configuration page measures nothing) — it keeps the CADENCE: 23 `describe*` functions in `settingsNarrative.ts`, NO `build*Verdict`.
- ONE «Salva», so the save state is PER TAB (2026-09-22): a dot on each tab holding edits, a bottom bar naming them with «Annulla modifiche» (a re-read, not a copy); the target rules are `allocationTargetValidation.ts`, which says WHERE they failed so «Salva» opens the group and focuses the field. A failed read here is never an empty list (members, categories, accounts).
- A reading declares the effect DOWNSTREAM, not the control under it; the Narrative Honesty Rule holds (a missing input drops its clause).
- A field another page OWNS is DECLARED, never edited here («Parametri del piano» from FIRE, «Assistente» a mirror that loses on read). The colour theme and light/dark mode save themselves, outside `handleSave`.
- The write fan-out for any setting (the FIVE/SIX/SEVEN places) is `doc/guide/impostazioni.md § Settings — the FIVE places` (stub below).
- Il resto — the applicative-default naming rule, `ExpenseImportSection`/`AccountSharingSection`, the blind spots — in `doc/guide/impostazioni.md`.

### Accesso e Registrazione → `doc/guide/accesso-registrazione.md`
- ONE tile, no grid — a 420px column inside `AuthShell`. The verdict is the PRODUCT's promise but still generated by rules (`buildLoginVerdict`/`buildRegisterVerdict`), tone always `neutral`.
- The tile's reading IS the form's status line (`AuthReading` = words + tone); the container role stays a stable `role="status"`, never swapping to `alert`.
- `describeAuthError` is the ONE translation and an unknown code never falls through to Firebase's English string (14 codes mapped). A `code` must survive the context layer (`withCode`).
- `resolveRegistrationAccess` MIRRORS `isRegistrationAllowed`, deroga included — a listed email registers even with registrations off; keep them in step in the same commit.
- Il resto — the password rows, the submit-stays-enabled rule, the demo/Google gating, the blind spots — in `doc/guide/accesso-registrazione.md`.

### Landing pubblica → `doc/guide/landing.md`
- The landing renders the app's OWN tiles (imported from `components/dashboard/overview/`), not pictures of them, fed an invented profile (`landingSampleData.ts`) with tested invariants.
- The month is FIXED (agosto 2026), not derived from the clock. The verdict is the SAME sentence as /login's (`PRODUCT_PROMISE_HEADLINE`).
- The «dati d'esempio» declaration belongs to the REGION, not the tile. The three promise tiles print NO invented figures — only facts about the TOOL, each read from the module that owns it (`BENCHMARKS.length`, `DEFAULT_MONTE_CARLO_SIMULATIONS`, `getPensionDeductionCeiling`).
- The footer counts asset classes from `ASSET_CLASS_SEQUENCE`; the «Registrati» link mirrors the server.
- Il resto — the hero-is-one-component rule, the sample-profile invariants, the blind spots — in `doc/guide/landing.md`.

### Stati: caricamento, vuoto, zero, errore → `doc/guide/stati.md`
- An absence has three names — `missing` · `zero` · `failed` (`AbsenceKind`, `lib/utils/statesNarrative.ts`) — and a
  failed read is checked BEFORE the empty branch, always: every query defaults to `[]`/`undefined`.
- `resolveSurfaceState({ loading, failed })` is the ONE decision on a surface's state; never `loading || !data`.
- `describeReadFailure` requires its `consequence`; a service must not swallow its failure into zeros.
- `Skeleton` is the only muted placeholder; a toast's severity is the icon and a 2px rule, never a `bg-*/10` surface;
  a failed WRITE speaks `describeWriteError`, never `(err as Error).message`.
- Il resto — why `loading` wins over `failed`, `canRetry`/`onRetry`, the decorative `isError` branch, the `compact`
  reassurance rule, reduced motion vs content, the 20 surfaces and the twenty-first — in `doc/guide/stati.md`.

### Dialog e form trasversali → `doc/guide/dialog.md`
- A modal is a tile lifted off the page (DESIGN.md → The Modal-Is-A-Tile Rule): `ResponsiveModal` owns the shell, a
  caller passes content, never chrome. Four widths and no others: `sm` 420 · `md` 560 · `lg` 720 · `xl` 960.
- The reading IS the status line (`describeModalStatus` + `ModalStatusLine`, ONE stable `role="status"` node, never
  `alert`); `describeWriteError` (`lib/utils/dialogNarrative.ts`) is the ONE translation of a failed write.
- Two-click confirms live in `lib/hooks/useArmedDelete.ts`: no timer, ever; Escape while armed means DISARM
  (`hasArmedConfirm()`). The two form rules stay here: § Dialog Form Reset, § Two-Step Create Dialogs.
- A controlled modal with no Radix `Trigger` drops focus on `body` when it closes; since 2026-10-08 `ResponsiveModal`
  restores the element focused at open (every keyboard opener; pinned by `e2e/pension.spec.ts`), and a host whose opener
  never held the focus (Safari's click, a non-focusable row) still passes `returnFocusTo`, taken from `event.currentTarget`
  at the click (2026-09-20, `e2e/performance.degraded.spec.ts`).
- Il resto — the footer order, the status-line a11y traps, `userFacingError`, the `bg-muted` block, the singular
  eyebrow, the armed detail's READING, `triggerOrigin` at the click, no focus below 769px — in `doc/guide/dialog.md`.

### Settings — the FIVE places → `doc/guide/impostazioni.md`
- A new setting lands in all five or it silently disappears: the type (`types/assets.ts`), `getSettings`, BOTH write
  chains in `setSettings`, the wiring where its own Save lives — and `settingsRoundTrip`'s `STORED_SETTINGS` fixture.
- SIXTH place for anything the SERVER reads (`lib/services/dashboardOverviewService.ts`), SEVENTH for the periodic
  emails (`getSettingsAdmin`); neither is covered by the round-trip.
- A user-clearable field is guarded by `'x' in settings`, never `x !== undefined`. Only a hard refresh proves a
  setting was saved; one Save per page; booleans stored, never derived.
- Il resto — il ramo `targets` senza merge, `deleteField()`, lo snapshot dirty che segue il tab che MODIFICA, i quattro
  campi senza guardia, il secondo Salva dei Dividendi, `cashflowHistoryStartYear` — in `doc/guide/impostazioni.md`.

### Demo Mode · Shared Account / Delegated Access → `doc/guide/account-condiviso-demo.md`
- **Demo**: `useDemoMode()` (`lib/hooks/useDemoMode.ts`) **gates every mutation** — the demo account's data is shared
  by every visitor, and the assistant is blocked outright.
- **Viewer vs owner**: `useAuth().user` is the viewer and never changes; `useActiveAccount().ownerId` is whose data is
  displayed. Data-scoped hooks and pages take `ownerId`; manual `useEffect` loaders include it in their deps.
- **Three enforcement layers, kept in sync** over the grant `account-access/{ownerUid}`: `firestore.rules`,
  `assertCanAccessAccount` on Admin routes, the client substituting `ownerId`. Rules changes are inert until deployed.
- Il resto — l'auto-login dalla landing, dove resta `user.uid`, `memberUids` e la discovery, il banner demo, le rules
  per collezione, lo switcher in Sidebar E `SecondaryMenuDrawer` — in `doc/guide/account-condiviso-demo.md`.

### Color Theme System → `doc/guide/temi.md`
- **Parallel theming**: next-themes owns `.dark`, the custom system owns `data-theme` (an external store, 2026-09-06).
- **The chart palette is read ONCE per theme** (2026-10-08): `ChartColorsProvider` in `app/dashboard/layout.tsx`
  reads `--chart-*`, the action colours and the `--role-*` hexes; `useChartColors`/`useActionColors`/`useCssColorTokens`
  read its context and fall back to their own read without it (the landing). Timing: `useEffect + useState +
  requestAnimationFrame`, NOT `useMemo`. The browser RETURNS `lab(…)` or `#hex`, not the `oklch()` you authored: read it
  through `lib/utils/colorParse.ts`, never assert `/^oklch\(/` (2026-08-30).
- **A user-chosen identity colour is a SLOT, not a hex** (`'chart-1'..'chart-8'`, `resolveCostCenterColor`); indices
  0-8 theme-aware (`--chart-9` is Storico's «Previdenza» band), 9 static.
- **Every theme block is held to the distinctness floor** (`__tests__/chartPaletteDistinctness.test.ts`, all twelve
  since 2026-09-20): nine slots, ΔE00 ≥ 14 between any two. A new theme or a moved slot runs it first.
- Il resto — il filtro di luminanza (vivo dal 2026-10-08), gli slot senza backfill, la tinta tenuta tra i due modi, `useActionColors`,
  i sign token per tema, `--chart-6/7/8`, `getAssetClassCssVar`, «Adding a theme» — in `doc/guide/temi.md`.

---

## 4. UI Patterns

### Motion
- Shared variants live in `lib/utils/motionVariants.ts`; `useReducedMotion()` once per component, used inline, with ONE
  `<MotionConfig reducedMotion="user">` in `components/providers/MotionProvider.tsx` at the root layout (the nested
  copies went on 2026-09-28/29: a nested copy with the same value is inert) — no separate CSS media queries.
- **Page transitions use `template.tsx`, NOT `layout.tsx` + `AnimatePresence`**; since 2026-09-12 a shell-link click is
  a page SCENE through `lib/utils/viewTransition.ts`, the ONE entry to `document.startViewTransition`, and a
  `view-transition-name` is unique among the RENDERED elements (do not name the tile grid); a named element leaves
  `root` for EVERY transition — the theme scene switches the names off, and fixed shell over `<main>` needs a name of
  its own (2026-10-08) → doc/guide/shell.md § Motion.
- `useCountUp` always with `once: true`, called **before** any early return and unconditionally for both branches of a
  mode switch (it has no `enabled`: gate the display in JSX); **a `fromPrevious` count-up passes `landFirstValue`**
  (2026-09-23), or a figure that settles between previews counts from «0 €» under a track already at its share.
  **`layout="position"`, not bare `layout`, when a Framer parent wraps a Radix `CollapsibleContent`.**
- **No `layout` on a page wrapper, and a `layout`/`layoutId` only where the element is VISIBLE** (2026-10-08):
  Framer measures a layout element before and after every commit that touches it — under `display: none` too (6
  `getBoundingClientRect` per navigation at 1440 on the hidden bottom nav, `e2e/motion.layout.spec.ts`). Put `layout` on
  the element that moves, never on the page root; gate a hidden one on a `useMediaQuery` of where it shows. **Turning
  `layout` on after mount does not take** — Framer sets the measuring up when the element MOUNTS, and the media query
  answers `true` only after hydration: remount it with a `key` on the gate (`BottomNavigation`, the pill jumped without,
  `e2e/motion.layout.mobile.spec.ts`). The Panoramica's tile cascade plays once per session (doc/guide/panoramica.md).
  **The cost is React and Framer work, not browser layout** (census `nav`, 2026-10-08: −1 `MeasureLayout` per change, CDP
  `LayoutCount` unmoved — a measure on a `display:none` subtree forces no layout), so a `layout` gate is judged by the
  census (`doc/guide/velocita.md` § Il census), never by `LayoutCount`. **No `LazyMotion`/`m` in place of `motion`**
  (decided 2026-09-26, 33 files): little to save, and `layout` and `AnimatePresence` want `domMax` anyway.
- **Collapsible technique, by content shape:** rows expanding into sub-rows → CSS `grid-rows-[0fr] → [1fr]` with an
  `overflow-hidden` child and `inert` on the closed wrapper (Framer + `height:'auto'` left rows stuck at opacity 0);
  tall or unpredictable sections → Radix `<Collapsible>` + CSS transition; small predictable content →
  `AnimatePresence` + `height:'auto'`. **Always a chevron on an expandable row**; `CollapsibleTrigger asChild` propagates
  `data-state`.
- **An auto-dismiss timer lives in its OWN `useEffect([visible])`** — in an effect that also depends on data, a refetch
  cancels the timer and the badge sticks.
- **`react-hooks/set-state-in-effect` — four answers, in this order** (2026-09-06; lint at zero): (1) derive it
  (`useMemo`, or delete state that equals a form field); (2) store the state WITH its subject (`useState<{ key, value }
  | null>`, → *React Query and Derived State*); (3) settle it DURING render — `const [prev, setPrev] = useState(x); if
  (prev !== x) { setPrev(x); setDep(…) }`, before any early return, dependent state only — how every dialog resets on
  `(open, record)`; (4) `setTimeout(…, 0)` with its cleanup, ONLY for a loader that must raise `loading` before its
  `await`. Deferring a dialog's reset paints a frame of old state. The classic `mounted` guard is banned —
  `useSyncExternalStore(neverChanges, () => true, () => false)` declares the SSR/hydration split.
- **`react-hooks/refs`: a custom hook never RETURNS a ref inside its object** (every read of it during render is
  flagged): take the ref as an argument (`useArmedDelete(ref, onDelete)`, since 2026-08-31).
- **The React Compiler RUNS since 2026-10-05** (`reactCompiler: true`, `babel-plugin-react-compiler` 1.0): no
  `React.memo` by hand unless `npm run perf:census` shows it is needed (doc/guide/velocita.md § Il census). **A component it
  cannot compile is skipped WHOLE and in silence**, and lint at zero is NOT the map (`react-hooks/todo` and
  `react-hooks/hooks` are outside `recommended`; «value blocks within a try/catch» reaches no rule):
  **`__tests__/reactCompilerCoverage.test.ts` is the map** (48 skips on the first run, all rewritten; seen red with a
  `finally` and with an `eslint-disable` put back). Rewrites that keep behaviour: a `try … finally` → the finally's
  body after the try/catch when no branch returns or rethrows, else `.finally()` on the awaited call or a module-level
  helper (`runGuarded`); a `throw`, a loop or a `?:`/`&&`/`??`/`?.` inside a `try` → a module-level helper
  (`assertSnapshotCreated`, `forEachSseEvent`) or the body moved into a local `const save = async () => {…}`; an
  `import()` → a module-level loader; an `eslint-disable` of `exhaustive-deps` → `useEffectEvent`. **A build is
  compiled when its chunks carry `react.memo_cache_sentinel`** (3 without, 1318 with, 2026-10-05; `_c(` does not survive
  minification). **The price**: +20–26% gz on component code (`doc/guide/velocita.md` § Registro) and `next build` 29 → 47 s;
  Cashflow paid the most, so its four non-default tabs load on demand (doc/guide/cashflow.md). **Compiled is not
  memoized** (2026-10-07): the compiler compiled `AssetDialog` and left its whole step-2 form outside every memo scope,
  so one root `useWatch` re-rendered 562 components per key — measure a form with the census and move a per-keystroke
  watch into the leaf that reads it (doc/guide/patrimonio.md § Two-Step).
- **`react-hooks/preserve-manual-memoization` ("Compilation Skipped")**: a dep array *more specific* than the inferred
  value skips the component — align the dep. «Memoized in source but not in output» cannot be aligned away: a `useMemo`
  whose value never escapes is pruned — inline the computation.
- **Loading skeleton over spinner** on any page investing in count-up and chart scheduling, `PageContainer` inside it
  or at the call site; verify it is wired (`tsc` does not catch an unused component). Validate motion in a production
  build (mobile CPU is ~3-5× tighter). The skeleton is a WAIT, never a failure (→ `doc/guide/stati.md`).
- **Every looping animation carries `motion-safe:`** — Tailwind's `animate-pulse` does not, which is why the ONE
  placeholder is `components/ui/skeleton.tsx`; `animate-spin` is the deliberate exception (a spinner IS «in flight»).
  Less motion never removes CONTENT (the `SavingsRateBadge` entry in doc/guide/panoramica.md).

### Recharts
- **Import recharts from `@/components/ui/charts/recharts`, never from `'recharts'`** (2026-09-30): the one module of
  real code that keeps the library in ONE chunk (§ Dynamic Imports); a primitive it lacks is added there.
- **`useChartColors()` is mandatory for every series** — the theme's slots from `ChartColorsProvider` (read once per
  theme in the dashboard layout since 2026-10-08, so a host renders once; its own read after paint without the
  provider), `chartColors[0..4]` as props — **once per page or tile, never once per row** (2026-10-07): a list of small charts takes the palette as a
  prop (`AssetSparkline`'s `colors`), as `useActionColors` does; a hook per row was a rAF and a `getComputedStyle` each.
- **A series CAN drive the page, but no page does today**: `onMouseMove`'s `activeTooltipIndex` (a number OR a numeric
  string in 3.x), lift the index's PERIOD, handlers only under `(pointer: fine)`, a pure module resolving the followers.
  Storico's scrub was retired on 2026-09-13 (DESIGN.md → The Scrub Rule; the example is `git show 4b0a2dd`). A
  hand-written SVG gliding between windows resamples the OLD series (`lib/hooks/useMorphingSeries.ts`).
- **Never pass `useChartColors()` to a Nivo/react-spring component**: it cannot interpolate hex→oklch and throws. Sankey
  colours are HEX — hardcoded, or a token resolved by `useCssColorTokens` + `lib/utils/cssColorToHex.ts` (taking
  `enabled`) — doc/guide/cashflow-analisi.md.
- **Three tooltip style props, none inherited**: `contentStyle`, `labelStyle`, `itemStyle` (without `itemStyle` the rows
  are invisible on dark) — module-level `as const` objects on `var(--card)`/`var(--border)`/`var(--card-foreground)`.
- **Axis ticks and legends are numbers: the Mono Mandate covers them, a Tailwind class cannot reach them** — `tick=
  {CHART_TICK_STYLE}` (canonical in `costCenterStyles.ts`) on every axis; `<Legend>` needs `wrapperStyle`.
- **`<Legend content=>` needs a module-level component** (an inline arrow flickers); `Legend` reads `<Bar fill>`, not
  `<Cell>`; **`formatter`'s first param is `ValueType | undefined`**.
- **The legend is `SeriesLegend`, never Recharts' `<Legend>`** (`components/ui/series-legend.tsx`, 2026-09-20): `<Legend>`
  prints labels in the series colour (3,64 · 4,02 · 2,62:1 measured) and names icons in English. One entry per SERIES;
  **one word, one colour per page** (a series named «Mercato» takes the slot «Mercato» has everywhere on that page); a
  reference series that is not a part of the total takes the neutral ink, dashed.
- **Accessibility goes on the chart, not a wrapper**: Recharts 3.x puts `tabIndex=0` + `role="application"` on its
  `<svg>`, so pass `role="img"` + `aria-label` + `accessibilityLayer={false}`; `role="img"` hides the legend, so the label
  carries the colour→name mapping.
- **Never stack bands whose components can go NEGATIVE** (a negative segment draws downward): one area under a line,
  the decomposition in the tooltip. **100%-stacked: pre-normalise the rows, no `stackOffset="expand"`**, normalised over
  what is DRAWN (`historyComposition.ts` names the residual as a band — a stack short of 100 reads as missing data).
  **A «composizione» chart without `stackId` overpaints itself**: grep the series for `stackId` first.
- **`fontSize` on `<Legend>` is silently dropped** — size it through `wrapperStyle`. **`interval="preserveStartEnd"`
  centres the last tick on the plot's edge** — reserve `margin.right`; a negative `margin.left` clips «100%» to «0%»,
  and a cropped number reads as a wrong number.
- **Rolling charts always render**, with an inline empty message; time-bucketed data lives in a tested pure layer
  (`cashflowTimeSeries.ts`).
- **Server-cached chart data has colours baked in — remap at render time for EVERY array**; positional remap is safe
  only without cross-page identity: asset classes remap via `ASSET_CLASS_CHART_INDEX[d.assetClass]`.
- A sticky `<thead>` needs a fully opaque token, never an alpha background.

### Navigation → `doc/guide/shell.md`
- **The shell renders BEFORE Firebase Auth resolves** (2026-09-28): skip link, sidebar, `<main>` and bottom nav sit
  OUTSIDE `ProtectedRoute`, so nothing in them reads `window` during render and the first frame is decided by CSS —
  `useMediaQuery` is `false` on the server and during hydration (`e2e/shell.boot{,.mobile}.spec.ts`).
- **`PageHeader` mounts its `actions` and its `h1` TWICE** (2026-09-18): take the pressed node from
  `event.currentTarget`, never a ref; in a spec `main h1` needs `.filter({ visible: true })`.
- **Nav arrays have one source, `lib/constants/navigation.ts`, and a shell route link is a `SceneLink`** (2026-09-12);
  `PageContainer` is the 1920px root of a tile page, its loading state `TileGridSkeleton` with the page's own cells.
- Il resto — `PageTabs` panels that name themselves and keep their `div`, the icon rail's 44px geometry, the eyebrow,
  the bottom nav and the FAB, the page scene and `data-vt` scoping — in `doc/guide/shell.md`.

### Hierarchy, Density and Disclosure
> The visual rules themselves are DESIGN.md's; only the implementation traps live here.
- **Never give a "Custom" state a permanent slot in a period selector** — it looks disabled until active; render a
  `rounded-full` chip below the selector only when active. A selector working across multiple return paths uses plain
  `<button role="tab">` + a module-level Framer `layoutId`, not shadcn `<Tabs>`.
- **A cardified mobile view needs its own reading note**: a matrix collapsing to per-row cards has no rows and columns,
  so split the help copy (`hidden desktop:block` / `desktop:hidden`) and label each card's axes explicitly.
- **Prefer rendering large local subtrees as pure render helpers or top-level components** — a nested JSX definition
  inside a page component means a simple row selection remounts the whole table. `cn` is NOT auto-imported in pages.
  **The worked example is Impostazioni** (2026-10-08): one 4100-line component with 70 `useState`s re-ran
  whole on every keystroke (286 components per key on the laptop, with the compiler on — it cannot split a
  component); now the page is an orchestrator under 500 lines holding ONE `useReducer` draft, and each tab a
  module-level CONTROLLED view of its slice (`slice` in, `onChange(patch)` out, no form state of its own because Radix
  unmounts an inactive panel). A keystroke then re-renders that view and the page, never the other tabs
  (`npm run perf:census -- --scenario=settings,allocation`; doc/guide/impostazioni.md).
- **A radius on the element that carries a `divide-y` hairline bends the ends of the rule** (2026-09-18,
  `AssistantThreadList`): the `li` stays square, the hover/selected wash goes on an inner box.
- **A tile's footer is ONE line; the method goes behind «Come si calcola»** (`components/ui/tile-method-note.tsx`, 2026-09-20): help printed on every tile at all times stops being read, and an 11px footnote at full tile width runs to 95–130 characters a line (the detector's `line-length`). The line that stays says what the figures ARE; name the trigger after its subject — a page carries several. **A list that must add up adds up ON SCREEN**: round every row to the printed unit and give the drift to the row that is a remainder by definition, or the reader who checks it finds a euro missing.
- **A tile stretched beside a taller neighbour is cured in the GRID, never in the tile** (2026-09-20, Rendimenti): moving eight method footers behind «Come si calcola» made the voids BIGGER (Benchmark ~170 → ~215px, Plusvalenze ~280 → ~380px). Tiles share a row only with tiles of their own height; below that row use two columns at natural height — wrappers `contents` below `desktop:`, `desktop:flex desktop:flex-col` from it — and let the ONE element that can be any height (a chart, `desktop:flex-1`) take the slack. Keep the DOM in the desktop order so Tab follows the eye; the phone re-orders with `order-*` (Storico and Rendimenti are the worked examples).
- **A row's caption WRAPS, it is never truncated, and the label column never grows to make room for it** (2026-09-14,
  `RankedRows`): a cut fact is no fact («30 set · Asilo nido · in calendario»), and at 4 grid columns 46% is the most
  the label can take beside the bar's 40px floor, the amount and the share (58% painted the share outside the tile,
  measured) — so the caption takes a second line (`line-clamp-2`).

### Accessibility
- **`title` is not an accessible name** (VoiceOver on iOS ignores it, touch never fires it): `aria-label` on icon-only
  buttons, a Radix `<Popover>` for information; **a `title` added by a STATE CHANGE is never shown** — put the
  consequence in visible copy.
- **Touch targets ≥ 44×44px**: `h-8 w-8` in dense lists, `h-10 w-10` for primary and destructive actions (shadcn
  `size="icon"` is 36px). **A control that must stay small grows its HIT BOX, not its paint**: the `Switch` is 36×20 on
  screen and 44×44 to the finger through a `before:absolute before:-inset-x-1 before:-inset-y-3` pseudo-element
  (2026-10-08); `boundingBox()` cannot see it, so a spec proves it by `elementFromPoint` (`e2e/fire.spec.ts`). **Actions hidden with `opacity-0` are unreachable on keyboard AND invisible on touch** — gate
  them behind `[@media(pointer:fine)]:`. **`desktop:h-7` is 28px — never a target**: copy `h-11 → desktop:h-8`
  (`AsideToggle` since 2026-09-20; four Previdenza sites shipped 28px until 2026-09-13). A 1440px tablet in landscape
  reads the desktop layout by touch (doc/guide/shell.md § Per-page blind spots).
- **A non-interactive element with `onClick` needs `role="button"`, `tabIndex={0}`, `aria-label`, Enter/Space and a
  focus ring — better, a native `<button>`. But an `aria-label` on a `role="button"` REPLACES its contents**
  (2026-09-21, Allocazione's Per classe hid eight percentages): when the element's text is the information it IS the
  name, and the expand wording moves onto the chevron as `sr-only` text.
- **Tabs**: `role="tab"` + `aria-selected` in a named `role="tablist"`, `id` + `aria-controls` for a real panel. **A
  `SegmentedPill` that picks a VALUE the page reads (a year, a period) is `semantics="radio"`** — a tablist with no
  tabpanel is a promise the DOM cannot keep (2026-09-13 Previdenza and the Panoramica's period, 2026-09-14 Dividendi;
  the others stay `tabs` until reviewed). Its inactive label is `text-foreground/70` (`text-muted-foreground` measured
  4,34:1 on `bg-muted`); an active state with no tab (a CUSTOM range) needs an `sr-only` `role="status"` description.
  **A toggle that shows a panel needs `aria-expanded` + `aria-haspopup`** and a document Escape handler inside
  `useEffect([isOpen])`. **`PageTabBar` tabs carry `aria-label={label}` unconditionally** (2026-08-22: icon-only below
  1440); pass `ariaLabel` to `PageTabs` so the tablist is named too.
- **A tile's `ariaLabel` is its visible eyebrow, year included** (`Anno fiscale 2026`; WCAG 2.5.3) — Playwright
  locates it with a regex.
- **`aria-live` regions**: streaming content `aria-live="polite" aria-atomic="false"` + `aria-label`. **Emptying a live
  region announces nothing** — a two-click confirm announces the *disarm* explicitly.
- **Data tables**: every `<thead>` `<th>` has `scope="col"`, row headers are `<th scope="row">`. **Calendar grids need
  explicit ARIA rows**: `role="grid"`, `role="row"` per week (slice the flat 42 cells), `role="columnheader"`,
  `role="gridcell"`.
- **Colour-swatch buttons**: never a hex nor a hue name — the **position**, `Colore ${i+1} di ${n}` + `aria-pressed`.
  **`<Button asChild>` inside `<Link>`**, never `<Button>` (it emits `<a><button>`).
- **Two-click confirm: no timer, and not `onBlur` alone** (a 3 s auto-disarm is a WCAG 2.2.1 time limit; Safari does
  not focus a tapped `<button>`): a document `pointerdown` with a `ref.contains(target)` guard, Escape, `onBlur`.
  **Disarm BEFORE delegating** (on failure nothing resets the flag). **Inside a modal Escape cannot be intercepted from
  the button** (2026-08-31): Radix's dismiss layer listens from the dialog's MOUNT, so `useArmedDelete` exports
  `hasArmedConfirm()` and `ResponsiveModal` calls `preventDefault()` in `onEscapeKeyDown`. **The armed button stays a
  compact «Conferma» and the ROW prints the consequence** (2026-09-13, `VersamentiTile`, `text-destructive`). **One
  live region per list, not per row.**
- **A list of same-kind controls is ONE Tab stop** (`lib/hooks/useRovingFocus.ts`, 2026-09-20: 24 checkboxes put
  «Dettaglio» ~55 Tabs down Storico): `containerProps` on the wrapper, `itemProps(i)` on each control (`data-roving-item`,
  no ref), an `sr-only` hint the table is `aria-describedby`. **The dashboard's first Tab stop is «Vai al contenuto
  principale»** (`#page-main`, `tabIndex={-1}` on `<main>`) and **a tile's eyebrow is an `<h3>`** under the verdict's
  `<h2>` (`components/ui/tile.tsx`); a keyboard-walk spec presses Tab right after the load.
- **Form error text needs the sign token too**: `text-red-500` fails AA on a dialog and diverges from `--destructive` on
  the other themes (the last 76 retired 2026-08-31); a FORM-level failure belongs to the modal's reading line.

---

## 5. Testing and Workflow

> Session rules — one branch and one commit per session, no commit without explicit approval, the
> guided-verification protocol — live in **WORKFLOW.md**.

### Commands
- **Phantom errors after a branch switch are a stale `node_modules`** (untracked, branch-shared): ~25 `tsc` errors
  clustered in `e2e/` and `lib/utils/expenseImport.ts` (`papaparse`, `@playwright/test` missing), or `next build`'s
  «Failed to resolve package babel-plugin-react-compiler» (2026-10-07) — `npm install` first, then put back any lock
  line npm rewrote for the platform (`fsevents`'s `dev`). **A dependency RANGE alone is changed by hand in both files**
  (2026-09-30: `npm install --package-lock-only` rewrote 66 unrelated lock lines): `package.json` + the lock's root
  entry, then `git diff --stat`.
- `npm test -- <file>` / `npx vitest run <file>` for targeted tests; **`npx tsc --noEmit` before any PR**, re-run AFTER
  writing the tests.
- **Never `git checkout <file>` to undo ONE edit on uncommitted work** (2026-09-24): it restores the committed file and
  throws away the session's rewrite of it. Undo a falsification with the tool that made it, then `tsc` again.
- **`npm run lint` is at zero since 2026-09-06 and stays there**: a new `any` gets its real type, no new
  `eslint-disable`; a local named `module` is refused by `@next/next/no-assign-module-variable` (2026-09-28) — name it
  after what it holds. The config ignores `.agents/**` and the `.next-*/**` dist dirs.
- **A heavy module graph is a FIXTURE**: hoist a slow `await import()` into `beforeAll` with an explicit timeout (after
  checking nothing is read at module scope); inside a test its one-time cost lands on whichever case runs first.
- **Generated `.next*` type files that break `tsc` or `next build` are deleted, never edited**: a TS1109 only in
  `.next/dev/types/validator.ts` is a half-written file of a killed dev server (delete that file, not the dist dir); a
  TS2307 on `…/app/api/<route>/route.js` in the `validator.ts` of every `.next-*` (2026-09-28), or in a production
  build's `.next/types/` (2026-10-07, after PERF-09 removed `current-yield`), cites a route that no longer exists;
  `.next-e2e/dev/types/` goes whole (2026-09-20) — it is the suite server's alone.
- **Git Bash on Windows, two traps**: MSYS rewrites an argument starting with `//` or `/` (2026-10-04: `/api/cron/…`
  became a Windows path) — prefix `MSYS_NO_PATHCONV=1`; **its `sed -i` is not a falsification tool** (2026-09-28: a
  pattern with `€` matched nothing and exited 0, and a CRLF file came back LF) — swap text with a node script that
  asserts exactly one match, and grep the line before trusting the run. A Markdown backtick inside a double-quoted
  `node -e` is run by bash as a command (write the text through a file).
- **A surface with no DOM is verified by RENDERING it** (the PDF through `renderToFile` under Vitest, the emails in
  Chromium at 390 / 600 / 1440), and a render with hand-built data proves the WORDS, not the data path (2026-09-07: run
  `fetchPDFData` itself on the emulators) — doc/guide/email-pdf.md § Verifying a surface with no DOM.
- **A trial merge of an open PR runs in a worktree, never in the main checkout** (2026-09-07): fetch `refs/pr/<N>`,
  `git merge --no-commit --no-ff`, `tsc` + area suites + eslint, `git merge --abort`. `node_modules` is a directory
  junction on Windows (`New-Item -ItemType Junction`; `cmd //c mklink` is refused), a `cp -cR` clone on the Mac
  (Turbopack refuses a symlink out of the root, 2026-10-04); two at a time on 16 GB; a conflict is judged on `git
  merge-tree --write-tree`, never guessed. **Never `git worktree remove --force` a worktree that held a junction or a
  build** (2026-09-30: it emptied the main `node_modules`): drop the junction, check the path is gone, delete the
  build, remove the worktree, count `ls node_modules | wc -l`.
- **An accepted PR merged "with changes" is its diff applied, not its commits** (2026-09-07): `git apply --reject` of
  `base...head`, the session's fixes on top, one commit with the author as `Co-authored-by`, never the PR's own
  `CLAUDE.md` and draft hunks. **While `doc/mobile/` is open** (2026-09-27; `doc/perf/` closed on 2026-10-08) it is crossed with the open
  specs (a cited line that moves, a count, a baseline, a rule the new code should follow), the specs amended in the
  same commit; it lands BEFORE a spec that rewrites the same files. Look first for the five defects of that day's three
  PRs: a sentence or number born in a component, an overflow asserted on `document`, an absence with no positive
  anchor, a hook running with its feature off, a write that does not invalidate its reader's key.
- **Run the suite under `TZ=Europe/Rome` too**: every date fixture sits at noon, twelve hours clear of the DST edge,
  while production dates are local midnight and the pure layer runs in the user's browser. Day-of-year from calendar
  fields in UTC (`Date.UTC(y,m,d) - Date.UTC(y,0,0)`), and one fixture built the way the dialog builds one. **A fixture
  that sits BESIDE midnight is named by the Italian clock** — `fromZonedTime('2026-07-31T23:59:00', 'Europe/Rome')`,
  never `new Date(2026, 6, 31, 23, 59)`: the rule under test reads the Italian day, and the process-zone date is the
  next day in Rome whenever the suite runs in UTC (four cases were red there until 2026-10-08; the suite is now green
  under `TZ=UTC` as well, and stays so).
- **The suites to run after a change are listed per area in each guide's § *Files*** (since 2026-09-30). Two crossings
  no guide owns: `types/assets.ts`'s `AssetType` also means `assetDialogHelpers` + `allocationUtils` + the three ledger
  suites, `TYPE_TO_CLASS` and `TYPE_CARDS` in `AssetDialog.tsx`, `MANUALLY_VALUED_TYPES` when hand-valued,
  `exposureRequests.MODULE_BY_TYPE`, `DividendDialog`'s non-paying set (the `loan` of 2026-10-10 touched all five);
  widening `AssetClass` means `ASSET_CLASS_SEQUENCE` and its readers. **Perf tooling**: `perfBudget`,
  `perfRoutes` (`perf/routes.json` = `navigation.ts`), and for the first-screen census `mobileBudget`, `mobileSurfaces`
  (`doc/mobile/budget.json`'s surfaces = `navigation.ts` minus the assistant), `mobileCensusFigures` and `mobileCensusOptions`; `npm run perf:budget` after `npm run build`, or `-- --dist=.next-perf`
  after `perf:build` (2026-10-05: without it the script read a `.next` of 15/08 — its first line names the build); a
  route that grows raises its ceiling with `raisedBy` in the same commit (`doc/guide/velocita.md`).
- **`firebase deploy --only firestore:rules` with a stale login fails with a 401 on `serviceusage`**: `npx firebase
  logout`, `npx firebase login --no-localhost`, open THAT run's URL, `npx firebase login <code>`. Always `npx firebase`.
- `npx knip` uses the root `knip.json` (`components/ui/**` and `public/sw.js` ignored, `firebase-tools` an ignored
  dependency, `ignoreExportsUsedInFile: true`): remaining EXPORT_ONLY findings are deliberate prop surface.
- Emulators, Playwright, production-build verification and their environment traps: **SETUP.md → Steps 6-7**.

### Emulator Exercise Scripts → `doc/guide/e2e-emulatori.md`
- A collection whose value is in the *wiring* gets an exercise: the unit suites mock Firestore away, so only an exercise
  covers the rules, real `Timestamp` values through `removeUndefinedDeep` and the real atomic transaction.
- **A throwaway is an `.mts` FILE run from INSIDE the repo** (`scripts/*.tmp.mts`, untracked, deleted in phase G): a
  `.ts` script is CJS under tsx with no top-level await, a bash heredoc dies on an apostrophe (2026-08-25), and from the
  session scratchpad `firebase-admin` fails with `ERR_MODULE_NOT_FOUND`. A throwaway Playwright spec lives in `e2e/`.
- **Drive the mutations through the app's services** (client SDK, rule-evaluated), reads and fixture edits with the
  Admin SDK; verify by **two independent paths** — a same-code-path comparison is circular. On a shared account never
  pin ABSOLUTE values, and never share document ids with the seed.
- **A Firestore `DELETE` on a missing document answers 200**: know where each write lands
  (`assetAllocationTargets/{uid}`, not `settings` — 2026-08-30) and confirm with a `GET` before calling a cleanup done.
- **Reading PRODUCTION is read-only and only one way** (2026-09-06): an in-repo `.mts` calling nothing but `.get()`,
  refusing to run with `FIRESTORE_EMULATOR_HOST` set, the dump in the scratchpad. A tour on real data is the mirror:
  `npm run mirror:seed -- <email>` / `npm run mirror:remove` (2026-09-07).
- **Stopping the emulators: export FIRST, then kill, then verify the directory's mtime moved** — a 200 with an
  unchanged mtime is the failure that looks like success. **`TaskStop` kills only the npm wrapper** (2026-09-19):
  `next dev`, the `firebase` CLI and the Firestore `java` stay listening.
- Il resto — the CRLF trap on a Windows clone, the stale `.next-e2e` / `NEXT_DIST_DIR=.next-throwaway` rule, the
  two-process anatomy of the mirror, the Windows `_admin/export` call and its slash trap, a port 3000 held by another
  app — in `doc/guide/e2e-emulatori.md`.

### Browser-Driven E2E (Playwright) → `doc/guide/e2e-emulatori.md`
- **What belongs in a browser test**: only what needs a real layout (the `desktop:` switch at 1440px, a collapsible, a
  state flash, computed sizes, bounding boxes, overflow); the arithmetic stays with Vitest. A query race and an error
  branch reached by cutting the network are NOT reproducible locally.
- **`workers: 1`, non-negotiable**, and **each suite its OWN fixture** (an `npm run e2e:seed:*` script plus one
  `spawnSync` in `e2e/global-setup.ts`). Re-seeding an account mid-suite logs it out: creation once, data-only per test.
- **The FILENAME chooses the account**: `*.spec.ts` → `desktop`, `*.mobile.spec.ts` → `mobile`, `*.degraded.spec.ts` →
  degraded, only `analisi.spec.ts` / `centri.spec.ts` / `split.spec.ts` reach those fixtures — and each of those three is
  ALSO excluded from `desktop`/`mobile` by `testIgnore`, or it would run a second time on the base account. A throwaway spec gets its own
  `playwright.<name>.config.ts` and is deleted before the full suite (2026-08-28).
- **`localhost`, never `127.0.0.1`** (the page never hydrates and the login submits natively), and `storageState`
  captures the Firebase session only with `{ path, indexedDB: true }`.
- **Prove the test can fail before trusting it**, breaking ONE behaviour at a time (2026-09-18). **Assert on Firestore,
  not on pixels**: plant a decoy word absent from the seed, and remove the fixture BY THE APP, not by `curl -X DELETE`
  (2026-08-31). On the BASE account FIRE figures depend on the run month: assert STRUCTURE and FORMAT, never amounts.
- **Proving a refactor changed no number**: measure the noise floor first (two dumps of unchanged code), compare
  old-vs-new MINUTES apart, and compare the SET of rendered values, not the page text.
- **In the cloud container** (2026-09-25) the pinned Chromium is missing (a throwaway `playwright.local.config.ts` sets
  `executablePath`), its own Chromium groups «1.100 €» (four base specs read red there only), and no spec can import
  `lib/` (no `@/` alias): doc/guide/e2e-emulatori.md.
- Il resto — the page-reading traps (`addInitScript`, `innerText`, `boundingBox`, hidden mobile duplicates, hydration
  wiping a `fill()`), the vaul drawer after Escape, locators that are not buttons and substring matching (`exact: true`),
  the euro regex and U+202F, forcing a server flag on the response, the settings reload rule, the armed two-click
  confirm, the three tour-spec traps, Java ≥ 21 and foreign emulators on 8080/9099 — in `doc/guide/e2e-emulatori.md`.

### Performance tooling → `doc/guide/velocita.md`
- **Three tools, one port**: `npm run perf:budget` (JS per route against `perf/budget.json`, two seconds, no server),
  `perf:bench` (cold / warm / revisit on the `.next-perf` build that `perf:serve` serves on :3200, mirror data) and
  `perf:census` (React commits and components per keystroke, per tab change, per load, per navigation). Options ALWAYS
  after `--`, and PowerShell 5.1 eats the `--`: use Git Bash.
- **A ceiling only a measure may lower, and only a new feature may raise** — `raisedBy` on the route, the before/after
  and a row in § Registro dei tetti alzati, in the same commit; `libraryCopies: { recharts: 1 }` is a rule, not a
  measure. TIMES compare only on the same machine in the same session (±10%); COUNTS compare anywhere.
- **The first-screen census shares the port** (2026-10-10, MOB-01; its manual is `doc/guide/prima-schermata.md`): `npm run mobile:census` measures the composition of
  19 surfaces × 390/768/1024 on the same :3200 build, re-seeding its own fixture `census@example.com`; `npm run
  mobile:budget` holds the run against `doc/mobile/budget.json` (zero tolerance, it only tightens, a widening carries
  `raisedBy: "MOB-NN: …"`; `--tighten` refuses a partial run and a run in which Yahoo answered a profile, 2026-10-10).
  The fixture refuses to be measured from the 1st to the 4th and on the month's last day; an unknown `--surfaces` key
  or `--viewports` value exits 1 with the valid ones.
- Il resto — every column, the baseline in force and the historical one of 2026-09-26, the before/after of every speed
  session, the census scenarios, `--revisit` and what the tables do not say — in `doc/guide/velocita.md`.

---

## 6. Quick-Fix Reference

- **A domain rule copy-pasted into a 3rd file will diverge, and the divergent copy is the one users see**
  (`assetPricing.ts` is the worked example).

### Audit habits
- **An `isError` branch above a service that never rejects is decoration**: a `catch` returning `[]`, `0` or a default
  turns every failure into a truthful-looking answer (`getAnnualCashflowData` until 2026-09-01). Read the service first.
- **"Keep" verdicts need the same grep as "Delete" verdicts; a doc comment naming a caller is a claim — grep it** and
  fix the comment in the same commit. Knip marks a dead chain's intermediate links "live", and a function that always
  returns `[]` keeps its pipeline "live": trace inward, delete the chain in ONE commit.
- **A green check never seen red asserts nothing** — the check's own arithmetic included. **When a falsification stays
  GREEN, the test is the bug** — one of five, each met here:
  - **another line holds the property**: name it in the test, or it is deleted as dead code (2026-09-21: the re-cap of
    `splitFromSurplus`, `estimateSaleTax`'s floor, the explicit `tabIndex` beside `AsideToggle`'s `itemProps`);
  - **a test added beside others is proven by a falsification that turns ONLY it red** (2026-09-28,
    `__tests__/exposureEngine.test.ts`: the old identities measure the base with the engine's own filter);
  - **the ASSERTION is the inert one** — suspect its anchor (2026-09-21, the monthly email: `toContain('1400')` matched
    the caption, not the `<td align="right">` cell);
  - **the fixture makes a branch unreachable** (`allocateByShare`'s rounding correction cannot fire on two shares);
  - **the test PINS the defect** (2026-09-07, `summarizeLaborMetrics`'s baseline month and missing right edge asserted as
    expected): put one row past every boundary the function should have.
- **A fire-and-forget whose `catch` only logs is verified by READING the document it should have written** (2026-09-06,
  `e2e/performance.degraded.spec.ts` on `performance-cache/{uid}`: an `undefined` in the metrics failed every write);
  `removeUndefinedDeep` before every `setDoc`.
- **A spec that edits a document another fixture writes RESTORES what it read, never deletes** (2026-09-11,
  `cashflow.owner.spec.ts`) — the WHOLE document when a page save rewrites it (2026-09-25,
  `e2e/cashflow.transfer-fee.spec.ts` with `set()`); a fixture ISIN is one the account never held; a fixture date is UTC
  midnight like the form's — doc/guide/e2e-emulatori.md § Browser-Driven E2E (Playwright).
- **An assertion of ABSENCE needs a positive anchor first**: `toHaveCount(0)` passes against a page that has not
  rendered — wait for something expected in both states, then assert the absence; a chunk held from the first
  navigation keeps an absence at mount green whatever the page mounts (2026-10-07, `e2e/assets.rows.mobile.spec.ts`).

### Per-page blind spots
The "looks like a bug, is not" behaviours live at the end of each `doc/guide/<page>.md` (*Per-page blind spots*,
moved verbatim from CLAUDE.md's Known Issues on 2026-08-28/29/30); read it before "fixing" anything on that page.
CLAUDE.md keeps only the cross-cutting ones.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
