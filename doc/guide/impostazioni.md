# Impostazioni

> **Quando aprire questa guida** — chi tocca `app/dashboard/settings/page.tsx`, `components/settings/*`, `lib/utils/settingsNarrative.ts`. Il fan-out di scrittura di un setting (le CINQUE/SEI/SETTE sedi) è in `AGENTS.md § Settings — the FIVE places`. In `AGENTS.md` resta lo stub con l'essenziale; qui c'è la regola completa. File: `CLAUDE.md` → *Key Files* → *Impostazioni / layout*.

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

## Per-page blind spots

- **Impostazioni**: no Playwright spec (the throwaway ones were deleted); the dialogs opened from here take the 2026-08-31 modal vocabulary; «Parametri del piano» and «Assistente» are READ-ONLY and list only the fields already saved — the assistant's mirror loses on read, so a never-synced preference makes the tile say where the truth lives instead of printing a default; the colour theme and the light/dark mode save themselves, outside the page's Salva; the header chip no longer says WHICH tab has unsaved changes (one sentence for the whole page); the Costi tile shows the rate and the checking subcategory only with the duty on; the category count ignores types outside the four listed (transfers); `settings/page.tsx` carries 7 pre-existing `react-hooks` errors and `AccountSharingSection` 1.
