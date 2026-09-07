# Rendimenti

> **Quando aprire questa guida** — chi tocca `app/dashboard/performance/page.tsx`, `components/performance/*`, i moduli puri `lib/utils/{performanceNarrative,performanceSummary,performanceBase,drawdownSeries}.ts` o `lib/services/performanceService.ts`. In `AGENTS.md` resta lo stub con l'essenziale; qui c'è la regola completa. Moduli e file: `CLAUDE.md` → *Key Files* → la voce di quest'area. Spec Playwright: `e2e/performance.degraded.spec.ts` sulla fixture `npm run e2e:seed -- performance` (struttura e cablaggio, non l'aritmetica — vedi *Per-page blind spots*).

## Rendimenti — measurement base (`lib/utils/performanceBase.ts`, `drawdownSeries.ts`)

- **Any exclusion read from `byAsset` MUST be backfilled across the pre-`byAsset` months, or it becomes a phantom crash**:
  subtract a **constant `E₀`** (the excluded total of the earliest snapshot that HAS one), which cancels in `(V_end −
  CF)/V_start`. A snapshot that has `byAsset` but omits the asset is evidence of absence → subtract 0, never backfill.
  **Documented approximation**: the backfill fixes the DENOMINATOR of historical months, not the numerator.
- **ONE resolution, TWO callers** (2026-09-06): `resolvePerformanceBase({ snapshots, assets, contributions, settings })` is
  the only way to build the base — `getAllPerformanceData` AND the page's `cachedSnapshots`/custom range both call it. It
  returns the projected snapshots, `excludedAssetIds`, `pensionEntryMonth` and the `pensionFlows`; `buildCacheKey`
  fingerprints all of them (a contribution recorded today rewrites the flows while every snapshot stays byte-identical).
- **The pension toggle wins over the allocation role.** A `pensionFund` answers to «Includi i fondi pensione» ONLY: its
  `allocationRole` (almost always `excluded`, two of the real account's three through the legacy flag) never vetoes it.
  Until 2026-09-06 the two exclusions were in OR and the toggle was a silent no-op on any fund marked excluded.
- **Funds in, but honest: the entry is a flow, the contributions are flows.** With the toggle ON the funds enter the base
  from `pensionEntryMonth` — the first snapshot at or after `resolvePensionReturnStart` (the setting, else the first
  recorded contribution) whose breakdown carries a fund — and stay OUT before it (actual values, `E₀` before `byAsset`),
  because before that month their growth is untracked contributions. In the entry month their whole value is a
  `PensionBoundaryFlow` of kind `entry`; every later contribution that came from OUTSIDE (TFR, employer, a voluntary
  withheld from payroll = no `linkedExpenseId`) is a `contribution` flow in its `valueEffectMonth`. With the funds OUT,
  a voluntary paid from a cash account (`linkedExpenseId` set) is a `withdrawal` flow: cash left the base. **The one
  rule: a contribution is a flow iff it crosses the base's boundary.** A toggle that is ON with nothing trackable keeps
  the funds out and the caption says why. On the real account (2026-09-06): YTD TWR 12,59% OFF, 12,02% ON, 16,28% had the
  contributions been read as return.
- **The flows ride a second channel, never `netCashFlow`.** `CashFlowData.pensionFlow` is merged by `mergePensionFlows`
  inside `calculatePerformanceForPeriod`/`calculateRollingPeriods`; `buildCashFlowMap` sums `externalFlowOf(cf)` =
  `netCashFlow + pensionFlow`, so TWR, volatility, drawdown, heatmap, Evoluzione and IRR see it without knowing; ROI and
  CAGR use `netCashFlow + pensionFlow` explicitly. `metrics.netCashFlow` stays the cashflow's savings (the Contributi
  tile's «Contributi netti»); `metrics.pensionFlow`/`pensionEntryFlow` are shown apart, with the entry named by month —
  a 31.852 € entry printed as «messi da parte» would be a lie.
- **Drawdown runs on a geometric TWR index, never on `netWorth − cumulativeCashFlow`**: `buildTwrIndex` chains the SAME
  monthly return the heatmap shows.
- **The cache document is written through `removeUndefinedDeep`** (2026-09-06): the metrics carry explicit `undefined`s
  (`maxDrawdownDate` when the portfolio never fell, `dividendCategoryId` without the setting) and the client Firestore
  rejects them, so on such an account `performance-cache/{userId}` was NEVER written and every visit recomputed from
  scratch — the only trace a `console.warn` in the browser. Found because `e2e/performance.degraded.spec.ts` asserts on
  that document; the optional fields deserialize as absent.

## Rendimenti — the measurement window (`lib/services/performanceService.ts`)

- **The first snapshot of a period is ALWAYS the starting valuation, never a measured month — the window opens on the 1st
  of the month AFTER it.** A snapshot is an end-of-month photograph; this also fixes gaps for free.
- **`resolveHasBaseline(snapshots, nominalPeriodStart)` is the ONE answer to "is that first month before the period?"** —
  data-driven, never inferred from the period type. **The page must NEVER re-derive the window from `new Date()`**:
  `metrics.nominalPeriodStart` travels in the payload and `selectSnapshotsForMetrics` re-selects what the service used.
- **`monthsElapsed` vs `calculateMonthsDifference`: distance vs coverage.** Jan→Mar is 2 elapsed, 3 covered;
  annualization always uses the elapsed count. **IRR signs are the INVESTOR's stream** (`−startNW`, `+endNW`), and
  `null` means "no rate explains this stream", not "the solver gave up".
- **No silent filters inside a single metric.** Volatility must not drop extreme monthly returns — the removed value is
  either an untracked movement (still visible in the heatmap) or a real crash. Floors instead: volatility/Sharpe need
  ≥ 3 monthly returns, else `null` with a reason.
- **`buildCashFlowMap`/`monthKey` is the only monthly indexing of cash flows** — TWR, volatility, heatmap, Evoluzione and
  `drawdownSeries` read the SAME series, and flows in the same month are **summed**.
- **Below 6 months the hero states the PERIOD return, not an annualized one** (`resolveHeroReturn`): +4% over two months
  annualizes to "+26% a year", a forecast dressed as a measurement. Only the displayed figure changes. **ROI and CAGR
  correct for cash flows in two DIFFERENT ways and are not convertible**, so both tooltips state both formulas.
- **Benchmark**: every model is EUR-converted (`applyFxConversion`, the portfolio is EUR-denominated) before the verdict's gap and the Benchmark tile are computed — one basis for the whole page since 2026-08-25 (the old table's USD default and its toggle are gone); while FX is loading nothing is ranked, only a FAILED FX route falls back to USD and the tile's aside says so.
  `benchmarkPeriodReturn.ts` is the single source for indexing + annualization — never re-inline it. Each benchmark's
  final value comes from **its own** last available month, or every cell renders "–".

