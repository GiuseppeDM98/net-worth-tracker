# NOVE-26 — The guided path revises an active plan; the editor is deleted

> Series `doc/nove/` (README.md § 5): **depends on NOVE-22** (the path: `planPath.ts` with `restorePlanPathDraft`
> and `planPathTodayWeights`, `PathCard`, the route `/dashboard/allocation/piano`), on **NOVE-23** (retired on 2026-11-19, PR #557; a sale's month
> is the plan's absolute instalment index, the validator's and the preview's `firstIndex`, `listSaleSteps`,
> `reviewMonthIndex`, the note «Rivedi il piano» of the review month) and **NOVE-25** (`advisorNotes`,
> `PlanRevisionInput.advisorNotes`, `lib/utils/accumuloCopy.ts`, the gate's `source_missing`). Last of the five
> specs of «dal Consulente al piano di accumulo, in un clic»: «Rivedi il piano» and «Rivedi dal modello» open the
> same eight screens, prefilled with the plan, and `AccumulationPlanDialog` leaves the repo.
> Written on 2026-11-19; every `file:line` is cited on `develop` @ 7909fa4c (those into the files NOVE-23 changed re-pointed to `develop` @ 875f4882 at its retirement, 2026-11-19). Executes decision 87 in full and
> decision 91's second half (README.md § 3).

## 1. The problem today (evidence on the code)

**After NOVE-22 two forms describe one plan.** A plan is created in the path and revised in the modal: the same
questions — how much a month, how long, which account, what to sell, which quotas — asked in two shapes, with two
copies of every sentence (the exports of `lib/utils/accumulationNarrative.ts` that only
`components/allocation/AccumulationPlanDialog.tsx` and `PlanDraftSidePanel.tsx` read: § 4.5).

**The modal's revision is the create form with exceptions.** `draftForRevision`
(`AccumulationPlanDialog.tsx:264-276`) rebuilds a draft from the first intact instalment; step 1 swaps «Durata» for
«Mesi restanti» and adds a note (`:999`); the saved sales are locked by a set (`lockedSaleIds`, `:475`) and the
changes diffed at save (`revisionChanges`, `:487`; `handleRevise`, `:720-746`); its preview is `buildDraftPreview`
on that draft (`:750`), not the calendar `revisePlan` will write.

**Three engine functions and two entry points exist only for the modal's advanced operations**, which decision 89
removed from the product: `groupPositions`, `separatePosition`, `replaceBuyAsset`
(`lib/utils/accumulationPlanUtils.ts`), and the optimizer's panel inside step 2.

**«Rivedi il piano» has three doors**: the footer button (`components/allocation/tiles/QuestoMeseTile.tsx:897-899`),
«Rivedi dal modello» (`:617-629`) and, since NOVE-23, the review month's note — each sets two pieces of state and
opens the modal (`reviseDialog`, `:378-397`).

## 2. Goal and acceptance criteria

1. With an ACTIVE plan, `/dashboard/allocation/piano` opens the eight screens prefilled with the plan from its
   first intact instalment: «Dal piano com'è» chosen, the months left, the accounts, the reserve, the open sales,
   the quotas. **Proof**: U1, E1.
2. The summary shows the calendar `revisePlan` will write — the next instalment and its month — computed by
   `buildRevisedPlan`, and its refusals in words. **Proof**: U4, R1.
3. ONE «Conferma» revises the plan: the closed instalments and the executed sales stay as they are; a saved open
   sale can be taken off, changed or moved to another month; a new one has its month. **Proof**: U2, U3, E1, E2.
4. `/dashboard/allocation/piano?da=modello` opens the revision with «Dal portafoglio modello» chosen and the
   model's quotas (and groups). **Proof**: U1, E3.
5. «Rivedi il piano», «Rivedi dal modello» and the review month's note are links to the path. **Proof**: R2, E1.
6. A revision by hand keeps the plan's review month while it is still inside the plan and clears the Consulente's
   notes. **Proof**: U5.
7. A browser draft of a revision is discarded when the plan changed since it was started — another revision, or
   one more instalment closed — and a «Conferma» on a plan that moved meanwhile writes nothing. **Proof**: U6, U8.
8. `AccumulationPlanDialog.tsx`, `PlanDraftSidePanel.tsx`, `OptimizerPanel.tsx`, the three engine functions and
   every sentence only they read are deleted; `git grep -w` finds none of the names § 4.5 deletes (the ones it
   keeps are read by the path). **Proof**: U7, § 7 A.
9. A revision made in the path writes the same plan document the modal wrote on the same answers. **Proof**: § 7 B.
10. `perf:budget`: every route green; `/dashboard/allocation`'s initial JS reads as before (the editor lived in
    the Accumulo tab's lazy chunk, which `perf:budget` does not sum) and the lazy chunk's shrink is shown by
    `npm run perf:budget -- --top=15` before and after. **Proof**: § 7 G.

## 3. Decisions

- **Owner 87 (2026-11-19)**: the path replaces EVERYTHING — create, «Modifica» of a draft, «Rivedi il piano» —
  and the editor is deleted. **Owner 91**: this is the second of the two specs.
- **Owner 89**: no «Raggruppa/Separa» by hand, no «Sostituisci», no «Ottimizzato» in a plan: their code goes —
  `OptimizerPanel.tsx` included, whose only importer is the editor.
- **Owner 93**: a later sale refills the reserve first; the engine does it (NOVE-23), the path only says it.
- **Owner 94**: the link reads «Apri Accumulo» (`ACCUMULO_OPEN_LINK`, `lib/utils/accumuloCopy.ts`).
- **Owner 98**: an active plan with every instalment closed shows `ACCUMULO_PLAN_NOTHING_TO_REVISE` and «Apri
  Accumulo» — already on the path's host since NOVE-22 (G7): this spec keeps that branch.
- **Adopted, reversible (this spec)**:
  - V1. The mode is the open plan's: active → revise. `?da=modello` only preselects the start, and only in a
    revision with a model that has weights: in create mode, or without such a model, it is ignored.
  - V2. In a revision the starts are «Dal piano com'è» (default), «Dal portafoglio modello», «Dai pesi di oggi»;
    «Da zero» is not offered (a revision starts from something).
  - V3. The plan's reserve arrives as a typed figure (the plan's own), with «Torna a {€}» to follow the allocation
    again.
  - V4. A sale's month is the plan's instalment index (absolute, NOVE-23). A new sale, or a saved one that is
    moved, takes an open month (`firstIndex … closedCount + months`); an open saved sale whose month is already
    behind (a late sale: «Questo mese» still proposes it) keeps that month until the user moves it.
  - V5. A hand revision passes `advisorNotes: []` when the plan carries notes (they described the Consulente's
    plan, which the owner has now changed) and keeps `reviewMonthIndex` unless it falls after the plan's new end
    (then `null`).
  - V6. A stored revision draft carries the plan's id, its count of revisions and the first intact instalment's
    index it was started from; another id, another count or another index discards it without a message.
  - V7. The summary's figures come from `buildRevisedPlan` (the engine's own result), not from `buildDraftPreview`.
  - V8. The done card reads «Piano rivisto: prossima rata a {mese}, {€}.» — the month and the planned total of
    the revised plan's instalment `firstIndex`.
  - V9. The plan may move between the screen and the write (an instalment confirmed in another tab): the revision
    carries `expectedFirstIndex`, and the engine refuses with `plan_moved` when the plan's first intact instalment
    is another — nothing is written, the sentence asks to reload.
  - V10. An account of the plan that no longer exists, or is no longer a source account, is not pre-ticked: the
    screen «conto» would not show it and the gate would refuse it (`source_missing`).
  - V11. «Conferma» is disabled while the write runs (NOVE-22's G17): one revision per press.
  - V12. An instrument with a locked sale (executed, skipped, linked to the Registro) is not offered for another
    sale: the engine holds one sale per instrument.

## 4. Solution

### 4.1 The path's module (`lib/utils/planPath.ts`)

```ts
export type PlanPathStart = 'model' | 'today' | 'zero' | 'seed' | 'draft' | 'plan';

export interface PlanPathRevision {
  /** The account's ACTIVE open plan. */
  plan: AccumulationPlan;
  /** `findFirstIntactInstallment(plan)`: its index `k` and month. */
  firstIndex: number;
  firstMonth: MonthKey;
  /** k − 1: the instalments a revision never touches. */
  closedCount: number;
  /** The saved sales a revision cannot change (`!isOpenSavedDisposal`): shown, never editable. */
  lockedSales: PlanDisposal[];
}
// PlanPathContext gains:  revision: PlanPathRevision | null;  fromModel: boolean;
// PlanPathAnswers gains:  revisesPlanId?: string;  revisionCount?: number;  revisesFromIndex?: number;

/** null when the plan has no intact instalment (nothing to revise). */
export function buildPlanPathRevision(plan: AccumulationPlan): PlanPathRevision | null
export function planPathToRevision(answers: PlanPathAnswers, context: PlanPathContext): PlanRevisionInput
export function previewPlanPathRevision(answers: PlanPathAnswers, context: PlanPathContext, today: Date): RevisedPlanResult
```

The engine (`lib/utils/accumulationPlanUtils.ts`) gains three things, each with its case in
`__tests__/accumulationPlanRevision.test.ts`:

```ts
// PlanRevisionInput gains:
/** The first intact instalment the caller built the revision on; another one today → `plan_moved`. Absent = not checked. */
expectedFirstIndex?: number;
// RevisedPlanResult's first failure gains the issue 'plan_moved':
//   in buildRevisedPlan, right after `k` is known:
//   if (revision.expectedFirstIndex !== undefined && revision.expectedFirstIndex !== k) return { ok: false, issue: 'plan_moved' };
/** The draft the gate reads for a revised plan: its fields, the executed sales left out (they already left the ledger). */
export function revisedPlanGateDraft(plan: AccumulationPlan): AccumulationPlanDraft
```

`revisedPlanGateDraft` is the object `revisePlan` builds today at `lib/services/accumulationPlanService.ts:417-426`;
`revisePlan` calls it, and so does the summary: one gate, two readers. `DraftIssueCode` and `DraftIssueContext`
(`lib/utils/accumulationNarrative.ts:87-112`) gain `plan_moved`, and `describeDraftIssue({ code: 'plan_moved' })`
= «Il piano è cambiato mentre lo rivedevi: ricarica la pagina.» — `revisePlan` already turns a failed result into
`describeDraftIssue({ code: result.issue })` (`accumulationPlanService.ts:409-414`), so the sentence reaches the path with no other change.
NOVE-25's executor does not pass `expectedFirstIndex` (it builds and writes inside one press, on plans it just
read).

