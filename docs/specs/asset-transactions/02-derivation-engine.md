# 02 — Derivation Engine (pure, tested)

New module **`lib/utils/assetTransactionUtils.ts`** + tests
**`__tests__/assetTransactionUtils.test.ts`**.

Hard constraints (repo conventions):
- **Zero Firebase imports** — types only (`allocationUtils.ts` precedent: the module must be
  importable by tests without mocking `@/lib/firebase/config`).
- **Time is injected**: any function needing "now" takes `now: Date` explicitly (AGENTS.md *Pure
  Functions and Testability*).
- Fiscal-year bucketing uses `getItalyYear()` from `lib/utils/dateHelpers.ts` (pure, importable).

## 1. Ordering — `sortTransactionsForReplay`

```ts
export function sortTransactionsForReplay(transactions: AssetTransaction[]): AssetTransaction[]
```

Sort ascending by:
1. `date`
2. same date → type rank: baseline first, then `buy` (0), `sell` (1), `adjustment` (2)
   (a same-day buy+sell must apply the buy first or a valid sequence would be rejected)
3. same date+type → `createdAt`
4. final tie-break → `id` (guarantees full determinism)

Every other function in this module assumes replay order and must call this internally (or
document that it requires pre-sorted input — pick ONE approach and keep it consistent; recommended:
sort internally, inputs are small).

## 2. Position replay — `replayTransactions`

```ts
export interface LedgerPositionState {
  quantity: number;
  averageCost: number | undefined;      // native PMC; undefined only before any transaction
  costBasisEur: number;                 // EUR cost of the OPEN position, buy fees included
  averageCostEur: number | undefined;   // costBasisEur / quantity; undefined when quantity === 0
  realizedPnlEur: number;               // cumulative since baseline
  realizedByYear: Record<number, number>; // fiscal year (getItalyYear of sell date) → EUR
  investedEur: number;                  // Σ buy (quantity·priceEur + fees), baseline included
  divestedEur: number;                  // Σ sell (quantity·priceEur − fees)
  holdingStartDate: Date | undefined;   // see rule (d) — undefined means "do not overwrite"
}

export class LedgerValidationError extends Error {
  code: 'SELL_EXCEEDS_HOLDING' | 'NEGATIVE_INPUT' | 'BASELINE_NOT_FIRST';
  /** Italian, user-displayable — the API route forwards it verbatim in the 422 body. */
  userMessage: string;
  transactionId?: string;
}

export function replayTransactions(transactions: AssetTransaction[]): LedgerPositionState
```

Fold rules over the sorted sequence (state starts at
`{ quantity: 0, averageCost: undefined, costBasisEur: 0, realizedPnlEur: 0, ... }`):

**(a) buy** (baseline included):
```
newQuantity   = quantity + t.quantity
averageCost   = (quantity·averageCost + t.quantity·t.pricePerUnit) / newQuantity   // native, NO fees
costBasisEur += t.quantity·t.priceEur + (t.fees ?? 0)
investedEur  += t.quantity·t.priceEur + (t.fees ?? 0)
```
(`quantity·averageCost` term is 0 when previous quantity is 0 — treat `averageCost: undefined`
as 0 in that product.)

**(b) sell**:
```
if t.quantity > quantity (strict, with EPSILON = 1e-9 tolerance for float dust)
    → throw LedgerValidationError('SELL_EXCEEDS_HOLDING',
        userMessage: "La vendita supera la quantità posseduta a quella data.")
proceeds        = t.quantity·t.priceEur − (t.fees ?? 0)
realized        = proceeds − t.quantity·averageCostEur
realizedPnlEur += realized
realizedByYear[getItalyYear(t.date)] += realized
costBasisEur   −= t.quantity·averageCostEur
divestedEur    += proceeds
quantity       −= t.quantity
// averageCost (native) UNCHANGED — selling never moves the PMC (regime amministrato).
// When quantity reaches 0: clamp quantity and costBasisEur to exactly 0 (float dust),
// KEEP the last native averageCost value (harmless at qty 0; every consumer filters qty > 0).
```

