# NOVE-13 — The «Orbita» theme: deep space, a console and a resource bar

> Series `doc/nove/` (README.md § 5): **depends on NOVE-11** (the costume contract, NOVE-11 § 4.3, used with its
> names and nothing added) **and on NOVE-12** (its contrast test, which this spec extends; `orbita` is the eighth
> theme); **NOVE-19 and NOVE-20 are implemented after it** and carry Orbita onto every page and dialog. Written on
> 2026-11-12; every `file:line` is cited on `develop` @ b841cbd7. Executes the owner's point 1, decisions 4, 14 and
> 17 and the adopted choice (a) (README.md § 3-4), from the approved mock `Orbita-C.dc.html` (direction C «Impero»;
> A and B rejected).

## 1. The problem today (evidence on the code)

| # | Site (file:line @ b841cbd7) | What it shows |
| --- | --- | --- |
| 1 | `lib/constants/colorTheme.ts:15-22` | no theme with `resourceBar: true` (NOVE-11 names the flag; nothing reads it yet) |
| 2 | `app/dashboard/page.tsx:507-529` | under the Panoramica's `PageHeader` comes `RowAnswers` and the verdict: no place for a bar of figures |
| 3 | `lib/utils/overviewSummary.ts:87-121` | `selectOverviewStrip`: the phone's three cells; no selector of the four figures the mock shows at 1440 |
| 4 | the mock's dark slots | Azioni `0.70 0.13 225` and Trend Following `0.62 0.07 240` measure ΔE00 12,6: under the gate of 14 |
| 5 | the mock's `--primary` light `0.48 0.12 235`, eyebrow light `0.50 0.13 60`, Immobili light `0.70 0.15 75` | outside sRGB (max chroma 0.102, 0.117, under 0.15) |
| 6 | the mock | five slots in the light half, no `--chart-9` in either |

## 2. Goal and acceptance criteria

An eighth theme, «Orbita», wears direction C inside the dashboard and its dialogs: a starry ground in dark (plain in
light), square tiles with console corner marks, an uppercase console face on the verdict and the labels, an amber
eyebrow, a glow on the primary action in dark, a planet beside the page's name, and — on Panoramica at ≥ 1440 only —
a bar of four figures under the header. Every figure stays Geist Mono.

1. Impostazioni › Aspetto shows «Colore 8 di 8: Orbita», described «Spazio profondo e ambra»; choosing it sets
   `data-theme="orbita"` and `data-costume`. **Proof**: `AspettoTab.test.tsx`, `colorTheme.test.ts` C4.
2. The four gate tests measure Orbita in both modes and pass with the numbers of § 4.5. **Proof**: green; the
   mutation of § 6 turns `chartPaletteDistinctness` red.
3. Every costume token printed as text reads ≥ 4,5:1 where it lands, the nebula included. **Proof**:
   `themeCostumeContrast.test.ts` (NOVE-12) with the new nebula case K2.
4. On `/dashboard` at 1440 in Orbita dark: `#page-main`'s `background-image` holds six `radial-gradient`s; the first
   tile's `border-top-left-radius` is `0px` and its `background-image` holds four `linear-gradient`s; the verdict `h2`
   is `Chakra Petch`, `uppercase`, `28px`; a `.costume-figure` inside it is `Geist Mono` with `text-transform: none`;
   the first primary button's `box-shadow` is the glow at rest and the focus ring once focused by keyboard.
   **Proof**: `e2e/theme.orbita.spec.ts` (E1).
5. The resource bar: on `/dashboard` at 1440 in Orbita, `dl[aria-label="Quadro rapido"]` lists «Patrimonio»,
   «Liquidità», «Messo da parte», «Da inizio anno», and each figure's text equals the text the tile prints for the
   same quantity (Patrimonio's hero, Sintesi's «Liquidità», Cashflow's «Risparmio», the year's chip). It is absent at
   1024 and 390, on every other page, and in every other theme. **Proof**: E1, E2; `ResourceBar.test.tsx`;
   `overviewSummary.test.ts` (identity).
