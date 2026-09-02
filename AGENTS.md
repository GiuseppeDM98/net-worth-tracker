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
in `doc/guide/<tema>.md`** (one file per page, tab, integration or subsystem): open the guide
for the area you are about to touch. Each guide opens with a scope line and ends with its
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
- The reset `useEffect` must include `open` in its deps and start with `if (!open) return`.
- The new-record branch must enumerate **every** field, optional ones included, and call `replaceTiers([])` — `reset()`
  does not clear field arrays.
- **`useWatch()` for render, `getValues()` for handlers — never `watch()`** (incompatible with the React Compiler, which
  then skips the whole component).

### Stati: caricamento, vuoto, zero, errore (`lib/utils/statesNarrative.ts`, `components/ui/{skeleton,empty-state,error-notice}.tsx`)
- **An absence has three names, and they are not interchangeable** (DESIGN.md → The Absence-Has-Three-Names Rule):
  `missing` (nothing recorded) · `zero` (something is, and it is zero) · `failed` (the read did not happen). The
  `AbsenceKind` union in `statesNarrative.ts` exists so a component cannot collapse them into a boolean.
- **`resolveSurfaceState({ loading, failed })` is the ONE decision on which of the four states a surface is in**, and
  `loading` wins over `failed` because React Query re-enters `isLoading` while it retries — a retry is an attempt, not
  a verdict. What it exists to stop is `loading || !data`, the collapse that made the Panoramica pulse **forever** on a
  failed read (fixed 2026-09-01); the E2E probe that catches it asserts the skeleton's `role="status"` is GONE once the
  alert is up.
- **A failed read is checked BEFORE the empty branch, always.** Every query in this app defaults to `[]` or
  `undefined`, so a dropped connection is byte-identical to a new account — and the empty branch would then print a
  verdict about a set that was never read («non hai nessun centro di costo», to someone with eight).
- **`describeReadFailure` requires its `consequence`.** There is no generic fallback on purpose: a shared module does
  not know the Italian agreement of a subject it was handed («Classi non è stato letto» is wrong), and a sentence that
  claims nothing is worse than no sentence. The caller knows what it lost. `untouched` is optional and defaults to
  «Nessun dato registrato è stato toccato»; `canRetry` and `onRetry` travel together, so no button is ever offered
  that does nothing.
- **The reassurance is said once per page**: `compact` drops it inside a cell of 4 columns or fewer, because three
  lines in a 3/12 cell make the notice taller than the tiles beside it. On a page where several queries fail together
  at least one of them is wide, so the sentence survives.
- **A service must not swallow its own failure into zeros.** `getAnnualCashflowData` did (a `catch` returning
  `annualSavings: 0`), which meant the FIRE calculator answered a dropped connection with «servono spese registrate
  nel Cashflow» — a sentence about the reader's data, told about data nobody read. It rejects now; both its callers
  hold an `ErrorNotice` branch that only a rejection can reach. When wiring a new surface, check the service too: an
  `isError` branch above a service that never rejects is decoration.
- **`Skeleton` (`components/ui/skeleton.tsx`) is the only muted placeholder.** `motion-safe:animate-pulse` — Tailwind's
  bare `animate-pulse` has no reduced-motion guard, and it was hand-written in eight files at six different heights —
  and `aria-hidden`, so the wait is announced once by `TileGridSkeleton`'s `role="status"`. `animate-spin` is
  deliberately left alone: a spinner IS the "in flight" signal, and at 16px it is not the vestibular problem the
  preference is about.
- **Reduced motion reduces the MOTION, not the content.** `shouldShowSavingsBadge` used to take `reducedMotion` as a
  show condition, so a reader who had asked the OS for stillness was never told their savings rate. It now governs the
  entrance transition only, in the component. The two remaining `shouldReduceMotion()` callers gate CONFETTI, which is
  motion carrying nothing — those are correct as they are.
- **A toast's severity is the icon and a 2px leading rule, never the surface.** Sonner maps `--normal-bg` for every
  type, so before this an error and a success were the same grey tile with a different 16px glyph. The tint variant was
  rejected: `bg-*/10` washes the fill with the text's own hue and this project already records those combinations as
  structurally below AA.
- **A failed WRITE speaks `describeWriteError`, on a toast exactly as in a modal.** Thirteen call sites passed
  `(err as Error).message` straight through — the thing that module exists to prevent. Where the message really is the
  product's own Italian (the assistant hooks' `payload?.error ?? '<italiano>'`), the throw is marked with
  `userFacingError` so the translation keeps it; everything unmarked takes the generic sentence. The assistant's SSE
  route no longer forwards the Anthropic SDK's English message to the client either — that string is a log line.
- **Where the 20 surfaces are**: `app/dashboard/{page,assets,history,performance,allocation,hall-of-fame,settings}`,
  the five Cashflow tabs (the `loadFailed` prop is threaded from `app/dashboard/{cashflow,analisi}/page.tsx`, because
  the tabs do not own their queries), Dividendi, the five FIRE tabs, Previdenza and Centri di Costo. Adding a
  twenty-first means: read the query's `isError`, branch with `resolveSurfaceState`, and write the `consequence`.

### Dialog e form trasversali (`components/ui/responsive-modal.tsx`, `lib/utils/dialogNarrative.ts`)
- **A modal is a tile lifted off the page** (DESIGN.md → The Modal-Is-A-Tile Rule): eyebrow · title 20px · reading ·
  body · footer. `ResponsiveModal` owns the whole shell, so a caller passes content and never chrome — and never
  branches on `useMediaQuery` to order two buttons: the footer is `justify-end` on a dialog and `flex-col-reverse` at
  `h-11` on a drawer, so writing «Annulla» then the primary in DOM order puts the primary on TOP on a phone.
- **Four widths, and no others**: `sm` 420 · `md` 560 · `lg` 720 · `xl` 960. `dialogClassName` survives as an escape
  hatch and currently has no user; reach for a width name first.
- **The reading IS the status line.** `describeModalStatus(status, copy)` returns the idle/submitting/error sentence
  and its tone; `ModalStatusLine` renders it as ONE stable node — `role="status" aria-live="polite"
  aria-atomic="true"` — that is also Radix's `Description`. Two traps, both already paid for on /login: the container
  must never swap `status` for `alert` (a different node to the a11y tree, and some readers announce nothing across
  the swap), and `NarrativeText` colours only `mono` segments, so the tone is applied by the component.
- **`describeWriteError` is the ONE translation of a failed write**, exactly as `describeAuthError` is for a sign-in.
  11 Firestore codes are mapped; anything else takes a sentence that claims nothing rather than falling through to
  «Missing or insufficient permissions.» A server message written FOR a reader survives only if the thrower marks it
  with `userFacingError` — `assetTransactionService.parseWriteResponse` does, because the 422 bodies of the trade
  routes are the only sentences that know why an operation was refused.
