# Allocazione › Consulente, il piano operativo

> **When to open this guide** — whoever touches the Consulente's fifth stage or what follows «Applica»:
> `lib/utils/operatingPlan{,Facts,Schema}.ts`, `runPlan` in `lib/server/allocationAdvice/run.ts`,
> `formatOperatingPlanFacts` / `PLAN_CONTRACT` / `buildPlanPrompt` in `lib/server/allocationAdvice/prompts.ts`,
> `components/allocation/consulente/useConsulentePlan.ts`, the page `piano` and «Applica»'s plan row in
> `ConsulenteBookPages.tsx`, the plan of accumulation the click creates (`lib/utils/advicePlan.ts`,
> `lib/services/advicePlanService.ts`, `ConsulentePlanTick.tsx`, 2026-11-20). Born on 2026-11-19 beside `doc/guide/consulente.md` (504 lines that day, past
> what a guide holds): the run, the book and the path stay there; the operating plan and «Applica» are here. In
> `AGENTS.md` the stub with the essentials stays.

## Files

- `lib/utils/operatingPlan.ts` — the types (`OperatingPlan`, `OperatingPlanRow`, `OperatingPlanInstrument`,
  `OperatingPlanFacts`, `RawOperatingPlan`), `operatingPlanOf` (the plan of THIS report or null), the sentences
  (`OPERATING_PLAN_COPY`) and `reconcileOperatingPlan`. Zod-free and free of the hand-off and the optimizer: the
  Consulente's route imports it.
