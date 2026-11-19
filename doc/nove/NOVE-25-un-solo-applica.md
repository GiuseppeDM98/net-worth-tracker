# NOVE-25 — One «Applica»: the Consulente's operating plan becomes the plan of accumulation

> Series `doc/nove/` (README.md § 5): **depends on NOVE-23** (`disposalMonthIndex`, `reviewMonthIndex`,
> `resolveInvestmentAccountId`, `investmentCashAssetId`, a revision that keeps a new sale's month) **and NOVE-24**
> (`OperatingPlan`, `operatingPlanOf`, `reconcileOperatingPlan`, `OperatingPlanFacts`, the page «Il piano
> operativo», the absence row on «Applica»). Third of the five specs of «dal Consulente al piano di accumulo, in un
> clic»: the click. It removes NOVE-21's window «Dal Consulente» and the optimizer from this path.
> Written on 2026-11-19; every `file:line` is cited on `develop` @ 7909fa4c. Executes decisions 67, 71, 72, 73, 74,
> 76, 77, 79, 80, 81, 82 (README.md § 3); overturns decision 27 and NOVE-21's choices C1 and C3.

## 1. The problem today (evidence on the code)

**From «Applica» to a running plan there are at least six clicks and three windows.** `apply()`
(`components/allocation/consulente/ConsulenteReport.tsx:101-131`) writes targets, roles and goals; then the page
offers a LINK (`CONSULENTE_HANDOFF_HREF`, `lib/utils/allocationAdviceDocument.ts:78`) to Accumulo, where «Dal
Consulente» opens (`components/allocation/ConsulenteHandoff.tsx`), then `AssetDialog` once per missing instrument,
then the three-step editor, then «Attiva piano». The owner (2026-11-18): «solo il click per creare il pac e basta».

**The plan that comes out is not the Consulente's.** `buildHandoffSeed`
(`lib/utils/allocationAdviceHandoff.ts:130-209`) runs the optimizer in mode `'ideal'`; no sale is seeded (C3); a new
instrument in a class without sub-targets starts at 0 % (decision 58).

**No code can create a plan without the editor.** `createDraftPlan` then `activatePlan`
(`lib/services/accumulationPlanService.ts:141`, `:210`) are called only from the dialog
(`components/allocation/AccumulationPlanDialog.tsx:646-692`), which also owns the gate
(`validateDraftAgainstAssets` is called by `revisePlan` alone, `:393-420`), the model's write (`finishWithModel`,
`:634-645`) and the empty draft (`emptyDraft`, `:223-240`).

**An instrument is created only by a form.** `createAsset` (`lib/services/assetService.ts:130-209`) accepts any
`AssetFormData`, but the price is fetched by a private function of the dialog (`fetchMarketPrice`,
`components/assets/AssetDialog.tsx:148-186`) and the ticker is mandatory only in the dialog's schema. The quote
route returns no time (`app/api/prices/quote/route.ts`: `{ ticker, price, currency, currentPriceEur? }`;
`getQuote`, `lib/services/yahooFinanceService.ts:34-61`, reads `regularMarketPrice` alone): a symbol that stopped
updating cannot be told from a live one. Measured on 2026-11-19 with `yahoo-finance2` 3.13.2: `quote()` carries
`regularMarketTime`; `search(<ISIN>)` returns ONE listing and throws in validation — no ISIN search on the app's
side.

**An asset without a ticker would be quoted every day.** `lib/helpers/priceUpdater.ts:161-166` builds `tickers =
[...new Set(otherAssets.map((asset) => asset.ticker))]` for every asset with `autoUpdatePrice !== false` (`:77`):
an empty ticker would reach `getMultipleQuotes`.

**An open plan stops everything.** With a draft the page shows `HANDOFF_DRAFT_NOTE`, with an active plan
`APPLY_ACTIVE_PLAN_NOTE` (`lib/utils/allocationAdviceNarrative.ts:308-316`): the Consulente can neither replace the
first nor revise the second.

## 2. Goal and acceptance criteria

1. With a usable operating plan, the «Applica» page shows a fourth tick «Il piano di accumulo», on by default, with
   a one-line summary computed by the engine on today's portfolio. **Proof**: R1, E1.
2. ONE press of «Applica alle impostazioni» writes targets, roles, goals, creates the missing instruments and the
   plan, ACTIVE, with the first instalment next month; then the page reads «Piano creato» with «Apri in Accumulo».
   **Proof**: U8, E1.
3. The plan's positions, quotas, sales with their months, months, monthly inflow, review month are the operating
   plan's after `reconcileOperatingPlan` on TODAY's facts; every correction — the stored ones and today's — is a
   sentence on the page BEFORE the click and on the plan after. **Proof**: U1–U3, R1, E1.
4. Every missing instrument is created at 0 quotes: with the first of its symbols that has a price at most five
   days old (ticker, price and date shown before the click); without one, created with no price and said; a
   government bond is created to complete, and said. No asset is stored with an empty ticker; one without a symbol
   never enters the daily price update. **Proof**: U4, U5, U6, E1, E2.
5. The plan draws from «Conto per gli investimenti»; when it is not set the tick shows «Da quale conto?», and the
   choice is saved as the setting by the same click; without a choice the tick stays off. **Proof**: R2, E3.
6. A draft in Accumulo is replaced and activated (the tick says so); an active plan is revised from its first
   intact instalment (the tick says so). **Proof**: U7, U9, E4, E5.
7. The tick is offered only together with «I target»; plans not read → the tick is disabled with its sentence.
   **Proof**: R3.
8. On a document already applied, with the targets written and no plan created from it, the page offers «Crea il
   piano di accumulo»: the same click without the three writes. **Proof**: R4, E6.
9. A step that fails says what was written and what was not; pressing again does not create a second instrument
   nor a second plan. **Proof**: U10, E7.
10. The model portfolio is written with the plan's weights (held rows at 0 % included), as the editor does.
    **Proof**: U8.
