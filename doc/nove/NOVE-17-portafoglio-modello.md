# NOVE-17 — Allocazione › Accumulo: the model portfolio and the optimizer of PR #487, brought in with changes

> Series `doc/nove/` (README.md § 5): **depends on NOVE-16** (the tab, the editor, the plan document); **NOVE-18 and
> NOVE-21 are implemented after it** (they read the optimizer, the editor's seed and the model's fingerprint defined
> here). Written on 2026-11-12; every `file:line` is cited on `develop` @ b841cbd7, a PR line as `pr487:file:line` on
> the local ref `refs/tmp/pr487` (head 9449f6ce, child of #486's d1e2666d). Executes the adopted choices g, h, j, k,
> l, q (README.md § 4).

## 1. The problem today (evidence on the code)

After NOVE-16 the Accumulo tab plans monthly purchases toward weights the owner types by hand; nothing proposes the
weights. **PR #487** (contributor Ciocc128; one commit 9449f6ce on top of #486; the increment `git diff
refs/tmp/pr486 refs/tmp/pr487` is 70 files, +7 141 / −206) adds:

- **the criteria** «Criteri del modello» (`AssetAllocationSettings.idealAllocation`, `pr487:types/assets.ts`),
  edited on the tab (`ObiettiviDialog`), read-only in Impostazioni (`components/settings/IdealAllocationSummary.tsx`);
- **the optimizer** (`pr487:lib/utils/weightOptimizer.ts`, 910 lines; `activeSetQP.ts`, `boxProjection.ts`): a
  weighted least-squares QP over the candidates' weights, two modes `'reachable' | 'ideal'` (`:34`), entry
  `runOptimizer` (`:788-826`);
- **the model portfolio** `modelPortfolios/{ownerId}` (`pr487:types/modelPortfolio.ts`,
  `pr487:lib/services/modelPortfolioService.ts`), its tile `PortafoglioModelloTile`, the dialogs
  `IdealCompositionDialog` («Ricalcola il portafoglio modello») and `ModelEditDialog`, and in the PAC editor an
  «Ottimizzato» path (`OptimizerPanel`) and a `seedDraft` prop
  (`pr487:components/allocation/AccumulationPlanDialog.tsx:194`).

Defects of the increment, each cured in § 4:

- **M1 — the page header reads the model** (against choice l): `pr487:app/dashboard/allocation/page.tsx:163`, `:237`
  (`useModelPortfolio` on the page) and `:514` (`targetSource: 'model' | 'plan'`), with
  `pr487:lib/utils/allocazioneNarrative.ts:306` widened to four sources.
- **M2 — bounds that cannot reach 100 pass**: `optimizeWeights` (`pr487:lib/utils/weightOptimizer.ts:708-744`)
  refuses Σ lower > 100 only; Σ upper < 100 runs and returns weights that do not sum to 100.
- **M3 — rounding breaks the bounds and the sum**: `roundToHalfPoints(x, hi)` (`:636-660`) floors every weight,
  ignores the lower bounds, and adds the remainder in ONE pass that skips capped rows: a minimum is broken and Σ can
  end at 99.
- **M4 — liquidity is not a candidate** (against choice j): `buildStandaloneCandidates` drops every `type === 'cash'`
  asset (`:868-910`), so a cash target cannot be met.
- **M5 — the model's base is gross of debts** (against choice j): `allocablePortfolioEur`
  (`pr487:components/allocation/IdealCompositionDialog.tsx:113-122`) sums the positive values by
  `resolveAllocationRole`; a mortgage and a personal loan are left out, and so is the net of a property.
- **M6 — the optimizer runs on every keystroke**: `IdealCompositionDialog.tsx:137-157` and
  `pr487:components/allocation/OptimizerPanel.tsx:84-100` run `runOptimizer` in a `useMemo` over the inputs; «Calcola»
  only reveals it (`calcRequested`).
- **M7 — the dialog is not a tile** (DESIGN → The Modal-Is-A-Tile Rule, `DESIGN.md:262`):
  `IdealCompositionDialog.tsx:265` passes only `title`; no eyebrow, no reading, the actions in the body.
- **M8 — `runGuarded` twice**: `pr487:lib/utils/runGuarded.ts:7` copies `components/settings/tabs/shared.tsx:23`.
- **M9 — a type file imports a library module**: `pr487:types/accumulationPlan.ts:2` imports from
  `lib/utils/weightOptimizer`; `pr487:types/modelPortfolio.ts:5` imports back from `types/accumulationPlan`.
- **M10 — the optimizer in the Settings bundle**: `pr487:lib/utils/settingsDraft.ts:38` imports
  `DEFAULT_IDEAL_ALLOCATION` from the 910-line `weightOptimizer.ts`.
- **M11 — #488 leaked into #487**: `taxCapEur` / `lockedKeys` in `pr487:types/accumulationPlan.ts:96-97`,
  `pr487:lib/services/accumulationPlanService.ts:113-114`, `pr487:lib/services/modelPortfolioService.ts:30-31`, and
  `seedDisposalsFromSale` (`pr487:lib/utils/accumulationPlanUtils.ts:1064`).
- **M12 — the model never goes stale** (choices h, q): nothing records what the targets and roles were when it was
  saved.
- **M13 — the rule escapes the mirror's test**: `match /modelPortfolios/{ownerId}` (pr487 `firestore.rules`); the
  regex of `__tests__/mirrorCollections.test.ts:15` reads only `{userId}` / `{ownerUid}`.
- **M14 — fork references again**: section codes in the increment (AL14-16, RM2-3, RO1, A2, A4, G5, B1, §4.2…) and
  `pr487:doc/guide/ottimizzatore.md` citing `modelPortfolios/{ownerId}`.

## 2. Goal and acceptance criteria

1. The tab shows «Portafoglio modello» and «Criteri del modello»; «Ricalcola» computes weights under the criteria,
   «Salva come portafoglio modello» writes `modelPortfolios/{ownerUid}`; «Crea un PAC con questi pesi» opens the
   editor seeded. **Proof**: R1, E1.
2. The page header and the Bilanciamento tab read neither the model nor the plans' weights. **Proof**: U1.
3. Σ upper < 100 or Σ lower > 100 → `infeasible_bounds`. **Proof**: U2.
4. Every `ok` result has Σ proposed = 100 within 1e-9 (the integer units sum to the grid exactly) and every weight
   inside its bounds; on the half-point grid when the bounds allow it, else on hundredths — the bounds themselves
   are on hundredths (a fixed share rounded to the nearest, a floor rounded down). **Proof**: U3 (property test, 500
   seeded random boxes, fixed shares and floors off the grid included).
5. The liquidity (cash accounts net of personal loans) is ONE candidate «Liquidità»; a property is fixed at its share
   net of its loans; the candidates' current values sum to the page's base. **Proof**: U4.
6. A fixed candidate below zero (a property under its mortgage) disables «Calcola» and «Prova» with one sentence in
   the negative tone; a liquidity below zero is declared in the reading and the run proceeds. **Proof**: U5, R5b.
7. The optimizer runs only on «Calcola» (and «Prova» of the criteria); an input changed after it clears the result.
   **Proof**: R2, R5.
8. The dialog has eyebrow, title, reading and footer (The Modal-Is-A-Tile Rule). **Proof**: R3.
9. A saved model carries `fingerprint`; after a change of the stored targets, of the goals that drive them, of
   «Criteri del modello» or of any asset's role the tile reads «superato»; an «Applica» of the Consulente that writes
   the same targets does not; a price move never does; a model without a fingerprint is stale.
   **Proof**: U6, E2.
10. One `runGuarded` (in `lib/utils/runGuarded.ts`); `types/optimizer.ts`, `types/accumulationPlan.ts` and
    `types/modelPortfolio.ts` import nothing from `lib/`; `settingsDraft.ts` and `IdealAllocationSummary.tsx` import
    neither the optimizer nor its narrative. **Proof**: U7.
11. No `taxCapEur`, `lockedKeys` or `seedDisposalsFromSale` in the tree. **Proof**: the § 6 grep.
12. The mirror owns `modelPortfolios`. **Proof**: `__tests__/mirrorCollections.test.ts` (unchanged).
13. Phone: the new tiles live in «Il resto della pagina»; the first screen of `allocazione-accumulo` does not move
    (`tilesAboveFold`, `figuresAboveFold`, `firstClosedRowAbovePill` unchanged); `screens` grows by the two closed
    rows and is re-measured on this machine and registered in `doc/guide/prima-schermata-misure.md`.
    **Proof**: E3, § 7 G.

## 3. Decisions

- **Owner 55 (2026-11-12)**: «Importo da investire» is money taken from the accounts (B10). **Owner 56
  (2026-11-12)**: «superato» fires on targets, roles AND criteria; an «Applica» that writes the same targets does not
  (B4).
- **Adopted (README § 4)**: g (new collection, rule by hand), h (stale after an «Applica» or an edit that CHANGES the targets), j (base =
  Bilanciamento's, net of debts, cash a candidate), k (criteria edited in Accumulo, read-only in Impostazioni), l
  (model read only on the tab), q (stale on targets, roles AND criteria).
- **Adopted, reversible (this spec)**:
  - B1. The increment enters by `git cherry-pick --no-commit 9449f6ce` on a fresh branch from develop after NOVE-16;
    credit `Co-authored-by: Giorgio Trentadue <148712309+Ciocc128@users.noreply.github.com>` (the address in the
    repo's history; the PR's author line is `Claude <noreply@anthropic.com>`).
  - B2. Rounding: half points within bounds by largest remainder; hundredths when the half-point grid cannot hold
    the bounds (a frozen 7,3%). The bounds are put on hundredths first: a fixed share (a property, a frozen
    instrument) is rounded to the nearest hundredth, a «Raggiungibile» floor is rounded DOWN to the hundredth (up
    would make Σ lower exceed 100 on a plan with no new money) — the proposal can sit under today's share by less
    than 0,01 points, never more.
  - B3. The liquidity's candidate key is `'liquidita'`, label «Liquidità»; it and the properties never enter the
    saved model (their weights are shown, the instruments' are renormalized to 100, as `toModelWeights` already
    does for the excluded rows).
  - B4. The fingerprint covers the STORED targets (`settings.targets`), with goal-driven allocation on also each
    goal's `id`, `targetAmount`, `priority` and `recommendedAllocation` — never the derived targets, which move with
    every price (`lib/utils/goalMath.ts:173-180`: the weights are a gap to the asset values) — and the
    `assetId:role` of every asset whose role is NOT `tradable`: a new tradable asset does not stale the model; a new
    excluded or frozen one does (choice q is about roles, whatever the asset). «Criteri del modello» ARE in it
    (decision 56: a model computed under «nessuno strumento oltre il 30%» is not the model of a 20% limit); an
    «Applica» that leaves the targets as they were changes nothing in it — the fingerprint reads values, never a
    date.
  - B10. **«Importo da investire» is money taken from the accounts** (decision 55): it never grows the base. In
    «Raggiungibile» every candidate keeps today's share as its floor except «Liquidità», whose floor goes down to
    (liquidity − amount) / base; in «Ideale» the amount is not read. An amount above the liquidity is refused under
    the field: «Sui conti hai {liquidità}: l'importo non può superarla.», «Calcola» disabled.
  - B5. FNV-1a 32-bit over a key-sorted JSON; a stored model without `fingerprint` is stale.
  - B6. A save that sets the weights («Salva come portafoglio modello», «Modifica a mano», «Usa i pesi del piano»,
    the editor's «Aggiorna anche il portafoglio modello») records the fingerprint of that moment: the owner saw the
    targets he saves against. «Aggiungi strumento da valutare» adds a row at 0% and KEEPS the stored fingerprint: a
    stale model stays stale.
  - B8. An instrument a plan cannot buy — a money-market fund (`assetClass === 'cash'`, not an account), a pension
    fund (not a ledger type) — is a candidate, because it is in the base, and never a weight of the saved model,
    like «Liquidità»: NOVE-16's `isPlanBuyable` refuses it, and a model seeds a plan.
  - B9. A liquidity below zero (personal loans above the accounts) does not stop the run: it is declared, and the
    optimizer's floor at 0 proposes to bring it back (AGENTS.md § Allocazione: below zero declared, never clamped).
  - B7. The optimizer's types live in `types/optimizer.ts`.

## 4. Solution

### Bringing the increment in

```
git fetch origin pull/487/head:refs/tmp/pr487      # only if the local ref is gone
git switch develop && git pull && git switch -c feat/portafoglio-modello
git cherry-pick --no-commit 9449f6ce
```

Expected conflicts, each resolved toward develop's file with the increment's hunk re-applied:
`lib/utils/accumuloSummary.ts` (NOVE-16 moved `summarizePacMonth` to `accumuloMonth.ts`; the increment's `hasModel`,
`modelFailed`, sections and `toModelWeights` preview stay in `accumuloSummary.ts`), `tiles/AccumuloVuotoTile.tsx`
(NOVE-16's `useMonthlySavingsMedian` kept, the increment's `model` / `onGoToComposition` added),
`PlanDraftSidePanel.tsx`, `accumulationNarrative.ts`, `accumulationPlanUtils.ts`, `accumulationPlanService.ts`
(NOVE-16's transactions and `roundPlanEuros` kept, the increment's snapshot converter minus M11),
`AccumulationPlanDialog.tsx`, `AccumuloTab.tsx`, `page.tsx`, `allocazioneNarrative.ts` (M1), `types/assets.ts` (keep
`isCashAccount` and `createdEmpty`), `e2e/accumulo.mobile.spec.ts`, `doc/guide/accumulo.md`, `AGENTS.md`,
`firestore.rules` (the rule of § Firestore below), `__tests__/accumuloSummary.test.ts`,
`__tests__/accumulationPlanUtils.test.ts`. New files of the increment that import moved names are fixed after the
pick: `useAccumulationPlans` / `selectOpenPlan` from `lib/hooks/useAccumulationPlans.ts`, `toMonthKey` / `addMonths` /
`monthIndexOf` from `lib/utils/planMonths.ts`. Then the changes; one commit, trailer of B1.

### M1 — the page stays the page

`pr487:page.tsx:163` and `:237` go; `:514` stays develop's `targetSource: usingGoalTargets ? 'goals' :
'settings'`; `allocazioneNarrative.ts` keeps `targetSource: 'settings' | 'goals'` and its one-line `source`. The
page passes `idealAllocation={settings?.idealAllocation ?? null}` to the tab (a settings field, already read).

### M9, M10 — types and defaults

- `types/optimizer.ts` (new): `OptimizerMode = 'reachable' | 'ideal'`, `ObjectiveReport`, `ConflictReport` (moved
  from `pr487:lib/utils/weightOptimizer.ts:34`, `:69`, `:79`) and `OptimizerSnapshot` (moved from
  `types/accumulationPlan.ts`, WITHOUT `taxCapEur` / `lockedKeys`). `weightOptimizer.ts` re-exports the three types;
  `types/accumulationPlan.ts` and `types/modelPortfolio.ts` import from `./optimizer`.
- `lib/constants/idealAllocation.ts` (new): `DEFAULT_IDEAL_ALLOCATION` moved from `weightOptimizer.ts:104`
  (re-exported there); `settingsDraft.ts:38` and `AccumuloTab.tsx` import it from the constant. `LIQUIDITY_CANDIDATE_KEY`,
  `OBJECTIVES_SETTINGS_EYEBROW`, `OBJECTIVES_LINK_FROM_SETTINGS` and `OPTIMIZER_OBJECTIVES_HREF` live there too
  (re-exported by `weightOptimizer.ts` and `weightOptimizerNarrative.ts`): `components/settings/IdealAllocationSummary.tsx:12`
  imports the three from the constant, so the Settings graph reaches neither `weightOptimizerNarrative.ts` nor,
  through its `formatSignedCurrency` import, `accumulationNarrative.ts`; `modelPortfolio.ts` never imports the optimizer.
- `types/accumulationPlan.ts`:

```ts
/** What a caller hands the editor to start a NEW plan from: the model's dialog today, the Consulente tomorrow. */
export interface PlanSeedDraft {
  positions: PlanPosition[];
  disposals?: PlanDisposal[];
  optimizerSnapshot?: OptimizerSnapshot;
}
```

  `AccumulationPlanDialog`'s prop becomes `seedDraft?: PlanSeedDraft` (`pr487:AccumulationPlanDialog.tsx:194`); the
  tile's state (`pr487:PortafoglioModelloTile.tsx:111`) is `useState<PlanSeedDraft | undefined>`.

### M2, M3 — `lib/utils/weightOptimizer.ts`

In `optimizeWeights`, beside the existing check:

```ts
  const sumUpperPct = candidates.reduce((sum, c) => sum + c.upperPct, 0);
  if (sumLowerPct > 100 + 1e-9 || sumUpperPct < 100 - 1e-9) {
    return { status: 'infeasible_bounds', weights: [], objectives: [], conflicts: [], warnings: [], iterations: 0,
      converged: false };
  }
```

`OPTIMIZER_STATUS_INFEASIBLE_BOUNDS` becomes «I limiti impostati non lasciano arrivare al 100%: nessun peso
proponibile.». `roundToHalfPoints` is replaced, and `:731` calls `roundWeights(result.x, lo, hi)`:

```ts
/** Weights (fractions) on a grid of `steps` units: Σ = 100 exactly, each inside its bounds; null if impossible. */
function roundOnGrid(x: number[], lo: number[], hi: number[], steps: number): number[] | null {
  const loU = lo.map((l) => Math.ceil(steps * l - 1e-9));
  const hiU = hi.map((h) => Math.floor(steps * h + 1e-9));
  const sum = (v: number[]) => v.reduce((s, u) => s + u, 0);
  if (loU.some((l, i) => l > hiU[i]) || sum(loU) > steps || sum(hiU) < steps) return null;
  const units = x.map((xi, i) => Math.min(hiU[i], Math.max(loU[i], Math.floor(steps * xi + 1e-9))));
  const frac = x.map((xi, i) => steps * xi - units[i]);
  const byFrac = x.map((_, i) => i).sort((a, b) => frac[b] - frac[a] || x[b] - x[a] || a - b);
  let remaining = steps - sum(units);
  // Round robin until the sum is exact: up by the largest remainder, down by the smallest, never across a bound.
  while (remaining > 0) {
    const i = byFrac.find((k) => units[k] < hiU[k]);
    if (i === undefined) return null;
    units[i] += 1; remaining -= 1; frac[i] -= 1;
    byFrac.sort((a, b) => frac[b] - frac[a] || x[b] - x[a] || a - b);
  }
  while (remaining < 0) {
    const i = [...byFrac].reverse().find((k) => units[k] > loU[k]);
    if (i === undefined) return null;
    units[i] -= 1; remaining += 1; frac[i] += 1;
    byFrac.sort((a, b) => frac[b] - frac[a] || x[b] - x[a] || a - b);
  }
  return units.map((u) => (u * 100) / steps);
}

/** The proposed percentages: half points when the bounds allow them, else hundredths (a frozen 7,3%). */
export function roundWeights(x: number[], lo: number[], hi: number[]): number[] {
  return roundOnGrid(x, lo, hi, 200) ?? roundOnGrid(x, lo, hi, 10000) ?? x.map((xi) => xi * 100);
}
```

The bounds reach `roundWeights` on hundredths (B2): `fixBounds` below rounds a fixed share with
`Math.round(pct * 100) / 100`, and `resolveCandidateBounds` (`pr487:lib/utils/weightOptimizer.ts:158-161`) ends with
`lower = Math.floor(lower * 100 + 1e-9) / 100` — the PR's floors are `(currentValueEur / baseEur) * 100`, arbitrary
reals on which BOTH grids return `null`. With them the hundredths grid always holds after the M2 check; the last
fallback keeps the function total.

### M4, M5 — the standalone candidates (`weightOptimizer.ts`, replacing `:868-910`)

```ts
export { LIQUIDITY_CANDIDATE_KEY } from '@/lib/constants/idealAllocation'; // 'liquidita'

export interface StandaloneCandidates {
  positions: Array<{ key: string; label: string; memberAssetIds: string[]; buyAssetId: string }>;
  fixBounds: (candidate: OptimizerCandidate) => Partial<Pick<OptimizerCandidate, 'lowerPct' | 'upperPct'>>;
  /** The assets plus the liquidity's stand-in, for `runOptimizer`'s `assetsById`. */
  assetsById: Map<string, Asset>;
  /** Net value: a property net of its loans, the stand-in = the liquidity net of the other loans. */
  valueOf: (asset: Asset) => number;
  /** The page's base: Σ of the candidates' current values. The amount to invest is inside it (B10). */
  baseEur: number;
  /** Fixed candidates below zero: the optimizer cannot run on this base. */
  negativeFixedKeys: string[];
  /** The accounts net of the personal loans; below zero it is declared, the run proceeds (B9). */
  liquidityEur: number;
}

export function buildStandaloneCandidates(
  assets: Asset[],
  valueOf: (a: Asset) => number,
  investEur: number, // B10: taken from the accounts; 0 in «Ideale» and in the criteria's «Prova»
  evaluateAssetIds: ReadonlySet<string> = new Set(),
  groups: ReadonlyArray<{ buyAssetId: string; memberAssetIds: string[] }> = [],
): StandaloneCandidates {
  const inBase = assets.filter((a) => resolveAllocationRoleWithin(a, assets) !== 'excluded');
  const properties = inBase.filter((a) => a.type === 'realestate');
  const propertyIds = new Set(properties.map((a) => a.id));
  const loanEur = (a: Asset) => (isLoanAsset(a) ? valueOf(a) : 0);
  const netOf = (p: Asset) =>
    valueOf(p) + inBase.filter((l) => l.financedAssetId === p.id).reduce((s, l) => s + loanEur(l), 0);
  // An account, a personal loan and a loan on anything but a property in the base are the liquidity.
  const liquidityEur = inBase
    .filter((a) => isCashAccount(a) || (isLoanAsset(a) && !propertyIds.has(a.financedAssetId ?? '')))
    .reduce((s, a) => s + valueOf(a), 0);
  const standIn = { id: LIQUIDITY_CANDIDATE_KEY, name: 'Liquidità', type: 'cash', assetClass: 'cash', quantity: 1,
    currentPrice: 1, currency: 'EUR' } as Asset; // never stored: it lives only in this calculation
  const instruments = inBase.filter((a) => !isCashAccount(a) && !isLoanAsset(a) && a.type !== 'realestate' && (
    valueOf(a) > 0 || (evaluateAssetIds.has(a.id) && resolveAllocationRole(a) === 'tradable')));
  const value = (a: Asset) =>
    a.id === LIQUIDITY_CANDIDATE_KEY ? liquidityEur : propertyIds.has(a.id) ? netOf(a) : valueOf(a);
  const heldEur = liquidityEur + properties.reduce((s, p) => s + netOf(p), 0)
    + instruments.reduce((s, a) => s + valueOf(a), 0);
  const baseEur = heldEur;
  // B10: the liquidity may go down by what is invested, never below zero; rounded DOWN to the hundredth (B2).
  const liquidityFloorPct = investEur > 0 && baseEur > 0
    ? Math.floor((Math.max(0, liquidityEur - investEur) / baseEur) * 10000) / 100
    : undefined;
  // … the PR's grouping of `instruments` by `groups` (`:883-893`), unchanged, giving `instrumentPositions`.
  const fixedPct = new Map<string, number>([
    ...properties.map((p) => [p.id, onHundredths((netOf(p) / baseEur) * 100)] as const),
    ...instruments.filter((a) => resolveAllocationRole(a) === 'frozen')
      .map((a) => [a.id, onHundredths((valueOf(a) / baseEur) * 100)] as const),
  ]); // onHundredths = (pct) => Math.round(pct * 100) / 100 (B2)
  return {
    positions: [
      ...instrumentPositions,
      ...properties.map((p) => ({ key: p.id, label: p.name, memberAssetIds: [p.id], buyAssetId: p.id })),
      { key: LIQUIDITY_CANDIDATE_KEY, label: 'Liquidità', memberAssetIds: [LIQUIDITY_CANDIDATE_KEY],
        buyAssetId: LIQUIDITY_CANDIDATE_KEY },
    ],
    fixBounds: (c) => {
      if (c.buyAssetId === LIQUIDITY_CANDIDATE_KEY) {
        return liquidityFloorPct !== undefined ? { lowerPct: liquidityFloorPct } : {};
      }
      const pct = baseEur > 0 ? fixedPct.get(c.buyAssetId) : undefined;
      return pct !== undefined ? { lowerPct: pct, upperPct: pct } : {};
    },
    assetsById: new Map([...assets.map((a) => [a.id, a] as const), [LIQUIDITY_CANDIDATE_KEY, standIn]]),
    valueOf: value,
    baseEur,
    negativeFixedKeys: properties.filter((p) => netOf(p) < 0).map((p) => p.id),
    liquidityEur,
  };
}
```

The import is `import { isCashAccount, isLoanAsset } from '@/types/assets';` (the ONE cash-account predicate,
`types/assets.ts:47-49`).

`runOptimizer` applies `fixBounds` as the PR does — `{ ...candidate, ...fixBounds(candidate) }` — so the
liquidity's `lowerPct` REPLACES the «Raggiungibile» floor `resolveCandidateBounds` gave it (today's share) and
its `upperPct` stays.

**Three callers.** `IdealCompositionDialog` deletes `allocablePortfolioEur` (`:113-122`) and its `baseEur` (`:124`),
calls the builder with `investEur = mode === 'reachable' ? amountEur : 0` (B10), keeps `canReachable = amountEur >
0`, shows under the amount field the help «Presi dai tuoi conti: il totale non cambia.» and, with `amountEur >
standalone.liquidityEur`, the error `describeAmountAboveLiquidity(liquidityEur)` = «Sui conti hai {X}: l'importo
non può superarla.» (`weightOptimizerNarrative.ts`; `aria-invalid`, `aria-describedby`; «Calcola» disabled), and
passes the builder's `assetsById`, `valueOf`, `baseEur` and `fixBounds` to `runOptimizer`. `ObiettiviDialog` (the
criteria's «Prova», `pr487:components/allocation/ObiettiviDialog.tsx:82-113`) is the second: its own `baseEur` memo
(the same gross base) goes, it calls `buildStandaloneCandidates(allAssets, calculateAssetValue, 0,
evaluateAssetIds, modelGroups(model?.weights ?? []))` and passes the same four. `OptimizerPanel` (the editor's
«Ottimizzato») keeps the plan's positions and is the third reader of `runOptimizer`. In both dialogs, with
`negativeFixedKeys.length > 0` «Calcola» / «Prova» is disabled and the reading is `describeNegativeFixed(labels)` =
«{nome} vale meno dei suoi debiti: il modello non si calcola su una base con una quota negativa.»; while
`positions` holds no instrument (only «Liquidità» and properties) the button is disabled under
`MODEL_NO_TRADABLE_INSTRUMENTS`; with `liquidityEur < 0` the run proceeds and the reading ends with
`NEGATIVE_LIQUIDITY_NOTE` = «La liquidità è sotto zero (i prestiti personali superano i conti): il modello la
riporta almeno a zero.».

**What never enters the saved model.** `modelPortfolio.ts`: `ModelExclusionReason` gains `'liquidity' | 'property'`;
`toModelWeights` and `validateModelWeights` test `entry.assetId === LIQUIDITY_CANDIDATE_KEY` (→ `'liquidity'`) BEFORE
the `assetsById` lookup — the dialog's map (`IdealCompositionDialog.tsx:109`) has no stand-in, and with the PR's
order the row is kept, «Salva» is refused on `MODEL_ERROR_UNKNOWN_ASSET` and the PAC seed gets a `liquidita`
position; `exclusionReason` returns `'property'` for `type === 'realestate'` before its `type === 'cash'` check and
`'notBuyable'` when `!isLedgerAssetType(asset.type) || asset.assetClass === 'cash'` (B8) after it;
`ModelExclusionReason` gains `'notBuyable'` too; `EXCLUSION_TEXT` gains «la liquidità conta nella base, non nel
modello», «un immobile conta nella base, non si compra a rate» and «conta nella base, ma un piano non lo compra».

### M6, M7 — the dialog computes on «Calcola» and is a tile

`IdealCompositionDialog`, `ObiettiviDialog` and `OptimizerPanel`: the `useMemo(() => runOptimizer(…))` goes; `const
[run, setRun] = useState<OptimizerResult | null>(null)`; «Calcola»'s (in `ObiettiviDialog` «Prova»'s) handler is
`setRun(runOptimizer({ … }))`; each input handler (amount, mode, a lock in NOVE-18; in `ObiettiviDialog` every
`onChange` of the criteria draft) also calls `setRun(null)`; `calcRequested` and `tryRequested` go. In `OptimizerPanel`
the inputs are props (the draft's positions and disposals, `liquidityL`, the targets): the run is stored with the
key of its inputs, `{ result, inputsKey }` where `inputsKey` = `[mode, baseEur, ...draft.positions.map((p) =>
p.id)].join('|')`, and the result is shown only while the current key equals it (no effect, no memo on the run).
The dialog:

```tsx
<ResponsiveModal
  open={open}
  onClose={onClose}
  width="xl"
  eyebrow={MODEL_TILE_EYEBROW}
  title={IDEAL_COMPOSITION_TITLE}
  reading={describeIdealCompositionStatus(run, standalone.negativeFixedKeys.map(labelOf), standalone.liquidityEur)}
  footer={/* «Annulla» (outline) · before a result «Calcola», after it «Salva come portafoglio modello» (primary)
            and «Crea un PAC con questi pesi» (outline) — the buttons of pr487:IdealCompositionDialog.tsx:321-355 */}
>
```

`describeIdealCompositionStatus(run, negativeFixedLabels, liquidityEur): ModalReading`
(`weightOptimizerNarrative.ts`; `ModalReading` from `lib/utils/dialogNarrative.ts:36-39` — a plain string would be
neutral, and an error paints the reading `text-destructive`, `DESIGN.md:262`): labels not empty →
`describeNegativeFixed(labels)`, tone `negative`; null run → «Scegli la modalità e premi «Calcola»: niente si salva
finché non lo chiedi.», `neutral`; `infeasible_bounds` / `no_candidates` → the two status sentences, `negative`; `ok` →
«Pesi proposti per {n} {strumento|strumenti} su una base di {€}.» — n counts the instrument positions, not
«Liquidità» nor the properties —, `neutral`; every neutral reading ends with `NEGATIVE_LIQUIDITY_NOTE` when
`liquidityEur < 0`.

### M8 — one `runGuarded`

`lib/utils/runGuarded.ts` (the PR's file) is the home; `components/settings/tabs/shared.tsx:23` deletes its body and
re-exports `export { runGuarded } from '@/lib/utils/runGuarded';`.

### M11 — what belongs to #488 leaves

`taxCapEur` / `lockedKeys` go from the snapshot type and both converters; `seedDisposalsFromSale` and its test go.
NOVE-18 brings them back with its own rules.

### M12 — «superato» (`lib/utils/modelPortfolio.ts`)

```ts
/** JSON with sorted keys and no undefined: the same object always gives the same text. */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`;
}

/** FNV-1a, 32 bit, 8 hex digits: a change detector, not a secret. */
function fnv1a(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/**
 * What the model rests on, WITHOUT a price in it: the stored targets, the criteria and, with goal-driven
 * allocation on, the goals' inputs. The derived targets move with every price and would stale the model at each refresh.
 */
export interface ModelBasis {
  targets: AssetAllocationTarget | null;
  /** «Criteri del modello» as the optimizer reads them: the stored ones, else the defaults (decision 56). */
  criteria: IdealAllocationSettings;
  goals: Array<Pick<InvestmentGoal, 'id' | 'targetAmount' | 'priority' | 'recommendedAllocation'>> | null;
}

export function buildModelBasis(settings: AssetAllocationSettings | null | undefined,
  goals: readonly InvestmentGoal[] | undefined): ModelBasis {
  const goalDriven = !!settings?.goalBasedInvestingEnabled && !!settings?.goalDrivenAllocationEnabled;
  return {
    targets: settings?.targets ?? null,
    criteria: settings?.idealAllocation ?? DEFAULT_IDEAL_ALLOCATION,
    goals: goalDriven && goals && goals.length > 0
      ? goals.map(({ id, targetAmount, priority, recommendedAllocation }) =>
          ({ id, targetAmount, priority, recommendedAllocation }))
      : null,
  };
}

/** What the model was computed against: the basis and every role that is not `tradable` (2026-11-12). */
export function modelFingerprint(basis: ModelBasis, assets: readonly Asset[]): string {
  const roles = assets
    .map((asset) => `${asset.id}:${resolveAllocationRoleWithin(asset, assets)}`)
    .filter((entry) => !entry.endsWith(':tradable'))
    .sort();
  return fnv1a(stableStringify({ basis, roles }));
}

/** «superato»: the targets, the criteria, the goals behind them or a role changed since the save (by hand or by an «Applica»). */
export function isModelStale(model: Pick<ModelPortfolio, 'fingerprint'>, basis: ModelBasis,
  assets: readonly Asset[]): boolean {
  return model.fingerprint === undefined || model.fingerprint !== modelFingerprint(basis, assets);
}
```

The page builds `const modelBasis = useMemo(() => buildModelBasis(settings, goalData?.goals), [settings, goalData])`
beside its effective targets (`app/dashboard/allocation/page.tsx:222-230`) and passes `modelBasis` to the tab, which
hands it to the tile, the two dialogs and the editor; the optimizer keeps running on the effective `targets`.

`ModelPortfolio` gains `fingerprint?: string`; `getModelPortfolio` reads it (a string or absent) and never validates
(a stale model must still load); `saveModelPortfolio(ownerId, input, allAssets, basis)` writes `fingerprint:
'keepFingerprint' in input ? input.keepFingerprint : modelFingerprint(basis, allAssets)` next to `weights` (an
`undefined` kept fingerprint leaves the field out: `removeUndefinedDeep`). `ModelPortfolioInput` gains
`keepFingerprint?: string | undefined`. `useSaveModelPortfolio` (`pr487:lib/hooks/useModelPortfolio.ts:25-26`) takes
`{ input, allAssets, basis }: { input: ModelPortfolioInput; allAssets: Asset[]; basis: ModelBasis }` and forwards
`basis`. Its FIVE callers pass the tab's `modelBasis`: `IdealCompositionDialog` (`handleSaveModel`, `:210-213`),
`ModelEditDialog` (`handleSave`, `:89-96`; it gains the prop `basis: ModelBasis`), `PortafoglioModelloTile`
(`handleUsePlan`, `:151-156`, and `handleCandidateCreated`, `:170-177` — the only one that adds `keepFingerprint:
model.fingerprint` to its input, B6) and `AccumulationPlanDialog` (`writeModelFromDraft`, `:611-617`; it gains the
prop `basis: ModelBasis`). `PortafoglioModelloTile`: `const stale = model ? isModelStale(model, modelBasis, allAssets) : false;` — the
aside is `MODEL_STALE_ASIDE` = «superato», the reading's first sentence `MODEL_STALE_READING` = «I target, i criteri o
i ruoli sono cambiati dopo il salvataggio: ricalcola il modello.»; «Ricalcola» stays the tile's one primary button (it
already is, `PortafoglioModelloTile.tsx:279`). The tile's reading moves out of the component (the analogue of
NOVE-16's D8): `describeModelTileReading({ readFailed, instrumentCount, origin, updatedAt, snapshot, toBuyEur,
stale }): Narrative` in `weightOptimizerNarrative.ts` holds the sentences of `PortafoglioModelloTile.tsx:131-140`
(«{n} {strumento|strumenti}. {origine} Per portare il portafoglio sul modello servono {€} di acquisti.» / «Il
portafoglio è già sul modello.»), with `MODEL_STALE_READING` first when `stale`; `MODEL_STALE_ASIDE` and
`MODEL_STALE_READING` live in the same file beside `MODEL_TILE_EMPTY_READING`. The editor's «Parti da: modello» stays
available on a stale model, with the same sentence under it.

### Firestore, mirror

```
    // Portafoglio modello (doc id = ownerUid)
    match /modelPortfolios/{ownerUid} {
      allow read: if canAccess(ownerUid);
      allow create, update: if canAccess(ownerUid) && request.resource.data.userId == ownerUid;
      allow delete: if canAccess(ownerUid);
    }
