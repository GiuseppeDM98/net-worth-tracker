# NOVE-16 — Allocazione › Accumulo: the PAC tab of PR #486, brought in with changes

> Series `doc/nove/` (README.md § 5): **depends on NOVE-02** (the Piano cell it rebases on); **NOVE-17, NOVE-18 and
> NOVE-21 are implemented after it** (they read the editor, the plan document and the active-plan reader defined
> here). Written on 2026-11-12; every `file:line` is cited on `develop` @ b841cbd7, a PR line as `pr486:file:line` on
> the local ref `refs/tmp/pr486` (head d1e2666d). Executes decisions 24, 25, 30 and the adopted choices f, g, l, o,
> p, s, u, v (README.md § 3-4).

## 1. The problem today (evidence on the code)

**develop has no plan of accumulation.** `app/dashboard/allocation/page.tsx` (710 lines) renders one surface, no tab
bar (main return `:552`, `<PianoTile` `:643`, `<AllocazioneDettaglio` `:707`); `firestore.rules` has no
`accumulationPlans`; the Consulente's «Applica» (`components/allocation/consulente/ConsulenteBookPages.tsx:270-308`)
knows nothing of a running plan; the AI's STRUMENTI block skips every asset at quantity 0
(`lib/utils/assistantPortfolioContext.ts:303-304`), so an instrument created for a plan and not yet bought is
invisible to the Consulente; `findAssetByName` (`lib/utils/allocationAdviceApply.ts:30-53`) returns the FIRST match.

**PR #486** (contributor Ciocc128; one commit d1e2666d on 54634a9 of 2026-10-21; 54 files, +12 016 / −98; 52
commits behind develop) adds the «Accumulo» tab: monthly instalments toward chosen weights, a three-step editor
(`pr486:components/allocation/AccumulationPlanDialog.tsx`), the calendar, the ledger matching
(`pr486:lib/utils/accumulationPlanMatching.ts:72`), four tiles, the phone composition, three E2E specs. The
page-side files it changes have NOT moved on develop since 54634a9 (`page.tsx`, `allocazioneNarrative.ts`,
`allocazioneSummary.ts`, `queryKeys.ts`, `perf/mobile-budget.json`, `scripts/seedCensusE2E.mts`); develop moved
`firestore.rules`, `types/assets.ts`, `AssetDialog`/`TransactionDialog` (one line each), `perf/budget.json`.

Defects of the PR, each cured in § 4:

- **D1 — the whole PAC in the initial graph**: `pr486:app/dashboard/allocation/page.tsx:162` imports `AccumuloTab`
  statically; `perf/budget.json:12` holds the route at 605 KB gz, measured 604,8.
- **D2 — the Bilanciamento verdict changes with a plan** (against decision 24): `pacClause`
  (`pr486:lib/utils/allocazioneNarrative.ts:186`) replaces the next-money clause at `:271`, fed at `pr486:page.tsx:500`.
- **D3 — a plan not started yet reads as running**: `findOpenInstallment` clamps index 0 to 1
  (`pr486:lib/utils/accumuloSummary.ts:41-44`), `summarizePacMonth` (`:51-63`) has no guard: a plan starting next
  month says «compra questo mese» in the Piano and «Rata di <next month>» as the tab's verdict.
- **D4 — loans and properties in «+ Aggiungi»**: `listAddableAssets` (`pr486:lib/utils/accumulationPlanUtils.ts:1282`)
  keeps `resolveAllocationRole(asset) === 'tradable'`, true for a loan or property with no role; the editor repeats
  it (`pr486:components/allocation/AccumulationPlanDialog.tsx:331-339`).
- **D5 — «one open plan» is not atomic**: `createDraftPlan` reads the plans outside any transaction
  (`pr486:lib/services/accumulationPlanService.ts:158`), then `addDoc`s (`:179`); `reactivatePlan` likewise (`:492`).
- **D6 — money not in cents**: `pr486:lib/utils/accumulationPlanUtils.ts:271` (`plannedAmountEur: spend`), `:314`,
  `:320` (`residualEur = pool`), `:423` (`quantity * priceEur`), `:995`; no `roundToCents` in any PR file.
- **D7 — the suggested instalment is annual savings / 12** (against decision 30):
  `pr486:lib/utils/accumulationNarrative.ts:1129-1138` over `pr486:lib/hooks/useAnnualCashflow.ts`, read
  unconditionally by `pr486:components/allocation/tiles/AccumuloVuotoTile.tsx:54`.
- **D8 — sentences in a component**: `pr486:components/allocation/PlanDraftSidePanel.tsx:45`, `:85`.
- **D9 — the fork's documents in the code**: 40 added lines in 21 files cite fork-only files (`pac-ate`,
  `pac-ottimizzatore`, `render-accumulo`, `contributi-upstream`, `fork-scelte`, «PR #4») and section codes (AL10,
  RV2, RP7, D12, S1…); `pr486:doc/guide/accumulo.md:14` names `buildPlan` and `matchLedger`, which do not exist.