11. «Dal Consulente», its link, its window, `buildHandoffSeed` and the kept-sale note are gone; `?da=consulente`
    only cleans the URL. **Proof**: U11, E8.
12. The Consulente route loads the plan's code only when the tick is drawn; `perf:budget` closes by README § 8.
    **Proof**: U12, § 7 G.

## 3. Decisions

- **Owner 71 (2026-11-19)**: ONE «Applica» does everything: a fourth tick «Il piano di accumulo» (on) with a
  one-line summary; then «Piano creato» + «Apri in Accumulo»; the window «Dal Consulente» disappears.
- **Owner 72**: the click creates the plan ACTIVE at once.
- **Owner 73**: the app creates in the same click EVERY missing instrument (0 quotes); one without a ticker is
  created all the same, without a price, and the summary says so («accertati che un asset senza ticker venga
  creato e non dia errore»).
- **Owner 74**: the right ticker — the app reads price and date of each of the (up to three) symbols in order and
  uses the first with a price of the last 5 days; «Applica» shows «ticker · prezzo · data» before the click.
- **Owner 76**: without «Conto per gli investimenti» the tick asks «Da quale conto?» and saves the choice.
- **Owner 77**: an app rule against the Consulente's plan — the app corrects and says so, one sentence per
  correction before the click, which stays on the plan; the tick goes off only if the plan can buy nothing.
- **Owner 79**: an open draft is REPLACED. **Owner 80**: an active plan is REVISED.
- **Owner 81, 82**: read from NOVE-24 (taxes shown; a forgotten instrument at 0 %, a new one at its quota).
- **Kept from NOVE-21 (owner)**: the model is written with the plan («Salva bozza writes the model too»); held rows
  at 0 % enter the model; every held buyable instrument is a row.
