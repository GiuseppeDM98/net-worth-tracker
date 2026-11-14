# Patrimonio

> **Quando aprire questa guida** — chi tocca `app/dashboard/assets/page.tsx`, `components/assets/*`, `lib/utils/{patrimonioSummary,patrimonioNarrative,assetPerformanceDeltas,assetPricing,assetLiquidity}.ts`. Include le regole di valutazione degli asset (prezzo di mercato, FX, GBp). In `AGENTS.md` resta lo stub con l'essenziale; qui c'è la regola completa. File: § *Files*, sotto.

## Files

Moved here from `CLAUDE.md` → *Key Files* on 2026-09-19.

- **Composite class chip** (2026-09-26): `InstrumentClassChip` in `components/assets/AssetRow.tsx` (desktop `Classe` column and phone row; the group header keeps `AssetClassChip`), pure `describeAssetClassChip` + `rankedClassLegs` + `SHORT_CLASS_LABELS` in `lib/utils/assetDisplayClass.ts`; tests `__tests__/assetDisplayClass.test.ts`, `e2e/assets.composite-chip.spec.ts` (1440: the 112px floor, «Andamento» without sideways scroll, the grouped header's plain chip; 390: the chip ends before the amount after a 12-character ticker, `main` does not scroll)
- **Mutuo tile** (2026-09-25; per LOAN since 2026-10-10): `components/assets/tiles/MutuoTile.tsx`, pure `lib/utils/mortgageSummary.ts` (`summarizeMortgage`, `projectPayoff`, `interestPaidOf`), words `describeMortgage*` + `loanNoun` in `patrimonioNarrative.ts`, reader `getMortgageInstalments` + `lib/hooks/useMortgageInstalments.ts`; tests `__tests__/mortgageSummary.test.ts`, `e2e/cashflow.mortgage.spec.ts`
- **Loans — a debt as an asset** (2026-10-10): `types/assets.ts` (`LOAN_ASSET_TYPE`, `isLoanAsset`, `Asset.financedAssetId`), the sign in `calculateAssetValue` (`lib/services/assetService.ts`, with `isFireExcluded`), `lib/utils/mortgageRepayment.ts` (`debtBalanceOf`, `debtBalanceField`, `isRepayableDebt`), the one-shot migration `lib/utils/loanMigration.ts` (pure plan) + `lib/services/loanMigration.ts` (fired by `app/dashboard/assets/page.tsx`), the Liquidità rows `isLiquidityRow` (`patrimonioSummary.ts`), the row's words `describeLoanRow`, the badge `resolveMortgageOf` (`AssetRow.tsx`), the form's «Prestito» card and `loanClassOf` (`AssetDialog.tsx`); tests `__tests__/loanAssets.test.ts`, `__tests__/updateAssetDebtFields.test.ts`, `e2e/cashflow.mortgage.spec.ts` (the migration case too)
- **Intestatari** (2026-10-17; per QUOTA since the same day): the ONE slice primitive `lib/utils/assetSlice.ts` (`AssetSlice`, `sliceFraction`, `summarizeSlices`, `sliceUnit`), the pure `lib/utils/assetOwnership.ts` (`resolveAssetOwnership`, `summarizeOwnership`, `isOwnedHolding`, the Strumenti filter `listAssetOwnerFilterOptions`/`matchesAssetOwnerFilter`, the sub-line `describeAssetOwnerLabel`, `formatOwnerUnits`/`formatOwnerPercent`/`formatOwnerSlice`, `ownerShareSlice`), the words `describeOwnership*` + `describeOwnershipFooter` in `patrimonioNarrative.ts`, the tile `components/dashboard/overview/IntestatariTile.tsx` (Panoramica and Patrimonio), `Asset.ownerShares` (units or percent) + `Asset.ownerMemberId` (`types/assets.ts`), the form's «Intestatari» rows `OwnerSharesRows` in `AssetDialog.tsx` (the % | quote switch `ownerSharesMode`, `defaultOwnerSharesMode`, the schema's `ownerShares` refusal), the clear-guards in `assetService.ts` (`updateAsset`, `updateAssetMetadata`), the owner filter and the sub-line in `StrumentiTile.tsx`/`AssetRow.tsx`; tests `__tests__/assetSlice.test.ts`, `__tests__/assetOwnership.test.ts`, the answers in `patrimonioSummary.test.ts` and `overviewSummary.test.ts`; **the «Valore | Carico» switch** (2026-10-18): `costBasisOf` in `patrimonioSummary.ts` (the ONE «quantity × PMC in euro», the G/P's own), `OwnershipBasis`/`hasCostFigures` in `assetOwnership.ts`, `ownershipRowOn` in the leaf `ownershipBasis.ts` (every narrative imports `patrimonioNarrative`: never give that file a value import of `assetOwnership`), `describeOwnership(summary, basis)` + `describeOwnershipFooter(summary, basis)`, the `AsideToggle` and the memory `patrimonio.intestatari.base` in `IntestatariTile.tsx`; the carry cases in `__tests__/assetOwnership.test.ts`, the switch and its memory in `e2e/mobile-composition.patrimonio.spec.ts`
- **Patrimonio**: `app/dashboard/assets/page.tsx` (owns every dialog), `components/assets/*` (+ `PatrimonioTile`/`ComposizioneTile` reused from the overview), pure `lib/utils/{patrimonioNarrative,patrimonioSummary,assetPerformanceDeltas,costBasisEur}.ts` (`costBasisPerUnitEur`/`unitPriceEur` = EUR against EUR, fees included), `lib/utils/bondPricing.ts` (`resolveBondPrice` = the ONE Borsa Italiana quote → euro per unit, nominal 1 € by default, BTP€i coefficient; `toBorsaItalianaQuote` the inverse; shared with `lib/helpers/priceUpdater.ts`), `lib/utils/bondDetailsForm.ts` (`buildBondDetailsFromForm`, a rate of 0 is a zero coupon); `lib/services/assetService.ts`, `types/assets.ts`; specs `e2e/assets.bond.spec.ts`, `e2e/assets.ledger-meta.spec.ts` (a new ledger instrument under a cached `null` ledger meta, doc/guide/registro-operazioni.md § Per-page blind spots)
- **Light rows and dialogs** (2026-10-07): `StrumentiTile` (`!useCompactLayout()` since 2026-10-14, one list), `AssetRow` (`ASSET_ROW_LAZY_CHARTS`, the sparkline a `lazyComponent`), `AssetSparkline` (colours as a prop), the `{ open, mounted }` state and the openers in `app/dashboard/assets/page.tsx`, `onExitComplete` in `components/ui/responsive-modal.tsx`, the six watching leaves at the top of `AssetDialog.tsx`; specs `e2e/assets.rows.spec.ts` (1440) and `e2e/assets.rows.mobile.spec.ts` (390), the census scenario `asset` (`scripts/perfRenderCensus.mjs`)
- **Suites to run after a change here — Asset / bond** (moved from `AGENTS.md` § Commands on 2026-09-30): `assetDialogHelpers`, `couponUtils` · **Composizione mobile** `patrimonioSummary` (with `describePatrimonioClosedAnswers`, the landscape index), `tabletComposition` · **Browser (tablet)** `e2e/patrimonio.tablet.spec.ts`

## Asset Pricing, FX and Assets

- **"Does this asset have a market price?" is ONE rule in ONE place** (`lib/utils/assetPricing.ts`): `hasMarketPrice` is
  false for `realestate`, `cash`, `pensionFund`, `Private Equity`; `requiresManualPricing` adds the `autoUpdatePrice ===
  false` opt-out. **A new hand-valued `AssetType` goes into `MANUALLY_VALUED_TYPES` and nowhere else.** The `--chart-3`
  row tint means "no market quote", NOT "illiquid".
- **`suggestIsLiquid` is the single liquidity-default predicate**, keyed on the TYPE so a REIT **ETF** stays liquid; three
  call sites in lock-step (create-mode effect, edit-mode legacy fallback, liquid/illiquid net-worth read-time fallback).
- `buildAssetFormDataFromValues` clamps `autoUpdatePrice` to `false` when `hasMarketPrice()` is false. **That clamp is
  the only defense — never remove it.**
- **GBp (pence) ≠ GBP**: normalize `price / 100` before any FX call or values inflate 100×. **Never call Frankfurter from
  the browser** — all FX is server-side via `/api/prices/quote`. `quantity = 0` marks a sold asset, cash balance lives
  in `quantity`.
- **A Borsa Italiana bond quote is `% of par`, ALWAYS, and ONE rule turns it into euro per unit** —
  `lib/utils/bondPricing.ts` (2026-09-11, issue #340): `eurPerUnit = quote / 100 × nominalValue × indexationCoefficient`,
  with the nominal defaulting to **1 €** (`effectiveBondNominal`) — the quantity is then the nominal in euro, as on a
  broker statement (5.000 € of BTP → quantity 5000, quote 99,5 → 4.975 €) — and 1000 meaning the quantity counts
  1.000 € lots (the owner's BTP Valore: quantity 10, 967,48 € per lot). Before the fix the conversion was skipped unless
  the nominal was set and > 1, so a bond saved with the field empty kept the raw quote as euro (93 % → 93 € per unit,
  93.000 € on quantity 1000) — and NO quantity made that right, because coupons, the final premium and the cron
  already assumed a 1 € unit. `isBondQuotedInPercent` (bond + bonds + ISIN) decides WHETHER a price is a quote;
  `toBorsaItalianaQuote` is the inverse the edit forms use. The four callers — `AssetDialog` (fetched, manual and
  purchase price), `TransactionDialog`, `priceUpdater` (both scraper and Yahoo fallback) — import it; none re-implements
  it. **Never re-implement it in a component or the cron; never guard it on `nominal > 1` again (issue #340).** **No migration for documents saved wrong before the fix** (owner's call): the current price self-heals at the next
  cron, the PMC and the opening trade are corrected by the user from the Registro (the form shows 9900 for a 99 stored
  as euro; typing 99 saves 0,99).
- **A BTP€i's quote is REAL** (`inflationIndexation: 'euro'`, issue #341): the euro value carries the HICP indexation
  coefficient, so the price cron multiplies the quote by the latest coefficient the user has entered
  (`latestIndexationCoefficient`, never scraped — Borsa Italiana does not publish it), the asset form takes «il
  coefficiente di oggi» (stored as today's entry when it differs from the latest known), and a trade asks for the
  coefficient at ITS date and remembers it (`AssetTransaction.indexationCoefficient`, metadata for the back-conversion,
  never read by the replay). A BTP€i without any coefficient is valued at par of the real price: understated by the
  accrued inflation, and declared in the form. The coupon side is in doc/guide/cashflow-dividendi.md.
- **Inputs that receive a back-converted quote carry `step="any"`** (`manualPrice`, both `averageCost` fields, the
  trade's price): a stored 967,4843 € per lot comes back as 96,74843 — five decimals — and a fixed `step="0.0001"` made
  the browser's native validation refuse the form's OWN value on every edit of the owner's BTP Valore (found in the
  browser, 2026-09-11).
- **Every G/P stands EUR against EUR, fees included — ONE rule in `lib/utils/costBasisEur.ts`** (2026-09-07, PR #326
  merged with changes). `costBasisPerUnitEur` is the ledger's `averageCostEur` (the position's cost at trade-date
  rates, purchase fees INCLUDED — the fiscal cost a capital gain is taxed on) when the ledger has projected it, the
  native `averageCost` only for a EUR-native asset until the backfill reaches it, and `undefined` for a foreign asset
  without a EUR PMC — the consumers then print nothing rather than a dollar PMC against a euro value, which is what
  every G/P did before. `unitPriceEur` is the per-unit twin of `calculateAssetValue`'s rule (`currentPriceEur`, else
  the native price with the GBp guard). The consumers, all on the same two functions: `computeUnrealizedGain` /
  `summarizeUnrealizedGains` (the table, the mobile row, the Sintesi), `assetService.calculateUnrealizedGains` (the
  overview's total, the estimated taxes, `netTotal`; pinned equal to the table's sum by `assetService.test.ts`),
  `dashboardOverviewService` (`topAssets[].returnPercent`, `hasCostBasisTracking`; payload version 15),
  `pdfDataService` (the Patrimonio section's rows), `TaxCalculatorModal` (the simulation runs in EUR on both sides
  and shows the native price and PMC as extra rows on a foreign asset), `yieldOnCost` (YOC and current yield over the
  EUR PMC and the EUR price; a foreign asset without a EUR PMC is left out). **The PMC cell prints the EUR PMC**, and
  on a foreign row the native one under it (alone until the backfill). The owner's call: a PMC with fees is the
  broker's fiscal figure; a EUR position's G/P therefore drops by its total purchase fees.
- **`averageCostEur` is projected by every ledger mutation and, once, by `backfillAverageCostEur`** (`POST
  /api/asset-transactions/backfill-average-cost-eur`, fired by the Patrimonio page after the ledger migration, gated on
  the demo like every write): a pure re-projection of the trades' own `priceEur` — no FX call — that writes ONLY
  `averageCostEur`, skips a closed position, logs and counts a ledger the replay rejects instead of failing, and stamps
  `averageCostEurBackfilledAt` on the meta doc so it never runs twice. Until an account opens Patrimonio once, its
  foreign positions have no G/P on the Panoramica and in the PDF, and its EUR positions measure against the
  fee-excluded native PMC: honest, and one visit away from the fiscal figure.
- **Patrimonio Δ columns are UNIT-PRICE variations over time windows, not profit/loss and not value changes**
  (`lib/utils/assetPerformanceDeltas.ts`): the canonical EUR unit `totalValue / quantity` of the snapshot row against
  today's, the property (by TYPE `realestate` — a REIT ETF in that class is a quoted fund) gross of debt, pension
  funds and cash `null` (their quantity IS the value), and no window based on the current month's snapshot. Never
  measure a hand-priced asset on its total value: a purchase then reads as performance. `Δ Inizio`'s base is the
  first recorded unit price, never `averageCost`.
  **Any table whose column set changes at runtime must derive its group-header `colSpan` from the same flag.**
- **A cash *account picker* requires `type === 'cash' && assetClass === 'cash'`** (a money-market ETF can carry
  `assetClass: 'cash'`), for the settlement account, ledger first buy, `ExpenseDialog`'s payment account, the pension
  origin and `assertCashSettlementAsset`. Do NOT extend it to aggregate-liquidity computations.
- **`getAssetDisplayTicker` is the ONLY place resolving the alias→ticker fallback.** Every
  instrument label built in `lib/utils/dashboardOverviewUtils.ts` (`rankCostDrivers`,
  `computeTopInstrumentMovers`) and `dashboardOverviewService.ts` (`topAssets`) resolves through
  it too — a long fund name never gets cut mid-word in the Costi/Rendimento/Mercato tiles. The
  `makeAsset()` test fixture in `__tests__/dashboardOverviewUtils.test.ts` defaults `ticker:
  'VWCE'`: any test that overrides only `name` and asserts on the returned label will silently
  see `'VWCE'` back unless it also overrides `ticker` (to `''` to fall through to `name`, or to a
  distinct value to test the ticker path).

## Patrimonio (`app/dashboard/assets/page.tsx`, `components/assets/*`)

- **The page owns every dialog** (`AssetDialog`, `TransactionDialog`, `AssetMovementsDialog`, `TaxCalculatorModal`,
  `CashAccountDialog`): the header's «Aggiungi asset», the Liquidità tile's «Aggiungi conto», the table's Modifica and
  the Movimenti tile's rows all go through the same instances, so the dual invalidation (`assets.all` +
  `dashboard.overview`) happens in ONE `handleAssetDialogClose`. Tiles receive callbacks, never open dialogs.
- **Every number the page shows that is not in the overview payload is born in `lib/utils/patrimonioSummary.ts`**
  (`summarizeCashAccounts`, `summarizeMonthTrades`, `summarizeUnrealizedGains`, `rankInstrumentReturns`,
  `computeTopWeightShare`, `resolveLastPriceUpdate`, `computeUnrealizedGain`) or `assetPerformanceDeltas.ts`; the words in
  `patrimonioNarrative.ts`. `isCashAccount` = the cash-picker rule (`type === 'cash' && assetClass === 'cash'`);
  **`isHeld` (`quantity > 0`) gates every count, share and sum** — a sold position stays in the table as «Azzerato»
  but is not owned, and the Panoramica's `assetCount` already counts held only; `hasCostBasis` excludes cash
  accounts, pension funds (a leftover `averageCost` from a type conversion is not a PMC) and sold positions, and
  `rankInstrumentReturns` applies the same exclusions to the payload's `topAssets` (whose `returnPercent` is computed
  on ANY `averageCost`) so the Rendimento KPI, its ranking and its footer share one rule.
- **The verdict's driver is an INSTRUMENT** (`topInstrumentMovers`, `computeTopInstrumentMovers` — the same
  `computePriceEffectsByAsset` as the class digest, an instrument never split by its `composition`, capped at ten),
  named only when `marketEffect !== null`. Patrimonio's hero footer lists the top three instruments; the
  Panoramica's lists classes — the two pages never print the same «Mercato:» line. **The cause of a falling month is
  the Panoramica's decision** (`resolveDeclineCause`, 2026-09-11): a taxed sale from the ledger (`monthSales`) or the
  own flows outweighing the market change the headline («il mercato ha pesato, le tasse sulle vendite di più»), and
  the sentence closes on the market-vs-flows split and the sale — doc/guide/panoramica.md.