- **D10 — census entries measured on the contributor's machine**: `pr486:perf/mobile-budget.json:704-730`.

## 2. Goal and acceptance criteria

1. `/dashboard/allocation` has the tabs «Bilanciamento» (default) and «Accumulo»; `?tab=accumulo` lands on it; a tab
   change rewrites the URL with `router.replace`. **Proof**: E1, E2.
2. The tab's code is not in the initial graph; `perf:budget` for the route ≤ 605 KB gz. **Proof**: § 7 G, E3.
3. With an active plan the Bilanciamento verdict is identical to the one without; the Piano shows one note with the
   button «Apri Accumulo». **Proof**: U1, E4.
4. A plan whose first month is in the future: no Piano note; the tab's headline «Il piano parte a {mese}: prima rata
   di {X} in {n} acquisti.». **Proof**: U2, U3, E5.
5. «+ Aggiungi» and the editor's list never offer a loan, a property, an account or a non-tradable asset (role
   resolved WITH the financed asset). **Proof**: U4.
6. At most one plan in `draft` or `active` per account, enforced in a transaction on `accumulationPlanLocks/{ownerUid}`;
   two concurrent creations leave one plan. **Proof**: U5, § 7 D.
7. Every euro amount the plan writes is rounded to the cent. **Proof**: U6.
8. The suggested instalment is the median of the last twelve full months' savings (`buildCashflowBlock`), floored to
   the ten; none under three months; the expenses are read only while the editor's first step or the empty tile is
   on screen. **Proof**: U7, R1.
9. «+ Nuovo asset» creates the asset at quantity 0 with no opening trade (decision 25). **Proof**: R2.
10. STRUMENTI prints a quantity-0 asset with no ledger row as «0 quote, mai comprato»; `findAssetByName` prefers
    quantity > 0; the system prompt stays identical across users. **Proof**: U8, U9, U10.
11. With an active plan the Consulente's «Applica» page shows one line about it. **Proof**: R3.
12. A plan ending after the «rivedi entro» date carries a note in «Questo mese» and in the editor's preview.
    **Proof**: U11.
13. No fork reference or section code in the code; every sentence in a `*Narrative.ts`. **Proof**: the § 6 grep.
14. Phone: verdict cut at the first sentence, strip, «Questo mese» open; `mobile:budget` green on `allocazione` and
    `allocazione-accumulo`, re-measured here. **Proof**: E6, § 7 G.
15. The mirror owns the two new collections. **Proof**: U12.

## 3. Decisions

- **Owner 24 (2026-11-12)**: with an active plan the Bilanciamento verdict does NOT change; only a note in the Piano.
- **Owner 25 (2026-11-12)**: «+ Nuovo asset» creates a real asset at quantity 0, without an opening trade.
- **Owner 30 (2026-11-12)**: the suggested instalment is the MEDIAN of the last twelve months' savings.
- **Adopted (README § 4)**: f, g, l, o, p, s, u, v.
- **Adopted, reversible (this spec)**:
  - A1. The PR enters by `git cherry-pick --no-commit d1e2666d` on a fresh branch; credit `Co-authored-by: Giorgio
    Trentadue <148712309+Ciocc128@users.noreply.github.com>`, the address already in the repo's history (the PR
    commit's author line is `Claude <noreply@anthropic.com>`, not the contributor).
  - A2. The one-open-plan invariant is a lock document `accumulationPlanLocks/{ownerUid}` `{ userId, openPlanId:
    string | null, updatedAt }`, written in the same transaction as the plan.
  - A3. An active plan before its first month is the verdict state `scheduled`, with no strip.
  - A4. The Piano note reads through small modules so the page imports none of the editor.
  - A5. «Mai comprato» = `quantity ≤ 0` AND no ledger row names the asset.
  - A6. «+ Aggiungi» keeps the PR's exclusion of `assetClass === 'cash'` (money-market funds out).
  - A7. The lazy fallback is the PR's own loading branch (`pr486:components/allocation/AccumuloTab.tsx:163-173`).
- **Overturned**: nothing of develop; of the PR, `pacClause` and annual / 12 (decisions 24, 30).

## 4. Solution

### Bringing the PR in

```
git fetch origin pull/486/head:refs/tmp/pr486      # only if the local ref is gone
git switch develop && git pull && git switch -c feat/accumulo
git cherry-pick --no-commit d1e2666d
```

Conflicts: `firestore.rules` (develop's blocks + the PR's `accumulationPlans` block + the lock block below),
`types/assets.ts` (keep `isCashAccount`), `AssetDialog.tsx` / `TransactionDialog.tsx` (keep `autoComplete="off"`),
`perf/budget.json` (develop's), the Piano cell of `page.tsx` (NOVE-02's: no `desktop:self-start`).

