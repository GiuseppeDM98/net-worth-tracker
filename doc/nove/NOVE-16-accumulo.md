# NOVE-16 — Allocazione › Accumulo: the PAC tab of PR #486, brought in with changes

> Series `doc/nove/` (README.md § 5): **depends on NOVE-02 (retired on 2026-11-13, PR #524)** (the Piano cell it rebases on) and reads NOVE-03's (retired on 2026-11-14, PR #526) and
> NOVE-07's dialogs (the fresh ledger meta, the fee field); **NOVE-17, NOVE-18 and
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
(`pr486:lib/utils/accumulationPlanMatching.ts:72`), four tiles, the phone composition, two E2E spec files and tests appended to
`e2e/allocation{,.mobile}.spec.ts`. The
page-side files it changes have NOT moved on develop since 54634a9 (`page.tsx`, `allocazioneNarrative.ts`,
`allocazioneSummary.ts`, `queryKeys.ts`, `perf/mobile-budget.json`, `scripts/seedCensusE2E.mts`); develop moved
`firestore.rules`, `AssetDialog`/`TransactionDialog` (one line each), `AGENTS.md`,
`doc/guide/prima-schermata-misure.md` and `e2e/allocation.mobile.spec.ts`; the trial merge on 452ed740 is clean
(`types/assets.ts` and `perf/budget.json` are not in the PR).

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
- **D11 — test fixtures that are not invented and round** (README § 8): `pr486:__tests__/allocazioneNarrative.test.ts:131`,
  `:959`; the «numeri di riferimento» of `accumulationPlanUtils.test.ts` and
  `accumulationNarrative.test.ts`; real tickers as fixture names and ids (`zeroQuantityChip.test.ts:4`).

## 2. Goal and acceptance criteria

1. `/dashboard/allocation` has the tabs «Bilanciamento» (default) and «Accumulo»; `?tab=accumulo` lands on it; a tab
   change rewrites the URL with `router.replace`. **Proof**: E1, E2.
2. The tab's code is not in the initial graph; `perf:budget` for the route ≤ 605 KB gz. **Proof**: § 7 G, E3.
3. With an active plan the Bilanciamento verdict is identical to the one without; the Piano shows one note with the
   button «Apri Accumulo». **Proof**: U1, E4.
4. A plan whose first month is in the future: no Piano note; the tab's headline «Il piano parte a/ad {mese}[ {anno}]:
   prima rata di {X} in {n} acquisti.». **Proof**: U2, U3, E5.
5. «+ Aggiungi», the editor's list, its seeded positions, the draft's validation and the empty tile's preview read
   ONE predicate: never a loan, a property, an account, a pension fund (only what the ledger can register) or a
   non-tradable asset (role resolved WITH the financed asset). **Proof**: U4.
6. At most one plan in `draft` or `active` per account, enforced in a transaction on `accumulationPlanLocks/{ownerUid}`;
   two concurrent creations leave one plan. **Proof**: U5, § 7 D.
7. Every euro field of a written plan is rounded to the cent, once, at the service boundary. **Proof**: U6.
8. The suggested instalment is the median of the last twelve full months' savings (`buildCashflowBlock`), floored to
   the ten; none under three months; the expenses are read only while the editor's first step or the empty tile is
   on screen. **Proof**: U7, R1.
9. «+ Nuovo asset» creates the asset at quantity 0 with no opening trade (decision 25). **Proof**: R2.
10. STRUMENTI prints an asset created empty (decision 25) and never traded as «0 quote, mai comprato»; every other
    quantity-0 asset stays out; `findAssetByName` prefers quantity > 0; the Assistente's and the Consulente's system
    prompts stay identical across users. **Proof**: U8, U9, U10.
11. With an active plan the Consulente's «Applica» page shows one line about it. **Proof**: R3.
12. A plan ending after the «rivedi entro» date carries a note in «Questo mese» and in the editor's preview.
    **Proof**: U11, U13, R4.
13. No fork reference or section code in the lines the branch adds; `PlanDraftSidePanel`'s sentences live in
    `accumulationNarrative.ts` (D8); `AssetDialog`'s two new strings stay inline, like the rest of that dialog; no
    test figure of the PR that is not invented and round (D11). **Proof**: the § 6 grep.
14. Phone: verdict cut at the first sentence, strip, «Questo mese» open; `mobile:budget` green on `allocazione` and
    `allocazione-accumulo`, re-measured here. **Proof**: E6, § 7 G.
15. The mirror owns the two new collections. **Proof**: U12.
16. The Piano note is on the first paint of a warm load: the plans' query is persisted. **Proof**: U14.

## 3. Decisions

- **Owner 24 (2026-11-12)**: with an active plan the Bilanciamento verdict does NOT change; only a note in the Piano.
- **Owner 25 (2026-11-12)**: «+ Nuovo asset» creates a real asset at quantity 0, without an opening trade.
- **Owner 30 (2026-11-12)**: the suggested instalment is the MEDIAN of the last twelve months' savings.
- **Owner 54 (2026-11-12)**: Patrimonio says it too — an instrument created empty and never traded wears the chip
  «Mai comprato» in Strumenti, never «Azzerato» (nothing was ever sold).
- **Adopted (README § 4)**: f, g, l, o, p, s, u, v.
- **Adopted, reversible (this spec)**:
  - A1. The PR enters by `git cherry-pick --no-commit d1e2666d` on a fresh branch; credit `Co-authored-by: Giorgio
    Trentadue <148712309+Ciocc128@users.noreply.github.com>`, the address already in the repo's history (the PR
    commit's author line is `Claude <noreply@anthropic.com>`, not the contributor).
  - A2. The one-open-plan invariant is a lock document `accumulationPlanLocks/{ownerUid}` `{ userId, openPlanId:
    string | null, updatedAt }`, written in the same transaction as the plan.
  - A3. An active plan before its first month is the verdict state `scheduled`, with no strip.
  - A4. The Piano note reads through small modules so the page imports none of the editor.
  - A5. «Mai comprato» = `Asset.createdEmpty === true` (written only by `AssetDialog`'s `createEmpty`, decision 25)
    AND `quantity ≤ 0` AND no ledger row names the asset. A position sold before the ledger migration has no row
    either (`lib/server/assetTransactionUseCase.ts:611` baselines only `quantity > 0`), and an empty account is
    not an instrument: neither carries the flag, both stay out as today.
  - A6. «+ Aggiungi» keeps the PR's exclusion of `assetClass === 'cash'` (money-market funds out).
  - A7. The lazy fallback is the PR's own loading branch (`pr486:components/allocation/AccumuloTab.tsx:163-173`),
    its wrapper `<div role="status" aria-label="Caricamento" className="mt-4 grid gap-3">` (the hooks
    `e2e/lazyTabLanding.ts:26-28` reads).
  - A8. `isPlanBuyable` requires a ledger type: a plan buys only what «Registra» can write (a pension fund with
    role tradable is not offered).
  - A9. `['accumulation-plans']` joins `PERSISTED_QUERY_PREFIXES`: the Piano note never arrives after the figures.
  - A10. The Consulente's strategy learns the «mai comprato» row here (one constant sentence), not in NOVE-21.
- **Overturned**: nothing of develop; of the PR, `pacClause` and annual / 12 (decisions 24, 30).

## 4. Solution

### Bringing the PR in

```
git fetch origin pull/486/head:refs/tmp/pr486      # only if the local ref is gone
git switch develop && git pull && git switch -c feat/accumulo
git cherry-pick --no-commit d1e2666d
```

Conflicts and their resolution: `firestore.rules` (develop's blocks + the PR's `accumulationPlans` block + the
lock block below); `components/assets/AssetDialog.tsx` (keep `autoComplete="off"`; at the submit the fresh
meta (`fetchFreshLedgerMeta`, the `metaNow` line) is fetched only when `!emptyCreateFlow`, and the line reads `const ledgerCreateFlow = !asset &&
!emptyCreateFlow && isLedgerAssetType(data.type) && metaNow != null;`); `components/assets/TransactionDialog.tsx`
(keep NOVE-07's fee field and `autoComplete="off"`, add the PR's `prefill` / `onCreated`); the Piano cell of
`page.tsx` (NOVE-02's: no `desktop:self-start`); `e2e/allocation.spec.ts` (NOVE-02's test and the PR's two, all
kept); `AGENTS.md`, `doc/guide/prima-schermata-misure.md`, `e2e/allocation.mobile.spec.ts` (both sides kept).

### The page (`app/dashboard/allocation/page.tsx`)

- D1, at module level, types only imported from the tab's module (AGENTS.md § Dynamic Imports):

```tsx
const AccumuloTab = lazyComponent(() => import('@/components/allocation/AccumuloTab').then((m) => m.AccumuloTab));
const ACCUMULO_LAZY = [AccumuloTab];
// in the component, beside the page's other hooks:
usePreloadWhenIdle(ACCUMULO_LAZY, hasAssets && !!composed);
// in the Accumulo panel — the fallback is a PROP of the lazy component (components/ui/lazy-component.tsx:26-29):
<AccumuloTab fallback={<AccumuloTabSkeleton />} ownerId={ownerId} allAssets={allAssets} targets={targets}
  band={band} targetLeverageRatio={targetLeverageRatio} onAssetsChanged={retryLoad}
  reviewByIso={reviewDue.state === 'none' ? null : reviewDue.reviewByIso} />
```

  `AccumuloTabSkeleton` moves to `components/allocation/AccumuloTabSkeleton.tsx` (A7); the tab's loading branch
  renders it too. The page's own `loading` branch (`:510-517`) renders `<PageTabs loading … />` above its
  skeleton, so the bar's row exists from the first frame on either tab.
- D2: `pac` leaves `buildAllocazioneVerdict`'s input and dependency list; `PacVerdictInput` (moved to
  `types/accumulationPlan.ts`), `pacClause` and the input field go from `allocazioneNarrative.ts`.
  `describePacOverlap`, `findPacSubstitutions`, `listPlanBuyAssetIds` and PianoTile's `pacNote` stay as written.
- The page's header comment loses the PR's sentence about `pac` in `buildAllocazioneVerdict` (§ 9).

### The slim read path (A4) — code moved from the PR

- `lib/utils/planMonths.ts`: `toMonthKey`, `addMonths`, `monthIndexOf` moved verbatim from
  `pr486:lib/utils/accumulationPlanUtils.ts:31-59`, re-exported there; and `monthLabelLong` with its private
  `MONTH_NAMES_LONG` and `parseMonthKey`, moved verbatim from `pr486:lib/utils/accumulationNarrative.ts:30-52`
  (`monthLabelShort` imports `parseMonthKey` from here), re-exported there.
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
  `lib/constants/persistCache.ts`: `['accumulation-plans']` joins `PERSISTED_QUERY_PREFIXES` (A9; a new prefix
  needs no `PERSIST_CACHE_VERSION` bump).
- `lib/utils/accumuloMonth.ts`: `isPlanDone`, `findOpenInstallment` (clamp kept: the tab previews instalment 1 of a
  scheduled plan, the last one after the end), `summarizePacMonth` moved from `accumuloSummary.ts` (re-exported)
  with, after its status check, `if (currentIndex < 1 || currentIndex > plan.months) return null;` (before the
  first month nothing is bought «questo mese»; after the last the tab owns the late lines) and `monthTotalEur`
  through `roundToCents`. The module imports only `planMonths.ts`, `accumulationPlanDoc.ts`, `cents.ts` and types —
  never `accumulationNarrative.ts`, `accumuloSummary.ts` or `accumulationPlanUtils.ts` (the page's first load reads
  it). Plus:

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

`describeAccumuloVerdict`: headline «Il piano parte {monthWithPrepositionA(Number(startMonth.slice(5, 7)))}{ anno}:
prima rata di {€} in {n} {acquisto|acquisti}.» — `monthWithPrepositionA` from `lib/utils/patrimonioNarrative.ts:110`
(«a maggio», «ad aprile»), the year printed only when it is not the Italian year of `today` («Il piano parte ad
aprile 2027: …»); sentence «{N} {rata|rate}; fino ad allora non c'è nulla da comprare.», tone `neutral`, no cut;
`selectAccumuloStrip` returns `[]` for it.

### «+ Aggiungi» (D4, choice o)

`listAddableAssets` (`pr486:lib/utils/accumulationPlanUtils.ts:1272-1290`), the editor's `candidateAssets`
(`pr486:components/allocation/AccumulationPlanDialog.tsx:331-339`) and `seedPositionsFromAssets` (`:233-240`, which
keeps its `calculateAssetValue(asset) > 0`), the schema's two `position_not_tradable` checks
(`pr486:lib/utils/accumulationPlanSchema.ts:124`, `:138`: `!isPlanBuyable(member, assets)`) and its
`unassigned_tradable` loop (`:204-212`: `if (!isPlanBuyable(asset, assets)) continue;` in place of the two lines on
`cash` and the role), and `tradableWeights` (`pr486:lib/utils/accumuloSummary.ts:233-240`) all call one predicate,
in `lib/utils/accumulationPlanUtils.ts`:

```ts
/**
 * An asset a plan may buy: an instrument the ledger can register (stock, etf, bond, crypto, commodity) whose role,
 * resolved with what it finances, is tradable; never an account, a money-market fund, a loan, a property or a
 * pension fund (2026-11-12).
 */
export function isPlanBuyable(asset: Asset, allAssets: readonly Asset[]): boolean {
  if (!isLedgerAssetType(asset.type) || asset.assetClass === 'cash') return false;
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

The PR's plans block reads `allow read: if resource == null || canAccess(resource.data.userId);`: a lock that names
a plan deleted outside `deleteDraftPlan` (the console, a fixture removal that crashed) reads as missing, never as
denied — with the PR's line `createDraftPlan`'s `tx.get` of the held plan fails and no plan can ever be created.

Mirror and seeds: `scripts/mirrorCollections.ts` appends `'accumulationPlans'` to `USER_COLLECTIONS`,
`'accumulationPlanLocks'` to `PER_USER_DOCS`; `scripts/seedCensusE2E.mts:76-77` the same in its local lists, and its
`seedAccumulationPlan()` writes `accumulationPlanLocks/{UID}` `{ userId: UID, openPlanId: 'census-accumulo-plan',
updatedAt: now }`; `e2e/accumuloFixture.ts` writes `{ userId: OWNER, openPlanId: 'e2e-accumulo-plan', updatedAt: now }`
in `seedAccumuloFixture` and removes it in `removeAccumuloFixture`, after the plan. `seedAccumuloFixture({ startOffset
= -2 } = {})`: `startMonth: monthKeyAt(startOffset)`, instalment k in `monthKeyAt(startOffset + k - 1)`, executed
lines only in the months before the current one (E5 calls it with `startOffset: 1`).

### Money in cents (D6)

Every euro field is rounded ONCE, at the service boundary: `lib/services/accumulationPlanService.ts` gains a
private `roundPlanEuros(patch)` that passes through `roundToCents` every `plannedAmountEur`, `executedAmountEur`,
`estimatedProceedsEur`, `carryInEur` value, `residualEur`, `reserveEur`, `monthlyInflowEur`,
`baseline.positionValuesEur` value, `baseline.sourceCashEur`, `measurement.classNotionalEur` value and
`measurement.marketBaseEur` it finds, called by `createDraftPlan`, `updateDraftPlan`, `activatePlan`,
`setInstallmentLine`, `setDisposal`, `applyRecalibration` and `revisePlan` before `tx.set` / `tx.update` / `updateDoc` —
the editor's typed amounts, the calendar's and the baseline's float sums
(`pr486:components/allocation/AccumulationPlanDialog.tsx:451`, `:466`; `tiles/QuestoMeseTile.tsx:183`, `:239`;
`AccumulationCalendarDialog.tsx:109`; the service's `:250-260`) all pass through it. The previews print what is
saved, so the pure functions round as well. `scheduleInstallments`: `plannedAmountEur: roundToCents(spend)` (`:271`), `line.plannedAmountEur =
roundToCents(line.plannedAmountEur + picked.buyPriceEur)` (`:314`), `residualEur = roundToCents(pool)` (`:320`),
every `carryInEur` value; `buildRegisteredLinePatch`: `roundToCents(quantity * priceEur)` (`:423`);
`proceedsOfDisposal` returns `roundToCents(...)` (`:102`).

### The suggested instalment (D7, decision 30)

`pr486:lib/hooks/useAnnualCashflow.ts` is deleted. New `lib/hooks/useMonthlySavingsMedian.ts`:

```ts
'use client';
export interface MonthlySavingsMedian { medianEur: number; months: number }
/**
 * undefined = still reading; null = no suggestion (fewer than CASHFLOW_BLOCK_MIN_MEDIAN_MONTHS months of data, or
 * the read failed: the editor stays usable, the field empty).
 */
export function useMonthlySavingsMedian(
  ownerId: string,
  assets: Asset[],
  options: { enabled: boolean },
): MonthlySavingsMedian | null | undefined {
  // The mount's clock: the window and the block's «today» never drift inside one editor session.
  const [readAt] = useState(() => new Date());
  const settingsQuery = useSettings(ownerId);
  const expensesQuery = useExpensesInRange(ownerId, fireWindows(readAt, null).recent, { enabled: options.enabled });
  if (!options.enabled) return undefined;
  if (expensesQuery.isError || settingsQuery.isError) return null;
  if (!expensesQuery.data || settingsQuery.data === undefined) return undefined;
  const block = buildCashflowBlock(expensesQuery.data, { todayIso: getItalyDateIso(readAt), categories: [], assets,
    settings: settingsQuery.data ?? null, assetValueOf: calculateAssetValue });
  // The median spans 3 to 12 months (lib/utils/cashflowBlock.ts:444-448): the sentence names how many.
  return block.volatility ? { medianEur: block.volatility.savings.median, months: block.windows.medianMonths } : null;
}
```

Callers: the editor with `enabled: open && step === 1`, `AccumuloVuotoTile` with `enabled: true`. In
`accumulationNarrative.ts`:

```ts
export function suggestMonthlyInflow(medianEur: number | null | undefined): number | null {
  if (medianEur === null || medianEur === undefined || medianEur <= 0) return null;
  return Math.floor(medianEur / 10) * 10;
}
export function describeSuggestedInflow(suggestedEur: number, months: number): string {
  return `Il tuo risparmio mensile mediano degli ultimi ${months} mesi è di ${cachedFormatCurrencyEUR(suggestedEur, true)}.`;
}
```

Callers pass `suggestMonthlyInflow(median?.medianEur)` and `median.months`. `AccumuloVuotoTile`
(`pr486:components/allocation/tiles/AccumuloVuotoTile.tsx:54-60`) passes `monthlyInflowEur:
suggestMonthlyInflow(median?.medianEur) ?? 0` to `buildAccumuloPreview` and prints the sentence only when the
suggestion is not null; the editor (`AccumulationPlanDialog.tsx:360-361`, `:804`) shows the «Usa» row only then. The
PR's assertions at `pr486:__tests__/accumulationPlanRevision.test.ts:265-269` are deleted (U7 replaces them).

### The Assistente and the Consulente (choices u, p)

- `buildHoldingRows` (`lib/utils/assistantPortfolioContext.ts:292`) takes `tradedAssetIds: ReadonlySet<string>`
  (built at `:648` from `transactions.map((t) => t.assetId)`); the skip at `:303` becomes `const neverBought =
  asset.createdEmpty === true && !(asset.quantity > 0) && !tradedAssetIds.has(asset.id); if (!(asset.quantity > 0) &&
  !isLoanAsset(asset) && !neverBought) continue;` and the kept row carries `neverBought: true` (`AssistantHoldingRow`
  gains `neverBought?: true`).
- `types/assets.ts`: `Asset` gains `createdEmpty?: true` («created at quantity 0 for a plan, 2026-11-12: with no
  ledger row it reads "mai comprato"; absent on every other asset»); `AssetDialog`'s `emptyCreateFlow` branch
  (`pr486:components/assets/AssetDialog.tsx:1628`) writes it, no other path does. The PR's
  `describeZeroQuantityChip(asset, tradedAssetIds)` (`pr486:lib/utils/zeroQuantityChip.ts`) takes
  `Pick<Asset, 'id' | 'type' | 'quantity' | 'createdEmpty'>` and answers «Mai comprato» only with the flag — ONE
  rule for the editor's chip, STRUMENTI and Patrimonio (decision 54): `app/dashboard/assets/page.tsx` builds
  `tradedAssetIds` from the trades it already reads (`tradesQuery`, `:286`: `tradesQuery.data ? new Set(
  tradesQuery.data.map((t) => t.assetId)) : null`, memoised) and passes it to `StrumentiTile`, which hands it to
  `AssetRow` (both gain `tradedAssetIds: ReadonlySet<string> | null`); the two chips
  (`components/assets/AssetRow.tsx:342`, `StrumentiTile.tsx:491`) read «Mai comprato» when the set is not `null`
  and `describeZeroQuantityChip(asset, tradedAssetIds)` answers so, else today's «Estinto» / «Azzerato» — with
  the ledger not read yet (`null`) the chip stays «Azzerato», never a guess. The row keeps today's place and
  counts (`patrimonioSummary.ts:69`: not something the owner holds). `selectBondHoldings` already drops it (`valueEur > 0`,
  `lib/utils/allocationAdviceBonds.ts:35`).
- `formatPortfolioForPrompt` (`lib/server/assistant/prompts.ts:279`): the quantity part becomes `row.neverBought ?
  `0 ${quantityUnit(row.type)}, mai comprato` : `${quantity(row.quantity)} ${quantityUnit(row.type)}``.
- `prompts.ts:732`, the sentence's end — BEFORE: «Uno strumento che l'utente nomina e che non compare non è in
  portafoglio.» AFTER: «Uno strumento che l'utente nomina e che non compare non è in portafoglio. Una riga «0 quote,
  mai comprato» è uno strumento già creato e mai acquistato: non è posseduto, ma per proporlo usa quel nome.»
- `lib/server/allocationAdvice/prompts.ts` — the same rows reach the strategy, the interview and the review through
  the shared portfolio block (`lib/server/allocationAdvice/run.ts:271-282`). In the «Vincoli:» sentence (`:163`),
  after «copiati ESATTAMENTE dal blocco STRUMENTI;» — ADDED: « una riga «0 quote, mai comprato» è uno strumento già
  creato e mai acquistato: non è posseduto e non pesa nell'allocazione, ma un sotto-target che gli corrisponde lo
  nomina in "instrument" con quel nome;». A constant of the system prompt (A10).
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
  a file name) becomes `__tests__/accumuloTileSentences.test.ts`.
- D11: every figure of the PR's tests that is not derived from round inputs is replaced by round invented ones
  (prices 100, 50, 25; amounts 1.000, 2.500, 500), and every market ticker used as a fixture's name or id by a
  generic one (`ETF-A`, `ETF-B`, `'etf-a'`) in `__tests__/{allocazioneNarrative,accumulationPlanUtils,
  accumulationNarrative,accumulationClassTrajectory,accumulationPlanRevision,accumulationPlanReviewFlow,
  accumuloSummary,zeroQuantityChip}.test.ts`; the expected values are recomputed, never copied from the PR. `doc/guide/accumulo.md:14` names
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
  (`prompts.ts:687`) and of the strategy's «Vincoli»; the «mai comprato» rows sit in the user content.
- **The Absence-Has-Three-Names Rule**: under three months, or on a failed read, there is no suggestion and no
  sentence — never «0 €», never a spinner that does not end.
- **A plan's rule that reads `resource.data` denies a missing document**: hence `resource == null ||` on the plans'
  read.
- **The First-Screen Rule, one DOM sequence, no `order-*`**: asserted by the PR's phone spec (E6), kept.

## 6. Tests per level (with the mutation that proves each)

| # | Test | Mutation that turns it red |
| --- | --- | --- |
| U1 | `__tests__/allocazioneNarrative.test.ts` › `expectTypeOf<AllocazioneVerdictInput>().not.toHaveProperty('pac')` (held by `npx tsc --noEmit` in phase A: Vitest does not type-check); the PR's two cases on the clause (`pr486:__tests__/allocazioneNarrative.test.ts:129-145`) are deleted | put `pac?: PacVerdictInput \| null` back in `AllocazioneVerdictInput` (tsc red) |
| U2 | `__tests__/accumuloMonth.test.ts` › `summarizePacMonth` null at index 0 and at months + 1, a summary at 1 and at months | drop the `currentIndex < 1` guard |
| U3 | `__tests__/accumuloSummary.test.ts` › index 0 gives `scheduled`, first instalment in cents; the headline; `startMonth` 2027-04 seen on 2026-11-12 → «Il piano parte ad aprile 2027: …», 2026-12 → «Il piano parte a dicembre: …» | return `active` for index 0 |
| U4 | `__tests__/accumulationPlanUtils.test.ts` › `isPlanBuyable`: a loan financing a property, a personal loan, a property with no role, an account, a money-market fund, a pension fund with role tradable, a frozen ETF out; a tradable ETF in. `accumulationPlanSchema.test.ts`: a property with value > 0 and no role raises no `unassigned_tradable`; `seedPositionsFromAssets` does not seed it | drop `isLedgerAssetType` (the loan, the property and the pension fund get in); the schema back on `resolveAllocationRole` |
| U5 | `__tests__/accumulationPlanDoc.test.ts` › `openPlanHeldBy`: null lock, lock on a draft, an active, a completed plan | treat `completed` as held |
| U6 | `accumulationPlanUtils.test.ts` › prices of 33,333 €: every `plannedAmountEur`, `residualEur`, `executedAmountEur` ≤ 2 decimals. `__tests__/accumulationPlanService.test.ts` (Firestore mocked): a manual line of 10,005 € and a baseline over an asset of 3 × 33,333 €: every euro field handed to `tx.set` / `tx.update` ≤ 2 decimals | remove one `roundToCents`; drop the `roundPlanEuros` call in `activatePlan` |
| U7 | `__tests__/accumulationNarrative.test.ts` › `suggestMonthlyInflow(1295)` = 1290; null → null; −50 → null; `describeSuggestedInflow(1200, 12)` «… degli ultimi 12 mesi è di 1.200 €.», `(1200, 5)` «… degli ultimi 5 mesi …» | annual / 12 back; print 12 always |
| U8 | `__tests__/assistantPortfolioContext.test.ts` › `createdEmpty`, quantity 0, no trade → a `neverBought` row; the same asset with a trade → left out; the SOLD fixture (`:112`, `:192`: quantity 0, no trade, no flag) still left out. `__tests__/zeroQuantityChip.test.ts`: «Mai comprato» only with the flag | drop the `createdEmpty` condition (SOLD becomes a row) |
| U9 | `__tests__/allocationAdviceApply.test.ts` › two «Alfa», the held one wins; two tickers, one held → it | search `assets` instead of `pool` |
| U10 | `__tests__/assistantPromptBundle.test.ts` › the «0 quote, mai comprato» row in the user content; `expect(a.system).toBe(b.system)` with and without it; `__tests__/allocationAdvicePrompts.test.ts` › the strategy's `system` is equal with and without such a row, and holds the new sentence | print the row count in the system |
| U11 | `accumuloMonth.test.ts` › `planEndsAfterReview`: 2027-01 × 12, review 2027-06-30 → true; 2028-01-15 → false; null → false | compare `startMonth` instead of the end |
| U12 | `__tests__/mirrorCollections.test.ts` › the existing case covers the lock (`{ownerUid}`); new case: every collection whose rules block reads `canAccess(resource.data.userId)` (a regex over `firestore.rules`) is in `USER_COLLECTIONS` | drop `'accumulationPlanLocks'` from `PER_USER_DOCS`; drop `'accumulationPlans'` from `USER_COLLECTIONS` |
| U13 | `accumulationNarrative.test.ts` › `describePlanPastReview('2027-06-30')` = «Il piano finisce dopo la revisione dell'allocazione (30/06/2027): rivedilo quando rivedi i target.» | print the start month |
| U14 | `__tests__/persistCache.test.ts` › a query keyed `['accumulation-plans', uid]` is persisted | drop the prefix |
| R1 | `__tests__/accumuloVuotoTile.test.tsx` › a median of 1200 over 12 months names 1.200 €; null renders no sentence; a failed expenses read renders no sentence and no spinner | print 0 € for null |
| R1b | `__tests__/strumentiTile.test.tsx` (the file that renders the tile; a new one when none does) › an ETF with `createdEmpty`, quantity 0 and an empty `tradedAssetIds` → chip «Mai comprato»; its id in the set → «Azzerato»; `tradedAssetIds: null` → «Azzerato»; a quantity-0 ETF without the flag → «Azzerato» | read the flag alone |
| R2 | `__tests__/assetDialogCreateEmpty.test.tsx` (new) › with `createEmpty` an ETF is saved through `createAsset` with `quantity: 0`, `createdEmpty: true` and no `averageCost`, and no ledger trade is posted; without `createEmpty` no `createdEmpty` is written | drop `!emptyCreateFlow` from `ledgerCreateFlow` (the opening-trade path runs) |
| R4 | `__tests__/planDraftSidePanel.test.tsx` › with `reviewByIso` before the plan's end the note renders; null → none | drop the condition |
| R3 | `__tests__/consulenteBook.test.tsx` › `applyPieces` renders `APPLY_ACTIVE_PLAN_NOTE` only when passed | always render it |
| E1-E2 | `e2e/allocation.spec.ts` (the PR's two tests) › the tab in the URL; Accumulo without a plan at 1440 | drop `router.replace` |
| E3 | `e2e/bundle.lazy.mobile.spec.ts` › `?tab=accumulo` lands in place: `expectAccumuloTabLandsInPlace` in `e2e/lazyTabLanding.ts` holds the tab's chunk (`ACCUMULO_TAB_SIGNATURE = 'function AccumuloTab('`, the `DIVIDENDS_TAB_SIGNATURE` pattern, `:20`) — no HTTP request to hold: the plans come from the SDK —, reads the top of the skeleton's first cell (`role=status` «Caricamento», `.grid > div`), releases, and the tab's first `[data-tile]` starts at the same top (± 1 px); the tab bar is on screen while the chunk is held | import the tab statically |
| E4 | `e2e/allocation.spec.ts` › at 1440 the text of the region «Verdetto sull'allocazione» (headline AND sentence: the PR's clause lived in the sentence) read before planting the fixture's plan equals the one read after; «Apri Accumulo» opens the tab | restore `pacClause` |
| E5 | `e2e/allocation.spec.ts` › `seedAccumuloFixture({ startOffset: 1 })`: no Piano note; the tab's headline starts «Il piano parte a» | remove the D3 guard |
| E6 | `e2e/accumulo.mobile.spec.ts`, `e2e/accumulo.tablet.spec.ts` (the PR's nine tests, cleaned) | an `order-*` on «Questo mese» |

The grep of criterion 13, on the lines the branch adds (develop's own codes — `D50`, `D65` in
`lib/utils/colorParse.ts` — are not in them), empty:

```
git diff develop...HEAD -U0 -- app components lib e2e __tests__ types scripts | grep -E "^[+]" | grep -nwE \
  "pac-ate|pac-ottimizzatore|render-accumulo|contributi-upstream|fork-scelte|PR #4|(AL|RV|RP|PO|PP|PT|RM|PZ|RO|D-AL)[0-9]+|D[0-9]{1,2}|S[0-9]|[ABMR][0-9]"
```

D11 is checked on the same added lines, read by eye: no amount that is not a round invented one, no instrument
named by a market ticker (the PR's tickers are not written here: the diff shows them).

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
  (AGENTS.md § Emulator Exercise Scripts) fires two `createDraftPlan` at once: one id, one refusal; then the plan
  the lock names is deleted with the Admin SDK and `createDraftPlan` succeeds (the rules read a missing plan).
- **E (edges)**: a plan with `startMonth` next month («parte a», no Piano note); close it and create another (the lock
  frees); «Riattiva» refused while another plan is open; `allocationAdvice/<uid>` planted in status `ready` with a
  proposal (emulator REST, `Authorization: Bearer owner`) and an active plan: the «Applica» page shows
  `APPLY_ACTIVE_PLAN_NOTE` — the note lives in the body an applied document does not have
  (`ConsulenteBookPages.tsx:276-278`) —, with the plan cancelled it does not.
- **F (owner, at «pronto»)**: the mirror (`npm run mirror:seed -- <email>`); the owner drafts and activates a plan on
  his data and reads the Piano note and «Questo mese»; no Consulente run is launched. `npm run mirror:remove`.
- **G** (the two budgets close by README.md § 8's ONE rule, decisions 33 and 34): `npm run perf:budget` (the route's ceiling is 605 KB gz today); `npm run mobile:census --
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

- `doc/guide/patrimonio.md`: «an instrument created empty and never traded wears «Mai comprato» in Strumenti
  (`describeZeroQuantityChip`, the page's `tradedAssetIds`); «Azzerato» when the ledger is not read yet»
  (decision 54).
- `doc/guide/accumulo.md` (from the PR): § Files gains the slim modules and the lock; the rules «One open plan per
  account: the lock `accumulationPlanLocks/{ownerUid}`, written in the plan's transaction (2026-11-12)», «A plan not
  started yet: verdict `scheduled`, no Piano note», «Every euro field is rounded once, in `roundPlanEuros`», «A plan
  buys only `isPlanBuyable` assets», the instalment (decision 30, the median over `months`); `:14` corrected; the
  PR's bullet «**With an active plan** the Bilanciamento verdict names the month's installment instead of «Versa»»
  becomes «With an active plan the Bilanciamento verdict does not change; the Piano opens with one note and «Apri
  Accumulo» (`describePacOverlap`, `findPacSubstitutions`; owner, 2026-11-12)», and «One active plan per account»
  becomes «One draft-or-active plan per account».
- `doc/guide/allocazione.md`: the tab bar; «With an active plan the Bilanciamento verdict does not change: only the
  Piano's note (owner, 2026-11-12)». `doc/guide/consulente.md` § «Applica»: the line; the «mai comprato» sentence of
  the strategy. `doc/guide/assistente.md`: the «mai comprato» rows (`Asset.createdEmpty`) and `findAssetByName`'s
  preference. `doc/guide/cashflow.md` § Expenses by window and `CLAUDE.md` «Architecture Snapshot»: Accumulo reads
  FIRE's `recent` window (the editor's first step and the empty tile). `doc/guide/cache-persistita.md`: the plans'
  prefix.
- `AGENTS.md` § 3: the stub «Allocazione › Accumulo → `doc/guide/accumulo.md`» (the lock, the slim path); in the PR's
  stub the first bullet reads «ONE draft-or-active plan per account (the lock `accumulationPlanLocks/{ownerUid}`)»
  and the second ends «every write invalidates `queryKeys.accumulationPlans.all`, which the Piano's note reads too».
  `AGENTS.md:348` («`quantity = 0` marks a sold asset») gains «— or one created empty for a plan
  (`Asset.createdEmpty`)».
- `CLAUDE.md` › Key Features (Allocazione line) and «Latest»; `Draft Release Temp.md`; the `allocazione-accumulo`
  baseline in `doc/guide/prima-schermata-misure.md`.

## 10. Declared out of scope

- **The model portfolio, the optimizer, «Criteri del modello»**: heir NOVE-17.
- **Targeted sales under a tax cap**: heir NOVE-18.
- **The Consulente's hand-off to a plan and its reading of the active plan** (`describeOpenPlanForAdvice` is defined
  here, read there): heir NOVE-21.
