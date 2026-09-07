# Cashflow › Dividendi e cedole

> **Quando aprire questa guida** — chi tocca `components/dividends/*` (la tab, le tessere, la
> tabella, il calendario), le pure `lib/utils/{dividendAnalytics,dividendiNarrative,couponUtils}.ts`,
> lo scheduler `lib/services/couponScheduling.ts` o il cron cedole. In `AGENTS.md` resta lo stub
> con l'essenziale; qui c'è la regola completa. Moduli e file: `CLAUDE.md` → *Key Files* → le voci
> *Cashflow › Dividendi* e *Dividendi (registro e cedole)*.

## Cashflow › Dividendi (`components/dividends/DividendTrackingTab.tsx`, `components/dividends/tiles/*`)
- **RECEIVED AND ANNOUNCED ARE NEVER ONE FIGURE.** A dividend whose `paymentDate` is in the future is
  a promise, not income: it is counted, totalled and coloured apart on every surface — its own chip in
  the hero, two `tfoot` rows in the table, a muted amount and an «Attesa» badge in the row, a fainter
  wash in the calendar cell, its own subtotal in the day dialog, its own clause in every reading.
  `summarizePayments` returns the two halves and no sum; there is deliberately no "total" field to reach for.
- **ONE period axis, and the announced money is ON it.** `DividendPeriod` (Mese | Anno | 12 mesi |
  Storico) sits beside the verdict from `desktop:`. `resolvePeriodBounds` is the ONE window — upper
  bound = the end of the period's own unit, **not today** — and everything reads it:
  `filterPaidByPeriod` = in-window AND paid (the income figures), `sliceForList` = in-window
  (the list, received and announced alike), the hero's «già annunciati» chip and its «Prossimi
  pagamenti» footer, and the calendar's navigation clamp. The first cut left announced rows
  unbounded and it showed: a BTP final premium dated 2032 sat in the «agosto» list, and the chip
  printed 127 € beside a list holding one 57 € coupon. *An unscoped figure beside a scoped one is
  two windows in one tile.* The instrument/type filters narrow only the list; never route a tile
  through the filtered list.
- **The verdict's «il prossimo stacco è …» is the ONLY deliberately unscoped clause**, because it
  names an instrument AND a date and therefore states its own scope. When the period holds no
  announced money the sentence drops the total and keeps the date («Nessun pagamento incassato ad
  agosto; il prossimo stacco è ENI il 15 settembre.») — never «0 € sono annunciati».
- **The calendar cannot browse out of the window** (`bounds` prop): the arrows stop at its edges and
  are not rendered at all when the window IS one month — the picker is that axis, and an arrow
  leading to a month the slice cannot fill would present an empty month as a fact.
- **The Rendimento tile does NOT follow the axis, and says so.** YOC, current yield (TTM on the
  current holding) and DPS growth (closed calendar years) are the server's; the picker cannot change
  them. The aside reads «ultimi 12 mesi» and `describeYieldFooter` states the base. Generalise: *a
  tile measured on a window other than the page's axis must name its window, not pretend to follow.*
- **`useDividendStats` carries NO date bounds.** They only ever narrowed `periodStats`, a block the
  tab now derives in memory, while `yieldOnCostAssets`, `totalReturnAssets` and `dividendGrowthData`
  are TTM/all-time by construction — so the bounds bought nothing and cost a refetch per click, and
  they let a period change silently move figures that are not on the period axis. One query per owner.
  It also no longer follows the asset filter: that is the list's filter, not the portfolio's.
- **Every number is born in `lib/utils/dividendAnalytics.ts`** (`rankPayerShares`, `summarizeYearlyIncome`,
  `nextPayments`, `summarizePayments`, `resolveMonthlyWindow`, `buildCoverageMonths`, `summarizeYield`,
  `summarizeDpsGrowth`, `summarizeTotalReturn`, `sliceForList`), every sentence in `dividendiNarrative.ts`.
  `rankPayers`/`MAX_RANKED_PAYERS`/`buildMonthlyNetSeries`/`periodToDateBounds`/`computeUpcomingNet`
  were retired with the redesign — `rankPayerShares` is the ONE payer ranking and it carries the
  residual row the tiles need, and announced money is only ever counted on the period's window.
- **The running window is drawn but never ranked.** The current calendar year is a soft, outlined bar
  in «Per anno» and is out of the average, the best/worst and the reading — at the end of August a year
  two thirds done would be the worst year by construction. "Already passed the best closed year" IS a
  fact, so the sentence says it. Same rule as Tracciamento's running month.
- **A window it cannot draw is not drawn at all.** `buildCoverageMonths` returns `[]` past `maxMonths`
  (24): five years of coverage as sixty squares is not a reading, and a slice of the window under a KPI
  measured on the whole of it would put two windows in one tile.
