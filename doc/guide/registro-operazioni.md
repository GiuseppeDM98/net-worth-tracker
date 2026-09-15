# Registro operazioni (Asset Trade Ledger)

> **Quando aprire questa guida** — chi tocca `lib/utils/assetTransactionUtils.ts`, `lib/server/{assetTransactionUseCase,tradeFxService}.ts`, `app/api/asset-transactions/*`, `components/assets/{TransactionDialog,AssetMovementsDialog}.tsx`. Esercizio: `__tests__/assetTransactionWriteTx.test.ts`. In `AGENTS.md` resta lo stub con l'essenziale; qui c'è la regola completa. File: `CLAUDE.md` → *Key Files* → *Asset trade ledger*.

## Asset Trade Ledger

- Three trade types per asset — BUY / SELL / ADJUSTMENT — with an optional cash settlement that debits or credits a
  cash account atomically, so a settled trade is net-worth-neutral. `TransactionDialog` writes, `AssetMovementsDialog`
  reads (P&L, return, XIRR, per-sell realized % at the PMC of the trade). Feeds Rendimenti (invested capital, realized
  gains) and Dividendi (holding start).
### Engine (`lib/utils/assetTransactionUtils.ts`, pure and Firebase-free)
- ALL trade money-math lives here (replay, PMC, realized P&L, XIRR, total return, invested capital); the service/route
  layer is a thin atomic writer. A new `AssetTransactionType` must update the replay switch, the zod schema AND
  `TransactionDialog`. **Native PMC excludes fees**, which live only on the EUR side, and a sell never moves it.
  **The EUR side is the one the app measures against** (2026-09-07): `buildDerivedAssetFields` projects
  `averageCostEur` (= `costBasisEur / quantity`, fees included) onto the asset doc beside `quantity` and the native
  `averageCost`, and `lib/utils/costBasisEur.ts` is the ONE reader of the pair — doc/guide/patrimonio.md § Asset
  Pricing. `backfillAverageCostEur` (use case + route + the Patrimonio page's one-shot trigger) projects the field onto
  the docs written before it existed; it writes ONLY that field, and a ledger the replay rejects is counted in
  `skippedAssetCount`, never fatal.
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

### Service, API, migration (`lib/server/assetTransactionUseCase.ts`)
- **Writes are Admin-API-only**: a trade atomically rewrites the asset's derived fields from a full replay, and only the
  Admin SDK can `tx.get(query)` in a transaction. Reads stay client-SDK; auth = `assertCanAccessAccount`.
- All reads before any writes; `resolveTradePriceEur` (network) resolves BEFORE the transaction; derived fields written
  DIRECTLY in-tx, not via `updateAsset`.
- **Migration is idempotent**: meta doc present → done; else one baseline BUY per eligible asset, batched ≤400, **meta
  doc written LAST**. Mutation hooks invalidate a TRIPLE: `assetTransactions.all` + `assets.all` + `dashboard.overview`.
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
