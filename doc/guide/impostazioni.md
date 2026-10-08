# Impostazioni

> **Quando aprire questa guida** — chi tocca `app/dashboard/settings/page.tsx`, `components/settings/*`, `lib/utils/settingsNarrative.ts`. Il fan-out di scrittura di un setting (le CINQUE/SEI/SETTE sedi) vive QUI, in § Settings — the FIVE places. In `AGENTS.md` resta lo stub con l'essenziale; qui c'è la regola completa. File: § *Files*, sotto.

## Files

Moved here from `CLAUDE.md` → *Key Files* on 2026-09-19.

- **Impostazioni**: `app/dashboard/settings/page.tsx` (the orchestrator, under 500 lines since 2026-10-08: the draft's `useReducer`, the observed read, the one «Salva», the bar, the tab), the six views `components/settings/tabs/{Generale,Allocazione,Spese,Dividendi,Condivisione,Aspetto}Tab.tsx` (+ `shared.tsx`: `SettingsTabPanel`, `DeclarationRow`, `runGuarded`, `INTERACTIVE_CONTROL_CLASS`; `CategoryRow` lives in `SpeseTab`, `SyncDividendsButton` in `DividendiTab`, the theme swatches in `AspettoTab`), `components/settings/allocation/{AllocationClassEditor,SubTargetEditor}.tsx`, `components/settings/{ExpenseImportSection,AccountSharingSection}.tsx`, pure `lib/utils/settingsDraft.ts` (the reducer, `sliceSettings`, `composeSettingsDocument`, `isSliceDirty`, `revealTargetProblem`, `targetFieldId`, `SETTINGS_CLASS_ORDER`) and `lib/utils/{settingsNarrative,spendingRoles,equityBondsAutoTargets,allocationTargetValidation}.ts`, `lib/services/assetAllocationService.ts` (`getSettings`/`setSettings`, the FIVE places); browser `e2e/settings{,.mobile,.roles,.draft}.spec.ts`
- **Suites to run after a change here — Impostazioni** (moved from `AGENTS.md` § Commands on 2026-09-30): **Bozza** `settingsDraft` (the identity `compose ∘ slice`, on the fixtures of `__tests__/fixtures/storedSettings.ts`) · **Letture** `settingsNarrative` · **Round-trip** `settingsRoundTrip` · **Formula** `equityBondsAutoTargets` · **Sblocco** `pensionUnlock` · and the compiler map `reactCompilerCoverage`

## Impostazioni — tessere senza verdetto (`app/dashboard/settings/page.tsx`, `lib/utils/settingsNarrative.ts`)

- **The page has NO verdict and must not grow one.** A configuration page measures nothing, so there is no question for
  a sentence to answer; what it keeps is the CADENCE — compact header + `PageTabBar`, then a 12-column grid where every
  group of settings is a `Tile`: eyebrow = the group, ONE reading line stating the current state in words, controls
  below. `settingsNarrative.ts` therefore exports 23 `describe*` functions (counted 2026-09-27, `describeSpendingRolesSetting` the newest) and NO `build*Verdict`.
- **A reading declares the effect DOWNSTREAM, not the control under it.** «Base gestita: fondi pensione e asset esclusi
  restano fuori» beats «due interruttori»: the reader is deciding, and a setting they cannot place is one they will not
  trust. The Narrative Honesty Rule holds — a missing input drops its clause and says what stalls without it («senza il
  risk-free rate l'auto-calcolo dei target non parte»), never a placeholder.
- **A field another page OWNS is DECLARED, never edited here** (The Declaration-Tile Rule, DESIGN.md). «Parametri del
  piano» and «Assistente» are read-only tiles: label · mono value rows (`DeclarationRow`) and a footer that LINKS the
  write surface. Two reasons, both structural: the FIRE parameters save from FIRE › Calcolatore/Coast FIRE, and a
  second surface would be a second write path (see the Dividendi Save in § Settings — the FIVE places); the assistant's preferences live in its
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
- **ONE draft, six views** (2026-10-08). The page holds every field «Salva» writes in a single
  `useReducer(settingsDraftReducer)` (`lib/utils/settingsDraft.ts`) and each tab is a module-level CONTROLLED view of
  its slice (`components/settings/tabs/*Tab.tsx`): `slice` in, `onChange(patch)` out, NO form state of its own — Radix
  unmounts the content of an inactive panel, so a view holding its fields would lose them at the first tab change and
  a «Salva» from another tab would never see them (`e2e/settings.draft.spec.ts`, seen red with a `useState` planted
  inside the panel). What may stay local is ephemeral UI: a recipient being typed, a send or a sync in flight, the
  category dialogs (they live with the list, in `SpeseTab`). A slice holds the fields of the TAB THAT EDITS THEM;
  Condivisione and Aspetto have none (they write where they act). `sliceSettings(document, fallbackTargets)` seeds
  the slices (the old `loadTargets`, defaults included), `composeSettingsDocument(slices, current)` rebuilds the
  document or names the first broken target rule WITH its place, `isSliceDirty(tab, draft, saved)` is the dot:
  `__tests__/settingsDraft.test.ts` pins `compose ∘ slice ≡ document` on a fixture carrying EVERY written field
  (`FULL_PAGE_SETTINGS`) and on the round-trip fixture — a field one view forgets is a default with a green toast, the
  bug of 2026-09-25, and the identity is where it shows. The reducer settles the auto-calculated Azioni/Obbligazioni
  pair on every allocation action AND on reset (the formula, `calculateFormulaEquityPercentage`, is pure in
  `equityBondsAutoTargets.ts`); a class's rows are patched BY COPY — after a read `saved === slices`, and a row mutated
  in place would move the baseline with it.
- **The page's read is OBSERVED, not fetched** (2026-10-08, the owner's decision of 2026-09-29): `useSettings(ownerId)`
  seeds the draft DURING render on the `(ownerId, dataUpdatedAt)` subject — on a warm visit the persisted cache hands
  the document at once and there is no skeleton; the fresh read lands behind, «Aggiornato alle…» in the header
  meanwhile (`useFreshness` over the settings, categories and accounts queries), and RE-SEEDS the draft only while no
  tab is dirty: a co-owner's save never overwrites what the reader is typing (it lands at the next «Salva» or
  «Annulla», which re-read anyway). The skeleton is the first visit of an account (`data === undefined`, not failed);
  a failed FIRST read is the `ErrorNotice` with «Riprova» (`refetch`), never a form of defaults.
