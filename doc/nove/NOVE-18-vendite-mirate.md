# NOVE-18 — Allocazione › Accumulo: «Con vendite mirate» of PR #488, on the app's one tax rule

> Series `doc/nove/` (README.md § 5): **depends on NOVE-17** (the model's dialog, the optimizer, `roundWeights`) and
> **NOVE-07** (the fiscal cost basis, decision 31); **NOVE-21 is implemented after it**. Written on 2026-11-12; every
> `file:line` is cited on `develop` @ b841cbd7, a PR line as `pr488:file:line` on the local ref `refs/tmp/pr488`
> (head 4f1c044e, child of #487's 9449f6ce). Executes decision 26 and the adopted choices m, n (README.md § 3-4).

## 1. The problem today (evidence on the code)

After NOVE-17 the model's dialog proposes weights in two modes: «Ideale» ignores what is held, «Raggiungibile col
PAC» never sells. Nothing proposes «get closer by selling a little, within a tax I accept». **PR #488** (contributor
Ciocc128; one commit 4f1c044e on top of #487; the increment `git diff refs/tmp/pr487 refs/tmp/pr488` is 8 files,
+1 181 / −100) adds the third mode `'targeted'` («Con vendite mirate», `pr488:lib/utils/weightOptimizer.ts:41`): a
cap in euro on the tax, a «Non vendere» box per row (dialog state, never persisted), the tax per row and a total
line; the optimizer minimizes the same objective subject to Σ tax(sold) ≤ cap (`solveTargetedCore` `:1108`,
`optimizeTargeted` `:1274`).

The app already has ONE estimate of a sale's tax: `estimatePlanSaleTax` (`lib/utils/allocazioneSummary.ts:790-829`)
over `AllocatableHolding` (`lib/utils/allocationUtils.ts:660-698`): no tax on a holding not `taxableOnSale` (an
account, a pension fund); unknown — never zero — without a EUR cost basis or without a `taxRate`; the gain fraction
floored at zero, no loss compensation; the rate through `estimateSaleTax` (`lib/utils/saleTax.ts:26-29`).

Defects of the increment, each cured in § 4:

- **V1 — a second tax rule** (against decision 26): `taxPerEuroSoldOf(asset)` (`pr488:weightOptimizer.ts:179-185`)
  reads the asset, not the holding; defaults a missing rate to `DEFAULT_CAPITAL_GAINS_RATE` (`:183`, imported from
  `withdrawalTax` at `:34`) where the app says «unknown»; ignores `taxableOnSale`, so an account and a pension fund
  would be taxed.
- **V2 — the fallback can exceed the cap**: when the exact search does not converge or ends above the cap, the
  fallback at `:1218-1226` replaces the weights only `if (minTaxEur <= TAX_EPSILON_EUR)`; with limits that force a
  sale (`minTaxEur > 0`) the over-cap weights are returned as they are — against choice m.
- **V3 — rounding ignores the lower bounds**: `optimizeTargeted` rounds with the old `roundToHalfPoints(x, hi)`
  (`:1285`) and `roundTargeted(x, cur, hi)` (`:1000-1030`), which floors a purchase to `max(grid, cur)` and can end
  below a minimum above the held weight.
- **V4 — the fork owner's real portfolio as fixture**: the header of
  `pr488:__tests__/weightOptimizerTargeted.test.ts:1-5` (a real case named with its date, instrument count and
  base), `const B` at `:23` and the `REAL` rows (tickers, values, gains) at `:25-38`; the increment's hunk of
  `__tests__/weightOptimizerNarrative.test.ts` asserts figures taken from the same case (WORKFLOW.md § 1.6: no owner
  data in a tracked file; none of them is quoted here).
- **V5 — the computation runs on every keystroke and every tick of a box**: the dialog's `sale` memo
  (`pr488:components/allocation/IdealCompositionDialog.tsx`, `useMemo(() => (isTargeted ? { taxCapEur, lockedKeys }
  : undefined))`) feeds the result memo — NOVE-17 already moved the run onto «Calcola»; the lock and the cap must
  clear it.
- **V6 — section codes** (§9.3, T4, T6, RP2…) in comments and test names.

## 2. Goal and acceptance criteria

1. The dialog offers three modes «Ideale» · «Con vendite mirate» · «Raggiungibile col PAC»; in the second, the rows
   (name, current weight, «Non vendere») are on screen before «Calcola», with the field «Tasse massime (€)».
   **Proof**: R1, E1.
2. The tax of a sale is computed by ONE function shared with `estimatePlanSaleTax`; `estimatePlanSaleTax`'s results
   are unchanged. **Proof**: U1, U2.
3. A row with no cost basis or no rate is ticked «Non vendere» and cannot be unticked, its reason printed under its
   name (a tooltip is invisible on touch); so is a property, a frozen instrument and an instrument the ledger
   cannot sell (a pension fund); the liquidity is spent at zero tax; a group is priced at its buyer, the only
   member ever sold. **Proof**: U3, R2.
4. On every `ok` result the rounded weights' tax ≤ max(cap, minimum forced tax), the fallback included. **Proof**:
   U4, U5 (the fallback forced with `optimizeWeights(input, { maxIterations: 1 })`).
5. With limits that force a tax above the cap, the forced tax becomes the cap and the total line says so (choice m).
   **Proof**: U6.
6. Every weight respects its lower and upper bound and Σ = 100 within 1e-9; Σ upper < 100 → `infeasible_bounds`
   in this mode too. A HELD candidate keeps its exact current weight, off the grid (rounding must never create a
   sale): NOVE-17's grid rule holds for the candidates that move. **Proof**: U7 (500 seeded random cases), U7b.
7. A position at a loss counts zero tax, and the dialog says that losses are not offset (choice n). **Proof**: U8, R3.
8. «Crea un PAC con questi pesi» in this mode seeds the plan's disposals: a whole position for an instrument left out
   of the model, whole shares for one kept, amounts in cents; never the liquidity nor a property. **Proof**: U9, R5.
9. Every fixture is invented and round: the § 6 grep over the files this spec writes is empty. **Proof**: the § 6
   grep.
10. The optimizer runs only on «Calcola»; the cap and the boxes clear the result. **Proof**: R4.

## 3. Decisions

- **Owner 26 (2026-11-12)**: «Con vendite mirate» stays a mode of the model's dialog, with the app's ONE tax rule
  (`estimatePlanSaleTax`: no rate → «Non vendere», `taxableOnSale`); invented fixtures.
- **Owner 31 (2026-11-12, defined by NOVE-07)**: the tax estimates use a separate fiscal cost basis that includes
  the fees (purchase and sale). Here it means: this spec reads ONLY `AllocatableHolding.costBasisEur`, which NOVE-07
  feeds with `fiscalCostPerUnitEur` at `lib/utils/allocationUtils.ts:735`, purchase fees included; a PROPOSED sale
  has no fee yet, so its estimate deducts none — the sale's fee enters on the sale the owner records. Nothing here
  computes a basis.
- **Owner 57 (2026-11-12)**: spending the liquidity is not a sale: it is out of the sold total and of the taxes,
  its «Tasse» cell reads «—», and the total line says it apart — «…, usi X € di liquidità».
- **Adopted (README § 4)**: m (forced tax = the cap, said), n (losses not counted, said).
- **Adopted, reversible (this spec)**:
  - C1. The increment enters by `git cherry-pick --no-commit 4f1c044e` on a fresh branch after NOVE-17; credit
    `Co-authored-by: Giorgio Trentadue <148712309+Ciocc128@users.noreply.github.com>` (the address in the repo's
    history; the PR's author line is `Claude <noreply@anthropic.com>`).
  - C2. A group of equivalent instruments is priced at its BUYER's holdings (the sleeves of a composite buyer
    included): the other members are held at their value in every mode (`fixedValueEur`,
    `pr488:lib/utils/weightOptimizer.ts:51`, `:209-211`) and the disposal sells the buyer only — a member that is
    never sold neither raises the rate nor locks the group.
  - C3. A missing rate is locked with its own reason «Aliquota non impostata», beside the PR's «Costo fiscale
    sconosciuto».
  - C4. A property (fixed by NOVE-17) shows «Immobile: resta com'è» as its lock reason.
  - C5. An instrument candidate the ledger cannot register (`!isLedgerAssetType(asset.type)`: a pension fund) is
    locked with «Non si vende sul mercato»: exempt, it would be the cheapest «sale», and no plan can sell it.
  - C6. A forced lock's reason is a visible 11px muted caption under the instrument's name (the PR's `title` stays).
  - C7. The targeted total line IS the dialog's reading (The Modal-Is-A-Tile Rule, as NOVE-17 set it); the losses
    note is the body's first line under the table.
- **Overturned**: the PR's default rate for an asset without `taxRate` (`pr488:weightOptimizer.ts:183`).

## 4. Solution

### Bringing the increment in

```
git fetch origin pull/488/head:refs/tmp/pr488      # only if the local ref is gone
git switch develop && git pull && git switch -c feat/vendite-mirate
git cherry-pick --no-commit 4f1c044e
```

`weightOptimizer.ts` conflicts where NOVE-17 changed it (types in `types/optimizer.ts`, `roundWeights`, the
standalone builder): keep develop's code and re-apply the increment's targeted hunks on it; `OptimizerMode` in
`types/optimizer.ts` becomes `'reachable' | 'ideal' | 'targeted'`. The increment's other files enter as written, on
NOVE-17's code: `components/allocation/IdealCompositionDialog.tsx` (V5); `tiles/PortafoglioModelloTile.tsx` renders
`describeModelSalesHint(overweightLabels)` always (it now returns `string`, with `MODEL_TARGETED_HINT` «Per
avvicinarti al modello vendendo poco, «Ricalcola» ha la modalità «Con vendite mirate», con un tetto di tasse.»),
below NOVE-17's «superato» sentence when the model is stale; `lib/utils/weightOptimizerNarrative.ts`;
`__tests__/weightOptimizerNarrative.test.ts` and `__tests__/weightOptimizerTargeted.test.ts` (V4);
`__tests__/accumuloA4.test.ts`'s hunk lands in `__tests__/accumuloTileSentences.test.ts`; `doc/guide/ottimizzatore.md`.
Then the changes; one commit, trailer of C1.

### V1 — the one tax rule (`lib/utils/saleTax.ts`, `lib/utils/allocazioneSummary.ts`)

In `saleTax.ts` (type-only import of `AllocatableHolding`):

```ts
/** What one euro sold of a holding costs in tax today. */
export type SaleTaxPerEuro =
  | { kind: 'exempt' }
  | { kind: 'taxed'; perEuro: number }
  | { kind: 'unknown'; reason: 'cost-basis' | 'rate' };

/**
 * The rule of every PROPOSED sale's estimate (estimatePlanSaleTax, the targeted optimizer), on estimateSaleTax: not
 * taxable → exempt; no EUR basis or no rate → unknown, never zero; the gain fraction floored at zero — a loss pays
 * nothing and offsets nothing; no sale fee (a proposed sale has none yet).
 */
export function saleTaxPerEuro(holding: AllocatableHolding): SaleTaxPerEuro {
  if (!holding.taxableOnSale || holding.value <= 0) return { kind: 'exempt' };
  if (holding.costBasisEur === undefined) return { kind: 'unknown', reason: 'cost-basis' };
  if (holding.taxRate === undefined) return { kind: 'unknown', reason: 'rate' };
  const gainFraction = Math.max(0, (holding.value - holding.costBasisEur) / holding.value);
  return { kind: 'taxed', perEuro: estimateSaleTax(gainFraction, holding.taxRate) ?? 0 };
}

/**
 * A candidate's rate: its BUYER's — the only member a plan sells; a composite buyer's sleeves give the most taxed,
 * unknown if any is (2026-11-12).
 */
export function candidateSaleTaxPerEuro(
  buyAssetId: string,
  holdings: readonly AllocatableHolding[],
): SaleTaxPerEuro {
  let worst: SaleTaxPerEuro = { kind: 'exempt' };
  for (const holding of holdings) {
    if ((holding.assetId ?? holding.id) !== buyAssetId) continue;
    const own = saleTaxPerEuro(holding);
    if (own.kind === 'unknown') return own;
    if (own.kind === 'taxed' && (worst.kind === 'exempt' || own.perEuro > worst.perEuro)) worst = own;
  }
  return worst;
}
```

`estimatePlanSaleTax`'s loop body (`allocazioneSummary.ts:799-820`), after the `!holding` branch:

```ts
    const perEuro = saleTaxPerEuro(holding);
    if (perEuro.kind === 'unknown') {
      unknownReason ??= perEuro.reason;
      continue;
    }
    if (perEuro.kind === 'taxed') tax += leaf.amount * perEuro.perEuro;
```

The doc comment's «fees excluded» (`:780`) is NOVE-07's sentence to fix; this spec does not touch it. A composite's
sleeves carry the asset's gain fraction (`allocationUtils.ts:750-752`), so the buyer's sleeves share one rate.

In `weightOptimizer.ts`: `taxPerEuroSoldOf` and the `DEFAULT_CAPITAL_GAINS_RATE` import go. `runOptimizer`'s input and
`buildOptimizerCandidates`' input (`pr488:weightOptimizer.ts:220-227`) gain `holdings?: readonly
AllocatableHolding[]`, and `runOptimizer` forwards `holdings: input.holdings` (`:1342-1349` passes its fields one by
one); `evaluateObjectivesAt` and the PAC's `OptimizerPanel` pass none (their candidates read `taxPerEuroSold:
undefined`). `buildOptimizerCandidates` sets

```ts
      taxPerEuroSold: input.holdings
        ? toRate(candidateSaleTaxPerEuro(position.buyAssetId, input.holdings))
        : undefined,
```

with `const toRate = (t: SaleTaxPerEuro) => (t.kind === 'exempt' ? 0 : t.kind === 'taxed' ? t.perEuro : null);`.
The dialog builds `const holdings = buildHoldings(allAssets, calculateAssetValue)` once per open and passes it.
`forcedLockReason` (the PR's, in the dialog) becomes:

```ts
function forcedLockReason(position: { key: string; buyAssetId: string }, asset: Asset | undefined,
  holdings: readonly AllocatableHolding[]): string | null {
  if (!asset || position.key === LIQUIDITY_CANDIDATE_KEY) return null; // the liquidity is spent, never locked
  if (asset.type === 'realestate') return IDEAL_COMPOSITION_LOCK_PROPERTY;
  if (resolveAllocationRole(asset) === 'frozen') return IDEAL_COMPOSITION_LOCK_FROZEN;
  if (!isLedgerAssetType(asset.type)) return IDEAL_COMPOSITION_LOCK_NOT_TRADED;
  const tax = candidateSaleTaxPerEuro(position.buyAssetId, holdings);
  if (tax.kind !== 'unknown') return null;
  return tax.reason === 'rate' ? IDEAL_COMPOSITION_LOCK_UNKNOWN_RATE : IDEAL_COMPOSITION_LOCK_UNKNOWN_BASIS;
}
```

`weightOptimizerNarrative.ts`: `IDEAL_COMPOSITION_LOCK_UNKNOWN_RATE = 'Aliquota non impostata'`,
`IDEAL_COMPOSITION_LOCK_PROPERTY = 'Immobile: resta com’è'`, `IDEAL_COMPOSITION_LOCK_NOT_TRADED = 'Non si vende sul
mercato'`, and `IDEAL_COMPOSITION_LOSSES_NOTE` = «Le stime non compensano le minusvalenze: una vendita in perdita
conta zero tasse, non un credito.», the body's first line under the table whenever the targeted mode has a result.

### V2 — the fallback never exceeds the cap (`weightOptimizer.ts`)

`minimumTaxEur` (`:839-855`) splits into the point and its tax:

```ts
/** The least-tax point of the box: the held weights clamped, the excess sold cheapest-first (a continuous knapsack). */
function minimumTaxPoint(cur: number[], lo: number[], hi: number[], rate: number[]): number[] {
  const w = cur.map((c, i) => Math.min(Math.max(c, lo[i]), hi[i]));
  let excess = w.reduce((sum, v) => sum + v, 0) - 1;
  const order = cur.map((_, i) => i).sort((a, b) => rate[a] - rate[b] || a - b);
  for (const i of order) {
    if (excess <= 0) break;
    const take = Math.min(excess, w[i] - lo[i]);
    if (take <= 0) continue;
    w[i] -= take;
    excess -= take;
  }
  return w;
}

function minimumTaxEur(cur: number[], lo: number[], hi: number[], rate: number[], baseEur: number): number {
  const w = minimumTaxPoint(cur, lo, hi, rate);
  return cur.reduce((sum, c, i) => sum + rate[i] * Math.max(0, c - w[i]), 0) * baseEur;
}
```

The fallback at `:1218-1226` becomes:

```ts
    if (!converged || taxOf(x) > capEur + TAX_EPSILON_EUR) {
      // No taxed candidate goes below the least-tax point: the tax is at most minTaxEur ≤ capEur.
      converged = false;
      const floor = minimumTaxPoint(cur, lo, hiInit, rate);
      const loForced = lo.map((l, i) => (rate[i] > 0 ? Math.max(l, floor[i]) : l));
      const forced = applyMinWeightHeuristic(rows, n, wRef, loForced, hiInit, solverOptions);
      x = forced.result.x;
      hi = forced.hi;
      loUsed = loForced;
    }
```

`solveTargetedCore`'s check (`:1114-1115`) becomes `const sumUpperPct = candidates.reduce((sum, c) => sum +
c.upperPct, 0); if (sumLowerPct > 100 + 1e-9 || sumUpperPct < 100 - 1e-9) return null;` — `optimizeWeights` hands
the targeted mode over (`:729`) BEFORE NOVE-17's check runs, so the check is repeated here; `optimizeTargeted`
already turns `null` into `infeasible_bounds`.

The fallback is feasible: `floor` lies in the box and sums to at most 1, so Σ `loForced` ≤ 1, and the check above
holds Σ `hiInit` ≥ 1. With nothing forced (`minTaxEur` = 0) `floor` equals the held weight of every taxed candidate,
which is the PR's `untaxedPipeline`: the `if (minTaxEur <= TAX_EPSILON_EUR)` branch goes, and Path 2 (cap 0,
`:1158-1166`) builds its lower bounds the same way — `const floor = minimumTaxPoint(cur, lo, hiInit, rate); const
loForced = lo.map((l, i) => (rate[i] > 0 ? Math.max(l, floor[i]) : l));` — so `untaxedPipeline` has no caller left
and goes.

`solveWith` (`:1166-1167`) forwards the test cap, `solveAtMultiplier(rows, wRef, cur, rateEurPerUnit, lo, hiBox, mu,
start, solverOptions?.maxIterations)` — the PR omits the ninth argument, so a capped run never reaches the
fallback and U5 could not force it.

### V3 — rounding with the lower bounds

`plainRounded = roundWeights(x, loUsed, hi)` (NOVE-17) at `:1285`; `roundTargeted(x, cur, loUsed, hi)` takes the
lower bounds, with `lp = lo.map((v) => v * 100)`, and FIVE steps take the bounds: the purchase branch `r[i] =
Math.min(Math.max(floorGrid(xp[i]), cp[i], lp[i]), hp[i]);`; the sale branch (`:1018`) `r[i] =
Math.min(ceilGrid(xp[i]), cp[i], hp[i]);`; the «sell less» step (`:1046`) `const take = Math.min(gap, cp[i] - r[i],
hp[i] - r[i]);`; the purchases' step down (`:1063`) `const take = Math.min(r[i] - Math.max(cp[i], lp[i],
prevGrid(r[i])), -gap);`; a held row `r[i] = Math.min(Math.max(cp[i], lp[i]), hp[i]);`. Each still only shrinks a
sale, so tax(rounded) ≤ tax(raw); the `plainOk` test adds `plainRounded.every((p, i) => p >= loUsed[i] * 100 -
1e-9)`.

### V5 — the dialog (on NOVE-17's `IdealCompositionDialog`)

The increment's targeted UI enters as written (rows before «Calcola», `TARGETED_DIFF_CLASS` hiding the € difference
below `desktop:`, the 44px rows, the «Tasse» column, `describeTargetedSaleTotal`), with: `setTaxCapInput` and
`toggleLock` also calling `setRun(null)`; the `sale` input built in «Calcola»'s handler, not in a memo; the cap field
`IDEAL_COMPOSITION_TAX_CAP_LABEL` («Tasse massime (€)») parsed with `Math.max(0, Number(…) || 0)` as the PR does.

- **The rows' current weight reads the builder**, never `calculateAssetValue`
  (`pr488:components/allocation/IdealCompositionDialog.tsx:280-284`: the stand-in is worth 1 €, a property would be
  gross, a group only its buyer): `currentPct: standalone.baseEur > 0 ? (p.memberAssetIds.reduce((sum, id) => { const
  a = standalone.assetsById.get(id); return a ? sum + standalone.valueOf(a) : sum; }, 0) / standalone.baseEur) * 100 :
  0` — the value `runOptimizer` gives the candidate.
- **The total line is the reading** (C7): `describeIdealCompositionStatus(run, negativeFixedLabels, liquidityEur)` (NOVE-17; the reading still ends
  with `NEGATIVE_LIQUIDITY_NOTE` when `liquidityEur < 0`) returns
  `describeTargetedSaleTotal(run.sale)`, tone `neutral`, when `run.status === 'ok' && run.sale`; the PR's body `<p>`
  (`:464`) goes; `IDEAL_COMPOSITION_LOSSES_NOTE` is the first line under the table.
- **The liquidity is spent, not sold** (decision 57). In `weightOptimizer.ts`'s sale report
  (`pr488:…:1296-1312`) the liquidity's row is `{ key: LIQUIDITY_CANDIDATE_KEY, soldEur: 0, taxEur: 0 }` and
  `OptimizerSaleReport` gains `liquiditySpentEur: number` — «the euros the liquidity goes down by on the rounded
  weights, `max(0, cur − w) · B` of its candidate; 0 when it is not a candidate (the editor's panel)» — so
  `sale.soldEur` and `sale.taxEur` sum instruments only and the liquidity's «Tasse» cell is «—» through
  `formatSaleTaxCell(0, 0)`. `describeTargetedSaleTotal` takes the suffix `spent` = «, usi {X} di liquidità»
  (whole euros) when `liquiditySpentEur ≥ SALE_NOISE_EUR`, else «»: with `soldEur < SALE_NOISE_EUR` and a
  spend → «Nessuna vendita: usi 3.000 € di liquidità.»; with neither → the PR's «Nessuna vendita: i pesi sono
  quelli raggiungibili col PAC.»; else the three PR sentences with `sold` = «Vendi 8.000 €, paghi circa 400 € di
  tasse, usi 3.000 € di liquidità» («Vendi 8.000 €, paghi circa 400 € di tasse, usi 3.000 € di liquidità (tetto
  500 €).»).
- **A forced lock is read without a pointer** (C6): under the instrument's name `<span className="block text-[11px]
  text-muted-foreground">{row.lockReason}</span>`; the `title` of `:339` and `:350` stays.

### The plan's disposals (`lib/utils/accumulationPlanUtils.ts`)

`seedDisposalsFromSale` comes back (NOVE-17 removed it) as `pr487:lib/utils/accumulationPlanUtils.ts:1064-1085`
wrote it, with `estimatedProceedsEur: roundToCents(deps.valueOf(asset))` for a whole position and
`roundToCents(quantity * price)` for a partial one. `OptimizerSnapshot` (`types/optimizer.ts`) gains `taxCapEur?:
number; lockedKeys?: string[]`, and both converters read them back
(`pr487:lib/services/accumulationPlanService.ts:113-114`, `pr487:lib/services/modelPortfolioService.ts:30-31`).
The seed is a `PlanSeedDraft` with `disposals`. The dialog passes `seedDisposalsFromSale` only the instruments —
`result.sale.perCandidate.filter((p) => p.key !== LIQUIDITY_CANDIDATE_KEY && assetsById.get(p.key)?.type !==
'realestate')`: spending the liquidity is not a sale (with the PR's call the stand-in, not in the saved model,
becomes a disposal of an asset that does not exist, worth 1 €) and a property is fixed.

### V4, V6 — the fixture and the codes

`__tests__/weightOptimizerTargeted.test.ts` is rewritten on an invented portfolio (base 100.000 €, rates 26% and
12,5%), assertions by PROPERTY, never a figure copied from the PR:

```ts
const B = 100000;
// label, value €, unrealized gain € (null = no EUR basis), exposure, factor
const FIXTURE: Row[] = [
  ['ALFA', 30000, 6000, { equity: 1 }, { equity: { Market: 1 } }],
  ['BETA', 20000, 2000, { equity: 1 }, { equity: { Momentum: 1 } }],
  ['GAMMA', 15000, -1000, { equity: 1 }, { equity: { 'Small Cap Value': 1 } }],
  ['DELTA', 15000, 1500, { bonds: 1 }, {}],          // rate 12,5
  ['EPSILON', 10000, 0, { commodity: 1 }, {}],
  ['ZETA', 5000, null, { trendFollowing: 1 }, {}],   // unknown basis: locked
  ['ETA', 5000, 500, { equity: 2 }, { equity: { Market: 2 } }],
];
```

Each row becomes a candidate with `taxPerEuroSold = gain === null ? null : (rate / 100) × max(0, gain / value)`,
rate 12,5 for DELTA and 26 for the others; `currentValueEur = value`, bounds 0–100. Targets: equity 60 (sub-targets
Market 80, Momentum 20, Small Cap Value 0), bonds 25, commodity 10, trendFollowing 5; settings `{
...DEFAULT_IDEAL_ALLOCATION, enabled: true, classPriority: 'essential', leveragePriority: 'high', factorObjectives:
[{ assetClass: 'equity', priority: 'high' }] }` — so GAMMA is above its target and free to sell.

The increment's hunk of `__tests__/weightOptimizerNarrative.test.ts` (the `describeTargetedSaleTotal` /
`formatSaleTaxCell` cases) is rewritten on round figures: `soldEur: 8000, taxEur: 400, liquiditySpentEur: 0, idealTaxEur: 900, taxCapEur:
500` → «Vendi 8.000 €, paghi circa 400 € di tasse (tetto 500 €).»; `formatSaleTaxCell(2000, 250)` → «250,00 €»,
`(1000, 0)` → «0,00 €», `(0, 0)` → «—»; no figure of the PR's hunk survives.