- **Overturned**: decision 27 (2026-11-12: «calcolato dal codice (ottimizzatore + `seedDraft`), il proprietario
  conferma nell'editor») and NOVE-21's C1 (the optimizer's seed) and C3 (no sale seeded) — by decisions 67, 71, 72
  (2026-11-19). Decision 58 no longer has a reader (decision 82).
- **Adopted, reversible (this spec)**:
  - K1. The plan's name is «Piano di accumulo»; its first month is the month after the click.
  - K2. The corrections live on the plan as `advisorNotes: string[]` and are shown in «Questo mese».
  - K3. The stored ticker of a new instrument: the chosen symbol; else the ISIN; else a slug of the name
    (`ETF-ORO-FISICO`). `autoUpdatePrice` is `true` only with a chosen symbol.
  - K4. A government bond (the prefill's type `bond`) is created with its ISIN as ticker, no price,
    `autoUpdatePrice: false`: nominal, coupon and maturity are the asset form's.
  - K5. Five CALENDAR days of freshness (a long weekend passes).
  - K6. The click is not atomic: the steps run in order, each idempotent on a second press (an instrument is
    matched by ISIN or name before it is created; an open plan is updated, never duplicated).
  - K7. The reserve of the plan is the cash quota of the NEW targets left on the chosen account
    (`resolvePlanReserve` with the source ids).
  - K8. A sale the active plan already executed is not sold again by a revision: the row is dropped with a
    sentence.
  - K9. The advice document records the plan it created (`applied.planId`, `applied.planAction`).
  - K10. The page keeps the plan's code out of the first load: one lazily loaded component.

## 4. Solution

### 4.1 The plan document (`types/accumulationPlan.ts`, schema, mapper, services)

`AccumulationPlan` and `AccumulationPlanDraft` gain `advisorNotes?: string[]` (schema:
`z.array(z.string().max(400)).max(40).optional()`); `docToAccumulationPlan` maps it; `createDraftPlan` and
`updateDraftPlan` write it when defined; `PlanRevisionInput` gains `advisorNotes?: string[]` and `revisePlan` writes
it when the input names it. `updateDraftPlan` also writes `reviewMonthIndex` (NOVE-23) — and CLEARS both fields
(`deleteField()`) when the new draft has none, because a replaced draft must not keep the old plan's notes.

### 4.2 The quote with its time (`lib/services/yahooFinanceService.ts`, `app/api/prices/quote/route.ts`)

`QuoteResult` gains `quotedAt?: string` (ISO): `getQuote` sets it from `quote.regularMarketTime` when it is a
`Date`; the route passes it through. No other caller reads it.

### 4.3 The pure builder (`lib/utils/advicePlan.ts`, new)

```ts
export const FRESH_QUOTE_DAYS = 5;

export interface AdviceQuote { symbol: string; price: number; currency: string; priceEur: number; quotedAt: string }
export interface RawQuote { symbol: string; price: number | null; currency?: string; currentPriceEur?: number; quotedAt?: string }

/** The first quote, in the given order, with a price whose last trade is at most five days old. */
export function pickFreshQuote(quotes: readonly RawQuote[], nowMs: number): AdviceQuote | null {
  for (const quote of quotes) {
    if (!quote.price || quote.price <= 0 || !quote.quotedAt) continue;
    const ageMs = nowMs - new Date(quote.quotedAt).getTime();
    if (!(ageMs <= FRESH_QUOTE_DAYS * 86_400_000)) continue;
    const currency = (quote.currency ?? 'EUR').toUpperCase();
    const priceEur = currency === 'EUR' ? quote.price : quote.currentPriceEur;
    if (!priceEur || priceEur <= 0) continue;
    return { symbol: quote.symbol, price: quote.price, currency, priceEur, quotedAt: quote.quotedAt };
  }
  return null;
}

/** A ticker for an instrument with no symbol — its ISIN, else its name as a slug the ticker rule accepts. */
export function fallbackTicker(prefill: Pick<AssetPrefill, 'name' | 'isin'>): string {
  const isin = prefill.isin?.trim().toUpperCase();
  if (isin) return isin;
  const slug = prefill.name.normalize('NFD').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').toUpperCase().slice(0, 20);
  return slug || 'STRUMENTO';
}

export type NewInstrumentPricing =
  | { kind: 'priced'; quote: AdviceQuote }
  | { kind: 'unpriced'; reason: 'no-symbol' | 'no-fresh-quote' }
  | { kind: 'bond' };

/** The form data of an instrument the plan creates: 0 quotes, `createdEmpty`, priced or not. */
export function newInstrumentFormData(instrument: OperatingPlanInstrument, pricing: NewInstrumentPricing): AssetFormData {
  const prefill = instrument.prefill!;
  const priced = pricing.kind === 'priced' ? pricing.quote : null;
  return {
    name: prefill.name,
    ticker: priced ? priced.symbol : fallbackTicker(prefill),
    isin: prefill.isin,
    type: prefill.type,
    assetClass: prefill.assetClass,
    subCategory: prefill.subCategory || undefined,
    currency: priced ? priced.currency : 'EUR',
    quantity: 0,
    createdEmpty: true,
    currentPrice: priced ? priced.price : 0,
    currentPriceEur: priced && priced.currency !== 'EUR' ? priced.priceEur : undefined,
    autoUpdatePrice: priced !== null,
  };
}
```

`describeNewInstrument(name, pricing, formatters)` returns the line the page shows:
«{nome} · {ticker} · {prezzo} · {data}» (priced); «{nome} · senza prezzo: nessun listino ha un prezzo degli
ultimi 5 giorni. Il piano lo compra quando gli dai un ticker in Patrimonio.» (`no-fresh-quote`); «{nome} · senza
ticker né prezzo: completalo in Patrimonio perché il piano lo compri.» (`no-symbol`); «{nome} · titolo di Stato:
completa nominale, cedola e scadenza in Patrimonio perché il piano lo compri.» (`bond`).

```ts
export interface AdvicePlanInput {
  plan: OperatingPlan;                          // operatingPlanOf(document)
  assets: Asset[];                              // live
  keepNames: readonly string[];
  limits: IdealAllocationSettings['instrumentLimits'];
  newTargets: AssetAllocationTarget;            // buildTargetsFromProposal(proposal)
  sourceAssetId: string;
  openPlan: AccumulationPlan | null;            // selectOpenPlan(plans)
  pricing: Record<string, NewInstrumentPricing>; // by N key
  compare: AllocationCompare;
  deps: PlanDeps;
  today: Date;
  generateId?: () => string;
}

export interface AdvicePlanBuild {
  action: 'create' | 'replace' | 'revise';
  /** The plan after today's reconcile; `usable` false → the tick is off with `notes`' last sentence. */
  reconciled: OperatingPlan;
  /** The stored corrections and today's, in order, without repeats. */
  notes: string[];
  toCreate: Array<{ ref: string; formData: AssetFormData; pricing: NewInstrumentPricing }>;
  /** The draft with `new:<ref>` in place of the ids not yet created. */
  draft: AccumulationPlanDraft;
  /** The engine's preview on the draft, the missing instruments as assets at 0 quotes with their price. */
  preview: ReturnType<typeof buildDraftPreview>;
  issues: DraftIssue[];
}

export function buildAdvicePlan(input: AdvicePlanInput): AdvicePlanBuild
```

`buildAdvicePlan`, step by step:

1. **Today's facts** — `refreshOperatingPlanFacts(plan.instruments, assets, …)` (added to
   `lib/utils/operatingPlanFacts.ts`): a stored S/M key keeps its key when its `assetId` is still among the assets
   and still buyable (S) or a money-market fund (M), else it is absent from the facts (rule 3 of the reconcile drops
   its row with its sentence — the instrument was sold or deleted since); a stored N key whose instrument now exists
   (`findAssetByName` on «name (ISIN)», the ISIN, the name) becomes a held key with that id; a held buyable asset
   with value that no key names gets a new S key (rule 9 gives it a row at 0 %). Quantities, prices, taxes, `keep`
   and limits are today's.
2. **Reconcile** — `reconciled = reconcileOperatingPlan(rawOf(plan), facts)`; with an active `openPlan`, a `sell`
   row on an asset whose sale that plan already executed is dropped first with «{nome}: il piano attivo ha già
   registrato una vendita; quella nuova non entra.» (K8). `notes = unique([...plan.corrections,
   ...reconciled.corrections, …the K8 sentences])`.
3. **Instruments** — every N key with a `buy` row → `toCreate` with `newInstrumentFormData(instrument,
   pricing[ref] ?? { kind: 'unpriced', reason: 'no-symbol' })`; its id in the draft is `new:<ref>`.
4. **Positions** — one per row that is not a sale of every share: `{ id: generateId(), label: name,
   targetPercentage, memberAssetIds: [id], buyAssetId: id }`.
5. **Sales** — one `PlanDisposal` per `sell` row: `{ assetId, quantity: sellQuantity, monthIndex: sellMonth ?? 1,
   estimatedProceedsEur: proceedsOfDisposal(…), status: 'planned' }`.
6. **Liquidity** — `sourceCashAssetIds: [sourceAssetId]`, `monthlyInflowEur: reconciled.monthlyInflowEur`,
   `reserveEur: resolvePlanReserve(assets, newTargets, compare, deps, planCashFundSaleEur(…), [sourceAssetId]).reserveEur`
   (`resolvePlanReserve` gains an optional last parameter `sourceIds?: readonly string[]`: when given, the accounts
   that hold the quota are those only, so the cash on the other accounts counts as cash outside the plan — K7).
7. **The draft** — `{ name: 'Piano di accumulo', startMonth: addMonths(toMonthKey(today), 1), months, liquidity,
   positions, disposals, reviewMonthIndex: reconciled.reviewMonth, advisorNotes: notes }`. With `action:
   'revise'` (an active `openPlan`) the months count from that plan's first intact instalment `k`: `startMonth` is
   that instalment's month, every `monthIndex` and the review month are shifted by `k − 1`, and the months are
   capped at `60 − (k − 1)` (the engine's `months_range`) with the note «Il piano attivo ha già {n} rate chiuse:
   la durata scende a {m} mesi.» when the cap bites.
8. **Issues and preview** — `issues = validateDraftAgainstAssets(draft, assetsById)` and `preview =
   buildDraftPreview({ draft, allAssets, targets: newTargets, band, compare, deps })`, both on `assets` plus one
   synthetic asset per `toCreate` (`id: 'new:<ref>'`, quantity 0, the form data's price). The issues are empty by
   construction (the reconcile gives every held buyable instrument a row); a non-empty list turns the tick off with
   the first message (a guard, tested by U3).

`action` is `'revise'` for an active `openPlan`, `'replace'` for a draft, `'create'` otherwise.

`describeAdvicePlanSummary(build)` (in `lib/utils/allocationAdviceNarrative.ts`, zod-free) gives the tick's line:
«{months} mesi da {mese}, {€} al mese: prima rata {€}{, n strumenti da creare}{, n vendite con tasse stimate
{€}}.» — the first instalment is the preview's first buying instalment; the taxes are the reconciled rows'
(«, tasse non stimabili su {n}» when some are `null`).

### 4.4 The executor (`lib/services/advicePlanService.ts`, new, client)

```ts
export interface AdvicePlanRun {
  ownerId: string;
  build: AdvicePlanBuild;
  assets: Asset[];
  openPlan: AccumulationPlan | null;
  newTargets: AssetAllocationTarget;
  basis: ModelBasis;                            // buildModelBasis({ ...settings, targets: newTargets }, goals)
  saveSourceAsSetting: boolean;                 // the account was chosen on the page
  sourceAssetId: string;
  compare: AllocationCompare;
  deps: PlanDeps;
  today: Date;
}
export type AdvicePlanStep = 'setting' | 'instruments' | 'plan' | 'activate' | 'model';
export class AdvicePlanError extends Error { step: AdvicePlanStep; done: AdvicePlanStep[]; planId?: string }

export async function executeAdvicePlan(run: AdvicePlanRun): Promise<{ planId: string; action: AdvicePlanBuild['action'] }>
```

In order, each step awaited:

1. `setting` — when `saveSourceAsSetting`: `setSettings(ownerId, { investmentCashAssetId: sourceAssetId })`.
2. `instruments` — the assets are RE-READ (`getAllAssets(ownerId)`); for each `toCreate` not already there (by ISIN,
   else by exact name: K6) `createAsset(ownerId, formData)`; the map `new:<ref>` → id is built from the created and
   the found ones; the draft's ids are replaced.
3. `plan` — by `build.action`: `create` → `createDraftPlan(ownerId, draft)`; `replace` →
   `updateDraftPlan(openPlan.id, draft)`; `revise` → `revisePlan(openPlan.id, revision, { allAssets, deps, today })`
   with `revision = { monthlyInflowEur, reserveEur, remainingMonths: reconciled.months, positions,
   sourceCashAssetIds, reviewMonthIndex: draft.reviewMonthIndex ?? null, advisorNotes: draft.advisorNotes,
   ...diffRevisionDisposals(openPlan, draft.disposals) }` (the diff's `newDisposals` as `disposals`).
4. `activate` — `create` and `replace` only: `activatePlan(planId, { allAssets, targets: newTargets, compare, deps,
   today })` with the assets re-read after step 2.
5. `model` — `saveModelPortfolio(ownerId, { weights: planPositionsToModelWeights(positions, assetsById, (asset) =>
   asset.quantity).portfolioWeights, origin: 'manual' }, allAssets, basis)`; skipped when no weight results
   (`MODEL_NO_TRADABLE_INSTRUMENTS` is the editor's refusal: here the plan stands and the note says the model was
   not written).

Steps 3–5, for `create` and `replace`, are ONE function of `lib/services/accumulationPlanService.ts`, which
NOVE-22's path calls too (README § 7):

```ts
export interface CreateAndActivateInput {
  ownerId: string;
  draft: AccumulationPlanDraft;
  /** An open draft to overwrite, in place of a new one. */
  existingDraftId?: string;
  activate: ActivatePlanInput;                  // { allAssets, targets, compare, deps, today }
  /** The model to write after the activation; absent = the model is not written. */
  model?: { input: ModelPortfolioInput; basis: ModelBasis };
}
export type PlanWriteStep = 'plan' | 'activate' | 'model';
export class PlanWriteError extends Error { step: PlanWriteStep; planId?: string }
/** Refuses a draft `validateDraftAgainstAssets` has an issue with, before any write; returns the plan's id. */
export async function createAndActivatePlan(input: CreateAndActivateInput): Promise<string>
```

`executeAdvicePlan` wraps its `PlanWriteError` into the `AdvicePlanError` of the same step.

A failure throws `AdvicePlanError` with the step and the steps done. `describeAdvicePlanFailure(error)`
(narrative): «Ho scritto {target, ruoli e obiettivi; gli strumenti; il piano}. Non sono riuscito a {attivare il
piano | aggiornare il portafoglio modello | …}: {reason}. Premi di nuovo «Applica»: riparte da lì.» A second press
rebuilds `build` on the re-read data: the instruments are found (K6), a draft left by a failed activation is
`replace`d and activated.

### 4.5 The «Applica» page (`ConsulenteReport.tsx`, `ConsulenteBookPages.tsx`, `ConsulentePlanTick.tsx` new)

- `components/allocation/consulente/ConsulentePlanTick.tsx` (new, loaded through the repo's `lazyComponent()`,
  `components/ui/lazy-component.tsx`, only when `operatingPlanOf(document)` is not null and the «Applica» page is
  the open one): it reads `useSettings(ownerId)`, `useAccumulationPlans(ownerId)`, the goals already on the route,
  and the quotes — `useQuery(['advice-plan-quotes', ownerId, symbolsKey], …)` calling
  `/api/prices/quote?ticker=` for every symbol of every N instrument that is not a bond, `staleTime` 5 minutes. It
  calls `buildAdvicePlan` in render (pure) and reports up through `onBuild(build | null)`; it renders:
  1. the checkbox `id="apply-plan"` with the label by `build.action`: «Il piano di accumulo: {summary}» / «Il piano
     di accumulo, al posto della bozza che hai in Accumulo: {summary}» / «Rivede il piano di accumulo attivo:
     {summary}»;
  2. «Da quale conto?» — a `Select` of the source accounts (`isPlanSourceAccount`), only when
     `resolveInvestmentAccountId(settings, assets)` is null; under it «Lo ricordo come Conto per gli investimenti.»;
  3. one line per instrument to create (`describeNewInstrument`);
  4. «Corretto dall'app» with `build.notes`, when any;
  5. its states: quotes or plans loading → the checkbox disabled, «Preparo il piano…»; plans not read → disabled,
     «Non ho letto i piani di accumulo: ricarica la pagina per creare il piano da qui.»; `reconciled.usable` false
     or an issue → off and disabled with the sentence; «I target» unticked → off and disabled, «Il piano va verso i
     nuovi target: applicali insieme.»
- `ConsulenteReport.tsx`: state `applyPlan` (default true) and `planBuild`; `canApply` also allows `applyPlan &&
  planBuild`; `apply()` after the goals' write and BEFORE `markApplied` awaits `executeAdvicePlan` (imported with
  `await import('@/lib/services/advicePlanService')`), then `markApplied(ownerId, { …written, planId, planAction
  })`; the invalidations gain `queryKeys.accumulationPlans.all(ownerId)` and the model's key. A failure of the plan
  AFTER the three writes still calls `markApplied` without a plan (the settings ARE applied) and shows
  `describeAdvicePlanFailure`; the applied page then offers the button of the next bullet.
- The applied body: with `document.applied.planId` → «Piano creato.» / «Bozza sostituita e piano attivato.» /
  «Piano rivisto.» (by `planAction`) and the link «Apri in Accumulo» (`/dashboard/allocation?tab=accumulo`, a
  `Button asChild variant="outline"`); without it, with `applied.targetsWritten` and a usable plan → the same
  `ConsulentePlanTick` without the checkbox and the button «Crea il piano di accumulo» (primary), which runs
  `executeAdvicePlan` and then `markApplied` with the same counts plus the plan.
- `applyPieces` loses `handoff` and `activePlanNote`; `ApplyState` gains nothing (the status line reads «Scrivo…»,
  then «Applicato.» or the failure).
- `/api/allocation-advice/applied`: `appliedSchema` gains `planId: z.string().min(1).optional()` and `planAction:
  z.enum(['create', 'replace', 'revise']).optional()`; `AllocationAdviceApplied` and `mapAllocationAdviceData` too.
  The route accepts a second POST on an `applied` document (it does today: it only requires a report).
- Copy (`allocationAdviceNarrative.ts`): `describeApplySummary` gains `plan: 'create' | 'replace' | 'revise' |
  null` and ends «…e crea il piano di accumulo.» / «…e sostituisce la bozza del piano.» / «…e rivede il piano di
  accumulo.»; `HANDOFF_ACTION_LABEL`, `HANDOFF_READING`, `HANDOFF_DRAFT_NOTE`, `APPLY_ACTIVE_PLAN_NOTE` are deleted.

### 4.6 Accumulo: the notes, and what is removed

- `QuestoMeseTile` (active view, under the reading): when `plan.advisorNotes?.length`, the sub-eyebrow «Dal
  Consulente» and the notes as a `divide-y` list of `text-[12px] text-muted-foreground` lines; more than three →
  the first three and a `<details>` «Altre {n}» with the rest.
- **Removed**: `components/allocation/ConsulenteHandoff.tsx`, `components/allocation/KeptSalesNote.tsx` and the
  editor's `advisorKeepAssetIds` prop; `buildHandoffSeed`, `findKeptSales` and the seed's helpers
  from `lib/utils/allocationAdviceHandoff.ts`, the seed's readings (`describeHandoffZero`, `describeHandoffExtra` and their caller, `lib/utils/accumulationNarrative.ts:1411-1460`) — the hand-off module keeps
  `planConsulenteHandoff` and its matchers (NOVE-24's facts read them); `CONSULENTE_HANDOFF_HREF`, `applyHandoffOf`,
  `handoffProposalOf`, `ApplyHandoff` from `allocationAdviceDocument.ts`; `AccumuloTab`'s `advice` prop and its
  `?da=consulente` branch — the tab only rewrites a `da=consulente` URL to `?tab=accumulo` (an old bookmark);
  `e2e/accumulo.consulente.spec.ts`, `__tests__/consulenteHandoff.test.tsx`; the hand-off cases of `__tests__/allocationAdviceHandoff.test.ts` and
  `allocationAdviceDocument.test.ts`.
- `AssetDialog`'s `prefill` prop is deleted with its cases in `__tests__/assetDialogCreateEmpty.test.tsx:93`
  (its one caller was `ConsulenteHandoff.tsx:85`); the TYPE `AssetPrefill` stays — the operating plan's legend
  carries it.

### 4.7 The daily price update (`lib/helpers/priceUpdater.ts`)

No change of behaviour is needed by K3 (an instrument without a symbol has `autoUpdatePrice: false`); one guard is
added where the tickers are collected (`:161-166`): `.filter((ticker) => ticker.trim() !== '')` — an empty ticker
from any source never reaches Yahoo.

### 4.8 DESIGN.md (The AI-Accent Rule, `DESIGN.md:579`)

The list of never-accented controls loses «Crea un piano di accumulo verso questa allocazione» and gains «Crea il
piano di accumulo» and «Apri in Accumulo»: before/after of the one sentence, quoted in the commit.

## 5. Constraints and traps (AGENTS.md / DESIGN.md, «here it means that»)

- **The click writes money decisions without an editor** (decision 72): here it means the page shows BEFORE the
  click everything the plan will hold that the report did not say — the corrections, the instruments with ticker,
  price and date, the account, what happens to an open plan — and U3 proves a draft with an issue never reaches
  `createDraftPlan`.
- **`validateDraftAgainstAssets` is the editor's gate, not the service's** (`createDraftPlan` and `activatePlan` do
  not call it): `buildAdvicePlan` calls it; `executeAdvicePlan` refuses a `build` whose `issues` are not empty.
- **Two transactions, not one** (`createDraftPlan` takes the lock, `activatePlan` computes): a failure between them
  leaves a DRAFT — which the next press replaces and activates (K6). The lock `accumulationPlanLocks/{ownerUid}` is
  never written by this spec's code.
- **`setSettings` with `targets` uses the no-merge branch** (impostazioni.md): the investment account is saved by a
  SECOND `setSettings` call without `targets` (the merge branch), after the first — never folded into the targets'
  write, which would rebuild the document.
- **The applied targets are not in the React Query cache when the plan is built**: the builder receives
  `buildTargetsFromProposal(proposal)` explicitly; nothing reads `settings.targets` for the reserve or the basis.
- **Choice l (README § 4)**: the model and the plans' weights are read only on the Accumulo tab — here it means
  the Consulente route WRITES the model from the plan's weights without reading it (the editor's checkbox default
  «on when it differs» becomes «always»: a plan made from the Consulente is the new intent).
- **The Consulente route's weight**: `ConsulentePlanTick.tsx` is the only file under
  `components/allocation/consulente/` that may import `advicePlan`, `accumulationPlanUtils`,
  `operatingPlanFacts`; the guard test (`__tests__/allocationAdviceDocument.test.ts:167-176`, the pattern at `:174`) scans every OTHER
  `.tsx` there for those names and asserts `ConsulentePlanTick` is imported only through `lazyComponent()`; the
  executor is an `await import()`.
- **React Compiler**: `buildAdvicePlan` in render is pure; `onBuild` is called from an effect keyed on the
  build's fingerprint (`JSON.stringify` of action, positions, disposals, toCreate), never on the object.
- **No control that spends**: the quote route is free; no model is called by this spec. In E2E the route is
  stubbed with `page.route('**/api/prices/quote*', …)`.
- **Shared account**: every write uses `ownerId`; a co-owner's click creates the owner's plan, as his editor does.
- **Cents and whole shares**: nothing here rounds; the engine does (`activatePlan`).
- **No owner data in a tracked file**; **series labels never enter code**.

## 6. Tests per level (with the mutation that proves each)

| # | Test | Mutation that turns it red |
| --- | --- | --- |
| U1 | `__tests__/advicePlan.test.ts` › `buildAdvicePlan` on an invented portfolio (ETF A 6.000 «buy 60», ETF B 2.000 «hold», fund C «sell 20 quote, month 3», new N1 «buy 40»): positions A 60, B 0, C at 0 with a partial sale, `new:N1` 40; the sale with `monthIndex: 3`; months, inflow, `reviewMonthIndex`; `action: 'create'` | build positions from the stored rows, skipping today's reconcile |
| U2 | same: since the plan was written A was sold (gone) and a new ETF D was bought → A's row dropped with its sentence, D a row at 0 % named in `notes`; the stored corrections come first, none repeated | keep the stored facts |
| U3 | same: a draft made invalid on purpose (a row removed after the reconcile, through the test seam `reconcile` parameter) → `issues` not empty | return `issues: []` |
| U4 | same › `pickFreshQuote`: the first symbol 9 days old, the second 1 day → the second; a USD quote without `currentPriceEur` skipped; none → null; exactly 5 days → accepted | `>=` on the age |
| U5 | same › `newInstrumentFormData`: priced → the symbol, the price, `autoUpdatePrice: true`, `createdEmpty`; unpriced with an ISIN → the ISIN as ticker, price 0, `autoUpdatePrice: false`; no ISIN → the slug, matching `tickerSchema`'s pattern; a bond → K4 | `autoUpdatePrice: true` always |
| U6 | `__tests__/priceUpdater.test.ts` (new; `getMultipleQuotes` and the Admin SDK mocked): an asset with `ticker: ''` is not sent to `getMultipleQuotes`; `__tests__/yahooFinanceService.test.ts` (new; `yahoo-finance2` mocked): `getQuote` returns `quotedAt` | drop the filter |
| U7 | `advicePlan.test.ts`: an open draft → `action: 'replace'`; an active plan at `k` = 4 → `action: 'revise'`, `startMonth` the 4th instalment's month, the sale's month 3 → 6, the review month shifted; a sale that plan already executed → dropped with K8's sentence | leave the months unshifted |
| U8 | `__tests__/advicePlanService.test.ts` (services mocked): `create` → `createAsset` once per missing instrument, `createDraftPlan` with the real ids, `activatePlan`, `saveModelPortfolio` with A 60 / N1 40 / B 0 and `origin: 'manual'`, in this order | activate before creating the instruments |
| U9 | same: `replace` → `updateDraftPlan` + `activatePlan`, never `createDraftPlan`; `revise` → `revisePlan` with `diffRevisionDisposals`' three fields, `reviewMonthIndex`, `advisorNotes`, never `activatePlan` | call `createDraftPlan` on a draft |
| U10 | same: `activatePlan` rejects → `AdvicePlanError` with `step: 'activate'`, `done: ['instruments', 'plan']`; a second run with the instrument already among the assets creates none | create without the re-read |
| U11 | `__tests__/allocationAdviceDocument.test.ts`: the exports removed are gone (a `// @ts-expect-error` import list); `__tests__/accumulationPlanSchema.test.ts`: `advisorNotes` accepted, 41 refused | — |
| U12 | the guard of § 5 (`allocationAdviceDocument.test.ts:167-176`) | import `advicePlan` from `ConsulenteReport.tsx` |
| U13 | `__tests__/accumulationPlanUtils.test.ts` › `resolvePlanReserve` with `sourceIds`: quota 10.000, account X 4.000 (the source), account Y 5.000, fund 3.000 → reserve on X 2.000; without `sourceIds` 7.000, today's figure | ignore `sourceIds` |
| U14 | `__tests__/allocationAdviceNarrative.test.ts`: `describeAdvicePlanSummary`, `describeApplySummary` with the plan, `describeAdvicePlanFailure`, `describeNewInstrument`'s four lines | — |
| R1 | `__tests__/consulentePlanTick.test.tsx` (new, `dom`; hooks mocked): the label by action, the summary, the instruments' lines with ticker · price · date, «Corretto dall'app» | hide the notes |
| R2 | same: no investment account → the select; without a choice the checkbox is disabled; with one `onBuild` carries it and `saveSourceAsSetting` | enable without a choice |
| R3 | same: plans loading / failed, targets unticked, `usable: false` → the four sentences | enable on a failed read |
| R4 | `__tests__/consulenteBookPlan.test.tsx`: the applied body with `planId` (the three sentences, the link) and without (the button) | show the button with a `planId` |
| E1 | `e2e/allocation.consulente.report.spec.ts`: a planted `ready` report with a planted plan (one new instrument, one sale in month 2); the quote route stubbed fresh → the tick, the summary, the line «ticker · prezzo · data»; «Applica alle impostazioni» → «Piano creato»; through firebase-admin: the asset at 0 quotes with the symbol, the plan `active`, `disposals[0].monthIndex` 2, `advisorNotes`, the model document | — |
| E2 | same: the quote stubbed stale on every symbol → the «senza prezzo» line; after the click the asset has `autoUpdatePrice: false` and the plan is active with that position unpriced | — |
| E3 | same: no investment account → the select; after the click `assetAllocationSettings/<uid>.investmentCashAssetId` is the chosen one and the targets written are intact | — |
| E4 | same: a planted draft → the «al posto della bozza» label; after the click ONE plan, active | — |
| E5 | same: a planted active plan (the Accumulo fixture) → «Rivede il piano…»; after the click the plan has a new `revisions` row and the Consulente's positions | — |
| E6 | same: a planted `applied` report with a plan and no `planId` → «Crea il piano di accumulo» → «Piano creato» | — |
| E7 | same: an asset with the new instrument’s ISIN is planted first (as a first press that created it and then failed would leave it) → no line «da creare» for it; after the click ONE asset with that ISIN, and the plan buys it | — |
| E8 | `e2e/accumulo.spec.ts`: `?tab=accumulo&da=consulente` → the URL is cleaned, no dialog | — |

## 7. Guided verification (WORKFLOW.md § 2)

Expected outcome, declared first: on the seed account, with a planted report and a planted operating plan, the
«Applica» page shows the plan's tick with a summary whose first instalment equals the one the Accumulo tab shows
after the click; one press creates the missing instrument and an ACTIVE plan with the Consulente's quotas and the
sale in its month; «Apri in Accumulo» shows «Questo mese» with the notes; with a planted draft the click replaces
it; with a planted active plan it revises it; no model is called and no window opens.

- **A**: `npx tsc --noEmit`, lint, Vitest in three zones, `npx playwright test e2e/allocation.consulente
  e2e/accumulo` in every project.
- **B**: emulators + `emulators:seed` + `dev:emulator`; a scratchpad script (from inside the repo) plants
  `plant('ready')` with an operating plan built by `reconcileOperatingPlan` on the seed portfolio: two buys (one a
  NEW instrument with three invented symbols), one hold, one sale of 5 quotes in month 2, review month 6; the dev
  server's quote route is used for real (Yahoo is free) with one real, liquid, public ETF symbol among the three and
  two invented ones first — the app must skip the two and take the third.
- **C (browser)**: 390, 768×1024, 1024×768, 1440, light and dark: the «Applica» page with the fourth tick (the
  lines wrap at 390), the select «Da quale conto?», the click, «Piano creato» and the link; Accumulo's «Questo
  mese» with «Dal Consulente» and the notes; the calendar.
- **D (data)**: `accumulationPlans/<id>`: `status: 'active'`, positions = the plan's rows with Σ 100,00, the sale
  with `monthIndex: 2`, `reviewMonthIndex: 6`, `advisorNotes`, `liquidity.sourceCashAssetIds` = the one account,
  `installments` whose first two months spend no sale money; `assets/<new>`: `quantity: 0`, `createdEmpty`, the
  third symbol as ticker, a price, `autoUpdatePrice: true`, no `assetTransactions` row; `modelPortfolios/<uid>`
  with the plan's weights; `allocationAdvice/<uid>.applied.planId`; `assetAllocationSettings/<uid>` with the new
  targets AND `investmentCashAssetId`.
- **E (edges)**: every symbol invented → «senza prezzo», the click still creates the plan and «Questo mese» says
  the position has no price; untick «I target» → the tick goes off with its sentence; plant a draft → replace;
  plant the active fixture → revise (the executed instalments keep their figures: compare before and after with the
  script); delete the investment account between the page's load and the click → the click refuses with the
  `source_not_cash`/missing-account sentence and nothing is written; press twice quickly → one plan.
- **F (owner, at «pronto»)**: the mirror (`npm run mirror:seed -- <email>`); a plan built by hand in the script
  (as NOVE-24's F) is planted on his mirrored report; he reads the tick's summary, the instruments' lines and the
  corrections, presses «Applica» on the MIRROR and opens Accumulo. Nothing touches production; no model runs.
  `npm run mirror:remove`.
- **G**: `npm run perf:budget` (`/dashboard/allocation` must not grow: the hand-off leaves it — record the drop;
  the Consulente route's weight before and after in doc/guide/velocita.md § Registro, the lazy chunk named);
  Accumulo's first screen gains the notes only on a plan that has them: `mobile:census` + `mobile:budget` once on
  the fixture without notes (must be unchanged) and once with (record); stop the servers, delete the scripts,
  remove the mirror.

## 8. Putting it into service

One PR to `develop`; no rule, no index, no migration. After the deploy, on the owner's production account: his
report has no operating plan until NOVE-24's «Scrivi il piano operativo» ran (one Opus call, his key); then the
«Applica» page offers «Crea il piano di accumulo» (his document is already applied) — he reads the summary, the
tickers with price and date, the corrections, and decides whether to press: THIS press writes real data (a plan,
possibly instruments at 0 quotes). The plan can be interrupted from Accumulo («Interrompi piano») and the
instruments at 0 quotes deleted from Patrimonio. Then NOVE-22.

## 9. Documentation

- `doc/guide/consulente.md` § «Applica»: the fourth tick, its states, the click's steps and their order, the
  applied body, «Crea il piano di accumulo» on an applied document; § Files: `advicePlan.ts`,
  `advicePlanService.ts`, `ConsulentePlanTick.tsx`; § Per-page blind spots: «a plan failure after the three writes
  leaves the document applied: the button creates the plan later».
- `doc/guide/accumulo.md`: § «Dal Consulente» is REWRITTEN as «Il piano del Consulente» — the plan arrives active
  from the click, its notes (`advisorNotes`), `resolvePlanReserve` with one source; the hand-off's three views, the
  seed and the kept-sale note are deleted from the guide; § Files.
- `doc/guide/patrimonio.md` § Per-page blind spots: «an instrument created by the Consulente's click may have no
  price and a ticker that is its ISIN or a slug: it is completed from its form; it is never auto-updated until it
  has a symbol».
- `doc/guide/server.md` (the quote route): `quotedAt`. `doc/guide/dialog.md`: `AssetDialog` loses `prefill`.
- `AGENTS.md` § 3 Allocazione › Consulente and › Accumulo: one bullet each (the click; no editor on this path).
- `DESIGN.md` § 4.8; `CLAUDE.md` «Latest», the Consulente line of Key Features («…one «Applica» creates the plan
  of accumulation, active») with the hand-off sentence removed; `README.md` (what the user sees) and
  `Draft Release Temp.md`: «un solo Applica», in the user's words.
- `doc/nove/README.md`: § 6 the row; § 7 the hand-off's contract marked removed.

## 10. Declared out of scope

- **Editing the plan before it is created** (an editor between the report and the plan): none, declared — after
  the click the plan is revised from Accumulo («Rivedi il piano»; NOVE-26 makes that a guided path).
- **Completing a government bond's terms at the click** (K4): none, declared — the asset form owns them.
- **Searching a symbol by ISIN on the app's side**: none, declared (measured: one listing, a validation throw).
- **Undoing the click as one action**: none, declared — «Interrompi piano» and the asset's deletion exist.
- **Groups of equivalent instruments in a plan made by the click**: none, declared — the Consulente names one
  instrument per row.
- **The Assistente creating a plan**: none, declared.
- **A plan by hand** → NOVE-22, which reuses `resolvePlanReserve`'s `sourceIds`, `newInstrumentFormData`'s rules for
  nothing (the path adds instruments through the asset form) and this spec's create → activate → model sequence,
  extracted as `createAndActivatePlan` (README § 7).

## 11. The prompt that implements it

```
Ciao, in questa sessione vorrei implementare la spec doc/nove/NOVE-25-un-solo-applica.md

Contesto, prima di toccare qualsiasi file (le regole del repo cambiano il modo di lavorare):
- Leggi WORKFLOW.md (regole di sessione e di collaudo; l'ultima sezione dice come si
  applicano in questo repo)
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- CLAUDE.md (l'indice: che cos'è e dove sta ogni cosa, lo stato corrente) è già nel
  contesto: usalo per trovare la guida giusta
- Leggi la spec doc/nove/NOVE-25-un-solo-applica.md e l'indice della serie
  doc/nove/README.md (§ 3 decisioni, § 4 scelte adottate, § 7 contratti condivisi, § 8 regole)
- Leggi doc/guide/consulente.md, doc/guide/accumulo.md, doc/guide/ottimizzatore.md,
  doc/guide/patrimonio.md, doc/guide/impostazioni.md, doc/guide/server.md, doc/guide/velocita.md,
  doc/guide/prima-schermata.md, doc/guide/e2e-emulatori.md e doc/guide/e2e-playwright.md PRIMA
  di scrivere codice in quei domini
- Leggi DESIGN.md (The AI-Accent Rule, The Modal-Is-A-Tile Rule, The Absence-Has-Three-Names
  Rule) e PRODUCT.md
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

Implementa la spec così com'è scritta, nell'ordine: il documento del piano (§ 4.1) e la
quotazione con la sua data (§ 4.2); il costruttore puro (§ 4.3) con U1-U7 e U13; l'esecutore
(§ 4.4) con U8-U10; la pagina «Applica» e il componente caricato a richiesta (§ 4.5); le
note in «Questo mese» e le rimozioni (§ 4.6); la guardia sull'aggiornamento prezzi (§ 4.7);
la frase di DESIGN.md (§ 4.8). I test PRIMA del codice, ciascuno visto rosso con la sua
mutazione; cifre inventate e tonde. Nessun controllo che spende: nessuna corsa del
Consulente; il documento e il piano operativo si piantano; la route dei prezzi negli E2E è
finta. Fermati e chiedimi se: il clic può scrivere un piano con un problema che
validateDraftAgainstAssets segnala; una seconda pressione crea un secondo strumento o un
secondo piano; il peso della route del Consulente al primo caricamento cresce di più di
3 KB gz; perf:budget o mobile:budget diventano rossi oltre la regola della § 8 dell'indice;
una rimozione della § 4.6 ha un chiamante che la spec non nomina.
Collaudo: § 7, la F sul mirror al mio «pronto» (premo io «Applica» sul mirror); il
controllo in produzione lo faccio io dopo il deploy (§ 8). Un branch, un commit, solo dopo
il mio OK con il riassunto del diff. SESSION_NOTES.md non si committa.
```

Model: **Opus 5.5**, effort **medium** — an L spec with shared contracts (the plan document, `buildAdvicePlan`,
`executeAdvicePlan`, `resolvePlanReserve`, the quote route) across the Consulente route, the Accumulo tab, the asset
service and the price update, and a removal with many callers. Estimated size: 1 session, ~6 h; ~300 lines pure,
~150 of service, ~250 across components, ~600 of tests, eight E2E tests.