6. At 390: corners, uppercase headline at 24px, an 18px planet beside the title, no bar, no horizontal overflow.
   **Proof**: `e2e/theme.orbita.mobile.spec.ts` (E2).
7. Chakra Petch is fetched only where it paints (`document.fonts` faces `unloaded` with the default theme and on
   `/login` with Orbita, one `loaded` on `/dashboard` with Orbita). **Proof**: E1.
8. The twelve existing blocks render as their baseline; `mobile:budget` does not move; `perf:budget` moves ≤ 0,6 KB
   gz on `/dashboard` and 0 elsewhere. **Proof**: NOVE-11 E1 green; the two runs.

## 3. Decisions

- **Owner (2026-11-12)**: 4 (Orbita is direction C «Impero»: colour, the starry ground, the frame, Chakra Petch
  uppercase, the HUD corners and radius 0, the glow on the primary button, the emblem, the four-figure resource
  bar), 14 (the bar ONLY at ≥ 1440 and ONLY on Panoramica), 17 (the costume only in the dashboard and its dialogs),
  (a) (the name is ours; no game's name or asset).
- **Adopted, reversible**:
  - id `orbita`, name «Orbita», description «Spazio profondo e ambra»; eighth in `COLOR_THEMES`, after `egeo`;
  - the mock's colour per asset class kept, not its order (as Egeo: `--chart-3` Criptovalute = the mock's c5,
    `--chart-4` Immobili = gold c3, `--chart-5` Liquidità = violet c4); light 6-9 and dark/light `--chart-9` derived;
  - re-pitched for the gates: Trend Following dark `0.62 0.07 240` → `0.52 0.08 240` (row 4), light derived at
    `0.38 0.06 240` (16,3 to Azioni); Azioni light C 0.13 → 0.098 and Immobili light `0.70 0.15 75` →
    `0.66 0.13 75` (gamut; 2,66:1 → 3,09:1 on the card); `--primary` light C 0.12 → 0.10 and the eyebrow light
    C 0.13 → 0.115 (gamut);
  - `--positive` inherited (5,49:1 light, 8,51:1 dark on the card); the mock's «neg» is `--destructive`; the warning
    trio is the default's; `--accent` = `--muted` in light (the mock has none);
  - the palette block keeps `--radius: 0.25rem` (the landing and the access pages, decision 17); the scope sets
    `--radius` and `--radius-2xl` to 0;
  - the corner marks are 2px × 14px layers at the border box: the 26-30% border lies over their outer pixel;
  - the bar repeats each tile's figure with the tile's rounding (The Lifted-Figure Rule), not the mock's: Patrimonio
    and Liquidità with cents, «Messo da parte» as the Cashflow tile's «Risparmio» (no «+», no colour), the year with
    the chip's two decimals and its sign colour; the bar is absent on an account with no asset; its `aria-label` is
    «Quadro rapido»; a figure that cannot be measured prints its reason;
  - one emblem (the planet) for every page; per-page emblems are the heirs' (§ 10).

## 4. Solution

### 4.1 Registry — `lib/constants/colorTheme.ts`, `lib/constants/themeCostume.ts`

`COLOR_THEMES` gains `'orbita'` after `'egeo'`; `COLOR_THEME_META` gains
`orbita: { name: 'Orbita', description: 'Spazio profondo e ambra', costume: { ornaments: [], resourceBar: true } }`.

```ts
/** A planet with a tilted ring: the Orbita costume's mark (decorative, DESIGN.md → The Costume Rule). */
const ORBITA_PLANET: EmblemArt = {
  viewBox: '0 0 22 22',
  shapes: [
    { kind: 'circle', cx: 11, cy: 11, r: 5, tone: 'primary', strokeWidth: 1.6 },
    { kind: 'ellipse', cx: 11, cy: 11, rx: 10, ry: 3.6, rotate: -24, tone: 'eyebrow', strokeWidth: 1.3 },
  ],
};
```