- **One «Salva», so the SAVE STATE is per tab** (critique of 2026-09-22). A tab holding edits carries a dot
  (`TabDef.unsaved` in `PageTabBar`, also in its accessible name) and a bar sticky to the bottom of `<main>` names
  them (`describeUnsavedChanges`) with «Annulla modifiche» beside «Salva». «Annulla» RE-READS the saved document
  (`fetchQuery(settingsQueryOptions)` with `staleTime: 0`, then `reset`) instead of keeping a second copy, so a
  co-owner's save comes back too; a failed re-read keeps the draft and says so in a toast. A reload or a closed tab
  asks first (`beforeunload`); an in-app link does not — the App Router has no guard, the bar is the reminder.
  «Ripristina default» is the FACTORY targets (`allocazione/replaceTargets`), a different act; the header chip
  «Anteprima attiva» is gone. The `?tab=` is canonicalised on mount ONLY when absent or invalid (as Cashflow does):
  an unconditional `router.replace` re-rendered every `useSearchParams` consumer of the shell.
- **The target rules live in `lib/utils/allocationTargetValidation.ts`, and they say WHERE they failed.**
  `findTargetProblem` returns the first broken rule (total, then each class top to bottom, subcategories before
  their assets) with its class/row indices; `describeTargetProblem` is its sentence, in the Target per classe
  reading live and in the toast «Salva» raises. **The focus crosses the tabs THROUGH THE DRAFT** (2026-10-08):
  `revealTargetProblem` (pure, `settingsDraft.ts`) returns the slice with the class's group opened (and the
  subcategory's asset list, for an asset rule — `expanded` flags on the rows, stripped from the dirty check and the
  document) and the id of the field (`targetFieldId`); the page dispatches it, sets `pendingFocus` and activates
  Allocazione; the view focuses the field an animation frame after the commit that mounted it and dispatches
  `focusConsumed`. No `useImperativeHandle` across an unmounted panel; seen red with the group left closed
  (`settings.spec.ts` › «porta il fuoco sul campo»). A collapsed group or asset list is NOT in the DOM
  (`CollapsibleContent` without `forceMount`, `AllocationClassEditor`/`SubTargetEditor`): a keystroke elsewhere renders
  no hidden editor. A group that does not add up prints its sum ON THE CLASS ROW, closed or open. Unnamed
  subcategory rows are dropped before validating (`cleanAllocazioneSlice` → `dropUnnamedSubTargets`) — the tree
  validated is the tree written. `validateSpecificAssets` (English messages, straight into a toast) was deleted from
  the service.
- **Età and risk-free rate live in the Auto-calcolo tile** (Allocazione, since 2026-09-22), beside the switch they
  unlock; the risk-free rate also feeds Sharpe/Sortino and the tile says so, and Calcolo dei rendimenti points back
  to it. Their dirty snapshot is therefore the allocation one.
