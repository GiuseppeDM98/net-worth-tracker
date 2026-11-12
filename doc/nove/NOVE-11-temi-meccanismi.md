# NOVE-11 — Themes: the mechanisms beyond colour and radius

> Series `doc/nove/` (README.md § 5): **depends on nothing**; **NOVE-12 (Egeo) and NOVE-13 (Orbita) are implemented
> after it** and fill the contract of § 4.3; **NOVE-19 and NOVE-20** dress every page and dialog on it (README.md
> § 7). Written on 2026-11-12; every `file:line` is cited on `develop` @ b841cbd7. Executes the owner's point 1,
> decisions 3, 4, 16, 17 and the adopted choice (a) (README.md § 3-4).

## 1. The problem today (evidence on the code)

A theme today is a palette and a radius. Directions C «Polis» and «Impero» need five mechanisms no theme has.

| # | Site (file:line @ b841cbd7) | What it shows |
| --- | --- | --- |
| 1 | `app/globals.css:302-739` | five named themes × two blocks: colour tokens, and `--radius` in the light blocks only (`:303`, `:395`, `:486`, `:572`, `:656`) |
| 2 | `app/globals.css:57-60` | `sm`–`xl` derive from `--radius`; `rounded-2xl` is Tailwind's own `--radius-2xl: 1rem` (built CSS `.rounded-2xl{border-radius:var(--radius-2xl)}`, read in `.next-perf` today) — the tile (`components/ui/tile.tsx:102`), the modal (`components/ui/dialog.tsx:69`) |
| 3 | `app/dashboard/layout.tsx:91`; `tile.tsx:69-70`, `:102`; `components/ui/page-verdict.tsx:105`; `components/layout/PageHeader.tsx:53-84` | no ground (the scroller is `bg-background`), no frame, no heading font, no ornament, no emblem slot |
| 4 | `app/layout.tsx:102-104`, `app/globals.css:16` | **Geist Sans is never applied**: the variables sit on `<body>`, `--font-sans` resolves on `<html>`; the built preflight `html{font-family:var(--default-font-family,ui-sans-serif, system-ui,…)}` falls back (CLAUDE.md § Known Issues, 2026-10-17) |
| 5 | `__tests__/chartPaletteDistinctness.test.ts:143`, `actionColorContrast.test.ts:109`, `chartColorsContext.test.ts:133`; `mutedForegroundContrast.test.ts:73` (`toHaveLength(12)`) | three gates list the themes by hand and the fourth pins their count at 12: a seventh theme is measured by none of the three and turns the fourth red |
| 6 | `components/settings/tabs/AspettoTab.tsx:33-94` | swatches as literals, drifted: dark grounds of solar-dusk (`:49` chroma 0.0061 vs `globals.css:530` 0.020), elegant-luxury (`:59` vs `:614`, another hue), midnight-bloom (`:69` 0.0125 vs `:700` 0.030); two «accents» are `--secondary` (`:72` = `globals.css:665`, `:92` = `:312`); grid `desktop:grid-cols-6` (`:139`) |
| 7 | `lib/constants/colorTheme.ts:8-9`, `doc/guide/temi.md:127`; `.storybook/mocks/ColorThemeContext.tsx:6-12` | the recipe names `app/dashboard/settings/page.tsx`, where the swatches no longer are; Storybook's union is typed by hand |
| 8 | `DESIGN.md:143-147`, `:284`, `:902` | the rule itself: the tile radius «fixed on every theme», «never overridden» |

Outside the dashboard the same primitives render: the landing uses `PageHeader` and `TILE_EYEBROW_CLASS`
(`app/page.tsx:41`, `:44`, `:175`), so a mechanism keyed on the theme alone would dress it too — what decision 17
forbids.

## 2. Goal and acceptance criteria

A theme may carry a ground, a frame, a heading font, ornaments and emblems inside the dashboard and its dialogs;
every mechanism has a neutral default, so the twelve existing blocks render exactly as today.

