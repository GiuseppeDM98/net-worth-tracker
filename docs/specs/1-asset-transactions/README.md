# Asset Transactions (Trade Ledger) — Specification Index

> Status: **SPEC — approved design, not yet implemented** (written 2026-07-16).
> Deliverable of the implementation: explicit BUY/SELL/ADJUSTMENT tracking for assets, so that
> return calculations become correct by construction instead of inferred from snapshots.

## Why this feature exists

Today the user overwrites `Asset.quantity` and `Asset.averageCost` (PMC) by hand in `AssetDialog`.
There is no record of trades anywhere. Verified consequences in the current code:

- Per-asset return (`totalReturnAssets` in `app/api/dividends/stats/route.ts`) is a static
  price-vs-PMC figure that **excludes sold positions** — the code comment literally says
  *"we don't track the actual realized sell price"*.
- "Contributi" on Rendimenti is `income − expenses` inferred from the expense tracker
  (`getCashFlowsFromExpenses` in `performanceService.ts`), **not** money actually invested.
- `deriveHoldingStartDates` and `attributeSelectedChange` (`lib/utils/snapshotAssetBreakdown.ts`)
  reconstruct buys/sells *heuristically* from monthly snapshots, at monthly granularity.
- There is no realized P&L and no per-asset money-weighted return at all.

## Fixed product decisions (agreed with the user — do NOT relitigate)

1. **Optional cash settlement**: a trade has an optional `linkedCashAssetId`; when set, the cash
   asset balance is updated atomically in the same Firestore transaction. No expense/income record
   is ever created: trades are net-worth-neutral and invisible to every cashflow metric.
2. **Ledger is the source of truth** for tradable types (`stock | etf | bond | crypto | commodity`):
   `quantity` and `averageCost` become derived fields, read-only in AssetDialog. A transaction type
   `adjustment` ("Rettifica") handles corrections and splits. `cash` and `realestate` keep direct
   editing and never get a ledger.
3. **v1 computes all four metrics**: realized P&L (weighted-average-cost / PMC method, per asset and
   per fiscal year, including closed positions); per-asset total return including sold positions
   (realized + unrealized + dividends); per-asset XIRR from real trade dates/amounts; "Capitale
   investito" (real invested capital) on Rendimenti next to the existing "Contributi".
4. **Migration**: every tradable asset with `quantity > 0` becomes one baseline BUY transaction
   (current quantity + current PMC, date = migration day). Backdated trades are allowed only with
   `date >= baselineDate`. Trade-based returns therefore start at the migration date.
5. **Portfolio TWR does not change.** Buys/sells are net-worth-neutral (cash ↔ asset), so the
   snapshot-linking TWR, the monthly cash-flow derivation from expenses, snapshots, and the cron are
   all untouched.

## Glossary

| Term | Meaning |
| --- | --- |
| **PMC** | Prezzo Medio di Carico — weighted-average cost per unit, in the asset's NATIVE currency (same convention as today's `Asset.averageCost`). Italian *regime amministrato* convention. |
| **Baseline** | The migration-created opening BUY (`isBaseline: true`) freezing the position held at migration time. The starting point of all ledger math. |
| **Rettifica** | `adjustment` transaction: an absolute reset of quantity + PMC from its date onward. For splits, corrections, contribution-style assets. No realized P&L, no cash movement. |
| **Replay** | Deterministic recomputation of the position state (quantity, PMC, cost basis, realized P&L, holding start) by folding all of an asset's transactions in date order. |

## Spec files (read in order)

| File | Contents |
| --- | --- |
| [`01-data-model-and-rules.md`](01-data-model-and-rules.md) | `AssetTransaction` type, `assetTransactions` + `assetTransactionsMeta` collections, Firestore rules, zod schemas, currency/FX handling. |
| [`02-derivation-engine.md`](02-derivation-engine.md) | Pure engine in `lib/utils/assetTransactionUtils.ts`: replay algorithm, PMC math, realized P&L, XIRR, invested capital. Exact formulas, signatures, edge cases, full test matrix. |
| [`03-service-and-api.md`](03-service-and-api.md) | Admin API routes (CRUD + migrate), Firestore transaction algorithm, migration, client service + React Query hooks, invalidations, the `updateAssetMetadata` split. |
| [`04-ui.md`](04-ui.md) | `TransactionDialog`, per-asset movement history, AssetDialog changes (read-only qty/PMC, create-as-first-buy), Rendimenti surfaces, Italian copy, demo/shared-account behavior. |
| [`05-impacts-testing-rollout.md`](05-impacts-testing-rollout.md) | Downstream impact table, regression checklist, rollout order, docs to update at the end. |

## System invariants (every phase must preserve these)

1. **The asset doc stays authoritative for consumers.** After every ledger mutation the replay
   result is written back to `assets/{assetId}` (`quantity`, `averageCost`, conditionally
   `holdingStartDate`). Overview, YOC, PDF, stamp duty, exposure, allocation, snapshots keep reading
   the asset doc and MUST keep working with zero changes.
