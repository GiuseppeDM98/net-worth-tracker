# Storico

> **Quando aprire questa guida** — chi tocca `app/dashboard/history/page.tsx`, `components/history/*`, `lib/utils/{storicoSummary,storicoNarrative,snapshotAssetBreakdown,historyComposition}.ts`, `lib/services/{chartService,snapshotService}.ts`. In `AGENTS.md` resta lo stub con l'essenziale; qui c'è la regola completa. File: `CLAUDE.md` → *Key Files* → *Storico / snapshots*.

## History and Snapshot Baselines

- Annual deltas use December of the previous year as baseline; Patrimonio `Anno Corrente` uses the previous month as a
  **hidden** baseline.
- **A snapshot is a frozen photo**: adding an asset never updates an existing one, so a Storico chart "missing" an asset
  you just added is a stale current-month snapshot, not a bug. **The snapshot cron runs DAILY — the name lies**
  (`0 18 * * *`, no day-of-month guard): storage granularity is monthly, write frequency daily.
- **Reuse `byAsset.totalValue` for historical per-instrument value — never recompute** (it already went through
  `calculateAssetValue()`); aggregate in `snapshotAssetBreakdown.ts`. **Gotcha**: `byAsset` is a newer field, so a month
  picker built on it must filter to non-empty `byAsset` — the resulting gaps are correct.
- **`byAsset.price` is RAW NATIVE CURRENCY**, so `totalValue ≠ quantity × price` for USD/GBp/real-estate; the per-unit EUR
  figure is `u = totalValue / quantity`, and attribution is `priceEffect = q_prev·(u_curr−u_prev)` + `quantityEffect =
  (q_curr−q_prev)·u_curr` (sum = Δ exactly).
- **TWR neutralises a cash flow only when the net-worth drop and the flow land in the SAME monthly snapshot** — the fix
  is data entry, never re-bucketing cash flows or excluding cash (CLAUDE.md → Known Issues has the mirror case).
- **Two CAGR formulas, intentionally different**: Storico's verdict = `(endNW/startNW)^(12/months) − 1` (wealth growth, said «versamenti inclusi»),
  Rendimenti = `(endNW/(startNW+netCashFlow))^(1/years) − 1` (investment return).
- **A form that CROSS-VALIDATES a sum against a declared total must offer a field for EVERY member of the union.**
  `CreateManualSnapshotModal` refuses to write unless `sumClassAmounts(byClass)` matches the declared `totalNetWorth`
  within 0.01, so a class it does not ask for does not make the form incomplete — it makes an honest snapshot
  **impossible**: with `trendFollowing` or `carry` in the portfolio the six hard-coded fields could never reach the
  total, and every attempt was refused with an arithmetic message that named no cause. The fields are generated from
  `ASSET_CLASS_SEQUENCE` with `ASSET_CLASS_LABELS`, and the pure helpers live in `lib/utils/manualSnapshotAmounts.ts`
  (`emptyClassAmounts` · `parseAmount` · `sumClassAmounts`). **The sum iterates the SEQUENCE, never the record's own
  keys**, so a stale key left by an older document cannot inflate the figure the user is asked to reconcile. The values
  stay STRINGS — an `<input type="number">` where an empty field, a half-typed `1.` and a `0` are three different
  things — and parsing happens once, at the boundary. The same test that pins one field per union member is what a
  future widening trips on.

## Storico — a verdict over tiles (`app/dashboard/history/page.tsx`, `components/history/tiles/*`, `lib/utils/{storicoSummary,storicoNarrative}.ts`)

