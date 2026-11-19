# NOVE-22 — A plan of accumulation by hand: the guided path that creates it

> Series `doc/nove/` (README.md § 5): **depends on NOVE-23** (`disposalMonthIndex`, `sale_month_out`,
> `resolveInvestmentAccountId`) **and NOVE-25** (`createAndActivatePlan`, `resolvePlanReserve`'s `sourceIds`, the
> editor freed of the hand-off). Fourth of the five specs of «dal Consulente al piano di accumulo, in un clic»: who
> builds a plan WITHOUT the Consulente gets a path of one question per screen with ONE «Conferma», as Compravendita.
> The editor (`AccumulationPlanDialog`) stays for «Rivedi il piano» only; NOVE-26 moves that too and deletes it.
> Written on 2026-11-19; every `file:line` is cited on `develop` @ 7909fa4c. Executes decisions 86, 88, 89, 90, 91
> and the half of 87 that is «create» and «Modifica» (README.md § 3).

## 1. The problem today (evidence on the code)

**A plan is created in a three-step modal of 1.747 lines.** `components/allocation/AccumulationPlanDialog.tsx`:
step 1 (`:834`) asks name, source accounts, reserve, monthly inflow, duration and start month in one grid; step 2
(`:1025`) is «Parti da» with four sources (`startFrom`, `:488-524`), the weights' table, «Nel piano / Da vendere»,
grouping, «Sostituisci», «+ Nuovo asset», the optimizer's panel; step 3 (`:1418`) the preview. The owner
(2026-11-17, on the model's tour): the PAC is complex to set up. (2026-11-19): «deve essere il più semplice
possibile».

**Three buttons end the same form.** «Salva bozza», «Attiva piano» (`handleSaveDraft`, `handleActivate`,
`:666-692`) and, on a draft, «Modifica» again (`components/allocation/tiles/QuestoMeseTile.tsx:435-440`): a draft is
a state the user must understand and come back to.

**The editor is opened from four places with different props**: «Crea piano»
(`components/allocation/tiles/AccumuloVuotoTile.tsx:150-176`), «Crea un PAC con questi pesi»
(`components/allocation/tiles/PortafoglioModelloTile.tsx:325-349`, `seedDraft`), «Modifica» of a draft
(`QuestoMeseTile.tsx:346-362`) and «Rivedi il piano» (`:365-383`).

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
8. With an active plan the path says so and links to Accumulo; in the demo account it is not available.
   **Proof**: R4.
9. The editor is no longer reachable to create or to edit a draft; «Rivedi il piano» still opens it. **Proof**: R5,
   E6.
10. Compravendita renders as before on the shared card. **Proof**: `e2e/assets.compravendita.spec.ts` green unchanged,
    E7.
11. The new route has its `perf/budget.json` entry and its first screen is measured. **Proof**: § 7 G.

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
  - G7. With an ACTIVE plan the path shows one sentence and a link (NOVE-26 replaces it with the revision).
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
  - G13. The browser draft stores answers (ids, numbers), never a price; restored, it is checked against today's
    assets and an instrument that is gone is dropped.

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
  primary: { label: string; onClick: () => void; disabled: boolean };
}
export function PathCard(props: PathCardProps): JSX.Element
export function PathDoneCard(props: { headline: string; help: string; children: ReactNode /* the buttons */ }): JSX.Element
```

  The markup is Compravendita's, moved verbatim (`CompravenditaWizard.tsx:109-192`): the section with
  `TILE_SURFACE_CLASS`, the eyebrow, the headline, the help, the body, the footer. `CompravenditaWizard` renders
  `PathCard` / `PathDoneCard`; its tests and E2E stay green unchanged (criterion 10).
- `components/ui/path-fields.tsx` (new): `numberOrNull`, `NumberField`, `AccountField` moved from
  `components/assets/compravendita/fields.tsx` (which keeps `DateField`, `CategoryField` and re-exports nothing);
  `ConsulenteWizard.tsx` imports `numberOrNull` and the three classes and deletes its copies.
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
  targets: AssetAllocationTarget;
  band: RebalanceBand;
  model: ModelPortfolio | null;
  investmentAccountId: string | null;          // resolveInvestmentAccountId(settings, assets)
  /** The account's open DRAFT plan, when one exists. */
  openDraft: AccumulationPlan | null;
  tradedAssetIds: ReadonlySet<string> | null;
  compare: AllocationCompare;
  deps: PlanDeps;
  /** The month of «today», read once at mount. */
  todayMonth: MonthKey;
}

export type PlanPathAction =
  | { type: 'next' } | { type: 'back' }
  | { type: 'start'; start: PlanPathStart; context: PlanPathContext }
  | { type: 'set'; patch: Partial<Pick<PlanPathAnswers, 'monthlyInflowEur' | 'months' | 'sourceIds' | 'reserveEur' | 'updateModel'>> }
  | { type: 'sale'; sale: PlanPathSale | { assetId: string; remove: true }; context: PlanPathContext }
  | { type: 'quota'; positionId: string; targetPercentage: number }
  | { type: 'redistribute' }
  | { type: 'add'; assetId: string; context: PlanPathContext }
  | { type: 'reset'; draft: PlanPathDraft };

export function initialPlanPathDraft(context: PlanPathContext): PlanPathDraft
export function planPathReducer(draft: PlanPathDraft, action: PlanPathAction): PlanPathDraft
export function seedPlanPathPositions(start: PlanPathStart, answers: PlanPathAnswers, context: PlanPathContext): PlanPosition[]
export function resolvePathReserveEur(answers: PlanPathAnswers, context: PlanPathContext): number
export function describePlanPathBlock(screen: PlanPathScreen, answers: PlanPathAnswers, context: PlanPathContext): string | null
export function firstPlanPathRefusal(answers: PlanPathAnswers, context: PlanPathContext): string | null
export function planPathToDraft(answers: PlanPathAnswers, context: PlanPathContext): AccumulationPlanDraft
export function reconcilePlanPathAnswers(answers: PlanPathAnswers, context: PlanPathContext): PlanPathAnswers   // a restored draft against today's assets
export function planPathStorageKey(ownerId: string): string                                                    // `plan-path-draft:v1:${ownerId}`
export function parseStoredPlanPath(value: unknown): PlanPathDraft | null
```