- **Two-click confirms live in `lib/hooks/useArmedDelete.ts`** (moved there from `components/cashflow/budget/` when
  the fourth caller appeared). No timer, ever. **Escape while armed means DISARM**, and that cannot be done from the
  button: Radix's dismiss layer registers its document listener when the dialog MOUNTS, so it always runs before one
  added at arm time — capture phase included, and `stopPropagation` never reaches it. The hook therefore exports
  `hasArmedConfirm()`, a module-level count that `ResponsiveModal` reads in `onEscapeKeyDown` to `preventDefault()`.
  Verified in a browser on 2026-08-31: without it, Escape closed the modal with the row still armed.
- **The words are pure and tested.** `dialogNarrative.ts` holds every sentence a modal speaks — the status copy, the
  three `describe*Intent` builders (expense, trade, asset: they name the CONSEQUENCE, not the fields) and the readings
  that carry figures (movements, category delete/move, a dividend day, the test data). It imports from `formatters`,
  never `chartService`, so it stays SDK-free.
- **A summary block inside a modal is `bg-muted`**, never `bg-card` — on this surface that is a card inside a card.
- **The eyebrow's scope is the SINGULAR of one row's type.** `EXPENSE_TYPE_LABELS` is the plural of a category group
  («Spese Variabili»); the picker's own label is the one a modal about ONE row wants («Spesa variabile»).
- **In light mode `--card` and `--background` are both `oklch(1 0 0)`**, so a test that proves a modal is «lifted» by
  comparing it with the page background passes only in dark mode. What separates it there is the border and the Float
  shadow; assert the modal's surface equals a TILE's instead.