**(c) adjustment** (absolute reset):
```
quantity     = t.quantity
averageCost  = t.pricePerUnit
costBasisEur = t.quantity·t.priceEur
// realizedPnlEur, investedEur, divestedEur untouched. No cash. No fees.
```

**(d) holdingStartDate** — set to `t.date` whenever the transaction moves quantity from
`<= 0` to `> 0` **and `t.isBaseline !== true`**. If no such transition occurs in the whole
sequence, return `undefined`.

> **WHY the baseline exemption (critical, do not "simplify" it away):** the baseline freezes a
> position whose real holding started long before migration day. `computeDividendYieldMetrics`
> (`lib/utils/yieldOnCost.ts`) and the total-return calc in `app/api/dividends/stats/route.ts`
> drop every dividend paid before `Asset.holdingStartDate`. Stamping the migration date there
> would silently zero out YOC for the entire existing portfolio. Consequence for the write path
> (spec 03): `holdingStartDate: undefined` in the replay result means **leave the asset doc's
> existing value untouched** — never `deleteField()` it.

Input sanity (throw `NEGATIVE_INPUT` with Italian `userMessage`): negative
quantity/price/fees anywhere; `BASELINE_NOT_FIRST` if a transaction dated before the baseline
transaction exists in the sequence (defense in depth — the route also enforces
`date >= meta.baselineDate`).

## 3. Asset-doc projection — `buildDerivedAssetFields`

```ts
export function buildDerivedAssetFields(state: LedgerPositionState): {
  quantity: number;
  averageCost: number | undefined;
  holdingStartDate: Date | undefined;   // undefined = do not write (see §2d)
}
```

Small adapter so the write path (spec 03) has a single, tested source for what gets written back
to `assets/{assetId}`. `averageCost: undefined` can only happen for an empty sequence — the route
never writes in that case (deleting the last transaction of an asset that has a baseline is
impossible because baselines are undeletable; an asset opened post-migration whose only trade is
deleted keeps quantity 0 and its pre-existing field values).

## 4. Cash settlement delta — `computeCashDelta`

```ts
/** Signed EUR delta to apply to the linked cash asset's balance for one transaction. */
export function computeCashDelta(t: AssetTransaction): number
// buy  → −(quantity·priceEur + fees)
// sell → +(quantity·priceEur − fees)
// adjustment or missing linkedCashAssetId → 0
```

Kept pure so edit/delete flows can compute `reversal = −computeCashDelta(old)` and
`application = computeCashDelta(new)` and aggregate per cash-asset docId (the
`updateCashAssetBalancesAtomic` aggregation rule — an edit that keeps the same cash account must
net into ONE delta for that doc).

## 5. XIRR — `computeAssetXirr`

```ts
export interface XirrFlow { date: Date; amountEur: number }

export function buildXirrFlows(input: {
  transactions: AssetTransaction[];      // the asset's full ledger
  dividendsNetEur: { date: Date; amountEur: number }[]; // already scoped by caller, see below
  currentValueEur: number;               // live calculateAssetValue(asset) result
  now: Date;
}): XirrFlow[]

export function computeAssetXirr(flows: XirrFlow[]): number | null
```

Flow construction (`buildXirrFlows`):
- each buy → `−(quantity·priceEur + fees)` at `t.date` (baseline included — it is the opening
  investment at `baselineDate`);
- each sell → `+(quantity·priceEur − fees)` at `t.date`;
- adjustments → **no flow** (splits are value-neutral; a quantity-correcting adjustment therefore
  slightly distorts XIRR — accepted v1 limitation, document it in a Why-comment);
- each dividend → `+amountEur` at its payment date. **The caller scopes dividends** to
  `paymentDate >= first ledger transaction date` AND `>= holdingStartDate` when present (mirrors
  the existing scoping in `dividends/stats`); pass net EUR (`netAmountEur ?? netAmount` fallback,
  same as the stats route);
- terminal flow `+currentValueEur` at `now` **only if current quantity > 0** (a closed position's
  last real flow is its final sell).

