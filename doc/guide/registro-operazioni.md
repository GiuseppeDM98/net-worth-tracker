# Registro operazioni (Asset Trade Ledger)

> **Quando aprire questa guida** — chi tocca `lib/utils/assetTransactionUtils.ts`, `lib/server/{assetTransactionUseCase,tradeFxService}.ts`, `app/api/asset-transactions/*`, `components/assets/{TransactionDialog,AssetMovementsDialog}.tsx`. Esercizio: `__tests__/assetTransactionWriteTx.test.ts`. In `AGENTS.md` resta lo stub con l'essenziale; qui c'è la regola completa. File: § *Files*, sotto.

## Files

Moved here from `CLAUDE.md` → *Key Files* on 2026-09-19.

- **Asset trade ledger**: engine `lib/utils/assetTransactionUtils.ts` + `types/assetTransactions.ts`; server `lib/server/{assetTransactionUseCase,tradeFxService}.ts` (+ `backfillAverageCostEur`) + `app/api/asset-transactions/*` (incl. `backfill-average-cost-eur`); client `lib/services/assetTransactionService.ts`, UI `components/assets/{TransactionDialog,AssetMovementsDialog}.tsx`; collections `assetTransactions`/`assetTransactionsMeta`
- **Suites to run after a change here — Asset Trade Ledger** (moved from `AGENTS.md` § Commands on 2026-09-30): **Ledger** `assetTransactionUtils`, `assetTransactionsRoutes`, `assetTransactionWriteTx`, `assetTransactionAverageCostEurBackfill`, `ledgerMetaFreshness`, `saleTax`, `cents`, `periodSales`, `tradeFeeExpense`, `assetDeleteRoute` · **Browser** `e2e/assets.sale-tax.spec.ts`, `e2e/assets.ledger-meta.spec.ts`, `e2e/assets.trade-fee.spec.ts`

## Asset Trade Ledger

- Three trade types per asset — BUY / SELL / ADJUSTMENT — with an optional cash settlement that debits or credits a
  cash account atomically, so a settled trade is net-worth-neutral. `TransactionDialog` writes, `AssetMovementsDialog`
  reads (P&L, return, XIRR, per-sell realized % at the PMC of the trade). Feeds Rendimenti (invested capital, realized
  gains) and Dividendi (holding start).