- **Blind spot** (looks like a bug, is not): no Playwright spec (the session's throwaway ones were deleted). Four two-click deletes still auto-disarm on a 3 s timer BY DESIGN, because they live on rows and not in modals and the owner kept them (`AssetRow`, `StrumentiTile`, `DividendTable`, `AssistantThreadList`); the ones that moved into the modal vocabulary lost theirs. `describeWriteError` maps 11 Firestore codes and anything else takes the generic sentence, so a NEW cause is invisible until it is added — and a server message survives only if the thrower marks it `userFacingError`, which today only `assetTransactionService` does. The status line is FORM-level: per-field zod errors keep their own line under the field, and the two can both be visible at once. `dialogClassName` still exists as a width escape hatch and has no user — reach for a `width` name. `AssetDialog` and `ExpenseDialog` carry their pre-existing `react-hooks` errors, untouched by the propagation. `PDFExportDialog`'s «Genera PDF» moved from the body into the footer, so a spec that located it inside the scrollable area needs updating.

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
- **`setStep(record ? 2 : 1)` belongs in the `open` effect**, not in `useState`'s initializer: without `open` in the deps
  the record prop stays null between opens and the second "new" reopens on the form.
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

### Firestore Queries and the Rules
- **A `list` must carry the constraint the rule needs, or it is refused entirely.** Every collection guarded by
  `allow read: if canAccess(resource.data.userId)` rejects a query that does not already filter on `userId` —
  `permission-denied` at ANY result size, so it never looks like a scale problem, and a batch built from the empty
  result silently does nothing. `deleteExpensesByImportBatch` is the correct shape. **Unit suites cannot see this** —
  they mock Firestore away; only an emulator exercise driving the CLIENT SDK evaluates the rules.
- **Max 3 `.where()` calls** on a chain that will be unit-tested; a 4th breaks the mock chain.

### Settings — the FIVE places
- A new setting must be added to all five or it silently disappears: the type (`types/assets.ts`), the read mapping in
  `assetAllocationService.getSettings`, **BOTH** write chains in `setSettings` (the `targets` branch uses `setDoc` with
  no merge), and the state/load/save/dirty-snapshot wiring — usually `settings/page.tsx`, but a FIRE-only toggle wires
  from `FireCalculatorTab.tsx` instead: the 5th place is "wherever the field's own save button lives". Guarded by
  `settingsRoundTrip`, whose `STORED_SETTINGS` fixture must carry the new field, or the round-trip stays green while the
  read mapping is still broken.
- **A user-clearable field needs a different shape per branch**: `delete docData.x` in the no-merge branch,
  `deleteField()` in the merge branch — and the guard is `'x' in settings`, not `x !== undefined`. **The bug this
  prevents is invisible until a hard refresh**: the write succeeds, the toast says «salvate», the form still shows the
  cleared field — and the old value comes back on the next load, because the no-merge branch rebuilds the document from
  `...existingData` and `!== undefined` never overwrites it. On 2026-08-29 four fields were found without the guard and
  fixed — `userAge`, `riskFreeRate`, `dividendIncomeCategoryId`, `dividendIncomeSubCategoryId` — with the round-trip
  cases added to `settingsRoundTrip` (they fail on the pre-fix service, checked). **Adding the guard is safe only
  because `getSettings` returns EVERY key**: the callers that spread `...settings` (the FIRE tabs, Coast, Monte Carlo)
  carry the current value, so the guard rewrites it unchanged or deletes an already-absent field; callers that build a
  fresh object (registration) omit the key entirely. Re-check that before guarding a new field.
- **Only a hard refresh proves a setting was saved.** Reading the value back from Firestore proves the WRITE landed;
  it says nothing about whether `getSettings` maps the field back into the form. Verify a settings change by reloading
  the page and reading the FORM — that is the half of the round trip where the historical bugs live.
- **There is a SIXTH place for any setting the SERVER reads**: the settings mapper in
  `lib/services/dashboardOverviewService.ts` re-lists the same fields from the admin doc, independently of
  `getSettings`. `settingsRoundTrip` does not cover it — check it by hand. **And a SEVENTH for anything the periodic
  emails read**: `getSettingsAdmin` in `lib/server/monthlyEmailService.ts` is a third independent re-listing, narrow by
  default (it used to carry only the email fields). `familyMembers` was missing from BOTH server mappers until
  2026-08-31 and there is no type error for it — an absent field is simply `undefined` server-side.
- **Store a boolean explicitly, never derive it** from other fields. All feature toggles live in
  `AssetAllocationSettings`, never in `UserPreferences`, and dirty-state snapshot keys contain **only persisted
  fields**, captured *after* the Firestore state is applied.
- **One Save button validates the whole page** — `handleSave` returns early when allocation targets do not total 100, and
  must `invalidateQueries(['settings', ownerId])`, which `AssetDialog` reads. **A tab must not grow a second Save**: the
  Dividendi one was deleted on 2026-08-29 because `handleSave` already persisted its two fields, so the tab's own button
  was a second write path for the same data (it also re-read the doc first, and could therefore clobber a concurrent edit).
- **A field's dirty-snapshot must follow the TAB THAT EDITS IT, not the tab that consumes it**: `userAge`/`riskFreeRate`
  moved from `allocationSnapshotKey` to `generalSnapshotKey` when the Profilo tile moved to Preferenze, while the
  auto-calculated `equity`/`bonds` targets they FEED stayed in the allocation snapshot. Get this wrong and the header's
  chip says "salvato" over an edited field.
- `cashflowHistoryStartYear` is shared (Cashflow / Storico / Assistant / overview) — never rename it page-specifically.

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

### Demo Mode
- The public landing (`app/page.tsx`) auto-logs into the demo account; `useDemoMode()` compares `user.uid` with
  `NEXT_PUBLIC_DEMO_USER_ID` and **gates every mutation** (buttons disabled with a named `aria-label`, handlers return
  early). The snapshots and notes of that account are shared by every visitor: a write that slips through is visible
  to all of them. The assistant is blocked there outright.
- **The dashboard's demo banner is the app's cadence on a warning fill** (`app/dashboard/layout.tsx`):
  the label is `TILE_EYEBROW_CLASS` recoloured to `text-warning-foreground` (the eyebrow's geometry is
  shared, its colour is not — `--warning` is near-white in light mode), and the consequence is a 12px
  reading beside it, visible at EVERY width. It used to hide below 640px, which is exactly where a
  reader needs to be told why a button does nothing.

### Shared Account / Delegated Access
- **Viewer vs owner**: `useAuth().user` is the viewer and never changes; `useActiveAccount().ownerId` is whose data is
  displayed. Pass `ownerId` in data-scoped hooks and pages; keep `user.uid` only for theme, profile, PDF author,
  `useDemoMode` and the sharing UI.
- **Grant model**: `account-access/{ownerUid}` with `memberUids` read by the rules and the `array-contains` discovery
  query; the rest is denormalized because a member cannot read `users/{ownerUid}`.
- **Three enforcement layers, kept in sync**: `firestore.rules` (`canAccess(ownerUid)` per collection, `create` uses
  `canAccess(request.resource.data.userId)`, `userPreferences` stays `isOwner`, `account-access` is **write:false**),
  `assertCanAccessAccount` on Admin routes, and the client substituting `ownerId`. **Rules changes are inert until
  deployed.**
- **Switching gotcha**: React Query keys namespace by the id passed in, but manual `useEffect` loaders (settings, history,
  performance, allocation, hall of fame) must include `ownerId` in their deps. The switcher must exist in BOTH the
  Sidebar and the `SecondaryMenuDrawer`, since portrait has no Sidebar.

### Dynamic Imports and Module Hygiene
- **Components must be at module level** — one defined inside a render body is a new type every render, so React
  remounts it (`AnimatePresence` enter never plays, `useEffect([])` re-fires) and the React Compiler throws.
- Pure `lib/utils` modules reach `calculateAssetValue` in one of two established ways — check the precedent: **injected**
  as a `valueOf` param (`allocationUtils`, `pensionFire`) or **imported directly** with the test mocking
  `@/lib/firebase/config` + `firebase/firestore` + `authFetch` + `dashboardOverviewInvalidation`.
- Functions that call `new Date()` internally are untestable — pass `now: Date` explicitly. **shadcn vendored surface
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
- Every sentence from `overviewNarrative.ts` — a falling month blames the market only when `marketEffect < 0`.
- Il resto — the hero step-down, the tile grid, `doc/redesign-prompts.md` propagation, the Italian-copy test trap — in `doc/guide/panoramica.md`.

### Patrimonio · Asset Pricing, FX and Assets → `doc/guide/patrimonio.md`
- "Does this asset have a market price?" is ONE rule in `assetPricing.ts` (`hasMarketPrice`/`requiresManualPricing`); a new hand-valued type goes in `MANUALLY_VALUED_TYPES` and nowhere else.
- GBp (pence) ≠ GBP — normalize `price / 100` before any FX; never call Frankfurter from the browser; `quantity = 0` marks a sold asset; bond prices are `% of par`.
- Patrimonio Δ columns are UNIT-PRICE variations, not P&L; `isHeld` (`quantity > 0`) gates every count/share/sum; the page owns every dialog for one dual invalidation.
- Every number not in the payload is born in `patrimonioSummary.ts`; the verdict's driver is an INSTRUMENT.
- Il resto — `suggestIsLiquid`, the cash-account picker rule, the article helpers, the failed-overview branch — in `doc/guide/patrimonio.md`.

### Asset Trade Ledger → `doc/guide/registro-operazioni.md`
- ALL trade money-math (replay, PMC, realized P&L, XIRR, invested capital) lives in `assetTransactionUtils.ts`, pure; the service/route layer is a thin atomic writer. A new `AssetTransactionType` updates the replay switch, the zod schema AND `TransactionDialog`.
- Writes are Admin-API-only, all reads before any writes, derived fields written in-tx (never via `updateAsset`); ledger-type edits go through `updateAssetMetadata`.
- The migration baseline (`isBaseline` BUY) NEVER stamps `holdingStartDate`; `replayTransactions` returning `holdingStartDate: undefined` means leave the doc untouched (never `deleteField()`).
- Per-transaction derived data comes from `replayTransactionsWithEffects` (one pass), never re-running replay on every prefix.
- Il resto — `resolveBondPrice` reuse, the two `totalReturnAssets` paths, the static-copy audit rule — in `doc/guide/registro-operazioni.md`.

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
- `allocateByShare` charges the rounding residual to the LARGEST share and re-rounds — untestable on two shares (they cancel), test on three. Writing it is a FOUR-place fan-out.
- Il resto — the deleted-member bucket, the dialog control, `effectiveTab` — in `doc/guide/cashflow-divisione.md`.

### Cashflow › Dividendi · Dividends and Coupons → `doc/guide/cashflow-dividendi.md`
- RECEIVED AND ANNOUNCED ARE NEVER ONE FIGURE — counted, totalled and coloured apart on every surface; `summarizePayments` returns two halves and no sum.
- ONE period axis (`resolvePeriodBounds`, upper bound = end of the period's own unit, NOT today); the announced money is ON it; instrument/type filters narrow only the list. The Rendimento tile does NOT follow the axis and says so.
- `useDividendStats` carries NO date bounds (they only narrowed `periodStats`, now derived in memory). Every number from `dividendAnalytics.ts`.
- A coupon's cashflow expense is created only by the daily cron on payment date (`!isAutoGenerated`, idempotent via `expenseId`); adding a `DividendType` is a six-file fan-out; YOC/Current Yield share `computeDividendYieldMetrics`, scoped to the current holding.
- Il resto — the calendar, BTP Italia additivity, the running-window rule, `couponUtils` — in `doc/guide/cashflow-dividendi.md`.

### Storico · History and Snapshot Baselines → `doc/guide/storico.md`
- The snapshot cron runs DAILY (the name lies); a snapshot is a frozen photo (adding an asset never updates an old one). Annual deltas use December of the previous year as baseline.
- Reuse `byAsset.totalValue` for historical per-instrument value (never recompute); `byAsset.price` is RAW NATIVE currency, so attribution is `priceEffect = q_prev·(u_curr−u_prev)` + `quantityEffect` (sum = Δ exactly).
- Two CAGR formulas, intentionally different: Storico's verdict = `(endNW/startNW)^(12/months)−1` (wealth growth, «versamenti inclusi»); Rendimenti = investment return. ONE pace for the page (`summarizeGrowthPace`, trailing 12 months, linear); do not compound it.
- The Driver is floored at `cashflowHistoryStartYear`; a running year never counts materialised future rows.
- Il resto — `buildMonthAssetBreakdown`, the manual-snapshot cross-validation, the Recharts-in-a-flex-tile technique — in `doc/guide/storico.md`.

### Hall of Fame — a verdict over tiles → `doc/guide/hall-of-fame.md`
- The page has NO axis and re-derives nothing: `hall-of-fame/{userId}` holds the rankings; "today" is a PARAMETER, never `new Date()` inside the module.
- `hallOfFameRecords.ts` is the ONE definition of a record AND a ranking — both writers and the periodic email call `buildHallOfFameRankings`; never re-implement a ranking.
- A stale document heals only from the page's «Aggiorna» button when the account has no assets (the cron gates on `snapshotResult.success`); disabled in demo. Never document a field as "the cron will fill it in".
- A savings record needs income (`totalIncome > 0` guard); `stats` and the two savings rankings are OPTIONAL on pre-2026-08-25 documents — `getBoard` returns `null` (≠ empty board), never `?? []`.
- Il resto — the podium-vs-chronology split, `NoteTrigger`, the section-key fan-out — in `doc/guide/hall-of-fame.md`.

### Rendimenti → `doc/guide/rendimenti.md`
- Any exclusion read from `byAsset` MUST be backfilled across pre-`byAsset` months (subtract a constant `E₀`) or it becomes a phantom crash — this fixes the DENOMINATOR, not the numerator. The base is user-configurable and TWO call sites must stay in sync (`buildCacheKey` embeds the base signature).
- The first snapshot of a period is the starting valuation, never a measured month — the window opens on the 1st of the month AFTER it. The page must NEVER re-derive the window from `new Date()` (`metrics.nominalPeriodStart` travels in the payload).
- No silent filters inside a single metric — volatility/Sharpe floor at ≥ 3 monthly returns, else `null` with a reason. Below 6 months the hero is the PERIOD return, not annualized.
- Every benchmark model is EUR-converted before the verdict's gap; `benchmarkPeriodReturn.ts` is the single indexing source.
- Il resto — drawdown on a geometric TWR index, IRR sign convention, the verdict-over-tiles rules, the heatmap — in `doc/guide/rendimenti.md`.

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
- Il resto — the two tax mechanisms, `overlayLivePensionValue`, the per-contributor return, the verdict-over-tiles rules — in `doc/guide/previdenza.md`.

### FIRE, What If and Goals → `doc/guide/fire.md`
- What If = perturbation + diff, no new projection math; keep the pure layer category-agnostic. Pension unlock is ONE rule in `pensionUnlock.ts` (explicit `now`).
- `respectPensionLockInFire` governs the WHOLE FIRE page: each tab subtracts the locked total AND passes the inflows (subtraction alone reintroduces "sottratto per sempre"). The bridge model reuses the Coast walk, never a second formula.
- The Ventaglio engine mirrors the deterministic walk BY CONSTRUCTION — at zero volatility every path collapses onto the base scenario (the coherence test pins that WITHOUT inflows). `deriveMonteCarloAllocation` is the ONE allocation→4-class normalizer.
- Goal math the server needs lives in `goalMath.ts` (imports `calculateAssetValue` directly); `serializeGoalForFirestore` IS the persistence allowlist; the goal document is rewritten WHOLE, never patched.
- Il resto — each tab computes nothing (numbers from `*Summary`, words from `*Narrative`); config-first collapse; the five verdict-over-tiles sections; Playwright locators — in `doc/guide/fire.md`.

### Assistant · Assistente → `doc/guide/assistente.md`
- The context service runs server-side (`adminDb` directly); every mode maps to its own builder in `stream/route.ts` (a missing branch silently falls through to monthly); `buildAssistantPeriodRangeContext` is the FIFTH builder.
- ONE aggregator (`buildCashflowBreakdown`) per builder; a new required bundle field means updating ALL 4 builders. `system` is byte-identical per mode — never interpolate per-request data; `cache_control` deliberately NOT used.
- A silent cap in a context builder becomes a hallucinated "N/D": a cap either does not exist or is stated in the text the model reads. `ASSISTANT_SYSTEM_CORE` is shared with `buildEmailAiPrompt`.
- THE PROPOSAL PROTOCOL: the AI never writes — it emits ONE fenced ```goal-proposal block, the write happens on the user's Conferma via `POST /api/goals`; `goalProposal.ts` owns the ONE zod schema.
- Il resto — memory merge rules, `deleteAssistantThread` batching, the verdict-is-the-context rules, streaming traps — in `doc/guide/assistente.md`.

### Periodic Emails · PDF Export → `doc/guide/email-pdf.md`
- Both render OUTSIDE the DOM: every hex comes from `lib/constants/printTokens.ts` and nothing else; every email layout is a nested table (Outlook = Word). Verify by RENDERING — no check is in the suite.
- A verdict over tiles: the email opens on a RULE-generated verdict (also the preheader), the AI comment is a tile in SECOND position and non-blocking. ONE template for the four periods; «Rispetto a un anno fa» is ABSENT on a yearly email (`previousEqualsYoy`).
- PDF: the cover IS the verdict; on Cashflow, Export Totale applies `cashflowHistoryStartYear` as a floor and DECLARES it. No monospace, no typographic minus — `pdfSafeText` converts U+2212 at the boundary (react-pdf drops unencodable chars silently).
- The weekly budget email is a SEPARATE module and nothing in it is weekly (month-to-date + year-to-date); name every figure's window.
- Il resto — `PDF_RAMP`, the class labels, `signedPct`/`signedEur` it-IT, the deterministic-comparison rule, the AI-prompt body — in `doc/guide/email-pdf.md`.

### Impostazioni — tessere senza verdetto → `doc/guide/impostazioni.md`
- The page has NO verdict and must not grow one (a configuration page measures nothing) — it keeps the CADENCE: 22 `describe*` functions in `settingsNarrative.ts`, NO `build*Verdict`.
- A reading declares the effect DOWNSTREAM, not the control under it; the Narrative Honesty Rule holds (a missing input drops its clause).
- A field another page OWNS is DECLARED, never edited here («Parametri del piano» from FIRE, «Assistente» a mirror that loses on read). The colour theme and light/dark mode save themselves, outside `handleSave`.
- The write fan-out for any setting (the FIVE/SIX/SEVEN places) is `AGENTS.md § Settings — the FIVE places`.
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
- **`react-hooks/set-state-in-effect`**: defer a synchronous `setState` with `setTimeout(…, 0)` (returning the cleanup).
  The classic `mounted` guard is therefore banned — use `useSyncExternalStore(neverChanges, () => true, () => false)`,
  which declares the SSR/hydration split in the signature.
- **`react-hooks/refs`: a custom hook must never RETURN a ref inside its object** — every read of that object during
  render (`del.armed`, `del.onClick`) is flagged "Cannot access refs during render". Take the ref as an argument
  (`useArmedDelete(ref, onDelete)`, `lib/hooks/useArmedDelete.ts` — moved there from the budget folder
  on 2026-08-31, when the fourth caller appeared).
- **`react-hooks/preserve-manual-memoization` ("Compilation Skipped")**: the compiler refuses to optimize the whole
  component when a dep array is *more specific* than what it infers — align the dep to the inferred value.
- **Loading skeleton over spinner** on any page investing in count-up and chart scheduling, with `PageContainer` imported
  inside it or wrapped at the call site. Verify it is wired up — `tsc` does not catch an unused component. Mobile CPU
  budget is ~3-5× tighter, so validate motion in a production build, not `next dev`. The skeleton is a WAIT and never a
  failure (→ *Stati: caricamento, vuoto, zero, errore*).
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

### Color Theme System
- **Parallel theming**: next-themes owns `.dark`, the custom system owns `data-theme` — fully independent. CSS:
  `[data-theme="name"]` for light, `.dark[data-theme="name"]` for dark; `ColorThemeContext` lives inside `AuthProvider`.
- **`useChartColors` timing**: `useEffect + useState + requestAnimationFrame`, NOT `useMemo` — `getComputedStyle` during
  render runs before next-themes has updated the DOM and yields stale colours on a theme switch.
- **oklch luminance filter**: L > 0.82 in light or L < 0.30 in dark falls back to the static palette, so a theme with
  chart colours at extreme luminance always falls back — fix it at the CSS level. Below ~0.015 chroma everything looks
  identically gray, so `--card`/`--background`/`--muted` need chroma ≥ 0.020.
- **The token you AUTHOR is not the token the browser RETURNS.** Turbopack's CSS transform transpiles `oklch()` for the
  build's browser targets, and `getComputedStyle(document.documentElement).getPropertyValue('--chart-6')` came back as a
  `lab(…)` string under `npm run dev:e2e` (measured 2026-08-30). Two consequences. A Playwright assertion on a resolved
  token must compare CHANNELS or DISTINCTNESS — never match `/^oklch\(/`, a regex on the authored syntax that fails on a
  correct value and can only ever pass by accident. And `parseOklchL` returns `null` for anything not literally
  `oklch(`, so the luminance fallback above is **inert** wherever the served string is transpiled: the colour passes
  through unfiltered. Read the served string before trusting either.
- **Action/semantic colors that must follow the theme: clamp lightness, do not index-fallback.** `useActionColors` clamps
  only the oklch L channel, preserving hue and chroma; `useChartColors`' same-index fallback would lose the theme hue and
  can collapse two states onto one colour. Resolve **once per section** and pass the colour down.
- **Sign tokens must be verified per theme**: `--positive` is declared twice and no theme overrides it, so one value fixes
  all twelve combinations, while `--destructive` is declared **twelve times** (cyberpunk's is orange) and must be
  measured per theme. Never assume a token change lands globally without counting its declarations.
- **A user-chosen identity colour is a SLOT, not a hex** (`'chart-1'..'chart-8'`, resolved by `resolveCostCenterColor`).
  Three rules: **migrate without a backfill** (`LEGACY_HEX_SLOTS` maps each old hex to the slot at the same position);
  **derive the no-colour fallback from the document id** (FNV-1a), never from the row's rank, which repaints half the
  list on every period switch; **indices 0-7 are theme-aware** (`--chart-1..8` exist in all twelve blocks since
  2026-08-30), 8-9 still pad from the static `CHART_COLORS`.
- **`--chart-6/7/8` carry a meaning across every theme** (2026-08-30): 6 = Materie Prime (gold/olive), 7 = Trend
  Following (teal/cyan), 8 = Carry (rose/magenta) — the hue band is held per theme across light AND dark so a slot does
  not change identity when the mode flips, and only L and C are re-pitched to the block's surface. Before this the tail
  padded from `CHART_COLORS`, where the static teal at index 6 measured **ΔE00 0.87** from the default theme's
  `--chart-2`: Trend Following and Obbligazioni were not similar, they were the same colour.
- **`ASSET_CLASS_CSS_VAR` no longer exists.** `getAssetClassCssVar` DERIVES the token from `ASSET_CLASS_CHART_INDEX`
  (`--chart-${slot + 1}`), because the hand-written map was a second source that disagreed with the first: crypto's chip
  was `--chart-4` while its chart slot was 2, so one class wore two hues on one screen. `cash` keeps
  `--muted-foreground` on purpose — liquidity is the absence of a position, not a series.
- **Adding a theme**: CSS blocks `[data-theme="name"]` + `.dark[data-theme="name"]`, the `ColorTheme` union, an entry in
  `COLOR_THEME_SWATCHES` (module level in `settings/page.tsx`), the swatch grid columns, `tsc`. The swatch previews carry
  each theme's own literal oklch values ON PURPOSE — they preview a palette that is NOT active, which no CSS token can
  express — and the accessible name is the POSITION («Colore 3 di 6: Midnight Bloom»), never the hue.

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
- **`PageContainer width="wide"`** is the 1920px root of a tile page; the loading state must use the same width or
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
- **Phantom `tsc` errors**: `papaparse` and `@playwright/test` are declared but can be missing from the (untracked, branch-shared) `node_modules`. The tell is ~25 errors clustered in `e2e/` and `lib/utils/expenseImport.ts` rather than in what you touched — run `npm install` first.
- `npm test -- <file>` / `npx vitest run <file>` for targeted tests; **`npx tsc --noEmit` before any PR**, re-run AFTER
  writing the tests, not only after the code.
- **A slow `await import()` inside a test body reads as flakiness, not as slowness.** A heavy module graph is a FIXTURE:
  imported in a test body it charges its one-time cost to whichever case runs first, so under full-suite load that case
  blows the 5 s default and the failure MOVES with the run order. Hoist it into `beforeAll` with an explicit timeout —
  after checking nothing is read at module scope, otherwise per-test `vi.resetModules()` was load-bearing.
- **A `tsc` that fails only inside `.next/dev/types/validator.ts` (TS1109 "Expression expected") is a half-written
  generated file**, not a type error: a dev server was killed mid-write. Delete that one file (`next dev` regenerates
  it) — never the whole `.next` of a server someone else may be running.
- **A surface with no DOM is verified by RENDERING it, not by reading its code.** `tsc` and Vitest
  see neither a dropped glyph nor a colour that is off-token. For the PDF: `renderToFile` from
  `@react-pdf/renderer` works under Vitest — inflate the content streams with `zlib`, collect every
  `scn` operand to prove no colour outside `printTokens` reaches the page, and read the hex text
  runs to catch characters react-pdf silently dropped. For the two emails: they ARE HTML, so open
  the rendered file in Chromium (`chromium.launch()`, `file://`) at 390 / 600 / 1440 and assert
  `documentElement.scrollWidth === clientWidth`. Both are throwaway scripts — **run them from
  inside the repo** or `playwright` and the `@/` alias do not resolve — and neither check lives in
  the suite.
- **Run the suite under `TZ=Europe/Rome` too.** Every date fixture is stamped at noon, twelve hours clear of the DST
  edge, so a whole class of timezone bug is structurally invisible to it — while production dates are **local midnight**
  and the pure layer runs in the user's browser. Compute day-of-year from calendar fields in UTC (`Date.UTC(y,m,d) -
  Date.UTC(y,0,0)`) and add at least one fixture built the way the dialog builds one. Area suites per change:

| Area | Suites |
| --- | --- |
| Overview / materialized summary | `apiAuthRoutes`, `dashboardOverviewService`, `dashboardOverviewUtils` · **Verdetto e letture** `overviewNarrative` · **Badge** `savingsRateBadge` |
| Rendimenti | `performanceService` (+ `performanceBase`, `drawdownSeries`, `cashFlowMap`) · **Verdetto e letture** `performanceNarrative`, `performanceSummaryTiles`, `performanceSummary` (+ `patrimonioNarrative` for the articles) |
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

- **`firebase deploy --only firestore:rules` with a stale CLI login fails with a 401 on `serviceusage`**, not with "please
  log in". In this non-interactive shell the fix is the code flow — `npx firebase logout` (drops the dead refresh
  token), `npx firebase login --no-localhost`, open the URL of THAT run, then `npx firebase login <code>`; a code from an
  earlier run's URL is refused. `firebase` is not global here: always `npx firebase`.
- `npx knip` uses the root `knip.json`: `components/ui/**` and `public/sw.js` ignored, `firebase-tools` an ignored
  dependency, and `ignoreExportsUsedInFile: true` means remaining EXPORT_ONLY findings are deliberate prop surface.
- Emulators, Playwright, production-build verification and their environment traps: **SETUP.md → Steps 6-7**.

### Proving a refactor changed no number
- **Measure the noise floor BEFORE interpreting a diff.** Anything downstream of a `new Date()` drifts continuously:
  two dumps of *identical* code differ by cents at two minutes and by ~0,25 € at forty. Take two dumps of unchanged
  code first; whatever they disagree on is not your change.
- **The valid comparison is old-vs-new MINUTES apart**, not before-work-vs-after-work: `git checkout --` the modified
  files, delete the new ones, dump, then restore from a patch (`git diff > …` + `git apply --include=…`, since a
  whole-tree patch fails on files you never reverted).
- **Compare the SET of rendered values, not the page text** — a redesign moves everything. Extract every euro amount and
  percentage from both dumps and assert each old value has a match within the noise floor; new values appearing is the
  feature, old values disappearing is the bug.
- **Drive it from a throwaway Playwright spec that opens every collapsible** and samples charts by hovering at fixed
  fractions of their width, so figures behind a disclosure and figures that exist only in a tooltip are both captured.

### Emulator Exercise Scripts
A collection whose value is in the *wiring* gets one: the unit suites mock Firestore away, so only an exercise covers the
rules permitting the writes, real `Timestamp` values surviving `removeUndefinedDeep` and the real atomic transaction.
- **Write them as `.mts`** — a `.ts` script is CJS under tsx and has no top-level await, and neither does `npx tsx -e`.
- **A throwaway one-off (Python, Node) is a FILE too, never a bash heredoc**: a heredoc whose body carries apostrophes or
  backticks dies in the tool shell with «unexpected EOF while looking for matching `'`» before running a line — write it
  to the session scratchpad and run it by path (the doc updates of 2026-08-25 went that way after one failed heredoc).
- **Run a throwaway script from INSIDE the repo** (`scripts/*.tmp.mts`, untracked, deleted in phase F): from the session
  scratchpad `firebase-admin` fails with `ERR_MODULE_NOT_FOUND` — resolution starts at the script's directory — and the
  seed dies silently before the login it was meant to enable. A throwaway Playwright spec likewise lives in `e2e/`
  (it must match a project's `testMatch`); it can override the project's session with `test.use({ storageState: {
  cookies: [], origins: [] }, viewport, deviceScaleFactor, colorScheme })` and log in through the form. A README capture also hides the Next dev badge first (`page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' })`): it sits bottom-left in every dev screenshot.
  **Drive the mutations through the app's services** (client SDK, rule-evaluated) and do the script's own reads and
  fixture edits with the Admin SDK: from an `.mts` file a `doc()` imported there rejects a `db` built here, while
  sign-in still works, which makes the failure look unrelated.
- Prefer verifying with **two independent paths**: compute the expected figure in the script from the same real
  snapshots — a same-code-path comparison would be circular.
- **On a shared account an exercise cannot pin ABSOLUTE values.** The emulator carries other suites' fixtures, so an
  assertion written against the record the script just planted measures the fixture, not the code (a pension exercise
  expecting 10.000 read 39.800, because another seed's fund was still there). Derive the expectation from what is
  ACTUALLY in the collection, then assert the planted record is contained in it.
- **A throwaway fixture must not share document ids with the seed** (`{uid}-{year}-{month}` is the trap): overwriting
  them means deleting the fixture also deletes the seed's own rows. Re-seed if it happens.
- **A stale `.next-e2e` serves stale CSS as readily as stale routes.** A 404 from `npm run dev:e2e` on a route that
  exists is that cache, not a routing bug — and so is a BRAND-NEW CSS custom property resolving to the empty string in
  the browser while it is plainly there in `app/globals.css` (2026-08-30: `--chart-6/7/8` read `''` until the dist dir
  was deleted and the server restarted, which reads as "the tokens were never added"). Delete the dist dir and restart
  before doubting the selector, the token or your own edit. Use a fresh
  dist dir (`NEXT_DIST_DIR=.next-throwaway`) rather than deleting someone else's, and **keep the `.next-` prefix**,
  which is what `.gitignore` matches. Two traps on the way out: `next dev` rewrites `tsconfig.json`, so check it out
  again; and the server keeps writing briefly after it is stopped, so delete the dist dir after the process is gone.
- **A Firestore `DELETE` on a document that does not exist answers 200**, so a phase-F cleanup aimed at the wrong
  collection reports success and leaves the fixture in the export. Know where each write actually lands before deleting:
  a registration plants `users/{uid}` AND `assetAllocationTargets/{uid}` — `setSettings` writes to
  `assetAllocationTargets`, NOT to a `settings` collection (verified 2026-08-30). Confirm with `listCollectionIds` and a
  `GET` per candidate, then grep the export for the uid rather than trusting the delete's status code.
- **A throwaway account that logs in leaves `dashboardOverviewSummaries/{uid}` behind** (the server-owned overview
  summary is written on the first dashboard visit): a wipe that deletes only what the seed planted keeps it in the
  export — grep the exported `output-0` for the uid before calling the restore done. The Hub export body takes a
  forward-slash path (`{"path": "C:/…/.emulator-data"}`); a backslashed one 400s with a JSON escape error.
- **Stopping the emulators: export FIRST, then kill.** `--export-on-exit` only runs on a SIGINT delivered to the
  `firebase` CLI process itself, so killing the wrapper (all Windows really offers) skips the export and
  `.emulator-data/` keeps its startup timestamp — the session's data is lost on the next import. Use the Emulator Hub:
  `POST http://127.0.0.1:4400/_admin/export` with `{"path": "<abs>/.emulator-data"}` (**`/_admin/export`, not
  `/emulators/export`, which 404s**), then terminate. **Verify the directory's timestamp moved**: a 200 with an
  unchanged mtime is the failure that looks like success.

### Browser-Driven E2E (Playwright)
- **What belongs here**: only what needs a real layout — the `desktop:` switch at 1440px, a collapsible, a state flash,
  computed font sizes, bounding boxes, overflow. The arithmetic stays with Vitest.
- **Two limits the suite cannot cover**: a race between concurrent queries is **not reproducible locally** (the Firestore
  Web SDK multiplexes every target onto ONE webchannel), and an **error branch is not reachable by cutting the network**
  (the SDK treats an unreachable backend as offline and retries).
- **`workers: 1`, non-negotiable** — the specs share emulator accounts. **Give the suite its OWN fixture, not another
  script's end state**, with numbers that make the assertion meaningful (dating every Analisi expense to January keeps
  its figures exact whatever month the suite runs in).
- **A fixture may need tuning so the thing under test is on screen at all** — the Coast fixture picks the RITA
  long-unemployment variant only because the ordinary rule puts the unlock past the end of the projection. Choose the
  fixture from what the assertion must see, and say so in the file.
- **`e2e/global-setup.ts` runs every seed**, in order: Previdenza → Coast (needs the pension fund) → degraded → Analisi.
  A new fixture is an `npm run e2e:seed:*` script plus one `spawnSync` there — and it re-runs on EVERY invocation, so a
  test that patches Firestore must do the patch inside the test, never between two runs.
- **Re-seeding an account mid-suite logs it out**: `auth.updateUser(uid, { password })` revokes the refresh tokens and
  invalidates the parked `storageState`. Split the seed — creation once from `global-setup`, data-only per test.
- **`storageState` does NOT capture IndexedDB unless you ask for it**, and the Firebase session lives there: the file
  looks valid and every spec silently lands on `/login`. Pass `{ path, indexedDB: true }`.
- **Prove the test can fail before trusting it** (the 1440px assertions were re-run at 1200px, where they must fail).
- **`page.addInitScript` runs BEFORE `document.documentElement` exists**: observing it throws, the init script dies on
  that line, and the spec passes because it observed *nothing*. **Observe `document`** with `subtree: true`.
- **`innerText` applies `text-transform`; `textContent` does not** — a marker taken from an uppercase eyebrow never
  matches `body.innerText`, and a falsification run using such a string stays green. `innerText` also returns `''`
  for anything not rendered, so a Recharts tooltip read that way is empty even when open: use `textContent`.
- **`boundingBox()` is viewport-relative, so hovering a chart below the fold does nothing** — `page.mouse.move` past the
  window height lands outside it and the tooltip never opens, which reads exactly like "this chart has no tooltip".
  `scrollIntoViewIfNeeded()` first, then read the box.
- **A throwaway spec left in `e2e/` is collected by the BROAD projects too.** `desktop`'s `testMatch` catches any
  `*.spec.ts`, so a verification spec written for its own fixture account runs again under the base account in a full
  `npx playwright test` and fails there — three red tests that look like a regression and are not. Give a throwaway its
  OWN config (`playwright.<name>.config.ts` with its own setup project and a narrow `testMatch`), run it with
  `--config=`, and DELETE it before the full suite (2026-08-28).
- **The period and axis controls are not buttons.** The Cashflow picker is a `combobox` named
  «Periodo selezionato: {label}»; `SegmentedPill` renders its options as `tab`; the instalment toggle sits behind the
  «Impostazioni avanzate» disclosure and must be opened first; the two-step create dialog labels its types with a
  capital («Spesa Variabile»). Read the failure's page snapshot before guessing a second selector (2026-08-28).
- **Responsive DOM duplicates make `.first()` a trap** (the DOM-first node is usually the HIDDEN mobile copy) — filter
  with `.filter({ visible: true })`. **A collapsed CSS-grid region is still "visible" to Playwright**: scope through the
  toggle's `aria-controls` id and assert the collapse by measuring height.
- **`CompositionList` clickable rows are `<button role="listitem">` — the explicit role WINS**; the accessible name is
  `"{name}, {value}, {share}%"`. `PageTabBar`'s tabs are locatable by name at every width (`aria-label`), but below
  1440px the inactive ones are icon-only, so `getByText` finds nothing — use `getByRole('tab', { name })`.
- **A `fill()` right after `goto(…, { waitUntil: 'domcontentloaded' })` can be silently wiped** by hydration reconciling
  the input back to its initial React state — use `waitUntil: 'load'` and verify with `.inputValue()`.
- **Drive the dev server on `localhost`, never `127.0.0.1`**: Next blocks cross-origin dev resources from the bare IP,
  which kills the dev client, leaves the page unhydrated, and makes the login form submit natively — indistinguishable
  from a wrong password.
- **Two `boundingBox()` calls sample two different FRAMES.** While a drawer slides up the second element reads as
  *higher* than the first and a one-column layout looks like two. Read every rect a single assertion compares in ONE
  `evaluate()`. Same rule for anything measured during an animation.
- **The emulator needs Java ≥ 21; this machine now HAS it, and a shell already running may still not see it.** Temurin
  21 (`C:\Program Files\Eclipse Adoptium\jdk-21.0.12.101-hotspot`) was installed on 2026-08-30, the USER `JAVA_HOME`
  points at it and the user `PATH` carries `%JAVA_HOME%\bin`; the `Oracle\Java\javapath` shim — which resolved `java` to
  the JDK 15 whatever `JAVA_HOME` said — was removed from BOTH the user and machine scopes (the directory is still on
  disk, it is only off the PATH). **An environment change never reaches a process that is already running**: a session
  started before it keeps the old `PATH`, so `java -version` inside it still prints 15 and `(Get-Command java).Source`
  still names the shim — which is what the pre-2026-08-30 note above recorded as "this machine has no JDK 21". Read the
  SCOPES, not the process: `[Environment]::GetEnvironmentVariable('Path','Machine')` and `…'User'`, plus
  `[Environment]::GetEnvironmentVariable('JAVA_HOME','User')`. A new terminal picks the change up. The portable route of
  SETUP.md → Step 6 remains the fallback where it has not been picked up (`winget` is NOT on this shell's PATH): fetch
  the zip directly
  (`https://api.adoptium.net/v3/binary/latest/21/ga/windows/x64/jdk/hotspot/normal/eclipse`), expand it into the session
  scratchpad and export `JAVA_HOME`/`PATH` for the `npm run emulators` process only — no system change, nothing to undo.
  **In the Bash tool, `PATH` entries must be MSYS paths (`/c/Users/…`), not `C:/Users/…`**: `PATH` is colon-separated, so a
  drive letter splits the entry in two, the portable JDK never resolves, `java -version` still prints the system 15 and
  firebase-tools dies with "no longer supports Java version before 21" — a failure that reads as a missing download
  (verified 2026-08-30). `JAVA_HOME` itself is fine either way; check with `which java` before starting the emulators. Stopping the npm wrapper does **not** kill
  the JVM: the ports stay taken and the next start fails with "port taken", naming no stale process. Free them by PID — `netstat -ano | grep LISTENING | grep :8080`, then `taskkill //PID <pid> //F //T`, the same for `next dev` on :3100 — and only AFTER the Hub export.
- **Ports 8080/9099 answering is not proof that OUR emulators are up.** On 2026-08-27 they were another repo's suite
  (`chronostep-9ab39`, started by hand with `--single_project_mode`): every seed «succeeded» into its `demo-net-worth`
  namespace and `auth.setup.ts` died on `auth/user-not-found` — the client signs in against the emulator's own project.
  Before trusting the ports read the owner's command line (`Get-CimInstance Win32_Process -Filter "ProcessId=<pid>" |
  select CommandLine`); a foreign suite is never killed, and what the seeds left there is wiped with
  `DELETE /emulator/v1/projects/demo-net-worth/databases/(default)/documents` and `…/projects/demo-net-worth/accounts`.
- **On the BASE account, FIRE figures depend on the RUN MONTH**, so a spec there asserts STRUCTURE and FORMAT, never
  exact amounts — and the euro-format regex must accept ungrouped four-digit amounts:
  `(\d{1,3}(\.\d{3})+|\d{1,4}),\d{2}` (CLDR `minimumGroupingDigits = 2`, the *Italian Localization* trap).
- **A spec that formats its own expected euro with Node's `Intl` never matches the page**: Node's ICU puts a NARROW
  no-break space (U+202F) before `€`, the browser a plain one (U+00A0) — flatten BOTH on both sides before comparing.
  And a decoy-absence check on `main` fails on Cashflow, where every tab stays mounted (`forceMount`) and hidden: scope
  it to `[role="tabpanel"][data-state="active"]`. **`getByRole(…, { name })` matches substrings**: «Avvisi» also
  resolves «Avvisi soglia», «Impostazioni del budget» also «Vai alle impostazioni del budget» — pass `exact: true`.
  **`getByLabel` matches by substring AND case-insensitively**, which is worse here because Italian class labels nest:
  a search for «Azioni (€)» also resolves «Obbligazioni (€)», so a form whose fields are generated from
  `ASSET_CLASS_SEQUENCE` answers with a strict-mode violation naming two inputs — indistinguishable, at a glance, from
  the field not existing (2026-08-30, the manual-snapshot dialog). Pass `{ exact: true }` on every generated field.
- **A settings change is only verified by a RELOAD.** Reading the value back from Firestore proves the write; the form
  is rebuilt by `getSettings`, and that is the half where the bugs live (2026-08-29: four fields wrote fine and came
  back to their old value on the next load). Drive the UI, save, `page.reload({waitUntil: 'load'})`, then assert on the
  INPUTS. And test the two directions separately — setting a value and CLEARING it fail for different reasons.
- **A throwaway session spec must match an existing project's `testMatch`, and the FILENAME chooses the account.**
  `*.spec.ts` → `desktop` (base account), `*.mobile.spec.ts` → `mobile`, `*.degraded.spec.ts` → the degraded account,
  and **only a name containing `analisi.spec.ts` reaches the Analisi fixture account** (`testMatch: /analisi\.spec\.ts/`,
  while `desktop` carries `testIgnore: /analisi\./`). A throwaway named after what it verifies rather than after its
  project is therefore either not collected at all or collected against the WRONG fixture — and both read as the
  feature being broken, not as a config miss. It should also assert against Firestore rather than the page, plant a
  decoy word that appears nowhere in the seed, delete the documents it created, and delete itself.
- **A fixture a spec creates should be removed BY THE APP, not by a `curl -X DELETE`.** The dialog verification of
  2026-08-31 registered a trade to have something to arm: deleting it through the ledger's own button re-ran the
  replay that rebuilds the asset's quantity and PMC, which a REST delete would have skipped, leaving the asset
  inconsistent with a register that no longer holds the row. Loop the deletion rather than removing one row: an
  earlier failed run may have left its own.

---

## 6. Quick-Fix Reference

- **A domain rule copy-pasted into a 3rd file will diverge, and the divergent copy is the one users see**
  (`assetPricing.ts` is the worked example).

### Audit habits
- **An `isError` branch above a service that never rejects is decoration.** Before wiring a surface's failure state,
  read the service: a `catch` that returns `[]`, `0` or a defaulted object turns every failure into a truthful-looking
  answer, and the branch can never fire (`getAnnualCashflowData` did exactly that until 2026-09-01).
- **"Keep" verdicts need the same grep as "Delete" verdicts.** A wrong Delete breaks the build immediately; a wrong Keep
  burns a whole commit polishing a component with zero importers.
- **A doc comment naming a caller is a claim, not evidence — grep it**, and when the grep contradicts the comment fix the
  comment in the same commit. This covers page/component docstrings, not just the `.md` files.
- **Knip marks a dead chain's intermediate links "live"** because the orphan still imports them: trace the call graph
  inward, verify each link independently, and delete the whole chain in ONE commit. Likewise **a function that always
  returns `[]` keeps its whole downstream pipeline "live"** — read the function that decides *what* gets captured.
- **A green mechanical check that has never been seen red is indistinguishable from one asserting nothing** — and that
  includes the check's own arithmetic: filtering values by magnitude to drop chart-axis ticks also drops a legitimate
  reading of the same magnitude. Break the thing under test on purpose once.
- **The fixture can make a branch unreachable, and the test stays green for the wrong reason.** `allocateByShare`'s
  rounding correction cannot fire on two shares (they always cancel), so a two-person fixture passed with the branch
  disabled; the same shape appears wherever a guard only bites past a threshold the fixture never crosses. When
  falsification does NOT turn a test red, the test is the bug — not the falsification.
- **An assertion of ABSENCE needs a positive anchor first.** `expect(locator).toHaveCount(0)` passes instantly against
  a page that has not rendered, so it is green in every state including the one it is meant to catch. Wait for
  something that IS expected in both states (a `forceMount` panel is ideal — attached, not necessarily visible), then
  assert the absence. A browser check that never saw the feature ON has proven nothing about the feature being OFF.

### Per-page blind spots

The list of "looks like a bug, is not" behaviours moved into the domain guides: **each
`doc/guide/<page>.md` ends with its own *Per-page blind spots* section.** Read it before
"fixing" anything on that page. The entries were moved verbatim from CLAUDE.md's Known Issues
(three pages 2026-08-28, three 2026-08-29, the rest 2026-08-30); CLAUDE.md keeps only the
cross-cutting ones. The single blind-spot that is not per-page stays in
*Data and State Patterns → Dialog e form trasversali* above.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