- **The page has NO axis, and its growth is WEALTH growth.** `summarizeGrowth` measures first → latest snapshot with contributions included, and every sentence that prints its CAGR says «versamenti inclusi»; never feed it to a surface that means an investment return (that is Rendimenti's `(endNW/(startNW+netCashFlow))^(1/years)`, § History and Snapshot Baselines).
- **ONE pace for the whole page** (`summarizeGrowthPace`): the trailing-12-month average monthly increase in EURO, linear. It decides the headline (`accelerating` above the lifetime monthly average ×1.10, `slowing` below ×0.90, `steady` between, `losing` when the year is negative) AND `projectNextDoubling`. Both need the snapshot of EXACTLY twelve months earlier (a gap → `trailingDelta: null`, no clause, no projection) and the verdict needs `PACE_MIN_HISTORY_MONTHS` (24) of history; a projection beyond `PROJECTION_MAX_MONTHS` (600) is `null`, never a date. Do not "improve" it with a compound extrapolation: contributions do not compound.
- **A month is a pair of snapshots exactly one calendar month apart** (`summarizeMonthlyMoves`, `withMonthDeltas`): a gap is not a month, a zero delta is neither rising nor falling. The verdict names the best month, the Evoluzione tile the worst — never both in one place.
- **The verdict's «ultimo raddoppio» is always the GEOMETRIC one**; the Raddoppi tile follows its toggle (`prepareDoublingTimeData(ordered, mode)` — feed it SORTED snapshots, oldest first, it does not sort). `describeDoublings` reads `progressPercentage` from the milestone in progress and says «il primo» (no noun) when nothing is completed yet.
- **Driver is floored at `cashflowHistoryStartYear`** (`selectDriverYears`, the monthly rows filtered the same way): before it there are no transactions and «mercato» would silently be the whole growth. A year's savings are the cashflow rows dated from the month AFTER its baseline snapshot to the month of its last one (`prepareSavingsVsInvestmentData`) — the same window as its growth — so a running year never counts the materialised recurring rows of the months still to come, and the reading names the window («Da gennaio ad agosto 2026», `describeRunningWindow`); the shares of the two drivers (`resolveDriverShares`) exist only when both added, and the market's is the remainder so they sum to 100. `summarizeLaborMetrics` is the SDK-free recap (taxes passed in) and skips transfers, which are net-zero and stored positive. The split bar shows only the POSITIVE halves as shares of what was added; a negative half reads in words («mentre il mercato ha tolto», «hai speso … più di quanto hai incassato»), never as a share of a mixed-sign total. The monthly bars are side by side, never stacked (a negative segment breaks a stack).
- **Per-instrument attribution is `buildMonthAssetBreakdown`** — `attributeSelectedChange` one instrument at a time against the closest EARLIER month WITH a breakdown (a legacy month in between is skipped and the reading names the month it compares with); the month's total change runs on the UNION of both months' instruments, so a position sold in full still explains the drop without a row. `summarizeSelection` sums the ticked rows; nothing in the tile adds numbers.
- **`describeComposition` reads `CompositionSeries.breakdown`** (already ranked, maths in `historyComposition.ts`) and puts the subject in the band's own gender/number (`BAND_SUBJECTS`: «le azioni pesano», «la liquidità pesa»); the Previdenza clause appears only when the band exists and is not already one of the two named.
- **Recharts inside a tile that stretches**: the Evoluzione area sits in `relative min-h-[220px] flex-1` with `ResponsiveContainer` inside an `absolute inset-0` box — a bare `ResponsiveContainer height="100%"` in an auto-height flex child collapses to 0. A narrow range (< 10.000 € of span) prints full-euro ticks: compact ones all round to the same «€30k».
- **`SelectTrigger size="sm"` emits `data-[size=sm]:h-8`, which beats a plain `h-11`/`desktop:h-7`** (variant selectors win on specificity; twMerge does not dedupe across variants): override it WITH the variant — `data-[size=sm]:h-11 desktop:data-[size=sm]:h-7`.
- **The quantity effect is a FLOW, not a gain**: a deposit on a cash account lands in it. It is set in mono with a typographic sign and no colour (`signedFlow`, the `flow` prop of `Effect`), named «dalle quantità (acquisti, vendite e versamenti)», and the sign of every printed figure is decided on the TEXT (`isPrintedZero`): «0 €», «0,0%», «0,0 pp» carry neither sign nor colour.
- **`summarizeSelection` runs on the union like `change`**: an instrument ticked in an earlier month and sold in full counts its whole previous value as a quantity loss (`departed`), so the panel agrees with the trend line under it.
- **JSX text after an expression inside a flex chip loses its leading space** (`{pct} l'anno` rendered «19,4%l'anno»): an anonymous flex item's leading whitespace is collapsed. Build the string in one expression.
- **`SnapshotSearchDialog` sets the note in the select handler**, not in an effect (react-hooks/set-state-in-effect); the page patches the note into local state after `updateSnapshotNote`, no refetch.

## Per-page blind spots

- **Storico**: no Playwright spec; the pace and the next-doubling projection need the snapshot of EXACTLY twelve months earlier and the pace verdict 24 months of history; the projection is linear, dropped beyond fifty years; the Driver shows only years from `cashflowHistoryStartYear` (untracked income lands in «mercato») and its bars the last twelve CALENDAR months; the Lavoro net can be negative on a positive gross (taxes on ALL latent gains); the Evoluzione Y axis prints full amounts under 10.000 € of span; the confetti keeps literal hexes; the two dialogs keep their old chrome.
