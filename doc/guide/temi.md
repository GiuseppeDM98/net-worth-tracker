# Temi colore (Color Theme System)

> **When to open this guide** — whoever touches `app/globals.css` (the twelve theme blocks: `:root` + `.dark` and the five named themes, each as `[data-theme="name"]` + `.dark[data-theme="name"]`), `contexts/ColorThemeContext.tsx`, `lib/hooks/useChartColors.ts`, `lib/hooks/useActionColors.ts`, `lib/utils/costCenterColors.ts`, `lib/constants/colors.ts`, `components/layout/ThemePicker.tsx` or the `COLOR_THEME_SWATCHES` in `app/dashboard/settings/page.tsx`. The palette itself is in `DESIGN.md` → §2 (Colors: The Zero-Chroma Foundation). `AGENTS.md` keeps the stub with the essentials plus the repo-wide token rules (`AGENTS.md § Layout and Color Tokens`, `AGENTS.md § Recharts`); here is the full rule.

## Files

Moved here from `CLAUDE.md` → *Key Files* on 2026-09-19.

- **Temi**: `app/globals.css` (twelve theme blocks), `contexts/ColorThemeContext.tsx`, `lib/hooks/{useChartColors,useActionColors}.ts`, `lib/utils/costCenterColors.ts` — doc/guide/temi.md

## Color Theme System
- **Parallel theming**: next-themes owns `.dark`, the custom system owns `data-theme` — fully independent. CSS:
  `[data-theme="name"]` for light, `.dark[data-theme="name"]` for dark; `ColorThemeContext` lives inside `AuthProvider`.
  **The theme is an external store** (2026-09-06): `useSyncExternalStore` over localStorage with `'default'` as the
  server snapshot; the `data-theme` attribute is a pure effect on the value, `writeStoredTheme` applies it before the
  re-render, and the Firestore sync depends on `uid` alone (rewriting an equal value is a no-op in every sink).
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
  list on every period switch; **indices 0-7 are theme-aware** since 2026-08-30 (`--chart-1..8` in all twelve blocks),
  index 8 (`--chart-9`) since 2026-09-20, only 9 pads from the static `CHART_COLORS`.