- **`fromModel`** = `searchParams.da === 'modello'`, read by `app/dashboard/allocation/piano/page.tsx` from its
  `searchParams` prop and handed to `PianoClient` as the prop `fromModel` — the way the Consulente's page hands
  `startFresh` (doc/guide/consulente.md § Per-page blind spots); the path's module reads it only inside a revision (V1).
- **`initialPlanPathDraft`** with `context.revision`: `start: 'model'` when `context.fromModel` and the model has
  weights (`Object.keys(modelWeightMap(context.model)).length > 0`), else `'plan'`; `months = plan.months −
  closedCount`; `monthlyInflowEur` and `reserveEur` (V3) from `plan.liquidity`; `sourceIds` =
  `plan.liquidity.sourceCashAssetIds` filtered to the assets that exist and are `isPlanSourceAccount` (V10);
  `positions = seedPlanPathPositions(start, context)`; `sales` = the plan's open saved sales
  (`isOpenSavedDisposal`) as `{ assetId, quantity: disposal.quantity ?? null, month:
  disposalMonthIndex(disposal) }`; `wantsSales: sales.length > 0`; `revisesPlanId = plan.id`; `revisionCount =
  plan.revisions?.length ?? 0`; `revisesFromIndex = revision.firstIndex`; `name = plan.name`. The answers then
  pass through `reconcilePlanPathAnswers` (NOVE-22): a position member whose asset is gone is dropped, and every
  held buyable instrument without a row — one bought after the activation — gets its row at 0 %.