`THEME_EMBLEMS` gains `orbita: { fallback: ORBITA_PLANET, pages: {} }`.

### 4.2 The font — `app/layout.tsx`

```ts
// The Orbita costume's console face (OFL, Cadson Demak): named only by `--costume-heading-font`, so its files are
// fetched only when a heading paints with them (doc/guide/temi.md § Il costume).
const chakraPetch = Chakra_Petch({ weight: ['500', '600'], subsets: ['latin'], variable: '--font-chakra-petch',
  preload: false });
```

`Chakra_Petch` joins the `next/font/google` import; `${chakraPetch.variable}` joins `<html>`'s className. Effect:
`@font-face` rules (~0,3 KB gz) in the root CSS, no JS; two latin woff2 (~20 KB each) requested only by a painting
heading (600) or eyebrow (500). Licence: SIL Open Font License 1.1, self-hosted by next/font at build time.

### 4.3 The CSS — `app/globals.css`, four blocks after Egeo's, before the «Theme costume» section

```css
/* Orbita — deep space and amber (costume theme: DESIGN.md → The Costume Rule) */
[data-theme="orbita"] {
  --radius: 0.25rem;
  --background: oklch(0.955 0.012 240);
  --foreground: oklch(0.25 0.04 255);
  --card: oklch(0.99 0.004 240);
  --card-foreground: oklch(0.25 0.04 255);
  --popover: oklch(0.99 0.004 240);
  --popover-foreground: oklch(0.25 0.04 255);
  --primary: oklch(0.48 0.10 235);
  --primary-foreground: oklch(0.99 0 0);
  --secondary: oklch(0.925 0.015 240);
  --secondary-foreground: oklch(0.25 0.04 255);
  --muted: oklch(0.925 0.015 240);
  --muted-foreground: oklch(0.45 0.035 250);
  --accent: oklch(0.925 0.015 240);
  --accent-foreground: oklch(0.25 0.04 255);
  --destructive: oklch(0.52 0.19 28);
  --warning: oklch(0.986 0.022 90);
  --warning-foreground: oklch(0.468 0.098 75);
  --warning-border: oklch(0.855 0.062 85);
  --border: oklch(0.48 0.10 235 / 30%);
  --input: oklch(0.48 0.10 235 / 30%);
  --ring: oklch(0.48 0.10 235);
  --chart-1: oklch(0.52 0.098 225);
  --chart-2: oklch(0.60 0.12 165);
  --chart-3: oklch(0.58 0.19 25);
  --chart-4: oklch(0.66 0.13 75);
  --chart-5: oklch(0.48 0.19 300);
  --chart-6: oklch(0.56 0.11 105);
  --chart-7: oklch(0.38 0.06 240);
  --chart-8: oklch(0.60 0.17 345);
  --chart-9: oklch(0.46 0.11 135);
  --sidebar: oklch(0.955 0.012 240);
  --sidebar-foreground: oklch(0.25 0.04 255);
  --sidebar-primary: oklch(0.48 0.10 235);
  --sidebar-primary-foreground: oklch(0.99 0 0);
  --sidebar-accent: oklch(0.90 0.03 235);
  --sidebar-accent-foreground: oklch(0.25 0.04 255);
  --sidebar-border: oklch(0.48 0.10 235 / 30%);
  --sidebar-ring: oklch(0.48 0.10 235);
}

.dark[data-theme="orbita"] {
  --background: oklch(0.13 0.03 260);
  --foreground: oklch(0.94 0.015 230);
  --card: oklch(0.19 0.04 258);
  --card-foreground: oklch(0.94 0.015 230);
  --popover: oklch(0.19 0.04 258);
  --popover-foreground: oklch(0.94 0.015 230);
  --primary: oklch(0.78 0.12 215);
  --primary-foreground: oklch(0.16 0.03 258);
  --secondary: oklch(0.25 0.045 258);
  --secondary-foreground: oklch(0.94 0.015 230);
  --muted: oklch(0.25 0.045 258);
  --muted-foreground: oklch(0.75 0.035 235);
  --accent: oklch(0.27 0.05 258);
  --accent-foreground: oklch(0.94 0.015 230);
  --destructive: oklch(0.72 0.17 30);
  --warning: oklch(0.260 0.038 78);
  --warning-foreground: oklch(0.854 0.090 82);
  --warning-border: oklch(0.460 0.085 75);
  --border: oklch(0.78 0.12 215 / 26%);
  --input: oklch(0.78 0.12 215 / 26%);
  --ring: oklch(0.78 0.12 215);
  --chart-1: oklch(0.70 0.13 225);
  --chart-2: oklch(0.76 0.14 165);
  --chart-3: oklch(0.68 0.19 25);
  --chart-4: oklch(0.80 0.15 75);
  --chart-5: oklch(0.66 0.19 300);
  --chart-6: oklch(0.70 0.12 105);
  --chart-7: oklch(0.52 0.08 240);
  --chart-8: oklch(0.74 0.17 345);
  --chart-9: oklch(0.60 0.12 135);
  --sidebar: oklch(0.13 0.03 260);
  --sidebar-foreground: oklch(0.94 0.015 230);
  --sidebar-primary: oklch(0.78 0.12 215);
  --sidebar-primary-foreground: oklch(0.16 0.03 258);
  --sidebar-accent: oklch(0.27 0.05 258);
  --sidebar-accent-foreground: oklch(0.94 0.015 230);
  --sidebar-border: oklch(0.78 0.12 215 / 26%);
  --sidebar-ring: oklch(0.78 0.12 215);
}

/* The Orbita costume, worn only inside the dashboard and its dialogs. */
[data-theme="orbita"] [data-costume-scope] {
  --radius: 0rem;
  --radius-2xl: 0rem;
  --costume-ground: var(--background);
  --costume-ornament: oklch(0.48 0.10 235);
  /* Console corner marks: two strokes top-left, two bottom-right. */
  --costume-tile-image: linear-gradient(var(--costume-ornament), var(--costume-ornament)),
    linear-gradient(var(--costume-ornament), var(--costume-ornament)),
    linear-gradient(var(--costume-ornament), var(--costume-ornament)),
    linear-gradient(var(--costume-ornament), var(--costume-ornament));
  --costume-tile-image-position: left top, left top, right bottom, right bottom;
  --costume-tile-image-size: 14px 2px, 2px 14px, 14px 2px, 2px 14px;
  --costume-tile-shadow: none;
  --costume-heading-font: var(--font-chakra-petch), var(--font-geist-sans), system-ui, sans-serif;
  --costume-heading-weight: 600;
  --costume-heading-tracking: 0.02em;
  --costume-heading-case: uppercase;
  --costume-heading-size: 28px;
  --costume-eyebrow-color: oklch(0.50 0.115 60);
  --costume-eyebrow-weight: 500;
  --costume-header-band: none;
  --costume-header-band-height: 0px;
  --costume-primary-glow: none;
}

.dark[data-theme="orbita"] [data-costume-scope] {
  --costume-ground: radial-gradient(1px 1px at 12% 18%, oklch(0.95 0.02 230 / 70%) 50%, transparent 51%),
    radial-gradient(1px 1px at 34% 62%, oklch(0.95 0.02 230 / 55%) 50%, transparent 51%),
    radial-gradient(1.5px 1.5px at 58% 9%, oklch(0.9 0.06 215 / 70%) 50%, transparent 51%),
    radial-gradient(1px 1px at 77% 41%, oklch(0.95 0.02 230 / 60%) 50%, transparent 51%),
    radial-gradient(1px 1px at 91% 83%, oklch(0.95 0.02 230 / 55%) 50%, transparent 51%),
    radial-gradient(900px 500px at 85% -10%, oklch(0.26 0.08 265 / 70%), transparent 70%),
    oklch(0.13 0.03 260);
  --costume-ornament: oklch(0.78 0.12 215);
  --costume-eyebrow-color: oklch(0.80 0.14 75);
  --costume-primary-glow: 0 6px 20px oklch(0.78 0.12 215 / 35%);
}
```

