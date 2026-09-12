# Rendimenti

> **Quando aprire questa guida** — chi tocca `app/dashboard/performance/page.tsx`, `components/performance/*`, i moduli puri `lib/utils/{performanceNarrative,performanceSummary,performanceBase,drawdownSeries}.ts` o `lib/services/performanceService.ts`. In `AGENTS.md` resta lo stub con l'essenziale; qui c'è la regola completa. Moduli e file: `CLAUDE.md` → *Key Files* → la voce di quest'area. Spec Playwright: `e2e/performance.degraded.spec.ts` sulla fixture `npm run e2e:seed -- performance` (struttura e cablaggio, non l'aritmetica — vedi *Per-page blind spots*).

## Rendimenti — measurement base (`lib/utils/performanceBase.ts`, `drawdownSeries.ts`)

- **Any exclusion read from `byAsset` MUST be backfilled across the pre-`byAsset` months, or it becomes a phantom crash**:
  subtract a **constant `E₀`** (the excluded total of the earliest snapshot that HAS one), which cancels in `(V_end −
  CF)/V_start`. A snapshot that has `byAsset` but omits the asset is evidence of absence → subtract 0, never backfill.
  **Documented approximation**: the backfill fixes the DENOMINATOR of historical months, not the numerator.
- **ONE resolution, THREE callers** (2026-09-06, the PDF since 2026-09-07): `resolvePerformanceBase({ snapshots, assets,
  contributions, settings, trades })` is the only way to build the base — `getAllPerformanceData`, the page's
  `cachedSnapshots`/custom range AND `pdfDataService.preparePerformanceData` all call it (until 2026-09-07 the PDF ran on
  the RAW snapshots with no pension flow, printing a different TWR and ROI under the same title; its scope line now
  carries `describeMeasurementBase`). It returns the projected snapshots, `excludedAssetIds`, `pensionEntryMonth`, the
  `pensionFlows` and the `portfolioFlows`; `buildCacheKey` fingerprints all of them (a contribution recorded today, or a
  trade in the ledger, rewrites the flows while every snapshot stays byte-identical).