### The page (`app/dashboard/allocation/page.tsx`)

- D1, at module level, types only imported from the tab's module (AGENTS.md § Dynamic Imports):

```tsx
const AccumuloTab = lazyComponent(
  () => import('@/components/allocation/AccumuloTab').then((m) => m.AccumuloTab),
  { fallback: <AccumuloTabSkeleton /> },
);
const ACCUMULO_LAZY = [AccumuloTab];
// in the component, beside the page's other hooks:
usePreloadWhenIdle(ACCUMULO_LAZY, hasAssets && !!composed);
```

  `AccumuloTabSkeleton` moves to `components/allocation/AccumuloTabSkeleton.tsx` (A7); the tab's loading branch
  renders it too.
- D2: `pac` leaves `buildAllocazioneVerdict`'s input and dependency list; `PacVerdictInput` (moved to
  `types/accumulationPlan.ts`), `pacClause` and the input field go from `allocazioneNarrative.ts`.
  `describePacOverlap`, `findPacSubstitutions`, `listPlanBuyAssetIds` and PianoTile's `pacNote` stay as written.
- The tab receives `reviewByIso={reviewDue.state === 'none' ? null : reviewDue.reviewByIso}` (`:187`).

### The slim read path (A4) — code moved from the PR

- `lib/utils/planMonths.ts`: `toMonthKey`, `addMonths`, `monthIndexOf` moved verbatim from
  `pr486:lib/utils/accumulationPlanUtils.ts:31-59`, re-exported there.
- `lib/utils/accumulationPlanDoc.ts` (no `db`, no write API; `toDate` from `dateHelpers`, already read by
  `lib/server`): `ACCUMULATION_PLANS_COLLECTION = 'accumulationPlans'`, `ACCUMULATION_PLAN_LOCKS_COLLECTION =
  'accumulationPlanLocks'`, `docToAccumulationPlan(id, data)` with its four private converters (from the service),
  `selectOpenPlan(plans)` (from the hook file), and:

```ts
/** The plan a lock still holds open, or null when the lock is free or points at a closed plan. */
export function openPlanHeldBy(
  lockOpenPlanId: string | null | undefined,
  pointedStatus: AccumulationPlanStatus | null,
): string | null {
  if (!lockOpenPlanId) return null;
  return pointedStatus === 'draft' || pointedStatus === 'active' ? lockOpenPlanId : null;
}
```

- `lib/services/accumulationPlanRead.ts`: `getAccumulationPlans(ownerId)` (keeps `where('userId', '==', ownerId)`).
  `lib/hooks/useAccumulationPlans.ts`: `useAccumulationPlans`, re-exporting `selectOpenPlan`; `useOpenAccumuloPlan.ts`
  imports these and `planMonths`. The mutation hooks stay in `useAccumulationPlan.ts`.
- `lib/utils/accumuloMonth.ts`: `isPlanDone`, `findOpenInstallment` (clamp kept: the tab previews instalment 1 of a
  scheduled plan, the last one after the end), `summarizePacMonth` moved from `accumuloSummary.ts` (re-exported)
  with, after its status check, `if (currentIndex < 1 || currentIndex > plan.months) return null;` (before the
  first month nothing is bought «questo mese»; after the last the tab owns the late lines) and `monthTotalEur`
  through `roundToCents`; plus:

```ts
/** The plan's last month is after the Consulente's review date (2026-11-12). */
export function planEndsAfterReview(
  plan: Pick<AccumulationPlan, 'startMonth' | 'months'>,
  reviewByIso: string | null,
): boolean {
  if (!reviewByIso) return false;
  return addMonths(plan.startMonth, plan.months - 1) > reviewByIso.slice(0, 7);
}

export interface OpenPlanForAdvice {
  monthIndex: number;      // k: 1..months; 0 before the first month
  months: number;          // N
  instalmentEur: number;   // the month's lines not skipped (the first instalment before the start), in cents
  startMonth: MonthKey;
  endMonth: MonthKey;
  buys: Array<{ assetId: string; name: string; targetPercentage: number }>;
  sells: Array<{ assetId: string; name: string; quantity: number | null; monthIndex: number | null;
    status: PlanDisposal['status'] }>;
}

/** What a reader outside the tab may know of the active plan; null unless one is active. */
export function describeOpenPlanForAdvice(
  plan: AccumulationPlan | undefined,
  monthKey: MonthKey,
  nameOf: (assetId: string) => string,
): OpenPlanForAdvice | null {
  if (!plan || plan.status !== 'active') return null;
  const k = Math.min(monthIndexOf(plan, monthKey), plan.months);
  const lines = (findOpenInstallment(plan, Math.max(k, 1))?.lines ?? []).filter((l) => l.status !== 'skipped');
  const amountOf = (l: InstallmentLine) =>
    l.status === 'executed' ? (l.executedAmountEur ?? l.plannedAmountEur) : l.plannedAmountEur;
  return {
    monthIndex: k,
    months: plan.months,
    instalmentEur: roundToCents(lines.reduce((sum, l) => sum + amountOf(l), 0)),
    startMonth: plan.startMonth,
    endMonth: addMonths(plan.startMonth, plan.months - 1),
    buys: plan.positions.map((p) => ({ assetId: p.buyAssetId, name: nameOf(p.buyAssetId),
      targetPercentage: p.targetPercentage })),
    sells: plan.disposals.map((d) => ({ assetId: d.assetId, name: nameOf(d.assetId), quantity: d.quantity ?? null,
      monthIndex: d.monthIndex ?? null, status: d.status })),
  };
}
```

