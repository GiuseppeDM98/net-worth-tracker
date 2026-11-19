# Allocazione › Consulente, il piano operativo

> **When to open this guide** — whoever touches the Consulente's fifth stage or what follows «Applica»:
> `lib/utils/operatingPlan{,Facts,Schema}.ts`, `runPlan` in `lib/server/allocationAdvice/run.ts`,
> `formatOperatingPlanFacts` / `PLAN_CONTRACT` / `buildPlanPrompt` in `lib/server/allocationAdvice/prompts.ts`,
> `components/allocation/consulente/useConsulentePlan.ts`, the page `piano` and «Applica»'s plan row in
> `ConsulenteBookPages.tsx`. Born on 2026-11-19 (NOVE-24) beside `doc/guide/consulente.md` (504 lines that day, past
> what a guide holds): the run, the book and the path stay there; the operating plan and «Applica» are here. In
> `AGENTS.md` the stub with the essentials stays.

## Files

- `lib/utils/operatingPlan.ts` — the types (`OperatingPlan`, `OperatingPlanRow`, `OperatingPlanInstrument`,
  `OperatingPlanFacts`, `RawOperatingPlan`), `operatingPlanOf` (the plan of THIS report or null), the sentences
  (`OPERATING_PLAN_COPY`) and `reconcileOperatingPlan`. Zod-free and free of the hand-off and the optimizer: the
  Consulente's route imports it.
- `lib/utils/operatingPlanFacts.ts` — `buildOperatingPlanFacts`: the keys and what the app knows of each instrument
  (quantity, unit price, value, «da tenere», the tax per euro, the limits of «Criteri del modello»). Server only in
  practice: no component of the route imports it.
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
  `consulenteBookPlan.test.tsx`; E2E in `e2e/allocation.consulente{,.report}.spec.ts`, the fake stage in
  `e2e/consulenteInterview.ts` writing through `e2e/consulenteReport.ts`.

## The stage

- **A fifth stage, «Scrivo il piano operativo»** (owner, decision 70, 2026-11-19): after the review, Opus 5.5 at
  effort `medium`, 16 000 output tokens, a structured output; «di solito ~1 min». It translates the finished report
  into ONE object: the monthly inflow, the months, one row per instrument (buy at a quota, stop buying, sell how many
  shares in which month), a review month, where it departs from the report. The run's fourth stage on the server
  (`runAllocationAdvice`), the client's fifth request (`ALLOCATION_ADVICE_RUN_STAGES`).
- **Its own status** (P1): the plan lives in `document.operatingPlan` = `{ status: 'running' | 'ready' | 'failed',
  plan, error, model, startedAt, finishedAt, reportFinishedAt }`. The stage never calls `enterStage` and never
  writes the document's `status`, `stage` or `error`; its catch in `runAllocationAdviceStage` rethrows BEFORE the
  document is touched. **`updatedAt` is the report's clock** (P10): the plan's three patches pass
  `keepUpdatedAt: true`, because `pageShowsReport` and `reopenStoredDraft` compare it — a plan landing after «Rifai
  il percorso» must neither bring the hidden document back nor drop an interview in progress.
- **Only on a finished report** (P11): `status` `ready` or `applied`, with the report's proposal and the
  instruments; otherwise a non-retryable error and nothing patched. A document a revision left `failed` is refused:
  its revision is what the user retries.
- **The plan never fails the run**: on the client the plan's request goes through `requestPlanQuietly`; an error
  event, a 429 of the hourly limit (the stage counts one slot of the twelve, P5) or a dropped connection ends the run
  `done` on the report. A failed plan is stored `failed` with its sentence and the report stays readable and
  applicable.
- **The inputs**: the answers, the report with its `allocation-proposal` block, the instruments with their block, the
  DATI PER IL PIANO OPERATIVO block, the CASHFLOW 12 MESI block, the PIANO DI ACCUMULO block. The reads (assets,
  settings through `fetchSettings` — the eighth place of the settings, doc/guide/impostazioni.md —, cashflow,
  accumulation plan) happen BEFORE the `running` patch, so a failed read patches nothing. `system` is
  `CONSULENTE_CORE + PLAN_CONTRACT`, identical for every user.
