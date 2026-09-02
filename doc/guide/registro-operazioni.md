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
- **The migration baseline (`isBaseline` BUY) NEVER stamps `holdingStartDate`**, and `replayTransactions` returning
  `holdingStartDate: undefined` means **leave the asset doc untouched** — never `deleteField()`, which would zero YOC for
  the whole portfolio.
- **Replay ordering is deterministic and internal** (date → baseline < buy < sell < adjustment → `createdAt` → `id`), and
  this same replay IS the pre-write validation: invalid histories throw `LedgerValidationError` with an Italian
  `userMessage` forwarded verbatim in a 422.
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
- `resolveBondPrice` is exported from `AssetDialog.tsx` and REUSED — a trade's `pricePerUnit` must mean exactly what
  `averageCost` means. **"Capitale investito" uses the page's OWN period bounds** and is deliberately a DIFFERENT number
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
