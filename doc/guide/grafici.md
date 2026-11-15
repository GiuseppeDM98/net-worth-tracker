# Grafici — Recharts and the hand-written SVG charts

> **When to open this guide** — anyone touching a chart: `components/ui/charts/recharts.ts` (the ONE door to recharts), every `*Chart.tsx`, every `*Sparkline.tsx`, `components/hall-of-fame/RecordBars.tsx`, `lib/hooks/useChartColors.ts`, `lib/hooks/useMorphingSeries.ts`, `components/ui/series-legend.tsx`, `components/ui/chart-hover.tsx`, `components/ui/ring-chart.tsx` or `lib/utils/ringChart.ts`. The chart colours (the theme slots, the provider, the contrast floors) have their own guide, `doc/guide/temi.md`. `AGENTS.md` keeps the stub under its heading «Recharts»; here is the full rule.

## Files

- **Grafici**: `components/ui/charts/recharts.ts` (the ONE door to recharts: the one module of real code that keeps the library in ONE chunk), every `*Chart.tsx` (`components/{cashflow,dashboard,fire-simulations,goals,monte-carlo,performance}/…`), every `*Sparkline.tsx` (`components/assets/AssetSparkline.tsx`, `components/dashboard/NetWorthSparkline.tsx`), `components/hall-of-fame/RecordBars.tsx`, `lib/hooks/useChartColors.ts`, `lib/hooks/useMorphingSeries.ts` (a hand-written SVG gliding between windows), `components/ui/series-legend.tsx` (`SeriesLegend`), `components/ui/chart-hover.tsx`, `components/ui/ring-chart.tsx` + `lib/utils/ringChart.ts` (the ring, § The ring); tests `__tests__/ringChart.test.ts`, `__tests__/ringChart.dom.test.tsx`, `__tests__/rankedRows.test.tsx`, `e2e/ring-chart{,.mobile,.tablet}.spec.ts` (body `e2e/ringChartSuite.ts`, helper `e2e/ringFit.ts`); the minor tiles' (2026-11-15): `e2e/ring-chart.{split,centri,owners}{,.mobile}.spec.ts`, `e2e/ring-chart.dividendi.spec.ts` and one assertion in `e2e/cashflow.mortgage.spec.ts`, `__tests__/chartColorsContext.test.ts`, `__tests__/actionColorContrast.test.ts`, `e2e/bundle.lazy.spec.ts`

## Recharts
- **Import recharts from `@/components/ui/charts/recharts`, never from `'recharts'`** (2026-09-30): the one module of
  real code that keeps the library in ONE chunk (AGENTS.md § Dynamic Imports and Module Hygiene); a primitive it lacks
  is added there.
- **`useChartColors()` is mandatory for every series** — the theme's slots from `ChartColorsProvider` (read once per
  theme in the dashboard layout since 2026-10-08, so a host renders once; its own read after paint without the
  provider), `chartColors[0..4]` as props — **once per page or tile, never once per row** (2026-10-07): a list of small charts takes the palette as a
  prop (`AssetSparkline`'s `colors`), as `useActionColors` does; a hook per row was a rAF and a `getComputedStyle` each.
- **A series CAN drive the page, but no page does today**: `onMouseMove`'s `activeTooltipIndex` (a number OR a numeric
  string in 3.x), lift the index's PERIOD, handlers only under `(pointer: fine)`, a pure module resolving the followers.
  Storico's scrub was retired on 2026-09-13 (DESIGN.md → The Scrub Rule; the example is `git show 4b0a2dd`). A
  hand-written SVG gliding between windows resamples the OLD series (`lib/hooks/useMorphingSeries.ts`).
- **Never pass `useChartColors()` to a Nivo/react-spring component**: it cannot interpolate hex→oklch and throws. Sankey
  colours are HEX — hardcoded, or a token resolved by `useCssColorTokens` + `lib/utils/cssColorToHex.ts` (taking
  `enabled`) — doc/guide/cashflow-analisi.md.
- **Three tooltip style props, none inherited**: `contentStyle`, `labelStyle`, `itemStyle` (without `itemStyle` the rows
  are invisible on dark) — module-level `as const` objects on `var(--card)`/`var(--border)`/`var(--card-foreground)`.
