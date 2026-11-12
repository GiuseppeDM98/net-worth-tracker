# NOVE-12 — The «Egeo» theme: marble, sea and gold

> Series `doc/nove/` (README.md § 5): **depends on NOVE-11** (the costume contract, NOVE-11 § 4.3, used here with
> its names and nothing added); **NOVE-19 and NOVE-20 are implemented after it** and carry Egeo onto every page and
> dialog. Written on 2026-11-12; every `file:line` is cited on `develop` @ b841cbd7. Executes the owner's point 1,
> decisions 3 and 17 and the adopted choice (a) (README.md § 3-4), from the approved mock `Egeo-C.dc.html`
> (direction C «Polis»; A and B rejected).

## 1. The problem today (evidence on the code)

| # | Site (file:line @ b841cbd7) | What it shows |
| --- | --- | --- |
| 1 | `lib/constants/colorTheme.ts:15-22` | six themes, none with a costume; after NOVE-11 `COLOR_THEME_META` has six entries, all `costume: null` |
| 2 | `app/globals.css:302-739` | no block for a seventh theme; the costume rule set (NOVE-11 § 4.3) is inert while no theme sets `data-costume` |
| 3 | `app/layout.tsx:25`, `:39-61` | two fonts, Geist and Geist Mono; no engraved face for the headings |
| 4 | `lib/constants/themeCostume.ts` (NOVE-11) | `THEME_EMBLEMS = {}`: no emblem to draw |
| 5 | the mock `Egeo-C.dc.html` | five chart colours in the dark half, eight in the light: the app has nine slots (`--chart-1..9`, `app/globals.css:108-116`) and the mock's order is not the app's (§ 3) |
| 6 | the mock's `--primary` light `0.45 0.11 240` | outside sRGB (max chroma at that L and hue: 0.103): the browser would clip it |

## 2. Goal and acceptance criteria

A seventh theme, «Egeo», wears direction C inside the dashboard and its dialogs: a marble ground, gold cap lines,
4px tiles, Marcellus on the verdict and the labels, a dentil frieze under the header, a temple beside the page's name;
outside the dashboard it is its palette only. Every figure stays Geist Mono.

1. Impostazioni › Aspetto shows a seventh swatch, «Colore 7 di 7: Egeo», described «Marmo, mare e oro»; choosing
   it puts `data-theme="egeo"` and `data-costume` on `<html>` and persists like any theme. **Proof**:
   `AspettoTab.test.tsx` (R1 of NOVE-11, now seven), `colorTheme.test.ts` C3; E1.
2. The four gate tests measure Egeo in both modes and pass with the numbers of § 4.4. **Proof**: the four files
   green; the mutation of § 6 turns `chartPaletteDistinctness` red.
3. Every costume token printed as text reads ≥ 4,5:1 on the surfaces it lands on; the ornament ≥ 3:1 on a tile.
   **Proof**: `__tests__/themeCostumeContrast.test.ts` (new, generic over `COSTUME_THEMES`).
4. On `/dashboard` at 1440 with Egeo light: `#page-main`'s `background-image` is a `repeating-linear-gradient`; the
   first tile's `border-top-left-radius` is `4px`; its `background-image` is a `linear-gradient`; the verdict `h2`'s
   `font-family` starts with `Marcellus` and its `font-size` is `34px`; a `.costume-figure` inside it is `Geist Mono`;
   a `.costume-header-band` of height `7px` follows the header; one `svg[aria-hidden="true"]` sits before the label.
   **Proof**: `e2e/theme.egeo.spec.ts` (E1).
5. At 390 the same page has the ground, the cap, the frieze and an 18px emblem beside the mobile title; the headline
   is Marcellus at 24px. **Proof**: `e2e/theme.egeo.mobile.spec.ts` (E2).
6. With Egeo on `/` and `/login`: no `.costume-header-band`, no emblem, the headings in Geist, the palette applied.
   **Proof**: E1, last case.