```

`scripts/mirrorCollections.ts` appends `'modelPortfolios'` to `PER_USER_DOCS`; `scripts/seedCensusE2E.mts:77` too.

### M14 — clean-up, and the guide

Section codes go from comments, test names and identifiers (the increment's hunks of
`__tests__/accumuloA4.test.ts` land in its NOVE-16 name, `__tests__/accumuloTileSentences.test.ts`).
`pr487:doc/guide/ottimizzatore.md` enters as
`doc/guide/ottimizzatore.md` with `{ownerUid}`, the fingerprint rule (B4, B6: «targets, criteria and roles stale the model; a price,
a new tradable asset and an «Applica» with the same targets do not»), the amount rule (B10), the base rule (j), the rounding rule (B2) and B8, B9; its sentence «With a model and no
open plan the tab's header reads the model as the target (`targetSource`).» goes and «the header» leaves the
query-key blind spot (M1).

### Phone composition

«Portafoglio modello» (`acc-modello`) and «Criteri del modello» (`acc-criteri`) are closed rows of «Il resto della
pagina» below `desktop:` (the PR's `ACCUMULO_SECTION_IDS`); a stale model's closed aside is «superato»: `AccumuloTab`
(`pr487:components/allocation/AccumuloTab.tsx:306`) computes `const modelStale = model ? isModelStale(model,
modelBasis, allAssets) : false` and passes `asideWhenClosed={!model ? ACCUMULO_MODEL_MISSING_ASIDE : modelStale ?
MODEL_STALE_ASIDE : ACCUMULO_CLOSED_ASIDES[ACCUMULO_SECTION_IDS.modello]}`; `describeAccumuloClosedAnswers`
(`pr487:lib/utils/accumulationNarrative.ts:1210-1213`) returns `null` for `acc-modello` on a stale model, so the
landscape row shows «superato» too. The first screen of the tab does not change; `screens` grows by the two rows.

## 5. Constraints and traps (AGENTS.md / DESIGN.md, «here it means that»)

- **The Modal-Is-A-Tile Rule** (`DESIGN.md:262`): here it means eyebrow, title, a reading that IS the status, the
  actions in the footer, no `bg-muted` box carrying the status in the body.
- **THE RULE of the roles** (AGENTS.md § Allocazione): here it means `resolveAllocationRoleWithin` in the builder and
  in the fingerprint; a loan is never a candidate, it nets its property or the liquidity.
- **Firestore rejects `undefined` in an array element** (AGENTS.md § Firestore Writes): `serializeIdealAllocation`
  (the PR's) stays the whitelisting serializer; the model's `weights` go through `removeUndefinedDeep`.
- **`setSettings` replaces the targets** (`lib/services/assetAllocationService.ts:177-188`): the PR carries
  `idealAllocation` through `existingData`; a test pins that an «Applica» of the Consulente keeps it (U8).
- **The React Compiler**: the optimizer runs in an event handler; no `try/finally` in a component (`runGuarded`).
- **Recharts only through `components/ui/charts/recharts.ts`**: the optimizer's bars are DOM, as written.
- **Sentences in `*Narrative.ts`**: every new string of § 4 lives in `weightOptimizerNarrative.ts` or
  `modelPortfolio.ts`'s text map.

## 6. Tests per level (with the mutation that proves each)

| # | Test | Mutation that turns it red |
| --- | --- | --- |
| U1 | `__tests__/allocazioneNarrative.test.ts` › `describeAllocazioneHeader` accepts only `'settings' \| 'goals'` (a `// @ts-expect-error` on `'model'`, seen red by `npx tsc --noEmit`: Vitest does not type-check), and `app/dashboard/allocation/page.tsx` read as text contains neither `useModelPortfolio` nor `modelPortfolio` | widen the union back; put `useModelPortfolio(ownerId)` back on the page |
| U2 | `__tests__/weightOptimizer.test.ts` › three candidates capped at 30% each → `infeasible_bounds` | drop the `sumUpperPct` check |
| U3 | `weightOptimizer.test.ts` › 500 seeded random boxes and points: Σ = 100 to 1e-9, `lo ≤ w ≤ hi`, half points when feasible; a case with a fixed share of 7,3456% and a floor of 12,3456% (through `fixBounds` and `resolveCandidateBounds`): every weight has at most two decimals | the PR's `roundToHalfPoints`; drop `onHundredths` (the fallback returns unrounded weights) |
| U4 | `weightOptimizer.test.ts` › accounts 10.000, personal loan −2.000, property 200.000 (role `frozen`) with mortgage −150.000, ETF 40.000: candidates «Liquidità» 8.000, property 50.000 fixed, Σ = `baseEur` = 98.000 = `compareAllocations(assets, targets).marketValue` on the same fixture; a money-market fund is an instrument candidate; accounts 1.000 and a personal loan −3.000 → `liquidityEur` −2.000 | gross `valueOf` for the property |
| U4b | same › accounts 10.000, ETF 30.000, `investEur` 4.000 → `baseEur` 40.000 (not 44.000), `fixBounds` of «Liquidità» `{ lowerPct: 15 }`, of the ETF `{}`; `investEur` 0 → `{}` for «Liquidità»; `investEur` 12.000 → `{ lowerPct: 0 }`; a «Raggiungibile» run on the first case gives «Liquidità» ≥ 15 and the ETF ≥ 75 | add the amount to the base; keep today's share as the liquidity's floor |
| U5 | same › property 100.000, mortgage −120.000 → `negativeFixedKeys` = [property] | drop the `< 0` filter |
| U6 | `__tests__/modelPortfolio.test.ts` › fingerprint equal for key order permuted; differs for a stored target changed, for a role tradable → frozen, for a goal's `targetAmount` with goal-driven on; differs for a criterion changed (`instrumentLimits`' `maxPct` 30 → 20) and is equal between an absent `idealAllocation` and `DEFAULT_IDEAL_ALLOCATION`; equal for the same targets written twice (an «Applica» with nothing changed); equal after adding a tradable asset and — goal-driven on — after an asset's price doubles; `buildModelBasis` gives `goals: null` with the flag off; no fingerprint → stale | include tradable roles / skip the targets / hash the derived targets |
| U7 | `__tests__/settingsDraft.test.ts` › reads the sources: `settingsDraft.ts` and `components/settings/IdealAllocationSummary.tsx` import neither `weightOptimizer` nor `weightOptimizerNarrative`; `types/optimizer.ts`, `types/accumulationPlan.ts`, `types/modelPortfolio.ts` have no `@/lib` import; `components/settings/tabs/shared.tsx` has no `async function runGuarded` | import the default from the optimizer; a constant back from the narrative; keep the body in `shared.tsx` |
| U8 | `__tests__/settingsRoundTrip.test.ts` (the `setSettings` describe, `:118`) › `setSettings(uid, { targets })` keeps the stored `idealAllocation` | drop the `existingData` spread |
| U9 | `modelPortfolio.test.ts` › `toModelWeights` with a map WITHOUT the stand-in drops `liquidita`, a property, a money-market fund and a pension fund, renormalizes the rest to 100; `validateModelWeights` refuses a `liquidita` row as not allowed | look the key up in the map |
| U10 | `__tests__/modelPortfolioService.test.ts` (Firestore mocked) › a save writes `modelFingerprint(basis, assets)`; with `keepFingerprint: 'abc12345'` it writes that; with `keepFingerprint: undefined` no `fingerprint` field | always compute |
| R1 | `__tests__/idealCompositionDialog.test.tsx` › «Calcola» → «Salva come portafoglio modello» calls the mutation with `basis`; «Crea un PAC con questi pesi» hands a `PlanSeedDraft` with no `liquidita` position | drop `basis` from the call |
| R2 | same › `runOptimizer` spy: 0 calls while typing the amount, 1 on «Calcola», result cleared on a new keystroke | the PR's `useMemo` |
| R2b | same › accounts 10.000 and amount «12000» → the error «Sui conti hai 10.000 €: l'importo non può superarla.» named by the field's `aria-describedby`, «Calcola» disabled; amount «4000» in «Raggiungibile» → `buildStandaloneCandidates` (spied) receives 4000, in «Ideale» 0 | pass the amount in every mode |
| R3 | same › the dialog's eyebrow «Portafoglio modello» and the status reading are in the header, the buttons in the footer | the PR's title-only modal |
| R4 | `__tests__/portafoglioModelloTile.test.tsx` › a model with a stale fingerprint shows the aside «superato» and the reading starting with `MODEL_STALE_READING`; a fresh one shows neither; «Aggiungi strumento da valutare» on a stale model calls the mutation with `keepFingerprint` equal to the stored one | `isModelStale` always false; drop `keepFingerprint` |
| R5 | `__tests__/obiettiviDialog.test.tsx` › `runOptimizer` spy: 0 calls while editing a criterion, 1 on «Prova», the report cleared by the next edit | the PR's `useMemo` on `tryRequested` |
| R5b | `idealCompositionDialog.test.tsx` › a property under its mortgage: «Calcola» disabled, the reading is `describeNegativeFixed` in the negative tone; accounts under the personal loans: «Calcola» enabled, the reading ends with `NEGATIVE_LIQUIDITY_NOTE` | drop the `negativeFixedKeys` check |
| E1 | `e2e/accumulo.spec.ts` (new, desktop) › «Ricalcola» → «Calcola» → «Salva come portafoglio modello»: the document exists with a fingerprint (read back in the emulator) | the save drops the fingerprint |
| E2 | same › a model planted with `fingerprint: '00000000'` shows «superato» | stale check removed |
| E3 | `e2e/accumulo.mobile.spec.ts` (the PR's, plus) › «Portafoglio modello» is a closed row below the open tile | open it by default |

E1 and E2 fixtures: `e2e/accumuloFixture.ts` gains `plantCriteria()` / `restoreCriteria()` — «Ricalcola» is disabled
until the criteria are on (`PortafoglioModelloTile.tsx:279`) and `test-user-1` has none. In `beforeAll` the spec reads
`assetAllocationTargets/test-user-1`, PATCHes `idealAllocation` `{ enabled: true, classPriority: 'essential',
leveragePriority: 'high', factorObjectives: [], instrumentLimits: [], groupLimits: [] }` with
`updateMask.fieldPaths=idealAllocation`; in `afterAll` it restores the value it read (absent → the field deleted) and
DELETEs `modelPortfolios/test-user-1` (doc/guide/e2e-playwright.md: a spec that edits a document another fixture
writes restores what it read); E2 plants its model through the same REST helper.

The increment's tests rewritten here: `weightOptimizer.test.ts` › the 50-case invariants (`:90-153`) assert U3's
grid instead of «multiples of 0.5»; the `buildStandaloneCandidates` describe (`:559-650`) moves to the new
signature, «leaves a liquidity account out» becomes «the accounts are ONE candidate «Liquidità»» and «does not fix
bounds when B is not > 0» keeps its case with `investEur` 0 and no holdings; `modelPortfolioGroups.test.ts:117`,
`:123` move to `(assets, value, 0, evaluate, groups)`; every fixture of the increment follows NOVE-16's D11 (round
invented figures, generic tickers).