- **«Movimenti del mese» reads the owner's whole ledger** (`useAssetTransactions(ownerId, undefined, { enabled:
  ledgerReady })`) and filters the Italian calendar month in memory: a month query would need a `(userId, date)`
  composite index that does not exist. Baselines and adjustments are not trades; a buy's amount is gross + fees,
  a sell's gross − fees (the engine's `computeInvestedCapital` definition).
- **A cash account may be NEGATIVE — a credit card** (2026-09-19): an account in the red until the monthly transfer
  from the bank brings it back to zero. `AssetDialog`'s schema refuses a negative quantity for every type but `cash`
  (it used to refuse it for all, so the card could not even be renamed while in the red); the Panoramica's cash split
  (`dashboardOverviewService`, `cashNetWorth`) counts it (a `quantity > 0` filter moved its debt into «investimenti
  liquidi»). The allocation's `buildHoldings` still drops a non-positive holding: a card belongs OUT of the allocation
  (`allocationRole: 'excluded'`, the form's hint says so), or the cash class would count a debt the per-instrument
  list does not show. On the Liquidità tile the row shares are of the money HELD (the positive balances) and an account
  in the red reads «debito» (`summarizeCashAccounts`, `shareOfCash: null`): shares of a total that nets the card out
  read «138%» and «−57%» on the real account. The KPI «Sui conti» stays net of it.
- **Peso is measured over the GROSS total** (cash accounts included), like the Classi and Liquidità shares —
  before the redesign the table measured it over the instruments only.
- **Below `desktop:` the rows are `AssetRow`, flat and expandable** (CSS `grid-rows-[0fr] → [1fr]` with `inert`
  on the closed panel): a card per row inside the Strumenti tile would be a card inside a card. **ONE list is in the
  DOM per width** (2026-10-07): `StrumentiTile` reads `!useCompactLayout()` (since 2026-10-14; `useMediaQuery('(min-width:
  1440px)')` until then) — inclusive, as `desktop:` — and renders the table OR the rows; until 2026-10-07 both were there
  at every width, the hidden copy included. The tile mounts after the page's data, long after hydration, so the hook's
  server snapshot never decides it (it would be the TABLE, § Composizione mobile). The tile's toggles and footer sentences still switch by CSS: they hold no list. **A row draws its
  sparkline at its FIRST opening and keeps it** (`hasOpened`; unmounting it on close would empty the panel while it
  collapses), in a 32px slot reserved before (`SPARKLINE_SLOT`), so the panel's height never moves; the chart is a
  `lazyComponent` — the only path from Patrimonio to recharts, so the page's initial JS lost recharts (764,7 → 655,8 KB
  gz) — preloaded when idle on a phone only, and its colours come from the page's ONE `useChartColors()` as a prop. It
  no longer animates its draw: the line used to animate inside the closed row at page load, so a reader opening a row
  always found it already still. Before: 15 recharts charts, 30 rAF and 16 `getComputedStyle` on the owner's phone at
  each visit, all closed. Pinned by `e2e/assets.rows{,.mobile}.spec.ts`. Class chips take
  their label from `ASSET_CLASS_LABELS` (Italian); `lib/utils/assetUtils.ts` with its English map is gone.