### 4.4 The resource bar

`lib/utils/overviewSummary.ts`, after `selectOverviewStrip`:

```ts
/** A cell of the resource bar: a strip figure that opens nothing. */
export type ResourceFigure = Omit<StripFigure, 'opens' | 'lifts'>;

/**
 * The four figures a costume theme with a resource bar prints under the Panoramica's header at
 * ≥ 1440 (DESIGN.md → The Costume Rule). Each repeats a tile's figure with the tile's rounding
 * (The Lifted-Figure Rule): the hero's and Sintesi's cents, the Cashflow tile's «Risparmio», the
 * year's chip. No asset → no bar.
 */
export function selectResourceBar(overview: DashboardOverviewPayload): ResourceFigure[] {
  if (overview.flags.assetCount === 0) return [];
  const month = overview.expenseStats?.currentMonth;
  const yearly = overview.variations.yearly;
  return [
    { label: 'Patrimonio', value: overview.metrics.totalValue, format: 'currency', decimals: 2 },
    { label: 'Liquidità', value: overview.metrics.cashNetWorth, format: 'currency', decimals: 2 },
    {
      label: 'Messo da parte',
      value: month ? month.net : null,
      format: 'currency',
      ...(month ? {} : { reason: 'nessun movimento nel mese' }),
    },
    {
      label: 'Da inizio anno',
      value: yearly ? yearly.percentage : null,
      format: 'signed-percent',
      decimals: 2,
      ...(yearly ? {} : { reason: "nessuno snapshot da cui contare l'anno" }),
    },
  ];
}
```

