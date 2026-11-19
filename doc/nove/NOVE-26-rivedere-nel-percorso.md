# NOVE-26 — The guided path revises an active plan; the editor is deleted

> Series `doc/nove/` (README.md § 5): **depends on NOVE-22** (the path: `planPath.ts`, `PathCard`, the route
> `/dashboard/allocation/piano`), on **NOVE-23** (a revision keeps a new sale's month, `reviewMonthIndex`, the note
> «Rivedi il piano» of the review month) and **NOVE-25** (`advisorNotes`, `PlanRevisionInput.advisorNotes`). Last of
> the five specs of «dal Consulente al piano di accumulo, in un clic»: «Rivedi il piano» and «Rivedi dal modello»
> open the same eight screens, prefilled with the plan, and `AccumulationPlanDialog` leaves the repo.
> Written on 2026-11-19; every `file:line` is cited on `develop` @ 7909fa4c. Executes decision 87 in full and
> decision 91's second half (README.md § 3).

## 1. The problem today (evidence on the code)

**After NOVE-22 two forms describe one plan.** A plan is created in the path and revised in the modal: the same
questions — how much a month, how long, which account, what to sell, which quotas — asked in two shapes, with two
copies of every sentence (`lib/utils/accumulationNarrative.ts` holds 87 exports that only
`components/allocation/AccumulationPlanDialog.tsx` and `PlanDraftSidePanel.tsx` read, counted on 2026-11-19).

**The modal's revision is the create form with exceptions.** `draftForRevision`
(`AccumulationPlanDialog.tsx:258-270`) rebuilds a draft from the first intact instalment; step 1 swaps «Durata» for
«Mesi restanti» and adds a note (`:967`); the saved sales are locked by a set (`lockedSaleIds`, `:463`) and the
changes diffed at save (`revisionChanges`, `:482`; `handleRevise`, `:695-721`); its preview is `buildDraftPreview`
on that draft (`:725`), not the calendar `revisePlan` will write.

**Three engine functions and two entry points exist only for the modal's advanced operations**, which decision 89
removed from the product: `groupPositions`, `separatePosition`, `replaceBuyAsset`
(`lib/utils/accumulationPlanUtils.ts`), and the optimizer's panel inside step 2.

**«Rivedi il piano» has three doors**: the footer button (`components/allocation/tiles/QuestoMeseTile.tsx:866-868`),
«Rivedi dal modello» (`:603-615`) and, since NOVE-23, the review month's note — each sets two pieces of state and
opens the modal (`reviseDialog`, `:365-383`).

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
7. A browser draft of a revision is discarded when the plan changed since it was started. **Proof**: U6.
8. `AccumulationPlanDialog.tsx`, `PlanDraftSidePanel.tsx`, the three engine functions and every sentence only they
   read are deleted; `git grep -w` finds none of the names of § 4.5. **Proof**: U7, § 7 A.
9. A revision made in the path writes the same plan document the modal wrote on the same answers. **Proof**: § 7 B.
10. `perf:budget`: Allocazione's lazy chunk loses the modal; the route's ceiling is lowered. **Proof**: § 7 G.

## 3. Decisions

- **Owner 87 (2026-11-19)**: the path replaces EVERYTHING — create, «Modifica» of a draft, «Rivedi il piano» —
  and the editor is deleted. **Owner 91**: this is the second of the two specs.
- **Owner 89**: no «Raggruppa/Separa» by hand, no «Sostituisci», no «Ottimizzato» in a plan: their code goes.
- **Adopted, reversible (this spec)**:
  - V1. The mode is the open plan's: active → revise; `?da=modello` only preselects the start.
  - V2. In a revision the starts are «Dal piano com'è» (default), «Dal portafoglio modello», «Dai pesi di oggi»;
    «Da zero» is not offered (a revision starts from something).
  - V3. The plan's reserve arrives as a typed figure (the plan's own), with «Torna a {€}» to follow the allocation
    again.
  - V4. A sale's month is the plan's instalment index (absolute); the select lists the open months only.
  - V5. A hand revision passes `advisorNotes: []` when the plan carries notes (they described the Consulente's
    plan, which the owner has now changed) and keeps `reviewMonthIndex` unless it falls after the plan's new end
    (then `null`).
  - V6. A stored revision draft carries the plan's id and its count of revisions; another id or another count
    discards it without a message.
  - V7. The summary's figures come from `buildRevisedPlan` (the engine's own result), not from `buildDraftPreview`.
  - V8. The done card reads «Piano rivisto: prossima rata a {mese}, {€}.»

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
// PlanPathAnswers gains:  revisesPlanId?: string;  revisionCount?: number;

