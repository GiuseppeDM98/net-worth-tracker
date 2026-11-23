# Temi colore (Color Theme System)

> **When to open this guide** — whoever touches `app/globals.css` (the sixteen theme blocks: `:root` + `.dark`, the five palette themes, Egeo and Orbita, each as `[data-theme="name"]` + `.dark[data-theme="name"]`), `contexts/ColorThemeContext.tsx`, `lib/hooks/useChartColors.ts`, `lib/hooks/useActionColors.ts`, `lib/hooks/useCssColorTokens.ts` (with `lib/utils/cssColorToHex.ts`), `contexts/ChartColorsContext.tsx`, `lib/hooks/useThemePaletteReader.ts`, `lib/utils/{themePalette,colorParse}.ts`, `lib/utils/costCenterColors.ts`, `lib/constants/colors.ts`, `components/layout/ThemePicker.tsx`, the registry `COLOR_THEME_META` in `lib/constants/colorTheme.ts`, the swatches in `components/settings/tabs/AspettoTab.tsx`, or the costume contract (§ Il costume: `lib/constants/themeCostume.ts`, `contexts/CostumeScopeContext.tsx`, `components/ui/{theme-costume,heading-text}.tsx`, the «Theme costume» section of `app/globals.css`). The palette itself is in `DESIGN.md` → §2 (Colors: The Zero-Chroma Foundation). `AGENTS.md` keeps the stub with the essentials plus the repo-wide token rules (`AGENTS.md § Layout and Color Tokens`, `doc/guide/grafici.md § Recharts`); here is the full rule.

## Files

Moved here from `CLAUDE.md` → *Key Files* on 2026-09-19.

- **Temi**: `app/globals.css` (sixteen theme blocks — eight themes; Egeo and Orbita also with two scope blocks each —, plus the five `--role-*` aliases in `:root`), `contexts/ColorThemeContext.tsx`, `contexts/ChartColorsContext.tsx` (`ChartColorsProvider`, mounted by `app/dashboard/layout.tsx`), `lib/hooks/{useThemePaletteReader,useChartColors,useActionColors,useCssColorTokens}.ts`, pure `lib/utils/themePalette.ts` (`readThemePalette`: the slots through the luminance filter, the action colours, the `--role-*` hexes), `lib/utils/colorParse.ts` (the ONE colour parser: `oklch()`, `lab()`, `#hex`, `rgb()` → OKLCH, and OKLCH → hex), `lib/utils/cssColorToHex.ts` (a served colour → `#rrggbb` for Nivo), `lib/utils/actionColor.ts` (the COMPRA/VENDI/OK clamp), `lib/utils/costCenterColors.ts` — doc/guide/temi.md; tests `__tests__/{chartPaletteDistinctness,cssColorToHex,actionColorContrast,chartColorsContext}.test.ts`, `e2e/motion.layout.spec.ts` (a client navigation reads no palette token)
- **The costume** (2026-11-21, § Il costume): `lib/constants/colorTheme.ts` (`COLOR_THEME_META`, `COSTUME_ATTRIBUTE`, `COSTUME_THEMES`, `buildColorThemeInitScript`), `lib/constants/themeCostume.ts` (`COSTUME_SCOPE_PROPERTIES`, the emblem types, `THEME_EMBLEMS`, `resolveEmblem`), `contexts/CostumeScopeContext.tsx` (`CostumeScope`; `useCostumeScope` and `useThemeCostume` re-exported from `contexts/ColorThemeContext.tsx`, where they and the context live), `components/ui/theme-costume.tsx` (`EmblemSvg`, `ThemeEmblem`, `ThemeEmblemLead`, `ThemeHeaderBand`, `HeadingText` re-exported), `components/ui/heading-text.tsx`, pure `lib/utils/headingFigures.ts` (`splitHeadingFigures`), `components/dashboard/overview/ResourceBar.tsx` with `selectResourceBar` in `lib/utils/overviewSummary.ts` (the resource bar, 2026-11-22); tests `__tests__/{themeBlocks.ts,themeCostume,headingFigures,colorTheme}.test.ts`, `__tests__/{aspettoTab,costumeScope,costumeScopeEgeo,costumeScopeOrbita,resourceBar,responsiveModalCostume}.test.tsx`, `__tests__/themeCostumeContrast.test.ts` (generic over `COSTUME_THEMES`), `e2e/theme.neutral{,.mobile}.spec.ts` on `e2e/themeNeutral.ts` + `e2e/themeNeutral.baseline.json`, `e2e/theme.egeo{,.mobile}.spec.ts` on `e2e/themeEgeo.ts` (they write `userPreferences/test-user-1.colorTheme` and put it back; `e2e/theme.orbita{,.mobile,.tablet}.spec.ts` reuse the same helper), `e2e/shell.boot{,.mobile}.spec.ts` (Geist, the scope's boundary)
- **Suites to run after a change here**: `__tests__/{chartPaletteDistinctness,cssColorToHex,actionColorContrast,chartColorsContext,mutedForegroundContrast,themeColor,colorTheme,themeCostume,themeCostumeContrast,headingFigures}.test.ts`, `__tests__/{aspettoTab,costumeScope,costumeScopeEgeo,costumeScopeOrbita,resourceBar,responsiveModalCostume,assistantHeader}.test.tsx`, `__tests__/overviewSummary.test.ts`; `__tests__/{cashflowSankey,chartColorsContext}.test.ts` and `__tests__/{costumePortals,consulenteBook,pathCard,expenseProposalCard}.test.tsx` (the costume on the dialogs and the pages, 2026-11-23); `npx playwright test e2e/theme.neutral e2e/theme.egeo e2e/theme.orbita e2e/theme.costume e2e/shell.boot` on the emulators
- **The browser's chrome** (2026-10-17): `lib/utils/themeColor.ts` (`DEFAULT_THEME_COLORS`, `resolveThemeColor`), `components/providers/ThemeColorSync.tsx`, the `viewport.themeColor` export in `app/layout.tsx`, the `html`/`html.dark` rules in `app/globals.css`; tests `__tests__/themeColor.test.ts`, `e2e/shell.boot{,.mobile}.spec.ts` → `expectBrowserChromeFollowsTheme` (`e2e/shellBoot.ts`)

## Color Theme System
- **Parallel theming**: next-themes owns `.dark`, the custom system owns `data-theme` — fully independent. CSS:
  `[data-theme="name"]` for light, `.dark[data-theme="name"]` for dark; `ColorThemeContext` lives inside `AuthProvider`.
  **The theme is an external store** (2026-09-06): `useSyncExternalStore` over localStorage with `'default'` as the
  server snapshot; the `data-theme` attribute is a pure effect on the value, `writeStoredTheme` applies it before the
  re-render, and the Firestore sync depends on `uid` alone (rewriting an equal value is a no-op in every sink).
- **The theme is on `<html>` BEFORE the first paint** (2026-09-28): `app/layout.tsx` inlines
  `COLOR_THEME_INIT_SCRIPT` in `<head>` — a plain function that reads the storage key, accepts only a name from the
  list and sets the attribute — the way next-themes puts `.dark` there. Since that day the dashboard shell is in the
  prerendered HTML, and without the script a reader on a non-default theme would see the default palette until
  hydration. The key, the attribute, the list and the script live in **`lib/constants/colorTheme.ts`**, a module
  WITHOUT `'use client'`: the root layout is a Server Component, and a value imported from a client module there is
  a client reference, not the string. `ColorThemeContext` imports the same constants, and both sides accept a stored
  value through `isColorTheme` (a stale or hand-edited key is the default). The `ColorTheme` union derives from
  `COLOR_THEMES` there (`userPreferencesService` re-exports it). In `<head>`, not in `<body>`: a body script runs
  after the parser may already have had a rendering opportunity. Pinned by `__tests__/colorTheme.test.ts` (the
  script run in a VM) and by `e2e/shell.boot{,.mobile}.spec.ts` (c): the attribute at the first animation frame,
  and set while `document.body` did not exist yet.
- **The palette is read ONCE per theme, by `ChartColorsProvider`** (2026-10-08). Until then every host of
  `useChartColors` (up to twelve on a FIRE tab), `useActionColors` and `useCssColorTokens` ran its own rAF and
  `getComputedStyle`, then rendered a second time one frame after mounting. The provider sits in
  `app/dashboard/layout.tsx`, which outlives the pages: it reads while the shell waits for Firebase Auth, so a page mounts
  with the theme's colours already in hand and its charts render once (census `mount`: Storico's Composizione 2 → 1,
  FIRE's projection and scenarios 2 → 1, the Panoramica's composition bar 2 → 1; script at Storico's mount 1024 → 854
  ms — `doc/guide/velocita.md` § Il census). Its value is the reader's state object, replaced only on a colour-theme or mode
  change, so a consumer re-renders only then. The three hooks keep their signatures and, **without the provider** (the
  landing, the auth pages, a test), read the theme themselves through the same `useThemePaletteReader` — so the palette
  is the same with or without it by construction. **A new hex token for Nivo goes in `THEME_HEX_TOKENS`**
  (`lib/utils/themePalette.ts`): with the provider mounted, `useCssColorTokens` answers its fallback for a token outside
  that list. A client navigation reads no `--chart-*` / `--role-*` token (`e2e/motion.layout.spec.ts`, seen red at 85
  with the provider removed); `getComputedStyle(<html>)` itself is still called twice per navigation — by Next's router,
  for its scroll handling.