`format: 'currency'` without `decimals` is `cachedFormatCurrencyEUR(|v|, true)` with «−» in front
(`verdictStrip.ts:79-81`, `:110-121`): exactly `formatEuroMinus(net)` (`CashflowTile.tsx:121`).

`components/dashboard/overview/ResourceBar.tsx` (new, `'use client'`):

```tsx
/**
 * The resource bar of a costume theme that has one (DESIGN.md → The Costume Rule): four figures
 * under the Panoramica's header, at ≥ 1440 only (`hidden desktop:flex`). It opens nothing and
 * adds no figure the tiles do not print.
 */
export function ResourceBar({ figures }: { figures: readonly ResourceFigure[] }) {
  const costume = useThemeCostume();
  if (!costume?.resourceBar || figures.length === 0) return null;
  return (
    <dl aria-label="Quadro rapido" className="hidden gap-px border border-border bg-border desktop:flex">
      {figures.map((figure) => {
        const segment = formatStripFigure({ ...figure, opens: '' });
        return (
          <div key={figure.label} className="min-w-0 flex-1 bg-card px-3.5 py-2.5">
            <dt className={cn(TILE_EYEBROW_CLASS, 'tracking-[0.12em] text-muted-foreground')}>{figure.label}</dt>
            <dd className="mt-1 text-[18px] leading-none">
              {segment ? <NarrativeSegments segments={[segment]} />
                : <span className="text-[12px] text-muted-foreground">{figure.reason}</span>}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}
```

`app/dashboard/page.tsx:510-516`: `<ResourceBar figures={selectResourceBar(overview)} />` right after
`<PageHeader … />`, before `<RowAnswers>` (`:520`, inside `space-y-4`); `overview` is narrowed there by the
guard at `:411`.

### 4.5 The measured numbers (the gates' formulas; the tests re-measure them)

