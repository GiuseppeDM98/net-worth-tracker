# Patrimonio

> **Quando aprire questa guida** — chi tocca `app/dashboard/assets/page.tsx`, `components/assets/*`, `lib/utils/{patrimonioSummary,patrimonioNarrative,assetPerformanceDeltas,assetPricing,assetLiquidity}.ts`. Include le regole di valutazione degli asset (prezzo di mercato, FX, GBp). In `AGENTS.md` resta lo stub con l'essenziale; qui c'è la regola completa. File: `CLAUDE.md` → *Key Files* → *Patrimonio* e *Shared utils*.

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
  in `quantity`, and Borsa Italiana bond prices are `% of par` (`rawPrice * nominalValue / 100`).
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
  Panoramica's lists classes — the two pages never print the same «Mercato:» line.
- **«Movimenti del mese» reads the owner's whole ledger** (`useAssetTransactions(ownerId, undefined, { enabled:
  ledgerReady })`) and filters the Italian calendar month in memory: a month query would need a `(userId, date)`
  composite index that does not exist. Baselines and adjustments are not trades; a buy's amount is gross + fees,
  a sell's gross − fees (the engine's `computeInvestedCapital` definition).
- **Peso is measured over the GROSS total** (cash accounts included), like the Classi and Liquidità shares —
  before the redesign the table measured it over the instruments only.
- **Below `desktop:` the rows are `AssetRow`, flat and expandable** (CSS `grid-rows-[0fr] → [1fr]` with `inert`
  on the closed panel): a card per row inside the Strumenti tile would be a card inside a card. Class chips take
  their label from `ASSET_CLASS_LABELS` (Italian); `lib/utils/assetUtils.ts` with its English map is gone.
- **Italian articles are data, not guesses**: `articleForPercent` («l'8%», «il 7%», «lo 0,5%»), `ofThePercent`
  («del 3%», «dell'8%», «dello 0,5%»), `atThePercent` («al 71%», «all'8%», «allo 0,5%») and `pluralArticleFor`
  («gli 8», «i 3») in `patrimonioNarrative.ts` — use them for any count or percentage a sentence names. **The article
  follows the figure as PRINTED**: 7,96 rounds to «8,0%», so it takes «l'», not «il» — decide on `formatPercentage`'s
  output, never on the raw value. **An articulated preposition typed by hand is a bug waiting for a small number**:
  `overviewNarrative`'s `describeComposition` wrote «al » literally and printed «carry al 0,1%» the first time a class
  landed under 0,5% on the Panoramica (found in the browser, 2026-08-30). A hard-coded «al »/«del » is correct for most
  figures, which is precisely why it survives review — grep for a quoted preposition sitting next to a
  `formatPercentage` call before writing another one.
- **A failed overview is an alert, not a skeleton**: the page gates the skeleton on `isLoading` of EVERY query it
  reads (assets, overview, snapshots, ledger meta) and, when the overview errs, keeps Liquidità, Movimenti and
  Strumenti alive on the live assets (`totalValue` falls back to `calculateTotalValue(assets)`) behind a
  `role="alert"` notice where the verdict would be — the management surface must survive a payload failure.
- **The hero's «Mercato:» digest names three instruments and closes with «altri»** = `marketEffect − Σ shown`, so
  the three can never hide a negative total behind three gains (the class digest lists every class instead).

## Per-page blind spots

- **Patrimonio**: Δ columns are empty for pension funds and cash accounts by design; the Rendimento tile ranks only within the overview's `topAssets` (15 largest); «Movimenti del mese» reads the whole ledger and filters in memory; the 2-click delete auto-disarms on a 3 s timer (kept on request); G/P against PMC compares a native-currency `averageCost` with the EUR value; `TaxCalculatorModal` simulates in the native price but labels €; `AssetDialog.tsx` carries 7 pre-existing `react-hooks` errors. **Two accepted side effects of the optional Sottocategoria** (2026-08-30; neither is new — without the asterisk they are only less signalled): a cash account without the «conti correnti» subcategory loses the 5.000 € stamp-duty threshold (`calculateStampDuty`, a rule Impostazioni already states), and changing Tipo or Classe does not clear `subCategory`, so an out-of-class value can survive invisibly — Radix shows the placeholder because the value is not among the items.