- **A composite instrument is ONE row with a split chip** (2026-09-26): a 60/40 fund stays one row, grouped and sorted
  under its prevailing class, but its chip (`InstrumentClassChip`) has one segment per composition leg, as wide as the
  leg's share of the market value (`leverageRatio` never widens a segment), each tinted like that class's own chip.
  Two segments read «Azioni · Obbl.» (fixed short forms, `SHORT_CLASS_LABELS` — the sixth label map,
  doc/guide/allocazione.md), three or more «Misto»; a leg under 5 % (`MIN_CHIP_SEGMENT_PCT`) gets no segment and no
  word (a 97/3 fund reads «Azioni» at plain width) but stays in the `sr-only` shares («Azioni 97%, Liquidità 3%») —
  text, not an `aria-label`, since the chip's content is the information. **The 5 % floor reads the share AS
  PRINTED** (one decimal, `formatPercentageIt`): a 4,96 % leg is heard as «5%» and keeps its segment, a 4,94 % one is
  heard as «4,9%» and has none — the chip never drops a leg the screen reader announces at 5 % or more. The widths are
  normalised over the visible legs; the spoken shares are the stored ones, unscaled. **From two segments the chip is
  at least 112px wide in the desktop table only** (`desktop:min-w-[112px]`, owner's decision 2026-09-27): there the
  chips stand in the Classe column and the proportions compare down it; on the phone row each chip starts after a
  ticker of its own width, so there is no column, and a floor would push the chip under the amount on a long ticker. **One
  ranking for group and chip** (`rankedClassLegs`: one leg per class, largest first, ties to the first in the
  composition): a class named twice is summed before ranking, so the first segment IS the group. **The ring is an
  overlay, not a CSS border**: a `border-box` gradient under a translucent `padding-box` fill shows through and doubled
  the tint (seen in the browser, 2026-09-26); the overlay is the 30% gradient masked to its outer 1px
  (`mask-composite: exclude`), and the chip's 1px of padding stands in for the plain chip's border, so both measure
  the same. In the inline style the `-webkit-mask` pair is declared BEFORE the standard `mask`: an engine that aliases
  the prefixed shorthand to `mask` would otherwise reset the `exclude`. The ring itself is asserted by no test (the
  spec reads the fill's stops only) — look at it in the browser when touching the mask.
- **«Andamento» is a VIEW, not four more columns** (2026-09-14, the page's first Impeccable critique): with the
  toggle on, Quantità · Prezzo · PMC · TER leave the table and the three Δ windows take their place, so at 1440
  nothing scrolls and the actions never leave sight (appended, the Δ columns pushed the actions column 202px out of
  view; made sticky, the actions column covered the Δ columns at rest — the thing the toggle exists to show). The
  actions column stays `sticky right-0 bg-card` as the safety net for a table that does scroll, with a 1px left rule
  only while it does (`tableScrolls`, measured); **`right-5` to mirror the wrapper's `px-5` is wrong** — the sticky
  constraint is measured from the scroller's CONTENT edge and shifted the column 20px over the last Δ cell. The
  three Δ columns are sortable (a row without the window goes last in both directions), every sortable header is
  a `<th aria-sort>` with a `<button>` inside (a focusable `<th>` reads as a heading and takes the browser's default
  outline), the actions header is named `sr-only` («Azioni sulla riga» — a visible «AZIONI» sat over a column of
  «Azioni» class chips), and both toggles are remembered per browser (`localStorage`, `STORAGE_KEYS`).
- **The table says what the storage does not** (same session). A hand-VALUED holding — `!hasMarketPrice(type,
  subCategory)`: a property, a pension fund, a private-equity stake, value in `quantity` at price 1 — prints «—» in
  Quantità/Prezzo/PMC and «valore a mano dal 12/08» under its name (`describeManualValuation`, off
  `lastPriceUpdate`), and **`hasCostBasis` is false for it**: its PMC equals its price by construction, so the G/P
  was a structural «+0,00 €» (Academia Private Equity on the real account), a zero nothing measured. A quoted
  instrument the owner prices by hand (`autoUpdatePrice: false`) keeps its real quantity, price and PMC. A bond
  prints «scade il 10/03/2032 · prossima cedola 10/12» (`resolveBondRowFacts` in `patrimonioSummary.ts` reads the
  dates the coupon scheduler already knows, `describeBondRow` in `patrimonioNarrative.ts` says them; the coupon
  clause drops for a zero coupon or a matured bond); the composition of the sub-line is `describeAssetRowSubLine` in
  `AssetRow.tsx`, shared by the table and the mobile row — NOT in the narrative module, which must stay SDK-free.
- **Every delete on the page is `useArmedDelete`** (2026-09-14, owner's call: the table rows, `AssetRow` and the
  cash-account modal all lost the 3 s timer that dialog.md had kept «by design» on rows): the arm and the disarm
  are announced through ONE `role="status"` live region per tile (`StrumentiTile` passes `announce` to every
  row and to `AssetRow`), the armed label is «Premi di nuovo per eliminare {name}», and in `CashAccountDialog` the
  READING carries the consequence while armed («Elimini Conto BNL e il suo saldo di 6044,37 €: i movimenti
  collegati restano nel cashflow senza conto. Non è reversibile.», `describeCashAccountReading`) — before, the page
  held the armed state on a timer, `hasArmedConfirm()` was false and Escape CLOSED the modal with the row armed.
- **The ledger's third vital is annualised only past six months** (`MIN_ANNUALIZABLE_DAYS` = 180,
  `ledgerSpanDays`, both in `assetTransactionUtils.ts`; the words in `describeLedgerReturnVital`): under the floor
  it is «Rendimento sul periodo · +66,92% · in 53 giorni, non annualizzato», never an XIRR — VWCE's ledger, opened
  47 days earlier, printed «XIRR +4388,68% annualizzato» in green beside two real figures.
- **A refused submit of the asset form lands in the reading line** (`onInvalid` in `AssetDialog.tsx`,
  `describeFormRefusal`): «Mancano 2 campi: Ticker e Nome.» — the fields named in FORM order (sorted by DOM
  position, not zod's, whose custom ticker issue comes last), the first refused field scrolled into view and
  focused; every zod message is Italian («Serve il ticker», «ISIN non valido…»). Step 2 keeps the counter in its
  eyebrow («Patrimonio · Passo 2 di 2 · ETF»). **«Aggiungi conto» opens on step 2 with `initialType: 'cash'`**
  (`AssetDialog`'s prop; the Liquidità tile's `onAdd` is `openCreateCashAccount`, the header's stays `openCreate`):
  the reader had already said what they wanted.
- **DOM order is the reading order** (same session): Movimenti before Liquidità in the JSX, as on a phone; the
  desktop row is placed by `desktop:col-start-6/-9 desktop:row-start-1`, never by a CSS `order` swap (a screen
  reader met Liquidità first while the eye met Movimenti). The hero's count line («18 strumenti e 4 conti») is a
  link to `#strumenti` at 1440 (the `Tile` primitive takes an `id`) and, below `desktop:`, a button that opens the
  Strumenti row (since 2026-10-14, § Composizione mobile).
  Footer actions («Aggiungi conto», «Mostra tutte», the links to Allocazione and Rendimenti) wear
  `TILE_FOOTER_ACTION_CLASS` — 11px words, a 32px target on a pointer and 44px on touch (`[@media(pointer:coarse)]`),
  folded by a negative margin so the footer's rhythm does not move (they measured 75×17 and 55×15).
- **Italian articles are data, not guesses**: `articleForPercent` («l'8%», «il 7%», «lo 0,5%»), `ofThePercent`
  («del 3%», «dell'8%», «dello 0,5%»), `atThePercent` («al 71%», «all'8%», «allo 0,5%») and `pluralArticleFor`
  («gli 8», «i 3») in `patrimonioNarrative.ts` — use them for any count or percentage a sentence names. **The article
  follows the figure as PRINTED**: 7,96 rounds to «8,0%», so it takes «l'», not «il» — decide on `formatPercentage`'s
  output, never on the raw value. **An articulated preposition typed by hand is a bug waiting for a small number**:
  `overviewNarrative`'s `describeComposition` wrote «al » literally and printed «carry al 0,1%» the first time a class
  landed under 0,5% on the Panoramica (found in the browser, 2026-08-30). A hard-coded «al »/«del » is correct for most
  figures, which is precisely why it survives review — grep for a quoted preposition sitting next to a
  `formatPercentage` call before writing another one.
- **A debt is a `loan` ASSET, worth minus its principal** (owner, 2026-10-10; `types/assets.ts` → `LOAN_ASSET_TYPE`).
  Until then a mortgage was two fields of the property (`outstandingDebt`, `debtInterestRate`) netted off its value by
  `calculateAssetValue`; now the property keeps its GROSS value and the loan is a row beside it: `quantity` is the
  outstanding principal as the bank states it, `currentPrice` 1, the value `−quantity` (ONE branch, in
  `calculateAssetValue`), so every sum — net worth, the class sums, the snapshots' `byAsset` (unit value −1, which keeps
  `attributeSelectedChange`'s split exact), Storico, FIRE — subtracts it with no second reader. **Its class is the class
  of what it finances** (`loanClassOf`): `realestate` when `financedAssetId` names a property, so «Immobili» still sums
  to the equity it summed to before; `cash` for a personal loan, which is negative liquidity like a credit card (owner's
  call) — it reads «debito» among the Liquidità rows (`isLiquidityRow`, wider than the cash-picker rule, which never
  offers a loan as a settlement account) and opens the asset form, not the account detail. Defaults the form suggests:
  `isLiquid` false when linked, no `allocationRole` of its own since 2026-10-17 (in the Allocazione a loan FOLLOWS
  what it finances — `resolveAllocationRoleWithin`, doc/guide/allocazione.md: a mortgage its property's role, a
  personal loan the base as negative liquidity, never a plan's leg; the `excluded` the form wrote until then, and the
  migration still writes, is inert), `stampDutyExempt` true (never a securities account), out of every Rendimenti base
  whatever the toggles (`resolvePerformanceExclusions`), no Δ column (`hasNoUnitPrice`), no G/P, never a dividend
  payer. **FIRE leaves the loan out with the primary residence it finances** (`isFireExcluded`): the house out and its
  mortgage in would charge the FIRE number with a debt on a thing it does not count. A repaid loan (`quantity` 0)
  reads «Estinto» where a sold position reads «Azzerato» and counts in nothing (`isHeld`); the hero's count line says
  «18 strumenti, 4 conti e 1 prestito» (`formatHoldingCounts`, loans counted apart). The TAN (`debtInterestRate`) and
  the financed property are user-clearable through `updateAsset`'s `'x' in updates` guard; the form always sends
  `outstandingDebt: undefined`, so a property saved after the migration sheds its legacy field.
- **The migration is one shot, silent and idempotent** (`migratePropertyDebtsToLoans`, fired by the Patrimonio page
  like the ledger migration and the PMC backfill, gated on the demo): every property with `outstandingDebt > 0` gets a
  loan «Mutuo {name}» (debt, TAN, currency, class realestate, illiquid, excluded, exempt), the instalments linked to the
  property are re-pointed at the loan (their stamps are facts of their day, so the «Mutuo» tile keeps its history) and
  the two legacy fields leave the property — three writes in that order, the loan first, so a failure leaves the
  account readable. The legacy netting stays in `calculateAssetValue` for a document the migration never reaches (the
  demo account), the Driver reads both models across the migration month (doc/guide/storico.md), and `isRepayableDebt`
  still offers a legacy property to an instalment. **The decision is Firestore's, re-read from the server** (2026-11-03): the page's list can be the
  one IndexedDB restored, older than the migration, and a full E2E run wrote a second loan from it. Two tabs at the same
  instant can still both write. Pinned by `__tests__/loanAssets.test.ts`, `__tests__/loanMigrationService.test.ts` and the
  last two cases of `e2e/cashflow.mortgage.spec.ts` (a reload, and a restored list still showing the debt, create no second loan).
- **«Intestatari» — whose each asset is, by QUOTA** (owner, 2026-10-17; `lib/utils/assetOwnership.ts` over the ONE
  slice primitive `lib/utils/assetSlice.ts`, shared with FIRE › Obiettivi' quotas). A slice of an asset is UNITS —
  quote of an instrument, euro of an account, a property, a pension fund or a loan, whose value lives in `quantity`
  at price 1 (`sliceUnit`: `hasMarketPrice` decides) — or a PERCENT, resolved into a fraction on today's quantity
  (`sliceFraction`); the rows are typed in ONE of the two forms (the block's % | quote switch, the owner's call of that
  evening — the first cut had units only): a unit count stays put while the price moves, a percent follows the asset
  whole (a joint account is 50/50 whatever its balance), and the other figure is derived and printed beside. On the
  document: `Asset.ownerShares` is the list member → slice (`{ units }` or `{ percent }`, the rows typed), `Asset.ownerMemberId`
  the member who takes the REST — every unit the list does not name, the ones a trade adds included — and absent, the
  rest is «IN COMUNE», like `Expense.personalMemberId`; a document with `ownerMemberId` and no `ownerShares` (every one
  written before the quotas) is the whole asset to one member, so nothing migrates. Two assets derive theirs and the
  form shows them no rows: a pension fund's owner IS its «Membro famiglia» (`pensionFundDetails.familyMemberId`, whole),
  a mortgage follows the FRACTIONS of the property it finances (a personal loan has its own rows). `resolveAssetOwnership`
  is the ONE resolution (`slices`, each member once and the rest last; `source`; `needsReassignment`); an id whose member
  was deleted is «Senza intestatario» (the Divisione's word), a group of its own, never folded into «In comune».
  **Units past the quantity are DECLARED, never rescaled in silence** (owner's call): a sale or a value typed lower
  leaves the units as written, the asset's value is still split by their proportions so the tile adds up to the net
  worth, and the row and the tile say «quote da riassegnare» — the Strumenti sub-line closes with «quote da riassegnare
  (120 su 100 quote)», the tile's footer turns to the warning tone («1 asset ha quote da riassegnare: VWCE.»,
  `describeOwnershipFooter`, `OwnershipSummary.reassign`). **The gate is «saldo ≠ 0», not «quantity > 0»**
  (`isOwnedHolding`; the owner's P.S. of that day: a credit card in the red named to a person did not lower their share
  — its negative balance is a debt they hold, counted on the magnitude, `sliceBase`). `summarizeOwnership(assets,
  members, valueOf)` splits every held asset by its slices (a loan with its negative value: each group is net), members
  by value then «In comune» then the orphans, shares of the net total; **a divided asset counts in EVERY row that has a
  quota of it** («N asset» per row), the aside «su N asset» counts the distinct assets — the Panoramica's server builder
  (payload `ownership`, source version 24) and this page (live assets + `useSettings`) call it; `hasOwners` false
  (nobody named) means NO tile and no row on either page. The **«Intestatari» tile** (`IntestatariTile`, shared like
  `PatrimonioTile`): reading `describeOwnership` («Il 54% è intestato a Marco, il 31% a Giulia, il resto in comune.»,
  articles on the printed integer, «Tutto è intestato a Marco.», a group that is a net debt named as such), ranked rows
  with amount, share and «N asset», aside «su N asset», footer where the quotas are set or the warning; a full row
  (`desktop:col-span-12`) before the loans here, after Asset principali on the Panoramica. **The form** (`OwnerSharesRows`
  in `AssetDialog.tsx`, a leaf that watches the quantity and the rows itself): the % | quote `SegmentedPill` on top
  (`ownerSharesMode`; absent = the type's default, `defaultOwnerSharesMode`: % where the value is money — conto, prestito,
  carta, immobile —, quote on a quoted instrument; switching converts the typed figures, «50%» of 100 quote ↔ «50 quote»;
  a saved asset opens in the form of its rows), one input per member in that form with the other figure derived beside
  it, the LAST row the rest, computed and never typed — «In comune» by default, or the last member with the «Nessuna
  quota in comune» switch (then that member's row moves last and reads what the others leave: «scrivo 40 a Giuseppe,
  Marcella legge 60 da sola»; a legacy whole-to-one asset opens with its member last and whole) —, the sum under the rows
  («50% + 50% = 100%», «40 + 60 = 100 quote»), and a sum past the whole (100%, or the quantity) red there and a refusal in
  the reading line at submit (the schema's superRefine on `ownerShares`, `FIELD_LABELS` «Intestatari», `describeFormRefusal`), never a
  save. **Strumenti**: an «Intestatario» `Select` in the aside (every width; «Tutti · In comune · members · Senza
  intestatario» when an orphan exists) narrows ONLY the list — a quota of a member is enough for their filter, the
  reading counts every position, Tracciamento's rule —, and the owner part closes the row's sub-line
  (`describeAssetOwnerLabel`, `describeAssetRowSubLine`'s fourth argument, no column added): «di Marco» for a whole
  asset (the number would add nothing), «Marco 100 · Giulia 20 · 30 in comune» for a split one, every name with its
  part in the rows' form («Marco 5000 € · 3000 € in comune» on an account in euro, «Marco 50% · Giulia 50%» in percent,
  `formatOwnerSlice`). The form's `updateAsset`/`updateAssetMetadata` clear both
  fields with the `'ownerMemberId' in updates` / `'ownerShares' in updates` guards. Pinned by
  `__tests__/assetSlice.test.ts` and `__tests__/assetOwnership.test.ts`.
  **The tile reads the same groups on the VALUE or on the PRICE OF CARRY** (owner, 2026-10-18 — «magari tra i vari
  conti sono distribuiti più equamente guardando per i valori di carico»): `summarizeOwnership` takes `costOf` beside
  `valueOf` (`costBasisOf` of `patrimonioSummary.ts`: quantity × the fiscal PMC in euro, the G/P's own figure) and
  measures every group twice — `value`/`sharePct` on the net worth, `costValue`/`costSharePct` on `costTotal` —, so the
  two splits differ by exactly the gains, which sit with whoever holds the instruments that made them. An asset with no
  PMC to read counts at its value on both: by nature for an account, a property, a loan or a pension fund (the carry IS
  the value), by necessity for a quoted instrument without a EUR PMC, which is DECLARED (`withoutCostBasis`) and never
  left out — a carry total that skipped it would stop being comparable with the net worth. The tile's aside carries an
  `AsideToggle` «Valore | Carico» (`aria-label` «Base delle quote»), remembered per browser in `localStorage` under
  `patrimonio.intestatari.base` — ONE memory for the Panoramica and this page, like Strumenti's two toggles —; on
  «Carico» the rows and their shares switch, the reading opens by naming the basis («Al prezzo di carico, il 55% è
  intestato a Marco, il 31% a Giulia, il resto in comune.», `describeOwnership(summary, 'cost')`), the footer declares
  the uncosted instruments («2 asset senza prezzo di carico contano al valore attuale: X e Y.» — after a «quote da
  riassegnare» warning, which comes first on either basis), the rows' list is «Prezzo di carico per intestatario». The
  page's verdict never follows the switch (DESIGN.md → The Scope-Is-Not-An-Axis Rule) and the closed row's landscape
  answer stays on the value. A Panoramica payload cached before source version 25 carries rows without `costValue`:
  the tile offers no switch on it (`hasCostFigures`), the day's first read recomputes. Pinned by the carry cases of
  `__tests__/assetOwnership.test.ts` (two falsifications seen red: the carry read off the value, the slice-unit guard
  taken off) and, in the browser, by `e2e/mobile-composition.patrimonio.spec.ts` (the switch rewrites the reading and
  survives a reload).
- **Where a property reads GROSS and where NET of its mortgage** (owner, 2026-10-17). Every sum BY CLASS is net (the
  loan is in its class): Composizione here and on the Panoramica, Storico's bands, Allocazione (since 2026-10-17 the
  loan follows its property's role, doc/guide/allocazione.md) and the Previdenza tile's «tutto il patrimonio» (which
  skipped negatives until that day). The lists BY ASSET split: the Panoramica's «Asset principali» prints the house
  net with «netto del mutuo di 95.000 €» under it and no mortgage row (`rankTopAssets`, doc/guide/panoramica.md);
  Strumenti here, Storico's «Valore per strumento» and the PDF keep the house gross AND the loan as its own negative
  row, so the columns add up — a ledger lists documents. The «Mutuo» tile and the Δ columns read the house gross too
  (a valuation, below).
- **A property's value is a valuation, its mortgage a fact**: re-valuing the house from 130 to 150 moves the net worth
  by 20.000 and Storico reads it as the property's «mercato» (gross of debt, as before); the loan does not move.
- **«Mutuo» answers «quanto mi costa il mutuo?»** (2026-09-25, owner's choice of place): one full-width tile per
  LOAN with at least one linked instalment (per property until 2026-10-10), between Rendimento and Strumenti — eyebrow
  «Mutuo» for a loan that finances a property, «Prestito» for a personal one (`MortgageSummary.kind`, the aside names
  the property or the loan). The reading says what this year's
  SETTLED instalments paid in interest and repaid in principal, and where the plan ends; the KPIs are the debt, the
  year's interest and principal and the projected end; from the second measured year a «Per anno» table lists every
  year, the first one captioned from the link («da settembre») and the running one «finora». The interest is a MEASURE
  only from the rows the app settled — each stores `debtInterestPaid` beside `debtPrincipalRepaid` — and the
  instalments paid before the link are NOT reconstructed (owner): the footer says from when it counts. A row settled
  before the field existed reads it as instalment − principal (`interestPaidOf`). The end is the French amortisation
  on today's debt, TAN and the latest linked INSTALMENT (`projectPayoff`: n = −ln(1 − D·r/P)/ln(1 + r), rounded up;
  `never` when the instalment does not cover the interest) — a payoff row (`isDebtPayoff`, doc/guide/cashflow.md) counts
  in the year's principal but never sets the rhythm the end is projected on. No figure takes a sign colour: interest is a cost already
  counted in Cashflow, not a gain or a loss. The reader is ONE query for every property (`userId` equality +
  `debtAssetId in [...]`, two `.where()`, no composite index; past thirty properties the ids go in chunks of 30, read in
  parallel — Firestore's ceiling on an `in` filter, pinned by `__tests__/mortgageInstalmentsQuery.test.ts`; until
  2026-09-29 it was one query per property), keyed UNDER `queryKeys.assets.all` so every debt-moving mutation refreshes
  it under the global staleTime; «Collega la serie al mutuo» moves no asset, so `LinkSeriesDialog` invalidates the
  assets key itself (the hook carried `staleTime: 0` instead, and re-read on every mount). The page's skeleton waits
  for it and a failed read is an `ErrorNotice` where the tile would be.
- **`AssetDialog` and `CashAccountDialog` exist only from their opening to the end of their exit animation**
  (2026-10-07): the page keeps `{ open, mounted }` for `AssetDialog` and `{ open, asset }` for the account detail (an
  account set IS mounted), each cleared in `onExitComplete`
  (`ResponsiveModal`, doc/guide/dialog.md) — never at `onClose`, which would cut the exit. The record stays through the
  exit, so the dialog leaves on its own title (it used to flip to the create title while closing). Each opener passes
  `event.currentTarget` (`onEdit(asset, opener)`, `onAdd(opener)`, `onSelect(asset, opener)`), the focus returns there;
  two hand-overs move it on purpose: «Modifica» in the account detail hands the account's Liquidità row to the asset
  form, and «Registra operazione» inside the edit form clears the opener, so no focus is sent behind the trade dialog
  that is opening. `CashAccountDialog` was already conditional, but the page cleared the account at close, so it
  vanished without its exit and dropped the focus. **Before 2026-10-07 `AssetDialog` read nothing while closed** (2026-09-29): the page mounted it closed, and until then it read
  the allocation targets at mount and the settings on a key of its own. Now `useSettings(ownerId, { enabled: open })` is
  its one read — the family members and the targets (`settings.targets`, what `getTargets` used to re-read) come from
  it, a new sub-category invalidates the key instead of re-reading. The page itself reads its keys through the hooks
  (assets, snapshots, overview, the ledger meta and the ledger, the instalments). All of them are in the persisted
  cache's allowlist (2026-09-29, doc/guide/cache-persistita.md) — the ledger META included, because the trades are `enabled` on it: with the
  meta left out, a reload painted the skeleton over figures it already had until that one read came back (measured:
  452 ms with a skeleton, 144 ms without one). The header's «Aggiornato alle…» reads the overview on its own minute.
- **A failed overview is an alert, not a skeleton**: the page gates the skeleton on `isLoading` of EVERY query it
  reads (assets, overview, snapshots, ledger meta) and, when the overview errs, keeps Liquidità, Movimenti and
  Strumenti alive on the live assets (`totalValue` falls back to `calculateTotalValue(assets)`) behind a
  `role="alert"` notice where the verdict would be — the management surface must survive a payload failure.
- **The hero's «Mercato:» digest names three instruments and closes with «altri»** = `marketEffect − Σ shown`, so
  the three can never hide a negative total behind three gains (the class digest lists every class instead).
- **The hero's curve is 120px below `desktop:`** (since 2026-10-11, the Panoramica's composition; `max-desktop:min-h-[120px]`
  on the shared `PatrimonioTile`): the curve shortens, never the reading (DESIGN.md → The First-Screen Rule, 2026-09-27). The page is
  composed since 2026-10-14: below `desktop:` the chips and the curve's last label are lifted, the digest when the
  sentence names the market (§ Composizione mobile).

## Two-Step Create Dialogs — `AssetDialog`

Moved here on 2026-09-30 from `AGENTS.md` § 2, now doc/guide/dialog.md § Two-Step Create Dialogs (`AssetDialog`, `ExpenseDialog`); the rule for any
form whose fields depend on a discriminant, and the marker rule itself, stay there.

- `AssetDialog`: step 1 picks the type, step 2 shows only that type's fields; edit reuses the same visibility logic and
  shows a ledger asset's quantity/PMC read-only (the ledger owns them). Class select for ETFs, optional `displayTicker`,
  `leverageRatio`, and an opt-in TER only for `etf`/`commodity`/`crypto`.
- **A field typed key by key is watched by the leaf that reads it, never at the root** (2026-10-07): quantity,
  PMC, nominal, coupon rate, final premium, indexation coefficient and opening date feed six module-level leaves
  (`QuantityChangeNotice`, `BondPurchasePricePreview`, `BondQuoteInEuro`, `CouponPreview`, `FinalPremiumPreview`,
  `SettlementTimingHint`, with `useBondQuoteBasis`), each taking `control`. The React Compiler compiles `AssetDialog`
  but leaves the step-2 form outside every memo scope (its output, read on 2026-10-07: the form JSX is rebuilt at each
  render), so a watch at the root re-renders EVERYTHING: 562 components and 2 commits per key in «Quantità» on the
  census, 0 and 0 after the move (`npm run perf:census -- --scenario=asset`; one `useWatch('quantity')` put back at the
  root read 563, seen red). The root keeps the watches that decide the form's SHAPE (type, class, the switches and
  selects — one change per click) and the ISIN. Submit-time reads stay `getValues()`/the `data` of `handleSubmit`.
- **A marker on a label is a claim the validation has to honour.** `*` = required, `(opzionale)` in
  `text-muted-foreground font-normal` = explicitly optional; the zod schema, any imperative guard in `onSubmit` and the
  marker's own condition must agree (2026-08-30: Sottocategoria was `.optional()` in zod, blocked by a guard, and
  starred on a condition — `availableSubCategories().length > 0` — NARROWER than the guard's). It is genuinely optional
  now: the Select carries a «Nessuna» item (`NO_SUB_CATEGORY_VALUE`, since Radix reserves `''`) and BOTH write paths
  clear the field — `updateAsset` for cash/realestate/pensionFund, `updateAssetMetadata` for every ledger type, each
  with the `'subCategory' in updates` guard so a partial caller does not wipe a classification it never sent. The
  allocation consequence is the `NO_SUBCATEGORY_LABEL` bucket: doc/guide/allocazione.md § Allocation — `allocationRole` and where the filter must live.

## Composizione mobile

Composed for a small screen on 2026-10-14, with Analisi and Storico, after Hall of Fame, the Panoramica, Cashflow and Rendimenti (its spec, retired on 2026-10-15, is in `git log -- doc/mobile/`; the primitives and the sample page are Hall of Fame's, doc/guide/hall-of-fame.md § Composizione mobile): below `desktop:` the page is composed, at 1440 it is the page above with four declared changes — the market a sentence of its own, the year's variation in the verdict, a printed zero without a sign, Movimenti as a notice when the ledger is not read. The rules are DESIGN.md's (§ 5 → Small-Screen Composition: The First-Screen, Lifted-Figure, Closed-Row and Binding-Clause Rules); here is what this page does with them.

- **THE tile**: Patrimonio totale lordo (`PatrimonioTile`, shared with the Panoramica and the landing), `id="patrimonio-patrimonio"`, open at every width, its curve at 120px below `desktop:` (the chart yields, never the reading — DESIGN.md → The First-Screen Rule, 2026-09-27). Its hero is exempt from «non ripete» (THE tile's hero is never lifted — DESIGN.md → The Lifted-Figure Rule, 2026-10-10); what it hides below `desktop:` is under Lifted blocks.
- **The strip** (`selectPatrimonioStrip({ gains, cash })`, `patrimonioSummary.ts`): «G/P non realizzato» (`signed-currency`, `decimals: 2`: the tile prints the cents) → opens `patrimonio-rendimento`, lifts its KPI — `RendimentoTile`'s `liftedFigures: ['gain']` hides the 22px figure and its label, the percentage over the cost basis stays (of a lifted block only the repeated figure hides — DESIGN.md → The Lifted-Figure Rule, 2026-10-10); the tile prints it through `formatSignedEuro` (`lib/utils/formatters.ts`), the cell through `formatStripFigure`, one rule for a zero. «Liquidità» (`cash.shareOfTotal`, `percent`, one decimal) → opens `patrimonio-liquidita`; it repeats the Liquidità READING, which stays whole (only blocks are lifted — DESIGN.md → The Lifted-Figure Rule, 2026-10-10). `null` cells say why: «nessuna posizione con un prezzo di carico», «nessun conto registrato», «nessun totale su cui misurarla», «i debiti superano i conti». The overview unread: no verdict, no strip.
- **Lifted blocks** (`liftedFigures`, hidden below `desktop:` by `LIFTED_FIGURE_CLASS`; on the Rendimento tile guarded by `isAssetRendimentoLiftedBlock`): on THE tile the month's chip (its figures are the first sentence), the year's chip WHOLE (its percentage and euro are the first sentence of «Il perché», a sentence of its own at every width since 2026-10-14), the curve's last label (the hero in compact form) and the «Mercato:» digest only when the sentence names the market (`patrimonioVerdictNamesMarket`, the Panoramica's `verdictNamesMarket` on the built model); on Rendimento its G/P KPI (`liftedFigures: ['gain']`, under The strip).
- **The rows and their aside, in DOM order** (ids `PATRIMONIO_SECTION_IDS`; `resolvePatrimonioSections`, memoized: Classi and Rendimento exist with the overview, «Mutuo» once per loan): `patrimonio-movimenti` (the month's name) · `patrimonio-liquidita` (`formatHoldingCounts(0, accounts, personal loans)`: «3 conti e 1 prestito») · `patrimonio-classi` («per asset class») · `patrimonio-rendimento` («vs PMC») · `patrimonio-mutuo-<loanId>` (`patrimonioMutuoSectionId`; the property's or the loan's name with several, else «interessi e capitale»; a row opened before the first-visit migration closes after it — the new id is not in the memory; the id of a deleted loan falls out of `known`, so `resolveOpenSections` ignores it when the memory is read — it stays in the stored list through a single row's tap, and «Apri tutte»/«Chiudi tutte», which write only known ids, drop it) · `patrimonio-strumenti` (`formatHoldingCounts(instruments, 0, loans)`: the hero's figures). A tile whose aside was a mono span passes the same words as a STRING when it is a row (`Tile` keeps a text aside beside the eyebrow, a node goes into the panel as a control). Since 2026-10-17 `patrimonio-intestatari` («quote per persona») sits between Rendimento and the loans, only when a held asset names a person (`resolvePatrimonioSections`'s `hasOwnership`); its landscape answer is the largest owner's printed share («Marco 54%», `describeOwnershipAnswer`).
- **Strumenti is a closed row over its light rows**: closed, its panel is empty — no `AssetRow`, no chart in `main` at load (`e2e/mobile-composition.patrimonio.mobile.spec.ts`) — while `StrumentiTile` stays mounted, so the sparkline's idle preload still runs; the table OR the rows is decided by `!useCompactLayout()` since 2026-10-14 (one query with the CSS; the server's first frame would be the TABLE, never painted behind `ProtectedRoute`). The section takes the row's id below `desktop:` and keeps `#strumenti` at 1440 (`STRUMENTI_ANCHOR_ID`); the hero's count is a button that `reveal`s the row below `desktop:` and the link to `#strumenti` at 1440.
- **`binding` clauses and the `scope`** (`buildPatrimonioVerdict`): `leadLength` closes the first sentence — the total, the month's change, the counts. Behind «Il perché»: «Da inizio anno +4,10% (+4500,00 €).» (the owner's choice of 2026-10-14, interactive: a sentence of its own, at every width — a declared addition at 1440), the market as a sentence of its own («Sul mercato ha spinto soprattutto un ETF (+900 €).»; «; sul mercato» until 2026-10-14 — the phone's cut needs a full stop, at 1440 too, a rule of 2026-09-27), the month's split, the sale. `patrimonioRestLabel` names what the rest holds: «il mercato del mese», «la vendita del mese», «mercato e vendita del mese», and with the year in front «l'anno», «l'anno e il mercato del mese», «l'anno e la vendita del mese», «l'anno, il mercato e la vendita del mese». The sale's tax and counterfactual are `binding` (`describeSales`): that month the whole paragraph stays under the title. A printed zero takes no sign and no colour (`signed` + `isPrintedZero`; AGENTS.md § Layout and Color Tokens, 2026-10-10) — «+0,00 €» in green until then. No `scope`: the page's `PageVerdict` passes none.
- **Absences**: loading is `TileGridSkeleton` under the header until every query the tiles read has answered (assets, overview, snapshots, the ledger's meta, the instalments); a failed read of the assets is the whole page's `ErrorNotice`, no tile. Nothing recorded is said by the closed rows' asides («nessun conto», «nessuno strumento»). A failed read of the ledger or of its meta is Movimenti `failed` (`ErrorNotice collapse`, red eyebrow, open until dismissed) — and an `ErrorNotice` at 1440 too, never «Nessuna operazione» (the owner's choice of 2026-10-10; a client-SDK read cannot be failed from a spec, so the open-on-failure is Vitest's, `resolveOpenSections` — generic, not Patrimonio's: the notice itself, at 390 or at 1440, has no automated proof, declared 2026-10-15); a failed read of the instalments is ONE row `patrimonio-mutuo`, eyebrow «Mutuo» when a loan finances a property, else «Prestito». The overview unread: today's notice, «Il resto della pagina» the grid's first child, `defaultOpen: ['patrimonio-movimenti']`. Below `desktop:` every notice row is silent (`live={!sections.compact}`): `PageRest` speaks for them.
- **The memory**: `mobile-sections:assets` (`useMobileSections({ route: 'assets' })`; per device and browser, not per account); absent or unreadable → the page's defaults: every row closed, or Movimenti open when the overview is unread (`OVERVIEW_FAILED_DEFAULT_OPEN`). «Il perché» is remembered as the row `perche`.
- **Measured** (`census@example.com`, 2026-10-14): 390 1,67 schermate · 1/0 tessere · 7/4 cifre (sopra la piega / fuori dal verdetto: le due celle, l'eroe, l'etichetta sinistra della curva — l'obiettivo «≤ 5» raggiunto, Liquidità resta) · prima riga chiusa sotto la pill (finisce a 976 contro 767, `raisedBy` «2026-10-14: …», in doc/guide/prima-schermata-misure.md § Registro delle voci allargate); 768 1,25 · 5/3 · 16/13; 1024 1,58 · 1/0 · 10/7, LA tessera non più intera sopra la piega (`tilesFullyAboveFold` 1 → 0 con `raisedBy`; il 1024 l'ha poi ricomposto lo stage orizzontale del 2026-10-16). Prima: 390 3,25 · 16/5; `mount` di Patrimonio a 390 (`perf:census`) 1235 → 889 componenti, 57 → 40 layout.
- **768 and the landscape stage** (since 2026-10-16; `lib/utils/tabletComposition.ts`, `useTabletComposition` + `useTabletStage`; DESIGN.md → The First-Screen and Closed-Row Rules, doc/guide/shell.md § The landscape stage; the landscape tablet's spec, retired on 2026-10-16, is in `git log -- doc/mobile/`): at 768 two columns — Patrimonio totale lordo on both, «Il resto della pagina» on a row of its own, the rows two by two in DOM order, an open row and a closed one left alone on the whole grid row. **On a tablet in landscape** (a content box ≥ 880px below 1440: 936 at 1024×768 beside the icon rail) the page is a STAGE: on the left the short verdict (title, first sentence, «Il perché», the strip on one row) and Patrimonio totale lordo under it, 16px apart, both sticky when the left stack fits the screen, the tile reaching the fold and its curve growing to fill it; on the right the 360px INDEX, ONE card with «Il resto della pagina» and every row flat under hairlines (a per-loan row takes its place, the ones after it slide), each opening in place, at least as tall as the left stack. The lifted blocks (the hero's chips, the Rendimento tile's) hide below `desktop:`, the tablet included.
- **With the overview unread there is no hero and no stage**: the plain grid (`PLAIN_GRID_CLASS`), the month's movements open by default, Mutuo/Prestito and Strumenti on both columns at 768 and in landscape. **Fixed on 2026-10-16** (one of the landscape tablet's three runtime defects): in that state the composed cell classes had dropped their `tablet:col-span-2`, leaving Mutuo/Prestito and Strumenti on half the grid; `e2e/patrimonio.tablet.spec.ts` holds Strumenti across the plain grid in both tablet projects (seen red with the class taken off).
- **The closed rows answer in the index** (DESIGN.md → The Closed-Row Rule, 2026-10-16, landscape only; `describePatrimonioClosedAnswers` in `patrimonioSummary.ts`, through `RowAnswers`; a `null` keeps the row's aside, and below landscape every row keeps it):
  - Movimenti: «netto {±€ compact}» (`formatSignedEuro`, no sign colour: investing is not a gain); null with no operation in the month, the ledger not active, loading or failed.
  - Liquidità: «sui conti {€}» (the amount, typographic minus below zero — its share is the strip's cell); null with no account.
  - Classi: «{class} {%}» (`describeLeadingClass`); null when that share prints as a strip cell does.
  - Rendimento: «sul costo {±%}» (one decimal, sign colour unless it prints as zero — its euro is the strip's); null with no position with a cost.
  - Mutuo/Prestito (one loan): «fine prevista {nov 2036}», «estinto», «il debito non scende»; null with several loans (the name tells them apart) or a failed read of the instalments.
  - Strumenti: «i/gli 3 maggiori {%}» (one decimal, of the total); null with three positions or fewer.
- **The specs**: `e2e/mobile-composition.patrimonio.mobile.spec.ts` (390, the overview patched by `e2e/overviewFixture.ts`), `e2e/mobile-composition.patrimonio.spec.ts` (1440; since 2026-10-18 the Intestatari «Valore | Carico» switch and its memory across a reload too); `assets.rows.mobile.spec.ts` and the 390 case of `assets.composite-chip.spec.ts` open Strumenti first. `e2e/patrimonio.tablet.spec.ts` (both tablet projects); `__tests__/patrimonioSummary.test.ts` holds `selectPatrimonioStrip` and the landscape answers.

## Per-page blind spots

- **Patrimonio**: Δ columns are empty for pension funds and cash accounts by design; the Rendimento tile ranks only within the overview's `topAssets` (15 largest); «Movimenti del mese» reads the whole ledger and filters in memory; **«Andamento» hides Quantità/Prezzo/PMC/TER while it is on** (a view, not a bug — the footer says so); a hand-valued row shows «—» for quantity, price and PMC and has no G/P (its PMC is its price); `text-muted-foreground` on the tile surface measures 4,48:1 in light on the owner's named theme (0,02 under AA; the default theme passes — a theme issue, doc/guide/temi.md, not touched); **a foreign-currency position has no G/P, no YOC and no PMC in euro until its ledger has projected `averageCostEur`** (the backfill runs on the first visit to Patrimonio; before it, the Panoramica's «Asset principali» and the PDF print no return for it — never the old dollar-against-euro figure); a EUR position measured against the native PMC before the backfill reads a G/P higher by its purchase fees. **Two accepted side effects of the optional Sottocategoria** (2026-08-30; neither is new — without the asterisk they are only less signalled): a cash account without the «conti correnti» subcategory loses the 5.000 € stamp-duty threshold AND the flat fee — it pays the securities' rate on its balance (`calculateStampDuty`, a rule Impostazioni already states), and changing Tipo or Classe does not clear `subCategory`, so an out-of-class value can survive invisibly — Radix shows the placeholder because the value is not among the items. **The checking-account duty is a flat 34,20 € above 5.000 €** (`lib/constants/stampDuty.ts`, fixed 2026-09-24: until then the account paid `balance × 0,2%` while the comment beside it said the flat rule and the test pinned the wrong figure — 12 € on 6.000 €, 2.000 € on a million); the threshold reads TODAY's balance, while the law reads the year's average balance, which the app does not keep — an account that dips under 5.000 € on the day the Costi tile is read shows no duty.
- **Light rows and dialogs** (2026-10-07): typing an ISIN still re-renders the whole asset form at each key — it turns
  every bond label to «% del nominale», so it stays a root watch (rare, one field); a row's sparkline, once opened,
  stays mounted until the page unmounts; the account detail and the asset form cross-fade when «Modifica» hands one
  over to the other (the detail plays its exit, which it used to skip); a phone downloads the sparkline's chunk when
  idle even if no row is ever opened.
- **Composite chip**: sorting by «Classe» and the group headers still read the PREVALENT class only — a 60/40 fund
  sorts and groups with pure «Azioni» (one instrument, one row; the split lives in the chip); the chip's segments are
  the stored `composition`, never re-read from the market, so a fund whose mix drifted shows its last saved split.
- **Mutuo**: the interest counts from the first instalment the app settled, never before the link; the projected end assumes monthly instalments of the latest linked amount at today's TAN (a variable rate moves it); the tile appears only for a loan with a linked instalment, so a loan tracked without the link has no tile; the «Per anno» table appears from the second measured year.
- **Intestatari** (2026-10-17): the tile's rows share the NET total, so a member whose debts outweigh their assets has a negative amount and no bar (a bar has no negative width) and the reading names them «in negativo»; an owner set on a pension fund's `ownerMemberId` by hand is never read (the Previdenza member wins), and a mortgage's own rows are never read while its property exists (the property's fractions win); the Strumenti filter is a session lens, not remembered like the two toggles; **the rows' «N asset» no longer add up to the aside** since the quotas (a divided asset counts in every row that holds a quota of it, the owner's choice: «3 asset» and «2 asset» under «su 4 asset» is right); **an asset with quotas past its quantity is split by their proportions** (declared «quote da riassegnare», the tile still adds up) — the stored units are untouched until the owner reassigns them, and a buy that restores the quantity makes the declaration vanish on its own; the sum line of the form reads the typed rows only (an empty field is 0), and «Nessuna quota in comune» with a single member saves the legacy shape (`ownerMemberId` alone); **a document with a percent row AND a units row** (never written by the form, which saves one form) reads as a percent block — the units row's fraction is still its own (`resolveAssetOwnership.mode` says only how the rest is figured); a percent block is never «da riassegnare» (100% follows the asset); the base E2E fixture names an owner through its pension fund's member alone (the Previdenza seed), so the row EXISTS in every composed spec of Patrimonio and the Panoramica (their row lists carry it) while the filter, the sub-line, the form's rows and the tile's words have no browser proof — Vitest holds the slices, the summary, the words and the answers, the owner's look on the preview after the merge (phase F skipped on 2026-10-17, the owner's call). **The «Carico» view** (2026-10-18): a quoted instrument without a EUR PMC — a foreign position before its ledger backfill, a position with no PMC typed — counts at its value and is named in the footer, so on an account that holds many of them the two splits coincide for a reason the footer states; a pension fund counts at its value, never at its contributions (the owner's call: a fund's carry is Previdenza's measure, not this tile's); the closed row's answer in the landscape index («Marco 54%») is on the value whatever the remembered basis, since the switch is not visible on a closed row; the memory is per browser, not per account — a second account on the same browser opens on the last choice; the switch has a 1440 proof on the base account (`e2e/mobile-composition.patrimonio.spec.ts`), the phone row's switch has none beyond Vitest (phase F skipped on 2026-10-18 too, the owner's call).
- **Loans** (2026-10-10): a personal loan larger than the accounts turns the Liquidità class NEGATIVE on the Composizione tiles and in Storico's composition (the credit-card case of 2026-09-19, now reachable on purpose — declared, not clamped); a loan's row in Storico's «Valore per strumento» is a negative line that rises to zero; the Panoramica's «Asset principali» never ranks it (price effect 0 by construction); a loan deleted by hand after its payoff is read by the Driver as repaid in that month (its negative `totalValue` leaves the snapshots); the demo account keeps the legacy property debt (no write on the demo), so there a mortgage is still a field of the house and the «Mutuo» tile reads the property; the migration runs on the owner's next visit to Patrimonio and nowhere else — an account that never opens the page keeps the old model, which still works.
- **FX** depends on Frankfurter with a 24h in-memory cache (no fallback on a cold instance). Pre-migration non-EUR assets without `currentPriceEur` show the native price as EUR until the first update; one with `autoUpdatePrice: false` never self-heals until re-saved. (moved from `CLAUDE.md` → Known Issues on 2026-09-19)
- **Bonds saved before 2026-09-11 with the nominal empty or 1 keep a wrong PMC and opening trade** (the raw quote as
  euro: 99 for 0,99); the current price heals at the next cron, the PMC does not — corrected by the user from the
  Registro, no backfill by the owner's decision. **A BTP€i is only as current as its coefficient**: Borsa Italiana does
  not publish it, so the value lags the last coefficient entered (~6 months between coupons unless refreshed from the
  form), a coupon is provisional until the payment-date coefficient is typed, the PMC entered in the asset form uses
  TODAY's coefficient (the Registro's trade carries the right one), and redemption at maturity (nominal × coefficient)
  is not an event for any bond. **`createAsset` re-links a new asset onto an existing one with the same ISIN whenever
  that ISIN already has dividends** (ISIN continuity, by design): creating a second bond with an already-held ISIN
  merges it into the first. (moved from `CLAUDE.md` → Known Issues on 2026-09-19)