- **The DATI PER IL PIANO OPERATIVO block** (`formatOperatingPlanFacts`): the plan's first month (the Italian month
  after today), the investment account and its balance (or the liquid accounts' sum), the reserve the click will use
  (`resolvePlanReserve` on the proposal's targets, its `sourceIds` the investment account when set) and what is above
  it or missing; then the instruments by KEY (P2) — **S** held and buyable (value above 0, created empty, or matched
  by the hand-off; class, then name, then id), **N** new from the report (with the candidates' Yahoo symbols), **M**
  money-market funds (sold, never bought) — each with quantity, unit price, value and the estimated tax of selling it
  all (P4: «tasse stimate €…», «esente», «tasse non stimabili (manca l'aliquota | il costo fiscale)»), «DA TENERE»
  and the limits of «Criteri del modello» (P9: the limits only). «0 quote, non posseduto» at zero shares. Never an
  id, a rate or a held ISIN.
- **The contract** (`PLAN_CONTRACT`): one row per S key, N only when bought, M only when sold; the «buy» quotas sum to
  100 (the instrument's weight among what the plan buys, P3), «hold» and «sell» carry 0; the inflow within the
  savings median (or said in `departures`); the months those needed to cover the gap with that inflow (decision 99,
  said in `summary`); never sell a «DA TENERE»; a later sale refills the reserve first (decision 93); only the
  blocks' numbers.
- **The reconcile** (`reconcileOperatingPlan`, ONE pure function run here and, in NOVE-25, at the click on the live
  portfolio, P7), fifteen rules in order, each correction ONE sentence in `corrections`: months clamped to 1..60;
  a negative inflow to 0 (silent); an unknown or repeated key dropped (one sentence); a new instrument held or sold
  dropped, a money-market fund bought turned into a hold; a sale of a «da tenere» removed (decision 78); the quantity
  floored, a sale of 0 removed, more than held = every share (said); a sale carries 0; the sale's month clamped; a
  held instrument without a row = a hold at 0, named (decision 82); negative quotas to 0, a buy at 0 to hold, a hold
  above 0 to buy; the buys scaled to 100 (said past 0,5); the limits applied AFTER the scaling, redistributed within
  the others' limits until stable — limits that cannot reach 100 make the plan `usable: false`; two decimals summing
  to 100,00; a review month outside the plan dropped; no buy above 0 → `usable: false`. Then each sale's proceeds and
  tax at today's price. Idempotent.
- **Yahoo symbols** (decision 74): the instruments stage writes up to three per candidate (`yahooSymbols`, the user's
  exchange first); an older block without them still parses. NOVE-25 prices with them at the click.

## The book and «Applica»

- **The page «Il piano operativo»** (`piano`, decision 84): after «Cosa fare adesso», before «Rischi e revisione»,
  only when `operatingPlanOf(document)` is not null — a plan `ready`, `usable`, written on THIS report
  (`reportFinishedAt` equal to `report.finishedAt`). A generated page (The AI-Accent Rule). The aside «{n} mesi ·
  {€} al mese», the summary as the reading, then three groups with the sub-eyebrow, each absent when empty —
  «Compra» (name, the quota in mono), «Smetti di comprare», «Vendi» (shares or «tutte le quote» · «{m}º mese» ·
  «circa {€}» · the tax or why it is not estimable) —, the taxes' total, «Da riguardare al {m}º mese», «Dove si
  discosta dal report», «Corretto dall'app»; the footnote says the exact instalments are the app's at creation. It
  draws ONLY from the stored object: no asset is read.
- **The row on «Applica»** (decision 85) while there is no plan: «Il piano operativo non c'è ancora.», «Scrivo il
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
  goals, allocationAdvice).
- **After «Applica», a plan of accumulation** (owner, 2026-11-12): with the targets written and no open plan the page
  offers «Crea un piano di accumulo verso questa allocazione», a link to Accumulo `?da=consulente` (`applyHandoffOf`,
  `CONSULENTE_HANDOFF_HREF`; nothing while the plans load, the link on a failed read); a draft gets a note
  (`HANDOFF_DRAFT_NOTE`), an active plan the line of before (`APPLY_ACTIVE_PLAN_NOTE`). A link, not an AI control (The
  AI-Accent Rule lists it). The Consulente's components import neither the hand-off nor the optimizer (a test reads
  their sources): the hand-off is Accumulo's, doc/guide/accumulo.md § Dal Consulente — until NOVE-25 it still seeds
  from the optimizer, not from the operating plan.
- **«Chiedi una modifica» = review + plan**: `runRevise` drops the old plan with the old report (`operatingPlan:
  null`), then `useConsulenteRevision` asks the plan; whatever the plan's outcome the revision ends and the page
  shows the new report (the row tells a failed plan).

## Per-page blind spots

- **A plan stage that fails leaves the report `ready`** (by design, P1): the document's status is the report's; the
  failure lives on `operatingPlan.status` and on «Applica»'s row only.
- **A plan started in another tab reads «Scrivo il piano operativo…» until the document is read again** (2026-11-19):
  no polling, declared; the stale window then offers the button.
- **A stored plan of another report is no plan**: after a revision the old `reportFinishedAt` no longer matches and
  the row comes back, even before `runRevise`'s `operatingPlan: null` is read.
- **A plan at 0 € a month is still `usable`**: whether there is money to invest is the click's check (NOVE-25).
- **The E2E never run the stage**: the fake route writes the plan on the emulator BEFORE it answers
  (`writeOperatingPlan`, a plan built by `reconcileOperatingPlan`), and a fake revise writes a new report instant and
  drops the plan (`writeRevisedReport`); the real stage is checked once, in production, by the owner.
- **The real stage runs on the emulator without spending** (2026-11-19): a throwaway script sets
  `ANTHROPIC_BASE_URL` to a local HTTP server that records the request and answers a Messages SSE stream (`message_start`,
  one text block, `message_delta` with `end_turn`, `message_stop`) carrying a hand-written plan; it imports
  `runAllocationAdviceStage` under `npx tsx --conditions=react-server` (`server-only`) with the `dev:emulator` env
  (the client config is pulled in), so facts, prompt, parse, reconcile and the three patches run as in production.
  The way to read the prompt of a user and to check `status`/`updatedAt` untouched (phase B/D/F of NOVE-24).
- **The block prints every name trimmed and never «€-0»** (2026-11-19, found on the mirror): a name stored with a
  leading space, a reserve of a float's −0 (`signDisplay: 'negative'`); held by `allocationAdvicePrompts.test.ts`.