The rules:

- **`initialPlanPathDraft`**: screen `partenza`; `sourceIds` = `[investmentAccountId]` or `[]`; `months` 12;
  everything else null/empty. With `context.openDraft` (G6): `start: 'draft'`, `serverDraftId`, `name`, the draft's
  months, inflow, accounts, reserve, positions and its `planned` disposals as sales (`month =
  disposalMonthIndex(disposal)`).
- **`seedPlanPathPositions`** (the editor's own helpers, unchanged): `base = seedPositionsFromAssets(assets,
  deps.valueOf)`; `sold` = the assets sold whole in `answers.sales`;
  `model` → `applyModelToPositions(base, model, sold, labelOf)`; `today` → `applyWeightsToPositions(base,
  marketWeights(membersOf(base), deps), sold, labelOf)`; `zero` → `base` with every quota 0; `seed` →
  `answers.seed.positions`; `draft` → the open draft's positions.
- **`start`** sets `answers.start`, the positions and — for `seed` and `draft` — the sales the seed or the draft
  carries. Choosing another start re-seeds (the quotas typed are replaced: the screen says so, § 4.3).
- **`sale`**: one sale per asset; `quantity` floored, `null` when ≥ the quantity held; a sale of every share
  removes the asset's position when the asset is its only member (its quota is left to «Ridistribuisci il resto»);
  taking the sale back re-adds the row at 0 %. A member of a group is never sold whole here (the engine's
  `disposal_full_on_position`): the control offers a partial sale only.
- **`quota`**: clamps to 0–100, two decimals. **`redistribute`**: `redistributeRemainder(positions)`.
  **`add`**: a position `{ id, label: asset.name, targetPercentage: 0, memberAssetIds: [assetId], buyAssetId:
  assetId }` when the asset is in `listAddableAssets(assets, { positions, disposals }, tradedAssetIds)`.
- **`resolvePathReserveEur`**: `answers.reserveEur ?? resolvePlanReserve(assets, targets, compare, deps,
  planCashFundSaleEur(disposalsOf(answers), assetsById, assets), answers.sourceIds).reserveEur`.
- **`describePlanPathBlock`** (the sentence that disables «Avanti»; null = free to go):

| Screen | Block | Sentence |
| --- | --- | --- |
| partenza | no start | «Scegli da dove partire.» |
| versamento | null, negative or not finite | «Scrivi quanto versi ogni mese, anche 0.» |
| durata | not an integer in 1–60 | «Scrivi una durata fra 1 e 60 mesi.» |
| conto | no cash account exists | «Non hai un conto di liquidità: creane uno in Patrimonio.» |
| conto | none ticked | «Scegli almeno un conto.» |
| riserva | negative | «La riserva non può essere negativa.» |
| vendite | quantity not an integer ≥ 1, or above the held | «{nome}: puoi vendere al massimo {n} quote.» |
| vendite | month outside 1–months | the `sale_month_out` sentence of NOVE-23 |
| strumenti | no row above 0 | «Il piano deve comprare almeno uno strumento.» |
| strumenti | Σ off 100 by more than 0,01 | «Le quote sommano a {s}%: devono fare 100.» |

- **`firstPlanPathRefusal`** (the summary): the first block over `PLAN_PATH_SCREENS` in order, else the first
  message of `validateDraftAgainstAssets(planPathToDraft(answers, context), assetsById)`, else null.
- **`planPathToDraft`**: `{ name: answers.name ?? 'Piano di accumulo', startMonth: addMonths(context.todayMonth,
  1), months, liquidity: { sourceCashAssetIds: sourceIds, reserveEur: resolvePathReserveEur(…), monthlyInflowEur },
  positions, disposals: sales → { assetId, quantity?: number, monthIndex: month, estimatedProceedsEur:
  proceedsOfDisposal(…), status: 'planned' }, optimizerSnapshot: seed?.optimizerSnapshot ?? (start === 'model' ?
  model?.optimizerSnapshot : undefined) }`.
- **`reconcilePlanPathAnswers`** (run once when a stored draft is restored): drops the accounts, the sales and the
  position members whose asset is gone; a position left without members is dropped; a `serverDraftId` that is not
  `context.openDraft?.id` is cleared (the draft was deleted or activated elsewhere) and `start: 'draft'` becomes
  null.

### 4.3 The screens (`components/allocation/piano/`, new)

`PianoClient.tsx` (the host, Compravendita's shape — `components/assets/compravendita/CompravenditaClient.tsx`):
`PageHeader` label «Allocazione», title «Piano di accumulo», the action «Torna ad Accumulo»; it reads assets,
settings, the plans (`useAccumulationPlans`), the model (`useModelPortfolio`), the goals (the model's basis), the
ledger meta and trades (the «Mai comprato» rule of `listAddableAssets`); states: loading → `TileGridSkeleton` (one
tall cell); demo → `EmptyState` «Il piano di accumulo non si crea nell'account demo.»; no targets → `EmptyState`
«Prima imposta i target in Impostazioni › Allocazione: il piano va verso di essi.» with the link; failed read →
`ErrorNotice`; an ACTIVE open plan (G7) → one tile: «Hai già un piano di accumulo attivo.» + «Apri Accumulo».

`PianoWizard.tsx`: `useReducer(planPathReducer, …, () => reconcilePlanPathAnswers(readStoredJson(…) ?? initial))`,
the effect that writes the draft on every change, `PathCard` per screen, `PianoScreens.tsx` the bodies. The copy
lives in `lib/utils/planPathNarrative.ts` (new): `planPathScreenCopy(screen, answers, context) → { theme,
question, help }`.

| Screen | Theme · question | Body |
| --- | --- | --- |
| partenza | «Partenza» · «Da dove partono le quote?» | `ChoiceList` single: «Dal portafoglio modello» (only with a model; under it the tile's «superato» sentence when `isModelStale`), «Dai pesi di oggi», «Da zero: le scrivo io»; with a seed, first and chosen, «Dai pesi che hai appena calcolato»; with a continued draft, first and chosen, «Dalla bozza che avevi». Help: «Puoi cambiare ogni quota più avanti.» Changing a start after quotas were typed shows «Le quote che avevi scritto vengono sostituite.» |
| versamento | «Versamento» · «Quanto versi ogni mese?» | `NumberField` (€); under it, when `useMonthlySavingsMedian` has a figure, «La mediana del tuo risparmio mensile è {€}.» and the button «Usa {€}» (`variant="outline"`). Help: «Anche 0: il piano investe allora solo la liquidità che hai già.» |
| durata | «Durata» · «Per quanti mesi?» | `NumberField` (integer) and the chips 6 · 12 · 24 · 36 (`SegmentedPill`). Help: «La prima rata è a {mese prossimo}.» |
| conto | «Conto» · «Da quale conto escono i soldi?» | one `Checkbox` row per `isPlanSourceAccount` asset: name and balance (mono). Help: «Il piano compra con la liquidità di questi conti e con quello che versi.» |
| riserva | «Riserva» · «Quanto deve restare sul conto?» | `NumberField` (€) holding `resolvePathReserveEur`; under it «La tua allocazione chiede {€} di liquidità; {€} sono già altrove.» (the `quotaEur` and `otherCashEur` of `resolvePlanReserve`) and, when typed, the link-button «Torna a {€}» (clears the override). Help: «Il piano non scende mai sotto questa cifra: se oggi sei sotto, prima la ricostituisce.» |
| vendite | «Vendite» · «Vuoi vendere qualcosa?» | `ChoiceList` single «No» / «Sì, scelgo cosa»; with «Sì» one row per held instrument a plan can sell (the buyable ones with quotes and the money-market funds): name · «{n} quote · {€}»; a `Checkbox` «Vendi»; ticked → «Quante quote» (`NumberField`, empty = «tutte», the placeholder says so), «In quale mese» (`Select` 1–months: «{mese} ({k}º)»), and the line «circa {€} · tasse stimate {€}» / «tasse non stimabili: manca l'aliquota» (`candidateSaleTaxPerEuro`). Help: «Il ricavato entra nelle rate dal mese della vendita.» |
| strumenti | «Strumenti» · «Che cosa compra il piano?» | a `divide-y` list, one row per position: name (a group: its label and «compra {strumento}» under it) · «oggi {x}%» (mono, muted) · the quota `NumberField` (%, two decimals; 0 = «non lo compra»); footer of the list: «Somma: {s}%» (mono; `text-warning-foreground` off 100), «Ridistribuisci il resto» (`variant="outline"`, disabled at 100), «Aggiungi uno strumento» (G11). Help: «Una quota a 0 tiene lo strumento dov'è: il piano non lo compra e non lo vende.» |
| riepilogo | «Riepilogo» · «Confermi il piano?» | sentences from `buildDraftPreview` on `planPathToDraft`: `describeStep3Summary` (the editor's line), the first instalment and its month, one line per sale (name, quotes, month, «circa {€}», the tax), the total of the estimated taxes, `describeInsufficientLiquidityWarning` and `describeUnpricedWarning` when due, the note of a plan that ends after the Consulente's «rivedi entro» (`planEndsAfterReview`); the box of G9. Primary: «Conferma» («Creo il piano…» while running). |

At 390px every row stacks (name over figures over control); no horizontal scroll (the mobile spec's overflow
guard).

### 4.4 «Conferma»

```ts
const planId = await createAndActivatePlan({
  ownerId,
  draft: planPathToDraft(answers, context),
  existingDraftId: answers.serverDraftId,
  activate: { allAssets: assets, targets, compare: compareAllocations, deps: DEPS, today: new Date() },
  model: updateModel ? { input: { weights, origin: 'manual', optimizerSnapshot }, basis } : undefined,
});
```

`weights` = `planPositionsToModelWeights(positions, assetsById, (asset) => asset.quantity).portfolioWeights`
(the box is hidden when it is empty). Then the invalidations (`accumulationPlans`, the model, `assets`), the stored
draft cleared, and `PathDoneCard`: «Piano attivo: prima rata a {mese}, {€}.» · «Ogni mese lo trovi in Allocazione ›
Accumulo.» · «Apri Accumulo» (primary, `/dashboard/allocation?tab=accumulo`). A `PlanWriteError`: `status` reads
«Il piano è salvato ma non attivo: {reason}. Premi di nuovo «Conferma».» (`step: 'activate'` — the path then sets
`serverDraftId` to the error's `planId`, so the second press overwrites and activates) or «Il piano è attivo; il
portafoglio modello non è stato aggiornato: {reason}.» (`step: 'model'` — the done card follows with this line).

### 4.5 The entry points

- `AccumuloVuotoTile.tsx:150-176`: «Crea piano» becomes `Button asChild` → `Link` to
  `/dashboard/allocation/piano` (disabled as today: demo, no targets); the `AccumulationPlanDialog` and its state
  leave the file.
- `PortafoglioModelloTile.tsx:325-349` (`onCreatePac(seed)`): writes
  `writeStoredJson(localStorage, planPathStorageKey(ownerId), { version: 1, screen: 'partenza', answers: {
  …initial, start: 'seed', seed, positions: seed.positions, sales: salesOf(seed.disposals) } })` and
  `router.push('/dashboard/allocation/piano')`; the `view === 'pac'` branch and its dialog leave the file. When the
  browser already holds a draft the seed replaces it (the user just asked for these weights).
- `QuestoMeseTile.tsx` draft view (`:425-442`): «Modifica» becomes the link «Continua»
  (`ACCUMULO_ACTION_CONTINUE = 'Continua'`); `planDialog` (`:346-362`) is deleted; «Attiva piano» and «Elimina
  bozza» stay. `reviseDialog` (`:365-383`) stays.
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
- **React Compiler**: the clock is read once at mount (`todayMonth`); `planPathToDraft` and `buildDraftPreview`
  run in render on the summary only.
- **The browser draft is the owner's data on the owner's browser** (as Compravendita's): never sent, never
  logged; `parseStoredPlanPath` refuses any other `version`.
- **Shared account**: every read and write uses `ownerId`; the storage key carries it.
- **No series label in code**; **no owner data in a tracked file** (fixtures: «ETF ornitorinco», «Fondo
  fenicottero», round figures).
- **Tests that move** (edited on purpose): `__tests__/accumuloVuotoTile.test.tsx` (the button is a link),
  `__tests__/portafoglioModelloTile.test.tsx` (the seed goes to the storage), the creations through the editor in
  `e2e/accumulo.spec.ts`, `e2e/accumulo.mobile.spec.ts`, `e2e/accumulo.tablet.spec.ts`, `e2e/allocation.spec.ts`
  and `e2e/allocation.mobile.spec.ts` (each walks the path instead; a helper `walkPlanPath(page, answers)` in
  `e2e/accumuloFixture.ts`).

## 6. Tests per level (with the mutation that proves each)

| # | Test | Mutation that turns it red |
| --- | --- | --- |
| U1 | `__tests__/planPath.test.ts`: `next`/`back` walk the eight screens; `back` on the first and `next` on the last do nothing | allow `next` past the summary |
| U2 | same › `seedPlanPathPositions`: `today` on ETF A 6.000 / ETF B 4.000 → 60 / 40; `zero` → 0 / 0; `model` → the model's weights with its group as one row; an asset sold whole is absent | seed `zero` with today's weights |
| U3 | same › `describePlanPathBlock`: each row of the table, and null on valid answers | drop the Σ check |
| U4 | same › `sale`: 30 of 40 quotes → partial, the row stays; 40 of 40 → `quantity: null`, the row removed; taken back → the row returns at 0 %; a group's member whole → refused | keep the row on a whole sale |
| U5 | same › `initialPlanPathDraft` with an open draft: `start: 'draft'`, its months, accounts, positions, a sale in month 3 kept in month 3 | read `monthIndex` as 1 |
| U6 | same › `parseStoredPlanPath` / `reconcilePlanPathAnswers`: another `version` → null; an account deleted → dropped; a `serverDraftId` no longer open → cleared | keep a stale `serverDraftId` |
| U7 | same › `planPathToDraft`: `startMonth` the month after `todayMonth`; the reserve computed with `sourceIds` (quota 10.000, source 4.000, other account 5.000 → 5.000) and the typed one when typed; `monthIndex` from the sale | ignore the override |
| U8 | same › `firstPlanPathRefusal`: valid screens and a draft the gate refuses (a held buyable instrument with no row) → the gate's message | skip the gate |
| U9 | `__tests__/pathDraftStorage.test.ts`: a throwing storage reads null and writes nothing | let the throw out |
| R1 | `__tests__/pathCard.test.tsx` (new, `dom`): eyebrow «Passo 3 di 8 · Durata», the status line's tone, «Ricomincia» armed on the first press | call `onConfirm` at the first press |
| R2 | `__tests__/pianoScreens.test.tsx` (new, `dom`) › strumenti: the rows, «Somma: 90,00%» in warning, «Ridistribuisci il resto» dispatches, a group shown as one row | — |
| R3 | same › vendite: ticking shows quantity, month and the tax line; «tasse non stimabili: manca l'aliquota» | hide the month |
| R4 | `__tests__/pianoClient.test.tsx` (new, `dom`; hooks mocked): demo, no targets, an active plan → the three screens | render the wizard with an active plan |
| R5 | `__tests__/accumuloVuotoTile.test.tsx`, `portafoglioModelloTile.test.tsx`: the link; the seed in the storage under `planPathStorageKey` | keep the dialog |
| E1 | `e2e/accumulo.piano.spec.ts` (new): from the empty tile, the eight screens (Dai pesi di oggi, 500, 12, the account, the reserve, no sale, quotas 60/40, the summary) → «Conferma» → the done card; through firebase-admin: ONE plan, `active`, 12 instalments, the model written | — |
| E2 | same: a sale of 5 quotes in month 3 → `disposals[0]` with `quantity: 5`, `monthIndex: 3`; the summary showed its tax | — |
| E3 | same: a reload on screen 4 comes back on screen 4 with the answers; «Ricomincia» twice → screen 1 | — |
| E4 | same: a planted draft → «Continua» → the path prefilled → «Conferma» → the SAME plan id, `active` | — |
| E5 | same: «Crea un PAC con questi pesi» from the model's dialog → the path on screen 1 with «Dai pesi che hai appena calcolato» chosen; screen 7 shows those quotas | — |
| E6 | same: an active plan → the path shows «Hai già un piano di accumulo attivo»; «Rivedi il piano» still opens the editor | — |
| E7 | `e2e/accumulo.piano.mobile.spec.ts` (new): the eight screens at 390 without horizontal overflow; `e2e/assets.compravendita.spec.ts` unchanged and green | — |

## 7. Guided verification (WORKFLOW.md § 2)

Expected outcome, declared first: on the seed account, from an empty Accumulo, eight screens and one «Conferma»
give an ACTIVE plan whose first instalment equals the one the summary showed; the same answers typed in the editor
on `develop` (the script records them before the branch) give the same instalments; a reload keeps the place; a
draft is continued and activated as itself; Compravendita looks and behaves as before.

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
  ticked, reload → the account is gone and «conto» blocks; activate in another tab the draft being continued,
  reload → the path shows the active-plan screen; monthly amount 0 with cash under the reserve → the summary's
  insufficient-liquidity warning.
- **F (owner, at «pronto»)**: the mirror (`npm run mirror:seed -- <email>`); the owner builds a plan by hand on his
  mirrored data from «Crea piano» and from the model's «Crea un PAC con questi pesi», and says whether a screen asks
  something he cannot answer. `npm run mirror:remove`.
- **G**: `npm run perf:budget` (the new route's entry recorded; `/dashboard/allocation` and
  `/dashboard/assets/compravendita` by README § 8 — Allocazione keeps the editor's chunk for «Rivedi il piano»);
  `mobile:census` + `mobile:budget` (Accumulo's empty and draft tiles change one control each: the entries they
  touch are named in doc/guide/prima-schermata-misure.md); stop the servers, delete the scripts, remove the mirror.

## 8. Putting it into service

One PR to `develop`; no rule, no index, no migration (a draft that exists stays a draft, continued or deleted). No
step on the owner's production account beyond a look after the deploy: «Crea piano» opens the path.

## 9. Documentation

- `doc/guide/accumulo.md`: § the editor → «Creare un piano: il percorso» (the eight screens, the blocks, the
  browser draft, «Conferma», the entry points; what the path does NOT offer: groups by hand, «Sostituisci»,
  «Ottimizzato»); the draft view («Continua»); § Files; § Per-page blind spots: «a plan made from a model keeps the
  model's groups as rows; to change a group, change the model».
- `doc/guide/compravendita.md` and `doc/guide/consulente.md` § Files: the shared `path-card`, `path-fields`,
  `pathDraftStorage`. `doc/guide/shell.md` or `dialog.md`: none.
- `AGENTS.md` § 3 Allocazione › Accumulo: the stub's bullet («a plan is created by the path at
  `/dashboard/allocation/piano`; the editor only revises»); § conventions: «a guided path renders `PathCard`».
- `DESIGN.md` The Path-Scene Rule (`:589`) gains ONE closing sentence (before: absent): «A guided path outside the
  Consulente — Compravendita, the plan of accumulation — is the same 720px card, rendered by `PathCard`: the
  eyebrow «Passo n di N · tema», the question as the headline, one help line, the controls, the footer with
  «Indietro», «Ricomincia» and one primary button; it has no rail and no slide.»
- `CLAUDE.md`: «Latest», the Accumulo line of Key Features, Key Files › Shared primitives (`path-card`,
  `path-fields`); `README.md` and `Draft Release Temp.md`: the path in the user's words.
- `doc/guide/velocita.md` § Registro and `doc/guide/prima-schermata-misure.md`: the measures.
- `doc/nove/README.md`: § 6 the row; § 7 the path's contracts (read by NOVE-26).

## 10. Declared out of scope

- **Revising an active plan in the path, deleting the editor** → NOVE-26.
- **The editor's dead create branches** stay until NOVE-26 (decision 62: `develop` reaches `main` only with the
  whole series).
- **Grouping by hand, «Sostituisci», «Ottimizzato» in a plan** (decision 89): none, declared — the model's dialog
  owns the optimizer and the groups.
- **A review month typed by hand** (decision 69: the Consulente's): none, declared.
- **A start month other than the next**: none, declared.
- **Several plans at once**: none, declared (one draft-or-active plan per account).
- **The costume on the path's screens** → NOVE-19/20, which dress `PathCard` once for the three paths.

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
  doc/guide/consulente.md, doc/guide/stati.md, doc/guide/velocita.md,
  doc/guide/prima-schermata.md, doc/guide/e2e-emulatori.md e doc/guide/e2e-playwright.md PRIMA
  di scrivere codice in quei domini
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
con U1-U9; le schermate (§ 4.3); «Conferma» (§ 4.4); gli ingressi (§ 4.5); la route e il suo
budget (§ 4.6). I test PRIMA del codice, ciascuno visto rosso con la sua mutazione; cifre
inventate e tonde. Prima di cambiare gli ingressi registra con lo script della § 7 B le rate
che l'editor produce sulle stesse risposte: il percorso deve dare le stesse. Fermati e
chiedimi se: un test o uno spec di Compravendita o del Consulente diventa rosso dopo
l'estrazione della § 4.1; il percorso produce rate diverse dall'editor a parità di risposte;
una schermata ha bisogno di una domanda che la spec non elenca; perf:budget o mobile:budget
diventano rossi oltre la regola della § 8 dell'indice.
Collaudo: § 7, la F sul mirror al mio «pronto» (costruisco io un piano a mano). Un branch,
un commit, solo dopo il mio OK con il riassunto del diff. SESSION_NOTES.md non si committa.
```

Model: **Opus 5.5**, effort **medium** — an L spec with shared contracts (`PathCard` adopted by two existing
paths, the path's pure module read by NOVE-26, `createAndActivatePlan`) across Accumulo, Compravendita and the
Consulente's wizard, with a new route and its budgets. Estimated size: 1 session, ~7 h; ~380 lines pure, ~650
across components, ~600 of tests, seven E2E tests and the moved ones.