| Gate | Light | Dark |
| --- | --- | --- |
| closest ΔE00 between the nine slots (≥ 14) | 16,3 Azioni–Trend Following; 17,6 Materie Prime–Previdenza | 17,4 Materie Prime–Previdenza; 18,9 Immobili–Materie Prime |
| slot L band · hue drift between modes | 0,38-0,66 · 0° on all nine | 0,52-0,80 · 0° |
| slot on the card (guide ≥ 3:1), slots 1-9 | 5,21 3,62 4,58 3,09 7,00 4,47 9,65 4,20 6,65 | 7,15 9,15 5,88 9,69 5,50 7,01 3,40 7,39 4,89 |
| COMPRA / VENDI / OK, text on card · on the 8% chip (≥ 4,5) | 7,58·6,51 / 7,64·6,72 / 6,32·5,61 | 7,83·7,06 / 8,81·7,78 / 10,49·9,11 |
| `--muted-foreground` on background · card · muted (≥ 4,5) | 6,52 · 7,21 · 5,96 | 9,11 · 8,37 · 7,25 |
| `--foreground` on background · card · muted | 14,06 · 15,55 · 12,85 | 16,93 · 15,55 · 13,48 |
| primary-fg on primary · destructive on card · AI accent on card | 6,23 · 5,90 · 4,99 | 10,07 · 6,94 · 5,23 |
| eyebrow on card · background · muted | 6,05 · 5,46 · 5,00 | 9,71 · 10,57 · 8,41 |
| foreground · muted-fg · eyebrow on the nebula at its fullest (70% over the ground) | — | 14,53 · 7,82 · 9,07 |
| ornament on card (decorative) · border over the card (non-text, decorative) | 6,24 · 1,59 | 9,58 · 1,75 |

Every slot is inside sRGB; Previdenza (hue 135) sits 30° from its nearest chromatic slots (165, 105).

### 4.6 Strings

