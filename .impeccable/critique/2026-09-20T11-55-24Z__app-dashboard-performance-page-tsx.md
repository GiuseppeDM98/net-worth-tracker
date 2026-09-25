---
target: critique Rendimenti
total_score: 24
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
target_identity: "file:/Users/giuseppedimaio/Documents/Github.nosync/net-worth-tracker/app/dashboard/performance/page.tsx"
target_fingerprint: "sha256:001bf2551eb931e9187135639766bce24444d4def708de58b5ce4c56f200e7e7"
target_path: /Users/giuseppedimaio/Documents/Github.nosync/net-worth-tracker/app/dashboard/performance/page.tsx
timestamp: 2026-09-20T11-55-24Z
slug: app-dashboard-performance-page-tsx
closed: true
---
Method: dual-agent (A: design review on screenshots + source · B: detector + Playwright measurements) — browser evidence is Playwright's on the production mirror (`mirror@example.com`), the Chrome extension was not connected; 1440 light/dark and 390.

# Critique — Rendimenti (`app/dashboard/performance/page.tsx`)

> Side effect of the measurement: «Analizza con AI» starts the analysis on OPEN (`AIAnalysisDialog.tsx:148-152`, no submit step, no `AbortController`), so Assessment B's «open + Escape» fired 5 real calls to `/api/ai/analyze-performance` (8–14 s each, run to completion server-side, `Stream error: Controller is already closed` logged). No Firestore write seen. It is a finding of its own (P1 #2).

## Design Health Score

| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of System Status | 3 | `aria-busy` and the refresh dim are good; nothing says when the last snapshot was written; the custom range closes its dialog and answers later with a toast |
| 2 | Match System / Real World | 2 | Five words for «capitale» on one page (investito, contributi netti, fondi pensione, entrato nella base, immesso); «sul confine (registro e quantità)», «Pavimento di 3 mesi», «Δ vs tuo», «RF 4,1%» |
| 3 | User Control and Freedom | 2 | After Escape from BOTH dialogs focus lands on `body`, not the opener (measured 2/2); the AI analysis cannot be cancelled; the period is not in the URL; «Cambia base» goes to Impostazioni with no anchor |
| 4 | Consistency and Standards | 2 | `--chart-1` is «Portafoglio» in one chart and «Capitale immesso» in the other; two help vocabularies («?» vs «Come si calcola»); the pill is a `tablist` with no panel; the residual is green in the sentence and grey in its row |
| 5 | Error Prevention | 2 | Custom range: two free `type="date"` with no `min`/`max` from the snapshots; opening the AI dialog spends a call |
| 6 | Recognition Rather Than Recall | 3 | «Crescita di 100» has no Y scale; heatmap cells carry no figure, month letters repeat (G, M, A) |
| 7 | Flexibility and Efficiency | 2 | The verdict's benchmark is fixed to `BENCHMARKS[0]`; nothing sorts; no period deep link; «5 anni» and «Storico» fire the same yoc/current-yield pair twice |
| 8 | Aesthetic and Minimalist Design | 2 | Method footers of 2–6 lines on all 8 tiles; −4,1% printed 5 times, 15.743 four times inside one tile |
| 9 | Error Recovery | 3 | `ErrorNotice` before the empty branch is exemplary; one `Promise.all` over six reads blanks the page on a secondary failure, toast + notice both fire |
| 10 | Help and Documentation | 3 | Rich and correct, always on and never on demand |
| **Total** | | **24/40** | **Acceptable** (Storico was 27 before its fixes) |

## Design Specificity Verdict

**LLM assessment**: authored for this product, not interchangeable — «Negli ultimi 44 mesi» when the 5-anni window finds 44, the gap de-annualised below six months, an attribution that closes to the euro on screen (16.051 + 2902 − 911 + 722 + 408 + 317 − 89 + 1920 = 21.320), the measured base declared under the verdict. The weakness is Storico's before it was closed: the page typesets its own audit trail. None of the lessons closed on Storico on 2026-09-20 reached this page: zero `TileMethodNote` and zero `SeriesLegend` under `components/performance`, Recharts' `<Legend>` still in the Dettaglio (`PerformanceDettaglio.tsx:210`).

