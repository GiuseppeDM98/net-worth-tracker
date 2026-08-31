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
| `COMMENTS.md` · `DEVELOPMENT_GUIDELINES.md` | How to write code and comments here |

---

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
- **`ResponsiveModal`** is the convergence target for form modals (`max-w-4xl` default, footer resolved by the caller,
  `Description` handled internally); small confirms and the 2-step `AssetDialog` may stay plain `Dialog`s.
- **`DialogDescription`/`DrawerDescription` is required** in every `DialogContent`/`DrawerContent` (`sr-only` if it
  should not show); never silence the warning with `aria-describedby={undefined}`.

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

### Impostazioni — tessere senza verdetto (`app/dashboard/settings/page.tsx`, `lib/utils/settingsNarrative.ts`)
- **The page has NO verdict and must not grow one.** A configuration page measures nothing, so there is no question for
  a sentence to answer; what it keeps is the CADENCE — compact header + `PageTabBar`, then a 12-column grid where every
  group of settings is a `Tile`: eyebrow = the group, ONE reading line stating the current state in words, controls
  below. `settingsNarrative.ts` therefore exports 22 `describe*` functions and NO `build*Verdict`.
- **A reading declares the effect DOWNSTREAM, not the control under it.** «Base gestita: fondi pensione e asset esclusi
  restano fuori» beats «due interruttori»: the reader is deciding, and a setting they cannot place is one they will not
  trust. The Narrative Honesty Rule holds — a missing input drops its clause and says what stalls without it («senza il
  risk-free rate l'auto-calcolo dei target non parte»), never a placeholder.
- **A field another page OWNS is DECLARED, never edited here** (The Declaration-Tile Rule, DESIGN.md). «Parametri del
  piano» and «Assistente» are read-only tiles: label · mono value rows (`DeclarationRow`) and a footer that LINKS the
  write surface. Two reasons, both structural: the FIRE parameters save from FIRE › Calcolatore/Coast FIRE, and a
  second surface would be a second write path (see the Dividendi Save above); the assistant's preferences live in its
  memory document and the settings doc is a MIRROR THAT LOSES ON READ (`lib/server/assistant/store.ts` prefers the
  stored value), so an edit made here would be silently overwritten. A never-synced mirror prints no default — the
  reading says where the truth lives instead.
- **The applicative default is named as a default**: «pensione INPS a 67 anni (predefinita)» — printing 67 like a saved
  choice tells the reader they decided something they did not. The RITA age is never derived here: it comes from
  `resolveRitaUnlockAge`, the app's one unlock rule.
- **The color theme saves itself, the rest waits for Salva.** `setColorTheme` writes through `ColorThemeContext` and the
  Modalità pill through next-themes, both outside `handleSave` — say so in the tile's footer, or the page promises a
  save that never happens. The Modalità reading is `null` before hydration (`useSyncExternalStore`, the ThemePicker
  guard): the mode genuinely does not exist server-side, and guessing it is a hydration mismatch.
- **`ExpenseImportSection` and `AccountSharingSection` render their own `Tile`** — the page places them in a grid cell
  and passes nothing but their props. Their reading lines come from the same pure module, so the wizard's phase
  («142 voci da importare, 6 righe scartate, 3 categorie da creare») and the grant list are stated in words before the
  controls, like every other tile.

### Accesso e Registrazione (`app/login/page.tsx`, `app/register/page.tsx`, `components/auth/*`, `lib/utils/authNarrative.ts`)
- **ONE tile, no grid.** A form is a single tile, and a 12-column grid of one cell is a grid pretending. The page is a
  420px column — eyebrow, `PageVerdict`, the `Tile`, the secondary link — inside `AuthShell`, which both pages share.
  `p-5 desktop:p-6` on that tile is deliberate and the only place the 24px padding is still right (DESIGN.md → Cards).
- **The verdict is the PRODUCT's promise, but it is still generated.** These pages measure nothing, so the sentence
  cannot be a reading of data — it is a claim about the app. It is nonetheless built by rules over the page's state
  (`buildLoginVerdict`, `buildRegisterVerdict(access)`), never written in JSX, so the whitelist clause can honestly
  disappear and every phrasing is pinned by a test. The tone stays `neutral` in every state: a promise that flipped to
  `negative` on a mistyped password would be the page disowning itself over a typo.
- **The tile's reading IS the form's status line** (The Status-Is-The-Reading Rule, DESIGN.md). `describeLoginStatus` /
  `describeRegisterStatus` return an `AuthReading` — the words plus a tone — for idle · submitting · success · error,
  and `AuthStatusLine` paints the negative tone `text-destructive`. Two traps. The container's role must NOT swap
  between `status` and `alert`: it is a different node to the accessibility tree, and the swap can announce nothing at
  all — it stays one stable `role="status" aria-live="polite" aria-atomic="true"`. And `NarrativeText` colours only
  `mono` segments, so a prose sentence cannot carry its own colour through a `sign`: the tone is applied by the
  component, which is why `AuthReading` exists instead of a bare `Narrative`.
- **`describeAuthError` is the ONE translation of a failure, and an unknown code never falls through to the provider.**
  Firebase throws «Firebase: Error (auth/invalid-credential).» — English, provider-named, code in parentheses: a log
  line, not a sentence. 14 codes are mapped; anything else takes a sentence that claims nothing about the cause
  (Narrative Honesty applied to an error). Adding a case is a line in `AUTH_ERROR_TEXT` plus its test.
- **A code must survive the context layer.** `AuthContext` used to rethrow `new Error(error.message)`, which DROPS
  `code` and leaves the page nothing to map. Use `withCode(message, code)` and, in a catch, rethrow an `Error` as is.
  The 403 of `/api/auth/check-registration` carries `code: 'registration/not-allowed'` for the same reason: the words
  live in the pure module, so a copy edit in the route can never change what the reader sees.
- **`resolveRegistrationAccess` MIRRORS `isRegistrationAllowed` — deroga included.** With the whitelist on, a listed
  email registers even while `NEXT_PUBLIC_REGISTRATIONS_ENABLED` is `'false'` (SETUP.md → Step 5b relies on it to
  onboard a shared-account guest). So `whitelistEnabled` wins in BOTH directions and only "registrations off AND no
  whitelist" resolves to `closed`. If the server's precedence ever changes, change it here in the same commit: a page
  promising a closed door the server leaves ajar is worse than no page.
- **The password rows are the two rules the submit actually enforces**, read from the same predicate
  (`evaluatePasswordRequirements` → `arePasswordRequirementsMet`), so the screen and the validation cannot disagree.
  The match rule stays UNMET on two empty fields — they are equal, but nothing was typed. A met row takes the check
  icon and `text-foreground`, **never `text-positive`**: the sign tokens mean money gained and lost, and a satisfied
  requirement is neither.
- **The submit stays enabled with the rules unmet** (as before the redesign) and answers with the reading; a disabled
  submit is a new gate and hides its own reason from the keyboard. On SUCCESS the form freezes instead: the redirect
  lives in the `useEffect` watching `user`/`authLoading`, and an unfrozen form during that beat invites a second
  submit that races it.
- **The demo button is env-gated, Google is not.** `NEXT_PUBLIC_DEMO_EMAIL` + `NEXT_PUBLIC_DEMO_PASSWORD` decide
  whether the demo exists at all; Google renders unconditionally and fails at click time if the provider is off in the
  Firebase console (`auth/operation-not-allowed`, mapped). Do not "fix" that by hiding the button behind a flag that
  does not exist.

### Auto-Calculated Targets (`lib/utils/equityBondsAutoTargets.ts`)
- **The Bull's formula prescribes an EQUITY share and says nothing about the other classes, so they are funded out of
  Azioni**: `bonds = 100 − formula`, `equity = formula − other`. Charging them to the bond sleeve makes the *defensive*
  allocation the shock absorber for every satellite and drives it to ~0%.
- **Derive the second member of a percentage pair from the ALREADY ROUNDED first one**, never from the raw input twice —
  rounding both yields totals like 100,01%, and the total is what Save validates. Generalise: *when two values must sum
  to a constant, round one and subtract.*
- **An effect that sums over an `AssetClass` union must list that same union in its deps**, or a newly added class
  enters the sum without re-triggering the effect.
- Equity floors at 0 when the other classes exceed the formula's share and the overflow falls back on bonds: preserving
  the 100% total beats preserving the bond share, because a wrong total blocks Save.

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

---

## 3. Domain Rules

### Expense Grouping: key by id, label by name (`lib/utils/expenseGrouping.ts`)
- **Category names are NOT unique and never will be** — the product deliberately allows "Casa" as both a *Spese Fisse*
  and a *Spese Variabili* category, so anything keyed on `categoryName` merges them.
- **The one rule: group by `getCategoryKey`/`getSubCategoryKey`, display via `resolveDisplayLabels`.** `getCategoryKey` =
  `categoryId || trimmed name || UNCATEGORIZED_LABEL`; `getSubCategoryKey` maps missing/blank to `NO_SUBCATEGORY_KEY`, a
  key like any other — which is what lets callers drop their `=== 'Altro'` special cases.
- **`resolveDisplayLabels` qualifies ONLY where the rendered surface actually collides**: ambiguity is measured over the
  set of KEYS per name, not a row count. `selectExpensesForDrillDown` matches the type **EXACTLY** — `type !== 'income'` would lump
  fixed+variable+debt together and let transfers through.

### Expense Sign Convention and Type Changes
- Income positive, expenses negative, net savings = `sum(income) + sum(expenses)`; crossing the boundary flips the sign.
- **Classification is ALWAYS by `type`, never by the sign of `amount`** (`transfer` skipped, `income` income, everything
  else spending via `Math.abs`) — by sign, a refund counts as income. Fixtures must carry an explicit `type`.
- **`ExpenseDialog` type change is shape-aware across all five types**: `reconcileTransferEdit`, `reconcileSingleEdit`
  and the two cross-shape edits, which reverse the OLD shape and apply the new one in one delta-map transaction.
  `updateExpense` re-derives the sign from the incoming type and nulls `transferCashAssetId` when it leaves transfer.
  **That control lives in EDIT mode only** — creation picks the type in step 1 (→ *Two-Step Create Dialogs*), so the
  reconciliation paths above are reachable exclusively from a saved row.
- **The BATCH paths refuse to cross the transfer boundary** (`crossesTransferBoundary`): `updateExpensesType`,
  `moveExpensesToCategory`, `moveExpensesFromSubCategory` throw `TransferBoundaryError` when expenses exist, since each
  row would need its own destination account.
- Changing the type always invalidates the category (categories are type-scoped) — `resolveEquivalentCategory` re-points
  to the same-named one under the new type.

### Recurring Series (`lib/utils/recurrenceDates.ts`)
- **A recurring expense is not a rule, it is N documents.** `createRecurringExpenses` materialises the whole series as
  real future-dated rows sharing a `recurringParentId`, which is why Cashflow, Analisi, Budget and the assistant know
  nothing about recurrence — and why the form states how many rows it is about to write, and over which span.
- **`canTypeRecur` is the single source on which types may recur** (`fixed`/`variable`/`debt`). `income` is a product
  decision; **`transfer` is structural** — each occurrence moves TWO accounts while the series reconciles balances only
  on its FIRST entry, so a recurring transfer needs a two-legged reconciliation that does not exist. Widening the set
  also breaks `createRecurringExpenses`' unconditional `-Math.abs(amount)`.
- **Both ceilings in `MAX_RECURRENCE_OCCURRENCES` (360 monthly / 40 yearly) exist to stay under 500**: the series is
  created in ONE `writeBatch` and `deleteRecurringExpenses` removes it in one too. Raising either past 500 means
  chunking both.
- **`new Date(y, m, 31)` rolls February forward into March** — the clamp must cap the day against the real length of
  the TARGET month before constructing the Date, never fix up an already-overflowed one.
- **An absent `recurringFrequency` means monthly, never unknown** (rows predate the cadence): read it through
  `resolveRecurrenceFrequency`. A yearly series' MONTH is not stored — it is the month of the row's own date, which
  every occurrence shares by construction, and `describeRecurrence` is the only place that turns that into words.
- **`recurringCount` is form-only and must never reach Firestore**: `updateExpense` spreads whatever it is handed, so
  the edit path passes it as `undefined` explicitly. The toggle itself is **creation-only** — the length of a saved
  series is not editable from one of its rows.

### Expense CSV Import (`lib/utils/expenseImport.ts`, `lib/services/expenseImportService.ts`)
- Impostazioni → Spese. A pure parse → validate → plan layer with a MANDATORY preview before any write; every row of
  one import shares an `importBatchId`, which is what the one-tap undo deletes by. Category identity is **(name,
  type)**, never the name alone. `transfer` rows are rejected and cash balances are never touched by an import.

### PDF Export (`lib/utils/pdfGenerator.tsx`, `lib/services/pdfDataService.ts`, `lib/utils/pdfTimeFilters.ts`)
- Seven configurable sections with a Total/Annual/Monthly filter. On Cashflow, **Export Totale applies
  `cashflowHistoryStartYear` as a floor** (fallback 2025); Storico, Rendimenti and FIRE stay unbounded — do not "fix"
  the asymmetry, the cashflow before the floor is bulk-imported noise.

### Cashflow Drill-Down: One Landing Path
- **There is ONE drill destination and ONE transaction list**: every entity entry point on Analisi (a category row, a
  Fuori scala row, a Spese maggiori row, a Sankey node, `EntitySearch`, a Confronto row) lands through
  `handleEntitySelect` in `AnalisiTab.tsx`, which resolves labels exactly like a URL-restored focus and opens the
  Scheda tile. A new entry point calls that handler only.

### Sankey: node identity is the node id (`lib/utils/cashflowSankey.ts`)
- **d3-sankey resolves link endpoints through a `Map` of ids**, so a duplicate id keeps the LAST node and orphans the
  earlier one as a zero-value ghost. Ids are built from **ids**, never display names.
- **The type belongs inside the category id** (`cat:{tipo}:{chiave}`), because without that prefix an income and an
  expense category of the same name close a cycle through Budget and `computeNodeDepths` throws `"circular link"`,
  blanking the chart. **Ids are opaque**: `index` is the only sanctioned way to ask what a node is.

### Analisi — a verdict over tiles (`components/cashflow/AnalisiTab.tsx`, `components/cashflow/analisi/*`, `lib/utils/{analisiSummary,analisiNarrative}.ts`)
- **ONE axis, three modes** (Anno corrente | Anno | Storico, plus a month): `PeriodMode`/`AnalisiPeriod` live in
  `analisiSummary.ts` — never import them from the component (`ConfrontoAnnualeSection` used to). The axis sits beside
  the verdict from `desktop:` and under it below; the entity search is the compact header's action. Declare
  `handlePeriodModeChange` AFTER `availableYears`, or the React Compiler refuses to preserve the page's memoization
  ("Compilation Skipped" on the first `useMemo`s).
- **Every number has one source**: `summarizePeriodCashflow` (totals), `computeTotalsPacing` + `buildCategoryComparison`
  through `resolveComparisonScope` (the pacing and the movers, against year−1), `buildExpenseComposition` /
  `buildIncomeComposition` (the category tiles, FULL lists), `rankTopExpenses`, `buildMonthlySpending` /
  `buildYearlySpending`, `summarizeFlow`, `detectSpendingAnomalies` on `resolveSingleMonth`, `computeEntityRunRate` +
  `buildEntityYearRows` for the Scheda's reading. **Every sentence** comes from `analisiNarrative.ts`
  (`buildAnalisiVerdict`, the `describe*`) or from `cashflowNarrative.ts` (`describePeriodCashflow`,
  `describeCategoryShare`), never from a component.
- **The axis has FOUR modes** (`Da inizio anno | Anno corrente | Anno | Storico`): `ytd` and `current` are not the
  same window and must never be treated as one — see the Tracciamento section. `resolvePeriodThroughMonth` is the ONE
  place that says where a period stops (today's month for `ytd`, a picked month, otherwise nothing), and it feeds both
  the slice and the monthly chart. `resolvePeriodMonthCount` was deleted with the verdict's «(8 mesi)» clause.
- **The running year is NOT clipped** (2026-08-28): `periodExpenses` takes the whole calendar year and
  `resolvePeriodMonthCount` returns 12 for it, so the verdict lost its «(8 mesi)» clause and gained the shared
  `scheduledSentence` instead; the Periodo aside reads «12 mesi · 4 in calendario». The pacing is untouched — it always
  computed both sides off `allExpenses` under `sameMonths`, so it stays the one honest comparison. See the Tracciamento
  section for the rule in full.
- **«Fuori scala» is an Off-Axis tile**: the anomalies run on ONE month (`resolveSingleMonth`: the picked one, or
  today's for the bare running year); the aside names it, and the verdict's clause names it too unless the period IS
  that month. When no month can be meant (a past year without a month, the history) the tile is ABSENT and Spese
  maggiori takes 7 columns — never an empty tile with a placeholder.
- **The Periodo tile paces against year−1 only**, with ONE caption under the KPI trio (`pacing.baselineLabel`
  verbatim); `CashflowKpiTrio` (shared with Tracciamento) prints only the arrow and the figure when `previousLabel` is
  null. Its bars draw the previous year's same month in `--muted-foreground` beside the current bar; `prevYearValue` is
  null — a gap — below the history floor OR when the previous year has no rows at all (the same refusal
  `computeTotalsPacing` makes), the running bucket is at half tone and outlined, and in Storico the series is per year.
- **The Scheda is a tile of the grid** (`SchedaTile`, 12 columns under the category tiles): every entry point lands
  through `handleEntitySelect`, which resolves labels exactly like a URL-restored focus and owns the ONE scroll
  (`scrollToScheda`, deferred a tick so the cell exists). The focus SURVIVES period changes and is exited only via
  the breadcrumb, «Indietro» or «Chiudi»; in the URL it is three FLAT params (`?focusType&focusCat&focusSub`),
  because a name-fallback key IS a name and can contain any delimiter. The category tiles keep their rows while the
  Scheda is open: `activeKey` marks the focused row `aria-current` and FORCES the list open when the row sits past
  «Mostra tutte». The series colour is derived from the kind at render (`COLORS[0]`/`COLORS[1]`), never stored.
- **`EntityDossier` keeps ignoring the axis in its multi-year blocks** (the period is a cursor over the entity's
  timeline, not a cage) and each block names its window; `columns` lays it out in two columns inside the Scheda and
  `aside` receives the period's subcategory ranking (category level) or `FocusTransactions` (subcategory level).
  Each year row expands into its per-subcategory deltas through `resolveYearRowWindows`, which is what makes
  `Σ(subcategory delta) === row.delta` true by construction — category level only. Its percentages go through
  chartService's `formatPercentage` (the Comma Rule; `toFixed` retired here on 2026-08-25).
- **`lib/utils/comparisonDeltas.ts` is the single source of the same-months rule, scope included**:
  `resolveComparisonScope` serves the Periodo pacing, the verdict and the Confronto, and returns **null for a month
  that has not started**. **Honesty rule**: `prevYearValue` is `number | null` — a baseline below the history floor is
  UNKNOWABLE, not zero, and renders as a gap. The Confronto's comparison year is the USER'S pick (the Periodo tile
  always paces against year−1): `ConfrontoDisclosure` owns that state and computes pacing, delta rows and the reading
  ONCE, then hands them to `ConfrontoAnnualeSection`, which only renders (and builds the two chart series it alone
  needs). Never recompute the rows in the section.
- **`CashflowSankeyChart` is a plot, `FlussoTile` is the navigation**: the tile owns the subcategory toggle
  (`aria-pressed`) and the single type drill, builds the `SankeyView` with the pure builders and passes it down;
  node clicks come back as DESCRIPTORS (`view.index`), never parsed from the id. Colours stay hex (react-spring).
- **`RankedRows` is a real `<ul>`, and a clickable row is a real `<button>` inside its `<li>`** — named
  «{label} · {caption}, {amount}, {share}%» (the caption is the day and the subcategory of a single expense) with
  `aria-current` on the focused one. Never `role="listitem"` on the button (the `CompositionList` habit): the explicit
  role wins and strips the button semantics, so a screen reader announces a list item with no cue that it acts. **A `Tile` head WRAPS** (`flex-wrap`): an aside carrying controls (a pill, a
  select, two actions) drops under the eyebrow on a phone instead of pushing the tile past 390px — the first collaudo
  run measured 30–95px of horizontal scroll on the Scheda and the disclosures before it did.
- **Playwright**: `getByRole('region', { name: 'Periodo' })` also matches «Verdetto del periodo» — pass `exact: true`;
  the rows are located by role `button` (not `listitem`), and a Spese maggiori row is named after its category too
  («Casa · 15 gen · Condominio, …»), so scope a `/^Casa, /` locator to its tile. The analisi projects seed their own account (every row in January).

### Cashflow › Tracciamento (`components/cashflow/ExpenseTrackingTab.tsx`, `components/cashflow/tiles/*`)
- **ONE period axis, two slices.** `expenses` = `filterExpensesByPeriod(allExpenses, period)` feeds the verdict and
  every tile; `filteredExpenses` = `applyListFilters(expenses, …)` feeds ONLY the Movimenti list (its aside says
  «12 di 47 voci» while narrowed, its reading counts the filtered rows). Before the redesign the toolbar also
  narrowed the KPIs — a savings rate computed over «Alimentari» is not a savings rate. Never route a tile through
  `filteredExpenses`.
- **Every number is born in `lib/utils/tracciamentoSummary.ts`** (`summarizePeriodCashflow`, `previousPeriod`,
  `computePeriodDelta`, `resolveAnchorMonth`/`resolveFlowWindow`, `buildTrailingMonthFlows`,
  `summarizeSavingsHistory`, `rankCategories`, `summarizeMovements`, `resolvePeriodCalendar`), every sentence in
  `cashflowNarrative.ts` (`buildCashflowVerdict`, `describePeriodSubject`, the `describe*` readings). Classification
  is by `type`; spending is a magnitude (`Math.abs`, the `calculateTotalExpenses` convention) and income a signed
  sum, so a refund raises the category and a reversed salary lowers income.
- **The previous period is honest or absent**: month → previous month; a closed year → the previous year; **a year
  still running → the SAME months of the previous year** (`previousPeriod(period, now)` returns a custom Jan 1 → end
  of the anchor month window, named «su gen–ago 2025» — eight months against twelve read as a drop by construction,
  which is what the old tab's `null` avoided); custom range → `null`. With a null predecessor every delta, the «su
  luglio» clause and the «vs luglio» captions disappear. A zero base is `null`, never `0%`, and a delta is judged
  on the PRINTED figure (`printedDelta`: 0,04% is «invariate»).
- **A period is its WHOLE calendar span, and what has not happened is DECLARED** (2026-08-28, changed from the
  year-to-date clip that shipped with the redesign). `filterExpensesByPeriod(expenses, period)` takes no clock:
  «il 2026» is January → December even in August, so a materialised instalment due in October is in the tiles AND in
  the list. `summarizeScheduled(expenses, now)` carries the part still ahead, and `scheduledSentence` — defined ONCE in
  `cashflowNarrative.ts` and imported by `analisiNarrative.ts` — closes both verdicts with «In calendario ci sono
  ancora 1850 € di spese e 500 € di entrate.» **The verb agrees with the AMOUNT, never with the number of clauses**:
  «1850 €» is plural however few clauses follow it, and only a lone «1 €» takes «c'è» — «1 €» meaning the figure AS
  PRINTED, so 1,40 € counts (the `articleForPercent` rule, applied to a verb). The sentence CLOSES on how far the
  figure reaches — «… da qui a fine mese / a fine anno / al 20 marzo» — and that horizon is the **period's** end, not
  the last scheduled row's: the amount is bounded by the window the reader is looking at, so «361 € entro ottobre»
  would be a different and smaller claim. Two resolvers, one per period type (`describeScheduledHorizon` for `Period`,
  `describeAnalisiScheduledHorizon` for `AnalisiPeriod`), both returning null where no end can be named (the history),
  so the clause is dropped rather than guessed. **The clause is a DECOMPOSITION and must say so**: it opens on «Nel
  totale» and closes the amount with «già in calendario», because the figure it names is INSIDE the total the verdict
  just printed. The bare existential form shipped until 2026-08-30 and read as an addition — «spese 2910 €. In
  calendario ci sono ancora 1850 €» invites the reader to sum to 4760 — and Centri di Costo says the same words about
  a total that genuinely EXCLUDES them, so on Tracciamento and Analisi the words have to be unambiguous.
  **A row dated after today is `isScheduledRow`** — after TODAY, by Italian calendar DAY and never by instant
  (`isItalyDayAfter`): a row saved from the dialog carries its creation time and the page's `now` is frozen at mount,
  so an instant comparison chipped a spesa recorded an hour ago. The same day rule governs `splitSpendingAtDate`,
  `budgetUtils`' two splits and `costCenterSummary`'s `isBooked`, so the four surfaces agree on what «oggi» is.
  A scheduled row takes the chip «In calendario» in the feed, the table and the detail drawer, and its amount drops
  the sign colour (the sign tokens mean gained and lost, and it is neither yet). The two month charts draw the months not started at reduced opacity, never outlined — the
  outline stays the month in progress. **The figures of a running year therefore contain a forecast; that is the
  owner's decision, and the page says so.**
- **«Da inizio anno» is a period of its own** (`Period` gained `{ kind: 'ytd'; year; throughMonth }`, and Analisi's
  `PeriodMode` gained `'ytd'`): January → the end of today's month, the window the whole-year rule above deliberately
  no longer is. `throughMonth` is STORED, never read off a clock, so `periodToRange` stays pure and the period is a
  fully-described value; the picker fills it from today. It is a kind and NOT a custom range because it HAS an honest
  predecessor — the same months a year earlier, `{ kind: 'ytd', year: year − 1, throughMonth }` — and a name of its
  own («2026 · gen–ago», never the bare year, which is a different period). Its subject is «Nel 2026 finora» on both
  pages, and it is the ONE window with no forecast in it, so `resolveComparisonScope` keeps it on `sameMonths`: the
  headline and the percentage measure the same months on both sides. **`'current'` compares FULL YEARS** since
  2026-08-30 (owner's call): its period spans gen–dic, so a `sameMonths` delta printed beside a whole-year total put
  two windows in one sentence. The cost is stated in that function's docblock and must not be silently reverted — the
  current side's remaining months hold only what is already booked, so the delta is biased DOWNWARD as the year runs,
  and it is the verdict's scheduled clause that keeps it honest. **It is NOT a window without scheduled rows** (corrected
  2026-08-30, three comments in the codebase claimed it was): `periodToRange` closes it on `endOfMonth(throughMonth)`,
  i.e. the END of today's month, so it carries the rest of this month — which is why
  `describeAnalisiScheduledHorizon` answers «a fine mese» for it. **Two conventions now coexist on purpose**: `expenseEntityStats` (a category's Scheda) and `cashflowNarrative` (Tracciamento) still measure a running year on the same months of the year before. They are honest because each NAMES its base («sugli stessi mesi del 2025»), so they were left alone — aligning them is a separate decision, not a cleanup.
- **Two windows stay anchored to today, on purpose, and must not be «fixed» to follow the period.**
  `resolveAnchorMonth` anchors the trailing SAVINGS HISTORY, which is history and must not run into months not lived
  (`resolveFlowWindow` is the period's own chart and does cover all twelve). `currentComparisonWindow(period, now)`
  scopes the DELTA's current side to January → the end of today's month, because the previous year has no December to
  match: twelve against eight is a rise by construction, the mirror of the drop `previousPeriod` already refuses. Both
  sides then cover gen–ago and `describeComparisonPhrase` names it. Analisi reaches the same place through
  `resolveComparisonScope` → `sameMonths`, which already computed both sides off `allExpenses`.
- **The month-end projection** exists only when the period IS the current Italian month (`resolvePeriodCalendar`)
  and extrapolates only what is booked up to today (`splitSpendingAtDate`): a row dated after today is added as it
  is, never scaled by the days left. The Panoramica's CashflowTile applies the SAME split through the payload's
  `currentMonth.expensesScheduled` (`DASHBOARD_OVERVIEW_SOURCE_VERSION` 10; absent → 0 on older cached payloads),
  so the two pages print one projection — the 2026-08-22 mismatch (6164 vs 5734) was exactly this rule applied on
  one page only.
- **Month windows are anchored** (`resolveAnchorMonth`): a month on itself, a year on today's month when current (the
  future is not data) and on December when past, a custom range on the month of its last day. The hero's bars take
  the trailing 6 (a year takes its own months from January), the savings history the trailing 12; both series are
  gap-free and bucketed by `getItalyYear`/`getItalyMonth`, while the period slice uses `periodToRange` (local time) —
  the same split `cashflowTimeSeries.ts` already lives with. **The running month is drawn but never ranked**
  (`summarizeSavingsHistory(months, now)` → `ongoing`/`closedCount`): its salary is in and its spending is not, so it
  would be «il mese migliore» by construction; the reading says «su 11 mesi chiusi». A window is called «ultimi N
  mesi» only when it ends today (`describeMonthWindow`/`describeFlowWindow`), else it is named by its bounds.
- **Italian tense is data**: `describePeriodSubject` returns `ongoing` (the current month/year, a custom range whose
  `to` is today or later) and the headline conjugates on it («sta andando bene» / «è andato bene», «tiene» / «ha
  tenuto»); the article before the savings rate follows the figure AS PRINTED (`articleForPercent(rate, 0)`, now
  exported from `patrimonioNarrative.ts` with `ofThePercent`). Tones: ≥ 20% positive, 0–20 neutral, a deficit or
  spending without income negative, no movement neutral.
- *Risparmio* (€) and *Rapporto* (`income/expenses`, printed «1,67×» through `formatNumber`) encode the same
  relationship in different units and are kept together **on purpose** — do not "deduplicate".
- **Feed delete = drawer-confirm, not 2-click**, and `deleteSingleExpense` MUST branch on `type === 'transfer'` to call
  `reconcileTransferDelete` (both legs), like `ExpenseTable` does. The feed keeps `surface="flat"` on every width (a
  card per day inside the Movimenti tile would be a card inside a card); `ExpenseTable` is desktop-only, so with the
  «Tabella» view selected the tile renders the table `hidden desktop:block` and the feed `desktop:hidden`.
- **Two pieces of state are derived, not reset**: the feed's visible window is stored WITH the filter key it was
  opened under (`feedWindow`, falls back to the first page when the key changes) and the account filter is read
  through `effectiveAccountId` (an account absent from the period is no filter) — both were `setState` in an
  effect. `filteredExpenses` is deliberately NOT wrapped in `useMemo`: the compiler could not preserve it and the
  skip un-memoized the whole component.
- **`CategoryTile` takes an optional `reading`** (the Panoramica passes none): the rows keep the overview payload's
  shape (`category`, `categoryKey`, `amount`, `percentage`) so `rankCategories` feeds the same component, and the
  residual row appears only when categories were cut.
- **Below `desktop:` the period stays under the verdict and the filters move INTO the Movimenti tile**
  (`MobileFiltersDrawer showPeriod={false}` in the tile's `mobileToolbar` slot): the drawer narrows that list, and
  four tiles away from it the badge read as unrelated. «Ripristina» (desktop toolbar and drawer alike) resets the list
  filters and the sort, **never the period** — the axis belongs to the picker — and `hasActiveFilters` no longer
  counts a non-current month as a filter. The landscape «Aggiungi» button lives beside the period
  (`max-desktop:portrait:hidden`): in portrait the bottom-nav FAB (`cashflow:add-expense`) is the only add
  affordance, in landscape the FAB is gone.
- **Hover readings are one primitive** (`components/ui/chart-hover.tsx`): `useChartHover(count, 'slot' | 'nearest')`
  returns `enabled` (`(pointer: fine)` via `useMediaQuery`), the index and the pointer handlers; spread the handlers on
  the `relative` plot box only when `enabled`, so a touch device never mounts the overlay. The tip is HTML, never an
  SVG element — a `preserveAspectRatio="none"` plot would stretch it — and `NetWorthSparkline`'s overlay is
  `absolute inset-0` against the CALLER's positioned box (the hero's), which is why `interactive` requires one.
- **Asides, footers and chart sub-eyebrows are `Narrative`s, not strings** (`describeMovementsCount`,
  `describeDeficitMonths`, `describeMonthWindow`, `describeFlowWindow`) rendered through `NarrativeText`, so every
  count and year in them is mono — the Tile's `aside` slot carries no `font-mono` of its own.

### Cashflow › Dividendi (`components/dividends/DividendTrackingTab.tsx`, `components/dividends/tiles/*`)
- **RECEIVED AND ANNOUNCED ARE NEVER ONE FIGURE.** A dividend whose `paymentDate` is in the future is
  a promise, not income: it is counted, totalled and coloured apart on every surface — its own chip in
  the hero, two `tfoot` rows in the table, a muted amount and an «Attesa» badge in the row, a fainter
  wash in the calendar cell, its own subtotal in the day dialog, its own clause in every reading.
  `summarizePayments` returns the two halves and no sum; there is deliberately no "total" field to reach for.
- **ONE period axis, and the announced money is ON it.** `DividendPeriod` (Mese | Anno | 12 mesi |
  Storico) sits beside the verdict from `desktop:`. `resolvePeriodBounds` is the ONE window — upper
  bound = the end of the period's own unit, **not today** — and everything reads it:
  `filterPaidByPeriod` = in-window AND paid (the income figures), `sliceForList` = in-window
  (the list, received and announced alike), the hero's «già annunciati» chip and its «Prossimi
  pagamenti» footer, and the calendar's navigation clamp. The first cut left announced rows
  unbounded and it showed: a BTP final premium dated 2032 sat in the «agosto» list, and the chip
  printed 127 € beside a list holding one 57 € coupon. *An unscoped figure beside a scoped one is
  two windows in one tile.* The instrument/type filters narrow only the list; never route a tile
  through the filtered list.
- **The verdict's «il prossimo stacco è …» is the ONLY deliberately unscoped clause**, because it
  names an instrument AND a date and therefore states its own scope. When the period holds no
  announced money the sentence drops the total and keeps the date («Nessun pagamento incassato ad
  agosto; il prossimo stacco è ENI il 15 settembre.») — never «0 € sono annunciati».
- **The calendar cannot browse out of the window** (`bounds` prop): the arrows stop at its edges and
  are not rendered at all when the window IS one month — the picker is that axis, and an arrow
  leading to a month the slice cannot fill would present an empty month as a fact.
- **The Rendimento tile does NOT follow the axis, and says so.** YOC, current yield (TTM on the
  current holding) and DPS growth (closed calendar years) are the server's; the picker cannot change
  them. The aside reads «ultimi 12 mesi» and `describeYieldFooter` states the base. Generalise: *a
  tile measured on a window other than the page's axis must name its window, not pretend to follow.*
- **`useDividendStats` carries NO date bounds.** They only ever narrowed `periodStats`, a block the
  tab now derives in memory, while `yieldOnCostAssets`, `totalReturnAssets` and `dividendGrowthData`
  are TTM/all-time by construction — so the bounds bought nothing and cost a refetch per click, and
  they let a period change silently move figures that are not on the period axis. One query per owner.
  It also no longer follows the asset filter: that is the list's filter, not the portfolio's.
- **Every number is born in `lib/utils/dividendAnalytics.ts`** (`rankPayerShares`, `summarizeYearlyIncome`,
  `nextPayments`, `summarizePayments`, `resolveMonthlyWindow`, `buildCoverageMonths`, `summarizeYield`,
  `summarizeDpsGrowth`, `summarizeTotalReturn`, `sliceForList`), every sentence in `dividendiNarrative.ts`.
  `rankPayers`/`MAX_RANKED_PAYERS`/`buildMonthlyNetSeries`/`periodToDateBounds`/`computeUpcomingNet`
  were retired with the redesign — `rankPayerShares` is the ONE payer ranking and it carries the
  residual row the tiles need, and announced money is only ever counted on the period's window.
- **The running window is drawn but never ranked.** The current calendar year is a soft, outlined bar
  in «Per anno» and is out of the average, the best/worst and the reading — at the end of August a year
  two thirds done would be the worst year by construction. "Already passed the best closed year" IS a
  fact, so the sentence says it. Same rule as Tracciamento's running month.
- **A window it cannot draw is not drawn at all.** `buildCoverageMonths` returns `[]` past `maxMonths`
  (24): five years of coverage as sixty squares is not a reading, and a slice of the window under a KPI
  measured on the whole of it would put two windows in one tile.
- **Italian grammar is data.** `LARGEST_TYPE_PREFIX` gives each `DividendType` its article («la cedola»,
  «l'acconto», «il premio finale») and gives an ordinary dividend NO prefix — a list of dividends does
  not need to say "dividendo". Percentages go through `articleForPercent`/`ofThePercent`. The collaudo
  caught «il ordinario» exactly because the prefix was once built with string concatenation.
- **The two page-level actions talk through window events** (`cashflow:add-dividend`,
  `cashflow:scrape-dividends`), like Tracciamento's `cashflow:add-expense`: the header dispatches, the
  tab owns the dialogs. Both are desktop-only — on a phone the add button sits beside the period axis
  and is the ONLY add affordance there, since the bottom-nav FAB belongs to Tracciamento.
- **The list is a table where a table is right, and flat rows elsewhere.** `DividendTable` keeps the
  sortable grid from `desktop:` inside the tile (sub-eyebrow headers with `scope`, `th scope="row"`,
  13px mono cells, `-mx-5 px-5` scroll so it never takes the page with it) and becomes a `divide-y`
  list of buttons below it — a card per row inside a tile is a card inside a card. Its page is stored
  WITH the list length it was opened under, never reset in an effect.
- **The calendar has no card of its own**: the cell hairlines are the frame, and clicking a day opens
  its dialog. It no longer cross-filters the list (`focusedDate` is gone): with the calendar on screen
  the narrowed list it produced was invisible.

### Cashflow › Budget (`components/cashflow/BudgetTab.tsx`, `components/cashflow/budget/*`, `lib/utils/{budgetUtils,budgetSummary,budgetNarrative}.ts`, `lib/hooks/useBudgetConfig.ts`)
- **Opt-in**: `reconcileBudgetItems` only refreshes denormalized names and drops orphans, never auto-creates.
  `BudgetItem` fields are all required, fixtures included: `amount`, `period`, `kind`, `order`.
- **Period semantics** (`getPeriodActual`): monthly = current-month spend, annual = year-to-date, and annual budgets never
  enter `validateBudgetAllocation`. The **overall** budget is a ceiling on ALL month spending, while the validator sums
  only monthly expense *category* budgets. **Auto-save is paused while the allocation is invalid**, and the status
  («Salvato» / «Oltre il tetto: non salvato») is the Per categoria tile's aside (`role="status"`), not a bar of its own.
- **NO period axis.** A budget is always read on the current Italian month (`now` once per mount); the annual budgets
  are year-to-date and get their own tile whose aside names the window («2026, da gennaio · anno al 64%») — the
  Off-Axis Tile Rule — never a row in the monthly list.
- **ONE projection rule, the app's.** `buildSpendingForecast(split, amount, now, pace)` takes the month's spending
  SPLIT at today (`splitMonthlyTotalExpenses` / `splitMonthActualForItem`): the pace runs on what is booked to date
  and the scheduled rows are added as they are (`lib/utils/spendingProjection.ts`, which `overviewNarrative` re-exports
  for the Panoramica and Tracciamento). The 2026-08-23 redesign retired the blended model (last year's monthly average
  weighted in early in the month, `getOverallMonthlyBaseline`): three tabs printed two month-end figures for the same
  spending. `MIN_FORECAST_DAYS` (4) stays — before it `canForecast` is false, the verdict drops its pace clause, the
  hero's KPI prints «—», and nothing is «a rischio».
- **A FIXED category never follows the pace** (`resolveItemPace`: a `type`-scope item's own type, a category item's
  live category type, `fixed`/`debt` → `'fixed'`, unknown → `'variable'`): rent paid on the 1st, extrapolated by the
  day, reads «a rischio» all month. A fixed item's «Fine mese» is what is booked (no tilde) and the row carries a
  «fissa» chip. Every server caller passes categories (`weeklyBudgetEmailService` loads `expenseCategories` as
  `CategoryTypeRef[]`); the monthly email evaluates at month end, where pace is irrelevant.
- **Risk vs fact** (`rankCategoriesAtRisk` / `evaluateBudgetAlerts` + `summarizeAlerts`): «Categorie a rischio» lists
  monthly budgets whose projection exceeds their amount AND that are not over yet; a budget already over is a fact for
  «Avvisi» («Superato»). The evaluator still emits forecast-only alerts for the email, flagged `thresholdCrossed: false`;
  the tile filters them out and its footer counts them. No row in two tiles (DESIGN.md → The Risk-vs-Fact Rule).
- **Every number is born in `lib/utils/budgetSummary.ts`** (`summarizeCeiling`, `summarizeIncomeTargets`,
  `summarizeAnnualBudgets`, `buildCategoryRows`, `buildSpendingHistory`, `summarizeAlerts`), every sentence in
  `budgetNarrative.ts` (`buildBudgetVerdict` and the `describe*` readings; the settings' copy too —
  `describeCeilingSetting`, `ALERTS_SETTING_*`, `CEILING_SETTING_*`). Articles follow the printed figure
  (`articleForPercent`, `atThePercent` — «al 71%», «all'8%», «allo 0%»), and the gap in the verdict is measured on
  the projection AS PRINTED (3494,5 € prints 3495 €, so the gap is 505 €, not 506).
- **The calendar mark is the reading** (`BudgetTrack`): every expense track carries today's share of its window
  (month or year) as a 1px mark; an income target carries none. Fill colour is the budget's, not the sign's
  (`budgetProgressStyle.ts`: `--foreground` under the limit, `--warning-foreground` from 90%, `--destructive` over;
  income `--positive` only once reached).
- **Settings live below the grid** (`BudgetImpostazioni`, a Radix `Collapsible` open only while no ceiling is set);
  the phone's 44px shortcut under the verdict scrolls to `#budget-impostazioni`. Without a ceiling the hero's cell is a
  hidden spacer, never a faked tile, and the verdict passes the question to the category budgets.
- **The page-level action talks through a window event** (`cashflow:add-budget`, desktop-only in the header, like
  Tracciamento's and Dividendi's); on a phone the «Aggiungi budget» button under the verdict is the only add
  affordance of the tab: the bottom-nav «+» FAB belongs to Tracciamento alone (`AddExpenseFab` in
  `BottomNavigation` reads `?tab=` through `useSearchParams` inside its own `Suspense`; absent = Tracciamento).
- **The crossing day is a fact of the EXPENSE DATES, never a cron's memory.** `findCrossingDay(entries, limit)`
  sums the month's rows by Italian calendar day and names the first day the running total goes PAST the limit;
  `projectCrossingDay` walks the pace from tomorrow with the scheduled rows landing on their own day. A row dated
  after today can put the crossing in the future — the verdict then says «Lo superi il 28 con le spese già in
  calendario», headline «supererai» — and a backdated row moves it retroactively. Both feed `CeilingSummary`
  (`crossedOn`, `projectedCrossingDay`, `overBy`, `dailyPace`, `sustainablePace`) and `BudgetAlert.crossedOn`
  (monthly items and the ceiling; annual budgets cross on a date of the year, a sentence not told yet). The day's
  article is data (`dayRef`: «il 13», «l'8», «l'11», «il 1°», «dall'8»). The Tetto tile's second and third KPIs
  have TWO faces on `exceeded`: «Restano / Al giorno (per restare nel tetto)» becomes «Oltre (dal 22) / Al giorno
  = real pace (spesi al giorno · il tetto ne regge 65)» — «0 € al giorno» told nothing.
- **The ceiling IS historicised, by the cron, one document per month.** Phase 8 of `/api/cron/monthly-snapshot`
  (`captureBudgetHistory`) copies every `budgets/{uid}` into `budgetHistory/{uid}/months/{YYYY-MM}` every day
  (merge), so a month's record is its LAST captured configuration. The client never writes it (rule `allow write:
  if false`; read by `canAccess(userId)` — nested under the uid so a missing month reads `null`, not a permission
  error). `useBudgetHistory(ownerId, trailingMonthKeys(now, 6))` does six `getDoc`s by id (no composite index) and
  `buildSpendingHistory(…, records)` gives each month ITS ceiling through `resolveMonthCeilings`: the month's own
  when recorded, today's otherwise, with `ceilingSource` so `describeHistory` can say «il loro tetto» / «il tetto
  attuale» / «il tetto (il loro da lug, prima quello attuale)». The chart draws one dashed segment per month at its
  ceiling — a step where it changed. Months before the first capture read against today's, and the caption says so.
- **Two-click delete without a timer** (`useArmedDelete` in `PerCategoriaTile`): pointerdown outside, Escape or blur
  disarm; the hook takes the button's ref as an argument — returning the ref inside an object trips
  `react-hooks/refs` on every read of that object.
- **GOTCHA**: never reconcile items against `categories` while `categories.length === 0` (they load async) — every
  category budget is dropped as an orphan and a later edit can persist the empty set.

### Centri di Costo (`CostCentersTab`, `CostCenterDetail`, `components/cashflow/cost-centers/*`, `lib/utils/{costCenterSummary,costCenterNarrative,costCenterUtils,costCenterColors}.ts`)
- **NO period axis, by decision (2026-08-23).** A project's cost is its whole cost: every figure is lifetime («in
  totale») unless it names its window — `ytd`, `lastYear`, `trailingTotal`/`trailingAverage` (12 months), the
  ceiling's own `period`, `monthProjection`/`yearProjection`. The old `Mese|Anno|12 mesi|Sempre` picker,
  `filterExpensesByPeriod`, `computePeriodComparison` («vs precedente» has no honest predecessor without an axis),
  `projectAnnualCost`, `buildMonthlySeriesByCategory`, `buildComparisonSeries` and `CostCenterPeriod` are gone.
  Generalise: *a page whose question has no axis reads everything whole and lets each off-window tile name its
  window* (DESIGN.md → The Whole-Cost Corollary).
- **«In totale» is what is dated up to `now`.** `summarizeCenter` splits the rows at today: `total`/`count` are
  the booked ones, `scheduled` the rest (a materialised instalment, a recurring row). The scheduled rows are
  listed in Movimenti with an «in calendario» chip, counted in the aside («8 voci»), added as they are to every
  projection and to a ceiling's `spent` («impegnato» instead of «speso» in the copy), and never summed into the
  cost. A backdated row moves the total AND the crossing day retroactively.
- **The projection is the app's ONE rule on any window**: `projectWindowEndWithScheduled(spentToDate,
  scheduled, elapsedDays, totalDays)` in `spendingProjection.ts` (the month function delegates to it). The year
  uses `resolveYearCalendar` (`dayOfYear` from calendar fields in UTC — the DST trap — `canForecast` from day
  `MIN_YEAR_FORECAST_DAYS` = 28). **A dormant or archived center gets NO projection** (`lifecycle !== 'active'`
  → `yearProjection`/`monthProjection` null, the annual budget's `projection` null and `atRisk` false): a pace
  belongs to a project that is alive, and the verdict says «è fermo da 120 giorni» instead.
- **A monthly ceiling is Budget's `summarizeCeiling`**, mapped into `CenterBudgetSummary` — same crossing day
  (`crossedOn`, a day after today reads «supererai»), same `projectedCrossingDay`, same today's mark — so a
  center's tetto and the overall tetto never disagree. An annual ceiling is year-to-date on `resolveYearCalendar`
  and has no crossing day (like Budget's annual rows). `atRisk` = not over AND `Math.round(projection) > amount`
  (the gap is measured on the figure AS PRINTED).
- **Risk vs fact, again**: the list verdict ranks `over` (a crossed ceiling, negative) > `atRisk` (warning) >
  the most expensive center (neutral); two or more flagged centers are counted («2 centri rischiano di sforare
  il tetto.»). The dormant clause closes every sentence; a never-used center reads «non ha ancora spese», never
  «fermo da N giorni» (`idleDays` is null). The detail ranks archived > never used > over > dormant > holding >
  no ceiling («costa 124 € al mese» = `averageMonthly` = total / calendar months since the first expense).
- **A lifecycle threshold is fed an UNSCOPED date** — `resolveLastActivityDate(booked)`; `idleDays` is whole days
  between that date and today. Dormancy is a fact about the center, not about any window.
- **Every number is born in `costCenterSummary.ts`** (`summarizeCenter`, `summarizeCostCenters`,
  `buildCenterMonthStack`, `trailingMonthRefs`, `resolveYearCalendar`), every sentence in
  `costCenterNarrative.ts` (`buildCostCentersVerdict`, `buildCostCenterVerdict`, the `describe*` readings, asides,
  KPI captions and footers; `describeCenterChip` returns `{label, tone}` for the one chip a row may carry).
  Articles follow the printed figure (`articleForPercent`, `atThePercent` — «all'87%», «il 50%»); the copy uses
  the straight apostrophe like the other narratives, and the tests' `plain()` normalises it together with the
  nbsp. `CenterSummary` carries its `expenses` so the bars and the movements list read the same rows.
- **One stack component for both views**: `CenterStackBars` draws the trailing months stacked by center
  (`resolveCostCenterColor` per band, the running month at reduced fill and outlined, hover reading under
  `(pointer: fine)`, `legend={false}` for the detail's one-series stack). It replaced the Recharts line chart of
  «Confronta l'andamento»; `costCenterStyles.ts` keeps only `CHART_TICK_STYLE`, which Storico, FIRE and Coast
  import — do not delete the file with the views' last Recharts chart.
- **The query returns TWO numbers per center**, `spending` and `linkedCount`, and `deleteCostCenter` unlinks
  *whatever is linked*, income included, by writing `costCenterId: null` (never deleting the row) — **any count
  next to a destructive action must come from the same query the mutation runs.** The armed button's label names
  the count; Escape or a pointer outside disarms and the disarm is announced (emptying a live region announces
  nothing); disarm BEFORE delegating.
- **Session-only lenses are stored WITH their subject** (`{ id, keys }` for the subcategory exclusions,
  `{ id, count }` for the movements window): a stale id falls back to the default with no effect and no extra
  render (`react-hooks/set-state-in-effect`). The exclusion touches only the Per sottocategoria tile.
- **Rows that open a center are `<button>`s whose accessible name is their content** («Apri Fenicottero …»):
  a center sits in Centri AND in Dormienti when idle, so a spec scopes the locator to the tile
  (`getByRole('region', { name: 'Centri', exact: true })`) or `.first()` trips strict mode.

### Cashflow › Divisione (`components/cashflow/ExpenseSplitTab.tsx`, `lib/utils/{expenseSplitSummary,expenseSplitNarrative}.ts`)
- **Opt-in, like Centri di Costo** (`expenseSplitEnabled`), on **Tracciamento's period axis** — a division is a fact of a
  month the way a month's savings are. The tab computes nothing: numbers from `expenseSplitSummary.ts`, words from
  `expenseSplitNarrative.ts`, and the monthly email reads the SAME two modules, so the page and the email can never
  print two different splits.
- **ONE field carries the whole feature**: `Expense.personalMemberId`. **Absent (or `null`) MEANS «in comune»** — that
  default is why there is no migration (every row ever written is already shared) and why the normal case costs no
  interaction. A value is a `FamilyMember` id, the SAME people as Previdenza's RAL: never a second list of names.
  It applies to `income` too, and that is where the shares come from.
- **Deliberately NOT denormalized to a name**, unlike `costCenterName`: the members live in the settings document every
  consumer already loads, so a rename costs no bulk update. The price is that every reader resolves the label itself.
- **The share is NEVER invented.** `resolveSplitBasis` returns `unavailable` — with `missingNames` — when fewer than two
  people exist, when no labor category is configured, or when **one person has no salary in the period**; every
  split-dependent figure (`share`, `commonShare`, `remaining`) is then `null` and the sentences name the missing input.
  Without that guard the person who DID record a salary silently carries 100% of the pool. Own spending survives an
  unavailable basis — it is a fact whatever the shares do.
- **The base is the PERIOD's attributed labor income** (owner's decision, 2026-08-31), not the RAL and not a trailing
  window: it is the most faithful reading of «this month» and the most volatile one. Do not «stabilise» it without
  saying so on screen — the honesty of the feature is that the reading names its base out loud.
- **`allocateByShare` charges the rounding residual to the LARGEST share**, so the parts sum back to the pool exactly,
  and **re-rounds after the correction** (`50.02 + (−0.01)` is `50.010000000000005` in binary floating point).
  **TRAP FOR ITS TEST: with exactly TWO shares the roundings always cancel, so the correction is unreachable in the
  two-person case this feature was built for.** A fixture on two people is green with the whole branch disabled — it
  happened, and only a falsification caught it. Test it on three.
- **A row whose member was deleted is its own bucket** (`SPLIT_UNASSIGNED_LABEL`), never folded back into the pool:
  charging everyone for a row its owner marked personal is a worse answer than admitting the row lost its owner. The
  reading declares those euros, so the parts still add up to the whole.
- **Transfers are skipped whole** — net-zero, and the money one person moves to a joint account is plumbing, not a cost.
  The control is hidden on `transfer` in the dialog for the same reason. Classification is by `type`, never by sign.
- **There is NO reconciliation of who paid**, by design: the question is «quanto resta a ciascuno», not «chi deve a
  chi», so `linkedCashAssetId` is never read. Adding it is a new feature, not a completion of this one.
- **The dialog control is in the MAIN body, not behind «Impostazioni avanzate»** (where the cost centre sits): it is
  touched on most rows. It is **native radios**, not `SegmentedPill` — this picks a VALUE, not a panel, so `role=radio`
  is what a screen reader should meet. Corollary for Playwright: step 1 of the create dialog is ALSO a radiogroup
  («Tipo di voce»), so «no radios in the dialog» is not a valid assertion — name the control.
- **Writing it is a FOUR-place fan-out**: the three creators in `expenseService.ts` (single, recurring, instalment —
  a series belongs to one person on EVERY occurrence, unlike `linkedCashAssetId`) plus `updateExpense`, which the
  dialog hands `?? null` explicitly: `removeUndefinedDeep` strips `undefined`, so moving a row back to «in comune»
  has to be written, not omitted.
- **An optional tab's id is accepted by `getInitialTab` while its panel is gated on the setting**, which used to leave
  Cashflow **blank** — no tab bar, no content — for `?tab=split` or `?tab=cost-centers` with the feature off (a
  bookmark, a shared link, or turning the feature off with the tab open). `effectiveTab` is DERIVED in
  `app/dashboard/cashflow/page.tsx` (never corrected in an effect, or there is a render where the page is empty) and
  falls back to `tracking`; it is settled only once BOTH optional settings have loaded. Any future optional tab
  inherits the fix for free — and must read `effectiveTab`, not `activeTab`, in its header actions too.

### History and Snapshot Baselines
- Annual deltas use December of the previous year as baseline; Patrimonio `Anno Corrente` uses the previous month as a
  **hidden** baseline.
- **A snapshot is a frozen photo**: adding an asset never updates an existing one, so a Storico chart "missing" an asset
  you just added is a stale current-month snapshot, not a bug. **The snapshot cron runs DAILY — the name lies**
  (`0 18 * * *`, no day-of-month guard): storage granularity is monthly, write frequency daily.
- **Reuse `byAsset.totalValue` for historical per-instrument value — never recompute** (it already went through
  `calculateAssetValue()`); aggregate in `snapshotAssetBreakdown.ts`. **Gotcha**: `byAsset` is a newer field, so a month
  picker built on it must filter to non-empty `byAsset` — the resulting gaps are correct.
- **`byAsset.price` is RAW NATIVE CURRENCY**, so `totalValue ≠ quantity × price` for USD/GBp/real-estate; the per-unit EUR
  figure is `u = totalValue / quantity`, and attribution is `priceEffect = q_prev·(u_curr−u_prev)` + `quantityEffect =
  (q_curr−q_prev)·u_curr` (sum = Δ exactly).
- **TWR neutralises a cash flow only when the net-worth drop and the flow land in the SAME monthly snapshot** — the fix
  is data entry, never re-bucketing cash flows or excluding cash (CLAUDE.md → Known Issues has the mirror case).
- **Two CAGR formulas, intentionally different**: Storico's verdict = `(endNW/startNW)^(12/months) − 1` (wealth growth, said «versamenti inclusi»),
  Rendimenti = `(endNW/(startNW+netCashFlow))^(1/years) − 1` (investment return).
- **A form that CROSS-VALIDATES a sum against a declared total must offer a field for EVERY member of the union.**
  `CreateManualSnapshotModal` refuses to write unless `sumClassAmounts(byClass)` matches the declared `totalNetWorth`
  within 0.01, so a class it does not ask for does not make the form incomplete — it makes an honest snapshot
  **impossible**: with `trendFollowing` or `carry` in the portfolio the six hard-coded fields could never reach the
  total, and every attempt was refused with an arithmetic message that named no cause. The fields are generated from
  `ASSET_CLASS_SEQUENCE` with `ASSET_CLASS_LABELS`, and the pure helpers live in `lib/utils/manualSnapshotAmounts.ts`
  (`emptyClassAmounts` · `parseAmount` · `sumClassAmounts`). **The sum iterates the SEQUENCE, never the record's own
  keys**, so a stale key left by an older document cannot inflate the figure the user is asked to reconcile. The values
  stay STRINGS — an `<input type="number">` where an empty field, a half-typed `1.` and a `0` are three different
  things — and parsing happens once, at the boundary. The same test that pins one field per union member is what a
  future widening trips on.

### Storico — a verdict over tiles (`app/dashboard/history/page.tsx`, `components/history/tiles/*`, `lib/utils/{storicoSummary,storicoNarrative}.ts`)
- **The page has NO axis, and its growth is WEALTH growth.** `summarizeGrowth` measures first → latest snapshot with contributions included, and every sentence that prints its CAGR says «versamenti inclusi»; never feed it to a surface that means an investment return (that is Rendimenti's `(endNW/(startNW+netCashFlow))^(1/years)`, AGENTS → History and Snapshot Baselines).
- **ONE pace for the whole page** (`summarizeGrowthPace`): the trailing-12-month average monthly increase in EURO, linear. It decides the headline (`accelerating` above the lifetime monthly average ×1.10, `slowing` below ×0.90, `steady` between, `losing` when the year is negative) AND `projectNextDoubling`. Both need the snapshot of EXACTLY twelve months earlier (a gap → `trailingDelta: null`, no clause, no projection) and the verdict needs `PACE_MIN_HISTORY_MONTHS` (24) of history; a projection beyond `PROJECTION_MAX_MONTHS` (600) is `null`, never a date. Do not "improve" it with a compound extrapolation: contributions do not compound.
- **A month is a pair of snapshots exactly one calendar month apart** (`summarizeMonthlyMoves`, `withMonthDeltas`): a gap is not a month, a zero delta is neither rising nor falling. The verdict names the best month, the Evoluzione tile the worst — never both in one place.
- **The verdict's «ultimo raddoppio» is always the GEOMETRIC one**; the Raddoppi tile follows its toggle (`prepareDoublingTimeData(ordered, mode)` — feed it SORTED snapshots, oldest first, it does not sort). `describeDoublings` reads `progressPercentage` from the milestone in progress and says «il primo» (no noun) when nothing is completed yet.
- **Driver is floored at `cashflowHistoryStartYear`** (`selectDriverYears`, the monthly rows filtered the same way): before it there are no transactions and «mercato» would silently be the whole growth. A year's savings are the cashflow rows dated from the month AFTER its baseline snapshot to the month of its last one (`prepareSavingsVsInvestmentData`) — the same window as its growth — so a running year never counts the materialised recurring rows of the months still to come, and the reading names the window («Da gennaio ad agosto 2026», `describeRunningWindow`); the shares of the two drivers (`resolveDriverShares`) exist only when both added, and the market's is the remainder so they sum to 100. `summarizeLaborMetrics` is the SDK-free recap (taxes passed in) and skips transfers, which are net-zero and stored positive. The split bar shows only the POSITIVE halves as shares of what was added; a negative half reads in words («mentre il mercato ha tolto», «hai speso … più di quanto hai incassato»), never as a share of a mixed-sign total. The monthly bars are side by side, never stacked (a negative segment breaks a stack).
- **Per-instrument attribution is `buildMonthAssetBreakdown`** — `attributeSelectedChange` one instrument at a time against the closest EARLIER month WITH a breakdown (a legacy month in between is skipped and the reading names the month it compares with); the month's total change runs on the UNION of both months' instruments, so a position sold in full still explains the drop without a row. `summarizeSelection` sums the ticked rows; nothing in the tile adds numbers.
- **`describeComposition` reads `CompositionSeries.breakdown`** (already ranked, maths in `historyComposition.ts`) and puts the subject in the band's own gender/number (`BAND_SUBJECTS`: «le azioni pesano», «la liquidità pesa»); the Previdenza clause appears only when the band exists and is not already one of the two named.
- **Recharts inside a tile that stretches**: the Evoluzione area sits in `relative min-h-[220px] flex-1` with `ResponsiveContainer` inside an `absolute inset-0` box — a bare `ResponsiveContainer height="100%"` in an auto-height flex child collapses to 0. A narrow range (< 10.000 € of span) prints full-euro ticks: compact ones all round to the same «€30k».
- **`SelectTrigger size="sm"` emits `data-[size=sm]:h-8`, which beats a plain `h-11`/`desktop:h-7`** (variant selectors win on specificity; twMerge does not dedupe across variants): override it WITH the variant — `data-[size=sm]:h-11 desktop:data-[size=sm]:h-7`.
- **The quantity effect is a FLOW, not a gain**: a deposit on a cash account lands in it. It is set in mono with a typographic sign and no colour (`signedFlow`, the `flow` prop of `Effect`), named «dalle quantità (acquisti, vendite e versamenti)», and the sign of every printed figure is decided on the TEXT (`isPrintedZero`): «0 €», «0,0%», «0,0 pp» carry neither sign nor colour.
- **`summarizeSelection` runs on the union like `change`**: an instrument ticked in an earlier month and sold in full counts its whole previous value as a quantity loss (`departed`), so the panel agrees with the trend line under it.
- **JSX text after an expression inside a flex chip loses its leading space** (`{pct} l'anno` rendered «19,4%l'anno»): an anonymous flex item's leading whitespace is collapsed. Build the string in one expression.
- **`SnapshotSearchDialog` sets the note in the select handler**, not in an effect (react-hooks/set-state-in-effect); the page patches the note into local state after `updateSnapshotNote`, no refetch.

### Hall of Fame — a verdict over tiles (`app/dashboard/hall-of-fame/page.tsx`, `components/hall-of-fame/*`, `lib/utils/{hallOfFameSummary,hallOfFameNarrative}.ts`)
- **The page has NO axis, and it re-derives nothing.** A record is a POSITION, not a period, so there is no picker: `hall-of-fame/{userId}` already holds the rankings, and `summarizeHallOfFame(data, today)` only turns the stored slices into boards. "Today" is a PARAMETER (`HallOfFameToday`), never `new Date()` inside the module — a test pins a month instead of racing the calendar.
- **`hallOfFameRecords.ts` is the ONE definition of a record AND of a ranking.** `buildHallOfFameRankings` is called by BOTH writers (`hallOfFameService.ts` client, `hallOfFameService.server.ts` Admin) and the periodic email reads the same builders. The client used to carry its own copy of `calculateMonthlyRecords`/`calculateYearlyRecords`; it was collapsed on 2026-08-25. Never re-implement a ranking in a page, a route or a component.
- **How a stale document heals, and when it does not** (verified 2026-08-25): the nightly cron calls `updateHallOfFame` **only inside `if (snapshotResult.success)`** (`app/api/cron/monthly-snapshot/route.ts`), and `POST /api/portfolio/snapshot` answers `success: false` with «No assets found for user» — so an account with **no assets never heals from the cron**, only from the page's «Aggiorna i record», and in **demo** that button is disabled by `useDemoMode()`. Never document a new stored field as "the cron will fill it in".
- **One document per OWNER, not per viewer**: the page reads `hall-of-fame/{ownerId}` (`useActiveAccount()`, never `user.uid`), so a co-owner of a shared account reads the SAME document and the owner's recalculation covers them both. Only that person's own separate account is a second document.
- **`updateHallOfFame` reads the notes back before its full `set`**: a ranking update must never cost the user a note. Both writers do it; anything that touches that path keeps the read-back.
- **Two rankings and a stats block are OPTIONAL on the document** (`bestMonthsBySavings`, `bestYearsBySavings`, `stats`): they arrived on 2026-08-25, so a document written before that has none. `getBoard` returns **null** for a ranking the document does not carry — distinct from an empty board, which means "nothing ever qualified" — and the tile says the record arrives with the next update instead of printing a zero (The Narrative Honesty Rule). Do not "fix" it with `?? []`.
- **A savings record needs income** (`rankBySavings`): without the `totalIncome > 0` guard the winner is systematically the month with the least DATA — an untracked month saves as much as one that earned nothing and outranks every real month. The tile's footer states the guard. Known blind spot: a month with income and zero expenses recorded reads as a 100% rate (CLAUDE.md → Known Issues).
- **`stats` cannot be recovered from the rankings** — the document keeps only the top slices, so the average monthly income that «il 62,1% sopra la tua media mensile» divides by is stored, not derived. Same for the month/year counts the compact header prints.
- **The verdict names the BEST month, the tile's footer the WORST** — never the same figure twice (the rule Storico settled). When the running month IS the record the headline says so (`Agosto 2026 è il tuo mese migliore.`) and the sentence drops its own «al 3° posto» clause. A podium place gets a word (`il secondo anno migliore`), a place past the third gets its number (`al 4° posto tra gli anni`): «il settimo anno migliore» reads as praise it is not.
- **The chart dates, the podium ranks** (`buildRecordTimeline`): the twelve record months are drawn in CHRONOLOGICAL order, because «when did the records happen?» is a different question from «which are they» and the One-Tile-One-Question Rule forbids the same rows twice. Beyond the limit the SMALLEST records are dropped, never the oldest — cutting by date would silently make it a recent-months chart.
- **A cost is carried POSITIVE and uncoloured** (`valueOf`, `readingOf` in `RecordRows`): an expense record is the size of a cost, not a loss, and the sign tokens mean gain and loss and nothing else. A savings rate is a proportion, so it is unsigned beside a signed amount. The bar takes the slot of the QUANTITY ranked — `--chart-2` for income and savings, `--chart-1` for net worth and spending.
- **The `Mensile|Annuale` + category switcher lives in the «Dettaglio» disclosure**, not above the grid: on the grid each ranking is already a tile, so a switcher over them would answer the same question twice. Below `desktop:` the two pills stack, take 44px targets and each scrolls inside its own strip (`-mx-5 px-5`) — side by side they are 464px of controls in a 318px tile.
- **`NoteTrigger` hides itself when the period has no note**, so a ranking without notes grows no ghost column; inside the Dettaglio's table it takes `alwaysVisible`, because a «Nota» column whose marker only a mouse can reveal promises an empty column.
- **`HallOfFameNoteDialog` and `HallOfFameNoteViewDialog` keep their pre-redesign chrome** and the dialog carries two pre-existing `react-hooks/set-state-in-effect` errors. Adding a ranking means adding its `HallOfFameSectionKey`, its `SECTION_LABELS` entry AND its place in `MONTHLY_SECTION_KEYS`/`YEARLY_SECTION_KEYS` — the dialog's checkboxes are built from those arrays.

### Rendimenti — measurement base (`lib/utils/performanceBase.ts`, `drawdownSeries.ts`)
- **Any exclusion read from `byAsset` MUST be backfilled across the pre-`byAsset` months, or it becomes a phantom crash**:
  subtract a **constant `E₀`** (the excluded total of the earliest snapshot that HAS one), which cancels in `(V_end −
  CF)/V_start`. A snapshot that has `byAsset` but omits the asset is evidence of absence → subtract 0, never backfill.
  **Documented approximation**: the backfill fixes the DENOMINATOR of historical months, not the numerator.
- **The base is user-configurable and TWO call sites must stay in sync**: `resolvePerformanceExclusions` fed by
  `resolvePerformanceBaseOptions(settings)`, consumed by `getAllPerformanceData` AND the page's `cachedSnapshots`.
  Diverge and a custom period disagrees with the pre-computed ones; `buildCacheKey` must embed the base signature.
- **Drawdown runs on a geometric TWR index, never on `netWorth − cumulativeCashFlow`**: `buildTwrIndex` chains the SAME
  monthly return the heatmap shows.

### Rendimenti — the measurement window (`lib/services/performanceService.ts`)
- **The first snapshot of a period is ALWAYS the starting valuation, never a measured month — the window opens on the 1st
  of the month AFTER it.** A snapshot is an end-of-month photograph; this also fixes gaps for free.
- **`resolveHasBaseline(snapshots, nominalPeriodStart)` is the ONE answer to "is that first month before the period?"** —
  data-driven, never inferred from the period type. **The page must NEVER re-derive the window from `new Date()`**:
  `metrics.nominalPeriodStart` travels in the payload and `selectSnapshotsForMetrics` re-selects what the service used.
- **`monthsElapsed` vs `calculateMonthsDifference`: distance vs coverage.** Jan→Mar is 2 elapsed, 3 covered;
  annualization always uses the elapsed count. **IRR signs are the INVESTOR's stream** (`−startNW`, `+endNW`), and
  `null` means "no rate explains this stream", not "the solver gave up".
- **No silent filters inside a single metric.** Volatility must not drop extreme monthly returns — the removed value is
  either an untracked movement (still visible in the heatmap) or a real crash. Floors instead: volatility/Sharpe need
  ≥ 3 monthly returns, else `null` with a reason.
- **`buildCashFlowMap`/`monthKey` is the only monthly indexing of cash flows** — TWR, volatility, heatmap, Evoluzione and
  `drawdownSeries` read the SAME series, and flows in the same month are **summed**.
- **Below 6 months the hero states the PERIOD return, not an annualized one** (`resolveHeroReturn`): +4% over two months
  annualizes to "+26% a year", a forecast dressed as a measurement. Only the displayed figure changes. **ROI and CAGR
  correct for cash flows in two DIFFERENT ways and are not convertible**, so both tooltips state both formulas.
- **Benchmark**: every model is EUR-converted (`applyFxConversion`, the portfolio is EUR-denominated) before the verdict's gap and the Benchmark tile are computed — one basis for the whole page since 2026-08-25 (the old table's USD default and its toggle are gone); while FX is loading nothing is ranked, only a FAILED FX route falls back to USD and the tile's aside says so.
  `benchmarkPeriodReturn.ts` is the single source for indexing + annualization — never re-inline it. Each benchmark's
  final value comes from **its own** last available month, or every cell renders "–".

### Rendimenti — a verdict over tiles (`app/dashboard/performance/page.tsx`, `components/performance/tiles/*`, `lib/utils/{performanceSummary,performanceNarrative}.ts`)
- **The subject is the window MEASURED, never the picker's name**: `describePerformancePeriod` says «Negli ultimi 11 mesi» when a 1-anno window finds eleven snapshots (the current month's is not there yet), «Da aprile» for a YTD whose first measured month is April. `numberOfMonths` and `startDate` come off the payload.
- **A gap beside a figure is on that figure's basis** (`resolveBenchmarkGap`): below six months the hero is the period return, so the «N punti sopra il 60/40» clause de-annualises BOTH rates with `(1+r)^(n/12) − 1` — the annualised gap next to a period figure lied by a factor of three on four months. The headline's tone still comes from `summarizePerformance` (risk-adjusted vs the risk-free rate); the benchmark only decides «più del / meno del / quanto il 60/40», and «meno del» takes the neutral dot.
- **Direction follows the printed figure** (`printed`, `printedGap`): `−0,04%` prints as `0,0%` with no sign and reads «Rende»; a gap under 0,05 points is «in linea» in the verdict AND «alla pari» in the Benchmark tile — `computeBenchmarkRanking` counts `beaten`/`tied` on the same rounding, so the two sentences never contradict each other. A ranking without a portfolio TWR has no reading at all (`describeBenchmarkRanking` → null), never «nessun modello ha reso meno».
- **The drawdown story is `resolveDrawdownStory` over `buildTwrIndex` + `findMaxDrawdown`**: peak/trough/recovery as `PeriodMonth`s, `monthsToRecover`/`durationMonths` in CALENDAR months (`monthSpan`), null below `AT_PEAK_THRESHOLD` (a −0,02% dip is not a story). The payload's `maxDrawdownDate`/`drawdownPeriod` strings and its index-step `drawdownDuration`/`recoveryTime` are no longer displayed; `measureDrawdownSpan` in the service keeps the index semantics for the cache, so do not mix the two on one surface.
- **Sortino, growth-of-100 and the ranking are pure** (`computeSortinoRatio` with the volatility floor and no outlier filter, `buildGrowthOfHundred` with an explicit base point — `benchmark: null` on it when no model series exists —, `computeBenchmarkRanking` up to each model's own last month, `annualizeTWR` on the page's `numberOfMonths`). `flattenHeatmapReturns` is the ONE percent→decimal bridge; the old copy inside `BenchmarkComparisonChart` (with a ±50% filter the service had removed) went with the component.
- **«Oggi» only when the window ends at the latest snapshot**: `describeGrowthOfHundred`/`describeCapitalAndMarket` take a `WindowEnd` (`endsAtLatest` = the period's last snapshot IS the cached series' last) and otherwise name the month («a fine dicembre 2024»). A custom range that closes earlier must not say «oggi».
- **Italian articles**: «diciotto» starts with a consonant — `startsWithVowel` in `patrimonioNarrative.ts` (now exported, shared) no longer lists 18, which fixes «l'18%»/«gli 18» on every page; the plural «dei/degli» before an amount reduces the printed leading group (`degli 8000 €`, `dei 18.000 €`, `dei 1500 €` — mille); an elided article never lands on a minus («ROI negativo dell'8,1%», «ha perso il 2,3%»).
- **Plusvalenze realizzate is off the axis** (`aggregateRealizedByYear` on ALL trades) and absent without a closed sale — then «Capitale e mercato» takes 12 columns (a conditional span, like the Panoramica's Costi/Obiettivi), never a hidden spacer for a tile that may exist.
- **The heatmap is a `<table>`** (years are rows, months columns, `scope` on both) with sign-token fills at three alphas (`heatmapCellClass`), the figure in the cell's `title`, an `sr-only` span and the hover reading (`ChartHoverTip` positioned from the cell's rect); no figure is printed in a cell, so the AA text floor does not apply to the fills.
- **The page effect defers `loadPerformanceData` with `setTimeout(…, 0)`** (react-hooks/set-state-in-effect): the function sets state synchronously and is declared before the effect now, so the linter can see it.

### Dividends and Coupons
- **A coupon's cashflow expense is created only by the daily cron on payment date, never at asset-save time**
  (`createDividendWithOptionalExpense` gates on `!isAutoGenerated`; cron Phase 2 is idempotent via `expenseId`).
  Corollary: `deleteUpcomingCouponsForAsset`/`deleteUpcomingFinalPremiumForAsset` must batch-delete the linked expense.
- **The coupon cron is self-healing, not exact-day**: Phases 2-3 query a 370-day lookback and Phase 3 walks
  `getFollowingCouponDate` forward, so a missed run cannot stop the chain.
- **Adding a `DividendType` is a six-file fan-out** and nothing enforces it: `types/dividend.ts`, `DividendTable`,
  `DividendDetailsDialog`, `DividendTrackingTab`, `DividendDialog`, plus `dividendService.ts`'s `byType` initializer.
- **A coupon's tax rate is the asset's own `taxRate`** (12,5% government, 26% corporate), never a constant.
- **YOC and Current Yield share one pure function**, `computeDividendYieldMetrics`, prospective and per-share:
  `annualizedDPS = Σ(grossEur/div.quantity)` annualized, YOC = `DPS ÷ averageCost`, Current Yield = `DPS ÷ price`, only
  `quantity > 0` contributing. Never reintroduce an inline YOC in Rendimenti or `/api/dividends/stats`.
- **YOC, Current Yield and per-asset Total Return are scoped to the CURRENT holding** (`createAsset` re-links by ISIN, so
  dividends before `holdingStartDate` are dropped, with `deriveHoldingStartDates` for legacy rebuys). **DPS growth is
  deliberately NOT scoped** — it is a security-level payout history.
- **Received metrics filter on `paymentDate`, not `exDate`**; use `setHours(23,59,59,999)` for the upper bound, or a
  `…T00:00:00Z` dividend reads as future.
- **Inflation-linked coupons (BTP Italia) are additive**, resolved by `resolveCoupon`/`buildCouponNote` for both the
  client scheduler and cron Phase 3: the FOI rate is already per-period, deflation is floored to 0, and an unannounced
  coupon is stored **provisional**.
- **`/api/dividends/stats` returns the NET yields too** (`portfolioYieldOnCostNet`,
  `portfolioCurrentYieldGross/Net`): `computeDividendYieldMetrics` has always produced them and the
  route used to drop them, which forced every consumer wanting a net figure to re-derive it from an
  average tax rate. `averageYield` stays only as the deprecated alias of the gross current yield.
- **The date bounds of that route only ever narrowed `periodStats`.** `yieldOnCostAssets`,
  `totalReturnAssets` and `dividendGrowthData` are TTM/all-time whatever is passed — do not add a
  range expecting them to move (AGENTS → *Cashflow › Dividendi*).
- **Per-type badge colours are gone** (`dividendTypeBadgeColor` deleted): six literal Tailwind palettes
  stayed the same hue on every theme and made the type the loudest thing in a list about money. Type is
  plain text on a neutral outline; only `--warning*` colours anything there (announced / provisional).
- **Persist a bondDetails-only change with `updateAssetBondDetails`, never `updateAsset`** (which `deleteField()`s an
  absent `averageCost`/`taxRate`), passing the COMPLETE object — `updateDoc` replaces the whole map.

### Asset Pricing, FX and Assets
- **"Does this asset have a market price?" is ONE rule in ONE place** (`lib/utils/assetPricing.ts`): `hasMarketPrice` is
  false for `realestate`, `cash`, `pensionFund`, `Private Equity`; `requiresManualPricing` adds the `autoUpdatePrice ===
  false` opt-out. **A new hand-valued `AssetType` goes into `MANUALLY_VALUED_TYPES` and nowhere else.** The `--chart-3`
  row tint means "no market quote", NOT "illiquid".
- **`suggestIsLiquid` is the single liquidity-default predicate**, keyed on the TYPE so a REIT **ETF** stays liquid; three
  call sites in lock-step (create-mode effect, edit-mode legacy fallback, liquid/illiquid net-worth read-time fallback).
- `buildAssetFormDataFromValues` clamps `autoUpdatePrice` to `false` when `hasMarketPrice()` is false. **That clamp is
  the only defense — never remove it.**
- **GBp (pence) ≠ GBP**: normalize `price / 100` before any FX call or values inflate 100×. **Never call Frankfurter from
  the browser** — all FX is server-side via `/api/prices/quote`. `quantity = 0` marks a sold asset, cash balance lives
  in `quantity`, and Borsa Italiana bond prices are `% of par` (`rawPrice * nominalValue / 100`).
- **Patrimonio Δ columns are UNIT-PRICE variations over time windows, not profit/loss and not value changes**
  (`lib/utils/assetPerformanceDeltas.ts`): the canonical EUR unit `totalValue / quantity` of the snapshot row against
  today's, the property (by TYPE `realestate` — a REIT ETF in that class is a quoted fund) gross of debt, pension
  funds and cash `null` (their quantity IS the value), and no window based on the current month's snapshot. Never
  measure a hand-priced asset on its total value: a purchase then reads as performance. `Δ Inizio`'s base is the
  first recorded unit price, never `averageCost`.
  **Any table whose column set changes at runtime must derive its group-header `colSpan` from the same flag.**
- **A cash *account picker* requires `type === 'cash' && assetClass === 'cash'`** (a money-market ETF can carry
  `assetClass: 'cash'`), for the settlement account, ledger first buy, `ExpenseDialog`'s payment account, the pension
  origin and `assertCashSettlementAsset`. Do NOT extend it to aggregate-liquidity computations.
- **`getAssetDisplayTicker` is the ONLY place resolving the alias→ticker fallback.** Every
  instrument label built in `lib/utils/dashboardOverviewUtils.ts` (`rankCostDrivers`,
  `computeTopInstrumentMovers`) and `dashboardOverviewService.ts` (`topAssets`) resolves through
  it too — a long fund name never gets cut mid-word in the Costi/Rendimento/Mercato tiles. The
  `makeAsset()` test fixture in `__tests__/dashboardOverviewUtils.test.ts` defaults `ticker:
  'VWCE'`: any test that overrides only `name` and asserts on the returned label will silently
  see `'VWCE'` back unless it also overrides `ticker` (to `''` to fall through to `name`, or to a
  distinct value to test the ticker path).

### Patrimonio (`app/dashboard/assets/page.tsx`, `components/assets/*`)
- **The page owns every dialog** (`AssetDialog`, `TransactionDialog`, `AssetMovementsDialog`, `TaxCalculatorModal`,
  `CashAccountDialog`): the header's «Aggiungi asset», the Liquidità tile's «Aggiungi conto», the table's Modifica and
  the Movimenti tile's rows all go through the same instances, so the dual invalidation (`assets.all` +
  `dashboard.overview`) happens in ONE `handleAssetDialogClose`. Tiles receive callbacks, never open dialogs.
- **Every number the page shows that is not in the overview payload is born in `lib/utils/patrimonioSummary.ts`**
  (`summarizeCashAccounts`, `summarizeMonthTrades`, `summarizeUnrealizedGains`, `rankInstrumentReturns`,
  `computeTopWeightShare`, `resolveLastPriceUpdate`, `computeUnrealizedGain`) or `assetPerformanceDeltas.ts`; the words in
  `patrimonioNarrative.ts`. `isCashAccount` = the cash-picker rule (`type === 'cash' && assetClass === 'cash'`);
  **`isHeld` (`quantity > 0`) gates every count, share and sum** — a sold position stays in the table as «Azzerato»
  but is not owned, and the Panoramica's `assetCount` already counts held only; `hasCostBasis` excludes cash
  accounts, pension funds (a leftover `averageCost` from a type conversion is not a PMC) and sold positions, and
  `rankInstrumentReturns` applies the same exclusions to the payload's `topAssets` (whose `returnPercent` is computed
  on ANY `averageCost`) so the Rendimento KPI, its ranking and its footer share one rule.
- **The verdict's driver is an INSTRUMENT** (`topInstrumentMovers`, `computeTopInstrumentMovers` — the same
  `computePriceEffectsByAsset` as the class digest, an instrument never split by its `composition`, capped at ten),
  named only when `marketEffect !== null`. Patrimonio's hero footer lists the top three instruments; the
  Panoramica's lists classes — the two pages never print the same «Mercato:» line.
- **«Movimenti del mese» reads the owner's whole ledger** (`useAssetTransactions(ownerId, undefined, { enabled:
  ledgerReady })`) and filters the Italian calendar month in memory: a month query would need a `(userId, date)`
  composite index that does not exist. Baselines and adjustments are not trades; a buy's amount is gross + fees,
  a sell's gross − fees (the engine's `computeInvestedCapital` definition).
- **Peso is measured over the GROSS total** (cash accounts included), like the Classi and Liquidità shares —
  before the redesign the table measured it over the instruments only.
- **Below `desktop:` the rows are `AssetRow`, flat and expandable** (CSS `grid-rows-[0fr] → [1fr]` with `inert`
  on the closed panel): a card per row inside the Strumenti tile would be a card inside a card. Class chips take
  their label from `ASSET_CLASS_LABELS` (Italian); `lib/utils/assetUtils.ts` with its English map is gone.
- **Italian articles are data, not guesses**: `articleForPercent` («l'8%», «il 7%», «lo 0,5%»), `ofThePercent`
  («del 3%», «dell'8%», «dello 0,5%»), `atThePercent` («al 71%», «all'8%», «allo 0,5%») and `pluralArticleFor`
  («gli 8», «i 3») in `patrimonioNarrative.ts` — use them for any count or percentage a sentence names. **The article
  follows the figure as PRINTED**: 7,96 rounds to «8,0%», so it takes «l'», not «il» — decide on `formatPercentage`'s
  output, never on the raw value. **An articulated preposition typed by hand is a bug waiting for a small number**:
  `overviewNarrative`'s `describeComposition` wrote «al » literally and printed «carry al 0,1%» the first time a class
  landed under 0,5% on the Panoramica (found in the browser, 2026-08-30). A hard-coded «al »/«del » is correct for most
  figures, which is precisely why it survives review — grep for a quoted preposition sitting next to a
  `formatPercentage` call before writing another one.
- **A failed overview is an alert, not a skeleton**: the page gates the skeleton on `isLoading` of EVERY query it
  reads (assets, overview, snapshots, ledger meta) and, when the overview errs, keeps Liquidità, Movimenti and
  Strumenti alive on the live assets (`totalValue` falls back to `calculateTotalValue(assets)`) behind a
  `role="alert"` notice where the verdict would be — the management surface must survive a payload failure.
- **The hero's «Mercato:» digest names three instruments and closes with «altri»** = `marketEffect − Σ shown`, so
  the three can never hide a negative total behind three gains (the class digest lists every class instead).

### FIRE, What If and Goals
- **What If = perturbation + diff, no new projection math**: every v1 life event is a year-0 perturbation, then
  `fireService` is re-run on baseline vs adjusted and diffed. Do NOT add timed mid-projection cash events. **Keep the
  pure layer category-agnostic** — the selection of lost income sources and its sum live in the UI
  (`components/fire-simulations/whatif/incomeSelection.ts`). **The bridge rides on the baseline** (`WhatIfBaseline.pensionBridge`,
  2026-08-25): with the lock on, `calculateWhatIfImpact` reads the bridge FIRE number (`calculateFireBridgeNumber`) and passes
  the bridge to BOTH walks, so the «prima» side agrees with the Calcolatore's year; without it the walk is byte-identical.
- **Pension unlock is ONE rule in ONE place** (`lib/utils/pensionUnlock.ts`, explicit `now`): per-fund `unlockDate`
  override > RITA rule from `userAge` (INPS age − 5, or − 10 with `pensionRitaLongUnemployment`) > `null` = NOT locked
  (and the UI must say why). `pensionFire.calculatePensionLockedValue` is a thin wrapper — with no settings it is
  override-only, the behaviour the emulator exercise script relies on.
- **Coast FIRE is the same IA on a different question** — «posso smettere di versare?» — answered by the shortfall
  against `coastFireNumberToday`, with an inflow timeline that names the pension unlock and each state pension.
- **The bridge model reuses the Coast walk, never a second formula.** `buildCoastFIRERetirementNeeds` takes
  `capitalInflows` (amounts AT the inflow year) and extends its horizon to `max(bridgeYears, max inflow year)` —
  without the extension the FIRE-tab case (no state pensions → bridgeYears 0) silently drops the inflow. The
  "reduction = A/(1+r)^y" invariant holds INSIDE the pension bridge; beyond it the extra discounted years change the
  baseline too — that is the model, not a bug. Empty inflows leave the walk byte-identical.
- **`respectPensionLockInFire` governs the WHOLE FIRE page** (Calcolatore, Coast, What If via its baseline, Monte
  Carlo): each tab subtracts the locked total from its starting capital AND passes the inflows — doing only the
  subtraction reintroduces the "sottratto per sempre" bug the bridge model replaced. Monte Carlo adds inflows at
  TODAY's value (no deterministic fund growth inside a stochastic run, declared in the form's read-only row), order
  inflow → return → withdrawal. With growth = discount rate the bridge number is insensitive to the unlock year until
  the floor binds, which is why the FIRE tab aggregates multi-fund unlocks on the LATEST year.
- **Config-first collapse: decide ONCE after the form has settled.** A "collapsed if already configured" panel cannot key
  on the transient `hasUnsavedChanges` — use a `useRef` seeded-flag set when `!isLoadingSettings && !hasUnsavedChanges`,
  and gate the temp-sync effect on `!isLoadingSettings` (not `if (settings)`).
- **The Ventaglio engine mirrors the deterministic walk BY CONSTRUCTION** (`runAccumulationSimulation`): per year
  inflow → random return → savings (stopped once the path retires), moving target = inflated expenses ÷ WR. At zero
  volatility every path collapses float-for-float onto `calculateFIREProjection`'s base scenario — the coherence test
  pins that identity WITHOUT inflows, because the deterministic bridge grows the pension compartment while a Monte
  Carlo run injects inflows at today's value. Do not "fix" the test to include them: the divergence IS the model.
- **The allocation→4-MC-classes normalization is ONE function** (`deriveMonteCarloAllocation`): MonteCarloTab's
  auto-fill and the FIRE Ventaglio consume it and must never re-inline it. `null` means "keep the previous allocation",
  and the rounding residual lands on the smallest class, even a zero-value one (pinned by tests).
- **Memoize every input feeding the fan's `useMemo`** — a `pensionLockState` (and therefore `fanInputs`) rebuilt per
  render re-runs 1000 simulations on every keystroke. The fan is armed only on first opening its view.
- **The Coast tab computes nothing**: `lib/utils/coastFireView.ts` chooses which of `fireService`'s own fields to show
  and in which words (the verdict included — see *FIRE › Coast FIRE — a verdict over tiles*); `CoastFireTab.tsx`
  orchestrates, `components/fire-simulations/coast/tiles/*`, `CoastIpotesi` and `CoastDettaglio` render,
  `useCoastFireSettingsDraft` owns the form. A figure that cannot be pointed at inside a `CoastFIREScenarioMetrics` does
  not belong on that tab. **The Afflussi tile is the visual explanation of the discount**, not a second model: state
  pensions come from the scenario's `pensionBreakdown`, the fund from `resolvePensionLockState`'s inflows AT TODAY'S
  VALUE — growing it there double-counts what the walk already does.
- **Goal trajectory is annuity math in a tested pure layer** (`goalTrajectory.ts`), never a `useMemo` in the card; the
  verdict compares the *projected value at the deadline* against the target with a 1% tolerance, not contribution ≥
  requiredMonthly (float flapping). Coast FIRE's nested pension rows must be serialized without `undefined` fields.
- **The goal math the SERVER also needs lives in `lib/utils/goalMath.ts`, re-exported by `goalService.ts`** — that
  service imports `doc/getDoc/setDoc` + `db` at top level, so server code can never import it. `goalMath` imports
  `calculateAssetValue` DIRECTLY (the second sanctioned route) rather than taking an injected `valueOf`: identical
  signatures are what let the re-export be literal and leave every client call site untouched.
- **`serializeGoalForFirestore` IS the persistence allowlist for `InvestmentGoal`**, the single copy used by
  `saveGoalData` (client) and `POST /api/goals` (server). A new optional field on the type is silently dropped on save
  until it is added there.
- **The goal document is rewritten WHOLE, never patched.** So the Admin append is a transaction (the FIRE page writes
  the same doc), the goals already stored and `assignments` pass through **verbatim**, and the colour is picked INSIDE
  the transaction (`pickNextGoalColor`), or two goals created concurrently come out the same hue.

### FIRE › Calcolatore — a verdict over tiles (`components/fire-simulations/FireCalculatorTab.tsx`, `components/fire-simulations/tiles/*`, `lib/utils/{fireSummary,fireNarrative}.ts`)
- The tab owns three states — `view` (Scenari | Ventaglio, the Traguardo tile's aside), the pension-lock switch
  (persisted on change) and the Parametri form (a preview until «Salva») — and computes nothing: numbers come from
  `fireSummary.ts` over the engines the tab already ran (`calculateFIREProjection`, `calculateFIREMetrics` +
  `calculateFireBridgeNumber`, `resolvePensionLockState`, `runAccumulationSimulation`), words from `fireNarrative.ts`.
- **ONE expense figure for the number, the verdict and the chart**: `getAnnualCashflowData` (the last full year, else
  the running year annualized — the Base di calcolo aside says which). `getFIREData`'s own `metrics.annualExpenses`
  reads the last full year ONLY and is not used for the number: on an account with no last-year rows it is 0, and the
  page called the number «non calcolabile» beside a projection it kept drawing (caught by Playwright on the base
  fixture). `getFIREData` still feeds the runway and the cashflow history.
- **The lock switch saves on change** (optimistic `setRespectPensionLockIn`, reverted on error, disabled while
  pending and in demo with the reason in visible copy) and is NOT part of `hasUnsavedChanges`; the form keeps the SWR,
  the residence, the INPS age and the RITA hypothesis behind an explicit save. The config-first collapse (`useRef`
  seeded, never keyed on the transient `hasUnsavedChanges`) is unchanged; the effects that seed it defer their
  `setState` with `setTimeout(…, 0)`.
- **The fan's verdict is pure** (`resolveFanVerdict`: the deterministic base year when it lies inside the simulated
  horizon, else the horizon and `onHorizon` says so), read by the Traguardo footer and the chart's `aria-label`;
  `FireFanChart` renders no prose. Both charts take `height="100%"` inside `relative flex-1 min-h-[240px]` with an
  `absolute inset-0` box (the EvoluzioneTile technique): a Recharts `ResponsiveContainer` with a percentage height
  needs a definite parent, and the prop type is a template literal (`number | \`${number}%\``), not `string`.
- **Every FIRE tab reads and writes with `ownerId`, never `user.uid`** (fixed 2026-08-25 on all four tabs: Calcolatore,
  Coast, What If, Monte Carlo — Obiettivi already did). The React Query keys were namespaced by `ownerId` while the
  functions took `user!.uid`, so a guest on a shared account saw their OWN (empty) FIRE data and saved settings on
  their own doc. `enabled: !!user && !!ownerId` gates every query; `ownerId!` is safe past that gate.
- **`PageContainer width="wide"` on every FIRE tab** (Obiettivi joined on 2026-08-26, the last of the five). Every
  propagated tab loads as `TileGridSkeleton` with its own cells (`FireCalculatorSkeleton`, `GoalsSkeleton`,
  `WhatIfAnalysisSkeleton` and `MonteCarloSkeleton` are gone).
- **The passive income at the FIRE year is nominal and never stands alone** in the verdict: beside today's expenses
  with the inflation named («2300 € al mese di oggi, 2667 € del 2032 con l'inflazione al 2,5%»), or one figure when
  inflation is 0. A projection carries no sign colour; the only signed figure on the page is the current withdrawal
  rate over the SWR, in the Reddito passivo tile.
- **The form re-seeds from the SAVED values only when they change** (`lastSyncedFormRef`): the lock switch saves on
  its own and refetches the doc, and a refetch that changed nothing the form edits must not wipe a typed SWR. The
  `fireData` query keys on `currentNetWorth`, so it uses `placeholderData: keepPreviousData` — without it a lock
  flip or the residence switch dropped the whole tab to the skeleton mid-interaction. Every write restates
  `respectPensionLockInFire` from the local state, because the cached `settings` it spreads can lag a lock save.
- **A chart slot is not a text colour, here either**: the scenario labels of Parametri (and the Scenari rows) are
  muted text beside an 8px swatch in the slot. **No sign token on a projected figure.** The year-by-year table was
  dropped on request (2026-08-25): the Scenari chart and tile already carry what it listed.
- Playwright locates the tiles by `role=region` + `aria-label` («Traguardo FIRE», «Base di calcolo del FIRE», «Reddito
  passivo sostenibile», «Scenari di mercato»), the verdict by «Verdetto sul FIRE», the view switch by `role=group`
  «Vista della proiezione» (`aria-pressed` buttons), the switch by its `aria-label`, the two disclosure triggers by
  their VISIBLE text (`/^Parametri/`, `/^Dettaglio/` — no `aria-label`, so «Anteprima non salvata» is part of the
  name); the hero is `p:has-text("Numero FIRE") + span`, never «the first mono span» (the reading comes first). The
  390 guard opens Parametri, Dettaglio and the Ventaglio before measuring `main`.

### FIRE › Coast FIRE — a verdict over tiles (`components/fire-simulations/CoastFireTab.tsx`, `components/fire-simulations/coast/*`, `lib/utils/coastFireView.ts`)
- The tab answers «posso smettere di versare?» before any number and computes nothing: `coastFireView.ts` holds BOTH
  the numbers (`summarizeCoastTarget`, `summarizeCoastScenarios`, `summarizeCoastPensions`, `buildCoastInflowEvents`,
  `resolveCoastBridgeYears`) and the words (`buildCoastVerdict`, the `describe*` readings) — one module on purpose, the
  one exception to the `*Summary`/`*Narrative` pair, because this tab CHOOSES what to show of `fireService` and one
  file is where that choice is tested. The only arithmetic in it is a ratio (liquid progress) and a difference (surplus);
  the parity test pins that every euro printed is one of the projection's own numbers.
- **The target line of the projection steps WITH the fund** (`fireService.calculateCoastFIREProjection`, 2026-08-25):
  `retirementCapitalRequired` is already net of the fund (the walk subtracts it valued at retirement —
  `amountToday × (1+r)^yearsToRetirement`, whether it unlocks before or after the target age), so `fireNumberTarget`
  is that net figure until the unlock and the gross one (net + the unlocked funds grown to retirement) from it. Before
  the fix the flat net line beside a stepped series showed the portfolio crossing the target with 24% of the Coast
  number still missing. A fund unlocking after the target age is never on the plot and never added. Pinned by tests.
- **The verdict's two capital figures are net of the fund** (`futureValueAtRetirementWithoutNewContributions` grows the
  FREE capital; `retirementCapitalRequired` is net of the fund's re-entry) and the lock sentence says so — «I 31.400 € nel
  fondo pensione sono esclusi da queste cifre perché restano bloccati fino al 2045; il calcolo li conta da quell'anno
  in poi». The Traguardo footer names the gross line («472.977 € con il fondo
  pensione dentro») only when the unlock is on the plot; an unlock past the target age is said as such.
- The lock is `summarizeLock(pensionLockState, { currentYear, ritaUnlockAge })` — the same `FireLock` the Calcolatore
  reads — with `ritaUnlockAge` from the SAVED settings (`resolveRitaUnlockAge(settings)`): Coast has no RITA form of its
  own. The page has NO switch: the pension lock is the Calcolatore's Base di calcolo control, the Ipotesi description
  names its state («fondo pensione bloccato fino al 2048») and the Dettaglio explainer says where it lives.
- **The pension clause lists EVERY pension with its start year** («dal 2052 la Pensione estera, dal 2055 la Pensione
  INPS e dal 2061 la pensione di Marco coprono insieme …»), at `totalNetAnnualPensionAtSteadyState / 12`; a label
  that starts with «Pension…» takes the article («la Pensione INPS»), any other label — a household names rows after
  the person — reads «la pensione di Giuseppe». Start years come from the decorrenza, else
  `currentYear + ceil(yearsUntilStart)` — the same rule as the Afflussi events. No pension → no clause, never
  «nessuna pensione».
- The Ipotesi disclosure has ONE «Salva ipotesi» (in the Profilo tile) for its four tiles: the form is one document and
  `useCoastFireSettingsDraft` has one mutation. Config-first via the `useRef` seeded flag set INSIDE a `setTimeout(0)`
  (StrictMode clears the first timer), open only while no age is saved, reopening on an unsaved edit or an
  `incomplete` pension state; never auto-closed. The pension issues render as lines under the tile's reading (warning
  tone for the incomplete ones), not as a banner.
- The «Impatto delle pensioni» table is `hidden desktop:block`; below `desktop:` the same rows are a flat list — five
  columns at 350px pushed the tile past the phone's edge (caught by `coast.mobile.spec.ts`, which measures `main`'s
  offenders like `fire.mobile.spec.ts`).
- Playwright locates the tiles by `role=region` + `aria-label` («Traguardo Coast FIRE», «Afflussi già considerati»,
  «Scenari Coast FIRE»), the verdict by «Verdetto sul Coast FIRE», the disclosures by their VISIBLE text (`/^Ipotesi/`,
  `/^Dettaglio/` — the Ipotesi trigger carries the basis line, so it can be asserted closed), the hero as
  `p:has-text("numero Coast FIRE") + span`, the scenario list by `role=list` «Numero Coast FIRE per scenario». The
  fixture fixes expenses but not the clock: structure and format only (AGENTS → *Browser-Driven E2E*).

### FIRE › What If — a verdict over tiles (`components/fire-simulations/WhatIfAnalysisTab.tsx`, `components/fire-simulations/whatif/*`, `lib/utils/{whatIfSummary,whatIfNarrative}.ts`)
- The tab answers «cosa cambia se…?» and computes nothing: `calculateWhatIfImpact` (service) perturbs and diffs, `whatIfSummary.ts`
  turns the impact into the event as stated, the before/after pairs, the merged series, the divergence and the sensitivity reading,
  `whatIfNarrative.ts` puts them into words. The service now RETURNS the two base-scenario walks it runs (`projections`), so the
  chart draws the series the years were read from — never a third walk in a component. The job-loss decomposition (retained income
  covers the expenses first, the portfolio pays the uncovered part) is `decomposeJobLossHit`, out of the component.
- **The headline and the tone come from the delta in years** (`timelineCase`: keeps · loses · gains · neverBoth · leaves · returns ·
  same · moves), shared by the verdict and the Prima e dopo reading; a `yearsToFIRE` of 0 means reached, null means beyond the
  50-year horizon (`WHAT_IF_HORIZON_YEARS`, the Calcolatore's). **Only the deltas carry a sign** (`signedAmount`), by the direction
  that is good for the row (`buildDeltaRows`: net worth and income higherBetter, FIRE number, Coast number and gap lowerBetter);
  a change under half a unit is «invariato», never «+0 €». **An empty perturbation** (`WhatIfEvent.isEmpty`: no months or no lost
  income, a lump sum of 0, both cashflow deltas 0) gets «Nessun evento da simulare.» with today's plan, not a zero delta.
- **The event clause is household-agnostic**: months, the lost amount and its share of expenses + savings (`lostShareOfIncomePct`,
  null when the household earns nothing, and the clause drops). The names of the sources live only in the Evento tile's picker.
- **The Prima e dopo tile has no hero on purpose** (the canvas's proposal): the year is the verdict's headline and the Delta's first
  row. Its one figure is the divergence — both capitals at the FIRE year of the plan of today (`summarizeDivergence`; the
  after-event year when today's never gets there; null when neither does or the target is already reached), read from the merged
  series (`buildWhatIfComparisonSeries`: the union of the years, null where a walk stops — a walk ends five years after its last
  scenario reaches FIRE, so a purchase lengthens the after side and `connectNulls={false}` leaves the gap). The plan of today is
  `--muted-foreground` (a baseline is neutral), the plan after the event `--chart-1`; the before target is drawn only when the
  event moves the FIRE number (`targetsDiffer`). Reference lines mark the two FIRE years, none for a side reached today.
- **The Sensibilità matrix runs on the plan of TODAY**, centred on the actual or the typed reference expenses, never on the event —
  the aside says «piano di oggi», the footer says why. Cells: the baseline outlined (`border-foreground`), better `bg-positive/15`,
  worse `bg-destructive/15` — the sign tokens, not chart slots. Below `desktop:` it is one block per expense level with the savings
  cells in two columns (a cardified matrix needs its own labels). `summarizeSensitivity` reads the −10% row at the baseline column
  and the column right after the baseline (`+25%`, or `€5k` on the zero-savings fallback, whose label starts without `+`).
- **Every Delta row is `flex-wrap`**: «Raggiunto → Raggiunto» in a 3-column tile drops under the label, right-aligned, instead of
  splitting «Numero Coast oggi» over three lines (the Per classe row's rule).
- Playwright locates the tiles by `role=region` + `aria-label` («Prima e dopo l'evento», «Delta dell'evento», «Evento simulato»,
  «Sensibilità degli anni al FIRE»), the verdict by «Verdetto sul What If» (its sentence is the `p` under the heading — the region's
  text starts with the headline), the event switch by `role=group` «Tipo di evento» (`aria-pressed` buttons), the rows by the lists
  «Prima e dopo per il FIRE» / «…per il Coast FIRE», the picker by «Fonti di reddito», the matrix by its `table` (1440) or the
  list «Anni al FIRE per livello di spesa» (390). On the base account the target is REACHED (small expenses), so a spec asserts the
  headline against the set of live phrasings and the deltas against a typed amount, never a year.

### FIRE › Monte Carlo — a verdict over tiles (`components/fire-simulations/MonteCarloTab.tsx`, `components/monte-carlo/*`, `lib/utils/{monteCarloSummary,monteCarloNarrative}.ts`)
- The tab answers «quanto è probabile?» and computes nothing: `runMonteCarloSimulation` runs, `monteCarloSummary.ts` reads the run (the base
  scenario's horizon dated in years and in age, the first year the 10th percentile touches zero, the final percentiles of ALL simulations, the
  histogram with the median's bin, the three scenarios, the Dettaglio's overlay and percentile rows, the plan as typed), `monteCarloNarrative.ts`
  puts it into words. **The median the page reads is the last percentile row's p50** — `results.medianFinalValue` is the median of the SURVIVORS
  only and overstates a plan that fails often; it stays in the payload, no surface prints it.
- **ONE run = the three scenarios** (Orso · Base · Toro, `buildParamsFromScenario` over the shared plan): the verdict, Probabilità and
  Distribuzione read Base, the Scenari tile reads all three. The «Simulazione singola | Confronto scenari» toggle went with the mode it switched;
  the single form's market fields ARE the Base scenario's, and the plan's `params` carry `getDefaultMarketParameters()` only as a placeholder
  every run overrides.
- **Auto-run once, explicit afterwards** (The Stale-Run Rule): the seeded plan runs on its own (`didAutoRunRef`, inside a `setTimeout(0)` —
  react-hooks/set-state-in-effect); every later run is «Esegui». A run keeps the inputs it was made with (`MonteCarloRunState.inputs`) and
  `haveRunInputsChanged` compares the PLAN fields, the scenarios and the inflows — never the single form's market fields — so the Parametri footer
  says «I risultati sopra usano i parametri dell'ultima esecuzione» in the warning tone while every tile keeps the last run. A 30.000-path run on
  every keystroke was one alternative; a silent re-run that changed the verdict under the reader's eyes was the other.
- **The form is strings, the run is numbers**: the tab owns `MonteCarloForm` (as FireParametri's form) and derives `MonteCarloParams` with
  `parseItalianNumber` (it-IT amounts, plain numbers, a hand-typed «12.5») and `formatInputAmount`; the «Totale / Liquido» shortcuts write the
  string. The seed happens ONCE (`didSeedRef`) from the portfolio net of the locked funds, `plannedAnnualExpenses` and
  `deriveMonteCarloAllocation` (the ONE normalizer, shared with the Ventaglio; 60/40 when the four classes hold nothing) — a refetch never
  clobbers a typed value. Until the seeded plan has run once the tab shows the `TileGridSkeleton`; a plan that cannot run shows the verdict
  («Monte Carlo non calcolabile.») over the Parametri tile alone.
- **The pension lock rides as inflows at today's value** (`resolvePensionLockState` → `capitalInflows`; order inflow → return → withdrawal in the
  service): the starting capital is net of the locked total, the read-only row under the amount field names each inflow, the fan draws a dashed
  muted guide at the unlock year when it is on the plot and the Probabilità footer names the step.
- **`createDistribution` caps the equal-width bins at the 95th percentile** (2026-08-26) and the last bin takes the tail to the maximum
  (`from`/`to` on every bin, the last one closed on `to`): bins stretched to a ten-times-the-median outlier left nine of ten empty on the first
  screenshot. The Distribuzione footer names both bounds; the bars are hand-written SVG (`FinalValueBars`, the In-tile Bars rule: labels outside
  the SVG, the median's bin outlined, hover reading under `(pointer: fine)`).
- **No figure on the page wears a sign token** — a probability is not a gain, a projected value not a loss; the headline's tone
  (`resolveSuccessTone`: ≥ 90 positive, 80–89 warning, below negative — the old hero's thresholds) is the one judgement, and the fan's dashed
  zero line is the one `--destructive` stroke (the capital exhausted is a fact with a sign). Scenario colours are ONE map, `SCENARIO_SLOT`
  (bear 4 · base 0 · bull 1, the Calcolatore's), read by the Scenari rows, the Parametri swatches, the overlay and its footer legend.
- **The elision before a percentage follows the Italian number name** (`startsWithVowel`): «nel 10,6%», «nell'11%», «nell'84,2%», «nel 18,2%» —
  a digit-based rule printed «nell'10,6%» on the first screenshot.
- Playwright locates the tiles by `role=region` + `aria-label` («Probabilità di successo», «Distribuzione dei valori finali», «Scenari a
  confronto», «Parametri della simulazione» — pass `exact: true`: the first is a prefix of the scenario list's name), the verdict by «Verdetto sul
  Monte Carlo», the hero as `p:has-text("Probabilità di successo") + span`, the scenario rows by the list «Probabilità di successo per scenario»,
  the fan by `[role="img"][aria-label*="Ventaglio del piano di prelievo"]` (the Calcolatore's is «Ventaglio Monte Carlo»), the inputs by their
  `#mc-*` ids, the disclosure by `/^Dettaglio/`. The figures are random draws: a spec asserts structure, format and the stale flag's round trip
  (edit → warning footer → Esegui → «Ultima esecuzione con questi parametri»), never a rate.

### FIRE › Obiettivi — a verdict over tiles (`components/fire-simulations/GoalBasedInvestingTab.tsx`, `components/goals/tiles/*`, `lib/utils/{goalsSummary,goalsNarrative}.ts`)
- The tab answers «sono in rotta?» and computes nothing: `computeGoalTrajectory` (per goal, ONE `now` per mount) and `calculateGoalProgress` run as
  before, `goalsSummary.ts` chooses what each tile shows (`summarizeGoals` in urgency order with the counts and the assigned share, `summarizeTrajectory`
  with the chart's series, `buildMilestones`, `summarizeDerivedAllocation` over `deriveTargetAllocationFromGoals`, `summarizeAssignments` closed by the
  free shares), `goalsNarrative.ts` puts it into words. The verdict per goal is the trajectory's own (projected value at the deadline against the target,
  1% tolerance); the headline judges the DATED goals only (`counts.dated`) — every one in time positive, some late warning, all late negative, nothing to
  judge neutral — and the sentence gives every goal its clause, the late ones with the EXTRA pace (`required − planned`, the whole pace when nothing is planned).
- **Dates are `{ year, month }`** (`goalDateFromIso` reads the ISO string, never a `Date`): a deadline typed as «2029-06-30» stays in June whatever
  timezone renders it. `monthsBetween` still ceils on 30.44-day months, so «giugno 2029» from 2026-08-26 is 35 months, not 34 — derive a test
  expectation from the function, never by hand (the first cut of the tests lost ten assertions to that and to Intl's ungrouped four-digit amounts, «1531 €»).
- **The selection is a row** (`selectedGoalId`, falling back to the most urgent, following a deletion, session-only); the Traiettoria's actions (Modifica,
  Elimina through `useArmedDelete`, the disarm announced by a `role="status"` span) sit in its aside — the Scheda's ghost buttons from `desktop:`, 44px
  targets below. In demo the aside says «non modificabile in demo» and the Assegnazioni footer «In demo le quote non si modificano».
- **The goal's hex is identity** (dot, track, milestone, projection, the Panoramica's ObiettivoTile); the classes of Allocazione derivata take
  `ASSET_CLASS_CHART_INDEX` through `useChartColors` — the deleted `AllocationComparisonBar` carried a map of its own. Its «assigned» bar aggregates
  every goal's quotas by euro (reached included) while the derived target excludes the reached goals: the footer says the reached do not weigh.
- **The free shares are the residual**: `summarizeAssignments` lists an instrument with more than 0,5% and 0,50 € free, sums `freeTotal` over EVERY
  instrument so the «Non assegnato» row adds up, and names an instrument assigned past 100% in the footer's warning tone (the amber card is gone). Orphaned
  quotas are skipped as `goalMath` does; the tab still runs `cleanOrphanedAssignments` before every write, and every write rewrites the document whole.
- **The Milestone never shows a deadline as an arrival**: a late goal keeps its projected month with «15 mesi dopo la scadenza di giugno 2029» under it, a goal
  the pace never reaches reads «mai, al ritmo attuale», an open goal is not listed. The old timeline fell back to the target date and called it a milestone.
- Playwright locates the tiles by `role=region` + `aria-label` («Obiettivi», «Milestone», «Allocazione derivata», «Assegnazioni» — pass `exact: true`,
  «Obiettivi» is a prefix of the list's name; the Traiettoria by `/^Traiettoria di /`), the verdict by «Verdetto sugli obiettivi», the rows by the list
  «Obiettivi in ordine di urgenza» (buttons named «{name}, {chip}», `aria-current` on the selected), the residual by the rowheader «Non assegnato», the
  disclosure by `/^Dettaglio/`, the split by the list «Ripartizione del versamento». The base account has no goals: a spec plants its own fixture
  (`goalBasedInvesting/{uid}` + the two settings flags with `merge: true`) and removes it.

### Asset Trade Ledger
- Three trade types per asset — BUY / SELL / ADJUSTMENT — with an optional cash settlement that debits or credits a
  cash account atomically, so a settled trade is net-worth-neutral. `TransactionDialog` writes, `AssetMovementsDialog`
  reads (P&L, return, XIRR, per-sell realized % at the PMC of the trade). Feeds Rendimenti (invested capital, realized
  gains) and Dividendi (holding start).
**Engine** (`lib/utils/assetTransactionUtils.ts`, pure and Firebase-free)
- ALL trade money-math lives here (replay, PMC, realized P&L, XIRR, total return, invested capital); the service/route
  layer is a thin atomic writer. A new `AssetTransactionType` must update the replay switch, the zod schema AND
  `TransactionDialog`. **Native PMC excludes fees**, which live only on the EUR side, and a sell never moves it.
- **The migration baseline (`isBaseline` BUY) NEVER stamps `holdingStartDate`**, and `replayTransactions` returning
  `holdingStartDate: undefined` means **leave the asset doc untouched** — never `deleteField()`, which would zero YOC for
  the whole portfolio.
- **Replay ordering is deterministic and internal** (date → baseline < buy < sell < adjustment → `createdAt` → `id`), and
  this same replay IS the pre-write validation: invalid histories throw `LedgerValidationError` with an Italian
  `userMessage` forwarded verbatim in a 422.
- **The per-asset XIRR is date-exact and SEPARATE from `performanceService.calculateIRR`** — keep both; it returns a
  FRACTION, and `null` renders as "–", never 0. **`replayTransactions` replays ONE asset**, so `aggregateRealizedByYear`
  (same engine, consumed by `summarizeRealizedGains` → `PlusvalenzeTile.tsx`) must group by `assetId` FIRST: realized P&L is PMC-dependent
  per position.
- **Per-transaction derived data (a sell's own P&L %, PMC-at-trade) comes from `replayTransactionsWithEffects`**, never
  from re-running `replayTransactions` on every prefix (O(n²)). One pass emits one `LedgerTransactionEffect` per
  transaction, with the optional fields populated ONLY for `sell`, so a caller indexes by id with no holes.
  `replayTransactions(txs)` is just `.state` of the same call.

**Service, API, migration** (`lib/server/assetTransactionUseCase.ts`)
- **Writes are Admin-API-only**: a trade atomically rewrites the asset's derived fields from a full replay, and only the
  Admin SDK can `tx.get(query)` in a transaction. Reads stay client-SDK; auth = `assertCanAccessAccount`.
- All reads before any writes; `resolveTradePriceEur` (network) resolves BEFORE the transaction; derived fields written
  DIRECTLY in-tx, not via `updateAsset`.
- **Migration is idempotent**: meta doc present → done; else one baseline BUY per eligible asset, batched ≤400, **meta
  doc written LAST**. Mutation hooks invalidate a TRIPLE: `assetTransactions.all` + `assets.all` + `dashboard.overview`.
- **`updateAssetMetadata` closes the `deleteField()` trap** — ledger-type edits go through it, never `updateAsset`.
  **Testing the atomic write**: the in-memory Admin fake is built inside the hoisted `vi.mock` factory, so reference
  `vi.hoisted(...)` state, never a plain const.

**UI and Rendimenti/Dividendi surfaces**
- `resolveBondPrice` is exported from `AssetDialog.tsx` and REUSED — a trade's `pricePerUnit` must mean exactly what
  `averageCost` means. **"Capitale investito" uses the page's OWN period bounds** and is deliberately a DIFFERENT number
  from "Contributi Netti"; "Plusvalenze Realizzate" is NOT period-scoped — a realized sale belongs to its fiscal year.
- **`totalReturnAssets` has two paths**: LEDGER (≥1 trade doc, the only one that can represent a closed or partially sold
  position) and a STATIC price-vs-PMC fallback. **`capitalGainAbsolute` means something different on each** (static =
  unrealized only, ledger = realized + unrealized), but both preserve `totalReturnPercentage = capitalGainPercentage +
  dividendReturnPercentage`, which the UI relies on — change one formula and re-derive the other. The ledger denominator
  is `investedEur` for BOTH open and closed states, so the meaning does not flip when a position closes.
- **`dividendReturnPercentage` is UNIFIED across both paths**: per-payment `net ÷ cost-basis-at-payment-time` using
  `Dividend.costPerShare`, never a flat ratio (which loses the anti-dilution property). `costPerShare` is stamped in
  NATIVE currency despite its type comment, so `fallbackAverageCost` must also be native.
- **When a second computation path lands next to an existing card, audit the STATIC COPY**, not just the numbers.

### Allocation — `allocationRole` and where the filter must live
- **`Asset.allocationRole` is ONE field with THREE values**: `tradable` (default, in denominator and plans); `frozen`
  (**in the denominator, never in the plans** — dropping a bond-heavy pension fund from the totals would report the free
  portfolio's mix as your real exposure, and counting it makes the plans *compensate*, which is the value of the role);
  `excluded` (**out of the page entirely, denominator included**, or a house pegs its class permanently off-target).
- **Legacy read-fallback: `excludeFromAllocation: true` → `excluded`, never `frozen`**; never write that field again.
- **No role is ever inferred at read time** — the `realestate → excluded` / `Private Equity → frozen` / `pensionFund →
  frozen` suggestion is a FORM default for NEW assets, one ternary in the existing touched-flag effect. The role is
  orthogonal to `isLiquid` (only the liquid/illiquid split) and `isPrimaryResidence` (only FIRE net worth).
- **THE RULE: partition upstream of `compareAllocations`, never downstream.** Filtering the *output* is wrong twice:
  every other class's `targetValue = target% × totalValue` measures against the wrong base, and it breaks the
  Σ(current − target) = 0 invariant the balance score halves.
- **Do NOT push the filter into `calculateCurrentAllocation`** — it also serves `/api/portfolio/snapshot`, which must keep
  freezing the WHOLE portfolio. **Consequence kept on screen**: the Allocazione header's total excludes `excluded`, so it is
  SMALLER than the Panoramica net worth; the Bilanciamento footer says so and keeps `frozen` (inside the total) and
  `excluded` (outside it) as **two** sentences, and the Dettaglio lists them in two tiles.
- **The orphaned target is the trap this feature sets**: flag the house and its 70% sub-target survives with zero
  allocatable value, so new money pours into a bucket that cannot hold it. Any target-driven surface owes two things:
  `findOrphanedTargets` (positive target + ~zero allocatable value + excluded value behind it; a class is not orphaned if
  any sub-target is still reachable) and `stripOrphanedSubTargets`, which must REMOVE them from the map handed to
  the Piano tile's plans **and** the Per classe rows, not merely warn.
- **An empty target is not an orphaned target** — an unfunded sub-category MUST keep receiving money. The distinguishing
  condition is *excluded value behind it*, never "current value is zero".
- **The subcategory is OPTIONAL, so every euro of a class must land in a bucket** (2026-08-30). The snapshot files a
  holding with no `subCategory` under `NO_SUBCATEGORY_LABEL` («Senza sottocategoria»): dropping it made the class total
  — the DENOMINATOR of every sleeve — larger than the sum of the sleeves, so each targeted sleeve read under target by
  the unclassified share while its euros appeared nowhere. `toLegacyAllocationResult` emits that bucket as a row with
  **no target, no gap and action `OK`**, rendered by `AllocationRow untargeted` (share and value, no chip, no tick) and
  sorted LAST: the answer to «troppo o troppo poco?» there is «classificalo», which no COMPRA/VENDI chip can say. Both
  plans must treat it as "no opinion": `buildContributionPlan` drops it as a destination (you cannot buy the absence of
  a sleeve) and `buildWithdrawalSubCategoryNodes` ignores its 0 target and keeps the pro-rata fallback, or a withdrawal
  would drain the unclassified holdings first.

### Allocation — the two plans and the leverage engine
- **"Versa" and "Preleva" are ONE tree with the sign flipped**: both return `PlanNode[]` (`amount` always positive).
- `splitFromSurplus` mirrors `splitTowardTarget` and drains what sits ABOVE target first, with two constraints the
  contribution side has no analogue for: `take ≤ capacity` per item and `Σtake ≤ Σcapacity`. The invariant every caller
  relies on: **Σamount === min(requested, Σcapacity)** at every level.
- **`currentValue` and `capacity` are DIFFERENT inputs to `splitFromSurplus`**: the surplus is measured on `currentValue`
  (a frozen fund really does push its class above target), the take is capped at the TRADABLE slice. `buildRebalancePlan`
  caps the SELL side at `tradableByClass` and never the BUY side.
- **The "neutral targets" trick**: passing a synthetic `targetPercentage = value / bucketTotal × 100` makes BOTH split
  functions degenerate to pro-rata below the class level, with no branch. Do not add a second algorithm.
- **THE ASYMMETRY is the design**: *you can be told to buy something you do not own; you can never be told to sell it.*
  Versa's sub-category buckets come from the configured TARGETS, Preleva's from the HOLDINGS (splitting across
  only-targeted subs would strand every euro in an untargeted one).
- **Neither plan may ever name a `frozen` holding**; Versa additionally drops a sub-category that is *entirely* frozen,
  renormalizing onto what you CAN buy. An **unfunded** target is a different thing and must stay. **A composite asset
  yields one holding per component**, each carrying the parent's `tradable` flag.
- **The balance score is band-INDEPENDENT — do not "fix" it to read the action.** With Σtarget > 100 the drifts do not
  cancel, so it decomposes: `leverageGapPp = Σd`, `misallocationPct = (Σ|d| − |Σd|)/2`, `score = 100 − misallocation −
  |gap|`. Only the verdict, plan and chips react to the band; a class held WITHOUT a target entry never enters
  `byAssetClass` (CLAUDE.md → Known Issues).
- **Leverage**: `expandAssetExposure` must NOT special-case `pensionFund`. The class residual is solved against the
  post-trade **MARKET** base — `classCoeff[c][i] = exposurePerEuro[c][i]` (no `instrumentLeverage` term), `classConst[c]
  = currentNotional[c] − tf[c]·marketAfterTrade` — because scaling by the *notional* total re-multiplies by the current
  leverage. The *leverage* term keeps `instrumentLeverage` as its coefficient.
- **`AllocationResult.totalValue` is the NOTIONAL total** (== market at leverage 1);
  `marketValue`/`notionalValue`/`leverageRatio`/`hasLeveragedExposure` are REQUIRED so `tsc` forces the band
  re-classifier to copy all four through. **The whole leverage UI is a `hasLeveragedExposure` fork, not a rewrite.**
- `ASSET_CLASS_CHART_INDEX` is the single source of a class's chart slot, so a class is the same hue on Allocazione and
  Storico. **A synthetic series is not exempt** — Storico's "Previdenza" band is slot 8, past the 0-7 the union owns;
  anything new starts past 8.
- **`ASSET_CLASS_SEQUENCE` (`lib/utils/allocationUtils.ts`) is the ONE enumeration of the `AssetClass` union**, typed
  `AssetClass[]` so widening the union without extending it is a compile error. A surface that hand-lists class names
  drops the newer ones in silence — and **dropping a class drops its EUROS, not merely its label**: `pdfDataService`'s
  six-name array left `trendFollowing` and `carry` out of the PDF's allocation table entirely, so the printed rows
  stopped accounting for the whole portfolio while every one of them still looked right (2026-08-30). Known readers, all of which must stay
  readers: `assetAllocationService`'s `ALL_ASSET_CLASSES` and `buildTargetsFromGoalAllocation`, `chartService`'s
  `byClass`, `pdfDataService`, `historyComposition`'s band vocabulary, `manualSnapshotAmounts`, `GoalFormDialog`,
  `AllocationBreakdown`'s order, and the goal-proposal schema in `lib/server/assistant/prompts.ts` — the model cannot
  propose a class it is never shown, while `goalProposal.ts` already accepted it. **Two maps stay hand-written on
  purpose and must be extended by hand**: `assetService`'s `ASSET_CLASS_ORDER` holds RANKS, not membership, and a class
  missing from it sorts last (`|| 999`) whatever its weight; `getDefaultTargets` holds the seed PERCENTAGES a new user
  starts from, and a class missing from it never appears in their target document at all.
- **Widening `AssetClass` only breaks the Records actually typed `Record<AssetClass, …>`** — grep first. The costly one is
  the zod `z.enum([...])` in `AssetDialog.tsx`, surfacing as indirect assignability errors on `reset()`/`setValue()`
  sites that never name the enum.
- **A label map has its own REGISTER and is extended, never consolidated.** Five Italian label maps exist on purpose:
  `allocationUtils.ASSET_CLASS_LABELS` (nominal — «Azioni», the canonical one), `chartService.getAssetClassName`
  (nominal, feeds Panoramica › Composizione and Patrimonio › Classi), `pdfDataService.getAssetClassName` (**adjectival**
  — «Azionario»), `PortfolioSection.getAssetClassShort` (abbreviated to the column — «Materie P.») and
  `monthlyEmailService.ASSET_CLASS_LABELS` (lowercase — «Materie prime»). Routing them all through one constant renames
  four classes in the PDF for a fix that was meant to add two keys. **Add the key to each map**; they all close with
  `|| assetClass`, so a missing one prints the camelCase Firestore key on screen (2026-08-30: it did, for
  `trendFollowing` and `carry`, on the Panoramica, Patrimonio, the PDF and the periodic emails).
- **A raw class key must never reach the model either.** `lib/server/assistant/prompts.ts` resolves every
  `assetClass` through `assetClassLabel()` before interpolating: the blocks are quoted back to the user in Italian
  prose, so «dell'trendFollowing» is how a Firestore key becomes a sentence.

### Allocazione — a verdict over tiles (`app/dashboard/allocation/page.tsx`, `components/allocation/tiles/*`, `lib/utils/{allocazioneSummary,allocazioneNarrative}.ts`)
- **The page has no axis; the band is a SCOPE.** `BandToggle` (the `AsideToggle` form, with the custom `pp` field beside it) sits in the Bilanciamento tile's aside: it re-classifies every COMPRA/VENDI/OK — verdict, Piano, Per classe chips — while `computeBalanceScore` stays band-independent and the ring never moves. Never put the band beside the verdict (DESIGN.md → The Scope-Is-Not-An-Axis Rule).
- **Three pieces of page state feed the words**: `band`, `planMode` and `amountInput` (default `'1000'`). The verdict's last clause is ALWAYS `summarizeNextMoney(planInputs, amount)` — the Versa split — whatever mode the Piano shows; the tile's reading is `describePlan(buildPlanView(mode, amount, inputs), band)`. A verdict that followed the toggle would be the tile's title.
- **`leverageGapPp` is a leverage figure only when leverage is in play** (`hasLeveragedExposure || targetLeverageRatio > 1.01`). Otherwise a negative Σdrift is wealth in classes the targets do not name (`untargetedClassLabels`, from the holdings not in `byAssetClass`) and `describeBalance` says «il 78% è in classi senza target (Immobili, Liquidità)» — the page passes `leverageGapPp: 0` plus `untargeted` in that case, never both.
- **A drift wears no sign token.** Every figure of `allocazioneNarrative.ts` is `mono` and uncoloured; the action hues (`useActionColors`, resolved ONCE per tile and passed down — `InstrumentTradeList` takes them as a required prop) colour the chips, the plan amounts and the ring only.
- **`summarizeHoldings` counts ASSETS, not rows**: a composite asset is one holding per leg in `buildHoldings` (`id` = `{assetId}:{index}`), and «2 asset» for one 70/30 fund is a lie. The per-holding share of a group (`rows[].sharePct`) is the summary's, so the Dettaglio computes nothing.
- **`PlanView` is a discriminated union and the Piano narrows on `view.mode`, never on the toggle**; under leverage it renders `trades` (instruments), never `moves`. `MIN_VISIBLE_AMOUNT` lives in `allocazioneSummary.ts` (re-exported by `PlanRow`). A Ribilancia with nothing to do draws no body: the reading already says «Tutto in linea», and «a saldo zero» is said only when Σsell and Σbuy agree within a euro (a class inside the band keeps its gap).
- **`AllocationRow` is ONE line + a 3px `TargetTick`** with fixed mono columns (52 · 44 · min 76 px) and a `basis-[140px]` name block: below that room the columns drop to a second line (`ml-auto`) — at 390 the name used to shrink to an ellipsis. The orphan-stripped `bySubCategory` feeds the rows AND the plans; the orphans themselves are the tile's footer (a warning block), not a page banner. Classes follow `assetClassSequenceIndex` (`allocationUtils.ts`), not `ASSET_CLASS_ORDER` from `assetService`, which drags the SDK into a tile.
- **Esposizione fetches on mount** (`usePortfolioExposure(userId, true)`; the server cache is 24 h and keyed on the composition) — the old collapsible waited for a click. The remainder row is «Resto del portafoglio» for every view; one row open at a time, its sources in a persistent `aria-live` block under the list (a live region mounted together with its content announces nothing); the empty-view sentences are `describeExposureEmpty`'s.
- **The Previdenza tile is the ONE place the excluded wealth is part of a picture** (`buildPensionLookThrough` takes the full asset list, `calculateAssetValue` injected so the module stays SDK-free); its heading says «esclusi compresi» whenever it is, and the reading says whether the fund is inside the allocated total (`allFrozen`).
- **A fixed-amount cash target («fisso €») keeps a STALE `targetPercentage` in Settings**, whose total reads «100% (excl. cash)». Two rules follow: `deriveTargetLeverageRatio` skips cash when `useFixedAmount` (it read a plain 100% plan as a 1,05× leverage target), and `compareAllocations` re-expresses every other class's `targetPercentage` on the MARKET base (`targetValue / marketBase`) so Σtarget% = 100 like Σcurrent% — before, a 70% equity target on 175k of 200k printed «70%» beside a current share measured on 200k, and every class read under target by the cash share. Read the EFFECTIVE targets from `byAssetClass`, never the raw Settings (the Bilanciamento target bar and the leverage engine's `targetPercentageByAssetClass` do).
- **`buildCompositionPair` normalises the target on its own sum** (a leveraged target sums above 100) and computes `targetPercentage * 100 / sum`, not `(pct / sum) * 100` — the second prints `55.00000000000001`. `buildCompositionLegend` is the ONE legend of the two bars (current order, target-only classes appended, a gap where a side is missing).
- **Deleted on 2026-08-25**: `AllocationHero`, `BalanceScoreGauge`, `RebalanceBandControl`, `ActionPlanner`, `RebalancePanel`/`ContributionPanel`/`WithdrawalPanel`, `AllocationCompositionBar`, `PensionAllocationCards`, `ExposureSection`, `AllocationPageSkeleton`. `CompositionList` prints its share through chartService's formatter since then (it printed `42.4%`).

### Fondo Pensione
**Data model** (`types/pension.ts`, `lib/utils/pensionDeduction.ts`)
- **`pensionFund` is an `AssetType`, never an `AssetClass`, and never a ledger type.** Its value is statement-driven, held
  in `quantity` **at price 1**; `TYPE_TO_CLASS['pensionFund'] = 'equity'` is a fallback for an empty `composition`, so
  any `assetClass`-keyed default effect must exclude the type explicitly.
- **An instalment plan declares its cost ONCE** (2026-08-28): with «Acquisto rateale» on, the dialog's top «Importo
  (euro)» is HIDDEN and `amount` is optional in the schema (a `superRefine` requires it only without a plan). It used
  to be required and then silently overwritten — `createInstallmentExpenses` writes `amount: installmentAmounts[i]`
  per row — so 100 there and 600 in «Importo totale» saved 600 without a word. «Importo totale» now exists in BOTH
  modes (it is what «Genera campi rate» divides in `manual`), and the save path reads `expenseData.amount`, never
  `data.amount`. The toggle is creation-only, so an existing instalment row still edits its own amount normally.
- **The `AssetType` union is enumerated in TWO places in `AssetDialog.tsx`** — `TYPE_TO_CLASS` and `assetSchema`'s
  `z.enum` (three indirect errors). Update both in one edit.
- **Two tax mechanisms, only one reads history.** ORDINARY deduction is stateless per year (ceilings via
  `getPensionDeductionCeiling` — a law change is one branch there, never a literal at a call site);
  EXTRA-DEDUCIBILITÀ is a multi-year fold maintaining a bank (accrual years 1-5 → drawdown 6-25 → expiry).
- **CORRECTNESS TRAP — `isFirstEmploymentPost2007` ON without a full contribution history inflates the plafond**, because
  the fold treats missing years as 0 contributed. OFF is correct whenever the past is not tracked.
- **The IRPEF ceiling is per TAXPAYER, not per account**: `computePensionTaxRecap` runs once per `FamilyMember` with
  contributions pre-filtered to that member's fund ids. **The `enrollmentYear` fallback must be computed from the
  MEMBER-FILTERED `deductibleByYear`**, or one person's history leaks into another's plafond.

**Contributions** (`lib/services/pensionContributionService.ts`)
- **Client SDK, not an Admin route** — there is no multi-doc replay to serialise, and the only two-balance step is already
  atomic inside `reconcileTransferCreate`. That is the discriminator against the trade ledger.
- **Two write-side guards, both before anything is written**: the origin must be a real cash account
  (`updateCashAssetBalance` writes `quantity` directly, so a wrong origin subtracts euros from an ETF's share count) and
  `assertFundValueLivesInQuantity` must confirm the destination is a `pensionFund` priced at 1. **Write-side only** —
  `deletePensionContribution` has no guard, so a user can undo out of a broken state.
- **The orphan transfer is the dangerous failure**: a failed reconcile deletes the just-created `Expense`, and a failed
  contribution write reverses the value effect, both through `compensate` (best-effort, logged, never rethrown).
- **`taxYear` is validated as ±1 year from `date`** and both roll-ups group by `taxYear`, NEVER `date.getFullYear()`.
  **Contributions never touch spending or savings, by construction** — TFR/employer create no `Expense`, voluntary
  creates a net-zero `transfer`. A nature needing a non-transfer `Expense` means re-auditing every consumer.
- **The periodic statement (NAV overwrite) is NOT a contribution** — plain `updateAsset`. **Register the month's
  contributions FIRST, then overwrite "Valore attuale"**: the statement already includes them.
- **Converting a pre-existing fund is a type EDIT, never delete + recreate** (`byAsset` is keyed by `assetId`): the submit
  branch reads the **stored** type so the edit goes through `updateAssetMetadata`, and the conversion deletes the asset's
  ledger trades. **Latent risk**: `quantity` is replay-derived, so replaying such an asset after conversion would wipe
  every contribution.

**Return** (`lib/utils/pensionReturn.ts`)
- **Three causes of growth, three numbers — never one blended percentage.** The employer share is *compensation* and
  leaves the TWR, returning in `personalReturn = (marketGain + employer) / (startValue + voluntary + tfr)`; TFR is
  deferred salary → denominator, never numerator; the IRPEF saving stays in its own per-taxpayer card.
- **The window starts where the data is trustworthy, not where the snapshots start** (`resolvePensionReturnStart`), and
  **a contribution is attributed to the month its VALUE MOVED (`createdAt`), not its accounting date**.
- **A contribution the fund credits LATE reads as a temporary market loss** (decided 2026-08-26: no change). The model
  moves the value on `createdAt` and the user overwrites the value monthly from the fund's site, which shows the
  contribution 1-2 months later: the recording month subtracts a contribution the snapshot does not yet contain
  (market X too low), the crediting month contains it with nothing to subtract (X too high); the window's total is
  right once the credit lands and the value is updated. A «pending credit» contribution (registered for the tax
  year, value effect deferred until marked credited) is the fix, if ever — it touches the service, `valueEffectMonth`
  (shared with the Panoramica digest) and the dialog.
- **The series ends at the fund's LIVE value, not the current month's snapshot** (`overlayLivePensionValue`): the asset
  rises immediately while the snapshot waits for the cron, so the TWR would drop by exactly the amount paid in. Storico
  and Rendimenti stay snapshot-based.
- **`isPensionReturnMeasurable` = `!isCoverageSuspicious && !hasNoMovement` is ONE predicate with two consumers.**
  *When two places must agree on whether data is trustworthy, the agreement is a named function.* An annualized return
  above 20% means missing contributions, not a brilliant fund.

**Page and integrations**
- **The year axis governs the annual tiles and the verdict's annual clauses only, never the fund value or the
  return** (see *Previdenza — a verdict over tiles*); `resolveActivePensionYear` (pure) reconciles the selection with
  the derived axis so no effect has to sync them. Every tile degrades to `PensionErrorNotice` instead of zeros, and
  the copy agrees in number (`fundSubject()` in `pensionNarrative.ts`).
- **Zod messages must be attached to the TYPE check, not only the constraint**: `valueAsNumber: true` turns an empty
  input into `NaN`, which fails `z.number()` itself — use `z.number({ error: '…' }).positive('…')`.
- **A derived split that a later edit can invalidate must be FROZEN at write time.**
  `MonthlySnapshot.pension` stores what the funds contributed to that month's `byAssetClass`,
  written by re-running `calculateCurrentAllocation` over just the funds — the same function that
  folded them in, so the two agree by construction and Storico subtracts an exact subset instead of
  reconstructing one from today's composition. It is written **unconditionally**, so `totalValue: 0`
  (measured, no funds) stays distinguishable from an absent field (unknown, older snapshot). The
  estimated fallback stays for pre-2026-08 months and for hand-entered snapshots, which have no
  pension input — `prepareAssetClassHistoryData` reports which path a month took via
  `pensionSource`, and the UI names the boundary month rather than warning about an approximation
  that no longer applies.
- `buildPensionLookThrough` (the Previdenza tile of Allocazione) needs the FULL unfiltered asset list; **Storico reverses the split
  `calculateCurrentAllocation` applied**, using the fund's CURRENT `composition` (a documented approximation); **FIRE's
  lock-in toggle subtracts from BOTH `currentNetWorth` and `illiquidNetWorth`** — and it is a bridge
  model across the whole FIRE page (see *FIRE, What If and Goals*).
- **`performanceBase.ts` reads `byAsset`, never `byAssetClass`**, and the exclusion is applied in TWO places because the
  Rendimenti page has two independent snapshot-fetch paths.

### Previdenza — a verdict over tiles (`components/pension/PensionOverview.tsx`, `components/pension/tiles/*`, `lib/utils/{pensionSummary,pensionNarrative}.ts`)
- The page answers «il fondo sta lavorando?» and computes nothing: `pensionSummary.ts` chooses what each tile shows
  (`summarizeFundToday` — the live value, the overlaid series, the month digest, what was ever paid in;
  `summarizePensionMembers` — one block PER CONTRIBUTOR with the return AND the tax recap; `summarizeVersato` and
  `summarizeLedger` on the axis year), `pensionNarrative.ts` puts it into words. `calculateAssetValue` and the IRPEF
  function are INJECTED (`valueOf`, `taxOf`) so the module stays SDK-free.
- **Three causes, three numbers, never one blended percentage** (The Three-Causes Rule): the verdict's sentence is
  «{market clause}, nel {Y} il datore ha aggiunto Z € e il fisco restituisce circa W €» — the market on the block's
  TRUSTED window («da novembre 2025», `resolvePensionReturnStart`), the other two on the AXIS year — and a cause with
  nothing behind it drops its clause (no employer share, no RAL). A closed year is said in the past («ha restituito»).
- **The return is computed per contributor**: the same `pensionReturn.ts` functions on the member's funds and the
  member's contributions (the configured `pensionReturnStartMonth` still wins for everyone), so the verdict and the
  Rendimento tile print the SAME TWR. A fund linked to no member is its own block, named by the fund, without a tax
  clause — never folded into someone else's RAL. `returnState` (`measured` · `suspicious` · `idle` ·
  `no-contributions` · `one-point`) is the one discriminator the verdict, the tile and the Dettaglio read; when it is
  not `measured` the percentage is replaced by the reason everywhere, and «Da dove viene la crescita» is absent.
- **The year axis sits beside the verdict** (Tracciamento's shape) and governs the verdict's two annual clauses,
  «Anno fiscale», «Versato nel {Y}» and «Versamenti {Y}»; «Il fondo oggi» and «Rendimento» are OFF it and name their
  own window in the aside («oggi», «nov 2025 → ago 2026»). The month digest of the hero (`monthEffect`) is measured
  exactly as the Panoramica's «Previdenza» line — live value − the previous month's snapshot − contributions
  recorded since (`valueEffectMonth`), null when the previous month has no snapshot with the fund or the window
  starts later — so the two pages never disagree on a number.
- **Errors degrade per tile and the verdict says what failed** (`buildPensionLoadErrorVerdict`): a failed
  `pensionContributions` query hides the hero's reading and chips (a `[]` would say «nessun versamento registrato»)
  and replaces Rendimento, Anno fiscale, Versato and Versamenti with `PensionErrorNotice`; a failed snapshots query
  drops the series and the Rendimento tile. `assets`/`settings` errors stay blocking.
- The ledger's delete is `useArmedDelete` (two clicks, no timer, announced on arm and disarm); the 3 s auto-disarm of
  the old chapter is gone. Playwright locates the tiles by `role=region` + `aria-label` («Il fondo oggi»,
  «Rendimento del fondo», «Anno fiscale» with `exact: true` — it is a prefix of «Anno fiscale 2026» nowhere, but
  «Versamenti» IS a prefix of the delete buttons' names), the verdict by «Verdetto sul fondo pensione», the axis by
  the tablist «Anno fiscale», the disclosure by `/^Dettaglio/`. The base fixture (`scripts/seedPensionE2E.mts`) runs
  in whatever month: assert the cumulative TWR («+3,48%») and the structure, never the annualised figure.

### Assistant
**Context service** (`lib/services/assistantMonthContextService.ts`)
- Runs server-side — `adminDb` directly, never the client SDK. `selector.month`: `>0` monthly, `0` year, `-1` YTD, `-2`
  history.
- **Every mode must map to its own builder in `stream/route.ts`** — a mode with a prompt builder but no branch silently
  falls through to the monthly builder and is answered on one month of data.
- **`buildAssistantPeriodRangeContext` is the FIFTH builder** (any run of months inside one year: quarters, semesters,
  every periodic email). The `{year, month}` selector cannot encode a range, so its `selector` is the window's CLOSING
  month and the window travels as the first `dataQuality.notes` entry plus `formatBundleForPrompt`'s `periodLabel` —
  never as a new bundle field, which all four other builders would then have to fill.
- **One aggregator, not two**: every cashflow figure comes from a single `buildCashflowBreakdown` call per builder, so
  `Σ expensesByCategory[].total === cashflow.totalExpenses` holds structurally. `transactionCount` **excludes
  transfers**, and a new required bundle field means updating ALL 4 builders (month/year/ytd/history).
- **Removing an `AssistantMode` ripples past the WARNING checklist in `types/assistant.ts`**: grep `Record<AssistantMode,
  …>` too (`assistantFollowUps.ts`'s `CURATED_FOLLOW_UPS` is the live site).

**Prompt builders** (`lib/server/assistant/prompts.ts`)
- `system` is byte-identical across users and requests of that mode — **never interpolate per-request data into it**;
  mode-specific conditionals stay generic and the concrete note lives in `userContent`.
- **`cache_control` is deliberately NOT used** here: cache writes cost 1.25× and only pay off within the 5-minute TTL,
  against sporadic single-user traffic.
- Always include `--- ALLOCAZIONE CORRENTE ---` before the movers section, or Claude hallucinates "unclassified" gaps.
  `formatBundleForPrompt` destructures named fields only — a new bundle field is silently missing unless added, and
  `--- CATEGORIE DI SPESA CONFIGURATE ---` is not redundant: it lists what *exists*, unused categories included.
- **A silent cap in a context builder becomes a hallucinated "N/D"** — an LLM cannot distinguish *absent from the data I
  was sent* from *absent from the world*, and the data-integrity rules then forbid speculation. **Rule: a cap either does
  not exist, or is stated in the text the model reads.** Once a block is exhaustive the system prompt must say so, and
  must tell the model that a missing item means *no spending recorded*, not *no data*. `buildEmailAiPrompt` reuses
  `ASSISTANT_SYSTEM_CORE`: extend the shared core, do not duplicate the guardrail text.
- **`ASSISTANT_SYSTEM_CORE` is shared with `buildEmailAiPrompt`**, so its phrasing about the goals block stays
  conditional: **check every consumer before extending the core unconditionally**, or a surface starts talking about
  data it was never given.

**Streaming, threads, memory**
- `deleteAssistantThread` must delete the `messages` subcollection in ≤400-doc batches first (no cascade in the Admin
  SDK). Never clear `streamingMessages` in a `useEffect([selectedThreadId])` — the SSE `meta` event sets the id
  mid-stream and wipes the buffer; post-stream invalidation uses a local `resolvedThreadId` updated from `meta`.
- **`max_tokens` budgets thinking AND text together** (chat 12000, chat+web 16000, structured 18000) — re-check whenever
  the data block grows. **Read `stop_reason` from the terminal `message_delta`** and append `TRUNCATION_NOTICE`: a limit
  either does not exist or announces itself.
- Memory: only `status === 'active'` items are injected; the fetch is `.catch(() => null)` and never blocks the stream;
  the Anthropic client is lazily imported (a module-level `new Anthropic()` breaks test environments). The context
  bundle lives in React state and is never persisted. `MARKDOWN_COMPONENTS` must be module-level or ReactMarkdown
  re-mounts on every chunk.
- **Do not use `DropdownMenu` for panels containing `Select` or `Switch`** — it closes on any click inside; use
  `Popover`. The mobile thread `Sheet` is controlled and must be closed explicitly in `onSelect`.
- **Merging a partial patch onto existing state: build the merge object with ONLY the fields present in the input**
  (conditional spread), never assign every field unconditionally from a `Partial<T>` — an absent field becomes an
  explicit `undefined` that wins `{...existing, ...patch}` and silently wipes it. `store.ts`'s `mergeMemoryItem`/
  `mergeMemorySuggestion` are the template. A fully-mocked `store.ts` cannot catch this;
  `__tests__/assistantMemoryStore.test.ts` can.
- **One `adminDb.runTransaction` per turn, not one write per mutation**: `extractAndSaveMemory` accumulates every
  candidate/evaluation/suggestion into an `AssistantMemoryMutation[]` applied in one `applyAssistantMemoryMutations`
  call. A new memory-writing feature pushes onto that array — a loop of `updateAssistantMemoryDocument` also races
  against the panel's own PATCH.
- **A field only the GET path can compute (`hasDummySnapshots`) must be optional on the base
  `AssistantMemoryDocument`**, required only on `AssistantMemoryResponse` — never a hardcoded `false` from a write
  helper that cannot know the real value.

**Structured goals** (`goalEvaluation.ts` pure, `goalEvaluationService.ts` I/O, `memoryExtraction.ts` extraction)
- **Structure is NEVER parsed from text.** It arrives from a forced-tool-use Haiku call validated with zod. A malformed
  payload discards the **structure**, not the goal — an un-trackable goal is a legitimate state the panel states out
  loud. `unit` is derived from `kind`, never asked of the model.
- **A tool schema's enum description must speak the UI's vocabulary**, or the model splits one sentence across two kinds
  (e.g. "liquidità" is the product's label for the `cash` class).
- **Goals are always evaluated against the CURRENT month**, never the bundle the request happened to build —
  `evaluateActiveGoals` builds its own. Called unconditionally after a chat turn (pass freshly extracted items as
  `pendingItems` to stay within ONE transaction) and daily from the cron's phase 7.
- **`updatedAt` marks the last CONTENT change** (text, category, structured goal, status), which is why
  `mergeMemoryItem` restores it when a patch only stamps an evaluation. The durable "Ignora" compares against it: bump
  it on every re-evaluation and every ignore expires on the next cron run.
- **The caller owns `structuredGoal`**: a goal patch carrying none clears it. The PATCH route restructures on creation,
  on a text edit, or when the goal has none — never on a status-only change — and on failure leaves the goal
  unstructured rather than keeping a structure that contradicts the new text.

**Goal-Based Investing in the bundle** (`goalMath.ts` + `lib/server/goalData.ts`, prompt section, `GoalProposalCard`)
- **`bundle.goals` is REQUIRED and nullable**: `null` means the feature is off or the user has no document, and the
  prompt says so in words. Absent ≠ off ≠ empty — a model cannot tell them apart, and the data rules then make it answer
  "N/D" about a feature the user simply does not use. *Enabled but no goals* gets its own sentence.
- **`targetAllocationSource` exists because the app can stop using the manual targets.** With
  `goalDrivenAllocationEnabled` on, Allocazione overrides them with `deriveTargetAllocationFromGoals`; quoting the
  Settings ones would be right numbers about the wrong thing. `buildGoalFields` derives goals, targets and source in ONE
  pass, falling back to the manual targets when the derivation yields null, mirroring the page.
- **Carry the trajectory numbers, don't make the model compute them**: `requiredMonthlyContribution` and
  `projectedValueAtDeadline` ship with `assumedAnnualReturn` and are labelled **projections** — a required pace without
  its return assumption cannot be audited, and a model without them multiplies contribution × months, ignoring
  compounding. Present only for goals with BOTH a target and a deadline; absent otherwise, never zero.
- **THE PROPOSAL PROTOCOL: the AI never writes.** It emits ONE fenced ```goal-proposal block of pure JSON; the write
  happens only on the user's Conferma, through `POST /api/goals`. `lib/utils/goalProposal.ts` owns the ONE zod schema
  for both the block and the route body (client-safe, since the card validates before rendering). In zod 4 use
  **`z.partialRecord`** for `recommendedAllocation` — `z.record` with an enum key demands every key.
- **Intercept the block on `pre`, not on `code`** (a card inside `<pre>` is invalid nesting), and a malformed payload
  MUST fall through to a normal code block — the user still sees what the model wrote. `GoalProposalCard` reads owner,
  demo mode and query client itself because `MARKDOWN_COMPONENTS` has to stay module-level.

### Assistente — a verdict over tiles (`components/assistant/AssistantPageClient.tsx`, `components/assistant/tiles/*`, `lib/utils/assistantNarrative.ts`)
- **The verdict is the context, and the page computes nothing**: `buildAssistantPeriodVerdict(bundle, today)` reads the period
  bundle the prompt receives (`selector`, `netWorth`, `cashflow`, `dataQuality`) and `buildNoContextVerdict(toNoContextVerdictInput(overview,
  month))` reads the Panoramica payload for a Libera question with no context — `buildOverviewVerdict` verbatim, never a second
  phrasing. `today` is a PARAMETER (`getItalyMonthYear` once per mount).
- **Tense follows the period, and the bundle has no market attribution**: a closed month «è andato bene / in calo», a closed year
  «è stato un anno in crescita», the running year and YTD «finora va bene», the history «è cresciuto»; growth with spending over
  income is a warning («è cresciuto, ma le spese hanno superato le entrate»). `allocationChanges` are purchases + prices, so the
  verdict NEVER says «il mercato ha pesato» here, and the old context card's sign-coloured class rows are gone. `netWorth.end ===
  null` (a month without its snapshot; the running month is `isPartialMonth`) → «Di luglio conosco solo il cashflow.» /
  «Agosto è ancora in corso.» with the cashflow figures; no snapshot AND no cashflow → «Nessun dato per …».
- **The savings rate is `netCashFlow / (totalIncome + totalDividends)`** (`resolveSavingsRate`), null without inflows; the
  Cashflow tile's reading is the Panoramica's `describeCashflow` on it (no month-over-month delta: the bundle carries one period).
- **Every count on the page is a sentence from the pure layer**: the header's description (`describeAssistantHeader`), the
  Conversazione reading (`describeConversation` — the period question while empty, then «2 messaggi; la risposta usa i numeri di
  luglio 2026 e una ricerca web» with `formatPeriodInSentence`), «Cosa sa di te» (`describeMemory`), the sheet's Obiettivi and
  Fatti (`describeGoalsTile`, `describeFactsTile`), a goal's state (`describeGoalProgress`: «Raggiunto» · «14.300 € / 20.000 €» ·
  «Non tracciato», the percent kind with the comma — the memory rows' `toFixed` retired with it).
- **Rows, not chips, inside a tile**: `AssistantPromptRows` renders the starter questions (the one whose `chip.mode === mode`
  first and bold) and the follow-ups; a row is `min-h-11` below `desktop:`. A starter still PREFILLS the composer (the period must
  be confirmed); a follow-up submits directly.
- **Layout**: `PageContainer width="wide"`; verdict + `AssistantPeriodSelector` in `flex desktop:flex-row desktop:justify-between`;
  the grid is `desktop:grid-cols-[2fr_1fr] desktop:items-start`, the companion `desktop:sticky desktop:top-5 desktop:self-start`
  (sticky needs self-start, *Tailwind Breakpoints*) and it renders AFTER the composer on a phone; the composer stays
  `sticky bottom-0 max-desktop:portrait:bottom-20` inside the left column. The pill's strip bleeds `max-desktop:-mx-4
  max-desktop:px-4` (the page padding) and its tabs are 44px there. `TileGridSkeleton` with `cells={[]}` is the verdict's
  placeholder while a bundle loads.
- **Messages are flat** (`AssistantStreamingResponse`): the user's in a `bg-muted/40` sub-tile, the assistant's full-width prose;
  `GoalProposalCard` is a `not-prose` muted sub-tile (never a card in the tile); `MARKDOWN_COMPONENTS` stays module-level. The
  streaming badge lives in the tile's aside (`role="status"`); the interruption notice is a muted row with «Rigenera».
- **The memory sheet is two tiles + an «Archiviati» disclosure**: the Attivi/Completati/Archiviati tabs are gone; a pending «goal
  reached» suggestion shows on its goal's row (the durable «Ignora» is `ignoreSuggestion`, the same mutation the tile above the
  conversation uses — two surfaces of ONE suggestion); the item delete is `useArmedDelete` (two clicks, no timer).
  `AssistantMemoryPanel` lost its collapsible variant (only the sheet renders it).
- **The guide is `AssistantComeFunziona`**, a Collapsible below the grid with three tiles; the header has three icon actions and
  ONE primary; Conversazioni and Memoria wear their count as a dot AND the description says it in words (the dots were
  dropped once and asked back the same day). Playwright locates: the verdict by `region` «Verdetto sul
  contesto», the tiles by their eyebrow («Conversazione» with `exact: true` — «Conversazione con l'assistente» is the live
  region), the rows by `list` «Domande suggerite», the axis by `tablist` «Periodo di analisi», the disclosure by `button` «Come
  funziona».

### Periodic Emails (`lib/server/monthlyEmailService.ts`, `weeklyBudgetEmailService.ts`)
- **Four period types** with independent cron phases, so 31 Dec can send Q4 + H2 + yearly (intentional). Adding one is a
  wide fan-out: the union, `MonthlyEmailData`, the date and label helpers, `buildPeriodEmailData`, `buildAndSend*`, the
  cron phase, the send route and the settings 3-place + toggle + test-send button.
- **The weekly budget email is a SEPARATE module and nothing in it is weekly**: it is *sent* on Sunday, but its numbers
  are month-to-date and year-to-date. `buildCommentContext` (pure, exported, tested) states the day-of-month, tags the
  overall as a MENSILE ceiling with an A FINE MESE projection and forbids "fine anno"/"settimana" for monthly budgets.
  **When you add a figure here or to its prompt, name its window.**
- Over-budget rows carry `overspendExpenses` (actual overruns only) sourced from `getPeriodExpensesForItem` so they
  reconcile with the row's `spent`. Always run user notes through `escapeHtml`.
- **Comparison data is deterministic, AI only interprets**: **net worth = end-of-period snapshots (point-in-time);
  income/expenses/savings = flows over the window**, made explicit in the caption. The Hall of Fame mention is likewise
  deterministic, ranked with `lib/utils/hallOfFameRecords.ts` — the SAME definition as the in-app page.
- **The email AI comment is a DEDICATED Anthropic call**, not the assistant pipeline; AI and comparison failures are
  both non-blocking — and so is the context bundle, built inside the same `try`.
- **The prompt BODY is the assistant's own block**: `buildEmailAiPrompt` = `formatBundleForPrompt(bundle, label)` +
  the sections only the email has (market effect, comparisons, category deltas, Hall of Fame, budget alerts). Do not
  re-list what the bundle already carries — the largest single expenses are the standing example — and do not add a
  second cashflow computation: `resolveEmailPeriodRange` hands the email's own window to the range builder, whose
  baseline is by construction the same snapshot the email calls `previousNetWorth`.
- **The market effect is precomputed, never left to the model** (`Δ patrimonio − risparmio netto`, both from the
  bundle). It is a STRUCTURAL residual — it also absorbs untracked movements — and the block must keep saying so, or
  the comment presents it as pure market performance.
- **Every email cap is stated in the prompt**: `MAX_CATEGORY_DELTAS` (12) is named in the section header together with
  how many categories were left out. The selection is by SPEND, not by size of variation — describe it as it is.
- **`max_tokens` and the word ceiling scale together** per period (6000/8000/8000/10000 against 500/700/700/900 words):
  raise one and the other has to follow. Web search is offered only when `includeMacroContext` allows it, like the
  assistant's structured analyses.

### Panoramica and Dashboard Data Isolation
- Overview data flows through `GET /api/dashboard/overview` + `useDashboardOverview()` — no page-level fan-out queries and
  no full-history expense queries. `dashboardOverviewSummaries/{userId}` is server-owned: the client never reads it, and
  every overview-relevant mutation invalidates it explicitly. **Both endpoints are owner-scoped.**
- **`DASHBOARD_OVERVIEW_SOURCE_VERSION` invalidates hardcoded `sourceVersion: N` literals in test fixtures too** — grep
  for `sourceVersion:` in tests whenever it changes.
- **Do not import `goalService.ts` from a server-only file** — it top-level-imports the client Firebase SDK. The math
  a server needs lives in `lib/utils/goalMath.ts` and the Admin reads/writes in `lib/server/goalData.ts`.
- **Hero number overflow is a length-driven step-down**, not a container query: `heroValueClass` keys off the formatted
  string's length (>13 chars → `text-[32px] desktop:text-[40px]`). The tile's width does not vary; the string does.
- **Propagating the redesign to another page starts from `docs/redesign-prompts.md`** (one prompt per section, with
  the canvas-first method and the screenshot rule); the rules themselves live in DESIGN.md → §5 Page Verdict / Tile /
  Tile Grid. Patterns a redesigned page abandons are marked «superseded» in DESIGN.md, never deleted while another
  page still uses them.
- **The hero tile is ONE component for two pages**: `components/dashboard/overview/PatrimonioTile.tsx` renders the
  Panoramica's hero and, with `movers`/`countLine`, Patrimonio's — a second hero would drift (the pre-v3 twin did).
  `ComposizioneTile` likewise takes `eyebrow`/`footer`. `resolveHeroValueClass` is the one overflow step-down.
- Count-up lives in `OverviewAnimatedCurrency` leaf nodes, never in the page component.
- **The page is a verdict over a tile grid** (`components/dashboard/overview/*`): `Tile` (`components/ui/tile.tsx`,
  re-exported as `OverviewTile`; `NarrativeText` and `RankedRows` likewise live in `components/ui/`) is the ONE shell
  (eyebrow · aside · `reading` narrative · body), grid cells wrap it in `TILE_CELL_CLASS` (`flex min-w-0 [&>section]:flex-1`)
  so a tile stretches to its row and `mt-auto` footers align across tiles. Below `desktop:` the grid collapses to
  1-2 columns and the `order-*` classes put Cashflow before Sintesi; add a tile by giving it a desktop span AND an
  order, or it lands last on a phone. The page root is `max-w-[1920px]`, wider than `PageContainer`'s 1600: a
  bento uses width, and at 1600 a 27" monitor left a third of the main area empty. **No tile repeats another
  tile's rows** — the Cashflow tile lost its top-3 categories the moment "Spese per categoria" existed.
- **Every sentence on the page is generated by rules in `lib/utils/overviewNarrative.ts`**, never typed in a
  component: `buildOverviewVerdict` (headline + tone + sentence) and the `describe*` tile readings return a
  `Narrative` (segments with `mono`/`sign`) rendered by `NarrativeText`; the verdict itself by `PageVerdict`
  (`components/ui/page-verdict.tsx`, `ariaLabel` names what it judges). The one rule that must never be relaxed:
  **a falling month is blamed on the market only when `marketEffect < 0`** — when the market gained and the total
  still fell, the cause is the user's own flows and the headline says "nonostante il mercato". A missing input drops
  its clause (no prior snapshot → no monthly clause, no income → no savings clause), never a placeholder.
- **Testing Italian copy: `Intl('it-IT')` puts a no-break space before `€` and leaves four-digit amounts
  ungrouped** (`4120,18 €`, not `4.120,18 €`). `__tests__/overviewNarrative.test.ts` flattens the nbsp through a
  `plain()` helper and writes expectations the way the screen prints them — do not "fix" the formatter.
- **`topMovers` / `marketEffect` are MARKET return, never the user's flows.** `computeTopMovers` sums the per-asset
  price effect `q_prev × (u_curr − u_prev)` from `attributeSelectedChange` (the same split Storico uses) and
  returns `[]` when the previous snapshot has no `byAsset` — a class-value delta cannot tell a purchase from a
  price move, and a digest that calls a cash-for-crypto swap "Liquidità −14.110" is describing trades, not returns.
  `marketEffect` is `null` when not attributable, distinct from a measured `0`. Every class with an effect ≥ 1 € is
  listed, largest first (no top-N cut). **Pension funds are their own "Previdenza" line** (`PENSION_BAND_KEY`, like
  Storico's band — folded into Azioni/Obbligazioni through `composition` their return disappears) and measure
  **`Δvalue − contributions registered since the previous snapshot`** (attributed by `valueEffectMonth`, exported from `pensionReturn.ts` for exactly this), from
  `pensionReturnStartMonth` (or the first recorded contribution) onwards and 0 before — the service reads
  `pensionContributions` only for a holder of a fund, by literal collection name because
  `pensionContributionService` top-level-imports the client SDK. Known blind spots: a position opened this month
  contributes 0; cash and other price-1 assets never show a market effect. **Real estate is measured gross of debt** (`quantity × byAsset.price`, never the net `totalValue`) — on the net value a mortgage
  instalment read as "Immobili +1.036" on the real account with the house worth exactly the same.
- **An in-flow `<svg>` with `height: 100%` inside an auto-height flex box resolves its height from its own
  viewBox ratio** (width × H/W — hundreds of pixels), which is what made the hero sparkline explode the grid row.
  Stretch a `preserveAspectRatio="none"` chart by positioning the SVG `absolute inset-0` inside a `relative flex-1
  min-h-[…]` box, never with `h-full` alone. **`PeriodSelector` has no intrinsic width** (`flex-1` buttons): in a flex
  row give its wrapper an explicit width or the labels collapse into one word.
- **`PageHeader variant="compact"`** collapses the desktop header to one line (eyebrow · title · description) for
  pages whose real headline is in the content; the mobile sticky navbar is unchanged.
- **`SavingsRateBadge` is once per calendar month per account**, recorded in localStorage through
  `celebrationUtils` under `savings_rate_{ownerId}_{YYYY-MM}` — a sessionStorage flag dies with every new window and
  re-greets the user on every login. The decision is pure (`lib/utils/savingsRateBadge.ts`); the effect defers its
  `setVisible` with `setTimeout(…, 0)` (react-hooks/set-state-in-effect).

### Shared Constants and Fixed Hooks
- **Rule of Three**: a map used in 3+ files lives in `lib/constants/<domain>.ts`. The canonical symptom of a duplicated
  `Record<Type, string>` is one copy missing its `dark:` variants — illegible in dark mode with a clean `tsc`.
- **Declare N fixed hook instances with `enabled: false` for the inactive ones — never loop over hooks.**
- **Yahoo module asymmetry**: ETFs use `topHoldings` → `sectorWeightings` (snake_case keys matching `SECTOR_LABELS`),
  stocks use `assetProfile` → a title-case `sector` needing a translation map; the cache key must encode BOTH.

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
  (`useArmedDelete(ref, onDelete)`, `components/cashflow/budget/useArmedDelete.ts`).
- **`react-hooks/preserve-manual-memoization` ("Compilation Skipped")**: the compiler refuses to optimize the whole
  component when a dep array is *more specific* than what it infers — align the dep to the inferred value.
- **Loading skeleton over spinner** on any page investing in count-up and chart scheduling, with `PageContainer` imported
  inside it or wrapped at the call site. Verify it is wired up — `tsc` does not catch an unused component. Mobile CPU
  budget is ~3-5× tighter, so validate motion in a production build, not `next dev`.

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
  flag on failure and the next single click fires the destructive action.
- **Form error text needs the sign token too**: `text-red-500` fails AA in both modes on a dialog surface AND diverges
  from `--destructive` on the non-default themes.
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

---

## 6. Quick-Fix Reference

- **A domain rule copy-pasted into a 3rd file will diverge, and the divergent copy is the one users see**
  (`assetPricing.ts` is the worked example).

### Audit habits
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

Moved verbatim from CLAUDE.md's Known Issues each time that file reached its 40.000-character budget — three pages on 2026-08-28, three on 2026-08-29, the rest on 2026-08-30. CLAUDE.md now keeps only the cross-cutting entries and points here. These are behaviours that look like bugs and are not — read them before "fixing" one.

- **Accesso e Registrazione**: no Playwright spec (the session's throwaway ones were deleted); `ProtectedRoute` keeps its pre-redesign spinner, the last piece of old chrome on the sign-in path. The submit button stays ENABLED with the password rules unmet, as before the redesign — the refusal is the reading line, not a dead control. That reading lives in a **polite** `role="status"` even on failure: a node that switched to `role="alert"` would change identity in the accessibility tree and some screen readers announce nothing across the swap. On success the form stays frozen until the redirect (it used to re-enable). The outcome toasts are gone from both pages: the tile says the state. `describeAuthError` covers 14 codes and anything else takes the generic sentence, so a NEW Firebase cause is invisible until it is added. The whitelist stays a DEROGATION from `REGISTRATIONS_ENABLED=false` (SETUP.md → Step 5b depends on it): `resolveRegistrationAccess` mirrors that, it does not correct it.
- **Assistente**: no Playwright spec (the throwaway specs were deleted); the Cashflow tile is absent for a period without cashflow rows; the savings rate is `netCashFlow / (income + dividends)`; «Patrimonio oggi» prints the GROSS total (the verdict's figure), the old card printed the net; the Conversazione count includes the user's messages; starter rows prefill the composer, follow-up rows submit; the thread sheet keeps its 3 s auto-disarm delete (on request) while the memory rows use `useArmedDelete`; a companion taller than the viewport is reachable only at the end of the scroll (sticky, by design); the «goal reached» tile and the sheet's row are two surfaces of ONE suggestion.
- **FIRE › Calcolatore**: «FIRE nel {anno}» is the BASE scenario of a deterministic walk on the last full cashflow year (or the running year annualized, said in Base di calcolo) — changed expenses read stale until the year closes; a target reached «today» prints no passive-income clause; the Ventaglio runs only while open, its probability lives in the Traguardo footer; `getFIREData` still runs for runway and history but its `metrics` are ignored; the fan is unavailable without an allocation in the four MC classes; the pension-lock switch is optimistic (a failed save reverts with a toast), disabled in demo; Parametri reopens on every unsaved edit.
- **Impostazioni**: no Playwright spec (the throwaway ones were deleted); the dialogs keep their pre-redesign chrome; «Parametri del piano» and «Assistente» are READ-ONLY and list only the fields already saved — the assistant's mirror loses on read, so a never-synced preference makes the tile say where the truth lives instead of printing a default; the colour theme and the light/dark mode save themselves, outside the page's Salva; the header chip no longer says WHICH tab has unsaved changes (one sentence for the whole page); the Costi tile shows the rate and the checking subcategory only with the duty on; the category count ignores types outside the four listed (transfers); `settings/page.tsx` carries 7 pre-existing `react-hooks` errors and `AccountSharingSection` 1.
- **Allocazione**: no Playwright spec; Esposizione fetches `/api/portfolio/exposure` on mount (Yahoo on the first visit, then the 24 h cache) and truncates names at 128 px; a class held WITHOUT a target never enters `byAssetClass` (`compareAllocations` iterates the targets), so the score charges it as drift — the Bilanciamento reading names it, the verdict lists only targeted classes; a Ribilancia is «a saldo zero» only when the in-band classes carry no gap; «Modifica target» points to Impostazioni even with goal-derived targets; theoretical specific-asset targets are rows without a tick; `BandToggle` snaps 2 or 5 typed in the custom field back to the preset.
- **FIRE › Coast FIRE**: the verdict's two capital figures are net of the locked fund and only the lock sentence says so; the pension clause reads «la Pensione INPS» for labels starting with «Pension…», «la pensione di Giuseppe» otherwise (every pension listed, never counted); `coast.spec.ts` asserts structure and format only (the fixture fixes expenses, not the clock); the Ipotesi disclosure reopens on every unsaved edit or incomplete pension row, ONE save for four tiles; the «Impatto delle pensioni» table exists from 1440 only; `buildCoastInflowEvents` merges funds unlocking in the same year.
- **FIRE › Monte Carlo**: no Playwright spec; the paths are unseeded draws (two runs differ by tenths of a point) and the figures are the last run's until «Esegui» (an edited parameter only flags the Parametri footer); the plan is ephemeral, seeded once per mount; the withdrawal is always inflation-indexed; «fino a 81 anni» needs the Coast FIRE age; the histogram's last bin takes the tail past the 95th percentile (said in the footer); `results.medianFinalValue` has no surface.
- **FIRE › What If**: no Playwright spec; every event is a year-0 perturbation, nothing persisted; the Coast block reads the SAVED age and pensions (no age → no block); the job-loss picker seeds from `laborIncomeCategoryIds` once per mount; the «Prima e dopo» walk of today stops five years after its last scenario reaches FIRE (a gap after a big purchase, by design); with the bridge on the FIRE numbers are bridge numbers while the chart reads `baseNetWorth`; the Sensibilità reference expenses are session-only; `isPrimaryResidence` is informational.
- **Patrimonio**: Δ columns are empty for pension funds and cash accounts by design; the Rendimento tile ranks only within the overview's `topAssets` (15 largest); «Movimenti del mese» reads the whole ledger and filters in memory; the 2-click delete auto-disarms on a 3 s timer (kept on request); G/P against PMC compares a native-currency `averageCost` with the EUR value; `TaxCalculatorModal` simulates in the native price but labels €; `AssetDialog.tsx` carries 7 pre-existing `react-hooks` errors. **Two accepted side effects of the optional Sottocategoria** (2026-08-30; neither is new — without the asterisk they are only less signalled): a cash account without the «conti correnti» subcategory loses the 5.000 € stamp-duty threshold (`calculateStampDuty`, a rule Impostazioni already states), and changing Tipo or Classe does not clear `subCategory`, so an out-of-class value can survive invisibly — Radix shows the placeholder because the value is not among the items.
- **Tracciamento**: «Tabella» renders `ExpenseTable` unchanged inside Movimenti; the period slice uses `periodToRange` (browser local time) while the month buckets use the Italian calendar; the phone bar's controls are 36px; `TransactionFeed`/`CompactExpenseRow` carry two pre-existing `react-hooks` errors; a custom range has no previous period; the month-end projection exists only in the current month; `components/dashboard/overview/NarrativeText.tsx` is an unused re-export (knip).
- **Budget**: `BudgetItemDialog` stays for create/edit (no inline editing); **the ceiling history starts with the first cron run after the deploy** (earlier months read against today's ceiling, «prima quello attuale»), a month's record is its LAST captured configuration; the crossing day comes from the EXPENSE DATES (a backdated row moves it), an annual budget has no crossing sentence; a budget with every threshold off and already exceeded shows only in Per categoria; `app/dashboard/cashflow/page.tsx` carries two pre-existing `react-hooks` findings.
- **Centri di Costo**: no Playwright spec; `CostCenterDialog` keeps its pre-redesign chrome; an annual ceiling has no crossing day (`crossedOn` is monthly only); «Al mese» divides by the calendar months since the first expense (an idle project reads as a lower monthly cost, by design); «in totale» counts rows dated up to today (a future row is «in calendario»); the subcategory lens and the movements window (25 + «Mostra altre») are per-center, session-only state.
- **Divisione**: no Playwright spec, and **the feature has never been exercised end-to-end with the flag ON** (the 2026-08-31 collaudo stopped after phase A by the owner's decision) — the pure layer, the flag-off invariance and the build are proven, the writes of `personalMemberId` and the rendering are not; the shares follow the PERIOD's salaries, so a thirteenth month moves them and a month without one recorded has no shares at all (said by name); income attributed to a person outside `laborIncomeCategoryIds` is in neither the pool nor the residual; a running year's pool carries scheduled rows (declared, like Tracciamento); a member deleted after the fact leaves rows in «Senza intestatario»; there is no bulk attribution, so history stays «all in comune» until edited row by row; the per-person tile spans 6 columns at two people and 4 at three or more.
- **Analisi**: «Fuori scala» runs on ONE month only (25% / 50 € over a 6-month average, hardcoded); a month not started gets «non è ancora iniziato»; «Mostra tutte», the Confronto year and the Flusso toggles are session-only; the Scheda's transactions window is 25 + «Mostra altre»; `EntityDossier` stays Recharts; `SavingsRateTrendSection`/`AndamentoStoricoSection` compute in the component (untested); the Sankey drops small slices on phones; no spec covers «Anno» with a month.
- **Dividendi**: the payments table dropped *Tax/Netto/Costo per azione*; the calendar day opens the day dialog instead of filtering; under «Mese» no month arrows, under «Anno» they stop at January/December; the 2-click delete keeps its 3 s auto-disarm; the list toolbar is rendered twice. The yield never follows the period (TTM on the current holding); the DPS running-year column is a partial sum; no `averageCost` → the tile becomes an explanation.
- **Rendimenti**: no Playwright spec; the six benchmark series + FX load on every visit (6h `staleTime`), only a FAILED FX route falls back to USD (the aside says so); Sharpe/Sortino use the settings' risk-free rate; the payload's `drawdownDuration`/`recoveryTime` are no longer displayed (the tiles read `resolveDrawdownStory`); a 1-anno window without the current month's snapshot measures 11 months and says so; the rolling readings live in `PerformanceDettaglio` (untested); `AIAnalysisDialog`/`CustomDateRangeDialog` keep their old chrome.
- **Storico**: no Playwright spec; the pace and the next-doubling projection need the snapshot of EXACTLY twelve months earlier and the pace verdict 24 months of history; the projection is linear, dropped beyond fifty years; the Driver shows only years from `cashflowHistoryStartYear` (untracked income lands in «mercato») and its bars the last twelve CALENDAR months; the Lavoro net can be negative on a positive gross (taxes on ALL latent gains); the Evoluzione Y axis prints full amounts under 10.000 € of span; the confetti keeps literal hexes; the two dialogs keep their old chrome.
- **Previdenza**: a contribution the fund credits late reads as a temporary market loss in the month it is recorded (the window's total heals once credited and the value updated — by design, → *Fondo Pensione*); the sparkline starts where the snapshots carry `byAsset`; the month chip needs the previous month's snapshot; two contributors stack one block per person; the IRPEF saving uses the default brackets; the dialog keeps its old chrome.
- **Hall of Fame**: no Playwright spec; the two savings rankings and `stats` do not exist in documents written before 2026-08-25 — until a recalculation the Risparmio tile explains instead of ranking; the nightly cron recalculates only AFTER a successful snapshot (an account without assets has only «Aggiorna i record», disabled in demo). A month with income and ZERO expenses reads 100% savings; Note sorts by annotated PERIOD; the 12-record chart drops the SMALLEST records past the twelfth; a note survives its period leaving the top twenty; `HallOfFameNoteDialog` keeps its old chrome and two pre-existing `react-hooks` errors.
- **FIRE › Obiettivi**: no Playwright spec; ONE `now` per mount; with three goals the Obiettivi tile leaves air under the rows; a goal past its deadline gets no pace; free shares under 0,5% / 0,50 € are not listed; the selection is session-only; the «assigned» bar counts the reached goals, the derived target does not; the two dialogs keep their old chrome and two pre-existing `react-hooks` errors.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
