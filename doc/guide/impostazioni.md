# Impostazioni

> **Quando aprire questa guida** — chi tocca `app/dashboard/settings/page.tsx`, `components/settings/*`, `lib/utils/settingsNarrative.ts`. Il fan-out di scrittura di un setting (le CINQUE/SEI/SETTE sedi) vive QUI, in § Settings — the FIVE places. In `AGENTS.md` resta lo stub con l'essenziale; qui c'è la regola completa. File: `CLAUDE.md` → *Key Files* → *Impostazioni / layout*.

## Impostazioni — tessere senza verdetto (`app/dashboard/settings/page.tsx`, `lib/utils/settingsNarrative.ts`)

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
- **`ExpenseImportSection` and `AccountSharingSection` render their own `Tile`** — the page places them in a grid cell
  and passes nothing but their props. Their reading lines come from the same pure module, so the wizard's phase
  («142 voci da importare, 6 righe scartate, 3 categorie da creare») and the grant list are stated in words before the
  controls, like every other tile.

## Settings — the FIVE places
- A new setting must be added to all five or it silently disappears: the type (`types/assets.ts`), the read mapping in
  `assetAllocationService.getSettings`, **BOTH** write chains in `setSettings` (the `targets` branch uses `setDoc` with
  no merge), and the state/load/save/dirty-snapshot wiring — usually `settings/page.tsx`, but a FIRE-only toggle wires
  from `FireCalculatorTab.tsx` instead: the 5th place is "wherever the field's own save button lives". Guarded by
  `settingsRoundTrip`, whose `STORED_SETTINGS` fixture must carry the new field, or the round-trip stays green while the
  read mapping is still broken. Worked example (2026-09-07): `performanceExcludesCash` («Liquidità fuori dalla base») —
  type, `getSettings`, both `setSettings` branches, the page's state/load/two snapshots/save/Switch, the reading's
  `excludesCash` clause in `describePerformanceBase`, the fixture; its consumer is `resolvePerformanceBaseOptions`
  (Rendimenti + PDF), which reads it with the same `?? false` default as the two toggles beside it.
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

## Per-page blind spots

- **Impostazioni**: no Playwright spec (the throwaway ones were deleted); the dialogs opened from here take the 2026-08-31 modal vocabulary; «Parametri del piano» and «Assistente» are READ-ONLY and list only the fields already saved — the assistant's mirror loses on read, so a never-synced preference makes the tile say where the truth lives instead of printing a default; the colour theme and the light/dark mode save themselves, outside the page's Salva; the header chip no longer says WHICH tab has unsaved changes (one sentence for the whole page); the Costi tile shows the rate and the checking subcategory only with the duty on; the category count ignores types outside the four listed (transfers); `settings/page.tsx` carries 7 pre-existing `react-hooks` errors and `AccountSharingSection` 1.