«Orbita», «Spazio profondo e ambra» (the swatch); «Quadro rapido» (the bar's `aria-label`); «Patrimonio»,
«Liquidità», «Messo da parte», «Da inizio anno» (the bar's labels); «nessun movimento nel mese», «nessuno snapshot da
cui contare l'anno» (its reasons; the second is the strip's own).

## 5. Constraints and traps (AGENTS.md / DESIGN.md rules, «here it means that»)

- **The Lifted-Figure Rule / The First-Screen Rule**: the bar adds no new figure; here it means every cell reads the
  value a tile prints and `overviewSummary.test.ts` holds the identity; the strip below `desktop:` is untouched.
- **The Mono Mandate**: an uppercase heading in Chakra Petch keeps its figures in `.costume-figure` (Geist Mono,
  `text-transform: none`); the bar's figures go through `NarrativeSegments` (mono, tabular).
- **The AI-Accent Rule**: a generated tile keeps its glow (NOVE-11 excludes `[data-generated]`); the primary glow is
  the button's only, and gives way to the focus ring.
- **The Costume Rule — nothing moves**: the stars are a still background; no animation, no reduced-motion branch.
- **`desktop:` = 1440**: the 1024×768 tablet stage shows no bar (the tablet project checks it).
- **`perf:budget` on `/dashboard` has ~0,7 KB of headroom**: the bar and its selector are ~0,5 KB gz; above the
  ceiling the session stops and asks (`raisedBy` in `perf/budget.json`, doc/guide/velocita.md § Registro).
- **The census reads the default theme**: no `mobile:budget` entry moves.
- **Sentences live in `*Narrative.ts`**: the bar has labels and reasons, not sentences — they sit beside the strip's
  in `overviewSummary.ts`, as the strip's do.

## 6. Tests per level (with the mutation that proves each)

| # | Test | Mutation that turns it red |
| --- | --- | --- |
| G1 | the four gate tests on sixteen blocks (derived) | `--chart-7` dark back to the mock's `0.62 0.07 240`: ΔE00 12,6 to Azioni |
| T3 | `themeCostume.test.ts`: Orbita's light scope block declares the 18 properties | delete `--costume-primary-glow` |
| K1 | `themeCostumeContrast.test.ts` (NOVE-12) now on Orbita too | eyebrow light `oklch(0.66 0.13 75)` |
| K2 | same file, new case: a `radial-gradient` layer of a ground whose first size is > 2px is composited at its alpha over `--background`; `--foreground`, `--muted-foreground`, `--costume-eyebrow-color` ≥ 4,5 on it | nebula `oklch(0.70 0.08 265 / 70%)` |
| C4 | `colorTheme.test.ts`: `color-theme = orbita` sets both attributes | `orbita`'s `costume` set to `null` |
| U1 | `overviewSummary.test.ts`: on an invented payload (250.000 €, liquidity 25.000 €, net 900 €, year +6,4%) `selectResourceBar` prints «250.000,00 €», «25.000,00 €», «900 €», «+6,40%», each equal to `cachedFormatCurrencyEUR(totalValue)`, `cachedFormatCurrencyEUR(cashNetWorth)`, `formatEuroMinus(net)` and the strip's yearly cell; net −1.200 → «−1.200 €» uncoloured; `expenseStats: null` → reason; `assetCount: 0` → `[]` | `decimals: 0` on «Patrimonio» |
| R5 | `ResourceBar.test.tsx`: inside `CostumeScope` with `orbita` stored → a `dl` named «Quadro rapido», four `dt` in order, the `dl` has `hidden` and `desktop:flex`; with `egeo` or `default` → nothing; outside the scope → nothing | render without `useThemeCostume` |
| E1 | `e2e/theme.orbita.spec.ts` (desktop): criteria 4, 5 (the bar's texts against the tiles' on the seed; absent on `/dashboard/history` and with the default theme), 7 | drop `:not(:focus-visible)`: the focused button loses its ring |
| E2 | `e2e/theme.orbita.mobile.spec.ts` (390) and `theme.orbita.tablet.spec.ts` (768×1024, 1024×768): criterion 6; the bar not visible | `desktop:flex` → `md:flex` |
| E3 | `e2e/theme.neutral{,.mobile}.spec.ts` (NOVE-11) unchanged | a token of `:root` edited |

## 7. Guided verification (WORKFLOW.md § 2)

Expected outcome, declared first: in Orbita dark the dashboard reads as a console in space — a few still stars and a
violet haze behind the page, square tiles with bright corner marks, the verdict and the labels in uppercase console
letters, amber eyebrows, a soft cyan glow under the primary buttons, a ringed planet beside the page's name, and on
Panoramica at 1440 a bar of four figures under the header that repeat the tiles exactly; light is the same frame on
a pale ground without stars or glow; landing and access pages show the colours only.

- **A**: `tsc`, lint, Vitest (three zones), E1-E3, `npx playwright test e2e/shell.boot`.
- **B**: emulators + seed, decoys «ornitorinco» (an asset) and «fenicottero» (a category): their names uppercase only
  inside eyebrows and headlines, never in a table cell.
- **C (browser, the session)**: Panoramica, Patrimonio, Cashflow › Tracciamento, Storico, a «Nuova Spesa» dialog,
  Impostazioni › Aspetto; light and dark; 1440, 1024×768, 768×1024, 390; screenshots in the scratchpad.
- **D (data)**: each bar text against its tile on the seed; an account with no snapshot of this year → «Da inizio
  anno» prints the reason; Tab onto a primary button → ring, no glow.
- **E**: an account with no asset → no bar; a headline with «−1.200 €» keeps the minus in the mono; Orbita → Default
  from Aspetto removes stars, corners, bar and planet without a reload.
- **F (owner, at his «pronto»)**: the mirror in Orbita dark and light, Panoramica at 1440.
- **G**: `perf:budget` (≤ 0,6 KB on `/dashboard`), `mobile:census` + `mobile:budget` (unchanged); remove decoys,
  fixtures, the mirror.

## 8. Putting it into service

One PR to `develop`, after NOVE-12's. No data change (the choice lives in `localStorage` and the preference
`colorTheme`; the overview payload is read as it is, `DASHBOARD_OVERVIEW_SOURCE_VERSION` is not raised). Rolling back =
removing `'orbita'` from the registry; a stored `orbita` reads as the default through `isColorTheme`.

## 9. Documentation

- `doc/guide/temi.md`: the theme table gains «Orbita — costume theme (Chakra Petch, corners, glow, resource bar)»;
  § Il costume names the resource bar (`ThemeCostume.resourceBar`, `selectResourceBar`, `ResourceBar`); § 4.5's
  numbers as the theme's measures.