Solver (`computeAssetXirr`):
- `NPV(r) = Σ amount_i / (1 + r)^(days_i / 365)` with `days_i` = actual days from the first flow.
- Newton–Raphson from `r₀ = 0.1`, max 100 iterations, tolerance `1e-7`; on non-convergence or
  derivative ≈ 0, fall back to bisection on `[−0.9999, 10]`.
- Return `null` when: fewer than 2 flows, all flows same sign, no sign change of NPV on the
  bisection bracket, or total elapsed time < 1 day. UI renders `null` as "–" (never 0).
- Result is the ANNUALIZED rate as a fraction (multiply by 100 for display) — state this in the
  function comment to prevent the ×100 drift bugs the repo has seen with TWR.

There is an existing portfolio-level `calculateIRR` (Newton-Raphson, monthly buckets) in
`performanceService.ts` — do NOT reuse/modify it: it is monthly-bucketed and snapshot-based.
This XIRR is date-exact. Keep both; they answer different questions.

## 6. Per-asset total return — `computeAssetTotalReturn`

```ts
export interface AssetTotalReturn {
  investedEur: number;          // state.investedEur (denominator)
  realizedPnlEur: number;
  unrealizedPnlEur: number;     // currentValueEur − state.costBasisEur (0 when closed)
  dividendsNetEur: number;      // same scoped set used for XIRR
  totalReturnEur: number;       // realized + unrealized + dividends
  totalReturnPct: number | null; // totalReturnEur / investedEur; null when investedEur === 0
  isClosed: boolean;            // state.quantity === 0 && ledger non-empty
}

export function computeAssetTotalReturn(
  state: LedgerPositionState,
  currentValueEur: number,
  dividendsNetEur: number
): AssetTotalReturn
```

This is the ledger-based replacement for the static `capitalGain + dividendReturn` in
`totalReturnAssets` — unlike today it includes closed positions and partial sells, and both sides
of the division are EUR (fixes the documented native-vs-EUR mismatch for ledger math; the legacy
`calculateUnrealizedGains` keeps its own behavior, see spec 05).

## 7. Invested capital (Rendimenti) — `computeInvestedCapital`

```ts
/** Net capital invested through the ledger in [start, end] (inclusive), across all assets. */
export function computeInvestedCapital(
  transactions: AssetTransaction[],  // ALL of the user's transactions
  start: Date,
  end: Date
): { investedEur: number; divestedEur: number; netInvestedEur: number }
```

`investedEur` = Σ buy `quantity·priceEur + fees` with `start <= date <= end`;
`divestedEur` = Σ sell proceeds; `netInvestedEur` = difference. Baselines COUNT as buys — for a
period starting before migration day the baseline correctly represents "capital in play". The UI
label must state the definition (spec 04 §6) since it coexists with the expense-inferred
"Contributi".

## 8. Test matrix — `__tests__/assetTransactionUtils.test.ts`

AAA structure, sentence-style names (DEVELOPMENT_GUIDELINES). Use `new Date(y, mIdx, d)`
constructors and `toBeCloseTo` for floats (AGENTS.md *Test Patterns*). Required cases:

**Replay / PMC**
1. single buy → quantity/PMC/costBasisEur match inputs (fees in EUR basis, not native PMC)
2. two buys at different prices → weighted-average PMC, exact expected value
3. partial sell → PMC unchanged, quantity reduced, realized = qty·(sellEur − avgEur) − fees
4. full sell → quantity exactly 0, costBasisEur exactly 0 (no float dust), averageCost retained
5. sell exceeding held quantity → throws `SELL_EXCEEDS_HOLDING` (and 1e-9 dust does NOT throw)
6. sell-then-rebuy → holdingStartDate = rebuy date; PMC restarts from rebuy price
7. baseline-only replay → reproduces migrated state; holdingStartDate `undefined` (invariant #4)
8. adjustment split (qty ×2, PMC ÷2) → value unchanged, no realized P&L
9. adjustment to quantity 0 → position closed without realized P&L
10. same-day buy+sell of a new asset → buy applies first (ordering rule), sequence valid
11. ordering determinism: shuffled input replays to the identical state (tie-breaks 1-4)
12. realizedByYear: two sells in different Italy-years bucket separately (use dates near
    New Year midnight to pin `getItalyYear` vs UTC divergence)
13. mid-history edit simulation: replace a middle buy with a smaller one so a later sell
    over-sells → throws (this is the route's pre-write validation path)

**Cash delta**
14. buy/sell/adjustment deltas incl. fees signs; missing linkedCashAssetId → 0

**XIRR**
15. single buy 100 → terminal 110 exactly 365 days later → ≈ 0.10
16. buy + dividend + terminal → higher than without dividend
17. closed position (buy → full sell, no terminal flow) → rate from the two real flows
18. all-negative flows → null; < 2 flows → null; same-day open+close → null
19. Newton non-convergence case falls back to bisection (construct a nasty multi-sign sequence)

**Total return / invested capital**
20. open position: realized + unrealized + dividends sum; pct vs investedEur
21. closed position: unrealized 0, isClosed true, pct still computed
22. investedEur 0 (empty ledger) → pct null
23. computeInvestedCapital window edges inclusive; baseline counted; sells net out

---

## 9. Implementation prompt — FASE A

> **Modello consigliato: Opus 4.8, effort massimo (xhigh).** È la fase a più alta densità di
> correttezza matematica (PMC, replay, XIRR): un errore qui si propaga a ogni metrica. Non usare
> un modello minore per questa fase.

Prompt da incollare in una nuova sessione:

```text
Implementa la FASE A della feature "Registro operazioni asset" di questo repo.

Contesto obbligatorio — leggi TUTTO prima di scrivere codice:
- docs/specs/asset-transactions/README.md (decisioni fissate, invarianti di sistema, istruzioni vincolanti)
- docs/specs/asset-transactions/01-data-model-and-rules.md — §1 (tipi) e §7 (commenti puntatore)
- docs/specs/asset-transactions/02-derivation-engine.md — INTEGRALE, è la spec di questa fase
- AGENTS.md, CLAUDE.md; COMMENTS.md e DEVELOPMENT_GUIDELINES.md vanno APPLICATI mentre scrivi.

Scope ESATTO (niente altro, niente scope creep):
1. types/assetTransactions.ts come da spec 01 §1, con il checklist-comment su AssetTransactionType.
2. Commenti puntatore su Asset.quantity/Asset.averageCost in types/assets.ts (spec 01 §7) — SOLO commenti.
3. lib/utils/assetTransactionUtils.ts: sortTransactionsForReplay, replayTransactions,
   buildDerivedAssetFields, computeCashDelta, buildXirrFlows, computeAssetXirr,
   computeAssetTotalReturn, computeInvestedCapital — formule, tie-break di ordinamento, gestione
   errori (LedgerValidationError con userMessage in italiano) ESATTAMENTE come da spec 02.
   Zero import Firebase (deve essere testabile senza mock di @/lib/firebase/config).
4. __tests__/assetTransactionUtils.test.ts con TUTTI i 23 casi della matrice in spec 02 §8.

Invarianti non negoziabili (README §invarianti): in particolare la #4 — la baseline NON produce
mai holdingStartDate (esenzione in §2d di questa spec); il PMC nativo resta media ponderata dei
prezzi nativi senza fee (#2).

Gate di uscita: npx tsc --noEmit pulito + npx vitest run __tests__/assetTransactionUtils.test.ts verde.

A fine lavoro: FERMATI. Aggiorna SESSION_NOTES.md (voce Cosa/Perché/Nota), riepiloga cosa hai
costruito e dimmi esplicitamente COSA e COME testare riguardo a quanto fatto durante questa
sessione, poi ATTENDI la conferma esplicita dell'utente prima di qualsiasi commit.
Branch: feature/asset-transactions-fase-a; l'eventuale PR punta a develop, mai a main.
```