1. Geist Sans is applied: `getComputedStyle(body).fontFamily` starts with `Geist` and not with `Geist Mono`, and
   `document.fonts` holds a loaded face whose family is exactly `Geist` (never next/font's «Geist Fallback»), at 1440
   and 390. **Proof**: `e2e/shell.boot{,.mobile}.spec.ts` new case; seen red with
   the variables back on `<body>`.
2. The font change is measured: `mobile:census` + `mobile:budget` before and after on the same build day; every entry
   it moves is recorded. **Proof**: the two runs and the register entry (§ 8).
3. `COLOR_THEME_META` (a `Record<ColorTheme, …>`) is the one source of names, descriptions and costumes; a theme in
   `COLOR_THEMES` without an entry fails `tsc`; Storybook's union imports the type, and `tsconfig.json`'s `include`
   gains `".storybook/mocks/**/*.tsx"` (the `**/*.tsx` wildcard skips a dot-directory: today no file under
   `.storybook/` is type-checked; the mock compiles as it is). **Proof**: `tsc`.
4. The four gate tests read their themes from `COLOR_THEMES`; a name added to the list with no CSS turns all four red.
   **Proof**: the mutation, seen red on each.
5. The swatches carry no colour literal: each half is a `data-theme` scope painted with `bg-background` /
   `bg-primary` / `bg-accent`. **Proof**: `__tests__/aspettoTab.test.tsx` (RTL, new) R1, which also reads the file for `oklch(`.
6. **The twelve existing blocks render byte-for-byte as today**: a computed-style signature of eight probes on three
   pages (and one dialog), six themes × two modes, at 1440 and 390, equals the baseline recorded on the same tree
   with only the Geist fix applied. **Proof**: `e2e/theme.neutral{,.mobile}.spec.ts` against
   `e2e/themeNeutral.baseline.json`; seen red with the gate stripped from the tile-shadow rule.
7. Statically: no palette theme declares a `--costume-*` property or a scope block; every rule reading one sits between the section's two banners and is
   gated by `[data-costume] [data-costume-scope]`; the one layered consumer keeps today's value as its fallback.
   **Proof**: `__tests__/themeCostume.test.ts` T1-T4.
8. The costume is worn only in scope: the dashboard shell and `ResponsiveModal`'s content carry `data-costume-scope`;
   the landing and the access pages never do; `resolveEmblem` answers `null` out of scope. **Proof**:
   `costumeScope.test.tsx`, `responsiveModalCostume.test.tsx` (RTL, new), `themeCostume.test.ts` T5, E2.
9. A figure in a heading stays Geist Mono: `splitHeadingFigures` isolates «+2.150 €», «31%», «2026», a date
   «08/11/2027» and a time «18:42» as ONE figure each, and leaves «Q3-x» alone. **Proof**: `__tests__/headingFigures.test.ts`.
10. `<html data-costume>` is set before the first paint for a costume theme and never for a palette theme.
    **Proof**: `colorTheme.test.ts` C1-C2 (the script run in a VM).
11. DESIGN.md carries the amendment of § 4.8 to the letter. **Proof**: the diff, approved by the owner.
12. `perf:budget` moves ≤ 1 KB gz per route. **Proof**: the run, before/after in doc/guide/velocita.md § Registro.

## 3. Decisions

- **Owner (2026-11-12)**: 3 and 4 (the two directions C, which need exactly the mechanisms below), 16 (DESIGN.md
  amended as BEFORE / AFTER sentences, approved in the diff), 17 (the costume everywhere in the dashboard and its
  dialogs, never outside: email, PDF, landing, access stay default), (a) (names ours, no game asset).
- **Owner 60 (2026-11-12)**: three sentences of DESIGN.md state a law the costume themes break — the Two-Font
  Rule's opening, «the one ornament in the system», The Unifying Law's «never a costume» — and each takes the
  costume's clause (§ 9); the summary bullet «inevitability over ornament» (`:281`) stays as it is.
- **Owner 62 (2026-11-12)**: `develop` goes to `main` only when the whole series is retired: what a theme spec
  declares «until NOVE-19» or «until NOVE-20» is seen on `develop` only.
- **Adopted, reversible**:
  - two attributes: `data-costume` on `<html>` (the theme has a costume) gates the rules; `data-costume-scope` (the
    dashboard shell, a modal's content) bounds them. Costume tokens are declared ONLY in scope blocks.
  - outside the dashboard a costume theme shows its palette and the default costume — the palette reaches the
    landing and the access pages as every theme's does today (decision 17 read as the costume, not the palette);
  - the swatch's bar is `--accent` for every theme (midnight-bloom and retro-arcade showed `--secondary`);
  - an emblem per theme with an optional one per page; the pages pass their id in NOVE-19/20;
  - the band under the header shows at every width; it is CSS alone — the `div` is in every theme's DOM, in the
    header and in its skeleton, and only a costume's `--costume-header-band-height` gives it a height — so the
    prerendered first paint already holds it and the page replaces the skeleton without moving; below `desktop:`,
    where the header is sticky, the band sits on an opaque `--background` strip (rows never show through it);
  - a control that asks a model takes no costume glow: `AI_CONTROL_ACCENT_CLASS` carries the marker class
    `ai-control` and the glow rule excludes it, so the AI accent's own hover and focus glow stay (The AI-Accent Rule);
  - the twelve-theme identity is a computed-style signature, not pixels: the DOM gains one `display: contents`
    wrapper, two attributes, the `tile-eyebrow` / `costume-heading` classes and, in every eyebrow, headline and
    header label holding a digit, a `<span class="costume-figure">` around each figure — all inert outside a
    costume theme, on the landing too;
  - a date and a time in a heading are one figure (The Mono Mandate: «structured date»); a currency other than €
    stays prose (the app prints euros);
  - E1 is a recorded baseline of computed styles, not a `toMatchSnapshot`: the one recorded comparison of the
    series (README.md § 8), re-recorded only on untouched code;
  - more than six themes → the swatch grid takes four columns at `desktop:`.
- **Overturned**: DESIGN.md's «only `2xl` … is fixed … never overridden» (2026-09-06), for costume themes.

## 4. Solution

Order of work: 4.1 (Geist) → record the baseline (§ 6, E1) → 4.2-4.7 → compare.

### 4.1 Geist Sans — `app/layout.tsx`

`<html lang="it" suppressHydrationWarning className={`${geistSans.variable} ${geistMono.variable}`}>`; `<body
className="antialiased">`. The header comment (`:13-16`) says «Applied to `<html>`: Tailwind resolves
`--font-sans` there (the preflight's `html` rule); on `<body>` the sans fell back to `system-ui` until <the implementing session's date>».

### 4.2 The registry — `lib/constants/colorTheme.ts`

```ts
export const COSTUME_ATTRIBUTE = 'data-costume';
/**
 * What a costume theme draws with React; every other mechanism — the header band too — is a token of its scope
 * blocks. `resourceBar`: the Panoramica's four-figure bar, at ≥ 1440 only (owner, 2026-11-12).
 */
export interface ThemeCostume { resourceBar: boolean }
/** `costume: null` = a palette theme: colours and radius only (DESIGN.md → The Costume Rule). */
export interface ColorThemeMeta { name: string; description: string; costume: ThemeCostume | null }

export const COLOR_THEME_META: Record<ColorTheme, ColorThemeMeta> = {
  default: { name: 'Default', description: 'Zinc classico', costume: null },
  'solar-dusk': { name: 'Solar Dusk', description: 'Ambra calda', costume: null },
  'elegant-luxury': { name: 'Elegant Luxury', description: 'Borgogna raffinato', costume: null },
  'midnight-bloom': { name: 'Midnight Bloom', description: 'Viola profondo', costume: null },
  cyberpunk: { name: 'Cyberpunk', description: 'Neon pink & teal', costume: null },
  'retro-arcade': { name: 'Retro Arcade', description: 'Rosso & teal vintage', costume: null },
};
export const COSTUME_THEMES = COLOR_THEMES.filter((theme) => COLOR_THEME_META[theme].costume !== null);

/** Exported for the VM test: the script with the lists it is given. */
export function buildColorThemeInitScript(attributeThemes: readonly string[], costumeThemes: readonly string[]) {
  return (
    '(function(){try{' +
    `var theme=localStorage.getItem(${JSON.stringify(COLOR_THEME_STORAGE_KEY)});` +
    `if(theme&&${JSON.stringify(attributeThemes)}.indexOf(theme)!==-1){` +
    `document.documentElement.setAttribute(${JSON.stringify(COLOR_THEME_ATTRIBUTE)},theme);` +
    `if(${JSON.stringify(costumeThemes)}.indexOf(theme)!==-1)` +
    `document.documentElement.setAttribute(${JSON.stringify(COSTUME_ATTRIBUTE)},'')}` +
    '}catch(e){}})()'
  );
}
export const COLOR_THEME_INIT_SCRIPT = buildColorThemeInitScript(ATTRIBUTE_THEMES, COSTUME_THEMES);
```

The WARNING (`:8-9`) becomes «adding a theme means its CSS blocks in `app/globals.css` and its `COLOR_THEME_META`
entry; the gate tests and the swatches derive from here (doc/guide/temi.md § Adding a theme)».
`contexts/ColorThemeContext.tsx:30-36` `applyThemeAttribute` also sets/removes `COSTUME_ATTRIBUTE` from
`COLOR_THEME_META[theme].costume`; the Firestore sync (`:93-95`) becomes `if (isColorTheme(prefs.colorTheme))
writeStoredTheme(prefs.colorTheme);` — a synced name the registry does not know (a theme chosen on a newer client,
a theme rolled back) stays the default, the acceptance `readStoredTheme` already has; without it
`COLOR_THEME_META[theme]` is `undefined` and the sync throws. `.storybook/mocks/ColorThemeContext.tsx:6-12` imports
`type ColorTheme`.

### 4.3 The costume contract (NOVE-12, 13, 19, 20 use these names)

**Attributes.** `data-costume` on `<html>` (4.2). `data-costume-scope` on the scope elements:
`contexts/CostumeScopeContext.tsx` (new, `'use client'`):

```tsx
const CostumeScopeContext = createContext(false);

/** The dashboard's costume boundary: a `display: contents` box, so no layout moves (temi.md § Il costume). */
export function CostumeScope({ children }: { children: ReactNode }) {
  return <CostumeScopeContext.Provider value><div data-costume-scope="" className="contents">{children}</div>
    </CostumeScopeContext.Provider>;
}
export const useCostumeScope = (): boolean => useContext(CostumeScopeContext);

/** The active theme's costume where one may be worn, else `null`. */
export function useThemeCostume(): ThemeCostume | null {
  const inScope = useCostumeScope();
  const { colorTheme } = useColorTheme();
  return inScope ? COLOR_THEME_META[colorTheme].costume : null;
}
```

**Scope properties.** A costume theme declares ALL of these in `[data-theme="<id>"] [data-costume-scope]` and the
ones that differ in `.dark[data-theme="<id>"] [data-costume-scope]`; a palette theme declares none. The list is
`COSTUME_SCOPE_PROPERTIES` in `lib/constants/themeCostume.ts` (new; a type import only), in the table's order, one
string per property (`'--radius'`, `'--radius-2xl'`, `'--costume-ground'`, … `'--costume-primary-glow'`: 18).
«Off» = the value that switches the mechanism off.

| Property | Paints | Off |
| --- | --- | --- |
| `--radius` | `sm`–`xl` in scope | the theme block's `--radius` |
| `--radius-2xl` | tiles, rows, modals | `1rem` |
| `--costume-ground` | `#page-main`'s `background` shorthand | `var(--background)` |
| `--costume-ornament` | band, cap, corners, emblem strokes | `var(--muted-foreground)` |
| `--costume-tile-image` · `-position` · `-size` | layers over a tile (cap line, corner marks) | `none` · `0 0` · `auto` |
| `--costume-tile-shadow` | a tile's shadow | `0 1px 3px 0 #0000001a, 0 1px 2px -1px #0000001a` |
| `--costume-heading-font` | verdict headline, eyebrows | `var(--font-geist-sans), system-ui, sans-serif` |
| `--costume-heading-weight` · `-tracking` · `-case` | verdict headline | `600` · `-0.025em` · `none` |
| `--costume-heading-size` | verdict headline at ≥ 1440 | `30px` |
| `--costume-eyebrow-color` · `--costume-eyebrow-weight` | eyebrows | `var(--muted-foreground)` · `600` |
| `--costume-header-band` · `--costume-header-band-height` | the band under the header | `none` · `0px` |
| `--costume-primary-glow` | a primary button at rest | `none` |

**The gated rule set** — `app/globals.css`, unlayered, right after the last theme block (today after `:739`,
before the reduced-motion rule), between the banners `/* ─── Theme costume (DESIGN.md → The Costume Rule) ── */`
and `/* ─── End of theme costume ── */` (NOVE-19 and NOVE-20 add their rules before the closing one); every
selector starts with the gate, and outside the two banners a `--costume-*` property is read only by another `--costume-*` declaration of a
theme's own scope block (`--costume-tile-image: linear-gradient(var(--costume-ornament), …)`), never by a rule that
paints:

```css
[data-costume] [data-costume-scope] #page-main { background: var(--costume-ground); }
[data-costume] [data-costume-scope] [data-tile] {
  background-image: var(--costume-tile-image); background-position: var(--costume-tile-image-position);
  background-size: var(--costume-tile-image-size); background-repeat: no-repeat; background-origin: border-box;
}
/* A generated tile keeps the AI accent's border and glow (DESIGN.md → The AI-Accent Rule). */
[data-costume] [data-costume-scope] [data-tile]:not([data-generated]) { box-shadow: var(--costume-tile-shadow); }
[data-costume] [data-costume-scope] .costume-heading {
  font-family: var(--costume-heading-font); font-weight: var(--costume-heading-weight);
  letter-spacing: var(--costume-heading-tracking); text-transform: var(--costume-heading-case); font-synthesis: none;
}
@media (width >= 1440px) {
  [data-costume] [data-costume-scope] .costume-heading { font-size: var(--costume-heading-size); }
}
[data-costume] [data-costume-scope] .tile-eyebrow {
  font-family: var(--costume-heading-font); font-weight: var(--costume-eyebrow-weight); font-synthesis: none;
}
/* The Mono Mandate wins over the heading font: a digit in a heading is a figure. */
[data-costume] [data-costume-scope] .costume-figure {
  font-family: var(--font-geist-mono), ui-monospace, monospace; font-variant-numeric: tabular-nums;
  text-transform: none;
}
/* 16px above a band, nothing above a 0px one: a costume without a band adds no height. */
[data-costume] [data-costume-scope] .costume-header-band {
  height: var(--costume-header-band-height);
  margin-top: min(16px, calc(var(--costume-header-band-height) * 1000));
  background: var(--costume-header-band);
}
/* Below desktop the header is sticky: the band keeps an opaque strip, so no row shows through it. */
@media (width < 1440px) {
  [data-costume] [data-costume-scope] .costume-header-band {
    box-sizing: content-box; margin-top: 0; background-color: var(--background);
    border-top: min(16px, calc(var(--costume-header-band-height) * 1000)) solid var(--background);
  }
}
/* Not on focus (the ring is a box-shadow too), never on a control that asks a model (The AI-Accent Rule). */
[data-costume] [data-costume-scope] [data-slot="button"][data-variant="default"]:not(.ai-control):not(:focus-visible) {
  box-shadow: var(--costume-primary-glow);
}
```

**The one layered consumer.** `TILE_EYEBROW_CLASS` (`tile.tsx:69-70`) becomes `'tile-eyebrow text-[10px]
font-semibold uppercase tracking-[0.1em] text-[color:var(--costume-eyebrow-color,var(--muted-foreground))]'`: a
caller's colour (`text-destructive`, the AI accent, `text-warning-foreground`) still wins through `cn()` — at b841cbd7
the 44 uses do (13 inside `cn()`, 31 standalone; 84 lines name the constant, imports and comments included). At
implementation `git grep -n TILE_EYEBROW_CLASS -- '*.tsx' | grep -v "cn(\|className={TILE_EYEBROW_CLASS}\|import"`
lists only the definition and comments; a site it lists besides moves to `cn()` first.

**Emblems** — `lib/constants/themeCostume.ts`:

```ts
export type EmblemPage = 'panoramica' | 'patrimonio' | 'cashflow' | 'analisi' | 'rendimenti' | 'allocazione'
  | 'storico' | 'previdenza' | 'fire' | 'hall-of-fame' | 'assistente' | 'impostazioni';
export type EmblemTone = 'ornament' | 'primary' | 'eyebrow';
export type EmblemShape =
  | { kind: 'path'; d: string; tone: EmblemTone; strokeWidth: number }
  | { kind: 'circle'; cx: number; cy: number; r: number; tone: EmblemTone; strokeWidth: number }
  | { kind: 'ellipse'; cx: number; cy: number; rx: number; ry: number; rotate: number; tone: EmblemTone;
      strokeWidth: number };
export interface EmblemArt { viewBox: string; shapes: readonly EmblemShape[] }
export interface ThemeEmblems { fallback: EmblemArt; pages: Partial<Record<EmblemPage, EmblemArt>> }

export const EMBLEM_TONE_COLOR: Record<EmblemTone, string> = {
  ornament: 'var(--costume-ornament)', primary: 'var(--primary)', eyebrow: 'var(--costume-eyebrow-color)',
};
/** Filled by each costume theme's spec; empty while no theme has a costume. */
export const THEME_EMBLEMS: Partial<Record<ColorTheme, ThemeEmblems>> = {};

export function resolveEmblem(theme: ColorTheme, page: EmblemPage | undefined, inScope: boolean,
  emblems: Partial<Record<ColorTheme, ThemeEmblems>> = THEME_EMBLEMS): EmblemArt | null {
  if (!inScope) return null;
  const set = emblems[theme];
  return set ? (page && set.pages[page]) || set.fallback : null;
}
```

**React parts** — `components/ui/theme-costume.tsx` (new, `'use client'`):

- `EmblemSvg({ art, size })`: `<svg width height viewBox aria-hidden="true" focusable="false" fill="none"
  strokeLinecap="round" strokeLinejoin="round" className="shrink-0 self-center">`, one element per shape with
  `style={{ stroke: EMBLEM_TONE_COLOR[tone], strokeWidth }}`, an ellipse with
  `transform={`rotate(${shape.rotate} ${shape.cx} ${shape.cy})`}`.
- `ThemeEmblem({ page, size })`: `resolveEmblem(colorTheme, page, useThemeCostume() !== null)`; `null` or the svg.
- `ThemeEmblemLead({ page, size, children })`: `children` alone without an emblem (the DOM of today), else
  `<div className="flex min-w-0 items-center gap-2">` around the svg and `children` (a `div`: it wraps an `h1`).
- `ThemeHeaderBand()`: `<div aria-hidden="true" className="costume-header-band" />`, always (no hook: outside a
  costume no rule names the class and the `div` has no height).
- `HeadingText({ text })`: `splitHeadingFigures(text)`, a figure as `<span className="costume-figure">`.

`lib/utils/headingFigures.ts` (new, no imports):

```ts
export interface HeadingPart { text: string; figure: boolean }

// A figure starts where no letter or digit precedes it and ends on a digit, «%» or «€» (a full stop stays prose);
// «/» and «:» inside it keep a date and a time whole (The Mono Mandate: a structured date is a figure).
const FIGURE = /(?<![\p{L}\p{N}])[+\-−]?\d(?:[\d.,/:]*\d)?(?:\s?[%€])?/gu;

export function splitHeadingFigures(text: string): HeadingPart[] {
  const parts: HeadingPart[] = [];
  let last = 0;
  for (const match of text.matchAll(FIGURE)) {
    const start = match.index ?? 0;
    if (start > last) parts.push({ text: text.slice(last, start), figure: false });
    parts.push({ text: match[0], figure: true });
    last = start + match[0].length;
  }
  return last < text.length ? [...parts, { text: text.slice(last), figure: false }] : parts;
}
```

**Fonts.** A costume's heading font is ONE `next/font/google` call in `app/layout.tsx` with `preload: false`,
`subsets: ['latin']`, `variable: '--font-<slug>'`, its `.variable` added to `<html>`'s className, and is named only by
that theme's `--costume-heading-font`. The `@font-face` rules ship in the root CSS for every page (≈ 0,5 KB each, no
JS: `perf:budget` reads JS only); the browser fetches the file only when text in scope paints with the family, so
users of other themes never download it. The proof belongs to each theme's spec (`document.fonts` status).

**A costume theme's CSS** = four blocks: `[data-theme="<id>"]` and `.dark[data-theme="<id>"]` (the palette, every
token a palette theme declares, `--radius` included), then `[data-theme="<id>"] [data-costume-scope]` and
`.dark[data-theme="<id>"] [data-costume-scope]`, placed after the first two.

### 4.4 The primitives wired

- `app/dashboard/layout.tsx:36-115`: `<CostumeScope>` directly inside `ChartColorsProvider`, around everything.
- `components/ui/tile.tsx:179`, `:268`: `data-tile=""` on both sections; `:275` and `:246` render
  `<HeadingText text={eyebrow} />`. `components/ui/error-notice.tsx:90`: `data-tile=""`.
- `components/ui/page-verdict.tsx:105`: `costume-heading` added to the `h2`; `{headline}` →
  `<HeadingText text={headline} />`.
- `components/layout/PageHeader.tsx`: prop `emblem?: EmblemPage`; `:55` the mobile `h1` wrapped in
  `<ThemeEmblemLead page={emblem} size={18}>`; `:72` `<ThemeEmblem page={emblem} size={22} />` before the label,
  whose text is `<HeadingText text={label} />`; `<ThemeHeaderBand />` as the wrapper's last child, and as
  `PageHeaderSkeleton`'s last child (`:98-115`: the skeleton exists so the grid does not move at mount).
- `lib/constants/aiAccent.ts:20-21`: `AI_CONTROL_ACCENT_CLASS` gains the marker class `ai-control` as its first token.
- `components/ui/responsive-modal.tsx`: `const inCostumeScope = useCostumeScope();` beside `const isMobile =
  useMediaQuery(…)` (`:61`), before any return — the two contents sit in two return branches, a hook called there
  is conditional —; `{...(inCostumeScope ? { 'data-costume-scope': '' } : {})}` on `DrawerContent` (`:201`) and
  `DialogContent` (`:234`) (both spread props, `components/ui/dialog.tsx:72`).

### 4.5 The gate tests derived — `__tests__/themeBlocks.ts` (new helper, not a test)

```ts
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { COLOR_THEMES, DEFAULT_COLOR_THEME, type ColorTheme } from '@/lib/constants/colorTheme';

export const GLOBALS_CSS = readFileSync(resolve(__dirname, '../app/globals.css'), 'utf8');
export const DEFAULT_LIGHT_HEADER = ':root, [data-theme="default"]';
export function themeBlockHeader(theme: ColorTheme, mode: 'light' | 'dark'): string {
  if (theme === DEFAULT_COLOR_THEME) return mode === 'light' ? DEFAULT_LIGHT_HEADER : '.dark';
  return mode === 'light' ? `[data-theme="${theme}"]` : `.dark[data-theme="${theme}"]`;
}
/** The body of one block, `null` when the stylesheet has none. */
export function themeBlockBody(header: string): string | null {
  const start = GLOBALS_CSS.indexOf(`\n${header} {`);
  return start === -1 ? null : GLOBALS_CSS.slice(start, GLOBALS_CSS.indexOf('\n}', start));
}

export const THEME_MODES = COLOR_THEMES.flatMap((theme) => (['light', 'dark'] as const).map((mode) => ({
  theme, mode, label: `${theme} · ${mode}`, header: themeBlockHeader(theme, mode),
})));
```

`globals.css:74` becomes `:root, [data-theme="default"] {` (a swatch needs the default's light block on a `div`).
The four tests replace their `THEMES`/`BLOCKS` with `THEME_MODES` and their finders with `themeBlockBody`
(`expect(body, header).not.toBeNull()`); `mutedForegroundContrast` keeps its regex — extended to the new default
header — as the converse: the stylesheet's theme blocks are exactly the `THEME_MODES` headers (a block with no
registry entry is red too), replacing `toHaveLength(12)`.

### 4.6 The swatches — `AspettoTab.tsx`

`COLOR_THEME_SWATCHES` (`:31-94`) is deleted; the grid maps `COLOR_THEMES` with `COLOR_THEME_META[id]`; the
reading (`:102`, `:138`) is `describeColorTheme(COLOR_THEME_META[colorTheme].name)`; the comments `:4` and `:136` say
«the colour themes» instead of «six». Each preview
row is a scope: `<div data-theme={id} className="flex h-7 … bg-background">` with `bg-primary` and `bg-accent`
children, and `<div data-theme={id} className="dark flex h-7 … bg-background">` with `bg-primary` and
`bg-primary opacity-30`. The comment `:31-32` says «each half is the theme's own block applied to a `div`
(`[data-theme]`, `.dark[data-theme]`), so a preview cannot drift from `globals.css`». The grid:
`COLOR_THEMES.length > 6 ? 'desktop:grid-cols-4' : 'desktop:grid-cols-6'`.

### 4.7 Strings

No new UI string in this spec (the names and descriptions move unchanged).

### 4.8 DESIGN.md amendment (applied to the letter)

- **`:143-147`** BEFORE: «Only `2xl` — the tile, the modal, the email card — is fixed: Tailwind's 16px, never
  overridden. Stated 2026-09-06; the file used to say themes leave the radius alone.» AFTER: «Only `2xl` — the tile,
  the modal, the email card — is fixed at Tailwind's 16px by the palette themes; a costume theme may set it inside
  the dashboard and its dialogs (The Costume Rule), never on the email card. Stated 2026-09-06, amended <the implementing session's date>.»
  (only `:146-147` are re-wrapped, `#`-prefixed at the block's width; `:143-145` are untouched).
- **`:256`** BEFORE: «without touching the type scale, the component API, or the tile's fixed 16px `2xl`
  (corrected 2026-09-06; see the `rounded` comment in the frontmatter).» AFTER: «without touching the type scale,
  the component API, or the tile's fixed 16px `2xl` (corrected 2026-09-06; see the `rounded` comment in the
  frontmatter) — a costume theme may, inside the dashboard and its dialogs, within The Costume Rule.»
- **`:450`** (decision 60) BEFORE: «The system uses exactly two fonts. No display serif, no decorative typeface, no
  icon font treated as type.» AFTER: «The system uses exactly two fonts; a costume theme adds ONE heading face,
  inside the dashboard and its dialogs (The Costume Rule). No other display serif, no decorative typeface, no icon
  font treated as type.»
- **`:703`** (decision 60) BEFORE: «The `✦` is the one ornament in the system: typographic, not an emoji, and in
  one place only.» AFTER: «The `✦` is the one ornament of the palette themes: typographic, not an emoji, and in
  one place only; a costume theme draws its own, inside the dashboard (The Costume Rule).»
- **`:252`** (decision 60) BEFORE: «never a costume applied to it afterward.» AFTER: «never a costume applied to it
  afterward — a costume THEME (The Costume Rule) is the one declared exception: a dress the owner picks in Aspetto,
  bounded to the dashboard and its dialogs, that changes no element's job, size or place.»
- **`:450`** BEFORE: «Hierarchy is expressed through scale and weight within the same two families.» AFTER:
  «Hierarchy is expressed through scale and weight within the same two families. A costume theme adds ONE heading
  face, inside the dashboard and its dialogs, on the verdict's headline and the eyebrows only; every figure keeps
  Geist Mono (The Costume Rule).»
- **`:284`** BEFORE: «16px (tiles, modals, the email card; fixed on every theme)». AFTER: «16px (tiles, modals, the
  email card; fixed on every palette theme, set by a costume theme inside the dashboard — The Costume Rule)».
- **`:359`** BEFORE: «Chart palettes, performance indicators, and the five named themes are the only sanctioned
  sources of chromatic energy». AFTER: «Chart palettes, performance indicators, and the named themes are the only
  sanctioned sources of chromatic energy».
- **After `:359`**, a new paragraph: «**The Costume Rule.** A theme is a palette and a radius — a *palette theme*. A
  *costume theme* may also carry a ground behind the page, a frame on the tiles (radius, a cap line, corner marks, a
  shadow), a heading font for the verdict's headline and the eyebrows, ornaments (a band under the page header), a
  glow on the primary action and an emblem beside the page's name, within five limits: every figure stays Geist Mono,
  a digit inside a heading included; an ornament or an emblem is decorative, `aria-hidden`, carries no meaning and
  never sits under text; no costume token printed as text reads under 4,5:1 on the surfaces it lands on; nothing
  moves, or it stops under `prefers-reduced-motion`; and the costume exists only inside the dashboard and its
  dialogs — the emails, the PDF, the landing and the access pages wear the default costume (owner, 2026-11-12). The
  contract is in doc/guide/temi.md § Il costume.»
- **`:423-424`**, after «**Numeric Font:** …»: «**Heading Font (costume themes only):** the verdict's headline and
  the eyebrows inside the dashboard take the theme's face (The Costume Rule); the reading line, the body and every
  figure keep Geist.»
- **`:902`** BEFORE: «`rounded-2xl` (16px, fixed on every theme).» AFTER: «`rounded-2xl` (16px, fixed on every
  palette theme; a costume theme sets `--radius-2xl` inside the dashboard — The Costume Rule).»
- **`:1409`** BEFORE: «**Do** let the five named themes handle personality.» AFTER: «**Do** let the named themes
  handle personality — a palette theme with its colours and radius, a costume theme also with what The Costume Rule
  allows.»

## 5. Constraints and traps (AGENTS.md / DESIGN.md rules, «here it means that»)

- **The token you author is not the token the browser returns** (doc/guide/temi.md): the neutrality proof compares
  computed strings recorded by the same browser, never an authored `oklch(`.
- **An unlayered rule beats every utility**: here it means every gated selector excludes what a utility must keep —
  `[data-generated]` for the shadow, `.ai-control` and `:focus-visible` for the glow (a filled AI button wears
  `AI_CONTROL_ACCENT_CLASS`'s hover glow) — and the eyebrow's colour is layered.
- **The census reads `section.rounded-2xl[id]`** (`scripts/mobileCensus.mjs`, `isClosedRow`): the tile keeps its
  classes; the frame comes through `--radius-2xl` and `data-tile`, never a new radius class.
- **`e2e/shellBoot.ts:99-106` observes `data-theme` on the whole document**: the swatches' `data-theme` divs live only
  on Impostazioni, which no shell-boot spec opens; keep it so.
- **The Absence-Has-Three-Names / First-Screen rules** are untouched: no costume adds a figure (the resource bar is
  NOVE-13's, desktop only).
- **`PageHeader` stays a server-compatible module**: the hooks live in `theme-costume.tsx` (`'use client'`).
- **A brand-new custom property reads `''` on a running dev server** (doc/guide/temi.md): delete `.next/dev` before
  doubting the stylesheet.
- **Series labels never enter the code**; comments cite DESIGN.md's rule names and the guide.

## 6. Tests per level (with the mutation that proves each)

| # | Test | Mutation that turns it red |
| --- | --- | --- |
| C1-C2 | `colorTheme.test.ts`: `buildColorThemeInitScript(['a','b'], ['b'])` sets `data-costume` for `b`, not for `a`; the shipped script never sets it | drop the second `indexOf` |
| D1 | the four gate tests on `THEME_MODES` | add `'sepia'` to `COLOR_THEMES` with a `META` entry: four files red |
| T1 | `themeCostume.test.ts`: no palette theme's header followed by ` [data-costume-scope] {` exists, no palette block declares `--costume-` | declare `--costume-ground` in `:root` |
| T2 | between the two banners, comments stripped, every rule — one level inside each `@media` block too — has every item of its selector list starting with `[data-costume] [data-costume-scope]`; the glow rule's selector ends with `:not(.ai-control):not(:focus-visible)` and `AI_CONTROL_ACCENT_CLASS` starts with `ai-control`; outside the two banners every `var(--costume-` sits in the value of a `--costume-*` declaration inside a `[data-theme="<id>"] [data-costume-scope]` or `.dark[data-theme="<id>"] [data-costume-scope]` block (a scope block composes its own properties; nothing outside the section paints with one) | strip the gate off one selector; drop `:not(.ai-control)`; a `box-shadow: var(--costume-tile-shadow)` in a rule outside the banners |
| T3 | `expect(COSTUME_SCOPE_PROPERTIES).toHaveLength(18)` and the list equals the table's order; then ONE `it` looping over `COSTUME_THEMES`: each light scope block declares every property (the loop is empty today, binding in 12/13) | a 19th string in the list (red on the count); the per-theme half seen red in NOVE-12 |
| T4 | `TILE_EYEBROW_CLASS` contains `var(--costume-eyebrow-color,var(--muted-foreground))`; `cn(TILE_EYEBROW_CLASS,'text-destructive')` keeps `text-destructive` only | `text-[color:var(--costume-eyebrow-color)]` |
| T5 | `resolveEmblem` with an injected map: out of scope `null`; page art over fallback | ignore `inScope` |
| H1 | `headingFigures.test.ts`: «Novembre è in crescita» one part; «+2.150 € nel mese», «il 31%.», «Rendimento 2026», «Chiude il 2026.» (figure «2026», prose «.»), «Rivedi entro il 08/11/2027» and «alle 18:42» one figure each, «Q3-x» one prose part | `[\d.,/:]*` without the closing digit: «Chiude il 2026.» yields «2026.»; «/» dropped from the class |
| R1 | `aspettoTab.test.tsx`: one button per theme named «Colore N di M: {name}» (M = `COLOR_THEMES.length`); two rows per swatch, both `[data-theme="{id}"]`, the second with class `dark`; no element inside a swatch carries a `style` attribute; the source of `AspettoTab.tsx` (`readFileSync`) holds no `oklch(` | reintroduce a `style={{ background }}` on one row |
| R2 | `costumeScope.test.tsx`: `useThemeCostume` is `null` outside, the costume inside (registry stubbed); `ThemeEmblemLead` returns only its child out of scope; with `COLOR_THEME_META` stubbed to give `cyberpunk` a costume, `setColorTheme('cyberpunk')` puts `data-costume` on `<html>` and `setColorTheme('default')` removes it | render the svg unconditionally; drop the removal branch of `applyThemeAttribute` |
| R3 | `responsiveModalCostume.test.tsx`: content has `data-costume-scope` inside `CostumeScope`, not outside | drop the spread |
| R3b | `costumeScope.test.tsx`: `PageHeader` and `PageHeaderSkeleton` each render exactly one `.costume-header-band[aria-hidden="true"]`, as their wrapper's last child; with `getUserPreferences` mocked to `{ colorTheme: 'sepia' }` the provider writes no `data-theme` and nothing to `localStorage` | drop the band from the skeleton; drop the `isColorTheme` guard |
| E1 | `e2e/theme.neutral.spec.ts` (desktop) + `theme.neutral.mobile.spec.ts` (390) on `e2e/themeNeutral.ts`: probes `html`, `body`, `#page-main`, the header label, the verdict `h2`, the first `main section.rounded-2xl` and its `h3`, the first primary button; on Cashflow at 1440 only, also `[role=dialog]` after a click on «Nuova Spesa» (hidden below `desktop:`; closed with «Annulla», nothing submitted — the 390 drawer is probed from NOVE-20 on); properties `font-family`, `font-weight`, `font-size`, `letter-spacing`, `text-transform`, `color`, `background-color`, `background-image`, `border-top-color`, `border-top-left-radius`, `box-shadow`; pages `/dashboard`, `/dashboard/history`, `/dashboard/cashflow?tab=tracking`; the themes are `COLOR_THEMES.filter((t) => COLOR_THEME_META[t].costume === null)` (the palette themes: six, today and after NOVE-12/13), each in `light` and `dark`, set before navigation by `addInitScript` on `localStorage['color-theme']` and next-themes' `localStorage['theme']`; the baseline is keyed viewport (`'1440'` \| `'390'`) → path → `theme·mode` → probe → properties (`null` for a probe absent from the page); `THEME_NEUTRAL_RECORD=1`: each spec file reads the JSON, replaces only its own viewport key and writes it back; otherwise `toEqual` | strip the gate from the tile-shadow rule: every tile loses `shadow-sm` |
| E2 | `shell.boot{,.mobile}.spec.ts`: `getComputedStyle(document.body).fontFamily` starts with `Geist`, not `Geist Mono`; `[...document.fonts].some((f) => f.family.replace(/['"]/g, '') === 'Geist' && f.status === 'loaded')`; `[data-costume-scope]` counts 0 on `/` and `/login`, 1 on `/dashboard` | variables back on `<body>`; `CostumeScope` around the root layout's children |

R1-R3 run in the `dom` project with `vi.mock('@/contexts/AuthContext')`, `vi.mock('@/lib/services/userPreferencesService')`
and next-themes' `useTheme` mocked; R1 renders `<Tabs value="aspetto"><AspettoTab /></Tabs>` (`SettingsTabPanel` is a
Radix `TabsContent`); R3 runs twice, `matchMedia` answering `matches: true` (the Drawer) and `false` (the Dialog).

## 7. Guided verification (WORKFLOW.md § 2)

Expected outcome, declared first: on the emulators the app reads in Geist Sans everywhere; Panoramica, Storico,
Cashflow and a dialog look the same as before in each of the six themes and both modes; the swatches show each
theme's real colours; nothing on the landing carries `data-costume` or `data-costume-scope`.

- **A**: `tsc`, lint, Vitest (three zones), E1 in compare mode, and the full `npm run test:e2e` once after 4.1 and
  once at the end (known flakes: doc/guide/e2e-playwright.md) — the font moves every page's text metrics; a spec
  turned red by the font is a stop-and-ask; a `mobile:budget` entry moved by the font is re-recorded (§ 8). A Vitest or Playwright test that
  queried an eyebrow or a headline holding a digit by its exact text node moves to `getByRole('heading', { name })`.
- **B**: emulators + seed; the baseline recorded right after 4.1 (`THEME_NEUTRAL_RECORD=1`), committed.
- **C (browser, the session)**: the six themes × two modes at 1440 and 390 on Panoramica and Impostazioni › Aspetto;
  a screenshot pair per theme before/after 4.2-4.7 in the scratchpad, compared by eye; `/` and `/login` unchanged.
- **D (data)**: `document.querySelector('[data-costume]')` is `null` on every page for the six themes.
- **E**: `localStorage['color-theme'] = 'sepia'` → the default, no attribute (the guard of today).
- **F (owner, at his «pronto»)**: the mirror in his own theme and mode; Geist read on his screens.
- **G** (the two budgets close by README.md § 8's ONE rule, decisions 33 and 34): `mobile:census` + `mobile:budget`, `perf:budget`; remove fixtures and mirror.

## 8. Putting it into service

One PR to `develop`. No data change. The Geist fix moves line breaks: the font is this spec's NAMED cause, so every `mobile:budget`
entry it moves is re-recorded with `raisedBy` «Geist Sans applied» in `doc/guide/prima-schermata-misure.md` § register
(per entry before → after), without asking (decision 33); an entry already red before 4.1, measured on `develop`
the same day, keeps its own decision; an entry that moves for another cause stops the session. `perf:budget`
follows README.md § 8 (decision 34); each route's headroom (ceiling − measure on the untouched branch) is read
before 4.2.

## 9. Documentation

- `doc/guide/temi.md`: new § «Il costume» (the two attributes, the scope properties, the gated rule set, the layered
  eyebrow, emblems, the font loading rule, the four-block recipe); «Adding a theme» rewritten (CSS +
  `COLOR_THEME_META`; tests and swatches derive); the Files line gains the new modules; the two stale paths (`:3`, `:127`) name
  `COLOR_THEME_META` in `lib/constants/colorTheme.ts` and the swatches in `components/settings/tabs/AspettoTab.tsx`.
- `.impeccable/design.json`: the three strings that copy DESIGN.md `:284`, `:359` and `:1409` (`:906`, `:976`, `:1198`)
  take § 4.8's AFTER text — a scripted replacement of those strings only, checked with `JSON.parse` after.
- `AGENTS.md` § Color Theme System: «a mechanism beyond palette and radius goes through the costume contract
  (`data-costume`, `data-costume-scope`, the scope properties) — doc/guide/temi.md § Il costume (<the implementing session's date>)».
- `CLAUDE.md`: the Geist Known Issue removed; «Themes» line names the costume; «Latest».
- `DESIGN.md` § 4.8; `doc/guide/velocita.md` § Registro if a ceiling moves; `Draft Release Temp.md`;
  `doc/nove/README.md` § 6.

## 10. Declared out of scope

- **The two costume themes** (palettes, scope blocks, fonts, emblems): heirs NOVE-12 (Egeo), NOVE-13 (Orbita, with
  the resource bar that `ThemeCostume.resourceBar` already names).
- **Every page and dialog beyond the primitives** — per-page emblem ids, the modal's own frame and title, every portalled primitive other than
  `ResponsiveModal`'s content (popover, select, dropdown menu, tooltip, sheet, alert dialog, a raw `DialogContent`:
  until NOVE-19 they render with the palette and the default costume even when opened from a dialog), the sidebar, the Consulente's and the Compravendita's own cards, the Sankey's
  hexes (`lib/utils/cashflowSankey.ts`), `components/ui/switch.tsx:14`,
  `components/performance/UnderwaterDrawdownChart.tsx:102-109`, `components/ui/sidebar.tsx:493`: heirs NOVE-19 (Panoramica,
  Patrimonio, Cashflow) and NOVE-20 (the rest and the dialogs).
- **Toasts** (outside the dashboard's DOM): heir none, declared — they stay default.
- **A per-theme `--ai-accent`** (doc/guide/temi.md § blind spots): heir none, declared.

## 11. The prompt that implements it

```
Ciao, in questa sessione vorrei implementare la spec doc/nove/NOVE-11-temi-meccanismi.md

Contesto, prima di toccare qualsiasi file (le regole del repo cambiano il modo di lavorare):
- Leggi WORKFLOW.md (regole di sessione e di collaudo; l'ultima sezione dice come si
  applicano in questo repo)
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- CLAUDE.md (l'indice: che cos'è e dove sta ogni cosa, lo stato corrente) è già nel
  contesto: usalo per trovare la guida giusta
- Leggi la spec doc/nove/NOVE-11-temi-meccanismi.md e l'indice della serie
  doc/nove/README.md (§ 3 decisioni, § 4 scelte adottate, § 7 contratti condivisi, § 8 regole)
- Leggi doc/guide/temi.md, shell.md, dialog.md, prima-schermata.md, velocita.md,
  e2e-playwright.md PRIMA di scrivere codice
- Leggi DESIGN.md (The Zero-Chroma Rule, The Data Owns Color Rule, The Mono Mandate,
  The AI-Accent Rule, The Modal-Is-A-Tile Rule) e PRODUCT.md
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

Implementa la spec così com'è scritta, nell'ordine: Geist su <html> con il suo test e2e e
le misure di mobile:census/mobile:budget prima e dopo; la registrazione della linea di base
(THEME_NEUTRAL_RECORD=1); il registro COLOR_THEME_META, i quattro test derivati e le
swatch; il contratto del costume (attributi, CostumeScope, proprietà, regole, componenti) e
i primitivi; il confronto con la linea di base; l'emendamento a DESIGN.md alla lettera. I
test PRIMA del codice, ciascuno visto rosso con la sua mutazione. Fermati e chiedimi se: una
voce di mobile:budget si muove per una causa diversa dal font nel confronto con develop dello stesso giorno, stessa build
(quelle mosse dal font le riregistri tu con raisedBy, voce per voce prima → dopo); uno spec E2E
diventa rosso per il font; perf:budget, misurato prima e dopo sulla stessa macchina, supera un tetto di più di 1 KB gz (fino a 1 KB lo alzi tu, con raisedBy e una riga in velocita.md § Registro); il confronto con la linea di base trova una differenza su uno dei dodici blocchi.
Collaudo: § 7, la F al mio «pronto». Un branch, un commit, solo dopo il mio OK con il
riassunto del diff. SESSION_NOTES.md non si committa.
```

Model: **Opus 5.5**, effort **medium** — an L spec that fixes a shared contract read by four later specs, with a perf
and a first-screen measure. Estimated size: 1 session, ~5 h; ~250 lines of code and CSS, ~350 of tests, two E2E files
and a baseline.