### The tab's verdict (D3, A3)

`AccumuloVerdictInput` gains `{ state: 'scheduled'; startMonth: MonthKey; firstInstalmentEur: number; lineCount:
number; months: number }`. In `resolveAccumuloVerdictInput`, right after the `done` check:

```ts
  if (currentIndex < 1) {
    const lines = (plan.installments.find((i) => i.index === 1)?.lines ?? []).filter((l) => l.plannedQuantity > 0);
    return { state: 'scheduled', startMonth: plan.startMonth, months: plan.months, lineCount: lines.length,
      firstInstalmentEur: roundToCents(lines.reduce((sum, l) => sum + l.plannedAmountEur, 0)) };
  }
```

`describeAccumuloVerdict`: headline «Il piano parte a {monthLabelLong(startMonth, false)}: prima rata di {€} in {n}
{acquisto|acquisti}.», sentence «{N} {rata|rate}; fino ad allora non c'è nulla da comprare.», tone `neutral`, no cut;
`selectAccumuloStrip` returns `[]` for it.

### «+ Aggiungi» (D4, choice o)

`listAddableAssets` (`pr486:lib/utils/accumulationPlanUtils.ts:1272-1290`) and the editor's `candidateAssets` call
one predicate:

```ts
/** An asset a plan may buy: a tradable instrument, never an account, a loan or a property (2026-11-12). */
export function isPlanBuyable(asset: Asset, allAssets: readonly Asset[]): boolean {
  if (asset.type === 'cash' || asset.assetClass === 'cash') return false;
  if (isLoanAsset(asset) || asset.type === 'realestate') return false;
  return resolveAllocationRoleWithin(asset, allAssets) === 'tradable';
}
```

### The lock (D5, A2) — `lib/services/accumulationPlanService.ts`

```ts
export async function createDraftPlan(ownerId: string, draft: AccumulationPlanDraft): Promise<string> {
  accumulationPlanDraftSchema.parse(draft);
  const lockRef = doc(db, ACCUMULATION_PLAN_LOCKS_COLLECTION, ownerId);
  const planRef = doc(collection(db, ACCUMULATION_PLANS_COLLECTION));
  await runTransaction(db, async (tx) => {
    const lock = await tx.get(lockRef);
    const heldId = lock.exists() ? ((lock.data().openPlanId as string | null) ?? null) : null;
    const held = heldId ? await tx.get(doc(db, ACCUMULATION_PLANS_COLLECTION, heldId)) : null;
    const heldStatus = held?.exists() ? (held.data().status as AccumulationPlanStatus) : null;
    if (openPlanHeldBy(heldId, heldStatus)) throw userFacingError(ACCUMULO_ONE_OPEN_PLAN);
    const now = new Date();
    tx.set(planRef, removeUndefinedDeep({ userId: ownerId, name: draft.name, status: 'draft',
      startMonth: draft.startMonth, months: draft.months, liquidity: draft.liquidity, positions: draft.positions,
      disposals: draft.disposals, installments: [], createdAt: now, updatedAt: now }));
    tx.set(lockRef, { userId: ownerId, openPlanId: planRef.id, updatedAt: now });
  });
  return planRef.id;
}
```

`closePlan(ownerId, planId, status)` and `deleteDraftPlan(ownerId, planId)` become transactions reading the plan and
the lock, then writing the plan and `{ userId, openPlanId: null, updatedAt }` when the lock points at `planId`.
`reactivatePlan(ownerId, planId, today)` reads plan, lock and the plan the lock names (when not `planId`), refuses
with `ACCUMULO_REACTIVATE_REFUSED` when `openPlanHeldBy` names another plan or `canReactivatePlan(plan, [], today)`
is false, then writes plan and lock. The pre-reads at `:158` and `:492` go; the hooks pass `ownerId`.
`ACCUMULO_ONE_OPEN_PLAN` is the PR's sentence (`:160`) moved into `accumulationNarrative.ts`.