The grep of criterion 11, empty on the branch: `git grep -nE "taxCapEur|lockedKeys|seedDisposalsFromSale" -- lib
components types __tests__`; and NOVE-16 § 6's grep on the lines THIS branch adds (the same command: its pattern
already holds `[ABMR][0-9]`, `D[0-9]{1,2}`, `S[0-9]`), with `|G[0-9]|O4|D-CU[0-9]+|§ ?[0-9]` appended to the pattern.

## 7. Guided verification (WORKFLOW.md § 2)

Expected outcome, declared first: on the seed account the criteria are switched on, «Ricalcola» proposes weights
that sum to 100 with «Liquidità» among the rows, the model is saved, a target changed in Impostazioni turns the tile
«superato», and «Crea un PAC con questi pesi» opens the editor on those weights.

- **A**: `npx tsc --noEmit`, lint, Vitest in three zones, `npx playwright test e2e/accumulo e2e/allocation` in every
  project.
- **B**: emulators + seed + `dev:emulator`; decoys: a property «ornitorinco» created with the role «Bloccato» (the
  form's default for a property is «Escluso», `components/assets/AssetDialog.tsx:1080-1083`, and an excluded
  property leaves the base with its mortgage) and a mortgage «fenicottero» financing it.
- **C (browser)**: 390 and 1440, light and dark: the two tiles, the criteria dialog («Prova» runs, «Salva i
  criteri» writes), the composition dialog's anatomy, the editor's «Ottimizzato» path.
