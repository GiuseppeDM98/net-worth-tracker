# Patrimonio

> **Quando aprire questa guida** — chi tocca `app/dashboard/assets/page.tsx`, `components/assets/*`, `lib/utils/{patrimonioSummary,patrimonioNarrative,assetPerformanceDeltas,assetPricing,assetLiquidity}.ts`. Include le regole di valutazione degli asset (prezzo di mercato, FX, GBp). In `AGENTS.md` resta lo stub con l'essenziale; qui c'è la regola completa. File: § *Files*, sotto.

## Files

Moved here from `CLAUDE.md` → *Key Files* on 2026-09-19.

- **Mutuo tile** (2026-09-25): `components/assets/tiles/MutuoTile.tsx`, pure `lib/utils/mortgageSummary.ts` (`summarizeMortgage`, `projectPayoff`, `interestPaidOf`), words `describeMortgage*` in `patrimonioNarrative.ts`, reader `getMortgageInstalments` + `lib/hooks/useMortgageInstalments.ts`; tests `__tests__/mortgageSummary.test.ts`, `e2e/cashflow.mortgage.spec.ts`
- **Patrimonio**: `app/dashboard/assets/page.tsx` (owns every dialog), `components/assets/*` (+ `PatrimonioTile`/`ComposizioneTile` reused from the overview), pure `lib/utils/{patrimonioNarrative,patrimonioSummary,assetPerformanceDeltas,costBasisEur}.ts` (`costBasisPerUnitEur`/`unitPriceEur` = EUR against EUR, fees included), `lib/utils/bondPricing.ts` (`resolveBondPrice` = the ONE Borsa Italiana quote → euro per unit, nominal 1 € by default, BTP€i coefficient; `toBorsaItalianaQuote` the inverse; shared with `lib/helpers/priceUpdater.ts`), `lib/utils/bondDetailsForm.ts` (`buildBondDetailsFromForm`, a rate of 0 is a zero coupon); `lib/services/assetService.ts`, `types/assets.ts`; spec `e2e/assets.bond.spec.ts`

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
  on the closed panel): a card per row inside the Strumenti tile would be a card inside a card. Class chips take
  their label from `ASSET_CLASS_LABELS` (Italian); `lib/utils/assetUtils.ts` with its English map is gone.
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
- **Bulk delete is the same single-asset mutation, run per tick** (2026-09-25): the table header and every
  `AssetRow` carry a checkbox (one Tab stop per list via `useRovingFocus`), a bar appears while something is
  selected («N selezionati», an armed `BulkDeleteButton`, «Deseleziona»), and confirming runs
  `deleteAssetMutation.mutateAsync` once per id through `Promise.allSettled` — a partial failure names how many
  went through (`Eliminati X di N`), so the selection left standing is no surprise. The master checkbox selects
  EVERY instrument (collapsed groups included); the roving index follows the RENDERED order, which in grouped
  mode is class order, not the sort order.
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
  link to `#strumenti` (the `Tile` primitive takes an `id`): on a phone the table starts three screens down.
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
- **A property's debt moves by itself when instalments are linked to it** (2026-09-25, doc/guide/cashflow.md § Expense
  Sign Convention and Type Changes): the form's «TAN del mutuo» (`debtInterestRate`, shown with «Debito residuo»)
  splits each linked instalment into interest and the principal that lowers `outstandingDebt`. Both fields are
  user-clearable through `updateAsset`'s `'x' in updates` guard — before it, switching «Debito residuo» off saved
  nothing and the debt came back on the next load (pinned by `__tests__/updateAssetDebtFields.test.ts`).