### Engine (`lib/utils/assetTransactionUtils.ts`, pure and Firebase-free)
- ALL trade money-math lives here (replay, PMC, realized P&L, XIRR, total return, invested capital); the service/route
  layer is a thin atomic writer. A new `AssetTransactionType` must update the replay switch, the zod schema AND
  `TransactionDialog`. **The PMC carries no fee** (owner, 2026-11-12) and a sell never moves it;
  `fiscalAverageCostEur` keeps the purchase fees for the tax estimates (§ The fee as a spending row).
  **The EUR side is the one the app measures against** (2026-09-07): `buildDerivedAssetFields` projects
  `averageCostEur` (= `costBasisEur / quantity`, no fee) and `fiscalAverageCostEur` (= `fiscalCostBasisEur /
  quantity`, purchase fees included) onto the asset doc beside `quantity` and the native `averageCost`, and
  `lib/utils/costBasisEur.ts` is the ONE reader of them — doc/guide/patrimonio.md § Asset Pricing. The replay also
  sums `feesEur`: `computeAssetTotalReturn` subtracts it, so a RETURN is net of every fee like the XIRR's flows,
  while the realized and unrealized P&L are fee-free. `backfillAverageCostEur` (use case + route + the Patrimonio
  page's one-shot trigger) projects the two PMCs onto the docs; it writes ONLY those two fields, and a ledger the replay
  rejects is counted in `skippedAssetCount`, never fatal. Its done-signal is `averageCostEurFeeFreeAt` since
  2026-11-12 (`averageCostEurBackfilledAt` is superseded): every account re-projects once, at its first visit.
- **The migration baseline (`isBaseline` BUY) NEVER stamps `holdingStartDate`**, and `replayTransactions` returning
  `holdingStartDate: undefined` means **leave the asset doc untouched** — never `deleteField()`, which would zero YOC for
  the whole portfolio.
- **Replay ordering is deterministic and internal** (date → baseline < buy < sell < adjustment → `createdAt` → `id`), and
  this same replay IS the pre-write validation: invalid histories throw `LedgerValidationError` with an Italian
  `userMessage` forwarded verbatim in a 422.
- **A trade date has ONE floor, the asset's own baseline, and the future as its only ceiling** (2026-09-13). Until then
  `assetTransactionsMeta.baselineDate` — the day the account opened the ledger — floored EVERY trade date in both
  dialogs and in `assertDateWithinBounds`, and on a new account that day is the first visit to Patrimonio, so «today»
  was the floor and no past purchase was recordable (a user's report: ENI shares bought in 2024 and 2025). Now the
  server checks only `assertDateNotInFuture`; a migrated asset keeps its baseline as the floor through the replay's
  `BASELINE_NOT_FIRST`, whose message names the day («Su questo asset le operazioni partono dalla posizione iniziale
  del 01/01/2024»), and `TransactionDialog` sets the input's `min` from the asset's OWN baseline (`existingTransactions`),
  never from the meta. The consequences are declared, not hidden: the Rendimenti flows read an instrument's first
  appearance as its entry (doc/guide/rendimenti.md § THE ENTRY MONTH); a settlement account is debited TODAY whatever
  the date, so with a date in a past month both dialogs replace the promise with a warning
  (`describeSettlementTiming`, `lib/utils/dialogNarrative.ts`); `holdingStartDate` moves back to the real purchase, so
  the registry's dividends after it count for YOC; realized P&L lands in the sale's fiscal year; the snapshots stay
  frozen photos (Storico does not rewrite history). Recording history BEFORE a migrated asset's baseline is not
  supported: the baseline is the frozen opening position, and the owner chose not to add a replacement story.
- **The per-asset XIRR is date-exact and SEPARATE from `performanceService.calculateIRR`** — keep both; it returns a
  FRACTION, and `null` renders as "–", never 0. **`replayTransactions` replays ONE asset**, so `aggregateRealizedByYear`
  (same engine, consumed by `summarizeRealizedGains` → `PlusvalenzeTile.tsx`) must group by `assetId` FIRST: realized P&L is PMC-dependent
  per position.
- **Per-transaction derived data (a sell's own P&L %, PMC-at-trade) comes from `replayTransactionsWithEffects`**, never
  from re-running `replayTransactions` on every prefix (O(n²)). One pass emits one `LedgerTransactionEffect` per
  transaction, with the optional fields populated ONLY for `sell`, so a caller indexes by id with no holes.
  `replayTransactions(txs)` is just `.state` of the same call.
- **A sell credits its account NET of the tax the broker withheld** (2026-09-20, `AssetTransaction.withheldTaxEur`,
  SELL only, `>= 0`). In regime amministrato the tax leaves the proceeds the day of the sale; crediting the gross left
  the owner to lower the account by hand, and every verdict read that as «altre variazioni». `computeCashDelta` =
  `quantity·priceEur − fees − withheldTaxEur`, **to the cent** (`lib/utils/cents.ts` — a bank moves cents, the record
  keeps its exact value; the rounding is sign-symmetric so a reversal cancels its application). Realized P&L, XIRR and
  invested capital stay GROSS of the tax: it is a fact of the settlement and of the period readings, never of the
  return. **The estimate stands on the FISCAL gain — the sale's gross minus its fee minus the fiscal cost of the units
  sold, purchase fees included** (owner, 2026-11-12; `LedgerTransactionEffect.taxableGainEur`, from the fiscal basis
  the replay keeps beside the fee-free `costBasisEur`; an adjustment resets it like the PMC). Until 2026-11-12 the
  estimate stood on the price difference alone, as a broker that ignores commissions withholds; it now sits below that
  by fees × rate, and the typed «Tasse trattenute» wins sale by sale. The realized P&L is fee-free (both fees are
  spending rows or, before 2026-11-12, legacy figures on the trade), so it and the taxable gain differ by the fees.
  Never estimate a tax from `realizedPnlEur`.
  `lib/utils/saleTax.ts` owns the estimate (`estimateSaleTax`, shared with `periodSales`), the prefill and what
  the form sends: **a typed 0 is a value** (a gain offset by past losses), an empty field on a sale that stores no tax
  sends nothing, an emptied field on one that stores a tax sends 0 (an absent key means «keep» to the API). Where the
  tax is stored `summarizePeriodSales` reads it INSTEAD of the estimate, sell by sell, and `taxIsWithheld` lets
  `describeSales` drop «circa»; the field keeps the name `estimatedTax` because stored overview payloads carry it.
  Storico's Driver keeps «tasse stimate»: a multi-year window mixes facts and estimates.
- **«Tasse trattenute» follows the estimate until the owner types** (`TransactionDialog`): the gain moves with
  quantity, price and fees, so the prefill is an effect on the RHF value gated by `isTaxTyped` (settled during render
  on `(open, transaction)`); an EDIT never prefills. On a sell that credited its account gross (recorded before the
  field) the clause under the field is a warning (`describeWithheldTaxField`): typing a tax lowers the account TODAY,
  and a balance already aligned to the bank would lose it twice. Pinned by `e2e/assets.sale-tax.spec.ts`.

### The fee as a spending row (`lib/utils/tradeFeeExpense.ts`, owner 2026-11-12)
- **A trade's fee is a spending row of its own**, in the category chosen in Impostazioni › Spese
  (`transferFeeCategoryId`, the one expense fees use), on the trade's date, with NO account: the trade's settlement
  already debits `fees` (`computeCashDelta` unchanged — a second debit would pay twice). Linked both ways
  (`AssetTransaction.feeExpenseId`, `Expense.feeOfTradeId`); its note «Commissione su acquisto di …» and its member
  (`tradeFeeOwner`, doc/guide/cashflow-divisione.md) are written once, at creation. `investedEur` and the XIRR flows
  still count the fee (the cash left, owner 2026-11-12).
- **The plan is decided INSIDE `commitTradeMutation`'s transaction** (`planTradeFee`), on the stored trade
  `assertTradeUnchanged` just checked, the settings and the category document, and the row the stored trade names —
  all read there, before any write: create, move (amount and date only), delete (fee cleared or trade deleted) or
  nothing. The new row's id is drawn in `prepare*` (`newFeeRefId`): a retried closure never mints a second. A named
  row that is gone keeps its id on the trade and is written there at the next save that finds a category.
- **The legacy rule**: a fee saved before 2026-11-12 (`fees > 0`, no `feeExpenseId`) never gets a row on a later
  edit — re-saving an old trade never backfills a past month; it stays a figure on the trade, outside the cashflow, and
  the field says so («Registrata prima che le commissioni diventassero spese…»).
- **The answer carries `feeRow`**: `'written'`, `'none'`, or `'refused'` when a row was due and the category the
  settings name is gone — the toast then appends «Commissione non registrata in Cashflow: manca la categoria in
  Impostazioni › Spese» (owner, 2026-11-12). Without a category at all the trade form's «Commissioni (€)» is disabled (a fee
  already saved stays editable) and links `?tab=spese`.
- **The first purchase of the new-instrument form takes its fee** (owner, 2026-11-13): `AssetDialog`'s «Posizione iniziale»
  has the same field and rules (`#openingFees`), and the fee rides on the first buy it already sends, so the server
  plans its row like any trade's.
- **Rows that outlive their trades stay as plain spending**: `deleteAllAssetTransactionsForAsset` (the pensionFund
  conversion) and the asset's delete route (`app/api/assets/[assetId]/route.ts`) remove `feeOfTradeId` from each row a
  trade names, in the same transaction / batch — the money left, and an unlinked row is deletable in Cashflow again.
- **The PMCs stored before then are re-projected once per account**, never backfilled with rows: the Patrimonio page's
  first visit runs `backfillAverageCostEur`, which writes both PMCs and stamps `averageCostEurFeeFreeAt` on the meta
  (§ Engine above; `assetTransactionAverageCostEurBackfill.test.ts`).
- Pinned by `tradeFeeExpense`, `assetTransactionWriteTx` (W1–W9), `assetTransactionsRoutes` (X1, X2),
  `assetDeleteRoute` and `e2e/assets.trade-fee.spec.ts`.

### Service, API, migration (`lib/server/assetTransactionUseCase.ts`)
- **Writes are Admin-API-only**: a trade atomically rewrites the asset's derived fields from a full replay, and only the
  Admin SDK can `tx.get(query)` in a transaction. Reads stay client-SDK; auth = `assertCanAccessAccount`.
- All reads before any writes; `resolveTradePriceEur` (network) resolves BEFORE the transaction; derived fields written
  DIRECTLY in-tx, not via `updateAsset`.
- **Migration is idempotent and decides in ONE transaction** (2026-11-12): the meta doc is read inside it and
  `tx.create`d last; an existing baseline is never rewritten; at most 450 baselines (422 beyond); prices are resolved
  before it, re-checked by currency and unit price, three attempts. Mutation hooks invalidate four keys:
  `assetTransactions.all` + `assets.all` + `dashboard.overview` + `expenses.all`, a trade's fee being a row the
  server writes with it — on success AND on a refusal, so the list a form is reopened from is the stored one.
- **`updateAssetMetadata` closes the `deleteField()` trap** — ledger-type edits go through it, never `updateAsset`.
  **Testing the atomic write**: the in-memory Admin fake is built inside the hoisted `vi.mock` factory, so reference
  `vi.hoisted(...)` state, never a plain const.

### UI and Rendimenti/Dividendi surfaces
- `resolveBondPrice` lives in `lib/utils/bondPricing.ts` (since 2026-09-11; it used to be exported from
  `AssetDialog.tsx`) and is REUSED by the dialog, the trade form and the price cron — a trade's `pricePerUnit` must mean
  exactly what `averageCost` means: euro per unit, the nominal defaulting to 1 € (doc/guide/patrimonio.md § Asset
  Pricing). For a BTP€i the trade form asks the indexation coefficient at the trade date and stores it beside the price
  (`indexationCoefficient`, optional, validated `> 0`, carried through `prepareEdit` only together with a new price);
  the edit form divides by it to show the quote again. **"Capitale investito" uses the page's OWN period bounds** and is deliberately a DIFFERENT number
  from "Contributi Netti"; "Plusvalenze Realizzate" is NOT period-scoped — a realized sale belongs to its fiscal year.
- **`totalReturnAssets` has two paths**: LEDGER (≥1 trade doc, the only one that can represent a closed or partially sold
  position) and a STATIC price-vs-PMC fallback. **`capitalGainAbsolute` means something different on each** (static =
  unrealized only, ledger = realized + unrealized), but both preserve `totalReturnPercentage = capitalGainPercentage +
  dividendReturnPercentage`, which the UI relies on — change one formula and re-derive the other. The ledger denominator
  is `investedEur` for BOTH open and closed states, so the meaning does not flip when a position closes.
- **`dividendReturnPercentage` is UNIFIED across both paths**: per-payment `net ÷ cost-basis-at-payment-time` using
  `Dividend.costPerShare`, never a flat ratio (which loses the anti-dilution property). `costPerShare` is stamped in
  NATIVE currency despite its type comment, so `fallbackAverageCost` must also be native.
- **When a second computation path lands next to an existing card, audit the STATIC COPY**, not just the numbers.

## Concurrency

Every ledger write decides inside its own transaction (2026-11-12): what a plan read outside it is re-read and
re-checked inside, so a late or concurrent caller (two tabs, the owner and a co-owner) changes nothing it did not see.
Pinned by `__tests__/assetTransactionsRoutes.test.ts` § concurrent writes, whose fake `adminDb` serializes the
transactions and gates chosen calls.

- **The migration decides inside its transaction and never rewrites a baseline**: the meta doc is read there, the
  baselines and the meta are `tx.create`d (a second migration finds the meta and answers `{ alreadyMigrated: true }`;
  a baseline left by a crashed run of the old batch is skipped). Prices are network, resolved before; the transaction
  re-checks each by `currency|averageCost ?? currentPrice` and retries the whole migration on a change (three
  attempts, then a 500 the page's next visit retries).
- **An edit or a delete stands on `assertTradeUnchanged`**: the first check of the commit, on the in-transaction read
  of the asset's trades — a missing row is 404 «Operazione non trovata.», a different `updatedAt` 409
  «L'operazione è cambiata nel frattempo: riapri e riprova.». **An edit and a delete carry `expectedUpdatedAt`**, the
  version the form or the button was drawn from (PUT body / DELETE query, ISO; absent from an older client = the
  server's own read), so a form left open in another tab on an older version gets the same 409 (owner, 2026-11-12).
  An edit on a changed trade is refused, never merged.
- **The asset's type and the settlement account are checked at commit**: a trade on an asset that left the ledger
  meanwhile is 422 «Questo tipo di asset non usa il registro operazioni.», a settlement account that is no longer
  `cash`/`cash` 422 «Il conto di regolamento selezionato non è valido.» (a missing one is still skipped with a warning).
  The backfill of `averageCostEur` reads trades and asset in one transaction per asset; the delete of every trade of an
  asset is one transaction that also reads the asset doc (it locks it against a trade commit).
- **The asset's currency is read in prepare**: `priceEur` is a network call; a currency change between prepare and
  commit (a few hundred milliseconds) is declared out of scope.
- **Out of scope, declared (2026-11-12)**: Frankfurter's fetch in `lib/server/tradeFxService.ts` has no timeout — with
  the decision inside the transaction it only lengthens a request; the Compravendita executor
  (`realEstateOperationService.ts`, its own single transaction) and the expense writes (`expenseService.ts`) are not
  ledger writes and were not reviewed for this shape — no report and no finding on them.
- A trade document always carries `updatedAt` (every writer stores it): a test fixture that edits or deletes a trade
  sets one, or `toDate(undefined)` reads «now» and the guard answers 409.

## Per-page blind spots

- **A legacy fee has no row and stays in «mercato»** (2026-11-12): a trade saved with a fee before fees became rows keeps
  it as a figure on the trade; Storico's Driver and the Panoramica count it in the market effect (`feeOutsideCashflow`),
  where a fee with its row is in «risparmio». Not a bug: the legacy rule never backfills a past month.
- **A trade's fee row follows the bulk paths like any row** (2026-11-12, declared): a category re-typed from Impostazioni
  rewrites the row's category fields, never deletes it; its note
  («Commissione su acquisto di …») is written once, so a later buy ↔ sell change of the trade leaves it as it was.
- **A restored `null` meta asks the server before a ledger asset is created** (`fetchFreshLedgerMeta`,
  `lib/hooks/useAssetTransactions.ts`, 2026-11-12): the meta query is persisted to IndexedDB, `null` included, so on an
  account migrated from another device the cached `null` would send a new ETF down the non-ledger path. `AssetDialog`
  re-reads it at submit (`staleTime: 0`) and takes the ledger path with the values typed — no toast, no early close;
  the hint «Il registro operazioni si sta inizializzando…» may show until then, and is not a bug. Pinned by
  `__tests__/ledgerMetaFreshness.test.ts` and `e2e/assets.ledger-meta.spec.ts`.
- **A «stale list» only exists in a Movimenti dialog opened BEFORE the other window's delete** (2026-11-13, the
  owner's tour of the concurrency rules above): `AssetMovementsDialog` reads the trades when it opens, so a second window that opens it afterwards
  already shows the list without the row — not a missed 404. To see «Operazione non trovata.», open the dialog in both
  windows first, then delete in one and in the other; the list then refreshes by itself (the hooks invalidate on error).