- `doc/guide/panoramica.md` § Files and a sentence: «Under the header, a costume theme with a resource bar prints four
  figures at ≥ 1440, each a tile's (`selectResourceBar`, 2026-11-12).»
- `DESIGN.md:144-145` (as NOVE-12 left it) BEFORE: «Egeo to 0.3125rem with a 4px `2xl` in the dashboard». AFTER:
  «Egeo to 0.3125rem with a 4px `2xl` in the dashboard, Orbita to 0.25rem and to 0 (`2xl` too) in the dashboard».
- `README.md` (what the user sees); `CLAUDE.md` «Themes» (sixteen theme blocks); `doc/guide/velocita.md` § Registro if
  a ceiling moves; `Draft Release Temp.md`; `doc/nove/README.md` § 6.

## 10. Declared out of scope

- **Every page and dialog beyond NOVE-11's primitives** — per-page emblems, the modal's frame and title, popovers,
  selects, sheets and the sidebar in scope, the Consulente's and the Compravendita's own cards, the Sankey's hexes
  (`lib/utils/cashflowSankey.ts`), `components/ui/switch.tsx:14`,
  `components/performance/UnderwaterDrawdownChart.tsx:102-109`, `components/ui/sidebar.tsx:493`: heirs NOVE-19 (Panoramica,
  Patrimonio, Cashflow) and NOVE-20 (the rest and the dialogs), in Orbita as in every theme.
- **A resource bar on another page or below 1440**: none, declared (decision 14).
- **Moving stars, a scan line, any animation**: none, declared (The Costume Rule: nothing moves).

## 11. The prompt that implements it

```
Ciao, in questa sessione vorrei implementare la spec doc/nove/NOVE-13-tema-orbita.md

Contesto, prima di toccare qualsiasi file (le regole del repo cambiano il modo di lavorare):
- Leggi WORKFLOW.md (regole di sessione e di collaudo; l'ultima sezione dice come si
  applicano in questo repo)
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- CLAUDE.md (l'indice: che cos'è e dove sta ogni cosa, lo stato corrente) è già nel
  contesto: usalo per trovare la guida giusta
- Leggi la spec doc/nove/NOVE-13-tema-orbita.md e l'indice della serie
  doc/nove/README.md (§ 3 decisioni, § 4 scelte adottate, § 7 contratti condivisi, § 8 regole)
- Leggi doc/guide/temi.md (§ Il costume), panoramica.md, shell.md, dialog.md,
  prima-schermata.md, velocita.md, e2e-playwright.md PRIMA di scrivere codice
- Leggi DESIGN.md (The Costume Rule, The Mono Mandate, The Lifted-Figure Rule,
  The First-Screen Rule, The AI-Accent Rule) e PRODUCT.md
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

Implementa la spec così com'è scritta, nell'ordine: i casi nuovi dei test (contrasti con la
nebulosa, selectResourceBar con le cifre inventate della spec, ResourceBar); il registro e
l'emblema; i quattro blocchi CSS con i valori della spec, alla lettera; Chakra Petch in
app/layout.tsx; la barra nella Panoramica; le spec e2e. I test PRIMA del codice, ciascuno
visto rosso con la sua mutazione. Fermati e chiedimi se: un gate misura un numero diverso da
§ 4.5 oltre il secondo decimale; una cifra della barra non coincide con quella della sua
tessera; perf:budget supera il tetto di /dashboard; mobile:budget si muove. Collaudo: § 7,
la F al mio «pronto». Un branch, un commit, solo dopo il mio OK con il riassunto del diff.
SESSION_NOTES.md non si committa.
```

Model: **Sonnet 5.5**, effort **medium** — an M spec that fills a contract already fixed and adds one pure selector
and one component on Panoramica, every value written and every criterion closed by a test. Estimated size: 1
session, ~4 h; ~150 lines of CSS, ~80 of TS/TSX, ~250 of tests, three E2E files.