- **The timing**: `useEffect + useState + requestAnimationFrame`, NOT `useMemo` — `getComputedStyle` during render runs
  before next-themes has updated the DOM and yields stale colours on a theme switch. It lives in ONE place,
  `useThemePaletteReader`; the provider renders three times per session (mount, next-themes' `resolvedTheme` after
  hydration, the read).
- **The luminance filter — LIVE since 2026-10-08**: L > 0.82 in light or L < 0.30 in dark falls back to the static
  palette at that index, so a theme with chart colours at extreme luminance always falls back — fix it at the CSS level.
  It reads the SERVED string through `cssColorToOklch` (`lib/utils/colorParse.ts`: `lab()`, `#hex`, `rgb()`, `oklch()`);
  a form it cannot model (a keyword, `color-mix()`, `color(display-p3 …)`) passes UNFILTERED. Measured in the browser
  that day on the twelve blocks: every slot served as `lab()`, 0 slots changed — the highest light L 0,683, the lowest
  dark L 0,56; `__tests__/chartColorsContext.test.ts` holds it on the authored slots in their served form. Below ~0.015
  chroma everything looks identically gray, so `--card`/`--background`/`--muted` need chroma ≥ 0.020.
- **The token you AUTHOR is not the token the browser RETURNS.** Turbopack's CSS transform transpiles `oklch()` for the
  build's browser targets, and `getComputedStyle(document.documentElement).getPropertyValue('--chart-6')` came back as a
  `lab(…)` string under `npm run dev:e2e` (measured 2026-08-30). Two consequences. A Playwright assertion on a resolved
  token must compare CHANNELS or DISTINCTNESS — never match `/^oklch\(/`, a regex on the authored syntax that fails on a
  correct value and can only ever pass by accident. And the luminance fallback above read the L with a regex on
  `oklch(` (`parseOklchL`) until 2026-10-08, so it was **inert** wherever the served string is transpiled — which is
  everywhere: the colour passed through unfiltered. Read the served string before trusting a reader of it.
- **Action/semantic colors that must follow the theme: clamp lightness, do not index-fallback.** `useActionColors` clamps
  only the oklch L channel, preserving hue and chroma; `useChartColors`' same-index fallback would lose the theme hue and
  can collapse two states onto one colour. Resolve **once per section** and pass the colour down.