- **`seedPlanPathPositions`** in a revision: `'plan'` → `plan.positions`; `'model'` →
  `applyModelToPositions(plan.positions, model, sold, labelOf)` (`lib/utils/accumulationPlanUtils.ts:1348`, the
  editor's «Rivedi dal modello», `AccumulationPlanDialog.tsx:366-373`; `sold` = the assets of the answers' whole
  sales); `'today'` → `plan.positions` with every quota replaced by `planPathTodayWeights` — in both, a row the
  plan holds stays a row.
- **`describePlanPathBlock`** in a revision: `durata` — «Scrivi quanti mesi restano, da 1 a {60 − closedCount}.»;
  `vendite` — a sale whose month is after `closedCount + months` → the `sale_month_out` sentence; a NEW sale, or a
  saved one whose month the user changed, with a month before `firstIndex` cannot be typed (the select does not
  list it); an open saved sale still at its saved month before `firstIndex` (V4) is valid and blocks nothing; a
  locked sale has no control, hence no block.
- **`planPathToRevision`** — `<the sales as disposals>` is NOVE-22's, with one rule more: for an asset with an
  open saved sale, when `(sale.quantity ?? held) === (saved.quantity ?? held)` (`held` = the asset's quantity) the
  disposal carries `saved.quantity` as it is stored, so a sale of every share typed as a number and one stored
  without a quantity never read as a change:

```ts
const diff = diffRevisionDisposals(plan, <the sales as disposals>);   // open saved ones as they now read + the new
return {
  monthlyInflowEur: answers.monthlyInflowEur!,
  reserveEur: resolvePathReserveEur(answers, context),
  remainingMonths: answers.months!,
  positions: answers.positions,
  sourceCashAssetIds: answers.sourceIds,
  disposals: diff.newDisposals,
  removedDisposalAssetIds: diff.removedDisposalAssetIds,
  movedDisposalMonthIndexes: diff.movedDisposalMonthIndexes,
  expectedFirstIndex: revision.firstIndex,
  ...(plan.advisorNotes?.length ? { advisorNotes: [] } : {}),
  ...(plan.reviewMonthIndex !== undefined && plan.reviewMonthIndex > closedCount + answers.months! ? { reviewMonthIndex: null } : {}),
};
```

- **`previewPlanPathRevision`** = `buildRevisedPlan(plan, planPathToRevision(answers, context), assetsById, deps,
  today)` (V7). `firstPlanPathRefusal` in a revision: the first screen block; else the result's issue in words
  (`describeDraftIssue` for `months_range`, `sale_month_range`, `plan_moved`, and `duplicate_asset` with the
  asset's name as `label`; `nothing_to_revise` is not reached: the host does not open the path, decision 98);
  else the first message of `validateDraftAgainstAssets(revisedPlanGateDraft(result.plan), assetsById)` — the
  whole plan's months, `firstIndex` 1, as `revisePlan` runs it; else null.
- **`restorePlanPathDraft`** (NOVE-22) gains the revision's rule, before its own: with `context.revision`, a
  stored draft is kept — `{ ...stored, answers: reconcilePlanPathAnswers(stored.answers, context) }` — only when
  `stored.answers.revisesPlanId === revision.plan.id`, `stored.answers.revisionCount ===
  (revision.plan.revisions?.length ?? 0)` and `stored.answers.revisesFromIndex === revision.firstIndex` (V6);
  any other stored draft — a create draft included — gives `initialPlanPathDraft(context)`. Without
  `context.revision`, a stored draft that carries `revisesPlanId` gives `initialPlanPathDraft(context)` (the
  plan it revised is closed).

### 4.2 The screens in a revision (`components/allocation/piano/`, `lib/utils/planPathNarrative.ts`)

`PianoClient`: of NOVE-22's active-plan branch (G7) one half goes — an active plan WITH an intact instalment
(`buildPlanPathRevision(plan) !== null`) builds `context.revision` and renders the wizard; one WITHOUT keeps the
tile of decision 98 (`ACCUMULO_PLAN_NOTHING_TO_REVISE`, the link `ACCUMULO_OPEN_LINK`). The wizard is mounted, as
in NOVE-22, only on plans fetched after mount. The title stays «Piano di accumulo»; in a revision the
`PageHeader`'s description reads «Rivedi il piano: le rate chiuse restano come sono.»

`planPathScreenCopy` gains the revision's wording; the bodies are NOVE-22's with these differences:

| Screen | Question in a revision | Difference |
| --- | --- | --- |
| partenza | «Da dove ripartono le quote?» | the three choices of V2 («Dal portafoglio modello» under NOVE-22's rule: a model with weights); help: «Le rate già chiuse non cambiano.» |
| versamento | «Quanto versi ogni mese, da adesso?» | prefilled |
| durata | «Quanti mesi restano?» | no chips; help: «{n} rate sono chiuse; la prossima è {mese}.» (`closedCount`, `firstMonth`); with `closedCount` 0, «La prossima rata è {mese}.» |
| conto | unchanged | prefilled (V10) |
| riserva | unchanged | the plan's figure as typed (V3) |
| vendite | «Cambi le vendite?» | above the choice, the locked sales as plain lines — «{nome} · {n} quote · già venduta» (`executed`), «{nome} · {n} quote · saltata» (`skipped`), «{nome} · {n} quote · da confermare nel Registro» (`planned` with `transactionIds`); a sale without `quantity` reads «tutte le quote» in place of «{n} quote». An instrument with a locked sale has no «Vendi» row (V12). The open saved sales arrive ticked. The month select lists `firstIndex … closedCount + months` as «{mese} ({k}º)» with `k` the plan's index; for a late sale (V4) its saved month comes first, as «{mese} · in ritardo» |
| strumenti | unchanged | — |
| riepilogo | «Confermi la revisione?» | from `previewPlanPathRevision`, in this order: «{n} rate da {mese}: la prossima di {€}.» (`n` = the months left, the month and the planned total — Σ of the lines' `plannedAmountEur` — of the result's instalment `firstIndex`; a first instalment the reserve takes whole reads its 0 €); one `describeSaleStep` sentence per entry of `listSaleSteps({ installments: result.plan.installments.filter((i) => i.index >= firstIndex), disposals: result.plan.disposals, firstIndex, nameOf: labelOf })` (NOVE-23); one line per sale that changes — «{nome}: tolta», «{nome}: spostata a {mese}», «{nome}: nuova, {n} quote a {mese}», «{nome}: da {a} a {b} quote, a {mese}» (a saved sale whose shares change: ONE line, though the engine sees removed + new; «tutte le» in place of a number for every share); the tax line of each new sale and their total, as NOVE-22; `describeInsufficientLiquidityWarning` and `describeUnpricedWarning` on `result.liquidity` and the revised positions, as NOVE-22; the box of the model (NOVE-22 G9). Primary: «Conferma»; while it writes, «Rivedo il piano…» and disabled (V11) |

### 4.3 «Conferma» in a revision

```ts
await revisePlan(plan.id, planPathToRevision(answers, context), { allAssets: assets, deps: DEPS, today: new Date() });
let modelError: string | null = null;
if (updateModel) {
  try { await saveModelPortfolio(ownerId, { weights, origin: 'manual', optimizerSnapshot }, assets, basis); }
  catch (error) { modelError = describeWriteError(error); }
}
```

`weights` and `basis` as NOVE-22 (`planPositionsToModelWeights(answers.positions, …)`); `optimizerSnapshot` =
`answers.start === 'model' ? context.model?.optimizerSnapshot : plan.optimizerSnapshot` — the editor's rule
(`AccumulationPlanDialog.tsx:272`, `:369-373`). NOVE-22's month check (G16) does not run in a revision: the
revision starts from the plan's first intact instalment, whatever the month.

Invalidations as NOVE-22; the stored draft cleared; `PathDoneCard` (`ariaLabel="Piano rivisto"`, V8) with the
link `ACCUMULO_OPEN_LINK`; with a `modelError`, `describeModelNotUpdated(modelError)`
(`lib/utils/accumuloCopy.ts`) as a second help line. A failure of `revisePlan` → `status` (tone `failure`) with
`describeWriteError(error)` — the gate's first message, the `plan_moved` sentence, the service's sentence for a
plan interrupted meanwhile — and nothing was written; the answers stay.

### 4.4 The doors (`components/allocation/tiles/QuestoMeseTile.tsx`)

- The footer's «Rivedi il piano» (`:866-868`): `Button asChild` → `Link href="/dashboard/allocation/piano"`;
  where it is disabled today (demo, no intact instalment) it stays a disabled `Button` with the same label and
  no link.
- «Rivedi dal modello» (`:603-615`): → `/dashboard/allocation/piano?da=modello`.
- The review month's note (written by NOVE-23): its «Rivedi il piano» becomes the same link as the footer's.
- `reviseDialog` (`:365-383`), `reviseOpen`, `reviseFromModel`, the import of the modal and every prop of
  `QuestoMeseTileProps` that only the two dialogs read — `targetLeverageRatio`, `idealAllocation`, `modelBasis`,
  `onAssetsChanged`, `investmentAccountId` — leave the file, and `AccumuloTab` stops passing them; a prop of this
  list that `grep -w` still finds read elsewhere in the file stays.

### 4.5 What is deleted

- `components/allocation/AccumulationPlanDialog.tsx` (1.809 lines on 2026-11-19, after NOVE-23, with the `SaleMonthSelect` and
  `emptyDraft` NOVE-23 exported from it), `components/allocation/PlanDraftSidePanel.tsx` (170 lines) and
  `components/allocation/OptimizerPanel.tsx` — its only importer is the editor
  (`AccumulationPlanDialog.tsx:82`); the model's dialog and «Obiettivi» import `OptimizerObjectivesReport` and
  `ObjectiveBars`, which stay — and with it the export `OptimizerReport` of
  `components/allocation/OptimizerReport.tsx`, read by `OptimizerPanel.tsx:40` alone.
- `lib/utils/accumulationPlanUtils.ts`: `groupPositions`, `separatePosition`, `replaceBuyAsset`. Their cases live
  in `__tests__/accumulationPlanReviewFlow.test.ts` (the import list and every case that calls them go, the
  header's «Raggruppa, Separa and Sostituisci» is rewritten); the file stays for its engine cases.
- The component tests of the deleted files: `__tests__/planDraftSidePanel.test.tsx` and
  `__tests__/accumulationPlanDialogSaleMonth.test.tsx` (written by NOVE-23). The
  `vi.mock('@/components/allocation/AccumulationPlanDialog', …)` lines of `__tests__/accumuloVuotoTile.test.tsx`
  (`:23`), `__tests__/portafoglioModelloTile.test.tsx` (`:32`) and `__tests__/questoMeseTile.test.tsx` are
  removed. `__tests__/accumulationPlanRevision.test.ts` tests the pure engine and stays.
- `lib/utils/accumulationNarrative.ts`, with their test cases: `describeModelWriteAfterPlan` (`:733`; the path
  reads `describeModelNotUpdated`), `describeAccumuloDialogEyebrow`,
  `ACCUMULO_STEP_READINGS`, `ACCUMULO_STEP_TITLES`, every `ACCUMULO_STEP1_*`, `ACCUMULO_STEP2_*` and
  `ACCUMULO_STEP3_*` constant, `ACCUMULO_ACTION_SAVE_DRAFT`, `ACCUMULO_ACTION_SAVE_REVISION`,
  `ACCUMULO_ACTION_BACK`, `ACCUMULO_ACTION_NEXT`, `ACCUMULO_ACTION_GROUP_PROXY`, `ACCUMULO_ACTION_GROUP_CANCEL`,
  `ACCUMULO_ACTION_UNGROUP`, `ACCUMULO_ACTION_NEW_ASSET`, `ACCUMULO_ACTION_REPLACE`,
  `ACCUMULO_ACTION_REPLACE_CANCEL`, `ACCUMULO_ACTION_CLOSE_EDITOR`, `ACCUMULO_ELLIPSIS`, `PLAN_PREVIEW_EMPTY`,
  `describeStep1InflowsLabel`, `describeStep2Shares`, `describeWeightsTotal`, `describeWeightsSum`,
  `describeRefillNote`, `describeReserveOrigin`, `describeAddableAsset`, `ACCUMULO_USE_SUGGESTED_INFLOW`.
- `lib/utils/weightOptimizerNarrative.ts`: `OPTIMIZER_STEP2_ARIA_LABEL`, `describeOptimizerSnapshot`.
- **The rule that closes the list** (it decides, the lists above are its expected result): after the three files
  are gone, EVERY export of `lib/utils/accumulationNarrative.ts`, `lib/utils/weightOptimizerNarrative.ts` and
  `lib/utils/accumulationPlanUtils.ts` that `git grep -w <name> -- app components lib` finds on no line but its
  own definition is deleted, with its cases wherever they live (`accumulationNarrative.test.ts`,
  `accumuloTileSentences.test.ts`, `accumulationReactivate.test.ts`, `weightOptimizerNarrative.test.ts`,
  `accumulationPlanReviewFlow.test.ts`); the pass is repeated until one deletes nothing (a scratchpad script
  prints the names of each pass). A name of the lists above that still has a reader stays: the path reads
  `describeStep3Summary` (and through it `describeInstallmentAverage`), `describeInsufficientLiquidityWarning`,
  `describeUnpricedWarning`, `describeSuggestedInflow`, `describeSaleStep`, `listSaleSteps`.
- The comments that name the deleted files (`git grep -n 'AccumulationPlanDialog\|PlanDraftSidePanel\|OptimizerPanel'
  -- app components lib __tests__ e2e`) are rewritten to name the path or the model's dialog; the grep ends empty.

### 4.6 The route's budget

`perf:budget` sums a route's INITIAL scripts (`scripts/perfBudget.mts:96`), and the editor lived in the Accumulo
tab's lazy chunk (`perf/budget.json`, `/dashboard/allocation`'s `raisedBy`): the route's measure is expected to
read as before. Every route is measured before and after on the same machine (README § 8); a ceiling moves only
by `npm run perf:budget -- --write` when a route's measure fell (doc/guide/velocita.md § Il ratchet e il tetto alzato: it lowers,
never raises, and drops the `raisedBy` of a lowered entry), never by hand. `/dashboard/allocation/piano` is
re-measured (the revision adds no module: `buildRevisedPlan` is in the engine's) under README § 8's rule. The
lazy chunk's shrink is read from `npm run perf:budget -- --top=15` before and after, and written in the commit
message, not in `perf/budget.json`.

## 5. Constraints and traps (AGENTS.md / DESIGN.md, «here it means that»)

- **A revision never rewrites the past** (doc/guide/accumulo.md): instalments `1 … k−1`, their measurements and
  the baseline are untouched — `buildRevisedPlan` guarantees it; the path never builds a calendar of its own.
- **`revisePlan` is the only writer and runs the gate** (`accumulationPlanService.ts:397-424`): the path calls it
  with the SAME `PlanRevisionInput` the summary previewed — one object, built once per render by
  `planPathToRevision`.
- **A saved sale whose shares change is «removed + new»** (`diffRevisionDisposals`,
  `accumulationPlanUtils.ts:558-583`): the summary says «{nome}: da {a} a {b} quote, a {mese}», not two lines.
- **Executed, skipped or linked sales never move** (`isOpenSavedDisposal`): they are lines, not controls, and
  `diffRevisionDisposals` drops in silence a new sale on their asset (`:568`) — hence V12: the row is not offered.
- **The first intact instalment looks at the instalments' lines only** (`findFirstIntactInstallment`, `:591-598`):
  an open sale can sit in a month before it (V4).
- **The plans are in the persisted cache** (doc/guide/cache-persistita.md): the wizard waits for the fetch after
  mount (NOVE-22), and the write carries `expectedFirstIndex` (V9) for what changes after it.
- **The total of months is at most 60** (`buildRevisedPlan`'s `months_range`): the block on «durata» says the
  bound that is left.
- **The deletion is proved by the compiler and a search**, not by a snapshot: `npx tsc --noEmit` clean, the
  closing rule of § 4.5 run to an empty pass, `knip` is not in the repo and is not added.
- **Groups**: a plan with a group (from the model) is revised with the group as one row; its buyer cannot be
  changed here — «Rivedi dal modello» after changing the model does it (declared in the guide).
- **React Compiler / purity**: `today` is the mount's; `previewPlanPathRevision` runs on the summary only.
- **No series label in code**; **no owner data in a tracked file**.
- **Tests that move** (edited on purpose): `__tests__/pianoClient.test.tsx` — the active-plan case becomes «an
  active plan with an intact instalment → the wizard in revision», the closed-plan case (decision 98) stays;
  `e2e/accumulo.piano.spec.ts`'s test «an active plan → «Hai già un piano di accumulo attivo»» is replaced by
  this spec's E1; `__tests__/questoMeseTile.test.tsx` (written by NOVE-23) — the review note's case asserts the
  link; `e2e/accumulo.spec.ts`'s test of the review month's note (`seedAccumuloFixture({ reviewAtOpenMonth: true
  })`) asserts that its link opens the path in revision; `e2e/accumulo.mobile.spec.ts:78-80` — the touch-target
  loop reads «Rivedi il piano» as `getByRole('link')`, «Calendario» and «Interrompi» stay buttons. The helper
  `walkPlanPath` (NOVE-22) serves the revision's tests.

## 6. Tests per level (with the mutation that proves each)

| # | Test | Mutation that turns it red |
| --- | --- | --- |
| U1 | `__tests__/planPath.test.ts` › revision: an active plan of 12 months with 4 closed → `start: 'plan'`, months 8, the plan's accounts, reserve, positions, its open sale in month 6, `revisesFromIndex: 5`; with `fromModel` and a model with weights → `start: 'model'` and the model's quotas on the plan's rows; with `fromModel` and no model → `'plan'`; a source account of the plan deleted since → not in `sourceIds`; an instrument bought after the activation → a row at 0 % | take `plan.months` as the months left |
| U2 | same › `planPathToRevision`: the open sale untouched → no diff; its quantity 10 → 6 → one removed + one new; moved to month 9 → `movedDisposalMonthIndexes`; unticked → removed; a new sale in month 7 → `disposals` with `monthIndex: 7`; a saved sale of 40 with 40 held, the answer's quantity `null` → no diff; `expectedFirstIndex: 5` | send the open sales as new |
| U3 | same: with an executed sale on ETF A and an answer that sells ETF A again, `planPathToRevision` names A in none of the three fields; the screen offers no row for A (R3) | — (the engine's guard, `accumulationPlanRevision.test.ts`, proves the silence; the screen's case is R3) |
| U4 | same › `previewPlanPathRevision` + `firstPlanPathRefusal`: valid answers → `ok` with instalments 5…12 rewritten and 1…4 identical to the plan's; 57 months left with 4 closed → `firstPlanPathRefusal` gives the durata block «Scrivi quanti mesi restano, da 1 a 56.» (the screen's block comes first) and `previewPlanPathRevision` gives `{ ok: false, issue: 'months_range' }`; a plan with an executed sale of every share → no gate refusal (`revisedPlanGateDraft` leaves it out) | preview with `buildDraftPreview`; gate on every disposal |
| U5 | same: a plan with `advisorNotes` → `advisorNotes: []`; without → the key absent; `reviewMonthIndex` 10 with the plan shortened to 8 months in all → `reviewMonthIndex: null`; still inside → the key absent | always send `advisorNotes: []` |
| U6 | same › `restorePlanPathDraft`: a stored revision of another plan id, of the same plan after one more revision, or of the same plan with one more instalment closed → the initial revision draft; a stored create draft with an active plan → the initial revision draft; a stored revision draft with no active plan → the initial create draft; the matching one → kept, on its screen | compare the id and the count only |
| U7 | `__tests__/accumulationPlanReviewFlow.test.ts` compiles without the three functions and keeps its engine cases green; `__tests__/accumulationNarrative.test.ts` and `weightOptimizerNarrative.test.ts` without the deleted names | a deleted name left imported (`tsc` red) |
| U8 | `__tests__/accumulationPlanRevision.test.ts`: `expectedFirstIndex: 5` on a plan whose first intact instalment is the 6th → `{ ok: false, issue: 'plan_moved' }`; absent → revised as today; `describeDraftIssue({ code: 'plan_moved' })` is the sentence; `revisedPlanGateDraft` has no executed sale | drop the check |
| R1 | `__tests__/pianoScreens.test.tsx` › riepilogo in a revision: «8 rate da {mese}: la prossima di 800 €.», a `describeSaleStep` sentence for a later sale, the four lines of the changed sales (tolta, spostata, nuova, da 10 a 6 quote), the refusal in `status` | read the first instalment of the whole plan; print «tolta» and «nuova» for a changed quantity |
| R2 | `__tests__/questoMeseTile.test.tsx` (written by NOVE-23, extended): the three doors are links with the two hrefs, the review note's included; in demo a disabled button and no link | keep `setReviseOpen` |
| R3 | `pianoScreens.test.tsx` › vendite in a revision: the three locked lines («già venduta», «saltata», «da confermare nel Registro») without controls, «tutte le quote» without a quantity; an instrument with an executed sale has no checkbox; the month select starts at the first open month; a late open sale (month 3, first open 5) shows «{mese} · in ritardo» and «Avanti» is enabled | list month 1; block every month before the first open; list every held instrument |
| R4 | `__tests__/pianoWizard.test.tsx` (NOVE-22's, extended; `revisePlan` and `saveModelPortfolio` mocked) › «Conferma» in a revision: a pending write → the button disabled, one call for two clicks; `revisePlan` rejecting → the sentence in `status`, no done card; the model's write rejecting → the done card with `describeModelNotUpdated` | await nothing (two calls) |
| E1 | `e2e/accumulo.piano.spec.ts`: the active fixture `seedAccumuloFixture({ saleMonthOffset: 2 })` (its sale open, two months ahead) → «Rivedi il piano» → the path prefilled → monthly amount changed → «Conferma» → the done card; firebase-admin: the closed instalments deep-equal to before, the open ones rewritten, one more `revisions` row | pass `plan.months` as `remainingMonths` |
| E2 | same fixture: the open sale moved one month later → its `monthIndex`; a new sale → present with its month | send no `movedDisposalMonthIndexes` |
| E3 | same: «Rivedi dal modello» → `?da=modello`, «Dal portafoglio modello» chosen, the model's quotas on screen 7 | ignore `fromModel` |
| E4 | same: a reload on screen 5 keeps the revision; then one more `revisions` row is written through firebase-admin (the browser draft untouched) → reload → the path restarts from the plan, on screen 1 | keep any stored draft of the same plan id |
| E5 | `e2e/accumulo.piano.mobile.spec.ts`: the revision at 390 without horizontal overflow | a locked line that does not wrap |

Every E test that writes calls `removeOwnerPlans()` (`e2e/accumuloFixture.ts`) in `afterEach` and deletes the
model document it wrote.

## 7. Guided verification (WORKFLOW.md § 2)

Expected outcome, declared first: on the active fixture the path opens on the plan's own answers; a revision
confirmed in the path leaves the closed instalments identical and writes, for the same answers, the same document
the modal wrote on `develop`; the three doors lead to the path; the modal's files and sentences are gone and the
app builds; the Accumulo tab's lazy chunk weighs less.

- **A**: `npx tsc --noEmit`, lint, Vitest in three zones, `npx playwright test e2e/accumulo e2e/allocation` in
  every project; the closing rule of § 4.5 (a scratchpad script prints the names each pass deletes and ends on
  an empty pass); the comments' grep of § 4.5 empty.
- **B**: emulators + `emulators:seed` + `dev:emulator`; BEFORE any edit of this spec, on the session branch as it
  was cut, a scratchpad script records the plan document after a revision made in the MODAL on
  `seedAccumuloFixture({ saleMonthOffset: 2 })` with fixed answers (inflow +100, one month less, the open sale
  moved by one month, one new sale); the fixture is re-seeded and the same answers go through the PATH: the two
  documents are compared field by field (ids of new sales and timestamps apart). The fixture carries no
  `advisorNotes` and no `reviewMonthIndex`, the two fields V5 changes on purpose.
- **C (browser)**: 390, 768×1024, 1024×768, 1440, light and dark: the eight screens in a revision, the three
  locked lines, a late sale's month, the summary's four lines for a sale taken off / moved / new / changed, the
  done card; the plan with no intact instalment (decision 98's tile); the three doors.
- **D (data)**: `accumulationPlans/<id>` after «Conferma»: instalments `1…k−1` unchanged (deep-equal by the
  script), `revisions` + 1, `liquidity`, `positions`, `disposals` (months), `advisorNotes` cleared on a plan that
  had them, `reviewMonthIndex` kept or cleared by V5.
- **E (edges)**: months left = 1; a group from the model as one row; the last open month as a sale's month; a
  late open sale left as it is → the revision keeps its month; untick every account → block; 60 − closed + 1
  months → the bound's sentence; the plan interrupted in another tab while the path is open → «Conferma» refuses
  with the service's sentence and nothing is written; an instalment confirmed in another tab while the path is on
  the summary → «Conferma» refuses with the `plan_moved` sentence, and after the reload the path restarts from
  the plan; a source account deleted since the activation → not ticked on «conto»; `?da=modello` typed with no
  plan → the create path, the parameter ignored; double click on «Conferma» → one `revisions` row; a monthly
  amount of 0 with the cash under the reserve → the summary's first line with 0 € and the insufficient-liquidity
  warning.
- **F (owner, at «pronto»)**: the mirror (`npm run mirror:seed -- <email>`): the owner revises his mirrored plan
  from each of the three doors and says whether a screen asks something he cannot answer; he looks for an operation
  of the old modal he misses. `npm run mirror:remove`.
- **G**: `npm run perf:budget`, every route green, with `-- --top=15` before and after (§ 4.6: the chunk that
  held the editor gone or smaller; `/dashboard/allocation`'s initial JS as before; the path's route re-measured);
  `mobile:census` + `mobile:budget`: the entry `allocazione-accumulo` in each viewport block must read as on
  `develop` (the active tile's buttons become links of the same class), every other entry too; stop the servers,
  delete the scripts, remove the mirror.

## 8. Putting it into service

One PR to `develop`; no rule, no index, no migration. After the deploy the owner opens «Rivedi il piano» once on
his production plan and leaves the path without confirming («Ricomincia» clears the browser draft).

## 9. Documentation

- `doc/guide/accumulo.md`: the section «Creare un piano: il percorso» (NOVE-22) is renamed «Il percorso: creare e
  rivedere» and gains «Rivedere» (what is prefilled, what is locked, the late sale, the summary from
  `buildRevisedPlan`, V5, V6, V9); the bullets of § Rules that still describe the editor («Rivedi il piano» in
  the modal) are rewritten on the path or deleted; § Files loses the three files; § Per-page blind spots: «a
  group's buyer changes from the model, then «Rivedi dal modello»»; «a browser draft of a revision is dropped
  when the plan changed».
- `doc/guide/ottimizzatore.md`: the optimizer is reached from the model's dialog only (the plan's step 2 panel is
  gone); § Files loses `OptimizerPanel`. `doc/guide/dialog.md` and `CLAUDE.md` «Dialogs and forms»: the mounts
  re-counted with `grep -rnw '<ResponsiveModal' components app` after the deletion (README § 8), the figure and
  its date rewritten — never «− 1» on the written number.
- `AGENTS.md` § 3 Allocazione › Accumulo: the stub's bullet («a plan is created and revised by the path; no
  editor»). `CLAUDE.md`: «Latest» REPLACED, not extended; in the Accumulo clause of Key Features the words on the
  path say «creato e rivisto» at equal or shorter length; under 20.000 characters, measured with the command of
  README § 8 — a fact that does not fit moves to doc/guide/accumulo.md. `README.md` and `Draft Release Temp.md`:
  «Rivedi il piano» is the same path.
- `doc/guide/velocita.md` § Registro dei tetti alzati: a row only for a ceiling `--write` lowered; the lazy
  chunk's figures go in the commit message.
- `doc/nove/NOVE-20-temi-giro-b.md` (implemented after this one): every citation of `AccumulationPlanDialog.tsx`,
  `PlanDraftSidePanel.tsx` and `OptimizerPanel.tsx` is removed with the targets it named (its counts of targets
  re-counted where it prints one), and the path's screens (`components/allocation/piano/PianoScreens.tsx`) are
  named in their place where the target was a control the path also has (a field, a `Select`, a row of the
  list). In the same commit.
- `doc/nove/README.md`: § 6 the row; § 7 the path's contracts as extended (`PlanPathRevision`,
  `buildPlanPathRevision`, `planPathToRevision`, `previewPlanPathRevision`, `revisedPlanGateDraft`,
  `expectedFirstIndex`, `plan_moved`), the editor's contracts removed; § 4 choice ad closed.

## 10. Declared out of scope

- **Changing a group's members or buyer in a plan**: none, declared — the model owns groups (decision 89).
- **Revising closed instalments**: none, declared (the engine's rule).
- **A review month typed by hand**: none, declared (decision 69).
- **Revising a DRAFT**: a draft is continued (NOVE-22), not revised.
- **A plan whose months are all in the past but with an intact instalment**: revised like any other, from that
  instalment — the engine's rule, declared.
- **A source account that became a money-market fund after the activation**: not pre-ticked (V10); its balance is
  not moved by the path, declared.
- **Two tabs revising the same plan**: both revisions are written, the second on the first's result, as today
  (a revision closes no instalment, so `plan_moved` does not fire) — declared.
- **The costume on the path** → NOVE-20, re-pointed by § 9.

## 11. The prompt that implements it

```
Ciao, in questa sessione vorrei implementare la spec doc/nove/NOVE-26-rivedere-nel-percorso.md

Contesto, prima di toccare qualsiasi file (le regole del repo cambiano il modo di lavorare):
- Leggi WORKFLOW.md (regole di sessione e di collaudo; l'ultima sezione dice come si
  applicano in questo repo)
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- CLAUDE.md (l'indice: che cos'è e dove sta ogni cosa, lo stato corrente) è già nel
  contesto: usalo per trovare la guida giusta
- Leggi la spec doc/nove/NOVE-26-rivedere-nel-percorso.md e l'indice della serie
  doc/nove/README.md (§ 3 decisioni, § 4 scelte adottate, § 7 contratti condivisi, § 8 regole)
- Leggi doc/guide/accumulo.md, doc/guide/ottimizzatore.md, doc/guide/dialog.md,
  doc/guide/cache-persistita.md, doc/guide/velocita.md, doc/guide/prima-schermata.md,
  doc/guide/e2e-emulatori.md e doc/guide/e2e-playwright.md PRIMA di scrivere codice in quei
  domini
- Leggi DESIGN.md (The Path-Scene Rule, The Absence-Has-Three-Names Rule, Small-Screen
  Composition) e PRODUCT.md
- Leggi COMMENTS.md e DEVELOPMENT_GUIDELINES.md: il codice che scrivi li segue

Controlla i processi rimasti da sessioni precedenti: node ~/.claude/processi-collaudo.mjs

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

Implementa la spec così com'è scritta, nell'ordine: PRIMA di tutto registra con lo script
della § 7 B il documento che la finestra scrive su una revisione a risposte fisse; poi il
motore (§ 4.1: expectedFirstIndex, revisedPlanGateDraft) con U8 e il modulo del percorso con
U1-U6; le schermate in revisione (§ 4.2); «Conferma» (§ 4.3) con R4; le tre porte (§ 4.4);
il confronto della § 7 B; SOLO a confronto riuscito le eliminazioni (§ 4.5) con U7 e il
budget (§ 4.6). I test PRIMA del codice, ciascuno visto rosso con la sua
mutazione; cifre inventate e tonde. Fermati e chiedimi se: il documento scritto dal percorso
differisce da quello della finestra a parità di risposte; una rata chiusa cambia di un
centesimo; un nome della § 4.5 ha un lettore che la spec non nomina; mi accorgo che manca
un'operazione della finestra che la decisione 89 non ha tolto; perf:budget o mobile:budget
diventano rossi oltre la regola della § 8 dell'indice.
Collaudo: § 7, la F sul mirror al mio «pronto» (rivedo io il piano dalle tre porte). Un
branch, un commit, solo dopo il mio OK con il riassunto del diff. SESSION_NOTES.md non si
committa.
```

Model: **Opus 5.5**, effort **medium** — an M spec on a shared contract (the path's module, `PlanRevisionInput`)
with a deletion of ~2.300 lines whose equivalence must be proved against the engine. Estimated size: 1 session,
~5 h; ~200 lines pure, ~220 across components, ~420 of tests (U1–U8, R1–R4), five E2E tests and the moved ones;
~2.300 lines deleted.