- **A failed read on this page is never an empty list.** The members (`AccountSharingSection`), the categories and
  the cash accounts each keep `loading`/`failed` and branch through `resolveSurfaceState`: Condivisione, Categorie,
  Conti di default and Entrate da dividendi give way to an `ErrorNotice` with «Riprova», and the Cashflow reading
  takes `categoriesUnread`. «Nessun accesso condiviso» about a list nobody read was the worst of them.
- **Every two-press confirm is `useArmedDelete`** — category delete (`CategoryRow`: with movements the reassignment
  dialog IS the confirmation, without them the row arms), dividend sync (`SyncDividendsButton`, armed in the primary
  tint: it writes, it does not destroy) and the revoke of an access (`MemberRow`, the row says what is taken away).
  One live region per list.
- **«Ruoli 50/30/20» is its own tile in Spese**, under the two the expense form reads — not a row of Categorie,
  because that tile gives way to an `ErrorNotice` when the categories fail, and the switch and its reading must not.
  The reading (`describeSpendingRolesSetting`) counts the classified spending categories
  (`summarizeCategoryClassification`) and says «non letti» on a failed read, never «0 classificate». Its spec builds
  the expected sentence from the counts it reads off the emulator at the assertion: the base account is shared, and
  other specs plant spending categories of their own. With the switch
  on, each `CategoryRow` badge wears its role's colour (`categoryRoleColor`: income `--positive`, a transfer its saved
  hue), and the category dialog shows the role picker. The flag's dirty snapshot is Spese's.
- **A category write invalidates what Analisi reads, where the write happens** (2026-09-27): the page used to keep
  its own category list (`loadExpenseCategories`, a private read until 2026-09-29 — now the page reads
  `useExpenseCategories` like Analisi and `loadExpenseCategories` IS the invalidation of that key), while Analisi
  reads `queryKeys.expenses.categories` under the global 5-minute staleTime, so a role set here reached its Flusso
  minutes later. `invalidateCategoryCaches`
  (`components/expenses/CategoryManagementDialog.tsx`) invalidates `expenses.categories` after the dialog's create or
  update — the dialog is also what `ExpenseDialog`, `CategoryMoveDialog` and `CategoryDeleteConfirmDialog` mount — and
  `expenses.all` too when the rows were rewritten: a rename or a type change (the cascades inside `updateCategory`), a
  subcategory's move or reassignment. The page's own move and delete handlers call it with the rows rewritten (the
  armed zero-row delete without). Pinned in the browser by `e2e/settings.roles.spec.ts` (Analisi reached client-side,
  back, the role saved, forward: the node is there).
- **`ExpenseImportSection` and `AccountSharingSection` render their own `Tile`** — the page places them in a grid cell
  and passes nothing but their props. Their reading lines come from the same pure module, so the wizard's phase
  («142 voci da importare, 6 righe scartate, 3 categorie da creare») and the grant list are stated in words before the
  controls, like every other tile.

## Settings — the FIVE places
- A new setting must be added to all five or it silently disappears: the type (`types/assets.ts`), the read mapping in
  `assetAllocationService.getSettings`, **BOTH** write chains in `setSettings` (the `targets` branch uses `setDoc` with
  no merge), and the draft wiring — since 2026-10-08 the slice of the tab that edits it in `lib/utils/settingsDraft.ts`
  (the field in the slice type, in `sliceSettings`, in `composeSettingsDocument` and, through the slice, in
  `isSliceDirty`) plus the control in that tab's view (`components/settings/tabs/<Tab>.tsx`, `onChange({ field })`) —
  but a FIRE-only toggle wires from `FireCalculatorTab.tsx` instead: the 5th place is "wherever the field's own save
  button lives". Guarded by `settingsRoundTrip`, whose `STORED_SETTINGS` fixture must carry the new field, or the
  round-trip stays green while the read mapping is still broken, AND by `settingsDraft` (`compose ∘ slice ≡ document`
  on `FULL_PAGE_SETTINGS`, `__tests__/fixtures/storedSettings.ts`, which must carry it at a non-default value — and the
  `WRITTEN_KEYS` checklist of that test names it). Worked example (2026-09-07): `performanceExcludesCash` («Liquidità
  fuori dalla base») — type, `getSettings`, both `setSettings` branches, the generale slice (`sliceSettings` default
  `?? false`, `composeSettingsDocument`), the Switch in `GeneraleTab`, the reading's `excludesCash` clause in
  `describePerformanceBase`, the two fixtures; its consumer is `resolvePerformanceBaseOptions` (Rendimenti + PDF), which
  reads it with the same `?? false` default as the two toggles beside it.
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
- **One Save button validates the whole page** — `handleSave` returns early when `composeSettingsDocument` names a broken
  target rule (before any read: a refused save costs no round trip), and must `invalidateQueries(queryKeys.settings.all(ownerId))`,
  the ONE settings key every reader shares (2026-09-29). The page's own reads go through the keys too: the form is seeded
  from `useSettings` (observed, 2026-10-08), «Annulla» re-reads with `queryClient.fetchQuery(settingsQueryOptions)` at
  `staleTime: 0` and so does the pre-read of «Salva» (the CURRENT document, for the two FIRE fields the write carries
  through), the cash accounts come from `useAssets` and the categories from `useExpenseCategories`. **A tab must not grow a second Save**: the
  Dividendi one was deleted on 2026-08-29 because `handleSave` already persisted its two fields, so the tab's own button
  was a second write path for the same data (it also re-read the doc first, and could therefore clobber a concurrent edit).