## Rendimenti — a verdict over tiles (`app/dashboard/performance/page.tsx`, `components/performance/tiles/*`, `lib/utils/{performanceSummary,performanceNarrative}.ts`)

- **The subject is the window MEASURED, never the picker's name**: `describePerformancePeriod` says «Negli ultimi 11 mesi» when a 1-anno window finds eleven snapshots (the current month's is not there yet), «Da aprile» for a YTD whose first measured month is April. `numberOfMonths` and `startDate` come off the payload.
- **A gap beside a figure is on that figure's basis** (`resolveBenchmarkGap`): below six months the hero is the period return, so the «N punti sopra il 60/40» clause de-annualises BOTH rates with `(1+r)^(n/12) − 1` — the annualised gap next to a period figure lied by a factor of three on four months. The headline's tone still comes from `summarizePerformance` (risk-adjusted vs the risk-free rate); the benchmark only decides «più del / meno del / quanto il 60/40», and «meno del» takes the neutral dot.
- **Direction follows the printed figure** (`printed`, `printedGap`): `−0,04%` prints as `0,0%` with no sign and reads «Rende»; a gap under 0,05 points is «in linea» in the verdict AND «alla pari» in the Benchmark tile — `computeBenchmarkRanking` counts `beaten`/`tied` on the same rounding, so the two sentences never contradict each other. A ranking without a portfolio TWR has no reading at all (`describeBenchmarkRanking` → null), never «nessun modello ha reso meno».
- **The drawdown story is `resolveDrawdownStory` over `buildTwrIndex` + `findMaxDrawdown`**: peak/trough/recovery as `PeriodMonth`s, `monthsToRecover`/`durationMonths` in CALENDAR months (`monthSpan`), null below `AT_PEAK_THRESHOLD` (a −0,02% dip is not a story). The payload's `maxDrawdownDate`/`drawdownPeriod` strings and its index-step `drawdownDuration`/`recoveryTime` are no longer displayed; `measureDrawdownSpan` in the service keeps the index semantics for the cache, so do not mix the two on one surface.
- **Sortino, growth-of-100 and the ranking are pure** (`computeSortinoRatio` with the volatility floor and no outlier filter, `buildGrowthOfHundred` with an explicit base point — `benchmark: null` on it when no model series exists —, `computeBenchmarkRanking` up to each model's own last month, `annualizeTWR` on the page's `numberOfMonths`). `flattenHeatmapReturns` is the ONE percent→decimal bridge; the old copy inside `BenchmarkComparisonChart` (with a ±50% filter the service had removed) went with the component.
- **«Oggi» only when the window ends at the latest snapshot**: `describeGrowthOfHundred`/`describeCapitalAndMarket` take a `WindowEnd` (`endsAtLatest` = the period's last snapshot IS the cached series' last) and otherwise name the month («a fine dicembre 2024»). A custom range that closes earlier must not say «oggi».
- **Italian articles**: «diciotto» starts with a consonant — `startsWithVowel` in `patrimonioNarrative.ts` (now exported, shared) no longer lists 18, which fixes «l'18%»/«gli 18» on every page; the plural «dei/degli» before an amount reduces the printed leading group (`degli 8000 €`, `dei 18.000 €`, `dei 1500 €` — mille); an elided article never lands on a minus («ROI negativo dell'8,1%», «ha perso il 2,3%»).
- **Plusvalenze realizzate is off the axis** (`aggregateRealizedByYear` on ALL trades) and absent without a closed sale — then «Capitale e mercato» takes 12 columns (a conditional span, like the Panoramica's Costi/Obiettivi), never a hidden spacer for a tile that may exist.
- **The heatmap is a `<table>`** (years are rows, months columns, `scope` on both) with sign-token fills at three alphas (`heatmapCellClass`), the figure in the cell's `title`, an `sr-only` span and the hover reading (`ChartHoverTip` positioned from the cell's rect); no figure is printed in a cell, so the AA text floor does not apply to the fills.
- **The page effect defers `loadPerformanceData` with `setTimeout(…, 0)`** (react-hooks/set-state-in-effect): the function sets state synchronously and is declared before the effect now, so the linter can see it.

