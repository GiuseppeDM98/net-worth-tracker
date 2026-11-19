# NOVE-22 — A plan of accumulation by hand: the guided path that creates it

> Series `doc/nove/` (README.md § 5): **depends on NOVE-23** (retired on 2026-11-19, PR #557; `disposalMonthIndex`, `sale_month_out`,
> `resolveInvestmentAccountId`, `listSaleSteps`, `removeOwnerPlans`), **NOVE-24** (`resolvePlanReserve`'s
> `sourceIds`) **and NOVE-25** (`createAndActivatePlan`, `resolveEffectiveTargets`, `lib/utils/accumuloCopy.ts`,
> `updateDraftPlan` replacing a draft whole, the gate's `source_missing`, the editor freed of the hand-off). Fourth
> of the five specs of «dal Consulente al piano di accumulo, in un clic»: who builds a plan WITHOUT the Consulente
> gets a path of one question per screen with ONE «Conferma», as Compravendita. The editor
> (`AccumulationPlanDialog`) stays for «Rivedi il piano» only; NOVE-26 moves that too and deletes it.
> Written on 2026-11-19; every `file:line` is cited on `develop` @ 7909fa4c (those into the files NOVE-23 changed re-pointed to `develop` @ 875f4882 at its retirement, 2026-11-19). Executes decisions 86, 88, 89, 90, 91,
> the half of 87 that is «create» and «Modifica», and 94 and 98 on its screens (README.md § 3).

## 1. The problem today (evidence on the code)

**A plan is created in a three-step modal of 1.809 lines (2026-11-19, after NOVE-23).** `components/allocation/AccumulationPlanDialog.tsx`:
step 1 (`:866`) asks name, source accounts, reserve, monthly inflow, duration and start month in one grid; step 2
(`:1065`) is «Parti da» with four sources (`startFrom`, `:493-529`), the weights' table, «Nel piano / Da vendere»,
grouping, «Sostituisci», «+ Nuovo asset», the optimizer's panel; step 3 (`:1473`) the preview. The owner
(2026-11-17, on the model's tour): the PAC is complex to set up. (2026-11-19): «deve essere il più semplice
possibile».

**Three buttons end the same form.** «Salva bozza», «Attiva piano» (`handleSaveDraft`, `handleActivate`,
`:666-692`) and, on a draft, «Modifica» again (`components/allocation/tiles/QuestoMeseTile.tsx:449-454`): a draft is
a state the user must understand and come back to.

**The editor is opened from four places with different props**: «Crea piano»
(`components/allocation/tiles/AccumuloVuotoTile.tsx:152-179`), «Crea un PAC con questi pesi»
(`components/allocation/tiles/PortafoglioModelloTile.tsx:328-353`, `seedDraft`), «Modifica» of a draft
(`QuestoMeseTile.tsx:358-375`) and «Rivedi il piano» (`:378-397`).

**The app already has the shape that fits**: Compravendita and the Consulente are routes with one 720px card, one
question per screen, «Indietro», the draft on the browser, a summary and one «Conferma»
(`components/assets/compravendita/CompravenditaWizard.tsx`, `lib/utils/realEstateOperationDraft.ts:199-294`). Their
card is written twice: `HEADLINE_CLASS`, `HELP_CLASS`, `BUTTON_CLASS` in `CompravenditaWizard.tsx:40-42` and in
`components/allocation/consulente/ConsulenteWizard.tsx:91-92`; `numberOrNull` in
`components/assets/compravendita/fields.tsx:22` and in `ConsulenteWizard.tsx:154`. A third path makes three.

## 2. Goal and acceptance criteria

1. `/dashboard/allocation/piano` is a path of eight screens — where the quotas start, the monthly amount, the
   months, the account, the reserve, the sales, the instruments, the summary — each with «Indietro» and one primary
   button. **Proof**: U1, E1.
2. ONE «Conferma» on the summary creates the plan ACTIVE (and the model, when its box is on); the done card reads
   the first instalment and links to Accumulo. No «Salva bozza». **Proof**: U7, E1.
3. «Che cosa compra il piano?» is ONE screen: a row per instrument with today's weight and its quota, the sum, «
   Ridistribuisci il resto», «Aggiungi uno strumento». **Proof**: R2, E1.
4. A sale has its quantity and its MONTH; the summary shows its estimated tax. **Proof**: U4, R3, E2.
5. The unfinished path lives on this browser and comes back at the same screen after a reload; «Ricomincia»
   (armed) clears it. **Proof**: U6, E3.
6. «Crea piano» and «Crea un PAC con questi pesi» open the path (the second with those quotas); a draft in Accumulo
   is continued in the path («Continua») and «Conferma» overwrites and activates it. **Proof**: U5, E4, E5.
7. The path refuses what the engine refuses, on the screen that asks it and again on the summary
   (`validateDraftAgainstAssets`). **Proof**: U3, U8.
8. With an active plan the path says so and links to Accumulo («Apri Accumulo»); when that plan has every
   instalment closed the sentence is decision 98's; in the demo account the path is not available. **Proof**: R4.
9. The editor is no longer reachable to create or to edit a draft; «Rivedi il piano» still opens it. **Proof**: R5,
   E6.
10. Compravendita renders as before on the shared card. **Proof**: `e2e/assets.compravendita.spec.ts` green unchanged,
    E7.
11. The new route has its `perf/budget.json` entry; `mobile:budget` has no entry for it (no guided path has one),
    declared. **Proof**: § 7 G.
12. While «Conferma» writes, the button is disabled; a press after the Italian month changed does not create a
    plan that starts in a month the path did not show. **Proof**: R1, U11.

## 3. Decisions

- **Owner 86 (2026-11-19)**: the hand path is a PAGE (a route), like Compravendita.
- **Owner 87**: the path replaces EVERYTHING — create, «Modifica» of a draft, «Rivedi il piano» — and the editor
  is deleted («decidiamo in ottica futura di UX utente, deve essere il più semplice possibile»). **Owner 91**: in
  two specs — this one creates (and continues a draft), NOVE-26 revises and deletes the editor.
- **Owner 88**: the path ends with ONE «Conferma» that activates; the unfinished path lives on the browser; the
  app no longer creates drafts in Accumulo; an existing draft is continued in the path or deleted.
- **Owner 89**: no advanced operation in the path — no «Raggruppa/Separa» by hand, no «Sostituisci», no
  «Ottimizzato»: groups come only from the model portfolio.
- **Owner 90**: «Che cosa compra il piano?» is ONE screen with the list.
- **Adopted, reversible (this spec)**:
  - G1. ONE URL, `/dashboard/allocation/piano`, for create and continue (and, with NOVE-26, revise): the open plan
    decides the mode.
  - G2. The order: partenza · versamento · durata · conto · riserva · vendite · strumenti · riepilogo — the sales
    BEFORE the instruments, because a sale of every share takes its row out of the list.
  - G3. No screen for the name («Piano di accumulo»; a continued draft keeps its own) nor for the start month (the
    month after «Conferma», stated on «durata»).
  - G4. The accounts are checkboxes; «Conto per gli investimenti» is pre-ticked alone; the reserve is prefilled by
    `resolvePlanReserve(…, sourceIds)` and follows the accounts until the user types it.
  - G5. «Crea un PAC con questi pesi» writes the browser draft with the seed and navigates: the browser draft is
    the transport, no weight travels in the URL.
  - G6. A server draft is read only when the browser holds no draft; the draft tile keeps «Attiva piano» and
    «Elimina bozza», its «Modifica» becomes the link «Continua».
  - G7. With an ACTIVE plan the path shows one sentence and the link «Apri Accumulo» (`ACCUMULO_OPEN_LINK`,
    decision 94): «Hai già un piano di accumulo attivo.», or — when the plan has no intact instalment
    (`findFirstIntactInstallment(plan) === undefined`) — `ACCUMULO_PLAN_NOTHING_TO_REVISE` (decision 98). NOVE-26
    replaces the first with the revision. A browser draft found there is cleared: the active plan made it moot.
  - G8. The shared path pieces are extracted now (the third use): `components/ui/path-card.tsx`,
    `components/ui/path-fields.tsx`, `lib/utils/pathDraftStorage.ts`. Compravendita adopts all three; the
    Consulente's wizard only the class constants and `numberOrNull` (its card carries the rail).
  - G9. «Aggiorna anche il portafoglio modello»: one box on the summary, on when the quotas differ from the model
    or no model exists — the editor's rule (`:619-621`).
  - G10. Months 1–60, with four chips (6, 12, 24, 36).
  - G11. «Aggiungi uno strumento» is a select of `listAddableAssets` whose last entry «Nuovo strumento…» opens
    `AssetDialog` with `createEmpty`, as the editor does; the new row starts at 0 %.
  - G12. A group that arrives from the model is ONE row, named by its label, the instrument it buys under it; the
    path never edits a group.
  - G13. The browser draft stores answers and the seed the model's dialog handed; no figure in it is trusted —
    `planPathToDraft` recomputes every `estimatedProceedsEur` — and, restored, it is checked against today's
    assets: an instrument that is gone is dropped.
  - G14. Choice l of the index gains one reader: the route `/dashboard/allocation/piano` reads the plans and the
    model (its own route, its own chunk).
  - G15. «Ricomincia» returns to `initialPlanPathDraft(context)`: with a draft in Accumulo, that draft at the
    first screen; a seed from the model's dialog is lost (the user starts again from the tile's button).
  - G16. «Conferma» reads the Italian month again: when it is no longer the month read at mount, nothing is
    written — the path stays on the summary with one sentence and shows the new first month.
  - G17. While «Conferma» writes, the primary button is disabled: a double click sends one write; the plans' lock
    is the last guard.
  - G18. The wizard mounts only on plans fetched AFTER mount (the plans are in the persisted cache: a restored
    list can hold a draft another tab already activated).
  - G19. A draft the path continues keeps what it carried and the path does not ask: the Consulente's review
    month, its notes and the optimizer's snapshot (`updateDraftPlan` replaces the draft whole, NOVE-25).
  - G20. With no «Conto per gli investimenti» and several accounts none is pre-ticked; the accounts ticked are
    not saved as the setting (Impostazioni owns it).

## 4. Solution

### 4.1 The shared path pieces (G8)

- `components/ui/path-card.tsx` (new): `PATH_HEADLINE_CLASS`, `PATH_HELP_CLASS`, `PATH_BUTTON_CLASS` (the three
  strings of `CompravenditaWizard.tsx:40-42`, moved) and

```tsx
export interface PathCardProps {
  /** «Passo n di N · tema» is built here. */
  step: { index: number; total: number; theme: string };
  question: string;
  help: string;
  children: ReactNode;
  back: { onClick: () => void; disabled: boolean };
  /** «Ricomincia», armed like a movement's delete (`useArmedDelete`). */
  restart: { onConfirm: () => void; disabled: boolean };
  /** The line over the primary button: a block (warning) or a failure (destructive). */
  status: { tone: 'warning' | 'failure'; text: string } | null;
  /** `disabled` also while the path writes (G17): the host passes it with the running label. */
  primary: { label: string; onClick: () => void; disabled: boolean };
}
export function PathCard(props: PathCardProps): JSX.Element
/** The eyebrow is «Fatto»; `ariaLabel` names the section («Operazione registrata», «Piano attivo»). */
export function PathDoneCard(props: { ariaLabel: string; headline: string; help: string; children: ReactNode /* the buttons */ }): JSX.Element
```

  The markup is Compravendita's, moved verbatim (`CompravenditaWizard.tsx:109-192`): the section with
  `TILE_SURFACE_CLASS`, the eyebrow, the headline, the help, the body, the footer. `CompravenditaWizard` renders
  `PathCard` / `PathDoneCard` (it passes `ariaLabel="Operazione registrata"`, today's literal at `:111-112`); its
  tests and E2E stay green unchanged (criterion 10).
- `components/ui/path-fields.tsx` (new): `PATH_FIELD_HEIGHT_CLASS` (the value of `FIELD_HEIGHT_CLASS`,
  `components/assets/compravendita/fields.tsx:19`, moved), `numberOrNull`, `NumberField`, `AccountField`.
  `fields.tsx` keeps `DateField` and `CategoryField`, importing `PATH_FIELD_HEIGHT_CLASS`, and re-exports nothing;
  `CompravenditaScreens.tsx` imports `NumberField`, `AccountField` and `PATH_FIELD_HEIGHT_CLASS` from
  `@/components/ui/path-fields`; `components/ui/choice-list.tsx:38-39` imports `PATH_FIELD_HEIGHT_CLASS` in place
  of its copy.
- The Consulente: `ConsulenteWizard.tsx`, `ConsulenteBook.tsx` and `ConsulenteInterviewScene.tsx` import
  `PATH_HEADLINE_CLASS` / `PATH_HELP_CLASS` / `PATH_BUTTON_CLASS` from `components/ui/path-card.tsx` and delete
  their own copies — `ConsulenteWizard.tsx:91-93` (its exported `HEADLINE_CLASS` goes, and `ConsulenteBook.tsx:50`'s
  import of it with it), `ConsulenteInterviewScene.tsx:35-36`, and the `BUTTON_CLASS` NOVE-24 moved to
  `ConsulenteBookPages.tsx` (every copy is the same string, measured on 2026-11-19: `'h-11 desktop:h-9'` and the
  24/30px headline); `ConsulenteWizard.tsx` also imports `numberOrNull` from `components/ui/path-fields.tsx` and
  deletes its copy (`:154`).
- `lib/utils/pathDraftStorage.ts` (new, pure):

```ts
export function readStoredJson<T>(storage: Pick<Storage, 'getItem'> | null, key: string, parse: (value: unknown) => T | null): T | null
export function writeStoredJson(storage: Pick<Storage, 'setItem'> | null, key: string, value: unknown): void
export function clearStored(storage: Pick<Storage, 'removeItem'> | null, key: string): void
```

  each inside a try/catch (a private window, a full quota); `realEstateOperationDraft.ts:264-294` calls them.

### 4.2 The path's pure module (`lib/utils/planPath.ts`, new)

```ts
export type PlanPathScreen = 'partenza' | 'versamento' | 'durata' | 'conto' | 'riserva' | 'vendite' | 'strumenti' | 'riepilogo';
export const PLAN_PATH_SCREENS: readonly PlanPathScreen[] = ['partenza', 'versamento', 'durata', 'conto', 'riserva', 'vendite', 'strumenti', 'riepilogo'];
export type PlanPathStart = 'model' | 'today' | 'zero' | 'seed' | 'draft';

export interface PlanPathSale { assetId: string; /** null = every share */ quantity: number | null; month: number }

export interface PlanPathAnswers {
  start: PlanPathStart | null;
  monthlyInflowEur: number | null;
  months: number | null;
  sourceIds: string[];
  /** null = the computed reserve, which follows the accounts. */
  reserveEur: number | null;
  /** «Vuoi vendere qualcosa?»: null = not answered. */
  wantsSales: boolean | null;
  sales: PlanPathSale[];
  /** Seeded when `start` is chosen, edited on «strumenti». */
  positions: PlanPosition[];
  /** null = on when the quotas differ from the model, or no model exists. */
  updateModel: boolean | null;
  seed?: PlanSeedDraft;
  serverDraftId?: string;
  name?: string;
}

export interface PlanPathDraft { version: 1; screen: PlanPathScreen; answers: PlanPathAnswers }

export interface PlanPathContext {
  assets: Asset[];
  /** The Allocazione page's EFFECTIVE targets: `resolveEffectiveTargets(settings, goalData, assets).targets` (NOVE-25). */
  targets: AssetAllocationTarget;
  band: RebalanceBand;                         // DEFAULT_REBALANCE_BAND: the route has no band control
  model: ModelPortfolio | null;
  investmentAccountId: string | null;          // resolveInvestmentAccountId(settings, assets)
  /** The account's open DRAFT plan, when one exists. */
  openDraft: AccumulationPlan | null;
  tradedAssetIds: ReadonlySet<string> | null;
  holdings: AllocatableHolding[];              // buildHoldings(assets, calculateAssetValue): the sales' tax line
  /** The Consulente's «rivedi entro», or null (never a reason to wait or to fail). */
  reviewByIso: string | null;
  compare: AllocationCompare;
  deps: PlanDeps;
  /** The month of «today», read once at mount. */
  todayMonth: MonthKey;
}

export type PlanPathAction =
  | { type: 'next' } | { type: 'back' }
  | { type: 'start'; start: PlanPathStart; context: PlanPathContext }
  | { type: 'set'; patch: Partial<Pick<PlanPathAnswers, 'monthlyInflowEur' | 'months' | 'sourceIds' | 'reserveEur' | 'updateModel'>> }
  | { type: 'wantsSales'; value: boolean; context: PlanPathContext }
  | { type: 'sale'; sale: PlanPathSale | { assetId: string; remove: true }; context: PlanPathContext }
  | { type: 'quota'; positionId: string; targetPercentage: number }
  | { type: 'redistribute' }
  | { type: 'add'; assetId: string; created?: true; context: PlanPathContext }
  /** A draft «Conferma» wrote and could not activate: the next press overwrites it. */
  | { type: 'adopt'; serverDraftId: string }
  | { type: 'reset'; draft: PlanPathDraft };

export function initialPlanPathDraft(context: PlanPathContext): PlanPathDraft
/** The draft the model's «Crea un PAC con questi pesi» writes to the browser: no context needed. */
export function seededPlanPathDraft(seed: PlanSeedDraft, investmentAccountId: string | null): PlanPathDraft
/** What the wizard starts from: the stored draft checked against today, or the initial one. */
export function restorePlanPathDraft(stored: PlanPathDraft | null, context: PlanPathContext): PlanPathDraft
export function planPathReducer(draft: PlanPathDraft, action: PlanPathAction): PlanPathDraft
export function seedPlanPathPositions(start: PlanPathStart, answers: PlanPathAnswers, context: PlanPathContext): PlanPosition[]
export function resolvePathReserveEur(answers: PlanPathAnswers, context: PlanPathContext): number
/** «oggi {x}%» per position id: its members' value over the value of every position's members, two decimals. */
export function planPathTodayWeights(answers: PlanPathAnswers, context: PlanPathContext): Record<string, number>
export function describePlanPathBlock(screen: PlanPathScreen, answers: PlanPathAnswers, context: PlanPathContext): string | null
export function firstPlanPathRefusal(answers: PlanPathAnswers, context: PlanPathContext): string | null
export function planPathToDraft(answers: PlanPathAnswers, context: PlanPathContext): AccumulationPlanDraft
export function reconcilePlanPathAnswers(answers: PlanPathAnswers, context: PlanPathContext): PlanPathAnswers   // a restored draft against today's assets
export function planPathStorageKey(ownerId: string): string                                                    // `plan-path-draft:v1:${ownerId}`
export function parseStoredPlanPath(value: unknown): PlanPathDraft | null
```

The rules (in them: `assetsById = new Map(assets.map((asset) => [asset.id, asset]))`; `labelOf = (id) =>
assetsById.get(id)?.name ?? id`; «the sales as disposals» = one `PlanDisposal` per sale: `{ assetId, quantity:
sale.quantity ?? undefined, monthIndex: sale.month, status: 'planned', estimatedProceedsEur }` with
`estimatedProceedsEur = proceedsOfDisposal({ assetId, quantity: sale.quantity ?? undefined, estimatedProceedsEur:
0, status: 'planned' }, assetsById.get(assetId), deps)` — always recomputed, never read from storage, G13):

- **`initialPlanPathDraft`**: screen `partenza`; `sourceIds` = `[investmentAccountId]` or `[]` (G20); `months`
  12; `wantsSales` null; everything else null/empty. With `context.openDraft` (G6): `start: 'draft'`,
  `serverDraftId`, `name`, the draft's months, inflow, accounts, reserve, positions and its `planned` disposals as
  sales (`month = disposalMonthIndex(disposal)`, `quantity: disposal.quantity ?? null`), `wantsSales:
  sales.length > 0`.
- **`seededPlanPathDraft`**: `{ version: 1, screen: 'partenza', answers }` with `start: 'seed'`, `seed`,
  `positions: seed.positions`, `sales` = `seed.disposals` as `{ assetId, quantity: quantity ?? null, month:
  disposalMonthIndex(disposal) }`, `wantsSales: sales.length > 0`, `sourceIds` = `[investmentAccountId]` or `[]`,
  `months` 12, the rest null/empty.
- **`seedPlanPathPositions`** (the editor's own helpers, unchanged): `sold` = the assets of `answers.sales` with
  `quantity: null`; `base = seedPositionsFromAssets(assets, deps.valueOf)` WITHOUT every position whose only
  member is in `sold` (`applyWeightsToPositions` and `applyModelToPositions` use `sold` only to not ADD a
  position, `lib/utils/accumulationPlanUtils.ts:1318-1371`: a row already in the base would stay); `model` →
  `applyModelToPositions(base, model, sold, labelOf)`; `today` → `applyWeightsToPositions(base,
  marketWeights(<the assets that are members of base's positions>, deps), sold, labelOf)` — the weights among
  the instruments that stay; `zero` → `base` with every quota 0; `seed` → `answers.seed.positions`; `draft` → the
  open draft's positions.
- **Every held buyable instrument has a row** (the owner's rule of 2026-11-18, the gate's `unassigned_tradable`):
  after `start`, after `sale`, and in `reconcilePlanPathAnswers`, every asset with `isPlanBuyable` and a value
  above 0 that is neither a member of a position nor sold whole gets a row at 0 % (`label` its name) — so an
  instrument bought after a draft or a seed was made shows on «strumenti», never only as the summary's refusal.
- **`start`** sets `answers.start`, the positions and — for `seed` and `draft` — the sales the seed or the draft
  carries (with `wantsSales`). Choosing another start re-seeds (the quotas typed are replaced: the screen says
  so, § 4.3).
- **`wantsSales`**: sets the answer; `false` removes every sale, each as `sale` with `remove` does.
- **`sale`**: one sale per asset; `quantity` floored. For an asset that is the ONLY member of its position (or a
  money-market fund): `null` when ≥ the quantity held; a sale of every share removes the asset's position (its
  quota is left to «Ridistribuisci il resto»); taking the sale back re-adds the row at 0 %. For a member of a
  GROUP the quantity is kept as typed, never `null` (the engine's `disposal_full_on_position`): its field has no
  «tutte» placeholder, and a quantity ≥ the held is the block of the table below.
- **`quota`**: clamps to 0–100, two decimals. **`redistribute`**: `redistributeRemainder(positions)`.
  **`add`**: a position `{ id, label, targetPercentage: 0, memberAssetIds: [assetId], buyAssetId: assetId }` —
  when the asset is in `listAddableAssets(assets, { positions, disposals }, tradedAssetIds)`, `label` its name;
  with `created: true` (the `onCreated` of `AssetDialog`, whose asset is not in `context.assets` until the query
  is read again) the row is added at once with `ACCUMULO_STEP2_PENDING_ASSET_LABEL`, as the editor does
  (`AccumulationPlanDialog.tsx:1689-1703`), the host invalidates `assets`, and `reconcilePlanPathAnswers` (run by
  the host when the assets change) replaces a pending label with the asset's name.
- **`adopt`**: sets `answers.serverDraftId`, nothing else.
- **`resolvePathReserveEur`**: `answers.reserveEur ?? resolvePlanReserve(assets, targets, compare, deps,
  planCashFundSaleEur(<the sales as disposals>, assetsById, assets), answers.sourceIds).reserveEur` (the
  `sourceIds` parameter of NOVE-24).
- **`planPathTodayWeights`**: the editor's «oggi» (`AccumulationPlanDialog.tsx:455-465`), by `deps.valueOf`.
- **`describePlanPathBlock`** (the sentence that disables «Avanti»; null = free to go):

| Screen | Block | Sentence |
| --- | --- | --- |
| partenza | no start | «Scegli da dove partire.» |
| versamento | null, negative or not finite | «Scrivi quanto versi ogni mese, anche 0.» |
| durata | not an integer in 1–60 | «Scrivi una durata fra 1 e 60 mesi.» |
| conto | no cash account exists | «Non hai un conto di liquidità: creane uno in Patrimonio.» |
| conto | none ticked | «Scegli almeno un conto.» |
| riserva | negative | «La riserva non può essere negativa.» |
| vendite | not answered (`wantsSales` null) | «Scegli se vendere qualcosa.» |
| vendite | a quantity that is not an integer ≥ 1 | «{nome}: scrivi quante quote vendere, almeno 1.» |
| vendite | a group's member with a quantity ≥ the held | «{nome}: puoi vendere al massimo {n} quote.» (n = held − 1) |
| vendite | month outside 1–months | the `sale_month_out` sentence of NOVE-23 |
| strumenti | no row above 0 | «Il piano deve comprare almeno uno strumento.» |
| strumenti | Σ off 100 by more than 0,01 | «Le quote sommano a {s}%: devono fare 100.» |

«Sì» with no sale ticked is free to go on, as «No». A duration shortened after a sale was set past it is the
`sale_month_out` block on «vendite» and on the summary: nothing is moved for the user.

- **`firstPlanPathRefusal`** (the summary): the first block over `PLAN_PATH_SCREENS` in order, else the first
  message of `validateDraftAgainstAssets(planPathToDraft(answers, context), assetsById)` (NOVE-25's
  `source_missing` included), else null.
- **`planPathToDraft`**: `{ name: answers.name ?? 'Piano di accumulo', startMonth: addMonths(context.todayMonth,
  1), months, liquidity: { sourceCashAssetIds: sourceIds, reserveEur: resolvePathReserveEur(answers, context),
  monthlyInflowEur }, positions, disposals: <the sales as disposals>, optimizerSnapshot, reviewMonthIndex,
  advisorNotes }`. `optimizerSnapshot` is `seed?.optimizerSnapshot`, else the model's with `start: 'model'`, else
  the open draft's with `start: 'draft'`, else absent. `reviewMonthIndex` and `advisorNotes` are the open draft's
  ONLY with `start: 'draft'` and `answers.serverDraftId === context.openDraft?.id` (G19), else absent — the path
  never asks them (§ 10).
- **`parseStoredPlanPath`**: refuses any other `version` and any shape that is not a `PlanPathDraft`; revives
  `answers.seed.optimizerSnapshot.computedAt` as a `Date` (JSON made it a string, and the plan document stores a
  date).
- **`reconcilePlanPathAnswers`** (a stored draft against today): drops the accounts, the sales and the position
  members whose asset is gone; a position left without members is dropped; a pending label is replaced by its
  asset's name; the held buyable instruments without a row get theirs (above); a `serverDraftId` that is not
  `context.openDraft?.id` is cleared (the draft was deleted or activated elsewhere) and `start: 'draft'` becomes
  null.
- **`restorePlanPathDraft(stored, context)`**: `stored` null → `initialPlanPathDraft(context)`. When
  `context.openDraft` exists and `stored.answers.serverDraftId !== context.openDraft.id` → the stored draft is
  discarded for `initialPlanPathDraft(context)` (the server draft, `start: 'draft'`): the open plan decides (G1) —
  a browser draft born without one would be refused by the lock at «Conferma» forever. Else `answers =
  reconcilePlanPathAnswers(stored.answers, context)`: with `answers.start === null` the path starts again from
  `partenza` (`initialPlanPathDraft(context)` keeping `answers.sourceIds`), else `{ ...stored, answers }`.

### 4.3 The screens (`components/allocation/piano/`, new)

`PianoClient.tsx` (the host, Compravendita's shape — `components/assets/compravendita/CompravenditaClient.tsx`):
`PageHeader` label «Allocazione», title «Piano di accumulo», the action «Torna ad Accumulo»; it reads assets,
settings, the plans (`useAccumulationPlans`), the model (`useModelPortfolio`), the goals (the effective targets
and the model's basis), the ledger meta and trades (the «Mai comprato» rule of `listAddableAssets`) and, beside
them and never a reason to wait or to fail, the Consulente's document (`useAllocationAdvice(ownerId)`:
`reviewByIso` from `reviewDueState(advice, todayIso)` as `app/dashboard/allocation/page.tsx:218-225` does, `null`
while it loads or when it fails).

- **The targets** are `resolveEffectiveTargets(settings, goalData, assets).targets` (NOVE-25): what Allocazione
  measures and what the editor received. `band` is `DEFAULT_REBALANCE_BAND`.
- **States**, the first that applies: loading — any required read pending, or the plans not yet fetched after
  mount (`isFetchedAfterMount`, G18) — → `TileGridSkeleton` (one tall cell); demo → `EmptyState` «Il piano di
  accumulo non si crea nell'account demo.»; a failed read → `ErrorNotice`; no targets — `settings?.targets`
  absent AND `resolveEffectiveTargets(…).fromGoals === false` (today the page falls back to `getDefaultTargets()`
  and creates a plan toward defaults nobody chose) — → `EmptyState` «Prima imposta i target in Impostazioni ›
  Allocazione: il piano va verso di essi.» with the link; an ACTIVE open plan (G7) → one tile with the sentence of
  G7 and the link `ACCUMULO_OPEN_LINK`, and `clearStored` of the browser draft; else the wizard.

`PianoWizard.tsx`: `useReducer(planPathReducer, null, () => restorePlanPathDraft(readStoredJson(localStorage,
planPathStorageKey(ownerId), parseStoredPlanPath), context))`, the effect that writes the draft on every change
(it overwrites a stored value `parseStoredPlanPath` refused), an effect that dispatches `reset` with
`{ ...draft, answers: reconcilePlanPathAnswers(draft.answers, context) }` when the assets change, `PathCard` per
screen, `PianoScreens.tsx` the bodies. «Ricomincia» dispatches `reset` with `initialPlanPathDraft(context)`
(G15). The copy lives in `lib/utils/planPathNarrative.ts` (new): `planPathScreenCopy(screen, answers, context) →
{ theme, question, help }`.

| Screen | Theme · question | Body |
| --- | --- | --- |
| partenza | «Partenza» · «Da dove partono le quote?» | `ChoiceList` single: «Dal portafoglio modello» (only with a model that has weights — `Object.keys(modelWeightMap(model)).length > 0`, the editor's rule, `AccumulationPlanDialog.tsx:328`; under it the tile's «superato» sentence when `isModelStale`), «Dai pesi di oggi», «Da zero: le scrivo io»; with a seed, first and chosen, «Dai pesi che hai appena calcolato»; with a continued draft, first and chosen, «Dalla bozza che avevi». Help: «Puoi cambiare ogni quota più avanti.» Changing a start after quotas were typed shows «Le quote che avevi scritto vengono sostituite.» |
| versamento | «Versamento» · «Quanto versi ogni mese?» | `NumberField` (€); under it, when `suggestMonthlyInflow(median?.medianEur)` is not null (`lib/utils/accumulationNarrative.ts:1357-1365`: the editor's rule — a median above 0, rounded down to 10), the editor's sentence `describeSuggestedInflow(suggestion, median.months)` and the button «Usa {suggestion €}» (`variant="outline"`). Help: «Anche 0: il piano investe allora solo la liquidità che hai già.» |
| durata | «Durata» · «Per quanti mesi?» | `NumberField` (integer) and the chips 6 · 12 · 24 · 36 (`SegmentedPill`). Help: «La prima rata è a {mese prossimo}.» |
| conto | «Conto» · «Da quale conto escono i soldi?» | one `Checkbox` row per `isPlanSourceAccount` asset: name and balance (mono). Help: «Il piano compra con la liquidità di questi conti e con quello che versi.» |
| riserva | «Riserva» · «Quanto deve restare sul conto?» | `NumberField` (€) holding `resolvePathReserveEur`; under it «La tua allocazione chiede {€} di liquidità; {€} sono già altrove.» (the `quotaEur` and `otherCashEur` of `resolvePlanReserve`) and, when typed, the link-button «Torna a {€}» (clears the override). Help: «Il piano non scende mai sotto questa cifra: se oggi sei sotto, prima la ricostituisce.» |
| vendite | «Vendite» · «Vuoi vendere qualcosa?» | `ChoiceList` single «No» / «Sì, scelgo cosa» (`wantsSales`); with «Sì» one row per held instrument a plan can sell (the buyable ones with quotes and the money-market funds): name · «{n} quote · {€}»; a `Checkbox` «Vendi»; ticked → «Quante quote» (`NumberField`; empty = every share, the placeholder «tutte» — never on a group's member, § 4.2), «In quale mese» (`Select` 1–months: «{mese} ({k}º)»), and the tax line from `candidateSaleTaxPerEuro(assetId, context.holdings)` on the sale's proceeds: «circa {€} · tasse stimate {€}» (taxed), «circa {€} · esente» (exempt), «circa {€} · tasse non stimabili: manca l'aliquota» (unknown, `rate`), «circa {€} · tasse non stimabili: manca il costo fiscale» (unknown, `cost-basis`) — NOVE-24's wording. Help: «Il ricavato entra nelle rate dal mese della vendita; se alla riserva manca qualcosa, prima la ricostituisce.» (decision 93) |
| strumenti | «Strumenti» · «Che cosa compra il piano?» | a `divide-y` list, one row per position: name (a group: its label and «compra {strumento}» under it) · «oggi {x}%» (mono, muted; `planPathTodayWeights`) · the quota `NumberField` (%, two decimals; 0 = «non lo compra»); footer of the list: «Somma: {s}%» (mono; `text-warning-foreground` off 100), «Ridistribuisci il resto» (`variant="outline"`, disabled at 100), «Aggiungi uno strumento» (G11). Help: «Una quota a 0 tiene lo strumento dov'è: il piano non lo compra e non lo vende.» An instrument without a price is not marked here: the summary's warning tells it. |
| riepilogo | «Riepilogo» · «Confermi il piano?» | sentences from `buildDraftPreview` on `planPathToDraft`: `describeStep3Summary` (the editor's line), the first instalment and its month, one `describeSaleStep` sentence per entry of `listSaleSteps({ installments: preview.schedule.installments, disposals, firstIndex: 1, nameOf: labelOf })` (NOVE-23: the months whose instalment rises with a sale), one line per sale (name, quotes, month, and the tax line of «vendite»), the total of the estimated taxes («Tasse stimate delle vendite: {€}», with «, senza {n} non stimabili» when some are not — NOVE-24's line), `describeInsufficientLiquidityWarning` and `describeUnpricedWarning` when due, the note of a plan that ends after the Consulente's «rivedi entro» (`planEndsAfterReview(plan, context.reviewByIso)`); the box of G9. Primary: «Conferma»; while it writes, «Creo il piano…» and disabled (G17). |

At 390px every row stacks (name over figures over control); no horizontal scroll (the mobile spec's overflow
guard).

### 4.4 «Conferma»

First the clock (G16): `toMonthKey(new Date())` (the Italian month, `lib/utils/planMonths.ts`) is compared with
`context.todayMonth`; when it differs nothing is written — the host reads the month again (the context is rebuilt
with it, so «durata» and the summary show the new first month) and `status` (warning) reads «Nel frattempo è
cambiato il mese: la prima rata è ora a {mese}. Controlla il riepilogo e premi di nuovo «Conferma».» Else:

```ts
const { planId, modelError } = await createAndActivatePlan({
  ownerId,
  draft: planPathToDraft(answers, context),
  existingDraftId: answers.serverDraftId,
  activate: { allAssets: assets, targets, compare: compareAllocations, deps: DEPS, today: new Date() },
  model: updateModel ? { input: { weights, origin: 'manual', optimizerSnapshot }, basis } : undefined,
});
```

`weights` = `planPositionsToModelWeights(positions, assetsById, (asset) => asset.quantity).portfolioWeights`
(the box is hidden when it is empty); `basis` = `buildModelBasis({ ...settings, targets }, goalData)`. Then the
invalidations (`accumulationPlans`, the model, `assets`), the stored draft cleared, and `PathDoneCard`
(`ariaLabel="Piano attivo"`): «Piano attivo: prima rata a {mese}, {€}.» · «Ogni mese lo trovi in Allocazione ›
Accumulo.» · the link `ACCUMULO_OPEN_LINK` («Apri Accumulo», primary, `/dashboard/allocation?tab=accumulo`); with
a `modelError`, `describeModelNotUpdated(modelError)` (`lib/utils/accumuloCopy.ts`, NOVE-25) as a second help
line — `createAndActivatePlan` never throws once the plan is active.

A failure (`status`, tone `failure`):

- `PlanWriteError` with `step: 'activate'` → «Il piano è salvato ma non attivo: {reason}. Premi di nuovo
  «Conferma».», and the path dispatches `{ type: 'adopt', serverDraftId: error.planId }`, so the second press
  overwrites that draft and activates it;
- `step: 'plan'`, or any other error → `describeWriteError(error)`: the lock's `ACCUMULO_ONE_OPEN_PLAN`, the
  gate's first message (an account that is gone: `source_missing`, NOVE-25) — nothing was written.

### 4.5 The entry points

- `AccumuloVuotoTile.tsx:152-179`: «Crea piano» is a `Button asChild` → `Link` to `/dashboard/allocation/piano`
  when it is allowed; in demo, or without targets (the condition of § 4.3, which replaces today's `!targets`:
  `AccumuloTab` passes `hasTargets`), it stays a disabled `Button` with the same label — a link ignores
  `disabled`, so none is rendered. The `AccumulationPlanDialog`, its state and the props only it read
  (`targetLeverageRatio`, `idealAllocation`, `onAssetsChanged`, `reviewByIso`, `modelBasis`) leave the file and
  `AccumuloTab`'s call.
- `PortafoglioModelloTile.tsx:328-353` (`onCreatePac(seed)`): writes `writeStoredJson(localStorage,
  planPathStorageKey(ownerId), seededPlanPathDraft(seed, investmentAccountId))` and
  `router.push('/dashboard/allocation/piano')` — `investmentAccountId` is a new prop, the value `AccumuloTab`
  computes once (NOVE-23). The `View` `'pac'`, its dialog, `pacSeed` (`:127`) and the props only they read (`band`
  `:78`, `reviewByIso` `:85`) leave the file and `AccumuloTab`'s call. When the browser already holds a draft the
  seed replaces it (the user just asked for these weights). With a draft open in Accumulo the path discards the
  seed for that draft (`restorePlanPathDraft`): the tile's button is offered, as today, only without an open plan.
- `QuestoMeseTile.tsx` draft view (`:439-456`): «Modifica» becomes the link «Continua» to the path —
  `ACCUMULO_ACTION_CONTINUE = 'Continua'` in `lib/utils/accumulationNarrative.ts`, in place of
  `ACCUMULO_ACTION_EDIT` (`:164`, its one use, deleted); `planDialog` (`:358-375`) is deleted; «Attiva piano» and
  «Elimina bozza» stay. `reviseDialog` (`:378-397`) stays.
- `AccumulationPlanDialog.tsx`: untouched but for what NOVE-25 removed; from now on every caller passes `revise`.
  Its create-only branches are dead until NOVE-26 deletes the file — declared (§ 10).
- `/dashboard/allocation?tab=accumulo`'s `PageTabBar` and the sidebar gain nothing: the path is reached from its
  buttons only, like Compravendita.

### 4.6 The route

`app/dashboard/allocation/piano/page.tsx` renders `<PianoClient />` (nine lines, as
`app/dashboard/assets/compravendita/page.tsx`). `perf/budget.json` gains `"/dashboard/allocation/piano"` with the
measured `initialJsGzKB` rounded up and `raisedBy: "new route (the plan's guided path, <date>)"`.

## 5. Constraints and traps (AGENTS.md / DESIGN.md, «here it means that»)

- **The Path-Scene Rule / The Conversation-Is-Content Rule** (DESIGN.md): one column, one 720px card, no tile
  grid, no verdict; the path is content, the buttons are plain (no AI accent: nothing here asks a model).
- **The Absence-Has-Three-Names Rule**: loading, no targets, a failed read and the demo are four different
  screens (§ 4.3), never one empty card.
- **`validateDraftAgainstAssets` is not called by `createDraftPlan`**: `createAndActivatePlan` calls it (NOVE-25);
  the summary calls it too, to say the refusal before the press.
- **The lock** `accumulationPlanLocks/{ownerUid}`: `createDraftPlan` refuses a second open plan — the host reads
  the plans first (G6, G7) and the refusal stays as the last guard (its sentence shown in `status`).
- **React Compiler**: the clock is read once at mount (`todayMonth`, a state) and again only inside «Conferma»'s
  handler (G16), never in render; `planPathToDraft` and `buildDraftPreview` run in render on the summary only.
- **The plans are in the persisted cache** (doc/guide/cache-persistita.md): the reducer's initializer runs once,
  so the wizard must not mount on a restored list — the host waits for `isFetchedAfterMount` (G18).
- **Choice l** (README § 4): the route is a declared reader of the plans and the model (G14); nothing else
  outside the Accumulo tab reads them.
- **The browser draft is the owner's data on the owner's browser** (as Compravendita's): never sent, never
  logged; `parseStoredPlanPath` refuses any other `version`.
- **Shared account**: every read and write uses `ownerId`; the storage key carries it.
- **No series label in code**; **no owner data in a tracked file** (fixtures: «ETF ornitorinco», «Fondo
  fenicottero», round figures).
- **Tests that move** (edited on purpose): `__tests__/accumuloVuotoTile.test.tsx` (the button is a link),
  `__tests__/portafoglioModelloTile.test.tsx` (the seed goes to the storage); `e2e/accumulo.tablet.spec.ts:90`,
  `e2e/allocation.mobile.spec.ts:278` and `e2e/allocation.spec.ts:320` find «Crea piano» as `getByRole('link',
  …)` (the 44px guard of `allocation.mobile` unchanged); in `e2e/accumulo.spec.ts` the TWO tests that create a
  plan in the editor — «Vendi a» il 3° mese and «Vendi quote» poi «Vendi a» il 4° mese (a partial sale keeps its month
  when its quantity changes, owner 2026-11-19) — are deleted: this spec's E2 asserts both on the path, the calendar
  included; `e2e/accumulo.mobile.spec.ts` does not change. The helper `walkPlanPath(page,
  answers)` in `e2e/accumuloFixture.ts` serves `e2e/accumulo.piano{,.mobile}.spec.ts`.
  `__tests__/accumulationPlanDialogSaleMonth.test.tsx` (NOVE-23) stays: the editor still revises, until NOVE-26.

## 6. Tests per level (with the mutation that proves each)

| # | Test | Mutation that turns it red |
| --- | --- | --- |
| U1 | `__tests__/planPath.test.ts`: `next`/`back` walk the eight screens; `back` on the first and `next` on the last do nothing | allow `next` past the summary |
| U2 | same › `seedPlanPathPositions`: `today` on ETF A 6.000 / ETF B 4.000 → 60 / 40; `zero` → 0 / 0; `model` → the model's weights with its group as one row; with ETF C 5.000 sold whole, C has no row and `today` gives A 60 / B 40 (C's value is out of the weights); a held buyable instrument the seed does not name gets a row at 0 % | seed from the base without filtering the sold |
| U3 | same › `describePlanPathBlock`: each row of the table, and null on valid answers («Sì» with no sale included) | drop the Σ check |
| U4 | same › `sale`: 30 of 40 quotes → partial, the row stays; 40 of 40 → `quantity: null`, the row removed; taken back → the row returns at 0 %; a group's member with 40 of 40 → kept at 40 and blocked with «puoi vendere al massimo 39 quote»; `wantsSales: false` removes every sale | keep the row on a whole sale |
| U5 | same › `initialPlanPathDraft` with an open draft: `start: 'draft'`, its months, accounts, positions, a sale in month 3 kept in month 3, `wantsSales: true`; `seededPlanPathDraft`: `start: 'seed'`, the seed's positions and sales, the investment account pre-ticked | read `monthIndex` as 1 |
| U6 | same › `parseStoredPlanPath` / `reconcilePlanPathAnswers` / `restorePlanPathDraft`: another `version` → null; `seed.optimizerSnapshot.computedAt` comes back a `Date`; an account deleted → dropped; a `serverDraftId` no longer open → cleared and the path back on `partenza`; a stored draft WITHOUT `serverDraftId` while a draft is open → discarded for the server draft; a pending label replaced by the asset's name | keep the stored answers over an open draft |
| U7 | same › `planPathToDraft`: `startMonth` the month after `todayMonth`; the reserve computed with `sourceIds` (quota 10.000, source 4.000, other account 5.000 → 5.000) and the typed one when typed; `monthIndex` from the sale; proceeds recomputed from today's price whatever the stored figure; with `start: 'draft'` the open draft's `reviewMonthIndex` and `advisorNotes` carried, absent with any other start | ignore the override |
| U8 | same › `firstPlanPathRefusal`: valid screens and a draft the gate refuses (a position on an instrument turned `frozen`) → the gate's message | skip the gate |
| U9 | `__tests__/pathDraftStorage.test.ts`: a throwing storage reads null and writes nothing | let the throw out |
| U10 | `planPath.test.ts` › `adopt`: `answers.serverDraftId` is the id and `planPathToDraft` is unchanged; `planPathTodayWeights`: A 6.000 / B 4.000 → 60 / 40 | ignore `adopt` |
| U11 | `__tests__/pianoWizard.test.tsx` (new, `dom`; `createAndActivatePlan` mocked) › «Conferma»: the month changed since mount → no call, the «cambiato il mese» sentence; a pending write → the button disabled, one call for two clicks; `PlanWriteError` at `activate` → the sentence and a second press with `existingDraftId`; a `modelError` → the done card with the model line | call the service without the month check |
| R1 | `__tests__/pathCard.test.tsx` (new, `dom`): eyebrow «Passo 3 di 8 · Durata», the status line's tone, «Ricomincia» armed on the first press, a disabled primary does not call `onClick`; `PathDoneCard`'s `aria-label` | call `onConfirm` at the first press |
| R2 | `__tests__/pianoScreens.test.tsx` (new, `dom`) › strumenti: the rows with «oggi {x}%», «Somma: 90,00%» in warning, «Ridistribuisci il resto» dispatches, a group shown as one row | dispatch nothing from «Ridistribuisci il resto» |
| R3 | same › vendite: «No» / «Sì»; ticking shows quantity, month and the tax line in its four wordings; a group's member has no «tutte» placeholder | hide the month |
| R4 | `__tests__/pianoClient.test.tsx` (new, `dom`; hooks mocked): demo, no targets, an active plan (G7's sentence and «Apri Accumulo»), an active plan with every instalment closed (decision 98's sentence) → the four screens; plans restored but not yet fetched → the skeleton, no wizard | render the wizard with an active plan |
| R5 | `__tests__/accumuloVuotoTile.test.tsx`, `portafoglioModelloTile.test.tsx`: the link, and a disabled button with no link in demo; the seed in the storage under `planPathStorageKey` | keep the dialog |
| E1 | `e2e/accumulo.piano.spec.ts` (new): from the empty tile, the eight screens (Dai pesi di oggi, 500, 12, the account, the reserve, no sale, quotas 60/40, the summary) → «Conferma» → the done card; through firebase-admin: ONE plan, `active`, 12 instalments, the model written | `createAndActivatePlan` called without activating (the plan stays a draft) |
| E2 | same: a sale of 5 quotes in month 3 → the summary's `describeSaleStep` sentence and its tax; `disposals[0]` with `quantity: 5`, `monthIndex: 3`; in Accumulo the calendar's 3rd instalment is larger than the 2nd | write `monthIndex: 1` |
| E3 | same: a reload on screen 4 comes back on screen 4 with the answers; «Ricomincia» twice → screen 1 | remove the write effect |
| E4 | same: a planted draft → «Continua» → the path prefilled → «Conferma» → the SAME plan id, `active` | drop `existingDraftId` (the lock refuses) |
| E5 | same: «Crea un PAC con questi pesi» from the model's dialog → the path on screen 1 with «Dai pesi che hai appena calcolato» chosen; screen 7 shows those quotas | do not write the seed |
| E6 | same: an active plan → the path shows «Hai già un piano di accumulo attivo» and «Apri Accumulo»; «Rivedi il piano» still opens the editor | remove G7's branch |
| E7 | `e2e/accumulo.piano.mobile.spec.ts` (new): the eight screens at 390 without horizontal overflow; `e2e/assets.compravendita.spec.ts` unchanged and green | a row that does not wrap at 390 |

Every E test that writes calls `removeOwnerPlans()` (`e2e/accumuloFixture.ts`, NOVE-23) in `afterEach`, deletes
the model document it wrote and clears the browser draft: the next spec file finds no open plan.

## 7. Guided verification (WORKFLOW.md § 2)

Expected outcome, declared first: on the seed account, from an empty Accumulo, eight screens and one «Conferma»
give an ACTIVE plan whose first instalment equals the one the summary showed; the same answers typed in the editor
on `develop` (the script records them before the branch) — the same accounts ticked and the SAME reserve figure
TYPED in both, because the path's computed reserve differs from the editor's by design: it counts the ticked
accounts only (NOVE-25's K7) — give the same instalments; a reload keeps the place; a draft is continued and
activated as itself; Compravendita looks and behaves as before.

- **A**: `npx tsc --noEmit`, lint, Vitest in three zones, `npx playwright test e2e/accumulo e2e/allocation
  e2e/assets.compravendita` in every project.
- **B**: emulators + `emulators:seed` + `dev:emulator`; a scratchpad script (from inside the repo) that, given a
  plan id, prints positions, disposals, liquidity and the instalments — used to compare the path's plan with the
  editor's on the same answers.
- **C (browser)**: 390, 768×1024, 1024×768, 1440, light and dark: each of the eight screens, the blocks (type a sum
  of 90, untick every account), «Ridistribuisci il resto», «Aggiungi uno strumento» with «Nuovo strumento…», the
  done card; the draft tile with «Continua»; Compravendita's first screen and summary beside a screenshot taken on
  `develop`.
- **D (data)**: the plan document (status, `startMonth`, `liquidity.sourceCashAssetIds`, `reserveEur`, positions
  Σ 100,00, disposals with `monthIndex`); the model document when the box is on, absent when off; localStorage
  empty after «Conferma».
- **E (edges)**: a model «superato» → its sentence under the choice; start «Da zero» → «Avanti» on «strumenti»
  blocked until Σ = 100; a sale of every share → the row leaves «strumenti»; delete in another tab the account
  ticked, reload → the account is gone and «conto» blocks; delete it WITHOUT a reload and press «Conferma» → the
  gate's `source_missing` sentence, nothing written; activate in another tab the draft being continued, reload →
  the path shows the active-plan screen; plant an active plan with every instalment closed → decision 98's
  sentence; monthly amount 0 with cash under the reserve → the summary's insufficient-liquidity warning; with a
  draft open in Accumulo, «Ricomincia» twice → that draft at the first screen; double click on «Conferma» → one
  plan; the script moves the browser's clock past the end of the month (`page.clock`) before «Conferma» → the
  «cambiato il mese» sentence, no plan.
- **F (owner, at «pronto»)**: the mirror (`npm run mirror:seed -- <email>`); the owner builds a plan by hand on his
  mirrored data from «Crea piano» and from the model's «Crea un PAC con questi pesi», and says whether a screen asks
  something he cannot answer. `npm run mirror:remove`.
- **G**: `npm run perf:budget`, every route green (the new route's entry recorded; `/dashboard/allocation` and
  `/dashboard/assets/compravendita` by README § 8 — Allocazione keeps the editor's chunk for «Rivedi il piano»);
  `mobile:census` + `mobile:budget`: the one entry this spec can move is `allocazione-accumulo`
  (`/dashboard/allocation?tab=accumulo`, in each viewport block of `perf/mobile-budget.json`) — the empty tile's
  «Crea piano» becomes a link of the same size, so it must read as on `develop`; every other entry too; the path
  has no entry (criterion 11); stop the servers, delete the scripts, remove the mirror.

## 8. Putting it into service

One PR to `develop`; no rule, no index, no migration (a draft that exists stays a draft, continued or deleted). No
step on the owner's production account beyond a look after the deploy: «Crea piano» opens the path.

## 9. Documentation

- `doc/guide/accumulo.md` (211 lines on 2026-11-19, after NOVE-23's retirement): a new section «## Creare un piano: il percorso» after § Rules — the eight
  screens, the blocks, the browser draft and its restore, «Conferma» (the month check, the failures), the entry
  points; what the path does NOT offer: groups by hand, «Sostituisci», «Ottimizzato». The bullets of § Rules that
  describe CREATING in the editor (the seed `:20`, the reserve `:29`, step 1 `:46` and `:67`, the model box
  `:112`) are rewritten to say «Rivedi il piano» only; the draft view («Continua»); § Files; § Per-page blind
  spots: «a plan made from a model keeps the model's groups as rows; to change a group, change the model»; «the
  path's computed reserve counts the ticked accounts only».
- `doc/guide/compravendita.md` § Files: the shared `path-card`, `path-fields`, `pathDraftStorage`.
  `doc/guide/consulente.md` § Files (the guide is past 500 lines): ONE line replaces the mention of the wizard's
  class constants with the three imports — no net line.
- `AGENTS.md` § 3 Allocazione › Accumulo: the stub's bullet («a plan is created by the path at
  `/dashboard/allocation/piano`; the editor only revises»); § conventions: «a guided path renders `PathCard`».
- `DESIGN.md` The Path-Scene Rule (`:589`, its text as NOVE-24 left it — «the five stages») gains ONE closing
  sentence (before: the rule ends without it): «A guided path outside the Consulente — Compravendita, the plan of
  accumulation — is the same 720px card, rendered by `PathCard`: the eyebrow «Passo n di N · tema», the question
  as the headline, one help line, the controls, the footer with «Indietro», «Ricomincia» and one primary button;
  it has no rail and no slide.»
- `CLAUDE.md`: «Latest» REPLACED, not extended; the Accumulo clause of the Allocazione line of Key Features takes
  «creato dal percorso `/dashboard/allocation/piano`» in place of words of equal length; Key Files › Shared
  primitives gains `path-card` and `path-fields` inside the existing `components/ui/{…}` list; under 20.000
  characters, measured with the command of README § 8 — a fact that does not fit moves to doc/guide/accumulo.md.
- `README.md` and `Draft Release Temp.md`: the path in the user's words.
- `doc/guide/velocita.md` § Registro dei tetti alzati: one row, the new route's entry (the guide is past 500
  lines; NOVE-24 moved its historical baseline out). `doc/guide/prima-schermata-misure.md`: the run's date beside
  `allocazione-accumulo`, unchanged.
- `doc/nove/NOVE-20-temi-giro-b.md` (implemented after this one): its Compravendita targets
  (`CompravenditaWizard.tsx:40`, `:111`, `:133`, `:134-136`, and the lines `:24-27`, `:178-186` that cite them)
  are re-pointed to `components/ui/path-card.tsx` (`PATH_HEADLINE_CLASS`, `PathCard`, `PathDoneCard`), which
  dresses the plan's path too; its `HEADLINE_CLASS` targets in `ConsulenteWizard.tsx`, `ConsulenteBook.tsx` and
  `ConsulenteInterviewScene.tsx` to `PATH_HEADLINE_CLASS`; `components/ui/question-card.tsx:95` and the other
  files this spec does not touch stay. In the same commit.
- `doc/nove/README.md`: § 6 the row; § 4 choice l gains the route (G14); § 7 the path's contracts (read by
  NOVE-26).

## 10. Declared out of scope

- **Revising an active plan in the path, deleting the editor** → NOVE-26.
- **The editor's dead create branches** stay until NOVE-26 (decision 62: `develop` reaches `main` only with the
  whole series).
- **Grouping by hand, «Sostituisci», «Ottimizzato» in a plan** (decision 89): none, declared — the model's dialog
  owns the optimizer and the groups.
- **A review month typed by hand** (decision 69: the Consulente's): none, declared — a continued draft keeps the
  one it carried (G19).
- **A start month other than the next**: none, declared.
- **Several plans at once**: none, declared (one draft-or-active plan per account).
- **Saving the ticked accounts as «Conto per gli investimenti»** (G20): none, declared.
- **A mark for an unpriced instrument on «strumenti»**: none, declared — the summary's warning.
- **Two tabs confirming at the same instant**: the lock refuses the second, its sentence in `status`; nothing
  else, declared.
- **The costume on the path's screens** → NOVE-20, whose targets this spec re-points to `PathCard` (§ 9).

## 11. The prompt that implements it

```
Ciao, in questa sessione vorrei implementare la spec doc/nove/NOVE-22-piano-a-mano-percorso-guidato.md

Contesto, prima di toccare qualsiasi file (le regole del repo cambiano il modo di lavorare):
- Leggi WORKFLOW.md (regole di sessione e di collaudo; l'ultima sezione dice come si
  applicano in questo repo)
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- CLAUDE.md (l'indice: che cos'è e dove sta ogni cosa, lo stato corrente) è già nel
  contesto: usalo per trovare la guida giusta
- Leggi la spec doc/nove/NOVE-22-piano-a-mano-percorso-guidato.md e l'indice della serie
  doc/nove/README.md (§ 3 decisioni, § 4 scelte adottate, § 7 contratti condivisi, § 8 regole)
- Leggi doc/guide/accumulo.md, doc/guide/ottimizzatore.md, doc/guide/compravendita.md,
  doc/guide/consulente.md, doc/guide/consulente-piano.md, doc/guide/stati.md,
  doc/guide/cache-persistita.md, doc/guide/velocita.md, doc/guide/prima-schermata.md,
  doc/guide/e2e-emulatori.md e doc/guide/e2e-playwright.md PRIMA di scrivere codice in quei
  domini
- Leggi DESIGN.md (The Path-Scene Rule, The Conversation-Is-Content Rule, The
  Absence-Has-Three-Names Rule, Small-Screen Composition) e PRODUCT.md
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

Implementa la spec così com'è scritta, nell'ordine: i pezzi condivisi del percorso (§ 4.1),
con Compravendita che li adotta e i suoi test verdi SENZA modifiche; il modulo puro (§ 4.2)
con U1-U10; le schermate (§ 4.3); «Conferma» (§ 4.4) con U11; gli ingressi (§ 4.5); la route
e il suo budget (§ 4.6). I test PRIMA del codice, ciascuno visto rosso con la sua mutazione;
cifre inventate e tonde. Prima di cambiare gli ingressi registra con lo script della § 7 B
le rate che l'editor produce sulle stesse risposte, con la STESSA riserva scritta a mano nei
due: il percorso deve dare le stesse. Fermati e chiedimi se: un test o uno spec di
Compravendita o del Consulente diventa rosso dopo l'estrazione della § 4.1; il percorso
produce rate diverse dall'editor a parità di risposte, riserva compresa (scritta uguale nei
due); una schermata ha bisogno di una domanda che la spec non elenca; perf:budget o
mobile:budget diventano rossi oltre la regola della § 8 dell'indice.
Collaudo: § 7, la F sul mirror al mio «pronto» (costruisco io un piano a mano). Un branch,
un commit, solo dopo il mio OK con il riassunto del diff. SESSION_NOTES.md non si committa.
```

Model: **Opus 5.5**, effort **medium** — an L spec with shared contracts (`PathCard` adopted by two existing
paths, the path's pure module read by NOVE-26, `createAndActivatePlan`) across Accumulo, Compravendita and the
Consulente's wizard, with a new route and its budgets. Estimated size: 1 session, ~7 h; ~430 lines pure, ~680
across components, ~700 of tests (U1–U11, R1–R5), seven E2E tests and the moved ones.
