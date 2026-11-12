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
  would be taxed; prices a group by its buyer only (`:287`).
- **V2 — the fallback can exceed the cap**: when the exact search does not converge or ends above the cap, the
  fallback at `:1218-1226` replaces the weights only `if (minTaxEur <= TAX_EPSILON_EUR)`; with limits that force a
  sale (`minTaxEur > 0`) the over-cap weights are returned as they are — against choice m.
- **V3 — rounding ignores the lower bounds**: `optimizeTargeted` rounds with the old `roundToHalfPoints(x, hi)`
  (`:1285`) and `roundTargeted(x, cur, hi)` (`:1000-1030`), which floors a purchase to `max(grid, cur)` and can end
  below a minimum above the held weight.
- **V4 — the owner of the fork's real portfolio as fixture**: `pr488:__tests__/weightOptimizerTargeted.test.ts:2-4`
  («the owner's real case of 2026-09-27 … 12 instruments, 126.128 € of base»), `const B = 126000` and the `REAL`
  rows (tickers, values, gains) at `:24-37` (WORKFLOW.md § 1.6: no owner data in a tracked file).
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
3. A row with no cost basis or no rate is ticked «Non vendere» and cannot be unticked, with its reason; an account,
   a pension fund, the liquidity sell at zero tax; a group is priced by its most taxed member. **Proof**: U3, R2.
4. On every `ok` result the rounded weights' tax ≤ max(cap, minimum forced tax), the fallback included. **Proof**:
   U4, U5 (the fallback forced with `maxIterations: 1`).
5. With limits that force a tax above the cap, the forced tax becomes the cap and the total line says so (choice m).
   **Proof**: U6.
6. Every weight respects its lower and upper bound and Σ = 100. **Proof**: U7 (500 seeded random cases).
7. A position at a loss counts zero tax, and the dialog says that losses are not offset (choice n). **Proof**: U8, R3.
8. «Crea un PAC con questi pesi» in this mode seeds the plan's disposals: a whole position for an instrument left out
   of the model, whole shares for one kept, amounts in cents. **Proof**: U9.
9. The test fixture is invented and round. **Proof**: the § 6 grep.
10. The optimizer runs only on «Calcola»; the cap and the boxes clear the result. **Proof**: R4.

## 3. Decisions

- **Owner 26 (2026-11-12)**: «Con vendite mirate» stays a mode of the model's dialog, with the app's ONE tax rule
  (`estimatePlanSaleTax`: no rate → «Non vendere», `taxableOnSale`); invented fixtures.
- **Owner 31 (2026-11-12, defined by NOVE-07)**: the tax estimates stand on a fiscal cost basis that includes the
  fees. Here it means: this spec reads ONLY `AllocatableHolding.costBasisEur`, which NOVE-07 switches to
  `fiscalCostPerUnitEur` at `lib/utils/allocationUtils.ts:735`; nothing here computes a basis.
- **Adopted (README § 4)**: m (forced tax = the cap, said), n (losses not counted, said).
- **Adopted, reversible (this spec)**:
  - C1. The increment enters by `git cherry-pick --no-commit 4f1c044e` on a fresh branch after NOVE-17; credit
    `Co-authored-by: Giorgio Trentadue <148712309+Ciocc128@users.noreply.github.com>` (the address in the repo's
    history; the PR's author line is `Claude <noreply@anthropic.com>`).
  - C2. A group of equivalent instruments is priced at its MOST taxed member's rate, and unknown if any member is:
    the estimate never undercounts against the cap.
  - C3. A missing rate is locked with its own reason «Aliquota non impostata», beside the PR's «Costo fiscale
    sconosciuto».
  - C4. A property (fixed by NOVE-17) shows «Immobile: resta com'è» as its lock reason.
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
`types/optimizer.ts` becomes `'reachable' | 'ideal' | 'targeted'`. Then the changes; one commit, trailer of C1.

### V1 — the one tax rule (`lib/utils/saleTax.ts`, `lib/utils/allocazioneSummary.ts`)

In `saleTax.ts` (type-only import of `AllocatableHolding`):

```ts
/** What one euro sold of a holding costs in tax today. */
export type SaleTaxPerEuro =
  | { kind: 'exempt' }
  | { kind: 'taxed'; perEuro: number }
  | { kind: 'unknown'; reason: 'cost-basis' | 'rate' };

/**
 * THE rule of every sale estimate (estimatePlanSaleTax, the targeted optimizer): not taxable → exempt; no EUR basis or
 * no rate → unknown, never zero; the gain fraction floored at zero — a loss pays nothing and offsets nothing.
 */
export function saleTaxPerEuro(holding: AllocatableHolding): SaleTaxPerEuro {
  if (!holding.taxableOnSale || holding.value <= 0) return { kind: 'exempt' };
  if (holding.costBasisEur === undefined) return { kind: 'unknown', reason: 'cost-basis' };
  if (holding.taxRate === undefined) return { kind: 'unknown', reason: 'rate' };
  const gainFraction = Math.max(0, (holding.value - holding.costBasisEur) / holding.value);
  return { kind: 'taxed', perEuro: estimateSaleTax(gainFraction, holding.taxRate) ?? 0 };
}

/** A candidate's rate: its most taxed member's, unknown if any member is (2026-11-12). */
export function candidateSaleTaxPerEuro(
  memberAssetIds: readonly string[],
  holdings: readonly AllocatableHolding[],
): SaleTaxPerEuro {
  let worst: SaleTaxPerEuro = { kind: 'exempt' };
  for (const holding of holdings) {
    if (!memberAssetIds.includes(holding.assetId ?? holding.id)) continue;
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
sleeves carry the asset's gain fraction (`allocationUtils.ts:750-752`), so a member's first holding is its rate.

In `weightOptimizer.ts`: `taxPerEuroSoldOf` and the `DEFAULT_CAPITAL_GAINS_RATE` import go. `runOptimizer`'s input
gains `holdings?: readonly AllocatableHolding[]`; `buildOptimizerCandidates` sets

```ts
      taxPerEuroSold: input.holdings
        ? toRate(candidateSaleTaxPerEuro(position.memberAssetIds, input.holdings))
        : undefined,
```

with `const toRate = (t: SaleTaxPerEuro) => (t.kind === 'exempt' ? 0 : t.kind === 'taxed' ? t.perEuro : null);`.
The dialog builds `const holdings = buildHoldings(allAssets, calculateAssetValue)` once per open and passes it.
`forcedLockReason` (the PR's, in the dialog) becomes:

```ts
function forcedLockReason(position: { buyAssetId: string; memberAssetIds: string[] }, asset: Asset | undefined,
  holdings: readonly AllocatableHolding[]): string | null {
  if (!asset) return null;
  if (asset.type === 'realestate') return IDEAL_COMPOSITION_LOCK_PROPERTY;
  if (resolveAllocationRole(asset) === 'frozen') return IDEAL_COMPOSITION_LOCK_FROZEN;
  const tax = candidateSaleTaxPerEuro(position.memberAssetIds, holdings);
  if (tax.kind !== 'unknown') return null;
  return tax.reason === 'rate' ? IDEAL_COMPOSITION_LOCK_UNKNOWN_RATE : IDEAL_COMPOSITION_LOCK_UNKNOWN_BASIS;
}
```

`weightOptimizerNarrative.ts`: `IDEAL_COMPOSITION_LOCK_UNKNOWN_RATE = 'Aliquota non impostata'`,
`IDEAL_COMPOSITION_LOCK_PROPERTY = 'Immobile: resta com’è'`, and `IDEAL_COMPOSITION_LOSSES_NOTE` = «Le stime non
compensano le minusvalenze: una vendita in perdita conta zero tasse, non un credito.», shown under the total line
whenever the targeted mode has a result.

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

It is feasible: `floor` lies in the box and sums to at most 1, so Σ `loForced` ≤ 1, and NOVE-17's check holds Σ
`hiInit` ≥ 1. With nothing forced (`minTaxEur` = 0) `floor` equals the held weight of every taxed candidate, which
is the PR's `untaxedPipeline`; that helper and the `if (minTaxEur <= TAX_EPSILON_EUR)` branch go.

### V3 — rounding with the lower bounds

`plainRounded = roundWeights(x, loUsed, hi)` (NOVE-17) at `:1285`; `roundTargeted(x, cur, lo, hi)` takes the lower
bounds and its purchase branch reads `r[i] = Math.min(Math.max(floorGrid(xp[i]), cp[i], lp[i]), hp[i]);` with `lp =
lo.map((v) => v * 100)`. Every other step of `roundTargeted` stays (each only shrinks a sale, so tax(rounded) ≤
tax(raw)); the `plainOk` test adds `plainRounded.every((p, i) => p >= loUsed[i] * 100 - 1e-9)`.

### V5 — the dialog (on NOVE-17's `IdealCompositionDialog`)

The increment's targeted UI enters as written (rows before «Calcola», `TARGETED_DIFF_CLASS` hiding the € difference
below `desktop:`, the 44px rows, the «Tasse» column, `describeTargetedSaleTotal`), with: `setTaxCapInput` and
`toggleLock` also calling `setRun(null)`; the `sale` input built in «Calcola»'s handler, not in a memo; the cap field
`IDEAL_COMPOSITION_TAX_CAP_LABEL` («Tasse massime (€)») parsed with `Math.max(0, Number(…) || 0)` as the PR does.

### The plan's disposals (`lib/utils/accumulationPlanUtils.ts`)

`seedDisposalsFromSale` comes back (NOVE-17 removed it) as `pr487:lib/utils/accumulationPlanUtils.ts:1064-1085`
wrote it, with `estimatedProceedsEur: roundToCents(deps.valueOf(asset))` for a whole position and
`roundToCents(quantity * price)` for a partial one. `OptimizerSnapshot` (`types/optimizer.ts`) gains `taxCapEur?:
number; lockedKeys?: string[]`, and both converters read them back
(`pr487:lib/services/accumulationPlanService.ts:113-114`, `pr487:lib/services/modelPortfolioService.ts:30-31`).
The seed is a `PlanSeedDraft` with `disposals`.

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
  a figure for a sale, the lock reason for an unknown — three names, never a 0 for the unknown.
- **The React Compiler**: the run in «Calcola»'s handler; no `try/finally` in the dialog.
- **No owner data in a tracked file** (WORKFLOW.md § 1.6): the PR's tickers and values are not kept anywhere, not
  even in a comment.
- **The Modal-Is-A-Tile Rule**: the targeted status (the total line) is the dialog's reading, as NOVE-17 set it.

## 6. Tests per level (with the mutation that proves each)

| # | Test | Mutation that turns it red |
| --- | --- | --- |
| U1 | `__tests__/saleTax.test.ts` › `saleTaxPerEuro`: an account → exempt; no basis → unknown cost-basis; no rate → unknown rate; value 10.000 basis 8.000 rate 26 → 0,052; a loss → 0 | drop the `taxableOnSale` check / default the rate |
| U2 | `__tests__/allocazioneSummary.test.ts` (the existing `estimatePlanSaleTax` cases, unchanged) | multiply by the gain twice |
| U3 | `saleTax.test.ts` › `candidateSaleTaxPerEuro`: members at 0,02 and 0,05 → 0,05; one unknown → unknown; no holding → exempt | take the buyer's rate |
| U4 | `__tests__/weightOptimizerTargeted.test.ts` › caps 0, 200, 500, 2.000 €: rounded tax ≤ max(cap, minTax) + 0,01 | the PR's `roundToHalfPoints` |
| U5 | same › `solverOptions: { maxIterations: 1 }` with a max below ALFA's held weight (forced sale): tax ≤ max(cap, minTax) + 0,01 | the PR's fallback (`if (minTaxEur <= ε)`) |
| U6 | same › max on ALFA at 20% and cap 100 €: `sale.minTaxEur` > 100, the total line starts «I limiti in Impostazioni obbligano» | cap not raised to `minTaxEur` |
| U7 | same › 500 seeded random boxes: Σ = 100, `lo ≤ w ≤ hi`, tax ≤ max(cap, minTax) | `roundTargeted` without `lp` |
| U8 | same › GAMMA (a loss) sold: its tax 0; ZETA never below its held weight | price a loss negative / unlock ZETA |
| U9 | `__tests__/accumulationPlanUtils.test.ts` › `seedDisposalsFromSale`: a kept instrument sells whole shares and never its last; a dropped one sells all; amounts in cents | drop `Math.ceil(quantity) − 1` |
| R1 | `__tests__/IdealCompositionDialog.test.tsx` › «Con vendite mirate»: the rows and «Tasse massime (€)» before «Calcola» | render rows only after the result |
| R2 | same › a row with no rate is ticked, disabled, titled «Aliquota non impostata» | use the basis reason for both |
| R3 | same › with a result in targeted mode the losses note is under the total line | omit it |
| R4 | same › `runOptimizer` spy: a cap keystroke or a box tick after «Calcola» clears the result, 0 extra calls | build `sale` in a memo |
| E1 | `e2e/accumulo.spec.ts` › open «Ricalcola», choose «Con vendite mirate», type 500, tick a box, «Calcola»: the total line and a «Tasse» column | hide the column |
| E2 | `e2e/accumulo.mobile.spec.ts` › the same dialog at 390: no horizontal overflow, «Non vendere» rows ≥ 44px | remove `TARGETED_DIFF_CLASS` |

The grep of criterion 9, empty on the branch:

```
git grep -nE "126\.?128|126000|\b(CL2|AVWS|DEGC|EIMI|NTSG|ALLW|EXUS|XDEM|SGLN|DBMF|UEQC|CRRY)\b" -- \
  __tests__ lib components e2e
```

## 7. Guided verification (WORKFLOW.md § 2)

Expected outcome, declared first: on the seed account, «Con vendite mirate» with a cap of 300 € proposes weights
closer to the model than «Raggiungibile» and pays at most 300 € of tax; an instrument without a rate stays ticked;
«Crea un PAC con questi pesi» opens the editor with the sales as disposals.

- **A**: `npx tsc --noEmit`, lint, Vitest in three zones, `npx playwright test e2e/accumulo` in every project.
- **B**: emulators + seed + `dev:emulator`; decoys: an ETF «ornitorinco» with no `taxRate`, an ETF «fenicottero» at a
  loss.
- **C (browser)**: 390 and 1440, light and dark: the three modes, the boxes, the total line, the losses note.
- **D (data)**: after «Crea un PAC con questi pesi» and «Salva bozza», `accumulationPlans/<id>.disposals` holds the
  sales with `estimatedProceedsEur` in cents; `optimizerSnapshot.taxCapEur` = 300.
- **E (edges)**: cap 0 (= «Raggiungibile»); a cap above the ideal's tax (= «Ideale», the sentence «il tetto … non
  serve»); a max in Impostazioni below a held weight with cap 0 (the forced sentence); «ornitorinco» ticked with
  «Aliquota non impostata»; «fenicottero» sold at 0 tax.
- **F (owner, at «pronto»)**: on the mirror the owner tries his own cap; then `npm run mirror:remove`.
- **G**: `npm run perf:budget` (`/dashboard/allocation` unchanged: the mode is in the lazy tab); `mobile:budget` on
  `allocazione-accumulo` unchanged; stop the servers, remove scripts and mirror.

## 8. Putting it into service

One PR to `develop`. No rule, no collection, no migration. The owner closes PR #488 with a link to the merge.

## 9. Documentation

- `doc/guide/ottimizzatore.md`: «Con vendite mirate» — the cap, the locks, the one rule (`saleTaxPerEuro`), the
  forced tax as the cap, losses not offset, a group at its most taxed member.
- `doc/guide/allocazione.md` § the rule of `estimatePlanSaleTax`: «la stessa regola per euro venduto,
  `saleTaxPerEuro` in `lib/utils/saleTax.ts`, serve l'ottimizzatore (2026-11-12)».
- `CLAUDE.md` › «Latest»; `Draft Release Temp.md`: the third mode.

## 10. Declared out of scope

- **Loss compensation (minusvalenze pregresse)**: none, declared (choice n; the app models none anywhere).
- **The fiscal cost basis with the fees**: NOVE-07 (this spec reads it through `costBasisEur`).
- **A sale proposed by the Consulente's hand-off**: heir NOVE-21 (it may seed `disposals` through `PlanSeedDraft`).

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
conflitto del cherry-pick tocca un file che la § 4 non nomina. Collaudo: § 7, la F sul
mirror al mio «pronto». Un branch, un commit con il trailer Co-authored-by della § 3, solo
dopo il mio OK con il riassunto del diff. SESSION_NOTES.md non si committa.
```

Model: **Opus 5.5**, effort **medium** — an M spec in one area, but it rewrites the app's shared tax rule into a
function two engines read and corrects a constrained solver's fallback; a mistake prices a sale wrong. Estimated
size: 1 session, ~4 h; ~250 lines changed over the PR, ~16 tests.