`firestore.rules`, beside the PR's `accumulationPlans` block:

```
    // Lock del piano di accumulo aperto (doc id = ownerUid): un solo piano in bozza o attivo per account
    match /accumulationPlanLocks/{ownerUid} {
      allow read: if canAccess(ownerUid);
      allow create, update: if canAccess(ownerUid) && request.resource.data.userId == ownerUid;
      allow delete: if canAccess(ownerUid);
    }
```

Mirror and seeds: `scripts/mirrorCollections.ts` appends `'accumulationPlans'` to `USER_COLLECTIONS`,
`'accumulationPlanLocks'` to `PER_USER_DOCS`; `scripts/seedCensusE2E.mts:76-77` the same in its local lists, and its
`seedAccumulationPlan()` writes `accumulationPlanLocks/{UID}` `{ userId: UID, openPlanId: 'census-accumulo-plan' }`;
`e2e/accumuloFixture.ts` writes and removes the lock with `openPlanId: 'e2e-accumulo-plan'`.

### Money in cents (D6)

`scheduleInstallments`: `plannedAmountEur: roundToCents(spend)` (`:271`), `line.plannedAmountEur =
roundToCents(line.plannedAmountEur + picked.buyPriceEur)` (`:314`), `residualEur = roundToCents(pool)` (`:320`),
every `carryInEur` value; `buildRegisteredLinePatch`: `roundToCents(quantity * priceEur)` (`:423`);
`proceedsOfDisposal` returns `roundToCents(...)` (`:102`).

### The suggested instalment (D7, decision 30)

`pr486:lib/hooks/useAnnualCashflow.ts` is deleted. New `lib/hooks/useMonthlySavingsMedian.ts`:

```ts
'use client';
/** undefined = still reading; null = fewer than CASHFLOW_BLOCK_MIN_MEDIAN_MONTHS months of data. */
export function useMonthlySavingsMedian(
  ownerId: string,
  assets: Asset[],
  options: { enabled: boolean },
): number | null | undefined {
  // The mount's clock: the window and the block's «today» never drift inside one editor session.
  const [readAt] = useState(() => new Date());
  const settingsQuery = useSettings(ownerId);
  const expensesQuery = useExpensesInRange(ownerId, fireWindows(readAt, null).recent, { enabled: options.enabled });
  if (!options.enabled || !expensesQuery.data || settingsQuery.data === undefined) return undefined;
  const block = buildCashflowBlock(expensesQuery.data, { todayIso: getItalyDateIso(readAt), categories: [], assets,
    settings: settingsQuery.data ?? null, assetValueOf: calculateAssetValue });
  return block.volatility?.savings.median ?? null;
}
```

Callers: the editor with `enabled: open && step === 1`, `AccumuloVuotoTile` with `enabled: true`. In
`accumulationNarrative.ts`:

```ts
export function suggestMonthlyInflow(medianEur: number | null | undefined): number | null {
  if (medianEur === null || medianEur === undefined || medianEur <= 0) return null;
  return Math.floor(medianEur / 10) * 10;
}
export function describeSuggestedInflow(suggestedEur: number): string {
  return `Il tuo risparmio mensile mediano degli ultimi 12 mesi è di ${cachedFormatCurrencyEUR(suggestedEur, true)}.`;
}
```

### The Assistente and the Consulente (choices u, p)

- `buildHoldingRows` (`lib/utils/assistantPortfolioContext.ts:292`) takes `tradedAssetIds: ReadonlySet<string>`
  (built at `:648` from `transactions.map((t) => t.assetId)`); the skip at `:303` becomes `if (!(asset.quantity > 0)
  && !isLoanAsset(asset) && tradedAssetIds.has(asset.id)) continue;` and a kept quantity-0 row carries `neverBought:
  true` (`AssistantHoldingRow` gains `neverBought?: true`). `selectBondHoldings` already drops it (`valueEur > 0`,
  `lib/utils/allocationAdviceBonds.ts:35`).
- `formatPortfolioForPrompt` (`lib/server/assistant/prompts.ts:279`): the quantity part becomes `row.neverBought ?
  `0 ${quantityUnit(row.type)}, mai comprato` : `${quantity(row.quantity)} ${quantityUnit(row.type)}``.
- `prompts.ts:732`, the sentence's end — BEFORE: «Uno strumento che l'utente nomina e che non compare non è in
  portafoglio.» AFTER: «Uno strumento che l'utente nomina e che non compare non è in portafoglio. Una riga «0 quote,
  mai comprato» è uno strumento già creato e mai acquistato: non è posseduto, ma per proporlo usa quel nome.»
- `findAssetByName`: `byName` and `byPrinted` search `pool` instead of `assets`; the ticker step prefers a held one.

