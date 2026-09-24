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
cross-cutting subsystems: `stati`, `dialog`, `temi`, `account-condiviso-demo`, Settings inside `impostazioni`, and
since 2026-09-20 the test harness, `e2e-emulatori`, whose two stubs sit in section 5 under their old names):
open the guide for the area you are about to touch. Each guide opens with a scope line and ends with its
*Per-page blind spots* — behaviours that look like bugs and are not. Section 3 is the index:
the 3–4 things to know before opening each guide, then the pointer — a stub that grows past that is a guide
leaking back (2026-09-20: ten had, up to 2700 characters each). A session-closing lesson about a domain goes in
that domain's guide, never here.

## 1. Conventions

### Italian Localization
- UI text Italian, code comments English. `formatCurrency()`, `formatDate()` (`DD/MM/YYYY`), `Sottocategoria` (no
  hyphen), `Buongiorno Giuseppe` (no comma). English on purpose: `Hall of Fame`, `FIRE e Simulazioni`, `Cashflow`,
  `Assistente AI` and the standard metric names; `Current Yield` → `Rendimento Corrente`.
- **`formatPercentage` exists TWICE and the two disagree**: the it-IT one is `Intl('it-IT')` (`40,71%`),
  `lib/utils/formatters`' `formatPercentage` is `toFixed` (`40.71%`); `formatCurrency` matches in both. Import it from
  the same module the surrounding component uses, or one surface prints both separators. The it-IT implementations
  live in `lib/utils/formatters.ts` as `formatPercentageIt`/`formatNumberIt` and `chartService` DELEGATES to them
  (2026-08-31): `chartService` top-level-imports the client Firebase SDK — the periodic emails would initialise
  `firebase/auth` inside a Lambda to print a percent sign — so **a narrative module the server reads imports from
  `formatters`, never from `chartService`** (`cashflowNarrative`, `patrimonioNarrative` and
  `expenseSplitNarrative` are verified SDK-free; a pure module feeding a screen through `chartService` still mocks the
  Firebase chain in its tests). `formatNumberIt` takes a `decimals` argument and pins the width, `formatters`' own
  `formatNumber` does not. Same rule for any hand-rolled `toFixed` next to an `Intl` number — `aria-label` text
  included, where a dot makes a screen reader announce a different figure from the screen.
- **Curly apostrophes break `.tsx`** (`TS1127`) — delimit with double quotes. **JSX eats the space next to an inline tag
  or wrapped expression** once Prettier breaks the line: write `{' '}` on both sides of `<strong>`/`{expr}`. **An
  `inline-flex` chip drops the leading space of a text-node child too** (each child is a flex item): «69,7%verso FI»
  — give the words their own `<span>` and let `gap-1` space them, `{' '}` does not paint there.
- **Italian `Intl` breaks naive matching**: four-digit amounts print ungrouped (`1821,01 €` but `29.800,00 €`) and the
  `€` carries a non-breaking space. Anchor as `/^821,01[\s ]*€$/`; never concatenate `amount + ' €'`.

### Firebase Dates and Timezone
- `toDate()` to convert; `getItalyMonth()`/`getItalyYear()`/`getItalyMonthYear()` for domain grouping, never
  `Date.getMonth()`/`getFullYear()`. Server "today" window (cron): `getItalyDayBoundsUtc()`.
- **A reader typed `Expense[]` may still hand out raw Timestamps** (2026-09-18: `getExpensesForCostCenter` did, and
  only `getAllExpenses` converted). A page that reads dates through `toDate()` never notices; a row passed on to a
  component fed by the OTHER reader does (`ExpenseDialog` threw «Invalid time value»). Convert in the service.
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
- **`sticky` travels only inside its containing block** (2026-09-22): the compact `PageHeader`'s mobile navbar was
  `sticky top-0` INSIDE a wrapper exactly as tall as itself, so it never stuck — on every page, for months, «Salva»
  scrolled away. Put `sticky` on the box whose parent is the tall one, and prove it by scrolling `main` in a spec
  (`e2e/settings.mobile.spec.ts`).
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
  the culpable node is the fix. Reference guard: `e2e/fire.mobile.spec.ts`. **Exclude `.sr-only` descendants from the
  walk** (2026-09-20): a visually hidden TABLE is clipped to 1px, but its cells keep their geometric rectangles — 69
  «offenders» on Storico with `main.scrollWidth === clientWidth` (`e2e/history.mobile.spec.ts`).
- **One scroll container per region**: a nested scrollable captures the wheel and content below becomes unreachable
  (desktop-only symptom). `overflow-x-hidden` on an ancestor also CLIPS a descendant's `overflow-x:auto`.
- **A `sticky` offset is measured from the scroller's CONTENT edge, padding excluded** (2026-09-14, Strumenti's actions
  column): `sticky right-5` meant to mirror a `-mx-5 px-5` wrapper shifted the column 20px over the last cell of a table
  that did not scroll at all. `right-0`; and draw the edge rule only while `scrollWidth > clientWidth`, measured.
- **An overflow INSIDE a tile never reaches `main`** (2026-09-14, «Entrate per categoria»): neither `Tile` nor a list
  clips, so three percentages painted 37px past the tile's border measured 0 on `main`. Measure a list against its own
  `section` (`e2e/cashflow.tracciamento.spec.ts`), and let a column yield under a container query, not a viewport one.
- **`max-w` on a `td` does not bind an auto-layout table** (2026-09-14, the armed row of the Movimenti table): a long
  sentence in the cell widened the column and the table ran 40px past the tile. Constrain the BLOCK inside the cell.

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
- **A shadcn wrapper's own classes ride through `asChild` and win the merge** (2026-09-14): `DialogDescription`
  hands `text-sm text-muted-foreground` down to the child, and a child that runs `cn(own…, className)` lets
  `tailwind-merge` keep the wrapper's — `ModalStatusLine` was 14px muted in both tones on every modal for two weeks,
  and a font-size utility also drops a `leading-*`. Put the incoming `className` BEFORE the classes that must win,
  and read the result with `getComputedStyle` (a screenshot showed a grey refusal that nobody flagged).

