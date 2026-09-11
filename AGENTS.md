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
cross-cutting subsystems: `stati`, `dialog`, `temi`, `account-condiviso-demo`, and Settings inside `impostazioni`):
open the guide for the area you are about to touch. Each guide opens with a scope line and ends with its
*Per-page blind spots* — behaviours that look like bugs and are not. Section 3 is the index:
the 3–4 things to know before opening each guide, then the pointer. A session-closing lesson
about a domain goes in that domain's guide, never here.

## 1. Conventions

### Italian Localization
- UI text Italian, code comments English. `formatCurrency()`, `formatDate()` (`DD/MM/YYYY`), `Sottocategoria` (no
  hyphen), `Buongiorno Giuseppe` (no comma). English on purpose: `Hall of Fame`, `FIRE e Simulazioni`, `Cashflow`,
  `Assistente AI` and the standard metric names; `Current Yield` → `Rendimento Corrente`.
- **`formatPercentage` exists TWICE and the two disagree**: the it-IT one is `Intl('it-IT')` (`40,71%`),
  `lib/utils/formatters`' `formatPercentage` is `toFixed` (`40.71%`); `formatCurrency` matches in both. Import it from
  the same module the surrounding component uses, or one surface prints both separators.
  **The it-IT implementations now live in `lib/utils/formatters.ts` as `formatPercentageIt`/`formatNumberIt`, and
  `chartService` DELEGATES to them** (2026-08-31), so there is still exactly one implementation and no call site
  changed. The reason is reach: `chartService` top-level-imports the client Firebase SDK, so a narrative module that
  took its formatter from there could never be read by SERVER code — the periodic emails would initialise
  `firebase/auth` inside a Lambda to print a percent sign. **A narrative module the server reads imports from
  `formatters`, never from `chartService`**; `cashflowNarrative`, `patrimonioNarrative` and `expenseSplitNarrative`
  are verified SDK-free. `formatNumberIt` is NOT `formatters`' own `formatNumber`: the former takes a `decimals`
  argument and pins the width, the latter does not. A pure module feeding a screen through `chartService` still mocks
  the Firebase chain in its tests. Same rule for any hand-rolled `toFixed` next to an `Intl`
  number — including `aria-label` text, where a dot makes a screen reader announce a different figure from the screen.
- **Curly apostrophes break `.tsx`** (`TS1127`) — delimit with double quotes. **JSX eats the space next to an inline tag
  or wrapped expression** once Prettier breaks the line: write `{' '}` on both sides of `<strong>`/`{expr}`. **An
  `inline-flex` chip drops the leading space of a text-node child too** (each child is a flex item): «69,7%verso FI»
  — give the words their own `<span>` and let `gap-1` space them, `{' '}` does not paint there.
- **Italian `Intl` breaks naive matching**: four-digit amounts print ungrouped (`1821,01 €` but `29.800,00 €`) and the
  `€` carries a non-breaking space. Anchor as `/^821,01[\s ]*€$/`; never concatenate `amount + ' €'`.

### Firebase Dates and Timezone
- `toDate()` to convert; `getItalyMonth()`/`getItalyYear()`/`getItalyMonthYear()` for domain grouping, never
  `Date.getMonth()`/`getFullYear()`. Server "today" window (cron): `getItalyDayBoundsUtc()`.
- Inclusive month upper bound: `endOfMonthBound(year, month)` — the 1st at midnight drops the whole closing month.
  `<input type="date">` defaults take `getItalyDateIso()`, since `toISOString()` proposes yesterday from 22:00.

### Tailwind Breakpoints and Responsive Layout
- `desktop:` = 1440px, never `lg:`. Dialog-internal layouts use `sm:`; portrait wrappers `max-desktop:portrait:pb-20`.
- **NEVER mix arbitrary `min-[px]:` with named breakpoints on the same property** — named ones compile to rem and v4
  emits them last, so `sm:grid-cols-2 min-[960px]:grid-cols-3` renders 2 columns at every width ≥ 640px. Between
  `tablet:`(768) and `desktop:`(1440) use a container query (`@container` + `@[640px]:`, all px).
- **Container queries when one component renders at several widths**: column count = container query, drawer-vs-inline =
  viewport. Per-cell `@container` scales a monetary value to the CELL width, or large amounts overflow.
- **A grid item stretches to the row height, but a normal-flow child does not inherit it without its own `h-full`** —
  side-by-side cards of different content length need `h-full` on BOTH the grid-item wrapper and the card `div`.
- **`sticky` on a grid item needs `self-start`** — the default stretch makes the item as tall as the row, so a
  `sticky top-6` companion column has no room to travel and silently behaves as static.
- **Horizontal page scroll on mobile**: an implicit-`auto`-track grid expands to its widest child — add explicit
  `grid-cols-1` and `min-w-0` on flex/grid children (they default to `min-width:auto`). To center one flex child use
  `self-center`, not `items-center`, which shrinks every child to content width.
- **`document.scrollWidth - clientWidth` reads 0 even while the page scrolls sideways**, which is why this survives
  review. The dashboard shell clips at `SidebarProvider`/`SidebarInset` and puts the page inside `<main class="flex-1
  overflow-y-auto">` — a non-`visible` `overflow-y` computes `overflow-x` to **`auto`**, so **`main` is the horizontal
  scroll container**, not the document. Assert on `main.scrollWidth === main.clientWidth`.
- **Measure the elements, not the container**: walk `main *` and flag any `getBoundingClientRect().right >
  main.getBoundingClientRect().left + main.clientWidth`. `rect.right` is viewport-relative and at 1440 `main` starts
  256px in, so comparing against `clientWidth` alone flags every full-width child as an overflow (the mobile guard
  got away with it only because `main` sits at x=0 there). A total in pixels forces the measurement to be redone;
  the culpable node is the fix. Reference guard: `e2e/fire.mobile.spec.ts`.
- **One scroll container per region**: a nested scrollable captures the wheel and content below becomes unreachable
  (desktop-only symptom). `overflow-x-hidden` on an ancestor also CLIPS a descendant's `overflow-x:auto`.

### shadcn Card and Dialog Surface
- **`CardHeader` is `flex flex-col`**, so a `flex justify-between` row inside it makes a `flex-1` grandchild act
  vertically (`truncate` dies, `shrink-0` siblings get pushed off-screen) — use a plain `<div className="px-4 py-3 flex
  items-start gap-2">`.
- **`ResponsiveModal` is now the ONE modal** (2026-08-31): every surface with a form, a list or a report goes through
  it. Only two things stay a plain primitive — `LogoutDialog`, an `AlertDialog` because it interrupts and wants
  `role="alertdialog"` with the focus on «Annulla», and the popovers, which are not modals. See *Dialog e form
  trasversali* below.
- **`DialogDescription`/`DrawerDescription` is required** in every `DialogContent`/`DrawerContent` (`sr-only` if it
  should not show); never silence the warning with `aria-describedby={undefined}`. `ResponsiveModal` handles it: the
  `reading` becomes the Description through `asChild`, and without one the `description` prop is rendered `sr-only`.

### Layout and Color Tokens
- Never hardcode structural colors in shell components — `bg-background`, `text-foreground`, `border-border`.
- **Sign colors are tokens: `text-positive`/`text-destructive`**, chips `bg-positive/10`, resolved via
  `getMetricValueColor()`. Two gotchas: **drop `dark:` variants** (the token swaps itself) and the function returns
  neutral for the `currency` format by design — signed currency uses `signChipClass`/`signTextClass`. Legacy
  `text-emerald-*` survives in `ExpenseTable`, the dividend dialogs/table and `budgetProgressStyle` (the Tracciamento
  feed retired its own on 2026-08-22).
- **Sign tokens mean gain and loss, and nothing else.** A neutral delta — a class gaining share of a composition — must
  stay `text-muted-foreground`: colouring it asserts a verdict the surface has no target to justify.