- **The default theme's light slots hold the dark hue bands** (2026-09-13): `:root --chart-1..5` were re-pitched from
  the shadcn preset (three oranges and two teals — Liquidità measured ΔE00 10.1 from Immobili on the real account's
  Composizione bar, and the hero's rising curve wore the hue of `--destructive`) onto blue · green · amber · violet ·
  coral with L and C set for white. **The floor is a test**, `__tests__/chartPaletteDistinctness.test.ts`: it reads
  `globals.css` itself, ΔE00 ≥ 14 between any two slots of a mode, every slot inside the `useChartColors` luminance
  guard, each slot ≤ 30° of hue from its twin in the other mode. **All twelve blocks since 2026-09-20** (below). A slot
  change re-derives `PRINT_CHART_HEX` (`__tests__/printTokens.test.ts` says the new hex); `PRINT_RANK_HEX` moved to
  slot 7 the same day because slot 3 became crypto's amber.
- **The named themes are held to the same floor** (2026-09-20, from the owner's tour of Storico on solar-dusk).
  Measured that day, by reading `globals.css`: solar-dusk light had Obbligazioni and Immobili as the SAME grey (ΔE00
  0.0) and Azioni ~ Criptovalute at 9.5; elegant-luxury six pairs under 14 in light and three in dark (three reds, two
  golds); retro-arcade and midnight-bloom Immobili ~ Liquidità at 10 in both modes; cyberpunk passed on distance but
  its light slots 3-5 sat at L 0.84–0.92, above the luminance guard. Slots 2-8 of those blocks were re-pitched — slot 1
  stays the theme's primary (the hero curve wears it), 6/7/8 keep their hue, and every slot is ΔE00 ≥ 17 from the
  others, inside the sRGB gamut and ≥ 3:1 against the theme's own card. The hues per theme: solar-dusk orange · dusk
  blue · sun yellow · a warm NEUTRAL grey for Immobili (chroma 0.012 — a neutral has no hue to hold across the modes,
  and the test exempts it) · sage green; elegant-luxury burgundy · navy · plum · gold · deep green; retro-arcade blue ·
  teal · magenta · orange · violet; midnight-bloom violet · orchid · coral · blue · mint. **The values came from a
  search, not from taste** (a throwaway annealing over L, C and a few degrees of hue, maximising the closest pair under
  those constraints): re-run the idea, not the numbers, when a theme is added.
- **`--chart-9` is Storico's «Previdenza» band, in all twelve blocks** (2026-09-20). It was the static indigo
  `#6366F1` from `CHART_COLORS[8]`, a ninth colour no theme had been measured against: ΔE00 3.8 from midnight-bloom's
  Azioni, 8.4 from retro-arcade dark's Liquidità, 10.3 from the DEFAULT theme's Azioni. `useChartColors` now resolves
  indices 0-8 from the theme (only 9 pads from the static palette) and the test measures nine slots. Its hue is one per
  theme, kept ≥ 24° from every other chromatic slot: a lighter tint of a class's own hue passes ΔE00 and still reads as
  that class. A user-chosen identity colour still ranges over `chart-1..8` — slot 9 is not offered to cost centers.
- **A brand-new custom property reads `''` on a running dev server** (seen again 2026-09-20 with `--chart-9`): the
  hook fell back to the static colour and the fix looked like it had done nothing. Stop the server, delete `.next/dev`
  (`.next-e2e` for the suite) and restart before doubting the stylesheet (doc/guide/e2e-emulatori.md § Emulator Exercise Scripts).
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
  **A new theme or a moved slot runs `__tests__/chartPaletteDistinctness.test.ts` first** — solar-dusk shipped two
  classes as the same grey for months.

## Per-page blind spots

- **The chart slots are measured for DISTANCE, not for every surface they land on** (2026-09-20): ΔE00 ≥ 14 and the luminance guard hold on all twelve blocks, and the re-pitched slots were searched at ≥ 3:1 against their card — but that contrast is NOT asserted by the suite, the default theme's two slots under 3:1 (next entry) are untouched, and a colour-blind reader is not modelled: a composition is never readable by colour alone, which is why every band is also a named row.
- **Two DEFAULT-theme chart slots and the row focus ring sit under 3:1 as non-text signals** (measured 2026-09-18 on a
  card, re-derived by hand): `--chart-3` light `#da8b00` on white 2,74:1, `--chart-1` dark `#1447e6` on `#171717` 2,62:1,
  `ring-ring` `#a1a1a1` on white 2,58:1 — against AGENTS.md's «worst case 3.38:1». Theme tokens: a `doc/guide/temi.md` session. (moved from `CLAUDE.md` → Known Issues on 2026-09-19)
  **Where a slot is printed as TEXT the floor is 4,5:1 and it is now enforced**: `useActionColors` clamps
  COMPRA/VENDI/OK into a measured lightness band before they reach a chip label, a plan amount or a gap column
  (`lib/utils/actionColor.ts`, all twelve blocks held by `__tests__/actionColorContrast.test.ts`, 2026-09-21). The
  entry above is about a slot used as a NON-text signal, which is a different floor and is still open.
- **Index 9 of `useChartColors()` is still the static lime** (`CHART_COLORS[9]`): no surface uses it. Indices 0-7 are theme-aware since 2026-08-30, index 8 (`--chart-9`, Previdenza) since 2026-09-20.
- **Sign-colour CHIPS sit below AA, structurally** (`bg-positive/10 text-positive` washes the background with the text's hue: 15 of 24 combinations at 3.34–4.40:1; deliberately not fixed). `MonthlyReturnsHeatmap` fills its cells with the sign tokens at 30/55/85% (the figure is never printed in the cell, so the AA text floor does not apply). (moved from `CLAUDE.md` → Known Issues on 2026-09-19)
- **Due tinte del chrome violano la Zero-Chroma Rule** (`switch.tsx` ON blu in dark, `ProtectedRoute` spinner; la mask-icon smeraldo è stata rimossa il 2026-09-13; il `text-emerald-*` di `ExpenseTable` è passato a `text-positive` il 2026-09-14); gli altri ~100 hex DOM-side sono eccezioni dichiarate in DESIGN.md → The DOM-side hex inventory. (moved from `CLAUDE.md` → Known Issues on 2026-09-19)