- **Axis ticks and legends are numbers: the Mono Mandate covers them, a Tailwind class cannot reach them** — `tick=
  {CHART_TICK_STYLE}` (canonical in `costCenterStyles.ts`) on every axis; `<Legend>` needs `wrapperStyle`.
- **`<Legend content=>` needs a module-level component** (an inline arrow flickers); `Legend` reads `<Bar fill>`, not
  `<Cell>`; **`formatter`'s first param is `ValueType | undefined`**.
- **The legend is `SeriesLegend`, never Recharts' `<Legend>`** (`components/ui/series-legend.tsx`, 2026-09-20): `<Legend>`
  prints labels in the series colour (3,64 · 4,02 · 2,62:1 measured) and names icons in English. One entry per SERIES;
  **one word, one colour per page** (a series named «Mercato» takes the slot «Mercato» has everywhere on that page); a
  reference series that is not a part of the total takes the neutral ink, dashed.
- **Accessibility goes on the chart, not a wrapper**: Recharts 3.x puts `tabIndex=0` + `role="application"` on its
  `<svg>`, so pass `role="img"` + `aria-label` + `accessibilityLayer={false}`; `role="img"` hides the legend, so the label
  carries the colour→name mapping.
- **Never stack bands whose components can go NEGATIVE** (a negative segment draws downward): one area under a line,
  the decomposition in the tooltip. **100%-stacked: pre-normalise the rows, no `stackOffset="expand"`**, normalised over
  what is DRAWN (`historyComposition.ts` names the residual as a band — a stack short of 100 reads as missing data).
  **A «composizione» chart without `stackId` overpaints itself**: grep the series for `stackId` first.
- **`fontSize` on `<Legend>` is silently dropped** — size it through `wrapperStyle`. **`interval="preserveStartEnd"`
  centres the last tick on the plot's edge** — reserve `margin.right`; a negative `margin.left` clips «100%» to «0%»,
  and a cropped number reads as a wrong number.
- **Rolling charts always render**, with an inline empty message; time-bucketed data lives in a tested pure layer
  (`cashflowTimeSeries.ts`).
- **Server-cached chart data has colours baked in — remap at render time for EVERY array**; positional remap is safe
  only without cross-page identity: asset classes remap via `ASSET_CLASS_CHART_INDEX[d.assetClass]`.
- A sticky `<thead>` needs a fully opaque token, never an alpha background.

## The ring (2026-11-12)
- **Parts of one positive whole are `RingChart`** (`components/ui/ring-chart.tsx` on the pure `lib/utils/ringChart.ts`;
  DESIGN.md → The Ring Rule): hand-written SVG, never a Recharts `<Pie>`. The contract (read by the minor tiles and by
  Analisi): `RingSegment{key,label,value,color}`, `buildRingArcs`, `foldRingSegments(segments, restLabel)` (past six
  parts the five largest and one «Altre N …»), `ringSwatchAt`, `isRingWhole` (two positive parts or more, none that
  PRINTS below zero — −0,50 € prints «−1 €»), `describeRingSegments` (the `aria-label`), `formatRingCenter`,
  `ringCenterMaxChars`, `ringCenterFontPx`; `RING_CATEGORY_COLORS` (six slots, `--chart-2, 7, 6, 3, 8, 4`: income's
  first, never `--chart-1` nor `--chart-5`), `RING_REST_COLOR` (`--muted-foreground`); `RING_LAYOUT_CLASS` /
  `RING_ROWS_CLASS` (side by side from a 400px container, stacked below); DOM hooks `data-ring`,
  `data-ring-max-chars`, `data-ring-center="hole" | "above"`. `RingChart` renders nothing under two parts.
- **`RankedRows` as a legend**: `bars={false}` and a `swatch` per row and per remainder — an 8×8 swatch before the
  label, no bar track, the share column hidden only under a 200px container (the floors without a bar add up to 194px).
