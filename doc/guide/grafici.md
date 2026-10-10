# Grafici — Recharts and the hand-written SVG charts

> **When to open this guide** — anyone touching a chart: `components/ui/charts/recharts.ts` (the ONE door to recharts), every `*Chart.tsx`, every `*Sparkline.tsx`, `components/hall-of-fame/RecordBars.tsx`, `lib/hooks/useChartColors.ts`, `lib/hooks/useMorphingSeries.ts`, `components/ui/series-legend.tsx` or `components/ui/chart-hover.tsx`. The chart colours (the theme slots, the provider, the contrast floors) have their own guide, `doc/guide/temi.md`. `AGENTS.md` keeps the stub under its heading «Recharts»; here is the full rule.

## Files

- **Grafici**: `components/ui/charts/recharts.ts` (the ONE door to recharts: the one module of real code that keeps the library in ONE chunk), every `*Chart.tsx` (`components/{cashflow,dashboard,fire-simulations,goals,monte-carlo,performance}/…`), every `*Sparkline.tsx` (`components/assets/AssetSparkline.tsx`, `components/dashboard/NetWorthSparkline.tsx`), `components/hall-of-fame/RecordBars.tsx`, `lib/hooks/useChartColors.ts`, `lib/hooks/useMorphingSeries.ts` (a hand-written SVG gliding between windows), `components/ui/series-legend.tsx` (`SeriesLegend`), `components/ui/chart-hover.tsx`; tests `__tests__/chartColorsContext.test.ts`, `__tests__/actionColorContrast.test.ts`, `e2e/bundle.lazy.spec.ts`

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

## Per-page blind spots
- **The charts' blind spots live in each page's guide** (`doc/guide/<tema>.md` § Per-page blind spots): a chart that looks wrong on Storico, Rendimenti, Analisi, FIRE or Hall of Fame is read there first; the colour slots' open contrast entries are in `doc/guide/temi.md` § Per-page blind spots.