- **A field's slice must follow the TAB THAT EDITS IT, not the tab that consumes it**: `userAge`/`riskFreeRate`
  moved to the generale snapshot when the Profilo tile moved to Preferenze, and BACK to the allocation one on
  2026-09-22 when they moved into the Auto-calcolo tile (today `AllocazioneSlice`); the default debit/credit accounts sit
  in `SpeseSlice` because Spese edits them. Get this wrong and the dot lands on the wrong tab, or on none, over an
  edited field.
- `cashflowHistoryStartYear` is shared (Cashflow / Storico / Assistant / overview) — never rename it page-specifically.
- **«Commissioni sui trasferimenti»** (Spese, 2026-09-25): `transferFeeCategoryId` / `transferFeeSubCategoryId`, both
  user-clearable (`'x' in settings` in both `setSettings` branches), in the `spese` snapshot, read ONLY by the expense
  form (no server mapper). The Select lists the spending categories grouped by type — the fee row takes the category's
  type. `e2e/cashflow.transfer-fee.spec.ts` is the one spec that WRITES this page's settings: it picks the category,
  presses «Salva», reloads, and restores the WHOLE settings document in `afterAll`: «Salva» rewrites every field the page
  holds, and on the base seed it drops the allocation sub-targets (the seed's shape is not the page's), so restoring the
  two fee fields alone left `e2e/allocation.spec.ts` with no class row to open (seen red in the full run, 2026-09-25).

## Per-page blind spots

- **Impostazioni**: `e2e/settings{,.mobile}.spec.ts` since 2026-09-22 — none of their tests WRITES (they edit and «Annulla», or press «Salva» on a tree the validation refuses, and compare the settings document's `updateTime`); `settings.roles.spec.ts` and `settings.draft.spec.ts` (2026-10-08) DO write, and restore the whole document in `afterAll`; the dialogs opened from here take the 2026-08-31 modal vocabulary; «Parametri del piano» and «Assistente» are READ-ONLY and list only the fields already saved — the assistant's mirror loses on read, so a never-synced preference makes the tile say where the truth lives instead of printing a default; the colour theme and the light/dark mode save themselves, outside the page's Salva, and mark no tab; the Costi tile shows the rate and the checking subcategory only with the duty on; the category count ignores types outside the four listed (transfers); the Allocazione panel's CONTENT unmounts on another tab (Radix keeps only the panel `div`), which is why an Auto-calcolo field is not in the DOM while Preferenze is open; the page never says WHOSE settings «Salva» writes when a co-owner is viewing another account (the readings no longer say «Hai …», but the header does not name the account); the tab pill (38×32) stays below 44px on touch — a shared primitive (CLAUDE.md → Known Issues; the switches got their 44×44 target on 2026-10-08). **Since 2026-10-08 a reload paints the form from the persisted document at once** (the skeleton was the page's until then, ~244 ms on the mirror, and its cells `[5], [7], [12×8]` did not match the tab's tiles): the header's line dates the settings document too while the fresh read is in flight, and that read RE-SEEDS the draft only while no tab is dirty — so an edit typed before the fresh document lands is kept, and a co-owner's change made meanwhile shows at the next «Salva» or «Annulla», not before. The skeleton remains for an account never read on this device. A view's own component stays mounted while its tab is inactive (only the panel's children unmount), so a `useState` at a view's ROOT would survive a tab change — which is why the rule says a view holds no FORM state at all, not «no state that would be lost»: `e2e/settings.draft.spec.ts` plants its falsification inside the panel. The dev-only snapshot tools (`NEXT_PUBLIC_ENABLE_TEST_SNAPSHOTS`) sit at the end of Preferenze as a full-width grid cell, inside the tab's panel.