- **The figure stays inside its hole** (the owner's remark of 2026-11-12): `ringCenterMaxChars(size)` is the chord of
  the hole at the figure's far edge (figure + 11px label centred), less 8px of air, divided by Geist Mono's 0,6 em
  advance — 7 characters at 120 and 96px, 4 at 72; `formatRingCenter` takes the first form that fits («31.900 €»,
  «31,9k €», «32k €», «1,2 Mln €», «1 Mln €»), and with none the full figure stands above the ring. Held by
  `__tests__/ringChart.test.ts` and in the browser by `e2e/ringFit.ts` (`expectRingFiguresInside`: the four corners of
  the printed box within the hole's radius) through `e2e/ringChartSuite.ts`, the one body of
  `e2e/ring-chart{,.mobile,.tablet}.spec.ts`.
- **`motion.circle` + `pathLength` is a trap**: Framer reads `pathLength` as its own drawing value and rewrites the
  dash array. The arcs are plain `<circle>`s with a CSS transition on the two dash properties (400 ms ease-out-quart,
  `none` under `useReducedMotion`), and the first render carries the final dashes — no draw-in on mount.
- **The homes** (DESIGN.md's «Homes» sentence): Previdenza «Versato», «Entrate per categoria» on Tracciamento and the
  Panoramica, Panoramica «Composizione», Patrimonio «Classi» (2026-11-12), and since 2026-11-15 the minor tiles —
  Divisione «Quota» (`splitRingSegments`), «Mutuo»/«Prestito» (`mortgageRingSegments`), «Intestatari» on «Valore» and «Carico»
  (`ownershipRingSegments`), a cost centre's «Costo» (`costCenterRingSegments`) and «Per sottocategoria» (`subCategoryRingSegments`, the owner on the
  mirror tour), and Dividendi «Chi paga di più»
  (`payerRingSegments`), each keeping today's form when its parts are not one positive whole of two or more. Each guide
  says what its ring draws.
- **A row beside a folded ring takes `ringSwatchAt`** (the Quota's people, the owners): past six parts the rows from the
  sixth on wear the fold's grey, never the slot their index would give.
- **A ring builder never lives in a module a shared narrative imports** (2026-11-15): `ownershipRingSegments` is in
  `lib/utils/ownershipRing.ts`, not in `ownershipBasis.ts` (value-imported by `patrimonioNarrative`, hence by every page),
  as `compositionRing.ts` and `categoryRing.ts` are their own modules (doc/guide/velocita.md).
- **A containment spec is proven red by moving the figure, not the form** (2026-11-15): «270 €», «500 €» and «1012 €»
  already fit their hole in full, so `formatRingCenter` returning the full form leaves their specs green — the seven
  specs of the minor tiles were seen red with the centre figure drawn at three times its font size in `ring-chart.tsx`.

## Per-page blind spots
- **An arc is a non-text signal beside rows that carry every figure: `--chart-3` on the default light card is 2,74:1**
  (doc/guide/temi.md § Per-page blind spots) — accepted for the ring (2026-11-12): the slots' contrast is a temi.md matter.
- **No ring in the PDF and the emails** (2026-11-12, declared, no heir): out of the DOM the parts stay rows (DESIGN.md →
  The Out-Of-DOM Token Rule). **`BalanceRing` stays a score, not a `RingChart`**: one figure on a bounded domain is not
  parts (DESIGN.md → Savings / Metric Ring Chart).
- **The minor tiles' rings have no tablet spec** (2026-11-15, declared, no heir): Divisione «Quota», «Mutuo»,
  «Intestatari», «Costo», «Per sottocategoria» and «Chi paga di più» are proved inside their hole at 1440 and 390 only
  (`e2e/ring-chart.{split,owners,centri,dividendi}*.spec.ts`; Mutuo and Dividendi at 1440); 768 and 1024 were looked at
  on the tour — the split and centri accounts have no tablet project.
- **The charts' blind spots live in each page's guide** (`doc/guide/<tema>.md` § Per-page blind spots): a chart that looks wrong on Storico, Rendimenti, Analisi, FIRE or Hall of Fame is read there first; the colour slots' open contrast entries are in `doc/guide/temi.md` § Per-page blind spots.