- `lib/utils/operatingPlanFacts.ts` — `buildOperatingPlanFacts`: the keys and what the app knows of each instrument
  (quantity, unit price, value, «da tenere», the tax per euro, the limits of «Criteri del modello»);
  `refreshOperatingPlanFacts` (the stored plan's facts on TODAY's portfolio, the click's) and `findAdviceInstrument`
  (a `new` instrument among the assets, by ISIN then name). On the route only `ConsulentePlanTick` imports it.
- `lib/utils/advicePlan.ts` (2026-11-20) — `buildAdvicePlan` (pure: the draft, the instruments to create, the
  notes, the issues, `blocked`), `pickFreshQuote`, `resolveNewInstrumentPricing`, `newInstrumentFormData`,
  `fallbackTicker`, `ADVICE_PLAN_COPY`.
- `lib/utils/advicePlanNarrative.ts` (2026-11-20) — `describeAdvicePlanSummary` and `describeNewInstrument`, the tick's
  sentences: apart from `allocationAdviceNarrative.ts`, which Allocazione's page loads whole on its first screen, so
  that the swap's and the bond's sentences ride the lazy tick only (perf:budget, 2026-11-20).
- `lib/services/advicePlanService.ts` — `executeAdvicePlan` and `AdvicePlanError { step, done }`, imported by the
  click with `await import()`; `createAndActivatePlan` and `PlanWriteError` live in
  `lib/services/accumulationPlanService.ts`.
- `components/allocation/consulente/ConsulentePlanTick.tsx` — the fourth tick (and the applied page's line), loaded
  through `lazyComponent()`; `lib/hooks/useAdviceQuotes.ts` (`queryKeys.adviceQuotes`, not persisted);
  `lib/utils/accumuloCopy.ts` (import-free: «Apri Accumulo», `ACCUMULO_HREF`, `ACCUMULO_PLAN_NOTHING_TO_REVISE`,
  `describeModelNotUpdated`, `ADVICE_SOURCE_GONE`).
- `resolveEffectiveTargets` in `lib/services/effectiveTargets.ts` (owner, 2026-11-20: not in the Firebase-free
  `allocationUtils.ts`, since the goal math pulls the client SDK; nor in `assetAllocationService.ts`, which every page
  loads: `goalMath` there cost the shared code 0,9 KB gz, perf:budget 2026-11-20) — the targets
  Allocazione measures, goal-driven ones included; the page and the click call it.
- `lib/utils/operatingPlanSchema.ts` — `operatingPlanAnswerSchema` (zod, loose bounds) and
  `parseOperatingPlanAnswer`.
- `lib/server/allocationAdvice/run.ts` — `runPlan`, the dispatch of `stage === 'plan'`, the rethrow in the catch.
- `lib/server/allocationAdvice/prompts.ts` — `formatOperatingPlanFacts`, `PLAN_CONTRACT`, `buildPlanPrompt`.
- `lib/server/allocationAdvice/store.ts` — `patchAllocationAdviceAdmin(…, { keepUpdatedAt: true })`.
- `components/allocation/consulente/useConsulentePlan.ts` — «Scrivi il piano operativo»; `requestPlanQuietly` in
  `useConsulenteRun.ts` (the run's and the revision's plan request, which never throws).
- `components/allocation/consulente/ConsulenteBookPages.tsx` — `planPieces` (the page), `PlanRow` and its block on
  «Applica»; `ConsulenteReport.tsx` builds the row.
- Tests: `__tests__/operatingPlan.test.ts`, `operatingPlanFacts.test.ts`, `operatingPlanSchema.test.ts`,
  `allocationAdviceRun.test.ts` (§ the operating plan stage), `useConsulentePlan.test.tsx`,
  `consulenteBookPlan.test.tsx`; the click: `advicePlan.test.ts`, `advicePlanService.test.ts`,
  `accumulationPlanService.test.ts` (§ createAndActivatePlan), `effectiveTargets.test.ts`,
  `consulentePlanTick.test.tsx`, `useAdviceQuotes.test.tsx`, `advicePlanNarrative.test.ts`, `priceUpdater.test.ts` (no
  empty ticker to Yahoo), `yahooFinanceService.test.ts` (`quotedAt`), `allocationAdviceDocument.test.ts` (the route's
  import guard); E2E in `e2e/allocation.consulente{,.report,.plan}.spec.ts`, the fake stage in
  `e2e/consulenteInterview.ts` writing through `e2e/consulenteReport.ts`.
- **Suites to run after a change here**: `operatingPlan`, `operatingPlanFacts`, `operatingPlanSchema`,
  `allocationAdviceRun`, `allocationAdvicePrompts`, `allocationAdviceProposal`, `allocationAdviceDocument`,
  `allocationAdviceBook`, `allocationAdviceNarrative`, `advicePlanNarrative`, `allocationAdviceRoutes`, `accumulationPlanUtils`
  (`resolvePlanReserve`), `advicePlan`, `advicePlanService`, `accumulationPlanService`, `accumulationPlanSchema`,
  `effectiveTargets`, `priceUpdater`, `yahooFinanceService` and the Testing Library suites `useConsulentePlan`,
  `useConsulenteRun`, `consulenteBookPlan`, `consulenteBook`, `consulenteRun`, `consulenteRevisionTile`,
  `consulentePlanTick`, `useAdviceQuotes` · **Browser** `e2e/allocation.consulente.spec.ts`
  (the run's five rows, the plan the fake wrote) and `e2e/allocation.consulente.report.spec.ts` (the row, the
  failed plan, the page, «Chiedi una modifica» rewriting the plan), `e2e/allocation.consulente.plan.spec.ts` (the
  click: the tick, the instrument at 0 quotes, ONE plan active, the model, a draft replaced, an active plan revised,
  «Crea il piano di accumulo», the swap; the quote route faked); the run route always faked.

## The stage

- **A fifth stage, «Scrivo il piano operativo»** (owner, 2026-11-19: a NEW stage after the review, its figures in
  ONE structured object): after the review, Opus 5.5 at
  effort `medium`, 16 000 output tokens, a structured output; «di solito ~1 min». It translates the finished report
  into ONE object: the monthly inflow, the months, one row per instrument (buy at a quota, stop buying, sell how many
  shares in which month), a review month, where it departs from the report. The run's fourth stage on the server
  (`runAllocationAdvice`), the client's fifth request (`ALLOCATION_ADVICE_RUN_STAGES`).
- **Its own status** (2026-11-19): the plan lives in `document.operatingPlan` = `{ status: 'running' | 'ready' | 'failed',
  plan, error, model, startedAt, finishedAt, reportFinishedAt }`. The stage never calls `enterStage` and never
  writes the document's `status`, `stage` or `error`; its catch in `runAllocationAdviceStage` rethrows BEFORE the
  document is touched. **`updatedAt` is the report's clock**: the plan's three patches pass
  `keepUpdatedAt: true`, because `pageShowsReport` and `reopenStoredDraft` compare it — a plan landing after «Rifai
  il percorso» must neither bring the hidden document back nor drop an interview in progress.
- **Only on a finished report**: `status` `ready` or `applied`, with the report's proposal and the
  instruments; otherwise a non-retryable error and nothing patched. A document a revision left `failed` is refused:
  its revision is what the user retries.
- **The plan never fails the run**: on the client the plan's request goes through `requestPlanQuietly`; an error
  event, a 429 of the hourly limit (the stage counts one slot of the twelve) or a dropped connection ends the run
  `done` on the report. A failed plan is stored `failed` with its sentence and the report stays readable and
  applicable.
- **The inputs**: the answers, the report with its `allocation-proposal` block, the instruments with their block, the
  DATI PER IL PIANO OPERATIVO block, the CASHFLOW 12 MESI block, the PIANO DI ACCUMULO block. The reads (assets,
  settings through `fetchSettings` — the eighth place of the settings, doc/guide/impostazioni.md —, cashflow,
  accumulation plan) happen BEFORE the `running` patch, and so do the facts, the investment account and the reserve
  computed from them (corrected 2026-11-19: they ran after it, so a failure there wrote a failed plan) — a failed
  read or computation patches nothing. `system` is
  `CONSULENTE_CORE + PLAN_CONTRACT`, identical for every user.
- **The DATI PER IL PIANO OPERATIVO block** (`formatOperatingPlanFacts`): the plan's first month (the Italian month
  after today), the investment account and its balance (or the liquid accounts' sum), the reserve the click will use
  (`resolvePlanReserve` on the proposal's targets, its `sourceIds` the investment account when set) and what is above
  it or missing; then the instruments by KEY (the model never spells an instrument) — **S** held and buyable (value above 0, created empty, or matched
  by the hand-off; class, then name, then id), **N** new from the report (with the candidates' Yahoo symbols), **M**
  money-market funds (sold, never bought) — each with quantity, unit price, value and the estimated tax of selling it
  all (a plan in shares cannot be written without them: «tasse stimate €…», «esente», «tasse non stimabili (manca l'aliquota | il costo fiscale)»), «DA TENERE»
  and the limits of «Criteri del modello» (the limits only, never the model). «0 quote, non posseduto» at zero shares
  (owner, 2026-11-19: an instrument sold down to 0 and chosen again was bought once, so not «mai comprato»). Never an
  id, a rate or a held ISIN.
- **The contract** (`PLAN_CONTRACT`): one row per S key, N only when bought, M only when sold; the «buy» quotas sum to
  100 (the instrument's weight among what the plan buys — the unit of the per-instrument limits, so they apply as
  they are), «hold» and «sell» carry 0; the inflow within the
  savings median (or said in `departures`); the months those needed to cover the gap with that inflow (owner, 2026-11-19:
  never asked to the user, said in `summary`); never sell a «DA TENERE»; a later sale refills the reserve first
  (owner, 2026-11-19); only the blocks' numbers.
- **The reconcile** (`reconcileOperatingPlan`, ONE pure function, run here and again at the click of «Applica» on
  the live portfolio, 2026-11-20), fifteen rules in order, each correction ONE sentence in `corrections`: months clamped to 1..60;
  a negative inflow to 0 (silent); an unknown or repeated key dropped (one sentence); a new instrument held or sold
  dropped, a money-market fund bought turned into a hold; a sale of a «da tenere» removed (owner, 2026-11-19: the interview's «da tenere» wins, «smetti di comprare»
  stays allowed); the quantity
  floored, a sale of 0 removed, more than held = every share (said); a sale carries 0; the sale's month clamped; a
  held instrument without a row = a hold at 0, named (owner, 2026-11-19); negative quotas to 0, a buy at 0 to hold, a hold
  above 0 to buy; the buys scaled to 100 (said past 0,5); the limits applied AFTER the scaling, redistributed within
  the others' limits until stable — limits that cannot reach 100 make the plan `usable: false`; two decimals summing
  to 100,00; a review month outside the plan dropped; no buy above 0 → `usable: false`. Then each sale's proceeds and
  tax at today's price. Idempotent. The sentences agree in number (2026-11-19: «il piano dura 1 mese», «{nome}: il
  piano non lo cita. Resta dov'è…» for one name).
- **The swap** (owner, 2026-11-20): a sell row may carry `reinvestInto` (the ref of a buy row): its whole proceeds
  buy that instrument in the sale's month, never through the reserve nor the rates (doc/guide/accumulo.md § The
  swap). The contract writes it only when the report says to sell one instrument to buy another with that money, the
  bought row's quota counting only the rates' money (0 when the swap alone buys it). The reconcile keeps it only
  toward a buy row other than the sold one (else dropped, said: «…il ricavato entra nel piano come le altre
  vendite.»), drops it from any row that is no sale, and keeps a buy row at 0 that a swap funds (never turned into a
  hold nor removed). The page draws «con il ricavato compra X» on the sale and «con lo scambio» for a quota of 0.
- **Yahoo symbols** (owner, 2026-11-19): the instruments stage writes up to three per candidate (`yahooSymbols`, the user's
  exchange first); an older block without them still parses. The tick of «Applica» prices a new instrument with them
  (2026-11-20, § The book and «Applica»).

## The book and «Applica»

- **The page «Il piano operativo»** (`piano`, owner, 2026-11-19): after «Cosa fare adesso», before «Rischi e revisione»,
  only when `operatingPlanOf(document)` is not null — a plan `ready`, `usable`, written on THIS report
  (`reportFinishedAt` equal to `report.finishedAt`). A generated page (The AI-Accent Rule). The aside «{n} mesi ·
  {€} al mese», the summary as the reading, then three groups with the sub-eyebrow, each absent when empty —
  «Compra» (name, the quota in mono), «Smetti di comprare», «Vendi» (shares or «tutte le quote» · «{m}º mese» ·
  «circa {€}» · the tax or why it is not estimable) —, the taxes' total, «Da riguardare al {m}º mese», «Dove si
  discosta dal report», «Corretto dall'app»; the footnote says the exact instalments are the app's at creation. It
  draws ONLY from the stored object: no asset is read.
- **The row on «Applica»** (owner, 2026-11-19: a report without a plan stays applicable) while there is no plan: «Il piano operativo non c'è ancora.», «Scrivo il
  piano operativo…», the failure's sentence, or the last correction of an unusable plan; the button «Scrivi il piano
  operativo» (outline, an AI control) runs the plan stage ALONE (`useConsulentePlan`: one request however many
  clicks), hidden while running, disabled in demo and during a revision. It shows on a `ready` and on an `applied`
  document alike. A stored `running` older than `RUN_STALE_AFTER_MS` (from the page's opening) offers the button
  again.
- **«Applica» shows the plans BEFORE writing, one tick per item** (owner, 2026-10-20): the targets
  (`buildTargetsFromProposal` → `setSettings({ targets })`, which REPLACES the targets document as Impostazioni does;
  a class absent from the proposal disappears from the targets), the roles (`updateAssetAllocationRole`, an `updateDoc`
  on the field alone: `updateAsset` and `updateAssetMetadata` delete `taxRate`/`displayTicker` absent from the
  partial), the goals (`planGoalDocument` → `saveGoalData`, the whole document as FIRE › Obiettivi does: existing ones
  updated by id, new ones with a colour, those marked «da eliminare» in the answers deleted, the quotas of the touched
  goals only rewritten in percent; an instrument's quotas beyond 100% are REDUCED within the margin the untouched
  goals leave, and the plan says so, never silently). Then `POST /api/allocation-advice/applied` records what was
  written and the document moves to `applied`; every key of the readers is invalidated (settings, assets, overview,
  goals, allocationAdvice, and since 2026-11-20 the plans and the model).
- **After «Applica», a plan of accumulation: ONE click** (2026-11-20; it replaced the link to an editor of
  2026-11-12). With a usable operating plan of this report, «Applica» has a FOURTH tick, on by default
  (`ConsulentePlanTick`, loaded on demand only on that page): «Il piano di accumulo: {summary}» — «, al posto
  della bozza che hai in Accumulo» on an open draft, «Rivede il piano di accumulo attivo» on an active plan. The
  summary (`describeAdvicePlanSummary`): months, first month, the inflow, the first instalment that buys (with its
  month when it is not the first, and «dopo N mesi che ricostituiscono la riserva» when the refill is why, 2026-11-20), the
  instruments to create, the sales with the TOTAL of their estimated taxes. Under it: «Da quale conto?» (a select
  of the accounts, only without «Conto per gli investimenti»; the same click saves the choice, with a SECOND
  `setSettings` without targets — the merge branch), one line per instrument to create (`describeNewInstrument`:
  «nome · simbolo · prezzo · data», «senza prezzo…», «senza ticker né prezzo…», a government bond's), «Corretto
  dall'app» with the notes. **Its states** — the tick off and disabled, the sentence in the summary's place:
  «Preparo il piano…» (settings, plans or quotes loading, or plans only from the restored cache —
  `isFetchedAfterMount`), the plans not read, no account among the assets, «I target» unticked («Il piano va
  verso i nuovi target: applicali insieme.»), `blocked` (the build's sentence; an active plan with no intact
  instalment adds «Apri Accumulo»); no account chosen yet: disabled, no sentence.
- **What it is built on** (`buildAdvicePlan`, pure, in render): the stored plan refreshed on TODAY's portfolio
  (`refreshOperatingPlanFacts`: a `new` instrument found by ISIN or name is held; an instrument bought since gets
  a row), a sale already executed by the active plan kept as a position at 0, then the reconcile again; the
  portfolio AS THE CLICK LEAVES IT — the ticked role changes applied — and the targets it goes toward
  (`resolveEffectiveTargets` on the proposal's targets and the goals the click writes; on an applied document the
  live ones). A revision keeps the active plan's numbering: the months from its first intact instalment, at most
  60 in all (said), each sale's month shifted. `validateDraftAgainstAssets` runs here (`issues` → `blocked`); the
  quotes come from `useAdviceQuotes` (one `/api/prices/quote` per symbol, the first with a last trade ≤ 5 days).
- **The quotas are shares of the plan's money** (owner, 2026-11-20, found on the mirror tour: a 60/40 between a small
  and a large holding went almost whole to the small one). The engine reads a position's weight as its share of the
  plan's portfolio at the end and splits the money `L` by what each lacks (`computeTotalPurchases`), so the build
  turns the quotas into weights (`weightsFromQuotas`, `lib/utils/advicePlan.ts`): a priced instrument to buy weighs
  (today's value + its quota of `L`) ÷ (today's value of the plan + `L`), one to hold or partly sold weighs what it
  holds (rounded down: it lacks nothing and receives nothing). One to buy with no price keeps the weight it would
  reach, taken from the ones to hold first, then from the priced ones, so the plan buys it once it has a price; the
  priced quotas are taken over their own sum. `L` comes from the liquidity alone (a first preview), the weights then
  feed the final preview. The model written from the plan is therefore the portfolio at the end of the plan. The
  monthly recalibration and «Rivedi il piano» aim at these weights; prices that move a lot shift the split a little.
- **The swap at the click**: `buildAdvicePlan` carries `reinvestInto` onto `PlanDisposal.reinvestAssetId`
  (`new:<ref>` for a new instrument, mapped to the created id by `withRealIds`); a target with no price adds the note
  «X non ha ancora un prezzo: il ricavato di Y entra nel piano come le altre vendite…». The summary never counts the
  swap as the first rata and names it: «, scambio a dicembre 2026: vendi X e Y e compri Z».
- **A new government bond is priced at the click** (owner, 2026-11-20, so the swap can buy it): `useAdviceQuotes` asks
  Borsa Italiana by ISIN (`/api/prices/bond-quote`) beside the symbols; `resolveNewInstrumentPricing(…, { pricePct,
  coefficient })` → `{ kind: 'bond', pricePct, indexed }`, and `bondUnitPriceEur` (`lib/utils/bondPricing.ts`) makes it
  euro per 1 € of nominal: the quote ÷ 100, × the indexation coefficient for a BTP€i (`isEuroIndexedBondName`, never a
  BTP Italia). A BTP€i without the coefficient has no price: the page asks it in a field under the instrument («Il
  coefficiente di oggi, dal sito del MEF o dal tuo broker.»). The coefficient is NOT saved on the asset (its
  `bondDetails` need coupon, issue and maturity, which the click does not know): the daily update prices it without
  it until the bond is completed in Patrimonio, as the line says.
- **A sub-target naming two instruments** (owner, 2026-11-20, the mirror's «BTP A (IT…) + BTP€i B (IT…, da
  comprare sul MOT)» became ONE new ETF named after the whole text): `planConsulenteHandoff`
  splits it on « + » and «;», each part its own instrument, and reads an ISIN followed by a note in the parentheses.
- **The click's order** (`executeAdvicePlan`, not atomic, each step awaited): targets, roles, goals as before; then
  the assets RE-READ (the account gone → nothing of the plan written, `ADVICE_SOURCE_GONE`); the account as a
  setting; the instruments (each matched on the re-read first, so a second press creates none, at 0 quotes,
  `createdEmpty`, priced; a government bond with its ISIN `autoUpdatePrice: true`; else `autoUpdatePrice: false`); `createAndActivatePlan` (validated again on the re-read
  assets, the draft written or the open draft replaced whole — `updateDraftPlan` — then activated, then the model
  from the plan's weights, always: a plan from the Consulente is the new intent) or, on an active plan,
  `revisePlan` then the model; last the «applied» record with `planId` and `planAction` (the route keeps the
  first `applied.at`). A step that fails names itself and what it wrote (`describeAdvicePlanFailure`); the
  settings stay applied.
- **The applied page**: with `applied.planId` → «Piano creato.» / «Bozza sostituita e piano attivato.» / «Piano
  rivisto.», `describeModelNotUpdated` when this press could not write the model, and «Apri Accumulo» (outline);
  with the targets written and no `planId` → the failure of this press, the tick as a line and «Crea il piano di
  accumulo» (primary, disabled without a build and while it runs), which runs the plan alone and records it with
  the counts already stored; else the operating plan's row. «Crea il piano di accumulo» and «Apri Accumulo» ask no
  model: never accented (The AI-Accent Rule). **The route stays light**: only `ConsulentePlanTick.tsx` may import
  `advicePlan`, `accumulationPlanUtils`, `operatingPlanFacts` or `accumulationNarrative`; the executor only through
  `import()`; the tick only through `lazyComponent()` (a test reads the sources).
- **«Chiedi una modifica» = review + plan**: `runRevise` drops the old plan with the old report (`operatingPlan:
  null`), then `useConsulenteRevision` asks the plan; whatever the plan's outcome the revision ends and the page
  shows the new report (the row tells a failed plan).

## Per-page blind spots

- **A plan stage that fails leaves the report `ready`** (by design, 2026-11-19): the document's status is the report's; the
  failure lives on `operatingPlan.status` and on «Applica»'s row only.
- **A plan started in another tab reads «Scrivo il piano operativo…» until the document is read again** (2026-11-19):
  no polling, declared; the stale window then offers the button.
- **A stored plan of another report is no plan**: after a revision the old `reportFinishedAt` no longer matches and
  the row comes back, even before `runRevise`'s `operatingPlan: null` is read.
- **A plan at 0 € a month is still `usable`**: whether there is money to invest is for the click that creates the
  plan of accumulation to check (`blocked`: «niente da investire»), not the reconcile. Two sentences (owner,
  2026-11-20, found at the click's retirement): no money above the reserve and no inflow nor sale → «…non ci sono
  versamenti né vendite»; inflows or sales that only refill the reserve → «…versamenti e vendite ricostituiscono solo
  la riserva» (`ADVICE_PLAN_COPY.onlyReserve`, `advicePlan.test.ts`).
- **A plan failure after the three writes leaves the document applied** (2026-11-20, by design): targets, roles and
  goals are written and recorded; the applied page's «Crea il piano di accumulo» creates the plan later.
- **A model not written is said once, on the press that left it** (2026-11-20): the sentence is not stored; after a
  reload Accumulo's «superato» verdict tells it.
- **A `markApplied` that fails after the plan was created** (declared): «Applica» stays, and pressing again revises the
  plan just created with the same figures — one more `revisions` row.
- **Two tabs pressing at the same instant** (declared): the same instrument can be created twice; the plans' lock
  keeps the plan single, the duplicate is deleted from Patrimonio.
- **The failure's sentence reads «ad attivare»** (2026-11-20): the euphonic d before a vowel; the other steps «a».
- **What the plan stage does not do** (declared 2026-11-19): it prices no new instrument (the quotas need no price),
  caps no tax, writes no phases with different quotas; the strategy and the review never read its facts block (one
  stage owns the figures); the Assistente does not read the operating plan; a document a revision left `failed` is
  refused (its revision is what the user retries).
- **The E2E never run the stage**: the fake route writes the plan on the emulator BEFORE it answers
  (`writeOperatingPlan`, a plan built by `reconcileOperatingPlan`), and a fake revise writes a new report instant and
  drops the plan (`writeRevisedReport`); the real stage is checked once, in production, by the owner.
- **The real stage runs on the emulator without spending** (2026-11-19): a throwaway script sets
  `ANTHROPIC_BASE_URL` to a local HTTP server that records the request and answers a Messages SSE stream (`message_start`,
  one text block, `message_delta` with `end_turn`, `message_stop`) carrying a hand-written plan; it imports
  `runAllocationAdviceStage` under `npx tsx --conditions=react-server` (`server-only`) with the `dev:emulator` env
  (the client config is pulled in), so facts, prompt, parse, reconcile and the three patches run as in production.
  The way to read the prompt of a user and to check `status`/`updatedAt` untouched (the tour of 2026-11-19).
- **The block prints every name trimmed and never «€-0»** (2026-11-19, found on the mirror): a name stored with a
  leading space, a reserve of a float's −0 (`signDisplay: 'negative'`); held by `allocationAdvicePrompts.test.ts`.