- **D (data)**: `modelPortfolios/<uid>` holds `userId`, `weights` summing to 100, `fingerprint` (8 hex), no
  `liquidita` row; `assetAllocationTargets/<uid>.idealAllocation` survives a save of Impostazioni; the candidates'
  current values sum to `compareAllocations(...).marketValue` on the seed (if not, stop and ask).
- **E (edges)**: «fenicottero» raised above «ornitorinco»'s value → «Calcola» disabled with the sentence; a frozen ETF
  at an odd share → weights in hundredths; caps that cannot reach 100 → the infeasible sentence in the PAC editor's
  «Ottimizzato» path (a plan of three instruments, each capped at 30% in «Criteri del modello»: in the model's
  dialog «Liquidità» always takes the rest); a personal loan above the accounts → the note, the run proceeds; a
  price edited on an asset with goal-driven allocation on → the tile does not turn «superato».
- **F (owner, at «pronto»)**: on the mirror the owner sets his criteria and recalculates his model; then `npm run
  mirror:remove`.
- **G** (the two budgets close by README.md § 8's ONE rule, decisions 33 and 34): `npm run perf:budget` (the routes this spec grows: `/dashboard/allocation` and `/dashboard/settings`); `mobile:census` + `mobile:budget` on `allocazione-accumulo`; stop the servers,
  remove scripts and mirror.

## 8. Putting it into service

One PR to `develop`; the owner publishes the rules before the deploy reaches production:

```
firebase deploy --only firestore:rules
```

Expected «Deploy complete!»; then «Portafoglio modello» on the tab reads its empty sentence. No migration. The owner
closes PR #487 with a link to the merge.

## 9. Documentation

- `doc/guide/ottimizzatore.md` (from the PR, § 4 M14) and its stub in `AGENTS.md` § 3 («Allocazione › Portafoglio
  modello → `doc/guide/ottimizzatore.md`»: the base, the fingerprint).
- `doc/guide/accumulo.md`: the «Ottimizzato» path and `PlanSeedDraft` as the editor's one seed.
- `doc/guide/prima-schermata-misure.md`: the `allocazione-accumulo` `screens` re-measured (two closed rows).
- `doc/guide/impostazioni.md`: «Criteri del modello» read-only on the Allocazione tab, carried through
  `composeSettingsDocument`.
- `CLAUDE.md` › the Allocazione line («portafoglio modello»), «Latest»; `Draft Release Temp.md`.

## 10. Declared out of scope

- **«Con vendite mirate»** (a sale under a tax cap): heir NOVE-18.
- **The Consulente's hand-off** («Crea un piano di accumulo verso questa allocazione», `runOptimizer` +
  `PlanSeedDraft`): heir NOVE-21.