- **Sign tokens must be verified per theme**: `--positive` is declared in `:root`, `.dark` and both Egeo blocks (Egeo
  light's own green, its dark block repeating the `.dark` value); a light-block token reaches dark mode by source order,
  so a theme that overrides a sign token writes it in both blocks. `--destructive` is declared in every block
  (cyberpunk's is orange) and must be measured per theme (`themeCostumeContrast` does it for the costume themes). Never
  assume a token change lands globally without counting its declarations. In a costume theme the COMPRA slot
  (`--chart-3`) keeps ≥ 30° of hue from `--destructive`: a chip that says «compra» never wears the red of a loss (G2).
- **A user-chosen identity colour is a SLOT, not a hex** (`'chart-1'..'chart-8'`, resolved by `resolveCostCenterColor`).
  Three rules: **migrate without a backfill** (`LEGACY_HEX_SLOTS` maps each old hex to the slot at the same position);
  **derive the no-colour fallback from the document id** (FNV-1a), never from the row's rank, which repaints half the
  list on every period switch; **indices 0-7 are theme-aware** since 2026-08-30 (`--chart-1..8` in all sixteen blocks),
  index 8 (`--chart-9`) since 2026-09-20, only 9 pads from the static `CHART_COLORS`.
- **The default theme's light slots hold the dark hue bands** (2026-09-13): `:root --chart-1..5` were re-pitched from
  the shadcn preset (three oranges and two teals — Liquidità measured ΔE00 10.1 from Immobili on the
  Composizione bar, and the hero's rising curve wore the hue of `--destructive`) onto blue · green · amber · violet ·
  coral with L and C set for white. **The floor is a test**, `__tests__/chartPaletteDistinctness.test.ts`: it reads
  `globals.css` itself, ΔE00 ≥ 14 between any two slots of a mode, every slot inside the `useChartColors` luminance
  guard, each slot ≤ 30° of hue from its twin in the other mode. **Every theme block since 2026-09-20** (twelve then, fourteen with Egeo, sixteen with Orbita; below). A slot
  change re-derives `PRINT_CHART_HEX` (`__tests__/printTokens.test.ts` says the new hex); `PRINT_RANK_HEX` moved to
  slot 7 the same day because slot 3 became crypto's amber.
- **The named themes are held to the same floor** (2026-09-20, from the owner's tour of Storico on solar-dusk).
  Measured that day, by reading `globals.css`: solar-dusk light had Obbligazioni and Immobili as the SAME grey (ΔE00
  0.0) and Azioni ~ Criptovalute at 9.5; elegant-luxury six pairs under 14 in light and three in dark (three reds, two
  golds); retro-arcade and midnight-bloom Immobili ~ Liquidità at 10 in both modes; cyberpunk passed on distance but
  its light slots 3-5 sat at L 0.84–0.92, above the luminance guard. Slots 2-8 of those blocks were re-pitched — slot 1
  stays the theme's primary (the hero curve wears it), 6/7/8 keep their hue, and every slot is ΔE00 ≥ 17 from the
  others, inside the sRGB gamut and ≥ 3:1 against the theme's own card. The hues per theme: solar-dusk orange · dusk
  blue · sun yellow · a pine green for Immobili (a warm NEUTRAL grey until 2026-11-15, see below) · sage green; elegant-luxury burgundy · navy · plum · gold · deep green; retro-arcade blue ·
  teal · magenta · orange · violet; midnight-bloom violet · orchid · coral · blue · mint. **The values came from a
  search, not from taste** (a throwaway annealing over L, C and a few degrees of hue, maximising the closest pair under
  those constraints): re-run the idea, not the numbers, when a theme is added.
- **No chart slot may be the fold's grey** (2026-11-15, the ring's tour; DESIGN.md → The Ring Rule): a ring's «Altre N …»
  and its residual are drawn in `--muted-foreground`, and solar-dusk's Immobili (`--chart-4`, a warm grey of chroma
  0.012) measured ΔE00 ~1 from it in light — Immobili and «Altre 2 classi» were one grey on the Composizione's ring.
  The owner chose a pine green: `oklch(0.42 0.08 170)` in light (7,4:1 on the card), `oklch(0.53 0.105 170)` in dark
  (3,05:1), ΔE00 ≥ 25 from every slot and from the fold in both modes, found by the same kind of search. Held by
  `__tests__/chartPaletteDistinctness.test.ts` («the ring fold of …»: every slot ΔE00 ≥ 14 from the block's
  `--muted-foreground`, all sixteen blocks). No neutral slot is left, so the test's hue exemption covers nothing today.
- **`--muted-foreground` is held to 4,5:1 on THREE surfaces, in all sixteen blocks** (2026-10-08,
  `__tests__/mutedForegroundContrast.test.ts`, reading `globals.css`): `--background`, `--card` and `--muted` — the
  reading line, the eyebrow and every inactive label are printed on all three, and the pill (`bg-muted`) is where the
  floor was lowest. Measured that day from the file (WCAG from oklch, the same arithmetic as `actionColorContrast`):
  `:root` 4,73 on the page but 4,34 on the pill (the detector's 4,46 of 2026-09-21 was this ink on a tinted surface);
  retro-arcade dark 2,01 on the pill (its muted was a MID tone, L 0.52, under an ink equal to the foreground);
  midnight-bloom light 2,93 (a beige pill, L 0.82); midnight-bloom dark 3,87; solar-dusk light 3,98 on the pill and 4,38
  on the card; cyberpunk dark 4,44 on the card. Re-pitched to the nearest L that clears all three: the ink alone on
  `:root` (0.556 → 0.546), cyberpunk dark (0.63), solar-dusk light (0.523), midnight-bloom dark (0.761); ink AND surface
  where the surface was the fault — retro-arcade dark muted 0.52 → 0.36 with the ink 0.70 → 0.76, midnight-bloom light
  muted 0.82 → 0.90 with the ink 0.54 → 0.49. The values come from a search along L at the theme's own chroma and hue
  (the throwaway `mutedSuggest.mjs` of that session, the idea of the chart annealing above). A new theme runs this test
  first; a token that fails it is a surface problem as often as an ink problem — look at `--muted` before darkening
  the ink past the theme's `--foreground`.
- **`--chart-9` is Storico's «Previdenza» band, in all sixteen blocks** (2026-09-20). It was the static indigo
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
- **Adding a theme** (rewritten 2026-11-21; the themes today: Default, Solar Dusk, Elegant Luxury, Midnight Bloom,
  Cyberpunk, Retro Arcade, Egeo — Marcellus, frieze, temple — and Orbita — Chakra Petch 500/600, corner marks, a still star ground in dark, the primary glow in dark, the planet, the resource bar —, the two costume themes): its CSS blocks — `[data-theme="name"]` + `.dark[data-theme="name"]`, and
  for a costume theme the two scope blocks after them (§ Il costume) — the name in `COLOR_THEMES` and its
  `COLOR_THEME_META` entry (`lib/constants/colorTheme.ts`: a name without an entry fails `tsc`; the union, the
  pre-hydration script and `COSTUME_THEMES` derive from it). Everything else derives: the four gate tests read their
  blocks from the registry (`__tests__/themeBlocks.ts` → `THEME_MODES`; a name without CSS turns all four red, and
  `mutedForegroundContrast` also fails a block with no registry entry; seen red on 2026-11-21 with `'sepia'` in
  the list and no CSS), and the swatches of Impostazioni › Aspetto
  map `COLOR_THEMES` — each half of a preview is the theme's own block applied to a `div` (`[data-theme]`,
  `.dark[data-theme]`, which is why the default's light block also answers `[data-theme="default"]`), painted with
  `bg-background` / `bg-primary` / `bg-accent`, so a preview cannot drift from the stylesheet (until 2026-11-21 they
  were hand-copied oklch literals, and three dark grounds and two «accents» had drifted); more than six themes and the
  grid takes four columns at `desktop:`. The accessible name is the POSITION («Colore 3 di 6: Midnight Bloom»), never
  the hue. **A new theme or a moved slot runs `__tests__/chartPaletteDistinctness.test.ts` first** — solar-dusk
  shipped two classes as the same grey for months.

- **The five `--role-*` tokens are `:root` aliases that no theme block redefines** (`--role-need: var(--chart-1)`,
  `--role-want: var(--chart-4)`, `--role-saving: var(--chart-2)`, `--role-unclassified: var(--muted-foreground)`,
  `--role-deficit: var(--destructive)`; `grep -n -- '--role-' app/globals.css` finds those five lines and nothing else).
  The theme attribute and `.dark` sit on the same root element, so the alias resolves against the active block's slots
  — no block names a role, and `chartPaletteDistinctness` measures the slots, not the aliases. A theme may declare its
  own later. The bucket → token map is ONE constant, `lib/constants/spendingRoleColors.ts` (`SPENDING_ROLE_TOKEN`, and
  `spendingRoleColorVar` for a `var()`), read by its three painters. The phone's 50/30/20 bar and the Impostazioni
  badge read them as `var()`; Nivo cannot, so the roles Sankey reads them through
  **`useCssColorTokens(tokens, fallbacks, enabled)`** — since 2026-10-08 the hexes `ChartColorsProvider` resolved once
  per theme (`tokenHex`, through `lib/utils/cssColorToHex.ts` on `lib/utils/colorParse.ts`, the ONE colour parser),
  memoized on the objects' identity. **`enabled` is whether the caller paints them this render**: it matters only
  without the provider, where the hook's own read runs only while enabled — `FlussoTile` passes it only while the roles
  Sankey is on screen (the setting on, «Per ruolo», from 640px), so a tile that draws nothing with them never calls
  `getComputedStyle`.

## Il costume — «un tema può vestire la dashboard oltre il colore?» (2026-11-21)

DESIGN.md → The Costume Rule. A *palette theme* is colours and a radius (the six of today); a *costume theme* may also
carry a ground, a frame on the tiles, a heading face, ornaments, a glow on the primary action, the radius of its pills, chips and card-like boxes, the dark switch's ON track, the shell labels' colour, an emblem and — on the Panoramica at ≥ 1440 only — a resource bar — inside the
dashboard, its dialogs and its portalled surfaces only (owner, 2026-11-12: never the emails, the PDF, the landing, the access pages). Every
mechanism has a neutral default, and the palette themes are held to render exactly as before.

- **Two attributes.** `data-costume` on `<html>` says the active theme has a costume: set by the `<head>` script
  (`buildColorThemeInitScript`, before the first paint) and by `applyThemeAttribute` in `ColorThemeContext`, from
  `COLOR_THEME_META[theme].costume`. `data-costume-scope` bounds where it is worn: `CostumeScope`
  (`contexts/CostumeScopeContext.tsx`, a `display: contents` box, so no layout moves) wraps the whole dashboard shell
  inside `ChartColorsProvider` (`app/dashboard/layout.tsx`), and `ResponsiveModal` puts the attribute on its own
  content (Drawer and Dialog: portalled out of the shell) when `useCostumeScope()` is true. The context and its two
  hooks are defined in `ColorThemeContext.tsx`, and `PageHeader`'s emblems and `ResponsiveModal` import them from
  there: in a module of their own, shared by the layout, the header and the modal, Turbopack cut a new shared chunk
  (+0,8 KB gz on every route, 2026-11-21, doc/guide/velocita.md § Registro). The landing and the access
  pages render `PageHeader` and `TILE_EYEBROW_CLASS` too, outside any scope: a mechanism keyed on the theme alone
  would dress them. The toasts still render with the default costume.
- **Portals** (2026-11-22): a portalled primitive spreads `useCostumeScopeProps()` on its content; a new one
  does the same, or the costume stops at `<body>`. `COSTUME_SCOPE_PROPS` and the hook live beside `useCostumeScope`
  in `ColorThemeContext.tsx` (re-exported by `CostumeScopeContext.tsx`); the spread sits right after the content's
  `data-slot` (in `popover.tsx`, which has none, after `data-popper-sheet`) and before `{...props}`, in `popover`,
  `select`, `dropdown-menu`, `tooltip`, `sheet` (so the phone-landscape sidebar too), `drawer`, `dialog` and
  `alert-dialog`. React context crosses the portal; outside the dashboard the hook returns an empty object. The
  primitives now import `ColorThemeContext → AuthContext → Firebase`: a component test that renders one mocks
  `@/lib/firebase/config`, `AuthContext` and `userPreferencesService` (seven test files gained the three mocks).
  Held by `__tests__/costumePortals.test.tsx` (Popover, DropdownMenu, Tooltip, Sheet, Dialog, AlertDialog in jsdom)
  and `e2e/theme.costume{,.mobile}.spec.ts` (Select and Drawer).
- **Three radii** (2026-11-22): `--costume-control-frame-radius` (a card-like box that is not a tile, and the popper
  sheet's top corners), `--costume-control-pill-radius` (pill controls, bar tracks and fills, pill chips),
  `--costume-control-chip-radius` (chips with a literal radius); Egeo frames at `var(--radius-2xl)` and keeps its
  pills and chips (`initial`), Orbita squares all three. The sites read them through `COSTUME_PILL_RADIUS_CLASS`
  (`rounded-[var(--costume-control-pill-radius,calc(infinity*1px))]`, Tailwind's `rounded-full`),
  `COSTUME_FRAME_RADIUS_CLASS` (`rounded-[var(--costume-control-frame-radius,calc(var(--radius)_+_4px))]`,
  `rounded-xl`) and the chip sites' arbitrary radius on the chip property, with today's px as its fallback: the bottom pill and
  its «+», `SegmentedPill`, `Switch`, the bars of `CompositionList`, `CompositionBar`, `RankedRows`, `ObiettivoTile`,
  `BudgetTrack`, `CentriTile`, `SottocategorieTile`, the chips of `AssetRow`, `StrumentiTile`, `ExpenseTable`,
  `BudgetImpostazioni`, `PatrimonioTile`, `IncassoNettoTile`, `MovimentiTile`, `CalendarDayCell`, `AffidabilitaTile`,
  `ThemePicker`, the phone tab of `PageTabBar` and `Chip` (the period picker's presets; added at the retirement of
  2026-11-22, which found it left round); the frame on `PopoverContent`, `ChoiceList`, `DividendiDettaglio`'s
  trigger and `ProvisionalCouponBanner`. What stays round in every theme: the dots (`ExpenseTable`'s category dot,
  `PageTabBar`'s), the avatar, the radio. A caller's later `rounded-*` through `cn()` would replace the class: none
  passes an unprefixed one; Analisi's period control gives `SegmentedPill` a `max-sm:rounded-2xl`, the tile's radius below
  `sm:`, which follows the costume through `--radius-2xl` (2026-11-22). Held by `themeCostume.test.ts` (the class case and the site scan).
- **The shell** (2026-11-22): `.costume-shell-eyebrow` (the sidebar's and «Altro»'s group labels take
  `--costume-eyebrow-color`, not 60 % of the sidebar's ink), `.costume-shell-quiet` (the inactive pill labels, the
  account e-mail, the collapse toggle, the account chevron on `--muted-foreground`; `:not(a:hover):not(button:hover)`
  keeps a hovered control's ink, a span stays muted), `.costume-wordmark` (the sidebar's and the top bar's «Net Worth
  Tracker» in the heading face, weight, tracking and case, `font-synthesis: none`). In a costume theme a dark
  `Switch` paints its ON track `--primary` (`--costume-control-switch-on`, fallback Tailwind's blue-600 written as
  `oklch(54.6% 0.245 262.881)`). The loading tile of `TileGridSkeleton` carries `data-tile`, so the cap line or the
  corner marks are there before the data.
- **The scope properties** — `COSTUME_SCOPE_PROPERTIES` (`lib/constants/themeCostume.ts`, 23), declared ONLY in a
  costume theme's `[data-theme="<id>"] [data-costume-scope]` (all of them) and `.dark[data-theme="<id>"]
  [data-costume-scope]` (those that differ); a palette theme declares none. «Off» is the value a palette theme paints:

  | Property | Paints | Off |
  | --- | --- | --- |
  | `--radius` | `sm`–`xl` in scope | the theme block's `--radius` |
  | `--radius-2xl` | tiles, rows, modals | `1rem` |
  | `--costume-ground` | `#page-main`'s `background` shorthand | `var(--background)` |
  | `--costume-ornament` | band, cap, corners, emblem strokes | `var(--muted-foreground)` |
  | `--costume-tile-image` · `-position` · `-size` | layers over a tile (cap line, corner marks) | `none` · `0 0` · `auto` |
  | `--costume-tile-shadow` | a tile's shadow | `0 1px 3px 0 #0000001a, 0 1px 2px -1px #0000001a` |
  | `--costume-heading-font` | verdict headline, eyebrows, the wordmark, a modal's title | `var(--font-geist-sans), system-ui, sans-serif` |
  | `--costume-heading-weight` · `-tracking` · `-case` | verdict headline | `600` · `-0.025em` · `none` |
  | `--costume-heading-size` | verdict headline at ≥ 1440 | `30px` |
  | `--costume-eyebrow-color` · `--costume-eyebrow-weight` | eyebrows | `var(--muted-foreground)` · `600` |
  | `--costume-header-band` · `--costume-header-band-height` | the band under the header | `none` · `0px` |
  | `--costume-primary-glow` | a primary button at rest | `none` |
  | `--costume-control-frame-radius` | a card-like box that is not a tile; the popper sheet's top corners | `initial` (the site's `rounded-xl`; the sheet's `10px`) |
  | `--costume-control-pill-radius` | pill controls, bar tracks and fills, pill chips | `initial` (`rounded-full`) |
  | `--costume-control-chip-radius` | chips with a literal radius | `initial` (the site's px) |
  | `--costume-control-switch-on` | the dark switch's ON track | `initial` (blue-600) |
  | `--costume-page-generated-fill` | a generated sub-tile inside a tile or a modal | `initial` (`bg-muted/40`) |

  The four `--costume-control-*` and `--costume-page-generated-fill` (2026-11-23) are `initial` when off — guaranteed-invalid, so a `var()` with a fallback takes the
  fallback, while a bare `var()` would make its declaration invalid (radius 0): they are read ONLY through a `var()`
  carrying today's value.
- **The gated rule set** — `app/globals.css`, unlayered, between the banners `/* ─── Theme costume (DESIGN.md → The
  Costume Rule) ── */` and `/* ─── End of theme costume ── */`, after the last theme block; later rules go before
  the closing banner. Every selector starts with `[data-costume] [data-costume-scope]`; the hooks are `#page-main`,
  `[data-tile]` (both `Tile` sections and `ErrorNotice`), `.costume-heading` (the verdict's `h2`), `.tile-eyebrow`
  (inside `TILE_EYEBROW_CLASS`), `.costume-figure`, `.costume-header-band`, `[data-costume-frame]` and
  `.costume-title` (a modal, below) and the primary `[data-slot="button"]
  [data-variant="default"]`. Unlayered beats every utility, so each rule excludes what a utility must keep: the tile
  shadow skips `[data-generated]` (the AI accent's glow), the primary glow skips `.ai-control` (the marker that opens
  `AI_CONTROL_ACCENT_CLASS`) and `:focus-visible` (the ring is a box-shadow too). Outside the banners a `--costume-*`
  is read only by another `--costume-*` declaration of a scope block (`--costume-tile-image: linear-gradient(var(
  --costume-ornament), …)`), and by one unlayered rule that reads a scope property, `[data-popper-sheet]`, always
  with today's fallback (`var(--costume-control-frame-radius, 10px)`). Held by `__tests__/themeCostume.test.ts` (the
  palette-theme, gate and scope-property cases).
- **A modal is a tile lifted off the page** (2026-11-23; DESIGN.md → The Modal-Is-A-Tile Rule): `DialogContent`,
  `AlertDialogContent` and `DrawerContent` carry `data-costume-frame`, and ONE gated rule gives a frame the tile's
  image layers (Egeo's cap, Orbita's corner marks) — never `data-tile`, whose rule would trade the Float shadow for
  the tile's. The dialog's corner is `rounded-2xl`, so it follows `--radius-2xl` on its own; the drawer's top corners
  read `--costume-control-frame-radius` with their 10px. `.costume-title` (the font and its case, not the size) sits
  on `ResponsiveModal`'s title in both shells and on `AlertDialogTitle`; a STRING title and the eyebrow go through
  `HeadingText`, a node title is rendered as passed (the host wraps its own figures: `AIAnalysisDialog`'s verdict).
  The primitives never set `data-costume-frame` on anything else: a sheet (`sheet.tsx`), a popover and a menu are
  not tiles. Held by `__tests__/{costumePortals,responsiveModalCostume}.test.tsx` and `e2e/theme.costume*.spec.ts`.
- **The scenes of a path are tiles** (2026-11-23): `PathCard`'s two cards and the Consulente's wizard, interview
  and run cards carry `data-tile`, their headline `.costume-heading` with `HeadingText` (`PATH_HEADLINE_CLASS`); a
  card of the book is a tile too, a model's page `[data-tile][data-generated]` (the accent's glow, not the tile's
  shadow). A row list inside such a card inherits the corner (`first:rounded-t-[inherit] last:rounded-b-[inherit]`).
- **A box inside a tile or a modal is a frame; a bar, a pill and a chip read their radius** (2026-11-23): every
  `rounded-xl` box of the dialogs and of the pages beyond the first three is `COSTUME_FRAME_RADIUS_CLASS` through
  `cn()`, every bar track and fill, pill and round chip `COSTUME_PILL_RADIUS_CLASS`, every chip with a literal radius
  the chip property with its px, every chart tooltip's inline `borderRadius` the frame property with its px.
  `themeCostume.test.ts` holds three file lists: `FRAME_BOX_FILES` (no `rounded-xl` left), `NO_LITERAL_FILES` (no
  `rounded-full` left) and `ONE_ROUND_THING` (the files that keep ONE round thing — a dot, a handle, an avatar, a
  spinner — named by a substring of its line). A new box in one of those files that is not a tile takes the class,
  or the test goes red; a new file is added to its list.
- **A generated sub-tile's fill** (2026-11-23): `COSTUME_GENERATED_FILL_CLASS` reads
  `--costume-page-generated-fill` with `bg-muted/40` as its fallback — Egeo declares `var(--card)`, because its
  `--ai-accent` on the muted wash read 4,48 / 4,39:1; Orbita leaves it `initial` (4,63 / 4,97). The Assistente's
  question block, the expense and the goal proposal cards (`themeCostumeContrast` K7).
- **Paper is the palette's** (2026-11-23): `@media print { [data-costume] [data-costume-scope] { … } }` puts every
  scope property back to its off value with `!important` (`--radius` to `inherit`), and `EmblemSvg` is
  `print:hidden`: the Consulente's book printed from a costume theme has Geist headings, no band, no cap, no emblem.
  A new scope property is added to that block in the same commit (`themeCostume.test.ts`, «paper is the palette’s»).
- **The Analisi flow under a costume** (2026-11-23): in a palette theme the Sankey's types keep their hexes
  (`DEFAULT_SANKEY_TYPE_PALETTE`); in a costume theme `FlussoTile` reads the slots of
  `SANKEY_COSTUME_TOKEN` (`lib/constants/sankeyCostumeColors.ts`; part of `THEME_HEX_TOKENS`, so
  `ChartColorsProvider` resolves them once per theme) and `costumeSankeyPalette` maps them: fixed `--chart-1`,
  variable `--chart-4`, debt `--chart-3`, Budget `--positive`, Risparmi `--chart-2`, the incomes the nine slots in
  turn. Nivo cannot take a CSS token, so the palette is hexes handed to the pure builders (doc/guide/cashflow-analisi.md).
- **A chart's red is the token, not a hex read once** (2026-11-23): `UnderwaterDrawdownChart` paints
  `var(--destructive)` on its gradient stops and its stroke — an SVG attribute resolves a custom property, so the
  chart follows a theme or a mode change with no state and no effect.
- **The layered consumers** are `TILE_EYEBROW_CLASS`, `COSTUME_PILL_RADIUS_CLASS`, `COSTUME_FRAME_RADIUS_CLASS`,
  `COSTUME_GENERATED_FILL_CLASS` and the
  chip sites whose arbitrary radius reads `--costume-control-chip-radius`. A doc or a comment never quotes such a class
  with a placeholder in its value: Tailwind scans every file and emits it as invalid CSS (2026-11-22, every page a 500
  on `next dev`). `TILE_EYEBROW_CLASS` paints
  `text-[color:var(--costume-eyebrow-color,var(--muted-foreground))]`, a utility, so a caller's colour
  (`text-destructive`, the AI accent) still wins through `cn()` — every use is inside `cn()` or the bare
  `className={TILE_EYEBROW_CLASS}` (`themeCostume.test.ts`, the eyebrow case).
- **The band** is in every theme's DOM — `ThemeHeaderBand` closes `PageHeader` AND `PageHeaderSkeleton` — and only a
  costume's `--costume-header-band-height` gives it a height, with 16px above it; so the prerendered first paint holds
  it and the page replaces the skeleton without moving. Below `desktop:` the header is sticky: the band sits on an
  opaque `--background` strip.
- **A figure in a heading stays mono** (The Mono Mandate): `HeadingText` wraps each figure `splitHeadingFigures` finds —
  a signed amount with its €, a percentage, a year, a date «08/11/2027» and a time «18:42» as ONE figure; a full stop
  after it, and «Q3-x», stay prose — in a `.costume-figure` span, in the verdict's headline, every tile eyebrow, the
  header label and, since 2026-11-23, a modal's eyebrow and string title and a path scene's headline. `HeadingText` lives in `components/ui/heading-text.tsx`, a module with no hooks, re-exported by
  `theme-costume.tsx`: `Tile` and `PageVerdict` render it, and through `theme-costume.tsx` they pulled in
  `ColorThemeContext → AuthContext → Firebase` — eighteen test files failed at import (2026-11-21).
- **Egeo draws twelve emblems, Orbita one** (2026-11-23): the temple is Egeo's fallback (Panoramica) and its `pages` name
  eleven arts — Patrimonio's amphora, Cashflow's waves, Analisi's balance, Rendimenti's laurel, Storico's scroll,
  Allocazione's meander, Previdenza's shield (the one with circles), FIRE's flame, Hall of Fame's wreath,
  Assistente's lamp, Impostazioni's column — of the nine of 2026-11-23 eight are `egeoMark(d)`, a single stroked
  path on the 22px grid, and the shield two circles; Orbita keeps the planet everywhere (`pages: {}`). Every `PageHeader` host passes `emblem`: the Consulente
  and the Piano di accumulo are `allocazione`, the Compravendita `patrimonio`
  (`themeCostume.test.ts`, «every page header names its emblem»; `costumeScopeEgeo.test.tsx`, twelve distinct arts).
- **Emblems**: `THEME_EMBLEMS` (a theme's `fallback` and optional `pages`), `resolveEmblem(theme, page, inScope)` —
  `null` out of scope —, drawn by `ThemeEmblem` beside the desktop label (22px) and `ThemeEmblemLead` around the
  phone's `h1` (18px; without an emblem the `h1` alone, the DOM of today); `PageHeader`'s `emblem?: EmblemPage`. The
  strokes are scope tokens (`EMBLEM_TONE_COLOR`), the svg `aria-hidden`. A component test that renders `PageHeader`
  mocks `@/lib/firebase/config` and `AuthContext` (the emblem reads the colour theme): `assistantHeader.test.tsx`.
- **A costume's heading face** is ONE `next/font/google` call in `app/layout.tsx` with `preload: false`, `subsets:
  ['latin']`, `variable: '--font-<slug>'`, its `.variable` on `<html>` beside Geist's, named only by that theme's
  `--costume-heading-font`: the `@font-face` rules ship in the root CSS (no JS, `perf:budget` does not see them) and
  the browser fetches the file only when text in scope paints with it.
- **What a costume must not move** (2026-11-21): the first-screen census finds a tile by `section.rounded-2xl[id]`
  (`scripts/mobileCensus.mjs`, `isClosedRow`), so a frame comes through `--radius-2xl` and `data-tile`, never a new
  radius class on the tile; `e2e/shellBoot.ts` observes `data-theme` on the whole document, so the swatches'
  `data-theme` divs live on Impostazioni alone, which no shell-boot spec opens; `PageHeader` stays a module without
  `'use client'` and without hooks — the emblem's hooks live in `theme-costume.tsx`.
- **A costume theme's CSS** = four blocks: `[data-theme="<id>"]`, `.dark[data-theme="<id>"]` (the palette, every token
  a palette theme declares, `--radius` included), then the same two followed by ` [data-costume-scope]`.
- **The resource bar** (2026-11-22, `ThemeCostume.resourceBar`, Orbita's only): `ResourceBar` prints under the Panoramica's header the four figures of `selectResourceBar` (Patrimonio, Liquidità, Risparmio, Da inizio anno) in a `dl[aria-label="Quadro rapido"]` that is `hidden desktop:flex` — at ≥ 1440 only, on the Panoramica only, absent in every other theme and out of the scope, and absent on an account with no asset or a total at or below zero (Sintesi prints no rows there). It is the one place a figure is printed twice on one screen (DESIGN.md → The Costume Rule), so each cell is the text its tile prints: the hero, Sintesi's rows and the year chip's percentage take the bar's formatters (`withTypographicMinus`, `formatSignedPercentIt(percentage, 2)`: the minus is U+2212, a 0% year reads «0,00%»), and `overviewSummary.test.ts` + `resourceBar.test.tsx` hold the identity; `e2e/theme.orbita.spec.ts` compares each cell with its tile's text, spaces removed (the unit sits in its own span).
- **A glow, a ring and an AI control** (2026-11-22): the primary glow is a `box-shadow` at rest and the focus ring is another, so the rule skips `:focus-visible`; a control that asks a model (`ai-control`) keeps its own hover and focus glow and takes none of the costume's. The glow's computed value is read through a probe `div` laid inside the scope (`box-shadow: var(--costume-primary-glow)`), never from the authored token.
- **A nebula is a surface** (2026-11-22, `themeCostumeContrast` K2): a ground whose `radial-gradient` layer has a first size over 2px (the star specks are smaller) is composited at its alpha over `--background`, blended on the gamma-encoded values as a browser does, and `--foreground`, `--muted-foreground`, the eyebrow and both sign tokens are held ≥ 4,5:1 on it too; a guard test fails when no ground in the stylesheet has one, so the case cannot pass vacuously.
- **A test of the emblem mocks the provider's STORAGE, not the hook** (2026-11-22, `__tests__/costumeScopeEgeo.test.tsx`): `useThemeCostume` calls its own module's `useColorTheme`, which a `vi.mock` of `ColorThemeContext` does not reach, so the scope read `default` and no temple drew. The test mounts the real `ColorThemeProvider` with `color-theme = egeo` in `localStorage`; the sibling `costumeScope.test.tsx` stubs the registry instead, so the real-registry half lives in its own file (`vi.mock` is per file).
- **A new costume theme runs the ring-fold gate too** (2026-11-22): the four gate tests are not four tests; `chartPaletteDistinctness` also holds every slot ΔE00 ≥ 14 from `--muted-foreground`, and the mock's ink failed it (Egeo light, 11,8 and 12,5). Run all four before trusting a palette, and read the numbers § Per-theme measures records.
- **The palette themes render as before, measured**: `e2e/theme.neutral{,.mobile}.spec.ts` read eight probes (`html`,
  `body`, `#page-main`, the header label, the verdict `h2`, the first tile and its `h3`, the first primary button),
  the «Nuova Spesa» dialog and its title at 1440 and, since 2026-11-23, its drawer and the drawer's title at 390
  (recorded on the code before the dialogs' pass, additions only) on Panoramica, Storico and Cashflow, every palette theme in both modes, at 1440
  and 390, and compare eleven computed properties with `e2e/themeNeutral.baseline.json`, recorded on 2026-11-21 on
  the tree with only the Geist fix applied. Every string is compared exact but `color`, `background-color` and
  `border-top-color`, compared as colours (ΔOKLab < 0.002, alpha within 0.01): the production build's minifier
  serialises `lab()` where `next dev` writes `rgb()` for the same token (measured 2026-11-21). A colour mixed with
  alpha (the sidebar label's `/60`) is served as `oklab()`, and the production build rounds it ~0,0002 away from `next
  dev`'s: `cssColorToOklch` reads `oklab()` since 2026-11-22 (four palette cases were red on the full run, held by
  `chartColorsContext.test.ts`). `THEME_NEUTRAL_RECORD=1` rewrites one viewport key — only on code the
  costume has not touched (a red is a finding, never a baseline to refresh). Seen red with the gate stripped from the
  tile-shadow rule (`box-shadow` → `none`). The repo's one recorded comparison: no snapshot tests.
- **Geist Sans was never applied until 2026-11-21**: next/font's variables sat on `<body>`, while Tailwind's preflight
  resolves `--font-sans` on `<html>`, so the sans fell back to `system-ui` (Segoe UI and SF masked it). They are on
  `<html>` now; `e2e/shell.boot{,.mobile}.spec.ts` hold the body's computed family and a loaded face named exactly
  `Geist` (next/font also registers «Geist Fallback» and «__nextjs-Geist»), seen red with the variables back on
  `<body>`. The font moved 27 of the 60 first-screen entries (doc/guide/prima-schermata-misure.md § Registro) and turned two
  Accumulo specs red, both seen green with the variables back on `<body>`: at 390 the empty verdict «Nessun piano di
  accumulo aperto.» took two lines and the tile landed 28px under its placeholder (now «Nessun piano di accumulo.»,
  owner); in landscape the empty tile, 3,5px shorter, made the stack sticky, and the stage check now measures it stuck
  (doc/guide/e2e-playwright.md).

## Per-theme measures (2026-11-22, the dialogs' pass 2026-11-23)

Where a costume theme's numbers live, the shell's included; a later pass adds its own here. The tests re-measure every figure
(`__tests__/{chartPaletteDistinctness,actionColorContrast,mutedForegroundContrast,themeCostumeContrast}.test.ts`).

- **Egeo light** — closest slot pair ΔE00 16,7 (Immobili–Materie Prime; Azioni–Previdenza 17,0); slot L 0,42–0,64, hue
  drift 0° on all nine; slots on the card 6,27 4,32 5,28 3,18 8,51 4,66 3,53 5,15 5,83; COMPRA / VENDI / OK as text on
  the card 6,84 / 8,51 / 6,34, on the 8% chip 6,07 / 7,45 / 5,66; `--chart-3` 32° from `--destructive` (ΔE00 19,3);
  `--positive` 6,00 and `--destructive` 5,78 on the darkest stripe of the ground (6,19 / 7,19 / 6,10 positive on
  background / card / muted); `--foreground` 12,05 / 14,00 / 11,88 and **`--muted-foreground` 8,68 / 10,08 / 8,55** on
  background / card / muted (8,41 on the darkest stripe); eyebrow 6,50 on the card, 5,59 on the background, 5,51 on
  muted, 5,42 on the darkest stripe; ornament 3,43 on the card (2,95 / 2,86 / 3,00 on the three stripes: decorative, the
  ≥ 3:1 guide is on the card).
- **Egeo dark** — closest pair 17,1 (Criptovalute–Immobili; Liquidità–Carry 17,6); slot L 0,58–0,80; slots on the card
  5,80 7,43 5,10 8,69 4,88 5,34 7,93 7,70 3,69; COMPRA / VENDI / OK 8,53 / 8,21 / 9,15 on the card; `--chart-3` 30° from
  `--destructive` (ΔE00 19,1); `--positive` 8,50 and `--destructive` 6,96 on the ground; `--muted-foreground` 8,64 /
  7,69 / 6,59; eyebrow 8,75 on the card; ornament 6,56 on the card.
- **`--muted-foreground` light is 0.36, not the mock's 0.42** (2026-11-22): the ring-fold gate (ΔE00 ≥ 14 from every
  slot, the fold's ink) read Azioni at 11,8 and Previdenza at 12,5 with the mock's ink. The owner chose the darker ink
  (worst slot now 15,0) over moving two slots of the approved mock; tint and hue unchanged.
- **Egeo's own sign tokens**: light `--positive` `oklch(0.43 0.11 145)` in the palette block (the inherited green read
  4,38:1 on the darkest stripe); the dark block writes the `.dark` value, because `[data-theme="egeo"]` has the
  specificity of `.dark` and comes later (a light-block token reaches dark by source order).
- **COMPRA keeps ≥ 30° of hue from `--destructive`**: `--chart-3` is the mock's crypto colour re-pitched from hue 40
  to 60 (`0.52 0.10 60` light, `0.66 0.13 60` dark), so a «compra» chip never wears the red of a loss.
- **Four slots re-pitched from the mock for the gates**: Azioni light C 0.12 → 0.107 (gamut), Immobili light
  `0.68 0.14` → `0.64 0.13` (card contrast), Materie Prime light L 0.60 → 0.54, Trend Following light L 0.56 → 0.60.

- **Orbita light** (2026-11-22) — closest slot pair ΔE00 15,9 (Azioni–Trend Following; Materie Prime–Previdenza 17,6); slot L 0,46–0,66, hue drift 0° on all nine; slots on the card 5,21 3,62 5,52 3,09 7,00 4,47 3,52 4,20 6,65; COMPRA / VENDI / OK as text on the card 7,15 / 7,64 / 6,32, on the 8% chip 6,33 / 6,72 / 5,61; `--chart-3` 32° from `--destructive` (ΔE00 19,4); `--positive` (inherited) 4,96 and `--destructive` 5,34 on the page, `--positive` 5,49 on the card and 4,54 on muted; `--muted-foreground` 6,52 / 7,21 / 5,96 and `--foreground` 14,06 / 15,55 / 12,85 on background / card / muted; primary-foreground on primary 6,23, `--destructive` on the card 5,90, the AI accent on the card 4,99; eyebrow 6,05 / 5,46 / 5,00 on card / background / muted; ornament 6,24 on the card, the border over the card 1,59 (non-text, decorative).
- **Orbita dark** — closest pair 17,4 (Materie Prime–Previdenza; Criptovalute–Immobili 17,6; Immobili–Materie Prime 18,9); slot L 0,52–0,80; slots on the card 7,15 9,15 5,30 9,69 5,50 7,01 3,40 7,39 4,89; COMPRA / VENDI / OK 9,60 / 8,81 / 10,49 on the card, 8,49 / 7,78 / 9,11 on the chip; `--chart-3` 30° from `--destructive` (ΔE00 20,1); `--positive` 7,95 and `--destructive` 6,48 on the nebula at its fullest; `--muted-foreground` 10,13 / 9,30 / 8,06 and `--foreground` 16,93 / 15,55 / 13,48; primary-foreground on primary 10,07, `--destructive` on the card 6,94, the AI accent 5,23; eyebrow 9,71 / 10,57 / 8,41; `--foreground`, `--muted-foreground` and the eyebrow on the nebula 14,53 / 8,69 / 9,07; ornament 9,58, border 1,75.
- **Two values the gates moved from the approved mock** (2026-11-22, owner): the ring-fold gate (ΔE00 ≥ 14 from `--muted-foreground`, not in the spec's table) read light Trend Following `0.38 0.06 240` at 8,0 and dark Azioni at 13,8 with the mock's ink `0.75 0.035 235`. No light ink can fix it (it would have to sit at L ≤ 0,22, darker than the foreground), so light `--chart-7` is `0.62 0.03 240` (min ΔE00 15,9 to the other slots, 19,3 to the fold, 3,52:1 on the card), and dark `--muted-foreground` is `0.78 0.035 235` (tint and hue unchanged, worst slot 14,8). Run the four gates, ring-fold included, before trusting a mock's palette.
- **The shell on `--sidebar`** (2026-11-22; `themeCostumeContrast` K4, K5) — Egeo light / Egeo dark / Orbita
  light / Orbita dark: a sidebar label before, `--sidebar-foreground` at 60 %, 3,93 / 6,28 / 4,12 / 6,31; after, the
  eyebrow, 5,95 / 9,82 / 5,46 / 10,57; an inactive pill label before, at 55 %, 3,41 / 5,45 / 3,56 / 5,43; after,
  `--muted-foreground`, 9,22 / 8,64 / 6,52 / 10,13 (Orbita dark measured on the ink the Orbita gates moved to `0.78`,
  above; 9,11 on the mock's); `--positive` on `--muted` 6,10 / 6,49 / 4,54 / 7,38; the dark ON track, `--primary` on
  `--card`, 8,75 (Egeo) / 9,58 (Orbita), the thumb `--background` on it 9,83 / 10,44.
- **The banner's ink and the AI accent** (2026-11-23; `themeCostumeContrast` K6, K7; alpha composited in sRGB over
  the card):

  | Theme · mode | `--warning-foreground`, worst surface | AI accent on `--card` | on the generated fill | on `bg-muted/40` |
  | --- | --- | --- | --- | --- |
  | Egeo light | 5,44 (stripe) | 4,78 | 4,78 (card) | 4,48 |
  | Egeo dark | 8,98 (muted) | 4,65 | 4,65 (card) | 4,39 |
  | Orbita light | 5,63 (muted) | 4,99 | 4,63 | 4,63 |
  | Orbita dark | 10,21 (muted) | 5,23 | 4,97 | 4,97 |

  `--warning-foreground` on `--warning` (the banner's fill; the two themes share the trio): 6,72 light, 9,94 dark.
  No AI text lands on plain `--muted` (4,05 / 3,99 / 4,13 / 4,53): every `AI_GENERATED_EYEBROW_CLASS` use sits on
  the card or on a generated sub-tile.
- **Orbita's `--chart-3` is the mock's Criptovalute re-pitched to hue 60** (`0.52 0.10 60` light, `0.64 0.13 60` dark), 30° from `--destructive`; `--chart-4` Immobili is the gold, `--chart-5` Liquidità the violet; Azioni light C 0.098, Immobili light `0.66 0.13 75`, `--primary` light C 0.10 and the eyebrow light C 0.115 are the mock's values pulled into the sRGB gamut. A figure a spec writes as «−1.200,00 €» is «−1200,00 €» in the app: `Intl` (it-IT) groups from five digits.

## The browser's chrome follows the page (2026-10-17)

- **`<html>` carries the background and the `color-scheme`, `<meta name="theme-color">` the resolved colour**
  (owner, 2026-10-17: with dark mode following the system, Chrome for Android painted the bar under the app white at
  times). Three pieces, one rule: `app/globals.css` gives `html` `bg-background` and `color-scheme: light`, `html.dark`
  `color-scheme: dark` — the overscroll canvas, the area under a collapsed toolbar, scrollbars and native controls
  follow the mode next-themes puts on `<html>`; `app/layout.tsx` ships the default theme's two backgrounds as a
  `prefers-color-scheme` pair (`viewport.themeColor`, `DEFAULT_THEME_COLORS` in `lib/utils/themeColor.ts`, held equal to
  `oklch(1 0 0)` / `oklch(0.145 0 0)` by `__tests__/themeColor.test.ts`), right before any script runs for the default
  theme in system mode; `ThemeColorSync` (`components/providers`, mounted under `ColorThemeProvider` in the root layout)
  rewrites every meta from the RESOLVED `--background` on each change of the colour theme or of `resolvedTheme`, with
  this guide's timing (`useEffect` + `requestAnimationFrame`, never a read during render) and through `colorToHex`,
  the one route from a served token to `#rrggbb`. A retuned default theme fails the test; a new theme needs nothing —
  its background is read live. `e2e/shellBoot.ts` → `expectBrowserChromeFollowsTheme` holds the metas equal to
  `<html>`'s painted background and the `color-scheme` to the mode, at 1440 and 390 (seen red the same day with
  `bg-background` taken off `html`: the root painted `#000000` under a white body); the probe reads the colour as a
  PIXEL painted on a canvas, because `getComputedStyle` serves `lab(100 0 0)` and the canvas `fillStyle` getter keeps
  that form. The bars themselves are outside the page — the owner looks at them on the phone; the dark branch runs
  only on a stored dark mode, which no fixture holds.

## Per-page blind spots

- **The AI accent reads under 4.5:1 as TEXT on the card in five theme blocks** (measured 2026-11-06 with the Impeccable
  detector, the figures of DESIGN.md → The AI-Accent Rule): `oklch(0.56 0.2 305)` on the light blocks (the value DESIGN.md declares and `app/globals.css` serves in `:root` since 2026-11-07; before, 0.65 in both modes
  until the Consulente's redesign) and `oklch(0.65 0.2 305)` on the dark ones, on `--card` — Retro Arcade light 4.19:1 and dark 3.68:1, Solar Dusk dark
  4.34:1, Elegant Luxury dark 4.31:1, Midnight Bloom dark 3.58:1; every block clears 3:1 as a border. The accent is one
  value per mode by the owner's choice of 2026-11-01, so an AI eyebrow reads under AA there; Midnight
  Bloom's `--primary` (hue 283) also sits 22° from the accent, Cyberpunk's (341) 36°. The fix is a per-theme
  `--ai-accent`, a decision on those themes' look.
- **The AI accent on a `bg-muted/40` sub-tile over the card would read 4,48:1 in Egeo light and 4,39:1 in Egeo dark**:
  cured on 2026-11-23 by moving the FILL, not the accent — Egeo's generated sub-tiles sit on `--card`
  (`--costume-page-generated-fill`, § Il costume); there is still ONE `--ai-accent` per mode, no per-theme accent.
  A new generated sub-tile that paints `bg-muted/40` by hand instead of `COSTUME_GENERATED_FILL_CLASS` reopens it.
- **The default theme's quiet shell labels read 4,35:1** (2026-11-22): the inactive bottom-pill labels,
  `text-sidebar-foreground/55`, on `--sidebar` in default light. `.costume-shell-quiet` lifts them to `--muted-foreground`
  in a costume theme only: a palette theme renders as before by contract, and a palette contrast fix is a decision on
  that theme's look, not a costume rule. The toaster (`app/layout.tsx`, outside the dashboard layout) and the
  landing's `ThemePicker` are out of the scope too: palette only, by the owner's rule of 2026-11-12.
- **What the dialogs' pass left round or untouched, on purpose** (2026-11-23): the dots, the drag handles, the
  avatars and the spinners of the listed files (`ONE_ROUND_THING`), the Consulente run's progress dot, the
  sidebar's own menu badge and the Storybook stories; the emails, the PDF export, the landing and the access pages
  wear no costume (the browser's print of the book is reset instead).
- **Retro-arcade dark prints its `--foreground` on a pill at 4,02:1** (2026-10-08): the theme's foreground is a light
  teal (L 0.70) and the pill (`--muted`) now sits at L 0.36 — lowering it further would make it indistinguishable from
  the card (L 0.31). Only `--muted-foreground` is held to the floor on `--muted` (`mutedForegroundContrast`); an active
  pill label in that theme is the one place a foreground reads under AA, and the fix is a lighter foreground for the
  whole theme, a decision on its look rather than a token.

- **The chart slots are measured for DISTANCE, not for every surface they land on** (2026-09-20): ΔE00 ≥ 14 and the luminance guard hold on all sixteen blocks, and the re-pitched slots were searched at ≥ 3:1 against their card — but that contrast is NOT asserted by the suite, the default theme's two slots under 3:1 (next entry) are untouched, and a colour-blind reader is not modelled: a composition is never readable by colour alone, which is why every band is also a named row.
- **Two DEFAULT-theme chart slots and the row focus ring sit under 3:1 as non-text signals** (measured 2026-09-18 on a
  card, re-derived by hand): `--chart-3` light `#da8b00` on white 2,74:1, `--chart-1` dark `#1447e6` on `#171717` 2,62:1,
  `ring-ring` `#a1a1a1` on white 2,58:1 — against AGENTS.md's «worst case 3.38:1». Theme tokens: a `doc/guide/temi.md` session. (moved from `CLAUDE.md` → Known Issues on 2026-09-19)
  **Where a slot is printed as TEXT the floor is 4,5:1 and it is now enforced**: `useActionColors` clamps
  COMPRA/VENDI/OK into a measured lightness band before they reach a chip label, a plan amount or a gap column
  (`lib/utils/actionColor.ts`, all sixteen blocks held by `__tests__/actionColorContrast.test.ts`, 2026-09-21). The
  entry above is about a slot used as a NON-text signal, which is a different floor and is still open.
- **Index 9 of `useChartColors()` is still the static lime** (`CHART_COLORS[9]`): no surface uses it. Indices 0-7 are theme-aware since 2026-08-30, index 8 (`--chart-9`, Previdenza) since 2026-09-20.
- **Sign-colour CHIPS sit below AA, structurally** (`bg-positive/10 text-positive` washes the background with the text's hue: 15 of 24 combinations at 3.34–4.40:1; deliberately not fixed). `MonthlyReturnsHeatmap` fills its cells with the sign tokens at 30/55/85% (the figure is never printed in the cell, so the AA text floor does not apply). (moved from `CLAUDE.md` → Known Issues on 2026-09-19)
- **Una tinta del chrome viola la Zero-Chroma Rule** (`switch.tsx` ON blu in dark — a costume theme paints it `--primary` (`--costume-control-switch-on`); lo spinner di `ProtectedRoute` è sparito il 2026-09-28 con la shell prima dell'auth, l'attesa è lo skeleton a tessere; la mask-icon smeraldo è stata rimossa il 2026-09-13; il `text-emerald-*` di `ExpenseTable` è passato a `text-positive` il 2026-09-14); gli altri ~100 hex DOM-side sono eccezioni dichiarate in DESIGN.md → The DOM-side hex inventory. (moved from `CLAUDE.md` → Known Issues on 2026-09-19)