## Rendimenti — da dove viene il rendimento (`lib/utils/performanceAttribution.ts`, `components/performance/tiles/AttribuzioneTile.tsx`)

- **Euro, not percent, and reconciled.** `attributePeriodReturn` sums, per instrument, the price effect of every pair of
  the period's snapshots that BOTH carry `byAsset` (`attributeSelectedChange`, the Storico/Panoramica split: `q_prev ×
  (u_curr − u_prev)`, `u = totalValue/quantity` in EUR). The page's own gain over the same months is `Σ (ΔbaseNetWorth −
  externalFlow)` — the TWR numerator — and `unattributed = gain − Σ rows` is printed as the closing row («Non
  attribuito»: cash interest, a balance corrected by hand, a dividend recorded only in the cashflow), never spread over
  the rows. A per-instrument PERCENTAGE of a chained TWR is deliberately not shown: the arithmetic sum of monthly
  contributions is not the TWR, and a share of a small or negative gain explodes.
- **The three special cases are the overview digest's** (`computePriceEffectsByAsset`): a pension fund at price 1 is
  `Δvalue − contributions moved that month`, only for months AFTER `pensionEntryMonth` (the entry is a flow, the months
  before are not measured); real estate is measured gross of debt (`quantity × price`); a row at quantity 0 is a closed
  position — **fixed in `attributeSelectedChange` on 2026-09-06**: the cron writes every asset, sold ones included, and a
  `quantity 0, totalValue 0` row read as present had unit value 0, turning a 14.830 € sale into a −14.830 € PRICE effect
  (Xtrackers Overnight, 2026-08, visible in Storico › Valore per strumento).
- **Dividends per instrument come from the `dividends` registry** (`sumDividendsByAsset`: net EUR, `paymentDate` inside
  `[startDate, dividendEndDate]` — received, never announced), added to the instrument's row; the cashflow's dividend
  income is inside the gain, so a dividend recorded in only one of the two places lands in «Non attribuito».
- **Coverage is said** (`coverage.attributedMonths` of `measuredMonths`, first/last month): on a window that starts
  before `byAsset` (2025-11 on the real account) the reading names «nei N mesi con il dettaglio per strumento (da …)»
  instead of pretending the sum is the period's. Every sentence from `describeAttribution` (the tile) and
  `describeAttributionCoverage` (the Dettaglio's full table with Prezzo · Dividendi · Totale apart).
- **Grid**: the tile takes 7 beside Plusvalenze (5) and Capitale e mercato moves to 12; without a closed sale it takes 5
  beside Capitale e mercato (7). The tile lists the top 6 by |total| and folds the rest into «Altri strumenti», then
  «Non attribuito» and «Mercato» = the gain, so the rows visibly add up.

## Per-page blind spots

- **Rendimenti**: `e2e/performance.spec.ts` covers the structure only (the base caption, the attribution tile, the pension channel on and off); the six benchmark series + FX load on every visit (6h `staleTime`), only a FAILED FX route falls back to USD (the aside says so); Sharpe/Sortino use the settings' risk-free rate; the payload's `drawdownDuration`/`recoveryTime` are no longer displayed (the tiles read `resolveDrawdownStory`); a 1-anno window without the current month's snapshot measures 11 months and says so; the rolling readings live in `PerformanceDettaglio` (untested); `AIAnalysisDialog`/`CustomDateRangeDialog` keep their old chrome; **with the pension toggle ON, a period that straddles `pensionEntryMonth` carries the funds' whole value as a flow in that month** — «Capitale immesso» jumps by it and the Contributi tile names it as the entry, not as savings; **a pension fund's statement credited late still reads as a temporary market loss** (the Previdenza blind spot, now on this page too); **«Non attribuito» is not a bug**: it is every euro that moved the total without moving an instrument's unit value, and on the real account it was −2.326 € on a 16.836 € YTD gain.