### Layout and Color Tokens
- Never hardcode structural colors in shell components — `bg-background`, `text-foreground`, `border-border`.
- **Sign colors are tokens: `text-positive`/`text-destructive`**, chips `bg-positive/10`, resolved via
  `getMetricValueColor()`. Two gotchas: **drop `dark:` variants** (the token swaps itself) and the function returns
  neutral for the `currency` format by design — signed currency uses `signChipClass`/`signTextClass`. No legacy
  `text-emerald-*` is left in the DOM (the Tracciamento feed retired its own on 2026-08-22, `ExpenseTable` on
  2026-09-14; the dividend dialogs and table were measured at 0 the same day; `budgetProgressStyle` speaks tokens).
- **An expense type has ONE colour map** (`lib/constants/expenseTypeColors.ts`, 2026-09-14): the feed's dot, the
  table's badge and the hero's legend read it. A row's `income` is the sign token `positive`, each outflow a chart
  slot, `fixed` on the slot the flow series paints spending with; the SERIES (bars) take chart slots, never the sign
  token. Three files kept their own map until then and the table's inverted the legend's (`--chart-2` was
  «Entrate» above and «Spese Fisse» below, measured on the mirror).
- **Sign tokens mean gain and loss, and nothing else.** A neutral delta — a class gaining share of a composition — must
  stay `text-muted-foreground`: colouring it asserts a verdict the surface has no target to justify.