**Deterministic scan**: CLI on `app/dashboard/performance components/performance` → 0 findings. In-page overlay (injection succeeded, only a report-only CSP): 54 anti-patterns / 61 lines, 53 in `main`, 8 in the shell. Of the 53: 42 are the enumerated 9–11px ramp (`undersized-ui-text` 28, `tiny-text` 14 — not the page's), 8 `nested-cards` (one per tile) are FALSE positives (ancestors walked: no border, background, shadow or radius), 3 `line-length` are real (the base line, the Attribuzione footer, the Capitale e mercato footer) and the review found them independently. The overlay ran in Playwright's page; there is no user-visible tab.

## Overall Impression

The verdict answers «quanto rende, e rispetto a cosa?» in two seconds; then the page justifies itself — eight method paragraphs, a tile with five different «how much I put in», a 669px plot with no scale that makes −4,1% look like a crash. The biggest opportunity: one thing per tile, the method behind «Come si calcola» — and first, fix the largest figure of the Contributi tile, which is false today.

## What's Working

1. **The window is the measured one and says so**: «misurati dal 1 gen al 30 set 2026» in the header, a scope aside per tile, Plusvalenze declaring itself off-axis. No overflow in any of the five periods (`main` 1184/1184 at 1440, 390/390).
2. **The attribution is a ledger that adds up**, residual and «Altri N» uncoloured, a printed zero with no sign colour — Storico's fix, native here.
3. **State rigour**: failed read before empty, FX loading ranks nothing, the heatmap is a real `<table>` with `scope` and `sr-only` figures; 0 console errors, CLS 0,0001, 17/17 sections named, 10 Tabs from the skip link to «Dettaglio».

## Priority Issues

**[P1] «Hai investito 134.988 € dal registro» counts the migration's opening positions as purchases.**
- **What**: `computeInvestedCapital` sums every `buy`; its docblock says «Baselines COUNT as buys» (`lib/utils/assetTransactionUtils.ts:557`). The tile's popover promises «quanto denaro è andato sugli strumenti» (`ContributiTile.tsx:90-91`). **Verified on the mirror**: 10 baselines dated 2026-07-22 and 2026-08-15, inside YTD; real buys 49.089 €, sells 53.436 € (= the tile's), real net ≈ −4.346 €, not +134.988 €. The tile prints «acquisti 188.424 €» in nine months against 5058 € entered in the base; the page's own flow engine refuses that reading (a baseline «moves no money», doc/guide/rendimenti.md).
- **Why it matters**: the tile's first and largest figure tells a methodical saver they invested ~27× what crossed the boundary. Narrative Honesty.
- **Fix**: exclude `isBaseline` from the figure (or print it apart as «posizioni d'apertura»); reduce the tile to ONE answer — «Capitale entrato nella base», what the formulas use — with three uncoloured rows explaining it; the four «?» into one `TileMethodNote`.
- **Suggested command**: /impeccable clarify

**[P1] Touch and keyboard cannot read the heatmap, focus is lost, and a dialog spends on its own.**
- **What**: each month's figure lives in `title` and hover only: 0/12 cells focusable (0/48 on Storico), a tap shows nothing, and the footer says «Con il mouse…» at 390 too. After Escape from «Periodo personalizzato» and «Analizza con AI» focus goes to `body`. The «?» are 20×20 (4 collapsed, 14 with the Dettaglio open) at 2,3:1 non-text contrast. «Aggiorna» at 390 is 36×36; pill options 32 tall, «1 anno» wraps to two lines. The pill is a `tablist` with no `tabpanel` (AGENTS asks `semantics="radio"`), and with CUSTOM active every option is `tabIndex=-1`: the page's one axis leaves the Tab order. The underwater chart is `role="application"`, `tabindex=0`, unlabelled. The AI dialog starts on open and cannot be cancelled.
- **Fix**: heatmap cells tappable/focusable (or the figure printed in the cell at ≤ 2 years); focus returned to the opener; `semantics="radio"` with the first option at `tabIndex` 0 when nothing is selected; the 44→32 idiom for the «?»; `role="img"` + `aria-label` + `accessibilityLayer={false}` on the underwater chart; a «Genera» step and an `AbortController` on close in the AI dialog.
- **Suggested command**: /impeccable harden (then /impeccable adapt for 390)

**[P2] YTD's hero is an extrapolation, and the tile has two different gaps.**
- **What**: over 9 months the 54px figure is «+16,0% annualizzato»; the measured return is the 12px chip «+11,8% cumulato». The chip says «+3,4 pt vs 60/40», the reading 111,8 vs 109,3 = 2,5 points. It is labelled and consistent with «a gap sits on its figure's basis», hence P2; but the guide calls annualising few months «a forecast dressed as a measurement».
- **Fix** (owner's decision): below 12 months the hero is the period return, the chip the annualised, the gap on the hero's basis (`resolveBenchmarkGap` already supports it).
- **Suggested command**: /impeccable clarify

**[P2] Always-on method footers, repeated figures, Recharts legends.**
- **What**: DESIGN.md «The footer is ONE line»; measured: Contributi 6 lines, Rischio 4, Benchmark 4, Attribuzione 3 (96 cpl), Capitale e mercato 117 cpl, in the Dettaglio «Contributo per strumento» 192 cpl (7 lines at 390). Rischio repeats volatility and Sharpe 40px apart. In the Dettaglio Recharts' `<Legend>` prints 11px text in the slot colour: 2,74:1 («Sharpe 12M») and 3,64:1 light, 2,62:1 («CAGR 12M») dark — Storico's three numbers.
- **Fix**: `TileMethodNote` on the eight; drop the rows the reading already states (or the figures from the reading); `SeriesLegend` instead of `<Legend>`; Plusvalenze with one fiscal year = one sentence, no list.
- **Suggested command**: /impeccable distill

**[P2] Composition: an unscaled plot owns half the screen, three tiles are half void, blue changes meaning.**
- **What**: «Crescita di 100» is an SVG of **428×669** at 1440, min–max with no Y labels, the area filled to a non-zero floor; on touch no value at all. Consistenza has two `mt-auto` siblings (`ConsistenzaTile.tsx:27,30`), the legend floats mid-void; Benchmark (~170px) and Plusvalenze (~280px) void; the heatmap table is 6px wider than its container. `--chart-1` is «Portafoglio» in the first chart and «Capitale immesso» in the second (portfolio in amber). The heatmap legend says «−5% … 0 … +5%» while the steps are 1 and 2,5 (`MonthlyReturnsHeatmap.tsx:28`): +2,6% and +6,6% share a fill — a truth problem, not only a composition one.
- **Fix**: capped height + 2–3 mono Y ticks (min, 100, max); one `mt-auto`; portfolio on `--chart-1` in both; legend «<1 · <2,5 · ≥2,5%».
- **Suggested command**: /impeccable layout

## Persona Red Flags

**Alex (power user)**: cannot deep-link «3 anni», choose the verdict's benchmark, or sort Benchmark/Attribuzione; «Fino a» prints «set 26» seven times to serve an exception; the custom range has no presets and no snapshot bounds; ROI/CAGR/IRR sit behind the greyest line on the page.

**Sam (keyboard / screen reader)**: the pill is announced as tabs that control nothing and vanishes from the Tab order under CUSTOM; focus is lost on every Escape; the Capitale e mercato `aria-label` concatenates every month (thousands of characters on Storico); four identical «?»; «Dettaglio» is not a heading and its `aria-label` overrides the visible description.

**The monthly accumulator («quanto rende, e rispetto a cosa?» in seconds)**: gets the answer in 2 seconds and remembers 16,0 instead of the measured 11,8; is told they «invested 134.988 €»; sees a plot that looks like a crash; on the phone cannot read any month of the heatmap, the page is 4511px long and two attribution rows both read «WisdomTree Physi…» (−911 and +317).

## Minor Observations

- The Capitale e mercato footer says «versamenti netti registrati in Cashflow» but the series is `externalFlowOf`: on this account the measured flows (198.681 ≈ start + 5058 + 31.863, not 3795). False whenever `flowSource !== 'cashflow'`.
- `PerformanceDettaglio.tsx:299`: a literal «oggi» on a range closed in the past (the `WindowEnd` rule).
- Sharpe and Sortino take the sign colour: a Sharpe of 0,2 would be green under «il rendimento paga poco il rischio». A ratio is not a gain.
- «Δ vs tuo −5,0» in red on ACWI's row reads as ACWI's loss.
- The residual is `signed` (green) in the Attribuzione reading, muted in its row.
- `AIAnalysisDialog` prints `maxDrawdownDate` (the guide says no longer displayed) and «N € versati» from `netCashFlow`, contradicting Contributi.
- `doc/guide/rendimenti.md:170` is stale: both dialogs are already on `ResponsiveModal`; the gap is the form, not the chrome.
- Below 1440 the empty state shows the pill but not «Periodo personalizzato» (dialog mounted, unreachable).
- `ContributiTile.tsx:84`: `tablet:grid-cols-2` is a viewport breakpoint inside a 3-column tile (Storico's fix was a container query).
- «5 anni» and «Storico» resolve to the same start date and send two identical yoc/current-yield pairs; 4 Recharts `width(-1) height(-1)` warnings on load.
- «3795 €» beside «134.988 €» is the declared it-IT behaviour, but in the 22px KPI pair it looks like a slip.

## Questions to Consider

1. If the formulas neutralise exactly one number (5058 €), why does the tile called «Contributi» open on two numbers they do not use?
2. If every footer vanished tomorrow, would the page lose anything? Who are they written for — the reader, or past bug reports?
3. Plusvalenze ignores the axis and «Capitale e mercato» restates Attribuzione's total: are they tiles of this page, or of the Dettaglio?