- **The flows follow the base** (2026-09-07, issue/PR #319 reimplemented on the base): a base is two halves, WHICH
  capital and WHICH flows, and the cashflow's savings are the capital that entered the NET WORTH — wrong the moment the
  base is a subset, since a purchase paid from an account outside it is capital coming in and the cashflow skips
  transfers. When anything is out of the base in any month (a role-excluded asset, the cash accounts with the toggle,
  the funds before entry or with the toggle off), `lib/utils/portfolioFlows.ts` measures the boundary crossings for
  every month whose two snapshots both carry `byAsset`: the **trade ledger** for an instrument from its first trade on
  (dated to the operation, buys plus fees in, sells net of fees out; a covered instrument with no trade in a month is a
  0, not a gap), the **quantity changes** `(q₁ − q₀) × p₁` for the others — a cash account inside the base counts its
  balance, so an internal purchase nets to zero and a deposit is outside money. A migration **baseline and an
  `adjustment` cover the instrument but move no money** (the original PR counted the baseline as a buy: −57% on the
  real account's July 2026). **Flow-opaque instruments** — every hand-valued asset except cash: pension funds,
  properties — contribute 0 to the quantity branch; the funds' money rides its own channel. A month with no entry is NOT
  measurable and falls back to the cashflow's savings; with nothing ever excluded the list is empty and not a decimal
  moves. Declared limits: end-of-month price on the quantity branch, a split or an in-kind transfer reads as a flow, a
  trade left out of the ledger vanishes, interest credited on an account inside the base reads as a deposit.
- **«Liquidità fuori dalla base»** (`performanceExcludesCash`, default OFF): the `cash` accounts leave the base by TYPE,
  their `allocationRole` untouched (Allocazione keeps them); a money-market ETF has a price and stays in. It exists only
  now because without the measured flows it would read every purchase as return. `classifyContribution` reads the
  account too (`sourceCashAssetId`): a voluntary from an account OUT of the base is capital that entered the fund
  (`contribution`); from an account inside, in a measured month, it is a `transfer` (+amount) that cancels the balance
  drop the quantities counted — capital moved within the base; with the fund out and the month measured, the withdrawal
  IS the balance drop and the channel carries nothing.
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
- **The flows ride their own channels, never `netCashFlow`.** `CashFlowData.pensionFlow` (merged by `mergePensionFlows`)
  and `CashFlowData.portfolioFlow` (merged by `mergePortfolioFlows`, `null`/absent = not measurable, `0` = measured and
  still) inside `calculatePerformanceForPeriod`/`calculateRollingPeriods`; `buildCashFlowMap` sums `externalFlowOf(cf)`
  = `(portfolioFlow ?? netCashFlow) + pensionFlow`, so TWR, volatility, drawdown, heatmap, Evoluzione and IRR see them
  without knowing; ROI and CAGR sum `externalFlowOf` over the series. `metrics.netCashFlow` stays the cashflow's savings
  (the Contributi tile's «Contributi netti»); `metrics.pensionFlow`/`pensionEntryFlow`/`pensionInternalFlow` and
  `metrics.portfolioFlow`/`flowSource`/`measuredFlowMonths` are shown apart («Capitale entrato nella base», with its
  coverage) — a 31.852 € entry printed as «messi da parte» would be a lie, and so would a purchase.
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
  annualizes to "+26% a year", a forecast dressed as a measurement. Only the displayed figure changes. **The Rendimento
  tile's second chip is the period's CUMULATIVE TWR** (`resolvePeriodReturnChip`, `deannualizeReturn` = the page's ONE
  de-annualisation; omitted below six months and at exactly twelve, where it would repeat the hero). Until 2026-09-07
  it was the ROI captioned «ROI del periodo» (issue #324): a gain over the FIRST month's capital, +126% against a +134%
  cumulative TWR on the real account, +73% against +30% on another — not the period's return and growing with the window
  on a saver's account. The ROI keeps its formula and lives in the Dettaglio, the AI prompt and the PDF, worded «sul
  capitale iniziale». **ROI and CAGR correct for cash flows in two DIFFERENT ways and are not convertible**, so both
  tooltips state both formulas, and a non-positive starting capital yields `null` for every ratio (a negative one
  flipped the sign in silence until 2026-09-07).
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
- **The heatmap is a `<table>`** (years are rows, months columns, `scope` on both) with sign-token fills at three alphas — the cells through `heatmapCellStyle` (an inline `color-mix(in oklab, var(--positive) 30|55|85%, transparent)`, because a class cannot cross-fade and an inline colour can), the legend's swatches through `heatmapCellClass` (the same steps as utilities) — the figure in the cell's `title`, an `sr-only` span and the hover reading (`ChartHoverTip` positioned from the cell's rect); no figure is printed in a cell, so the AA text floor does not apply to the fills.
- **The period TRANSFORMS, it is not replaced (2026-09-12, DESIGN.md → The Period-Transforms Rule).** There is no `key` on the tile grid any more (`periodRenderKey` is gone, and with it `renderKey`/`revealKey` down to the underwater chart): a period switch keeps every tile mounted and each one carries its own change. The hero glides from the figure it showed (`useCountUp({ fromPrevious: true })`), the two hand-written plots glide index by index (`useMorphingSeries` over `lib/utils/seriesMorph.ts`: the series on screen is RESAMPLED onto the incoming length by linear interpolation, then every index eases to its target in 420 ms; a `null` is a gap from the first frame; the resampling only ever describes where the glide starts, never what is measured — the hover reads `points`, the landed data, not the frame), the heatmap fades cell by cell (`transition-colors` on the inline fill) and its years enter/leave on a 220 ms fade (`AnimatePresence` over `motion.tr`), Attribuzione's rows re-rank in place (`layout="position"`, the 400/35 spring) and their bars slide to the new width (`transition-[width]`), the underwater area interpolates through Recharts. Reduced motion jumps everywhere (`useMorphingSeries` and `useCountUp` read `matchMedia`, the CSS transitions carry `motion-safe:`, the Framer pieces sit under `MotionConfig`). Only a REFRESH — which re-reads the data — dims the grid; a period switch never does. Two series measured on the same window (the seed's YTD and Storico, both feb–set of one year) draw the same path and glide nowhere: that is correctness, not a missing animation.
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
- **The residual guard says WHERE the residual comes from** (2026-09-07, the structural answer to issue #320, which
  asked for a per-month reconciliation between the ledger and the snapshots). A period's «Non attribuito» is a sum, and
  a sum hides whether it is nine small interest credits or one balance typed wrong in March: `attributePeriodReturn`
  also reads the residual MONTH BY MONTH against the month's starting base and returns in `residualMonths` (largest
  share first) every month whose unattributed part exceeds `RESIDUAL_ALERT_SHARE` (2%) of it. The tile's reading names
  the months in brackets («… non sono attribuibili a uno strumento (in marzo 2026 oltre il 2% della base)»), the
  Dettaglio's adds the figures and the three usual causes; at most three months are listed and the rest counted, never
  cut silently. It is a guard, not a diagnosis: the monthly figure is price effects only (the registry's dividends are
  netted at period level), so a large dividend credited to an account in the base trips it as honestly as a
  hand-corrected balance. A month that starts from a zero base has no share and is never flagged.

## Per-page blind spots

- **Rendimenti**: `e2e/performance.degraded.spec.ts` covers the structure only (the base caption, the attribution tile, the pension channel on and off); the six benchmark series + FX load on every visit (6h `staleTime`), only a FAILED FX route falls back to USD (the aside says so); Sharpe/Sortino use the settings' risk-free rate; the payload's `drawdownDuration`/`recoveryTime` are no longer displayed (the tiles read `resolveDrawdownStory`); a 1-anno window without the current month's snapshot measures 11 months and says so; the rolling readings live in `PerformanceDettaglio` (untested; a rolling CAGR with no measurable rate is `null` and leaves a gap, never a 0); `AIAnalysisDialog`/`CustomDateRangeDialog` keep their old chrome; **with the pension toggle ON, a period that straddles `pensionEntryMonth` carries the funds' whole value as a flow in that month** — «Capitale immesso» jumps by it and the Contributi tile names it as the entry, not as savings; **a pension fund's statement credited late still reads as a temporary market loss** (the Previdenza blind spot, now on this page too); **«Non attribuito» is not a bug**: it is every euro that moved the total without moving an instrument's unit value, and on the real account it was −2.326 € on a 16.836 € YTD gain — since 2026-09-07 the months where it exceeds 2% of the base are named, not explained (a dividend landing in cash trips the guard too); **on any account with something out of the base — the default — the months with `byAsset` on both snapshots neutralise the MEASURED boundary flows, not the cashflow's savings** (2026-09-07): a deposit on an account inside the base is a flow even if no income row exists, interest credited on it reads as a deposit, a split or an in-kind transfer as a purchase, a trade left out of the ledger vanishes for a covered instrument, and the months before `byAsset` (2025-11 on the real account) still use the cashflow — the Contributi tile says how many months were measured; **«Liquidità fuori dalla base» measured on the real account (2026-09-07, in memory)**: ON → YTD 15,36% (OFF 14,73%), 1Y 16,81% (16,03%), ALL 29,76% (27,08%), measured flows +5.058 € (the net buys) instead of −650 € (the accounts' net balance change); the four accounts are 3% of the base, so the gain is cleanliness, not size, and the ALL window stays mixed before 2025-12 because the cashflow's savings landed on accounts that are then outside the base.