- **`--warning` is near-white in light mode**, so text on a `bg-warning` fill MUST be `text-warning-foreground`;
  standalone amber text is a different case (a caution reading uses `text-warning-foreground`, the verdict's dot too).
- **A chart slot is not a text colour** — `--chart-1..8` target ~3:1 against a plot area (`text-[var(--chart-3)]`
  measured 1.02:1 on one theme). The 2026-08-30 tail was audited to the same floor across all twelve blocks (worst case
  3.38:1 — but on 2026-09-18 `--chart-3` light measured 2,74:1 and `--chart-1` dark 2,62:1 ON A CARD: re-measure before
  leaning on that floor, doc/guide/temi.md § Per-page blind spots), so the range is 1..8 and not 1..5. The semantic amber is `--warning-foreground`; only `ExpenseTable`'s chips
  are exempt.
- **A computed custom property comes back as `lab()`, never as the `oklch()` you authored**:
  `getComputedStyle(root).getPropertyValue('--chart-3')` answers `lab(64.8793% 25.0679 78.4211)`.
  `useChartColors` knows this (never assert `/^oklch\(/`); `useActionColors` did not, and its
  legibility clamp matched `/oklch\(/` — so it returned its input on every render and was DEAD
  CODE from the day it was written (2026-09-21, measured in the browser: the page shipped raw chart
  slots as 10-18px text at 2,39-4,02:1 while the docstring promised AA). **Anything that READS a
  colour token parses `lab()` too** — `lib/utils/actionColor.ts` is the worked example, and its
  test feeds it the browser's own serialisation.
- **A chart slot used as TEXT is held to 4,5:1, not to the ~3:1 it was pitched for.**
  `__tests__/actionColorContrast.test.ts` measures COMPRA/VENDI/OK across all twelve theme blocks,
  on `--card` and on the chip's own `color-mix` fill — which is the HARDER surface, because a fill
  mixed from the text's own hue always pulls the background towards the text.
- **Sidebar tokens**: `--sidebar-accent` is a background, `--sidebar-accent-foreground` text ON it; hover on inactive
  items uses `hover:text-sidebar-foreground`. **Inline `style` blocks Tailwind hover variants**, so migrate to classes
  before adding `hover:`/`focus:`.
- **CSS custom properties never reach emails or the PDF** (both render outside the DOM) — the sign hexes there are
  permanently out of sync (doc/guide/email-pdf.md § Per-page blind spots).

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
- **A marker on a label is a claim the validation has to honour.** `*` = required, `(opzionale)` in
  `text-muted-foreground font-normal` = explicitly optional; the zod schema, any imperative guard in `onSubmit` and the
  marker's own condition must agree (2026-08-30: Sottocategoria was `.optional()` in zod, blocked by a guard, and
  starred on a condition — `availableSubCategories().length > 0` — NARROWER than the guard's). It is genuinely optional
  now: the Select carries a «Nessuna» item (`NO_SUB_CATEGORY_VALUE`, since Radix reserves `''`) and BOTH write paths
  clear the field — `updateAsset` for cash/realestate/pensionFund, `updateAssetMetadata` for every ledger type, each
  with the `'subCategory' in updates` guard so a partial caller does not wipe a classification it never sent. The
  allocation consequence is the `NO_SUBCATEGORY_LABEL` bucket: doc/guide/allocazione.md § Allocation — `allocationRole`.
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
  When a saved value disappears "sometimes", ask *which periodic write targets this document, and over which window* —
  never a TTL: the snapshot cron rewrites only the CURRENT month, which is what made it look intermittent (2026-09-07,
  `preserveUserAuthoredSnapshotFields`, pinned by `__tests__/apiAuthRoutes.test.ts` → *keeps the Storico note of the
  snapshot it overwrites*). Keep the replace and carry the hand-written fields across it; `merge: true` is the wrong
  fix whenever the doc holds a MAP the pipeline recomputes, since merging resurrects keys that should have disappeared.

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
- `topMovers`/`marketEffect` are MARKET return, never the user's flows: `[]` when the previous snapshot has no `byAsset`, `null` when not attributable (≠ measured 0).
- Every sentence comes from `overviewNarrative.ts`; a falling month blames the market only when `marketEffect < 0`. `resolveDeclineCause` (`lib/utils/periodSales.ts`) is the ONE decision for Panoramica, Patrimonio and the email (the tax in the headline, 2026-09-13), `resolveTaxedGrowth` its twin for a month that did NOT fall (2026-09-19).
- A driver subject missing from `CLASS_SUBJECTS` drops the clause, never prints itself; the page has no «Dettaglio» of its own.
- Il resto — `salesNarrative.ts` (the shared words), the tax headlines, the month's split, the trade-aware market, the lived savings rate, the category deep link, the hero step-down, the tile grid, the superseded-pattern rule, the Italian-copy test trap — in `doc/guide/panoramica.md`.

### Patrimonio · Asset Pricing, FX and Assets → `doc/guide/patrimonio.md`
- "Does this asset have a market price?" is ONE rule in `assetPricing.ts` (`hasMarketPrice`/`requiresManualPricing`); a new hand-valued type goes in `MANUALLY_VALUED_TYPES` and nowhere else.
- GBp (pence) ≠ GBP — normalize `price / 100` before any FX; never call Frankfurter from the browser; `quantity = 0` marks a sold asset.
- A Borsa Italiana bond quote is `% of par`, always, and `lib/utils/bondPricing.ts` is the ONE conversion (`quote / 100 × nominal × coefficient`, nominal **1 €** by default). Never re-implement it; never guard it on `nominal > 1` again (issue #340).
- Every G/P, tax estimate, YOC and PMC cell stands EUR against EUR through `lib/utils/costBasisEur.ts` (`costBasisPerUnitEur`, fees included); `undefined` without a EUR PMC — print nothing, never dollars against euros.
- Δ columns are UNIT-PRICE variations, not P&L; `isHeld` (`quantity > 0`) gates every count/share/sum; numbers not in the payload are born in `patrimonioSummary.ts`; the page owns every dialog.
- Il resto — BTP€i, the «Andamento» view, `hasCostBasis`, `MIN_ANNUALIZABLE_DAYS`, the instrument driver, `suggestIsLiquid`, the cash-account picker rule, the article helpers, the failed-overview branch, the `averageCostEur` backfill — in `doc/guide/patrimonio.md`.

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
- Il resto — le sei regole per esteso, `linkedCashAssetId` su ogni occorrenza, «Collega la serie», lo schema del transfer e la sua spec — in `doc/guide/cashflow.md`.

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
- Il resto — «Fuori scala», the Periodo pacing, `EntityDossier`, the Sankey rules, Playwright — in `doc/guide/cashflow-analisi.md`.

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
- Every number from `costCenterSummary.ts`, every sentence from `costCenterNarrative.ts`. Any count next to a destructive action comes from the same query the mutation runs.
- Il resto — risk vs fact (`exceeded`/`atRisk`) and the detail's ranking, the retired picker, the backdated row, how the detail lands and refocuses (`data-center-row`), `CenterStackBars`, «Collega spese…», session-only lenses — in `doc/guide/centri-di-costo.md`.

### Cashflow › Divisione → `doc/guide/cashflow-divisione.md`
- Opt-in, on Tracciamento's period axis. ONE field carries the feature: `Expense.personalMemberId`; absent (or `null`) MEANS «in comune» (so no migration). Members are Previdenza's `FamilyMember`s, never a second list. NOT denormalized to a name.
- The share is NEVER invented: `resolveSplitBasis` returns `unavailable` (with `missingNames`) below two people, with no labor category, or when one person has no salary in the period; every split figure is then `null`. Labor income nobody owns is DECLARED (`unattributedSalary`), never dropped.
- A residual is of money that has MOVED: the page prints and colours `remainingBooked`, and where the calendar takes it is a separate clause (2026-09-21). `remaining` is the whole period's.
- The base is the PERIOD's attributed labor income (owner's decision, 2026-08-31) — the most faithful and most volatile reading; do not «stabilise» it silently.
- `allocateByShare` charges the rounding residual to the LARGEST share and re-rounds — untestable on two shares (they cancel), test on three. Writing it is a FOUR-place fan-out; the readers outside the tab are Tracciamento's «Intestatario» filter and the owner chip (`movementsOwnerFilter.ts`, same contract).
- Il resto — the deleted-member bucket, the dialog control, `effectiveTab`, the one-cell people row, the verdict-explains/tile-instructs split, «Attribuisci spese» — in `doc/guide/cashflow-divisione.md`.

### Cashflow › Dividendi · Dividends and Coupons → `doc/guide/cashflow-dividendi.md`
- RECEIVED AND ANNOUNCED ARE NEVER ONE FIGURE — counted, totalled and coloured apart on every surface; `summarizePayments` returns two halves and no sum.
- ONE period axis (`resolvePeriodBounds`, upper bound = end of the period's own unit, NOT today), the announced money ON it; filters narrow only the list; the Rendimento tile does NOT follow the axis and says so. `useDividendStats` carries NO date bounds; every number from `dividendAnalytics.ts`.
- TWO POPULATIONS, BOTH NAMED (2026-09-14): verdict and inventory read the REGISTRY (sold included); Affidabilità and Chi paga di più measure the HELD portfolio (`heldAssetIds`) — never rank a sold payer, never drop its money.
- A coupon's cashflow expense is created only by the daily cron on payment date (`!isAutoGenerated`, idempotent via `expenseId`), and it credits the instrument's account, else the default, ONLY when the payment is not an arrear (`lib/utils/dividendAccount.ts`, 2026-09-20) — row, balance and `expenseId` in one transaction. A scraped dividend has ONE floor (`lib/utils/dividendEligibility.ts`, 2026-09-13), never silent. Adding a `DividendType` is a six-file fan-out.
- Two inflation mechanisms, ONE field (`inflationIndexation`, read via `resolveInflationIndexation`): BTP Italia ADDS the FOI rate, a BTP€i MULTIPLIES by the coefficient. A rate of 0 is a zero coupon (`hasCouponPayments`).
- Il resto — the calendar, the floor's sources and toast, the form (`taxRate` proposal, picker) and the armed row delete, `computeDividendYieldMetrics`, the legacy `isInflationLinked`, provisional coupons, the running-window rule, `couponUtils` — in `doc/guide/cashflow-dividendi.md`.

### Storico · History and Snapshot Baselines → `doc/guide/storico.md`
- The snapshot cron runs DAILY (the name lies) and both writers REPLACE the document: a new `MonthlySnapshot` field no pipeline recomputes goes in `SNAPSHOT_USER_AUTHORED_FIELDS` or the cron erases it (§ *Firestore Writes*).
- Reuse `byAsset.totalValue` for per-instrument history, never recompute; `byAsset.price` is RAW NATIVE currency (EUR unit value = `totalValue / quantity`).
- The page's CAGR is WEALTH growth (`(endNW/startNW)^(12/months)−1`, «versamenti inclusi»), never Rendimenti's return; ONE linear pace (`summarizeGrowthPace`), do not compound it.
- The Driver is SIX parts (`lib/utils/growthDrivers.ts`, 2026-09-19), its market MEASURED per instrument (`marketEffect.ts`) — never «Δ − risparmio»; Lavoro takes the Driver's windows AND parts.
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
- `Asset.allocationRole` is ONE field, THREE values: `tradable` (default), `frozen` (in the denominator, never in the plans), `excluded` (out of the page entirely). No role is ever inferred at read time.
- THE RULE: partition upstream of `compareAllocations`, never downstream (filtering the output breaks `targetValue = target% × totalValue` and the Σ(current − target) = 0 invariant). Do NOT push the filter into `calculateCurrentAllocation` (it also serves `/api/portfolio/snapshot`).
- "Versa" and "Preleva" are ONE tree with the sign flipped; THE ASYMMETRY is the design (buy what you do not own, never sell it). The balance score is band-INDEPENDENT.
- The subcategory is OPTIONAL, so every euro lands in a bucket (`NO_SUBCATEGORY_LABEL`); the orphaned target (`findOrphanedTargets`/`stripOrphanedSubTargets`) is the trap. `ASSET_CLASS_SEQUENCE` is the ONE enumeration of the union — a hand-listed class drops its EUROS, not just its label.
- Ribilancia descends to the INSTRUMENT through the flow plans' own splits (`RebalanceDescent`, 2026-09-21) — a sell through the withdrawal nodes, a buy through the contribution ones, Σchildren === the class amount; never a second algorithm. A plan that sells prices the withholding (`estimatePlanSaleTax`), `null` WITH a reason when a leg has no EUR basis or rate.
- «Prelevare 1000 €» means 1000 € IN HAND: the withdrawal sells the GROSS that leaves the request after the withholding (`solveWithdrawalGross`), a FIXED POINT and never a division by (1 − rate) — the tax follows which instruments the plan drains, and those follow the amount. The leverage engine too: its orders become the same class → instrument tree (a composite split by composition, a same-class swap as two moves).
- A DORMANT class (`isDormantClass`: neither value nor target) keeps its row, loses its verdict and leaves every count — the page reads `activeClassGaps`, never the raw `summarizeClassGaps`.
- A level that repeats the one above it is dropped (`collapseRepeatedLevels`), and which row is an INSTRUMENT is the node's own `isInstrument`, never its depth — a lifted ETF at depth 1 read «→ 100,0%» otherwise.
- Il resto — the Bull's formula, the leverage engine, the five label maps, the action colours' measured lightness band and the `lab()` trap that made the old clamp dead code, the verdict-over-tiles rules — in `doc/guide/allocazione.md`.

### Previdenza · Fondo Pensione → `doc/guide/previdenza.md`
- `pensionFund` is an `AssetType`, never an `AssetClass`, never a ledger type; its value is statement-driven, held in `quantity` at price 1 (`assertFundValueLivesInQuantity`).
- «Aggiorna valore» (`updatePensionFundValue`, 2026-09-13) overwrites the asset only, never a contribution; the value's age is ONE rule, `isPensionValueStale` — never re-derive it in a component.
- Contributions run on the CLIENT SDK; `taxYear` groups every roll-up, never `date.getFullYear()`; contributions never touch spending or savings.
- Three causes of growth, three numbers — never one blended percentage. A contribution belongs to the month its VALUE MOVED (`createdAt`); `MonthlySnapshot.pension` is FROZEN at write time.
- A return is a measure only through `isPensionReturnMeasurable`; `resolveReturnState` reads the contradiction BEFORE the suspicion.
- Il resto — the return's formulas and window (`resolvePensionReturnStart`), the `isFirstEmploymentPost2007` trap, the two coverage guards, `indexPensionSnapshots` and what is deliberately not bounded, the two tax mechanisms, `overlayLivePensionValue`, the per-contributor return, the verdict-over-tiles rules — in `doc/guide/previdenza.md`.

### FIRE, What If and Goals → `doc/guide/fire.md`
- What If = perturbation + diff, no new projection math; keep the pure layer category-agnostic. Pension unlock is ONE rule in `pensionUnlock.ts` (explicit `now`).
- `respectPensionLockInFire` governs the WHOLE FIRE page: each tab subtracts the locked total AND passes the inflows (subtraction alone reintroduces "sottratto per sempre"). The bridge model reuses the Coast walk, never a second formula.
- The Ventaglio engine mirrors the deterministic walk BY CONSTRUCTION — at zero volatility every path collapses onto the base scenario (the coherence test pins that WITHOUT inflows). `deriveMonteCarloAllocation` is the ONE allocation→4-class normalizer. **Year 0 is a year in both walks** (2026-09-22): a target already cleared today is `yearsToFIRE = 0`, rendered as a word («già raggiunto»), never «tra 1 anno». **The fan is seeded and keeps a second ledger** (2026-09-24): `createSeededRandom` gives every lever comparison the same shocks, `retirements` withdraws from each path's own FIRE year without touching `paths`; the Distribuzione view reads `fireYears` by NEAREST-RANK percentiles (`fireDistribution.ts`), never the fan's `floor`. **The requirement is ONE rule, `resolveFireRequirement`** (2026-09-24): expenses less the Coast pensions from their start (dated by the saved age, else OUT and said), × the tax gross-up of `lib/utils/withdrawalTax.ts` (basis from the PMC, cash and funds as basis, `null` without any PMC and said), the fund at its unlock — the walk's `*FireNumber` rows ARE it, the fan's targets are those rows, What If and Coast read the same inputs.
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
- The page has NO verdict and must not grow one (a configuration page measures nothing) — it keeps the CADENCE: 21 `describe*` functions in `settingsNarrative.ts`, NO `build*Verdict`.
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
- A controlled modal with no Radix `Trigger` drops focus on `body` when it closes unless the caller passes
  `returnFocusTo`, taken from `event.currentTarget` at the click (2026-09-20, pinned by `e2e/performance.degraded.spec.ts`).
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
- **`useChartColors` timing**: `useEffect + useState + requestAnimationFrame`, NOT `useMemo`. The browser RETURNS
  `lab(…)`, not the `oklch()` you authored: never assert `/^oklch\(/` (2026-08-30).
- **A user-chosen identity colour is a SLOT, not a hex** (`'chart-1'..'chart-8'`, `resolveCostCenterColor`); indices
  0-8 theme-aware (`--chart-9` is Storico's «Previdenza» band), 9 static.
- **Every theme block is held to the distinctness floor** (`__tests__/chartPaletteDistinctness.test.ts`, all twelve
  since 2026-09-20): nine slots, ΔE00 ≥ 14 between any two. A new theme or a moved slot runs it first.
- Il resto — il filtro di luminanza oklch, gli slot senza backfill, la tinta tenuta tra i due modi, `useActionColors`,
  i sign token per tema, `--chart-6/7/8`, `getAssetClassCssVar`, «Adding a theme» — in `doc/guide/temi.md`.

---

## 4. UI Patterns

### Motion
- Shared variants live in `lib/utils/motionVariants.ts`; `useReducedMotion()` is called once per component and used
  inline, with `<MotionConfig reducedMotion="user">` at the layout root — no separate CSS media queries.
- **Page transitions use `template.tsx`, NOT `layout.tsx` + `AnimatePresence`** (it re-mounts on every navigation);
  remove page-level `motion.div variants` wrappers once it is in place (compounded opacity: t²). **Since 2026-09-12 a
  click on a shell link is a page SCENE** — a native view transition (`lib/hooks/useSceneNavigation.ts` →
  `runViewTransition('page', …)`, whose DOM update resolves when `usePathname()` changes, with a 700 ms guard for a route
  the dev server is still compiling) — and `template.tsx` stands down for that mount (`<html data-vt="page">` read once in
  a `useState` initializer): two fades on one page compound. React 19.2 stable exports no `ViewTransition` and
  `next.config` enables no experimental flag; the native API is the whole mechanism, and a browser without it (Firefox)
  or a reader with reduced motion gets a plain `router.push` and the template's fade.
- **`lib/utils/viewTransition.ts` is the ONE entry to `document.startViewTransition`**, and it stamps `data-vt="theme"` or
  `data-vt="page"` on `<html>` for the length of the transition: every `::view-transition-*` rule in `globals.css` is
  scoped by that attribute. An unscoped `::view-transition-new(root)` rule runs on EVERY transition — the theme's
  circle-clip used to be global and would have clipped every navigation. **A `view-transition-name` must be unique among
  the RENDERED elements of a page**, or the browser skips the whole transition (the update still applies, silently):
  `page-verdict` lives on `PageVerdict` and on the skeleton's verdict block (never both mounted), `page-header` on
  `PageHeader`, `page-main` on the layout's `<main>`; a `forceMount` tab panel is `display: none` and does not count.
  Do not name the tile grid — several pages render more than one.
- `useCountUp` always with `once: true`, called **before** any conditional early return and unconditionally for both
  branches of a mode switch; it has **no `enabled` option**, so gate the display in JSX. **A `fromPrevious` count-up
  passes `landFirstValue`** (2026-09-23): a figure that settles between previews has no previous value on mount, and a
  count from zero there paints «0 €» under a track or a chip already at its share — two readings of one figure. **`layout="position"`, not bare
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
- **A Recharts series CAN drive the page, not just its tooltip — but no page does today**: `onMouseMove` hands
  `activeTooltipIndex` (a number OR a numeric string in 3.x — coerce it) and `onMouseLeave` the end; lift the index's
  PERIOD, never the index (the tiles that follow have their own arrays), attach the handlers only under `(pointer:
  fine)`, and let a pure module resolve what every follower shows. Storico did this for one day (4b0a2dd,
  `storicoScrub.ts`) and the owner retired it on 2026-09-13 (DESIGN.md → The Scrub Rule, retired): the worked example
  lives in `git show 4b0a2dd`, not in the tree. A hand-written SVG that must glide between windows resamples the OLD series onto the new length and tweens per
  index (`lib/hooks/useMorphingSeries.ts`); the hover reads the landed data, never the frame.
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
- **The legend is `SeriesLegend`, never Recharts' `<Legend>`** (`components/ui/series-legend.tsx`, 2026-09-20): `<Legend>` prints each label in its series colour — a chart slot as 11px TEXT measured 3,64 · 4,02 · 2,62:1 — and names its icons in English («… legend icon»). One entry per SERIES: a bar that turns red under the baseline is one entry with two swatches, not a fourth series. **One word, one colour per page**: a series named «Mercato» takes the slot «Mercato» has everywhere else on that page, whatever its position in the chart (`LaborMetricsChart` gave it `--chart-5` beside a Driver that paints it `--chart-1`); a reference series that is not a part of the total takes the neutral ink, dashed.
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
- **A `PageTabs` panel names ITSELF** (2026-09-21): `PageTabBar` renders plain buttons, not Radix
  `TabsTrigger`s, so every `TabsContent` was born with an `aria-labelledby` naming a trigger id that
  does not exist and had an EMPTY accessible name. A panel takes `id={pageTabPanelId(layoutId,
  value)}`, an `aria-label`, and `aria-labelledby={undefined}` to drop Radix's own; the tabs take
  `aria-controls` through `renderedPanels`, which a page with lazily mounted panels must pass — an
  `aria-controls` naming a panel that was never opened is the same dangling reference from the other
  end. Pinned by `e2e/cashflow.split.spec.ts`.
- **An inactive `PageTabs` panel keeps its `div`, not its CONTENT** (2026-09-22): Radix renders the panel (so its id
  and `aria-controls` survive) but unmounts the children, so a field of another tab is not in the DOM and a spec
  anchors on the OPENED panel (`#<layoutId>-panel-<tab> section`), never on a tile of a tab that is not showing.
- **Single source for nav arrays**: `lib/constants/navigation.ts` — Sidebar, BottomNavigation and SecondaryMenuDrawer all
  import from it, never redeclare inline. **A route link in the shell is a `SceneLink`** (`components/layout/SceneLink.tsx`,
  a `next/link` whose plain left click runs the page scene — prefetch, modifier clicks, `target` and the caller's own
  `onClick` are untouched); a bare `<Link>` there navigates without the scene. **The assistant is `assistantNavItem`**, a route rendered by the same `NavItems`
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
- **`PageHeader` mounts its `actions` TWICE** (desktop row, phone navbar): a `ref` on an action lands on whichever
  copy mounted last and `querySelector` finds the HIDDEN one first (width 0, 2026-09-18). Take the pressed node from
  `event.currentTarget` (`app/dashboard/page.tsx`, «Crea snapshot»); measure the copy with `offsetWidth > 0`.
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
- **A radius on the element that carries a `divide-y` hairline bends the ends of the rule** (2026-09-18,
  `AssistantThreadList`): the `li` stays square, the hover/selected wash goes on an inner box.
- **A tile's footer is ONE line; the method goes behind «Come si calcola»** (`components/ui/tile-method-note.tsx`, 2026-09-20): help printed on every tile at all times stops being read, and an 11px footnote at full tile width runs to 95–130 characters a line (the detector's `line-length`). The line that stays says what the figures ARE; name the trigger after its subject — a page carries several. **A list that must add up adds up ON SCREEN**: round every row to the printed unit and give the drift to the row that is a remainder by definition, or the reader who checks it finds a euro missing.
- **A tile stretched beside a taller neighbour is cured in the GRID, never in the tile** (2026-09-20, Rendimenti): moving eight method footers behind «Come si calcola» made the voids BIGGER (Benchmark ~170 → ~215px, Plusvalenze ~280 → ~380px). Tiles share a row only with tiles of their own height; below that row use two columns at natural height — wrappers `contents` below `desktop:`, `desktop:flex desktop:flex-col` from it — and let the ONE element that can be any height (a chart, `desktop:flex-1`) take the slack. Keep the DOM in the desktop order so Tab follows the eye; the phone re-orders with `order-*` (Storico and Rendimenti are the worked examples).
- **A row's caption WRAPS, it is never truncated, and the label column never grows to make room for it** (2026-09-14,
  `RankedRows`): «30 set · Asilo nido · in calendario» is the row's second fact, and a cut fact is no fact. The column
  cannot grow — at 4 grid columns 46% is the most it can take beside the bar's 40px floor, the amount and the share
  (58% painted the share outside the tile, measured) — so the caption takes a second line (`line-clamp-2`) instead.

### Accessibility
- **`title` is not an accessible name** — VoiceOver on iOS ignores it and it never fires on touch. Use `aria-label` for
  icon-only buttons and a Radix `<Popover>` for informational content. **A `title` added by a STATE CHANGE is never shown
  at all** (the tooltip opens on pointer *enter*): put the consequence in visible copy.
- **Touch targets ≥ 44×44px**: `h-8 w-8` in dense lists, `h-10 w-10` for primary and destructive actions (shadcn
  `size="icon"` defaults to 36px). **Actions hidden with `opacity-0` are unreachable on keyboard AND invisible on
  touch** — gate them behind `[@media(pointer:fine)]:` variants.
- **A non-interactive element with `onClick` needs `role="button"`, `tabIndex={0}`, `aria-label`, an Enter/Space
  `onKeyDown` and a focus ring — better still, use a native `<button>`.** **But an `aria-label` on a
  `role="button"` REPLACES its contents**: the row of Allocazione's Per classe carried «Espandi Azioni» and a screen
  reader therefore heard eight class names and not one percentage, on the tile that IS that page's data table
  (2026-09-21). When the element's own text is the information, it must BE the accessible name — the
  expand/collapse wording moves onto the chevron as `sr-only` text. An `aria-label` is for a control whose content
  says nothing (an icon), never for one whose content is the point.
- **Tabs**: `role="tab"` + `aria-selected` inside a `role="tablist"` with an `aria-label`; for a real tab/panel
  relationship also wire `id` + `aria-controls`. **A `SegmentedPill` that picks a VALUE the whole page reads (an axis
  year, a period) is `semantics="radio"`** — a tablist with no tabpanel is a promise the DOM cannot keep; `tabs` only
  where the pill switches a panel (2026-09-13, Previdenza and the Panoramica's sparkline period; 2026-09-14 the
  Dividendi axis, which was a `SegmentedControl` with no arrows and 4,35:1 in light; the other pills stay `tabs`
  until each is reviewed). The primitive's inactive label is `text-foreground/70`, not `text-muted-foreground`,
  which is tuned against `--background` and measured 4,34:1 on the pill's `bg-muted` in light.
  **A tile's `ariaLabel` is its visible eyebrow, year included** (`Anno fiscale 2026`, never `Anno fiscale`): a name
  shorter than the label is what a screen reader hears while a sighted reader sees more (WCAG 2.5.3) — Playwright
  locates it with a regex, never by shaping the name around `exact: true`. An active state with no tab in the tablist (a CUSTOM range) needs a
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
  Escape closes the dialog with the row still armed (seen in a browser, 2026-08-31). **The armed button stays a
  compact «Conferma» and the ROW prints the consequence** («eliminando, il conto verrà riaccreditato», in the hint
  cell, `text-destructive`): a sentence inside the button wraps in a 90px action column (owner's tour, 2026-09-13,
  `VersamentiTile`). **One live region per list, not per row** — a `role="status"` per `DeleteButton` made a
  keyboard reader hear «Eliminazione annullata» on every Tab away from an armed button.
- **A list of same-kind controls is ONE Tab stop** (`lib/hooks/useRovingFocus.ts`, 2026-09-20): 24 row checkboxes put «Dettaglio» ~55 Tabs from the top of Storico. Spread `containerProps` on the wrapper and `itemProps(i)` on each control (arrows, Home/End; the hook finds its items through `data-roving-item` and hands out no ref), and say it once in an `sr-only` hint the table is `aria-describedby`. **The dashboard's first Tab stop is «Vai al contenuto principale»** (`app/dashboard/layout.tsx` → `#page-main`, `tabIndex={-1}` on `<main>`), and **a tile's eyebrow is an `<h3>`** under the verdict's `<h2>` (`components/ui/tile.tsx`): a page of nine tiles listed two headings. A spec that starts a keyboard walk presses Tab right after the load — a click on `body` moves the sequential-focus start past the skip link.
- **`desktop:h-7` is 28px — never for a target.** `AsideToggle` is `desktop:h-8` since 2026-09-20. The `h-11 → desktop:h-8` idiom (44 → 32, the dense-list floor
  above) is the one to copy; four Previdenza sites shipped 28px until 2026-09-13, and a 1440px tablet in landscape
  reads the desktop layout by touch (CLAUDE.md → Known Issues).
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
- **Never `git checkout <file>` to undo ONE edit on uncommitted work** (2026-09-24): it restores the COMMITTED file and
  silently throws away the whole session's rewrite of it — the dev server then failed to build and a full Vitest run
  had 17 reds before anyone noticed. A falsification is undone with the same tool that made it (the one line back),
  and `tsc` runs again before the next suite.
- **`npm run lint` is at zero since 2026-09-06 and stays there**: a new `any` gets its real type, a new `eslint-disable`
  is not written. The config ignores `.agents/**` (the plugin's vendored scripts) and the `.next-*/**` dist dirs — a
  Playwright run used to leave ~170 generated-file findings behind.
- **A heavy module graph is a FIXTURE**: hoist a slow `await import()` into `beforeAll` with an explicit timeout (after
  checking nothing is read at module scope, or per-test `vi.resetModules()` was load-bearing). Inside a test body its
  one-time cost lands on whichever case runs first, so the failure moves with the run order and reads as flakiness.
- **A `tsc` that fails only inside `.next/dev/types/validator.ts` (TS1109 "Expression expected") is a half-written
  generated file** left by a dev server killed mid-write: delete that one file, never the whole `.next` of a server
  someone else may be running. The Playwright server leaves the same in `.next-e2e/dev/types/` (2026-09-20:
  `routes.d.ts` TS1434, then `validator.ts` missing `./routes.js` once it is gone) — there the `types` directory goes
  whole: it is generated, and that server is the suite's alone.
- **A surface with no DOM is verified by RENDERING it** — `tsc` and Vitest see neither a dropped glyph nor an off-token
  colour: the PDF through `renderToFile` under Vitest (every `scn` operand, the hex text runs), the emails in Chromium
  at 390 / 600 / 1440; throwaway scripts run from INSIDE the repo, neither in the suite. **A render with hand-built
  data proves the WORDS, not the data path** (2026-09-07): run `fetchPDFData` itself on the emulators. The recipe is
  doc/guide/email-pdf.md § Verifying a surface with no DOM.
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
| Storico | `storicoSummary`, `storicoNarrative`, `snapshotAssetBreakdown`, `chartService`, `historyComposition`, `growthDrivers` · **Browser** `e2e/history{,.mobile}.spec.ts` · **FIRE/Goals** `fireService`, `monteCarloService`, `monteCarloSummary`, `monteCarloNarrative`, `goalService`, `goalMath`, `goalProposal`, `coastFireView`, `whatIfService`, `whatIfSummary`, `whatIfNarrative` |
| Assistant | `assistantRoutes`, `assistantWebSearchPolicy`, `assistantMonthContextService` · **Verdetto e letture** `assistantNarrative` (+ `overviewNarrative` for the no-context verdict) · **Obiettivi** `assistantGoalEvaluation`, `assistantGoalEvaluationService`, `assistantMemoryExtraction`, `assistantMemoryStore` · **Goal-Based** `goalMath`, `goalProposal`, `apiAuthRoutes` |
| Dividendi / cron | `dividendUseCase`, `dividendProcessor`, `dividendAccount`, `dividendIncomeService` · **Email** `monthlyEmailService` |
| Asset / bond | `assetDialogHelpers`, `couponUtils` |
| Cashflow › Budget | `budgetUtils`, `budgetSummary`, `budgetNarrative` (+ `patrimonioNarrative` for the articles, `weeklyBudgetEmailService`, `monthlyEmailService`) |
| Centri di costo | `costCenterSummary`, `costCenterNarrative` (+ `patrimonioNarrative` for the articles, `budgetNarrative` for `dayRef`), `costCenterUtils`, `costCenterColors` · **Browser** `e2e/cashflow.centri{,.mobile}.spec.ts` (own account, `npm run e2e:seed:centri`) |
| Cashflow › Divisione | `expenseSplitSummary`, `expenseSplitNarrative` (+ `cashflowNarrative` for the scheduled clause, `settingsRoundTrip` for the flag) · **Browser** `e2e/cashflow.split{,.mobile}.spec.ts` (own account, `npm run e2e:seed:split`) |
| Cashflow › Tracciamento | `tracciamentoSummary`, `cashflowNarrative` (+ `overviewNarrative` for `projectMonthEndSpending`, `patrimonioNarrative` for the articles) |
| Impostazioni | **Letture** `settingsNarrative` · **Round-trip** `settingsRoundTrip` · **Formula** `equityBondsAutoTargets` · **Sblocco** `pensionUnlock` |
| Accesso / Registrazione | **Verdetti, letture ed errori** `authNarrative` · **Policy** `registrationPolicy` (i due devono restare d'accordo sulla precedenza whitelist/flag) |
| Landing pubblica | **Parole** `landingNarrative` · **Invarianti del profilo** `landingSampleData` (+ `authNarrative` per la promessa condivisa e la precedenza registrazioni) |
| Cashflow › Dividendi | `dividendAnalytics`, `dividendiNarrative` (+ `patrimonioNarrative` for the articles) |
| Analisi | `analisiSummary`, `analisiNarrative` (+ `cashflowNarrative` for the shared readings, `patrimonioNarrative` for the articles), `expenseGrouping`, `cashflowSankey`, `cashflowComposition`, `comparisonDeltas`, `expenseEntityStats`, `entitySearch` |
| Transfers / cash | `cashBalanceReconciliation`, `updateCashAssetBalancesAtomic`, `transferFeature` · **Ricorrenze** `recurrenceDates` |
| Allocazione | `allocationUtils`, `allocazioneSummary`, `allocazioneNarrative` · **Tinte d'azione** `actionColorContrast` (dodici blocchi tema) · **Browser** `e2e/allocation.spec.ts` · **Ledger** `assetTransactionUtils`, `assetTransactionsRoutes`, `assetTransactionWriteTx`, `saleTax`, `cents`, `periodSales` · **Browser** `e2e/assets.sale-tax.spec.ts` |
| Fondo pensione | `pensionDeduction`, `pensionContributions`, `pensionReturn`, `pensionContributionService`, `performanceBase`, `pensionFire`, `pensionUnlock`, `pensionFamilyMembers` + the transfer trio · **Verdetto e letture** `pensionSummary`, `pensionNarrative` |

Touching `types/assets.ts`'s `AssetType` also means `assetDialogHelpers` + `allocationUtils` + the three ledger suites;
widening `AssetClass` also means `ASSET_CLASS_SEQUENCE` and everything reading it.

- **`firebase deploy --only firestore:rules` with a stale CLI login fails with a 401 on `serviceusage`**, not with
  "please log in". Fix by the code flow: `npx firebase logout`, `npx firebase login --no-localhost`, open the URL of
  THAT run, `npx firebase login <code>` (a code from an earlier run's URL is refused). Always `npx firebase`.
- `npx knip` uses the root `knip.json`: `components/ui/**` and `public/sw.js` ignored, `firebase-tools` an ignored
  dependency, `ignoreExportsUsedInFile: true` — remaining EXPORT_ONLY findings are deliberate prop surface.
- Emulators, Playwright, production-build verification and their environment traps: **SETUP.md → Steps 6-7**.

### Emulator Exercise Scripts → `doc/guide/e2e-emulatori.md`
- A collection whose value is in the *wiring* gets an exercise: the unit suites mock Firestore away, so only an exercise
  covers the rules, real `Timestamp` values through `removeUndefinedDeep` and the real atomic transaction.
- **A throwaway is an `.mts` FILE run from INSIDE the repo** (`scripts/*.tmp.mts`, untracked, deleted in phase F): a
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
- Il resto — the page-reading traps (`addInitScript`, `innerText`, `boundingBox`, hidden mobile duplicates, hydration
  wiping a `fill()`), the vaul drawer after Escape, locators that are not buttons and substring matching (`exact: true`),
  the euro regex and U+202F, forcing a server flag on the response, the settings reload rule, the armed two-click
  confirm, the three tour-spec traps, Java ≥ 21 and foreign emulators on 8080/9099 — in `doc/guide/e2e-emulatori.md`.

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
  filter meant for axis ticks also drops a legitimate reading). Break the thing under test once.
  **And when a falsification stays GREEN, find which line actually holds the property and say so in the test**
  (2026-09-21, three cases in one session): a sell that descends on the uncapped gap reconciles anyway because
  `splitFromSurplus` re-caps at the capacity; a plan's `Math.max(0, gainFraction)` is inert because `estimateSaleTax`
  already floors a loss; removing `itemProps` from `AsideToggle` does not add Tab stops because the explicit
  `tabIndex` beside it holds them. Naming the load-bearing line is the point: otherwise the next reader deletes it as
  dead code and the test stays green through the regression. **And the ASSERTION can be
  the inert one** (2026-09-21, the monthly email's split tile): `expect(html).toContain('1400')` passes whatever the
  amount cell says, because the caption two lines below prints the same figure — the test only went red once it read
  the `<td align="right">` cells. When a falsification stays green, suspect the assertion's ANCHOR before the code.
  **The fixture can make
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
- **A spec that edits a document another fixture also writes RESTORES what it read, never deletes** (2026-09-11,
  `cashflow.owner.spec.ts` against the Previdenza seed's `familyMembers`); a fixture ISIN is one the account never
  held, and a fixture date is UTC midnight like the form's, never local midnight. The three cases:
  doc/guide/e2e-emulatori.md § Browser-Driven E2E (Playwright).
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