Section codes leave comments and test names (the increment's hunk of `__tests__/accumuloA4.test.ts` lands in
`__tests__/accumuloTileSentences.test.ts`, its name since NOVE-16); `doc/guide/ottimizzatore.md` gains the mode
(the increment's 10 lines, rewritten without codes).

### Phone composition

None changes: the mode lives in a dialog (a drawer below `desktop:`); the tab's first screen is NOVE-16's.

## 5. Constraints and traps (AGENTS.md / DESIGN.md, «here it means that»)

- **«A plan that sells prices the withholding (`estimatePlanSaleTax`), `null` WITH a reason»** (AGENTS.md §
  Allocazione): here it means the optimizer may never sell what the page could not price — an unknown is a lock,
  not a zero, not a default rate.
- **The Absence-Has-Three-Names Rule**: «—» in the «Tasse» cell for a row that sells nothing (`formatSaleTaxCell`),
  a figure for a sale, the lock reason printed under the name for an unknown — three names, never a 0 for the
  unknown.
- **The React Compiler**: the run in «Calcola»'s handler; no `try/finally` in the dialog.
- **No owner data in a tracked file** (WORKFLOW.md § 1.6): the PR's tickers and values are not kept anywhere, not
  even in a comment.
- **The Modal-Is-A-Tile Rule**: the targeted status (the total line) is the dialog's reading, as NOVE-17 set it.

## 6. Tests per level (with the mutation that proves each)

| # | Test | Mutation that turns it red |
| --- | --- | --- |
| U1 | `__tests__/saleTax.test.ts` › `saleTaxPerEuro`: an account → exempt; no basis → unknown cost-basis; no rate → unknown rate; value 10.000 basis 8.000 rate 26 → 0,052; a loss → 0 | drop the `taxableOnSale` check / default the rate |
| U2 | `__tests__/allocazioneSummary.test.ts` (the existing `estimatePlanSaleTax` cases, unchanged) | multiply by the gain twice |
| U3 | `saleTax.test.ts` › `candidateSaleTaxPerEuro`: a composite buyer's two sleeves → its one rate; another asset's holding unknown → still the buyer's rate; the buyer's own unknown → unknown; no holding → exempt | read every member's holdings |
| U4 | `__tests__/weightOptimizerTargeted.test.ts` › caps 0, 200, 500, 2.000 €: rounded tax ≤ max(cap, minTax) + 0,01 | drop the `taxOf(plainRounded) ≤ capEur` term of `plainOk` |
| U5 | same › `optimizeWeights({ …targeted input, a max on ALFA below its held weight, cap 100 }, { maxIterations: 1 })` (`runOptimizer` takes no solver options): `converged === false`, a `not_converged` warning, tax ≤ max(cap, minTax) + 0,01 | the PR's fallback (`if (minTaxEur <= ε)`) |
| U6 | same › max on ALFA at 20% and cap 100 €: `sale.minTaxEur` > 100, `sale.taxEur ≤ sale.minTaxEur + 0,01`, `converged === true`, `capBinding === true`, the total line starts «I limiti in Impostazioni obbligano» | cap not raised to `minTaxEur` (the search cannot reach 100 € and returns `converged: false`) |
| U7 | same › 500 seeded random boxes: Σ = 100 within 1e-9, `lo ≤ w ≤ hi`, tax ≤ max(cap, minTax) | `roundTargeted` without `lp`; the sale branch without `hp` |
| U7b | same › three candidates capped at 30% in `'targeted'` → `infeasible_bounds` | drop the `sumUpperPct` check of `solveTargetedCore` |
| U8 | same › GAMMA (a loss) sold: its tax 0; ZETA never below its held weight | price a loss negative / unlock ZETA |
| U8b | same › a targeted run whose liquidity goes from 20% to 10% of a 100.000 € base: `sale.liquiditySpentEur` 10.000, the liquidity's `perCandidate` row `soldEur` 0 and `taxEur` 0, `sale.soldEur` = Σ of the instruments' rows; `weightOptimizerNarrative.test.ts`: `soldEur: 8000, taxEur: 400, liquiditySpentEur: 3000, taxCapEur: 500` → «Vendi 8.000 €, paghi circa 400 € di tasse, usi 3.000 € di liquidità (tetto 500 €).»; `soldEur: 0, liquiditySpentEur: 3000` → «Nessuna vendita: usi 3.000 € di liquidità.» | count the liquidity in `soldEur`; drop the suffix |
| U9 | `__tests__/accumulationPlanUtils.test.ts` › `seedDisposalsFromSale`: a kept instrument sells whole shares and never its last; a dropped one sells all; amounts in cents | drop `Math.ceil(quantity) − 1` |
| R5 | `idealCompositionDialog.test.tsx` › «Crea un PAC con questi pesi» after a targeted run that spends the liquidity hands a `PlanSeedDraft` whose `disposals` hold no `liquidita` and no property | pass every `perCandidate` row |
| R1 | `__tests__/idealCompositionDialog.test.tsx` › «Con vendite mirate»: the rows and «Tasse massime (€)» before «Calcola»; the «Liquidità» row's current weight equals the account's share of the base | render rows only after the result; `calculateAssetValue` for the row |
| R2 | same › a row with no rate is ticked, disabled, with the visible caption «Aliquota non impostata»; a pension fund «Non si vende sul mercato»; the liquidity is not locked | use the basis reason for both; keep only the `title` |
| R3 | same › with a result in targeted mode the modal's reading is `describeTargetedSaleTotal`'s line and the losses note is the first line under the table | omit it; keep «Pesi proposti…» as the reading |
| R4 | same › `runOptimizer` spy: a cap keystroke or a box tick after «Calcola» clears the result, 0 extra calls | drop `setRun(null)` from `toggleLock` and `setTaxCapInput` |
| E1 | `e2e/accumulo.spec.ts` › plants, data-only (doc/guide/e2e-playwright.md's pattern), `taxRate: 26` on `seed-vwce` and `seed-aapl` — on the seed only `seed-btp` carries a rate (`scripts/seedEmulator.ts:117`) — and removes it after; open «Ricalcola», choose «Con vendite mirate»: the «Bitcoin» row is ticked and disabled with «Aliquota non impostata»; tick «Vanguard FTSE All-World», type 500, «Calcola»: the total line and the «Tasse» column | hide the column |
| E2 | `e2e/accumulo.mobile.spec.ts` › the same dialog at 390: no horizontal overflow, «Non vendere» rows ≥ 44px | remove `TARGETED_DIFF_CLASS` |

The grep of criterion 9 reads the PR's real rows at run time — they are never written out — and is empty on the
branch (`$SCRATCH` = the session's scratchpad; a folder-wide grep cannot be empty: develop's own tests name some of
the same tickers):

```
git show refs/tmp/pr488:__tests__/weightOptimizerTargeted.test.ts | sed -n 23,38p \
  | grep -oE "'[A-Z0-9]{3,5}'|[0-9]{6}" | tr -d "'" | sort -u > "$SCRATCH/pr488-real.txt"
git grep -nwiFf "$SCRATCH/pr488-real.txt" -- __tests__/weightOptimizerTargeted.test.ts \
  __tests__/weightOptimizerNarrative.test.ts __tests__/accumuloTileSentences.test.ts \
  __tests__/accumulationPlanUtils.test.ts lib/utils/weightOptimizer.ts lib/utils/weightOptimizerNarrative.ts \
  components/allocation/IdealCompositionDialog.tsx doc/guide/ottimizzatore.md
```

## 7. Guided verification (WORKFLOW.md § 2)

Expected outcome, declared first: on the seed account, «Con vendite mirate» with a cap of 300 € proposes weights
closer to the model than «Raggiungibile» and pays at most 300 € of tax; an instrument without a rate stays ticked;
«Crea un PAC con questi pesi» opens the editor with the sales as disposals.

- **A**: `npx tsc --noEmit`, lint, Vitest in three zones, `npx playwright test e2e/accumulo` in every project.
- **B**: emulators + seed + `dev:emulator`; `taxRate: 26` planted on the seed's ETFs (only the BTP carries one),
  removed in G; decoys: an ETF «ornitorinco» with no `taxRate`, an ETF «fenicottero» at a loss.
- **C (browser)**: 390 and 1440, light and dark: the three modes, the boxes, the total line, the losses note.
- **D (data)**: after «Crea un PAC con questi pesi» and «Salva bozza», `accumulationPlans/<id>.disposals` holds the
  sales with `estimatedProceedsEur` in cents; `optimizerSnapshot.taxCapEur` = 300.
- **E (edges)**: cap 0: no row with a tax above 0 sells (each taxed row's proposed weight ≥ its current one); the
  liquidity and «fenicottero» may move, at «0,00 €»; the pension fund is locked «Non si vende sul mercato»; a cap above the ideal's tax (= «Ideale», the sentence «il tetto … non
  serve»); a max in Impostazioni below a held weight with cap 0 (the forced sentence); «ornitorinco» ticked with
  «Aliquota non impostata»; «fenicottero» sold at 0 tax.
- **F (owner, at «pronto»)**: on the mirror the owner tries his own cap; then `npm run mirror:remove`.
- **G** (the two budgets close by README.md § 8's ONE rule, decisions 33 and 34): `npm run perf:budget` (`/dashboard/allocation` within its ceiling: the page's chunk gains `saleTaxPerEuro`
  through `estimatePlanSaleTax`, the optimizer stays in the lazy tab); `mobile:budget` on
  `allocazione-accumulo` unchanged; stop the servers, remove scripts and mirror.

## 8. Putting it into service

One PR to `develop`. No rule, no collection, no migration. The owner closes PR #488 with a link to the merge.

## 9. Documentation

- `doc/guide/ottimizzatore.md`: «spending the liquidity is not a sale: `sale.liquiditySpentEur`, out of
  `soldEur` and `taxEur`, «—» in its «Tasse» cell, «, usi X € di liquidità» in the total line» (decision 57).
- `doc/guide/ottimizzatore.md`: «Con vendite mirate» — the cap, the locks, the one rule (`saleTaxPerEuro`), the
  forced tax as the cap, losses not offset, a group at its buyer, held weights off the grid, a proposed sale
  without a fee, the pension fund locked.
- `doc/guide/allocazione.md:157` (the bullet «A plan that SELLS prices the withholding») ends: «The per-euro rule
  is `saleTaxPerEuro` (`lib/utils/saleTax.ts`), shared with «Con vendite mirate»'s optimizer through
  `candidateSaleTaxPerEuro` (2026-11-12).»
- `doc/guide/accumulo.md` (the seed): «Con vendite mirate» seeds `disposals` — a whole position for an instrument
  out of the model, whole shares (never the last) for one kept, `estimatedProceedsEur` in cents; never the liquidity
  nor a property.
- `CLAUDE.md` › «Latest»; `Draft Release Temp.md`: the third mode.

## 10. Declared out of scope

- **Loss compensation (minusvalenze pregresse)**: none, declared (choice n; the app models none anywhere).
- **The fiscal cost basis with the fees**: NOVE-07 (this spec reads it through `costBasisEur`).
- **A sale proposed by the Consulente's hand-off**: none — NOVE-21 seeds no disposal (its C3); a sale under a tax cap stays «Con vendite mirate».

## 11. The prompt that implements it

```
Ciao, in questa sessione vorrei implementare la spec doc/nove/NOVE-18-vendite-mirate.md

Contesto, prima di toccare qualsiasi file (le regole del repo cambiano il modo di lavorare):
- Leggi WORKFLOW.md (regole di sessione e di collaudo; l'ultima sezione dice come si
  applicano in questo repo)
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- CLAUDE.md (l'indice: che cos'è e dove sta ogni cosa, lo stato corrente) è già nel
  contesto: usalo per trovare la guida giusta
- Leggi la spec doc/nove/NOVE-18-vendite-mirate.md e l'indice della serie
  doc/nove/README.md (§ 3 decisioni, § 4 scelte adottate, § 7 contratti condivisi, § 8 regole)
- Leggi doc/guide/allocazione.md, doc/guide/ottimizzatore.md, doc/guide/accumulo.md e
  doc/guide/e2e-playwright.md PRIMA di scrivere codice in quei domini
- Leggi DESIGN.md (The Modal-Is-A-Tile Rule, The Absence-Has-Three-Names Rule) e PRODUCT.md
- Leggi COMMENTS.md e DEVELOPMENT_GUIDELINES.md: il codice che scrivi li segue

Lancia npm audit e confrontalo con doc/guide/dipendenze.md (regola 8 di WORKFLOW.md).
Rispondimi in una riga: invariate dal <data>, oppure gli avvisi nuovi; quelli nuovi li
registriamo nella guida con una decisione, non si aggiorna nulla in questa sessione.

Prima della prima modifica: controlla il branch attivo (git branch --show-current) e crea
il branch di sessione da lì. Mai modificare un file sul branch di integrazione.

Crea SESSION_NOTES.md per tracciare il lavoro (non tracciato: a fine sessione si riversa
nei documenti e si cancella).

Ogni dubbio o scelta che spetta a me me la chiedi SUBITO con AskUserQuestion, una scelta
per domanda, a gruppi di quattro: mai un «da decidere» lasciato nel codice, nei documenti o
nel riassunto. Se serve un comando che solo io posso lanciare (produzione, un login
interattivo), dammelo una riga alla volta con l'esito atteso.

Implementa la spec così com'è scritta: l'incremento della PR #488 entra con il cherry-pick
della § 4 su un branch nuovo da develop (dopo NOVE-17 e NOVE-07), poi le correzioni V1-V6:
una sola regola delle tasse, il ripiego che non supera il tetto, gli arrotondamenti con i
minimi, il fixture inventato. I test PRIMA del codice, ciascuno visto rosso con la sua
mutazione; cifre inventate e tonde. Fermati e chiedimi se: un caso esistente di
estimatePlanSaleTax cambia risultato, il ripiego forzato di U5 non resta sotto il tetto, un
conflitto del cherry-pick tocca un file che la § 4 non nomina, perf:budget, misurato prima e dopo sulla stessa macchina, supera un tetto di più di 1 KB gz (fino a 1 KB lo alzi tu, con raisedBy e una riga in velocita.md § Registro), nel confronto con develop dello stesso giorno, stessa build, si muove una voce di mobile:budget che la spec non nomina. Collaudo: § 7, la F sul
mirror al mio «pronto». Un branch, un commit con il trailer Co-authored-by della § 3, solo
dopo il mio OK con il riassunto del diff. SESSION_NOTES.md non si committa.
```

Model: **Opus 5.5**, effort **medium** — an M spec in one area, but it rewrites the app's shared tax rule into a
function two engines read and corrects a constrained solver's fallback; a mistake prices a sale wrong. Estimated
size: 1 session, ~4 h; ~250 lines changed over the PR, ~16 tests.