- **«Mutuo» answers «quanto mi costa il mutuo?»** (2026-09-25, owner's choice of place): one full-width tile per
  property with at least one linked instalment, between Rendimento and Strumenti. The reading says what this year's
  SETTLED instalments paid in interest and repaid in principal, and where the plan ends; the KPIs are the debt, the
  year's interest and principal and the projected end; from the second measured year a «Per anno» table lists every
  year, the first one captioned from the link («da settembre») and the running one «finora». The interest is a MEASURE
  only from the rows the app settled — each stores `debtInterestPaid` beside `debtPrincipalRepaid` — and the
  instalments paid before the link are NOT reconstructed (owner): the footer says from when it counts. A row settled
  before the field existed reads it as instalment − principal (`interestPaidOf`). The end is the French amortisation
  on today's debt, TAN and the latest linked instalment (`projectPayoff`: n = −ln(1 − D·r/P)/ln(1 + r), rounded up;
  `never` when the instalment does not cover the interest). No figure takes a sign colour: interest is a cost already
  counted in Cashflow, not a gain or a loss. The reader is one query per property (`userId` + `debtAssetId`, two
  equalities, no composite index), keyed UNDER `queryKeys.assets.all` so every debt-moving mutation refreshes it, with
  `staleTime: 0` because linking a series moves no asset; the page's skeleton waits for it and a failed read is an
  `ErrorNotice` where the tile would be.
- **A failed overview is an alert, not a skeleton**: the page gates the skeleton on `isLoading` of EVERY query it
  reads (assets, overview, snapshots, ledger meta) and, when the overview errs, keeps Liquidità, Movimenti and
  Strumenti alive on the live assets (`totalValue` falls back to `calculateTotalValue(assets)`) behind a
  `role="alert"` notice where the verdict would be — the management surface must survive a payload failure.
- **The hero's «Mercato:» digest names three instruments and closes with «altri»** = `marketEffect − Σ shown`, so
  the three can never hide a negative total behind three gains (the class digest lists every class instead).

## Per-page blind spots

- **Patrimonio**: Δ columns are empty for pension funds and cash accounts by design; the Rendimento tile ranks only within the overview's `topAssets` (15 largest); «Movimenti del mese» reads the whole ledger and filters in memory; **«Andamento» hides Quantità/Prezzo/PMC/TER while it is on** (a view, not a bug — the footer says so); a hand-valued row shows «—» for quantity, price and PMC and has no G/P (its PMC is its price); `text-muted-foreground` on the tile surface measures 4,48:1 in light on the owner's named theme (0,02 under AA; the default theme passes — a theme issue, doc/guide/temi.md, not touched); **a foreign-currency position has no G/P, no YOC and no PMC in euro until its ledger has projected `averageCostEur`** (the backfill runs on the first visit to Patrimonio; before it, the Panoramica's «Asset principali» and the PDF print no return for it — never the old dollar-against-euro figure); a EUR position measured against the native PMC before the backfill reads a G/P higher by its purchase fees; `AssetDialog.tsx` carries 7 pre-existing `react-hooks` errors. **Two accepted side effects of the optional Sottocategoria** (2026-08-30; neither is new — without the asterisk they are only less signalled): a cash account without the «conti correnti» subcategory loses the 5.000 € stamp-duty threshold AND the flat fee — it pays the securities' rate on its balance (`calculateStampDuty`, a rule Impostazioni already states), and changing Tipo or Classe does not clear `subCategory`, so an out-of-class value can survive invisibly — Radix shows the placeholder because the value is not among the items. **The checking-account duty is a flat 34,20 € above 5.000 €** (`lib/constants/stampDuty.ts`, fixed 2026-09-24: until then the account paid `balance × 0,2%` while the comment beside it said the flat rule and the test pinned the wrong figure — 12 € on 6.000 €, 2.000 € on a million); the threshold reads TODAY's balance, while the law reads the year's average balance, which the app does not keep — an account that dips under 5.000 € on the day the Costi tile is read shows no duty.
- **Mutuo**: the interest counts from the first instalment the app settled, never before the link; the projected end assumes monthly instalments of the latest linked amount at today's TAN (a variable rate moves it); the tile appears only for a property with a linked instalment, so a mortgage tracked without the link has no tile; the «Per anno» table appears from the second measured year.
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