```ts
  const pool = [...assets.filter((a) => a.quantity > 0), ...assets.filter((a) => !(a.quantity > 0))];
  // …
  const byTicker = assets.filter((asset) => named(asset, wanted));
  if (byTicker.length === 1) return byTicker[0];
  const heldByTicker = byTicker.filter((asset) => asset.quantity > 0);
  return heldByTicker.length === 1 ? heldByTicker[0] : null;
```

- «Applica»: `ApplyPiecesInput` (`ConsulenteBookPages.tsx:251`) gains `activePlanNote: string | null`, rendered after
  the goals' notes as `<p className="text-[12px] text-warning-foreground">`; `ConsulenteReport.tsx` reads
  `useAccumulationPlans(ownerId)` and passes `selectOpenPlan(data)?.status === 'active' ? APPLY_ACTIVE_PLAN_NOTE :
  null`. `lib/utils/allocationAdviceNarrative.ts`: `APPLY_ACTIVE_PLAN_NOTE` = «Hai un piano di accumulo attivo: i
  nuovi target non lo cambiano. Rivedilo in Allocazione › Accumulo.»

### The review date (choice v) and the clean-up (D8, D9)

- `AccumuloTab` takes `reviewByIso: string | null`; «Questo mese» and `PlanDraftSidePanel` show, when
  `planEndsAfterReview(plan, reviewByIso)`, `describePlanPastReview(reviewByIso)` = «Il piano finisce dopo la
  revisione dell'allocazione ({formatDate}): rivedilo quando rivedi i target.»
- `PlanDraftSidePanel.tsx:45` and `:85` → `PLAN_PREVIEW_EMPTY` and `describeWeightsSum(weightsSum)` in
  `accumulationNarrative.ts`. Every fork reference and section code goes from comments, test names and identifiers; a
  comment that carried only a code keeps its sentence with its date; `__tests__/accumuloA4.test.ts` (a fork code in
  a file name) becomes `__tests__/accumuloTileSentences.test.ts`. `doc/guide/accumulo.md:14` names
  `scheduleInstallments` and `matchPlanExecutions`.

### Phone composition (the PR's, kept)

Below `desktop:`: the verdict cut at the first sentence, the strip («Rata di {mese}» → «Questo mese», «Investito» →
«Classi del piano», the class farthest from its band → «Il perché»), «Questo mese» open, «Il resto della pagina»
with «Classi del piano» and «Piani conclusi»; memory `mobile-sections:allocation:accumulo`.

## 5. Constraints and traps (AGENTS.md / DESIGN.md, «here it means that»)

- **A lazy tab's fallback is the tab's own loading state** (AGENTS.md § Dynamic Imports): here it means A7's
  skeleton, the same the tab renders while the plans load.
- **`runTransaction`: all `tx.get()` before any write**: here it means lock, pointed plan and plan are read first in
  each of the four transactions; a client transaction cannot query, which is why the lock exists.
- **A `list` must carry `userId`**: `getAccumulationPlans` keeps its `where`; the rules are proven only by the
  emulator exercise of § 7 D, never by a mocked unit test.
- **The rules are published by hand by the owner** (choice g): § 8 gives the command.
- **THE RULE of the roles** (AGENTS.md § Allocazione): `resolveAllocationRoleWithin` wherever a loan can reach.
- **The React Compiler**: no `try/finally` or `throw` in a component; the services throw, the mutation hooks call.
- **The system prompt is byte-identical across users**: the new sentence is a constant of `ASSISTANT_SYSTEM_CORE`
  (`prompts.ts:687`); the «mai comprato» rows sit in the user content.
- **The Absence-Has-Three-Names Rule**: under three months there is no suggestion and no sentence, never «0 €».
- **The First-Screen Rule, one DOM sequence, no `order-*`**: asserted by the PR's phone spec (E6), kept.

## 6. Tests per level (with the mutation that proves each)