2. **Native PMC stays pure.** `averageCost` remains the weighted average of native-currency trade
   prices, fees excluded — exactly today's semantics. Fees and FX enter only the EUR-side metrics.
3. **No negative position, ever.** A transaction sequence is valid only if quantity ≥ 0 at every
   point — including after editing/deleting a mid-history trade (full re-validation on replay).
4. **Migration must NOT touch `holdingStartDate`.** The baseline freezes a position whose true
   holding start predates the ledger. Overwriting `holdingStartDate` with the migration date would
   make YOC/Current-Yield/Total-Return drop every dividend received before migration day
   (see `computeDividendYieldMetrics` scoping in `lib/utils/yieldOnCost.ts`). The replay writes
   `holdingStartDate` only for 0→>0 transitions at NON-baseline transactions.
5. **Trades are invisible to cashflow metrics.** No expense/income docs; the optional cash
   settlement only moves a cash asset's `quantity` (balance), like transfers do.
6. **Everything money-math is pure and tested.** All replay/metric logic lives in
   `lib/utils/assetTransactionUtils.ts` with zero Firebase imports (the `allocationUtils.ts`
   precedent), exercised by `__tests__/assetTransactionUtils.test.ts`.

## Implementation phasing (one phase per session; each independently shippable)

| Phase | Scope | Gate |
| --- | --- | --- |
| **A** | `types/assetTransactions.ts` + pure engine + tests (spec 01 types + spec 02) | `npx tsc --noEmit` + `npx vitest run __tests__/assetTransactionUtils.test.ts` |
| **B** | Firestore rules + Admin API routes + migration + client service + hooks (spec 01 rules + spec 03) | tsc + `assetTransactionsRoutes` + real-transaction test + rules deploy note |
| **C** | UI: TransactionDialog, movements history, AssetDialog changes, migration trigger (spec 04) | tsc + manual test script in spec 05 |
| **D** | Metric surfaces: dividends/stats extension, Rendimenti invested capital + realized P&L (spec 04 §5-6) + docs update (spec 05) | tsc + targeted suites + manual test |

**Recommended model**: **Opus 4.8** for phases A and B (correctness-critical engine, atomic write
paths, migration). Sonnet 5 is acceptable for C and D under this spec. If a single model runs
everything, use Opus 4.8, one phase per session.

## Binding instructions for the implementing model

- **Read before writing any code**: `AGENTS.md` (conventions/gotchas), `CLAUDE.md` (current status),
  `COMMENTS.md` (comment style — apply it), `DEVELOPMENT_GUIDELINES.md` (code structure — apply it),
  and `DESIGN.md` for any UI work.
- **At the end of every phase: STOP.** Run `npx tsc --noEmit` and the phase's test suite, then
  summarize what was built and how the user should manually test it, and **wait for the user's
  confirmation before any commit or merge**. This is a standing workflow rule of this repository's
  owner — do not commit proactively.
- PRs target `develop`, not `main`. Conventional commits. Create/maintain `SESSION_NOTES.md`
  (Cosa/Perché/Nota) during the work; the documentation ritual (CLAUDE/AGENTS/README/Draft Release
  Temp update + SESSION_NOTES removal) happens pre-merge on the branch.
- Repo-specific traps that WILL bite here (details in the spec files): the Edit tool introducing
  curly apostrophes in Italian TSX strings (TS1127); `removeUndefinedDeep` before every Firestore
  write; `updateAsset` translating an absent `averageCost` into `deleteField()`; Radix Select
  sentinel values (`__none__`); `useWatch()`/`getValues()` never `watch()`; Italy timezone helpers
  (`getItalyYear`, `getItalyDayBoundsUtc`) for any date bucketing; dual React Query invalidation
  (`assets.all` AND `dashboard.overview`) after every asset-affecting mutation; Firestore
  transactions require ALL reads before ANY writes with per-docId delta aggregation.
- No scope creep: v1 is exactly what these specs describe. Ideas that surface during implementation
  go into `SESSION_NOTES.md` as notes, not into code.

## Ready-to-use implementation prompts

Each phase has a copy-paste prompt at the end of the spec file that drives it (one phase = one
fresh session; run them in order, each on its own branch, PR to `develop`):

| Phase | Prompt location | Model / effort |
| --- | --- | --- |
| **A** — types + pure engine + tests | end of `02-derivation-engine.md` | **Opus 4.8 / xhigh** |
| **B** — rules + Admin API + migration + hooks | end of `03-service-and-api.md` | **Opus 4.8 / xhigh** |
| **C** — UI (dialogs, movements, AssetDialog) | end of `04-ui.md` | **Sonnet 5 / high** (Opus 4.8 if budget allows) |
| **D** — Rendimenti surfaces + stats route + docs ritual | end of `05-impacts-testing-rollout.md` | **Sonnet 5 / high** |

(`01-data-model-and-rules.md` has no standalone prompt — its sections are absorbed by Phases A
and B, see the note at its end.)