- **The Consulente reading the model or its criteria**: none, declared (choice i).

## 11. The prompt that implements it

```
Ciao, in questa sessione vorrei implementare la spec doc/nove/NOVE-17-portafoglio-modello.md

Contesto, prima di toccare qualsiasi file (le regole del repo cambiano il modo di lavorare):
- Leggi WORKFLOW.md (regole di sessione e di collaudo; l'ultima sezione dice come si
  applicano in questo repo)
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- CLAUDE.md (l'indice: che cos'è e dove sta ogni cosa, lo stato corrente) è già nel
  contesto: usalo per trovare la guida giusta
- Leggi la spec doc/nove/NOVE-17-portafoglio-modello.md e l'indice della serie
  doc/nove/README.md (§ 3 decisioni, § 4 scelte adottate, § 7 contratti condivisi, § 8 regole)
- Leggi doc/guide/allocazione.md, doc/guide/accumulo.md, doc/guide/impostazioni.md,
  doc/guide/velocita.md, doc/guide/prima-schermata.md, doc/guide/prima-schermata-misure.md,
  doc/guide/e2e-emulatori.md e
  doc/guide/e2e-playwright.md PRIMA di scrivere codice in quei domini
- Leggi DESIGN.md (The Modal-Is-A-Tile Rule, Small-Screen Composition) e PRODUCT.md
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

Implementa la spec così com'è scritta: l'incremento della PR #487 entra con il cherry-pick
della § 4 su un branch nuovo da develop (dopo NOVE-16), poi le correzioni M1-M14 e
l'impronta «superato». I test PRIMA del codice, ciascuno visto rosso con la sua mutazione;
cifre inventate e tonde. Fermati e chiedimi se: perf:budget, misurato prima e dopo sulla stessa macchina, supera un tetto di più di 1 KB gz (fino a 1 KB lo alzi tu, con raisedBy e una riga in velocita.md § Registro), la somma dei candidati della
§ 4 non torna alla base della pagina sul seed, un conflitto del cherry-pick tocca un file
che la lista della § 4 non nomina, nel confronto con develop dello stesso giorno, stessa build, si muove una voce di mobile:budget che la spec non nomina (screens di allocazione-accumulo è la voce nominata: la riregistri con raisedBy). Collaudo: § 7, la F sul mirror al mio «pronto»; la regola Firestore
la pubblico io (§ 8). Un branch, un commit con il trailer Co-authored-by della § 3, solo
dopo il mio OK con il riassunto del diff. SESSION_NOTES.md non si committa.
```

Model: **Opus 5.5**, effort **medium** — an L spec: a 7 000-line increment with a numerical engine, a new collection
and rule, a shared contract (`runOptimizer`, `PlanSeedDraft`, `modelFingerprint`) and two bundles to hold. Estimated
size: 1 long session, ~8 h (decision 35: one branch, one commit; resumed on the same branch, without committing, when the context runs out); ~500 lines changed over the PR, ~20 tests.