- **Italian grammar is data.** `LARGEST_TYPE_PREFIX` gives each `DividendType` its article («la cedola»,
  «l'acconto», «il premio finale») and gives an ordinary dividend NO prefix — a list of dividends does
  not need to say "dividendo". Percentages go through `articleForPercent`/`ofThePercent`. The collaudo
  caught «il ordinario» exactly because the prefix was once built with string concatenation.
- **The two page-level actions talk through window events** (`cashflow:add-dividend`,
  `cashflow:scrape-dividends`), like Tracciamento's `cashflow:add-expense`: the header dispatches, the
  tab owns the dialogs. Both are desktop-only — on a phone the add button sits beside the period axis
  and is the ONLY add affordance there, since the bottom-nav FAB belongs to Tracciamento.
- **The list is a table where a table is right, and flat rows elsewhere.** `DividendTable` keeps the
  sortable grid from `desktop:` inside the tile (sub-eyebrow headers with `scope`, `th scope="row"`,
  13px mono cells, `-mx-5 px-5` scroll so it never takes the page with it) and becomes a `divide-y`
  list of buttons below it — a card per row inside a tile is a card inside a card. Its page is stored
  WITH the list length it was opened under, never reset in an effect.
- **The calendar has no card of its own**: the cell hairlines are the frame, and clicking a day opens
  its dialog. It no longer cross-filters the list (`focusedDate` is gone): with the calendar on screen
  the narrowed list it produced was invisible.

## Dividends and Coupons
- **A coupon's cashflow expense is created only by the daily cron on payment date, never at asset-save time**
  (`createDividendWithOptionalExpense` gates on `!isAutoGenerated`; cron Phase 2 is idempotent via `expenseId`).
  Corollary: `deleteUpcomingCouponsForAsset`/`deleteUpcomingFinalPremiumForAsset` must batch-delete the linked expense.
- **The coupon cron is self-healing, not exact-day**: Phases 2-3 query a 370-day lookback and Phase 3 walks
  `getFollowingCouponDate` forward, so a missed run cannot stop the chain.
- **Adding a `DividendType` is a six-file fan-out** and nothing enforces it: `types/dividend.ts`, `DividendTable`,
  `DividendDetailsDialog`, `DividendTrackingTab`, `DividendDialog`, plus `dividendService.ts`'s `byType` initializer.
- **A coupon's tax rate is the asset's own `taxRate`** (12,5% government, 26% corporate), never a constant.
- **YOC and Current Yield share one pure function**, `computeDividendYieldMetrics`, prospective and per-share:
  `annualizedDPS = Σ(grossEur/div.quantity)` annualized, YOC = `DPS ÷ averageCost`, Current Yield = `DPS ÷ price`, only
  `quantity > 0` contributing. Never reintroduce an inline YOC in Rendimenti or `/api/dividends/stats`.
- **YOC, Current Yield and per-asset Total Return are scoped to the CURRENT holding** (`createAsset` re-links by ISIN, so
  dividends before `holdingStartDate` are dropped, with `deriveHoldingStartDates` for legacy rebuys). **DPS growth is
  deliberately NOT scoped** — it is a security-level payout history.
- **Received metrics filter on `paymentDate`, not `exDate`**; use `setHours(23,59,59,999)` for the upper bound, or a
  `…T00:00:00Z` dividend reads as future.
- **Inflation-linked coupons (BTP Italia) are additive**, resolved by `resolveCoupon`/`buildCouponNote` for both the
  client scheduler and cron Phase 3: the FOI rate is already per-period, deflation is floored to 0, and an unannounced
  coupon is stored **provisional**.
- **`/api/dividends/stats` returns the NET yields too** (`portfolioYieldOnCostNet`,
  `portfolioCurrentYieldGross/Net`): `computeDividendYieldMetrics` has always produced them and the
  route used to drop them, which forced every consumer wanting a net figure to re-derive it from an
  average tax rate. `averageYield` stays only as the deprecated alias of the gross current yield.
- **The date bounds of that route only ever narrowed `periodStats`.** `yieldOnCostAssets`,
  `totalReturnAssets` and `dividendGrowthData` are TTM/all-time whatever is passed — do not add a
  range expecting them to move (§ Cashflow › Dividendi).
- **Per-type badge colours are gone** (`dividendTypeBadgeColor` deleted): six literal Tailwind palettes
  stayed the same hue on every theme and made the type the loudest thing in a list about money. Type is
  plain text on a neutral outline; only `--warning*` colours anything there (announced / provisional).
- **Persist a bondDetails-only change with `updateAssetBondDetails`, never `updateAsset`** (which `deleteField()`s an
  absent `averageCost`/`taxRate`), passing the COMPLETE object — `updateDoc` replaces the whole map.

## Per-page blind spots

- **Dividendi**: the payments table dropped *Tax/Netto/Costo per azione*; the calendar day opens the day dialog instead of filtering; under «Mese» no month arrows, under «Anno» they stop at January/December; the 2-click delete keeps its 3 s auto-disarm; the list toolbar is rendered twice. The yield never follows the period (TTM on the current holding); the DPS running-year column is a partial sum; no `averageCost` → the tile becomes an explanation.