| # | Test | Mutation that turns it red |
| --- | --- | --- |
| U1 | `__tests__/allocazioneNarrative.test.ts` › `buildAllocazioneVerdict` has no plan input; output unchanged | put `pac` and its clause back at `:271` |
| U2 | `__tests__/accumuloMonth.test.ts` › `summarizePacMonth` null at index 0 and at months + 1, a summary at 1 and at months | drop the `currentIndex < 1` guard |
| U3 | `__tests__/accumuloSummary.test.ts` › index 0 gives `scheduled`, first instalment in cents; the headline | return `active` for index 0 |
| U4 | `__tests__/accumulationPlanUtils.test.ts` › `isPlanBuyable`: loan, property, account, money-market fund, frozen ETF out; tradable ETF in | `resolveAllocationRole`, or drop `isLoanAsset` |
| U5 | `__tests__/accumulationPlanDoc.test.ts` › `openPlanHeldBy`: null lock, lock on a draft, an active, a completed plan | treat `completed` as held |
| U6 | `accumulationPlanUtils.test.ts` › prices of 33,333 €: every `plannedAmountEur`, `residualEur`, `executedAmountEur` ≤ 2 decimals | remove one `roundToCents` |
| U7 | `__tests__/accumulationNarrative.test.ts` › `suggestMonthlyInflow(1234.56)` = 1230; null → null; −50 → null | annual / 12 back |
| U8 | `__tests__/assistantPortfolioContext.test.ts` › quantity 0 and no trade → a `neverBought` row; the SOLD fixture (`:112`, `:192`) still left out | drop the `tradedAssetIds` condition |
| U9 | `__tests__/allocationAdviceApply.test.ts` › two «Alfa», the held one wins; two tickers, one held → it | search `assets` instead of `pool` |
| U10 | `__tests__/assistantPromptBundle.test.ts` › the «0 quote, mai comprato» row in the user content; `expect(a.system).toBe(b.system)` with and without it | print the row count in the system |
| U11 | `accumuloMonth.test.ts` › `planEndsAfterReview`: 2027-01 × 12, review 2027-06-30 → true; 2028-01-15 → false; null → false | compare `startMonth` instead of the end |
| U12 | `__tests__/mirrorCollections.test.ts` (unchanged) | drop `'accumulationPlanLocks'` from `PER_USER_DOCS` |
| R1 | `__tests__/AccumuloVuotoTile.test.tsx` › a median of 1200 names 1.200 €; null renders no sentence | print 0 € for null |
| R2 | `__tests__/assetDialogCreateEmpty.test.tsx` (new) › `createEmpty`: `createAsset` with `quantity: 0`, no transaction | send the form's quantity |
| R3 | `__tests__/consulenteBook.test.tsx` › `applyPieces` renders `APPLY_ACTIVE_PLAN_NOTE` only when passed | always render it |
| E1-E2 | `e2e/allocation.spec.ts` (the PR's two tests) › the tab in the URL; Accumulo without a plan at 1440 | drop `router.replace` |
| E3 | `e2e/bundle.lazy.mobile.spec.ts` › `?tab=accumulo` lands in place (`expectAccumuloTabLandsInPlace` in `e2e/lazyTabLanding.ts`, on the model of `:56`) | import the tab statically |
| E4 | `e2e/allocation.spec.ts` › with the fixture's plan the Bilanciamento headline equals the one without; «Apri Accumulo» opens the tab | restore `pacClause` |
| E5 | `e2e/allocation.spec.ts` › a plan planted with `startMonth` next month: no Piano note; headline «Il piano parte a» | remove the D3 guard |
| E6 | `e2e/accumulo.mobile.spec.ts`, `e2e/accumulo.tablet.spec.ts` (the PR's nine tests, cleaned) | an `order-*` on «Questo mese» |

The grep of criterion 13, both empty on the branch:

```
git grep -nE "pac-ate|pac-ottimizzatore|render-accumulo|contributi-upstream|fork-scelte|PR #4\b" -- \
  components lib e2e __tests__ types
git grep -nwE "(AL|RV|RP|PO|PP|RM|PZ|RO|D-AL)[0-9]+|D1[0-2]|S1" -- components lib e2e __tests__ types
```

## 7. Guided verification (WORKFLOW.md § 2)

Expected outcome, declared first: on the seed account the tab opens from the URL, a plan is drafted with two
instruments and a suggested instalment, activated, and the Bilanciamento verdict reads the same before and after; a
second draft from another tab is refused; the AI context prints the instrument created at 0.

- **A**: `npx tsc --noEmit`, lint, Vitest in three zones (machine, `TZ=Europe/Rome`, `TZ=UTC`), `npx playwright
  test e2e/allocation e2e/accumulo e2e/bundle.lazy` in every project.
- **B**: emulators + `emulators:seed` + `dev:emulator`; decoys: an ETF «ornitorinco» created at 0 with «+ Nuovo
  asset», a loan «fenicottero» financing a property.
- **C (browser)**: 390, 768×1024, 1024×768, 1440, light and dark: the tab, the empty tile, the editor's three steps,
  the calendar; «fenicottero» and its property absent from «+ Aggiungi».
- **D (data)**: after activation `accumulationPlans/<id>` is `active`, every amount ≤ 2 decimals,
  `accumulationPlanLocks/<uid>.openPlanId` = the id. A scratchpad client-SDK script run from inside the repo
  (AGENTS.md § Emulator Exercise Scripts) fires two `createDraftPlan` at once: one id, one refusal.
- **E (edges)**: a plan with `startMonth` next month («parte a», no Piano note); close it and create another (the lock
  frees); «Riattiva» refused while another plan is open.
- **F (owner, at «pronto»)**: the mirror (`npm run mirror:seed -- <email>`); the owner drafts a plan on his data; the
  «Applica» page of an existing Consulente document shows the line (no run is launched). `npm run mirror:remove`.
- **G**: `npm run perf:budget` (≤ 605 KB gz on the route; above, stop and ask the owner with the measure — a raised
  ceiling needs his OK and a line in doc/guide/velocita.md § Registro); `npm run mobile:census --
  --email=census@example.com` + `npm run mobile:budget` on the :3200 build, `allocazione-accumulo` replaced by this
  machine's measure, `allocazione` unchanged; stop the servers, remove scripts and mirror.

## 8. Putting it into service

One PR to `develop`; the owner publishes the rules BEFORE the deploy reaches production:

```
firebase deploy --only firestore:rules
```

Expected «Deploy complete!»; then the tab with no plan reads «Nessun piano di accumulo aperto.». No migration: no
plan exists in production. The owner closes PR #486 with a link to the merge.

## 9. Documentation

- `doc/guide/accumulo.md` (from the PR): § Files gains the slim modules and the lock; the rules «Un solo piano aperto
  per account: il lock `accumulationPlanLocks/{ownerUid}`, nella stessa transazione del piano (2026-11-12)», «Un piano
  non ancora partito: verdetto `scheduled`, nessuna nota nel Piano», the instalment (decision 30); `:14` corrected.
- `doc/guide/allocazione.md`: the tab bar; «con un piano attivo il verdetto di Bilanciamento non cambia: solo la nota
  nel Piano (proprietario, 2026-11-12)». `doc/guide/consulente.md` § «Applica»: the line; `doc/guide/assistente.md`:
  the «mai comprato» rows and `findAssetByName`'s preference.
- `AGENTS.md` § 3: the stub «Allocazione › Accumulo → `doc/guide/accumulo.md`» (the lock, the slim path).
- `CLAUDE.md` › Key Features (Allocazione line) and «Latest»; `Draft Release Temp.md`; the `allocazione-accumulo`
  baseline in `doc/guide/prima-schermata-misure.md`.

## 10. Declared out of scope

- **The model portfolio, the optimizer, «Criteri del modello»**: heir NOVE-17.
- **Targeted sales under a tax cap**: heir NOVE-18.
- **The Consulente's hand-off to a plan and its reading of the active plan** (`describeOpenPlanForAdvice` is defined
  here, read there): heir NOVE-21.
- **A plan on an account with no assets** (the empty branches `page.tsx:512-546` have no tab bar): none, declared.

## 11. The prompt that implements it

```
Ciao, in questa sessione vorrei implementare la spec doc/nove/NOVE-16-accumulo.md

Contesto, prima di toccare qualsiasi file (le regole del repo cambiano il modo di lavorare):
- Leggi WORKFLOW.md (regole di sessione e di collaudo; l'ultima sezione dice come si
  applicano in questo repo)
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- CLAUDE.md (l'indice: che cos'è e dove sta ogni cosa, lo stato corrente) è già nel
  contesto: usalo per trovare la guida giusta
- Leggi la spec doc/nove/NOVE-16-accumulo.md e l'indice della serie
  doc/nove/README.md (§ 3 decisioni, § 4 scelte adottate, § 7 contratti condivisi, § 8 regole)
- Leggi doc/guide/allocazione.md, doc/guide/consulente.md, doc/guide/assistente.md,
  doc/guide/velocita.md, doc/guide/prima-schermata.md, doc/guide/e2e-emulatori.md e
  doc/guide/e2e-playwright.md PRIMA di scrivere codice in quei domini
- Leggi DESIGN.md (The First-Screen Rule, Small-Screen Composition, The Modal-Is-A-Tile Rule)
  e PRODUCT.md
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

Implementa la spec così com'è scritta: la PR #486 entra con il cherry-pick della § 4 su un
branch nuovo da develop, poi le correzioni D1-D10, le scelte u, v, p, il lock in
transazione e il percorso leggero della nota del Piano. I test PRIMA del codice, ciascuno
visto rosso con la sua mutazione; cifre inventate e tonde. Fermati e chiedimi se: perf:budget
supera 605 KB gz su /dashboard/allocation (con la misura), un conflitto del cherry-pick tocca
un file che la § 4 non nomina, mobile:budget è rosso su una superficie diversa da allocazione
e allocazione-accumulo. Collaudo: § 7, la F sul mirror al mio «pronto»; le regole Firestore
le pubblico io (§ 8). Un branch, un commit con il trailer Co-authored-by della § 3, solo dopo
il mio OK con il riassunto del diff. SESSION_NOTES.md non si committa.
```

Model: **Opus 5.5**, effort **medium** — an L spec: a contributor's 12 000-line PR, a new collection and rule, a lock
in transactions, a shared contract (`describeOpenPlanForAdvice`), the initial bundle and the census. Estimated size:
2 sessions, ~6 h; ~600 lines changed over the PR, ~25 tests.