/** null when the plan has no intact instalment (nothing to revise). */
export function buildPlanPathRevision(plan: AccumulationPlan): PlanPathRevision | null
export function planPathToRevision(answers: PlanPathAnswers, context: PlanPathContext): PlanRevisionInput
export function previewPlanPathRevision(answers: PlanPathAnswers, context: PlanPathContext, today: Date): RevisedPlanResult
```

- **`initialPlanPathDraft`** with `context.revision`: `start: context.fromModel && context.model ? 'model' :
  'plan'`; `months = plan.months − closedCount`; `monthlyInflowEur`, `sourceIds`, `reserveEur` (V3) from
  `plan.liquidity`; `positions = plan.positions` (then, for `'model'`, `applyModelToPositions(plan.positions,
  model, sold, labelOf)` — the editor's «Rivedi dal modello», `AccumulationPlanDialog.tsx:358-365`); `sales` = the
  plan's open saved sales (`isOpenSavedDisposal`) with `month = disposalMonthIndex(disposal)`; `revisesPlanId =
  plan.id`; `revisionCount = plan.revisions?.length ?? 0`; `name = plan.name`.
- **`seedPlanPathPositions`**: `'plan'` → `plan.positions`; `'model'` and `'today'` apply onto `plan.positions`
  (not onto a fresh seed), so a row the plan holds stays a row.
- **`describePlanPathBlock`** in a revision: `durata` — «Scrivi quanti mesi restano, da 1 a {60 − closedCount}.»;
  `vendite` — a month outside `firstIndex … closedCount + months` → the `sale_month_out` sentence; a locked sale
  has no control, hence no block.
- **`planPathToRevision`**:

```ts
const diff = diffRevisionDisposals(plan, disposalsOf(answers, context));   // open saved ones as they now read + the new
return {
  monthlyInflowEur: answers.monthlyInflowEur!,
  reserveEur: resolvePathReserveEur(answers, context),
  remainingMonths: answers.months!,
  positions: answers.positions,
  sourceCashAssetIds: answers.sourceIds,
  disposals: diff.newDisposals,
  removedDisposalAssetIds: diff.removedDisposalAssetIds,
  movedDisposalMonthIndexes: diff.movedDisposalMonthIndexes,
  ...(plan.advisorNotes?.length ? { advisorNotes: [] } : {}),
  ...(plan.reviewMonthIndex !== undefined && plan.reviewMonthIndex > closedCount + answers.months! ? { reviewMonthIndex: null } : {}),
};
```

- **`previewPlanPathRevision`** = `buildRevisedPlan(plan, planPathToRevision(…), assetsById, deps, today)` (V7).
  `firstPlanPathRefusal` in a revision: the first screen block, else the result's issue in words
  (`describeDraftIssue` for `months_range`, `sale_month_range`, `duplicate_asset`; `nothing_to_revise` cannot
  happen: the host does not open the path), else the first message of `validateDraftAgainstAssets` on the revised
  plan's draft fields — the gate `revisePlan` runs (`lib/services/accumulationPlanService.ts:413`).
- **`reconcilePlanPathAnswers`** (V6): a stored draft with `revisesPlanId` is kept only when `context.revision`
  exists, `revision.plan.id === revisesPlanId` and `(revision.plan.revisions?.length ?? 0) === revisionCount`;
  a stored CREATE draft met with an active plan is discarded too.

### 4.2 The screens in a revision (`components/allocation/piano/`, `lib/utils/planPathNarrative.ts`)

`PianoClient`: the active-plan screen of NOVE-22 (G7) is replaced — an active plan WITH an intact instalment
builds `context.revision` and renders the wizard; one WITHOUT (every instalment closed) shows «Il piano non ha più
rate da rivedere.» + «Apri Accumulo». The title stays «Piano di accumulo»; the description reads «Rivedi il piano:
le rate chiuse restano come sono.»

`planPathScreenCopy` gains the revision's wording; the bodies are NOVE-22's with these differences:

| Screen | Question in a revision | Difference |
| --- | --- | --- |
| partenza | «Da dove ripartono le quote?» | the three choices of V2; help: «Le rate già chiuse non cambiano.» |
| versamento | «Quanto versi ogni mese, da adesso?» | prefilled |
| durata | «Quanti mesi restano?» | no chips; help: «{n} rate sono chiuse; la prossima è {mese}.» |
| conto | unchanged | prefilled |
| riserva | unchanged | the plan's figure as typed (V3) |
| vendite | «Cambi le vendite?» | above the list, the locked sales as plain lines — «{nome} · {n} quote · già venduta» / «saltata» —; the open saved ones arrive ticked; the month select lists `firstIndex … closedCount + months` |
| strumenti | unchanged | — |
| riepilogo | «Confermi la revisione?» | from `previewPlanPathRevision`: «Da {mese}: {€} al mese per {n} mesi.» (the first revised instalment that buys), one line per sale that changes («tolta», «spostata a {mese}», «nuova»), the taxes of the new sales, the box of the model (NOVE-22 G9). Primary: «Conferma» («Rivedo il piano…») |

### 4.3 «Conferma» in a revision

```ts
await revisePlan(plan.id, planPathToRevision(answers, context), { allAssets: assets, deps: DEPS, today: new Date() });
if (updateModel) await saveModelPortfolio(ownerId, { weights, origin: 'manual', optimizerSnapshot }, assets, basis);
```

Invalidations as NOVE-22; the stored draft cleared; `PathDoneCard` (V8) with «Apri Accumulo». A failure of
`revisePlan` → `status` with `describeWriteError`; a failure of the model after the revision → the done card with
«Il piano è rivisto; il portafoglio modello non è stato aggiornato: {reason}.»

### 4.4 The doors (`components/allocation/tiles/QuestoMeseTile.tsx`)

- The footer's «Rivedi il piano» (`:866-868`): `Button asChild` → `Link href="/dashboard/allocation/piano"`,
  disabled as today (demo, no intact instalment — a disabled link is a `Button disabled`, not a link).
- «Rivedi dal modello» (`:603-615`): → `/dashboard/allocation/piano?da=modello`.
- The review month's note (NOVE-23 § 4.5): its «Rivedi il piano» becomes the same link.
- `reviseDialog` (`:365-383`), `reviseOpen`, `reviseFromModel` and the import of the modal leave the file.

### 4.5 What is deleted

- `components/allocation/AccumulationPlanDialog.tsx` (1.747 lines on 2026-11-19) and
  `components/allocation/PlanDraftSidePanel.tsx`.
- `lib/utils/accumulationPlanUtils.ts`: `groupPositions`, `separatePosition`, `replaceBuyAsset`, with their cases
  in `__tests__/accumulationPlanUtils.test.ts`.
- `lib/utils/accumulationNarrative.ts`, with their test cases: `describeAccumuloDialogEyebrow`,
  `ACCUMULO_STEP_READINGS`, `ACCUMULO_STEP_TITLES`, every `ACCUMULO_STEP1_*`, `ACCUMULO_STEP2_*` and
  `ACCUMULO_STEP3_*` constant, `ACCUMULO_ACTION_SAVE_DRAFT`, `ACCUMULO_ACTION_SAVE_REVISION`,
  `ACCUMULO_ACTION_BACK`, `ACCUMULO_ACTION_NEXT`, `ACCUMULO_ACTION_GROUP_PROXY`, `ACCUMULO_ACTION_GROUP_CANCEL`,
  `ACCUMULO_ACTION_UNGROUP`, `ACCUMULO_ACTION_NEW_ASSET`, `ACCUMULO_ACTION_REPLACE`,
  `ACCUMULO_ACTION_REPLACE_CANCEL`, `ACCUMULO_ACTION_CLOSE_EDITOR`, `ACCUMULO_ELLIPSIS`, `PLAN_PREVIEW_EMPTY`,
  `describeStep1InflowsLabel`, `describeStep2Shares`, `describeWeightsTotal`, `describeWeightsSum`,
  `describeRefillNote`, `describeReserveOrigin`, `describeAddableAsset`, `ACCUMULO_USE_SUGGESTED_INFLOW` — EXCEPT a
  name the path imports (NOVE-22 names `describeStep3Summary`, `describeInsufficientLiquidityWarning`,
  `describeUnpricedWarning`, `describeModelWriteAfterPlan`: they stay). The rule that closes the list: after the two
  files are gone, a name of this list that `git grep -w <name> -- app components lib` finds only at its definition
  is deleted; one the path reads stays.
- `lib/utils/weightOptimizerNarrative.ts`: `OPTIMIZER_STEP2_ARIA_LABEL`, `describeOptimizerSnapshot`.
- `ModalStatus`-era tests of the modal: none exist as component tests; `__tests__/accumulationPlanReviewFlow.test.ts`
  and `__tests__/accumulationPlanRevision.test.ts` test the pure engine and stay.
- `components/allocation/OptimizerPanel.tsx` stays (the model's dialog reads it).

### 4.6 The route's budget

`perf/budget.json`: `/dashboard/allocation` is re-measured; its ceiling is lowered to the new measure rounded up,
with `raisedBy` «lowered: the plan's modal deleted (<date>)»; `/dashboard/allocation/piano` re-measured (the
revision adds `buildRevisedPlan`'s code, already in the engine's module).

## 5. Constraints and traps (AGENTS.md / DESIGN.md, «here it means that»)

- **A revision never rewrites the past** (doc/guide/accumulo.md): instalments `1 … k−1`, their measurements and
  the baseline are untouched — `buildRevisedPlan` guarantees it; the path never builds a calendar of its own.
- **`revisePlan` is the only writer and runs the gate** (`accumulationPlanService.ts:393-420`): the path calls it
  with the SAME `PlanRevisionInput` the summary previewed — one object, built once per render by
  `planPathToRevision`.
- **A saved sale whose shares change is «removed + new»** (`diffRevisionDisposals`,
  `accumulationPlanUtils.ts:487-512`): the summary says «{nome}: da {a} a {b} quote», not two lines.
- **Executed, skipped or linked sales never move** (`isOpenSavedDisposal`): they are lines, not controls.
- **The total of months is at most 60** (`buildRevisedPlan`'s `months_range`): the block on «durata» says the
  bound that is left.
- **The deletion is proved by the compiler and a search**, not by a snapshot: `npx tsc --noEmit` clean, the
  `git grep -w` of § 4.5 empty, `knip` is not in the repo and is not added.
- **Groups**: a plan with a group (from the model) is revised with the group as one row; its buyer cannot be
  changed here — «Rivedi dal modello» after changing the model does it (declared in the guide).
- **React Compiler / purity**: `today` is the mount's; `previewPlanPathRevision` runs on the summary only.
- **No series label in code**; **no owner data in a tracked file**.
- **Tests that move**: every E2E step that opened «Rivedi il piano» in `e2e/accumulo.spec.ts`,
  `e2e/accumulo.mobile.spec.ts`, `e2e/accumulo.tablet.spec.ts` walks the path (`walkPlanPath`, NOVE-22);
  NOVE-23's E-tests on the sale month in a revision move to the path's select.

## 6. Tests per level (with the mutation that proves each)

| # | Test | Mutation that turns it red |
| --- | --- | --- |
| U1 | `__tests__/planPath.test.ts` › revision: an active plan of 12 months with 4 closed → `start: 'plan'`, months 8, the plan's accounts, reserve, positions, its open sale in month 6; with `fromModel` → `start: 'model'` and the model's quotas on the plan's rows | take `plan.months` as the months left |
| U2 | same › `planPathToRevision`: the open sale untouched → no diff; its quantity 10 → 6 → one removed + one new; moved to month 9 → `movedDisposalMonthIndexes`; unticked → removed; a new sale in month 7 → `disposals` with `monthIndex: 7` | send the open sales as new |
| U3 | same: a locked sale (executed) never appears in the three diff fields, whatever the answers | diff against every disposal |
| U4 | same › `previewPlanPathRevision` + `firstPlanPathRefusal`: valid answers → `ok` with instalments 5…12 rewritten and 1…4 identical to the plan's; 57 months left with 4 closed → the `months_range` sentence | preview with `buildDraftPreview` |
| U5 | same: a plan with `advisorNotes` → `advisorNotes: []`; without → the key absent; `reviewMonthIndex` 10 with the plan shortened to 8 months in all → `reviewMonthIndex: null`; still inside → the key absent | always send `advisorNotes: []` |
| U6 | same › `reconcilePlanPathAnswers`: a stored revision of another plan id, or of the same plan after one more revision, → the initial draft; a stored create draft with an active plan → the initial revision draft | compare the id only |
| U7 | `__tests__/accumulationPlanUtils.test.ts` compiles without the three functions; `__tests__/accumulationNarrative.test.ts` without the deleted names | — |
| R1 | `__tests__/pianoScreens.test.tsx` › riepilogo in a revision: «Da {mese}: 800 € al mese per 8 mesi.», the changed sales' lines, the refusal in `status` | read the first instalment of the whole plan |
| R2 | `__tests__/questoMeseTile.test.tsx` (new, `dom`; hooks mocked): the three doors are links with the two hrefs; disabled in demo | keep `setReviseOpen` |
| R3 | `pianoScreens.test.tsx` › vendite in a revision: a locked sale is a line without controls; the month select starts at the first open month | list month 1 |
| E1 | `e2e/accumulo.piano.spec.ts`: the active fixture (`seedAccumuloFixture`) → «Rivedi il piano» → the path prefilled → monthly amount changed → «Conferma» → the done card; firebase-admin: the closed instalments byte-equal to before, the open ones rewritten, one more `revisions` row | — |
| E2 | same: the open sale moved two months later → `disposals[n].monthIndex`; a new sale → present with its month | — |
| E3 | same: «Rivedi dal modello» → `?da=modello`, «Dal portafoglio modello» chosen, the model's quotas on screen 7 | — |
| E4 | same: a reload on screen 5 keeps the revision; a second tab revises the plan → reload → the path restarts from the plan | — |
| E5 | `e2e/accumulo.piano.mobile.spec.ts`: the revision at 390 without horizontal overflow | — |

## 7. Guided verification (WORKFLOW.md § 2)

Expected outcome, declared first: on the active fixture the path opens on the plan's own answers; a revision
confirmed in the path leaves the closed instalments identical and writes, for the same answers, the same document
the modal wrote on `develop`; the three doors lead to the path; the modal's files and sentences are gone and the
app builds; Allocazione weighs less.

- **A**: `npx tsc --noEmit`, lint, Vitest in three zones, `npx playwright test e2e/accumulo e2e/allocation` in
  every project; the `git grep -w` of every name of § 4.5 (a scratchpad script prints the names still found).
- **B**: emulators + `emulators:seed` + `dev:emulator`; BEFORE the deletion, on the branch's first commit-less
  state, a scratchpad script records the plan document after a revision made in the MODAL with fixed answers (inflow
  +100, one month less, the open sale moved by one month, one new sale); the fixture is re-seeded and the same
  answers go through the PATH: the two documents are compared field by field (ids of new sales and timestamps
  apart).
- **C (browser)**: 390, 768×1024, 1024×768, 1440, light and dark: the eight screens in a revision, the locked
  sale's line, the summary's lines for a sale taken off / moved / new, the done card; the plan with no intact
  instalment; the three doors.
- **D (data)**: `accumulationPlans/<id>` after «Conferma»: instalments `1…k−1` unchanged (deep-equal by the
  script), `revisions` + 1, `liquidity`, `positions`, `disposals` (months), `advisorNotes` cleared on a plan that
  had them, `reviewMonthIndex` kept or cleared by V5.
- **E (edges)**: months left = 1; a group from the model as one row; the last open month as a sale's month;
  untick every account → block; 60 − closed + 1 months → the bound's sentence; the plan interrupted in another tab
  while the path is open → «Conferma» refuses with the service's sentence and nothing is written.
- **F (owner, at «pronto»)**: the mirror (`npm run mirror:seed -- <email>`): the owner revises his mirrored plan
  from each of the three doors and says whether a screen asks something he cannot answer; he looks for an operation
  of the old modal he misses. `npm run mirror:remove`.
- **G**: `npm run perf:budget` (Allocazione lowered, the path's route re-measured: both recorded in
  doc/guide/velocita.md § Registro); `mobile:census` + `mobile:budget` (Accumulo's active tile changes no size: the
  buttons become links of the same class — the entries must read the same); stop the servers, delete the scripts,
  remove the mirror.

## 8. Putting it into service

One PR to `develop`; no rule, no index, no migration. After the deploy the owner opens «Rivedi il piano» once on
his production plan and leaves the path without confirming («Ricomincia» clears the browser draft).

## 9. Documentation

- `doc/guide/accumulo.md`: the editor's section is deleted; «Il percorso» gains «Rivedere» (what is prefilled, what
  is locked, the summary from `buildRevisedPlan`, V5, V6); § Files loses the two files; § Per-page blind spots:
  «a group's buyer changes from the model, then «Rivedi dal modello»»; «a browser draft of a revision is dropped
  when the plan changed».
- `doc/guide/ottimizzatore.md`: the optimizer is reached from the model's dialog only (the plan's step 2 panel is
  gone). `doc/guide/dialog.md`: the count of modals on `ResponsiveModal` − 1.
- `AGENTS.md` § 3 Allocazione › Accumulo: the stub's bullet («a plan is created and revised by the path; no
  editor»). `CLAUDE.md`: «Latest», the Accumulo line, the count of «Dialogs and forms» − 1. `README.md` and
  `Draft Release Temp.md`: «Rivedi il piano» is the same path.
- `doc/guide/velocita.md` § Registro: the lowered ceiling.
- `doc/nove/README.md`: § 6 the row; § 7 the path's contracts as extended.

## 10. Declared out of scope

- **Changing a group's members or buyer in a plan**: none, declared — the model owns groups (decision 89).
- **Revising closed instalments**: none, declared (the engine's rule).
- **A review month typed by hand**: none, declared (decision 69).
- **Revising a DRAFT**: a draft is continued (NOVE-22), not revised.
- **The costume on the path** → NOVE-19/20.

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
  doc/guide/velocita.md, doc/guide/prima-schermata.md, doc/guide/e2e-emulatori.md e
  doc/guide/e2e-playwright.md PRIMA di scrivere codice in quei domini
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
modulo del percorso (§ 4.1) con U1-U6; le schermate in revisione (§ 4.2); «Conferma» (§ 4.3);
le tre porte (§ 4.4); il confronto della § 7 B; SOLO a confronto riuscito le eliminazioni
(§ 4.5) e il budget (§ 4.6). I test PRIMA del codice, ciascuno visto rosso con la sua
mutazione; cifre inventate e tonde. Fermati e chiedimi se: il documento scritto dal percorso
differisce da quello della finestra a parità di risposte; una rata chiusa cambia di un
centesimo; un nome della § 4.5 ha un lettore che la spec non nomina; mi accorgo che manca
un'operazione della finestra che la decisione 89 non ha tolto; perf:budget o mobile:budget
diventano rossi oltre la regola della § 8 dell'indice.
Collaudo: § 7, la F sul mirror al mio «pronto» (rivedo io il piano dalle tre porte). Un
branch, un commit, solo dopo il mio OK con il riassunto del diff. SESSION_NOTES.md non si
committa.
```

Model: **Opus 5.5**, effort **medium** — an M/L spec on a shared contract (the path's module, `PlanRevisionInput`)
with a deletion of ~2.000 lines whose equivalence must be proved against the engine. Estimated size: 1 session,
~5 h; ~160 lines pure, ~200 across components, ~350 of tests, five E2E tests and the moved ones; ~2.100 lines
deleted.