7. Marcellus is fetched only where it paints: on `/dashboard` with the default theme and on `/login` with Egeo every
   `document.fonts` face of family `Marcellus` is `unloaded`; on `/dashboard` with Egeo one is `loaded`.
   **Proof**: E1.
8. The twelve existing blocks still render as their baseline. **Proof**: `e2e/theme.neutral{,.mobile}.spec.ts`
   (NOVE-11 E1), unchanged and green.
9. `perf:budget` does not move (no JS is added beyond ~0,2 KB of registry data); `mobile:budget` does not move (the
   census reads the default theme). **Proof**: the two runs.

## 3. Decisions

- **Owner (2026-11-12)**: 3 (Egeo is direction C «Polis»: colour, ground, frame, Marcellus for verdict and labels,
  the dentil frieze, a gold cap line per tile, emblems), 17 (the costume only inside the dashboard and its dialogs),
  (a) (the name is ours; no game's name or asset).
- **Adopted, reversible**:
  - id `egeo`, name «Egeo», description «Marmo, mare e oro»; seventh in `COLOR_THEMES`;
  - the mock's colour per asset class is kept, not its order: `--chart-3` Criptovalute = the mock's c5, `--chart-4`
    Immobili = the mock's gold c3, `--chart-5` Liquidità = the mock's violet c4 (the app's slots: 1 Azioni,
    2 Obbligazioni, 3 Criptovalute, 4 Immobili, 5 Liquidità, 6 Materie Prime, 7 Trend Following, 8 Carry,
    9 Previdenza);
  - the slots the mock lacks (dark 6-9, light 9) are derived on the same hues; four values re-pitched for the gates:
    Azioni light C 0.12 → 0.108 (gamut), Immobili light 0.68 0.14 → 0.64 0.13 (2,73:1 on the card → 3,18:1),
    Materie Prime light L 0.60 → 0.54, Trend Following light L 0.56 → 0.60 (the closest pair);
  - `--primary` light C 0.11 → 0.10 (gamut, row 6);
  - `--positive` is not declared (inherited, 5,26:1 light, 7,57:1 dark on the card); the mock's «neg» is
    `--destructive`; the warning trio is the default's;
  - `--accent`, `--sidebar*` (the mock has none): derived from the ground's hue, § 4.3;
  - the cap line is a 4px layer: the tile's 1px border covers the top pixel, 3px show, as in the mock;
  - the eyebrow weight is 400 (Marcellus has no other; `font-synthesis: none`), the headline 400 at 34px only at
    ≥ 1440, 24px below (the page-verdict's own size);
  - the dark ground is plain (`var(--background)`), as in the mock;
  - one emblem (the temple) for every page: per-page emblems are the heirs' (§ 10).

## 4. Solution

### 4.1 Registry — `lib/constants/colorTheme.ts` and `lib/constants/themeCostume.ts`

`COLOR_THEMES` gains `'egeo'` after `'retro-arcade'`. `COLOR_THEME_META` gains
`egeo: { name: 'Egeo', description: 'Marmo, mare e oro', costume: { ornaments: ['header-band'], resourceBar: false } }`.
In `themeCostume.ts`:

```ts
/** A pediment on four columns: the Egeo costume's mark (decorative, DESIGN.md → The Costume Rule). */
const EGEO_TEMPLE: EmblemArt = {
  viewBox: '0 0 22 22',
  shapes: [{ kind: 'path', d: 'M2 8 L11 2 L20 8 M4 8 V18 M8 8 V18 M14 8 V18 M18 8 V18 M2 20 H20', tone: 'ornament',
    strokeWidth: 1.6 }],
};

export const THEME_EMBLEMS: Partial<Record<ColorTheme, ThemeEmblems>> = {
  egeo: { fallback: EGEO_TEMPLE, pages: {} },
};
```

### 4.2 The font — `app/layout.tsx`

```ts
// The Egeo costume's heading face (OFL, Astigmatic): only `--costume-heading-font` names it, so the file is fetched
// only when a heading paints with it — never for the other themes, never outside the dashboard (doc/guide/temi.md
// § Il costume).
const marcellus = Marcellus({ weight: '400', subsets: ['latin'], variable: '--font-marcellus', preload: false });
```

`import { Geist, Geist_Mono, Marcellus } from "next/font/google";` and `${marcellus.variable}` joins the `<html>`
className of NOVE-11 § 4.1. Effect: `@font-face` rules (~0,3 KB gz) in the root CSS of every route, no JS; the woff2
(latin, ~25 KB) is requested only by a painting heading. Licence: SIL Open Font License 1.1, self-hosted by next/font
at build time (no request to Google at runtime); the OFL needs no notice in the UI.

### 4.3 The CSS — `app/globals.css`, four blocks after `:739`, before the «Theme costume» section

```css
/* Egeo — marble, sea and gold (costume theme: DESIGN.md → The Costume Rule) */
[data-theme="egeo"] {
  --radius: 0.3125rem;
  --background: oklch(0.925 0.035 85);
  --foreground: oklch(0.27 0.045 250);
  --card: oklch(0.975 0.012 90);
  --card-foreground: oklch(0.27 0.045 250);
  --popover: oklch(0.975 0.012 90);
  --popover-foreground: oklch(0.27 0.045 250);
  --primary: oklch(0.45 0.10 240);
  --primary-foreground: oklch(0.98 0.012 90);
  --secondary: oklch(0.92 0.025 88);
  --secondary-foreground: oklch(0.27 0.045 250);
  --muted: oklch(0.92 0.025 88);
  --muted-foreground: oklch(0.42 0.035 250);
  --accent: oklch(0.895 0.04 85);
  --accent-foreground: oklch(0.27 0.045 250);
  --destructive: oklch(0.47 0.17 28);
  --warning: oklch(0.986 0.022 90);
  --warning-foreground: oklch(0.468 0.098 75);
  --warning-border: oklch(0.855 0.062 85);
  --border: oklch(0.78 0.05 80);
  --input: oklch(0.78 0.05 80);
  --ring: oklch(0.45 0.10 240);
  --chart-1: oklch(0.47 0.108 240);
  --chart-2: oklch(0.55 0.11 140);
  --chart-3: oklch(0.56 0.15 40);
  --chart-4: oklch(0.64 0.13 80);
  --chart-5: oklch(0.42 0.14 330);
  --chart-6: oklch(0.54 0.11 105);
  --chart-7: oklch(0.60 0.09 200);
  --chart-8: oklch(0.54 0.16 0);
  --chart-9: oklch(0.50 0.13 285);
  --sidebar: oklch(0.945 0.025 87);
  --sidebar-foreground: oklch(0.27 0.045 250);
  --sidebar-primary: oklch(0.45 0.10 240);
  --sidebar-primary-foreground: oklch(0.98 0.012 90);
  --sidebar-accent: oklch(0.885 0.04 85);
  --sidebar-accent-foreground: oklch(0.27 0.045 250);
  --sidebar-border: oklch(0.78 0.05 80);
  --sidebar-ring: oklch(0.45 0.10 240);
}

.dark[data-theme="egeo"] {
  --background: oklch(0.19 0.035 250);
  --foreground: oklch(0.95 0.015 85);
  --card: oklch(0.24 0.04 250);
  --card-foreground: oklch(0.95 0.015 85);
  --popover: oklch(0.24 0.04 250);
  --popover-foreground: oklch(0.95 0.015 85);
  --primary: oklch(0.80 0.11 85);
  --primary-foreground: oklch(0.22 0.04 250);
  --secondary: oklch(0.29 0.04 250);
  --secondary-foreground: oklch(0.95 0.015 85);
  --muted: oklch(0.29 0.04 250);
  --muted-foreground: oklch(0.76 0.03 240);
  --accent: oklch(0.32 0.045 250);
  --accent-foreground: oklch(0.95 0.015 85);
  --destructive: oklch(0.72 0.16 30);
  --warning: oklch(0.260 0.038 78);
  --warning-foreground: oklch(0.854 0.090 82);
  --warning-border: oklch(0.460 0.085 75);
  --border: oklch(0.45 0.06 80);
  --input: oklch(0.45 0.06 80);
  --ring: oklch(0.80 0.11 85);
  --chart-1: oklch(0.68 0.13 240);
  --chart-2: oklch(0.74 0.12 140);
  --chart-3: oklch(0.70 0.15 40);
  --chart-4: oklch(0.80 0.13 80);
  --chart-5: oklch(0.66 0.16 330);
  --chart-6: oklch(0.66 0.10 105);
  --chart-7: oklch(0.76 0.09 200);
  --chart-8: oklch(0.78 0.14 0);
  --chart-9: oklch(0.58 0.13 285);
  --sidebar: oklch(0.19 0.035 250);
  --sidebar-foreground: oklch(0.95 0.015 85);
  --sidebar-primary: oklch(0.80 0.11 85);
  --sidebar-primary-foreground: oklch(0.22 0.04 250);
  --sidebar-accent: oklch(0.32 0.045 250);
  --sidebar-accent-foreground: oklch(0.95 0.015 85);
  --sidebar-border: oklch(0.45 0.06 80);
  --sidebar-ring: oklch(0.80 0.11 85);
}

/* The Egeo costume, worn only inside the dashboard and its dialogs. */
[data-theme="egeo"] [data-costume-scope] {
  --radius: 0.3125rem;
  --radius-2xl: 0.25rem;
  --costume-ground: repeating-linear-gradient(92deg, oklch(0.925 0.035 85) 0 3px, oklch(0.915 0.038 82) 3px 4px,
    oklch(0.93 0.033 88) 4px 9px);
  --costume-ornament: oklch(0.62 0.11 80);
  --costume-tile-image: linear-gradient(var(--costume-ornament), var(--costume-ornament));
  --costume-tile-image-position: left top;
  /* 4px: the tile's 1px border covers the top one, the cap shows 3px. */
  --costume-tile-image-size: 100% 4px;
  --costume-tile-shadow: none;
  --costume-heading-font: var(--font-marcellus), var(--font-geist-sans), system-ui, sans-serif;
  --costume-heading-weight: 400;
  --costume-heading-tracking: 0.01em;
  --costume-heading-case: none;
  --costume-heading-size: 34px;
  --costume-eyebrow-color: oklch(0.47 0.10 70);
  --costume-eyebrow-weight: 400;
  --costume-header-band: repeating-linear-gradient(90deg, var(--costume-ornament) 0 9px, transparent 9px 15px);
  --costume-header-band-height: 7px;
  --costume-primary-glow: none;
}

.dark[data-theme="egeo"] [data-costume-scope] {
  --costume-ground: var(--background);
  --costume-ornament: oklch(0.72 0.11 82);
  --costume-eyebrow-color: oklch(0.80 0.09 82);
}
```

The light scope block holds all 18 `COSTUME_SCOPE_PROPERTIES` in their order (NOVE-11 T3 turns binding here).

### 4.4 The measured numbers (computed with the gates' formulas; the tests re-measure them)

| Gate | Light | Dark |
| --- | --- | --- |
| closest ΔE00 between the nine slots (≥ 14) | 16,7 Immobili–Materie Prime; 17,1 Azioni–Previdenza | 17,6 Liquidità–Carry; 17,7 Obbligazioni–Materie Prime |
| slot L band (≤ 0,82 light, ≥ 0,30 dark) · hue drift between modes | 0,42-0,64 · 0° on all nine | 0,58-0,80 · 0° |
| slot on the card (guide ≥ 3:1), slots 1-9 | 6,26 4,32 4,62 3,18 8,51 4,66 3,53 5,15 5,83 | 5,80 7,43 5,81 8,69 4,88 5,34 7,93 7,70 3,69 |
| COMPRA / VENDI / OK, text on card · on the 8% chip (≥ 4,5) | 7,10·6,24 / 8,51·7,45 / 6,34·5,66 | 7,89·6,92 / 8,21·7,13 / 9,15·7,79 |
| `--muted-foreground` on background · card · muted (≥ 4,5) | 6,76 · 7,85 · 6,66 | 8,64 · 7,69 · 6,59 |
| `--foreground` on background · card · muted | 12,05 · 14,00 · 11,88 | 15,95 · 14,20 · 12,17 |
| primary-fg on primary · destructive on card · AI accent on card | 6,93 · 6,94 · 4,78 | 9,21 · 6,19 · 4,65 |
| eyebrow on card · background · muted · darkest stripe | 6,50 · 5,59 · 5,51 · 5,42 | 8,75 · 9,82 · 7,50 · — |
| foreground · muted-fg on the darkest stripe (0.915 0.038 82) | 11,68 · 6,55 | — |
| ornament on card · on the ground (decorative, guide ≥ 3:1 on the card) | 3,43 · 2,95 | 6,56 · 7,37 |

Every slot is inside sRGB, so the served `#rrggbb` keeps the luminance band (`chartColorsContext`). Previdenza
(`--chart-9`, hue 285) sits 45° from the nearest chromatic slot.

### 4.5 Strings

«Egeo», «Marmo, mare e oro» (the swatch's name and line). No other UI string.

## 5. Constraints and traps (AGENTS.md / DESIGN.md rules, «here it means that»)

- **The Costume Rule (NOVE-11 § 4.8)**: the frieze and the temple are `aria-hidden`, carry no meaning, sit under no
  text; nothing moves — no reduced-motion branch is needed.
- **The Mono Mandate**: Marcellus has digits; here it means every figure in a headline or an eyebrow stays inside a
  `.costume-figure` (NOVE-11's `HeadingText`), and no Egeo rule sets a `font-family` on anything else.
- **The Data Owns Color Rule**: the gold is ornament and Immobili at once; here it means the ornament is
  `--costume-ornament` (0.62 0.11 80) and the slot `--chart-4` (0.64 0.13 80), two tokens, never one read for the other.
- **The token you author is not the token the browser returns**: the E2E compares computed strings (`rgb(…)`,
  `Marcellus, …`), never an authored `oklch(`.
- **The census reads the default theme**: here it means Egeo moves no `mobile:budget` entry; the guided check at 390
  is the browser's, not the budget's.
- **A brand-new custom property reads `''` on a running dev server**: delete `.next/dev` before doubting the CSS.
- **`isColorTheme` guards every read**: a stored `egeo` on a client built before this change reads as the default.

## 6. Tests per level (with the mutation that proves each)

| # | Test | Mutation that turns it red |
| --- | --- | --- |
| G1 | the four gate tests, now on fourteen blocks (derived, NOVE-11 § 4.5) | `--chart-6` light set to `--chart-4`'s `0.64 0.13 80`: ΔE00 0 |
| T3 | `themeCostume.test.ts`: Egeo's light scope block declares the 18 properties | delete `--costume-heading-size` |
| K1 | `themeCostumeContrast.test.ts` (new, `describe.each` over `COSTUME_THEMES` × light/dark): `--costume-eyebrow-color` ≥ 4,5 on `--card`, `--background`, `--muted`; `--foreground` and `--muted-foreground` ≥ 4,5 on every opaque `oklch()` in `--costume-ground` (a `var()` ground is its block's `--background`); `--costume-ornament` ≥ 3 on `--card`. Its own oklch → sRGB code, as the sibling gate tests | eyebrow `oklch(0.62 0.11 80)`: 3,43 on the card |
| C3 | `colorTheme.test.ts`: the shipped script with `color-theme = egeo` sets `data-theme` and `data-costume`; with `cyberpunk` only `data-theme` | drop `egeo`'s costume in the registry |
| R4 | `CostumeScope.test.tsx`: with `egeo` stored, `PageHeader label="Panoramica"` inside `CostumeScope` renders one `svg[aria-hidden="true"]` whose `path` has the temple's `d`, and one `.costume-header-band`; outside it, neither | `ThemeHeaderBand` ignores `ornaments` |
| E1 | `e2e/theme.egeo.spec.ts` (desktop, emulators, `color-theme = egeo` by `addInitScript`): criterion 4 on `/dashboard` light and dark (the dark ground `background-image: none`), criterion 6 on `/` and `/login`, criterion 7 (`[...document.fonts].filter(f => f.family === 'Marcellus')` statuses) | `var(--font-marcellus)` first in `@theme inline`'s `--font-sans`: a face `loaded` with the default theme |
| E2 | `e2e/theme.egeo.mobile.spec.ts` (390): criterion 5; no horizontal overflow (`scrollWidth ≤ innerWidth`) | `--costume-header-band-height: 0px` |
| E3 | `e2e/theme.neutral{,.mobile}.spec.ts` (NOVE-11) unchanged | a token of `:root` edited |

## 7. Guided verification (WORKFLOW.md § 2)

Expected outcome, declared first: in Egeo the dashboard reads as marble and sea — beige stripes behind the page
(plain navy in dark), white-marble tiles with a gold rim and 4px corners, the verdict and the labels in an engraved
face while every number stays in the mono, a gold dentil frieze under the header, a small temple beside the page's
name; the landing and the access pages show only the colours; the other six themes are unchanged.

- **A**: `tsc`, lint, Vitest (three zones), E1-E3, `npx playwright test e2e/shell.boot`.
- **B**: emulators + seed, the decoys «ornitorinco» and «fenicottero» seeded as an asset and a category: in Egeo the
  two names read in Marcellus inside an eyebrow only where an eyebrow prints them, never inside a table cell.
- **C (browser, the session)**: Panoramica, Patrimonio, Cashflow › Tracciamento, Storico, a «Nuova Spesa» dialog,
  Impostazioni › Aspetto; light and dark; 1440, 1024×768, 768×1024, 390; screenshots in the scratchpad.
- **D (data)**: `document.querySelectorAll('[data-costume-scope]').length` is 1 on a page, 2 with a dialog open;
  `getComputedStyle(h2).fontFamily` and a `.costume-figure`'s `fontFamily` read on Panoramica.
- **E**: a headline with a negative figure («−1.200 €») keeps the minus in the mono; a verdict without figures is
  all Marcellus; switching Egeo → Default from Aspetto removes ground, frieze and emblem without a reload.
- **F (owner, at his «pronto»)**: the mirror in Egeo light and dark on his own screens.
- **G**: `perf:budget`, `mobile:census` + `mobile:budget` (expected unchanged); remove decoys, fixtures, the mirror.

## 8. Putting it into service

One PR to `develop`, after NOVE-11's. No data change: the choice lives where every theme's does (`localStorage` and
the user preference `colorTheme`). Rolling back = removing `'egeo'` from the registry: a reader who chose it falls
back to the default through `isColorTheme`.

## 9. Documentation

- `doc/guide/temi.md`: the theme table gains «Egeo — costume theme (Marcellus, frieze, temple)»; § Il costume names
  Egeo as the first costume; the measured numbers of § 4.4 as the theme's line in § Per-theme measures.
- `DESIGN.md:144-145` BEFORE: «the five named # themes set r to 0.25 / 0.5 / 0.3 / 0.375 / 0.5rem». AFTER: «the
  named # themes set r to 0.25 / 0.5 / 0.3 / 0.375 / 0.5rem, Egeo to 0.3125rem with a 4px `2xl` in the dashboard».
- `README.md` (what the user sees): the themes list gains Egeo. `CLAUDE.md` «Themes»: twelve → fourteen theme
  blocks, the costume named. `Draft Release Temp.md`; `doc/nove/README.md` § 6.

## 10. Declared out of scope

- **Every page and dialog beyond NOVE-11's primitives** — per-page emblems, the modal's frame and title, popovers,
  selects, sheets and the sidebar in scope, the Consulente's and the Compravendita's own cards, the Sankey's hexes
  (`lib/utils/cashflowSankey.ts`), `components/ui/switch.tsx:14`,
  `components/performance/UnderwaterDrawdownChart.tsx:102-109`, `components/ui/sidebar.tsx:493`: heirs NOVE-19
  (Panoramica, Patrimonio, Cashflow) and NOVE-20 (the rest and the dialogs), in Egeo as in every theme.
- **Orbita**: heir NOVE-13. **Emails, PDF, landing, access pages in costume**: none, declared (decision 17).

## 11. The prompt that implements it

```
Ciao, in questa sessione vorrei implementare la spec doc/nove/NOVE-12-tema-egeo.md

Contesto, prima di toccare qualsiasi file (le regole del repo cambiano il modo di lavorare):
- Leggi WORKFLOW.md (regole di sessione e di collaudo; l'ultima sezione dice come si
  applicano in questo repo)
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- CLAUDE.md (l'indice: che cos'è e dove sta ogni cosa, lo stato corrente) è già nel
  contesto: usalo per trovare la guida giusta
- Leggi la spec doc/nove/NOVE-12-tema-egeo.md e l'indice della serie
  doc/nove/README.md (§ 3 decisioni, § 4 scelte adottate, § 7 contratti condivisi, § 8 regole)
- Leggi doc/guide/temi.md (§ Il costume), shell.md, dialog.md, e2e-playwright.md,
  velocita.md PRIMA di scrivere codice
- Leggi DESIGN.md (The Costume Rule, The Mono Mandate, The Data Owns Color Rule,
  The AI-Accent Rule) e PRODUCT.md
- Leggi COMMENTS.md e DEVELOPMENT_GUIDELINES.md: il codice che scrivi li segue

Lancia npm audit e confrontalo con doc/guide/dipendenze.md (regola 8 di WORKFLOW.md).
Rispondimi in una riga: invariate dal <data>, oppure gli avvisi nuovi; quelli nuovi li
registriamo nella guida con una decisione, non si aggiorna nulla in questa sessione.

Prima della prima modifica: controlla il branch attivo (git branch --show-current) e crea
il branch di sessione da lì. Mai modificare un file sul branch di integrazione.

Crea SESSION_NOTES.md per tracciare il lavoro (non tracciato: a fine sessione si riversa
nei documenti e si cancella).

Ogni dubbio o scelta che spetta a me me la chiedi SUBITO con AskUserQuestion, una scelta
per domanda, a gruppi di quattro: mai un «da decidere» lasciato nel codice, nei documenti o
nel riassunto. Se serve un comando che solo io posso lanciare (produzione, un login
interattivo), dammelo una riga alla volta con l'esito atteso.

Implementa la spec così com'è scritta, nell'ordine: il test dei contrasti del costume e i
casi nuovi dei test esistenti; il registro (COLOR_THEMES, COLOR_THEME_META, THEME_EMBLEMS);
i quattro blocchi CSS con i valori della spec, alla lettera; Marcellus in app/layout.tsx;
le due spec e2e. I test PRIMA del codice, ciascuno visto rosso con la sua mutazione; nessun
valore di colore diverso da quelli scritti. Fermati e chiedimi se: un test dei gate misura
un numero diverso da § 4.4 oltre il secondo decimale; perf:budget o mobile:budget si
muovono; la linea di base dei dodici blocchi cambia. Collaudo: § 7, la F al mio «pronto». Un
branch, un commit, solo dopo il mio OK con il riassunto del diff. SESSION_NOTES.md non si
committa.
```

Model: **Sonnet 5.5**, effort **medium** — an M spec in one area that fills a contract already fixed, every value
written and every criterion closed by a test. Estimated size: 1 session, ~3 h; ~150 lines of CSS, ~20 of TS, ~200 of
tests, two E2E files.