- **An account with no assets, or with assets and no Piano** (the branches `page.tsx:520-546`: a failed read, the
  empty states) has no tab bar; `?tab=accumulo` lands on Bilanciamento's state there: none, declared.

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
  doc/guide/patrimonio.md, doc/guide/cashflow.md, doc/guide/cache-persistita.md,
  doc/guide/velocita.md, doc/guide/prima-schermata.md, doc/guide/prima-schermata-misure.md,
  doc/guide/e2e-emulatori.md e
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
branch nuovo da develop, poi le correzioni D1-D11, le scelte u, v, p, il lock in
transazione e il percorso leggero della nota del Piano. I test PRIMA del codice, ciascuno
visto rosso con la sua mutazione; cifre inventate e tonde. Fermati e chiedimi se: perf:budget, misurato prima e dopo sulla stessa macchina, supera un tetto di più di 1 KB gz (fino a 1 KB lo alzi tu, con raisedBy e una riga in velocita.md § Registro), un conflitto del cherry-pick tocca
un file che la § 4 non nomina o non si risolve come la § 4 dice, nel confronto con develop dello stesso giorno, stessa build, si muove una voce di mobile:budget che la spec non nomina (allocazione-accumulo è la voce nominata: la riregistri con raisedBy). Collaudo: § 7, la F sul mirror al mio «pronto»; le regole Firestore
le pubblico io (§ 8). Un branch, un commit con il trailer Co-authored-by della § 3, solo dopo
il mio OK con il riassunto del diff. SESSION_NOTES.md non si committa.
```

Model: **Opus 5.5**, effort **medium** — an L spec: a contributor's 12 000-line PR, a new collection and rule, a lock
in transactions, a shared contract (`describeOpenPlanForAdvice`), the initial bundle and the census. Estimated size:
1 long session, ~8 h (decision 35: one branch, one commit; resumed on the same branch, without committing, when the context runs out); ~600 lines changed over the PR, ~25 tests.