- **`--warning` is near-white in light mode**, so text on a `bg-warning` fill MUST be `text-warning-foreground`;
  standalone amber text is a different case (a caution reading uses `text-warning-foreground`, the verdict's dot too).
- **A chart slot is not a text colour** — `--chart-1..8` target ~3:1 against a plot area (`text-[var(--chart-3)]`
  measured 1.02:1 on one theme). The 2026-08-30 tail was audited to the same floor across all twelve blocks (worst case
  3.38:1), so the range is 1..8 and not 1..5. The semantic amber is `--warning-foreground`; only `ExpenseTable`'s chips
  are exempt.
- **Sidebar tokens**: `--sidebar-accent` is a background, `--sidebar-accent-foreground` text ON it; hover on inactive
  items uses `hover:text-sidebar-foreground`. **Inline `style` blocks Tailwind hover variants**, so migrate to classes
  before adding `hover:`/`focus:`.
- **CSS custom properties never reach emails or the PDF** (both render outside the DOM) — the sign hexes there are
  permanently out of sync (CLAUDE.md → Known Issues).

---

## 2. Data and State Patterns

### React Query and Derived State
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
- `AssetDialog`: step 1 picks the type, step 2 shows only that type's fields; edit reuses the same visibility logic and
  shows a ledger asset's quantity/PMC read-only (the ledger owns them). Class select for ETFs, optional `displayTicker`,
  `leverageRatio`, and an opt-in TER only for `etf`/`commodity`/`crypto`.
- **A marker on a label is a claim the validation has to honour.** The asterisk convention here is: `*` = required,
  `(opzionale)` in `text-muted-foreground font-normal` = explicitly optional. Sottocategoria carried BOTH problems at
  once until 2026-08-30 — a zod schema saying `.optional()`, an imperative guard in `onSubmit` that blocked the save,
  and an asterisk whose condition (`availableSubCategories().length > 0`) was NARROWER than the guard's, so a class with
  subcategories enabled and an empty list blocked the save with no marker at all. It is now genuinely optional: the
  guard is gone, the label says `(opzionale)`, the Select carries a «Nessuna» item (`NO_SUB_CATEGORY_VALUE`, since Radix
  reserves `''`), and BOTH write paths clear the field — `updateAsset` for cash/realestate/pensionFund and
  `updateAssetMetadata` for every ledger type, each with the `'subCategory' in updates` guard so a partial caller does
  not wipe a classification it never sent. The allocation consequence is not optional either: see
  *Allocation — `allocationRole`* → the `NO_SUBCATEGORY_LABEL` bucket.
> The default for a form whose fields depend on a discriminant. Keep the two implementations in step.
- **The picker exists because the type is not one field among many** — it decides which categories/classes exist, which
  accounts are asked for, and how many balances move. Step 1 turns *one form with N conditional shapes* into *N plain
  forms*; a discriminant that only re-labels things does NOT earn a step.
- **Create opens on step 1, edit skips to step 2** — changing a saved record's type is a different act, with
  reconciliation consequences the in-form notice must explain, so the `Select` stays there and only there.
- **`setStep(record ? 2 : 1)` is settled during render on the `(open, record)` subject**, never in `useState`'s
  initializer (the record prop stays null between opens and the second "new" would reopen on the form) and, since
  2026-09-06, no longer in the `open` effect either (`react-hooks/set-state-in-effect`).
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
  So when a saved value disappears "sometimes", the first question is *which periodic write targets this document, and
  over which window* — never a TTL. The window is what makes it look intermittent: the snapshot cron rewrites only the
  CURRENT month, so a Storico note on the month in progress died that night while one on a past month lived forever
  (2026-09-07, `preserveUserAuthoredSnapshotFields`, pinned by `__tests__/apiAuthRoutes.test.ts` → *keeps the Storico
  note of the snapshot it overwrites*). Keep the replace and carry the hand-written fields across it; `merge: true` is
  the wrong fix whenever the doc holds a MAP the pipeline recomputes, since merging resurrects keys that should have
  disappeared.

### Firestore Queries and the Rules
- **A `list` must carry the constraint the rule needs, or it is refused entirely.** Every collection guarded by
  `allow read: if canAccess(resource.data.userId)` rejects a query that does not already filter on `userId` —
  `permission-denied` at ANY result size, so it never looks like a scale problem, and a batch built from the empty
  result silently does nothing. `deleteExpensesByImportBatch` is the correct shape. **Unit suites cannot see this** —
  they mock Firestore away; only an emulator exercise driving the CLIENT SDK evaluates the rules.
- **Max 3 `.where()` calls** on a chain that will be unit-tested; a 4th breaks the mock chain.

### Caching
- **Per-user pre-computed cache** (`performance-cache/{userId}`): the key encodes **every** determining input — a hash of
  the WHOLE snapshot series, the base signature, the risk-free rate, the dividend category. TTL fallback (6h) covers what
  the key cannot; reads/writes are `try/catch` fire-and-forget; `Date` ↔ `Timestamp` is field-by-field, never JSON.
- **A changed FORMULA is the one input no signature can see — that is `CACHE_MATH_VERSION`** (`v5`), bumped on any change
  to what the pipeline computes from unchanged inputs. When verifying by hand, press **Aggiorna** (`forceRefresh`) first.
- **Global shared cache** (benchmark, FX, ECB): natural key as doc id, no `userId`, `read: isAuthenticated(); write:
  false`; client `staleTime` = server TTL minus headroom.
- **Schema evolution without a key bump**: add the field as optional and pair it with `?force=true`. Wire "Aggiorna" to
  `refresh()`, never to bare `refetch()`, which receives the same doc.

### Server Layer and API Authorization
- Route = auth → validate → fetch → ownership check → delegate → return; no Firestore queries or business logic in the
  handler body. Firestore rules do not protect Admin SDK calls, so enforce record-level ownership after loading the doc.
- **Owner-scoped routes authorize with `assertCanAccessAccount(decodedToken, ownerUserId)`**, never a fallback to
  `decodedToken.uid`; viewer-scoped routes (sharing management) just read the token uid.
- Server-owned materialized docs are mutated only via a private authenticated route; cron routes use `CRON_SECRET`, and
  `/api/portfolio/snapshot` must keep accepting `cronSecret`.
- **Validation**: `lib/server/validation.ts` owns the reusable schemas and `parseOr400` — never cast with `as { … }`
  first, use `z.coerce.date()` for dates, and validate **Firestore-originated** inputs at the service entry point too.
  Tests that touch a `server-only` module need `vi.mock('server-only', () => ({}))`.
- **`REGISTRATION_WHITELIST` has no `NEXT_PUBLIC_` prefix**, and `lib/constants/appConfig.ts` must stay client-safe.
- **Do NOT bump `firebase-admin` past 13.x** — `@14 → jwks-rsa@4 → jose@6` is pure ESM and Vercel's Lambda runtime
  `require()`s it (`ERR_REQUIRE_ESM` on every Admin route).
- **A `server-only` module is not protected by `tsc`.** Importing `lib/services/dividendService.ts` (Admin SDK) from a
  client page type-checks and dies in the browser as a Next build error («You're importing a module that depends on
  "server-only"»); the browser is the check (2026-09-06, the Rendimenti page's first Playwright run). A client page reads
  such a registry through a client reader — `lib/services/dividendReceiptsService.ts` is the worked example.

### Dynamic Imports and Module Hygiene
- **Components must be at module level** — one defined inside a render body is a new type every render, so React
  remounts it (`AnimatePresence` enter never plays, `useEffect([])` re-fires) and the React Compiler throws.
  **`react-hooks/static-components` flags ANY component obtained from a call during render, a `useMemo(() => lazy(…))`
  included** (probed 2026-09-06): only a property read of a module constant passes, so the icon pickers keep a
  ONE module-level map, `LAZY_CATEGORY_ICONS` in `IconPickerPopover` (shared by the picker, the feed, the drawer and
  the table; `lazy()` registers a thunk, the chunk still loads on demand).
- Pure `lib/utils` modules reach `calculateAssetValue` in one of two established ways — check the precedent: **injected**
  as a `valueOf` param (`allocationUtils`, `pensionFire`) or **imported directly** with the test mocking
  `@/lib/firebase/config` + `firebase/firestore` + `authFetch` + `dashboardOverviewInvalidation`.
- **Functions that call `new Date()` internally are untestable** — pass `now: Date` explicitly. **shadcn vendored surface
  policy**: `components/ui/**` is knip-ignored and standard shadcn API stays even at zero references; only **custom
  additions made in this repo** get deleted.
- **CSS custom property liveness — the 5-check sweep.** A token is live if ANY holds: `var(--name` in `.ts/.tsx/.css`; if
  mapped via `@theme`, the **generated utility name** appears (grep `bg-X`, not the variable); `getPropertyValue`; an
  internal chain; the vendored-surface contract. A confirmed-dead token leaves **every** theme block in one commit.

### Shared Constants and Fixed Hooks
- **Rule of Three**: a map used in 3+ files lives in `lib/constants/<domain>.ts`. The canonical symptom of a duplicated
  `Record<Type, string>` is one copy missing its `dark:` variants — illegible in dark mode with a clean `tsc`.
- **Declare N fixed hook instances with `enabled: false` for the inactive ones — never loop over hooks.**
- **Yahoo module asymmetry**: ETFs use `topHoldings` → `sectorWeightings` (snake_case keys matching `SECTOR_LABELS`),
  stocks use `assetProfile` → a title-case `sector` needing a translation map; the cache key must encode BOTH.

---

## 3. Domain guides

The per-area rules live in `doc/guide/`. Each entry below is the **stub** — the 3–4 things to
know before opening the guide — then the pointer. In code comments and the other docs,
`doc/guide/<f>.md § <name>` resolves to a `##` heading kept verbatim from the section name this
file used to carry.

### Panoramica → `doc/guide/panoramica.md`
- Overview data flows through `GET /api/dashboard/overview` + `useDashboardOverview()` only — no page-level fan-out, no full-history expense queries; `dashboardOverviewSummaries/{userId}` is server-owned and every overview-relevant mutation invalidates it. Both endpoints owner-scoped.
- `topMovers`/`marketEffect` are MARKET return (`q_prev × (u_curr − u_prev)`), never the user's flows; `[]` when the previous snapshot has no `byAsset`, `null` when not attributable (≠ measured 0). Pension funds are their own "Previdenza" line; real estate is measured gross of debt.
- Every sentence from `overviewNarrative.ts` — a falling month blames the market only when `marketEffect < 0`, and never the market ALONE when the estimated tax on the month's sales (`monthSales`, from the ledger) or the own flows weighed more: `resolveDeclineCause` (`lib/utils/periodSales.ts`) is the ONE decision for Panoramica, Patrimonio and the email, `salesNarrative.ts` the shared words («pagato circa …», never «pagherai»).
- Il resto — the hero step-down, the tile grid, the superseded-pattern rule, the Italian-copy test trap — in `doc/guide/panoramica.md`.

### Patrimonio · Asset Pricing, FX and Assets → `doc/guide/patrimonio.md`
- "Does this asset have a market price?" is ONE rule in `assetPricing.ts` (`hasMarketPrice`/`requiresManualPricing`); a new hand-valued type goes in `MANUALLY_VALUED_TYPES` and nowhere else.
- GBp (pence) ≠ GBP — normalize `price / 100` before any FX; never call Frankfurter from the browser; `quantity = 0` marks a sold asset.
- A Borsa Italiana bond quote is `% of par`, always, and `lib/utils/bondPricing.ts` is the ONE conversion (`quote / 100 × nominal × coefficient`): the nominal defaults to **1 €** (quantity = nominal in euro), a BTP€i's quote is real and gets the latest coefficient the user entered. Never re-implement it in a component or the cron; never guard it on `nominal > 1` again (issue #340).
- Patrimonio Δ columns are UNIT-PRICE variations, not P&L; `isHeld` (`quantity > 0`) gates every count/share/sum; the page owns every dialog for one dual invalidation.
- Every number not in the payload is born in `patrimonioSummary.ts`; the verdict's driver is an INSTRUMENT.
- Every G/P, tax estimate, YOC and PMC cell stands EUR against EUR through `lib/utils/costBasisEur.ts` (`costBasisPerUnitEur` = the ledger's `averageCostEur`, fees included; the native PMC only for a EUR asset; `undefined` for a foreign asset without one — print nothing, never dollars against euros).
- Il resto — `suggestIsLiquid`, the cash-account picker rule, the article helpers, the failed-overview branch, the `averageCostEur` backfill — in `doc/guide/patrimonio.md`.

### Asset Trade Ledger → `doc/guide/registro-operazioni.md`
- ALL trade money-math (replay, PMC, realized P&L, XIRR, invested capital) lives in `assetTransactionUtils.ts`, pure; the service/route layer is a thin atomic writer. A new `AssetTransactionType` updates the replay switch, the zod schema AND `TransactionDialog`.
- Writes are Admin-API-only, all reads before any writes, derived fields written in-tx (never via `updateAsset`); ledger-type edits go through `updateAssetMetadata`.
- The migration baseline (`isBaseline` BUY) NEVER stamps `holdingStartDate`; `replayTransactions` returning `holdingStartDate: undefined` means leave the doc untouched (never `deleteField()`).
- Per-transaction derived data comes from `replayTransactionsWithEffects` (one pass), never re-running replay on every prefix.
- `buildDerivedAssetFields` projects `quantity`, the native `averageCost` AND `averageCostEur` (fees included) onto the asset doc; `backfillAverageCostEur` adds the third to pre-existing docs once, writing only that field.
- Il resto — `resolveBondPrice` reuse (from `bondPricing.ts`, a BTP€i trade storing its coefficient), the two `totalReturnAssets` paths, the static-copy audit rule — in `doc/guide/registro-operazioni.md`.

### Cashflow — expense mechanics → `doc/guide/cashflow.md`
- Category names are NOT unique: group by `getCategoryKey`/`getSubCategoryKey`, display via `resolveDisplayLabels`.
- Income positive, expenses negative, `net = sum(income) + sum(expenses)`; classification ALWAYS by `type`, never by the sign of `amount`; crossing the transfer boundary flips the sign and the BATCH paths refuse it.
- A recurring expense is N real future-dated rows sharing `recurringParentId`, not a rule; `canTypeRecur` = `fixed`/`variable`/`debt` only; both `MAX_RECURRENCE_OCCURRENCES` ceilings keep the batch under 500.
- CSV import (`Impostazioni → Spese`): parse→validate→plan, MANDATORY preview, one-tap undo by `importBatchId`; category identity is (name, type). One drill destination (`handleEntitySelect`); Sankey ids are built from ids, the type lives inside the category id.
- Il resto — le sei regole per esteso — in `doc/guide/cashflow.md`.

### Cashflow › Tracciamento → `doc/guide/cashflow-tracciamento.md`
- ONE period axis, two slices: `expenses` feeds the verdict and every tile; `filteredExpenses` feeds ONLY the Movimenti list. Never route a tile through `filteredExpenses`.
- A period is its WHOLE calendar span; what has not happened is DECLARED (`scheduledSentence`, chip «In calendario», sign colour dropped). `isScheduledRow` = after today by Italian calendar DAY (`isItalyDayAfter`), shared with `budgetUtils` and `costCenterSummary`.
- «Da inizio anno» (`Period.kind = 'ytd'`) and «Anno corrente» (`'current'`, full-year delta since 2026-08-30) are different windows and must never be treated as one.
- Every number from `tracciamentoSummary.ts`, every sentence from `cashflowNarrative.ts`. The previous period is honest or absent (a running year → the SAME months of the year before).
- Below `desktop:` the Movimenti tile's bar repeats the period picker beside the filters — a second HANDLE on the same `period`, never a second axis (its own accessible name, `min-w-0`; `e2e/cashflow.mobile.spec.ts`). The tile's reading totals each type of the rows it is handed (a search on a note is its own total).
- «Intestatario» (`lib/utils/movementsOwnerFilter.ts`) is a list filter that exists only with Divisione on — «Tutti · In comune · {members}», «Senza intestatario» only when the period holds an orphaned row — and with the feature on an attributed row prints its owner as a chip (feed, table, drawer); `memberNames` null = feature off = no chip anywhere.
- Il resto — the two windows anchored to today, the month-end projection, the feed, the mobile filters — in `doc/guide/cashflow-tracciamento.md`.

### Analisi — a verdict over tiles → `doc/guide/cashflow-analisi.md`
- FOUR axis modes (`Da inizio anno | Anno corrente | Anno | Storico`); `ytd` and `current` are not the same window.
- A running year is NOT clipped (`periodExpenses` takes the whole calendar year); the pacing always compares year vs year−1 under `sameMonths` off `allExpenses` — the one honest comparison, plus the shared `scheduledSentence`.
- The Scheda is a tile of the grid; every entry point lands through `handleEntitySelect`; URL focus is three FLAT params (`?focusType&focusCat&focusSub`).
- Every number has one source (`analisiSummary.ts`, `comparisonDeltas.ts`); every sentence from `analisiNarrative.ts`/`cashflowNarrative.ts`, never a component.
- Il resto — «Fuori scala», the Periodo pacing, `EntityDossier`, the Sankey rules, Playwright — in `doc/guide/cashflow-analisi.md`.

### Cashflow › Budget → `doc/guide/cashflow-budget.md`
- Opt-in (`reconcileBudgetItems` never auto-creates); NO period axis (always the current Italian month; annual budgets are year-to-date on their own Off-Axis tile).
- ONE projection rule, the app's: `buildSpendingForecast` over the month's spending SPLIT at today (`spendingProjection.ts`, shared with Panoramica/Tracciamento); a FIXED category never follows the pace; `MIN_FORECAST_DAYS` (4).
- Risk vs fact: «Categorie a rischio» = projection over amount AND not over yet; a budget already over is a fact for «Avvisi». No row in two tiles.
- The ceiling IS historicised by the cron (phase 8, one doc per month, `budgetHistory/{uid}/months/{YYYY-MM}`, `allow write: if false`). The crossing day is a fact of the EXPENSE DATES, never a cron's memory.
- Il resto — `summarizeCeiling`, the two-face KPIs on `exceeded`, `BudgetTrack`, the `cashflow:add-budget` event — in `doc/guide/cashflow-budget.md`.

### Centri di Costo → `doc/guide/centri-di-costo.md`
- NO period axis, by decision (2026-08-23): a project's cost is its whole cost; every figure is lifetime («in totale») unless the tile names its window. The old `Mese|Anno|12 mesi|Sempre` picker and its helpers are gone.
- `summarizeCenter` splits rows at today: booked ones are the cost, scheduled ones get an «in calendario» chip, feed every projection and a ceiling's `spent`, and are NEVER summed into the total; a backdated row moves the total AND the crossing day.
- The projection is `projectWindowEndWithScheduled` (`spendingProjection.ts`); a dormant/archived center (`lifecycle !== 'active'`) gets NO projection. A monthly ceiling reuses Budget's `summarizeCeiling`.
- Every number from `costCenterSummary.ts`, every sentence from `costCenterNarrative.ts`. Any count next to a destructive action comes from the same query the mutation runs.
- Il resto — the risk-vs-fact ranking, `CenterStackBars`, session-only lenses — in `doc/guide/centri-di-costo.md`.

### Cashflow › Divisione → `doc/guide/cashflow-divisione.md`
- Opt-in, on Tracciamento's period axis. ONE field carries the feature: `Expense.personalMemberId`; absent (or `null`) MEANS «in comune» (so no migration). Members are Previdenza's `FamilyMember`s, never a second list. NOT denormalized to a name.
- The share is NEVER invented: `resolveSplitBasis` returns `unavailable` (with `missingNames`) below two people, with no labor category, or when one person has no salary in the period; every split figure is then `null`.
- The base is the PERIOD's attributed labor income (owner's decision, 2026-08-31) — the most faithful and most volatile reading; do not «stabilise» it silently.
- `allocateByShare` charges the rounding residual to the LARGEST share and re-rounds — untestable on two shares (they cancel), test on three. Writing it is a FOUR-place fan-out; the readers outside the tab are Tracciamento's «Intestatario» filter and the owner chip (`movementsOwnerFilter.ts`, same contract).
- Il resto — the deleted-member bucket, the dialog control, `effectiveTab` — in `doc/guide/cashflow-divisione.md`.

### Cashflow › Dividendi · Dividends and Coupons → `doc/guide/cashflow-dividendi.md`
- RECEIVED AND ANNOUNCED ARE NEVER ONE FIGURE — counted, totalled and coloured apart on every surface; `summarizePayments` returns two halves and no sum.
- ONE period axis (`resolvePeriodBounds`, upper bound = end of the period's own unit, NOT today); the announced money is ON it; instrument/type filters narrow only the list. The Rendimento tile does NOT follow the axis and says so.
- `useDividendStats` carries NO date bounds (they only narrowed `periodStats`, now derived in memory). Every number from `dividendAnalytics.ts`.
- A coupon's cashflow expense is created only by the daily cron on payment date (`!isAutoGenerated`, idempotent via `expenseId`); adding a `DividendType` is a six-file fan-out; YOC/Current Yield share `computeDividendYieldMetrics`, scoped to the current holding.
- Two inflation mechanisms, ONE field (`inflationIndexation`, read via `resolveInflationIndexation`; the legacy `isInflationLinked` is `italia`): BTP Italia ADDS the FOI rate, a BTP€i MULTIPLIES by the coefficient at the payment date (provisional at the latest known one). A rate of 0 is a zero coupon: details saved, nothing materialised (`hasCouponPayments`).
- Il resto — the calendar, BTP Italia additivity and the BTP€i coefficient, the running-window rule, `couponUtils` — in `doc/guide/cashflow-dividendi.md`.

### Storico · History and Snapshot Baselines → `doc/guide/storico.md`
- The snapshot cron runs DAILY (the name lies); a snapshot is a frozen photo (adding an asset never updates an old one). Annual deltas use December of the previous year as baseline.
- Reuse `byAsset.totalValue` for historical per-instrument value (never recompute); `byAsset.price` is RAW NATIVE currency, so attribution is `priceEffect = q_prev·(u_curr−u_prev)` + `quantityEffect` (sum = Δ exactly).
- Both snapshot writers REPLACE the document, so a new `MonthlySnapshot` field the pipeline does not recompute goes in `SNAPSHOT_USER_AUTHORED_FIELDS` or the daily cron erases it (§ *Firestore Writes*).
- Two CAGR formulas, intentionally different: Storico's verdict = `(endNW/startNW)^(12/months)−1` (wealth growth, «versamenti inclusi»); Rendimenti = investment return. ONE pace for the page (`summarizeGrowthPace`, trailing 12 months, linear); do not compound it.
- The Driver is floored at `cashflowHistoryStartYear`; a running year never counts materialised future rows. «Lavoro e investimenti» measures the Driver's own windows (`laborWindowsOf(driverYears)`, month after the baseline → last snapshot) and returns three causes that add up to the growth — savings from work, other income, market — never a window of its own (it had no right edge until 2026-09-07).
- Il resto — `buildMonthAssetBreakdown`, the manual-snapshot cross-validation, the Recharts-in-a-flex-tile technique — in `doc/guide/storico.md`.

### Hall of Fame — a verdict over tiles → `doc/guide/hall-of-fame.md`
- The page has NO axis and re-derives nothing: `hall-of-fame/{userId}` holds the rankings; "today" is a PARAMETER, never `new Date()` inside the module.
- `hallOfFameRecords.ts` is the ONE definition of a record AND a ranking — both writers and the periodic email call `buildHallOfFameRankings`; never re-implement a ranking.
- A stale document heals only from the page's «Aggiorna» button when the account has no assets (the cron gates on `snapshotResult.success`); disabled in demo. Never document a field as "the cron will fill it in".
- A savings record needs income (`totalIncome > 0` guard); `stats` and the two savings rankings are OPTIONAL on pre-2026-08-25 documents — `getBoard` returns `null` (≠ empty board), never `?? []`.
- Il resto — the podium-vs-chronology split, `NoteTrigger`, the section-key fan-out — in `doc/guide/hall-of-fame.md`.

### Rendimenti → `doc/guide/rendimenti.md`
- Any exclusion read from `byAsset` MUST be backfilled across pre-`byAsset` months (subtract a constant `E₀`) or it becomes a phantom crash — this fixes the DENOMINATOR, not the numerator. The base is resolved ONCE by `resolvePerformanceBase` for its THREE call sites (service, page, PDF); `buildCacheKey` fingerprints its options, entry month and both flow channels.
- The pension toggle WINS over a fund's `allocationRole` (it was an OR, and a no-op on every fund marked `excluded`). ON, the funds enter the base from the tracked month as a FLOW and every later outside contribution is a flow (`CashFlowData.pensionFlow`); `netCashFlow` stays the cashflow's savings. A contribution is a flow iff it crosses the base's boundary.
- **The flows follow the base** (2026-09-07): with anything out of the base, the months with `byAsset` on both snapshots neutralise the MEASURED boundary flows (`lib/utils/portfolioFlows.ts`: ledger first per instrument, quantities as the net, baseline/adjustment move no money, hand-valued instruments opaque) on the third channel `CashFlowData.portfolioFlow`; `externalFlowOf` = `(portfolioFlow ?? netCashFlow) + pensionFlow`. «Liquidità fuori dalla base» (`performanceExcludesCash`) takes the `cash` accounts out by type. The Rendimento tile's second chip is the cumulative TWR (`resolvePeriodReturnChip`), never the ROI.
- The first snapshot of a period is the starting valuation, never a measured month — the window opens on the 1st of the month AFTER it. The page must NEVER re-derive the window from `new Date()` (`metrics.nominalPeriodStart` travels in the payload).
- No silent filters inside a single metric — volatility/Sharpe floor at ≥ 3 monthly returns, else `null` with a reason. Below 6 months the hero is the PERIOD return, not annualized.
- The per-instrument attribution (`performanceAttribution.ts`) is EURO and reconciled: Σ rows + «Non attribuito» = the TWR numerator over the months with `byAsset`; a row at quantity 0 is a closed position (`attributeSelectedChange`). The residual is also read month by month: a month whose unattributed part exceeds `RESIDUAL_ALERT_SHARE` (2%) of its starting base is NAMED in the reading (`residualMonths`) — where to look, never what happened.
- Il resto — EUR-converted benchmarks, drawdown on a geometric TWR index, IRR sign convention, the verdict-over-tiles rules, the heatmap — in `doc/guide/rendimenti.md`.

### Allocazione → `doc/guide/allocazione.md`
- `Asset.allocationRole` is ONE field, THREE values: `tradable` (default), `frozen` (in the denominator, never in the plans), `excluded` (out of the page entirely). No role is ever inferred at read time.
- THE RULE: partition upstream of `compareAllocations`, never downstream (filtering the output breaks `targetValue = target% × totalValue` and the Σ(current − target) = 0 invariant). Do NOT push the filter into `calculateCurrentAllocation` (it also serves `/api/portfolio/snapshot`).
- "Versa" and "Preleva" are ONE tree with the sign flipped; THE ASYMMETRY is the design (buy what you do not own, never sell it). The balance score is band-INDEPENDENT.
- The subcategory is OPTIONAL, so every euro lands in a bucket (`NO_SUBCATEGORY_LABEL`); the orphaned target (`findOrphanedTargets`/`stripOrphanedSubTargets`) is the trap. `ASSET_CLASS_SEQUENCE` is the ONE enumeration of the union — a hand-listed class drops its EUROS, not just its label.
- Il resto — the Bull's formula, the leverage engine, the five label maps, the verdict-over-tiles rules — in `doc/guide/allocazione.md`.

### Previdenza · Fondo Pensione → `doc/guide/previdenza.md`
- `pensionFund` is an `AssetType`, never an `AssetClass`, never a ledger type; value is statement-driven, held in `quantity` at price 1 (`assertFundValueLivesInQuantity`).
- Contributions run on the CLIENT SDK (not an Admin route); `taxYear` (validated ±1 year from `date`) groups every roll-up, never `date.getFullYear()`; contributions never touch spending or savings.
- Three causes of growth, three numbers — never one blended percentage: employer share leaves the TWR (returns in `personalReturn`), TFR is deferred salary (denominator only), the IRPEF saving is its own per-taxpayer card. `isFirstEmploymentPost2007` ON without a full history inflates the plafond.
- The window starts where data is trustworthy (`resolvePensionReturnStart`); a contribution is attributed to the month its VALUE MOVED (`createdAt`). `MonthlySnapshot.pension` is FROZEN at write time.
- A return is a measure only through `isPensionReturnMeasurable`: too high (`isCoverageSuspicious`, missing contributions) OR out of the real (`isCoverageContradictory`: a month at or below zero net of its contributions, a loss beyond 100%, growth with a TWR below −75%) — and `resolveReturnState` reads the contradiction FIRST, because its advice is the opposite of the suspicious one's.
- Il resto — the two tax mechanisms, `overlayLivePensionValue`, the per-contributor return, the verdict-over-tiles rules — in `doc/guide/previdenza.md`.

### FIRE, What If and Goals → `doc/guide/fire.md`
- What If = perturbation + diff, no new projection math; keep the pure layer category-agnostic. Pension unlock is ONE rule in `pensionUnlock.ts` (explicit `now`).
- `respectPensionLockInFire` governs the WHOLE FIRE page: each tab subtracts the locked total AND passes the inflows (subtraction alone reintroduces "sottratto per sempre"). The bridge model reuses the Coast walk, never a second formula.
- The Ventaglio engine mirrors the deterministic walk BY CONSTRUCTION — at zero volatility every path collapses onto the base scenario (the coherence test pins that WITHOUT inflows). `deriveMonteCarloAllocation` is the ONE allocation→4-class normalizer.
- Goal math the server needs lives in `goalMath.ts` (imports `calculateAssetValue` directly); `serializeGoalForFirestore` IS the persistence allowlist; the goal document is rewritten WHOLE, never patched.
- Il resto — each tab computes nothing (numbers from `*Summary`, words from `*Narrative`); config-first collapse; the five verdict-over-tiles sections; Playwright locators — in `doc/guide/fire.md` (pagina e Calcolatore), `fire-coast.md`, `fire-what-if.md`, `fire-monte-carlo.md`, `fire-obiettivi.md`.

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
- The page has NO verdict and must not grow one (a configuration page measures nothing) — it keeps the CADENCE: 22 `describe*` functions in `settingsNarrative.ts`, NO `build*Verdict`.
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
  failed read is checked BEFORE the empty branch, always: every query defaults to `[]`/`undefined`, so a dropped
  connection is byte-identical to a new account.
- `resolveSurfaceState({ loading, failed })` is the ONE decision on which state a surface is in; `loading` wins over
  `failed` (a React Query retry is an attempt, not a verdict). Never `loading || !data`.
- `describeReadFailure` requires its `consequence` (the caller knows what it lost); `canRetry`/`onRetry` travel together.
  A service must not swallow its failure into zeros — an `isError` branch above a service that never rejects is decoration.
- `Skeleton` is the only muted placeholder (`motion-safe:animate-pulse`, `aria-hidden`); a toast's severity is the icon
  and a 2px rule, never a `bg-*/10` surface; a failed WRITE speaks `describeWriteError`, never `(err as Error).message`.
- Il resto — the `compact` reassurance rule, reduced motion vs content, the 20 surfaces and how to add the twenty-first — in `doc/guide/stati.md`.

### Dialog e form trasversali → `doc/guide/dialog.md`
- A modal is a tile lifted off the page (DESIGN.md → The Modal-Is-A-Tile Rule): eyebrow · title 20px · reading · body ·
  footer, all owned by `ResponsiveModal` — a caller passes content, never chrome, and never orders the footer with
  `useMediaQuery`. Four widths and no others: `sm` 420 · `md` 560 · `lg` 720 · `xl` 960.
- The reading IS the status line: `describeModalStatus` + `ModalStatusLine`, ONE stable `role="status"` node that is
  also Radix's `Description` — never swap it for `alert`.
- `describeWriteError` (`lib/utils/dialogNarrative.ts`) is the ONE translation of a failed write; a server sentence
  survives only if the thrower marks it `userFacingError`.
- Two-click confirms live in `lib/hooks/useArmedDelete.ts`: no timer, ever; Escape while armed means DISARM, enforced
  through `hasArmedConfirm()` in `ResponsiveModal`'s `onEscapeKeyDown`. The two form rules stay here: § Dialog Form Reset, § Two-Step Create Dialogs.
- Il resto — the status-line a11y traps, the `bg-muted` summary block, the singular eyebrow, the light-mode «lifted» test trap, the blind spots — in `doc/guide/dialog.md`.

### Settings — the FIVE places → `doc/guide/impostazioni.md`
- A new setting must land in all five or it silently disappears: the type (`types/assets.ts`), the read mapping in
  `assetAllocationService.getSettings`, BOTH write chains in `setSettings` (the `targets` branch is `setDoc` with no
  merge), and the state/load/save/dirty-snapshot wiring wherever the field's own Save button lives. `settingsRoundTrip`'s
  `STORED_SETTINGS` fixture must carry it.
- A user-clearable field has a different shape per branch — `delete docData.x` (no-merge) vs `deleteField()` (merge) —
  guarded by `'x' in settings`, never `x !== undefined`; safe only because `getSettings` returns EVERY key.
- SIXTH place for anything the SERVER reads (`lib/services/dashboardOverviewService.ts`), SEVENTH for the periodic emails
  (`getSettingsAdmin`, `lib/server/monthlyEmailService.ts`); neither is covered by the round-trip.
- Only a hard refresh proves a setting was saved; one Save per page; booleans stored, never derived; a dirty snapshot
  follows the tab that EDITS a field.
- Il resto — la storia dei quattro campi senza guardia, il secondo Salva dei Dividendi, `cashflowHistoryStartYear` condiviso — in `doc/guide/impostazioni.md`.

### Demo Mode · Shared Account / Delegated Access → `doc/guide/account-condiviso-demo.md`
- **Demo**: the landing (`app/page.tsx`) auto-logs into the demo account; `useDemoMode()` (`lib/hooks/useDemoMode.ts`)
  compares `user.uid` with `NEXT_PUBLIC_DEMO_USER_ID` and **gates every mutation** — the account's data is shared by
  every visitor, and the assistant is blocked outright.
- **Viewer vs owner**: `useAuth().user` is the viewer and never changes; `useActiveAccount().ownerId` is whose data is
  displayed. Data-scoped hooks and pages take `ownerId`; `user.uid` stays only for theme, profile, PDF author,
  `useDemoMode` and the sharing UI. Manual `useEffect` loaders include `ownerId` in their deps.
- **Grant model**: `account-access/{ownerUid}` with `memberUids`, read by the rules and the `array-contains` discovery
  query. **Three enforcement layers, kept in sync**: `firestore.rules` (`canAccess(ownerUid)`, `account-access` is
  write:false), `assertCanAccessAccount` on Admin routes, the client substituting `ownerId`. Rules changes are inert until deployed.
- Il resto — il banner demo, il dettaglio per collezione delle rules, lo switcher in Sidebar E `SecondaryMenuDrawer` — in `doc/guide/account-condiviso-demo.md`.

### Color Theme System → `doc/guide/temi.md`
- **Parallel theming**: next-themes owns `.dark`, the custom system owns `data-theme` (`[data-theme="name"]` light,
  `.dark[data-theme="name"]` dark; `ColorThemeContext` inside `AuthProvider`). **The theme is an external store**
  (`useSyncExternalStore` over localStorage, `'default'` as the server snapshot, 2026-09-06).
- **`useChartColors` timing**: `useEffect + useState + requestAnimationFrame`, NOT `useMemo`. **The token you AUTHOR is
  not the token the browser RETURNS**: Turbopack transpiles `oklch()` to `lab(…)`, so never assert `/^oklch\(/` and know
  the luminance fallback is inert there (2026-08-30).
- **A user-chosen identity colour is a SLOT, not a hex** (`'chart-1'..'chart-8'`, `resolveCostCenterColor`): migrate
  without a backfill, derive the no-colour fallback from the document id; indices 0-7 theme-aware, 8-9 static.
- Il resto — il filtro di luminanza oklch, `useActionColors`, i sign token contati per tema, il significato fisso di `--chart-6/7/8`, `getAssetClassCssVar`, la checklist «Adding a theme» — in `doc/guide/temi.md`.

---

## 4. UI Patterns

### Motion
- Shared variants live in `lib/utils/motionVariants.ts`; `useReducedMotion()` is called once per component and used
  inline, with `<MotionConfig reducedMotion="user">` at the layout root — no separate CSS media queries.
- **Page transitions use `template.tsx`, NOT `layout.tsx` + `AnimatePresence`** (it re-mounts on every navigation);
  remove page-level `motion.div variants` wrappers once it is in place (compounded opacity: t²).
- `useCountUp` always with `once: true`, called **before** any conditional early return and unconditionally for both
  branches of a mode switch; it has **no `enabled` option**, so gate the display in JSX. **`layout="position"`, not bare
  `layout`, when a Framer parent wraps a Radix `CollapsibleContent`** — bare `layout` stretches the trigger text.
- **Collapsible technique, by content shape:** nested rows expanding into sub-rows → pure CSS `grid-rows-[0fr] →
  grid-rows-[1fr]` with an `overflow-hidden` child and `inert` on the closed wrapper (Framer + `height:'auto'` left
  revealed rows **stuck at opacity 0**, which looks like missing data); tall or unpredictable sections → Radix
  `<Collapsible>` + CSS transition; small predictable content → `AnimatePresence` + `height:'auto'`. **Always render a
  chevron on an expandable row**; with Radix, `CollapsibleTrigger asChild` propagates `data-state`.
- **An auto-dismiss timer must live in its OWN `useEffect([visible])`** — in an effect that also depends on data props, a
  refetch cancels the timer, the re-run hits the guard without re-arming, and the badge sticks.
- **`react-hooks/set-state-in-effect` — four answers, in this order** (the 36 remaining cases went this way on
  2026-09-06; lint is at zero and stays there): (1) derive it — `useMemo`, or delete the state when it equals a form
  field; (2) store the state WITH its subject (`useState<{ key, value } | null>`, → *React Query and Derived State*);
  (3) settle it DURING render — `const [prev, setPrev] = useState(x); if (prev !== x) { setPrev(x); setDep(…) }`, before
  any early return, dependent state only — which is how every dialog now resets on `(open, record)`; (4) `setTimeout(…, 0)`
  with its cleanup, ONLY for a loader that must raise `loading` before its `await` (the compiler does not model `await`:
  a `setState` before one counts as synchronous). Deferring a dialog's reset paints one frame with the old state and
  hides the real defect. The classic `mounted` guard is banned — `useSyncExternalStore(neverChanges, () => true,
  () => false)` declares the SSR/hydration split in the signature.
- **`react-hooks/refs`: a custom hook must never RETURN a ref inside its object** — every read of that object during
  render (`del.armed`, `del.onClick`) is flagged "Cannot access refs during render". Take the ref as an argument
  (`useArmedDelete(ref, onDelete)`, `lib/hooks/useArmedDelete.ts` — moved there from the budget folder
  on 2026-08-31, when the fourth caller appeared).
- **`react-hooks/preserve-manual-memoization` ("Compilation Skipped")**: the compiler refuses to optimize the whole
  component when a dep array is *more specific* than what it infers — align the dep to the inferred value. The OTHER
  message, "memoized in source but not in output", cannot be aligned away: a `useMemo` whose value never escapes (only
  compared with `!==`, as the settings page's snapshot keys were) is pruned by the compiler — inline the computation.
- **Loading skeleton over spinner** on any page investing in count-up and chart scheduling, with `PageContainer` imported
  inside it or wrapped at the call site. Verify it is wired up — `tsc` does not catch an unused component. Mobile CPU
  budget is ~3-5× tighter, so validate motion in a production build, not `next dev`. The skeleton is a WAIT and never a
  failure (→ `doc/guide/stati.md § Stati: caricamento, vuoto, zero, errore`).
- **Every looping animation carries `motion-safe:`.** Tailwind's `animate-pulse` does not, which is why the app's ONE
  placeholder is `components/ui/skeleton.tsx` and nothing hand-rolls `animate-pulse bg-muted` any more. `animate-spin`
  is the deliberate exception: a spinner IS the "in flight" signal. And a preference for less motion must never remove
  CONTENT — see the `SavingsRateBadge` entry under *Panoramica and Dashboard Data Isolation*.

### Recharts
- **`useChartColors()` is mandatory for every series** — read CSS vars after paint and pass `chartColors[0..4]` as props.
- **Never pass `useChartColors()` to a Nivo/react-spring component**: `@react-spring/web` cannot interpolate hex→oklch
  and throws on load. Sankey node colors stay hardcoded hex; only Recharts is react-spring-free.
- **Three separate tooltip style props, none inherited**: `contentStyle`, `labelStyle`, `itemStyle` — omitting
  `itemStyle` leaves value rows at Recharts' hardcoded colour, invisible on dark. Define all three as module-level `as
  const` objects using `var(--card)`/`var(--border)`/`var(--card-foreground)`.
- **Axis ticks and legends are numbers, so the Mono Mandate covers them — and a Tailwind class cannot reach them.** Pass
  `tick={CHART_TICK_STYLE}` (`fontSize: 11`, `fontFamily: 'var(--font-geist-mono)'`, `fill: 'var(--muted-foreground)'`,
  canonical copy in `costCenterStyles.ts`) on every axis; `<Legend>` needs a `wrapperStyle`.
- **`<Legend content=>` needs a module-level component** — an inline arrow makes a new ref every render and the legend
  flickers on unrelated state. `Legend` reads `<Bar fill>`, not `<Cell>`: always set `fill` on the `<Bar>`.
  **`formatter`'s first param is `ValueType | undefined`** — never type it `number`.
- **Accessibility goes on the chart, not a wrapper**: Recharts 3.x already puts `tabIndex=0` + `role="application"` on its
  `<svg>`, so pass `role="img"` + `aria-label` + `accessibilityLayer={false}` to the chart itself — and `role="img"` also
  hides the `<Legend>`, so the label must carry the colour→name mapping.
- **Never stack bands whose components can go NEGATIVE** — Recharts draws a negative segment downward, so the stack stops
  meeting the total. The shape with no such failure mode is **one area under a line**, decomposition in the tooltip.
  **100%-stacked composition: pre-normalise the rows, do NOT also use `stackOffset="expand"`.**
- **A composition chart without `stackId` is not a bug you can see.** N `<Area>` elements with no `stackId` all render
  from baseline 0, overpainting each other in declaration order, and the overlapping `fillOpacity` invents colours that
  appear in no legend — it looks like a busy chart, not a wrong one. **When the card says "composizione", grep the
  series for `stackId` before reading anything else.**
- **Normalise a 100% stack over what is actually DRAWN, never over a separately-sourced total.** The two disagree in
  both directions (omitted series leave the stack short; a clamped subtraction can push the plotted sum ABOVE the
  total), and `domain={[0,100]}` hides either. `historyComposition.ts` measures its residual against
  `max(total, Σ plotted)` so it can never be negative, and names it as a band instead of leaving a gap. *A stack that
  does not reach 100 reads as missing data, so it must never be how rounding shows.*
- **`fontSize` on `<Legend>` is silently dropped.** The legend renders as HTML, `DefaultLegendContentProps` does not
  declare `fontSize`, and it type-checks only because SVG presentation attributes are merged into the props type. Size the
  legend through `wrapperStyle`.
- **`interval="preserveStartEnd"` centres the last tick ON the plot's right edge**, so half the final label falls outside
  the SVG unless `margin.right` reserves room. A negative `margin.left` clips the `100%` tick to `0%` — a **cropped number
  reads as a wrong number**, which is worse than a missing one.
- **Rolling charts always render**, with an inline empty-state message when data is insufficient, and time-bucketed data
  belongs in a tested pure layer (`cashflowTimeSeries.ts`).
- Server-cached chart data has colors baked into the React Query cache — **remap at render time for EVERY chart array**.
  Positional remap (`chartColors[i]`) is only safe with no cross-page colour identity: asset-class data remaps via
  `ASSET_CLASS_CHART_INDEX[d.assetClass]`.
- A sticky `<thead>` needs a fully opaque token, never an alpha background.

### Navigation
- **Single source for nav arrays**: `lib/constants/navigation.ts` — Sidebar, BottomNavigation and SecondaryMenuDrawer all
  import from it, never redeclare inline. **The assistant is `assistantNavItem`**, a route rendered by the same `NavItems`
  as the groups (gated by `NEXT_PUBLIC_ASSISTANT_AI_ENABLED` at render); there is no banner component to restyle.
- **The shell's label is the tiles' eyebrow**: sidebar group labels, the drawer's section labels and the compact
  `PageHeader` all use `TILE_EYEBROW_CLASS` (`components/ui/tile.tsx`) — on the sidebar surface with
  `text-sidebar-foreground/60`, because `text-muted-foreground` is tuned against `--background`, not `--sidebar`.
  Do not reintroduce a 12px label in the chrome (DESIGN.md → The One-Eyebrow Rule).
- **`PageHeader` defaults to `compact`**; a page not yet propagated must say `variant="legacy"` explicitly or its
  30px title silently becomes a 14px line. The compact title is `text-sm`, so never put an icon sized for the legacy
  title inside it (FIRE's 32px flame was dropped, not shrunk).
- **Icon rail geometry lives in the primitive**: `SIDEBAR_WIDTH_ICON` (3.5rem) and the `group-data-[collapsible=icon]`
  size on `sidebarMenuButtonVariants` (`size-11!`, `p-3.5!`, `justify-center`) are what make every collapsed target
  44×44; `SidebarGroup`/`SidebarHeader`/`SidebarFooter` drop to `p-1.5` in icon mode for the same reason. A custom
  button in the rail (the collapse toggle) needs its own `group-data-[state=collapsed]:size-11`.
- **`PageContainer`** is the 1920px root of a tile page (its only width since 2026-09-06); the loading state must use the same width or
  the page jumps when data lands (the Panoramica's skeleton was 1600 while the page was 1920). The loading state of a
  tile page is `TileGridSkeleton` with the page's own `cells` — never a per-page skeleton component.
- **A shell component that reads `useSearchParams` puts it in a child rendered inside `<Suspense>`** (`AddExpenseFab` in
  `BottomNavigation`): the layout is client-rendered today, but the hook bails static rendering out without a boundary.
- **Sidebar active state for `/dashboard` must be `pathname === item.href`**, never `startsWith`. **Bottom nav is
  portrait-only**, so an in-page button duplicating the FAB must be hidden **only in portrait** — in landscape the FAB
  is gone and it is the only add affordance.

### Hierarchy, Density and Disclosure
> The visual rules themselves are DESIGN.md's; only the implementation traps live here.
- **Never give a "Custom" state a permanent slot in a period selector** — it looks disabled until active; render a
  `rounded-full` chip below the selector only when active. A selector working across multiple return paths uses plain
  `<button role="tab">` + a module-level Framer `layoutId`, not shadcn `<Tabs>`.
- **A cardified mobile view needs its own reading note**: a matrix collapsing to per-row cards has no rows and columns,
  so split the help copy (`hidden desktop:block` / `desktop:hidden`) and label each card's axes explicitly.
- **Prefer rendering large local subtrees as pure render helpers or top-level components** — a nested JSX definition
  inside a page component means a simple row selection remounts the whole table. `cn` is NOT auto-imported in pages.

### Accessibility
- **`title` is not an accessible name** — VoiceOver on iOS ignores it and it never fires on touch. Use `aria-label` for
  icon-only buttons and a Radix `<Popover>` for informational content. **A `title` added by a STATE CHANGE is never shown
  at all** (the tooltip opens on pointer *enter*): put the consequence in visible copy.
- **Touch targets ≥ 44×44px**: `h-8 w-8` in dense lists, `h-10 w-10` for primary and destructive actions (shadcn
  `size="icon"` defaults to 36px). **Actions hidden with `opacity-0` are unreachable on keyboard AND invisible on
  touch** — gate them behind `[@media(pointer:fine)]:` variants.
- **A non-interactive element with `onClick` needs `role="button"`, `tabIndex={0}`, `aria-label`, an Enter/Space
  `onKeyDown` and a focus ring — better still, use a native `<button>`.**
- **Tabs**: `role="tab"` + `aria-selected` inside a `role="tablist"` with an `aria-label`; for a real tab/panel
  relationship also wire `id` + `aria-controls`. An active state with no tab in the tablist (a CUSTOM range) needs a
  `role="status" aria-live="polite"` `sr-only` description instead. **A toggle that shows a panel needs `aria-expanded`
  and `aria-haspopup`**, plus a document-level Escape handler added and removed inside `useEffect([isOpen])`.
- **`aria-live` regions**: streaming content needs `aria-live="polite" aria-atomic="false"` and an `aria-label`.
  **Emptying a live region announces nothing** — a two-click confirm must announce the *disarm* explicitly.
- **Data tables**: every `<thead>` `<th>` needs `scope="col"`, and row-header cells must be `<th scope="row">`.
  **Calendar grids need explicit ARIA rows**: `role="grid"`, `role="row"` per week (the flat 42-cell array must be
  sliced), `role="columnheader"`, `role="gridcell"` per date.
- **Colour-swatch buttons**: never label a swatch with its hex (screen readers spell it out) nor, once theme-resolved,
  with a hue name. Name the **position**: `Colore ${i+1} di ${n}` + `aria-pressed`. **`<Button asChild>` inside
  `<Link>`**, never `<Button>`, which emits `<a><button>`.
- **Two-click confirm: no timer, and not `onBlur` alone.** A 3-second auto-disarm is a WCAG 2.2.1 time limit, and Safari
  does not focus a `<button>` on tap. Use a document `pointerdown` listener with a `ref.contains(target)` guard, plus
  Escape, plus `onBlur`. **Disarm BEFORE delegating** — on success the parent usually unmounts, so nothing resets the
  flag on failure and the next single click fires the destructive action. **Inside a modal, Escape cannot be
  intercepted from the button**: Radix's dismiss layer registers its document listener when the dialog MOUNTS, so it
  runs before any listener added at arm time — capture phase included, and `stopPropagation` never reaches it. The
  hook exports `hasArmedConfirm()` and `ResponsiveModal` calls `preventDefault()` in `onEscapeKeyDown`; without it
  Escape closes the dialog with the row still armed (seen in a browser, 2026-08-31).
- **Form error text needs the sign token too**: `text-red-500` fails AA in both modes on a dialog surface AND diverges
  from `--destructive` on the non-default themes. The dialog sweep of 2026-08-31 retired the last 76 of them; a
  FORM-level failure now belongs to the modal's reading line, not to a paragraph of its own.
- **`PageTabBar` tabs carry `aria-label={label}` unconditionally** (closed 2026-08-22): below 1440px the inactive tabs are
  icon-only, so without it they had no accessible name. Pass `ariaLabel` to `PageTabs` so the tablist is named too.

---

## 5. Testing and Workflow

> Session rules — one branch and one commit per session, no commit without explicit approval, the
> guided-verification protocol — live in **WORKFLOW.md**.

### Commands
- **Phantom `tsc` errors**: `papaparse` and `@playwright/test` are declared but can be missing from the (untracked,
  branch-shared) `node_modules` — the tell is ~25 errors clustered in `e2e/` and `lib/utils/expenseImport.ts` rather
  than in what you touched. Run `npm install` first.
- `npm test -- <file>` / `npx vitest run <file>` for targeted tests; **`npx tsc --noEmit` before any PR**, re-run AFTER
  writing the tests, not only after the code.
- **`npm run lint` is at zero since 2026-09-06 and stays there**: a new `any` gets its real type, a new `eslint-disable`
  is not written. The config ignores `.agents/**` (the plugin's vendored scripts) and the `.next-*/**` dist dirs — a
  Playwright run used to leave ~170 generated-file findings behind.
- **A heavy module graph is a FIXTURE**: hoist a slow `await import()` into `beforeAll` with an explicit timeout (after
  checking nothing is read at module scope, or per-test `vi.resetModules()` was load-bearing). Inside a test body its
  one-time cost lands on whichever case runs first, so the failure moves with the run order and reads as flakiness.
- **A `tsc` that fails only inside `.next/dev/types/validator.ts` (TS1109 "Expression expected") is a half-written
  generated file** left by a dev server killed mid-write: delete that one file, never the whole `.next` of a server
  someone else may be running.
- **A surface with no DOM is verified by RENDERING it** — `tsc` and Vitest see neither a dropped glyph nor an off-token
  colour. PDF: `renderToFile` from `@react-pdf/renderer` under Vitest, inflate the content streams with `zlib`, collect
  every `scn` operand (no colour outside `printTokens`), read the hex text runs (silently dropped characters). Emails:
  open the rendered HTML in Chromium (`chromium.launch()`, `file://`) at 390 / 600 / 1440 and assert
  `documentElement.scrollWidth === clientWidth`. Both are throwaway scripts run from INSIDE the repo (or `playwright`
  and the `@/` alias do not resolve); neither check lives in the suite. **A render with hand-built data proves the
  WORDS, not the data path** (2026-09-07: the Rendimenti section rendered 10/10 with typed-in metrics while the real
  export still ran the base without the ledger — 26,05% against the page's 27,08%): run `fetchPDFData` itself through
  the client SDK on the emulators, with `globalThis.fetch` prefixing the tour server's origin to the relative `/api/…`
  routes the services call, and compare with the page's payload.
- **A trial merge of an open PR runs in a worktree, never in the main checkout** (2026-09-07): fetch the head as
  `refs/pr/<N>`, `git merge --no-commit --no-ff refs/pr/<N>`, then `tsc`, the area suites and eslint, then `git merge
  --abort`. A worktree has no `node_modules`: a directory junction to the main one (`New-Item -ItemType Junction` in
  PowerShell — `cmd //c mklink` is refused by the sandbox), removed with `rmdir`, which drops only the link. Two at a
  time on 16 GB; a conflicting PR is judged on `git merge-tree --write-tree` and `git show <tree>:<path>`, never resolved
  by guessing. **Merging an accepted PR "with changes" means applying its diff to the working tree, not merging its
  commits** (2026-09-07): `git diff base...head > pr.patch`, `git apply --reject`, the rejected hunk redone by hand
  (develop had moved under it), then the session's own fixes on top — one commit, the author as `Co-authored-by`, and
  the review's list of changes visible in the same diff.
- **Run the suite under `TZ=Europe/Rome` too.** Every date fixture is stamped at noon, twelve hours clear of the DST
  edge, so a whole class of timezone bug is structurally invisible — while production dates are **local midnight** and
  the pure layer runs in the user's browser. Compute day-of-year from calendar fields in UTC (`Date.UTC(y,m,d) -
  Date.UTC(y,0,0)`) and add at least one fixture built the way the dialog builds one. Area suites per change:

| Area | Suites |
| --- | --- |
| Overview / materialized summary | `apiAuthRoutes`, `dashboardOverviewService`, `dashboardOverviewUtils` · **Verdetto e letture** `overviewNarrative` · **Badge** `savingsRateBadge` |
| Rendimenti | `performanceService` (+ `performanceBase`, `drawdownSeries`, `cashFlowMap`) · **Attribuzione** `performanceAttribution`, `snapshotAssetBreakdown` · **Verdetto e letture** `performanceNarrative`, `performanceSummaryTiles`, `performanceSummary` (+ `patrimonioNarrative` for the articles) · **Browser** `e2e/performance.degraded.spec.ts` |
| Storico | `storicoSummary`, `storicoNarrative`, `snapshotAssetBreakdown`, `chartService`, `historyComposition` · **FIRE/Goals** `fireService`, `monteCarloService`, `monteCarloSummary`, `monteCarloNarrative`, `goalService`, `goalMath`, `goalProposal`, `coastFireView`, `whatIfService`, `whatIfSummary`, `whatIfNarrative` |
| Assistant | `assistantRoutes`, `assistantWebSearchPolicy`, `assistantMonthContextService` · **Verdetto e letture** `assistantNarrative` (+ `overviewNarrative` for the no-context verdict) · **Obiettivi** `assistantGoalEvaluation`, `assistantGoalEvaluationService`, `assistantMemoryExtraction`, `assistantMemoryStore` · **Goal-Based** `goalMath`, `goalProposal`, `apiAuthRoutes` |
| Dividendi / cron | `dividendUseCase`, `dividendProcessor` · **Email** `monthlyEmailService` |
| Asset / bond | `assetDialogHelpers`, `couponUtils` |
| Cashflow › Budget | `budgetUtils`, `budgetSummary`, `budgetNarrative` (+ `patrimonioNarrative` for the articles, `weeklyBudgetEmailService`, `monthlyEmailService`) |
| Centri di costo | `costCenterSummary`, `costCenterNarrative` (+ `patrimonioNarrative` for the articles, `budgetNarrative` for `dayRef`), `costCenterUtils`, `costCenterColors` |
| Cashflow › Divisione | `expenseSplitSummary`, `expenseSplitNarrative` (+ `cashflowNarrative` for the scheduled clause, `settingsRoundTrip` for the flag) |
| Cashflow › Tracciamento | `tracciamentoSummary`, `cashflowNarrative` (+ `overviewNarrative` for `projectMonthEndSpending`, `patrimonioNarrative` for the articles) |
| Impostazioni | **Letture** `settingsNarrative` · **Round-trip** `settingsRoundTrip` · **Formula** `equityBondsAutoTargets` · **Sblocco** `pensionUnlock` |
| Accesso / Registrazione | **Verdetti, letture ed errori** `authNarrative` · **Policy** `registrationPolicy` (i due devono restare d'accordo sulla precedenza whitelist/flag) |
| Landing pubblica | **Parole** `landingNarrative` · **Invarianti del profilo** `landingSampleData` (+ `authNarrative` per la promessa condivisa e la precedenza registrazioni) |
| Cashflow › Dividendi | `dividendAnalytics`, `dividendiNarrative` (+ `patrimonioNarrative` for the articles) |
| Analisi | `analisiSummary`, `analisiNarrative` (+ `cashflowNarrative` for the shared readings, `patrimonioNarrative` for the articles), `expenseGrouping`, `cashflowSankey`, `cashflowComposition`, `comparisonDeltas`, `expenseEntityStats`, `entitySearch` |
| Transfers / cash | `cashBalanceReconciliation`, `updateCashAssetBalancesAtomic`, `transferFeature` · **Ricorrenze** `recurrenceDates` |
| Allocazione | `allocationUtils` · **Ledger** `assetTransactionUtils`, `assetTransactionsRoutes`, `assetTransactionWriteTx` |
| Fondo pensione | `pensionDeduction`, `pensionContributions`, `pensionReturn`, `pensionContributionService`, `performanceBase`, `pensionFire`, `pensionUnlock`, `pensionFamilyMembers` + the transfer trio · **Verdetto e letture** `pensionSummary`, `pensionNarrative` |

Touching `types/assets.ts`'s `AssetType` also means `assetDialogHelpers` + `allocationUtils` + the three ledger suites;
widening `AssetClass` also means `ASSET_CLASS_SEQUENCE` and everything reading it.

- **`firebase deploy --only firestore:rules` with a stale CLI login fails with a 401 on `serviceusage`**, not with
  "please log in". Fix by the code flow: `npx firebase logout`, `npx firebase login --no-localhost`, open the URL of
  THAT run, `npx firebase login <code>` (a code from an earlier run's URL is refused). Always `npx firebase`.
- `npx knip` uses the root `knip.json`: `components/ui/**` and `public/sw.js` ignored, `firebase-tools` an ignored
  dependency, `ignoreExportsUsedInFile: true` — remaining EXPORT_ONLY findings are deliberate prop surface.
- Emulators, Playwright, production-build verification and their environment traps: **SETUP.md → Steps 6-7**.

### Proving a refactor changed no number
- **Measure the noise floor BEFORE interpreting a diff**: anything downstream of `new Date()` drifts (cents at two
  minutes, ~0,25 € at forty), so two dumps of unchanged code come first and whatever they disagree on is not your change.
  **The valid comparison is old-vs-new MINUTES apart**: `git checkout --` the modified files, delete the new ones, dump,
  restore from a patch (`git diff > …` + `git apply --include=…`, a whole-tree patch fails on files never reverted).
- **Compare the SET of rendered values, not the page text** (a redesign moves everything): every euro amount and
  percentage of the old dump must match one of the new within the noise floor — new values are the feature, missing
  old values the bug. Drive it from a throwaway Playwright spec that opens every collapsible and samples charts by
  hovering at fixed fractions of their width, so figures behind a disclosure or inside a tooltip are captured too.

### Emulator Exercise Scripts
A collection whose value is in the *wiring* gets one: the unit suites mock Firestore away, so only an exercise covers
the rules permitting the writes, real `Timestamp` values surviving `removeUndefinedDeep` and the real atomic transaction.
- **A throwaway is an `.mts` FILE run from INSIDE the repo** (`scripts/*.tmp.mts`, untracked, deleted in phase F): a
  `.ts` script is CJS under tsx with no top-level await (nor has `npx tsx -e`); a bash heredoc with an apostrophe or a
  backtick dies with «unexpected EOF» before running a line (2026-08-25) — and the tracked files are CRLF on a Windows
  clone, so an exact-match patch from a script must normalise `\r\n` before comparing and restore it on write
  (2026-09-07); from the session scratchpad `firebase-admin`
  fails with `ERR_MODULE_NOT_FOUND` and the seed dies silently before the login it was meant to enable. A throwaway
  Playwright spec likewise lives in `e2e/` (it must match a project's `testMatch`), may override the session with
  `test.use({ storageState: { cookies: [], origins: [] }, viewport, deviceScaleFactor, colorScheme })` and log in
  through the form; a README capture hides the Next dev badge first (`page.addStyleTag({ content: 'nextjs-portal {
  display: none !important; }' })`).
- **Drive the mutations through the app's services** (client SDK, rule-evaluated) and the script's own reads and fixture
  edits with the Admin SDK — from an `.mts` file a `doc()` imported there rejects a `db` built here while sign-in still
  works, which makes the failure look unrelated. Verify by **two independent paths** (the expected figure computed in
  the script from the same real snapshots; a same-code-path comparison is circular).
- **On a shared account an exercise cannot pin ABSOLUTE values** (a pension exercise expecting 10.000 read 39.800 —
  another seed's fund was still there): derive the expectation from what is ACTUALLY in the collection, then assert the
  planted record is contained in it. **A throwaway fixture must not share document ids with the seed**
  (`{uid}-{year}-{month}` is the trap): deleting it would delete the seed's rows — re-seed if it happens.
- **A stale `.next-e2e` serves stale CSS as readily as stale routes**: a 404 on a route that exists, or a BRAND-NEW CSS
  custom property reading `''` in the browser while it is in `app/globals.css` (2026-08-30, `--chart-6/7/8`), is that
  cache. Delete the dist dir and restart before doubting your edit; prefer a fresh `NEXT_DIST_DIR=.next-throwaway`
  (keep the `.next-` prefix, what `.gitignore` matches) over someone else's; `next dev` rewrites `tsconfig.json`
  (check it out again) and keeps writing briefly after it is stopped (delete the dir after the process is gone).
- **A Firestore `DELETE` on a missing document answers 200**, so a phase-F cleanup aimed at the wrong collection reports
  success. Know where each write lands: a registration plants `users/{uid}` AND `assetAllocationTargets/{uid}`
  (`setSettings` writes there, NOT to a `settings` collection — verified 2026-08-30); a throwaway account that logs in
  also leaves `dashboardOverviewSummaries/{uid}` (written on the first dashboard visit). Confirm with
  `listCollectionIds` and a `GET` per candidate, then grep the exported `output-0` for the uid before calling the
  restore done.
- **Reading PRODUCTION for a realistic test — read-only, and only this way** (2026-09-06): a throwaway `.mts` inside
  the repo with the Admin SDK initialised from `.env.local` (`import nextEnv from '@next/env'` — it is CJS, the named
  `loadEnvConfig` import fails) that calls nothing but `.get()`; a guard that refuses to run with
  `FIRESTORE_EMULATOR_HOST` set; the dump written to the session scratchpad, never into the repo, and deleted with the
  script. The analysis then runs the REAL pipeline functions over the dump with the client SDK routed to the (down)
  emulators (`NEXT_PUBLIC_USE_FIREBASE_EMULATOR=true` + the demo `NEXT_PUBLIC_FIREBASE_*` vars), so nothing it does
  can reach production. Production data has names with a leading space and rows at quantity 0: `trim()` and
  `quantity > 0` are not hygiene, they are correctness.
- **A production MIRROR in the emulators, for a tour on real data** (2026-09-07): `npm run mirror:seed -- <email>` and
  `npm run mirror:remove` (`scripts/mirrorProdAccount.mts`). Two PROCESSES in one command, never one — the parent reads
  production (the dump rules above: `.get()` only, refuses `FIRESTORE_EMULATOR_HOST`) and spawns itself as a child WITH
  the emulator variables, the dump on its stdin, because the env var is per process and one Admin SDK cannot see both;
  nothing touches the disk. The child re-keys everything to `prod-mirror` (`userId` on every row, the snapshot ids
  `{uid}-{y}-{m}`, the per-user docs), creates `mirror@example.com` / `test1234`, and leaves the caches out so the app
  recomputes with the current math. The account is a standard; the data is removed at the end of the session
  (`MIRROR_UID=… npm run mirror:remove` clears one seeded under another id).
- **Stopping the emulators: export FIRST, then kill.** `--export-on-exit` runs only on a SIGINT delivered to the
  `firebase` CLI process itself: on macOS `kill -INT <cli pid>` does it (2026-09-06); on Windows, where only the wrapper
  can be killed, POST `http://127.0.0.1:4400/_admin/export` with `{"path": "<abs>/.emulator-data"}` (forward slashes —
  a backslashed path 400s; `/emulators/export` 404s), then terminate. **Verify the directory's mtime moved**: a 200 with
  an unchanged mtime is the failure that looks like success.

### Browser-Driven E2E (Playwright)
- **What belongs here**: only what needs a real layout — the `desktop:` switch at 1440px, a collapsible, a state flash,
  computed font sizes, bounding boxes, overflow; the arithmetic stays with Vitest. **Two limits**: a race between
  concurrent queries is not reproducible locally (the Firestore Web SDK multiplexes every target onto ONE webchannel),
  and an error branch is not reachable by cutting the network (the SDK treats an unreachable backend as offline).
- **`workers: 1`, non-negotiable** (the specs share emulator accounts). **Give the suite its OWN fixture**, tuned so the
  thing under test is on screen at all (Analisi dates every expense to January so its figures are exact in any month;
  Coast picks the RITA long-unemployment variant because the ordinary unlock falls past the projection) and say so in
  the file. `e2e/global-setup.ts` runs every seed, in order Previdenza → Coast → degraded → Analisi, on EVERY
  invocation: a new fixture is an `npm run e2e:seed:*` script plus one `spawnSync` there, and a test that patches
  Firestore does it inside the test. **Re-seeding an account mid-suite logs it out** (`auth.updateUser(uid, { password })`
  revokes the refresh tokens and the parked `storageState`): creation once from `global-setup`, data-only per test.
- **`storageState` does NOT capture IndexedDB unless asked** (`{ path, indexedDB: true }`) — the Firebase session lives
  there, the file looks valid and every spec lands on `/login`. **Drive the dev server on `localhost`, never
  `127.0.0.1`**: Next blocks cross-origin dev resources from the bare IP, the page never hydrates and the login form
  submits natively — indistinguishable from a wrong password.
- **Prove the test can fail before trusting it** (the 1440px assertions were re-run at 1200px, where they must fail).
- **Reading the page — the traps, each seen once**: `page.addInitScript` runs BEFORE `document.documentElement` exists
  (observe `document` with `subtree: true`, or the script dies and the spec passes having observed nothing);
  `innerText` applies `text-transform` and is `''` for anything not rendered (an uppercase eyebrow marker or an open
  Recharts tooltip need `textContent`); `boundingBox()` is viewport-relative (`scrollIntoViewIfNeeded()` before hovering
  a chart below the fold) and two calls sample two FRAMES (read every rect one assertion compares in ONE `evaluate()`,
  never during an animation); responsive DOM duplicates make `.first()` the HIDDEN mobile copy (`.filter({ visible:
  true })`); a collapsed CSS-grid region is still "visible" (scope through the toggle's `aria-controls` and measure
  height); a `fill()` right after `goto(…, { waitUntil: 'domcontentloaded' })` is wiped by hydration (`waitUntil:
  'load'`, then `.inputValue()`).
- **Locators — the controls are not buttons** (2026-08-28: read the failure's page snapshot before guessing a second
  selector): the Cashflow picker is a `combobox` named «Periodo selezionato: {label}», `SegmentedPill` options are
  `tab`, the instalment toggle sits behind the «Impostazioni avanzate» disclosure, the two-step create dialog capitalises
  its types («Spesa Variabile»), `CompositionList` rows are `<button role="listitem">` named `"{name}, {value},
  {share}%"`, `PageTabBar` tabs are named at every width but icon-only below 1440px (`getByRole('tab', { name })`, not
  `getByText`). `getByRole(…, { name })` matches SUBSTRINGS («Avvisi» resolves «Avvisi soglia») and `getByLabel` matches
  substrings case-insensitively («Azioni (€)» resolves «Obbligazioni (€)» — a strict-mode violation naming two inputs
  that reads as the field missing, 2026-08-30): pass `exact: true` on every generated field.
- **Numbers on the page**: on the BASE account FIRE figures depend on the RUN MONTH, so a spec there asserts STRUCTURE
  and FORMAT, never amounts; the euro regex must accept ungrouped four-digit amounts,
  `(\d{1,3}(\.\d{3})+|\d{1,4}),\d{2}` (CLDR `minimumGroupingDigits = 2`, the *Italian Localization* trap); Node's
  `Intl` puts a NARROW no-break space (U+202F) before `€`, the browser a plain one (U+00A0) — flatten both sides. A
  decoy-absence check on Cashflow must scope to `[role="tabpanel"][data-state="active"]` — every tab stays mounted
  (`forceMount`) and hidden.
- **Three traps of a tour spec, each seen once (2026-09-07)**: `/dashboard/settings` opens on `?tab=allocazione`, so a
  control of the Generale tile needs `?tab=generale` in the URL or it is never in the DOM; a Recharts legend repeats
  the labels of the rows above it, so `getByText(label, { exact: true })` inside the tile is a strict-mode violation
  (`.first()` — the rows come first); a dev server compiles a route on its first hit and the settings page takes more
  than Playwright's 30s default (`test.setTimeout`), which reads as «element not found» on a page that is still
  compiling.
- **A settings change is only verified by a RELOAD** (2026-08-29: four fields wrote fine and came back old on the next
  load — the form is rebuilt by `getSettings`, the half where the bugs live): drive the UI, save,
  `page.reload({waitUntil: 'load'})`, assert on the INPUTS, and test setting and CLEARING separately.
- **A throwaway spec: own config, right filename, removed by the app, deleted.** The broad `desktop` project collects any
  `*.spec.ts`, so a spec written for its own fixture account fails under the base account in a full run — give it
  `playwright.<name>.config.ts` with its own setup project and a narrow `testMatch`, run with `--config=`, delete it
  before the full suite (2026-08-28). The FILENAME chooses the account: `*.spec.ts` → `desktop`, `*.mobile.spec.ts` →
  `mobile`, `*.degraded.spec.ts` → degraded, and only a name containing `analisi.spec.ts` reaches the Analisi fixture
  (`desktop` carries `testIgnore: /analisi\./`) — a name after what it verifies is not collected, or collected against
  the WRONG fixture. It asserts on Firestore, plants a decoy word absent from the seed, and removes its fixture BY THE
  APP, not by `curl -X DELETE` (2026-08-31: deleting a trade through the ledger's button re-ran the replay a REST delete
  skips), looping the deletion because an earlier failed run may have left its own.
- **Java for the emulators**: a JDK ≥ 21; on macOS the Homebrew OpenJDK is enough with `JAVA_HOME` unset (verified
  2026-09-06); the Windows ritual (Temurin 21, the `javapath` shim, MSYS `PATH`, freeing a held port by PID) is
  SETUP.md → *Local Verification Troubleshooting*. **Ports 8080/9099 answering is not proof that OUR emulators are up**
  (2026-08-27: another repo's suite, `chronostep-9ab39`, took every seed into its own `demo-net-worth` namespace and
  `auth.setup.ts` died on `auth/user-not-found`): read the owner's command line (`Get-CimInstance Win32_Process -Filter
  "ProcessId=<pid>" | select CommandLine`), never kill a foreign suite, and wipe what the seeds left there with
  `DELETE /emulator/v1/projects/demo-net-worth/databases/(default)/documents` and `…/projects/demo-net-worth/accounts`.

---

## 6. Quick-Fix Reference

- **A domain rule copy-pasted into a 3rd file will diverge, and the divergent copy is the one users see**
  (`assetPricing.ts` is the worked example).

### Audit habits
- **An `isError` branch above a service that never rejects is decoration**: a `catch` returning `[]`, `0` or a defaulted
  object turns every failure into a truthful-looking answer (`getAnnualCashflowData` did until 2026-09-01). Read the
  service before wiring a failure state.
- **"Keep" verdicts need the same grep as "Delete" verdicts**, and **a doc comment naming a caller is a claim, not
  evidence — grep it** and fix the comment in the same commit (page docstrings included). **Knip marks a dead chain's
  intermediate links "live"** (the orphan still imports them) and **a function that always returns `[]` keeps its
  downstream pipeline "live"**: trace inward, verify each link, delete the chain in ONE commit.
- **A green check that has never been seen red asserts nothing** — including the check's own arithmetic (a magnitude
  filter meant for axis ticks also drops a legitimate reading). Break the thing under test once. **The fixture can make
  a branch unreachable**: `allocateByShare`'s rounding correction cannot fire on two shares, so a two-person fixture
  stayed green with the branch disabled — when falsification does NOT turn a test red, the test is the bug. **And a test
  can PIN the defect**: `summarizeLaborMetrics` counted the baseline's own month and had no right edge, and both
  behaviours were asserted as expected values (2026-09-07) — a fixture with no row after the last snapshot cannot see a
  missing edge. Put one row past every boundary the function is supposed to have.
- **A fire-and-forget whose `catch` only logs is verified by READING the document it should have written.**
  `writePerformanceCache` had failed on every account with an `undefined` in its metrics (no drawdown, no dividend
  category — the client Firestore rejects `undefined`) with a browser `console.warn` as the only trace; the E2E
  assertion on `performance-cache/{uid}` found it (2026-09-06, `e2e/performance.degraded.spec.ts`). `removeUndefinedDeep`
  before every `setDoc`, like every other write.
- **A spec that edits a document another fixture also writes RESTORES what it read, never deletes** (2026-09-11):
  `cashflow.owner.spec.ts` cleared `familyMembers` on `assetAllocationTargets/test-user-1` in its `finally`, the
  Previdenza seed keeps «Marco» in that same field, and the two pension specs that ran after it failed with a verdict
  missing the name. Read the fields before mutating, put back the value (or `FieldValue.delete()` only if it was
  absent). A fixture ISIN must be one the account never held: `createAsset` re-links onto an existing asset whose
  ISIN already has dividends. And a date planted at LOCAL midnight is 23:00 UTC of the day before — the form stores
  `new Date('YYYY-MM-DD')`, UTC midnight, so every coupon derived from a local-midnight fixture reads the 14th.
- **An assertion of ABSENCE needs a positive anchor first**: `toHaveCount(0)` passes against a page that has not
  rendered. Wait for something expected in both states (a `forceMount` panel: attached, not necessarily visible), then
  assert the absence; a browser check that never saw the feature ON proves nothing about it OFF.

### Per-page blind spots
The "looks like a bug, is not" behaviours live at the end of each `doc/guide/<page>.md` (*Per-page blind spots*,
moved verbatim from CLAUDE.md's Known Issues on 2026-08-28/29/30); read it before "fixing" anything on that page.
CLAUDE.md keeps only the cross-cutting ones.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
